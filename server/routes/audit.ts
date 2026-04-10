import { Router } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { sendError } from '../http/errors.js';
import { createAuditRepository } from '../data/index.js';

const router = Router();
const auditRepo = createAuditRepository();

// Apply multi-tenant middleware to all audit routes
router.use(extractMultiTenant);
router.use(requirePermission('audit.read'));

// GET /api/audit/:entityType/:entityId - Fetch audit logs for a specific entity
router.get('/:entityType/:entityId', async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const logs = await auditRepo.listByEntity(
      scope, 
      req.params.entityType, 
      req.params.entityId
    );

    res.json(logs);
  } catch (error) {
    console.error('Audit fetch error:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// GET /api/audit/workspace/all - Fetch all audit logs for the current workspace
router.get('/workspace/all', async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const logs = await auditRepo.listByWorkspace(scope);

    res.json(logs);
  } catch (error) {
    console.error('Audit fetch error:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;
