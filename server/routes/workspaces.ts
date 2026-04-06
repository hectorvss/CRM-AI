import { Router } from 'express';
import { getDb } from '../db/client.js';
import { sendError } from '../http/errors.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { parseRow } from '../db/utils.js';

const router = Router();
router.use(extractMultiTenant);
router.use(requirePermission('settings.read'));

// List workspaces for user
router.get('/', (req: MultiTenantRequest, res) => {
  const userId = req.userId || 'user_alex';

  try {
    const db = getDb();
    const workspaces = db.prepare(`
      SELECT w.*, m.role_id, m.status as member_status 
      FROM workspaces w
      JOIN members m ON w.id = m.workspace_id
      WHERE m.user_id = ?
    `).all(userId);
    res.json(workspaces);
  } catch (error) {
    console.error('Error fetching workspaces:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Get current workspace from tenant context
router.get('/current/context', (req: MultiTenantRequest, res) => {
  if (!req.workspaceId || !req.tenantId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  }

  try {
    const db = getDb();
    const workspace = db.prepare(
      'SELECT * FROM workspaces WHERE id = ? AND org_id = ?'
    ).get(req.workspaceId, req.tenantId) as any;

    if (!workspace) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found');
    res.json(parseRow(workspace));
  } catch (error) {
    console.error('Error fetching current workspace:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Get current workspace details (Tenant config)
router.get('/:id', (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(req.params.id);
    if (!workspace) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found');
    res.json(workspace);
  } catch (error) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Update workspace settings
router.patch('/:id/settings', requirePermission('settings.write'), (req: MultiTenantRequest, res) => {
  if (!req.tenantId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant context is missing');
  }

  const { settings } = req.body as { settings?: Record<string, unknown> };
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return sendError(res, 400, 'INVALID_SETTINGS', 'settings must be an object');
  }

  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM workspaces WHERE id = ? AND org_id = ?').get(req.params.id, req.tenantId) as any;
    if (!existing) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found');

    db.prepare(`
      UPDATE workspaces
      SET settings = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(settings), req.params.id);

    const updated = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(req.params.id) as any;
    res.json(parseRow(updated));
  } catch (error) {
    console.error('Error updating workspace settings:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// List members for a workspace
router.get('/:id/members', requirePermission('members.read'), (req: MultiTenantRequest, res) => {
  if (!req.tenantId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant context is missing');
  }

  try {
    const db = getDb();
    const workspace = db.prepare('SELECT id FROM workspaces WHERE id = ? AND org_id = ?').get(req.params.id, req.tenantId) as any;
    if (!workspace) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found');

    const members = db.prepare(`
      SELECT m.*, u.email, u.name, u.avatar_url, r.name as role_name
      FROM members m
      JOIN users u ON u.id = m.user_id
      LEFT JOIN roles r ON r.id = m.role_id
      WHERE m.workspace_id = ? AND m.tenant_id = ?
      ORDER BY m.joined_at DESC
    `).all(req.params.id, req.tenantId);

    res.json(members);
  } catch (error) {
    console.error('Error fetching workspace members:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Get effective feature flags for workspace
router.get('/:id/feature-flags', (req: MultiTenantRequest, res) => {
  if (!req.tenantId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant context is missing');
  }

  try {
    const db = getDb();
    const workspace = db.prepare('SELECT id, plan_id FROM workspaces WHERE id = ? AND org_id = ?').get(req.params.id, req.tenantId) as any;
    if (!workspace) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found');

    const gates = db.prepare('SELECT feature_key, plan_ids, workspace_overrides FROM feature_gates').all() as any[];
    const overrides = db.prepare(`
      SELECT feature_key, is_enabled, source, updated_by, updated_at
      FROM workspace_feature_flags
      WHERE tenant_id = ? AND workspace_id = ?
    `).all(req.tenantId, req.params.id) as any[];
    const overrideByKey = new Map(overrides.map((o: any) => [o.feature_key, o]));

    const effective = gates.map((gate: any) => {
      const parsed = parseRow(gate) as any;
      const planIds: string[] = Array.isArray(parsed.plan_ids) ? parsed.plan_ids : [];
      const enabledByPlan = planIds.includes(workspace.plan_id);
      const override = overrideByKey.get(parsed.feature_key);
      return {
        feature_key: parsed.feature_key,
        is_enabled: override ? !!override.is_enabled : enabledByPlan,
        source: override ? override.source || 'workspace_override' : 'plan_default',
        updated_by: override?.updated_by || null,
        updated_at: override?.updated_at || null,
      };
    });

    res.json({ workspace_id: req.params.id, plan_id: workspace.plan_id, flags: effective });
  } catch (error) {
    console.error('Error fetching workspace feature flags:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Upsert workspace feature flag override
router.patch('/:id/feature-flags/:featureKey', requirePermission('settings.write'), (req: MultiTenantRequest, res) => {
  if (!req.tenantId || !req.userId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/user context is missing');
  }

  const featureKey = req.params.featureKey;
  const { is_enabled } = req.body as { is_enabled?: boolean };
  if (typeof is_enabled !== 'boolean') {
    return sendError(res, 400, 'INVALID_FEATURE_FLAG_PAYLOAD', 'is_enabled must be boolean');
  }

  try {
    const db = getDb();
    const workspace = db.prepare('SELECT id FROM workspaces WHERE id = ? AND org_id = ?').get(req.params.id, req.tenantId) as any;
    if (!workspace) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found');

    const gate = db.prepare('SELECT feature_key FROM feature_gates WHERE feature_key = ? LIMIT 1').get(featureKey) as any;
    if (!gate) return sendError(res, 404, 'FEATURE_GATE_NOT_FOUND', 'Feature gate not found');

    db.prepare(`
      INSERT INTO workspace_feature_flags (
        id, tenant_id, workspace_id, feature_key, is_enabled, source, updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'workspace_override', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_id, workspace_id, feature_key)
      DO UPDATE SET
        is_enabled = excluded.is_enabled,
        source = excluded.source,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP
    `).run(crypto.randomUUID(), req.tenantId, req.params.id, featureKey, is_enabled ? 1 : 0, req.userId);

    const updated = db.prepare(`
      SELECT feature_key, is_enabled, source, updated_by, updated_at
      FROM workspace_feature_flags
      WHERE tenant_id = ? AND workspace_id = ? AND feature_key = ?
      LIMIT 1
    `).get(req.tenantId, req.params.id, featureKey);

    res.json(updated);
  } catch (error) {
    console.error('Error updating feature flag override:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;
