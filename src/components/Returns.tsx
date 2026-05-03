import React, { useState, useEffect, useMemo } from 'react';
import { Return, ReturnTab, OrderTimelineEvent, NavigateFn } from '../types';
import CaseHeader from './CaseHeader';
import type { CaseHeaderMenuItem } from './CaseHeader';
import CaseCopilotPanel from './CaseCopilotPanel';
import MinimalTimeline from './MinimalTimeline';
import { MinimalButton, MinimalCard, MinimalPill } from './MinimalCategoryShell';
import { ActionModal } from './ActionModal';
import { casesApi, returnsApi } from '../api/client';
import { useApi, useMutation } from '../api/hooks';
import LoadingState from './LoadingState';

type RightTab = 'details' | 'copilot';
type ReturnActionView = 'approve' | 'reject' | 'received' | 'refund' | 'block' | null;
type ReturnModal = 'approve' | 'reject' | 'received' | 'refund' | 'block' | null;

interface ReturnsProps {
  onNavigate?: NavigateFn;
  focusEntityId?: string | null;
  focusSection?: string | null;
}

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-';

const formatRelativeLabel = (value?: string | null) => {
  if (!value) return '-';
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMin = Math.max(1, Math.round(diffMs / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${Math.round(diffHour / 24)}d ago`;
};

const titleCase = (value?: string | null) =>
  value ? value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()) : 'N/A';

const truncateLabel = (value?: string | null, max = 54) => {
  if (!value) return 'No action needed';
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars

export default function Returns({ onNavigate, focusEntityId, focusSection }: ReturnsProps) {
  const [rightTab, setRightTab] = useState<RightTab>('copilot');
  const [activeTab, setActiveTab] = useState<ReturnTab>('all');
  const [selectedId, setSelectedId] = useState<string>('1');
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeActionView, setActiveActionView] = useState<ReturnActionView>('approve');
  const [activeModal, setActiveModal] = useState<ReturnModal>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const { mutate: updateStatus, loading: statusLoading } = useMutation(
    ({ id, payload }: { id: string; payload: Record<string, any> }) =>
      returnsApi.updateStatus(id, payload)
  );

  const [caseActionMsg, setCaseActionMsg] = useState<string | null>(null);

  const showFeedback = (msg: string, isError = false) => {
    if (isError) { setActionError(msg); setActionSuccess(null); }
    else { setActionSuccess(msg); setActionError(null); }
    setTimeout(() => { setActionSuccess(null); setActionError(null); }, 4000);
  };

  const showCaseMsg = (msg: string) => {
    setCaseActionMsg(msg);
    setTimeout(() => setCaseActionMsg(null), 3500);
  };

  const handleResolveCase = async (caseId: string) => {
    try { await casesApi.resolve(caseId); showCaseMsg('Case marked as resolved'); }
    catch { showCaseMsg('Failed to resolve case'); }
  };

  const handleSnoozeCase = async (caseId: string) => {
    try { await casesApi.updateStatus(caseId, 'snoozed'); showCaseMsg('Case snoozed'); }
    catch { showCaseMsg('Failed to snooze case'); }
  };

  const handleCloseCase = async (caseId: string) => {
    try { await casesApi.updateStatus(caseId, 'closed'); showCaseMsg('Case closed'); }
    catch { showCaseMsg('Failed to close case'); }
  };

  const handleStatusUpdate = async (status: string, label: string) => {
    if (!selectedReturn) return;
    const result = await updateStatus({ id: selectedReturn.id, payload: { status } });
    if (result) showFeedback(`Return ${label} successfully`);
    else showFeedback(`Failed to ${label.toLowerCase()} return`, true);
  };

  // Fetch canonical return contexts from the backend. Static fixtures are not
  // used as runtime data so this view stays aligned with Inbox/Case Graph.
  const { data: apiReturns, loading: returnsLoading, error: returnsError } = useApi(() => returnsApi.list(), [], []);

  const mapApiReturn = (r: any): Return => ({
    id: r.id,
    orderId: r.orderId || 'N/A',
    returnId: r.externalReturnId || r.id,
    customerName: r.customerName || 'Unknown',
    brand: r.brand || 'N/A',
    date: formatDate(r.createdAt),
    total: `$${Number(r.returnValue || 0).toFixed(2)}`,
    currency: r.currency || 'USD',
    country: r.country || 'N/A',
    returnType: r.type || 'Standard',
    returnReason: r.returnReason || 'N/A',
    returnValue: `$${Number(r.returnValue || 0).toFixed(2)}`,
    riskLevel: r.riskLevel === 'high' ? 'High' : r.riskLevel === 'medium' ? 'Medium' : 'Low',
    orderStatus: titleCase(r.systemStates?.oms || 'N/A'),
    returnStatus: titleCase(r.status || 'Unknown'),
    inspectionStatus: titleCase(r.inspectionStatus || 'N/A'),
    refundStatus: titleCase(r.refundStatus || 'N/A'),
    approvalStatus: titleCase(r.approvalStatus || 'N/A'),
    carrierStatus: titleCase(r.carrierStatus || r.systemStates?.carrier || 'N/A'),
    summary: r.summary || '',
    lastUpdate: formatRelativeLabel(r.lastUpdate),
    badges: Array.isArray(r.badges) ? r.badges : [],
    tab: r.tab || 'all',
    conflictDetected: r.conflictDetected || '',
    recommendedNextAction: r.recommendedAction || '',
    context: r.canonicalContext?.caseState?.conflict?.rootCause || r.summary || '',
    method: r.method || 'N/A',
    systemStates: typeof r.systemStates === 'object' && r.systemStates ? {
      oms: r.systemStates.oms || 'N/A',
      returnsPlatform: r.systemStates.returnsPlatform || 'N/A',
      wms: r.systemStates.wms || 'N/A',
      carrier: r.systemStates.carrier || 'N/A',
      psp: r.systemStates.psp || 'N/A',
      canonical: r.systemStates.canonical || 'N/A',
    } : { oms: 'N/A', returnsPlatform: 'N/A', wms: 'N/A', carrier: 'N/A', psp: 'N/A', canonical: 'N/A' },
    relatedCases: Array.isArray(r.relatedCases) ? r.relatedCases.map((c: any) => ({
      id: c.caseNumber || c.id,
      type: c.type || 'Case',
      status: titleCase(c.status || 'open')
    })) : [],
    timeline: (r.events || []).map((e: any, i: number) => ({
      id: e.id || String(i),
      type: e.type || 'system',
      content: e.content,
      time: e.time || e.occurredAt || '-',
      system: e.system || e.source,
    })),
  });

  const returns = useMemo(
    () => (Array.isArray(apiReturns) ? apiReturns.map(mapApiReturn) : []),
    [apiReturns],
  );
  const isInitialReturnsLoading = returnsLoading && returns.length === 0;

  const filteredReturns = useMemo(() => returns.filter(r => {
    if (activeTab === 'all') return true;
    return r.tab === activeTab;
  }), [activeTab, returns]);

  const selectedReturnBase = filteredReturns.find(r => r.id === selectedId) || filteredReturns[0] || null;
  const { data: selectedReturnDetailRaw, loading: selectedReturnDetailLoading } = useApi(
    () => selectedReturnBase ? returnsApi.get(selectedReturnBase.id) : Promise.resolve(null),
    [selectedReturnBase?.id],
    null,
  );

  const selectedReturn = useMemo(() => {
    if (!selectedReturnBase) return null;
    if (!selectedReturnDetailRaw) return selectedReturnBase;

    const detail = mapApiReturn(selectedReturnDetailRaw);
    return {
      ...selectedReturnBase,
      ...detail,
      timeline: detail.timeline.length > 0 ? detail.timeline : selectedReturnBase.timeline,
      relatedCases: detail.relatedCases.length > 0 ? detail.relatedCases : selectedReturnBase.relatedCases,
    };
  }, [selectedReturnBase, selectedReturnDetailRaw]);

  useEffect(() => {
    if (filteredReturns.length === 0) {
      if (selectedId) setSelectedId('');
      return;
    }
    if (!filteredReturns.find(r => r.id === selectedId)) {
      setSelectedId(filteredReturns[0].id);
    }
  }, [activeTab, filteredReturns, selectedId]);

  useEffect(() => {
    if (focusSection && ['all', 'pending_review', 'in_transit', 'received', 'refund_pending', 'blocked'].includes(focusSection) && activeTab !== focusSection) {
      setActiveTab(focusSection as ReturnTab);
    }
  }, [activeTab, focusSection]);

  useEffect(() => {
    if (!focusEntityId) return;
    if (activeTab !== 'all') {
      setActiveTab('all');
    }
    if (selectedId !== focusEntityId) {
      setSelectedId(focusEntityId);
    }
  }, [activeTab, focusEntityId, selectedId]);

  useEffect(() => {
    setActiveActionView('approve');
  }, [selectedId]);

  if (isInitialReturnsLoading) {
    return (
      <LoadingState
        title="Loading returns"
        message="Fetching canonical return data from Supabase."
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">
        {/* Returns Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Returns</h1>
            <div className="flex space-x-1">
              {[
                { id: 'all', label: 'All returns', count: returns.length },
                { id: 'pending_review', label: 'Pending review', count: returns.filter(r => r.tab === 'pending_review').length },
                { id: 'in_transit', label: 'In transit', count: returns.filter(r => r.tab === 'in_transit').length },
                { id: 'received', label: 'Received', count: returns.filter(r => r.tab === 'received').length },
                { id: 'refund_pending', label: 'Refund pending', count: returns.filter(r => r.tab === 'refund_pending').length },
                { id: 'blocked', label: 'Blocked', count: returns.filter(r => r.tab === 'blocked').length },
              ].map(tab => (
                <span 
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as ReturnTab)}
                  className={`px-3 py-1 text-sm font-medium rounded-md cursor-pointer transition-colors ${
                    activeTab === tab.id 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {tab.label} ({tab.count})
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="flex items-center text-gray-500 text-sm mr-2">
              <span className="w-2 h-2 rounded-md bg-green-500 mr-2"></span>
              Sync Active
            </div>
            <button
              onClick={() => setActiveTab('all')}
              title="Clear filters"
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <span className="material-symbols-outlined">filter_list_off</span>
            </button>
          </div>
        </div>

        {/* Main Content Area: Three Panes */}
        {returnsError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {returnsError}
          </div>
        )}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Pane: List */}
          <div className="w-80 flex-shrink-0 border-r border-gray-100 dark:border-gray-700 flex flex-col bg-gray-50/30 dark:bg-blue-600/5">
            <div className="overflow-y-auto flex-1 custom-scrollbar p-2 space-y-2">
              {filteredReturns.map((ret) => (
                <div
                  key={ret.id}
                  onClick={() => setSelectedId(ret.id)}
                  className={`p-4 rounded-xl border cursor-pointer group relative transition-all duration-200 ${
                    selectedId === ret.id
                      ? `bg-white dark:bg-gray-800 border-secondary shadow-card scale-[1.02] z-10`
                      : 'bg-white dark:bg-card-dark border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 shadow-sm hover:shadow-card'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex flex-col">
                      <span className={`font-semibold text-sm ${selectedId === ret.id ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                        {ret.customerName}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">{ret.returnId}</span>
                    </div>
                    <span className="text-xs text-gray-400">{ret.lastUpdate}</span>
                  </div>
                  <div className="mb-2">
                    <p className={`text-sm truncate ${selectedId === ret.id ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-600 dark:text-gray-300 font-normal'}`}>
                      {ret.summary}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {ret.badges.map(badge => (
                      <span key={badge} className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                        badge === 'Conflict' || badge === 'High Risk' || badge === 'Blocked'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Middle Pane: Details */}
          <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-card-dark overflow-y-auto custom-scrollbar relative">
            {!isRightSidebarOpen && (
              <div className="absolute top-4 right-6 z-10">
                <button 
                  onClick={() => setIsRightSidebarOpen(true)}
                  className="w-10 h-10 flex items-center justify-center bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-all"
                  title="Show Sidebar"
                >
                  <span className="material-symbols-outlined">view_sidebar</span>
                </button>
              </div>
            )}
            {selectedReturnDetailLoading ? (
              <div className="flex-1 flex items-center justify-center px-8 py-12">
                <div className="max-w-sm text-center">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Loading return details</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Fetching the return timeline and context together.</p>
                </div>
              </div>
            ) : selectedReturn ? (
              <div className="p-8 w-full space-y-8">
                <CaseHeader
                  caseId={selectedReturn.relatedCases[0]?.id || selectedReturn.returnId}
                  title={selectedReturn.summary}
                  channel="Web Chat"
                  customerName={selectedReturn.customerName}
                  orderId={selectedReturn.orderId}
                  brand={selectedReturn.brand}
                  initials={selectedReturn.customerName.split(' ').map(n => n[0]).join('')}
                  orderStatus={selectedReturn.orderStatus}
                  paymentStatus={selectedReturn.systemStates.psp}
                  fulfillmentStatus={selectedReturn.systemStates.wms}
                  refundStatus={selectedReturn.refundStatus}
                  approvalStatus={selectedReturn.approvalStatus}
                  recommendedAction={truncateLabel(selectedReturn.recommendedNextAction)}
                  conflictDetected={selectedReturn.conflictDetected}
                  onResolve={selectedReturn.relatedCases[0]?.id ? () => handleResolveCase(selectedReturn.relatedCases[0].id) : undefined}
                  onSnooze={selectedReturn.relatedCases[0]?.id ? () => handleSnoozeCase(selectedReturn.relatedCases[0].id) : undefined}
                  moreMenuItems={selectedReturn.relatedCases[0]?.id ? ([
                    { label: 'Open in Inbox', icon: 'inbox', onClick: () => onNavigate?.('inbox', selectedReturn.relatedCases[0].id) },
                    { label: 'Close case', icon: 'cancel', onClick: () => handleCloseCase(selectedReturn.relatedCases[0].id), danger: true },
                  ] satisfies CaseHeaderMenuItem[]) : []}
                />

                {/* Action Bar */}
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    { id: 'approve', label: 'Approve' },
                    { id: 'reject', label: 'Reject' },
                    { id: 'received', label: 'Mark received' },
                    { id: 'refund', label: 'Process refund' },
                    { id: 'block', label: 'Block' },
                  ].map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => setActiveActionView(action.id as ReturnActionView)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                        activeActionView === action.id
                          ? 'bg-black text-white dark:bg-white dark:text-black'
                          : 'border border-black/10 bg-white text-gray-700 hover:bg-black/[0.03] dark:border-white/10 dark:bg-[#171717] dark:text-gray-200 dark:hover:bg-white/[0.05]'
                      }`}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>

                {caseActionMsg && (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-sm font-medium">
                    <span className="material-symbols-outlined text-base">check_circle</span>
                    {caseActionMsg}
                  </div>
                )}
                {/* Feedback toast */}
                {(actionSuccess || actionError) && (
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
                    actionError
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : 'bg-green-50 text-green-700 border border-green-200'
                  }`}>
                    <span className="material-symbols-outlined text-base">
                      {actionError ? 'error' : 'check_circle'}
                    </span>
                    {actionError || actionSuccess}
                  </div>
                )}

                {/* Grid Info */}
                <div className="grid grid-cols-3 gap-6">
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Return Details</span>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Reason</span>
                        <span className="font-medium text-gray-900 dark:text-white">{selectedReturn.returnReason}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Method</span>
                        <span className="font-medium text-gray-900 dark:text-white">{selectedReturn.method}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Value</span>
                        <span className="font-bold text-gray-900 dark:text-white">{selectedReturn.returnValue}</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">System States</span>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">OMS</span>
                        <span className="font-medium text-gray-900 dark:text-white">{selectedReturn.systemStates.oms}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">WMS</span>
                        <span className="font-medium text-gray-900 dark:text-white">{selectedReturn.systemStates.wms}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Carrier</span>
                        <span className="font-medium text-gray-900 dark:text-white">{selectedReturn.systemStates.carrier}</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Risk Analysis</span>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-2 h-2 rounded-md ${selectedReturn.riskLevel === 'Low' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{selectedReturn.riskLevel} Risk</span>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed">Based on customer history and return frequency.</p>
                  </div>
                </div>

                {activeActionView ? (
                  <MinimalCard
                    title={
                      activeActionView === 'approve'
                        ? 'Approval workspace'
                        : activeActionView === 'reject'
                          ? 'Rejection workspace'
                          : activeActionView === 'received'
                            ? 'Warehouse receipt workspace'
                            : activeActionView === 'refund'
                              ? 'Refund workspace'
                              : 'Blocking workspace'
                    }
                    subtitle="Review the current return posture, understand the outcome, and then confirm the operational writeback from the same surface."
                    icon={
                      activeActionView === 'approve'
                        ? 'task_alt'
                        : activeActionView === 'reject'
                          ? 'cancel'
                          : activeActionView === 'received'
                            ? 'warehouse'
                            : activeActionView === 'refund'
                              ? 'payments'
                              : 'block'
                    }
                    action={<MinimalPill tone="active">{selectedReturn.returnStatus}</MinimalPill>}
                  >
                    <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
                      <div className="space-y-4">
                        <div className="rounded-[20px] border border-black/5 bg-[#fbfbfa] p-4 dark:border-white/10 dark:bg-[#151515]">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">What changes now</p>
                          <p className="mt-3 text-sm font-medium leading-6 text-gray-900 dark:text-white">
                            {activeActionView === 'approve'
                              ? 'Approve the current return path so the replacement and courtesy-credit flow can continue with the expected writeback.'
                              : activeActionView === 'reject'
                                ? 'Reject the return path and leave a clear denied state for the downstream teams handling customer communications and policy follow-up.'
                                : activeActionView === 'received'
                                  ? 'Mark the item as physically received so warehouse and refund dependencies can move out of transit assumptions.'
                                  : activeActionView === 'refund'
                                    ? `Move this return into refund processing for ${selectedReturn.returnValue}, preserving the approval and risk trail.`
                                    : 'Block the return path when you need to halt progression and surface the record as requiring manual intervention.'}
                          </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-[18px] border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#171717]">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Approval</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{selectedReturn.approvalStatus}</p>
                          </div>
                          <div className="rounded-[18px] border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#171717]">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Refund</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{selectedReturn.refundStatus}</p>
                          </div>
                          <div className="rounded-[18px] border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#171717]">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Risk</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{selectedReturn.riskLevel} Risk</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <MinimalPill>{selectedReturn.method}</MinimalPill>
                          <MinimalPill>{selectedReturn.systemStates.wms}</MinimalPill>
                          <MinimalPill>{selectedReturn.systemStates.carrier}</MinimalPill>
                          <MinimalPill>{selectedReturn.recommendedNextAction || 'No blocker detected'}</MinimalPill>
                        </div>
                      </div>
                      <div className="space-y-3 rounded-[22px] border border-black/5 bg-white p-5 dark:border-white/10 dark:bg-[#171717]">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Operator notes</p>
                          <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
                            {selectedReturn.conflictDetected || selectedReturn.context || 'No additional conflict is currently attached to this return. You can still confirm the next return-state writeback from this panel.'}
                          </p>
                        </div>
                        <div className="space-y-2.5">
                          {activeActionView === 'approve' ? (
                            <button onClick={() => setActiveModal('approve')} className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#171717] text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-[#1f1f1f] px-4 py-2.5 text-[13px] font-semibold transition-colors shadow-sm">
                              <span className="material-symbols-outlined text-[16px] text-gray-500 dark:text-gray-400">task_alt</span>
                              Confirm approval
                              <span className="material-symbols-outlined text-[14px] ml-auto opacity-70">chevron_right</span>
                            </button>
                          ) : activeActionView === 'reject' ? (
                            <button onClick={() => setActiveModal('reject')} className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#171717] text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-[#1f1f1f] px-4 py-2.5 text-[13px] font-semibold transition-colors shadow-sm">
                              <span className="material-symbols-outlined text-[16px] text-gray-500 dark:text-gray-400">cancel</span>
                              Confirm rejection
                              <span className="material-symbols-outlined text-[14px] ml-auto opacity-70">chevron_right</span>
                            </button>
                          ) : activeActionView === 'received' ? (
                            <button onClick={() => setActiveModal('received')} className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#171717] text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-[#1f1f1f] px-4 py-2.5 text-[13px] font-semibold transition-colors shadow-sm">
                              <span className="material-symbols-outlined text-[16px] text-gray-500 dark:text-gray-400">warehouse</span>
                              Confirm receipt
                              <span className="material-symbols-outlined text-[14px] ml-auto opacity-70">chevron_right</span>
                            </button>
                          ) : activeActionView === 'refund' ? (
                            <button onClick={() => setActiveModal('refund')} className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#171717] text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-[#1f1f1f] px-4 py-2.5 text-[13px] font-semibold transition-colors">
                              <span className="material-symbols-outlined text-[16px] text-gray-500 dark:text-gray-400">payments</span>
                              Start refund processing
                              <span className="material-symbols-outlined text-[14px] ml-auto opacity-70">chevron_right</span>
                            </button>
                          ) : (
                            <button onClick={() => setActiveModal('block')} className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#171717] text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-[#1f1f1f] px-4 py-2.5 text-[13px] font-semibold transition-colors">
                              <span className="material-symbols-outlined text-[16px] text-gray-500 dark:text-gray-400">block</span>
                              Block this return
                              <span className="material-symbols-outlined text-[14px] ml-auto opacity-70">chevron_right</span>
                            </button>
                          )}
                          <button onClick={() => selectedReturn.relatedCases[0]?.id && onNavigate?.('inbox', selectedReturn.relatedCases[0].id)} className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/30 text-gray-700 dark:text-gray-200 hover:bg-gray-50 px-4 py-2.5 text-[13px] font-semibold transition-colors">
                            <span className="material-symbols-outlined text-[16px] text-gray-400">inbox</span>
                            Open linked case
                          </button>
                        </div>
                      </div>
                    </div>
                  </MinimalCard>
                ) : null}

                <MinimalTimeline title="Return Timeline" events={selectedReturn.timeline} />
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center px-8 py-12">
                <div className="max-w-sm text-center">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No returns found for this filter.</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Try switching tabs or loading a different case set.</p>
                </div>
              </div>
            )}
          </div>

          {/* Right Pane: Copilot/Details */}
          <div className={`transition-all duration-300 bg-white dark:bg-card-dark flex flex-col overflow-hidden ${isRightSidebarOpen ? 'w-80 lg:w-96 border-l border-gray-100 dark:border-gray-700' : 'w-0 border-none'}`}>
            <div className="relative flex items-center justify-center px-4 pt-4 pb-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRightTab('details')}
                  className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-semibold transition-colors border ${
                    rightTab === 'details'
                      ? 'text-white dark:text-gray-900 bg-gray-900 dark:bg-white border-gray-900 dark:border-white'
                      : 'text-gray-700 dark:text-gray-300 bg-transparent border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                >
                  Details
                </button>
                <button
                  onClick={() => setRightTab('copilot')}
                  className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-semibold transition-colors border ${
                    rightTab === 'copilot'
                      ? 'text-white dark:text-gray-900 bg-gray-900 dark:bg-white border-gray-900 dark:border-white'
                      : 'text-gray-700 dark:text-gray-300 bg-transparent border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                >
                  Copilot
                </button>
              </div>
              <button
                onClick={() => setIsRightSidebarOpen(false)}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-all"
                title="Hide Sidebar"
              >
                <span className="material-symbols-outlined text-[20px]">view_sidebar</span>
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {!selectedReturn ? (
                <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
                  Copilot is disabled until a return is selected.
                </div>
              ) : rightTab === 'copilot' ? (
                <CaseCopilotPanel
                  caseId={selectedReturn.relatedCases[0]?.id || selectedReturn.returnId}
                  entityLabel="return"
                  subjectLabel={`Return ${selectedReturn.returnId}`}
                  summary={`Return ${selectedReturn.returnId} for ${selectedReturn.customerName} is currently ${selectedReturn.returnStatus}. The refund amount is ${selectedReturn.total}.`}
                  conflict={selectedReturn.conflictDetected || (selectedReturn.returnStatus === 'Delayed' ? 'Return received but refund not triggered in OMS.' : 'No major conflicts detected.')}
                  recommendation={selectedReturn.recommendedNextAction || 'Monitor return transit status.'}
                  riskLabel={selectedReturn.riskLevel}
                  isLoading={selectedReturnDetailLoading}
                  suggestedQuestions={['What\'s the current status?', 'What should I do next?', 'Why is this return high risk?', 'Walk me through this return']}
                  onOpenModule={() => selectedReturn.relatedCases[0]?.id && onNavigate?.('case_graph', selectedReturn.relatedCases[0].id)}
                  moduleButtonLabel="View case"
                  onApply={() => selectedReturn.relatedCases[0]?.id && onNavigate?.('inbox', selectedReturn.relatedCases[0].id)}
                  applyButtonLabel="Open case"
                  emptyTitle="Ask me anything about this return"
                  emptySubtitle="I have full context: order, WMS, carrier and history."
                />
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {/* Case Attributes */}
                  <div className="p-4">
                    <button className="w-full py-2 flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg text-gray-600">assignment</span>
                        Return Attributes
                      </div>
                      <span className="material-symbols-outlined text-lg text-gray-400">expand_more</span>
                    </button>
                    <div className="grid grid-cols-2 gap-4 mt-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">tag</span>
                          Return ID
                        </span>
                        <span className="text-xs font-bold text-gray-900 dark:text-white">{selectedReturn.returnId}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">person</span>
                          Customer
                        </span>
                        <span className="text-xs font-bold text-gray-900 dark:text-white">{selectedReturn.customerName}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">payments</span>
                          Amount
                        </span>
                        <span className="text-xs font-bold text-gray-900 dark:text-white">{selectedReturn.total}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">info</span>
                          Status
                        </span>
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{selectedReturn.returnStatus}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">help</span>
                          Reason
                        </span>
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{selectedReturn.returnReason}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">public</span>
                          Country
                        </span>
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{selectedReturn.country}</span>
                      </div>
                    </div>
                  </div>

                  {/* Operational Links */}
                  <div className="p-4">
                    <button className="w-full py-2 flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg text-gray-600">link</span>
                        Operational Links
                      </div>
                      <span className="material-symbols-outlined text-lg text-gray-400">expand_more</span>
                    </button>
                    <div className="space-y-2 mt-2">
                      <a href={`https://oms.example.local/orders/${encodeURIComponent(selectedReturn.orderId)}`} target="_blank" rel="noreferrer" className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-blue-600 dark:text-blue-400 border border-transparent hover:border-blue-100 transition-all">
                        Order Management System (OMS)
                        <span className="material-symbols-outlined text-sm">open_in_new</span>
                      </a>
                      <a href={`https://returns.example.local/returns/${encodeURIComponent(selectedReturn.returnId)}`} target="_blank" rel="noreferrer" className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-blue-600 dark:text-blue-400 border border-transparent hover:border-blue-100 transition-all">
                        Return Record (RMS)
                        <span className="material-symbols-outlined text-sm">open_in_new</span>
                      </a>
                      <a href={`https://wms.example.local/tickets/${encodeURIComponent(selectedReturn.returnId)}`} target="_blank" rel="noreferrer" className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-blue-600 dark:text-blue-400 border border-transparent hover:border-blue-100 transition-all">
                        Warehouse (WMS) Ticket
                        <span className="material-symbols-outlined text-sm">open_in_new</span>
                      </a>
                    </div>
                  </div>

                  {/* Related Cases */}
                  <div className="p-4">
                    <button className="w-full py-2 flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg text-gray-600">history</span>
                        Related Cases
                      </div>
                      <span className="material-symbols-outlined text-lg text-gray-400">expand_more</span>
                    </button>
                    <div className="space-y-2 mt-2">
                      {selectedReturn.relatedCases.length > 0 ? selectedReturn.relatedCases.map((item) => (
                        <div key={item.id} className="p-2 rounded border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-bold text-gray-900 dark:text-white truncate">{item.id}</span>
                            <span className="text-[10px] text-gray-500 truncate">{item.type}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[10px] text-gray-500 flex-shrink-0">{item.status}</span>
                        </div>
                      )) : (
                        <p className="text-xs text-gray-400 italic p-2">No related cases found.</p>
                      )}
                    </div>
                  </div>

                  {/* Internal Notes */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg text-gray-600">sticky_note_2</span>
                        Internal Notes
                      </h3>
                      <button className="text-xs text-secondary font-bold hover:underline">+ Add Note</button>
                    </div>
                    <div className="space-y-3">
                      <div className="p-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg border border-yellow-100 dark:border-yellow-800/20">
                        <p className="text-xs text-yellow-900 dark:text-yellow-100 leading-relaxed italic">
                          "Customer inquiring about refund status. WMS confirmed receipt."
                        </p>
                        <div className="mt-2 flex justify-between items-center text-[10px] text-yellow-700/70">
                          <span>By Agent Mike</span>
                          <span>4h ago</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* ── Action Modals ────────────────────────────────────────────── */}
      {selectedReturn && (
        <>
          {/* Approve modal */}
          <ActionModal
            open={activeModal === 'approve'}
            onClose={() => setActiveModal(null)}
            onConfirm={async () => {
              setModalLoading(true);
              await handleStatusUpdate('approved', 'Approved');
              setModalLoading(false);
              setActiveModal(null);
            }}
            loading={modalLoading}
            variant="default"
            icon="task_alt"
            title="Approve Return"
            subtitle={`Approve return ${selectedReturn.returnId} for ${selectedReturn.customerName}`}
            context={[
              { label: 'Return ID', value: selectedReturn.returnId },
              { label: 'Customer', value: selectedReturn.customerName },
              { label: 'Return Value', value: selectedReturn.returnValue },
              { label: 'Current Status', value: selectedReturn.returnStatus },
              { label: 'Approval Status', value: selectedReturn.approvalStatus },
              { label: 'Risk Level', value: selectedReturn.riskLevel, accent: selectedReturn.riskLevel === 'High' },
            ]}
            steps={[
              {
                text: 'Set return status to Approved',
                detail: 'Update the return record in the system and mark the approval flag as confirmed.',
              },
              {
                text: 'Unblock downstream dependencies',
                detail: 'Allow refund processing, warehouse receipt confirmation, and customer notifications to proceed.',
              },
              {
                text: 'Log action in audit trail',
                detail: 'Record the approval with your user ID, timestamp, and current return state for compliance.',
              },
            ]}
            considerations={[
              { text: 'Approving this return authorises the customer for a refund of ' + selectedReturn.returnValue + '. Ensure the return reason and inspection notes are correct before proceeding.' },
              { text: 'If the item has not yet been received by the warehouse, approval will not automatically trigger the refund. A warehouse receipt confirmation is still required.' },
              { text: 'High-risk returns should be reviewed against the customer\'s return history before approval.' },
            ]}
            confirmLabel="Approve Return"
          />

          {/* Reject modal */}
          <ActionModal
            open={activeModal === 'reject'}
            onClose={() => setActiveModal(null)}
            onConfirm={async () => {
              setModalLoading(true);
              await handleStatusUpdate('rejected', 'Rejected');
              setModalLoading(false);
              setActiveModal(null);
            }}
            loading={modalLoading}
            variant="danger"
            icon="cancel"
            title="Reject Return"
            subtitle={`Reject return ${selectedReturn.returnId} and deny the refund request`}
            context={[
              { label: 'Return ID', value: selectedReturn.returnId },
              { label: 'Customer', value: selectedReturn.customerName },
              { label: 'Return Value', value: selectedReturn.returnValue, accent: true },
              { label: 'Return Reason', value: selectedReturn.returnReason },
              { label: 'Current Status', value: selectedReturn.returnStatus },
              { label: 'Risk Level', value: selectedReturn.riskLevel, accent: selectedReturn.riskLevel === 'High' },
            ]}
            steps={[
              {
                text: 'Set return status to Rejected',
                detail: 'Update the return record to reflect the denied state across all connected systems.',
              },
              {
                text: 'Block refund and replacement flows',
                detail: 'Prevent any refund processing or replacement shipment from being triggered automatically.',
              },
              {
                text: 'Log rejection with reason',
                detail: 'Record the rejection decision in the audit trail. Customer-facing communication must be handled separately.',
              },
            ]}
            considerations={[
              { text: 'This action is difficult to reverse. The customer will not receive a refund unless the rejection is manually overridden by a supervisor.' },
              { text: 'Ensure the rejection complies with your return policy and consumer protection laws for the customer\'s country (' + selectedReturn.country + ').' },
              { text: 'Customer communication after rejection is not automated — you will need to send a rejection notice manually through the messaging workspace.' },
            ]}
            confirmLabel="Reject Return"
          />

          {/* Mark Received modal */}
          <ActionModal
            open={activeModal === 'received'}
            onClose={() => setActiveModal(null)}
            onConfirm={async () => {
              setModalLoading(true);
              await handleStatusUpdate('received', 'Marked Received');
              setModalLoading(false);
              setActiveModal(null);
            }}
            loading={modalLoading}
            variant="default"
            icon="warehouse"
            title="Mark as Received"
            subtitle={`Confirm warehouse receipt for return ${selectedReturn.returnId}`}
            context={[
              { label: 'Return ID', value: selectedReturn.returnId },
              { label: 'Customer', value: selectedReturn.customerName },
              { label: 'Carrier Status', value: selectedReturn.systemStates.carrier },
              { label: 'WMS Status', value: selectedReturn.systemStates.wms },
              { label: 'Inspection Status', value: selectedReturn.inspectionStatus },
              { label: 'Return Value', value: selectedReturn.returnValue },
            ]}
            steps={[
              {
                text: 'Mark item as physically received in warehouse',
                detail: 'Update the WMS record to confirm the item has arrived and is available for inspection.',
              },
              {
                text: 'Trigger inspection workflow (if configured)',
                detail: 'Notify the QA team that the item is ready for condition assessment before the refund is released.',
              },
              {
                text: 'Update carrier and OMS states',
                detail: 'Sync the received status back to the carrier tracking record and the OMS order line.',
              },
              {
                text: 'Unlock refund processing',
                detail: 'Once received, the return can proceed to refund processing if already approved.',
              },
            ]}
            considerations={[
              { text: 'Only mark as received if the item has physically arrived at your warehouse. Premature confirmation may trigger an incorrect refund.' },
              { text: 'If inspection is required, the refund will not be released automatically until the inspection is completed and the item condition is confirmed.' },
              { text: 'Carrier tracking discrepancies should be resolved before confirming receipt to avoid reconciliation issues later.' },
            ]}
            confirmLabel="Confirm Receipt"
          />

          {/* Process Refund modal */}
          <ActionModal
            open={activeModal === 'refund'}
            onClose={() => setActiveModal(null)}
            onConfirm={async () => {
              setModalLoading(true);
              await handleStatusUpdate('refund_pending', 'Refund Initiated');
              setModalLoading(false);
              setActiveModal(null);
            }}
            loading={modalLoading}
            variant="warning"
            icon="payments"
            title={`Process Refund — ${selectedReturn.returnValue}`}
            subtitle={`Initiate refund processing for ${selectedReturn.customerName}`}
            context={[
              { label: 'Return ID', value: selectedReturn.returnId },
              { label: 'Customer', value: selectedReturn.customerName },
              { label: 'Refund Amount', value: selectedReturn.returnValue, accent: true },
              { label: 'Refund Status', value: selectedReturn.refundStatus },
              { label: 'Approval Status', value: selectedReturn.approvalStatus },
              { label: 'Receipt Status', value: selectedReturn.inspectionStatus },
            ]}
            steps={[
              {
                text: 'Validate refund prerequisites',
                detail: 'Confirm the return is approved, the item is received, and no disputes are blocking the refund.',
              },
              {
                text: `Submit refund of ${selectedReturn.returnValue} to payment provider`,
                detail: `Send the refund request via ${selectedReturn.systemStates.psp}. Processing time depends on the original payment method.`,
              },
              {
                text: 'Update refund status to Pending',
                detail: 'Mark the return as Refund Pending in the system until the PSP confirms the transaction.',
              },
              {
                text: 'Notify customer (if configured)',
                detail: 'Send a refund confirmation notification to the customer via their preferred channel.',
              },
            ]}
            considerations={[
              { text: 'Refund of ' + selectedReturn.returnValue + ' is irreversible once submitted to the payment provider. Double-check the return value before confirming.' },
              { text: 'Processing times vary by payment method: card refunds typically take 5–10 business days; bank transfers may take longer.' },
              { text: 'If the original payment has expired or the card was cancelled, the refund may fail and require manual processing through the PSP dashboard.' },
            ]}
            confirmLabel="Initiate Refund"
          />

          {/* Block modal */}
          <ActionModal
            open={activeModal === 'block'}
            onClose={() => setActiveModal(null)}
            onConfirm={async () => {
              setModalLoading(true);
              await handleStatusUpdate('blocked', 'Blocked');
              setModalLoading(false);
              setActiveModal(null);
            }}
            loading={modalLoading}
            variant="danger"
            icon="block"
            title="Block Return"
            subtitle={`Halt all processing for return ${selectedReturn.returnId}`}
            context={[
              { label: 'Return ID', value: selectedReturn.returnId },
              { label: 'Customer', value: selectedReturn.customerName },
              { label: 'Return Value', value: selectedReturn.returnValue, accent: true },
              { label: 'Current Status', value: selectedReturn.returnStatus },
              { label: 'Risk Level', value: selectedReturn.riskLevel, accent: selectedReturn.riskLevel === 'High' },
              { label: 'Return Reason', value: selectedReturn.returnReason },
            ]}
            steps={[
              {
                text: 'Set return status to Blocked',
                detail: 'Immediately halt all active processing pipelines for this return across OMS, WMS, and PSP.',
              },
              {
                text: 'Freeze refund and approval flows',
                detail: 'Prevent any refund from being issued or approval from advancing until the block is manually lifted.',
              },
              {
                text: 'Flag for manual review',
                detail: 'Mark the return as requiring supervisor review and add it to the blocked returns queue.',
              },
            ]}
            considerations={[
              { text: 'Blocking this return will prevent any automated processing from continuing. A supervisor must manually unblock it to resume.' },
              { text: 'If the customer has already been notified of an approved refund, blocking may create a support escalation.' },
              { text: 'High-risk blocks should be documented with an internal note explaining the reason for the block for compliance and audit purposes.' },
              { text: 'Blocking does not cancel any return shipment in transit — coordinate with the carrier separately if needed.' },
            ]}
            confirmLabel="Block Return"
          />
        </>
      )}
    </div>
  );
}

