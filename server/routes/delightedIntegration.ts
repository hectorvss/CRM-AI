/**
 * server/routes/delightedIntegration.ts
 *
 * Delighted NPS/CSAT survey platform integration router.
 * system='delighted' on connectors. Auth via API key (HTTP Basic).
 */

import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { DelightedAdapter, DelightedAuthError } from '../integrations/delighted.js';
import { delightedForTenant, invalidateDelightedForTenant } from '../integrations/delighted-tenant.js';

export const delightedIntegrationRouter = Router();

// ── POST /connect ──────────────────────────────────────────────────────────

delightedIntegrationRouter.post('/connect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const apiKey = String(req.body?.api_key || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'api_key required' });

  // Validate credentials by fetching live metrics
  let metrics: Awaited<ReturnType<DelightedAdapter['getMetrics']>>;
  try {
    const adapter = new DelightedAdapter(apiKey);
    metrics = await adapter.getMetrics();
  } catch (err: any) {
    if (err instanceof DelightedAuthError) {
      return res.status(401).json({ error: 'Delighted rejected the API key. Check your key in the Delighted dashboard.' });
    }
    return res.status(400).json({
      error: 'Could not connect to Delighted. Check your API key.',
      details: String(err?.message ?? err),
    });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `delighted::${req.tenantId}`;

  const authConfig = {
    api_key: apiKey,
    nps_score: metrics.nps ?? null,
    response_rate: metrics.response_rate ?? null,
    responses: metrics.responses ?? null,
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: req.tenantId,
    system: 'delighted',
    name: 'Delighted',
    status: 'connected',
    auth_type: 'api_key',
    auth_config: authConfig,
    capabilities: {
      reads: ['metrics', 'survey_responses', 'people', 'unsubscribes'],
      sends: ['survey', 'unsubscribe'],
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });
  if (error) return res.status(500).json({ error: error.message });

  invalidateDelightedForTenant(req.tenantId, req.workspaceId ?? null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: req.tenantId,
    workspace_id: req.workspaceId ?? req.tenantId,
    actor_id: req.userId,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'delighted', nps_score: metrics.nps ?? null },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.json({
    ok: true,
    nps_score: metrics.nps ?? null,
    response_rate: metrics.response_rate ?? null,
    responses: metrics.responses ?? null,
  });
});

// ── POST /disconnect ───────────────────────────────────────────────────────

delightedIntegrationRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'delighted');
  if (error) return res.status(500).json({ error: error.message });
  invalidateDelightedForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

// ── GET /status ────────────────────────────────────────────────────────────

delightedIntegrationRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'delighted')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    nps_score: cfg.nps_score ?? null,
    response_rate: cfg.response_rate ?? null,
    responses: cfg.responses ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

// ── GET /metrics -- live fetch ─────────────────────────────────────────────

delightedIntegrationRouter.get('/metrics', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await delightedForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Delighted not connected' });

  try {
    const metrics = await resolved.adapter.getMetrics();
    return res.json({ ok: true, metrics });
  } catch (err: any) {
    if (err instanceof DelightedAuthError) {
      return res.status(401).json({ error: 'Delighted auth error -- reconnect the integration', details: String(err.message) });
    }
    logger.warn('Delighted getMetrics failed', { tenantId: req.tenantId, error: String(err) });
    return res.status(502).json({ error: 'Delighted API error', details: String(err?.message ?? err) });
  }
});

// ── GET /responses ─────────────────────────────────────────────────────────

delightedIntegrationRouter.get('/responses', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await delightedForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Delighted not connected' });

  const since = req.query.since ? Number(req.query.since) : undefined;
  const until = req.query.until ? Number(req.query.until) : undefined;
  const perPage = req.query.per_page ? Number(req.query.per_page) : undefined;
  const page = req.query.page ? Number(req.query.page) : undefined;
  const trend = req.query.trend ? String(req.query.trend) : undefined;

  try {
    const responses = await resolved.adapter.listResponses({ since, until, per_page: perPage, page, trend });
    return res.json({ ok: true, responses });
  } catch (err: any) {
    if (err instanceof DelightedAuthError) {
      return res.status(401).json({ error: 'Delighted auth error -- reconnect the integration', details: String(err.message) });
    }
    logger.warn('Delighted listResponses failed', { tenantId: req.tenantId, error: String(err) });
    return res.status(502).json({ error: 'Delighted API error', details: String(err?.message ?? err) });
  }
});

// ── POST /surveys -- queue a survey ───────────────────────────────────────

delightedIntegrationRouter.post('/surveys', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await delightedForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Delighted not connected' });

  const email = req.body?.email ? String(req.body.email).trim() : undefined;
  const phoneNumber = req.body?.phone_number ? String(req.body.phone_number).trim() : undefined;
  const name = req.body?.name ? String(req.body.name).trim() : undefined;
  const delay = req.body?.delay !== undefined ? Number(req.body.delay) : undefined;
  const properties = req.body?.properties as Record<string, string | number> | undefined;

  if (!email && !phoneNumber) {
    return res.status(400).json({ error: 'Either email or phone_number is required to queue a survey' });
  }

  try {
    const person = await resolved.adapter.createSurvey({ email, phone_number: phoneNumber, name, delay, properties });
    return res.json({ ok: true, person });
  } catch (err: any) {
    if (err instanceof DelightedAuthError) {
      return res.status(401).json({ error: 'Delighted auth error -- reconnect the integration', details: String(err.message) });
    }
    logger.warn('Delighted createSurvey failed', { tenantId: req.tenantId, error: String(err) });
    return res.status(502).json({ error: 'Delighted API error', details: String(err?.message ?? err) });
  }
});

// ── POST /unsubscribe ──────────────────────────────────────────────────────

delightedIntegrationRouter.post('/unsubscribe', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await delightedForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Delighted not connected' });

  const email = String(req.body?.email || '').trim();
  if (!email) return res.status(400).json({ error: 'email required' });

  try {
    await resolved.adapter.unsubscribe(email);
    return res.json({ ok: true });
  } catch (err: any) {
    if (err instanceof DelightedAuthError) {
      return res.status(401).json({ error: 'Delighted auth error -- reconnect the integration', details: String(err.message) });
    }
    logger.warn('Delighted unsubscribe failed', { tenantId: req.tenantId, error: String(err) });
    return res.status(502).json({ error: 'Delighted API error', details: String(err?.message ?? err) });
  }
});

// ── GET /unsubscribes ──────────────────────────────────────────────────────

delightedIntegrationRouter.get('/unsubscribes', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await delightedForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Delighted not connected' });

  const perPage = req.query.per_page ? Number(req.query.per_page) : undefined;
  const page = req.query.page ? Number(req.query.page) : undefined;

  try {
    const unsubscribes = await resolved.adapter.listUnsubscribes({ per_page: perPage, page });
    return res.json({ ok: true, unsubscribes });
  } catch (err: any) {
    if (err instanceof DelightedAuthError) {
      return res.status(401).json({ error: 'Delighted auth error -- reconnect the integration', details: String(err.message) });
    }
    logger.warn('Delighted listUnsubscribes failed', { tenantId: req.tenantId, error: String(err) });
    return res.status(502).json({ error: 'Delighted API error', details: String(err?.message ?? err) });
  }
});
