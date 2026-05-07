/**
 * tests/workflows-runtime/bug4-cross-run-state.test.ts
 *
 * Bug 4: core.idempotency_check + core.rate_limit are per-run only.
 * They lose state across runs. Fix: persist into workflow_runtime_state
 * via services.supabase.
 */

import 'dotenv/config';
import assert from 'node:assert/strict';
import { runNode } from './harness.js';
import { buildMockServices } from './harness.js';

async function main() {
  // Shared mock supabase across calls — simulates cross-run persistence.
  const sharedServices = buildMockServices();

  // ── Idempotency: first call passes, second blocks, different key passes ──
  {
    const node1 = {
      id: 'idem1',
      type: 'policy',
      key: 'core.idempotency_check',
      config: { key: 'order:abc', ttlSeconds: 60 },
    };
    const r1 = await runNode({ node: node1, context: {}, services: { supabase: sharedServices.supabase } });
    assert.equal(r1.status, 'completed', `idem call 1: status should be completed, got ${r1.status}`);
    assert.equal(r1.output?.first_seen, true, `idem call 1: first_seen should be true`);
    console.log('  ✓ PASS  bug4: idempotency first call completed');

    const r2 = await runNode({ node: node1, context: {}, services: { supabase: sharedServices.supabase } });
    assert.equal(r2.status, 'blocked', `idem call 2: status should be blocked, got ${r2.status}`);
    assert.equal(
      (r2.error as any)?.code,
      'IDEMPOTENT_DUPLICATE',
      `idem call 2: error.code should be IDEMPOTENT_DUPLICATE, got ${JSON.stringify(r2.error)}`,
    );
    console.log('  ✓ PASS  bug4: idempotency duplicate blocked');

    const node2 = { ...node1, id: 'idem2', config: { key: 'order:def', ttlSeconds: 60 } };
    const r3 = await runNode({ node: node2, context: {}, services: { supabase: sharedServices.supabase } });
    assert.equal(r3.status, 'completed', `idem call 3: different key should complete, got ${r3.status}`);
    console.log('  ✓ PASS  bug4: idempotency different key passes');
  }

  // ── Rate limit: 2 calls allowed, 3rd blocked, then refill after window ──
  {
    let now = new Date('2026-05-07T12:00:00.000Z');
    const services = buildMockServices({
      clock: {
        now: () => now,
        sleep: async () => {},
      },
    });

    const node = {
      id: 'rl1',
      type: 'policy',
      key: 'core.rate_limit',
      config: { key: 'cust:42', max: 2, window: 60 },
    };

    const r1 = await runNode({ node, context: {}, services });
    assert.equal(r1.status, 'completed', `rl call 1: should complete, got ${r1.status}`);
    assert.equal(r1.output?.tokens_remaining, 1, `rl call 1: tokens_remaining=1, got ${r1.output?.tokens_remaining}`);
    console.log('  ✓ PASS  bug4: rate_limit call 1 completed (1 token left)');

    const r2 = await runNode({ node, context: {}, services });
    assert.equal(r2.status, 'completed', `rl call 2: should complete, got ${r2.status}`);
    assert.equal(r2.output?.tokens_remaining, 0, `rl call 2: tokens_remaining=0, got ${r2.output?.tokens_remaining}`);
    console.log('  ✓ PASS  bug4: rate_limit call 2 completed (0 tokens left)');

    const r3 = await runNode({ node, context: {}, services });
    assert.equal(r3.status, 'blocked', `rl call 3: should be blocked, got ${r3.status}`);
    assert.equal(
      (r3.error as any)?.code,
      'RATE_LIMITED',
      `rl call 3: error.code should be RATE_LIMITED, got ${JSON.stringify(r3.error)}`,
    );
    console.log('  ✓ PASS  bug4: rate_limit call 3 blocked');

    // Advance clock past window.
    now = new Date(now.getTime() + 61_000);
    const r4 = await runNode({ node, context: {}, services });
    assert.equal(r4.status, 'completed', `rl call 4 (after window): should complete, got ${r4.status}`);
    console.log('  ✓ PASS  bug4: rate_limit refilled after window');
  }
}

main().catch((err) => {
  console.log(`  ✗ FAIL  bug4-cross-run-state: ${err?.message ?? err}`);
  if (err?.stack) console.log(err.stack);
  process.exit(1);
});
