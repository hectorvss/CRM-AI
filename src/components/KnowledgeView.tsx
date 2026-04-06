import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { connectionCategories } from '../connectionsData';

type AccessLevel = 'No access' | 'Metadata only' | 'Read summaries only' | 'Read raw documents' | 'Read + extract' | 'Approval required';
type SensitiveRule = 'Hidden completely' | 'Masked' | 'Summary only' | 'View with approval' | 'Never accessible';
type FieldVisibility = 'Visible' | 'Masked' | 'Summary only' | 'Hidden' | 'Approval required';

const sourceCategories = [
  {
    name: 'Internal Knowledge Base',
    sources: ['Policies', 'SOPs / playbooks', 'Help center / macros']
  },
  {
    name: 'Customer Data',
    sources: ['Customer profiles', 'Tickets & conversations', 'Internal notes']
  },
  {
    name: 'Commerce Data',
    sources: ['Orders', 'Payments', 'Returns', 'Shipping']
  },
  {
    name: 'System & Admin',
    sources: ['Analytics / reporting', 'Admin-only content', 'Attachments / uploaded files']
  }
];

const sensitiveDataTypes = [
  'Personally Identifiable Information (PII)',
  'Payment-related information',
  'Fraud signals & risk notes',
  'Legal & compliance data',
  'Employee-only notes',
  'Strategic internal documentation'
];

const fieldVisibilityItems = [
  'Customer full name',
  'Address & phone',
  'Order total & payment method',
  'Refund amount & history',
  'Risk flags & internal tags',
  'Assigned agent notes'
];

export default function KnowledgeView() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>('Supervisor');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  // Mock states
  const [sourceAccess, setSourceAccess] = useState<Record<string, AccessLevel>>({});
  const [sensitiveRules, setSensitiveRules] = useState<Record<string, SensitiveRule>>({});
  const [fieldVisibility, setFieldVisibility] = useState<Record<string, FieldVisibility>>({});

  const handleSourceAccessChange = (source: string, level: AccessLevel) => {
    setSourceAccess(prev => ({ ...prev, [source]: level }));
  };

  const handleSensitiveRuleChange = (type: string, rule: SensitiveRule) => {
    setSensitiveRules(prev => ({ ...prev, [type]: rule }));
  };

  const handleFieldVisibilityChange = (field: string, visibility: FieldVisibility) => {
    setFieldVisibility(prev => ({ ...prev, [field]: visibility }));
  };

  const allAgents = connectionCategories.flatMap(c => c.agents);
  const currentAgent = allAgents.find(a => a.name === selectedAgent);

  const filteredCategories = connectionCategories.map(category => ({
    ...category,
    agents: category.agents.filter(agent => {
      const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = 
        activeFilter === 'All' ? true :
        activeFilter === 'Active' ? agent.active :
        activeFilter === 'Restricted' ? agent.locked :
        activeFilter === 'Draft' ? !agent.active : true;
      return matchesSearch && matchesFilter;
    })
  })).filter(c => c.agents.length > 0);

  return (
    <motion.div
      key="knowledge"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex gap-6 h-full"
    >
      {/* Left Side: Agent List */}
      <div className="w-80 flex-shrink-0 flex flex-col h-full overflow-hidden border-r border-gray-200 dark:border-gray-800 pr-4">
        {/* Search & Filters */}
        <div className="space-y-4 mb-6">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-lg">search</span>
            <input 
              type="text" 
              placeholder="Search agents..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
          </div>
          <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
            {['All', 'Active', 'Restricted', 'Draft'].map(filter => (
              <button 
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeFilter === filter 
                    ? 'bg-black dark:bg-white text-white dark:text-black shadow-sm' 
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {/* Categories */}
        <div className="flex-1 overflow-y-auto space-y-8 pb-12 pr-2 custom-scrollbar">
          {filteredCategories.map((category, catIdx) => (
            <div key={catIdx} className="space-y-4">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">{category.category}</h3>
              <div className="space-y-3">
                {category.agents.map((agent, agentIdx) => (
                  <div 
                    key={agentIdx} 
                    onClick={() => setSelectedAgent(agent.name)}
                    className={`bg-white dark:bg-card-dark border rounded-2xl transition-all cursor-pointer ${
                      selectedAgent === agent.name 
                        ? 'border-indigo-500 ring-1 ring-indigo-500/20 shadow-md' 
                        : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 shadow-sm'
                    }`}
                  >
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl ${agent.iconColor} flex items-center justify-center`}>
                          <span className="material-symbols-outlined text-xl">{agent.icon}</span>
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-gray-900 dark:text-white">{agent.name}</h4>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {agent.locked ? (
                          <div className="flex items-center gap-1.5 text-gray-400">
                            <span className="material-symbols-outlined text-sm">lock</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider">Locked ON</span>
                          </div>
                        ) : (
                          <div className={`w-8 h-4 rounded-full relative transition-colors ${agent.active ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-700'}`}>
                            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${agent.active ? 'right-0.5' : 'left-0.5'}`}></div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Side: Main Card */}
      <div className="flex-1 overflow-y-auto pb-12 custom-scrollbar">
        {currentAgent ? (
          <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-2xl ${currentAgent.iconColor} flex items-center justify-center shadow-inner`}>
                    <span className="material-symbols-outlined text-2xl">{currentAgent.icon}</span>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{currentAgent.name}</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{currentAgent.role || 'Agent role description'}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-md text-xs font-medium border border-gray-200 dark:border-gray-700">
                        {currentAgent.active ? 'Live' : 'Draft'}
                      </span>
                      <span className="px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-md text-xs font-medium border border-indigo-100 dark:border-indigo-800/50">
                        System Agent
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button className="px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
                    Reset
                  </button>
                  <button className="px-4 py-2 text-sm font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-xl transition-colors">
                    Save draft
                  </button>
                  <button className="px-4 py-2 text-sm font-bold text-white bg-black dark:bg-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 rounded-xl transition-colors shadow-sm">
                    Publish changes
                  </button>
                </div>
              </div>
            </div>

            <div className="p-8 space-y-12">
              {/* Knowledge Access Overview */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Knowledge Access Overview</h3>
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div className="p-4 rounded-xl border border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-900/30">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400 mb-2">
                      <span className="material-symbols-outlined text-sm">database</span>
                      <span className="text-xs font-bold uppercase tracking-wider">Sources Enabled</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">14</p>
                  </div>
                  <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/30">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-2">
                      <span className="material-symbols-outlined text-sm">visibility_off</span>
                      <span className="text-xs font-bold uppercase tracking-wider">Restricted</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">6</p>
                  </div>
                  <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-900/10 dark:border-indigo-900/30">
                    <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 mb-2">
                      <span className="material-symbols-outlined text-sm">fingerprint</span>
                      <span className="text-xs font-bold uppercase tracking-wider">Sensitive</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">3</p>
                  </div>
                  <div className="p-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-900/30">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400 mb-2">
                      <span className="material-symbols-outlined text-sm">block</span>
                      <span className="text-xs font-bold uppercase tracking-wider">Blocked</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">8</p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-800">
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">Global Access Level</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Overall perimeter of knowledge this agent can access.</p>
                  </div>
                  <select className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                    <option>Limited access</option>
                    <option>Standard access</option>
                    <option>Broad internal access</option>
                    <option>Restricted sensitive access</option>
                  </select>
                </div>
              </section>

              {/* Source Access */}
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Source Access</h3>
                  <button className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">Expand all</button>
                </div>
                
                <div className="space-y-6">
                  {sourceCategories.map((category, idx) => (
                    <div key={idx} className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                      <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                        <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300">{category.name}</h4>
                        <span className="text-xs text-gray-500">{category.sources.length} sources</span>
                      </div>
                      <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {category.sources.map((source, sIdx) => {
                          const level = sourceAccess[source] || 'No access';
                          
                          return (
                            <div key={sIdx} className="bg-white dark:bg-card-dark px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{source}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <select 
                                  value={level}
                                  onChange={(e) => handleSourceAccessChange(source, e.target.value as AccessLevel)}
                                  className={`bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                                    level === 'No access' ? 'text-gray-500' :
                                    level === 'Read raw documents' || level === 'Read + extract' ? 'text-green-600 dark:text-green-400' :
                                    level === 'Approval required' ? 'text-indigo-600 dark:text-indigo-400' :
                                    'text-amber-600 dark:text-amber-400'
                                  }`}
                                >
                                  <option>No access</option>
                                  <option>Metadata only</option>
                                  <option>Read summaries only</option>
                                  <option>Read raw documents</option>
                                  <option>Read + extract</option>
                                  <option>Approval required</option>
                                </select>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Document and Content Scope */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Document & Content Scope</h3>
                <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Document Status</label>
                        <select className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                          <option>Final documents only</option>
                          <option>Include drafts</option>
                          <option>Approved policies only</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Content Inclusions</label>
                        <div className="space-y-2 mt-2">
                          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <input type="checkbox" defaultChecked className="rounded text-indigo-600 focus:ring-indigo-500" />
                            Internal notes visible
                          </label>
                          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500" />
                            Attachments allowed
                          </label>
                          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <input type="checkbox" defaultChecked className="rounded text-indigo-600 focus:ring-indigo-500" />
                            Historical conversations allowed
                          </label>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Content Exclusions</label>
                        <div className="space-y-2 mt-2">
                          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <input type="checkbox" defaultChecked className="rounded text-indigo-600 focus:ring-indigo-500" />
                            Admin-only notes blocked
                          </label>
                          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <input type="checkbox" defaultChecked className="rounded text-indigo-600 focus:ring-indigo-500" />
                            Finance-only documents blocked
                          </label>
                          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <input type="checkbox" defaultChecked className="rounded text-indigo-600 focus:ring-indigo-500" />
                            Legal documents restricted
                          </label>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Archived Records</label>
                        <select className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                          <option>Allowed</option>
                          <option>Blocked</option>
                          <option>Metadata only</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Sensitive Data Restrictions */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Sensitive Data Restrictions</h3>
                <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Rules for handling sensitive content across all permitted sources.</p>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {sensitiveDataTypes.map((type, idx) => {
                      const rule = sensitiveRules[type] || 'Hidden completely';
                      return (
                        <div key={idx} className="bg-white dark:bg-card-dark px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-gray-400 text-sm">security</span>
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{type}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <select 
                              value={rule}
                              onChange={(e) => handleSensitiveRuleChange(type, e.target.value as SensitiveRule)}
                              className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            >
                              <option>Hidden completely</option>
                              <option>Masked</option>
                              <option>Summary only</option>
                              <option>View with approval</option>
                              <option>Never accessible</option>
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* Retrieval Scope & Access Boundaries */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Retrieval Scope & Access Boundaries</h3>
                <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Search Depth</label>
                        <select className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                          <option>Only directly linked sources</option>
                          <option>Same-case data only</option>
                          <option>Related documents allowed</option>
                          <option>Cross-case lookup allowed</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Historical Lookup Depth</label>
                        <select className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                          <option>Last 30 days</option>
                          <option>Last 6 months</option>
                          <option>Last 1 year</option>
                          <option>All time</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Cross-System Context</label>
                        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl">
                          <span className="text-sm text-gray-700 dark:text-gray-300">Allowed</span>
                          <div className="w-10 h-5 bg-indigo-500 rounded-full relative cursor-pointer">
                            <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-white rounded-full"></div>
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Internal References</label>
                        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl">
                          <span className="text-sm text-gray-700 dark:text-gray-300">Allowed</span>
                          <div className="w-10 h-5 bg-gray-300 dark:bg-gray-700 rounded-full relative cursor-pointer">
                            <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Field-Level Visibility */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Field-Level Visibility</h3>
                <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Granular control over specific data fields within permitted sources.</p>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {fieldVisibilityItems.map((field, idx) => {
                      const visibility = fieldVisibility[field] || 'Hidden';
                      return (
                        <div key={idx} className="bg-white dark:bg-card-dark px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-gray-400 text-sm">data_object</span>
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{field}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <select 
                              value={visibility}
                              onChange={(e) => handleFieldVisibilityChange(field, e.target.value as FieldVisibility)}
                              className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            >
                              <option>Visible</option>
                              <option>Masked</option>
                              <option>Summary only</option>
                              <option>Hidden</option>
                              <option>Approval required</option>
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* Trusted Source Priority */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Trusted Source Priority</h3>
                <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Define which sources the agent should prioritize when multiple are available.</p>
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-bold text-gray-400 w-6">1</span>
                      <select className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                        <option>Policies</option>
                        <option>SOPs / playbooks</option>
                        <option>Ticket context</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-bold text-gray-400 w-6">2</span>
                      <select className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                        <option>SOPs / playbooks</option>
                        <option>Policies</option>
                        <option>Ticket context</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-bold text-gray-400 w-6">3</span>
                      <select className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                        <option>Ticket context</option>
                        <option>Customer history after current case</option>
                        <option>Internal notes</option>
                      </select>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-gray-100 dark:border-gray-800 mt-4">
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" defaultChecked className="rounded text-indigo-600 focus:ring-indigo-500" />
                        Internal notes low priority
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" defaultChecked className="rounded text-indigo-600 focus:ring-indigo-500" />
                        Draft docs excluded
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <input type="checkbox" defaultChecked className="rounded text-indigo-600 focus:ring-indigo-500" />
                        Admin content never prioritized
                      </label>
                    </div>
                  </div>
                </div>
              </section>

              {/* Access Conditions & Exceptions */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Access Conditions & Exceptions</h3>
                  <button className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">Add condition</button>
                </div>
                <div className="space-y-3">
                  {[
                    'Allow raw order data only for live order issues',
                    'Allow customer history only if case severity is high',
                    'Allow policy attachments only with approval'
                  ].map((condition, idx) => (
                    <div key={idx} className="flex items-center gap-3 bg-white dark:bg-gray-800 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                      <span className="material-symbols-outlined text-indigo-500 text-sm">rule</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{condition}</span>
                      <button className="ml-auto text-gray-400 hover:text-red-500">
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              {/* Hard Blocks */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-red-500">gpp_bad</span>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Hard Knowledge Blocks</h3>
                </div>
                <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-xl p-6">
                  <p className="text-sm text-red-800 dark:text-red-300 mb-4">This knowledge is strictly prohibited for this agent under any circumstances, overriding all other permissions.</p>
                  <div className="space-y-2">
                    {[
                      'Legal investigation docs',
                      'Payment credentials',
                      'Admin-only internal discussions',
                      'Security incidents'
                    ].map((block, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-white dark:bg-gray-800 px-4 py-3 rounded-lg border border-red-100 dark:border-red-900/20 shadow-sm">
                        <span className="material-symbols-outlined text-red-500 text-sm">block</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{block}</span>
                        <button className="ml-auto text-gray-400 hover:text-red-500">
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </div>
                    ))}
                    <button className="flex items-center gap-2 text-sm font-bold text-red-600 dark:text-red-400 mt-4 hover:underline">
                      <span className="material-symbols-outlined text-sm">add</span>
                      Add hard block
                    </button>
                  </div>
                </div>
              </section>

            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <span className="material-symbols-outlined text-4xl mb-2">menu_book</span>
              <p>Select an agent to configure knowledge access</p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
