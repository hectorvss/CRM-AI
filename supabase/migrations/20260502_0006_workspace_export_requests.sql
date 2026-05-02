-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260502_0004_workspace_export_requests
-- Purpose  : Track GDPR-style workspace export and deletion requests.
--
-- A scheduled job (server/jobs/auditExport.ts) processes pending rows hourly:
--   - kind='export'  : produces a JSON dump of all workspace data and stores
--                      a download URL (or sends it via email)
--   - kind='deletion': enqueues a DELETE_WORKSPACE_DATA job with a 30-day
--                      grace period before actual deletion
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create table if not exists workspace_export_requests (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null,
  workspace_id    text not null,
  kind            text not null check (kind in ('export', 'deletion')),
  status          text not null default 'pending'
                  check (status in ('pending', 'processing', 'completed', 'failed')),
  requested_by    text,
  approval_id     text,
  reason          text,
  download_url    text,
  error           text,
  scheduled_for   timestamptz,            -- deletion grace-period anchor
  processed_at    timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_workspace_export_requests_status
  on workspace_export_requests (status, created_at);

create index if not exists idx_workspace_export_requests_tenant_workspace
  on workspace_export_requests (tenant_id, workspace_id, created_at desc);

commit;
