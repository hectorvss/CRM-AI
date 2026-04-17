import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Page } from '../types';
import TreeGraph from './TreeGraph';
import { casesApi } from '../api/client';
import { useApi } from '../api/hooks';
import type { GraphBranch } from './TreeGraph';
import LoadingState from './LoadingState';

type RightTab = 'details' | 'copilot';
type ResolveTab = 'overview' | 'identifiers' | 'policy' | 'execution';

interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  time: string;
}

function formatStatus(value?: string | null) {
  if (!value) return 'N/A';
  return value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function branchStatusMap(status: string): 'healthy' | 'warning' | 'critical' {
  if (status === 'critical' || status === 'blocked') return 'critical';
  if (status === 'warning' || status === 'pending') return 'warning';
  return 'healthy';
}

function nodeStatusMap(status: string): 'healthy' | 'warning' | 'critical' {
  if (status === 'critical' || status === 'blocked') return 'critical';
  if (status === 'warning' || status === 'pending') return 'warning';
  return 'healthy';
}

function pageFromBranchKey(key?: string | null): Page | null {
  if (!key) return null;
  const normalized = key.toLowerCase();
  if (normalized.includes('conversation') || normalized.includes('message') || normalized.includes('note')) return 'inbox';
  if (normalized.includes('reconciliation')) return 'reports';
  if (normalized.includes('linked')) return 'case_graph';
  if (normalized.includes('payment')) return 'payments';
  if (normalized.includes('return')) return 'returns';
  if (normalized.includes('order') || normalized.includes('fulfillment') || normalized.includes('shipping') || normalized.includes('warehouse')) return 'orders';
  if (normalized.includes('approval') || normalized.includes('policy')) return 'approvals';
  if (normalized.includes('workflow') || normalized.includes('agent')) return 'workflows';
  if (normalized.includes('knowledge') || normalized.includes('article')) return 'knowledge';
  if (normalized.includes('integration') || normalized.includes('connector') || normalized.includes('webhook')) return 'tools_integrations';
  return null;
}

function pageFromText(text?: string | null): Page | null {
  if (!text) return null;
  const value = text.toLowerCase();
  if (/(refund|payment|psp|charge|settlement|invoice|captured|authorized|dispute)/.test(value)) return 'payments';
  if (/(return|rma|replacement|exchange)/.test(value)) return 'returns';
  if (/(fulfill|warehouse|shipping|shipment|order|oms|packing|tracking|delivery|inventory|cancel)/.test(value)) return 'orders';
  if (/(approval|manager|policy|review|authorization|approve|reject)/.test(value)) return 'approvals';
  if (/(workflow|automation|orchestration|run|agent)/.test(value)) return 'workflows';
  if (/(knowledge|article|policy bundle|kb|documentation)/.test(value)) return 'knowledge';
  if (/(connector|integration|webhook|stripe|shopify|intercom)/.test(value)) return 'tools_integrations';
  return null;
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function CaseGraph({ onPageChange, focusCaseId }: { onPageChange: (page: Page) => void; focusCaseId?: string | null }) {
  const [rightTab, setRightTab] = useState<RightTab>('copilot');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [graphView, setGraphView] = useState<'tree' | 'timeline' | 'resolve'>('tree');
  const [resolveTab, setResolveTab] = useState<ResolveTab>('overview');

  // ── Copilot state ────────────────────────────────────────────────
  const [copilotMessages, setCopilotMessages] = useState<CopilotMessage[]>([]);
  const [copilotInput, setCopilotInput] = useState('');
  const [isCopilotSending, setIsCopilotSending] = useState(false);
  const [showCaseBrief, setShowCaseBrief] = useState(false);
  const copilotBottomRef = useRef<HTMLDivElement>(null);
  const copilotInputRef = useRef<HTMLInputElement>(null);
  const welcomeSentForRef = useRef<string | null>(null);

  // Reset chat when case changes
  useEffect(() => {
    setCopilotMessages([]);
    setShowCaseBrief(false);
    welcomeSentForRef.current = null;
  }, [selectedId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    copilotBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [copilotMessages, isCopilotSending]);

  // Auto-welcome when state data loads for the selected case
  useEffect(() => {
    if (!selectedId || !stateData) return;
    if (welcomeSentForRef.current === selectedId) return;
    welcomeSentForRef.current = selectedId;

    const name = selectedCase?.customerName;
    const caseNum = selectedCase?.orderId;
    const parts: string[] = [];

    if (name) {
      parts.push(`I've loaded the full state for ${name}${caseNum ? ` (${caseNum})` : ''}.`);
    }
    const summary = stateData?.case?.ai_diagnosis || resolveData?.conflict?.summary;
    if (summary) parts.push(summary);
    const rootCause = resolveData?.conflict?.root_cause || stateData?.case?.ai_root_cause;
    if (rootCause) parts.push(`Root cause: ${rootCause}`);
    const conflict = resolveData?.conflict?.title;
    if (conflict) parts.push(`Active blocker: ${conflict}`);
    parts.push('What would you like to dig into?');

    setCopilotMessages([{
      id: `welcome-${selectedId}`,
      role: 'assistant',
      content: parts.join('\n\n'),
      time: nowTime(),
    }]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, stateData, resolveData]);

  // ── Fetch case list ──────────────────────────────────────────────
  const { data: apiCases, loading: casesLoading } = useApi(() => casesApi.list(), [], []);
  const cases = useMemo(() => (apiCases || []).map((c: any) => ({
    id: c.id,
    orderId: Array.isArray(c.order_ids) && c.order_ids.length > 0 ? c.order_ids[0] : c.case_number,
    customerName: c.customer_name || c.case_number,
    summary: c.ai_diagnosis || c.conflict_summary?.recommended_action || formatStatus(c.type),
    lastUpdate: c.last_activity_at ? new Date(c.last_activity_at).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-',
    status: c.status,
    riskLevel: c.risk_level,
    badges: [
      ...(c.conflict_summary?.has_conflict ? ['Conflict'] : []),
      ...(c.risk_level === 'high' || c.risk_level === 'critical' ? ['High Risk'] : []),
      ...(c.status === 'blocked' ? ['Blocked'] : []),
    ],
  })), [apiCases]);

  useEffect(() => {
    if (!selectedId && cases.length > 0) setSelectedId(cases[0].id);
  }, [cases, selectedId]);

  useEffect(() => {
    if (!focusCaseId || !cases.length) return;
    const target = cases.find((c) => c.id === focusCaseId || c.orderId === focusCaseId || c.customerName === focusCaseId);
    if (target && target.id !== selectedId) {
      setSelectedId(target.id);
    }
  }, [cases, focusCaseId, selectedId]);

  // ── Fetch case graph (branches + timeline) ──────────────────────
  const { data: graphData, loading: graphLoading } = useApi(
    () => selectedId ? casesApi.graph(selectedId) : Promise.resolve(null),
    [selectedId]
  );

  // ── Fetch case resolve data ─────────────────────────────────────
  const { data: resolveData, loading: resolveLoading } = useApi(
    () => selectedId ? casesApi.resolve(selectedId) : Promise.resolve(null),
    [selectedId]
  );

  // ── Fetch case state ────────────────────────────────────────────
  const { data: stateData, loading: stateLoading } = useApi(
    () => selectedId ? casesApi.state(selectedId) : Promise.resolve(null),
    [selectedId]
  );

  // ── Map graph API response to TreeGraph branches ────────────────
  const branches: GraphBranch[] = useMemo(() => {
    if (!graphData?.branches) return [];
    const pageMap: Record<string, Page> = {
      orders: 'orders', payments: 'payments', returns: 'returns',
      fulfillment: 'orders', approvals: 'approvals', workflows: 'workflows',
      knowledge: 'knowledge', integrations: 'tools_integrations',
      refunds: 'payments',
      conversation: 'inbox', notes: 'inbox', linked_cases: 'case_graph', reconciliation: 'reports',
    };
    return graphData.branches.map((b: any) => {
      const branchId = b.key || b.id || 'unknown';
      return {
        id: branchId,
        label: b.label,
        icon: b.nodes?.[0]?.icon || iconForBranch(branchId),
        page: pageMap[branchId] || ('case_graph' as Page),
        status: branchStatusMap(b.status),
        nodes: (b.nodes || []).map((n: any) => ({
          id: n.id || n.key || String(Math.random()),
          label: n.label,
          status: nodeStatusMap(n.status),
          context: n.context || n.value || n.source || '',
          icon: n.icon || iconForBranch(branchId),
          timestamp: n.timestamp,
        })),
      };
    });
  }, [graphData]);

  // ── Timeline data from graph API ────────────────────────────────
  const timeline = useMemo(() => graphData?.timeline || [], [graphData]);

  // ── Root data from graph API ────────────────────────────────────
  const rootData = useMemo(() => {
    if (graphData?.root) {
      return {
        orderId: graphData.root.order_id || graphData.root.case_number || '',
        customerName: graphData.root.customer_name || '',
        riskLevel: graphData.root.risk_level || 'Low Risk',
        status: graphData.root.status || 'Open',
      };
    }
    const selected = cases.find(c => c.id === selectedId);
    return {
      orderId: selected?.orderId || '',
      customerName: selected?.customerName || '',
      riskLevel: 'Low Risk',
      status: selected?.status || 'Open',
    };
  }, [graphData, cases, selectedId]);

  // ── Resolve data ────────────────────────────────────────────────
  const caseResolve = resolveData || {};
  const caseState = stateData || {};

  // ── Derived detail data ─────────────────────────────────────────
  const impactedBranches = useMemo(() =>
    branches.filter(b => b.status === 'critical' || b.status === 'warning'),
    [branches]
  );

  const links = useMemo(() => {
    const refs: any[] = [];
    if (stateData?.identifiers?.external_refs) {
      stateData.identifiers.external_refs.forEach((ref: string) => {
        refs.push({ label: ref, href: '#' });
      });
    }
    return refs;
  }, [stateData]);

  const relatedCases = useMemo(() =>
    stateData?.related?.linked_cases || resolveData?.linked_cases || [],
    [stateData, resolveData]
  );

  const internalNotes = useMemo(() =>
    resolveData?.notes || [],
    [resolveData]
  );

  // ── Copilot brief data ──────────────────────────────────────────
  const copilotBrief = useMemo(() => ({
    summary: stateData?.case?.ai_diagnosis || caseResolve?.conflict?.summary || 'No AI summary yet.',
    rootCause: caseResolve?.conflict?.root_cause || stateData?.case?.ai_root_cause || 'Pending analysis.',
    conflict: caseResolve?.conflict?.title || null,
    recommendation: caseResolve?.conflict?.recommended_action || stateData?.case?.ai_recommended_action || null,
  }), [stateData, caseResolve]);

  const selectedCase = useMemo(() => cases.find(c => c.id === selectedId), [cases, selectedId]);

  const riskLevel = rootData.riskLevel || selectedCase?.riskLevel || 'low';
  const riskLabel = typeof riskLevel === 'string' ? riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1).toLowerCase() : 'Low';

  // ── Suggested question chips ────────────────────────────────────
  const suggestedQuestions = useMemo(() => {
    const qs: string[] = [];
    if (copilotBrief.conflict) qs.push("What's causing the conflict?");
    else qs.push("What's the current status?");
    qs.push("What should I do next?");
    if (impactedBranches.some(b => b.label?.toLowerCase().includes('payment'))) {
      qs.push("What's wrong with the payment?");
    } else if (impactedBranches.some(b => b.label?.toLowerCase().includes('return'))) {
      qs.push("What's the return status?");
    } else {
      qs.push("Walk me through this case");
    }
    if (riskLabel.toLowerCase() === 'high' || riskLabel.toLowerCase() === 'critical') {
      qs.push("Why is this high risk?");
    }
    return qs.slice(0, 4);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copilotBrief.conflict, impactedBranches, riskLabel]);

  const impactedModule = useMemo<Page>(() => {
    const textCandidates = [
      caseResolve?.conflict?.source_of_truth,
      caseResolve?.conflict?.root_cause,
      caseResolve?.conflict?.recommended_action,
      caseResolve?.conflict?.summary,
      stateData?.case?.type,
      stateData?.case?.ai_diagnosis,
      stateData?.case?.ai_root_cause,
      stateData?.case?.ai_recommended_action,
    ];

    for (const candidate of textCandidates) {
      const page = pageFromText(candidate);
      if (page) return page;
    }

    const strongestBranch = branches.find(branch => branch.status === 'critical')
      || branches.find(branch => branch.status === 'warning')
      || branches[0];

    const branchPage = pageFromBranchKey(strongestBranch?.id || strongestBranch?.label);
    if (branchPage) return branchPage;

    return strongestBranch?.page || 'case_graph';
  }, [branches, caseResolve, stateData]);

  // ── Copilot submit ──────────────────────────────────────────────
  const handleCopilotSubmit = useCallback(async (questionOverride?: string) => {
    const question = (questionOverride !== undefined ? questionOverride : copilotInput).trim();
    if (!selectedId || !question || isCopilotSending) return;
    const userMsg: CopilotMessage = { id: `u-${Date.now()}`, role: 'user', content: question, time: nowTime() };
    const history = copilotMessages.map(m => ({ role: m.role, content: m.content }));

    setCopilotMessages(prev => [...prev, userMsg]);
    setCopilotInput('');
    setIsCopilotSending(true);

    try {
      const result = await casesApi.copilot(selectedId, question, history);
      const answer = result?.answer || 'No response available.';
      setCopilotMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: answer,
        time: nowTime(),
      }]);
    } catch {
      const fallbackParts = [
        copilotBrief.summary,
        copilotBrief.rootCause ? `Root cause: ${copilotBrief.rootCause}` : null,
        copilotBrief.conflict ? `Conflict: ${copilotBrief.conflict}` : null,
        copilotBrief.recommendation ? `Recommended action: ${copilotBrief.recommendation}` : null,
        impactedBranches.length ? `Impacted: ${impactedBranches.map(b => b.label).join(', ')}` : null,
      ].filter(Boolean).join('\n\n');
      setCopilotMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: fallbackParts || 'No canonical data available for this case yet.',
        time: nowTime(),
      }]);
    } finally {
      setIsCopilotSending(false);
    }
  }, [selectedId, copilotInput, isCopilotSending, copilotMessages, copilotBrief, impactedBranches]);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">
        {/* ── Header ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Case Graph</h1>
            <div className="flex space-x-1">
              <span className="px-3 py-1 text-sm font-medium rounded-full bg-black text-white">All cases ({cases.length})</span>
              <span className="px-3 py-1 text-sm font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                Active ({cases.filter(c => !['resolved', 'closed', 'cancelled'].includes(c.status)).length})
              </span>
              <span className="px-3 py-1 text-sm font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                Resolved ({cases.filter(c => c.status === 'resolved' || c.status === 'closed').length})
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="flex items-center text-gray-500 text-sm mr-2">
              <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
              Sync Active
            </div>
            <button className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              <span className="material-symbols-outlined">filter_list</span>
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* ── Left Panel: Case List ────────────────────────────── */}
          <div className="w-80 flex-shrink-0 border-r border-gray-100 dark:border-gray-700 flex flex-col bg-gray-50/30 dark:bg-black/5">
            <div className="overflow-y-auto flex-1 custom-scrollbar p-2 space-y-2">
              {casesLoading && cases.length === 0 && (
                <LoadingState title="Loading cases" message="Fetching canonical case data from Supabase." compact />
              )}
              {cases.length === 0 && !casesLoading && (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <span className="material-symbols-outlined text-4xl mb-3">inbox</span>
                  <p className="text-sm font-medium">No cases yet</p>
                  <p className="text-xs mt-1">Run a demo scenario to generate cases</p>
                </div>
              )}
              {cases.map(c => (
                <div
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                    selectedId === c.id
                      ? 'bg-white dark:bg-gray-800 border-secondary shadow-card scale-[1.02] z-10'
                      : 'bg-white dark:bg-card-dark border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 shadow-sm hover:shadow-card'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex flex-col">
                      <span className={`font-semibold text-sm ${selectedId === c.id ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{c.customerName}</span>
                      <span className="text-xs text-gray-400 font-mono">{c.orderId}</span>
                    </div>
                    <span className="text-xs text-gray-400">{c.lastUpdate}</span>
                  </div>
                  <p className={`text-sm truncate ${selectedId === c.id ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-600 dark:text-gray-300'}`}>{c.summary}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {c.badges.map((badge: string) => (
                      <span key={badge} className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border bg-red-50 text-red-700 border-red-200">
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Center Panel: Graph / Timeline / Resolve ─────────── */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#F8F9FA] dark:bg-card-dark overflow-hidden relative">
            <div className="absolute top-4 left-6 z-10">
              <div className="flex items-center bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm p-1 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm">
                {(['tree', 'timeline', 'resolve'] as const).map(view => (
                  <button
                    key={view}
                    onClick={() => setGraphView(view)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${
                      graphView === view ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">{view === 'tree' ? 'account_tree' : view === 'timeline' ? 'timeline' : 'handyman'}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider">{view === 'tree' ? 'Tree View' : view === 'timeline' ? 'Timeline' : 'Resolve'}</span>
                  </button>
                ))}
              </div>
            </div>

            {graphView === 'tree' ? (
              <div className="flex-1 flex items-center justify-center relative bg-white dark:bg-card-dark">
                {(graphLoading || resolveLoading || stateLoading) && !graphData && !resolveData && !stateData ? (
                  <LoadingState title="Loading case graph" message="Fetching live graph, resolve and state data." compact />
                ) : branches.length > 0 ? (
                  <TreeGraph onNavigate={onPageChange} branches={branches} rootData={rootData} />
                ) : (
                  <div className="flex flex-col items-center justify-center text-gray-400">
                    <span className="material-symbols-outlined text-5xl mb-3">account_tree</span>
                    <p className="text-sm font-medium">
                      {selectedId ? (graphLoading ? 'Loading graph...' : 'No graph data available') : 'Select a case to view its graph'}
                    </p>
                  </div>
                )}
              </div>
            ) : graphView === 'timeline' ? (
              <div className="flex-1 overflow-y-auto custom-scrollbar p-8 pt-20 relative bg-[#F8F9FA] dark:bg-card-dark">
                {(graphLoading || resolveLoading || stateLoading) && timeline.length === 0 ? (
                  <LoadingState title="Loading timeline" message="Fetching case history from Supabase." compact />
                ) : (
                  <>
                    {timeline.length > 0 && (
                      <div className="absolute left-[55px] top-20 bottom-6 w-0.5 bg-gray-200 dark:bg-gray-700"></div>
                    )}
                    <div className="space-y-6">
                      {timeline.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                          <span className="material-symbols-outlined text-4xl mb-3">timeline</span>
                          <p className="text-sm font-medium">No timeline events yet</p>
                        </div>
                      )}
                      {timeline.map((entry: any) => (
                        <div key={entry.id} className="relative flex items-start group">
                          <div className="absolute left-0 w-12 h-12 flex items-center justify-center z-10">
                            <div className={`w-4 h-4 rounded-full border-2 border-white dark:border-gray-900 shadow-sm ${
                              entry.severity === 'critical' || entry.severity === 'blocked' ? 'bg-red-500' :
                              entry.severity === 'warning' || entry.severity === 'pending' ? 'bg-orange-400' : 'bg-green-500'
                            }`}></div>
                          </div>
                          <div className="ml-14 flex-1 p-4 rounded-xl border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-lg text-gray-500 dark:text-gray-400">{entry.icon || 'circle'}</span>
                                <h3 className="font-bold text-gray-900 dark:text-white">{formatStatus(entry.entry_type || entry.type)}</h3>
                              </div>
                              <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{new Date(entry.occurred_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-300">{entry.content}</div>
                            <div className="mt-3 flex items-center justify-between">
                              <span className="text-[10px] font-bold uppercase px-2 py-1 rounded border bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600">{formatStatus(entry.domain)}</span>
                              <span className="text-xs text-gray-500">{entry.source || entry.actor || 'System'}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto custom-scrollbar p-8 pt-20 relative bg-[#F8F9FA] dark:bg-card-dark">
                {(graphLoading || resolveLoading || stateLoading) && !resolveData && !stateData ? (
                  <LoadingState title="Loading resolve view" message="Fetching conflict, policy and execution context from Supabase." compact />
                ) : (
                  <div className="space-y-6">
                    <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
                      <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{caseResolve?.conflict?.title || 'Resolve Case'}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{caseResolve?.conflict?.summary || 'No active blocker registered.'}</p>
                      {caseResolve?.conflict?.severity && (
                        <span className={`inline-block mt-2 text-[10px] font-bold uppercase px-2 py-1 rounded border ${
                          caseResolve.conflict.severity === 'critical' ? 'bg-red-50 text-red-700 border-red-200' :
                          caseResolve.conflict.severity === 'warning' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                          'bg-green-50 text-green-700 border-green-200'
                        }`}>{caseResolve.conflict.severity}</span>
                      )}
                      <div className="mt-4 flex gap-3 flex-wrap">
                        {(['overview', 'identifiers', 'policy', 'execution'] as ResolveTab[]).map(tab => (
                          <button key={tab} onClick={() => setResolveTab(tab)} className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider ${resolveTab === tab ? 'bg-gray-900 dark:bg-white text-white dark:text-black' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>{tab}</button>
                        ))}
                      </div>
                    </div>

                    {resolveTab === 'overview' && (
                      <>
                        <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
                          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Active Blockers</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(caseResolve?.blockers || []).map((blocker: any) => (
                              <div key={blocker.key} className={`p-4 rounded-xl border ${blocker.status === 'critical' || blocker.status === 'blocked' ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-800/30' : 'bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-800/30'}`}>
                                <div className="text-sm font-bold text-gray-900 dark:text-white">{blocker.label}</div>
                                <div className="text-xs text-gray-500 mt-1">{blocker.summary || blocker.source_of_truth || 'Pending review'}</div>
                              </div>
                            ))}
                            {!(caseResolve?.blockers || []).length && <div className="text-sm text-gray-500">No active blockers.</div>}
                          </div>
                        </div>
                        <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
                          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Expected Post-Resolution State</h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {(caseResolve?.expected_post_resolution_state || []).map((state: any) => (
                              <div key={state.key} className="bg-green-50 dark:bg-green-900/10 p-4 rounded-xl border border-green-100 dark:border-green-800/30 flex flex-col items-center justify-center text-center">
                                <div className="text-xs font-bold uppercase tracking-wider text-green-600 dark:text-green-400 mb-2">{state.label}</div>
                                <div className="text-sm font-bold text-gray-900 dark:text-white">{state.summary}</div>
                              </div>
                            ))}
                            {!(caseResolve?.expected_post_resolution_state || []).length && (
                              <div className="text-sm text-gray-500 col-span-full">Resolution state will be computed after analysis.</div>
                            )}
                          </div>
                        </div>
                      </>
                    )}

                    {resolveTab === 'identifiers' && (
                      <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Identifiers</h3>
                        <div className="grid grid-cols-2 gap-4">
                          {(caseResolve?.identifiers || []).map((item: any, index: number) => (
                            <div key={`${item.label}:${index}`} className="p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{item.label}</div>
                              <div className="text-sm font-bold text-gray-900 dark:text-white">{item.value}</div>
                              {item.source && <div className="text-xs text-gray-500 mt-1">{formatStatus(item.source)}</div>}
                            </div>
                          ))}
                          {!(caseResolve?.identifiers || []).length && <div className="text-sm text-gray-500">No identifiers available.</div>}
                        </div>
                      </div>
                    )}

                    {resolveTab === 'policy' && (
                      <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Policy View</h3>
                        <div className="space-y-3">
                          <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                            <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Source Of Truth</div>
                            <div className="text-sm font-bold text-gray-900 dark:text-white">{caseResolve?.conflict?.source_of_truth || 'Not specified'}</div>
                          </div>
                          <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                            <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Root Cause</div>
                            <div className="text-sm text-gray-700 dark:text-gray-300">{caseResolve?.conflict?.root_cause || 'Pending diagnosis'}</div>
                          </div>
                          <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                            <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Recommended Action</div>
                            <div className="text-sm text-gray-700 dark:text-gray-300">{caseResolve?.conflict?.recommended_action || 'Awaiting recommendation'}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {resolveTab === 'execution' && (
                      <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Execution Plan</h3>
                        <div className="mb-4 text-sm text-gray-600 dark:text-gray-300">
                          Mode: <span className="font-bold text-gray-900 dark:text-white">{formatStatus(caseResolve?.execution?.mode)}</span> · Status: <span className="font-bold text-gray-900 dark:text-white">{formatStatus(caseResolve?.execution?.status)}</span>
                          {caseResolve?.execution?.requires_approval && (
                            <span className="ml-3 text-[10px] font-bold uppercase px-2 py-1 rounded border bg-amber-50 text-amber-700 border-amber-200">Requires Approval</span>
                          )}
                        </div>
                        <div className="space-y-3">
                          {(caseResolve?.execution?.steps || []).map((step: any) => (
                            <div key={step.id} className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 flex items-start justify-between">
                              <div>
                                <div className="text-sm font-bold text-gray-900 dark:text-white">{step.label}</div>
                                <div className="text-xs text-gray-500 mt-1">{step.context || step.source || 'Pending execution'}</div>
                              </div>
                              <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded border ${
                                step.status === 'critical' || step.status === 'blocked' ? 'bg-red-50 text-red-700 border-red-200' :
                                step.status === 'warning' || step.status === 'pending' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                'bg-green-50 text-green-700 border-green-200'
                              }`}>{formatStatus(step.status)}</span>
                            </div>
                          ))}
                          {!(caseResolve?.execution?.steps || []).length && (
                            <div className="text-sm text-gray-500">No execution steps planned yet.</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Right Panel: Details / Copilot ───────────────────── */}
          <div className="w-80 lg:w-96 border-l border-gray-100 dark:border-gray-800 bg-white dark:bg-card-dark flex flex-col overflow-hidden">
            {/* Tabs */}
            <div className="flex items-center border-b border-gray-100 dark:border-gray-800 px-2 flex-shrink-0">
              <button
                onClick={() => setRightTab('details')}
                className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
                  rightTab === 'details'
                    ? 'text-gray-900 dark:text-white border-gray-900 dark:border-white font-bold'
                    : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 border-transparent'
                }`}
              >
                Details
              </button>
              <button
                onClick={() => setRightTab('copilot')}
                className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 flex items-center justify-center gap-2 ${
                  rightTab === 'copilot'
                    ? 'text-secondary border-secondary font-bold bg-purple-50/50 dark:bg-purple-900/10'
                    : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 border-transparent'
                }`}
              >
                <span className="material-symbols-outlined text-lg">chat_bubble</span>
                Copilot
              </button>
            </div>

            {/* Tab content */}
            <div className={`flex-1 min-h-0 ${rightTab === 'copilot' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto custom-scrollbar'}`}>
              {rightTab === 'copilot' ? (
                <div className="flex flex-col h-full min-h-0">

                  {/* Command toolbar */}
                  <div className="px-3 pt-3 pb-2.5 flex items-center gap-2 flex-wrap border-b border-gray-100 dark:border-gray-700/60 flex-shrink-0">
                    <button
                      onClick={() => setShowCaseBrief(prev => !prev)}
                      title="Toggle case brief"
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                        showCaseBrief
                          ? 'bg-purple-100 dark:bg-purple-900/30 text-secondary border-purple-200 dark:border-purple-700'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700 hover:border-secondary/50 hover:text-secondary'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">description</span>
                      Brief
                    </button>

                    <button
                      onClick={() => onPageChange(impactedModule)}
                      title="Go to impacted module"
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 border border-gray-200 dark:border-gray-700 hover:border-secondary/50 hover:text-secondary transition-all"
                    >
                      <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                      View module
                    </button>

                    {/* Risk pill */}
                    <div className={`ml-auto flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                      riskLabel.toLowerCase() === 'high' || riskLabel.toLowerCase() === 'critical'
                        ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-800/30'
                        : riskLabel.toLowerCase() === 'medium'
                        ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-100 dark:border-yellow-800/30'
                        : 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-100 dark:border-green-800/30'
                    }`}>
                      <span className="material-symbols-outlined text-[13px]">trending_up</span>
                      {riskLabel}
                    </div>
                  </div>

                  {/* Collapsible brief */}
                  {showCaseBrief && (
                    <div className="mx-3 mt-2.5 bg-white dark:bg-card-dark rounded-xl border border-gray-100 dark:border-gray-700 p-3 text-xs space-y-2 flex-shrink-0 shadow-card">
                      <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{copilotBrief.summary}</p>
                      {copilotBrief.conflict && (
                        <div className="flex items-start gap-1.5 bg-white dark:bg-card-dark rounded-lg p-2 border border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-400">
                          <span className="material-symbols-outlined text-red-500 text-[13px] flex-shrink-0 mt-0.5">warning</span>
                          <span>{copilotBrief.conflict}</span>
                        </div>
                      )}
                      {copilotBrief.recommendation && (
                        <div className="flex items-start gap-1.5 bg-white dark:bg-card-dark rounded-lg p-2 border border-gray-100 dark:border-gray-700">
                          <span className="material-symbols-outlined text-secondary text-[13px] flex-shrink-0 mt-0.5">bolt</span>
                          <span className="italic text-gray-600 dark:text-gray-400">{copilotBrief.recommendation}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Chat messages */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3 space-y-3 min-h-0">
                    {copilotMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center py-10">
                        <div className={`w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center mb-3 border border-purple-100 dark:border-purple-800/30 shadow-sm`}>
                          <span className={`material-symbols-outlined text-secondary text-2xl ${stateLoading ? 'animate-pulse' : ''}`}>auto_awesome</span>
                        </div>
                        {stateLoading ? (
                          <p className="text-sm text-gray-400">Reading case data...</p>
                        ) : (
                          <>
                            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Ask me anything about this case</p>
                            <p className="text-[11px] text-gray-400 max-w-[200px] leading-relaxed">I have full context: graph state, conflicts, blockers and history.</p>
                          </>
                        )}
                      </div>
                    ) : (
                      copilotMessages.map((message, idx) => (
                        <React.Fragment key={message.id}>
                          <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start items-end gap-2'}`}>
                            {message.role === 'assistant' && (
                              <div className="w-6 h-6 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 shadow-sm shadow-secondary/20">
                                <span className="material-symbols-outlined text-white text-[13px]">auto_awesome</span>
                              </div>
                            )}
                            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed border ${
                              message.role === 'user'
                                ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-600 rounded-br-sm'
                                : 'bg-white dark:bg-card-dark text-gray-700 dark:text-gray-200 border-gray-100 dark:border-gray-700 rounded-bl-sm shadow-card'
                            }`}>
                              <p className="whitespace-pre-wrap">{message.content}</p>
                              <span className={`block mt-1 text-[10px] ${message.role === 'user' ? 'text-gray-500' : 'text-gray-400'}`}>{message.time}</span>
                            </div>
                          </div>
                          {/* Suggested chips after welcome */}
                          {message.role === 'assistant' && idx === 0 && copilotMessages.length === 1 && !isCopilotSending && (
                            <div className="flex flex-wrap gap-1.5 pl-8 pt-0.5">
                              {suggestedQuestions.map(q => (
                                <button
                                  key={q}
                                  onClick={() => handleCopilotSubmit(q)}
                                  className="text-[11px] px-2.5 py-1.5 rounded-full border border-secondary/30 text-secondary hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-secondary transition-all font-medium"
                                >
                                  {q}
                                </button>
                              ))}
                            </div>
                          )}
                        </React.Fragment>
                      ))
                    )}
                    {isCopilotSending && (
                      <div className="flex justify-start">
                        <div className="bg-white dark:bg-card-dark border border-gray-100 dark:border-gray-700 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5 shadow-card">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.3s]"></span>
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.15s]"></span>
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce"></span>
                        </div>
                      </div>
                    )}
                    <div ref={copilotBottomRef} />
                  </div>

                  {/* Copilot input */}
                  <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-card-dark flex-shrink-0">
                    <div className="relative bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center p-2 focus-within:ring-2 focus-within:ring-secondary/20 focus-within:border-secondary transition-all shadow-card">
                      <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg">
                        <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
                      </button>
                      <input
                        ref={copilotInputRef}
                        value={copilotInput}
                        onChange={e => setCopilotInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCopilotSubmit(); }
                        }}
                        disabled={!selectedId || isCopilotSending}
                        className="flex-1 bg-transparent border-none outline-none focus:ring-0 text-sm text-gray-800 dark:text-gray-200 px-2 h-9 disabled:opacity-50"
                        placeholder="Ask Copilot about this case..."
                        type="text"
                      />
                      <div className="flex items-center gap-1">
                        <button
                          onClick={handleCopilotSubmit}
                          disabled={!copilotInput.trim() || isCopilotSending}
                          className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg disabled:opacity-40"
                        >
                          <span className="material-symbols-outlined text-[20px]">arrow_upward</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Details tab */
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  <div className="p-4">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Case Attributes</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div><span className="text-[10px] uppercase tracking-wider text-gray-500">Order ID</span><div className="text-xs font-bold text-gray-900 dark:text-white">{rootData.orderId}</div></div>
                      <div><span className="text-[10px] uppercase tracking-wider text-gray-500">Customer</span><div className="text-xs font-bold text-gray-900 dark:text-white">{rootData.customerName}</div></div>
                      <div><span className="text-[10px] uppercase tracking-wider text-gray-500">Status</span><div className="text-xs font-bold text-red-600 dark:text-red-400">{formatStatus(caseState?.case?.status || rootData.status)}</div></div>
                      <div><span className="text-[10px] uppercase tracking-wider text-gray-500">Risk Level</span><div className="text-xs font-bold text-orange-600 dark:text-orange-400">{riskLabel}</div></div>
                    </div>
                    <div className="mt-4">
                      <span className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">Impacted Branches</span>
                      {impactedBranches.length ? (
                        <div className="space-y-1.5">
                          {impactedBranches.map(branch => (
                            <button
                              key={branch.id}
                              onClick={() => onPageChange(branch.page)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-card-dark hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group shadow-sm"
                            >
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${branch.status === 'critical' ? 'bg-red-50 dark:bg-red-900/20' : 'bg-orange-50 dark:bg-orange-900/20'}`}>
                                <span className={`material-symbols-outlined text-[15px] ${branch.status === 'critical' ? 'text-red-500' : 'text-orange-500'}`}>{branch.icon}</span>
                              </div>
                              <span className="flex-1 text-xs font-semibold text-gray-700 dark:text-gray-300 text-left">{branch.label}</span>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className={`w-1.5 h-1.5 rounded-full ${branch.status === 'critical' ? 'bg-red-500' : 'bg-orange-400'}`} />
                                <span className={`text-[10px] font-bold uppercase ${branch.status === 'critical' ? 'text-red-500' : 'text-orange-500'}`}>{branch.status}</span>
                              </div>
                              <span className="material-symbols-outlined text-[14px] text-gray-300 group-hover:text-gray-500 transition-colors">chevron_right</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                          All branches healthy
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-4">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Operational Links</h3>
                    <div className="space-y-2">
                      {links.map((link: any) => (
                        <a key={link.label} href={link.href} className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-blue-600 dark:text-blue-400 border border-transparent hover:border-blue-100 transition-all">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">hub</span>
                            {link.label}
                          </div>
                          <span className="material-symbols-outlined text-sm">open_in_new</span>
                        </a>
                      ))}
                      {!links.length && <p className="text-xs text-gray-500">No integration links observed yet.</p>}
                    </div>
                  </div>

                  <div className="p-4">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Related Cases</h3>
                    <div className="space-y-2">
                      {relatedCases.map((item: any) => (
                        <div key={item.id} className="p-2 rounded border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-gray-900 dark:text-white">{item.case_number}</span>
                            <span className="text-[10px] text-gray-500">{formatStatus(item.type)}</span>
                          </div>
                          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[9px] font-bold rounded uppercase">{formatStatus(item.status)}</span>
                        </div>
                      ))}
                      {!relatedCases.length && <p className="text-xs text-gray-500">No linked cases.</p>}
                    </div>
                  </div>

                  <div className="p-4">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Internal Notes</h3>
                    <div className="space-y-3">
                      {internalNotes.map((note: any) => (
                        <div key={note.id} className="p-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg border border-yellow-100 dark:border-yellow-800/20">
                          <p className="text-xs text-yellow-900 dark:text-yellow-100 leading-relaxed italic">{note.content}</p>
                          <div className="mt-2 flex justify-between items-center text-[10px] text-yellow-700/70">
                            <span>{note.created_by || 'System'}</span>
                            <span>{note.created_at ? new Date(note.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                          </div>
                        </div>
                      ))}
                      {!internalNotes.length && <p className="text-xs text-gray-500">No internal notes yet.</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function iconForBranch(key: string) {
  const iconMap: Record<string, string> = {
    orders: 'shopping_bag', payments: 'payments', returns: 'assignment_return',
    fulfillment: 'local_shipping', approvals: 'check_circle', workflows: 'account_tree',
    knowledge: 'description', integrations: 'hub',
  };
  return iconMap[key] || 'widgets';
}
