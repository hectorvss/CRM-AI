import { getSupabaseAdmin } from '../db/supabase.js';

export interface IAMRepository {
  // Sessions
  getSession(tokenHash: string): Promise<any>;
  createSession(data: {
    id: string;
    userId: string;
    tenantId: string;
    workspaceId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<void>;
  revokeSession(tokenHash: string): Promise<boolean>;

  // Users
  getUserById(id: string): Promise<any>;
  getUserByEmail(email: string): Promise<any>;
  createUser(data: {
    id: string;
    email: string;
    name: string;
    role?: string;
    isSystem?: number;
  }): Promise<void>;
  updateUser(id: string, updates: {
    name?: string;
    avatarUrl?: string | null;
    preferences?: Record<string, any>;
  }): Promise<void>;
  listWorkspaceUsers(tenantId: string, workspaceId: string): Promise<any[]>;

  // Members
  getMember(userId: string, tenantId: string, workspaceId: string): Promise<any>;
  getMemberById(id: string, tenantId: string, workspaceId: string): Promise<any>;
  listWorkspaceMembers(tenantId: string, workspaceId: string): Promise<any[]>;
  listUserMemberships(userId: string): Promise<any[]>;
  createMember(data: {
    id: string;
    userId: string;
    workspaceId: string;
    roleId: string;
    status: string;
    tenantId: string;
  }): Promise<void>;
  updateMember(id: string, updates: {
    status?: string;
    roleId?: string;
  }): Promise<void>;

  // Roles
  getRoleById(id: string, tenantId: string, workspaceId: string): Promise<any>;
  getRoleByName(name: string, tenantId: string, workspaceId: string): Promise<any>;
  listRoles(tenantId: string, workspaceId: string): Promise<any[]>;
  getPermissionKeys(roleId: string): Promise<string[]>;
  createRole(data: {
    id: string;
    workspaceId: string;
    name: string;
    permissions: string[];
    isSystem: number;
    tenantId: string;
  }): Promise<void>;
  updateRole(id: string, updates: {
    name?: string;
    permissions?: string[];
  }): Promise<void>;
}


class SupabaseIAMRepository implements IAMRepository {
  async getSession(tokenHash: string) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('token_hash', tokenHash)
      .is('revoked_at', null)
      .single();
    return data;
  }

  async createSession(data: any) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('user_sessions').insert({
      id: data.id,
      user_id: data.userId,
      tenant_id: data.tenantId,
      workspace_id: data.workspaceId,
      token_hash: data.tokenHash,
      expires_at: data.expiresAt
    });
    if (error) throw error;
  }

  async revokeSession(tokenHash: string) {
    const supabase = getSupabaseAdmin();
    const { error, count } = await supabase
      .from('user_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', tokenHash)
      .is('revoked_at', null);
    if (error) throw error;
    return true; // count is not always reliable in RLS/Admin
  }

  async getUserById(id: string) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('users').select('*').eq('id', id).single();
    return data;
  }

  async getUserByEmail(email: string) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('users').select('*').eq('email', email).limit(1);
    return data?.[0] || null;
  }

  async createUser(data: any) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('users').insert({
      id: data.id,
      email: data.email,
      name: data.name,
      role: data.role || 'agent',
      is_system: data.isSystem ? 1 : 0,
      preferences: data.preferences || {}
    });
    if (error) throw error;
  }

  async updateUser(id: string, updates: any) {
    const supabase = getSupabaseAdmin();
    const toUpdate: Record<string, any> = {};

    if (typeof updates.name === 'string') {
      toUpdate.name = updates.name;
    }

    if (Object.prototype.hasOwnProperty.call(updates, 'avatarUrl')) {
      toUpdate.avatar_url = updates.avatarUrl ?? null;
    }

    if (updates.preferences) {
      toUpdate.preferences = updates.preferences;
    }

    if (Object.keys(toUpdate).length === 0) return;

    const { error } = await supabase.from('users').update(toUpdate).eq('id', id);
    if (error) throw error;
  }

  async listWorkspaceUsers(tenantId: string, workspaceId: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('users')
      .select('*, members!inner(status, workspace_id, role_id)')
      .eq('members.tenant_id', tenantId)
      .eq('members.workspace_id', workspaceId);
    if (error) throw error;
    return (data || []).map(u => ({
      ...u,
      status: u.members[0]?.status,
      workspace_id: u.members[0]?.workspace_id,
      role_id: u.members[0]?.role_id
    }));
  }

  async getMember(userId: string, tenantId: string, workspaceId: string) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('members')
      .select('*')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId)
      .limit(1);
    return data?.[0] || null;
  }

  async getMemberById(id: string, tenantId: string, workspaceId: string) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('members')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId)
      .single();
    return data;
  }

  async listWorkspaceMembers(tenantId: string, workspaceId: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('members')
      .select('*, users(email, name, avatar_url)')
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId)
      .order('joined_at', { ascending: false });
    if (error) throw error;

    const roleIds = [...new Set((data || []).map((member: any) => member.role_id).filter((roleId: unknown): roleId is string => typeof roleId === 'string' && roleId.length > 0))];
    const roleMap = new Map<string, string>();

    if (roleIds.length > 0) {
      const { data: roles, error: roleError } = await supabase
        .from('roles')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .eq('workspace_id', workspaceId)
        .in('id', roleIds);
      if (roleError) throw roleError;
      (roles || []).forEach((role: any) => {
        roleMap.set(role.id, role.name);
      });
    }

    return (data || []).map(m => ({
      ...m,
      email: m.users?.email,
      name: m.users?.name,
      avatar_url: m.users?.avatar_url,
      role_name: roleMap.get(m.role_id) || m.role_id || 'Unknown'
    }));
  }

  async listUserMemberships(userId: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('members')
      .select('*, workspaces(name, slug)')
      .eq('user_id', userId);
    if (error) throw error;
    return (data || []).map(m => ({
      ...m,
      workspace_name: m.workspaces?.name,
      workspace_slug: m.workspaces?.slug
    }));
  }

  async createMember(data: any) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('members').insert({
      id: data.id,
      user_id: data.userId,
      workspace_id: data.workspaceId,
      role_id: data.roleId,
      status: data.status,
      tenant_id: data.tenantId
    });
    if (error) throw error;
  }

  async updateMember(id: string, updates: any) {
    const supabase = getSupabaseAdmin();
    const toUpdate: any = {};
    if (updates.status) toUpdate.status = updates.status;
    if (updates.roleId) toUpdate.role_id = updates.roleId;
    const { error } = await supabase.from('members').update(toUpdate).eq('id', id);
    if (error) throw error;
  }

  async getRoleById(id: string, tenantId: string, workspaceId: string) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('roles')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId)
      .single();
    return data;
  }

  async getRoleByName(name: string, tenantId: string, workspaceId: string) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('roles')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId)
      .eq('name', name)
      .limit(1);
    return data?.[0] || null;
  }

  async listRoles(tenantId: string, workspaceId: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('roles')
      .select('*, role_permissions(count)')
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId)
      .order('is_system', { ascending: false })
      .order('name', { ascending: true });
    if (error) throw error;
    return (data || []).map(r => ({
      ...r,
      permissions: typeof r.permissions === 'string' ? JSON.parse(r.permissions) : r.permissions,
      permission_count: r.role_permissions?.[0]?.count || 0
    }));
  }

  async createRole(data: any) {
    const supabase = getSupabaseAdmin();
    const { error: roleError } = await supabase.from('roles').insert({
      id: data.id,
      workspace_id: data.workspaceId,
      name: data.name,
      permissions: data.permissions,
      is_system: data.isSystem ? 1 : 0,
      tenant_id: data.tenantId
    });
    if (roleError) throw roleError;

    const perms = data.permissions.map((pk: string) => ({
      role_id: data.id,
      permission_key: pk
    }));
    await supabase.from('role_permissions').insert(perms);
  }

  async updateRole(id: string, updates: any) {
    const supabase = getSupabaseAdmin();
    const toUpdate: any = {};
    if (updates.name) toUpdate.name = updates.name;
    if (updates.permissions) toUpdate.permissions = updates.permissions;
    
    const { error: roleError } = await supabase.from('roles').update(toUpdate).eq('id', id);
    if (roleError) throw roleError;

    if (updates.permissions) {
      await supabase.from('role_permissions').delete().eq('role_id', id);
      const perms = updates.permissions.map((pk: string) => ({
        role_id: id,
        permission_key: pk
      }));
      await supabase.from('role_permissions').insert(perms);
    }
  }

  async getPermissionKeys(roleId: string) {
    // Built-in admin roles always return empty here so resolvePermissions
    // uses the preset ['*'] — never let DB rows silently truncate them.
    if (roleId === 'owner' || roleId === 'workspace_admin') return [];

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('role_permissions')
      .select('permission_key')
      .eq('role_id', roleId)
      .order('permission_key', { ascending: true });
    if (error) throw error;
    if ((data || []).length > 0) {
      return (data || []).map((row: any) => row.permission_key).filter(Boolean);
    }

    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('permissions')
      .eq('id', roleId)
      .maybeSingle();
    if (roleError) throw roleError;
    return Array.isArray(role?.permissions) ? role.permissions : [];
  }
}

let instance: IAMRepository | null = null;

export function createIAMRepository(): IAMRepository {
  if (instance) return instance;
  instance = new SupabaseIAMRepository();
  return instance;
}
