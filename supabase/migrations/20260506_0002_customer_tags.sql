-- 20260506_0002_customer_tags.sql
--
-- Per-customer tags (separate from case tags). Stored as text[] so the same
-- query patterns used elsewhere (`.contains('tags', […])`) keep working.
-- `notes` already exists in the customers table, so we don't need to add it.

begin;

alter table public.customers
  add column if not exists tags text[] not null default '{}'::text[];

create index if not exists idx_customers_tags
  on public.customers using gin (tags);

commit;
