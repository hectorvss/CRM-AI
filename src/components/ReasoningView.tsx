import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { connectionCategories } from '../connectionsData';
import { agentsApi } from '../api/client';
import { useApi, useMutation } from '../api/hooks';
import { agentReasoningConfig, defaultReasoningConfig, AgentReasoningConfig } from '../agentReasoningConfig';
import { cloneJson, ensureArray, mergeProfile } from './aiStudioProfileUtils';

function createReasoningProfile(base: AgentReasoningConfig, persisted?: Record<string, any> | null): AgentReasoningConfig {
  const merged = mergeProfile(base, persisted);
  return {
    ...merged,
    effectiveReasoningSummary: ensureArray<string>(merged.effectiveReasoningSummary, base.effectiveReasoningSummary),
    contextGathering: ensureArray<string>(merged.contextGathering, base.contextGathering),
    escalationToDeeperThinking: ensureArray<string>(merged.escalationToDeeperThinking, base.escalationToDeeperThinking),
    reasoningTriggersByCaseType: ensureArray<any>(merged.reasoningTriggersByCaseType, base.reasoningTriggersByCaseType),
  };
}

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
  const selectedApiAgent = apiAgents?.find((agent: any) => agent.name === selectedAgent);
  const { data: draftBundle, refetch: refetchBundle } = useApi(
    () => (selectedApiAgent ? agentsApi.policyDraft(selectedApiAgent.id) : Promise.resolve(null as any)),
    [selectedApiAgent?.id],
    null as any,
  );

  const [agentConfig, setAgentConfig] = useState<AgentReasoningConfig>(defaultReasoningConfig);

  useEffect(() => {
    const fallback = selectedAgent && agentReasoningConfig[selectedAgent] ? agentReasoningConfig[selectedAgent] : defaultReasoningConfig;
    const persisted = draftBundle?.bundle?.reasoning_profile ?? selectedApiAgent?.reasoning_profile ?? null;
    setAgentConfig(createReasoningProfile(fallback, persisted));
  }, [selectedAgent, draftBundle, selectedApiAgent]);

  const saveAndRefresh = async (publish = false) => {
    if (!selectedApiAgent) return;
    await saveDraft.mutate({ id: selectedApiAgent.id, body: { reasoning_profile: cloneJson(agentConfig) } });
    if (publish) await publishDraft.mutate(selectedApiAgent.id);
    refetch();
    refetchBundle();
  };

  const handleRollback = async () => {
    if (!selectedApiAgent) return;
    await rollbackDraft.mutate(selectedApiAgent.id);
    refetch();
    refetchBundle();
  };

  const updateTrigger = (index: number, key: 'caseType' | 'reasoningBehavior', value: string) => {
    setAgentConfig(prev => ({
      ...prev,
      reasoningTriggersByCaseType: prev.reasoningTriggersByCaseType.map((trigger, idx) => idx === index ? { ...trigger, [key]: value } : trigger),
    }));
  };

  const filteredCategories = connectionCategories.map(category => ({
    ...category,
    agents: category.agents.filter(agent => {
      const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filter === 'All' ? true : filter === 'Active' ? agent.active : filter === 'Restricted' ? agent.locked : !agent.active;
      return matchesSearch && matchesFilter;
    }),
  })).filter(c => c.agents.length > 0);

  const toggleArrayItem = (key: 'contextGathering' | 'escalationToDeeperThinking', value: string) => {
    setAgentConfig(prev => ({
      ...prev,
      [key]: prev[key].includes(value) ? prev[key].filter(item => item !== value) : [...prev[key], value],
    }));
  };

  return (
    <motion.div key="reasoning" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex gap-6 h-full">
      <div className="w-80 flex-shrink-0 flex flex-col h-full overflow-hidden border-r border-gray-200 dark:border-gray-800 pr-4">
        <div className="space-y-4 mb-6">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-lg">search</span>
            <input type="text" placeholder="Search agents..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" />
          </div>
          <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
            {['All', 'Active', 'Restricted', 'Draft'].map(f => (
              <button key={f} onClick={() => setFilter(f as any)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === f ? 'bg-black dark:bg-white text-white dark:text-black shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>{f}</button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-8 pb-12 pr-2 custom-scrollbar">
          {filteredCategories.map((category, catIdx) => (
            <div key={catIdx} className="space-y-4">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">{category.category}</h3>
              <div className="space-y-3">
                {category.agents.map((agent, agentIdx) => (
                  <div key={agentIdx} onClick={() => setSelectedAgent(agent.name)} className={`bg-white dark:bg-card-dark border rounded-2xl transition-all cursor-pointer ${selectedAgent === agent.name ? 'border-indigo-500 ring-1 ring-indigo-500/20 shadow-md' : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 shadow-sm'}`}>
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl ${agent.iconColor} flex items-center justify-center`}><span className="material-symbols-outlined text-xl">{agent.icon}</span></div>
                        <div><h4 className="text-sm font-bold text-gray-900 dark:text-white">{agent.name}</h4></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-12 custom-scrollbar">
        {currentAgent ? (
          <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-2xl ${currentAgent.iconColor} flex items-center justify-center shadow-inner`}><span className="material-symbols-outlined text-2xl">{currentAgent.icon}</span></div>
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selectedAgent}</h2>
                      <span className="px-2.5 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-full text-xs font-bold border border-green-200 dark:border-green-900/30">Active</span>
                      <span className="px-2.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-full text-xs font-bold border border-indigo-200 dark:border-indigo-900/30 flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">psychology</span>{agentConfig.template}</span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{currentAgent.summary || 'Agent reasoning configuration'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={handleRollback} className="px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors">Reset</button>
                  <button onClick={() => saveAndRefresh(false)} className="px-4 py-2 text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 dark:text-indigo-400 rounded-lg transition-colors">Save draft</button>
                  <button onClick={() => saveAndRefresh(true)} className="px-4 py-2 text-sm font-bold text-white bg-gray-900 hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 rounded-lg transition-colors shadow-sm">Publish</button>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-gray-400 text-sm">info</span><h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Effective Reasoning Summary</h3></div>
                <ul className="space-y-1">
                  {agentConfig.effectiveReasoningSummary.map((summary, idx) => <li key={idx} className="text-sm text-gray-600 dark:text-gray-400 flex items-start gap-2"><span className="material-symbols-outlined text-[14px] text-indigo-500 mt-0.5">check_circle</span>{summary}</li>)}
                </ul>
              </div>
            </div>

            <div className="p-6 space-y-8">
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Reasoning Overview</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50"><div className="flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-indigo-500 text-sm">speed</span><span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Speed vs Precision</span></div><span className="text-sm font-bold text-gray-900 dark:text-white">{agentConfig.speedVsPrecision}</span></div>
                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50"><div className="flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-emerald-500 text-sm">verified</span><span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Verification Level</span></div><span className="text-sm font-bold text-gray-900 dark:text-white">{agentConfig.verificationBehavior}</span></div>
                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50"><div className="flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-amber-500 text-sm">help</span><span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Uncertainty Tolerance</span></div><span className="text-sm font-bold text-gray-900 dark:text-white">{agentConfig.uncertaintyHandling}</span></div>
                </div>
              </section>

              <section className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Core Reasoning Mode</h3>
                  <div className="space-y-2">{['Fast', 'Balanced', 'Thorough', 'Critical', 'Custom'].map(mode => <label key={mode} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"><input type="radio" name="coreReasoningMode" checked={agentConfig.coreReasoningMode === mode} onChange={() => setAgentConfig(prev => ({ ...prev, coreReasoningMode: mode as any }))} className="text-indigo-600 focus:ring-indigo-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{mode}</span></label>)}</div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Depth of Analysis</h3>
                  <div className="space-y-2">{['Minimal scan', 'Standard review', 'Deep review', 'Exhaustive review'].map(depth => <label key={depth} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"><input type="radio" name="depthOfAnalysis" checked={agentConfig.depthOfAnalysis === depth} onChange={() => setAgentConfig(prev => ({ ...prev, depthOfAnalysis: depth as any }))} className="text-indigo-600 focus:ring-indigo-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{depth}</span></label>)}</div>
                </div>
              </section>

              <section className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Speed vs Precision</h3>
                  <div className="space-y-2">{['Fast response', 'Balanced response', 'Precision-first'].map(speed => <label key={speed} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"><input type="radio" name="speedVsPrecision" checked={agentConfig.speedVsPrecision === speed} onChange={() => setAgentConfig(prev => ({ ...prev, speedVsPrecision: speed as any }))} className="text-indigo-600 focus:ring-indigo-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{speed}</span></label>)}</div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Verification Behavior</h3>
                  <div className="space-y-2">{['No formal verification', 'Light verification', 'Moderate verification', 'Strict verification'].map(value => <label key={value} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"><input type="radio" name="verificationBehavior" checked={agentConfig.verificationBehavior === value} onChange={() => setAgentConfig(prev => ({ ...prev, verificationBehavior: value as any }))} className="text-indigo-600 focus:ring-indigo-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{value}</span></label>)}</div>
                </div>
              </section>

              <section className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Context Gathering Requirements</h3>
                  <div className="space-y-2">{['Current message only', 'Case context', 'Related records', 'Customer history', 'Cross-system context if available'].map(value => <label key={value} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"><input type="checkbox" checked={agentConfig.contextGathering.includes(value)} onChange={() => toggleArrayItem('contextGathering', value)} className="rounded text-indigo-600 focus:ring-indigo-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{value}</span></label>)}</div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Multi-source Cross-checking</h3>
                  <div className="space-y-2">{['One trusted source', 'One source + contextual confirmation', 'Multiple sources when available', 'Mandatory multi-source agreement'].map(value => <label key={value} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"><input type="radio" name="multiSourceCrossChecking" checked={agentConfig.multiSourceCrossChecking === value} onChange={() => setAgentConfig(prev => ({ ...prev, multiSourceCrossChecking: value as any }))} className="text-indigo-600 focus:ring-indigo-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{value}</span></label>)}</div>
                </div>
              </section>

              <section className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Uncertainty Handling</h3>
                  <div className="space-y-2">{['Proceed with best-effort judgment', 'Proceed only in low-risk cases', 'Respond with caveats', 'Request more context first', 'Defer decision if confidence is low', 'Avoid action under ambiguity'].map(value => <label key={value} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"><input type="radio" name="uncertaintyHandling" checked={agentConfig.uncertaintyHandling === value} onChange={() => setAgentConfig(prev => ({ ...prev, uncertaintyHandling: value as any }))} className="text-indigo-600 focus:ring-indigo-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{value}</span></label>)}</div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Decision Strictness</h3>
                  <div className="space-y-2">{['Conservative', 'Balanced', 'Assertive', 'Strict-compliance-first', 'Heuristic / flexible'].map(value => <label key={value} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"><input type="radio" name="decisionStrictness" checked={agentConfig.decisionStrictness === value} onChange={() => setAgentConfig(prev => ({ ...prev, decisionStrictness: value as any }))} className="text-indigo-600 focus:ring-indigo-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{value}</span></label>)}</div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Escalation to Deeper Thinking</h3>
                <div className="grid grid-cols-2 gap-3">{['Low confidence', 'Policy conflict detected', 'Missing evidence', 'Contradictory signals', 'High-value case', 'Sensitive customer data involved', 'Unusual or rare pattern detected'].map(value => <label key={value} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"><input type="checkbox" checked={agentConfig.escalationToDeeperThinking.includes(value)} onChange={() => toggleArrayItem('escalationToDeeperThinking', value)} className="rounded text-indigo-600 focus:ring-indigo-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{value}</span></label>)}</div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Response Construction Logic</h3>
                <div className="grid grid-cols-3 gap-3">{['Concise outcome only', 'Outcome + reasoning summary', 'Outcome + evidence references', 'Structured decision explanation', 'Decision + confidence signal', 'Recommendation + uncertainties'].map(value => <label key={value} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"><input type="radio" name="responseConstructionLogic" checked={agentConfig.responseConstructionLogic === value} onChange={() => setAgentConfig(prev => ({ ...prev, responseConstructionLogic: value as any }))} className="text-indigo-600 focus:ring-indigo-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{value}</span></label>)}</div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Reasoning Triggers by Case Type</h3>
                  <button onClick={() => setAgentConfig(prev => ({ ...prev, reasoningTriggersByCaseType: [...prev.reasoningTriggersByCaseType, { caseType: 'New case type', reasoningBehavior: 'Balanced reasoning' }] }))} className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">Add trigger</button>
                </div>
                <div className="space-y-3">
                  {agentConfig.reasoningTriggersByCaseType.map((trigger, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
                      <input value={trigger.caseType} onChange={(e) => updateTrigger(idx, 'caseType', e.target.value)} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white" />
                      <span className="material-symbols-outlined text-gray-400">arrow_forward</span>
                      <input value={trigger.reasoningBehavior} onChange={(e) => updateTrigger(idx, 'reasoningBehavior', e.target.value)} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white" />
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 p-8"><span className="material-symbols-outlined text-6xl mb-4 opacity-20">psychology</span><p className="text-lg font-medium">Select an agent to configure its reasoning profile</p></div>
        )}
      </div>
    </motion.div>
  );
}
