/**
 * server/runtime/adapters/knowledge.ts
 *
 * Adapter handlers for `knowledge.*` node keys.
 * Phase 3c of the workflow extraction (Turno 5b/D2). Byte-for-byte
 * transcription of the inline branches that previously lived in
 * `server/routes/workflows.ts`.
 */

import type { NodeAdapter } from '../workflowExecutor.js';
import { asArray } from '../nodeHelpers.js';
import { createKnowledgeRepository } from '../../data/index.js';

const knowledgeRepository = createKnowledgeRepository();

const knowledgeSearch: NodeAdapter = async ({ scope, context }, _node, config) => {
  const query = config.query || config.q || config.content || context.case?.intent || context.case?.summary || context.trigger?.query || '';
  const articles = await knowledgeRepository.listArticles(scope, {
    q: query || undefined,
    status: config.status || 'published',
    type: config.type || undefined,
    domain_id: config.domain_id || config.domainId || undefined,
  });
  const top = articles.slice(0, Number(config.limit || 5)).map((article: any) => ({
    id: article.id,
    title: article.title,
    status: article.status,
    domain: article.domain_name ?? article.domain_id ?? null,
    version: article.version,
  }));
  context.knowledge = { query, articles: top };
  return { status: 'completed', output: { query, count: top.length, articles: top } };
};

const knowledgeValidatePolicy: NodeAdapter = async ({ context }, _node, config) => {
  const policyText = String(config.policy || context.knowledge?.articles?.[0]?.title || '');
  const proposedAction = String(config.action || config.proposedAction || context.agent?.intent || '');
  const blockedTerms = asArray(config.blocked_terms || config.blockedTerms || 'forbidden|not allowed|manager required').map((term: any) => String(term).toLowerCase());
  const requiresReview = blockedTerms.some((term: string) => policyText.toLowerCase().includes(term)) || ['refund', 'cancel', 'dispute'].includes(proposedAction.toLowerCase()) && config.require_review !== false;
  context.policy = { decision: requiresReview ? 'review' : 'allow', policy: config.policy || 'knowledge', proposedAction };
  return { status: requiresReview ? 'waiting_approval' : 'completed', output: context.policy };
};

const knowledgeAttachEvidence: NodeAdapter = async ({ context }, _node, config) => {
  const evidence = {
    title: config.title || context.knowledge?.articles?.[0]?.title || 'Workflow evidence',
    source: config.source || 'knowledge',
    articles: context.knowledge?.articles ?? [],
    note: config.note || null,
  };
  context.evidence = [...(Array.isArray(context.evidence) ? context.evidence : []), evidence];
  return { status: 'completed', output: { evidenceAttached: true, evidence } };
};

export const knowledgeAdapters: Record<string, NodeAdapter> = {
  'knowledge.search': knowledgeSearch,
  'knowledge.validate_policy': knowledgeValidatePolicy,
  'knowledge.attach_evidence': knowledgeAttachEvidence,
};
