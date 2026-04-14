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
import { createCaseRepository, createConversationRepository, createAuditRepository, CaseFilters } from '../data/index.js';
import { createDraftRepository } from '../data/drafts.js';
import { buildInboxView } from '../data/cases.js';
import crypto from 'crypto';

const router = Router();
const caseRepo = createCaseRepository();
const convRepo = createConversationRepository();
const auditRepo = createAuditRepository();
const draftRepo = createDraftRepository();

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

// ── GET /api/cases ────────────────────────────────────────
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const filters: CaseFilters = {
      status: req.query.status as string,
      assigned_user_id: req.query.assigned_user_id as string,
      priority: req.query.priority as string,
      risk_level: req.query.risk_level as string,
      q: req.query.q as string,
    };

    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    console.log('GET /api/cases scope:', scope);
    const cases = await caseRepo.list(scope, filters);
    
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
    const row = await caseRepo.get(scope, req.params.id);

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
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const bundle = await caseRepo.getBundle(scope, req.params.id);
    if (!bundle) return res.status(404).json({ error: 'Case not found' });
    const view = buildInboxView(bundle);
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

    const existing = await caseRepo.get(scope, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Case not found' });

    await caseRepo.update(scope, req.params.id, { 
      status, 
      last_activity_at: new Date().toISOString() 
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

    await caseRepo.update(scope, req.params.id, {
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

    const caseRow = await caseRepo.get(scope, req.params.id);
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });

    const noteId = crypto.randomUUID();
    const now = new Date().toISOString();

    await convRepo.createInternalNote(scope, {
      caseId: req.params.id,
      content: String(content).trim(),
      createdBy: req.userId || 'user_local',
      
    });

    let messageId: string | null = null;
    if (caseRow.conversation_id) {
      messageId = crypto.randomUUID();
      await convRepo.appendMessage(scope, {
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

    await caseRepo.update(scope, req.params.id, { last_activity_at: now });

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

    const caseRow = await caseRepo.get(scope, req.params.id);
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });

    const conversation = await convRepo.ensureForCase({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, caseRow);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const now = new Date().toISOString();
    const queuedMessageId = crypto.randomUUID();
    const channel = conversation.channel || caseRow.source_channel || 'web_chat';

    await convRepo.appendMessage(scope, {
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

    await caseRepo.updateConversation(scope, conversation.id, { last_message_at: now });
    await caseRepo.update(scope, req.params.id, { last_activity_at: now });

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
      await draftRepo.upsert(scope, { id: draft_reply_id, status: 'sent' });
    }

    res.status(202).json({
      success: true,
      queued: true,
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
