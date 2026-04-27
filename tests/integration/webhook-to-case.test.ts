/**
 * tests/integration/webhook-to-case.test.ts
 *
 * End-to-end integration test: webhook â†’ canonical_event â†’ case auto-creation
 * â†’ workflow_event_log durability.
 *
 * Requires a live Supabase connection (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
 * Uses tenant_id='tenant_1' / workspace_id='ws_default' (the default seed data).
 *
 * Run:
 *   npx dotenvx run -- npx tsx tests/integration/webhook-to-case.test.ts
 *
 * Each test run inserts rows with a unique run_id prefix and deletes them at the end.
 * Safe to run multiple times.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../../server/db/supabase.js';
import { createIntegrationRepository } from '../../server/data/integrations.js';
import { createCanonicalRepository } from '../../server/data/canonical.js';
import { handleWebhookProcess } from '../../server/queue/handlers/webhookProcess.js';
import { fireWorkflowEvent } from '../../server/lib/workflowEventBus.js';

// â”€â”€ Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const TENANT_ID    = 'tenant_1';
const WORKSPACE_ID = 'ws_default';
const SCOPE        = { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID };
const RUN_ID       = randomUUID().slice(0, 8);  // unique per test run

// IDs created during this run â€” collected for cleanup
const createdWebhookIds:    string[] = [];
const createdCanonicalIds:  string[] = [];
const createdCaseIds:       string[] = [];
const createdEventLogIds:   string[] = [];

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function makeJobCtx(extra: Record<string, any> = {}) {
  return {
    jobId:       `test-job-${RUN_ID}`,
    traceId:     `test-trace-${RUN_ID}`,
    tenantId:    TENANT_ID,
    workspaceId: WORKSPACE_ID,
    userId:      'user_test',
    attempt:     1,
    ...extra,
  } as any;
}

/**
 * Insert a webhook_event row and return its ID.
 * Note: webhook_events has no workspace_id column; uses source_system not source.
 */
async function seedWebhookEvent(opts: {
  source: string;
  eventType: string;
  payload: Record<string, any>;
}): Promise<string> {
  const integrationRepo = createIntegrationRepository();
  const id = `whe-test-${RUN_ID}-${randomUUID().slice(0, 6)}`;
  const dedupeKey = `test:${opts.source}:${opts.eventType}:${RUN_ID}:${id}`;

  await integrationRepo.createWebhookEvent(SCOPE, {
    id,
    source_system: opts.source,
    event_type:    opts.eventType,
    raw_payload:   opts.payload,
    dedupe_key:    dedupeKey,
    status:        'received',
  });

  createdWebhookIds.push(id);
  return id;
}

/** Wait for setImmediate callbacks to flush (async case creation fires via setImmediate) */
function flushMicrotasks(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let passed = 0;
let failed = 0;
const errors: string[] = [];

async function test(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  âœ“ ${label}`);
  } catch (err: any) {
    failed++;
    const msg = err?.message ?? String(err);
    errors.push(`  âœ— ${label}: ${msg}`);
    console.error(`  âœ— ${label}: ${msg}`);
  }
}

// â”€â”€ Suite 1: Stripe dispute â€” full pipeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

console.log('\nâ–¶ Suite 1: Stripe dispute webhook â†’ canonical â†’ case');

await test('inserts webhook_event and handler marks it processed', async () => {
  const webhookId = await seedWebhookEvent({
    source:    'stripe',
    eventType: 'charge.dispute.created',
    payload:   {
      id:      `evt-${RUN_ID}`,
      created: Math.floor(Date.now() / 1000),
      data:    { object: { id: `dp-${RUN_ID}`, charge: `ch-${RUN_ID}` } },
    },
  });

  await handleWebhookProcess(
    { webhookEventId: webhookId, source: 'stripe', rawBody: '', headers: {} },
    makeJobCtx(),
  );

  const supabase = getSupabaseAdmin();
  const { data: row } = await supabase
    .from('webhook_events')
    .select('status, canonical_event_id')
    .eq('id', webhookId)
    .single();

  assert.equal(row?.status, 'processed', 'webhook_event should be marked processed');
  assert.ok(row?.canonical_event_id, 'webhook_event should have a canonical_event_id');

  if (row?.canonical_event_id) createdCanonicalIds.push(row.canonical_event_id);
});

await test('canonical_event created with correct fields', async () => {
  const webhookId = await seedWebhookEvent({
    source:    'stripe',
    eventType: 'charge.dispute.created',
    payload:   {
      id:      `evt2-${RUN_ID}`,
      created: Math.floor(Date.now() / 1000),
      data:    { object: { id: `dp2-${RUN_ID}`, charge: `ch2-${RUN_ID}` } },
    },
  });

  await handleWebhookProcess(
    { webhookEventId: webhookId, source: 'stripe', rawBody: '', headers: {} },
    makeJobCtx(),
  );

  const supabase = getSupabaseAdmin();
  const { data: wh } = await supabase
    .from('webhook_events')
    .select('canonical_event_id')
    .eq('id', webhookId)
    .single();

  const canonicalId = wh?.canonical_event_id;
  assert.ok(canonicalId, 'canonical_event_id must exist on webhook row');
  createdCanonicalIds.push(canonicalId);

  const { data: canonical } = await supabase
    .from('canonical_events')
    .select('*')
    .eq('id', canonicalId)
    .single();

  assert.ok(canonical, 'canonical_event row must exist');
  assert.equal(canonical.event_type, 'charge.dispute.created');
  assert.equal(canonical.source_system, 'stripe');
  assert.equal(canonical.source_entity_type, 'dispute');
  assert.equal(canonical.status, 'received');
  assert.equal(canonical.tenant_id, TENANT_ID);
});

await test('deduplication: second run with same topic+entity reuses canonical_event', async () => {
  const entityId   = `dedup-entity-${RUN_ID}`;
  const dedupeKey  = `stripe:charge.dispute.created:${entityId}`;

  // First run
  const webhookId1 = await seedWebhookEvent({
    source:    'stripe',
    eventType: 'charge.dispute.created',
    payload:   { id: `dedup-evt1-${RUN_ID}`, created: Math.floor(Date.now()/1000), data: { object: { id: entityId } } },
  });
  await handleWebhookProcess(
    { webhookEventId: webhookId1, source: 'stripe', rawBody: '', headers: {} },
    makeJobCtx(),
  );

  const canonicalRepo = createCanonicalRepository();
  const first = await canonicalRepo.getEventByDedupeKey(SCOPE, dedupeKey);
  assert.ok(first, 'First run should create canonical_event');
  createdCanonicalIds.push(first.id);

  // Second run â€” same entity ID, different webhook_event
  const webhookId2 = await seedWebhookEvent({
    source:    'stripe',
    eventType: 'charge.dispute.created',
    payload:   { id: `dedup-evt2-${RUN_ID}`, created: Math.floor(Date.now()/1000), data: { object: { id: entityId } } },
  });
  await handleWebhookProcess(
    { webhookEventId: webhookId2, source: 'stripe', rawBody: '', headers: {} },
    makeJobCtx(),
  );

  // Both webhooks should point to the SAME canonical event
  const supabase = getSupabaseAdmin();
  const { data: wh2 } = await supabase
    .from('webhook_events')
    .select('canonical_event_id')
    .eq('id', webhookId2)
    .single();

  assert.equal(wh2?.canonical_event_id, first.id, 'Duplicate event should reuse existing canonical_event');
});

await test('auto-creates case for charge.dispute.created (CASE_AUTO_CREATE_TOPICS)', async () => {
  const chargeId = `ch-autocase-${RUN_ID}`;
  const webhookId = await seedWebhookEvent({
    source:    'stripe',
    eventType: 'charge.dispute.created',
    payload:   {
      id:      `evt-autocase-${RUN_ID}`,
      created: Math.floor(Date.now() / 1000),
      data:    { object: { id: `dp-autocase-${RUN_ID}`, charge: chargeId } },
    },
  });

  await handleWebhookProcess(
    { webhookEventId: webhookId, source: 'stripe', rawBody: '', headers: {} },
    makeJobCtx(),
  );

  // Auto-case creation is async (setImmediate) â€” give it time to complete
  await flushMicrotasks(600);

  const supabase = getSupabaseAdmin();
  // Cases use source_system and ai_diagnosis (not source/description)
  const { data: cases } = await supabase
    .from('cases')
    .select('id, type, sub_type, priority, source_system, ai_diagnosis')
    .eq('tenant_id', TENANT_ID)
    .eq('source_system', 'webhook:stripe')
    .ilike('ai_diagnosis', `%${chargeId}%`)
    .order('created_at', { ascending: false })
    .limit(5);

  assert.ok(cases && cases.length > 0, 'A case should have been auto-created for charge.dispute.created');
  const c = cases![0];
  assert.equal(c.type, 'dispute');
  assert.equal(c.sub_type, 'chargeback');
  assert.equal(c.priority, 'critical');

  createdCaseIds.push(...(cases || []).map((x: any) => x.id));
});

await test('no auto-case for non-triggering topic (customers/create)', async () => {
  const webhookId = await seedWebhookEvent({
    source:    'shopify',
    eventType: 'customers/create',
    payload:   { id: `cust-notopic-${RUN_ID}`, email: `test-${RUN_ID}@example.com` },
  });

  const supabase = getSupabaseAdmin();
  // Count cases before
  const { count: before } = await supabase
    .from('cases')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID)
    .eq('source_system', 'webhook:shopify');

  await handleWebhookProcess(
    { webhookEventId: webhookId, source: 'shopify', rawBody: '', headers: {} },
    makeJobCtx(),
  );
  await flushMicrotasks(400);

  const { count: after } = await supabase
    .from('cases')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', TENANT_ID)
    .eq('source_system', 'webhook:shopify');

  assert.equal(after, before, 'customers/create should NOT auto-create a case');
});

// â”€â”€ Suite 2: Shopify order/cancelled â†’ case â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

console.log('\nâ–¶ Suite 2: Shopify order cancelled â†’ case');

await test('shopify orders/cancelled auto-creates order_issue case', async () => {
  const orderName = `ORDER-${RUN_ID}`;
  const webhookId = await seedWebhookEvent({
    source:    'shopify',
    eventType: 'orders/cancelled',
    payload:   { id: 12345, name: orderName, order_id: 12345 },
  });

  await handleWebhookProcess(
    { webhookEventId: webhookId, source: 'shopify', rawBody: '', headers: {} },
    makeJobCtx(),
  );
  await flushMicrotasks(600);

  const supabase = getSupabaseAdmin();
  const { data: cases } = await supabase
    .from('cases')
    .select('id, type, sub_type, priority')
    .eq('tenant_id', TENANT_ID)
    .eq('source_system', 'webhook:shopify')
    .eq('type', 'order_issue')
    .ilike('ai_diagnosis', `%${orderName}%`)
    .order('created_at', { ascending: false })
    .limit(3);

  assert.ok(cases && cases.length > 0, 'Auto-case for orders/cancelled should exist');
  assert.equal(cases![0].sub_type, 'cancellation');
  assert.equal(cases![0].priority, 'medium');

  createdCaseIds.push(...(cases || []).map((x: any) => x.id));
});

// â”€â”€ Suite 3: Durable event bus â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

console.log('\nâ–¶ Suite 3: Durable workflow_event_log');

await test('fireWorkflowEvent persists a row in workflow_event_log', async () => {
  const eventType = `test.integration.${RUN_ID}`;

  fireWorkflowEvent(SCOPE, eventType, { source: 'integration-test', runId: RUN_ID });

  // Give the setImmediate + DB write time to complete
  await flushMicrotasks(600);

  const supabase = getSupabaseAdmin();
  const { data: rows } = await supabase
    .from('workflow_event_log')
    .select('id, event_type, status')
    .eq('tenant_id', TENANT_ID)
    .eq('event_type', eventType)
    .order('created_at', { ascending: false })
    .limit(5);

  assert.ok(rows && rows.length > 0, 'workflow_event_log should have a row for the fired event');
  // Status may be 'executed' (workflows matched) or 'failed' (no matching workflow, that's OK)
  // but must NOT be stuck as 'pending' after the flush
  const row = rows![0];
  assert.ok(
    row.status === 'executed' || row.status === 'failed',
    `Event log row should be executed or failed after flush, got: ${row.status}`,
  );

  createdEventLogIds.push(...(rows || []).map((r: any) => r.id));
});

await test('workflow_event_log row has correct tenant_id and workspace_id', async () => {
  const eventType = `test.integration.scope.${RUN_ID}`;

  fireWorkflowEvent(SCOPE, eventType, { runId: RUN_ID });
  await flushMicrotasks(600);

  const supabase = getSupabaseAdmin();
  const { data: rows } = await supabase
    .from('workflow_event_log')
    .select('id, tenant_id, workspace_id, event_type')
    .eq('event_type', eventType)
    .limit(3);

  assert.ok(rows && rows.length > 0, 'Row should exist');
  assert.equal(rows![0].tenant_id,    TENANT_ID);
  assert.equal(rows![0].workspace_id, WORKSPACE_ID);

  createdEventLogIds.push(...(rows || []).map((r: any) => r.id));
});

// â”€â”€ Suite 4: Raw payload JSONB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

console.log('\nâ–¶ Suite 4: raw_payload JSONB handling');

await test('handler parses JSONB raw_payload (not a string) without throwing', async () => {
  // Supabase stores raw_payload as JSONB; on retrieval it's a JS object, NOT a string.
  // The handler must NOT call JSON.parse() on it directly.
  const webhookId = await seedWebhookEvent({
    source:    'stripe',
    eventType: 'charge.failed',
    payload: {
      id:      `evt-jsonb-${RUN_ID}`,
      created: Math.floor(Date.now() / 1000),
      data:    {
        object: {
          id:                 `ch-jsonb-${RUN_ID}`,
          last_payment_error: { message: 'Insufficient funds' },
        },
      },
    },
  });

  // Should NOT throw
  await handleWebhookProcess(
    { webhookEventId: webhookId, source: 'stripe', rawBody: '', headers: {} },
    makeJobCtx(),
  );
  await flushMicrotasks(500);

  const supabase = getSupabaseAdmin();
  const { data: wh } = await supabase
    .from('webhook_events')
    .select('status')
    .eq('id', webhookId)
    .single();

  assert.equal(wh?.status, 'processed', 'JSONB payload should be parsed correctly and webhook marked processed');

  // Verify case was created with correct ai_diagnosis
  const { data: cases } = await supabase
    .from('cases')
    .select('id, type, ai_diagnosis')
    .eq('tenant_id', TENANT_ID)
    .eq('type', 'payment_issue')
    .ilike('ai_diagnosis', '%Insufficient funds%')
    .order('created_at', { ascending: false })
    .limit(3);

  assert.ok(cases && cases.length > 0, 'Case should be created with "Insufficient funds" in ai_diagnosis');
  createdCaseIds.push(...(cases || []).map((x: any) => x.id));
});

// â”€â”€ Cleanup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

console.log('\nâ–¶ Cleanup: removing test data...');

const supabase = getSupabaseAdmin();

if (createdCaseIds.length > 0) {
  await supabase.from('cases').delete().in('id', createdCaseIds);
}
if (createdCanonicalIds.length > 0) {
  await supabase.from('canonical_events').delete().in('id', createdCanonicalIds);
}
if (createdWebhookIds.length > 0) {
  await supabase.from('webhook_events').delete().in('id', createdWebhookIds);
}
if (createdEventLogIds.length > 0) {
  await supabase.from('workflow_event_log').delete().in('id', createdEventLogIds);
}

console.log(
  `  Cleaned up: ${createdCaseIds.length} cases, ` +
  `${createdCanonicalIds.length} canonical events, ` +
  `${createdWebhookIds.length} webhooks, ` +
  `${createdEventLogIds.length} event log rows`,
);

// â”€â”€ Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

console.log(`\n${'â”€'.repeat(60)}`);
if (errors.length > 0) {
  console.error('\nFailures:');
  errors.forEach((e) => console.error(e));
}
console.log(`\nIntegration suite: ${passed} passed, ${failed} failed`);

if (failed > 0) process.exit(1);


