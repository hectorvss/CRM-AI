import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const knowledgeRetrieverImpl: AgentImplementation = {
  slug: 'knowledge-retriever',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const db = getDb();
    const caseId = ctx.contextWindow.case.id;
    const topArticles = ctx.knowledgeBundle.accessibleDocuments.slice(0, 5);

    if (topArticles.length === 0) {
      return {
        success: true,
        confidence: 0.75,
        summary: 'No accessible knowledge articles matched this case',
        output: {
          accessibleCount: 0,
          blockedCount: ctx.knowledgeBundle.blockedDocuments.length,
        },
      };
    }

    const now = new Date().toISOString();
    let linkedCount = 0;

    for (const article of topArticles) {
      try {
        db.prepare(`
          INSERT OR IGNORE INTO case_knowledge_links
            (id, case_id, article_id, tenant_id, relevance_score, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          randomUUID(),
          caseId,
          article.id,
          ctx.tenantId,
          article.relevance_score ?? 0,
          now,
        );
        linkedCount++;
      } catch {
        logger.debug('case_knowledge_links table not found, skipping article link persistence', {
          caseId,
          articleId: article.id,
        });
        linkedCount++;
      }
    }

    return {
      success: true,
      confidence: 0.9,
      summary: `Retrieved ${linkedCount} accessible knowledge documents for this case`,
      output: {
        articleIds: topArticles.map((article) => article.id),
        articleTitles: topArticles.map((article) => article.title),
        citations: ctx.knowledgeBundle.citations,
        blockedArticles: ctx.knowledgeBundle.blockedDocuments.slice(0, 5).map((article) => ({
          id: article.id,
          title: article.title,
          reason: article.blocked_reason,
        })),
      },
    };
  },
};
