/**
 * server/pipeline/agentExecute.ts
 *
 * Job handler for AGENT_EXECUTE — execute a single named agent ad hoc.
 *
 * Enqueued by:
 *  - agentDelegates tools in the Plan Engine (draft-reply-agent, etc.)
 *  - POST /api/agents/:id/execute
 *
 * The payload carries the agentSlug and an `input` bag that must include
 * `caseId` for the runner to load the correct case context.
 */

import { runAgent } from '../agents/runner.js';
import { registerHandler } from '../queue/handlers/index.js';
import { JobType } from '../queue/types.js';
import { logger } from '../utils/logger.js';
import { requireScope } from '../lib/scope.js';
import type { AgentExecutePayload, JobContext } from '../queue/types.js';

async function handleAgentExecute(
  payload: AgentExecutePayload,
  ctx: JobContext,
): Promise<void> {
  const { agentSlug, agentId, input = {}, context: extraContext = {}, isTest = false } = payload;

  const slug = agentSlug || agentId;
  if (!slug) {
    logger.warn('AGENT_EXECUTE: missing agentSlug in payload', { jobId: ctx.jobId });
    return;
  }

  const caseId = typeof input.caseId === 'string' ? input.caseId : '';
  if (!caseId) {
    logger.warn('AGENT_EXECUTE: missing caseId in payload.input', { slug, jobId: ctx.jobId });
    return;
  }

  const { tenantId, workspaceId } = requireScope(ctx, 'agentExecute');

  logger.info('AGENT_EXECUTE: running agent', { slug, caseId, isTest });

  const result = await runAgent({
    agentSlug: slug,
    caseId,
    tenantId,
    workspaceId,
    triggerEvent: 'agent.execute',
    traceId: ctx.traceId ?? ctx.jobId,
    extraContext: { ...input, ...extraContext, isTest },
  });

  if (!result.success) {
    logger.warn('AGENT_EXECUTE: agent returned failure', { slug, caseId, error: result.error });
    // Don't throw — the job succeeded (agent ran), the agent just returned an error result
  }
}

registerHandler(JobType.AGENT_EXECUTE, handleAgentExecute);
