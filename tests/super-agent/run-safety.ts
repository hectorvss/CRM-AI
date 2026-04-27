import assert from 'node:assert/strict';
import { redactSensitiveText, redactStructuredValue } from '../../server/agents/planEngine/safety.js';

function main() {
  const text = [
    'Email support@example.com',
    'Phone +1 555 123 4567',
    'Card 4111 1111 1111 1111',
    'SSN 123-45-6789',
    'JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.bm90LXNvbWUtdGVzdA.c2lnbmF0dXJlLXBhcnQ',
    'API key sk-test-1234567890abcdef',
    'Passport no: X1234567',
  ].join(' | ');

  const redacted = redactSensitiveText(text);
  assert.ok(!redacted.includes('support@example.com'));
  assert.ok(!redacted.includes('4111 1111 1111 1111'));
  assert.ok(redacted.includes('[REDACTED_EMAIL]'));
  assert.ok(redacted.includes('[REDACTED_PHONE]'));
  assert.ok(redacted.includes('[REDACTED_CARD]'));
  assert.ok(redacted.includes('[REDACTED_SSN]'));
  assert.ok(redacted.includes('[REDACTED_JWT]'));
  assert.ok(redacted.includes('[REDACTED_API_KEY]'));

  const structured = redactStructuredValue({
    nested: {
      password: 'super-secret',
      token: 'abc123',
      notes: 'Contact support@example.com about passport X1234567',
    },
    publicValue: 'safe',
  });

  assert.equal(structured.nested.password, '[REDACTED_SECRET]');
  assert.equal(structured.nested.token, '[REDACTED_SECRET]');
  assert.equal(structured.publicValue, 'safe');
  assert.ok(String(structured.nested.notes).includes('[REDACTED_EMAIL]'));
  assert.ok(String(structured.nested.notes).includes('[REDACTED_ID]'));

  console.log('Super Agent safety redaction: passed');
}

main();
