-- 20260427_0001_workflow_event_log.sql
--
-- Durable event log for the workflow event bus.
-- Events are written here before being dispatched to running workflows.
-- The recovery sweeper in scheduledJobs.ts retries any events stuck in
-- 'pending' status older than 60 seconds (process crash recovery).

CREATE TABLE IF NOT EXISTS workflow_event_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT        NOT NULL,
  workspace_id  TEXT        NOT NULL,
  event_type    TEXT        NOT NULL,
  payload       JSONB       NOT NULL DEFAULT '{}',
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'executed', 'failed')),
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_at   TIMESTAMPTZ,
  retry_count   INT         NOT NULL DEFAULT 0
);

-- Fast lookup for recovery sweeper: all pending events per tenant
CREATE INDEX IF NOT EXISTS idx_workflow_event_log_pending
  ON workflow_event_log (tenant_id, status, created_at)
  WHERE status = 'pending';

-- Housekeeping: auto-delete executed events older than 7 days
-- (failed events are retained indefinitely for manual inspection)
-- This is handled by the scheduled pruner, not a trigger.

COMMENT ON TABLE workflow_event_log IS
  'Durable pre-fire log for workflowEventBus. Guarantees at-least-once delivery '
  'even across server restarts. Recovery sweeper retries pending rows.';
