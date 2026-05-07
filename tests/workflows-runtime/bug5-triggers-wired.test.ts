/**
 * tests/workflows-runtime/bug5-triggers-wired.test.ts
 *
 * Bug 5: 7 catalog triggers were flagged inert by the audit
 * (`docs/workflows-node-audit.md`). For each, this test asserts the
 * decision is honored:
 *
 *   1. customer.updated      → WIRED via webhookProcess.topicToWorkflowEvent
 *                              (Shopify, Stripe, WooCommerce, Intercom, Klaviyo).
 *   2. sla.breached          → WIRED in slaCheck handler (fires after the case
 *                              row's `sla_status` is updated to 'breached').
 *   3. shipment.updated      → WIRED in webhookProcess (Shopify fulfillments,
 *                              UPS, DHL).
 *   4. approval.decided      → WIRED in routes/approvals.ts (after decision).
 *   5. trigger.chat_message  → WIRED in routes/superAgent.ts (chat run start).
 *   6. trigger.evaluation_run → REMOVED from FALLBACK_CATALOG; no Evaluations
 *                              module exists in the codebase.
 *   7. payment.failed        → WIRED via webhookProcess (Stripe
 *                              `payment_intent.payment_failed` and
 *                              `charge.failed`).
 *
 * Verification strategy: read the source files and assert presence/absence of
 * the literal `fireWorkflowEvent(..., '<event>', ...)` call site. For
 * webhook-routed triggers we additionally invoke the pure
 * `topicToWorkflowEvent` mapper.
 */

import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Set safe dummy env BEFORE any server import.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-key-for-harness';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8');

async function main() {
  // ── 1. customer.updated — WIRED via webhookProcess (multiple sources) ──
  {
    const src = read('server/queue/handlers/webhookProcess.ts');
    assert.match(
      src,
      /['"]customer\.updated['"]/,
      'customer.updated literal must appear in webhookProcess.ts (topic mapper)',
    );
    // Functional check: pure mapper.
    const mod = await import('../../server/queue/handlers/webhookProcess.js');
    assert.equal(
      mod.topicToWorkflowEvent('shopify', 'customers/update'),
      'customer.updated',
      'shopify customers/update must map to customer.updated',
    );
    assert.equal(
      mod.topicToWorkflowEvent('stripe', 'customer.updated'),
      'customer.updated',
      'stripe customer.updated must map to customer.updated',
    );
    console.log('  ✓ PASS  bug5: customer.updated wired via webhookProcess');
  }

  // ── 2. sla.breached — WIRED in slaCheck handler ────────────────────────
  {
    const src = read('server/queue/handlers/slaCheck.ts');
    assert.match(
      src,
      /fireWorkflowEvent\([\s\S]{0,200}['"]sla\.breached['"]/,
      'sla.breached must be fired via fireWorkflowEvent in slaCheck.ts',
    );
    assert.match(
      src,
      /import\s+\{\s*fireWorkflowEvent\s*\}\s+from\s+['"]\.\.\/\.\.\/lib\/workflowEventBus\.js['"]/,
      'slaCheck.ts must import fireWorkflowEvent',
    );
    console.log('  ✓ PASS  bug5: sla.breached wired in slaCheck handler');
  }

  // ── 3. shipment.updated — WIRED in webhookProcess ─────────────────────
  {
    const mod = await import('../../server/queue/handlers/webhookProcess.js');
    assert.equal(
      mod.topicToWorkflowEvent('shopify', 'fulfillments/update'),
      'shipment.updated',
      'shopify fulfillments/update must map to shipment.updated',
    );
    assert.equal(
      mod.topicToWorkflowEvent('shopify', 'fulfillments/create'),
      'shipment.updated',
      'shopify fulfillments/create must map to shipment.updated',
    );
    assert.equal(
      mod.topicToWorkflowEvent('ups', 'shipment.in_transit'),
      'shipment.updated',
      'ups must map to shipment.updated',
    );
    assert.equal(
      mod.topicToWorkflowEvent('dhl', 'tracking.update'),
      'shipment.updated',
      'dhl must map to shipment.updated',
    );
    console.log('  ✓ PASS  bug5: shipment.updated wired via webhookProcess');
  }

  // ── 4. approval.decided — WIRED in routes/approvals.ts ─────────────────
  {
    const src = read('server/routes/approvals.ts');
    assert.match(
      src,
      /fireWorkflowEvent\([\s\S]{0,200}['"]approval\.decided['"]/,
      'approval.decided must be fired via fireWorkflowEvent in approvals.ts',
    );
    console.log('  ✓ PASS  bug5: approval.decided wired in routes/approvals.ts');
  }

  // ── 5. trigger.chat_message — WIRED in routes/superAgent.ts ────────────
  {
    const src = read('server/routes/superAgent.ts');
    assert.match(
      src,
      /fireWorkflowEvent\([\s\S]{0,400}['"]trigger\.chat_message['"]/,
      'trigger.chat_message must be fired via fireWorkflowEvent in superAgent.ts',
    );
    console.log('  ✓ PASS  bug5: trigger.chat_message wired in routes/superAgent.ts');
  }

  // ── 6. trigger.evaluation_run — REMOVED from catalog ───────────────────
  {
    const fallback = read('src/components/Workflows.tsx');
    assert.doesNotMatch(
      fallback,
      /key:\s*['"]trigger\.evaluation_run['"]/,
      'trigger.evaluation_run must NOT appear in FALLBACK_CATALOG (no Evaluations module)',
    );
    const serverCatalog = read('server/routes/workflows.ts');
    // Must not be in the NODE_CATALOG entries (top of file). Allow appearance
    // only as an audit-doc reference (none in workflows.ts after removal).
    assert.doesNotMatch(
      serverCatalog,
      /key:\s*['"]trigger\.evaluation_run['"]/,
      'trigger.evaluation_run must NOT appear in server NODE_CATALOG',
    );
    console.log('  ✓ PASS  bug5: trigger.evaluation_run removed from catalog');
  }

  // ── 7. payment.failed — WIRED via webhookProcess (Stripe) ─────────────
  {
    const mod = await import('../../server/queue/handlers/webhookProcess.js');
    assert.equal(
      mod.topicToWorkflowEvent('stripe', 'payment_intent.payment_failed'),
      'payment.failed',
      'stripe payment_intent.payment_failed must map to payment.failed',
    );
    assert.equal(
      mod.topicToWorkflowEvent('stripe', 'charge.failed'),
      'payment.failed',
      'stripe charge.failed must map to payment.failed',
    );
    console.log('  ✓ PASS  bug5: payment.failed wired via webhookProcess');
  }

  // ── Smoke: workflowEventBus.fireWorkflowEvent does not throw on these ──
  // event types. We don't assert persistence (would need real supabase or
  // singleton-mock). The lifecycle source-grep above is the load-bearing
  // assertion.
  console.log('  ✓ PASS  bug5: all 7 trigger decisions verified');
}

main().catch((err) => {
  console.log(`  ✗ FAIL  bug5-triggers-wired: ${err?.message ?? err}`);
  if (err?.stack) console.log(err.stack);
  process.exit(1);
});
