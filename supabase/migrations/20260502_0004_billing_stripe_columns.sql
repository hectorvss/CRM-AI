-- 20260502_0004_billing_stripe_columns.sql
--
-- Add Stripe-facing columns to billing_subscriptions so the webhook handler
-- and checkout/portal endpoints can persist customer / subscription IDs and
-- the active billing period.
--
-- These columns are added IF NOT EXISTS so the migration is safe to run on
-- environments where they were already partially provisioned.

alter table public.billing_subscriptions
  add column if not exists external_customer_id      text,
  add column if not exists external_subscription_id  text,
  add column if not exists current_period_start      timestamptz,
  add column if not exists current_period_end        timestamptz;

-- Indexes to support the lookups in server/webhooks/stripe.ts and
-- server/routes/billing.ts (resolve org by Stripe customer / subscription).
create index if not exists billing_subscriptions_external_customer_id_idx
  on public.billing_subscriptions (external_customer_id);

create index if not exists billing_subscriptions_external_subscription_id_idx
  on public.billing_subscriptions (external_subscription_id);
