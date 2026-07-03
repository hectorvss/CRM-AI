import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import {
  listTicketStates,
  getTicketState,
  createTicketState,
  updateTicketState,
  deleteTicketState,
} from '../data/ticketStates.js';

const router = Router();
router.use(extractMultiTenant);

const categoryEnum = z.enum(['submitted', 'in_progress', 'waiting_customer', 'resolved']);
const CreateSchema = z.object({
  internal_label: z.string().min(1, 'Internal label is required').max(120),
  client_label:   z.string().max(120).optional().nullable(),
  category:       categoryEnum.optional(),
  color:          z.string().max(16).optional().nullable(),
  sort_order:     z.number().int().optional(),
});
const UpdateSchema = CreateSchema.partial();

// GET /api/ticket-states
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await listTicketStates(scope));
  } catch (err) {
    console.error('Error listing ticket states:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/ticket-states
router.post(
  '/',
  requirePermission('settings.write'),
  validate({ body: CreateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      res.status(201).json(await createTicketState(scope, req.body));
    } catch (err) {
      console.error('Error creating ticket state:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PATCH /api/ticket-states/:id
router.patch(
  '/:id',
  requirePermission('settings.write'),
  validate({ body: UpdateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await getTicketState(scope, req.params.id);
      if (!item) return res.status(404).json({ error: 'Ticket state not found' });
      res.json(await updateTicketState(scope, req.params.id, req.body));
    } catch (err) {
      console.error('Error updating ticket state:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// DELETE /api/ticket-states/:id
router.delete(
  '/:id',
  requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await getTicketState(scope, req.params.id);
      if (!item) return res.status(404).json({ error: 'Ticket state not found' });
      await deleteTicketState(scope, req.params.id);
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting ticket state:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
