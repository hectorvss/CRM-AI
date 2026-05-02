-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260502_0004_invite_tokens_and_oauth_states
-- Purpose  : Persist member invitation tokens and OAuth CSRF state in DB,
--            replacing in-memory storage so they survive restarts and work
--            across horizontally scaled instances.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── invite_tokens ────────────────────────────────────────────────────────────
-- One row per outstanding member invitation. The token (UUID) is what the
-- recipient receives via email. We store the SHA-256 hash so a leak of the
-- DB does not directly expose usable invite links.
create table if not exists invite_tokens (
  token_hash    text        primary key,
  member_id     text        not null,
  user_id       text        not null,
  email         text        not null,
  tenant_id     text        not null,
  workspace_id  text        not null,
  role_id       text        not null,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  consumed_at   timestamptz
);

create index if not exists invite_tokens_member_idx
  on invite_tokens (member_id);

create index if not exists invite_tokens_tenant_idx
  on invite_tokens (tenant_id, workspace_id);

create index if not exists invite_tokens_expires_idx
  on invite_tokens (expires_at);

-- RLS: tenant isolation. Service role bypasses RLS so the backend can still
-- look up tokens by hash without tenant context (during accept-invite flow).
alter table invite_tokens enable row level security;

drop policy if exists invite_tokens_tenant_isolation on invite_tokens;
create policy invite_tokens_tenant_isolation on invite_tokens
  as restrictive
  for all
  using (
    tenant_id = app_tenant_id()
    and (app_workspace_id() = '' or workspace_id = app_workspace_id())
  );

-- ── oauth_states ─────────────────────────────────────────────────────────────
-- Short-lived CSRF/state tokens for OAuth authorization flows. Pruned on
-- every /start request (rows older than 10 minutes are invalid anyway).
create table if not exists oauth_states (
  state         text        primary key,
  tenant_id     text        not null,
  workspace_id  text        not null,
  system        text        not null,
  created_at    timestamptz not null default now()
);

create index if not exists oauth_states_created_idx
  on oauth_states (created_at);

-- No RLS: oauth_states is accessed only via the service-role admin client
-- (the /callback endpoint has no tenant context yet — that's the whole point
-- of the state token). Keeping RLS off is intentional and safe because the
-- table is only reachable through the backend admin client.

commit;
