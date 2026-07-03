import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import {
  listTicketTypes,
  getTicketType,
  createTicketType,
  updateTicketType,
  deleteTicketType,
} from '../data/ticketTypes.js';

const router = Router();
router.use(extractMultiTenant);

const categoryEnum = z.enum(['customer', 'follow_up', 'back_office']);
const CreateSchema = z.object({
  name:        z.string().min(1, 'Name is required').max(120),
  description: z.string().max(1000).optional().nullable(),
  icon:        z.string().max(16).optional().nullable(),
  category:    categoryEnum.optional(),
});
const UpdateSchema = CreateSchema.partial();

// GET /api/ticket-types
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await listTicketTypes(scope));
  } catch (err) {
    console.error('Error listing ticket types:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/ticket-types
router.post(
  '/',
  requirePermission('settings.write'),
  validate({ body: CreateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await createTicketType(scope, { ...req.body, created_by: req.userId ?? null });
      res.status(201).json(item);
    } catch (err) {
      console.error('Error creating ticket type:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PATCH /api/ticket-types/:id
router.patch(
  '/:id',
  requirePermission('settings.write'),
  validate({ body: UpdateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await getTicketType(scope, req.params.id);
      if (!item) return res.status(404).json({ error: 'Ticket type not found' });
      res.json(await updateTicketType(scope, req.params.id, req.body));
    } catch (err) {
      console.error('Error updating ticket type:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// DELETE /api/ticket-types/:id
router.delete(
  '/:id',
  requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await getTicketType(scope, req.params.id);
      if (!item) return res.status(404).json({ error: 'Ticket type not found' });
      await deleteTicketType(scope, req.params.id);
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting ticket type:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
