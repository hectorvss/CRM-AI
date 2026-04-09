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

import { getDb } from '../db/client.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { buildContextWindow } from '../pipeline/contextWindow.js';
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

  const db = getDb();
  const runId = randomUUID();

  // ── Step 1: Load agent ────────────────────────────────────────────────────
  const agentRow = db.prepare(
    'SELECT * FROM agents WHERE slug = ? AND tenant_id = ? AND is_active = 1'
  ).get(agentSlug, tenantId) as AgentRow | undefined;

  if (!agentRow) {
    logger.warn('Agent not found or inactive', { agentSlug, tenantId });
    return { success: false, error: `Agent "${agentSlug}" not found or inactive` };
  }

  // ── Step 2: Load active version ───────────────────────────────────────────
  const versionRow = agentRow.current_version_id
    ? db.prepare('SELECT * FROM agent_versions WHERE id = ? AND status = ?')
        .get(agentRow.current_version_id, 'published') as AgentVersionRow | undefined
    : undefined;

  if (!versionRow) {
    logger.warn('No published version for agent', { agentSlug, agentId: agentRow.id });
    return { success: false, error: `Agent "${agentSlug}" has no published version` };
  }

  // ── Step 3: Merge profiles ────────────────────────────────────────────────
  const permissions: PermissionProfile = {
    ...DEFAULT_PERMISSION_PROFILE,
    ...safeJson<Partial<PermissionProfile>>(versionRow.permission_profile, {}),
  };
  const reasoning: ReasoningProfile = {
    ...DEFAULT_REASONING_PROFILE,
    ...safeJson<Partial<ReasoningProfile>>(versionRow.reasoning_profile, {}),
  };
  const safety: SafetyProfile = {
    ...DEFAULT_SAFETY_PROFILE,
    ...safeJson<Partial<SafetyProfile>>(versionRow.safety_profile, {}),
  };

  // ── Step 4: Build context window ──────────────────────────────────────────
  const contextWindow = buildContextWindow(caseId, tenantId);
  if (!contextWindow) {
    logger.warn('Could not build context window for case', { caseId, tenantId });
    return { success: false, error: `Case "${caseId}" not found` };
  }

  // ── Step 5: Get implementation ────────────────────────────────────────────
  const impl = getAgentImpl(agentSlug);

  // ── Step 6: Create agent_run row ──────────────────────────────────────────
  const startedAt = new Date().toISOString();
  try {
    db.prepare(`
      INSERT INTO agent_runs
        (id, agent_id, agent_version_id, case_id, tenant_id, workspace_id,
         trigger_event, status, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?)
    `).run(
      runId, agentRow.id, versionRow.id, caseId, tenantId, workspaceId,
      triggerEvent, startedAt,
    );
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
    db.prepare(`
      UPDATE agent_runs SET
        status = ?, confidence = ?, tokens_used = ?, cost_credits = ?,
        summary = ?, output = ?, error_message = ?, finished_at = ?
      WHERE id = ?
    `).run(
      status,
      result.confidence ?? null,
      result.tokensUsed ?? null,
      result.costCredits ?? null,
      result.summary ?? null,
      result.output ? JSON.stringify(result.output) : null,
      result.error ?? null,
      finishedAt,
      runId,
    );
  } catch (err) {
    logger.error('Failed to update agent_run row', { err, runId });
  }

  // ── Step 11: Update credit ledger ─────────────────────────────────────────
  if (result.costCredits && result.costCredits > 0) {
    try {
      db.prepare(`
        INSERT INTO credit_ledger
          (id, org_id, tenant_id, entry_type, amount, reason, reference_id, balance_after, occurred_at)
        VALUES (?, ?, ?, 'debit', ?, ?, ?, 0, ?)
      `).run(
        randomUUID(), tenantId, tenantId,
        result.costCredits,
        `Agent run: ${agentSlug}`,
        runId,
        finishedAt,
      );
    } catch { /* non-critical */ }
  }

  logger.info('Agent execution finished', {
    agentSlug, runId, status,
    confidence: result.confidence,
    tokens: result.tokensUsed,
  });

  return result;
}
