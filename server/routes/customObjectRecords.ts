import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import {
  listCustomObjectRecords,
  getCustomObjectRecord,
  createCustomObjectRecord,
  updateCustomObjectRecord,
  deleteCustomObjectRecord,
} from '../data/customObjectRecords.js';

const router = Router();
router.use(extractMultiTenant);

const CreateSchema = z.object({
  object_type_id: z.string().min(1),
  data:           z.record(z.string(), z.any()),
});
const UpdateSchema = z.object({
  data: z.record(z.string(), z.any()),
});

// GET /api/custom-object-records?object_type_id=... (required)
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  const typeId = typeof req.query.object_type_id === 'string' ? req.query.object_type_id : '';
  if (!typeId) return res.status(400).json({ error: 'object_type_id es obligatorio' });
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await listCustomObjectRecords(scope, typeId));
  } catch (err) {
    console.error('Error listing custom object records:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/custom-object-records
router.post(
  '/',
  requirePermission('settings.write'),
  validate({ body: CreateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      res.status(201).json(await createCustomObjectRecord(scope, { ...req.body, created_by: req.userId ?? null }));
    } catch (err) {
      console.error('Error creating custom object record:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PATCH /api/custom-object-records/:id
router.patch(
  '/:id',
  requirePermission('settings.write'),
  validate({ body: UpdateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await getCustomObjectRecord(scope, req.params.id);
      if (!item) return res.status(404).json({ error: 'Record not found' });
      res.json(await updateCustomObjectRecord(scope, req.params.id, req.body.data));
    } catch (err) {
      console.error('Error updating custom object record:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// DELETE /api/custom-object-records/:id
router.delete(
  '/:id',
  requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await getCustomObjectRecord(scope, req.params.id);
      if (!item) return res.status(404).json({ error: 'Record not found' });
      await deleteCustomObjectRecord(scope, req.params.id);
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting custom object record:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
