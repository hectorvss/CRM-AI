import { Router, Request, Response } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { sendError } from '../http/errors.js';
import { createReportRepository } from '../data/index.js';

const router = Router();
const reportRepo = createReportRepository();

router.use(extractMultiTenant);

router.get('/overview', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const period = String(req.query.period ?? '30d');
    const data = await reportRepo.getOverview(scope, period);
    res.json(data);
  } catch (error) {
    console.error('Error fetching overview report:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get('/intents', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const period = String(req.query.period ?? '30d');
    const data = await reportRepo.getIntents(scope, period);
    res.json(data);
  } catch (error) {
    console.error('Error fetching intents report:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get('/agents', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const period = String(req.query.period ?? '30d');
    const data = await reportRepo.getAgents(scope, period);
    res.json(data);
  } catch (error) {
    console.error('Error fetching agents report:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get('/approvals', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const period = String(req.query.period ?? '30d');
    const data = await reportRepo.getApprovals(scope, period);
    res.json(data);
  } catch (error) {
    console.error('Error fetching approvals report:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get('/costs', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const period = String(req.query.period ?? '30d');
    const data = await reportRepo.getCosts(scope, period);
    res.json(data);
  } catch (error) {
    console.error('Error fetching costs report:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get('/sla', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const period = String(req.query.period ?? '30d');
    const data = await reportRepo.getSLA(scope, period);
    res.json(data);
  } catch (error) {
    console.error('Error fetching SLA report:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;
