/**
 * server/pipeline/intentRouter.ts
 *
 * Intent Router agent — Phase 2 pipeline step 3.
 *
 * Responsibilities:
 *  1. Load the canonical_event and all linked entity data
 *  2. Call Gemini to classify the customer intent
 *  3. Determine the correct case type, priority and risk level
 *  4. Create or find an existing case via caseFactory
 *  5. Link the case back to all relevant entities (orders, payments, returns)
 *  6. Update canonical_event status to 'linked'
 *  7. Enqueue RECONCILE_CASE to start conflict detection
 *     AND DRAFT_REPLY so the copilot has a suggestion ready immediately
 *
 * Intent classification is done with a structured JSON prompt so the output
 * is machine-readable and deterministic — no free-form text parsing.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { withGeminiRetry } from '../ai/geminiRetry.js';
import { getDb } from '../db/client.js';
import { config } from '../config.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import { registerHandler } from '../queue/handlers/index.js';
import { logger } from '../utils/logger.js';
import { getOrCreateCase, linkEntityToCase } from './caseFactory.js';
import { triggerAgents } from '../agents/orchestrator.js';
import type { IntentRoutePayload, JobContext } from '../queue/types.js';

// ── Intent taxonomy ────────────────────────────────────────────────────────────

const INTENT_TO_CASE_TYPE: Record<string, string> = {
  refund_status:       'refund_inquiry',
  refund_request:      'refund_request',
  order_status:        'order_inquiry',
  order_missing:       'order_issue',
  delivery_issue:      'delivery_issue',
  return_request:      'return_request',
  return_status:       'return_inquiry',
  payment_issue:       'payment_issue',
  subscription_issue:  'subscription_issue',
  product_question:    'general_support',
  complaint:           'complaint',
  billing_question:    'billing_inquiry',
  account_issue:       'account_issue',
  fraud_concern:       'fraud_alert',
  general_inquiry:     'general_support',
};

const HIGH_PRIORITY_INTENTS = new Set([
  'fraud_concern', 'complaint', 'payment_issue', 'order_missing',
]);

const HIGH_RISK_INTENTS = new Set([
  'fraud_concern', 'payment_issue',
]);

// ── Gemini intent classification ──────────────────────────────────────────────

interface IntentResult {
  intent:      string;
  confidence:  number;   // 0–1
  subType?:    string;
  reasoning:   string;
  suggestedReply?: string;
}

async function classifyIntent(
  messageContent: string,
  entityContext: string
): Promise<IntentResult> {
  const ai    = new GoogleGenerativeAI(config.ai.geminiApiKey);
  const model = ai.getGenerativeModel({ model: config.ai.geminiModel });

  const prompt = `
You are an intent classifier for a customer support CRM.
Classify the customer message and return ONLY valid JSON matching the schema below.

CUSTOMER MESSAGE:
"${messageContent}"

ENTITY CONTEXT (what we know about this customer's data):
${entityContext}

VALID INTENTS (pick exactly one):
refund_status, refund_request, order_status, order_missing, delivery_issue,
return_request, return_status, payment_issue, subscription_issue,
product_question, complaint, billing_question, account_issue,
fraud_concern, general_inquiry

RESPONSE SCHEMA (return only this JSON, no markdown):
{
  "intent": "<one of the valid intents above>",
  "confidence": <0.0 to 1.0>,
  "subType": "<optional: more specific sub-classification>",
  "reasoning": "<one sentence explaining why>",
  "suggestedReply": "<a short, professional reply draft in the same language as the message>"
}
`.trim();

  try {
    const result = await withGeminiRetry(
      () => model.generateContent(prompt),
      { label: 'intent.route' },
    );
    const text   = result.response.text().trim();

    // Strip markdown code fences if present
    const json = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(json) as IntentResult;

    // Validate intent is known
    if (!INTENT_TO_CASE_TYPE[parsed.intent]) {
      parsed.intent = 'general_inquiry';
    }
    parsed.confidence = Math.min(1, Math.max(0, parsed.confidence ?? 0.5));
    return parsed;

  } catch (err) {
    logger.warn('Intent classification failed, using fallback', {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      intent:     'general_inquiry',
      confidence: 0.4,
      reasoning:  'Classification failed — using fallback',
    };
  }
}

// ── Entity context builder ────────────────────────────────────────────────────

function buildEntityContext(
  canonicalEntityType: string,
  canonicalEntityId: string
): { context: string; localEntityId: string | null } {
  const db = getDb();
  const lines: string[] = [];
  let localEntityId: string | null = null;

  if (canonicalEntityType === 'order') {
    const order = db.prepare(
      'SELECT * FROM orders WHERE external_order_id = ? OR id = ? LIMIT 1'
    ).get(canonicalEntityId, canonicalEntityId) as any;

    if (order) {
      localEntityId = order.id;
      const states = JSON.parse(order.system_states || '{}');
      lines.push(`ORDER ${order.external_order_id}: status=${order.status}, amount=${order.total_amount} ${order.currency}`);
      lines.push(`System states: ${JSON.stringify(states)}`);
      if (order.has_conflict) lines.push(`CONFLICT DETECTED: ${order.conflict_detected}`);
    }

  } else if (canonicalEntityType === 'payment' || canonicalEntityType === 'refund') {
    const payment = db.prepare(
      'SELECT * FROM payments WHERE external_payment_id = ? OR id = ? LIMIT 1'
    ).get(canonicalEntityId, canonicalEntityId) as any;

    if (payment) {
      localEntityId = payment.id;
      lines.push(`PAYMENT ${payment.external_payment_id}: status=${payment.status}, amount=${payment.amount} ${payment.currency}`);
      if (payment.dispute_id) lines.push(`DISPUTE: ${payment.dispute_id}`);
      if (payment.refund_amount) lines.push(`Refunded: ${payment.refund_amount}`);
    }

  } else if (canonicalEntityType === 'customer') {
    const customer = db.prepare(
      `SELECT c.*, li.external_id as ext_id, li.system
       FROM customers c
       JOIN linked_identities li ON li.customer_id = c.id
       WHERE li.external_id = ? OR c.id = ?
       LIMIT 1`
    ).get(canonicalEntityId, canonicalEntityId) as any;

    if (customer) {
      localEntityId = customer.id;
      lines.push(`CUSTOMER: ${customer.canonical_name}, segment=${customer.segment}, risk=${customer.risk_level}`);
      lines.push(`LTV: ${customer.lifetime_value}, orders: ${customer.total_orders}`);
    }
  }

  return {
    context:       lines.join('\n') || 'No entity data available yet.',
    localEntityId,
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────

async function handleIntentRoute(
  payload: IntentRoutePayload,
  ctx: JobContext
): Promise<void> {
  const log = logger.child({
    jobId:           ctx.jobId,
    canonicalEventId: payload.canonicalEventId,
    traceId:         ctx.traceId,
  });

  const db          = getDb();
  const tenantId    = ctx.tenantId    ?? 'org_default';
  const workspaceId = ctx.workspaceId ?? 'ws_default';

  // ── 1. Load canonical event ──────────────────────────────────────────────
  const event = db.prepare(
    'SELECT * FROM canonical_events WHERE id = ?'
  ).get(payload.canonicalEventId) as any;

  if (!event) {
    log.warn('Canonical event not found');
    return;
  }

  if (event.status === 'linked' || event.status === 'case_created') {
    // Already routed — check if we need to update an existing case
    if (event.case_id && payload.caseId === event.case_id) {
      log.debug('Event already linked to case, skipping');
      return;
    }
  }

  // ── 2. Build entity context for Gemini ───────────────────────────────────
  const { context: entityContext, localEntityId } = buildEntityContext(
    event.canonical_entity_type,
    event.canonical_entity_id
  );

  // ── 3. Find the message content to classify ──────────────────────────────
  // For channel messages, the content is in the normalized_payload.
  // For commerce webhooks (order/payment updates), we synthesise a description.
  const normalizedPayload = JSON.parse(event.normalized_payload || '{}');
  const messageContent: string =
    normalizedPayload.messageContent ??
    normalizedPayload.message ??
    synthesiseEventDescription(event.source_system, event.event_type, entityContext);

  // ── 4. Classify intent ───────────────────────────────────────────────────
  log.info('Classifying intent', { eventType: event.event_type, source: event.source_system });

  const classification = await classifyIntent(messageContent, entityContext);

  log.info('Intent classified', {
    intent:     classification.intent,
    confidence: classification.confidence,
  });

  // ── 5. Resolve customer ID ───────────────────────────────────────────────
  let customerId: string | null = null;

  if (event.canonical_entity_type === 'customer' && localEntityId) {
    customerId = localEntityId;
  } else if (localEntityId) {
    // Look up customer via order/payment
    const entityRow = db.prepare(
      `SELECT customer_id FROM orders WHERE id = ?
       UNION ALL
       SELECT customer_id FROM payments WHERE id = ?
       LIMIT 1`
    ).get(localEntityId, localEntityId) as any;
    customerId = entityRow?.customer_id ?? null;
  }

  // ── 6. Determine priority and risk ───────────────────────────────────────
  const intent    = classification.intent;
  const caseType  = INTENT_TO_CASE_TYPE[intent] ?? 'general_support';
  const priority  = HIGH_PRIORITY_INTENTS.has(intent) ? 'high' : 'normal';
  const riskLevel = HIGH_RISK_INTENTS.has(intent)     ? 'high'  : 'low';

  // ── 7. Create or find case ───────────────────────────────────────────────
  const caseResult = await getOrCreateCase({
    tenantId,
    workspaceId,
    customerId,
    type:              caseType,
    intent:            classification.intent,
    intentConfidence:  classification.confidence,
    priority,
    riskLevel,
    channel:           normalizedPayload.channel ?? event.source_system,
    sourceSystem:      event.source_system,
    sourceEntityId:    event.source_entity_id,
    canonicalEventId:  payload.canonicalEventId,
    orderIds:          event.canonical_entity_type === 'order'   && localEntityId ? [localEntityId] : [],
    paymentIds:        event.canonical_entity_type === 'payment' && localEntityId ? [localEntityId] : [],
    returnIds:         event.canonical_entity_type === 'return'  && localEntityId ? [localEntityId] : [],
  });

  if (normalizedPayload.conversationId) {
    db.prepare(`
      UPDATE conversations
      SET case_id = COALESCE(case_id, ?), updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).run(caseResult.id, normalizedPayload.conversationId, tenantId, workspaceId);

    db.prepare(`
      UPDATE cases
      SET conversation_id = COALESCE(conversation_id, ?), updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).run(normalizedPayload.conversationId, caseResult.id, tenantId, workspaceId);

    db.prepare(`
      UPDATE messages
      SET case_id = COALESCE(case_id, ?)
      WHERE conversation_id = ? AND tenant_id = ?
    `).run(caseResult.id, normalizedPayload.conversationId, tenantId);
  }

  // ── 8. Update case with AI classification fields ─────────────────────────
  db.prepare(`
    UPDATE cases SET
      intent            = ?,
      intent_confidence = ?,
      sub_type          = ?,
      updated_at        = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    classification.intent,
    classification.confidence,
    classification.subType ?? null,
    caseResult.id,
  );

  // ── 9. Link entities to case ─────────────────────────────────────────────
  if (localEntityId) {
    const eType = event.canonical_entity_type as 'order' | 'payment' | 'return';
    if (['order', 'payment', 'return'].includes(eType)) {
      await linkEntityToCase(caseResult.id, tenantId, workspaceId, eType, localEntityId);
    }
  }

  // ── 10. Store suggested reply draft if we have one ───────────────────────
  if (classification.suggestedReply && caseResult.isNew) {
    const convRow = normalizedPayload.conversationId
      ? { id: normalizedPayload.conversationId }
      : db.prepare(
          'SELECT id FROM conversations WHERE case_id = ? LIMIT 1'
        ).get(caseResult.id) as any;

    if (convRow) {
      const { randomUUID } = await import('crypto');
      db.prepare(`
        INSERT INTO draft_replies
          (id, case_id, conversation_id, content, generated_by, status, tenant_id)
        VALUES (?, ?, ?, ?, 'intent_router', 'pending_review', ?)
      `).run(
        randomUUID(),
        caseResult.id,
        convRow.id,
        classification.suggestedReply,
        tenantId,
      );
    }
  }

  // ── 11. Update canonical_event ────────────────────────────────────────────
  db.prepare(`
    UPDATE canonical_events
    SET status  = 'linked',
        case_id = ?
    WHERE id = ?
  `).run(caseResult.id, payload.canonicalEventId);

  log.info('Case routed', {
    caseId:     caseResult.id,
    caseNumber: caseResult.caseNumber,
    isNew:      caseResult.isNew,
    intent:     classification.intent,
    caseType,
  });

  // ── 12. Enqueue downstream jobs ───────────────────────────────────────────
  // Reconciliation: detect cross-system conflicts
  await enqueue(
    JobType.RECONCILE_CASE,
    { caseId: caseResult.id },
    { tenantId, workspaceId, traceId: ctx.traceId, priority: 5 }
  );

  // Draft reply: generate a full AI-assisted draft for the inbox copilot
  await enqueue(
    JobType.DRAFT_REPLY,
    { caseId: caseResult.id },
    { tenantId, workspaceId, traceId: ctx.traceId, priority: 8 }
  );

  // Agent engine: fire the appropriate agent chain
  const agentTrigger = caseResult.isNew ? 'case_created' : 'message_received';
  await triggerAgents(agentTrigger, caseResult.id, {
    tenantId, workspaceId, traceId: ctx.traceId, priority: 7,
  });

  log.debug('Downstream jobs enqueued: RECONCILE_CASE + DRAFT_REPLY + AGENT_TRIGGER', { agentTrigger });
}

// ── Helper: synthesise a description for non-message webhook events ───────────

function synthesiseEventDescription(
  source: string,
  eventType: string,
  entityContext: string
): string {
  const descriptions: Record<string, string> = {
    'orders/paid':            'Customer placed and paid for an order.',
    'orders/updated':         'Order status was updated.',
    'orders/cancelled':       'An order was cancelled.',
    'orders/fulfilled':       'Order has been fulfilled and shipped.',
    'refunds/create':         'A refund was created for an order.',
    'charge.refunded':        'A payment charge was refunded.',
    'payment_intent.succeeded': 'Payment was successfully completed.',
    'payment_intent.payment_failed': 'Payment attempt failed.',
    'charge.dispute.created': 'A payment dispute (chargeback) was opened.',
    'customers/update':       'Customer account was updated.',
  };

  const base = descriptions[eventType] ?? `Event received from ${source}: ${eventType}`;
  return `${base}\n\nContext:\n${entityContext}`;
}

// ── Register ──────────────────────────────────────────────────────────────────

registerHandler(JobType.INTENT_ROUTE, handleIntentRoute);

export { handleIntentRoute };
