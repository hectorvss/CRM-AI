import assert from 'node:assert/strict';
import { evaluateAuthPolicy } from '../../server/services/authPolicy.js';
import { redactSensitiveValue, privacySettingsFromWorkspace } from '../../server/services/privacyRedaction.js';

function fakeReq(headers: Record<string, string> = {}) {
  return {
    headers,
    socket: { remoteAddress: '127.0.0.1' },
  } as any;
}

function test(label: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${label}`);
  } catch (error) {
    console.error(`✗ ${label}`);
    throw error;
  }
}

test('auth policy blocks MFA when workspace requires 2FA', () => {
  const result = evaluateAuthPolicy({
    workspaceSettings: { security: { require2fa: true } },
    userId: 'user_agent',
    request: fakeReq(),
    auth: { provider: 'supabase', mfaVerified: false },
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'MFA_REQUIRED');
});

test('auth policy allows MFA when verified', () => {
  const result = evaluateAuthPolicy({
    workspaceSettings: { security: { require2fa: true } },
    userId: 'user_agent',
    request: fakeReq({ 'x-auth-mfa-verified': 'true' }),
    auth: { provider: 'supabase' },
  });
  assert.equal(result.allowed, true);
  assert.equal(result.states.mfa, 'enforced');
});

test('auth policy blocks IP outside allowlist', () => {
  const result = evaluateAuthPolicy({
    workspaceSettings: { security: { ipAllowlist: ['10.0.0.0/24'] } },
    userId: 'user_agent',
    request: fakeReq({ 'x-forwarded-for': '192.168.1.10' }),
    auth: { provider: 'supabase' },
  });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'IP_NOT_ALLOWED');
});

test('auth policy marks SSO as needs setup when enabled without provider', () => {
  const result = evaluateAuthPolicy({
    workspaceSettings: { security: { ssoEnabled: true } },
    userId: 'user_agent',
    request: fakeReq(),
    auth: { provider: 'supabase' },
  });
  assert.equal(result.allowed, true);
  assert.equal(result.states.sso, 'needs_setup');
});

test('privacy redaction removes PII and secrets', () => {
  const settings = privacySettingsFromWorkspace({
    privacy: { maskSensitiveLogs: true, redactCreditCards: true, voicePiiRedaction: true },
  });
  const redacted = redactSensitiveValue({
    email: 'customer@example.com',
    phone: '+34 600 111 222',
    card: '4242 4242 4242 4242',
    apiKey: 'sk_live_secret',
    transcript: 'voice: customer said my card is 4242424242424242',
  }, settings);
  assert.equal(redacted.email, '[redacted-email]');
  assert.equal(redacted.phone, '[redacted-phone]');
  assert.equal(redacted.card, '[redacted]');
  assert.equal(redacted.apiKey, '[redacted]');
  assert.match(redacted.transcript, /\[redacted-voice-pii\]/);
});

console.log('Settings/Profile critical policy tests passed.');
