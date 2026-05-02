-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260502_0001_rls_tenant_isolation
-- Purpose  : Enable Row-Level Security on all sensitive tables.
--            Provides defense-in-depth against cross-tenant data leakage even
--            if the application layer forgets to apply tenant filters.
--
-- Notes:
--   • The backend uses the Supabase SERVICE_ROLE key, which bypasses RLS by
--     design. These policies protect direct database access via the ANON key,
--     the Supabase Dashboard, or any misconfigured query.
--   • Policies use `current_setting('app.tenant_id', true)` — the backend can
--     set this per-request via `SET LOCAL app.tenant_id = '...'` before queries
--     to enable strict RLS even for service_role if desired in the future.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ─── Helper: isolation check ─────────────────────────────────────────────────
-- Returns true only when the tenant_id column matches the session-local setting.
-- Falls back to FALSE (deny) if the setting is absent — never grants by default.
create or replace function app_tenant_id() returns text
  language sql stable
  as $$
    select coalesce(current_setting('app.tenant_id', true), '')
  $$;

create or replace function app_workspace_id() returns text
  language sql stable
  as $$
    select coalesce(current_setting('app.workspace_id', true), '')
  $$;

-- ─── cases ───────────────────────────────────────────────────────────────────
alter table cases enable row level security;

drop policy if exists cases_tenant_isolation on cases;
create policy cases_tenant_isolation on cases
  as restrictive
  for all
  using (
    tenant_id = app_tenant_id()
    and (app_workspace_id() = '' or workspace_id = app_workspace_id())
  );

-- ─── customers ───────────────────────────────────────────────────────────────
alter table customers enable row level security;

drop policy if exists customers_tenant_isolation on customers;
create policy customers_tenant_isolation on customers
  as restrictive
  for all
  using (
    tenant_id = app_tenant_id()
    and (app_workspace_id() = '' or workspace_id = app_workspace_id())
  );

-- ─── conversations ────────────────────────────────────────────────────────────
alter table conversations enable row level security;

drop policy if exists conversations_tenant_isolation on conversations;
create policy conversations_tenant_isolation on conversations
  as restrictive
  for all
  using (
    tenant_id = app_tenant_id()
    and (app_workspace_id() = '' or workspace_id = app_workspace_id())
  );

-- ─── messages ────────────────────────────────────────────────────────────────
alter table messages enable row level security;

drop policy if exists messages_tenant_isolation on messages;
create policy messages_tenant_isolation on messages
  as restrictive
  for all
  using (
    tenant_id = app_tenant_id()
    and (app_workspace_id() = '' or workspace_id = app_workspace_id())
  );

-- ─── orders ──────────────────────────────────────────────────────────────────
alter table orders enable row level security;

drop policy if exists orders_tenant_isolation on orders;
create policy orders_tenant_isolation on orders
  as restrictive
  for all
  using (
    tenant_id = app_tenant_id()
    and (app_workspace_id() = '' or workspace_id = app_workspace_id())
  );

-- ─── payments ────────────────────────────────────────────────────────────────
alter table payments enable row level security;

drop policy if exists payments_tenant_isolation on payments;
create policy payments_tenant_isolation on payments
  as restrictive
  for all
  using (
    tenant_id = app_tenant_id()
    and (app_workspace_id() = '' or workspace_id = app_workspace_id())
  );

-- ─── returns ─────────────────────────────────────────────────────────────────
alter table returns enable row level security;

drop policy if exists returns_tenant_isolation on returns;
create policy returns_tenant_isolation on returns
  as restrictive
  for all
  using (
    tenant_id = app_tenant_id()
    and (app_workspace_id() = '' or workspace_id = app_workspace_id())
  );

-- ─── approval_requests ───────────────────────────────────────────────────────
alter table approval_requests enable row level security;

drop policy if exists approval_requests_tenant_isolation on approval_requests;
create policy approval_requests_tenant_isolation on approval_requests
  as restrictive
  for all
  using (
    tenant_id = app_tenant_id()
    and (app_workspace_id() = '' or workspace_id = app_workspace_id())
  );

-- ─── audit_events ────────────────────────────────────────────────────────────
alter table audit_events enable row level security;

drop policy if exists audit_events_tenant_isolation on audit_events;
create policy audit_events_tenant_isolation on audit_events
  as restrictive
  for all
  using (
    tenant_id = app_tenant_id()
    and (app_workspace_id() = '' or workspace_id = app_workspace_id())
  );

-- ─── workflow_definitions ────────────────────────────────────────────────────
alter table workflow_definitions enable row level security;

drop policy if exists workflow_definitions_tenant_isolation on workflow_definitions;
create policy workflow_definitions_tenant_isolation on workflow_definitions
  as restrictive
  for all
  using (
    tenant_id = app_tenant_id()
    and (app_workspace_id() = '' or workspace_id = app_workspace_id())
  );

-- ─── workflow_runs ───────────────────────────────────────────────────────────
alter table workflow_runs enable row level security;

drop policy if exists workflow_runs_tenant_isolation on workflow_runs;
create policy workflow_runs_tenant_isolation on workflow_runs
  as restrictive
  for all
  using (
    tenant_id = app_tenant_id()
    and (app_workspace_id() = '' or workspace_id = app_workspace_id())
  );

-- ─── knowledge_articles ──────────────────────────────────────────────────────
alter table knowledge_articles enable row level security;

drop policy if exists knowledge_articles_tenant_isolation on knowledge_articles;
create policy knowledge_articles_tenant_isolation on knowledge_articles
  as restrictive
  for all
  using (
    tenant_id = app_tenant_id()
    and (app_workspace_id() = '' or workspace_id = app_workspace_id())
  );

-- ─── agents ──────────────────────────────────────────────────────────────────
alter table agents enable row level security;

drop policy if exists agents_tenant_isolation on agents;
create policy agents_tenant_isolation on agents
  as restrictive
  for all
  using (
    tenant_id = app_tenant_id()
    and (app_workspace_id() = '' or workspace_id = app_workspace_id())
  );

-- ─── agent_runs ──────────────────────────────────────────────────────────────
alter table agent_runs enable row level security;

drop policy if exists agent_runs_tenant_isolation on agent_runs;
create policy agent_runs_tenant_isolation on agent_runs
  as restrictive
  for all
  using (
    tenant_id = app_tenant_id()
    and (app_workspace_id() = '' or workspace_id = app_workspace_id())
  );

-- ─── reconciliation_issues ───────────────────────────────────────────────────
alter table reconciliation_issues enable row level security;

drop policy if exists reconciliation_issues_tenant_isolation on reconciliation_issues;
create policy reconciliation_issues_tenant_isolation on reconciliation_issues
  as restrictive
  for all
  using (
    tenant_id = app_tenant_id()
    and (app_workspace_id() = '' or workspace_id = app_workspace_id())
  );

-- ─── jobs ────────────────────────────────────────────────────────────────────
alter table jobs enable row level security;

drop policy if exists jobs_tenant_isolation on jobs;
create policy jobs_tenant_isolation on jobs
  as restrictive
  for all
  using (
    tenant_id = app_tenant_id()
    and (app_workspace_id() = '' or workspace_id = app_workspace_id())
  );

-- ─── user_sessions ───────────────────────────────────────────────────────────
-- Sessions are scoped to tenant+workspace for isolation
alter table user_sessions enable row level security;

drop policy if exists user_sessions_tenant_isolation on user_sessions;
create policy user_sessions_tenant_isolation on user_sessions
  as restrictive
  for all
  using (
    tenant_id = app_tenant_id()
    and (app_workspace_id() = '' or workspace_id = app_workspace_id())
  );

commit;
