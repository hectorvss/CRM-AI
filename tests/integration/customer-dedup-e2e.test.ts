/**
 * tests/integration/customer-dedup-e2e.test.ts
 *
 * Verifies that two messages from the SAME human, arriving on TWO different
 * channels (email + WhatsApp) but sharing an email/phone match, end up on
 * a SINGLE canonical customer row with TWO linked_identities.
 *
 * Run:  node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/customer-dedup-e2e.test.ts
 */

import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import { handleChannelIngest } from '../../server/pipeline/channelIngest.js';

const TENANT = 'org_default';
const WS = 'ws_default';
const RUN = randomUUID().slice(0, 6);
const supabase = getSupabaseAdmin();

const cleanup = { customerIds: [] as string[], canonicalIds: [] as string[] };

async function ingestOnChannel(channel: 'email' | 'whatsapp' | 'sms', senderId: string, messageId: string, metadata: Record<string, any> = {}) {
  // Plant a canonical_event with a normalised payload, then run handleChannelIngest.
  const id = randomUUID();
  cleanup.canonicalIds.push(id);
  const normalized = {
    channel,
    senderId,
    messageContent: `Hi from ${channel}`,
    externalMessageId: messageId,
    externalThreadId: senderId,
    sentAt: new Date().toISOString(),
    metadata,
  };
  const { error } = await supabase.from('canonical_events').insert({
    id,
    tenant_id: TENANT,
    workspace_id: WS,
    dedupe_key: `${channel}:dedup:${messageId}`,
    source_system: channel,
    source_entity_type: 'message',
    source_entity_id: messageId,
    event_type: `${channel}.message.received`,
    event_category: 'inbox',
    occurred_at: new Date().toISOString(),
    normalized_payload: normalized,
    status: 'received',
  });
  if (error) throw new Error(`canonical_events insert: ${error.message}`);

  const ctx: any = { jobId: randomUUID(), tenantId: TENANT, workspaceId: WS, traceId: RUN, attempt: 1 };
  await handleChannelIngest({ canonicalEventId: id, channel, rawMessageId: messageId } as any, ctx);

  // Read back canonical_entity_id (the customer) from the canonical event.
  const { data } = await supabase.from('canonical_events').select('canonical_entity_id').eq('id', id).maybeSingle();
  return data?.canonical_entity_id as string;
}

async function doCleanup() {
  if (cleanup.customerIds.length) {
    await supabase.from('linked_identities').delete().in('customer_id', cleanup.customerIds);
    await supabase.from('customers').delete().in('id', cleanup.customerIds);
  }
  if (cleanup.canonicalIds.length) await supabase.from('canonical_events').delete().in('id', cleanup.canonicalIds);
}

(async () => {
  console.log(`\n▶ Customer dedup E2E (run ${RUN})\n`);
  let exitCode = 0;
  try {
    // Use a numeric-only phone — our dedup normaliser strips non-digits, so
    // a phone with hex chars from RUN would mismatch the stored value.
    const email = `dedup+${RUN}@test.com`;
    const numericRun = String(parseInt(RUN, 36) % 1_000_000).padStart(6, '0');
    const phone = `+34611${numericRun}`;

    // 1) First contact via email — should create a brand-new canonical customer.
    const email1Customer = await ingestOnChannel('email', email, `em_${RUN}_1`);
    if (!email1Customer) throw new Error('email ingest produced no canonical_entity_id');
    cleanup.customerIds.push(email1Customer);
    console.log(`  ✓ first email created canonical customer ${email1Customer.slice(0, 8)}`);

    // Confirm phone is null (we never had it). Patch the customer with the phone
    // so the dedup-by-phone path has something to match later.
    await supabase.from('customers').update({ phone }).eq('id', email1Customer);

    // 2) Second contact via WhatsApp on the same phone — should attach a NEW
    //    linked_identity to the SAME canonical customer (no duplicate row).
    const whatsappCustomer = await ingestOnChannel('whatsapp', phone, `wa_${RUN}_1`);
    if (!whatsappCustomer) throw new Error('whatsapp ingest produced no canonical_entity_id');
    if (whatsappCustomer !== email1Customer) {
      console.log(`  ✗ DUPLICATED — whatsapp produced ${whatsappCustomer.slice(0, 8)} (expected ${email1Customer.slice(0, 8)})`);
      cleanup.customerIds.push(whatsappCustomer);
      exitCode = 1;
    } else {
      console.log(`  ✓ cross-channel dedup matched whatsapp to existing customer (no duplicate row)`);
    }

    // 3) Third contact via SMS on the same phone — should also attach.
    const smsCustomer = await ingestOnChannel('sms', phone, `sm_${RUN}_1`);
    if (smsCustomer && smsCustomer !== email1Customer) {
      console.log(`  ✗ DUPLICATED — sms produced ${smsCustomer.slice(0, 8)} (expected ${email1Customer.slice(0, 8)})`);
      cleanup.customerIds.push(smsCustomer);
      exitCode = 1;
    } else {
      console.log(`  ✓ cross-channel dedup matched sms to existing customer`);
    }

    // 4) Read back identities — should be 3 (email, whatsapp, sms) for the canonical customer.
    const { data: ids } = await supabase
      .from('linked_identities')
      .select('system, external_id')
      .eq('customer_id', email1Customer);
    const systems = (ids ?? []).map((r: any) => r.system).sort();
    if (systems.length === 3 && systems.includes('email') && systems.includes('whatsapp') && systems.includes('sms')) {
      console.log(`  ✓ canonical customer has 3 linked_identities: ${systems.join(', ')}`);
    } else {
      console.log(`  ✗ expected 3 linked identities (email/whatsapp/sms), got ${systems.length}: ${systems.join(', ')}`);
      exitCode = 1;
    }
  } catch (err: any) {
    console.error(`Suite threw: ${err?.message ?? String(err)}`);
    exitCode = 2;
  } finally {
    await doCleanup().catch((e) => console.warn('cleanup warn:', e?.message));
    console.log(`\n✓ cleanup done`);
  }
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Customer dedup E2E: ${exitCode === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`${'─'.repeat(60)}\n`);
  process.exit(exitCode);
})();
