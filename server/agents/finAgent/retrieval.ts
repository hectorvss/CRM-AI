/**
 * server/agents/finAgent/retrieval.ts
 *
 * Hybrid retrieval engine (spec §3, v0 rung of the ladder):
 *   1. vector search over knowledge_embeddings (pgvector RPC) — needs an
 *      embeddings provider (OPENAI_API_KEY); degrades gracefully without one
 *   2. Postgres full-text search (RPC) — always available
 *   3. merge + dedupe candidates (~config.retrieval.candidates)
 *   4. LLM utility rerank → top_k with relevance scores
 *
 * Returns chunks with citations metadata so E3/E5 can ground and display them.
 */

import { getSupabaseAdmin } from '../../db/supabase.js';
import { getUtilityProvider } from '../chatAgent/providers/index.js';
import type { FinConfig, FinScope } from './config.js';

export interface RetrievedChunk {
  id: string;
  sourceType: string;
  sourceId: string;
  chunkIndex: number;
  text: string;
  metadata: Record<string, unknown>;
  /** 0-1 after rerank; raw similarity/rank before. */
  score: number;
  /** which retriever(s) surfaced it */
  via: Array<'vector' | 'fulltext'>;
}

// ── Embeddings (OpenAI text-embedding-3-small → 1536 dims, matches schema) ────

let _embedForTests: ((text: string) => Promise<number[] | null>) | null = null;
export function _setEmbedderForTests(fn: ((text: string) => Promise<number[] | null>) | null): void {
  _embedForTests = fn;
}

export async function embedQuery(text: string): Promise<number[] | null> {
  if (_embedForTests) return _embedForTests(text);
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null; // degrade to full-text only
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000) }),
  });
  if (!res.ok) {
    console.warn('[finAgent] embeddings request failed:', res.status, await res.text().catch(() => ''));
    return null;
  }
  const json: any = await res.json();
  return json?.data?.[0]?.embedding ?? null;
}

// ── Candidate collection ──────────────────────────────────────────────────────

async function vectorCandidates(scope: FinScope, embedding: number[], count: number): Promise<RetrievedChunk[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('match_knowledge_embeddings', {
    p_tenant: scope.tenantId,
    p_workspace: scope.workspaceId,
    query_embedding: JSON.stringify(embedding),
    match_count: count,
  });
  if (error) { console.warn('[finAgent] vector search failed:', error.message); return []; }
  return (data ?? []).map((r: any) => ({
    id: r.id, sourceType: r.source_type, sourceId: r.source_id, chunkIndex: r.chunk_index,
    text: r.chunk_text, metadata: r.metadata ?? {}, score: Number(r.similarity) || 0, via: ['vector' as const],
  }));
}

async function fulltextCandidates(scope: FinScope, query: string, count: number): Promise<RetrievedChunk[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('search_knowledge_fulltext', {
    p_tenant: scope.tenantId,
    p_workspace: scope.workspaceId,
    p_query: query,
    match_count: count,
  });
  if (error) { console.warn('[finAgent] fulltext search failed:', error.message); return []; }
  return (data ?? []).map((r: any) => ({
    id: r.id, sourceType: r.source_type, sourceId: r.source_id, chunkIndex: r.chunk_index,
    text: r.chunk_text, metadata: r.metadata ?? {}, score: Number(r.rank) || 0, via: ['fulltext' as const],
  }));
}

// ── Rerank ────────────────────────────────────────────────────────────────────

const RERANK_SYSTEM = `You are a retrieval reranker for a customer-support AI agent.
Score each document for how useful it is to answer the customer's question.
Respond ONLY with a JSON array of {"id": string, "score": number} where score is 0-10
(10 = directly answers the question, 0 = irrelevant). No prose.`;

async function rerank(query: string, candidates: RetrievedChunk[], topK: number): Promise<RetrievedChunk[]> {
  if (candidates.length <= topK) return candidates;
  try {
    const docs = candidates
      .map((c, i) => `[${i}] (id=${c.id})\n${c.text.slice(0, 600)}`)
      .join('\n---\n');
    const { text } = await getUtilityProvider().completeUtility({
      system: RERANK_SYSTEM,
      prompt: `Customer question: ${query}\n\nDocuments:\n${docs}`,
      maxTokens: 1500,
    });
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('no JSON array in rerank output');
    const scores = new Map<string, number>(
      (JSON.parse(match[0]) as Array<{ id: string; score: number }>).map((s) => [String(s.id), Number(s.score) || 0]),
    );
    return [...candidates]
      .map((c) => ({ ...c, score: (scores.get(c.id) ?? 0) / 10 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  } catch (err: any) {
    console.warn('[finAgent] rerank failed, falling back to retrieval order:', err?.message);
    return [...candidates].sort((a, b) => b.score - a.score).slice(0, topK);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  degraded: boolean; // true when vector search was unavailable
}

export async function retrieveKnowledge(
  scope: FinScope,
  query: string,
  config: FinConfig,
): Promise<RetrievalResult> {
  const half = Math.ceil(config.retrieval.candidates / 2);
  const embedding = await embedQuery(query);
  const [vec, fts] = await Promise.all([
    embedding ? vectorCandidates(scope, embedding, half) : Promise.resolve([]),
    fulltextCandidates(scope, query, embedding ? half : config.retrieval.candidates),
  ]);

  // merge + dedupe by chunk id, keeping best score and union of `via`
  const byId = new Map<string, RetrievedChunk>();
  for (const c of [...vec, ...fts]) {
    const prev = byId.get(c.id);
    if (!prev) byId.set(c.id, c);
    else byId.set(c.id, { ...prev, score: Math.max(prev.score, c.score), via: [...new Set([...prev.via, ...c.via])] as any });
  }
  const merged = [...byId.values()];
  const chunks = await rerank(query, merged, config.retrieval.top_k);
  return { chunks, degraded: !embedding };
}
