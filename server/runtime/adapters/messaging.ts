/**
 * server/runtime/adapters/messaging.ts
 *
 * Adapter for `message.*` (slack, discord, telegram, teams, google_chat,
 * gmail, outlook). Phase 3f of the workflow extraction (Turno 5b/D2).
 *
 * Byte-for-byte transcription of the inline branch + the supporting
 * Gmail/Outlook OAuth helpers from `server/routes/workflows.ts`.
 *
 * The OAuth refresh helpers use the integration registry singleton for
 * persistence (auth_config rotation). Keep behavior identical.
 */

import type { NodeAdapter } from '../workflowExecutor.js';
import { resolveTemplateValue } from '../nodeHelpers.js';
import { createIntegrationRepository } from '../../data/index.js';

const integrationRepository = createIntegrationRepository();

// ── OAuth refresh helpers (Gmail / Outlook) ────────────────────────────────
async function refreshOAuthToken(
  scope: { tenantId: string; workspaceId: string },
  connectorId: string,
  auth: Record<string, any>,
  tokenUrl: string,
  fetchImpl: typeof fetch,
): Promise<{ access_token: string; expires_at: number } | { error: string }> {
  if (!auth.refresh_token || !auth.client_id || !auth.client_secret) {
    return { error: 'Refresh token / client credentials missing en auth_config.' };
  }
  const params = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: String(auth.refresh_token),
    client_id:     String(auth.client_id),
    client_secret: String(auth.client_secret),
  });
  const resp = await fetchImpl(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    return { error: `Token refresh ${resp.status}: ${detail.slice(0, 200)}` };
  }
  const json: any = await resp.json().catch(() => ({}));
  if (!json.access_token) return { error: 'Token refresh response sin access_token.' };
  const expiresAt = Date.now() + (Number(json.expires_in || 3600) * 1000);
  try {
    const newAuth: Record<string, any> = { ...auth, access_token: json.access_token, expires_at: expiresAt };
    if (json.refresh_token) newAuth.refresh_token = json.refresh_token;
    await (integrationRepository as any).updateConnector?.({ tenantId: scope.tenantId }, connectorId, { auth_config: newAuth });
  } catch { /* persistence failure shouldn't block this send */ }
  return { access_token: json.access_token, expires_at: expiresAt };
}

async function ensureFreshAccessToken(
  scope: { tenantId: string; workspaceId: string },
  connectorId: string,
  auth: Record<string, any>,
  tokenUrl: string,
  fetchImpl: typeof fetch,
): Promise<{ access_token: string } | { error: string }> {
  const expiresAt = Number(auth.expires_at || 0);
  if (auth.access_token && expiresAt && expiresAt > Date.now() + 60_000) {
    return { access_token: String(auth.access_token) };
  }
  const refreshed = await refreshOAuthToken(scope, connectorId, auth, tokenUrl, fetchImpl);
  if ('error' in refreshed) return refreshed;
  return { access_token: refreshed.access_token };
}

function buildRfc822Email(opts: { from?: string; to: string; subject: string; body: string }): string {
  const lines: string[] = [];
  if (opts.from) lines.push(`From: ${opts.from}`);
  lines.push(`To: ${opts.to}`);
  lines.push(`Subject: ${opts.subject}`);
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push('Content-Transfer-Encoding: 7bit');
  lines.push('');
  lines.push(opts.body);
  return lines.join('\r\n');
}

async function sendGmail(
  scope: { tenantId: string; workspaceId: string },
  connectorId: string,
  auth: Record<string, any>,
  payload: { to: string; subject: string; body: string },
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; messageId?: string; error?: string; transient?: boolean }> {
  if (!auth.refresh_token && !auth.access_token) {
    return { ok: false, error: 'Conecta tu cuenta de Gmail en Conectores antes de usar este nodo.' };
  }
  const fresh = await ensureFreshAccessToken(scope, connectorId, auth, 'https://oauth2.googleapis.com/token', fetchImpl);
  if ('error' in fresh) return { ok: false, error: `Gmail OAuth: ${fresh.error}` };
  const rfc822 = buildRfc822Email({ from: auth.email, to: payload.to, subject: payload.subject, body: payload.body });
  const raw = Buffer.from(rfc822, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const resp = await fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${fresh.access_token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(20_000),
  });
  if (resp.ok) {
    const json: any = await resp.json().catch(() => ({}));
    return { ok: true, messageId: String(json.id ?? '') };
  }
  const detail = await resp.text().catch(() => '');
  const transient = resp.status >= 500;
  return { ok: false, error: `Gmail ${resp.status}: ${detail.slice(0, 200)}`, transient };
}

async function sendOutlookMail(
  scope: { tenantId: string; workspaceId: string },
  connectorId: string,
  auth: Record<string, any>,
  payload: { to: string; subject: string; body: string },
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; messageId?: string; error?: string; transient?: boolean }> {
  if (!auth.refresh_token && !auth.access_token) {
    return { ok: false, error: 'Conecta tu cuenta de Outlook en Conectores antes de usar este nodo.' };
  }
  const fresh = await ensureFreshAccessToken(scope, connectorId, auth, 'https://login.microsoftonline.com/common/oauth2/v2.0/token', fetchImpl);
  if ('error' in fresh) return { ok: false, error: `Outlook OAuth: ${fresh.error}` };
  const message = {
    message: {
      subject: payload.subject,
      body: { contentType: 'Text', content: payload.body },
      toRecipients: [{ emailAddress: { address: payload.to } }],
    },
    saveToSentItems: true,
  };
  const resp = await fetchImpl('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${fresh.access_token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(20_000),
  });
  if (resp.status === 202 || resp.ok) {
    return { ok: true, messageId: resp.headers.get('request-id') ?? '' };
  }
  const detail = await resp.text().catch(() => '');
  const transient = resp.status >= 500;
  return { ok: false, error: `Outlook ${resp.status}: ${detail.slice(0, 200)}`, transient };
}

const messageDispatch: NodeAdapter = async ({ scope, context, services }, node, config) => {
  const fetchImpl = services?.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const system = String(node.key).split('.')[1];
  const allConnectors = await integrationRepository.listConnectors({ tenantId: scope.tenantId });
  const connector = allConnectors.find((c: any) => String(c.system || '').toLowerCase() === system);
  if (!connector) {
    return {
      status: 'failed',
      error: `${node.label || node.key}: ${system} is not configured. Open Integrations and connect ${system} first.`,
    } as any;
  }
  const status = String(connector.status || connector.health_status || '').toLowerCase();
  if (['error', 'failed', 'disabled'].includes(status)) {
    return {
      status: 'blocked',
      output: { reason: `${system} connector is in '${status}' state. Reconnect it in Integrations.`, connectorId: connector.id, system },
    };
  }
  const auth = (() => {
    const raw = connector.auth_config;
    if (!raw) return {} as Record<string, any>;
    if (typeof raw === 'object') return raw as Record<string, any>;
    try { return JSON.parse(String(raw)); } catch { return {}; }
  })();

  const dest = resolveTemplateValue(
    config.channel || config.chatId || config.to || config.space || '',
    context,
  );
  const content = resolveTemplateValue(config.content || config.body || config.message || '', context);
  if (!dest) return { status: 'failed', error: `${node.key}: destination (channel / to / chatId / space) is required.` } as any;
  if (!content) return { status: 'failed', error: `${node.key}: message content is required.` } as any;

  let delivery: { ok: boolean; messageId?: string; error?: string } = { ok: false };
  try {
    if (system === 'slack') {
      const token = auth.bot_token || auth.access_token || auth.token;
      if (!token) {
        delivery = { ok: false, error: 'Slack: bot_token not in connector auth_config. Reconnect Slack in Integrations.' };
      } else {
        const slackBody: any = { channel: dest, text: content };
        if (config.thread_ts) slackBody.thread_ts = resolveTemplateValue(String(config.thread_ts), context);
        const resp = await fetchImpl('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(slackBody),
          signal: AbortSignal.timeout(15_000),
        });
        const json: any = await resp.json().catch(() => ({}));
        delivery = json.ok ? { ok: true, messageId: json.ts } : { ok: false, error: `Slack: ${json.error ?? resp.statusText}` };
      }
    } else if (system === 'discord') {
      const webhookUrl = /^https?:\/\//i.test(dest) ? dest : (auth.webhook_url || '');
      if (!webhookUrl) {
        delivery = { ok: false, error: 'Discord: provide a webhook URL as the channel field or store it in connector auth_config.webhook_url.' };
      } else {
        const body: any = { content };
        if (config.username) body.username = String(config.username);
        const resp = await fetchImpl(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        });
        delivery = resp.ok ? { ok: true } : { ok: false, error: `Discord: ${resp.status} ${resp.statusText}` };
      }
    } else if (system === 'telegram') {
      const token = auth.bot_token || auth.token;
      if (!token) {
        delivery = { ok: false, error: 'Telegram: bot_token not in connector auth_config.' };
      } else {
        const body: any = { chat_id: dest, text: content };
        if (config.parseMode) body.parse_mode = String(config.parseMode);
        const resp = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        });
        const json: any = await resp.json().catch(() => ({}));
        delivery = json.ok ? { ok: true, messageId: String(json.result?.message_id ?? '') } : { ok: false, error: `Telegram: ${json.description ?? resp.statusText}` };
      }
    } else if (system === 'teams') {
      const webhookUrl = /^https?:\/\//i.test(dest) ? dest : (auth.webhook_url || '');
      if (!webhookUrl) {
        delivery = { ok: false, error: 'Teams: provide a channel webhook URL.' };
      } else {
        const card: any = {
          '@type': 'MessageCard',
          '@context': 'https://schema.org/extensions',
          summary: config.title || 'CRM-AI alert',
          themeColor: '0078D4',
          title: config.title || undefined,
          text: content,
        };
        const resp = await fetchImpl(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(card),
          signal: AbortSignal.timeout(15_000),
        });
        delivery = resp.ok ? { ok: true } : { ok: false, error: `Teams: ${resp.status} ${resp.statusText}` };
      }
    } else if (system === 'google_chat') {
      const webhookUrl = /^https?:\/\//i.test(dest) ? dest : (auth.webhook_url || '');
      if (!webhookUrl) {
        delivery = { ok: false, error: 'Google Chat: provide a space webhook URL.' };
      } else {
        const resp = await fetchImpl(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify({ text: content }),
          signal: AbortSignal.timeout(15_000),
        });
        delivery = resp.ok ? { ok: true } : { ok: false, error: `Google Chat: ${resp.status} ${resp.statusText}` };
      }
    } else if (system === 'gmail' || system === 'outlook') {
      const subject = resolveTemplateValue(config.subject || 'Update', context) || 'Update';
      const sendFn = system === 'gmail' ? sendGmail : sendOutlookMail;
      const result = await sendFn(
        { tenantId: scope.tenantId, workspaceId: scope.workspaceId },
        connector.id,
        auth,
        { to: dest, subject, body: content },
        fetchImpl,
      );
      if (result.ok) {
        delivery = { ok: true, messageId: result.messageId ?? '' };
      } else if (result.transient) {
        throw new Error(result.error || `${system}: transient transport error`);
      } else {
        delivery = { ok: false, error: result.error || `${system}: send failed` };
      }
    } else {
      delivery = { ok: false, error: `${system}: unsupported messaging system` };
    }
  } catch (err: any) {
    delivery = { ok: false, error: `${system} transport exception: ${err?.message ?? String(err)}` };
  }

  const canonicalEvent = await integrationRepository.createCanonicalEvent({ tenantId: scope.tenantId }, {
    sourceSystem: system,
    sourceEntityType: 'workflow',
    sourceEntityId: node.id,
    eventType: delivery.ok ? `${system}.message.sent` : `${system}.message.failed`,
    eventCategory: 'workflow',
    canonicalEntityType: context.case ? 'case' : 'workflow',
    canonicalEntityId: context.case?.id || node.id,
    normalizedPayload: { nodeId: node.id, destination: dest, content, delivery },
    dedupeKey: `${node.id}:${system}:${Date.now()}`,
    caseId: context.case?.id ?? null,
    workspaceId: scope.workspaceId,
    status: delivery.ok ? 'processed' : 'failed',
  });
  context.integration = { connectorId: connector.id, system, destination: dest, canonicalEventId: canonicalEvent.id, delivered: delivery.ok };

  if (!delivery.ok) {
    return { status: 'failed', error: delivery.error || `${system}: send failed`, output: { system, connectorId: connector.id, destination: dest, canonicalEventId: canonicalEvent.id } } as any;
  }
  return {
    status: 'completed',
    output: { system, connectorId: connector.id, destination: dest, messageId: delivery.messageId, canonicalEventId: canonicalEvent.id, delivered: true },
  };
};

export const messagingAdapters: Record<string, NodeAdapter> = {
  'message.slack': messageDispatch,
  'message.discord': messageDispatch,
  'message.telegram': messageDispatch,
  'message.teams': messageDispatch,
  'message.google_chat': messageDispatch,
  'message.gmail': messageDispatch,
  'message.outlook': messageDispatch,
};
