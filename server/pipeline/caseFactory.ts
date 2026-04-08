/**
 * server/pipeline/caseFactory.ts
 *
 * Responsible for creating and finding cases.
 *
 * Rules:
 *  - One open case per customer per case type within a deduplication window
 *    (default 72 h). If a matching open case exists, return it instead of
 *    creating a duplicate.
 *  - Case numbers are sequential per tenant: CS-0001, CS-0002, …
 *  - On creation the case is linked to the canonical_event that triggered it.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../db/client.js';
import { logger } from '../utils/logger.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CreateCaseInput {
  tenantId:    string;
  workspaceId: string;
  customerId:  string | null;
  type:        string;
  subType?:    string;
  intent?:     string;
  intentConfidence?: number;
  priority?:   'normal' | 'high' | 'urgent';
  riskLevel?:  'low' | 'medium' | 'high';
  channel?:    string;
  sourceSystem?: string;
  sourceEntityId?: string;
  orderIds?:   string[];
  paymentIds?: string[];
  returnIds?:  string[];
  tags?:       string[];
  /** If provided, the canonical event will be linked to this case */
  canonicalEventId?: string;
  /** If a conversation already exists, link it */
  conversationId?: string;
}

export interface CaseRecord {
  id:          string;
  caseNumber:  string;
  isNew:       boolean;
}

// ── Deduplication window ────────────────────────────────────────────────────

const DEDUP_WINDOW_HOURS = 72;

// Case types that should ALWAYS create a new case (not deduplicated)
const ALWAYS_NEW_TYPES = new Set(['fraud_alert', 'chargeback']);

// ── Case number generator ───────────────────────────────────────────────────

function nextCaseNumber(tenantId: string): string {
  const db = getDb();
  const row = db.prepare(`
    SELECT case_number FROM cases
    WHERE tenant_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(tenantId) as any;

  if (!row) return 'CS-0001';

  const match = row.case_number.match(/^CS-(\d+)$/);
  if (!match) return 'CS-0001';

  const next = parseInt(match[1], 10) + 1;
  return `CS-${String(next).padStart(4, '0')}`;
}

// ── Find open duplicate ─────────────────────────────────────────────────────

function findOpenCase(
  tenantId: string,
  customerId: string | null,
  type: string
): string | null {
  if (!customerId || ALWAYS_NEW_TYPES.has(type)) return null;

  const db       = getDb();
  const since    = new Date(Date.now() - DEDUP_WINDOW_HOURS * 3_600_000).toISOString();

  const row = db.prepare(`
    SELECT id FROM cases
    WHERE tenant_id  = ?
      AND customer_id = ?
      AND type        = ?
      AND status NOT IN ('resolved', 'closed', 'cancelled')
      AND created_at >= ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(tenantId, customerId, type, since) as any;

  return row?.id ?? null;
}

// ── Create case ─────────────────────────────────────────────────────────────

export function getOrCreateCase(input: CreateCaseInput): CaseRecord {
  const db = getDb();

  // Deduplicate
  const existingId = findOpenCase(input.tenantId, input.customerId, input.type);
  if (existingId) {
    // Update last_activity_at to signal new activity on existing case
    db.prepare(`
      UPDATE cases SET last_activity_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(existingId);

    // Link canonical event if provided
    if (input.canonicalEventId) {
      db.prepare(`
        UPDATE canonical_events SET case_id = ? WHERE id = ?
      `).run(existingId, input.canonicalEventId);
    }

    logger.debug('Reusing existing open case', {
      caseId:     existingId,
      type:       input.type,
      customerId: input.customerId,
    });

    const row = db.prepare('SELECT case_number FROM cases WHERE id = ?').get(existingId) as any;
    return { id: existingId, caseNumber: row.case_number, isNew: false };
  }

  // Create new
  const id         = randomUUID();
  const caseNumber = nextCaseNumber(input.tenantId);
  const now        = new Date().toISOString();

  // SLA deadlines: first response 4h, resolution 24h (defaults, overridden by policy later)
  const slaFirstResponse = new Date(Date.now() + 4  * 3_600_000).toISOString();
  const slaResolution    = new Date(Date.now() + 24 * 3_600_000).toISOString();

  db.prepare(`
    INSERT INTO cases (
      id, case_number, tenant_id, workspace_id,
      source_system, source_channel, source_entity_id,
      type, sub_type, intent, intent_confidence,
      status, priority, severity, risk_level, risk_score,
      customer_id, conversation_id,
      order_ids, payment_ids, return_ids, tags,
      sla_first_response_deadline, sla_resolution_deadline, sla_status,
      approval_state, execution_state, resolution_state,
      has_reconciliation_conflicts,
      created_at, updated_at, last_activity_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      'new', ?, 'S3', ?, 0,
      ?, ?,
      ?, ?, ?, ?,
      ?, ?, 'on_track',
      'not_required', 'idle', 'unresolved',
      0,
      ?, ?, ?
    )
  `).run(
    id, caseNumber, input.tenantId, input.workspaceId,
    input.sourceSystem ?? 'webhook', input.channel ?? 'unknown', input.sourceEntityId ?? null,
    input.type, input.subType ?? null, input.intent ?? null, input.intentConfidence ?? null,
    input.priority ?? 'normal', input.riskLevel ?? 'low',
    input.customerId, input.conversationId ?? null,
    JSON.stringify(input.orderIds   ?? []),
    JSON.stringify(input.paymentIds ?? []),
    JSON.stringify(input.returnIds  ?? []),
    JSON.stringify(input.tags       ?? []),
    slaFirstResponse, slaResolution,
    now, now, now,
  );

  // Status history entry
  db.prepare(`
    INSERT INTO case_status_history
      (id, case_id, from_status, to_status, changed_by, changed_by_type, reason, tenant_id)
    VALUES (?, ?, NULL, 'new', 'system', 'system', 'Case created by pipeline', ?)
  `).run(randomUUID(), id, input.tenantId);

  // Link canonical event
  if (input.canonicalEventId) {
    db.prepare(`
      UPDATE canonical_events SET case_id = ?, status = 'case_created' WHERE id = ?
    `).run(id, input.canonicalEventId);
  }

  logger.info('Case created', {
    caseId:     id,
    caseNumber,
    type:       input.type,
    customerId: input.customerId,
    tenantId:   input.tenantId,
  });

  return { id, caseNumber, isNew: true };
}

/**
 * Attach an order/payment/return ID to an existing case (idempotent).
 */
export function linkEntityToCase(
  caseId: string,
  entityType: 'order' | 'payment' | 'return',
  entityId: string
): void {
  const db  = getDb();
  const col = `${entityType}_ids`;
  const row = db.prepare(`SELECT ${col} FROM cases WHERE id = ?`).get(caseId) as any;
  if (!row) return;

  const existing: string[] = JSON.parse(row[col] || '[]');
  if (existing.includes(entityId)) return;

  existing.push(entityId);
  db.prepare(`UPDATE cases SET ${col} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(JSON.stringify(existing), caseId);
}
