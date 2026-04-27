/**
 * tests/webhook/classify-webhook.test.ts
 *
 * Unit tests for the webhook-to-case classification logic in
 * server/queue/handlers/webhookProcess.ts.
 *
 * The classifier functions are private to that module, so we inline the
 * same logic here to keep the tests self-contained and fast (no DB, no network).
 *
 * Run:  npx tsx tests/webhook/classify-webhook.test.ts
 */

import assert from 'node:assert/strict';

// ── Inline classifier (mirrors webhookProcess.ts) ────────────────────────────

const CASE_AUTO_CREATE_TOPICS = new Set([
  'orders/cancelled',
  'refunds/create',
  'orders/fulfilled',
  'charge.dispute.created',
  'charge.dispute.funds_withdrawn',
  'payment_intent.payment_failed',
  'charge.failed',
  'charge.refunded',
]);

interface CaseClassification {
  caseType: string;
  caseSubType?: string;
  summary: string;
  priority: string;
}

function classifyWebhookForCase(
  source: string,
  topic: string,
  body: Record<string, any>,
): CaseClassification {
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

// ── Tests ─────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(label: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (err: any) {
    failed++;
    console.error(`FAIL [${label}]: ${err.message}`);
  }
}

// ── CASE_AUTO_CREATE_TOPICS coverage ─────────────────────────────────────────

test('orders/cancelled in auto-create set', () => {
  assert.ok(CASE_AUTO_CREATE_TOPICS.has('orders/cancelled'));
});
test('charge.dispute.created in auto-create set', () => {
  assert.ok(CASE_AUTO_CREATE_TOPICS.has('charge.dispute.created'));
});
test('orders/paid NOT in auto-create set', () => {
  assert.ok(!CASE_AUTO_CREATE_TOPICS.has('orders/paid'));
});
test('customers/create NOT in auto-create set', () => {
  assert.ok(!CASE_AUTO_CREATE_TOPICS.has('customers/create'));
});

// ── Shopify classification ────────────────────────────────────────────────────

test('shopify orders/cancelled — order_issue + medium', () => {
  const result = classifyWebhookForCase('shopify', 'orders/cancelled', { name: '#1001', id: 12345 });
  assert.equal(result.caseType, 'order_issue');
  assert.equal(result.caseSubType, 'cancellation');
  assert.equal(result.priority, 'medium');
  assert.ok(result.summary.includes('#1001'));
});

test('shopify orders/cancelled — falls back to id when name missing', () => {
  const result = classifyWebhookForCase('shopify', 'orders/cancelled', { id: 99999 });
  assert.ok(result.summary.includes('99999'));
});

test('shopify refunds/create — refund + medium + includes amount', () => {
  const result = classifyWebhookForCase('shopify', 'refunds/create', {
    order_id: 'ord_abc',
    transactions: [{ amount: '29.99' }],
  });
  assert.equal(result.caseType, 'refund');
  assert.equal(result.caseSubType, 'shopify_refund');
  assert.equal(result.priority, 'medium');
  assert.ok(result.summary.includes('29.99'));
  assert.ok(result.summary.includes('ord_abc'));
});

test('shopify refunds/create — no amount graceful', () => {
  const result = classifyWebhookForCase('shopify', 'refunds/create', { order_id: 'ord_xyz' });
  assert.equal(result.caseType, 'refund');
  assert.ok(!result.summary.includes('undefined'));
});

test('shopify orders/fulfilled — fulfillment + low', () => {
  const result = classifyWebhookForCase('shopify', 'orders/fulfilled', { name: '#2002' });
  assert.equal(result.caseType, 'fulfillment');
  assert.equal(result.caseSubType, 'fulfilled');
  assert.equal(result.priority, 'low');
});

// ── Stripe classification ─────────────────────────────────────────────────────

test('stripe charge.dispute.created — dispute + critical', () => {
  const result = classifyWebhookForCase('stripe', 'charge.dispute.created', {
    data: { object: { charge: 'ch_abc123' } },
  });
  assert.equal(result.caseType, 'dispute');
  assert.equal(result.caseSubType, 'chargeback');
  assert.equal(result.priority, 'critical');
  assert.ok(result.summary.includes('ch_abc123'));
});

test('stripe charge.dispute.funds_withdrawn — same as dispute.created', () => {
  const result = classifyWebhookForCase('stripe', 'charge.dispute.funds_withdrawn', {
    id: 'dp_xyz',
    data: { object: {} },
  });
  assert.equal(result.caseType, 'dispute');
  assert.equal(result.priority, 'critical');
});

test('stripe payment_intent.payment_failed — payment_issue + high', () => {
  const result = classifyWebhookForCase('stripe', 'payment_intent.payment_failed', {
    data: { object: { last_payment_error: { message: 'Card declined' } } },
  });
  assert.equal(result.caseType, 'payment_issue');
  assert.equal(result.caseSubType, 'payment_failed');
  assert.equal(result.priority, 'high');
  assert.ok(result.summary.includes('Card declined'));
});

test('stripe charge.failed — payment_issue + high', () => {
  const result = classifyWebhookForCase('stripe', 'charge.failed', {
    data: { object: {} },
  });
  assert.equal(result.caseType, 'payment_issue');
  assert.equal(result.priority, 'high');
  assert.ok(result.summary.includes('Unknown reason'));
});

test('stripe charge.refunded — refund + low', () => {
  const result = classifyWebhookForCase('stripe', 'charge.refunded', {
    data: { object: { id: 'ch_refund_001' } },
  });
  assert.equal(result.caseType, 'refund');
  assert.equal(result.caseSubType, 'stripe_refund');
  assert.equal(result.priority, 'low');
  assert.ok(result.summary.includes('ch_refund_001'));
});

// ── Unknown source fallback ───────────────────────────────────────────────────

test('unknown source — general fallback', () => {
  const result = classifyWebhookForCase('unknown_src', 'some/event', {});
  assert.equal(result.caseType, 'general');
  assert.equal(result.priority, 'medium');
  assert.ok(result.summary.includes('unknown_src'));
  assert.ok(result.summary.includes('some/event'));
});

test('shopify unknown topic — general fallback', () => {
  const result = classifyWebhookForCase('shopify', 'products/create', {});
  assert.equal(result.caseType, 'general');
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\nWebhook classifier: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
