-- ─────────────────────────────────────────────────────────────────────────────
-- Bloques F–I: Knowledge split, @mentions, notifications, custom filters,
--              email templates, dashboard apps, visual flows, job priorities,
--              data imports, custom roles, calls table
-- ─────────────────────────────────────────────────────────────────────────────

-- ── F1: Knowledge articles split ─────────────────────────────────────────────
-- Augment the existing knowledge items with indexing metadata

ALTER TABLE knowledge_items
  ADD COLUMN IF NOT EXISTS index_status   TEXT NOT NULL DEFAULT 'pending'
    CHECK (index_status IN ('pending','indexing','indexed','failed')),
  ADD COLUMN IF NOT EXISTS indexed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS index_error    TEXT,
  ADD COLUMN IF NOT EXISTS chunk_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS search_vector  TSVECTOR
    GENERATED ALWAYS AS (
      to_tsvector('spanish', coalesce(title,'') || ' ' || coalesce(content,''))
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_knowledge_items_search_vector
  ON knowledge_items USING gin (search_vector);

CREATE INDEX IF NOT EXISTS idx_knowledge_items_index_status
  ON knowledge_items (tenant_id, workspace_id, index_status)
  WHERE index_status = 'pending';

-- ── G1: @mentions ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mentions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id  UUID NOT NULL,
  message_id       UUID,                       -- nullable for system mentions
  mentioned_user_id UUID NOT NULL,             -- who was @mentioned
  mentioned_by_id  UUID,                       -- who did the mentioning
  content_snippet  TEXT,                       -- surrounding text context
  read             BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mentions_user
  ON mentions (mentioned_user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mentions_scope
  ON mentions (tenant_id, workspace_id, created_at DESC);

-- ── G2: Notifications subsystem ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL,
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'mention', 'assignment', 'conversation_resolved', 'conversation_reopened',
    'sla_breach', 'csat_received', 'new_message', 'macro_executed',
    'automation_triggered', 'custom'
  )),
  title            TEXT NOT NULL,
  body             TEXT,
  entity_type      TEXT,
  entity_id        UUID,
  read             BOOLEAN NOT NULL DEFAULT false,
  read_at          TIMESTAMPTZ,
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications (user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_scope
  ON notifications (tenant_id, workspace_id, created_at DESC);

-- ── G3: Custom saved filters ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS custom_filters (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id      UUID NOT NULL,                 -- user who saved it
  name          TEXT NOT NULL,
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('conversation','contact','company')),
  filters       JSONB NOT NULL DEFAULT '[]',   -- array of filter conditions
  sort_by       TEXT,
  sort_dir      TEXT CHECK (sort_dir IN ('asc','desc')),
  shared        BOOLEAN NOT NULL DEFAULT false, -- visible to whole workspace
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_custom_filters_owner
  ON custom_filters (tenant_id, workspace_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_custom_filters_shared
  ON custom_filters (tenant_id, workspace_id, entity_type)
  WHERE shared = true;

-- ── G4: Email templates ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_templates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  subject        TEXT NOT NULL,
  body_html      TEXT NOT NULL,
  body_text      TEXT,
  -- Template variables extracted from body (auto-populated)
  variables      TEXT[] NOT NULL DEFAULT '{}',
  category       TEXT,
  locale         TEXT NOT NULL DEFAULT 'es',
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_email_templates_scope
  ON email_templates (tenant_id, workspace_id, active);

-- ── G5: Dashboard apps (inline iframe widgets) ───────────────────────────────

CREATE TABLE IF NOT EXISTS dashboard_apps (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  url            TEXT NOT NULL,
  icon_url       TEXT,
  placement      TEXT NOT NULL CHECK (placement IN (
    'conversation_sidebar','contact_sidebar','dashboard','settings'
  )),
  -- Access token injected as Authorization header
  auth_token     TEXT,
  enabled        BOOLEAN NOT NULL DEFAULT true,
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_apps_scope
  ON dashboard_apps (tenant_id, workspace_id, placement)
  WHERE enabled = true;

-- ── H1: Visual flow schema ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS visual_flows (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  -- React-Flow / Tiledesk-style node/edge schema
  nodes          JSONB NOT NULL DEFAULT '[]',
  edges          JSONB NOT NULL DEFAULT '[]',
  viewport       JSONB NOT NULL DEFAULT '{}',
  status         TEXT NOT NULL CHECK (status IN ('draft','published','archived')) DEFAULT 'draft',
  published_at   TIMESTAMPTZ,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visual_flows_scope
  ON visual_flows (tenant_id, workspace_id, status);

-- ── H2: Flow versioning ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS visual_flow_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id        UUID NOT NULL REFERENCES visual_flows(id) ON DELETE CASCADE,
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version        INTEGER NOT NULL,
  nodes          JSONB NOT NULL DEFAULT '[]',
  edges          JSONB NOT NULL DEFAULT '[]',
  created_by     UUID,
  change_summary TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (flow_id, version)
);

CREATE INDEX IF NOT EXISTS idx_flow_versions_flow
  ON visual_flow_versions (flow_id, version DESC);

-- ── H3: Semantic job priorities ───────────────────────────────────────────────
-- Extend the queue_jobs table if it exists (may not in all deployments)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'queue_jobs') THEN
    BEGIN
      ALTER TABLE queue_jobs ADD COLUMN IF NOT EXISTS semantic_priority INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE queue_jobs ADD COLUMN IF NOT EXISTS tenant_id UUID;
      ALTER TABLE queue_jobs ADD COLUMN IF NOT EXISTS category TEXT;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END $$;

-- ── I1: Data imports wizard ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS data_imports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_type    TEXT NOT NULL CHECK (entity_type IN ('contacts','conversations','companies','knowledge')),
  filename       TEXT NOT NULL,
  file_url       TEXT,
  file_size      BIGINT,
  status         TEXT NOT NULL CHECK (status IN ('pending','processing','completed','failed')) DEFAULT 'pending',
  -- Field mapping (source_column → target_field)
  field_mapping  JSONB NOT NULL DEFAULT '{}',
  -- Stats
  total_rows     INTEGER,
  imported_rows  INTEGER NOT NULL DEFAULT 0,
  skipped_rows   INTEGER NOT NULL DEFAULT 0,
  error_rows     INTEGER NOT NULL DEFAULT 0,
  errors         JSONB NOT NULL DEFAULT '[]',   -- array of {row, message}
  imported_by    UUID,
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_imports_scope
  ON data_imports (tenant_id, workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_imports_status
  ON data_imports (tenant_id, status)
  WHERE status IN ('pending','processing');

-- ── I2: Custom roles ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS custom_roles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  permissions    TEXT[] NOT NULL DEFAULT '{}',  -- array of permission keys
  is_system      BOOLEAN NOT NULL DEFAULT false, -- built-in roles can't be deleted
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_custom_roles_scope
  ON custom_roles (tenant_id, workspace_id);

-- Seed default system roles on creation
INSERT INTO custom_roles (id, tenant_id, workspace_id, name, description, permissions, is_system)
SELECT
  gen_random_uuid(),
  t.id,
  w.id,
  role_name,
  role_desc,
  role_perms,
  true
FROM
  tenants t
  CROSS JOIN workspaces w
  CROSS JOIN (VALUES
    ('owner',   'Propietario del espacio de trabajo', ARRAY['*']),
    ('admin',   'Administrador con acceso completo',   ARRAY['settings.read','settings.write','conversations.read','conversations.write','contacts.read','contacts.write','reports.read']),
    ('agent',   'Agente de soporte',                   ARRAY['conversations.read','conversations.write','contacts.read','contacts.write']),
    ('viewer',  'Solo lectura',                        ARRAY['conversations.read','contacts.read','reports.read'])
  ) AS roles(role_name, role_desc, role_perms)
WHERE w.tenant_id = t.id
ON CONFLICT (tenant_id, workspace_id, name) DO NOTHING;

-- ── I3: Calls table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS calls (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id  UUID,
  contact_id       UUID,
  inbox_id         UUID REFERENCES inboxes(id) ON DELETE SET NULL,
  agent_id         UUID,
  direction        TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  status           TEXT NOT NULL CHECK (status IN (
    'initiated','ringing','in_progress','completed','missed','voicemail','failed'
  )),
  -- Phone numbers
  from_number      TEXT,
  to_number        TEXT,
  -- Timing
  initiated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at      TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ,
  duration_s       INTEGER,             -- filled when ended
  -- Provider
  provider         TEXT,               -- 'twilio', 'aircall', etc.
  provider_call_id TEXT,
  recording_url    TEXT,
  transcript       TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_calls_scope
  ON calls (tenant_id, workspace_id, initiated_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_agent
  ON calls (agent_id, initiated_at DESC)
  WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_contact
  ON calls (contact_id, initiated_at DESC)
  WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_status
  ON calls (tenant_id, status, initiated_at DESC);
