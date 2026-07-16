/**
 * server/routes/agentApi.ts
 *
 * Operator Super Agent API (Max-style, see docs/posthog-support-agent-analysis.md).
 *
 * POST   /agent/chat               — send a message, SSE-stream the agent loop
 * POST   /agent/chat/approve       — resume after approval_request (phase 2)
 * GET    /agent/conversations      — list conversation history
 * GET    /agent/conversations/:id  — get conversation + messages (toolCalls parsed)
 * DELETE /agent/conversations/:id  — delete a conversation
 * GET    /agent/toolkit            — QA: inspect the tool catalog per surface
 */

import { Router } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { runChatAgent } from '../agents/chatAgent/index.js';
import { createExpressSSEEmitter } from '../agents/chatAgent/sse.js';
import { selectToolkit, type AgentSurface } from '../agents/chatAgent/toolkit.js';
import { assembleSituation } from '../agents/chatAgent/situation.js';
import { listTracesForSession, getTraceMetrics } from '../agents/planEngine/traceRepository.js';
import {
  listConversations,
  getConversation,
  listMessages,
  deleteConversation,
} from '../data/agentConversations.js';

const router = Router();
router.use(extractMultiTenant);

function buildHasPermission(req: MultiTenantRequest): (perm: string) => boolean {
  return (perm: string) =>
    Array.isArray(req.permissions) &&
    (req.permissions.includes('*') || req.permissions.includes(perm));
}

const ChatBodySchema = z.object({
  message: z.string().trim().min(1, 'message is required').max(8000),
  conversation_id: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

// ── POST /api/agent/chat ──────────────────────────────────────────────────────

router.post('/chat', async (req: MultiTenantRequest, res) => {
  const parsed = ChatBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' });
    return;
  }
  const body = parsed.data;

  const emitter = createExpressSSEEmitter(res);
  await runChatAgent({
    tenantId: req.tenantId ?? 'org_default',
    workspaceId: req.workspaceId ?? null,
    userId: req.userId ?? null,
    conversationId: body.conversation_id ?? body.conversationId,
    message: body.message,
    uiContext: body.context,
    hasPermission: buildHasPermission(req),
    emitter,
  });
});

// ── POST /api/agent/chat/approve ──────────────────────────────────────────────
//
// Resume a conversation paused on an approval_request. Streams the same SSE
// taxonomy as /chat (tool_start, tool_result, text_chunk, done, error).

const ApproveBodySchema = z.object({
  conversation_id: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  proposalId: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  feedback: z.string().max(2000).optional(),
});

router.post('/chat/approve', async (req: MultiTenantRequest, res) => {
  const parsed = ApproveBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' });
    return;
  }
  const body = parsed.data;
  const conversationId = body.conversation_id ?? body.conversationId;
  if (!conversationId) {
    res.status(400).json({ error: 'conversationId is required' });
    return;
  }

  const emitter = createExpressSSEEmitter(res);
  await runChatAgent({
    tenantId: req.tenantId ?? 'org_default',
    workspaceId: req.workspaceId ?? null,
    userId: req.userId ?? null,
    conversationId,
    message: '',
    hasPermission: buildHasPermission(req),
    emitter,
    resume: { proposalId: body.proposalId, decision: body.action, feedback: body.feedback },
  });
});

// ── GET /api/agent/situation — the "what's happening now" briefing ────────────

router.get('/situation', async (req: MultiTenantRequest, res) => {
  try {
    const situation = await assembleSituation({
      tenantId: req.tenantId ?? 'org_default',
      workspaceId: req.workspaceId ?? 'ws_default',
      userId: req.userId ?? null,
    });
    res.json({ ok: true, situation });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error', detail: (err as Error)?.message });
  }
});

// ── Conversations CRUD ────────────────────────────────────────────────────────

router.get('/conversations', async (req: MultiTenantRequest, res) => {
  try {
    const scope = {
      tenantId: req.tenantId ?? 'org_default',
      workspaceId: req.workspaceId ?? null,
      userId: req.userId ?? null,
    };
    const rows = await listConversations(scope);
    res.json({
      ok: true,
      conversations: rows.map((r) => ({
        id: r.id,
        title: r.title,
        message_count: r.message_count,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error', detail: (err as Error)?.message });
  }
});

router.get('/conversations/:id', async (req: MultiTenantRequest, res) => {
  try {
    const scope = {
      tenantId: req.tenantId ?? 'org_default',
      workspaceId: req.workspaceId ?? null,
      userId: req.userId ?? null,
    };
    const conversation = await getConversation(scope, req.params.id);
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    const messages = await listMessages(scope, req.params.id);
    const pending = conversation.pending_action;
    res.json({
      ok: true,
      conversation: {
        id: conversation.id,
        title: conversation.title,
        message_count: conversation.message_count,
        status: conversation.status ?? 'active',
        created_at: conversation.created_at,
        updated_at: conversation.updated_at,
      },
      // Surface a parked approval so the UI can rebuild the card after a reload.
      pending_approval: pending
        ? {
            proposalId: pending.proposalId,
            toolName: pending.primaryToolName,
            args: pending.primaryArgs,
            risk: pending.risk,
            preview: pending.preview,
          }
        : null,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        tool_calls: m.tool_calls,
        created_at: m.created_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error', detail: (err as Error)?.message });
  }
});

// ── GET /api/agent/conversations/:id/trace — auditable timeline ───────────────

router.get('/conversations/:id/trace', async (req: MultiTenantRequest, res) => {
  try {
    const scope = {
      tenantId: req.tenantId ?? 'org_default',
      workspaceId: req.workspaceId ?? null,
      userId: req.userId ?? null,
    };
    // Ownership check before exposing traces.
    const conversation = await getConversation(scope, req.params.id);
    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    const [traces, metrics] = await Promise.all([
      listTracesForSession(req.params.id, 50),
      getTraceMetrics(req.params.id),
    ]);
    res.json({ ok: true, traces, metrics });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error', detail: (err as Error)?.message });
  }
});

router.delete('/conversations/:id', async (req: MultiTenantRequest, res) => {
  try {
    const scope = {
      tenantId: req.tenantId ?? 'org_default',
      workspaceId: req.workspaceId ?? null,
      userId: req.userId ?? null,
    };
    await deleteConversation(scope, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error', detail: (err as Error)?.message });
  }
});

// ── GET /api/agent/toolkit — QA / contract inspection ─────────────────────────

router.get('/toolkit', (req: MultiTenantRequest, res) => {
  const surface = (req.query.surface === 'support_readonly'
    ? 'support_readonly'
    : 'operator') as AgentSurface;
  const catalog = selectToolkit({
    hasPermission: buildHasPermission(req),
    surface,
    maxRisk: req.query.max_risk as never ?? 'medium',
  });
  res.json({
    ok: true,
    surface,
    count: catalog.length,
    tools: catalog.map((t) => ({
      name: t.name,
      description: t.description,
      category: t.category,
      side_effect: t.sideEffect,
      risk: t.risk,
    })),
  });
});

export default router;
