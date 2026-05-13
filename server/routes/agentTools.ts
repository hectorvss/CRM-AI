import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import {
  listAgentTools, getAgentTool, createAgentTool, updateAgentTool, deleteAgentTool,
  executeHttpTool,
} from '../data/agentTools.js';

const router = Router();
router.use(extractMultiTenant);

const TOOL_TYPES = ['http_request','sql_query','javascript','mcp_call','builtin'] as const;
const HTTP_METHODS = ['GET','POST','PUT','PATCH','DELETE'] as const;
const AUTH_TYPES = ['none','bearer','api_key','oauth2'] as const;

const CreateSchema = z.object({
  name:           z.string().min(1),
  description:    z.string().optional().nullable(),
  tool_type:      z.enum(TOOL_TYPES),
  endpoint_url:   z.string().url().optional().nullable(),
  http_method:    z.enum(HTTP_METHODS).optional().nullable(),
  headers:        z.record(z.string(), z.string()).default({}),
  input_schema:   z.record(z.string(), z.unknown()).default({}),
  output_schema:  z.record(z.string(), z.unknown()).default({}),
  auth_type:      z.enum(AUTH_TYPES).optional().nullable(),
  auth_config:    z.record(z.string(), z.unknown()).default({}),
  enabled:        z.boolean().default(true),
});
const UpdateSchema = CreateSchema.partial();
const ExecuteSchema = z.object({ args: z.record(z.string(), z.unknown()).default({}) });

router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await listAgentTools(scope, req.query.enabled === 'true'));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const item = await getAgentTool(scope, req.params.id);
    if (!item) return res.status(404).json({ error: 'Agent tool not found' });
    res.json(item);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/', requirePermission('settings.write'), validate({ body: CreateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      res.status(201).json(await createAgentTool(scope, req.body));
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'Tool name already exists' });
      console.error(err); res.status(500).json({ error: 'Internal server error' });
    }
  });

router.patch('/:id', requirePermission('settings.write'), validate({ body: UpdateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const existing = await getAgentTool(scope, req.params.id);
      if (!existing) return res.status(404).json({ error: 'Agent tool not found' });
      res.json(await updateAgentTool(scope, req.params.id, req.body));
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

router.delete('/:id', requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const existing = await getAgentTool(scope, req.params.id);
      if (!existing) return res.status(404).json({ error: 'Agent tool not found' });
      await deleteAgentTool(scope, req.params.id);
      res.status(204).send();
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

// POST /api/agent-tools/:id/execute  — run an HTTP tool
router.post('/:id/execute', validate({ body: ExecuteSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const tool = await getAgentTool(scope, req.params.id);
      if (!tool) return res.status(404).json({ error: 'Agent tool not found' });
      if (!tool.enabled) return res.status(400).json({ error: 'Tool is disabled' });
      const result = await executeHttpTool(tool as Record<string, unknown>, req.body.args ?? {});
      res.json(result);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

export default router;
