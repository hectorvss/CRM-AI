import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { validate } from '../middleware/validate.js';
import {
  createNotification, listNotificationsForUser, markNotificationRead,
  markAllNotificationsRead, getUnreadCount,
} from '../data/notifications.js';

const router = Router();
router.use(extractMultiTenant);

const NOTIFICATION_TYPES = [
  'mention','assignment','conversation_resolved','conversation_reopened',
  'sla_breach','csat_received','new_message','macro_executed','automation_triggered','custom',
] as const;

const CreateSchema = z.object({
  user_id:           z.string().uuid(),
  notification_type: z.enum(NOTIFICATION_TYPES),
  title:             z.string().min(1),
  body:              z.string().optional().nullable(),
  entity_type:       z.string().optional().nullable(),
  entity_id:         z.string().uuid().optional().nullable(),
  metadata:          z.record(z.string(), z.unknown()).default({}),
});

router.get('/:userId', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await listNotificationsForUser(scope, req.params.userId, {
      unreadOnly: req.query.unread === 'true',
      limit: typeof req.query.limit === 'string' ? Math.min(parseInt(req.query.limit), 100) : 50,
    }));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/:userId/count', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json({ unread: await getUnreadCount(scope, req.params.userId) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/', validate({ body: CreateSchema }), async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.status(201).json(await createNotification(scope, req.body));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.patch('/:id/read', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    await markNotificationRead(scope, req.params.id);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/read-all/:userId', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    await markAllNotificationsRead(scope, req.params.userId);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

export default router;
