import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import {
  listCustomObjectFields,
  getCustomObjectField,
  createCustomObjectField,
  updateCustomObjectField,
  deleteCustomObjectField,
} from '../data/customObjectFields.js';

const router = Router();
router.use(extractMultiTenant);

const fieldTypeEnum = z.enum(['text', 'number', 'boolean', 'date', 'select', 'email', 'url']);
const CreateSchema = z.object({
  object_type_id: z.string().min(1),
  name:           z.string().min(1, 'Name is required').max(120),
  field_key:      z.string().max(60).optional(),
  field_type:     fieldTypeEnum.optional(),
  required:       z.boolean().optional(),
  sort_order:     z.number().int().optional(),
});
const UpdateSchema = z.object({
  name:       z.string().min(1).max(120).optional(),
  field_type: fieldTypeEnum.optional(),
  required:   z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

// GET /api/custom-object-fields?object_type_id=...
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const typeId = typeof req.query.object_type_id === 'string' ? req.query.object_type_id : undefined;
    res.json(await listCustomObjectFields(scope, typeId));
  } catch (err) {
    console.error('Error listing custom object fields:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/custom-object-fields
router.post(
  '/',
  requirePermission('settings.write'),
  validate({ body: CreateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      res.status(201).json(await createCustomObjectField(scope, req.body));
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'Ya existe un campo con esa clave' });
      console.error('Error creating custom object field:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PATCH /api/custom-object-fields/:id
router.patch(
  '/:id',
  requirePermission('settings.write'),
  validate({ body: UpdateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await getCustomObjectField(scope, req.params.id);
      if (!item) return res.status(404).json({ error: 'Field not found' });
      res.json(await updateCustomObjectField(scope, req.params.id, req.body));
    } catch (err) {
      console.error('Error updating custom object field:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// DELETE /api/custom-object-fields/:id
router.delete(
  '/:id',
  requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await getCustomObjectField(scope, req.params.id);
      if (!item) return res.status(404).json({ error: 'Field not found' });
      await deleteCustomObjectField(scope, req.params.id);
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting custom object field:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
