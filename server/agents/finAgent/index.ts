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
export {
  handleInboundOutcome, sweepAssumedResolutions,
  hasActiveBillableOutcome, revertResolution,
  type InboundOutcomeAction, type SweepResult,
} from './outcome.js';
export {
  listLiveProcedures, getActiveRun, matchProcedure, runProcedureTurn,
  resumeRunAfterApproval, checkOtp,
  type ProcedureStep, type ProcedureRow, type ProcedureRun, type ProcedureTurnResult,
} from './procedures.js';
export {
  executeConnectorAction, decidePendingAction, encryptAuth,
  listActionsForAgent, getActionWithConnector,
  type ActionPolicy, type ActionExecution, type ConnectorAction,
} from './connectors.js';
