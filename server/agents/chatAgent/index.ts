/**
 * server/agents/chatAgent/index.ts
 *
 * The operator Super Agent — a ReAct loop over the Plan Engine tool registry,
 * streaming to the AgentChatView frontend via SSE.
 *
 * Ported semantics from PostHog's root agent (Txlemetry fork):
 *   - ee/hogai/core/agent_modes/executables.py — AgentExecutable (model turn,
 *     hard iteration limit that strips tools and forces a final answer) and
 *     AgentToolsExecutable (tool errors become tool results, never aborts;
 *     parallel tool fan-out).
 *   - Read-parallel / write-sequential is our safety tightening of PostHog's
 *     parallel_tool_calls=True.
 *   - High/critical tools pause the loop for human approval — the equivalent of
 *     PostHog interrupting the graph with an ApprovalRequest and resuming.
 *
 * SSE contract (matches AgentChatView in src/prototype/views/AgentViews.tsx):
 *   conversation_created, title_generated, text_chunk, tool_start,
 *   tool_result, approval_request, done, error.
 */

import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger.js';
import { invokeTool } from '../planEngine/invokeTool.js';
import { effectiveToolRisk } from '../planEngine/safety.js';
import { toolRegistry } from '../planEngine/registry.js';
import { persistTrace } from '../planEngine/traceRepository.js';
import type { ExecutionSpan, ExecutionStatus, RiskLevel } from '../planEngine/types.js';
import {
  assertCanUseAI,
  chargeCredits,
  AICreditExhaustedError,
} from '../../services/aiUsageMeter.js';
import {
  createConversation,
  getConversation,
  appendMessage,
  listMessages,
  updateTitle,
  setPendingAction,
  type AgentScope,
  type StoredToolCall,
  type PendingAction,
  type CheckpointMessage,
} from '../../data/agentConversations.js';
import { getCoreMemory, appendCoreMemory } from '../../data/agentCoreMemory.js';
import { assembleSituation, formatSituationForPrompt, loadOpenEntity } from './situation.js';
import { wrapExternal } from './fencing.js';
import type { CatalogEntry } from '../planEngine/registry.js';
import { getPrimaryProvider, getUtilityProvider } from './providers/index.js';
import type { ProviderMessage, ProviderToolCall } from './providers/types.js';
import { ProviderNotConfiguredError } from './providers/types.js';
import { adaptToolkit } from './toolAdapter.js';
import { selectToolkit, type AgentSurface } from './toolkit.js';
import { getUiHint } from './uiHints.js';
import {
  buildChatSystemPrompt,
  HARD_LIMIT_REACHED_PROMPT,
  TOOL_DOES_NOT_EXIST_PROMPT,
  TITLE_GENERATION_PROMPT,
  type UIContext,
} from './systemPrompt.js';
import type { AgentSSEEmitter } from './sse.js';

// PostHog caps at MAX_TOOL_CALLS=24 LLM iterations; we start tighter and
// keep a wall-clock budget so serverless SSE responses end cleanly.
const MAX_ITERATIONS = 8;
// Below the Vercel function maxDuration (60s, see vercel.json), leaving margin
// for the final flush + done event. The durable-queue rewrite (for runs that
// would exceed this) is deferred — the operator waits synchronously.
const TIME_BUDGET_MS = 50_000;
/** Max chars of a tool result fed back to the model per call (the trace keeps
 *  the full result). Trimmed from 16k → 8k: big case/order bundles bloated the
 *  context and cost without improving answers. */
const TOOL_RESULT_MODEL_LIMIT = 8_000;
/** Conversations with fewer messages than this get a generated title. */
const TITLE_THRESHOLD = 3;
const TITLE_TIMEOUT_MS = 3_000;
/** Risks that pause the loop for human approval. */
const APPROVAL_RISKS = new Set(['high', 'critical']);

export interface ResumePayload {
  proposalId: string;
  decision: 'approve' | 'reject';
  feedback?: string;
}

export interface RunChatAgentInput {
  tenantId: string;
  workspaceId: string | null;
  userId: string | null;
  conversationId?: string;
  message: string;
  uiContext?: UIContext;
  hasPermission: (perm: string) => boolean;
  surface?: AgentSurface;
  emitter: AgentSSEEmitter;
  /** When set, resume a conversation parked on an approval instead of a new turn. */
  resume?: ResumePayload;
}

export async function runChatAgent(input: RunChatAgentInput): Promise<void> {
  const { emitter } = input;
  const scope: AgentScope = {
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    userId: input.userId,
  };
  const startedAt = Date.now();
  // Unique per turn (super_agent_traces.plan_id is a PK); session = conversation.
  const turnId = `chat-${randomUUID()}`;
  let conversationId = input.conversationId;

  try {
    // ── Credits preflight ──────────────────────────────────────────────────
    await assertCanUseAI(
      { tenantId: input.tenantId, workspaceId: input.workspaceId ?? 'ws_default', userId: input.userId ?? undefined },
      2,
    );

    // ── Conversation bootstrap ─────────────────────────────────────────────
    let conversation = conversationId ? await getConversation(scope, conversationId) : null;
    let isNewConversation = false;
    if (!conversation) {
      if (input.resume) {
        emitter.emit('error', { message: 'Conversation not found for approval.', code: 'CONVERSATION_NOT_FOUND' });
        return;
      }
      conversation = await createConversation(scope, { id: conversationId });
      isNewConversation = true;
    }
    conversationId = conversation.id;
    emitter.emit('conversation_created', { conversationId });

    // ── Slash commands (handled server-side, no LLM spend) ─────────────────
    // PostHog treats /remember as a real feature that appends verbatim to core
    // memory; we mirror that and add /help. /clear is a pure UI action handled
    // on the client.
    if (!input.resume && input.message.trim().startsWith('/')) {
      const handled = await handleSlashCommand({
        message: input.message,
        scope,
        conversationId,
        tenantId: input.tenantId,
        isNew: isNewConversation,
        priorCount: conversation.message_count ?? 0,
        emitter,
      });
      if (handled) return;
    }

    // ── Toolkit + prompt (maxRisk critical; high/critical gated below) ─────
    const surface = input.surface ?? 'operator';
    const situationScope = { tenantId: input.tenantId, workspaceId: input.workspaceId ?? 'ws_default', userId: input.userId };
    const relevantTools = Array.isArray(input.uiContext?.relevantTools) ? input.uiContext!.relevantTools : undefined;
    const [coreMemory, catalog, situationText, openEntity] = await Promise.all([
      getCoreMemory(input.tenantId).catch(() => null),
      Promise.resolve(selectToolkit({
        hasPermission: input.hasPermission,
        surface,
        maxRisk: 'critical',
        // Contextual tool scoping: when the view declares relevant tools, narrow
        // the catalog to reduce prompt size and misfires (keeps memory/situational).
        allow: relevantTools?.length ? [...relevantTools, 'memory.get', 'memory.append', 'switch_mode'] : undefined,
      })),
      // Situational awareness — only for the operator (not the read-only surface).
      surface === 'operator'
        ? assembleSituation(situationScope, { compact: true }).then(formatSituationForPrompt).catch(() => null)
        : Promise.resolve(null),
      // Open-entity snapshot when the operator has a case/customer open.
      surface === 'operator' && (input.uiContext?.caseId || input.uiContext?.customerId)
        ? loadOpenEntity(situationScope, { caseId: input.uiContext?.caseId, customerId: input.uiContext?.customerId }).catch(() => null)
        : Promise.resolve(null),
    ]);
    const { tools, resolveToolName } = adaptToolkit(catalog);
    const catalogByName = new Map(catalog.map((entry) => [entry.name, entry]));
    const system = buildChatSystemPrompt({
      uiContext: input.uiContext,
      coreMemory,
      toolCount: tools.length,
      situation: situationText,
      openEntity,
    });
    const provider = getPrimaryProvider();

    const chargeFor = (model: string, inTok: number, outTok: number, iteration: number) =>
      chargeCredits({
        scope: { tenantId: input.tenantId, workspaceId: input.workspaceId ?? 'ws_default', userId: input.userId ?? undefined },
        eventType: 'agent_chat',
        model,
        promptTokens: inTok,
        completionTokens: outTok,
        metadata: { conversationId, iteration },
      }).catch((err) => logger.warn('chatAgent: chargeCredits failed', { error: err?.message }));

    const execCtx: ToolExecContext = {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      hasPermission: input.hasPermission,
      conversationId,
      catalogByName,
      emitter,
    };

    // ── Loop state (seeded fresh or from the approval checkpoint) ──────────
    let messages: ProviderMessage[];
    let assistantText: string;
    const executedToolCalls: StoredToolCall[] = [];
    let totalTokens = 0;
    let finishReason: 'stop' | 'max_iterations' = 'stop';

    if (input.resume) {
      // ── Resume path ──────────────────────────────────────────────────────
      const pending = conversation.pending_action;
      if (!pending || pending.proposalId !== input.resume.proposalId) {
        emitter.emit('error', {
          message: 'This approval is no longer pending (already decided or expired).',
          code: 'APPROVAL_NOT_PENDING',
        });
        return;
      }

      messages = checkpointToProviderMessages(pending.checkpointMessages);
      assistantText = pending.accumulatedText;
      executedToolCalls.push(...pending.executedToolCalls);

      // Execute (approve) or reject each awaiting tool call, delivering a
      // tool_result for every tool_use block so the API stays consistent.
      const decided = await resolveGatedToolCalls(
        pending.requestedToolCalls,
        input.resume.decision,
        input.resume.feedback,
        execCtx,
      );
      executedToolCalls.push(...decided);
      for (const stored of decided) {
        messages.push({
          role: 'tool_result',
          toolCallId: stored.toolCallId,
          // Fenced: tool results carry untrusted (customer-authored) content.
          content: wrapExternal('tool_result', serializeForModel(stored.result)),
          isError: !stored.ok,
        });
      }

      await setPendingAction(scope, conversationId, null).catch(() => {});
    } else {
      // ── Fresh turn ───────────────────────────────────────────────────────
      const historyRows = !isNewConversation ? await listMessages(scope, conversationId) : [];
      messages = rebuildProviderHistory(historyRows.slice(-30));
      messages.push({ role: 'user', content: input.message });
      assistantText = '';
      await appendMessage(scope, conversationId, { role: 'user', content: input.message })
        .catch((err) => logger.warn('chatAgent: persist user turn failed', { error: err?.message }));
    }

    // ── ReAct loop ─────────────────────────────────────────────────────────
    for (let iteration = 1; iteration <= MAX_ITERATIONS + 1; iteration++) {
      const outOfBudget = iteration > MAX_ITERATIONS || Date.now() - startedAt > TIME_BUDGET_MS;
      if (outOfBudget) {
        finishReason = 'max_iterations';
        messages.push({ role: 'user', content: HARD_LIMIT_REACHED_PROMPT });
      }

      const result = await provider.streamChat({
        system,
        messages,
        tools: outOfBudget ? [] : tools,
        resolveToolName,
        onTextDelta: (text) => emitter.emit('text_chunk', { text }),
        // Live reasoning — the operator sees the "why" as it happens.
        onThinkingDelta: (text) => emitter.emit('reasoning_chunk', { text }),
        // Interactive copilot: prefer snappy responses. Claude 5 keeps its
        // adaptive thinking internal anyway (not surfaced), so higher effort is
        // pure latency here. Override with AGENT_THINKING_EFFORT if needed.
        thinkingEffort: (process.env.AGENT_THINKING_EFFORT as any) ?? 'low',
      });

      totalTokens += result.usage.inputTokens + result.usage.outputTokens;
      chargeFor(result.model, result.usage.inputTokens, result.usage.outputTokens, iteration);

      if (result.text) assistantText += (assistantText ? '\n\n' : '') + result.text;
      if (!result.toolCalls.length || outOfBudget) break;

      // Carry the provider's raw content (incl. thinking blocks with signatures)
      // so the next iteration replays it verbatim — required for extended
      // thinking within a tool-use sequence.
      messages.push({ role: 'assistant', content: result.text, toolCalls: result.toolCalls, _providerContent: result.rawContent });

      // ── Approval gate ────────────────────────────────────────────────────
      // Gate on the EFFECTIVE risk (max of the tool's static risk and the
      // argument-aware dynamic classifier), so e.g. a customer message, a large
      // refund, or a bulk op is caught even when the ToolSpec baseline is lower.
      const effRisk = (tc: { toolName: string; args: unknown }): RiskLevel =>
        effectiveToolRisk(tc.toolName, tc.args, catalogByName.get(tc.toolName)?.risk ?? 'none');
      const risky = result.toolCalls.filter((tc) => APPROVAL_RISKS.has(effRisk(tc)));
      if (risky.length > 0) {
        const primary = risky[0];
        const proposalId = randomUUID();
        const preview = buildApprovalPreview(primary, catalogByName.get(primary.toolName));
        const pending: PendingAction = {
          proposalId,
          checkpointMessages: providerToCheckpointMessages(messages),
          requestedToolCalls: result.toolCalls.map((tc) => ({
            toolCallId: tc.id,
            toolName: tc.toolName,
            args: tc.args,
            risk: effRisk(tc),
          })),
          primaryToolName: primary.toolName,
          primaryArgs: primary.args,
          risk: effRisk(primary),
          preview,
          accumulatedText: assistantText,
          executedToolCalls,
          createdAt: new Date().toISOString(),
          requestedBy: input.userId,
        };
        await setPendingAction(scope, conversationId, pending).catch((err) =>
          logger.warn('chatAgent: setPendingAction failed', { error: err?.message }));

        emitter.emit('approval_request', {
          proposalId,
          conversationId,
          toolName: primary.toolName,
          args: primary.args,
          risk: pending.risk,
          preview,
          otherTools: risky.slice(1).map((tc) => tc.toolName),
        });
        // Do NOT persist the narration here: the interrupted turn lives in
        // pending_action and is persisted once, in full (text + tools), when
        // the loop resumes. Persisting now would duplicate it and produce two
        // adjacent assistant messages (an invalid history for the next turn).
        // Title now, from the real user message — the gate returns before the
        // normal title block, so otherwise the thread would stay "New conversation".
        if (!input.resume && (isNewConversation || (conversation.message_count ?? 0) < TITLE_THRESHOLD)) {
          await generateTitle(scope, conversationId, input.message, assistantText, emitter).catch(() => {});
        }
        await persistTurnTrace({
          turnId, conversationId, scope, startedAtMs: startedAt, executed: executedToolCalls, catalogByName,
          status: 'pending_approval', summary: `Aprobación pendiente: ${primary.toolName}`, approvalIds: [proposalId],
        });
        emitter.emit('done', { conversationId, finishReason: 'approval_pending', tokensUsed: totalTokens });
        return;
      }

      // ── No approval needed: execute this turn's tools ───────────────────
      const results = await executeToolCalls(result.toolCalls, execCtx);
      executedToolCalls.push(...results);
      for (const stored of results) {
        messages.push({
          role: 'tool_result',
          toolCallId: stored.toolCallId,
          // Fenced: tool results carry untrusted (customer-authored) content.
          content: wrapExternal('tool_result', serializeForModel(stored.result)),
          isError: !stored.ok,
        });
      }
    }

    // ── Persist assistant turn ─────────────────────────────────────────────
    await appendMessage(scope, conversationId, {
      role: 'assistant',
      content: assistantText,
      toolCalls: executedToolCalls.length ? executedToolCalls : undefined,
    }).catch((err) => logger.warn('chatAgent: persist assistant turn failed', { error: err?.message }));

    // Skip on resume — the title was set from the real user message at the
    // gate (or on the original completion).
    if (!input.resume && (isNewConversation || (conversation.message_count ?? 0) < TITLE_THRESHOLD)) {
      await generateTitle(scope, conversationId, input.message, assistantText, emitter)
        .catch((err) => logger.warn('chatAgent: title generation failed', { error: err?.message }));
    }

    // Audit trace for the whole turn (untruncated spans).
    const anyFail = executedToolCalls.some((t) => !t.ok);
    const traceStatus: ExecutionStatus =
      finishReason === 'max_iterations' ? 'partial' : anyFail ? 'partial' : 'success';
    await persistTurnTrace({
      turnId, conversationId, scope, startedAtMs: startedAt, executed: executedToolCalls, catalogByName,
      status: traceStatus, summary: assistantText || `Turno completado (${finishReason})`,
    });

    emitter.emit('done', { conversationId, finishReason, tokensUsed: totalTokens, text: assistantText });
  } catch (err) {
    if (err instanceof AICreditExhaustedError) {
      emitter.emit('done', {
        conversationId,
        finishReason: 'credit_exhausted',
        message: 'Se han agotado los créditos de IA de este workspace. Amplía tu plan o añade un top-up para seguir usando el agente.',
      });
    } else if (err instanceof ProviderNotConfiguredError) {
      emitter.emit('error', { message: err.message, code: err.code });
    } else {
      const message = (err as Error)?.message ?? 'Agent error';
      logger.error('chatAgent: unhandled error', { error: message, tenantId: input.tenantId, conversationId });
      emitter.emit('error', { message, code: 'AGENT_ERROR' });
    }
  } finally {
    emitter.close();
  }
}

// ── Tool execution ──────────────────────────────────────────────────────────

interface ToolExecContext {
  tenantId: string;
  workspaceId: string | null;
  userId: string | null;
  hasPermission: (perm: string) => boolean;
  conversationId: string;
  catalogByName: Map<string, CatalogEntry>;
  emitter: AgentSSEEmitter;
}

async function invokeOne(tc: ProviderToolCall, ctx: ToolExecContext): Promise<StoredToolCall> {
  const toolCallId = tc.id || randomUUID();
  ctx.emitter.emit('tool_start', { toolCallId, toolName: tc.toolName, args: tc.args });

  const started = Date.now();
  let stored: StoredToolCall;

  if (!ctx.catalogByName.has(tc.toolName) || !toolRegistry.get(tc.toolName)) {
    stored = {
      toolCallId, toolName: tc.toolName, args: tc.args,
      result: { error: TOOL_DOES_NOT_EXIST_PROMPT }, ok: false, durationMs: Date.now() - started,
    };
  } else {
    const invocation = await invokeTool({
      toolName: tc.toolName,
      args: tc.args,
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      hasPermission: ctx.hasPermission,
      planId: ctx.conversationId,
    });
    if (invocation.ok === true) {
      stored = { toolCallId, toolName: tc.toolName, args: tc.args, result: invocation.value, ok: true, durationMs: invocation.durationMs };
    } else {
      const failed = invocation as Extract<typeof invocation, { ok: false }>;
      stored = { toolCallId, toolName: tc.toolName, args: tc.args, result: { error: failed.error, errorCode: failed.errorCode }, ok: false, durationMs: failed.durationMs };
    }
  }

  ctx.emitter.emit('tool_result', {
    toolCallId,
    toolName: tc.toolName,
    ok: stored.ok,
    data: stored.result,
    durationMs: stored.durationMs,
    uiHint: getUiHint(tc.toolName, (tc.args ?? {}) as Record<string, unknown>, stored.result, stored.ok),
  });
  // Surface saved facts so the UI can toast them (PostHog's memory toast).
  if (tc.toolName === 'memory.append' && stored.ok) {
    const fact = (tc.args as Record<string, unknown>)?.fact;
    if (typeof fact === 'string') ctx.emitter.emit('memory_updated', { fact });
  }
  return stored;
}

/** Fan-out: parallel only when every call is a read; sequential if any write. */
async function executeToolCalls(toolCalls: ProviderToolCall[], ctx: ToolExecContext): Promise<StoredToolCall[]> {
  const allReads = toolCalls.every((tc) => ctx.catalogByName.get(tc.toolName)?.sideEffect === 'read');
  if (allReads) return Promise.all(toolCalls.map((tc) => invokeOne(tc, ctx)));
  const out: StoredToolCall[] = [];
  for (const tc of toolCalls) out.push(await invokeOne(tc, ctx));
  return out;
}

/** Resume: execute approved calls, or return a rejection result per call. */
async function resolveGatedToolCalls(
  requested: PendingAction['requestedToolCalls'],
  decision: 'approve' | 'reject',
  feedback: string | undefined,
  ctx: ToolExecContext,
): Promise<StoredToolCall[]> {
  const out: StoredToolCall[] = [];
  for (const req of requested) {
    const tc: ProviderToolCall = { id: req.toolCallId, toolName: req.toolName, args: (req.args ?? {}) as Record<string, unknown> };
    const needsApproval = APPROVAL_RISKS.has(req.risk);

    if (needsApproval && decision === 'reject') {
      const stored: StoredToolCall = {
        toolCallId: req.toolCallId,
        toolName: req.toolName,
        args: req.args,
        result: { ok: false, rejectedByUser: true, feedback: feedback ?? 'El usuario rechazó esta acción.' },
        ok: false,
        durationMs: 0,
        approvalStatus: 'rejected',
      };
      ctx.emitter.emit('tool_result', {
        toolCallId: req.toolCallId, toolName: req.toolName, ok: false,
        data: stored.result, durationMs: 0,
      });
      out.push(stored);
    } else {
      // Approved risky call, or a non-risky call bundled in the same turn.
      const stored = await invokeOne(tc, ctx);
      if (needsApproval) stored.approvalStatus = 'approved';
      out.push(stored);
    }
  }
  return out;
}

// ── Slash commands ────────────────────────────────────────────────────────────

const SLASH_HELP = [
  'Comandos disponibles:',
  '- `/status` — resumen de lo que está pasando ahora (colas, aprobaciones, riesgo, SLA, sin leer).',
  '- `/remember <información>` — guarda un dato en la memoria del equipo, disponible en todas las conversaciones futuras.',
  '- `/help` — muestra esta ayuda.',
  '- `/clear` — empieza una conversación nueva.',
  '',
  'Para todo lo demás, escríbeme con normalidad y usaré las herramientas del CRM.',
].join('\n');

/** Returns true if the message was a server-handled slash command. */
async function handleSlashCommand(opts: {
  message: string;
  scope: AgentScope;
  conversationId: string;
  tenantId: string;
  isNew: boolean;
  priorCount: number;
  emitter: AgentSSEEmitter;
}): Promise<boolean> {
  const trimmed = opts.message.trim();
  const respond = async (reply: string, title?: string) => {
    await appendMessage(opts.scope, opts.conversationId, { role: 'user', content: opts.message }).catch(() => {});
    opts.emitter.emit('text_chunk', { text: reply });
    await appendMessage(opts.scope, opts.conversationId, { role: 'assistant', content: reply }).catch(() => {});
    if (title && (opts.isNew || opts.priorCount < TITLE_THRESHOLD)) {
      await updateTitle(opts.scope, opts.conversationId, title).catch(() => {});
      opts.emitter.emit('title_generated', { conversationId: opts.conversationId, title });
    }
    opts.emitter.emit('done', { conversationId: opts.conversationId, finishReason: 'stop', tokensUsed: 0 });
  };

  if (trimmed === '/help') {
    await respond(SLASH_HELP, 'Ayuda');
    return true;
  }

  if (trimmed === '/status') {
    // Deterministic snapshot, no LLM spend.
    const situation = await assembleSituation(
      { tenantId: opts.tenantId, workspaceId: opts.scope.workspaceId ?? 'ws_default', userId: opts.scope.userId },
      { compact: true },
    ).catch(() => null);
    const reply = situation
      ? `**Estado del workspace ahora**\n\n${formatSituationForPrompt(situation)}`
      : 'No he podido reunir el estado del workspace ahora mismo.';
    await respond(reply, 'Estado del workspace');
    return true;
  }

  if (trimmed.startsWith('/remember')) {
    const fact = trimmed.slice('/remember'.length).trim();
    if (!fact) {
      await respond('Dime qué quieres que recuerde: `/remember <información>`.');
      return true;
    }
    await appendCoreMemory(opts.tenantId, fact).catch((err) =>
      logger.warn('chatAgent: /remember failed', { error: err?.message }));
    opts.emitter.emit('memory_updated', { fact });
    await respond(`Hecho. Lo recordaré: "${fact}".`, 'Nota de memoria');
    return true;
  }

  // Unknown slash command → let the model handle it conversationally.
  return false;
}

// ── Observability: per-turn execution trace (reuses super_agent_traces) ───────

function buildSpans(executed: StoredToolCall[], catalogByName: Map<string, CatalogEntry>): ExecutionSpan[] {
  const endBase = Date.now();
  return executed.map((tc) => ({
    stepId: tc.toolCallId,
    tool: tc.toolName,
    version: '1.0.0',
    startedAt: new Date(endBase - tc.durationMs).toISOString(),
    endedAt: new Date(endBase).toISOString(),
    latencyMs: tc.durationMs,
    args: tc.args,
    // Spans keep the UNTRUNCATED result (faithful audit), unlike the persisted
    // message (4KB) and the model-facing content (16KB).
    result: tc.ok
      ? { ok: true, value: tc.result }
      : { ok: false, error: (tc.result as any)?.error, errorCode: (tc.result as any)?.errorCode },
    riskLevel: (catalogByName.get(tc.toolName)?.risk ?? 'none') as RiskLevel,
    dryRun: false,
  }));
}

async function persistTurnTrace(opts: {
  turnId: string;
  conversationId: string;
  scope: AgentScope;
  startedAtMs: number;
  executed: StoredToolCall[];
  catalogByName: Map<string, CatalogEntry>;
  status: ExecutionStatus;
  summary: string;
  approvalIds?: string[];
}): Promise<void> {
  await persistTrace({
    planId: opts.turnId,
    sessionId: opts.conversationId,
    tenantId: opts.scope.tenantId,
    workspaceId: opts.scope.workspaceId,
    userId: opts.scope.userId,
    startedAt: new Date(opts.startedAtMs).toISOString(),
    endedAt: new Date().toISOString(),
    status: opts.status,
    spans: buildSpans(opts.executed, opts.catalogByName),
    summary: opts.summary.slice(0, 500),
    approvalIds: opts.approvalIds,
  });
}

// ── Approval preview (deterministic, no LLM) ──────────────────────────────────

function buildApprovalPreview(tc: ProviderToolCall, entry?: CatalogEntry): string {
  const label = entry?.description?.split('[')[0]?.trim() || tc.toolName;
  const argStr = summarizeArgs(tc.args);
  return argStr ? `Ejecutar «${label}» con ${argStr}` : `Ejecutar «${label}»`;
}

function summarizeArgs(args: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(args ?? {})) {
    if (v == null || typeof v === 'object') continue;
    parts.push(`${k}: ${String(v).slice(0, 60)}`);
    if (parts.length >= 4) break;
  }
  return parts.join(', ');
}

// ── Message (de)serialization helpers ─────────────────────────────────────────

function serializeForModel(value: unknown): string {
  let json: string;
  try {
    json = JSON.stringify(value) ?? 'null';
  } catch {
    json = String(value);
  }
  return json.length > TOOL_RESULT_MODEL_LIMIT
    ? `${json.slice(0, TOOL_RESULT_MODEL_LIMIT)}… [truncated — re-query with narrower filters for full detail]`
    : json;
}

/** ProviderMessage[] → JSONB-safe CheckpointMessage[] for pending_action. */
function providerToCheckpointMessages(messages: ProviderMessage[]): CheckpointMessage[] {
  return messages.map((m) => {
    if (m.role === 'assistant') {
      return {
        role: 'assistant',
        content: m.content,
        toolCalls: (m.toolCalls ?? []).map((tc) => ({ id: tc.id, toolName: tc.toolName, args: tc.args })),
        // Preserve raw content (extended-thinking blocks with signatures) so the
        // resumed turn replays it verbatim — Anthropic rejects a tool_use turn
        // that dropped its thinking block.
        _providerContent: m._providerContent,
      };
    }
    if (m.role === 'tool_result') {
      return { role: 'tool_result', content: m.content, toolCallId: m.toolCallId, isError: m.isError };
    }
    return { role: 'user', content: m.content };
  });
}

function checkpointToProviderMessages(messages: CheckpointMessage[]): ProviderMessage[] {
  return messages.map((m) => {
    if (m.role === 'assistant') {
      return { role: 'assistant', content: m.content, toolCalls: m.toolCalls, _providerContent: m._providerContent };
    }
    if (m.role === 'tool_result') {
      return { role: 'tool_result', content: m.content, toolCallId: m.toolCallId ?? '', isError: m.isError };
    }
    return { role: 'user', content: m.content };
  });
}

/**
 * Rebuild provider messages from persisted agent_messages rows. Assistant rows
 * with tool_calls expand into assistant(tool_use) + tool_result turns so the
 * model sees the same shape it originally produced (PostHog replays this from
 * LangGraph checkpoints; we replay from the message log).
 */
export function rebuildProviderHistory(
  rows: Array<{ role: 'user' | 'assistant'; content: string; tool_calls: StoredToolCall[] | null }>,
): ProviderMessage[] {
  const out: ProviderMessage[] = [];
  for (const row of rows) {
    if (row.role === 'user') {
      out.push({ role: 'user', content: row.content });
      continue;
    }
    const toolCalls = row.tool_calls ?? [];
    if (!toolCalls.length) {
      out.push({ role: 'assistant', content: row.content });
      continue;
    }
    out.push({
      role: 'assistant',
      content: row.content,
      toolCalls: toolCalls.map((tc) => ({
        id: tc.toolCallId,
        toolName: tc.toolName,
        args: (tc.args ?? {}) as Record<string, unknown>,
      })),
    });
    for (const tc of toolCalls) {
      out.push({ role: 'tool_result', toolCallId: tc.toolCallId, content: serializeForModel(tc.result), isError: !tc.ok });
    }
  }
  return out;
}

async function generateTitle(
  scope: AgentScope,
  conversationId: string,
  userMessage: string,
  assistantText: string,
  emitter: AgentSSEEmitter,
): Promise<void> {
  const utility = getUtilityProvider();
  const brief = `User: ${userMessage.slice(0, 500)}\nAssistant: ${assistantText.slice(0, 500)}`;

  const result = await Promise.race([
    utility.completeUtility({ system: TITLE_GENERATION_PROMPT, prompt: brief, maxTokens: 64 }),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), TITLE_TIMEOUT_MS)),
  ]);
  if (!result?.text) return;

  const title = result.text.trim().replace(/^["']|["']$/g, '').slice(0, 250);
  if (!title) return;

  await updateTitle(scope, conversationId, title);
  emitter.emit('title_generated', { conversationId, title });
}
