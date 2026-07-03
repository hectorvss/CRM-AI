import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import {
  listWebhooks,
  getWebhook,
  createWebhook,
  updateWebhook,
  deleteWebhook,
} from '../data/webhookSubscriptions.js';

const router = Router();
router.use(extractMultiTenant);

const CreateSchema = z.object({
  url:    z.string().url('Debe ser una URL válida').max(500),
  events: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});
const UpdateSchema = z.object({
  url:    z.string().url().max(500).optional(),
  events: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

// GET /api/webhook-subscriptions
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await listWebhooks(scope));
  } catch (err) {
    console.error('Error listing webhook subscriptions:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/webhook-subscriptions
router.post(
  '/',
  requirePermission('settings.write'),
  validate({ body: CreateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await createWebhook(scope, { ...req.body, created_by: req.userId ?? null });
      res.status(201).json(item);
    } catch (err) {
      console.error('Error creating webhook subscription:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PATCH /api/webhook-subscriptions/:id  (url, events, or active toggle)
router.patch(
  '/:id',
  requirePermission('settings.write'),
  validate({ body: UpdateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await getWebhook(scope, req.params.id);
      if (!item) return res.status(404).json({ error: 'Webhook not found' });
      res.json(await updateWebhook(scope, req.params.id, req.body));
    } catch (err) {
      console.error('Error updating webhook subscription:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// DELETE /api/webhook-subscriptions/:id
router.delete(
  '/:id',
  requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await getWebhook(scope, req.params.id);
      if (!item) return res.status(404).json({ error: 'Webhook not found' });
      await deleteWebhook(scope, req.params.id);
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting webhook subscription:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
