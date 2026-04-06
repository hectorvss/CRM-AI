import { Router, Response } from 'express';
import { getDb } from '../db/client.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { parseRow, logAudit } from '../db/utils.js';
import { sendError } from '../http/errors.js';
import { buildDedupeKey } from '../contracts/canonicalEvents.js';

const router = Router();
const DEFAULT_SOURCE_OF_TRUTH: Record<string, string> = {
  order: 'shopify',
  payment: 'stripe',
  refund: 'stripe',
  return: 'shopify',
};

function normalizeEventType(raw?: string): string {
  if (!raw) return 'event.received';
  const value = raw.trim().toLowerCase();
  const shopifyMap: Record<string, string> = {
    'orders/create': 'order.created',
    'orders/updated': 'order.updated',
    'orders/cancelled': 'order.cancelled',
    'refunds/create': 'refund.created',
    'refunds/update': 'refund.completed',
    'returns/create': 'return.requested',
    'returns/approve': 'return.received_at_warehouse',
    'checkouts/create': 'order.created',
  };
  if (shopifyMap[value]) return shopifyMap[value];
  return value.replace(/\//g, '.');
}

function eventCategoryFromType(eventType: string): string {
  if (eventType.startsWith('order.')) return 'commerce';
  if (eventType.startsWith('payment.') || eventType.startsWith('refund.')) return 'payment';
  if (eventType.startsWith('return.') || eventType.startsWith('shipment.')) return 'logistics';
  if (eventType.startsWith('message.') || eventType.startsWith('ticket.')) return 'support';
  return 'commerce';
}

function inferSourceEntityType(payload: any): string {
  if (!payload || typeof payload !== 'object') return 'unknown';
  if (payload.payment_id || payload.charge_id || payload.transaction_id) return 'payment';
  if (payload.refund_id) return 'refund';
  if (payload.return_id || payload.rma_id) return 'return';
  if (payload.order_id || payload.order || payload.order_number) return 'order';
  if (payload.customer_id || payload.email) return 'customer';
  if (payload.ticket_id || payload.thread_id || payload.conversation_id) return 'conversation';
  return 'unknown';
}

function inferSourceEntityId(payload: any): string {
  if (!payload || typeof payload !== 'object') return 'unknown';
  return (
    payload.payment_id ||
    payload.charge_id ||
    payload.refund_id ||
    payload.return_id ||
    payload.order_id ||
    payload.order?.id ||
    payload.customer_id ||
    payload.ticket_id ||
    payload.thread_id ||
    payload.conversation_id ||
    payload.id ||
    'unknown'
  ).toString();
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email && email.includes('@') ? email : null;
}

function inferCustomerExternalId(payload: any): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const id =
    payload.customer_id ||
    payload.customer?.id ||
    payload.customer_external_id ||
    payload.user_id ||
    null;
  return id ? String(id) : null;
}

function inferCustomerEmail(payload: any): string | null {
  if (!payload || typeof payload !== 'object') return null;
  return normalizeEmail(payload.customer_email || payload.email || payload.customer?.email || null);
}

function inferCustomerName(payload: any): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const name = payload.customer_name || payload.name || payload.customer?.name || null;
  if (!name || typeof name !== 'string') return null;
  const value = name.trim();
  return value.length > 0 ? value : null;
}

function generateCaseNumber(db: any): string {
  const row = db
    .prepare("SELECT COUNT(*) as total FROM cases WHERE strftime('%Y', created_at) = strftime('%Y', 'now')")
    .get() as { total?: number };
  const year = new Date().getFullYear();
  const sequence = String((row?.total || 0) + 1).padStart(5, '0');
  return `CASE-${year}-${sequence}`;
}

function caseTypeFromEntity(sourceEntityType: string): string {
  if (sourceEntityType === 'payment' || sourceEntityType === 'refund') return 'payment_dispute';
  if (sourceEntityType === 'return') return 'return';
  if (sourceEntityType === 'order') return 'order_issue';
  return 'general_support';
}

function getSourceOfTruthSystem(db: any, tenantId: string, workspaceId: string, entityType: string): string {
  try {
    const row = db
      .prepare(`
        SELECT preferred_system
        FROM source_of_truth_rules
        WHERE tenant_id = ? AND workspace_id = ? AND entity_type = ? AND is_active = 1
        ORDER BY updated_at DESC
        LIMIT 1
      `)
      .get(tenantId, workspaceId, entityType) as { preferred_system?: string } | undefined;
    if (row?.preferred_system) return row.preferred_system;
  } catch {
    // Backward compatibility where source_of_truth_rules does not exist yet.
  }
  return DEFAULT_SOURCE_OF_TRUTH[entityType] || 'canonical';
}

function shouldApplyIncomingStatus(
  sourceSystem: string,
  preferredSystem: string,
  previousStatus: string | undefined,
  nextStatus: string,
): boolean {
  if (!previousStatus) return true;
  if (sourceSystem === preferredSystem) return true;
  if (previousStatus === nextStatus) return true;
  return previousStatus === 'pending' || previousStatus === 'pending_review' || previousStatus === 'new';
}

function ensureSourceOfTruthRulesTable(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_of_truth_rules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      preferred_system TEXT NOT NULL,
      fallback_system TEXT,
      confidence_threshold REAL DEFAULT 0.8,
      rule_priority INTEGER DEFAULT 100,
      is_active INTEGER DEFAULT 1,
      updated_by TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_source_of_truth_rules_scope_entity
      ON source_of_truth_rules(tenant_id, workspace_id, entity_type);
  `);
}

function resolveOrCreateCustomer(
  db: any,
  tenantId: string,
  workspaceId: string,
  sourceSystem: string,
  payload: any,
): string | null {
  const externalCustomerId = inferCustomerExternalId(payload);
  const customerEmail = inferCustomerEmail(payload);
  const customerName = inferCustomerName(payload);

  if (externalCustomerId) {
    const linked = db
      .prepare(`
        SELECT li.customer_id
        FROM linked_identities li
        JOIN customers c ON c.id = li.customer_id
        WHERE li.system = ? AND li.external_id = ?
          AND c.tenant_id = ? AND c.workspace_id = ?
        LIMIT 1
      `)
      .get(sourceSystem, externalCustomerId, tenantId, workspaceId) as { customer_id?: string } | undefined;
    if (linked?.customer_id) return linked.customer_id;
  }

  if (customerEmail) {
    const byEmail = db
      .prepare('SELECT id FROM customers WHERE tenant_id = ? AND workspace_id = ? AND canonical_email = ? LIMIT 1')
      .get(tenantId, workspaceId, customerEmail) as { id?: string } | undefined;
    if (byEmail?.id) {
      if (!externalCustomerId) {
        try {
          const existingReview = db.prepare(`
            SELECT id FROM identity_resolution_queue
            WHERE tenant_id = ? AND workspace_id = ? AND source_system = ? AND normalized_email = ?
              AND status = 'pending'
            LIMIT 1
          `).get(tenantId, workspaceId, sourceSystem, customerEmail) as { id?: string } | undefined;

          if (!existingReview?.id) {
            db.prepare(`
              INSERT INTO identity_resolution_queue (
                id, tenant_id, workspace_id, source_system, external_id, normalized_email,
                suggested_customer_id, confidence, reason, payload, status
              ) VALUES (?, ?, ?, ?, NULL, ?, ?, 0.70, 'email_only_match', ?, 'pending')
            `).run(
              crypto.randomUUID(),
              tenantId,
              workspaceId,
              sourceSystem,
              customerEmail,
              byEmail.id,
              JSON.stringify(payload || {}),
            );
          }
        } catch {
          // Backward compatibility where identity_resolution_queue does not exist yet.
        }
      }

      if (externalCustomerId) {
        db.prepare(`
          INSERT OR IGNORE INTO linked_identities (id, customer_id, system, external_id, confidence, verified, created_at)
          VALUES (?, ?, ?, ?, 1.0, 1, CURRENT_TIMESTAMP)
        `).run(crypto.randomUUID(), byEmail.id, sourceSystem, externalCustomerId);
      }
      return byEmail.id;
    }
  }

  if (!externalCustomerId && !customerEmail) return null;

  const customerId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO customers (
      id, tenant_id, workspace_id, canonical_email, canonical_name, segment, risk_level,
      currency, dispute_rate, refund_rate, total_orders, total_spent
    ) VALUES (?, ?, ?, ?, ?, 'regular', 'low', 'USD', 0, 0, 0, 0)
  `).run(customerId, tenantId, workspaceId, customerEmail, customerName || 'Customer');

  if (externalCustomerId) {
    db.prepare(`
      INSERT OR IGNORE INTO linked_identities (id, customer_id, system, external_id, confidence, verified, created_at)
      VALUES (?, ?, ?, ?, 1.0, 1, CURRENT_TIMESTAMP)
    `).run(crypto.randomUUID(), customerId, sourceSystem, externalCustomerId);
  }

  return customerId;
}

function findCaseLink(db: any, tenantId: string, workspaceId: string, sourceEntityType: string, sourceEntityId: string): {
  canonicalEntityType: string | null;
  canonicalEntityId: string | null;
  caseId: string | null;
} {
  if (sourceEntityType === 'order') {
    const order = db
      .prepare('SELECT id FROM orders WHERE tenant_id = ? AND (id = ? OR external_order_id = ?) LIMIT 1')
      .get(tenantId, sourceEntityId, sourceEntityId) as { id?: string } | undefined;
    if (order?.id) {
      const linkedCase = db
        .prepare(`
          SELECT id
          FROM cases
          WHERE tenant_id = ? AND workspace_id = ?
            AND (order_ids LIKE ? OR order_ids LIKE ?)
          ORDER BY last_activity_at DESC
          LIMIT 1
        `)
        .get(tenantId, workspaceId, `%"${order.id}"%`, `%"${sourceEntityId}"%`) as { id?: string } | undefined;
      return { canonicalEntityType: 'order', canonicalEntityId: order.id, caseId: linkedCase?.id || null };
    }
  }

  if (sourceEntityType === 'payment' || sourceEntityType === 'refund') {
    const payment = db
      .prepare('SELECT id FROM payments WHERE tenant_id = ? AND (id = ? OR external_payment_id = ?) LIMIT 1')
      .get(tenantId, sourceEntityId, sourceEntityId) as { id?: string } | undefined;
    if (payment?.id) {
      const linkedCase = db
        .prepare(`
          SELECT id
          FROM cases
          WHERE tenant_id = ? AND workspace_id = ?
            AND (payment_ids LIKE ? OR payment_ids LIKE ?)
          ORDER BY last_activity_at DESC
          LIMIT 1
        `)
        .get(tenantId, workspaceId, `%"${payment.id}"%`, `%"${sourceEntityId}"%`) as { id?: string } | undefined;
      return { canonicalEntityType: 'payment', canonicalEntityId: payment.id, caseId: linkedCase?.id || null };
    }
  }

  if (sourceEntityType === 'return') {
    const ret = db
      .prepare('SELECT id FROM returns WHERE tenant_id = ? AND (id = ? OR external_return_id = ?) LIMIT 1')
      .get(tenantId, sourceEntityId, sourceEntityId) as { id?: string } | undefined;
    if (ret?.id) {
      const linkedCase = db
        .prepare(`
          SELECT id
          FROM cases
          WHERE tenant_id = ? AND workspace_id = ?
            AND (return_ids LIKE ? OR return_ids LIKE ?)
          ORDER BY last_activity_at DESC
          LIMIT 1
        `)
        .get(tenantId, workspaceId, `%"${ret.id}"%`, `%"${sourceEntityId}"%`) as { id?: string } | undefined;
      return { canonicalEntityType: 'return', canonicalEntityId: ret.id, caseId: linkedCase?.id || null };
    }
  }

  return { canonicalEntityType: null, canonicalEntityId: null, caseId: null };
}

function findRecentOpenCaseByCustomer(db: any, tenantId: string, workspaceId: string, customerId: string): string | null {
  const row = db
    .prepare(`
      SELECT id
      FROM cases
      WHERE tenant_id = ? AND workspace_id = ? AND customer_id = ?
        AND status NOT IN ('resolved', 'closed')
      ORDER BY last_activity_at DESC
      LIMIT 1
    `)
    .get(tenantId, workspaceId, customerId) as { id?: string } | undefined;
  return row?.id || null;
}

function normalizeEntityStatus(eventType: string, payloadStatus: unknown, fallback: string): string {
  if (typeof payloadStatus === 'string' && payloadStatus.trim()) return payloadStatus.trim().toLowerCase();
  const map: Record<string, string> = {
    'order.created': 'pending',
    'order.updated': 'processing',
    'order.cancelled': 'cancelled',
    'payment.captured': 'captured',
    'payment.refunded': 'refunded',
    'payment.disputed': 'disputed',
    'refund.created': 'pending',
    'refund.completed': 'refunded',
    'return.requested': 'pending_review',
    'return.received_at_warehouse': 'received',
  };
  return map[eventType] || fallback;
}

function parseAmount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function parseJsonSafe(value: unknown, fallback: any): any {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function upsertSystemState(
  db: any,
  tenantId: string,
  entityType: string,
  entityId: string,
  system: string,
  stateValue: string,
) {
  db.prepare(`
    INSERT INTO system_states (id, entity_type, entity_id, system, state_key, state_value, tenant_id)
    VALUES (?, ?, ?, ?, 'status', ?, ?)
  `).run(crypto.randomUUID(), entityType, entityId, system, stateValue, tenantId);
}

function resolveOrderId(db: any, tenantId: string, value: unknown): string | null {
  if (!value) return null;
  const ref = String(value);
  const row = db
    .prepare('SELECT id FROM orders WHERE tenant_id = ? AND (id = ? OR external_order_id = ?) LIMIT 1')
    .get(tenantId, ref, ref) as { id?: string } | undefined;
  return row?.id || null;
}

function flagReconciliationIssue(
  db: any,
  tenantId: string,
  caseId: string | null,
  entityType: string,
  entityId: string,
  previousStatus: string,
  nextStatus: string,
  sourceOfTruthSystem: string,
) {
  const existing = db
    .prepare(`
      SELECT id
      FROM reconciliation_issues
      WHERE tenant_id = ? AND entity_type = ? AND entity_id = ?
        AND status IN ('open', 'in_progress')
      LIMIT 1
    `)
    .get(tenantId, entityType, entityId) as { id?: string } | undefined;

  if (existing?.id) return;

  const issueId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO reconciliation_issues (
      id, case_id, tenant_id, entity_type, entity_id, conflict_domain, severity, status,
      conflicting_systems, expected_state, actual_states, source_of_truth_system, resolution_plan, detected_by
    ) VALUES (?, ?, ?, ?, ?, ?, 'medium', 'open', ?, ?, ?, ?, ?, 'canonical_event_ingest')
  `).run(
    issueId,
    caseId,
    tenantId,
    entityType,
    entityId,
    `${entityType}_status_mismatch`,
    JSON.stringify([]),
    previousStatus,
    JSON.stringify({ previous: previousStatus, incoming: nextStatus }),
    sourceOfTruthSystem,
    `Review source-of-truth (${sourceOfTruthSystem}) and reconcile status across systems`,
  );
}

function enrichCommerceEntityFromEvent(params: {
  db: any;
  tenantId: string;
  workspaceId: string;
  sourceSystem: string;
  sourceEntityType: string;
  sourceEntityId: string;
  eventType: string;
  payload: any;
  customerId: string | null;
  caseId: string | null;
}): { canonicalEntityType: string | null; canonicalEntityId: string | null } {
  const {
    db,
    tenantId,
    workspaceId,
    sourceSystem,
    sourceEntityType,
    sourceEntityId,
    eventType,
    payload,
    customerId,
    caseId,
  } = params;

  if (sourceEntityType === 'order') {
    const existing = db
      .prepare('SELECT id, status, system_states FROM orders WHERE tenant_id = ? AND (id = ? OR external_order_id = ?) LIMIT 1')
      .get(tenantId, sourceEntityId, sourceEntityId) as { id: string; status: string; system_states?: string } | undefined;

    const nextStatus = normalizeEntityStatus(eventType, payload.status, existing?.status || 'pending');
    const preferredSystem = getSourceOfTruthSystem(db, tenantId, workspaceId, 'order');
    const canApplyIncoming = shouldApplyIncomingStatus(sourceSystem, preferredSystem, existing?.status, nextStatus);
    const appliedStatus = canApplyIncoming ? nextStatus : existing?.status || nextStatus;
    const amount = parseAmount(payload.amount ?? payload.total_amount ?? payload.order_total);
    const currency = typeof payload.currency === 'string' ? payload.currency : 'USD';
    const states = existing ? parseJsonSafe(existing.system_states, {}) : {};
    states[sourceSystem] = nextStatus;
    states.canonical = appliedStatus;

    let orderId = existing?.id || null;
    if (!orderId) {
      orderId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO orders (
          id, external_order_id, customer_id, tenant_id, workspace_id,
          status, system_states, total_amount, currency, summary, last_sync_at, last_update
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        orderId,
        sourceEntityId,
        customerId,
        tenantId,
        workspaceId,
        appliedStatus,
        JSON.stringify(states),
        amount,
        currency,
        `Auto-upserted from ${sourceSystem} webhook (${eventType})`,
      );
    } else {
      db.prepare(`
        UPDATE orders
        SET status = ?, system_states = ?, customer_id = COALESCE(customer_id, ?),
            total_amount = CASE WHEN ? > 0 THEN ? ELSE total_amount END,
            currency = COALESCE(?, currency),
            updated_at = CURRENT_TIMESTAMP, last_sync_at = CURRENT_TIMESTAMP, last_update = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ?
      `).run(appliedStatus, JSON.stringify(states), customerId, amount, amount, currency, orderId, tenantId);
    }

    db.prepare(`
      INSERT INTO order_events (id, order_id, type, content, system, time, tenant_id)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    `).run(
      crypto.randomUUID(),
      orderId,
      eventType,
      `Canonical ingest received ${nextStatus} from ${sourceSystem} and applied ${appliedStatus}`,
      sourceSystem,
      tenantId,
    );

    upsertSystemState(db, tenantId, 'order', orderId, sourceSystem, nextStatus);

    if (existing?.status && existing.status !== nextStatus && !canApplyIncoming) {
      flagReconciliationIssue(db, tenantId, caseId, 'order', orderId, existing.status, nextStatus, preferredSystem);
      db.prepare(`
        UPDATE orders
        SET has_conflict = 1, conflict_domain = 'status', conflict_detected = ?, recommended_action = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ?
      `).run(
        `Status mismatch detected: ${existing.status} (canonical) vs ${nextStatus} from ${sourceSystem}`,
        `Review source-of-truth (${preferredSystem}) and reconcile order status`,
        orderId,
        tenantId,
      );
    }

    return { canonicalEntityType: 'order', canonicalEntityId: orderId };
  }

  if (sourceEntityType === 'payment' || sourceEntityType === 'refund') {
    const existing = db
      .prepare('SELECT id, status, system_states, order_id FROM payments WHERE tenant_id = ? AND (id = ? OR external_payment_id = ?) LIMIT 1')
      .get(tenantId, sourceEntityId, sourceEntityId) as
      | { id: string; status: string; system_states?: string; order_id?: string | null }
      | undefined;

    const nextStatus = normalizeEntityStatus(eventType, payload.status, existing?.status || 'pending');
    const ruleEntityType = sourceEntityType === 'refund' ? 'refund' : 'payment';
    const preferredSystem = getSourceOfTruthSystem(db, tenantId, workspaceId, ruleEntityType);
    const canApplyIncoming = shouldApplyIncomingStatus(sourceSystem, preferredSystem, existing?.status, nextStatus);
    const appliedStatus = canApplyIncoming ? nextStatus : existing?.status || nextStatus;
    const amount = parseAmount(payload.amount ?? payload.payment_amount ?? payload.total);
    const currency = typeof payload.currency === 'string' ? payload.currency : 'USD';
    const orderIdFromPayload = resolveOrderId(db, tenantId, payload.order_id || payload.order?.id || existing?.order_id || null);

    const states = existing ? parseJsonSafe(existing.system_states, {}) : {};
    states[sourceSystem] = nextStatus;
    states.canonical = appliedStatus;

    let paymentId = existing?.id || null;
    if (!paymentId) {
      paymentId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO payments (
          id, external_payment_id, order_id, customer_id, tenant_id,
          amount, currency, psp, status, system_states, summary, last_update
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        paymentId,
        sourceEntityId,
        orderIdFromPayload,
        customerId,
        tenantId,
        amount,
        currency,
        sourceSystem,
        appliedStatus,
        JSON.stringify(states),
        `Auto-upserted from ${sourceSystem} webhook (${eventType})`,
      );
    } else {
      db.prepare(`
        UPDATE payments
        SET status = ?, system_states = ?, customer_id = COALESCE(customer_id, ?),
            order_id = COALESCE(order_id, ?),
            amount = CASE WHEN ? > 0 THEN ? ELSE amount END,
            currency = COALESCE(?, currency),
            updated_at = CURRENT_TIMESTAMP, last_update = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ?
      `).run(appliedStatus, JSON.stringify(states), customerId, orderIdFromPayload, amount, amount, currency, paymentId, tenantId);
    }

    upsertSystemState(db, tenantId, 'payment', paymentId, sourceSystem, nextStatus);

    if (existing?.status && existing.status !== nextStatus && !canApplyIncoming) {
      flagReconciliationIssue(db, tenantId, caseId, 'payment', paymentId, existing.status, nextStatus, preferredSystem);
      db.prepare(`
        UPDATE payments
        SET conflict_detected = ?, recommended_action = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ?
      `).run(
        `Status mismatch detected: ${existing.status} (canonical) vs ${nextStatus} from ${sourceSystem}`,
        `Review source-of-truth (${preferredSystem}) and reconcile payment state`,
        paymentId,
        tenantId,
      );
    }

    return { canonicalEntityType: 'payment', canonicalEntityId: paymentId };
  }

  if (sourceEntityType === 'return') {
    const existing = db
      .prepare('SELECT id, status, system_states, order_id FROM returns WHERE tenant_id = ? AND (id = ? OR external_return_id = ?) LIMIT 1')
      .get(tenantId, sourceEntityId, sourceEntityId) as
      | { id: string; status: string; system_states?: string; order_id?: string | null }
      | undefined;

    const nextStatus = normalizeEntityStatus(eventType, payload.status, existing?.status || 'pending_review');
    const preferredSystem = getSourceOfTruthSystem(db, tenantId, workspaceId, 'return');
    const canApplyIncoming = shouldApplyIncomingStatus(sourceSystem, preferredSystem, existing?.status, nextStatus);
    const appliedStatus = canApplyIncoming ? nextStatus : existing?.status || nextStatus;
    const value = parseAmount(payload.amount ?? payload.return_value ?? payload.total);
    const orderIdFromPayload = resolveOrderId(db, tenantId, payload.order_id || payload.order?.id || existing?.order_id || null);
    const currency = typeof payload.currency === 'string' ? payload.currency : 'USD';

    const states = existing ? parseJsonSafe(existing.system_states, {}) : {};
    states[sourceSystem] = nextStatus;
    states.canonical = appliedStatus;

    let returnId = existing?.id || null;
    if (!returnId) {
      returnId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO returns (
          id, external_return_id, order_id, customer_id, tenant_id, workspace_id,
          type, return_value, currency, status, system_states, summary, last_update
        ) VALUES (?, ?, ?, ?, ?, ?, 'return', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        returnId,
        sourceEntityId,
        orderIdFromPayload,
        customerId,
        tenantId,
        workspaceId,
        value,
        currency,
        appliedStatus,
        JSON.stringify(states),
        `Auto-upserted from ${sourceSystem} webhook (${eventType})`,
      );
    } else {
      db.prepare(`
        UPDATE returns
        SET status = ?, system_states = ?, customer_id = COALESCE(customer_id, ?),
            order_id = COALESCE(order_id, ?),
            return_value = CASE WHEN ? > 0 THEN ? ELSE return_value END,
            currency = COALESCE(?, currency),
            updated_at = CURRENT_TIMESTAMP, last_update = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ? AND workspace_id = ?
      `).run(appliedStatus, JSON.stringify(states), customerId, orderIdFromPayload, value, value, currency, returnId, tenantId, workspaceId);
    }

    db.prepare(`
      INSERT INTO return_events (id, return_id, type, content, system, time, tenant_id)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    `).run(
      crypto.randomUUID(),
      returnId,
      eventType,
      `Canonical ingest received ${nextStatus} from ${sourceSystem} and applied ${appliedStatus}`,
      sourceSystem,
      tenantId,
    );

    upsertSystemState(db, tenantId, 'return', returnId, sourceSystem, nextStatus);

    if (existing?.status && existing.status !== nextStatus && !canApplyIncoming) {
      flagReconciliationIssue(db, tenantId, caseId, 'return', returnId, existing.status, nextStatus, preferredSystem);
      db.prepare(`
        UPDATE returns
        SET conflict_detected = ?, recommended_action = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ? AND workspace_id = ?
      `).run(
        `Status mismatch detected: ${existing.status} (canonical) vs ${nextStatus} from ${sourceSystem}`,
        `Review source-of-truth (${preferredSystem}) and reconcile return state`,
        returnId,
        tenantId,
        workspaceId,
      );
    }

    return { canonicalEntityType: 'return', canonicalEntityId: returnId };
  }

  return { canonicalEntityType: null, canonicalEntityId: null };
}

// Apply multi-tenant middleware
router.use(extractMultiTenant);
router.use(requirePermission('cases.read'));

// GET /api/agents
router.get('/', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const agents = db
      .prepare(`
      SELECT a.*, av.version_number, av.status as version_status, av.rollout_percentage,
             av.permission_profile, av.reasoning_profile, av.safety_profile
      FROM agents a
      LEFT JOIN agent_versions av ON a.current_version_id = av.id
      WHERE a.tenant_id = ?
      ORDER BY a.category, a.name
    `)
      .all(req.tenantId);

    const result = agents.map((a: any) => {
      const runs = db
        .prepare(`
        SELECT COUNT(*) as total, AVG(confidence) as avg_confidence,
               SUM(tokens_used) as total_tokens, SUM(cost_credits) as total_credits
        FROM agent_runs WHERE agent_id = ? AND tenant_id = ?
      `)
        .get(a.id, req.tenantId) as any;

      const parsed = parseRow(a);
      return { ...parsed, metrics: runs };
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching agents:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// GET /api/agents/:id
router.get('/:id', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
    if (!agent) return sendError(res, 404, 'AGENT_NOT_FOUND', 'Agent not found');

    const versions = db.prepare('SELECT * FROM agent_versions WHERE agent_id = ? ORDER BY version_number DESC').all(req.params.id);
    const recentRuns = db
      .prepare(`
      SELECT ar.*, c.case_number
      FROM agent_runs ar LEFT JOIN cases c ON ar.case_id = c.id
      WHERE ar.agent_id = ? AND ar.tenant_id = ?
      ORDER BY ar.started_at DESC LIMIT 20
    `)
      .all(req.params.id, req.tenantId);

    res.json({ ...(agent as any), versions, recent_runs: recentRuns.map(parseRow) });
  } catch (error) {
    console.error('Error fetching agent detail:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Connectors Router
export const connectorsRouter = Router();
connectorsRouter.use(extractMultiTenant);
connectorsRouter.use(requirePermission('cases.read'));

// GET /api/connectors
connectorsRouter.get('/', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const connectors = db.prepare('SELECT * FROM connectors WHERE tenant_id = ? ORDER BY system').all(req.tenantId);
    res.json(
      connectors.map((c: any) => {
        const caps = db.prepare('SELECT * FROM connector_capabilities WHERE connector_id = ?').all(c.id);
        return { ...c, connector_capabilities: caps };
      }),
    );
  } catch (error) {
    console.error('Error fetching connectors:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// GET /api/connectors/events
connectorsRouter.get('/events', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const { status, source_system, case_id } = req.query;
    let query = `
      SELECT *
      FROM canonical_events
      WHERE tenant_id = ? AND workspace_id = ?
    `;
    const params: any[] = [req.tenantId, req.workspaceId];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (source_system) {
      query += ' AND source_system = ?';
      params.push(source_system);
    }
    if (case_id) {
      query += ' AND case_id = ?';
      params.push(case_id);
    }

    query += ' ORDER BY occurred_at DESC LIMIT 200';

    const events = db.prepare(query).all(...params);
    res.json(events.map(parseRow));
  } catch (error) {
    console.error('Error fetching canonical events:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// GET /api/connectors/events/:id
connectorsRouter.get('/events/:id', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const event = db
      .prepare('SELECT * FROM canonical_events WHERE id = ? AND tenant_id = ? AND workspace_id = ?')
      .get(req.params.id, req.tenantId, req.workspaceId);
    if (!event) return sendError(res, 404, 'CANONICAL_EVENT_NOT_FOUND', 'Canonical event not found');
    res.json(parseRow(event));
  } catch (error) {
    console.error('Error fetching canonical event detail:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// GET /api/connectors/identity-reviews
connectorsRouter.get('/identity-reviews', requirePermission('members.read'), (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const { status } = req.query;
    let query = `
      SELECT q.*, c.canonical_name as suggested_customer_name
      FROM identity_resolution_queue q
      LEFT JOIN customers c ON c.id = q.suggested_customer_id
      WHERE q.tenant_id = ? AND q.workspace_id = ?
    `;
    const params: any[] = [req.tenantId, req.workspaceId];
    if (status) {
      query += ' AND q.status = ?';
      params.push(status);
    }
    query += ' ORDER BY q.created_at DESC LIMIT 200';
    const rows = db.prepare(query).all(...params);
    res.json(rows.map(parseRow));
  } catch (error) {
    console.error('Error listing identity reviews:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list identity reviews');
  }
});

// PATCH /api/connectors/identity-reviews/:id
connectorsRouter.patch('/identity-reviews/:id', requirePermission('members.invite'), (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const decision = String(req.body?.status || '').trim().toLowerCase();
    const resolvedCustomerId = (req.body?.resolved_customer_id || null) as string | null;
    if (!['approved', 'rejected'].includes(decision)) {
      return sendError(res, 400, 'INVALID_IDENTITY_REVIEW_STATUS', 'status must be approved or rejected');
    }

    const review = db.prepare(`
      SELECT *
      FROM identity_resolution_queue
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
      LIMIT 1
    `).get(req.params.id, req.tenantId, req.workspaceId) as any;
    if (!review) return sendError(res, 404, 'IDENTITY_REVIEW_NOT_FOUND', 'Identity review not found');

    if (review.status !== 'pending') {
      return sendError(res, 400, 'IDENTITY_REVIEW_ALREADY_RESOLVED', 'Identity review is already resolved');
    }

    const finalCustomerId = resolvedCustomerId || review.suggested_customer_id || null;
    db.prepare(`
      UPDATE identity_resolution_queue
      SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, resolved_customer_id = ?
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).run(decision, req.userId || null, finalCustomerId, req.params.id, req.tenantId, req.workspaceId);

    if (decision === 'approved' && finalCustomerId && review.external_id) {
      db.prepare(`
        INSERT OR IGNORE INTO linked_identities (id, customer_id, system, external_id, confidence, verified, created_at)
        VALUES (?, ?, ?, ?, 1.0, 1, CURRENT_TIMESTAMP)
      `).run(crypto.randomUUID(), finalCustomerId, review.source_system, review.external_id);
    }

    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId!,
      action: 'IDENTITY_REVIEW_DECIDED',
      entityType: 'identity_resolution_queue',
      entityId: req.params.id,
      metadata: {
        decision,
        resolved_customer_id: finalCustomerId,
      },
    });

    const updated = db.prepare(`
      SELECT *
      FROM identity_resolution_queue
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
      LIMIT 1
    `).get(req.params.id, req.tenantId, req.workspaceId);

    res.json(parseRow(updated));
  } catch (error) {
    console.error('Error deciding identity review:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to decide identity review');
  }
});

// GET /api/connectors/source-of-truth/rules
connectorsRouter.get('/source-of-truth/rules', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    ensureSourceOfTruthRulesTable(db);

    const rows = db
      .prepare(`
        SELECT entity_type, preferred_system, fallback_system, confidence_threshold, rule_priority, is_active, updated_by, updated_at
        FROM source_of_truth_rules
        WHERE tenant_id = ? AND workspace_id = ?
        ORDER BY entity_type
      `)
      .all(req.tenantId, req.workspaceId) as any[];

    const byEntity = new Map(rows.map((row) => [row.entity_type, parseRow(row)]));
    const entities = ['order', 'payment', 'refund', 'return'];
    const response = entities.map((entityType) => {
      const saved = byEntity.get(entityType);
      if (saved) return saved;
      return {
        entity_type: entityType,
        preferred_system: DEFAULT_SOURCE_OF_TRUTH[entityType] || 'canonical',
        fallback_system: null,
        confidence_threshold: 0.8,
        rule_priority: 100,
        is_active: true,
        updated_by: null,
        updated_at: null,
      };
    });

    res.json(response);
  } catch (error) {
    console.error('Error fetching source-of-truth rules:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch source-of-truth rules');
  }
});

// PUT /api/connectors/source-of-truth/rules/:entityType
connectorsRouter.put(
  '/source-of-truth/rules/:entityType',
  requirePermission('settings.write'),
  (req: MultiTenantRequest, res: Response) => {
    try {
      const db = getDb();
      ensureSourceOfTruthRulesTable(db);

      const entityType = (req.params.entityType || '').toLowerCase();
      if (!['order', 'payment', 'refund', 'return'].includes(entityType)) {
        return sendError(res, 400, 'INVALID_ENTITY_TYPE', 'Entity type must be order, payment, refund or return');
      }

      const preferredSystem = String(req.body?.preferred_system || '').trim().toLowerCase();
      if (!preferredSystem) {
        return sendError(res, 400, 'INVALID_PREFERRED_SYSTEM', 'preferred_system is required');
      }

      const fallbackSystemRaw = req.body?.fallback_system;
      const fallbackSystem =
        typeof fallbackSystemRaw === 'string' && fallbackSystemRaw.trim().length > 0
          ? fallbackSystemRaw.trim().toLowerCase()
          : null;
      const confidenceThresholdRaw = req.body?.confidence_threshold;
      const confidenceThreshold =
        typeof confidenceThresholdRaw === 'number' && Number.isFinite(confidenceThresholdRaw)
          ? Math.max(0, Math.min(1, confidenceThresholdRaw))
          : 0.8;
      const rulePriorityRaw = req.body?.rule_priority;
      const rulePriority =
        typeof rulePriorityRaw === 'number' && Number.isFinite(rulePriorityRaw)
          ? Math.trunc(rulePriorityRaw)
          : 100;
      const isActive = req.body?.is_active === false ? 0 : 1;

      db.prepare(`
        INSERT INTO source_of_truth_rules (
          id, tenant_id, workspace_id, entity_type, preferred_system, fallback_system,
          confidence_threshold, rule_priority, is_active, updated_by, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(tenant_id, workspace_id, entity_type)
        DO UPDATE SET
          preferred_system = excluded.preferred_system,
          fallback_system = excluded.fallback_system,
          confidence_threshold = excluded.confidence_threshold,
          rule_priority = excluded.rule_priority,
          is_active = excluded.is_active,
          updated_by = excluded.updated_by,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        crypto.randomUUID(),
        req.tenantId,
        req.workspaceId,
        entityType,
        preferredSystem,
        fallbackSystem,
        confidenceThreshold,
        rulePriority,
        isActive,
        req.userId || null,
      );

      const updated = db
        .prepare(`
          SELECT entity_type, preferred_system, fallback_system, confidence_threshold, rule_priority, is_active, updated_by, updated_at
          FROM source_of_truth_rules
          WHERE tenant_id = ? AND workspace_id = ? AND entity_type = ?
          LIMIT 1
        `)
        .get(req.tenantId, req.workspaceId, entityType);

      logAudit(db, {
        tenantId: req.tenantId!,
        workspaceId: req.workspaceId!,
        actorId: req.userId!,
        action: 'SOURCE_OF_TRUTH_RULE_UPDATED',
        entityType: 'source_of_truth_rule',
        entityId: entityType,
        metadata: {
          preferred_system: preferredSystem,
          fallback_system: fallbackSystem,
          confidence_threshold: confidenceThreshold,
          rule_priority: rulePriority,
          is_active: isActive,
        },
      });

      res.json(parseRow(updated));
    } catch (error) {
      console.error('Error updating source-of-truth rule:', error);
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update source-of-truth rule');
    }
  },
);

// POST /api/connectors/webhooks/:system
connectorsRouter.post('/webhooks/:system', requirePermission('cases.write'), (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const sourceSystem = req.params.system;
    const payload = req.body || {};
    const nowIso = new Date().toISOString();

    const rawEventType =
      payload.event_type ||
      payload.type ||
      payload.topic ||
      (typeof req.headers['x-event-type'] === 'string' ? req.headers['x-event-type'] : undefined);
    const eventType = normalizeEventType(rawEventType);

    const sourceEntityType = inferSourceEntityType(payload);
    const sourceEntityId = inferSourceEntityId(payload);
    const occurredAt = payload.occurred_at || payload.created_at || payload.timestamp || nowIso;
    const dedupeKey =
      payload.dedupe_key ||
      buildDedupeKey({
        sourceSystem,
        sourceEntityType,
        sourceEntityId,
        eventType,
        occurredAt,
      });

    const connector = db
      .prepare('SELECT id FROM connectors WHERE tenant_id = ? AND system = ? LIMIT 1')
      .get(req.tenantId, sourceSystem) as { id?: string } | undefined;
    const connectorId = connector?.id || null;

    const existing = db.prepare('SELECT id FROM webhook_events WHERE dedupe_key = ?').get(dedupeKey) as { id?: string } | undefined;
    if (existing?.id) {
      return res.status(200).json({ accepted: true, duplicate: true, webhook_event_id: existing.id, dedupe_key: dedupeKey });
    }

    const webhookEventId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO webhook_events (
        id, connector_id, tenant_id, source_system, event_type, raw_payload, status, dedupe_key
      ) VALUES (?, ?, ?, ?, ?, ?, 'received', ?)
    `).run(webhookEventId, connectorId, req.tenantId, sourceSystem, eventType, JSON.stringify(payload), dedupeKey);

    const customerId = resolveOrCreateCustomer(db, req.tenantId!, req.workspaceId!, sourceSystem, payload);
    const enriched = enrichCommerceEntityFromEvent({
      db,
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      sourceSystem,
      sourceEntityType,
      sourceEntityId,
      eventType,
      payload,
      customerId,
      caseId: null,
    });
    const link = findCaseLink(db, req.tenantId!, req.workspaceId!, sourceEntityType, sourceEntityId);
    if (!link.canonicalEntityType && enriched.canonicalEntityType) link.canonicalEntityType = enriched.canonicalEntityType;
    if (!link.canonicalEntityId && enriched.canonicalEntityId) link.canonicalEntityId = enriched.canonicalEntityId;

    if (!link.caseId && customerId) {
      const customerCase = findRecentOpenCaseByCustomer(db, req.tenantId!, req.workspaceId!, customerId);
      if (customerCase) {
        link.caseId = customerCase;
      }
    }

    let autoCreatedCaseId: string | null = null;
    if (!link.caseId) {
      autoCreatedCaseId = crypto.randomUUID();
      const caseNumber = generateCaseNumber(db);
      const derivedType = caseTypeFromEntity(sourceEntityType);
      const orderIds = link.canonicalEntityType === 'order' && link.canonicalEntityId ? [link.canonicalEntityId] : [];
      const paymentIds =
        (link.canonicalEntityType === 'payment' || sourceEntityType === 'refund') && link.canonicalEntityId
          ? [link.canonicalEntityId]
          : [];
      const returnIds = link.canonicalEntityType === 'return' && link.canonicalEntityId ? [link.canonicalEntityId] : [];

      db.prepare(`
        INSERT INTO cases (
          id, case_number, tenant_id, workspace_id,
          source_system, source_channel, source_entity_id,
          type, intent, intent_confidence,
          status, priority, severity, risk_level,
          customer_id, order_ids, payment_ids, return_ids,
          approval_state, execution_state, resolution_state,
          tags, created_by_user_id, sla_status
        ) VALUES (?, ?, ?, ?, ?, 'api', ?, ?, ?, ?, 'new', 'normal', 'S3', 'low', ?, ?, ?, ?, 'not_required', 'idle', 'unresolved', ?, ?, 'on_track')
      `).run(
        autoCreatedCaseId,
        caseNumber,
        req.tenantId,
        req.workspaceId,
        sourceSystem,
        sourceEntityId,
        derivedType,
        eventType,
        0.6,
        customerId,
        JSON.stringify(orderIds),
        JSON.stringify(paymentIds),
        JSON.stringify(returnIds),
        JSON.stringify(['auto_created', 'webhook_ingest']),
        req.userId || null,
      );

      db.prepare(`
        INSERT INTO case_status_history (id, case_id, from_status, to_status, changed_by, changed_by_type, reason, tenant_id)
        VALUES (?, ?, NULL, 'new', ?, 'system', 'Auto-created from webhook event ingest', ?)
      `).run(crypto.randomUUID(), autoCreatedCaseId, req.userId || 'system', req.tenantId);

      logAudit(db, {
        tenantId: req.tenantId!,
        workspaceId: req.workspaceId!,
        actorId: req.userId!,
        action: 'CASE_AUTO_CREATED_FROM_EVENT',
        entityType: 'case',
        entityId: autoCreatedCaseId,
        metadata: {
          source_system: sourceSystem,
          source_entity_type: sourceEntityType,
          source_entity_id: sourceEntityId,
          event_type: eventType,
        },
      });

      link.caseId = autoCreatedCaseId;
    }

    const canonicalEventId = crypto.randomUUID();
    const canonicalStatus = autoCreatedCaseId ? 'case_created' : link.caseId ? 'linked' : 'canonicalized';
    const correlationId = (payload.correlation_id || payload.request_id || payload.trace_id || null) as string | null;

    db.prepare(`
      INSERT INTO canonical_events (
        id, dedupe_key, tenant_id, workspace_id, source_system, source_entity_type, source_entity_id,
        event_type, event_category, occurred_at, canonical_entity_type, canonical_entity_id, correlation_id,
        case_id, normalized_payload, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      canonicalEventId,
      dedupeKey,
      req.tenantId,
      req.workspaceId,
      sourceSystem,
      sourceEntityType,
      sourceEntityId,
      eventType,
      eventCategoryFromType(eventType),
      occurredAt,
      link.canonicalEntityType,
      link.canonicalEntityId,
      correlationId,
      link.caseId,
      JSON.stringify(payload),
      canonicalStatus,
    );

    db.prepare(`
      UPDATE webhook_events
      SET processed_at = CURRENT_TIMESTAMP, status = 'processed', canonical_event_id = ?
      WHERE id = ?
    `).run(canonicalEventId, webhookEventId);

    if (link.caseId) {
      db.prepare(`
        UPDATE cases
        SET last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND tenant_id = ? AND workspace_id = ?
      `).run(link.caseId, req.tenantId, req.workspaceId);
    }

    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId!,
      action: 'CANONICAL_EVENT_INGESTED',
      entityType: 'canonical_event',
      entityId: canonicalEventId,
      metadata: {
        webhook_event_id: webhookEventId,
        source_system: sourceSystem,
        event_type: eventType,
        case_id: link.caseId,
        customer_id: customerId,
        auto_created_case_id: autoCreatedCaseId,
        dedupe_key: dedupeKey,
      },
    });

    res.status(201).json({
      accepted: true,
      duplicate: false,
      webhook_event_id: webhookEventId,
      canonical_event_id: canonicalEventId,
      linked_case_id: link.caseId,
      customer_id: customerId,
      auto_created_case_id: autoCreatedCaseId,
      status: canonicalStatus,
      dedupe_key: dedupeKey,
    });
  } catch (error) {
    console.error('Error ingesting connector webhook:', error);
    sendError(res, 500, 'WEBHOOK_INGEST_ERROR', 'Failed to ingest webhook');
  }
});

// GET /api/connectors/:id
connectorsRouter.get('/:id', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const conn = db.prepare('SELECT * FROM connectors WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId) as any;
    if (!conn) return sendError(res, 404, 'CONNECTOR_NOT_FOUND', 'Connector not found');
    const caps = db.prepare('SELECT * FROM connector_capabilities WHERE connector_id = ?').all(req.params.id);
    const webhooks = db
      .prepare('SELECT * FROM webhook_events WHERE connector_id = ? ORDER BY received_at DESC LIMIT 50')
      .all(req.params.id);
    res.json({ ...conn, capabilities: caps, recent_webhooks: webhooks });
  } catch (error) {
    console.error('Error fetching connector detail:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;
