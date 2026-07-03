import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import {
  listLabels,
  getLabel,
  createLabel,
  updateLabel,
  deleteLabel,
} from '../data/labels.js';

const router = Router();
router.use(extractMultiTenant);

// ── Schemas ───────────────────────────────────────────────────────────────────

const CreateSchema = z.object({
  name:  z.string().min(1, 'Name is required').max(80),
  color: z.string().max(16).optional().nullable(),
});
const UpdateSchema = CreateSchema.partial();

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/labels?q=...
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const items = await listLabels(scope, {
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
    });
    res.json(items);
  } catch (err) {
    console.error('Error listing labels:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/labels
router.post(
  '/',
  requirePermission('settings.write'),
  validate({ body: CreateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await createLabel(scope, { ...req.body, created_by: req.userId ?? null });
      res.status(201).json(item);
    } catch (err: any) {
      if (err?.code === '23505') {
        return res.status(409).json({ error: 'Ya existe una etiqueta con ese nombre' });
      }
      console.error('Error creating label:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PATCH /api/labels/:id
router.patch(
  '/:id',
  requirePermission('settings.write'),
  validate({ body: UpdateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await getLabel(scope, req.params.id);
      if (!item) return res.status(404).json({ error: 'Label not found' });
      const updated = await updateLabel(scope, req.params.id, req.body);
      res.json(updated);
    } catch (err: any) {
      if (err?.code === '23505') {
        return res.status(409).json({ error: 'Nombre de etiqueta ya en uso' });
      }
      console.error('Error updating label:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// DELETE /api/labels/:id
router.delete(
  '/:id',
  requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await getLabel(scope, req.params.id);
      if (!item) return res.status(404).json({ error: 'Label not found' });
      await deleteLabel(scope, req.params.id);
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting label:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
