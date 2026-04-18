import { getDb } from '../db/client.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { parseRow } from '../db/utils.js';
import { randomUUID } from 'crypto';

export interface IntegrationScope {
  tenantId: string;
}

export interface IntegrationRepository {
  listConnectors(scope: IntegrationScope): Promise<any[]>;
  getConnector(scope: IntegrationScope, id: string): Promise<any>;
  updateConnector(scope: IntegrationScope, id: string, updates: any): Promise<any>;
  listCapabilities(scope: IntegrationScope, connectorId: string): Promise<any[]>;
  listRecentWebhooks(scope: IntegrationScope, connectorId: string, limit?: number): Promise<any[]>;
  getWebhookEvent(id: string): Promise<any | null>;
  getWebhookEventByDedupeKey(dedupeKey: string): Promise<any | null>;
  createWebhookEvent(data: any): Promise<string>;
  updateWebhookEventStatus(id: string, status: string, canonicalEventId?: string | null): Promise<void>;
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

function getConnectorSqlite(scope: IntegrationScope, id: string) {
  const db = getDb();
  return parseRow(db.prepare('SELECT * FROM connectors WHERE id = ? AND tenant_id = ?').get(id, scope.tenantId));
}

async function updateConnectorSupabase(scope: IntegrationScope, id: string, updates: any) {
  const supabase = getSupabaseAdmin();
  const allowed = ['status', 'auth_type', 'metadata', 'last_sync_at', 'last_health_check_at', 'error_message'];
  const payload = Object.fromEntries(Object.entries(updates).filter(([key]) => allowed.includes(key)));
  (payload as any).updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('connectors')
    .update(payload)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

function updateConnectorSqlite(scope: IntegrationScope, id: string, updates: any) {
  const db = getDb();
  const allowed = ['status', 'auth_type', 'metadata', 'last_sync_at', 'last_health_check_at', 'error_message'];
  const payload = Object.fromEntries(Object.entries(updates).filter(([key]) => allowed.includes(key)));
  (payload as any).updated_at = new Date().toISOString();
  const fields = Object.keys(payload);
  if (!fields.length) return getConnectorSqlite(scope, id);
  db.prepare(`UPDATE connectors SET ${fields.map((key) => `${key} = ?`).join(', ')} WHERE id = ? AND tenant_id = ?`)
    .run(...fields.map((key) => {
      const value = (payload as any)[key];
      return value && typeof value === 'object' ? JSON.stringify(value) : value;
    }), id, scope.tenantId);
  return getConnectorSqlite(scope, id);
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
    .eq('tenant_id', scope.tenantId)
    .order('received_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

function listRecentWebhooksSqlite(scope: IntegrationScope, connectorId: string, limit = 50) {
  const db = getDb();
  return db.prepare('SELECT * FROM webhook_events WHERE connector_id = ? AND tenant_id = ? ORDER BY received_at DESC LIMIT ?').all(connectorId, scope.tenantId, limit).map(parseRow);
}

async function getWebhookEventSupabase(id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('webhook_events').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

function getWebhookEventSqlite(id: string) {
  const db = getDb();
  return parseRow(db.prepare('SELECT * FROM webhook_events WHERE id = ?').get(id));
}

async function getWebhookEventByDedupeKeySupabase(dedupeKey: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('webhook_events')
    .select('*')
    .eq('dedupe_key', dedupeKey)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function getWebhookEventByDedupeKeySqlite(dedupeKey: string) {
  const db = getDb();
  return parseRow(db.prepare('SELECT * FROM webhook_events WHERE dedupe_key = ? LIMIT 1').get(dedupeKey));
}

async function resolveConnectorIdSupabase(tenantId: string, sourceSystem: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('system', sourceSystem)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

function resolveConnectorIdSqlite(tenantId: string, sourceSystem: string) {
  const db = getDb();
  const row = db.prepare('SELECT id FROM connectors WHERE tenant_id = ? AND system = ? LIMIT 1').get(tenantId, sourceSystem) as any;
  return row?.id ?? null;
}

async function createWebhookEventSupabase(data: any) {
  const supabase = getSupabaseAdmin();
  const tenantId = data.tenantId || data.tenant_id;
  const sourceSystem = data.sourceSystem || data.source_system;
  const payload = {
    id: data.id || randomUUID(),
    connector_id: data.connectorId || data.connector_id || await resolveConnectorIdSupabase(tenantId, sourceSystem),
    tenant_id: tenantId,
    source_system: sourceSystem,
    event_type: data.eventType || data.event_type,
    raw_payload: data.rawPayload || data.raw_payload || null,
    received_at: data.receivedAt || data.received_at || new Date().toISOString(),
    processed_at: data.processedAt || data.processed_at || null,
    status: data.status || 'received',
    canonical_event_id: data.canonicalEventId || data.canonical_event_id || null,
    dedupe_key: data.dedupeKey || data.dedupe_key || randomUUID(),
  };
  const { error } = await supabase.from('webhook_events').insert(payload);
  if (error) throw error;
  return payload.id;
}

function createWebhookEventSqlite(data: any) {
  const tenantId = data.tenantId || data.tenant_id;
  const sourceSystem = data.sourceSystem || data.source_system;
  const payload = {
    id: data.id || randomUUID(),
    connector_id: data.connectorId || data.connector_id || resolveConnectorIdSqlite(tenantId, sourceSystem),
    tenant_id: tenantId,
    source_system: sourceSystem,
    event_type: data.eventType || data.event_type,
    raw_payload: data.rawPayload || data.raw_payload || null,
    received_at: data.receivedAt || data.received_at || new Date().toISOString(),
    processed_at: data.processedAt || data.processed_at || null,
    status: data.status || 'received',
    canonical_event_id: data.canonicalEventId || data.canonical_event_id || null,
    dedupe_key: data.dedupeKey || data.dedupe_key || randomUUID(),
  };
  const db = getDb();
  db.prepare(`
    INSERT INTO webhook_events (
      id, connector_id, tenant_id, source_system, event_type, raw_payload,
      received_at, processed_at, status, canonical_event_id, dedupe_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.id,
    payload.connector_id,
    payload.tenant_id,
    payload.source_system,
    payload.event_type,
    payload.raw_payload,
    payload.received_at,
    payload.processed_at,
    payload.status,
    payload.canonical_event_id,
    payload.dedupe_key,
  );
  return payload.id;
}

async function updateWebhookEventStatusSupabase(id: string, status: string, canonicalEventId?: string | null) {
  const supabase = getSupabaseAdmin();
  const updates: any = { status };
  if (status === 'processed') updates.processed_at = new Date().toISOString();
  if (status === 'received') updates.processed_at = null;
  if (canonicalEventId !== undefined) updates.canonical_event_id = canonicalEventId;
  const { error } = await supabase.from('webhook_events').update(updates).eq('id', id);
  if (error) throw error;
}

function updateWebhookEventStatusSqlite(id: string, status: string, canonicalEventId?: string | null) {
  const db = getDb();
  const updates: string[] = ['status = ?'];
  const params: any[] = [status];
  if (status === 'processed') {
    updates.push('processed_at = ?');
    params.push(new Date().toISOString());
  }
  if (status === 'received') {
    updates.push('processed_at = NULL');
  }
  if (canonicalEventId !== undefined) {
    updates.push('canonical_event_id = ?');
    params.push(canonicalEventId);
  }
  params.push(id);
  db.prepare(`UPDATE webhook_events SET ${updates.join(', ')} WHERE id = ?`).run(...params);
}

export function createIntegrationRepository(): IntegrationRepository {
  if (getDatabaseProvider() === 'supabase') {
    return {
      listConnectors: listConnectorsSupabase,
      getConnector: getConnectorSupabase,
      updateConnector: updateConnectorSupabase,
      listCapabilities: listCapabilitiesSupabase,
      listRecentWebhooks: listRecentWebhooksSupabase,
      getWebhookEvent: getWebhookEventSupabase,
      getWebhookEventByDedupeKey: getWebhookEventByDedupeKeySupabase,
      createWebhookEvent: createWebhookEventSupabase,
      updateWebhookEventStatus: updateWebhookEventStatusSupabase,
    };
  }

  return {
    listConnectors: async (scope) => listConnectorsSqlite(scope),
    getConnector: async (scope, id) => getConnectorSqlite(scope, id),
    updateConnector: async (scope, id, updates) => updateConnectorSqlite(scope, id, updates),
    listCapabilities: async (scope, connectorId) => listCapabilitiesSqlite(scope, connectorId),
    listRecentWebhooks: async (scope, connectorId, limit) => listRecentWebhooksSqlite(scope, connectorId, limit),
    getWebhookEvent: async (id) => getWebhookEventSqlite(id),
    getWebhookEventByDedupeKey: async (dedupeKey) => getWebhookEventByDedupeKeySqlite(dedupeKey),
    createWebhookEvent: async (data) => createWebhookEventSqlite(data),
    updateWebhookEventStatus: async (id, status, canonicalEventId) => updateWebhookEventStatusSqlite(id, status, canonicalEventId),
  };
}
