import { getSupabaseAdmin } from '../db/supabase.js';

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

async function listCapabilitiesSupabase(scope: IntegrationScope, connectorId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connector_capabilities')
    .select('*')
    .eq('connector_id', connectorId);
  if (error) throw error;
  return data || [];
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

export function createIntegrationRepository(): IntegrationRepository {
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
