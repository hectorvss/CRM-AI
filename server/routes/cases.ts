import { Router, Response } from 'express';
import { getDb } from '../db/client.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { parseRow, logAudit } from '../db/utils.js';
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

const router = Router();

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

function findConversationForCase(caseRow: any, tenantId: string, workspaceId: string) {
  const db = getDb();

  if (caseRow.conversation_id) {
    const linked = db.prepare(`
      SELECT *
      FROM conversations
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).get(caseRow.conversation_id, tenantId, workspaceId) as any;
    if (linked) return linked;
  }

  const byCase = db.prepare(`
    SELECT *
    FROM conversations
    WHERE case_id = ? AND tenant_id = ? AND workspace_id = ?
    ORDER BY last_message_at DESC, created_at DESC
    LIMIT 1
  `).get(caseRow.id, tenantId, workspaceId) as any;
  if (byCase) return byCase;

  if (caseRow.customer_id) {
    const byCustomer = db.prepare(`
      SELECT *
      FROM conversations
      WHERE customer_id = ? AND tenant_id = ? AND workspace_id = ?
        AND channel = COALESCE(?, channel)
        AND status NOT IN ('closed', 'resolved')
      ORDER BY last_message_at DESC, created_at DESC
      LIMIT 1
    `).get(caseRow.customer_id, tenantId, workspaceId, caseRow.source_channel || null) as any;
    if (byCustomer) return byCustomer;
  }

  return null;
}

function ensureConversationForCase(caseRow: any, tenantId: string, workspaceId: string) {
  const db = getDb();
  const existing = findConversationForCase(caseRow, tenantId, workspaceId);
  if (existing) {
    db.prepare(`
      UPDATE conversations
      SET case_id = COALESCE(case_id, ?), updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).run(caseRow.id, existing.id, tenantId, workspaceId);

    db.prepare(`
      UPDATE cases
      SET conversation_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).run(existing.id, caseRow.id, tenantId, workspaceId);

    db.prepare(`
      UPDATE messages
      SET case_id = COALESCE(case_id, ?)
      WHERE conversation_id = ? AND tenant_id = ?
    `).run(caseRow.id, existing.id, tenantId);

    return existing;
  }

  const now = new Date().toISOString();
  const conversationId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO conversations (
      id, case_id, customer_id, channel, status, subject, external_thread_id,
      first_message_at, last_message_at, created_at, updated_at, tenant_id, workspace_id
    )
    VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    conversationId,
    caseRow.id,
    caseRow.customer_id || null,
    caseRow.source_channel || 'web_chat',
    null,
    caseRow.source_entity_id || null,
    now,
    now,
    now,
    now,
    tenantId,
    workspaceId,
  );

  db.prepare(`
    UPDATE cases
    SET conversation_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ? AND workspace_id = ?
  `).run(conversationId, caseRow.id, tenantId, workspaceId);

  return db.prepare(`
    SELECT *
    FROM conversations
    WHERE id = ? AND tenant_id = ? AND workspace_id = ?
  `).get(conversationId, tenantId, workspaceId);
}

function buildInboxView(caseId: string, tenantId: string, workspaceId: string) {
  const db = getDb();
  const caseRow = db.prepare(`
    SELECT *
    FROM cases
    WHERE id = ? AND tenant_id = ? AND workspace_id = ?
  `).get(caseId, tenantId, workspaceId) as any;

  if (!caseRow) return null;

  const parsedCase = parseRow(caseRow) as any;
  const state = getCaseCanonicalState(caseId, tenantId, workspaceId);
  const conversation = findConversationForCase(parsedCase, tenantId, workspaceId);

  const parsedConversation = conversation ? parseRow(conversation) : null;
  const messages = parsedConversation
    ? db.prepare(`
        SELECT *
        FROM messages
        WHERE conversation_id = ? AND tenant_id = ?
        ORDER BY sent_at ASC
      `).all(parsedConversation.id, tenantId).map(parseRow)
    : [];
  const drafts = db.prepare(`
    SELECT *
    FROM draft_replies
    WHERE case_id = ? AND tenant_id = ?
    ORDER BY generated_at DESC
  `).all(caseId, tenantId).map(parseRow);
  const internalNotes = db.prepare(`
    SELECT *
    FROM internal_notes
    WHERE case_id = ? AND tenant_id = ?
    ORDER BY created_at DESC
  `).all(caseId, tenantId).map(parseRow);

  return {
    case: parsedCase,
    state,
    conversation: parsedConversation,
    messages,
    drafts,
    latest_draft: drafts[0] ?? null,
    internal_notes: internalNotes,
    sla: computeSlaView(parsedCase),
  };
}

router.get('/', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const { status, assigned_user_id, priority, risk_level, q } = req.query;

    let query = `
      SELECT c.*,
             cu.canonical_name AS customer_name, cu.canonical_email AS customer_email,
             cu.segment AS customer_segment,
             u.name AS assigned_user_name,
             t.name AS assigned_team_name
      FROM cases c
      LEFT JOIN customers cu ON c.customer_id = cu.id
      LEFT JOIN users u ON c.assigned_user_id = u.id
      LEFT JOIN teams t ON c.assigned_team_id = t.id
      WHERE c.tenant_id = ? AND c.workspace_id = ?
    `;
    const params: any[] = [req.tenantId, req.workspaceId];

    if (status) { query += ` AND c.status = ?`; params.push(status); }
    if (assigned_user_id) { query += ` AND c.assigned_user_id = ?`; params.push(assigned_user_id); }
    if (priority) { query += ` AND c.priority = ?`; params.push(priority); }
    if (risk_level) { query += ` AND c.risk_level = ?`; params.push(risk_level); }
    if (q) {
      query += ` AND (c.case_number LIKE ? OR cu.canonical_name LIKE ? OR cu.canonical_email LIKE ?)`;
      const term = `%${q}%`;
      params.push(term, term, term);
    }

    query += ` ORDER BY c.last_activity_at DESC`;

    const cases = db.prepare(query).all(...params);
    const enriched = cases.map(row => {
      const parsed = parseRow<Case>(row) as any;
      const summary = buildCaseListSummary(parsed.id, req.tenantId!, req.workspaceId!);

      return {
        ...parsed,
        latest_message_preview: summary?.latest_message_preview || null,
        channel_context: summary?.channel_context || null,
        system_status_summary: summary?.system_status_summary || null,
        conflict_summary: summary?.conflict_summary || null,
      };
    });

    res.json(enriched);
  } catch (error) {
    console.error('Error fetching cases:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const row = db.prepare(`
      SELECT c.*,
             cu.canonical_name AS customer_name, cu.canonical_email AS customer_email,
             cu.segment AS customer_segment, cu.lifetime_value, cu.risk_level AS customer_risk,
             cu.total_orders, cu.total_spent, cu.dispute_rate, cu.refund_rate,
             u.name AS assigned_user_name, u.email AS assigned_user_email,
             t.name AS assigned_team_name
      FROM cases c
      LEFT JOIN customers cu ON c.customer_id = cu.id
      LEFT JOIN users u ON c.assigned_user_id = u.id
      LEFT JOIN teams t ON c.assigned_team_id = t.id
      WHERE c.id = ? AND c.tenant_id = ? AND c.workspace_id = ?
    `).get(req.params.id, req.tenantId, req.workspaceId);

    if (!row) return res.status(404).json({ error: 'Case not found' });

    const parsed = parseRow<Case>(row) as any;
    res.json({
      ...parsed,
      state_snapshot: getCaseCanonicalState(req.params.id, req.tenantId!, req.workspaceId!),
    });
  } catch (error) {
    console.error('Error fetching case:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/state', (req: MultiTenantRequest, res: Response) => {
  try {
    const state = getCaseCanonicalState(req.params.id, req.tenantId!, req.workspaceId!);
    if (!state) return res.status(404).json({ error: 'Case not found' });
    res.json(state);
  } catch (error) {
    console.error('Error fetching case state:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/graph', (req: MultiTenantRequest, res: Response) => {
  try {
    const graph = buildCaseGraphView(req.params.id, req.tenantId!, req.workspaceId!);
    if (!graph) return res.status(404).json({ error: 'Case not found' });
    res.json(graph);
  } catch (error) {
    console.error('Error fetching case graph:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/resolve', (req: MultiTenantRequest, res: Response) => {
  try {
    const resolve = buildCaseResolveView(req.params.id, req.tenantId!, req.workspaceId!);
    if (!resolve) return res.status(404).json({ error: 'Case not found' });
    res.json(resolve);
  } catch (error) {
    console.error('Error fetching case resolve view:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/timeline', (req: MultiTenantRequest, res: Response) => {
  try {
    const timeline = buildCaseTimeline(req.params.id, req.tenantId!, req.workspaceId!);
    res.json(timeline);
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/inbox-view', (req: MultiTenantRequest, res: Response) => {
  try {
    const view = buildInboxView(req.params.id, req.tenantId!, req.workspaceId!);
    if (!view) return res.status(404).json({ error: 'Case not found' });
    res.json(view);
  } catch (error) {
    console.error('Error fetching inbox view:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id/status', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const { status, reason, changed_by } = req.body;

    const existing = db.prepare('SELECT status FROM cases WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId) as any;
    if (!existing) return res.status(404).json({ error: 'Case not found' });

    db.prepare(`
      UPDATE cases
      SET status = ?, updated_at = CURRENT_TIMESTAMP, last_activity_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `).run(status, req.params.id, req.tenantId);

    db.prepare(`
      INSERT INTO case_status_history (id, case_id, from_status, to_status, changed_by, changed_by_type, reason, tenant_id)
      VALUES (?, ?, ?, ?, ?, 'human', ?, ?)
    `).run(crypto.randomUUID(), req.params.id, existing.status, status, changed_by || req.userId, reason || null, req.tenantId);

    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId!,
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

router.patch('/:id/assign', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const { user_id, team_id } = req.body;

    db.prepare(`
      UPDATE cases
      SET assigned_user_id = ?, assigned_team_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `).run(user_id || null, team_id || null, req.params.id, req.tenantId);

    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
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

router.post('/:id/internal-note', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const { content } = req.body;
    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    const caseRow = db.prepare(`
      SELECT id, conversation_id
      FROM cases
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).get(req.params.id, req.tenantId, req.workspaceId) as any;

    if (!caseRow) return res.status(404).json({ error: 'Case not found' });

    const noteId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO internal_notes (id, case_id, content, created_by, created_by_type, created_at, tenant_id)
      VALUES (?, ?, ?, ?, 'human', ?, ?)
    `).run(noteId, req.params.id, String(content).trim(), req.userId || 'user_local', now, req.tenantId);

    let messageId: string | null = null;
    if (caseRow.conversation_id) {
      messageId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO messages (
          id, conversation_id, case_id, type, direction, sender_id, sender_name,
          content, channel, sent_at, created_at, tenant_id
        )
        VALUES (?, ?, ?, 'internal', 'outbound', ?, ?, ?, 'internal', ?, ?, ?)
      `).run(
        messageId,
        caseRow.conversation_id,
        req.params.id,
        req.userId || 'user_local',
        'Internal Note',
        String(content).trim(),
        now,
        now,
        req.tenantId,
      );
    }

    db.prepare(`
      UPDATE cases
      SET last_activity_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `).run(now, req.params.id, req.tenantId);

    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
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

router.post('/:id/reply', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const { content, draft_reply_id } = req.body;
    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: 'Reply content is required' });
    }

    const caseRow = db.prepare(`
      SELECT id, case_number, conversation_id, source_channel, source_entity_id, customer_id
      FROM cases
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).get(req.params.id, req.tenantId, req.workspaceId) as any;

    if (!caseRow) return res.status(404).json({ error: 'Case not found' });
    const conversation = ensureConversationForCase(caseRow, req.tenantId!, req.workspaceId!) as any;

    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const now = new Date().toISOString();
    const queuedMessageId = crypto.randomUUID();
    const channel = conversation.channel || caseRow.source_channel || 'web_chat';

    db.prepare(`
      INSERT INTO messages (
        id, conversation_id, case_id, customer_id, type, direction, sender_id, sender_name,
        content, content_type, channel, external_message_id, draft_reply_id,
        sent_at, created_at, tenant_id
      )
      VALUES (?, ?, ?, ?, 'agent', 'outbound', ?, ?, ?, 'text', ?, ?, ?, ?, ?, ?)
    `).run(
      queuedMessageId,
      conversation.id,
      req.params.id,
      caseRow.customer_id || null,
      req.userId || 'user_local',
      'Alex Morgan',
      String(content).trim(),
      channel,
      `queued_${queuedMessageId}`,
      draft_reply_id || null,
      now,
      now,
      req.tenantId,
    );

    db.prepare(`
      UPDATE conversations
      SET last_message_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).run(now, conversation.id, req.tenantId, req.workspaceId);

    db.prepare(`
      UPDATE cases
      SET last_activity_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).run(now, req.params.id, req.tenantId, req.workspaceId);

    enqueue(
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

    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
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
      db.prepare(`
        UPDATE draft_replies
        SET status = 'sent', sent_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND case_id = ? AND tenant_id = ?
      `).run(now, draft_reply_id, req.params.id, req.tenantId);
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
