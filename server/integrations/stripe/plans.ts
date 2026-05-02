/**
 * server/integrations/stripe/plans.ts
 *
 * Single source of truth for the relationship between:
 *   - product family (starter / growth / scale)
 *   - billing interval (month / year)
 *   - top-up pack (5k / 20k / 50k)
 *   - flexible (metered) usage
 *   - the corresponding Stripe Price ID env var
 *   - the canonical AI credit allotment associated with each
 *
 * Centralising this here keeps `routes/billing.ts` and `webhooks/stripe.ts`
 * consistent: a single change here propagates to checkout creation, plan
 * resolution from inbound webhooks, and credit-grant bookkeeping.
 */

export type PlanCode = 'starter' | 'growth' | 'scale' | 'business' | 'free';
export type PlanInterval = 'month' | 'year';
export type TopupPack = '5k' | '20k' | '50k';

/**
 * Credits granted per subscription period for each plan.
 * These values reflect Option A (Conservative) — see docs/PRICING_ANALYSIS.md.
 *   Starter →  5,000  (€42/mo annual)
 *   Growth  → 20,000  (€109/mo annual)
 *   Scale   → 60,000  (€254/mo annual)
 */
export const PLAN_CREDITS: Record<Exclude<PlanCode, 'business' | 'free'>, number> = {
  starter: 5_000,
  growth: 20_000,
  scale: 60_000,
};

/** Top-up packs: pack code → credits. */
export const TOPUP_CREDITS: Record<TopupPack, number> = {
  '5k': 5_000,
  '20k': 20_000,
  '50k': 50_000,
};

/**
 * Resolve the env-var-backed Price ID for a (plan, interval) tuple.
 * Returns `null` if not configured.
 */
export function getPlanPriceId(plan: PlanCode, interval: PlanInterval): string | null {
  const matrix: Record<string, string | undefined> = {
    'starter:month': process.env.STRIPE_PRICE_ID_STARTER_MONTHLY,
    'starter:year':  process.env.STRIPE_PRICE_ID_STARTER_ANNUAL,
    'growth:month':  process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY,
    'growth:year':   process.env.STRIPE_PRICE_ID_GROWTH_ANNUAL,
    'scale:month':   process.env.STRIPE_PRICE_ID_SCALE_MONTHLY,
    'scale:year':    process.env.STRIPE_PRICE_ID_SCALE_ANNUAL,
  };
  return matrix[`${plan}:${interval}`] || null;
}

export function getTopupPriceId(pack: TopupPack): string | null {
  switch (pack) {
    case '5k':  return process.env.STRIPE_PRICE_ID_TOPUP_5K  || null;
    case '20k': return process.env.STRIPE_PRICE_ID_TOPUP_20K || null;
    case '50k': return process.env.STRIPE_PRICE_ID_TOPUP_50K || null;
    default:    return null;
  }
}

export function getFlexibleUsagePriceId(): string | null {
  return process.env.STRIPE_PRICE_ID_FLEXIBLE_USAGE || null;
}

/**
 * Reverse lookup — given a Stripe Price ID seen on an inbound webhook,
 * determine which plan it represents.  Falls back to legacy env vars
 * (STRIPE_PRICE_ID_PRO etc.) so historic subscriptions keep resolving.
 */
export function resolvePlanFromPriceId(priceId: string | null | undefined): PlanCode {
  if (!priceId) return 'free';

  const lookup: Record<string, PlanCode> = {};
  const add = (env: string | undefined, plan: PlanCode) => {
    if (env) lookup[env] = plan;
  };

  add(process.env.STRIPE_PRICE_ID_STARTER_MONTHLY, 'starter');
  add(process.env.STRIPE_PRICE_ID_STARTER_ANNUAL,  'starter');
  add(process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY,  'growth');
  add(process.env.STRIPE_PRICE_ID_GROWTH_ANNUAL,   'growth');
  add(process.env.STRIPE_PRICE_ID_SCALE_MONTHLY,   'scale');
  add(process.env.STRIPE_PRICE_ID_SCALE_ANNUAL,    'scale');

  // Legacy / back-compat env vars:
  add(process.env.STRIPE_PRICE_ID_STARTER, 'starter');
  add(process.env.STRIPE_PRICE_STARTER,    'starter');
  add(process.env.STRIPE_PRICE_ID_PRO,     'growth');     // historical "pro" mapped to growth
  add(process.env.STRIPE_PRICE_PRO,        'growth');
  add(process.env.STRIPE_PRICE_ID_ENTERPRISE, 'scale');
  add(process.env.STRIPE_PRICE_ENTERPRISE,    'scale');

  return lookup[priceId] ?? 'starter';
}

/**
 * Credits associated with a plan (0 for non-credit plans).
 */
export function creditsForPlan(plan: PlanCode): number {
  if (plan === 'business' || plan === 'free') return 0;
  return PLAN_CREDITS[plan] ?? 0;
}
