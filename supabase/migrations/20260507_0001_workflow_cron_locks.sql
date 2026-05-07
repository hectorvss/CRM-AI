-- Distributed lock table for cron-triggered workflows.
-- Prevents the same (workflow_version, fire_minute) tuple from firing twice
-- when multiple replicas (Vercel regions / horizontal pods) tick the
-- scheduled-job sweeper at the same minute.
--
-- Acquisition pattern:
--   INSERT INTO workflow_cron_locks (workflow_id, fire_minute, replica_id)
--     VALUES ($1, $2, $3)
--     ON CONFLICT DO NOTHING RETURNING workflow_id;
-- A successful insert (returned row) means this replica owns the slot.
-- A conflict means another replica already fired and we must skip.

create table if not exists workflow_cron_locks (
  workflow_id  uuid        not null,
  fire_minute  timestamptz not null,
  acquired_at  timestamptz not null default now(),
  replica_id   text,
  primary key (workflow_id, fire_minute)
);

-- Used by the periodic cleanup that prunes lock rows older than 24h
-- so the table does not grow unbounded.
create index if not exists idx_workflow_cron_locks_acquired
  on workflow_cron_locks (acquired_at);
