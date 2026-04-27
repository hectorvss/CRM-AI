import { Router, Response } from 'express';
import crypto from 'crypto';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import {
  createCaseRepository,
  createConversationRepository,
  createAuditRepository,
  buildCaseState,
  buildGraphView,
  buildInboxView,
  buildResolveView,
  buildTimeline,
} from '../data/index.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import { fireWorkflowEvent } from '../lib/workflowEventBus.js';

const router = Router();
const caseRepository = createCaseRepository();
const conversationRepository = createConversationRepository();
const auditRepository = createAuditRepository();

router.use(extractMultiTenant);

router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const filters = {
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      assigned_user_id: typeof req.query.assigned_user_id === 'string' ? req.query.assigned_user_id : undefined,
      priority: typeof req.query.priority === 'string' ? req.query.priority : undefined,
      risk_level: typeof req.query.risk_level === 'string' ? req.query.risk_level : undefined,
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
    };

    const items = await caseRepository.list(scope, filters);
    res.json(items);
  } catch (error) {
    console.error('Error fetching cases:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const bundle = await caseRepository.getBundle(scope, req.params.id);
    
    if (!bundle) return res.status(404).json({ error: 'Case not found' });

    res.json({
      ...bundle.case,
      state_snapshot: buildCaseState(bundle),
    });
  } catch (error) {
    console.error('Error fetching case:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/state', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const bundle = await caseRepository.getBundle(scope, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Case not found' });
    
    res.json(buildCaseState(bundle));
  } catch (error) {
    console.error('Error fetching case state:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/graph', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const bundle = await caseRepository.getBundle(scope, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Case not found' });
    
    res.json(buildGraphView(bundle));
  } catch (error) {
    console.error('Error fetching case graph:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/resolve', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const bundle = await caseRepository.getBundle(scope, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Case not found' });
    
    res.json(buildResolveView(bundle));
  } catch (error) {
    console.error('Error fetching case resolve view:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/timeline', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const bundle = await caseRepository.getBundle(scope, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Case not found' });
    
    res.json(buildTimeline(bundle));
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/inbox-view', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const bundle = await caseRepository.getBundle(scope, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Case not found' });
    
    res.json(buildInboxView(bundle));
  } catch (error) {
    console.error('Error fetching inbox view:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id/status', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const { status, reason, changed_by } = req.body;

    const bundle = await caseRepository.getBundle(scope, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Case not found' });

    const oldStatus = bundle.case.status;
    await caseRepository.update(scope, req.params.id, { 
      status, 
      last_activity_at: new Date().toISOString() 
    });

    await caseRepository.addStatusHistory(scope, {
      caseId: req.params.id,
      fromStatus: oldStatus,
      toStatus: status,
      changedBy: changed_by || req.userId || 'system',
      reason: reason || null
    });

    await auditRepository.log({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId || 'system',
      action: 'CASE_STATUS_UPDATE',
      entityType: 'case',
      entityId: req.params.id,
      oldValue: { status: oldStatus },
      newValue: { status },
      metadata: { reason },
    });

    fireWorkflowEvent(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId },
      'case.updated',
      { caseId: req.params.id, status, previousStatus: oldStatus, reason: reason ?? null, customerId: bundle.case.customer_id },
    );
    res.json({ success: true, status });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id/assign', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const { user_id, team_id } = req.body;

    await caseRepository.update(scope, req.params.id, {
      assigned_user_id: user_id || null,
      assigned_team_id: team_id || null
    });

    await auditRepository.log({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId || 'system',
      action: 'CASE_ASSIGNMENT_UPDATE',
      entityType: 'case',
      entityId: req.params.id,
      newValue: { user_id, team_id },
    });

    fireWorkflowEvent(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId },
      'case.updated',
      { caseId: req.params.id, assignedUserId: user_id ?? null, assignedTeamId: team_id ?? null, change: 'assignment' },
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error assigning case:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function handleInternalNote(req: MultiTenantRequest, res: Response): Promise<void> {
  try {
    const { content } = req.body;
    if (!content || !String(content).trim()) {
      res.status(400).json({ error: 'Note content is required' });
      return;
    }

    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const bundle = await caseRepository.getBundle(scope, req.params.id);
    if (!bundle) {
      res.status(404).json({ error: 'Case not found' });
      return;
    }

    const note = await conversationRepository.createInternalNote(scope, {
      caseId: req.params.id,
      content: String(content).trim(),
      createdBy: req.userId || 'user_local'
    });

    let message: any = null;
    if (bundle.conversation || bundle.case.conversation_id) {
      const convId = bundle.conversation?.id || bundle.case.conversation_id;
      message = await conversationRepository.appendMessage(scope, {
        conversationId: convId,
        caseId: req.params.id,
        customerId: bundle.case.customer_id || null,
        type: 'internal',
        direction: 'outbound',
        senderId: req.userId || 'user_local',
        senderName: 'Internal Note',
        content: String(content).trim(),
        channel: 'internal',
      });
    }

    await caseRepository.update(scope, req.params.id, { 
      last_activity_at: new Date().toISOString() 
    });

    await auditRepository.log({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId || 'system',
      action: 'CASE_INTERNAL_NOTE_CREATED',
      entityType: 'case',
      entityId: req.params.id,
      metadata: { noteId: note.id },
    });

    res.status(201).json({
      success: true,
      noteId: note.id,
      message: message ? {
        id: message.id,
        type: 'internal',
        direction: 'outbound',
        sender_name: 'Internal Note',
        content: String(content).trim(),
        channel: 'internal',
        sent_at: message.sent_at,
      } : null,
    });
  } catch (error) {
    console.error('Error creating internal note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

router.post('/:id/internal-note', handleInternalNote);
// /:id/notes is an alias for /:id/internal-note
router.post('/:id/notes', handleInternalNote);

router.post('/:id/reply', async (req: MultiTenantRequest, res: Response) => {
  try {
    const { content, draft_reply_id } = req.body;
    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: 'Reply content is required' });
    }

    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const bundle = await caseRepository.getBundle(scope, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Case not found' });

    const conversation = await conversationRepository.ensureForCase(scope, bundle.case);
    const channel = conversation.channel || bundle.case.source_channel || 'web_chat';
    const queuedMessageId = crypto.randomUUID();
    const now = new Date().toISOString();

    await conversationRepository.appendMessage(scope, {
      conversationId: conversation.id,
      caseId: req.params.id,
      customerId: bundle.case.customer_id || null,
      type: 'agent',
      direction: 'outbound',
      senderId: req.userId || 'user_local',
      senderName: 'Alex Morgan',
      content: String(content).trim(),
      channel,
      externalMessageId: `queued_${queuedMessageId}`,
      draftReplyId: draft_reply_id || null,
      sentAt: now,
    });

    if (draft_reply_id) {
       // Ideally we'd have a DraftRepository, but for now we can use a direct call if needed or let the worker handle status
       // For completeness, we'll keep it as is or add it to ConversationRepository later.
    }

    await enqueue(
      JobType.SEND_MESSAGE,
      {
        caseId: req.params.id,
        conversationId: conversation.id,
        channel,
        content: String(content).trim(),
        queuedMessageId,
        draftReplyId: draft_reply_id || undefined,
      },
      {
        tenantId: req.tenantId!,
        workspaceId: req.workspaceId!,
        traceId: `${req.params.id}:reply:${Date.now()}`,
        priority: 4,
      },
    );

    await auditRepository.log({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId || 'system',
      action: 'CASE_REPLY_QUEUED',
      entityType: 'case',
      entityId: req.params.id,
      metadata: {
        conversationId: conversation.id,
        channel,
        queuedMessageId,
        draftReplyId: draft_reply_id || null,
      },
    });

    res.status(202).json({
      success: true,
      queued: true,
      message_id: queuedMessageId,
      message: {
        id: queuedMessageId,
        type: 'agent',
        direction: 'outbound',
        sender_name: 'Alex Morgan',
        content: String(content).trim(),
        channel,
        sent_at: now,
      },
    });
  } catch (error) {
    console.error('Error sending reply:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
