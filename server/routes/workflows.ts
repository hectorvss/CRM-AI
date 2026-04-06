import { Router } from 'express';
import { getDb } from '../db/client.js';
import { sendError } from '../http/errors.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';

const router = Router();
router.use(extractMultiTenant);
router.use(requirePermission('workflows.read'));

// GET /api/workflows
router.get('/', (req: MultiTenantRequest, res) => {
  const db = getDb();
  if (!req.tenantId) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant context is missing');
  const tenantId = req.tenantId;
  const wfs = db.prepare(`
    SELECT wd.*, wv.status as version_status, wv.version_number, wv.trigger
    FROM workflow_definitions wd
    LEFT JOIN workflow_versions wv ON wd.current_version_id = wv.id
    WHERE wd.tenant_id = ?
    ORDER BY wd.updated_at DESC
  `).all(tenantId);

  res.json(wfs.map((w: any) => {
    const runs = db.prepare(`
      SELECT COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
             SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
             SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) as running
      FROM workflow_runs WHERE workflow_version_id IN (
        SELECT id FROM workflow_versions WHERE workflow_id = ?
      ) AND tenant_id = ?
    `).get(w.id, tenantId) as any;
    if (w.trigger && typeof w.trigger === 'string') {
      try { w.trigger = JSON.parse(w.trigger); } catch { w.trigger = {}; }
    }
    return { ...w, stats: runs };
  }));
});

// GET /api/workflows/runs/recent
router.get('/runs/recent', (req: MultiTenantRequest, res) => {
  const db = getDb();
  if (!req.tenantId) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant context is missing');
  const tenantId = req.tenantId;
  const runs = db.prepare(`
    SELECT wr.*, wd.name as workflow_name, c.case_number
    FROM workflow_runs wr
    LEFT JOIN workflow_versions wv ON wr.workflow_version_id = wv.id
    LEFT JOIN workflow_definitions wd ON wv.workflow_id = wd.id
    LEFT JOIN cases c ON wr.case_id = c.id
    WHERE wr.tenant_id = ?
    ORDER BY wr.started_at DESC LIMIT 50
  `).all(tenantId);
  res.json(runs);
});

// GET /api/workflows/:id
router.get('/:id', (req: MultiTenantRequest, res) => {
  const db = getDb();
  if (!req.tenantId) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant context is missing');
  const tenantId = req.tenantId;
  const wf = db.prepare('SELECT * FROM workflow_definitions WHERE id = ? AND tenant_id = ?').get(req.params.id, tenantId) as any;
  if (!wf) return sendError(res, 404, 'WORKFLOW_NOT_FOUND', 'Workflow not found');

  const versions = db.prepare('SELECT * FROM workflow_versions WHERE workflow_id = ? ORDER BY version_number DESC').all(req.params.id);
  const runs = db.prepare(`
    SELECT wr.*, c.case_number 
    FROM workflow_runs wr 
    LEFT JOIN cases c ON wr.case_id = c.id
    WHERE wr.workflow_version_id IN (SELECT id FROM workflow_versions WHERE workflow_id = ?)
    AND wr.tenant_id = ?
    ORDER BY wr.started_at DESC LIMIT 20
  `).all(req.params.id, tenantId);

  res.json({ ...wf, versions, recent_runs: runs });
});

export default router;
