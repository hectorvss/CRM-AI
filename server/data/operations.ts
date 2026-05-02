import { getSupabaseAdmin } from '../db/supabase.js';
import { workerStatus } from '../queue/worker.js';
import { integrationRegistry } from '../integrations/registry.js';
import { redactForWorkspacePolicy } from '../services/privacyRedaction.js';

export interface OperationsScope {
  tenantId: string;
  workspaceId: string;
}

export interface OperationsRepository {
  getOverview(scope: OperationsScope): Promise<any>;
  listJobs(scope: OperationsScope, limit?: number): Promise<any[]>;
  listDeadLetterJobs(scope: OperationsScope, limit?: number): Promise<any[]>;
  getJob(scope: OperationsScope, id: string): Promise<any>;
  listWebhooks(scope: OperationsScope, limit?: number): Promise<any[]>;
  getWebhook(scope: OperationsScope, id: string): Promise<any>;
  updateWebhookStatus(scope: OperationsScope, id: string, status: string): Promise<void>;
  listCanonicalEvents(scope: OperationsScope, limit?: number): Promise<any[]>;
  listAgentRuns(scope: OperationsScope, limit?: number): Promise<any[]>;
  logAudit(scope: OperationsScope, entry: any): Promise<void>;
}

async function getOverviewSupabase(scope: OperationsScope) {
  const supabase = getSupabaseAdmin();
  const [
    { data: webhooks },
    { data: canonical },
    { count: recentRuns },
    { count: failedRuns },
    { data: jobs },
    { count: staleWebhooks }
  ] = await Promise.all([
    supabase.from('webhook_events').select('status').eq('tenant_id', scope.tenantId),
    supabase.from('canonical_events').select('status').eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId),
    supabase.from('agent_runs').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).gte('started_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
    supabase.from('agent_runs').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).eq('outcome_status', 'failed').gte('started_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
    supabase.from('jobs').select('status').eq('tenant_id', scope.tenantId).or(`workspace_id.eq.${scope.workspaceId},workspace_id.is.null`),
    supabase.from('webhook_events').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).neq('status', 'processed').lt('received_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
  ]);

  const summarize = (data: any[], key: string) => {
    const acc: Record<string, number> = {};
    for (const row of (data || [])) {
      acc[row[key]] = (acc[row[key]] || 0) + 1;
    }
    return acc;
  };

  const queueSum = summarize(jobs || [], 'status');
  const alerts: string[] = [];
  if ((queueSum['dead'] || 0) > 0) alerts.push('dead_jobs_detected');
  if ((staleWebhooks || 0) > 0) alerts.push('stale_webhooks_detected');
  if ((failedRuns || 0) > 0) alerts.push('agent_failures_detected');

  return {
    worker: workerStatus(),
    queue: queueSum,
    webhooks: summarize(webhooks || [], 'status'),
    canonical_events: summarize(canonical || [], 'status'),
    agent_runs_last_24h: recentRuns || 0,
    agent_failures_last_24h: failedRuns || 0,
    stale_webhooks: staleWebhooks || 0,
    alerts,
    integrations: {
      registered: integrationRegistry.registeredSystems(),
      health: await integrationRegistry.healthCheck(),
    },
  };
}


async function listJobsSupabase(scope: OperationsScope, limit = 100) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .or(`workspace_id.eq.${scope.workspaceId},workspace_id.is.null`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}


async function listDeadLetterJobsSupabase(scope: OperationsScope, limit = 100) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .or(`workspace_id.eq.${scope.workspaceId},workspace_id.is.null`)
    .eq('status', 'dead')
    .order('finished_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}


async function getJobSupabase(scope: OperationsScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}


async function listWebhooksSupabase(scope: OperationsScope, limit = 100) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('webhook_events')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .order('received_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}


async function getWebhookSupabase(scope: OperationsScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('webhook_events').select('*').eq('id', id).eq('tenant_id', scope.tenantId).maybeSingle();
  if (error) throw error;
  return data;
}


async function updateWebhookStatusSupabase(scope: OperationsScope, id: string, status: string) {
  const supabase = getSupabaseAdmin();
  const updates: any = { status };
  if (status === 'received') updates.processed_at = null;
  const { error } = await supabase.from('webhook_events').update(updates).eq('id', id);
  if (error) throw error;
}


async function listCanonicalEventsSupabase(scope: OperationsScope, limit = 100) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('canonical_events')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}


async function listAgentRunsSupabase(scope: OperationsScope, limit = 100) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('agent_runs')
    .select('*, agents(name, slug)')
    .eq('tenant_id', scope.tenantId)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  
  return (data || []).map(r => ({
    ...r,
    agent_name: (r.agents as any)?.name,
    agent_slug: (r.agents as any)?.slug
  }));
}


async function logAuditSupabase(scope: OperationsScope, entry: any) {
  const supabase = getSupabaseAdmin();
  const redactedEntry = await redactForWorkspacePolicy(scope, entry);
  const { error } = await supabase.from('audit_events').insert({
    id: redactedEntry.id ?? crypto.randomUUID(),
    tenant_id: scope.tenantId,
    workspace_id: scope.workspaceId,
    actor_type: redactedEntry.actorType ?? redactedEntry.actor_type ?? 'system',
    actor_id: redactedEntry.actorId ?? redactedEntry.actor_id ?? 'system',
    action: redactedEntry.action,
    entity_type: redactedEntry.entityType ?? redactedEntry.entity_type ?? null,
    entity_id: redactedEntry.entityId ?? redactedEntry.entity_id ?? null,
    old_value: redactedEntry.oldValue ?? redactedEntry.old_value ?? null,
    new_value: redactedEntry.newValue ?? redactedEntry.new_value ?? null,
    metadata: redactedEntry.metadata ?? null,
    occurred_at: redactedEntry.occurred_at ?? new Date().toISOString(),
  });
  if (error) throw error;
}


export function createOperationsRepository(): OperationsRepository {
  return {
    getOverview: getOverviewSupabase,
    listJobs: listJobsSupabase,
    listDeadLetterJobs: listDeadLetterJobsSupabase,
    getJob: getJobSupabase,
    listWebhooks: listWebhooksSupabase,
    getWebhook: getWebhookSupabase,
    updateWebhookStatus: updateWebhookStatusSupabase,
    listCanonicalEvents: listCanonicalEventsSupabase,
    listAgentRuns: listAgentRunsSupabase,
    logAudit: logAuditSupabase,
  };
}
