import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { AGENT_CATALOG, type AgentCatalogEntry } from './server/agents/catalog.js';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to seed Supabase.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const tenantId = process.env.DEFAULT_TENANT_ID ?? 'org_default';

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

function reasoningFor(entry: AgentCatalogEntry) {
  if (entry.modelTier === 'none') {
    return {
      model: null,
      temperature: 0,
      maxOutputTokens: 0,
      useJsonMode: false,
    };
  }

  if (entry.modelTier === 'advanced') {
    return {
      model: 'gemini-3.1-pro-preview',
      temperature: entry.slug === 'composer-translator' ? 0.4 : 0.1,
      maxOutputTokens: 4096,
      useJsonMode: true,
    };
  }

  return {
    model: 'gemini-2.5-pro',
    temperature: entry.runtimeKind === 'llm' ? 0.2 : 0.1,
    maxOutputTokens: 2048,
    useJsonMode: true,
  };
}

function permissionsFor(entry: AgentCatalogEntry) {
  if (entry.slug === 'supervisor') return SUPERVISOR_PERMS;
  if (entry.slug === 'shopify-connector') return { ...RESOLUTION_PERMS, canCallStripe: false };
  if (entry.slug === 'stripe-connector') return { ...RESOLUTION_PERMS, canCallShopify: false };
  if (entry.category === 'resolution_reconciliation' || entry.slug === 'returns-agent') return RESOLUTION_PERMS;
  if (entry.slug === 'composer-translator' || entry.slug === 'customer-communication-agent') return COMMUNICATION_PERMS;
  if (entry.runtimeKind === 'llm') return ANALYSIS_PERMS;
  return READ_ONLY_PERMS;
}

function safetyFor(entry: AgentCatalogEntry) {
  if (entry.slug === 'supervisor' || entry.slug === 'resolution-executor' || entry.slug === 'stripe-connector') {
    return CRITICAL_SAFETY;
  }
  if (entry.runtimeKind === 'llm' || entry.category === 'resolution_reconciliation') return STRICT_SAFETY;
  return STANDARD_SAFETY;
}

function capabilitiesFor(entry: AgentCatalogEntry) {
  return {
    runtimeKind: entry.runtimeKind,
    implementationMode: entry.implementationMode,
    modelTier: entry.modelTier,
    sortOrder: entry.sortOrder,
    icon: entry.icon,
    iconColor: entry.iconColor,
    triggers: entry.triggers,
    dependencies: entry.dependencies,
    ioLogic: entry.ioLogic,
  };
}

const LEGACY_AGENT_RUN_MAPPINGS = [
  { fromAgentId: 'agent_copilot', toAgentId: 'agent_composer', toVersionId: 'agent_composer_v1' },
  { fromAgentId: 'agent_refunds', toAgentId: 'agent_stripe', toVersionId: 'agent_stripe_v1' },
  { fromAgentId: 'agent_approval_gatekeeper', toAgentId: 'agent_approval_gk', toVersionId: 'agent_approval_gk_v1' },
  { fromAgentId: 'agent_qa_policy_check', toAgentId: 'agent_qa', toVersionId: 'agent_qa_v1' },
  { fromAgentId: 'agent_shopify_connector', toAgentId: 'agent_shopify', toVersionId: 'agent_shopify_v1' },
  { fromAgentId: 'agent_stripe_connector', toAgentId: 'agent_stripe', toVersionId: 'agent_stripe_v1' },
  { fromAgentId: 'agent_returns_specialist', toAgentId: 'agent_returns', toVersionId: 'agent_returns_v1' },
  { fromAgentId: 'agent_logistics_tracking', toAgentId: 'agent_logistics', toVersionId: 'agent_logistics_v1' },
];

async function repairLegacyAgentRuns() {
  for (const mapping of LEGACY_AGENT_RUN_MAPPINGS) {
    const { error } = await supabase
      .from('agent_runs')
      .update({
        agent_id: mapping.toAgentId,
        agent_version_id: mapping.toVersionId,
      })
      .eq('tenant_id', tenantId)
      .eq('agent_id', mapping.fromAgentId);

    if (error) throw error;
  }
}

async function repairLegacyModels() {
  const { data: versions, error } = await supabase
    .from('agent_versions')
    .select('id, reasoning_profile')
    .eq('tenant_id', tenantId);

  if (error) throw error;

  for (const version of versions ?? []) {
    const reasoningProfile = version.reasoning_profile;
    if (!reasoningProfile || typeof reasoningProfile !== 'object') continue;
    if ((reasoningProfile as any).model !== 'gemini-2.0-flash') continue;

    const { error: updateError } = await supabase
      .from('agent_versions')
      .update({
        reasoning_profile: {
          ...reasoningProfile,
          model: 'gemini-2.5-pro',
        },
      })
      .eq('id', version.id);

    if (updateError) throw updateError;
    console.log(`Updated legacy model for version: ${version.id}`);
  }
}

async function seed() {
  const now = new Date().toISOString();
  console.log(`Seeding ${AGENT_CATALOG.length} catalog agents to Supabase tenant ${tenantId}...`);

  for (const agent of AGENT_CATALOG) {
    const versionId = `${agent.id}_v1`;

    const { error: agentError } = await supabase.from('agents').upsert({
      id: agent.id,
      tenant_id: tenantId,
      name: agent.name,
      slug: agent.slug,
      category: agent.category,
      description: agent.description,
      is_system: Boolean(agent.isSystem),
      is_locked: Boolean(agent.isLocked),
      is_active: true,
      current_version_id: null,
      created_at: now,
      updated_at: now,
    });

    if (agentError) {
      console.error(`Error seeding agent ${agent.slug}:`, agentError);
      continue;
    }

    const { error: versionError } = await supabase.from('agent_versions').upsert({
      id: versionId,
      agent_id: agent.id,
      version_number: 1,
      status: 'published',
      rollout_percentage: 100,
      permission_profile: permissionsFor(agent),
      reasoning_profile: reasoningFor(agent),
      safety_profile: safetyFor(agent),
      knowledge_profile: { domains: agent.dependencies, retrieval: agent.runtimeKind === 'llm' },
      capabilities: capabilitiesFor(agent),
      published_by: 'catalog-seed',
      published_at: now,
      changelog: 'Catalog-aligned published profile',
      tenant_id: tenantId,
    });

    if (versionError) {
      console.error(`Error seeding version for ${agent.slug}:`, versionError);
    } else {
      const { error: activateError } = await supabase
        .from('agents')
        .update({ current_version_id: versionId, updated_at: now })
        .eq('id', agent.id)
        .eq('tenant_id', tenantId);

      if (activateError) {
        console.error(`Error activating version for ${agent.slug}:`, activateError);
        continue;
      }

      console.log(`Seeded agent: ${agent.slug}`);
    }
  }

  const catalogBySlug = new Map(AGENT_CATALOG.map((agent) => [agent.slug, agent]));
  const { data: existingAgents, error: existingError } = await supabase
    .from('agents')
    .select('id, slug, is_active')
    .eq('tenant_id', tenantId);

  if (existingError) throw existingError;

  const legacyIds = (existingAgents ?? [])
    .filter((row) => {
      const catalogAgent = catalogBySlug.get(row.slug);
      return !catalogAgent || catalogAgent.id !== row.id;
    })
    .map((row) => row.id);

  if (legacyIds.length) {
    const { error: deactivateError } = await supabase
      .from('agents')
      .update({ is_active: false, updated_at: now })
      .eq('tenant_id', tenantId)
      .in('id', legacyIds);

    if (deactivateError) throw deactivateError;
    console.log(`Marked ${legacyIds.length} legacy agent rows inactive.`);
  }

  await repairLegacyAgentRuns();
  await repairLegacyModels();

  console.log('Seed complete.');
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
