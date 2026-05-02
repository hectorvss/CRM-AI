/**
 * server/integrations/stripe/client.ts
 *
 * Lazily-initialized Stripe SDK client.
 *
 * Throws a clear error on first use (NOT at import time) when STRIPE_SECRET_KEY
 * is not configured, so the server can boot in environments where billing is
 * intentionally disabled.
 */

import Stripe from 'stripe';

let cached: Stripe | null = null;

/**
 * Get a singleton Stripe SDK client.
 * Throws if STRIPE_SECRET_KEY is not set.
 */
export function getStripe(): Stripe {
  if (cached) return cached;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is not configured. Set it in your environment ' +
      'before invoking any Stripe-backed endpoint (checkout, billing portal, webhooks).'
    );
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
 * Returns true when STRIPE_SECRET_KEY is set; useful for guarding optional code paths.
 */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Returns the configured webhook secret (for raw signature verification).
 * Throws if not configured at first use.
 */
export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      'STRIPE_WEBHOOK_SECRET is not configured. ' +
      'Required for verifying inbound webhook signatures.'
    );
  }
  return secret;
}
