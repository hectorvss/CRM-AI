/**
 * server/agents/planEngine/index.ts
 *
 * Public facade for the Plan Engine.
 *
 * Import this file once at server startup (e.g. from server/index.ts) to:
 *  1. Register all ToolSpecs into the global toolRegistry.
 *  2. Expose `planEngine.plan()` — generate a Plan from a user message (dry-run safe).
 *  3. Expose `planEngine.execute()` — execute a validated Plan.
 *  4. Expose `planEngine.planAndExecute()` — convenience wrapper.
 *
 * Nothing outside this file needs to import from sub-modules.
 */

import { randomUUID } from 'node:crypto';
import { registerAllTools } from './tools/index.js';
import { toolRegistry } from './registry.js';
import { executePlan, type ExecutorDeps, type ExecuteOptions } from './executor.js';
import { getPlanEngineLLMProvider } from './llm.js';
import { createAuditRepository, createApprovalRepository } from '../../data/index.js';
import { logger } from '../../utils/logger.js';
import type {
  Plan,
  ExecutionTrace,
  SessionState,
  ToolExecutionContext,
  AuditEntry,
} from './types.js';
import type { PlanRequest, LLMResponse } from './llm.js';

export type { Plan, ExecutionTrace, SessionState, ToolExecutionContext };
export type { LLMResponse };

// ── One-time initialisation ──────────────────────────────────────────────────

let _initialised = false;

function ensureInitialised() {
  if (_initialised) return;
  registerAllTools();
  _initialised = true;
  logger.info(`PlanEngine initialised — ${toolRegistry.size()} tool(s) registered`);
}

// ── Repo deps (lazy — avoids import-time DB connection) ─────────────────────

const auditRepo = createAuditRepository();
const approvalRepo = createApprovalRepository();

// ── Session store (in-memory stub — swap for DB-backed version in Phase 2) ──

const sessionStore = new Map<string, SessionState>();

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

function getOrCreateSession(
  sessionId: string,
  userId: string,
  tenantId: string,
  workspaceId: string | null,
): SessionState {
  const existing = sessionStore.get(sessionId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const session: SessionState = {
    id: sessionId,
    userId,
    tenantId,
    workspaceId,
    turns: [],
    summary: '',
    slots: {},
    pendingApprovalIds: [],
    createdAt: now,
    updatedAt: now,
    ttlAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };
  sessionStore.set(sessionId, session);
  return session;
}

function persistSession(session: SessionState): void {
  session.updatedAt = new Date().toISOString();
  sessionStore.set(session.id, session);
}

// ── Executor dependencies ────────────────────────────────────────────────────

function buildExecutorDeps(tenantId: string, workspaceId: string | null): ExecutorDeps {
  return {
    async createApproval({ plan, step, decision, context }) {
      const scope = {
        tenantId: context.tenantId,
        workspaceId: context.workspaceId ?? '',
        userId: context.userId ?? undefined,
      };
      const approval = await approvalRepo.create(scope, {
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
      return approval.id;
    },

    async persistTrace(trace) {
      // TODO (Phase 2): write to super_agent_traces table
      logger.debug('PlanEngine trace', {
        planId: trace.planId,
        status: trace.status,
        spans: trace.spans.length,
      });
    },
  };
}

function buildAuditSink(tenantId: string, workspaceId: string | null, userId: string | null) {
  return async (entry: AuditEntry) => {
    await auditRepo.log({
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
  };
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
  /**
   * Initialise the engine. Safe to call multiple times (idempotent).
   * Must be called before any other method.
   */
  init() {
    ensureInitialised();
  },

  /**
   * Generate a Plan (or clarification) from a user message, using the
   * configured LLM provider.
   *
   * Does NOT execute. Use `execute()` or `planAndExecute()` for that.
   */
  async generate(input: PlanEngineGenerateInput): Promise<LLMResponse> {
    ensureInitialised();

    const session = getOrCreateSession(
      input.sessionId,
      input.userId,
      input.tenantId,
      input.workspaceId,
    );

    const planId = randomUUID();
    const availableTools = toolRegistry.listForCaller(input.hasPermission);

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
    };

    const response = await getPlanEngineLLMProvider().generatePlan(req);

    // Append user turn to session
    session.turns.push({
      role: 'user',
      content: input.userMessage,
      createdAt: new Date().toISOString(),
      planId: response.kind === 'plan' ? response.plan.planId : undefined,
    });

    // Trim L1 to last 20 turns
    if (session.turns.length > 20) {
      session.turns = session.turns.slice(-20);
    }

    persistSession(session);

    return response;
  },

  /**
   * Execute a validated Plan.
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

    const deps = buildExecutorDeps(input.tenantId, input.workspaceId);
    return executePlan(input.plan, context, deps, input.options);
  },

  /**
   * Generate and immediately execute. The most common call pattern.
   * If the LLM returns a clarification, returns it without executing.
   */
  async planAndExecute(
    input: PlanEngineGenerateInput,
    execOptions?: ExecuteOptions,
  ): Promise<{ response: LLMResponse; trace?: ExecutionTrace }> {
    const response = await planEngine.generate(input);

    if (response.kind !== 'plan') {
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

    // Append assistant response to session
    const session = sessionStore.get(input.sessionId);
    if (session) {
      session.turns.push({
        role: 'assistant',
        content: trace.summary,
        createdAt: new Date().toISOString(),
        planId: response.plan.planId,
      });
      persistSession(session);
    }

    return { response, trace };
  },

  /** Expose the tool registry for observability / admin routes. */
  catalog: {
    list: () => toolRegistry.listAll(),
    listForCaller: (hasPermission: (p: string) => boolean) =>
      toolRegistry.listForCaller(hasPermission),
  },
};
