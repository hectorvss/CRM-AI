import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import {
  listCustomObjectTypes,
  getCustomObjectType,
  createCustomObjectType,
  updateCustomObjectType,
  deleteCustomObjectType,
} from '../data/customObjectTypes.js';

const router = Router();
router.use(extractMultiTenant);

const CreateSchema = z.object({
  name:        z.string().min(1, 'Name is required').max(120),
  object_key:  z.string().max(60).optional(),
  description: z.string().max(1000).optional().nullable(),
  icon:        z.string().max(16).optional().nullable(),
});
const UpdateSchema = CreateSchema.partial();

// GET /api/custom-object-types
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await listCustomObjectTypes(scope));
  } catch (err) {
    console.error('Error listing custom object types:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/custom-object-types
router.post(
  '/',
  requirePermission('settings.write'),
  validate({ body: CreateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await createCustomObjectType(scope, {
        ...req.body,
        object_key: req.body.object_key ?? req.body.name,
        created_by: req.userId ?? null,
      });
      res.status(201).json(item);
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'Ya existe un objeto con esa clave' });
      console.error('Error creating custom object type:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PATCH /api/custom-object-types/:id
router.patch(
  '/:id',
  requirePermission('settings.write'),
  validate({ body: UpdateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await getCustomObjectType(scope, req.params.id);
      if (!item) return res.status(404).json({ error: 'Custom object type not found' });
      res.json(await updateCustomObjectType(scope, req.params.id, req.body));
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'Clave ya en uso' });
      console.error('Error updating custom object type:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// DELETE /api/custom-object-types/:id
router.delete(
  '/:id',
  requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await getCustomObjectType(scope, req.params.id);
      if (!item) return res.status(404).json({ error: 'Custom object type not found' });
      await deleteCustomObjectType(scope, req.params.id);
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting custom object type:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
