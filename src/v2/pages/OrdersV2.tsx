// OrdersV2 — migrated by agent-orders-01.
// ─────────────────────────────────────────────────────────────────────────────
// What works (this iteration):
//   • Real order list from ordersApi.list({ tab? })
//   • Tab filtering (OrderTab: all / attention / refunds / conflicts)
//   • Select order → enriched detail via ordersApi.get(id)
//   • Cancel order (ordersApi.cancel) with confirmation flow
//   • Add internal note to linked case (casesApi.addInternalNote)
//   • Quick refund via PSP lookup (paymentsApi.list + paymentsApi.refund)
//   • Resolve / Snooze / Close linked case (casesApi.resolve / updateStatus)
//   • Right pane "Detalles" with order attributes, system states and related cases
//
// Pending for later iterations (still in src/components/Orders.tsx until migrated):
//   • Advanced RefundFlowModal (full / partial / exchange / goodwill) with
//     remaining-amount cap. Quick refund here issues a full refund only.
//   • CaseCopilotPanel integration in the right-pane Copilot tab. Right pane
//     currently exposes "Detalles" only.
//   • Step-by-step ActionModal confirmations (the original wraps every action
//     in a multi-step modal with considerations + steps). Replaced here with
//     a single inline confirmation row to keep the migration focused.
//   • Cross-page deep linking with entity id (e.g. "Open in Inbox" with case
//     pre-selected). V2App.navigate currently takes a Page only — surfaced as
//     a toast for now.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect, type ReactNode } from 'react';
import type { Order, OrderTab } from '../../types';
import { casesApi, ordersApi, paymentsApi } from '../../api/client';
import { useApi } from '../../api/hooks';

// ── Helpers (same intent as original Orders.tsx) ─────────────────────────────
const formatDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-';

const formatRelativeLabel = (v?: string | null) => {
  if (!v) return 'Unknown';
  const d = Math.max(1, Math.round((Date.now() - new Date(v).getTime()) / 60000));
  if (d < 60) return `${d}m ago`;
  const h = Math.round(d / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

const titleCase = (v?: string | null) =>
  v ? v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'N/A';

// Map raw API order → Order (same shape as legacy mapApiOrder in Orders.tsx)
function mapApiOrder(o: any): Order {
  return {
    id: o.id,
    customerName: o.customerName || o.externalOrderId || 'Unknown',
    orderId: o.externalOrderId,
    brand: o.brand || 'Acme Store',
    date: formatDate(o.orderDate),
    total: `$${Number(o.totalAmount || 0).toFixed(2)}`,
    currency: o.currency || 'USD',
    country: o.country || 'US',
    channel: o.canonicalContext?.caseState?.channelContext?.channel || o.brand || 'Shopify',
    orderStatus: titleCase(o.status || o.systemStates?.oms || 'Unknown'),
    paymentStatus: o.systemStates?.psp || 'Unknown',
    fulfillmentStatus: o.systemStates?.wms || 'N/A',
    returnStatus: titleCase(o.systemStates?.returnsPlatform || 'N/A'),
    refundStatus: titleCase(o.systemStates?.refundStatus || 'N/A'),
    approvalStatus: titleCase(o.approvalStatus || 'N/A'),
    riskLevel: o.riskLevel === 'high' ? 'High' : o.riskLevel === 'medium' ? 'Medium' : 'Low',
    orderType: o.orderType || 'Standard',
    summary: o.summary || '',
    lastUpdate: formatRelativeLabel(o.lastUpdate),
    badges: Array.isArray(o.badges) ? o.badges : [],
    tab: o.tab || 'all',
    conflictDetected: o.conflictDetected || '',
    recommendedNextAction: o.recommendedAction || '',
    context: o.canonicalContext?.caseState?.conflict?.rootCause || o.summary || '',
    systemStates:
      typeof o.systemStates === 'object' && o.systemStates
        ? o.systemStates
        : { oms: 'Unknown', psp: 'Unknown', wms: 'Unknown', carrier: 'Unknown', canonical: 'Unknown' },
    canonicalContext: o.canonicalContext || null,
    relatedCases: Array.isArray(o.relatedCases)
      ? o.relatedCases.map((c: any) => ({
          id: c.caseNumber || c.id,
          type: c.type || 'Case',
          status: titleCase(c.status || 'open'),
        }))
      : [],
    timeline: (o.events || []).map((e: any, i: number) => ({
      id: e.id || String(i),
      type: e.type || 'system',
      content: e.content,
      time: e.time || e.occurredAt || '-',
      system: e.system || e.source,
    })),
  };
}

// ── Sidebar (left, 236px) — order tabs + collapsible "Vistas"
function OrdersSidebar({
  activeTab,
  onTabChange,
  counts,
}: {
  activeTab: OrderTab;
  onTabChange: (t: OrderTab) => void;
  counts: Record<OrderTab, number>;
}) {
  const [openVistas, setOpenVistas] = useState(true);

  const Chev = ({ open }: { open: boolean }) => (
    <svg
      viewBox="0 0 16 16"
      className={`w-3.5 h-3.5 fill-[#646462] transition-transform ${open ? 'rotate-90' : ''}`}
    >
      <path d="M6 4l4 4-4 4z" />
    </svg>
  );
  const Plus = () => (
    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]">
      <path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z" />
    </svg>
  );
  const itemCls = (active: boolean) =>
    `relative flex items-center gap-2 h-8 pl-3 pr-3 py-1 rounded-lg cursor-pointer text-[13px] w-full text-left transition-colors ${
      active
        ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]'
        : 'hover:bg-[#e9eae6]/40 text-[#1a1a1a]'
    }`;

  const Pill = ({ n }: { n: number }) =>
    n > 0 ? (
      <span className="ml-auto text-[11px] font-semibold text-[#646462] bg-white border border-[#e9eae6] rounded-full px-2 py-0.5">
        {n}
      </span>
    ) : null;

  return (
    <div className="flex flex-col h-full w-[236px] bg-[#f8f8f7] border-r border-[#e9eae6] flex-shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 h-16 flex-shrink-0">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Pedidos</span>
        <button
          className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#e9eae6]"
          title="Sincronizar"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]">
            <path d="M8 2.5a5.5 5.5 0 014.9 3H11v1.5h4V3h-1.5v1.4A7 7 0 001 8h1.5A5.5 5.5 0 018 2.5zM8 13.5a5.5 5.5 0 01-4.9-3H5V9H1v4h1.5v-1.4A7 7 0 0015 8h-1.5A5.5 5.5 0 018 13.5z" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pl-3 pr-3 pb-4">
        <div className="flex flex-col gap-0.5">
          <button onClick={() => onTabChange('all')} className={itemCls(activeTab === 'all')}>
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]">
              <path d="M3 3h10v2H3zm0 4h10v2H3zm0 4h10v2H3z" />
            </svg>
            <span>Todos</span>
            <Pill n={counts.all} />
          </button>
          <button
            onClick={() => onTabChange('attention')}
            className={itemCls(activeTab === 'attention')}
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#fa7938]">
              <path d="M8 1l7 13H1z" />
            </svg>
            <span>Necesita atención</span>
            <Pill n={counts.attention} />
          </button>
          <button
            onClick={() => onTabChange('refunds')}
            className={itemCls(activeTab === 'refunds')}
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]">
              <path d="M2 4h10l-2-2 1-1 4 4-4 4-1-1 2-2H2zm12 8H4l2 2-1 1-4-4 4-4 1 1-2 2h10z" />
            </svg>
            <span>Reembolsos</span>
            <Pill n={counts.refunds} />
          </button>
          <button
            onClick={() => onTabChange('conflicts')}
            className={itemCls(activeTab === 'conflicts')}
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]">
              <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM7.25 4h1.5v5h-1.5zm0 6.5h1.5V12h-1.5z" />
            </svg>
            <span>Conflictos</span>
            <Pill n={counts.conflicts} />
          </button>
        </div>

        <div className="mt-3">
          <button
            onClick={() => setOpenVistas(o => !o)}
            className="w-full flex items-center justify-between h-8 px-3 cursor-pointer hover:bg-[#ededea]/40 rounded-[6px]"
          >
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Vistas</span>
            <span className="flex items-center gap-1">
              <span className="w-6 h-6 flex items-center justify-center rounded-full bg-white shadow-[0px_1px_2px_rgba(20,20,20,0.15)]">
                <Plus />
              </span>
              <Chev open={openVistas} />
            </span>
          </button>
          {openVistas && (
            <div className="mt-1 flex flex-col gap-0.5 pl-2">
              <p className="text-[12px] text-[#646462] px-3 py-2 italic">
                No hay vistas guardadas todavía.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Order list (middle pane, 320px)
function OrdersList({
  orders,
  selectedId,
  onSelect,
  syncActive,
}: {
  orders: Order[];
  selectedId: string;
  onSelect: (id: string) => void;
  syncActive: boolean;
}) {
  return (
    <div className="flex flex-col h-full w-[320px] border-l border-[#e9eae6] bg-[#f8f8f7] flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-3 h-16 sticky top-0">
        <span className="text-[16px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">
          {orders.length} pedido{orders.length === 1 ? '' : 's'}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-[#646462]">
          <span
            className={`w-2 h-2 rounded-full ${syncActive ? 'bg-[#158613]' : 'bg-[#9a3412]'}`}
          />
          {syncActive ? 'Sync activo' : 'Sync detenido'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-16 flex flex-col gap-0">
        {orders.length === 0 && (
          <div className="text-center text-[13px] text-[#646462] py-8">No hay pedidos</div>
        )}
        {orders.map((o, i) => {
          const isSelected = o.id === selectedId;
          const flagged =
            o.conflictDetected !== '' || o.riskLevel === 'High' || o.approvalStatus === 'Pending';
          return (
            <div key={o.id}>
              {i > 0 && (
                <div className="flex justify-center py-0.5">
                  <div className="w-[270px] h-[1px] bg-[#e9eae6]" />
                </div>
              )}
              <button
                onClick={() => onSelect(o.id)}
                className={`relative flex flex-col gap-1.5 px-3 py-3 rounded-xl cursor-pointer w-full text-left ${
                  isSelected
                    ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]'
                    : 'hover:bg-white/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[13px] truncate ${isSelected ? 'font-semibold text-[#1a1a1a]' : 'font-bold text-[#1a1a1a]'}`}
                  >
                    {o.customerName}
                  </span>
                  <span className="text-[11px] text-[#646462] flex-shrink-0 ml-2">
                    {o.lastUpdate}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-[#646462] truncate">{o.orderId}</span>
                  <span className="text-[11px] text-[#646462] flex-shrink-0">{o.total}</span>
                </div>
                <p className="text-[12.5px] text-[#646462] truncate">{o.summary || '—'}</p>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {flagged && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-[#fff4ec] text-[#9a3412] border border-[#fed7aa] rounded-full px-2 py-0.5">
                      <svg viewBox="0 0 16 16" className="w-2.5 h-2.5 fill-[#9a3412]">
                        <path d="M8 1l7 13H1z" />
                      </svg>
                      Atención
                    </span>
                  )}
                  {o.badges.slice(0, 2).map(b => (
                    <span
                      key={b}
                      className="text-[10px] font-semibold text-[#1a1a1a] bg-white border border-[#e9eae6] rounded-full px-2 py-0.5"
                    >
                      {b}
                    </span>
                  ))}
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Detail pane: header + key/value grid + actions + timeline
function DetailPane({
  order,
  loading,
  onAction,
  onRefresh,
}: {
  order: Order | null;
  loading: boolean;
  onAction: (msg: string, type: 'success' | 'error') => void;
  onRefresh: () => void;
}) {
  const [confirm, setConfirm] = useState<null | 'cancel' | 'refund' | 'note'>(null);
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setConfirm(null);
    setNoteText('');
  }, [order?.id]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[13px] text-[#646462] bg-white">
        Cargando detalles del pedido…
      </div>
    );
  }
  if (!order) {
    return (
      <div className="flex-1 flex items-center justify-center text-[13.5px] text-[#646462] bg-white">
        Selecciona un pedido
      </div>
    );
  }

  const linkedCaseId = order.relatedCases?.[0]?.id || null;
  const paymentIdHint =
    order.canonicalContext?.caseState?.identifiers?.paymentIds?.[0] ||
    order.canonicalContext?.identifiers?.paymentIds?.[0] ||
    null;

  async function cancelOrder() {
    if (!order || busy) return;
    setBusy(true);
    try {
      await ordersApi.cancel(order.id, 'User requested cancellation via UI');
      onAction(`Cancelación solicitada para ${order.orderId}`, 'success');
      onRefresh();
    } catch (err: any) {
      onAction(err?.message || `No se pudo cancelar ${order.orderId}`, 'error');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function quickRefund() {
    if (!order || busy) return;
    setBusy(true);
    try {
      let paymentId = paymentIdHint;
      if (!paymentId) {
        const candidates = await paymentsApi.list({ q: order.orderId });
        paymentId = candidates[0]?.id || null;
      }
      if (!paymentId) {
        onAction('No se encontró un pago reembolsable para este pedido.', 'error');
        return;
      }
      await paymentsApi.refund(paymentId, {
        reason: `Refund started from order ${order.orderId}`,
      });
      onAction(`Reembolso creado para el pago ${paymentId}.`, 'success');
      onRefresh();
    } catch (err: any) {
      onAction(err?.message || 'Error iniciando el reembolso.', 'error');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function addNote() {
    if (!order || busy) return;
    if (!linkedCaseId) {
      onAction('No hay un caso vinculado para añadir una nota interna.', 'error');
      return;
    }
    if (!noteText.trim()) {
      onAction('Escribe una nota antes de enviarla.', 'error');
      return;
    }
    setBusy(true);
    try {
      await casesApi.addInternalNote(linkedCaseId, noteText.trim());
      onAction(`Nota interna añadida a ${linkedCaseId}.`, 'success');
      setNoteText('');
      onRefresh();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo añadir la nota.', 'error');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  async function resolveCase() {
    if (!linkedCaseId || busy) return;
    setBusy(true);
    try {
      await casesApi.resolve(linkedCaseId);
      onAction(`Caso ${linkedCaseId} marcado como resuelto`, 'success');
      onRefresh();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo resolver el caso', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function snoozeCase() {
    if (!linkedCaseId || busy) return;
    setBusy(true);
    try {
      await casesApi.updateStatus(linkedCaseId, 'snoozed');
      onAction(`Caso ${linkedCaseId} pospuesto`, 'success');
      onRefresh();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo posponer el caso', 'error');
    } finally {
      setBusy(false);
    }
  }

  const initials = order.customerName
    .split(' ')
    .map(n => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('');

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 h-16 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#9ec5fa] flex items-center justify-center flex-shrink-0">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">{initials || '?'}</span>
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-[#1a1a1a] leading-tight truncate">
              {order.customerName}
            </p>
            <p className="text-[12px] text-[#646462] font-mono truncate">
              {order.orderId} · {order.brand} · {order.channel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {linkedCaseId && (
            <>
              <button
                onClick={snoozeCase}
                disabled={busy}
                className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] hover:bg-[#ededea] disabled:opacity-60"
              >
                Posponer caso
              </button>
              <button
                onClick={resolveCase}
                disabled={busy}
                className="px-3 h-8 rounded-full text-[13px] font-semibold text-white bg-[#1a1a1a] hover:bg-black disabled:opacity-60"
              >
                Resolver caso
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* Risk + status banner */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
              order.riskLevel === 'High'
                ? 'bg-[#fff4ec] text-[#9a3412] border-[#fed7aa]'
                : order.riskLevel === 'Medium'
                ? 'bg-[#fffbeb] text-[#92400e] border-[#fde68a]'
                : 'bg-[#f0fdf4] text-[#166534] border-[#bbf7d0]'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                order.riskLevel === 'High'
                  ? 'bg-[#9a3412]'
                  : order.riskLevel === 'Medium'
                  ? 'bg-[#92400e]'
                  : 'bg-[#158613]'
              }`}
            />
            Riesgo {order.riskLevel}
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] border border-[#e9eae6]">
            {order.orderStatus}
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] border border-[#e9eae6]">
            Pago: {order.paymentStatus}
          </span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] border border-[#e9eae6]">
            Fulfillment: {order.fulfillmentStatus}
          </span>
        </div>

        <h2 className="text-[18px] font-semibold tracking-[-0.4px] text-[#1a1a1a] leading-snug mb-1">
          {order.summary || `Pedido ${order.orderId}`}
        </h2>
        {order.recommendedNextAction && (
          <p className="text-[13px] text-[#646462] mb-4">
            <span className="font-semibold text-[#1a1a1a]">Recomendado:</span>{' '}
            {order.recommendedNextAction}
          </p>
        )}

        {/* 3-column grid: Order / Systems / Risk */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="rounded-xl border border-[#e9eae6] bg-[#f8f8f7] px-4 py-3">
            <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-2">
              Pedido
            </p>
            <div className="space-y-1.5 text-[12.5px]">
              <Row label="Canal" value={order.channel} />
              <Row label="País" value={order.country} />
              <Row label="Total" value={order.total} bold />
              <Row label="Fecha" value={order.date} />
            </div>
          </div>
          <div className="rounded-xl border border-[#e9eae6] bg-[#f8f8f7] px-4 py-3">
            <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-2">
              Sistemas
            </p>
            <div className="space-y-1.5 text-[12.5px]">
              <Row label="OMS" value={order.systemStates.oms} />
              <Row label="PSP" value={order.systemStates.psp} />
              <Row label="WMS" value={order.systemStates.wms} />
              <Row label="Carrier" value={order.systemStates.carrier} />
            </div>
          </div>
          <div className="rounded-xl border border-[#e9eae6] bg-[#f8f8f7] px-4 py-3">
            <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-2">
              Estado operativo
            </p>
            <div className="space-y-1.5 text-[12.5px]">
              <Row label="Reembolso" value={order.refundStatus} />
              <Row label="Devolución" value={order.returnStatus} />
              <Row label="Aprobación" value={order.approvalStatus} />
              <Row label="Tipo" value={order.orderType} />
            </div>
          </div>
        </div>

        {/* Conflict notice */}
        {order.conflictDetected && (
          <div className="rounded-xl border border-[#fed7aa] bg-[#fff4ec] px-4 py-3 mb-5">
            <p className="text-[11px] font-semibold text-[#9a3412] uppercase tracking-wider mb-1">
              Conflicto detectado
            </p>
            <p className="text-[13px] text-[#1a1a1a]">{order.conflictDetected}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          <ActionBtn
            icon={
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]">
                <path d="M2 4h10l-2-2 1-1 4 4-4 4-1-1 2-2H2z" />
              </svg>
            }
            label="Iniciar reembolso"
            onClick={() => setConfirm('refund')}
            disabled={busy}
          />
          <ActionBtn
            icon={
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]">
                <path d="M3 2h7l3 3v9H3z M10 2v3h3" />
              </svg>
            }
            label="Añadir nota interna"
            onClick={() => setConfirm('note')}
            disabled={busy}
          />
          <ActionBtn
            icon={
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#9a3412]">
                <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zm3 9.5l-1 1L8 10l-2 2-1-1L7 9 5 7l1-1 2 2 2-2 1 1L9 9z" />
              </svg>
            }
            label="Cancelar pedido"
            onClick={() => setConfirm('cancel')}
            disabled={busy}
            danger
          />
        </div>

        {/* Inline confirmation row */}
        {confirm === 'cancel' && (
          <ConfirmRow
            tone="danger"
            title="Confirmar cancelación"
            body={`Se cancelará el pedido ${order.orderId} en OMS, PSP, WMS y carrier. La acción es irreversible si el pedido todavía no ha sido enviado.`}
            confirmLabel="Sí, cancelar pedido"
            onConfirm={cancelOrder}
            onClose={() => setConfirm(null)}
            busy={busy}
          />
        )}
        {confirm === 'refund' && (
          <ConfirmRow
            tone="warning"
            title="Confirmar reembolso completo"
            body={`Se buscará el pago vinculado al pedido ${order.orderId} y se emitirá un reembolso por ${order.total}. Esta versión emite un reembolso completo; los reembolsos parciales y goodwill llegarán en una iteración posterior.`}
            confirmLabel="Iniciar reembolso"
            onConfirm={quickRefund}
            onClose={() => setConfirm(null)}
            busy={busy}
          />
        )}
        {confirm === 'note' && (
          <div className="rounded-xl border border-[#e9eae6] bg-white p-4 mb-5">
            <p className="text-[13px] font-semibold text-[#1a1a1a] mb-1">Nueva nota interna</p>
            <p className="text-[12px] text-[#646462] mb-3">
              Se adjuntará al caso vinculado{' '}
              <span className="font-mono">{linkedCaseId || '—'}</span>. Las notas son permanentes.
            </p>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="p. ej. «Cliente confirmó cambio de dirección — reenvío aprobado.»"
              className="w-full min-h-[80px] resize-y rounded-xl border border-[#e9eae6] px-3 py-2 text-[13px] text-[#1a1a1a] placeholder:text-[#646462] focus:outline-none focus:border-[#1a1a1a]"
            />
            <div className="flex items-center justify-end gap-2 mt-3">
              <button
                onClick={() => setConfirm(null)}
                className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] hover:bg-[#ededea]"
              >
                Cancelar
              </button>
              <button
                onClick={addNote}
                disabled={!noteText.trim() || !linkedCaseId || busy}
                className={`px-3 h-8 rounded-full text-[13px] font-semibold ${
                  !noteText.trim() || !linkedCaseId || busy
                    ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed'
                    : 'bg-[#1a1a1a] text-white hover:bg-black'
                }`}
              >
                {busy ? 'Enviando…' : 'Añadir nota'}
              </button>
            </div>
          </div>
        )}

        {/* Timeline */}
        {order.timeline.length > 0 && (
          <div>
            <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-2">Línea de tiempo</h3>
            <ul className="flex flex-col gap-2">
              {order.timeline.map(ev => (
                <li
                  key={ev.id}
                  className="rounded-xl border border-[#e9eae6] bg-[#f8f8f7] px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[#646462]">
                      {ev.type}
                      {ev.system && <span className="ml-1 text-[#1a1a1a]">· {ev.system}</span>}
                    </span>
                    <span className="text-[11px] text-[#646462]">{ev.time}</span>
                  </div>
                  <p className="text-[12.5px] text-[#1a1a1a] mt-1">{ev.content}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[#646462]">{label}</span>
      <span
        className={`text-[#1a1a1a] truncate text-right ${bold ? 'font-semibold' : 'font-medium'}`}
      >
        {value}
      </span>
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 px-3 h-10 rounded-xl border text-[13px] font-semibold transition-colors ${
        disabled
          ? 'bg-[#e9eae6] text-[#646462] border-[#e9eae6] cursor-not-allowed'
          : danger
          ? 'bg-white text-[#9a3412] border-[#e9eae6] hover:bg-[#fff4ec]'
          : 'bg-white text-[#1a1a1a] border-[#e9eae6] hover:bg-[#f8f8f7]'
      }`}
    >
      {icon}
      <span className="flex-1 text-left truncate">{label}</span>
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]">
        <path d="M6 4l4 4-4 4z" />
      </svg>
    </button>
  );
}

function ConfirmRow({
  tone,
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
  busy,
}: {
  tone: 'danger' | 'warning';
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  const cls =
    tone === 'danger'
      ? 'bg-[#fff1f2] border-[#fecaca]'
      : 'bg-[#fff4ec] border-[#fed7aa]';
  const btnCls =
    tone === 'danger'
      ? 'bg-[#9a3412] hover:bg-[#7a2812]'
      : 'bg-[#1a1a1a] hover:bg-black';
  return (
    <div className={`rounded-xl border p-4 mb-5 ${cls}`}>
      <p className="text-[13px] font-semibold text-[#1a1a1a]">{title}</p>
      <p className="text-[12.5px] text-[#646462] mt-1 mb-3">{body}</p>
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-white border border-[#e9eae6] hover:bg-[#f8f8f7]"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className={`px-3 h-8 rounded-full text-[13px] font-semibold text-white ${btnCls} disabled:opacity-60`}
        >
          {busy ? 'Procesando…' : confirmLabel}
        </button>
      </div>
    </div>
  );
}

// ── Right pane: Detalles tab (Copilot pending)
function RightPane({ order }: { order: Order | null }) {
  if (!order) return null;

  return (
    <div className="w-[320px] flex-shrink-0 border-l border-[#e9eae6] bg-white flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-1 px-3 pt-3 pb-2 border-b border-[#e9eae6] flex-shrink-0">
        <button className="px-3 h-8 rounded-full text-[13px] font-semibold bg-[#1a1a1a] text-white">
          Detalles
        </button>
        <button
          disabled
          title="Disponible próximamente"
          className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#646462] bg-[#f8f8f7] cursor-not-allowed"
        >
          Copilot
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <Section title="Atributos">
          <KV label="Order ID" value={order.orderId} mono />
          <KV label="Cliente" value={order.customerName} />
          <KV label="Total" value={order.total} bold />
          <KV label="Estado" value={order.orderStatus} />
          <KV label="Canal" value={order.channel || '—'} />
          <KV label="País" value={order.country} />
        </Section>

        <Section title="Sistemas">
          <KV label="OMS" value={order.systemStates.oms} />
          <KV label="PSP" value={order.systemStates.psp} />
          <KV label="WMS" value={order.systemStates.wms} />
          <KV label="Carrier" value={order.systemStates.carrier} />
        </Section>

        <Section title="Enlaces operativos">
          <ExternalLink
            href={`https://oms.example.local/orders/${encodeURIComponent(order.orderId)}`}
            label="Order Management System"
          />
          <ExternalLink
            href={`https://dashboard.stripe.com/search?query=${encodeURIComponent(order.orderId)}`}
            label="Payment Gateway (PSP)"
          />
          <ExternalLink
            href={`https://carrier.example.local/track/${encodeURIComponent(order.orderId)}`}
            label="Carrier Tracking Portal"
          />
        </Section>

        <Section title="Casos relacionados">
          {order.relatedCases.length === 0 ? (
            <p className="text-[12.5px] text-[#646462] italic">No hay casos relacionados.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {order.relatedCases.map(rc => (
                <li
                  key={rc.id}
                  className="flex items-center justify-between rounded-lg border border-[#e9eae6] px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-mono font-semibold text-[#1a1a1a] truncate">
                      {rc.id}
                    </p>
                    <p className="text-[11px] text-[#646462] truncate">{rc.type}</p>
                  </div>
                  <span className="text-[11px] font-semibold text-[#646462] bg-[#f8f8f7] border border-[#e9eae6] rounded-full px-2 py-0.5 flex-shrink-0">
                    {rc.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-2">
        {title}
      </p>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function KV({
  label,
  value,
  mono,
  bold,
}: {
  label: string;
  value: string;
  mono?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11.5px] text-[#646462]">{label}</span>
      <span
        className={`text-[12.5px] text-[#1a1a1a] truncate text-right ${
          bold ? 'font-semibold' : 'font-medium'
        } ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between rounded-lg border border-[#e9eae6] px-2.5 py-2 hover:bg-[#f8f8f7] text-[12.5px] text-[#1a1a1a]"
    >
      <span className="truncate">{label}</span>
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462] flex-shrink-0 ml-2">
        <path d="M5 1h7v7l-2.5-2.5L5.5 9.5 4 8l4-4zm-2 4v8h8v-3l1.5 1.5V14a1 1 0 01-1 1H2.5a1 1 0 01-1-1V4.5a1 1 0 011-1h2L6 5z" />
      </svg>
    </a>
  );
}

// ── Main OrdersV2 component
export default function OrdersV2() {
  const [activeTab, setActiveTab] = useState<OrderTab>('all');
  const [selectedId, setSelectedId] = useState<string>('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const {
    data: apiOrders,
    loading: listLoading,
    error: listError,
  } = useApi(
    () => ordersApi.list(activeTab !== 'all' ? { tab: activeTab } : {}),
    [activeTab, refreshKey],
    [],
  );

  const orders = useMemo(
    () => (Array.isArray(apiOrders) ? apiOrders.map(mapApiOrder) : []),
    [apiOrders],
  );

  const filtered = useMemo(() => {
    if (activeTab === 'all') return orders;
    if (activeTab === 'attention') {
      return orders.filter(
        o =>
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
          o.summary.toLowerCase().includes('return'),
      );
    }
    if (activeTab === 'refunds') {
      return orders.filter(
        o =>
          (o.refundStatus !== 'N/A' && o.refundStatus !== 'Not issued') ||
          o.summary.toLowerCase().includes('refund') ||
          o.badges.includes('Refund Pending'),
      );
    }
    if (activeTab === 'conflicts') {
      return orders.filter(o => o.conflictDetected !== '' || o.badges.includes('Conflict'));
    }
    return orders;
  }, [orders, activeTab]);

  const counts: Record<OrderTab, number> = useMemo(
    () => ({
      all: orders.length,
      attention: orders.filter(
        o =>
          o.conflictDetected !== '' ||
          o.riskLevel === 'High' ||
          o.approvalStatus === 'Pending',
      ).length,
      refunds: orders.filter(
        o =>
          o.summary.toLowerCase().includes('refund') || o.badges.includes('Refund Pending'),
      ).length,
      conflicts: orders.filter(
        o => o.conflictDetected !== '' || o.badges.includes('Conflict'),
      ).length,
    }),
    [orders],
  );

  // Auto-select first order when list changes
  useEffect(() => {
    if (filtered.length === 0) {
      if (selectedId) setSelectedId('');
      return;
    }
    if (!selectedId || !filtered.some(o => o.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  const selectedBase = useMemo(
    () => filtered.find(o => o.id === selectedId) || null,
    [filtered, selectedId],
  );

  const { data: detailRaw, loading: detailLoading } = useApi(
    () => (selectedBase ? ordersApi.get(selectedBase.id) : Promise.resolve(null)),
    [selectedBase?.id, refreshKey],
    null,
  );

  const selectedOrder = useMemo<Order | null>(() => {
    if (!selectedBase) return null;
    if (!detailRaw) return selectedBase;
    const detail = mapApiOrder(detailRaw);
    return {
      ...selectedBase,
      ...detail,
      timeline: detail.timeline.length > 0 ? detail.timeline : selectedBase.timeline,
      relatedCases:
        detail.relatedCases.length > 0 ? detail.relatedCases : selectedBase.relatedCases,
      canonicalContext: detail.canonicalContext ?? selectedBase.canonicalContext,
    };
  }, [selectedBase, detailRaw]);

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  return (
    <div className="flex flex-1 min-w-0 h-full overflow-hidden relative">
      <OrdersSidebar activeTab={activeTab} onTabChange={setActiveTab} counts={counts} />
      <OrdersList
        orders={filtered}
        selectedId={selectedOrder?.id || ''}
        onSelect={setSelectedId}
        syncActive={!listError}
      />
      <DetailPane
        order={selectedOrder}
        loading={detailLoading && !selectedOrder}
        onAction={showToast}
        onRefresh={() => setRefreshKey(k => k + 1)}
      />
      <RightPane order={selectedOrder} />

      {listLoading && orders.length === 0 && (
        <div className="absolute top-4 right-4 bg-white border border-[#e9eae6] rounded-lg px-3 py-2 text-[12px] text-[#646462] shadow-sm">
          Cargando pedidos…
        </div>
      )}
      {listError && (
        <div className="absolute top-4 right-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[12px] text-red-700 shadow-sm max-w-[320px]">
          Error: {String(listError)}
        </div>
      )}
      {toast && (
        <div
          className={`absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-[13px] font-semibold shadow-lg ${
            toast.type === 'success' ? 'bg-[#1a1a1a] text-white' : 'bg-[#9a3412] text-white'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
