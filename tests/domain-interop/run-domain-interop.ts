/**
 * tests/domain-interop/run-domain-interop.ts
 *
 * Validates that domainInterop.ts correctly declares capabilities for all domains.
 * Runs fully offline — no server or DB needed.
 *
 * Run: npm run test:domain-interop
 */

import assert from 'node:assert/strict';
import {
  DOMAIN_CAPABILITIES,
  toolRequiresApproval,
  capabilityForTool,
  writableDomains,
  approvalGatedDomains,
  type DomainKey,
} from '../../shared/domainInterop.js';

let passed = 0;
let failed = 0;

function test(label: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${label}`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ ${label}: ${err.message}`);
  }
}

console.log('\n▶ Domain capability declarations');

test('all expected domains are declared', () => {
  const expected: DomainKey[] = [
    'payment', 'order', 'return', 'case', 'customer',
    'knowledge', 'workspace', 'workflow', 'agent', 'connector', 'approval',
  ];
  for (const key of expected) {
    assert.ok(DOMAIN_CAPABILITIES[key], `Missing domain: ${key}`);
  }
});

test('every domain has a non-empty label and apiPath', () => {
  for (const [key, cap] of Object.entries(DOMAIN_CAPABILITIES)) {
    assert.ok(cap.label, `${key}: missing label`);
    assert.ok(cap.apiPath, `${key}: missing apiPath`);
  }
});

test('knowledge declares canWrite=true and requiresApproval=true', () => {
  const k = DOMAIN_CAPABILITIES.knowledge;
  assert.equal(k.canWrite, true);
  assert.equal(k.requiresApproval, true);
  assert.ok(k.approvalRequired.includes('knowledge.publish'), 'knowledge.publish must require approval');
});

test('workspace declares canWrite=true and requiresApproval=true', () => {
  const w = DOMAIN_CAPABILITIES.workspace;
  assert.equal(w.canWrite, true);
  assert.equal(w.requiresApproval, true);
  assert.ok(w.approvalRequired.includes('settings.workspace.update'), 'settings.workspace.update must require approval');
});

test('payment.refund requires approval', () => {
  assert.equal(toolRequiresApproval('payment.refund'), true);
});

test('order.cancel requires approval', () => {
  assert.equal(toolRequiresApproval('order.cancel'), true);
});

test('workflow.publish requires approval', () => {
  assert.equal(toolRequiresApproval('workflow.publish'), true);
});

test('case.add_note does NOT require approval', () => {
  assert.equal(toolRequiresApproval('case.add_note'), false);
});

test('knowledge.create_draft does NOT require approval', () => {
  assert.equal(toolRequiresApproval('knowledge.create_draft'), false);
});

test('capabilityForTool returns correct domain', () => {
  assert.equal(capabilityForTool('payment.refund')?.label, 'Payment');
  assert.equal(capabilityForTool('order.cancel')?.label, 'Order');
  assert.equal(capabilityForTool('knowledge.publish')?.label, 'Knowledge');
  assert.equal(capabilityForTool('workspace.update')?.label, 'Workspace');
});

test('capabilityForTool returns null for unknown domain', () => {
  assert.equal(capabilityForTool('unknown.action'), null);
});

test('writableDomains includes payment, order, knowledge, workspace', () => {
  const writable = writableDomains();
  for (const d of ['payment', 'order', 'knowledge', 'workspace'] as DomainKey[]) {
    assert.ok(writable.includes(d), `${d} should be writable`);
  }
});

test('approvalGatedDomains includes payment, order, knowledge, workspace, workflow', () => {
  const gated = approvalGatedDomains();
  for (const d of ['payment', 'order', 'knowledge', 'workspace', 'workflow'] as DomainKey[]) {
    assert.ok(gated.includes(d), `${d} should be approval-gated`);
  }
});

test('return domain does NOT require approval (low-risk writes)', () => {
  assert.equal(DOMAIN_CAPABILITIES.return.requiresApproval, false);
  assert.equal(toolRequiresApproval('return.update_status'), false);
});

console.log(`\n${'─'.repeat(50)}`);
console.log(`Domain interop: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
