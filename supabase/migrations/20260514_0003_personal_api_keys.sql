-- 20260514_0003_personal_api_keys.sql
--
-- Personal API keys — per-user, per-tenant tokens that a user creates from
-- Settings → Account → Personal API keys to call our public API. Each row
-- stores only the SHA-256 hash of the token; the plaintext value is returned
-- exactly once at creation/regeneration time.
--
-- Scopes are stored as a string[] of "<resource>:<level>" entries (e.g.
-- "insight:read", "feature_flag:write") plus a special "*" for full access.
-- Optional scoping:
--   - scoped_organizations: limits the key to specific org ids; empty = all
--   - scoped_teams: limits the key to specific team/project ids; empty = all

begin;

create table if not exists public.personal_api_keys (
  id                    uuid primary key default gen_random_uuid(),
  user_id               text not null,
  tenant_id             text not null,
  label                 text not null,
  token_hash            text not null unique,
  token_prefix          text not null,
  scopes                text[] not null default '{}',
  scoped_organizations  text[] not null default '{}',
  scoped_teams          int[]  not null default '{}',
  last_used_at          timestamptz,
  expires_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_personal_api_keys_user
  on public.personal_api_keys (user_id, tenant_id, created_at desc);

create index if not exists idx_personal_api_keys_hash
  on public.personal_api_keys (token_hash);

commit;
