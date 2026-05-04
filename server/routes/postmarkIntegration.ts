/**
 * server/routes/postmarkIntegration.ts
 *
 *   POST /api/integrations/postmark/connect    — paste Server Token, validate, register webhook
 *   POST /api/integrations/postmark/disconnect — delete webhook + flag
 *   GET  /api/integrations/postmark/status     — full status + DKIM/SPF if account token present
 *   GET  /api/integrations/postmark/templates  — list templates for the picker UI
 *   POST /api/integrations/postmark/send-test  — send a test email
 *   POST /api/integrations/postmark/register-webhook — re-register
 */

import { Router, Response } from 'express';
import { randomBytes, randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { PostmarkAdapter } from '../integrations/postmark.js';
import {
  invalidatePostmarkForTenant,
  loadPostmarkConnector,
  postmarkForTenant,
} from '../integrations/postmark-tenant.js';

export const postmarkIntegrationRouter = Router();

function publicBase(): string {
  return (process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL || '').replace(/^https?:\/\//, '');
}

function webhookUrl(token: string): string {
  const base = publicBase();
  return base ? `https://${base}/webhooks/postmark?token=${encodeURIComponent(token)}` : '';
}

postmarkIntegrationRouter.post('/connect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId || !req.userId) return res.status(401).json({ error: 'Authentication required' });

  const serverToken = String(req.body?.server_token || '').trim();
  const accountToken = req.body?.account_token ? String(req.body.account_token).trim() : '';
  const defaultFromAddress = req.body?.default_from_address ? String(req.body.default_from_address).trim() : '';
  const defaultFromName = req.body?.default_from_name ? String(req.body.default_from_name).trim() : '';

  if (!serverToken) return res.status(400).json({ error: 'server_token required' });

  // Validate by hitting /server.
  let server;
  let templates: any[] = [];
  let signatures: any[] = [];
  try {
    const adapter = new PostmarkAdapter(serverToken, accountToken || undefined);
    server = await adapter.getServer();
    // Fetch templates for the picker (best-effort).
    try {
      const t = await adapter.listTemplates({ count: 100 });
      templates = t.Templates ?? [];
    } catch { /* ignore */ }
    // If an account token was provided we can also list confirmed sender signatures.
    if (accountToken) {
      try {
        const s = await adapter.listSenderSignatures({ count: 50 });
        signatures = (s.SenderSignatures ?? []).filter((sig: any) => sig.Confirmed);
      } catch { /* ignore */ }
    }
  } catch (err: any) {
    return res.status(400).json({
      error: 'Postmark rejected the Server Token. Verify it in postmarkapp.com → Servers → API Tokens.',
      postmarkMessage: String(err?.message ?? err).split(': ').slice(-1)[0],
    });
  }

  // Auto-register webhook with our per-tenant URL token.
  const webhookToken = randomBytes(20).toString('base64url');
  const url = webhookUrl(webhookToken);
  let webhookId: number | null = null;
  let webhookError: string | null = null;
  if (url) {
    try {
      const adapter = new PostmarkAdapter(serverToken);
      const wh = await adapter.createWebhook({
        url,
        messageStream: 'outbound',
        triggers: {
          Open: { Enabled: true, PostFirstOpenOnly: false },
          Click: { Enabled: true },
          Delivery: { Enabled: true },
          Bounce: { Enabled: true, IncludeContent: false },
          SpamComplaint: { Enabled: true, IncludeContent: false },
          SubscriptionChange: { Enabled: true },
        },
      });
      webhookId = wh.ID;
    } catch (err: any) {
      webhookError = String(err?.message ?? err);
    }
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const connectorId = `postmark::${req.tenantId}::${server.ID}`;

  const authConfig = {
    server_token: serverToken,
    account_token: accountToken || null,
    server_id: server.ID,
    server_name: server.Name,
    server_color: server.Color,
    default_from_address: defaultFromAddress || null,
    default_from_name: defaultFromName || null,
    webhook_token: webhookToken,
    webhook_id: webhookId,
    webhook_url: url,
    webhook_error: webhookError,
    template_count: templates.length,
    signatures: signatures.map((s: any) => ({ id: s.ID, email: s.EmailAddress, domain: s.Domain, name: s.Name })),
    granted_at: now,
  };

  const { error } = await supabase.from('connectors').upsert({
    id: connectorId,
    tenant_id: req.tenantId,
    system: 'postmark',
    name: server.Name,
    status: 'connected',
    auth_type: 'api_key',
    auth_config: authConfig,
    capabilities: {
      sends: ['transactional_email', 'templates', 'batch', 'attachments', 'tracking'],
      reads: ['outbound_messages', 'opens', 'clicks', 'bounces', 'suppressions', 'templates'],
      admin: accountToken ? ['domains', 'signatures', 'verify_dkim'] : [],
      webhook_events: ['Delivery', 'Bounce', 'SpamComplaint', 'Open', 'Click', 'SubscriptionChange'],
    },
    last_health_check_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' });
  if (error) return res.status(500).json({ error: error.message });

  invalidatePostmarkForTenant(req.tenantId, req.workspaceId ?? null);

  await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: req.tenantId,
    workspace_id: req.workspaceId ?? req.tenantId,
    actor_id: req.userId,
    actor_type: 'user',
    action: 'INTEGRATION_CONNECTED',
    entity_type: 'connector',
    entity_id: connectorId,
    metadata: { system: 'postmark', server_id: server.ID, server_name: server.Name, webhook_id: webhookId },
    occurred_at: now,
  }).then(() => {}, () => {});

  return res.json({
    ok: true,
    server: { id: server.ID, name: server.Name, color: server.Color },
    template_count: templates.length,
    signatures: authConfig.signatures,
    webhook_id: webhookId,
    webhook_url: url,
    webhook_error: webhookError,
  });
});

postmarkIntegrationRouter.post('/disconnect', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const connector = await loadPostmarkConnector(req.tenantId);
  if (connector?.webhookId) {
    try {
      const adapter = new PostmarkAdapter(connector.serverToken);
      await adapter.deleteWebhook(connector.webhookId);
    } catch (err) {
      logger.warn('postmark deleteWebhook failed', { error: String(err) });
    }
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('connectors')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('tenant_id', req.tenantId)
    .eq('system', 'postmark');
  if (error) return res.status(500).json({ error: error.message });
  invalidatePostmarkForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});

postmarkIntegrationRouter.get('/status', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('connectors')
    .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
    .eq('tenant_id', req.tenantId)
    .eq('system', 'postmark')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.json({ connected: false });
  const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
  return res.json({
    connected: data.status === 'connected',
    server_id: cfg.server_id ?? null,
    server_name: cfg.server_name ?? null,
    server_color: cfg.server_color ?? null,
    default_from_address: cfg.default_from_address ?? null,
    default_from_name: cfg.default_from_name ?? null,
    webhook_id: cfg.webhook_id ?? null,
    webhook_url: cfg.webhook_url ?? null,
    webhook_registered: Boolean(cfg.webhook_id),
    webhook_error: cfg.webhook_error ?? null,
    has_account_token: Boolean(cfg.account_token),
    template_count: cfg.template_count ?? 0,
    signatures: cfg.signatures ?? [],
    capabilities: data.capabilities ?? null,
    last_health_check_at: data.last_health_check_at,
    updated_at: data.updated_at,
  });
});

postmarkIntegrationRouter.get('/templates', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await postmarkForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Postmark not connected' });
  try {
    const t = await resolved.adapter.listTemplates({ count: 100 });
    return res.json({ templates: t.Templates ?? [] });
  } catch (err: any) {
    return res.status(502).json({ error: String(err?.message ?? err) });
  }
});

// body: { to, subject, text?, html?, template_alias?, template_model?, from?, reply_to? }
postmarkIntegrationRouter.post('/send-test', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await postmarkForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Postmark not connected' });

  const to = String(req.body?.to || '').trim();
  if (!to) return res.status(400).json({ error: 'to required' });

  const fromAddress = req.body?.from
    ? String(req.body.from)
    : (resolved.connector.defaultFromName
      ? `${resolved.connector.defaultFromName} <${resolved.connector.defaultFromAddress}>`
      : resolved.connector.defaultFromAddress);
  if (!fromAddress) {
    return res.status(400).json({ error: 'No default sender configured. Save default_from_address first or pass `from` in the body.' });
  }

  try {
    let result;
    if (req.body?.template_alias) {
      result = await resolved.adapter.sendWithTemplate({
        from: fromAddress,
        to,
        templateAlias: String(req.body.template_alias),
        templateModel: req.body.template_model ?? {},
        replyTo: req.body?.reply_to,
        tag: 'clain-test',
      });
    } else {
      result = await resolved.adapter.send({
        from: fromAddress,
        to,
        subject: String(req.body?.subject || 'Test desde Clain ✅'),
        textBody: String(req.body?.text || 'Hola — este es un email de prueba enviado desde Clain.\n\n— El equipo'),
        htmlBody: req.body?.html,
        replyTo: req.body?.reply_to,
        tag: 'clain-test',
      });
    }
    if (result.ErrorCode && result.ErrorCode !== 0) {
      return res.status(502).json({ error: result.Message, postmark_error_code: result.ErrorCode });
    }
    return res.json({ ok: true, message_id: result.MessageID, submitted_at: result.SubmittedAt });
  } catch (err: any) {
    return res.status(502).json({
      error: 'Postmark rejected the test send',
      details: String(err?.message ?? err),
    });
  }
});

postmarkIntegrationRouter.post('/register-webhook', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const resolved = await postmarkForTenant(req.tenantId, req.workspaceId ?? null);
  if (!resolved) return res.status(404).json({ error: 'Postmark not connected' });
  if (resolved.connector.webhookId) {
    try { await resolved.adapter.deleteWebhook(resolved.connector.webhookId); } catch { /* ignore */ }
  }
  const url = webhookUrl(resolved.connector.webhookToken || randomBytes(20).toString('base64url'));
  if (!url) return res.status(503).json({ error: 'PUBLIC_BASE_URL not configured' });
  try {
    const wh = await resolved.adapter.createWebhook({ url, messageStream: 'outbound' });
    const supabase = getSupabaseAdmin();
    const merged = {
      ...resolved.connector.rawAuthConfig,
      webhook_id: wh.ID,
      webhook_url: url,
      webhook_error: null,
    };
    await supabase
      .from('connectors')
      .update({ auth_config: merged, last_health_check_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', resolved.connector.id);
    invalidatePostmarkForTenant(req.tenantId, req.workspaceId ?? null);
    return res.json({ ok: true, webhook_id: wh.ID, webhook_url: url });
  } catch (err: any) {
    return res.status(502).json({ error: String(err?.message ?? err) });
  }
});

// PATCH /defaults — merchant updates default_from_address/name without reconnecting
postmarkIntegrationRouter.patch('/defaults', extractMultiTenant, async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const connector = await loadPostmarkConnector(req.tenantId);
  if (!connector) return res.status(404).json({ error: 'Postmark not connected' });
  const supabase = getSupabaseAdmin();
  const merged = {
    ...connector.rawAuthConfig,
    ...(req.body?.default_from_address !== undefined ? { default_from_address: String(req.body.default_from_address || '') || null } : {}),
    ...(req.body?.default_from_name !== undefined ? { default_from_name: String(req.body.default_from_name || '') || null } : {}),
  };
  const { error } = await supabase
    .from('connectors')
    .update({ auth_config: merged, updated_at: new Date().toISOString() })
    .eq('id', connector.id);
  if (error) return res.status(500).json({ error: error.message });
  invalidatePostmarkForTenant(req.tenantId, req.workspaceId ?? null);
  return res.json({ ok: true });
});
