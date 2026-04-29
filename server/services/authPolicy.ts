import type { Request } from 'express';

export type AuthPolicyState = 'enforced' | 'configured_only' | 'needs_setup' | 'disabled';

export interface AuthPolicyInput {
  workspaceSettings: any;
  userId?: string;
  roleId?: string;
  request: Request;
  auth?: {
    provider?: 'supabase' | 'local_session' | 'header' | 'system';
    tokenIssuedAt?: string | null;
    tokenExpiresAt?: string | null;
    mfaVerified?: boolean;
    ssoVerified?: boolean;
    sessionExpiresAt?: string | null;
  };
}

export interface AuthPolicyResult {
  allowed: boolean;
  code?: 'SSO_REQUIRED' | 'MFA_REQUIRED' | 'SESSION_EXPIRED' | 'IP_NOT_ALLOWED' | 'AUTH_POLICY_CONFIG_REQUIRED';
  message?: string;
  states: {
    sso: AuthPolicyState;
    mfa: AuthPolicyState;
    session: AuthPolicyState;
    ipAllowlist: AuthPolicyState;
  };
  details: Record<string, unknown>;
}

function parseSettings(settings: any) {
  if (!settings) return {};
  if (typeof settings === 'string') {
    try { return JSON.parse(settings); } catch { return {}; }
  }
  return settings;
}

function parseTimeoutMs(value: string | undefined) {
  const normalized = String(value || '').toLowerCase();
  const amount = Number(normalized.match(/\d+/)?.[0] || 0);
  if (!amount) return null;
  if (normalized.includes('day')) return amount * 24 * 60 * 60 * 1000;
  if (normalized.includes('hour')) return amount * 60 * 60 * 1000;
  if (normalized.includes('minute')) return amount * 60 * 1000;
  return null;
}

function requestIp(req: Request) {
  const forwarded = req.headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return String(value || req.socket.remoteAddress || '').split(',')[0].trim().replace(/^::ffff:/, '');
}

function ipv4ToNumber(value: string) {
  const parts = value.split('.').map(part => Number(part));
  if (parts.length !== 4 || parts.some(part => Number.isNaN(part) || part < 0 || part > 255)) return null;
  return (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0;
}

function matchesIpRule(ip: string, rule: string) {
  const normalizedRule = rule.trim();
  if (!normalizedRule) return true;
  if (!normalizedRule.includes('/')) return ip === normalizedRule;
  const [base, rawPrefix] = normalizedRule.split('/');
  const ipNumber = ipv4ToNumber(ip);
  const baseNumber = ipv4ToNumber(base);
  const prefix = Number(rawPrefix);
  if (ipNumber === null || baseNumber === null || Number.isNaN(prefix) || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipNumber & mask) === (baseNumber & mask);
}

function headerBoolean(req: Request, key: string) {
  const value = req.headers[key.toLowerCase()];
  return String(Array.isArray(value) ? value[0] : value || '').toLowerCase() === 'true';
}

export function decodeJwtTimes(token?: string | null) {
  if (!token) return {};
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString('utf8'));
    return {
      tokenIssuedAt: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
      tokenExpiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
      mfaVerified: payload.aal === 'aal2' || payload.amr?.includes?.('mfa') || payload.app_metadata?.mfa_enabled === true || payload.user_metadata?.mfa_enabled === true,
      ssoVerified: payload.app_metadata?.sso === true || payload.user_metadata?.sso === true || typeof payload.app_metadata?.provider === 'string' && payload.app_metadata.provider !== 'email',
    };
  } catch {
    return {};
  }
}

export function evaluateAuthPolicy(input: AuthPolicyInput): AuthPolicyResult {
  const settings = parseSettings(input.workspaceSettings);
  const security = settings.security || {};
  const states: AuthPolicyResult['states'] = {
    sso: 'disabled',
    mfa: 'disabled',
    session: 'disabled',
    ipAllowlist: 'disabled',
  };

  const isSystem = input.userId === 'system' || input.auth?.provider === 'system';
  const mfaVerified = input.auth?.mfaVerified || headerBoolean(input.request, 'x-auth-mfa-verified');
  const ssoVerified = input.auth?.ssoVerified || headerBoolean(input.request, 'x-auth-sso-verified');
  const configuredSso = Boolean(security.ssoConfigured || security.ssoProvider || process.env.SUPABASE_AUTH_SSO_ENABLED === 'true');

  if (security.ssoEnabled) {
    states.sso = configuredSso ? 'enforced' : 'needs_setup';
    if (!isSystem && configuredSso && !ssoVerified) {
      return {
        allowed: false,
        code: 'SSO_REQUIRED',
        message: 'Workspace requires SSO authentication.',
        states,
        details: { provider: input.auth?.provider || 'unknown' },
      };
    }
  }

  if (security.require2fa) {
    states.mfa = 'enforced';
    if (!isSystem && !mfaVerified) {
      return {
        allowed: false,
        code: 'MFA_REQUIRED',
        message: 'Workspace requires multi-factor authentication.',
        states,
        details: { provider: input.auth?.provider || 'unknown' },
      };
    }
  }

  const timeoutMs = parseTimeoutMs(security.sessionTimeout);
  if (timeoutMs) {
    states.session = 'enforced';
    const issuedAt = input.auth?.tokenIssuedAt || String(input.request.headers['x-session-issued-at'] || '');
    const expiresAt = input.auth?.sessionExpiresAt || input.auth?.tokenExpiresAt || '';
    const now = Date.now();
    if (!isSystem) {
      const issuedTime = issuedAt ? new Date(issuedAt).getTime() : null;
      const expiresTime = expiresAt ? new Date(expiresAt).getTime() : null;
      if ((expiresTime && expiresTime < now) || (issuedTime && now - issuedTime > timeoutMs)) {
        return {
          allowed: false,
          code: 'SESSION_EXPIRED',
          message: 'Workspace session timeout policy requires signing in again.',
          states,
          details: { sessionTimeout: security.sessionTimeout },
        };
      }
    }
  }

  const ipAllowlist = Array.isArray(security.ipAllowlist) ? security.ipAllowlist.filter(Boolean) : [];
  if (ipAllowlist.length > 0) {
    states.ipAllowlist = 'enforced';
    const ip = requestIp(input.request);
    if (!isSystem && ip && !ipAllowlist.some(rule => matchesIpRule(ip, rule))) {
      return {
        allowed: false,
        code: 'IP_NOT_ALLOWED',
        message: 'Request IP is not allowed by workspace policy.',
        states,
        details: { ip },
      };
    }
  }

  return {
    allowed: true,
    states,
    details: {
      provider: input.auth?.provider || 'unknown',
      ssoConfigured: configuredSso,
      mfaVerified,
      ssoVerified,
      ip: requestIp(input.request),
    },
  };
}
