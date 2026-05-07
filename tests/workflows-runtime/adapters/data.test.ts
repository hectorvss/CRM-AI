/**
 * tests/workflows-runtime/adapters/data.test.ts
 *
 * Per-adapter coverage for data.* handlers in
 * server/runtime/adapters/data.ts. Covers all 18 keys.
 *
 * data.ai_transform happy path is NOT exercised here — it requires a real
 * Gemini key and there is no fetchImpl injection point inside the adapter
 * (it constructs `new GoogleGenerativeAI(geminiKey)` directly). Only the
 * "missing key" failure mode is tested.
 *
 * data.http_request uses global `fetch`, not services.fetchImpl. We test
 * the failure modes (missing url, bad url) only — happy path would require
 * stubbing global fetch which we avoid for cross-test safety.
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
  // ── data.set_fields happy ──
  await test('data.set_fields: writes one field to context.data', async () => {
    const ctx: any = { data: { existing: 'x' } };
    const r = await runNode({
      node: { id: 's1', type: 'utility', key: 'data.set_fields', config: { field: 'newKey', value: 'hello' } },
      context: ctx,
    });
    assert.equal(r.status, 'completed');
    assert.equal(r.output.updated.newKey, 'hello');
    assert.equal(ctx.data.newKey, 'hello');
  });

  // ── data.set_fields ⚠️: only one field at a time ──
  await test('data.set_fields: audit ⚠️ — only one field per node, "fields" plural is misleading', async () => {
    const ctx: any = { data: {} };
    const r = await runNode({
      node: { id: 's2', type: 'utility', key: 'data.set_fields', config: { field: 'k1', value: 'v1' } },
      context: ctx,
    });
    assert.equal(Object.keys(r.output.updated).length, 1);
    assert.equal(r.output.updated.k1, 'v1');
  });

  // ── data.rename_fields happy ──
  await test('data.rename_fields: renames keys per mapping', async () => {
    const ctx: any = { data: { old1: 'a', old2: 'b' } };
    const r = await runNode({
      node: { id: 'rn1', type: 'utility', key: 'data.rename_fields', config: { mapping: '{"old1":"new1","old2":"new2"}' } },
      context: ctx,
    });
    assert.equal(r.status, 'completed');
    assert.equal(ctx.data.new1, 'a');
    assert.equal(ctx.data.new2, 'b');
    assert.ok(!('old1' in ctx.data));
  });

  // ── data.extract_json happy: parse JSON string ──
  await test('data.extract_json: parses JSON-string source into object', async () => {
    const ctx: any = { trigger: '{"a":1,"b":2}' };
    const r = await runNode({
      node: { id: 'ej1', type: 'utility', key: 'data.extract_json', config: { source: 'trigger' } },
      context: ctx,
    });
    assert.equal(r.status, 'completed');
    assert.equal(r.output.data.a, 1);
    assert.equal(r.output.data.b, 2);
  });

  // ── data.extract_json edge: invalid JSON wraps as {raw} ──
  await test('data.extract_json: wraps invalid JSON as {raw}', async () => {
    const ctx: any = { trigger: 'not json at all' };
    const r = await runNode({
      node: { id: 'ej2', type: 'utility', key: 'data.extract_json', config: { source: 'trigger' } },
      context: ctx,
    });
    assert.equal(r.status, 'completed');
    assert.equal(r.output.data.raw, 'not json at all');
  });

  // ── data.normalize_text happy ──
  await test('data.normalize_text: lowercases, trims, collapses whitespace', async () => {
    const ctx: any = { trigger: { message: '  Hello   WORLD  ' } };
    const r = await runNode({
      node: { id: 'nt1', type: 'utility', key: 'data.normalize_text', config: { source: 'trigger.message' } },
      context: ctx,
    });
    assert.equal(r.output.data.text, 'hello world');
    // Audit ⚠️: this destructively reassigns context.data
    assert.deepEqual(ctx.data, { text: 'hello world' });
  });

  // ── data.format_date happy ──
  await test('data.format_date: formats date as ISO by default', async () => {
    const ctx: any = { trigger: { date: '2026-01-15T12:00:00.000Z' } };
    const r = await runNode({
      node: { id: 'fd1', type: 'utility', key: 'data.format_date', config: { source: 'trigger.date' } },
      context: ctx,
    });
    assert.equal(r.status, 'completed');
    assert.match(String(r.output.data.date), /^2026-01-15T/);
  });

  // ── data.split_items happy ──
  await test('data.split_items: splits by delimiter', async () => {
    const ctx: any = { trigger: { items: 'a\nb\nc' } };
    const r = await runNode({
      node: { id: 'si1', type: 'utility', key: 'data.split_items', config: { source: 'trigger.items', delimiter: '\n' } },
      context: ctx,
    });
    assert.deepEqual(r.output.data.items, ['a', 'b', 'c']);
    assert.equal(r.output.count, 3);
  });

  // ── data.dedupe happy ──
  await test('data.dedupe: removes duplicates', async () => {
    const ctx: any = { trigger: { items: [1, 2, 1, 3, 2] } };
    const r = await runNode({
      node: { id: 'dd1', type: 'utility', key: 'data.dedupe', config: { source: 'trigger.items' } },
      context: ctx,
    });
    assert.deepEqual(r.output.data.items, [1, 2, 3]);
    assert.equal(r.output.count, 3);
  });

  // ── data.map_fields happy ──
  await test('data.map_fields: maps source paths to target keys', async () => {
    const ctx: any = { customer: { firstName: 'Ada', email: 'a@b.com' } };
    const r = await runNode({
      node: { id: 'mf1', type: 'utility', key: 'data.map_fields', config: { mapping: '{"name":"customer.firstName","mail":"customer.email"}' } },
      context: ctx,
    });
    assert.equal(r.output.data.name, 'Ada');
    assert.equal(r.output.data.mail, 'a@b.com');
  });

  // ── data.pick_fields happy ──
  await test('data.pick_fields: extracts only the listed fields', async () => {
    const ctx: any = { data: { a: 1, b: 2, c: 3 } };
    const r = await runNode({
      node: { id: 'pk1', type: 'utility', key: 'data.pick_fields', config: { fields: ['a', 'c'] } },
      context: ctx,
    });
    assert.equal(r.output.data.a, 1);
    assert.equal(r.output.data.c, 3);
    assert.ok(!('b' in r.output.data));
  });

  // ── data.merge_objects happy ──
  await test('data.merge_objects: shallow-merges left + right', async () => {
    const ctx: any = { data: { a: 1 }, trigger: { b: 2 } };
    const r = await runNode({
      node: { id: 'mo1', type: 'utility', key: 'data.merge_objects', config: { left: 'data', right: 'trigger' } },
      context: ctx,
    });
    assert.equal(r.output.data.a, 1);
    assert.equal(r.output.data.b, 2);
  });

  // ── data.validate_required happy: blocks on missing ──
  await test('data.validate_required: blocks when required fields missing', async () => {
    const ctx: any = { data: { name: 'x' } };
    const r = await runNode({
      node: { id: 'vr1', type: 'utility', key: 'data.validate_required', config: { fields: ['name', 'email'] } },
      context: ctx,
    });
    assert.equal(r.status, 'blocked');
    assert.deepEqual(r.output.missing, ['email']);
    assert.match(String(r.error), /Missing required fields/);
  });

  // ── data.validate_required happy: passes ──
  await test('data.validate_required: passes when all required fields present', async () => {
    const ctx: any = { data: { name: 'x', email: 'x@y.com' } };
    const r = await runNode({
      node: { id: 'vr2', type: 'utility', key: 'data.validate_required', config: { fields: ['name', 'email'] } },
      context: ctx,
    });
    assert.equal(r.status, 'completed');
    assert.equal(r.output.valid, true);
  });

  // ── data.calculate happy: addition ──
  await test('data.calculate: + adds two numeric paths', async () => {
    const ctx: any = { data: { amount: 100, value: 25 } };
    const r = await runNode({
      node: { id: 'cl1', type: 'utility', key: 'data.calculate', config: { left: 'data.amount', right: 'data.value', operation: '+', target: 'total' } },
      context: ctx,
    });
    assert.equal(r.output.result, 125);
    assert.equal(ctx.data.total, 125);
  });

  // ── data.calculate edge: divide by zero → 0 ──
  await test('data.calculate: / by zero returns 0', async () => {
    const ctx: any = { data: { amount: 100, value: 0 } };
    const r = await runNode({
      node: { id: 'cl2', type: 'utility', key: 'data.calculate', config: { left: 'data.amount', right: 'data.value', operation: '/' } },
      context: ctx,
    });
    assert.equal(r.output.result, 0);
  });

  // ── data.aggregate happy: sum ──
  await test('data.aggregate: sums field across array', async () => {
    const ctx: any = { data: { items: [{ price: 10 }, { price: 20 }, { price: 30 }] } };
    const r = await runNode({
      node: { id: 'ag1', type: 'utility', key: 'data.aggregate', config: { source: 'data.items', field: 'price', operation: 'sum' } },
      context: ctx,
    });
    assert.equal(r.output.result, 60);
  });

  // ── data.aggregate edge: count ──
  await test('data.aggregate: count operation returns array length', async () => {
    const ctx: any = { data: { items: [1, 2, 3, 4] } };
    const r = await runNode({
      node: { id: 'ag2', type: 'utility', key: 'data.aggregate', config: { source: 'data.items', operation: 'count' } },
      context: ctx,
    });
    assert.equal(r.output.result, 4);
  });

  // ── data.limit happy: first N ──
  await test('data.limit: keeps first N items by default', async () => {
    const ctx: any = { data: { items: [1, 2, 3, 4, 5] } };
    const r = await runNode({
      node: { id: 'lm1', type: 'utility', key: 'data.limit', config: { source: 'data.items', limit: 2 } },
      context: ctx,
    });
    assert.equal(r.output.count, 2);
    assert.deepEqual(ctx.data.items, [1, 2]);
  });

  // ── data.limit edge: last N mode ──
  await test('data.limit: mode=last returns last N', async () => {
    const ctx: any = { data: { items: [1, 2, 3, 4, 5] } };
    const r = await runNode({
      node: { id: 'lm2', type: 'utility', key: 'data.limit', config: { source: 'data.items', limit: 2, mode: 'last' } },
      context: ctx,
    });
    assert.equal(r.output.count, 2);
    assert.deepEqual(ctx.data.items, [4, 5]);
  });

  // ── data.split_out happy ──
  await test('data.split_out: writes items + currentBatch alias', async () => {
    const ctx: any = { data: { items: [1, 2, 3] } };
    const r = await runNode({
      node: { id: 'so1', type: 'utility', key: 'data.split_out', config: { source: 'data.items' } },
      context: ctx,
    });
    assert.equal(r.output.count, 3);
    assert.deepEqual(ctx.data.currentBatch, [1, 2, 3]);
  });

  // ── data.clean_context happy: keep_only ──
  await test('data.clean_context: keep_only retains only listed fields', async () => {
    const ctx: any = { data: { a: 1, b: 2, c: 3 } };
    const r = await runNode({
      node: { id: 'cc1', type: 'utility', key: 'data.clean_context', config: { fields: ['a', 'c'], mode: 'keep_only' } },
      context: ctx,
    });
    assert.equal(r.status, 'completed');
    assert.equal(ctx.data.a, 1);
    assert.equal(ctx.data.c, 3);
    assert.ok(!('b' in ctx.data));
  });

  // ── data.clean_context happy: remove ──
  await test('data.clean_context: remove deletes listed fields', async () => {
    const ctx: any = { data: { a: 1, b: 2, c: 3 } };
    const r = await runNode({
      node: { id: 'cc2', type: 'utility', key: 'data.clean_context', config: { fields: ['b'], mode: 'remove' } },
      context: ctx,
    });
    assert.ok(!('b' in ctx.data));
    assert.equal(ctx.data.a, 1);
  });

  // ── data.ai_transform failure: missing instruction ──
  await test('data.ai_transform: failed when instruction missing', async () => {
    const r = await runNode({
      node: { id: 'ait1', type: 'utility', key: 'data.ai_transform', config: {} },
      context: {},
    });
    assert.equal(r.status, 'failed');
    assert.match(String(r.error), /instruction is required/);
  });

  // ── data.http_request failure: missing url ──
  await test('data.http_request: failed when url missing', async () => {
    const r = await runNode({
      node: { id: 'http1', type: 'utility', key: 'data.http_request', config: {} },
      context: {},
    });
    assert.equal(r.status, 'failed');
    assert.match(String(r.error), /url is required/);
  });

  // ── data.http_request failure: bad url → fetch fails ──
  await test('data.http_request: bad url surfaces failure', async () => {
    const r = await runNode({
      node: { id: 'http2', type: 'utility', key: 'data.http_request', config: { url: 'http://localhost:1/will-not-respond', method: 'GET' } },
      context: {},
    });
    // Either failed or completed=false. Adapter sets `failed` on fetch errors.
    assert.equal(r.status, 'failed');
  });

  console.log(`\n  data.test.ts → ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.log(`  ✗ FATAL  data.test.ts: ${err?.message ?? err}`);
  if (err?.stack) console.log(err.stack);
  process.exit(1);
});
