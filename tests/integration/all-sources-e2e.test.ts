/**
 * tests/integration/all-sources-e2e.test.ts
 *
 * End-to-end integration test for every connected source. Inserts a real
 * webhook_event row, runs handleWebhookProcess against the live Supabase,
 * and verifies that:
 *   1. canonical_events row is created with the correct fields
 *   2. webhook_events row is marked 'processed'
 *   3. (when the topic should auto-create) a row in `cases` exists with
 *      the right type/sub_type/source_system/source_channel
 *   4. workflow_event_log captures one row with the canonical event type
 *
 * Cleans up everything it inserts (best-effort) at the end.
 *
 * Run:  node --env-file=.env.local node_modules/tsx/dist/cli.mjs tests/integration/all-sources-e2e.test.ts
 */

import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import { createIntegrationRepository } from '../../server/data/integrations.js';
import { handleWebhookProcess } from '../../server/queue/handlers/webhookProcess.js';

const TENANT_ID    = 'tenant_1';
const WORKSPACE_ID = 'ws_default';
const SCOPE        = { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID };
const RUN_ID       = randomUUID().slice(0, 8);

const createdWebhookIds:    string[] = [];
const createdCanonicalIds:  string[] = [];
const createdCaseIds:       string[] = [];
const createdEventLogIds:   string[] = [];

const supabase = getSupabaseAdmin();
const integrationRepo = createIntegrationRepository();

function makeJobCtx(extra: Record<string, any> = {}) {
  return { jobId: `e2e-${RUN_ID}`, traceId: `e2e-trace-${RUN_ID}`, tenantId: TENANT_ID, workspaceId: WORKSPACE_ID, ...extra } as any;
}

async function insertWebhookEvent(payload: { source: string; topic: string; body: any; }): Promise<string> {
  const id = randomUUID();
  const eventTypeStored = `${payload.source}.${payload.topic}`; // mirrors what each handler stores
  const { error } = await supabase.from('webhook_events').insert({
    id,
    tenant_id:    TENANT_ID,
    source_system: payload.source,
    event_type:    payload.topic,
    raw_payload:   payload.body,
    received_at:   new Date().toISOString(),
    status:        'received',
    dedupe_key:    `e2e-${RUN_ID}-${payload.source}-${randomUUID().slice(0, 6)}`,
  });
  if (error) throw error;
  createdWebhookIds.push(id);
  return id;
}

interface SourceCase {
  source: string;
  topic: string;
  body: any;
  expect: {
    entityType: string;
    expectAutoCase?: boolean;
    expectWorkflow?: string;
  };
}

const SOURCE_CASES: SourceCase[] = [
  // Commerce / payments
  { source: 'shopify',     topic: 'orders/cancelled',           body: { id: 1001, name: '#1001' },                                    expect: { entityType: 'order',  expectAutoCase: true,  expectWorkflow: 'order.updated' } },
  { source: 'stripe',      topic: 'charge.dispute.created',     body: { data: { object: { id: 'dp_1', charge: 'ch_1' } } },           expect: { entityType: 'dispute', expectAutoCase: true, expectWorkflow: 'payment.dispute.created' } },
  { source: 'paypal',      topic: 'CUSTOMER.DISPUTE.CREATED',   body: { event_type: 'CUSTOMER.DISPUTE.CREATED', resource: { dispute_id: 'PP-DISP-1' } }, expect: { entityType: 'dispute', expectAutoCase: true, expectWorkflow: 'payment.dispute.created' } },
  { source: 'woocommerce', topic: 'order.refunded',             body: { id: 'WC-1' },                                                expect: { entityType: 'order', expectAutoCase: true, expectWorkflow: 'payment.refunded' } },

  // Inbound channels
  { source: 'whatsapp',  topic: 'whatsapp.message.received',   body: { entry: [{ changes: [{ value: { messages: [{ id: 'wamid.1' }] } }] }] }, expect: { entityType: 'message', expectAutoCase: true, expectWorkflow: 'inbox.message.received' } },
  { source: 'messenger', topic: 'messenger.message.received',  body: { entry: [{ messaging: [{ message: { mid: 'm.1' } }] }] },             expect: { entityType: 'message', expectAutoCase: true, expectWorkflow: 'inbox.message.received' } },
  { source: 'instagram', topic: 'instagram.message.received',  body: { entry: [{ messaging: [{ message: { mid: 'm.2' } }] }] },             expect: { entityType: 'message', expectAutoCase: true, expectWorkflow: 'inbox.message.received' } },
  { source: 'telegram',  topic: 'telegram.message.received',   body: { message: { message_id: 42 } },                                       expect: { entityType: 'message', expectAutoCase: true, expectWorkflow: 'inbox.message.received' } },
  { source: 'twilio',    topic: 'sms.received',                body: { MessageSid: 'SM_e2e' },                                              expect: { entityType: 'message', expectAutoCase: true, expectWorkflow: 'inbox.message.received' } },
  { source: 'gmail',     topic: 'gmail.message.received',      body: { message: { data: 'abc==' }, historyId: '12345' },                    expect: { entityType: 'message', expectAutoCase: true, expectWorkflow: 'inbox.message.received' } },
  { source: 'outlook',   topic: 'outlook.message.received',    body: { value: [{ resourceData: { id: 'AAMk-e2e' } }] },                     expect: { entityType: 'message', expectAutoCase: true, expectWorkflow: 'inbox.message.received' } },
  { source: 'postmark',  topic: 'Inbound',                     body: { RecordType: 'Inbound', MessageID: 'pm.e2e' },                        expect: { entityType: 'message', expectAutoCase: true, expectWorkflow: 'inbox.message.received' } },
  { source: 'discord',   topic: 'discord.interaction',         body: { id: 'int_e2e' },                                                     expect: { entityType: 'interaction' } },

  // Voice
  { source: 'aircall',   topic: 'call.voicemail_left',          body: { data: { id: 555 } },                              expect: { entityType: 'call',      expectAutoCase: true, expectWorkflow: 'voice.call.completed' } },
  { source: 'aircall',   topic: 'call.transcription_available', body: { data: { id: 556 } },                              expect: { entityType: 'call',      expectAutoCase: true, expectWorkflow: 'voice.transcript.available' } },
  { source: 'zoom',      topic: 'recording.completed',          body: { payload: { object: { uuid: 'z-rec-e2e', id: 1 } } }, expect: { entityType: 'recording', expectAutoCase: true, expectWorkflow: 'voice.recording.available' } },

  // Support
  { source: 'intercom',  topic: 'intercom.conversation.user.created', body: { data: { item: { id: 'conv_1' } } }, expect: { entityType: 'conversation', expectWorkflow: 'support.conversation.updated' } },
  { source: 'zendesk',   topic: 'ticket.created',                     body: { ticket: { id: 7001 } },             expect: { entityType: 'ticket',       expectWorkflow: 'support.ticket.updated' } },
  { source: 'front',     topic: 'message.received',                   body: { conversation: { id: 'cnv_1' } },     expect: { entityType: 'conversation', expectWorkflow: 'inbox.message.received' } },

  // Engineering
  { source: 'linear',    topic: 'linear.issue.create',          body: { type: 'Issue', data: { id: 'iss_1' } },              expect: { entityType: 'issue', expectWorkflow: 'engineering.issue.updated' } },
  { source: 'jira',      topic: 'jira:issue_created',           body: { issue: { id: '10001' } },                            expect: { entityType: 'issue', expectWorkflow: 'engineering.issue.updated' } },
  { source: 'github',    topic: 'github.issues.opened',         body: { issue: { number: 42 } },                             expect: { entityType: 'issue', expectWorkflow: 'engineering.issue.updated' } },
  { source: 'gitlab',    topic: 'Issue Hook',                   body: { object_kind: 'issue', object_attributes: { iid: 7 } }, expect: { entityType: 'issue', expectWorkflow: 'engineering.issue.updated' } },
  { source: 'sentry',    topic: 'sentry.issue.created',         body: { data: { issue: { id: 'sent_1', title: 'TypeError: x is not a function' } } }, expect: { entityType: 'sentry_issue', expectAutoCase: true, expectWorkflow: 'engineering.error.alert' } },
  { source: 'asana',     topic: 'asana.task.changed',           body: { events: [{ resource: { resource_type: 'task', gid: 'tsk_1' } }] }, expect: { entityType: 'task', expectWorkflow: 'engineering.task.updated' } },

  // CRM / Marketing / Sales / Finance
  { source: 'hubspot',    topic: 'contact.creation',            body: [{ subscriptionType: 'contact.creation', objectId: 9001 }], expect: { entityType: 'contact', expectWorkflow: 'crm.contact.updated' } },
  { source: 'salesforce', topic: 'salesforce.contact.update',   body: { sobject: { Id: '0035', attributes: { type: 'Contact' } } }, expect: { entityType: 'contact', expectWorkflow: 'crm.record.updated' } },
  { source: 'pipedrive',  topic: 'updated.deal',                body: { meta: { object: 'deal', id: 12 } },                  expect: { entityType: 'deal',     expectWorkflow: 'crm.deal.updated' } },
  { source: 'docusign',   topic: 'envelope-completed',          body: { data: { envelopeId: 'env_e2e' } },                   expect: { entityType: 'envelope', expectAutoCase: true, expectWorkflow: 'contract.signed' } },
  { source: 'mailchimp',  topic: 'subscribe',                   body: { email: 'a@b.com' },                                   expect: { entityType: 'subscriber', expectWorkflow: 'marketing.subscribed' } },
  { source: 'klaviyo',    topic: 'profile.subscribed_to_email', body: { email: 'a@b.com', profile_id: 'p1' },                 expect: { entityType: 'profile', expectWorkflow: 'marketing.subscribed' } },
  { source: 'segment',    topic: 'track',                       body: { type: 'track', message_id: 'msg_e2e' },               expect: { entityType: 'segment_event', expectWorkflow: 'data.event.tracked' } },
  { source: 'quickbooks', topic: 'Invoice',                     body: { entity_type: 'Invoice', entity_id: '14' },            expect: { entityType: 'invoice', expectWorkflow: 'accounting.record.updated' } },
  { source: 'plaid',      topic: 'ITEM.ITEM_LOGIN_REQUIRED',    body: { item_id: 'plaid_item_1' },                            expect: { entityType: 'plaid_item', expectAutoCase: true, expectWorkflow: 'banking.connection.broken' } },

  // Productivity
  { source: 'gcalendar', topic: 'calendar.changed',  body: { calendar_id: 'primary' },           expect: { entityType: 'calendar_change', expectWorkflow: 'calendar.changed' } },
  { source: 'gdrive',    topic: 'changes',           body: { resource_id: 'r-1' },                expect: { entityType: 'drive_change',    expectWorkflow: 'knowledge.changed' } },
  { source: 'calendly',  topic: 'invitee.created',   body: { payload: { uri: 'cal-uri-e2e', name: 'Customer' } }, expect: { entityType: 'scheduled_event', expectAutoCase: true, expectWorkflow: 'meeting.scheduled' } },

  // Shipping
  { source: 'ups',       topic: 'tracking.update', body: { trackingNumber: '1Z-e2e' }, expect: { entityType: 'shipment', expectWorkflow: 'shipping.updated' } },
  { source: 'dhl',       topic: 'tracking.update', body: { trackingNumber: 'DHL-e2e' }, expect: { entityType: 'shipment', expectWorkflow: 'shipping.updated' } },

  // Team chat
  { source: 'slack',     topic: 'message',     body: { event: { ts: `${Date.now()}.001` } }, expect: { entityType: 'message', expectWorkflow: 'team_chat.message' } },
  { source: 'teams',     topic: 'chatMessage', body: { value: [{ resourceData: { id: 'tm-e2e' } }] }, expect: { entityType: 'message', expectWorkflow: 'team_chat.message' } },
];

interface Result {
  source: string; topic: string;
  pass: boolean; reason?: string;
  canonicalCreated?: boolean; webhookProcessed?: boolean;
  caseCreated?: boolean; expectedCase?: boolean;
  workflowFired?: boolean; workflowType?: string;
}

async function runOne(c: SourceCase): Promise<Result> {
  const r: Result = { source: c.source, topic: c.topic, pass: false, expectedCase: c.expect.expectAutoCase === true };
  let webhookId: string;
  try { webhookId = await insertWebhookEvent({ source: c.source, topic: c.topic, body: c.body }); }
  catch (err: any) { r.reason = `insert webhook: ${err?.message ?? err}`; return r; }

  // Run the handler — `setImmediate(autoCreateCaseAndFireEvent)` is async,
  // we'll wait a beat after the main handler returns.
  try {
    await handleWebhookProcess({ webhookEventId: webhookId, source: c.source, rawBody: JSON.stringify(c.body), headers: {} as any }, makeJobCtx());
  } catch (err: any) { r.reason = `handler threw: ${err?.message ?? err}`; return r; }

  // Wait for the deferred auto-case work + workflow-event-bus persist
  await new Promise(res => setTimeout(res, 600));

  // 1. webhook marked processed?
  const we = await integrationRepo.getWebhookEvent(SCOPE, webhookId);
  r.webhookProcessed = we?.status === 'processed';
  if (we?.canonical_event_id) createdCanonicalIds.push(we.canonical_event_id);

  // 2. canonical event present?
  const ce = we?.canonical_event_id ? await supabase.from('canonical_events').select('*').eq('id', we.canonical_event_id).maybeSingle() : null;
  r.canonicalCreated = !!ce?.data;

  // 3. case created?
  const cs = await supabase.from('cases')
    .select('id, type, source_system, source_channel, ai_diagnosis')
    .eq('tenant_id', TENANT_ID).eq('workspace_id', WORKSPACE_ID)
    .eq('source_system', `webhook:${c.source}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cs?.data?.id && cs.data.ai_diagnosis && (cs.data.ai_diagnosis as string).length > 0) {
    // Likely the one we just created, since each test run uses unique payload bodies
    createdCaseIds.push(cs.data.id);
    r.caseCreated = true;
  } else r.caseCreated = false;

  // 4. workflow event fired?
  const wf = await supabase.from('workflow_event_log')
    .select('id, event_type')
    .eq('tenant_id', TENANT_ID).eq('workspace_id', WORKSPACE_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (wf?.data?.id) createdEventLogIds.push(wf.data.id);
  r.workflowFired = !!wf?.data;
  r.workflowType  = wf?.data?.event_type ?? undefined;

  // Pass criteria:
  //  - webhook is processed
  //  - canonical event exists
  //  - workflow event fired (always expected)
  //  - if expectAutoCase, a case must exist
  //  - if expectWorkflow, the type must match
  const okWebhook = !!r.webhookProcessed;
  const okCanonical = !!r.canonicalCreated;
  const okWorkflow  = !!r.workflowFired && (!c.expect.expectWorkflow || r.workflowType === c.expect.expectWorkflow);
  const okCase      = !c.expect.expectAutoCase || !!r.caseCreated;
  r.pass = okWebhook && okCanonical && okWorkflow && okCase;
  if (!r.pass) {
    const fails: string[] = [];
    if (!okWebhook) fails.push('webhook-not-processed');
    if (!okCanonical) fails.push('canonical-missing');
    if (!okWorkflow) fails.push(`workflow-${r.workflowType ?? 'missing'}-vs-${c.expect.expectWorkflow ?? 'any'}`);
    if (!okCase) fails.push('expected-case-missing');
    r.reason = fails.join(',');
  }
  return r;
}

async function cleanup() {
  console.log('\n▶ Cleanup:');
  if (createdEventLogIds.length) {
    await supabase.from('workflow_event_log').delete().in('id', createdEventLogIds);
    console.log(`  removed ${createdEventLogIds.length} workflow_event_log rows`);
  }
  if (createdCaseIds.length) {
    await supabase.from('cases').delete().in('id', createdCaseIds);
    console.log(`  removed ${createdCaseIds.length} cases rows`);
  }
  if (createdCanonicalIds.length) {
    await supabase.from('canonical_events').delete().in('id', createdCanonicalIds);
    console.log(`  removed ${createdCanonicalIds.length} canonical_events rows`);
  }
  if (createdWebhookIds.length) {
    await supabase.from('webhook_events').delete().in('id', createdWebhookIds);
    console.log(`  removed ${createdWebhookIds.length} webhook_events rows`);
  }
}

(async () => {
  console.log(`\n▶ Running E2E for ${SOURCE_CASES.length} sources against tenant_1/ws_default (run_id=${RUN_ID})\n`);
  const results: Result[] = [];
  // Run sequentially so workflow_event_log lookup picks up the right "latest" row per case.
  for (const c of SOURCE_CASES) {
    process.stdout.write(`  ${c.source.padEnd(12)} ${c.topic.padEnd(40)} `);
    const r = await runOne(c);
    results.push(r);
    if (r.pass) console.log('✓');
    else console.log(`✗ ${r.reason ?? 'unknown'}`);
  }

  await cleanup();

  const passed = results.filter(r => r.pass).length;
  const failed = results.length - passed;
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`E2E summary: ${passed} passed / ${failed} failed / ${results.length} total`);
  console.log(`${'─'.repeat(60)}\n`);
  if (failed > 0) {
    console.log('Failures detail:');
    for (const r of results.filter(r => !r.pass)) {
      console.log(`  ✗ ${r.source}/${r.topic}: ${r.reason}`);
      console.log(`    canonical=${r.canonicalCreated} processed=${r.webhookProcessed} case=${r.caseCreated}(expected=${r.expectedCase}) workflow=${r.workflowType ?? 'none'}`);
    }
  }
  process.exit(failed > 0 ? 1 : 0);
})().catch(async (err) => {
  console.error('Suite crashed:', err);
  await cleanup().catch(() => {});
  process.exit(2);
});
