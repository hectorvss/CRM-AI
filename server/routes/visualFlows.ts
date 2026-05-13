import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import {
  listVisualFlows, getVisualFlow, createVisualFlow, updateVisualFlow, deleteVisualFlow,
  createFlowVersion, listFlowVersions, restoreFlowVersion,
} from '../data/visualFlows.js';

const router = Router();
router.use(extractMultiTenant);

const STATUSES = ['draft','published','archived'] as const;

const CreateSchema = z.object({
  name:        z.string().min(1),
  description: z.string().optional().nullable(),
  nodes:       z.array(z.unknown()).default([]),
  edges:       z.array(z.unknown()).default([]),
  viewport:    z.record(z.string(), z.unknown()).default({}),
  status:      z.enum(STATUSES).default('draft'),
  created_by:  z.string().uuid().optional().nullable(),
});
const UpdateSchema = CreateSchema.partial();
const VersionSchema = z.object({
  change_summary: z.string().optional(),
  created_by:     z.string().uuid().optional(),
});

router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await listVisualFlows(scope, req.query.status as any));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const item = await getVisualFlow(scope, req.params.id);
    if (!item) return res.status(404).json({ error: 'Flow not found' });
    res.json(item);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/', requirePermission('settings.write'), validate({ body: CreateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      res.status(201).json(await createVisualFlow(scope, req.body));
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

router.patch('/:id', requirePermission('settings.write'), validate({ body: UpdateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const existing = await getVisualFlow(scope, req.params.id);
      if (!existing) return res.status(404).json({ error: 'Flow not found' });
      res.json(await updateVisualFlow(scope, req.params.id, req.body));
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

router.delete('/:id', requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const existing = await getVisualFlow(scope, req.params.id);
      if (!existing) return res.status(404).json({ error: 'Flow not found' });
      await deleteVisualFlow(scope, req.params.id);
      res.status(204).send();
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

// POST /api/visual-flows/:id/versions  — create a version snapshot
router.post('/:id/versions', validate({ body: VersionSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      res.status(201).json(
        await createFlowVersion(scope, req.params.id, req.body.change_summary, req.body.created_by),
      );
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

// GET /api/visual-flows/:id/versions
router.get('/:id/versions', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await listFlowVersions(scope, req.params.id));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/visual-flows/:id/versions/:version/restore
router.post('/:id/versions/:version/restore', requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      res.json(await restoreFlowVersion(scope, req.params.id, parseInt(req.params.version)));
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

export default router;
