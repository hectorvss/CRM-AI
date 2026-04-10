/**
 * server/pipeline/reconciler.ts
 *
 * Reconciliation Engine — Phase 3.
 *
 * Handles RECONCILE_CASE jobs. For each case it loads all linked commerce
 * entities (orders, payments, returns) and their per-system states, then
 * runs a set of conflict-detection comparators to find discrepancies.
 *
 * When a conflict is detected:
 *  1. A reconciliation_issue row is written
 *  2. The entity's has_conflict flag is set
 *  3. The case's has_reconciliation_conflicts flag and conflict_severity are updated
 *  4. If severity is 'critical' or 'high' an alert log is emitted
 *  5. A RESOLUTION_PLAN job is enqueued so the resolution engine can act
 *
 * Domains checked:
 *  payment   — payment amounts, statuses and refunds across Stripe vs Shopify
 *  fulfillment — shipping/tracking state coherence across Shopify orders
 *  returns   — return approval status vs actual refund processing
 *  identity  — customer details consistency across systems
 *
 * Design notes:
 *  - All comparators are pure functions returning ConflictResult | null.
 *  - DB writes are batched inside a transaction to keep the state consistent.
 *  - Re-running RECONCILE_CASE on the same case is idempotent: existing open
 *    issues are matched by (case_id, entity_id, conflict_domain) and updated
 *    rather than duplicated.
 */

import { randomUUID }    from 'crypto';
import { getDb }         from '../db/client.js';
import { enqueue }       from '../queue/client.js';
import { triggerAgents } from '../agents/orchestrator.js';
import { JobType }       from '../queue/types.js';
import { registerHandler } from '../queue/handlers/index.js';
import { logger }        from '../utils/logger.js';
import type { ReconcileCasePayload, JobContext } from '../queue/types.js';

// ── Conflict result ────────────────────────────────────────────────────────────

interface ConflictResult {
  entityType:         string;
  entityId:           string;
  conflictDomain:     'payment' | 'fulfillment' | 'returns' | 'identity';
  severity:           'low' | 'medium' | 'high' | 'critical';
  conflictingSystems: string[];
  expectedState:      string;
  actualStates:       Record<string, unknown>;
  sourceOfTruth:      string;
  detectedBy:         string;
}

// ── Payment comparator ─────────────────────────────────────────────────────────

function comparePayment(order: any, payment: any): ConflictResult[] {
  const conflicts: ConflictResult[] = [];

  if (!order || !payment) return conflicts;

  const orderTotal   = parseFloat(order.total_amount ?? '0');
  const paymentAmount = parseFloat(payment.amount ?? '0');

  // Amount mismatch: order total vs payment captured
  // Tolerance: 0.01 for floating-point imprecision
  if (Math.abs(orderTotal - paymentAmount) > 0.01) {
    conflicts.push({
      entityType:         'payment',
      entityId:           payment.id,
      conflictDomain:     'payment',
      severity:           Math.abs(orderTotal - paymentAmount) > 10 ? 'high' : 'medium',
      conflictingSystems: ['shopify', 'stripe'],
      expectedState:      `Payment amount should equal order total: ${orderTotal} ${order.currency}`,
      actualStates: {
        shopify_order_total:   orderTotal,
        stripe_payment_amount: paymentAmount,
      },
      sourceOfTruth: 'shopify',
      detectedBy:    'payment_amount_comparator',
    });
  }

  // Status mismatch: derive expected payment status from order.status
  // (orders.status is our canonical field; system_states.shopify.financial_status is raw Shopify)
  const systemStates: Record<string, any> = JSON.parse(order.system_states || '{}');
  const orderFinancial = systemStates.shopify?.financial_status ?? order.status ?? '';
  const paymentStatus  = payment.status ?? '';

  const statusMap: Record<string, string[]> = {
    confirmed:           ['succeeded', 'captured'],
    fulfilled:           ['succeeded', 'captured'],
    refunded:            ['refunded'],
    partially_fulfilled: ['partially_refunded'],
    cancelled:           ['canceled', 'cancelled', 'voided'],
    // raw Shopify financial_status values (when available)
    paid:               ['succeeded', 'captured'],
    partially_refunded: ['partially_refunded'],
    voided:             ['canceled', 'cancelled', 'voided'],
  };

  const expectedPaymentStatuses = statusMap[orderFinancial] ?? [];
  if (expectedPaymentStatuses.length > 0 && !expectedPaymentStatuses.includes(paymentStatus)) {
    conflicts.push({
      entityType:         'payment',
      entityId:           payment.id,
      conflictDomain:     'payment',
      severity:           'medium',
      conflictingSystems: ['shopify', 'stripe'],
      expectedState:      `Payment status should be one of [${expectedPaymentStatuses.join(', ')}] for order status '${orderFinancial}'`,
      actualStates: {
        order_status:          orderFinancial,
        stripe_payment_status: paymentStatus,
      },
      sourceOfTruth: 'shopify',
      detectedBy:    'payment_status_comparator',
    });
  }

  // Dispute detected: Stripe has a dispute but order is not flagged
  if (payment.dispute_id && !order.has_conflict) {
    conflicts.push({
      entityType:         'payment',
      entityId:           payment.id,
      conflictDomain:     'payment',
      severity:           'critical',
      conflictingSystems: ['stripe'],
      expectedState:      'No active dispute on payment',
      actualStates: {
        stripe_dispute_id: payment.dispute_id,
        stripe_dispute_status: payment.dispute_status ?? 'unknown',
      },
      sourceOfTruth: 'stripe',
      detectedBy:    'dispute_detector',
    });
  }

  return conflicts;
}

// ── Fulfillment comparator ─────────────────────────────────────────────────────

function compareFulfillment(order: any): ConflictResult[] {
  const conflicts: ConflictResult[] = [];
  if (!order) return conflicts;

  const systemStates: Record<string, any> = JSON.parse(order.system_states || '{}');

  const shopifyStatus   = systemStates.shopify?.fulfillment_status ?? null;
  const internalStatus  = order.status ?? null;

  // Order marked as fulfilled in Shopify but not in local DB
  if (shopifyStatus === 'fulfilled' && internalStatus !== 'fulfilled') {
    conflicts.push({
      entityType:         'order',
      entityId:           order.id,
      conflictDomain:     'fulfillment',
      severity:           'medium',
      conflictingSystems: ['shopify', 'internal'],
      expectedState:      `Order status should be 'fulfilled' to match Shopify`,
      actualStates: {
        shopify_fulfillment_status: shopifyStatus,
        internal_status:            internalStatus,
      },
      sourceOfTruth: 'shopify',
      detectedBy:    'fulfillment_status_comparator',
    });
  }

  // Tracking number missing on fulfilled order
  // Check system_states for a tracking_number stored by the canonicalizer
  const trackingNumber = systemStates.shopify?.tracking_number ?? systemStates.canonical?.tracking_number ?? null;
  if (shopifyStatus === 'fulfilled' && !trackingNumber) {
    conflicts.push({
      entityType:         'order',
      entityId:           order.id,
      conflictDomain:     'fulfillment',
      severity:           'low',
      conflictingSystems: ['shopify'],
      expectedState:      'Fulfilled order should have a tracking number in system_states',
      actualStates: {
        tracking_number: null,
        shopify_status:  shopifyStatus,
      },
      sourceOfTruth: 'shopify',
      detectedBy:    'tracking_number_checker',
    });
  }

  return conflicts;
}

// ── Returns comparator ─────────────────────────────────────────────────────────

function compareReturn(ret: any, payment: any | null): ConflictResult[] {
  const conflicts: ConflictResult[] = [];
  if (!ret) return conflicts;

  const returnStatus  = ret.status ?? '';
  const refundAmount  = parseFloat(payment?.refund_amount ?? '0');
  const returnValue   = parseFloat(ret.return_value ?? '0');  // schema column is return_value

  // Return approved but no refund issued
  if (returnStatus === 'approved' && refundAmount < 0.01 && returnValue > 0) {
    conflicts.push({
      entityType:         'return',
      entityId:           ret.id,
      conflictDomain:     'returns',
      severity:           'high',
      conflictingSystems: ['shopify', 'stripe'],
      expectedState:      `A refund of ~${returnValue} ${ret.currency ?? 'USD'} should have been issued for approved return`,
      actualStates: {
        return_status:       returnStatus,
        stripe_refund_amount: refundAmount,
        return_value:        returnValue,
      },
      sourceOfTruth: 'shopify',
      detectedBy:    'return_refund_comparator',
    });
  }

  // Refund issued but return not marked as completed
  if (refundAmount > 0 && !['completed', 'closed', 'refunded'].includes(returnStatus)) {
    conflicts.push({
      entityType:         'return',
      entityId:           ret.id,
      conflictDomain:     'returns',
      severity:           'low',
      conflictingSystems: ['shopify', 'stripe'],
      expectedState:      `Return status should be 'completed' since a refund was issued`,
      actualStates: {
        return_status:        returnStatus,
        stripe_refund_amount: refundAmount,
      },
      sourceOfTruth: 'stripe',
      detectedBy:    'return_status_sync_checker',
    });
  }

  return conflicts;
}

// ── Identity comparator ────────────────────────────────────────────────────────

function compareIdentity(customer: any, linkedIds: any[]): ConflictResult[] {
  const conflicts: ConflictResult[] = [];
  if (!customer) return conflicts;

  // Customer has no linked identities — orphaned record
  if (!linkedIds || linkedIds.length === 0) {
    conflicts.push({
      entityType:         'customer',
      entityId:           customer.id,
      conflictDomain:     'identity',
      severity:           'low',
      conflictingSystems: ['internal'],
      expectedState:      'Customer should be linked to at least one external system',
      actualStates: {
        linked_systems: [],
      },
      sourceOfTruth: 'internal',
      detectedBy:    'identity_linker',
    });
  }

  // High-risk customer with no risk flag set on case
  if (customer.risk_level === 'high' || customer.risk_level === 'critical') {
    conflicts.push({
      entityType:         'customer',
      entityId:           customer.id,
      conflictDomain:     'identity',
      severity:           'high',
      conflictingSystems: ['internal'],
      expectedState:      'High-risk customer — case requires elevated review',
      actualStates: {
        customer_risk_level: customer.risk_level,
        lifetime_value:      customer.lifetime_value,
        total_orders:        customer.total_orders,
      },
      sourceOfTruth: 'internal',
      detectedBy:    'risk_flag_checker',
    });
  }

  return conflicts;
}

// ── Main handler ───────────────────────────────────────────────────────────────

async function handleReconcileCase(
  payload: ReconcileCasePayload,
  ctx: JobContext
): Promise<void> {
  const log = logger.child({
    jobId:   ctx.jobId,
    caseId:  payload.caseId,
    traceId: ctx.traceId,
  });

  const db       = getDb();
  const tenantId = ctx.tenantId ?? 'org_default';

  // ── 1. Load case ──────────────────────────────────────────────────────────
  const caseRow = db.prepare('SELECT * FROM cases WHERE id = ?').get(payload.caseId) as any;
  if (!caseRow) {
    log.warn('Case not found for reconciliation');
    return;
  }

  if (['resolved', 'closed', 'cancelled'].includes(caseRow.status)) {
    log.debug('Case is closed, skipping reconciliation');
    return;
  }

  log.info('Starting reconciliation', { caseType: caseRow.type, domains: payload.domains ?? 'all' });

  const domains = new Set(payload.domains ?? ['payment', 'fulfillment', 'returns', 'identity']);

  // ── 2. Load linked entities ───────────────────────────────────────────────
  const orderIds:   string[] = JSON.parse(caseRow.order_ids   || '[]');
  const paymentIds: string[] = JSON.parse(caseRow.payment_ids || '[]');
  const returnIds:  string[] = JSON.parse(caseRow.return_ids  || '[]');

  const allConflicts: ConflictResult[] = [];

  // ── 3. Payment domain ─────────────────────────────────────────────────────
  if (domains.has('payment')) {
    for (const orderId of orderIds) {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
      // Find associated payment via customer_id + order linkage
      const payment = db.prepare(
        'SELECT * FROM payments WHERE order_id = ? OR id IN (SELECT value FROM json_each(?)) LIMIT 1'
      ).get(orderId, caseRow.payment_ids) as any ?? (
        paymentIds.length > 0
          ? db.prepare('SELECT * FROM payments WHERE id = ? LIMIT 1').get(paymentIds[0]) as any
          : null
      );

      allConflicts.push(...comparePayment(order, payment));
    }

    // Payments without orders
    for (const paymentId of paymentIds) {
      if (orderIds.length === 0) {
        const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId) as any;
        allConflicts.push(...comparePayment(null, payment));
      }
    }
  }

  // ── 4. Fulfillment domain ─────────────────────────────────────────────────
  if (domains.has('fulfillment')) {
    for (const orderId of orderIds) {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
      allConflicts.push(...compareFulfillment(order));
    }
  }

  // ── 5. Returns domain ─────────────────────────────────────────────────────
  if (domains.has('returns')) {
    for (const returnId of returnIds) {
      const ret = db.prepare('SELECT * FROM returns WHERE id = ?').get(returnId) as any;
      const payment = paymentIds.length > 0
        ? db.prepare('SELECT * FROM payments WHERE id = ? LIMIT 1').get(paymentIds[0]) as any
        : null;
      allConflicts.push(...compareReturn(ret, payment));
    }
  }

  // ── 6. Identity domain ────────────────────────────────────────────────────
  if (domains.has('identity') && caseRow.customer_id) {
    const customer   = db.prepare('SELECT * FROM customers WHERE id = ?').get(caseRow.customer_id) as any;
    const linkedIds  = db.prepare('SELECT * FROM linked_identities WHERE customer_id = ?').all(caseRow.customer_id) as any[];
    allConflicts.push(...compareIdentity(customer, linkedIds));
  }

  // ── 7. Persist conflicts in a transaction ─────────────────────────────────
  const newIssueIds: string[] = [];

  const persist = db.transaction(() => {
    for (const conflict of allConflicts) {
      // Idempotency: match on (case_id, entity_id, conflict_domain, status=open)
      const existing = db.prepare(`
        SELECT id FROM reconciliation_issues
        WHERE case_id        = ?
          AND entity_id      = ?
          AND conflict_domain = ?
          AND status          = 'open'
        LIMIT 1
      `).get(payload.caseId, conflict.entityId, conflict.conflictDomain) as any;

      if (existing) {
        // Update the existing issue with fresh state data
        db.prepare(`
          UPDATE reconciliation_issues SET
            severity           = ?,
            actual_states      = ?,
            detected_at        = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          conflict.severity,
          JSON.stringify(conflict.actualStates),
          existing.id,
        );
        newIssueIds.push(existing.id);
        log.debug('Updated existing reconciliation issue', { issueId: existing.id, domain: conflict.conflictDomain });
      } else {
        const issueId = randomUUID();
        db.prepare(`
          INSERT INTO reconciliation_issues (
            id, case_id, tenant_id,
            entity_type, entity_id, conflict_domain,
            severity, status,
            conflicting_systems, expected_state, actual_states,
            source_of_truth_system, detected_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)
        `).run(
          issueId,
          payload.caseId,
          tenantId,
          conflict.entityType,
          conflict.entityId,
          conflict.conflictDomain,
          conflict.severity,
          JSON.stringify(conflict.conflictingSystems),
          conflict.expectedState,
          JSON.stringify(conflict.actualStates),
          conflict.sourceOfTruth,
          conflict.detectedBy,
        );

        newIssueIds.push(issueId);

        // Flag the entity itself
        flagEntity(db, conflict.entityType, conflict.entityId, conflict.conflictDomain);

        log.info('New reconciliation issue created', {
          issueId,
          domain:   conflict.conflictDomain,
          severity: conflict.severity,
          entity:   `${conflict.entityType}:${conflict.entityId}`,
        });
      }
    }

    // ── 8. Update case conflict summary ──────────────────────────────────
    const openIssues = db.prepare(`
      SELECT severity FROM reconciliation_issues
      WHERE case_id = ? AND status = 'open'
    `).all(payload.caseId) as any[];

    const hasConflicts = openIssues.length > 0;
    const topSeverity  = worstSeverity(openIssues.map(i => i.severity));

    db.prepare(`
      UPDATE cases SET
        has_reconciliation_conflicts = ?,
        conflict_severity            = ?,
        updated_at                   = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(hasConflicts ? 1 : 0, topSeverity ?? null, payload.caseId);
  });

  persist();

  log.info('Reconciliation complete', {
    conflicts:  allConflicts.length,
    newIssues:  newIssueIds.length,
  });

  // Alert on critical/high conflicts
  const criticalConflicts = allConflicts.filter(c => c.severity === 'critical' || c.severity === 'high');
  if (criticalConflicts.length > 0) {
    log.warn('High-severity conflicts detected', {
      count:   criticalConflicts.length,
      domains: [...new Set(criticalConflicts.map(c => c.conflictDomain))],
    });
  }

  // ── 9. Enqueue resolution planning if there are open issues ─────────────
  if (newIssueIds.length > 0) {
    enqueue(
      JobType.RESOLUTION_PLAN,
      { caseId: payload.caseId, reconciliationIssueIds: newIssueIds },
      { tenantId, workspaceId: ctx.workspaceId ?? 'ws_default', traceId: ctx.traceId, priority: 6 },
    );
    log.debug('Enqueued RESOLUTION_PLAN', { issueCount: newIssueIds.length });

    // Fire agent chain for conflict analysis
    triggerAgents('conflicts_detected', payload.caseId, {
      tenantId,
      workspaceId: ctx.workspaceId ?? 'ws_default',
      traceId: ctx.traceId,
      priority: 7,
      context: { issueIds: newIssueIds },
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function flagEntity(db: any, entityType: string, entityId: string, domain: string): void {
  const conflictText = `Conflict in ${domain} domain`;
  if (entityType === 'order') {
    db.prepare(`
      UPDATE orders SET has_conflict = 1, conflict_detected = ? WHERE id = ?
    `).run(conflictText, entityId);
  } else if (entityType === 'payment') {
    db.prepare(`
      UPDATE payments SET has_conflict = 1, conflict_detected = ? WHERE id = ?
    `).run(conflictText, entityId);
  } else if (entityType === 'return') {
    db.prepare(`
      UPDATE returns SET has_conflict = 1, conflict_detected = ? WHERE id = ?
    `).run(conflictText, entityId);
  }
}

const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function worstSeverity(severities: string[]): string | null {
  if (severities.length === 0) return null;
  return severities.reduce((worst, s) =>
    (SEVERITY_RANK[s] ?? 0) > (SEVERITY_RANK[worst] ?? 0) ? s : worst
  );
}

// ── Register ──────────────────────────────────────────────────────────────────

registerHandler(JobType.RECONCILE_CASE, handleReconcileCase);

export { handleReconcileCase };
