import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/client.js';

/**
 * Custom Request type to include tenant and workspace context.
 */
export interface MultiTenantRequest extends Request {
  tenantId?: string;
  workspaceId?: string;
  userId?: string;
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

  try {
    const resolved = resolveTenantWorkspaceContext(tenantHeader, workspaceHeader, userHeader);
    req.tenantId = resolved.tenantId;
    req.workspaceId = resolved.workspaceId;
    req.userId = resolved.userId;
    next();
  } catch (error) {
    console.error('Multi-tenant middleware error:', error);
    res.status(500).json({ error: 'Failed to establish multi-tenant context' });
  }
};
