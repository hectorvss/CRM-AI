-- ─────────────────────────────────────────────────────────────────────────────
-- Bloque D: SLA events + applied_slas, CSAT survey responses, Reporting
-- ─────────────────────────────────────────────────────────────────────────────

-- ── D1: SLA ──────────────────────────────────────────────────────────────────

-- SLA policy definitions (referenced by inboxes + conversations)
CREATE TABLE IF NOT EXISTS sla_policies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  -- thresholds in seconds
  first_response_time   INTEGER,           -- NULL = no limit
  next_response_time    INTEGER,
  resolution_time       INTEGER,
  business_hours        BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sla_policies_scope
  ON sla_policies (tenant_id, workspace_id);

-- Applied SLA: which policy is active for a conversation and its timestamps
CREATE TABLE IF NOT EXISTS applied_slas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id   UUID NOT NULL,          -- FK → conversations (no hard ref for flexibility)
  sla_policy_id     UUID REFERENCES sla_policies(id) ON DELETE SET NULL,
  -- computed deadlines (set when applied, null if threshold not defined)
  first_response_deadline  TIMESTAMPTZ,
  next_response_deadline   TIMESTAMPTZ,
  resolution_deadline      TIMESTAMPTZ,
  -- breach tracking
  first_response_breached  BOOLEAN NOT NULL DEFAULT false,
  next_response_breached   BOOLEAN NOT NULL DEFAULT false,
  resolution_breached      BOOLEAN NOT NULL DEFAULT false,
  applied_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_applied_slas_scope
  ON applied_slas (tenant_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_applied_slas_conversation
  ON applied_slas (conversation_id);
CREATE INDEX IF NOT EXISTS idx_applied_slas_deadlines
  ON applied_slas (tenant_id, first_response_deadline, resolution_deadline)
  WHERE first_response_breached = false OR resolution_breached = false;

-- SLA breach / status events log
CREATE TABLE IF NOT EXISTS sla_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id  UUID NOT NULL,
  applied_sla_id   UUID REFERENCES applied_slas(id) ON DELETE CASCADE,
  event_type       TEXT NOT NULL CHECK (event_type IN (
    'sla_applied', 'first_response_met', 'first_response_breached',
    'next_response_met', 'next_response_breached',
    'resolution_met', 'resolution_breached'
  )),
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata         JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_sla_events_scope
  ON sla_events (tenant_id, workspace_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sla_events_conversation
  ON sla_events (conversation_id, occurred_at DESC);

-- ── D2: CSAT survey responses ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS csat_survey_responses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id  UUID NOT NULL,
  contact_id       UUID,                    -- nullable: anonymous surveys
  assigned_agent_id UUID,
  inbox_id         UUID REFERENCES inboxes(id) ON DELETE SET NULL,
  -- Survey data
  rating           SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feedback_message TEXT,
  -- Token used to identify unique survey link
  survey_token     TEXT UNIQUE,
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_csat_scope
  ON csat_survey_responses (tenant_id, workspace_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_csat_conversation
  ON csat_survey_responses (conversation_id);
CREATE INDEX IF NOT EXISTS idx_csat_agent
  ON csat_survey_responses (assigned_agent_id, submitted_at DESC);

-- ── D3: Reporting events + daily rollups ─────────────────────────────────────

-- Raw reporting events (immutable fact table)
CREATE TABLE IF NOT EXISTS reporting_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_name       TEXT NOT NULL,            -- e.g. 'conversation_opened', 'message_sent'
  conversation_id  UUID,
  contact_id       UUID,
  agent_id         UUID,
  inbox_id         UUID,
  label_id         UUID,
  value_cents      INTEGER,                  -- monetary value if relevant
  metadata         JSONB NOT NULL DEFAULT '{}',
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reporting_events_scope
  ON reporting_events (tenant_id, workspace_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_reporting_events_name
  ON reporting_events (tenant_id, workspace_id, event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_reporting_events_agent
  ON reporting_events (tenant_id, agent_id, occurred_at DESC)
  WHERE agent_id IS NOT NULL;

-- Daily rollup aggregates (pre-computed for fast dashboard queries)
CREATE TABLE IF NOT EXISTS reporting_rollups (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  date           DATE NOT NULL,
  granularity    TEXT NOT NULL CHECK (granularity IN ('day', 'week', 'month')),
  -- Dimension slices (NULL = all)
  inbox_id       UUID,
  agent_id       UUID,
  label_id       UUID,
  -- Metrics
  conversations_opened    INTEGER NOT NULL DEFAULT 0,
  conversations_resolved  INTEGER NOT NULL DEFAULT 0,
  conversations_reopened  INTEGER NOT NULL DEFAULT 0,
  messages_sent           INTEGER NOT NULL DEFAULT 0,
  messages_received       INTEGER NOT NULL DEFAULT 0,
  avg_first_response_s    NUMERIC(12,2),
  avg_resolution_s        NUMERIC(12,2),
  csat_total              INTEGER NOT NULL DEFAULT 0,
  csat_sum                INTEGER NOT NULL DEFAULT 0,   -- sum of ratings
  sla_breaches            INTEGER NOT NULL DEFAULT 0,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, workspace_id, date, granularity, inbox_id, agent_id, label_id)
);

CREATE INDEX IF NOT EXISTS idx_reporting_rollups_scope
  ON reporting_rollups (tenant_id, workspace_id, date DESC, granularity);
