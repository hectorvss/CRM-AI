-- Cross-run state used by core.idempotency_check + core.rate_limit nodes.
-- Single table with namespaces so we can add more state types later.

create table if not exists workflow_runtime_state (
  tenant_id      uuid        not null,
  workspace_id   uuid        not null,
  key_namespace  text        not null,    -- 'idempotency' | 'rate_limit'
  key            text        not null,
  value          jsonb       not null default '{}'::jsonb,
  expires_at     timestamptz null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (tenant_id, workspace_id, key_namespace, key)
);

create index if not exists idx_workflow_runtime_state_expires
  on workflow_runtime_state (expires_at)
  where expires_at is not null;
