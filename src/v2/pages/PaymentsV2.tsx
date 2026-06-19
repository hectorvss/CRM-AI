// PaymentsV2 — migrated by agent-payments-01.
// ─────────────────────────────────────────────────────────────────────────────
// What works (this iteration):
//   • Payment list from paymentsApi.list() with tab filtering
//     (all / refunds / disputes / reconciliation / blocked).
//   • Payment detail fetched via paymentsApi.get(id) when one is selected.
//   • Three action views in the detail header (View in {PSP} / Issue refund /
//     Reconcile), each with a confirm modal.
//   • Refund mutation via paymentsApi.refund().
//   • Reconciliation trigger via reconciliationApi.processOpen(caseId).
//   • Open gateway opens the PSP URL in a new tab.
//   • Right pane: Details tab (attributes, related cases, operational links)
//     + Copilot tab (aiApi.copilot — uses related case id when available).
// Pending for later iterations (still in src/components/Payments.tsx until migrated):
//   • Deep navigation from payments → orders / case_graph / inbox with entity
//     focus (V2App.navigate currently does not pass entityId).
//   • Advanced refund flow (paymentsApi.refundAdvanced — partial / exchange /
//     goodwill modes + replacement product picker).
//   • Internal notes editor (read-only mock now; needs a notes endpoint).
//   • Filter panel (status / risk / search) — not in original Payments either,
//     left as future enhancement matching InboxV2.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { Payment, PaymentTab } from '../../types';
import { paymentsApi, reconciliationApi, aiApi } from '../../api/client';
import { useApi, useMutation } from '../../api/hooks';

type RightTab = 'details' | 'copilot';
type ActionView = 'stripe' | 'refund' | 'reconcile';
type ConfirmModal = ActionView | null;
type CopilotMessage = { id: string; role: 'user' | 'assistant'; content: string; time: string };

// ── Helpers ─────────────────────────────────────────────────────────────────
const formatDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-';

const formatRelative = (v?: string | null) => {
  if (!v) return '-';
  const m = Math.max(1, Math.round((Date.now() - new Date(v).getTime()) / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
};

const titleCase = (v?: string | null) =>
  v ? v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'N/A';

function mapApiPayment(p: any): Payment {
  return {
    id: p.id,
    orderId: p.orderId || 'N/A',
    paymentId: p.externalPaymentId || p.id,
    customerName: p.customerName || 'Unknown',
    amount: `$${Number(p.amount || 0).toFixed(2)}`,
    currency: p.currency || 'USD',
    paymentMethod: p.paymentMethod || 'Unknown',
    psp: p.psp || 'Unknown',
    date: formatDate(p.createdAt),
    lastUpdate: formatRelative(p.lastUpdate),
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
    tab: (p.tab as PaymentTab) || 'all',
    conflictDetected: p.conflictDetected || '',
    recommendedNextAction: p.recommendedAction || '',
    context: p.canonicalContext?.caseState?.conflict?.rootCause || p.summary || '',
    systemStates: typeof p.systemStates === 'object' && p.systemStates ? p.systemStates : {
      oms: 'N/A', psp: p.status || 'N/A', refund: 'N/A', dispute: 'N/A', reconciliation: 'N/A', canonical: 'N/A',
    },
    relatedCases: Array.isArray(p.relatedCases) ? p.relatedCases.map((c: any) => ({
      id: c.caseNumber || c.id,
      type: c.type || 'Case',
      status: titleCase(c.status || 'open'),
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
  };
}

function getPaymentGatewayUrl(p: Payment) {
  const id = p.paymentId;
  const psp = (p.psp || '').toLowerCase();
  if (psp.includes('stripe')) return `https://dashboard.stripe.com/payments/${id}`;
  if (psp.includes('paypal')) return `https://www.paypal.com/activity/payment/${id}`;
  if (psp.includes('braintree')) return `https://www.braintreegateway.com/merchants/transactions/${id}`;
  return `https://dashboard.stripe.com/payments/${id}`;
}

// ── Sidebar (236px) — 5 payment tabs as filled-bold v2 nav items ────────────
function PaymentsSidebar({ activeTab, onTabChange, counts }: {
  activeTab: PaymentTab;
  onTabChange: (t: PaymentTab) => void;
  counts: Record<PaymentTab, number>;
}) {
  const itemCls = (active: boolean) =>
    `relative flex items-center gap-2 h-8 pl-3 pr-3 py-1 rounded-lg cursor-pointer text-[13px] w-full text-left transition-colors ${
      active ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]' : 'hover:bg-[#e9eae6]/40 text-[#1a1a1a]'
    }`;

  const tabs: Array<{ id: PaymentTab; label: string; icon: ReactNode }> = [
    { id: 'all',            label: 'Todos los pagos',
      icon: <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M2 4a1 1 0 011-1h10a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1V4zm1 2v1h10V6H3zm0 3v3h10V9H3z"/></svg> },
    { id: 'refunds',        label: 'Reembolsos',
      icon: <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M8 2a6 6 0 015.7 4H12v2h4V4h-2v1.3A7.5 7.5 0 008 .5v1.5zm0 12a6 6 0 01-5.7-4H4V8H0v4h2v-1.3A7.5 7.5 0 008 15.5V14z"/></svg> },
    { id: 'disputes',       label: 'Disputas',
      icon: <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#fa7938]"><path d="M8 1l7 13H1z"/></svg> },
    { id: 'reconciliation', label: 'Reconciliación',
      icon: <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M3.5 3.5a5.5 5.5 0 019.5 3.7l1.5-1V5h.5v3h-3v-.5h1.7A4.5 4.5 0 003.5 4.5v-1zm9 9a5.5 5.5 0 01-9.5-3.7l-1.5 1V11H1V8h3v.5H2.3A4.5 4.5 0 0012.5 11.5v1z"/></svg> },
    { id: 'blocked',        label: 'Bloqueados',
      icon: <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M8 1.5A6.5 6.5 0 1014.5 8 6.5 6.5 0 008 1.5zm0 1.5a5 5 0 014 8l-7-7a5 5 0 013-1zM4 5.5l7 7A5 5 0 014 5.5z"/></svg> },
  ];

  return (
    <div className="flex flex-col h-full w-[236px] bg-[#f8f8f7] border-r border-[#e9eae6] flex-shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 h-16 flex-shrink-0">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Pagos</span>
      </div>
      <div className="flex-1 overflow-y-auto pl-3 pr-3 pb-4 flex flex-col gap-0.5">
        {tabs.map(t => (
          <button key={t.id} onClick={() => onTabChange(t.id)} className={itemCls(activeTab === t.id)}>
            {t.icon}
            <span className="flex-1">{t.label}</span>
            <span className="text-[11px] text-[#646462] font-medium">{counts[t.id] ?? 0}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Payment list (middle, 271px) ────────────────────────────────────────────
function PaymentList({ payments, selectedId, onSelect }: {
  payments: Payment[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col h-full w-[271px] border-l border-[#e9eae6] bg-[#f8f8f7] flex-shrink-0">
      <div className="flex items-center justify-between px-3 py-3 h-16 flex-shrink-0">
        <span className="text-[16px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">{payments.length} pagos</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4 flex flex-col gap-0">
        {payments.length === 0 && (
          <div className="text-center text-[13px] text-[#646462] py-8">No hay pagos en este filtro</div>
        )}
        {payments.map((p, i) => {
          const isSelected = p.id === selectedId;
          const isFailureBadge = (b: string) => b === 'Conflict' || b === 'High Risk' || b === 'Blocked' || b === 'Refund Failed';
          return (
            <div key={p.id}>
              {i > 0 && <div className="flex justify-center py-0.5"><div className="w-[222px] h-[1px] bg-[#e9eae6]" /></div>}
              <button
                onClick={() => onSelect(p.id)}
                className={`relative flex flex-col gap-1 px-3 py-3 rounded-xl cursor-pointer w-full text-left ${
                  isSelected ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]' : 'hover:bg-white/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[13px] truncate ${isSelected ? 'font-semibold text-[#1a1a1a]' : 'font-bold text-[#1a1a1a]'}`}>
                    {p.customerName}
                  </span>
                  <span className="text-[11px] text-[#646462] flex-shrink-0 ml-2">{p.lastUpdate}</span>
                </div>
                <p className="text-[11px] text-[#646462] truncate font-mono">{p.paymentId}</p>
                <div className="flex items-center justify-between">
                  <p className="text-[12.5px] text-[#1a1a1a] truncate">{p.amount} {p.currency}</p>
                  <span className="text-[11px] text-[#646462]">{p.paymentStatus}</span>
                </div>
                {p.badges.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {p.badges.slice(0, 3).map(b => (
                      <span key={b} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        isFailureBadge(b) ? 'bg-[#fee2e2] text-[#9a3412]' : 'bg-[#f3f3f1] text-[#1a1a1a]'
                      }`}>
                        {b}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── v2 confirmation modal (replaces ActionModal) ────────────────────────────
function ConfirmModal({ open, title, subtitle, body, confirmLabel, variant = 'default', loading, onConfirm, onClose }: {
  open: boolean;
  title: string;
  subtitle: string;
  body: ReactNode;
  confirmLabel: string;
  variant?: 'default' | 'warning';
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  const confirmBtn = variant === 'warning'
    ? 'bg-[#9a3412] text-white hover:bg-[#7a2812]'
    : 'bg-[#1a1a1a] text-white hover:bg-black';
  return (
    <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-[16px] border border-[#e9eae6] shadow-xl p-6 w-[460px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-[18px] font-semibold tracking-[-0.4px] text-[#1a1a1a] mb-1">{title}</h2>
        <p className="text-[13px] text-[#646462] mb-4 leading-[18px]">{subtitle}</p>
        <div className="text-[13px] text-[#1a1a1a] leading-[20px] space-y-2">{body}</div>
        <div className="flex items-center justify-end gap-2 mt-6">
          <button onClick={onClose} disabled={loading} className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] hover:bg-[#ededea]">Cancelar</button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-3 h-8 rounded-full text-[13px] font-semibold ${loading ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed' : confirmBtn}`}
          >
            {loading ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detail pane: header, action views, timeline ─────────────────────────────
function DetailPane({ payment, loading, onAction, onRefresh }: {
  payment: Payment | null;
  loading: boolean;
  onAction: (msg: string, type: 'success' | 'error') => void;
  onRefresh: () => void;
}) {
  const [actionView, setActionView] = useState<ActionView>('stripe');
  const [confirmModal, setConfirmModal] = useState<ConfirmModal>(null);
  const refundMutation = useMutation<{ id: string; amount?: number; reason: string }, any>(
    ({ id, amount, reason }) => paymentsApi.refund(id, { amount, reason }),
  );
  const reconcileMutation = useMutation<string | undefined, any>((caseId) => reconciliationApi.processOpen(caseId));

  // Reset action view when payment changes
  useEffect(() => { setActionView('stripe'); }, [payment?.id]);

  if (!payment) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#646462] text-[13.5px]">
        Selecciona un pago
      </div>
    );
  }

  function handleStripe() {
    window.open(getPaymentGatewayUrl(payment!), '_blank', 'noopener,noreferrer');
    onAction(`Abierto ${payment!.psp} en una nueva pestaña`, 'success');
    setConfirmModal(null);
  }

  async function handleRefund() {
    const numericAmount = Number(payment!.amount.replace(/[^0-9.]/g, ''));
    const result = await refundMutation.mutate({
      id: payment!.id,
      amount: Number.isFinite(numericAmount) ? numericAmount : undefined,
      reason: 'Refund issued from PaymentsV2 workspace',
    });
    if (!result) {
      onAction(refundMutation.error || 'Error al emitir reembolso', 'error');
    } else {
      onAction(result.message || 'Reembolso enviado', 'success');
      onRefresh();
    }
    setConfirmModal(null);
  }

  async function handleReconcile() {
    // reconciliationApi.processOpen takes an OPTIONAL case id. Pass it only
    // when we actually have a linked case — payment.id is not a valid case id
    // and would either be ignored or trigger a "case not found" path.
    const caseId = payment!.relatedCases[0]?.id;
    const result = await reconcileMutation.mutate(caseId);
    if (!result) {
      onAction(reconcileMutation.error || 'Error al disparar reconciliación', 'error');
    } else {
      onAction('Reconciliación lanzada', 'success');
      onRefresh();
    }
    setConfirmModal(null);
  }

  const statusBadgeBg = (() => {
    const s = payment.paymentStatus.toLowerCase();
    if (s.includes('captured') || s.includes('completed') || s.includes('success')) return 'bg-[#dcfce7] text-[#166534]';
    if (s.includes('failed') || s.includes('disputed') || s.includes('refund')) return 'bg-[#fee2e2] text-[#9a3412]';
    return 'bg-[#f3f3f1] text-[#1a1a1a]';
  })();

  const actionBtnCls = (active: boolean) =>
    `px-3 h-8 rounded-full text-[13px] font-semibold transition-colors ${
      active ? 'bg-[#1a1a1a] text-white' : 'bg-[#f8f8f7] text-[#1a1a1a] hover:bg-[#ededea]'
    }`;

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 h-16 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[15px] font-semibold text-[#1a1a1a] leading-tight font-mono truncate">{payment.paymentId}</p>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusBadgeBg}`}>{payment.paymentStatus}</span>
            </div>
            <p className="text-[12px] text-[#646462] truncate">Pedido {payment.orderId} · {payment.customerName} · {payment.date}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setActionView('stripe')} className={actionBtnCls(actionView === 'stripe')}>Ver en {payment.psp}</button>
          <button onClick={() => setActionView('refund')} className={actionBtnCls(actionView === 'refund')}>Emitir reembolso</button>
          <button onClick={() => setActionView('reconcile')} className={actionBtnCls(actionView === 'reconcile')}>Reconciliar</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
        {loading && (
          <div className="rounded-xl border border-[#e9eae6] bg-[#f8f8f7] px-3 py-2 text-[12px] text-[#646462]">
            Cargando detalles del pago…
          </div>
        )}

        {payment.conflictDetected && (
          <div className="p-4 bg-[#fee2e2] border border-[#fed7aa] rounded-xl flex items-start gap-3">
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#9a3412] mt-0.5 flex-shrink-0"><path d="M8 1l7 13H1z"/></svg>
            <div>
              <h4 className="text-[13px] font-semibold text-[#9a3412] mb-0.5">Conflicto detectado</h4>
              <p className="text-[12.5px] text-[#9a3412]">{payment.conflictDetected}</p>
            </div>
          </div>
        )}

        {/* Detail grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 bg-[#f8f8f7] rounded-xl border border-[#e9eae6]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#646462] mb-2">Pago</p>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[12px]"><span className="text-[#646462]">Método</span><span className="text-[#1a1a1a] font-medium">{payment.paymentMethod}</span></div>
              <div className="flex justify-between text-[12px]"><span className="text-[#646462]">PSP</span><span className="text-[#1a1a1a] font-medium">{payment.psp}</span></div>
              <div className="flex justify-between text-[12px]"><span className="text-[#646462]">Importe</span><span className="text-[#1a1a1a] font-bold">{payment.amount} {payment.currency}</span></div>
            </div>
          </div>
          <div className="p-4 bg-[#f8f8f7] rounded-xl border border-[#e9eae6]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#646462] mb-2">Estados de sistema</p>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[12px]"><span className="text-[#646462]">OMS</span><span className="text-[#1a1a1a] font-medium">{payment.systemStates.oms}</span></div>
              <div className="flex justify-between text-[12px]"><span className="text-[#646462]">PSP</span><span className="text-[#1a1a1a] font-medium">{payment.systemStates.psp}</span></div>
              <div className="flex justify-between text-[12px]"><span className="text-[#646462]">Reembolso</span><span className="text-[#1a1a1a] font-medium">{payment.systemStates.refund}</span></div>
            </div>
          </div>
          <div className="p-4 bg-[#f8f8f7] rounded-xl border border-[#e9eae6]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#646462] mb-2">Riesgo</p>
            <div className="flex items-center gap-2 mb-1.5">
              <div className={`w-2 h-2 rounded-full ${payment.riskLevel === 'Low' ? 'bg-[#16a34a]' : payment.riskLevel === 'Medium' ? 'bg-[#fa7938]' : 'bg-[#9a3412]'}`} />
              <span className="text-[13px] font-semibold text-[#1a1a1a]">{payment.riskLevel} risk</span>
            </div>
            <p className="text-[11px] text-[#646462] leading-tight">Basado en señales de fraude del PSP y estado de reconciliación.</p>
          </div>
        </div>

        {/* Action workspace card */}
        <div className="rounded-xl border border-[#e9eae6] bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[14px] font-semibold text-[#1a1a1a]">
                {actionView === 'stripe' ? 'Workspace del gateway' : actionView === 'refund' ? 'Workspace de reembolso' : 'Workspace de reconciliación'}
              </p>
              <p className="text-[12.5px] text-[#646462]">
                {actionView === 'stripe'
                  ? `Revisa el pago en el origen (${payment.psp}) sin perder contexto.`
                  : actionView === 'refund'
                    ? 'Inspecciona el estado antes de devolver el importe al cliente.'
                    : 'Comprueba discrepancias entre PSP y OMS antes de reconciliar.'}
              </p>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#f3f3f1] text-[#1a1a1a]">
              {actionView === 'stripe' ? payment.psp : actionView === 'refund' ? payment.refundStatus : payment.reconciliationStatus}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="p-3 rounded-lg border border-[#e9eae6]">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#646462] mb-1">Estado primario</p>
              <p className="text-[13px] font-semibold text-[#1a1a1a]">{payment.paymentStatus}</p>
            </div>
            <div className="p-3 rounded-lg border border-[#e9eae6]">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#646462] mb-1">Aprobación</p>
              <p className="text-[13px] font-semibold text-[#1a1a1a]">{payment.approvalStatus}</p>
            </div>
            <div className="p-3 rounded-lg border border-[#e9eae6]">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#646462] mb-1">Riesgo</p>
              <p className="text-[13px] font-semibold text-[#1a1a1a]">{payment.riskLevel}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {actionView === 'stripe' && (
              <button
                onClick={() => setConfirmModal('stripe')}
                className="px-4 h-9 rounded-full text-[13px] font-semibold text-white bg-[#1a1a1a] hover:bg-black self-start"
              >
                Abrir {payment.psp}
              </button>
            )}
            {actionView === 'refund' && (
              <button
                onClick={() => setConfirmModal('refund')}
                disabled={refundMutation.loading}
                className={`px-4 h-9 rounded-full text-[13px] font-semibold self-start ${
                  refundMutation.loading
                    ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed'
                    : 'bg-[#9a3412] text-white hover:bg-[#7a2812]'
                }`}
              >
                {refundMutation.loading ? 'Reembolsando…' : `Emitir reembolso de ${payment.amount}`}
              </button>
            )}
            {actionView === 'reconcile' && (
              <button
                onClick={() => setConfirmModal('reconcile')}
                disabled={reconcileMutation.loading}
                className={`px-4 h-9 rounded-full text-[13px] font-semibold self-start ${
                  reconcileMutation.loading
                    ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed'
                    : 'bg-[#1a1a1a] text-white hover:bg-black'
                }`}
              >
                {reconcileMutation.loading ? 'Reconciliando…' : 'Disparar reconciliación'}
              </button>
            )}
          </div>
        </div>

        {/* Timeline */}
        {payment.timeline.length > 0 && (
          <div className="rounded-xl border border-[#e9eae6] bg-white p-5">
            <p className="text-[14px] font-semibold text-[#1a1a1a] mb-3">Línea de tiempo</p>
            <div className="flex flex-col gap-2">
              {payment.timeline.map((e, i) => (
                <div key={e.id || i} className="flex items-start gap-3 text-[12.5px]">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#1a1a1a] mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[#1a1a1a]">{e.content}</p>
                    <p className="text-[11px] text-[#646462] mt-0.5">
                      {e.system && <span className="font-medium">{e.system}</span>}
                      {e.system && e.time && <span> · </span>}
                      {e.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Confirm modals */}
      <ConfirmModal
        open={confirmModal === 'stripe'}
        title={`Abrir ${payment.psp}`}
        subtitle={`Navegar al gateway externo para el pago ${payment.paymentId}`}
        body={
          <>
            <p>Esto abrirá <span className="font-mono text-[12px]">{getPaymentGatewayUrl(payment)}</span> en una pestaña nueva.</p>
            <p className="text-[#646462]">Los cambios hechos en el gateway no se sincronizan automáticamente. Si actuas en el gateway, dispara después una reconciliación desde aquí.</p>
          </>
        }
        confirmLabel={`Abrir ${payment.psp}`}
        loading={false}
        onConfirm={handleStripe}
        onClose={() => setConfirmModal(null)}
      />
      <ConfirmModal
        open={confirmModal === 'refund'}
        title={`Emitir reembolso — ${payment.amount}`}
        subtitle={`Iniciar reembolso completo para ${payment.customerName}`}
        body={
          <ul className="list-disc pl-5 space-y-1 text-[#646462]">
            <li>Importe: <span className="text-[#1a1a1a] font-semibold">{payment.amount} {payment.currency}</span></li>
            <li>PSP: <span className="text-[#1a1a1a] font-semibold">{payment.psp}</span></li>
            <li>Estado actual: <span className="text-[#1a1a1a] font-semibold">{payment.paymentStatus}</span></li>
            <li>Esta acción es irreversible una vez enviada al PSP. Los reembolsos suelen tardar 5–10 días en aparecer en el extracto del cliente.</li>
          </ul>
        }
        confirmLabel="Confirmar reembolso"
        variant="warning"
        loading={refundMutation.loading}
        onConfirm={handleRefund}
        onClose={() => setConfirmModal(null)}
      />
      <ConfirmModal
        open={confirmModal === 'reconcile'}
        title="Disparar reconciliación"
        subtitle={`Sincronizar el pago ${payment.paymentId} entre todos los sistemas`}
        body={
          <ul className="list-disc pl-5 space-y-1 text-[#646462]">
            <li>OMS: <span className="text-[#1a1a1a] font-semibold">{payment.systemStates.oms}</span></li>
            <li>PSP: <span className="text-[#1a1a1a] font-semibold">{payment.systemStates.psp}</span></li>
            <li>Reembolso: <span className="text-[#1a1a1a] font-semibold">{payment.systemStates.refund}</span></li>
            <li>Reconciliación: <span className="text-[#1a1a1a] font-semibold">{payment.reconciliationStatus}</span></li>
            <li>La reconciliación no modifica el estado en el PSP. Sólo actualiza los registros internos.</li>
          </ul>
        }
        confirmLabel="Disparar reconciliación"
        loading={reconcileMutation.loading}
        onConfirm={handleReconcile}
        onClose={() => setConfirmModal(null)}
      />
    </div>
  );
}

// ── Right pane: Details + Copilot ───────────────────────────────────────────
function RightPane({ payment, copilotMessages, onSendCopilot, copilotLoading }: {
  payment: Payment | null;
  copilotMessages: CopilotMessage[];
  onSendCopilot: (q: string) => void;
  copilotLoading: boolean;
}) {
  const [tab, setTab] = useState<RightTab>('copilot');
  const [copilotInput, setCopilotInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [copilotMessages.length]);

  if (!payment) return null;

  // Copilot needs a real case id (the endpoint 404s otherwise). Disable the tab
  // when the payment has no related case to surface a meaningful message rather
  // than a backend error to the user.
  const linkedCaseId = payment.relatedCases[0]?.id;
  const copilotEnabled = Boolean(linkedCaseId);

  function send() {
    const q = copilotInput.trim();
    if (!q || copilotLoading || !copilotEnabled) return;
    onSendCopilot(q);
    setCopilotInput('');
  }

  return (
    <div className="w-[340px] flex-shrink-0 border-l border-[#e9eae6] bg-white flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-1 px-3 pt-3 pb-2 border-b border-[#e9eae6] flex-shrink-0">
        <button
          onClick={() => setTab('copilot')}
          className={`px-3 h-8 rounded-full text-[13px] font-semibold transition-colors ${
            tab === 'copilot' ? 'bg-[#1a1a1a] text-white' : 'text-[#646462] hover:bg-[#f8f8f7]'
          }`}
        >
          Copilot
        </button>
        <button
          onClick={() => setTab('details')}
          className={`px-3 h-8 rounded-full text-[13px] font-semibold transition-colors ${
            tab === 'details' ? 'bg-[#1a1a1a] text-white' : 'text-[#646462] hover:bg-[#f8f8f7]'
          }`}
        >
          Detalles
        </button>
      </div>

      {tab === 'details' && (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          <div>
            <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-2">Atributos</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-[#646462] uppercase tracking-wider">Payment ID</span>
                <span className="text-[12px] font-semibold text-[#1a1a1a] font-mono truncate">{payment.paymentId}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-[#646462] uppercase tracking-wider">Cliente</span>
                <span className="text-[12px] font-semibold text-[#1a1a1a] truncate">{payment.customerName}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-[#646462] uppercase tracking-wider">Importe</span>
                <span className="text-[12px] font-semibold text-[#1a1a1a]">{payment.amount} {payment.currency}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-[#646462] uppercase tracking-wider">Estado</span>
                <span className="text-[12px] font-medium text-[#1a1a1a]">{payment.paymentStatus}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-[#646462] uppercase tracking-wider">Método</span>
                <span className="text-[12px] font-medium text-[#1a1a1a]">{payment.paymentMethod}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-[#646462] uppercase tracking-wider">PSP</span>
                <span className="text-[12px] font-medium text-[#1a1a1a]">{payment.psp}</span>
              </div>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-2">Enlaces operativos</p>
            <div className="flex flex-col gap-1.5">
              <a href={getPaymentGatewayUrl(payment)} target="_blank" rel="noreferrer" className="flex items-center justify-between p-2 rounded-lg hover:bg-[#f8f8f7] text-[12px] text-[#1a1a1a] border border-[#e9eae6]">
                <span>Gateway de pago ({payment.psp})</span>
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M9 2h5v5h-1.5V4.5L7 10l-1-1 5.5-5.5H9V2zM3 4h4v1.5H4.5v6h6V9H12v4H3V4z"/></svg>
              </a>
              <a href={`https://oms.example.local/orders/${encodeURIComponent(payment.orderId)}`} target="_blank" rel="noreferrer" className="flex items-center justify-between p-2 rounded-lg hover:bg-[#f8f8f7] text-[12px] text-[#1a1a1a] border border-[#e9eae6]">
                <span>OMS — pedido {payment.orderId}</span>
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M9 2h5v5h-1.5V4.5L7 10l-1-1 5.5-5.5H9V2zM3 4h4v1.5H4.5v6h6V9H12v4H3V4z"/></svg>
              </a>
              <a href={`https://reconcile.example.local/payments/${encodeURIComponent(payment.paymentId)}`} target="_blank" rel="noreferrer" className="flex items-center justify-between p-2 rounded-lg hover:bg-[#f8f8f7] text-[12px] text-[#1a1a1a] border border-[#e9eae6]">
                <span>Reconciliation Tool</span>
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M9 2h5v5h-1.5V4.5L7 10l-1-1 5.5-5.5H9V2zM3 4h4v1.5H4.5v6h6V9H12v4H3V4z"/></svg>
              </a>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-2">Casos relacionados</p>
            {payment.relatedCases.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {payment.relatedCases.map(rc => (
                  <li key={rc.id} className="p-2 rounded-lg border border-[#e9eae6] flex items-center justify-between">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[12px] font-semibold text-[#1a1a1a] font-mono truncate">{rc.id}</span>
                      <span className="text-[11px] text-[#646462] truncate">{rc.type}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-[#f3f3f1] text-[10px] font-semibold text-[#1a1a1a] flex-shrink-0">{rc.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-[#646462] italic">Ningún caso vinculado.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'copilot' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {copilotMessages.length === 0 && copilotEnabled && (
              <div className="text-center text-[12.5px] text-[#646462] py-6">
                <div className="text-[24px] mb-2">🤖</div>
                <p className="font-semibold mb-1">Hola, soy Copilot</p>
                <p>Tengo el contexto del caso vinculado <span className="font-mono text-[#1a1a1a]">{linkedCaseId}</span>.</p>
              </div>
            )}
            {!copilotEnabled && (
              <div className="text-center text-[12.5px] text-[#646462] py-6">
                <div className="text-[24px] mb-2">🤖</div>
                <p className="font-semibold mb-1 text-[#1a1a1a]">Copilot desactivado</p>
                <p>Este pago no tiene un caso vinculado. El Copilot necesita un caso para tener contexto.</p>
              </div>
            )}
            {copilotMessages.map(m => (
              <div key={m.id} className={`max-w-[85%] ${m.role === 'user' ? 'self-end' : 'self-start'}`}>
                <div className={`px-3 py-2 rounded-xl text-[13px] leading-[18px] ${
                  m.role === 'user' ? 'bg-[#1a1a1a] text-white rounded-br-sm' : 'bg-[#f8f8f7] text-[#1a1a1a] rounded-bl-sm'
                }`}>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
                <p className={`text-[10px] text-[#646462] mt-1 ${m.role === 'user' ? 'text-right' : 'text-left'}`}>{m.time}</p>
              </div>
            ))}
            {copilotLoading && (
              <div className="self-start max-w-[85%] bg-[#f8f8f7] px-3 py-2 rounded-xl text-[13px] text-[#646462]">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 bg-[#646462] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-[#646462] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-[#646462] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="border-t border-[#e9eae6] p-3 flex-shrink-0">
            <div className="flex flex-col gap-2">
              <textarea
                value={copilotInput}
                onChange={e => setCopilotInput(e.target.value)}
                onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send(); }}
                placeholder={copilotEnabled ? 'Pregunta a Copilot…' : 'Sin caso vinculado'}
                disabled={!copilotEnabled}
                className="w-full min-h-[60px] resize-y rounded-xl border border-[#e9eae6] px-3 py-2 text-[13px] text-[#1a1a1a] placeholder:text-[#646462] focus:outline-none focus:border-[#1a1a1a] disabled:bg-[#f8f8f7] disabled:cursor-not-allowed"
              />
              <button
                onClick={send}
                disabled={!copilotInput.trim() || copilotLoading || !copilotEnabled}
                className={`px-3 h-8 rounded-full text-[13px] font-semibold ${
                  !copilotInput.trim() || copilotLoading || !copilotEnabled
                    ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed'
                    : 'bg-[#1a1a1a] text-white hover:bg-black'
                }`}
              >
                {copilotLoading ? 'Pensando…' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main PaymentsV2 component ───────────────────────────────────────────────
export default function PaymentsV2() {
  const [activeTab, setActiveTab] = useState<PaymentTab>('all');
  const [selectedId, setSelectedId] = useState<string>('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [copilotByPaymentId, setCopilotByPaymentId] = useState<Record<string, CopilotMessage[]>>({});
  const [copilotLoading, setCopilotLoading] = useState(false);

  const { data: apiPayments, loading, error } = useApi(
    () => paymentsApi.list(),
    [refreshKey],
    [],
  );

  const payments = useMemo(
    () => (Array.isArray(apiPayments) ? apiPayments.map(mapApiPayment) : []),
    [apiPayments],
  );

  const counts: Record<PaymentTab, number> = useMemo(() => ({
    all:            payments.length,
    refunds:        payments.filter(p => p.tab === 'refunds').length,
    disputes:       payments.filter(p => p.tab === 'disputes').length,
    reconciliation: payments.filter(p => p.tab === 'reconciliation').length,
    blocked:        payments.filter(p => p.tab === 'blocked').length,
  }), [payments]);

  const filtered = useMemo(
    () => payments.filter(p => activeTab === 'all' || p.tab === activeTab),
    [payments, activeTab],
  );

  // Auto-select first payment if nothing selected (or selection no longer in filter)
  useEffect(() => {
    if (filtered.length === 0) return;
    if (!selectedId || !filtered.find(p => p.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  // Fetch detail when a payment is selected
  const selectedBase = filtered.find(p => p.id === selectedId) || null;
  const { data: selectedRaw, loading: detailLoading } = useApi(
    () => selectedBase ? paymentsApi.get(selectedBase.id) : Promise.resolve(null),
    [selectedBase?.id, refreshKey],
    null,
  );

  const selectedPayment = useMemo(() => {
    if (!selectedBase) return null;
    if (!selectedRaw) return selectedBase;
    const detail = mapApiPayment(selectedRaw);
    return {
      ...selectedBase,
      ...detail,
      timeline: detail.timeline.length > 0 ? detail.timeline : selectedBase.timeline,
      relatedCases: detail.relatedCases.length > 0 ? detail.relatedCases : selectedBase.relatedCases,
    };
  }, [selectedBase, selectedRaw]);

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function sendCopilot(question: string) {
    if (!selectedPayment) return;
    const pid = selectedPayment.id;
    const caseId = selectedPayment.relatedCases[0]?.id;
    if (!caseId) return; // RightPane disables the input when no case is linked
    const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const userMsg: CopilotMessage = { id: `u-${Date.now()}`, role: 'user', content: question, time: now };
    setCopilotByPaymentId(s => ({ ...s, [pid]: [...(s[pid] || []), userMsg] }));
    setCopilotLoading(true);
    try {
      const history = (copilotByPaymentId[pid] || []).map(m => ({ role: m.role, content: m.content }));
      const result = await aiApi.copilot(caseId, question, history);
      const assistantMsg: CopilotMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: result?.answer || result?.content || result?.response || 'Sin respuesta',
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      };
      setCopilotByPaymentId(s => ({ ...s, [pid]: [...(s[pid] || []), assistantMsg] }));
    } catch (err: any) {
      const errorMsg: CopilotMessage = {
        id: `e-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ Error: ${err?.message || 'No pude responder'}`,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      };
      setCopilotByPaymentId(s => ({ ...s, [pid]: [...(s[pid] || []), errorMsg] }));
    } finally {
      setCopilotLoading(false);
    }
  }

  return (
    <div className="flex flex-1 min-w-0 h-full overflow-hidden relative">
      <PaymentsSidebar
        activeTab={activeTab}
        onTabChange={(t) => { setActiveTab(t); setSelectedId(''); }}
        counts={counts}
      />
      <PaymentList
        payments={filtered}
        selectedId={selectedPayment?.id || ''}
        onSelect={setSelectedId}
      />
      <DetailPane
        payment={selectedPayment}
        loading={detailLoading}
        onAction={showToast}
        onRefresh={() => setRefreshKey(k => k + 1)}
      />
      <RightPane
        payment={selectedPayment}
        copilotMessages={selectedPayment ? (copilotByPaymentId[selectedPayment.id] || []) : []}
        onSendCopilot={sendCopilot}
        copilotLoading={copilotLoading}
      />

      {/* Loading + error overlays */}
      {loading && (
        <div className="absolute top-4 right-4 bg-white border border-[#e9eae6] rounded-lg px-3 py-2 text-[12px] text-[#646462] shadow-sm">
          Cargando…
        </div>
      )}
      {error && (
        <div className="absolute top-4 right-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[12px] text-red-700 shadow-sm">
          Error: {String((error as any)?.message || error)}
        </div>
      )}
      {toast && (
        <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-[13px] font-semibold shadow-lg ${
          toast.type === 'success' ? 'bg-[#1a1a1a] text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
