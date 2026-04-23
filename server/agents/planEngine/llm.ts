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
  session: Pick<SessionState, 'id' | 'turns' | 'summary' | 'slots' | 'pendingApprovalIds'>;
  /** Tools the caller is permitted to use (already filtered by permission). */
  availableTools: CatalogEntry[];
  /** Optional domain snapshot — recent entity the user was discussing. */
  domainContext?: unknown;
  /** Model-visible hint: planId to embed in the generated plan. */
  planId: string;
  /**
   * Live agent configuration from agent_versions.
   * Sourced from AI Studio's Reasoning / Safety / Knowledge tabs.
   */
  agentConfig?: AgentRuntimeConfig;
}

export type LLMResponse =
  | { kind: 'plan'; plan: Plan }
  | { kind: 'clarification'; question: string }
  | { kind: 'error'; error: string };

export interface LLMProvider {
  /** Generate a Plan (or clarification) from a conversation turn. */
  generatePlan(req: PlanRequest): Promise<LLMResponse>;
  /** Produce a short, user-facing summary of a completed execution trace. */
  summarizeResult(input: { userMessage: string; steps: Array<{ tool: string; result: unknown }> }): Promise<string>;
}

// ── Gemini system prompt ─────────────────────────────────────────────────────

function buildSystemPrompt(tools: CatalogEntry[], agentConfig?: AgentRuntimeConfig): string {
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
    ?? 'You are the Super Agent for a B2B customer support CRM. You help support agents manage cases, orders, payments, refunds, returns, approvals, and workflows.';

  // Knowledge snippets injected by AI Studio Knowledge tab
  const knowledgeSection = agentConfig?.knowledgeSnippets?.length
    ? `\n\n## Reference knowledge\n${agentConfig.knowledgeSnippets.map((s) => `### ${s.title}\n${s.excerpt}`).join('\n\n')}`
    : '';

  // Safety instructions from AI Studio Safety tab
  const safetySection = agentConfig?.safetyInstructions
    ? `\n\n## Safety & constraints\n${agentConfig.safetyInstructions}`
    : '';

  return `${persona}

## Your job
Given the conversation history and the user's latest message, produce a JSON plan or ask a clarifying question.

## Available tools
${toolDocs}${knowledgeSection}${safetySection}

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

## Rules
- NEVER invent tool names not in the list above.
- NEVER include secrets, SQL, or raw HTTP calls in args.
- Use "{{stepId.path}}" to reference a prior step's output, e.g. "{{s0.id}}".
- If confidence < 0.7, ask a clarifying question instead of producing a plan.
- Steps may run in parallel if dependsOn is empty or references already-satisfied steps.
- Keep plans minimal — prefer 1–3 steps. Reject multi-step plans that could cause irreversible harm without approval.
- Set needsApproval: true when you believe the action is sensitive.
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

  // Recent turns (L1 — last 10)
  const recentTurns = (req.session.turns ?? []).slice(-10);
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
    const systemPrompt = buildSystemPrompt(req.availableTools, agentConfig);
    const contextMessages = buildContextMessages(req);

    // Resolve model/generation overrides from AI Studio Reasoning tab
    const modelName = agentConfig?.model ?? this.modelName;
    const temperature = typeof agentConfig?.temperature === 'number' ? agentConfig.temperature : 0.2;
    const maxOutputTokens = typeof agentConfig?.maxOutputTokens === 'number' ? agentConfig.maxOutputTokens : 2048;

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
    _provider = new GeminiProvider();
  }
  return _provider;
}

/** Override the default Gemini provider (useful for tests or multi-model experiments). */
export function setPlanEngineLLMProvider(p: LLMProvider): void {
  _provider = p;
}
