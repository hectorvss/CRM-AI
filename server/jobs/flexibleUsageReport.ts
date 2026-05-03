/**
 * server/jobs/flexibleUsageReport.ts
 *
 * Nightly job that reports metered AI usage to Stripe for every subscription
 * that has flexible (pay-as-you-go) usage enabled.
 *
 * Flow per subscription:
 *   1. SUM(credits_charged) FROM ai_usage_events WHERE source='flexible'
 *      AND occurred_at BETWEEN current_period_start AND current_period_end.
 *   2. stripe.subscriptionItems.createUsageRecord(itemId, {quantity, action:'set'}).
 *   3. Update billing_subscriptions.flexible_usage_last_reported_at.
 *
 * Idempotency: action='set' overwrites any prior usage record for the same
 * timestamp, so re-running the same day is safe.  Additionally, if we have
 * already reported within the last 12h we skip — see SKIP_WINDOW_MS.
 *
 * This job is registered alongside the existing aiCreditsReset job.  Cluster I
 * owns the `ai_usage_events` table; this job degrades gracefully (logs and
 * skips) if that table is missing.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { getStripe, isStripeConfigured } from '../integrations/stripe/client.js';
import { logger } from '../utils/logger.js';

const FLEX_REPORT_INTERVAL_MS = 24 * 60 * 60 * 1_000; // every 24h
const SKIP_WINDOW_MS = 12 * 60 * 60 * 1_000;          // skip if reported < 12h ago

let intervalId: ReturnType<typeof setInterval> | null = null;

export interface FlexibleReportResult {
  subscriptionId: string;
  itemId: string;
  reported: number;
  skipped?: boolean;
  error?: string;
}

export async function runFlexibleUsageReport(): Promise<FlexibleReportResult[]> {
  if (!isStripeConfigured()) {
    logger.debug('flexibleUsageReport: Stripe not configured, skipping');
    return [];
  }

  const supabase = getSupabaseAdmin();
  const stripe = getStripe();
  const results: FlexibleReportResult[] = [];

  const { data: subs, error } = await supabase
    .from('billing_subscriptions')
    .select(
      'id, tenant_id, org_id, external_subscription_id, ' +
      'flexible_usage_enabled, flexible_usage_subscription_item_id, flexible_usage_last_reported_at, ' +
      'ai_credits_period_start, ai_credits_period_end, ' +
      'current_period_start, current_period_end',
    )
    .eq('flexible_usage_enabled', true);

  if (error) {
    logger.warn('flexibleUsageReport: failed to query subscriptions', { error: error.message });
    return [];
  }
  if (!subs || subs.length === 0) {
    logger.debug('flexibleUsageReport: no flexible-usage subscriptions');
    return [];
  }

  for (const subRow of subs as any[]) {
    const sub = subRow as Record<string, any>;
    const itemId = (sub as any).flexible_usage_subscription_item_id as string | null;
    if (!itemId) {
      logger.warn('flexibleUsageReport: subscription has no item id, skipping', { subId: sub.id });
      continue;
    }

    const lastReported = (sub as any).flexible_usage_last_reported_at as string | null;
    if (lastReported && Date.now() - new Date(lastReported).getTime() < SKIP_WINDOW_MS) {
      results.push({ subscriptionId: sub.external_subscription_id ?? sub.id, itemId, reported: 0, skipped: true });
      continue;
    }

    const periodStart = (sub as any).ai_credits_period_start ?? (sub as any).current_period_start;
    const periodEnd = (sub as any).ai_credits_period_end ?? (sub as any).current_period_end;
    if (!periodStart || !periodEnd) {
      logger.warn('flexibleUsageReport: subscription missing period bounds, skipping', { subId: sub.id });
      continue;
    }

    let totalCredits = 0;
    try {
      const { data: usageRows, error: usageErr } = await supabase
        .from('ai_usage_events')
        .select('credits_charged')
        .eq('tenant_id', sub.tenant_id)
        .eq('source', 'flexible')
        .gte('occurred_at', periodStart)
        .lte('occurred_at', periodEnd);
      if (usageErr) throw usageErr;
      totalCredits = (usageRows ?? []).reduce(
        (acc: number, r: any) => acc + Number(r.credits_charged ?? 0),
        0,
      );
    } catch (err) {
      logger.warn('flexibleUsageReport: ai_usage_events query failed (cluster I migration?)', {
        error: (err as Error).message, subId: sub.id,
      });
      results.push({
        subscriptionId: sub.external_subscription_id ?? sub.id,
        itemId,
        reported: 0,
        error: (err as Error).message,
      });
      continue;
    }

    try {
      await (stripe as any).subscriptionItems.createUsageRecord(itemId, {
        quantity: Math.max(0, Math.floor(totalCredits)),
        action: 'set',
        timestamp: Math.floor(Date.now() / 1000),
      });

      await supabase
        .from('billing_subscriptions')
        .update({ flexible_usage_last_reported_at: new Date().toISOString() })
        .eq('id', sub.id);

      logger.info('flexibleUsageReport: reported', {
        orgId: sub.org_id, itemId, credits: totalCredits,
      });
      results.push({
        subscriptionId: sub.external_subscription_id ?? sub.id,
        itemId,
        reported: totalCredits,
      });
    } catch (err) {
      logger.error('flexibleUsageReport: Stripe createUsageRecord failed', err as Error, {
        itemId, orgId: sub.org_id,
      });
      results.push({
        subscriptionId: sub.external_subscription_id ?? sub.id,
        itemId,
        reported: 0,
        error: (err as Error).message,
      });
    }
  }

  return results;
}

export function startFlexibleUsageReporter(): void {
  if (intervalId) return;
  // Fire once shortly after startup, then daily.
  setTimeout(() => {
    runFlexibleUsageReport().catch((err) =>
      logger.warn('flexibleUsageReport: initial run failed', { error: (err as Error).message }),
    );
  }, 30_000);

  intervalId = setInterval(() => {
    runFlexibleUsageReport().catch((err) =>
      logger.warn('flexibleUsageReport: scheduled run failed', { error: (err as Error).message }),
    );
  }, FLEX_REPORT_INTERVAL_MS);
}

export function stopFlexibleUsageReporter(): void {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
}

/**
 * Single-shot variant invoked by the cron-driven scheduler tick (Vercel).
 * Equivalent to one cycle of `runFlexibleUsageReport` — no scheduling state.
 */
export async function flexibleUsageReportRunOnce(): Promise<FlexibleReportResult[]> {
  return runFlexibleUsageReport();
}
