import { Router } from 'express';
import { sendError } from '../http/errors.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { createHash, randomBytes } from 'crypto';
import crypto from 'crypto';
import { createIAMRepository, createWorkspaceRepository } from '../data/index.js';

const router = Router();
const iamRepository = createIAMRepository();
const workspaceRepository = createWorkspaceRepository();

router.use(extractMultiTenant);

// POST /api/iam/sessions/login
router.post('/sessions/login', async (req: MultiTenantRequest, res) => {
  const { email, workspace_id, tenant_id } = req.body as { email?: string; workspace_id?: string; tenant_id?: string };
  if (!email || !workspace_id || !tenant_id) {
    return sendError(res, 400, 'INVALID_LOGIN_PAYLOAD', 'email, tenant_id and workspace_id are required');
  }

  try {
    const user = await iamRepository.getUserByEmail(email);
    if (!user) return sendError(res, 404, 'USER_NOT_FOUND', 'User not found');

    const member = await iamRepository.getMember(user.id, tenant_id, workspace_id);
    if (!member || member.status === 'suspended') {
      return sendError(res, 403, 'MEMBERSHIP_NOT_ALLOWED', 'User is not active in this workspace');
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await iamRepository.createSession({
      id: sessionId,
      userId: user.id,
      tenantId: tenant_id,
      workspaceId: workspace_id,
      tokenHash,
      expiresAt,
    });

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
router.post('/sessions/logout', async (req: MultiTenantRequest, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return sendError(res, 400, 'MISSING_BEARER_TOKEN', 'Bearer token is required');
  }

  try {
    const rawToken = authHeader.slice(7).trim();
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const success = await iamRepository.revokeSession(tokenHash);

    if (!success) {
      return sendError(res, 404, 'SESSION_NOT_FOUND', 'Session not found or already revoked');
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error revoking session:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Get current user profile
router.get('/me', requirePermission('settings.read'), async (req: MultiTenantRequest, res) => {
  const userId = req.userId || 'user_alex';

  try {
    const user = await iamRepository.getUserById(userId);
    if (!user) {
      return sendError(res, 404, 'USER_NOT_FOUND', 'User not found');
    }
    
    const memberships = await iamRepository.listUserMemberships(userId);

    res.json({
      ...user,
      memberships,
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
router.get('/users', requirePermission('members.read'), async (req: MultiTenantRequest, res) => {
  if (!req.tenantId || !req.workspaceId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  }
  
  try {
    const workspace = await workspaceRepository.getById(req.workspaceId, req.tenantId);
    const resolvedWorkspaceId = workspace?.id || req.workspaceId;
    const users = await iamRepository.listWorkspaceUsers(req.tenantId, resolvedWorkspaceId);
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// List workspace roles
router.get('/roles', requirePermission('members.read'), async (req: MultiTenantRequest, res) => {
  if (!req.tenantId || !req.workspaceId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  }

  try {
    const workspace = await workspaceRepository.getById(req.workspaceId, req.tenantId);
    const resolvedWorkspaceId = workspace?.id || req.workspaceId;
    const roles = await iamRepository.listRoles(req.tenantId, resolvedWorkspaceId);
    res.json(roles);
  } catch (error) {
    console.error('Error fetching roles:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Create custom role
router.post('/roles', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
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
    const existing = await iamRepository.getRoleByName(name, req.tenantId, req.workspaceId);
    if (existing) {
      return sendError(res, 409, 'ROLE_ALREADY_EXISTS', 'A role with this name already exists');
    }

    const roleId = crypto.randomUUID();
    const rolePermissions = (permissions || []).filter((p): p is string => typeof p === 'string');

    await iamRepository.createRole({
      id: roleId,
      workspaceId: req.workspaceId,
      name,
      permissions: rolePermissions,
      isSystem: 0,
      tenantId: req.tenantId
    });

    res.status(201).json({ id: roleId, name, permissions: rolePermissions });
  } catch (error) {
    console.error('Error creating role:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Update role permissions
router.patch('/roles/:id', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  if (!req.tenantId || !req.workspaceId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  }

  const { name, permissions } = req.body as { name?: string; permissions?: string[] };
  if (permissions && !Array.isArray(permissions)) {
    return sendError(res, 400, 'INVALID_ROLE_PERMISSIONS', 'Permissions must be an array of strings');
  }

  try {
    const role = await iamRepository.getRoleById(req.params.id, req.tenantId, req.workspaceId);

    if (!role) return sendError(res, 404, 'ROLE_NOT_FOUND', 'Role not found');
    if (role.is_system === 1 && name && name !== role.name) {
      return sendError(res, 400, 'SYSTEM_ROLE_RENAME_FORBIDDEN', 'System roles cannot be renamed');
    }

    const newName = name && typeof name === 'string' ? name : role.name;
    const rolePermissions = Array.isArray(permissions) 
      ? permissions.filter((p): p is string => typeof p === 'string') 
      : (typeof role.permissions === 'string' ? JSON.parse(role.permissions) : role.permissions) || [];

    await iamRepository.updateRole(req.params.id, {
      name: newName,
      permissions: rolePermissions
    });

    res.json({ id: req.params.id, name: newName, permissions: rolePermissions });
  } catch (error) {
    console.error('Error updating role:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// List workspace members
router.get('/members', requirePermission('members.read'), async (req: MultiTenantRequest, res) => {
  if (!req.tenantId || !req.workspaceId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  }

  try {
    const workspace = await workspaceRepository.getById(req.workspaceId, req.tenantId);
    const resolvedWorkspaceId = workspace?.id || req.workspaceId;
    const members = await iamRepository.listWorkspaceMembers(req.tenantId, resolvedWorkspaceId);
    res.json(members);
  } catch (error) {
    console.error('Error fetching members:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Invite/add member
router.post('/members/invite', requirePermission('members.invite'), async (req: MultiTenantRequest, res) => {
  if (!req.tenantId || !req.workspaceId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  }

  const { email, name, role_id } = req.body as { email?: string; name?: string; role_id?: string };
  if (!email || !role_id) {
    return sendError(res, 400, 'INVALID_MEMBER_INVITE', 'email and role_id are required');
  }

  try {
    const role = await iamRepository.getRoleById(role_id, req.tenantId, req.workspaceId);
    if (!role) return sendError(res, 404, 'ROLE_NOT_FOUND', 'Role not found');

    const existingUser = await iamRepository.getUserByEmail(email);
    const userId = existingUser?.id || crypto.randomUUID();

    if (!existingUser) {
      await iamRepository.createUser({
        id: userId,
        email,
        name: name || email.split('@')[0],
        role: 'agent',
        isSystem: 0
      });
    }

    const existingMember = await iamRepository.getMember(userId, req.tenantId, req.workspaceId);

    if (existingMember) {
      await iamRepository.updateMember(existingMember.id, {
        roleId: role_id,
        status: 'active'
      });
      return res.json({ id: existingMember.id, user_id: userId, role_id, status: 'active', reactivated: true });
    }

    const memberId = crypto.randomUUID();
    await iamRepository.createMember({
      id: memberId,
      userId,
      workspaceId: req.workspaceId,
      roleId: role_id,
      status: 'invited',
      tenantId: req.tenantId
    });

    res.status(201).json({ id: memberId, user_id: userId, role_id, status: 'invited' });
  } catch (error) {
    console.error('Error inviting member:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Update member status or role
router.patch('/members/:id', requirePermission('members.remove'), async (req: MultiTenantRequest, res) => {
  if (!req.tenantId || !req.workspaceId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  }

  const { status, role_id } = req.body as { status?: 'active' | 'invited' | 'suspended'; role_id?: string };
  if (!status && !role_id) {
    return sendError(res, 400, 'INVALID_MEMBER_UPDATE', 'At least one field is required: status or role_id');
  }

  try {
    const member = await iamRepository.getMemberById(req.params.id, req.tenantId, req.workspaceId);
    if (!member) return sendError(res, 404, 'MEMBER_NOT_FOUND', 'Member not found');

    let nextRoleId = member.role_id;
    if (role_id) {
      const role = await iamRepository.getRoleById(role_id, req.tenantId, req.workspaceId);
      if (!role) return sendError(res, 404, 'ROLE_NOT_FOUND', 'Role not found');
      nextRoleId = role_id;
    }

    const nextStatus = status || member.status;
    await iamRepository.updateMember(req.params.id, {
      status: nextStatus,
      roleId: nextRoleId
    });

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
