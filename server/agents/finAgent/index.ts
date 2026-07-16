/**
 * server/agents/finAgent/index.ts
 *
 * Fin AI Agent — the autonomous customer-facing support agent.
 * Spec: docs/fin-ai-agent-spec.md. Decoupled from the operator copilot
 * (chatAgent); shares only the LLM providers and the data layer.
 */

export { runFinPipeline, type FinRunInput, type FinRunResult } from './pipeline.js';
export { notifyMessageCreated, type FinTriggerInput } from './trigger.js';
export {
  loadFinConfig, patchFinConfig, parseFinConfig,
  FinConfigSchema, MAX_ACTIVE_GUIDANCE,
  type FinConfig, type FinScope,
} from './config.js';
export { retrieveKnowledge, embedQuery, _setEmbedderForTests } from './retrieval.js';
