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
import { toolRegistry } from '../planEngine/registry.js';
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
const TIME_BUDGET_MS = 55_000;
/** Max chars of a tool result fed back to the model per call. */
const TOOL_RESULT_MODEL_LIMIT = 16_000;
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
    const [coreMemory, catalog] = await Promise.all([
      getCoreMemory(input.tenantId).catch(() => null),
      Promise.resolve(selectToolkit({
        hasPermission: input.hasPermission,
        surface: input.surface ?? 'operator',
        maxRisk: 'critical',
      })),
    ]);
    const { tools, resolveToolName } = adaptToolkit(catalog);
    const catalogByName = new Map(catalog.map((entry) => [entry.name, entry]));
    const system = buildChatSystemPrompt({
      uiContext: input.uiContext,
      coreMemory,
      toolCount: tools.length,
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
          content: serializeForModel(stored.result),
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
      });

      totalTokens += result.usage.inputTokens + result.usage.outputTokens;
      chargeFor(result.model, result.usage.inputTokens, result.usage.outputTokens, iteration);

      if (result.text) assistantText += (assistantText ? '\n\n' : '') + result.text;
      if (!result.toolCalls.length || outOfBudget) break;

      messages.push({ role: 'assistant', content: result.text, toolCalls: result.toolCalls });

      // ── Approval gate ────────────────────────────────────────────────────
      const risky = result.toolCalls.filter(
        (tc) => APPROVAL_RISKS.has(catalogByName.get(tc.toolName)?.risk ?? 'none'),
      );
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
            risk: catalogByName.get(tc.toolName)?.risk ?? 'none',
          })),
          primaryToolName: primary.toolName,
          primaryArgs: primary.args,
          risk: catalogByName.get(primary.toolName)?.risk ?? 'high',
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
          content: serializeForModel(stored.result),
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
      return { role: 'assistant', content: m.content, toolCalls: m.toolCalls };
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
