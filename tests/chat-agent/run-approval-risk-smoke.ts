/**
 * tests/chat-agent/run-approval-risk-smoke.ts
 *
 * Contract test for the effective-risk approval gate (T1.1). No LLM, no Supabase.
 * Asserts that effectiveToolRisk (max of static ToolSpec risk and the dynamic
 * argument-aware classifier) gates the right calls — in particular that a
 * customer-facing message is ALWAYS gated even though its static risk is medium.
 */
import { effectiveToolRisk } from '../../server/agents/planEngine/safety.js';

const APPROVAL_RISKS = new Set(['high', 'critical']);

// [toolName, args, staticRisk, expectGated, note]
const cases: Array<[string, unknown, string, boolean, string]> = [
  ['message.send_to_customer', { text: 'Su pedido va en camino' }, 'medium', true, 'customer message must gate despite medium static risk'],
  ['payment.refund', { amount: 10 }, 'high', true, 'any refund gates'],
  ['payment.refund', { amount: 999 }, 'medium', true, 'large refund gates even if static were lower'],
  ['order.cancel', { currentStatus: 'shipped' }, 'medium', true, 'cancelling a shipped order gates'],
  ['order.bulk_cancel', { ids: [1, 2, 3] }, 'critical', true, 'bulk op gates'],
  ['approval.decide', { id: 'a', decision: 'approve' }, 'high', true, 'deciding an approval gates'],
  ['settings.update_workspace', { flag: true }, 'high', true, 'settings change gates'],
  ['case.add_note', { note: 'nota interna' }, 'low', false, 'internal note does not gate'],
  ['case.update_status', { status: 'open' }, 'low', false, 'benign status change does not gate'],
  ['customer.get', { id: 'x' }, 'none', false, 'read does not gate'],
  ['knowledge.search', { q: 'foo' }, 'none', false, 'read does not gate'],
  ['return.update_status', { id: 'r', status: 'received' }, 'low', false, 'return status update does not gate'],
];

let ok = true;
for (const [name, args, staticRisk, expectGated, note] of cases) {
  const eff = effectiveToolRisk(name, args, staticRisk as any);
  const gated = APPROVAL_RISKS.has(eff);
  const pass = gated === expectGated;
  ok = ok && pass;
  console.log(`${pass ? 'OK  ' : 'FAIL'} ${name.padEnd(26)} static=${String(staticRisk).padEnd(8)} eff=${eff.padEnd(8)} gated=${String(gated).padEnd(5)} — ${note}`);
}

console.log(ok ? '\n✅ Gate de riesgo efectivo correcto' : '\n❌ Fallos en el gate');
process.exit(ok ? 0 : 1);
