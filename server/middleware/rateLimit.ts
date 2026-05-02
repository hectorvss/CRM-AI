/**
 * server/middleware/rateLimit.ts
 *
 * Centralized rate-limiter definitions used across high-cost / abuse-prone
 * endpoints. Uses `express-rate-limit` with in-memory storage (sufficient for
 * a single-instance deployment; a Redis store should be wired in if running
 * behind multiple replicas).
 *
 * Keys:
 *  - Per-user keys are derived from `req.userId` (set by extractMultiTenant).
 *    If unavailable, falls back to the source IP.
 *  - IP-only limiters use the express-rate-limit default key.
 */

import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { sendError } from '../http/errors.js';

function userOrIpKey(req: Request): string {
  const userId = (req as any).userId as string | undefined;
  if (userId && userId !== 'system') return `u:${userId}`;
  // ipKeyGenerator-equivalent fallback; trust proxy must be set if behind LB.
  return `ip:${req.ip || 'unknown'}`;
}

const baseOptions: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, res) => {
    return sendError(
      res,
      429,
      'RATE_LIMITED',
      'Too many requests. Please slow down and retry shortly.',
    );
  },
};

/** Super-Agent endpoints (plan / command): 30 req/min per user. */
export const superAgentLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: userOrIpKey,
});

/** AI endpoints (diagnose, draft, copilot): 20 req/min per user. */
export const aiLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: userOrIpKey,
});

/** Onboarding setup: 5 req/hour per IP (no auth context). */
export const onboardingLimiter = rateLimit({
  ...baseOptions,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  // intentionally IP-keyed: no userId is established before onboarding completes.
});
