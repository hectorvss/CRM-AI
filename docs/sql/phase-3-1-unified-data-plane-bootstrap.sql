-- Phase 3.1 - Unified Data Plane Bootstrap (Supabase / PostgreSQL)
-- Run in Supabase SQL Editor.
-- Idempotent and safe to re-run.

BEGIN;

-- 1) Ensure dedupe uniqueness on webhook events
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_dedupe_key
  ON webhook_events(dedupe_key);

-- 2) Ensure dedupe uniqueness on canonical events
CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_events_dedupe_key
  ON canonical_events(dedupe_key);

-- 3) Read-path indexes for canonical events feed and triage
CREATE INDEX IF NOT EXISTS idx_canonical_events_tenant_workspace_occurred
  ON canonical_events(tenant_id, workspace_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_canonical_events_tenant_status_occurred
  ON canonical_events(tenant_id, status, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_canonical_events_case_id_occurred
  ON canonical_events(case_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_canonical_events_source_entity
  ON canonical_events(source_system, source_entity_type, source_entity_id);

-- 4) Read-path indexes for webhook inspection
CREATE INDEX IF NOT EXISTS idx_webhook_events_connector_received
  ON webhook_events(connector_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_events_tenant_status_received
  ON webhook_events(tenant_id, status, received_at DESC);

COMMIT;

-- Verification:
-- SELECT COUNT(*) FROM webhook_events;
-- SELECT COUNT(*) FROM canonical_events;
-- SELECT status, COUNT(*) FROM canonical_events GROUP BY status ORDER BY status;
