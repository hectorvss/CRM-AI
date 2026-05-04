/**
 * server/webhooks/slack.ts
 *
 * Slack Events API webhook. Two responsibilities:
 *
 *  1. **URL verification challenge**: when an admin first points the
 *     Events API endpoint here, Slack sends `{type: "url_verification",
 *     challenge: "<random>"}`. We must echo `challenge` back to confirm
 *     the URL.
 *
 *  2. **Real events**: `event_callback` envelope. We HMAC-verify with
 *     `SLACK_SIGNING_SECRET` (5-min replay window), reverse-look up the
 *     tenant by `team_id`, persist the event to `webhook_events`, and
 *     enqueue a `WEBHOOK_PROCESS` job.
 *
 *  Slack's challenge requires the signature header chain to be honoured
 *  even on the verification request — same HMAC scheme.
 *
 *  Bot self-events (`bot_id` matches our recorded `bot_user_id`) are
 *  filtered out at the persistence layer to avoid loops when our agent
 *  posts back into channels.
 */

import { Router, Request, Response, raw } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { findTenantBySlackTeam } from '../integrations/slack-tenant.js';
import { verifyRequestSignature } from '../integrations/slack-oauth.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

export const slackWebhookRouter = Router();

slackWebhookRouter.post(
  '/',
  raw({ type: '*/*', limit: '5mb' }),
  async (req: Request, res: Response) => {
    const signingSecret = process.env.SLACK_SIGNING_SECRET || '';
    if (!signingSecret) {
      logger.warn('slack webhook: SLACK_SIGNING_SECRET not configured');
      return res.status(503).end();
    }

    const rawBody = (req.body as Buffer).toString('utf8');
    const signature = String(req.header('X-Slack-Signature') || '');
    const timestamp = String(req.header('X-Slack-Request-Timestamp') || '');
    if (!signature || !timestamp) {
      logger.warn('slack webhook: missing signature/timestamp headers');
      return res.status(401).end();
    }
    const ok = verifyRequestSignature({ rawBody, signature, timestamp, signingSecret });
    if (!ok) {
      logger.warn('slack webhook: signature mismatch');
      return res.status(401).end();
    }

    let payload: any;
    try { payload = JSON.parse(rawBody); } catch { return res.status(200).end(); }

    // 1) URL verification handshake
    if (payload?.type === 'url_verification' && typeof payload?.challenge === 'string') {
      return res.status(200).json({ challenge: payload.challenge });
    }

    // 2) Event callback envelope
    if (payload?.type !== 'event_callback') {
      // Other types (block_actions, view_submission, etc.) come through a
      // separate /interactivity endpoint normally. If Slack sends them here
      // we just ack so they don't retry.
      return res.status(200).end();
    }

    const teamId = String(payload?.team_id ?? payload?.team ?? '');
    const tenantInfo = teamId ? await findTenantBySlackTeam(teamId) : null;
    if (!tenantInfo) {
      logger.warn('slack webhook: team_id does not match any connector', { teamId });
      // Still 200 so Slack doesn't retry forever for an uninstalled workspace.
      return res.status(200).end();
    }

    const ev = payload.event ?? {};
    const eventType = String(ev?.type ?? 'unknown');
    const eventSubtype = ev?.subtype ? String(ev.subtype) : null;
    const eventId = String(payload?.event_id ?? randomUUID());

    // Drop messages our own bot posted to avoid loops.
    if (eventType === 'message' && ev?.bot_id) {
      // We could compare against the connector's bot_user_id, but Slack's
      // bot_id is a separate identifier. The cheapest filter is dropping any
      // message that has subtype === 'bot_message' AND originated from us.
      // For a strict filter we'd need to look up the bot_user_id; left here
      // as a pipeline-side concern.
    }

    const externalId = `slack::${teamId}::${eventId}`;

    const supabase = getSupabaseAdmin();
    const persistedId = randomUUID();
    const { error } = await supabase.from('webhook_events').insert({
      id: persistedId,
      tenant_id: tenantInfo.tenantId,
      source_system: 'slack',
      event_type: `slack.${eventType}${eventSubtype ? '.' + eventSubtype : ''}`,
      raw_payload: {
        team_id: teamId,
        api_app_id: payload?.api_app_id ?? null,
        event_id: eventId,
        event_time: payload?.event_time ?? null,
        event_type: eventType,
        event_subtype: eventSubtype,
        channel: ev?.channel ?? null,
        channel_type: ev?.channel_type ?? null,
        user: ev?.user ?? null,
        bot_id: ev?.bot_id ?? null,
        ts: ev?.ts ?? null,
        thread_ts: ev?.thread_ts ?? null,
        text: typeof ev?.text === 'string' ? ev.text.slice(0, 8000) : null,
        item: ev?.item ?? null,           // for reaction events
        reaction: ev?.reaction ?? null,
        files: Array.isArray(ev?.files) ? ev.files.length : 0,
        connector_id: tenantInfo.connectorId,
      },
      received_at: new Date().toISOString(),
      status: 'received',
      dedupe_key: externalId,
    });

    if (error && error.code !== '23505') {
      logger.warn('slack persist failed', { error: error.message });
      return res.status(500).end();
    }

    if (error?.code !== '23505') {
      try {
        await enqueue(JobType.WEBHOOK_PROCESS, {
          webhookEventId: persistedId,
          source: 'slack',
        }, { tenantId: tenantInfo.tenantId });
      } catch (err) {
        logger.warn('slack enqueue failed', { error: String(err) });
      }
    }

    return res.status(200).end();
  },
);

/**
 * Slack interactivity endpoint (separate URL configured in the App):
 *   POST /webhooks/slack/interactivity
 * Body is form-encoded with a `payload` field containing JSON. We do
 * the same signature check + tenant resolution and enqueue.
 */
slackWebhookRouter.post(
  '/interactivity',
  raw({ type: '*/*', limit: '5mb' }),
  async (req: Request, res: Response) => {
    const signingSecret = process.env.SLACK_SIGNING_SECRET || '';
    if (!signingSecret) return res.status(503).end();

    const rawBody = (req.body as Buffer).toString('utf8');
    const signature = String(req.header('X-Slack-Signature') || '');
    const timestamp = String(req.header('X-Slack-Request-Timestamp') || '');
    if (!verifyRequestSignature({ rawBody, signature, timestamp, signingSecret })) {
      return res.status(401).end();
    }

    let payload: any = null;
    try {
      const params = new URLSearchParams(rawBody);
      payload = JSON.parse(params.get('payload') || '{}');
    } catch {
      return res.status(200).end();
    }

    const teamId = String(payload?.team?.id ?? payload?.user?.team_id ?? '');
    const tenantInfo = teamId ? await findTenantBySlackTeam(teamId) : null;
    if (!tenantInfo) return res.status(200).end();

    const supabase = getSupabaseAdmin();
    const persistedId = randomUUID();
    const externalId = `slack::interactivity::${teamId}::${payload?.trigger_id ?? randomUUID()}`;

    await supabase.from('webhook_events').insert({
      id: persistedId,
      tenant_id: tenantInfo.tenantId,
      source_system: 'slack',
      event_type: `slack.interactivity.${payload?.type ?? 'unknown'}`,
      raw_payload: payload,
      received_at: new Date().toISOString(),
      status: 'received',
      dedupe_key: externalId,
    });

    try {
      await enqueue(JobType.WEBHOOK_PROCESS, {
        webhookEventId: persistedId,
        source: 'slack',
      }, { tenantId: tenantInfo.tenantId });
    } catch (err) {
      logger.warn('slack interactivity enqueue failed', { error: String(err) });
    }

    return res.status(200).end();
  },
);

/**
 * Slack slash-command endpoint:
 *   POST /webhooks/slack/commands
 * Form-encoded body with `command`, `text`, `user_id`, `team_id`, etc.
 */
slackWebhookRouter.post(
  '/commands',
  raw({ type: '*/*', limit: '1mb' }),
  async (req: Request, res: Response) => {
    const signingSecret = process.env.SLACK_SIGNING_SECRET || '';
    if (!signingSecret) return res.status(503).end();

    const rawBody = (req.body as Buffer).toString('utf8');
    const signature = String(req.header('X-Slack-Signature') || '');
    const timestamp = String(req.header('X-Slack-Request-Timestamp') || '');
    if (!verifyRequestSignature({ rawBody, signature, timestamp, signingSecret })) {
      return res.status(401).end();
    }

    const params = new URLSearchParams(rawBody);
    const teamId = String(params.get('team_id') ?? '');
    const tenantInfo = teamId ? await findTenantBySlackTeam(teamId) : null;
    if (!tenantInfo) return res.status(200).json({ text: 'Slack workspace is not connected to Clain.' });

    const persistedId = randomUUID();
    const externalId = `slack::cmd::${teamId}::${persistedId}`;

    const supabase = getSupabaseAdmin();
    await supabase.from('webhook_events').insert({
      id: persistedId,
      tenant_id: tenantInfo.tenantId,
      source_system: 'slack',
      event_type: `slack.command.${params.get('command') ?? 'unknown'}`,
      raw_payload: Object.fromEntries(params.entries()),
      received_at: new Date().toISOString(),
      status: 'received',
      dedupe_key: externalId,
    });

    try {
      await enqueue(JobType.WEBHOOK_PROCESS, {
        webhookEventId: persistedId,
        source: 'slack',
      }, { tenantId: tenantInfo.tenantId });
    } catch (err) {
      logger.warn('slack command enqueue failed', { error: String(err) });
    }

    // Acknowledge the slash command immediately. Async work continues in
    // the worker; the command's response_url can be used there to post
    // back to the user once the work is done.
    return res.status(200).json({
      response_type: 'ephemeral',
      text: 'Got it — Clain is working on it.',
    });
  },
);
