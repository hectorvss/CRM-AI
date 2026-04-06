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

/**
 * Middleware: extractMultiTenant
 * - Extracts tenant context from headers.
 * - For development, falls back to the first organization/workspace in the DB if none provided.
 */
export const extractMultiTenant = (req: MultiTenantRequest, res: Response, next: NextFunction) => {
  const tenantHeader = req.headers['x-tenant-id'] as string;
  const workspaceHeader = req.headers['x-workspace-id'] as string;
  const userHeader = req.headers['x-user-id'] as string;

  if (tenantHeader && workspaceHeader) {
    req.tenantId = tenantHeader;
    req.workspaceId = workspaceHeader;
    req.userId = userHeader || 'system';
    return next();
  }

  // Development Fallback
  try {
    const db = getDb();
    
    // Get the first workspace and its org_id
    const ws = db.prepare('SELECT id, org_id FROM workspaces LIMIT 1').get() as { id: string, org_id: string } | undefined;
    
    if (ws) {
      req.tenantId = ws.org_id;
      req.workspaceId = ws.id;
    } else {
      // Hard fallback if DB is empty
      req.tenantId = 'tenant_default';
      req.workspaceId = 'workspace_default';
    }

    // Default user if none provided
    req.userId = userHeader || 'system';
    next();
  } catch (error) {
    console.error('Multi-tenant middleware error:', error);
    res.status(500).json({ error: 'Failed to establish multi-tenant context' });
  }
};
