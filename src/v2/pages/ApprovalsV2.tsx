// ApprovalsV2 — migrado por agent-approvals-01.
// ─────────────────────────────────────────────────────────────────────────────
// What works (this iteration):
//   • Lista paginada de aprobaciones reales → approvalsApi.list({ limit, offset })
//   • Filtros por estado (pending / approved / rejected) con contadores en sidebar
//   • Búsqueda libre (id, caseNumber, customer, assignee, actionType)
//   • Selección de aprobación → detalle completo via approvalsApi.context(id)
//   • Aprobar → approvalsApi.decide(id, 'approved', note, 'Admin')
//   • Rechazar → approvalsApi.decide(id, 'rejected', note, 'Admin')
//   • Modal de confirmación con nota de decisión y resumen de impacto
//   • Badge writeback (completed / pending / failed / unknown / not_applicable)
//   • Sidebar con patrón Fin AI Agent — header "Aprobaciones" y filtros
//   • Detail panel con secciones: Request / Conversation / Timeline / Decision /
//     Policy / Systems / Evidence (todas leyendo del context backend)
//
// Pending for later iterations (still in src/components/Approvals.tsx):
//   • ActionModal animado de motion/react — aquí uso un modal simpler nativo
//   • Navegación cross-page (openCaseGraph, openInbox, openKnowledge) — los
//     handlers están preparados pero V2App aún no acepta entityId; cuando se
//     extienda navigate(), los botones "Open inbox / Open case graph" del
//     detail card podrán saltar al caso correcto
//   • FocusItem mecanismo (artifact focus on click) — simplificado: ahora cada
//     mensaje/timeline/system es informativo, sin el "focused item" panel
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect } from 'react';
import { approvalsApi } from '../../api/client';
import { useApi, useMutation } from '../../api/hooks';

type ApprovalStatus = 'pending' | 'approved' | 'rejected';
type Decision = 'approved' | 'rejected';

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

// ── Helpers (mirrored from src/components/Approvals.tsx) ────────────────────
const titleCase = (value: string) => value
  .replace(/[_-]+/g, ' ')
  .split(' ')
  .filter(Boolean)
  .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
  .join(' ');

const formatDate = (value?: string | null) => (
  value ? new Date(value).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : 'N/A'
);

const formatMoney = (value: any) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    maximumFractionDigits: numeric % 1 === 0 ? 0 : 2,
  }).format(numeric);
};

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

function statusPillCls(status?: string | null) {
  if (status === 'approved') return 'bg-[#dff5e1] text-[#176b1f] border border-[#bce5c2]';
  if (status === 'rejected') return 'bg-[#fde2e1] text-[#9a1d1a] border border-[#f4b8b6]';
  return 'bg-[#fff1d6] text-[#7a4a00] border border-[#f3d59a]';
}

function statusPillLabel(status?: string | null) {
  if (status === 'approved') return 'Aprobada';
  if (status === 'rejected') return 'Rechazada';
  return 'Pendiente';
}

function riskPillCls(level?: string | null) {
  const v = (level || '').toLowerCase();
  if (v === 'high')   return 'bg-[#fde2e1] text-[#9a1d1a] border border-[#f4b8b6]';
  if (v === 'medium') return 'bg-[#fff1d6] text-[#7a4a00] border border-[#f3d59a]';
  if (v === 'low')    return 'bg-[#dff5e1] text-[#176b1f] border border-[#bce5c2]';
  return 'bg-[#f3f3f1] text-[#646462] border border-[#e9eae6]';
}

function WritebackBadge({ wb }: { wb: ApprovalRecord['writeback'] }) {
  if (!wb || wb.status === 'not_applicable') return null;
  const map: Record<string, { label: string; cls: string; dot: string; title: string }> = {
    completed: {
      label: wb.executedVia ? `Writeback ${wb.executedVia}` : 'Writeback OK',
      cls: 'bg-[#dff5e1] text-[#176b1f] border border-[#bce5c2]',
      dot: 'bg-[#22a043]',
      title: wb.externalId ? `External id: ${wb.externalId}` : 'Connector confirmed the action',
    },
    pending: {
      label: 'Writeback pendiente',
      cls: 'bg-[#fff1d6] text-[#7a4a00] border border-[#f3d59a]',
      dot: 'bg-[#d99500]',
      title: 'Aprobado localmente; el conector aún no ha confirmado',
    },
    failed: {
      label: 'Writeback falló',
      cls: 'bg-[#fde2e1] text-[#9a1d1a] border border-[#f4b8b6]',
      dot: 'bg-[#c93e3a]',
      title: wb.error ? `Connector error: ${wb.error}` : 'El conector devolvió un error',
    },
    unknown: {
      label: 'Writeback desconocido',
      cls: 'bg-[#f3f3f1] text-[#646462] border border-[#e9eae6]',
      dot: 'bg-[#9a9a98]',
      title: 'No se pudo resolver el pago/pedido subyacente',
    },
  };
  const info = map[wb.status];
  if (!info) return null;
  return (
    <span title={info.title} className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${info.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${info.dot}`} />
      {info.label}
    </span>
  );
}

// ── Sidebar (236px) — status filters + counts, header "Aprobaciones"
function ApprovalsSidebar({
  filter, onFilterChange, counts, query, onQueryChange,
}: {
  filter: ApprovalStatus;
  onFilterChange: (s: ApprovalStatus) => void;
  counts: { pending: number; approved: number; rejected: number };
  query: string;
  onQueryChange: (q: string) => void;
}) {
  const itemCls = (active: boolean) =>
    `relative flex items-center gap-2 h-8 pl-3 pr-3 py-1 rounded-lg cursor-pointer text-[13px] w-full text-left transition-colors ${
      active
        ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]'
        : 'hover:bg-[#e9eae6]/40 text-[#1a1a1a]'
    }`;

  const Tab = ({ value, label, count, icon }: { value: ApprovalStatus; label: string; count: number; icon: React.ReactNode }) => (
    <button onClick={() => onFilterChange(value)} className={itemCls(filter === value)}>
      {icon}
      <span className="flex-1">{label}</span>
      <span className={`text-[11px] font-semibold ${filter === value ? 'text-[#1a1a1a]' : 'text-[#646462]'}`}>{count}</span>
    </button>
  );

  return (
    <div className="flex flex-col h-full w-[236px] bg-[#f8f8f7] border-r border-[#e9eae6] flex-shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 h-16 flex-shrink-0">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Aprobaciones</span>
      </div>

      {/* Search */}
      <div className="px-3 pb-2 flex-shrink-0">
        <div className="relative">
          <svg viewBox="0 0 16 16" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 fill-[#646462] pointer-events-none">
            <path d="M7 1a6 6 0 014.7 9.7l3.3 3.3-1.4 1.4-3.3-3.3A6 6 0 117 1zm0 2a4 4 0 100 8 4 4 0 000-8z"/>
          </svg>
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscar aprobaciones…"
            className="w-full h-8 rounded-lg bg-white border border-[#e9eae6] pl-8 pr-2 text-[12.5px] text-[#1a1a1a] placeholder:text-[#646462] focus:outline-none focus:border-[#1a1a1a]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pl-3 pr-3 pb-4 flex flex-col gap-0.5">
        <Tab
          value="pending"
          label="Pendientes"
          count={counts.pending}
          icon={<svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8.75 4v3.69l2.6 1.5-.75 1.3L7.25 8.5V4h1.5z"/></svg>}
        />
        <Tab
          value="approved"
          label="Aprobadas"
          count={counts.approved}
          icon={<svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M6.5 11.5l-3-3 1-1 2 2 5-5 1 1z"/></svg>}
        />
        <Tab
          value="rejected"
          label="Rechazadas"
          count={counts.rejected}
          icon={<svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M4 4l8 8M12 4l-8 8" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round"/></svg>}
        />

        <div className="border-t border-[#e9eae6]/70 my-3" />

        <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-[#646462] mb-1">Información</p>
        <p className="px-3 text-[12px] text-[#646462] leading-[16px]">
          Las aprobaciones bloquean acciones sensibles (reembolsos, cancelaciones, créditos) hasta que un manager humano valida la decisión y el conector externo confirma el writeback.
        </p>
      </div>
    </div>
  );
}

// ── Approvals list (middle pane, 360px)
function ApprovalsList({
  items, selectedId, onSelect, totalApprovals, offset, hasMore, onPrev, onNext, loading,
}: {
  items: ApprovalRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  totalApprovals: number;
  offset: number;
  hasMore: boolean;
  onPrev: () => void;
  onNext: () => void;
  loading: boolean;
}) {
  const PAGE_SIZE = 50;
  return (
    <div className="flex flex-col h-full w-[360px] border-l border-[#e9eae6] bg-[#f8f8f7] flex-shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 h-16 flex-shrink-0">
        <span className="text-[15px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">{items.length} aprobaciones</span>
        <span className="text-[11px] text-[#646462]">
          {totalApprovals > 0 ? `${Math.min(offset + 1, totalApprovals)}–${Math.min(offset + PAGE_SIZE, totalApprovals)} / ${totalApprovals}` : '0 / 0'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-1">
        {items.length === 0 && (
          <div className="text-center text-[13px] text-[#646462] py-8 px-3">
            {loading ? 'Cargando…' : 'No hay aprobaciones con este filtro.'}
          </div>
        )}
        {items.map((item) => {
          const isSelected = item.id === selectedId;
          const amount = formatMoney(item.actionPayload?.amount || item.actionPayload?.refundAmount || item.actionPayload?.goodwillCreditAmount);
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`relative flex flex-col gap-1.5 px-3 py-3 rounded-xl cursor-pointer w-full text-left transition-colors ${
                isSelected ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]' : 'hover:bg-white/60'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[13px] truncate ${isSelected ? 'font-semibold text-[#1a1a1a]' : 'font-bold text-[#1a1a1a]'}`}>
                  {titleCase(item.actionType || 'Approval')}
                </span>
                {amount && <span className="text-[12px] font-semibold text-[#1a1a1a] flex-shrink-0">{amount}</span>}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${statusPillCls(item.status)}`}>
                  {statusPillLabel(item.status)}
                </span>
                {item.riskLevel && (
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${riskPillCls(item.riskLevel)}`}>
                    {titleCase(item.riskLevel)}
                  </span>
                )}
                <WritebackBadge wb={item.writeback} />
              </div>
              <p className="text-[12.5px] text-[#646462] truncate">
                {item.customerName || 'Sin cliente'}{item.caseNumber ? ` · ${item.caseNumber}` : ''}
              </p>
              <p className="text-[11.5px] text-[#646462] truncate">{extractSummary(item)}</p>
              <p className="text-[11px] text-[#9a9a98]">{formatDate(item.createdAt)}</p>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-[#e9eae6] flex-shrink-0">
        <button
          onClick={onPrev}
          disabled={offset === 0 || loading}
          className={`px-3 h-7 rounded-full text-[12px] font-semibold ${
            offset === 0 || loading
              ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed'
              : 'bg-white border border-[#e9eae6] text-[#1a1a1a] hover:bg-[#ededea]'
          }`}
        >
          Anterior
        </button>
        <button
          onClick={onNext}
          disabled={!hasMore || loading}
          className={`px-3 h-7 rounded-full text-[12px] font-semibold ${
            !hasMore || loading
              ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed'
              : 'bg-white border border-[#e9eae6] text-[#1a1a1a] hover:bg-[#ededea]'
          }`}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

// ── Decision modal (approve / reject confirm)
function DecisionModal({
  approval, decision, onClose, onConfirm, deciding, defaultNote,
}: {
  approval: ApprovalRecord;
  decision: Decision;
  onClose: () => void;
  onConfirm: (note: string) => void;
  deciding: boolean;
  defaultNote: string;
}) {
  const [note, setNote] = useState(defaultNote);
  const isApprove = decision === 'approved';
  const accent = isApprove ? '#1a1a1a' : '#9a3412';
  const accentHover = isApprove ? 'hover:bg-black' : 'hover:bg-[#7a2812]';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl border border-[#e9eae6] shadow-xl p-6 w-[520px] max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[18px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">
          {isApprove ? 'Aprobar esta solicitud' : 'Rechazar esta solicitud'}
        </h2>
        <p className="text-[13px] text-[#646462] mt-1 leading-[18px]">
          {isApprove
            ? 'La decisión se persiste, se actualiza el caso y se desbloquea el plan de ejecución vinculado.'
            : 'La decisión se persiste y el camino de acción bloqueado permanecerá denegado.'}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 text-[12px]">
          <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-lg px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#646462]">Acción</p>
            <p className="text-[12.5px] text-[#1a1a1a] mt-1">{titleCase(approval.actionType || 'Approval')}</p>
          </div>
          <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-lg px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#646462]">Caso</p>
            <p className="text-[12.5px] text-[#1a1a1a] mt-1 truncate">{approval.caseNumber || approval.caseId || 'N/A'}</p>
          </div>
          <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-lg px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#646462]">Cliente</p>
            <p className="text-[12.5px] text-[#1a1a1a] mt-1 truncate">{approval.customerName || 'Desconocido'}</p>
          </div>
          <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-lg px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#646462]">Riesgo</p>
            <p className="text-[12.5px] text-[#1a1a1a] mt-1">{titleCase(approval.riskLevel || 'unknown')}</p>
          </div>
        </div>

        <label className="block mt-5 text-[12px] font-semibold text-[#1a1a1a] mb-1.5">Nota de decisión</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={isApprove ? 'Explica por qué esta solicitud es segura para aprobar.' : 'Explica por qué esta solicitud debe rechazarse.'}
          className="w-full min-h-[100px] resize-y rounded-lg border border-[#e9eae6] px-3 py-2 text-[13px] text-[#1a1a1a] placeholder:text-[#646462] focus:outline-none focus:border-[#1a1a1a]"
        />

        <ul className="mt-4 space-y-1.5 text-[12px] text-[#646462] leading-[16px]">
          <li>• Se persiste la decisión en la base de datos.</li>
          <li>• Se actualiza el historial del caso con la nota.</li>
          <li>• {isApprove
            ? 'Se reanuda el plan de ejecución vinculado si existe.'
            : 'Se detiene cualquier writeback automatizado pendiente.'}</li>
        </ul>

        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={deciding}
            className="px-3 h-9 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] hover:bg-[#ededea] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(note)}
            disabled={deciding}
            style={{ backgroundColor: accent }}
            className={`px-4 h-9 rounded-full text-[13px] font-semibold text-white ${accentHover} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {deciding
              ? (isApprove ? 'Aprobando…' : 'Rechazando…')
              : (isApprove ? 'Aprobar solicitud' : 'Rechazar solicitud')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detail pane: action header + sections
function ApprovalDetail({
  approval, context, contextLoading, onApprove, onReject, deciding,
}: {
  approval: ApprovalRecord | null;
  context: ApprovalContext;
  contextLoading: boolean;
  onApprove: () => void;
  onReject: () => void;
  deciding: boolean;
}) {
  if (!approval) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#646462] text-[13.5px] bg-white">
        Selecciona una aprobación
      </div>
    );
  }

  const selectedCase = context?.case || null;
  const selectedCustomer = context?.customer || null;
  const selectedMessages = Array.isArray(context?.messages) ? context.messages : [];
  const linkedApprovals = Array.isArray(context?.evidence?.approvals) ? context.evidence.approvals : [];
  const linkedCases = Array.isArray(context?.evidence?.linkedCases) ? context.evidence.linkedCases : [];
  const timeline = Array.isArray(context?.caseState?.timeline) ? context.caseState.timeline.slice(-8).reverse() : [];
  const systems = context?.caseState?.systems ? Object.values(context.caseState.systems) : [];

  const policyText = approval.evidencePackage?.policyText
    || approval.actionPayload?.policyText
    || approval.actionPayload?.reason
    || 'Un manager humano debe revisar esta acción antes de cualquier writeback al conector.';
  const evidenceNotes = approval.evidencePackage?.notes
    || approval.actionPayload?.notes
    || approval.actionPayload?.policyNotes
    || null;

  const caseNumber = selectedCase?.caseNumber || approval.caseNumber || approval.caseId || 'N/A';
  const customerName = selectedCustomer?.canonicalName || approval.customerName || 'Cliente desconocido';
  const customerSegment = selectedCustomer?.segment || approval.customerSegment || 'N/A';
  const approvalTitle = titleCase(approval.actionType || 'Approval');
  const approvalAmount = formatMoney(
    approval.actionPayload?.amount
      || approval.actionPayload?.refundAmount
      || approval.actionPayload?.goodwillCreditAmount,
  );
  const status = approval.status || 'pending';
  const isPending = status === 'pending';

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${statusPillCls(status)}`}>
              {statusPillLabel(status)}
            </span>
            <WritebackBadge wb={approval.writeback} />
            <span className="text-[11px] text-[#646462]">Creada {formatDate(approval.createdAt)}</span>
          </div>
          <h2 className="text-[22px] font-semibold tracking-[-0.4px] text-[#1a1a1a] leading-tight">
            {approvalTitle}{approvalAmount ? ` · ${approvalAmount}` : ''}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[12.5px] text-[#646462]">
            <span>Para <span className="font-semibold text-[#1a1a1a]">{customerName}</span></span>
            <span className="text-[#dadad8]">•</span>
            <span>Solicitado por <span className="font-semibold text-[#1a1a1a]">{approval.assignedUserName || approval.assignedTo || 'Autopilot'}</span></span>
            <span className="text-[#dadad8]">•</span>
            <span className="font-mono">{caseNumber}</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={onReject}
              disabled={deciding || !isPending}
              className={`px-3 h-9 rounded-full text-[13px] font-semibold ${
                deciding || !isPending
                  ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed'
                  : 'bg-[#fef2f2] border border-[#fecaca] text-[#9a3412] hover:bg-[#fee4e2]'
              }`}
            >
              Rechazar
            </button>
            <button
              onClick={onApprove}
              disabled={deciding || !isPending}
              className={`px-4 h-9 rounded-full text-[13px] font-semibold ${
                deciding || !isPending
                  ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed'
                  : 'bg-[#1a1a1a] text-white hover:bg-black'
              }`}
            >
              Aprobar
            </button>
          </div>
          <p className="text-[11px] text-[#9a9a98] text-right max-w-[260px]">
            {isPending
              ? 'Aprobar actualiza el caso, el workflow y los registros vinculados.'
              : `Esta aprobación ya está ${statusPillLabel(status).toLowerCase()}${approval.decisionBy ? ` por ${approval.decisionBy}` : ''}.`}
          </p>
        </div>
      </div>

      {/* Body — 2-col grid */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Left col (request, conversation, timeline) */}
          <div className="xl:col-span-7 flex flex-col gap-5">
            <Section title="Solicitud" icon={<IconCheck />}>
              <div className="grid grid-cols-2 gap-x-6">
                <FieldRow label="Acción" value={titleCase(approval.actionType || 'Approval')} />
                <FieldRow label="Caso" value={caseNumber} />
                <FieldRow label="Riesgo" value={titleCase(approval.riskLevel || 'unknown')} />
                <FieldRow label="Vence" value={formatDate(approval.expiresAt)} />
                <FieldRow label="Asignada a" value={approval.assignedUserName || approval.assignedTo || 'Sin asignar'} />
                <FieldRow label="Equipo" value={approval.assignedTeamId || 'Operations'} />
              </div>
              <div className="mt-3 pt-3 border-t border-[#e9eae6]">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-[#646462]">Razón de política</p>
                <p className="mt-1.5 text-[13px] text-[#1a1a1a] leading-[18px]">{extractSummary(approval)}</p>
              </div>
              <div className="mt-3">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-[#646462]">Nota de decisión</p>
                <p className="mt-1.5 text-[13px] text-[#1a1a1a] leading-[18px]">{approval.decisionNote || 'Pendiente de decisión'}</p>
              </div>
            </Section>

            <Section title="Conversación" icon={<IconChat />}>
              {contextLoading ? (
                <p className="text-[13px] text-[#646462] py-4">Cargando mensajes…</p>
              ) : selectedMessages.length === 0 ? (
                <p className="text-[13px] text-[#646462] py-4">No hay mensajes asociados.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {selectedMessages.map((m: any) => (
                    <div key={m.id} className="rounded-lg border border-[#e9eae6] bg-[#f8f8f7] px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[12.5px] font-semibold text-[#1a1a1a]">{m.senderName || m.senderId || 'Sistema'}</p>
                        <span className="text-[10px] uppercase tracking-wider text-[#646462]">{m.direction || m.type || 'mensaje'}</span>
                      </div>
                      <p className="mt-1.5 text-[12.5px] text-[#1a1a1a] leading-[18px] whitespace-pre-wrap">{m.content}</p>
                      <p className="mt-1.5 text-[11px] text-[#9a9a98]">{formatDate(m.sentAt || m.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Línea de tiempo" icon={<IconClock />}>
              {contextLoading ? (
                <p className="text-[13px] text-[#646462] py-4">Cargando timeline…</p>
              ) : timeline.length === 0 ? (
                <p className="text-[13px] text-[#646462] py-4">Sin eventos en la timeline.</p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {timeline.map((entry: any) => (
                    <li key={entry.id} className="flex items-start gap-3 rounded-lg border border-[#e9eae6] px-3 py-2.5">
                      <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-md bg-[#f8f8f7] text-[#646462] flex-shrink-0">
                        <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><circle cx="8" cy="8" r="3"/></svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[12.5px] font-semibold text-[#1a1a1a]">{entry.domain || 'evento'}</p>
                          <span className="text-[11px] text-[#9a9a98] flex-shrink-0">{formatDate(entry.occurredAt)}</span>
                        </div>
                        <p className="mt-1 text-[12.5px] text-[#1a1a1a] leading-[18px]">{entry.content}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          </div>

          {/* Right col (decision, policy, systems, evidence) */}
          <div className="xl:col-span-5 flex flex-col gap-5">
            <Section title="Decisión" icon={<IconGavel />}>
              {!isPending ? (
                <div className="rounded-lg border border-[#e9eae6] bg-[#f8f8f7] px-3 py-2.5 text-[12.5px] text-[#1a1a1a]">
                  Esta aprobación ya está <span className="font-semibold">{statusPillLabel(status).toLowerCase()}</span>
                  {approval.decisionBy ? ` por ${approval.decisionBy}` : ''}.
                  {approval.decisionNote && (
                    <p className="mt-1.5 text-[12px] text-[#646462]">Nota: {approval.decisionNote}</p>
                  )}
                </div>
              ) : (
                <p className="text-[12.5px] text-[#646462] leading-[18px]">
                  Usa los botones <span className="font-semibold text-[#1a1a1a]">Aprobar</span> o <span className="font-semibold text-[#1a1a1a]">Rechazar</span> arriba para confirmar la decisión. Se actualizará el registro de aprobación, el historial del caso y el plan de ejecución vinculado.
                </p>
              )}
            </Section>

            <Section title="Política" icon={<IconPolicy />}>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-[#646462]">Política activada</p>
              <p className="mt-1 text-[13px] font-semibold text-[#1a1a1a]">{titleCase(approval.actionType || 'Approval')} — revisión</p>
              <p className="mt-2 text-[12.5px] text-[#1a1a1a] leading-[18px]">{policyText}</p>
              <div className="mt-3 rounded-lg border border-[#e9eae6] bg-[#f8f8f7] px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-[#646462]">Por qué se escaló</p>
                <p className="mt-1 text-[12.5px] text-[#1a1a1a] leading-[18px]">
                  El agente alcanzó un gate de manager porque el caso superó el umbral seguro de automatización.
                </p>
              </div>
            </Section>

            <Section title="Sistemas" icon={<IconLan />}>
              {systems.length === 0 ? (
                <p className="text-[13px] text-[#646462]">Sin estado de sistemas.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {systems.map((system: any) => (
                    <div key={system.key} className="flex items-start justify-between gap-3 rounded-lg border border-[#e9eae6] px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-semibold text-[#1a1a1a]">{system.label}</p>
                        <p className="mt-0.5 text-[11.5px] text-[#646462] leading-[16px]">{system.summary}</p>
                      </div>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${statusPillCls(system.status)}`}>
                        {titleCase(system.status || 'unknown')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Evidencia" icon={<IconArticle />}>
              <div className="flex flex-col gap-2">
                <div className="rounded-lg border border-[#e9eae6] px-3 py-2.5">
                  <p className="text-[12.5px] font-semibold text-[#1a1a1a]">Perfil de cliente</p>
                  <p className="mt-0.5 text-[11.5px] text-[#646462]">{customerName} · {customerSegment}</p>
                </div>
                {linkedCases.map((item: any) => (
                  <div key={`${item.id}-${item.linkType || 'case'}`} className="rounded-lg border border-[#e9eae6] px-3 py-2.5">
                    <p className="text-[12.5px] font-semibold text-[#1a1a1a] truncate">{item.caseNumber || item.id}</p>
                    <p className="mt-0.5 text-[11.5px] text-[#646462]">{item.type || item.linkType || 'Caso vinculado'}</p>
                  </div>
                ))}
                {linkedApprovals.map((item: any) => (
                  <div key={item.id} className="rounded-lg border border-[#e9eae6] px-3 py-2.5">
                    <p className="text-[12.5px] font-semibold text-[#1a1a1a] truncate">{item.id}</p>
                    <p className="mt-0.5 text-[11.5px] text-[#646462]">{item.status || 'aprobación'}</p>
                  </div>
                ))}
                <div className="rounded-lg border border-[#e9eae6] bg-[#f8f8f7] px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-[#646462]">Nota interna</p>
                  <p className="mt-1.5 text-[12.5px] text-[#1a1a1a] leading-[18px]">
                    {evidenceNotes || 'Aprobación respaldada por contexto del backend, historial del caso y la política vinculada.'}
                  </p>
                </div>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tiny presentational helpers ─────────────────────────────────────────────
function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#e9eae6] bg-white overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#e9eae6] flex items-center gap-2">
        <span className="flex items-center justify-center">{icon}</span>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#1a1a1a]">{title}</h3>
      </div>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-[#e9eae6] last:border-b-0">
      <span className="text-[10px] uppercase tracking-wider font-semibold text-[#646462]">{label}</span>
      <span className="text-[12.5px] text-right text-[#1a1a1a] font-medium">{value}</span>
    </div>
  );
}

const IconCheck = () => <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M6.5 11.5l-3-3 1-1 2 2 5-5 1 1z"/></svg>;
const IconChat = () => <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v7a1 1 0 01-1 1H6l-3 3v-3H3a1 1 0 01-1-1V3z"/></svg>;
const IconClock = () => <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8.75 4v3.69l2.6 1.5-.75 1.3L7.25 8.5V4h1.5z"/></svg>;
const IconGavel = () => <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M2 13h7v2H2zM4.6 9.4l3-3 4 4-3 3zM7 4l3-3 4 4-3 3z"/></svg>;
const IconPolicy = () => <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M8 1l6 2.5v5c0 3.5-2.5 5.5-6 6.5-3.5-1-6-3-6-6.5v-5z"/></svg>;
const IconLan = () => <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><rect x="6" y="1" width="4" height="3"/><rect x="1" y="11" width="4" height="3"/><rect x="11" y="11" width="4" height="3"/><path d="M3 11V7.5h10V11h-1.5V9H4.5v2z"/></svg>;
const IconArticle = () => <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M3 1.5h10v13H3zM5 4h6v1.5H5zM5 7h6v1.5H5zM5 10h4v1.5H5z"/></svg>;

// ── Main component
export default function ApprovalsV2() {
  const PAGE_SIZE = 50;
  const [filter, setFilter] = useState<ApprovalStatus>('pending');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<Decision | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const { data: page, loading, error, refetch } = useApi(
    () => approvalsApi.list({ limit: PAGE_SIZE, offset }),
    [offset],
    { items: [], total: 0, hasMore: false, limit: PAGE_SIZE, offset } as any,
  );

  const allApprovals = useMemo(() => {
    const items = Array.isArray((page as any)?.items) ? (page as any).items : [];
    return items
      .map(normalizeApproval)
      .sort((a: ApprovalRecord, b: ApprovalRecord) =>
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
      );
  }, [page]);

  const totalApprovals = typeof (page as any)?.total === 'number' ? (page as any).total : allApprovals.length;
  const hasMore = Boolean((page as any)?.hasMore);

  const counts = useMemo(() => ({
    pending: allApprovals.filter((i) => i.status === 'pending').length,
    approved: allApprovals.filter((i) => i.status === 'approved').length,
    rejected: allApprovals.filter((i) => i.status === 'rejected').length,
  }), [allApprovals]);

  const filteredApprovals = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allApprovals.filter((item) => {
      if ((item.status || 'pending') !== filter) return false;
      if (!q) return true;
      return [item.id, item.caseNumber, item.customerName, item.assignedUserName, item.actionType]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [allApprovals, filter, query]);

  const selectedApproval = useMemo(
    () => filteredApprovals.find((item) => item.id === selectedId)
       || allApprovals.find((item) => item.id === selectedId)
       || null,
    [filteredApprovals, allApprovals, selectedId],
  );

  // Auto-select first when nothing selected (or selection no longer in filter)
  useEffect(() => {
    if (!selectedId && filteredApprovals.length > 0) {
      setSelectedId(filteredApprovals[0].id);
    }
    if (selectedId && !filteredApprovals.some((i) => i.id === selectedId) && filteredApprovals.length > 0) {
      setSelectedId(filteredApprovals[0].id);
    }
    if (filteredApprovals.length === 0) {
      setSelectedId(null);
    }
  }, [filteredApprovals, selectedId]);

  // Reset selection on filter change
  useEffect(() => {
    setSelectedId(null);
  }, [filter]);

  const { data: contextData, loading: contextLoading } = useApi<ApprovalContext>(
    () => (selectedId ? approvalsApi.context(selectedId) : Promise.resolve(null)),
    [selectedId],
    null,
  );

  const { mutate: decide, loading: deciding } = useMutation(
    ({ id, decision, note }: { id: string; decision: Decision; note?: string }) =>
      approvalsApi.decide(id, decision, note, 'Admin'),
  );

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function confirmDecision(note: string) {
    if (!selectedApproval || !activeModal) return;
    const decision = activeModal;
    const result = await decide({ id: selectedApproval.id, decision, note: note.trim() || undefined });
    if (!result) {
      showToast('No pudimos completar la decisión.', 'error');
      return;
    }
    showToast(decision === 'approved' ? 'Aprobación confirmada' : 'Solicitud rechazada', 'success');
    setActiveModal(null);
    await refetch();
  }

  return (
    <div className="flex flex-1 min-w-0 h-full overflow-hidden relative">
      <ApprovalsSidebar
        filter={filter}
        onFilterChange={(s) => { setFilter(s); setOffset(0); }}
        counts={counts}
        query={query}
        onQueryChange={(q) => { setQuery(q); }}
      />
      <ApprovalsList
        items={filteredApprovals}
        selectedId={selectedApproval?.id || null}
        onSelect={setSelectedId}
        totalApprovals={totalApprovals}
        offset={offset}
        hasMore={hasMore}
        onPrev={() => setOffset((v) => Math.max(0, v - PAGE_SIZE))}
        onNext={() => setOffset((v) => v + PAGE_SIZE)}
        loading={loading}
      />
      <ApprovalDetail
        approval={selectedApproval}
        context={contextData}
        contextLoading={contextLoading}
        onApprove={() => setActiveModal('approved')}
        onReject={() => setActiveModal('rejected')}
        deciding={deciding}
      />

      {activeModal && selectedApproval && (
        <DecisionModal
          approval={selectedApproval}
          decision={activeModal}
          onClose={() => setActiveModal(null)}
          onConfirm={confirmDecision}
          deciding={deciding}
          defaultNote={selectedApproval.decisionNote || ''}
        />
      )}

      {loading && (
        <div className="absolute top-4 right-4 bg-white border border-[#e9eae6] rounded-lg px-3 py-2 text-[12px] text-[#646462] shadow-sm">
          Cargando…
        </div>
      )}
      {error && (
        <div className="absolute top-4 right-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[12px] text-red-700 shadow-sm max-w-[320px]">
          Error: {String(error)}
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
