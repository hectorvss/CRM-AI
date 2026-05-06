-- 20260506_0001_case_stars.sql
--
-- Per-user "star" / favorite for cases. Replaces the localStorage-only
-- prototype implementation. A case can be starred independently by every
-- user (so Alice's stars don't pollute Bob's inbox), with a composite
-- primary key keeping it idempotent.

begin;

create table if not exists public.case_stars (
  case_id      text not null references public.cases(id) on delete cascade,
  user_id      text not null,
  tenant_id    text not null,
  workspace_id text not null,
  starred_at   timestamptz not null default now(),
  primary key  (case_id, user_id)
);

create index if not exists idx_case_stars_user
  on public.case_stars (user_id, tenant_id, workspace_id, starred_at desc);

create index if not exists idx_case_stars_case
  on public.case_stars (case_id);

commit;
