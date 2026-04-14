import { Router } from 'express';
import { sendError } from '../http/errors.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { createIAMRepository } from '../data/index.js';
import { createHash, randomBytes, randomUUID } from 'crypto';

const router = Router();
const iamRepo = createIAMRepository();

router.use(extractMultiTenant);

// POST /api/iam/sessions/login
router.post('/sessions/login', async (req: MultiTenantRequest, res) => {
  const { email, workspace_id, tenant_id } = req.body as { email?: string; workspace_id?: string; tenant_id?: string };
  if (!email || !workspace_id || !tenant_id) {
    return sendError(res, 400, 'INVALID_LOGIN_PAYLOAD', 'email, tenant_id and workspace_id are required');
  }

  try {
    const user = await iamRepo.getUserByEmail(email);
    if (!user) return sendError(res, 404, 'USER_NOT_FOUND', 'User not found');

    const member = await iamRepo.getMember(user.id, tenant_id, workspace_id);
    if (!member || member.status === 'suspended') {
      return sendError(res, 403, 'MEMBERSHIP_NOT_ALLOWED', 'User is not active in this workspace');
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    await iamRepo.createSession({
      id: sessionId,
      userId: user.id,
      tenantId: tenant_id,
      workspaceId: workspace_id,
      tokenHash,
      expiresAt
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
    const ok = await iamRepo.revokeSession(tokenHash);

    if (!ok) {
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
  const userId = req.userId && req.userId !== 'system' ? req.userId : 'user_alex';

  try {
    let user = await iamRepo.getUserById(userId);
    if (!user && userId === 'user_alex') {
      user = {
        id: 'user_alex',
        email: 'alex@acme.com',
        name: 'Alex Morgan',
        role: 'supervisor',
        avatar_url: null,
        preferences: {},
      };
    }
    if (!user) {
      return sendError(res, 404, 'USER_NOT_FOUND', 'User not found');
    }

    const memberships = await iamRepo.listUserMemberships(userId);
    const effectiveMemberships = memberships.length > 0 || !req.workspaceId
      ? memberships
      : [{
        user_id: userId,
        workspace_id: req.workspaceId,
        workspace_name: 'Acme Support',
        workspace_slug: 'acme-support',
        status: 'active',
        role_id: req.roleId || 'role_supervisor',
        role_name: 'Supervisor',
      }];

    res.json({
      ...user,
      memberships: effectiveMemberships,
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

// Update current user profile
router.patch('/me', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  const userId = req.userId && req.userId !== 'system' ? req.userId : 'user_alex';
  const { name, avatar_url, preferences } = req.body as { name?: string; avatar_url?: string | null; preferences?: Record<string, unknown> };

  if (name !== undefined && typeof name !== 'string') {
    return sendError(res, 400, 'INVALID_PROFILE_NAME', 'name must be a string');
  }
  if (avatar_url !== undefined && avatar_url !== null && typeof avatar_url !== 'string') {
    return sendError(res, 400, 'INVALID_AVATAR_URL', 'avatar_url must be a string or null');
  }
  if (preferences !== undefined && (typeof preferences !== 'object' || Array.isArray(preferences))) {
    return sendError(res, 400, 'INVALID_PROFILE_PREFERENCES', 'preferences must be an object');
  }

  try {
    const existing = await iamRepo.getUserById(userId);
    if (!existing && userId !== 'user_alex') {
      return sendError(res, 404, 'USER_NOT_FOUND', 'User not found');
    }

    await iamRepo.updateUser(userId, {
      name,
      avatarUrl: avatar_url,
      preferences,
    });

    let user = await iamRepo.getUserById(userId);
    if (!user && userId === 'user_alex') {
      user = {
        id: 'user_alex',
        email: 'alex@acme.com',
        name: name || 'Alex Morgan',
        role: 'supervisor',
        avatar_url: avatar_url || null,
        preferences: preferences || {},
      };
    }

    const memberships = await iamRepo.listUserMemberships(userId);
    const effectiveMemberships = memberships.length > 0 || !req.workspaceId
      ? memberships
      : [{
        user_id: userId,
        workspace_id: req.workspaceId,
        workspace_name: 'Acme Support',
        workspace_slug: 'acme-support',
        status: 'active',
        role_id: req.roleId || 'role_supervisor',
        role_name: 'Supervisor',
      }];

    res.json({
      ...user,
      memberships: effectiveMemberships,
      context: {
        tenant_id: req.tenantId,
        workspace_id: req.workspaceId,
        role_id: req.roleId,
        permissions: req.permissions || [],
      },
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// List users for Tenant/Workspace
router.get('/users', requirePermission('members.read'), async (req: MultiTenantRequest, res) => {
  if (!req.tenantId || !req.workspaceId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  }
  
  try {
    const users = await iamRepo.listWorkspaceUsers(req.tenantId, req.workspaceId);
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
    const roles = await iamRepo.listRoles(req.tenantId, req.workspaceId);
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

  try {
    const existing = await iamRepo.getRoleByName(name, req.tenantId, req.workspaceId);
    if (existing) {
      return sendError(res, 409, 'ROLE_ALREADY_EXISTS', 'A role with this name already exists');
    }

    const roleId = randomUUID();
    const rolePermissions = Array.isArray(permissions) ? permissions.filter(p => typeof p === 'string') : [];

    await iamRepo.createRole({
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

  try {
    const role = await iamRepo.getRoleById(req.params.id, req.tenantId, req.workspaceId);
    if (!role) return sendError(res, 404, 'ROLE_NOT_FOUND', 'Role not found');
    
    if (role.is_system === 1 && name && name !== role.name) {
      return sendError(res, 400, 'SYSTEM_ROLE_RENAME_FORBIDDEN', 'System roles cannot be renamed');
    }

    const updates: any = {};
    if (name) updates.name = name;
    if (permissions) updates.permissions = permissions;

    await iamRepo.updateRole(req.params.id, updates);

    res.json({ id: req.params.id, name: updates.name || role.name, permissions: updates.permissions || role.permissions });
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
    const members = await iamRepo.listWorkspaceMembers(req.tenantId, req.workspaceId);
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
    const role = await iamRepo.getRoleById(role_id, req.tenantId, req.workspaceId);
    if (!role) return sendError(res, 404, 'ROLE_NOT_FOUND', 'Role not found');

    let user = await iamRepo.getUserByEmail(email);
    if (!user) {
      const userId = randomUUID();
      await iamRepo.createUser({
        id: userId,
        email,
        name: name || email.split('@')[0],
      });
      user = { id: userId };
    }

    const existingMember = await iamRepo.getMember(user.id, req.tenantId, req.workspaceId);
    if (existingMember) {
      await iamRepo.updateMember(existingMember.id, { roleId: role_id, status: 'active' });
      return res.json({ id: existingMember.id, user_id: user.id, role_id, status: 'active', reactivated: true });
    }

    const memberId = randomUUID();
    await iamRepo.createMember({
      id: memberId,
      userId: user.id,
      workspaceId: req.workspaceId,
      roleId: role_id,
      status: 'invited',
      tenantId: req.tenantId
    });

    res.status(201).json({ id: memberId, user_id: user.id, role_id, status: 'invited' });
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

  const { status, role_id } = req.body as { status?: string; role_id?: string };
  
  try {
    const member = await iamRepo.getMemberById(req.params.id, req.tenantId, req.workspaceId);
    if (!member) return sendError(res, 404, 'MEMBER_NOT_FOUND', 'Member not found');

    const updates: any = {};
    if (status) updates.status = status;
    if (role_id) {
        const role = await iamRepo.getRoleById(role_id, req.tenantId, req.workspaceId);
        if (!role) return sendError(res, 404, 'ROLE_NOT_FOUND', 'Role not found');
        updates.roleId = role_id;
    }

    await iamRepo.updateMember(req.params.id, updates);
    res.json({ id: req.params.id, status: updates.status || member.status, role_id: updates.roleId || member.role_id });
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
