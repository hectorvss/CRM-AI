-- 20260503_0002_workflow_runs_workspace_id.sql
--
-- Adds the missing `workspace_id` column to `workflow_runs`.
--
-- Background: the RLS policy `workflow_runs_tenant_isolation` (see
-- 20260502_0001_rls_tenant_isolation.sql) references `workspace_id` on
-- `workflow_runs`, but the column was never added to the table (see
-- server/db/schema.sql and docs/sql/phase-0-0-supabase-full-baseline.sql).
-- With the service-role key the RLS policy is bypassed so this never broke
-- production, but any direct query via the anon key (or future tightening
-- that runs queries under app_tenant_id()) would fail with
-- "column workspace_id does not exist".
--
-- Fix: add the column, backfill from the parent workflow_definitions row
-- (joined through workflow_versions), enforce NOT NULL, and add a composite
-- index that the route handlers can scope through.

begin;

-- 1. Add the column (nullable for the duration of the backfill).
alter table public.workflow_runs
  add column if not exists workspace_id text;

-- 2. Backfill from the parent definition. workflow_versions.workflow_id ->
--    workflow_definitions.workspace_id is the source of truth.
update public.workflow_runs r
set    workspace_id = d.workspace_id
from   public.workflow_versions v
join   public.workflow_definitions d on d.id = v.workflow_id
where  r.workflow_version_id = v.id
  and  r.workspace_id is null;

-- 3. Lock the column down once backfilled.
alter table public.workflow_runs
  alter column workspace_id set not null;

-- 4. Composite index so listRecentRuns / metrics scoped scans stay cheap.
create index if not exists idx_workflow_runs_tenant_workspace
  on public.workflow_runs (tenant_id, workspace_id, started_at desc);

commit;
