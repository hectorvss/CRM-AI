import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { validate } from '../middleware/validate.js';
import {
  createCall, updateCallStatus, listCalls, getCall, getCallStats,
} from '../data/calls.js';

const router = Router();
router.use(extractMultiTenant);

const DIRECTIONS = ['inbound','outbound'] as const;
const STATUSES   = ['initiated','ringing','in_progress','completed','missed','voicemail','failed'] as const;

const CreateSchema = z.object({
  conversation_id:  z.string().uuid().optional().nullable(),
  contact_id:       z.string().uuid().optional().nullable(),
  inbox_id:         z.string().uuid().optional().nullable(),
  agent_id:         z.string().uuid().optional().nullable(),
  direction:        z.enum(DIRECTIONS),
  from_number:      z.string().optional().nullable(),
  to_number:        z.string().optional().nullable(),
  provider:         z.string().optional().nullable(),
  provider_call_id: z.string().optional().nullable(),
  metadata:         z.record(z.string(), z.unknown()).default({}),
});

const UpdateStatusSchema = z.object({
  status:        z.enum(STATUSES),
  answered_at:   z.string().datetime().optional(),
  ended_at:      z.string().datetime().optional(),
  duration_s:    z.number().int().optional(),
  recording_url: z.string().url().optional(),
  transcript:    z.string().optional(),
});

router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await listCalls(scope, {
      contactId:  typeof req.query.contact_id  === 'string' ? req.query.contact_id  : undefined,
      agentId:    typeof req.query.agent_id    === 'string' ? req.query.agent_id    : undefined,
      inboxId:    typeof req.query.inbox_id    === 'string' ? req.query.inbox_id    : undefined,
      status:     req.query.status    as any,
      direction:  req.query.direction as any,
      from:       typeof req.query.from === 'string' ? req.query.from : undefined,
      to:         typeof req.query.to   === 'string' ? req.query.to   : undefined,
      limit:      typeof req.query.limit === 'string' ? Math.min(parseInt(req.query.limit), 500) : 100,
    }));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/stats', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await getCallStats(scope, {
      agentId: typeof req.query.agent_id === 'string' ? req.query.agent_id : undefined,
      from:    typeof req.query.from === 'string' ? req.query.from : undefined,
      to:      typeof req.query.to   === 'string' ? req.query.to   : undefined,
    }));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const call = await getCall(scope, req.params.id);
    if (!call) return res.status(404).json({ error: 'Call not found' });
    res.json(call);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/', validate({ body: CreateSchema }), async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.status(201).json(await createCall(scope, req.body));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.patch('/:id/status', validate({ body: UpdateStatusSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const call = await getCall(scope, req.params.id);
      if (!call) return res.status(404).json({ error: 'Call not found' });
      res.json(await updateCallStatus(scope, req.params.id, req.body.status, req.body));
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

export default router;
