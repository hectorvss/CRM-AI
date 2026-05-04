/**
 * server/routes/upsIntegration.ts
 *
 * UPS uses OAuth 2.0 Client Credentials. The merchant pastes Client ID +
 * Secret + sandbox/production from developer.ups.com → My Apps. We validate
 * by minting a token, generate a per-tenant random `webhook_credential` for
 * UPS Track webhook authentication (UPS calls back with this in a header),
 * and persist everything in `connectors`.
 *
 *   POST /api/integrations/ups/connect
 *   POST /api/integrations/ups/disconnect
 *   GET  /api/integrations/ups/status
 *   POST /api/integrations/ups/track-test  — try a tracking lookup
 *   POST /api/integrations/ups/regenerate-webhook-credential
 */

import { Router, Response } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { fetchAccessToken, type UpsMode } from '../integrations/ups-oauth.js';
import { UpsAdapter } from '../integrations/ups.js';
import {
  invalidateUpsForTenant,
  upsForTenant,
} from '../integrations/ups-tenant.js';

export const upsIntegrationRouter = Router();

function publicBase(): string {
  return (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
}

function webhookCallbackUrl(credential: string): string {
  const base = publicBase();
  return base ? `https://${base}/webhooks/ups?credential=${encodeURIComponent(credential)}` : '';
}

upsIntegrationRouter.post('/connect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const clientId = String(req.body?.client_id || '').trim();
  const clientSecret = String(req.body?.client_secret || '').trim();
  const mode: UpsMode = req.body?.mode === 'production' ? 'production' : 'sandbox';
  const accountNumber = String(req.body?.account_number || '').trim() || null;
  const shipperNumber = String(req.body?.shipper_number || '').trim() || null;

  if (!clientId) return res.status(400).json({ error: 'client_id required' });
  if (!clientSecret) return res.status(400).json({ error: 'client_secret required' });

  // 1. Validate creds.
  let token;
  try {
    token = await fetchAccessToken({ clientId, clientSecret, mode });
  } catch (err: any) {
    return res.status(400).json({
      error: 'UPS rejected the credentials. Verify the Client ID and Secret in developer.ups.com.',
      upsMessage: String(err?.message ?? err).split(': ').slice(-1)[0],
    });
  }

  // 2. Best-effort: ping the API to confirm scope coverage.
  const adapter = new UpsAdapter(token.accessToken, mode);
  let pingOk = false;
  try {
    const r = await adapter.ping();
    pingOk = r.ok;
  } catch (err) {
    logger.warn('UPS ping failed during connect (continuing)', { error: String(err) });
  }

  // 3. Generate webhook credential (UPS sends this back in `Credential` header
  //    on every webhook delivery — we use it for reverse-tenant lookup since
  //    UPS has no per-message HMAC).
  const webhookCredential = randomBytes(32).toString('hex');
  const webhookUrl = webhookCallbackUrl(webhookCredential);

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `ups::${req.tenantId}::${clientId.slice(0, 8)}`;

  const authConfig = {
    client_id: clientId,
    client_secret: clientSecret,
    mode,
    account_number: accountNumber,
    shipper_number: shipperNumber,
    webhook_credential: webhookCredential,
    webhook_url: webhookUrl,
    access_token: token.accessToken,
    expires_at: token.expiresAt,
    scope: token.scope,
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: req.tenantId,
    system: 'ups',
    name: accountNumber || shipperNumber || clientId.slice(0, 8),
    status: 'connected',
    auth_type: 'oauth_client_credentials',
    auth_config: authConfig,
    capabilities: {
      reads: ['tracking', 'rates', 'address_validation', 'time_in_transit', 'locations', 'labels'],
      writes: ['create_shipment', 'void_shipment', 'upload_document', 'reprint_label'],
      mode,
      webhook_events: ['I', 'D', 'X', 'M', 'MV', 'DO', 'P', 'RS', 'SCM'],
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });

  if (error) {
    logger.error('UPS connect: upsert failed', { error: error.message });
    return res.status(500).json({ error: 'Could not persist UPS connector' });
  }

  invalidateUpsForTenant(req.tenantId, req.workspaceId ?? null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: req.tenantId,
    workspace_id: req.workspaceId ?? req.tenantId,
    actor_id: req.userId,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'ups', mode, account_number: accountNumber, shipper_number: shipperNumber, ping_ok: pingOk },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.json({
    ok: true,
    mode,
    account_number: accountNumber,
    shipper_number: shipperNumber,
    webhook_url: webhookUrl,
    webhook_credential_preview: `${webhookCredential.slice(0, 6)}…${webhookCredential.slice(-4)}`,
    ping_ok: pingOk,
  });
});

upsIntegrationRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'ups');
  if (error) return res.status(500).json({ error: error.message });
  invalidateUpsForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

upsIntegrationRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'ups')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    mode: cfg.mode ?? null,
    account_number: cfg.account_number ?? null,
    shipper_number: cfg.shipper_number ?? null,
    webhook_url: cfg.webhook_url ?? null,
    webhook_registered: Boolean(cfg.webhook_credential),
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

upsIntegrationRouter.post('/track-test', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const tracking = String(req.body?.tracking_number || '').trim();
  if (!tracking) return res.status(400).json({ error: 'tracking_number required' });
  const resolved = await upsForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'UPS not connected' });
  try {
    const result = await resolved.adapter.track(tracking);
    return res.json({
      ok: true,
      status: result.currentStatus,
      service: result.service,
      scheduled_delivery: result.scheduledDelivery,
      events_count: result.events.length,
      latest_event: result.events[0] ?? null,
    });
  } catch (err: any) {
    return res.status(502).json({
      error: 'UPS tracking call failed',
      ups_status: err?.statusCode,
      details: err?.upsErrors?.[0]?.message ?? String(err?.message ?? err),
    });
  }
});

upsIntegrationRouter.post('/regenerate-webhook-credential', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await upsForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'UPS not connected' });

  const webhookCredential = randomBytes(32).toString('hex');
  const webhookUrl = webhookCallbackUrl(webhookCredential);
  const supabase = getSupabaseAdmin();
  const merged = {
    ...resolved.connector.rawAuthConfig,
    webhook_credential: webhookCredential,
    webhook_url: webhookUrl,
  };
  await supabase
    .from('connectors')
    .update({ auth_config: merged, updated_at: new Date().toISOString() })
    .eq('id', resolved.connector.id);
  invalidateUpsForTenant(req.tenantId, req.workspaceId ?? null);

  return res.json({
    ok: true,
    webhook_url: webhookUrl,
    webhook_credential_preview: `${webhookCredential.slice(0, 6)}…${webhookCredential.slice(-4)}`,
  });
});
