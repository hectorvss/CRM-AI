-- 20260502_0009_ai_credits.sql
--
-- Cluster I: AI credits enforcement.
--
-- Adds the per-subscription columns that track AI credit balances and the
-- ai_usage_events ledger that records every chargeable LLM call. The pricing
-- contract is defined by the landing page:
--
--   Starter   →  5,000 credits / month
--   Growth    → 20,000 credits / month
--   Scale     → 60,000 credits / month
--   Business  → custom (NULL = unlimited / negotiated)
--
-- Top-up packs (5k / 20k / 50k) accumulate into ai_credits_topup_balance.
-- Flexible usage (post-paid €19/1k credits) is opt-in via flexible_usage_enabled
-- and capped optionally by flexible_usage_cap_credits.
--
-- All columns are added IF NOT EXISTS so the migration is idempotent.

-- ── 1. billing_subscriptions: AI credit columns ─────────────────────────────

alter table public.billing_subscriptions
  add column if not exists ai_credits_included         integer not null default 0,
  add column if not exists ai_credits_used_period      integer not null default 0,
  add column if not exists ai_credits_topup_balance    integer not null default 0,
  add column if not exists ai_credits_period_start     timestamptz,
  add column if not exists ai_credits_period_end       timestamptz,
  add column if not exists flexible_usage_enabled      boolean not null default false,
  add column if not exists flexible_usage_cap_credits  integer;

-- ── 2. Backfill ai_credits_included from plan name ───────────────────────────

update public.billing_subscriptions
   set ai_credits_included = case
         when lower(coalesce(plan_id, '')) like 'starter%'  then  5000
         when lower(coalesce(plan_id, '')) like 'growth%'   then 20000
         when lower(coalesce(plan_id, '')) like 'scale%'    then 60000
         when lower(coalesce(plan_id, '')) like 'business%' then 0   -- 0 = custom/negotiated, treat as unlimited via NULL semantics in code
         else 5000
       end
 where ai_credits_included = 0;

-- Initialise the period window for any subscription that doesn't have one yet.
-- We default to the Stripe billing period if available, otherwise to now → +1 month.
update public.billing_subscriptions
   set ai_credits_period_start = coalesce(current_period_start, now()),
       ai_credits_period_end   = coalesce(current_period_end, now() + interval '1 month')
 where ai_credits_period_start is null
    or ai_credits_period_end is null;

-- ── 3. ai_usage_events ledger ────────────────────────────────────────────────

create table if not exists public.ai_usage_events (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          text not null,
  workspace_id       text not null,
  user_id            text,
  event_type         text not null,                  -- 'plan_engine','ai_diagnose','reports_summary','ai_copilot','ai_draft', etc.
  model              text,
  prompt_tokens      integer not null default 0,
  completion_tokens  integer not null default 0,
  credits_charged    integer not null default 0,
  source             text,                            -- 'included' | 'topup' | 'flexible' | 'denied'
  metadata           jsonb,
  occurred_at        timestamptz not null default now()
);

create index if not exists idx_ai_usage_tenant_time
  on public.ai_usage_events (tenant_id, workspace_id, occurred_at desc);

-- Partial index keeps the hot path (last 60 days) lean for usage-dashboard queries.
create index if not exists idx_ai_usage_period
  on public.ai_usage_events (tenant_id, workspace_id, occurred_at)
  where occurred_at > (now() - interval '60 days');

create index if not exists idx_ai_usage_source
  on public.ai_usage_events (tenant_id, workspace_id, source, occurred_at desc);
