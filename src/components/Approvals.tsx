import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import CaseHeader from './CaseHeader';
import { approvalsApi } from '../api/client';
import { useApi, useMutation } from '../api/hooks';
import LoadingState from './LoadingState';

type ApprovalStatus = 'pending' | 'approved' | 'rejected';

interface ApprovalItem {
  id: string;
  type: string;
  amount?: string;
  customerName: string;
  company?: string;
  team: string;
  status: ApprovalStatus;
  priority?: 'high' | 'normal';
  sla?: string;
  timeAgo: string;
  description: string;
  aiRecommendation?: string;
  aiConfidence?: number;
  aiAction?: 'approve' | 'reject' | 'review';
  initials: string;
  tags: string[];
  approvedBy?: string;
  rejectedReason?: string;
  executionStatus?: string;
  avatarColor?: string;
}

const mockApprovals: ApprovalItem[] = [
  // Pending Items
  {
    id: '9281',
    type: 'Refund',
    amount: '$499',
    customerName: 'Sarah Jenkins',
    company: 'Acme Corp',
    team: 'Billing Team',
    status: 'pending',
    priority: 'high',
    sla: '18m',
    timeAgo: '12m ago',
    description: 'Customer requested a full refund for an accidental renewal. No product usage detected in the current billing cycle.',
    aiRecommendation: 'Reject or partial',
    aiConfidence: 92,
    aiAction: 'reject',
    initials: 'SJ',
    tags: ['High Priority', 'SLA 18m'],
    avatarColor: 'blue'
  },
  {
    id: '9282',
    type: 'Cancel Subscription',
    customerName: 'Mike Rossi',
    team: 'Retention',
    status: 'pending',
    priority: 'normal',
    sla: '45m',
    timeAgo: '45m ago',
    description: 'Pro Plan cancellation request. Customer cited budget constraints. AI suggests a 20% discount offer instead.',
    aiRecommendation: 'Approve',
    aiConfidence: 98,
    aiAction: 'approve',
    initials: 'MR',
    tags: ['Pro Plan'],
    avatarColor: 'blue'
  },
  {
    id: '9283',
    type: 'Data Export (GDPR)',
    customerName: 'Elena V.',
    team: 'Legal',
    status: 'pending',
    priority: 'normal',
    sla: '1h',
    timeAgo: '1h ago',
    description: 'Standard GDPR data portability request. Identity verified via secondary factor. Ready for automated export.',
    aiRecommendation: 'Approve',
    aiConfidence: 99,
    aiAction: 'approve',
    initials: 'EV',
    tags: ['Compliance'],
    avatarColor: 'blue'
  },
  // Approved Items
  {
    id: 'a1',
    type: 'Subscription Upgrade',
    customerName: 'Robert Smith',
    company: 'Digital Arts',
    team: 'Growth Plan',
    status: 'approved',
    timeAgo: '2h ago',
    description: 'Upgrade from Starter to Growth plan. Payment method verified and first installment processed.',
    initials: 'RS',
    tags: ['Growth Plan'],
    approvedBy: 'Approved by AI',
    executionStatus: 'Executed Successfully',
    avatarColor: 'green'
  },
  {
    id: 'a2',
    type: 'Refund',
    amount: '$85.00',
    customerName: 'Karen Lee',
    team: 'Billing',
    status: 'approved',
    timeAgo: '4h ago',
    description: 'Partial refund for service downtime. Amount calculated based on 24h outage period.',
    initials: 'KL',
    tags: ['Billing'],
    approvedBy: 'Manual Override',
    executionStatus: 'Processing payment',
    avatarColor: 'blue'
  },
  {
    id: 'a3',
    type: 'API Limit Increase',
    customerName: 'MetaTech Solutions',
    team: 'Infrastructure',
    status: 'approved',
    timeAgo: 'Yesterday',
    description: 'Request for 2x rate limit increase for production migration. Infrastructure capacity confirmed.',
    initials: 'MT',
    tags: ['Infrastructure'],
    approvedBy: 'Approved by Admin',
    executionStatus: 'Quota Updated',
    avatarColor: 'purple'
  },
  // Rejected Items
  {
    id: 'r1',
    type: 'Refund',
    amount: '$1,250',
    customerName: 'Robert Kovacs',
    team: 'Billing Team',
    status: 'rejected',
    timeAgo: '2h ago',
    description: 'High-value refund request for a 6-month old transaction. Outside of standard 30-day policy window.',
    initials: 'RK',
    tags: ['Billing Team'],
    aiRecommendation: 'Reject (99%)',
    rejectedReason: 'Policy Blocked',
    avatarColor: 'red'
  },
  {
    id: 'r2',
    type: 'Account Credit',
    amount: '$500',
    customerName: 'Lisa Miller',
    team: 'Support',
    status: 'rejected',
    timeAgo: '5h ago',
    description: 'Request for goodwill credit due to perceived missing features. History shows multiple similar requests.',
    initials: 'LM',
    tags: ['Support'],
    aiRecommendation: 'Reject (85%)',
    rejectedReason: 'Fraud Risk',
    avatarColor: 'orange'
  },
  {
    id: 'r3',
    type: 'Plan Change Request',
    customerName: 'Alex Wong',
    team: 'Sales',
    status: 'rejected',
    timeAgo: '1d ago',
    description: 'Downgrade request during a locked promotional period. Terms and conditions prevent changes for 90 days.',
    initials: 'AW',
    tags: ['Sales'],
    aiRecommendation: 'Reject (92%)',
    rejectedReason: 'Outside Window',
    avatarColor: 'blue'
  }
];

export default function Approvals() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ApprovalStatus>('pending');

  // Fetch from API, fallback to static
  const { data: apiApprovals, loading: approvalsLoading, refetch } = useApi(() => approvalsApi.list(), [], []);
  
  const { mutate: decide, loading: deciding } = useMutation(
    ({ id, decision, note, decided_by }: { id: string, decision: 'approved' | 'rejected', note?: string, decided_by?: string }) => 
        approvalsApi.decide(id, decision, note, decided_by)
  );

  const handleDecision = async (id: string, decision: 'approved' | 'rejected') => {
    try {
      await decide({ id, decision, note: 'Decided from UI', decided_by: 'Admin' });
      refetch();
      setSelectedId(null);
    } catch (error) {
      console.error('Failed to decide:', error);
    }
  };

  const mapApiApproval = (a: any): ApprovalItem => ({
    id: a.id,
    type: a.action_type?.replace(/_/g, ' ') || 'Approval',
    amount: a.action_payload?.amount ? `$${Number(a.action_payload.amount / 100).toFixed(2)}` : undefined,
    customerName: a.customer_name || 'Unknown',
    company: a.company || undefined,
    team: a.assigned_team_id || 'Operations',
    status: (a.status === 'pending' || a.status === 'approved' || a.status === 'rejected') ? a.status : 'pending',
    priority: a.risk_level === 'high' ? 'high' : 'normal',
    sla: '24h',
    timeAgo: a.created_at ? new Date(a.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-',
    description: a.action_payload?.reason || a.action_type || 'Approval required',
    aiRecommendation: a.risk_level === 'high' ? 'Review carefully' : 'Approve',
    aiConfidence: a.risk_level === 'high' ? 85 : 95,
    aiAction: a.risk_level === 'high' ? 'review' : 'approve',
    initials: (a.customer_name || 'UN').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase(),
    tags: [a.action_type?.replace(/_/g, ' ') || 'General'],
    approvedBy: a.decision_by || undefined,
    rejectedReason: a.decision_note || undefined,
    executionStatus: a.status === 'approved' ? 'Executed Successfully' : undefined,
    avatarColor: a.risk_level === 'high' ? 'red' : a.risk_level === 'medium' ? 'orange' : 'blue',
  });

  const approvals = Array.isArray(apiApprovals) ? apiApprovals.map(mapApiApproval) : [];

  if (approvalsLoading && approvals.length === 0) {
    return <LoadingState title="Loading approvals" message="Fetching live approval requests from Supabase." />;
  }

  const selectedItem = approvals.find(item => item.id === selectedId);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">
        <AnimatePresence mode="wait">
        {!selectedId ? (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-6 pb-0 flex-shrink-0 z-20">
              <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card">
                <div className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Approvals</h1>
                    <p className="text-xs text-gray-500 mt-0.5">Review and manage pending operational requests requiring manual authorization.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative w-64 mr-2">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-lg">search</span>
                      <input 
                        type="text" 
                        placeholder="Search approvals..." 
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white transition-all"
                      />
                    </div>
                    <button className="px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                      Export log
                    </button>
                    <button className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-bold hover:opacity-90 transition-opacity shadow-card flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg">done_all</span>
                      Bulk approve
                    </button>
                  </div>
                </div>
                <div className="px-6 flex items-center space-x-8 border-t border-gray-100 dark:border-gray-800 pt-3">
                  {(['pending', 'approved', 'rejected'] as ApprovalStatus[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setFilter(s)}
                      className={`pb-3 text-sm transition-colors border-b-2 ${
                        filter === s
                          ? 'font-bold text-gray-900 dark:text-white border-black dark:border-white'
                          : 'font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border-transparent hover:border-gray-300'
                      }`}
                    >
                   {s.charAt(0).toUpperCase() + s.slice(1)} {s === 'pending' && `(${approvals.filter(i => i.status === 'pending').length})`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                <div className="xl:col-span-9 space-y-4">
                  {approvals.filter(item => item.status === filter).map((item) => (
                    <div 
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className="group bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-card hover:shadow-md transition-all cursor-pointer relative"
                    >
                      <div className="flex items-start justify-between pr-10">
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <div className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-[10px] shrink-0 shadow-sm border border-gray-100 dark:border-gray-800 ${
                              item.avatarColor === 'green' ? 'bg-green-50 dark:bg-green-900/40 text-green-600 dark:text-green-400' :
                              item.avatarColor === 'blue' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' :
                              item.avatarColor === 'purple' ? 'bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400' :
                              item.avatarColor === 'red' ? 'bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400' :
                              item.avatarColor === 'orange' ? 'bg-orange-50 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400' :
                              'bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-400'
                            }`}>
                              {item.initials}
                            </div>
                            <h3 className="font-bold text-gray-900 dark:text-white">
                              {item.type} {item.amount && item.amount}
                            </h3>
                            <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase tracking-wider rounded">
                              {item.team}
                            </span>
                            
                            {item.status === 'pending' && (
                              <>
                                {item.priority === 'high' && (
                                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 rounded-full">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                    <span className="text-[10px] font-bold text-red-700 dark:text-red-400 uppercase tracking-wider">High Priority</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 rounded-full">
                                  <span className="material-symbols-outlined text-[12px] text-amber-600 dark:text-amber-400">timer</span>
                                  <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">SLA {item.sla}</span>
                                </div>
                              </>
                            )}

                            {item.status === 'approved' && item.executionStatus && (
                              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${
                                item.executionStatus === 'Executed Successfully' || item.executionStatus === 'Quota Updated' 
                                  ? 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800/30 text-green-700 dark:text-green-400'
                                  : 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/30 text-blue-700 dark:text-blue-400'
                              }`}>
                                <span className="material-symbols-outlined text-[12px]">
                                  {item.executionStatus === 'Processing payment' ? 'sync' : 'check_circle'}
                                </span>
                                <span className="text-[10px] font-bold uppercase tracking-wider">{item.executionStatus}</span>
                              </div>
                            )}

                            {item.status === 'rejected' && item.rejectedReason && (
                              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${
                                item.rejectedReason === 'Policy Blocked' ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800/30 text-red-700 dark:text-red-400' :
                                item.rejectedReason === 'Fraud Risk' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/30 text-amber-700 dark:text-amber-400' :
                                'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                              }`}>
                                <span className="material-symbols-outlined text-[12px]">
                                  {item.rejectedReason === 'Policy Blocked' ? 'block' : 
                                   item.rejectedReason === 'Fraud Risk' ? 'gpp_maybe' : 'calendar_today'}
                                </span>
                                <span className="text-[10px] font-bold uppercase tracking-wider">{item.rejectedReason}</span>
                              </div>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            For <span className="font-bold text-gray-700 dark:text-gray-200">{item.customerName}</span> {item.company && `(${item.company})`} · {item.description}
                          </p>
                        </div>
                      </div>
                      
                      <span className="absolute right-6 top-7 material-symbols-outlined text-gray-300 group-hover:text-gray-600 dark:group-hover:text-gray-200 transition-colors">chevron_right</span>

                      <div className="mt-6 pt-6 border-t border-gray-50 dark:border-gray-800 flex items-center justify-between">
                        <div className="flex items-center gap-8">
                          {item.aiRecommendation && (
                            <div>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[12px]">auto_awesome</span>
                                AI Recommendation
                              </p>
                              <p className={`text-sm font-bold ${
                                item.aiAction === 'approve' ? 'text-green-600 dark:text-green-400' :
                                item.aiAction === 'reject' ? 'text-red-600 dark:text-red-400' :
                                'text-amber-600 dark:text-amber-400'
                              }`}>
                                {item.aiRecommendation} {item.aiConfidence && <span className="text-xs font-normal text-gray-400">({item.aiConfidence}%)</span>}
                              </p>
                            </div>
                          )}

                          {item.status === 'approved' && item.approvedBy && (
                            <div>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Approved By</p>
                              <p className="text-sm font-bold text-gray-900 dark:text-white">{item.approvedBy}</p>
                            </div>
                          )}

                          {item.status === 'rejected' && item.rejectedReason && (
                            <div>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Rejection Reason</p>
                              <p className="text-sm font-bold text-gray-900 dark:text-white">{item.rejectedReason}</p>
                            </div>
                          )}

                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Tags</p>
                            <div className="flex gap-1">
                              {item.tags.map(tag => (
                                <span key={tag} className="text-[10px] font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">Received</p>
                          <p className="text-sm font-bold text-gray-900 dark:text-white">{item.timeAgo}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Queue Health Sidebar */}
                <div className="xl:col-span-3">
                  <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-card sticky top-8">
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Queue Health</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Approval queue is operating normally.</p>
                      </div>
                      
                      <div className="pt-4 border-t border-gray-50 dark:border-gray-800">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">SLA Compliance</p>
                        <div className="flex items-end gap-2">
                          <span className="text-2xl font-bold text-gray-900 dark:text-white">98%</span>
                          <span className="text-xs text-gray-500 mb-1">Within SLA</span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1 mt-3 overflow-hidden">
                          <div className="bg-green-500 h-full rounded-full" style={{ width: '98%' }}></div>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-gray-50 dark:border-gray-800">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Top Issue</p>
                        <div className="flex items-start gap-3 mb-4">
                          <span className="material-symbols-outlined text-amber-500 text-lg">warning</span>
                          <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                            1 request approaching SLA breach (18m remaining)
                          </p>
                        </div>
                        <button className="w-full py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl text-xs font-bold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-card">
                          View at-risk items
                        </button>
                      </div>

                      <div className="pt-4 border-t border-gray-50 dark:border-gray-800 flex justify-between items-center">
                        <span className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Avg resolution</span>
                        <span className="text-xs font-bold text-gray-900 dark:text-white">45m</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {/* Detail Header */}
            <div className="h-12 flex items-center px-8 border-b border-gray-100 dark:border-gray-800 text-sm">
              <button 
                onClick={() => setSelectedId(null)}
                className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white flex items-center"
              >
                <span className="material-symbols-outlined text-lg mr-1">arrow_back</span>
                Back to Queue
              </button>
              <span className="mx-3 text-gray-300 dark:text-gray-600">/</span>
              <span className="text-gray-900 dark:text-gray-100 font-medium">Refund Request #{selectedItem?.id}</span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-white dark:bg-background-dark">
              <div className="w-full px-8 py-8">
                {/* Hero Card */}
                <CaseHeader
                  caseId={`CAS-${selectedItem?.id || '0000'}`}
                  title={selectedItem?.description.substring(0, 40) + '...' || 'Approval Request'}
                  channel="System"
                  customerName={selectedItem?.customerName || 'Unknown'}
                  orderId={`ORD-${selectedItem?.id || '0000'}`}
                  brand={selectedItem?.company || 'Unknown'}
                  initials={selectedItem?.initials || '??'}
                  avatarColor={`bg-${selectedItem?.avatarColor || 'pink'}-500`}
                  orderStatus="Delivered"
                  paymentStatus="Paid"
                  fulfillmentStatus="Shipped"
                  refundStatus={selectedItem?.type.includes('Refund') ? 'Pending' : 'N/A'}
                  approvalStatus={selectedItem?.status === 'pending' ? 'Pending' : 'Approved'}
                  recommendedAction={selectedItem?.aiRecommendation || 'Review required'}
                  conflictDetected={selectedItem?.priority === 'high' ? 'High priority approval required' : null}
                  actions={
                    selectedItem?.status === 'pending' ? (
                      <div className="flex gap-2 mr-4">
                        <button 
                          onClick={() => handleDecision(selectedItem?.id, 'rejected')}
                          disabled={deciding}
                          className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm flex items-center gap-1 disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-sm">close</span>
                          Reject
                        </button>
                        <button 
                          onClick={() => handleDecision(selectedItem?.id, 'approved')}
                          disabled={deciding}
                          className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-black text-sm font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors shadow-sm flex items-center gap-1 disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-sm">check</span>
                          Approve
                        </button>
                      </div>
                    ) : null
                  }
                />

                <div className="grid grid-cols-12 gap-8">
                  <div className="col-span-7 space-y-8">
                    {/* Conversation Context */}
                    <section>
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                          <span className="material-symbols-outlined text-gray-400">forum</span>
                          Conversation Context
                        </h2>
                        <button className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">View full transcript</button>
                      </div>
                      <div className="bg-gray-50 dark:bg-card-dark/50 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                        <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-card-dark">
                          <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex-shrink-0 flex items-center justify-center text-blue-700 dark:text-blue-300 font-bold text-sm">SJ</div>
                            <div className="flex-1">
                              <div className="flex justify-between items-baseline mb-1">
                                <span className="font-semibold text-gray-900 dark:text-white text-sm">Sarah Jenkins</span>
                                <span className="text-xs text-gray-500">Today, 10:45 AM</span>
                              </div>
                              <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                                "Hi, I just saw a charge for $499 on my card. I meant to cancel my subscription last week but totally forgot. I haven't used the tool at all since the new billing cycle started. Can I please get a refund?"
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="p-5 bg-purple-50/50 dark:bg-purple-900/10">
                          <div className="flex gap-3">
                            <div className="mt-0.5">
                              <span className="material-symbols-outlined text-purple-600 dark:text-purple-400">auto_awesome</span>
                            </div>
                            <div>
                              <h3 className="text-sm font-semibold text-purple-900 dark:text-purple-300 mb-1">AI Analysis</h3>
                              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                Customer forgot to cancel their annual subscription before the renewal date. System logs confirm no login activity or API usage in the last 3 days since renewal. Intent is clear for a full refund.
                              </p>
                              <div className="mt-3 flex gap-2">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300">
                                  Sentiment: Neutral
                                </span>
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300">
                                  Churn Risk: High
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* Audit Trail */}
                    <section>
                      <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                        <span className="material-symbols-outlined text-gray-400">history</span>
                        Audit Trail
                      </h2>
                      <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-700 rounded-xl p-6">
                        <div className="relative border-l-2 border-gray-100 dark:border-gray-700 ml-3 space-y-8 py-2">
                          <div className="relative pl-8 group">
                            <div className="absolute w-4 h-4 bg-gray-200 dark:bg-gray-600 rounded-full -left-[9px] top-1 group-hover:bg-gray-400 transition-colors border-2 border-white dark:border-card-dark"></div>
                            <div>
                              <span className="text-xs font-mono text-gray-400 dark:text-gray-500 mb-1 block">10:45:12 AM</span>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">Ticket created via Email</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Source: support@acme.com</p>
                            </div>
                          </div>
                          <div className="relative pl-8 group">
                            <div className="absolute w-4 h-4 bg-purple-200 dark:bg-purple-800 rounded-full -left-[9px] top-1 group-hover:bg-purple-400 transition-colors border-2 border-white dark:border-card-dark flex items-center justify-center">
                              <div className="w-1.5 h-1.5 bg-purple-600 dark:bg-purple-400 rounded-full"></div>
                            </div>
                            <div>
                              <span className="text-xs font-mono text-gray-400 dark:text-gray-500 mb-1 block">10:46:05 AM</span>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">Autopilot analyzed intent</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Identified: "Refund Request" (Confidence: 98%)</p>
                            </div>
                          </div>
                          <div className="relative pl-8 group">
                            <div className="absolute w-4 h-4 bg-purple-200 dark:bg-purple-800 rounded-full -left-[9px] top-1 group-hover:bg-purple-400 transition-colors border-2 border-white dark:border-card-dark flex items-center justify-center">
                              <div className="w-1.5 h-1.5 bg-purple-600 dark:bg-purple-400 rounded-full"></div>
                            </div>
                            <div>
                              <span className="text-xs font-mono text-gray-400 dark:text-gray-500 mb-1 block">10:46:08 AM</span>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">Tool Plan Formulated</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Action: stripe.refund_payment(amount=49900, reason='requested_by_customer')</p>
                            </div>
                          </div>
                          <div className="relative pl-8 group">
                            <div className="absolute w-6 h-6 bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-400 rounded-full -left-[13px] -top-1 border-4 border-white dark:border-card-dark flex items-center justify-center shadow-sm">
                              <span className="material-symbols-outlined text-[14px] font-bold">pause</span>
                            </div>
                            <div>
                              <span className="text-xs font-mono text-gray-400 dark:text-gray-500 mb-1 block">10:46:10 AM</span>
                              <p className="text-sm font-bold text-amber-700 dark:text-amber-500">Execution Paused: Approval Required</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Trigger: Policy "Refund &gt; $50"</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>

                  <div className="col-span-5 space-y-6">
                    {/* Decision Note */}
                    <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm">
                      <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">Decision Note</label>
                      <textarea 
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700 dark:text-gray-300 placeholder-gray-400 resize-none h-24" 
                        placeholder="Add a note explaining your decision... (Optional)"
                      ></textarea>
                    </div>

                    {/* Triggering Policy */}
                    <div className="bg-white dark:bg-card-dark border border-amber-200 dark:border-amber-800 rounded-xl p-5 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-2 opacity-10">
                        <span className="material-symbols-outlined text-8xl text-amber-500">gavel</span>
                      </div>
                      <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Triggering Policy</h3>
                      <div className="flex items-start gap-3 relative z-10">
                        <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0 text-amber-600 dark:text-amber-400">
                          <span className="material-symbols-outlined text-lg">policy</span>
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-gray-900 dark:text-white">Refund &gt; $50 requires approval</h4>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                            "Any refund amount exceeding $50.00 USD must be reviewed by a human manager before execution to prevent fraud and accidental high-value loss."
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Risk Analysis */}
                    <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Risk & Behavior Analysis</h3>
                        <span className="material-symbols-outlined text-gray-400 text-lg">analytics</span>
                      </div>
                      
                      <div className="flex flex-wrap gap-2 mb-4">
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-100 dark:border-green-800">
                          <span className="w-1 h-1 rounded-full bg-green-500 mr-1.5"></span>
                          Fraud Risk: Low
                        </span>
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-800">
                          <span className="w-1 h-1 rounded-full bg-red-500 mr-1.5"></span>
                          Churn Risk: High
                        </span>
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-800">
                          <span className="material-symbols-outlined text-[10px] mr-1">verified_user</span>
                          Account Security: Verified
                        </span>
                      </div>

                      <div className="space-y-3 mb-6">
                        <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                          <span className="material-symbols-outlined text-sm text-amber-500">warning</span>
                          <span>3rd refund request in 12 months</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                          <span className="material-symbols-outlined text-sm text-green-500">check_circle</span>
                          <span>Consistent IP address (London, UK)</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                          <span className="material-symbols-outlined text-sm text-blue-500">info</span>
                          <span>Customer since Oct 2023</span>
                        </div>
                      </div>

                      <div className="mb-4">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Customer Health</span>
                          <span className="text-xs font-bold text-gray-900 dark:text-white">78/100</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                          <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-1.5 rounded-full" style={{ width: '78%' }}></div>
                        </div>
                      </div>
                    </div>

                    {/* Proposed Action */}
                    <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-700 rounded-xl p-5">
                      <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Proposed Tool Action</h3>
                      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-[#635BFF] flex items-center justify-center text-white text-xs font-bold shadow-sm">
                            S
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Stripe API</span>
                            <span className="text-sm font-mono text-gray-900 dark:text-white">refund_payment</span>
                          </div>
                        </div>
                        <span className="px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-[10px] font-bold rounded border border-red-100 dark:border-red-800 uppercase tracking-wider">Blocked</span>
                      </div>
                    </div>

                    {/* Evidence & Context */}
                    <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-700 rounded-xl p-5">
                      <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Evidence & Context</h3>
                      <div className="space-y-3">
                        <a className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all group" href="#">
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-gray-400 group-hover:text-indigo-500">article</span>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-gray-900 dark:text-white">Refund Policy v2.4</span>
                              <span className="text-xs text-gray-500">Internal Knowledge Base</span>
                            </div>
                          </div>
                          <span className="material-symbols-outlined text-gray-300 text-sm">open_in_new</span>
                        </a>
                        <a className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all group" href="#">
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-gray-400 group-hover:text-indigo-500">confirmation_number</span>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-gray-900 dark:text-white">Similar Ticket #4492</span>
                              <span className="text-xs text-gray-500">Mike Rossi • 2 weeks ago</span>
                            </div>
                          </div>
                          <span className="text-xs font-medium px-2 py-0.5 bg-red-100 text-red-700 rounded">Rejected</span>
                        </a>
                        <a className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all group" href="#">
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-gray-400 group-hover:text-indigo-500">person_search</span>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-gray-900 dark:text-white">Customer Profile</span>
                              <span className="text-xs text-gray-500">Sarah Jenkins • Acme Corp</span>
                            </div>
                          </div>
                          <span className="material-symbols-outlined text-gray-300 text-sm">chevron_right</span>
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
