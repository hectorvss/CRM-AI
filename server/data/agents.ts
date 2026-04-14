import { randomUUID } from 'crypto';
import { getDb } from '../db/client.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logAudit, parseRow } from '../db/utils.js';
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

function getLatestAgentVersionSqlite(db: any, agentId: string, status?: string) {
  const clauses = ['agent_id = ?'];
  const params: any[] = [agentId];
  if (status) {
    clauses.push('status = ?');
    params.push(status);
  }
  return db.prepare(`
    SELECT *
    FROM agent_versions
    WHERE ${clauses.join(' AND ')}
    ORDER BY version_number DESC
    LIMIT 1
  `).get(...params) as any;
}

function getAgentWithVersionSqlite(db: any, agentId: string, tenantId: string) {
  let row = db.prepare(`
    SELECT a.*, av.id as version_id, av.version_number, av.status as version_status,
           av.rollout_percentage, av.permission_profile, av.reasoning_profile,
           av.safety_profile, av.knowledge_profile, av.capabilities, av.published_at
    FROM agents a
    LEFT JOIN agent_versions av ON a.current_version_id = av.id
    WHERE a.id = ? AND a.tenant_id = ?
  `).get(agentId, tenantId) as any;

  if (!row) return null;

  if (!row.version_id || row.version_status !== 'published') {
    const fallback = getLatestAgentVersionSqlite(db, agentId, 'published');
    if (fallback) {
      try {
        db.prepare('UPDATE agents SET current_version_id = ?, updated_at = ? WHERE id = ?')
          .run(fallback.id, new Date().toISOString(), agentId);
      } catch { /* non-critical */ }
      row = { ...row, ...fallback, version_id: fallback.id, version_status: fallback.status };
    }
  }

  return row;
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
  const { data: agent, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
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
    const fallback = await getLatestAgentVersionSupabase(agentId, 'published');
    if (fallback) {
      version = fallback;
      await supabase
        .from('agents')
        .update({ current_version_id: fallback.id, updated_at: new Date().toISOString() })
        .eq('id', agentId)
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

function listAgentsSqlite(scope: AgentScope) {
  const db = getDb();
  const agents = db.prepare(`
    SELECT a.*, av.version_number, av.status as version_status, av.rollout_percentage,
           av.permission_profile, av.reasoning_profile, av.safety_profile,
           av.knowledge_profile, av.capabilities
      FROM agents a
      LEFT JOIN agent_versions av ON a.current_version_id = av.id
      WHERE a.tenant_id = ?
      ORDER BY a.category, a.name
  `).all(scope.tenantId);

  const result = agents.map((a: any) => {
    const runs = db.prepare(`
      SELECT COUNT(*) as total, AVG(confidence) as avg_confidence,
             SUM(tokens_used) as total_tokens, SUM(cost_credits) as total_credits
      FROM agent_runs WHERE agent_id = ? AND tenant_id = ?
    `).get(a.id, scope.tenantId) as any;
    return enrichCatalog(a, runs);
  });

  const visible = result.filter((agent: any) => Boolean(getCatalogEntryBySlug(agent.slug)));
  visible.sort((left: any, right: any) =>
    (left.sort_order ?? 999) - (right.sort_order ?? 999) || String(left.name).localeCompare(String(right.name)),
  );
  return visible;
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

function listConnectorCapabilitiesSqlite(scope: AgentScope) {
  const db = getDb();
  return db.prepare(`
    SELECT c.system, cc.capability_key, cc.direction, cc.is_enabled, cc.requires_approval, cc.is_idempotent
    FROM connectors c
    LEFT JOIN connector_capabilities cc ON cc.connector_id = c.id
    WHERE c.tenant_id = ?
    ORDER BY c.system, cc.capability_key
  `).all(scope.tenantId).map(parseRow);
}

async function getPolicyDraftSupabase(scope: AgentScope, agentId: string) {
  const agent = await getAgentWithVersionSupabase(agentId, scope.tenantId);
  if (!agent) return null;
  const draft = await getLatestAgentVersionSupabase(agentId, 'draft');
  if (draft) return { agent_id: agent.id, bundle_status: 'draft', bundle: draft };
  if (agent.version_id) return { agent_id: agent.id, bundle_status: agent.version_status ?? 'published', bundle: parseRow(agent) };
  return { agent_id: agent.id, bundle_status: 'published', bundle: null };
}

function getPolicyDraftSqlite(scope: AgentScope, agentId: string) {
  const db = getDb();
  const agent = getAgentWithVersionSqlite(db, agentId, scope.tenantId);
  if (!agent) return null;
  const draft = getLatestAgentVersionSqlite(db, agentId, 'draft')
    ?? db.prepare('SELECT * FROM agent_versions WHERE id = ?').get(agent.current_version_id);
  return {
    agent_id: agent.id,
    bundle_status: draft?.status ?? 'published',
    bundle: parseRow(draft),
  };
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

function updatePolicyDraftSqlite(scope: AgentScope, agentId: string, payload: any) {
  const db = getDb();
  const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND tenant_id = ?').get(agentId, scope.tenantId) as any;
  if (!agent) return { error: 'not_found' as const };
  if (agent.is_locked) return { error: 'locked' as const };
  const current = agent.current_version_id ? db.prepare('SELECT * FROM agent_versions WHERE id = ?').get(agent.current_version_id) : null;
  const currentParsed = parseRow(current) as any;
  const existingDraft = getLatestAgentVersionSqlite(db, agent.id, 'draft');
  const next = computeDraftPayload(agent, existingDraft, currentParsed, payload);
  const draftId = existingDraft?.id ?? randomUUID();
  if (existingDraft) {
    db.prepare(`
      UPDATE agent_versions
      SET permission_profile = ?, reasoning_profile = ?, safety_profile = ?,
          knowledge_profile = ?, capabilities = ?, rollout_percentage = ?
      WHERE id = ?
    `).run(
      JSON.stringify(next.permission_profile),
      JSON.stringify(next.reasoning_profile),
      JSON.stringify(next.safety_profile),
      JSON.stringify(next.knowledge_profile),
      JSON.stringify(next.capabilities),
      next.rollout_percentage,
      draftId,
    );
  } else {
    db.prepare(`
      INSERT INTO agent_versions (
        id, agent_id, version_number, status, permission_profile, reasoning_profile,
        safety_profile, knowledge_profile, capabilities, rollout_percentage, tenant_id
      ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      draftId, agent.id, next.version_number,
      JSON.stringify(next.permission_profile),
      JSON.stringify(next.reasoning_profile),
      JSON.stringify(next.safety_profile),
      JSON.stringify(next.knowledge_profile),
      JSON.stringify(next.capabilities),
      next.rollout_percentage,
      agent.tenant_id,
    );
  }
  const draft = db.prepare('SELECT * FROM agent_versions WHERE id = ?').get(draftId);
  logAudit(db, {
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    actorId: scope.userId ?? 'system',
    action: 'AGENT_POLICY_DRAFT_UPDATED',
    entityType: 'agent',
    entityId: agent.id,
    newValue: parseRow(draft),
  });
  return { agent_id: agent.id, bundle_status: 'draft', bundle: parseRow(draft) };
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

function publishPolicyDraftSqlite(scope: AgentScope, agentId: string, payload: any) {
  const db = getDb();
  const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND tenant_id = ?').get(agentId, scope.tenantId) as any;
  if (!agent) return { error: 'not_found' as const };
  const draft = getLatestAgentVersionSqlite(db, agent.id, 'draft');
  if (!draft) return { error: 'no_draft' as const };
  const now = new Date().toISOString();
  if (agent.current_version_id && agent.current_version_id !== draft.id) {
    db.prepare(`UPDATE agent_versions SET status = 'archived' WHERE id = ?`).run(agent.current_version_id);
  }
  db.prepare(`UPDATE agent_versions SET status = 'published', published_by = ?, published_at = ? WHERE id = ?`)
    .run(scope.userId ?? 'system', now, draft.id);
  db.prepare(`UPDATE agents SET current_version_id = ?, updated_at = ?, is_active = ? WHERE id = ?`)
    .run(draft.id, now, typeof payload.isActive === 'boolean' ? (payload.isActive ? 1 : 0) : agent.is_active, agent.id);
  const publishedAgent = getAgentWithVersionSqlite(db, agent.id, scope.tenantId);
  logAudit(db, {
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    actorId: scope.userId ?? 'system',
    action: 'AGENT_POLICY_PUBLISHED',
    entityType: 'agent',
    entityId: agent.id,
    newValue: parseRow(draft),
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

function rollbackPolicyDraftSqlite(scope: AgentScope, agentId: string, payload: any) {
  const db = getDb();
  const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND tenant_id = ?').get(agentId, scope.tenantId) as any;
  if (!agent) return { error: 'not_found' as const };
  const target = payload?.versionId
    ? db.prepare('SELECT * FROM agent_versions WHERE id = ? AND agent_id = ?').get(payload.versionId, agent.id)
    : db.prepare(`
        SELECT * FROM agent_versions
        WHERE agent_id = ? AND status = 'published' AND id <> ?
        ORDER BY version_number DESC LIMIT 1
      `).get(agent.id, agent.current_version_id) as any;
  if (!target) return { error: 'no_target' as const };
  const now = new Date().toISOString();
  db.prepare(`UPDATE agent_versions SET status = 'archived' WHERE id = ?`).run(agent.current_version_id);
  db.prepare(`UPDATE agent_versions SET status = 'published', published_by = ?, published_at = ? WHERE id = ?`)
    .run(scope.userId ?? 'system', now, target.id);
  db.prepare(`UPDATE agents SET current_version_id = ?, updated_at = ? WHERE id = ?`).run(target.id, now, agent.id);
  logAudit(db, {
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    actorId: scope.userId ?? 'system',
    action: 'AGENT_POLICY_ROLLBACK',
    entityType: 'agent',
    entityId: agent.id,
    newValue: parseRow(target),
  });
  return { success: true, rolled_back_to: parseRow(target) };
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

function getAgentDetailSqlite(scope: AgentScope, agentId: string) {
  const db = getDb();
  const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND tenant_id = ?').get(agentId, scope.tenantId);
  if (!agent) return null;
  const versions = db.prepare('SELECT * FROM agent_versions WHERE agent_id = ? ORDER BY version_number DESC').all(agentId);
  const recentRuns = db.prepare(`
    SELECT ar.*, c.case_number
    FROM agent_runs ar LEFT JOIN cases c ON ar.case_id = c.id
    WHERE ar.agent_id = ? AND ar.tenant_id = ?
    ORDER BY ar.started_at DESC LIMIT 20
  `).all(agentId, scope.tenantId);
  return { ...(agent as any), versions, recent_runs: recentRuns.map(parseRow) };
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

function getCaseKnowledgeContextSqlite(scope: AgentScope, caseId: string) {
  const db = getDb();
  const caseRow = db.prepare(`
    SELECT c.*, cu.segment as customer_segment
    FROM cases c
    LEFT JOIN customers cu ON c.customer_id = cu.id
    WHERE c.id = ? AND c.tenant_id = ?
  `).get(caseId, scope.tenantId) as any;
  if (!caseRow) return null;
  const latestMessage = db.prepare(`
    SELECT content
    FROM messages
    WHERE case_id = ? AND tenant_id = ?
    ORDER BY sent_at DESC
    LIMIT 1
  `).get(caseId, scope.tenantId) as any;
  const conflicts = db.prepare(`
    SELECT conflict_domain
    FROM reconciliation_issues
    WHERE case_id = ? AND tenant_id = ?
    ORDER BY id DESC
    LIMIT 10
  `).all(caseId, scope.tenantId) as any[];
  const parsedCase = parseRow(caseRow) as any;
  return {
    type: parsedCase.type,
    intent: parsedCase.intent,
    tags: parsedCase.tags ?? [],
    customerSegment: parsedCase.customer_segment ?? null,
    conflictDomains: conflicts.map((item) => item.conflict_domain).filter(Boolean),
    latestMessage: latestMessage?.content ?? null,
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
  const byId = getDatabaseProvider() === 'supabase'
    ? await getAgentDetailSupabase({ tenantId: scope.tenantId, workspaceId: scope.workspaceId ?? 'ws_default' }, idOrSlug)
    : getAgentDetailSqlite({ tenantId: scope.tenantId, workspaceId: scope.workspaceId ?? 'ws_default' }, idOrSlug);
  if (byId) return byId;

  if (getDatabaseProvider() === 'supabase') {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('agents').select('*').eq('slug', idOrSlug).eq('tenant_id', scope.tenantId).maybeSingle();
    if (error) throw error;
    return data;
  }

  const db = getDb();
  const row = db.prepare('SELECT * FROM agents WHERE slug = ? AND tenant_id = ?').get(idOrSlug, scope.tenantId);
  return row ? parseRow(row) : null;
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
  if (getDatabaseProvider() === 'supabase') {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('agents').insert(payload);
    if (error) throw error;
    return payload;
  }
  const db = getDb();
  db.prepare(`
    INSERT INTO agents (id, tenant_id, name, slug, category, description, is_system, is_locked, is_active, current_version_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0, 1, NULL, ?, ?)
  `).run(id, scope.tenantId, payload.name, payload.slug, payload.category, payload.description, now, now);
  return payload;
}

async function updateAgentGeneric(scope: AgentScope, agentId: string, input: any) {
  const allowed = ['name', 'category', 'description', 'is_active', 'is_locked'];
  const updates = Object.fromEntries(Object.entries(input).filter(([key]) => allowed.includes(key)));
  if (!Object.keys(updates).length) return getAgentGeneric(scope, agentId);
  updates.updated_at = new Date().toISOString();
  if (getDatabaseProvider() === 'supabase') {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('agents').update(updates).eq('id', agentId).eq('tenant_id', scope.tenantId);
    if (error) throw error;
    return getAgentGeneric(scope, agentId);
  }
  const db = getDb();
  const fields = Object.keys(updates).map((key) => `${key} = ?`).join(', ');
  db.prepare(`UPDATE agents SET ${fields} WHERE id = ? AND tenant_id = ?`).run(...Object.values(updates), agentId, scope.tenantId);
  return getAgentGeneric(scope, agentId);
}

async function createVersionGeneric(scope: AgentScope, agentId: string, input: any) {
  const agent = await getAgentGeneric(scope, agentId);
  if (!agent) return null;
  return updatePolicyDraftSupabase
    ? (getDatabaseProvider() === 'supabase'
        ? updatePolicyDraftSupabase(scope, agentId, input)
        : updatePolicyDraftSqlite(scope, agentId, input))
    : null;
}

async function activateVersionGeneric(scope: AgentScope, agentId: string, versionId: string) {
  if (getDatabaseProvider() === 'supabase') {
    const supabase = getSupabaseAdmin();
    await supabase.from('agent_versions').update({ status: 'published', published_at: new Date().toISOString(), published_by: scope.userId ?? 'system' }).eq('id', versionId).eq('agent_id', agentId);
    await supabase.from('agents').update({ current_version_id: versionId, updated_at: new Date().toISOString() }).eq('id', agentId).eq('tenant_id', scope.tenantId);
    return;
  }
  const db = getDb();
  db.prepare("UPDATE agent_versions SET status = 'published', published_at = ?, published_by = ? WHERE id = ? AND agent_id = ?")
    .run(new Date().toISOString(), scope.userId ?? 'system', versionId, agentId);
  db.prepare('UPDATE agents SET current_version_id = ?, updated_at = ? WHERE id = ? AND tenant_id = ?')
    .run(versionId, new Date().toISOString(), agentId, scope.tenantId);
}

async function getRunGeneric(scope: Partial<AgentScope> & { tenantId: string }, runId: string) {
  if (getDatabaseProvider() === 'supabase') {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('agent_runs').select('*').eq('id', runId).eq('tenant_id', scope.tenantId).maybeSingle();
    if (error) throw error;
    return data;
  }
  const db = getDb();
  const row = db.prepare('SELECT * FROM agent_runs WHERE id = ? AND tenant_id = ?').get(runId, scope.tenantId);
  return row ? parseRow(row) : null;
}

export function createAgentRepository(): AgentRepository {
  if (getDatabaseProvider() === 'supabase') {
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

  return {
    list: async (scope) => listAgentsSqlite(scope),
    listAgents: async (scope) => listAgentsSqlite({ tenantId: scope.tenantId, workspaceId: scope.workspaceId ?? 'ws_default' }),
    getAgent: getAgentGeneric,
    createAgent: createAgentGeneric,
    updateAgent: updateAgentGeneric,
    createVersion: createVersionGeneric,
    activateVersion: activateVersionGeneric,
    getRun: getRunGeneric,
    getPolicyDraft: async (scope, agentId) => getPolicyDraftSqlite(scope, agentId),
    updatePolicyDraft: async (scope, agentId, payload) => updatePolicyDraftSqlite(scope, agentId, payload),
    publishPolicyDraft: async (scope, agentId, payload) => publishPolicyDraftSqlite(scope, agentId, payload),
    rollbackPolicyDraft: async (scope, agentId, payload) => rollbackPolicyDraftSqlite(scope, agentId, payload),
    getEffectiveAgent: async (scope, agentId) => {
      const db = getDb();
      return getAgentWithVersionSqlite(db, agentId, scope.tenantId);
    },
    listConnectorCapabilities: async (scope) => listConnectorCapabilitiesSqlite(scope),
    getDetail: async (scope, agentId) => getAgentDetailSqlite(scope, agentId),
    getCaseKnowledgeContext: async (scope, caseId) => getCaseKnowledgeContextSqlite(scope, caseId),
  };
}
