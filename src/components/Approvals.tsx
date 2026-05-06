import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { approvalsApi } from '../api/client';
import { useApi, useMutation } from '../api/hooks';
import { ActionModal, type ModalConsideration, type ModalContextItem, type ModalStep, type ModalVariant } from './ActionModal';
import LoadingState from './LoadingState';
import type { NavigateFn } from '../types';

type ApprovalStatus = 'pending' | 'approved' | 'rejected';
type Decision = 'approved' | 'rejected';
type FocusItem = {
  title: string;
  subtitle: string;
  detail: string;
  kind: string;
};
type ApprovalModalAction = 'approve' | 'reject' | null;

interface ApprovalsProps {
  onNavigate?: NavigateFn;
  focusApprovalId?: string | null;
}

// Shape of approval rows after src/api/normalize.ts converts the snake_case
// API payload to camelCase.
type ApprovalRecord = {
  id: string;
  caseId?: string | null;
  caseNumber?: string | null;
  customerName?: string | null;
  customerSegment?: string | null;
  actionType?: string | null;
  riskLevel?: string | null;
  status?: string | null;
  priority?: string | null;
  assignedTo?: string | null;
  assignedTeamId?: string | null;
  assignedUserName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  decisionBy?: string | null;
  decisionNote?: string | null;
  executionPlanId?: string | null;
  expiresAt?: string | null;
  actionPayload?: Record<string, any> | null;
  evidencePackage?: Record<string, any> | null;
  /**
   * Connector writeback status for approved decisions. Returned by the
   * backend by reading the underlying entity (payment.refund_status,
   * order.system_states.oms). Drives the "Writeback pending / failed"
   * badge on the approval card.
   */
  writeback?: {
    status: 'not_applicable' | 'completed' | 'pending' | 'failed' | 'unknown';
    executedVia?: 'stripe' | 'shopify' | 'woocommerce' | 'db-only' | null;
    externalId?: string | null;
    error?: string | null;
  } | null;
};

type ApprovalContext = {
  approval: ApprovalRecord;
  case?: any;
  customer?: any;
  caseState?: any;
  conversation?: any;
  messages?: any[];
  internalNotes?: any[];
  evidence?: { approvals?: any[]; reconciliationIssues?: any[]; linkedCases?: any[] };
} | null;

const titleCase = (value: string) => value
  .replace(/[_-]+/g, ' ')
  .split(' ')
  .filter(Boolean)
  .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
  .join(' ');

const formatDate = (value?: string | null) => (
  value ? new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) : 'N/A'
);

const formatMoney = (value: any) => {
  if (value === null || value === undefined || value === '') return 'N/A';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: numeric % 1 === 0 ? 0 : 2,
  }).format(numeric);
};

const statusStyles = (status?: string | null) => {
  if (status === 'approved') return 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/30';
  if (status === 'rejected') return 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800/30';
  return 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/30';
};

const statusLabel = (status?: string | null) => titleCase(status || 'pending');

const extractSummary = (item: ApprovalRecord) => item.evidencePackage?.summary
  || item.actionPayload?.summary
  || item.actionPayload?.reason
  || item.actionType
  || 'Approval required';

function normalizeApproval(item: any): ApprovalRecord {
  return {
    id: item.id,
    caseId: item.caseId || null,
    caseNumber: item.caseNumber || null,
    customerName: item.customerName || null,
    customerSegment: item.customerSegment || null,
    actionType: item.actionType || null,
    riskLevel: item.riskLevel || null,
    status: item.status || 'pending',
    priority: item.priority || 'normal',
    assignedTo: item.assignedTo || null,
    assignedTeamId: item.assignedTeamId || null,
    assignedUserName: item.assignedUserName || null,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
    decisionBy: item.decisionBy || null,
    decisionNote: item.decisionNote || null,
    executionPlanId: item.executionPlanId || null,
    expiresAt: item.expiresAt || null,
    actionPayload: item.actionPayload || {},
    evidencePackage: item.evidencePackage || {},
    writeback: item.writeback || null,
  };
}

// Visual styles for the writeback badge. The 4 distinct states map to
// different colours so a manager can scan the queue and instantly tell
// which approvals still need connector reconciliation.
function writebackBadge(wb: ApprovalRecord['writeback']) {
  if (!wb || wb.status === 'not_applicable') return null;
  const labels: Record<string, { label: string; cls: string; dot: string; title: string }> = {
    completed: {
      label: wb.executedVia ? `Writeback ${wb.executedVia}` : 'Writeback complete',
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/30',
      dot: 'bg-emerald-500',
      title: wb.externalId ? `External id: ${wb.externalId}` : 'Connector confirmed the action',
    },
    pending: {
      label: 'Writeback pending',
      cls: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/30',
      dot: 'bg-amber-500',
      title: 'Approved locally; the connector has not confirmed yet (db-only or no connector configured)',
    },
    failed: {
      label: 'Writeback failed',
      cls: 'bg-red-50 text-red-700 border-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/30',
      dot: 'bg-red-500',
      title: wb.error ? `Connector error: ${wb.error}` : 'The connector returned an error during writeback',
    },
    unknown: {
      label: 'Writeback unknown',
      cls: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800/40 dark:text-gray-300 dark:border-gray-700',
      dot: 'bg-gray-400',
      title: 'Could not resolve the underlying payment/order to compute writeback',
    },
  };
  const info = labels[wb.status];
  if (!info) return null;
  return (
    <span
      title={info.title}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${info.cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${info.dot}`} />
      {info.label}
    </span>
  );
}

function SectionCard({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-card-dark overflow-hidden shadow-card">
      <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-gray-400 text-[18px]">{icon}</span>
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-700 dark:text-gray-200 truncate">{title}</h3>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <span className="text-xs uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm text-right text-gray-900 dark:text-white font-medium">{value}</span>
    </div>
  );
}

function LoadingPanel({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <div className="min-h-[220px] rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-5 py-6 dark:border-gray-700 dark:bg-gray-800/30">
      <div className="flex h-full min-h-[172px] flex-col items-center justify-center text-center">
        <span className="mb-4 h-8 w-8 rounded-full border-2 border-gray-300 border-t-gray-700 dark:border-gray-600 dark:border-t-gray-200 animate-spin" />
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{label}</p>
        <p className="mt-1 max-w-sm text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</p>
      </div>
    </div>
  );
}

export default function Approvals({ onNavigate, focusApprovalId }: ApprovalsProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ApprovalStatus>('pending');
  const [query, setQuery] = useState('');
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [focusedItem, setFocusedItem] = useState<FocusItem | null>(null);
  const [activeModal, setActiveModal] = useState<ApprovalModalAction>(null);
  const PAGE_SIZE = 50;
  const [offset, setOffset] = useState(0);

  const requestRef = useRef<HTMLDivElement | null>(null);
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const evidenceRef = useRef<HTMLDivElement | null>(null);
  const policyRef = useRef<HTMLDivElement | null>(null);
  const systemsRef = useRef<HTMLDivElement | null>(null);

  const { data: apiApprovalsPage, loading, error, refetch } = useApi(
    () => approvalsApi.list({ limit: PAGE_SIZE, offset }),
    [offset],
    { items: [], total: 0, hasMore: false, limit: PAGE_SIZE, offset } as any,
  );
  const apiApprovals = Array.isArray((apiApprovalsPage as any)?.items) ? (apiApprovalsPage as any).items : [];
  const totalApprovals = typeof (apiApprovalsPage as any)?.total === 'number' ? (apiApprovalsPage as any).total : apiApprovals.length;
  const hasMore = Boolean((apiApprovalsPage as any)?.hasMore);
  const approvals = useMemo(
    () => apiApprovals.map(normalizeApproval)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
    [apiApprovalsPage],
  );

  useEffect(() => {
    if (selectedId && !approvals.some((item) => item.id === selectedId)) {
      setSelectedId(null);
    }
  }, [approvals, selectedId]);

  useEffect(() => {
    if (!focusApprovalId) return;
    if (selectedId !== focusApprovalId) {
      setSelectedId(focusApprovalId);
    }
  }, [focusApprovalId, selectedId]);

  const selectedApproval = useMemo(
    () => approvals.find((item) => item.id === selectedId) || null,
    [approvals, selectedId],
  );

  const { data: selectedContext, loading: contextLoading, error: contextError, refetch: refetchContext } = useApi<ApprovalContext>(
    () => (selectedId ? approvalsApi.context(selectedId) : Promise.resolve(null)),
    [selectedId],
    null,
  );

  const { mutate: decide, loading: deciding } = useMutation(
    ({ id, decision, note }: { id: string; decision: Decision; note?: string }) => approvalsApi.decide(id, decision, note, 'Admin'),
  );

  useEffect(() => {
    setDecisionNote(selectedApproval?.decisionNote || '');
    setDecisionError(null);
    setFocusedItem(null);
  }, [selectedApproval?.id]);

  const counts = useMemo(() => ({
    pending: approvals.filter((item) => item.status === 'pending').length,
    approved: approvals.filter((item) => item.status === 'approved').length,
    rejected: approvals.filter((item) => item.status === 'rejected').length,
  }), [approvals]);

  const filteredApprovals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return approvals.filter((item) => {
      if ((item.status || 'pending') !== filter) return false;
      if (!q) return true;
      return [item.id, item.caseNumber, item.customerName, item.assignedUserName, item.actionType]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [approvals, filter, query]);

  const selectedCase = selectedContext?.case || null;
  const selectedCustomer = selectedContext?.customer || null;
  const selectedMessages = Array.isArray(selectedContext?.messages) ? selectedContext.messages : [];
  const linkedApprovals = Array.isArray(selectedContext?.evidence?.approvals) ? selectedContext.evidence.approvals : [];
  const reconciliationIssues = Array.isArray(selectedContext?.evidence?.reconciliationIssues) ? selectedContext.evidence.reconciliationIssues : [];
  const linkedCases = Array.isArray(selectedContext?.evidence?.linkedCases) ? selectedContext.evidence.linkedCases : [];
  const timeline = Array.isArray(selectedContext?.caseState?.timeline) ? selectedContext.caseState.timeline.slice(-8).reverse() : [];
  const systems = selectedContext?.caseState?.systems ? Object.values(selectedContext.caseState.systems) : [];
  const evidenceNotes = selectedApproval?.evidencePackage?.notes || selectedApproval?.actionPayload?.notes || selectedApproval?.actionPayload?.policyNotes || null;
  const policyText = selectedApproval?.evidencePackage?.policyText
    || selectedApproval?.actionPayload?.policyText
    || selectedApproval?.actionPayload?.reason
    || 'A human manager must review this action before any connector writeback is executed.';
  const caseId = selectedCase?.id || selectedApproval?.caseId || null;
  const caseNumber = selectedCase?.caseNumber || selectedApproval?.caseNumber || selectedApproval?.caseId || 'N/A';
  const customerName = selectedCustomer?.canonicalName || selectedApproval?.customerName || 'Unknown customer';
  const customerSegment = selectedCustomer?.segment || selectedApproval?.customerSegment || 'N/A';
  const approvalTitle = titleCase(selectedApproval?.actionType || 'Approval');
  const approvalSummary = extractSummary(selectedApproval || normalizeApproval({}));
  const approvalAmount = selectedApproval?.actionPayload?.amount || selectedApproval?.actionPayload?.refundAmount || selectedApproval?.actionPayload?.goodwillCreditAmount || null;
  const selectedStatus = selectedApproval?.status || 'pending';
  const approvalContextItems: ModalContextItem[] = selectedApproval ? [
    { label: 'Action', value: titleCase(selectedApproval.actionType || 'Approval') },
    { label: 'Case', value: caseNumber },
    { label: 'Customer', value: customerName },
    { label: 'Risk', value: titleCase(selectedApproval.riskLevel || 'Unknown'), accent: (selectedApproval.riskLevel || '').toLowerCase() === 'high' },
  ] : [];

  const approvalModalConfig = useMemo(() => {
    if (!selectedApproval || !activeModal) return null;

    const isApprove = activeModal === 'approve';
    return {
      variant: isApprove ? 'default' as ModalVariant : 'danger' as ModalVariant,
      icon: isApprove ? 'check' : 'close',
      title: isApprove ? 'Approve this request' : 'Reject this request',
      subtitle: isApprove
        ? 'Confirm the approval path and propagate the decision to the approval record, case history and linked execution plan.'
        : 'Reject the request and record a clear denial path for the approval record, case history and linked workflow.',
      confirmLabel: isApprove ? 'Approve request' : 'Reject request',
      steps: [
        {
          text: isApprove ? 'Persist the approval decision' : 'Persist the rejection decision',
          detail: isApprove
            ? 'The approval record will move to an approved state and the backend will unlock the linked next step.'
            : 'The approval record will move to a rejected state and the blocked action path will remain denied.',
        },
        {
          text: 'Update the case history',
          detail: 'The audit trail and decision note will be attached to the case timeline for later review.',
        },
        {
          text: isApprove ? 'Resume the linked execution plan if it exists' : 'Stop the linked execution plan from continuing automatically',
          detail: isApprove
            ? 'Any pending execution plan can continue once this human decision is confirmed.'
            : 'Downstream writebacks stay halted so operators can reassess the case safely.',
        },
      ] as ModalStep[],
      considerations: isApprove
        ? [
            { text: 'Make sure the policy reason and the evidence shown on this screen still match the intended outcome.' },
            { text: 'Approval can resume backend writebacks and linked operational automations.' },
          ] as ModalConsideration[]
        : [
            { text: 'Rejecting keeps the sensitive action blocked and may require a manual follow-up with the customer or operations team.' },
            { text: 'Use the note field to explain the rejection clearly for the audit trail.' },
          ] as ModalConsideration[],
      noteLabel: 'Decision note',
      notePlaceholder: isApprove
        ? 'Explain why this request is safe to approve.'
        : 'Explain why this request should be rejected.',
      onConfirm: async () => {
        await handleDecision(isApprove ? 'approved' : 'rejected');
        setActiveModal(null);
      },
    };
  }, [activeModal, caseNumber, customerName, selectedApproval, selectedStatus]);

  const focusArtifact = (item: FocusItem, ref?: React.RefObject<HTMLDivElement>) => {
    setFocusedItem(item);
    ref?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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

  const openCaseGraph = (focusId?: string | null) => {
    if (!caseId) return;
    onNavigate?.('case_graph', focusId || caseId);
  };

  const openInbox = () => {
    if (!caseId) return;
    onNavigate?.('inbox', caseId);
  };

  const openKnowledge = () => {
    onNavigate?.('knowledge');
  };

  if (loading && approvals.length === 0) {
    return (
      <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
        <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">
          <LoadingState title="Loading approvals" message="Fetching live approval requests from Supabase." />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">
        <div className="p-6 pb-0 flex-shrink-0 z-20">
          <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card">
            <div className="px-6 py-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Approvals</h1>
                <p className="text-xs text-gray-500 mt-0.5">Inspect live case context, decide, and keep the audit trail in the backend.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative w-64">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-lg">search</span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search approvals..."
                    className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white transition-all"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Refresh
                </button>
              </div>
            </div>
            <div className="px-6 flex items-center gap-6 border-t border-gray-100 dark:border-gray-800 pt-3">
              {(['pending', 'approved', 'rejected'] as ApprovalStatus[]).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => { setFilter(status); setOffset(0); }}
                  className={`pb-3 text-sm transition-colors border-b-2 ${
                    filter === status
                      ? 'font-semibold text-gray-900 dark:text-white border-black dark:border-white'
                      : 'font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border-transparent hover:border-gray-300'
                  }`}
                >
                  {titleCase(status)} {status === 'pending' ? `(${counts.pending})` : status === 'approved' ? `(${counts.approved})` : `(${counts.rejected})`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {error && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/30 dark:bg-amber-900/15 dark:text-amber-300">
              Unable to load approvals: {error}
            </div>
          )}

          {!selectedApproval ? (
            <section className="w-full bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Queue</h2>
                <span className="text-xs text-gray-500">
                  {filteredApprovals.length} of {totalApprovals} items
                  {totalApprovals > 0 ? ` · page ${Math.floor(offset / PAGE_SIZE) + 1}` : ''}
                </span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredApprovals.length === 0 ? (
                  <div className="p-5 text-sm text-gray-500 dark:text-gray-400">No approvals match this filter.</div>
                ) : filteredApprovals.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className="w-full text-left px-5 py-4 transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-800/40"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{titleCase(item.actionType || 'Approval')}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${statusStyles(item.status)}`}>{statusLabel(item.status)}</span>
                          {writebackBadge(item.writeback)}
                        </div>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 truncate">
                          {item.customerName || 'Unknown customer'}
                          {item.caseNumber ? ` · ${item.caseNumber}` : ''}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-500 truncate">{extractSummary(item)}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{item.riskLevel ? titleCase(item.riskLevel) : 'Risk unknown'}</p>
                        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{formatDate(item.createdAt)}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {totalApprovals > 0
                    ? `Showing ${Math.min(offset + 1, totalApprovals)}–${Math.min(offset + PAGE_SIZE, totalApprovals)} of ${totalApprovals}`
                    : 'No items'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
                    disabled={offset === 0 || loading}
                    className="px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setOffset((value) => value + PAGE_SIZE)}
                    disabled={!hasMore || loading}
                    className="px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedApproval.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="space-y-6"
              >
                <section className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card">
                  <div className="px-6 py-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setSelectedId(null)}
                          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                          Back to list
                        </button>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-[0.18em] border ${statusStyles(selectedApproval.status)}`}>
                          {statusLabel(selectedApproval.status)}
                        </span>
                        {writebackBadge(selectedApproval.writeback)}
                        <span className="text-xs text-gray-500 dark:text-gray-400">Created {formatDate(selectedApproval.createdAt)}</span>
                      </div>
                      <h2 className="mt-4 text-2xl font-semibold text-gray-900 dark:text-white tracking-[-0.02em]">
                        {approvalTitle} {approvalAmount ? `· ${formatMoney(approvalAmount)}` : ''}
                      </h2>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[18px]">person</span>
                          For <span className="font-medium text-gray-900 dark:text-white">{customerName}</span>
                          {selectedCustomer?.company ? <span className="text-gray-400">({selectedCustomer.company})</span> : null}
                        </span>
                        <span className="text-gray-300 dark:text-gray-600">•</span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[18px] text-violet-500">smart_toy</span>
                          Requested by <span className="font-medium text-violet-600 dark:text-violet-400">{selectedApproval.assignedUserName || selectedApproval.assignedTo || 'Autopilot'}</span>
                        </span>
                        <span className="text-gray-300 dark:text-gray-600">•</span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                          {caseNumber}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-start lg:items-end gap-3">
                      <div className="flex flex-wrap gap-2.5">
                        <button
                          type="button"
                          onClick={() => setActiveModal('reject')}
                          disabled={deciding || selectedStatus !== 'pending'}
                          className="px-4 py-2.5 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-400 text-sm font-semibold rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors shadow-sm inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="material-symbols-outlined text-[18px]">close</span>
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveModal('approve')}
                          disabled={deciding || selectedStatus !== 'pending'}
                          className="px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-black text-sm font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors shadow-lg shadow-gray-200 dark:shadow-none inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <span className="material-symbols-outlined text-[18px]">check</span>
                          Approve
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {selectedStatus === 'pending'
                          ? 'Approving updates the case, workflow, and linked records in the backend.'
                          : `This approval is already ${statusLabel(selectedStatus).toLowerCase()}${selectedApproval.decisionBy ? ` by ${selectedApproval.decisionBy}` : ''}.`}
                      </p>
                    </div>
                  </div>
                </section>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-7 space-y-6">
                    <div ref={requestRef}>
                      <SectionCard
                        title="Request"
                        icon="fact_check"
                        action={(
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openInbox()}
                              className="text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                            >
                              Open inbox
                            </button>
                            <button
                              type="button"
                              onClick={() => openCaseGraph(caseId)}
                              className="text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                            >
                              Open case graph
                            </button>
                          </div>
                        )}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                          <FieldRow label="Action" value={titleCase(selectedApproval.actionType || 'Approval')} />
                          <FieldRow label="Case" value={caseNumber} />
                          <FieldRow label="Risk" value={titleCase(selectedApproval.riskLevel || 'unknown')} />
                          <FieldRow label="Due" value={formatDate(selectedApproval.expiresAt)} />
                          <FieldRow label="Assigned to" value={selectedApproval.assignedUserName || selectedApproval.assignedTo || 'Unassigned'} />
                          <FieldRow label="Team" value={selectedApproval.assignedTeamId || 'Operations'} />
                          <div className="md:col-span-2 py-2 border-b border-gray-100 dark:border-gray-800">
                            <p className="text-xs uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Policy reason</p>
                            <p className="mt-2 text-sm leading-6 text-gray-900 dark:text-white">{approvalSummary}</p>
                          </div>
                          <div className="md:col-span-2 py-2">
                            <p className="text-xs uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Decision note</p>
                            <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-300">{selectedApproval.decisionNote || 'Pending decision'}</p>
                          </div>
                        </div>
                      </SectionCard>
                    </div>

                    <div ref={conversationRef}>
                      <SectionCard
                        title="Conversation"
                        icon="forum"
                        action={(
                          <button
                            type="button"
                            onClick={() => {
                              const latest = selectedMessages.at(-1);
                              if (latest) {
                                focusArtifact(
                                  {
                                    title: latest.senderName || latest.senderId || 'Message',
                                    subtitle: latest.direction || latest.type || 'message',
                                    detail: latest.content,
                                    kind: 'Conversation',
                                  },
                                  conversationRef,
                                );
                              } else {
                                focusArtifact(
                                  { title: 'Conversation', subtitle: 'No messages', detail: 'No conversation messages returned yet.', kind: 'Conversation' },
                                  conversationRef,
                                );
                              }
                            }}
                            className="text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                          >
                            Focus latest
                          </button>
                        )}
                      >
                        <div className="space-y-3">
                          {contextLoading ? (
                            <LoadingPanel
                              label="Loading conversation"
                              description="Gathering messages, participants and the latest context so this card lands directly in its final shape."
                            />
                          ) : selectedMessages.length ? selectedMessages.map((message: any) => (
                            <button
                              key={message.id}
                              type="button"
                              onClick={() => focusArtifact(
                                {
                                  title: message.senderName || message.senderId || 'Message',
                                  subtitle: message.direction || message.type || 'message',
                                  detail: message.content,
                                  kind: 'Conversation',
                                },
                                conversationRef,
                              )}
                              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/40 p-4 text-left transition-colors hover:border-gray-300 dark:hover:border-gray-600"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">{message.senderName || message.senderId || 'System'}</p>
                                <span className="text-[11px] uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">{message.direction || message.type || 'message'}</span>
                              </div>
                              <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 leading-6">{message.content}</p>
                              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{formatDate(message.sentAt || message.createdAt)}</p>
                            </button>
                          )) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400">No conversation messages returned yet.</p>
                          )}
                        </div>
                      </SectionCard>
                    </div>

                    <div ref={timelineRef}>
                      <SectionCard
                        title="Timeline"
                        icon="history"
                        action={(
                          <button
                            type="button"
                            onClick={() => {
                              const latest = timeline[0];
                              if (latest) {
                                focusArtifact(
                                  {
                                    title: latest.domain || 'Event',
                                    subtitle: latest.type || 'timeline',
                                    detail: latest.content,
                                    kind: 'Timeline',
                                  },
                                  timelineRef,
                                );
                              }
                            }}
                            className="text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                          >
                            Focus latest
                          </button>
                        )}
                      >
                        <div className="space-y-4">
                          {contextLoading ? (
                            <LoadingPanel
                              label="Loading timeline"
                              description="Collecting the latest case events and approval-linked state transitions before rendering the timeline."
                            />
                          ) : timeline.length ? timeline.map((entry: any) => (
                            <button
                              key={entry.id}
                              type="button"
                              onClick={() => focusArtifact(
                                {
                                  title: entry.domain || 'Event',
                                  subtitle: entry.type || 'timeline',
                                  detail: entry.content,
                                  kind: 'Timeline',
                                },
                                timelineRef,
                              )}
                              className="w-full flex items-start gap-3 text-left rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3 transition-colors hover:border-gray-300 dark:hover:border-gray-600"
                            >
                              <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                                <span className="material-symbols-outlined text-[16px]">{entry.icon || 'radio_button_checked'}</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm font-medium text-gray-900 dark:text-white">{entry.domain || 'event'}</p>
                                  <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(entry.occurredAt)}</span>
                                </div>
                                <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400 leading-6">{entry.content}</p>
                              </div>
                            </button>
                          )) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400">No timeline entries available.</p>
                          )}
                        </div>
                      </SectionCard>
                    </div>
                  </div>

                  <div className="lg:col-span-5 space-y-6">
                    <div className="grid grid-cols-1 gap-6">
                      <SectionCard
                        title="Decision"
                        icon="gavel"
                        action={(
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${statusStyles(selectedStatus)}`}>
                            {statusLabel(selectedStatus)}
                          </span>
                        )}
                      >
                        {selectedStatus !== 'pending' ? (
                          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                            This approval is already {statusLabel(selectedStatus).toLowerCase()}
                            {selectedApproval.decisionBy ? ` by ${selectedApproval.decisionBy}` : ''}.
                            {selectedApproval.decisionNote ? <span className="block mt-1">Note: {selectedApproval.decisionNote}</span> : null}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {decisionError && (
                              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/30 dark:bg-rose-900/15 dark:text-rose-300">
                                {decisionError}
                              </div>
                            )}
                            <textarea
                              value={decisionNote}
                              onChange={(e) => setDecisionNote(e.target.value)}
                              className="w-full min-h-28 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 outline-none focus:border-gray-400 dark:focus:border-gray-500"
                              placeholder="Add a short note explaining the decision."
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Use the approval controls in the header to confirm or reject this request. The decision will update the approval record, the case history, and the linked execution plan if one exists.
                            </p>
                          </div>
                        )}
                      </SectionCard>

                      <div ref={policyRef}>
                        <SectionCard
                          title="Policy"
                          icon="policy"
                          action={(
                            <button
                              type="button"
                              onClick={openKnowledge}
                              className="text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                            >
                              Open knowledge
                            </button>
                          )}
                        >
                          <div className="space-y-4">
                            <div>
                              <p className="text-xs uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Triggering policy</p>
                              <h4 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{titleCase(selectedApproval.actionType || 'Approval')} policy review</h4>
                              <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-300">{policyText}</p>
                            </div>
                            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/40 px-4 py-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Why it escalated</p>
                              <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-300">
                                The agent path reached a manager gate because the case exceeded the safe automatic threshold and needs explicit human approval before writeback.
                              </p>
                            </div>
                          </div>
                        </SectionCard>
                      </div>

                      <div ref={systemsRef}>
                        <SectionCard
                          title="Systems"
                          icon="lan"
                          action={(
                            <button
                              type="button"
                              onClick={() => focusArtifact(
                                {
                                  title: 'Systems',
                                  subtitle: 'Backend state',
                                  detail: 'Current case state is synchronized across the connected systems below.',
                                  kind: 'Systems',
                                },
                                systemsRef,
                              )}
                              className="text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                            >
                              Focus state
                            </button>
                          )}
                        >
                          <div className="space-y-3">
                            {systems.length ? systems.map((system: any) => (
                              <button
                                key={system.key}
                                type="button"
                                onClick={() => focusArtifact(
                                  {
                                    title: system.label,
                                    subtitle: system.status,
                                    detail: system.summary,
                                    kind: 'Systems',
                                  },
                                  systemsRef,
                                )}
                                className="w-full flex items-start justify-between gap-4 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3 text-left transition-colors hover:border-gray-300 dark:hover:border-gray-600"
                              >
                                <div>
                                  <p className="text-sm font-medium text-gray-900 dark:text-white">{system.label}</p>
                                  <p className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">{system.summary}</p>
                                </div>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${statusStyles(system.status)}`}>
                                  {statusLabel(system.status)}
                                </span>
                              </button>
                            )) : (
                              <p className="text-sm text-gray-500 dark:text-gray-400">No system state returned yet.</p>
                            )}
                          </div>
                        </SectionCard>
                      </div>

                      <div ref={evidenceRef}>
                        <SectionCard
                          title="Evidence"
                          icon="article"
                          action={(
                            <button
                              type="button"
                              onClick={() => openCaseGraph(caseId)}
                              className="text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                            >
                              Open case graph
                            </button>
                          )}
                        >
                          <div className="space-y-3">
                            <button
                              type="button"
                              onClick={() => focusArtifact(
                                {
                                  title: customerName,
                                  subtitle: 'Customer profile',
                                  detail: selectedCustomer ? `Segment: ${customerSegment}.` : 'Customer profile available in the backend case context.',
                                  kind: 'Evidence',
                                },
                                evidenceRef,
                              )}
                              className="w-full flex items-center justify-between gap-4 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3 text-left transition-colors hover:border-gray-300 dark:hover:border-gray-600"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">Customer profile</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{customerName} · {customerSegment}</p>
                              </div>
                              <span className="material-symbols-outlined text-gray-300 text-sm">chevron_right</span>
                            </button>

                            {linkedCases.length > 0 ? linkedCases.map((item: any) => (
                              <button
                                key={`${item.id}-${item.linkType || 'case'}`}
                                type="button"
                                onClick={() => openCaseGraph(item.id)}
                                className="w-full flex items-center justify-between gap-4 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3 text-left transition-colors hover:border-gray-300 dark:hover:border-gray-600"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.caseNumber || item.id}</p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.type || item.linkType || 'Linked case'}</p>
                                </div>
                                <span className="material-symbols-outlined text-gray-300 text-sm">open_in_new</span>
                              </button>
                            )) : null}

                            {linkedApprovals.length > 0 ? linkedApprovals.map((item: any) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => focusArtifact(
                                  {
                                    title: item.id,
                                    subtitle: item.status || 'approval',
                                    detail: item.summary || item.reason || 'Related approval record',
                                    kind: 'Evidence',
                                  },
                                  evidenceRef,
                                )}
                                className="w-full flex items-center justify-between gap-4 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3 text-left transition-colors hover:border-gray-300 dark:hover:border-gray-600"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.id}</p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.status || 'approval'}</p>
                                </div>
                                <span className="material-symbols-outlined text-gray-300 text-sm">open_in_new</span>
                              </button>
                            )) : null}

                            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/40 px-4 py-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Internal note</p>
                              <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-300">
                                {evidenceNotes || 'The approval is backed by live backend context, case history, and the linked policy trail.'}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => openInbox()}
                                  className="text-xs font-semibold text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white transition-colors"
                                >
                                  Open inbox thread
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openCaseGraph(caseId)}
                                  className="text-xs font-semibold text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white transition-colors"
                                >
                                  Open backend case graph
                                </button>
                              </div>
                            </div>
                          </div>
                        </SectionCard>
                      </div>

                      {focusedItem && (
                        <SectionCard title="Focused item" icon="visibility">
                          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <p className="text-xs uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{focusedItem.kind}</p>
                                <h4 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{focusedItem.title}</h4>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{focusedItem.subtitle}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setFocusedItem(null)}
                                className="text-xs font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                              >
                                Clear
                              </button>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-gray-700 dark:text-gray-300">{focusedItem.detail}</p>
                          </div>
                        </SectionCard>
                      )}

                      {(contextLoading || contextError) && (
                        <SectionCard title="Backend load" icon="sync">
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {contextLoading ? 'Loading the full case context from the backend.' : contextError}
                          </div>
                        </SectionCard>
                      )}
                    </div>
                  </div>
                </div>

                {approvalModalConfig ? (
                  <ActionModal
                    open={Boolean(activeModal)}
                    onClose={() => setActiveModal(null)}
                    onConfirm={() => { void approvalModalConfig.onConfirm(); }}
                    loading={deciding}
                    variant={approvalModalConfig.variant}
                    icon={approvalModalConfig.icon}
                    title={approvalModalConfig.title}
                    subtitle={approvalModalConfig.subtitle}
                    context={approvalContextItems}
                    steps={approvalModalConfig.steps}
                    considerations={approvalModalConfig.considerations}
                    confirmLabel={approvalModalConfig.confirmLabel}
                    noteLabel={approvalModalConfig.noteLabel}
                    notePlaceholder={approvalModalConfig.notePlaceholder}
                    noteValue={activeModal === 'approve' || activeModal === 'reject' ? decisionNote : undefined}
                    onNoteChange={activeModal === 'approve' || activeModal === 'reject' ? setDecisionNote : undefined}
                  />
                ) : null}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
