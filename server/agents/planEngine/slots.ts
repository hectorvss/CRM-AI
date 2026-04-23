/**
 * server/agents/planEngine/slots.ts
 *
 * Slot extractor — populates SessionState.slots from tool execution results.
 * Slots are live entities the user referenced; they power coreference resolution
 * ("el pedido de antes", "that customer", etc.).
 *
 * L2 Summarizer — compresses old turns into session.summary when L1 grows.
 */

import type { SessionState, Slot, ExecutionTrace } from './types.js';
import { logger } from '../../utils/logger.js';

const SLOT_TTL_TURNS = 10; // expires after 10 turns without reference

// ── Slot extractor ────────────────────────────────────────────────────────────

/**
 * Inspect each successful span's result and extract domain entity slots.
 * Mutates `session.slots` in-place.
 */
export function extractSlotsFromTrace(session: SessionState, trace: ExecutionTrace): void {
  for (const span of trace.spans) {
    if (!span.result.ok || !span.result.value) continue;
    const val = span.result.value as any;

    try {
      if (span.tool === 'order.get' || span.tool === 'order.cancel') {
        setSlot(session, 'order', {
          id: val.id,
          external_order_id: val.external_order_id,
          status: val.status,
          customer_id: val.customer_id,
        });
      }

      if (span.tool === 'order.list' && Array.isArray(val) && val.length > 0) {
        // Track the most recent order from the list
        setSlot(session, 'order', {
          id: val[0].id,
          external_order_id: val[0].external_order_id,
          status: val[0].status,
          _list_count: val.length,
        });
      }

      if (span.tool === 'payment.get' || span.tool === 'payment.refund') {
        setSlot(session, 'payment', {
          id: val.id ?? val.paymentId,
          status: val.status,
          amount: val.amount,
        });
      }

      if (span.tool === 'case.get' || span.tool === 'case.update_status' || span.tool === 'case.add_note') {
        setSlot(session, 'case', {
          id: val.id ?? val.caseId,
          status: val.status,
          customer_id: val.customer_id ?? val.case?.customer_id,
        });
      }

      if (span.tool === 'return.get' || span.tool === 'return.approve' || span.tool === 'return.reject') {
        setSlot(session, 'return', {
          id: val.id ?? val.returnId,
          status: val.status,
        });
      }

      if (span.tool === 'customer.get') {
        setSlot(session, 'customer', {
          id: val.id,
          name: val.canonical_name ?? val.name,
          email: val.email,
        });
      }

      if (span.tool === 'approval.get' || span.tool === 'approval.decide') {
        setSlot(session, 'approval', {
          id: val.id ?? val.approvalId,
          status: val.status ?? val.decision,
          action_type: val.action_type,
        });
      }
    } catch (err) {
      logger.debug('SlotExtractor error for span', { tool: span.tool, error: String(err) });
    }
  }

  // Decrement TTL on stale slots
  for (const [key, slot] of Object.entries(session.slots)) {
    slot.ttlTurns -= 1;
    if (slot.ttlTurns <= 0) {
      delete session.slots[key];
    }
  }
}

function setSlot(session: SessionState, type: Slot['type'], value: unknown): void {
  session.slots[type] = {
    type,
    value,
    confidence: 0.95,
    mentionedAt: new Date().toISOString(),
    ttlTurns: SLOT_TTL_TURNS,
  };
}

// ── L2 Summarizer ─────────────────────────────────────────────────────────────

const L1_MAX_TURNS = 20;   // compress when turns exceed this
const L1_KEEP_TURNS = 8;   // keep the N most recent after compression

/**
 * If the session has too many turns, compress the older ones into session.summary
 * using the LLM. This keeps the context window lean.
 *
 * Mutates session in-place. Returns true if compression happened.
 */
export async function maybeCompressTurns(
  session: SessionState,
  llmSummarize: (text: string) => Promise<string>,
): Promise<boolean> {
  if (session.turns.length <= L1_MAX_TURNS) return false;

  const toCompress = session.turns.slice(0, session.turns.length - L1_KEEP_TURNS);
  const toKeep = session.turns.slice(session.turns.length - L1_KEEP_TURNS);

  const conversationText = toCompress
    .map((t) => `${t.role.toUpperCase()}: ${t.content}`)
    .join('\n');

  const slotText = Object.entries(session.slots || {})
    .map(([key, slot]) => `${key}: ${JSON.stringify(slot.value)}`)
    .join('\n');

  const recentTargetsText = (session.recentTargets || [])
    .slice(0, 5)
    .map((target, index) => `${index + 1}. ${target.entityType || target.page}${target.entityId ? `:${target.entityId}` : ''}${target.section ? `#${target.section}` : ''}`)
    .join('\n');

  const pendingApprovalsText = (session.pendingApprovalIds || []).length
    ? session.pendingApprovalIds.join(', ')
    : 'none';

  const prompt = session.summary
    ? `Previous summary:\n${session.summary}\n\nLive session context:\nRecent navigation targets:\n${recentTargetsText || 'none'}\n\nActive slots:\n${slotText || 'none'}\n\nPending approvals:\n${pendingApprovalsText}\n\nNew conversation to add:\n${conversationText}\n\nWrite a concise updated summary (max 200 words) of what the user is working on, which entities are active, what action or approval is pending, and the most important facts discovered. Plain text, no lists.`
    : `Summarise this support agent conversation (max 200 words). Focus on: what the user investigated, entities found (IDs, statuses), active navigation targets, pending approvals, and actions taken. Plain text, no lists.\n\nRecent navigation targets:\n${recentTargetsText || 'none'}\n\nActive slots:\n${slotText || 'none'}\n\nPending approvals:\n${pendingApprovalsText}\n\n${conversationText}`;

  try {
    const summary = await llmSummarize(prompt);
    session.summary = summary.trim();
    session.turns = toKeep;
    logger.debug('Session turns compressed', {
      sessionId: session.id,
      compressedTurns: toCompress.length,
      keptTurns: toKeep.length,
    });
    return true;
  } catch (err) {
    logger.warn('L2 summarizer failed — keeping full turn history', { error: String(err) });
    return false;
  }
}
