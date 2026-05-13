import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import {
  trackEvent, queryEvents, queryRollups, upsertRollup, getReportOverview,
} from '../data/reporting.js';

const router = Router();
router.use(extractMultiTenant);

// ── Schemas ───────────────────────────────────────────────────────────────────

const TrackEventSchema = z.object({
  event_name:      z.string().min(1),
  conversation_id: z.string().uuid().optional().nullable(),
  contact_id:      z.string().uuid().optional().nullable(),
  agent_id:        z.string().uuid().optional().nullable(),
  inbox_id:        z.string().uuid().optional().nullable(),
  label_id:        z.string().uuid().optional().nullable(),
  value_cents:     z.number().int().optional().nullable(),
  metadata:        z.record(z.string(), z.unknown()).optional(),
  occurred_at:     z.string().datetime().optional(),
});

const UpsertRollupSchema = z.object({
  date:                    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  granularity:             z.enum(['day', 'week', 'month']),
  inbox_id:                z.string().uuid().optional().nullable(),
  agent_id:                z.string().uuid().optional().nullable(),
  label_id:                z.string().uuid().optional().nullable(),
  conversations_opened:    z.number().int().default(0),
  conversations_resolved:  z.number().int().default(0),
  conversations_reopened:  z.number().int().default(0),
  messages_sent:           z.number().int().default(0),
  messages_received:       z.number().int().default(0),
  avg_first_response_s:    z.number().optional().nullable(),
  avg_resolution_s:        z.number().optional().nullable(),
  csat_total:              z.number().int().default(0),
  csat_sum:                z.number().int().default(0),
  sla_breaches:            z.number().int().default(0),
});

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/reporting/overview?days=30
router.get('/overview', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const days = typeof req.query.days === 'string' ? Math.min(parseInt(req.query.days), 365) : 30;
    res.json(await getReportOverview(scope, days));
  } catch (err) {
    console.error('Error fetching report overview:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reporting/rollups?granularity=day&from=2026-01-01&to=2026-01-31
router.get('/rollups', async (req: MultiTenantRequest, res: Response) => {
  const { granularity, from, to, inbox_id, agent_id } = req.query;
  if (!granularity || !from || !to) {
    return res.status(400).json({ error: 'granularity, from and to are required' });
  }
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await queryRollups(scope, {
      granularity: granularity as 'day' | 'week' | 'month',
      from:        from as string,
      to:          to as string,
      inbox_id:    typeof inbox_id === 'string' ? inbox_id : undefined,
      agent_id:    typeof agent_id === 'string' ? agent_id : undefined,
    }));
  } catch (err) {
    console.error('Error querying rollups:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/reporting/rollups  — upsert a pre-computed rollup (internal use)
router.post(
  '/rollups',
  requirePermission('settings.write'),
  validate({ body: UpsertRollupSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      await upsertRollup(scope, req.body);
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error('Error upserting rollup:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// GET /api/reporting/events?event_name=&agent_id=&from=&to=&limit=
router.get('/events', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await queryEvents(scope, {
      event_name: typeof req.query.event_name === 'string' ? req.query.event_name : undefined,
      agent_id:   typeof req.query.agent_id   === 'string' ? req.query.agent_id   : undefined,
      inbox_id:   typeof req.query.inbox_id   === 'string' ? req.query.inbox_id   : undefined,
      from:       typeof req.query.from       === 'string' ? req.query.from       : undefined,
      to:         typeof req.query.to         === 'string' ? req.query.to         : undefined,
      limit:      typeof req.query.limit      === 'string' ? Math.min(parseInt(req.query.limit), 2000) : 500,
    }));
  } catch (err) {
    console.error('Error querying events:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/reporting/events  — track a raw event
router.post(
  '/events',
  validate({ body: TrackEventSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      await trackEvent(scope, req.body);
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error('Error tracking event:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
