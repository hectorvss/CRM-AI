import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { createIAMRepository } from '../data/iam.js';
import { createWorkspaceRepository } from '../data/workspaces.js';
import { logger } from '../utils/logger.js';

/**
 * Custom Request type to include tenant and workspace context.
 */
export interface MultiTenantRequest extends Request {
  tenantId?: string;
  workspaceId?: string;
  userId?: string;
  roleId?: string;
  permissions?: string[];
}

const ROLE_PERMISSION_PRESETS: Record<string, string[]> = {
  workspace_admin: ['*'],
  supervisor: [
    'cases.read', 'cases.write', 'cases.assign',
    'approvals.read', 'approvals.decide',
    'workflows.read', 'workflows.write', 'workflows.trigger',
    'knowledge.read', 'knowledge.write', 'knowledge.publish',
    'reports.read', 'reports.export',
    'settings.read', 'settings.write',
    'members.read', 'members.invite', 'members.remove',
    'audit.read',
  ],
  agent: [
    'cases.read', 'cases.write',
    'approvals.read',
    'workflows.read', 'workflows.trigger',
    'knowledge.read',
    'reports.read',
    'settings.read',
  ],
  viewer: [
    'cases.read',
    'approvals.read',
    'workflows.read',
    'knowledge.read',
    'reports.read',
    'settings.read',
  ],
  billing_admin: ['billing.read', 'billing.manage'],
};

function normalizePermissions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((permission): permission is string => typeof permission === 'string');
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((permission): permission is string => typeof permission === 'string')
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

async function resolvePermissions(
  roleId: string,
  explicitPermissions: unknown,
): Promise<string[]> {
  const iamRepo = createIAMRepository();
  try {
    const mappedPermissions = await iamRepo.getPermissionKeys(roleId);

    if (mappedPermissions.length > 0) {
      return mappedPermissions;
    }
  } catch (error) {
    // Falls back if role management is not fully initialized or custom roles are missing
  }

  const parsedPermissions = normalizePermissions(explicitPermissions);
  return parsedPermissions.length > 0
    ? parsedPermissions
    : ROLE_PERMISSION_PRESETS[roleId] || ROLE_PERMISSION_PRESETS.viewer;
}

export interface ResolvedTenantContext {
  tenantId: string;
  workspaceId: string;
  userId?: string;
}

export async function resolveTenantWorkspaceContext(
  tenantId?: string | null,
  workspaceId?: string | null,
  userId?: string | null,
): Promise<ResolvedTenantContext> {
  const workspaceRepo = createWorkspaceRepository();

  if (tenantId && workspaceId && workspaceId !== 'ws_default') {
    return {
      tenantId,
      workspaceId,
      userId: userId || 'system',
    };
  }

  try {
    if (tenantId && workspaceId === 'ws_default') {
      const workspace = await workspaceRepo.getById(workspaceId, tenantId);
      if (workspace) {
        return {
          tenantId: workspace.org_id || tenantId,
          workspaceId: workspace.id,
          userId: userId || 'system',
        };
      }
    }

    if (tenantId && !workspaceId) {
      const matchingWorkspace = await workspaceRepo.findByOrg(tenantId);
      if (matchingWorkspace) {
        return {
          tenantId: matchingWorkspace.org_id,
          workspaceId: matchingWorkspace.id,
          userId: userId || 'system',
        };
      }
    }

    const ws = await workspaceRepo.getFirstWorkspace();
    if (ws) {
      return {
        tenantId: tenantId || ws.org_id,
        workspaceId: workspaceId || ws.id,
        userId: userId || 'system',
      };
    }
  } catch {
    // Fall through to demo defaults if the backing store is not yet ready.
  }

  return {
    tenantId: tenantId || 'org_default',
    workspaceId: workspaceId || 'ws_default',
    userId: userId || 'system',
  };
}

/**
 * Middleware: extractMultiTenant
 * - Extracts tenant context from headers.
 * - For development, falls back to the first organization/workspace in the DB if none provided.
 */
export const extractMultiTenant = async (req: MultiTenantRequest, res: Response, next: NextFunction) => {
  const tenantHeader = req.headers['x-tenant-id'] as string;
  const workspaceHeader = req.headers['x-workspace-id'] as string;
  const userHeader = req.headers['x-user-id'] as string;
  const authHeader = req.headers.authorization;

  const iamRepo = createIAMRepository();

  try {
    let resolvedUserId = userHeader || '';
    let resolved = await resolveTenantWorkspaceContext(tenantHeader, workspaceHeader, resolvedUserId);

    if (!resolvedUserId && typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
      const rawToken = authHeader.slice(7).trim();
      if (rawToken) {
        const tokenHash = createHash('sha256').update(rawToken).digest('hex');
        try {
          const session = await iamRepo.getSession(tokenHash);

          if (session?.user_id) {
            resolvedUserId = session.user_id;
            resolved = await resolveTenantWorkspaceContext(
              session.tenant_id || tenantHeader,
              session.workspace_id || workspaceHeader,
              resolvedUserId,
            );
          }
        } catch {
          // Backward compatibility/safety
        }
      }
    }

    req.tenantId = resolved.tenantId;
    req.workspaceId = resolved.workspaceId;
    req.userId = resolved.userId;

    logger.debug('Multi-tenant context established', {
      tenantId: req.tenantId,
      workspaceId: req.workspaceId,
      userId: req.userId,
      path: req.path
    });

    if (req.userId === 'system') {
      req.roleId = 'workspace_admin';
      req.permissions = ['*'];
      return next();
    }

    try {
      const member = await iamRepo.getMember(req.userId || '', req.tenantId || '', req.workspaceId || '');
      let legacyRole = null;
      let permissions = null;

      if (!member) {
        // Check for legacy user role if not a member yet (e.g. global user)
        const user = await iamRepo.getUserById(req.userId || '');
        legacyRole = user?.role;
      }

      const roleId = member?.role_id || legacyRole || 'viewer';
      req.roleId = roleId;
      req.permissions = await resolvePermissions(roleId, member?.permissions || permissions);

      next();
    } catch (memberError) {
      logger.warn('Falling back to demo tenant context', {
        path: req.path,
        error: memberError instanceof Error ? memberError.message : String(memberError),
      });
      req.userId = req.userId || 'system';
      req.roleId = 'workspace_admin';
      req.permissions = ['*'];
      next();
    }
  } catch (error) {
    logger.warn('Multi-tenant middleware fallback triggered', {
      path: req.path,
      error: error instanceof Error ? error.message : String(error),
    });
    req.tenantId = req.tenantId || 'org_default';
    req.workspaceId = req.workspaceId || 'ws_default';
    req.userId = req.userId || 'system';
    req.roleId = 'workspace_admin';
    req.permissions = ['*'];
    next();
  }
};
