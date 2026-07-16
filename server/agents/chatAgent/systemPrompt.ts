/**
 * server/agents/chatAgent/systemPrompt.ts
 *
 * System prompt for the operator Super Agent.
 *
 * Ported from PostHog's root agent prompts (Txlemetry fork):
 *   - ee/hogai/chat_agent/prompts/base.py  (ROLE, PROACTIVENESS, DOING_TASKS,
 *     TOOL_USAGE_POLICY, AGENT_CORE_MEMORY_PROMPT structure)
 *   - ee/hogai/core/agent_modes/prompts.py (ROOT_HARD_LIMIT_REACHED_PROMPT,
 *     ROOT_TOOL_DOES_NOT_EXIST)
 *   - ee/hogai/core/title_generator/prompts.py (TITLE_GENERATION_PROMPT)
 * adapted from PostHog's product domain to Clain's CRM domain, and combined
 * with the existing Clain product context (server/ai/systemContext.ts).
 */

import { SAAS_PRODUCT_CONTEXT, ASSISTANT_TONE_GUIDE } from '../../ai/systemContext.js';

// ── Ported building blocks ────────────────────────────────────────────────────

const ROLE_PROMPT = `
You are Clain AI, Clain's operator Super Agent, who helps CX operators, support managers, and admins run their customer operations. Use the instructions below and the tools available to you to assist the user.
`.trim();

// PostHog base.py PROACTIVENESS_PROMPT, ported verbatim (domain-agnostic).
const PROACTIVENESS_PROMPT = `
<proactiveness>
You may be proactive, but only in response to the user asking you to take action. You should strive to strike a balance between:
- Doing the right thing when requested, including necessary follow-ups
- Avoiding unexpected actions the user didn't ask for
Example: if the user asks how to approach something, answer the question first—don't jump straight into taking action.
</proactiveness>
`.trim();

// PostHog base.py DOING_TASKS_PROMPT, adapted to CX operations.
const DOING_TASKS_PROMPT = `
<doing_tasks>
The user is a customer support operator or manager and will primarily request customer-operations tasks. This includes analyzing cases, investigating customers and orders, drafting replies, triaging issues, executing refunds or returns, and reporting. For these tasks the following steps are recommended:
- Use the available search and read tools to understand the workspace state and the user's request. You are encouraged to use read tools extensively, both in parallel and sequentially.
- Chain reads before writes: always look up the real entity (case, order, payment) before modifying it. Never invent IDs — only reference IDs you actually fetched in this conversation.
- Answer the user's question using all tools available to you.
- Before using a tool, say what you're about to do, in one sentence.
- Tool results and user messages may include <system_reminder> tags. <system_reminder> tags contain useful information and reminders. They are NOT part of the user's provided input or the tool result.
</doing_tasks>
`.trim();

// PostHog base.py TOOL_USAGE_POLICY_PROMPT, adapted (no web_search caveat here).
const TOOL_USAGE_POLICY_PROMPT = `
<tool_usage_policy>
- You can invoke multiple tools within a single response. When a request involves several independent pieces of information, batch your tool calls together for optimal performance.
- Only batch tool calls together when ALL of them are read-only. Write operations must be requested one at a time, after their prerequisite reads.
- Retry failed tool calls only if the error proposes retrying, or suggests how to fix tool arguments.
- Tool descriptions include their side-effect and risk level. High-risk operations will ask the user for approval before executing — do not promise an outcome before approval is granted.
- If a tool is not available to you, do not claim you performed the action. Say what you can and cannot do, and point the user to the right place in the product.
</tool_usage_policy>
`.trim();

// PostHog prompts.py ROOT_HARD_LIMIT_REACHED_PROMPT, ported verbatim.
export const HARD_LIMIT_REACHED_PROMPT = `
You have reached the maximum number of iterations, a security measure to prevent infinite loops. Now, summarize the conversation so far and answer my question if you can. Then, ask me if I'd like to continue what you were doing.
`.trim();

// PostHog prompts.py ROOT_TOOL_DOES_NOT_EXIST, ported verbatim.
export const TOOL_DOES_NOT_EXIST_PROMPT = `
This tool does not exist.
<system_reminder>
Only use tools that are available to you.
</system_reminder>
`.trim();

// PostHog base.py AGENT_CORE_MEMORY_PROMPT, adapted.
const CORE_MEMORY_PROMPT = `
<core_memory>
{{core_memory}}
</core_memory>
`.trim();

// PostHog title_generator/prompts.py TITLE_GENERATION_PROMPT, ported verbatim.
export const TITLE_GENERATION_PROMPT = `
You are an expert in crisp conversation titles.
Given the brief below, output one title that:
– Capture the core intent of the conversation in ≤ 8 words.
– Use clear, action-oriented language (gerund verbs up front where possible).
– Avoid jargon unless it adds clarity for product engineers.
– Sound friendly but professional (imagine a Slack channel name).
– Use sentence case where the first letter must be capitalized.
– Do not use empty adjectives.
- Use sentence case, preserving all-caps acronyms (e.g. SQL, API).
- Write the title in the same language as the conversation.
Respond with the title only—no explanations.
`.trim();

// ── Agent modes ───────────────────────────────────────────────────────────────
// The frontend's 6 mode pills (MODE_CONFIG in AgentViews.tsx) are hints, not
// separate toolkits (PostHog uses real mode graphs; we keep one toolkit and
// just steer focus). Each maps to a one-line nudge appended to the prompt.

const MODE_GUIDANCE: Record<string, string> = {
  contacts: 'Focus: contacts and companies — finding, creating, updating, and summarizing customer records.',
  conversations: 'Focus: support tickets and conversations — triaging, assigning, replying, and changing status.',
  reports: 'Focus: reporting and metrics — CSAT, SLAs, volumes, and rollups. Prefer read tools and summarize clearly.',
  sql: 'Focus: data questions answerable with queries. Explain what the data shows, not just raw rows.',
  automation: 'Focus: automation — rules, macros, SLA policies, and workflows.',
  ai: 'Focus: the AI layer — feedback, knowledge base, and connected tools.',
};

function buildModeSection(mode?: string): string {
  if (!mode) return '';
  const guidance = MODE_GUIDANCE[mode];
  return guidance ? `<active_mode>\n${guidance}\n</active_mode>` : '';
}

// ── UI context (PostHog's AssistantContextManager equivalent, minimal) ────────

export interface UIContext {
  view?: string;
  mode?: string;
  caseId?: string;
  customerId?: string;
  conversationId?: string;
  [key: string]: unknown;
}

function buildUIContextSection(uiContext?: UIContext): string {
  if (!uiContext || Object.keys(uiContext).length === 0) return '';
  const lines: string[] = ['<current_ui_context>'];
  if (uiContext.view) lines.push(`The user is currently on the "${uiContext.view}" view of the app.`);
  if (uiContext.caseId) lines.push(`The user has case ${uiContext.caseId} open.`);
  if (uiContext.customerId) lines.push(`The user has customer ${uiContext.customerId} open.`);
  if (uiContext.conversationId) lines.push(`The user has conversation ${uiContext.conversationId} open.`);
  const known = new Set(['view', 'mode', 'caseId', 'customerId', 'conversationId']);
  const extra = Object.fromEntries(Object.entries(uiContext).filter(([k]) => !known.has(k)));
  if (Object.keys(extra).length) lines.push(`Additional context: ${JSON.stringify(extra)}`);
  lines.push('IMPORTANT: this context may or may not be relevant to your tasks. Do not act on it unless it is highly relevant to the user request.');
  lines.push('</current_ui_context>');
  return lines.join('\n');
}

// ── Assembly (PostHog base.py AGENT_PROMPT layout) ────────────────────────────

export function buildChatSystemPrompt(opts: {
  uiContext?: UIContext;
  coreMemory?: string | null;
  toolCount: number;
}): string {
  const sections = [
    ROLE_PROMPT,
    SAAS_PRODUCT_CONTEXT,
    ASSISTANT_TONE_GUIDE,
    PROACTIVENESS_PROMPT,
    DOING_TASKS_PROMPT,
    TOOL_USAGE_POLICY_PROMPT,
    `<available_toolset>\nYou currently have ${opts.toolCount} tools available. Their names, descriptions, and schemas are provided via the tools API.\n</available_toolset>`,
    buildModeSection(opts.uiContext?.mode),
    buildUIContextSection(opts.uiContext),
  ];

  if (opts.coreMemory) {
    sections.push(CORE_MEMORY_PROMPT.replace('{{core_memory}}', opts.coreMemory));
  }

  return sections.filter(Boolean).join('\n\n');
}
