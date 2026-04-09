/**
 * server/agents/types.ts
 *
 * Core type system for the AI Agent Engine.
 */

import type { GoogleGenerativeAI } from '@google/generative-ai';
import type { ContextWindow } from '../pipeline/contextWindow.js';
import type { AgentKnowledgeBundle, KnowledgeProfile } from '../services/agentKnowledge.js';

export interface PermissionProfile {
  canCallShopify: boolean;
  canCallStripe: boolean;
  canSendMessages: boolean;
  canIssueRefunds: boolean;
  canModifyCase: boolean;
  canRequestApproval: boolean;
  canWriteAuditLog: boolean;
  maxAutonomousRefundAmount: number;
}

export interface ReasoningProfile {
  model: string;
  temperature: number;
  maxOutputTokens: number;
  useJsonMode: boolean;
  systemInstruction?: string;
}

export interface SafetyProfile {
  requiresHumanApproval: boolean;
  maxConsecutiveFailures: number;
  minConfidenceThreshold: number;
  staleSilenceAlertHours: number;
  alwaysApproveActions: string[];
}

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
  model: 'gemini-1.5-flash',
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

export interface AgentRunContext {
  runId: string;
  agent: AgentRow;
  permissions: PermissionProfile;
  reasoning: ReasoningProfile;
  safety: SafetyProfile;
  knowledgeProfile: KnowledgeProfile;
  knowledgeBundle: AgentKnowledgeBundle;
  contextWindow: ContextWindow;
  gemini: GoogleGenerativeAI;
  tenantId: string;
  workspaceId: string;
  traceId: string;
  triggerEvent: string;
  extraContext: Record<string, unknown>;
}

export interface AgentResult {
  success: boolean;
  confidence?: number;
  tokensUsed?: number;
  costCredits?: number;
  summary?: string;
  output?: Record<string, unknown>;
  error?: string;
}

export interface AgentImplementation {
  slug: string;
  execute(ctx: AgentRunContext): Promise<AgentResult>;
}

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
  permission_profile: string | null;
  reasoning_profile: string | null;
  safety_profile: string | null;
  knowledge_profile: string | null;
  published_at: string | null;
  tenant_id: string;
}

export interface AgentRunRow {
  id: string;
  agent_id: string;
  agent_version_id: string;
  case_id: string;
  tenant_id: string;
  trigger_type: string;
  outcome_status: 'running' | 'completed' | 'failed' | 'skipped';
  confidence: number | null;
  tokens_used: number | null;
  cost_credits: number | null;
  evidence_refs: string | null;
  execution_decision: string | null;
  error: string | null;
  started_at: string;
  ended_at: string | null;
}
