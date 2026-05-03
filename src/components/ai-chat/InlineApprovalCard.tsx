import React, { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, Check, X, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { approvalsApi } from '../../api/client';

/**
 * Inline approval card for the Super Agent chat.
 *
 * Renders when the plan engine returns `status: 'pending_approval'` with one
 * or more `approvalIds`. Fetches each approval row, shows what's being
 * proposed, why the policy gated it, and gives the user an Approve / Reject
 * button without leaving the chat.
 *
 * On approve, the backend's `applyPostApprovalDecision` re-runs the original
 * action (refund, cancel, etc.) and emits an audit event. The card swaps to
 * a success/failure state.
 */

type ApprovalRow = {
  id: string;
  case_id?: string | null;
  action_type: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | string;
  requested_by?: string | null;
  requested_at?: string | null;
  decided_by?: string | null;
  decided_at?: string | null;
  decision_note?: string | null;
  risk_level?: string | null;
  action_payload?: Record<string, unknown> | null;
  rationale?: string | null;
  policy_reason?: string | null;
  evidence_package?: Record<string, unknown> | null;
};

type CardState = 'loading' | 'pending' | 'submitting' | 'approved' | 'rejected' | 'error';

export const InlineApprovalCard: React.FC<{
  approvalId: string;
  onResolved?: (id: string, decision: 'approved' | 'rejected') => void;
}> = ({ approvalId, onResolved }) => {
  const [state, setState] = useState<CardState>('loading');
  const [row, setRow] = useState<ApprovalRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    approvalsApi
      .get(approvalId)
      .then((data: ApprovalRow) => {
        if (cancelled) return;
        setRow(data);
        if (data.status === 'approved') setState('approved');
        else if (data.status === 'rejected' || data.status === 'expired') setState('rejected');
        else setState('pending');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load approval');
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [approvalId]);

  const summary = useMemo(() => buildSummary(row), [row]);

  async function decide(decision: 'approved' | 'rejected') {
    if (!row || state === 'submitting') return;
    setState('submitting');
    try {
      await approvalsApi.decide(row.id, decision, note.trim() || undefined);
      setState(decision);
      onResolved?.(row.id, decision);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decision failed');
      setState('pending');
    }
  }

  // ── Render states ─────────────────────────────────────────────────────────

  if (state === 'loading') {
    return (
      <div className="ai-chat-message-in flex items-center gap-2 rounded-2xl border border-stone-200 bg-stone-50/60 px-4 py-3 text-[13px] text-stone-500 dark:border-stone-700 dark:bg-stone-900/40 dark:text-stone-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading approval request…</span>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="ai-chat-message-in rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        Couldn't load this approval — {error}
      </div>
    );
  }

  // After-decision compact state
  if (state === 'approved' || state === 'rejected') {
    const isApproved = state === 'approved';
    return (
      <div
        className={[
          'ai-chat-message-in flex items-center gap-2 rounded-2xl border px-4 py-3 text-[13px]',
          isApproved
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
            : 'border-stone-200 bg-stone-50 text-stone-600 dark:border-stone-700 dark:bg-stone-900/40 dark:text-stone-400',
        ].join(' ')}
      >
        {isApproved ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
        <span className="font-medium">
          {isApproved ? 'Approved' : 'Rejected'} — {summary.title}
        </span>
        {row?.decision_note ? (
          <span className="text-stone-500 dark:text-stone-400">· {row.decision_note}</span>
        ) : null}
      </div>
    );
  }

  // Pending — the main card
  return (
    <div className="ai-chat-message-in rounded-2xl border border-amber-200/80 bg-gradient-to-b from-amber-50 to-white p-4 shadow-sm dark:border-amber-900/60 dark:from-amber-950/40 dark:to-transparent">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
          <ShieldAlert className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[13px] font-semibold text-stone-900 dark:text-stone-100">
              {summary.title}
            </span>
            {row?.risk_level ? (
              <span className="text-[11px] uppercase tracking-wider text-stone-500 dark:text-stone-400">
                {row.risk_level} risk
              </span>
            ) : null}
          </div>
          {summary.subtitle ? (
            <p className="mt-0.5 text-[13px] text-stone-600 dark:text-stone-400">{summary.subtitle}</p>
          ) : null}
          {summary.policyReason ? (
            <p className="mt-2 text-[12px] text-amber-800 dark:text-amber-300">
              <span className="font-medium">Why approval is needed:</span> {summary.policyReason}
            </p>
          ) : null}
        </div>
      </div>

      {/* Detail toggle */}
      {summary.detailItems.length > 0 ? (
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 text-[12px] text-stone-500 transition-colors hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
        >
          {showDetails ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {showDetails ? 'Hide details' : `View ${summary.detailItems.length} detail${summary.detailItems.length === 1 ? '' : 's'}`}
        </button>
      ) : null}

      {showDetails && summary.detailItems.length > 0 ? (
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-xl bg-white/60 p-3 text-[12px] dark:bg-stone-900/40 sm:grid-cols-2">
          {summary.detailItems.map(({ label, value }) => (
            <div key={label} className="flex flex-col">
              <dt className="text-stone-500 dark:text-stone-400">{label}</dt>
              <dd className="break-words font-mono text-[12px] text-stone-800 dark:text-stone-200">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {/* Reject form (only visible after the user clicks Reject) */}
      {rejectMode ? (
        <div className="mt-3 space-y-2">
          <label className="block text-[12px] text-stone-600 dark:text-stone-400">
            Reason (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Customer not in good standing"
            className="w-full resize-none rounded-lg border border-stone-200 bg-white px-3 py-2 text-[13px] text-stone-800 outline-none placeholder:text-stone-400 focus:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
            rows={2}
          />
        </div>
      ) : null}

      {/* Action buttons */}
      <div className="mt-4 flex items-center justify-end gap-2">
        {!rejectMode ? (
          <>
            <button
              type="button"
              onClick={() => setRejectMode(true)}
              disabled={state === 'submitting'}
              className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              <X className="h-3.5 w-3.5" />
              Reject
            </button>
            <button
              type="button"
              onClick={() => decide('approved')}
              disabled={state === 'submitting'}
              className="inline-flex items-center gap-1 rounded-full bg-stone-900 px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-stone-800 disabled:opacity-50 dark:bg-amber-600 dark:hover:bg-amber-500"
            >
              {(state as CardState) === 'submitting' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Approve & execute
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setRejectMode(false);
                setNote('');
              }}
              disabled={state === 'submitting'}
              className="inline-flex items-center rounded-full border border-stone-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => decide('rejected')}
              disabled={state === 'submitting'}
              className="inline-flex items-center gap-1 rounded-full bg-red-600 px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {(state as CardState) === 'submitting' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
              Confirm rejection
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ── Helpers ────────────────────────────────────────────────────────────────

function buildSummary(row: ApprovalRow | null): {
  title: string;
  subtitle: string | null;
  policyReason: string | null;
  detailItems: Array<{ label: string; value: string }>;
} {
  if (!row) {
    return { title: 'Action requires approval', subtitle: null, policyReason: null, detailItems: [] };
  }

  const payload = (row.action_payload || {}) as Record<string, any>;
  const action = row.action_type || 'unknown action';

  let title = `${prettifyActionType(action)} requires approval`;
  let subtitle: string | null = null;
  const detailItems: Array<{ label: string; value: string }> = [];

  if (action === 'refund' || action === 'payment.refund') {
    const amount = payload.amount ?? payload.refund_amount;
    const currency = (payload.currency || 'USD').toUpperCase();
    const paymentId = payload.payment_id || payload.paymentId;
    title = amount != null ? `Refund ${formatMoney(amount, currency)}` : 'Refund payment';
    if (paymentId) subtitle = `Payment ${paymentId}`;
    if (payload.reason) detailItems.push({ label: 'Reason', value: String(payload.reason) });
    if (payload.refund_type) detailItems.push({ label: 'Type', value: String(payload.refund_type) });
  } else if (action === 'order_cancel' || action === 'order.cancel') {
    const orderId = payload.order_id || payload.orderId;
    title = 'Cancel order';
    if (orderId) subtitle = `Order ${orderId}`;
    if (payload.fulfillment_status) {
      detailItems.push({ label: 'Fulfilment', value: String(payload.fulfillment_status) });
    }
    if (payload.reason) detailItems.push({ label: 'Reason', value: String(payload.reason) });
  } else {
    title = `${prettifyActionType(action)} requires approval`;
    if (payload.summary) subtitle = String(payload.summary);
  }

  if (row.case_id) detailItems.push({ label: 'Case', value: row.case_id });
  if (row.requested_by) detailItems.push({ label: 'Requested by', value: row.requested_by });
  if (row.requested_at) detailItems.push({ label: 'Requested', value: formatTimeAgo(row.requested_at) });

  // Surface raw payload keys we haven't already shown, capped at 4
  const shownKeys = new Set([
    'amount',
    'refund_amount',
    'currency',
    'payment_id',
    'paymentId',
    'order_id',
    'orderId',
    'reason',
    'refund_type',
    'fulfillment_status',
    'summary',
  ]);
  for (const [k, v] of Object.entries(payload)) {
    if (shownKeys.has(k) || v == null) continue;
    if (detailItems.length >= 8) break;
    const value = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (value.length === 0) continue;
    detailItems.push({ label: prettifyKey(k), value: value.length > 80 ? `${value.slice(0, 80)}…` : value });
  }

  const policyReason =
    row.policy_reason
    || row.rationale
    || (row.risk_level && row.risk_level !== 'low'
      ? `Risk level "${row.risk_level}" — policy requires a human approver before this runs.`
      : null);

  return { title, subtitle, policyReason, detailItems };
}

function prettifyActionType(action: string): string {
  return action
    .split('.')
    .map((p) => p.replace(/_/g, ' '))
    .join(' · ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

function prettifyKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function formatMoney(amount: number | string, currency: string): string {
  const numeric = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(numeric)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${numeric} ${currency}`;
  }
}

function formatTimeAgo(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return iso;
  const diff = Date.now() - ts;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
