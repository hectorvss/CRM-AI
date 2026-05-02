-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260502_0002_super_agent_sessions
-- Purpose  : Create the persistent session store for the Plan Engine.
--
-- The Plan Engine uses Supabase to persist conversational session state
-- (CIL L1/L2 turns, slots, pending approvals, target context) so sessions
-- survive server restarts and can be shared across horizontal instances.
--
-- TTL is enforced lazily on access and by a periodic pruneExpiredSessions()
-- call from the worker.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create table if not exists super_agent_sessions (
  id                        text        primary key,
  tenant_id                 text        not null,
  workspace_id              text,
  user_id                   text        not null,

  -- Serialised session state (JSON strings to keep the schema simple and
  -- avoid excessive column sprawl for an evolving schema)
  turns_json                text        not null default '[]',
  slots_json                text        not null default '{}',
  recent_targets_json       text        not null default '[]',
  pending_approval_ids_json text        not null default '[]',
  summary                   text        not null default '',
  active_plan_id            text,

  -- Timestamps
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  ttl_at                    timestamptz not null default (now() + interval '1 hour')
);

-- Fast tenant-scoped lookup (all sessions for a tenant)
create index if not exists super_agent_sessions_tenant_idx
  on super_agent_sessions (tenant_id, workspace_id);

-- Fast TTL sweep — used by pruneExpiredSessions()
create index if not exists super_agent_sessions_ttl_idx
  on super_agent_sessions (ttl_at);

-- ── RLS (same restrictive pattern as other tenant tables) ────────────────────
alter table super_agent_sessions enable row level security;

drop policy if exists super_agent_sessions_tenant_isolation on super_agent_sessions;
create policy super_agent_sessions_tenant_isolation on super_agent_sessions
  as restrictive
  for all
  using (
    tenant_id = app_tenant_id()
    and (app_workspace_id() = '' or workspace_id = app_workspace_id())
  );

commit;
