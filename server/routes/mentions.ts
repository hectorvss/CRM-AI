import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { validate } from '../middleware/validate.js';
import { createMention, listMentionsForUser, markMentionRead, markAllMentionsRead } from '../data/mentions.js';

const router = Router();
router.use(extractMultiTenant);

const CreateSchema = z.object({
  conversation_id:   z.string().uuid(),
  message_id:        z.string().uuid().optional().nullable(),
  mentioned_user_id: z.string().uuid(),
  mentioned_by_id:   z.string().uuid().optional().nullable(),
  content_snippet:   z.string().optional().nullable(),
});

router.get('/:userId', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await listMentionsForUser(scope, req.params.userId, {
      unreadOnly: req.query.unread === 'true',
      limit: typeof req.query.limit === 'string' ? Math.min(parseInt(req.query.limit), 100) : 50,
    }));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/', validate({ body: CreateSchema }), async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.status(201).json(await createMention(scope, req.body));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.patch('/:id/read', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    await markMentionRead(scope, req.params.id);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/read-all/:userId', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    await markAllMentionsRead(scope, req.params.userId);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

export default router;
