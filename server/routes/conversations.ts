import { Router, Response } from 'express';
import { getDb } from '../db/client.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { parseRow, logAudit } from '../db/utils.js';
import { sendError } from '../http/errors.js';

const router = Router();

// Apply multi-tenant middleware
router.use(extractMultiTenant);
router.use(requirePermission('cases.read'));

// ── GET /api/conversations/:id ────────────────────────────
router.get('/:id', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const conv = db.prepare(
      'SELECT * FROM conversations WHERE id = ? AND tenant_id = ? AND workspace_id = ?'
    ).get(req.params.id, req.tenantId, req.workspaceId);
    
    if (!conv) return sendError(res, 404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
    res.json(parseRow(conv));
  } catch (error) {
    console.error('Error fetching conversation:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// ── GET /api/conversations/:id/messages ──────────────────
router.get('/:id/messages', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const messages = db.prepare(
      'SELECT * FROM messages WHERE conversation_id = ? AND tenant_id = ? ORDER BY sent_at ASC'
    ).all(req.params.id, req.tenantId);
    res.json(messages.map(parseRow));
  } catch (error) {
    console.error('Error fetching messages:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// ── POST /api/conversations/:id/messages ─────────────────
router.post('/:id/messages', requirePermission('cases.write'), (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const conv = db.prepare(
      'SELECT * FROM conversations WHERE id = ? AND tenant_id = ?'
    ).get(req.params.id, req.tenantId) as any;
    
    if (!conv) return sendError(res, 404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');

    const { type, content, sender_name } = req.body;
    const messageId = crypto.randomUUID();

    db.prepare(`
      INSERT INTO messages (id, conversation_id, case_id, type, sender_id, sender_name, content, channel, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      messageId, req.params.id, conv.case_id, 
      type || 'agent', req.userId, sender_name || null, 
      content, conv.channel, req.tenantId
    );

    // Update Case Activity
    db.prepare(`
      UPDATE cases 
      SET last_activity_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND tenant_id = ?
    `).run(conv.case_id, req.tenantId);

    // Audit Event
    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId!,
      action: 'MESSAGE_SENT',
      entityType: 'conversation',
      entityId: req.params.id,
      metadata: { messageId, type: type || 'agent' }
    });

    res.json({ success: true, id: messageId });
  } catch (error) {
    console.error('Error sending message:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// ── GET /api/conversations/by-case/:caseId ───────────────
router.get('/by-case/:caseId', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const conv = db.prepare(
      'SELECT * FROM conversations WHERE case_id = ? AND tenant_id = ? AND workspace_id = ?'
    ).get(req.params.caseId, req.tenantId, req.workspaceId) as any;

    if (!conv) return sendError(res, 404, 'CASE_CONVERSATION_NOT_FOUND', 'No conversation found for this case');

    const messages = db.prepare(
      'SELECT * FROM messages WHERE conversation_id = ? AND tenant_id = ? ORDER BY sent_at ASC'
    ).all(conv.id, req.tenantId);

    res.json({ ...parseRow(conv), messages: messages.map(parseRow) });
  } catch (error) {
    console.error('Error fetching conversation by case:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;
