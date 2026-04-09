/**
 * server/agents/seed.ts
 *
 * Seeds the full 22-agent roster with complete permission, reasoning,
 * and safety profiles for each agent version.
 *
 * Called from the main DB seeder. Idempotent — uses INSERT OR IGNORE.
 *
 * Existing agents from db/seed.ts (11):
 *   supervisor, approval-gatekeeper, qa-policy-check, channel-ingest,
 *   canonicalizer, intent-router, knowledge-retriever, reconciliation-agent,
 *   case-resolution-planner, resolution-executor, audit-observability
 *
 * New agents added here (11):
 *   triage-agent, identity-resolver, customer-profiler, draft-reply-agent,
 *   sla-monitor, report-generator, escalation-manager, fraud-detector,
 *   audit-logger, shopify-connector, stripe-connector
 */

import { randomUUID } from 'crypto';
import type { Database } from 'better-sqlite3';
import type {
  PermissionProfile,
  ReasoningProfile,
  SafetyProfile,
} from './types.js';

// ── Profile presets ───────────────────────────────────────────────────────────

const READ_ONLY_PERMS: PermissionProfile = {
  canCallShopify: false,
  canCallStripe: false,
  canSendMessages: false,
  canIssueRefunds: false,
  canModifyCase: true,
  canRequestApproval: false,
  canWriteAuditLog: true,
  maxAutonomousRefundAmount: 0,
};

const ANALYSIS_PERMS: PermissionProfile = {
  ...READ_ONLY_PERMS,
  canRequestApproval: true,
};

const COMMUNICATION_PERMS: PermissionProfile = {
  ...ANALYSIS_PERMS,
  canSendMessages: true,
};

const RESOLUTION_PERMS: PermissionProfile = {
  canCallShopify: true,
  canCallStripe: true,
  canSendMessages: true,
  canIssueRefunds: true,
  canModifyCase: true,
  canRequestApproval: true,
  canWriteAuditLog: true,
  maxAutonomousRefundAmount: 50,
};

const SUPERVISOR_PERMS: PermissionProfile = {
  ...RESOLUTION_PERMS,
  maxAutonomousRefundAmount: 500,
};

// Reasoning profiles
const FAST_REASONING: ReasoningProfile = {
  model: 'gemini-1.5-flash',
  temperature: 0.1,
  maxOutputTokens: 1024,
  useJsonMode: true,
};

const BALANCED_REASONING: ReasoningProfile = {
  model: 'gemini-1.5-flash',
  temperature: 0.2,
  maxOutputTokens: 2048,
  useJsonMode: true,
};

const CREATIVE_REASONING: ReasoningProfile = {
  model: 'gemini-1.5-flash',
  temperature: 0.4,
  maxOutputTokens: 3072,
  useJsonMode: true,
};

const THOROUGH_REASONING: ReasoningProfile = {
  model: 'gemini-1.5-pro',
  temperature: 0.1,
  maxOutputTokens: 4096,
  useJsonMode: true,
};

// Safety profiles
const STANDARD_SAFETY: SafetyProfile = {
  requiresHumanApproval: false,
  maxConsecutiveFailures: 5,
  minConfidenceThreshold: 0.5,
  staleSilenceAlertHours: 24,
  alwaysApproveActions: [],
};

const STRICT_SAFETY: SafetyProfile = {
  requiresHumanApproval: false,
  maxConsecutiveFailures: 3,
  minConfidenceThreshold: 0.7,
  staleSilenceAlertHours: 12,
  alwaysApproveActions: ['issue_refund', 'cancel_order'],
};

const CRITICAL_SAFETY: SafetyProfile = {
  requiresHumanApproval: true,
  maxConsecutiveFailures: 2,
  minConfidenceThreshold: 0.8,
  staleSilenceAlertHours: 6,
  alwaysApproveActions: ['issue_refund', 'cancel_order', 'block_customer', 'send_external_message'],
};

// ── Agent definitions ─────────────────────────────────────────────────────────

interface AgentDef {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: 'orchestration' | 'ingest' | 'resolution' | 'communication' | 'observability' | 'connectors';
  is_system: number;
  is_locked: number;
  permissions: PermissionProfile;
  reasoning: ReasoningProfile;
  safety: SafetyProfile;
}

const AGENTS: AgentDef[] = [
  // ── ORCHESTRATION ──────────────────────────────────────────────────────────
  {
    id: 'agent_supervisor',
    slug: 'supervisor',
    name: 'Supervisor',
    description: 'Top-level orchestration agent. Oversees other agents and escalates when needed.',
    category: 'orchestration',
    is_system: 1, is_locked: 1,
    permissions: SUPERVISOR_PERMS,
    reasoning: THOROUGH_REASONING,
    safety: CRITICAL_SAFETY,
  },
  {
    id: 'agent_approval_gk',
    slug: 'approval-gatekeeper',
    name: 'Approval Gatekeeper',
    description: 'Determines when human approval is required before executing a resolution plan.',
    category: 'orchestration',
    is_system: 1, is_locked: 0,
    permissions: ANALYSIS_PERMS,
    reasoning: BALANCED_REASONING,
    safety: STRICT_SAFETY,
  },
  {
    id: 'agent_qa',
    slug: 'qa-policy-check',
    name: 'QA / Policy Check',
    description: 'Validates resolution plans against company policies and compliance requirements.',
    category: 'orchestration',
    is_system: 1, is_locked: 0,
    permissions: ANALYSIS_PERMS,
    reasoning: BALANCED_REASONING,
    safety: STRICT_SAFETY,
  },
  {
    id: 'agent_escalation',
    slug: 'escalation-manager',
    name: 'Escalation Manager',
    description: 'Handles cases that exceed SLA or require senior staff intervention.',
    category: 'orchestration',
    is_system: 1, is_locked: 0,
    permissions: ANALYSIS_PERMS,
    reasoning: BALANCED_REASONING,
    safety: STRICT_SAFETY,
  },

  // ── INGEST ─────────────────────────────────────────────────────────────────
  {
    id: 'agent_channel_ingest',
    slug: 'channel-ingest',
    name: 'Channel Ingest',
    description: 'Ingests messages from WhatsApp, email, SMS and web-chat channels.',
    category: 'ingest',
    is_system: 1, is_locked: 0,
    permissions: READ_ONLY_PERMS,
    reasoning: FAST_REASONING,
    safety: STANDARD_SAFETY,
  },
  {
    id: 'agent_canonicalizer',
    slug: 'canonicalizer',
    name: 'Canonicalizer',
    description: 'Normalizes raw webhook events into canonical case entities.',
    category: 'ingest',
    is_system: 1, is_locked: 0,
    permissions: READ_ONLY_PERMS,
    reasoning: FAST_REASONING,
    safety: STANDARD_SAFETY,
  },
  {
    id: 'agent_intent_router',
    slug: 'intent-router',
    name: 'Intent Router',
    description: 'Classifies customer intent and routes to the appropriate case type.',
    category: 'ingest',
    is_system: 1, is_locked: 0,
    permissions: ANALYSIS_PERMS,
    reasoning: FAST_REASONING,
    safety: STANDARD_SAFETY,
  },
  {
    id: 'agent_triage',
    slug: 'triage-agent',
    name: 'Triage Agent',
    description: 'Classifies case urgency, severity, priority and assigns SLA tier.',
    category: 'ingest',
    is_system: 1, is_locked: 0,
    permissions: ANALYSIS_PERMS,
    reasoning: BALANCED_REASONING,
    safety: STANDARD_SAFETY,
  },
  {
    id: 'agent_identity',
    slug: 'identity-resolver',
    name: 'Identity Resolver',
    description: 'Links cross-system customer identities (Shopify, Stripe, support channels).',
    category: 'ingest',
    is_system: 1, is_locked: 0,
    permissions: READ_ONLY_PERMS,
    reasoning: FAST_REASONING,
    safety: STANDARD_SAFETY,
  },
  {
    id: 'agent_profiler',
    slug: 'customer-profiler',
    name: 'Customer Profiler',
    description: 'Builds customer risk score and segment based on transaction history.',
    category: 'ingest',
    is_system: 1, is_locked: 0,
    permissions: ANALYSIS_PERMS,
    reasoning: FAST_REASONING,
    safety: STANDARD_SAFETY,
  },
  {
    id: 'agent_knowledge',
    slug: 'knowledge-retriever',
    name: 'Knowledge Retriever',
    description: 'Retrieves relevant policy articles and SOPs for the case context.',
    category: 'ingest',
    is_system: 1, is_locked: 0,
    permissions: READ_ONLY_PERMS,
    reasoning: FAST_REASONING,
    safety: STANDARD_SAFETY,
  },

  // ── RESOLUTION ─────────────────────────────────────────────────────────────
  {
    id: 'agent_reconciliation',
    slug: 'reconciliation-agent',
    name: 'Reconciliation Agent',
    description: 'Detects and flags multi-system state conflicts across orders, payments and returns.',
    category: 'resolution',
    is_system: 1, is_locked: 1,
    permissions: RESOLUTION_PERMS,
    reasoning: BALANCED_REASONING,
    safety: STRICT_SAFETY,
  },
  {
    id: 'agent_case_resolution',
    slug: 'case-resolution-planner',
    name: 'Case Resolution Planner',
    description: 'Generates step-by-step execution plans to resolve detected conflicts.',
    category: 'resolution',
    is_system: 1, is_locked: 0,
    permissions: RESOLUTION_PERMS,
    reasoning: THOROUGH_REASONING,
    safety: STRICT_SAFETY,
  },
  {
    id: 'agent_executor',
    slug: 'resolution-executor',
    name: 'Resolution Executor',
    description: 'Executes approved resolution plans with rollback support.',
    category: 'resolution',
    is_system: 1, is_locked: 0,
    permissions: RESOLUTION_PERMS,
    reasoning: BALANCED_REASONING,
    safety: CRITICAL_SAFETY,
  },
  {
    id: 'agent_fraud',
    slug: 'fraud-detector',
    name: 'Fraud Detector',
    description: 'Identifies fraud signals in payment and customer behavior patterns.',
    category: 'resolution',
    is_system: 1, is_locked: 0,
    permissions: ANALYSIS_PERMS,
    reasoning: THOROUGH_REASONING,
    safety: CRITICAL_SAFETY,
  },
  {
    id: 'agent_report',
    slug: 'report-generator',
    name: 'Report Generator',
    description: 'Generates AI diagnosis, root cause analysis, and resolution summaries.',
    category: 'resolution',
    is_system: 1, is_locked: 0,
    permissions: ANALYSIS_PERMS,
    reasoning: THOROUGH_REASONING,
    safety: STANDARD_SAFETY,
  },

  // ── COMMUNICATION ──────────────────────────────────────────────────────────
  {
    id: 'agent_draft_reply',
    slug: 'draft-reply-agent',
    name: 'Draft Reply Agent',
    description: 'Generates AI-drafted customer replies tuned to tone and case context.',
    category: 'communication',
    is_system: 1, is_locked: 0,
    permissions: COMMUNICATION_PERMS,
    reasoning: CREATIVE_REASONING,
    safety: STRICT_SAFETY,
  },

  // ── OBSERVABILITY ──────────────────────────────────────────────────────────
  {
    id: 'agent_audit',
    slug: 'audit-observability',
    name: 'Audit & Observability',
    description: 'Comprehensive audit logging for all system events and agent actions.',
    category: 'observability',
    is_system: 1, is_locked: 1,
    permissions: READ_ONLY_PERMS,
    reasoning: FAST_REASONING,
    safety: STANDARD_SAFETY,
  },
  {
    id: 'agent_audit_logger',
    slug: 'audit-logger',
    name: 'Audit Logger',
    description: 'Records agent chain outcomes and case state snapshots to the audit log.',
    category: 'observability',
    is_system: 1, is_locked: 1,
    permissions: READ_ONLY_PERMS,
    reasoning: FAST_REASONING,
    safety: STANDARD_SAFETY,
  },
  {
    id: 'agent_sla',
    slug: 'sla-monitor',
    name: 'SLA Monitor',
    description: 'Monitors SLA deadlines and escalates cases approaching breach.',
    category: 'observability',
    is_system: 1, is_locked: 0,
    permissions: ANALYSIS_PERMS,
    reasoning: FAST_REASONING,
    safety: STANDARD_SAFETY,
  },

  // ── CONNECTORS ─────────────────────────────────────────────────────────────
  {
    id: 'agent_shopify',
    slug: 'shopify-connector',
    name: 'Shopify Connector',
    description: 'Reads and writes Shopify order, fulfillment and customer data.',
    category: 'connectors',
    is_system: 1, is_locked: 0,
    permissions: { ...RESOLUTION_PERMS, canCallStripe: false },
    reasoning: FAST_REASONING,
    safety: STRICT_SAFETY,
  },
  {
    id: 'agent_stripe',
    slug: 'stripe-connector',
    name: 'Stripe Connector',
    description: 'Reads and writes Stripe payment intents, refunds and disputes.',
    category: 'connectors',
    is_system: 1, is_locked: 0,
    permissions: { ...RESOLUTION_PERMS, canCallShopify: false },
    reasoning: FAST_REASONING,
    safety: CRITICAL_SAFETY,
  },
];

// ── Seed function ─────────────────────────────────────────────────────────────

export function seedAgents(db: Database, tenantId: string): void {
  const insertAgent = db.prepare(`
    INSERT OR IGNORE INTO agents
      (id, tenant_id, name, slug, category, is_system, is_locked, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);

  const updateAgent = db.prepare(`
    UPDATE agents SET
      name      = ?,
      slug      = ?,
      category  = ?,
      is_system = ?,
      is_locked = ?,
      is_active = 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ?
  `);

  const insertVersion = db.prepare(`
    INSERT OR IGNORE INTO agent_versions
      (id, agent_id, version_number, status, rollout_percentage,
       permission_profile, reasoning_profile, safety_profile,
       published_at, tenant_id)
    VALUES (?, ?, 1, 'published', 100, ?, ?, ?, ?, ?)
  `);

  const updateCurrent = db.prepare(
    'UPDATE agents SET current_version_id = ? WHERE id = ?'
  );

  const now = new Date().toISOString();

  for (const agent of AGENTS) {
    insertAgent.run(
      agent.id, tenantId, agent.name, agent.slug,
      agent.category, agent.is_system, agent.is_locked,
      now,
    );
    updateAgent.run(
      agent.name,
      agent.slug,
      agent.category,
      agent.is_system,
      agent.is_locked,
      agent.id,
      tenantId,
    );

    const versionId = `${agent.id}_v1`;
    insertVersion.run(
      versionId, agent.id,
      JSON.stringify(agent.permissions),
      JSON.stringify(agent.reasoning),
      JSON.stringify(agent.safety),
      now, tenantId,
    );

    updateCurrent.run(versionId, agent.id);
  }

  console.log(`🤖 Seeded ${AGENTS.length} agents`);
}
