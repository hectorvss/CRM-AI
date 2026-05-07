/**
 * tests/workflows-runtime/bug3-no-silent-simulated.test.ts
 *
 * Bug 3: notification.{email,sms,whatsapp} and ai.generate_text return
 * `status: 'completed'` + `simulated: true` when transport / API key is
 * missing. Silent failure: the workflow looks successful but did nothing.
 *
 * Fix: when the transport / key is absent, return
 *   { status: 'blocked', error: { code: 'TRANSPORT_NOT_CONFIGURED', message: ... } }
 * with NO `simulated: true` field anywhere in the output.
 */

import 'dotenv/config';
import assert from 'node:assert/strict';
import { runNode } from './harness.js';

function deepHas(obj: any, key: string): boolean {
  if (!obj || typeof obj !== 'object') return false;
  if (key in obj) return true;
  for (const v of Object.values(obj)) {
    if (deepHas(v, key)) return true;
  }
  return false;
}

async function main() {
  // Helper: drive a single node with channels/aiKeys explicitly absent.
  async function runMissing(node: any, ctx: any) {
    return await runNode({
      node,
      context: ctx,
      services: {
        // Override channels with an empty object so handler detects absence.
        channels: {} as any,
        aiKeys: {},
      },
    });
  }

  // ── notification.email — missing transport ──
  {
    const result = await runMissing(
      {
        id: 'email1',
        type: 'action',
        key: 'notification.email',
        config: { to: 'test@example.com', subject: 's', content: 'c' },
      },
      {},
    );
    assert.equal(result.status, 'blocked', `email: status should be blocked, got ${result.status}`);
    assert.equal(
      (result.error as any)?.code,
      'TRANSPORT_NOT_CONFIGURED',
      `email: error.code should be TRANSPORT_NOT_CONFIGURED, got ${JSON.stringify(result.error)}`,
    );
    assert.ok(!deepHas(result, 'simulated'), `email: must NOT contain simulated field, got ${JSON.stringify(result)}`);
    console.log('  ✓ PASS  bug3: notification.email blocks when transport missing');
  }

  // ── notification.sms — missing transport ──
  {
    const result = await runMissing(
      {
        id: 'sms1',
        type: 'action',
        key: 'notification.sms',
        config: { to: '+34000000000', content: 'c' },
      },
      {},
    );
    assert.equal(result.status, 'blocked', `sms: status should be blocked, got ${result.status}`);
    assert.equal(
      (result.error as any)?.code,
      'TRANSPORT_NOT_CONFIGURED',
      `sms: error.code should be TRANSPORT_NOT_CONFIGURED, got ${JSON.stringify(result.error)}`,
    );
    assert.ok(!deepHas(result, 'simulated'), `sms: must NOT contain simulated field, got ${JSON.stringify(result)}`);
    console.log('  ✓ PASS  bug3: notification.sms blocks when transport missing');
  }

  // ── notification.whatsapp — missing transport ──
  {
    const result = await runMissing(
      {
        id: 'wa1',
        type: 'action',
        key: 'notification.whatsapp',
        config: { to: '+34000000000', content: 'c' },
      },
      {},
    );
    assert.equal(result.status, 'blocked', `wa: status should be blocked, got ${result.status}`);
    assert.equal(
      (result.error as any)?.code,
      'TRANSPORT_NOT_CONFIGURED',
      `wa: error.code should be TRANSPORT_NOT_CONFIGURED, got ${JSON.stringify(result.error)}`,
    );
    assert.ok(!deepHas(result, 'simulated'), `wa: must NOT contain simulated field, got ${JSON.stringify(result)}`);
    console.log('  ✓ PASS  bug3: notification.whatsapp blocks when transport missing');
  }

  // ── ai.generate_text — missing API key ──
  {
    const result = await runMissing(
      {
        id: 'ai1',
        type: 'agent',
        key: 'ai.generate_text',
        config: { prompt: 'hello' },
      },
      {},
    );
    assert.equal(result.status, 'blocked', `ai: status should be blocked, got ${result.status}`);
    assert.equal(
      (result.error as any)?.code,
      'TRANSPORT_NOT_CONFIGURED',
      `ai: error.code should be TRANSPORT_NOT_CONFIGURED, got ${JSON.stringify(result.error)}`,
    );
    assert.ok(!deepHas(result, 'simulated'), `ai: must NOT contain simulated field, got ${JSON.stringify(result)}`);
    console.log('  ✓ PASS  bug3: ai.generate_text blocks when API key missing');
  }

  // ── notification.email — present transport: spy is called ──
  {
    const calls: any[] = [];
    const result = await runNode({
      node: {
        id: 'email2',
        type: 'action',
        key: 'notification.email',
        config: { to: 'who@x.com', subject: 'subj', content: 'body', ref: 'r-1' },
      },
      context: {},
      services: {
        channels: {
          email: async (to, subject, content, ref) => {
            calls.push({ to, subject, content, ref });
            return { messageId: 'm-1' };
          },
        } as any,
      },
    });
    assert.equal(result.status, 'completed', `email-with-transport: status should be completed, got ${result.status}`);
    assert.equal(calls.length, 1, `email-with-transport: spy should be called once, got ${calls.length}`);
    assert.equal(calls[0].to, 'who@x.com');
    assert.equal(calls[0].subject, 'subj');
    assert.equal(calls[0].content, 'body');
    assert.equal(calls[0].ref, 'r-1');
    console.log('  ✓ PASS  bug3: notification.email calls injected sender with right payload');
  }
}

main().catch((err) => {
  console.log(`  ✗ FAIL  bug3-no-silent-simulated: ${err?.message ?? err}`);
  if (err?.stack) console.log(err.stack);
  process.exit(1);
});
