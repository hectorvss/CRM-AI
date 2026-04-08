import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { connectionCategories } from '../connectionsData';
import { agentsApi } from '../api/client';
import { useApi, useMutation } from '../api/hooks';
import { agentReasoningConfig, defaultReasoningConfig, AgentReasoningConfig } from '../agentReasoningConfig';

export default function ReasoningView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<string | null>('Supervisor');
  const [filter, setFilter] = useState<'All' | 'Active' | 'Restricted' | 'Draft'>('All');
  const { data: apiAgents, refetch } = useApi(agentsApi.list, [], []);
  const saveDraft = useMutation((payload: { id: string; body: Record<string, any> }) => agentsApi.updatePolicyDraft(payload.id, payload.body));
  const publishDraft = useMutation((id: string) => agentsApi.publishPolicyDraft(id));
  const rollbackDraft = useMutation((id: string) => agentsApi.rollbackPolicy(id));

  const allAgents = connectionCategories.flatMap(c => c.agents);
  const currentAgent = allAgents.find(a => a.name === selectedAgent);
  const agentConfig: AgentReasoningConfig = selectedAgent && agentReasoningConfig[selectedAgent] 
    ? agentReasoningConfig[selectedAgent] 
    : defaultReasoningConfig;
  const selectedApiAgent = apiAgents?.find((agent: any) => agent.name === selectedAgent);

  const handleSaveDraft = async () => {
    if (!selectedApiAgent) return;
    await saveDraft.mutate({
      id: selectedApiAgent.id,
      body: { reasoning_profile: agentConfig },
    });
    refetch();
  };

  const handlePublishDraft = async () => {
    if (!selectedApiAgent) return;
    await saveDraft.mutate({
      id: selectedApiAgent.id,
      body: { reasoning_profile: agentConfig },
    });
    await publishDraft.mutate(selectedApiAgent.id);
    refetch();
  };

  const handleRollback = async () => {
    if (!selectedApiAgent) return;
    await rollbackDraft.mutate(selectedApiAgent.id);
    refetch();
  };

  const filteredCategories = connectionCategories.map(category => ({
    ...category,
    agents: category.agents.filter(agent => {
      const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = 
        filter === 'All' ? true :
        filter === 'Active' ? agent.active :
        filter === 'Restricted' ? agent.locked :
        filter === 'Draft' ? !agent.active : true;
      return matchesSearch && matchesFilter;
    })
  })).filter(c => c.agents.length > 0);

  return (
    <motion.div
      key="reasoning"
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
            {['All', 'Active', 'Restricted', 'Draft'].map(f => (
              <button 
                key={f}
                onClick={() => setFilter(f as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filter === f 
                    ? 'bg-black dark:bg-white text-white dark:text-black shadow-sm' 
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {f}
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
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-2xl ${currentAgent.iconColor} flex items-center justify-center shadow-inner`}>
                    <span className="material-symbols-outlined text-2xl">{currentAgent.icon}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selectedAgent}</h2>
                      <span className="px-2.5 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-full text-xs font-bold border border-green-200 dark:border-green-900/30">
                        Active
                      </span>
                      <span className="px-2.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-full text-xs font-bold border border-indigo-200 dark:border-indigo-900/30 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]">psychology</span>
                        {agentConfig.template}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {currentAgent.summary || 'Agent reasoning configuration'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleRollback} className="px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors">
                    Reset
                  </button>
                  <button onClick={handleSaveDraft} className="px-4 py-2 text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 dark:text-indigo-400 rounded-lg transition-colors">
                    Save draft
                  </button>
                  <button onClick={handlePublishDraft} className="px-4 py-2 text-sm font-bold text-white bg-gray-900 hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 rounded-lg transition-colors shadow-sm">
                    Publish
                  </button>
                </div>
              </div>

              {/* Effective Reasoning Summary */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-gray-400 text-sm">info</span>
                  <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Effective Reasoning Summary</h3>
                </div>
                <ul className="space-y-1">
                  {agentConfig.effectiveReasoningSummary.map((summary, idx) => (
                    <li key={idx} className="text-sm text-gray-600 dark:text-gray-400 flex items-start gap-2">
                      <span className="material-symbols-outlined text-[14px] text-indigo-500 mt-0.5">check_circle</span>
                      {summary}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Conflict Warnings */}
              {(agentConfig.verificationBehavior === 'Strict verification' && agentConfig.contextGathering.length <= 1) && (
                <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-xl p-4 flex items-start gap-3">
                  <span className="material-symbols-outlined text-red-500 mt-0.5">warning</span>
                  <div>
                    <h4 className="text-sm font-bold text-red-800 dark:text-red-300">Configuration Conflict Detected</h4>
                    <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                      <strong>Strict verification</strong> is enabled, but <strong>Context Gathering</strong> is limited. The agent may fail to verify actions without broader context.
                    </p>
                  </div>
                </div>
              )}
              {(agentConfig.speedVsPrecision === 'Precision-first' && agentConfig.coreReasoningMode === 'Fast') && (
                <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-xl p-4 flex items-start gap-3">
                  <span className="material-symbols-outlined text-red-500 mt-0.5">warning</span>
                  <div>
                    <h4 className="text-sm font-bold text-red-800 dark:text-red-300">Configuration Conflict Detected</h4>
                    <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                      <strong>Precision-first</strong> is enabled, but Core Reasoning Mode is set to <strong>Fast</strong>. These settings contradict each other.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 space-y-8">
              {/* Reasoning Overview */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Reasoning Overview</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-indigo-500 text-sm">speed</span>
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Speed vs Precision</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{agentConfig.speedVsPrecision}</span>
                  </div>
                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">verified</span>
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Verification Level</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{agentConfig.verificationBehavior}</span>
                  </div>
                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-amber-500 text-sm">help</span>
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Uncertainty Tolerance</span>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{agentConfig.uncertaintyHandling}</span>
                  </div>
                </div>
              </section>

              <div className="h-px bg-gray-100 dark:bg-gray-800" />

              {/* Core Reasoning Mode */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Core Reasoning Mode</h3>
                <div className="grid grid-cols-5 gap-3">
                  {['Fast', 'Balanced', 'Thorough', 'Critical', 'Custom'].map((mode) => (
                    <div 
                      key={mode}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        agentConfig.coreReasoningMode === mode
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 shadow-sm'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-bold ${
                          agentConfig.coreReasoningMode === mode ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'
                        }`}>{mode}</span>
                        {agentConfig.coreReasoningMode === mode && (
                          <span className="material-symbols-outlined text-indigo-500 text-[16px]">check_circle</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {(agentConfig.coreReasoningMode === 'Thorough' || agentConfig.coreReasoningMode === 'Critical') && (
                  <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl">
                    <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">Advanced Mode Settings</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Confidence Threshold</label>
                        <select className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white">
                          <option>High (90%+)</option>
                          <option>Very High (95%+)</option>
                          <option>Absolute (99%+)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Reason Before Action</label>
                        <label className="flex items-center gap-2 mt-2 cursor-pointer">
                          <input type="checkbox" defaultChecked className="rounded text-indigo-600 focus:ring-indigo-500" />
                          <span className="text-sm text-gray-700 dark:text-gray-300">Force explicit reasoning step</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <div className="h-px bg-gray-100 dark:bg-gray-800" />

              {/* Depth & Speed */}
              <section className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Depth of Analysis</h3>
                  <div className="space-y-2">
                    {['Minimal scan', 'Standard review', 'Deep review', 'Exhaustive review'].map((depth) => (
                      <label key={depth} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <input 
                          type="radio" 
                          name="depthOfAnalysis" 
                          checked={agentConfig.depthOfAnalysis === depth} 
                          readOnly
                          className="text-indigo-600 focus:ring-indigo-500" 
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{depth}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Speed vs Precision</h3>
                  <div className="space-y-2">
                    {['Fast response', 'Balanced response', 'Precision-first'].map((speed) => (
                      <label key={speed} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <input 
                          type="radio" 
                          name="speedVsPrecision" 
                          checked={agentConfig.speedVsPrecision === speed} 
                          readOnly
                          className="text-indigo-600 focus:ring-indigo-500" 
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{speed}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </section>

              <div className="h-px bg-gray-100 dark:bg-gray-800" />

              {/* Context & Verification */}
              <section className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Context Gathering Requirements</h3>
                  <div className="space-y-2">
                    {['Current message only', 'Case context', 'Related records', 'Customer history', 'Cross-system context if available'].map((context) => (
                      <label key={context} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <input 
                          type="checkbox" 
                          checked={agentConfig.contextGathering.includes(context)} 
                          readOnly
                          className="rounded text-indigo-600 focus:ring-indigo-500" 
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{context}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Verification Behavior</h3>
                  <div className="space-y-2">
                    {['No formal verification', 'Light verification', 'Moderate verification', 'Strict verification'].map((verification) => (
                      <label key={verification} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <input 
                          type="radio" 
                          name="verificationBehavior" 
                          checked={agentConfig.verificationBehavior === verification} 
                          readOnly
                          className="text-indigo-600 focus:ring-indigo-500" 
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{verification}</span>
                      </label>
                    ))}
                  </div>
                  {agentConfig.verificationBehavior === 'Strict verification' && (
                    <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Minimum Evidence Level</label>
                      <select className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white">
                        <option>Direct explicit evidence</option>
                        <option>Strong contextual evidence</option>
                        <option>Corroborated evidence</option>
                      </select>
                    </div>
                  )}
                </div>
              </section>

              <div className="h-px bg-gray-100 dark:bg-gray-800" />

              {/* Cross-checking & Uncertainty */}
              <section className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Multi-source Cross-checking</h3>
                  <div className="space-y-2">
                    {['One trusted source', 'One source + contextual confirmation', 'Multiple sources when available', 'Mandatory multi-source agreement'].map((source) => (
                      <label key={source} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <input 
                          type="radio" 
                          name="multiSourceCrossChecking" 
                          checked={agentConfig.multiSourceCrossChecking === source} 
                          readOnly
                          className="text-indigo-600 focus:ring-indigo-500" 
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{source}</span>
                      </label>
                    ))}
                  </div>
                  {(agentConfig.multiSourceCrossChecking === 'Multiple sources when available' || agentConfig.multiSourceCrossChecking === 'Mandatory multi-source agreement') && (
                    <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Required Source Count</label>
                      <select className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white">
                        <option>At least 2 sources</option>
                        <option>At least 3 sources</option>
                        <option>All available sources</option>
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Uncertainty Handling</h3>
                  <div className="space-y-2">
                    {['Proceed with best-effort judgment', 'Proceed only in low-risk cases', 'Respond with caveats', 'Request more context first', 'Defer decision if confidence is low', 'Avoid action under ambiguity'].map((uncertainty) => (
                      <label key={uncertainty} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <input 
                          type="radio" 
                          name="uncertaintyHandling" 
                          checked={agentConfig.uncertaintyHandling === uncertainty} 
                          readOnly
                          className="text-indigo-600 focus:ring-indigo-500" 
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{uncertainty}</span>
                      </label>
                    ))}
                  </div>
                  {(agentConfig.uncertaintyHandling === 'Proceed with best-effort judgment' || agentConfig.uncertaintyHandling === 'Respond with caveats') && (
                    <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Ambiguity Tolerance</label>
                      <select className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white">
                        <option>Low (Requires most facts)</option>
                        <option>Medium (Can infer missing details)</option>
                        <option>High (Can operate on assumptions)</option>
                      </select>
                    </div>
                  )}
                </div>
              </section>

              <div className="h-px bg-gray-100 dark:bg-gray-800" />

              {/* Escalation & Strictness */}
              <section className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Escalation to Deeper Thinking</h3>
                  <div className="space-y-2">
                    {['Low confidence', 'Policy conflict detected', 'Missing evidence', 'Contradictory signals', 'High-value case', 'Sensitive customer data involved', 'Unusual or rare pattern detected'].map((escalation) => (
                      <label key={escalation} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <input 
                          type="checkbox" 
                          checked={agentConfig.escalationToDeeperThinking.includes(escalation)} 
                          readOnly
                          className="rounded text-indigo-600 focus:ring-indigo-500" 
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{escalation}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Decision Strictness</h3>
                  <div className="space-y-2">
                    {['Conservative', 'Balanced', 'Assertive', 'Strict-compliance-first', 'Heuristic / flexible'].map((strictness) => (
                      <label key={strictness} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <input 
                          type="radio" 
                          name="decisionStrictness" 
                          checked={agentConfig.decisionStrictness === strictness} 
                          readOnly
                          className="text-indigo-600 focus:ring-indigo-500" 
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{strictness}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </section>

              <div className="h-px bg-gray-100 dark:bg-gray-800" />

              {/* Response Construction Logic */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Response Construction Logic</h3>
                <div className="grid grid-cols-3 gap-3">
                  {['Concise outcome only', 'Outcome + reasoning summary', 'Outcome + evidence references', 'Structured decision explanation', 'Decision + confidence signal', 'Recommendation + uncertainties'].map((response) => (
                    <label key={response} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <input 
                        type="radio" 
                        name="responseConstructionLogic" 
                        checked={agentConfig.responseConstructionLogic === response} 
                        readOnly
                        className="text-indigo-600 focus:ring-indigo-500" 
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{response}</span>
                    </label>
                  ))}
                </div>
              </section>

              <div className="h-px bg-gray-100 dark:bg-gray-800" />

              {/* Reasoning Triggers by Case Type */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Reasoning Triggers by Case Type</h3>
                <div className="space-y-3">
                  {agentConfig.reasoningTriggersByCaseType.map((trigger, idx) => (
                    <div key={idx} className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
                      <div className="flex-1">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">When case is</span>
                        <span className="text-sm font-bold text-gray-900 dark:text-white">{trigger.caseType}</span>
                      </div>
                      <span className="material-symbols-outlined text-gray-400">arrow_forward</span>
                      <div className="flex-1">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Apply</span>
                        <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{trigger.reasoningBehavior}</span>
                      </div>
                    </div>
                  ))}
                  <button className="w-full py-3 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    + Add reasoning trigger
                  </button>
                </div>
              </section>

            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 p-8">
            <span className="material-symbols-outlined text-6xl mb-4 opacity-20">psychology</span>
            <p className="text-lg font-medium">Select an agent to configure its reasoning profile</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
