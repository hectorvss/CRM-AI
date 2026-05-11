import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import {
  listWorkingHours,
  getWorkingHoursById,
  getEffectiveWorkingHours,
  createWorkingHours,
  updateWorkingHours,
  deleteWorkingHours,
  isWithinWorkingHours,
  DEFAULT_SCHEDULE,
} from '../data/workingHours.js';

const router = Router();
router.use(extractMultiTenant);

// ── Schemas ───────────────────────────────────────────────────────────────────

const DayHoursSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM'),
  end:   z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM'),
});

const DayScheduleSchema = z.object({
  day:   z.number().int().min(0).max(6),
  open:  z.boolean(),
  hours: z.array(DayHoursSchema),
});

const CreateWorkingHoursSchema = z.object({
  name:     z.string().min(1).optional(),
  timezone: z.string().optional(),
  schedule: z.array(DayScheduleSchema).default(DEFAULT_SCHEDULE as any),
  inbox_id: z.string().optional().nullable(),
});

const UpdateWorkingHoursSchema = CreateWorkingHoursSchema.partial();

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/working-hours
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const items = await listWorkingHours(scope);
    res.json(items);
  } catch (err) {
    console.error('Error listing working hours:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/working-hours/effective?inbox_id=... — returns the applicable schedule
router.get('/effective', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope    = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const inboxId  = typeof req.query.inbox_id === 'string' ? req.query.inbox_id : undefined;
    const schedule = await getEffectiveWorkingHours(scope, inboxId);

    if (!schedule) {
      // No schedule configured — return a synthetic "always open" response
      return res.json({
        id: null, name: 'Always Open', timezone: 'UTC',
        schedule: DEFAULT_SCHEDULE.map(d => ({ ...d, open: true })),
        is_open_now: true,
      });
    }

    const isOpenNow = isWithinWorkingHours(
      schedule.schedule as any,
      schedule.timezone,
    );
    res.json({ ...schedule, is_open_now: isOpenNow });
  } catch (err) {
    console.error('Error fetching effective working hours:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/working-hours/:id
router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const wh = await getWorkingHoursById(scope, req.params.id);
    if (!wh) return res.status(404).json({ error: 'Working hours not found' });

    const isOpenNow = isWithinWorkingHours(wh.schedule as any, wh.timezone);
    res.json({ ...wh, is_open_now: isOpenNow });
  } catch (err) {
    console.error('Error fetching working hours:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/working-hours
router.post(
  '/',
  requirePermission('settings.write'),
  validate({ body: CreateWorkingHoursSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const wh = await createWorkingHours(scope, req.body);
      res.status(201).json(wh);
    } catch (err) {
      console.error('Error creating working hours:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PATCH /api/working-hours/:id
router.patch(
  '/:id',
  requirePermission('settings.write'),
  validate({ body: UpdateWorkingHoursSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const wh = await getWorkingHoursById(scope, req.params.id);
      if (!wh) return res.status(404).json({ error: 'Working hours not found' });
      const updated = await updateWorkingHours(scope, req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error('Error updating working hours:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// DELETE /api/working-hours/:id
router.delete(
  '/:id',
  requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const wh = await getWorkingHoursById(scope, req.params.id);
      if (!wh) return res.status(404).json({ error: 'Working hours not found' });
      await deleteWorkingHours(scope, req.params.id);
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting working hours:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
