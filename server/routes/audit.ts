import { Router } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { createAuditRepository } from '../data/index.js';
import { sendError } from '../http/errors.js';

const router = Router();
const auditRepository = createAuditRepository();

router.use(extractMultiTenant);
router.use(requirePermission('audit.read'));

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

export default router;
