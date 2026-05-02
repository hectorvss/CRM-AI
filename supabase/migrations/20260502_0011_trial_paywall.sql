-- 20260502_0011_trial_paywall.sql
--
-- Paywall + 10-day trial architecture.
--
-- New users land in `status = 'pending_subscription'` after onboarding. They
-- cannot use the app until they either:
--   1. Activate the one-time 10-day trial → status='trialing'
--   2. Pay for a plan via Stripe Checkout → status='active'
--   3. Get a demo extended by sales (manual, server-side flag)
--
-- Trial gives 1,000 credits and 10 calendar days. Trial can only be activated
-- once per organization (tracked via trial_used = true after activation).

alter table public.billing_subscriptions
  add column if not exists trial_started_at  timestamptz,
  add column if not exists trial_ends_at     timestamptz,
  add column if not exists trial_used        boolean not null default false,
  add column if not exists demo_extended_at  timestamptz,
  add column if not exists demo_ends_at      timestamptz;

-- Update legal status values for billing_subscriptions.status:
--   pending_subscription → fresh signup, no access
--   trialing             → 10-day trial active
--   trial_expired        → trial ended, no plan
--   active               → paid plan, all good
--   past_due             → payment failed but grace period
--   canceled             → subscription canceled
--   demo                 → sales-extended demo access
--
-- We keep this as a free-form text column to avoid schema migrations for new
-- statuses. The application code in server/services/accessGate.ts is the source
-- of truth on what each status grants.

-- Existing rows: backfill trial as already-used so existing tenants don't get
-- a fresh trial. New onboarding flow will set trial_used=false explicitly.
update public.billing_subscriptions
   set trial_used = true
 where trial_used = false
   and status in ('active', 'trialing', 'past_due', 'canceled');

-- Index for fast access-gate lookups by org_id (the hot path on every request)
create index if not exists idx_billing_subs_org_status
  on public.billing_subscriptions (org_id, status);

-- Index for trial expiry sweeper (cron job that flips trialing → trial_expired)
create index if not exists idx_billing_subs_trial_ends
  on public.billing_subscriptions (trial_ends_at)
  where trial_ends_at is not null and status = 'trialing';
