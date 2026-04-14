import { getDb } from '../db/client.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { parseRow } from '../db/utils.js';

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
    preferences?: Record<string, unknown>;
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
  getPermissionKeys(roleId: string): Promise<string[]>;
}

class SQLiteIAMRepository implements IAMRepository {
  async getSession(tokenHash: string) {
    const db = getDb();
    return db.prepare('SELECT * FROM user_sessions WHERE token_hash = ? AND revoked_at IS NULL').get(tokenHash);
  }

  async createSession(data: any) {
    const db = getDb();
    db.prepare(`
      INSERT INTO user_sessions (id, user_id, tenant_id, workspace_id, token_hash, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.id, data.userId, data.tenantId, data.workspaceId, data.tokenHash, data.expiresAt);
  }

  async revokeSession(tokenHash: string) {
    const db = getDb();
    const result = db.prepare(`
      UPDATE user_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ? AND revoked_at IS NULL
    `).run(tokenHash);
    return result.changes > 0;
  }

  async getUserById(id: string) {
    const db = getDb();
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }

  async getUserByEmail(email: string) {
    const db = getDb();
    return db.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').get(email);
  }

  async createUser(data: any) {
    const db = getDb();
    db.prepare(`
      INSERT INTO users (id, email, name, role, is_system, preferences)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.id, data.email, data.name, data.role || 'agent', data.isSystem || 0, JSON.stringify(data.preferences || {}));
  }

  async updateUser(id: string, updates: any) {
    const db = getDb();
    const fields: string[] = [];
    const params: any[] = [];
    if (typeof updates.name === 'string') {
      fields.push('name = ?');
      params.push(updates.name);
    }
    if (updates.avatarUrl !== undefined) {
      fields.push('avatar_url = ?');
      params.push(updates.avatarUrl);
    }
    if (updates.preferences !== undefined) {
      fields.push('preferences = ?');
      params.push(JSON.stringify(updates.preferences || {}));
    }
    if (fields.length === 0) return;
    params.push(id);
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  }

  async listWorkspaceUsers(tenantId: string, workspaceId: string) {
    const db = getDb();
    return db.prepare(`
      SELECT u.*, m.status, m.workspace_id, m.role_id
      FROM users u
      LEFT JOIN members m ON u.id = m.user_id
      WHERE m.tenant_id = ? AND m.workspace_id = ?
    `).all(tenantId, workspaceId);
  }

  async getMember(userId: string, tenantId: string, workspaceId: string) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM members WHERE user_id = ? AND tenant_id = ? AND workspace_id = ? LIMIT 1
    `).get(userId, tenantId, workspaceId);
  }

  async getMemberById(id: string, tenantId: string, workspaceId: string) {
    const db = getDb();
    return db.prepare(`
      SELECT * FROM members WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).get(id, tenantId, workspaceId);
  }

  async listWorkspaceMembers(tenantId: string, workspaceId: string) {
    const db = getDb();
    return db.prepare(`
      SELECT m.*, u.email, u.name, u.avatar_url, r.name as role_name
      FROM members m
      JOIN users u ON u.id = m.user_id
      LEFT JOIN roles r ON r.id = m.role_id
      WHERE m.tenant_id = ? AND m.workspace_id = ?
      ORDER BY m.joined_at DESC
    `).all(tenantId, workspaceId);
  }

  async listUserMemberships(userId: string) {
    const db = getDb();
    return db.prepare(`
      SELECT m.*, w.name as workspace_name, w.slug as workspace_slug 
      FROM members m 
      JOIN workspaces w ON m.workspace_id = w.id 
      WHERE m.user_id = ?
    `).all(userId);
  }

  async createMember(data: any) {
    const db = getDb();
    db.prepare(`
      INSERT INTO members (id, user_id, workspace_id, role_id, status, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.id, data.userId, data.workspaceId, data.roleId, data.status, data.tenantId);
  }

  async updateMember(id: string, updates: any) {
    const db = getDb();
    const fields = [];
    const params = [];
    if (updates.status) { fields.push('status = ?'); params.push(updates.status); }
    if (updates.roleId) { fields.push('role_id = ?'); params.push(updates.roleId); }
    if (fields.length === 0) return;
    params.push(id);
    db.prepare(`UPDATE members SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  }

  async getRoleById(id: string, tenantId: string, workspaceId: string) {
    const db = getDb();
    return db.prepare('SELECT * FROM roles WHERE id = ? AND tenant_id = ? AND workspace_id = ?').get(id, tenantId, workspaceId);
  }

  async getRoleByName(name: string, tenantId: string, workspaceId: string) {
    const db = getDb();
    return db.prepare('SELECT id FROM roles WHERE tenant_id = ? AND workspace_id = ? AND name = ? LIMIT 1').get(tenantId, workspaceId, name);
  }

  async listRoles(tenantId: string, workspaceId: string) {
    const db = getDb();
    const roles = db.prepare(`
      SELECT * FROM roles WHERE tenant_id = ? AND workspace_id = ? ORDER BY is_system DESC, name ASC
    `).all(tenantId, workspaceId);
    
    return roles.map((r: any) => {
      const parsed = parseRow(r);
      const permCount = db.prepare('SELECT COUNT(*) as c FROM role_permissions WHERE role_id = ?').get(r.id) as any;
      return { ...parsed, permission_count: permCount.c };
    });
  }

  async createRole(data: any) {
    const db = getDb();
    db.prepare(`
      INSERT INTO roles (id, workspace_id, name, permissions, is_system, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.id, data.workspaceId, data.name, JSON.stringify(data.permissions), data.isSystem, data.tenantId);
    
    const insertRolePerm = db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)`);
    data.permissions.forEach((pk: string) => insertRolePerm.run(data.id, pk));
  }

  async updateRole(id: string, updates: any) {
    const db = getDb();
    if (updates.name) {
      db.prepare('UPDATE roles SET name = ? WHERE id = ?').run(updates.name, id);
    }
    if (updates.permissions) {
      db.prepare('UPDATE roles SET permissions = ? WHERE id = ?').run(JSON.stringify(updates.permissions), id);
      db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(id);
      const insertRolePerm = db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)`);
      updates.permissions.forEach((pk: string) => insertRolePerm.run(id, pk));
    }
  }

  async getPermissionKeys(roleId: string): Promise<string[]> {
    const db = getDb();
    const rows = db.prepare(`
      SELECT permission_key FROM role_permissions WHERE role_id = ?
    `).all(roleId) as Array<{ permission_key: string }>;
    return rows.map(r => r.permission_key);
  }
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
      preferences: JSON.stringify(data.preferences || {}),
    });
    if (error) throw error;
  }

  async updateUser(id: string, updates: any) {
    const supabase = getSupabaseAdmin();
    const toUpdate: any = {};
    if (typeof updates.name === 'string') toUpdate.name = updates.name;
    if (updates.avatarUrl !== undefined) toUpdate.avatar_url = updates.avatarUrl;
    if (updates.preferences !== undefined) toUpdate.preferences = JSON.stringify(updates.preferences || {});
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
      .select('*, users(email, name, avatar_url), roles(name)')
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId)
      .order('joined_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(m => ({
      ...m,
      email: m.users?.email,
      name: m.users?.name,
      avatar_url: m.users?.avatar_url,
      role_name: m.roles?.name
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

  async getPermissionKeys(roleId: string): Promise<string[]> {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('role_permissions')
      .select('permission_key')
      .eq('role_id', roleId);
    return (data || []).map(r => r.permission_key);
  }
}

let instance: IAMRepository | null = null;

export function createIAMRepository(): IAMRepository {
  if (instance) return instance;
  const provider = getDatabaseProvider();
  instance = provider === 'supabase' ? new SupabaseIAMRepository() : new SQLiteIAMRepository();
  return instance;
}
