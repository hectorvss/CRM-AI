/**
 * server/agents/finAgent/pipeline.ts
 *
 * The Fin engine: one run per incoming customer message (spec §1, stages E1-E6).
 * Every stage persists its status into cases.ai_triage so runs are observable
 * from the inbox and resumable/debuggable. Deterministic run ids.
 *
 * F2 scope: answer engine with citations, draft-only delivery by default
 * (publication policy honored from config), knowledge-gap capture, initial
 * outcome events. Procedures/connectors arrive in F4 (spec §5).
 */

import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { getPrimaryProvider, getUtilityProvider } from '../chatAgent/providers/index.js';
import { loadFinConfig, type FinConfig, type FinScope } from './config.js';
import { retrieveKnowledge, type RetrievedChunk } from './retrieval.js';
import { getActiveRun, matchProcedure, runProcedureTurn } from './procedures.js';
import { hasActiveBillableOutcome } from './outcome.js';
import {
  REFINE_SYSTEM, refinePrompt,
  ATTRIBUTES_SYSTEM, attributesPrompt,
  buildGenerateSystem, generatePrompt,
  VALIDATE_SYSTEM, validatePrompt,
  fence,
} from './prompts.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FinRunInput {
  scope: FinScope;
  caseId: string;
  conversationId: string;
  channel: string; // 'chat' | 'email' | 'whatsapp' | …
  /** When true, nothing is persisted — used by the preview/testing screen. */
  dryRun?: boolean;
  /** Preview-only: run against this question instead of the conversation. */
  previewQuestion?: string;
}

export interface FinRunResult {
  runId: string;
  status: 'draft_created' | 'replied' | 'clarify' | 'escalated' | 'skipped' | 'blocked_unsafe' | 'error';
  reply?: { text: string; citations: string[]; confidence: number; isPrivate: boolean; messageId?: string };
  triage: Record<string, unknown>;
}

interface StageLog { stage: string; status: 'ok' | 'skip' | 'fail'; ms: number; detail?: unknown }

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseJsonBlock<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('model output contained no JSON object');
  return JSON.parse(match[0]) as T;
}

async function persistTriage(input: FinRunInput, triage: Record<string, unknown>): Promise<void> {
  if (input.dryRun) return;
  const supabase = getSupabaseAdmin();
  await supabase
    .from('cases')
    .update({ ai_triage: triage, updated_at: new Date().toISOString() })
    .eq('id', input.caseId)
    .eq('tenant_id', input.scope.tenantId)
    .eq('workspace_id', input.scope.workspaceId);
}

async function loadThread(input: FinRunInput): Promise<{ history: string; latest: string; latestId: string | null }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('messages')
    .select('id, direction, sender_name, content, sent_at, is_private, author_type')
    .eq('conversation_id', input.conversationId)
    .eq('tenant_id', input.scope.tenantId)
    .order('sent_at', { ascending: true })
    .limit(60);
  if (error) throw error;
  const rows = (data ?? []).filter((m) => !m.is_private);
  const fmt = (m: any) =>
    `${m.direction === 'inbound' ? 'CUSTOMER' : m.author_type === 'ai' ? 'AGENT(AI)' : 'AGENT'}: ${String(m.content ?? '').slice(0, 2000)}`;
  const lastInbound = [...rows].reverse().find((m) => m.direction === 'inbound');
  const history = rows.slice(0, -1).map(fmt).join('\n');
  return {
    history,
    latest: lastInbound ? String(lastInbound.content ?? '') : '',
    latestId: lastInbound?.id ?? null,
  };
}

async function loadCustomerContext(input: FinRunInput): Promise<string | null> {
  // Allowlisted, PII-minimal customer snapshot (spec §3.4).
  const supabase = getSupabaseAdmin();
  const { data: caseRow } = await supabase
    .from('cases')
    .select('customer_id, type, priority, status')
    .eq('id', input.caseId)
    .eq('tenant_id', input.scope.tenantId)
    .maybeSingle();
  if (!caseRow?.customer_id) return null;
  const { data: cust } = await supabase
    .from('customers')
    .select('display_name, segment, language, metadata')
    .eq('id', caseRow.customer_id)
    .eq('tenant_id', input.scope.tenantId)
    .maybeSingle();
  if (!cust) return null;
  const allow: Record<string, unknown> = {
    name: cust.display_name ?? undefined,
    segment: (cust as any).segment ?? undefined,
    language: (cust as any).language ?? undefined,
    case_type: caseRow.type ?? undefined,
    case_priority: caseRow.priority ?? undefined,
  };
  const entries = Object.entries(allow).filter(([, v]) => v !== undefined && v !== null);
  return entries.length ? entries.map(([k, v]) => `${k}: ${v}`).join('\n') : null;
}

function resolveReplyMode(config: FinConfig, channel: string, ticketType: string): 'off' | 'draft_only' | 'bot_reply' {
  const ch = (config.channels as any)[channel] ?? null;
  if (!ch || !ch.enabled) return 'off';
  return ch.reply_modes[ticketType] ?? ch.reply_modes['*'] ?? 'draft_only';
}

async function recordOutcome(
  input: FinRunInput,
  outcome: string,
  billable: boolean,
  metadata: Record<string, unknown>,
): Promise<void> {
  if (input.dryRun) return;
  const supabase = getSupabaseAdmin();
  await supabase.from('fin_outcomes').insert({
    tenant_id: input.scope.tenantId,
    workspace_id: input.scope.workspaceId,
    case_id: input.caseId,
    conversation_id: input.conversationId,
    outcome,
    billable,
    metadata,
  });
}

async function recordKnowledgeGap(input: FinRunInput, gapText: string, queryText: string): Promise<void> {
  if (input.dryRun) return;
  const supabase = getSupabaseAdmin();
  await supabase.from('fin_knowledge_gaps').insert({
    tenant_id: input.scope.tenantId,
    workspace_id: input.scope.workspaceId,
    case_id: input.caseId,
    gap_text: gapText.slice(0, 2000),
    query_text: queryText.slice(0, 2000),
  });
}

/** Insert an agent-authored message (draft or public reply) into the thread. */
async function insertAgentMessage(
  input: FinRunInput,
  config: FinConfig,
  text: string,
  opts: { isPrivate: boolean; type: string; citations?: string[]; confidence?: number; reasoning?: Record<string, unknown> },
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const messageId = crypto.randomUUID();
  const now = new Date().toISOString();
  const { error } = await supabase.from('messages').insert({
    id: messageId,
    conversation_id: input.conversationId,
    case_id: input.caseId,
    type: opts.type,
    direction: 'outbound',
    sender_id: 'fin-agent',
    sender_name: config.identity.name,
    content: text,
    content_type: 'text',
    channel: input.channel,
    sent_at: now,
    created_at: now,
    tenant_id: input.scope.tenantId,
    is_private: opts.isPrivate,
    author_type: 'ai',
    citations: opts.citations ?? [],
    confidence: opts.confidence ?? null,
    reasoning: opts.reasoning ?? null,
  });
  if (error) throw error;
  return messageId;
}

// ── The engine ────────────────────────────────────────────────────────────────

export async function runFinPipeline(input: FinRunInput): Promise<FinRunResult> {
  const runId = `fin-run-${input.caseId}-${crypto.randomUUID().slice(0, 8)}`;
  const stages: StageLog[] = [];
  const triage: Record<string, unknown> = { run_id: runId, started_at: new Date().toISOString(), stages };
  const t = (name: string) => {
    const start = Date.now();
    return (status: StageLog['status'], detail?: unknown) => stages.push({ stage: name, status, ms: Date.now() - start, detail });
  };

  const config = await loadFinConfig(input.scope);
  const f = fence();

  try {
    // Gate: master switch + channel
    if (!input.dryRun) {
      if (!config.enabled) return { runId, status: 'skipped', triage: { ...triage, skip_reason: 'fin_disabled' } };
      const mode = (config.channels as any)[input.channel];
      if (!mode?.enabled) return { runId, status: 'skipped', triage: { ...triage, skip_reason: 'channel_disabled' } };
    }

    // Thread + customer context
    const thread = input.previewQuestion
      ? { history: '', latest: input.previewQuestion, latestId: null }
      : await loadThread(input);
    if (!thread.latest.trim()) return { runId, status: 'skipped', triage: { ...triage, skip_reason: 'no_inbound_message' } };
    const customerContext = input.previewQuestion ? null : await loadCustomerContext(input);

    // ── E1: refine ────────────────────────────────────────────────────────────
    let done = t('e1_refine');
    const refineRaw = await getUtilityProvider().completeUtility({
      system: REFINE_SYSTEM,
      prompt: refinePrompt({ history: thread.history, latest: thread.latest, f }),
      maxTokens: 600,
    });
    const refined = parseJsonBlock<{
      safe: boolean; unsafe_reason: string | null; language: string; refined_query: string;
      ticket_type: string; needs_clarification: boolean; clarifying_question: string | null;
    }>(refineRaw.text);
    triage.classification = { ticket_type: refined.ticket_type, language: refined.language, refined_query: refined.refined_query };
    done('ok', { ticket_type: refined.ticket_type, safe: refined.safe });

    // ── E1.5: attributes — classify the workspace's configured attributes into
    // ai_triage.attributes (spec §5, "Atributos"). Cheap utility call; best-effort.
    const activeAttributes = (config.attributes ?? []).filter((a: any) => a.enabled !== false);
    if (activeAttributes.length) {
      done = t('e1b_attributes');
      try {
        const attrRaw = await getUtilityProvider().completeUtility({
          system: ATTRIBUTES_SYSTEM,
          prompt: attributesPrompt({
            attributes: activeAttributes.map((a: any) => ({
              name: a.name,
              description: a.description,
              values: (a.values ?? []).map((v: any) => v.name).filter(Boolean).concat(a.options ?? []),
            })),
            history: thread.history, latest: thread.latest, f,
          }),
          maxTokens: 300,
        });
        const attrs = parseJsonBlock<Record<string, unknown>>(attrRaw.text);
        triage.attributes = attrs;
        done('ok', attrs);
      } catch (err: any) {
        done('fail', { error: String(err?.message ?? err) });
      }
    }

    if (!refined.safe) {
      triage.outcome = 'blocked_unsafe';
      await persistTriage(input, triage);
      await recordOutcome(input, 'escalated', false, { reason: 'unsafe_input', detail: refined.unsafe_reason });
      return { runId, status: 'blocked_unsafe', triage };
    }
    if (refined.ticket_type === 'unactionable') {
      triage.outcome = 'skipped_unactionable';
      await persistTriage(input, triage);
      return { runId, status: 'skipped', triage };
    }

    // Publication policy for this channel+type (draft_only is the safe floor)
    const replyMode = input.dryRun ? 'draft_only' : resolveReplyMode(config, input.channel, refined.ticket_type);
    if (replyMode === 'off' && !input.dryRun) {
      triage.outcome = 'skipped_reply_mode_off';
      await persistTriage(input, triage);
      return { runId, status: 'skipped', triage };
    }

    // ── E3-P: procedures (spec §5) — before RAG. An active run for this
    // conversation always resumes; otherwise the refined intent is matched
    // against the live procedure catalog. Preview runs skip procedures.
    if (!input.previewQuestion) {
      done = t('e3_procedures');
      const activeRun = await getActiveRun(input.scope, input.conversationId);
      const matched = activeRun ? null : await matchProcedure(input.scope, refined.refined_query);
      if (activeRun || matched) {
        const turn = await runProcedureTurn({
          scope: input.scope, config,
          caseId: input.caseId, conversationId: input.conversationId,
          history: thread.history, latest: thread.latest, fence: f,
          run: activeRun, procedure: matched,
        });
        done('ok', turn ? { run_id: turn.runId, status: turn.status } : { skipped: true });
        if (turn) {
          triage.procedure = { run_id: turn.runId, procedure_id: turn.procedureId, status: turn.status };
          const isPrivate = replyMode !== 'bot_reply';
          let messageId: string | undefined;
          if (turn.say && !input.dryRun) {
            messageId = await insertAgentMessage(input, config, turn.say, {
              isPrivate,
              type: isPrivate ? 'ai_draft' : 'reply',
              reasoning: { run_id: runId, procedure_run_id: turn.runId, kind: 'procedure' },
            });
          }
          const procOutcome = (turn as any).status === 'failed' ? 'procedure_failure'
            : turn.handoff && turn.status === 'completed' ? 'procedure_handoff'
            : null;
          if (procOutcome === 'procedure_handoff') {
            // Designed handoffs are billable (outcome taxonomy §7), one per conversation.
            if (!(await hasActiveBillableOutcome(input.scope, input.conversationId))) {
              await recordOutcome(input, 'procedure_handoff', true, { procedure_run_id: turn.runId, team: turn.handoff?.team ?? null });
            }
            if (!input.dryRun) {
              const supabase = getSupabaseAdmin();
              await supabase.from('cases')
                .update({ escalation_reason: `fin_procedure_handoff${turn.handoff?.team ? `:${turn.handoff.team}` : ''}` })
                .eq('id', input.caseId).eq('tenant_id', input.scope.tenantId);
            }
          } else if (procOutcome === 'procedure_failure') {
            await recordOutcome(input, 'procedure_failure', false, { procedure_run_id: turn.runId, note: turn.handoff?.note ?? null });
          }
          triage.outcome = `procedure_${turn.status}`;
          triage.finished_at = new Date().toISOString();
          await persistTriage(input, triage);
          const status: FinRunResult['status'] =
            procOutcome === 'procedure_failure' ? 'escalated' :
            procOutcome === 'procedure_handoff' ? 'escalated' :
            turn.say ? (isPrivate ? 'draft_created' : 'replied') : 'skipped';
          return {
            runId, status, triage,
            reply: turn.say ? { text: turn.say, citations: [], confidence: 1, isPrivate, messageId } : undefined,
          };
        }
      } else {
        done('skip');
      }
    }

    // ── E2: retrieve ──────────────────────────────────────────────────────────
    done = t('e2_retrieve');
    const retrieval = await retrieveKnowledge(input.scope, refined.refined_query, config);
    done('ok', { candidates: retrieval.chunks.length, degraded: retrieval.degraded });
    triage.retrieval = { chunks: retrieval.chunks.map((c) => c.id), degraded: retrieval.degraded };

    // ── E3+E4: generate ⇄ validate loop ───────────────────────────────────────
    const guidance = config.guidance.filter((g) => g.active).map((g) => g.text);
    const genSystem = buildGenerateSystem(config, guidance, f);
    let best: { text: string; citations: string[]; type: string; score: number } | null = null;
    let feedback: string | null = null;

    for (let attempt = 1; attempt <= config.validation.max_attempts; attempt++) {
      done = t(`e3_generate_a${attempt}`);
      const genRaw = await getPrimaryProvider().streamChat({
        system: genSystem,
        messages: [{
          role: 'user',
          content: generatePrompt({
            refinedQuery: refined.refined_query, history: thread.history, latest: thread.latest,
            chunks: retrieval.chunks, customerContext, f,
          }) + (feedback ? `\n\nA previous draft was rejected by the validator. Fix this: ${feedback}` : ''),
        }],
        tools: [],
        resolveToolName: (n) => n,
        maxTokens: 1200,
        onTextDelta: () => { /* buffered; SSE streaming arrives with the inbox integration */ },
      });
      const draft = parseJsonBlock<{ type: string; text: string; citations: string[] }>(genRaw.text);
      done('ok', { type: draft.type });

      if (draft.type === 'clarify') {
        best = { ...draft, citations: [], score: 1 };
        break; // clarifying questions skip validation
      }
      if (draft.type === 'cannot_answer') {
        best = { ...draft, citations: [], score: 0 };
        await recordKnowledgeGap(input, `No grounded answer available for: ${refined.refined_query}`, thread.latest);
        break;
      }

      done = t(`e4_validate_a${attempt}`);
      const valRaw = await getUtilityProvider().completeUtility({
        system: VALIDATE_SYSTEM,
        prompt: validatePrompt({ query: refined.refined_query, draft: draft.text, chunks: retrieval.chunks, f }),
        maxTokens: 500,
      });
      const verdict = parseJsonBlock<{ score: number; grounded: boolean; safe: boolean; missing: string[]; feedback: string }>(valRaw.text);
      done('ok', { score: verdict.score, grounded: verdict.grounded, safe: verdict.safe });

      const score = verdict.grounded && verdict.safe ? verdict.score : 0;
      if (!best || score > best.score) best = { ...draft, score };
      if (score >= config.validation.confidence_threshold) break;
      feedback = verdict.feedback || (verdict.missing ?? []).join('; ') || 'be more grounded in the sources';
      if (verdict.missing?.length) {
        await recordKnowledgeGap(input, verdict.missing.join('; '), refined.refined_query);
      }
    }

    if (!best) throw new Error('generation produced no draft');
    triage.confidence = best.score;

    // ── E5: deliver ───────────────────────────────────────────────────────────
    const confident = best.score >= config.validation.confidence_threshold;
    const publish = replyMode === 'bot_reply' && confident && best.type !== 'cannot_answer';
    const isPrivate = !publish;
    let messageId: string | undefined;

    if (!input.dryRun && best.type !== 'cannot_answer') {
      done = t('e5_deliver');
      messageId = await insertAgentMessage(input, config, best.text, {
        isPrivate,
        type: isPrivate ? 'ai_draft' : 'reply',
        citations: best.citations,
        confidence: best.score,
        reasoning: { run_id: runId, type: best.type, attempts: stages.filter((s) => s.stage.startsWith('e3')).length },
      });
      done('ok', { messageId, isPrivate });
    }

    // ── E6: outcome ───────────────────────────────────────────────────────────
    const status: FinRunResult['status'] =
      best.type === 'clarify' ? 'clarify' :
      best.type === 'cannot_answer' ? 'escalated' :
      publish ? 'replied' : 'draft_created';
    triage.outcome = status;
    triage.finished_at = new Date().toISOString();
    await persistTriage(input, triage);

    if (best.type === 'cannot_answer') {
      await recordOutcome(input, 'escalated', false, { reason: 'no_grounded_answer', confidence: best.score });
      if (!input.dryRun) {
        const supabase = getSupabaseAdmin();
        await supabase.from('cases')
          .update({ escalation_reason: 'fin_no_grounded_answer' })
          .eq('id', input.caseId).eq('tenant_id', input.scope.tenantId);
      }
    } else if (best.type !== 'clarify') {
      await recordOutcome(input, 'draft_created', false, { published: publish, confidence: best.score });
    }

    return {
      runId, status, triage,
      reply: { text: best.text, citations: best.citations, confidence: best.score, isPrivate, messageId },
    };
  } catch (err: any) {
    triage.outcome = 'error';
    triage.error = String(err?.message ?? err);
    triage.finished_at = new Date().toISOString();
    try { await persistTriage(input, triage); } catch { /* best-effort */ }
    return { runId, status: 'error', triage };
  }
}
