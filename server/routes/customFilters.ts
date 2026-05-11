import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { validate } from '../middleware/validate.js';
import {
  listCustomFilters, createCustomFilter, updateCustomFilter, deleteCustomFilter,
} from '../data/customFilters.js';

const router = Router();
router.use(extractMultiTenant);

const ENTITY_TYPES = ['conversation','contact','company'] as const;

const CreateSchema = z.object({
  owner_id:    z.string().uuid(),
  name:        z.string().min(1),
  entity_type: z.enum(ENTITY_TYPES),
  filters:     z.array(z.unknown()).default([]),
  sort_by:     z.string().optional().nullable(),
  sort_dir:    z.enum(['asc','desc']).optional().nullable(),
  shared:      z.boolean().default(false),
});
const UpdateSchema = CreateSchema.partial().omit({ owner_id: true });

router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const ownerId = typeof req.query.owner_id === 'string' ? req.query.owner_id : req.userId ?? 'anonymous';
    res.json(await listCustomFilters(scope, ownerId, req.query.entity_type as any));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/', validate({ body: CreateSchema }), async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.status(201).json(await createCustomFilter(scope, req.body));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.patch('/:id', validate({ body: UpdateSchema }), async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await updateCustomFilter(scope, req.params.id, req.body));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    await deleteCustomFilter(scope, req.params.id);
    res.status(204).send();
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

export default router;
