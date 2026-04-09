import { randomUUID } from 'crypto';
import { Router } from 'express';
import { config } from '../config.js';
import { getDb } from '../db/client.js';
import { registerDemoIntegrationAdapters } from '../demo/sandboxAdapters.js';
import { DEMO_SCENARIOS, getDemoScenario, type DemoChannelWebhook, type DemoScenario } from '../demo/scenarios.js';
import { extractMultiTenant, type MultiTenantRequest } from '../middleware/multiTenant.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';

const router = Router();

router.use(extractMultiTenant);

router.get('/scenarios', (_req, res) => {
  res.json({
    scenarios: DEMO_SCENARIOS.map(scenario => ({
      id: scenario.id,
      title: scenario.title,
      description: scenario.description,
      commerce_webhooks: scenario.commerceWebhooks.map(event => ({
        source: event.source,
        topic: event.topic,
        external_id: event.externalId,
      })),
      channel_webhooks: scenario.channelWebhooks.map(event => ({
        channel: event.channel,
        external_id: event.externalId,
      })),
    })),
  });
});

router.post('/scenarios/:id/run', (req: MultiTenantRequest, res) => {
  if (config.env === 'production') {
    res.status(403).json({ error: 'Demo scenario injection is disabled in production.' });
    return;
  }

  const scenarios = resolveScenarioSelection(req.params.id);
  if (!scenarios.length) {
    res.status(404).json({ error: 'Demo scenario not found.' });
    return;
  }

  registerDemoIntegrationAdapters(scenarios);

  const db = getDb();
  const runId = `demo:${new Date().toISOString()}:${randomUUID()}`;
  const tenantId = req.tenantId!;
  const workspaceId = req.workspaceId!;

  const created = {
    run_id: runId,
    scenarios: scenarios.map(scenario => scenario.id),
    webhook_events: [] as string[],
    canonical_events: [] as string[],
    jobs: [] as string[],
  };

  const insertCommerceWebhook = db.prepare(`
    INSERT OR IGNORE INTO webhook_events (
      id, tenant_id, source_system, event_type, raw_payload,
      received_at, status, dedupe_key
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'received', ?)
  `);

  const insertChannelEvent = db.prepare(`
    INSERT OR IGNORE INTO canonical_events (
      id, dedupe_key, tenant_id, workspace_id,
      source_system, source_entity_type, source_entity_id,
      event_type, event_category, occurred_at, ingested_at,
      canonical_entity_type, canonical_entity_id,
      normalized_payload, status, updated_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, 'customer', ?,
      'message.inbound', 'conversation', ?, CURRENT_TIMESTAMP,
      'customer', ?,
      ?, 'received', CURRENT_TIMESTAMP
    )
  `);

  for (const scenario of scenarios) {
    for (const event of scenario.commerceWebhooks) {
      const eventId = randomUUID();
      const dedupeKey = `${runId}:commerce:${scenario.id}:${event.source}:${event.topic}:${event.externalId}`;
      const rawBody = JSON.stringify(event.payload);

      insertCommerceWebhook.run(
        eventId,
        tenantId,
        event.source,
        event.topic,
        rawBody,
        dedupeKey,
      );

      const jobId = enqueue(
        JobType.WEBHOOK_PROCESS,
        {
          webhookEventId: eventId,
          source: event.source,
          rawBody,
          headers: event.headers,
        },
        { tenantId, workspaceId, traceId: runId, priority: 3 },
      );

      created.webhook_events.push(eventId);
      created.jobs.push(jobId);
    }

    for (const event of scenario.channelWebhooks) {
      const normalized = normalizeProviderChannelPayload(event);
      const eventId = randomUUID();
      const dedupeKey = `${runId}:channel:${scenario.id}:${event.channel}:${event.externalId}`;
      const payload = JSON.stringify({
        ...normalized,
        rawProviderPayload: event.payload,
      });

      insertChannelEvent.run(
        eventId,
        dedupeKey,
        tenantId,
        workspaceId,
        event.channel,
        normalized.senderId,
        normalized.sentAt,
        normalized.senderId,
        payload,
      );

      const jobId = enqueue(
        JobType.CHANNEL_INGEST,
        {
          canonicalEventId: eventId,
          channel: event.channel,
          rawMessageId: normalized.externalMessageId,
        },
        { tenantId, workspaceId, traceId: runId, priority: 2 },
      );

      created.canonical_events.push(eventId);
      created.jobs.push(jobId);
    }
  }

  res.status(202).json(created);
});

router.post('/reset', (req: MultiTenantRequest, res) => {
  if (config.env === 'production') {
    res.status(403).json({ error: 'Demo reset is disabled in production.' });
    return;
  }

  const full = Boolean(req.body?.full);
  const db = getDb();

  const result = {
    webhook_events: db.prepare(`DELETE FROM webhook_events WHERE dedupe_key LIKE 'demo:%'`).run().changes,
    canonical_events: db.prepare(`DELETE FROM canonical_events WHERE dedupe_key LIKE 'demo:%'`).run().changes,
    jobs: db.prepare(`DELETE FROM jobs WHERE trace_id LIKE 'demo:%'`).run().changes,
    full,
    entities: 0,
  };

  if (full) {
    const orderIds = DEMO_SCENARIOS.flatMap(scenario => scenario.shopifyOrders.map(order => order.externalId));
    const paymentIds = DEMO_SCENARIOS.flatMap(scenario => scenario.stripePayments.map(payment => payment.externalId));
    const customerIds = DEMO_SCENARIOS.map(scenario => scenario.customer.externalId);

    result.entities += deleteMany('orders', 'external_order_id', orderIds);
    result.entities += deleteMany('payments', 'external_payment_id', paymentIds);
    result.entities += deleteMany('linked_identities', 'external_id', [...orderIds, ...paymentIds, ...customerIds]);
  }

  res.json({ ok: true, deleted: result });
});

function resolveScenarioSelection(id: string): DemoScenario[] {
  if (id === 'all') {
    return DEMO_SCENARIOS;
  }
  const scenario = getDemoScenario(id);
  return scenario ? [scenario] : [];
}

function normalizeProviderChannelPayload(event: DemoChannelWebhook): {
  messageContent: string;
  senderId: string;
  senderName: string | null;
  channel: 'email' | 'whatsapp';
  externalMessageId: string;
  sentAt: string;
  subject?: string;
  attachments?: string[];
} {
  if (event.channel === 'whatsapp') {
    const entry = (event.payload.entry as any[])?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value ?? {};
    const message = value.messages?.[0] ?? {};
    const contact = value.contacts?.[0] ?? {};
    const timestamp = Number.parseInt(message.timestamp ?? `${Math.floor(Date.now() / 1000)}`, 10);

    return {
      messageContent: message.text?.body ?? '',
      senderId: message.from ?? contact.wa_id ?? 'unknown_whatsapp_sender',
      senderName: contact.profile?.name ?? null,
      channel: 'whatsapp',
      externalMessageId: message.id ?? event.externalId,
      sentAt: new Date(timestamp * 1000).toISOString(),
    };
  }

  const from = String(event.payload.From ?? event.payload.from ?? '');
  const emailMatch = from.match(/<([^>]+)>/) ?? [null, from];
  const senderEmail = (emailMatch[1] ?? from).trim().toLowerCase();
  const displayName = from.match(/^([^<]+)<[^>]+>/)?.[1]?.trim() ?? null;

  return {
    messageContent: String(event.payload.TextBody ?? event.payload.text ?? ''),
    senderId: senderEmail,
    senderName: displayName,
    channel: 'email',
    externalMessageId: String(event.payload.MessageID ?? event.payload['message-id'] ?? event.externalId),
    sentAt: new Date(String(event.payload.Date ?? event.payload.date ?? new Date().toISOString())).toISOString(),
    subject: String(event.payload.Subject ?? event.payload.subject ?? ''),
    attachments: Array.isArray(event.payload.Attachments)
      ? event.payload.Attachments.map((attachment: any) => attachment.Name ?? 'attachment')
      : [],
  };
}

function deleteMany(table: string, column: string, values: string[]): number {
  if (!values.length) return 0;
  const placeholders = values.map(() => '?').join(', ');
  return getDb().prepare(`DELETE FROM ${table} WHERE ${column} IN (${placeholders})`).run(...values).changes;
}

export default router;
