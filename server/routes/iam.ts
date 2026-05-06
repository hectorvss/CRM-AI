import { Router } from 'express';
import { sendError } from '../http/errors.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { createHash, randomBytes } from 'crypto';
import crypto from 'crypto';
import { createIAMRepository, createWorkspaceRepository } from '../data/index.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { sendEmail } from '../pipeline/channelSenders.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

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

// Get current user profile.
// Self-service endpoint — does NOT require settings.read because the SPA must
// be able to read its own identity to bootstrap (resolve memberships, gate
// onboarding, decide which tenant to show). All other /iam/* endpoints remain
// permission-gated.
router.get('/me', async (req: MultiTenantRequest, res) => {
  const userId = req.userId;
  if (!userId || userId === 'system') {
    return sendError(res, 401, 'AUTHENTICATION_REQUIRED', 'A signed-in user is required');
  }

  try {
    const user = await iamRepository.getUserById(userId);
    if (!user) {
      return sendError(res, 404, 'USER_NOT_FOUND', 'User not found');
    }

    // Always pull memberships fresh — the multi-tenant middleware may have
    // resolved a single tenant from the JWT, but the SPA needs the full list
    // to render the workspace switcher and to confirm post-signup onboarding.
    const memberships = await iamRepository.listUserMemberships(userId);

    // If the request arrived with default/legacy headers (org_default/ws_default)
    // and the JWT carried no app_metadata claims, the middleware will already
    // have resolved tenant/workspace from the user's first membership. We surface
    // that real context here so the frontend can replace its defaults.
    const resolvedTenantId    = req.tenantId    || memberships[0]?.tenant_id    || null;
    const resolvedWorkspaceId = req.workspaceId || memberships[0]?.workspace_id || null;

    res.json({
      ...user,
      memberships,
      context: {
        tenant_id:    resolvedTenantId,
        workspace_id: resolvedWorkspaceId,
        role_id:      req.roleId || null,
        permissions:  req.permissions || [],
      },
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get('/security/enforcement', async (req: MultiTenantRequest, res) => {
  res.json({
    user_id: req.userId,
    workspace_id: req.workspaceId,
    tenant_id: req.tenantId,
    policy: req.authPolicy || null,
  });
});

router.get('/access-request-targets', async (req: MultiTenantRequest, res) => {
  if (!req.tenantId || !req.workspaceId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  }

  try {
    const workspace = await workspaceRepository.getById(req.workspaceId, req.tenantId);
    const resolvedWorkspaceId = workspace?.id || req.workspaceId;
    const [users, roles] = await Promise.all([
      iamRepository.listWorkspaceUsers(req.tenantId, resolvedWorkspaceId),
      iamRepository.listRoles(req.tenantId, resolvedWorkspaceId),
    ]);
    const roleMap = new Map((roles || []).map((role: any) => [role.id, role]));
    const approvers = (users || []).filter((workspaceUser: any) => {
      const role = roleMap.get(workspaceUser.role_id);
      const roleName = String(role?.name || workspaceUser.role || '').toLowerCase();
      const permissions = Array.isArray(role?.permissions)
        ? role.permissions
        : typeof role?.permissions === 'string'
          ? (() => {
              try { return JSON.parse(role.permissions); } catch { return []; }
            })()
          : [];
      return roleName === 'owner' || roleName === 'workspace_admin' || permissions.includes('*') || permissions.includes('settings.write');
    }).map((workspaceUser: any) => ({
      id: workspaceUser.id,
      email: workspaceUser.email,
      name: workspaceUser.name,
      role_id: workspaceUser.role_id,
    }));

    res.json(approvers);
  } catch (error) {
    console.error('Error fetching access request targets:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Update current user profile and preferences. This route is self-service and
// intentionally does not require settings.write.
router.patch('/me', async (req: MultiTenantRequest, res) => {
  const userId = req.userId || 'user_alex';
  const { name, avatar_url, preferences } = req.body as {
    name?: string;
    avatar_url?: string | null;
    preferences?: Record<string, any>;
  };

  if (!userId) {
    return sendError(res, 401, 'AUTHENTICATION_REQUIRED', 'A signed-in user is required');
  }
  if (typeof name === 'string' && name.trim().length < 2) {
    return sendError(res, 400, 'INVALID_PROFILE_UPDATE', 'Name must be at least 2 characters');
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'avatar_url') && avatar_url !== null && typeof avatar_url !== 'string') {
    return sendError(res, 400, 'INVALID_PROFILE_UPDATE', 'avatar_url must be a string or null');
  }
  if (preferences && (typeof preferences !== 'object' || Array.isArray(preferences))) {
    return sendError(res, 400, 'INVALID_PROFILE_UPDATE', 'preferences must be an object');
  }
  if (typeof name !== 'string' && !Object.prototype.hasOwnProperty.call(req.body || {}, 'avatar_url') && !preferences) {
    return sendError(res, 400, 'INVALID_PROFILE_UPDATE', 'At least one profile field is required');
  }

  try {
    const user = await iamRepository.getUserById(userId);
    if (!user) {
      return sendError(res, 404, 'USER_NOT_FOUND', 'User not found');
    }

    await iamRepository.updateUser(userId, {
      name: typeof name === 'string' ? name.trim() : undefined,
      avatarUrl: Object.prototype.hasOwnProperty.call(req.body || {}, 'avatar_url') ? avatar_url ?? null : undefined,
      preferences: preferences && typeof preferences === 'object' ? preferences : undefined,
    });

    const updatedUser = await iamRepository.getUserById(userId);
    const memberships = await iamRepository.listUserMemberships(userId);

    res.json({
      ...updatedUser,
      memberships,
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

// GET /iam/teams — list workspace teams. Used by the inbox AssignModal to
// surface team assignment alongside individual member assignment.
router.get('/teams', requirePermission('members.read'), async (req: MultiTenantRequest, res) => {
  if (!req.tenantId || !req.workspaceId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  }
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('teams')
      .select('id, name, description, created_at')
      .eq('workspace_id', req.workspaceId)
      .order('name', { ascending: true });
    if (error) throw error;
    res.json(data ?? []);
  } catch (error) {
    console.error('Error fetching teams:', error);
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

// Owner role names — first member of a workspace is automatically the owner
const OWNER_ROLE_NAMES = ['owner', 'workspace_admin'];

// List workspace members (with is_owner flag)
router.get('/members', requirePermission('members.read'), async (req: MultiTenantRequest, res) => {
  if (!req.tenantId || !req.workspaceId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  }

  try {
    const workspace = await workspaceRepository.getById(req.workspaceId, req.tenantId);
    const resolvedWorkspaceId = workspace?.id || req.workspaceId;
    const members = await iamRepository.listWorkspaceMembers(req.tenantId, resolvedWorkspaceId);

    // Mark the first member (oldest joined_at) with an owner-like role as the workspace owner.
    // Sort by joined_at ascending so the seed user is always considered owner.
    const sorted = [...members].sort((a: any, b: any) => {
      const ta = new Date(a.joined_at || 0).getTime();
      const tb = new Date(b.joined_at || 0).getTime();
      return ta - tb;
    });
    const ownerMember = sorted.find((m: any) =>
      OWNER_ROLE_NAMES.includes(String(m.role_name || '').toLowerCase())
    ) || sorted[0];

    const enriched = members.map((m: any) => ({
      ...m,
      is_owner: ownerMember && m.id === ownerMember.id,
    }));

    res.json(enriched);
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
    // ─── Workspace policy enforcement ───
    const workspace = await workspaceRepository.getById(req.workspaceId, req.tenantId);
    let workspaceSettings: any = workspace?.settings;
    if (typeof workspaceSettings === 'string') {
      try { workspaceSettings = JSON.parse(workspaceSettings); } catch { workspaceSettings = {}; }
    }
    workspaceSettings = workspaceSettings || {};

    // Domain whitelist
    const allowedDomains: string[] = Array.isArray(workspaceSettings?.access?.allowedDomains)
      ? workspaceSettings.access.allowedDomains.filter(Boolean)
      : [];
    if (allowedDomains.length > 0) {
      const emailDomain = email.split('@')[1]?.toLowerCase();
      const normalized = allowedDomains.map((d: string) => d.toLowerCase().replace(/^@/, ''));
      if (!emailDomain || !normalized.includes(emailDomain)) {
        return sendError(res, 403, 'DOMAIN_NOT_ALLOWED',
          `Email domain "${emailDomain}" is not in the workspace allowlist. Allowed: ${normalized.join(', ')}`);
      }
    }

    // Seat limit (read from billing if configured)
    const seatLimit = Number(workspaceSettings?.billing?.seatLimit ?? workspaceSettings?.seats?.limit ?? 0);
    if (seatLimit > 0) {
      const existingMembers = await iamRepository.listWorkspaceMembers(req.tenantId, req.workspaceId);
      const activeOrInvited = existingMembers.filter((m: any) => m.status === 'active' || m.status === 'invited').length;
      if (activeOrInvited >= seatLimit) {
        return sendError(res, 402, 'SEAT_LIMIT_REACHED',
          `Seat limit reached (${activeOrInvited}/${seatLimit}). Upgrade your plan to invite more members.`);
      }
    }

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

    // ── Generate + persist invite token ────────────────────────────────────
    const token = crypto.randomUUID();
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAtDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const expiresAt = expiresAtDate.toISOString();

    try {
      const supabase = getSupabaseAdmin();
      const { error: tokenInsertError } = await supabase.from('invite_tokens').insert({
        token_hash:   tokenHash,
        member_id:    memberId,
        user_id:      userId,
        email,
        tenant_id:    req.tenantId,
        workspace_id: req.workspaceId,
        role_id,
        expires_at:   expiresAt,
        created_at:   new Date().toISOString(),
      });
      if (tokenInsertError) {
        logger.warn('iam/invite: failed to persist invite token (continuing)', {
          error: tokenInsertError.message,
          memberId,
        });
      }
    } catch (tokenErr: any) {
      logger.warn('iam/invite: invite token persistence error (continuing)', {
        error: tokenErr?.message,
        memberId,
      });
    }

    const baseUrl = config.app.url;
    const acceptUrl = `${baseUrl}/accept-invite?token=${token}`;

    // ── Resolve org name for email body ────────────────────────────────────
    let orgName = 'your team';
    try {
      const supabase = getSupabaseAdmin();
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', req.tenantId)
        .maybeSingle();
      if (org?.name) orgName = org.name;
    } catch { /* non-fatal */ }

    // ── Deliver invite email (Postmark) ────────────────────────────────────
    const emailSubject = `You've been invited to ${orgName}`;
    const emailBody =
      `Hello,\n\n` +
      `You've been invited to ${orgName} on CRM-AI.\n\n` +
      `Click the link below to accept your invitation (valid for 7 days):\n` +
      `${acceptUrl}\n\n` +
      `If you did not expect this invitation, you can safely ignore this email.\n`;

    let emailDelivered = false;
    let emailSimulated = false;
    try {
      const result = await sendEmail(email, emailSubject, emailBody, 'invite');
      emailDelivered = !result.simulated;
      emailSimulated = result.simulated;
      if (result.simulated) {
        logger.warn('iam/invite: Postmark not configured — invite email NOT sent', {
          email, acceptUrl,
        });
      }
    } catch (emailErr: any) {
      logger.error('iam/invite: failed to send invite email', {
        error: emailErr?.message, email,
      });
    }

    res.status(201).json({
      id: memberId,
      user_id: userId,
      role_id,
      status: 'invited',
      invite: {
        token,
        accept_url: acceptUrl,
        expires_at: expiresAt,
        email_delivered: emailDelivered,
        email_simulated: emailSimulated,
      },
    });
  } catch (error) {
    console.error('Error inviting member:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Update member status or role
router.patch('/members/:id', async (req: MultiTenantRequest, res) => {
  if (!req.tenantId || !req.workspaceId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  }

  const { status, role_id } = req.body as { status?: 'active' | 'invited' | 'suspended'; role_id?: string };
  if (!status && !role_id) {
    return sendError(res, 400, 'INVALID_MEMBER_UPDATE', 'At least one field is required: status or role_id');
  }

  const permissions = req.permissions || [];
  const hasPermission = (permission: string) => permissions.includes('*') || permissions.includes(permission);
  const isStatusChange = typeof status === 'string';
  const isRoleChange = typeof role_id === 'string' && role_id.trim().length > 0;

  if (isStatusChange && !hasPermission('members.remove')) {
    return sendError(res, 403, 'FORBIDDEN', 'Missing permission: members.remove', { required: 'members.remove', role: req.roleId || 'unknown' });
  }
  if (isRoleChange && !hasPermission('settings.write')) {
    return sendError(res, 403, 'FORBIDDEN', 'Missing permission: settings.write', { required: 'settings.write', role: req.roleId || 'unknown' });
  }

  try {
    const member = await iamRepository.getMemberById(req.params.id, req.tenantId, req.workspaceId);
    if (!member) return sendError(res, 404, 'MEMBER_NOT_FOUND', 'Member not found');

    // Owner protection: cannot change role or suspend the workspace owner
    const allMembers = await iamRepository.listWorkspaceMembers(req.tenantId, req.workspaceId);
    const sorted = [...allMembers].sort((a: any, b: any) => {
      const ta = new Date(a.joined_at || 0).getTime();
      const tb = new Date(b.joined_at || 0).getTime();
      return ta - tb;
    });
    const ownerMember = sorted.find((m: any) =>
      OWNER_ROLE_NAMES.includes(String(m.role_name || '').toLowerCase())
    ) || sorted[0];

    if (ownerMember && member.id === ownerMember.id) {
      return sendError(res, 403, 'OWNER_PROTECTED', 'The workspace owner cannot be modified. Use transfer-ownership to change the owner.');
    }

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

// Permission catalog — all known permission keys with metadata
router.get('/permissions/catalog', (_req, res) => {
  const catalog = [
    { key: 'inbox.read',         domain: 'Inbox',        action: 'read',    label: 'View conversations',         description: 'Read cases, messages and conversations' },
    { key: 'inbox.write',        domain: 'Inbox',        action: 'write',   label: 'Reply & manage cases',       description: 'Send replies, change status, assign cases' },
    { key: 'cases.read',         domain: 'Inbox',        action: 'read',    label: 'View cases',                 description: 'Read case details and timeline' },
    { key: 'cases.write',        domain: 'Inbox',        action: 'write',   label: 'Edit cases',                 description: 'Update case fields, notes and status' },
    { key: 'cases.assign',       domain: 'Inbox',        action: 'assign',  label: 'Assign cases',               description: 'Reassign cases to agents or teams' },
    { key: 'customers.read',     domain: 'Customers',    action: 'read',    label: 'View customers',             description: 'Read customer profiles and history' },
    { key: 'customers.write',    domain: 'Customers',    action: 'write',   label: 'Edit customers',             description: 'Update customer data, tags and segments' },
    { key: 'orders.read',        domain: 'Orders',       action: 'read',    label: 'View orders',                description: 'Read order details and line items' },
    { key: 'orders.write',       domain: 'Orders',       action: 'write',   label: 'Manage orders',              description: 'Cancel, modify or fulfill orders' },
    { key: 'payments.read',      domain: 'Payments',     action: 'read',    label: 'View payments',              description: 'Read payment records and transactions' },
    { key: 'payments.write',     domain: 'Payments',     action: 'write',   label: 'Process payments & refunds', description: 'Issue refunds, void charges, adjust amounts' },
    { key: 'returns.read',       domain: 'Returns',      action: 'read',    label: 'View returns',               description: 'Read return requests and status' },
    { key: 'returns.write',      domain: 'Returns',      action: 'write',   label: 'Manage returns',             description: 'Approve, reject and process return requests' },
    { key: 'approvals.read',     domain: 'Approvals',    action: 'read',    label: 'View approvals',             description: 'Read approval requests and decisions' },
    { key: 'approvals.write',    domain: 'Approvals',    action: 'write',   label: 'Submit approvals',           description: 'Create and submit approval requests' },
    { key: 'approvals.decide',   domain: 'Approvals',    action: 'decide',  label: 'Approve / Reject',           description: 'Make final decisions on approval requests' },
    { key: 'workflows.read',     domain: 'Workflows',    action: 'read',    label: 'View workflows',             description: 'Read workflow definitions and run history' },
    { key: 'workflows.write',    domain: 'Workflows',    action: 'write',   label: 'Edit workflows',             description: 'Create and edit workflow definitions' },
    { key: 'workflows.trigger',  domain: 'Workflows',    action: 'trigger', label: 'Trigger workflows',          description: 'Manually execute workflow runs' },
    { key: 'knowledge.read',     domain: 'Knowledge',    action: 'read',    label: 'View knowledge base',        description: 'Read articles, snippets and policies' },
    { key: 'knowledge.write',    domain: 'Knowledge',    action: 'write',   label: 'Edit knowledge articles',    description: 'Create and edit knowledge articles' },
    { key: 'knowledge.publish',  domain: 'Knowledge',    action: 'publish', label: 'Publish articles',           description: 'Publish and unpublish knowledge articles' },
    { key: 'reports.read',       domain: 'Reports',      action: 'read',    label: 'View reports',               description: 'Access analytics dashboards and reports' },
    { key: 'reports.export',     domain: 'Reports',      action: 'export',  label: 'Export reports',             description: 'Download reports as CSV / PDF' },
    { key: 'integrations.read',  domain: 'Integrations', action: 'read',    label: 'View integrations',          description: 'See connected apps and API configurations' },
    { key: 'integrations.write', domain: 'Integrations', action: 'write',   label: 'Manage integrations',        description: 'Connect, disconnect and configure apps' },
    { key: 'settings.read',      domain: 'Settings',     action: 'read',    label: 'View workspace settings',    description: 'Read workspace configuration and policies' },
    { key: 'settings.write',     domain: 'Settings',     action: 'write',   label: 'Edit workspace settings',    description: 'Change workspace name, logo and policies' },
    { key: 'members.read',       domain: 'Members',      action: 'read',    label: 'View team members',          description: 'See workspace members, roles and status' },
    { key: 'members.invite',     domain: 'Members',      action: 'invite',  label: 'Invite members',             description: 'Send invitations to new team members' },
    { key: 'members.remove',     domain: 'Members',      action: 'delete',  label: 'Remove / suspend members',   description: 'Suspend or remove members from workspace' },
    { key: 'billing.read',       domain: 'Billing',      action: 'read',    label: 'View billing & usage',       description: 'Read invoices, usage metrics and plan info' },
    { key: 'billing.manage',     domain: 'Billing',      action: 'manage',  label: 'Manage billing',             description: 'Upgrade plan, manage seats and payment methods' },
    { key: 'audit.read',         domain: 'Audit',        action: 'read',    label: 'View audit log',             description: 'Read workspace activity and security log' },
  ];
  res.json(catalog);
});

// Transfer workspace ownership
router.post('/members/:id/transfer-ownership', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  if (!req.tenantId || !req.workspaceId) {
    return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
  }

  try {
    const targetMember = await iamRepository.getMemberById(req.params.id, req.tenantId, req.workspaceId);
    if (!targetMember) return sendError(res, 404, 'MEMBER_NOT_FOUND', 'Member not found');

    // Find the owner role
    const ownerRole = await iamRepository.getRoleByName('owner', req.tenantId, req.workspaceId)
      || await iamRepository.getRoleByName('workspace_admin', req.tenantId, req.workspaceId);

    if (ownerRole) {
      // Demote current caller to admin role
      if (req.userId) {
        const currentMember = await iamRepository.getMember(req.userId, req.tenantId, req.workspaceId);
        const adminRole = await iamRepository.getRoleByName('supervisor', req.tenantId, req.workspaceId);
        if (currentMember && adminRole) {
          await iamRepository.updateMember(currentMember.id, { roleId: adminRole.id });
        }
      }
      // Promote target to owner
      await iamRepository.updateMember(req.params.id, { roleId: ownerRole.id });
    }

    res.json({ id: req.params.id, ownership_transferred: true });
  } catch (error) {
    console.error('Error transferring ownership:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// Resend / create invitation link (mock — returns a token URL)
router.post('/members/invite/resend', requirePermission('members.invite'), async (req: MultiTenantRequest, res) => {
  const { email, role_id } = req.body as { email?: string; role_id?: string };
  if (!email) return sendError(res, 400, 'INVALID_PAYLOAD', 'email is required');

  try {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const acceptUrl = `${process.env.APP_URL || 'http://localhost:5173'}/accept-invite?token=${token}`;

    res.json({ email, token, expires_at: expiresAt, accept_url: acceptUrl, role_id });
  } catch (error) {
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// ── POST /api/iam/accept-invite ──────────────────────────────────────────────
// Public endpoint — validates an invitation token, marks the corresponding
// member as 'active' and consumes the token. No tenant/workspace headers
// required (the token itself carries the binding).
router.post('/accept-invite', async (req, res) => {
  const { token } = req.body as { token?: string };
  if (!token || typeof token !== 'string') {
    return sendError(res, 400, 'INVALID_INVITE_TOKEN', 'token is required');
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');

  try {
    const supabase = getSupabaseAdmin();

    const { data: row, error } = await supabase
      .from('invite_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (error) {
      logger.error('iam/accept-invite: lookup failed', { error: error.message });
      return sendError(res, 500, 'INTERNAL_ERROR', 'Failed to validate invite');
    }
    if (!row) {
      return sendError(res, 404, 'INVITE_NOT_FOUND', 'Invitation not found or already used');
    }
    if (row.consumed_at) {
      return sendError(res, 410, 'INVITE_ALREADY_USED', 'Invitation has already been used');
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return sendError(res, 410, 'INVITE_EXPIRED', 'Invitation has expired');
    }

    // Activate member and consume token (best-effort sequence — RLS bypassed
    // by service-role client).
    await iamRepository.updateMember(row.member_id, { status: 'active' });

    const { error: deleteError } = await supabase
      .from('invite_tokens')
      .delete()
      .eq('token_hash', tokenHash);
    if (deleteError) {
      // If deletion fails, mark consumed instead so the token cannot be reused.
      await supabase
        .from('invite_tokens')
        .update({ consumed_at: new Date().toISOString() })
        .eq('token_hash', tokenHash);
    }

    res.json({
      ok: true,
      member_id:    row.member_id,
      user_id:      row.user_id,
      tenant_id:    row.tenant_id,
      workspace_id: row.workspace_id,
      email:        row.email,
    });
  } catch (err: any) {
    logger.error('iam/accept-invite: unexpected error', { error: err?.message });
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to accept invitation');
  }
});

export default router;
