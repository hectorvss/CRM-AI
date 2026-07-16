-- Candidate-stage recall: OR the query lexemes instead of plainto_tsquery's
-- implicit AND (the downstream reranker handles precision). Applied remotely
-- as migration `fin_fulltext_or_semantics`.
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
  WITH q AS (
    SELECT to_tsquery('simple', string_agg(quote_literal_ok.lex, ' | ')) AS tsq
    FROM (
      SELECT DISTINCT unnest(tsvector_to_array(to_tsvector('simple', p_query))) AS lex
    ) AS quote_literal_ok
    WHERE quote_literal_ok.lex ~ '^[[:alnum:]áéíóúüñç]+$'
  )
  SELECT
    ke.id, ke.source_type, ke.source_id, ke.chunk_index, ke.chunk_text, ke.metadata,
    ts_rank(to_tsvector('simple', ke.chunk_text), q.tsq) AS rank
  FROM knowledge_embeddings ke, q
  WHERE q.tsq IS NOT NULL
    AND ke.tenant_id = p_tenant
    AND ke.workspace_id = p_workspace
    AND to_tsvector('simple', ke.chunk_text) @@ q.tsq
  ORDER BY rank DESC
  LIMIT match_count;
$$;
