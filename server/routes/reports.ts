/**
 * server/routes/reports.ts
 *
 * Reports & KPI API — Refactored to Repository Pattern.
 */

import { Router, Request, Response } from 'express';
import { createReportRepository } from '../data/index.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';

const router = Router();
router.use(extractMultiTenant);

const reportRepository = createReportRepository();

// ── GET /api/reports/overview ─────────────────────────────────────────────────

router.get('/overview', async (req: MultiTenantRequest, res: Response) => {
  try {
    const period = String(req.query.period ?? '30d');
    const overview = await reportRepository.getOverview({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!
    }, period);
    res.json(overview);
  } catch (error) {
    console.error('Reports overview error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/reports/intents ──────────────────────────────────────────────────

router.get('/intents', async (req: MultiTenantRequest, res: Response) => {
  try {
    const period = String(req.query.period ?? '30d');
    const intents = await reportRepository.getIntents({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!
    }, period);
    res.json(intents);
  } catch (error) {
    console.error('Reports intents error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/reports/agents ───────────────────────────────────────────────────

router.get('/agents', async (req: MultiTenantRequest, res: Response) => {
  try {
    const period = String(req.query.period ?? '30d');
    const agents = await reportRepository.getAgents({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!
    }, period);
    res.json(agents);
  } catch (error) {
    console.error('Reports agents error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/reports/approvals ────────────────────────────────────────────────

router.get('/approvals', async (req: MultiTenantRequest, res: Response) => {
  try {
    const period = String(req.query.period ?? '30d');
    const approvals = await reportRepository.getApprovals({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!
    }, period);
    res.json(approvals);
  } catch (error) {
    console.error('Reports approvals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/reports/costs ───────────────────────────────────────────────────

router.get('/costs', async (req: MultiTenantRequest, res: Response) => {
  try {
    const period = String(req.query.period ?? '30d');
    const costs = await reportRepository.getCosts({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!
    }, period);
    res.json(costs);
  } catch (error) {
    console.error('Reports costs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/reports/sla ──────────────────────────────────────────────────────

router.get('/sla', async (req: MultiTenantRequest, res: Response) => {
  try {
    const period = String(req.query.period ?? '30d');
    const sla = await reportRepository.getSLA({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!
    }, period);
    res.json(sla);
  } catch (error) {
    console.error('Reports sla error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
