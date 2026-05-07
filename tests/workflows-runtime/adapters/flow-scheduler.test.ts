/**
 * tests/workflows-runtime/adapters/flow-scheduler.test.ts
 *
 * Per-adapter coverage for the scheduler-coupled flow.* handlers in
 * server/runtime/adapters/flowScheduler.ts:
 *   flow.merge, flow.loop, flow.wait, delay, flow.subworkflow.
 *
 * flow.subworkflow uses registerSchedulerHooks() — production wires those
 * hooks once at startup. For tests we either don't call it (and expect a
 * thrown error) or stub them locally.
 */

import 'dotenv/config';
import assert from 'node:assert/strict';
import { runNode } from '../harness.js';

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ PASS  ${name}`);
    passed += 1;
  } catch (err: any) {
    console.log(`  ✗ FAIL  ${name}: ${err?.message ?? err}`);
    if (err?.stack) console.log(err.stack);
    failed += 1;
  }
}

async function main() {
  // ── flow.wait happy ──
  await test('flow.wait: returns waiting + delayUntil', async () => {
    const r = await runNode({
      node: { id: 'w1', type: 'flow', key: 'flow.wait', config: { duration: '5m' } },
      context: {},
    });
    assert.equal(r.status, 'waiting');
    assert.equal(r.output.delay, '5m');
    assert.ok(r.output.delayUntil, 'delayUntil should be set when duration parses');
  });

  // ── flow.wait failure: malformed duration → manual_resume ──
  await test('flow.wait: malformed duration → manual_resume (no delayUntil)', async () => {
    const r = await runNode({
      node: { id: 'w2', type: 'flow', key: 'flow.wait', config: { duration: 'abc' } },
      context: {},
    });
    assert.equal(r.status, 'waiting');
    assert.equal(r.output.delayUntil, null);
  });

  // ── delay alias of flow.wait ──
  await test('delay: aliases flow.wait', async () => {
    const r = await runNode({
      node: { id: 'd1', type: 'flow', key: 'delay', config: { duration: '2h' } },
      context: {},
    });
    assert.equal(r.status, 'waiting');
    assert.ok(r.output.delayUntil);
  });

  // ── flow.merge happy with __mergeInputs ──
  await test('flow.merge: aggregates upstream branch outputs from __mergeInputs', async () => {
    const r = await runNode({
      node: { id: 'm1', type: 'flow', key: 'flow.merge', config: { mode: 'wait-all' } },
      context: {
        __mergeInputs: { src1: { ok: 1 }, src2: { ok: 2 } },
      },
    });
    assert.equal(r.status, 'completed', `status=${r.status}`);
    assert.equal(r.output.mode, 'wait-all');
    assert.deepEqual(r.output.merged.from_src1, { ok: 1 }, `unexpected output: ${JSON.stringify(r.output)}`);
    assert.deepEqual(r.output.merged.from_src2, { ok: 2 });
    assert.equal(r.output.sources.length, 2);
  });

  // ── flow.merge failure mode: no __mergeInputs → passthrough ──
  await test('flow.merge: no __mergeInputs → passthrough (legacy single-incoming caller)', async () => {
    const r = await runNode({
      node: { id: 'm2', type: 'flow', key: 'flow.merge', config: {} },
      context: {},
    });
    assert.equal(r.status, 'completed');
    assert.deepEqual(r.output.merged, { passthrough: true });
    assert.deepEqual(r.output.sources, []);
  });

  // ── flow.loop happy: iterates via injected bodyRunner ──
  await test('flow.loop: invokes body runner once per item', async () => {
    const calls: any[] = [];
    const r = await runNode({
      node: { id: 'l1', type: 'flow', key: 'flow.loop', config: { items: 'data.list' } },
      context: {
        data: { list: ['a', 'b', 'c'] },
        __bodyRunner: async (binding: any) => {
          calls.push(binding);
          return { status: 'completed', output: { item: binding.item } };
        },
      },
    });
    assert.equal(r.status, 'completed');
    assert.equal(r.output.count, 3);
    assert.equal(r.output.failures, 0);
    assert.equal(calls.length, 3);
    assert.deepEqual(calls.map((c) => c.item), ['a', 'b', 'c']);
  });

  // ── flow.loop failure: items not an array ──
  await test('flow.loop: failed when items does not resolve to array', async () => {
    const r = await runNode({
      // Pass a literal non-array, non-string config.items value via the
      // adapter — bypasses the asArray fallback by setting a truthy non-array.
      node: { id: 'l2', type: 'flow', key: 'flow.loop', config: { items: 42 } },
      context: { data: {} },
    });
    assert.equal(r.status, 'failed');
    assert.match(String(r.error), /no resolvió a un array/);
  });

  // ── flow.loop edge: maxIterations cap truncates ──
  await test('flow.loop: caps at maxIterations and reports truncated', async () => {
    const r = await runNode({
      node: { id: 'l3', type: 'flow', key: 'flow.loop', config: { items: 'data.items', maxIterations: 2 } },
      context: {
        data: { items: [1, 2, 3, 4, 5] },
        __bodyRunner: async () => ({ status: 'completed', output: {} }),
      },
    });
    assert.equal(r.status, 'completed');
    assert.equal(r.output.count, 2);
    assert.equal(r.output.truncated, true);
  });

  // ── flow.loop edge: all body iterations fail → failed ──
  await test('flow.loop: all-iteration failures bubble up as failed', async () => {
    const r = await runNode({
      node: { id: 'l4', type: 'flow', key: 'flow.loop', config: { items: 'data.items' } },
      context: {
        data: { items: [1, 2] },
        __bodyRunner: async () => ({ status: 'failed', output: {}, error: 'boom' }),
      },
    });
    assert.equal(r.status, 'failed');
    assert.match(String(r.error), /todas las 2 iteraciones fallaron/);
  });

  // ── flow.subworkflow failure: hooks not registered → error or failed ──
  // Production registers hooks at module load; in unit tests we either get
  // the registered impl (which would talk to Supabase) or hit `requireHooks`
  // throwing. Both are acceptable for this assertion — we just need the
  // adapter NOT to silently complete with a fake result.
  await test('flow.subworkflow: requires workflow id', async () => {
    const r = await runNode({
      node: { id: 'sub1', type: 'flow', key: 'flow.subworkflow', config: {} },
      context: {},
    }).catch((err: any) => ({ status: 'threw', error: err?.message ?? String(err) } as any));
    // Either failed (no workflow id) or threw before hooks resolve.
    assert.ok(['failed', 'threw'].includes(r.status), `expected failed/threw, got ${r.status}`);
  });

  console.log(`\n  flow-scheduler.test.ts → ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.log(`  ✗ FATAL  flow-scheduler.test.ts: ${err?.message ?? err}`);
  if (err?.stack) console.log(err.stack);
  process.exit(1);
});
