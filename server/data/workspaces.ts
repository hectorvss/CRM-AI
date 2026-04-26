import { getDb } from '../db/client.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { parseRow } from '../db/utils.js';

export interface WorkspaceRepository {
  listByUser(userId: string): Promise<any[]>;
  getById(id: string, orgId?: string): Promise<any>;
  findByOrg(orgId: string): Promise<any>;
  getFirstWorkspace(): Promise<any>;
  updateSettings(id: string, settings: any): Promise<void>;
  listFeatureFlags(tenantId: string, workspaceId: string): Promise<any[]>;
  updateFeatureFlag(data: {
    tenantId: string;
    workspaceId: string;
    featureKey: string;
    isEnabled: boolean;
    userId: string;
  }): Promise<void>;
}

class SQLiteWorkspaceRepository implements WorkspaceRepository {
  async listByUser(userId: string) {
    const db = getDb();
    return db.prepare(`
      SELECT w.*, m.role_id, m.status as member_status 
      FROM workspaces w
      JOIN members m ON w.id = m.workspace_id
      WHERE m.user_id = ?
    `).all(userId);
  }

  async getById(id: string, orgId?: string) {
    const db = getDb();
    if (id === 'ws_default') {
      if (orgId) {
        const byOrg = db.prepare('SELECT * FROM workspaces WHERE org_id = ? ORDER BY created_at ASC LIMIT 1').get(orgId);
        if (byOrg) return byOrg;
      }
      const first = db.prepare('SELECT * FROM workspaces ORDER BY created_at ASC LIMIT 1').get();
      if (first) return first;
    }
    if (orgId) {
      const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ? AND org_id = ?').get(id, orgId);
      if (workspace) return workspace;
      return db.prepare('SELECT * FROM workspaces WHERE org_id = ? ORDER BY created_at ASC LIMIT 1').get(orgId);
    }
    return db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
  }

  async findByOrg(orgId: string) {
    const db = getDb();
    return db.prepare('SELECT * FROM workspaces WHERE org_id = ? ORDER BY created_at ASC LIMIT 1').get(orgId);
  }

  async getFirstWorkspace() {
    const db = getDb();
    return db.prepare('SELECT * FROM workspaces ORDER BY created_at ASC LIMIT 1').get();
  }

  async updateSettings(id: string, settings: any) {
    const db = getDb();
    db.prepare(`
      UPDATE workspaces
      SET settings = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(settings), id);
  }

  async listFeatureFlags(tenantId: string, workspaceId: string) {
    const db = getDb();
    const workspace = db.prepare('SELECT id, plan_id FROM workspaces WHERE id = ?').get(workspaceId) as any;
    if (!workspace) return [];

    const gates = db.prepare('SELECT feature_key, plan_ids, workspace_overrides FROM feature_gates').all() as any[];
    const overrides = db.prepare(`
      SELECT feature_key, is_enabled, source, updated_by, updated_at
      FROM workspace_feature_flags
      WHERE tenant_id = ? AND workspace_id = ?
    `).all(tenantId, workspaceId) as any[];
    
    const overrideByKey = new Map(overrides.map((o: any) => [o.feature_key, o]));

    return gates.map((gate: any) => {
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
  }

  async updateFeatureFlag(data: any) {
    const db = getDb();
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
    `).run(crypto.randomUUID(), data.tenantId, data.workspaceId, data.featureKey, data.isEnabled ? 1 : 0, data.userId);
  }
}

class SupabaseWorkspaceRepository implements WorkspaceRepository {
  async listByUser(userId: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('workspaces')
      .select('*, members!inner(role_id, status)')
      .eq('members.user_id', userId);
    if (error) throw error;
    return (data || []).map(w => ({
      ...w,
      role_id: w.members[0]?.role_id,
      member_status: w.members[0]?.status
    }));
  }

  async getById(id: string, orgId?: string) {
    const supabase = getSupabaseAdmin();
    if (id === 'ws_default') {
      if (orgId) {
        const { data } = await supabase
          .from('workspaces')
          .select('*')
          .eq('org_id', orgId)
          .order('created_at', { ascending: true })
          .limit(1);
        if (data?.[0]) return data[0];
      }
      const { data: first } = await supabase
        .from('workspaces')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1);
      if (first?.[0]) return first[0];
    }

    let query = supabase.from('workspaces').select('*').eq('id', id);
    if (orgId) query = query.eq('org_id', orgId);
    const { data } = await query.limit(1);
    if (data?.[0]) return data[0];
    if (orgId) {
      const { data: byOrg } = await supabase
        .from('workspaces')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true })
        .limit(1);
      return byOrg?.[0] || null;
    }
    return null;
  }

  async findByOrg(orgId: string) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('workspaces')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true })
      .limit(1);
    return data?.[0] || null;
  }

  async getFirstWorkspace() {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('workspaces')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1);
    return data?.[0] || null;
  }

  async updateSettings(id: string, settings: any) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('workspaces')
      .update({ settings, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  async listFeatureFlags(tenantId: string, workspaceId: string) {
    const supabase = getSupabaseAdmin();
    
    // Get workspace (need plan_id)
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id, plan_id')
      .eq('id', workspaceId)
      .single();
    if (!workspace) return [];

    // Get feature gates
    const { data: gates } = await supabase.from('feature_gates').select('*');
    
    // Get overrides
    const { data: overrides } = await supabase
      .from('workspace_feature_flags')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId);
    
    const overrideByKey = new Map((overrides || []).map((o: any) => [o.feature_key, o]));

    return (gates || []).map((gate: any) => {
      const planIds = Array.isArray(gate.plan_ids) ? gate.plan_ids : [];
      const enabledByPlan = planIds.includes(workspace.plan_id);
      const override = overrideByKey.get(gate.feature_key);
      return {
        feature_key: gate.feature_key,
        is_enabled: override ? !!override.is_enabled : enabledByPlan,
        source: override ? override.source || 'workspace_override' : 'plan_default',
        updated_by: override?.updated_by || null,
        updated_at: override?.updated_at || null,
      };
    });
  }

  async updateFeatureFlag(data: any) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('workspace_feature_flags')
      .upsert({
        tenant_id: data.tenantId,
        workspace_id: data.workspaceId,
        feature_key: data.featureKey,
        is_enabled: data.isEnabled ? 1 : 0,
        source: 'workspace_override',
        updated_by: data.userId,
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id,workspace_id,feature_key' });
    if (error) throw error;
  }
}

let instance: WorkspaceRepository | null = null;

export function createWorkspaceRepository(): WorkspaceRepository {
  if (instance) return instance;
  const provider = getDatabaseProvider();
  instance = provider === 'supabase' ? new SupabaseWorkspaceRepository() : new SQLiteWorkspaceRepository();
  return instance;
}
