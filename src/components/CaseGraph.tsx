import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Page } from '../types';
import TreeGraph from './TreeGraph';
import { casesApi } from '../api/client';
import { useApi } from '../api/hooks';
import type { GraphBranch } from './TreeGraph';

type RightTab = 'details' | 'copilot';
type ResolveTab = 'overview' | 'identifiers' | 'policy' | 'execution';

function formatStatus(value?: string | null) {
  if (!value) return 'N/A';
  return value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function graphStatus(value?: string) {
  if (value === 'critical' || value === 'blocked') return 'critical' as const;
  if (value === 'warning' || value === 'pending') return 'warning' as const;
  return 'healthy' as const;
}

function iconForBranch(key: string) {
  const iconMap: Record<string, string> = {
    orders: 'shopping_bag',
    payments: 'payments',
    returns: 'assignment_return',
    fulfillment: 'local_shipping',
    approvals: 'check_circle',
    workflows: 'account_tree',
    knowledge: 'description',
    integrations: 'hub',
  };
  return iconMap[key] || 'widgets';
}

function pageForBranch(key: string): Page {
  const pageMap: Record<string, Page> = {
    orders: 'orders',
    payments: 'payments',
    returns: 'returns',
    fulfillment: 'orders',
    approvals: 'approvals',
    workflows: 'workflows',
    knowledge: 'knowledge',
    integrations: 'tools_integrations',
  };
  return pageMap[key] || 'case_graph';
}

export default function CaseGraph({ onPageChange }: { onPageChange: (page: Page) => void }) {
  const [rightTab, setRightTab] = useState<RightTab>('copilot');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [graphView, setGraphView] = useState<'tree' | 'timeline' | 'resolve'>('tree');
  const [resolveTab, setResolveTab] = useState<ResolveTab>('overview');

  const { data: apiCases } = useApi(() => casesApi.list(), [], []);
  const cases = useMemo(() => (apiCases || []).map((c: any) => ({
    id: c.id,
    orderId: Array.isArray(c.order_ids) && c.order_ids.length > 0 ? c.order_ids[0] : c.case_number,
    customerName: c.customer_name || c.case_number,
    summary: c.ai_diagnosis || c.conflict_summary?.recommended_action || formatStatus(c.type),
    lastUpdate: c.last_activity_at ? new Date(c.last_activity_at).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-',
    badges: [
      ...(c.conflict_summary?.has_conflict ? ['Conflict'] : []),
      ...(c.risk_level === 'high' ? ['High Risk'] : []),
      ...(c.status === 'blocked' ? ['Blocked'] : []),
    ],
  })), [apiCases]);

  useEffect(() => {
    if (!selectedId && cases.length > 0) setSelectedId(cases[0].id);
  }, [cases, selectedId]);

  // Fetch case detail from API
  const { data: apiCaseDetail } = useApi(
    () => selectedId ? casesApi.get(selectedId) : Promise.resolve(null),
    [selectedId]
  );

  // Build detail view from API data, falling back to mock
  const currentCase = useMemo(() => {
    // Try mock data first (static IDs '1','2','3','4')
    if (MOCK_CASES_DATA[selectedId]) return MOCK_CASES_DATA[selectedId];

    // Build from API detail
    if (apiCaseDetail) {
      const c = apiCaseDetail;
      const orderIds = Array.isArray(c.order_ids) ? c.order_ids : [];
      const riskLabel = c.risk_level === 'high' || c.risk_level === 'critical' ? 'High Risk Case' : c.risk_level === 'medium' ? 'Medium Risk' : 'Low Risk';
      const statusLabel = c.has_reconciliation_conflicts ? 'Conflict Detected' : c.status?.replace(/_/g, ' ') || 'Open';

      const branches: GraphBranch[] = [
        { id: 'orders', label: 'Orders', icon: 'shopping_bag', page: 'orders' as any, status: c.has_reconciliation_conflicts ? 'critical' : 'healthy', nodes: orderIds.map((oid: string, i: number) => ({ id: `o${i}`, label: oid, status: 'healthy' as const, context: 'Order', icon: 'shopping_bag', timestamp: c.created_at })) },
        { id: 'payments', label: 'Payments', icon: 'payments', page: 'payments' as any, status: c.has_reconciliation_conflicts ? 'critical' : 'healthy', nodes: [{ id: 'p1', label: 'Payment', status: 'healthy' as const, context: c.approval_state || 'N/A', icon: 'payments', timestamp: c.created_at }] },
        { id: 'returns', label: 'Returns', icon: 'assignment_return', page: 'returns' as any, status: 'healthy', nodes: [{ id: 'r1', label: 'Return', status: 'healthy' as const, context: c.type || 'N/A', icon: 'assignment_return', timestamp: c.created_at }] },
        { id: 'approvals', label: 'Approvals', icon: 'check_circle', page: 'approvals' as any, status: c.approval_state === 'pending' ? 'warning' : 'healthy', nodes: [{ id: 'a1', label: `Approval: ${c.approval_state || 'N/A'}`, status: c.approval_state === 'pending' ? 'warning' as const : 'healthy' as const, context: c.approval_state || 'N/A', icon: 'check_circle', timestamp: c.created_at }] },
      ];

      return {
        rootData: {
          orderId: orderIds[0] || c.case_number || c.id,
          customerName: c.customer_name || 'Unknown',
          riskLevel: riskLabel,
          status: statusLabel,
        },
        branches,
        copilot: {
          summary: c.ai_diagnosis || `Case ${c.case_number}: ${c.type?.replace(/_/g, ' ')}`,
          rootCause: c.ai_root_cause || 'Root cause analysis pending.',
          conflict: c.has_reconciliation_conflicts ? (c.conflict_severity || 'Conflict detected') : 'No conflicts.',
          recommendation: c.ai_recommended_action || 'Awaiting analysis.',
          actionText: c.approval_state === 'pending' ? 'Approve Resolution' : 'View Details',
          reply: '',
        },
      };
    }

    return MOCK_CASES_DATA['1'];
  }, [selectedId, apiCaseDetail]);

  const caseData = currentCase.rootData;
  const copilotData = currentCase.copilot;

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Case Graph</h1>
            <div className="flex space-x-1">
              <span className="px-3 py-1 text-sm font-medium rounded-full bg-black text-white">All cases ({cases.length})</span>
              <span className="px-3 py-1 text-sm font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">Active ({cases.length})</span>
              <span className="px-3 py-1 text-sm font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">Resolved (0)</span>
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
          <div className="w-80 flex-shrink-0 border-r border-gray-100 dark:border-gray-700 flex flex-col bg-gray-50/30 dark:bg-black/5">
            <div className="overflow-y-auto flex-1 custom-scrollbar p-2 space-y-2">
              {cases.map(c => (
                <div key={c.id} onClick={() => setSelectedId(c.id)} className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 ${selectedId === c.id ? 'bg-white dark:bg-gray-800 border-secondary shadow-card scale-[1.02] z-10' : 'bg-white dark:bg-card-dark border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 shadow-sm hover:shadow-card'}`}>
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex flex-col">
                      <span className={`font-semibold text-sm ${selectedId === c.id ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{c.customerName}</span>
                      <span className="text-xs text-gray-400 font-mono">{c.orderId}</span>
                    </div>
                    <span className="text-xs text-gray-400">{c.lastUpdate}</span>
                  </div>
                  <p className={`text-sm truncate ${selectedId === c.id ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-600 dark:text-gray-300'}`}>{c.summary}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {c.badges.map(badge => (
                      <span key={badge} className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${badge === 'Conflict' || badge === 'High Risk' || badge === 'Blocked' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 flex flex-col min-w-0 bg-[#F8F9FA] dark:bg-card-dark overflow-hidden relative">
            <div className="absolute top-4 left-6 z-10">
              <div className="flex items-center bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm p-1 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm">
                {(['tree', 'timeline', 'resolve'] as const).map(view => (
                  <button key={view} onClick={() => setGraphView(view)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${graphView === view ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                    <span className="material-symbols-outlined text-sm">{view === 'tree' ? 'account_tree' : view === 'timeline' ? 'timeline' : 'handyman'}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider">{view === 'tree' ? 'Tree View' : view === 'timeline' ? 'Timeline' : 'Resolve'}</span>
                  </button>
                ))}
              </div>
            </div>

            {graphView === 'tree' ? (
              <div className="flex-1 flex items-center justify-center relative bg-white dark:bg-card-dark">
                <TreeGraph onNavigate={onPageChange} branches={branches} rootData={rootData} />
              </div>
            ) : graphView === 'timeline' ? (
              <div className="flex-1 overflow-y-auto custom-scrollbar p-8 pt-20 relative bg-[#F8F9FA] dark:bg-card-dark">
                <div className="absolute left-[31px] top-24 bottom-6 w-0.5 bg-gray-200 dark:bg-gray-700"></div>
                <div className="space-y-6">
                  {timeline.map((entry: any) => (
                    <div key={entry.id} className="relative flex items-start group">
                      <div className={`absolute left-0 w-12 h-12 flex items-center justify-center z-10`}>
                        <div className={`w-4 h-4 rounded-full border-2 border-white dark:border-gray-900 shadow-sm ${entry.severity === 'critical' || entry.severity === 'blocked' ? 'bg-red-500' : entry.severity === 'warning' || entry.severity === 'pending' ? 'bg-orange-400' : 'bg-green-500'}`}></div>
                      </div>
                      <div className="ml-14 flex-1 p-4 rounded-xl border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-lg text-gray-500 dark:text-gray-400">{entry.icon || 'circle'}</span>
                            <h3 className="font-bold text-gray-900 dark:text-white">{formatStatus(entry.entry_type)}</h3>
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
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto custom-scrollbar p-8 pt-20 relative bg-[#F8F9FA] dark:bg-card-dark">
                <div className="space-y-6">
                  <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{caseResolve?.conflict?.title || 'Resolve Case'}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{caseResolve?.conflict?.summary || 'No active blocker registered.'}</p>
                    <div className="mt-4 flex gap-3 flex-wrap">
                      {(['overview', 'identifiers', 'policy', 'execution'] as ResolveTab[]).map(tab => (
                        <button key={tab} onClick={() => setResolveTab(tab)} className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider ${resolveTab === tab ? 'bg-gray-900 dark:bg-white text-white dark:text-black' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>{tab}</button>
                      ))}
                    </div>
                  </div>

                  {resolveTab === 'overview' ? (
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
                          {!(caseResolve?.blockers || []).length ? <div className="text-sm text-gray-500">No active blockers.</div> : null}
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
                        </div>
                      </div>
                    </>
                  ) : null}

                  {resolveTab === 'identifiers' ? (
                    <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Identifiers</h3>
                      <div className="grid grid-cols-2 gap-4">
                        {(caseResolve?.identifiers || []).map((item: any, index: number) => (
                          <div key={`${item.label}:${index}`} className="p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{item.label}</div>
                            <div className="text-sm font-bold text-gray-900 dark:text-white">{item.value}</div>
                            {item.source ? <div className="text-xs text-gray-500 mt-1">{formatStatus(item.source)}</div> : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {resolveTab === 'policy' ? (
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
                  ) : null}

                  {resolveTab === 'execution' ? (
                    <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Execution Plan</h3>
                      <div className="mb-4 text-sm text-gray-600 dark:text-gray-300">
                        Mode: <span className="font-bold text-gray-900 dark:text-white">{formatStatus(caseResolve?.execution?.mode)}</span> · Status: <span className="font-bold text-gray-900 dark:text-white">{formatStatus(caseResolve?.execution?.status)}</span>
                      </div>
                      <div className="space-y-3">
                        {(caseResolve?.execution?.steps || []).map((step: any) => (
                          <div key={step.id} className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 flex items-start justify-between">
                            <div>
                              <div className="text-sm font-bold text-gray-900 dark:text-white">{step.label}</div>
                              <div className="text-xs text-gray-500 mt-1">{step.context || step.source || 'Pending execution'}</div>
                            </div>
                            <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded border ${step.status === 'critical' || step.status === 'blocked' ? 'bg-red-50 text-red-700 border-red-200' : step.status === 'warning' || step.status === 'pending' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-green-50 text-green-700 border-green-200'}`}>{formatStatus(step.status)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          <div className="w-80 border-l border-gray-100 dark:border-gray-800 bg-white dark:bg-card-dark flex flex-col">
            <div className="flex items-center justify-between px-6 pt-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex">
                <button onClick={() => setRightTab('details')} className={`px-4 py-3 text-sm ${rightTab === 'details' ? 'font-semibold text-gray-900 dark:text-white border-b-2 border-gray-900 dark:border-white' : 'text-gray-500'}`}>Details</button>
                <button onClick={() => setRightTab('copilot')} className={`px-4 py-3 text-sm ${rightTab === 'copilot' ? 'font-semibold text-secondary border-b-2 border-secondary' : 'text-gray-500'}`}>Copilot</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {rightTab === 'copilot' ? (
                <div className="p-4 flex flex-col gap-4">
                  <div className="bg-purple-50 dark:bg-purple-900/20 text-gray-800 dark:text-gray-200 text-sm py-2.5 px-3.5 rounded-2xl rounded-tl-sm border border-purple-100 dark:border-purple-800/30">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-secondary mb-2">Case Intelligence</h4>
                    <p className="leading-relaxed mb-3">{caseState?.case?.ai_diagnosis || caseResolve?.conflict?.summary || 'No AI summary yet.'}</p>
                    <h4 className="font-bold text-xs uppercase tracking-wider text-secondary mb-2">Root Cause Analysis</h4>
                    <p className="text-xs mb-3">{caseResolve?.conflict?.root_cause || 'Pending analysis.'}</p>
                    <h4 className="font-bold text-xs uppercase tracking-wider text-secondary mb-2">Conflict Detection</h4>
                    <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-100 dark:border-red-800/30 text-xs text-red-700 dark:text-red-400 mb-3">{caseResolve?.conflict?.title || 'No conflict detected.'}</div>
                    <h4 className="font-bold text-xs uppercase tracking-wider text-secondary mb-2">Recommended Action</h4>
                    <p className="text-xs bg-white/50 dark:bg-black/20 p-2 rounded border border-purple-100 dark:border-purple-800/30 italic mb-3">{caseResolve?.conflict?.recommended_action || 'Awaiting recommendation.'}</p>
                    <button onClick={() => onPageChange('payments')} className="w-full py-2 bg-secondary text-white rounded-lg text-xs font-bold hover:opacity-90 flex items-center justify-center gap-2">
                      View Impacted Module
                      <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  <div className="p-4">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Case Attributes</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div><span className="text-[10px] uppercase tracking-wider text-gray-500">Order ID</span><div className="text-xs font-bold text-gray-900 dark:text-white">{rootData.orderId}</div></div>
                      <div><span className="text-[10px] uppercase tracking-wider text-gray-500">Customer</span><div className="text-xs font-bold text-gray-900 dark:text-white">{rootData.customerName}</div></div>
                      <div><span className="text-[10px] uppercase tracking-wider text-gray-500">Status</span><div className="text-xs font-bold text-red-600 dark:text-red-400">{formatStatus(caseGraph?.root?.status || caseState?.case?.status)}</div></div>
                      <div><span className="text-[10px] uppercase tracking-wider text-gray-500">Risk Level</span><div className="text-xs font-bold text-orange-600 dark:text-orange-400">{rootData.riskLevel}</div></div>
                    </div>
                    <div className="mt-4">
                      <span className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">Impacted Branches</span>
                      <div className="flex flex-wrap gap-2">
                        {impactedBranches.map(branch => (
                          <span key={branch.id} className={`flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-1 rounded border ${branch.status === 'critical' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                            <span className="material-symbols-outlined text-[12px]">{branch.icon}</span>
                            {branch.label}
                          </span>
                        ))}
                        {!impactedBranches.length ? <span className="text-xs text-gray-500 italic">No impacted branches</span> : null}
                      </div>
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
                      {!links.length ? <p className="text-xs text-gray-500">No integration links observed yet.</p> : null}
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
                      {!relatedCases.length ? <p className="text-xs text-gray-500">No linked cases.</p> : null}
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
                            <span>{new Date(note.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      ))}
                      {!internalNotes.length ? <p className="text-xs text-gray-500">No internal notes yet.</p> : null}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-card-dark">
              <div className="relative bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center p-2">
                <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"><span className="material-symbols-outlined text-[20px]">auto_awesome</span></button>
                <input className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-gray-800 dark:text-gray-200 px-2 h-9" placeholder="Ask a question..." type="text" />
                <div className="flex items-center gap-1">
                  <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"><span className="material-symbols-outlined text-[20px]">sort</span></button>
                  <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"><span className="material-symbols-outlined text-[20px]">arrow_upward</span></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
