-- ─────────────────────────────────────────────────────────────────────────────
-- Bloque E: AI guardrails, agent tools, scenarios, embeddings, self-learning,
--           copilot threads, MCP schema
-- ─────────────────────────────────────────────────────────────────────────────

-- ── E1: AI Guardrails ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_guardrails (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  rule_type     TEXT NOT NULL CHECK (rule_type IN (
    'blocked_topic', 'required_disclaimer', 'tone_enforcement',
    'pii_redaction', 'language_restriction', 'max_response_length',
    'custom_regex'
  )),
  config        JSONB NOT NULL DEFAULT '{}',   -- rule-specific params
  enabled       BOOLEAN NOT NULL DEFAULT true,
  priority      INTEGER NOT NULL DEFAULT 0,    -- higher = evaluated first
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_guardrails_scope
  ON ai_guardrails (tenant_id, workspace_id)
  WHERE enabled = true;

-- ── E2: Agent Tools (HTTP tool definitions for the plan engine) ───────────────

CREATE TABLE IF NOT EXISTS agent_tools (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  tool_type     TEXT NOT NULL CHECK (tool_type IN (
    'http_request', 'sql_query', 'javascript', 'mcp_call', 'builtin'
  )),
  -- HTTP tool config
  endpoint_url  TEXT,
  http_method   TEXT CHECK (http_method IN ('GET','POST','PUT','PATCH','DELETE')),
  headers       JSONB NOT NULL DEFAULT '{}',
  -- Input/output schema (JSON Schema)
  input_schema  JSONB NOT NULL DEFAULT '{}',
  output_schema JSONB NOT NULL DEFAULT '{}',
  -- Auth
  auth_type     TEXT CHECK (auth_type IN ('none','bearer','api_key','oauth2')),
  auth_config   JSONB NOT NULL DEFAULT '{}',
  enabled       BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_agent_tools_scope
  ON agent_tools (tenant_id, workspace_id)
  WHERE enabled = true;

-- ── E3: Agent Scenarios ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_scenarios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  -- Trigger conditions
  trigger_type    TEXT NOT NULL CHECK (trigger_type IN (
    'intent_match', 'keyword_match', 'routing_rule', 'time_based', 'manual'
  )),
  trigger_config  JSONB NOT NULL DEFAULT '{}',
  -- Execution plan: ordered list of steps
  steps           JSONB NOT NULL DEFAULT '[]',
  -- Linked tools
  allowed_tool_ids UUID[] NOT NULL DEFAULT '{}',
  -- Guardrails override
  guardrail_ids   UUID[] NOT NULL DEFAULT '{}',
  enabled         BOOLEAN NOT NULL DEFAULT true,
  run_count       INTEGER NOT NULL DEFAULT 0,
  last_run_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_scenarios_scope
  ON agent_scenarios (tenant_id, workspace_id)
  WHERE enabled = true;

-- ── E4: pgvector embeddings ───────────────────────────────────────────────────
-- Requires pgvector extension (CREATE EXTENSION IF NOT EXISTS vector)

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_embeddings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- Source reference
  source_type     TEXT NOT NULL CHECK (source_type IN (
    'knowledge_article', 'canned_response', 'conversation', 'custom'
  )),
  source_id       UUID NOT NULL,
  chunk_index     INTEGER NOT NULL DEFAULT 0,   -- for multi-chunk documents
  chunk_text      TEXT NOT NULL,
  -- Vector (1536 dims for text-embedding-ada-002 / Gemini)
  embedding       vector(1536),
  model           TEXT NOT NULL DEFAULT 'text-embedding-004',
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_type, source_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_scope
  ON knowledge_embeddings (tenant_id, workspace_id);

-- IVFFlat index for approximate nearest-neighbour search
CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_ivfflat
  ON knowledge_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ── E5: Self-learning feedback ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- Context
  conversation_id UUID,
  message_id      UUID,
  scenario_id     UUID REFERENCES agent_scenarios(id) ON DELETE SET NULL,
  -- Feedback
  feedback_type   TEXT NOT NULL CHECK (feedback_type IN (
    'thumbs_up', 'thumbs_down', 'correction', 'flagged', 'escalated'
  )),
  feedback_text   TEXT,
  -- Original AI output vs. corrected output
  original_output JSONB,
  corrected_output JSONB,
  -- Who gave feedback
  agent_id        UUID,
  contact_id      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_scope
  ON ai_feedback (tenant_id, workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_scenario
  ON ai_feedback (scenario_id, created_at DESC)
  WHERE scenario_id IS NOT NULL;

-- ── E6: Copilot threads ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS copilot_threads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  agent_id        UUID NOT NULL,    -- human agent using copilot
  -- Thread messages (stored inline for simplicity, each as {role, content, ts})
  messages        JSONB NOT NULL DEFAULT '[]',
  -- Context snapshots used
  context_used    JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL CHECK (status IN ('active','closed')) DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_copilot_threads_scope
  ON copilot_threads (tenant_id, workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_copilot_threads_agent
  ON copilot_threads (agent_id, created_at DESC);

-- ── E7: MCP server registry ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mcp_servers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  transport      TEXT NOT NULL CHECK (transport IN ('stdio','http','sse')),
  endpoint_url   TEXT,              -- for http/sse transports
  command        TEXT,              -- for stdio transport
  args           TEXT[] NOT NULL DEFAULT '{}',
  env_vars       JSONB NOT NULL DEFAULT '{}',
  -- Discovered tools/resources (populated after connection)
  tools_schema   JSONB NOT NULL DEFAULT '[]',
  resources      JSONB NOT NULL DEFAULT '[]',
  enabled        BOOLEAN NOT NULL DEFAULT true,
  last_ping_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_scope
  ON mcp_servers (tenant_id, workspace_id)
  WHERE enabled = true;
