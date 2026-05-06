-- 20260506_0003_macros.sql
--
-- Reply macros / templates. Workspace-scoped, optionally owned by a single
-- user (private) or shared with the whole workspace (created_by_user_id is
-- null for shared, otherwise points to the owner). The composer's "⚡"
-- snippets dropdown reads/writes via this table instead of localStorage.

begin;

create table if not exists public.macros (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            text not null,
  workspace_id         text not null,
  created_by_user_id   text,
  label                text not null,
  body                 text not null,
  shortcut             text,
  shared               boolean not null default false,
  usage_count          integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_macros_workspace
  on public.macros (tenant_id, workspace_id, shared, created_by_user_id, updated_at desc);

commit;
