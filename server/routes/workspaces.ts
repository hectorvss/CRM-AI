import { Router } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { createWorkspaceRepository } from '../data/workspaces.js';
import { createIAMRepository } from '../data/iam.js';
import { sendError } from '../http/errors.js';
import { randomUUID } from 'crypto';

const router = Router();
router.use(extractMultiTenant);
router.use(requirePermission('settings.read'));

// List workspaces for user
router.get('/', async (req: MultiTenantRequest, res) => {
  const userId = req.userId || 'user_alex';

  try {
    const workspaceRepo = createWorkspaceRepository();
    const workspaces = await workspaceRepo.listByUser(userId);
    res.json(workspaces);
  } catch (error) {
    console.error('Error fetching workspaces:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Get current workspace from tenant context
router.get('/current/context', async (req: MultiTenantRequest, res) => {
  if (!req.workspaceId || !req.tenantId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  }

  try {
    const workspaceRepo = createWorkspaceRepository();
    const workspace = await workspaceRepo.getById(req.workspaceId, req.tenantId);

    if (!workspace) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found');
    res.json(workspace);
  } catch (error) {
    console.error('Error fetching current workspace:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Get workspace details by ID
router.get('/:id', async (req: MultiTenantRequest, res) => {
  try {
    const workspaceRepo = createWorkspaceRepository();
    const workspace = await workspaceRepo.getById(req.params.id);
    if (!workspace) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found');
    res.json(workspace);
  } catch (error) {
    console.error('Error fetching workspace:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Update workspace metadata and settings
router.patch('/:id', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  if (!req.tenantId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant context is missing');
  }

  const { name, slug, settings } = req.body as { name?: string; slug?: string; settings?: Record<string, unknown> };
  if (name !== undefined && typeof name !== 'string') {
    return sendError(res, 400, 'INVALID_WORKSPACE_NAME', 'name must be a string');
  }
  if (slug !== undefined && typeof slug !== 'string') {
    return sendError(res, 400, 'INVALID_WORKSPACE_SLUG', 'slug must be a string');
  }
  if (settings !== undefined && (typeof settings !== 'object' || Array.isArray(settings))) {
    return sendError(res, 400, 'INVALID_SETTINGS', 'settings must be an object');
  }

  if (name === undefined && slug === undefined && settings === undefined) {
    return sendError(res, 400, 'EMPTY_WORKSPACE_UPDATE', 'At least one workspace field must be provided');
  }

  try {
    const workspaceRepo = createWorkspaceRepository();
    const existing = await workspaceRepo.getById(req.params.id, req.tenantId);
    if (!existing) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found');

    await workspaceRepo.updateWorkspace(req.params.id, { name, slug, settings });
    const updated = await workspaceRepo.getById(req.params.id, req.tenantId);
    res.json(updated);
  } catch (error) {
    console.error('Error updating workspace:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Update workspace settings
router.patch('/:id/settings', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  if (!req.tenantId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant context is missing');
  }

  const { settings } = req.body as { settings?: Record<string, unknown> };
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return sendError(res, 400, 'INVALID_SETTINGS', 'settings must be an object');
  }

  try {
    const workspaceRepo = createWorkspaceRepository();
    const existing = await workspaceRepo.getById(req.params.id, req.tenantId);
    if (!existing) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found');

    await workspaceRepo.updateSettings(req.params.id, settings);
    const updated = await workspaceRepo.getById(req.params.id);
    res.json(updated);
  } catch (error) {
    console.error('Error updating workspace settings:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// List members for a workspace
router.get('/:id/members', requirePermission('members.read'), async (req: MultiTenantRequest, res) => {
  if (!req.tenantId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant context is missing');
  }

  try {
    const workspaceRepo = createWorkspaceRepository();
    const iamRepo = createIAMRepository();
    
    const workspace = await workspaceRepo.getById(req.params.id, req.tenantId);
    if (!workspace) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found');

    const members = await iamRepo.listWorkspaceMembers(req.tenantId, req.params.id);
    res.json(members);
  } catch (error) {
    console.error('Error fetching workspace members:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Get effective feature flags for workspace
router.get('/:id/feature-flags', async (req: MultiTenantRequest, res) => {
  if (!req.tenantId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant context is missing');
  }

  try {
    const workspaceRepo = createWorkspaceRepository();
    const flags = await workspaceRepo.listFeatureFlags(req.tenantId, req.params.id);
    
    // We might need the plan_id to return in the response if required by frontend
    const workspace = await workspaceRepo.getById(req.params.id, req.tenantId);
    
    res.json({ 
      workspace_id: req.params.id, 
      plan_id: workspace?.plan_id, 
      flags 
    });
  } catch (error) {
    console.error('Error fetching workspace feature flags:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Upsert workspace feature flag override
router.patch('/:id/feature-flags/:featureKey', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  if (!req.tenantId || !req.userId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/user context is missing');
  }

  const featureKey = req.params.featureKey;
  const { is_enabled } = req.body as { is_enabled?: boolean };
  if (typeof is_enabled !== 'boolean') {
    return sendError(res, 400, 'INVALID_FEATURE_FLAG_PAYLOAD', 'is_enabled must be boolean');
  }

  try {
    const workspaceRepo = createWorkspaceRepository();
    const workspace = await workspaceRepo.getById(req.params.id, req.tenantId);
    if (!workspace) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found');

    await workspaceRepo.updateFeatureFlag({
      tenantId: req.tenantId,
      workspaceId: req.params.id,
      featureKey,
      isEnabled: is_enabled,
      userId: req.userId
    });

    // Fetch the updated specific flag from the full list
    const flags = await workspaceRepo.listFeatureFlags(req.tenantId, req.params.id);
    const updated = flags.find(f => f.feature_key === featureKey);

    res.json(updated);
  } catch (error) {
    console.error('Error updating feature flag override:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;



