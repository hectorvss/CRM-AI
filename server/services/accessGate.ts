/**
 * server/services/accessGate.ts
 *
 * Single source of truth for "can this workspace use the SaaS right now?".
 *
 * State machine (billing_subscriptions.status):
 *
 *   pending_subscription → no access. Must pick: trial, paid plan, or demo.
 *   trialing             → access OK. Trial expires at trial_ends_at.
 *   trial_expired        → no access. Must upgrade or convert.
 *   demo                 → access OK. Sales-extended (demo_ends_at).
 *   active               → access OK.
 *   past_due             → access OK during 7-day grace, then no access.
 *   canceled             → no access.
 *
 * Used by:
 *   - GET /api/billing/access            → frontend gate decision
 *   - middleware/requirePaidAccess.ts    → blocks API endpoints when needed
 *   - jobs/trialExpirySweeper.ts         → flips trialing → trial_expired
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';

export type SubscriptionStatus =
  | 'pending_subscription'
  | 'trialing'
  | 'trial_expired'
  | 'demo'
  | 'active'
  | 'past_due'
  | 'canceled';

export interface AccessSnapshot {
  /** True when the workspace can currently use the app. */
  canUseApp: boolean;
  /** Reason code when canUseApp=false. */
  reason: 'no_subscription' | 'trial_expired' | 'past_due_grace_ended' | 'canceled' | null;
  status: SubscriptionStatus;
  planId: string | null;
  /** Whether the org has ever activated the one-time trial. */
  trialUsed: boolean;
  trialEndsAt: string | null;
  demoEndsAt: string | null;
  /** Days remaining in trial (or 0 if not trialing / already expired). */
  trialDaysLeft: number;
  /** Whether the workspace can request the demo extension button (currently unused but reserved). */
  canRequestDemo: boolean;
  /** Whether the activate-trial button should be shown. */
  canActivateTrial: boolean;
  subscriptionId: string | null;
}

const PAST_DUE_GRACE_DAYS = 7;

export async function getAccessSnapshot(orgId: string): Promise<AccessSnapshot> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('billing_subscriptions')
    .select(
      'id, plan_id, status, trial_used, trial_started_at, trial_ends_at, demo_ends_at, current_period_end',
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.warn('accessGate.getAccessSnapshot: query failed (defaulting to no access)', {
      orgId,
      error: error.message,
    });
    return {
      canUseApp: false,
      reason: 'no_subscription',
      status: 'pending_subscription',
      planId: null,
      trialUsed: false,
      trialEndsAt: null,
      demoEndsAt: null,
      trialDaysLeft: 0,
      canRequestDemo: true,
      canActivateTrial: true,
      subscriptionId: null,
    };
  }

  if (!data) {
    return {
      canUseApp: false,
      reason: 'no_subscription',
      status: 'pending_subscription',
      planId: null,
      trialUsed: false,
      trialEndsAt: null,
      demoEndsAt: null,
      trialDaysLeft: 0,
      canRequestDemo: true,
      canActivateTrial: true,
      subscriptionId: null,
    };
  }

  const status = (data.status || 'pending_subscription') as SubscriptionStatus;
  const now = Date.now();
  const trialEnds = data.trial_ends_at ? new Date(data.trial_ends_at).getTime() : 0;
  const trialDaysLeft =
    trialEnds > now ? Math.max(0, Math.ceil((trialEnds - now) / (24 * 60 * 60 * 1000))) : 0;

  const demoEnds = data.demo_ends_at ? new Date(data.demo_ends_at).getTime() : 0;
  const demoActive = demoEnds > now;

  // Past-due grace: allow up to PAST_DUE_GRACE_DAYS after current_period_end.
  let pastDueGraceActive = false;
  if (status === 'past_due' && data.current_period_end) {
    const periodEnd = new Date(data.current_period_end).getTime();
    pastDueGraceActive = now < periodEnd + PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000;
  }

  let canUseApp = false;
  let reason: AccessSnapshot['reason'] = null;

  switch (status) {
    case 'active':
      canUseApp = true;
      break;
    case 'trialing':
      canUseApp = trialEnds > now;
      if (!canUseApp) reason = 'trial_expired';
      break;
    case 'demo':
      canUseApp = demoActive;
      if (!canUseApp) reason = 'no_subscription';
      break;
    case 'past_due':
      canUseApp = pastDueGraceActive;
      if (!canUseApp) reason = 'past_due_grace_ended';
      break;
    case 'trial_expired':
      reason = 'trial_expired';
      break;
    case 'canceled':
      reason = 'canceled';
      break;
    case 'pending_subscription':
    default:
      reason = 'no_subscription';
      break;
  }

  return {
    canUseApp,
    reason,
    status,
    planId: data.plan_id ?? null,
    trialUsed: Boolean(data.trial_used),
    trialEndsAt: data.trial_ends_at,
    demoEndsAt: data.demo_ends_at,
    trialDaysLeft,
    canRequestDemo: !canUseApp,
    canActivateTrial: !data.trial_used && status === 'pending_subscription',
    subscriptionId: data.id,
  };
}

/**
 * Activate the 10-day trial. Idempotent — fails if trial already used.
 *
 * Self-healing: if no subscription row exists (non-fatal onboarding skip),
 * this function creates one before activating the trial.  It also degrades
 * gracefully when optional columns (trial_*, ai_credits_period_*) are missing
 * — it retries the update without the unsupported columns so the trial can
 * always be activated with at least a status change.
 */
export async function activateTrial(orgId: string, userId: string | null): Promise<AccessSnapshot> {
  const supabase = getSupabaseAdmin();

  // Re-load to enforce one-time semantics.
  let snapshot = await getAccessSnapshot(orgId);
  if (snapshot.trialUsed) {
    throw new Error('Trial has already been activated for this organization.');
  }

  const now = new Date();
  const ends = new Date(now);
  ends.setDate(ends.getDate() + 10);

  // ── Self-heal: create the subscription row if onboarding skipped it ──────
  if (!snapshot.subscriptionId) {
    logger.info('accessGate.activateTrial: no subscription row found, creating one', { orgId });
    const seedPayload: Record<string, any> = {
      id: `sub_trial_${Date.now()}`,
      org_id: orgId,
      tenant_id: orgId,
      plan_id: null,
      status: 'pending_subscription',
      seats_included: 1,
      seats_used: 1,
      trial_used: false,
      current_period_start: now.toISOString(),
      current_period_end: ends.toISOString(),
      created_at: now.toISOString(),
    };

    // Try with ai_credits_* columns; fall back without them.
    const seedWithCredits = {
      ...seedPayload,
      ai_credits_included: 0,
      ai_credits_used_period: 0,
      ai_credits_topup_balance: 0,
    };
    let { error: seedErr } = await supabase.from('billing_subscriptions').insert(seedWithCredits);
    if (seedErr) {
      // Might be missing ai_credits_* columns — retry minimal payload.
      const { error: seedErr2 } = await supabase.from('billing_subscriptions').insert(seedPayload);
      if (seedErr2) {
        throw new Error(`Could not create subscription row: ${seedErr2.message}`);
      }
    }
    // Re-fetch snapshot so subscriptionId is populated.
    snapshot = await getAccessSnapshot(orgId);
    if (!snapshot.subscriptionId) {
      throw new Error('Subscription row could not be created — please contact support.');
    }
  }

  // ── Build full update payload ────────────────────────────────────────────
  const fullPayload: Record<string, any> = {
    status: 'trialing',
    trial_used: true,
    trial_started_at: now.toISOString(),
    trial_ends_at: ends.toISOString(),
    ai_credits_included: 1000,
    ai_credits_period_start: now.toISOString(),
    ai_credits_period_end: ends.toISOString(),
  };

  // Try with all columns; fall back progressively on unknown-column errors.
  const attemptUpdate = async (payload: Record<string, any>): Promise<void> => {
    const { error } = await supabase
      .from('billing_subscriptions')
      .update(payload)
      .eq('id', snapshot.subscriptionId!);
    if (!error) return;

    const msg = error.message ?? '';
    // 42703 = undefined_column; try stripping optional columns and retry once.
    if (msg.includes('ai_credits_period') || msg.includes('ai_credits_included') ||
        msg.includes('trial_started_at') || msg.includes('trial_ends_at')) {
      const fallback: Record<string, any> = { status: 'trialing' };
      if (!msg.includes('trial_used'))       fallback.trial_used       = true;
      if (!msg.includes('trial_started_at')) fallback.trial_started_at = now.toISOString();
      if (!msg.includes('trial_ends_at'))    fallback.trial_ends_at    = ends.toISOString();
      if (!msg.includes('ai_credits_included')) fallback.ai_credits_included = 1000;
      if (!msg.includes('ai_credits_period'))   {
        fallback.ai_credits_period_start = now.toISOString();
        fallback.ai_credits_period_end   = ends.toISOString();
      }
      // Last resort — at minimum flip to trialing.
      const { error: e2 } = await supabase
        .from('billing_subscriptions')
        .update(fallback)
        .eq('id', snapshot.subscriptionId!);
      if (e2) {
        // Absolute last resort: just the status flip.
        const { error: e3 } = await supabase
          .from('billing_subscriptions')
          .update({ status: 'trialing' })
          .eq('id', snapshot.subscriptionId!);
        if (e3) throw new Error(`Failed to activate trial: ${e3.message}`);
      }
      return;
    }
    throw new Error(`Failed to activate trial: ${msg}`);
  };

  await attemptUpdate(fullPayload);

  logger.info('accessGate.activateTrial: trial activated', { orgId, userId, ends: ends.toISOString() });
  return getAccessSnapshot(orgId);
}

/**
 * Sweeper: flip trialing → trial_expired when trial_ends_at < now.
 * Called by jobs/trialExpirySweeper.ts on a cron schedule.
 */
export async function sweepExpiredTrials(): Promise<{ updated: number }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('billing_subscriptions')
    .update({ status: 'trial_expired' })
    .eq('status', 'trialing')
    .lt('trial_ends_at', new Date().toISOString())
    .select('id');

  if (error) {
    logger.warn('accessGate.sweepExpiredTrials failed', { error: error.message });
    return { updated: 0 };
  }
  return { updated: data?.length ?? 0 };
}
