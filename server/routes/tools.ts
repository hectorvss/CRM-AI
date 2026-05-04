/**
 * server/routes/tools.ts
 *
 * Unified tool-invocation API. Any frontend surface (Copilot, agent UI,
 * automation builder, scheduled actions) can:
 *
 *   GET  /api/tools                — list tools the caller is allowed to use
 *   POST /api/tools/invoke         — execute one tool by name
 *
 * Requires authentication + tenant context. The tool's own
 * `requiredPermission` is enforced inside `invokeTool()`.
 */

import { Router, Response } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { invokeTool, listAvailableTools } from '../agents/planEngine/invokeTool.js';
import { logger } from '../utils/logger.js';

export const toolsRouter = Router();

/**
 * GET /api/tools
 * Returns the tool catalog visible to the caller (filtered by permissions
 * and excluding deprecated/blocked tools). Includes argument and return
 * schemas so the Copilot LLM can plan tool calls.
 */
toolsRouter.get('/', extractMultiTenant, (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const hasPermission = (perm: string) => Array.isArray(req.permissions) && req.permissions.includes(perm);
  const tools = listAvailableTools(hasPermission);
  return res.json({ ok: true, count: tools.length, tools });
});

/**
 * POST /api/tools/invoke
 * Body: { tool: string, args?: object, dry_run?: boolean }
 * Returns { ok, value | error, errorCode, durationMs, dryRun, toolName }
 */
toolsRouter.post('/invoke', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const toolName = String(req.body?.tool || '').trim();
  const args = req.body?.args ?? {};
  const dryRun = req.body?.dry_run === true;
  if (!toolName) return res.status(400).json({ error: 'tool is required (e.g. "linear.issue.create")' });

  const hasPermission = (perm: string) => Array.isArray(req.permissions) && req.permissions.includes(perm);

  try {
    const result = await invokeTool({
      toolName, args,
      tenantId: req.tenantId,
      workspaceId: req.workspaceId ?? null,
      userId: req.userId ?? null,
      hasPermission,
      dryRun,
    });

    if (!result.ok) {
      const code = (result as { ok: false; errorCode: string }).errorCode;
      const status = code === 'TOOL_NOT_FOUND' ? 404
        : code === 'PERMISSION_DENIED' ? 403
        : code === 'INVALID_ARGS' ? 400
        : code === 'TIMEOUT' ? 504
        : 500;
      return res.status(status).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    logger.warn('POST /api/tools/invoke threw', { error: String(err?.message ?? err) });
    return res.status(500).json({ ok: false, error: 'internal error invoking tool' });
  }
});

/**
 * Surface guard: this set of permissions covers everything the planEngine
 * tools require (cases.read|write, customers.read|write, knowledge.read|write,
 * settings.read). Bind it on the router-level via requirePermission so callers
 * that have NONE of these get an early 403 — the per-tool permission check
 * inside invokeTool() will still gate individual tools.
 */
export const toolsRouterMinPermission = requirePermission('cases.read');
