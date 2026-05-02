-- 20260502_0010_stripe_credit_grants.sql
--
-- Audit / ledger table for AI-credit grants flowing in from Stripe.
-- Every plan renewal, top-up purchase, or manual adjustment lands here so we
-- can reconcile `billing_subscriptions.ai_credits_*` balances against the
-- raw events that produced them.
--
-- Idempotency is enforced via the UNIQUE constraints on stripe_session_id
-- and stripe_invoice_id — webhook replays therefore cannot double-credit.

CREATE TABLE IF NOT EXISTS public.credit_grants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           TEXT NOT NULL,
  workspace_id        TEXT NOT NULL,
  subscription_id     TEXT,
  stripe_session_id   TEXT UNIQUE,
  stripe_invoice_id   TEXT UNIQUE,
  credits             INTEGER NOT NULL,
  source              TEXT NOT NULL,                       -- 'plan_renewal','topup','manual','enterprise'
  status              TEXT NOT NULL DEFAULT 'pending',     -- 'pending','active','consumed'
  granted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata            JSONB
);

CREATE INDEX IF NOT EXISTS idx_credit_grants_workspace
  ON public.credit_grants (tenant_id, workspace_id, granted_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_grants_subscription
  ON public.credit_grants (subscription_id)
  WHERE subscription_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- Flexible (metered) usage bookkeeping on billing_subscriptions.
--
-- Cluster I owns the `ai_credits_*` quota fields; this cluster (J) only owns
-- the Stripe-side wiring needed to attach/report a metered subscription
-- item.  All adds are IF NOT EXISTS so the migration is safe to interleave
-- with cluster I's own additions.
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.billing_subscriptions
  ADD COLUMN IF NOT EXISTS flexible_usage_enabled                BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS flexible_usage_cap_credits            INTEGER,
  ADD COLUMN IF NOT EXISTS flexible_usage_subscription_item_id   TEXT,
  ADD COLUMN IF NOT EXISTS flexible_usage_last_reported_at       TIMESTAMPTZ;
