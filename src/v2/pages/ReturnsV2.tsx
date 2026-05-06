// ReturnsV2 — migrado por agent-returns-01.
// ─────────────────────────────────────────────────────────────────────────────
// What works (this iteration):
//   • Real returns list from returnsApi.list()
//   • Tab filtering (ReturnTab: all / pending_review / in_transit /
//     received / refund_pending / blocked) with live counts in the sidebar
//   • Selecting a return loads full detail via returnsApi.get(id)
//   • Approve / Reject / Mark received / Process refund / Block actions →
//     returnsApi.updateStatus(id, { status }) with confirmation modal
//   • Resolve / Snooze / Close actions on the linked case via
//     casesApi.resolve() and casesApi.updateStatus() when present
//   • Right pane: Detalles tab (return attributes, system states, risk,
//     related cases, operational links) + Copilot tab (aiApi.copilot)
//     scoped to the related case when one exists
//   • Read-only timeline rendered from the canonical return events
//
// Pending for later iterations (still in src/components/Returns.tsx):
//   • Internal notes editor (the original is read-only; UI add-button is fake)
//   • Multi-select / batch actions across returns
//   • Connector writeback diff viewer (would require returnsApi.context())
//   • Full ActionModal "considerations / steps" copy reuse — kept simplified
//     here so we do not couple v2 to the legacy components/ActionModal
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect, useRef } from 'react';
import type { Return, ReturnTab, OrderTimelineEvent } from '../../types';
import { returnsApi, casesApi, aiApi } from '../../api/client';
import { useApi } from '../../api/hooks';

type CopilotMessage = { id: string; role: 'user' | 'assistant'; content: string; time: string };
type ActionKind = 'approve' | 'reject' | 'received' | 'refund' | 'block';

// ── Helpers (mirror legacy Returns.tsx so labels stay consistent) ───────────
const formatDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-';

const formatRelativeLabel = (v?: string | null) => {
  if (!v) return '-';
  const m = Math.max(1, Math.round((Date.now() - new Date(v).getTime()) / 60000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

const titleCase = (v?: string | null) =>
  v ? v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'N/A';

function mapApiReturn(r: any): Return {
  return {
    id: r.id,
    orderId: r.orderId || 'N/A',
    returnId: r.externalReturnId || r.id,
    customerName: r.customerName || 'Unknown',
    brand: r.brand || 'N/A',
    date: formatDate(r.createdAt),
    total: `$${Number(r.returnValue || 0).toFixed(2)}`,
    currency: r.currency || 'USD',
    country: r.country || 'N/A',
    returnType: r.type || 'Standard',
    returnReason: r.returnReason || 'N/A',
    returnValue: `$${Number(r.returnValue || 0).toFixed(2)}`,
    riskLevel: r.riskLevel === 'high' ? 'High' : r.riskLevel === 'medium' ? 'Medium' : 'Low',
    orderStatus: titleCase(r.systemStates?.oms || 'N/A'),
    returnStatus: titleCase(r.status || 'Unknown'),
    inspectionStatus: titleCase(r.inspectionStatus || 'N/A'),
    refundStatus: titleCase(r.refundStatus || 'N/A'),
    approvalStatus: titleCase(r.approvalStatus || 'N/A'),
    carrierStatus: titleCase(r.carrierStatus || r.systemStates?.carrier || 'N/A'),
    summary: r.summary || '',
    lastUpdate: formatRelativeLabel(r.lastUpdate),
    badges: Array.isArray(r.badges) ? r.badges : [],
    tab: (r.tab || 'all') as ReturnTab,
    conflictDetected: r.conflictDetected || '',
    recommendedNextAction: r.recommendedAction || '',
    context: r.canonicalContext?.caseState?.conflict?.rootCause || r.summary || '',
    method: r.method || 'N/A',
    systemStates: typeof r.systemStates === 'object' && r.systemStates ? {
      oms: r.systemStates.oms || 'N/A',
      returnsPlatform: r.systemStates.returnsPlatform || 'N/A',
      wms: r.systemStates.wms || 'N/A',
      carrier: r.systemStates.carrier || 'N/A',
      psp: r.systemStates.psp || 'N/A',
      canonical: r.systemStates.canonical || 'N/A',
    } : { oms: 'N/A', returnsPlatform: 'N/A', wms: 'N/A', carrier: 'N/A', psp: 'N/A', canonical: 'N/A' },
    relatedCases: Array.isArray(r.relatedCases) ? r.relatedCases.map((c: any) => ({
      id: c.caseNumber || c.id,
      type: c.type || 'Case',
      status: titleCase(c.status || 'open'),
    })) : [],
    timeline: (r.events || []).map((e: any, i: number) => ({
      id: e.id || String(i),
      type: e.type || 'system',
      content: e.content,
      time: e.time || e.occurredAt || '-',
      system: e.system || e.source,
    })) as OrderTimelineEvent[],
  };
}

// ── Sidebar (left, 236px) — Devoluciones + tab nav with counts ──────────────
const TAB_DEFS: { id: ReturnTab; label: string }[] = [
  { id: 'all',            label: 'Todas las devoluciones' },
  { id: 'pending_review', label: 'Pendientes de revisión' },
  { id: 'in_transit',     label: 'En tránsito' },
  { id: 'received',       label: 'Recibidas' },
  { id: 'refund_pending', label: 'Reembolso pendiente' },
  { id: 'blocked',        label: 'Bloqueadas' },
];

function ReturnsSidebar({ activeTab, onTabChange, counts }: {
  activeTab: ReturnTab;
  onTabChange: (t: ReturnTab) => void;
  counts: Record<ReturnTab, number>;
}) {
  const [openVistas, setOpenVistas] = useState(true);

  const Chev = ({ open }: { open: boolean }) => (
    <svg viewBox="0 0 16 16" className={`w-3.5 h-3.5 fill-[#646462] transition-transform ${open ? 'rotate-90' : ''}`}>
      <path d="M6 4l4 4-4 4z"/>
    </svg>
  );
  const itemCls = (active: boolean) =>
    `relative flex items-center gap-2 h-8 pl-3 pr-3 py-1 rounded-lg cursor-pointer text-[13px] w-full text-left transition-colors ${
      active
        ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]'
        : 'hover:bg-[#e9eae6]/40 text-[#1a1a1a]'
    }`;

  // One filled icon per tab, all #1a1a1a per the design system.
  const iconFor = (id: ReturnTab) => {
    switch (id) {
      case 'all':
        return <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M2 3h12v2H2zm0 4h12v2H2zm0 4h12v2H2z"/></svg>;
      case 'pending_review':
        return <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8.75 4v3.69l2.6 1.5-.75 1.3L7.25 8.5V4h1.5z"/></svg>;
      case 'in_transit':
        return <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M1 4h9v6H1zm10 1h2.5l1.5 2v3h-4z"/><circle cx="4" cy="11.5" r="1.5"/><circle cx="12" cy="11.5" r="1.5"/></svg>;
      case 'received':
        return <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M2 4h12v9H2z"/><path d="M5 6h6v1.5H5z" fill="#fff"/></svg>;
      case 'refund_pending':
        return <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M8 1l1.6 4.7H14L10.4 8.3 11.7 13 8 10l-3.7 3 1.3-4.7L2 5.7h4.4z"/></svg>;
      case 'blocked':
        return <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zm0 2a4.5 4.5 0 013.13 7.73L4.27 4.87A4.5 4.5 0 018 3.5z"/></svg>;
    }
  };

  return (
    <div className="flex flex-col h-full w-[236px] bg-[#f8f8f7] border-r border-[#e9eae6] flex-shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 h-16 flex-shrink-0">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Devoluciones</span>
      </div>
      <div className="flex-1 overflow-y-auto pl-3 pr-3 pb-4">
        <div className="flex flex-col gap-0.5">
          {TAB_DEFS.map(t => (
            <button key={t.id} onClick={() => onTabChange(t.id)} className={itemCls(activeTab === t.id)}>
              {iconFor(t.id)}
              <span className="flex-1">{t.label}</span>
              {counts[t.id] > 0 && (
                <span className={`text-[11px] font-semibold ${activeTab === t.id ? 'text-[#1a1a1a]' : 'text-[#646462]'}`}>
                  {counts[t.id]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <button onClick={() => setOpenVistas(o => !o)} className="w-full flex items-center justify-between h-8 px-3 cursor-pointer hover:bg-[#ededea]/40 rounded-[6px]">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Vistas guardadas</span>
            <Chev open={openVistas} />
          </button>
          {openVistas && (
            <div className="px-3 py-1 text-[12px] text-[#646462] italic">No hay vistas guardadas.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── List pane (310px) ───────────────────────────────────────────────────────
function ReturnsList({ returns, selectedId, onSelect, tabLabel }: {
  returns: Return[];
  selectedId: string;
  onSelect: (id: string) => void;
  tabLabel: string;
}) {
  return (
    <div className="flex flex-col h-full w-[310px] border-l border-[#e9eae6] bg-[#f8f8f7] flex-shrink-0">
      <div className="flex items-center justify-between px-3 py-3 h-16 flex-shrink-0">
        <span className="text-[16px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">
          {returns.length} {tabLabel}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-6 flex flex-col gap-0">
        {returns.length === 0 && (
          <div className="text-center text-[13px] text-[#646462] py-8">Sin devoluciones</div>
        )}
        {returns.map((r, i) => {
          const isSelected = r.id === selectedId;
          return (
            <div key={r.id}>
              {i > 0 && <div className="flex justify-center py-0.5"><div className="w-[260px] h-[1px] bg-[#e9eae6]" /></div>}
              <button
                onClick={() => onSelect(r.id)}
                className={`relative flex flex-col gap-1 px-3 py-3 rounded-xl cursor-pointer w-full text-left ${
                  isSelected ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]' : 'hover:bg-white/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[13px] truncate ${isSelected ? 'font-semibold text-[#1a1a1a]' : 'font-bold text-[#1a1a1a]'}`}>
                    {r.customerName}
                  </span>
                  <span className="text-[11px] text-[#646462] flex-shrink-0 ml-2">{r.lastUpdate}</span>
                </div>
                <p className="text-[11px] font-mono text-[#646462] truncate">{r.returnId}</p>
                <p className="text-[12.5px] text-[#1a1a1a] truncate">{r.summary || '—'}</p>
                <div className="flex items-center justify-between mt-1">
                  <div className="flex flex-wrap gap-1">
                    {r.badges.slice(0, 2).map(b => {
                      const danger = b === 'Conflict' || b === 'High Risk' || b === 'Blocked';
                      return (
                        <span
                          key={b}
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${
                            danger
                              ? 'bg-[#fef2f2] text-[#9a3412] border-[#fecaca]'
                              : 'bg-white text-[#1a1a1a] border-[#e9eae6]'
                          }`}
                        >
                          {b}
                        </span>
                      );
                    })}
                  </div>
                  <span className="text-[12px] font-semibold text-[#1a1a1a]">{r.returnValue}</span>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Confirmation modal (inline, no legacy ActionModal coupling) ─────────────
function ConfirmModal({ open, kind, ret, onClose, onConfirm, loading }: {
  open: boolean;
  kind: ActionKind | null;
  ret: Return | null;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  if (!open || !kind || !ret) return null;

  const config = {
    approve:  { title: 'Aprobar devolución',     verb: 'Aprobar',           danger: false, body: `Se autorizará el reembolso de ${ret.returnValue} para ${ret.customerName} y se desbloquearán los flujos posteriores.` },
    reject:   { title: 'Rechazar devolución',    verb: 'Rechazar',          danger: true,  body: `Se denegará la devolución ${ret.returnId}. Los flujos de reembolso y reemplazo quedarán bloqueados.` },
    received: { title: 'Marcar como recibida',   verb: 'Confirmar recepción', danger: false, body: `Se confirma la recepción física en almacén para ${ret.returnId}. Esto desbloquea inspección y reembolso.` },
    refund:   { title: `Procesar reembolso — ${ret.returnValue}`, verb: 'Iniciar reembolso', danger: false, body: `Se enviará el reembolso de ${ret.returnValue} al PSP (${ret.systemStates.psp}). Este paso es irreversible una vez confirmado.` },
    block:    { title: 'Bloquear devolución',    verb: 'Bloquear',          danger: true,  body: `Se detendrá todo procesamiento automático en OMS, WMS y PSP. Un supervisor deberá desbloquear manualmente para reanudar.` },
  }[kind];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl border border-[#e9eae6] shadow-[0px_8px_32px_rgba(20,20,20,0.20)] w-[480px] max-w-[90vw] flex flex-col">
        <div className="px-6 py-5 border-b border-[#e9eae6]">
          <h3 className="text-[18px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">{config.title}</h3>
          <p className="text-[12.5px] text-[#646462] mt-1">{ret.returnId} · {ret.customerName}</p>
        </div>
        <div className="px-6 py-5 flex flex-col gap-3">
          <p className="text-[13.5px] leading-[20px] text-[#1a1a1a]">{config.body}</p>
          <div className="grid grid-cols-2 gap-3 text-[12px]">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wider text-[#646462]">Estado actual</span>
              <span className="text-[#1a1a1a] font-semibold">{ret.returnStatus}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wider text-[#646462]">Riesgo</span>
              <span className={`font-semibold ${ret.riskLevel === 'High' ? 'text-[#9a3412]' : 'text-[#1a1a1a]'}`}>{ret.riskLevel}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wider text-[#646462]">Aprobación</span>
              <span className="text-[#1a1a1a] font-semibold">{ret.approvalStatus}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wider text-[#646462]">Reembolso</span>
              <span className="text-[#1a1a1a] font-semibold">{ret.refundStatus}</span>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[#e9eae6] flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] hover:bg-[#ededea] disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-3 h-8 rounded-full text-[13px] font-semibold text-white ${
              loading ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed' :
              config.danger ? 'bg-[#9a3412] hover:bg-[#7a2812]' : 'bg-[#1a1a1a] hover:bg-black'
            }`}
          >
            {loading ? 'Aplicando…' : config.verb}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detail pane: action bar, info grid, timeline ────────────────────────────
function DetailPane({ ret, loading, onAction, onResolveCase, onSnoozeCase, onCloseCase }: {
  ret: Return | null;
  loading: boolean;
  onAction: (kind: ActionKind) => void;
  onResolveCase: (caseId: string) => void;
  onSnoozeCase: (caseId: string) => void;
  onCloseCase: (caseId: string) => void;
}) {
  if (loading && !ret) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#646462] text-[13.5px]">
        Cargando devolución…
      </div>
    );
  }
  if (!ret) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#646462] text-[13.5px]">
        Selecciona una devolución
      </div>
    );
  }

  const linkedCaseId = ret.relatedCases[0]?.id;

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 h-16 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-[#9ec5fa] flex items-center justify-center flex-shrink-0">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">
              {ret.customerName.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-[#1a1a1a] leading-tight truncate">{ret.customerName}</p>
            <p className="text-[12px] text-[#646462] truncate">
              {ret.returnId} · {ret.orderId} · {ret.country}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {linkedCaseId && (
            <>
              <button onClick={() => onSnoozeCase(linkedCaseId)} className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] hover:bg-[#ededea]">Posponer caso</button>
              <button onClick={() => onResolveCase(linkedCaseId)} className="px-3 h-8 rounded-full text-[13px] font-semibold text-white bg-[#1a1a1a] hover:bg-black">Resolver caso</button>
              <button onClick={() => onCloseCase(linkedCaseId)} className="px-3 h-8 rounded-full text-[13px] font-semibold text-white bg-[#9a3412] hover:bg-[#7a2812]">Cerrar caso</button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
        {/* Action bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { id: 'approve',  label: 'Aprobar' },
            { id: 'reject',   label: 'Rechazar' },
            { id: 'received', label: 'Marcar recibida' },
            { id: 'refund',   label: 'Procesar reembolso' },
            { id: 'block',    label: 'Bloquear' },
          ] as const).map(a => (
            <button
              key={a.id}
              onClick={() => onAction(a.id)}
              className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] border border-[#e9eae6] hover:bg-[#ededea]"
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* Status pill row */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2 py-0.5 rounded-md bg-[#f8f8f7] border border-[#e9eae6] text-[12px] font-semibold text-[#1a1a1a]">
            {ret.returnStatus}
          </span>
          <span className="px-2 py-0.5 rounded-md bg-[#f8f8f7] border border-[#e9eae6] text-[12px] text-[#1a1a1a]">
            Reembolso: {ret.refundStatus}
          </span>
          <span className="px-2 py-0.5 rounded-md bg-[#f8f8f7] border border-[#e9eae6] text-[12px] text-[#1a1a1a]">
            Aprobación: {ret.approvalStatus}
          </span>
          <span className={`px-2 py-0.5 rounded-md border text-[12px] font-semibold ${
            ret.riskLevel === 'High' ? 'bg-[#fef2f2] text-[#9a3412] border-[#fecaca]' :
            ret.riskLevel === 'Medium' ? 'bg-[#fff7ed] text-[#9a3412] border-[#fed7aa]' :
            'bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]'
          }`}>
            Riesgo {ret.riskLevel}
          </span>
        </div>

        {ret.recommendedNextAction && (
          <div className="rounded-xl border border-[#e9eae6] bg-[#f8f8f7] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#646462] mb-1">Acción recomendada</p>
            <p className="text-[13.5px] text-[#1a1a1a]">{ret.recommendedNextAction}</p>
          </div>
        )}

        {ret.conflictDetected && (
          <div className="rounded-xl border border-[#fed7aa] bg-[#fff7ed] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9a3412] mb-1">Conflicto detectado</p>
            <p className="text-[13.5px] text-[#1a1a1a]">{ret.conflictDetected}</p>
          </div>
        )}

        {/* Info grid */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-[#e9eae6] bg-[#f8f8f7] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#646462] mb-2">Datos de la devolución</p>
            <div className="flex flex-col gap-1.5 text-[12.5px]">
              <div className="flex justify-between"><span className="text-[#646462]">Motivo</span><span className="text-[#1a1a1a] font-semibold">{ret.returnReason}</span></div>
              <div className="flex justify-between"><span className="text-[#646462]">Método</span><span className="text-[#1a1a1a] font-semibold">{ret.method}</span></div>
              <div className="flex justify-between"><span className="text-[#646462]">Importe</span><span className="text-[#1a1a1a] font-semibold">{ret.returnValue}</span></div>
              <div className="flex justify-between"><span className="text-[#646462]">Marca</span><span className="text-[#1a1a1a] font-semibold">{ret.brand}</span></div>
            </div>
          </div>
          <div className="rounded-xl border border-[#e9eae6] bg-[#f8f8f7] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#646462] mb-2">Estado de sistemas</p>
            <div className="flex flex-col gap-1.5 text-[12.5px]">
              <div className="flex justify-between"><span className="text-[#646462]">OMS</span><span className="text-[#1a1a1a] font-semibold">{ret.systemStates.oms}</span></div>
              <div className="flex justify-between"><span className="text-[#646462]">WMS</span><span className="text-[#1a1a1a] font-semibold">{ret.systemStates.wms}</span></div>
              <div className="flex justify-between"><span className="text-[#646462]">Carrier</span><span className="text-[#1a1a1a] font-semibold">{ret.systemStates.carrier}</span></div>
              <div className="flex justify-between"><span className="text-[#646462]">PSP</span><span className="text-[#1a1a1a] font-semibold">{ret.systemStates.psp}</span></div>
            </div>
          </div>
          <div className="rounded-xl border border-[#e9eae6] bg-[#f8f8f7] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#646462] mb-2">Análisis de riesgo</p>
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2 h-2 rounded-full ${ret.riskLevel === 'High' ? 'bg-[#9a3412]' : ret.riskLevel === 'Medium' ? 'bg-[#fa7938]' : 'bg-[#15803d]'}`} />
              <span className="text-[13px] font-semibold text-[#1a1a1a]">{ret.riskLevel}</span>
            </div>
            <p className="text-[11px] text-[#646462] leading-[16px]">Basado en historial del cliente y frecuencia de devoluciones.</p>
          </div>
        </div>

        {/* Timeline */}
        <div className="rounded-xl border border-[#e9eae6] bg-white">
          <div className="px-4 py-3 border-b border-[#e9eae6]">
            <p className="text-[13px] font-semibold text-[#1a1a1a]">Cronología de la devolución</p>
          </div>
          <div className="px-4 py-3">
            {ret.timeline.length === 0 ? (
              <p className="text-[12.5px] text-[#646462] italic">Sin eventos registrados todavía.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {ret.timeline.map(ev => (
                  <li key={ev.id} className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#1a1a1a] mt-2 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] text-[#1a1a1a]">{ev.content || ev.type}</p>
                      <p className="text-[11px] text-[#646462] mt-0.5">
                        {ev.system ? `${ev.system} · ` : ''}{ev.time}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Right pane: Detalles + Copilot ──────────────────────────────────────────
function RightPane({ ret, copilotMessages, onSendCopilot, copilotLoading, copilotEnabled }: {
  ret: Return | null;
  copilotMessages: CopilotMessage[];
  onSendCopilot: (q: string) => void;
  copilotLoading: boolean;
  copilotEnabled: boolean;
}) {
  const [tab, setTab] = useState<'details' | 'copilot'>('details');
  const [copilotInput, setCopilotInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [copilotMessages.length]);

  if (!ret) return null;

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
          onClick={() => setTab('details')}
          className={`px-3 h-8 rounded-full text-[13px] font-semibold transition-colors ${
            tab === 'details' ? 'bg-[#1a1a1a] text-white' : 'text-[#646462] hover:bg-[#f8f8f7]'
          }`}
        >
          Detalles
        </button>
        <button
          onClick={() => setTab('copilot')}
          disabled={!copilotEnabled}
          className={`px-3 h-8 rounded-full text-[13px] font-semibold transition-colors ${
            tab === 'copilot' ? 'bg-[#1a1a1a] text-white' :
            !copilotEnabled ? 'text-[#646462]/50 cursor-not-allowed' :
            'text-[#646462] hover:bg-[#f8f8f7]'
          }`}
        >
          Copilot
        </button>
      </div>

      {tab === 'details' && (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          <div>
            <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-2">Devolución</p>
            <p className="text-[14px] font-semibold text-[#1a1a1a] font-mono">{ret.returnId}</p>
            <p className="text-[12.5px] text-[#646462]">Pedido {ret.orderId}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#646462] mb-0.5">Cliente</p>
              <p className="text-[12.5px] font-semibold text-[#1a1a1a]">{ret.customerName}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#646462] mb-0.5">País</p>
              <p className="text-[12.5px] font-semibold text-[#1a1a1a]">{ret.country}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#646462] mb-0.5">Importe</p>
              <p className="text-[12.5px] font-semibold text-[#1a1a1a]">{ret.returnValue}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#646462] mb-0.5">Estado</p>
              <p className="text-[12.5px] font-semibold text-[#1a1a1a]">{ret.returnStatus}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#646462] mb-0.5">Motivo</p>
              <p className="text-[12.5px] text-[#1a1a1a]">{ret.returnReason}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#646462] mb-0.5">Método</p>
              <p className="text-[12.5px] text-[#1a1a1a]">{ret.method}</p>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-2">Casos relacionados</p>
            {ret.relatedCases.length === 0 ? (
              <p className="text-[12px] text-[#646462] italic">Sin casos vinculados.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {ret.relatedCases.map(rc => (
                  <li key={rc.id} className="flex items-center justify-between p-2 rounded-lg border border-[#e9eae6]">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[12px] font-semibold text-[#1a1a1a] font-mono truncate">{rc.id}</span>
                      <span className="text-[11px] text-[#646462] truncate">{rc.type}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-[#f8f8f7] text-[10px] text-[#1a1a1a] flex-shrink-0">{rc.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-2">Enlaces operativos</p>
            <div className="flex flex-col gap-1.5">
              <a href={`https://oms.example.local/orders/${encodeURIComponent(ret.orderId)}`} target="_blank" rel="noreferrer" className="flex items-center justify-between px-2 py-1.5 rounded-lg border border-[#e9eae6] text-[12px] text-[#1a1a1a] hover:bg-[#f8f8f7]">
                Sistema de pedidos (OMS)
                <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M11 1H6v1.5h2.44L4 6.94 5.06 8 9.5 3.56V6H11zM2 4v9h9V8.5H9.5V11.5H3.5V5.5H6.5V4z"/></svg>
              </a>
              <a href={`https://returns.example.local/returns/${encodeURIComponent(ret.returnId)}`} target="_blank" rel="noreferrer" className="flex items-center justify-between px-2 py-1.5 rounded-lg border border-[#e9eae6] text-[12px] text-[#1a1a1a] hover:bg-[#f8f8f7]">
                Plataforma de devoluciones
                <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M11 1H6v1.5h2.44L4 6.94 5.06 8 9.5 3.56V6H11zM2 4v9h9V8.5H9.5V11.5H3.5V5.5H6.5V4z"/></svg>
              </a>
              <a href={`https://wms.example.local/tickets/${encodeURIComponent(ret.returnId)}`} target="_blank" rel="noreferrer" className="flex items-center justify-between px-2 py-1.5 rounded-lg border border-[#e9eae6] text-[12px] text-[#1a1a1a] hover:bg-[#f8f8f7]">
                Almacén (WMS)
                <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M11 1H6v1.5h2.44L4 6.94 5.06 8 9.5 3.56V6H11zM2 4v9h9V8.5H9.5V11.5H3.5V5.5H6.5V4z"/></svg>
              </a>
            </div>
          </div>
        </div>
      )}

      {tab === 'copilot' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {!copilotEnabled && (
              <div className="text-center text-[12.5px] text-[#646462] py-6">
                Copilot requiere un caso vinculado a esta devolución.
              </div>
            )}
            {copilotEnabled && copilotMessages.length === 0 && (
              <div className="text-center text-[12.5px] text-[#646462] py-6">
                <p className="font-semibold mb-1">Pregúntame sobre esta devolución</p>
                <p>Tengo contexto del pedido, WMS, transportista e historial.</p>
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
                className="w-full min-h-[60px] resize-y rounded-xl border border-[#e9eae6] px-3 py-2 text-[13px] text-[#1a1a1a] placeholder:text-[#646462] focus:outline-none focus:border-[#1a1a1a] disabled:opacity-60"
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

// ── Main ReturnsV2 component ────────────────────────────────────────────────
export default function ReturnsV2() {
  const [activeTab, setActiveTab] = useState<ReturnTab>('all');
  const [selectedId, setSelectedId] = useState<string>('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [pendingAction, setPendingAction] = useState<ActionKind | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [copilotByCaseId, setCopilotByCaseId] = useState<Record<string, CopilotMessage[]>>({});
  const [copilotLoading, setCopilotLoading] = useState(false);

  const { data: apiReturns, loading: listLoading, error: listError } = useApi(
    () => returnsApi.list(),
    [refreshKey],
    [],
  );

  const returns = useMemo(
    () => (Array.isArray(apiReturns) ? apiReturns.map(mapApiReturn) : []),
    [apiReturns],
  );

  const filtered = useMemo(
    () => returns.filter(r => activeTab === 'all' ? true : r.tab === activeTab),
    [returns, activeTab],
  );

  // Counts per tab — for the sidebar badges.
  const counts = useMemo(() => {
    const c: Record<ReturnTab, number> = {
      all: returns.length,
      pending_review: 0,
      in_transit: 0,
      received: 0,
      refund_pending: 0,
      blocked: 0,
    };
    for (const r of returns) if (r.tab !== 'all' && c[r.tab] !== undefined) c[r.tab] += 1;
    return c;
  }, [returns]);

  // Auto-select first when list changes
  useEffect(() => {
    if (filtered.length === 0) {
      if (selectedId) setSelectedId('');
      return;
    }
    if (!filtered.find(r => r.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  // Detail fetch — merges with list base, like legacy Returns.tsx
  const selectedBase = filtered.find(r => r.id === selectedId) || filtered[0] || null;
  const { data: detailRaw, loading: detailLoading } = useApi(
    () => selectedBase ? returnsApi.get(selectedBase.id) : Promise.resolve(null),
    [selectedBase?.id, refreshKey],
    null,
  );

  const selectedReturn: Return | null = useMemo(() => {
    if (!selectedBase) return null;
    if (!detailRaw) return selectedBase;
    const d = mapApiReturn(detailRaw);
    return {
      ...selectedBase,
      ...d,
      timeline: d.timeline.length > 0 ? d.timeline : selectedBase.timeline,
      relatedCases: d.relatedCases.length > 0 ? d.relatedCases : selectedBase.relatedCases,
    };
  }, [selectedBase, detailRaw]);

  const linkedCaseId = selectedReturn?.relatedCases[0]?.id || null;

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Status update via returnsApi.updateStatus ─────────────────────────────
  const ACTION_TO_STATUS: Record<ActionKind, { status: string; label: string }> = {
    approve:  { status: 'approved',       label: 'aprobada' },
    reject:   { status: 'rejected',       label: 'rechazada' },
    received: { status: 'received',       label: 'marcada como recibida' },
    refund:   { status: 'refund_pending', label: 'enviada a reembolso' },
    block:    { status: 'blocked',        label: 'bloqueada' },
  };

  async function confirmAction() {
    if (!pendingAction || !selectedReturn) return;
    const cfg = ACTION_TO_STATUS[pendingAction];
    setActionLoading(true);
    try {
      await returnsApi.updateStatus(selectedReturn.id, { status: cfg.status });
      showToast(`Devolución ${cfg.label}`, 'success');
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      showToast(err?.message || 'Error al actualizar la devolución', 'error');
    } finally {
      setActionLoading(false);
      setPendingAction(null);
    }
  }

  // ── Linked-case actions ───────────────────────────────────────────────────
  async function handleResolveCase(caseId: string) {
    try { await casesApi.resolve(caseId); showToast('Caso resuelto', 'success'); }
    catch (err: any) { showToast(err?.message || 'Error al resolver el caso', 'error'); }
  }
  async function handleSnoozeCase(caseId: string) {
    try { await casesApi.updateStatus(caseId, 'snoozed', 'Snoozed from Returns'); showToast('Caso pospuesto', 'success'); }
    catch (err: any) { showToast(err?.message || 'Error al posponer el caso', 'error'); }
  }
  async function handleCloseCase(caseId: string) {
    try { await casesApi.updateStatus(caseId, 'closed', 'Closed from Returns'); showToast('Caso cerrado', 'success'); }
    catch (err: any) { showToast(err?.message || 'Error al cerrar el caso', 'error'); }
  }

  // ── Copilot (scoped to linked case) ───────────────────────────────────────
  async function sendCopilot(question: string) {
    if (!linkedCaseId) return;
    const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const userMsg: CopilotMessage = { id: `u-${Date.now()}`, role: 'user', content: question, time: now };
    setCopilotByCaseId(s => ({ ...s, [linkedCaseId]: [...(s[linkedCaseId] || []), userMsg] }));
    setCopilotLoading(true);
    try {
      const history = (copilotByCaseId[linkedCaseId] || []).map(m => ({ role: m.role, content: m.content }));
      const result = await aiApi.copilot(linkedCaseId, question, history);
      const assistantMsg: CopilotMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: result?.answer || result?.content || result?.response || 'Sin respuesta',
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      };
      setCopilotByCaseId(s => ({ ...s, [linkedCaseId]: [...(s[linkedCaseId] || []), assistantMsg] }));
    } catch (err: any) {
      const errorMsg: CopilotMessage = {
        id: `e-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ Error: ${err?.message || 'No pude responder'}`,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      };
      setCopilotByCaseId(s => ({ ...s, [linkedCaseId]: [...(s[linkedCaseId] || []), errorMsg] }));
    } finally {
      setCopilotLoading(false);
    }
  }

  const tabLabel = TAB_DEFS.find(t => t.id === activeTab)?.label.toLowerCase() || 'devoluciones';

  return (
    <div className="flex flex-1 min-w-0 h-full overflow-hidden relative">
      <ReturnsSidebar activeTab={activeTab} onTabChange={(t) => { setActiveTab(t); setSelectedId(''); }} counts={counts} />
      <ReturnsList
        returns={filtered}
        selectedId={selectedReturn?.id || ''}
        onSelect={setSelectedId}
        tabLabel={tabLabel}
      />
      <DetailPane
        ret={selectedReturn}
        loading={detailLoading}
        onAction={setPendingAction}
        onResolveCase={handleResolveCase}
        onSnoozeCase={handleSnoozeCase}
        onCloseCase={handleCloseCase}
      />
      <RightPane
        ret={selectedReturn}
        copilotMessages={linkedCaseId ? (copilotByCaseId[linkedCaseId] || []) : []}
        onSendCopilot={sendCopilot}
        copilotLoading={copilotLoading}
        copilotEnabled={!!linkedCaseId}
      />

      <ConfirmModal
        open={!!pendingAction}
        kind={pendingAction}
        ret={selectedReturn}
        onClose={() => !actionLoading && setPendingAction(null)}
        onConfirm={confirmAction}
        loading={actionLoading}
      />

      {listLoading && returns.length === 0 && (
        <div className="absolute top-4 right-4 bg-white border border-[#e9eae6] rounded-lg px-3 py-2 text-[12px] text-[#646462] shadow-sm">
          Cargando devoluciones…
        </div>
      )}
      {listError && (
        <div className="absolute top-4 right-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[12px] text-red-700 shadow-sm">
          Error: {String((listError as any)?.message || listError)}
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
