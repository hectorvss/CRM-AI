import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { validate } from '../middleware/validate.js';
import {
  getOrCreateThread, getThread, appendMessage, closeThread, listThreads,
} from '../data/copilotThreads.js';

const router = Router();
router.use(extractMultiTenant);

const AppendSchema = z.object({
  conversation_id: z.string().uuid(),
  agent_id:        z.string().uuid(),
  role:            z.enum(['user','assistant','system']),
  content:         z.string().min(1),
});

const GetOrCreateSchema = z.object({
  conversation_id: z.string().uuid(),
  agent_id:        z.string().uuid(),
});

const CloseSchema = z.object({
  conversation_id: z.string().uuid(),
  agent_id:        z.string().uuid(),
});

// GET /api/copilot-threads?agent_id=&conversation_id=&status=
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await listThreads(scope, {
      agentId:        typeof req.query.agent_id        === 'string' ? req.query.agent_id        : undefined,
      conversationId: typeof req.query.conversation_id === 'string' ? req.query.conversation_id : undefined,
      status:         req.query.status === 'active' ? 'active' : req.query.status === 'closed' ? 'closed' : undefined,
      limit:          typeof req.query.limit === 'string' ? Math.min(parseInt(req.query.limit), 100) : 50,
    }));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// GET /api/copilot-threads/:conversationId/:agentId
router.get('/:conversationId/:agentId', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const thread = await getThread(scope, req.params.conversationId, req.params.agentId);
    if (!thread) return res.status(404).json({ error: 'Thread not found' });
    res.json(thread);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/copilot-threads  — get-or-create
router.post('/', validate({ body: GetOrCreateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      res.status(201).json(
        await getOrCreateThread(scope, req.body.conversation_id, req.body.agent_id),
      );
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

// POST /api/copilot-threads/messages  — append a message
router.post('/messages', validate({ body: AppendSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const thread = await appendMessage(scope, req.body.conversation_id, req.body.agent_id, {
        role:    req.body.role,
        content: req.body.content,
        ts:      new Date().toISOString(),
      });
      res.json(thread);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

// POST /api/copilot-threads/close
router.post('/close', validate({ body: CloseSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      await closeThread(scope, req.body.conversation_id, req.body.agent_id);
      res.json({ ok: true });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

export default router;
