
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const tenantId = 'tenant_1'; // Standard default tenant for this SaaS

// Profile presets
const READ_ONLY_PERMS = {
  canCallShopify: false,
  canCallStripe: false,
  canSendMessages: false,
  canIssueRefunds: false,
  canModifyCase: true,
  canRequestApproval: false,
  canWriteAuditLog: true,
  maxAutonomousRefundAmount: 0,
};

const ANALYSIS_PERMS = {
  ...READ_ONLY_PERMS,
  canRequestApproval: true,
};

const COMMUNICATION_PERMS = {
  ...ANALYSIS_PERMS,
  canSendMessages: true,
};

const RESOLUTION_PERMS = {
  canCallShopify: true,
  canCallStripe: true,
  canSendMessages: true,
  canIssueRefunds: true,
  canModifyCase: true,
  canRequestApproval: true,
  canWriteAuditLog: true,
  maxAutonomousRefundAmount: 50,
};

const SUPERVISOR_PERMS = {
  ...RESOLUTION_PERMS,
  maxAutonomousRefundAmount: 500,
};

const FAST_REASONING = {
  model: 'gemini-2.5-pro',
  temperature: 0.1,
  maxOutputTokens: 1024,
  useJsonMode: true,
};

const BALANCED_REASONING = {
  model: 'gemini-2.5-pro',
  temperature: 0.2,
  maxOutputTokens: 2048,
  useJsonMode: true,
};

const THOROUGH_REASONING = {
  model: 'gemini-3.1-pro-preview',
  temperature: 0.1,
  maxOutputTokens: 4096,
  useJsonMode: true,
};

const CREATIVE_REASONING = {
  model: 'gemini-3.1-pro-preview',
  temperature: 0.4,
  maxOutputTokens: 3072,
  useJsonMode: true,
};

const STANDARD_SAFETY = {
  requiresHumanApproval: false,
  maxConsecutiveFailures: 5,
  minConfidenceThreshold: 0.5,
  staleSilenceAlertHours: 24,
  alwaysApproveActions: [],
};

const STRICT_SAFETY = {
  requiresHumanApproval: false,
  maxConsecutiveFailures: 3,
  minConfidenceThreshold: 0.7,
  staleSilenceAlertHours: 12,
  alwaysApproveActions: ['issue_refund', 'cancel_order'],
};

const CRITICAL_SAFETY = {
  requiresHumanApproval: true,
  maxConsecutiveFailures: 2,
  minConfidenceThreshold: 0.8,
  staleSilenceAlertHours: 6,
  alwaysApproveActions: ['issue_refund', 'cancel_order', 'block_customer', 'send_external_message'],
};

const AGENTS = [
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

async function seed() {
  const now = new Date().toISOString();
  console.log('Seeding agents to Supabase...');

  for (const agent of AGENTS) {
    const versionId = `${agent.id}_v1`;

    // 1. Insert Agent
    const { error: agentError } = await supabase.from('agents').upsert({
      id: agent.id,
      tenant_id: tenantId,
      name: agent.name,
      slug: agent.slug,
      category: agent.category,
      is_system: agent.is_system,
      is_locked: agent.is_locked,
      is_active: 1,
      current_version_id: versionId,
      created_at: now,
      updated_at: now
    });

    if (agentError) {
      console.error(`Error seeding agent ${agent.slug}:`, agentError);
      continue;
    }

    // 2. Insert Version
    const { error: versionError } = await supabase.from('agent_versions').upsert({
      id: versionId,
      agent_id: agent.id,
      version_number: 1,
      status: 'published',
      rollout_percentage: 100,
      permission_profile: agent.permissions,
      reasoning_profile: agent.reasoning,
      safety_profile: agent.safety,
      knowledge_profile: {},
      capabilities: {},
      published_at: now,
      tenant_id: tenantId,
    });

    if (versionError) {
      console.error(`Error seeding version for ${agent.slug}:`, versionError);
    } else {
      console.log(`✅ Seeded agent: ${agent.slug}`);
    }
  }

  console.log('Seed complete!');
}

seed();
