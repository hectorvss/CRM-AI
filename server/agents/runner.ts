/**
 * server/agents/runner.ts
 *
 * Agent execution engine.
 *
 * The runner is the single entrypoint that hydrates runtime context, applies
 * the published control-plane profiles, injects filtered knowledge access, and
 * persists execution telemetry in the schema actually used by this repo.
 */

import { randomUUID } from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { getDb } from '../db/client.js';
import { config } from '../config.js';
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

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function loadPublishedVersion(db: any, agentRow: AgentRow): AgentVersionRow | undefined {
  const byCurrent = agentRow.current_version_id
    ? db.prepare('SELECT * FROM agent_versions WHERE id = ? AND status = ?')
        .get(agentRow.current_version_id, 'published') as AgentVersionRow | undefined
    : undefined;

  if (byCurrent) return byCurrent;

  const latestPublished = db.prepare(`
    SELECT *
    FROM agent_versions
    WHERE agent_id = ? AND status = 'published'
    ORDER BY version_number DESC, published_at DESC
    LIMIT 1
  `).get(agentRow.id) as AgentVersionRow | undefined;

  if (latestPublished && latestPublished.id !== agentRow.current_version_id) {
    try {
      db.prepare('UPDATE agents SET current_version_id = ? WHERE id = ?').run(latestPublished.id, agentRow.id);
    } catch {
      // Non-critical self-healing failure.
    }
  }

  return latestPublished;
}

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
    agentSlug,
    caseId,
    tenantId,
    workspaceId,
    triggerEvent,
    traceId = randomUUID(),
    extraContext = {},
  } = opts;

  const db = getDb();
  const runId = randomUUID();

  const agentRow = db.prepare(
    'SELECT * FROM agents WHERE slug = ? AND tenant_id = ? AND is_active = 1'
  ).get(agentSlug, tenantId) as AgentRow | undefined;

  if (!agentRow) {
    logger.warn('Agent not found or inactive', { agentSlug, tenantId });
    return { success: false, error: `Agent "${agentSlug}" not found or inactive` };
  }

  const versionRow = loadPublishedVersion(db, agentRow);
  if (!versionRow) {
    logger.warn('No published version for agent', { agentSlug, agentId: agentRow.id });
    return { success: false, error: `Agent "${agentSlug}" has no published version` };
  }

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
  const knowledgeProfile: KnowledgeProfile = safeJson<KnowledgeProfile>(versionRow.knowledge_profile, {});

  const contextWindow = buildContextWindow(caseId, tenantId);
  if (!contextWindow) {
    logger.warn('Could not build context window for case', { caseId, tenantId });
    return { success: false, error: `Case "${caseId}" not found` };
  }

  const knowledgeBundle = resolveAgentKnowledgeBundle({
    tenantId,
    workspaceId,
    knowledgeProfile,
    caseContext: {
      type: contextWindow.case.type,
      intent: contextWindow.case.intent,
      tags: contextWindow.case.tags,
      customerSegment: contextWindow.customer?.segment ?? null,
      conflictDomains: contextWindow.conflicts.map((conflict) => conflict.domain),
      latestMessage: contextWindow.messages.at(-1)?.content ?? null,
    },
  });

  const impl = getAgentImpl(agentSlug);

  const startedAt = new Date().toISOString();
  try {
    db.prepare(`
      INSERT INTO agent_runs
        (id, agent_id, agent_version_id, case_id, tenant_id,
         trigger_type, outcome_status, started_at)
      VALUES (?, ?, ?, ?, ?, ?, 'running', ?)
    `).run(
      runId,
      agentRow.id,
      versionRow.id,
      caseId,
      tenantId,
      triggerEvent,
      startedAt,
    );
  } catch (err) {
    logger.error('Failed to create agent_run row', { err, agentSlug, caseId });
  }

  const gemini = new GoogleGenerativeAI(config.ai.geminiApiKey);

  const ctx: AgentRunContext = {
    runId,
    agent: agentRow,
    permissions,
    reasoning,
    safety,
    knowledgeProfile,
    knowledgeBundle,
    contextWindow,
    gemini,
    tenantId,
    workspaceId,
    traceId,
    triggerEvent,
    extraContext,
  };

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

  const finishedAt = new Date().toISOString();
  const outcomeStatus = result.success ? 'completed' : 'failed';

  try {
    const evidenceRefs = result.output
      ? JSON.stringify(result.output)
      : result.summary
        ? JSON.stringify([{ summary: result.summary }])
        : null;

    db.prepare(`
      UPDATE agent_runs SET
        outcome_status = ?, confidence = ?, tokens_used = ?, cost_credits = ?,
        evidence_refs = ?, execution_decision = ?, error = ?, ended_at = ?
      WHERE id = ?
    `).run(
      outcomeStatus,
      result.confidence ?? null,
      result.tokensUsed ?? null,
      result.costCredits ?? null,
      evidenceRefs,
      result.success ? 'proceed' : 'blocked',
      result.error ?? null,
      finishedAt,
      runId,
    );
  } catch (err) {
    logger.error('Failed to update agent_run row', { err, runId });
  }

  if (result.costCredits && result.costCredits > 0) {
    try {
      const previousBalance = (db.prepare(`
        SELECT balance_after
        FROM credit_ledger
        WHERE org_id = ?
        ORDER BY occurred_at DESC
        LIMIT 1
      `).get(tenantId) as { balance_after: number } | undefined)?.balance_after ?? 0;

      const balanceAfter = previousBalance - result.costCredits;

      db.prepare(`
        INSERT INTO credit_ledger
          (id, org_id, tenant_id, entry_type, amount, reason, reference_id, balance_after, occurred_at)
        VALUES (?, ?, ?, 'debit', ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        tenantId,
        tenantId,
        result.costCredits,
        `Agent run: ${agentSlug}`,
        runId,
        balanceAfter,
        finishedAt,
      );
    } catch {
      // Non-critical billing telemetry failure.
    }
  }

  logger.info('Agent execution finished', {
    agentSlug,
    runId,
    outcomeStatus,
    confidence: result.confidence,
    tokens: result.tokensUsed,
  });

  return result;
}
