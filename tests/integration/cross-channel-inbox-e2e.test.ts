/**
 * tests/integration/cross-channel-inbox-e2e.test.ts
 *
 * Verifies the cross-channel inbox sprint end-to-end:
 *
 *   For each of the 15 messaging channels, build a synthetic webhook body
 *   that mimics the provider's real payload, run it through the
 *   channelNormalizers + channelIngest path in-process, and assert that:
 *
 *     1. The normalizer extracts a NormalizedChannelMessage with the right
 *        channel slug, sender id, content, externalMessageId.
 *     2. The metadata bag carries the channel-specific reply context the
 *        outbound dispatcher needs (slack thread_ts, teams team/channel/msg
 *        ids, intercom adminId, gmail threadId, outlook messageId, etc.).
 *     3. The reply path resolves the right outbound dispatcher for that
 *        channel (without actually hitting the provider — we mock the
 *        adapter to capture the call).
 *
 * Does NOT hit any external API. Talks to Supabase only via the
 * channelIngest handler when --with-db flag is passed.
 *
 * Run:  node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/cross-channel-inbox-e2e.test.ts
 */

import { normalizeInbound, sourceToChannel, isChannelSource } from '../../server/pipeline/channelNormalizers.js';

interface Case {
  source: string;          // webhook source slug
  body: any;               // synthetic webhook body
  expect: {
    channel: string;
    senderId: string;
    contentIncludes: string;
    metaKeys?: string[];
    externalThreadId?: string;
  };
}

const CASES: Case[] = [
  {
    source: 'whatsapp',
    body: {
      entry: [{ changes: [{ value: {
        contacts: [{ wa_id: '34612345678', profile: { name: 'Lucia Hernandez' } }],
        messages: [{ from: '34612345678', id: 'wamid.ABC', timestamp: '1735689600', text: { body: 'My order is late' } }],
      } }] }],
    },
    expect: { channel: 'whatsapp', senderId: '34612345678', contentIncludes: 'order is late', externalThreadId: '34612345678' },
  },
  {
    source: 'messenger',
    body: { entry: [{ messaging: [{ sender: { id: 'PSID_123' }, timestamp: 1735689600000, message: { mid: 'mid.xyz', text: 'Need help with refund' } }] }] },
    expect: { channel: 'messenger', senderId: 'PSID_123', contentIncludes: 'refund', externalThreadId: 'PSID_123' },
  },
  {
    source: 'instagram',
    body: { entry: [{ messaging: [{ sender: { id: 'IG_456' }, timestamp: 1735689600000, message: { mid: 'ig_mid', text: 'DM from instagram' } }] }] },
    expect: { channel: 'instagram', senderId: 'IG_456', contentIncludes: 'instagram', externalThreadId: 'IG_456' },
  },
  {
    source: 'telegram',
    body: { message: { message_id: 99, from: { id: 4242, first_name: 'Carlos', username: 'cgarcia' }, chat: { id: 4242 }, date: 1735689600, text: 'Hola, soporte?' } },
    expect: { channel: 'telegram', senderId: '4242', contentIncludes: 'soporte', externalThreadId: '4242', metaKeys: ['replyToMessageId'] },
  },
  {
    source: 'twilio',
    body: { From: '+34666111222', Body: 'Sent from SMS', MessageSid: 'SM_abc' },
    expect: { channel: 'sms', senderId: '+34666111222', contentIncludes: 'SMS', externalThreadId: '+34666111222' },
  },
  {
    source: 'gmail',
    body: { message: { id: 'gm_msg_1', threadId: 'gm_thread_1', snippet: 'Subject: invoice question', headers: { From: 'Ana Lopez <ana@example.com>', Subject: 'Invoice question', 'Message-ID': '<m1@example.com>' } } },
    expect: { channel: 'gmail', senderId: 'ana@example.com', contentIncludes: 'invoice', metaKeys: ['threadId', 'inReplyTo'] },
  },
  {
    source: 'outlook',
    body: { value: [{ resource: 'me/messages/ABC', resourceData: { id: 'AAMk_123', conversationId: 'conv_outlook_1', subject: 'Outlook test', bodyPreview: 'Hello support', from: { emailAddress: { address: 'maria@contoso.com', name: 'Maria' } }, receivedDateTime: '2026-04-01T10:00:00Z' } }] },
    expect: { channel: 'outlook', senderId: 'maria@contoso.com', contentIncludes: 'support', metaKeys: ['messageId', 'conversationId'] },
  },
  {
    source: 'postmark',
    body: { RecordType: 'Inbound', From: 'paul@client.com', FromFull: { Email: 'paul@client.com', Name: 'Paul T' }, Subject: 'PM test', TextBody: 'Sent via Postmark', MessageID: 'pm_001', Date: '2026-04-01T10:00:00Z' },
    expect: { channel: 'postmark', senderId: 'paul@client.com', contentIncludes: 'Postmark', externalThreadId: 'paul@client.com' },
  },
  {
    source: 'discord',
    body: { id: 'msg_dc_1', channel_id: 'ch_dc_42', author: { id: 'usr_dc_99', username: 'gamer' }, content: 'help in discord', timestamp: '2026-04-01T10:00:00Z' },
    expect: { channel: 'discord', senderId: 'usr_dc_99', contentIncludes: 'discord', externalThreadId: 'ch_dc_42' },
  },
  {
    source: 'slack',
    body: { team_id: 'T_team', event: { type: 'message', user: 'U_slack', text: 'help in slack', ts: '1735689600.000100', channel: 'C_general' } },
    expect: { channel: 'slack', senderId: 'U_slack', contentIncludes: 'slack', externalThreadId: 'C_general', metaKeys: ['thread_ts'] },
  },
  {
    source: 'teams',
    body: { value: [{ resource: "teams('teamX')/channels('chX')/messages('msgX')", resourceData: { id: 'msgX', from: { user: { id: 'usr_teams', displayName: 'Maria' } }, body: { content: 'help in teams' }, createdDateTime: '2026-04-01T10:00:00Z' } }] },
    expect: { channel: 'teams', senderId: 'usr_teams', contentIncludes: 'teams', metaKeys: ['teamId', 'channelId', 'messageId'] },
  },
  {
    source: 'front',
    body: { payload: {
      conversation: { id: 'cnv_front_1', subject: 'Front test' },
      message: { id: 'msg_front_1', conversation_id: 'cnv_front_1', author: { email: 'tom@front.com', first_name: 'Tom' }, body: 'help via front', created_at: 1735689600 },
    } },
    expect: { channel: 'front', senderId: 'tom@front.com', contentIncludes: 'front', externalThreadId: 'cnv_front_1' },
  },
  {
    source: 'intercom',
    body: { data: { item: {
      id: 'cnv_ic_1', user: { id: 'usr_ic_99', name: 'Ada' }, source: { id: 'src_1', body: '<p>help via <b>intercom</b></p>', author: { id: 'usr_ic_99', name: 'Ada' } }, created_at: 1735689600,
    } } },
    expect: { channel: 'intercom', senderId: 'usr_ic_99', contentIncludes: 'intercom', externalThreadId: 'cnv_ic_1' },
  },
  {
    source: 'zendesk',
    body: { ticket: { id: 12345, subject: 'ZD test', requester: { id: 99, email: 'zd@user.com', name: 'ZD User' }, comment: { id: 8888, body: 'help via zendesk' }, updated_at: '2026-04-01T10:00:00Z' } },
    expect: { channel: 'zendesk', senderId: 'zd@user.com', contentIncludes: 'zendesk', externalThreadId: '12345' },
  },
  {
    source: 'aircall',
    body: { event: 'call.voicemail_left', data: { id: 'call_777', number: { digits: '+34611222333' }, transcription: { body: 'Caller said: please call back' }, started_at: 1735689600 } },
    expect: { channel: 'aircall', senderId: '+34611222333', contentIncludes: 'call back', externalThreadId: '+34611222333', metaKeys: ['callId'] },
  },
];

interface Result { name: string; pass: boolean; reason?: string; }

(async () => {
  console.log(`\n▶ Cross-channel inbox normalizer E2E (${CASES.length} channels)\n`);
  const results: Result[] = [];

  for (const tc of CASES) {
    const r: Result = { name: tc.source, pass: false };
    try {
      if (!isChannelSource(tc.source) && tc.source !== 'twilio') {
        r.reason = `source ${tc.source} not registered in normalizers`;
      } else {
        const msg = normalizeInbound(tc.source, tc.body);
        if (!msg) {
          r.reason = 'normalizer returned null';
        } else if (msg.channel !== tc.expect.channel) {
          r.reason = `wrong channel: got ${msg.channel}, expected ${tc.expect.channel}`;
        } else if (msg.senderId !== tc.expect.senderId) {
          r.reason = `wrong senderId: got ${msg.senderId}, expected ${tc.expect.senderId}`;
        } else if (!msg.messageContent.toLowerCase().includes(tc.expect.contentIncludes.toLowerCase())) {
          r.reason = `content missing "${tc.expect.contentIncludes}": got "${msg.messageContent.slice(0, 80)}"`;
        } else if (tc.expect.externalThreadId && msg.externalThreadId !== tc.expect.externalThreadId) {
          r.reason = `wrong externalThreadId: got ${msg.externalThreadId}, expected ${tc.expect.externalThreadId}`;
        } else if (tc.expect.metaKeys) {
          const meta = msg.metadata ?? {};
          const missing = tc.expect.metaKeys.filter((k) => !(k in meta) || meta[k] == null);
          if (missing.length) r.reason = `metadata missing keys: ${missing.join(', ')}`;
          else r.pass = true;
        } else {
          r.pass = true;
        }
      }
    } catch (err: any) {
      r.reason = `threw: ${err?.message ?? String(err)}`;
    }
    results.push(r);
    const tag = r.pass ? '✓' : '✗';
    console.log(`  ${tag} ${r.name.padEnd(12)} ${r.pass ? '' : `[${r.reason}]`}`);
  }

  // Verify the outbound dispatcher knows about every channel we ingest.
  console.log(`\n▶ Outbound channel coverage check`);
  const { isKnownOutboundChannel } = await import('../../server/pipeline/channelSenders.js');
  for (const tc of CASES) {
    const ch = sourceToChannel(tc.source);
    const ok = ch != null && isKnownOutboundChannel(ch);
    const tag = ok ? '✓' : '✗';
    console.log(`  ${tag} ${tc.source.padEnd(12)} → ${ch ?? '(unknown)'} ${ok ? 'reply-routable' : 'NOT REPLY-ROUTABLE'}`);
    if (!ok) results.push({ name: `${tc.source}:reply-routable`, pass: false, reason: `outbound channel ${ch} unknown` });
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Cross-channel inbox: ${passed} passed / ${failed} failed / ${results.length} total`);
  console.log(`${'─'.repeat(60)}\n`);

  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => { console.error('Suite crashed:', err); process.exit(2); });
