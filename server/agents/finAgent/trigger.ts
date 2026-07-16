/**
 * server/agents/finAgent/trigger.ts
 *
 * Event-driven entry point (spec §1): every inbound customer message schedules
 * a Fin run for its conversation, debounced per channel (chat ~5 s settle,
 * email ~2 min) so we don't answer while the customer is still typing.
 * One run per conversation at a time (in-process lock).
 *
 * NOTE: in-memory timers are fine for the long-lived Express dev/VM server.
 * On serverless (Vercel functions) timers may not survive the invocation —
 * there the safety net is the periodic sweeper (server cron `fin.sweep`,
 * F3) which picks up conversations with an unanswered inbound message.
 */

import { getSupabaseAdmin } from '../../db/supabase.js';
import { loadFinConfig, type FinScope } from './config.js';
import { runFinPipeline, type FinRunResult } from './pipeline.js';
import { handleInboundOutcome } from './outcome.js';

interface PendingRun {
  timer: NodeJS.Timeout;
  scope: FinScope;
  caseId: string;
  channel: string;
}

const pending = new Map<string, PendingRun>();   // conversationId → debounced run
const running = new Set<string>();               // conversationId lock

export interface FinTriggerInput {
  scope: FinScope;
  caseId: string;
  conversationId: string;
  channel: string;
  direction: 'inbound' | 'outbound';
}

/** Fire-and-forget: called from the message data layer after every insert. */
export function notifyMessageCreated(input: FinTriggerInput): void {
  if (input.direction !== 'inbound') return;
  // Never let agent scheduling break message ingestion.
  scheduleRun(input).catch((err) => console.warn('[finAgent] trigger failed:', err?.message ?? err));
}

async function scheduleRun(input: FinTriggerInput): Promise<void> {
  const config = await loadFinConfig(input.scope);
  if (!config.enabled) return;
  const channelKey = normalizeChannel(input.channel);
  const ch = (config.channels as any)[channelKey];
  if (!ch?.enabled) return;

  const debounceMs = channelKey === 'email'
    ? config.debounce.email_minutes * 60_000
    : config.debounce.chat_seconds * 1_000;

  // Re-arm the debounce on every new inbound message.
  const existing = pending.get(input.conversationId);
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(() => {
    pending.delete(input.conversationId);
    void executeRun(input, channelKey);
  }, debounceMs);
  timer.unref?.();
  pending.set(input.conversationId, { timer, scope: input.scope, caseId: input.caseId, channel: channelKey });
}

async function executeRun(input: FinTriggerInput, channelKey: string): Promise<FinRunResult | null> {
  if (running.has(input.conversationId)) return null; // a run is in flight; its answer covers this message
  running.add(input.conversationId);
  try {
    // Outcome Engine first (spec §7): a confirmation ("gracias, solucionado")
    // records the billable resolution and skips the answer pipeline; anything
    // else reverts a previously-assumed resolution and continues normally.
    try {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from('messages')
        .select('content')
        .eq('conversation_id', input.conversationId)
        .eq('tenant_id', input.scope.tenantId)
        .eq('direction', 'inbound')
        .order('sent_at', { ascending: false })
        .limit(1);
      const latestInboundText = String(data?.[0]?.content ?? '');
      const action = await handleInboundOutcome({
        scope: input.scope,
        caseId: input.caseId,
        conversationId: input.conversationId,
        latestInboundText,
      });
      if (action === 'skip_run') return null;
    } catch (err: any) {
      console.warn('[finAgent] outcome handling failed, continuing with run:', err?.message ?? err);
    }

    return await runFinPipeline({
      scope: input.scope,
      caseId: input.caseId,
      conversationId: input.conversationId,
      channel: channelKey,
    });
  } catch (err: any) {
    console.error('[finAgent] pipeline run failed:', err?.message ?? err);
    return null;
  } finally {
    running.delete(input.conversationId);
  }
}

function normalizeChannel(raw: string): string {
  const c = (raw || '').toLowerCase();
  if (['chat', 'widget', 'web', 'messenger', 'web chat'].some((k) => c.includes(k))) return 'chat';
  if (c.includes('mail')) return 'email';
  if (c.includes('whatsapp') || c.includes('wa')) return 'whatsapp';
  return 'chat';
}

// Test hooks
export function _pendingCountForTests(): number { return pending.size; }
export function _flushForTests(): void {
  for (const [id, p] of pending) { clearTimeout(p.timer); pending.delete(id); }
}
