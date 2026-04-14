import { getDb } from '../db/client.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { parseRow } from '../db/utils.js';

type AccessLevel =
  | 'No access'
  | 'Metadata only'
  | 'Read summaries only'
  | 'Read raw documents'
  | 'Read + extract'
  | 'Approval required';

export interface KnowledgeProfile {
  source_access?: Record<string, AccessLevel>;
  global_access_level?: string;
  document_status?: string;
  include_internal_notes?: boolean;
  include_attachments?: boolean;
  include_historical_conversations?: boolean;
  block_admin_notes?: boolean;
  block_finance_docs?: boolean;
  block_legal_docs?: boolean;
  archived_records?: string;
  search_depth?: string;
  historical_lookup_depth?: string;
  cross_system_context?: boolean;
  internal_references?: boolean;
  trusted_source_priority?: string[];
  trusted_source_flags?: {
    internalNotesLowPriority?: boolean;
    draftDocsExcluded?: boolean;
    adminContentNeverPrioritized?: boolean;
  };
  access_conditions?: string[];
  hard_blocks?: string[];
}

export interface KnowledgeArticleView {
  id: string;
  title: string;
  type: string;
  status: string;
  content: string;
  domain_id: string | null;
  domain_name: string | null;
  citation_count: number;
  outdated_flag: number;
  linked_workflow_ids: string[];
  linked_approval_policy_ids: string[];
  source_label: string;
  access_level: AccessLevel;
  content_mode: 'none' | 'metadata' | 'summary' | 'raw' | 'extract';
  relevance_score: number;
  blocked_reason?: string;
  excerpt?: string;
}

export interface AgentKnowledgeBundle {
  profile: KnowledgeProfile;
  accessibleDocuments: KnowledgeArticleView[];
  blockedDocuments: KnowledgeArticleView[];
  promptContext: string;
  citations: Array<{ article_id: string; title: string; domain_name: string | null }>;
}

function parseKnowledgeProfile(input: KnowledgeProfile | string | null | undefined): KnowledgeProfile {
  if (typeof input === 'string') {
    try {
      return JSON.parse(input) as KnowledgeProfile;
    } catch {
      return {};
    }
  }
  return input ?? {};
}

interface ResolveKnowledgeOptions {
  tenantId: string;
  workspaceId: string;
  knowledgeProfile?: KnowledgeProfile | null;
  caseContext?: {
    type?: string;
    intent?: string | null;
    tags?: string[];
    customerSegment?: string | null;
    conflictDomains?: string[];
    latestMessage?: string | null;
  };
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '').toLowerCase();
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(v => String(v ?? '').trim().toLowerCase()).filter(Boolean))];
}

function buildSignals(caseContext?: ResolveKnowledgeOptions['caseContext']): string[] {
  if (!caseContext) return [];

  const intentParts = String(caseContext.intent ?? '')
    .split('_')
    .map(part => part.trim())
    .filter(Boolean);

  const typeParts = String(caseContext.type ?? '')
    .split('_')
    .map(part => part.trim())
    .filter(Boolean);

  const conflictParts = (caseContext.conflictDomains ?? []).flatMap((domain) =>
    String(domain).split('_').map(part => part.trim()).filter(Boolean),
  );

  const messageTokens = String(caseContext.latestMessage ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(token => token.length > 3)
    .slice(0, 12);

  return uniqueStrings([
    caseContext.intent ?? '',
    String(caseContext.intent ?? '').replace(/_/g, ' '),
    caseContext.type ?? '',
    String(caseContext.type ?? '').replace(/_/g, ' '),
    ...(caseContext.tags ?? []),
    caseContext.customerSegment ?? '',
    ...(caseContext.conflictDomains ?? []),
    ...intentParts,
    ...typeParts,
    ...conflictParts,
    ...messageTokens,
  ]);
}

function classifySource(article: any): string {
  const title = normalizeText(article.title);
  const domain = normalizeText(article.domain_name);
  const type = normalizeText(article.type);

  if (title.includes('admin') || domain.includes('admin')) return 'Admin-only content';
  if (title.includes('attachment') || title.includes('upload') || type === 'attachment') return 'Attachments / uploaded files';
  if (type === 'policy') return 'Policies';
  if (type === 'sop' || type === 'playbook') return 'SOPs / playbooks';
  if (type === 'snippet' || type === 'macro' || title.includes('macro')) return 'Help center / macros';
  return 'Policies';
}

function resolveDefaultAccess(profile: KnowledgeProfile): AccessLevel {
  switch (profile.global_access_level) {
    case 'Broad internal access':
      return 'Read + extract';
    case 'Standard access':
      return 'Read raw documents';
    case 'Restricted sensitive access':
      return 'Read summaries only';
    case 'Limited access':
      return 'Metadata only';
    default:
      // Agents without an explicit AI Studio knowledge profile still need
      // published company policies as guardrails. AI Studio can later tighten
      // this to Limited/No access, and the most restrictive rule continues to win.
      return 'Read raw documents';
  }
}

function mapAccessToContentMode(level: AccessLevel): KnowledgeArticleView['content_mode'] {
  switch (level) {
    case 'Metadata only':
      return 'metadata';
    case 'Read summaries only':
      return 'summary';
    case 'Read raw documents':
      return 'raw';
    case 'Read + extract':
      return 'extract';
    case 'No access':
    case 'Approval required':
    default:
      return 'none';
  }
}

function summarizeContent(content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim();
  if (compact.length <= 220) return compact;
  return `${compact.slice(0, 217)}...`;
}

function matchesAny(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => phrase && text.includes(phrase.toLowerCase()));
}

function evaluateBlockedReason(article: any, profile: KnowledgeProfile, sourceLabel: string): string | null {
  const haystack = [
    article.title,
    article.content,
    article.domain_name,
    article.type,
  ].map(normalizeText).join(' ');

  if ((profile.block_admin_notes ?? false) && (sourceLabel === 'Admin-only content' || haystack.includes('admin'))) {
    return 'Blocked by admin content restriction';
  }

  if ((profile.block_finance_docs ?? false) && (haystack.includes('finance') || haystack.includes('billing') || haystack.includes('refund'))) {
    return 'Blocked by finance document restriction';
  }

  if ((profile.block_legal_docs ?? false) && (haystack.includes('legal') || haystack.includes('gdpr') || haystack.includes('compliance'))) {
    return 'Blocked by legal document restriction';
  }

  const hardBlocks = (profile.hard_blocks ?? []).map(item => item.toLowerCase());
  if (matchesAny(haystack, hardBlocks)) {
    return 'Blocked by hard knowledge block';
  }

  const accessLevel = (profile.source_access?.[sourceLabel] ?? resolveDefaultAccess(profile)) as AccessLevel;
  if (accessLevel === 'No access') return 'Blocked by source access policy';
  if (accessLevel === 'Approval required') return 'Requires approval before use';

  return null;
}

function computeRelevance(article: any, signals: string[], sourcePriority: string[]): number {
  const title = normalizeText(article.title);
  const content = normalizeText(article.content);
  const domain = normalizeText(article.domain_name);
  let score = 0;

  for (const signal of signals) {
    if (title.includes(signal)) score += 8;
    if (domain.includes(signal)) score += 6;
    if (content.includes(signal)) score += 2;
  }

  if (article.type === 'policy') score += 4;
  if (article.type === 'sop' || article.type === 'playbook') score += 6;
  score += Math.min(Number(article.citation_count ?? 0) / 5, 8);

  const sourceLabel = classifySource(article);
  const priorityIndex = sourcePriority.findIndex((item) => item === sourceLabel);
  if (priorityIndex >= 0) {
    score += Math.max(5 - priorityIndex, 1);
  }

  if (Number(article.outdated_flag ?? 0) === 1) score -= 5;

  return score;
}

function buildPromptContext(documents: KnowledgeArticleView[]): string {
  if (!documents.length) return '';

  return documents
    .slice(0, 6)
    .map((doc, index) => {
      const payload = doc.content_mode === 'metadata'
        ? `Title: ${doc.title}\nType: ${doc.type}\nDomain: ${doc.domain_name ?? 'General'}`
        : doc.content_mode === 'summary'
          ? `Title: ${doc.title}\nSummary: ${doc.excerpt ?? summarizeContent(doc.content)}`
          : `Title: ${doc.title}\nContent:\n${doc.content}`;

      return `## Policy ${index + 1}\n${payload}`;
    })
    .join('\n\n');
}

export function resolveAgentKnowledgeBundle(options: ResolveKnowledgeOptions): AgentKnowledgeBundle {
  const db = getDb();
  const profile = parseKnowledgeProfile(options.knowledgeProfile);
  const signals = buildSignals(options.caseContext);

  let query = `
    SELECT a.*, d.name as domain_name
    FROM knowledge_articles a
    LEFT JOIN knowledge_domains d ON a.domain_id = d.id
    WHERE a.tenant_id = ? AND a.workspace_id = ?
  `;
  const params: any[] = [options.tenantId, options.workspaceId];

  const docStatus = profile.document_status ?? 'Final documents only';
  if (docStatus === 'Include drafts') {
    query += ` AND a.status IN ('draft', 'published')`;
  } else if (docStatus === 'Approved policies only') {
    query += ` AND a.status = 'published' AND a.type = 'policy'`;
  } else {
    query += ` AND a.status = 'published'`;
  }

  query += ' ORDER BY a.updated_at DESC, a.citation_count DESC';

  const rows = db.prepare(query).all(...params).map(parseRow) as any[];
  const sourcePriority = profile.trusted_source_priority ?? [];
  const accessibleDocuments: KnowledgeArticleView[] = [];
  const blockedDocuments: KnowledgeArticleView[] = [];

  for (const article of rows) {
    const sourceLabel = classifySource(article);
    const accessLevel = (profile.source_access?.[sourceLabel] ?? resolveDefaultAccess(profile)) as AccessLevel;
    let blockedReason = evaluateBlockedReason(article, profile, sourceLabel);
    if (!blockedReason && profile.trusted_source_flags?.draftDocsExcluded && article.status === 'draft') {
      blockedReason = 'Draft documents are excluded by trust policy';
    }
    if (!blockedReason && (profile.archived_records === 'Blocked') && Number(article.outdated_flag ?? 0) === 1) {
      blockedReason = 'Archived or outdated records are blocked';
    }
    const relevanceScore = computeRelevance(article, signals, sourcePriority);
    const contentMode = mapAccessToContentMode(accessLevel);
    const view: KnowledgeArticleView = {
      id: article.id,
      title: article.title,
      type: article.type,
      status: article.status,
      content: article.content,
      domain_id: article.domain_id ?? null,
      domain_name: article.domain_name ?? null,
      citation_count: Number(article.citation_count ?? 0),
      outdated_flag: Number(article.outdated_flag ?? 0),
      linked_workflow_ids: article.linked_workflow_ids ?? [],
      linked_approval_policy_ids: article.linked_approval_policy_ids ?? [],
      source_label: sourceLabel,
      access_level: accessLevel,
      content_mode: contentMode,
      relevance_score: relevanceScore,
      blocked_reason: blockedReason ?? undefined,
      excerpt: summarizeContent(article.content),
    };

    if (blockedReason || contentMode === 'none') {
      blockedDocuments.push(view);
      continue;
    }

    accessibleDocuments.push(view);
  }

  accessibleDocuments.sort((left, right) => right.relevance_score - left.relevance_score);
  blockedDocuments.sort((left, right) => right.relevance_score - left.relevance_score);

  const promptDocuments = accessibleDocuments
    .filter((doc) => doc.content_mode !== 'metadata')
    .slice(0, 6);

  return {
    profile,
    accessibleDocuments,
    blockedDocuments,
    promptContext: buildPromptContext(promptDocuments),
    citations: promptDocuments.map((doc) => ({
      article_id: doc.id,
      title: doc.title,
      domain_name: doc.domain_name,
    })),
  };
}

export async function resolveAgentKnowledgeBundleAsync(options: ResolveKnowledgeOptions): Promise<AgentKnowledgeBundle> {
  if (getDatabaseProvider() !== 'supabase') {
    return resolveAgentKnowledgeBundle(options);
  }

  const profile = parseKnowledgeProfile(options.knowledgeProfile);
  const signals = buildSignals(options.caseContext);
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('knowledge_articles')
    .select('*, knowledge_domains(name)')
    .eq('tenant_id', options.tenantId)
    .eq('workspace_id', options.workspaceId)
    .order('updated_at', { ascending: false })
    .order('citation_count', { ascending: false });

  const docStatus = profile.document_status ?? 'Final documents only';
  if (docStatus === 'Include drafts') {
    query = query.in('status', ['draft', 'published']);
  } else if (docStatus === 'Approved policies only') {
    query = query.eq('status', 'published').eq('type', 'policy');
  } else {
    query = query.eq('status', 'published');
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []).map((row: any) => ({
    ...row,
    domain_name: Array.isArray(row.knowledge_domains)
      ? row.knowledge_domains[0]?.name ?? null
      : row.knowledge_domains?.name ?? null,
  }));

  const sourcePriority = profile.trusted_source_priority ?? [];
  const accessibleDocuments: KnowledgeArticleView[] = [];
  const blockedDocuments: KnowledgeArticleView[] = [];

  for (const article of rows) {
    const sourceLabel = classifySource(article);
    const accessLevel = (profile.source_access?.[sourceLabel] ?? resolveDefaultAccess(profile)) as AccessLevel;
    let blockedReason = evaluateBlockedReason(article, profile, sourceLabel);
    if (!blockedReason && profile.trusted_source_flags?.draftDocsExcluded && article.status === 'draft') {
      blockedReason = 'Draft documents are excluded by trust policy';
    }
    if (!blockedReason && (profile.archived_records === 'Blocked') && Number(article.outdated_flag ?? 0) === 1) {
      blockedReason = 'Archived or outdated records are blocked';
    }
    const relevanceScore = computeRelevance(article, signals, sourcePriority);
    const contentMode = mapAccessToContentMode(accessLevel);
    const view: KnowledgeArticleView = {
      id: article.id,
      title: article.title,
      type: article.type,
      status: article.status,
      content: article.content,
      domain_id: article.domain_id ?? null,
      domain_name: article.domain_name ?? null,
      citation_count: Number(article.citation_count ?? 0),
      outdated_flag: Number(article.outdated_flag ?? 0),
      linked_workflow_ids: article.linked_workflow_ids ?? [],
      linked_approval_policy_ids: article.linked_approval_policy_ids ?? [],
      source_label: sourceLabel,
      access_level: accessLevel,
      content_mode: contentMode,
      relevance_score: relevanceScore,
      blocked_reason: blockedReason ?? undefined,
      excerpt: summarizeContent(article.content ?? ''),
    };

    if (blockedReason || contentMode === 'none') {
      blockedDocuments.push(view);
    } else {
      accessibleDocuments.push(view);
    }
  }

  accessibleDocuments.sort((left, right) => right.relevance_score - left.relevance_score);
  blockedDocuments.sort((left, right) => right.relevance_score - left.relevance_score);

  return {
    profile,
    accessibleDocuments,
    blockedDocuments,
    citations: accessibleDocuments.slice(0, 6).map((doc) => ({
      article_id: doc.id,
      title: doc.title,
      domain_name: doc.domain_name,
    })),
    promptContext: buildPromptContext(accessibleDocuments),
  };
}
