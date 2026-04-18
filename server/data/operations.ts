import { getDb } from '../db/client.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { parseRow } from '../db/utils.js';
import { workerStatus } from '../queue/worker.js';
import { integrationRegistry } from '../integrations/registry.js';

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

function getOverviewSqlite(scope: OperationsScope) {
  const db = getDb();
  const webhookStatus = db.prepare('SELECT status, COUNT(*) as count FROM webhook_events WHERE tenant_id = ? GROUP BY status').all(scope.tenantId) as any[];
  const canonicalStatus = db.prepare('SELECT status, COUNT(*) as count FROM canonical_events WHERE tenant_id = ? AND workspace_id = ? GROUP BY status').all(scope.tenantId, scope.workspaceId) as any[];
  const recentAgentRuns = db.prepare(`SELECT COUNT(*) as count FROM agent_runs WHERE tenant_id = ? AND started_at >= datetime('now', '-24 hours')`).get(scope.tenantId) as any;
  const failedAgentRuns = db.prepare(`SELECT COUNT(*) as count FROM agent_runs WHERE tenant_id = ? AND outcome_status = 'failed' AND started_at >= datetime('now', '-24 hours')`).get(scope.tenantId) as any;
  const queueStatus = db.prepare(`SELECT status, COUNT(*) as count FROM jobs WHERE tenant_id = ? AND (workspace_id = ? OR workspace_id IS NULL) GROUP BY status`).all(scope.tenantId, scope.workspaceId) as any[];
  const staleWebhooks = db.prepare(`SELECT COUNT(*) as count FROM webhook_events WHERE tenant_id = ? AND status != 'processed' AND received_at < datetime('now', '-15 minutes')`).get(scope.tenantId) as any;

  const alerts: string[] = [];
  if (queueStatus.find(r => r.status === 'dead')?.count > 0) alerts.push('dead_jobs_detected');
  if (staleWebhooks?.count > 0) alerts.push('stale_webhooks_detected');
  if (failedAgentRuns?.count > 0) alerts.push('agent_failures_detected');

  return {
    worker: workerStatus(),
    queue: queueStatus.reduce((a, r) => ({ ...a, [r.status]: r.count }), {}),
    webhooks: webhookStatus.reduce((a, r) => ({ ...a, [r.status]: r.count }), {}),
    canonical_events: canonicalStatus.reduce((a, r) => ({ ...a, [r.status]: r.count }), {}),
    agent_runs_last_24h: recentAgentRuns?.count ?? 0,
    agent_failures_last_24h: failedAgentRuns?.count ?? 0,
    stale_webhooks: staleWebhooks?.count ?? 0,
    alerts,
    integrations: {
      registered: integrationRegistry.registeredSystems(),
      health: [] // integrationRegistry.healthCheck is async, route handles it
    }
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

function listJobsSqlite(scope: OperationsScope, limit = 100) {
  const db = getDb();
  return db.prepare(`SELECT * FROM jobs WHERE tenant_id = ? AND (workspace_id = ? OR workspace_id IS NULL) ORDER BY created_at DESC LIMIT ?`).all(scope.tenantId, scope.workspaceId, limit).map(parseRow);
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

function listDeadLetterJobsSqlite(scope: OperationsScope, limit = 100) {
  const db = getDb();
  return db.prepare(`SELECT * FROM jobs WHERE tenant_id = ? AND (workspace_id = ? OR workspace_id IS NULL) AND status = 'dead' ORDER BY finished_at DESC, created_at DESC LIMIT ?`).all(scope.tenantId, scope.workspaceId, limit).map(parseRow);
}

async function getJobSupabase(scope: OperationsScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

function getJobSqlite(scope: OperationsScope, id: string) {
  const db = getDb();
  return parseRow(db.prepare('SELECT * FROM jobs WHERE id = ?').get(id));
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

function listWebhooksSqlite(scope: OperationsScope, limit = 100) {
  const db = getDb();
  return db.prepare('SELECT * FROM webhook_events WHERE tenant_id = ? ORDER BY received_at DESC LIMIT ?').all(scope.tenantId, limit).map(parseRow);
}

async function getWebhookSupabase(scope: OperationsScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('webhook_events').select('*').eq('id', id).eq('tenant_id', scope.tenantId).maybeSingle();
  if (error) throw error;
  return data;
}

function getWebhookSqlite(scope: OperationsScope, id: string) {
  const db = getDb();
  return parseRow(db.prepare('SELECT * FROM webhook_events WHERE id = ? AND tenant_id = ?').get(id, scope.tenantId));
}

async function updateWebhookStatusSupabase(scope: OperationsScope, id: string, status: string) {
  const supabase = getSupabaseAdmin();
  const updates: any = { status };
  if (status === 'received') updates.processed_at = null;
  const { error } = await supabase.from('webhook_events').update(updates).eq('id', id);
  if (error) throw error;
}

function updateWebhookStatusSqlite(scope: OperationsScope, id: string, status: string) {
  const db = getDb();
  if (status === 'received') {
    db.prepare(`UPDATE webhook_events SET status = 'received', processed_at = NULL WHERE id = ?`).run(id);
  } else {
    db.prepare(`UPDATE webhook_events SET status = ? WHERE id = ?`).run(status, id);
  }
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

function listCanonicalEventsSqlite(scope: OperationsScope, limit = 100) {
  const db = getDb();
  return db.prepare('SELECT * FROM canonical_events WHERE tenant_id = ? AND workspace_id = ? ORDER BY occurred_at DESC, ingested_at DESC LIMIT ?').all(scope.tenantId, scope.workspaceId, limit).map(parseRow);
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

function listAgentRunsSqlite(scope: OperationsScope, limit = 100) {
  const db = getDb();
  return db.prepare(`
    SELECT ar.*, a.name as agent_name, a.slug as agent_slug
    FROM agent_runs ar
    JOIN agents a ON a.id = ar.agent_id
    WHERE ar.tenant_id = ?
    ORDER BY ar.started_at DESC
    LIMIT ?
  `).all(scope.tenantId, limit).map(parseRow);
}

export function createOperationsRepository(): OperationsRepository {
  if (getDatabaseProvider() === 'supabase') {
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
    };
  }

  return {
    getOverview: async (scope) => getOverviewSqlite(scope),
    listJobs: async (scope, limit) => listJobsSqlite(scope, limit),
    listDeadLetterJobs: async (scope, limit) => listDeadLetterJobsSqlite(scope, limit),
    getJob: async (scope, id) => getJobSqlite(scope, id),
    listWebhooks: async (scope, limit) => listWebhooksSqlite(scope, limit),
    getWebhook: async (scope, id) => getWebhookSqlite(scope, id),
    updateWebhookStatus: async (scope, id, status) => updateWebhookStatusSqlite(scope, id, status),
    listCanonicalEvents: async (scope, limit) => listCanonicalEventsSqlite(scope, limit),
    listAgentRuns: async (scope, limit) => listAgentRunsSqlite(scope, limit),
  };
}
