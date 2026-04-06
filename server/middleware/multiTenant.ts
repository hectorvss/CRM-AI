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
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string');
    } catch {
      return [];
    }
  }
  return [];
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
    const db = getDb();

    if (tenantHeader && workspaceHeader) {
      req.tenantId = tenantHeader;
      req.workspaceId = workspaceHeader;
    } else {
      // Development fallback
      const ws = db.prepare('SELECT id, org_id FROM workspaces LIMIT 1').get() as { id: string; org_id: string } | undefined;
      req.tenantId = ws?.org_id || 'tenant_default';
      req.workspaceId = ws?.id || 'workspace_default';
    }

    let resolvedUserId = userHeader || '';
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
            if (session.tenant_id && session.workspace_id) {
              req.tenantId = session.tenant_id;
              req.workspaceId = session.workspace_id;
            }
          }
        } catch {
          // Backward compatibility for environments without user_sessions table.
        }
      }
    }

    req.userId = resolvedUserId || 'user_alex';

    // Explicit system actor only when provided by header
    if (req.userId === 'system') {
      req.roleId = 'workspace_admin';
      req.permissions = ['*'];
      return next();
    }

    // Resolve member + role in one pass
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
    const explicitPerms = normalizePermissions(member?.permissions);

    // Preferred path: normalized role_permissions mapping (DB-driven RBAC)
    let mappedPerms: string[] = [];
    try {
      const mappedPermRows = db.prepare(`
        SELECT rp.permission_key
        FROM role_permissions rp
        WHERE rp.role_id = ?
      `).all(roleId) as Array<{ permission_key?: string | null }>;
      mappedPerms = mappedPermRows
        .map((r) => r.permission_key)
        .filter((v): v is string => typeof v === 'string' && v.length > 0);
    } catch {
      // Backward compatibility for local DBs that still don't have role_permissions.
      mappedPerms = [];
    }

    const fallbackPerms = ROLE_PERMISSION_PRESETS[roleId] || ROLE_PERMISSION_PRESETS.viewer;

    req.roleId = roleId;
    req.permissions =
      mappedPerms.length > 0 ? mappedPerms :
      explicitPerms.length > 0 ? explicitPerms :
      fallbackPerms;
    next();
  } catch (error) {
    console.error('Multi-tenant middleware error:', error);
    res.status(500).json({ code: 'TENANT_CONTEXT_ERROR', message: 'Failed to establish multi-tenant context' });
  }
};
