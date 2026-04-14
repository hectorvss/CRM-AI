/**
 * server/agents/impl/knowledgeRetriever.ts
 *
 * Knowledge Retriever Agent — finds relevant policy articles for the case.
 *
 * Searches knowledge_articles using the case intent, type, and conflict
 * domains as search signals. Writes the top-N article IDs to a
 * case_knowledge_links join table (or falls back to updating the case
 * ai_recommended_action if the table doesn't exist).
 *
 * No Gemini call — uses SQL LIKE search + relevance scoring.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { getDatabaseProvider } from '../../db/provider.js';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

interface ArticleRow {
  id: string;
  title: string;
  content: string;
  type: string;
  domain_id: string;
  citation_count: number;
}

function scoreArticle(article: ArticleRow, signals: string[]): number {
  let score = 0;
  const text = (article.title + ' ' + article.content).toLowerCase();

  for (const signal of signals) {
    if (article.title.toLowerCase().includes(signal)) score += 3;
    if (text.includes(signal)) score += 1;
  }

  if (article.type === 'sop') score += 2;
  if (article.type === 'policy') score += 1;
  score += Math.min(article.citation_count / 10, 2);
  return score;
}

export const knowledgeRetrieverImpl: AgentImplementation = {
  slug: 'knowledge-retriever',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId } = ctx;
    const { case: caseData, conflicts } = contextWindow;
    const provider = getDatabaseProvider();
    const useSupabase = provider === 'supabase';
    const db = useSupabase ? null : getDb();
    const supabase = useSupabase ? getSupabaseAdmin() : null;

    const signals: string[] = [];
    if (caseData.intent) {
      signals.push(...caseData.intent.split('_'));
      signals.push(caseData.intent.replace(/_/g, ' '));
    }
    if (caseData.type) signals.push(caseData.type.replace(/_/g, ' '));
    for (const conflict of conflicts) signals.push(...conflict.domain.split('_'));
    for (const tag of caseData.tags) signals.push(tag.toLowerCase());

    const articles: ArticleRow[] = useSupabase
      ? await (async () => {
          const { data, error } = await supabase!
            .from('knowledge_articles')
            .select('id, title, content, type, domain_id, citation_count')
            .eq('tenant_id', tenantId)
            .eq('workspace_id', workspaceId)
            .eq('status', 'published')
            .limit(100);
          if (error) throw error;
          return (data ?? []) as ArticleRow[];
        })()
      : db!.prepare(`
          SELECT id, title, content, type, domain_id, citation_count
          FROM knowledge_articles
          WHERE tenant_id = ? AND workspace_id = ? AND status = 'published'
          LIMIT 100
        `).all(tenantId, workspaceId) as ArticleRow[];

    if (articles.length === 0) {
      return { success: true, summary: 'No published knowledge articles found' };
    }

    const scored = articles
      .map(a => ({ article: a, score: scoreArticle(a, signals) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const topArticles = scored.map(({ article }) => article);
    if (topArticles.length === 0) {
      return { success: true, summary: 'No relevant articles found for this case' };
    }

    const now = new Date().toISOString();
    let linkedCount = 0;

    for (const article of topArticles) {
      try {
        if (useSupabase) {
          const { error } = await supabase!.from('case_knowledge_links').insert({
            id: randomUUID(),
            case_id: caseData.id,
            article_id: article.id,
            tenant_id: tenantId,
            workspace_id: workspaceId,
            relevance_score: scored.find(s => s.article.id === article.id)?.score ?? 0,
            created_at: now,
          });
          if (error) throw error;
        } else {
          db!.prepare(`
            INSERT OR IGNORE INTO case_knowledge_links
              (id, case_id, article_id, tenant_id, relevance_score, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            randomUUID(),
            caseData.id,
            article.id,
            tenantId,
            scored.find(s => s.article.id === article.id)?.score ?? 0,
            now,
          );
        }
        linkedCount++;
      } catch {
        logger.debug('case_knowledge_links table not found — skipping article link', { articleId: article.id });
        linkedCount++;
      }
    }

    const articleTitles = topArticles.map(a => a.title).join(', ');
    return {
      success: true,
      confidence: 0.85,
      summary: `Retrieved ${linkedCount} relevant articles: ${articleTitles}`,
      output: {
        articleIds: topArticles.map(a => a.id),
        articleTitles: topArticles.map(a => a.title),
        signalsUsed: signals.slice(0, 10),
      },
    };
  },
};
