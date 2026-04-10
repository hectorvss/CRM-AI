import { Router, Response } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { parseRow } from '../db/utils.js';
import { Case } from '../models.js';
import {
  buildCaseGraphView,
  buildCaseListSummary,
  buildCaseResolveView,
  buildCaseTimeline,
  getCaseCanonicalState,
} from '../services/canonicalState.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import { createCaseRepository, createConversationRepository, createAuditRepository } from '../data/index.js';
import crypto from 'crypto';

const router = Router();
const caseRepo = createCaseRepository();
const convRepo = createConversationRepository();
const auditRepo = createAuditRepository();

router.use(extractMultiTenant);

function computeSlaView(caseRow: any) {
  const deadline = caseRow.sla_resolution_deadline;
  if (!deadline) {
    return {
      status: caseRow.sla_status || 'on_track',
      label: 'Waiting',
      time: 'N/A',
    };
  }

  const diffMs = new Date(deadline).getTime() - Date.now();
  if (diffMs <= 0) {
    return {
      status: 'breached',
      label: 'Overdue',
      time: 'Overdue',
    };
  }

  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  const time = diffMinutes < 60
    ? `${diffMinutes}m remaining`
    : `${Math.round(diffMinutes / 60)}h remaining`;

  return {
    status: caseRow.sla_status || 'on_track',
    label: caseRow.sla_status === 'at_risk' ? 'SLA risk' : 'Waiting',
    time,
  };
}

async function findConversationForCase(caseRow: any, tenantId: string, workspaceId: string) {
  const scope = { tenantId, workspaceId };
  
  if (caseRow.conversation_id) {
    const linked = await convRepo.getConversation(scope, caseRow.conversation_id);
    if (linked) return linked;
  }

  const byCase = await convRepo.findLatestByCase(scope, caseRow.id);
  if (byCase) return byCase;

  if (caseRow.customer_id) {
    const byCustomer = await convRepo.findOpenByCustomer(
      scope, 
      caseRow.customer_id, 
      caseRow.source_channel || undefined
    );
    if (byCustomer) return byCustomer;
  }

  return null;
}

async function ensureConversationForCase(caseRow: any, tenantId: string, workspaceId: string) {
  const scope = { tenantId, workspaceId };
  const existing = await findConversationForCase(caseRow, tenantId, workspaceId);
  
  if (existing) {
    await convRepo.linkCase(scope, existing.id, caseRow.id);
    await caseRepo.updateCase(scope, caseRow.id, { conversationId: existing.id });
    // Note: linkCase in repository should handle message updates if implemented, 
    // or we can call separate repo method.
    return existing;
  }

  const conversationId = crypto.randomUUID();
  const now = new Date().toISOString();
  
  const conversation = await convRepo.createConversation(scope, {
    id: conversationId,
    caseId: caseRow.id,
    customerId: caseRow.customer_id || null,
    channel: caseRow.source_channel || 'web_chat',
    status: 'open',
    subject: caseRow.case_number ? `Case ${caseRow.case_number}` : 'New Conversation',
    firstMessageAt: now,
    lastMessageAt: now,
  });

  await caseRepo.updateCase(scope, caseRow.id, { conversationId });

  return conversation;
}

async function buildInboxView(caseId: string, tenantId: string, workspaceId: string) {
  const scope = { tenantId, workspaceId };
  const caseRow = await caseRepo.getCase(scope, caseId);

  if (!caseRow) return null;

  const state = await getCaseCanonicalState(caseId, tenantId, workspaceId);
  const conversation = await findConversationForCase(caseRow, tenantId, workspaceId);

  const messages = conversation
    ? await convRepo.listMessages(scope, conversation.id)
    : [];
    
  const drafts = await caseRepo.listDrafts(scope, caseId);
  const internalNotes = await caseRepo.listInternalNotes(scope, caseId);

  return {
    case: caseRow,
    state,
    conversation: conversation,
    messages,
    drafts,
    latest_draft: drafts[0] ?? null,
    internal_notes: internalNotes,
    sla: computeSlaView(caseRow),
  };
}

// ── GET /api/cases ────────────────────────────────────────
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const filters = {
      status: req.query.status as string,
      assignedUserId: req.query.assigned_user_id as string,
      priority: req.query.priority as string,
      riskLevel: req.query.risk_level as string,
      searchTerm: req.query.q as string,
    };

    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const cases = await caseRepo.listCases(scope, filters);
    
    const enriched = await Promise.all(cases.map(async (row: any) => {
      const summary = await buildCaseListSummary(row.id, req.tenantId!, req.workspaceId!);

      return {
        ...row,
        latest_message_preview: summary?.latest_message_preview || null,
        channel_context: summary?.channel_context || null,
        system_status_summary: summary?.system_status_summary || null,
        conflict_summary: summary?.conflict_summary || null,
      };
    }));

    res.json(enriched);
  } catch (error) {
    console.error('Error fetching cases:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/cases/:id ────────────────────────────────────
router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const row = await caseRepo.getCase(scope, req.params.id);

    if (!row) return res.status(404).json({ error: 'Case not found' });

    res.json({
      ...row,
      state_snapshot: await getCaseCanonicalState(req.params.id, req.tenantId!, req.workspaceId!),
    });
  } catch (error) {
    console.error('Error fetching case:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/state', async (req: MultiTenantRequest, res: Response) => {
  try {
    const state = await getCaseCanonicalState(req.params.id, req.tenantId!, req.workspaceId!);
    if (!state) return res.status(404).json({ error: 'Case not found' });
    res.json(state);
  } catch (error) {
    console.error('Error fetching case state:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/graph', async (req: MultiTenantRequest, res: Response) => {
  try {
    const graph = await buildCaseGraphView(req.params.id, req.tenantId!, req.workspaceId!);
    if (!graph) return res.status(404).json({ error: 'Case not found' });
    res.json(graph);
  } catch (error) {
    console.error('Error fetching case graph:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/resolve', async (req: MultiTenantRequest, res: Response) => {
  try {
    const resolve = await buildCaseResolveView(req.params.id, req.tenantId!, req.workspaceId!);
    if (!resolve) return res.status(404).json({ error: 'Case not found' });
    res.json(resolve);
  } catch (error) {
    console.error('Error fetching case resolve view:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/timeline', async (req: MultiTenantRequest, res: Response) => {
  try {
    const timeline = await buildCaseTimeline(req.params.id, req.tenantId!, req.workspaceId!);
    res.json(timeline);
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/inbox-view', async (req: MultiTenantRequest, res: Response) => {
  try {
    const view = await buildInboxView(req.params.id, req.tenantId!, req.workspaceId!);
    if (!view) return res.status(404).json({ error: 'Case not found' });
    res.json(view);
  } catch (error) {
    console.error('Error fetching inbox view:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /api/cases/:id/status ──────────────────────────
router.patch('/:id/status', async (req: MultiTenantRequest, res: Response) => {
  try {
    const { status, reason, changed_by } = req.body;
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };

    const existing = await caseRepo.getCase(scope, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Case not found' });

    await caseRepo.updateCase(scope, req.params.id, { 
      status, 
      lastActivityAt: new Date().toISOString() 
    });

    await caseRepo.addStatusHistory(scope, {
      caseId: req.params.id,
      fromStatus: existing.status,
      toStatus: status,
      changedBy: changed_by || req.userId || 'system',
      reason: reason || null
    });

    await auditRepo.logEvent(scope, {
      actorId: req.userId || 'system',
      action: 'CASE_STATUS_UPDATE',
      entityType: 'case',
      entityId: req.params.id,
      oldValue: { status: existing.status },
      newValue: { status },
      metadata: { reason },
    });

    res.json({ success: true, status });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /api/cases/:id/assign ──────────────────────────
router.patch('/:id/assign', async (req: MultiTenantRequest, res: Response) => {
  try {
    const { user_id, team_id } = req.body;
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };

    await caseRepo.updateCase(scope, req.params.id, {
      assignedUserId: user_id || null,
      assignedTeamId: team_id || null
    });

    await auditRepo.logEvent(scope, {
      actorId: req.userId!,
      action: 'CASE_ASSIGNMENT_UPDATE',
      entityType: 'case',
      entityId: req.params.id,
      newValue: { user_id, team_id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error assigning case:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/cases/:id/internal-note ─────────────────────
router.post('/:id/internal-note', async (req: MultiTenantRequest, res: Response) => {
  try {
    const { content } = req.body;
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };

    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    const caseRow = await caseRepo.getCase(scope, req.params.id);
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });

    const noteId = crypto.randomUUID();
    const now = new Date().toISOString();

    await caseRepo.addInternalNote(scope, {
      id: noteId,
      caseId: req.params.id,
      content: String(content).trim(),
      createdBy: req.userId || 'user_local',
      createdAt: now
    });

    let messageId: string | null = null;
    if (caseRow.conversation_id) {
      messageId = crypto.randomUUID();
      await convRepo.addMessage(scope, {
        id: messageId,
        conversationId: caseRow.conversation_id,
        caseId: req.params.id,
        type: 'internal',
        direction: 'outbound',
        senderId: req.userId || 'user_local',
        senderName: 'Internal Note',
        content: String(content).trim(),
        channel: 'internal',
        sentAt: now
      });
    }

    await caseRepo.updateCase(scope, req.params.id, { lastActivityAt: now });

    await auditRepo.logEvent(scope, {
      actorId: req.userId || 'user_local',
      action: 'CASE_INTERNAL_NOTE_CREATED',
      entityType: 'case',
      entityId: req.params.id,
      metadata: { noteId },
    });

    res.status(201).json({
      success: true,
      noteId,
      message: messageId ? {
        id: messageId,
        type: 'internal',
        direction: 'outbound',
        sender_name: 'Internal Note',
        content: String(content).trim(),
        channel: 'internal',
        sent_at: now,
      } : null,
    });
  } catch (error) {
    console.error('Error creating internal note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/cases/:id/reply ─────────────────────────────
router.post('/:id/reply', async (req: MultiTenantRequest, res: Response) => {
  try {
    const { content, draft_reply_id } = req.body;
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };

    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: 'Reply content is required' });
    }

    const caseRow = await caseRepo.getCase(scope, req.params.id);
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });

    const conversation = await ensureConversationForCase(caseRow, req.tenantId!, req.workspaceId!);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const now = new Date().toISOString();
    const queuedMessageId = crypto.randomUUID();
    const channel = conversation.channel || caseRow.source_channel || 'web_chat';

    await convRepo.addMessage(scope, {
      id: queuedMessageId,
      conversationId: conversation.id,
      caseId: req.params.id,
      customerId: caseRow.customer_id || null,
      type: 'agent',
      direction: 'outbound',
      senderId: req.userId || 'user_local',
      senderName: 'Alex Morgan',
      content: String(content).trim(),
      channel,
      externalMessageId: `queued_${queuedMessageId}`,
      draftReplyId: draft_reply_id || null,
      sentAt: now
    });

    await convRepo.updateLastMessage(scope, conversation.id, now);
    await caseRepo.updateCase(scope, req.params.id, { lastActivityAt: now });

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

    await auditRepo.logEvent(scope, {
      actorId: req.userId || 'user_local',
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

    if (draft_reply_id) {
      await caseRepo.updateDraftStatus(scope, draft_reply_id, 'sent', now);
    }

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
    console.error('Error queueing reply:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
