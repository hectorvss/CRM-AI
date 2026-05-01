begin;

-- Keep the SaaS model consistent across Supabase by enforcing the
-- relationships that the application already assumes at runtime.

update public.linked_identities li
set tenant_id = coalesce(li.tenant_id, c.tenant_id),
    workspace_id = coalesce(li.workspace_id, c.workspace_id)
from public.customers c
where li.customer_id = c.id
  and (li.tenant_id is null or li.workspace_id is null);

update public.approval_requests ar
set policy_rule_id = null
where policy_rule_id is not null
  and not exists (
    select 1
    from public.policy_rules pr
    where pr.id = ar.policy_rule_id
  );

update public.approval_requests ar
set execution_plan_id = null
where execution_plan_id is not null
  and not exists (
    select 1
    from public.execution_plans ep
    where ep.id = ar.execution_plan_id
  );

alter table public.approval_requests
  add constraint approval_requests_policy_rule_id_fkey
  foreign key (policy_rule_id) references public.policy_rules(id);

alter table public.approval_requests
  add constraint approval_requests_execution_plan_id_fkey
  foreign key (execution_plan_id) references public.execution_plans(id);

alter table public.workflow_definitions
  add constraint workflow_definitions_current_version_id_fkey
  foreign key (current_version_id) references public.workflow_versions(id);

alter table public.agents
  add constraint agents_current_version_id_fkey
  foreign key (current_version_id) references public.agent_versions(id);

alter table public.billing_subscriptions
  add constraint billing_subscriptions_plan_id_fkey
  foreign key (plan_id) references public.billing_plans(id);

alter table public.linked_identities
  alter column tenant_id set not null,
  alter column workspace_id set not null;

alter table public.approval_requests
  alter column policy_rule_id drop default,
  alter column execution_plan_id drop default;

-- Workspace/tenant scoped indexes for the tables the UI reads most.
create index if not exists idx_cases_tenant_workspace_status
  on public.cases (tenant_id, workspace_id, status, created_at desc);

create index if not exists idx_cases_customer
  on public.cases (customer_id);

create index if not exists idx_conversations_tenant_workspace
  on public.conversations (tenant_id, workspace_id, updated_at desc);

create index if not exists idx_messages_conversation
  on public.messages (conversation_id, sent_at desc);

create index if not exists idx_orders_tenant_workspace_status
  on public.orders (tenant_id, workspace_id, status, updated_at desc);

create index if not exists idx_payments_tenant_workspace_status
  on public.payments (tenant_id, workspace_id, status, updated_at desc);

create index if not exists idx_returns_tenant_workspace_status
  on public.returns (tenant_id, workspace_id, status, updated_at desc);

create index if not exists idx_approval_requests_tenant_workspace_status
  on public.approval_requests (tenant_id, workspace_id, status, created_at desc);

create index if not exists idx_workflow_definitions_tenant_workspace
  on public.workflow_definitions (tenant_id, workspace_id, updated_at desc);

create index if not exists idx_agent_runs_tenant_workspace_status
  on public.agent_runs (tenant_id, workspace_id, status, started_at desc);

create index if not exists idx_knowledge_articles_tenant_workspace_status
  on public.knowledge_articles (tenant_id, workspace_id, status, updated_at desc);

create index if not exists idx_webhook_events_tenant_received
  on public.webhook_events (tenant_id, received_at desc);

create index if not exists idx_audit_events_tenant_workspace
  on public.audit_events (tenant_id, workspace_id, occurred_at desc);

commit;
