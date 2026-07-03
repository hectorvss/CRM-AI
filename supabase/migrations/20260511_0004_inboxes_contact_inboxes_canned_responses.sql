-- ─────────────────────────────────────────────────────────────────────────────
-- BLOQUE C — Canales e ingesta de mensajes
-- 20260511_0004 — inboxes · contact_inboxes · canned_responses
-- ─────────────────────────────────────────────────────────────────────────────

-- ── C1: inboxes ──────────────────────────────────────────────────────────────
-- Each channel (email, WhatsApp, phone, web, etc.) is an Inbox entity with
-- its own config, SLA, working hours and assignment policy.

CREATE TABLE IF NOT EXISTS inboxes (
  id                      TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id               TEXT        NOT NULL,
  workspace_id            TEXT        NOT NULL,
  name                    TEXT        NOT NULL,
  channel_type            TEXT        NOT NULL
    CHECK (channel_type IN (
      'email', 'whatsapp', 'phone', 'messenger', 'web_widget',
      'api', 'twitter', 'instagram', 'line', 'telegram', 'discord', 'sms'
    )),
  -- channel-specific config (API keys, webhooks, phone numbers, etc.)
  channel_config          JSONB       NOT NULL DEFAULT '{}',
  -- greeting shown to new visitors
  greeting_enabled        BOOLEAN     NOT NULL DEFAULT false,
  greeting_message        TEXT,
  -- message shown outside working hours
  out_of_office_message   TEXT,
  -- auto-assignment
  auto_assignment_enabled BOOLEAN     NOT NULL DEFAULT false,
  assignment_policy_id    TEXT        REFERENCES assignment_policies(id) ON DELETE SET NULL,
  -- working hours
  working_hours_id        TEXT        REFERENCES working_hours(id) ON DELETE SET NULL,
  -- email address for email-type inboxes
  email                   TEXT,
  -- enable CSAT survey on conversation close
  csat_survey_enabled     BOOLEAN     NOT NULL DEFAULT false,
  -- is inbox visible/active
  enabled                 BOOLEAN     NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inboxes_tenant
  ON inboxes(tenant_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_inboxes_channel_type
  ON inboxes(tenant_id, channel_type)
  WHERE enabled = true;

-- ── C2: contact_inboxes ───────────────────────────────────────────────────────
-- Per-channel identity for each contact: their WhatsApp number, Slack user ID,
-- email address used in this inbox, etc. One row per (contact, inbox) pair.

CREATE TABLE IF NOT EXISTS contact_inboxes (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id     TEXT        NOT NULL,
  contact_id    TEXT        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  inbox_id      TEXT        NOT NULL REFERENCES inboxes(id)   ON DELETE CASCADE,
  -- channel-specific identifier (phone number, external user id, email, etc.)
  source_id     TEXT        NOT NULL,
  -- last conversation id in this inbox channel
  last_conversation_id TEXT,
  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contact_id, inbox_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_inboxes_contact
  ON contact_inboxes(contact_id);

CREATE INDEX IF NOT EXISTS idx_contact_inboxes_inbox
  ON contact_inboxes(inbox_id);

CREATE INDEX IF NOT EXISTS idx_contact_inboxes_source
  ON contact_inboxes(tenant_id, inbox_id, source_id);

-- ── C3: canned_responses ─────────────────────────────────────────────────────
-- Pre-written message templates selectable in the inbox reply box via /shortcode.

CREATE TABLE IF NOT EXISTS canned_responses (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  tenant_id     TEXT        NOT NULL,
  workspace_id  TEXT        NOT NULL,
  -- Short trigger code typed in reply box, e.g. "greeting"
  short_code    TEXT        NOT NULL,
  content       TEXT        NOT NULL,
  -- optional grouping label
  category      TEXT,
  usage_count   INTEGER     NOT NULL DEFAULT 0,
  last_used_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, workspace_id, short_code)
);

CREATE INDEX IF NOT EXISTS idx_canned_responses_tenant
  ON canned_responses(tenant_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_canned_responses_shortcode
  ON canned_responses(tenant_id, workspace_id, short_code);

-- Full-text search index for content search
CREATE INDEX IF NOT EXISTS idx_canned_responses_fts
  ON canned_responses
  USING gin(to_tsvector('spanish', coalesce(short_code,'') || ' ' || coalesce(content,'')));
