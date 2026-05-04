/**
 * server/queue/handlers/webhookProcess.ts
 *
 * Handler for the WEBHOOK_PROCESS job type.
 *
 * Responsibilities:
 *  1. Load the raw webhook_event from DB
 *  2. Parse the payload and extract entity type / entity ID
 *  3. Create (or find existing) canonical_event record with deduplication
 *  4. Mark webhook_event as processed
 *  5. Enqueue CANONICALIZE job to continue the pipeline
 *
 * This handler is deliberately lightweight — it only creates the canonical
 * event record and hands off. Heavy work (API calls, reconciliation) happens
 * in later pipeline stages.
 */

import { randomUUID } from 'crypto';
import { createIntegrationRepository } from '../../data/integrations.js';
import { createCanonicalRepository } from '../../data/canonical.js';
import { createCaseRepository, createCommerceRepository, createCustomerRepository } from '../../data/index.js';
import { enqueue } from '../client.js';
import { JobType } from '../types.js';
import { logger } from '../../utils/logger.js';
import { registerHandler } from './index.js';
import { requireScope } from '../../lib/scope.js';
import { fireWorkflowEvent } from '../../lib/workflowEventBus.js';
import { broadcastSSE } from '../../routes/sse.js';
import type { WebhookProcessPayload, JobContext } from '../types.js';

// ── Topic → canonical entity type mapping ─────────────────────────────────────

interface EntityExtraction {
  entityType:  string;
  entityId:    string | null;
  eventCategory: string;
}

function extractShopify(topic: string, body: Record<string, any>): EntityExtraction {
  if (topic.startsWith('orders/')) {
    return {
      entityType:    'order',
      entityId:      body.id ? String(body.id) : null,
      eventCategory: 'commerce',
    };
  }
  if (topic.startsWith('refunds/')) {
    return {
      entityType:    'refund',
      entityId:      body.id ? String(body.id) : null,
      eventCategory: 'commerce',
    };
  }
  if (topic.startsWith('customers/')) {
    return {
      entityType:    'customer',
      entityId:      body.id ? String(body.id) : null,
      eventCategory: 'customer',
    };
  }
  return { entityType: 'unknown', entityId: null, eventCategory: 'unknown' };
}

function extractStripe(eventType: string, body: Record<string, any>): EntityExtraction {
  const obj = body.data?.object ?? {};

  if (eventType.startsWith('payment_intent.')) {
    return {
      entityType:    'payment',
      entityId:      obj.id ?? body.id ?? null,
      eventCategory: 'payment',
    };
  }
  if (eventType.startsWith('charge.refunded') || eventType.startsWith('refund.')) {
    return {
      entityType:    'refund',
      entityId:      obj.id ?? null,
      eventCategory: 'payment',
    };
  }
  if (eventType.startsWith('charge.dispute.')) {
    return {
      entityType:    'dispute',
      entityId:      obj.id ?? null,
      eventCategory: 'payment',
    };
  }
  if (eventType.startsWith('customer.')) {
    return {
      entityType:    'customer',
      entityId:      obj.id ?? null,
      eventCategory: 'customer',
    };
  }
  if (eventType.startsWith('invoice.')) {
    return {
      entityType:    'invoice',
      entityId:      obj.id ?? null,
      eventCategory: 'billing',
    };
  }
  return { entityType: 'unknown', entityId: null, eventCategory: 'unknown' };
}

// ── Channel inbound (customer-facing messaging) ─────────────────────────────

function extractWhatsApp(topic: string, body: Record<string, any>): EntityExtraction {
  const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0] ?? body?.message ?? body;
  return { entityType: 'message', entityId: msg?.id ?? body?.message_id ?? null, eventCategory: 'inbox' };
}
function extractMessenger(topic: string, body: Record<string, any>): EntityExtraction {
  const msg = body?.entry?.[0]?.messaging?.[0] ?? body;
  return { entityType: 'message', entityId: msg?.message?.mid ?? msg?.timestamp ?? null, eventCategory: 'inbox' };
}
function extractInstagram(topic: string, body: Record<string, any>): EntityExtraction {
  const ev = body?.entry?.[0]?.messaging?.[0] ?? body?.entry?.[0]?.changes?.[0] ?? body;
  return { entityType: 'message', entityId: ev?.message?.mid ?? ev?.value?.id ?? null, eventCategory: 'inbox' };
}
function extractTelegram(topic: string, body: Record<string, any>): EntityExtraction {
  const m = body?.message ?? body?.callback_query?.message ?? body;
  return { entityType: 'message', entityId: m?.message_id != null ? String(m.message_id) : null, eventCategory: 'inbox' };
}
function extractTwilio(topic: string, body: Record<string, any>): EntityExtraction {
  return { entityType: 'message', entityId: body?.MessageSid ?? body?.SmsSid ?? null, eventCategory: 'inbox' };
}
function extractGmail(topic: string, body: Record<string, any>): EntityExtraction {
  return { entityType: 'message', entityId: body?.message?.data ?? body?.historyId ?? null, eventCategory: 'inbox' };
}
function extractOutlook(topic: string, body: Record<string, any>): EntityExtraction {
  const r = body?.value?.[0]?.resourceData ?? {};
  return { entityType: 'message', entityId: r?.id ?? null, eventCategory: 'inbox' };
}
function extractPostmark(topic: string, body: Record<string, any>): EntityExtraction {
  return { entityType: body?.RecordType === 'Inbound' ? 'message' : 'email_event', entityId: body?.MessageID ?? null, eventCategory: body?.RecordType === 'Inbound' ? 'inbox' : 'email' };
}
function extractDiscord(topic: string, body: Record<string, any>): EntityExtraction {
  return { entityType: 'interaction', entityId: body?.id ?? null, eventCategory: 'inbox' };
}
function extractSlack(topic: string, body: Record<string, any>): EntityExtraction {
  const ev = body?.event ?? body;
  return { entityType: 'message', entityId: ev?.ts ?? ev?.event_ts ?? null, eventCategory: 'team_chat' };
}
function extractTeams(topic: string, body: Record<string, any>): EntityExtraction {
  return { entityType: 'message', entityId: body?.value?.[0]?.resourceData?.id ?? null, eventCategory: 'team_chat' };
}
function extractAircall(topic: string, body: Record<string, any>): EntityExtraction {
  return { entityType: 'call', entityId: body?.data?.id != null ? String(body.data.id) : null, eventCategory: 'voice' };
}
function extractZoom(topic: string, body: Record<string, any>): EntityExtraction {
  const m = body?.payload?.object ?? {};
  if (topic.startsWith('recording.')) return { entityType: 'recording', entityId: m?.uuid ?? m?.id ?? null, eventCategory: 'voice' };
  return { entityType: 'meeting', entityId: m?.uuid ?? m?.id ?? null, eventCategory: 'voice' };
}

// ── Support inboxes ───────────────────────────────────────────────────────────

function extractIntercom(topic: string, body: Record<string, any>): EntityExtraction {
  if (topic.startsWith('intercom.conversation.') || topic.includes('conversation')) {
    return { entityType: 'conversation', entityId: body?.data?.item?.id ?? null, eventCategory: 'support' };
  }
  if (topic.includes('contact')) return { entityType: 'contact', entityId: body?.data?.item?.id ?? null, eventCategory: 'customer' };
  return { entityType: 'unknown', entityId: null, eventCategory: 'support' };
}
function extractZendesk(topic: string, body: Record<string, any>): EntityExtraction {
  if (topic.includes('ticket')) return { entityType: 'ticket', entityId: body?.ticket?.id != null ? String(body.ticket.id) : null, eventCategory: 'support' };
  return { entityType: 'unknown', entityId: null, eventCategory: 'support' };
}
function extractFront(topic: string, body: Record<string, any>): EntityExtraction {
  return { entityType: 'conversation', entityId: body?.conversation?.id ?? body?.target?.data?.id ?? null, eventCategory: 'support' };
}

// ── Engineering / project mgmt ────────────────────────────────────────────────

function extractLinear(topic: string, body: Record<string, any>): EntityExtraction {
  const t = String(body?.type ?? '').toLowerCase();
  if (t === 'comment') return { entityType: 'issue_comment', entityId: body?.data?.id ?? null, eventCategory: 'engineering' };
  return { entityType: 'issue', entityId: body?.data?.id ?? null, eventCategory: 'engineering' };
}
function extractJira(topic: string, body: Record<string, any>): EntityExtraction {
  if (topic.startsWith('jira.comment_') || topic.includes('comment')) return { entityType: 'issue_comment', entityId: body?.comment?.id ?? null, eventCategory: 'engineering' };
  return { entityType: 'issue', entityId: body?.issue?.id ?? null, eventCategory: 'engineering' };
}
function extractGithub(topic: string, body: Record<string, any>): EntityExtraction {
  if (topic.startsWith('github.issues') || topic.startsWith('github.issue_comment')) {
    return { entityType: topic.includes('comment') ? 'issue_comment' : 'issue', entityId: body?.issue?.number != null ? String(body.issue.number) : null, eventCategory: 'engineering' };
  }
  if (topic.startsWith('github.pull_request')) return { entityType: 'pull_request', entityId: body?.pull_request?.number != null ? String(body.pull_request.number) : null, eventCategory: 'engineering' };
  return { entityType: 'unknown', entityId: null, eventCategory: 'engineering' };
}
function extractGitlab(topic: string, body: Record<string, any>): EntityExtraction {
  const kind = String(body?.object_kind ?? '').toLowerCase();
  if (kind === 'issue') return { entityType: 'issue', entityId: body?.object_attributes?.iid != null ? String(body.object_attributes.iid) : null, eventCategory: 'engineering' };
  if (kind === 'merge_request') return { entityType: 'merge_request', entityId: body?.object_attributes?.iid != null ? String(body.object_attributes.iid) : null, eventCategory: 'engineering' };
  if (kind === 'note') return { entityType: 'issue_comment', entityId: body?.object_attributes?.id != null ? String(body.object_attributes.id) : null, eventCategory: 'engineering' };
  return { entityType: 'unknown', entityId: null, eventCategory: 'engineering' };
}
function extractSentry(topic: string, body: Record<string, any>): EntityExtraction {
  const issue = body?.data?.issue ?? body?.issue;
  if (issue) return { entityType: 'sentry_issue', entityId: issue?.id != null ? String(issue.id) : null, eventCategory: 'errors' };
  if (body?.data?.event) return { entityType: 'error_event', entityId: body?.data?.event?.event_id ?? null, eventCategory: 'errors' };
  return { entityType: 'unknown', entityId: null, eventCategory: 'errors' };
}
function extractAsana(topic: string, body: Record<string, any>): EntityExtraction {
  const ev = body?.events?.[0];
  if (ev?.resource?.resource_type === 'task') return { entityType: 'task', entityId: ev.resource.gid ?? null, eventCategory: 'productivity' };
  return { entityType: 'unknown', entityId: null, eventCategory: 'productivity' };
}

// ── CRM / Commerce / Payments ─────────────────────────────────────────────────

function extractWoocommerce(topic: string, body: Record<string, any>): EntityExtraction {
  if (topic.includes('order')) return { entityType: 'order', entityId: body?.id != null ? String(body.id) : null, eventCategory: 'commerce' };
  if (topic.includes('customer')) return { entityType: 'customer', entityId: body?.id != null ? String(body.id) : null, eventCategory: 'customer' };
  return { entityType: 'unknown', entityId: null, eventCategory: 'commerce' };
}
function extractPaypal(topic: string, body: Record<string, any>): EntityExtraction {
  const t = String(body?.event_type ?? topic ?? '');
  if (t.includes('PAYMENT')) return { entityType: 'payment', entityId: body?.resource?.id ?? null, eventCategory: 'payment' };
  if (t.includes('REFUND')) return { entityType: 'refund', entityId: body?.resource?.id ?? null, eventCategory: 'payment' };
  if (t.includes('DISPUTE')) return { entityType: 'dispute', entityId: body?.resource?.dispute_id ?? body?.resource?.id ?? null, eventCategory: 'payment' };
  return { entityType: 'unknown', entityId: null, eventCategory: 'payment' };
}
function extractHubspot(topic: string, body: Record<string, any>): EntityExtraction {
  const ev = Array.isArray(body) ? body[0] : body?.events?.[0] ?? body;
  const sub = String(ev?.subscriptionType ?? topic ?? '');
  if (sub.includes('contact')) return { entityType: 'contact', entityId: ev?.objectId != null ? String(ev.objectId) : null, eventCategory: 'crm' };
  if (sub.includes('deal')) return { entityType: 'deal', entityId: ev?.objectId != null ? String(ev.objectId) : null, eventCategory: 'crm' };
  if (sub.includes('ticket')) return { entityType: 'ticket', entityId: ev?.objectId != null ? String(ev.objectId) : null, eventCategory: 'support' };
  return { entityType: 'unknown', entityId: null, eventCategory: 'crm' };
}
function extractSalesforce(topic: string, body: Record<string, any>): EntityExtraction {
  return { entityType: body?.sobject?.attributes?.type?.toLowerCase?.() ?? 'sf_record', entityId: body?.sobject?.Id ?? null, eventCategory: 'crm' };
}
function extractPipedrive(topic: string, body: Record<string, any>): EntityExtraction {
  const m = body?.meta ?? {};
  const obj = String(m?.object ?? topic ?? '');
  if (obj === 'deal') return { entityType: 'deal', entityId: m?.id != null ? String(m.id) : null, eventCategory: 'crm' };
  if (obj === 'person') return { entityType: 'contact', entityId: m?.id != null ? String(m.id) : null, eventCategory: 'crm' };
  if (obj === 'organization') return { entityType: 'organization', entityId: m?.id != null ? String(m.id) : null, eventCategory: 'crm' };
  return { entityType: 'unknown', entityId: null, eventCategory: 'crm' };
}
function extractDocusign(topic: string, body: Record<string, any>): EntityExtraction {
  return { entityType: 'envelope', entityId: body?.data?.envelopeId ?? null, eventCategory: 'sales' };
}
function extractQuickbooks(topic: string, body: Record<string, any>): EntityExtraction {
  return { entityType: String(body?.entity_type ?? 'qb_record').toLowerCase(), entityId: body?.entity_id ?? null, eventCategory: 'accounting' };
}
function extractPlaid(topic: string, body: Record<string, any>): EntityExtraction {
  return { entityType: 'plaid_item', entityId: body?.item_id ?? null, eventCategory: 'finance' };
}

// ── Knowledge / Marketing / Data ──────────────────────────────────────────────

function extractMailchimp(topic: string, body: Record<string, any>): EntityExtraction {
  return { entityType: 'subscriber', entityId: body?.email ?? null, eventCategory: 'marketing' };
}
function extractKlaviyo(topic: string, body: Record<string, any>): EntityExtraction {
  return { entityType: 'profile', entityId: body?.profile_id ?? body?.email ?? null, eventCategory: 'marketing' };
}
function extractSegment(topic: string, body: Record<string, any>): EntityExtraction {
  return { entityType: 'segment_event', entityId: body?.message_id ?? null, eventCategory: 'data' };
}
function extractGcalendar(topic: string, body: Record<string, any>): EntityExtraction {
  return { entityType: 'calendar_change', entityId: body?.calendar_id ?? null, eventCategory: 'productivity' };
}
function extractGdrive(topic: string, body: Record<string, any>): EntityExtraction {
  return { entityType: 'drive_change', entityId: body?.resource_id ?? null, eventCategory: 'knowledge' };
}
function extractCalendly(topic: string, body: Record<string, any>): EntityExtraction {
  return { entityType: 'scheduled_event', entityId: body?.payload?.uri ?? null, eventCategory: 'scheduling' };
}
function extractUps(topic: string, body: Record<string, any>): EntityExtraction {
  return { entityType: 'shipment', entityId: body?.trackingNumber ?? body?.tracking_number ?? null, eventCategory: 'shipping' };
}
function extractDhl(topic: string, body: Record<string, any>): EntityExtraction {
  return { entityType: 'shipment', entityId: body?.shipment?.id ?? body?.trackingNumber ?? null, eventCategory: 'shipping' };
}

// ── Source dispatcher ────────────────────────────────────────────────────────

const EXTRACTORS: Record<string, (topic: string, body: Record<string, any>) => EntityExtraction> = {
  shopify: extractShopify, stripe: extractStripe,
  whatsapp: extractWhatsApp, messenger: extractMessenger, instagram: extractInstagram, telegram: extractTelegram,
  twilio: extractTwilio, gmail: extractGmail, outlook: extractOutlook, postmark: extractPostmark,
  discord: extractDiscord, slack: extractSlack, teams: extractTeams, aircall: extractAircall, zoom: extractZoom,
  intercom: extractIntercom, zendesk: extractZendesk, front: extractFront,
  linear: extractLinear, jira: extractJira, github: extractGithub, gitlab: extractGitlab,
  sentry: extractSentry, asana: extractAsana,
  woocommerce: extractWoocommerce, paypal: extractPaypal,
  hubspot: extractHubspot, salesforce: extractSalesforce, pipedrive: extractPipedrive, docusign: extractDocusign,
  quickbooks: extractQuickbooks, plaid: extractPlaid,
  mailchimp: extractMailchimp, klaviyo: extractKlaviyo, segment: extractSegment,
  gcalendar: extractGcalendar, gdrive: extractGdrive, calendly: extractCalendly,
  ups: extractUps, dhl: extractDhl,
};

// ── Handler ───────────────────────────────────────────────────────────────────

async function handleWebhookProcess(
  payload: WebhookProcessPayload,
  ctx: JobContext
): Promise<void> {
  const log = logger.child({
    jobId:          ctx.jobId,
    webhookEventId: payload.webhookEventId,
    source:         payload.source,
    traceId:        ctx.traceId,
  });

  const integrationRepo = createIntegrationRepository();
  const canonicalRepo   = createCanonicalRepository();
  const scope = requireScope(ctx, 'webhookProcess');

  // ── 1. Load raw webhook event ────────────────────────────────────────────
  const webhookRow = await integrationRepo.getWebhookEvent(scope, payload.webhookEventId);

  if (!webhookRow) {
    log.warn('Webhook event not found in DB — may have been deleted');
    return;
  }

  if (webhookRow.status === 'processed') {
    log.debug('Webhook event already processed, skipping');
    return;
  }

  // ── 2. Parse payload ─────────────────────────────────────────────────────
  // raw_payload may come back as a plain object (JSONB) from Supabase or as a
  // JSON string when the event was stored that way. Handle both cases.
  let parsedBody: Record<string, any>;
  try {
    const rawData = webhookRow.raw_payload;
    if (rawData && typeof rawData === 'object') {
      parsedBody = rawData as Record<string, any>;
    } else {
      parsedBody = JSON.parse(rawData || payload.rawBody);
    }
  } catch {
    log.warn('Webhook has invalid JSON body — marking as failed to avoid loop');
    await integrationRepo.updateWebhookEventStatus(scope, payload.webhookEventId, 'failed');
    return;
  }

  // ── 3. Extract entity info ───────────────────────────────────────────────
  const topic = webhookRow.event_type as string;
  let extraction: EntityExtraction;

  const ex = EXTRACTORS[payload.source];
  extraction = ex ? ex(topic, parsedBody) : { entityType: 'unknown', entityId: null, eventCategory: 'unknown' };

  // ── 4. Determine occurred_at ─────────────────────────────────────────────
  let occurredAt: string;
  if (payload.source === 'shopify') {
    occurredAt = parsedBody.updated_at ?? parsedBody.created_at ?? new Date().toISOString();
  } else if (payload.source === 'stripe') {
    const unixTs = parsedBody.created;
    occurredAt = unixTs
      ? new Date(unixTs * 1000).toISOString()
      : new Date().toISOString();
  } else {
    occurredAt = new Date().toISOString();
  }

  // ── 5. Upsert canonical_event (deduplication by topic + entityId + source) ─
  const canonicalDedupeKey =
    `${payload.source}:${topic}:${extraction.entityId ?? randomUUID()}`;

  let canonicalEventId: string;
  const existing = await canonicalRepo.getEventByDedupeKey(scope, canonicalDedupeKey);

  if (existing) {
    canonicalEventId = existing.id;
    log.debug('Canonical event already exists', { canonicalEventId });
  } else {
    canonicalEventId = randomUUID();

    await canonicalRepo.createEvent(scope, {
      id: canonicalEventId,
      dedupeKey: canonicalDedupeKey,
      sourceSystem: payload.source,
      sourceEntityType: extraction.entityType,
      sourceEntityId: extraction.entityId || 'unknown',
      eventType: topic,
      eventCategory: extraction.eventCategory,
      occurredAt,
      normalizedPayload: JSON.stringify({
        rawEventId:  payload.webhookEventId,
        source:      payload.source,
        topic,
        entityType:  extraction.entityType,
        entityId:    extraction.entityId,
      }),
      status: 'received'
    });

    log.info('Canonical event created', {
      canonicalEventId,
      entityType: extraction.entityType,
      entityId:   extraction.entityId,
      topic,
    });
  }

  // ── 6. Mark webhook_event as processed ───────────────────────────────────
  await integrationRepo.updateWebhookEventStatus(scope, payload.webhookEventId, 'processed', {
    canonical_event_id: canonicalEventId,
  });

  // ── 7. Enqueue CANONICALIZE job ───────────────────────────────────────────
  enqueue(
    JobType.CANONICALIZE,
    { canonicalEventId },
    {
      tenantId:    scope.tenantId,
      workspaceId: scope.workspaceId,
      traceId:     ctx.traceId,
      priority:    5,
    }
  );

  log.debug('CANONICALIZE job enqueued', { canonicalEventId });

  // ── 8. Auto-create case + fire workflow event for high-value topics ────────
  // Run asynchronously — never block the job completion
  setImmediate(() => {
    void autoCreateCaseAndFireEvent(scope, payload.source, topic, parsedBody, extraction, log)
      .catch((err) => log.warn('webhookProcess: auto-case/event dispatch failed', { error: String(err?.message ?? err) }));
  });
}

// ── Topics that should automatically create a CRM case ───────────────────────

/**
 * Topics that should automatically open a CRM case.
 * Format: `<source>:<topic>` so we can disambiguate cross-source.
 * For convenience the legacy bare topics (Shopify/Stripe) are also accepted.
 */
const CASE_AUTO_CREATE_TOPICS = new Set<string>([
  // Shopify
  'orders/cancelled', 'refunds/create', 'orders/fulfilled',
  'shopify:orders/cancelled', 'shopify:refunds/create', 'shopify:orders/fulfilled',
  // Stripe
  'charge.dispute.created', 'charge.dispute.funds_withdrawn',
  'payment_intent.payment_failed', 'charge.failed', 'charge.refunded',
  'stripe:charge.dispute.created', 'stripe:charge.dispute.funds_withdrawn',
  'stripe:payment_intent.payment_failed', 'stripe:charge.failed', 'stripe:charge.refunded',
  // PayPal
  'paypal:PAYMENT.CAPTURE.DENIED', 'paypal:CUSTOMER.DISPUTE.CREATED', 'paypal:PAYMENT.REFUNDED',
  // WooCommerce
  'woocommerce:order.refunded', 'woocommerce:order.cancelled',
  // Inbound customer messaging — every channel auto-opens a support case
  'whatsapp:messages.received', 'whatsapp:whatsapp.message.received',
  'messenger:messenger.message.received',
  'instagram:instagram.message.received',
  'telegram:telegram.message.received',
  'twilio:sms.received',
  'gmail:gmail.message.received',
  'outlook:outlook.message.received',
  'postmark:Inbound',
  // Voice channels
  'aircall:call.voicemail_left', 'aircall:call.unanswered', 'aircall:call.transcription_available',
  'zoom:recording.completed', 'zoom:recording.transcript_completed',
  // Engineering escalation (errors → cases). Sentry's webhook handler stores
  // event_type as `sentry.<resource>.<action>`, so we accept both shapes.
  'sentry:issue.created', 'sentry:issue.assigned', 'sentry:event.alert',
  'sentry:sentry.issue.created', 'sentry:sentry.issue.assigned',
  'sentry:sentry.event.alert', 'sentry:sentry.event_alert.unknown',
  // Scheduling
  'calendly:invitee.created',
  // Signature lifecycle (signed contract triggers a celebrate-or-onboarding case)
  'docusign:envelope-completed', 'docusign:envelope-declined', 'docusign:envelope-voided',
  // Bank linking failure
  'plaid:ITEM.ITEM_LOGIN_REQUIRED', 'plaid:ITEM.ERROR',
]);

/**
 * Map (source, topic) → canonical workflow event type so automations and
 * AI-agent triggers can subscribe to a single normalized vocabulary across
 * every connected integration. Falls back to `<source>.<topic>` when no
 * canonical mapping is known.
 */
function topicToWorkflowEvent(source: string, topic: string): string {
  // Source-specific overrides (more specific than the global map)
  if (source === 'shopify') {
    if (topic.startsWith('orders/'))    return 'order.updated';
    if (topic.startsWith('refunds/'))   return 'payment.refunded';
    if (topic === 'customers/create')   return 'customer.created';
    if (topic === 'customers/update')   return 'customer.updated';
  }
  if (source === 'stripe') {
    if (topic.startsWith('charge.dispute.')) return topic.endsWith('.closed') ? 'payment.dispute.updated' : 'payment.dispute.created';
    if (topic === 'payment_intent.succeeded') return 'payment.updated';
    if (topic === 'payment_intent.payment_failed' || topic === 'charge.failed') return 'payment.failed';
    if (topic === 'charge.refunded' || topic.startsWith('refund.')) return 'payment.refunded';
    if (topic.startsWith('customer.')) return topic.endsWith('.created') ? 'customer.created' : 'customer.updated';
    if (topic.startsWith('invoice.')) return 'invoice.updated';
  }
  if (source === 'woocommerce') {
    if (topic.includes('order.refunded')) return 'payment.refunded';
    if (topic.includes('order')) return 'order.updated';
    if (topic.includes('customer')) return 'customer.updated';
  }
  if (source === 'paypal') {
    if (topic.includes('REFUND'))  return 'payment.refunded';
    if (topic.includes('DISPUTE')) return 'payment.dispute.created';
    if (topic.includes('PAYMENT')) return 'payment.updated';
  }

  // Channels (inbound customer messaging) → unified inbox.message.received
  const channelInboxSources = new Set(['whatsapp', 'messenger', 'instagram', 'telegram', 'twilio', 'gmail', 'outlook', 'postmark', 'discord']);
  if (channelInboxSources.has(source)) {
    if (topic.includes('received') || topic.includes('message') || (source === 'postmark' && topic === 'Inbound')) {
      return 'inbox.message.received';
    }
  }

  // Voice
  if (source === 'aircall') {
    if (topic.includes('transcription')) return 'voice.transcript.available';
    if (topic.includes('recording'))     return 'voice.recording.available';
    if (topic.includes('hungup') || topic.includes('unanswered') || topic.includes('voicemail')) return 'voice.call.completed';
  }
  if (source === 'zoom') {
    if (topic.startsWith('recording.transcript')) return 'voice.transcript.available';
    if (topic.startsWith('recording.'))           return 'voice.recording.available';
    if (topic.startsWith('meeting.'))             return 'meeting.updated';
  }

  // Support inboxes
  if (source === 'intercom') {
    if (topic.includes('conversation')) return 'support.conversation.updated';
    if (topic.includes('contact'))      return 'customer.updated';
  }
  if (source === 'zendesk') {
    if (topic.includes('ticket')) return 'support.ticket.updated';
  }
  if (source === 'front') {
    if (topic.includes('inbound') || topic.includes('message')) return 'inbox.message.received';
    if (topic.includes('conversation')) return 'support.conversation.updated';
  }

  // Engineering / PM
  if (['linear', 'jira', 'github', 'gitlab'].includes(source)) {
    if (topic.includes('comment')) return 'engineering.issue.commented';
    if (topic.includes('issue') || topic.includes('Issue')) return 'engineering.issue.updated';
    if (topic.includes('pull') || topic.includes('merge_request')) return 'engineering.pr.updated';
  }
  if (source === 'sentry') {
    if (topic.includes('issue')) return 'engineering.error.alert';
    if (topic.includes('event')) return 'engineering.error.alert';
  }
  if (source === 'asana') return 'engineering.task.updated';

  // CRM
  if (source === 'hubspot') {
    if (topic.includes('contact')) return 'crm.contact.updated';
    if (topic.includes('deal'))    return 'crm.deal.updated';
    if (topic.includes('ticket'))  return 'support.ticket.updated';
  }
  if (source === 'salesforce') return 'crm.record.updated';
  if (source === 'pipedrive') {
    if (topic.includes('deal')) return 'crm.deal.updated';
    if (topic.includes('person')) return 'crm.contact.updated';
    if (topic.includes('organization')) return 'crm.organization.updated';
  }

  // Marketing
  if (source === 'mailchimp') {
    if (topic === 'subscribe' || topic.includes('subscribed')) return 'marketing.subscribed';
    if (topic === 'unsubscribe' || topic.includes('unsubscribed')) return 'marketing.unsubscribed';
  }
  if (source === 'klaviyo') {
    if (topic.includes('subscribed')) return 'marketing.subscribed';
    if (topic.includes('unsubscribed')) return 'marketing.unsubscribed';
    if (topic.includes('profile')) return 'customer.updated';
  }
  if (source === 'segment') return 'data.event.tracked';

  // Sales / contracts
  if (source === 'docusign') {
    if (topic.includes('completed')) return 'contract.signed';
    if (topic.includes('declined') || topic.includes('voided')) return 'contract.cancelled';
    return 'contract.updated';
  }

  // Accounting
  if (source === 'quickbooks') return 'accounting.record.updated';

  // Banking
  if (source === 'plaid') {
    if (topic.includes('LOGIN_REQUIRED') || topic.includes('ERROR')) return 'banking.connection.broken';
    if (topic.includes('TRANSACTIONS')) return 'banking.transactions.updated';
  }

  // Scheduling
  if (source === 'calendly') {
    if (topic.includes('invitee.created')) return 'meeting.scheduled';
    if (topic.includes('invitee.canceled')) return 'meeting.cancelled';
  }
  if (source === 'gcalendar') return 'calendar.changed';

  // Knowledge
  if (source === 'gdrive') return 'knowledge.changed';

  // Shipping
  if (['ups', 'dhl'].includes(source)) return 'shipping.updated';

  // Team chat (case-insensitive — Slack uses 'message', Teams uses 'chatMessage')
  if (['slack', 'teams'].includes(source)) {
    if (topic.toLowerCase().includes('message')) return 'team_chat.message';
  }

  return `${source}.${topic.replace(/\//g, '.')}`;
}

async function autoCreateCaseAndFireEvent(
  scope: { tenantId: string; workspaceId: string },
  source: string,
  topic: string,
  body: Record<string, any>,
  extraction: EntityExtraction,
  log: ReturnType<typeof logger.child>,
): Promise<void> {
  const caseRepo     = createCaseRepository();
  const commerceRepo = createCommerceRepository();
  const customerRepo = createCustomerRepository();

  // ── Auto-create case for high-value events ──────────────────────────────
  // Match either bare topic or `<source>:<topic>` so we can disambiguate.
  const autoCreateMatch = CASE_AUTO_CREATE_TOPICS.has(topic) || CASE_AUTO_CREATE_TOPICS.has(`${source}:${topic}`);
  if (autoCreateMatch) {
    try {
      // Determine case type + summary from the event
      const { caseType, summary, priority, caseSubType } = classifyWebhookForCase(source, topic, body);

      // Look up existing order/payment in our DB to link the case
      let orderId: string | null = null;
      let paymentId: string | null = null;
      let customerId: string | null = null;

      if (extraction.entityType === 'order' && extraction.entityId) {
        const orders = await commerceRepo.listOrders(scope, { q: extraction.entityId });
        const order = orders.find((o: any) => o.external_order_id === extraction.entityId || o.id === extraction.entityId);
        if (order) {
          orderId = (order as any).id;
          customerId = (order as any).customer_id ?? null;
        }
      } else if ((extraction.entityType === 'payment' || extraction.entityType === 'refund' || extraction.entityType === 'dispute') && extraction.entityId) {
        // Find by external ID
        const allPayments = await commerceRepo.listPayments(scope, { q: extraction.entityId });
        const payment = allPayments.find((p: any) => p.external_payment_id === extraction.entityId || p.id === extraction.entityId);
        if (payment) {
          paymentId = (payment as any).id;
          customerId = (payment as any).customer_id ?? null;
        }
      } else if (extraction.entityType === 'customer' && extraction.entityId) {
        const customers = await customerRepo.list(scope, { q: extraction.entityId });
        const customer = customers.find((c: any) => c.external_id === extraction.entityId || c.id === extraction.entityId);
        if (customer) customerId = (customer as any).id;
      }

      // Generate next sequential case number (e.g. CS-0042)
      const caseNumber = await caseRepo.getNextCaseNumber(scope);

      // Create the case — use the actual DB column names:
      //  source_system / source_channel  instead of source
      //  ai_diagnosis                    instead of description
      //  order_ids / payment_ids         (arrays) instead of order_id / payment_id
      const caseId = await caseRepo.createCase(scope, {
        id:             randomUUID(),
        case_number:    caseNumber,
        tenant_id:      scope.tenantId,
        workspace_id:   scope.workspaceId,
        type:           caseType,
        sub_type:       caseSubType ?? null,
        status:         'open',
        priority,
        source_system:  `webhook:${source}`,
        source_channel: source,
        ai_diagnosis:   summary,
        customer_id:    customerId ?? null,
        order_ids:      orderId ? [orderId] : null,
        payment_ids:    paymentId ? [paymentId] : null,
        tags:           [`webhook`, source, topic.replace('/', '_')],
      } as any);

      // Notify connected SSE clients of the new case (scoped to workspace)
      broadcastSSE(scope.tenantId, 'case:created', {
        caseId,
        caseNumber: caseNumber,
        caseType:   caseType,
        priority,
        source,
        topic,
        tenantId:    scope.tenantId,
        workspaceId: scope.workspaceId,
      }, scope.workspaceId);

      log.info('webhookProcess: auto-created case from webhook', {
        caseId, source, topic, entityType: extraction.entityType,
      });
    } catch (caseErr) {
      log.warn('webhookProcess: case auto-creation failed', { source, topic, error: String(caseErr) });
    }
  }

  // ── Fire workflow event ────────────────────────────────────────────────────
  const eventType = topicToWorkflowEvent(source, topic);
  await fireWorkflowEvent(
    scope,
    eventType,
    {
      source,
      topic,
      entityType:  extraction.entityType,
      entityId:    extraction.entityId,
      payload:     body,
    },
  );

  log.debug('webhookProcess: workflow event fired', { eventType });
}

function classifyWebhookForCase(
  source: string,
  topic: string,
  body: Record<string, any>,
): { caseType: string; caseSubType?: string; summary: string; priority: string } {
  // ── Inbound channels → support_request ───────────────────────────────────
  const inbox = new Set(['whatsapp', 'messenger', 'instagram', 'telegram', 'twilio', 'gmail', 'outlook', 'postmark', 'discord']);
  if (inbox.has(source)) {
    return { caseType: 'support_request', caseSubType: `${source}_inbound`, summary: `Inbound ${source} message`, priority: 'medium' };
  }
  if (source === 'aircall') {
    if (topic.includes('voicemail')) return { caseType: 'support_request', caseSubType: 'voicemail', summary: 'Aircall voicemail received', priority: 'high' };
    if (topic.includes('unanswered')) return { caseType: 'support_request', caseSubType: 'missed_call', summary: 'Missed Aircall call', priority: 'high' };
    if (topic.includes('transcription')) return { caseType: 'support_request', caseSubType: 'call_transcript', summary: 'Aircall call transcript available', priority: 'medium' };
  }
  if (source === 'zoom' && topic.startsWith('recording.')) {
    return { caseType: 'meeting_followup', caseSubType: 'zoom_recording', summary: 'Zoom recording ready for review', priority: 'low' };
  }

  // ── Engineering errors → bug case ────────────────────────────────────────
  if (source === 'sentry') {
    return { caseType: 'bug', caseSubType: 'sentry_alert', summary: `Sentry: ${body?.data?.issue?.title ?? body?.data?.event?.title ?? 'error alert'}`, priority: 'high' };
  }

  // ── Scheduling ──────────────────────────────────────────────────────────
  if (source === 'calendly' && topic.includes('invitee.created')) {
    const name = body?.payload?.name ?? body?.payload?.invitee?.name ?? '';
    return { caseType: 'sales_followup', caseSubType: 'calendly_booked', summary: `Demo booked${name ? ` with ${name}` : ''}`, priority: 'medium' };
  }

  // ── Contracts ───────────────────────────────────────────────────────────
  if (source === 'docusign') {
    if (topic.includes('completed')) return { caseType: 'sales_followup', caseSubType: 'contract_signed', summary: 'DocuSign envelope completed — onboard customer', priority: 'high' };
    if (topic.includes('declined') || topic.includes('voided')) return { caseType: 'sales_followup', caseSubType: 'contract_cancelled', summary: 'DocuSign envelope declined/voided — follow up', priority: 'high' };
  }

  // ── Bank ─────────────────────────────────────────────────────────────────
  if (source === 'plaid') {
    return { caseType: 'finance', caseSubType: 'plaid_connection_broken', summary: `Plaid item issue: ${topic}`, priority: 'high' };
  }

  // ── PayPal ──────────────────────────────────────────────────────────────
  if (source === 'paypal') {
    if (topic.includes('DISPUTE')) return { caseType: 'dispute', caseSubType: 'paypal_dispute', summary: `PayPal dispute: ${body?.resource?.dispute_id ?? body?.id ?? ''}`, priority: 'critical' };
    if (topic.includes('REFUND')) return { caseType: 'refund', caseSubType: 'paypal_refund', summary: `PayPal refund: ${body?.resource?.id ?? ''}`, priority: 'medium' };
    if (topic.includes('DENIED')) return { caseType: 'payment_issue', caseSubType: 'paypal_denied', summary: 'PayPal capture denied', priority: 'high' };
  }

  // ── WooCommerce ─────────────────────────────────────────────────────────
  if (source === 'woocommerce') {
    if (topic.includes('refunded')) return { caseType: 'refund', caseSubType: 'woo_refund', summary: `WooCommerce order refunded`, priority: 'medium' };
    if (topic.includes('cancelled')) return { caseType: 'order_issue', caseSubType: 'woo_cancellation', summary: `WooCommerce order cancelled`, priority: 'medium' };
  }

  if (source === 'shopify') {
    if (topic === 'orders/cancelled') {
      return {
        caseType:    'order_issue',
        caseSubType: 'cancellation',
        summary:     `Order ${body.name ?? body.id ?? ''} was cancelled in Shopify`,
        priority:    'medium',
      };
    }
    if (topic === 'refunds/create') {
      const amount = body.transactions?.[0]?.amount ?? body.refund_line_items?.[0]?.price ?? '';
      return {
        caseType:    'refund',
        caseSubType: 'shopify_refund',
        summary:     `Shopify refund created${amount ? ` for ${amount}` : ''} on order ${body.order_id ?? ''}`,
        priority:    'medium',
      };
    }
    if (topic === 'orders/fulfilled') {
      return {
        caseType:    'fulfillment',
        caseSubType: 'fulfilled',
        summary:     `Order ${body.name ?? body.id ?? ''} fulfilled — verify delivery`,
        priority:    'low',
      };
    }
  }

  if (source === 'stripe') {
    if (topic === 'charge.dispute.created' || topic === 'charge.dispute.funds_withdrawn') {
      return {
        caseType:    'dispute',
        caseSubType: 'chargeback',
        summary:     `Stripe dispute created for charge ${body.data?.object?.charge ?? body.id ?? ''}`,
        priority:    'critical',
      };
    }
    if (topic === 'payment_intent.payment_failed' || topic === 'charge.failed') {
      return {
        caseType:    'payment_issue',
        caseSubType: 'payment_failed',
        summary:     `Payment failed: ${body.data?.object?.last_payment_error?.message ?? 'Unknown reason'}`,
        priority:    'high',
      };
    }
    if (topic === 'charge.refunded') {
      return {
        caseType:    'refund',
        caseSubType: 'stripe_refund',
        summary:     `Stripe charge refunded: ${body.data?.object?.id ?? ''}`,
        priority:    'low',
      };
    }
  }

  return {
    caseType: 'general',
    summary:  `Webhook event: ${source}/${topic}`,
    priority: 'medium',
  };
}

// ── Register ──────────────────────────────────────────────────────────────────

registerHandler(JobType.WEBHOOK_PROCESS, handleWebhookProcess);

export {
  handleWebhookProcess,
  // Test surface: all extractors, the classification helper, and the
  // canonical workflow event mapper are exported so unit-tests can verify
  // every source's behaviour without standing up a DB.
  EXTRACTORS,
  CASE_AUTO_CREATE_TOPICS,
  classifyWebhookForCase,
  topicToWorkflowEvent,
};
export type { EntityExtraction };
