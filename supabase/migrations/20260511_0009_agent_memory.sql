-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260511_0009_agent_memory
-- Creates the core memory persistence table for the Max AI agent.
-- One row per tenant — content is a plain text blob appended to over time.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_core_memory (
  tenant_id   TEXT        PRIMARY KEY,
  content     TEXT        NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS disabled — service-role client enforces tenant isolation at application layer
ALTER TABLE agent_core_memory DISABLE ROW LEVEL SECURITY;

-- Fast lookup by tenant (already the PK, but explicit index doesn't hurt)
CREATE INDEX IF NOT EXISTS idx_agent_core_memory_tenant
  ON agent_core_memory (tenant_id);
