-- 20260503_0003_workspace_id_knowledge_policy.sql
--
-- Adds the missing `workspace_id` column to `knowledge_domains` and
-- `policy_rules`. Both tables were originally scoped only by tenant_id,
-- which means a tenant with multiple workspaces (e.g. "EU operations" and
-- "US operations" of the same company) ends up sharing knowledge taxonomy
-- and policy rules across workspaces — almost certainly not desired.
--
-- Fix: add the column, backfill from the first workspace of each tenant
-- (mirrors the pattern used in 20260503_0002_workflow_runs_workspace_id.sql),
-- enforce NOT NULL once backfilled, and add composite indexes so the
-- (tenant_id, workspace_id) scoped scans stay cheap.

begin;

-- ── knowledge_domains ────────────────────────────────────────────────────────

alter table public.knowledge_domains
  add column if not exists workspace_id text;

-- workspaces.org_id is the foreign key to organizations.id — which is what
-- the application code refers to as `tenant_id`. (See server/db/schema.sql.)
update public.knowledge_domains kd
set    workspace_id = (
  select w.id
    from public.workspaces w
   where w.org_id = kd.tenant_id
   order by w.created_at asc
   limit 1
)
where kd.workspace_id is null;

-- Only enforce NOT NULL when every row was successfully backfilled.
do $$
begin
  if not exists (select 1 from public.knowledge_domains where workspace_id is null) then
    alter table public.knowledge_domains alter column workspace_id set not null;
  end if;
end $$;

create index if not exists idx_knowledge_domains_tenant_workspace
  on public.knowledge_domains (tenant_id, workspace_id);

-- ── policy_rules ─────────────────────────────────────────────────────────────

alter table public.policy_rules
  add column if not exists workspace_id text;

update public.policy_rules pr
set    workspace_id = (
  select w.id
    from public.workspaces w
   where w.org_id = pr.tenant_id
   order by w.created_at asc
   limit 1
)
where pr.workspace_id is null;

do $$
begin
  if not exists (select 1 from public.policy_rules where workspace_id is null) then
    alter table public.policy_rules alter column workspace_id set not null;
  end if;
end $$;

create index if not exists idx_policy_rules_tenant_workspace
  on public.policy_rules (tenant_id, workspace_id);

create index if not exists idx_policy_rules_tenant_workspace_entity_active
  on public.policy_rules (tenant_id, workspace_id, entity_type, is_active, created_at desc);

commit;
