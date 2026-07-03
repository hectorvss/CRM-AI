-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: webhook_subscriptions
-- Outbound webhook endpoints registered from the Centro para desarrolladores
-- screen. Stores the subscription (URL + event list + active flag). The actual
-- delivery of events to these URLs is a separate concern (not built yet).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.webhook_subscriptions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text        NOT NULL,
  workspace_id  text        NOT NULL,
  url           text        NOT NULL,
  events        jsonb       NOT NULL DEFAULT '[]',   -- array of event keys
  active        boolean     NOT NULL DEFAULT true,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_subscriptions_scope_idx
  ON public.webhook_subscriptions (tenant_id, workspace_id, active);
