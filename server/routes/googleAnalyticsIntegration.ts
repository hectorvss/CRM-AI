/**
 * server/routes/googleAnalyticsIntegration.ts
 *
 * GA4 Measurement Protocol integration router.
 * system='ga' on connectors. Auth via measurement_id + api_secret (no OAuth).
 */

import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { GoogleAnalyticsAdapter } from '../integrations/google-analytics.js';
import { gaForTenant, invalidateGAForTenant } from '../integrations/google-analytics-tenant.js';

export const googleAnalyticsIntegrationRouter = Router();

// ── POST /connect ──────────────────────────────────────────────────────────

googleAnalyticsIntegrationRouter.post('/connect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const measurementId = String(req.body?.measurement_id || '').trim();
  const apiSecret = String(req.body?.api_secret || '').trim();

  if (!measurementId) return res.status(400).json({ error: 'measurement_id required (format: G-XXXXXXXXXX)' });
  if (!measurementId.startsWith('G-')) return res.status(400).json({ error: 'measurement_id must start with "G-"' });
  if (!apiSecret) return res.status(400).json({ error: 'api_secret required' });

  // Ping the GA4 debug endpoint to verify credentials.
  // GA debug endpoint can be intermittent -- a non-ok ping is a warning, not a hard failure.
  const adapter = new GoogleAnalyticsAdapter({ measurementId, apiSecret });
  let pingResult: { ok: boolean; validationMessages?: any[]; error?: string } = { ok: false };
  let pingWarning: string | null = null;
  try {
    pingResult = await adapter.ping();
    if (!pingResult.ok) {
      pingWarning = pingResult.error ?? 'GA4 debug endpoint returned a non-ok response';
      logger.warn('GA4 ping returned non-ok (will still persist connector)', { tenantId: req.tenantId, error: pingWarning });
    }
  } catch (err: any) {
    pingWarning = String(err?.message ?? err);
    logger.warn('GA4 ping threw (will still persist connector)', { tenantId: req.tenantId, error: pingWarning });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `ga::${req.tenantId}::${measurementId}`;

  const authConfig = {
    measurement_id: measurementId,
    api_secret: apiSecret,
    ping_ok: pingResult.ok,
    ping_warning: pingWarning,
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: req.tenantId,
    system: 'ga',
    name: measurementId,
    status: 'connected',
    auth_type: 'api_key',
    auth_config: authConfig,
    capabilities: {
      sends: ['events', 'conversation_started', 'conversation_resolved', 'widget_opened', 'csat_submitted'],
      protocol: 'measurement_protocol_v2',
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });
  if (error) return res.status(500).json({ error: error.message });

  invalidateGAForTenant(req.tenantId, req.workspaceId ?? null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: req.tenantId,
    workspace_id: req.workspaceId ?? req.tenantId,
    actor_id: req.userId,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'ga', measurement_id: measurementId, ping_ok: pingResult.ok },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.json({
    ok: true,
    measurement_id: measurementId,
    ping_ok: pingResult.ok,
    ping_warning: pingWarning,
  });
});

// ── POST /disconnect ───────────────────────────────────────────────────────

googleAnalyticsIntegrationRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'ga');
  if (error) return res.status(500).json({ error: error.message });
  invalidateGAForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

// ── GET /status ────────────────────────────────────────────────────────────

googleAnalyticsIntegrationRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'ga')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    measurement_id: cfg.measurement_id ?? null,
    ping_ok: cfg.ping_ok ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

// ── POST /events -- track arbitrary event ─────────────────────────────────

googleAnalyticsIntegrationRouter.post('/events', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await gaForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Google Analytics not connected' });

  const clientId = String(req.body?.client_id || '').trim();
  const userId = req.body?.user_id ? String(req.body.user_id).trim() : undefined;
  const event = req.body?.event as { name?: string; params?: Record<string, string | number | boolean> } | undefined;
  const userProperties = req.body?.user_properties as Record<string, { value: string | number }> | undefined;

  if (!clientId) return res.status(400).json({ error: 'client_id required' });
  if (!event?.name) return res.status(400).json({ error: 'event.name required' });

  try {
    const result = await resolved.adapter.track(
      { name: event.name, params: event.params },
      { clientId, userId, userProperties },
    );
    return res.json({ ok: true, result });
  } catch (err: any) {
    logger.warn('GA4 track failed', { tenantId: req.tenantId, error: String(err) });
    return res.status(502).json({ error: 'GA4 event failed', details: String(err?.message ?? err) });
  }
});

// ── POST /conversation-started ─────────────────────────────────────────────

googleAnalyticsIntegrationRouter.post('/conversation-started', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await gaForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Google Analytics not connected' });

  const clientId = String(req.body?.client_id || '').trim();
  const conversationId = String(req.body?.conversation_id || '').trim();
  const channel = String(req.body?.channel || '').trim();
  const userId = req.body?.user_id ? String(req.body.user_id).trim() : undefined;

  if (!clientId) return res.status(400).json({ error: 'client_id required' });
  if (!conversationId) return res.status(400).json({ error: 'conversation_id required' });
  if (!channel) return res.status(400).json({ error: 'channel required' });

  try {
    const result = await resolved.adapter.conversationStarted({ clientId, userId, conversationId, channel });
    return res.json({ ok: true, result });
  } catch (err: any) {
    logger.warn('GA4 conversationStarted failed', { tenantId: req.tenantId, error: String(err) });
    return res.status(502).json({ error: 'GA4 event failed', details: String(err?.message ?? err) });
  }
});

// ── POST /conversation-resolved ────────────────────────────────────────────

googleAnalyticsIntegrationRouter.post('/conversation-resolved', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await gaForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Google Analytics not connected' });

  const clientId = String(req.body?.client_id || '').trim();
  const conversationId = String(req.body?.conversation_id || '').trim();
  const resolutionTimeMs = Number(req.body?.resolution_time_ms ?? 0);
  const agentId = req.body?.agent_id ? String(req.body.agent_id).trim() : undefined;
  const userId = req.body?.user_id ? String(req.body.user_id).trim() : undefined;

  if (!clientId) return res.status(400).json({ error: 'client_id required' });
  if (!conversationId) return res.status(400).json({ error: 'conversation_id required' });

  try {
    const result = await resolved.adapter.conversationResolved({ clientId, userId, conversationId, resolutionTimeMs, agentId });
    return res.json({ ok: true, result });
  } catch (err: any) {
    logger.warn('GA4 conversationResolved failed', { tenantId: req.tenantId, error: String(err) });
    return res.status(502).json({ error: 'GA4 event failed', details: String(err?.message ?? err) });
  }
});

// ── POST /widget-opened ────────────────────────────────────────────────────

googleAnalyticsIntegrationRouter.post('/widget-opened', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await gaForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Google Analytics not connected' });

  const clientId = String(req.body?.client_id || '').trim();
  const userId = req.body?.user_id ? String(req.body.user_id).trim() : undefined;
  const pageLocation = req.body?.page_location ? String(req.body.page_location).trim() : undefined;

  if (!clientId) return res.status(400).json({ error: 'client_id required' });

  try {
    const result = await resolved.adapter.widgetOpened({ clientId, userId, page_location: pageLocation });
    return res.json({ ok: true, result });
  } catch (err: any) {
    logger.warn('GA4 widgetOpened failed', { tenantId: req.tenantId, error: String(err) });
    return res.status(502).json({ error: 'GA4 event failed', details: String(err?.message ?? err) });
  }
});

// ── POST /csat ─────────────────────────────────────────────────────────────

googleAnalyticsIntegrationRouter.post('/csat', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await gaForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Google Analytics not connected' });

  const clientId = String(req.body?.client_id || '').trim();
  const conversationId = String(req.body?.conversation_id || '').trim();
  const score = Number(req.body?.score);
  const userId = req.body?.user_id ? String(req.body.user_id).trim() : undefined;

  if (!clientId) return res.status(400).json({ error: 'client_id required' });
  if (!conversationId) return res.status(400).json({ error: 'conversation_id required' });
  if (isNaN(score)) return res.status(400).json({ error: 'score must be a number' });

  try {
    const result = await resolved.adapter.csatSubmitted({ clientId, userId, conversationId, score });
    return res.json({ ok: true, result });
  } catch (err: any) {
    logger.warn('GA4 csatSubmitted failed', { tenantId: req.tenantId, error: String(err) });
    return res.status(502).json({ error: 'GA4 event failed', details: String(err?.message ?? err) });
  }
});
