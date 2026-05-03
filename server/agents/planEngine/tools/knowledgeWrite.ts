/**
 * server/agents/planEngine/tools/knowledgeWrite.ts
 *
 * Knowledge tools for search, CRUD, and publication.
 */

import { createKnowledgeRepository } from '../../../data/index.js';
import type { ToolSpec } from '../types.js';
import { s } from '../schema.js';

const knowledgeRepo = createKnowledgeRepository();

function scope(context: { tenantId: string; workspaceId: string | null; userId: string | null }) {
  return {
    tenantId: context.tenantId,
    workspaceId: context.workspaceId ?? '',
    userId: context.userId ?? undefined,
  };
}

/** Pull a readable string out of any thrown value (Supabase errors are POJOs). */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    const parts = [obj.message, obj.details, obj.hint, obj.code].filter(
      (value) => value !== undefined && value !== null && value !== '',
    );
    if (parts.length > 0) return parts.join(' | ');
    try {
      return JSON.stringify(err);
    } catch {
      return '[unserialisable error]';
    }
  }
  return String(err);
}

export const knowledgeListTool: ToolSpec<{ q?: string; domainId?: string; status?: string; type?: string; limit?: number }, unknown> = {
  name: 'knowledge.list',
  version: '1.0.0',
  description: 'List knowledge articles with optional filters.',
  category: 'knowledge',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'knowledge.read',
  args: s.object({
    q: s.string({ required: false, description: 'Search query' }),
    domainId: s.string({ required: false, description: 'Knowledge domain UUID' }),
    status: s.string({ required: false, description: 'draft, published, archived' }),
    type: s.string({ required: false, description: 'article, policy, playbook, note' }),
    limit: s.number({ required: false, integer: true, min: 1, max: 50, description: 'Max results (default 20)' }),
  }),
  returns: s.any('Array of knowledge articles'),
  async run({ args, context }) {
    const articles = await knowledgeRepo.listArticles(scope(context), {
      q: args.q,
      domain_id: args.domainId,
      status: args.status,
      type: args.type,
    });
    return { ok: true, value: articles.slice(0, args.limit ?? 20) };
  },
};

export const knowledgeGetTool: ToolSpec<{ articleId: string }, unknown> = {
  name: 'knowledge.get',
  version: '1.0.0',
  description: 'Retrieve a knowledge article by ID.',
  category: 'knowledge',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'knowledge.read',
  args: s.object({
    articleId: s.string({ description: 'UUID of the article to fetch' }),
  }),
  returns: s.any('Knowledge article'),
  async run({ args, context }) {
    const article = await knowledgeRepo.getArticle(scope(context), args.articleId);
    if (!article) return { ok: false, error: 'Knowledge article not found', errorCode: 'NOT_FOUND' };
    return { ok: true, value: article };
  },
};

export const knowledgeCreateTool: ToolSpec<{
  title: string;
  content: string;
  domainId?: string;
  type?: string;
  status?: string;
  reviewCycleDays?: number;
  linkedWorkflowIds?: string[];
  linkedApprovalPolicyIds?: string[];
}, unknown> = {
  name: 'knowledge.create',
  version: '1.0.0',
  description: 'Create a knowledge article or operational playbook entry.',
  category: 'knowledge',
  sideEffect: 'write',
  // Knowledge writes are versioned + soft-deletable (low blast radius);
  // the agent should be able to author drafts without an approval gate.
  risk: 'low',
  safeOnDryRun: true,
  idempotent: false,
  requiredPermission: 'knowledge.write',
  args: s.object({
    title: s.string({ min: 3, max: 200, description: 'Article title' }),
    content: s.string({ min: 1, max: 20000, description: 'Article content' }),
    domainId: s.string({ required: false, description: 'Knowledge domain UUID' }),
    type: s.string({ required: false, description: 'article, policy, playbook, note' }),
    status: s.string({ required: false, description: 'draft or published' }),
    reviewCycleDays: s.number({ required: false, integer: true, min: 1, max: 3650, description: 'Review cadence in days' }),
    linkedWorkflowIds: s.array(s.string({ description: 'Linked workflow UUID' }), { required: false }),
    linkedApprovalPolicyIds: s.array(s.string({ description: 'Linked approval policy UUID' }), { required: false }),
  }),
  returns: s.any('Created knowledge article'),
  async run({ args, context }) {
    // Knowledge writes are versioned + soft-deletable, so we persist them even
    // when the planner runs in investigate (dry-run) mode. Otherwise the agent
    // reports "article created" while nothing actually lands in the DB.
    let article;
    try {
      // Empty strings from the LLM ("") must become null — the FK on
      // domain_id treats "" as a non-existent UUID and rejects the insert.
      const domainId = args.domainId && args.domainId.trim() !== '' ? args.domainId : null;
      article = await knowledgeRepo.createArticle(scope(context), {
        title: args.title,
        content: args.content,
        domain_id: domainId,
        type: args.type ?? 'article',
        status: args.status ?? 'draft',
        review_cycle_days: args.reviewCycleDays ?? 90,
        linked_workflow_ids: args.linkedWorkflowIds ?? [],
        linked_approval_policy_ids: args.linkedApprovalPolicyIds ?? [],
      });
    } catch (err) {
      try {
        console.error('[knowledge.create] repo threw', { error: err, scope: scope(context) });
      } catch { /* noop */ }
      return { ok: false, error: describeError(err), errorCode: 'CREATE_FAILED' };
    }
    if (!article) return { ok: false, error: 'Failed to create knowledge article', errorCode: 'CREATE_FAILED' };
    await context.audit({
      action: 'PLAN_ENGINE_KNOWLEDGE_CREATED',
      entityType: 'knowledge',
      entityId: (article as any).id,
      newValue: article,
      metadata: { source: 'plan-engine', planId: context.planId },
    });
    return { ok: true, value: article };
  },
};

export const knowledgeUpdateTool: ToolSpec<{
  articleId: string;
  title?: string;
  content?: string;
  domainId?: string;
  type?: string;
  status?: string;
  reviewCycleDays?: number;
  linkedWorkflowIds?: string[];
  linkedApprovalPolicyIds?: string[];
}, unknown> = {
  name: 'knowledge.update',
  version: '1.0.0',
  description: 'Update a knowledge article or playbook.',
  category: 'knowledge',
  sideEffect: 'write',
  // Updates are versioned + soft-deletable; safe to execute without approval.
  risk: 'low',
  safeOnDryRun: true,
  idempotent: false,
  requiredPermission: 'knowledge.write',
  args: s.object({
    articleId: s.string({ description: 'Article UUID' }),
    title: s.string({ required: false, min: 3, max: 200, description: 'Article title' }),
    content: s.string({ required: false, min: 1, max: 20000, description: 'Article content' }),
    domainId: s.string({ required: false, description: 'Knowledge domain UUID' }),
    type: s.string({ required: false, description: 'article, policy, playbook, note' }),
    status: s.string({ required: false, description: 'draft or published' }),
    reviewCycleDays: s.number({ required: false, integer: true, min: 1, max: 3650, description: 'Review cadence in days' }),
    linkedWorkflowIds: s.array(s.string({ description: 'Linked workflow UUID' }), { required: false }),
    linkedApprovalPolicyIds: s.array(s.string({ description: 'Linked approval policy UUID' }), { required: false }),
  }),
  returns: s.any('Updated knowledge article'),
  async run({ args, context }) {
    // Versioned + soft-deletable: persist on dry-run too (see knowledge.create).
    let article;
    try {
      // Same empty-string FK guard as knowledge.create.
      const domainId =
        args.domainId === undefined ? undefined
        : args.domainId && args.domainId.trim() !== '' ? args.domainId
        : null;
      article = await knowledgeRepo.updateArticle(scope(context), args.articleId, {
        title: args.title,
        content: args.content,
        domain_id: domainId,
        type: args.type,
        status: args.status,
        review_cycle_days: args.reviewCycleDays,
        linked_workflow_ids: args.linkedWorkflowIds,
        linked_approval_policy_ids: args.linkedApprovalPolicyIds,
      });
    } catch (err) {
      try {
        console.error('[knowledge.update] repo threw', { error: err, articleId: args.articleId });
      } catch { /* noop */ }
      return { ok: false, error: describeError(err), errorCode: 'UPDATE_FAILED' };
    }
    if (!article) return { ok: false, error: 'Knowledge article not found', errorCode: 'NOT_FOUND' };
    await context.audit({
      action: 'PLAN_ENGINE_KNOWLEDGE_UPDATED',
      entityType: 'knowledge',
      entityId: args.articleId,
      newValue: article,
      metadata: { source: 'plan-engine', planId: context.planId },
    });
    return { ok: true, value: article };
  },
};

export const knowledgePublishTool: ToolSpec<{ articleId: string }, unknown> = {
  name: 'knowledge.publish',
  version: '1.0.0',
  description: 'Publish a knowledge article.',
  category: 'knowledge',
  sideEffect: 'write',
  // Publishing only flips a status flag; previous versions are preserved.
  risk: 'low',
  safeOnDryRun: true,
  idempotent: false,
  requiredPermission: 'knowledge.write',
  args: s.object({
    articleId: s.string({ description: 'Article UUID' }),
  }),
  returns: s.any('Published knowledge article'),
  async run({ args, context }) {
    // Publishing only flips a status flag; persist on dry-run too.
    const article = await knowledgeRepo.publishArticle(scope(context), args.articleId);
    if (!article) return { ok: false, error: 'Knowledge article not found', errorCode: 'NOT_FOUND' };
    await context.audit({
      action: 'PLAN_ENGINE_KNOWLEDGE_PUBLISHED',
      entityType: 'knowledge',
      entityId: args.articleId,
      newValue: article,
      metadata: { source: 'plan-engine', planId: context.planId },
    });
    return { ok: true, value: article };
  },
};

export const knowledgeListDomainsTool: ToolSpec<Record<string, never>, unknown> = {
  name: 'knowledge.list_domains',
  version: '1.0.0',
  description: 'List knowledge domains and article counts.',
  category: 'knowledge',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'knowledge.read',
  args: s.object({}, { required: false }),
  returns: s.any('Knowledge domains'),
  async run({ context }) {
    return { ok: true, value: await knowledgeRepo.listDomains(scope(context)) };
  },
};

export const knowledgeListPoliciesTool: ToolSpec<Record<string, never>, unknown> = {
  name: 'knowledge.list_policies',
  version: '1.0.0',
  description: 'List knowledge-linked policy rules.',
  category: 'knowledge',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'knowledge.read',
  args: s.object({}, { required: false }),
  returns: s.any('Knowledge policies'),
  async run({ context }) {
    return { ok: true, value: await knowledgeRepo.listPolicies(scope(context)) };
  },
};
