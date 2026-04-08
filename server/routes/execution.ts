import { Router } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { buildCaseResolveView } from '../services/canonicalState.js';

const router = Router();

router.use(extractMultiTenant);

router.post('/authorize-action', (req: MultiTenantRequest, res) => {
  try {
    const { caseId, action, tool, amount } = req.body || {};

    if (!caseId || !action) {
      return res.status(400).json({ error: 'caseId and action are required' });
    }

    const resolve = buildCaseResolveView(caseId, req.tenantId!, req.workspaceId!);
    if (!resolve) return res.status(404).json({ error: 'Case not found' });

    const amountValue = Number(amount || 0);
    const requiresApproval = resolve.execution.requires_approval || amountValue > 50;
    const blocked = requiresApproval && resolve.execution.approval_state !== 'approved';

    res.json({
      allowed: !blocked,
      blocked,
      action,
      tool: tool || 'connector',
      reason: blocked
        ? 'Approval required before write-enabled execution.'
        : 'Action authorized by current case state.',
      precedence: blocked
        ? ['approval_required', 'case_policy', 'execution_state']
        : ['case_state'],
      approval_state: resolve.execution.approval_state || null,
      execution_status: resolve.execution.status,
    });
  } catch (error) {
    console.error('Error authorizing execution action:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
