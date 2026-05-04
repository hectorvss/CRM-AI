/**
 * server/pipeline/channelNormalizers.ts
 *
 * Per-channel inbound webhook → NormalizedChannelMessage adapters.
 *
 * Every messaging integration that delivers customer messages emits a webhook
 * with a different shape. This module is the single place that knows the
 * idiosyncrasies of each provider's payload and reduces them to the unified
 * NormalizedChannelMessage shape consumed by channelIngest.
 *
 * Adding a new channel: write `normalize<Channel>(body)` here, register it in
 * NORMALIZERS, and ingest will pick it up automatically — no other files need
 * to change.
 */

import type { NormalizedChannelMessage, SupportedChannel } from './channelIngest.js';

type Body = Record<string, any>;

function asStr(v: unknown): string | undefined {
  if (v == null) return undefined;
  return String(v);
}

function isoFromUnixSec(s: any): string | undefined {
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  // Heuristic: seconds (Slack) vs ms (some providers)
  const ms = n > 1e12 ? n : n * 1000;
  return new Date(ms).toISOString();
}

// ── Per-channel normalizers ──────────────────────────────────────────────────

function normalizeWhatsApp(body: Body): NormalizedChannelMessage | null {
  // Meta Cloud webhook: entry[].changes[].value.messages[]
  const value = body?.entry?.[0]?.changes?.[0]?.value ?? {};
  const m = value.messages?.[0];
  if (!m) return null;
  const senderId = asStr(m.from) ?? asStr(value.contacts?.[0]?.wa_id);
  if (!senderId) return null;
  const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '';
  return {
    channel: 'whatsapp',
    senderId,
    senderName: value.contacts?.[0]?.profile?.name,
    messageContent: String(text || ''),
    externalMessageId: asStr(m.id) ?? `wa_${Date.now()}`,
    sentAt: isoFromUnixSec(m.timestamp) ?? new Date().toISOString(),
    externalThreadId: senderId, // reply destination is the sender's wa_id
  };
}

function normalizeMessenger(body: Body): NormalizedChannelMessage | null {
  const ev = body?.entry?.[0]?.messaging?.[0];
  if (!ev?.message) return null;
  const senderId = asStr(ev.sender?.id);
  if (!senderId) return null;
  return {
    channel: 'messenger',
    senderId,
    messageContent: String(ev.message.text ?? ''),
    externalMessageId: asStr(ev.message.mid) ?? `mes_${ev.timestamp ?? Date.now()}`,
    sentAt: isoFromUnixSec(ev.timestamp) ?? new Date().toISOString(),
    externalThreadId: senderId, // Messenger PSID is the reply recipient
  };
}

function normalizeInstagram(body: Body): NormalizedChannelMessage | null {
  // Instagram messaging webhook is structurally identical to Messenger
  const ev = body?.entry?.[0]?.messaging?.[0];
  if (!ev?.message) return null;
  const senderId = asStr(ev.sender?.id);
  if (!senderId) return null;
  return {
    channel: 'instagram',
    senderId,
    messageContent: String(ev.message.text ?? ''),
    externalMessageId: asStr(ev.message.mid) ?? `ig_${ev.timestamp ?? Date.now()}`,
    sentAt: isoFromUnixSec(ev.timestamp) ?? new Date().toISOString(),
    externalThreadId: senderId,
  };
}

function normalizeTelegram(body: Body): NormalizedChannelMessage | null {
  const m = body?.message ?? body?.callback_query?.message;
  if (!m) return null;
  const chatId = asStr(m.chat?.id);
  const senderId = asStr(m.from?.id) ?? chatId;
  if (!senderId || !chatId) return null;
  const senderName = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') || m.from?.username;
  return {
    channel: 'telegram',
    senderId,
    senderName: senderName || undefined,
    messageContent: String(m.text ?? m.caption ?? ''),
    externalMessageId: asStr(m.message_id) ?? `tg_${Date.now()}`,
    sentAt: isoFromUnixSec(m.date) ?? new Date().toISOString(),
    externalThreadId: chatId, // reply via sendMessage({chatId})
    metadata: { replyToMessageId: m.message_id },
  };
}

function normalizeTwilio(body: Body): NormalizedChannelMessage | null {
  // Twilio inbound SMS — application/x-www-form-urlencoded mapped to JSON
  const from = asStr(body.From);
  if (!from) return null;
  return {
    channel: 'sms',
    senderId: from,
    messageContent: String(body.Body ?? ''),
    externalMessageId: asStr(body.MessageSid) ?? asStr(body.SmsSid) ?? `sms_${Date.now()}`,
    sentAt: new Date().toISOString(),
    externalThreadId: from,
  };
}

function normalizeGmail(body: Body): NormalizedChannelMessage | null {
  // Gmail webhook is a Pub/Sub notification, not a full email. The actual
  // message must be fetched via the API. For now, normalise from the webhook
  // body shape used by the gmail webhook handler when it has already
  // hydrated the message (body.message field).
  const m = body?.message ?? body;
  const headers = m.headers ?? body.headers ?? {};
  const from = asStr(headers.From ?? headers.from ?? body.from);
  if (!from) return null;
  // Extract email from "Name <addr@domain>" if needed
  const email = from.match(/<([^>]+)>/)?.[1] ?? from;
  return {
    channel: 'gmail',
    senderId: email,
    senderName: from.includes('<') ? from.split('<')[0].trim().replace(/^"|"$/g, '') : undefined,
    messageContent: String(m.snippet ?? m.textBody ?? m.body ?? ''),
    externalMessageId: asStr(m.id ?? body.MessageID) ?? `gm_${Date.now()}`,
    sentAt: m.internalDate ? new Date(Number(m.internalDate)).toISOString() : new Date().toISOString(),
    subject: asStr(headers.Subject ?? headers.subject ?? m.subject),
    externalThreadId: asStr(m.threadId) ?? asStr(m.id),
    metadata: {
      threadId: asStr(m.threadId),
      inReplyTo: asStr(headers['Message-ID'] ?? headers['Message-Id']),
      references: typeof headers.References === 'string' ? headers.References.split(/\s+/) : undefined,
    },
  };
}

function normalizeOutlook(body: Body): NormalizedChannelMessage | null {
  // Microsoft Graph notification. resourceData carries the new message id.
  const r = body?.value?.[0] ?? body;
  const data = r?.resourceData ?? r;
  const messageId = asStr(data.id);
  const from = asStr(data.from?.emailAddress?.address ?? data.sender?.emailAddress?.address ?? body.from);
  if (!from) return null;
  return {
    channel: 'outlook',
    senderId: from,
    senderName: asStr(data.from?.emailAddress?.name),
    messageContent: String(data.bodyPreview ?? data.body?.content ?? ''),
    externalMessageId: messageId ?? `ol_${Date.now()}`,
    sentAt: data.receivedDateTime ?? new Date().toISOString(),
    subject: asStr(data.subject),
    externalThreadId: asStr(data.conversationId) ?? messageId,
    metadata: { messageId, conversationId: asStr(data.conversationId) },
  };
}

function normalizePostmark(body: Body): NormalizedChannelMessage | null {
  // Postmark inbound webhook
  if (body.RecordType && body.RecordType !== 'Inbound') return null;
  const from = asStr(body.FromFull?.Email ?? body.From);
  if (!from) return null;
  return {
    channel: 'postmark',
    senderId: from,
    senderName: asStr(body.FromFull?.Name),
    messageContent: String(body.TextBody ?? body.HtmlBody ?? ''),
    externalMessageId: asStr(body.MessageID) ?? `pm_${Date.now()}`,
    sentAt: body.Date ? new Date(body.Date).toISOString() : new Date().toISOString(),
    subject: asStr(body.Subject),
    externalThreadId: from,
    metadata: { mailboxHash: asStr(body.MailboxHash), tag: asStr(body.Tag) },
  };
}

function normalizeDiscord(body: Body): NormalizedChannelMessage | null {
  // Discord interactions / messages
  const senderId = asStr(body.author?.id ?? body.user?.id ?? body.member?.user?.id);
  const channelId = asStr(body.channel_id);
  const content = String(body.content ?? body.data?.options?.[0]?.value ?? '');
  if (!senderId || !channelId) return null;
  return {
    channel: 'discord',
    senderId,
    senderName: asStr(body.author?.username ?? body.member?.user?.username),
    messageContent: content,
    externalMessageId: asStr(body.id) ?? `dc_${Date.now()}`,
    sentAt: body.timestamp ?? new Date().toISOString(),
    externalThreadId: channelId, // reply target is the channel
  };
}

function normalizeSlack(body: Body): NormalizedChannelMessage | null {
  // Slack Events API: body.event = { type:'message', user, text, ts, channel, thread_ts? }
  const ev = body?.event ?? body;
  if (ev?.subtype === 'bot_message' || ev?.bot_id) return null; // ignore bot echoes
  const senderId = asStr(ev.user);
  const channelId = asStr(ev.channel);
  const text = asStr(ev.text);
  if (!senderId || !channelId || !text) return null;
  return {
    channel: 'slack',
    senderId,
    messageContent: text,
    externalMessageId: asStr(ev.client_msg_id ?? ev.ts) ?? `sl_${Date.now()}`,
    sentAt: isoFromUnixSec(ev.ts) ?? new Date().toISOString(),
    externalThreadId: channelId,
    metadata: { thread_ts: ev.thread_ts ?? ev.ts, team: asStr(body.team_id ?? ev.team) },
  };
}

function normalizeTeams(body: Body): NormalizedChannelMessage | null {
  // Microsoft Graph chatMessage / channelMessage notification
  const r = body?.value?.[0] ?? body;
  const data = r?.resourceData ?? r;
  const senderId = asStr(data.from?.user?.id ?? data.from?.application?.id);
  if (!senderId) return null;
  // resource path: teams/{teamId}/channels/{channelId}/messages/{messageId}
  const resource = asStr(r.resource ?? '');
  const teamMatch = resource?.match(/teams\(['"]?([^'")\/]+)/);
  const chMatch = resource?.match(/channels\(['"]?([^'")\/]+)/);
  const msgMatch = resource?.match(/messages\(['"]?([^'")\/]+)/);
  return {
    channel: 'teams',
    senderId,
    senderName: asStr(data.from?.user?.displayName),
    messageContent: String(data.body?.content ?? ''),
    externalMessageId: asStr(data.id ?? msgMatch?.[1]) ?? `tm_${Date.now()}`,
    sentAt: data.createdDateTime ?? new Date().toISOString(),
    externalThreadId: asStr(data.chatId ?? chMatch?.[1]) ?? '',
    metadata: {
      teamId: teamMatch?.[1],
      channelId: chMatch?.[1] ?? asStr(data.channelIdentity?.channelId),
      messageId: msgMatch?.[1] ?? asStr(data.id),
    },
  };
}

function normalizeFront(body: Body): NormalizedChannelMessage | null {
  // Front webhook: payload includes conversation, message
  const m = body?.payload?.message ?? body?.message ?? body;
  const conv = body?.payload?.conversation ?? body?.conversation;
  const senderEmail = asStr(m.author?.email ?? m.recipients?.[0]?.handle);
  const senderId = senderEmail ?? asStr(m.author?.id);
  if (!senderId) return null;
  return {
    channel: 'front',
    senderId,
    senderName: asStr(m.author?.first_name ? `${m.author.first_name} ${m.author?.last_name ?? ''}`.trim() : m.author?.username),
    messageContent: String(m.body ?? m.text ?? ''),
    externalMessageId: asStr(m.id) ?? `fr_${Date.now()}`,
    sentAt: m.created_at ? new Date(Number(m.created_at) * 1000).toISOString() : new Date().toISOString(),
    subject: asStr(m.subject ?? conv?.subject),
    externalThreadId: asStr(conv?.id ?? m.conversation_id),
    metadata: { channelId: asStr(m.channel_id) },
  };
}

function normalizeIntercom(body: Body): NormalizedChannelMessage | null {
  // Intercom webhook: data.item is conversation, with conversation_parts and source
  const item = body?.data?.item ?? body;
  const source = item.source ?? item.conversation_message;
  const userId = asStr(item.user?.id ?? source?.author?.id);
  if (!userId) return null;
  const convId = asStr(item.id ?? body?.conversation_id);
  return {
    channel: 'intercom',
    senderId: userId,
    senderName: asStr(item.user?.name ?? source?.author?.name),
    messageContent: String(source?.body ?? item.conversation_message?.body ?? '').replace(/<[^>]+>/g, ' ').trim(),
    externalMessageId: asStr(source?.id ?? item.id) ?? `ic_${Date.now()}`,
    sentAt: item.created_at ? new Date(Number(item.created_at) * 1000).toISOString() : new Date().toISOString(),
    externalThreadId: convId,
    metadata: { adminId: asStr(item.assignee?.id) || undefined },
  };
}

function normalizeZendesk(body: Body): NormalizedChannelMessage | null {
  // Zendesk webhook payload shape varies; common: { ticket: {id, requester:{...}, comment:{body}} }
  const t = body?.ticket ?? body?.detail?.ticket ?? body;
  const ticketId = asStr(t?.id);
  const requester = t?.requester ?? body?.current_user;
  const senderId = asStr(requester?.email ?? requester?.id);
  const content = String(t?.comment?.body ?? t?.description ?? body?.comment?.body ?? '');
  if (!ticketId || !senderId) return null;
  return {
    channel: 'zendesk',
    senderId,
    senderName: asStr(requester?.name),
    messageContent: content,
    externalMessageId: asStr(t?.comment?.id ?? `${ticketId}-${t?.updated_at ?? Date.now()}`),
    sentAt: t?.updated_at ?? t?.created_at ?? new Date().toISOString(),
    subject: asStr(t?.subject),
    externalThreadId: ticketId, // numeric, channelSenders parses with Number()
    metadata: { ticketId: Number(ticketId) },
  };
}

function normalizeAircall(body: Body): NormalizedChannelMessage | null {
  // Aircall: voicemail / transcription / unanswered call
  const data = body?.data ?? body;
  const callId = asStr(data?.id);
  const number = asStr(data?.number?.digits ?? data?.raw_digits);
  if (!callId || !number) return null;
  const transcript = asStr(data?.transcription?.body) ?? asStr(data?.voicemail?.transcription);
  const summary = transcript ?? `Aircall ${data?.status ?? body.event ?? 'event'} from ${number}`;
  return {
    channel: 'aircall',
    senderId: number,
    senderName: asStr(data?.contact?.first_name ? `${data.contact.first_name} ${data.contact.last_name ?? ''}`.trim() : undefined),
    messageContent: summary,
    externalMessageId: callId,
    sentAt: data?.started_at ? new Date(Number(data.started_at) * 1000).toISOString() : new Date().toISOString(),
    externalThreadId: number,
    metadata: { callId, recording: asStr(data?.recording), duration: data?.duration },
  };
}

// ── Registry ─────────────────────────────────────────────────────────────────

export type ChannelNormalizer = (body: Body) => NormalizedChannelMessage | null;

const NORMALIZERS: Record<string, ChannelNormalizer> = {
  whatsapp:  normalizeWhatsApp,
  messenger: normalizeMessenger,
  instagram: normalizeInstagram,
  telegram:  normalizeTelegram,
  twilio:    normalizeTwilio,
  gmail:     normalizeGmail,
  outlook:   normalizeOutlook,
  postmark:  normalizePostmark,
  discord:   normalizeDiscord,
  slack:     normalizeSlack,
  teams:     normalizeTeams,
  front:     normalizeFront,
  intercom:  normalizeIntercom,
  zendesk:   normalizeZendesk,
  aircall:   normalizeAircall,
};

/**
 * Pick the normalizer for a given source, run it, and return the normalised
 * message (or null if the webhook does not represent an inbound customer
 * message — e.g. delivery receipt, status update, bot echo).
 */
export function normalizeInbound(source: string, body: Body): NormalizedChannelMessage | null {
  const fn = NORMALIZERS[source];
  if (!fn) return null;
  try {
    return fn(body);
  } catch (err) {
    // Log via the callsite — no logger imported here so we don't pull deps
    // into a pure transformation module.
    return null;
  }
}

/**
 * True if `source` belongs to a channel that this module knows how to
 * normalise. Used by webhookProcess to decide whether to enqueue
 * CHANNEL_INGEST after persisting the canonical_event.
 */
export function isChannelSource(source: string): boolean {
  return source in NORMALIZERS;
}

/** Map a webhook source slug to the canonical channel slug. */
export function sourceToChannel(source: string): SupportedChannel | null {
  if (source === 'twilio') return 'sms';
  if (source in NORMALIZERS) return source as SupportedChannel;
  return null;
}
