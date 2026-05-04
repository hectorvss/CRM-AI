/**
 * tests/integration/cross-channel-ingest-db.test.ts
 *
 * Hits a real Supabase. For each messaging channel:
 *   1. Insert a synthetic webhook_event row with a normalised inbound payload
 *      (we skip the raw-webhook → normalize step since that's covered by the
 *      pure-function test) and emit it directly through channelIngest.
 *   2. Verify a conversation + message landed in DB with the correct channel,
 *      sender, and metadata.
 *   3. Clean up.
 *
 * Run:  node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/cross-channel-ingest-db.test.ts
 */

import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import { handleChannelIngest } from '../../server/pipeline/channelIngest.js';
import type { JobContext } from '../../server/queue/types.js';

const TENANT = 'tenant_1';
const WS = 'ws_default';
const TRACE = `xchan-${randomUUID().slice(0, 8)}`;

interface Sample {
  channel: string;
  senderId: string;
  externalMessageId: string;
  externalThreadId: string;
  metadata?: Record<string, any>;
  content: string;
}

const SAMPLES: Sample[] = [
  { channel: 'whatsapp',  senderId: '34611000001', externalMessageId: `wa_${TRACE}`, externalThreadId: '34611000001', content: 'WA test' },
  { channel: 'messenger', senderId: 'PSID_test',   externalMessageId: `mes_${TRACE}`, externalThreadId: 'PSID_test',  content: 'Messenger test' },
  { channel: 'telegram',  senderId: 'TG_99',       externalMessageId: `tg_${TRACE}`,  externalThreadId: 'TG_99',      content: 'Telegram test' },
  { channel: 'slack',     senderId: 'U_test',      externalMessageId: `sl_${TRACE}`,  externalThreadId: 'C_test',     metadata: { thread_ts: '1735689600.000100' }, content: 'Slack test' },
  { channel: 'teams',     senderId: 'usr_teams',   externalMessageId: `tm_${TRACE}`,  externalThreadId: 'chTest',     metadata: { teamId: 'tTest', channelId: 'chTest', messageId: `tm_${TRACE}` }, content: 'Teams test' },
  { channel: 'front',     senderId: 'a@front.com', externalMessageId: `fr_${TRACE}`,  externalThreadId: 'cnv_front_t', content: 'Front test' },
  { channel: 'intercom',  senderId: 'usr_ic_t',    externalMessageId: `ic_${TRACE}`,  externalThreadId: 'cnv_ic_t',   metadata: { adminId: '1' }, content: 'Intercom test' },
  { channel: 'zendesk',   senderId: 'zd@user.com', externalMessageId: `zd_${TRACE}`,  externalThreadId: '99999',      metadata: { ticketId: 99999 }, content: 'Zendesk test' },
  { channel: 'gmail',     senderId: 'gm@user.com', externalMessageId: `gm_${TRACE}`,  externalThreadId: 'thr_gm_t',   metadata: { threadId: 'thr_gm_t' }, content: 'Gmail test' },
  { channel: 'outlook',   senderId: 'ol@user.com', externalMessageId: `ol_${TRACE}`,  externalThreadId: 'conv_ol_t',  metadata: { messageId: 'AAMk_test', conversationId: 'conv_ol_t' }, content: 'Outlook test' },
  { channel: 'discord',   senderId: 'usr_dc_t',    externalMessageId: `dc_${TRACE}`,  externalThreadId: 'ch_dc_t',    content: 'Discord test' },
];

const supabase = getSupabaseAdmin();
const cleanup = { canonicalIds: [] as string[], conversationIds: [] as string[], customerIds: [] as string[] };

async function plant(s: Sample): Promise<{ canonicalEventId: string; rawMessageId: string }> {
  const id = randomUUID();
  const dedupeKey = `${s.channel}:test:${s.externalMessageId}`;
  const normalized = {
    channel: s.channel,
    senderId: s.senderId,
    senderName: undefined,
    messageContent: s.content,
    externalMessageId: s.externalMessageId,
    externalThreadId: s.externalThreadId,
    sentAt: new Date().toISOString(),
    metadata: s.metadata ?? {},
  };
  const { error } = await supabase.from('canonical_events').insert({
    id,
    tenant_id: TENANT,
    workspace_id: WS,
    dedupe_key: dedupeKey,
    source_system: s.channel === 'sms' ? 'twilio' : s.channel,
    source_entity_type: 'message',
    source_entity_id: s.externalMessageId,
    event_type: `${s.channel}.test.received`,
    event_category: 'inbox',
    occurred_at: new Date().toISOString(),
    normalized_payload: normalized,
    status: 'received',
  });
  if (error) throw new Error(`canonical_events insert failed for ${s.channel}: ${error.message}`);
  cleanup.canonicalIds.push(id);
  return { canonicalEventId: id, rawMessageId: s.externalMessageId };
}

async function verify(s: Sample, canonicalEventId: string): Promise<{ ok: boolean; reason?: string }> {
  const { data: ev } = await supabase.from('canonical_events').select('canonical_entity_id, status, normalized_payload').eq('id', canonicalEventId).maybeSingle();
  if (!ev) return { ok: false, reason: 'canonical event vanished' };
  const customerId = ev.canonical_entity_id;
  if (!customerId) return { ok: false, reason: 'no customer linked on event' };
  cleanup.customerIds.push(customerId);

  const { data: convs } = await supabase
    .from('conversations')
    .select('id, channel, external_thread_id, metadata')
    .eq('tenant_id', TENANT).eq('workspace_id', WS).eq('customer_id', customerId).eq('channel', s.channel)
    .limit(1);
  const conv = convs?.[0];
  if (!conv) return { ok: false, reason: `conversation not found for channel ${s.channel}` };
  cleanup.conversationIds.push(conv.id);
  if (conv.external_thread_id !== s.externalThreadId) return { ok: false, reason: `external_thread_id wrong: ${conv.external_thread_id} vs ${s.externalThreadId}` };
  if (s.metadata) {
    const got = conv.metadata ?? {};
    for (const [k, v] of Object.entries(s.metadata)) {
      if (String(got[k]) !== String(v)) return { ok: false, reason: `metadata.${k} = ${got[k]} (expected ${v})` };
    }
  }
  const { data: msgs } = await supabase
    .from('messages')
    .select('id, content, channel, external_message_id, direction')
    .eq('conversation_id', conv.id).eq('external_message_id', s.externalMessageId)
    .limit(1);
  const m = msgs?.[0];
  if (!m) return { ok: false, reason: 'message row missing' };
  if (!m.content?.includes(s.content)) return { ok: false, reason: `message content mismatch: ${m.content}` };
  if (m.direction !== 'inbound') return { ok: false, reason: `direction = ${m.direction}` };
  return { ok: true };
}

async function doCleanup() {
  if (cleanup.conversationIds.length) {
    await supabase.from('messages').delete().in('conversation_id', cleanup.conversationIds);
    await supabase.from('conversations').delete().in('id', cleanup.conversationIds);
  }
  if (cleanup.canonicalIds.length) await supabase.from('canonical_events').delete().in('id', cleanup.canonicalIds);
  if (cleanup.customerIds.length) {
    await supabase.from('linked_identities').delete().in('customer_id', cleanup.customerIds);
    await supabase.from('customers').delete().in('id', cleanup.customerIds);
  }
}

(async () => {
  console.log(`\n▶ Cross-channel ingest DB test (${SAMPLES.length} channels) trace=${TRACE}\n`);
  let exitCode = 0;
  try {
    for (const s of SAMPLES) {
      try {
        const { canonicalEventId, rawMessageId } = await plant(s);
        const ctx: JobContext = {
          jobId: randomUUID(),
          tenantId: TENANT,
          workspaceId: WS,
          traceId: TRACE,
          attempt: 1,
        } as any;
        await handleChannelIngest({ canonicalEventId, channel: s.channel as any, rawMessageId }, ctx);
        const result = await verify(s, canonicalEventId);
        const tag = result.ok ? '✓' : '✗';
        console.log(`  ${tag} ${s.channel.padEnd(12)} ${result.ok ? '' : `[${result.reason}]`}`);
        if (!result.ok) exitCode = 1;
      } catch (err: any) {
        console.log(`  ✗ ${s.channel.padEnd(12)} [threw: ${err?.message ?? String(err)}]`);
        exitCode = 1;
      }
    }
  } finally {
    await doCleanup().catch((err) => console.warn('cleanup err:', err));
    console.log(`\n✓ cleanup done`);
  }
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Cross-channel ingest DB: ${exitCode === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`${'─'.repeat(60)}\n`);
  process.exit(exitCode);
})().catch((err) => { console.error('Suite crashed:', err); process.exit(2); });
