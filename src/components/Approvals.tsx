import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { approvalsApi } from '../api/client';
import { useApi, useMutation } from '../api/hooks';
import LoadingState from './LoadingState';

type ApprovalStatus = 'pending' | 'approved' | 'rejected';
type Decision = 'approved' | 'rejected';

type ApprovalRecord = {
  id: string;
  case_id?: string | null;
  case_number?: string | null;
  customer_name?: string | null;
  customer_segment?: string | null;
  action_type?: string | null;
  risk_level?: string | null;
  status?: string | null;
  priority?: string | null;
  assigned_to?: string | null;
  assigned_team_id?: string | null;
  assigned_user_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  decision_by?: string | null;
  decision_note?: string | null;
  execution_plan_id?: string | null;
  expires_at?: string | null;
  action_payload?: Record<string, any> | null;
  evidence_package?: Record<string, any> | null;
};

type ApprovalContext = {
  approval: ApprovalRecord;
  case?: any;
  customer?: any;
  case_state?: any;
  conversation?: any;
  messages?: any[];
  internal_notes?: any[];
  evidence?: { approvals?: any[]; reconciliation_issues?: any[]; linked_cases?: any[] };
} | null;

const titleCase = (value: string) => value.replace(/[_-]+/g, ' ').split(' ').filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A';
const formatMoney = (value: any) => {
  if (value === null || value === undefined || value === '') return 'N/A';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: numeric % 1 === 0 ? 0 : 2 }).format(numeric) : String(value);
};
const getStatusStyles = (status?: string | null) => status === 'approved'
  ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/30'
  : status === 'rejected'
    ? 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800/30'
    : 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/30';
const extractSummary = (item: ApprovalRecord) => item.evidence_package?.summary || item.action_payload?.summary || item.action_payload?.reason || item.action_type || 'Approval required';

function normalizeApproval(item: any): ApprovalRecord {
  return {
    id: item.id,
    case_id: item.case_id || null,
    case_number: item.case_number || null,
    customer_name: item.customer_name || null,
    customer_segment: item.customer_segment || null,
    action_type: item.action_type || null,
    risk_level: item.risk_level || null,
    status: item.status || 'pending',
    priority: item.priority || 'normal',
    assigned_to: item.assigned_to || null,
    assigned_team_id: item.assigned_team_id || null,
    assigned_user_name: item.assigned_user_name || null,
    created_at: item.created_at || null,
    updated_at: item.updated_at || null,
    decision_by: item.decision_by || null,
    decision_note: item.decision_note || null,
    execution_plan_id: item.execution_plan_id || null,
    expires_at: item.expires_at || null,
    action_payload: item.action_payload || {},
    evidence_package: item.evidence_package || {},
  };
}

export default function Approvals() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ApprovalStatus>('pending');
  const [query, setQuery] = useState('');
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const { data: apiApprovals, loading, error, refetch } = useApi(() => approvalsApi.list(), [], []);
  const approvals = useMemo(() => (Array.isArray(apiApprovals) ? apiApprovals.map(normalizeApproval) : []).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()), [apiApprovals]);

  useEffect(() => {
    if (!approvals.length) { setSelectedId(null); return; }
    if (selectedId && approvals.some(a => a.id === selectedId)) return;
    setSelectedId((approvals.find(a => a.status === 'pending') ?? approvals[0])?.id || null);
  }, [approvals, selectedId]);

  const selectedApproval = useMemo(() => approvals.find(item => item.id === selectedId) || null, [approvals, selectedId]);
  const { data: selectedContext, loading: contextLoading, error: contextError, refetch: refetchContext } = useApi<ApprovalContext>(
    () => (selectedId ? approvalsApi.context(selectedId) : Promise.resolve(null)),
    [selectedId],
    null,
  );

  const { mutate: decide, loading: deciding } = useMutation(({ id, decision, note }: { id: string; decision: Decision; note?: string }) => approvalsApi.decide(id, decision, note, 'Admin'));

  useEffect(() => {
    setDecisionNote(selectedApproval?.decision_note || '');
    setDecisionError(null);
  }, [selectedApproval?.id]);

  const counts = useMemo(() => ({
    pending: approvals.filter(a => a.status === 'pending').length,
    approved: approvals.filter(a => a.status === 'approved').length,
    rejected: approvals.filter(a => a.status === 'rejected').length,
  }), [approvals]);

  const filteredApprovals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return approvals.filter((item) => {
      if ((item.status || 'pending') !== filter) return false;
      if (!q) return true;
      return [item.id, item.case_number, item.customer_name, item.assigned_user_name, item.action_type].filter(Boolean).some(v => String(v).toLowerCase().includes(q));
    });
  }, [approvals, filter, query]);

  const selectedDetails = selectedContext?.approval || selectedApproval;
  const timeline = Array.isArray(selectedContext?.case_state?.timeline) ? selectedContext.case_state.timeline.slice(-6).reverse() : [];

  const handleDecision = async (decision: Decision) => {
    if (!selectedApproval) return;
    setDecisionError(null);
    const result = await decide({ id: selectedApproval.id, decision, note: decisionNote.trim() || undefined });
    if (!result) {
      setDecisionError('No pudimos completar la decisión.');
      return;
    }
    await refetch();
    await refetchContext();
    setSelectedId(null);
  };

  if (loading && approvals.length === 0) {
    return <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0"><div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-lg border border-gray-100 dark:border-gray-800 shadow-card"><LoadingState title="Loading approvals" message="Fetching live approval requests from Supabase." /></div></div>;
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-lg border border-gray-100 dark:border-gray-800 shadow-card">
        <div className="p-6 pb-0 flex-shrink-0 z-20">
          <div className="bg-white dark:bg-card-dark rounded-lg border border-gray-200 dark:border-gray-700 shadow-card">
            <div className="px-6 py-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Approvals</h1>
                <p className="text-xs text-gray-500 mt-0.5">Inspect live case context, decide, and keep the audit trail in the backend.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative w-64">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-lg">search</span>
                  <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search approvals..." className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white transition-all" />
                </div>
                <button type="button" onClick={() => void refetch()} className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">Refresh</button>
              </div>
            </div>
            <div className="px-6 flex items-center gap-6 border-t border-gray-100 dark:border-gray-800 pt-3">
              {(['pending', 'approved', 'rejected'] as ApprovalStatus[]).map(status => (
                <button key={status} type="button" onClick={() => setFilter(status)} className={`pb-3 text-sm transition-colors border-b-2 ${filter === status ? 'font-semibold text-gray-900 dark:text-white border-black dark:border-white' : 'font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border-transparent hover:border-gray-300'}`}>
                  {titleCase(status)} {status === 'pending' ? `(${counts.pending})` : status === 'approved' ? `(${counts.approved})` : `(${counts.rejected})`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {error && <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/30 dark:bg-amber-900/15 dark:text-amber-300">Unable to load approvals: {error}</div>}

          <div className="space-y-6">
            <section className="w-full bg-white dark:bg-card-dark rounded-lg border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Queue</h2>
                <span className="text-xs text-gray-500">{filteredApprovals.length} items</span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredApprovals.length === 0 ? <div className="p-5 text-sm text-gray-500 dark:text-gray-400">No approvals match this filter.</div> : filteredApprovals.map(item => {
                  const active = item.id === selectedId;
                  return (
                    <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`w-full text-left px-5 py-4 transition-colors ${active ? 'bg-gray-50 dark:bg-gray-800/60' : 'hover:bg-gray-50/80 dark:hover:bg-gray-800/40'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{titleCase(item.action_type || 'Approval')}</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${getStatusStyles(item.status)}`}>{titleCase(item.status || 'pending')}</span>
                          </div>
                          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 truncate">{item.customer_name || 'Unknown customer'} {item.case_number ? `· ${item.case_number}` : ''}</p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-500 truncate">{extractSummary(item)}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{item.risk_level ? titleCase(item.risk_level) : 'Risk unknown'}</p>
                          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{formatDate(item.created_at)}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {selectedApproval ? (
              <AnimatePresence mode="wait">
                <motion.section key={selectedApproval.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} className="w-full bg-white dark:bg-card-dark rounded-lg border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{titleCase(selectedApproval.action_type || 'Approval')} · {selectedApproval.case_number || selectedApproval.id}</h2>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{selectedApproval.customer_name || 'Unknown customer'} {selectedApproval.customer_segment ? `· ${titleCase(selectedApproval.customer_segment)}` : ''}</p>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${getStatusStyles(selectedApproval.status)}`}>{titleCase(selectedApproval.status || 'pending')}</span>
                  </div>
                  <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
                    <div className="lg:col-span-1 space-y-5">
                      <section className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                          <h3 className="text-xs font-semibold text-gray-900 dark:text-white">Request</h3>
                          <span className="material-symbols-outlined text-gray-400 text-[18px]">fact_check</span>
                        </div>
                        <div className="p-4 space-y-3 text-sm">
                          <div className="flex justify-between gap-4"><span className="text-gray-500">Case</span><span className="text-gray-900 dark:text-white text-right">{selectedApproval.case_number || 'N/A'}</span></div>
                          <div className="flex justify-between gap-4"><span className="text-gray-500">Risk</span><span className="text-gray-900 dark:text-white">{titleCase(selectedApproval.risk_level || 'unknown')}</span></div>
                          <div className="flex justify-between gap-4"><span className="text-gray-500">Assigned to</span><span className="text-gray-900 dark:text-white text-right">{selectedApproval.assigned_user_name || selectedApproval.assigned_to || 'Unassigned'}</span></div>
                          <div className="flex justify-between gap-4"><span className="text-gray-500">Team</span><span className="text-gray-900 dark:text-white text-right">{selectedApproval.assigned_team_id || 'Operations'}</span></div>
                          <div className="flex justify-between gap-4"><span className="text-gray-500">Execution plan</span><span className="text-gray-900 dark:text-white text-right">{selectedApproval.execution_plan_id || 'None'}</span></div>
                          <div className="flex justify-between gap-4"><span className="text-gray-500">Due</span><span className="text-gray-900 dark:text-white text-right">{formatDate(selectedApproval.expires_at)}</span></div>
                        </div>
                      </section>
                      <section className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                          <h3 className="text-xs font-semibold text-gray-900 dark:text-white">Decision note</h3>
                          <span className="material-symbols-outlined text-gray-400 text-[18px]">edit_note</span>
                        </div>
                        <div className="p-4">
                          <textarea value={decisionNote} onChange={e => setDecisionNote(e.target.value)} className="w-full min-h-28 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 outline-none focus:border-gray-400 dark:focus:border-gray-500" placeholder="Add a short note explaining the decision." />
                          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">This note is saved with the approval record and case history.</p>
                        </div>
                      </section>
                    </div>

                    <div className="lg:col-span-2 space-y-5">
                      <section className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                          <h3 className="text-xs font-semibold text-gray-900 dark:text-white">Timeline</h3>
                          <span className="material-symbols-outlined text-gray-400 text-[18px]">schedule</span>
                        </div>
                        <div className="p-4 space-y-4">
                          {timeline.length ? timeline.map((entry: any) => (
                            <div key={entry.id} className="flex items-start gap-3">
                              <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                                <span className="material-symbols-outlined text-[16px]">{entry.icon || 'radio_button_checked'}</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-gray-900 dark:text-white">{entry.domain || 'event'}</p><span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(entry.occurred_at)}</span></div>
                                <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">{entry.content}</p>
                              </div>
                            </div>
                          )) : <p className="text-sm text-gray-500 dark:text-gray-400">No timeline entries available.</p>}
                        </div>
                      </section>

                      <section className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                          <h3 className="text-xs font-semibold text-gray-900 dark:text-white">Decision</h3>
                          <span className="material-symbols-outlined text-gray-400 text-[18px]">gavel</span>
                        </div>
                        <div className="p-4">
                          {selectedApproval.status !== 'pending' ? (
                            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                              This approval is already {titleCase(selectedApproval.status || 'processed')}{selectedApproval.decision_by ? ` by ${selectedApproval.decision_by}` : ''}.
                              {selectedApproval.decision_note ? <span className="block mt-1">Note: {selectedApproval.decision_note}</span> : null}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-3">
                              {decisionError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/30 dark:bg-rose-900/15 dark:text-rose-300">{decisionError}</div>}
                              <div className="flex flex-wrap gap-3">
                                <button type="button" onClick={() => void handleDecision('rejected')} disabled={deciding} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"><span className="material-symbols-outlined text-[18px]">close</span>Reject</button>
                                <button type="button" onClick={() => void handleDecision('approved')} disabled={deciding} className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 transition-colors disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"><span className="material-symbols-outlined text-[18px]">check</span>Approve</button>
                              </div>
                              <p className="text-xs text-gray-500 dark:text-gray-400">The decision updates the approval record, the case history, and the linked execution plan if one exists.</p>
                            </div>
                          )}
                        </div>
                      </section>
                    </div>
                  </div>
                </motion.section>
              </AnimatePresence>
            ) : (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-card-dark px-5 py-8 text-sm text-gray-500 dark:text-gray-400">
                Select an approval to inspect the request and make a decision.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
