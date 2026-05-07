/**
 * tests/workflows-runtime/bug1-flow-loop.test.ts
 *
 * Bug 1: `flow.loop` does not actually fan out the body branch per item.
 *
 * Today's behaviour (pre-fix): the executor records an `aggregated` array
 * of synthetic per-iteration snapshots and returns them in
 * `output.items`, but it does NOT execute the downstream `body` nodes
 * once per item. That means a downstream `data.set_fields` that reads
 * `${loop.item.a}` only ever runs once, with the LAST loop binding.
 *
 * This test demonstrates the gap. With the seed array having 5 items
 * each `{ a: N }`, we expect:
 *   - the loop's `output.items` to be length 5
 *   - each iteration's snapshot to carry the per-item `value: N`
 *
 * Today the test will FAIL because the snapshot's `processed`/`value`
 * fields aren't materialised — the body never runs per iteration.
 *
 * This file is intentionally RED in this turn. Turn 2 fixes the executor
 * and turns this test green.
 *
 * Run:
 *   npx tsx tests/workflows-runtime/bug1-flow-loop.test.ts
 */

import 'dotenv/config';
import assert from 'node:assert/strict';
import { runWorkflow } from './harness.js';

async function main() {
  const workflow = {
    nodes: [
      {
        id: 'seed',
        type: 'utility',
        key: 'data.set_fields',
        config: {
          field: 'items',
          value: [{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }, { a: 5 }],
        },
      },
      {
        id: 'loop',
        type: 'utility',
        key: 'flow.loop',
        config: {
          items: 'data.items',
          target: 'loopResults',
        },
      },
      {
        id: 'process',
        type: 'utility',
        key: 'data.set_fields',
        config: {
          field: 'value',
          value: '{{loop.item.a}}',
        },
      },
    ],
    edges: [
      { source: 'seed', target: 'loop' },
      { source: 'loop', target: 'process', sourceHandle: 'body' },
    ],
  };

  const result = await runWorkflow({ workflow });

  // Sanity: seed + loop both ran.
  assert.ok(result.steps.seed, 'seed step missing');
  assert.equal(result.steps.seed.status, 'completed', 'seed should complete');
  assert.ok(result.steps.loop, 'loop step missing');

  // Bug-1 assertions — these should FAIL today.
  assert.ok(
    result.steps.loop.output?.items,
    'flow.loop should expose output.items',
  );
  assert.equal(
    result.steps.loop.output.items.length,
    5,
    `flow.loop should iterate 5 times, got ${result.steps.loop.output?.items?.length}`,
  );

  // Each iteration's snapshot should carry a `value` set by the body.
  // This is the critical fan-out assertion.
  for (let i = 0; i < 5; i += 1) {
    const iter = result.steps.loop.output.items[i];
    assert.ok(
      iter && typeof iter === 'object',
      `iteration ${i} missing or not an object`,
    );
    const observedValue = iter.snapshot?.value ?? iter.value;
    assert.equal(
      String(observedValue),
      String(i + 1),
      `iteration ${i} should have value=${i + 1} from body execution, got ${JSON.stringify(observedValue)}`,
    );
  }

  console.log('  ✓ PASS  bug1-flow-loop: flow.loop fans body out per item');
}

main().catch((err) => {
  console.log(`  ✗ FAIL  bug1-flow-loop: ${err?.message ?? err}`);
  if (err?.stack) console.log(err.stack);
  process.exit(1);
});
