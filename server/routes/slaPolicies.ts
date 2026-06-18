import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import {
  listSlaPolicies, getSlaPolicy, createSlaPolicy, updateSlaPolicy, deleteSlaPolicy,
  applySlaToConversation, getAppliedSla, markSlaEvent, listSlaEvents,
} from '../data/slaPolicies.js';

const router = Router();
router.use(extractMultiTenant);

// ── Schemas ───────────────────────────────────────────────────────────────────

const CreateSchema = z.object({
  name:                 z.string().min(1),
  description:          z.string().optional().nullable(),
  first_response_time:  z.number().int().positive().optional().nullable(),
  next_response_time:   z.number().int().positive().optional().nullable(),
  resolution_time:      z.number().int().positive().optional().nullable(),
  business_hours:       z.boolean().default(false),
});

const UpdateSchema = CreateSchema.partial();

const ApplySchema = z.object({
  conversation_id: z.string().uuid(),
  policy_id:       z.string().uuid(),
  start_at:        z.string().datetime().optional(),
});

const MarkEventSchema = z.object({
  event_type: z.enum([
    'first_response_met', 'first_response_breached',
    'next_response_met',  'next_response_breached',
    'resolution_met',     'resolution_breached',
  ]),
});

// ── Policy CRUD ───────────────────────────────────────────────────────────────

router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await listSlaPolicies(scope));
  } catch (err) {
    console.error('Error listing SLA policies:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const policy = await getSlaPolicy(scope, req.params.id);
    if (!policy) return res.status(404).json({ error: 'SLA policy not found' });
    res.json(policy);
  } catch (err) {
    console.error('Error fetching SLA policy:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(
  '/',
  requirePermission('settings.write'),
  validate({ body: CreateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      res.status(201).json(await createSlaPolicy(scope, req.body));
    } catch (err) {
      console.error('Error creating SLA policy:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.patch(
  '/:id',
  requirePermission('settings.write'),
  validate({ body: UpdateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const existing = await getSlaPolicy(scope, req.params.id);
      if (!existing) return res.status(404).json({ error: 'SLA policy not found' });
      res.json(await updateSlaPolicy(scope, req.params.id, req.body));
    } catch (err) {
      console.error('Error updating SLA policy:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

router.delete(
  '/:id',
  requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const existing = await getSlaPolicy(scope, req.params.id);
      if (!existing) return res.status(404).json({ error: 'SLA policy not found' });
      await deleteSlaPolicy(scope, req.params.id);
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting SLA policy:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ── Applied SLA endpoints ─────────────────────────────────────────────────────

// POST /api/sla-policies/apply  — apply a policy to a conversation
router.post(
  '/apply',
  validate({ body: ApplySchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const startAt = req.body.start_at ? new Date(req.body.start_at) : new Date();
      res.status(201).json(
        await applySlaToConversation(scope, req.body.conversation_id, req.body.policy_id, startAt),
      );
    } catch (err: any) {
      console.error('Error applying SLA:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// GET /api/sla-policies/applied/:conversationId
router.get('/applied/:conversationId', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const applied = await getAppliedSla(scope, req.params.conversationId);
    if (!applied) return res.status(404).json({ error: 'No SLA applied to this conversation' });
    res.json(applied);
  } catch (err) {
    console.error('Error fetching applied SLA:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/sla-policies/applied/:conversationId/event  — record met/breach
router.post(
  '/applied/:conversationId/event',
  validate({ body: MarkEventSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const result = await markSlaEvent(scope, req.params.conversationId, req.body.event_type);
      if (!result) return res.status(404).json({ error: 'No applied SLA found' });
      res.json({ ok: true });
    } catch (err) {
      console.error('Error marking SLA event:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// GET /api/sla-policies/events?conversationId=...
router.get('/events', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const conversationId = typeof req.query.conversation_id === 'string' ? req.query.conversation_id : undefined;
    const limit = typeof req.query.limit === 'string' ? Math.min(parseInt(req.query.limit), 500) : 100;
    res.json(await listSlaEvents(scope, { conversationId, limit }));
  } catch (err) {
    console.error('Error listing SLA events:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
