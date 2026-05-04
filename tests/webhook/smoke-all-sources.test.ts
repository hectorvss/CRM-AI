/**
 * tests/webhook/smoke-all-sources.test.ts
 *
 * Pure-unit smoke test (no DB, no network, no env vars).
 *
 * For each connected integration we feed a representative payload through:
 *   1. EXTRACTORS[source]            — does it produce a non-trivial entity?
 *   2. topicToWorkflowEvent(...)     — does it normalise to a canonical event?
 *   3. classifyWebhookForCase(...)   — when the topic is in the auto-create
 *                                       set, does it produce a non-empty case
 *                                       type + summary?
 *
 * This proves the in-process pipeline logic is consistent across every
 * source. It does NOT prove that:
 *   - signature verification works against real provider payloads
 *   - the OAuth callback succeeds (needs env + registered apps)
 *   - the Supabase tables exist with the assumed columns
 *   - the AI agent actually picks the new tools when planning
 *
 * Run:  npx tsx tests/webhook/smoke-all-sources.test.ts
 */

import {
  EXTRACTORS,
  CASE_AUTO_CREATE_TOPICS,
  classifyWebhookForCase,
  topicToWorkflowEvent,
  type EntityExtraction,
} from '../../server/queue/handlers/webhookProcess.js';

interface Case {
  source: string;
  topic: string;
  body: Record<string, any>;
  expect: { entityType: string; expectAutoCase?: boolean; expectWorkflow?: string };
}

// One representative payload per source. We pick the highest-value topic that
// should match the auto-case set when the source has an inbox/escalation flow.
const CASES: Case[] = [
  // Commerce
  { source: 'shopify',     topic: 'orders/cancelled',           body: { id: 1001, name: '#1001' },                                    expect: { entityType: 'order',     expectAutoCase: true,  expectWorkflow: 'order.updated' } },
  { source: 'shopify',     topic: 'refunds/create',             body: { id: 9001, order_id: 1001, transactions: [{ amount: '12.50' }] }, expect: { entityType: 'refund',  expectAutoCase: true,  expectWorkflow: 'payment.refunded' } },
  { source: 'stripe',      topic: 'charge.dispute.created',     body: { data: { object: { id: 'dp_1', charge: 'ch_1' } } },           expect: { entityType: 'dispute',   expectAutoCase: true,  expectWorkflow: 'payment.dispute.created' } },
  { source: 'stripe',      topic: 'charge.refunded',            body: { data: { object: { id: 'ch_2' } } },                          expect: { entityType: 'refund',    expectAutoCase: true,  expectWorkflow: 'payment.refunded' } },
  { source: 'paypal',      topic: 'CUSTOMER.DISPUTE.CREATED',   body: { event_type: 'CUSTOMER.DISPUTE.CREATED', resource: { dispute_id: 'PP-DISP-1' } }, expect: { entityType: 'dispute', expectAutoCase: true, expectWorkflow: 'payment.dispute.created' } },
  { source: 'woocommerce', topic: 'order.refunded',             body: { id: 'WC-1' },                                                expect: { entityType: 'order',     expectAutoCase: true,  expectWorkflow: 'payment.refunded' } },

  // Customer-facing channels (auto-open support cases)
  { source: 'whatsapp',  topic: 'whatsapp.message.received',     body: { entry: [{ changes: [{ value: { messages: [{ id: 'wamid.1' }] } }] }] }, expect: { entityType: 'message', expectAutoCase: true, expectWorkflow: 'inbox.message.received' } },
  { source: 'messenger', topic: 'messenger.message.received',    body: { entry: [{ messaging: [{ message: { mid: 'm.1' } }] }] },             expect: { entityType: 'message', expectAutoCase: true, expectWorkflow: 'inbox.message.received' } },
  { source: 'instagram', topic: 'instagram.message.received',    body: { entry: [{ messaging: [{ message: { mid: 'm.2' } }] }] },             expect: { entityType: 'message', expectAutoCase: true, expectWorkflow: 'inbox.message.received' } },
  { source: 'telegram',  topic: 'telegram.message.received',     body: { message: { message_id: 42 } },                                       expect: { entityType: 'message', expectAutoCase: true, expectWorkflow: 'inbox.message.received' } },
  { source: 'twilio',    topic: 'sms.received',                  body: { MessageSid: 'SM_1' },                                                 expect: { entityType: 'message', expectAutoCase: true, expectWorkflow: 'inbox.message.received' } },
  { source: 'gmail',     topic: 'gmail.message.received',        body: { message: { data: 'abc==' }, historyId: '12345' },                    expect: { entityType: 'message', expectAutoCase: true, expectWorkflow: 'inbox.message.received' } },
  { source: 'outlook',   topic: 'outlook.message.received',      body: { value: [{ resourceData: { id: 'AAMk-1' } }] },                       expect: { entityType: 'message', expectAutoCase: true, expectWorkflow: 'inbox.message.received' } },
  { source: 'postmark',  topic: 'Inbound',                       body: { RecordType: 'Inbound', MessageID: 'pm.1' },                           expect: { entityType: 'message', expectAutoCase: true, expectWorkflow: 'inbox.message.received' } },
  { source: 'discord',   topic: 'discord.interaction',           body: { id: 'int_1' },                                                        expect: { entityType: 'interaction', expectAutoCase: false } },

  // Voice
  { source: 'aircall', topic: 'call.voicemail_left',           body: { data: { id: 555 } },                              expect: { entityType: 'call', expectAutoCase: true,  expectWorkflow: 'voice.call.completed' } },
  { source: 'aircall', topic: 'call.transcription_available',  body: { data: { id: 556 } },                              expect: { entityType: 'call', expectAutoCase: true,  expectWorkflow: 'voice.transcript.available' } },
  { source: 'zoom',    topic: 'recording.completed',           body: { payload: { object: { uuid: 'abc==', id: 1 } } },  expect: { entityType: 'recording', expectAutoCase: true, expectWorkflow: 'voice.recording.available' } },

  // Support inboxes
  { source: 'intercom', topic: 'intercom.conversation.user.created', body: { data: { item: { id: 'conv_1' } } },         expect: { entityType: 'conversation', expectWorkflow: 'support.conversation.updated' } },
  { source: 'zendesk',  topic: 'ticket.created',                     body: { ticket: { id: 7001 } },                     expect: { entityType: 'ticket',       expectWorkflow: 'support.ticket.updated' } },
  { source: 'front',    topic: 'message.received',                   body: { conversation: { id: 'cnv_1' } },             expect: { entityType: 'conversation', expectWorkflow: 'inbox.message.received' } },

  // Engineering
  { source: 'linear',  topic: 'linear.issue.create',         body: { type: 'Issue', data: { id: 'iss_1' } },              expect: { entityType: 'issue',       expectWorkflow: 'engineering.issue.updated' } },
  { source: 'jira',    topic: 'jira:issue_created',          body: { issue: { id: '10001' } },                            expect: { entityType: 'issue',       expectWorkflow: 'engineering.issue.updated' } },
  { source: 'github',  topic: 'github.issues.opened',        body: { issue: { number: 42 } },                             expect: { entityType: 'issue',       expectWorkflow: 'engineering.issue.updated' } },
  { source: 'gitlab',  topic: 'Issue Hook',                  body: { object_kind: 'issue', object_attributes: { iid: 7 } }, expect: { entityType: 'issue',     expectWorkflow: 'engineering.issue.updated' } },
  { source: 'sentry',  topic: 'sentry.issue.created',        body: { data: { issue: { id: 'sent_1', title: 'TypeError' } } }, expect: { entityType: 'sentry_issue', expectAutoCase: true, expectWorkflow: 'engineering.error.alert' } },
  { source: 'asana',   topic: 'asana.task.changed',          body: { events: [{ resource: { resource_type: 'task', gid: 'tsk_1' } }] }, expect: { entityType: 'task', expectWorkflow: 'engineering.task.updated' } },

  // CRM / Marketing / Sales / Finance
  { source: 'hubspot',    topic: 'contact.creation',         body: [{ subscriptionType: 'contact.creation', objectId: 9001 }], expect: { entityType: 'contact', expectWorkflow: 'crm.contact.updated' } },
  { source: 'salesforce', topic: 'salesforce.contact.update', body: { sobject: { Id: '0035', attributes: { type: 'Contact' } } }, expect: { entityType: 'contact', expectWorkflow: 'crm.record.updated' } },
  { source: 'pipedrive',  topic: 'updated.deal',             body: { meta: { object: 'deal', id: 12 } },                  expect: { entityType: 'deal',        expectWorkflow: 'crm.deal.updated' } },
  { source: 'docusign',   topic: 'envelope-completed',       body: { data: { envelopeId: 'env_1' } },                    expect: { entityType: 'envelope', expectAutoCase: true, expectWorkflow: 'contract.signed' } },
  { source: 'mailchimp',  topic: 'subscribe',                body: { email: 'a@b.com' },                                  expect: { entityType: 'subscriber',  expectWorkflow: 'marketing.subscribed' } },
  { source: 'klaviyo',    topic: 'profile.subscribed_to_email', body: { email: 'a@b.com', profile_id: 'p1' },              expect: { entityType: 'profile',     expectWorkflow: 'marketing.subscribed' } },
  { source: 'segment',    topic: 'track',                    body: { type: 'track', message_id: 'msg_1' },                expect: { entityType: 'segment_event', expectWorkflow: 'data.event.tracked' } },
  { source: 'quickbooks', topic: 'Invoice',                  body: { entity_type: 'Invoice', entity_id: '14' },            expect: { entityType: 'invoice',     expectWorkflow: 'accounting.record.updated' } },
  { source: 'plaid',      topic: 'ITEM.ITEM_LOGIN_REQUIRED', body: { item_id: 'plaid_item_1' },                            expect: { entityType: 'plaid_item',  expectAutoCase: true, expectWorkflow: 'banking.connection.broken' } },

  // Productivity
  { source: 'gcalendar', topic: 'calendar.changed', body: { calendar_id: 'primary' },           expect: { entityType: 'calendar_change', expectWorkflow: 'calendar.changed' } },
  { source: 'gdrive',    topic: 'changes',          body: { resource_id: 'r-1' },                expect: { entityType: 'drive_change',    expectWorkflow: 'knowledge.changed' } },
  { source: 'calendly',  topic: 'invitee.created',  body: { payload: { uri: 'cal-uri', name: 'Customer' } }, expect: { entityType: 'scheduled_event', expectAutoCase: true, expectWorkflow: 'meeting.scheduled' } },

  // Shipping
  { source: 'ups', topic: 'tracking.update', body: { trackingNumber: '1Z999' }, expect: { entityType: 'shipment', expectWorkflow: 'shipping.updated' } },
  { source: 'dhl', topic: 'tracking.update', body: { trackingNumber: 'DHL-1' }, expect: { entityType: 'shipment', expectWorkflow: 'shipping.updated' } },

  // Team chat
  { source: 'slack', topic: 'message',     body: { event: { ts: '1700.0001' } }, expect: { entityType: 'message', expectWorkflow: 'team_chat.message' } },
  { source: 'teams', topic: 'chatMessage', body: { value: [{ resourceData: { id: 'tm-1' } }] }, expect: { entityType: 'message', expectWorkflow: 'team_chat.message' } },
];

// ── Run ──────────────────────────────────────────────────────────────────────

interface Result { case: Case; pass: boolean; reason?: string; got?: { extraction: EntityExtraction; workflow: string; classification?: any } }

const results: Result[] = [];
let passed = 0; let failed = 0;

for (const c of CASES) {
  const fail = (reason: string, got?: any) => {
    failed++;
    results.push({ case: c, pass: false, reason, got });
  };
  const pass = (got: any) => { passed++; results.push({ case: c, pass: true, got }); };

  const extractor = EXTRACTORS[c.source];
  if (!extractor) { fail(`no extractor registered for source="${c.source}"`); continue; }

  let extraction: EntityExtraction;
  try { extraction = extractor(c.topic, c.body); }
  catch (err: any) { fail(`extractor threw: ${err?.message ?? err}`); continue; }

  if (extraction.entityType !== c.expect.entityType) { fail(`expected entityType="${c.expect.entityType}" got="${extraction.entityType}"`, { extraction }); continue; }

  const workflow = topicToWorkflowEvent(c.source, c.topic);
  if (c.expect.expectWorkflow && workflow !== c.expect.expectWorkflow) {
    fail(`expected workflow="${c.expect.expectWorkflow}" got="${workflow}"`, { extraction, workflow }); continue;
  }

  const isAutoCase = CASE_AUTO_CREATE_TOPICS.has(c.topic) || CASE_AUTO_CREATE_TOPICS.has(`${c.source}:${c.topic}`);
  if (c.expect.expectAutoCase === true && !isAutoCase) {
    fail(`expected auto-case for ${c.source}:${c.topic} but it's not in CASE_AUTO_CREATE_TOPICS`, { extraction, workflow }); continue;
  }

  let classification: any = null;
  if (isAutoCase) {
    try { classification = classifyWebhookForCase(c.source, c.topic, c.body); }
    catch (err: any) { fail(`classifier threw: ${err?.message ?? err}`); continue; }
    if (!classification.caseType || !classification.summary || !classification.priority) {
      fail(`classifier produced empty fields: ${JSON.stringify(classification)}`, { extraction, workflow, classification }); continue;
    }
  }

  pass({ extraction, workflow, classification });
}

// ── Coverage check: every connected integration has an extractor ─────────────

const CONNECTED_SOURCES = [
  'shopify', 'stripe', 'paypal', 'woocommerce',
  'whatsapp', 'messenger', 'instagram', 'telegram', 'twilio',
  'gmail', 'outlook', 'postmark', 'discord', 'slack', 'teams',
  'aircall', 'zoom', 'intercom', 'zendesk', 'front',
  'linear', 'jira', 'github', 'gitlab', 'sentry', 'asana',
  'hubspot', 'salesforce', 'pipedrive', 'docusign', 'quickbooks', 'plaid',
  'mailchimp', 'klaviyo', 'segment',
  'gcalendar', 'gdrive', 'calendly', 'ups', 'dhl',
];

console.log('\n=== EXTRACTOR COVERAGE ===');
const missing = CONNECTED_SOURCES.filter(s => !EXTRACTORS[s]);
console.log(`registered: ${Object.keys(EXTRACTORS).length} / expected: ${CONNECTED_SOURCES.length}`);
if (missing.length > 0) console.log(`missing extractors: ${missing.join(', ')}`);
else console.log('✓ all connected sources have an extractor');

console.log('\n=== PER-CASE RESULTS ===');
for (const r of results) {
  const tag = r.pass ? '✓' : '✗';
  const head = `${tag} ${r.case.source.padEnd(12)} ${r.case.topic.padEnd(40)}`;
  if (r.pass) {
    console.log(`${head} → ${r.got!.extraction.entityType.padEnd(18)} ${r.got!.workflow}${r.got!.classification ? ` [auto-case:${r.got!.classification.caseType}]` : ''}`);
  } else {
    console.log(`${head} FAIL: ${r.reason}${r.got ? ` (got: ${JSON.stringify(r.got)})` : ''}`);
  }
}

console.log(`\n=== SUMMARY ===`);
console.log(`passed: ${passed} / ${CASES.length}`);
console.log(`failed: ${failed}`);
console.log(`extractor coverage: ${CONNECTED_SOURCES.length - missing.length} / ${CONNECTED_SOURCES.length}`);

if (failed > 0 || missing.length > 0) process.exit(1);
process.exit(0);
