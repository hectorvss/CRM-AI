/**
 * server/lib/agent.ts
 *
 * Clain AI Assistant — workspace-scoped conversational agent.
 *
 * Exported surface consumed by server/routes/agentApi.ts:
 *   - runAgentChat(input)      → streams SSE events to the Express Response
 *   - listConversations(...)   → returns conversation metadata array
 *   - getConversation(id, ...) → returns thread + messages
 *   - deleteConversation(...)  → removes a thread
 *   - AgentContext             → UI context type
 *
 * Persistence: copilot_threads + copilot_thread_messages tables (Supabase).
 * Streaming: Google Gemini generateContentStream over Server-Sent Events.
 */

import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { config } from '../config.js';
import { SAAS_PRODUCT_CONTEXT, ASSISTANT_TONE_GUIDE } from '../ai/systemContext.js';
import { withGeminiRetry } from '../ai/geminiRetry.js';
import { pickGeminiModel } from '../ai/modelSelector.js';
import { logger } from '../utils/logger.js';
import {
  getOrCreateThread,
  getThread,
  appendMessage,
  closeThread,
  listThreads,
  type CopilotMessage,
} from '../data/copilotThreads.js';
import { getSupabaseAdmin } from '../db/supabase.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentContext {
  view?: string;
  selectedCaseId?: string;
  selectedCustomerId?: string;
  selectedConversationId?: string;
  [key: string]: unknown;
}

interface RunAgentChatInput {
  tenantId: string;
  workspaceId: string | null;
  userId: string | null;
  conversationId?: string;
  message: string;
  context?: AgentContext;
  res: Response;
  resumeApproval?: {
    action: 'approve' | 'reject';
    proposalId: string;
    feedback?: string;
  };
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

function sseWrite(res: Response, event: string, data: unknown) {
  if (res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function initSSE(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(context?: AgentContext): string {
  const contextSection = context && Object.keys(context).length > 0
    ? `\n\n## Current UI context\n${JSON.stringify(context, null, 2)}`
    : '';

  return `${SAAS_PRODUCT_CONTEXT}

${ASSISTANT_TONE_GUIDE}

## Your role
You are the Clain AI Assistant — an in-product copilot for CX operators and support managers.
You help users understand their data, navigate the product, draft replies, analyse cases, and suggest actions.
You have access to the workspace's cases, customers, conversations, and settings.
Respond concisely. Use Markdown for structure when it aids clarity.
${contextSection}`;
}

// ── Main chat function ────────────────────────────────────────────────────────

export async function runAgentChat(input: RunAgentChatInput): Promise<void> {
  const { tenantId, workspaceId, userId, message, context, res, resumeApproval } = input;

  initSSE(res);

  // Generate or reuse conversation ID
  const conversationId = input.conversationId ?? randomUUID();
  const wsId = workspaceId ?? 'ws_default';

  sseWrite(res, 'conversation_id', { conversationId });

  try {
    // ── Load or create thread ──────────────────────────────────────────────
    const thread = await getOrCreateThread(
      { tenantId, workspaceId: wsId },
      conversationId,
      'clain-assistant',
    );

    const history: CopilotMessage[] = Array.isArray(thread?.messages) ? thread.messages : [];

    // ── Handle approval resume ─────────────────────────────────────────────
    let userMessage = message;
    if (resumeApproval) {
      const { action, proposalId, feedback } = resumeApproval;
      userMessage = action === 'approve'
        ? `[Approval granted for proposal ${proposalId}]`
        : `[Approval rejected for proposal ${proposalId}${feedback ? `: ${feedback}` : ''}]`;
    }

    // Persist user turn
    await appendMessage(
      { tenantId, workspaceId: wsId },
      conversationId,
      { role: 'user', content: userMessage, ts: new Date().toISOString() },
    ).catch(() => {/* non-fatal */});

    // ── Build Gemini history ───────────────────────────────────────────────
    const geminiHistory = history
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    // ── Call Gemini with streaming ─────────────────────────────────────────
    if (!config.ai?.geminiApiKey) {
      // No API key — return a helpful stub response
      sseWrite(res, 'delta', { text: 'El asistente de IA no está configurado en este entorno. Por favor, añade `GEMINI_API_KEY` a las variables de entorno.' });
      sseWrite(res, 'done', { conversationId, finishReason: 'no_api_key' });
      res.end();
      return;
    }

    const genAI = new GoogleGenerativeAI(config.ai.geminiApiKey);
    const modelName = pickGeminiModel('copilot_chat');
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: buildSystemPrompt(context),
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT,       threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
      ],
    });

    const chat = model.startChat({ history: geminiHistory });

    let fullText = '';

    await withGeminiRetry(async () => {
      const streamResult = await chat.sendMessageStream(userMessage);

      for await (const chunk of streamResult.stream) {
        const text = chunk.text();
        if (text) {
          fullText += text;
          sseWrite(res, 'delta', { text });
        }
      }
    }, { label: 'agent-chat', attempts: 2 });

    // Persist assistant turn
    await appendMessage(
      { tenantId, workspaceId: wsId },
      conversationId,
      { role: 'assistant', content: fullText, ts: new Date().toISOString() },
    ).catch(() => {/* non-fatal */});

    sseWrite(res, 'done', { conversationId, finishReason: 'stop', tokensUsed: Math.ceil(fullText.length / 4) });
    res.end();

  } catch (err: any) {
    logger.error('agent.runAgentChat: error', { error: err?.message, tenantId, conversationId });
    sseWrite(res, 'error', { message: err?.message ?? 'Agent error', code: 'AGENT_ERROR' });
    if (!res.writableEnded) res.end();
  }
}

// ── Conversation management ───────────────────────────────────────────────────

export async function listConversations(
  tenantId: string,
  workspaceId: string | null,
  userId: string | null,
): Promise<Array<{
  id: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message?: string;
}>> {
  try {
    const threads = await listThreads(
      { tenantId, workspaceId: workspaceId ?? 'ws_default' },
      'clain-assistant',
    );
    return (threads ?? []).map((t: any) => ({
      id: t.id ?? t.conversation_id,
      created_at: t.created_at,
      updated_at: t.updated_at ?? t.created_at,
      message_count: Array.isArray(t.messages) ? t.messages.length : 0,
      last_message: Array.isArray(t.messages) && t.messages.length > 0
        ? (t.messages[t.messages.length - 1] as CopilotMessage).content?.slice(0, 120)
        : undefined,
    }));
  } catch (err: any) {
    logger.warn('agent.listConversations: error', { error: err?.message });
    return [];
  }
}

export async function getConversation(
  conversationId: string,
  tenantId: string,
): Promise<{ conversationId: string; messages: CopilotMessage[] } | null> {
  try {
    const thread = await getThread(tenantId, conversationId);
    if (!thread) return null;
    return {
      conversationId,
      messages: Array.isArray(thread.messages) ? thread.messages : [],
    };
  } catch (err: any) {
    logger.warn('agent.getConversation: error', { error: err?.message, conversationId });
    return null;
  }
}

export async function deleteConversation(
  conversationId: string,
  tenantId: string,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    await supabase
      .from('copilot_threads')
      .delete()
      .eq('id', conversationId)
      .eq('tenant_id', tenantId);
  } catch (err: any) {
    logger.warn('agent.deleteConversation: error', { error: err?.message, conversationId });
  }
}
