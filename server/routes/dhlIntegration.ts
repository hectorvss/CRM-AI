/**
 * server/routes/dhlIntegration.ts
 *
 * DHL connect flow:
 *   - Tracking API key (required) — DHL-API-Key header for the Unified
 *     Tracking API. From developer.dhl.com → My Apps.
 *   - DHL Express MyDHL API username + password (optional) — only needed
 *     for outbound shipping/rates/pickups. From the Express signup at the
 *     DHL Developer Portal.
 *   - account_number (optional) — DHL Express shipper account.
 *
 *   POST /api/integrations/dhl/connect
 *   POST /api/integrations/dhl/disconnect
 *   GET  /api/integrations/dhl/status
 *   POST /api/integrations/dhl/track-test
 *   POST /api/integrations/dhl/regenerate-webhook-secret
 */

import { Router, Response } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { DhlAdapter, type DhlMode } from '../integrations/dhl.js';
import {
  invalidateDhlForTenant,
  dhlForTenant,
} from '../integrations/dhl-tenant.js';

export const dhlIntegrationRouter = Router();

function publicBase(): string {
  return (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
}

function webhookCallbackUrl(secret: string): string {
  const base = publicBase();
  return base ? `https://${base}/webhooks/dhl?secret=${encodeURIComponent(secret)}` : '';
}

dhlIntegrationRouter.post('/connect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const apiKey = String(req.body?.api_key || '').trim();
  const mydhlUsername = String(req.body?.mydhl_username || '').trim() || null;
  const mydhlPassword = String(req.body?.mydhl_password || '').trim() || null;
  const mydhlMode: DhlMode = req.body?.mydhl_mode === 'production' ? 'production' : 'sandbox';
  const accountNumber = String(req.body?.account_number || '').trim() || null;

  if (!apiKey) return res.status(400).json({ error: 'api_key required (Tracking API key)' });

  // 1. Validate the tracking API key.
  const adapter = new DhlAdapter(
    apiKey,
    mydhlUsername && mydhlPassword ? { username: mydhlUsername, password: mydhlPassword, mode: mydhlMode } : null,
  );
  let trackingPing;
  try {
    trackingPing = await adapter.ping();
  } catch (err) {
    logger.warn('DHL ping during connect threw (continuing)', { error: String(err) });
    trackingPing = { ok: false } as { ok: boolean; statusCode?: number };
  }
  if (!trackingPing.ok) {
    return res.status(400).json({
      error: 'DHL rejected the Tracking API key. Verify it on developer.dhl.com.',
      dhl_status: trackingPing.statusCode ?? null,
    });
  }

  // 2. Validate MyDHL Express creds if provided.
  let expressPingOk = false;
  let expressPingStatus: number | null = null;
  if (mydhlUsername && mydhlPassword) {
    const r = await adapter.expressPing();
    expressPingOk = r.ok;
    expressPingStatus = r.statusCode ?? null;
    if (!expressPingOk) {
      return res.status(400).json({
        error: 'DHL Express MyDHL API rejected the username/password.',
        dhl_status: expressPingStatus,
      });
    }
  }

  // 3. Generate webhook secret.
  const webhookSecret = randomBytes(32).toString('hex');
  const webhookUrl = webhookCallbackUrl(webhookSecret);

  // 4. Persist.
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `dhl::${req.tenantId}::${apiKey.slice(0, 8)}`;

  const authConfig = {
    api_key: apiKey,
    mydhl_username: mydhlUsername,
    mydhl_password: mydhlPassword,
    mydhl_mode: mydhlMode,
    mydhl_configured: Boolean(mydhlUsername && mydhlPassword),
    account_number: accountNumber,
    webhook_secret: webhookSecret,
    webhook_url: webhookUrl,
    granted_at: now,
  };

  const reads = ['tracking'];
  const writes: string[] = [];
  if (mydhlUsername) {
    reads.push('rates', 'address_validation', 'products');
    writes.push('create_shipment', 'cancel_shipment', 'create_pickup', 'cancel_pickup', 'reprint_label');
  }

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: req.tenantId,
    system: 'dhl',
    name: accountNumber || apiKey.slice(0, 8),
    status: 'connected',
    auth_type: mydhlUsername ? 'api_key_pair' : 'api_key',
    auth_config: authConfig,
    capabilities: { reads, writes, mydhl_mode: mydhlMode },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (error) {
    logger.error('DHL connect: upsert failed', { error: error.message });
    return res.status(500).json({ error: 'Could not persist DHL connector' });
  }

  invalidateDhlForTenant(req.tenantId, req.workspaceId ?? null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: req.tenantId,
    workspace_id: req.workspaceId ?? req.tenantId,
    actor_id: req.userId,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'dhl', mydhl_configured: Boolean(mydhlUsername), account_number: accountNumber, mydhl_mode: mydhlMode },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.json({
    ok: true,
    mydhl_configured: Boolean(mydhlUsername),
    mydhl_mode: mydhlMode,
    account_number: accountNumber,
    webhook_url: webhookUrl,
    webhook_secret_preview: `${webhookSecret.slice(0, 6)}…${webhookSecret.slice(-4)}`,
    tracking_ping_status: trackingPing.statusCode ?? null,
  });
});

dhlIntegrationRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'dhl');
  if (error) return res.status(500).json({ error: error.message });
  invalidateDhlForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

dhlIntegrationRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'dhl')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    mydhl_configured: Boolean(cfg.mydhl_configured),
    mydhl_mode: cfg.mydhl_mode ?? null,
    account_number: cfg.account_number ?? null,
    webhook_url: cfg.webhook_url ?? null,
    webhook_registered: Boolean(cfg.webhook_secret),
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

dhlIntegrationRouter.post('/track-test', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const tracking = String(req.body?.tracking_number || '').trim();
  if (!tracking) return res.status(400).json({ error: 'tracking_number required' });
  const resolved = await dhlForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'DHL not connected' });
  try {
    const result = await resolved.adapter.track(tracking);
    return res.json({
      ok: true,
      status: result.status,
      service: result.service,
      origin: result.origin,
      destination: result.destination,
      estimated_delivery: result.estimatedDelivery,
      events_count: result.events.length,
      latest_event: result.events[0] ?? null,
    });
  } catch (err: any) {
    return res.status(502).json({
      error: 'DHL tracking call failed',
      dhl_status: err?.statusCode,
      details: err?.dhlDetails ?? String(err?.message ?? err),
    });
  }
});

dhlIntegrationRouter.post('/regenerate-webhook-secret', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await dhlForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'DHL not connected' });

  const webhookSecret = randomBytes(32).toString('hex');
  const webhookUrl = webhookCallbackUrl(webhookSecret);
  const supabase = getSupabaseAdmin();
  const merged = {
    ...resolved.connector.rawAuthConfig,
    webhook_secret: webhookSecret,
    webhook_url: webhookUrl,
  };
  await supabase
    .from('connectors')
    .update({ auth_config: merged, updated_at: new Date().toISOString() })
    .eq('id', resolved.connector.id);
  invalidateDhlForTenant(req.tenantId, req.workspaceId ?? null);

  return res.json({
    ok: true,
    webhook_url: webhookUrl,
    webhook_secret_preview: `${webhookSecret.slice(0, 6)}…${webhookSecret.slice(-4)}`,
  });
});
