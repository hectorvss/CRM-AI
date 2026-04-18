import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { knowledgeApi } from '../api/client';
import { useApi, useMutation } from '../api/hooks';
import LoadingState from './LoadingState';

type KnowledgeTab = 'library' | 'gaps' | 'test';

interface KnowledgeItem {
  id: string;
  type: 'POLICY' | 'ARTICLE' | 'SNIPPET' | 'PLAYBOOK';
  title: string;
  category: string;
  visibility: 'Public' | 'Internal';
  status: 'Published' | 'Draft';
  owner: string;
  ownerInitials: string;
  lastUpdated: string;
  health: 'OK' | 'Stale';
}

type KnowledgeSheet = {
  summary: string;
  policy: string;
  allowed: string[];
  blocked: string[];
  escalation: string[];
  evidence: string[];
  agent_notes: string[];
  examples: string[];
  keywords: string[];
};

type KnowledgeDraftState = {
  title: string;
  content: string;
  type: KnowledgeItem['type'];
  status: 'Published' | 'Draft';
  domainId: string;
  ownerUserId: string;
  reviewCycleDays: string;
};

const emptyDraft: KnowledgeDraftState = {
  title: '',
  content: '',
  type: 'ARTICLE',
  status: 'Draft',
  domainId: '',
  ownerUserId: '',
  reviewCycleDays: '90',
};

const splitLines = (value: string) => value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const joinLines = (items?: string[] | null) => (items ?? []).join('\n');
const asString = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};
const normalizeSheet = (value: unknown, content: string): KnowledgeSheet => {
  const structured = typeof value === 'string'
    ? (() => {
        try {
          return JSON.parse(value);
        } catch {
          return {};
        }
      })()
    : (value ?? {}) as Record<string, any>;

  return {
    summary: String(structured.summary ?? structured.overview ?? '').trim() || content.slice(0, 220),
    policy: String(structured.policy ?? structured.policy_statement ?? '').trim() || content,
    allowed: Array.isArray(structured.allowed) ? structured.allowed.map((item: any) => String(item ?? '').trim()).filter(Boolean) : [],
    blocked: Array.isArray(structured.blocked) ? structured.blocked.map((item: any) => String(item ?? '').trim()).filter(Boolean) : [],
    escalation: Array.isArray(structured.escalation) ? structured.escalation.map((item: any) => String(item ?? '').trim()).filter(Boolean) : [],
    evidence: Array.isArray(structured.evidence) ? structured.evidence.map((item: any) => String(item ?? '').trim()).filter(Boolean) : [],
    agent_notes: Array.isArray(structured.agent_notes) ? structured.agent_notes.map((item: any) => String(item ?? '').trim()).filter(Boolean) : [],
    examples: Array.isArray(structured.examples) ? structured.examples.map((item: any) => String(item ?? '').trim()).filter(Boolean) : [],
    keywords: Array.isArray(structured.keywords) ? structured.keywords.map((item: any) => String(item ?? '').trim()).filter(Boolean) : [],
  };
};

const sectionAliases: Record<string, keyof KnowledgeSheet> = {
  summary: 'summary',
  overview: 'summary',
  context: 'summary',
  policy: 'policy',
  'policy statement': 'policy',
  statement: 'policy',
  allowed: 'allowed',
  permitted: 'allowed',
  blocked: 'blocked',
  disallowed: 'blocked',
  escalation: 'escalation',
  escalations: 'escalation',
  evidence: 'evidence',
  citations: 'evidence',
  sources: 'evidence',
  'agent notes': 'agent_notes',
  notes: 'agent_notes',
  examples: 'examples',
  example: 'examples',
  keywords: 'keywords',
  tags: 'keywords',
};

const normalizeSectionKey = (heading: string): keyof KnowledgeSheet | null => {
  const cleaned = heading.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [needle, section] of Object.entries(sectionAliases)) {
    if (cleaned === needle || cleaned.startsWith(`${needle} `) || cleaned.includes(` ${needle} `)) {
      return section;
    }
  }
  return null;
};

const parseItems = (lines: string[], commaSeparated = false) => {
  const collected = lines.flatMap((line) => {
    const cleaned = line.replace(/^[-*•]+\s*/, '').replace(/^\d+[.)]\s*/, '').trim();
    if (!cleaned) return [];
    if (commaSeparated) {
      return cleaned.split(/[;,]/g).map((item) => item.trim()).filter(Boolean);
    }
    return [cleaned];
  });
  return collected;
};

const buildKnowledgeSheetFromNarrative = (content: string, fallback?: Partial<KnowledgeSheet> | null): KnowledgeSheet => {
  const empty: KnowledgeSheet = {
    summary: '',
    policy: '',
    allowed: [],
    blocked: [],
    escalation: [],
    evidence: [],
    agent_notes: [],
    examples: [],
    keywords: [],
  };

  const lines = content.split(/\r?\n/);
  const sections: Record<keyof KnowledgeSheet, string[]> = {
    summary: [],
    policy: [],
    allowed: [],
    blocked: [],
    escalation: [],
    evidence: [],
    agent_notes: [],
    examples: [],
    keywords: [],
  };

  let current: keyof KnowledgeSheet | null = null;
  let sawHeading = false;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const headingMatch = line.match(/^\s{0,3}(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const section = normalizeSectionKey(headingMatch[2]);
      current = section;
      sawHeading = sawHeading || Boolean(section);
      continue;
    }

    if (!current) {
      sections.policy.push(line);
      continue;
    }

    sections[current].push(line);
  }

  const paragraphSummary = content
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .find(Boolean) ?? '';

  const summary = sections.summary.join('\n').trim() || fallback?.summary?.trim() || paragraphSummary.slice(0, 220);
  const policy = sections.policy.join('\n').trim() || fallback?.policy?.trim() || content.trim();

  const lists = {
    allowed: parseItems(sections.allowed),
    blocked: parseItems(sections.blocked),
    escalation: parseItems(sections.escalation),
    evidence: parseItems(sections.evidence),
    agent_notes: parseItems(sections.agent_notes),
    examples: parseItems(sections.examples),
    keywords: parseItems(sections.keywords, true),
  };

  return {
    ...empty,
    summary,
    policy,
    allowed: lists.allowed.length ? lists.allowed : (fallback?.allowed ?? []),
    blocked: lists.blocked.length ? lists.blocked : (fallback?.blocked ?? []),
    escalation: lists.escalation.length ? lists.escalation : (fallback?.escalation ?? []),
    evidence: lists.evidence.length ? lists.evidence : (fallback?.evidence ?? []),
    agent_notes: lists.agent_notes.length ? lists.agent_notes : (fallback?.agent_notes ?? []),
    examples: lists.examples.length ? lists.examples : (fallback?.examples ?? []),
    keywords: lists.keywords.length ? lists.keywords : (fallback?.keywords ?? []),
  };
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockLibrary: KnowledgeItem[] = [
  {
    id: 'KB-1024',
    type: 'POLICY',
    title: 'Refund Policy - Annual Plans',
    category: 'Billing',
    visibility: 'Public',
    status: 'Published',
    owner: 'John Doe',
    ownerInitials: 'JD',
    lastUpdated: '2h ago',
    health: 'OK'
  },
  {
    id: 'KB-1025',
    type: 'ARTICLE',
    title: 'GDPR Data Export',
    category: 'Legal',
    visibility: 'Internal',
    status: 'Published',
    owner: 'Sarah Lee',
    ownerInitials: 'SL',
    lastUpdated: '1d ago',
    health: 'OK'
  },
  {
    id: 'KB-1026',
    type: 'SNIPPET',
    title: 'Password Reset Instructions',
    category: 'Account',
    visibility: 'Public',
    status: 'Published',
    owner: 'Mike K.',
    ownerInitials: 'MK',
    lastUpdated: '3d ago',
    health: 'Stale'
  },
  {
    id: 'KB-1027',
    type: 'PLAYBOOK',
    title: 'Churn Prevention Script',
    category: 'Sales',
    visibility: 'Internal',
    status: 'Draft',
    owner: 'John Doe',
    ownerInitials: 'JD',
    lastUpdated: '5d ago',
    health: 'OK'
  },
  {
    id: 'KB-1028',
    type: 'ARTICLE',
    title: 'API Rate Limits',
    category: 'Technical',
    visibility: 'Public',
    status: 'Published',
    owner: 'Alex B.',
    ownerInitials: 'AB',
    lastUpdated: '1w ago',
    health: 'OK'
  }
];

export default function Knowledge() {
  const [activeTab, setActiveTab] = useState<KnowledgeTab>('library');
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [draft, setDraft] = useState<KnowledgeDraftState>(emptyDraft);

  const { data: apiArticles, loading: articlesLoading, refetch } = useApi(() => knowledgeApi.listArticles(), [], []);
  const { data: apiDomains } = useApi(() => knowledgeApi.listDomains(), [], []);
  const { data: selectedArticle, loading: selectedArticleLoading, refetch: refetchSelectedArticle } = useApi(
    () => (selectedArticleId ? knowledgeApi.getArticle(selectedArticleId) : Promise.resolve(null)),
    [selectedArticleId],
    null,
  );
  const createArticle = useMutation((payload: Record<string, any>) => knowledgeApi.createArticle(payload));
  const updateArticle = useMutation((payload: { id: string; body: Record<string, any> }) => knowledgeApi.updateArticle(payload.id, payload.body));
  const publishArticle = useMutation((id: string) => knowledgeApi.publishArticle(id));
  const domains = Array.isArray(apiDomains) ? apiDomains : [];
  const domainOptions = useMemo(() => domains.map((domain: any) => ({ id: domain.id, name: domain.name })), [domains]);

  const mapApiArticle = (a: any): KnowledgeItem => ({
    id: a.id,
    type: (a.type?.toUpperCase() === 'POLICY' ? 'POLICY' :
           a.type?.toUpperCase() === 'ARTICLE' ? 'ARTICLE' :
           a.type?.toUpperCase() === 'SNIPPET' ? 'SNIPPET' : 'PLAYBOOK') as KnowledgeItem['type'],
    title: a.title || 'Untitled',
    category: a.domain_name || a.domain || a.category || 'General',
    visibility: a.visibility === 'internal' ? 'Internal' : 'Public',
    status: a.status === 'published' ? 'Published' : 'Draft',
    owner: a.owner_name || 'Unknown',
    ownerInitials: (a.owner_name || 'UN').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase(),
    lastUpdated: a.updated_at ? new Date(a.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-',
    health: a.health === 'stale' ? 'Stale' : 'OK',
  });

  const library = Array.isArray(apiArticles) ? apiArticles.map(mapApiArticle) : [];
  const isInitialLibraryLoading = articlesLoading && library.length === 0;
  const isSelectedArticleLoading = Boolean(selectedArticleId && selectedArticleLoading && !selectedArticle);

  useEffect(() => {
    const source = selectedArticle;

    if (selectedArticleId && source) {
      setDraft({
        title: source.title || '',
        content: typeof source.content === 'string' ? source.content : asString(source.content ?? ''),
        type: (source.type?.toString?.().toUpperCase?.() || 'ARTICLE') as KnowledgeItem['type'],
        status: source.status === 'published' ? 'Published' : 'Draft',
        domainId: source.domain_id || '',
        ownerUserId: source.owner_user_id || '',
        reviewCycleDays: String(source.review_cycle_days ?? 90),
      });
      return;
    }

    if (editorOpen && editorMode === 'create') {
      setDraft(emptyDraft);
    }
  }, [editorMode, editorOpen, selectedArticle, selectedArticleId]);

  const articleData = selectedArticle
    ? {
        id: selectedArticle.id,
        title: selectedArticle.title || 'Untitled',
        type: (selectedArticle.type || 'article').toString().toUpperCase(),
        owner: selectedArticle.owner_name || 'Unknown',
        ownerUserId: selectedArticle.owner_user_id || '',
        ownerInitials: (selectedArticle.owner_name || 'UN')
          .split(' ')
          .map((n: string) => n[0])
          .join('')
          .substring(0, 2)
          .toUpperCase(),
        lastUpdated: selectedArticle.updated_at
          ? new Date(selectedArticle.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : '-',
        domain: selectedArticle.domain_name || 'General',
        domainId: selectedArticle.domain_id || '',
        scope: selectedArticle.status === 'published' ? 'Published' : 'Draft',
        reviewOwner: selectedArticle.owner_name || 'Unknown',
        reviewCycleDays: selectedArticle.review_cycle_days ?? 90,
        content: typeof selectedArticle.content === 'string' ? selectedArticle.content : asString(selectedArticle.content ?? ''),
        sheet: normalizeSheet(selectedArticle.content_structured, String(selectedArticle.content ?? '')),
        linkedWorkflows: Array.isArray(selectedArticle.linked_workflow_ids) ? selectedArticle.linked_workflow_ids : [],
        linkedApprovals: Array.isArray(selectedArticle.linked_approval_policy_ids) ? selectedArticle.linked_approval_policy_ids : [],
      }
    : null;

  const openCreateEditor = () => {
    setEditorMode('create');
    setDraft(emptyDraft);
    setEditorOpen(true);
  };

  const openEditEditor = () => {
    setEditorMode('edit');
    setEditorOpen(true);
  };

  const handleSaveArticle = async () => {
    if (!draft.title.trim() || !draft.content.trim()) return;

    const existingSheet = selectedArticle ? normalizeSheet(selectedArticle.content_structured, String(selectedArticle.content ?? '')) : null;
    const contentStructured = buildKnowledgeSheetFromNarrative(draft.content, existingSheet);
    const linkedWorkflowIds = selectedArticle && Array.isArray(selectedArticle.linked_workflow_ids)
      ? selectedArticle.linked_workflow_ids
      : [];
    const linkedApprovalPolicyIds = selectedArticle && Array.isArray(selectedArticle.linked_approval_policy_ids)
      ? selectedArticle.linked_approval_policy_ids
      : [];

    const payload = {
      title: draft.title,
      content: draft.content,
      type: draft.type.toLowerCase(),
      status: draft.status === 'Published' ? 'published' : 'draft',
      domain_id: draft.domainId || null,
      owner_user_id: draft.ownerUserId || null,
      review_cycle_days: Number(draft.reviewCycleDays) || 90,
      content_structured: contentStructured,
      linked_workflow_ids: linkedWorkflowIds,
      linked_approval_policy_ids: linkedApprovalPolicyIds,
    };

    if (editorMode === 'create') {
      const created = await createArticle.mutate(payload);
      if (created?.id) {
        setSelectedArticleId(created.id);
      }
    } else if (selectedArticleId) {
      await updateArticle.mutate({
        id: selectedArticleId,
        body: payload,
      });
    }

    setEditorOpen(false);
    refetch();
    refetchSelectedArticle();
  };

  const handlePublishSelected = async () => {
    if (!selectedArticleId) return;
    await publishArticle.mutate(selectedArticleId);
    refetch();
    refetchSelectedArticle();
  };

  const renderLibrary = () => (
    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6">
      <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden flex flex-col relative">
        {isInitialLibraryLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/75 dark:bg-gray-950/75 backdrop-blur-sm">
            <LoadingState
              title="Loading knowledge"
              message="Fetching live knowledge articles from Supabase."
              compact
            />
          </div>
        )}
        {/* Header / Search / Filters */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-4 bg-gray-50/50 dark:bg-gray-800/20">
          <div className="relative w-64 flex-shrink-0">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-gray-400 text-lg">search</span>
            </span>
            <input 
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" 
              placeholder="Search knowledge..." 
              type="text"
            />
          </div>
          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1"></div>
          {['Type', 'Category', 'Status', 'Visibility', 'Owner'].map(filter => (
            <button key={filter} className="flex items-center px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm">
              {filter}
              <span className="material-symbols-outlined text-gray-400 text-sm ml-1">arrow_drop_down</span>
            </button>
          ))}
          <div className="flex-1"></div>
          <button className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
            <span className="material-symbols-outlined text-lg">filter_list</span>
          </button>
        </div>
        <div className="flex-1 overflow-auto min-h-[420px]">
          <table className="w-full border-collapse">
            <thead className="bg-white dark:bg-card-dark sticky top-0 z-10">
              <tr className="text-left border-b border-gray-100 dark:border-gray-800">
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest w-8">
                  <input className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900" type="checkbox"/>
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Title</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Category</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Visibility</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Owner</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
              {library.map((item) => (
                <tr 
                  key={item.id} 
                  className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors cursor-pointer"
                  onClick={() => setSelectedArticleId(item.id)}
                >
                  <td className="px-6 py-4 w-8">
                    <input className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900" type="checkbox" onClick={(e) => e.stopPropagation()}/>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold mr-3 border uppercase tracking-wider ${
                        item.type === 'POLICY' ? 'bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800' :
                        item.type === 'ARTICLE' ? 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800' :
                        item.type === 'SNIPPET' ? 'bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800' :
                        'bg-teal-50 text-teal-700 border-teal-100 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800'
                      }`}>
                        {item.type}
                      </span>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{item.title}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400">{item.category}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center text-xs text-gray-600 dark:text-gray-300 font-medium">
                      <span className="material-symbols-outlined text-base mr-1.5 text-gray-400">
                        {item.visibility === 'Public' ? 'public' : 'lock'}
                      </span>
                      {item.visibility}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider ${
                      item.status === 'Published' ? 'text-green-600' : 'text-gray-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                        item.status === 'Published' ? 'bg-green-500' : 'bg-gray-400'
                      }`}></span>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="h-6 w-6 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 flex items-center justify-center text-[10px] font-bold mr-2">{item.ownerInitials}</div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{item.owner}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`flex items-center text-[10px] font-bold uppercase tracking-wider ${
                      item.health === 'OK' ? 'text-green-600' : 'text-red-500'
                    }`}>
                      <span className="material-symbols-outlined text-sm mr-1">
                        {item.health === 'OK' ? 'check_circle' : 'warning'}
                      </span>
                      {item.health}
                    </span>
                  </td>
                </tr>
              ))}
              {!isInitialLibraryLoading && library.length === 0 && (
                <tr>
                  <td className="px-6 py-10 text-sm text-gray-500 dark:text-gray-400" colSpan={7}>
                    No knowledge articles found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderArticleDetail = () => {
    if (isSelectedArticleLoading) {
      return (
        <div className="flex-1 flex items-center justify-center px-8 py-12 bg-white dark:bg-background-dark">
          <LoadingState title="Loading article" message="Fetching live article content from Supabase." />
        </div>
      );
    }

    if (!articleData) return null;

    const liveDraft = {
      title: draft.title || articleData.title,
      content: draft.content || articleData.content,
      type: draft.type || (articleData.type as KnowledgeItem['type']),
      status: draft.status || articleData.scope,
      domainId: draft.domainId || articleData.domainId,
      ownerUserId: draft.ownerUserId || articleData.ownerUserId,
      reviewCycleDays: draft.reviewCycleDays || String(articleData.reviewCycleDays),
    };

    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-background-dark">
        <div className="flex items-center gap-3 px-8 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-card-dark flex-shrink-0">
          <button
            onClick={() => setSelectedArticleId(null)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            Back to library
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">Knowledge sheet</p>
            <h2 className="mt-1 truncate text-lg font-semibold text-gray-900 dark:text-white">{liveDraft.title}</h2>
          </div>
          <button
            onClick={handleSaveArticle}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <span className="material-symbols-outlined text-lg">save</span>
            Save
          </button>
          <button onClick={handlePublishSelected} className="inline-flex items-center gap-2 rounded-lg bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200">
            <span className="material-symbols-outlined text-lg">publish</span>
            Publish
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-8 py-8">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
              <span className="rounded-md border border-gray-200 dark:border-gray-700 px-2 py-1">{liveDraft.type}</span>
              <span className="rounded-md border border-gray-200 dark:border-gray-700 px-2 py-1">{liveDraft.status}</span>
              <span className="rounded-md border border-gray-200 dark:border-gray-700 px-2 py-1">Review {liveDraft.reviewCycleDays}d</span>
              <span className="rounded-md border border-gray-200 dark:border-gray-700 px-2 py-1">#{articleData.id}</span>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Title</span>
                <input
                  value={liveDraft.title}
                  onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                  className="w-full border-0 border-b border-gray-200 bg-transparent px-0 py-2 text-3xl font-semibold tracking-tight text-gray-900 outline-none transition-colors placeholder:text-gray-300 focus:border-black dark:border-gray-700 dark:text-white dark:focus:border-white"
                />
              </label>
              <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                <span>Owner: {articleData.owner}</span>
                <span>Domain: {articleData.domain}</span>
                <span>Updated: {articleData.lastUpdated}</span>
                <span>Owner ID: {liveDraft.ownerUserId || '—'}</span>
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Policy narrative</span>
              <textarea
                value={liveDraft.content}
                onChange={(e) => setDraft((prev) => ({ ...prev, content: e.target.value }))}
                rows={22}
                className="min-h-[55vh] w-full rounded-xl border border-gray-200 bg-white px-5 py-4 text-sm leading-7 text-gray-800 outline-none transition-colors placeholder:text-gray-300 focus:border-black dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-white"
                placeholder="Write the policy as a narrative. The structured sheet is derived from this text."
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <p>This body is what the agents read first. The structured sheet is derived from the same text.</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDraft((prev) => ({ ...prev, status: 'Draft' }))}
                  className={`rounded-lg border px-3 py-2 font-medium transition-colors ${
                    liveDraft.status === 'Draft'
                      ? 'border-gray-900 text-gray-900 dark:border-white dark:text-white'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  Draft
                </button>
                <button
                  onClick={() => setDraft((prev) => ({ ...prev, status: 'Published' }))}
                  className={`rounded-lg border px-3 py-2 font-medium transition-colors ${
                    liveDraft.status === 'Published'
                      ? 'border-gray-900 text-gray-900 dark:border-white dark:text-white'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  Published
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );

    const Section = ({ title, items, tone = 'gray' }: { title: string; items: string[]; tone?: 'gray' | 'emerald' | 'amber' | 'rose' }) => (
      <section className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-card-dark p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{title}</h3>
          <span className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${
            tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' :
            tone === 'amber' ? 'text-amber-600 dark:text-amber-400' :
            tone === 'rose' ? 'text-rose-600 dark:text-rose-400' :
            'text-gray-400'
          }`}>{items.length} items</span>
        </div>
        {items.length > 0 ? (
          <ul className="mt-4 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            {items.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-gray-500 flex-shrink-0" />
                <span className="leading-6">{item}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-4 text-sm text-gray-400 dark:text-gray-500">No entries yet.</p>}
      </section>
    );

    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-background-dark">
        <div className="flex items-center gap-3 px-8 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-card-dark flex-shrink-0">
          <button
            onClick={() => setSelectedArticleId(null)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            Back to library
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">Knowledge sheet</p>
            <h2 className="mt-1 truncate text-lg font-semibold text-gray-900 dark:text-white">{articleData.title}</h2>
          </div>
          <button onClick={openEditEditor} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
            <span className="material-symbols-outlined text-lg">edit</span>
            Edit
          </button>
          <button onClick={handlePublishSelected} className="inline-flex items-center gap-2 rounded-lg bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200">
            <span className="material-symbols-outlined text-lg">publish</span>
            Publish
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="w-full px-8 py-8 space-y-6">
            <section className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-card-dark p-6">
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                <span className="rounded-md border border-gray-200 dark:border-gray-700 px-2 py-1">{articleData.type}</span>
                <span className="rounded-md border border-gray-200 dark:border-gray-700 px-2 py-1">{articleData.scope}</span>
                <span className="rounded-md border border-gray-200 dark:border-gray-700 px-2 py-1">Review {articleData.reviewCycleDays}d</span>
                <span className="rounded-md border border-gray-200 dark:border-gray-700 px-2 py-1">#{articleData.id}</span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-4 text-sm">
                <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">Owner</p>
                  <p className="mt-2 font-medium text-gray-900 dark:text-white">{articleData.owner}</p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">Domain</p>
                  <p className="mt-2 font-medium text-gray-900 dark:text-white">{articleData.domain}</p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">Updated</p>
                  <p className="mt-2 font-medium text-gray-900 dark:text-white">{articleData.lastUpdated}</p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">Owner ID</p>
                  <p className="mt-2 font-medium text-gray-900 dark:text-white">{articleData.ownerUserId || '—'}</p>
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-card-dark p-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">Summary</p>
                <p className="mt-3 text-sm leading-6 text-gray-700 dark:text-gray-300">{articleData.sheet.summary}</p>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-card-dark p-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">Policy statement</p>
                <p className="mt-3 text-sm leading-6 text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{articleData.sheet.policy}</p>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <Section title="Allowed" items={articleData.sheet.allowed} tone="emerald" />
              <Section title="Blocked" items={articleData.sheet.blocked} tone="rose" />
              <Section title="Escalation" items={articleData.sheet.escalation} tone="amber" />
              <Section title="Evidence" items={articleData.sheet.evidence} />
              <Section title="Agent notes" items={articleData.sheet.agent_notes} />
              <Section title="Examples" items={articleData.sheet.examples} />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-card-dark p-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">Linked workflows</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {articleData.linkedWorkflows.length ? articleData.linkedWorkflows.map((wf: string) => (
                    <span key={wf} className="rounded-md border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs text-gray-700 dark:text-gray-300">{wf}</span>
                  )) : <p className="text-sm text-gray-400">No linked workflows.</p>}
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-card-dark p-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">Linked approvals</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {articleData.linkedApprovals.length ? articleData.linkedApprovals.map((approval: string) => (
                    <span key={approval} className="rounded-md border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs text-gray-700 dark:text-gray-300">{approval}</span>
                  )) : <p className="text-sm text-gray-400">No linked approvals.</p>}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-card-dark p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">Raw content</p>
                  <p className="mt-1 text-sm text-gray-500">This is the body the agent can cite directly.</p>
                </div>
                <button className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300">Copy</button>
              </div>
              <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 p-4 text-sm leading-6 text-gray-700 dark:text-gray-300">{articleData.content}</pre>
            </section>
          </div>
        </div>
      </div>
    );
  };


  const renderGaps = () => (
    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-8">
      <div className="grid grid-cols-4 gap-6">
        {[
          { label: 'Unanswered', value: '18', icon: 'help_outline', color: 'orange' },
          { label: 'Escalations', value: '12', icon: 'warning', color: 'red' },
          { label: 'Conflicts', value: '3', icon: 'compare_arrows', color: 'amber' },
          { label: 'Top Failing', value: 'Billing', icon: 'trending_down', color: 'purple' },
        ].map(stat => (
          <div key={stat.label} className="bg-white dark:bg-card-dark p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{stat.label}</div>
              <div className="text-2xl font-semibold text-gray-900 dark:text-white">{stat.value}</div>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              stat.color === 'orange' ? 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400' :
              stat.color === 'red' ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' :
              stat.color === 'amber' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' :
              'bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400'
            }`}>
              <span className="material-symbols-outlined text-xl">{stat.icon}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-8 space-y-8">
          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Missing Topics</h2>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 px-2 py-1 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 shadow-sm">Sorted by Impact</span>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {[
                { title: 'Refund annual plan after 10 days', impact: 'Critical', queries: '42 queries', sub: 'No valid sources found', cat: 'Billing/Refunds' },
                { title: 'Transfer ownership of workspace', impact: 'High', queries: '28 queries', sub: 'Low confidence match', cat: 'Account Mgmt' },
                { title: 'API Rate limiting errors (429)', impact: 'Medium', queries: '15 queries', sub: 'Outdated documentation', cat: 'Developer Docs' },
                { title: 'iOS App crashing on login', impact: 'Medium', queries: '12 queries', sub: 'No valid sources found', cat: 'Mobile Support' },
              ].map((topic, i) => (
                <div key={i} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{topic.title}</h3>
                    <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                      topic.impact === 'Critical' ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400 border border-red-100 dark:border-red-500/20' :
                      topic.impact === 'High' ? 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400 border border-orange-100 dark:border-orange-500/20' :
                      'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
                    }`}>{topic.impact}</span>
                  </div>
                  <div className="flex items-center gap-6 text-xs text-gray-500 dark:text-gray-400 mb-5">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">forum</span>
                      {topic.queries}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">error</span>
                      {topic.sub}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">folder</span>
                      Suggested: {topic.cat}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-indigo-700 transition-all shadow-sm flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px]">edit_note</span>
                      Create Draft
                    </button>
                    <button className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px]">person_add</span>
                      Assign Owner
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
              <button className="w-full text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">Load more gaps</button>
            </div>
          </section>
        </div>

        <div className="col-span-4 space-y-8">
          <section className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 p-6 rounded-2xl shadow-sm">
            <div className="flex items-start gap-4 mb-5">
              <div className="p-2 bg-amber-100 dark:bg-amber-800/30 rounded-xl text-amber-600 dark:text-amber-500">
                <span className="material-symbols-outlined">gpp_maybe</span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Quality Alert</h3>
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-1.5 leading-relaxed">3 articles contain conflicting information about "Return Windows".</p>
              </div>
            </div>
            <button className="w-full py-2.5 bg-white dark:bg-gray-800 text-amber-700 dark:text-amber-400 text-xs font-semibold rounded-xl border border-amber-200 dark:border-amber-700 shadow-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all">Review Conflicts</button>
          </section>

          <section className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-700 rounded-2xl shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Problem Articles</h3>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Last 7 days</span>
            </div>
            <div className="p-6 space-y-5">
              {[
                { title: 'How to reset 2FA settings', val: '24%', sub: 'Re-opened rate', trend: '+5%', up: true },
                { title: 'Understanding your invoice', val: '18%', sub: 'Negative feedback', trend: '+2%', up: true },
                { title: 'Setting up custom domains', val: '15%', sub: 'Unclear rating', trend: '--', up: null },
                { title: 'Canceling during trial', val: '12%', sub: 'Re-opened rate', trend: '-1%', up: false },
              ].map((art, i) => (
                <div key={i} className="pb-5 border-b border-gray-100 dark:border-gray-800 last:border-0 last:pb-0">
                  <div className="flex justify-between items-start mb-1.5">
                    <a href="#" className="text-sm font-medium text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors line-clamp-1">{art.title}</a>
                    <span className="text-sm font-semibold text-red-600 dark:text-red-400">{art.val}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
                    <span>{art.sub}</span>
                    <span className={`flex items-center font-medium ${art.up === true ? 'text-red-600 dark:text-red-400' : art.up === false ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                      {art.up !== null && (
                        <span className="material-symbols-outlined text-[14px] mr-1">{art.up ? 'arrow_upward' : 'arrow_downward'}</span>
                      )}
                      {art.trend}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
              <button className="w-full text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">View all problem articles</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );

  const renderTest = () => (
    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-8">
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="p-8">
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3">Simulate a user query</label>
          <div className="relative flex items-center">
            <span className="absolute left-5 text-gray-400 material-symbols-outlined text-2xl">search</span>
            <input 
              className="w-full pl-14 pr-32 py-4 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-lg font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all dark:text-white shadow-sm" 
              placeholder="Ask a question..." 
              type="text" 
              defaultValue="refund annual plan"
            />
            <button className="absolute right-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold text-sm hover:bg-indigo-700 transition-all shadow-sm">Run Test</button>
          </div>
          <div className="flex items-center mt-4 gap-3">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Popular tests:</span>
            <button className="text-xs font-medium bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">How to reset password?</button>
            <button className="text-xs font-medium bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all">Shipping policy</button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-8 space-y-8">
          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-indigo-500 text-lg">manage_search</span>
                Retrieved Context
              </h2>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-2.5 py-1 rounded-md border border-gray-200 dark:border-gray-700 shadow-sm">3 sources found</span>
            </div>
            <div className="p-6 space-y-6">
              {[
                { title: 'Refund Policy - Annual Subscriptions', match: '98%', type: 'description', color: 'blue', sub: 'Updated 2 days ago • Public Library', content: '...customers on an annual plan are eligible for a full refund if the request is made within 30 days of the renewal date. Pro-rated refunds are available after this period...' },
                { title: 'Billing FAQ Snippet', match: '85%', type: 'segment', color: 'purple', sub: 'Snippet • Internal Only', content: "To process a refund for annual plans, use the Stripe dashboard. Ensure the 'prorate' option is unchecked if it's within the 30-day window." },
                { title: 'Ticket #9021 Guidance', match: '62%', type: 'confirmation_number', color: 'orange', sub: 'Past Ticket Resolution', content: 'User asked about cancelling annual plan. Agent explained that refunds are not automatic and require manual approval from finance.' },
              ].map((source, i) => (
                <div key={i} className="bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:border-indigo-500/30 transition-all cursor-pointer group relative">
                  <div className="absolute top-4 right-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400 border border-green-100 dark:border-green-500/20">
                      {source.match} Match
                    </span>
                  </div>
                  <div className="flex items-start gap-4 mb-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      source.color === 'blue' ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' :
                      source.color === 'purple' ? 'bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400' :
                      'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400'
                    }`}>
                      <span className="material-symbols-outlined">{source.type}</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{source.title}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{source.sub}</p>
                    </div>
                  </div>
                  <div className="pl-14">
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                      {source.content}
                    </p>
                    <button className="mt-4 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors flex items-center gap-1.5">
                      Open in Library <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="col-span-4">
          <div className="sticky top-6 space-y-8">
            <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-purple-600 text-lg">smart_toy</span>
                  Simulated Answer
                </h2>
              </div>
              <div className="p-6">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                    Based on the policy, customers on an annual plan are eligible for a <strong className="text-gray-900 dark:text-white">full refund</strong> if they request it within 30 days of the renewal date <span className="inline-flex align-top justify-center items-center w-4 h-4 rounded-full bg-gray-100 dark:bg-gray-800 text-[10px] text-gray-500 font-medium cursor-pointer hover:bg-indigo-600 hover:text-white transition-all ml-0.5">1</span>.
                  </p>
                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-4">
                    If the request is outside this window, pro-rated refunds may be available. You should process this via the Stripe dashboard, ensuring 'prorate' is unchecked for full refunds <span className="inline-flex align-top justify-center items-center w-4 h-4 rounded-full bg-gray-100 dark:bg-gray-800 text-[10px] text-gray-500 font-medium cursor-pointer hover:bg-indigo-600 hover:text-white transition-all ml-0.5">2</span>.
                  </p>
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 p-6 border-t border-gray-100 dark:border-gray-800">
                <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3">Citations used</h4>
                <div className="space-y-2">
                  {[
                    { id: 1, title: 'Refund Policy - Annual Subscriptions' },
                    { id: 2, title: 'Billing FAQ Snippet' },
                  ].map(cite => (
                    <div key={cite.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-indigo-500/30 transition-all cursor-pointer group shadow-sm">
                      <div className="w-5 h-5 rounded-md bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-[10px] font-semibold text-gray-600 dark:text-gray-400 group-hover:bg-indigo-600 group-hover:text-white transition-all">{cite.id}</div>
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{cite.title}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Response time: 0.8s</div>
                  <div className="flex gap-1">
                    <button className="p-1.5 text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors rounded-lg hover:bg-green-50 dark:hover:bg-green-500/10"><span className="material-symbols-outlined text-[18px]">thumb_up</span></button>
                    <button className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10"><span className="material-symbols-outlined text-[18px]">thumb_down</span></button>
                  </div>
                </div>
              </div>
            </section>
            
            <section className="bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-2xl p-6 shadow-sm">
              <div className="flex gap-4">
                <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 text-xl">info</span>
                <div>
                  <p className="text-sm font-medium text-indigo-900 dark:text-indigo-200 leading-relaxed">Not seeing the right result? Try adding more synonyms to the document metadata in the Library.</p>
                  <button className="mt-3 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">Go to Library Settings &rarr;</button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">
        <AnimatePresence mode="wait">
        {selectedArticleId ? (
          <motion.div
            key="article"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {renderArticleDetail()}
          </motion.div>
        ) : (
          <motion.div
            key="main"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {/* Main Header */}
            <div className="p-6 pb-0 flex-shrink-0 z-20">
              <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card">
                <div className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Knowledge</h1>
                    <p className="text-xs text-gray-500 mt-0.5">Create and maintain content the AI can cite</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center px-3 py-1 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-2"></span>
                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest">AI citations required</span>
                    </div>
                    <div className="flex items-center px-3 py-1 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 mr-2"></span>
                      <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 uppercase tracking-widest">Stale items: 6</span>
                    </div>
                    <div className="relative group">
                      <button
                        onClick={openCreateEditor}
                        className="px-6 py-2.5 bg-black dark:bg-white text-white dark:text-black text-xs font-bold rounded-xl hover:opacity-90 transition-all shadow-xl flex items-center gap-2"
                      >
                        Create
                        <span className="material-symbols-outlined text-lg">arrow_drop_down</span>
                      </button>
                    </div>
                  </div>
                </div>
                <div className="px-6 flex items-center space-x-8 border-t border-gray-100 dark:border-gray-800 pt-3">
                  {(['library', 'gaps', 'test'] as KnowledgeTab[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`pb-3 text-sm transition-colors border-b-2 ${
                        activeTab === tab
                          ? 'font-bold text-gray-900 dark:text-white border-black dark:border-white'
                          : 'font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border-transparent hover:border-gray-300'
                      }`}
                    >
                      {tab.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ').replace('Ai ', 'AI ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {activeTab === 'library' && renderLibrary()}
              {activeTab === 'gaps' && renderGaps()}
              {activeTab === 'test' && renderTest()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
      <AnimatePresence>
        {editorOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6"
          >
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="w-full max-w-5xl rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-card-dark shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-6 py-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {editorMode === 'create' ? 'Create Knowledge Article' : 'Edit Knowledge Article'}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    This writes directly to the backend knowledge library.
                  </p>
                </div>
                <button
                  onClick={() => setEditorOpen(false)}
                  className="rounded-lg p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="space-y-6 px-6 py-5 max-h-[78vh] overflow-y-auto custom-scrollbar">
                <div className="grid gap-4 lg:grid-cols-3">
                  <label className="lg:col-span-2">
                    <span className="mb-2 block text-xs font-semibold text-gray-600 dark:text-gray-300">Title</span>
                    <input
                      value={draft.title}
                      onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </label>
                  <label>
                    <span className="mb-2 block text-xs font-semibold text-gray-600 dark:text-gray-300">Type</span>
                    <select
                      value={draft.type}
                      onChange={(e) => setDraft((prev) => ({ ...prev, type: e.target.value as KnowledgeItem['type'] }))}
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-900 dark:text-white outline-none"
                    >
                      <option value="ARTICLE">Article</option>
                      <option value="POLICY">Policy</option>
                      <option value="SNIPPET">Snippet</option>
                      <option value="PLAYBOOK">Playbook</option>
                    </select>
                  </label>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <label>
                    <span className="mb-2 block text-xs font-semibold text-gray-600 dark:text-gray-300">Domain</span>
                    <select
                      value={draft.domainId}
                      onChange={(e) => setDraft((prev) => ({ ...prev, domainId: e.target.value }))}
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-900 dark:text-white outline-none"
                    >
                      <option value="">General</option>
                      {domainOptions.map((domain: any) => <option key={domain.id} value={domain.id}>{domain.name}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="mb-2 block text-xs font-semibold text-gray-600 dark:text-gray-300">Owner user id</span>
                    <input
                      value={draft.ownerUserId}
                      onChange={(e) => setDraft((prev) => ({ ...prev, ownerUserId: e.target.value }))}
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20"
                      placeholder="user_alex"
                    />
                  </label>
                  <label>
                    <span className="mb-2 block text-xs font-semibold text-gray-600 dark:text-gray-300">Review cycle days</span>
                    <input
                      type="number"
                      min="7"
                      value={draft.reviewCycleDays}
                      onChange={(e) => setDraft((prev) => ({ ...prev, reviewCycleDays: e.target.value }))}
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-gray-600 dark:text-gray-300">Narrative policy body</span>
                  <textarea
                    value={draft.content}
                    onChange={(e) => setDraft((prev) => ({ ...prev, content: e.target.value }))}
                    rows={16}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-4 text-sm leading-7 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="Write the policy as a narrative. Optional section headings can still be parsed into the structured sheet."
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-gray-600 dark:text-gray-300">Status</span>
                  <select
                    value={draft.status}
                    onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value as 'Published' | 'Draft' }))}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-900 dark:text-white outline-none"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Published">Published</option>
                  </select>
                </label>
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-gray-100 dark:border-gray-800 px-6 py-4">
                <button
                  onClick={() => setEditorOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveArticle}
                  className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
                >
                  {editorMode === 'create' ? 'Create' : 'Save changes'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
