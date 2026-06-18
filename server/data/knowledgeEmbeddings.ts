import { getSupabaseAdmin } from '../db/supabase.js';

export interface EmbeddingScope { tenantId: string; workspaceId: string }

export type SourceType = 'knowledge_article' | 'canned_response' | 'conversation' | 'custom';

export interface UpsertEmbeddingPayload {
  source_type:  SourceType;
  source_id:    string;
  chunk_index?: number;
  chunk_text:   string;
  embedding:    number[];     // 1536-dim float array
  model?:       string;
  metadata?:    Record<string, unknown>;
}

// ── Storage ───────────────────────────────────────────────────────────────────

export async function upsertEmbedding(scope: EmbeddingScope, payload: UpsertEmbeddingPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase
    .from('knowledge_embeddings')
    .upsert({
      id:           randomUUID(),
      tenant_id:    scope.tenantId,
      workspace_id: scope.workspaceId,
      source_type:  payload.source_type,
      source_id:    payload.source_id,
      chunk_index:  payload.chunk_index ?? 0,
      chunk_text:   payload.chunk_text,
      embedding:    payload.embedding,
      model:        payload.model ?? 'text-embedding-004',
      metadata:     payload.metadata ?? {},
    }, {
      onConflict: 'tenant_id,source_type,source_id,chunk_index',
    })
    .select('id, source_type, source_id, chunk_index')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEmbeddingsForSource(
  scope: EmbeddingScope,
  sourceType: SourceType,
  sourceId: string,
) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('knowledge_embeddings')
    .delete()
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId);
  if (error) throw error;
}

// ── Semantic search ───────────────────────────────────────────────────────────

export interface SimilarityResult {
  id:          string;
  source_type: string;
  source_id:   string;
  chunk_index: number;
  chunk_text:  string;
  similarity:  number;
  metadata:    Record<string, unknown>;
}

/**
 * Find the K most semantically similar chunks to a query embedding.
 * Uses the pgvector cosine distance operator.
 */
export async function searchSimilar(
  scope: EmbeddingScope,
  queryEmbedding: number[],
  opts?: {
    limit?:       number;
    threshold?:   number;        // minimum cosine similarity (0-1)
    sourceType?:  SourceType;
  },
): Promise<SimilarityResult[]> {
  const supabase = getSupabaseAdmin();
  const limit     = opts?.limit     ?? 5;
  const threshold = opts?.threshold ?? 0.7;

  // Supabase supports pgvector via rpc or raw SQL.
  // We use a raw query via the PostgREST RPC pattern:
  const { data, error } = await (supabase.rpc as any)('match_knowledge_embeddings', {
    p_tenant_id:    scope.tenantId,
    p_workspace_id: scope.workspaceId,
    p_embedding:    JSON.stringify(queryEmbedding),
    p_source_type:  opts?.sourceType ?? null,
    p_limit:        limit,
    p_threshold:    threshold,
  });
  if (error) {
    // RPC may not exist in dev — fall back to empty
    console.warn('Vector search RPC not available:', error.message);
    return [];
  }
  return (data ?? []) as SimilarityResult[];
}

/**
 * Placeholder: generate an embedding via Gemini embedContent API.
 * In production wired to the real Gemini client; returns zeros in dev.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const geminiKey = process.env.GOOGLE_GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY ?? '';
    if (!geminiKey) return new Array(1536).fill(0);

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:   'models/text-embedding-004',
          content: { parts: [{ text }] },
        }),
      },
    );
    if (!resp.ok) return new Array(1536).fill(0);
    const json = await resp.json() as { embedding?: { values?: number[] } };
    return json?.embedding?.values ?? new Array(1536).fill(0);
  } catch {
    return new Array(1536).fill(0);
  }
}
