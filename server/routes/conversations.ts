import { Router, Response } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { sendError } from '../http/errors.js';
import { createConversationRepository, createCaseRepository, createAuditRepository } from '../data/index.js';
import crypto from 'crypto';

const router = Router();
const convRepo = createConversationRepository();
const caseRepo = createCaseRepository();
const auditRepo = createAuditRepository();

router.use(extractMultiTenant);

// GET /api/conversations/by-case/:caseId
router.get('/by-case/:caseId', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const conv = await convRepo.getByCase(scope, req.params.caseId);

    if (!conv) return res.status(404).json({ error: 'No conversation found for this case' });

    const messages = await convRepo.listMessages(scope, conv.id);

    res.json({ ...conv, messages });
  } catch (error) {
    console.error('Error fetching conversation by case:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// GET /api/conversations/:id
router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const conv = await convRepo.get(scope, req.params.id);

    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    res.json(conv);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// GET /api/conversations/:id/messages
router.get('/:id/messages', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const messages = await convRepo.listMessages(scope, req.params.id);
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// POST /api/conversations/:id/messages
router.post('/:id/messages', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const conv = await convRepo.get(scope, req.params.id);

    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const { type, content, sender_name } = req.body;
    const messageId = crypto.randomUUID();
    const now = new Date().toISOString();

    await convRepo.appendMessage(scope, {
      conversationId: req.params.id,
      caseId: conv.caseId,
      type: type || 'agent',
      senderId: req.userId || 'system',
      senderName: sender_name || null,
      content,
      channel: conv.channel,
      sentAt: now
    });

    if (conv.caseId) {
      await caseRepo.update(scope, conv.caseId, { 
        lastActivityAt: now 
      });
    }

    await auditRepo.logEvent(scope, {
      actorId: req.userId || 'system',
      action: 'MESSAGE_SENT',
      entityType: 'conversation',
      entityId: req.params.id,
      metadata: { messageId, type: type || 'agent' },
    });

    res.json({ success: true, id: messageId });
  } catch (error) {
    console.error('Error sending message:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;
