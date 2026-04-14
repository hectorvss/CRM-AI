import { randomUUID } from 'crypto';
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
  updateConnector(scope: IntegrationScope, id: string, updates: any): Promise<any>;
  testConnector(scope: IntegrationScope, id: string): Promise<any>;
  listCapabilities(scope: IntegrationScope, connectorId: string): Promise<any[]>;
  listRecentWebhooks(scope: IntegrationScope, connectorId: string, limit?: number): Promise<any[]>;
  getWebhookEventByDedupeKey(dedupeKey: string): Promise<any>;
  createWebhookEvent(data: {
    id: string;
    tenantId: string;
    sourceSystem: string;
    eventType: string;
    rawPayload: string;
    status: string;
    dedupeKey: string;
    connectorId?: string;
  }): Promise<void>;
  getWebhookEvent(id: string): Promise<any>;
  updateWebhookEventStatus(id: string, status: string, canonicalEventId?: string): Promise<void>;
  
  // Canonical Events
  getCanonicalEvent(id: string): Promise<any>;
  updateCanonicalEvent(id: string, updates: any): Promise<void>;
  createCanonicalEvent(data: any): Promise<void>;
  getCanonicalEventByDedupeKey(dedupeKey: string): Promise<any>;
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

export function createIntegrationRepository(): IntegrationRepository {
  if (getDatabaseProvider() === 'supabase') {
    return {
      listConnectors: listConnectorsSupabase,
      getConnector: async (scope, id) => {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.from('connectors').select('*').eq('id', id).eq('tenant_id', scope.tenantId).maybeSingle();
        if (error) throw error;
        return data;
      },
      updateConnector: async (scope, id, updates) => {
        const supabase = getSupabaseAdmin();
        const payload: any = { updated_at: new Date().toISOString() };
        if (updates.name !== undefined) payload.name = updates.name;
        if (updates.status !== undefined) payload.status = updates.status;
        if (updates.auth_config !== undefined) payload.auth_config = updates.auth_config;
        if (updates.last_health_check_at !== undefined) payload.last_health_check_at = updates.last_health_check_at;
        const { data, error } = await supabase
          .from('connectors')
          .update(payload)
          .eq('id', id)
          .eq('tenant_id', scope.tenantId)
          .select('*')
          .maybeSingle();
        if (error) throw error;
        return data;
      },
      testConnector: async (scope, id) => {
        const connector = await (async () => {
          const supabase = getSupabaseAdmin();
          const { data, error } = await supabase.from('connectors').select('*').eq('id', id).eq('tenant_id', scope.tenantId).maybeSingle();
          if (error) throw error;
          return data;
        })();
        if (!connector) return null;
        const now = new Date().toISOString();
        const nextStatus = connector.status === 'disconnected' ? 'disconnected' : 'healthy';
        const updated = await (async () => {
          const supabase = getSupabaseAdmin();
          const { data, error } = await supabase
            .from('connectors')
            .update({ status: nextStatus, last_health_check_at: now, updated_at: now })
            .eq('id', id)
            .eq('tenant_id', scope.tenantId)
            .select('*')
            .maybeSingle();
          if (error) throw error;
          return data;
        })();
        return {
          ok: nextStatus === 'healthy',
          connector: updated,
          checked_at: now,
          message: nextStatus === 'healthy' ? 'Connector health check passed.' : 'Connector remains disconnected.',
        };
      },
      listCapabilities: async (scope, connectorId) => {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.from('connector_capabilities').select('*').eq('connector_id', connectorId);
        if (error) throw error;
        return data || [];
      },
      listRecentWebhooks: async (scope, connectorId, limit) => {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase.from('webhook_events').select('*').eq('connector_id', connectorId).order('received_at', { ascending: false }).limit(limit ?? 50);
        if (error) throw error;
        return data || [];
      },
      getWebhookEventByDedupeKey: async (dedupeKey) => {
        const supabase = getSupabaseAdmin();
        const { data } = await supabase.from('webhook_events').select('*').eq('dedupe_key', dedupeKey).maybeSingle();
        return data;
      },
      createWebhookEvent: async (data) => {
        const supabase = getSupabaseAdmin();
        const { error } = await supabase.from('webhook_events').insert({
          id: data.id,
          connector_id: data.connectorId,
          source_system: data.sourceSystem,
          event_type: data.eventType,
          raw_payload: data.rawPayload,
          status: data.status,
          tenant_id: data.tenantId,
          dedupe_key: data.dedupeKey,
          received_at: new Date().toISOString()
        });
        if (error) throw error;
      },
      getWebhookEvent: async (id) => {
        const supabase = getSupabaseAdmin();
        const { data } = await supabase.from('webhook_events').select('*').eq('id', id).maybeSingle();
        return data;
      },
      updateWebhookEventStatus: async (id, status, canonicalEventId) => {
        const supabase = getSupabaseAdmin();
        const update: any = { status, processed_at: new Date().toISOString() };
        if (canonicalEventId) update.canonical_event_id = canonicalEventId;
        const { error } = await supabase.from('webhook_events').update(update).eq('id', id);
        if (error) throw error;
      },
      getCanonicalEvent: async (id) => {
        const supabase = getSupabaseAdmin();
        const { data } = await supabase.from('canonical_events').select('*').eq('id', id).maybeSingle();
        return data;
      },
      updateCanonicalEvent: async (id, updates) => {
        const supabase = getSupabaseAdmin();
        const { error } = await supabase.from('canonical_events').update(updates).eq('id', id);
        if (error) throw error;
      },
      createCanonicalEvent: async (data) => {
        const supabase = getSupabaseAdmin();
        const { error } = await supabase.from('canonical_events').insert({
          ...data,
          id: data.id || randomUUID(),
          status: data.status || 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        if (error) throw error;
      },
      getCanonicalEventByDedupeKey: async (dedupeKey) => {
        const supabase = getSupabaseAdmin();
        const { data } = await supabase.from('canonical_events').select('*').eq('dedupe_key', dedupeKey).maybeSingle();
        return data;
      }
    };
  }

  return {
    listConnectors: async (scope) => listConnectorsSqlite(scope),
    getConnector: async (scope, id) => {
      const db = getDb();
      return parseRow(db.prepare('SELECT * FROM connectors WHERE id = ? AND tenant_id = ?').get(id, scope.tenantId));
    },
    updateConnector: async (scope, id, updates) => {
      const db = getDb();
      const fields: string[] = [];
      const params: any[] = [];
      if (updates.name !== undefined) { fields.push('name = ?'); params.push(updates.name); }
      if (updates.status !== undefined) { fields.push('status = ?'); params.push(updates.status); }
      if (updates.auth_config !== undefined) { fields.push('auth_config = ?'); params.push(typeof updates.auth_config === 'string' ? updates.auth_config : JSON.stringify(updates.auth_config)); }
      if (updates.last_health_check_at !== undefined) { fields.push('last_health_check_at = ?'); params.push(updates.last_health_check_at); }
      if (fields.length === 0) {
        return parseRow(db.prepare('SELECT * FROM connectors WHERE id = ? AND tenant_id = ?').get(id, scope.tenantId));
      }
      fields.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(id, scope.tenantId);
      db.prepare(`UPDATE connectors SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`).run(...params);
      return parseRow(db.prepare('SELECT * FROM connectors WHERE id = ? AND tenant_id = ?').get(id, scope.tenantId));
    },
    testConnector: async (scope, id) => {
      const connector = await (async () => {
        const db = getDb();
        return parseRow(db.prepare('SELECT * FROM connectors WHERE id = ? AND tenant_id = ?').get(id, scope.tenantId));
      })();
      if (!connector) return null;
      const now = new Date().toISOString();
      const nextStatus = connector.status === 'disconnected' ? 'disconnected' : 'healthy';
      const db = getDb();
      db.prepare(`UPDATE connectors SET status = ?, last_health_check_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`).run(nextStatus, now, now, id, scope.tenantId);
      return {
        ok: nextStatus === 'healthy',
        connector: await (async () => parseRow(db.prepare('SELECT * FROM connectors WHERE id = ? AND tenant_id = ?').get(id, scope.tenantId)))(),
        checked_at: now,
        message: nextStatus === 'healthy' ? 'Connector health check passed.' : 'Connector remains disconnected.',
      };
    },
    listCapabilities: async (scope, connectorId) => {
      const db = getDb();
      return db.prepare('SELECT * FROM connector_capabilities WHERE connector_id = ?').all(connectorId).map(parseRow);
    },
    listRecentWebhooks: async (scope, connectorId, limit) => {
      const db = getDb();
      return db.prepare('SELECT * FROM webhook_events WHERE connector_id = ? ORDER BY received_at DESC LIMIT ?').all(connectorId, limit ?? 50).map(parseRow);
    },
    getWebhookEventByDedupeKey: async (dedupeKey) => {
      const db = getDb();
      return parseRow(db.prepare('SELECT * FROM webhook_events WHERE dedupe_key = ?').get(dedupeKey));
    },
    createWebhookEvent: async (data) => {
      const db = getDb();
      db.prepare(`
        INSERT INTO webhook_events (id, tenant_id, source_system, event_type, raw_payload, status, dedupe_key, connector_id, received_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(data.id, data.tenantId, data.sourceSystem, data.eventType, data.rawPayload, data.status, data.dedupeKey, data.connectorId || null);
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
    },
    getCanonicalEvent: async (id) => {
      const db = getDb();
      return parseRow(db.prepare('SELECT * FROM canonical_events WHERE id = ?').get(id));
    },
    updateCanonicalEvent: async (id, updates) => {
      const db = getDb();
      const fields = Object.keys(updates);
      const setClause = fields.map(f => `${f} = ?`).join(', ');
      const values = fields.map(f => {
        const val = updates[f];
        return (val && typeof val === 'object') ? JSON.stringify(val) : val;
      });
      db.prepare(`UPDATE canonical_events SET ${setClause} WHERE id = ?`).run(...values, id);
    },
    createCanonicalEvent: async (data) => {
      const db = getDb();
      const fields = Object.keys(data);
      const placeholders = fields.map(() => '?').join(', ');
      const values = fields.map(f => {
        const val = data[f];
        return (val && typeof val === 'object') ? JSON.stringify(val) : val;
      });
      db.prepare(`
        INSERT INTO canonical_events (${fields.join(', ')}, status, created_at, updated_at)
        VALUES (${placeholders}, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(...values, data.status || 'pending');
    },
    getCanonicalEventByDedupeKey: async (dedupeKey) => {
      const db = getDb();
      return parseRow(db.prepare('SELECT * FROM canonical_events WHERE dedupe_key = ?').get(dedupeKey));
    }
  };
}
