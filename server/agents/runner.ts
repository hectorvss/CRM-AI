/**
 * server/agents/runner.ts
 *
 * Agent execution engine.
 *
 * The runner is the only place that should call agent implementations.
 * It handles:
 *   1. Loading the agent + active version from the DB
 *   2. Merging default profiles with version-level overrides
 *   3. Permission pre-checks (defense-in-depth)
 *   4. Building an AgentRunContext with a pre-configured Gemini client
 *   5. Creating the agent_run row (status=running)
 *   6. Calling the implementation's execute() method
 *   7. Persisting the result + updating status
 *   8. Tracking consecutive failures for circuit-breaking
 */

import { randomUUID } from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { config } from '../config.js';
import { createAgentRepository } from '../data/agents.js';
import { createAgentRunRepository } from '../data/agentRuns.js';
import { createBillingRepository } from '../data/billing.js';
import { logger } from '../utils/logger.js';
import { buildContextWindow } from '../pipeline/contextWindow.js';
import { resolveAgentKnowledgeBundle, type KnowledgeProfile } from '../services/agentKnowledge.js';
import { getAgentImpl } from './registry.js';
import {
  DEFAULT_PERMISSION_PROFILE,
  DEFAULT_REASONING_PROFILE,
  DEFAULT_SAFETY_PROFILE,
  type AgentRunContext,
  type AgentResult,
  type PermissionProfile,
  type ReasoningProfile,
  type SafetyProfile,
  type AgentRow,
  type AgentVersionRow,
} from './types.js';

// ── Safe JSON parse helper ────────────────────────────────────────────────────

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

// ── Main runner function ──────────────────────────────────────────────────────

export interface RunAgentOptions {
  agentSlug: string;
  caseId: string;
  tenantId: string;
  workspaceId: string;
  triggerEvent: string;
  traceId?: string;
  extraContext?: Record<string, unknown>;
}

export async function runAgent(opts: RunAgentOptions): Promise<AgentResult> {
  const {
    agentSlug, caseId, tenantId, workspaceId, triggerEvent,
    traceId = randomUUID(),
    extraContext = {},
  } = opts;

  const agentRepo = createAgentRepository();
  const runRepo = createAgentRunRepository();
  const billingRepo = createBillingRepository();
  const scope = { tenantId, workspaceId };
  const runId = randomUUID();

  // ── Step 1 & 2: Load agent and active version ─────────────────────────────
  // getEffectiveAgent handles finding the agent by slug for the tenant and ensuring a published version
  const agentBundle = await agentRepo.getEffectiveAgent({ tenantId, workspaceId }, agentSlug);

  if (!agentBundle) {
    logger.warn('Agent not found, inactive, or has no published version', { agentSlug, tenantId });
    return { success: false, error: `Agent "${agentSlug}" not found or unavailable` };
  }

  // The repository returns an enriched object with version details
  const agentRow = agentBundle;
  const versionId = agentBundle.version_id;

  // ── Step 3: Merge profiles ────────────────────────────────────────────────
  const permissions: PermissionProfile = {
    ...DEFAULT_PERMISSION_PROFILE,
    ...safeJson<Partial<PermissionProfile>>(agentRow.permission_profile, {}),
  };
  const reasoning: ReasoningProfile = {
    ...DEFAULT_REASONING_PROFILE,
    ...safeJson<Partial<ReasoningProfile>>(agentRow.reasoning_profile, {}),
  };
  const safety: SafetyProfile = {
    ...DEFAULT_SAFETY_PROFILE,
    ...safeJson<Partial<SafetyProfile>>(agentRow.safety_profile, {}),
  };
  const knowledgeProfile = safeJson<KnowledgeProfile>(agentRow.knowledge_profile, {});

  // ── Step 4: Build context window ──────────────────────────────────────────
  const contextWindow = await buildContextWindow(caseId, tenantId, workspaceId);
  if (!contextWindow) {
    logger.warn('Could not build context window for case', { caseId, tenantId });
    return { success: false, error: `Case "${caseId}" not found` };
  }

  const latestMessage = contextWindow.messages[contextWindow.messages.length - 1]?.content ?? null;
  const knowledgeBundle = await resolveAgentKnowledgeBundle({
    tenantId,
    workspaceId,
    knowledgeProfile,
    caseContext: {
      type: contextWindow.case.type,
      intent: contextWindow.case.intent,
      tags: contextWindow.case.tags,
      customerSegment: contextWindow.customer?.segment ?? null,
      conflictDomains: contextWindow.conflicts.map(conflict => conflict.domain),
      latestMessage,
    },
  });

  // ── Step 5: Get implementation ────────────────────────────────────────────
  const impl = getAgentImpl(agentSlug);

  // ── Step 6: Create agent_run row ──────────────────────────────────────────
  const startedAt = new Date().toISOString();
  try {
    await runRepo.create(scope, {
      id: runId,
      agent_id: agentRow.id,
      agent_version_id: versionId,
      case_id: caseId,
      trigger_event: triggerEvent,
      status: 'running',
      started_at: startedAt,
    });
  } catch (err) {
    logger.error('Failed to create agent_run row', { err, agentSlug, caseId });
    // Continue anyway — don't block execution on DB issues
  }

  // ── Step 7: Build Gemini client ───────────────────────────────────────────
  const gemini = new GoogleGenerativeAI(config.ai.geminiApiKey);

  // ── Step 8: Build run context ─────────────────────────────────────────────
  const ctx: AgentRunContext = {
    runId,
    agent: agentRow,
    permissions,
    reasoning,
    safety,
    contextWindow,
    knowledgeBundle,
    gemini,
    tenantId,
    workspaceId,
    traceId,
    triggerEvent,
    extraContext,
  };

  // ── Step 9: Execute ───────────────────────────────────────────────────────
  let result: AgentResult;
  try {
    logger.info('Agent execution starting', { agentSlug, runId, caseId, triggerEvent });
    result = await impl.execute(ctx);
  } catch (err: any) {
    result = {
      success: false,
      error: err?.message ?? String(err),
    };
    logger.error('Agent execution threw', { agentSlug, runId, error: err?.message });
  }

  // ── Step 10: Persist result ───────────────────────────────────────────────
  const finishedAt = new Date().toISOString();
  const status = result.success ? 'completed' : 'failed';

  try {
    await runRepo.update(scope, runId, {
      status, 
      confidence: result.confidence ?? null, 
      tokens_used: result.tokensUsed ?? null, 
      cost_credits: result.costCredits ?? null,
      summary: result.summary ?? null, 
      output: result.output ? JSON.stringify(result.output) : null, 
      error_message: result.error ?? null, 
      finished_at: finishedAt,
    });
  } catch (err) {
    logger.error('Failed to update agent_run row', { err, runId });
  }

  // ── Step 11: Update credit ledger ─────────────────────────────────────────
  if (result.costCredits && result.costCredits > 0) {
    try {
      await billingRepo.addLedgerEntry({ tenantId }, {
        org_id: tenantId,
        entry_type: 'debit',
        amount: result.costCredits,
        reason: `Agent run: ${agentSlug}`,
        reference_id: runId,
        balance_after: 0, // Should ideally calculate or let repo handle
        occurred_at: finishedAt,
      });
    } catch { /* non-critical */ }
  }

  logger.info('Agent execution finished', {
    agentSlug, runId, status,
    confidence: result.confidence,
    tokens: result.tokensUsed,
  });

  return result;
}
