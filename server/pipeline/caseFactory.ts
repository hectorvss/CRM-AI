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
import { createCaseRepository } from '../data/cases.js';
import { createCanonicalRepository } from '../data/canonical.js';
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

async function findOpenCase(
  tenantId: string,
  customerId: string | null,
  type: string
): Promise<string | null> {
  if (!customerId || ALWAYS_NEW_TYPES.has(type)) return null;

  const caseRepo = createCaseRepository();
  const scope = { tenantId, workspaceId: '' }; // WorkspaceId not strictly needed for dedup if we check tenant-wide

  return caseRepo.findOpenCase(scope, customerId, type, DEDUP_WINDOW_HOURS);
}

// ── Create case ─────────────────────────────────────────────────────────────

export async function getOrCreateCase(input: CreateCaseInput): Promise<CaseRecord> {
  const caseRepo = createCaseRepository();
  const canonicalRepo = createCanonicalRepository();
  const scope = { tenantId: input.tenantId, workspaceId: input.workspaceId };

  // Deduplicate
  const existingId = await findOpenCase(input.tenantId, input.customerId, input.type);
  if (existingId) {
    // Update last_activity_at to signal new activity on existing case
    await caseRepo.update(scope, existingId, { last_activity_at: new Date().toISOString() });

    // Link canonical event if provided
    if (input.canonicalEventId) {
      await canonicalRepo.updateEvent(scope, input.canonicalEventId, { case_id: existingId });
    }

    logger.debug('Reusing existing open case', {
      caseId:     existingId,
      type:       input.type,
      customerId: input.customerId,
    });

    const row = await caseRepo.get(scope, existingId);
    return { id: existingId, caseNumber: row.case_number, isNew: false };
  }

  // Create new
  const id         = randomUUID();
  const caseNumber = await caseRepo.getNextCaseNumber(scope);
  const now        = new Date().toISOString();

  // SLA deadlines: first response 4h, resolution 24h (defaults, overridden by policy later)
  const slaFirstResponse = new Date(Date.now() + 4  * 3_600_000).toISOString();
  const slaResolution    = new Date(Date.now() + 24 * 3_600_000).toISOString();

  const caseData = {
    id, case_number: caseNumber, tenant_id: input.tenantId, workspace_id: input.workspaceId,
    source_system: input.sourceSystem ?? 'webhook', source_channel: input.channel ?? 'unknown', source_entity_id: input.sourceEntityId ?? null,
    type: input.type, sub_type: input.subType ?? null, intent: input.intent ?? null, intent_confidence: input.intentConfidence ?? null,
    status: 'new', priority: input.priority ?? 'normal', severity: 'S3', risk_level: input.riskLevel ?? 'low', risk_score: 0,
    customer_id: input.customerId, conversation_id: input.conversationId ?? null,
    order_ids: input.orderIds   ?? [],
    payment_ids: input.paymentIds ?? [],
    return_ids: input.returnIds  ?? [],
    tags: input.tags       ?? [],
    sla_first_response_deadline: slaFirstResponse, sla_resolution_deadline: slaResolution, sla_status: 'on_track',
    approval_state: 'not_required', execution_state: 'idle', resolution_state: 'unresolved',
    has_reconciliation_conflicts: 0,
    created_at: now, updated_at: now, last_activity_at: now
  };

  await caseRepo.createCase(scope, caseData);

  // Status history entry
  await caseRepo.addStatusHistory(scope, {
    caseId: id,
    fromStatus: null,
    toStatus: 'new',
    changedBy: 'system',
    reason: 'Case created by pipeline'
  });

  // Link canonical event
  if (input.canonicalEventId) {
    await canonicalRepo.updateEvent(scope, input.canonicalEventId, { case_id: id, status: 'case_created' });
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
export async function linkEntityToCase(
  caseId: string,
  tenantId: string,
  workspaceId: string,
  entityType: 'order' | 'payment' | 'return',
  entityId: string
): Promise<void> {
  const caseRepo = createCaseRepository();
  const scope = { tenantId, workspaceId };
  
  const caseRow = await caseRepo.get(scope, caseId);
  if (!caseRow) return;

  const col = `${entityType}_ids`;
  const existing: string[] = Array.isArray(caseRow[col]) ? caseRow[col] : JSON.parse(caseRow[col] || '[]');
  if (existing.includes(entityId)) return;

  existing.push(entityId);
  await caseRepo.update(scope, caseId, { [col]: existing });
}
