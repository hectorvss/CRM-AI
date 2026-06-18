import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import {
  listCustomRoles, getCustomRole, createCustomRole, updateCustomRole, deleteCustomRole,
} from '../data/customRoles.js';

const router = Router();
router.use(extractMultiTenant);

const CreateSchema = z.object({
  name:         z.string().min(1),
  description:  z.string().optional().nullable(),
  permissions:  z.array(z.string()).min(1),
});
const UpdateSchema = CreateSchema.partial();

router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await listCustomRoles(scope));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const item = await getCustomRole(scope, req.params.id);
    if (!item) return res.status(404).json({ error: 'Role not found' });
    res.json(item);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/', requirePermission('settings.write'), validate({ body: CreateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      res.status(201).json(await createCustomRole(scope, req.body));
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'Role name already exists' });
      console.error(err); res.status(500).json({ error: 'Internal server error' });
    }
  });

router.patch('/:id', requirePermission('settings.write'), validate({ body: UpdateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const existing = await getCustomRole(scope, req.params.id);
      if (!existing) return res.status(404).json({ error: 'Role not found' });
      if (existing.is_system) return res.status(403).json({ error: 'Cannot modify system roles' });
      res.json(await updateCustomRole(scope, req.params.id, req.body));
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

router.delete('/:id', requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const existing = await getCustomRole(scope, req.params.id);
      if (!existing) return res.status(404).json({ error: 'Role not found' });
      if (existing.is_system) return res.status(403).json({ error: 'Cannot delete system roles' });
      await deleteCustomRole(scope, req.params.id);
      res.status(204).send();
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

export default router;
