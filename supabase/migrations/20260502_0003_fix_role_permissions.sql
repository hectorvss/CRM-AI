-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260502_0003_fix_role_permissions
-- Purpose  : Ensure workspace_admin and owner roles have the wildcard permission,
--            and add missing inbox.read + integrations.read to supervisor/agent/viewer.
--
-- The role_permissions table may have been seeded with an incomplete set,
-- causing workspace_admin users to see a truncated sidebar.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── workspace_admin: add wildcard permission ─────────────────────────────────
-- Remove any partial permission rows for workspace_admin roles and replace
-- with the wildcard so the middleware preset takes effect.

insert into role_permissions (role_id, permission_key)
select r.id, '*'
from roles r
where lower(r.name) in ('workspace_admin', 'owner')
  and not exists (
    select 1 from role_permissions rp
    where rp.role_id = r.id and rp.permission_key = '*'
  )
on conflict do nothing;

-- ── supervisor: add missing inbox.read + integrations.read ───────────────────

insert into role_permissions (role_id, permission_key)
select r.id, p.perm
from roles r
cross join (values ('inbox.read'), ('integrations.read')) as p(perm)
where lower(r.name) = 'supervisor'
  and not exists (
    select 1 from role_permissions rp
    where rp.role_id = r.id and rp.permission_key = p.perm
  )
on conflict do nothing;

-- ── agent: add inbox.read ────────────────────────────────────────────────────

insert into role_permissions (role_id, permission_key)
select r.id, 'inbox.read'
from roles r
where lower(r.name) = 'agent'
  and not exists (
    select 1 from role_permissions rp
    where rp.role_id = r.id and rp.permission_key = 'inbox.read'
  )
on conflict do nothing;

-- ── viewer: add inbox.read ───────────────────────────────────────────────────

insert into role_permissions (role_id, permission_key)
select r.id, 'inbox.read'
from roles r
where lower(r.name) = 'viewer'
  and not exists (
    select 1 from role_permissions rp
    where rp.role_id = r.id and rp.permission_key = 'inbox.read'
  )
on conflict do nothing;

commit;
