/**
 * tests/chat-agent/run-redaction-smoke.ts
 *
 * Contract test for redactSecretsOnly (T1.3). No LLM, no Supabase.
 * Verifies credentials/secrets are stripped from tool results before they reach
 * the model / trace, while customer PII an authorized operator needs (email,
 * phone) is preserved.
 */
import { redactSecretsOnly } from '../../server/agents/planEngine/safety.js';

const input = {
  customer: { name: 'Ada Lovelace', email: 'ada@example.com', phone: '+34 600 123 456' },
  order: { id: 'ord_1', total: 42.5 },
  connector: {
    api_key: 'sk-live-ABCDEF1234567890',
    access_token: 'xoxb-99999-abcdef',
    note: 'bearer eyJhbGciOi.JIUzI1NiIsInR5.cCI6IkpXVCJ9',
  },
  freeText: 'Contact ada@example.com — token sk-test-ZZZ9999abcdef1234',
};

const out: any = redactSecretsOnly(input);
const checks: Array<[string, boolean]> = [
  ['email preserved', out.customer.email === 'ada@example.com'],
  ['phone preserved', out.customer.phone === '+34 600 123 456'],
  ['name preserved', out.customer.name === 'Ada Lovelace'],
  ['order total preserved', out.order.total === 42.5],
  ['api_key field redacted', out.connector.api_key === '[REDACTED_SECRET]'],
  ['access_token field redacted', out.connector.access_token === '[REDACTED_SECRET]'],
  ['jwt in value redacted', /\[REDACTED_JWT\]/.test(out.connector.note)],
  ['api key in free text redacted', /\[REDACTED_API_KEY\]/.test(out.freeText)],
  ['email in free text preserved', out.freeText.includes('ada@example.com')],
];

let ok = true;
for (const [label, pass] of checks) {
  ok = ok && pass;
  console.log(`${pass ? 'OK  ' : 'FAIL'} ${label}`);
}
console.log(ok ? '\n✅ Redacción de secretos correcta (PII de cliente preservado)' : '\n❌ Fallos en la redacción');
process.exit(ok ? 0 : 1);
