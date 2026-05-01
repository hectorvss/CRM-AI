import { Router } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { createAuditRepository } from '../data/index.js';
import { createApprovalRepository } from '../data/index.js';
import { sendError } from '../http/errors.js';
import { createWorkspaceRepository } from '../data/workspaces.js';
import { parseSettings } from '../services/privacyRedaction.js';

const router = Router();
const auditRepository = createAuditRepository();
const approvalRepository = createApprovalRepository();
const workspaceRepository = createWorkspaceRepository();

router.use(extractMultiTenant);
router.use(requirePermission('audit.read'));

router.get('/workspace/all', async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const logs = await auditRepository.listByWorkspace(scope);
    res.json(logs);
  } catch (error) {
    console.error('Audit fetch error:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

async function createPrivacyApproval(req: MultiTenantRequest, actionType: 'data_export' | 'data_deletion') {
  const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
  const workspace = await workspaceRepository.getById(scope.workspaceId, scope.tenantId);
  const settings = parseSettings(workspace?.settings);
  const policyValue = actionType === 'data_export'
    ? settings.privacy?.exportApprovals
    : settings.privacy?.deletionApprovals;

  return approvalRepository.create(scope, {
    caseId: null,
    requestedBy: req.userId || 'system',
    requestedByType: 'human',
    actionType,
    actionPayload: {
      policy: policyValue || 'Security Team only',
      reason: req.body?.reason || null,
      requested_entity_type: req.body?.entity_type || 'workspace',
      requested_entity_id: req.body?.entity_id || scope.workspaceId,
    },
    riskLevel: actionType === 'data_deletion' ? 'critical' : 'high',
    evidencePackage: {
      source: 'settings.data_privacy',
      workspace_id: scope.workspaceId,
      policy: policyValue || 'Security Team only',
    },
    priority: actionType === 'data_deletion' ? 'urgent' : 'high',
  });
}

router.post('/workspace/export-request', async (req: MultiTenantRequest, res) => {
  try {
    const approval = await createPrivacyApproval(req, 'data_export');
    res.status(202).json({ status: 'approval_required', approval });
  } catch (error) {
    console.error('Audit export approval error:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.post('/workspace/deletion-request', async (req: MultiTenantRequest, res) => {
  try {
    const approval = await createPrivacyApproval(req, 'data_deletion');
    res.status(202).json({ status: 'approval_required', approval });
  } catch (error) {
    console.error('Audit deletion approval error:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get('/:entityType/:entityId', async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const logs = await auditRepository.listByEntity(scope, req.params.entityType, req.params.entityId);
    res.json(logs);
  } catch (error) {
    console.error('Audit fetch error:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;
