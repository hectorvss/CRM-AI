/**
 * server/routes/ai.ts
 *
 * AI-Assisted Operations API — Refactored to Repository Pattern.
 * This route handles agent execution, automated diagnosis, and draft generation.
 */

import { Router } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import { createAIRepository, createAgentRepository, createCaseRepository } from '../data/index.js';

const router = Router();
router.use(extractMultiTenant);

const aiRepository = createAIRepository();
const agentRepository = createAgentRepository();
const caseRepository = createCaseRepository();

// ── GET /api/ai/stats ─────────────────────────────────────────────────────────

router.get('/stats', requirePermission('audit.read'), async (req: MultiTenantRequest, res) => {
  try {
    const stats = await aiRepository.getStats({ tenantId: req.tenantId!, workspaceId: req.workspaceId! });
    res.json(stats);
  } catch (error) {
    console.error('AI stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/ai/diagnose/:caseId ─────────────────────────────────────────────

router.post('/diagnose/:caseId', requirePermission('cases.write'), async (req: MultiTenantRequest, res) => {
  try {
    const { caseId } = req.params;
    const { profile = 'standard' } = req.body;

    const caseData = await aiRepository.getCaseContextData({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, caseId);
    if (!caseData) {
      res.status(404).json({ error: 'Case not found' });
      return;
    }

    const jobId = enqueue(
      JobType.AI_DIAGNOSE,
      { caseId, profile },
      {
        tenantId: req.tenantId!,
        workspaceId: req.workspaceId!,
        traceId: `diag-${caseId}-${Date.now()}`,
        priority: 5,
      },
    );

    res.json({ ok: true, jobId, status: 'enqueued' });
  } catch (error) {
    console.error('AI diagnosis error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/ai/draft/:caseId ───────────────────────────────────────────────

router.post('/draft/:caseId', requirePermission('cases.write'), async (req: MultiTenantRequest, res) => {
  try {
    const { caseId } = req.params;
    const { profile = 'friendly', agentSlug } = req.body;

    const caseData = await aiRepository.getCaseContextData({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, caseId);
    if (!caseData) {
      res.status(404).json({ error: 'Case not found' });
      return;
    }

    const jobId = enqueue(
      JobType.AI_DRAFT,
      { caseId, profile, agentSlug },
      {
        tenantId: req.tenantId!,
        workspaceId: req.workspaceId!,
        traceId: `draft-${caseId}-${Date.now()}`,
        priority: 5,
      },
    );

    res.json({ ok: true, jobId, status: 'enqueued' });
  } catch (error) {
    console.error('AI draft error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/ai/runs/stats ────────────────────────────────────────────────────

router.get('/runs/stats', requirePermission('audit.read'), async (req: MultiTenantRequest, res) => {
  try {
    const stats = await aiRepository.getStats({ tenantId: req.tenantId!, workspaceId: req.workspaceId! });
    res.json(stats);
  } catch (error) {
    console.error('AI run stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
