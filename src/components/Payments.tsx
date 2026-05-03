import React, { useState, useEffect, useMemo } from 'react';
import { Payment, PaymentTab, OrderTimelineEvent, NavigateFn } from '../types';
import CaseCopilotPanel from './CaseCopilotPanel';
import MinimalTimeline from './MinimalTimeline';
import { MinimalButton, MinimalCard, MinimalPill } from './MinimalCategoryShell';
import { ActionModal } from './ActionModal';
import { paymentsApi, reconciliationApi } from '../api/client';
import { useApi, useMutation } from '../api/hooks';
import LoadingState from './LoadingState';

type RightTab = 'details' | 'copilot';
type PaymentActionView = 'stripe' | 'refund' | 'reconcile' | null;
type PaymentModal = 'stripe' | 'refund' | 'reconcile' | null;

interface PaymentsProps {
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars

export default function Payments({ onNavigate, focusEntityId, focusSection }: PaymentsProps) {
  const [rightTab, setRightTab] = useState<RightTab>('copilot');
  const [activeTab, setActiveTab] = useState<PaymentTab>('all');
  const [selectedId, setSelectedId] = useState<string>('1');
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [activeActionView, setActiveActionView] = useState<PaymentActionView>('stripe');
  const [activeModal, setActiveModal] = useState<PaymentModal>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Fetch canonical payment contexts from the backend. Static fixtures are not
  // used as runtime data so this view stays aligned with Inbox/Case Graph.
  const { data: apiPayments, loading: paymentsLoading, refetch, error: paymentsError } = useApi(() => paymentsApi.list(), [], []);
  const refundMutation = useMutation<{ id: string; amount?: number; reason: string }, any>(
    ({ id, amount, reason }) => paymentsApi.refund(id, { amount, reason }),
  );
  const reconcileMutation = useMutation((caseId: string) => reconciliationApi.processOpen(caseId));

  const mapApiPayment = (p: any): Payment => ({
    id: p.id,
    orderId: p.orderId || 'N/A',
    paymentId: p.externalPaymentId || p.id,
    customerName: p.customerName || 'Unknown',
    amount: `$${Number(p.amount || 0).toFixed(2)}`,
    currency: p.currency || 'USD',
    paymentMethod: p.paymentMethod || 'Unknown',
    psp: p.psp || 'Unknown',
    date: formatDate(p.createdAt),
    lastUpdate: formatRelativeLabel(p.lastUpdate),
    orderStatus: titleCase(p.systemStates?.oms || 'Unknown'),
    paymentStatus: titleCase(p.status || 'Unknown'),
    refundStatus: titleCase(p.systemStates?.refund || 'N/A'),
    disputeStatus: titleCase(p.systemStates?.dispute || 'N/A'),
    reconciliationStatus: titleCase(p.systemStates?.reconciliation || 'N/A'),
    approvalStatus: titleCase(p.approvalStatus || 'N/A'),
    riskLevel: p.riskLevel === 'high' ? 'High' : p.riskLevel === 'medium' ? 'Medium' : 'Low',
    paymentType: p.paymentType || 'Standard',
    summary: p.summary || '',
    badges: Array.isArray(p.badges) ? p.badges : [],
    tab: p.tab || 'all',
    conflictDetected: p.conflictDetected || '',
    recommendedNextAction: p.recommendedAction || '',
    context: p.canonicalContext?.caseState?.conflict?.rootCause || p.summary || '',
    systemStates: typeof p.systemStates === 'object' && p.systemStates ? p.systemStates : {
      oms: 'N/A', psp: p.status || 'N/A', refund: 'N/A', dispute: 'N/A', reconciliation: 'N/A', canonical: 'N/A'
    },
    relatedCases: Array.isArray(p.relatedCases) ? p.relatedCases.map((c: any) => ({
      id: c.caseNumber || c.id,
      type: c.type || 'Case',
      status: titleCase(c.status || 'open')
    })) : [],
    timeline: (p.events || []).map((e: any, i: number) => ({
      id: e.id || String(i),
      type: e.type || 'system',
      content: e.content,
      time: e.time || e.occurredAt || '-',
      system: e.system || e.source,
    })),
    refundAmount: p.refundAmount ? `$${p.refundAmount}` : undefined,
    refundType: p.refundType || undefined,
    disputeReference: p.disputeReference || undefined,
    chargebackAmount: p.chargebackAmount ? `$${p.chargebackAmount}` : undefined,
  });

  const payments = Array.isArray(apiPayments) ? apiPayments.map(mapApiPayment) : [];
  const isInitialPaymentsLoading = paymentsLoading && payments.length === 0;

  const filteredPayments = payments.filter(p => {
    if (activeTab === 'all') return true;
    return p.tab === activeTab;
  });

  const selectedPaymentBase = filteredPayments.find(p => p.id === selectedId) || filteredPayments[0] || null;
  const { data: selectedPaymentDetailRaw, loading: selectedPaymentDetailLoading } = useApi(
    () => selectedPaymentBase ? paymentsApi.get(selectedPaymentBase.id) : Promise.resolve(null),
    [selectedPaymentBase?.id],
    null,
  );

  const selectedPayment = useMemo(() => {
    if (!selectedPaymentBase) return null;
    if (!selectedPaymentDetailRaw) return selectedPaymentBase;

    const detail = mapApiPayment(selectedPaymentDetailRaw);
    return {
      ...selectedPaymentBase,
      ...detail,
      timeline: detail.timeline.length > 0 ? detail.timeline : selectedPaymentBase.timeline,
      relatedCases: detail.relatedCases.length > 0 ? detail.relatedCases : selectedPaymentBase.relatedCases,
    };
  }, [selectedPaymentBase, selectedPaymentDetailRaw]);

  useEffect(() => {
    if (filteredPayments.length > 0 && !filteredPayments.find(p => p.id === selectedId)) {
      setSelectedId(filteredPayments[0].id);
    }
  }, [activeTab, filteredPayments, selectedId]);

  useEffect(() => {
    if (focusSection && ['all', 'refunds', 'disputes', 'reconciliation', 'blocked'].includes(focusSection) && activeTab !== focusSection) {
      setActiveTab(focusSection as PaymentTab);
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
    setActiveActionView('stripe');
  }, [selectedId]);

  const getPaymentGatewayUrl = (payment: Payment) => {
    const id = payment.paymentId;
    const psp = (payment.psp || '').toLowerCase();
    if (psp.includes('stripe')) return `https://dashboard.stripe.com/payments/${id}`;
    if (psp.includes('paypal')) return `https://www.paypal.com/activity/payment/${id}`;
    if (psp.includes('braintree')) return `https://www.braintreegateway.com/merchants/transactions/${id}`;
    return `https://dashboard.stripe.com/payments/${id}`;
  };

  const handleOpenGateway = (payment: Payment) => {
    window.open(getPaymentGatewayUrl(payment), '_blank', 'noopener,noreferrer');
  };

  const handleRefund = async (payment: Payment) => {
    setActionMessage(null);
    const numericAmount = Number(payment.amount.replace(/[^0-9.]/g, ''));
    const result = await refundMutation.mutate({
      id: payment.id,
      amount: Number.isFinite(numericAmount) ? numericAmount : undefined,
      reason: 'Refund issued from Payments workspace',
    });

    if (!result) {
      setActionMessage(refundMutation.error || 'Refund failed. Please try again.');
      return;
    }

    setActionMessage(result.message || 'Refund request persisted.');
    refetch();
  };

  const handleReconcile = async (payment: Payment) => {
    setActionMessage(null);
    try {
      await reconcileMutation.mutate(payment.id);
      setActionMessage('Reconciliation process triggered successfully.');
      refetch();
    } catch {
      setActionMessage('Failed to trigger reconciliation.');
    }
  };

  if (isInitialPaymentsLoading) {
    return (
      <LoadingState
        title="Loading payments"
        message="Fetching canonical payment data from Supabase."
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">
        {/* Payments Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Payments</h1>
            <div className="flex space-x-1">
              {[
                { id: 'all', label: 'All payments', count: payments.length },
                { id: 'refunds', label: 'Refunds', count: payments.filter(p => p.tab === 'refunds').length },
                { id: 'disputes', label: 'Disputes', count: payments.filter(p => p.tab === 'disputes').length },
                { id: 'reconciliation', label: 'Reconciliation', count: payments.filter(p => p.tab === 'reconciliation').length },
                { id: 'blocked', label: 'Blocked', count: payments.filter(p => p.tab === 'blocked').length },
              ].map(tab => (
                <span 
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as PaymentTab)}
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
            <button className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              <span className="material-symbols-outlined">filter_list</span>
            </button>
          </div>
        </div>

        {/* Main Content Area: Three Panes */}
        {paymentsError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {paymentsError}
          </div>
        )}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Pane: List */}
          <div className="w-80 flex-shrink-0 border-r border-gray-100 dark:border-gray-700 flex flex-col bg-gray-50/30 dark:bg-blue-600/5">
            <div className="overflow-y-auto flex-1 custom-scrollbar p-2 space-y-2">
              {filteredPayments.length === 0 && (
                <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
                  No payments found for this filter.
                </div>
              )}
              {filteredPayments.map((pay) => (
                <div
                  key={pay.id}
                  onClick={() => setSelectedId(pay.id)}
                  className={`p-4 rounded-xl border cursor-pointer group relative transition-all duration-200 ${
                    selectedId === pay.id
                      ? `bg-white dark:bg-gray-800 border-secondary shadow-card scale-[1.02] z-10`
                      : 'bg-white dark:bg-card-dark border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 shadow-sm hover:shadow-card'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex flex-col">
                      <span className={`font-semibold text-sm ${selectedId === pay.id ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                        {pay.customerName}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">{pay.paymentId}</span>
                    </div>
                    <span className="text-xs text-gray-400">{pay.lastUpdate}</span>
                  </div>
                  <div className="mb-2">
                    <p className={`text-sm truncate ${selectedId === pay.id ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-600 dark:text-gray-300 font-normal'}`}>
                      {pay.summary}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {pay.badges.map(badge => (
                      <span key={badge} className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                        badge === 'Conflict' || badge === 'High Risk' || badge === 'Blocked' || badge === 'Refund Failed'
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
          <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-card-dark overflow-y-auto custom-scrollbar">
            {selectedPayment && (
              <div className="p-8 w-full space-y-8">
                {selectedPaymentDetailLoading && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                    Loading payment details...
                  </div>
                )}
                {/* Header Info */}
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{selectedPayment.paymentId}</h2>
                      <span className={`px-2 py-1 text-[10px] font-bold rounded uppercase tracking-wider ${
                        selectedPayment.paymentStatus === 'Captured' || selectedPayment.paymentStatus === 'Completed' ? 'bg-green-100 text-green-700 border border-green-200' :
                        selectedPayment.paymentStatus === 'Failed' || selectedPayment.paymentStatus === 'Disputed' ? 'bg-red-100 text-red-700 border-red-200' :
                        'bg-blue-100 text-blue-700 border border-blue-200'
                      }`}>
                        {selectedPayment.paymentStatus}
                      </span>
                    </div>
                    <p className="text-gray-500 text-sm">Order {selectedPayment.orderId} · {selectedPayment.customerName} · {selectedPayment.date}</p>
                  </div>
                  <div className="flex gap-2 items-center">
                    {[
                      { id: 'stripe', label: `View in ${selectedPayment.psp}` },
                      { id: 'refund', label: 'Issue refund' },
                      { id: 'reconcile', label: 'Reconcile' },
                    ].map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => setActiveActionView(action.id as PaymentActionView)}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                          activeActionView === action.id
                            ? 'bg-black text-white dark:bg-white dark:text-black'
                            : 'border border-black/10 bg-white text-gray-700 hover:bg-black/[0.03] dark:border-white/10 dark:bg-[#171717] dark:text-gray-200 dark:hover:bg-white/[0.05]'
                        }`}
                      >
                        {action.label}
                      </button>
                    ))}
                    {!isRightSidebarOpen && (
                      <button 
                        onClick={() => setIsRightSidebarOpen(true)}
                        className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all shadow-sm ml-1"
                        title="Show Sidebar"
                      >
                        <span className="material-symbols-outlined text-[20px]">view_sidebar</span>
                      </button>
                    )}
                  </div>
                </div>

                {actionMessage && (
                  <div className="p-3 text-sm rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
                    {actionMessage}
                  </div>
                )}

                {/* Conflict Alert if any */}
                {selectedPayment.conflictDetected && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
                    <span className="material-symbols-outlined text-red-500 mt-0.5">warning</span>
                    <div>
                      <h4 className="text-sm font-bold text-red-900">Conflict Detected</h4>
                      <p className="text-sm text-red-700">{selectedPayment.conflictDetected}</p>
                    </div>
                  </div>
                )}

                {/* Grid Info */}
                <div className="grid grid-cols-3 gap-6">
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Payment Details</span>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Method</span>
                        <span className="font-medium text-gray-900 dark:text-white">{selectedPayment.paymentMethod}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">PSP</span>
                        <span className="font-medium text-gray-900 dark:text-white">{selectedPayment.psp}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Amount</span>
                        <span className="font-bold text-gray-900 dark:text-white">{selectedPayment.amount} {selectedPayment.currency}</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">System States</span>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">OMS</span>
                        <span className="font-medium text-gray-900 dark:text-white">{selectedPayment.systemStates.oms}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">PSP</span>
                        <span className="font-medium text-gray-900 dark:text-white">{selectedPayment.systemStates.psp}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Refund</span>
                        <span className="font-medium text-gray-900 dark:text-white">{selectedPayment.systemStates.refund}</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">Risk Analysis</span>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-2 h-2 rounded-md ${selectedPayment.riskLevel === 'Low' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{selectedPayment.riskLevel} Risk</span>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed">Based on PSP fraud signals and reconciliation status.</p>
                  </div>
                </div>

                {activeActionView ? (
                  <MinimalCard
                    title={activeActionView === 'stripe' ? 'Gateway workspace' : activeActionView === 'refund' ? 'Refund workspace' : 'Reconciliation workspace'}
                    subtitle={
                      activeActionView === 'stripe'
                        ? 'Review the gateway path and the internal dependencies before leaving the Payments workspace.'
                        : activeActionView === 'refund'
                          ? 'Inspect the refund path, what state it will touch, and what still needs human attention before writing back.'
                          : 'Inspect mismatch signals, expected writebacks and next operational checks before triggering reconciliation.'
                    }
                    icon={activeActionView === 'stripe' ? 'open_in_new' : activeActionView === 'refund' ? 'payments' : 'rule'}
                    action={<MinimalPill tone="active">{activeActionView === 'stripe' ? selectedPayment.psp : activeActionView === 'refund' ? selectedPayment.refundStatus : selectedPayment.reconciliationStatus}</MinimalPill>}
                  >
                    <div className="grid gap-6 lg:grid-cols-[1.1fr,0.9fr]">
                      <div className="space-y-4">
                        <div className="rounded-[20px] border border-black/5 bg-[#fbfbfa] p-4 dark:border-white/10 dark:bg-[#151515]">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">What this action covers</p>
                          <p className="mt-3 text-sm font-medium leading-6 text-gray-900 dark:text-white">
                            {activeActionView === 'stripe'
                              ? `Open the ${selectedPayment.psp} source of truth for ${selectedPayment.paymentId}, while keeping the linked order and case visible from this workspace.`
                              : activeActionView === 'refund'
                                ? `Prepare a refund for ${selectedPayment.amount} ${selectedPayment.currency}, reviewing approval and risk posture before sending the writeback.`
                                : 'Trigger the reconciliation worker only after checking that the PSP, OMS and refund states still disagree or need a fresh sync.'}
                          </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-[18px] border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#171717]">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Primary state</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{selectedPayment.paymentStatus}</p>
                          </div>
                          <div className="rounded-[18px] border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#171717]">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Approval</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{selectedPayment.approvalStatus}</p>
                          </div>
                          <div className="rounded-[18px] border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#171717]">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Risk</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{selectedPayment.riskLevel} Risk</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <MinimalPill>{selectedPayment.paymentMethod}</MinimalPill>
                          <MinimalPill>{selectedPayment.systemStates.psp}</MinimalPill>
                          <MinimalPill>{selectedPayment.systemStates.oms}</MinimalPill>
                          <MinimalPill>{selectedPayment.recommendedNextAction || 'No blocker detected'}</MinimalPill>
                        </div>
                      </div>
                      <div className="space-y-3 rounded-[22px] border border-black/5 bg-white p-5 dark:border-white/10 dark:bg-[#171717]">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Operator notes</p>
                          <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
                            {selectedPayment.conflictDetected || selectedPayment.context || 'No active discrepancy is blocking this payment. You can still review the gateway, issue a refund or run reconciliation from this panel.'}
                          </p>
                        </div>
                        <div className="space-y-2">
                          {activeActionView === 'stripe' ? (
                            <>
                              <button onClick={() => setActiveModal('stripe')} className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#171717] text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-[#1f1f1f] px-4 py-2.5 text-[13px] font-semibold transition-colors shadow-sm">
                                <span className="material-symbols-outlined text-[16px] text-gray-500 dark:text-gray-400">open_in_new</span>
                                Open {selectedPayment.psp}
                                <span className="material-symbols-outlined text-[14px] ml-auto opacity-60">chevron_right</span>
                              </button>
                              <button onClick={() => onNavigate?.('orders', selectedPayment.orderId)} className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/30 text-gray-700 dark:text-gray-200 hover:bg-gray-50 px-4 py-2.5 text-[13px] font-semibold transition-colors">
                                <span className="material-symbols-outlined text-[16px] text-gray-400">receipt_long</span>
                                Open related order
                              </button>
                              <button onClick={() => selectedPayment.relatedCases[0]?.id && onNavigate?.('inbox', selectedPayment.relatedCases[0].id)} className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/30 text-gray-700 dark:text-gray-200 hover:bg-gray-50 px-4 py-2.5 text-[13px] font-semibold transition-colors">
                                <span className="material-symbols-outlined text-[16px] text-gray-400">inbox</span>
                                Open linked case
                              </button>
                            </>
                          ) : activeActionView === 'refund' ? (
                            <>
                              <button onClick={() => setActiveModal('refund')} className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#171717] text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-[#1f1f1f] px-4 py-2.5 text-[13px] font-semibold transition-colors">
                                <span className="material-symbols-outlined text-[16px] text-gray-500 dark:text-gray-400">currency_exchange</span>
                                Issue refund
                                <span className="material-symbols-outlined text-[14px] ml-auto opacity-60">chevron_right</span>
                              </button>
                              <button onClick={() => setActiveActionView('reconcile')} className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/30 text-gray-700 dark:text-gray-200 hover:bg-gray-50 px-4 py-2.5 text-[13px] font-semibold transition-colors">
                                <span className="material-symbols-outlined text-[16px] text-gray-400">sync_alt</span>
                                Review reconciliation first
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => setActiveModal('reconcile')} className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#171717] text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-[#1f1f1f] px-4 py-2.5 text-[13px] font-semibold transition-colors">
                                <span className="material-symbols-outlined text-[16px] text-gray-500 dark:text-gray-400">sync_alt</span>
                                Trigger reconciliation
                                <span className="material-symbols-outlined text-[14px] ml-auto opacity-60">chevron_right</span>
                              </button>
                              <button onClick={() => setActiveActionView('stripe')} className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/30 text-gray-700 dark:text-gray-200 hover:bg-gray-50 px-4 py-2.5 text-[13px] font-semibold transition-colors">
                                <span className="material-symbols-outlined text-[16px] text-gray-400">open_in_new</span>
                                Review gateway first
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </MinimalCard>
                ) : null}

                <MinimalTimeline title="Payment Timeline" events={selectedPayment.timeline} />
              </div>
            )}
            {!selectedPayment && (
              <div className="flex-1 flex items-center justify-center px-8 py-12">
                <div className="max-w-sm text-center">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No payments found for this filter.</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Load demo payments or switch to another tab to continue.</p>
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
              {!selectedPayment ? (
                <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
                  Copilot is disabled until a payment is selected.
                </div>
              ) : rightTab === 'copilot' ? (
                <CaseCopilotPanel
                  caseId={selectedPayment.relatedCases[0]?.id || selectedPayment.id}
                  entityLabel="payment"
                  subjectLabel={`Payment ${selectedPayment.paymentId}`}
                  summary={`Payment ${selectedPayment.paymentId} for ${selectedPayment.customerName} is currently ${selectedPayment.paymentStatus}. The amount is ${selectedPayment.amount}.`}
                  conflict={selectedPayment.conflictDetected || (selectedPayment.paymentStatus === 'Failed' ? 'Payment failed in PSP but OMS still shows pending.' : 'No major conflicts detected.')}
                  recommendation={selectedPayment.recommendedNextAction || 'Monitor payment reconciliation.'}
                  riskLabel={selectedPayment.riskLevel}
                  isLoading={selectedPaymentDetailLoading}
                  suggestedQuestions={['What\'s the current status?', 'What should I do next?', 'Why is this payment high risk?', 'Walk me through this payment']}
                  onOpenModule={() => selectedPayment.relatedCases[0]?.id && onNavigate?.('case_graph', selectedPayment.relatedCases[0].id)}
                  moduleButtonLabel="View case"
                  onApply={() => selectedPayment.relatedCases[0]?.id && onNavigate?.('inbox', selectedPayment.relatedCases[0].id)}
                  applyButtonLabel="Open case"
                  emptyTitle="Ask me anything about this payment"
                  emptySubtitle="I have full context: order, PSP, reconciliation and history."
                />
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {/* Case Attributes */}
                  <div className="p-4">
                    <button className="w-full py-2 flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg text-gray-600">assignment</span>
                        Payment Attributes
                      </div>
                      <span className="material-symbols-outlined text-lg text-gray-400">expand_more</span>
                    </button>
                    <div className="grid grid-cols-2 gap-4 mt-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">tag</span>
                          Payment ID
                        </span>
                        <span className="text-xs font-bold text-gray-900 dark:text-white">{selectedPayment.paymentId}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">person</span>
                          Customer
                        </span>
                        <span className="text-xs font-bold text-gray-900 dark:text-white">{selectedPayment.customerName}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">payments</span>
                          Amount
                        </span>
                        <span className="text-xs font-bold text-gray-900 dark:text-white">{selectedPayment.amount}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">info</span>
                          Status
                        </span>
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{selectedPayment.paymentStatus}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">credit_card</span>
                          Method
                        </span>
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{selectedPayment.paymentMethod}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">account_balance</span>
                          PSP
                        </span>
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{selectedPayment.psp}</span>
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
                      <a href={`https://dashboard.stripe.com/search?query=${encodeURIComponent(selectedPayment?.paymentId || '')}`} target="_blank" rel="noreferrer" className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-blue-600 dark:text-blue-400 border border-transparent hover:border-blue-100 transition-all">
                        Payment Gateway (PSP)
                        <span className="material-symbols-outlined text-sm">open_in_new</span>
                      </a>
                      <a href={`https://oms.example.local/orders/${encodeURIComponent(selectedPayment.orderId)}`} target="_blank" rel="noreferrer" className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-blue-600 dark:text-blue-400 border border-transparent hover:border-blue-100 transition-all">
                        Order Management System (OMS)
                        <span className="material-symbols-outlined text-sm">open_in_new</span>
                      </a>
                      <a href={`https://reconcile.example.local/payments/${encodeURIComponent(selectedPayment?.paymentId || '')}`} target="_blank" rel="noreferrer" className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-blue-600 dark:text-blue-400 border border-transparent hover:border-blue-100 transition-all">
                        Reconciliation Tool
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
                      {selectedPayment.relatedCases.length > 0 ? selectedPayment.relatedCases.map((item) => (
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
                          "Payment failed twice. Customer notified to update payment method."
                        </p>
                        <div className="mt-2 flex justify-between items-center text-[10px] text-yellow-700/70">
                          <span>By System</span>
                          <span>2d ago</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            {!selectedPayment && (
              <div className="flex-1 flex items-center justify-center px-8 py-12">
                <div className="max-w-sm text-center">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No payments found for this filter.</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Load demo payments or switch to another tab to continue.</p>
                </div>
              </div>
            )}
            </div>

          </div>
        </div>
      </div>

      {/* ── Action Modals ────────────────────────────────────────────── */}
      {selectedPayment && (
        <>
          {/* Open Gateway modal */}
          <ActionModal
            open={activeModal === 'stripe'}
            onClose={() => setActiveModal(null)}
            onConfirm={() => {
              setActiveModal(null);
              handleOpenGateway(selectedPayment);
            }}
            loading={modalLoading}
            variant="default"
            icon="open_in_new"
            title={`Open ${selectedPayment.psp} Dashboard`}
            subtitle={`Navigate to the external gateway for payment ${selectedPayment.paymentId}`}
            context={[
              { label: 'Payment ID', value: selectedPayment.paymentId },
              { label: 'Customer', value: selectedPayment.customerName },
              { label: 'Amount', value: `${selectedPayment.amount} ${selectedPayment.currency}` },
              { label: 'PSP Status', value: selectedPayment.systemStates.psp },
              { label: 'Gateway', value: selectedPayment.psp },
              { label: 'Risk Level', value: selectedPayment.riskLevel, accent: selectedPayment.riskLevel === 'High' },
            ]}
            steps={[
              {
                text: `Open ${selectedPayment.psp} in a new tab`,
                detail: `Direct link to payment ${selectedPayment.paymentId} in the gateway dashboard.`,
              },
              {
                text: 'Review gateway transaction details',
                detail: 'Verify the PSP status, authorization codes, and any gateway-level notes.',
              },
              {
                text: 'Cross-reference with internal records',
                detail: 'Compare PSP state with OMS and reconciliation status shown in this workspace.',
              },
            ]}
            considerations={[
              { text: 'This opens an external site. Ensure you are logged in to your PSP account before proceeding.' },
              { text: 'Any changes made inside the gateway will not automatically sync back to this CRM. You will need to trigger reconciliation manually.' },
              { text: 'Do not initiate refunds directly in the gateway — use the "Issue Refund" workflow in this workspace to keep records in sync.' },
            ]}
            confirmLabel={`Open ${selectedPayment.psp}`}
          />

          {/* Issue Refund modal */}
          <ActionModal
            open={activeModal === 'refund'}
            onClose={() => setActiveModal(null)}
            onConfirm={async () => {
              setModalLoading(true);
              await handleRefund(selectedPayment);
              setModalLoading(false);
              setActiveModal(null);
            }}
            loading={modalLoading}
            variant="warning"
            icon="currency_exchange"
            title={`Issue Refund — ${selectedPayment.amount}`}
            subtitle={`Initiate a full refund for ${selectedPayment.customerName}`}
            context={[
              { label: 'Payment ID', value: selectedPayment.paymentId },
              { label: 'Customer', value: selectedPayment.customerName },
              { label: 'Amount to Refund', value: `${selectedPayment.amount} ${selectedPayment.currency}`, accent: true },
              { label: 'Payment Status', value: selectedPayment.paymentStatus },
              { label: 'Refund Status', value: selectedPayment.systemStates.refund },
              { label: 'Approval', value: selectedPayment.approvalStatus },
            ]}
            steps={[
              {
                text: 'Validate refund eligibility',
                detail: 'Check that the payment has been captured and is within the refund window for this PSP.',
              },
              {
                text: `Submit refund request to ${selectedPayment.psp}`,
                detail: `Send a full refund of ${selectedPayment.amount} via the gateway API. This action is immediate.`,
              },
              {
                text: 'Update internal records',
                detail: 'Mark refund status as "Pending" in the OMS and log the action in the audit trail.',
              },
              {
                text: 'Notify customer (if configured)',
                detail: 'Trigger a refund confirmation email or notification if the workspace has messaging enabled.',
              },
            ]}
            considerations={[
              { text: `This refund of ${selectedPayment.amount} is irreversible once submitted to ${selectedPayment.psp}.` },
              { text: 'Processing times vary: card refunds typically take 5–10 business days to appear on the customer statement.' },
              { text: 'If a dispute is already open for this payment, issuing a refund may affect the chargeback outcome. Consult your dispute management process first.' },
              { text: 'Partial refunds are not yet available from this workspace. Use the PSP dashboard for partial amounts.' },
            ]}
            confirmLabel="Confirm Refund"
          />

          {/* Reconcile modal */}
          <ActionModal
            open={activeModal === 'reconcile'}
            onClose={() => setActiveModal(null)}
            onConfirm={async () => {
              setModalLoading(true);
              await handleReconcile(selectedPayment);
              setModalLoading(false);
              setActiveModal(null);
            }}
            loading={modalLoading}
            variant="default"
            icon="sync_alt"
            title="Trigger Reconciliation"
            subtitle={`Sync payment ${selectedPayment.paymentId} across all systems`}
            context={[
              { label: 'Payment ID', value: selectedPayment.paymentId },
              { label: 'OMS State', value: selectedPayment.systemStates.oms },
              { label: 'PSP State', value: selectedPayment.systemStates.psp },
              { label: 'Refund State', value: selectedPayment.systemStates.refund },
              { label: 'Reconciliation', value: selectedPayment.reconciliationStatus },
              { label: 'Dispute', value: selectedPayment.systemStates.dispute },
            ]}
            steps={[
              {
                text: 'Fetch latest state from PSP',
                detail: `Query ${selectedPayment.psp} for the current transaction status, authorization, and any gateway-level updates.`,
              },
              {
                text: 'Compare with OMS records',
                detail: 'Cross-reference PSP data with the OMS order status for discrepancies.',
              },
              {
                text: 'Resolve detected mismatches',
                detail: 'Apply automated resolution rules for known conflict patterns (e.g. captured in PSP but pending in OMS).',
              },
              {
                text: 'Update reconciliation status',
                detail: 'Mark this payment as "Reconciled" or flag unresolved conflicts for manual review.',
              },
            ]}
            considerations={[
              { text: 'Reconciliation may take a few seconds depending on PSP response times. The status will update automatically once complete.' },
              { text: 'If a conflict is found that cannot be auto-resolved, a manual review task will be created and assigned to your team.' },
              { text: 'Running reconciliation does not modify the payment status in the PSP — it only updates internal records.' },
            ]}
            confirmLabel="Trigger Reconciliation"
          />
        </>
      )}
    </div>
  );
}
