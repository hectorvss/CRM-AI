import { Router, Response } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { createConversationRepository, createAuditRepository, createCaseRepository } from '../data/index.js';
import { fireWorkflowEvent } from '../lib/workflowEventBus.js';

const router = Router();
const conversationRepository = createConversationRepository();
const caseRepository = createCaseRepository();
const auditRepository = createAuditRepository();

router.use(extractMultiTenant);

router.get('/by-case/:caseId', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const conv = await conversationRepository.getByCase(scope, req.params.caseId);
    
    if (!conv) return res.status(404).json({ error: 'No conversation found for this case' });
    res.json(conv);
  } catch (error) {
    console.error('Error fetching conversation by case:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const conv = await conversationRepository.get(scope, req.params.id);
    
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    res.json(conv);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/messages', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const messages = await conversationRepository.listMessages(scope, req.params.id);
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/messages', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const conv = await conversationRepository.get(scope, req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });

    const { type, content, sender_name } = req.body;
    const message = await conversationRepository.appendMessage(scope, {
      conversationId: req.params.id,
      caseId: conv.case_id || null,
      customerId: conv.customer_id || null,
      type: type || 'agent',
      senderId: req.userId,
      senderName: sender_name || null,
      content,
      channel: conv.channel,
    });

    if (conv.case_id) {
      await caseRepository.update(scope, conv.case_id, {
        last_activity_at: new Date().toISOString()
      });
    }

    await auditRepository.logEvent(scope, {
      actorId: req.userId!,
      action: 'MESSAGE_SENT',
      entityType: 'conversation',
      entityId: req.params.id,
      metadata: { messageId: message.id, type: type || 'agent' },
    });

    // Fire workflow trigger for inbound customer messages
    if ((type === 'customer' || type === 'inbound' || !type) && conv.case_id) {
      await fireWorkflowEvent(
        { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId },
        'message.received',
        { messageId: message.id, conversationId: req.params.id, caseId: conv.case_id, customerId: conv.customer_id, channel: conv.channel, content },
      );
    }
    res.json({ success: true, id: message.id });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
