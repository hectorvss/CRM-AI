import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import {
  listTopics,
  getTopic,
  createTopic,
  updateTopic,
  deleteTopic,
} from '../data/topics.js';

const router = Router();
router.use(extractMultiTenant);

const CreateSchema = z.object({
  name:  z.string().min(1, 'Name is required').max(80),
  color: z.string().max(16).optional().nullable(),
});
const UpdateSchema = z.object({
  name:     z.string().min(1).max(80).optional(),
  color:    z.string().max(16).optional().nullable(),
  archived: z.boolean().optional(),
});

// GET /api/topics?includeArchived=true
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const items = await listTopics(scope, { includeArchived: req.query.includeArchived === 'true' });
    res.json(items);
  } catch (err) {
    console.error('Error listing topics:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/topics
router.post(
  '/',
  requirePermission('settings.write'),
  validate({ body: CreateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await createTopic(scope, req.body);
      res.status(201).json(item);
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'Ya existe un tema con ese nombre' });
      console.error('Error creating topic:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PATCH /api/topics/:id  (rename, recolour, or archive/unarchive)
router.patch(
  '/:id',
  requirePermission('settings.write'),
  validate({ body: UpdateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await getTopic(scope, req.params.id);
      if (!item) return res.status(404).json({ error: 'Topic not found' });
      const updated = await updateTopic(scope, req.params.id, req.body);
      res.json(updated);
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'Nombre de tema ya en uso' });
      console.error('Error updating topic:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// DELETE /api/topics/:id
router.delete(
  '/:id',
  requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await getTopic(scope, req.params.id);
      if (!item) return res.status(404).json({ error: 'Topic not found' });
      await deleteTopic(scope, req.params.id);
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting topic:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
