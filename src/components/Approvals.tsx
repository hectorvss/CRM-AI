import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import CaseHeader from './CaseHeader';
import { approvalsApi } from '../api/client';
import { useApi, useMutation } from '../api/hooks';

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
  initials: string;
  avatarColor?: string;
  caseId?: string;
}

const mockApprovals: ApprovalItem[] = [
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
    initials: 'SJ',
    avatarColor: 'blue',
    caseId: 'CAS-9281',
  },
];

function formatStatus(value?: string | null) {
  if (!value) return 'N/A';
  return value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function formatMoney(value: any) {
  const amount = Number(value);
  if (Number.isNaN(amount) || amount === 0) return null;
  return `$${amount >= 100 ? (amount / 100).toFixed(2) : amount.toFixed(2)}`;
}

function formatTimestamp(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function avatarTone(color?: string) {
  switch (color) {
    case 'green':
      return 'bg-green-50 dark:bg-green-900/40 text-green-600 dark:text-green-400';
    case 'purple':
      return 'bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400';
    case 'red':
      return 'bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400';
    case 'orange':
      return 'bg-orange-50 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400';
    default:
      return 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400';
  }
}

function avatarFill(color?: string) {
  switch (color) {
    case 'green':
      return 'bg-green-500';
    case 'purple':
      return 'bg-purple-500';
    case 'red':
      return 'bg-red-500';
    case 'orange':
      return 'bg-orange-500';
    default:
      return 'bg-blue-500';
  }
}

export default function Approvals() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ApprovalStatus>('pending');
  const [decisionNote, setDecisionNote] = useState('');

  const { data: apiApprovals, refetch } = useApi(() => approvalsApi.list(), [], []);
  const approvals = useMemo<ApprovalItem[]>(() => {
    if (!apiApprovals || apiApprovals.length === 0) return [];
    return apiApprovals.map((item: any) => ({
      id: item.id,
      type: formatStatus(item.action_type || 'Approval'),
      amount: formatMoney(item.action_payload?.amount),
      customerName: item.customer_name || 'Unknown',
      company: item.customer_segment || undefined,
      team: item.assigned_user_name || item.assigned_team_id || 'Operations',
      status: item.status,
      priority: item.risk_level === 'high' ? 'high' : 'normal',
      sla: item.expires_at ? formatTimestamp(item.expires_at) : '24h',
      timeAgo: formatTimestamp(item.created_at),
      description: item.action_payload?.reason || item.action_type || 'Approval required',
      aiRecommendation: item.risk_level === 'high' ? 'Manual review' : 'Approve',
      initials: (item.customer_name || 'UN').split(' ').map((part: string) => part[0]).join('').slice(0, 2).toUpperCase(),
      avatarColor: item.risk_level === 'high' ? 'red' : item.risk_level === 'medium' ? 'orange' : 'blue',
      caseId: item.case_number,
    }));
  }, [apiApprovals]);

  const { data: selectedContext, refetch: refetchContext } = useApi(
    () => selectedId ? approvalsApi.context(selectedId) : Promise.resolve(null),
    [selectedId],
    null,
  );

  const { mutate: decide, loading: deciding } = useMutation(
    ({ id, decision, note, decided_by }: { id: string; decision: 'approved' | 'rejected'; note?: string; decided_by?: string }) =>
      approvalsApi.decide(id, decision, note, decided_by)
  );

  const handleDecision = async (decision: 'approved' | 'rejected') => {
    if (!selectedItem) return;
    const result = await decide({
      id: selectedItem.id,
      decision,
      note: decisionNote || 'Decided from UI',
      decided_by: 'Admin',
    });
    if (result) {
      setDecisionNote('');
      refetch();
      refetchContext();
    }
  };

  const selectedCase = selectedContext?.case_state;
  const selectedResolve = selectedContext?.resolve;
  const latestCustomerMessage = selectedContext?.conversation?.latest_customer_message;
  const latestAgentMessage = selectedContext?.conversation?.latest_agent_message;
  const visibleApprovals = useMemo(
    () => approvals.filter(item => item.status === filter),
    [approvals, filter],
  );

  useEffect(() => {
    if (visibleApprovals.length === 0) {
      if (selectedId) setSelectedId(null);
      return;
    }
    if (!selectedId || !visibleApprovals.some(item => item.id === selectedId)) {
      setSelectedId(visibleApprovals[0].id);
    }
  }, [visibleApprovals, selectedId]);

  const selectedItem = visibleApprovals.find(item => item.id === selectedId) || null;

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">
        <AnimatePresence mode="wait">
          {!selectedItem ? (
            <motion.div key="empty" className="flex-1 flex items-center justify-center text-sm text-gray-500">
              No approvals found for this filter.
            </motion.div>
          ) : (
            <motion.div key="detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col overflow-hidden">
              <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800 text-sm text-gray-500 flex items-center">
                <button onClick={() => setSelectedId(visibleApprovals[0]?.id || approvals[0]?.id || null)} className="flex items-center gap-2 hover:text-gray-700 dark:hover:text-gray-200">
                  <span className="material-symbols-outlined text-lg">arrow_back</span>
                  Back to Queue
                </button>
                <span className="mx-3 text-gray-300 dark:text-gray-600">/</span>
                <span className="text-gray-900 dark:text-gray-100 font-medium">{selectedItem.type} Request #{selectedItem.id}</span>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar bg-white dark:bg-background-dark">
                <div className="p-6 xl:pl-[400px]">
                  <CaseHeader
                    caseId={selectedContext?.approval?.case_number || selectedItem.caseId || `CAS-${selectedItem.id}`}
                    title={selectedItem.description}
                    channel={selectedContext?.conversation?.channel || 'System'}
                    customerName={selectedItem.customerName}
                    orderId={selectedCase?.identifiers?.order_ids?.[0] || `ORD-${selectedItem.id}`}
                    brand={selectedItem.company || selectedContext?.approval?.customer_segment || 'Operations'}
                    initials={selectedItem.initials}
                    avatarColor={avatarFill(selectedItem.avatarColor)}
                    orderStatus={formatStatus(selectedCase?.systems?.orders?.nodes?.[0]?.value || 'n/a')}
                    paymentStatus={formatStatus(selectedCase?.systems?.payments?.nodes?.[0]?.value || 'n/a')}
                    fulfillmentStatus={formatStatus(selectedCase?.systems?.fulfillment?.nodes?.[0]?.value || 'n/a')}
                    refundStatus={formatStatus(selectedCase?.systems?.returns?.nodes?.[0]?.value || 'n/a')}
                    approvalStatus={formatStatus(selectedContext?.approval?.status || 'pending')}
                    recommendedAction={selectedResolve?.conflict?.recommended_action || selectedItem.aiRecommendation || 'Review required'}
                    conflictDetected={selectedResolve?.conflict?.summary || null}
                    actions={selectedItem.status === 'pending' ? (
                      <div className="flex gap-2 mr-4">
                        <button onClick={() => handleDecision('rejected')} disabled={deciding} className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm flex items-center gap-1 disabled:opacity-50">
                          <span className="material-symbols-outlined text-sm">close</span>
                          Reject
                        </button>
                        <button onClick={() => handleDecision('approved')} disabled={deciding} className="px-4 py-2 bg-gray-900 dark:bg-white text-white dark:text-black text-sm font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors shadow-sm flex items-center gap-1 disabled:opacity-50">
                          <span className="material-symbols-outlined text-sm">check</span>
                          Approve
                        </button>
                      </div>
                    ) : null}
                  />

                  <div className="grid grid-cols-12 gap-8">
                    <div className="col-span-7 space-y-8">
                      <section>
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <span className="material-symbols-outlined text-gray-400">forum</span>
                            Conversation Context
                          </h2>
                        </div>
                        <div className="bg-gray-50 dark:bg-card-dark/50 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                          {latestCustomerMessage ? (
                            <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-card-dark">
                              <div className="flex items-start gap-4">
                                <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm ${avatarTone(selectedItem.avatarColor)}`}>{selectedItem.initials}</div>
                                <div className="flex-1">
                                  <div className="flex justify-between items-baseline mb-1">
                                    <span className="font-semibold text-gray-900 dark:text-white text-sm">{selectedItem.customerName}</span>
                                    <span className="text-xs text-gray-500">{formatTimestamp(latestCustomerMessage.sent_at || latestCustomerMessage.created_at)}</span>
                                  </div>
                                  <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{latestCustomerMessage.content}</p>
                                </div>
                              </div>
                            </div>
                          ) : null}
                          <div className="p-5 bg-purple-50/50 dark:bg-purple-900/10">
                            <div className="flex gap-3">
                              <div className="mt-0.5">
                                <span className="material-symbols-outlined text-purple-600 dark:text-purple-400">auto_awesome</span>
                              </div>
                              <div>
                                <h3 className="text-sm font-semibold text-purple-900 dark:text-purple-300 mb-1">AI Analysis</h3>
                                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{selectedResolve?.conflict?.root_cause || selectedResolve?.conflict?.summary || selectedItem.description}</p>
                                <div className="mt-3 flex gap-2 flex-wrap">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300">Severity: {formatStatus(selectedResolve?.conflict?.severity)}</span>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300">Risk: {formatStatus(selectedContext?.approval?.risk_level)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          {latestAgentMessage ? (
                            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-card-dark">
                              <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Latest Agent Activity</div>
                              <p className="text-sm text-gray-700 dark:text-gray-300">{latestAgentMessage.content}</p>
                            </div>
                          ) : null}
                        </div>
                      </section>

                      <section>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                          <span className="material-symbols-outlined text-gray-400">history</span>
                          Audit Trail
                        </h2>
                        <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-700 rounded-xl p-6">
                          <div className="relative border-l-2 border-gray-100 dark:border-gray-700 ml-3 space-y-8 py-2">
                            {(selectedContext?.audit_trail || []).map((event: any) => (
                              <div key={event.id} className="relative pl-8">
                                <div className="absolute w-4 h-4 bg-purple-200 dark:bg-purple-800 rounded-full -left-[9px] top-1 border-2 border-white dark:border-card-dark" />
                                <div>
                                  <span className="text-xs font-mono text-gray-400 dark:text-gray-500 mb-1 block">{formatTimestamp(event.occurred_at)}</span>
                                  <p className="text-sm font-medium text-gray-900 dark:text-white">{formatStatus(event.action)}</p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{event.entity_id || event.actor_id || 'System'}</p>
                                </div>
                              </div>
                            ))}
                            {!(selectedContext?.audit_trail || []).length ? <p className="text-sm text-gray-500">No audit events yet.</p> : null}
                          </div>
                        </div>
                      </section>
                    </div>

                    <div className="col-span-5 space-y-6">
                      <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm">
                        <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">Decision Note</label>
                        <textarea value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700 dark:text-gray-300 placeholder-gray-400 resize-none h-24" placeholder="Add a note explaining your decision... (Optional)" />
                      </div>

                      <div className="bg-white dark:bg-card-dark border border-amber-200 dark:border-amber-800 rounded-xl p-5">
                        <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Triggering Policy</h3>
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white">{selectedContext?.policy?.title || 'Approval policy'}</h4>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">{selectedContext?.policy?.description || 'Approval required by current execution policy.'}</p>
                      </div>

                      <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-700 rounded-xl p-5 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Risk & Behavior Analysis</h3>
                          <span className="material-symbols-outlined text-gray-400 text-lg">analytics</span>
                        </div>
                        <div className="space-y-3 mb-4 text-xs text-gray-600 dark:text-gray-400">
                          <div className="flex items-center gap-3"><span className="material-symbols-outlined text-sm text-red-500">warning</span><span>Conflict severity: {formatStatus(selectedResolve?.conflict?.severity)}</span></div>
                          <div className="flex items-center gap-3"><span className="material-symbols-outlined text-sm text-green-500">check_circle</span><span>Refund rate: {selectedContext?.approval?.refund_rate ?? 0}</span></div>
                          <div className="flex items-center gap-3"><span className="material-symbols-outlined text-sm text-blue-500">info</span><span>LTV: {formatMoney(selectedContext?.approval?.lifetime_value) || '$0.00'}</span></div>
                        </div>
                      </div>

                      <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-700 rounded-xl p-5">
                        <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Proposed Tool Action</h3>
                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-[#635BFF] flex items-center justify-center text-white text-xs font-bold shadow-sm">{String(selectedContext?.proposed_action?.tool || 'T').slice(0, 1).toUpperCase()}</div>
                            <div className="flex flex-col">
                              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{formatStatus(selectedContext?.proposed_action?.tool || 'connector')}</span>
                              <span className="text-sm font-mono text-gray-900 dark:text-white">{selectedContext?.proposed_action?.action || 'manual_review'}</span>
                            </div>
                          </div>
                          <span className={`px-2 py-1 text-[10px] font-bold rounded border uppercase tracking-wider ${selectedContext?.proposed_action?.blocked ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-800' : 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-100 dark:border-green-800'}`}>{selectedContext?.proposed_action?.blocked ? 'Blocked' : 'Ready'}</span>
                        </div>
                      </div>

                      <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-700 rounded-xl p-5">
                        <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Evidence & Context</h3>
                        <div className="space-y-3">
                          {(selectedContext?.evidence?.refs || []).map((ref: string) => (
                            <div key={ref} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                              <div className="flex items-center gap-3"><span className="material-symbols-outlined text-gray-400">article</span><div><span className="text-sm font-medium text-gray-900 dark:text-white">{ref}</span><div className="text-xs text-gray-500">Knowledge evidence</div></div></div>
                            </div>
                          ))}
                          {(selectedContext?.evidence?.similar_cases || []).map((item: any) => (
                            <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                              <div className="flex items-center gap-3"><span className="material-symbols-outlined text-gray-400">confirmation_number</span><div><span className="text-sm font-medium text-gray-900 dark:text-white">{item.case_number}</span><div className="text-xs text-gray-500">{formatStatus(item.type)} · {formatTimestamp(item.updated_at)}</div></div></div>
                              <span className="text-xs font-medium px-2 py-0.5 bg-gray-100 text-gray-700 rounded">{formatStatus(item.status)}</span>
                            </div>
                          ))}
                          {(selectedContext?.evidence?.internal_notes || []).map((note: any) => (
                            <div key={note.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                              <div className="flex items-center gap-3"><span className="material-symbols-outlined text-gray-400">sticky_note_2</span><div><span className="text-sm font-medium text-gray-900 dark:text-white">{note.content}</span><div className="text-xs text-gray-500">{formatTimestamp(note.created_at)}</div></div></div>
                            </div>
                          ))}
                          {!(selectedContext?.evidence?.refs || []).length && !(selectedContext?.evidence?.similar_cases || []).length && !(selectedContext?.evidence?.internal_notes || []).length ? <p className="text-sm text-gray-500">No evidence registered yet.</p> : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="hidden xl:block absolute left-6 top-6 w-[360px]">
                <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card">
                  <div className="px-6 py-4 flex items-center justify-between">
                    <div>
                      <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Approvals</h1>
                      <p className="text-xs text-gray-500 mt-0.5">Review and manage pending operational requests requiring manual authorization.</p>
                    </div>
                  </div>
                  <div className="px-6 flex items-center space-x-8 border-t border-gray-100 dark:border-gray-800 pt-3">
                    {(['pending', 'approved', 'rejected'] as ApprovalStatus[]).map(status => (
                      <button key={status} onClick={() => { setFilter(status); setSelectedId(approvals.filter(item => item.status === status)[0]?.id || null); }} className={`pb-3 text-sm transition-colors border-b-2 ${filter === status ? 'font-bold text-gray-900 dark:text-white border-black dark:border-white' : 'font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border-transparent hover:border-gray-300'}`}>
                        {status.charAt(0).toUpperCase() + status.slice(1)} {status === 'pending' && `(${approvals.filter(item => item.status === 'pending').length})`}
                      </button>
                    ))}
                  </div>
                  <div className="max-h-[480px] overflow-y-auto custom-scrollbar p-4 space-y-4">
                    {visibleApprovals.map(item => (
                      <div key={item.id} onClick={() => setSelectedId(item.id)} className={`group bg-white dark:bg-card-dark border rounded-2xl p-5 shadow-card hover:shadow-md transition-all cursor-pointer relative ${selectedId === item.id ? 'border-gray-900 dark:border-white' : 'border-gray-200 dark:border-gray-800'}`}>
                        <div className="flex items-start justify-between pr-8">
                          <div className="space-y-1">
                            <div className="flex items-center gap-3">
                              <div className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-[10px] shrink-0 shadow-sm border border-gray-100 dark:border-gray-800 ${avatarTone(item.avatarColor)}`}>{item.initials}</div>
                              <h3 className="font-bold text-gray-900 dark:text-white">{item.type} {item.amount && item.amount}</h3>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">For <span className="font-bold text-gray-700 dark:text-gray-200">{item.customerName}</span> · {item.description}</p>
                          </div>
                        </div>
                        <span className="absolute right-5 top-5 material-symbols-outlined text-gray-300 group-hover:text-gray-600 dark:group-hover:text-gray-200 transition-colors">chevron_right</span>
                        <div className="mt-4 pt-4 border-t border-gray-50 dark:border-gray-800 flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">AI Recommendation</p>
                            <p className="text-sm font-bold text-gray-900 dark:text-white">{item.aiRecommendation}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Created</p>
                            <p className="text-xs text-gray-600 dark:text-gray-300">{item.timeAgo}</p>
                          </div>
                        </div>
                      </div>
                    ))}
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
