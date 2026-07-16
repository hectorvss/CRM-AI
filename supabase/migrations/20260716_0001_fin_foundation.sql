-- ─────────────────────────────────────────────────────────────────────────────
-- Fin AI Agent — foundation (spec: docs/fin-ai-agent-spec.md §9)
-- 1. cases.ai_triage: per-stage pipeline state + classification + outcome
-- 2. messages: AI columns (private drafts, authorship, citations, confidence)
-- 3. fin_outcomes: one billable-outcome event stream per conversation
-- 4. fin_knowledge_gaps: gaps detected by validation/outcome stages
-- 5. match_knowledge_embeddings RPC + full-text index for hybrid retrieval
-- All statements are idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Cases: Fin pipeline state ------------------------------------------------
ALTER TABLE cases ADD COLUMN IF NOT EXISTS ai_triage JSONB;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS ai_resolved BOOLEAN;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS escalation_reason TEXT;

-- 2. Messages: AI authorship & draft support ----------------------------------
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_private  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS author_type TEXT
  CHECK (author_type IS NULL OR author_type IN ('customer', 'support', 'ai'));
ALTER TABLE messages ADD COLUMN IF NOT EXISTS citations   JSONB;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS confidence  NUMERIC;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reasoning   JSONB;

-- 3. Outcome event stream (billing + analytics) --------------------------------
CREATE TABLE IF NOT EXISTS fin_outcomes (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id       TEXT NOT NULL,
  workspace_id    TEXT NOT NULL,
  case_id         TEXT NOT NULL,
  conversation_id TEXT,
  outcome         TEXT NOT NULL CHECK (outcome IN (
    'resolution_confirmed', 'resolution_assumed', 'procedure_handoff',
    'escalated', 'procedure_failure', 'abandoned', 'spam', 'draft_created'
  )),
  billable        BOOLEAN NOT NULL DEFAULT false,
  reverted        BOOLEAN NOT NULL DEFAULT false,
  reverted_at     TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_outcomes_scope ON fin_outcomes (tenant_id, workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fin_outcomes_case  ON fin_outcomes (case_id);

-- 4. Knowledge gaps -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fin_knowledge_gaps (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id     TEXT NOT NULL,
  workspace_id  TEXT NOT NULL,
  case_id       TEXT,
  gap_text      TEXT NOT NULL,
  query_text    TEXT,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'addressed', 'dismissed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_gaps_scope ON fin_knowledge_gaps (tenant_id, workspace_id, status);

-- 5. Hybrid retrieval helpers ----------------------------------------------------
-- Vector search over knowledge_embeddings (pgvector already enabled).
-- Cosine distance; caller filters tenant/workspace. Service-role only (no RLS yet).
CREATE OR REPLACE FUNCTION match_knowledge_embeddings(
  p_tenant       TEXT,
  p_workspace    TEXT,
  query_embedding vector(1536),
  match_count    INT DEFAULT 40
)
RETURNS TABLE (
  id          TEXT,
  source_type TEXT,
  source_id   TEXT,
  chunk_index INTEGER,
  chunk_text  TEXT,
  metadata    JSONB,
  similarity  DOUBLE PRECISION
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    ke.id, ke.source_type, ke.source_id, ke.chunk_index, ke.chunk_text, ke.metadata,
    1 - (ke.embedding <=> query_embedding) AS similarity
  FROM knowledge_embeddings ke
  WHERE ke.tenant_id = p_tenant
    AND ke.workspace_id = p_workspace
    AND ke.embedding IS NOT NULL
  ORDER BY ke.embedding <=> query_embedding
  LIMIT match_count;
$$;
-- NOTE: live schema uses TEXT ids (not UUID) for knowledge_embeddings — the
-- RETURNS TABLE types above must stay TEXT to match.

-- Full-text fallback/companion (works with zero embeddings configured).
CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_fts
  ON knowledge_embeddings
  USING gin (to_tsvector('simple', chunk_text));

CREATE OR REPLACE FUNCTION search_knowledge_fulltext(
  p_tenant    TEXT,
  p_workspace TEXT,
  p_query     TEXT,
  match_count INT DEFAULT 40
)
RETURNS TABLE (
  id          TEXT,
  source_type TEXT,
  source_id   TEXT,
  chunk_index INTEGER,
  chunk_text  TEXT,
  metadata    JSONB,
  rank        REAL
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    ke.id, ke.source_type, ke.source_id, ke.chunk_index, ke.chunk_text, ke.metadata,
    ts_rank(to_tsvector('simple', ke.chunk_text), plainto_tsquery('simple', p_query)) AS rank
  FROM knowledge_embeddings ke
  WHERE ke.tenant_id = p_tenant
    AND ke.workspace_id = p_workspace
    AND to_tsvector('simple', ke.chunk_text) @@ plainto_tsquery('simple', p_query)
  ORDER BY rank DESC
  LIMIT match_count;
$$;
