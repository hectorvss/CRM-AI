import { Router, Response } from 'express';
import { sendError } from '../http/errors.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { createWorkspaceRepository, createIAMRepository } from '../data/index.js';
import { getSupabaseAdmin } from '../db/supabase.js';

const router = Router();
const workspaceRepository = createWorkspaceRepository();
const iamRepository = createIAMRepository();

router.use(extractMultiTenant);
router.use(requirePermission('settings.read'));

// List workspaces for user
router.get('/', async (req: MultiTenantRequest, res) => {
  const userId = req.userId || 'user_alex';

  try {
    const workspaces = await workspaceRepository.listByUser(userId);
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
    const workspace = await workspaceRepository.getById(req.workspaceId, req.tenantId);
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
    const workspace = await workspaceRepository.getById(req.params.id, req.tenantId);
    if (!workspace) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found');
    res.json(workspace);
  } catch (error) {
    console.error('Error fetching workspace:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSlug(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]/g, '-').replace(/-+/g, '-');
}

function validateWorkspaceSettingsPayload(settings: unknown) {
  return isPlainObject(settings);
}

async function resolveWorkspaceForUpdate(req: MultiTenantRequest) {
  const existing = await workspaceRepository.getById(req.params.id, req.tenantId);
  if (!existing) return null;
  return { existing, resolvedWorkspaceId: existing.id || req.params.id };
}

// Update workspace settings only (compatibility route)
async function updateWorkspaceSettingsHandler(req: MultiTenantRequest, res: Response) {
  if (!req.tenantId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant context is missing');
  }

  const { settings } = req.body as { settings?: Record<string, unknown> };
  if (!validateWorkspaceSettingsPayload(settings)) {
    return sendError(res, 400, 'INVALID_SETTINGS', 'settings must be an object');
  }

  try {
    const resolved = await resolveWorkspaceForUpdate(req);
    if (!resolved) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found');
    const { resolvedWorkspaceId } = resolved;
    await workspaceRepository.updateSettings(resolvedWorkspaceId, settings);
    const updated = await workspaceRepository.getById(resolvedWorkspaceId, req.tenantId);
    res.json(updated);
  } catch (error) {
    console.error('Error updating workspace settings:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

async function updateWorkspaceHandler(req: MultiTenantRequest, res: Response) {
  if (!req.tenantId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant context is missing');
  }

  const { name, slug, settings } = req.body as { name?: string; slug?: string; settings?: Record<string, unknown> };
  const updates: { name?: string; slug?: string; settings?: Record<string, unknown> } = {};

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
    if (typeof name !== 'string' || name.trim().length < 2) {
      return sendError(res, 400, 'INVALID_WORKSPACE_NAME', 'Workspace name must be at least 2 characters');
    }
    updates.name = name.trim();
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'slug')) {
    if (typeof slug !== 'string' || slug.trim().length < 2) {
      return sendError(res, 400, 'INVALID_WORKSPACE_SLUG', 'Workspace slug/domain must be at least 2 characters');
    }
    const normalizedSlug = normalizeSlug(slug);
    if (!normalizedSlug || normalizedSlug.length < 2) {
      return sendError(res, 400, 'INVALID_WORKSPACE_SLUG', 'Workspace slug/domain contains no valid characters');
    }
    updates.slug = normalizedSlug;
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'settings')) {
    if (!validateWorkspaceSettingsPayload(settings)) {
      return sendError(res, 400, 'INVALID_SETTINGS', 'settings must be an object');
    }
    updates.settings = settings;
  }

  if (Object.keys(updates).length === 0) {
    return sendError(res, 400, 'INVALID_WORKSPACE_UPDATE', 'At least one workspace field is required');
  }

  try {
    const resolved = await resolveWorkspaceForUpdate(req);
    if (!resolved) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found');
    const { resolvedWorkspaceId } = resolved;
    await workspaceRepository.update(resolvedWorkspaceId, updates);
    const updated = await workspaceRepository.getById(resolvedWorkspaceId, req.tenantId);
    res.json(updated);
  } catch (error) {
    console.error('Error updating workspace:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
}

router.patch('/:id/settings', requirePermission('settings.write'), updateWorkspaceSettingsHandler);
router.patch('/:id', requirePermission('settings.write'), updateWorkspaceHandler);

// List members for a workspace
router.get('/:id/members', requirePermission('members.read'), async (req: MultiTenantRequest, res) => {
  if (!req.tenantId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant context is missing');
  }

  try {
    const workspace = await workspaceRepository.getById(req.params.id, req.tenantId);
    if (!workspace) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found');

    const members = await iamRepository.listWorkspaceMembers(req.tenantId, workspace.id || req.params.id);
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
    const workspace = await workspaceRepository.getById(req.params.id, req.tenantId);
    if (!workspace) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found');

    const resolvedWorkspaceId = workspace.id || req.params.id;
    const flags = await workspaceRepository.listFeatureFlags(req.tenantId, resolvedWorkspaceId);
    res.json({ workspace_id: resolvedWorkspaceId, plan_id: workspace.plan_id, flags });
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
    const workspace = await workspaceRepository.getById(req.params.id, req.tenantId);
    if (!workspace) return sendError(res, 404, 'WORKSPACE_NOT_FOUND', 'Workspace not found');
    const resolvedWorkspaceId = workspace.id || req.params.id;

    await workspaceRepository.updateFeatureFlag({
      tenantId: req.tenantId,
      workspaceId: resolvedWorkspaceId,
      featureKey,
      isEnabled: is_enabled,
      userId: req.userId
    });

    const flags = await workspaceRepository.listFeatureFlags(req.tenantId, resolvedWorkspaceId);
    const updated = flags.find(f => f.feature_key === featureKey);
    res.json(updated);
  } catch (error) {
    console.error('Error updating feature flag override:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// ── Agent activity heartbeat ───────────────────────────────────────────────
// POST /api/workspaces/heartbeat
// Called by the frontend every 60 s while an agent tab is open and focused.
// Increments active_minutes by 1 for today's row in agent_daily_activity.
// Also syncs daily conversation counters from the cases table so totals stay
// accurate without a separate cron job.
router.post('/heartbeat', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  try {
    const tenantId = req.tenantId;
    const userId = req.userId;
    if (!tenantId || !userId) return res.status(401).json({ error: 'Authentication required' });

    const supabase = getSupabaseAdmin();
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Fetch today's conversation counts from cases (closed/assigned/replied today)
    const startOfDay = `${today}T00:00:00.000Z`;
    const [closedRes, assignedRes, repliedRes] = await Promise.all([
      supabase
        .from('cases')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('assigned_user_id', userId)
        .in('status', ['resolved', 'closed'])
        .gte('closed_at', startOfDay),
      supabase
        .from('cases')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('assigned_user_id', userId)
        .gte('assigned_at', startOfDay),
      supabase
        .from('case_replies')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .gte('replied_at', startOfDay),
    ]);

    const conversations_closed   = closedRes.count  ?? 0;
    const conversations_assigned = assignedRes.count ?? 0;
    const conversations_replied  = repliedRes.count  ?? 0;

    // UPSERT: on conflict increment active_minutes by 1, refresh counters
    const { error } = await supabase.from('agent_daily_activity').upsert(
      {
        tenant_id:              tenantId,
        user_id:                userId,
        activity_date:          today,
        active_minutes:         1,          // seed value for new rows
        conversations_closed,
        conversations_assigned,
        conversations_replied,
        updated_at:             new Date().toISOString(),
      },
      {
        onConflict: 'tenant_id,user_id,activity_date',
        ignoreDuplicates: false,
      },
    );

    // If the row already exists, increment active_minutes via RPC-style raw SQL
    if (!error) {
      await supabase.rpc('increment_active_minutes', {
        p_tenant_id:    tenantId,
        p_user_id:      userId,
        p_date:         today,
        p_closed:       conversations_closed,
        p_assigned:     conversations_assigned,
        p_replied:      conversations_replied,
      }).then(() => {/* best-effort */}).catch(() => {/* rpc may not exist yet */});
    }

    res.json({ ok: true, date: today });
  } catch (err: any) {
    console.error('Heartbeat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
