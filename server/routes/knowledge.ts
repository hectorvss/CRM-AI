import { randomUUID } from 'crypto';
import { Router } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { createAgentRepository, createKnowledgeRepository } from '../data/index.js';
import { resolveAgentKnowledgeBundle } from '../services/agentKnowledge.js';
import { getSupabaseAdmin } from '../db/supabase.js';

const router = Router();
const knowledgeRepository = createKnowledgeRepository();
const agentRepository = createAgentRepository();

router.use(extractMultiTenant);

const TOPIC_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'from', 'this', 'have', 'about', 'after', 'before',
  'when', 'into', 'your', 'their', 'there', 'what', 'where', 'while', 'within', 'customer',
  'issue', 'case', 'request', 'requested', 'needs', 'need', 'flow', 'status', 'state',
]);

function prettifyTopic(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function tokenize(value: string | null | undefined) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !TOPIC_STOP_WORDS.has(token));
}

function deriveTopicLabel(caseRow: any, latestMessage?: string | null) {
  const candidates = [
    caseRow.intent,
    caseRow.sub_type,
    latestMessage ? latestMessage.slice(0, 72) : null,
    caseRow.type,
  ];
  const raw = candidates.find((value) => String(value ?? '').trim()) ?? 'General support request';
  return prettifyTopic(raw);
}

function inferSuggestedDomain(topicLabel: string, domains: any[]) {
  const normalized = topicLabel.toLowerCase();
  const direct = domains.find((domain) => normalized.includes(String(domain.name ?? '').toLowerCase()));
  if (direct) return direct.name;
  if (/(refund|invoice|billing|subscription|charge|payment)/.test(normalized)) return 'Billing';
  if (/(return|replacement|exchange|rma)/.test(normalized)) return 'Returns';
  if (/(shipment|shipping|carrier|tracking|delivery|warehouse)/.test(normalized)) return 'Fulfillment';
  if (/(login|access|mfa|sso|workspace|role|permission)/.test(normalized)) return 'Account Management';
  if (/(api|webhook|sdk|token|integration|rate limit)/.test(normalized)) return 'Developer Docs';
  return domains[0]?.name ?? 'General';
}

function articleSearchText(article: any) {
  return [
    article.title,
    article.domain_name,
    article.type,
    article.content,
    article.content_structured ? JSON.stringify(article.content_structured) : '',
  ]
    .join(' ')
    .toLowerCase();
}

function scoreArticleAgainstTopic(article: any, topicLabel: string) {
  const haystack = articleSearchText(article);
  const tokens = tokenize(topicLabel);
  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += 1;
  }
  if (haystack.includes(topicLabel.toLowerCase())) score += 2;
  return score;
}

function buildAnswerPreview(query: string, topArticles: any[]) {
  if (!topArticles.length) {
    return `No strong knowledge source was found for "${query}". The next safe step is to draft or refresh a policy before relying on this topic operationally.`;
  }
  const first = topArticles[0];
  const second = topArticles[1];
  const firstDomain = first.domain_name ? ` in ${first.domain_name}` : '';
  if (!second) {
    return `The strongest source for "${query}" is "${first.title}"${firstDomain}. The agent can rely on this document, but coverage would be stronger with at least one corroborating source or playbook.`;
  }
  return `The agent can answer "${query}" using "${first.title}" and "${second.title}". Together they provide primary guidance and a second source for cross-checking before execution.`;
}

async function fetchKnowledgeGapInputs(req: MultiTenantRequest) {
  const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
  const articles = await knowledgeRepository.listArticles(scope, {});
  const domains = await knowledgeRepository.listDomains(scope);

  const supabase = getSupabaseAdmin();
  const [casesRes, messagesRes, approvalsRes] = await Promise.all([
    supabase
      .from('cases')
      .select('id, case_number, type, sub_type, intent, status, priority, risk_level, sla_status, created_at')
      .eq('tenant_id', req.tenantId)
      .eq('workspace_id', req.workspaceId)
      .order('created_at', { ascending: false })
      .limit(120),
    // `messages` is scoped by tenant_id only (no workspace_id column);
    // we narrow to the workspace by intersecting with the cases query below.
    supabase
      .from('messages')
      .select('case_id, content, sent_at')
      .eq('tenant_id', req.tenantId)
      .order('sent_at', { ascending: false })
      .limit(240),
    supabase
      .from('approval_requests')
      .select('case_id, status, risk_level, action_type, created_at')
      .eq('tenant_id', req.tenantId)
      .eq('workspace_id', req.workspaceId)
      .order('created_at', { ascending: false })
      .limit(180),
  ]);

  for (const result of [casesRes, messagesRes, approvalsRes]) {
    if (result.error) throw result.error;
  }

  return {
    articles,
    domains,
    cases: casesRes.data ?? [],
    messages: messagesRes.data ?? [],
    approvals: approvalsRes.data ?? [],
  };
}

function buildGapAnalysis(input: { articles: any[]; domains: any[]; cases: any[]; messages: any[]; approvals: any[] }) {
  const messageByCase = new Map<string, string>();
  for (const message of input.messages) {
    if (message.case_id && !messageByCase.has(message.case_id) && String(message.content ?? '').trim()) {
      messageByCase.set(message.case_id, String(message.content).trim());
    }
  }

  const approvalsByCase = new Map<string, any[]>();
  for (const approval of input.approvals) {
    const bucket = approvalsByCase.get(approval.case_id) ?? [];
    bucket.push(approval);
    approvalsByCase.set(approval.case_id, bucket);
  }

  const grouped = new Map<string, any>();
  for (const caseRow of input.cases) {
    const latestMessage = messageByCase.get(caseRow.id) ?? null;
    const topicLabel = deriveTopicLabel(caseRow, latestMessage);
    const key = topicLabel.toLowerCase();
    const group = grouped.get(key) ?? {
      topic: topicLabel,
      frequency: 0,
      unresolvedCases: 0,
      escalations: 0,
      sampleCases: [] as string[],
      riskCases: 0,
      pendingApprovals: 0,
    };
    group.frequency += 1;
    if (!['resolved', 'closed', 'cancelled'].includes(String(caseRow.status ?? '').toLowerCase())) {
      group.unresolvedCases += 1;
    }
    const approvals = approvalsByCase.get(caseRow.id) ?? [];
    const pendingApprovals = approvals.filter((item) => String(item.status ?? '').toLowerCase() === 'pending').length;
    group.pendingApprovals += pendingApprovals;
    if (pendingApprovals > 0 || ['high', 'critical'].includes(String(caseRow.risk_level ?? '').toLowerCase()) || String(caseRow.sla_status ?? '').toLowerCase() === 'breached') {
      group.escalations += 1;
    }
    if (['high', 'critical'].includes(String(caseRow.risk_level ?? '').toLowerCase())) {
      group.riskCases += 1;
    }
    if (caseRow.case_number && group.sampleCases.length < 3) {
      group.sampleCases.push(caseRow.case_number);
    }
    grouped.set(key, group);
  }

  const gaps = Array.from(grouped.values()).map((group) => {
    const matches = input.articles
      .map((article) => ({ article, score: scoreArticleAgainstTopic(article, group.topic) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score);
    const healthyMatches = matches.filter(({ article }) => article.status === 'published' && Number(article.outdated_flag ?? 0) === 0);
    const staleMatches = matches.filter(({ article }) => Number(article.outdated_flag ?? 0) === 1 || article.status !== 'published');
    const status = healthyMatches.length === 0
      ? (staleMatches.length > 0 ? 'stale' : 'missing')
      : (group.escalations > 0 && healthyMatches.length < 2 ? 'weak' : 'covered');

    return {
      topic: group.topic,
      frequency: group.frequency,
      unresolvedCases: group.unresolvedCases,
      escalations: group.escalations,
      pendingApprovals: group.pendingApprovals,
      riskCases: group.riskCases,
      sampleCases: group.sampleCases,
      suggestedDomain: inferSuggestedDomain(group.topic, input.domains),
      status,
      recommendedAction:
        status === 'missing'
          ? 'Create a new article or policy for this demand cluster.'
          : status === 'stale'
            ? 'Refresh the stale draft/policy before agents rely on it.'
            : status === 'weak'
              ? 'Add a stronger corroborating source or linked playbook.'
              : 'Coverage exists, but monitor demand and escalations.',
      whyItMatters:
        group.escalations > 0
          ? `${group.escalations} recent cases escalated or breached policy/SLA on this topic.`
          : `${group.frequency} recent customer requests touched this topic.`,
      relatedArticles: matches.slice(0, 3).map(({ article }) => ({
        id: article.id,
        title: article.title,
        status: article.status,
        outdated: Number(article.outdated_flag ?? 0) === 1,
      })),
    };
  });

  const relevantGaps = gaps
    .filter((gap) => gap.status !== 'covered' || gap.frequency >= 2 || gap.escalations > 0)
    .sort((left, right) => {
      const leftWeight = left.escalations * 5 + left.unresolvedCases * 3 + left.frequency;
      const rightWeight = right.escalations * 5 + right.unresolvedCases * 3 + right.frequency;
      return rightWeight - leftWeight;
    })
    .slice(0, 10);

  const problemArticles = input.articles
    .filter((article) => Number(article.outdated_flag ?? 0) === 1 || article.status !== 'published' || Number(article.citation_count ?? 0) <= 1)
    .sort((left, right) => Number(right.outdated_flag ?? 0) - Number(left.outdated_flag ?? 0) || Number(left.citation_count ?? 0) - Number(right.citation_count ?? 0))
    .slice(0, 8)
    .map((article) => ({
      id: article.id,
      title: article.title,
      domain: article.domain_name ?? 'General',
      status: article.status,
      citationCount: Number(article.citation_count ?? 0),
      issue: Number(article.outdated_flag ?? 0) === 1
        ? 'Stale source'
        : article.status !== 'published'
          ? 'Draft only'
          : 'Low usage',
    }));

  const coverageScore = gaps.length
    ? Math.round((gaps.filter((gap) => gap.status === 'covered').length / gaps.length) * 100)
    : 100;

  const topGap = relevantGaps[0];

  return {
    stats: {
      unanswered: relevantGaps.filter((gap) => gap.status === 'missing').reduce((sum, gap) => sum + gap.frequency, 0),
      escalations: relevantGaps.reduce((sum, gap) => sum + gap.escalations, 0),
      staleCoverage: relevantGaps.filter((gap) => gap.status === 'stale').length,
      coverageScore,
      topDemandDomain: topGap?.suggestedDomain ?? 'General',
    },
    gaps: relevantGaps,
    alerts: [
      {
        id: 'coverage',
        title: coverageScore < 70 ? 'Coverage is thin in active customer demand.' : 'Coverage is stable but still improvable.',
        detail: topGap
          ? `${topGap.topic} is currently the highest-pressure topic in recent customer traffic.`
          : 'No critical demand cluster is missing coverage right now.',
      },
      {
        id: 'staleness',
        title: problemArticles.some((article) => article.issue === 'Stale source') ? 'Some live sources are stale.' : 'Most live sources are current.',
        detail: problemArticles.some((article) => article.issue === 'Stale source')
          ? 'Refresh stale sources before agent confidence drifts away from current policy.'
          : 'Draft and low-usage content now matter more than document age.',
      },
    ],
    problemArticles,
  };
}

router.get('/articles', async (req: MultiTenantRequest, res) => {
  try {
    const articles = await knowledgeRepository.listArticles(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId },
      {
        domain_id: typeof req.query.domain_id === 'string' ? req.query.domain_id : undefined,
        type: typeof req.query.type === 'string' ? req.query.type : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
      },
    );
    return res.json(articles);
  } catch (error) {
    console.error('Error fetching knowledge articles:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/articles', async (req: MultiTenantRequest, res) => {
  try {
    // Drafts can have empty bodies — the editor lets users save mid-write,
    // so only `title` is strictly required here. Backend defaults the rest.
    const { title } = req.body ?? {};
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'title is required' });
    }
    const article = await knowledgeRepository.createArticle(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId },
      { ...req.body, content: req.body?.content ?? '' },
    );
    return res.status(201).json(article);
  } catch (error) {
    console.error('Error creating knowledge article:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/articles/:id', async (req: MultiTenantRequest, res) => {
  try {
    const article = await knowledgeRepository.getArticle(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId },
      req.params.id,
    );
    if (!article) return res.status(404).json({ error: 'Not found' });
    return res.json(article);
  } catch (error) {
    console.error('Error fetching knowledge article:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/articles/:id', async (req: MultiTenantRequest, res) => {
  try {
    const article = await knowledgeRepository.updateArticle(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId },
      req.params.id,
      req.body,
    );
    if (!article) return res.status(404).json({ error: 'Not found' });
    return res.json(article);
  } catch (error) {
    console.error('Error updating knowledge article:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/articles/:id/publish', async (req: MultiTenantRequest, res) => {
  try {
    const article = await knowledgeRepository.publishArticle(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId },
      req.params.id,
    );
    if (!article) return res.status(404).json({ error: 'Not found' });
    return res.json(article);
  } catch (error) {
    console.error('Error publishing knowledge article:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/gaps', async (req: MultiTenantRequest, res) => {
  try {
    const analysis = buildGapAnalysis(await fetchKnowledgeGapInputs(req));
    res.json(analysis);
  } catch (error) {
    console.error('Error building knowledge gaps:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/test', async (req: MultiTenantRequest, res) => {
  try {
    const query = String(req.body?.query ?? '').trim();
    const caseId = typeof req.body?.caseId === 'string' ? req.body.caseId : undefined;
    const agentId = typeof req.body?.agentId === 'string' ? req.body.agentId : undefined;
    const selectedArticleIds = Array.isArray(req.body?.selectedArticleIds)
      ? req.body.selectedArticleIds.map((value: any) => String(value))
      : [];

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const allArticles = await knowledgeRepository.listArticles(scope, {});
    let accessibleResults: any[] = [];
    let blockedResults: any[] = [];
    let agentMeta: any = null;
    let agentHealth: any = null;

    if (agentId) {
      const agent = await agentRepository.getEffectiveAgent(scope, agentId);
      if (!agent) return res.status(404).json({ error: 'Agent not found' });
      const caseContext = caseId
        ? await agentRepository.getCaseKnowledgeContext(scope, caseId)
        : undefined;
      const bundle = await resolveAgentKnowledgeBundle({
        tenantId: req.tenantId!,
        workspaceId: req.workspaceId!,
        knowledgeProfile: agent.knowledge_profile ?? null,
        caseContext: caseContext ?? undefined,
      });

      const filteredAccessible = bundle.accessibleDocuments.filter((doc) => {
        if (!selectedArticleIds.length) return true;
        return selectedArticleIds.includes(doc.id);
      });
      const filteredBlocked = bundle.blockedDocuments.filter((doc) => {
        if (!selectedArticleIds.length) return true;
        return selectedArticleIds.includes(doc.id);
      });

      accessibleResults = filteredAccessible
        .map((doc) => ({
          ...doc,
          matchScore: scoreArticleAgainstTopic(doc, query) + Number(doc.relevance_score ?? 0),
          whyMatched: doc.domain_name
            ? `Matched query language and agent-accessible knowledge in ${doc.domain_name}.`
            : 'Matched query language and is available to the selected agent.',
        }))
        .filter((doc) => doc.matchScore > 0)
        .sort((left, right) => right.matchScore - left.matchScore)
        .slice(0, 8);

      blockedResults = filteredBlocked
        .map((doc) => ({
          ...doc,
          matchScore: scoreArticleAgainstTopic(doc, query) + Number(doc.relevance_score ?? 0),
        }))
        .filter((doc) => doc.matchScore > 0)
        .sort((left, right) => right.matchScore - left.matchScore)
        .slice(0, 6);

      agentMeta = {
        id: agent.id,
        slug: agent.slug,
        name: agent.name,
        isActive: agent.is_active !== false,
      };
      agentHealth = {
        implementationMode: agent.implementation_mode ?? 'unknown',
        hasRegisteredImpl: Boolean(agent.has_registered_impl),
        blockedDocuments: bundle.blockedDocuments.length,
        accessibleDocuments: bundle.accessibleDocuments.length,
      };
    } else {
      accessibleResults = allArticles
        .filter((article) => !selectedArticleIds.length || selectedArticleIds.includes(article.id))
        .map((article) => ({
          ...article,
          excerpt: String(article.content ?? '').replace(/\s+/g, ' ').slice(0, 180),
          blocked_reason: null,
          relevance_score: 0,
          matchScore: scoreArticleAgainstTopic(article, query),
          whyMatched: article.domain_name
            ? `Matched query language in ${article.domain_name}.`
            : 'Matched query language in the knowledge library.',
        }))
        .filter((article) => article.matchScore > 0)
        .sort((left, right) => right.matchScore - left.matchScore)
        .slice(0, 8);
    }

    const verdict = accessibleResults.length === 0
      ? 'missing'
      : blockedResults.length > 0 && accessibleResults.length < 2
        ? 'partial'
        : 'strong';

    res.json({
      ok: true,
      query,
      agent: agentMeta,
      agentHealth,
      summary: {
        verdict,
        matchedSources: accessibleResults.length,
        blockedSources: blockedResults.length,
        healthySources: accessibleResults.filter((item) => item.status === 'published' && Number(item.outdated_flag ?? 0) === 0).length,
        suggestedNextStep:
          verdict === 'missing'
            ? 'Create or refresh knowledge before relying on this topic in automation.'
            : verdict === 'partial'
              ? 'Coverage exists, but the selected agent is blocked from part of the relevant material.'
              : 'The selected agent has enough accessible material to answer this topic safely.',
      },
      accessibleResults: accessibleResults.map((item) => ({
        id: item.id,
        title: item.title,
        domain_name: item.domain_name ?? null,
        status: item.status,
        outdated_flag: Number(item.outdated_flag ?? 0),
        excerpt: item.excerpt ?? String(item.content ?? '').replace(/\s+/g, ' ').slice(0, 180),
        whyMatched: item.whyMatched,
        relevance_score: item.matchScore ?? item.relevance_score ?? 0,
      })),
      blockedResults: blockedResults.map((item) => ({
        id: item.id,
        title: item.title,
        domain_name: item.domain_name ?? null,
        blocked_reason: item.blocked_reason ?? 'Blocked by knowledge policy',
        relevance_score: item.matchScore ?? item.relevance_score ?? 0,
      })),
      answerPreview: buildAnswerPreview(query, accessibleResults),
      citations: accessibleResults.slice(0, 3).map((item) => ({
        id: item.id,
        title: item.title,
        domain_name: item.domain_name ?? null,
      })),
    });
  } catch (error) {
    console.error('Error running knowledge test:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/domains', async (req: MultiTenantRequest, res) => {
  try {
    const domains = await knowledgeRepository.listDomains(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId },
    );
    return res.json(domains);
  } catch (error) {
    console.error('Error fetching knowledge domains:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/policies', async (req: MultiTenantRequest, res) => {
  try {
    const policies = await knowledgeRepository.listPolicies(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId },
    );
    return res.json(policies);
  } catch (error) {
    console.error('Error fetching policies:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Domain write endpoints ─────────────────────────────────────────────────────

/**
 * POST /api/knowledge/domains
 * Create a new knowledge domain.
 */
router.post('/domains', async (req: MultiTenantRequest, res) => {
  try {
    const { name, description } = req.body ?? {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('knowledge_domains')
      .insert({
        id: randomUUID(),
        tenant_id: req.tenantId!,
        workspace_id: req.workspaceId!,
        name: String(name).trim(),
        description: description ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return res.status(201).json(data);
  } catch (error) {
    console.error('Error creating knowledge domain:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/knowledge/domains/:id
 * Update an existing knowledge domain's name and/or description.
 */
router.patch('/domains/:id', async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const domainId = req.params.id;
    const { name, description } = req.body ?? {};

    const supabase = getSupabaseAdmin();
    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (description !== undefined) updates.description = description;
    const { data, error } = await supabase
      .from('knowledge_domains')
      .update(updates)
      .eq('id', domainId)
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId)
      .select()
      .single();
    if (error) {
      if ((error as any).code === 'PGRST116') return res.status(404).json({ error: 'Not found' });
      throw error;
    }
    if (!data) return res.status(404).json({ error: 'Not found' });
    return res.json(data);
  } catch (error) {
    console.error('Error updating knowledge domain:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/knowledge/domains/:id
 * Delete a knowledge domain (only if it has no published articles).
 */
router.delete('/domains/:id', async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const domainId = req.params.id;

    const supabase = getSupabaseAdmin();
    // Safety guard: block delete if published articles reference this domain
    const { count } = await supabase
      .from('knowledge_articles')
      .select('id', { count: 'exact', head: true })
      .eq('domain_id', domainId)
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId)
      .eq('status', 'published');
    if ((count ?? 0) > 0) {
      return res.status(409).json({ error: 'Cannot delete a domain that still has published articles. Archive or reassign those articles first.' });
    }
    const { error } = await supabase
      .from('knowledge_domains')
      .delete()
      .eq('id', domainId)
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId);
    if (error) throw error;
    return res.json({ success: true });
  } catch (error) {
    console.error('Error deleting knowledge domain:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Policy write endpoints ─────────────────────────────────────────────────────

/**
 * POST /api/knowledge/policies
 * Create a new policy rule.
 */
router.post('/policies', async (req: MultiTenantRequest, res) => {
  try {
    const { name, description, entity_type, conditions, action_mapping, approval_mapping, escalation_mapping, knowledge_article_id } = req.body ?? {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('policy_rules')
      .insert({
        id: randomUUID(),
        tenant_id: tenantId,
        workspace_id: workspaceId,
        knowledge_article_id: knowledge_article_id ?? null,
        name: String(name).trim(),
        description: description ?? null,
        entity_type: entity_type ?? 'general',
        conditions: conditions ?? [],
        action_mapping: action_mapping ?? {},
        approval_mapping: approval_mapping ?? null,
        escalation_mapping: escalation_mapping ?? null,
        is_active: true,
      })
      .select()
      .single();
    if (error) throw error;
    return res.status(201).json(data);
  } catch (error) {
    console.error('Error creating policy rule:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/knowledge/policies/:id
 * Update an existing policy rule.
 */
router.patch('/policies/:id', async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const policyId = req.params.id;
    const { name, description, entity_type, conditions, action_mapping, approval_mapping, escalation_mapping, is_active, knowledge_article_id } = req.body ?? {};

    const supabase = getSupabaseAdmin();
    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (description !== undefined) updates.description = description;
    if (entity_type !== undefined) updates.entity_type = entity_type;
    if (conditions !== undefined) updates.conditions = conditions;
    if (action_mapping !== undefined) updates.action_mapping = action_mapping;
    if (approval_mapping !== undefined) updates.approval_mapping = approval_mapping;
    if (escalation_mapping !== undefined) updates.escalation_mapping = escalation_mapping;
    if (knowledge_article_id !== undefined) updates.knowledge_article_id = knowledge_article_id;
    if (is_active !== undefined) updates.is_active = Boolean(is_active);
    const { data, error } = await supabase
      .from('policy_rules')
      .update(updates)
      .eq('id', policyId)
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId)
      .select()
      .single();
    if (error) {
      if ((error as any).code === 'PGRST116') return res.status(404).json({ error: 'Not found' });
      throw error;
    }
    if (!data) return res.status(404).json({ error: 'Not found' });
    return res.json(data);
  } catch (error) {
    console.error('Error updating policy rule:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/knowledge/policies/:id
 * Soft-deletes a policy rule by setting is_active = false.
 */
router.delete('/policies/:id', async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const policyId = req.params.id;

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('policy_rules')
      .update({ is_active: false })
      .eq('id', policyId)
      .eq('tenant_id', tenantId)
      .eq('workspace_id', workspaceId);
    if (error) throw error;
    return res.json({ success: true });
  } catch (error) {
    console.error('Error deactivating policy rule:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
