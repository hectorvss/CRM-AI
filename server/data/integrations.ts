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
  createWebhookEvent(data: {
    id: string;
    connectorId: string;
    eventType: string;
    rawBody: string;
    headers?: string;
    status: string;
    tenantId: string;
  }): Promise<void>;
  getWebhookEvent(id: string): Promise<any>;
  updateWebhookEventStatus(id: string, status: string, canonicalEventId?: string): Promise<void>;
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

export function createIntegrationRepository(): IntegrationRepository {
  if (getDatabaseProvider() === 'supabase') {
    return {
      listConnectors: listConnectorsSupabase,
      getConnector: getConnectorSupabase,
      listCapabilities: listCapabilitiesSupabase,
      listRecentWebhooks: listRecentWebhooksSupabase,
      createWebhookEvent: async (data) => {
        const supabase = getSupabaseAdmin();
        const { error } = await supabase.from('webhook_events').insert({
          id: data.id,
          connector_id: data.connectorId,
          event_type: data.eventType,
          raw_body: data.rawBody,
          headers: data.headers ? JSON.parse(data.headers) : {},
          status: data.status,
          tenant_id: data.tenantId,
          received_at: new Date().toISOString()
        });
        if (error) throw error;
      },
      getWebhookEvent: async (id) => {
        const supabase = getSupabaseAdmin();
        const { data } = await supabase.from('webhook_events').select('*').eq('id', id).single();
        return data;
      },
      updateWebhookEventStatus: async (id, status, canonicalEventId) => {
        const supabase = getSupabaseAdmin();
        const update: any = { status, processed_at: new Date().toISOString() };
        if (canonicalEventId) update.canonical_event_id = canonicalEventId;
        const { error } = await supabase.from('webhook_events').update(update).eq('id', id);
        if (error) throw error;
      }
    };
  }

  return {
    listConnectors: async (scope) => listConnectorsSqlite(scope),
    getConnector: async (scope, id) => getConnectorSqlite(scope, id),
    listCapabilities: async (scope, connectorId) => listCapabilitiesSqlite(scope, connectorId),
    listRecentWebhooks: async (scope, connectorId, limit) => listRecentWebhooksSqlite(scope, connectorId, limit),
    createWebhookEvent: async (data) => {
      const db = getDb();
      db.prepare(`
        INSERT INTO webhook_events (id, connector_id, event_type, raw_body, headers, status, tenant_id, received_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(data.id, data.connectorId, data.eventType, data.rawBody, data.headers || '{}', data.status, data.tenantId);
    },
    getWebhookEvent: async (id) => {
      const db = getDb();
      return parseRow(db.prepare('SELECT * FROM webhook_events WHERE id = ?').get(id));
    },
    updateWebhookEventStatus: async (id, status, canonicalEventId) => {
      const db = getDb();
      if (canonicalEventId) {
        db.prepare(`
          UPDATE webhook_events SET status = ?, canonical_event_id = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(status, canonicalEventId, id);
      } else {
        db.prepare(`
          UPDATE webhook_events SET status = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(status, id);
      }
    }
  };
}
