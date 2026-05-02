import { getSupabaseAdmin } from '../db/supabase.js';

export interface WorkspaceRepository {
  listByUser(userId: string): Promise<any[]>;
  getById(id: string, orgId?: string): Promise<any>;
  findByOrg(orgId: string): Promise<any>;
  getFirstWorkspace(): Promise<any>;
  updateSettings(id: string, settings: any): Promise<void>;
  update(id: string, updates: { name?: string; slug?: string; settings?: any }): Promise<void>;
  listFeatureFlags(tenantId: string, workspaceId: string): Promise<any[]>;
  updateFeatureFlag(data: {
    tenantId: string;
    workspaceId: string;
    featureKey: string;
    isEnabled: boolean;
    userId: string;
  }): Promise<void>;
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

  async update(id: string, updates: { name?: string; slug?: string; settings?: any }) {
    const supabase = getSupabaseAdmin();
    const toUpdate: Record<string, any> = { updated_at: new Date().toISOString() };

    if (typeof updates.name === 'string') toUpdate.name = updates.name;
    if (typeof updates.slug === 'string') toUpdate.slug = updates.slug;
    if (updates.settings && typeof updates.settings === 'object' && !Array.isArray(updates.settings)) {
      toUpdate.settings = updates.settings;
    }

    if (Object.keys(toUpdate).length <= 1) return;
    const { error } = await supabase
      .from('workspaces')
      .update(toUpdate)
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
  instance = new SupabaseWorkspaceRepository();
  return instance;
}
