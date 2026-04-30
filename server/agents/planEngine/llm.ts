/**
 * server/agents/planEngine/llm.ts
 *
 * LLMProvider abstraction. The PlanEngine calls this interface — it never
 * imports Gemini (or any other SDK) directly. This keeps the engine testable
 * and allows swapping models per tenant/experiment without touching core logic.
 *
 * Gemini is the default implementation (backed by @google/generative-ai +
 * server/ai/geminiRetry.ts).  To swap in OpenAI / Anthropic, implement the
 * LLMProvider interface and call setPlanEngineLLMProvider() at startup.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { withGeminiRetry } from '../../ai/geminiRetry.js';
import { config } from '../../config.js';
import { logger } from '../../utils/logger.js';
import { redactSensitiveText, redactStructuredValue } from './safety.js';
import type { Plan, PlanStep, SessionState } from './types.js';
import type { CatalogEntry } from './registry.js';

// ── Contract ─────────────────────────────────────────────────────────────────

/**
 * Runtime configuration injected from the agent's active agent_versions row.
 * AI Studio edits these profiles; the Plan Engine reads them here at call time.
 */
export interface AgentRuntimeConfig {
  /** Override model name (e.g. "gemini-2.5-pro"). Falls back to config.ai.geminiModel. */
  model?: string;
  /** Override generation temperature. Falls back to 0.2. */
  temperature?: number;
  /** Max output tokens. Falls back to 2048. */
  maxOutputTokens?: number;
  /**
   * Additional safety/persona instructions appended to the system prompt.
   * Sourced from safety_profile.additionalInstructions.
   */
  safetyInstructions?: string;
  /**
   * Persona override — overrides the default Super Agent persona description.
   * Sourced from reasoning_profile.persona.
   */
  personaOverride?: string;
  /**
   * Short knowledge snippets injected into context.
   * Sourced from knowledge articles relevant to this workspace/domains.
   */
  knowledgeSnippets?: Array<{ title: string; excerpt: string }>;
  /**
   * List of tool names this agent is explicitly allowed to use.
   * Empty = no restriction beyond permission check.
   */
  allowedTools?: string[];
  /**
   * List of tool names this agent is explicitly forbidden from using.
   */
  blockedTools?: string[];
}

export interface PlanRequest {
  /** Raw user message for this turn. */
  userMessage: string;
  /** Session state — L1 turns, slots, pending approvals, summary. */
  session: Pick<SessionState, 'id' | 'turns' | 'summary' | 'slots' | 'recentTargets' | 'pendingApprovalIds'>;
  /** Tools the caller is permitted to use (already filtered by permission). */
  availableTools: CatalogEntry[];
  /** Optional domain snapshot — recent entity the user was discussing. */
  domainContext?: unknown;
  /** Model-visible hint: planId to embed in the generated plan. */
  planId: string;
  /** Operating mode: 'investigate' for discovery, 'operate' for execution. */
  mode?: 'investigate' | 'operate';
  /**
   * Live agent configuration from agent_versions.
   * Sourced from AI Studio's Reasoning / Safety / Knowledge tabs.
   */
  agentConfig?: AgentRuntimeConfig;
}

export type LLMResponse =
  | { kind: 'plan'; plan: Plan }
  | { kind: 'clarification'; question: string }
  | { kind: 'chat'; message: string }
  | { kind: 'error'; error: string };

export interface NarrativeRequest {
  userMessage: string;
  mode: 'investigate' | 'operate';
  traceSummary: string;
  spans: Array<{ tool: string; ok: boolean; value?: unknown; error?: string | null }>;
  needsApproval?: boolean;
  status?: string;
}

export interface LLMProvider {
  /** Generate a Plan (or clarification) from a conversation turn. */
  generatePlan(req: PlanRequest): Promise<LLMResponse>;
  /** Produce a short, user-facing summary of a completed execution trace. */
  summarizeResult(input: { userMessage: string; steps: Array<{ tool: string; result: unknown }> }): Promise<string>;
  /** Compose a conversational narrative (2-4 sentences) for the assistant message. */
  composeNarrative(req: NarrativeRequest): Promise<string>;
}

export class PlanEngineLLMError extends Error {
  code: 'LLM_PROVIDER_NOT_CONFIGURED' | 'LLM_RESPONSE_INVALID' | 'LLM_PROVIDER_FAILED';
  status: number;

  constructor(code: PlanEngineLLMError['code'], message: string, status = 500) {
    super(message);
    this.name = 'PlanEngineLLMError';
    this.code = code;
    this.status = status;
  }
}

export function isPlanEngineLLMConfigured(): boolean {
  return Boolean(config.ai.geminiApiKey && config.ai.geminiApiKey !== 'YOUR_GEMINI_API_KEY');
}

export function assertPlanEngineLLMConfigured(): void {
  if (!isPlanEngineLLMConfigured()) {
    throw new PlanEngineLLMError(
      'LLM_PROVIDER_NOT_CONFIGURED',
      'Configura un proveedor LLM para usar el SuperAgent.',
      503,
    );
  }
}

// ── Gemini system prompt ─────────────────────────────────────────────────────

function buildSystemPrompt(tools: CatalogEntry[], agentConfig?: AgentRuntimeConfig, mode?: 'investigate' | 'operate'): string {
  // Filter tools based on agentConfig allow/block lists
  let effectiveTools = tools;
  if (agentConfig?.allowedTools?.length) {
    effectiveTools = tools.filter((t) => agentConfig.allowedTools!.includes(t.name));
  }
  if (agentConfig?.blockedTools?.length) {
    effectiveTools = effectiveTools.filter((t) => !agentConfig.blockedTools!.includes(t.name));
  }

  const toolDocs = effectiveTools
    .map((t) => {
      const argFields =
        t.args.type === 'object'
          ? Object.entries(t.args.fields ?? {})
              .map(([k, v]) => `    - ${k} (${v.type}${v.required ? '' : '?'}): ${v.description ?? ''}`)
              .join('\n')
          : '    (no args)';
      return `### ${t.name} (v${t.version})
  ${t.description}
  Side-effect: ${t.sideEffect} | Risk: ${t.risk}
  Args:
${argFields}`;
    })
    .join('\n\n');

  // Persona — overridable via AI Studio Reasoning tab
  const persona = agentConfig?.personaOverride
    ?? 'You are the Super Agent, a highly capable orchestrator for a mission-critical Operations OS. You do not just answer questions; you proactively manage the lifecycle of cases, orders, payments, refunds, and returns. You are responsible for maintaining system-wide data integrity and resolving contradictions across modules.';

  // Knowledge snippets injected by AI Studio Knowledge tab
  const knowledgeSection = agentConfig?.knowledgeSnippets?.length
    ? `\n\n## Reference knowledge\n${agentConfig.knowledgeSnippets.map((s) => `### ${s.title}\n${s.excerpt}`).join('\n\n')}`
    : '';

  // Safety instructions from AI Studio Safety tab
  const safetySection = agentConfig?.safetyInstructions
    ? `\n\n## Safety & constraints\n${agentConfig.safetyInstructions}`
    : '';

  // Mode-specific instructions
  const modeInstructions = mode === 'operate'
    ? `\n\n## Operating Mode: OPERATE
The user is in OPERATE mode. They want to execute actions and solve problems.
- Proactive Execution: If resolving a contradiction requires multiple steps across modules (e.g., updating a payment and then a case), chain them in a single plan.
- Clarity of Impact: Clearly define what will change.
- Safety: Set needsApproval: true for high-risk actions.
- Reconciliation: After any write action, consider if follow-up read actions are needed to verify state alignment.`
    : mode === 'investigate'
      ? `\n\n## Operating Mode: INVESTIGATE
The user is in INVESTIGATE mode. They want deep insights and a complete picture.
- Holistic Reasoning: When asked about one entity (e.g. a case), automatically check related entities (order, customer, payment) to find hidden contradictions or context.
- Proactive Reconciliation: Identify mismatches between systems (e.g. Stripe says refunded but CRM says open) even if not explicitly asked.
- Insightful Suggestions: Propose drill-down actions that help the user reach a resolution strategy.`
      : '';

  return `${persona}

## Your job
You are a strategic partner. Given the conversation history, active context (slots), and the user's latest message, produce a JSON plan that achieves a complete operational outcome. You must think across domains (cases, orders, payments) to ensure consistency.

## Available tools
${toolDocs}${knowledgeSection}${safetySection}${modeInstructions}

## Output format — you MUST respond with valid JSON, one of:

### Plan:
{
  "kind": "plan",
  "steps": [
    {
      "id": "s0",
      "tool": "<tool_name>",
      "args": { ... },
      "dependsOn": [],
      "rationale": "one line"
    }
  ],
  "confidence": 0.0–1.0,
  "rationale": "overall intent",
  "needsApproval": false,
  "responseTemplate": "Brief message to show the user after execution."
}

### Clarification (when ambiguous):
{
  "kind": "clarification",
  "question": "What did you mean by X?"
}

### Chat (when no action is needed):
{
  "kind": "chat",
  "message": "A natural conversational reply, 1-3 sentences. Match the user's language."
}

## Rules
- NEVER invent tool names not in the list above.
- NEVER include secrets, SQL, or raw HTTP calls in args.
- Use "{{stepId.path}}" to reference a prior step's output, e.g. "{{s0.id}}".
- If confidence < 0.7, ask a clarifying question instead of producing a plan.
- Steps may run in parallel if dependsOn is empty or references already-satisfied steps.
- Use "kind": "chat" for greetings, small talk, capability questions, or any request that needs no tool execution.
- For any request involving real data or actions (look up, find, search, list, show, update, cancel, refund, send, notify, create), produce "kind": "plan" and use tools instead of answering from imagination.
- Generate as many steps as needed to fully satisfy the request. Chain reads before writes. Prefer bulk tools for repeated mutations and playbook tools for known operational procedures. Before executing a large bulk write, call bulk.preview first. Before executing a playbook with several side effects, call playbook.preview first. Use dependsOn for sequential dependencies. Steps with empty dependsOn run in parallel. Reject multi-step plans that could cause irreversible harm without first setting needsApproval: true.
- Set needsApproval: true when you believe the action is sensitive.
- Use analysis.root_cause when the user asks why something is happening, asks for root cause, or needs a causal explanation grounded in canonical state.
- Use scheduled_action.create for reminders, deferred follow-ups, and time-aware actions instead of asking the user to remember manually.
- Respond ONLY with the JSON object. No prose outside the JSON.`;
}

// ── Context builder ──────────────────────────────────────────────────────────

function buildContextMessages(req: PlanRequest): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  const messages: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  const safeDomainContext = req.domainContext ? redactSensitiveText(JSON.stringify(redactStructuredValue(req.domainContext), null, 2)) : '';

  // Rolling session summary (L2)
  if (req.session.summary) {
    messages.push({
      role: 'user',
      parts: [{ text: `[Session summary so far]\n${redactSensitiveText(req.session.summary)}` }],
    });
    messages.push({
      role: 'model',
      parts: [{ text: '{"kind":"clarification","question":"(context loaded)"}' }],
    });
  }

  // Live slots
  const slots = Object.entries(req.session.slots ?? {});
  if (slots.length > 0) {
    const slotText = slots
      .map(([k, v]) => `${k}: ${redactSensitiveText(String(JSON.stringify(redactStructuredValue(v.value)) ?? ''))}`)
      .join('\n');
    messages.push({
      role: 'user',
      parts: [{ text: `[Active context]\n${slotText}` }],
    });
    messages.push({
      role: 'model',
      parts: [{ text: '{"kind":"clarification","question":"(context loaded)"}' }],
    });
  }

  const recentTargets = Array.isArray(req.session.recentTargets) ? req.session.recentTargets.slice(0, 5) : [];
  if (recentTargets.length > 0) {
    const targetText = recentTargets
      .map((target, index) => `${index + 1}. ${target.entityType || target.page}${target.entityId ? `:${target.entityId}` : ''}${target.section ? `#${target.section}` : ''}`)
      .join('\n');
    messages.push({
      role: 'user',
      parts: [{ text: `[Recent navigation targets]\n${targetText}` }],
    });
    messages.push({
      role: 'model',
      parts: [{ text: '{"kind":"clarification","question":"(navigation context loaded)"}' }],
    });
  }

  if (safeDomainContext) {
    messages.push({
      role: 'user',
      parts: [{ text: `[Domain context]\n${safeDomainContext}` }],
    });
    messages.push({
      role: 'model',
      parts: [{ text: '{"kind":"clarification","question":"(domain context loaded)"}' }],
    });
  }

  // Pronoun resolution hints (active slots)
  if (req.session.slots && Object.keys(req.session.slots).length > 0) {
    const slotHints = Object.entries(req.session.slots)
      .filter(([_, v]) => v.ttlTurns > 0)  // Not expired
      .map(([k, v]) => {
        const val = String(JSON.stringify(v.value)).slice(0, 50);
        return `${k}: ${v.type} (${val})`;
      })
      .join('\n');

    if (slotHints) {
      messages.push({
        role: 'user',
        parts: [{
          text: `[Active references]\nWhen the user says "that case", "the order", "the customer", etc., refer to these active slots:\n${slotHints}`
        }],
      });
      messages.push({
        role: 'model',
        parts: [{ text: '{"kind":"clarification","question":"(pronoun context loaded)"}' }],
      });
    }
  }

  // Recent turns (L1 — more in operate mode for safety)
  const turnLimit = req.mode === 'operate' ? 20 : 15;
  const recentTurns = (req.session.turns ?? []).slice(-turnLimit);
  for (const turn of recentTurns) {
    if (turn.role === 'user') {
      messages.push({ role: 'user', parts: [{ text: redactSensitiveText(turn.content) }] });
    } else if (turn.role === 'assistant') {
      // Reuse prior plan JSON if present, else wrap plaintext
      messages.push({ role: 'model', parts: [{ text: redactSensitiveText(turn.content) }] });
    }
  }

  // Current user message
  messages.push({ role: 'user', parts: [{ text: redactSensitiveText(req.userMessage) }] });

  return messages;
}

function normalizeTemperature(value: number | undefined, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (value < 0) return 0;
  if (value > 2) return 2;
  return value;
}

function normalizeMaxOutputTokens(value: number | undefined, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(1, Math.floor(value));
}

// ── Response parser ──────────────────────────────────────────────────────────

function parseResponse(raw: string, planId: string, sessionId: string): LLMResponse {
  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { kind: 'error', error: `LLM returned non-JSON: ${raw.slice(0, 200)}` };
  }

  if (parsed.kind === 'clarification') {
    if (typeof parsed.question !== 'string') {
      return { kind: 'error', error: 'Clarification missing question field' };
    }
    return { kind: 'clarification', question: parsed.question };
  }

  if (parsed.kind === 'chat') {
    if (typeof parsed.message !== 'string' || !parsed.message.trim()) {
      return { kind: 'error', error: 'Chat response missing message field' };
    }
    return { kind: 'chat', message: parsed.message.trim() };
  }

  if (parsed.kind === 'plan') {
    if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      return { kind: 'error', error: 'Plan has no steps' };
    }

    const steps: PlanStep[] = parsed.steps.map((s: any, i: number) => ({
      id: s.id ?? `s${i}`,
      tool: String(s.tool ?? ''),
      args: s.args ?? {},
      dependsOn: Array.isArray(s.dependsOn) ? s.dependsOn : [],
      rationale: s.rationale,
    }));

    const plan: Plan = {
      planId,
      sessionId,
      createdAt: new Date().toISOString(),
      steps,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
      rationale: parsed.rationale ?? '',
      needsApproval: parsed.needsApproval === true,
      responseTemplate: parsed.responseTemplate,
    };

    return { kind: 'plan', plan };
  }

  return { kind: 'error', error: `Unknown response kind: ${parsed.kind}` };
}

// ── Gemini implementation ────────────────────────────────────────────────────

class GeminiProvider implements LLMProvider {
  private genAI: GoogleGenerativeAI;
  private modelName: string;

  constructor() {
    this.genAI = new GoogleGenerativeAI(config.ai.geminiApiKey);
    this.modelName = config.ai.geminiModel;
  }

  async generatePlan(req: PlanRequest): Promise<LLMResponse> {
    const { agentConfig } = req;
    const systemPrompt = buildSystemPrompt(req.availableTools, agentConfig, req.mode);
    const contextMessages = buildContextMessages(req);

    // Resolve model/generation overrides from AI Studio Reasoning tab
    const modelName = agentConfig?.model ?? this.modelName;
    const temperature = normalizeTemperature(agentConfig?.temperature, 0.2);
    const maxOutputTokens = normalizeMaxOutputTokens(agentConfig?.maxOutputTokens, 2048);

    return withGeminiRetry(
      async () => {
        const model = this.genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemPrompt,
          generationConfig: {
            temperature,
            maxOutputTokens,
            responseMimeType: 'application/json',
          },
        });

        const chat = model.startChat({ history: contextMessages.slice(0, -1) });
        const lastMessage = contextMessages[contextMessages.length - 1];
        const result = await chat.sendMessage(lastMessage.parts[0].text);
        const raw = result.response.text();

        logger.debug('PlanEngine LLM response', {
          planId: req.planId,
          sessionId: req.session.id,
          rawLength: raw.length,
        });

        return parseResponse(raw, req.planId, req.session.id);
      },
      { label: 'planEngine.generatePlan' },
    );
  }

  async composeNarrative(req: NarrativeRequest): Promise<string> {
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: { temperature: 0.4, maxOutputTokens: 280 },
    });

    const spansText = (req.spans || [])
      .slice(0, 6)
      .map((s, i) => {
        const valuePart = s.ok
          ? redactSensitiveText(String(JSON.stringify(redactStructuredValue(s.value)) ?? '')).slice(0, 220)
          : `error: ${s.error || 'failed'}`;
        return `${i + 1}. ${s.tool}: ${valuePart}`;
      })
      .join('\n');

    const modeGuidance = req.mode === 'operate'
      ? `The user is in OPERATE mode. ${
          req.needsApproval
            ? 'This action needs approval. Explain WHAT will change, WHO it affects, and ask for confirmation.'
            : 'Confirm what was changed and the immediate impact.'
        }`
      : 'The user is in INVESTIGATE mode. Summarise findings clearly: what entities were checked, current status, anything notable. Do NOT propose write actions.';

    const statusHint = req.status === 'pending_approval'
      ? 'Note: execution is paused waiting for approval — surface that explicitly.'
      : req.status === 'rejected_by_policy'
        ? 'Note: the plan was blocked by a guardrail — explain what blocked it without panic.'
        : req.status === 'failed'
          ? 'Note: execution failed — say so honestly and suggest next step.'
          : '';

    const prompt = `User said: "${redactSensitiveText(req.userMessage)}"

${modeGuidance}
${statusHint}

What was actually executed (system trace):
${spansText || 'No tools executed — pure conversation.'}

Final system summary: ${redactSensitiveText(req.traceSummary || '(none)')}

Write the assistant reply as 2-4 short conversational sentences in the user's language (default English; switch to Spanish if the user wrote in Spanish). Plain prose only — no bullet lists, no markdown, no JSON, no preamble like "Here's what I found:".`;

    try {
      return await withGeminiRetry(
        async () => {
          const result = await model.generateContent(prompt);
          return result.response.text().trim();
        },
        { label: 'planEngine.composeNarrative' },
      );
    } catch (err) {
      logger.warn('composeNarrative failed', { error: String(err) });
      throw new PlanEngineLLMError(
        'LLM_PROVIDER_FAILED',
        `LLM narrative generation failed: ${err instanceof Error ? err.message : String(err)}`,
        502,
      );
    }
  }

  async summarizeResult(input: {
    userMessage: string;
    steps: Array<{ tool: string; result: unknown }>;
  }): Promise<string> {
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: { temperature: 0.3, maxOutputTokens: 256 },
    });

    const stepsText = input.steps
      .map((s, i) => `Step ${i + 1} (${s.tool}): ${redactSensitiveText(String(JSON.stringify(redactStructuredValue(s.result)) ?? ''))}`)
      .join('\n');

    const prompt = `User asked: "${redactSensitiveText(input.userMessage)}"
The following actions were executed:
${stepsText}

Write a single short sentence (max 20 words) confirming what was done. No preamble.`;

    return withGeminiRetry(
      async () => {
        const result = await model.generateContent(prompt);
        return result.response.text().trim();
      },
      { label: 'planEngine.summarizeResult' },
    );
  }
}

// ── Provider registry ────────────────────────────────────────────────────────

let _provider: LLMProvider | null = null;

export function getPlanEngineLLMProvider(): LLMProvider {
  if (!_provider) {
    assertPlanEngineLLMConfigured();
    _provider = new GeminiProvider();
  }
  return _provider;
}

/** Override the default Gemini provider (useful for tests or multi-model experiments). */
export function setPlanEngineLLMProvider(p: LLMProvider): void {
  _provider = p;
}
