-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260502_0004_plan_engine_robustness
-- Purpose  : Plan Engine robustness — manual intervention queue + message
--            delivery state.
--
-- 1. Creates `manual_intervention_required` to capture compensate failures
--    and non-reversible rollbacks (Stripe refunds, Shopify post-fulfilment
--    cancellations) so an operator can resolve them by hand.
--
-- 2. Adds delivery_status / delivery_error to `messages` so outbound rows
--    correctly reflect pending → sent → failed lifecycle, instead of being
--    optimistically created as "outbound/sent".
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 1. Manual intervention queue ─────────────────────────────────────────────
create table if not exists manual_intervention_required (
  id                text         primary key,
  tenant_id         text         not null,
  workspace_id      text,
  plan_id           text,
  step_id           text,
  case_id           text,
  original_tool     text         not null,
  compensate_tool   text,
  error_message     text         not null,
  context           jsonb        not null default '{}'::jsonb,
  status            text         not null default 'open',  -- open | resolved | dismissed
  resolved_by       text,
  resolved_at       timestamptz,
  resolution_note   text,
  created_at        timestamptz  not null default now(),
  updated_at        timestamptz  not null default now()
);

create index if not exists manual_intervention_tenant_status_idx
  on manual_intervention_required (tenant_id, status, created_at desc);

create index if not exists manual_intervention_plan_idx
  on manual_intervention_required (plan_id);

-- ── 2. Outbound message lifecycle ────────────────────────────────────────────
alter table messages
  add column if not exists delivery_status text not null default 'sent',
  add column if not exists delivery_error  text;

-- Backfill: existing rows are historical, treat them as already delivered.
update messages set delivery_status = coalesce(delivery_status, 'sent')
  where delivery_status is null;

-- New outbound rows should be created with delivery_status='pending' by the
-- application layer; keep the default 'sent' so legacy code paths (inbound
-- messages, channel webhooks) are unaffected.

create index if not exists messages_delivery_status_idx
  on messages (tenant_id, delivery_status, sent_at desc);

commit;
