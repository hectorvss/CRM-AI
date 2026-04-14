import React, { useState, useEffect, useMemo } from 'react';
import { Return, ReturnTab, OrderTimelineEvent } from '../types';
import CaseHeader from './CaseHeader';
import { returnsApi } from '../api/client';
import { useApi } from '../api/hooks';

type RightTab = 'details' | 'copilot';

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

const RETURNS: Return[] = [
  {
    id: '1',
    orderId: 'ORD-55210',
    returnId: 'RET-20491',
    customerName: 'Sarah Jenkins',
    brand: 'Supply Main Store',
    date: 'Oct 12',
    total: '$129.00',
    currency: 'USD',
    country: 'USA',
    returnType: 'Standard',
    returnReason: 'Wrong size',
    returnValue: '$129.00',
    riskLevel: 'Low',
    orderStatus: 'Delivered',
    returnStatus: 'Return received',
    inspectionStatus: 'Awaiting inspection',
    refundStatus: 'Refund pending',
    approvalStatus: 'No approval yet',
    carrierStatus: 'Carrier delivered',
    summary: 'Return received, refund pending',
    lastUpdate: '2m ago',
    badges: ['Received', 'Refund Pending'],
    tab: 'refund_pending',
    conflictDetected: 'Return received in WMS but refund not yet triggered',
    recommendedNextAction: 'Review return condition',
    context: 'Customer received the item but it was too small. Return was received today.',
    method: 'Carrier return',
    systemStates: {
      oms: 'Delivered',
      returnsPlatform: 'Received',
      wms: 'Received',
      carrier: 'Delivered',
      psp: 'Captured',
      canonical: 'Return Received'
    },
    relatedCases: [
      { id: 'CAS-88219', type: 'Refund Inquiry', status: 'Open' }
    ],
    timeline: [
      { id: 't1', type: 'system', content: 'Return requested', time: 'Oct 12, 09:00 AM' },
      { id: 't2', type: 'system', content: 'Return policy checked', time: 'Oct 12, 09:05 AM' },
      { id: 't3', type: 'system', content: 'Return approved', time: 'Oct 12, 09:10 AM' },
      { id: 't4', type: 'system', content: 'Return label created', time: 'Oct 12, 10:00 AM' },
      { id: 't5', type: 'system', content: 'Parcel dropped off', time: 'Oct 13, 02:00 PM' },
      { id: 't6', type: 'system', content: 'Parcel in transit', time: 'Oct 14, 08:00 AM' },
      { id: 't7', type: 'system', content: 'Parcel received by warehouse', time: 'Oct 16, 11:00 AM' }
    ]
  },
  {
    id: '2',
    orderId: 'ORD-55211',
    returnId: 'RET-20492',
    customerName: 'Marcus Chen',
    brand: 'Supply B2B',
    date: 'Oct 13',
    total: '$2,450.00',
    currency: 'USD',
    country: 'USA',
    returnType: 'B2B Return',
    returnReason: 'Damaged item',
    returnValue: '$450.00',
    riskLevel: 'Medium',
    orderStatus: 'Delivered',
    returnStatus: 'Pending review',
    inspectionStatus: 'N/A',
    refundStatus: 'N/A',
    approvalStatus: 'Pending',
    carrierStatus: 'N/A',
    summary: 'Return requested, waiting review',
    lastUpdate: '15m ago',
    badges: ['Return Request', 'Approval Needed', 'High Risk'],
    tab: 'pending_review',
    conflictDetected: 'High value return request for damaged item',
    recommendedNextAction: 'Request manual inspection',
    context: 'Customer claims 5 units arrived damaged. High value return.',
    method: 'Self-ship',
    systemStates: {
      oms: 'Delivered',
      returnsPlatform: 'Pending Review',
      wms: 'N/A',
      carrier: 'N/A',
      psp: 'Captured',
      canonical: 'Return Requested'
    },
    relatedCases: [
      { id: 'CAS-88220', type: 'Damaged item dispute', status: 'Open' }
    ],
    timeline: [
      { id: 't1', type: 'system', content: 'Return requested', time: 'Oct 13, 11:00 AM' },
      { id: 't2', type: 'system', content: 'Return policy checked', time: 'Oct 13, 11:05 AM' }
    ]
  },
  {
    id: '3',
    orderId: 'ORD-55213',
    returnId: 'RET-20493',
    customerName: 'Elena Rodriguez',
    brand: 'Supply Main Store',
    date: 'Oct 11',
    total: '$89.50',
    currency: 'USD',
    country: 'USA',
    returnType: 'Standard',
    returnReason: 'Wrong size',
    returnValue: '$89.50',
    riskLevel: 'Low',
    orderStatus: 'Delivered',
    returnStatus: 'In transit',
    inspectionStatus: 'N/A',
    refundStatus: 'N/A',
    approvalStatus: 'Approved',
    carrierStatus: 'In transit',
    summary: 'Return label created, in transit',
    lastUpdate: '3h ago',
    badges: ['In Transit'],
    tab: 'in_transit',
    conflictDetected: 'Return label created but no carrier update received',
    recommendedNextAction: 'Wait for carrier update',
    context: 'Label was generated 2 days ago but carrier hasn\'t scanned it yet.',
    method: 'Carrier return',
    systemStates: {
      oms: 'Delivered',
      returnsPlatform: 'Label Created',
      wms: 'N/A',
      carrier: 'Label Created',
      psp: 'Captured',
      canonical: 'Return In Transit'
    },
    relatedCases: [],
    timeline: [
      { id: 't1', type: 'system', content: 'Return requested', time: 'Oct 11, 10:00 AM' },
      { id: 't2', type: 'system', content: 'Return approved', time: 'Oct 11, 10:10 AM' },
      { id: 't3', type: 'system', content: 'Return label created', time: 'Oct 11, 11:00 AM' }
    ]
  },
  {
    id: '4',
    orderId: 'ORD-55214',
    returnId: 'RET-20494',
    customerName: 'James Wilson',
    brand: 'Supply Main Store',
    date: 'Oct 14',
    total: '$54.00',
    currency: 'USD',
    country: 'USA',
    returnType: 'Standard',
    returnReason: 'Policy exception',
    returnValue: '$54.00',
    riskLevel: 'High',
    orderStatus: 'Delivered',
    returnStatus: 'Blocked',
    inspectionStatus: 'N/A',
    refundStatus: 'N/A',
    approvalStatus: 'Rejected',
    carrierStatus: 'N/A',
    summary: 'Return blocked by policy mismatch',
    lastUpdate: '5m ago',
    badges: ['Blocked', 'Conflict', 'High Risk'],
    tab: 'blocked',
    conflictDetected: 'Return requested outside of 30-day window',
    recommendedNextAction: 'Resolve OMS / WMS mismatch',
    context: 'Customer is trying to return an item from 45 days ago.',
    method: 'Carrier return',
    systemStates: {
      oms: 'Delivered',
      returnsPlatform: 'Blocked',
      wms: 'N/A',
      carrier: 'N/A',
      psp: 'Captured',
      canonical: 'Return Blocked'
    },
    relatedCases: [
      { id: 'CAS-88223', type: 'Return policy exception', status: 'Open' }
    ],
    timeline: [
      { id: 't1', type: 'system', content: 'Return requested', time: 'Oct 14, 11:10 AM' },
      { id: 't2', type: 'system', content: 'Return policy checked', time: 'Oct 14, 11:11 AM' },
      { id: 't3', type: 'system', content: 'Return blocked', time: 'Oct 14, 11:12 AM' }
    ]
  },
  {
    id: '5',
    orderId: 'ORD-55215',
    returnId: 'RET-20495',
    customerName: 'Linda Thompson',
    brand: 'Supply Main Store',
    date: 'Oct 10',
    total: '$210.00',
    currency: 'USD',
    country: 'USA',
    returnType: 'Standard',
    returnReason: 'Wrong size',
    returnValue: '$210.00',
    riskLevel: 'Low',
    orderStatus: 'Delivered',
    returnStatus: 'Received',
    inspectionStatus: 'Inspected',
    refundStatus: 'Refund pending',
    approvalStatus: 'Approval needed',
    carrierStatus: 'Delivered',
    summary: 'Return inspected, refund approval needed',
    lastUpdate: '1h ago',
    badges: ['Received', 'Inspection', 'Approval Needed'],
    tab: 'refund_pending',
    conflictDetected: 'Item inspection flagged damage discrepancy',
    recommendedNextAction: 'Trigger refund',
    context: 'Item was received with minor damage not reported by customer.',
    method: 'Carrier return',
    systemStates: {
      oms: 'Delivered',
      returnsPlatform: 'Inspected',
      wms: 'Received',
      carrier: 'Delivered',
      psp: 'Captured',
      canonical: 'Awaiting Refund Approval'
    },
    relatedCases: [
      { id: 'CAS-88224', type: 'Refund approval request', status: 'Open' }
    ],
    timeline: [
      { id: 't1', type: 'system', content: 'Return requested', time: 'Oct 10, 02:00 PM' },
      { id: 't2', type: 'system', content: 'Return approved', time: 'Oct 10, 02:10 PM' },
      { id: 't3', type: 'system', content: 'Parcel received by warehouse', time: 'Oct 12, 11:00 AM' },
      { id: 't4', type: 'system', content: 'Inspection completed', time: 'Oct 14, 09:00 AM' },
      { id: 't5', type: 'system', content: 'Approval requested', time: 'Oct 14, 09:05 AM' }
    ]
  }
];

export default function Returns() {
  const [rightTab, setRightTab] = useState<RightTab>('copilot');
  const [activeTab, setActiveTab] = useState<ReturnTab>('all');
  const [selectedId, setSelectedId] = useState<string>('1');
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);

  // Fetch canonical return contexts from the backend. Static fixtures are not
  // used as runtime data so this view stays aligned with Inbox/Case Graph.
  const { data: apiReturns } = useApi(() => returnsApi.list(), [], []);

  const mapApiReturn = (r: any): Return => ({
    id: r.id,
    orderId: r.order_id || 'N/A',
    returnId: r.external_return_id || r.id,
    customerName: r.customer_name || 'Unknown',
    brand: r.brand || 'N/A',
    date: formatDate(r.created_at),
    total: `$${Number(r.return_value || 0).toFixed(2)}`,
    currency: r.currency || 'USD',
    country: r.country || 'N/A',
    returnType: r.type || 'Standard',
    returnReason: r.return_reason || 'N/A',
    returnValue: `$${Number(r.return_value || 0).toFixed(2)}`,
    riskLevel: r.risk_level === 'high' ? 'High' : r.risk_level === 'medium' ? 'Medium' : 'Low',
    orderStatus: titleCase(r.system_states?.oms || 'N/A'),
    returnStatus: titleCase(r.status || 'Unknown'),
    inspectionStatus: titleCase(r.inspection_status || 'N/A'),
    refundStatus: titleCase(r.refund_status || 'N/A'),
    approvalStatus: titleCase(r.approval_status || 'N/A'),
    carrierStatus: titleCase(r.carrier_status || r.system_states?.carrier || 'N/A'),
    summary: r.summary || '',
    lastUpdate: formatRelativeLabel(r.last_update),
    badges: Array.isArray(r.badges) ? r.badges : [],
    tab: r.tab || 'all',
    conflictDetected: r.conflict_detected || '',
    recommendedNextAction: r.recommended_action || '',
    context: r.canonical_context?.case_state?.conflict?.root_cause || r.summary || '',
    method: r.method || 'N/A',
    systemStates: typeof r.system_states === 'object' && r.system_states ? {
      oms: r.system_states.oms || 'N/A',
      returnsPlatform: r.system_states.returns_platform || 'N/A',
      wms: r.system_states.wms || 'N/A',
      carrier: r.system_states.carrier || 'N/A',
      psp: r.system_states.psp || 'N/A',
      canonical: r.system_states.canonical || 'N/A',
    } : { oms: 'N/A', returnsPlatform: 'N/A', wms: 'N/A', carrier: 'N/A', psp: 'N/A', canonical: 'N/A' },
    relatedCases: Array.isArray(r.related_cases) ? r.related_cases.map((c: any) => ({
      id: c.case_number || c.id,
      type: c.type || 'Case',
      status: titleCase(c.status || 'open')
    })) : [],
    timeline: (r.events || []).map((e: any, i: number) => ({
      id: e.id || String(i),
      type: e.type || 'system',
      content: e.content,
      time: e.time || e.occurred_at || '-',
      system: e.system || e.source,
    })),
  });

  const returns = useMemo(
    () => (apiReturns && apiReturns.length > 0) ? apiReturns.map(mapApiReturn) : [],
    [apiReturns],
  );

  const filteredReturns = useMemo(() => returns.filter(r => {
    if (activeTab === 'all') return true;
    return r.tab === activeTab;
  }), [activeTab, returns]);

  const selectedReturn = filteredReturns.find(r => r.id === selectedId) || filteredReturns[0] || null;

  useEffect(() => {
    if (filteredReturns.length === 0) {
      if (selectedId) setSelectedId('');
      return;
    }
    if (!filteredReturns.find(r => r.id === selectedId)) {
      setSelectedId(filteredReturns[0].id);
    }
  }, [activeTab, filteredReturns, selectedId]);

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
            <button className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              <span className="material-symbols-outlined">filter_list</span>
            </button>
          </div>
        </div>

        {/* Main Content Area: Three Panes */}
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
            {selectedReturn ? (
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
                  recommendedAction={selectedReturn.recommendedNextAction || 'No action needed'}
                  conflictDetected={selectedReturn.conflictDetected}
                />

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

                {/* Timeline */}
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Return Timeline</h3>
                  <div className="space-y-4">
                    {selectedReturn.timeline.map((event, idx) => {
                      const getEventIcon = (content: string) => {
                        const c = content.toLowerCase();
                        if (c.includes('requested')) return 'assignment_return';
                        if (c.includes('policy')) return 'verified';
                        if (c.includes('approved')) return 'check_circle';
                        if (c.includes('label created')) return 'label';
                        if (c.includes('dropped off')) return 'local_shipping';
                        if (c.includes('in transit')) return 'pending_actions';
                        if (c.includes('received')) return 'warehouse';
                        if (c.includes('blocked')) return 'block';
                        if (c.includes('inspection')) return 'fact_check';
                        if (c.includes('approval')) return 'approval';
                        return 'circle';
                      };

                      return (
                        <div key={event.id} className="flex gap-4 relative">
                          {idx !== selectedReturn.timeline.length - 1 && (
                            <div className="absolute left-[11px] top-6 bottom-[-16px] w-[2px] bg-gray-100 dark:bg-gray-800"></div>
                          )}
                          <div className={`w-6 h-6 rounded-md border-2 border-white dark:border-gray-900 z-10 flex items-center justify-center ${
                            idx === selectedReturn.timeline.length - 1 ? 'bg-secondary text-white' : 'bg-gray-100 text-gray-400'
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
              {!selectedReturn ? (
                <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
                  Copilot is disabled until a return is selected.
                </div>
              ) : rightTab === 'copilot' ? (
                <div className="p-4 flex flex-col gap-4">
                  {/* Copilot Case Summary */}
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center text-white flex-shrink-0 mt-0.5">
                      <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                    </div>
                    <div className="flex flex-col gap-2 max-w-[85%] w-full">
                      <div className="bg-purple-50 dark:bg-purple-900/20 text-gray-800 dark:text-gray-200 text-sm py-2.5 px-3.5 rounded-2xl rounded-tl-sm border border-purple-100 dark:border-purple-800/30">
                        <h4 className="font-bold text-xs uppercase tracking-wider text-secondary mb-2">Return Summary</h4>
                        <p className="leading-relaxed mb-3">Return {selectedReturn.returnId} for {selectedReturn.customerName} is currently {selectedReturn.returnStatus}. The refund amount is {selectedReturn.total}.</p>
                        
                        <h4 className="font-bold text-xs uppercase tracking-wider text-secondary mb-2">Conflict Detection</h4>
                        <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-100 dark:border-red-800/30 text-xs text-red-700 dark:text-red-400 mb-3">
                          {selectedReturn.returnStatus === 'Delayed' ? 'Return received but refund not triggered in OMS.' : 'No major conflicts detected.'}
                        </div>

                        <h4 className="font-bold text-xs uppercase tracking-wider text-secondary mb-2">Recommended Action</h4>
                        <p className="text-xs bg-white/50 dark:bg-blue-600/20 p-2 rounded border border-purple-100 dark:border-purple-800/30 italic">
                          {selectedReturn.recommendedNextAction || "Monitor return transit status."}
                        </p>
                      </div>
                      
                      <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                        <h4 className="font-bold text-xs uppercase tracking-wider text-gray-500 mb-2">Suggested Reply</h4>
                        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed italic mb-3">
                          "Hi {selectedReturn.customerName.split(' ')[0]}, I'm monitoring your return {selectedReturn.returnId}. It's currently {selectedReturn.returnStatus} and I'll update you as soon as the refund is processed."
                        </p>
                        <button className="w-full py-1.5 bg-secondary text-white text-xs font-bold rounded-lg hover:opacity-90 transition-opacity">
                          Apply to Composer
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

            {/* Copilot Input Area */}
            <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-card-dark">
              <div className="relative bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center p-2 focus-within:ring-2 focus-within:ring-secondary/20 focus-within:border-secondary transition-all shadow-card">
                <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"><span className="material-symbols-outlined text-[20px]">auto_awesome</span></button>
                <input disabled={!selectedReturn} className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-gray-800 dark:text-gray-200 px-2 h-9 disabled:cursor-not-allowed" placeholder={selectedReturn ? 'Ask a question...' : 'Select a return first'} type="text" />
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
