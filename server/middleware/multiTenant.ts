import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/client.js';
import { createHash } from 'crypto';

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

function resolvePermissions(
  roleId: string,
  explicitPermissions: unknown,
): string[] {
  const db = getDb();
  try {
    const rows = db.prepare(`
      SELECT permission_key
      FROM role_permissions
      WHERE role_id = ?
    `).all(roleId) as Array<{ permission_key?: string | null }>;

    const mappedPermissions = rows
      .map((row) => row.permission_key)
      .filter((permission): permission is string => typeof permission === 'string' && permission.length > 0);

    if (mappedPermissions.length > 0) {
      return mappedPermissions;
    }
  } catch {
    // Local databases created before normalized permissions may not have this table yet.
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

export function resolveTenantWorkspaceContext(
  tenantId?: string | null,
  workspaceId?: string | null,
  userId?: string | null,
): ResolvedTenantContext {
  if (tenantId && workspaceId) {
    return {
      tenantId,
      workspaceId,
      userId: userId || 'system',
    };
  }

  const db = getDb();

  if (tenantId && !workspaceId) {
    const matchingWorkspace = db.prepare(`
      SELECT id, org_id FROM workspaces
      WHERE org_id = ?
      ORDER BY created_at ASC
      LIMIT 1
    `).get(tenantId) as { id: string; org_id: string } | undefined;

    if (matchingWorkspace) {
      return {
        tenantId: matchingWorkspace.org_id,
        workspaceId: matchingWorkspace.id,
        userId: userId || 'system',
      };
    }
  }

  const ws = db.prepare('SELECT id, org_id FROM workspaces ORDER BY created_at ASC LIMIT 1').get() as { id: string, org_id: string } | undefined;

  if (ws) {
    const seededTenant = db.prepare(`
      SELECT tenant_id
      FROM (
        SELECT tenant_id, created_at FROM cases
        UNION ALL
        SELECT tenant_id, created_at FROM customers
      )
      WHERE tenant_id IS NOT NULL
      ORDER BY created_at ASC
      LIMIT 1
    `).get() as { tenant_id: string } | undefined;

    return {
      tenantId: tenantId || seededTenant?.tenant_id || ws.org_id,
      workspaceId: workspaceId || ws.id,
      userId: userId || 'system',
    };
  }

  return {
    tenantId: tenantId || 'tenant_default',
    workspaceId: workspaceId || 'workspace_default',
    userId: userId || 'system',
  };
}

/**
 * Middleware: extractMultiTenant
 * - Extracts tenant context from headers.
 * - For development, falls back to the first organization/workspace in the DB if none provided.
 */
export const extractMultiTenant = (req: MultiTenantRequest, res: Response, next: NextFunction) => {
  const tenantHeader = req.headers['x-tenant-id'] as string;
  const workspaceHeader = req.headers['x-workspace-id'] as string;
  const userHeader = req.headers['x-user-id'] as string;
  const authHeader = req.headers.authorization;

  try {
    let resolvedUserId = userHeader || '';
    let resolved = resolveTenantWorkspaceContext(tenantHeader, workspaceHeader, resolvedUserId);
    const db = getDb();

    if (!resolvedUserId && typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
      const rawToken = authHeader.slice(7).trim();
      if (rawToken) {
        const tokenHash = createHash('sha256').update(rawToken).digest('hex');
        try {
          const session = db.prepare(`
            SELECT user_id, tenant_id, workspace_id
            FROM user_sessions
            WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
            LIMIT 1
          `).get(tokenHash) as { user_id?: string; tenant_id?: string; workspace_id?: string } | undefined;

          if (session?.user_id) {
            resolvedUserId = session.user_id;
            resolved = resolveTenantWorkspaceContext(
              session.tenant_id || tenantHeader,
              session.workspace_id || workspaceHeader,
              resolvedUserId,
            );
          }
        } catch {
          // Backward compatibility for environments without user_sessions yet.
        }
      }
    }

    req.tenantId = resolved.tenantId;
    req.workspaceId = resolved.workspaceId;
    req.userId = resolved.userId;

    if (req.userId === 'system') {
      req.roleId = 'workspace_admin';
      req.permissions = ['*'];
      return next();
    }

    const member = db.prepare(`
      SELECT m.role_id, r.permissions, u.role as legacy_role
      FROM users u
      LEFT JOIN members m ON m.user_id = u.id AND m.workspace_id = ? AND m.tenant_id = ?
      LEFT JOIN roles r ON r.id = m.role_id
      WHERE u.id = ?
      LIMIT 1
    `).get(req.workspaceId, req.tenantId, req.userId) as
      | { role_id?: string | null; permissions?: unknown; legacy_role?: string | null }
      | undefined;

    const roleId = member?.role_id || member?.legacy_role || 'viewer';
    req.roleId = roleId;
    req.permissions = resolvePermissions(roleId, member?.permissions);

    next();
  } catch (error) {
    console.error('Multi-tenant middleware error:', error);
    res.status(500).json({ error: 'Failed to establish multi-tenant context' });
  }
};
