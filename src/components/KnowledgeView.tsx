import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { connectionCategories } from '../connectionsData';
import { agentsApi } from '../api/client';
import { useApi, useMutation } from '../api/hooks';
import { cloneJson, ensureArray, ensureBoolean, mergeProfile } from './aiStudioProfileUtils';
import { MinimalButton } from './MinimalCategoryShell';
import StyledSelect from './StyledSelect';

type AccessLevel = 'No access' | 'Metadata only' | 'Read summaries only' | 'Read raw documents' | 'Read + extract' | 'Approval required';
type SensitiveRule = 'Hidden completely' | 'Masked' | 'Summary only' | 'View with approval' | 'Never accessible';
type FieldVisibility = 'Visible' | 'Masked' | 'Summary only' | 'Hidden' | 'Approval required';

type KnowledgeProfileState = {
  source_access: Record<string, AccessLevel>;
  sensitive_rules: Record<string, SensitiveRule>;
  field_visibility: Record<string, FieldVisibility>;
  source_categories: Array<{ name: string; sources: string[] }>;
  sensitive_data_types: string[];
  field_visibility_items: string[];
  global_access_level: string;
  document_status: string;
  include_internal_notes: boolean;
  include_attachments: boolean;
  include_historical_conversations: boolean;
  block_admin_notes: boolean;
  block_finance_docs: boolean;
  block_legal_docs: boolean;
  archived_records: string;
  search_depth: string;
  historical_lookup_depth: string;
  cross_system_context: boolean;
  internal_references: boolean;
  trusted_source_priority: string[];
  trusted_source_flags: { internalNotesLowPriority: boolean; draftDocsExcluded: boolean; adminContentNeverPrioritized: boolean };
  access_conditions: string[];
  hard_blocks: string[];
};

const sourceCategories = [
  { name: 'Internal Knowledge Base', sources: ['Policies', 'SOPs / playbooks', 'Help center / macros'] },
  { name: 'Customer Data', sources: ['Customer profiles', 'Tickets & conversations', 'Internal notes'] },
  { name: 'Commerce Data', sources: ['Orders', 'Payments', 'Returns', 'Shipping'] },
  { name: 'System & Admin', sources: ['Analytics / reporting', 'Admin-only content', 'Attachments / uploaded files'] },
];
const sensitiveDataTypes = ['Personally Identifiable Information (PII)', 'Payment-related information', 'Fraud signals & risk notes', 'Legal & compliance data', 'Employee-only notes', 'Strategic internal documentation'];
const fieldVisibilityItems = ['Customer full name', 'Address & phone', 'Order total & payment method', 'Refund amount & history', 'Risk flags & internal tags', 'Assigned agent notes'];
const defaultKnowledgeProfile: KnowledgeProfileState = {
  source_access: {},
  sensitive_rules: {},
  field_visibility: {},
  source_categories: sourceCategories,
  sensitive_data_types: sensitiveDataTypes,
  field_visibility_items: fieldVisibilityItems,
  global_access_level: 'Limited access',
  document_status: 'Final documents only',
  include_internal_notes: true,
  include_attachments: false,
  include_historical_conversations: true,
  block_admin_notes: true,
  block_finance_docs: true,
  block_legal_docs: true,
  archived_records: 'Allowed',
  search_depth: 'Only directly linked sources',
  historical_lookup_depth: 'Last 30 days',
  cross_system_context: true,
  internal_references: false,
  trusted_source_priority: ['Policies', 'SOPs / playbooks', 'Ticket context'],
  trusted_source_flags: { internalNotesLowPriority: true, draftDocsExcluded: true, adminContentNeverPrioritized: true },
  access_conditions: [
    'Allow raw order data only for live order issues',
    'Allow customer history only if case severity is high',
    'Allow policy attachments only with approval',
  ],
  hard_blocks: ['Legal investigation docs', 'Payment credentials', 'Admin-only internal discussions', 'Security incidents'],
};

function createKnowledgeProfile(persisted?: Record<string, any> | null): KnowledgeProfileState {
  const merged = mergeProfile(defaultKnowledgeProfile, persisted);
  return {
    ...merged,
    source_categories: ensureArray<any>(merged.source_categories, sourceCategories),
    sensitive_data_types: ensureArray<string>(merged.sensitive_data_types, sensitiveDataTypes),
    field_visibility_items: ensureArray<string>(merged.field_visibility_items, fieldVisibilityItems),
    trusted_source_priority: ensureArray<string>(merged.trusted_source_priority, defaultKnowledgeProfile.trusted_source_priority),
    access_conditions: ensureArray<string>(merged.access_conditions, defaultKnowledgeProfile.access_conditions),
    hard_blocks: ensureArray<string>(merged.hard_blocks, defaultKnowledgeProfile.hard_blocks),
    trusted_source_flags: {
      internalNotesLowPriority: ensureBoolean(merged.trusted_source_flags?.internalNotesLowPriority, true),
      draftDocsExcluded: ensureBoolean(merged.trusted_source_flags?.draftDocsExcluded, true),
      adminContentNeverPrioritized: ensureBoolean(merged.trusted_source_flags?.adminContentNeverPrioritized, true),
    },
  };
}

export default function KnowledgeView() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>('Supervisor');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [statusMessage, setStatusMessage] = useState('');
  const { data: apiAgents, refetch } = useApi(agentsApi.list, [], []);
  const saveDraft = useMutation((payload: { id: string; body: Record<string, any> }) => agentsApi.updatePolicyDraft(payload.id, payload.body));
  const publishDraft = useMutation((id: string) => agentsApi.publishPolicyDraft(id));
  const rollbackDraft = useMutation((id: string) => agentsApi.rollbackPolicy(id));

  const allAgents = connectionCategories.flatMap(c => c.agents);
  const currentAgent = allAgents.find(a => a.name === selectedAgent);
  const selectedApiAgent = apiAgents?.find((agent: any) => agent.name === selectedAgent);
  const { data: draftBundle, refetch: refetchBundle } = useApi(
    () => (selectedApiAgent ? agentsApi.policyDraft(selectedApiAgent.id) : Promise.resolve(null as any)),
    [selectedApiAgent?.id],
    null as any,
  );
  const [profile, setProfile] = useState<KnowledgeProfileState>(defaultKnowledgeProfile);

  useEffect(() => {
    const persisted = draftBundle?.bundle?.knowledge_profile ?? selectedApiAgent?.knowledge_profile ?? null;
    setProfile(createKnowledgeProfile(persisted));
  }, [draftBundle, selectedApiAgent]);

  const saveAndRefresh = async (publish = false) => {
    if (!selectedApiAgent) return;
    await saveDraft.mutate({ id: selectedApiAgent.id, body: { knowledge_profile: cloneJson(profile) } });
    if (publish) await publishDraft.mutate(selectedApiAgent.id);
    refetch();
    refetchBundle();
    setStatusMessage(publish ? 'Knowledge profile published to the runtime.' : 'Knowledge draft saved.');
  };

  const handleRollback = async () => {
    if (!selectedApiAgent) return;
    await rollbackDraft.mutate(selectedApiAgent.id);
    refetch();
    refetchBundle();
    setStatusMessage('Knowledge draft reset to the last published version.');
  };

  const filteredCategories = connectionCategories.map(category => ({
    ...category,
    agents: category.agents.filter(agent => {
      const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = activeFilter === 'All' ? true : activeFilter === 'Active' ? agent.active : activeFilter === 'Restricted' ? agent.locked : !agent.active;
      return matchesSearch && matchesFilter;
    }),
  })).filter(c => c.agents.length > 0);

  const sourceEnabledCount = useMemo(() => Object.values(profile.source_access).filter(v => v && v !== 'No access').length, [profile]);
  const restrictedCount = useMemo(() => Object.values(profile.source_access).filter(v => v === 'Approval required' || v === 'Metadata only').length, [profile]);
  const sensitiveCount = useMemo(() => Object.values(profile.sensitive_rules).filter(v => v && v !== 'Hidden completely').length, [profile]);
  const blockedCount = useMemo(() => Object.values(profile.field_visibility).filter(v => v === 'Hidden' || v === 'Approval required').length, [profile]);

  return (
    <motion.div key="knowledge" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex gap-6 h-full">
      <div className="w-80 flex-shrink-0 flex flex-col h-full overflow-hidden border-r border-gray-200 dark:border-gray-800 pr-4">
        <div className="space-y-4 mb-6">
          <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-lg">search</span><input type="text" placeholder="Search agents..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" /></div>
          <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700">{['All', 'Active', 'Restricted', 'Draft'].map(filter => <button key={filter} onClick={() => setActiveFilter(filter)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeFilter === filter ? 'bg-black dark:bg-white text-white dark:text-black shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>{filter}</button>)}</div>
        </div>
        <div className="flex-1 overflow-y-auto space-y-8 pb-12 pr-2 custom-scrollbar">{filteredCategories.map((category, catIdx) => <div key={catIdx} className="space-y-4"><h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">{category.category}</h3><div className="space-y-3">{category.agents.map((agent, agentIdx) => <div key={agentIdx} onClick={() => setSelectedAgent(agent.name)} className={`bg-white dark:bg-card-dark border rounded-2xl transition-all cursor-pointer ${selectedAgent === agent.name ? 'border-indigo-500 ring-1 ring-indigo-500/20 shadow-md' : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 shadow-sm'}`}><div className="p-4 flex items-center justify-between"><div className="flex items-center gap-4"><div className={`w-10 h-10 rounded-xl ${agent.iconColor} flex items-center justify-center`}><span className="material-symbols-outlined text-xl">{agent.icon}</span></div><div><h4 className="text-sm font-bold text-gray-900 dark:text-white">{agent.name}</h4></div></div></div></div>)}</div></div>)}</div>
      </div>

      <div className="flex-1 overflow-y-auto pb-12 custom-scrollbar">
        {currentAgent ? (
          <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4"><div className={`w-14 h-14 rounded-2xl ${currentAgent.iconColor} flex items-center justify-center shadow-inner`}><span className="material-symbols-outlined text-2xl">{currentAgent.icon}</span></div><div><h2 className="text-xl font-bold text-gray-900 dark:text-white">{currentAgent.name}</h2><p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{currentAgent.role || 'Agent role description'}</p><div className="flex items-center gap-2 mt-3"><span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-md text-xs font-medium border border-gray-200 dark:border-gray-700">{currentAgent.active ? 'Live' : 'Draft'}</span><span className="px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-md text-xs font-medium border border-indigo-100 dark:border-indigo-800/50">System Agent</span></div></div></div>
                <div className="flex items-center gap-3"><MinimalButton variant="ghost" onClick={handleRollback}>Reset</MinimalButton><MinimalButton variant="outline" onClick={() => saveAndRefresh(false)} disabled={saveDraft.loading}>Save draft</MinimalButton><MinimalButton onClick={() => saveAndRefresh(true)} disabled={saveDraft.loading || publishDraft.loading}>Publish changes</MinimalButton></div>
              </div>
            </div>

            {statusMessage ? <div className="border-b border-black/5 px-6 py-4 dark:border-white/10"><div className="rounded-[18px] border border-black/5 bg-white px-4 py-3 text-sm text-gray-700 dark:border-white/10 dark:bg-[#171717] dark:text-gray-200">{statusMessage}</div></div> : null}

            <div className="p-8 space-y-12">
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Knowledge Access Overview</h3>
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div className="p-4 rounded-xl border border-black/5 bg-white dark:bg-[#171717] dark:border-white/10"><div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 mb-2"><span className="material-symbols-outlined text-sm">database</span><span className="text-xs font-bold uppercase tracking-wider">Sources Enabled</span></div><p className="text-2xl font-bold text-gray-900 dark:text-white">{sourceEnabledCount}</p></div>
                  <div className="p-4 rounded-xl border border-black/5 bg-white dark:bg-[#171717] dark:border-white/10"><div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 mb-2"><span className="material-symbols-outlined text-sm">visibility_off</span><span className="text-xs font-bold uppercase tracking-wider">Restricted</span></div><p className="text-2xl font-bold text-gray-900 dark:text-white">{restrictedCount}</p></div>
                  <div className="p-4 rounded-xl border border-black/5 bg-white dark:bg-[#171717] dark:border-white/10"><div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 mb-2"><span className="material-symbols-outlined text-sm">fingerprint</span><span className="text-xs font-bold uppercase tracking-wider">Sensitive</span></div><p className="text-2xl font-bold text-gray-900 dark:text-white">{sensitiveCount}</p></div>
                  <div className="p-4 rounded-xl border border-black/5 bg-white dark:bg-[#171717] dark:border-white/10"><div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 mb-2"><span className="material-symbols-outlined text-sm">block</span><span className="text-xs font-bold uppercase tracking-wider">Blocked</span></div><p className="text-2xl font-bold text-gray-900 dark:text-white">{blockedCount}</p></div>
                </div>
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-800"><div><p className="text-sm font-bold text-gray-900 dark:text-white">Global Access Level</p><p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Overall perimeter of knowledge this agent can access.</p></div><StyledSelect value={profile.global_access_level} onChange={(e) => setProfile(prev => ({ ...prev, global_access_level: e.target.value }))} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"><option>Limited access</option><option>Standard access</option><option>Broad internal access</option><option>Restricted sensitive access</option></StyledSelect></div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-6">Source Access</h3>
                <div className="space-y-6">{profile.source_categories.map((category, idx) => <div key={idx} className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden"><div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between"><h4 className="text-sm font-bold text-gray-700 dark:text-gray-300">{category.name}</h4><span className="text-xs text-gray-500">{category.sources.length} sources</span></div><div className="divide-y divide-gray-100 dark:divide-gray-800">{category.sources.map((source, sIdx) => { const level = profile.source_access[source] || 'No access'; return <div key={sIdx} className="bg-white dark:bg-card-dark px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"><span className="text-sm font-medium text-gray-900 dark:text-gray-100">{source}</span><StyledSelect value={level} onChange={(e) => setProfile(prev => ({ ...prev, source_access: { ...prev.source_access, [source]: e.target.value as AccessLevel } }))} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"><option>No access</option><option>Metadata only</option><option>Read summaries only</option><option>Read raw documents</option><option>Read + extract</option><option>Approval required</option></StyledSelect></div>; })}</div></div>)}</div>
              </section>

              <section className="grid grid-cols-2 gap-8">
                <div className="space-y-4"><label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Document Status</label><StyledSelect value={profile.document_status} onChange={(e) => setProfile(prev => ({ ...prev, document_status: e.target.value }))} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"><option>Final documents only</option><option>Include drafts</option><option>Approved policies only</option></StyledSelect><div className="space-y-2 mt-2"><label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={profile.include_internal_notes} onChange={() => setProfile(prev => ({ ...prev, include_internal_notes: !prev.include_internal_notes }))} className="rounded text-indigo-600 focus:ring-indigo-500" />Internal notes visible</label><label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={profile.include_attachments} onChange={() => setProfile(prev => ({ ...prev, include_attachments: !prev.include_attachments }))} className="rounded text-indigo-600 focus:ring-indigo-500" />Attachments allowed</label><label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={profile.include_historical_conversations} onChange={() => setProfile(prev => ({ ...prev, include_historical_conversations: !prev.include_historical_conversations }))} className="rounded text-indigo-600 focus:ring-indigo-500" />Historical conversations allowed</label></div></div>
                <div className="space-y-4"><label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Archived Records</label><StyledSelect value={profile.archived_records} onChange={(e) => setProfile(prev => ({ ...prev, archived_records: e.target.value }))} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"><option>Allowed</option><option>Blocked</option><option>Metadata only</option></StyledSelect><div className="space-y-2 mt-2"><label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={profile.block_admin_notes} onChange={() => setProfile(prev => ({ ...prev, block_admin_notes: !prev.block_admin_notes }))} className="rounded text-indigo-600 focus:ring-indigo-500" />Admin-only notes blocked</label><label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={profile.block_finance_docs} onChange={() => setProfile(prev => ({ ...prev, block_finance_docs: !prev.block_finance_docs }))} className="rounded text-indigo-600 focus:ring-indigo-500" />Finance-only documents blocked</label><label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={profile.block_legal_docs} onChange={() => setProfile(prev => ({ ...prev, block_legal_docs: !prev.block_legal_docs }))} className="rounded text-indigo-600 focus:ring-indigo-500" />Legal documents restricted</label></div></div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Sensitive Data Restrictions</h3>
                <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden"><div className="divide-y divide-gray-100 dark:divide-gray-800">{profile.sensitive_data_types.map((type, idx) => { const rule = profile.sensitive_rules[type] || 'Hidden completely'; return <div key={idx} className="bg-white dark:bg-card-dark px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"><div className="flex items-center gap-3"><span className="material-symbols-outlined text-gray-400 text-sm">security</span><span className="text-sm font-medium text-gray-900 dark:text-gray-100">{type}</span></div><StyledSelect value={rule} onChange={(e) => setProfile(prev => ({ ...prev, sensitive_rules: { ...prev.sensitive_rules, [type]: e.target.value as SensitiveRule } }))} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"><option>Hidden completely</option><option>Masked</option><option>Summary only</option><option>View with approval</option><option>Never accessible</option></StyledSelect></div>; })}</div></div>
              </section>

              <section className="grid grid-cols-2 gap-8">
                <div><label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Search Depth</label><StyledSelect value={profile.search_depth} onChange={(e) => setProfile(prev => ({ ...prev, search_depth: e.target.value }))} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"><option>Only directly linked sources</option><option>Same-case data only</option><option>Related documents allowed</option><option>Cross-case lookup allowed</option></StyledSelect></div>
                <div><label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Historical Lookup Depth</label><StyledSelect value={profile.historical_lookup_depth} onChange={(e) => setProfile(prev => ({ ...prev, historical_lookup_depth: e.target.value }))} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"><option>Last 30 days</option><option>Last 6 months</option><option>Last 1 year</option><option>All time</option></StyledSelect></div>
              </section>

              <section className="grid grid-cols-2 gap-8">
                <button type="button" onClick={() => setProfile(prev => ({ ...prev, cross_system_context: !prev.cross_system_context }))} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl"><span className="text-sm text-gray-700 dark:text-gray-300">Cross-System Context</span><div className={`w-10 h-5 rounded-full relative ${profile.cross_system_context ? 'bg-violet-500' : 'bg-gray-300 dark:bg-gray-700'}`}><div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full ${profile.cross_system_context ? 'right-0.5' : 'left-0.5'}`}></div></div></button>
                <button type="button" onClick={() => setProfile(prev => ({ ...prev, internal_references: !prev.internal_references }))} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl"><span className="text-sm text-gray-700 dark:text-gray-300">Internal References</span><div className={`w-10 h-5 rounded-full relative ${profile.internal_references ? 'bg-violet-500' : 'bg-gray-300 dark:bg-gray-700'}`}><div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full ${profile.internal_references ? 'right-0.5' : 'left-0.5'}`}></div></div></button>
              </section>

              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Field-Level Visibility</h3>
                <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden"><div className="divide-y divide-gray-100 dark:divide-gray-800">{profile.field_visibility_items.map((field, idx) => { const visibility = profile.field_visibility[field] || 'Hidden'; return <div key={idx} className="bg-white dark:bg-card-dark px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"><div className="flex items-center gap-3"><span className="material-symbols-outlined text-gray-400 text-sm">data_object</span><span className="text-sm font-medium text-gray-900 dark:text-gray-100">{field}</span></div><StyledSelect value={visibility} onChange={(e) => setProfile(prev => ({ ...prev, field_visibility: { ...prev.field_visibility, [field]: e.target.value as FieldVisibility } }))} className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"><option>Visible</option><option>Masked</option><option>Summary only</option><option>Hidden</option><option>Approval required</option></StyledSelect></div>; })}</div></div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Trusted Source Priority</h3>
                <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">{profile.trusted_source_priority.map((source, idx) => <div key={idx} className="flex items-center gap-4"><span className="text-sm font-bold text-gray-400 w-6">{idx + 1}</span><input value={source} onChange={(e) => setProfile(prev => ({ ...prev, trusted_source_priority: prev.trusted_source_priority.map((item, itemIdx) => itemIdx === idx ? e.target.value : item) }))} className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" /></div>)}<div className="pt-4 border-t border-gray-100 dark:border-gray-800 mt-4 space-y-2"><label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={profile.trusted_source_flags.internalNotesLowPriority} onChange={() => setProfile(prev => ({ ...prev, trusted_source_flags: { ...prev.trusted_source_flags, internalNotesLowPriority: !prev.trusted_source_flags.internalNotesLowPriority } }))} className="rounded text-indigo-600 focus:ring-indigo-500" />Internal notes low priority</label><label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={profile.trusted_source_flags.draftDocsExcluded} onChange={() => setProfile(prev => ({ ...prev, trusted_source_flags: { ...prev.trusted_source_flags, draftDocsExcluded: !prev.trusted_source_flags.draftDocsExcluded } }))} className="rounded text-indigo-600 focus:ring-indigo-500" />Draft docs excluded</label><label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={profile.trusted_source_flags.adminContentNeverPrioritized} onChange={() => setProfile(prev => ({ ...prev, trusted_source_flags: { ...prev.trusted_source_flags, adminContentNeverPrioritized: !prev.trusted_source_flags.adminContentNeverPrioritized } }))} className="rounded text-indigo-600 focus:ring-indigo-500" />Admin content never prioritized</label></div></div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold text-gray-900 dark:text-white">Access Conditions & Exceptions</h3><button onClick={() => setProfile(prev => ({ ...prev, access_conditions: [...prev.access_conditions, 'New access condition'] }))} className="text-xs font-bold text-gray-700 dark:text-gray-200 hover:underline">Add condition</button></div>
                <div className="space-y-3">{profile.access_conditions.map((condition, idx) => <div key={idx} className="flex items-center gap-3 bg-white dark:bg-gray-800 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm"><span className="material-symbols-outlined text-indigo-500 text-sm">rule</span><input value={condition} onChange={(e) => setProfile(prev => ({ ...prev, access_conditions: prev.access_conditions.map((item, itemIdx) => itemIdx === idx ? e.target.value : item) }))} className="flex-1 bg-transparent text-sm font-medium text-gray-900 dark:text-gray-100 outline-none" /></div>)}</div>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-4"><span className="material-symbols-outlined text-red-500">gpp_bad</span><h3 className="text-sm font-bold text-gray-900 dark:text-white">Hard Knowledge Blocks</h3></div>
                <div className="bg-white dark:bg-[#171717] border border-black/5 dark:border-white/10 rounded-xl p-6"><div className="space-y-2">{profile.hard_blocks.map((block, idx) => <div key={idx} className="flex items-center gap-3 bg-white dark:bg-gray-800 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm"><span className="material-symbols-outlined text-violet-500 text-sm">block</span><input value={block} onChange={(e) => setProfile(prev => ({ ...prev, hard_blocks: prev.hard_blocks.map((item, itemIdx) => itemIdx === idx ? e.target.value : item) }))} className="flex-1 bg-transparent text-sm font-medium text-gray-900 dark:text-gray-100 outline-none" /></div>)}<button onClick={() => setProfile(prev => ({ ...prev, hard_blocks: [...prev.hard_blocks, 'New hard block'] }))} className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-200 mt-4 hover:underline"><span className="material-symbols-outlined text-sm">add</span>Add hard block</button></div></div>
              </section>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400"><div className="text-center"><span className="material-symbols-outlined text-4xl mb-2">menu_book</span><p>Select an agent to configure knowledge access</p></div></div>
        )}
      </div>
    </motion.div>
  );
}
