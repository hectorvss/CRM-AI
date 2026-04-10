import { Router } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { sendError } from '../http/errors.js';
import { createApprovalRepository } from '../data/index.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import { logger } from '../utils/logger.js';

const router = Router();
const approvalRepo = createApprovalRepository();

router.use(extractMultiTenant);

// GET /api/approvals
router.get('/', async (req: MultiTenantRequest, res) => {
  try {
    const scope = { 
      tenantId: req.tenantId!, 
      workspaceId: req.workspaceId! 
    };
    const filters = {
      status: req.query.status as string,
      risk_level: req.query.risk_level as string,
      assigned_to: req.query.assigned_to as string,
    };

    const approvals = await approvalRepo.list(scope, filters);
    res.json(approvals);
  } catch (error) {
    console.error('Error fetching approvals:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// GET /api/approvals/:id
router.get('/:id', async (req: MultiTenantRequest, res) => {
  try {
    const scope = { 
      tenantId: req.tenantId!, 
      workspaceId: req.workspaceId! 
    };
    const approval = await approvalRepo.get(scope, req.params.id);

    if (!approval) return res.status(404).json({ error: 'Not found' });
    res.json(approval);
  } catch (error) {
    console.error('Error fetching approval detail:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// GET /api/approvals/:id/context
router.get('/:id/context', async (req: MultiTenantRequest, res) => {
  try {
    const scope = { 
      tenantId: req.tenantId!, 
      workspaceId: req.workspaceId! 
    };
    const context = await approvalRepo.getContext(scope, req.params.id);
    if (!context) return res.status(404).json({ error: 'Not found' });
    res.json(context);
  } catch (error) {
    console.error('Error fetching approval context:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// POST /api/approvals/:id/decide
router.post('/:id/decide', async (req: MultiTenantRequest, res) => {
  try {
    const scope = { 
      tenantId: req.tenantId!, 
      workspaceId: req.workspaceId!,
      userId: req.userId
    };
    const { decision, note, decided_by } = req.body;

    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be approved or rejected' });
    }

    const result = await approvalRepo.decide(scope, req.params.id, {
      decision,
      note,
      decided_by
    });

    if (!result) return res.status(404).json({ error: 'Not found or not pending' });

    if (decision === 'approved' && result.executionPlanId) {
      // Enqueue resolution job
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

      logger.info('Approval granted — RESOLUTION_EXECUTE enqueued', {
        approvalId: req.params.id,
        planId: result.executionPlanId,
        caseId: result.caseId,
        decidedBy: decided_by,
      });
    }

    res.json({ success: true, decision, caseId: result.caseId });
  } catch (error) {
    console.error('Error deciding approval:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;
