-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260511_0003_agent_tables
-- Creates the agent conversation persistence tables for the Max-style AI agent.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── agent_conversations ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_conversations (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT         NOT NULL,
  workspace_id    TEXT,
  user_id         TEXT,
  title           TEXT         NOT NULL DEFAULT 'New conversation',
  message_count   INTEGER      NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_conversations_tenant
  ON agent_conversations (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_conversations_user
  ON agent_conversations (tenant_id, user_id, updated_at DESC);

-- ── agent_messages ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_messages (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID         NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
  role              TEXT         NOT NULL CHECK (role IN ('user', 'assistant')),
  content           TEXT         NOT NULL,
  -- JSON array of { toolName, args, result, durationMs }
  tool_calls        TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_conversation
  ON agent_messages (conversation_id, created_at ASC);

-- ── Helper RPC: increment message count ───────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_agent_message_count(conv_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE agent_conversations
  SET message_count = message_count + 1,
      updated_at    = NOW()
  WHERE id = conv_id;
$$;

-- ── RLS: disabled (service-role client enforces tenant isolation) ─────────────
ALTER TABLE agent_conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages      DISABLE ROW LEVEL SECURITY;
