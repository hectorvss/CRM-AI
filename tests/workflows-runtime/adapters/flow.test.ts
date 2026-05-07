/**
 * tests/workflows-runtime/adapters/flow.test.ts
 *
 * Per-adapter coverage for the self-contained flow.* handlers in
 * server/runtime/adapters/flow.ts:
 *   flow.if, flow.compare, flow.branch, flow.switch, flow.filter,
 *   flow.note, flow.noop, flow.stop_error, stop.
 *
 * Each adapter gets at least one happy-path test plus a failure / edge
 * test that exercises a risky path identified in
 * docs/workflows-node-audit.md (⚠️ verdicts for flow.branch and
 * flow.switch in particular).
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
  // ── flow.if happy: true branch ──
  await test('flow.if: completes when condition true', async () => {
    const r = await runNode({
      node: { id: 'if1', type: 'condition', key: 'flow.if', config: { field: 'data.amount', operator: '>', value: 100 } },
      context: { data: { amount: 250 } },
    });
    assert.equal(r.status, 'completed');
    assert.equal(r.output.result, true);
    assert.equal(r.output.left, 250);
    assert.equal(r.output.operator, '>');
    assert.equal(r.output.right, 100);
  });

  // ── flow.if failure: false → skipped ──
  await test('flow.if: skips when condition false', async () => {
    const r = await runNode({
      node: { id: 'if2', type: 'condition', key: 'flow.if', config: { field: 'data.amount', operator: '>', value: 1000 } },
      context: { data: { amount: 50 } },
    });
    assert.equal(r.status, 'skipped');
    assert.equal(r.output.result, false);
  });

  // ── flow.if edge: missing field → undefined left → false ──
  await test('flow.if: missing field yields false silently (audit ⚠️)', async () => {
    const r = await runNode({
      node: { id: 'if3', type: 'condition', key: 'flow.if', config: { field: 'does.not.exist', operator: '==', value: 'x' } },
      context: { data: {} },
    });
    assert.equal(r.status, 'skipped');
    assert.equal(r.output.result, false);
    assert.equal(r.output.left, undefined);
  });

  // ── flow.compare happy ──
  await test('flow.compare: returns boolean result without skipping', async () => {
    const r = await runNode({
      node: { id: 'cmp1', type: 'condition', key: 'flow.compare', config: { left: 'data.a', right: 'data.b', operator: '==' } },
      context: { data: { a: 5, b: 5 } },
    });
    assert.equal(r.status, 'completed');
    assert.equal(r.output.result, true);
  });

  // ── flow.compare edge: always completed even when false (audit minor) ──
  await test('flow.compare: completes (not skipped) on false', async () => {
    const r = await runNode({
      node: { id: 'cmp2', type: 'condition', key: 'flow.compare', config: { left: 'data.a', right: 'data.b', operator: '==' } },
      context: { data: { a: 1, b: 2 } },
    });
    assert.equal(r.status, 'completed', 'flow.compare must always be completed (downstream branches by output.result)');
    assert.equal(r.output.result, false);
  });

  // ── flow.branch happy ──
  await test('flow.branch: emits first branch as route', async () => {
    const r = await runNode({
      node: { id: 'br1', type: 'condition', key: 'flow.branch', config: { branches: 'a|b|c' } },
      context: {},
    });
    assert.equal(r.status, 'completed');
    assert.equal(r.output.result, true);
    assert.equal(r.output.route, 'a');
    assert.deepEqual(r.output.branches, ['a', 'b', 'c']);
  });

  // ── flow.branch ⚠️: audit flagged that "all branches in parallel" is false — only branches[0] picked ──
  await test('flow.branch: audit ⚠️ — only first branch is selected (parallel fan-out NOT implemented)', async () => {
    const r = await runNode({
      node: { id: 'br2', type: 'condition', key: 'flow.branch', config: { branches: 'gold|silver|bronze' } },
      context: {},
    });
    // Verifies the documented limitation — route is always the first branch.
    assert.equal(r.output.route, 'gold');
    assert.notEqual(r.output.route, 'silver');
  });

  // ── flow.switch happy: matches segment ──
  await test('flow.switch: matches segment from context', async () => {
    const r = await runNode({
      node: { id: 'sw1', type: 'condition', key: 'flow.switch', config: { field: 'customer.segment', comparison: 'vip|standard|other' } },
      context: { customer: { segment: 'vip' } },
    });
    assert.equal(r.status, 'completed');
    assert.equal(r.output.route, 'vip');
  });

  // ── flow.switch ⚠️: fallback last branch yields skipped status ──
  await test('flow.switch: audit ⚠️ — falls back to last branch and skips', async () => {
    const r = await runNode({
      node: { id: 'sw2', type: 'condition', key: 'flow.switch', config: { field: 'customer.segment', comparison: 'vip|standard|other' } },
      context: { customer: { segment: 'unknown_value_xyz' } },
    });
    // Per the adapter, when matched route equals fallback (last branch) → skipped.
    assert.equal(r.status, 'skipped');
    assert.equal(r.output.route, 'other');
  });

  // ── flow.filter happy ──
  await test('flow.filter: filters array by field/operator', async () => {
    const r = await runNode({
      node: { id: 'flt1', type: 'condition', key: 'flow.filter', config: { source: 'data.items', field: 'amount', operator: '>', value: 100 } },
      context: { data: { items: [{ amount: 50 }, { amount: 200 }, { amount: 150 }] } },
    });
    assert.equal(r.status, 'completed');
    assert.equal(r.output.filteredCount, 2);
    assert.equal(r.output.items.length, 2);
  });

  // ── flow.filter failure: empty result → skipped ──
  await test('flow.filter: skips when no items match', async () => {
    const r = await runNode({
      node: { id: 'flt2', type: 'condition', key: 'flow.filter', config: { source: 'data.items', field: 'amount', operator: '>', value: 9999 } },
      context: { data: { items: [{ amount: 50 }, { amount: 200 }] } },
    });
    assert.equal(r.status, 'skipped');
    assert.equal(r.output.filteredCount, 0);
  });

  // ── flow.note happy ──
  await test('flow.note: passes through note + color', async () => {
    const r = await runNode({
      node: { id: 'nt1', type: 'note', key: 'flow.note', config: { content: 'remember this', color: 'blue' } },
      context: {},
    });
    assert.equal(r.status, 'completed');
    assert.equal(r.output.note, 'remember this');
    assert.equal(r.output.color, 'blue');
  });

  // ── flow.note default color ──
  await test('flow.note: defaults color to yellow', async () => {
    const r = await runNode({
      node: { id: 'nt2', type: 'note', key: 'flow.note', config: { content: 'x' } },
      context: {},
    });
    assert.equal(r.output.color, 'yellow');
  });

  // ── flow.noop happy ──
  await test('flow.noop: completes with passedThrough flag', async () => {
    const r = await runNode({
      node: { id: 'np1', type: 'flow', key: 'flow.noop', config: {} },
      context: {},
    });
    assert.equal(r.status, 'completed');
    assert.equal(r.output.passedThrough, true);
  });

  // ── flow.noop spurious config ignored ──
  await test('flow.noop: ignores extraneous config', async () => {
    const r = await runNode({
      node: { id: 'np2', type: 'flow', key: 'flow.noop', config: { foo: 'bar', items: [1, 2, 3] } },
      context: { data: { x: 1 } },
    });
    assert.equal(r.status, 'completed');
    assert.equal(r.output.passedThrough, true);
  });

  // ── flow.stop_error happy ──
  await test('flow.stop_error: returns failed with custom message', async () => {
    const r = await runNode({
      node: { id: 'se1', type: 'flow', key: 'flow.stop_error', config: { errorMessage: 'Order is fraudulent' } },
      context: {},
    });
    assert.equal(r.status, 'failed');
    assert.equal(r.error, 'Order is fraudulent');
    assert.equal(r.output.stopped, true);
  });

  // ── flow.stop_error default message ──
  await test('flow.stop_error: defaults to canonical message when none provided', async () => {
    const r = await runNode({
      node: { id: 'se2', type: 'flow', key: 'flow.stop_error', config: {} },
      context: {},
    });
    assert.equal(r.status, 'failed');
    assert.equal(r.error, 'Stopped by flow.stop_error');
  });

  // ── stop happy ──
  await test('stop: returns stopped status', async () => {
    const r = await runNode({
      node: { id: 'st1', type: 'flow', key: 'stop', config: {} },
      context: {},
    });
    assert.equal(r.status, 'stopped');
    assert.equal(r.output.stopped, true);
  });

  // ── stop ignores config ──
  await test('stop: ignores config', async () => {
    const r = await runNode({
      node: { id: 'st2', type: 'flow', key: 'stop', config: { reason: 'whatever' } },
      context: { data: { x: 1 } },
    });
    assert.equal(r.status, 'stopped');
  });

  console.log(`\n  flow.test.ts → ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.log(`  ✗ FATAL  flow.test.ts: ${err?.message ?? err}`);
  if (err?.stack) console.log(err.stack);
  process.exit(1);
});
