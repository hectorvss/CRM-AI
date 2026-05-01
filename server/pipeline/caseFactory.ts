/**
 * server/pipeline/caseFactory.ts
 *
 * Responsible for creating and finding cases.
 *
 * Refactored to use repository pattern (provider-agnostic).
 */

import { randomUUID } from 'crypto';
import { createCaseRepository, createCanonicalRepository } from '../data/index.js';
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

const caseRepo = createCaseRepository();
const canonicalRepo = createCanonicalRepository();

// ── Find open duplicate ─────────────────────────────────────────────────────

async function findOpenCase(
  tenantId: string,
  workspaceId: string,
  customerId: string | null,
  type: string
): Promise<string | null> {
  if (!customerId || ALWAYS_NEW_TYPES.has(type)) return null;
  return caseRepo.findOpenCase({ tenantId, workspaceId }, customerId, type, DEDUP_WINDOW_HOURS);
}

// ── Create case ─────────────────────────────────────────────────────────────

export async function getOrCreateCase(input: CreateCaseInput): Promise<CaseRecord> {
  const scope = { tenantId: input.tenantId, workspaceId: input.workspaceId };

  // Deduplicate
  const existingId = await findOpenCase(input.tenantId, input.workspaceId, input.customerId, input.type);
  if (existingId) {
    // Update last_activity_at to signal new activity on existing case
    await caseRepo.update(scope, existingId, { last_activity_at: new Date().toISOString() });

    // Link canonical event if provided
    if (input.canonicalEventId) {
      await canonicalRepo.updateEventStatus(scope, input.canonicalEventId, { case_id: existingId, status: 'case_created' });
    }

    logger.debug('Reusing existing open case', {
      caseId:     existingId,
      type:       input.type,
      customerId: input.customerId,
    });

    const bundle = await caseRepo.getBundle(scope, existingId);
    return { id: existingId, caseNumber: bundle.case.case_number, isNew: false };
  }

  // Create new
  const id         = randomUUID();
  const caseNumber = await caseRepo.getNextCaseNumber(scope);
  const now        = new Date().toISOString();

  // SLA deadlines: first response 4h, resolution 24h (defaults, overridden by policy later)
  const slaFirstResponse = new Date(Date.now() + 4  * 3_600_000).toISOString();
  const slaResolution    = new Date(Date.now() + 24 * 3_600_000).toISOString();

  const data = {
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

  await caseRepo.createCase(scope, data);

  // Status history entry
  await caseRepo.addStatusHistory(scope, {
    caseId: id,
    fromStatus: 'NULL',
    toStatus: 'new',
    changedBy: 'system',
    reason: 'Case created by pipeline'
  });

  // Link canonical event
  if (input.canonicalEventId) {
    await canonicalRepo.updateEventStatus(scope, input.canonicalEventId, { case_id: id, status: 'case_created' });
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
  entityType: 'order' | 'payment' | 'return',
  entityId: string,
  tenantId: string,
  workspaceId: string
): Promise<void> {
  const scope = { tenantId, workspaceId };
  const bundle = await caseRepo.getBundle(scope, caseId);
  if (!bundle) return;

  const col = `${entityType}_ids`;
  const existing: string[] = bundle.case[col] || [];
  if (existing.includes(entityId)) return;

  existing.push(entityId);
  await caseRepo.update(scope, caseId, { [col]: existing });
}
