import React, { useState, useEffect } from 'react';
import { Order, OrderTab } from '../types';
import CaseHeader from './CaseHeader';
import { casesApi, ordersApi, paymentsApi } from '../api/client';
import { useApi } from '../api/hooks';
import LoadingState from './LoadingState';
import type { Page } from '../types';

type RightTab = 'details' | 'copilot';
type NavigateFn = (page: Page, focusCaseId?: string | null) => void;

interface OrdersProps {
  onNavigate?: NavigateFn;
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ORDERS: Order[] = [
  {
    id: '1',
    customerName: 'Sarah Jenkins',
    orderId: 'ORD-55210',
    brand: 'Suppy Main Store',
    date: 'Oct 12',
    total: '$129.00',
    currency: 'USD',
    country: 'USA',
    channel: 'Shopify',
  orderStatus: 'Delivered',
    paymentStatus: 'Captured',
    fulfillmentStatus: 'Delivered',
    returnStatus: 'Not returned',
    refundStatus: 'Refund pending',
    approvalStatus: 'No approval needed',
    riskLevel: 'Low',
    orderType: 'Standard',
    summary: 'Refund pending bank clearance',
    lastUpdate: '2m ago',
    badges: ['Delivered', 'Captured', 'Refund Pending'],
    tab: 'refunds',
    conflictDetected: 'PSP says refunded, OMS says pending',
    recommendedNextAction: 'Wait for bank clearance',
    context: 'Customer is inquiring about a refund approved 5 days ago.',
    systemStates: {
      oms: 'Pending Refund',
      psp: 'Settled',
      wms: 'Shipped',
      carrier: 'Delivered',
      canonical: 'Refund Pending'
    },
    relatedCases: [
      { id: 'CAS-88219', type: 'Refund Inquiry', status: 'Open' }
    ],
    timeline: [
      { id: 't1', type: 'system', content: 'Order created', time: 'Oct 12, 08:00 AM' },
      { id: 't2', type: 'system', content: 'Payment captured', time: 'Oct 12, 08:01 AM' },
      { id: 't3', type: 'system', content: 'Warehouse packed order', time: 'Oct 12, 10:15 AM' },
      { id: 't4', type: 'system', content: 'Label created', time: 'Oct 12, 11:30 AM' },
      { id: 't5', type: 'system', content: 'Delivered', time: 'Oct 14, 02:45 PM' },
      { id: 't6', type: 'system', content: 'Refund requested', time: 'Oct 15, 09:00 AM' },
      { id: 't7', type: 'system', content: 'Refund processed in PSP', time: 'Oct 15, 10:00 AM' },
      { id: 't8', type: 'system', content: 'Pending bank clearance', time: 'Oct 15, 10:05 AM' }
    ]
  },
  {
    id: '2',
    customerName: 'Marcus Chen',
    orderId: 'ORD-55211',
    brand: 'Suppy B2B',
    date: 'Oct 13',
    total: '$2,450.00',
    currency: 'USD',
    country: 'USA',
    channel: 'Direct',
    orderStatus: 'Processing',
    paymentStatus: 'Captured',
    fulfillmentStatus: 'Packed',
    returnStatus: 'N/A',
    refundStatus: 'N/A',
    approvalStatus: 'Pending',
    riskLevel: 'Medium',
    orderType: 'B2B',
    summary: 'Cancellation requested after packing',
    lastUpdate: '15m ago',
    badges: ['Packed', 'Captured', 'High Risk', 'Approval Needed'],
    tab: 'attention',
    conflictDetected: 'Customer requested cancellation, but WMS shows packed',
    recommendedNextAction: 'Review warehouse state',
    context: 'Customer wants to cancel but order is already in packing stage.',
    systemStates: {
      oms: 'Processing',
      psp: 'Captured',
      wms: 'Packed',
      carrier: 'N/A',
      canonical: 'Cancellation Requested'
    },
    relatedCases: [
      { id: 'CAS-88220', type: 'Cancellation request', status: 'Open' }
    ],
    timeline: [
      { id: 't1', type: 'system', content: 'Order created', time: 'Oct 13, 09:00 AM' },
      { id: 't2', type: 'system', content: 'Payment captured', time: 'Oct 13, 09:05 AM' },
      { id: 't3', type: 'system', content: 'Warehouse packed order', time: 'Oct 13, 11:00 AM' },
      { id: 't4', type: 'system', content: 'Cancellation requested', time: 'Oct 13, 11:15 AM' }
    ]
  },
  {
    id: '3',
    customerName: 'Elena Rodriguez',
    orderId: 'ORD-55213',
    brand: 'Suppy Main Store',
    date: 'Oct 11',
    total: '$89.50',
    currency: 'USD',
    country: 'USA',
    channel: 'Shopify',
    orderStatus: 'Delivered',
    paymentStatus: 'Captured',
    fulfillmentStatus: 'Delivered',
    returnStatus: 'Return received',
    refundStatus: 'Not issued',
    approvalStatus: 'Waiting Info',
    riskLevel: 'Medium',
    orderType: 'Standard',
    summary: 'Return received, refund not issued',
    lastUpdate: '3h ago',
    badges: ['Delivered', 'Return', 'Conflict'],
    tab: 'conflicts',
    conflictDetected: 'Return received at warehouse, refund not yet issued',
    recommendedNextAction: 'Check mismatch between systems',
    context: 'Customer received a damaged product and wants a replacement or refund.',
    systemStates: {
      oms: 'Delivered',
      psp: 'Captured',
      wms: 'Return Received',
      carrier: 'Delivered',
      canonical: 'Return Pending Action'
    },
    relatedCases: [
      { id: 'CAS-88222', type: 'Return follow-up', status: 'Open' }
    ],
    timeline: [
      { id: 't1', type: 'system', content: 'Order created', time: 'Oct 11, 10:00 AM' },
      { id: 't2', type: 'system', content: 'Payment captured', time: 'Oct 11, 10:05 AM' },
      { id: 't3', type: 'system', content: 'Delivered', time: 'Oct 13, 04:00 PM' },
      { id: 't4', type: 'system', content: 'Refund requested', time: 'Oct 14, 08:00 AM' },
      { id: 't5', type: 'system', content: 'Return received', time: 'Oct 16, 11:00 AM' }
    ]
  },
  {
    id: '4',
    customerName: 'James Wilson',
    orderId: 'ORD-55214',
    brand: 'Suppy Main Store',
    date: 'Oct 14',
    total: '$54.00',
    currency: 'USD',
    country: 'USA',
    channel: 'Web',
    orderStatus: 'Pending',
    paymentStatus: 'Failed',
    fulfillmentStatus: 'Pending',
    returnStatus: 'N/A',
    refundStatus: 'N/A',
    approvalStatus: 'N/A',
    riskLevel: 'High',
    orderType: 'Standard',
    summary: 'Payment captured, fulfillment blocked',
    lastUpdate: '5m ago',
    badges: ['High Risk', 'Conflict'],
    tab: 'conflicts',
    conflictDetected: 'Checkout failed, but customer claims deduction',
    recommendedNextAction: 'Verify PSP transaction log',
    context: 'Customer reports payment failure at checkout but bank shows deduction.',
    systemStates: {
      oms: 'Pending',
      psp: 'Failed',
      wms: 'N/A',
      carrier: 'N/A',
      canonical: 'Payment Discrepancy'
    },
    relatedCases: [
      { id: 'CAS-88223', type: 'Payment Issue', status: 'Open' }
    ],
    timeline: [
      { id: 't1', type: 'system', content: 'Order attempt created', time: 'Oct 14, 11:10 AM' },
      { id: 't2', type: 'system', content: 'Payment failed in checkout', time: 'Oct 14, 11:11 AM' }
    ]
  },
  {
    id: '5',
    customerName: 'Linda Thompson',
    orderId: 'ORD-55215',
    brand: 'Suppy Main Store',
    date: 'Oct 10',
    total: '$210.00',
    currency: 'USD',
    country: 'USA',
    channel: 'Shopify',
    orderStatus: 'Delivered',
    paymentStatus: 'Captured',
    fulfillmentStatus: 'Delivered',
    returnStatus: 'Not returned',
    refundStatus: 'N/A',
    approvalStatus: 'N/A',
    riskLevel: 'Low',
    orderType: 'Standard',
    summary: 'Delivered, refund requested',
    lastUpdate: '1h ago',
    badges: ['Delivered', 'Captured'],
    tab: 'refunds',
    conflictDetected: '',
    recommendedNextAction: 'Send refund clarification',
    context: 'Customer claims item was damaged upon arrival.',
    systemStates: {
      oms: 'Delivered',
      psp: 'Captured',
      wms: 'Shipped',
      carrier: 'Delivered',
      canonical: 'Delivered'
    },
    relatedCases: [
      { id: 'CAS-88224', type: 'Refund Inquiry', status: 'Open' }
    ],
    timeline: [
      { id: 't1', type: 'system', content: 'Order created', time: 'Oct 10, 02:00 PM' },
      { id: 't2', type: 'system', content: 'Payment captured', time: 'Oct 10, 02:05 PM' },
      { id: 't3', type: 'system', content: 'Delivered', time: 'Oct 12, 11:00 AM' },
      { id: 't4', type: 'system', content: 'Refund requested', time: 'Oct 14, 09:00 AM' }
    ]
  },
  {
    id: '6',
    customerName: 'Robert Davis',
    orderId: 'ORD-55216',
    brand: 'Suppy Main Store',
    date: 'Oct 15',
    total: '$45.00',
    currency: 'USD',
    country: 'USA',
    channel: 'Shopify',
    orderStatus: 'Delivered',
    paymentStatus: 'Captured',
    fulfillmentStatus: 'Delivered',
    returnStatus: 'Not returned',
    refundStatus: 'N/A',
    approvalStatus: 'N/A',
    riskLevel: 'Low',
    orderType: 'Standard',
    summary: 'Order delivered successfully',
    lastUpdate: '4h ago',
    badges: ['Delivered', 'Captured'],
    tab: 'all',
    conflictDetected: '',
    recommendedNextAction: '',
    context: '',
    systemStates: {
      oms: 'Delivered',
      psp: 'Captured',
      wms: 'Shipped',
      carrier: 'Delivered',
      canonical: 'Delivered'
    },
    relatedCases: [],
    timeline: [
      { id: 't1', type: 'system', content: 'Order created', time: 'Oct 15, 08:00 AM' },
      { id: 't2', type: 'system', content: 'Payment captured', time: 'Oct 15, 08:05 AM' },
      { id: 't3', type: 'system', content: 'Delivered', time: 'Oct 16, 02:00 PM' }
    ]
  },
  {
    id: '7',
    customerName: 'Sophie Martin',
    orderId: 'ORD-55217',
    brand: 'Suppy Main Store',
    date: 'Oct 16',
    total: '$112.00',
    currency: 'USD',
    country: 'France',
    channel: 'Web',
    orderStatus: 'Processing',
    paymentStatus: 'Captured',
    fulfillmentStatus: 'Processing',
    returnStatus: 'N/A',
    refundStatus: 'N/A',
    approvalStatus: 'N/A',
    riskLevel: 'Low',
    orderType: 'Standard',
    summary: 'Order processing normally',
    lastUpdate: '1h ago',
    badges: ['Processing', 'Captured'],
    tab: 'all',
    conflictDetected: '',
    recommendedNextAction: '',
    context: '',
    systemStates: {
      oms: 'Processing',
      psp: 'Captured',
      wms: 'Pending',
      carrier: 'N/A',
      canonical: 'Processing'
    },
    relatedCases: [],
    timeline: [
      { id: 't1', type: 'system', content: 'Order created', time: 'Oct 16, 10:00 AM' },
      { id: 't2', type: 'system', content: 'Payment captured', time: 'Oct 16, 10:05 AM' }
    ]
  }
];

export default function Orders({ onNavigate }: OrdersProps) {
  const [rightTab, setRightTab] = useState<RightTab>('copilot');
  const [activeTab, setActiveTab] = useState<OrderTab>('all');
  const [selectedId, setSelectedId] = useState<string>('1');
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Load orders from API, fall back to static data on error
  const { data: apiOrders, loading, error: ordersError } = useApi(
    () => ordersApi.list(activeTab !== 'all' ? { tab: activeTab } : {}),
    [activeTab],
    []
  );

  // Map API data shape to component shape
  const mapApiOrder = (o: any): Order => ({
    id: o.id,
    customerName: o.customer_name || o.external_order_id || 'Unknown',
    orderId: o.external_order_id,
    brand: o.brand || 'Acme Store',
    date: formatDate(o.order_date),
    total: `$${Number(o.total_amount || 0).toFixed(2)}`,
    currency: o.currency || 'USD',
    country: o.country || 'US',
    channel: o.canonical_context?.case_state?.channel_context?.channel || o.brand || 'Shopify',
    orderStatus: titleCase(o.status || o.system_states?.oms || 'Unknown'),
    paymentStatus: o.system_states?.psp || 'Unknown',
    fulfillmentStatus: o.system_states?.wms || 'N/A',
    returnStatus: titleCase(o.system_states?.returns_platform || 'N/A'),
    refundStatus: titleCase(o.system_states?.refund_status || 'N/A'),
    approvalStatus: titleCase(o.approval_status || 'N/A'),
    riskLevel: o.risk_level === 'high' ? 'High' : o.risk_level === 'medium' ? 'Medium' : 'Low',
    orderType: o.order_type || 'Standard',
    summary: o.summary || '',
    lastUpdate: formatRelativeLabel(o.last_update),
    badges: Array.isArray(o.badges) ? o.badges : [],
    tab: o.tab || 'all',
    conflictDetected: o.conflict_detected || '',
    recommendedNextAction: o.recommended_action || '',
    context: o.canonical_context?.case_state?.conflict?.root_cause || o.summary || '',
    systemStates: typeof o.system_states === 'object' && o.system_states ? o.system_states : {
      oms: 'Unknown', psp: 'Unknown', wms: 'Unknown', carrier: 'Unknown', canonical: 'Unknown'
    },
    canonicalContext: o.canonical_context || o.canonicalContext || null,
    canonical_context: o.canonical_context || o.canonicalContext || null,
    relatedCases: Array.isArray(o.related_cases) ? o.related_cases.map((c: any) => ({
      id: c.case_number || c.id,
      type: c.type || 'Case',
      status: titleCase(c.status || 'open')
    })) : [],
    timeline: (o.events || []).map((e: any, i: number) => ({
      id: e.id || String(i),
      type: e.type || 'system',
      content: e.content,
      time: e.time || e.occurred_at || '-',
      system: e.system || e.source,
    }))
  });

  const orders = Array.isArray(apiOrders) ? apiOrders.map(mapApiOrder) : [];

  if (loading && orders.length === 0) {
    return (
      <LoadingState
        title="Loading orders"
        message="Fetching canonical commerce data from Supabase."
      />
    );
  }

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

  const selectedOrder = filteredOrders.find(o => o.id === selectedId) || filteredOrders[0];

  useEffect(() => {
    if (filteredOrders.length > 0 && !filteredOrders.find(o => o.id === selectedId)) {
      setSelectedId(filteredOrders[0].id);
    }
  }, [activeTab, filteredOrders, selectedId]);

  const selectedOrderCaseId = selectedOrder?.relatedCases?.[0]?.id || null;
  const selectedOrderPaymentId =
    (selectedOrder as any)?.canonicalContext?.case_state?.identifiers?.payment_ids?.[0]
    || (selectedOrder as any)?.canonical_context?.case_state?.identifiers?.payment_ids?.[0]
    || (selectedOrder as any)?.canonicalContext?.identifiers?.payment_ids?.[0]
    || (selectedOrder as any)?.canonical_context?.identifiers?.payment_ids?.[0]
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
            <button className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              <span className="material-symbols-outlined">filter_list</span>
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
            {selectedOrder && (
              <div className="p-8 w-full space-y-8">
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
                  recommendedAction={selectedOrder.recommendedNextAction || 'No action needed'}
                  conflictDetected={selectedOrder.conflictDetected}
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

                {/* Timeline */}
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Order Timeline</h3>
                  <div className="space-y-4">
                    {selectedOrder.timeline.map((event, idx) => {
                      const getEventIcon = (content: string) => {
                        const c = content.toLowerCase();
                        if (c.includes('created')) return 'add_shopping_cart';
                        if (c.includes('payment captured')) return 'payments';
                        if (c.includes('payment failed')) return 'error';
                        if (c.includes('packed')) return 'inventory_2';
                        if (c.includes('label created')) return 'label';
                        if (c.includes('delivered')) return 'local_shipping';
                        if (c.includes('refund requested')) return 'undo';
                        if (c.includes('refund processed')) return 'account_balance_wallet';
                        if (c.includes('pending bank')) return 'hourglass_empty';
                        if (c.includes('cancellation')) return 'cancel';
                        if (c.includes('return received')) return 'warehouse';
                        return 'circle';
                      };

                      return (
                        <div key={event.id} className="flex gap-4 relative">
                          {idx !== selectedOrder.timeline.length - 1 && (
                            <div className="absolute left-[11px] top-6 bottom-[-16px] w-[2px] bg-gray-100 dark:bg-gray-800"></div>
                          )}
                          <div className={`w-6 h-6 rounded-full border-2 border-white dark:border-gray-900 z-10 flex items-center justify-center ${
                            idx === selectedOrder.timeline.length - 1 ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-400'
                          }`}>
                            <span className="material-symbols-outlined text-[14px]">{getEventIcon(event.content)}</span>
                          </div>
                          <div className="flex-1 pb-4">
                            <div className="flex justify-between items-start">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{event.content}</p>
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
                <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
                  <span className="material-symbols-outlined text-[20px]">settings</span>
                </button>
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
              {rightTab === 'copilot' ? (
                <div className="p-4 flex flex-col gap-4">
                  {/* Copilot Case Summary */}
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-white flex-shrink-0 mt-0.5">
                      <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                    </div>
                    <div className="flex flex-col gap-2 max-w-[85%] w-full">
                      <div className="bg-purple-50 dark:bg-purple-900/20 text-gray-800 dark:text-gray-200 text-sm py-2.5 px-3.5 rounded-2xl rounded-tl-sm border border-purple-100 dark:border-purple-800/30">
                        <h4 className="font-bold text-xs uppercase tracking-wider text-secondary mb-2">Order Summary</h4>
                        <p className="leading-relaxed mb-3">Order {selectedOrder.orderId} for {selectedOrder.customerName} is currently {selectedOrder.orderStatus}. The total amount is {selectedOrder.total}.</p>
                        
                        <h4 className="font-bold text-xs uppercase tracking-wider text-secondary mb-2">Conflict Detection</h4>
                        <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-100 dark:border-red-800/30 text-xs text-red-700 dark:text-red-400 mb-3">
                          No major conflicts detected for this order.
                        </div>

                        <h4 className="font-bold text-xs uppercase tracking-wider text-secondary mb-2">Recommended Action</h4>
                        <p className="text-xs bg-white/50 dark:bg-black/20 p-2 rounded border border-purple-100 dark:border-purple-800/30 italic">
                          {selectedOrder.recommendedNextAction || "Monitor fulfillment status and ensure carrier tracking is updated."}
                        </p>
                      </div>
                      
                      <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                        <h4 className="font-bold text-xs uppercase tracking-wider text-gray-500 mb-2">Suggested Reply</h4>
                        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed italic mb-3">
                          "Hi {selectedOrder.customerName.split(' ')[0]}, I'm checking the status of your order {selectedOrder.orderId}. It's currently {selectedOrder.orderStatus} and we're working to get it to you as soon as possible."
                        </p>
                        <button onClick={handleApplyToComposer} className="w-full py-1.5 bg-secondary text-white text-xs font-bold rounded-lg hover:opacity-90 transition-opacity">
                          Apply to Composer
                        </button>
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                          <span className="material-symbols-outlined text-lg text-gray-600">do_not_disturb_on</span>
                          Order Actions
                        </h3>
                        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Persistent</span>
                      </div>
                      <div className="space-y-2">
                        <button
                          onClick={() => handleCancelOrder(selectedOrder.id)}
                          className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-800/30 transition-colors"
                        >
                          <span className="flex items-center gap-2"><span className="material-symbols-outlined text-[18px]">cancel</span> Cancel Order</span>
                          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                        </button>
                        <button
                          onClick={handleStartRefund}
                          className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-100 dark:border-red-800/30 transition-colors hover:bg-red-100 dark:hover:bg-red-900/20"
                        >
                          <span className="flex items-center gap-2"><span className="material-symbols-outlined text-[18px]">currency_exchange</span> Start Refund</span>
                          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
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

            {/* Copilot Input Area */}
            <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-card-dark">
              <div className="relative bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center p-2 focus-within:ring-2 focus-within:ring-secondary/20 focus-within:border-secondary transition-all shadow-card">
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
