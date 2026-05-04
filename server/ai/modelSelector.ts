/**
 * server/ai/modelSelector.ts
 *
 * Centralised Gemini model picker. Every AI call in the app should route through
 * `pickGeminiModel(taskType)` so that:
 *   - we never reference a single hardcoded model name in business code
 *   - we can shift cost/latency tradeoffs by editing this file alone
 *   - deprecations (e.g., gemini-2.0-flash being retired) are fixed in one spot
 *
 * Cost optimisation philosophy: use the cheapest model that passes the task.
 *   - Pro     → multi-step reasoning, plan generation, policy synthesis
 *   - Flash   → standard generation: drafts, classification with explanation,
 *               copilot replies, customer-facing answers
 *   - Lite    → quick mechanical tasks: intent detection, summarise short text,
 *               language detection, sentiment, redaction passes
 *
 * Override per-call by passing an explicit model name (used by AI Studio when
 * a tenant has manually pinned a model in their agent_versions row).
 */

export type AiTaskType =
  // Reasoning-heavy
  | 'super_agent_plan'           // Plan engine: choose tool sequence
  | 'policy_synthesis'           // Translate plain-English policy → rule
  | 'reconciliation_root_cause'  // Cross-system conflict diagnosis
  // Standard generation
  | 'draft_reply'                // Customer-facing reply
  | 'copilot_chat'               // Inline copilot turn
  | 'super_agent_tool_call'      // Tool call argument synthesis
  | 'workflow_ai_node'           // Workflow node ai.gemini default
  | 'knowledge_test_grade'       // Grade an article test answer
  // Quick / cheap
  | 'intent_classification'      // Triage / route
  | 'summarise_conversation'     // Compact a long thread
  | 'language_detection'
  | 'sentiment'
  | 'pii_redaction'
  | 'gap_dedup'                  // Dedupe knowledge gaps by similarity
  // Embeddings
  | 'embedding';

const MODEL_BY_TASK: Record<AiTaskType, string> = {
  // Reasoning tasks — default to gemini-2.5-flash for free-tier-friendly
  // operation. Override individually via GEMINI_MODEL_PLAN / _POLICY /
  // _RECONCILE env vars when a tenant pays for gemini-2.5-pro.
  super_agent_plan:           process.env.GEMINI_MODEL_PLAN ?? 'gemini-2.5-flash',
  policy_synthesis:           process.env.GEMINI_MODEL_POLICY ?? 'gemini-2.5-flash',
  reconciliation_root_cause:  process.env.GEMINI_MODEL_RECONCILE ?? 'gemini-2.5-flash',

  // Flash: balanced quality/cost
  draft_reply:                'gemini-2.5-flash',
  copilot_chat:               'gemini-2.5-flash',
  super_agent_tool_call:      'gemini-2.5-flash',
  workflow_ai_node:           'gemini-2.5-flash',
  knowledge_test_grade:       'gemini-2.5-flash',

  // Lite: cheap mechanical work
  intent_classification:      'gemini-2.5-flash-lite',
  summarise_conversation:     'gemini-2.5-flash-lite',
  language_detection:         'gemini-2.5-flash-lite',
  sentiment:                  'gemini-2.5-flash-lite',
  pii_redaction:              'gemini-2.5-flash-lite',
  gap_dedup:                  'gemini-2.5-flash-lite',

  // Embeddings
  embedding:                  'text-embedding-004',
};

/**
 * Sensible default when nothing is known about the task. Flash is balanced.
 */
const DEFAULT_MODEL = 'gemini-2.5-flash';

/**
 * Resolve the Gemini model for a given task. Resolution order:
 *   1. Explicit override (caller-provided model name) — used when a per-tenant
 *      agent_version pins a model.
 *   2. Per-task default from MODEL_BY_TASK.
 *   3. Global env override (GEMINI_MODEL_OVERRIDE) — emergency lever to force a
 *      specific model across the app without code changes (e.g., during a
 *      Google deprecation rollout).
 *   4. Fallback to gemini-2.5-flash.
 *
 * Stale model names (e.g., gemini-2.0-flash, gemini-1.5-*) are rewritten to
 * their current equivalent so older agent_versions configs keep working.
 */
export function pickGeminiModel(
  task: AiTaskType,
  override?: string | null,
): string {
  const envOverride = process.env.GEMINI_MODEL_OVERRIDE?.trim();
  const raw = (override?.trim() || envOverride || MODEL_BY_TASK[task] || DEFAULT_MODEL).trim();
  return rewriteDeprecated(raw);
}

const DEPRECATED_REWRITES: Record<string, string> = {
  // Removed-from-API models retired by Google in 2025
  'gemini-2.0-flash':       'gemini-2.5-flash',
  'gemini-2.0-flash-001':   'gemini-2.5-flash',
  'gemini-2.0-pro':         'gemini-2.5-pro',
  'gemini-1.5-flash':       'gemini-2.5-flash',
  'gemini-1.5-flash-001':   'gemini-2.5-flash',
  'gemini-1.5-flash-002':   'gemini-2.5-flash',
  'gemini-1.5-pro':         'gemini-2.5-pro',
  'gemini-1.5-pro-001':     'gemini-2.5-pro',
  'gemini-1.5-pro-002':     'gemini-2.5-pro',
  'gemini-pro':             'gemini-2.5-pro',
  'gemini-pro-vision':      'gemini-2.5-pro',
};

function rewriteDeprecated(model: string): string {
  return DEPRECATED_REWRITES[model] ?? model;
}

/**
 * Convenience for routes that historically read `config.ai.geminiModel`
 * directly. They can now ask for the right model by task without touching
 * config/env plumbing.
 */
export const GeminiModel = {
  forPlan:        () => pickGeminiModel('super_agent_plan'),
  forCopilot:     () => pickGeminiModel('copilot_chat'),
  forDraft:       () => pickGeminiModel('draft_reply'),
  forWorkflow:    () => pickGeminiModel('workflow_ai_node'),
  forClassify:    () => pickGeminiModel('intent_classification'),
  forSummary:     () => pickGeminiModel('summarise_conversation'),
  forEmbedding:   () => pickGeminiModel('embedding'),
};
