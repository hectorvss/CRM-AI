import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { mockArticleDetails } from './KnowledgeData';

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

  const renderLibrary = () => (
    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6">
      <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden flex flex-col">
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
        <div className="flex-1 overflow-auto">
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
              {mockLibrary.map((item) => (
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderArticleDetail = () => {
    const articleData = selectedArticleId ? mockArticleDetails[selectedArticleId] : null;
    if (!articleData) return null;

    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-background-dark">
        <div className="h-14 flex items-center px-8 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 bg-white dark:bg-card-dark">
          <button 
            onClick={() => setSelectedArticleId(null)}
            className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white flex items-center text-sm font-bold transition-colors"
          >
            <span className="material-symbols-outlined text-lg mr-2">arrow_back</span>
            Back to Library
          </button>
          <span className="mx-4 text-gray-300 dark:text-gray-700">/</span>
          <span className="text-gray-900 dark:text-white font-bold text-sm">{articleData.title}</span>
          <div className="ml-auto flex items-center gap-3">
            <button className="px-4 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-card flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">visibility</span>
              View Public Link
            </button>
            <button className="px-4 py-1.5 bg-black dark:bg-white text-white dark:text-black text-xs font-bold rounded-lg hover:opacity-90 transition-all shadow-xl flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">edit</span>
              Edit Article
            </button>
            <button className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">
              <span className="material-symbols-outlined">more_horiz</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="w-full px-8 py-10">
            <div className="flex flex-col lg:flex-row gap-12">
              <div className="flex-1 space-y-10">
                <div className="pb-8 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-3 mb-6">
                    <span className="px-3 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 text-[10px] font-bold rounded-lg uppercase tracking-widest border border-purple-100 dark:border-purple-800/30">{articleData.type}</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">#{articleData.id}</span>
                  </div>
                  <h1 className="text-4xl font-display font-bold text-gray-900 dark:text-white mb-6 tracking-tight">{articleData.title}</h1>
                  <div className="flex flex-wrap items-center gap-x-8 gap-y-4 text-sm">
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold">{articleData.ownerInitials}</div>
                      <span>Owned by <span className="font-bold text-gray-900 dark:text-white">{articleData.owner}</span></span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                      <span className="material-symbols-outlined text-lg">schedule</span>
                      <span>Last updated {articleData.lastUpdated}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                      <span className="material-symbols-outlined text-lg">domain</span>
                      <span>Domain: <span className="font-bold text-gray-900 dark:text-white">{articleData.domain}</span></span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                      <span className="material-symbols-outlined text-lg">category</span>
                      <span>Scope: <span className="font-bold text-gray-900 dark:text-white">{articleData.scope}</span></span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                      <span className="material-symbols-outlined text-lg">verified_user</span>
                      <span>Review owner: <span className="font-bold text-gray-900 dark:text-white">{articleData.reviewOwner}</span></span>
                    </div>
                  </div>
                  <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl p-6 mt-8">
                    <div className="flex gap-4">
                      <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 mt-0.5">info</span>
                      <div>
                        <h4 className="text-xs font-bold text-blue-900 dark:text-blue-300 uppercase tracking-widest mb-2">Purpose</h4>
                        <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed font-medium">
                          {articleData.purpose}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-display prose-headings:font-bold prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-p:leading-relaxed prose-li:text-gray-700 dark:prose-li:text-gray-300">
                  {articleData.content}
                </div>

                <div className="mt-16 pt-10 border-t border-gray-100 dark:border-gray-800">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-3">
                      <span className="material-symbols-outlined text-purple-500 text-lg">smart_toy</span>
                      AI Citations Preview
                    </h3>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest italic">How the AI summarizes this for users</span>
                  </div>
                  <div className="bg-gray-50 dark:bg-card-dark/50 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 shadow-card">
                    <div className="flex gap-6">
                      <div className="w-1 h-auto bg-purple-500 rounded-full"></div>
                      <div className="space-y-4">
                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed italic font-medium">
                          {articleData.aiCitationPreview.text}
                        </p>
                        <div className="flex gap-3">
                          {articleData.aiCitationPreview.sources.map((source: string, idx: number) => (
                            <span key={idx} className="inline-flex items-center px-3 py-1 rounded-lg text-[10px] font-bold bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 uppercase tracking-wider">Source: {source}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="w-full lg:w-80 space-y-8">
                <div className="bg-white dark:bg-card-dark rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">AI Performance</h3>
                    <span className="text-[10px] font-bold text-gray-400 bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded uppercase tracking-widest">30d</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {articleData.aiPerformance.map((stat: any) => (
                      <div key={stat.label} className="text-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700/50">
                        <div className={`text-lg font-bold ${
                          stat.color === 'indigo' ? 'text-indigo-600' :
                          stat.color === 'green' ? 'text-green-600' :
                          'text-amber-600'
                        }`}>{stat.val}</div>
                        <div className="text-[8px] uppercase text-gray-500 font-bold tracking-widest mt-1">{stat.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white dark:bg-card-dark rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 p-6">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6">Linked Workflows</h3>
                  <div className="space-y-4">
                    {articleData.linkedWorkflows.length > 0 ? articleData.linkedWorkflows.map((wf: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700/50 hover:border-indigo-200 transition-all cursor-pointer group">
                        <span className="material-symbols-outlined text-gray-400 text-lg group-hover:text-indigo-500 transition-colors">account_tree</span>
                        <div className="flex-1">
                          <div className="text-xs font-bold text-gray-900 dark:text-white">{wf.title}</div>
                          <div className="text-[10px] text-gray-500 mt-1">{wf.desc}</div>
                        </div>
                        <span className="material-symbols-outlined text-gray-300 text-sm group-hover:text-gray-600">open_in_new</span>
                      </div>
                    )) : (
                      <div className="text-xs text-gray-500 italic">No linked workflows</div>
                    )}
                  </div>
                  <button className="w-full mt-4 py-3 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest border border-dashed border-indigo-200 dark:border-indigo-800 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-all">
                    + Link to Workflow
                  </button>
                </div>

                <div className="bg-white dark:bg-card-dark rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 p-6">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6">Linked Approvals</h3>
                  <div className="space-y-4">
                    {articleData.linkedApprovals.length > 0 ? articleData.linkedApprovals.map((app: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700/50 hover:border-indigo-200 transition-all cursor-pointer group">
                        <span className="material-symbols-outlined text-gray-400 text-lg group-hover:text-indigo-500 transition-colors">fact_check</span>
                        <div className="flex-1">
                          <div className="text-xs font-bold text-gray-900 dark:text-white">{app.title}</div>
                          <div className="text-[10px] text-gray-500 mt-1">{app.desc}</div>
                        </div>
                        <span className="material-symbols-outlined text-gray-300 text-sm group-hover:text-gray-600">open_in_new</span>
                      </div>
                    )) : (
                      <div className="text-xs text-gray-500 italic">No linked approvals</div>
                    )}
                  </div>
                </div>

                <div className="bg-white dark:bg-card-dark rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 p-6">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6">Linked Modules</h3>
                  <div className="flex flex-wrap gap-2">
                    {articleData.linkedModules.map((mod: string, idx: number) => (
                      <span key={idx} className="inline-flex items-center px-3 py-1 rounded-lg text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">{mod}</span>
                    ))}
                  </div>
                </div>

                {articleData.gaps.length > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-900/10 rounded-2xl shadow-xl border border-amber-200 dark:border-amber-800/30 p-6">
                    <h3 className="text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">warning</span>
                      Gaps / Missing Coverage
                    </h3>
                    <ul className="space-y-2 text-xs text-amber-800 dark:text-amber-400">
                      {articleData.gaps.map((gap: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="material-symbols-outlined text-sm mt-0.5">remove</span>
                          {gap}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
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
                      <button className="px-6 py-2.5 bg-black dark:bg-white text-white dark:text-black text-xs font-bold rounded-xl hover:opacity-90 transition-all shadow-xl flex items-center gap-2">
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
    </div>
  );
}
