/**
 * server/integrations/stripe/client.ts
 *
 * Lazily-initialized Stripe SDK client.
 *
 * Throws a typed `StripeNotConfiguredError` on first use (NOT at import time)
 * when STRIPE_SECRET_KEY (or STRIPE_WEBHOOK_SECRET, when verifying webhooks)
 * is not configured. Routes catch this error and return 503 with a clear
 * machine-readable code so the SaaS boots on environments where billing has
 * not been wired up yet (e.g. preview deployments, fresh self-hosters).
 */

import Stripe from 'stripe';

let cached: Stripe | null = null;

/**
 * Typed error thrown when Stripe credentials are missing.
 * Routes catch this and respond with HTTP 503 STRIPE_NOT_CONFIGURED.
 */
export class StripeNotConfiguredError extends Error {
  readonly code = 'STRIPE_NOT_CONFIGURED';
  readonly missingVar: string;

  constructor(
    missingVar: 'STRIPE_SECRET_KEY' | 'STRIPE_WEBHOOK_SECRET',
    message?: string,
  ) {
    super(
      message ??
      `${missingVar} is not configured. Billing endpoints are disabled until ` +
      'the workspace administrator configures Stripe in the deployment environment.',
    );
    this.name = 'StripeNotConfiguredError';
    this.missingVar = missingVar;
  }
}

/**
 * Type-guard for catch blocks.
 */
export function isStripeNotConfiguredError(err: unknown): err is StripeNotConfiguredError {
  return err instanceof StripeNotConfiguredError ||
         (typeof err === 'object' && err !== null && (err as any).code === 'STRIPE_NOT_CONFIGURED');
}

/**
 * Get a singleton Stripe SDK client.
 * Throws `StripeNotConfiguredError` if STRIPE_SECRET_KEY is not set.
 */
export function getStripe(): Stripe {
  if (cached) return cached;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new StripeNotConfiguredError('STRIPE_SECRET_KEY');
  }

  cached = new Stripe(key, {
    apiVersion: '2024-09-30.acacia' as any,
    typescript: true,
    appInfo: {
      name: 'CRM-AI',
      version: '0.0.0',
    },
  });

  return cached;
}

/**
 * Returns true when STRIPE_SECRET_KEY is set; useful for guarding optional code paths
 * (e.g. the SPA's Paywall hides upgrade buttons when this returns false).
 */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Returns true when both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set.
 */
export function isStripeFullyConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY) && Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

/**
 * Returns the configured webhook secret (for raw signature verification).
 * Throws `StripeNotConfiguredError` if not configured.
 */
export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new StripeNotConfiguredError('STRIPE_WEBHOOK_SECRET');
  }
  return secret;
}

/**
 * Reset the cached Stripe client. Used by tests / hot reload only.
 */
export function __resetStripeClientForTests(): void {
  cached = null;
}
