/**
 * server/agents/finAgent/ingest.ts
 *
 * Knowledge ingestion for Fin (spec §2, closes the P0 gap): turns
 * knowledge_articles content into retrievable rows in knowledge_embeddings —
 * the ONLY table Fin's retrieval searches. Uses the SAME embedder as the query
 * side (OpenAI text-embedding-3-small, 1536d) so query and stored vectors live
 * in the same space.
 *
 * Called (fire-and-forget) from the article CRUD and from the /fin/reindex
 * backfill route.
 */

import crypto from 'node:crypto';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { embedQuery } from './retrieval.js';
import type { FinScope } from './config.js';

/**
 * Split article text into overlapping chunks (~800 tokens ≈ ~3200 chars).
 * Splits on paragraph boundaries first, then packs paragraphs into chunks,
 * hard-splitting any paragraph that alone exceeds the budget.
 */
export function chunkText(raw: string, opts?: { maxChars?: number; overlapChars?: number }): string[] {
  const maxChars = opts?.maxChars ?? 3200;
  const overlap = opts?.overlapChars ?? 300;
  const text = (raw || '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  if (text.length <= maxChars) return [text];

  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  const flush = () => { if (current.trim()) chunks.push(current.trim()); current = ''; };

  for (const para of paragraphs) {
    if (para.length > maxChars) {
      // Hard-split an oversized paragraph on sentence-ish boundaries.
      flush();
      let rest = para;
      while (rest.length > maxChars) {
        let cut = rest.lastIndexOf('. ', maxChars);
        if (cut < maxChars * 0.5) cut = maxChars; // no good boundary → hard cut
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(Math.max(0, cut - overlap));
      }
      current = rest;
      continue;
    }
    if ((current + '\n\n' + para).length > maxChars) {
      flush();
      // start new chunk with a tail-overlap of the previous one for context
      const prev = chunks[chunks.length - 1] ?? '';
      current = (prev ? prev.slice(-overlap) + '\n\n' : '') + para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  flush();
  return chunks;
}

export interface IndexableArticle {
  id: string;
  title?: string | null;
  content?: string | null;
  language?: string | null;
  fin_audience?: string[] | null;
  status?: string | null;
}

export async function removeArticleEmbeddings(scope: FinScope, articleId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from('knowledge_embeddings')
    .delete()
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .eq('source_type', 'knowledge_article')
    .eq('source_id', articleId);
}

export interface IndexResult {
  articleId: string;
  chunks: number;
  embedded: number;
  skipped?: string;
}

/**
 * (Re)index one article: delete its old chunks, chunk the content, embed each
 * chunk, and upsert. Idempotent. Degrades to a no-op (with `skipped`) when
 * there is no embedder key or no content.
 */
export async function indexArticle(scope: FinScope, article: IndexableArticle): Promise<IndexResult> {
  const supabase = getSupabaseAdmin();

  // Always clear stale chunks first so edits/removals don't leave orphans.
  await removeArticleEmbeddings(scope, article.id);

  const body = [article.title, article.content].filter(Boolean).join('\n\n');
  const chunks = chunkText(body);
  if (!chunks.length) return { articleId: article.id, chunks: 0, embedded: 0, skipped: 'empty' };

  const now = new Date().toISOString();
  const rows: any[] = [];
  let embedded = 0;
  for (let i = 0; i < chunks.length; i++) {
    const vec = await embedQuery(chunks[i]);
    rows.push({
      id: `${article.id}::${i}`,
      tenant_id: scope.tenantId,
      workspace_id: scope.workspaceId,
      source_type: 'knowledge_article',
      source_id: article.id,
      chunk_index: i,
      chunk_text: chunks[i],
      embedding: vec ? JSON.stringify(vec) : null, // full-text still works without it
      model: vec ? 'text-embedding-3-small' : 'none',
      metadata: {
        title: article.title ?? null,
        language: article.language ?? null,
        fin_audience: article.fin_audience ?? null,
      },
      created_at: now,
    });
    if (vec) embedded++;
  }

  const { error } = await supabase.from('knowledge_embeddings').insert(rows);
  if (error) throw error;
  return { articleId: article.id, chunks: rows.length, embedded };
}

/**
 * Fire-and-forget hook for the article CRUD. Indexes when the article is a Fin
 * source (fin_service); removes its embeddings otherwise. Never throws — a
 * failure here must not break the article save.
 */
export function syncArticleEmbeddings(
  scope: FinScope,
  article: (IndexableArticle & { fin_service?: boolean }) | null,
  articleId: string,
): void {
  const run = async () => {
    try {
      if (article && article.fin_service === true) {
        await indexArticle(scope, article);
      } else {
        await removeArticleEmbeddings(scope, articleId);
      }
    } catch (err: any) {
      console.warn('[finAgent] embedding sync failed for article', articleId, err?.message ?? err);
    }
  };
  void run();
}

/** Backfill: (re)index every fin_service article in the workspace. */
export async function reindexWorkspace(scope: FinScope): Promise<{ articles: number; chunks: number; embedded: number }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('knowledge_articles')
    .select('id, title, content, language, fin_audience, status')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .eq('fin_service', true);
  if (error) throw error;

  let chunks = 0, embedded = 0;
  for (const a of data ?? []) {
    const r = await indexArticle(scope, a as IndexableArticle);
    chunks += r.chunks;
    embedded += r.embedded;
  }
  return { articles: (data ?? []).length, chunks, embedded };
}

/** How many Fin chunks are currently indexed for this workspace (UI status). */
export async function countIndexedChunks(scope: FinScope): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from('knowledge_embeddings')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .eq('source_type', 'knowledge_article');
  if (error) throw error;
  return count ?? 0;
}
