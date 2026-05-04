/**
 * server/routes/plaidIntegration.ts
 *
 * Plaid uses tenant-level credentials. The user flow is:
 *   1. POST /connect — admin saves client_id + secret + environment
 *   2. POST /link-token — frontend requests a Link token for a customer
 *   3. Plaid Link runs client-side, returns public_token
 *   4. POST /exchange — server exchanges public_token for access_token
 *      (stored on the customer row, not the connector)
 */

import { Router, Response } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { plaidForTenant, invalidatePlaidForTenant } from '../integrations/plaid-tenant.js';
import { PlaidAdapter, type PlaidEnvironment } from '../integrations/plaid.js';

export const plaidIntegrationRouter = Router();

function publicBaseUrl(): string { const b = (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, ''); return b ? `https://${b}` : ''; }

plaidIntegrationRouter.post('/connect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });
  const clientId = String(req.body?.client_id || '').trim();
  const secret = String(req.body?.secret || '').trim();
  const environment = String(req.body?.environment || 'sandbox') as PlaidEnvironment;
  if (!clientId || !secret) return res.status(400).json({ error: 'client_id and secret are required' });
  if (!['sandbox', 'development', 'production'].includes(environment)) return res.status(400).json({ error: 'environment must be sandbox|development|production' });

  // Validate by hitting /categories/get (no scope required)
  try { await new PlaidAdapter(clientId, secret, environment).ping(); }
  catch (err: any) { return res.status(400).json({ error: 'Plaid credentials rejected', details: String(err?.message ?? err) }); }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `plaid::${req.tenantId}::${environment}`;
  const webhookToken = randomBytes(24).toString('base64url');

  const authConfig: Record<string, unknown> = {
    client_id: clientId, secret, environment,
    webhook_token: webhookToken, granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId, tenant_id: req.tenantId, system: 'plaid', name: `plaid-${environment}`,
    status: 'connected', auth_type: 'api_key', auth_config: authConfig,
    capabilities: { reads: ['accounts', 'balance', 'identity', 'auth', 'transactions'], writes: ['link_token', 'exchange_public_token', 'item_remove'], events: ['ITEM_LOGIN_REQUIRED', 'TRANSACTIONS_REMOVED', 'DEFAULT_UPDATE', 'WEBHOOK_UPDATE_ACKNOWLEDGED'] },
    last_health_check_at: now, created_at: now, updated_at: now,
  }, { onConflict: 'id' });
  if (error) return res.status(500).json({ error: error.message });

  invalidatePlaidForTenant(req.tenantId, req.workspaceId ?? null);
  await supabase.from('audit_events').insert({ id: randomUUID(), tenant_id: req.tenantId, workspace_id: req.workspaceId || req.tenantId, actor_id: req.userId, actor_type: 'user', action: 'INTEGRATION_CONNECTED', entity_type: 'connector', entity_id: connectorId, metadata: { system: 'plaid', environment }, occurred_at: now }).then(() => {}, () => {});
  return res.json({ ok: true, connector_id: connectorId, webhook_url: `${publicBaseUrl()}/webhooks/plaid/${webhookToken}` });
});

plaidIntegrationRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('connectors').update({ status: 'disconnected', updated_at: new Date().toISOString() }).eq('tenant_id', req.tenantId).eq('system', 'plaid');
  if (error) return res.status(500).json({ error: error.message });
  invalidatePlaidForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

plaidIntegrationRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('connectors').select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at').eq('tenant_id', req.tenantId).eq('system', 'plaid').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    environment: cfg.environment ?? null,
    webhook_token: cfg.webhook_token ?? null,
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at, updated_at: data.updated_at,
  });
});

plaidIntegrationRouter.post('/sync', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await plaidForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Plaid not connected' });
  try { const ping = await resolved.adapter.ping(); return res.json({ ok: ping.ok, environment: resolved.connector.environment }); }
  catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});

plaidIntegrationRouter.post('/link-token', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await plaidForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Plaid not connected' });
  const userClientId = String(req.body?.user_client_id || req.userId || '').trim();
  const products: string[] = Array.isArray(req.body?.products) ? req.body.products : ['auth', 'identity'];
  const countryCodes: string[] = Array.isArray(req.body?.country_codes) ? req.body.country_codes : ['US'];
  if (!userClientId) return res.status(400).json({ error: 'user_client_id required' });
  try {
    const r = await resolved.adapter.createLinkToken({
      userClientId,
      clientName: req.body?.client_name || 'Clain',
      products, countryCodes,
      language: req.body?.language || 'en',
      webhook: resolved.connector.webhookToken ? `${publicBaseUrl()}/webhooks/plaid/${resolved.connector.webhookToken}` : undefined,
    });
    return res.json({ ok: true, link_token: r.link_token, expiration: r.expiration });
  } catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});

plaidIntegrationRouter.post('/exchange', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await plaidForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Plaid not connected' });
  const publicToken = String(req.body?.public_token || '').trim();
  if (!publicToken) return res.status(400).json({ error: 'public_token required' });
  try {
    const r = await resolved.adapter.exchangePublicToken(publicToken);
    return res.json({ ok: true, item_id: r.item_id, access_token: r.access_token });
  } catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});

plaidIntegrationRouter.post('/accounts', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await plaidForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Plaid not connected' });
  const accessToken = String(req.body?.access_token || '');
  if (!accessToken) return res.status(400).json({ error: 'access_token required' });
  try { return res.json({ ok: true, accounts: await resolved.adapter.getAccounts(accessToken) }); }
  catch (err: any) { return res.status(502).json({ error: String(err?.message ?? err) }); }
});
