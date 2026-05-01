import { getDb } from '../db/client.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { parseRow } from '../db/utils.js';

export interface IntegrationScope {
  tenantId: string;
}

export interface IntegrationRepository {
  listConnectors(scope: IntegrationScope): Promise<any[]>;
  getConnector(scope: IntegrationScope, id: string): Promise<any>;
  listCapabilities(scope: IntegrationScope, connectorId: string): Promise<any[]>;
  listRecentWebhooks(scope: IntegrationScope, connectorId: string, limit?: number): Promise<any[]>;
  getWebhookEvent(scope: IntegrationScope, id: string): Promise<any | null>;
  getWebhookEventByDedupeKey(scope: IntegrationScope, dedupeKey: string): Promise<any | null>;
  createWebhookEvent(scope: IntegrationScope, data: any): Promise<any>;
  updateWebhookEventStatus(scope: IntegrationScope, id: string, status: string, updates?: any): Promise<void>;
  updateCanonicalEvent(id: string, updates: any): Promise<void>;
  updateConnector(scope: IntegrationScope, id: string, updates: any): Promise<void>;
  deleteConnector(scope: IntegrationScope, id: string): Promise<void>;
}

async function listConnectorsSupabase(scope: IntegrationScope) {
  const supabase = getSupabaseAdmin();
  const { data: connectors, error } = await supabase
    .from('connectors')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .order('system');
  if (error) throw error;

  const connectorIds = (connectors || []).map(c => c.id);
  if (!connectorIds.length) return [];

  const { data: caps, error: capsError } = await supabase
    .from('connector_capabilities')
    .select('*')
    .in('connector_id', connectorIds);
  if (capsError) throw capsError;

  return (connectors || []).map(c => ({
    ...c,
    connector_capabilities: (caps || []).filter(cap => cap.connector_id === c.id)
  }));
}

function listConnectorsSqlite(scope: IntegrationScope) {
  const db = getDb();
  const connectors = db.prepare('SELECT * FROM connectors WHERE tenant_id = ? ORDER BY system').all(scope.tenantId);
  return connectors.map((c: any) => {
    const caps = db.prepare('SELECT * FROM connector_capabilities WHERE connector_id = ?').all(c.id).map(parseRow);
    return { ...parseRow(c), connector_capabilities: caps };
  });
}

async function getConnectorSupabase(scope: IntegrationScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function updateConnectorSupabase(scope: IntegrationScope, id: string, updates: any) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', scope.tenantId);
  if (error) throw error;
}

async function deleteConnectorSupabase(scope: IntegrationScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId);
  if (error) throw error;
}

function getConnectorSqlite(scope: IntegrationScope, id: string) {
  const db = getDb();
  return parseRow(db.prepare('SELECT * FROM connectors WHERE id = ? AND tenant_id = ?').get(id, scope.tenantId));
}

function updateConnectorSqlite(scope: IntegrationScope, id: string, updates: any) {
  const db = getDb();
  const payload = { ...updates, updated_at: new Date().toISOString() };
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
  const fields = Object.keys(payload);
  db.prepare(`UPDATE connectors SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ? AND tenant_id = ?`)
    .run(...Object.values(payload).map((value) => value && typeof value === 'object' ? JSON.stringify(value) : value), id, scope.tenantId);
}

function deleteConnectorSqlite(scope: IntegrationScope, id: string) {
  const db = getDb();
  db.prepare('DELETE FROM connectors WHERE id = ? AND tenant_id = ?').run(id, scope.tenantId);
}

async function listCapabilitiesSupabase(scope: IntegrationScope, connectorId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connector_capabilities')
    .select('*')
    .eq('connector_id', connectorId);
  if (error) throw error;
  return data || [];
}

function listCapabilitiesSqlite(scope: IntegrationScope, connectorId: string) {
  const db = getDb();
  return db.prepare('SELECT * FROM connector_capabilities WHERE connector_id = ?').all(connectorId).map(parseRow);
}

async function listRecentWebhooksSupabase(scope: IntegrationScope, connectorId: string, limit = 50) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('webhook_events')
    .select('*')
    .eq('connector_id', connectorId)
    .order('received_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

function listRecentWebhooksSqlite(scope: IntegrationScope, connectorId: string, limit = 50) {
  const db = getDb();
  return db.prepare('SELECT * FROM webhook_events WHERE connector_id = ? ORDER BY received_at DESC LIMIT ?').all(connectorId, limit).map(parseRow);
}

async function getWebhookEventSupabase(scope: IntegrationScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('webhook_events').select('*').eq('id', id).eq('tenant_id', scope.tenantId).maybeSingle();
  if (error) throw error;
  return data;
}

async function getWebhookEventByDedupeKeySupabase(scope: IntegrationScope, dedupeKey: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('webhook_events').select('*').eq('dedupe_key', dedupeKey).eq('tenant_id', scope.tenantId).maybeSingle();
  if (error) throw error;
  return data;
}

async function createWebhookEventSupabase(scope: IntegrationScope, data: any) {
  const supabase = getSupabaseAdmin();
  const payload = {
    id: data.id ?? crypto.randomUUID(),
    connector_id: data.connector_id ?? data.connectorId ?? null,
    source_system: data.source_system ?? data.sourceSystem,
    event_type: data.event_type ?? data.eventType,
    raw_payload: data.raw_payload ?? data.rawPayload,
    dedupe_key: data.dedupe_key ?? data.dedupeKey,
    tenant_id: scope.tenantId,
    received_at: data.received_at ?? new Date().toISOString(),
    status: data.status ?? 'received',
  };
  const { error } = await supabase.from('webhook_events').insert(payload);
  if (error) throw error;
  return payload;
}

async function updateWebhookEventStatusSupabase(scope: IntegrationScope, id: string, status: string, updates: any = {}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('webhook_events').update({
    ...updates,
    status,
    processed_at: ['processed', 'failed'].includes(status) ? new Date().toISOString() : updates.processed_at,
  }).eq('id', id).eq('tenant_id', scope.tenantId);
  if (error) throw error;
}

async function getCanonicalEventSupabase(id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('canonical_events').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function createCanonicalEventSupabase(scope: IntegrationScope, data: any) {
  const supabase = getSupabaseAdmin();
  const payload = {
    id: data.id ?? crypto.randomUUID(),
    source_system: data.source_system ?? data.sourceSystem,
    source_entity_type: data.source_entity_type ?? data.sourceEntityType,
    source_entity_id: data.source_entity_id ?? data.sourceEntityId,
    event_type: data.event_type ?? data.eventType,
    event_category: data.event_category ?? data.eventCategory ?? null,
    canonical_entity_type: data.canonical_entity_type ?? data.canonicalEntityType,
    canonical_entity_id: data.canonical_entity_id ?? data.canonicalEntityId,
    normalized_payload: data.normalized_payload ?? data.normalizedPayload ?? {},
    dedupe_key: data.dedupe_key ?? data.dedupeKey,
    case_id: data.case_id ?? data.caseId ?? null,
    workspace_id: data.workspace_id ?? data.workspaceId ?? null,
    tenant_id: scope.tenantId,
    occurred_at: data.occurred_at ?? new Date().toISOString(),
    ingested_at: data.ingested_at ?? new Date().toISOString(),
    updated_at: data.updated_at ?? new Date().toISOString(),
    status: data.status ?? 'received',
  };
  const { error } = await supabase.from('canonical_events').insert(payload);
  if (error) throw error;
  return payload;
}

async function updateCanonicalEventSupabase(id: string, updates: any) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('canonical_events').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

function getWebhookEventSqlite(scope: IntegrationScope, id: string) {
  const db = getDb();
  return parseRow(db.prepare('SELECT * FROM webhook_events WHERE id = ? AND tenant_id = ?').get(id, scope.tenantId));
}

function getWebhookEventByDedupeKeySqlite(scope: IntegrationScope, dedupeKey: string) {
  const db = getDb();
  return parseRow(db.prepare('SELECT * FROM webhook_events WHERE dedupe_key = ? AND tenant_id = ?').get(dedupeKey, scope.tenantId));
}

function createWebhookEventSqlite(scope: IntegrationScope, data: any) {
  const db = getDb();
  const payload = {
    id: data.id ?? crypto.randomUUID(),
    connector_id: data.connector_id ?? data.connectorId ?? null,
    source_system: data.source_system ?? data.sourceSystem,
    event_type: data.event_type ?? data.eventType,
    raw_payload: data.raw_payload ?? data.rawPayload,
    dedupe_key: data.dedupe_key ?? data.dedupeKey,
    tenant_id: scope.tenantId,
    received_at: data.received_at ?? new Date().toISOString(),
    status: data.status ?? 'received',
  };
  const fields = Object.keys(payload);
  db.prepare(`INSERT INTO webhook_events (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`)
    .run(...Object.values(payload).map((value) => value && typeof value === 'object' ? JSON.stringify(value) : value));
  return payload;
}

function updateWebhookEventStatusSqlite(scope: IntegrationScope, id: string, status: string, updates: any = {}) {
  const db = getDb();
  const payload = { ...updates, status, processed_at: ['processed', 'failed'].includes(status) ? new Date().toISOString() : updates.processed_at };
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
  const fields = Object.keys(payload);
  db.prepare(`UPDATE webhook_events SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ? AND tenant_id = ?`)
    .run(...Object.values(payload).map((value) => value && typeof value === 'object' ? JSON.stringify(value) : value), id, scope.tenantId);
}

function getCanonicalEventSqlite(id: string) {
  const db = getDb();
  return parseRow(db.prepare('SELECT * FROM canonical_events WHERE id = ?').get(id));
}

function createCanonicalEventSqlite(scope: IntegrationScope, data: any) {
  const db = getDb();
  const payload = {
    id: data.id ?? crypto.randomUUID(),
    source_system: data.source_system ?? data.sourceSystem,
    source_entity_type: data.source_entity_type ?? data.sourceEntityType,
    source_entity_id: data.source_entity_id ?? data.sourceEntityId,
    event_type: data.event_type ?? data.eventType,
    event_category: data.event_category ?? data.eventCategory ?? null,
    canonical_entity_type: data.canonical_entity_type ?? data.canonicalEntityType,
    canonical_entity_id: data.canonical_entity_id ?? data.canonicalEntityId,
    normalized_payload: data.normalized_payload ?? data.normalizedPayload ?? {},
    dedupe_key: data.dedupe_key ?? data.dedupeKey,
    case_id: data.case_id ?? data.caseId ?? null,
    workspace_id: data.workspace_id ?? data.workspaceId ?? null,
    tenant_id: scope.tenantId,
    occurred_at: data.occurred_at ?? new Date().toISOString(),
    ingested_at: data.ingested_at ?? new Date().toISOString(),
    updated_at: data.updated_at ?? new Date().toISOString(),
    status: data.status ?? 'received',
  };
  const fields = Object.keys(payload);
  db.prepare(`INSERT INTO canonical_events (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`)
    .run(...Object.values(payload).map((value) => value && typeof value === 'object' ? JSON.stringify(value) : value));
  return payload;
}

function updateCanonicalEventSqlite(id: string, updates: any) {
  const db = getDb();
  const payload = { ...updates, updated_at: new Date().toISOString() };
  const fields = Object.keys(payload);
  db.prepare(`UPDATE canonical_events SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`)
    .run(...Object.values(payload).map((value) => value && typeof value === 'object' ? JSON.stringify(value) : value), id);
}

export function createIntegrationRepository(): IntegrationRepository {
  if (getDatabaseProvider() === 'supabase') {
    return {
      listConnectors: listConnectorsSupabase,
      getConnector: getConnectorSupabase,
      listCapabilities: listCapabilitiesSupabase,
      listRecentWebhooks: listRecentWebhooksSupabase,
      getWebhookEvent: getWebhookEventSupabase,
      getWebhookEventByDedupeKey: getWebhookEventByDedupeKeySupabase,
      createWebhookEvent: createWebhookEventSupabase,
      updateWebhookEventStatus: updateWebhookEventStatusSupabase,
      getCanonicalEvent: getCanonicalEventSupabase,
      createCanonicalEvent: createCanonicalEventSupabase,
      updateCanonicalEvent: updateCanonicalEventSupabase,
      updateConnector: updateConnectorSupabase,
      deleteConnector: deleteConnectorSupabase,
    };
  }

  return {
    listConnectors: async (scope) => listConnectorsSqlite(scope),
    getConnector: async (scope, id) => getConnectorSqlite(scope, id),
    listCapabilities: async (scope, connectorId) => listCapabilitiesSqlite(scope, connectorId),
    listRecentWebhooks: async (scope, connectorId, limit) => listRecentWebhooksSqlite(scope, connectorId, limit),
    getWebhookEvent: async (scope, id) => getWebhookEventSqlite(scope, id),
    getWebhookEventByDedupeKey: async (scope, dedupeKey) => getWebhookEventByDedupeKeySqlite(scope, dedupeKey),
    createWebhookEvent: async (scope, data) => createWebhookEventSqlite(scope, data),
    updateWebhookEventStatus: async (scope, id, status, updates) => updateWebhookEventStatusSqlite(scope, id, status, updates),
    getCanonicalEvent: async (id) => getCanonicalEventSqlite(id),
    createCanonicalEvent: async (scope, data) => createCanonicalEventSqlite(scope, data),
    updateCanonicalEvent: async (id, updates) => updateCanonicalEventSqlite(id, updates),
    updateConnector: async (scope, id, updates) => updateConnectorSqlite(scope, id, updates),
    deleteConnector: async (scope, id) => deleteConnectorSqlite(scope, id),
  };
}
