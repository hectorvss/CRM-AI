import React, { useState, useEffect, useMemo } from 'react';
import { Payment, PaymentTab, OrderTimelineEvent, NavigateFn } from '../types';
import CaseCopilotPanel from './CaseCopilotPanel';
import { paymentsApi } from '../api/client';
import { useApi, useMutation } from '../api/hooks';
import LoadingState from './LoadingState';

type RightTab = 'details' | 'copilot';

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

  // Fetch canonical payment contexts from the backend. Static fixtures are not
  // used as runtime data so this view stays aligned with Inbox/Case Graph.
  const { data: apiPayments, loading: paymentsLoading, refetch, error: paymentsError } = useApi(() => paymentsApi.list(), [], []);
  const refundMutation = useMutation<{ id: string; amount?: number; reason: string }, any>(
    ({ id, amount, reason }) => paymentsApi.refund(id, { amount, reason }),
  );

  const mapApiPayment = (p: any): Payment => ({
    id: p.id,
    orderId: p.order_id || 'N/A',
    paymentId: p.external_payment_id || p.id,
    customerName: p.customer_name || 'Unknown',
    amount: `$${Number(p.amount || 0).toFixed(2)}`,
    currency: p.currency || 'USD',
    paymentMethod: p.payment_method || 'Unknown',
    psp: p.psp || 'Unknown',
    date: formatDate(p.created_at),
    lastUpdate: formatRelativeLabel(p.last_update),
    orderStatus: titleCase(p.system_states?.oms || 'Unknown'),
    paymentStatus: titleCase(p.status || 'Unknown'),
    refundStatus: titleCase(p.system_states?.refund || 'N/A'),
    disputeStatus: titleCase(p.system_states?.dispute || 'N/A'),
    reconciliationStatus: titleCase(p.system_states?.reconciliation || 'N/A'),
    approvalStatus: titleCase(p.approval_status || 'N/A'),
    riskLevel: p.risk_level === 'high' ? 'High' : p.risk_level === 'medium' ? 'Medium' : 'Low',
    paymentType: p.payment_type || 'Standard',
    summary: p.summary || '',
    badges: Array.isArray(p.badges) ? p.badges : [],
    tab: p.tab || 'all',
    conflictDetected: p.conflict_detected || '',
    recommendedNextAction: p.recommended_action || '',
    context: p.canonical_context?.case_state?.conflict?.root_cause || p.summary || '',
    systemStates: typeof p.system_states === 'object' && p.system_states ? p.system_states : {
      oms: 'N/A', psp: p.status || 'N/A', refund: 'N/A', dispute: 'N/A', reconciliation: 'N/A', canonical: 'N/A'
    },
    relatedCases: Array.isArray(p.related_cases) ? p.related_cases.map((c: any) => ({
      id: c.case_number || c.id,
      type: c.type || 'Case',
      status: titleCase(c.status || 'open')
    })) : [],
    timeline: (p.events || []).map((e: any, i: number) => ({
      id: e.id || String(i),
      type: e.type || 'system',
      content: e.content,
      time: e.time || e.occurred_at || '-',
      system: e.system || e.source,
    })),
    refundAmount: p.refund_amount ? `$${p.refund_amount}` : undefined,
    refundType: p.refund_type || undefined,
    disputeReference: p.dispute_reference || undefined,
    chargebackAmount: p.chargeback_amount ? `$${p.chargeback_amount}` : undefined,
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
                    <button className="px-4 py-2 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      View in {selectedPayment.psp}
                    </button>
                    <button 
                      onClick={() => handleRefund(selectedPayment)}
                      disabled={refundMutation.loading}
                      className="px-4 py-2 text-sm font-bold text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      {refundMutation.loading ? 'Issuing...' : 'Issue Refund'}
                    </button>
                    <button disabled title="Coming soon" className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg opacity-40 cursor-not-allowed transition-colors">
                      Reconcile
                    </button>
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

                {/* Timeline */}
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Payment Timeline</h3>
                  <div className="space-y-4">
                    {selectedPayment.timeline.map((event, idx) => {
                      const getEventIcon = (content: string) => {
                        const c = content.toLowerCase();
                        if (c.includes('authorized')) return 'lock';
                        if (c.includes('captured')) return 'payments';
                        if (c.includes('refund requested')) return 'undo';
                        if (c.includes('execution started')) return 'play_arrow';
                        if (c.includes('failed')) return 'error';
                        if (c.includes('created')) return 'add_shopping_cart';
                        if (c.includes('transfer initiated')) return 'account_balance';
                        if (c.includes('funds received')) return 'savings';
                        if (c.includes('delivered')) return 'local_shipping';
                        if (c.includes('dispute opened')) return 'gavel';
                        if (c.includes('cancelled')) return 'cancel';
                        if (c.includes('refund triggered')) return 'bolt';
                        if (c.includes('refund succeeded')) return 'check_circle';
                        return 'circle';
                      };

                      return (
                        <div key={event.id} className="flex gap-4 relative">
                          {idx !== selectedPayment.timeline.length - 1 && (
                            <div className="absolute left-[11px] top-6 bottom-[-16px] w-[2px] bg-gray-100 dark:bg-gray-800"></div>
                          )}
                          <div className={`w-6 h-6 rounded-md border-2 border-white dark:border-gray-900 z-10 flex items-center justify-center ${
                            idx === selectedPayment.timeline.length - 1 ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-400'
                          }`}>
                            <span className="material-symbols-outlined text-[14px]">{getEventIcon(event.content)}</span>
                          </div>
                          <div className="flex-1 pb-4">
                            <div className="flex justify-between items-start">
                              <div className="flex flex-col">
                                <p className="text-sm font-medium text-gray-900 dark:text-white">{event.content}</p>
                                <span className="text-[10px] text-gray-400 uppercase tracking-wider">{event.system}</span>
                              </div>
                              <span className="text-xs text-gray-400">{event.time}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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

          {/* Right Pane: Copilot/Details */}
          <div className={`transition-all duration-300 bg-white dark:bg-card-dark flex flex-col overflow-hidden ${isRightSidebarOpen ? 'w-80 lg:w-96 border-l border-gray-100 dark:border-gray-700' : 'w-0 border-none'}`}>
            <div className="flex items-center border-b border-gray-100 dark:border-gray-700 px-2 flex-shrink-0">
              <button
                onClick={() => setRightTab('details')}
                className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
                  rightTab === 'details'
                    ? 'text-gray-900 border-gray-900 font-bold'
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
                <span className="material-symbols-outlined text-lg">smart_toy</span>
                Copilot
              </button>
              <div className="flex items-center gap-1 ml-auto">
                <button 
                  onClick={() => setIsRightSidebarOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-all"
                  title="Hide Sidebar"
                >
                  <span className="material-symbols-outlined text-[20px]">view_sidebar</span>
                </button>
              </div>
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
    </div>
  );
}

