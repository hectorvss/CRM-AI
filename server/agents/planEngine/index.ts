/**
 * server/agents/planEngine/index.ts
 *
 * Public facade for the Plan Engine.
 *
 * Responsibilities:
 *  1. Register all ToolSpecs at startup (idempotent).
 *  2. Manage conversational sessions (DB-backed, TTL-aware).
 *  3. Generate Plans via the LLM (Gemini), enforce policy, execute.
 *  4. Extract entity slots from results (CIL slot layer).
 *  5. Compress long sessions into L2 summaries.
 *  6. Persist execution traces.
 *
 * Shadow mode: when env SUPER_AGENT_LLM_ROUTING is not 'true', planAndExecute
 * still runs the LLM path and logs it, but returns the caller's chosen response.
 */

import { randomUUID } from 'node:crypto';
import { registerAllTools } from './tools/index.js';
import { toolRegistry } from './registry.js';
import { executePlan, type ExecutorDeps, type ExecuteOptions } from './executor.js';
import { getPlanEngineLLMProvider } from './llm.js';
import {
  createAuditRepository,
  createApprovalRepository,
  createAgentRepository,
  createKnowledgeRepository,
} from '../../data/index.js';
import { logger } from '../../utils/logger.js';
import * as sessionRepo from './sessionRepository.js';
import * as traceRepo from './traceRepository.js';
import { extractSlotsFromTrace, maybeCompressTurns } from './slots.js';
import { redactSensitiveText } from './safety.js';
import type {
  Plan,
  ExecutionTrace,
  SessionState,
  ToolExecutionContext,
  AuditEntry,
} from './types.js';
import type { PlanRequest, LLMResponse, AgentRuntimeConfig } from './llm.js';

export type { Plan, ExecutionTrace, SessionState, ToolExecutionContext };
export type { LLMResponse };

// ── Initialisation ───────────────────────────────────────────────────────────

let _initialised = false;

function ensureInitialised() {
  if (_initialised) return;
  registerAllTools();
  _initialised = true;
  logger.info(`PlanEngine initialised — ${toolRegistry.size()} tool(s) registered`);
}

// ── Repos ────────────────────────────────────────────────────────────────────

const auditRepoInst = createAuditRepository();
const approvalRepoInst = createApprovalRepository();
const agentRepoInst = createAgentRepository();
const knowledgeRepoInst = createKnowledgeRepository();

// ── Executor dependencies ────────────────────────────────────────────────────

function buildExecutorDeps(): ExecutorDeps {
  return {
    async createApproval({ plan, step, decision, context }) {
      const scope = {
        tenantId: context.tenantId,
        workspaceId: context.workspaceId ?? '',
        userId: context.userId ?? undefined,
      };
      const approval = await approvalRepoInst.create(scope, {
        caseId: null,
        actionType: step.tool,
        actionPayload: { args: step.args, planId: plan.planId },
        riskLevel: decision.riskLevel,
        priority: decision.riskLevel === 'critical' ? 'critical' : 'high',
        requestedBy: context.userId ?? 'system',
        requestedByType: 'human',
        evidencePackage: {
          summary: `Plan ${plan.planId} step ${step.id}: ${step.tool} — ${decision.reason}`,
        },
      });
      return (approval as any).id;
    },

    async persistTrace(trace) {
      traceRepo.persistTrace(trace);
    },
  };
}

function buildAuditSink(tenantId: string, workspaceId: string | null, userId: string | null) {
  return async (entry: AuditEntry) => {
    try {
      await auditRepoInst.log({
        tenantId,
        workspaceId: workspaceId ?? undefined,
        actorId: userId ?? 'system',
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        oldValue: entry.oldValue,
        newValue: entry.newValue,
        metadata: entry.metadata,
      });
    } catch (err) {
      logger.warn('PlanEngine audit log failed', { error: String(err) });
    }
  };
}

// ── Agent config loader ───────────────────────────────────────────────────────
//
// Reads the agent's active agent_versions row (from AI Studio edits) and
// builds an AgentRuntimeConfig to pass to the LLM provider. This is how
// AI Studio's Reasoning / Safety / Knowledge tabs affect Plan Engine behaviour.

async function loadAgentRuntimeConfig(
  tenantId: string,
  workspaceId: string | null,
  agentId: string,
): Promise<AgentRuntimeConfig> {
  try {
    const scope = {
      tenantId,
      workspaceId: workspaceId ?? 'ws_default',
      userId: undefined,
    };
    const agent = await agentRepoInst.getEffectiveAgent(scope, agentId);
    if (!agent) return {};

    const reasoning = agent.reasoning_profile && typeof agent.reasoning_profile === 'object'
      ? agent.reasoning_profile as Record<string, any>
      : {};
    const safety = agent.safety_profile && typeof agent.safety_profile === 'object'
      ? agent.safety_profile as Record<string, any>
      : {};
    const knowledge = agent.knowledge_profile && typeof agent.knowledge_profile === 'object'
      ? agent.knowledge_profile as Record<string, any>
      : {};
    const permissions = agent.permission_profile && typeof agent.permission_profile === 'object'
      ? agent.permission_profile as Record<string, any>
      : {};

    // Fetch knowledge snippets when the profile specifies domains
    let knowledgeSnippets: AgentRuntimeConfig['knowledgeSnippets'] = [];
    const domainIds: string[] = Array.isArray(knowledge.domains) ? knowledge.domains : [];
    const maxArticles = typeof knowledge.maxArticles === 'number' ? knowledge.maxArticles : 8;
    if (domainIds.length > 0) {
      try {
        const articles = await knowledgeRepoInst.listArticles(
          { tenantId, workspaceId: workspaceId ?? 'ws_default' },
          { domain_id: domainIds[0], status: 'published' }, // search first domain; extend later
        );
        knowledgeSnippets = articles.slice(0, maxArticles).map((a: any) => ({
          title: a.title ?? 'Knowledge article',
          excerpt: typeof a.content === 'string'
            ? a.content.slice(0, 400) + (a.content.length > 400 ? '…' : '')
            : '',
        }));
      } catch (err) {
        logger.warn('PlanEngine: failed to load knowledge snippets', { error: String(err) });
      }
    }

    return {
      model: reasoning.model || undefined,
      temperature: typeof reasoning.temperature === 'number' ? reasoning.temperature : undefined,
      maxOutputTokens: typeof reasoning.maxOutputTokens === 'number' ? reasoning.maxOutputTokens : undefined,
      personaOverride: typeof reasoning.persona === 'string' ? reasoning.persona : undefined,
      safetyInstructions: typeof safety.additionalInstructions === 'string'
        ? safety.additionalInstructions
        : undefined,
      blockedTools: Array.isArray(safety.blockedTools) ? safety.blockedTools : undefined,
      allowedTools: Array.isArray(permissions.allowedTools) ? permissions.allowedTools : undefined,
      knowledgeSnippets: knowledgeSnippets.length > 0 ? knowledgeSnippets : undefined,
    };
  } catch (err) {
    logger.warn('PlanEngine: failed to load agent runtime config', { agentId, error: String(err) });
    return {};
  }
}

// ── LLM summarizer (used by L2 compressor) ───────────────────────────────────

async function llmSummarize(prompt: string): Promise<string> {
  const provider = getPlanEngineLLMProvider();
  // Re-use the summarizeResult method with a single pseudo-step
  return provider.summarizeResult({
    userMessage: redactSensitiveText(prompt),
    steps: [],
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface PlanEngineGenerateInput {
  userMessage: string;
  sessionId: string;
  userId: string;
  tenantId: string;
  workspaceId: string | null;
  hasPermission: (perm: string) => boolean;
  domainContext?: unknown;
  /**
   * Agent ID or slug whose AI Studio configuration should drive this run.
   * Defaults to "supervisor" — the primary Plan Engine agent.
   * AI Studio sets this by navigating to Agents → [agent] → Reasoning/Safety/Knowledge.
   */
  agentId?: string;
}

export interface PlanEngineExecuteInput {
  plan: Plan;
  userId: string;
  tenantId: string;
  workspaceId: string | null;
  hasPermission: (perm: string) => boolean;
  options?: ExecuteOptions;
}

export const planEngine = {
  init() {
    ensureInitialised();
  },

  /**
   * Generate a Plan (or clarification) from a user message via Gemini.
   * Appends the user turn to the session. Does NOT execute.
   */
  async generate(input: PlanEngineGenerateInput): Promise<LLMResponse> {
    ensureInitialised();

    const session = sessionRepo.getOrCreateSession(
      input.sessionId,
      input.userId,
      input.tenantId,
      input.workspaceId,
    );

    const planId = randomUUID();
    const availableTools = toolRegistry.listForCaller(input.hasPermission);

    // Load AI Studio configuration for this agent (non-blocking — falls back to defaults)
    const agentId = input.agentId ?? 'supervisor';
    const agentConfig = await loadAgentRuntimeConfig(input.tenantId, input.workspaceId, agentId);

    const req: PlanRequest = {
      userMessage: input.userMessage,
      session: {
        id: session.id,
        turns: session.turns,
        summary: session.summary,
        slots: session.slots,
        pendingApprovalIds: session.pendingApprovalIds,
      },
      availableTools,
      domainContext: input.domainContext,
      planId,
      agentConfig,
    };

    const response = await getPlanEngineLLMProvider().generatePlan(req);

    // Append user turn
    session.turns.push({
      role: 'user',
      content: input.userMessage,
      createdAt: new Date().toISOString(),
      planId: response.kind === 'plan' ? response.plan.planId : undefined,
    });

    // Maybe compress L1 → L2
    await maybeCompressTurns(session, llmSummarize);

    sessionRepo.saveSession(session);
    return response;
  },

  /**
   * Execute a validated Plan. Returns the execution trace.
   */
  async execute(input: PlanEngineExecuteInput): Promise<ExecutionTrace> {
    ensureInitialised();

    const context: ToolExecutionContext = {
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      hasPermission: input.hasPermission,
      planId: input.plan.planId,
      audit: buildAuditSink(input.tenantId, input.workspaceId, input.userId),
      dryRun: input.options?.dryRun === true,
    };

    const deps = buildExecutorDeps();
    return executePlan(input.plan, context, deps, input.options);
  },

  /**
   * Full pipeline: generate → policy → execute. Common call pattern.
   *
   * Shadow mode (default): always runs the LLM path but logs results without
   * affecting the existing /command route. Set env SUPER_AGENT_LLM_ROUTING=true
   * to make this the primary path.
   */
  async planAndExecute(
    input: PlanEngineGenerateInput,
    execOptions?: ExecuteOptions,
  ): Promise<{ response: LLMResponse; trace?: ExecutionTrace }> {
    const response = await planEngine.generate(input);

    if (response.kind !== 'plan') {
      // Append assistant clarification/error to session
      const session = sessionRepo.getSession(input.sessionId);
      if (session) {
        session.turns.push({
          role: 'assistant',
          content: response.kind === 'clarification' ? response.question : response.error,
          createdAt: new Date().toISOString(),
        });
        sessionRepo.saveSession(session);
      }
      return { response };
    }

    const trace = await planEngine.execute({
      plan: response.plan,
      userId: input.userId,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      hasPermission: input.hasPermission,
      options: execOptions,
    });

    // Append assistant response + extract slots
    const session = sessionRepo.getSession(input.sessionId);
    if (session) {
      session.turns.push({
        role: 'assistant',
        content: trace.summary,
        createdAt: new Date().toISOString(),
        planId: response.plan.planId,
      });

      // Populate entity slots from execution results
      extractSlotsFromTrace(session, trace);

      // Activate plan id on session for pending-approval continuations
      if (trace.status === 'pending_approval') {
        session.activePlanId = response.plan.planId;
        session.pendingApprovalIds = [
          ...session.pendingApprovalIds,
          ...(trace.approvalIds ?? []),
        ];
      }

      sessionRepo.saveSession(session);
    }

    return { response, trace };
  },

  /** Retrieve a session by id (for debug / history routes). */
  getSession(sessionId: string): SessionState | null {
    return sessionRepo.getSession(sessionId);
  },

  /** Retrieve an execution trace by plan id. */
  getTrace(planId: string) {
    return traceRepo.getTrace(planId);
  },

  /** List traces for a session. */
  listTraces(sessionId: string, limit?: number) {
    return traceRepo.listTracesForSession(sessionId, limit);
  },

  /** Aggregate trace metrics for observability dashboards. */
  getMetrics(sessionId?: string) {
    return traceRepo.getTraceMetrics(sessionId);
  },

  /** Tool catalog (for observability and admin). */
  catalog: {
    list: () => toolRegistry.listAll(),
    listForCaller: (hasPermission: (p: string) => boolean) =>
      toolRegistry.listForCaller(hasPermission),
  },
};
