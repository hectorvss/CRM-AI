/**
 * tests/workflows-runtime/adapters/notifications.test.ts
 *
 * Per-adapter coverage for notification.email / sms / whatsapp handlers
 * in server/runtime/adapters/notifications.ts.
 *
 * Bug-3 contract: when services are injected (test mode) without a
 * transport, the adapter must return `blocked` with a Spanish error
 * message — NEVER `simulated:true`.
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

function deepHas(obj: any, key: string): boolean {
  if (!obj || typeof obj !== 'object') return false;
  if (key in obj) return true;
  for (const v of Object.values(obj)) if (deepHas(v, key)) return true;
  return false;
}

async function main() {
  // ── notification.email happy: spy called with right payload ──
  await test('notification.email: calls injected sender with right payload', async () => {
    const calls: any[] = [];
    const r = await runNode({
      node: { id: 'em1', type: 'action', key: 'notification.email', config: { to: 'a@b.com', subject: 'hi', content: 'hello', ref: 'ref-1' } },
      context: {},
      services: {
        channels: {
          email: async (to, subject, content, ref) => {
            calls.push({ to, subject, content, ref });
            return { messageId: 'mid-1' };
          },
        } as any,
      },
    });
    assert.equal(r.status, 'completed');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].to, 'a@b.com');
    assert.equal(calls[0].subject, 'hi');
    assert.equal(calls[0].content, 'hello');
    assert.equal(calls[0].ref, 'ref-1');
    assert.equal(r.output.messageId, 'mid-1');
  });

  // ── notification.email failure: blocked when transport absent ──
  await test('notification.email: blocked when transport missing (Bug-3)', async () => {
    const r = await runNode({
      node: { id: 'em2', type: 'action', key: 'notification.email', config: { to: 'x@y.com', subject: 's', content: 'c' } },
      context: {},
      services: { channels: {} as any, aiKeys: {} },
    });
    assert.equal(r.status, 'blocked');
    assert.equal((r.error as any).code, 'TRANSPORT_NOT_CONFIGURED');
    assert.match((r.error as any).message, /Configura el transporte de email/);
    assert.ok(!deepHas(r, 'simulated'));
  });

  // ── notification.email template substitution ──
  await test('notification.email: template {{path}} substitution from context', async () => {
    const calls: any[] = [];
    const r = await runNode({
      node: { id: 'em3', type: 'action', key: 'notification.email', config: { to: '{{customer.email}}', subject: 'Case {{case.id}}', content: 'Hi {{customer.name}}' } },
      context: { customer: { email: 'c@x.com', name: 'Ada' }, case: { id: 'C-42' } },
      services: {
        channels: {
          email: async (to, subject, content) => { calls.push({ to, subject, content }); return { messageId: 'm' }; },
        } as any,
      },
    });
    assert.equal(r.status, 'completed');
    assert.equal(calls[0].to, 'c@x.com');
    assert.equal(calls[0].subject, 'Case C-42');
    assert.equal(calls[0].content, 'Hi Ada');
  });

  // ── notification.email failure: missing recipient ──
  await test('notification.email: failed when no "to" and no customer.email', async () => {
    const r = await runNode({
      node: { id: 'em4', type: 'action', key: 'notification.email', config: { subject: 's', content: 'c' } },
      context: {},
      services: {
        channels: { email: async () => ({ messageId: 'm' }) } as any,
      },
    });
    assert.equal(r.status, 'failed');
    assert.match(String(r.error), /no recipient/);
  });

  // ── notification.sms happy ──
  await test('notification.sms: calls injected sender', async () => {
    const calls: any[] = [];
    const r = await runNode({
      node: { id: 'sm1', type: 'action', key: 'notification.sms', config: { to: '+34600000000', content: 'hi' } },
      context: {},
      services: {
        channels: {
          sms: async (to, content) => { calls.push({ to, content }); return { messageId: 's-1' }; },
        } as any,
      },
    });
    assert.equal(r.status, 'completed');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].to, '+34600000000');
  });

  // ── notification.sms failure: missing transport ──
  await test('notification.sms: blocked when transport missing', async () => {
    const r = await runNode({
      node: { id: 'sm2', type: 'action', key: 'notification.sms', config: { to: '+34600', content: 'c' } },
      context: {},
      services: { channels: {} as any },
    });
    assert.equal(r.status, 'blocked');
    assert.match((r.error as any).message, /Configura el transporte de SMS/);
    assert.ok(!deepHas(r, 'simulated'));
  });

  // ── notification.whatsapp happy ──
  await test('notification.whatsapp: calls injected sender', async () => {
    const calls: any[] = [];
    const r = await runNode({
      node: { id: 'wa1', type: 'action', key: 'notification.whatsapp', config: { to: '+34611', content: 'hola' } },
      context: {},
      services: {
        channels: {
          whatsapp: async (to, content) => { calls.push({ to, content }); return { messageId: 'wa-1' }; },
        } as any,
      },
    });
    assert.equal(r.status, 'completed');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].to, '+34611');
  });

  // ── notification.whatsapp failure: missing transport ──
  await test('notification.whatsapp: blocked when transport missing', async () => {
    const r = await runNode({
      node: { id: 'wa2', type: 'action', key: 'notification.whatsapp', config: { to: '+34611', content: 'c' } },
      context: {},
      services: { channels: {} as any },
    });
    assert.equal(r.status, 'blocked');
    assert.match((r.error as any).message, /Configura el transporte de WhatsApp/);
    assert.ok(!deepHas(r, 'simulated'));
  });

  console.log(`\n  notifications.test.ts → ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.log(`  ✗ FATAL  notifications.test.ts: ${err?.message ?? err}`);
  if (err?.stack) console.log(err.stack);
  process.exit(1);
});
