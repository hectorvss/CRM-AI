/**
 * server/lib/agent.ts
 *
 * Max-style CRM AI Agent — PostHog-architecture rewrite.
 *
 * Key features:
 *  - Multi-turn Gemini function-calling loop (up to 24 tool calls / turn)
 *  - 6 specialised modes, each with mode-specific tools + system-prompt addition
 *  - Core memory — persistent text blob per tenant, injected into every system prompt
 *  - Title generation — Gemini generates a ≤8-word title after the first user message
 *  - Slash commands handled before LLM call: /remember, /clear, /mode, /help
 *  - Approval flow — dangerous operations pause execution and emit approval_request
 *  - Rich tool result artifacts: (text_description, structured_data)
 *  - SSE event taxonomy: conversation_created, title_generated, tool_start,
 *    tool_result, text_chunk, approval_request, memory_updated, done, error
 *  - Keepalive comment every 15 seconds
 */

import {
  GoogleGenerativeAI,
  type Content,
  type FunctionDeclaration,
  type Part,
} from '@google/generative-ai';
import { Response } from 'express';
import { config } from '../config.js';
import { getSupabaseAdmin } from '../db/supabase.js';

// ── Shared Types ──────────────────────────────────────────────────────────────

export type AgentMode =
  | 'contacts'
  | 'conversations'
  | 'reports'
  | 'sql'
  | 'automation'
  | 'ai';

export interface AgentContext {
  currentView?: string;
  selectedContactId?: string;
  selectedConversationId?: string;
  extraInfo?: Record<string, unknown>;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallRecord[];
  createdAt: string;
}

export interface ToolCallRecord {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  durationMs: number;
}

export interface ConversationRow {
  id: string;
  tenant_id: string;
  workspace_id: string | null;
  user_id: string | null;
  title: string;
  mode: AgentMode;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface AgentSession {
  tenantId: string;
  workspaceId: string | null;
  userId: string | null;
  conversationId?: string;
  message: string;
  context?: AgentContext;
  resumeApproval?: {
    action: 'approve' | 'reject';
    proposalId: string;
    feedback?: string;
  };
  res: Response;
}

/** Tool result artifact — text for LLM, structured data for frontend */
interface ToolArtifact {
  text: string;
  data: unknown;
}

/** Pending approval stored in memory while waiting for user decision */
interface PendingApproval {
  proposalId: string;
  toolName: string;
  args: Record<string, unknown>;
  tenantId: string;
  workspaceId: string | null;
  conversationId: string;
  /** Contents array to resume the Gemini loop from */
  contents: Content[];
  toolCallsThisTurn: ToolCallRecord[];
  fullAssistantText: string;
}

// ── In-Memory Approval Store ──────────────────────────────────────────────────
// Key: proposalId → PendingApproval
// Production: replace with a Redis/DB store for multi-instance deployments.
const pendingApprovals = new Map<string, PendingApproval>();

// ── Mode Configuration ─────────────────────────────────────────────────────────

const MODE_TOOLS: Record<AgentMode, string[]> = {
  contacts: [
    'get_contact',
    'create_contact',
    'update_contact',
    'merge_contacts',
    'list_contacts_paginated',
  ],
  conversations: [
    'get_conversation',
    'create_conversation',
    'assign_conversation',
    'update_conversation_status',
    'list_conversations',
  ],
  reports: [
    'get_reporting_overview',
    'get_csat_summary',
    'get_calls_stats',
    'get_reporting_rollups',
  ],
  sql: ['run_sql_query'],
  automation: ['list_automation_rules', 'get_sla_status', 'list_macros'],
  ai: ['list_ai_feedback', 'list_mcp_servers', 'search_knowledge_base'],
};

const CORE_TOOLS = [
  'switch_mode',
  'search_contacts',
  'search_companies',
  'remember_fact',
  'recall_memory',
  'get_current_context',
];

const DANGEROUS_TOOLS = new Set([
  'create_conversation',
  'merge_contacts',
  'update_conversation_status',
]);

const MODE_SYSTEM_ADDITIONS: Record<AgentMode, string> = {
  contacts: `
## Mode: Contacts
You are in Contacts mode. Focus on contact lookup, creation, deduplication, and updates.
Use list_contacts_paginated for browsing, get_contact for a specific record, merge_contacts to deduplicate.
`,
  conversations: `
## Mode: Conversations
You are in Conversations mode. Help manage support tickets and conversations.
Use list_conversations to browse, create_conversation to open new tickets (requires approval),
assign_conversation to route to agents, update_conversation_status to resolve/reopen.
`,
  reports: `
## Mode: Reports
You are in Reports mode. Surface KPIs, CSAT data, call stats, and operational rollups.
Prefer visual summaries — tables and bullet lists with formatted numbers.
`,
  sql: `
## Mode: SQL
You are in SQL mode. Accept user natural-language questions and translate them to SELECT queries.
Always scope queries to the current tenant. Only SELECT statements are permitted.
`,
  automation: `
## Mode: Automation
You are in Automation mode. Help review and explain automation rules, SLA policies, and macros.
Never mutate rules — surface them for the user to act on.
`,
  ai: `
## Mode: AI
You are in AI mode. Review AI feedback ratings, list MCP server integrations, and search the knowledge base.
`,
};

// ── System Prompt Builder ──────────────────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `You are Max, an intelligent AI assistant deeply integrated into CRM-AI — a modern customer relationship management platform.

## Your persona
You are friendly, concise, and action-oriented. You proactively suggest next steps.
You present data in readable formats (tables, bullet lists).
You never make up data — if a tool returns empty results, say so clearly.

## Rules
1. Always call a tool when you need real data. Never guess or invent CRM data.
2. When a tool fails, explain clearly what happened and suggest alternatives.
3. Present numbers with appropriate formatting (currencies with $, percentages with %).
4. Keep responses concise — bullet points and tables over long paragraphs.
5. Respond in the same language the user writes in.
6. You can switch modes at any time with switch_mode when the topic changes.
7. Use remember_fact to persist important facts the user tells you across sessions.

## Available slash commands
- /remember [text] — persist a fact to core memory
- /clear — clear this conversation's history
- /mode [mode] — switch to a specific mode (contacts/conversations/reports/sql/automation/ai)
- /help — show this help

## Current context
{CONTEXT}
`;

function buildSystemPrompt(
  mode: AgentMode,
  coreMemory: string,
  context?: AgentContext,
): string {
  let contextStr = 'No specific view context provided.';
  if (context && Object.keys(context).length > 0) {
    const parts: string[] = [];
    if (context.currentView) parts.push(`Current CRM view: ${context.currentView}`);
    if (context.selectedContactId)
      parts.push(`Selected contact ID: ${context.selectedContactId}`);
    if (context.selectedConversationId)
      parts.push(`Selected conversation ID: ${context.selectedConversationId}`);
    if (context.extraInfo)
      parts.push(`Additional info: ${JSON.stringify(context.extraInfo)}`);
    contextStr = parts.join('\n');
  }

  let prompt = BASE_SYSTEM_PROMPT.replace('{CONTEXT}', contextStr);
  prompt += MODE_SYSTEM_ADDITIONS[mode];

  if (coreMemory.trim()) {
    prompt += `\n## Core Memory\n${coreMemory.trim()}\n`;
  }

  return prompt;
}

// ── Core Memory ───────────────────────────────────────────────────────────────

async function getCoreMemory(tenantId: string): Promise<string> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('agent_core_memory')
      .select('content')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error || !data) return '';
    return (data as { content: string }).content ?? '';
  } catch {
    return '';
  }
}

async function appendCoreMemory(tenantId: string, fact: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const entry = `[${timestamp}] ${fact}`;

  const existing = await getCoreMemory(tenantId);
  const updated = existing ? `${existing}\n${entry}` : entry;

  await supabase
    .from('agent_core_memory')
    .upsert(
      { tenant_id: tenantId, content: updated, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id' },
    );

  return updated;
}

// ── SSE Helpers ───────────────────────────────────────────────────────────────

function sse(res: Response, event: string, data: object): void {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // Client disconnected — ignore write errors
  }
}

// ── Tool Declarations ─────────────────────────────────────────────────────────

function makeDecl(
  name: string,
  description: string,
  properties: Record<string, { type: string; description: string; enum?: string[] }>,
  required: string[] = [],
): FunctionDeclaration {
  return {
    name,
    description,
    parameters: {
      type: 'object' as const,
      properties: properties as Record<string, { type: 'string' | 'number' | 'boolean' | 'object' | 'array'; description: string }>,
      required,
    } as FunctionDeclaration['parameters'],
  };
}

const CORE_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  makeDecl(
    'switch_mode',
    'Switch the agent to a different specialised mode. Call this when the conversation topic changes significantly.',
    {
      new_mode: {
        type: 'string',
        description: 'Target mode',
        enum: ['contacts', 'conversations', 'reports', 'sql', 'automation', 'ai'],
      },
      reason: { type: 'string', description: 'Brief reason for switching' },
    },
    ['new_mode', 'reason'],
  ),
  makeDecl(
    'search_contacts',
    'Search contacts by name, email, or phone. Returns matching contacts with key details.',
    {
      query: { type: 'string', description: 'Search term (name, email, or phone)' },
      limit: { type: 'number', description: 'Max results to return (default 10, max 50)' },
    },
    ['query'],
  ),
  makeDecl(
    'search_companies',
    'Search companies by name, domain, or industry.',
    {
      query: { type: 'string', description: 'Search term' },
      limit: { type: 'number', description: 'Max results (default 10)' },
    },
    ['query'],
  ),
  makeDecl(
    'remember_fact',
    'Persist an important fact or preference to core memory. This will be available in all future conversations.',
    {
      fact: { type: 'string', description: 'The fact or preference to remember' },
    },
    ['fact'],
  ),
  makeDecl(
    'recall_memory',
    'Search or retrieve content from core memory.',
    {
      query: { type: 'string', description: 'What to look for in memory' },
    },
    ['query'],
  ),
  makeDecl(
    'get_current_context',
    'Returns the current CRM view, selected entity IDs, and any other UI context the user has open.',
    {},
    [],
  ),
];

const MODE_TOOL_DECLARATIONS: Record<AgentMode, FunctionDeclaration[]> = {
  contacts: [
    makeDecl(
      'get_contact',
      'Fetch full details of a specific contact by ID.',
      { id: { type: 'string', description: 'Contact ID' } },
      ['id'],
    ),
    makeDecl(
      'create_contact',
      'Create a new contact record in the CRM. Requires approval.',
      {
        name: { type: 'string', description: 'Full name' },
        email: { type: 'string', description: 'Email address' },
        phone: { type: 'string', description: 'Phone number (optional)' },
        company_id: { type: 'string', description: 'Associated company ID (optional)' },
      },
      ['name', 'email'],
    ),
    makeDecl(
      'update_contact',
      'Update fields on an existing contact record.',
      {
        id: { type: 'string', description: 'Contact ID to update' },
        fields: { type: 'object', description: 'Key-value pairs to update' },
      },
      ['id', 'fields'],
    ),
    makeDecl(
      'merge_contacts',
      'Merge a duplicate contact into a primary contact. Dangerous — requires approval.',
      {
        primary_id: { type: 'string', description: 'Primary contact to keep' },
        duplicate_id: { type: 'string', description: 'Duplicate contact to merge in and delete' },
      },
      ['primary_id', 'duplicate_id'],
    ),
    makeDecl(
      'list_contacts_paginated',
      'List contacts with optional filters, sorted by creation date descending.',
      {
        page: { type: 'number', description: 'Page number (1-based, default 1)' },
        limit: { type: 'number', description: 'Items per page (default 20, max 100)' },
        company_id: { type: 'string', description: 'Filter by company ID (optional)' },
      },
      [],
    ),
  ],

  conversations: [
    makeDecl(
      'get_conversation',
      'Get full details of a specific conversation/case by its ID.',
      { id: { type: 'string', description: 'Conversation/case ID' } },
      ['id'],
    ),
    makeDecl(
      'create_conversation',
      'Create a new support conversation/case for a contact. Requires approval.',
      {
        contact_id: { type: 'string', description: 'Contact/customer ID' },
        subject: { type: 'string', description: 'Conversation subject' },
        message: { type: 'string', description: 'Initial message body' },
      },
      ['contact_id', 'subject', 'message'],
    ),
    makeDecl(
      'assign_conversation',
      'Assign a conversation/case to a specific agent.',
      {
        id: { type: 'string', description: 'Conversation/case ID' },
        agent_id: { type: 'string', description: 'Agent user ID to assign to' },
      },
      ['id', 'agent_id'],
    ),
    makeDecl(
      'update_conversation_status',
      'Update the status of a conversation. Requires approval for destructive status changes.',
      {
        id: { type: 'string', description: 'Conversation/case ID' },
        status: {
          type: 'string',
          description: 'New status',
          enum: ['open', 'resolved', 'pending', 'snoozed'],
        },
      },
      ['id', 'status'],
    ),
    makeDecl(
      'list_conversations',
      'List CRM conversations/cases with optional filters.',
      {
        status: {
          type: 'string',
          description: 'Filter by status: open, resolved, pending, snoozed',
        },
        assignee: { type: 'string', description: 'Filter by assignee user ID' },
        limit: { type: 'number', description: 'Max results (default 15, max 50)' },
      },
      [],
    ),
  ],

  reports: [
    makeDecl(
      'get_reporting_overview',
      'Get current reporting overview: open/resolved cases, response times, agent performance, CSAT scores.',
      {},
      [],
    ),
    makeDecl(
      'get_csat_summary',
      'Get CSAT survey summary: average score, response rate, recent feedback.',
      {},
      [],
    ),
    makeDecl(
      'get_calls_stats',
      'Get call statistics: total, answered, missed, average duration, breakdown by direction.',
      {
        from: { type: 'string', description: 'Start date ISO string (optional)' },
        to: { type: 'string', description: 'End date ISO string (optional)' },
      },
      [],
    ),
    makeDecl(
      'get_reporting_rollups',
      'Get aggregate rollup metrics grouped by day/week/month.',
      {
        period: {
          type: 'string',
          description: 'Grouping period: day, week, or month',
          enum: ['day', 'week', 'month'],
        },
        limit: { type: 'number', description: 'Number of periods to return (default 30)' },
      },
      [],
    ),
  ],

  sql: [
    makeDecl(
      'run_sql_query',
      'Execute a read-only SELECT SQL query against the CRM database. Only SELECT statements allowed.',
      {
        sql: { type: 'string', description: 'A safe SELECT SQL query' },
      },
      ['sql'],
    ),
  ],

  automation: [
    makeDecl(
      'list_automation_rules',
      'List automation rules configured in the CRM.',
      { limit: { type: 'number', description: 'Max results (default 20)' } },
      [],
    ),
    makeDecl(
      'get_sla_status',
      'Get current SLA policy statuses and breach counts.',
      {},
      [],
    ),
    makeDecl(
      'list_macros',
      'List available macros (canned response sequences).',
      { limit: { type: 'number', description: 'Max results (default 20)' } },
      [],
    ),
  ],

  ai: [
    makeDecl(
      'list_ai_feedback',
      'Get AI feedback entries — ratings and comments on AI-generated responses.',
      { limit: { type: 'number', description: 'Max entries (default 20)' } },
      [],
    ),
    makeDecl(
      'list_mcp_servers',
      'List registered MCP (Model Context Protocol) server integrations for this tenant.',
      {},
      [],
    ),
    makeDecl(
      'search_knowledge_base',
      'Search the knowledge base for relevant articles and embeddings.',
      {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      ['query'],
    ),
  ],
};

// ── Tool Executor ─────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  tenantId: string,
  workspaceId: string | null,
  sessionContext?: AgentContext,
  currentMode?: AgentMode,
): Promise<ToolArtifact> {
  const supabase = getSupabaseAdmin();

  // ── Core tools ──────────────────────────────────────────────────────────────

  if (name === 'switch_mode') {
    const newMode = String(args.new_mode ?? '') as AgentMode;
    const reason = String(args.reason ?? '');
    return {
      text: `Switched to ${newMode} mode. ${reason}`,
      data: { switched_to: newMode, reason },
    };
  }

  if (name === 'search_contacts') {
    const q = String(args.query ?? '').trim();
    const limit = Math.min(Number(args.limit ?? 10), 50);
    const { data, error } = await supabase
      .from('customers')
      .select('id, canonical_name, canonical_email, canonical_phone, segment, risk_level, created_at')
      .eq('tenant_id', tenantId)
      .or(`canonical_name.ilike.%${q}%,canonical_email.ilike.%${q}%`)
      .limit(limit);
    if (error) throw new Error(error.message);
    const contacts = data ?? [];
    return {
      text: contacts.length > 0
        ? `Found ${contacts.length} contact(s) matching "${q}".`
        : `No contacts found matching "${q}".`,
      data: { contacts, total: contacts.length },
    };
  }

  if (name === 'search_companies') {
    const q = String(args.query ?? '').trim();
    const limit = Math.min(Number(args.limit ?? 10), 50);
    const { data, error } = await supabase
      .from('companies')
      .select('id, name, domain, industry, created_at')
      .eq('tenant_id', tenantId)
      .or(`name.ilike.%${q}%,domain.ilike.%${q}%`)
      .limit(limit);
    if (error) throw new Error(error.message);
    const companies = data ?? [];
    return {
      text: companies.length > 0
        ? `Found ${companies.length} company(ies) matching "${q}".`
        : `No companies found matching "${q}".`,
      data: { companies, total: companies.length },
    };
  }

  if (name === 'remember_fact') {
    const fact = String(args.fact ?? '').trim();
    if (!fact) throw new Error('fact cannot be empty');
    const updated = await appendCoreMemory(tenantId, fact);
    return {
      text: `Remembered: "${fact}"`,
      data: { ok: true, memoryContent: updated },
    };
  }

  if (name === 'recall_memory') {
    const query = String(args.query ?? '').trim();
    const memory = await getCoreMemory(tenantId);
    if (!memory) {
      return { text: 'No core memory stored yet.', data: { memory: '' } };
    }
    // Simple substring search within memory
    const lines = memory.split('\n').filter(l =>
      !query || l.toLowerCase().includes(query.toLowerCase()),
    );
    return {
      text: lines.length > 0
        ? `Found ${lines.length} memory entry(ies) matching "${query}":\n${lines.join('\n')}`
        : `No memory entries match "${query}".`,
      data: { memory, matchingLines: lines },
    };
  }

  if (name === 'get_current_context') {
    return {
      text: sessionContext
        ? `Current context: ${JSON.stringify(sessionContext)}`
        : 'No UI context provided.',
      data: { context: sessionContext ?? null, mode: currentMode ?? 'contacts' },
    };
  }

  // ── Contacts-mode tools ─────────────────────────────────────────────────────

  if (name === 'get_contact') {
    const { data, error } = await supabase
      .from('customers')
      .select('id, canonical_name, canonical_email, canonical_phone, segment, risk_level, company_id, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .eq('id', String(args.id))
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`Contact ${args.id} not found`);
    const c = data as Record<string, unknown>;
    return {
      text: `Contact: ${c.canonical_name} (${c.canonical_email})`,
      data: { contact: data },
    };
  }

  if (name === 'create_contact') {
    const name = String(args.name ?? '').trim();
    const email = String(args.email ?? '').trim();
    const phone = args.phone ? String(args.phone).trim() : null;
    const companyId = args.company_id ? String(args.company_id).trim() : null;
    const { data, error } = await supabase
      .from('customers')
      .insert({
        tenant_id: tenantId,
        workspace_id: workspaceId,
        canonical_name: name,
        canonical_email: email,
        canonical_phone: phone,
        company_id: companyId,
        identity_system: 'manual',
        identity_external_id: email || `manual_${Date.now()}`,
      })
      .select('id, canonical_name, canonical_email')
      .single();
    if (error) throw new Error(error.message);
    return {
      text: `Created contact: ${name} (${email})`,
      data: { ok: true, contact: data },
    };
  }

  if (name === 'update_contact') {
    const id = String(args.id ?? '').trim();
    const fields = args.fields as Record<string, unknown>;
    if (!id) throw new Error('id is required');
    if (!fields || typeof fields !== 'object') throw new Error('fields must be an object');

    const allowed: Record<string, string> = {
      name: 'canonical_name',
      canonical_name: 'canonical_name',
      email: 'canonical_email',
      canonical_email: 'canonical_email',
      phone: 'canonical_phone',
      canonical_phone: 'canonical_phone',
      segment: 'segment',
      risk_level: 'risk_level',
    };
    const update: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      update[allowed[k] ?? k] = v;
    }
    const { data, error } = await supabase
      .from('customers')
      .update(update)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select('id, canonical_name, canonical_email')
      .single();
    if (error) throw new Error(error.message);
    return {
      text: `Updated contact ${id}.`,
      data: { ok: true, contact: data },
    };
  }

  if (name === 'merge_contacts') {
    const primaryId = String(args.primary_id ?? '').trim();
    const duplicateId = String(args.duplicate_id ?? '').trim();
    if (!primaryId || !duplicateId) throw new Error('primary_id and duplicate_id are required');

    // Re-point any cases/conversations to primary
    await supabase
      .from('cases')
      .update({ customer_id: primaryId })
      .eq('tenant_id', tenantId)
      .eq('customer_id', duplicateId);

    // Delete duplicate
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', duplicateId);
    if (error) throw new Error(error.message);

    return {
      text: `Merged contact ${duplicateId} into ${primaryId}. Duplicate deleted.`,
      data: { ok: true, primary_id: primaryId, merged_id: duplicateId },
    };
  }

  if (name === 'list_contacts_paginated') {
    const page = Math.max(1, Number(args.page ?? 1));
    const limit = Math.min(Number(args.limit ?? 20), 100);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('customers')
      .select('id, canonical_name, canonical_email, canonical_phone, segment, risk_level, created_at', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (args.company_id) query = query.eq('company_id', String(args.company_id));

    const { data, count, error } = await query;
    if (error) throw new Error(error.message);
    return {
      text: `Page ${page}: ${data?.length ?? 0} contacts (${count ?? 0} total).`,
      data: { contacts: data ?? [], total: count ?? 0, page, limit },
    };
  }

  // ── Conversations-mode tools ────────────────────────────────────────────────

  if (name === 'get_conversation') {
    const { data, error } = await supabase
      .from('cases')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', String(args.id))
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`Conversation ${args.id} not found`);
    const d = data as Record<string, unknown>;
    return {
      text: `Conversation ${d.case_number ?? args.id}: ${d.status}, subject: ${d.subject ?? 'N/A'}`,
      data: { conversation: data },
    };
  }

  if (name === 'create_conversation') {
    const { data, error } = await supabase
      .from('cases')
      .insert({
        tenant_id: tenantId,
        workspace_id: workspaceId,
        customer_id: String(args.contact_id),
        subject: String(args.subject),
        status: 'open',
        priority: 'medium',
        source_channel: 'agent',
        ai_diagnosis: null,
      })
      .select('id, case_number, status')
      .single();
    if (error) throw new Error(error.message);
    const d = data as Record<string, unknown>;
    return {
      text: `Created conversation #${d.case_number ?? d.id}.`,
      data: { ok: true, conversation: data },
    };
  }

  if (name === 'assign_conversation') {
    const id = String(args.id ?? '').trim();
    const agentId = String(args.agent_id ?? '').trim();
    if (!id || !agentId) throw new Error('id and agent_id are required');
    const { data, error } = await supabase
      .from('cases')
      .update({ assigned_to_user_id: agentId, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select('id, case_number, assigned_to_user_id')
      .single();
    if (error) throw new Error(error.message);
    return {
      text: `Assigned conversation ${id} to agent ${agentId}.`,
      data: { ok: true, conversation: data },
    };
  }

  if (name === 'update_conversation_status') {
    const id = String(args.id ?? '').trim();
    const status = String(args.status ?? '').trim();
    const { data, error } = await supabase
      .from('cases')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select('id, case_number, status')
      .single();
    if (error) throw new Error(error.message);
    return {
      text: `Updated conversation ${id} status to "${status}".`,
      data: { ok: true, conversation: data },
    };
  }

  if (name === 'list_conversations') {
    const limit = Math.min(Number(args.limit ?? 15), 50);
    let query = supabase
      .from('cases')
      .select('id, case_number, status, priority, source_channel, subject, created_at, updated_at, assigned_to_user_id')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (args.status) query = query.eq('status', String(args.status));
    if (args.assignee) query = query.eq('assigned_to_user_id', String(args.assignee));

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const conversations = data ?? [];
    return {
      text: `Found ${conversations.length} conversation(s).`,
      data: { conversations, total: conversations.length },
    };
  }

  // ── Reports-mode tools ──────────────────────────────────────────────────────

  if (name === 'get_reporting_overview') {
    const [casesRes, csatRes] = await Promise.allSettled([
      supabase
        .from('cases')
        .select('status, priority, source_channel, created_at', { count: 'exact', head: false })
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('csat_surveys')
        .select('score, created_at')
        .eq('tenant_id', tenantId)
        .not('score', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    const cases =
      casesRes.status === 'fulfilled' ? (casesRes.value.data ?? []) : [];
    const csatEntries =
      csatRes.status === 'fulfilled' ? (csatRes.value.data ?? []) : [];

    const byStatus = cases.reduce((acc: Record<string, number>, c: Record<string, unknown>) => {
      const s = String(c.status ?? 'unknown');
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {});

    const csatScores = csatEntries
      .map((s: Record<string, unknown>) => Number(s.score))
      .filter(n => !isNaN(n));
    const avgCsat =
      csatScores.length > 0
        ? (csatScores.reduce((a, b) => a + b, 0) / csatScores.length).toFixed(2)
        : null;

    const overview = {
      totalCases: cases.length,
      byStatus,
      csat: { average: avgCsat, responseCount: csatScores.length },
    };

    return {
      text: `Total cases: ${overview.totalCases}. Open: ${byStatus.open ?? 0}. CSAT avg: ${avgCsat ?? 'N/A'}.`,
      data: overview,
    };
  }

  if (name === 'get_csat_summary') {
    const { data, error } = await supabase
      .from('csat_surveys')
      .select('id, score, feedback, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const entries = data ?? [];
    const scored = entries.filter((e: Record<string, unknown>) => e.score !== null);
    const avg =
      scored.length > 0
        ? (
            scored.reduce((s: number, e: Record<string, unknown>) => s + Number(e.score), 0) /
            scored.length
          ).toFixed(2)
        : null;
    const summary = {
      totalResponses: entries.length,
      scoredResponses: scored.length,
      averageScore: avg,
      recentFeedback: entries
        .slice(0, 5)
        .map((e: Record<string, unknown>) => ({
          score: e.score,
          feedback: e.feedback,
          date: e.created_at,
        })),
    };
    return {
      text: `CSAT: ${avg ?? 'N/A'} average across ${scored.length} scored responses.`,
      data: summary,
    };
  }

  if (name === 'get_calls_stats') {
    let query = supabase
      .from('calls')
      .select('id, status, duration_seconds, direction, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (args.from) query = query.gte('created_at', String(args.from));
    if (args.to) query = query.lte('created_at', String(args.to));
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const calls = data ?? [];
    const answered = calls.filter(
      (c: Record<string, unknown>) => c.status === 'completed' || c.status === 'answered',
    );
    const missed = calls.filter(
      (c: Record<string, unknown>) => c.status === 'missed' || c.status === 'no-answer',
    );
    const durations = answered
      .map((c: Record<string, unknown>) => Number(c.duration_seconds))
      .filter(n => n > 0);
    const avgDuration =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;
    const stats = {
      total: calls.length,
      answered: answered.length,
      missed: missed.length,
      averageDurationSeconds: avgDuration,
      byDirection: {
        inbound: calls.filter((c: Record<string, unknown>) => c.direction === 'inbound').length,
        outbound: calls.filter((c: Record<string, unknown>) => c.direction === 'outbound').length,
      },
    };
    return {
      text: `Calls: ${stats.total} total, ${stats.answered} answered, ${stats.missed} missed. Avg duration: ${avgDuration}s.`,
      data: stats,
    };
  }

  if (name === 'get_reporting_rollups') {
    const period = String(args.period ?? 'day') as 'day' | 'week' | 'month';
    const limit = Math.min(Number(args.limit ?? 30), 90);

    // Truncate date grouping via Supabase raw SQL is not directly possible;
    // we load recent rows and group in-process.
    const { data, error } = await supabase
      .from('cases')
      .select('created_at, status')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit * 50); // over-fetch for grouping
    if (error) throw new Error(error.message);

    const truncKey = (dateStr: string): string => {
      const d = new Date(dateStr);
      if (period === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (period === 'week') {
        const startOfWeek = new Date(d);
        startOfWeek.setDate(d.getDate() - d.getDay());
        return startOfWeek.toISOString().split('T')[0];
      }
      return d.toISOString().split('T')[0];
    };

    const buckets: Record<string, { created: number; resolved: number }> = {};
    for (const row of data ?? []) {
      const key = truncKey(String(row.created_at ?? ''));
      if (!buckets[key]) buckets[key] = { created: 0, resolved: 0 };
      buckets[key].created++;
      if (row.status === 'resolved') buckets[key].resolved++;
    }

    const rollups = Object.entries(buckets)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, limit)
      .map(([period_key, counts]) => ({ period: period_key, ...counts }));

    return {
      text: `${period} rollups: ${rollups.length} periods returned.`,
      data: { period, rollups },
    };
  }

  // ── SQL-mode tools ──────────────────────────────────────────────────────────

  if (name === 'run_sql_query') {
    const sql = String(args.sql ?? '').trim();
    const upper = sql.toUpperCase().trimStart();
    const forbidden = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'TRUNCATE', 'ALTER', 'CREATE', 'GRANT'];
    if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
      throw new Error(
        'Only SELECT (or WITH ... SELECT) statements are permitted. Mutations are blocked.',
      );
    }
    for (const kw of forbidden) {
      if (upper.includes(kw)) {
        throw new Error(`Forbidden keyword "${kw}" detected. Only read-only queries are allowed.`);
      }
    }
    const { data, error } = await supabase
      .rpc('execute_sql_readonly', { query: sql, p_tenant_id: tenantId })
      .catch(() => ({
        data: null,
        error: { message: 'execute_sql_readonly RPC not available. Use the specific tool functions instead.' },
      }));
    if (error) throw new Error((error as { message: string }).message);
    const rows = Array.isArray(data) ? data : [];
    return {
      text: `Query returned ${rows.length} row(s).`,
      data: { rows, rowCount: rows.length, sql },
    };
  }

  // ── Automation-mode tools ───────────────────────────────────────────────────

  if (name === 'list_automation_rules') {
    const limit = Math.min(Number(args.limit ?? 20), 100);
    const { data, error } = await supabase
      .from('automation_rules')
      .select('id, name, is_active, trigger_event, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    const rules = data ?? [];
    return {
      text: `${rules.length} automation rule(s) found.`,
      data: { rules, total: rules.length },
    };
  }

  if (name === 'get_sla_status') {
    const { data: policies, error: pErr } = await supabase
      .from('sla_policies')
      .select('id, name, first_response_time_hours, resolution_time_hours')
      .eq('tenant_id', tenantId)
      .limit(20);
    if (pErr) throw new Error(pErr.message);

    // Count cases at risk (open cases older than the shortest resolution time)
    const { data: openCases, error: cErr } = await supabase
      .from('cases')
      .select('id, created_at, status')
      .eq('tenant_id', tenantId)
      .eq('status', 'open')
      .order('created_at', { ascending: true })
      .limit(200);
    if (cErr) throw new Error(cErr.message);

    const now = Date.now();
    const atRisk = (openCases ?? []).filter((c: Record<string, unknown>) => {
      const ageHours = (now - new Date(String(c.created_at)).getTime()) / 3_600_000;
      return ageHours > 24; // simplistic threshold
    });

    return {
      text: `${(policies ?? []).length} SLA policy(ies). ${atRisk.length} open case(s) older than 24h.`,
      data: { policies: policies ?? [], atRiskCount: atRisk.length },
    };
  }

  if (name === 'list_macros') {
    const limit = Math.min(Number(args.limit ?? 20), 100);
    const { data, error } = await supabase
      .from('canned_responses')
      .select('id, name, content, shortcut, created_at')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    const macros = data ?? [];
    return {
      text: `${macros.length} macro(s) available.`,
      data: { macros, total: macros.length },
    };
  }

  // ── AI-mode tools ───────────────────────────────────────────────────────────

  if (name === 'list_ai_feedback') {
    const limit = Math.min(Number(args.limit ?? 20), 100);
    const { data, error } = await supabase
      .from('ai_feedback')
      .select('id, rating, comment, model, case_id, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    const feedback = data ?? [];
    const avgRating =
      feedback.length > 0
        ? (
            feedback
              .filter((f: Record<string, unknown>) => f.rating !== null)
              .reduce((s: number, f: Record<string, unknown>) => s + Number(f.rating), 0) /
            feedback.filter((f: Record<string, unknown>) => f.rating !== null).length
          ).toFixed(2)
        : null;
    return {
      text: `${feedback.length} AI feedback entry(ies). Average rating: ${avgRating ?? 'N/A'}.`,
      data: { feedback, total: feedback.length, averageRating: avgRating },
    };
  }

  if (name === 'list_mcp_servers') {
    const { data, error } = await supabase
      .from('mcp_servers')
      .select('id, name, url, auth_type, is_active, created_at')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });
    if (error) throw new Error(error.message);
    const servers = data ?? [];
    return {
      text: `${servers.length} MCP server(s) registered. ${servers.filter((s: Record<string, unknown>) => s.is_active).length} active.`,
      data: { servers, total: servers.length },
    };
  }

  if (name === 'search_knowledge_base') {
    const query = String(args.query ?? '').trim();
    const limit = Math.min(Number(args.limit ?? 10), 50);
    const { data, error } = await supabase
      .from('knowledge_embeddings')
      .select('id, title, content, source_type, created_at')
      .eq('tenant_id', tenantId)
      .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
      .limit(limit);
    if (error) throw new Error(error.message);
    const articles = data ?? [];
    return {
      text: articles.length > 0
        ? `Found ${articles.length} knowledge base article(s) matching "${query}".`
        : `No knowledge base articles found matching "${query}".`,
      data: { articles, total: articles.length },
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

// ── Slash Command Handler ─────────────────────────────────────────────────────

async function handleSlashCommand(
  message: string,
  tenantId: string,
  conversationId: string | null,
  currentMode: AgentMode,
  res: Response,
): Promise<{ handled: boolean; newMode?: AgentMode }> {
  const trimmed = message.trim();

  // /remember [text]
  if (trimmed.startsWith('/remember ')) {
    const fact = trimmed.slice('/remember '.length).trim();
    if (!fact) {
      sse(res, 'text_chunk', { text: 'Usage: /remember [fact to remember]' });
      sse(res, 'done', { conversationId, text: 'Usage: /remember [fact to remember]', toolCallCount: 0 });
      return { handled: true };
    }
    try {
      const updated = await appendCoreMemory(tenantId, fact);
      sse(res, 'memory_updated', { fact, memoryContent: updated });
      sse(res, 'text_chunk', { text: `Remembered: "${fact}"` });
      sse(res, 'done', { conversationId, text: `Remembered: "${fact}"`, toolCallCount: 0 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sse(res, 'error', { message: `Failed to save memory: ${msg}` });
    }
    return { handled: true };
  }

  // /clear
  if (trimmed === '/clear') {
    if (conversationId) {
      const supabase = getSupabaseAdmin();
      await supabase.from('agent_messages').delete().eq('conversation_id', conversationId).catch(() => {});
    }
    sse(res, 'text_chunk', { text: 'Conversation history cleared.' });
    sse(res, 'done', { conversationId, text: 'Conversation history cleared.', toolCallCount: 0 });
    return { handled: true };
  }

  // /mode [mode]
  if (trimmed.startsWith('/mode ')) {
    const requestedMode = trimmed.slice('/mode '.length).trim().toLowerCase() as AgentMode;
    const valid: AgentMode[] = ['contacts', 'conversations', 'reports', 'sql', 'automation', 'ai'];
    if (!valid.includes(requestedMode)) {
      const text = `Unknown mode "${requestedMode}". Valid modes: ${valid.join(', ')}`;
      sse(res, 'text_chunk', { text });
      sse(res, 'done', { conversationId, text, toolCallCount: 0 });
      return { handled: true };
    }
    const text = `Switched to ${requestedMode} mode.`;
    sse(res, 'text_chunk', { text });
    sse(res, 'done', { conversationId, text, toolCallCount: 0, mode: requestedMode });
    return { handled: true, newMode: requestedMode };
  }

  // /help
  if (trimmed === '/help') {
    const helpText = [
      '**Max Agent — Slash Commands**',
      '',
      '`/remember [text]` — persist a fact to core memory (available in all future sessions)',
      '`/clear` — clear this conversation\'s message history',
      '`/mode [mode]` — switch to a specialised mode',
      '  Modes: contacts | conversations | reports | sql | automation | ai',
      '`/help` — show this help',
      '',
      '**Current mode:** ' + currentMode,
    ].join('\n');
    sse(res, 'text_chunk', { text: helpText });
    sse(res, 'done', { conversationId, text: helpText, toolCallCount: 0 });
    return { handled: true };
  }

  return { handled: false };
}

// ── Title Generation ──────────────────────────────────────────────────────────

async function generateTitle(
  conversationId: string,
  firstMessage: string,
  res: Response,
): Promise<void> {
  if (!config.ai.geminiApiKey) return;
  try {
    const gemini = new GoogleGenerativeAI(config.ai.geminiApiKey);
    const model = gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(
      `Generate a ≤8 word title in sentence case for a conversation starting with: "${firstMessage.slice(0, 200)}". Return ONLY the title, no punctuation at the end.`,
    );
    const title = result.response.text().trim().replace(/[.!?]+$/, '').slice(0, 80);
    if (!title) return;

    const supabase = getSupabaseAdmin();
    await supabase
      .from('agent_conversations')
      .update({ title })
      .eq('id', conversationId);

    sse(res, 'title_generated', { conversationId, title });
  } catch {
    // Title generation is best-effort — never fail the main loop for this
  }
}

// ── Conversation Persistence ───────────────────────────────────────────────────

export async function listConversations(
  tenantId: string,
  workspaceId: string | null,
  userId: string | null,
): Promise<ConversationRow[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('agent_conversations')
    .select('id, tenant_id, workspace_id, user_id, title, message_count, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ConversationRow[];
}

export async function getConversation(
  id: string,
  tenantId: string,
): Promise<{ conversation: ConversationRow; messages: AgentMessage[] } | null> {
  const supabase = getSupabaseAdmin();
  const [convRes, msgsRes] = await Promise.all([
    supabase
      .from('agent_conversations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .single(),
    supabase
      .from('agent_messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true }),
  ]);

  if (convRes.error || !convRes.data) return null;

  const messages = (msgsRes.data ?? []).map((m: Record<string, unknown>) => ({
    id: String(m.id),
    role: m.role as 'user' | 'assistant',
    content: String(m.content ?? ''),
    toolCalls: m.tool_calls ? JSON.parse(String(m.tool_calls)) : undefined,
    createdAt: String(m.created_at),
  }));

  return { conversation: convRes.data as ConversationRow, messages };
}

export async function deleteConversation(id: string, tenantId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from('agent_messages').delete().eq('conversation_id', id);
  await supabase
    .from('agent_conversations')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);
}

async function createConversationRecord(
  tenantId: string,
  workspaceId: string | null,
  userId: string | null,
  firstMessage: string,
  mode: AgentMode,
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const title = firstMessage.slice(0, 80) + (firstMessage.length > 80 ? '…' : '');
  const { data, error } = await supabase
    .from('agent_conversations')
    .insert({
      tenant_id: tenantId,
      workspace_id: workspaceId,
      user_id: userId,
      title,
      message_count: 0,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

async function appendMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  toolCalls?: ToolCallRecord[],
): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from('agent_messages').insert({
    conversation_id: conversationId,
    role,
    content,
    tool_calls: toolCalls ? JSON.stringify(toolCalls) : null,
  });
  await supabase
    .from('agent_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);
  await supabase
    .rpc('increment_agent_message_count', { conv_id: conversationId })
    .catch(() => {});
}

// ── Main Agent Loop ───────────────────────────────────────────────────────────

export type AgentChatOptions = AgentSession;

export async function runAgentChat(opts: AgentChatOptions): Promise<void> {
  const { tenantId, workspaceId, userId, message, context, res } = opts;

  // ── SSE headers ─────────────────────────────────────────────────────────────
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // ── Keepalive every 15s ─────────────────────────────────────────────────────
  const keepalive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepalive);
    }
  }, 15_000);

  let conversationId: string | null = opts.conversationId ?? null;
  let currentMode: AgentMode = 'contacts';

  const finish = () => {
    clearInterval(keepalive);
    try {
      res.end();
    } catch {
      // already closed
    }
  };

  try {
    if (!config.ai.geminiApiKey) {
      sse(res, 'error', { message: 'AI provider not configured. Set GEMINI_API_KEY.' });
      return finish();
    }

    // ── Resume approval flow ────────────────────────────────────────────────
    if (opts.resumeApproval) {
      const { action, proposalId, feedback } = opts.resumeApproval;
      const pending = pendingApprovals.get(proposalId);
      if (!pending) {
        sse(res, 'error', { message: `No pending approval found for proposalId ${proposalId}.` });
        return finish();
      }
      pendingApprovals.delete(proposalId);

      if (action === 'reject') {
        const rejectionText = feedback
          ? `The action was rejected: ${feedback}`
          : 'The action was rejected by the user.';
        // Feed rejection back into Gemini loop
        await resumeGeminiLoop(
          pending,
          rejectionText,
          tenantId,
          workspaceId,
          context,
          currentMode,
          res,
          keepalive,
        );
      } else {
        // Execute the previously-paused dangerous tool
        let artifact: ToolArtifact;
        try {
          artifact = await executeTool(
            pending.toolName,
            pending.args,
            tenantId,
            workspaceId,
            context,
            pending.contents.length > 0 ? currentMode : currentMode,
          );
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          artifact = { text: `Tool error: ${errMsg}`, data: { error: errMsg } };
        }

        const durationMs = 0;
        const record: ToolCallRecord = {
          toolName: pending.toolName,
          args: pending.args,
          result: artifact.data,
          durationMs,
        };
        sse(res, 'tool_result', {
          toolName: pending.toolName,
          result: artifact.data,
          text: artifact.text,
          durationMs,
          approved: true,
        });

        // Add tool response to contents and continue loop
        const updatedContents = [
          ...pending.contents,
          {
            role: 'function' as const,
            parts: [
              {
                functionResponse: {
                  name: pending.toolName,
                  response: { result: artifact.data, text: artifact.text },
                },
              },
            ] as Part[],
          },
        ];

        await resumeGeminiLoop(
          {
            ...pending,
            contents: updatedContents,
            toolCallsThisTurn: [...pending.toolCallsThisTurn, record],
          },
          null,
          tenantId,
          workspaceId,
          context,
          currentMode,
          res,
          keepalive,
        );
      }
      return finish();
    }

    // ── Load or create conversation ─────────────────────────────────────────
    let priorMessages: AgentMessage[] = [];
    const isNewConversation = !conversationId;

    if (!conversationId) {
      conversationId = await createConversationRecord(
        tenantId,
        workspaceId,
        userId,
        message,
        currentMode,
      );
      sse(res, 'conversation_created', { conversationId });
    } else {
      const existing = await getConversation(conversationId, tenantId);
      if (existing) {
        priorMessages = existing.messages;
      }
    }

    // ── Slash command handling ───────────────────────────────────────────────
    const { handled, newMode } = await handleSlashCommand(
      message,
      tenantId,
      conversationId,
      currentMode,
      res,
    );
    if (handled) {
      if (newMode) currentMode = newMode;
      return finish();
    }
    if (newMode) currentMode = newMode;

    // ── Load core memory ────────────────────────────────────────────────────
    const coreMemory = await getCoreMemory(tenantId);

    // ── Build Gemini contents from prior history ────────────────────────────
    const priorHistory: Content[] = priorMessages.flatMap((m): Content[] => {
      if (m.role === 'user') {
        return [{ role: 'user', parts: [{ text: m.content }] }];
      }
      return [{ role: 'model', parts: [{ text: m.content }] }];
    });

    // ── Save user message ────────────────────────────────────────────────────
    await appendMessage(conversationId, 'user', message);

    // ── Title generation (async, non-blocking) ───────────────────────────────
    if (isNewConversation) {
      generateTitle(conversationId, message, res).catch(() => {});
    }

    // ── Build tool declarations for current mode ─────────────────────────────
    const modeDecls = MODE_TOOL_DECLARATIONS[currentMode] ?? [];
    const allDecls = [...CORE_TOOL_DECLARATIONS, ...modeDecls];

    // ── Build Gemini client ──────────────────────────────────────────────────
    const gemini = new GoogleGenerativeAI(config.ai.geminiApiKey);
    const model = gemini.getGenerativeModel({
      model: config.ai.geminiModel,
      systemInstruction: buildSystemPrompt(currentMode, coreMemory, context),
      tools: [{ functionDeclarations: allDecls }],
    });

    // ── Build initial contents array ─────────────────────────────────────────
    const contents: Content[] = [
      ...priorHistory,
      { role: 'user', parts: [{ text: message }] },
    ];

    // ── Gemini agentic loop (up to 24 tool calls) ────────────────────────────
    const MAX_TOOL_CALLS = 24;
    const toolCallsThisTurn: ToolCallRecord[] = [];
    let fullAssistantText = '';
    let totalToolCalls = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (totalToolCalls >= MAX_TOOL_CALLS) {
        sse(res, 'text_chunk', {
          text: '\n\n_Reached maximum tool call limit (24). Stopping._',
        });
        fullAssistantText += '\n\n_Reached maximum tool call limit (24). Stopping._';
        break;
      }

      const generateResult = await model.generateContent({ contents });
      const response = generateResult.response;
      const candidates = response.candidates ?? [];
      const candidate = candidates[0];

      if (!candidate) {
        sse(res, 'error', { message: 'No response candidates from AI model.' });
        break;
      }

      const parts = candidate.content?.parts ?? [];
      const textParts = parts.filter((p): p is { text: string } => 'text' in p && !!p.text);
      const fnCallParts = parts.filter(
        (p): p is { functionCall: { name: string; args: Record<string, unknown> } } =>
          'functionCall' in p,
      );

      // Accumulate model turn into contents
      if (candidate.content) {
        contents.push({ role: 'model', parts: candidate.content.parts });
      }

      // Stream text chunks
      for (const part of textParts) {
        const chunk = part.text ?? '';
        if (chunk) {
          fullAssistantText += chunk;
          sse(res, 'text_chunk', { text: chunk });
        }
      }

      // If no function calls, the model is done
      if (fnCallParts.length === 0) {
        break;
      }

      // Execute tool calls
      const functionResponses: Part[] = [];

      for (const part of fnCallParts) {
        const toolName = part.functionCall.name;
        const toolArgs = (part.functionCall.args ?? {}) as Record<string, unknown>;

        totalToolCalls++;

        sse(res, 'tool_start', { toolName, args: toolArgs });

        // Handle switch_mode without executeTool (it's a meta-operation)
        if (toolName === 'switch_mode') {
          const newMode = String(toolArgs.new_mode ?? '') as AgentMode;
          const valid: AgentMode[] = ['contacts', 'conversations', 'reports', 'sql', 'automation', 'ai'];
          if (valid.includes(newMode)) {
            currentMode = newMode;
          }
        }

        // Dangerous tool — pause execution and request approval
        if (DANGEROUS_TOOLS.has(toolName)) {
          const proposalId = `${conversationId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          pendingApprovals.set(proposalId, {
            proposalId,
            toolName,
            args: toolArgs,
            tenantId,
            workspaceId,
            conversationId: conversationId!,
            contents: [...contents],
            toolCallsThisTurn: [...toolCallsThisTurn],
            fullAssistantText,
          });

          sse(res, 'approval_request', {
            proposalId,
            toolName,
            preview: `Execute "${toolName}" with: ${JSON.stringify(toolArgs)}`,
            payload: toolArgs,
          });
          sse(res, 'done', {
            conversationId,
            text: fullAssistantText || 'Waiting for approval before proceeding.',
            toolCallCount: toolCallsThisTurn.length,
            awaitingApproval: true,
            proposalId,
          });
          return finish();
        }

        // Execute tool
        const start = Date.now();
        let artifact: ToolArtifact;
        let toolError: string | null = null;

        try {
          artifact = await executeTool(
            toolName,
            toolArgs,
            tenantId,
            workspaceId,
            context,
            currentMode,
          );
        } catch (err) {
          toolError = err instanceof Error ? err.message : String(err);
          artifact = {
            text: `Tool error (${toolName}): ${toolError}`,
            data: { error: toolError },
          };
        }

        const durationMs = Date.now() - start;

        toolCallsThisTurn.push({
          toolName,
          args: toolArgs,
          result: artifact.data,
          durationMs,
        });

        // Emit memory_updated for remember_fact
        if (toolName === 'remember_fact' && !toolError) {
          const memoryContent = (artifact.data as Record<string, unknown>)?.memoryContent;
          sse(res, 'memory_updated', {
            fact: toolArgs.fact,
            memoryContent,
          });
        }

        sse(res, 'tool_result', {
          toolName,
          result: artifact.data,
          text: artifact.text,
          error: toolError,
          durationMs,
        });

        functionResponses.push({
          functionResponse: {
            name: toolName,
            response: { result: artifact.data, text: artifact.text },
          },
        } as Part);
      }

      // Feed function responses back into contents
      if (functionResponses.length > 0) {
        contents.push({ role: 'function' as const, parts: functionResponses });
      }
    }

    // ── Persist assistant response ──────────────────────────────────────────
    const finalText = fullAssistantText.trim() || 'I have completed the requested actions.';
    await appendMessage(
      conversationId!,
      'assistant',
      finalText,
      toolCallsThisTurn.length > 0 ? toolCallsThisTurn : undefined,
    );

    sse(res, 'done', {
      conversationId,
      text: finalText,
      toolCallCount: toolCallsThisTurn.length,
      mode: currentMode,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[agent] runAgentChat error:', errMsg, err);
    sse(res, 'error', { message: errMsg });
  } finally {
    finish();
  }
}

// ── Resume Gemini Loop (after approval) ───────────────────────────────────────

async function resumeGeminiLoop(
  pending: PendingApproval,
  injectedText: string | null,
  tenantId: string,
  workspaceId: string | null,
  context: AgentContext | undefined,
  initialMode: AgentMode,
  res: Response,
  keepalive: ReturnType<typeof setInterval>,
): Promise<void> {
  const { conversationId, contents: baseContents, toolCallsThisTurn, fullAssistantText: baseText } = pending;

  let contents = [...baseContents];
  if (injectedText) {
    // Inject rejection as a user message to inform the model
    contents.push({ role: 'user', parts: [{ text: injectedText }] });
  }

  let currentMode = initialMode;
  const toolCallsTotal = [...toolCallsThisTurn];
  let fullAssistantText = baseText;
  let totalToolCalls = toolCallsTotal.length;

  try {
    if (!config.ai.geminiApiKey) return;

    const modeDecls = MODE_TOOL_DECLARATIONS[currentMode] ?? [];
    const allDecls = [...CORE_TOOL_DECLARATIONS, ...modeDecls];
    const coreMemory = await getCoreMemory(tenantId);

    const gemini = new GoogleGenerativeAI(config.ai.geminiApiKey);
    const model = gemini.getGenerativeModel({
      model: config.ai.geminiModel,
      systemInstruction: buildSystemPrompt(currentMode, coreMemory, context),
      tools: [{ functionDeclarations: allDecls }],
    });

    while (totalToolCalls < 24) {
      const generateResult = await model.generateContent({ contents });
      const response = generateResult.response;
      const candidate = response.candidates?.[0];
      if (!candidate) break;

      const parts = candidate.content?.parts ?? [];
      const textParts = parts.filter((p): p is { text: string } => 'text' in p && !!p.text);
      const fnCallParts = parts.filter(
        (p): p is { functionCall: { name: string; args: Record<string, unknown> } } =>
          'functionCall' in p,
      );

      if (candidate.content) {
        contents.push({ role: 'model', parts: candidate.content.parts });
      }

      for (const part of textParts) {
        const chunk = part.text ?? '';
        if (chunk) {
          fullAssistantText += chunk;
          sse(res, 'text_chunk', { text: chunk });
        }
      }

      if (fnCallParts.length === 0) break;

      const functionResponses: Part[] = [];
      for (const part of fnCallParts) {
        const toolName = part.functionCall.name;
        const toolArgs = (part.functionCall.args ?? {}) as Record<string, unknown>;
        totalToolCalls++;

        sse(res, 'tool_start', { toolName, args: toolArgs });

        if (toolName === 'switch_mode') {
          const nm = String(toolArgs.new_mode ?? '') as AgentMode;
          const valid: AgentMode[] = ['contacts', 'conversations', 'reports', 'sql', 'automation', 'ai'];
          if (valid.includes(nm)) currentMode = nm;
        }

        // Dangerous tools in resumed loop also need approval
        if (DANGEROUS_TOOLS.has(toolName)) {
          const proposalId = `${conversationId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          pendingApprovals.set(proposalId, {
            proposalId,
            toolName,
            args: toolArgs,
            tenantId,
            workspaceId,
            conversationId,
            contents: [...contents],
            toolCallsThisTurn: [...toolCallsTotal],
            fullAssistantText,
          });
          sse(res, 'approval_request', {
            proposalId,
            toolName,
            preview: `Execute "${toolName}" with: ${JSON.stringify(toolArgs)}`,
            payload: toolArgs,
          });
          sse(res, 'done', {
            conversationId,
            text: fullAssistantText || 'Waiting for approval.',
            toolCallCount: toolCallsTotal.length,
            awaitingApproval: true,
            proposalId,
          });
          return;
        }

        const start = Date.now();
        let artifact: ToolArtifact;
        let toolError: string | null = null;
        try {
          artifact = await executeTool(toolName, toolArgs, tenantId, workspaceId, context, currentMode);
        } catch (err) {
          toolError = err instanceof Error ? err.message : String(err);
          artifact = { text: `Tool error: ${toolError}`, data: { error: toolError } };
        }
        const durationMs = Date.now() - start;

        toolCallsTotal.push({ toolName, args: toolArgs, result: artifact.data, durationMs });
        if (toolName === 'remember_fact' && !toolError) {
          sse(res, 'memory_updated', { fact: toolArgs.fact, memoryContent: (artifact.data as Record<string, unknown>)?.memoryContent });
        }
        sse(res, 'tool_result', { toolName, result: artifact.data, text: artifact.text, error: toolError, durationMs });
        functionResponses.push({ functionResponse: { name: toolName, response: { result: artifact.data, text: artifact.text } } } as Part);
      }

      if (functionResponses.length > 0) {
        contents.push({ role: 'function' as const, parts: functionResponses });
      }
    }

    const finalText = fullAssistantText.trim() || 'I have completed the requested actions.';
    await appendMessage(
      conversationId,
      'assistant',
      finalText,
      toolCallsTotal.length > 0 ? toolCallsTotal : undefined,
    );
    sse(res, 'done', { conversationId, text: finalText, toolCallCount: toolCallsTotal.length, mode: currentMode });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[agent] resumeGeminiLoop error:', msg);
    sse(res, 'error', { message: msg });
  }
}

// ── Legacy no-op ──────────────────────────────────────────────────────────────
export async function ensureAgentTables(): Promise<void> {
  // Tables are created via SQL migrations — no-op.
}
