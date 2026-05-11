import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import {
  listMcpServers, getMcpServer, createMcpServer, updateMcpServer, deleteMcpServer,
  pingMcpServer, updateToolsSchema,
} from '../data/mcpServers.js';

const router = Router();
router.use(extractMultiTenant);

const TRANSPORTS = ['stdio','http','sse'] as const;

const CreateSchema = z.object({
  name:          z.string().min(1),
  description:   z.string().optional().nullable(),
  transport:     z.enum(TRANSPORTS),
  endpoint_url:  z.string().url().optional().nullable(),
  command:       z.string().optional().nullable(),
  args:          z.array(z.string()).default([]),
  env_vars:      z.record(z.string(), z.string()).default({}),
  tools_schema:  z.array(z.unknown()).default([]),
  resources:     z.array(z.unknown()).default([]),
  enabled:       z.boolean().default(true),
});
const UpdateSchema = CreateSchema.partial();
const UpdateToolsSchema = z.object({
  tools_schema: z.array(z.unknown()),
  resources:    z.array(z.unknown()).default([]),
});

router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await listMcpServers(scope, req.query.enabled === 'true'));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const item = await getMcpServer(scope, req.params.id);
    if (!item) return res.status(404).json({ error: 'MCP server not found' });
    res.json(item);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/', requirePermission('settings.write'), validate({ body: CreateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      res.status(201).json(await createMcpServer(scope, req.body));
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'MCP server name already exists' });
      console.error(err); res.status(500).json({ error: 'Internal server error' });
    }
  });

router.patch('/:id', requirePermission('settings.write'), validate({ body: UpdateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const existing = await getMcpServer(scope, req.params.id);
      if (!existing) return res.status(404).json({ error: 'MCP server not found' });
      res.json(await updateMcpServer(scope, req.params.id, req.body));
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

router.delete('/:id', requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const existing = await getMcpServer(scope, req.params.id);
      if (!existing) return res.status(404).json({ error: 'MCP server not found' });
      await deleteMcpServer(scope, req.params.id);
      res.status(204).send();
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

// POST /api/mcp-servers/:id/ping
router.post('/:id/ping', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    await pingMcpServer(scope, req.params.id);
    res.json({ ok: true, pinged_at: new Date().toISOString() });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// PATCH /api/mcp-servers/:id/tools  — update discovered tools schema
router.patch('/:id/tools', validate({ body: UpdateToolsSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      await updateToolsSchema(scope, req.params.id, req.body.tools_schema, req.body.resources);
      res.json({ ok: true });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

export default router;
