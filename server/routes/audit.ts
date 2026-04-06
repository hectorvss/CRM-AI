import { Router } from 'express';
import { getDb } from '../db/client.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { parseRow } from '../db/utils.js';
import { sendError } from '../http/errors.js';

const router = Router();

// Apply multi-tenant middleware to all audit routes
router.use(extractMultiTenant);
router.use(requirePermission('audit.read'));

// GET /api/audit/:entityType/:entityId - Fetch audit logs for a specific entity
router.get('/:entityType/:entityId', (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const logs = db.prepare(`
      SELECT * FROM audit_events 
      WHERE tenant_id = ? 
        AND entity_type = ? 
        AND entity_id = ?
      ORDER BY occurred_at DESC
    `).all(req.tenantId, req.params.entityType, req.params.entityId);

    res.json(logs.map(parseRow));
  } catch (error) {
    console.error('Audit fetch error:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// GET /api/audit/workspace/all - Fetch all audit logs for the current workspace
router.get('/workspace/all', (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const logs = db.prepare(`
      SELECT * FROM audit_events 
      WHERE tenant_id = ? 
        AND workspace_id = ?
      ORDER BY occurred_at DESC
      LIMIT 100
    `).all(req.tenantId, req.workspaceId);

    res.json(logs.map(parseRow));
  } catch (error) {
    console.error('Audit fetch error:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;
