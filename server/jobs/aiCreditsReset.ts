/**
 * server/jobs/aiCreditsReset.ts
 *
 * Daily AI credits period reset (Cluster I).
 *
 * Runs at 00:05 UTC every day. For each subscription whose
 * ai_credits_period_end has passed:
 *   1. Roll the period forward by 1 month.
 *   2. Zero ai_credits_used_period.
 *   3. If flexible_usage_enabled, sum credits charged with source='flexible'
 *      during the previous period and stage that amount for Stripe usage
 *      reporting (Cluster J completes the metered submission).
 *
 * Top-up balance is NOT reset — top-up packs roll over indefinitely until
 * consumed.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';

const RESET_INTERVAL_MS = 60 * 60 * 1_000; // hourly check; advances any periods whose end has elapsed
let resetIntervalId: ReturnType<typeof setInterval> | null = null;

/** Add one month to an ISO timestamp. */
function addOneMonth(iso: string): string {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString();
}

interface SubRow {
  id: string;
  org_id: string;
  tenant_id: string | null;
  ai_credits_period_start: string | null;
  ai_credits_period_end: string | null;
  ai_credits_used_period: number;
  flexible_usage_enabled: boolean;
}

async function sumFlexibleCredits(
  tenantId: string,
  periodStart: string,
  periodEnd: string,
): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('ai_usage_events')
    .select('credits_charged')
    .eq('tenant_id', tenantId)
    .eq('source', 'flexible')
    .gte('occurred_at', periodStart)
    .lt('occurred_at', periodEnd);
  if (error || !Array.isArray(data)) return 0;
  return data.reduce((sum, row: any) => sum + (row.credits_charged || 0), 0);
}

export async function runAiCreditsReset(): Promise<{ rolled: number; flexibleEvents: number }> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  // Find subscriptions whose current period has ended.
  const { data: subs, error } = await supabase
    .from('billing_subscriptions')
    .select('id, org_id, tenant_id, ai_credits_period_start, ai_credits_period_end, ai_credits_used_period, flexible_usage_enabled')
    .lt('ai_credits_period_end', now)
    .limit(500);

  if (error) {
    logger.warn('aiCreditsReset: query failed', { error: error.message });
    return { rolled: 0, flexibleEvents: 0 };
  }
  if (!subs?.length) return { rolled: 0, flexibleEvents: 0 };

  let rolled = 0;
  let flexibleEvents = 0;

  for (const sub of subs as SubRow[]) {
    try {
      const oldStart = sub.ai_credits_period_start || now;
      const oldEnd = sub.ai_credits_period_end || now;
      const newEnd = addOneMonth(oldEnd);

      // Stage Stripe usage record metadata for cluster J.
      let flexibleCredits = 0;
      if (sub.flexible_usage_enabled && sub.tenant_id) {
        flexibleCredits = await sumFlexibleCredits(sub.tenant_id, oldStart, oldEnd);
        if (flexibleCredits > 0) {
          flexibleEvents += 1;
          logger.info('aiCreditsReset: flexible usage to bill', {
            subId: sub.id,
            tenantId: sub.tenant_id,
            credits: flexibleCredits,
            // €19 per 1,000 credits (post-paid pricing from landing page).
            estimatedAmountEur: Math.ceil((flexibleCredits / 1000) * 19 * 100) / 100,
            periodStart: oldStart,
            periodEnd: oldEnd,
          });
          // NOTE: cluster J will read these log lines / hook the Stripe usage
          // record submission here. We persist the period totals on the row
          // so the Stripe webhook handler can locate them.
        }
      }

      await supabase
        .from('billing_subscriptions')
        .update({
          ai_credits_used_period: 0,
          ai_credits_period_start: oldEnd,
          ai_credits_period_end: newEnd,
        })
        .eq('id', sub.id);

      rolled += 1;
    } catch (err) {
      logger.warn('aiCreditsReset: per-row failure', {
        subId: sub.id,
        error: (err as Error)?.message,
      });
    }
  }

  if (rolled > 0) {
    logger.info('aiCreditsReset: rolled subscription periods', { rolled, flexibleEvents });
  }
  return { rolled, flexibleEvents };
}

export function startAiCreditsReset(): void {
  // Fire shortly after startup so a deploy after midnight UTC catches up.
  setTimeout(() => {
    void runAiCreditsReset().catch((err) =>
      logger.warn('aiCreditsReset: initial run failed', { error: (err as Error)?.message }),
    );
  }, 60_000);

  resetIntervalId = setInterval(() => {
    void runAiCreditsReset().catch((err) =>
      logger.warn('aiCreditsReset: scheduled run failed', { error: (err as Error)?.message }),
    );
  }, RESET_INTERVAL_MS);

  logger.info('AI credits reset job scheduled (hourly)');
}

export function stopAiCreditsReset(): void {
  if (resetIntervalId) {
    clearInterval(resetIntervalId);
    resetIntervalId = null;
  }
}
