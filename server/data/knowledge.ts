import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';

export interface KnowledgeScope {
  tenantId: string;
  workspaceId: string;
  userId?: string;
}

export interface KnowledgeArticleFilters {
  domain_id?: string;
  type?: string;
  status?: string;
  q?: string;
}

async function enrichArticlesSupabase(scope: KnowledgeScope, articles: any[]) {
  const supabase = getSupabaseAdmin();
  const domainIds = Array.from(new Set(articles.map((item) => item.domain_id).filter(Boolean)));
  const ownerIds = Array.from(new Set(articles.map((item) => item.owner_user_id).filter(Boolean)));
  const [domainsRes, usersRes] = await Promise.all([
    domainIds.length ? supabase.from('knowledge_domains').select('id, name').in('id', domainIds).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId) : Promise.resolve({ data: [], error: null } as any),
    ownerIds.length ? supabase.from('users').select('id, name').in('id', ownerIds) : Promise.resolve({ data: [], error: null } as any),
  ]);
  for (const result of [domainsRes, usersRes]) {
    if (result?.error) throw result.error;
  }
  const domains = new Map<string, any>((domainsRes.data ?? []).map((row: any) => [row.id, row]));
  const users = new Map<string, any>((usersRes.data ?? []).map((row: any) => [row.id, row]));
  return articles.map((article) => ({
    ...article,
    domain_name: article.domain_id ? domains.get(article.domain_id)?.name || null : null,
    owner_name: article.owner_user_id ? users.get(article.owner_user_id)?.name || null : null,
  }));
}

async function listArticlesSupabase(scope: KnowledgeScope, filters: KnowledgeArticleFilters) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('knowledge_articles')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('citation_count', { ascending: false })
    .order('updated_at', { ascending: false });

  if (filters.domain_id) query = query.eq('domain_id', filters.domain_id);
  if (filters.type) query = query.eq('type', filters.type);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.q) query = query.or(`title.ilike.%${filters.q}%,content.ilike.%${filters.q}%`);

  const { data, error } = await query;
  if (error) throw error;
  return enrichArticlesSupabase(scope, data ?? []);
}

async function getArticleSupabase(scope: KnowledgeScope, articleId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('knowledge_articles')
    .select('*')
    .eq('id', articleId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [article] = await enrichArticlesSupabase(scope, [data]);
  return article ?? null;
}

async function resolveOwnerSupabase(ownerUserId: string | null | undefined) {
  if (!ownerUserId) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('users').select('id').eq('id', ownerUserId).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

// Helpers shared by create + update — sanitise the Intercom-style fields.
const FIN_AUDIENCE_TOKENS = new Set(['users', 'leads', 'visitors']);
function sanitiseAudience(value: any, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .map((v) => String(v || '').toLowerCase().trim())
    .filter((v) => FIN_AUDIENCE_TOKENS.has(v));
  return cleaned.length > 0 ? Array.from(new Set(cleaned)) : fallback;
}
function sanitiseTags(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((v) => String(v || '').trim())
      .filter((v) => v.length > 0 && v.length <= 64),
  )).slice(0, 32);
}
function sanitiseHelpcenterStatus(value: any, fallback: string): string {
  const v = String(value || '').toLowerCase();
  return v === 'published' || v === 'draft' ? v : fallback;
}

async function createArticleSupabase(scope: KnowledgeScope, input: any) {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const id = randomUUID();
  const reviewCycleDays = input.review_cycle_days ?? 90;
  const ownerUserId = await resolveOwnerSupabase(input.owner_user_id ?? scope.userId ?? null);
  const payload = {
    id,
    tenant_id: scope.tenantId,
    workspace_id: scope.workspaceId,
    domain_id: input.domain_id ?? null,
    title: input.title,
    content: input.content,
    content_structured: input.content_structured ?? null,
    type: input.type ?? 'article',
    status: input.status ?? 'draft',
    owner_user_id: ownerUserId,
    review_cycle_days: reviewCycleDays,
    last_reviewed_at: now,
    next_review_at: new Date(Date.now() + reviewCycleDays * 24 * 60 * 60 * 1000).toISOString(),
    version: 1,
    linked_workflow_ids: input.linked_workflow_ids ?? [],
    linked_approval_policy_ids: input.linked_approval_policy_ids ?? [],
    // Intercom-style fields (added 2026-05-07). All have safe defaults so older
    // callers that don't send them still work.
    fin_service:               input.fin_service === true,
    fin_sales:                 input.fin_sales === true,
    copilot_enabled:           input.copilot_enabled !== false,  // default ON
    fin_audience:              sanitiseAudience(input.fin_audience, ['users', 'leads', 'visitors']),
    helpcenter_status:         sanitiseHelpcenterStatus(input.helpcenter_status, 'draft'),
    helpcenter_collection_id:  input.helpcenter_collection_id ?? null,
    helpcenter_audience:       sanitiseAudience(input.helpcenter_audience, ['users', 'leads', 'visitors']),
    excluded_from_suggestions: input.excluded_from_suggestions === true,
    tags:                      sanitiseTags(input.tags),
    language:                  String(input.language || 'en').slice(0, 8),
    author_user_id:            input.author_user_id ?? ownerUserId,
    description:               input.description ?? null,
    created_at: now,
    updated_at: now,
  };
  const { error } = await supabase.from('knowledge_articles').insert(payload);
  if (error) throw error;
  return getArticleSupabase(scope, id);
}

async function updateArticleSupabase(scope: KnowledgeScope, articleId: string, input: any) {
  const existing = await getArticleSupabase(scope, articleId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const ownerUserId = await resolveOwnerSupabase(input.owner_user_id ?? existing.owner_user_id ?? scope.userId ?? null);
  const nextVersion = input.content !== undefined || input.title !== undefined
    ? (Number(existing.version) || 1) + 1
    : Number(existing.version) || 1;

  const payload = {
    domain_id: input.domain_id ?? existing.domain_id ?? null,
    title: input.title ?? existing.title,
    content: input.content ?? existing.content,
    content_structured: input.content_structured ?? existing.content_structured ?? null,
    type: input.type ?? existing.type ?? 'article',
    status: input.status ?? existing.status,
    owner_user_id: ownerUserId,
    review_cycle_days: input.review_cycle_days ?? existing.review_cycle_days ?? 90,
    version: nextVersion,
    linked_workflow_ids: input.linked_workflow_ids ?? existing.linked_workflow_ids ?? [],
    linked_approval_policy_ids: input.linked_approval_policy_ids ?? existing.linked_approval_policy_ids ?? [],
    // Intercom-style fields — keep undefined keys as-is so callers that touch
    // only one toggle don't blow away the rest of the panel state.
    fin_service:               input.fin_service               !== undefined ? input.fin_service === true               : existing.fin_service               ?? false,
    fin_sales:                 input.fin_sales                 !== undefined ? input.fin_sales === true                 : existing.fin_sales                 ?? false,
    copilot_enabled:           input.copilot_enabled           !== undefined ? input.copilot_enabled !== false           : existing.copilot_enabled           ?? true,
    fin_audience:              input.fin_audience              !== undefined ? sanitiseAudience(input.fin_audience, ['users', 'leads', 'visitors']) : existing.fin_audience              ?? ['users', 'leads', 'visitors'],
    helpcenter_status:         input.helpcenter_status         !== undefined ? sanitiseHelpcenterStatus(input.helpcenter_status, 'draft') : existing.helpcenter_status         ?? 'draft',
    helpcenter_collection_id:  input.helpcenter_collection_id  !== undefined ? input.helpcenter_collection_id            : existing.helpcenter_collection_id  ?? null,
    helpcenter_audience:       input.helpcenter_audience       !== undefined ? sanitiseAudience(input.helpcenter_audience, ['users', 'leads', 'visitors']) : existing.helpcenter_audience       ?? ['users', 'leads', 'visitors'],
    excluded_from_suggestions: input.excluded_from_suggestions !== undefined ? input.excluded_from_suggestions === true : existing.excluded_from_suggestions ?? false,
    tags:                      input.tags                      !== undefined ? sanitiseTags(input.tags)                  : existing.tags                      ?? [],
    language:                  input.language                  !== undefined ? String(input.language || 'en').slice(0, 8) : existing.language ?? 'en',
    author_user_id:            input.author_user_id            !== undefined ? input.author_user_id                       : existing.author_user_id ?? ownerUserId,
    description:               input.description               !== undefined ? input.description                          : existing.description ?? null,
    updated_at: now,
  };

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('knowledge_articles')
    .update(payload)
    .eq('id', articleId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
  return getArticleSupabase(scope, articleId);
}

async function publishArticleSupabase(scope: KnowledgeScope, articleId: string) {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('knowledge_articles')
    .update({ status: 'published', last_reviewed_at: now, updated_at: now })
    .eq('id', articleId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
  return getArticleSupabase(scope, articleId);
}

async function listDomainsSupabase(scope: KnowledgeScope) {
  const supabase = getSupabaseAdmin();
  const { data: domains, error } = await supabase
    .from('knowledge_domains')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;

  const withCounts = await Promise.all((domains ?? []).map(async (domain) => {
    const { count, error: countError } = await supabase
      .from('knowledge_articles')
      .select('*', { count: 'exact', head: true })
      .eq('domain_id', domain.id)
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId)
      .eq('status', 'published');
    if (countError) throw countError;
    return { ...domain, article_count: count ?? 0 };
  }));

  return withCounts;
}

async function listPoliciesSupabase(scope: KnowledgeScope) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('policy_rules')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .eq('is_active', true);
  if (error) throw error;
  return data ?? [];
}


export interface KnowledgeRepository {
  listArticles(scope: KnowledgeScope, filters: KnowledgeArticleFilters): Promise<any[]>;
  getArticle(scope: KnowledgeScope, articleId: string): Promise<any | null>;
  createArticle(scope: KnowledgeScope, input: any): Promise<any | null>;
  updateArticle(scope: KnowledgeScope, articleId: string, input: any): Promise<any | null>;
  publishArticle(scope: KnowledgeScope, articleId: string): Promise<any | null>;
  listDomains(scope: KnowledgeScope): Promise<any[]>;
  listPolicies(scope: KnowledgeScope): Promise<any[]>;
}

export function createKnowledgeRepository(): KnowledgeRepository {
  return {
    listArticles: listArticlesSupabase,
    getArticle: getArticleSupabase,
    createArticle: createArticleSupabase,
    updateArticle: updateArticleSupabase,
    publishArticle: publishArticleSupabase,
    listDomains: listDomainsSupabase,
    listPolicies: listPoliciesSupabase,
  };
}
