import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { connectionCategories } from '../connectionsData';
import { agentsApi, policyRulesApi } from '../api/client';
import { useApi, useMutation } from '../api/hooks';
import {
  agentPermissionsConfig,
  defaultAgentConfig,
  PermissionState,
  ToolAccessLevel,
  AgentPermissionConfig,
} from '../agentPermissionsConfig';
import { cloneJson, ensureArray, ensureBoolean, ensureNumber, ensureRecord, mergeProfile, mergeRecord } from './aiStudioProfileUtils';
import { MinimalButton, MinimalPill } from './MinimalCategoryShell';
import StyledSelect from './StyledSelect';
import PolicyActionsBar from './PolicyActionsBar';

type PermissionProfileState = AgentPermissionConfig & {
  actionPermissions: Record<string, PermissionState>;
  toolAccess: Record<string, ToolAccessLevel>;
  conditionalRules: Record<string, string[]>;
  approvalAssignments: Record<string, string>;
  approvalEscalationHours: Record<string, number>;
  defaultApprover: string;
  evidenceRequirements: {
    chatHistory: boolean;
    orderDetails: boolean;
    managerNote: boolean;
  };
  requestExpirationHours: number;
  automaticEscalation: boolean;
};

const defaultConditionalRule = 'Confidence score > 90%';
const approverOptions = ['Tier 2 Support', 'Manager', 'Finance Team'];

function createPermissionProfile(base: AgentPermissionConfig, persisted?: Record<string, any> | null): PermissionProfileState {
  const merged = mergeProfile(base, persisted);
  return {
    ...merged,
    actionPermissions: mergeRecord<PermissionState>(ensureRecord(base.actionPermissions), persisted?.actionPermissions),
    toolAccess: mergeRecord<ToolAccessLevel>(ensureRecord(base.toolAccess), persisted?.toolAccess),
    conditionalRules: mergeRecord<string[]>(ensureRecord(base.conditionalRules), persisted?.conditionalRules),
    approvalAssignments: mergeRecord<string>(ensureRecord(base.approvalAssignments), persisted?.approvalAssignments),
    approvalEscalationHours: mergeRecord<number>(ensureRecord(base.approvalEscalationHours), persisted?.approvalEscalationHours),
    defaultApprover: typeof persisted?.defaultApprover === 'string' ? persisted.defaultApprover : (base.defaultApprover || 'Tier 2 Support Team'),
    evidenceRequirements: {
      chatHistory: ensureBoolean(persisted?.evidenceRequirements?.chatHistory, base.evidenceRequirements?.chatHistory ?? true),
      orderDetails: ensureBoolean(persisted?.evidenceRequirements?.orderDetails, base.evidenceRequirements?.orderDetails ?? true),
      managerNote: ensureBoolean(persisted?.evidenceRequirements?.managerNote, base.evidenceRequirements?.managerNote ?? false),
    },
    requestExpirationHours: ensureNumber(persisted?.requestExpirationHours, 48),
    automaticEscalation: ensureBoolean(persisted?.automaticEscalation, base.automaticEscalation ?? true),
  };
}

export default function PermissionsView() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>('Supervisor');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [showFullCatalog, setShowFullCatalog] = useState(false);
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  const { data: apiAgents, refetch } = useApi(agentsApi.list, [], []);
  const saveDraft = useMutation((payload: { id: string; body: Record<string, any> }) => agentsApi.updatePolicyDraft(payload.id, payload.body));
  const publishDraft = useMutation((id: string) => agentsApi.publishPolicyDraft(id));
  const rollbackDraft = useMutation((id: string) => agentsApi.rollbackPolicy(id));

  const allAgents = connectionCategories.flatMap(c => c.agents);
  const currentAgent = allAgents.find(a => a.name === selectedAgent);
  const baseConfig = currentAgent ? (agentPermissionsConfig[currentAgent.name] || defaultAgentConfig) : null;
  const selectedApiAgent = apiAgents?.find((agent: any) => agent.name === selectedAgent);
  const { data: draftBundle, refetch: refetchBundle } = useApi(
    () => (selectedApiAgent ? agentsApi.policyDraft(selectedApiAgent.id) : Promise.resolve(null as any)),
    [selectedApiAgent?.id],
    null as any,
  );

  const [profile, setProfile] = useState<PermissionProfileState | null>(null);

  useEffect(() => {
    if (!baseConfig) {
      setProfile(null);
      return;
    }
    const persisted = draftBundle?.bundle?.permission_profile ?? selectedApiAgent?.permission_profile ?? null;
    setProfile(createPermissionProfile(baseConfig, persisted));
  }, [baseConfig, draftBundle, selectedApiAgent]);

  // Live policy rules from DB
  const { data: dbRulesRaw, refetch: refetchRules } = useApi(policyRulesApi.list, [], []);
  const dbRules: any[] = Array.isArray(dbRulesRaw) ? dbRulesRaw : [];
  const toggleRule = useMutation((payload: { id: string; is_active: boolean }) =>
    policyRulesApi.update(payload.id, { is_active: payload.is_active }),
  );
  const createRule = useMutation((payload: Record<string, any>) => policyRulesApi.create(payload));
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleEntity, setNewRuleEntity] = useState('payment');
  const [showNewRuleForm, setShowNewRuleForm] = useState(false);

  const handleCreateRule = async () => {
    if (!newRuleName.trim()) return;
    await createRule.mutate({
      name: newRuleName.trim(),
      entity_type: newRuleEntity,
      is_active: true,
      priority: 500,
      conditions: [],
      action_mapping: { action: 'allow', action_types: [] },
    });
    setNewRuleName('');
    setShowNewRuleForm(false);
    refetchRules();
    setStatusMessage('Policy rule created and synced with the live catalog.');
  };

  const allActionCategories = Array.from(new Set(Object.values(agentPermissionsConfig).flatMap(config => config.applicableCategories)));
  const uniqueCategories = allActionCategories.filter((cat, index, self) => index === self.findIndex(t => t.name === cat.name));
  const displayedCategories = useMemo(
    () => (showFullCatalog ? uniqueCategories : profile?.applicableCategories ?? []),
    [showFullCatalog, uniqueCategories, profile],
  );

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
    }),
  })).filter(c => c.agents.length > 0);

  const conflictMessages = useMemo(() => {
    if (!profile) return [];
    const conflicts: string[] = [];
    const hasRefundAllowed = profile.applicableCategories.some(
      c => c.name === 'Refunds' && c.actions.some(a => ['Allowed', 'Conditional'].includes(profile.actionPermissions[a] || 'Blocked')),
    );
    const hasStripeAccess = profile.toolAccess['Stripe'] && profile.toolAccess['Stripe'] !== 'No access';
    if (hasRefundAllowed && !hasStripeAccess) conflicts.push('Refund actions are enabled, but Stripe access is blocked.');

    const hasCommunicationAllowed = profile.applicableCategories.some(
      c => c.name === 'Communication' && c.actions.some(a => ['Allowed', 'Conditional'].includes(profile.actionPermissions[a] || 'Blocked')),
    );
    const hasZendeskAccess = profile.toolAccess['Zendesk'] && profile.toolAccess['Zendesk'] !== 'No access';
    if (hasCommunicationAllowed && !hasZendeskAccess) conflicts.push('Communication actions are enabled, but Zendesk access is blocked.');

    return conflicts;
  }, [profile]);

  const handlePermissionChange = (action: string, state: PermissionState) => {
    setProfile(prev => {
      if (!prev) return prev;
      const next = cloneJson(prev);
      next.actionPermissions[action] = state;
      if (state === 'Conditional' && !next.conditionalRules[action]?.length) next.conditionalRules[action] = [defaultConditionalRule];
      if (state === 'Approval') {
        next.approvalAssignments[action] ||= 'Tier 2 Support';
        next.approvalEscalationHours[action] ||= 24;
      }
      return next;
    });
    if (state === 'Conditional' || state === 'Approval') setExpandedAction(action);
    else if (expandedAction === action) setExpandedAction(null);
  };

  const handleToolAccessChange = (tool: string, level: ToolAccessLevel) => {
    setProfile(prev => prev ? { ...prev, toolAccess: { ...prev.toolAccess, [tool]: level } } : prev);
  };

  const handleLimitChange = (id: string, value: any) => {
    setProfile(prev => prev ? {
      ...prev,
      limits: prev.limits.map(limit => limit.id === id ? { ...limit, defaultValue: value } : limit),
    } : prev);
  };

  const handleEvidenceChange = (key: keyof PermissionProfileState['evidenceRequirements']) => {
    setProfile(prev => prev ? {
      ...prev,
      evidenceRequirements: { ...prev.evidenceRequirements, [key]: !prev.evidenceRequirements[key] },
    } : prev);
  };

  const saveAndRefresh = async (publish = false) => {
    if (!selectedApiAgent || !profile) return;
    await saveDraft.mutate({
      id: selectedApiAgent.id,
      body: { permission_profile: cloneJson(profile) },
    });
    if (publish) await publishDraft.mutate(selectedApiAgent.id);
    refetch();
    refetchBundle();
    setStatusMessage(publish ? 'Permission profile published to the runtime.' : 'Permission draft saved.');
  };

  const handleRollback = async () => {
    if (!selectedApiAgent) return;
    await rollbackDraft.mutate(selectedApiAgent.id);
    refetch();
    refetchBundle();
    setStatusMessage('Permission draft reset to the last published version.');
  };

  const permissionCounts = profile ? {
    Allowed: profile.applicableCategories.reduce((acc, cat) => acc + cat.actions.filter(a => (profile.actionPermissions[a] || 'Blocked') === 'Allowed').length, 0),
    Conditional: profile.applicableCategories.reduce((acc, cat) => acc + cat.actions.filter(a => (profile.actionPermissions[a] || 'Blocked') === 'Conditional').length, 0),
    Approval: profile.applicableCategories.reduce((acc, cat) => acc + cat.actions.filter(a => (profile.actionPermissions[a] || 'Blocked') === 'Approval').length, 0),
    Blocked: profile.applicableCategories.reduce((acc, cat) => acc + cat.actions.filter(a => (profile.actionPermissions[a] || 'Blocked') === 'Blocked').length, 0),
  } : { Allowed: 0, Conditional: 0, Approval: 0, Blocked: 0 };

  return (
    <motion.div key="permissions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex gap-6 h-full">
      <div className="w-80 flex-shrink-0 flex flex-col h-full overflow-hidden border-r border-[#e9eae6] dark:border-[#e9eae6] pr-4">
        <div className="space-y-4 mb-6">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[#a4a4a2] text-[14px]">search</span>
            <input type="text" placeholder="Search agents..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-white border border-[#e9eae6] dark:border-[#e9eae6] rounded-[12px] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/15 transition-all" />
          </div>
          <div className="flex bg-[#ededea] p-1 rounded-[12px] border border-[#e9eae6] dark:border-[#e9eae6]">
            {['All', 'Active', 'Restricted', 'Draft'].map(filter => (
              <button key={filter} onClick={() => setActiveFilter(filter)} className={`px-3 py-1.5 rounded-[8px] text-[12px] font-bold transition-all ${activeFilter === filter ? 'bg-black dark:bg-white text-white shadow-[0px_1px_2px_rgba(20,20,20,0.04)]' : 'text-[#646462] dark:text-[#a4a4a2] hover:text-[#1a1a1a]'}`}>
                {filter}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-5 pb-12 pr-2 custom-scrollbar">
          {filteredCategories.map((category, catIdx) => (
            <div key={catIdx} className="space-y-4">
              <h3 className="text-[10px] font-bold text-[#a4a4a2] uppercase tracking-widest px-1">{category.category}</h3>
              <div className="space-y-3">
                {category.agents.map((agent, agentIdx) => (
                  <div key={agentIdx} onClick={() => setSelectedAgent(agent.name)} className={`bg-white dark:bg-white border rounded-[12px] transition-all cursor-pointer ${selectedAgent === agent.name ? 'border-[#1a1a1a] ring-1 ring-[#1a1a1a]/15 shadow-[0px_1px_4px_rgba(20,20,20,0.08)]' : 'border-[#e9eae6] dark:border-[#e9eae6] hover:border-[#e9eae6] dark:hover:border-[#e9eae6] shadow-[0px_1px_2px_rgba(20,20,20,0.04)]'}`}>
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-[12px] ${agent.iconColor} flex items-center justify-center`}>
                          <span className="material-symbols-outlined text-[15px]">{agent.icon}</span>
                        </div>
                        <h4 className="text-[13px] font-bold text-[#1a1a1a]">{agent.name}</h4>
                      </div>
                      <div className="flex items-center gap-4">
                        {agent.locked ? (
                          <div className="flex items-center gap-1.5 text-[#a4a4a2]">
                            <span className="material-symbols-outlined text-[13px]">lock</span>
                            <span className="text-[10px] font-mono uppercase tracking-[0.6px]">Locked ON</span>
                          </div>
                        ) : (
                        <div className={`w-8 h-4 rounded-full relative transition-colors ${agent.active ? 'bg-[#dc2626]' : 'bg-gray-300 dark:bg-gray-700'}`}>
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

      <div className="flex-1 overflow-y-auto pb-12 custom-scrollbar">
        {currentAgent && profile ? (
          <div className="bg-white dark:bg-white rounded-[12px] border border-[#e9eae6] dark:border-[#e9eae6] shadow-[0px_1px_2px_rgba(20,20,20,0.04)] overflow-hidden">
            <div className="p-5 border-b border-[#e9eae6] dark:border-[#e9eae6] bg-[#f8f8f7]/50">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-[12px] ${currentAgent.iconColor} flex items-center justify-center `}>
                    <span className="material-symbols-outlined text-[20px]">{currentAgent.icon}</span>
                  </div>
                  <div>
                    <h2 className="text-[16px] font-bold text-[#1a1a1a]">{currentAgent.name}</h2>
                    <p className="text-[13px] text-[#646462] dark:text-[#a4a4a2] mt-1">{currentAgent.role}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <span className="px-2 py-1 bg-[#ededea] text-[#646462] dark:text-[#c4c4c2] rounded-[6px] text-[12px] font-medium border border-[#e9eae6] dark:border-[#e9eae6]">{currentAgent.active ? 'Live' : 'Draft'}</span>
                      <span className="px-2 py-1 bg-[#f8f8f7] dark:bg-indigo-900/30 text-[#1a1a1a] dark:text-[#1a1a1a] rounded-[6px] text-[12px] font-medium border border-indigo-100 dark:border-indigo-800/50 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[12px]">schema</span>
                        {profile.template}
                      </span>
                    </div>
                  </div>
                </div>
                <PolicyActionsBar
                  scope="Permissions"
                  agentName={selectedAgent || 'this agent'}
                  resetting={rollbackDraft.loading}
                  saving={saveDraft.loading}
                  publishing={publishDraft.loading}
                  onReset={handleRollback}
                  onSaveDraft={() => saveAndRefresh(false)}
                  onPublish={() => saveAndRefresh(true)}
                />
              </div>
            </div>

            {statusMessage ? (
              <div className="border-b border-[#e9eae6] px-6 py-4">
                <div className="rounded-[18px] border border-[#e9eae6] bg-white px-4 py-3 text-[13px] text-[#1a1a1a]">
                  {statusMessage}
                </div>
              </div>
            ) : null}

            <div className="border-b border-[#e9eae6] p-4 px-6 flex items-start gap-3">
              <span className="material-symbols-outlined text-[#1a1a1a] mt-0.5">info</span>
              <div>
                <h4 className="text-[12px] font-bold text-[#1a1a1a] uppercase tracking-wider mb-1">Effective Access Summary</h4>
                <ul className="text-[13px] text-[#646462] dark:text-[#c4c4c2] space-y-1 list-disc list-inside">
                  {ensureArray<string>(profile.effectiveAccessSummary).map((summary, idx) => <li key={idx}>{summary}</li>)}
                </ul>
              </div>
            </div>

            <div className="p-5 space-y-12">
              {conflictMessages.length > 0 && (
                <section>
                  <div className="bg-white border border-[#e9eae6] rounded-[12px] p-4 flex items-start gap-3">
                    <span className="material-symbols-outlined text-[#1a1a1a] mt-0.5">warning</span>
                    <div>
                      <h4 className="text-[13px] font-bold text-[#1a1a1a] mb-2">Configuration Conflicts Detected</h4>
                      <ul className="space-y-1">
                        {conflictMessages.map((conflict, idx) => <li key={idx} className="text-[12px] text-[#646462] dark:text-[#c4c4c2] flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-[#dc2626]"></span>{conflict}</li>)}
                      </ul>
                    </div>
                  </div>
                </section>
              )}

              <section>
                <h3 className="text-[13px] font-bold text-[#1a1a1a] mb-4">Permission Overview</h3>
                <div className="grid grid-cols-4 gap-4">
                  <div className="p-4 rounded-[12px] border border-[#e9eae6] bg-white"><div className="flex items-center gap-2 text-[#1a1a1a] dark:text-[#c4c4c2] mb-2"><span className="material-symbols-outlined text-[13px]">check_circle</span><span className="text-[12px] font-mono uppercase tracking-[0.6px]">Allowed</span></div><p className="text-[20px] font-bold text-[#1a1a1a]">{permissionCounts.Allowed}</p></div>
                  <div className="p-4 rounded-[12px] border border-[#e9eae6] bg-white"><div className="flex items-center gap-2 text-[#1a1a1a] dark:text-[#c4c4c2] mb-2"><span className="material-symbols-outlined text-[13px]">rule</span><span className="text-[12px] font-mono uppercase tracking-[0.6px]">Conditional</span></div><p className="text-[20px] font-bold text-[#1a1a1a]">{permissionCounts.Conditional}</p></div>
                  <div className="p-4 rounded-[12px] border border-[#e9eae6] bg-white"><div className="flex items-center gap-2 text-[#1a1a1a] dark:text-[#c4c4c2] mb-2"><span className="material-symbols-outlined text-[13px]">gavel</span><span className="text-[12px] font-mono uppercase tracking-[0.6px]">Approval Req.</span></div><p className="text-[20px] font-bold text-[#1a1a1a]">{permissionCounts.Approval}</p></div>
                  <div className="p-4 rounded-[12px] border border-[#e9eae6] bg-white"><div className="flex items-center gap-2 text-[#1a1a1a] dark:text-[#c4c4c2] mb-2"><span className="material-symbols-outlined text-[13px]">block</span><span className="text-[12px] font-mono uppercase tracking-[0.6px]">Blocked</span></div><p className="text-[20px] font-bold text-[#1a1a1a]">{permissionCounts.Blocked}</p></div>
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-[13px] font-bold text-[#1a1a1a]">Action Permissions</h3>
                  <label className="flex items-center gap-2 text-[12px] text-[#646462] dark:text-[#a4a4a2] cursor-pointer">
                    <input type="checkbox" checked={showFullCatalog} onChange={(e) => setShowFullCatalog(e.target.checked)} className="rounded text-[#1a1a1a] focus:ring-[#1a1a1a]" />
                    Show non-applicable actions
                  </label>
                </div>

                <div className="space-y-5">
                  {displayedCategories.map((category, idx) => {
                    const isApplicable = profile.applicableCategories.some(c => c.name === category.name);
                    return (
                      <div key={idx} className={`border rounded-[12px] overflow-hidden ${isApplicable ? 'border-[#e9eae6] dark:border-[#e9eae6]' : 'border-[#e9eae6] dark:border-[#e9eae6]/50 opacity-75'}`}>
                        <div className="bg-[#f8f8f7]/50 px-4 py-3 border-b border-[#e9eae6] dark:border-[#e9eae6] flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <h4 className="text-[13px] font-bold text-[#1a1a1a] dark:text-[#c4c4c2]">{category.name}</h4>
                          </div>
                          <span className="text-[12px] text-[#646462]">{category.actions.length} actions</span>
                        </div>
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                          {category.actions.map((action, actionIndex) => {
                            const state = profile.actionPermissions[action] || 'Blocked';
                            const isExpanded = expandedAction === action;
                            return (
                              <div key={actionIndex} className="bg-white dark:bg-white">
                                <div className="px-4 py-3 flex items-center justify-between hover:bg-[#f8f8f7]/30 transition-colors">
                                  <span className="text-[13px] font-medium text-[#1a1a1a] dark:text-[#ededea]">{action}</span>
                                  <div className="flex items-center gap-2">
                                    {(['Allowed', 'Conditional', 'Approval', 'Blocked'] as PermissionState[]).map(option => (
                                      <button
                                        key={option}
                                        onClick={() => handlePermissionChange(action, option)}
                                        className={`px-3 py-1.5 rounded-[8px] text-[12px] font-bold transition-all border ${
                                          state === option
                                            ? option === 'Allowed' ? 'bg-[#f8f8f7] border-[#e9eae6] text-[#1a1a1a] dark:bg-green-900/20 dark:border-green-800 dark:text-[#1a1a1a]' :
                                              option === 'Conditional' ? 'bg-[#f8f8f7] border-[#e9eae6] text-[#1a1a1a] dark:bg-amber-900/20 dark:border-amber-800 dark:text-[#1a1a1a]' :
                                              option === 'Approval' ? 'bg-[#f8f8f7] border-[#e9eae6] text-[#1a1a1a] dark:bg-[#f8f8f7] dark:border-indigo-800 dark:text-[#1a1a1a]' :
                                              'bg-[#f8f8f7] border-[#e9eae6] text-[#1a1a1a] dark:bg-red-900/20 dark:border-red-800 dark:text-[#1a1a1a]'
                                            : 'bg-white border-[#e9eae6] dark:border-[#e9eae6] text-[#646462] hover:bg-[#f8f8f7] dark:hover:bg-gray-700'
                                        }`}
                                      >
                                        {option}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <AnimatePresence>
                                  {isExpanded && (state === 'Conditional' || state === 'Approval') && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-[#e9eae6] dark:border-[#e9eae6] bg-[#f8f8f7]/50/10">
                                      <div className="p-4 pl-8 border-l-2 border-[#1a1a1a] ml-4 my-4 bg-white rounded-r-xl shadow-[0px_1px_2px_rgba(20,20,20,0.04)]">
                                        <h5 className="text-[12px] font-bold text-[#1a1a1a] mb-3 flex items-center gap-2">
                                          <span className="material-symbols-outlined text-[13px] text-[#1a1a1a]">tune</span>
                                          {state === 'Conditional' ? 'Execution Conditions' : 'Approval Rules'}
                                        </h5>

                                        {state === 'Conditional' ? (
                                          <div className="space-y-3">
                                            <div className="flex items-center gap-3">
                                              <span className="text-[13px] text-[#646462] dark:text-[#a4a4a2]">Only allow if</span>
                                              <StyledSelect
                                                value={ensureArray<string>(profile.conditionalRules[action], [defaultConditionalRule])[0]}
                                                onChange={(e) => setProfile(prev => prev ? { ...prev, conditionalRules: { ...prev.conditionalRules, [action]: [e.target.value] } } : prev)}
                                                className="bg-[#f8f8f7] dark:bg-[#1a1a1a] border border-[#e9eae6] dark:border-[#e9eae6] rounded-[8px] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/15"
                                              >
                                                <option>Confidence score &gt; 90%</option>
                                                <option>Customer is VIP</option>
                                                <option>Order value &lt; $100</option>
                                                <option>Within business hours</option>
                                              </StyledSelect>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="space-y-3">
                                            <div className="flex items-center gap-3">
                                              <span className="text-[13px] text-[#646462] dark:text-[#a4a4a2]">Require approval from</span>
                                              <StyledSelect
                                                value={profile.approvalAssignments[action] || 'Tier 2 Support'}
                                                onChange={(e) => setProfile(prev => prev ? { ...prev, approvalAssignments: { ...prev.approvalAssignments, [action]: e.target.value } } : prev)}
                                                className="bg-[#f8f8f7] dark:bg-[#1a1a1a] border border-[#e9eae6] dark:border-[#e9eae6] rounded-[8px] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/15"
                                              >
                                                {approverOptions.map(option => <option key={option}>{option}</option>)}
                                              </StyledSelect>
                                            </div>
                                            <div className="flex items-center gap-3">
                                              <span className="text-[13px] text-[#646462] dark:text-[#a4a4a2]">Auto-escalate after</span>
                                              <input
                                                type="number"
                                                value={profile.approvalEscalationHours[action] || 24}
                                                onChange={(e) => setProfile(prev => prev ? { ...prev, approvalEscalationHours: { ...prev.approvalEscalationHours, [action]: Number(e.target.value) || 0 } } : prev)}
                                                className="w-16 bg-[#f8f8f7] dark:bg-[#1a1a1a] border border-[#e9eae6] dark:border-[#e9eae6] rounded-[8px] px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/15"
                                              />
                                              <span className="text-[13px] text-[#646462] dark:text-[#a4a4a2]">hours</span>
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
                    );
                  })}
                </div>
              </section>

              <section>
                <h3 className="text-[13px] font-bold text-[#1a1a1a] mb-4">Tool Access</h3>
                <div className="grid grid-cols-2 gap-4">
                  {[...profile.mainTools, ...profile.optionalTools].map((tool, idx) => {
                    const isMain = profile.mainTools.includes(tool);
                    const level = profile.toolAccess[tool] || (isMain ? 'Full access' : 'No access');
                    return (
                      <div key={idx} className={`border rounded-[12px] p-4 flex items-center justify-between bg-white dark:bg-white ${isMain ? 'border-[#e9eae6] dark:border-indigo-800/50' : 'border-[#e9eae6] dark:border-[#e9eae6]'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-[8px] flex items-center justify-center ${isMain ? 'bg-[#f8f8f7] text-[#1a1a1a]' : 'bg-[#ededea] text-[#646462]'}`}>
                            <span className="material-symbols-outlined text-[13px]">api</span>
                          </div>
                          <div>
                            <span className="text-[13px] font-bold text-[#1a1a1a] block">{tool}</span>
                            <span className="text-[10px] text-[#646462] uppercase tracking-wider font-bold">{isMain ? 'Main Tool' : 'Optional'}</span>
                          </div>
                        </div>
                        <StyledSelect value={level} onChange={(e) => handleToolAccessChange(tool, e.target.value as ToolAccessLevel)} className="bg-[#f8f8f7] dark:bg-[#1a1a1a] border border-[#e9eae6] dark:border-[#e9eae6] rounded-[8px] px-3 py-1.5 text-[12px] font-medium focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/15">
                          <option>No access</option>
                          <option>Read only</option>
                          <option>Limited write</option>
                          <option>Approval required</option>
                          <option>Full access</option>
                        </StyledSelect>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section>
                <h3 className="text-[13px] font-bold text-[#1a1a1a] mb-4">Limits & Thresholds</h3>
                <div className="bg-white dark:bg-white border border-[#e9eae6] dark:border-[#e9eae6] rounded-[12px] p-5">
                  <div className="grid grid-cols-2 gap-6">
                    {profile.limits.map((limit, idx) => (
                      <div key={idx}>
                        <label className="block text-[12px] font-bold text-[#1a1a1a] dark:text-[#c4c4c2] mb-1">{limit.label}</label>
                        {limit.type === 'number' && <input type="number" value={Number(limit.defaultValue) || 0} onChange={(e) => handleLimitChange(limit.id, Number(e.target.value) || 0)} className="w-full px-4 py-2 bg-[#f8f8f7] dark:bg-[#1a1a1a] border border-[#e9eae6] dark:border-[#e9eae6] rounded-[12px] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/15" />}
                        {limit.type === 'currency' && <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#646462]">$</span><input type="number" value={Number(limit.defaultValue) || 0} onChange={(e) => handleLimitChange(limit.id, Number(e.target.value) || 0)} className="w-full pl-8 pr-4 py-2 bg-[#f8f8f7] dark:bg-[#1a1a1a] border border-[#e9eae6] dark:border-[#e9eae6] rounded-[12px] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/15" /></div>}
                        {limit.type === 'percentage' && <div className="relative"><input type="number" value={Number(limit.defaultValue) || 0} onChange={(e) => handleLimitChange(limit.id, Number(e.target.value) || 0)} className="w-full pl-4 pr-8 py-2 bg-[#f8f8f7] dark:bg-[#1a1a1a] border border-[#e9eae6] dark:border-[#e9eae6] rounded-[12px] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/15" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#646462]">%</span></div>}
                        {limit.type === 'tags' && <input type="text" value={ensureArray<string>(limit.defaultValue).join(', ')} onChange={(e) => handleLimitChange(limit.id, e.target.value.split(',').map(tag => tag.trim()).filter(Boolean))} className="w-full px-4 py-2 bg-[#f8f8f7] dark:bg-[#1a1a1a] border border-[#e9eae6] dark:border-[#e9eae6] rounded-[12px] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/15" />}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-[#1a1a1a]">gpp_bad</span>
                  <h3 className="text-[13px] font-bold text-[#1a1a1a]">Hard Blocks</h3>
                </div>
                <div className="space-y-4">
                  {profile.specificHardBlocks.length > 0 && (
                    <div className="bg-[#f8f8f7] dark:bg-orange-900/10 border border-[#e9eae6] dark:border-orange-900/30 rounded-[12px] p-5">
                      <p className="text-[13px] text-orange-800 dark:text-orange-300 mb-4">Agent-specific restrictions. These actions are explicitly prohibited for this agent.</p>
                      <div className="space-y-2">
                        {profile.specificHardBlocks.map((block, idx) => (
                          <div key={idx} className="flex items-center gap-3 bg-white px-4 py-3 rounded-[8px] border border-orange-100 dark:border-orange-900/20 shadow-[0px_1px_2px_rgba(20,20,20,0.04)]">
                            <span className="material-symbols-outlined text-[#1a1a1a] text-[13px]">block</span>
                            <span className="text-[13px] font-medium text-[#1a1a1a] dark:text-[#ededea]">{block}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="bg-white border border-[#e9eae6] rounded-[12px] p-5">
                    <p className="text-[13px] text-[#646462] dark:text-[#c4c4c2] mb-4">Global policies. These actions are strictly prohibited across the entire system.</p>
                    <div className="space-y-2">
                      {profile.globalHardBlocks.map((block, idx) => (
                        <div key={idx} className="flex items-center gap-3 bg-white px-4 py-3 rounded-[8px] border border-red-100 dark:border-red-900/20 shadow-[0px_1px_2px_rgba(20,20,20,0.04)] opacity-80">
                          <span className="material-symbols-outlined text-[#1a1a1a] text-[13px]">lock</span>
                          <span className="text-[13px] font-medium text-[#1a1a1a] dark:text-[#ededea]">{block}</span>
                          <span className="ml-auto text-[10px] font-bold text-[#1a1a1a] uppercase tracking-wider">Global Policy</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-[#1a1a1a]">rule_folder</span>
                  <h3 className="text-[13px] font-bold text-[#1a1a1a]">Global Approval Rules</h3>
                </div>
                <div className="bg-white dark:bg-white border border-[#e9eae6] dark:border-[#e9eae6] rounded-[12px] p-5 space-y-5">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[12px] font-bold text-[#1a1a1a] dark:text-[#c4c4c2] mb-1">Default Approver</label>
                        <StyledSelect value={profile.defaultApprover} onChange={(e) => setProfile(prev => prev ? { ...prev, defaultApprover: e.target.value } : prev)} className="w-full bg-[#f8f8f7] dark:bg-[#1a1a1a] border border-[#e9eae6] dark:border-[#e9eae6] rounded-[12px] px-4 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/15">
                          <option>Tier 2 Support Team</option>
                          <option>Shift Manager</option>
                          <option>Finance Department</option>
                        </StyledSelect>
                      </div>
                      <div>
                        <label className="block text-[12px] font-bold text-[#1a1a1a] dark:text-[#c4c4c2] mb-1">Evidence Requirements</label>
                        <div className="space-y-2 mt-2">
                          <label className="flex items-center gap-2 text-[13px] text-[#1a1a1a] dark:text-[#c4c4c2]"><input type="checkbox" checked={profile.evidenceRequirements.chatHistory} onChange={() => handleEvidenceChange('chatHistory')} className="rounded text-[#1a1a1a] focus:ring-[#1a1a1a]" />Require customer chat history</label>
                          <label className="flex items-center gap-2 text-[13px] text-[#1a1a1a] dark:text-[#c4c4c2]"><input type="checkbox" checked={profile.evidenceRequirements.orderDetails} onChange={() => handleEvidenceChange('orderDetails')} className="rounded text-[#1a1a1a] focus:ring-[#1a1a1a]" />Require order details</label>
                          <label className="flex items-center gap-2 text-[13px] text-[#1a1a1a] dark:text-[#c4c4c2]"><input type="checkbox" checked={profile.evidenceRequirements.managerNote} onChange={() => handleEvidenceChange('managerNote')} className="rounded text-[#1a1a1a] focus:ring-[#1a1a1a]" />Require manager note</label>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[12px] font-bold text-[#1a1a1a] dark:text-[#c4c4c2] mb-1">Request Expiration</label>
                        <div className="relative">
                          <input type="number" value={profile.requestExpirationHours} onChange={(e) => setProfile(prev => prev ? { ...prev, requestExpirationHours: Number(e.target.value) || 0 } : prev)} className="w-full pl-4 pr-12 py-2 bg-[#f8f8f7] dark:bg-[#1a1a1a] border border-[#e9eae6] dark:border-[#e9eae6] rounded-[12px] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/15" />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#646462] text-[13px]">hours</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[12px] font-bold text-[#1a1a1a] dark:text-[#c4c4c2] mb-1">Automatic Escalation</label>
                        <button type="button" onClick={() => setProfile(prev => prev ? { ...prev, automaticEscalation: !prev.automaticEscalation } : prev)} className="w-full flex items-center justify-between p-3 bg-[#f8f8f7] dark:bg-[#1a1a1a] border border-[#e9eae6] dark:border-[#e9eae6] rounded-[12px]">
                          <span className="text-[13px] text-[#1a1a1a] dark:text-[#c4c4c2]">Escalate if no response</span>
                          <div className={`w-10 h-5 rounded-full relative cursor-pointer ${profile.automaticEscalation ? 'bg-[#dc2626]' : 'bg-gray-300 dark:bg-gray-700'}`}>
                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full ${profile.automaticEscalation ? 'right-0.5' : 'left-0.5'}`}></div>
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* â”€â”€ Live DB Policy Rules â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#1a1a1a]">policy</span>
                    <h3 className="text-[13px] font-bold text-[#1a1a1a]">Live Policy Rules</h3>
                    <span className="px-2 py-0.5 bg-white text-[#1a1a1a] rounded-full text-[10px] font-bold border border-[#e9eae6]">
                      {dbRules.filter((r: any) => r.is_active).length} active
                    </span>
                  </div>
                  <button
                    onClick={() => setShowNewRuleForm(prev => !prev)}
                    className="text-[12px] font-bold text-[#1a1a1a] dark:text-[#1a1a1a] hover:underline flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[13px]">add</span>
                    New rule
                  </button>
                </div>

                <AnimatePresence>
                  {showNewRuleForm && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-4 p-4 bg-white border border-[#e9eae6] rounded-[12px] space-y-3"
                    >
                      <h4 className="text-[12px] font-bold text-[#1a1a1a] uppercase tracking-wider">New Policy Rule</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[12px] font-medium text-[#646462] dark:text-[#a4a4a2] mb-1">Rule name</label>
                          <input
                            value={newRuleName}
                            onChange={(e) => setNewRuleName(e.target.value)}
                            placeholder="e.g. Block high-value refunds"
                            className="w-full bg-white dark:bg-[#1a1a1a] border border-[#e9eae6] dark:border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/15"
                          />
                        </div>
                        <div>
                          <label className="block text-[12px] font-medium text-[#646462] dark:text-[#a4a4a2] mb-1">Entity type</label>
                          <StyledSelect
                            value={newRuleEntity}
                            onChange={(e) => setNewRuleEntity(e.target.value)}
                            className="w-full bg-white dark:bg-[#1a1a1a] border border-[#e9eae6] dark:border-[#e9eae6] rounded-[8px] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1a1a1a]/15"
                          >
                            {['payment', 'order', 'case', 'return', 'customer', 'approval', 'knowledge'].map(t => (
                              <option key={t}>{t}</option>
                            ))}
                          </StyledSelect>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={handleCreateRule}
                          disabled={!newRuleName.trim() || createRule.loading}
                          className="px-4 py-2 text-[13px] font-bold text-white bg-black hover:bg-black/90 disabled:opacity-50 rounded-[8px] transition-colors"
                        >
                          {createRule.loading ? 'Creatingâ€¦' : 'Create rule'}
                        </button>
                        <button
                          onClick={() => setShowNewRuleForm(false)}
                          className="px-4 py-2 text-[13px] font-bold text-[#646462] dark:text-[#c4c4c2] hover:bg-[#ededea] rounded-[8px] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {dbRules.length === 0 ? (
                  <div className="text-center py-10 text-[#a4a4a2] dark:text-[#646462] border border-dashed border-[#e9eae6] dark:border-[#e9eae6] rounded-[12px]">
                    <span className="material-symbols-outlined text-[28px] mb-2 block opacity-40">policy</span>
                    <p className="text-[13px]">No policy rules yet. Add one above to enforce live policies on agent actions.</p>
                  </div>
                ) : (
                  <div className="border border-[#e9eae6] dark:border-[#e9eae6] rounded-[12px] overflow-hidden">
                    <div className="bg-[#f8f8f7]/50 px-4 py-3 border-b border-[#e9eae6] dark:border-[#e9eae6] grid grid-cols-[1fr_120px_100px_80px] gap-4">
                      <span className="text-[12px] font-bold text-[#646462] uppercase tracking-wider">Rule</span>
                      <span className="text-[12px] font-bold text-[#646462] uppercase tracking-wider">Entity</span>
                      <span className="text-[12px] font-bold text-[#646462] uppercase tracking-wider">Action</span>
                      <span className="text-[12px] font-bold text-[#646462] uppercase tracking-wider text-right">Active</span>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {dbRules.map((rule: any) => (
                        <div key={rule.id} className="bg-white dark:bg-white px-4 py-3 grid grid-cols-[1fr_120px_100px_80px] gap-4 items-center hover:bg-[#f8f8f7]/30 transition-colors">
                          <div>
                            <p className="text-[13px] font-medium text-[#1a1a1a] dark:text-[#ededea] leading-tight">{rule.name}</p>
                            {rule.priority != null && (
                              <p className="text-[10px] text-[#a4a4a2] mt-0.5">Priority {rule.priority}</p>
                            )}
                          </div>
                          <span className="px-2 py-1 bg-[#ededea] text-[#646462] dark:text-[#a4a4a2] rounded-[6px] text-[12px] font-medium border border-[#e9eae6] dark:border-[#e9eae6]">
                            {rule.entity_type ?? 'â€”'}
                          </span>
                          <span className={`px-2 py-1 rounded-[6px] text-[12px] font-bold border ${
                            rule.action_mapping?.action === 'block' || rule.action_mapping?.action === 'deny'
                              ? 'bg-[#f8f8f7] border-[#e9eae6] text-[#1a1a1a] dark:bg-red-900/20 dark:border-red-800 dark:text-[#1a1a1a]'
                              : rule.action_mapping?.action === 'approval_required' || rule.action_mapping?.action === 'require_approval'
                              ? 'bg-[#f8f8f7] border-[#e9eae6] text-[#1a1a1a] dark:bg-[#f8f8f7] dark:border-indigo-800 dark:text-[#1a1a1a]'
                              : 'bg-[#f8f8f7] border-[#e9eae6] text-[#1a1a1a] dark:bg-green-900/20 dark:border-green-800 dark:text-[#1a1a1a]'
                          }`}>
                            {rule.action_mapping?.action ?? 'allow'}
                          </span>
                          <div className="flex justify-end">
                            <button
                              onClick={async () => {
                                await toggleRule.mutate({ id: rule.id, is_active: !rule.is_active });
                                refetchRules();
                              }}
                              className={`w-10 h-5 rounded-full relative transition-colors ${rule.is_active ? 'bg-[#dc2626]' : 'bg-gray-300 dark:bg-gray-700'}`}
                            >
                              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${rule.is_active ? 'right-0.5' : 'left-0.5'}`}></div>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-[#a4a4a2]">
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
