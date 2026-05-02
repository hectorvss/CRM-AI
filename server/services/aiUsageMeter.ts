/**
 * server/services/aiUsageMeter.ts
 *
 * AI credits enforcement service (Cluster I).
 *
 * Pricing contract (mirrors landing-page/pages.jsx):
 *   Starter   →  5,000 credits / month
 *   Growth    → 20,000 credits / month
 *   Scale     → 60,000 credits / month
 *   Business  → custom (unlimited / negotiated)
 *
 * Top-up packs (5k / 20k / 50k) accumulate into ai_credits_topup_balance.
 * Flexible usage (post-paid €19/1k credits) is opt-in per-tenant and capped
 * optionally by flexible_usage_cap_credits.
 *
 * Charge precedence:
 *   1. Included plan credits   (ai_credits_used_period < ai_credits_included)
 *   2. Top-up balance          (ai_credits_topup_balance > 0)
 *   3. Flexible (post-paid)    (only if flexible_usage_enabled, respects cap)
 *
 * Token → credit conversion is approximate and model-dependent. The defaults
 * below match the pricing assumptions used by the landing page (1,000 tokens ≈
 * 1 credit on flash, 1.5 credits on pro/heavier models).
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface UsageScope {
  tenantId: string;
  workspaceId: string;
  userId?: string;
}

export interface ChargeArgs {
  scope: UsageScope;
  eventType: string;
  model?: string;
  promptTokens: number;
  completionTokens: number;
  metadata?: Record<string, unknown>;
}

export type ChargeSource = 'included' | 'topup' | 'flexible' | 'denied';

export interface ChargeResult {
  charged: number;
  source: ChargeSource;
  /** Best-effort remaining = included_remaining + topup_balance after the charge. */
  remaining: number;
}

export interface UsageSummary {
  plan: string;
  periodStart: string;
  periodEnd: string;
  included: number;
  usedThisPeriod: number;
  topupBalance: number;
  flexibleEnabled: boolean;
  flexibleCap: number | null;
  flexibleUsedThisPeriod: number;
  percentUsed: number;
  /** True for Business / custom plans where included = NULL/0 means unlimited. */
  unlimited: boolean;
}

export class AICreditExhaustedError extends Error {
  code = 'AI_CREDIT_EXHAUSTED';
  scope: UsageScope;
  available: number;
  reason: string;

  constructor(scope: UsageScope, available: number, reason = 'AI credits exhausted.') {
    super(reason);
    this.name = 'AICreditExhaustedError';
    this.scope = scope;
    this.available = available;
    this.reason = reason;
  }
}

// ── Token → credit conversion ────────────────────────────────────────────────

/**
 * Option A (Conservative) — model-tier credit multipliers.
 *
 * Tier mapping (credits consumed per 1,000 tokens):
 *   Fast     × 1  — Gemini Flash, Claude Haiku, GPT-4o-mini, *-instruct
 *   Balanced × 5  — Claude Sonnet, GPT-4o, Gemini Pro/1.5
 *   Heavy    × 10 — Claude Opus, GPT-4-Turbo, GPT-4-32k
 *
 * This lifts the worst-case margin floor from 75 % to 92 %+ while keeping
 * fast-model costs identical for users.  See docs/PRICING_ANALYSIS.md §4-A.
 */
function modelCostPerKTokens(model?: string): number {
  if (!model) return 1; // unknown model → Fast tier (fail-safe)
  const m = model.toLowerCase();

  // Heavy tier  ×10
  if (
    m.includes('opus') ||
    m.includes('gpt-4-turbo') ||
    m.includes('gpt-4-32k') ||
    m.includes('gpt4-turbo')
  ) return 10;

  // Balanced tier  ×5
  if (
    m.includes('sonnet') ||
    m.includes('gpt-4o') ||      // gpt-4o and gpt-4o-* (but NOT gpt-4o-mini — see Fast)
    m.includes('gemini-pro') ||
    m.includes('gemini-1.5') ||
    m.includes('gemini-2.5')
  ) {
    // gpt-4o-mini falls through to Fast tier below; catch it here first:
    if (m.includes('gpt-4o-mini') || m.includes('gpt4o-mini')) return 1;
    return 5;
  }

  // Fast tier  ×1
  if (
    m.includes('flash') ||
    m.includes('haiku') ||
    m.includes('mini') ||
    m.includes('instruct') ||
    m.includes('gemini-2.0')
  ) return 1;

  // Unknown model — default to Balanced to err on the safe side for margin.
  return 5;
}

export function tokensToCredits(model: string | undefined, promptTokens: number, completionTokens: number): number {
  const total = Math.max(0, (promptTokens || 0) + (completionTokens || 0));
  if (total === 0) return 0;
  const perK = modelCostPerKTokens(model);
  return Math.max(1, Math.ceil((total / 1000) * perK));
}

// ── Subscription accessors ───────────────────────────────────────────────────

interface SubscriptionRow {
  id: string;
  org_id: string;
  tenant_id: string | null;
  plan_id: string | null;
  ai_credits_included: number;
  ai_credits_used_period: number;
  ai_credits_topup_balance: number;
  ai_credits_period_start: string | null;
  ai_credits_period_end: string | null;
  flexible_usage_enabled: boolean;
  flexible_usage_cap_credits: number | null;
}

async function loadSubscription(scope: UsageScope): Promise<SubscriptionRow | null> {
  const supabase = getSupabaseAdmin();
  // tenant_id in this codebase is org_id. Try both columns.
  const { data, error } = await supabase
    .from('billing_subscriptions')
    .select('*')
    .or(`org_id.eq.${scope.tenantId},tenant_id.eq.${scope.tenantId}`)
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.warn('aiUsageMeter: failed to load subscription', { tenantId: scope.tenantId, error: error.message });
    return null;
  }
  return (data as SubscriptionRow) ?? null;
}

function planIsUnlimited(sub: SubscriptionRow): boolean {
  const plan = (sub.plan_id || '').toLowerCase();
  return plan.startsWith('business') || plan === 'enterprise';
}

function includedRemaining(sub: SubscriptionRow): number {
  if (planIsUnlimited(sub)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (sub.ai_credits_included || 0) - (sub.ai_credits_used_period || 0));
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Cheap pre-flight check before issuing an LLM call. Use a conservative
 * estimate (e.g. 2 credits) and let chargeCredits() do the real accounting.
 */
export async function assertCanUseAI(
  scope: UsageScope,
  estimatedCredits = 2,
): Promise<{ allowed: boolean; reason?: string; available: number }> {
  const sub = await loadSubscription(scope);
  if (!sub) {
    // Fail-open in dev / non-billed tenants — but log loudly.
    logger.warn('aiUsageMeter.assertCanUseAI: no subscription row, allowing', { tenantId: scope.tenantId });
    return { allowed: true, available: Number.POSITIVE_INFINITY };
  }

  if (planIsUnlimited(sub)) {
    return { allowed: true, available: Number.POSITIVE_INFINITY };
  }

  const remaining = includedRemaining(sub) + (sub.ai_credits_topup_balance || 0);

  if (remaining >= estimatedCredits) {
    return { allowed: true, available: remaining };
  }

  if (sub.flexible_usage_enabled) {
    const cap = sub.flexible_usage_cap_credits ?? null;
    if (cap === null) return { allowed: true, available: remaining };
    const flexibleUsed = await getFlexibleUsedThisPeriod(scope, sub);
    if (flexibleUsed + estimatedCredits <= cap) {
      return { allowed: true, available: remaining + (cap - flexibleUsed) };
    }
    return {
      allowed: false,
      reason: 'Flexible usage cap reached for this period.',
      available: remaining,
    };
  }

  return {
    allowed: false,
    reason: 'AI credits exhausted. Upgrade your plan or add a top-up pack.',
    available: remaining,
  };
}

async function getFlexibleUsedThisPeriod(scope: UsageScope, sub: SubscriptionRow): Promise<number> {
  const supabase = getSupabaseAdmin();
  const periodStart = sub.ai_credits_period_start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('ai_usage_events')
    .select('credits_charged')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .eq('source', 'flexible')
    .gte('occurred_at', periodStart);

  if (error || !Array.isArray(data)) return 0;
  return data.reduce((sum, row: any) => sum + (row.credits_charged || 0), 0);
}

/**
 * Apply credits against the included → topup → flexible waterfall and record
 * the call in ai_usage_events. Throws AICreditExhaustedError when nothing is
 * available and flexible usage is disabled (or capped).
 */
export async function chargeCredits(args: ChargeArgs): Promise<ChargeResult> {
  const credits = tokensToCredits(args.model, args.promptTokens, args.completionTokens);
  const supabase = getSupabaseAdmin();
  const sub = await loadSubscription(args.scope);

  // No subscription row — log usage but don't block.
  if (!sub) {
    await insertUsageEvent(supabase, args, credits, 'included');
    return { charged: credits, source: 'included', remaining: Number.POSITIVE_INFINITY };
  }

  if (planIsUnlimited(sub)) {
    await insertUsageEvent(supabase, args, credits, 'included');
    return { charged: credits, source: 'included', remaining: Number.POSITIVE_INFINITY };
  }

  let remainingToCharge = credits;
  let source: ChargeSource = 'included';

  // 1. Included plan credits
  const includedFree = Math.max(0, (sub.ai_credits_included || 0) - (sub.ai_credits_used_period || 0));
  const fromIncluded = Math.min(includedFree, remainingToCharge);
  let newUsedPeriod = (sub.ai_credits_used_period || 0) + fromIncluded;
  remainingToCharge -= fromIncluded;

  // 2. Topup balance
  let newTopup = sub.ai_credits_topup_balance || 0;
  let fromTopup = 0;
  if (remainingToCharge > 0) {
    fromTopup = Math.min(newTopup, remainingToCharge);
    newTopup -= fromTopup;
    remainingToCharge -= fromTopup;
    if (fromTopup > 0 && fromIncluded === 0) source = 'topup';
  }

  // 3. Flexible (post-paid)
  let fromFlexible = 0;
  if (remainingToCharge > 0) {
    if (!sub.flexible_usage_enabled) {
      // Record a denied event (zero charge) for observability.
      await insertUsageEvent(supabase, args, 0, 'denied');
      throw new AICreditExhaustedError(
        args.scope,
        includedFree + (sub.ai_credits_topup_balance || 0),
        'AI credits exhausted. Upgrade your plan or add a top-up pack.',
      );
    }
    if (sub.flexible_usage_cap_credits !== null && sub.flexible_usage_cap_credits !== undefined) {
      const flexUsed = await getFlexibleUsedThisPeriod(args.scope, sub);
      const cap = sub.flexible_usage_cap_credits;
      if (flexUsed + remainingToCharge > cap) {
        await insertUsageEvent(supabase, args, 0, 'denied');
        throw new AICreditExhaustedError(
          args.scope,
          includedFree + (sub.ai_credits_topup_balance || 0),
          'Flexible usage cap reached for this period.',
        );
      }
    }
    fromFlexible = remainingToCharge;
    remainingToCharge = 0;
    source = fromIncluded === 0 && fromTopup === 0 ? 'flexible' : source;
  }

  // Persist subscription delta and write ledger event(s).
  // Use a single update to keep the read-modify-write window small.
  await supabase
    .from('billing_subscriptions')
    .update({
      ai_credits_used_period: newUsedPeriod,
      ai_credits_topup_balance: newTopup,
    })
    .eq('id', sub.id);

  // Determine the dominant source for the single ledger row. If the charge
  // crossed boundaries, we record one row tagged with the highest tier
  // touched (flexible > topup > included).
  const dominantSource: ChargeSource = fromFlexible > 0 ? 'flexible' : (fromTopup > 0 ? 'topup' : 'included');
  await insertUsageEvent(supabase, args, credits, dominantSource);

  const remaining = (sub.ai_credits_included - newUsedPeriod) + newTopup;
  return { charged: credits, source: dominantSource, remaining: Math.max(0, remaining) };
}

async function insertUsageEvent(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  args: ChargeArgs,
  credits: number,
  source: ChargeSource,
): Promise<void> {
  try {
    await supabase.from('ai_usage_events').insert({
      tenant_id: args.scope.tenantId,
      workspace_id: args.scope.workspaceId,
      user_id: args.scope.userId ?? null,
      event_type: args.eventType,
      model: args.model ?? null,
      prompt_tokens: args.promptTokens || 0,
      completion_tokens: args.completionTokens || 0,
      credits_charged: credits,
      source,
      metadata: args.metadata ?? null,
    });
  } catch (err) {
    logger.warn('aiUsageMeter: failed to insert ai_usage_events row', {
      tenantId: args.scope.tenantId,
      error: (err as Error)?.message,
    });
  }
}

// ── Summary ──────────────────────────────────────────────────────────────────

export async function getUsageSummary(scope: UsageScope): Promise<UsageSummary> {
  const sub = await loadSubscription(scope);
  if (!sub) {
    const now = new Date();
    return {
      plan: 'starter',
      periodStart: now.toISOString(),
      periodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      included: 5000,
      usedThisPeriod: 0,
      topupBalance: 0,
      flexibleEnabled: false,
      flexibleCap: null,
      flexibleUsedThisPeriod: 0,
      percentUsed: 0,
      unlimited: false,
    };
  }

  const flexibleUsed = await getFlexibleUsedThisPeriod(scope, sub);
  const unlimited = planIsUnlimited(sub);
  const included = sub.ai_credits_included || 0;
  const usedThisPeriod = sub.ai_credits_used_period || 0;
  const percentUsed = unlimited
    ? 0
    : included > 0
      ? Math.min(100, Math.round((usedThisPeriod / included) * 100))
      : 0;

  return {
    plan: sub.plan_id || 'starter',
    periodStart: sub.ai_credits_period_start || new Date().toISOString(),
    periodEnd: sub.ai_credits_period_end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    included,
    usedThisPeriod,
    topupBalance: sub.ai_credits_topup_balance || 0,
    flexibleEnabled: !!sub.flexible_usage_enabled,
    flexibleCap: sub.flexible_usage_cap_credits ?? null,
    flexibleUsedThisPeriod: flexibleUsed,
    percentUsed,
    unlimited,
  };
}

// ── Admin helpers (used by Stripe webhook in cluster J) ──────────────────────

export async function addTopupCredits(scope: UsageScope, credits: number, reference?: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const sub = await loadSubscription(scope);
  if (!sub) return;
  await supabase
    .from('billing_subscriptions')
    .update({ ai_credits_topup_balance: (sub.ai_credits_topup_balance || 0) + credits })
    .eq('id', sub.id);
  logger.info('aiUsageMeter: topup applied', {
    tenantId: scope.tenantId,
    credits,
    reference,
    newBalance: (sub.ai_credits_topup_balance || 0) + credits,
  });
}
