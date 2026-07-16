/**
 * server/agents/finAgent/outcome.ts
 *
 * Outcome Engine (spec §7) — the conversation-level state machine that turns
 * Fin's replies into exactly one billable outcome per conversation:
 *
 *   resolution_confirmed — customer confirms the answer helped         (billable)
 *   resolution_assumed   — customer leaves for `assume_after_hours`    (billable)
 *   reversion            — customer returns asking for more help → the billable
 *                          outcome is reverted (never re-billed for the same one)
 *
 * Copied semantics from Intercom Fin's outcomes model: at most ONE billable
 * outcome per conversation; assumed resolutions are refunded if the customer
 * comes back, even across billing periods.
 */

import { getSupabaseAdmin } from '../../db/supabase.js';
import { getUtilityProvider } from '../chatAgent/providers/index.js';
import type { FinScope } from './config.js';

// ── Billing guard ─────────────────────────────────────────────────────────────

export async function hasActiveBillableOutcome(scope: FinScope, conversationId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('fin_outcomes')
    .select('id')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .eq('conversation_id', conversationId)
    .eq('billable', true)
    .eq('reverted', false)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

async function recordBillableOutcome(
  scope: FinScope,
  caseId: string,
  conversationId: string,
  outcome: 'resolution_confirmed' | 'resolution_assumed' | 'procedure_handoff',
  metadata: Record<string, unknown>,
): Promise<boolean> {
  if (await hasActiveBillableOutcome(scope, conversationId)) return false; // one per conversation
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('fin_outcomes').insert({
    tenant_id: scope.tenantId,
    workspace_id: scope.workspaceId,
    case_id: caseId,
    conversation_id: conversationId,
    outcome,
    billable: true,
    metadata,
  });
  if (error) throw error;
  await supabase.from('cases')
    .update({ ai_resolved: true, updated_at: new Date().toISOString() })
    .eq('id', caseId).eq('tenant_id', scope.tenantId);
  return true;
}

export async function revertResolution(scope: FinScope, caseId: string, conversationId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('fin_outcomes')
    .update({ reverted: true, reverted_at: new Date().toISOString() })
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .eq('conversation_id', conversationId)
    .eq('billable', true)
    .eq('reverted', false)
    .select('id');
  if (error) throw error;
  const reverted = (data ?? []).length > 0;
  if (reverted) {
    await supabase.from('cases')
      .update({ ai_resolved: false, updated_at: new Date().toISOString() })
      .eq('id', caseId).eq('tenant_id', scope.tenantId);
  }
  return reverted;
}

// ── Inbound classification (confirmation vs more help) ────────────────────────

/** Cheap heuristic before spending an LLM call: unambiguous gratitude/closure. */
const CONFIRM_RX = /^(ok(ay)?|vale|listo|perfecto|genial|gracias+|muchas gracias|mil gracias|thank(s| you)|that (helped|worked)|solucionado|resuelto|ya está|ya esta|funciona|arreglado)[\s!.,🙂👍❤️🙏]*$/i;

const OUTCOME_CLASSIFY_SYSTEM = `You are the outcome-detection stage of a customer-support AI agent.
The agent already sent an answer. Classify the customer's follow-up message. Respond ONLY with JSON:
{ "verdict": "confirm" | "more_help" }
- "confirm": the customer indicates the answer helped / thanks / closes the conversation.
- "more_help": anything else — follow-up questions, complaints, new issues, ambiguity.
When in doubt, choose "more_help".`;

export type InboundOutcomeAction = 'skip_run' | 'continue';

export interface InboundOutcomeInput {
  scope: FinScope;
  caseId: string;
  conversationId: string;
  latestInboundText: string;
}

/**
 * Called (post-debounce) for every inbound customer message BEFORE running the
 * answer pipeline. Decides whether the message closes the conversation
 * (→ confirmed resolution, skip the run) or reopens it (→ revert any assumed
 * resolution and continue with a normal run).
 */
export async function handleInboundOutcome(input: InboundOutcomeInput): Promise<InboundOutcomeAction> {
  const supabase = getSupabaseAdmin();

  // Only meaningful if Fin has already publicly replied in this conversation.
  const { data: aiReplies, error } = await supabase
    .from('messages')
    .select('id')
    .eq('conversation_id', input.conversationId)
    .eq('tenant_id', input.scope.tenantId)
    .eq('author_type', 'ai')
    .eq('is_private', false)
    .limit(1);
  if (error) throw error;
  if (!aiReplies?.length) return 'continue';

  let verdict: 'confirm' | 'more_help';
  const text = (input.latestInboundText || '').trim();
  // Strip leading punctuation/emoji (¡Muchas gracias! 🙏) before the heuristic.
  const normalized = text.replace(/^[¡¿!?\s\p{Emoji_Presentation}]+/u, '');
  if (CONFIRM_RX.test(normalized)) {
    verdict = 'confirm';
  } else {
    try {
      const { text: out } = await getUtilityProvider().completeUtility({
        system: OUTCOME_CLASSIFY_SYSTEM,
        prompt: `Customer follow-up message:\n${text.slice(0, 1000)}`,
        maxTokens: 50,
      });
      const parsed = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
      verdict = parsed.verdict === 'confirm' ? 'confirm' : 'more_help';
    } catch {
      verdict = 'more_help'; // fail open into helping
    }
  }

  if (verdict === 'confirm') {
    await recordBillableOutcome(input.scope, input.caseId, input.conversationId, 'resolution_confirmed', {
      trigger: 'customer_confirmation',
      message_excerpt: text.slice(0, 140),
    });
    return 'skip_run';
  }

  // Customer needs more help: any prior billable resolution gets refunded.
  await revertResolution(input.scope, input.caseId, input.conversationId);
  return 'continue';
}

// ── Assumed-resolution sweeper ────────────────────────────────────────────────

export interface SweepResult {
  scanned: number;
  assumed: number;
  errors: string[];
}

/**
 * Cron-driven (spec §7): conversations whose LAST message is a public AI reply
 * older than `assumeAfterHours` and with no active billable outcome become
 * `resolution_assumed`. Batch-limited; safe to run repeatedly (idempotent via
 * the one-billable-per-conversation guard).
 */
export async function sweepAssumedResolutions(opts?: { limit?: number; assumeAfterHours?: number }): Promise<SweepResult> {
  const limit = opts?.limit ?? 50;
  const hours = opts?.assumeAfterHours ?? 24;
  const cutoff = new Date(Date.now() - hours * 3_600_000).toISOString();
  const supabase = getSupabaseAdmin();
  const result: SweepResult = { scanned: 0, assumed: 0, errors: [] };

  // Candidates: cases whose pipeline published a reply (triage outcome=replied).
  const { data: candidates, error } = await supabase
    .from('cases')
    .select('id, tenant_id, workspace_id, conversation_id, ai_triage')
    .eq('ai_triage->>outcome', 'replied')
    .not('conversation_id', 'is', null)
    .limit(limit);
  if (error) { result.errors.push(error.message); return result; }

  for (const c of candidates ?? []) {
    result.scanned++;
    try {
      const scope: FinScope = { tenantId: c.tenant_id, workspaceId: c.workspace_id };
      const { data: lastMsgs, error: msgErr } = await supabase
        .from('messages')
        .select('id, author_type, is_private, direction, sent_at')
        .eq('conversation_id', c.conversation_id)
        .eq('tenant_id', c.tenant_id)
        .eq('is_private', false)
        .order('sent_at', { ascending: false })
        .limit(1);
      if (msgErr) throw msgErr;
      const last = lastMsgs?.[0];
      if (!last || last.author_type !== 'ai' || last.sent_at > cutoff) continue;

      const recorded = await recordBillableOutcome(scope, c.id, c.conversation_id, 'resolution_assumed', {
        trigger: 'sweep', hours_quiet: hours, last_ai_message_id: last.id,
      });
      if (recorded) {
        result.assumed++;
        const triage = { ...(c.ai_triage ?? {}), outcome: 'resolution_assumed', assumed_at: new Date().toISOString() };
        await supabase.from('cases')
          .update({ ai_triage: triage })
          .eq('id', c.id).eq('tenant_id', c.tenant_id);
      }
    } catch (err: any) {
      result.errors.push(`${c.id}: ${err?.message ?? err}`);
    }
  }
  return result;
}
