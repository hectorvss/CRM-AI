import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { parseRow } from '../db/utils.js';
import { getCatalogEntryBySlug } from '../agents/catalog.js';
import { getImplementationMode, hasAgentImpl } from '../agents/registry.js';

export interface AgentScope {
  tenantId: string;
  workspaceId: string;
  userId?: string;
}

function enrichCatalog(agent: any, metrics: any) {
  const parsed = parseRow(agent) as any;
  const catalog = getCatalogEntryBySlug(parsed.slug);
  return {
    ...parsed,
    category: catalog?.category ?? parsed.category,
    description: catalog?.description ?? parsed.description,
    icon: catalog?.icon,
    iconColor: catalog?.iconColor,
    purpose: catalog?.purpose,
    triggers: catalog?.triggers ?? [],
    dependencies: catalog?.dependencies ?? [],
    ioLogic: catalog?.ioLogic,
    has_registered_impl: hasAgentImpl(parsed.slug),
    implementation_mode: catalog?.implementationMode ?? getImplementationMode(parsed.slug),
    runtime_kind: catalog?.runtimeKind ?? parsed.capabilities?.runtime_kind ?? 'unknown',
    model_tier: catalog?.modelTier ?? parsed.capabilities?.model_tier ?? 'none',
    sort_order: catalog?.sortOrder ?? parsed.capabilities?.sort_order ?? 999,
    metrics,
  };
}

function computeDraftPayload(agent: any, existingDraft: any, currentParsed: any, payload: any) {
  return {
    permission_profile: payload.permission_profile ?? payload.permissionProfile ?? existingDraft?.permission_profile ?? currentParsed?.permission_profile ?? {},
    reasoning_profile: payload.reasoning_profile ?? payload.reasoningProfile ?? existingDraft?.reasoning_profile ?? currentParsed?.reasoning_profile ?? {},
    safety_profile: payload.safety_profile ?? payload.safetyProfile ?? existingDraft?.safety_profile ?? currentParsed?.safety_profile ?? {},
    knowledge_profile: payload.knowledge_profile ?? payload.knowledgeProfile ?? existingDraft?.knowledge_profile ?? currentParsed?.knowledge_profile ?? {},
    capabilities: payload.connector_capabilities ?? payload.capabilities ?? existingDraft?.capabilities ?? currentParsed?.capabilities ?? {},
    rollout_percentage: payload.rollout_policy?.rollout_percentage ?? payload.rolloutPercentage ?? existingDraft?.rollout_percentage ?? currentParsed?.rollout_percentage ?? 100,
    version_number: existingDraft?.version_number ?? ((currentParsed?.version_number || 0) + 1),
  };
}


async function getLatestAgentVersionSupabase(agentId: string, status?: string) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('agent_versions')
    .select('*')
    .eq('agent_id', agentId)
    .order('version_number', { ascending: false })
    .limit(1);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return data?.[0] ?? null;
}

async function getAgentWithVersionSupabase(agentId: string, tenantId: string) {
  const supabase = getSupabaseAdmin();
  let agent: any = null;
  const catalog = getCatalogEntryBySlug(agentId);
  const idCandidates = Array.from(new Set([catalog?.id, agentId].filter(Boolean))) as string[];

  for (const id of idCandidates) {
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      agent = data;
      break;
    }
  }

  if (!agent) {
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('slug', agentId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('is_system', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) throw error;
    agent = data?.[0] ?? null;
  }

  if (!agent) return null;

  let version: any = null;
  if (agent.current_version_id) {
    const { data, error: versionError } = await supabase
      .from('agent_versions')
      .select('*')
      .eq('id', agent.current_version_id)
      .maybeSingle();
    if (versionError) throw versionError;
    version = data;
  }

  if (!version || version.status !== 'published') {
    const fallback = await getLatestAgentVersionSupabase(agent.id, 'published');
    if (fallback) {
      version = fallback;
      await supabase
        .from('agents')
        .update({ current_version_id: fallback.id, updated_at: new Date().toISOString() })
        .eq('id', agent.id)
        .eq('tenant_id', tenantId);
    }
  }

  return version
    ? {
        ...agent,
        version_number: version.version_number,
        rollout_percentage: version.rollout_percentage,
        permission_profile: version.permission_profile,
        reasoning_profile: version.reasoning_profile,
        safety_profile: version.safety_profile,
        knowledge_profile: version.knowledge_profile,
        capabilities: version.capabilities,
        published_at: version.published_at,
        version_id: version.id,
        version_status: version.status,
      }
    : { ...agent, version_id: null, version_status: null };
}

async function listAgentsSupabase(scope: AgentScope) {
  const supabase = getSupabaseAdmin();
  const { data: agents, error } = await supabase
    .from('agents')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .order('category', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;

  const rows = agents ?? [];
  const currentVersionIds = Array.from(new Set(rows.map((item) => item.current_version_id).filter(Boolean)));
  const agentIds = rows.map((item) => item.id);

  const [versionsRes, metricsRes] = await Promise.all([
    currentVersionIds.length
      ? supabase.from('agent_versions').select('*').in('id', currentVersionIds)
      : Promise.resolve({ data: [], error: null } as any),
    agentIds.length
      ? supabase.from('agent_runs').select('agent_id, confidence, tokens_used, cost_credits').eq('tenant_id', scope.tenantId).in('agent_id', agentIds)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (versionsRes.error) throw versionsRes.error;
  if (metricsRes.error) throw metricsRes.error;

  const versions = new Map<string, any>((versionsRes.data ?? []).map((row: any) => [row.id, row]));
  const groupedMetrics = new Map<string, { total: number; totalConfidence: number; confidenceCount: number; total_tokens: number; total_credits: number }>();
  for (const row of metricsRes.data ?? []) {
    const current = groupedMetrics.get(row.agent_id) ?? { total: 0, totalConfidence: 0, confidenceCount: 0, total_tokens: 0, total_credits: 0 };
    current.total += 1;
    if (row.confidence !== null && row.confidence !== undefined) {
      current.totalConfidence += Number(row.confidence);
      current.confidenceCount += 1;
    }
    current.total_tokens += Number(row.tokens_used ?? 0);
    current.total_credits += Number(row.cost_credits ?? 0);
    groupedMetrics.set(row.agent_id, current);
  }

  const result = rows
    .map((agent) => {
      const version = agent.current_version_id ? versions.get(agent.current_version_id) : null;
      const metrics = groupedMetrics.get(agent.id);
      return enrichCatalog(
        version
          ? {
              ...agent,
              version_number: version.version_number,
              version_status: version.status,
              rollout_percentage: version.rollout_percentage,
              permission_profile: version.permission_profile,
              reasoning_profile: version.reasoning_profile,
              safety_profile: version.safety_profile,
              knowledge_profile: version.knowledge_profile,
              capabilities: version.capabilities,
            }
          : agent,
        metrics
          ? {
              total: metrics.total,
              avg_confidence: metrics.confidenceCount ? metrics.totalConfidence / metrics.confidenceCount : null,
              total_tokens: metrics.total_tokens,
              total_credits: metrics.total_credits,
            }
          : { total: 0, avg_confidence: null, total_tokens: 0, total_credits: 0 },
      );
    })
    .filter((agent: any) => Boolean(getCatalogEntryBySlug(agent.slug)));

  result.sort((left: any, right: any) =>
    (left.sort_order ?? 999) - (right.sort_order ?? 999) || String(left.name).localeCompare(String(right.name)),
  );

  return result;
}


async function listConnectorCapabilitiesSupabase(scope: AgentScope) {
  const supabase = getSupabaseAdmin();
  const { data: connectors, error: connectorsError } = await supabase
    .from('connectors')
    .select('id, system')
    .eq('tenant_id', scope.tenantId);
  if (connectorsError) throw connectorsError;

  if (!(connectors ?? []).length) return [];

  const connectorIds = connectors!.map((item) => item.id);
  const { data: capabilities, error } = await supabase
    .from('connector_capabilities')
    .select('*')
    .in('connector_id', connectorIds);
  if (error) throw error;

  const connectorMap = new Map<string, any>((connectors ?? []).map((row: any) => [row.id, row]));
  return (capabilities ?? []).map((item: any) => ({
    system: connectorMap.get(item.connector_id)?.system ?? null,
    capability_key: item.capability_key,
    direction: item.direction,
    is_enabled: item.is_enabled,
    requires_approval: item.requires_approval,
    is_idempotent: item.is_idempotent,
  }));
}


async function getPolicyDraftSupabase(scope: AgentScope, agentId: string) {
  const agent = await getAgentWithVersionSupabase(agentId, scope.tenantId);
  if (!agent) return null;
  const draft = await getLatestAgentVersionSupabase(agentId, 'draft');
  if (draft) return { agent_id: agent.id, bundle_status: 'draft', bundle: draft };
  if (agent.version_id) return { agent_id: agent.id, bundle_status: agent.version_status ?? 'published', bundle: parseRow(agent) };
  return { agent_id: agent.id, bundle_status: 'published', bundle: null };
}


async function updatePolicyDraftSupabase(scope: AgentScope, agentId: string, payload: any) {
  const supabase = getSupabaseAdmin();
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle();
  if (agentError) throw agentError;
  if (!agent) return { error: 'not_found' as const };
  if (agent.is_locked) return { error: 'locked' as const };

  const { data: current, error: currentError } = agent.current_version_id
    ? await supabase.from('agent_versions').select('*').eq('id', agent.current_version_id).maybeSingle()
    : ({ data: null, error: null } as any);
  if (currentError) throw currentError;
  const existingDraft = await getLatestAgentVersionSupabase(agent.id, 'draft');
  const next = computeDraftPayload(agent, existingDraft, current, payload);
  const draftId = existingDraft?.id ?? randomUUID();

  if (existingDraft) {
    const { error } = await supabase
      .from('agent_versions')
      .update({
        permission_profile: next.permission_profile,
        reasoning_profile: next.reasoning_profile,
        safety_profile: next.safety_profile,
        knowledge_profile: next.knowledge_profile,
        capabilities: next.capabilities,
        rollout_percentage: next.rollout_percentage,
      })
      .eq('id', draftId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('agent_versions')
      .insert({
        id: draftId,
        agent_id: agent.id,
        version_number: next.version_number,
        status: 'draft',
        permission_profile: next.permission_profile,
        reasoning_profile: next.reasoning_profile,
        safety_profile: next.safety_profile,
        knowledge_profile: next.knowledge_profile,
        capabilities: next.capabilities,
        rollout_percentage: next.rollout_percentage,
        tenant_id: scope.tenantId,
      });
    if (error) throw error;
  }

  const { data: draft, error: draftError } = await supabase.from('agent_versions').select('*').eq('id', draftId).maybeSingle();
  if (draftError) throw draftError;

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: scope.tenantId,
    workspace_id: scope.workspaceId,
    actor_type: 'user',
    actor_id: scope.userId ?? 'system',
    action: 'AGENT_POLICY_DRAFT_UPDATED',
    entity_type: 'agent',
    entity_id: agent.id,
    new_value: draft,
    occurred_at: new Date().toISOString(),
  });

  return { agent_id: agent.id, bundle_status: 'draft', bundle: draft };
}


async function publishPolicyDraftSupabase(scope: AgentScope, agentId: string, payload: any) {
  const supabase = getSupabaseAdmin();
  const { data: agent, error: agentError } = await supabase.from('agents').select('*').eq('id', agentId).eq('tenant_id', scope.tenantId).maybeSingle();
  if (agentError) throw agentError;
  if (!agent) return { error: 'not_found' as const };
  const draft = await getLatestAgentVersionSupabase(agent.id, 'draft');
  if (!draft) return { error: 'no_draft' as const };
  const now = new Date().toISOString();
  if (agent.current_version_id && agent.current_version_id !== draft.id) {
    await supabase.from('agent_versions').update({ status: 'archived' }).eq('id', agent.current_version_id);
  }
  const { error: publishError } = await supabase
    .from('agent_versions')
    .update({ status: 'published', published_by: scope.userId ?? 'system', published_at: now })
    .eq('id', draft.id);
  if (publishError) throw publishError;
  const { error: agentUpdateError } = await supabase
    .from('agents')
    .update({ current_version_id: draft.id, updated_at: now, is_active: typeof payload.isActive === 'boolean' ? payload.isActive : agent.is_active })
    .eq('id', agent.id)
    .eq('tenant_id', scope.tenantId);
  if (agentUpdateError) throw agentUpdateError;
  const publishedAgent = await getAgentWithVersionSupabase(agent.id, scope.tenantId);
  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: scope.tenantId,
    workspace_id: scope.workspaceId,
    actor_type: 'user',
    actor_id: scope.userId ?? 'system',
    action: 'AGENT_POLICY_PUBLISHED',
    entity_type: 'agent',
    entity_id: agent.id,
    new_value: draft,
    occurred_at: now,
  });
  return publishedAgent;
}


async function rollbackPolicyDraftSupabase(scope: AgentScope, agentId: string, payload: any) {
  const supabase = getSupabaseAdmin();
  const { data: agent, error: agentError } = await supabase.from('agents').select('*').eq('id', agentId).eq('tenant_id', scope.tenantId).maybeSingle();
  if (agentError) throw agentError;
  if (!agent) return { error: 'not_found' as const };
  let target: any = null;
  if (payload?.versionId) {
    const { data, error } = await supabase.from('agent_versions').select('*').eq('id', payload.versionId).eq('agent_id', agent.id).maybeSingle();
    if (error) throw error;
    target = data;
  } else {
    const { data, error } = await supabase
      .from('agent_versions')
      .select('*')
      .eq('agent_id', agent.id)
      .eq('status', 'published')
      .neq('id', agent.current_version_id)
      .order('version_number', { ascending: false })
      .limit(1);
    if (error) throw error;
    target = data?.[0] ?? null;
  }
  if (!target) return { error: 'no_target' as const };
  const now = new Date().toISOString();
  if (agent.current_version_id) {
    await supabase.from('agent_versions').update({ status: 'archived' }).eq('id', agent.current_version_id);
  }
  await supabase.from('agent_versions').update({ status: 'published', published_by: scope.userId ?? 'system', published_at: now }).eq('id', target.id);
  await supabase.from('agents').update({ current_version_id: target.id, updated_at: now }).eq('id', agent.id).eq('tenant_id', scope.tenantId);
  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: scope.tenantId,
    workspace_id: scope.workspaceId,
    actor_type: 'user',
    actor_id: scope.userId ?? 'system',
    action: 'AGENT_POLICY_ROLLBACK',
    entity_type: 'agent',
    entity_id: agent.id,
    new_value: target,
    occurred_at: now,
  });
  return { success: true, rolled_back_to: target };
}


async function getAgentDetailSupabase(scope: AgentScope, agentId: string) {
  const supabase = getSupabaseAdmin();
  const { data: agent, error } = await supabase.from('agents').select('*').eq('id', agentId).eq('tenant_id', scope.tenantId).maybeSingle();
  if (error) throw error;
  if (!agent) return null;
  const [versionsRes, runsRes, casesRes] = await Promise.all([
    supabase.from('agent_versions').select('*').eq('agent_id', agentId).order('version_number', { ascending: false }),
    supabase.from('agent_runs').select('*').eq('agent_id', agentId).eq('tenant_id', scope.tenantId).order('started_at', { ascending: false }).limit(20),
    supabase.from('cases').select('id, case_number').eq('tenant_id', scope.tenantId),
  ]);
  if (versionsRes.error) throw versionsRes.error;
  if (runsRes.error) throw runsRes.error;
  if (casesRes.error) throw casesRes.error;
  const caseMap = new Map<string, string>((casesRes.data ?? []).map((row: any) => [row.id, row.case_number]));
  return {
    ...agent,
    versions: versionsRes.data ?? [],
    recent_runs: (runsRes.data ?? []).map((row: any) => ({ ...row, case_number: row.case_id ? caseMap.get(row.case_id) ?? null : null })),
  };
}


async function getCaseKnowledgeContextSupabase(scope: AgentScope, caseId: string) {
  const supabase = getSupabaseAdmin();
  const { data: caseRow, error } = await supabase
    .from('cases')
    .select('*, customers(segment)')
    .eq('id', caseId)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!caseRow) return null;
  const [messageRes, conflictsRes] = await Promise.all([
    supabase.from('messages').select('content').eq('case_id', caseId).eq('tenant_id', scope.tenantId).order('sent_at', { ascending: false }).limit(1),
    supabase.from('reconciliation_issues').select('conflict_domain').eq('case_id', caseId).eq('tenant_id', scope.tenantId).order('detected_at', { ascending: false }).limit(10),
  ]);
  if (messageRes.error) throw messageRes.error;
  if (conflictsRes.error) throw conflictsRes.error;
  return {
    type: caseRow.type,
    intent: caseRow.intent,
    tags: Array.isArray(caseRow.tags) ? caseRow.tags : [],
    customerSegment: (caseRow.customers as any)?.segment ?? null,
    conflictDomains: (conflictsRes.data ?? []).map((item: any) => item.conflict_domain).filter(Boolean),
    latestMessage: messageRes.data?.[0]?.content ?? null,
  };
}


export interface AgentRepository {
  list(scope: AgentScope): Promise<any[]>;
  listAgents(scope: Partial<AgentScope> & { tenantId: string }): Promise<any[]>;
  getAgent(scope: Partial<AgentScope> & { tenantId: string }, idOrSlug: string): Promise<any | null>;
  createAgent(scope: AgentScope, input: any): Promise<any>;
  updateAgent(scope: AgentScope, agentId: string, input: any): Promise<any | null>;
  createVersion(scope: AgentScope, agentId: string, input: any): Promise<any>;
  activateVersion(scope: AgentScope, agentId: string, versionId: string): Promise<void>;
  getRun(scope: Partial<AgentScope> & { tenantId: string }, runId: string): Promise<any | null>;
  getPolicyDraft(scope: AgentScope, agentId: string): Promise<any | null>;
  updatePolicyDraft(scope: AgentScope, agentId: string, payload: any): Promise<any>;
  publishPolicyDraft(scope: AgentScope, agentId: string, payload: any): Promise<any>;
  rollbackPolicyDraft(scope: AgentScope, agentId: string, payload: any): Promise<any>;
  getEffectiveAgent(scope: AgentScope, agentId: string): Promise<any | null>;
  listConnectorCapabilities(scope: AgentScope): Promise<any[]>;
  getDetail(scope: AgentScope, agentId: string): Promise<any | null>;
  getCaseKnowledgeContext(scope: AgentScope, caseId: string): Promise<any | null>;
}

async function getAgentGeneric(scope: Partial<AgentScope> & { tenantId: string }, idOrSlug: string) {
  const byId = await getAgentDetailSupabase({ tenantId: scope.tenantId, workspaceId: scope.workspaceId ?? 'ws_default' }, idOrSlug);
  if (byId) return byId;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('agents').select('*').eq('slug', idOrSlug).eq('tenant_id', scope.tenantId).maybeSingle();
  if (error) throw error;
  return data;
}

async function createAgentGeneric(scope: AgentScope, input: any) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const payload = {
    id,
    tenant_id: scope.tenantId,
    name: input.name,
    slug: input.slug,
    category: input.category ?? 'specialist',
    description: input.description ?? null,
    is_system: false,
    is_locked: false,
    is_active: true,
    current_version_id: null,
    created_at: now,
    updated_at: now,
  };
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('agents').insert(payload);
  if (error) throw error;
  return payload;
}

async function updateAgentGeneric(scope: AgentScope, agentId: string, input: any) {
  const allowed = ['name', 'category', 'description', 'is_active', 'is_locked'];
  const updates = Object.fromEntries(Object.entries(input).filter(([key]) => allowed.includes(key)));
  if (!Object.keys(updates).length) return getAgentGeneric(scope, agentId);
  updates.updated_at = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('agents').update(updates).eq('id', agentId).eq('tenant_id', scope.tenantId);
  if (error) throw error;
  return getAgentGeneric(scope, agentId);
}

async function createVersionGeneric(scope: AgentScope, agentId: string, input: any) {
  const agent = await getAgentGeneric(scope, agentId);
  if (!agent) return null;
  return updatePolicyDraftSupabase(scope, agentId, input);
}

async function activateVersionGeneric(scope: AgentScope, agentId: string, versionId: string) {
  const supabase = getSupabaseAdmin();
  await supabase.from('agent_versions').update({ status: 'published', published_at: new Date().toISOString(), published_by: scope.userId ?? 'system' }).eq('id', versionId).eq('agent_id', agentId);
  await supabase.from('agents').update({ current_version_id: versionId, updated_at: new Date().toISOString() }).eq('id', agentId).eq('tenant_id', scope.tenantId);
}

async function getRunGeneric(scope: Partial<AgentScope> & { tenantId: string }, runId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('agent_runs').select('*').eq('id', runId).eq('tenant_id', scope.tenantId).maybeSingle();
  if (error) throw error;
  return data;
}

export function createAgentRepository(): AgentRepository {
  return {
    list: listAgentsSupabase,
    listAgents: (scope) => listAgentsSupabase({ tenantId: scope.tenantId, workspaceId: scope.workspaceId ?? 'ws_default' }),
    getAgent: getAgentGeneric,
    createAgent: createAgentGeneric,
    updateAgent: updateAgentGeneric,
    createVersion: createVersionGeneric,
    activateVersion: activateVersionGeneric,
    getRun: getRunGeneric,
    getPolicyDraft: getPolicyDraftSupabase,
    updatePolicyDraft: updatePolicyDraftSupabase,
    publishPolicyDraft: publishPolicyDraftSupabase,
    rollbackPolicyDraft: rollbackPolicyDraftSupabase,
    getEffectiveAgent: (scope, agentId) => getAgentWithVersionSupabase(agentId, scope.tenantId),
    listConnectorCapabilities: listConnectorCapabilitiesSupabase,
    getDetail: getAgentDetailSupabase,
    getCaseKnowledgeContext: getCaseKnowledgeContextSupabase,
  };
}
