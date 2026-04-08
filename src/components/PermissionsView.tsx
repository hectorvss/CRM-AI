import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { connectionCategories } from '../connectionsData';
import { agentsApi } from '../api/client';
import { useApi, useMutation } from '../api/hooks';
import { 
  agentPermissionsConfig, 
  defaultAgentConfig, 
  PermissionState, 
  ToolAccessLevel 
} from '../agentPermissionsConfig';

export default function PermissionsView() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>('Supervisor');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [showFullCatalog, setShowFullCatalog] = useState(false);

  // Mock state for permissions
  const [actionPermissions, setActionPermissions] = useState<Record<string, PermissionState>>({});
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [toolAccess, setToolAccess] = useState<Record<string, ToolAccessLevel>>({});
  const { data: apiAgents, refetch } = useApi(agentsApi.list, [], []);
  const saveDraft = useMutation((payload: { id: string; body: Record<string, any> }) => agentsApi.updatePolicyDraft(payload.id, payload.body));
  const publishDraft = useMutation((id: string) => agentsApi.publishPolicyDraft(id));
  const rollbackDraft = useMutation((id: string) => agentsApi.rollbackPolicy(id));

  const handlePermissionChange = (action: string, state: PermissionState) => {
    setActionPermissions(prev => ({ ...prev, [action]: state }));
    if (state === 'Conditional' || state === 'Approval') {
      setExpandedAction(action);
    } else {
      if (expandedAction === action) setExpandedAction(null);
    }
  };

  const handleToolAccessChange = (tool: string, level: ToolAccessLevel) => {
    setToolAccess(prev => ({ ...prev, [tool]: level }));
  };

  const allAgents = connectionCategories.flatMap(c => c.agents);
  const currentAgent = allAgents.find(a => a.name === selectedAgent);
  const agentConfig = currentAgent ? (agentPermissionsConfig[currentAgent.name] || defaultAgentConfig) : null;
  const selectedApiAgent = apiAgents?.find((agent: any) => agent.name === selectedAgent);

  const buildPermissionProfile = () => ({
    template: agentConfig?.template ?? 'default',
    effectiveAccessSummary: agentConfig?.effectiveAccessSummary ?? [],
    applicableCategories: agentConfig?.applicableCategories ?? [],
    mainTools: agentConfig?.mainTools ?? [],
    optionalTools: agentConfig?.optionalTools ?? [],
    limits: agentConfig?.limits ?? [],
    specificHardBlocks: agentConfig?.specificHardBlocks ?? [],
    globalHardBlocks: agentConfig?.globalHardBlocks ?? [],
    actionPermissions,
    toolAccess,
  });

  const handleSaveDraft = async () => {
    if (!selectedApiAgent) return;
    await saveDraft.mutate({
      id: selectedApiAgent.id,
      body: { permission_profile: buildPermissionProfile() },
    });
    refetch();
  };

  const handlePublishDraft = async () => {
    if (!selectedApiAgent) return;
    await saveDraft.mutate({
      id: selectedApiAgent.id,
      body: { permission_profile: buildPermissionProfile() },
    });
    await publishDraft.mutate(selectedApiAgent.id);
    refetch();
  };

  const handleRollback = async () => {
    if (!selectedApiAgent) return;
    await rollbackDraft.mutate(selectedApiAgent.id);
    refetch();
  };

  // Get all unique categories from all agent configs
  const allActionCategories = Array.from(new Set(Object.values(agentPermissionsConfig).flatMap(config => config.applicableCategories)));
  // Deduplicate by name
  const uniqueCategories = allActionCategories.filter((cat, index, self) => index === self.findIndex((t) => t.name === cat.name));

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
      key="permissions"
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
        {currentAgent && agentConfig ? (
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
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{currentAgent.role}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-md text-xs font-medium border border-gray-200 dark:border-gray-700">
                        {currentAgent.active ? 'Live' : 'Draft'}
                      </span>
                      <span className="px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-md text-xs font-medium border border-indigo-100 dark:border-indigo-800/50 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]">schema</span>
                        {agentConfig.template}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleRollback}
                    className="px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
                  >
                    Reset
                  </button>
                  <button
                    onClick={handleSaveDraft}
                    className="px-4 py-2 text-sm font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-xl transition-colors"
                  >
                    Save draft
                  </button>
                  <button
                    onClick={handlePublishDraft}
                    className="px-4 py-2 text-sm font-bold text-white bg-black dark:bg-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 rounded-xl transition-colors shadow-sm"
                  >
                    Publish changes
                  </button>
                </div>
              </div>
            </div>

            {/* Effective Access Summary */}
            <div className="bg-blue-50/50 dark:bg-blue-900/10 border-b border-blue-100 dark:border-blue-900/30 p-4 px-6 flex items-start gap-3">
              <span className="material-symbols-outlined text-blue-500 mt-0.5">info</span>
              <div>
                <h4 className="text-xs font-bold text-blue-900 dark:text-blue-300 uppercase tracking-wider mb-1">Effective Access Summary</h4>
                <ul className="text-sm text-blue-800 dark:text-blue-400/80 space-y-1 list-disc list-inside">
                  {agentConfig.effectiveAccessSummary.map((summary, idx) => (
                    <li key={idx}>{summary}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="p-8 space-y-12">
              {/* Conflict Detector */}
              {(() => {
                const conflicts = [];
                
                // Example conflict logic
                const hasRefundAllowed = agentConfig.applicableCategories.some(c => c.name === 'Refunds' && c.actions.some(a => actionPermissions[a] === 'Allowed' || actionPermissions[a] === 'Conditional'));
                const hasStripeAccess = toolAccess['Stripe'] && toolAccess['Stripe'] !== 'No access';
                
                if (hasRefundAllowed && !hasStripeAccess) {
                  conflicts.push('Refund actions are enabled, but Stripe access is blocked.');
                }
                
                const hasCommunicationAllowed = agentConfig.applicableCategories.some(c => c.name === 'Communication' && c.actions.some(a => actionPermissions[a] === 'Allowed' || actionPermissions[a] === 'Conditional'));
                const hasZendeskAccess = toolAccess['Zendesk'] && toolAccess['Zendesk'] !== 'No access';
                
                if (hasCommunicationAllowed && !hasZendeskAccess) {
                  conflicts.push('Communication actions are enabled, but Zendesk access is blocked.');
                }

                if (conflicts.length === 0) return null;

                return (
                  <section>
                    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-xl p-4 flex items-start gap-3">
                      <span className="material-symbols-outlined text-amber-500 mt-0.5">warning</span>
                      <div>
                        <h4 className="text-sm font-bold text-amber-900 dark:text-amber-300 mb-2">Configuration Conflicts Detected</h4>
                        <ul className="space-y-1">
                          {conflicts.map((conflict, idx) => (
                            <li key={idx} className="text-xs text-amber-800 dark:text-amber-400/80 flex items-center gap-2">
                              <span className="w-1 h-1 rounded-full bg-amber-500"></span>
                              {conflict}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </section>
                );
              })()}

              {/* Permission Overview */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Permission Overview</h3>
                <div className="grid grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl border border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-900/30">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400 mb-2">
                      <span className="material-symbols-outlined text-sm">check_circle</span>
                      <span className="text-xs font-bold uppercase tracking-wider">Allowed</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {agentConfig.applicableCategories.reduce((acc, cat) => acc + cat.actions.filter(a => actionPermissions[a] === 'Allowed').length, 0)}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/30">
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-2">
                      <span className="material-symbols-outlined text-sm">rule</span>
                      <span className="text-xs font-bold uppercase tracking-wider">Conditional</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {agentConfig.applicableCategories.reduce((acc, cat) => acc + cat.actions.filter(a => actionPermissions[a] === 'Conditional').length, 0)}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-900/10 dark:border-indigo-900/30">
                    <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 mb-2">
                      <span className="material-symbols-outlined text-sm">gavel</span>
                      <span className="text-xs font-bold uppercase tracking-wider">Approval Req.</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {agentConfig.applicableCategories.reduce((acc, cat) => acc + cat.actions.filter(a => actionPermissions[a] === 'Approval').length, 0)}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-900/30">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400 mb-2">
                      <span className="material-symbols-outlined text-sm">block</span>
                      <span className="text-xs font-bold uppercase tracking-wider">Blocked</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {agentConfig.applicableCategories.reduce((acc, cat) => acc + cat.actions.filter(a => !actionPermissions[a] || actionPermissions[a] === 'Blocked').length, 0)}
                    </p>
                  </div>
                </div>
              </section>

              {/* Action Permissions */}
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Action Permissions</h3>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={showFullCatalog} 
                        onChange={(e) => setShowFullCatalog(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500" 
                      />
                      Show non-applicable actions
                    </label>
                  </div>
                </div>
                
                <div className="space-y-6">
                  {(showFullCatalog ? uniqueCategories : agentConfig.applicableCategories).map((category, idx) => {
                    const isApplicable = agentConfig.applicableCategories.some(c => c.name === category.name);
                    
                    return (
                    <div key={idx} className={`border rounded-xl overflow-hidden ${isApplicable ? 'border-gray-200 dark:border-gray-800' : 'border-gray-100 dark:border-gray-800/50 opacity-75'}`}>
                      <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300">{category.name}</h4>
                        </div>
                        <span className="text-xs text-gray-500">{category.actions.length} actions</span>
                      </div>
                      <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {category.actions.map((action, aIdx) => {
                          const state = actionPermissions[action] || 'Blocked';
                          const isExpanded = expandedAction === action;
                          
                          return (
                            <div key={aIdx} className="bg-white dark:bg-card-dark">
                              <div className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{action}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {(['Allowed', 'Conditional', 'Approval', 'Blocked'] as PermissionState[]).map(s => (
                                    <button
                                      key={s}
                                      onClick={() => handlePermissionChange(action, s)}
                                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                                        state === s 
                                          ? s === 'Allowed' ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400' :
                                            s === 'Conditional' ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400' :
                                            s === 'Approval' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/20 dark:border-indigo-800 dark:text-indigo-400' :
                                            'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'
                                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
                                      }`}
                                    >
                                      {s}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              
                              {/* Inline Expansion for Conditional/Approval */}
                              <AnimatePresence>
                                {isExpanded && (state === 'Conditional' || state === 'Approval') && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/10"
                                  >
                                    <div className="p-4 pl-8 border-l-2 border-indigo-500 ml-4 my-4 bg-white dark:bg-gray-800 rounded-r-xl shadow-sm">
                                      <h5 className="text-xs font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-sm text-indigo-500">tune</span>
                                        {state === 'Conditional' ? 'Execution Conditions' : 'Approval Rules'}
                                      </h5>
                                      
                                      {state === 'Conditional' ? (
                                        <div className="space-y-3">
                                          <div className="flex items-center gap-3">
                                            <span className="text-sm text-gray-600 dark:text-gray-400">Only allow if</span>
                                            <select className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                                              <option>Confidence score &gt; 90%</option>
                                              <option>Customer is VIP</option>
                                              <option>Order value &lt; $100</option>
                                              <option>Within business hours</option>
                                            </select>
                                            <button className="text-gray-400 hover:text-indigo-500">
                                              <span className="material-symbols-outlined text-sm">add_circle</span>
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="space-y-3">
                                          <div className="flex items-center gap-3">
                                            <span className="text-sm text-gray-600 dark:text-gray-400">Require approval from</span>
                                            <select className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                                              <option>Tier 2 Support</option>
                                              <option>Manager</option>
                                              <option>Finance Team</option>
                                            </select>
                                          </div>
                                          <div className="flex items-center gap-3">
                                            <span className="text-sm text-gray-600 dark:text-gray-400">Auto-escalate after</span>
                                            <input type="number" defaultValue={24} className="w-16 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
                                            <span className="text-sm text-gray-600 dark:text-gray-400">hours</span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )})}
                </div>
              </section>

              {/* Tool Access */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Tool Access</h3>
                <div className="grid grid-cols-2 gap-4">
                  {[...agentConfig.mainTools, ...agentConfig.optionalTools].map((tool, idx) => {
                    const isMain = agentConfig.mainTools.includes(tool);
                    const level = toolAccess[tool] || (isMain ? 'Full access' : 'No access');
                    return (
                      <div key={idx} className={`border rounded-xl p-4 flex items-center justify-between bg-white dark:bg-card-dark ${isMain ? 'border-indigo-200 dark:border-indigo-800/50' : 'border-gray-200 dark:border-gray-800'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isMain ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                            <span className="material-symbols-outlined text-sm">api</span>
                          </div>
                          <div>
                            <span className="text-sm font-bold text-gray-900 dark:text-white block">{tool}</span>
                            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">{isMain ? 'Main Tool' : 'Optional'}</span>
                          </div>
                        </div>
                        <select 
                          value={level}
                          onChange={(e) => handleToolAccessChange(tool, e.target.value as ToolAccessLevel)}
                          className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                          <option>No access</option>
                          <option>Read only</option>
                          <option>Limited write</option>
                          <option>Approval required</option>
                          <option>Full access</option>
                        </select>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Limits & Thresholds */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Limits & Thresholds</h3>
                <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-xl p-6">
                  <div className="grid grid-cols-2 gap-8">
                    {agentConfig.limits.map((limit, idx) => (
                      <div key={idx}>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">{limit.label}</label>
                        {limit.type === 'number' && (
                          <input type="number" defaultValue={limit.defaultValue} className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
                        )}
                        {limit.type === 'currency' && (
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                            <input type="number" defaultValue={limit.defaultValue} className="w-full pl-8 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
                          </div>
                        )}
                        {limit.type === 'percentage' && (
                          <div className="relative">
                            <input type="number" defaultValue={limit.defaultValue} className="w-full pl-4 pr-8 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                          </div>
                        )}
                        {limit.type === 'tags' && (
                          <div className="flex flex-wrap gap-2">
                            {limit.defaultValue.map((tag: string) => (
                              <span key={tag} className="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold border border-indigo-100 dark:border-indigo-800/50 flex items-center gap-1">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* Hard Blocks */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-red-500">gpp_bad</span>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Hard Blocks</h3>
                </div>
                <div className="space-y-4">
                  {/* Specific Hard Blocks */}
                  {agentConfig.specificHardBlocks.length > 0 && (
                    <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-900/30 rounded-xl p-6">
                      <p className="text-sm text-orange-800 dark:text-orange-300 mb-4">Agent-specific restrictions. These actions are explicitly prohibited for this agent.</p>
                      <div className="space-y-2">
                        {agentConfig.specificHardBlocks.map((block, idx) => (
                          <div key={idx} className="flex items-center gap-3 bg-white dark:bg-gray-800 px-4 py-3 rounded-lg border border-orange-100 dark:border-orange-900/20 shadow-sm">
                            <span className="material-symbols-outlined text-orange-500 text-sm">block</span>
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{block}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Global Hard Blocks */}
                  <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-xl p-6">
                    <p className="text-sm text-red-800 dark:text-red-300 mb-4">Global policies. These actions are strictly prohibited across the entire system.</p>
                    <div className="space-y-2">
                      {agentConfig.globalHardBlocks.map((block, idx) => (
                        <div key={idx} className="flex items-center gap-3 bg-white dark:bg-gray-800 px-4 py-3 rounded-lg border border-red-100 dark:border-red-900/20 shadow-sm opacity-80">
                          <span className="material-symbols-outlined text-red-500 text-sm">lock</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{block}</span>
                          <span className="ml-auto text-[10px] font-bold text-red-500 uppercase tracking-wider">Global Policy</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Approval Rules */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-indigo-500">rule_folder</span>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Global Approval Rules</h3>
                </div>
                <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-xl p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Default Approver</label>
                        <select className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                          <option>Tier 2 Support Team</option>
                          <option>Shift Manager</option>
                          <option>Finance Department</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Evidence Requirements</label>
                        <div className="space-y-2 mt-2">
                          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <input type="checkbox" defaultChecked className="rounded text-indigo-600 focus:ring-indigo-500" />
                            Require customer chat history
                          </label>
                          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <input type="checkbox" defaultChecked className="rounded text-indigo-600 focus:ring-indigo-500" />
                            Require order details
                          </label>
                          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500" />
                            Require manager note
                          </label>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Request Expiration</label>
                        <div className="relative">
                          <input type="number" defaultValue={48} className="w-full pl-4 pr-12 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">hours</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Automatic Escalation</label>
                        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl">
                          <span className="text-sm text-gray-700 dark:text-gray-300">Escalate if no response</span>
                          <div className="w-10 h-5 bg-indigo-500 rounded-full relative cursor-pointer">
                            <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-white rounded-full"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <span className="material-symbols-outlined text-4xl mb-2">admin_panel_settings</span>
              <p>Select an agent to configure permissions</p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
