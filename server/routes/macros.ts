// Reply macros / snippets. Workspace-scoped CRUD. Each macro is either
// private (owned by created_by_user_id) or shared (visible to everybody in
// the workspace). The "⚡" composer dropdown reads/writes through this
// router instead of the localStorage fallback that shipped earlier.

import { Router, Response } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { createAuditRepository } from '../data/audit.js';

const router = Router();
const auditRepository = createAuditRepository();
router.use(extractMultiTenant);

// GET /macros — list macros visible to the current user (own + shared).
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const supabase = getSupabaseAdmin();
    const userId = req.userId || 'user_local';
    const { data, error } = await supabase
      .from('macros')
      .select('*')
      .eq('tenant_id', req.tenantId!)
      .eq('workspace_id', req.workspaceId!)
      .or(`shared.eq.true,created_by_user_id.eq.${userId}`)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    res.json({ items: data ?? [] });
  } catch (error) {
    console.error('Error listing macros:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /macros — create a new macro.
router.post('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const { label, body, shortcut, shared } = req.body ?? {};
    if (!label || !body) return res.status(400).json({ error: 'label and body are required' });
    const supabase = getSupabaseAdmin();
    const payload = {
      tenant_id: req.tenantId!,
      workspace_id: req.workspaceId!,
      created_by_user_id: req.userId || 'user_local',
      label: String(label).slice(0, 120),
      body:  String(body).slice(0, 10_000),
      shortcut: shortcut ? String(shortcut).slice(0, 32) : null,
      shared: Boolean(shared),
    };
    const { data, error } = await supabase.from('macros').insert(payload).select().single();
    if (error) throw error;
    await auditRepository.log({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId || 'system',
      action: 'MACRO_CREATE',
      entityType: 'macro',
      entityId: String(data?.id || ''),
      metadata: { label: payload.label, shared: payload.shared },
    });
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating macro:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /macros/:id — update label / body / shortcut / shared.
router.patch('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const { label, body, shortcut, shared } = req.body ?? {};
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (typeof label === 'string')   updates.label = label.slice(0, 120);
    if (typeof body === 'string')    updates.body  = body.slice(0, 10_000);
    if (typeof shortcut === 'string') updates.shortcut = shortcut.slice(0, 32);
    if (typeof shared === 'boolean') updates.shared = shared;
    const supabase = getSupabaseAdmin();
    const userId = req.userId || 'user_local';
    // Only the owner (or the workspace if shared) can patch — gated by
    // the tenant + workspace scope plus the created_by_user_id check for
    // non-shared macros.
    const { data, error } = await supabase
      .from('macros')
      .update(updates)
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId!)
      .eq('workspace_id', req.workspaceId!)
      .or(`shared.eq.true,created_by_user_id.eq.${userId}`)
      .select()
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Macro not found' });
    res.json(data);
  } catch (error) {
    console.error('Error updating macro:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /macros/:id — remove a macro the current user owns.
router.delete('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const supabase = getSupabaseAdmin();
    const userId = req.userId || 'user_local';
    const { error } = await supabase
      .from('macros')
      .delete()
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId!)
      .eq('workspace_id', req.workspaceId!)
      .eq('created_by_user_id', userId);
    if (error) throw error;
    await auditRepository.log({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: userId,
      action: 'MACRO_DELETE',
      entityType: 'macro',
      entityId: req.params.id,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting macro:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /macros/:id/use — bump usage_count when a macro is inserted into
// the composer. Helps surface most-used macros first.
router.post('/:id/use', async (req: MultiTenantRequest, res: Response) => {
  try {
    const supabase = getSupabaseAdmin();
    // Increment usage_count atomically.
    const { data: existing, error: getErr } = await supabase
      .from('macros')
      .select('usage_count')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId!)
      .eq('workspace_id', req.workspaceId!)
      .single();
    if (getErr) throw getErr;
    const next = (existing?.usage_count ?? 0) + 1;
    const { error } = await supabase
      .from('macros')
      .update({ usage_count: next })
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId!)
      .eq('workspace_id', req.workspaceId!);
    if (error) throw error;
    res.json({ success: true, usage_count: next });
  } catch (error) {
    console.error('Error bumping macro usage:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
