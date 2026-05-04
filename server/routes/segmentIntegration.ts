/**
 * server/routes/segmentIntegration.ts
 *
 * Segment uses a Source Write Key (HTTP Basic). No OAuth flow.
 *
 *   POST /api/integrations/segment/connect     — save write key + workspace metadata
 *   POST /api/integrations/segment/disconnect
 *   GET  /api/integrations/segment/status
 *   POST /api/integrations/segment/sync         — health check via identify(healthcheck)
 *   POST /api/integrations/segment/identify     — emit identify event
 *   POST /api/integrations/segment/track        — emit track event
 *   POST /api/integrations/segment/batch        — emit up to 100 events
 */

import { Router, Response } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { segmentForTenant, invalidateSegmentForTenant } from '../integrations/segment-tenant.js';
import { SegmentAdapter } from '../integrations/segment.js';

export const segmentIntegrationRouter = Router();

segmentIntegrationRouter.post('/connect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });
  const writeKey = String(req.body?.write_key || '').trim();
  const workspaceSlug = req.body?.workspace_slug ? String(req.body.workspace_slug) : null;
  const sourceName = req.body?.source_name ? String(req.body.source_name) : null;
  if (!writeKey) return res.status(400).json({ error: 'write_key is required' });

  // Validate by sending a healthcheck identify
  try { await new SegmentAdapter(writeKey).identify({ userId: 'clain-healthcheck', traits: { health: true } }); }
  catch (err: any) { return res.status(400).json({ error: 'Write key rejected by Segment', details: String(err?.message ?? err) }); }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `segment::${req.tenantId}::${workspaceSlug ?? 'default'}`;
  const webhookToken = randomBytes(24).toString('base64url');

  const authConfig: Record<string, unknown> = {
    write_key: writeKey, workspace_slug: workspaceSlug, source_name: sourceName,
    webhook_token: webhookToken, granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId, tenant_id: req.tenantId, system: 'segment', name: sourceName || workspaceSlug || `segment-${req.tenantId}`,
    status: 'connected', auth_type: 'api_key', auth_config: authConfig,
    capabilities: { reads: [], writes: ['identify', 'track', 'page', 'group', 'alias', 'batch'], events: ['inbound_destination_function'] },
    last_health_check_at: now, created_at: now, updated_at: now,
  }, { onConflict: 'id' });
  if (error) return res.status(500).json({ error: error.message });

  invalidateSegmentForTenant(req.tenantId, req.workspaceId ?? null);
  await supabase.from('audit_events').insert({ id: randomUUID(), tenant_id: req.tenantId, workspace_id: req.workspaceId || req.tenantId, actor_id: req.userId, actor_type: 'user', action: 'INTEGRATION_CONNECTED', entity_type: 'connector', entity_id: connectorId, metadata: { system: 'segment', workspace: workspaceSlug }, occurred_at: now }).then(() => {}, () => {});
  return res.json({ ok: true, connector_id: connectorId, webhook_token: webhookToken });
});

segmentIntegrationRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('connectors').update({ status: 'disconnected', updated_at: new Date().toISOString() }).eq('tenant_id', req.tenantId).eq('system', 'segment');
  if (error) return res.status(500).json({ error: error.message });
  invalidateSegmentForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

segmentIntegrationRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('connectors').select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at').eq('tenant_id', req.tenantId).eq('system', 'segment').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    workspace_slug: cfg.workspace_slug ?? null, source_name: cfg.source_name ?? null,
    webhook_token: cfg.webhook_token ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at, updated_at: data.updated_at,
  });
});

segmentIntegrationRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await segmentForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Segment not connected' });
  try { const ping = await resolved.adapter.ping(); return res.json({ ok: ping.ok, source: resolved.connector.sourceName ?? null, workspace: resolved.connector.workspaceSlug ?? null }); }
  catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});

segmentIntegrationRouter.post('/identify', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await segmentForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Segment not connected' });
  try { await resolved.adapter.identify({ userId: req.body?.user_id, anonymousId: req.body?.anonymous_id, traits: req.body?.traits, context: req.body?.context }); return res.json({ ok: true }); }
  catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});

segmentIntegrationRouter.post('/track', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await segmentForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Segment not connected' });
  try { await resolved.adapter.track({ event: String(req.body?.event || ''), userId: req.body?.user_id, anonymousId: req.body?.anonymous_id, properties: req.body?.properties, context: req.body?.context }); return res.json({ ok: true }); }
  catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});

segmentIntegrationRouter.post('/batch', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await segmentForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Segment not connected' });
  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  try { await resolved.adapter.batch(events); return res.json({ ok: true, sent: events.length }); }
  catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});
