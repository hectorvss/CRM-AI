import React, { useState } from 'react';
import { motion } from 'motion/react';
import { connectionCategories } from '../connectionsData';
import { agentSafetyConfig, defaultSafetyConfig, AgentSafetyConfig } from '../agentSafetyConfig';

export default function SafetyView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<string | null>('Supervisor');
  const [filter, setFilter] = useState<'All' | 'Active' | 'Restricted' | 'Draft'>('All');

  const allAgents = connectionCategories.flatMap(c => c.agents);
  const currentAgent = allAgents.find(a => a.name === selectedAgent);
  const agentConfig: AgentSafetyConfig = selectedAgent && agentSafetyConfig[selectedAgent] 
    ? agentSafetyConfig[selectedAgent] 
    : defaultSafetyConfig;

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
      key="safety"
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
                        <span className="material-symbols-outlined text-[12px]">security</span>
                        {agentConfig.template}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {currentAgent.summary || 'Agent safety configuration'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors">
                    Reset
                  </button>
                  <button className="px-4 py-2 text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 dark:text-indigo-400 rounded-lg transition-colors">
                    Save draft
                  </button>
                  <button className="px-4 py-2 text-sm font-bold text-white bg-gray-900 hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 rounded-lg transition-colors shadow-sm">
                    Publish
                  </button>
                </div>
              </div>

              {/* Effective Safety Summary */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-gray-400 text-sm">shield</span>
                  <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Effective Safety Summary</h3>
                </div>
                <ul className="space-y-1">
                  {agentConfig.effectiveSafetySummary.map((summary, idx) => (
                    <li key={idx} className="text-sm text-gray-600 dark:text-gray-400 flex items-start gap-2">
                      <span className="material-symbols-outlined text-[14px] text-indigo-500 mt-0.5">check_circle</span>
                      {summary}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Conflict Warnings */}
              {(agentConfig.riskProfile === 'High-risk guarded' && agentConfig.allowedAutonomyLevel === 'Act only in low-risk cases') && (
                <div className="mt-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-xl p-4 flex items-start gap-3">
                  <span className="material-symbols-outlined text-red-500 mt-0.5">warning</span>
                  <div>
                    <h4 className="text-sm font-bold text-red-800 dark:text-red-300">Configuration Conflict Detected</h4>
                    <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                      <strong>High-risk guarded</strong> profile is selected, but Autonomy is set to <strong>Act only in low-risk cases</strong>. The agent may never act.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 space-y-8">
              {/* Safety Overview */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Safety Overview</h3>
                <div className="grid grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-red-500 text-sm">block</span>
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Block Rules</span>
                    </div>
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">{agentConfig.overviewMetrics.blockRules}</span>
                  </div>
                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-green-500 text-sm">fact_check</span>
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Safe-to-run Checks</span>
                    </div>
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">{agentConfig.overviewMetrics.safeToRunChecks}</span>
                  </div>
                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-amber-500 text-sm">escalator_warning</span>
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Escalation Triggers</span>
                    </div>
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">{agentConfig.overviewMetrics.escalationTriggers}</span>
                  </div>
                  <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-indigo-500 text-sm">policy</span>
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Audit Triggers</span>
                    </div>
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">{agentConfig.overviewMetrics.auditTriggers}</span>
                  </div>
                </div>
              </section>

              <div className="h-px bg-gray-100 dark:bg-gray-800" />

              {/* Risk Profile & Autonomy */}
              <section className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Risk Profile</h3>
                  <div className="space-y-2">
                    {['Low-risk autonomous', 'Medium-risk supervised', 'High-risk guarded', 'Critical-path restricted', 'Custom'].map((profile) => (
                      <label key={profile} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <input 
                          type="radio" 
                          name="riskProfile" 
                          checked={agentConfig.riskProfile === profile} 
                          readOnly
                          className="text-indigo-600 focus:ring-indigo-500" 
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{profile}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Allowed Autonomy Level</h3>
                  <div className="space-y-2">
                    {['Observe only', 'Recommend only', 'Act only in low-risk cases', 'Act under thresholds', 'Act with safeguards', 'Never act autonomously on sensitive cases'].map((autonomy) => (
                      <label key={autonomy} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <input 
                          type="radio" 
                          name="allowedAutonomyLevel" 
                          checked={agentConfig.allowedAutonomyLevel === autonomy} 
                          readOnly
                          className="text-indigo-600 focus:ring-indigo-500" 
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{autonomy}</span>
                      </label>
                    ))}
                  </div>
                  {agentConfig.allowedAutonomyLevel === 'Act under thresholds' && (
                    <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Value Threshold</label>
                      <input type="number" defaultValue={100} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white" />
                    </div>
                  )}
                </div>
              </section>

              <div className="h-px bg-gray-100 dark:bg-gray-800" />

              {/* Auto-stop & Pre-execution */}
              <section className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Auto-stop Conditions</h3>
                  <p className="text-xs text-gray-500 mb-3">Agent will halt immediately if any of these are met.</p>
                  <div className="space-y-2">
                    {['Evidence missing', 'Confidence too low', 'Policy conflict', 'Contradictory signals', 'Tool unavailable', 'Sensitive data detected', 'High-value transaction', 'Fraud flag present', 'Unsupported case type', 'Action outside scope', 'Required field missing', 'Threshold exceeded', 'Unsafe workflow detected', 'Contradictory signals from sub-agents'].map((condition) => (
                      <label key={condition} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <input 
                          type="checkbox" 
                          checked={agentConfig.autoStopConditions.includes(condition)} 
                          readOnly
                          className="rounded text-indigo-600 focus:ring-indigo-500" 
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{condition}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Pre-execution Safety Checks</h3>
                  <p className="text-xs text-gray-500 mb-3">Mandatory checks before executing sensitive actions.</p>
                  <div className="space-y-2">
                    {['Required evidence present', 'Policy matched successfully', 'No conflict between sources', 'Permission still valid', 'Tool access available', 'Threshold not exceeded', 'Customer/account identity verified', 'No hard block triggered', 'Required fields complete', 'Case status compatible with action', 'Financial context validated', 'Fraud status checked', 'Input format valid', 'Source authenticated'].map((check) => (
                      <label key={check} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <input 
                          type="checkbox" 
                          checked={agentConfig.preExecutionSafetyChecks.includes(check)} 
                          readOnly
                          className="rounded text-indigo-600 focus:ring-indigo-500" 
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{check}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </section>

              <div className="h-px bg-gray-100 dark:bg-gray-800" />

              {/* Sensitive Case Guards */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Sensitive Case Guards</h3>
                <div className="space-y-3">
                  {agentConfig.sensitiveCaseGuards.map((guard, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-amber-500">warning</span>
                        <span className="text-sm font-bold text-gray-900 dark:text-white">{guard.caseType}</span>
                      </div>
                      <select 
                        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        value={guard.action}
                        readOnly
                      >
                        <option>Allow</option>
                        <option>Require extra checks</option>
                        <option>Require human review</option>
                        <option>Block autonomous handling</option>
                      </select>
                    </div>
                  ))}
                  <button className="w-full py-3 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    + Add sensitive case guard
                  </button>
                </div>
              </section>

              <div className="h-px bg-gray-100 dark:bg-gray-800" />

              {/* Uncertainty & Fallback */}
              <section className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Uncertainty Safety Behavior</h3>
                  <div className="space-y-2">
                    {['Proceed with best-effort only in low-risk cases', 'Suggest but do not execute', 'Request more context', 'Block action under ambiguity', 'Escalate when confidence drops below threshold', 'Downgrade from execute to recommend', 'Continue only with additional validation'].map((behavior) => (
                      <label key={behavior} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <input 
                          type="radio" 
                          name="uncertaintySafetyBehavior" 
                          checked={agentConfig.uncertaintySafetyBehavior === behavior} 
                          readOnly
                          className="text-indigo-600 focus:ring-indigo-500" 
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{behavior}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Fallback Behavior</h3>
                  <div className="space-y-2">
                    {['Stop and log', 'Ask for more information', 'Reroute to specialist', 'Create internal note', 'Send to approval queue', 'Notify supervisor agent', 'Notify human operator', 'Return safe default response', 'Park the case for later review'].map((fallback) => (
                      <label key={fallback} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <input 
                          type="radio" 
                          name="fallbackBehavior" 
                          checked={agentConfig.fallbackBehavior === fallback} 
                          readOnly
                          className="text-indigo-600 focus:ring-indigo-500" 
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{fallback}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </section>

              <div className="h-px bg-gray-100 dark:bg-gray-800" />

              {/* Escalation Triggers */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Escalation Triggers</h3>
                <div className="space-y-3">
                  {agentConfig.escalationTriggers.map((trigger, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-indigo-500">escalator_warning</span>
                        <span className="text-sm font-bold text-gray-900 dark:text-white">{trigger.trigger}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Action</span>
                        <select 
                          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          value={trigger.action}
                          readOnly
                        >
                          <option>Escalate to human</option>
                          <option>Escalate to manager</option>
                          <option>Send to approval queue</option>
                          <option>Re-route to specialist agent</option>
                          <option>Freeze case until reviewed</option>
                        </select>
                      </div>
                    </div>
                  ))}
                  <button className="w-full py-3 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    + Add escalation trigger
                  </button>
                </div>
              </section>

              <div className="h-px bg-gray-100 dark:bg-gray-800" />

              {/* Guardrails & Conflict Resolution */}
              <section className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Output and Action Guardrails</h3>
                  <div className="space-y-2">
                    {['Do not expose internal reasoning', 'Do not reveal hidden flags', 'Do not mention internal policies directly to customer', 'Do not surface internal notes externally', 'Do not speculate beyond evidence', 'Do not present uncertain conclusions as facts', 'Do not execute irreversible actions without final check', 'Do not override masked sensitive data rules'].map((guardrail) => (
                      <label key={guardrail} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <input 
                          type="checkbox" 
                          checked={agentConfig.outputAndActionGuardrails.includes(guardrail)} 
                          readOnly
                          className="rounded text-indigo-600 focus:ring-indigo-500" 
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{guardrail}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Conflict Resolution Rules</h3>
                  <div className="space-y-2">
                    {['Hard blocks override everything', 'Global safety rules override local settings', 'Missing evidence blocks sensitive execution', 'Policy conflict triggers stop or escalation', 'Approval requirement overrides autonomy'].map((rule) => (
                      <label key={rule} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <input 
                          type="checkbox" 
                          checked={agentConfig.conflictResolutionRules.includes(rule)} 
                          readOnly
                          className="rounded text-indigo-600 focus:ring-indigo-500" 
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{rule}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </section>

              <div className="h-px bg-gray-100 dark:bg-gray-800" />

              {/* Audit Triggers */}
              <section>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Audit Triggers</h3>
                <div className="grid grid-cols-2 gap-3">
                  {['Blocked action', 'Escalation triggered', 'Sensitive data guard activated', 'Low-confidence action halted', 'Threshold exceeded', 'Approval requested', 'Hard block hit', 'Fallback activated', 'Contradiction detected', 'Unsupported case blocked', 'Parsing failure'].map((audit) => (
                    <label key={audit} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <input 
                        type="checkbox" 
                        checked={agentConfig.auditTriggers.includes(audit)} 
                        readOnly
                        className="rounded text-indigo-600 focus:ring-indigo-500" 
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{audit}</span>
                    </label>
                  ))}
                </div>
              </section>

            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 p-8">
            <span className="material-symbols-outlined text-6xl mb-4 opacity-20">security</span>
            <p className="text-lg font-medium">Select an agent to configure its safety profile</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
