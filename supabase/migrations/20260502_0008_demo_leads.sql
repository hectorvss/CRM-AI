-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260502_0008_demo_leads
-- Purpose  : Capture demo / contact-sales leads submitted from the public
--            landing page (POST /api/public/leads).
--
-- This table is written to by the service-role key only (server-side insert).
-- RLS is enabled with no public policies so anon/authenticated clients cannot
-- read or write directly — all access must go through the API.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create table if not exists demo_leads (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  email        text not null,
  company      text,
  role         text,
  volume       text,
  stack        text,
  note         text,
  source       text not null default 'landing/demo',
  user_agent   text,
  referer      text,
  status       text not null default 'new'
               check (status in ('new', 'contacted', 'qualified', 'won', 'lost', 'spam')),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_demo_leads_created_at  on demo_leads (created_at desc);
create index if not exists idx_demo_leads_email       on demo_leads (lower(email));
create index if not exists idx_demo_leads_status      on demo_leads (status, created_at desc);

alter table demo_leads enable row level security;

-- No public policies: only service-role bypasses RLS for inserts/reads.

commit;
