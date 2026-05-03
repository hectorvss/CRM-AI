/**
 * server/pipeline/aiJobs.ts
 *
 * Job handlers for AI_DIAGNOSE and AI_DRAFT.
 *
 * AI_DIAGNOSE — Enqueued by POST /api/ai/diagnose/:caseId
 *   Triggers the full case reconciliation + conflict-detection pipeline
 *   by firing AGENT_TRIGGER with the `conflicts_detected` routing table
 *   so reconciliation-agent, approval-gatekeeper, and fraud-detector all run.
 *
 * AI_DRAFT — Enqueued by POST /api/ai/draft/:caseId
 *   Delegates to the existing DRAFT_REPLY handler logic (same pipeline,
 *   different entry point). Tone is derived from the `profile` field if
 *   not explicitly set.
 */

import { enqueue } from '../queue/client.js';
import { registerHandler } from '../queue/handlers/index.js';
import { JobType } from '../queue/types.js';
import { logger } from '../utils/logger.js';
import { runAgent } from '../agents/runner.js';
import type { AiDiagnosePayload, AiDraftPayload, JobContext } from '../queue/types.js';

// ── AI_DIAGNOSE ───────────────────────────────────────────────────────────────

async function handleAiDiagnose(
  payload: AiDiagnosePayload,
  ctx: JobContext,
): Promise<void> {
  const { caseId } = payload;

  logger.info('AI_DIAGNOSE: triggering reconciliation pipeline', { caseId, traceId: ctx.traceId });

  // Trigger the full conflicts_detected chain (reconciliation-agent, fraud-detector,
  // approval-gatekeeper, etc.) so that diagnosis is comprehensive.
  await enqueue(
    JobType.AGENT_TRIGGER,
    {
      triggerEvent: 'conflicts_detected',
      caseId,
    },
    {
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId ?? undefined,
      traceId: ctx.traceId ?? `diag-${caseId}`,
      priority: 5,
    },
  );
}

// ── AI_DRAFT ──────────────────────────────────────────────────────────────────

const PROFILE_TO_TONE: Record<string, 'professional' | 'friendly' | 'empathetic'> = {
  professional: 'professional',
  friendly:     'friendly',
  empathetic:   'empathetic',
  formal:       'professional',
  casual:       'friendly',
  supportive:   'empathetic',
};

async function handleAiDraft(
  payload: AiDraftPayload,
  ctx: JobContext,
): Promise<void> {
  const { caseId, profile = 'professional', tone } = payload;

  const resolvedTone: 'professional' | 'friendly' | 'empathetic' =
    (tone as any) || PROFILE_TO_TONE[profile] || 'professional';

  logger.info('AI_DRAFT: delegating to DRAFT_REPLY pipeline', { caseId, tone: resolvedTone });

  // Enqueue a DRAFT_REPLY job — which has the full implementation in draftReply.ts.
  // This avoids duplicating logic and ensures both entry points use the same pipeline.
  await enqueue(
    JobType.DRAFT_REPLY,
    { caseId, tone: resolvedTone },
    {
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId ?? undefined,
      traceId: ctx.traceId ?? `draft-${caseId}`,
      priority: 5,
    },
  );
}

registerHandler(JobType.AI_DIAGNOSE, handleAiDiagnose);
registerHandler(JobType.AI_DRAFT,    handleAiDraft);
