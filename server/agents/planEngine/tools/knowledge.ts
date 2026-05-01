/**
 * server/agents/planEngine/tools/knowledge.ts
 */

import { createKnowledgeRepository } from '../../../data/index.js';
import type { ToolSpec } from '../types.js';
import { s } from '../schema.js';

const knowledgeRepo = createKnowledgeRepository();

// ── knowledge.search ──────────────────────────────────────────────────────────

export const knowledgeSearchTool: ToolSpec<{ q: string; type?: string; limit?: number }, unknown> = {
  name: 'knowledge.search',
  version: '1.0.0',
  description: 'Search the knowledge base for articles, policies, and playbooks. Use this to find answers before taking action.',
  category: 'knowledge',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({
    q: s.string({ min: 2, description: 'Search query' }),
    type: s.string({ required: false, description: 'Filter by article type: policy | playbook | faq | guide' }),
    limit: s.number({ required: false, integer: true, min: 1, max: 20, description: 'Max results (default 5)' }),
  }),
  returns: s.any('Array of knowledge article summaries'),
  async run({ args, context }) {
    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };
    const filters: { q?: string; type?: string; status?: string } = {
      q: args.q,
      status: 'published',
    };
    if (args.type) filters.type = args.type;
    const articles = await knowledgeRepo.listArticles(scope, filters);
    // Return lightweight summary (not full body) to keep LLM context lean
    const summary = (articles as any[]).slice(0, args.limit ?? 5).map((a) => ({
      id: a.id,
      title: a.title,
      type: a.type,
      domain: a.domain_id,
      excerpt: typeof a.content === 'string' ? a.content.slice(0, 300) : '',
    }));
    return { ok: true, value: summary };
  },
};
