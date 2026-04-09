/**
 * server/agents/types.ts
 *
 * Core type system for the AI Agent Engine.
 *
 * Every agent in the system is versioned and has three profile objects:
 *   - permission_profile  — what operations the agent is allowed to perform
 *   - reasoning_profile   — how the agent thinks (model, temperature, budget)
 *   - safety_profile      — circuit-breakers and human-in-the-loop gates
 *
 * Agents receive an AgentRunContext (hydrated by the runner) and return
 * an AgentResult. The runner persists results to agent_runs.
 */

import type { GoogleGenerativeAI } from '@google/generative-ai';
import type { ContextWindow } from '../pipeline/contextWindow.js';
import type { AgentKnowledgeBundle } from '../services/agentKnowledge.js';

// ── Profiles (stored as JSON in agent_versions) ───────────────────────────────

export interface PermissionProfile {
  /** Can this agent call Shopify APIs? */
  canCallShopify: boolean;
  /** Can this agent call Stripe APIs? */
  canCallStripe: boolean;
  /** Can this agent send messages to customers? */
  canSendMessages: boolean;
  /** Can this agent issue refunds autonomously? */
  canIssueRefunds: boolean;
  /** Can this agent modify case fields (status, priority, tags)? */
  canModifyCase: boolean;
  /** Can this agent create approval requests? */
  canRequestApproval: boolean;
  /** Can this agent write audit events? */
  canWriteAuditLog: boolean;
  /** Max refund amount this agent can process without approval (USD) */
  maxAutonomousRefundAmount: number;
}

export interface ReasoningProfile {
  /** Gemini model ID to use */
  model: string;
  /** Temperature (0-1). Lower = more deterministic */
  temperature: number;
  /** Max output tokens for this agent */
  maxOutputTokens: number;
  /** Whether to use structured JSON output mode */
  useJsonMode: boolean;
  /** Optional system-level instructions appended to every prompt */
  systemInstruction?: string;
}

export interface SafetyProfile {
  /** Require human approval before executing any action */
  requiresHumanApproval: boolean;
  /** Max consecutive failures before the agent is auto-disabled */
  maxConsecutiveFailures: number;
  /** Agent is disabled if confidence drops below this threshold */
  minConfidenceThreshold: number;
  /** Emit an alert if the agent has not run in this many hours */
  staleSilenceAlertHours: number;
  /** List of action types that ALWAYS require approval regardless of amount */
  alwaysApproveActions: string[];
}

// ── Default profiles (used when a version has no custom profile) ──────────────

export const DEFAULT_PERMISSION_PROFILE: PermissionProfile = {
  canCallShopify: false,
  canCallStripe: false,
  canSendMessages: false,
  canIssueRefunds: false,
  canModifyCase: true,
  canRequestApproval: true,
  canWriteAuditLog: true,
  maxAutonomousRefundAmount: 0,
};

export const DEFAULT_REASONING_PROFILE: ReasoningProfile = {
  model: 'gemini-2.5-pro',
  temperature: 0.2,
  maxOutputTokens: 2048,
  useJsonMode: true,
};

export const DEFAULT_SAFETY_PROFILE: SafetyProfile = {
  requiresHumanApproval: false,
  maxConsecutiveFailures: 5,
  minConfidenceThreshold: 0.5,
  staleSilenceAlertHours: 24,
  alwaysApproveActions: [],
};

// ── Run context ───────────────────────────────────────────────────────────────

export interface AgentRunContext {
  /** Unique ID of the agent_run row being created */
  runId: string;
  /** The agent DB row (including its current version) */
  agent: AgentRow;
  /** Resolved profiles for this run */
  permissions: PermissionProfile;
  reasoning: ReasoningProfile;
  safety: SafetyProfile;
  /** Pre-built context window for the case */
  contextWindow: ContextWindow;
  /** Knowledge and policy documents available to this agent run */
  knowledgeBundle: AgentKnowledgeBundle;
  /** Gemini client configured with the reasoning profile */
  gemini: GoogleGenerativeAI;
  /** Queue/job context */
  tenantId: string;
  workspaceId: string;
  traceId: string;
  /** Trigger that fired this agent */
  triggerEvent: string;
  /** Extra context payload from the triggering job */
  extraContext: Record<string, unknown>;
}

// ── Result ────────────────────────────────────────────────────────────────────

export interface AgentResult {
  /** Whether the agent completed successfully */
  success: boolean;
  /** 0-1 confidence score for the output */
  confidence?: number;
  /** Tokens consumed by Gemini calls */
  tokensUsed?: number;
  /** Estimated cost in credits (1 credit = $0.0001) */
  costCredits?: number;
  /** Human-readable summary of what the agent did */
  summary?: string;
  /** Structured output payload (agent-specific) */
  output?: Record<string, unknown>;
  /** If success=false, the error message */
  error?: string;
}

// ── Implementation contract ───────────────────────────────────────────────────

export interface AgentImplementation {
  /** The slug this implementation handles */
  slug: string;
  /** Called by the runner with a fully hydrated context */
  execute(ctx: AgentRunContext): Promise<AgentResult>;
}

// ── DB row shapes ─────────────────────────────────────────────────────────────

export interface AgentRow {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  category: string;
  is_system: number;
  is_locked: number;
  is_active: number;
  current_version_id: string | null;
  created_at: string;
}

export interface AgentVersionRow {
  id: string;
  agent_id: string;
  version_number: number;
  status: string;
  rollout_percentage: number;
  permission_profile: string | null;  // JSON
  reasoning_profile: string | null;   // JSON
  safety_profile: string | null;      // JSON
  knowledge_profile: string | null;   // JSON
  published_at: string | null;
  tenant_id: string;
}

export interface AgentRunRow {
  id: string;
  agent_id: string;
  agent_version_id: string;
  case_id: string;
  tenant_id: string;
  workspace_id: string;
  trigger_event: string;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  confidence: number | null;
  tokens_used: number | null;
  cost_credits: number | null;
  summary: string | null;
  output: string | null;  // JSON
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}
