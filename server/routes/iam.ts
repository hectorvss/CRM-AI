import { Router } from 'express';
import { getDb } from '../db/client.js';
import { sendError } from '../http/errors.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { parseRow } from '../db/utils.js';
import { createHash, randomBytes } from 'crypto';

const router = Router();
router.use(extractMultiTenant);

// POST /api/iam/sessions/login
router.post('/sessions/login', (req: MultiTenantRequest, res) => {
  const { email, workspace_id, tenant_id } = req.body as { email?: string; workspace_id?: string; tenant_id?: string };
  if (!email || !workspace_id || !tenant_id) {
    return sendError(res, 400, 'INVALID_LOGIN_PAYLOAD', 'email, tenant_id and workspace_id are required');
  }

  try {
    const db = getDb();
    const user = db.prepare('SELECT id, email, name FROM users WHERE email = ? LIMIT 1').get(email) as any;
    if (!user) return sendError(res, 404, 'USER_NOT_FOUND', 'User not found');

    const member = db.prepare(`
      SELECT id, role_id, status
      FROM members
      WHERE user_id = ? AND tenant_id = ? AND workspace_id = ?
      LIMIT 1
    `).get(user.id, tenant_id, workspace_id) as any;

    if (!member || member.status === 'suspended') {
      return sendError(res, 403, 'MEMBERSHIP_NOT_ALLOWED', 'User is not active in this workspace');
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const sessionId = crypto.randomUUID();

    db.prepare(`
      INSERT INTO user_sessions (
        id, user_id, tenant_id, workspace_id, token_hash, expires_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now', '+7 days'))
    `).run(sessionId, user.id, tenant_id, workspace_id, tokenHash);

    res.status(201).json({
      session_id: sessionId,
      access_token: token,
      token_type: 'Bearer',
      expires_in_seconds: 604800,
      user: { id: user.id, email: user.email, name: user.name },
      tenant_id,
      workspace_id,
    });
  } catch (error) {
    console.error('Error creating session:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// POST /api/iam/sessions/logout
router.post('/sessions/logout', (req: MultiTenantRequest, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return sendError(res, 400, 'MISSING_BEARER_TOKEN', 'Bearer token is required');
  }

  try {
    const db = getDb();
    const rawToken = authHeader.slice(7).trim();
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const result = db.prepare(`
      UPDATE user_sessions
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE token_hash = ? AND revoked_at IS NULL
    `).run(tokenHash);

    if (!result.changes) {
      return sendError(res, 404, 'SESSION_NOT_FOUND', 'Session not found or already revoked');
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error revoking session:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Get current user profile
router.get('/me', requirePermission('settings.read'), (req: MultiTenantRequest, res) => {
  const userId = req.userId || 'user_alex';

  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return sendError(res, 404, 'USER_NOT_FOUND', 'User not found');
    }
    
    // Get user's members/workspaces
    const members = db.prepare(`
      SELECT m.*, w.name as workspace_name, w.slug as workspace_slug 
      FROM members m 
      JOIN workspaces w ON m.workspace_id = w.id 
      WHERE m.user_id = ?
    `).all(userId);

    res.json({
      ...(user as Record<string, any>),
      memberships: members,
      context: {
        tenant_id: req.tenantId,
        workspace_id: req.workspaceId,
        role_id: req.roleId,
        permissions: req.permissions || [],
      },
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// List users for Tenant/Workspace
router.get('/users', requirePermission('members.read'), (req: MultiTenantRequest, res) => {
  if (!req.tenantId || !req.workspaceId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  }
  const tenantId = req.tenantId;
  const workspaceId = req.workspaceId;
  
  try {
    const db = getDb();
    const users = db.prepare(`
      SELECT u.id, u.email, u.name, u.role, u.avatar_url, u.created_at, m.status, m.workspace_id, m.role_id
      FROM users u
      LEFT JOIN members m ON u.id = m.user_id
      WHERE m.tenant_id = ? AND m.workspace_id = ?
    `).all(tenantId, workspaceId);
    
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// List workspace roles
router.get('/roles', requirePermission('members.read'), (req: MultiTenantRequest, res) => {
  if (!req.tenantId || !req.workspaceId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  }

  try {
    const db = getDb();
    const roles = db.prepare(`
      SELECT * FROM roles
      WHERE tenant_id = ? AND workspace_id = ?
      ORDER BY is_system DESC, name ASC
    `).all(req.tenantId, req.workspaceId);

    const normalized = roles.map((r: any) => {
      const parsed = parseRow(r) as any;
      const permissionCount = db.prepare(
        'SELECT COUNT(*) as c FROM role_permissions WHERE role_id = ?'
      ).get(r.id) as any;
      return { ...parsed, permission_count: permissionCount.c };
    });

    res.json(normalized);
  } catch (error) {
    console.error('Error fetching roles:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Create custom role
router.post('/roles', requirePermission('settings.write'), (req: MultiTenantRequest, res) => {
  if (!req.tenantId || !req.workspaceId || !req.userId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace/user context is missing');
  }

  const { name, permissions } = req.body as { name?: string; permissions?: string[] };
  if (!name || typeof name !== 'string') {
    return sendError(res, 400, 'INVALID_ROLE_NAME', 'Role name is required');
  }
  if (permissions && !Array.isArray(permissions)) {
    return sendError(res, 400, 'INVALID_ROLE_PERMISSIONS', 'Permissions must be an array of strings');
  }

  try {
    const db = getDb();
    const existing = db.prepare(
      'SELECT id FROM roles WHERE tenant_id = ? AND workspace_id = ? AND name = ? LIMIT 1'
    ).get(req.tenantId, req.workspaceId, name) as any;
    if (existing) {
      return sendError(res, 409, 'ROLE_ALREADY_EXISTS', 'A role with this name already exists');
    }

    const roleId = crypto.randomUUID();
    const rolePermissions = (permissions || []).filter((p): p is string => typeof p === 'string');

    db.prepare(`
      INSERT INTO roles (id, workspace_id, name, permissions, is_system, tenant_id)
      VALUES (?, ?, ?, ?, 0, ?)
    `).run(roleId, req.workspaceId, name, JSON.stringify(rolePermissions), req.tenantId);

    const insertRolePerm = db.prepare(`
      INSERT OR IGNORE INTO role_permissions (role_id, permission_key)
      VALUES (?, ?)
    `);
    rolePermissions.forEach((permissionKey) => insertRolePerm.run(roleId, permissionKey));

    res.status(201).json({ id: roleId, name, permissions: rolePermissions });
  } catch (error) {
    console.error('Error creating role:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Update role permissions
router.patch('/roles/:id', requirePermission('settings.write'), (req: MultiTenantRequest, res) => {
  if (!req.tenantId || !req.workspaceId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  }

  const { name, permissions } = req.body as { name?: string; permissions?: string[] };
  if (permissions && !Array.isArray(permissions)) {
    return sendError(res, 400, 'INVALID_ROLE_PERMISSIONS', 'Permissions must be an array of strings');
  }

  try {
    const db = getDb();
    const role = db.prepare(
      'SELECT * FROM roles WHERE id = ? AND tenant_id = ? AND workspace_id = ?'
    ).get(req.params.id, req.tenantId, req.workspaceId) as any;

    if (!role) return sendError(res, 404, 'ROLE_NOT_FOUND', 'Role not found');
    if (role.is_system === 1 && name && name !== role.name) {
      return sendError(res, 400, 'SYSTEM_ROLE_RENAME_FORBIDDEN', 'System roles cannot be renamed');
    }

    const newName = name && typeof name === 'string' ? name : role.name;
    const rolePermissions =
      Array.isArray(permissions) ? permissions.filter((p): p is string => typeof p === 'string') : parseRow(role).permissions || [];

    db.prepare('UPDATE roles SET name = ?, permissions = ? WHERE id = ?').run(
      newName,
      JSON.stringify(rolePermissions),
      req.params.id
    );

    db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(req.params.id);
    const insertRolePerm = db.prepare(`
      INSERT OR IGNORE INTO role_permissions (role_id, permission_key)
      VALUES (?, ?)
    `);
    rolePermissions.forEach((permissionKey) => insertRolePerm.run(req.params.id, permissionKey));

    res.json({ id: req.params.id, name: newName, permissions: rolePermissions });
  } catch (error) {
    console.error('Error updating role:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// List workspace members
router.get('/members', requirePermission('members.read'), (req: MultiTenantRequest, res) => {
  if (!req.tenantId || !req.workspaceId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  }

  try {
    const db = getDb();
    const members = db.prepare(`
      SELECT m.*, u.email, u.name, u.avatar_url, r.name as role_name
      FROM members m
      JOIN users u ON u.id = m.user_id
      LEFT JOIN roles r ON r.id = m.role_id
      WHERE m.tenant_id = ? AND m.workspace_id = ?
      ORDER BY m.joined_at DESC
    `).all(req.tenantId, req.workspaceId);

    res.json(members);
  } catch (error) {
    console.error('Error fetching members:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Invite/add member
router.post('/members/invite', requirePermission('members.invite'), (req: MultiTenantRequest, res) => {
  if (!req.tenantId || !req.workspaceId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  }

  const { email, name, role_id } = req.body as { email?: string; name?: string; role_id?: string };
  if (!email || !role_id) {
    return sendError(res, 400, 'INVALID_MEMBER_INVITE', 'email and role_id are required');
  }

  try {
    const db = getDb();
    const role = db.prepare(
      'SELECT id FROM roles WHERE id = ? AND tenant_id = ? AND workspace_id = ?'
    ).get(role_id, req.tenantId, req.workspaceId) as any;
    if (!role) return sendError(res, 404, 'ROLE_NOT_FOUND', 'Role not found');

    const existingUser = db.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').get(email) as any;
    const userId = existingUser?.id || crypto.randomUUID();

    if (!existingUser) {
      db.prepare(`
        INSERT INTO users (id, email, name, role, is_system)
        VALUES (?, ?, ?, ?, 0)
      `).run(userId, email, name || email.split('@')[0], 'agent');
    }

    const existingMember = db.prepare(
      'SELECT id, status FROM members WHERE user_id = ? AND workspace_id = ? AND tenant_id = ?'
    ).get(userId, req.workspaceId, req.tenantId) as any;

    if (existingMember) {
      db.prepare(`
        UPDATE members SET role_id = ?, status = 'active'
        WHERE id = ?
      `).run(role_id, existingMember.id);
      return res.json({ id: existingMember.id, user_id: userId, role_id, status: 'active', reactivated: true });
    }

    const memberId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO members (id, user_id, workspace_id, role_id, status, tenant_id)
      VALUES (?, ?, ?, ?, 'invited', ?)
    `).run(memberId, userId, req.workspaceId, role_id, req.tenantId);

    res.status(201).json({ id: memberId, user_id: userId, role_id, status: 'invited' });
  } catch (error) {
    console.error('Error inviting member:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Update member status or role
router.patch('/members/:id', requirePermission('members.remove'), (req: MultiTenantRequest, res) => {
  if (!req.tenantId || !req.workspaceId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  }

  const { status, role_id } = req.body as { status?: 'active' | 'invited' | 'suspended'; role_id?: string };
  if (!status && !role_id) {
    return sendError(res, 400, 'INVALID_MEMBER_UPDATE', 'At least one field is required: status or role_id');
  }

  try {
    const db = getDb();
    const member = db.prepare(
      'SELECT * FROM members WHERE id = ? AND tenant_id = ? AND workspace_id = ?'
    ).get(req.params.id, req.tenantId, req.workspaceId) as any;
    if (!member) return sendError(res, 404, 'MEMBER_NOT_FOUND', 'Member not found');

    let nextRoleId = member.role_id;
    if (role_id) {
      const role = db.prepare(
        'SELECT id FROM roles WHERE id = ? AND tenant_id = ? AND workspace_id = ?'
      ).get(role_id, req.tenantId, req.workspaceId) as any;
      if (!role) return sendError(res, 404, 'ROLE_NOT_FOUND', 'Role not found');
      nextRoleId = role_id;
    }

    const nextStatus = status || member.status;
    db.prepare('UPDATE members SET status = ?, role_id = ? WHERE id = ?').run(nextStatus, nextRoleId, req.params.id);

    res.json({ id: req.params.id, status: nextStatus, role_id: nextRoleId });
  } catch (error) {
    console.error('Error updating member:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Current effective permissions
router.get('/permissions/me', (req: MultiTenantRequest, res) => {
  res.json({
    user_id: req.userId,
    role_id: req.roleId,
    tenant_id: req.tenantId,
    workspace_id: req.workspaceId,
    permissions: req.permissions || [],
  });
});

export default router;
