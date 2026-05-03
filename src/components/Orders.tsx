import React, { useState, useEffect, useMemo } from 'react';
import { Order, OrderTab } from '../types';
import CaseHeader from './CaseHeader';
import type { CaseHeaderMenuItem } from './CaseHeader';
import CaseCopilotPanel from './CaseCopilotPanel';
import MinimalTimeline from './MinimalTimeline';
import { MinimalButton, MinimalCard, MinimalPill } from './MinimalCategoryShell';
import { ActionModal } from './ActionModal';
import { casesApi, ordersApi, paymentsApi } from '../api/client';
import { useApi } from '../api/hooks';
import LoadingState from './LoadingState';
import type { NavigateFn } from '../types';

type OrderAction = 'open_case' | 'refund' | 'note' | 'cancel' | null;

type RightTab = 'details' | 'copilot';

interface OrdersProps {
  onNavigate?: NavigateFn;
  focusEntityId?: string | null;
  focusSection?: string | null;
}

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-';

const formatRelativeLabel = (value?: string | null) => {
  if (!value) return 'Unknown';
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

export default function Orders({ onNavigate, focusEntityId, focusSection }: OrdersProps) {
  const [rightTab, setRightTab] = useState<RightTab>('copilot');
  const [activeTab, setActiveTab] = useState<OrderTab>('all');
  const [selectedId, setSelectedId] = useState<string>('1');
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [caseActionMsg, setCaseActionMsg] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<OrderAction>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [noteText, setNoteText] = useState('');

  const showCaseMsg = (msg: string) => {
    setCaseActionMsg(msg);
    setTimeout(() => setCaseActionMsg(null), 3500);
  };

  const handleResolveCase = async (caseId: string) => {
    try {
      await casesApi.resolve(caseId);
      showCaseMsg('Case marked as resolved');
    } catch { showCaseMsg('Failed to resolve case'); }
  };

  const handleSnoozeCase = async (caseId: string) => {
    try {
      await casesApi.updateStatus(caseId, 'snoozed');
      showCaseMsg('Case snoozed');
    } catch { showCaseMsg('Failed to snooze case'); }
  };

  const handleCloseCase = async (caseId: string) => {
    try {
      await casesApi.updateStatus(caseId, 'closed');
      showCaseMsg('Case closed');
    } catch { showCaseMsg('Failed to close case'); }
  };

  // Load orders from API, fall back to static data on error
  const { data: apiOrders, loading, error: ordersError } = useApi(
    () => ordersApi.list(activeTab !== 'all' ? { tab: activeTab } : {}),
    [activeTab],
    []
  );

  // Map API data shape to component shape. The API client normalizes all
  // responses to camelCase via src/api/normalize.ts, so this mapper only
  // needs camelCase property accesses.
  const mapApiOrder = (o: any): Order => ({
    id: o.id,
    customerName: o.customerName || o.externalOrderId || 'Unknown',
    orderId: o.externalOrderId,
    brand: o.brand || 'Acme Store',
    date: formatDate(o.orderDate),
    total: `$${Number(o.totalAmount || 0).toFixed(2)}`,
    currency: o.currency || 'USD',
    country: o.country || 'US',
    channel: o.canonicalContext?.caseState?.channelContext?.channel || o.brand || 'Shopify',
    orderStatus: titleCase(o.status || o.systemStates?.oms || 'Unknown'),
    paymentStatus: o.systemStates?.psp || 'Unknown',
    fulfillmentStatus: o.systemStates?.wms || 'N/A',
    returnStatus: titleCase(o.systemStates?.returnsPlatform || 'N/A'),
    refundStatus: titleCase(o.systemStates?.refundStatus || 'N/A'),
    approvalStatus: titleCase(o.approvalStatus || 'N/A'),
    riskLevel: o.riskLevel === 'high' ? 'High' : o.riskLevel === 'medium' ? 'Medium' : 'Low',
    orderType: o.orderType || 'Standard',
    summary: o.summary || '',
    lastUpdate: formatRelativeLabel(o.lastUpdate),
    badges: Array.isArray(o.badges) ? o.badges : [],
    tab: o.tab || 'all',
    conflictDetected: o.conflictDetected || '',
    recommendedNextAction: o.recommendedAction || '',
    context: o.canonicalContext?.caseState?.conflict?.rootCause || o.summary || '',
    systemStates: typeof o.systemStates === 'object' && o.systemStates ? o.systemStates : {
      oms: 'Unknown', psp: 'Unknown', wms: 'Unknown', carrier: 'Unknown', canonical: 'Unknown'
    },
    canonicalContext: o.canonicalContext || null,
    relatedCases: Array.isArray(o.relatedCases) ? o.relatedCases.map((c: any) => ({
      id: c.caseNumber || c.id,
      type: c.type || 'Case',
      status: titleCase(c.status || 'open')
    })) : [],
    timeline: (o.events || []).map((e: any, i: number) => ({
      id: e.id || String(i),
      type: e.type || 'system',
      content: e.content,
      time: e.time || e.occurredAt || '-',
      system: e.system || e.source,
    }))
  });

  const orders = Array.isArray(apiOrders) ? apiOrders.map(mapApiOrder) : [];
  const isInitialOrdersLoading = loading && orders.length === 0;

  const handleCancelOrder = async (id: string) => {
    try {
      await ordersApi.cancel(id, 'User requested cancellation via UI');
      setActionMessage(`Cancellation request sent for ${id}`);
    } catch (e) {
      setActionMessage(`Failed to cancel order ${id}`);
    }
  };


  const filteredOrders = orders.filter(o => {
    if (activeTab === 'all') return true;
    
    if (activeTab === 'attention') {
      return (
        o.relatedCases.length > 0 ||
        o.refundStatus.toLowerCase().includes('pending') ||
        o.refundStatus.toLowerCase().includes('issue') ||
        o.returnStatus.toLowerCase().includes('issue') ||
        o.conflictDetected !== '' ||
        o.approvalStatus === 'Pending' ||
        o.approvalStatus === 'Waiting Info' ||
        o.orderStatus === 'Blocked' ||
        o.riskLevel === 'High' ||
        o.recommendedNextAction !== '' ||
        o.summary.toLowerCase().includes('refund') ||
        o.summary.toLowerCase().includes('cancellation') ||
        o.summary.toLowerCase().includes('return')
      );
    }
    if (activeTab === 'refunds') {
      return (
        o.refundStatus !== 'N/A' && o.refundStatus !== 'Not issued' ||
        o.summary.toLowerCase().includes('refund') ||
        o.badges.includes('Refund Pending')
      );
    }
    
    if (activeTab === 'conflicts') {
      return (
        o.conflictDetected !== '' ||
        o.badges.includes('Conflict')
      );
    }
    
    return false;
  });

  const selectedOrderBase = filteredOrders.find(o => o.id === selectedId) || filteredOrders[0] || null;
  const { data: selectedOrderDetailRaw, loading: selectedOrderDetailLoading } = useApi(
    () => selectedOrderBase ? ordersApi.get(selectedOrderBase.id) : Promise.resolve(null),
    [selectedOrderBase?.id],
    null,
  );

  const selectedOrder = useMemo(() => {
    if (!selectedOrderBase) return null;
    if (!selectedOrderDetailRaw) return selectedOrderBase;

    const detail = mapApiOrder(selectedOrderDetailRaw);
    return {
      ...selectedOrderBase,
      ...detail,
      timeline: detail.timeline.length > 0 ? detail.timeline : selectedOrderBase.timeline,
      relatedCases: detail.relatedCases.length > 0 ? detail.relatedCases : selectedOrderBase.relatedCases,
      canonicalContext: detail.canonicalContext ?? selectedOrderBase.canonicalContext,
    };
  }, [selectedOrderBase, selectedOrderDetailRaw]);

  useEffect(() => {
    if (filteredOrders.length > 0 && !filteredOrders.find(o => o.id === selectedId)) {
      setSelectedId(filteredOrders[0].id);
    }
  }, [activeTab, filteredOrders, selectedId]);

  useEffect(() => {
    if (focusSection && ['all', 'attention', 'refunds', 'conflicts'].includes(focusSection) && activeTab !== focusSection) {
      setActiveTab(focusSection as OrderTab);
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

  const selectedOrderCaseId = selectedOrder?.relatedCases?.[0]?.id || null;
  const selectedOrderPaymentId =
    selectedOrder?.canonicalContext?.caseState?.identifiers?.paymentIds?.[0]
    || selectedOrder?.canonicalContext?.identifiers?.paymentIds?.[0]
    || null;

  const handleApplyToComposer = () => {
    if (!selectedOrderCaseId) {
      setActionMessage('No linked case found for this order.');
      return;
    }
    onNavigate?.('inbox', selectedOrderCaseId);
    setActionMessage(`Opened ${selectedOrderCaseId} in Inbox.`);
  };

  const handleStartRefund = async () => {
    if (!selectedOrder) {
      setActionMessage('Select an order first.');
      return;
    }
    try {
      let paymentId = selectedOrderPaymentId;
      if (!paymentId) {
        const candidatePayments = await paymentsApi.list({ q: selectedOrder.orderId });
        paymentId = candidatePayments[0]?.id || null;
      }
      if (!paymentId) {
        setActionMessage('No refundable payment found for this order.');
        return;
      }
      await paymentsApi.refund(paymentId, {
        reason: `Refund started from order ${selectedOrder.orderId}`,
      });
      setActionMessage(`Refund created for payment ${paymentId}.`);
      onNavigate?.('payments');
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Failed to start refund.');
    }
  };

  const handleAddNote = async () => {
    if (!selectedOrder) {
      setActionMessage('Select an order first.');
      return;
    }
    if (!selectedOrderCaseId) {
      setActionMessage('No linked case found to add a note.');
      return;
    }
    try {
      await casesApi.addInternalNote(
        selectedOrderCaseId,
        `Order ${selectedOrder.orderId}: manual follow-up added from the Orders screen.`
      );
      setActionMessage(`Internal note added to ${selectedOrderCaseId}.`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Failed to add note.');
    }
  };

  if (isInitialOrdersLoading) {
    return (
      <LoadingState
        title="Loading orders"
        message="Fetching canonical commerce data from Supabase."
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">
        {/* Orders Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Orders</h1>
            <div className="flex space-x-1">
              {[
                { id: 'all', label: 'All orders', count: orders.length },
                { id: 'attention', label: 'Needs attention',
                  count: orders.filter(o => o.conflictDetected !== '' || o.riskLevel === 'High' || o.approvalStatus === 'Pending').length
                },
                { id: 'refunds', label: 'Refunds',
                  count: orders.filter(o => o.summary.toLowerCase().includes('refund') || o.badges.includes('Refund Pending')).length
                },
                { id: 'conflicts', label: 'Conflicts',
                  count: orders.filter(o => o.conflictDetected !== '' || o.badges.includes('Conflict')).length
                },
              ].map(tab => (
                <span 
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as OrderTab)}
                  className={`px-3 py-1 text-sm font-medium rounded-full cursor-pointer transition-colors ${
                    activeTab === tab.id 
                      ? 'bg-black text-white' 
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
              <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
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

        {(ordersError || actionMessage) && (
          <div className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-card dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-lg mt-0.5">error</span>
              <div className="min-w-0">
                <div className="font-semibold">Orders action status</div>
                <div className="text-xs opacity-90">{actionMessage || ordersError}</div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area: Three Panes */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Pane: List */}
          <div className="w-80 flex-shrink-0 border-r border-gray-100 dark:border-gray-700 flex flex-col bg-gray-50/30 dark:bg-black/5">
            <div className="overflow-y-auto flex-1 custom-scrollbar p-2 space-y-2">
              {filteredOrders.map((order) => (
                <div
                  key={order.id}
                  onClick={() => setSelectedId(order.id)}
                  className={`p-4 rounded-xl border cursor-pointer group relative transition-all duration-200 ${
                    selectedId === order.id
                      ? `bg-white dark:bg-gray-800 border-secondary shadow-card scale-[1.02] z-10`
                      : 'bg-white dark:bg-card-dark border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 shadow-sm hover:shadow-card'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex flex-col">
                      <span className={`font-semibold text-sm ${selectedId === order.id ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                        {order.customerName}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">{order.orderId}</span>
                    </div>
                    <span className="text-xs text-gray-400">{order.lastUpdate}</span>
                  </div>
                  <div className="mb-2">
                    <p className={`text-sm truncate ${selectedId === order.id ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-600 dark:text-gray-300 font-normal'}`}>
                      {order.summary}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {order.badges.map(badge => (
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
            {selectedOrderDetailLoading ? (
              <div className="flex-1 flex items-center justify-center px-8 py-12">
                <div className="max-w-sm text-center">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Loading order details</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Fetching the order timeline and context together.</p>
                </div>
              </div>
            ) : selectedOrder ? (
              <div className="p-8 w-full space-y-8">
                {caseActionMsg && (
                  <div className="mb-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-sm font-medium">
                    <span className="material-symbols-outlined text-base">check_circle</span>
                    {caseActionMsg}
                  </div>
                )}
                <CaseHeader
                  caseId={selectedOrder.relatedCases[0]?.id || selectedOrder.orderId}
                  title={selectedOrder.summary}
                  channel={selectedOrder.channel === 'Shopify' ? 'Web Chat' : selectedOrder.channel}
                  customerName={selectedOrder.customerName}
                  orderId={selectedOrder.orderId}
                  brand={selectedOrder.brand}
                  initials={selectedOrder.customerName.split(' ').map(n => n[0]).join('')}
                  orderStatus={selectedOrder.orderStatus}
                  paymentStatus={selectedOrder.paymentStatus}
                  fulfillmentStatus={selectedOrder.fulfillmentStatus}
                  refundStatus={selectedOrder.refundStatus}
                  approvalStatus={selectedOrder.approvalStatus}
                  recommendedAction={truncateLabel(selectedOrder.recommendedNextAction)}
                  conflictDetected={selectedOrder.conflictDetected}
                  onResolve={selectedOrder.relatedCases[0]?.id ? () => handleResolveCase(selectedOrder.relatedCases[0].id) : undefined}
                  onSnooze={selectedOrder.relatedCases[0]?.id ? () => handleSnoozeCase(selectedOrder.relatedCases[0].id) : undefined}
                  moreMenuItems={selectedOrder.relatedCases[0]?.id ? ([
                    { label: 'Open in Inbox', icon: 'inbox', onClick: () => onNavigate?.('inbox', selectedOrder.relatedCases[0].id) },
                    { label: 'Close case', icon: 'cancel', onClick: () => handleCloseCase(selectedOrder.relatedCases[0].id), danger: true },
                  ] satisfies CaseHeaderMenuItem[]) : []}
                />

                {/* Grid Info */}
                <div className="grid grid-cols-3 gap-6">
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Order Details</span>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Channel</span>
                        <span className="font-medium text-gray-900 dark:text-white">{selectedOrder.channel}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Country</span>
                        <span className="font-medium text-gray-900 dark:text-white">{selectedOrder.country}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Total</span>
                        <span className="font-bold text-gray-900 dark:text-white">{selectedOrder.total}</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">System States</span>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">OMS</span>
                        <span className="font-medium text-gray-900 dark:text-white">{selectedOrder.systemStates.oms}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">PSP</span>
                        <span className="font-medium text-gray-900 dark:text-white">{selectedOrder.systemStates.psp}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">WMS</span>
                        <span className="font-medium text-gray-900 dark:text-white">{selectedOrder.systemStates.wms}</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Risk Analysis</span>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-2 h-2 rounded-full ${selectedOrder.riskLevel === 'Low' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{selectedOrder.riskLevel} Risk</span>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed">Based on fraud score and payment verification.</p>
                  </div>
                </div>

                <MinimalCard
                  title="Operational workspace"
                  subtitle="Use the same action surface for the common order paths before moving to Inbox or Payments."
                  icon="dashboard_customize"
                  action={<MinimalPill tone="active">{selectedOrder.orderStatus}</MinimalPill>}
                >
                  <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
                    <div className="space-y-4">
                      <div className="rounded-[20px] border border-black/5 bg-[#fbfbfa] p-4 dark:border-white/10 dark:bg-[#151515]">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Current state</p>
                        <p className="mt-3 text-sm font-medium leading-6 text-gray-900 dark:text-white">
                          {selectedOrder.summary || 'This order is stable and ready for the next operational handoff.'}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <MinimalPill>{selectedOrder.paymentStatus}</MinimalPill>
                          <MinimalPill>{selectedOrder.fulfillmentStatus}</MinimalPill>
                          <MinimalPill>{selectedOrder.approvalStatus}</MinimalPill>
                        </div>
                      </div>
                      <div className="rounded-[20px] border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#171717]">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Next handoff</p>
                        <p className="mt-3 text-sm font-medium leading-6 text-gray-900 dark:text-white">
                          {selectedOrder.recommendedNextAction || 'No blocking action is pending right now. You can continue from Inbox or Payments if the customer asks for a change.'}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2.5">
                      <button
                        onClick={() => setActiveModal('open_case')}
                        className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#171717] text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-[#1f1f1f] px-4 py-2.5 text-[13px] font-semibold transition-colors shadow-sm"
                      >
                        <span className="material-symbols-outlined text-[16px] text-gray-500 dark:text-gray-400">open_in_new</span>
                        Open linked case
                        <span className="material-symbols-outlined text-[14px] ml-auto opacity-60">chevron_right</span>
                      </button>
                      <button
                        onClick={() => setActiveModal('refund')}
                        className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#171717] text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-[#1f1f1f] px-4 py-2.5 text-[13px] font-semibold transition-colors"
                      >
                        <span className="material-symbols-outlined text-[16px] text-gray-500 dark:text-gray-400">currency_exchange</span>
                        Start refund flow
                        <span className="material-symbols-outlined text-[14px] ml-auto opacity-60">chevron_right</span>
                      </button>
                      <button
                        onClick={() => { setNoteText(''); setActiveModal('note'); }}
                        className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/30 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 px-4 py-2.5 text-[13px] font-semibold transition-colors"
                      >
                        <span className="material-symbols-outlined text-[16px] text-gray-400">edit_note</span>
                        Add internal note
                        <span className="material-symbols-outlined text-[14px] ml-auto opacity-40">chevron_right</span>
                      </button>
                      <button
                        onClick={() => setActiveModal('cancel')}
                        className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#171717] text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-[#1f1f1f] px-4 py-2.5 text-[13px] font-semibold transition-colors"
                      >
                        <span className="material-symbols-outlined text-[16px] text-gray-500 dark:text-gray-400">cancel</span>
                        Cancel order
                        <span className="material-symbols-outlined text-[14px] ml-auto opacity-60">chevron_right</span>
                      </button>
                    </div>
                  </div>
                </MinimalCard>

                <MinimalTimeline title="Order Timeline" events={selectedOrder.timeline} />
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center px-8 py-12">
                <div className="max-w-sm text-center">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No orders found for this filter.</h2>
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
              {!selectedOrder ? (
                <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
                  Copilot is disabled until an order is selected.
                </div>
              ) : rightTab === 'copilot' ? (
                <CaseCopilotPanel
                  caseId={selectedOrderCaseId || selectedOrder.id}
                  entityLabel="order"
                  subjectLabel={`Order ${selectedOrder.orderId}`}
                  summary={`Order ${selectedOrder.orderId} for ${selectedOrder.customerName} is currently ${selectedOrder.orderStatus}. The total amount is ${selectedOrder.total}.`}
                  conflict={selectedOrder.conflictDetected || 'No major conflicts detected for this order.'}
                  recommendation={selectedOrder.recommendedNextAction || 'Monitor fulfillment status and ensure carrier tracking is updated.'}
                  riskLabel={selectedOrder.riskLevel}
                  isLoading={selectedOrderDetailLoading}
                  suggestedQuestions={['What\'s the current status?', 'What should I do next?', 'Why is this order high risk?', 'Walk me through this order']}
                  onOpenModule={() => selectedOrderCaseId && onNavigate?.('case_graph', selectedOrderCaseId)}
                  moduleButtonLabel="View case"
                  onApply={handleApplyToComposer}
                  applyButtonLabel="Apply to Composer"
                  emptyTitle="Ask me anything about this order"
                  emptySubtitle="I have full context: order, payment, fulfillment and history."
                />
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {/* Case Attributes */}
                  <div className="p-4">
                    <button className="w-full py-2 flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg text-gray-600">assignment</span>
                        Order Attributes
                      </div>
                      <span className="material-symbols-outlined text-lg text-gray-400">expand_more</span>
                    </button>
                    <div className="grid grid-cols-2 gap-4 mt-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">tag</span>
                          Order ID
                        </span>
                        <span className="text-xs font-bold text-gray-900 dark:text-white">{selectedOrder.orderId}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">person</span>
                          Customer
                        </span>
                        <span className="text-xs font-bold text-gray-900 dark:text-white">{selectedOrder.customerName}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">payments</span>
                          Total
                        </span>
                        <span className="text-xs font-bold text-gray-900 dark:text-white">{selectedOrder.total}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">info</span>
                          Status
                        </span>
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{selectedOrder.orderStatus}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">hub</span>
                          Channel
                        </span>
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{selectedOrder.channel}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">public</span>
                          Country
                        </span>
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{selectedOrder.country}</span>
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
                      <a href={`https://oms.example.local/orders/${encodeURIComponent(selectedOrder.orderId)}`} target="_blank" rel="noreferrer" className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-blue-600 dark:text-blue-400 border border-transparent hover:border-blue-100 transition-all">
                        Order Management System (OMS)
                        <span className="material-symbols-outlined text-sm">open_in_new</span>
                      </a>
                      <a href={`https://dashboard.stripe.com/search?query=${encodeURIComponent(selectedOrder.orderId)}`} target="_blank" rel="noreferrer" className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-blue-600 dark:text-blue-400 border border-transparent hover:border-blue-100 transition-all">
                        Payment Gateway (PSP)
                        <span className="material-symbols-outlined text-sm">open_in_new</span>
                      </a>
                      <a href={`https://carrier.example.local/track/${encodeURIComponent(selectedOrder.orderId)}`} target="_blank" rel="noreferrer" className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-blue-600 dark:text-blue-400 border border-transparent hover:border-blue-100 transition-all">
                        Carrier Tracking Portal
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
                      {selectedOrder.relatedCases.length > 0 ? selectedOrder.relatedCases.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => onNavigate?.('case_graph', item.id)}
                          className="w-full text-left p-2 rounded border border-gray-100 dark:border-gray-800 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs font-bold text-gray-900 dark:text-white truncate">{item.id}</span>
                            <span className="text-[10px] text-gray-500 truncate">{item.type}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[10px] text-gray-500 flex-shrink-0">{item.status}</span>
                        </button>
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
                      <button onClick={handleAddNote} className="text-xs text-secondary font-bold hover:underline">+ Add Note</button>
                    </div>
                    <div className="space-y-3">
                      <div className="p-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg border border-yellow-100 dark:border-yellow-800/20">
                        <p className="text-xs text-yellow-900 dark:text-yellow-100 leading-relaxed italic">
                          "Order flagged for manual review due to high amount."
                        </p>
                        <div className="mt-2 flex justify-between items-center text-[10px] text-yellow-700/70">
                          <span>By System</span>
                          <span>1d ago</span>
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

      {/* ── Action Modals ───────────────────────────────────────────── */}

      {/* Open linked case */}
      <ActionModal
        open={activeModal === 'open_case'}
        onClose={() => setActiveModal(null)}
        loading={modalLoading}
        variant="default"
        icon="open_in_new"
        title="Open Linked Case"
        subtitle="Navigate to the support case associated with this order"
        context={selectedOrder ? [
          { label: 'Order ID', value: selectedOrder.orderId },
          { label: 'Customer', value: selectedOrder.customerName },
          { label: 'Case ID', value: selectedOrder.relatedCases[0]?.id ?? 'Not linked' },
          { label: 'Case status', value: selectedOrder.relatedCases[0]?.status ?? 'N/A' },
          { label: 'Order status', value: selectedOrder.orderStatus },
          { label: 'Risk level', value: selectedOrder.riskLevel, accent: selectedOrder.riskLevel === 'High' },
        ] : []}
        steps={[
          { text: 'Open Inbox thread', detail: 'The case conversation will load in the Inbox view with full message history.' },
          { text: 'Load order context panel', detail: 'This order\'s data (status, timeline, risk) will be pre-loaded in the right panel.' },
          { text: 'AI copilot activated', detail: 'The copilot will offer context-aware suggestions based on the current case state.' },
        ]}
        considerations={[
          { text: 'No changes will be made to the order or case — this is a read-only navigation.' },
          { text: `Linked case: ${selectedOrder?.relatedCases[0]?.id ?? 'none found'}. If no case exists, you will land on the Inbox root.` },
        ]}
        confirmLabel="Open in Inbox →"
        onConfirm={() => {
          setActiveModal(null);
          handleApplyToComposer();
        }}
      />

      {/* Start refund flow */}
      <ActionModal
        open={activeModal === 'refund'}
        onClose={() => setActiveModal(null)}
        loading={modalLoading}
        variant="warning"
        icon="currency_exchange"
        title="Start Refund Flow"
        subtitle="Initiate a full or partial refund via the payment gateway"
        context={selectedOrder ? [
          { label: 'Order ID', value: selectedOrder.orderId },
          { label: 'Customer', value: selectedOrder.customerName },
          { label: 'Order total', value: selectedOrder.total },
          { label: 'Payment status', value: selectedOrder.paymentStatus },
          { label: 'Refund status', value: selectedOrder.refundStatus },
          { label: 'Risk level', value: selectedOrder.riskLevel, accent: selectedOrder.riskLevel === 'High' },
        ] : []}
        steps={[
          { text: 'Locate linked payment', detail: 'The system will identify the captured payment associated with this order via the PSP.' },
          { text: 'Create refund request', detail: 'A refund request is submitted to the payment gateway. The amount defaults to the full order total unless a partial refund is configured.' },
          { text: 'PSP processes the refund', detail: 'The payment provider processes the reversal. Typical processing time: 3–5 business days depending on the bank.' },
          { text: 'Order state updated', detail: 'The order refund status will be updated to "Refund Pending" and then "Refunded" once confirmed by the PSP.' },
          { text: 'Navigate to Payments', detail: 'You will be redirected to the Payments section to monitor the refund progress in real time.' },
        ]}
        considerations={[
          { text: 'Refunds are irreversible once submitted to the PSP.' },
          { text: 'If the order has already been partially refunded, a second refund may create a conflict — review the payment history first.' },
          { text: 'High-risk orders (flagged by the risk engine) may require additional approval before the PSP accepts the refund.' },
          { text: 'Customer will typically see the refund in 3–5 business days, depending on their bank.' },
        ]}
        confirmLabel="Start refund"
        onConfirm={async () => {
          setModalLoading(true);
          await handleStartRefund();
          setModalLoading(false);
          setActiveModal(null);
        }}
      />

      {/* Add internal note */}
      <ActionModal
        open={activeModal === 'note'}
        onClose={() => setActiveModal(null)}
        loading={modalLoading}
        variant="default"
        icon="edit_note"
        title="Add Internal Note"
        subtitle="Attach a timestamped note to the linked support case"
        context={selectedOrder ? [
          { label: 'Order ID', value: selectedOrder.orderId },
          { label: 'Customer', value: selectedOrder.customerName },
          { label: 'Case ID', value: selectedOrder.relatedCases[0]?.id ?? 'Not linked' },
          { label: 'Current summary', value: selectedOrder.summary.slice(0, 60) + (selectedOrder.summary.length > 60 ? '…' : '') || 'No summary' },
        ] : []}
        steps={[
          { text: 'Note attached to case timeline', detail: 'The note will appear as an internal event in the case activity feed, visible only to workspace agents.' },
          { text: 'Case "last updated" timestamp refreshed', detail: 'The case will surface higher in attention queues if it was idle.' },
          { text: 'Audit log entry created', detail: 'The action is logged in the workspace audit trail with your user ID and timestamp.' },
        ]}
        considerations={[
          { text: 'Notes are permanent and cannot be deleted once added.' },
          { text: 'Notes are visible to all agents with access to this workspace — do not include sensitive payment data.' },
          { text: 'If no linked case exists, the note cannot be saved. Use "Open linked case" to create one first.' },
        ]}
        noteLabel="Your note"
        notePlaceholder={`e.g. "Customer confirmed address change — reshipment approved by manager."`}
        noteValue={noteText}
        onNoteChange={setNoteText}
        confirmLabel="Add note"
        onConfirm={async () => {
          setModalLoading(true);
          await handleAddNote();
          setModalLoading(false);
          setActiveModal(null);
        }}
      />

      {/* Cancel order */}
      <ActionModal
        open={activeModal === 'cancel'}
        onClose={() => setActiveModal(null)}
        loading={modalLoading}
        variant="danger"
        icon="cancel"
        title="Cancel Order"
        subtitle="Send a cancellation request for this order across all connected systems"
        context={selectedOrder ? [
          { label: 'Order ID', value: selectedOrder.orderId },
          { label: 'Customer', value: selectedOrder.customerName },
          { label: 'Order total', value: selectedOrder.total },
          { label: 'Fulfillment', value: selectedOrder.fulfillmentStatus },
          { label: 'Payment status', value: selectedOrder.paymentStatus },
          { label: 'Risk level', value: selectedOrder.riskLevel, accent: selectedOrder.riskLevel === 'High' },
        ] : []}
        steps={[
          { text: 'Cancellation request submitted to OMS', detail: 'The Order Management System receives the cancellation signal and halts any pending fulfillment steps.' },
          { text: 'Warehouse release signal sent', detail: 'If the order is in "packed" state, the WMS is instructed to return items to stock.' },
          { text: 'Payment refund triggered (if captured)', detail: 'If the payment has already been captured, an automatic refund is initiated via the PSP.' },
          { text: 'Carrier label voided', detail: 'If a shipping label was created, the carrier API is called to void it and release the booking.' },
          { text: 'Customer notification triggered', detail: 'An automated cancellation email/SMS is sent to the customer if notification settings are enabled.' },
          { text: 'Order status set to "Cancelled"', detail: 'All downstream systems will receive a state sync within the next reconciliation cycle.' },
        ]}
        considerations={[
          { text: 'Cancellation is IRREVERSIBLE. Once confirmed, the order cannot be reinstated — a new order must be created.' },
          { text: 'If the order is already "Delivered", cancellation is not possible and this action will have no effect on fulfillment.' },
          { text: 'Pending payment capture may still proceed if the cancellation arrives after the PSP authorization window.' },
          { text: `Current status is "${selectedOrder?.fulfillmentStatus ?? 'Unknown'}" — verify the order has not yet shipped before confirming.` },
        ]}
        confirmLabel="Yes, cancel order"
        onConfirm={async () => {
          if (!selectedOrder) return;
          setModalLoading(true);
          await handleCancelOrder(selectedOrder.id);
          setModalLoading(false);
          setActiveModal(null);
        }}
      />

    </div>
  );
}

