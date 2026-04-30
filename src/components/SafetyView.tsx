import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { connectionCategories } from '../connectionsData';
import { agentsApi } from '../api/client';
import { useApi, useMutation } from '../api/hooks';
import { agentSafetyConfig, defaultSafetyConfig, AgentSafetyConfig } from '../agentSafetyConfig';
import { cloneJson, ensureArray, ensureNumber, mergeProfile } from './aiStudioProfileUtils';
import StyledSelect from './StyledSelect';

function createSafetyProfile(base: AgentSafetyConfig, persisted?: Record<string, any> | null): AgentSafetyConfig {
  const merged = mergeProfile(base, persisted);
  return {
    ...merged,
    effectiveSafetySummary: ensureArray<string>(merged.effectiveSafetySummary, base.effectiveSafetySummary),
    autoStopConditions: ensureArray<string>(merged.autoStopConditions, base.autoStopConditions),
    sensitiveCaseGuards: ensureArray<any>(merged.sensitiveCaseGuards, base.sensitiveCaseGuards),
    preExecutionSafetyChecks: ensureArray<string>(merged.preExecutionSafetyChecks, base.preExecutionSafetyChecks),
    escalationTriggers: ensureArray<any>(merged.escalationTriggers, base.escalationTriggers),
    outputAndActionGuardrails: ensureArray<string>(merged.outputAndActionGuardrails, base.outputAndActionGuardrails),
    conflictResolutionRules: ensureArray<string>(merged.conflictResolutionRules, base.conflictResolutionRules),
    auditTriggers: ensureArray<string>(merged.auditTriggers, base.auditTriggers),
    overviewMetrics: {
      blockRules: ensureNumber(merged.overviewMetrics?.blockRules, base.overviewMetrics.blockRules),
      safeToRunChecks: ensureNumber(merged.overviewMetrics?.safeToRunChecks, base.overviewMetrics.safeToRunChecks),
      escalationTriggers: ensureNumber(merged.overviewMetrics?.escalationTriggers, base.overviewMetrics.escalationTriggers),
      auditTriggers: ensureNumber(merged.overviewMetrics?.auditTriggers, base.overviewMetrics.auditTriggers),
    },
  };
}

export default function SafetyView() {
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

  const [agentConfig, setAgentConfig] = useState<AgentSafetyConfig>(defaultSafetyConfig);

  useEffect(() => {
    const fallback = selectedAgent && agentSafetyConfig[selectedAgent] ? agentSafetyConfig[selectedAgent] : defaultSafetyConfig;
    const persisted = draftBundle?.bundle?.safety_profile ?? selectedApiAgent?.safety_profile ?? null;
    setAgentConfig(createSafetyProfile(fallback, persisted));
  }, [selectedAgent, draftBundle, selectedApiAgent]);

  const saveAndRefresh = async (publish = false) => {
    if (!selectedApiAgent) return;
    await saveDraft.mutate({ id: selectedApiAgent.id, body: { safety_profile: cloneJson(agentConfig) } });
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

  const toggleArrayItem = (key: 'autoStopConditions' | 'preExecutionSafetyChecks' | 'outputAndActionGuardrails' | 'conflictResolutionRules' | 'auditTriggers', value: string) => {
    setAgentConfig(prev => ({ ...prev, [key]: prev[key].includes(value) ? prev[key].filter(item => item !== value) : [...prev[key], value] }));
  };

  const filteredCategories = connectionCategories.map(category => ({
    ...category,
    agents: category.agents.filter(agent => {
      const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filter === 'All' ? true : filter === 'Active' ? agent.active : filter === 'Restricted' ? agent.locked : !agent.active;
      return matchesSearch && matchesFilter;
    }),
  })).filter(c => c.agents.length > 0);

  return (
    <motion.div key="safety" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex gap-6 h-full">
      <div className="w-80 flex-shrink-0 flex flex-col h-full overflow-hidden border-r border-gray-200 dark:border-gray-800 pr-4">
        <div className="space-y-4 mb-6">
          <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-lg">search</span><input type="text" placeholder="Search agents..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" /></div>
          <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700">{['All', 'Active', 'Restricted', 'Draft'].map(f => <button key={f} onClick={() => setFilter(f as 'All' | 'Active' | 'Restricted' | 'Draft')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === f ? 'bg-black dark:bg-white text-white dark:text-black shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>{f}</button>)}</div>
        </div>
        <div className="flex-1 overflow-y-auto space-y-8 pb-12 pr-2 custom-scrollbar">{filteredCategories.map((category, catIdx) => <div key={catIdx} className="space-y-4"><h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">{category.category}</h3><div className="space-y-3">{category.agents.map((agent, agentIdx) => <div key={agentIdx} onClick={() => setSelectedAgent(agent.name)} className={`bg-white dark:bg-card-dark border rounded-2xl transition-all cursor-pointer ${selectedAgent === agent.name ? 'border-indigo-500 ring-1 ring-indigo-500/20 shadow-md' : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 shadow-sm'}`}><div className="p-4 flex items-center justify-between"><div className="flex items-center gap-4"><div className={`w-10 h-10 rounded-xl ${agent.iconColor} flex items-center justify-center`}><span className="material-symbols-outlined text-xl">{agent.icon}</span></div><div><h4 className="text-sm font-bold text-gray-900 dark:text-white">{agent.name}</h4></div></div></div></div>)}</div></div>)}</div>
      </div>

      <div className="flex-1 overflow-y-auto pb-12 custom-scrollbar">
        {currentAgent ? (
          <div className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4"><div className={`w-14 h-14 rounded-2xl ${currentAgent.iconColor} flex items-center justify-center shadow-inner`}><span className="material-symbols-outlined text-2xl">{currentAgent.icon}</span></div><div><div className="flex items-center gap-3 mb-1"><h2 className="text-xl font-bold text-gray-900 dark:text-white">{selectedAgent}</h2><span className="px-2.5 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-full text-xs font-bold border border-green-200 dark:border-green-900/30">Active</span><span className="px-2.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-full text-xs font-bold border border-indigo-200 dark:border-indigo-900/30 flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">security</span>{agentConfig.template}</span></div><p className="text-sm text-gray-500 dark:text-gray-400">{currentAgent.summary || 'Agent safety configuration'}</p></div></div>
                <div className="flex items-center gap-2"><button onClick={handleRollback} className="px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors">Reset</button><button onClick={() => saveAndRefresh(false)} className="px-4 py-2 text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 dark:text-indigo-400 rounded-lg transition-colors">Save draft</button><button onClick={() => saveAndRefresh(true)} className="px-4 py-2 text-sm font-bold text-white bg-gray-900 hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 rounded-lg transition-colors shadow-sm">Publish</button></div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700"><div className="flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-gray-400 text-sm">shield</span><h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Effective Safety Summary</h3></div><ul className="space-y-1">{agentConfig.effectiveSafetySummary.map((summary, idx) => <li key={idx} className="text-sm text-gray-600 dark:text-gray-400 flex items-start gap-2"><span className="material-symbols-outlined text-[14px] text-indigo-500 mt-0.5">check_circle</span>{summary}</li>)}</ul></div>
            </div>

            <div className="p-6 space-y-8">
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Safety Overview</h3>
                <div className="grid grid-cols-4 gap-4">
                  {Object.entries(agentConfig.overviewMetrics).map(([key, value]) => <div key={key} className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50"><div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{key.replace(/([A-Z])/g, ' $1')}</div><input type="number" value={value} onChange={(e) => setAgentConfig(prev => ({ ...prev, overviewMetrics: { ...prev.overviewMetrics, [key]: Number(e.target.value) || 0 } }))} className="w-full bg-transparent text-2xl font-bold text-gray-900 dark:text-white outline-none" /></div>)}
                </div>
              </section>

              <section className="grid grid-cols-2 gap-6">
                <div><h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Risk Profile</h3><div className="space-y-2">{['Low-risk autonomous', 'Medium-risk supervised', 'High-risk guarded', 'Critical-path restricted', 'Custom'].map(value => <label key={value} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"><input type="radio" name="riskProfile" checked={agentConfig.riskProfile === value} onChange={() => setAgentConfig(prev => ({ ...prev, riskProfile: value as AgentSafetyConfig['riskProfile'] }))} className="text-indigo-600 focus:ring-indigo-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{value}</span></label>)}</div></div>
                <div><h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Allowed Autonomy Level</h3><div className="space-y-2">{['Observe only', 'Recommend only', 'Act only in low-risk cases', 'Act under thresholds', 'Act with safeguards', 'Never act autonomously on sensitive cases'].map(value => <label key={value} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"><input type="radio" name="allowedAutonomyLevel" checked={agentConfig.allowedAutonomyLevel === value} onChange={() => setAgentConfig(prev => ({ ...prev, allowedAutonomyLevel: value as AgentSafetyConfig['allowedAutonomyLevel'] }))} className="text-indigo-600 focus:ring-indigo-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{value}</span></label>)}</div></div>
              </section>

              <section className="grid grid-cols-2 gap-6">
                <div><h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Auto-stop Conditions</h3><div className="space-y-2">{['Evidence missing', 'Confidence too low', 'Policy conflict', 'Contradictory signals', 'Tool unavailable', 'Sensitive data detected', 'High-value transaction', 'Fraud flag present', 'Unsupported case type', 'Action outside scope', 'Required field missing', 'Threshold exceeded', 'Unsafe workflow detected', 'Contradictory signals from sub-agents'].map(value => <label key={value} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"><input type="checkbox" checked={agentConfig.autoStopConditions.includes(value)} onChange={() => toggleArrayItem('autoStopConditions', value)} className="rounded text-indigo-600 focus:ring-indigo-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{value}</span></label>)}</div></div>
                <div><h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Pre-execution Safety Checks</h3><div className="space-y-2">{['Required evidence present', 'Policy matched successfully', 'No conflict between sources', 'Permission still valid', 'Tool access available', 'Threshold not exceeded', 'Customer/account identity verified', 'No hard block triggered', 'Required fields complete', 'Case status compatible with action', 'Financial context validated', 'Fraud status checked', 'Input format valid', 'Source authenticated'].map(value => <label key={value} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"><input type="checkbox" checked={agentConfig.preExecutionSafetyChecks.includes(value)} onChange={() => toggleArrayItem('preExecutionSafetyChecks', value)} className="rounded text-indigo-600 focus:ring-indigo-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{value}</span></label>)}</div></div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold text-gray-900 dark:text-white">Sensitive Case Guards</h3><button onClick={() => setAgentConfig(prev => ({ ...prev, sensitiveCaseGuards: [...prev.sensitiveCaseGuards, { caseType: 'New sensitive case', action: 'Require human review' }] }))} className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">Add guard</button></div>
                <div className="space-y-3">{agentConfig.sensitiveCaseGuards.map((guard, idx) => <div key={idx} className="grid grid-cols-[1fr_220px] gap-4 items-center p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30"><input value={guard.caseType} onChange={(e) => setAgentConfig(prev => ({ ...prev, sensitiveCaseGuards: prev.sensitiveCaseGuards.map((item, itemIdx) => itemIdx === idx ? { ...item, caseType: e.target.value } : item) }))} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white" /><StyledSelect value={guard.action} onChange={(e) => setAgentConfig(prev => ({ ...prev, sensitiveCaseGuards: prev.sensitiveCaseGuards.map((item, itemIdx) => itemIdx === idx ? { ...item, action: e.target.value as any } : item) }))} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"><option>Allow</option><option>Require extra checks</option><option>Require human review</option><option>Block autonomous handling</option></StyledSelect></div>)}</div>
              </section>

              <section className="grid grid-cols-2 gap-6">
                <div><h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Uncertainty Safety Behavior</h3><div className="space-y-2">{['Proceed with best-effort only in low-risk cases', 'Suggest but do not execute', 'Request more context', 'Block action under ambiguity', 'Escalate when confidence drops below threshold', 'Downgrade from execute to recommend', 'Continue only with additional validation'].map(value => <label key={value} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"><input type="radio" name="uncertaintySafetyBehavior" checked={agentConfig.uncertaintySafetyBehavior === value} onChange={() => setAgentConfig(prev => ({ ...prev, uncertaintySafetyBehavior: value as AgentSafetyConfig['uncertaintySafetyBehavior'] }))} className="text-indigo-600 focus:ring-indigo-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{value}</span></label>)}</div></div>
                <div><h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Fallback Behavior</h3><div className="space-y-2">{['Stop and log', 'Ask for more information', 'Reroute to specialist', 'Create internal note', 'Send to approval queue', 'Notify supervisor agent', 'Notify human operator', 'Return safe default response', 'Park the case for later review'].map(value => <label key={value} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"><input type="radio" name="fallbackBehavior" checked={agentConfig.fallbackBehavior === value} onChange={() => setAgentConfig(prev => ({ ...prev, fallbackBehavior: value as AgentSafetyConfig['fallbackBehavior'] }))} className="text-indigo-600 focus:ring-indigo-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{value}</span></label>)}</div></div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-bold text-gray-900 dark:text-white">Escalation Triggers</h3><button onClick={() => setAgentConfig(prev => ({ ...prev, escalationTriggers: [...prev.escalationTriggers, { trigger: 'New escalation trigger', action: 'Escalate to human' }] }))} className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">Add trigger</button></div>
                <div className="space-y-3">{agentConfig.escalationTriggers.map((trigger, idx) => <div key={idx} className="grid grid-cols-[1fr_220px] gap-4 items-center p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30"><input value={trigger.trigger} onChange={(e) => setAgentConfig(prev => ({ ...prev, escalationTriggers: prev.escalationTriggers.map((item, itemIdx) => itemIdx === idx ? { ...item, trigger: e.target.value } : item) }))} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white" /><StyledSelect value={trigger.action} onChange={(e) => setAgentConfig(prev => ({ ...prev, escalationTriggers: prev.escalationTriggers.map((item, itemIdx) => itemIdx === idx ? { ...item, action: e.target.value as any } : item) }))} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"><option>Escalate to human</option><option>Escalate to manager</option><option>Send to approval queue</option><option>Re-route to specialist agent</option><option>Freeze case until reviewed</option></StyledSelect></div>)}</div>
              </section>

              <section className="grid grid-cols-2 gap-6">
                <div><h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Output and Action Guardrails</h3><div className="space-y-2">{['Do not expose internal reasoning', 'Do not reveal hidden flags', 'Do not mention internal policies directly to customer', 'Do not surface internal notes externally', 'Do not speculate beyond evidence', 'Do not present uncertain conclusions as facts', 'Do not execute irreversible actions without final check', 'Do not override masked sensitive data rules'].map(value => <label key={value} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"><input type="checkbox" checked={agentConfig.outputAndActionGuardrails.includes(value)} onChange={() => toggleArrayItem('outputAndActionGuardrails', value)} className="rounded text-indigo-600 focus:ring-indigo-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{value}</span></label>)}</div></div>
                <div><h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Conflict Resolution Rules</h3><div className="space-y-2">{['Hard blocks override everything', 'Global safety rules override local settings', 'Missing evidence blocks sensitive execution', 'Policy conflict triggers stop or escalation', 'Approval requirement overrides autonomy'].map(value => <label key={value} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"><input type="checkbox" checked={agentConfig.conflictResolutionRules.includes(value)} onChange={() => toggleArrayItem('conflictResolutionRules', value)} className="rounded text-indigo-600 focus:ring-indigo-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{value}</span></label>)}</div></div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Audit Triggers</h3>
                <div className="grid grid-cols-2 gap-3">{['Blocked action', 'Escalation triggered', 'Sensitive data guard activated', 'Low-confidence action halted', 'Threshold exceeded', 'Approval requested', 'Hard block hit', 'Fallback activated', 'Contradiction detected', 'Unsupported case blocked', 'Parsing failure'].map(value => <label key={value} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"><input type="checkbox" checked={agentConfig.auditTriggers.includes(value)} onChange={() => toggleArrayItem('auditTriggers', value)} className="rounded text-indigo-600 focus:ring-indigo-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{value}</span></label>)}</div>
              </section>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 p-8"><span className="material-symbols-outlined text-6xl mb-4 opacity-20">security</span><p className="text-lg font-medium">Select an agent to configure its safety profile</p></div>
        )}
      </div>
    </motion.div>
  );
}
