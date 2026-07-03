-- ─────────────────────────────────────────────────────────────────────────────
-- BLOQUE B — Motor de automatización y reglas
-- 20260511_0003 — automation_rules · macros · assignment_policies · working_hours
-- ─────────────────────────────────────────────────────────────────────────────

-- ── B1: automation_rules ─────────────────────────────────────────────────────
-- if/then engine: conditions + actions evaluated on event triggers

CREATE TABLE IF NOT EXISTS automation_rules (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id     TEXT        NOT NULL,
  workspace_id  TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  description   TEXT,
  -- event that fires evaluation
  event_name    TEXT        NOT NULL
    CHECK (event_name IN (
      'conversation_created', 'conversation_updated', 'conversation_resolved',
      'conversation_opened',  'message_created',      'contact_created',
      'contact_updated'
    )),
  -- [{ attribute, operator, value, value_type? }]
  conditions    JSONB       NOT NULL DEFAULT '[]',
  -- [{ action_name, action_params }]
  actions       JSONB       NOT NULL DEFAULT '[]',
  -- all = ALL conditions must match; any = ANY condition matches
  condition_match TEXT      NOT NULL DEFAULT 'all'
    CHECK (condition_match IN ('all', 'any')),
  active        BOOLEAN     NOT NULL DEFAULT true,
  priority      INTEGER     NOT NULL DEFAULT 0,
  run_count     INTEGER     NOT NULL DEFAULT 0,
  last_run_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_tenant
  ON automation_rules(tenant_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_automation_rules_event_active
  ON automation_rules(tenant_id, event_name)
  WHERE active = true;

-- ── B2: macros ───────────────────────────────────────────────────────────────
-- One-click action sequences: assignable from inbox conversation toolbar

CREATE TABLE IF NOT EXISTS macros (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id     TEXT        NOT NULL,
  workspace_id  TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  -- [{ action_name, action_params }] — same schema as automation actions
  actions       JSONB       NOT NULL DEFAULT '[]',
  visibility    TEXT        NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private')),
  created_by    TEXT,       -- agent/user id
  run_count     INTEGER     NOT NULL DEFAULT 0,
  last_run_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_macros_tenant
  ON macros(tenant_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_macros_visibility
  ON macros(tenant_id, workspace_id, visibility);

-- ── B3: assignment_policies ──────────────────────────────────────────────────
-- Auto-assignment engine: round-robin / capacity-based / skills-based

CREATE TABLE IF NOT EXISTS assignment_policies (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id     TEXT        NOT NULL,
  workspace_id  TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  policy_type   TEXT        NOT NULL
    CHECK (policy_type IN ('round_robin', 'capacity_based', 'skills_based')),
  -- policy-specific settings:
  --   round_robin:    { max_per_agent?: number }
  --   capacity_based: { max_capacity: number, respect_online_status: boolean }
  --   skills_based:   { required_skills: string[], fallback_to_round_robin: boolean }
  config        JSONB       NOT NULL DEFAULT '{}',
  -- optional: scope to a specific inbox id
  inbox_id      TEXT,
  active        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignment_policies_tenant
  ON assignment_policies(tenant_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_assignment_policies_inbox
  ON assignment_policies(tenant_id, inbox_id)
  WHERE inbox_id IS NOT NULL AND active = true;

-- ── B4: working_hours ────────────────────────────────────────────────────────
-- Business-hours schedule per workspace / inbox

CREATE TABLE IF NOT EXISTS working_hours (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id     TEXT        NOT NULL,
  workspace_id  TEXT        NOT NULL,
  name          TEXT        NOT NULL DEFAULT 'Default',
  timezone      TEXT        NOT NULL DEFAULT 'UTC',
  -- Array of day objects:
  -- [{ day: 0-6 (0=Sun), open: boolean, hours: [{ start: 'HH:MM', end: 'HH:MM' }] }]
  schedule      JSONB       NOT NULL DEFAULT '[]',
  -- optional: override for specific inbox
  inbox_id      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_working_hours_tenant
  ON working_hours(tenant_id, workspace_id);

-- ── Seed default working hours per workspace ─────────────────────────────────
-- (No-op if workspace already has hours — workspace_id unique constraint)
-- Production: seed via the /api/working-hours POST after workspace creation.
