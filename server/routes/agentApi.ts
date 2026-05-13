/**
 * server/routes/agentApi.ts
 *
 * Max-style CRM AI Agent API endpoints.
 *
 * POST /agent/chat               — send a message, SSE-stream the response
 * POST /agent/chat/approve       — resume after approval_request (approve/reject)
 * GET  /agent/conversations      — list conversation history
 * GET  /agent/conversations/:id  — get full conversation + messages
 * DELETE /agent/conversations/:id — delete a conversation
 */

import { Router } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import {
  runAgentChat,
  listConversations,
  getConversation,
  deleteConversation,
  type AgentContext,
} from '../lib/agent.js';

const router = Router();
router.use(extractMultiTenant);

// ── POST /api/agent/chat ──────────────────────────────────────────────────────
//
// Body:
//   message        string   required — the user's message
//   conversationId string   optional — continue an existing conversation
//   context        object   optional — current UI context (view, selectedContactId, etc.)
//
// Response: Server-Sent Events stream

router.post('/chat', async (req: MultiTenantRequest, res) => {
  const { message, conversationId, context } = req.body ?? {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  await runAgentChat({
    tenantId: req.tenantId ?? 'org_default',
    workspaceId: req.workspaceId ?? null,
    userId: req.userId ?? null,
    conversationId: conversationId ?? undefined,
    message: message.trim(),
    context: context as AgentContext | undefined,
    res,
  });
});

// ── POST /api/agent/chat/approve ──────────────────────────────────────────────
//
// Resume an agent loop paused for approval.
//
// Body:
//   proposalId    string   required — the proposalId from the approval_request SSE event
//   action        string   required — 'approve' | 'reject'
//   feedback      string   optional — reason for rejection (shown to the agent)
//   conversationId string  required — ongoing conversation ID
//
// Response: Server-Sent Events stream (same taxonomy as /chat)

router.post('/chat/approve', async (req: MultiTenantRequest, res) => {
  const { proposalId, action, feedback, conversationId } = req.body ?? {};

  if (!proposalId || typeof proposalId !== 'string') {
    res.status(400).json({ error: 'proposalId is required' });
    return;
  }
  if (action !== 'approve' && action !== 'reject') {
    res.status(400).json({ error: 'action must be "approve" or "reject"' });
    return;
  }
  if (!conversationId || typeof conversationId !== 'string') {
    res.status(400).json({ error: 'conversationId is required' });
    return;
  }

  await runAgentChat({
    tenantId: req.tenantId ?? 'org_default',
    workspaceId: req.workspaceId ?? null,
    userId: req.userId ?? null,
    conversationId,
    message: `__approval_resume__${proposalId}`,
    res,
    resumeApproval: {
      action: action as 'approve' | 'reject',
      proposalId,
      feedback: typeof feedback === 'string' ? feedback : undefined,
    },
  });
});

// ── GET /api/agent/conversations ──────────────────────────────────────────────

router.get('/conversations', async (req: MultiTenantRequest, res) => {
  try {
    const conversations = await listConversations(
      req.tenantId ?? 'org_default',
      req.workspaceId ?? null,
      req.userId ?? null,
    );
    res.json({ ok: true, conversations });
  } catch (err: any) {
    console.error('agent conversations list error:', err);
    res.status(500).json({ error: 'Internal server error', detail: err?.message });
  }
});

// ── GET /api/agent/conversations/:id ─────────────────────────────────────────

router.get('/conversations/:id', async (req: MultiTenantRequest, res) => {
  try {
    const result = await getConversation(req.params.id, req.tenantId ?? 'org_default');
    if (!result) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    res.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('agent conversation get error:', err);
    res.status(500).json({ error: 'Internal server error', detail: err?.message });
  }
});

// ── DELETE /api/agent/conversations/:id ───────────────────────────────────────

router.delete('/conversations/:id', async (req: MultiTenantRequest, res) => {
  try {
    await deleteConversation(req.params.id, req.tenantId ?? 'org_default');
    res.json({ ok: true });
  } catch (err: any) {
    console.error('agent conversation delete error:', err);
    res.status(500).json({ error: 'Internal server error', detail: err?.message });
  }
});

export default router;
