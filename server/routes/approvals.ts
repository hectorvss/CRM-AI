import { Router } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { createApprovalRepository } from '../data/index.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import { logger } from '../utils/logger.js';

const router = Router();
const approvalRepository = createApprovalRepository();

router.use(extractMultiTenant);

router.get('/', async (req: MultiTenantRequest, res) => {
  try {
    const scope = {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      userId: req.userId,
    };
    const approvals = await approvalRepository.list(scope, {
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      risk_level: typeof req.query.risk_level === 'string' ? req.query.risk_level : undefined,
      assigned_to: typeof req.query.assigned_to === 'string' ? req.query.assigned_to : undefined,
    });
    res.json(approvals);
  } catch (error) {
    logger.error('Error listing approvals:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: MultiTenantRequest, res) => {
  try {
    const scope = {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      userId: req.userId,
    };
    const approval = await approvalRepository.get(scope, req.params.id);
    if (!approval) return res.status(404).json({ error: 'Not found' });
    res.json(approval);
  } catch (error) {
    logger.error('Error fetching approval:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/context', async (req: MultiTenantRequest, res) => {
  try {
    const scope = {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      userId: req.userId,
    };
    const context = await approvalRepository.getContext(scope, req.params.id);
    if (!context) return res.status(404).json({ error: 'Not found' });
    res.json(context);
  } catch (error) {
    logger.error('Error fetching approval context:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/decide', async (req: MultiTenantRequest, res) => {
  try {
    const scope = {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      userId: req.userId,
    };
    const { decision, note, decided_by } = req.body;
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be approved or rejected' });
    }

    const result = await approvalRepository.decide(scope, req.params.id, {
      decision,
      note,
      decided_by: decided_by || req.userId || 'system',
    });

    if (!result) return res.status(404).json({ error: 'Not found' });

    if (decision === 'approved' && result.executionPlanId) {
      await enqueue(
        JobType.RESOLUTION_EXECUTE,
        { executionPlanId: result.executionPlanId, mode: 'ai' },
        { 
          tenantId: scope.tenantId, 
          workspaceId: scope.workspaceId, 
          traceId: req.params.id, 
          priority: 5 
        },
      );
    }

    res.json({ success: true, decision, caseId: result.caseId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    logger.error('Error deciding approval:', error);
    res.status(message === 'Approval is not pending' ? 400 : 500).json({ error: message });
  }
});

export default router;
