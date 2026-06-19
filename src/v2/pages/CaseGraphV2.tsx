// CaseGraphV2 — migrado por agent-case-graph-01.
// ─────────────────────────────────────────────────────────────────────────────
// What works (this iteration):
//   • Lista de casos real → casesApi.list() con filtros all/active/resolved
//   • Selección de caso → carga 3 endpoints en paralelo:
//       - casesApi.graph(id)    → checks categorizados + timeline + branches
//       - casesApi.resolve(id)  → conflict + identified_problems + blockers + plan
//       - casesApi.state(id)    → identifiers + related + case attrs
//   • Vista CHECKS: render de graphData.checks.categories con expand/collapse y semáforo
//   • Vista TIMELINE: lista vertical de eventos con dots de severidad
//   • Vista RESOLVE: identified problems + key problem + resolution plan + AI resolve
//     - Run all steps → casesApi.executeResolutionStep(id, stepId) en bucle
//     - Run individual step → casesApi.executeResolutionStep(id, stepId)
//     - Start AI resolution → casesApi.startAiResolve(id, { autonomy: 'assisted' })
//   • Right pane (320px) collapsible con 2 tabs:
//     - Detalles: case attrs, impacted branches (clickables → onPageChange si llega), related, notes
//     - Copilot: chat por caso → aiApi.copilot(caseId, question, history)
//
// Pending for later iterations (still in src/components/CaseGraph.tsx until migrated):
//   • TreeGraph SVG fancy (vista "tree" en el original) — el endpoint /graph
//     entrega `branches` igualmente, pero el SVG con nodos animados queda fuera
//     de scope para no copiar el componente del directorio prohibido. Se renderiza
//     como lista plana de branches cuando no hay checks.
//   • super_agent fallback en handleResolveWithAI (el original cae a superAgentApi.command
//     cuando /resolve/start falla; aquí mostramos el error directamente y dejamos
//     al usuario abrir Super Agent manualmente vía botón).
//   • Auto-welcome del copilot — se mantiene la decisión del original: empezar vacío.
//   • Step-expansion details panel (el original muestra what/expected/source debajo
//     del step expandido) — aquí se simplifica a un único panel expandible con explanation.
//   • Suggestions chips dinámicos basados en branches — quedan los 3 fijos.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { casesApi, aiApi } from '../../api/client';
import { useApi } from '../../api/hooks';

type CaseFilter = 'all' | 'active' | 'resolved';
type CenterView = 'checks' | 'timeline' | 'resolve';
type RightTab = 'details' | 'copilot';

interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  time: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const formatStatus = (v?: string | null) =>
  !v ? 'N/A' : v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const formatTime = (v?: string | null) =>
  !v ? '--:--' : new Date(v).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

const formatDateTime = (v?: string | null) =>
  !v ? '-' : new Date(v).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const nowTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const dotForStatus = (status?: string) => {
  switch (status) {
    case 'fail':
    case 'critical':
    case 'blocked':
      return 'bg-[#dc2626]';
    case 'warn':
    case 'warning':
    case 'pending':
      return 'bg-[#f59e0b]';
    case 'pass':
    case 'healthy':
      return 'bg-[#10b981]';
    default:
      return 'bg-[#cbd5e1]';
  }
};

const ringForStatus = (status?: string) => {
  switch (status) {
    case 'fail':
    case 'critical':
      return 'border-[#fecaca]';
    case 'warn':
    case 'warning':
      return 'border-[#fde68a]';
    case 'pass':
    case 'healthy':
      return 'border-[#a7f3d0]';
    default:
      return 'border-[#e9eae6]';
  }
};

// ── Tiny shared icon set (filled #1a1a1a) ────────────────────────────────────
const Chev = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 16 16" className={`w-3.5 h-3.5 fill-[#646462] transition-transform ${open ? 'rotate-90' : ''}`}>
    <path d="M6 4l4 4-4 4z"/>
  </svg>
);

const IconCheck = () => (
  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-white"><path d="M6.5 11.5L3 8l1.4-1.4 2.1 2.1 5.1-5.1L13 5z"/></svg>
);

const IconChecks = () => (
  <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M2 3h12v2H2zm0 4h12v2H2zm0 4h8v2H2z"/></svg>
);

const IconTimeline = () => (
  <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M3 2h2v3H3zM3 6.5h2v3H3zM3 11h2v3H3zM7 3h6v1.5H7zM7 7.5h6V9H7zM7 12h6v1.5H7z"/></svg>
);

const IconTools = () => (
  <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M11.5 2L9 4.5l1 1L7 8.5l-2-2L2 9.5l4 4 3-3-2-2 3-3 1 1 2.5-2.5z"/></svg>
);

const IconChevDown = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 16 16" className={`w-3.5 h-3.5 fill-[#646462] transition-transform ${open ? 'rotate-180' : ''}`}>
    <path d="M4 6l4 4 4-4z"/>
  </svg>
);

const IconRight = () => (
  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M6 4l4 4-4 4z"/></svg>
);

const IconSparkle = () => (
  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-white"><path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6z"/></svg>
);

const IconSidebar = () => (
  <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M2 3h12v10H2zm1 1v8h4V4zm5 0v8h5V4z"/></svg>
);

const IconArrowUp = () => (
  <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M8 3l-4 4h2.5v6h3V7H12z"/></svg>
);

// ── Sidebar (236px) ──────────────────────────────────────────────────────────
function CasesSidebar({
  filter,
  onFilterChange,
  counts,
}: {
  filter: CaseFilter;
  onFilterChange: (f: CaseFilter) => void;
  counts: { all: number; active: number; resolved: number };
}) {
  const itemCls = (active: boolean) =>
    `relative flex items-center gap-2 h-8 pl-3 pr-3 py-1 rounded-lg cursor-pointer text-[13px] w-full text-left transition-colors ${
      active
        ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]'
        : 'hover:bg-[#e9eae6]/40 text-[#1a1a1a]'
    }`;

  return (
    <div className="flex flex-col h-full w-[236px] bg-[#f8f8f7] border-r border-[#e9eae6] flex-shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 h-16 flex-shrink-0">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Casos</span>
      </div>

      <div className="flex-1 overflow-y-auto pl-3 pr-3 pb-4 flex flex-col gap-0.5">
        <button onClick={() => onFilterChange('all')} className={itemCls(filter === 'all')}>
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M2 3h12v2H2zm0 4h12v2H2zm0 4h12v2H2z"/></svg>
          <span className="flex-1">Todos los casos</span>
          <span className="text-[12px] text-[#646462]">{counts.all}</span>
        </button>
        <button onClick={() => onFilterChange('active')} className={itemCls(filter === 'active')}>
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#fa7938]"><circle cx="8" cy="8" r="5"/></svg>
          <span className="flex-1">Activos</span>
          <span className="text-[12px] text-[#646462]">{counts.active}</span>
        </button>
        <button onClick={() => onFilterChange('resolved')} className={itemCls(filter === 'resolved')}>
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#10b981]"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zm-1 9.5L4 8l1.4-1.4L7 8.2l3.6-3.6L12 6z"/></svg>
          <span className="flex-1">Resueltos</span>
          <span className="text-[12px] text-[#646462]">{counts.resolved}</span>
        </button>

        <div className="mt-4 px-3 pb-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#646462]">Vista</span>
        </div>
        <div className="px-3 text-[12.5px] text-[#646462] leading-[18px]">
          Selecciona un caso para inspeccionar el grafo de comprobaciones, su línea de tiempo y la
          ruta de resolución.
        </div>
      </div>
    </div>
  );
}

// ── Case list (280px) ────────────────────────────────────────────────────────
interface CaseRow {
  id: string;
  orderId: string;
  customerName: string;
  summary: string;
  lastUpdate: string;
  rawLastUpdate?: string;
  status: string;
  riskLevel: string;
  badges: string[];
}

function CaseList({
  cases,
  selectedId,
  onSelect,
  loading,
}: {
  cases: CaseRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col h-full w-[280px] border-r border-[#e9eae6] bg-[#f8f8f7] flex-shrink-0">
      <div className="flex items-center px-3 py-3 h-16 flex-shrink-0">
        <span className="text-[16px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">
          {cases.length} caso{cases.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4 flex flex-col gap-0">
        {loading && cases.length === 0 && (
          <div className="text-center text-[13px] text-[#646462] py-8">Cargando casos…</div>
        )}
        {!loading && cases.length === 0 && (
          <div className="text-center text-[13px] text-[#646462] py-8">No hay casos en esta vista</div>
        )}
        {cases.map((c, i) => {
          const isSelected = c.id === selectedId;
          return (
            <div key={c.id}>
              {i > 0 && <div className="flex justify-center py-0.5"><div className="w-[228px] h-[1px] bg-[#e9eae6]" /></div>}
              <button
                onClick={() => onSelect(c.id)}
                className={`relative flex flex-col gap-1.5 px-3 py-3 rounded-xl cursor-pointer w-full text-left ${
                  isSelected ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]' : 'hover:bg-white/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[13px] truncate ${isSelected ? 'font-semibold' : 'font-bold'} text-[#1a1a1a]`}>
                    {c.customerName || 'Sin nombre'}
                  </span>
                  <span className="text-[11px] text-[#646462] flex-shrink-0 ml-2">{c.lastUpdate}</span>
                </div>
                <span className="text-[11px] text-[#646462] font-mono truncate">{c.orderId}</span>
                <p className="text-[12.5px] text-[#1a1a1a] line-clamp-2 leading-[16px]">{c.summary}</p>
                {c.badges.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {c.badges.map(badge => (
                      <span
                        key={badge}
                        className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]"
                      >
                        {badge}
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

// ── View selector (top center) ───────────────────────────────────────────────
function ViewSelector({
  view,
  onChange,
}: {
  view: CenterView;
  onChange: (v: CenterView) => void;
}) {
  const tabCls = (active: boolean) =>
    `flex items-center gap-2 px-3 h-8 rounded-md text-[12.5px] transition-colors ${
      active
        ? 'bg-white text-[#1a1a1a] font-semibold shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.10)]'
        : 'text-[#646462] hover:text-[#1a1a1a]'
    }`;
  return (
    <div className="inline-flex items-center bg-[#f3f3f1] p-1 rounded-lg border border-[#e9eae6]">
      <button onClick={() => onChange('checks')} className={tabCls(view === 'checks')}>
        <IconChecks />
        <span>Comprobaciones</span>
      </button>
      <button onClick={() => onChange('timeline')} className={tabCls(view === 'timeline')}>
        <IconTimeline />
        <span>Cronología</span>
      </button>
      <button onClick={() => onChange('resolve')} className={tabCls(view === 'resolve')}>
        <IconTools />
        <span>Resolver</span>
      </button>
    </div>
  );
}

// ── ChecksView ───────────────────────────────────────────────────────────────
function ChecksView({ checksData, branches, loading }: { checksData: any; branches: any[]; loading: boolean }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Auto-expand failing/warning categories on first data
  useEffect(() => {
    if (!checksData?.categories) return;
    const failing = checksData.categories.filter((c: any) => c.status === 'fail' || c.status === 'warn').map((c: any) => c.key);
    setExpanded(prev => (prev.size > 0 ? prev : new Set<string>(failing)));
  }, [checksData]);

  const toggle = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  if (loading && !checksData) {
    return <div className="text-center text-[13px] text-[#646462] py-12">Cargando comprobaciones…</div>;
  }

  if (!checksData?.categories?.length) {
    if (branches.length > 0) {
      // Fallback: render branches as flat list (TreeGraph SVG pendiente)
      return (
        <div className="max-w-3xl mx-auto space-y-3">
          <div className="text-[12.5px] text-[#646462] px-1 pb-1">
            Vista plana de ramas. La visualización en árbol completa queda pendiente.
          </div>
          {branches.map((b: any) => (
            <div key={b.id} className={`rounded-xl border ${ringForStatus(b.status)} bg-white overflow-hidden`}>
              <div className="px-4 py-3 flex items-center gap-3 border-b border-[#e9eae6]">
                <span className={`w-2.5 h-2.5 rounded-full ${dotForStatus(b.status)}`} />
                <span className="text-[13px] font-semibold text-[#1a1a1a]">{b.label}</span>
                <span className="text-[11px] text-[#646462]">{b.nodes?.length || 0} nodo{(b.nodes?.length || 0) === 1 ? '' : 's'}</span>
              </div>
              {b.nodes?.length > 0 && (
                <div className="divide-y divide-[#e9eae6]">
                  {b.nodes.map((n: any) => (
                    <div key={n.id} className="px-4 py-2.5 flex items-start gap-3">
                      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full ${dotForStatus(n.status)}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-[#1a1a1a]">{n.label}</div>
                        {n.context && <div className="text-[11.5px] text-[#646462] mt-0.5">{n.context}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }
    return <div className="text-center text-[13px] text-[#646462] py-12">No hay datos de grafo disponibles para este caso.</div>;
  }

  const totals = checksData.totals || { pass: 0, warn: 0, fail: 0, skip: 0 };

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      {/* Totals summary */}
      <div className="flex items-center gap-4 px-4 py-3 rounded-xl bg-[#f8f8f7] border border-[#e9eae6]">
        <span className="text-[11px] font-semibold text-[#646462] uppercase tracking-wide">Resumen</span>
        <span className="flex items-center gap-1.5 text-[12px]"><span className="w-2 h-2 rounded-full bg-[#10b981]" /><span className="font-semibold text-[#1a1a1a]">{totals.pass}</span><span className="text-[#646462]">ok</span></span>
        <span className="flex items-center gap-1.5 text-[12px]"><span className="w-2 h-2 rounded-full bg-[#f59e0b]" /><span className="font-semibold text-[#1a1a1a]">{totals.warn}</span><span className="text-[#646462]">aviso</span></span>
        <span className="flex items-center gap-1.5 text-[12px]"><span className="w-2 h-2 rounded-full bg-[#dc2626]" /><span className="font-semibold text-[#1a1a1a]">{totals.fail}</span><span className="text-[#646462]">fallos</span></span>
        <span className="flex items-center gap-1.5 text-[12px]"><span className="w-2 h-2 rounded-full bg-[#cbd5e1]" /><span className="font-semibold text-[#646462]">{totals.skip}</span><span className="text-[#646462]">n/a</span></span>
      </div>

      {checksData.categories.map((cat: any) => {
        const isOpen = expanded.has(cat.key);
        return (
          <div key={cat.key} className={`rounded-xl border ${ringForStatus(cat.status)} bg-white overflow-hidden`}>
            <button
              type="button"
              onClick={() => toggle(cat.key)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#f8f8f7] transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full ${dotForStatus(cat.status)} flex-shrink-0`} />
                <span className="text-[13px] font-semibold text-[#1a1a1a]">{cat.label}</span>
                <span className="text-[11.5px] text-[#646462]">
                  {cat.checks?.length || 0} comprobacion{(cat.checks?.length || 0) === 1 ? '' : 'es'}
                </span>
                <div className="flex items-center gap-1.5 ml-1">
                  {cat.counts?.fail > 0 && <span className="text-[10px] font-semibold text-[#dc2626]">{cat.counts.fail}✗</span>}
                  {cat.counts?.warn > 0 && <span className="text-[10px] font-semibold text-[#b45309]">{cat.counts.warn}⚠</span>}
                  {cat.counts?.pass > 0 && <span className="text-[10px] font-semibold text-[#059669]">{cat.counts.pass}✓</span>}
                </div>
              </div>
              <IconChevDown open={isOpen} />
            </button>
            {isOpen && (
              <div className="border-t border-[#e9eae6] divide-y divide-[#e9eae6]">
                {(cat.checks || []).map((c: any) => (
                  <div key={c.id} className="px-4 py-2.5 flex items-start gap-3 hover:bg-[#f8f8f7]/60 transition-colors">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full ${dotForStatus(c.status)} flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-[#1a1a1a]">{c.label}</div>
                      {c.detail && <div className="text-[11.5px] text-[#646462] mt-0.5">{c.detail}</div>}
                      {c.evidence?.length ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {c.evidence.slice(0, 4).map((ev: string, i: number) => (
                            <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#f3f3f1] text-[#646462]">{ev}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {c.at && <span className="text-[10px] text-[#9ca3af] font-mono flex-shrink-0">{formatDateTime(c.at)}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── TimelineView ─────────────────────────────────────────────────────────────
function TimelineView({ timeline, loading }: { timeline: any[]; loading: boolean }) {
  if (loading && timeline.length === 0) {
    return <div className="text-center text-[13px] text-[#646462] py-12">Cargando cronología…</div>;
  }
  if (timeline.length === 0) {
    return <div className="text-center text-[13px] text-[#646462] py-12">No hay eventos en la cronología.</div>;
  }
  return (
    <div className="max-w-3xl mx-auto relative">
      <div className="absolute left-[18px] top-2 bottom-2 w-px bg-[#e9eae6]" />
      <div className="space-y-4 relative">
        {timeline.map((entry: any) => (
          <div key={entry.id} className="grid grid-cols-[36px_minmax(0,1fr)] gap-4">
            <div className="relative flex justify-center pt-3">
              <div className={`relative z-10 w-3 h-3 rounded-full border-2 border-white shadow-[0_0_0_1px_#e9eae6] ${dotForStatus(entry.severity)}`} />
            </div>
            <div className="p-4 rounded-xl border border-[#e9eae6] bg-white">
              <div className="flex justify-between items-start gap-3 mb-1.5">
                <h3 className="font-semibold text-[13px] text-[#1a1a1a] truncate">{formatStatus(entry.entry_type || entry.type)}</h3>
                <span className="text-[11px] text-[#646462] font-mono flex-shrink-0">{formatDateTime(entry.occurred_at)}</span>
              </div>
              <div className="text-[12.5px] text-[#1a1a1a] leading-[18px]">{entry.content}</div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border border-[#e9eae6] bg-[#f8f8f7] text-[#646462]">
                  {formatStatus(entry.domain)}
                </span>
                <span className="text-[11px] text-[#646462]">{entry.source || entry.actor || 'System'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ResolveView ──────────────────────────────────────────────────────────────
function ResolveView({
  selectedId,
  resolveData,
  stateData,
  loading,
  onAction,
}: {
  selectedId: string | null;
  resolveData: any;
  stateData: any;
  loading: boolean;
  onAction: (msg: string) => void;
}) {
  const [executingStepId, setExecutingStepId] = useState<string | null>(null);
  const [completedStepIds, setCompletedStepIds] = useState<Set<string>>(new Set());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isAiResolving, setIsAiResolving] = useState(false);
  const [expandedStepIds, setExpandedStepIds] = useState<Set<string>>(new Set());

  // Reset on case change
  useEffect(() => {
    setCompletedStepIds(new Set());
    setExecutingStepId(null);
    setStatusMessage(null);
    setIsAiResolving(false);
    setExpandedStepIds(new Set());
  }, [selectedId]);

  if (loading && !resolveData && !stateData) {
    return <div className="text-center text-[13px] text-[#646462] py-12">Cargando vista de resolución…</div>;
  }

  // Steps: prefer resolveData.steps when present, fallback to plan_steps
  const steps: any[] = resolveData?.steps || resolveData?.plan_steps || [];
  const conflict = resolveData?.conflict;
  const blockers: any[] = resolveData?.blockers || [];
  const identifiedProblems: any[] = resolveData?.identified_problems || [];
  const requiresApproval = steps.some((s: any) => s.requiresApproval || s.requires_approval);
  const hasSteps = steps.length > 0;

  const toggleStep = (id: string) =>
    setExpandedStepIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const runStep = async (step: any) => {
    if (!selectedId || executingStepId !== null) return;
    setExecutingStepId(step.id);
    setStatusMessage(null);
    try {
      const resp = await casesApi.executeResolutionStep(selectedId, step.id);
      if (resp?.ok) {
        setCompletedStepIds(prev => new Set(prev).add(step.id));
        const msg = resp.message || `Paso "${step.title || step.label || step.id}" ejecutado.`;
        setStatusMessage(msg);
        onAction(msg);
      } else {
        const msg = resp?.message || `No se pudo ejecutar el paso.`;
        setStatusMessage(msg);
        onAction(msg);
      }
    } catch (err: any) {
      const msg = err?.message || `Error al ejecutar paso.`;
      setStatusMessage(msg);
      onAction(msg);
    } finally {
      setExecutingStepId(null);
    }
  };

  const runAll = async () => {
    if (!selectedId || !hasSteps || executingStepId !== null) return;
    setStatusMessage(null);
    let anyFailed = false;
    for (const step of steps) {
      if (completedStepIds.has(step.id)) continue;
      setExecutingStepId(step.id);
      try {
        // eslint-disable-next-line no-await-in-loop
        const resp = await casesApi.executeResolutionStep(selectedId, step.id);
        if (resp?.ok) {
          setCompletedStepIds(prev => new Set(prev).add(step.id));
        } else {
          anyFailed = true;
          break;
        }
      } catch {
        anyFailed = true;
        break;
      }
    }
    setExecutingStepId(null);
    const msg = anyFailed
      ? 'Algunos pasos no pudieron ejecutarse — revisa el plan.'
      : 'Todos los pasos deterministas se ejecutaron.';
    setStatusMessage(msg);
    onAction(msg);
  };

  const startAi = async () => {
    if (!selectedId) return;
    setIsAiResolving(true);
    setStatusMessage('El agente está leyendo el estado del caso y planificando…');
    try {
      const resp = await casesApi.startAiResolve(selectedId, { autonomy: 'assisted' });
      const summary = resp?.summary
        || (resp?.response?.kind === 'plan'
          ? `Plan ejecutado (${resp?.trace?.steps?.length ?? resp?.trace?.stepResults?.length ?? 0} pasos).`
          : resp?.response?.kind === 'clarification'
            ? `El agente necesita aclarar: ${resp?.response?.question}`
            : 'Agente IA finalizado.');
      setStatusMessage(summary);
      onAction(summary);
    } catch (err: any) {
      const msg = err?.message || 'No se pudo iniciar la resolución con IA.';
      setStatusMessage(msg);
      onAction(msg);
    } finally {
      setIsAiResolving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {statusMessage && (
        <div className="rounded-xl border border-[#a7f3d0] bg-[#ecfdf5] px-4 py-3 text-[12.5px] text-[#065f46]">
          {statusMessage}
        </div>
      )}

      {/* Identified problems */}
      {identifiedProblems.length > 0 && (
        <section className="bg-white rounded-2xl border border-[#e9eae6] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#e9eae6]">
            <h2 className="text-[13px] font-semibold text-[#1a1a1a]">Problemas detectados</h2>
            <p className="text-[11.5px] text-[#646462] mt-0.5">
              {identifiedProblems.length} problema{identifiedProblems.length === 1 ? '' : 's'} encontrado{identifiedProblems.length === 1 ? '' : 's'} por las comprobaciones automáticas
            </p>
          </div>
          <ul className="divide-y divide-[#e9eae6]">
            {identifiedProblems.map((p: any) => (
              <li key={p.id} className="px-5 py-3 flex items-start gap-3">
                <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${dotForStatus(p.severity)}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase font-semibold tracking-wide text-[#646462]">{p.category}</span>
                    <span className="text-[13px] font-medium text-[#1a1a1a]">{p.label}</span>
                  </div>
                  {p.detail && <div className="text-[11.5px] text-[#646462] mt-0.5">{p.detail}</div>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Key problem */}
      <section className="bg-white rounded-2xl border border-[#e9eae6] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#e9eae6] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#1a1a1a]">Problema clave</h2>
          {conflict?.severity && (
            <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
              conflict.severity === 'critical' ? 'bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]' :
              conflict.severity === 'warning' ? 'bg-[#fffbeb] text-[#b45309] border-[#fde68a]' :
              'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]'
            }`}>
              {formatStatus(conflict.severity)}
            </span>
          )}
        </div>
        <div className="p-5 space-y-3">
          <div>
            <h3 className="text-[14px] font-semibold text-[#1a1a1a]">{conflict?.title || 'Sin conflicto activo'}</h3>
            <p className="text-[12.5px] text-[#646462] mt-1 leading-[18px]">{conflict?.summary || 'Sin resumen de conflicto disponible para este caso.'}</p>
          </div>
          {conflict?.root_cause && (
            <div className="pt-3 border-t border-[#e9eae6]">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#646462] mb-1">Causa raíz</div>
              <p className="text-[12.5px] text-[#1a1a1a]">{conflict.root_cause}</p>
            </div>
          )}
          {blockers.length > 0 && (
            <div className="pt-3 border-t border-[#e9eae6]">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#646462] mb-2">Bloqueos activos</div>
              <ul className="space-y-2">
                {blockers.map((b: any) => (
                  <li key={b.key} className="flex items-start gap-2 text-[12.5px] text-[#1a1a1a]">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotForStatus(b.status)}`} />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{b.label}</span>
                      {(b.summary || b.source_of_truth) && (
                        <span className="text-[#646462]"> — {b.summary || b.source_of_truth}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* Resolution plan */}
      <section className="bg-white rounded-2xl border border-[#e9eae6] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#e9eae6] flex justify-between items-center">
          <div>
            <h2 className="text-[13px] font-semibold text-[#1a1a1a]">Plan de resolución</h2>
            <p className="text-[11.5px] text-[#646462] mt-0.5">{resolveData?.headline || (hasSteps ? `${steps.length} paso${steps.length === 1 ? '' : 's'}` : 'Sin pasos disponibles')}</p>
          </div>
          <button
            onClick={runAll}
            disabled={!hasSteps || executingStepId !== null}
            className={`px-3 h-8 rounded-full text-[12.5px] font-semibold ${
              !hasSteps || executingStepId !== null
                ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed'
                : 'bg-[#1a1a1a] text-white hover:bg-black'
            }`}
          >
            Ejecutar todos
          </button>
        </div>
        <div className="p-5">
          {!hasSteps ? (
            <div className="text-center text-[12.5px] text-[#646462] py-6">
              No hay pasos deterministas disponibles para este caso.
            </div>
          ) : (
            <ol className="space-y-2">
              {steps.map((step: any, idx: number) => {
                const stepId = step.id || step.key || `step-${idx}`;
                const stepTitle = step.title || step.label || `Paso ${idx + 1}`;
                const stepGroup = step.group || step.category || 'general';
                const isCompleted = completedStepIds.has(stepId) || step.status === 'completed' || step.status === 'success';
                const isExecuting = executingStepId === stepId;
                const isExpanded = expandedStepIds.has(stepId);
                const stepNeedsApproval = step.requiresApproval || step.requires_approval;
                return (
                  <li
                    key={stepId}
                    className={`rounded-xl border overflow-hidden ${
                      isCompleted ? 'border-[#a7f3d0] bg-[#ecfdf5]/50' : 'border-[#e9eae6] bg-[#f8f8f7]/40'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleStep(stepId)}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left"
                    >
                      <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0 ${
                        isCompleted ? 'bg-[#10b981] text-white' : 'bg-[#e9eae6] text-[#646462]'
                      }`}>
                        {isCompleted ? <IconCheck /> : (step.index ?? idx) + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-[13px] font-medium text-[#1a1a1a]">{stepTitle}</div>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border border-[#e9eae6] text-[#646462] capitalize">
                            {stepGroup}
                          </span>
                          {stepNeedsApproval && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border border-[#fde68a] bg-[#fffbeb] text-[#b45309]">
                              Aprobación
                            </span>
                          )}
                        </div>
                        {step.label && step.title && step.label !== step.title && (
                          <div className="text-[11.5px] text-[#646462] mt-0.5 truncate">{step.label}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); runStep(step); }}
                          disabled={isCompleted || isExecuting || executingStepId !== null}
                          className={`px-2.5 py-1 rounded-md text-[11.5px] font-semibold border transition-colors ${
                            isCompleted || isExecuting || executingStepId !== null
                              ? 'border-[#e9eae6] bg-[#f8f8f7] text-[#646462] cursor-not-allowed'
                              : 'border-[#e9eae6] bg-white text-[#1a1a1a] hover:border-[#1a1a1a]'
                          }`}
                        >
                          {isCompleted ? 'Hecho' : isExecuting ? 'En curso…' : 'Ejecutar'}
                        </button>
                        <IconChevDown open={isExpanded} />
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 pl-[3.25rem] space-y-2 text-[12.5px] text-[#1a1a1a] border-t border-[#e9eae6] pt-3 bg-white/50">
                        {(step.explanation || step.description) && (
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#646462] mb-1">Qué hace este paso</div>
                            <p className="leading-[18px]">{step.explanation || step.description}</p>
                          </div>
                        )}
                        {(step.expectedOutcome || step.expected_outcome) && (
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#646462] mb-1">Resultado esperado</div>
                            <p className="leading-[18px]">{step.expectedOutcome || step.expected_outcome}</p>
                          </div>
                        )}
                        {(step.context || step.source || step.domain) && (
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#646462] mb-1">Origen</div>
                            <p className="text-[11.5px] text-[#646462]">
                              {[step.domain, step.source, step.context].filter(Boolean).map(formatStatus).join(' · ')}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {requiresApproval && (
            <p className="mt-3 text-[11.5px] text-[#b45309] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
              Algunos pasos requieren aprobación antes de ejecutarse.
            </p>
          )}
        </div>
      </section>

      {/* AI resolution */}
      <section className="bg-white rounded-2xl border border-[#e9eae6] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#e9eae6] flex items-center justify-between">
          <div>
            <h2 className="text-[13px] font-semibold text-[#1a1a1a]">Resolver con IA</h2>
            <p className="text-[11.5px] text-[#646462] mt-0.5">Delega la resolución completa al agente.</p>
          </div>
          <span className="w-7 h-7 rounded-full bg-[#1a1a1a] flex items-center justify-center"><IconSparkle /></span>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-[12.5px] text-[#1a1a1a] leading-[18px]">
            El agente analizará el estado canónico, ejecutará los pasos deterministas seguros automáticamente y
            solicitará aprobación para cualquier acción sensible antes de aplicarla.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={startAi}
              disabled={isAiResolving || !selectedId}
              className={`px-3 h-8 rounded-full text-[12.5px] font-semibold inline-flex items-center gap-1.5 ${
                isAiResolving || !selectedId ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed' : 'bg-[#1a1a1a] text-white hover:bg-black'
              }`}
            >
              {isAiResolving ? 'Iniciando…' : 'Iniciar resolución con IA'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Right rail (Details / Copilot, 320px) ────────────────────────────────────
function RightRail({
  caseRow,
  rootData,
  stateData,
  resolveData,
  graphData,
  selectedId,
  copilotMessages,
  setCopilotMessages,
  copilotInput,
  setCopilotInput,
  isCopilotSending,
  setIsCopilotSending,
  isOpen,
  onClose,
}: {
  caseRow: CaseRow | null;
  rootData: { orderId: string; customerName: string; riskLevel: string; status: string };
  stateData: any;
  resolveData: any;
  graphData: any;
  selectedId: string | null;
  copilotMessages: CopilotMessage[];
  setCopilotMessages: React.Dispatch<React.SetStateAction<CopilotMessage[]>>;
  copilotInput: string;
  setCopilotInput: (s: string) => void;
  isCopilotSending: boolean;
  setIsCopilotSending: (b: boolean) => void;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<RightTab>('copilot');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [copilotMessages, isCopilotSending]);

  const impactedBranches = useMemo(() => {
    const branches = graphData?.branches || [];
    return branches
      .map((b: any) => ({
        id: b.key || b.id || 'unknown',
        label: b.label,
        status: b.status,
      }))
      .filter((b: any) => b.status === 'critical' || b.status === 'warning' || b.status === 'fail' || b.status === 'warn');
  }, [graphData]);

  const links: Array<{ label: string; href: string }> = useMemo(() => {
    const refs: Array<{ label: string; href: string }> = [];
    if (stateData?.identifiers?.external_refs) {
      stateData.identifiers.external_refs.forEach((ref: string) => {
        refs.push({ label: ref, href: '#' });
      });
    }
    return refs;
  }, [stateData]);

  const relatedCases = useMemo(
    () => stateData?.related?.linked_cases || resolveData?.linked_cases || [],
    [stateData, resolveData]
  );

  const internalNotes = useMemo(() => resolveData?.notes || [], [resolveData]);

  const copilotBrief = useMemo(() => ({
    summary: stateData?.case?.ai_diagnosis || resolveData?.conflict?.summary || 'No hay resumen IA todavía.',
    rootCause: resolveData?.conflict?.root_cause || stateData?.case?.ai_root_cause || 'Análisis pendiente.',
    conflict: resolveData?.conflict?.title || null,
    recommendation: resolveData?.conflict?.recommended_action || stateData?.case?.ai_recommended_action || null,
  }), [stateData, resolveData]);

  const suggestedQuestions = useMemo(() => {
    const qs: string[] = [];
    if (copilotBrief.conflict) qs.push("¿Qué está causando el conflicto?");
    else qs.push("¿Cuál es el estado actual?");
    qs.push("¿Qué debo hacer ahora?");
    qs.push("Explícame el caso paso a paso");
    return qs.slice(0, 3);
  }, [copilotBrief.conflict]);

  const submitCopilot = useCallback(async (override?: string) => {
    const question = (override !== undefined ? override : copilotInput).trim();
    if (!selectedId || !question || isCopilotSending) return;
    const userMsg: CopilotMessage = { id: `u-${Date.now()}`, role: 'user', content: question, time: nowTime() };
    const history = copilotMessages.map(m => ({ role: m.role, content: m.content }));

    setCopilotMessages(prev => [...prev, userMsg]);
    setCopilotInput('');
    setIsCopilotSending(true);

    try {
      const result = await aiApi.copilot(selectedId, question, history);
      const answer = result?.answer || result?.content || result?.response || 'Sin respuesta.';
      setCopilotMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: answer, time: nowTime() }]);
    } catch {
      const parts = [
        copilotBrief.summary && copilotBrief.summary !== 'No hay resumen IA todavía.' ? copilotBrief.summary : null,
        copilotBrief.rootCause && copilotBrief.rootCause !== 'Análisis pendiente.' ? `Causa raíz: ${copilotBrief.rootCause}` : null,
        copilotBrief.conflict ? `Bloqueo activo: ${copilotBrief.conflict}` : null,
        copilotBrief.recommendation ? `Recomendación: ${copilotBrief.recommendation}` : null,
      ].filter(Boolean);
      const fallback = parts.length
        ? `El servidor IA no está disponible, pero el estado canónico muestra:\n\n${parts.join('\n\n')}`
        : 'El servidor IA no está disponible y no hay datos canónicos para este caso todavía.';
      setCopilotMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: fallback, time: nowTime() }]);
    } finally {
      setIsCopilotSending(false);
    }
  }, [selectedId, copilotInput, isCopilotSending, copilotMessages, copilotBrief, setCopilotMessages, setCopilotInput, setIsCopilotSending]);

  if (!isOpen) return null;

  const riskLabel = typeof rootData.riskLevel === 'string'
    ? rootData.riskLevel.charAt(0).toUpperCase() + rootData.riskLevel.slice(1).toLowerCase()
    : 'Bajo';

  return (
    <div className="flex flex-col h-full w-[320px] border-l border-[#e9eae6] bg-white flex-shrink-0">
      <div className="relative flex items-center justify-center px-3 py-3 h-16 flex-shrink-0 border-b border-[#e9eae6]">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setTab('details')}
            className={`px-3 h-8 rounded-full text-[12.5px] font-semibold transition-colors border ${
              tab === 'details' ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-[#1a1a1a] border-[#e9eae6] hover:border-[#1a1a1a]'
            }`}
          >
            Detalles
          </button>
          <button
            onClick={() => setTab('copilot')}
            className={`px-3 h-8 rounded-full text-[12.5px] font-semibold transition-colors border ${
              tab === 'copilot' ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-[#1a1a1a] border-[#e9eae6] hover:border-[#1a1a1a]'
            }`}
          >
            Copilot
          </button>
        </div>
        <button
          onClick={onClose}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#f3f3f1] text-[#646462]"
          title="Ocultar panel"
        >
          <IconSidebar />
        </button>
      </div>

      <div className={`flex-1 min-h-0 ${tab === 'copilot' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
        {tab === 'copilot' ? (
          <div className="flex flex-col h-full min-h-0">
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
              {copilotMessages.length === 0 && !isCopilotSending && (
                <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-3">
                  <div className="text-[16px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Pregunta al copiloto</div>
                  <div className="text-[12.5px] text-[#646462] leading-[18px]">
                    {selectedId
                      ? 'Pregúntame sobre este caso. Tengo contexto del estado canónico y los conflictos detectados.'
                      : 'Selecciona un caso para empezar.'}
                  </div>
                  {selectedId && (
                    <div className="flex flex-wrap gap-1.5 justify-center pt-1">
                      {suggestedQuestions.map(q => (
                        <button
                          key={q}
                          onClick={() => submitCopilot(q)}
                          className="text-[11px] px-2.5 py-1.5 rounded-full border border-[#e9eae6] text-[#1a1a1a] hover:bg-[#f8f8f7] transition-colors font-medium"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {copilotMessages.map((m, idx) => (
                <React.Fragment key={m.id}>
                  <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start items-end gap-2'}`}>
                    {m.role === 'assistant' && (
                      <div className="w-6 h-6 rounded-lg bg-[#1a1a1a] flex items-center justify-center flex-shrink-0">
                        <IconSparkle />
                      </div>
                    )}
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12px] leading-[18px] border ${
                      m.role === 'user'
                        ? 'bg-[#f3f3f1] text-[#1a1a1a] border-[#e9eae6] rounded-br-sm'
                        : 'bg-white text-[#1a1a1a] border-[#e9eae6] rounded-bl-sm'
                    }`}>
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      <span className="block mt-1 text-[10px] text-[#646462]">{m.time}</span>
                    </div>
                  </div>
                  {m.role === 'assistant' && idx === 0 && copilotMessages.length === 1 && !isCopilotSending && (
                    <div className="flex flex-wrap gap-1.5 pl-8">
                      {suggestedQuestions.map(q => (
                        <button
                          key={q}
                          onClick={() => submitCopilot(q)}
                          className="text-[11px] px-2.5 py-1.5 rounded-full border border-[#e9eae6] text-[#1a1a1a] hover:bg-[#f8f8f7] transition-colors font-medium"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                </React.Fragment>
              ))}
              {isCopilotSending && (
                <div className="flex justify-start">
                  <div className="bg-white border border-[#e9eae6] rounded-2xl rounded-bl-sm px-3 py-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#646462] animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#646462] animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#646462] animate-bounce" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="p-3 border-t border-[#e9eae6] bg-white flex-shrink-0">
              <div className="relative bg-[#f8f8f7] rounded-xl border border-[#e9eae6] flex items-center p-1.5 focus-within:border-[#1a1a1a]">
                <input
                  ref={inputRef}
                  value={copilotInput}
                  onChange={e => setCopilotInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitCopilot(); }
                  }}
                  disabled={!selectedId || isCopilotSending}
                  className="flex-1 bg-transparent border-none outline-none text-[12.5px] text-[#1a1a1a] placeholder:text-[#646462] px-2 h-8 disabled:opacity-50"
                  placeholder="Pregúntale al copiloto…"
                  type="text"
                />
                <button
                  onClick={() => submitCopilot()}
                  disabled={!copilotInput.trim() || isCopilotSending}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg ${
                    !copilotInput.trim() || isCopilotSending ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#ededea]'
                  }`}
                >
                  <IconArrowUp />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#e9eae6]">
            <div className="p-4">
              <h3 className="text-[12.5px] font-semibold text-[#1a1a1a] mb-3">Atributos del caso</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#646462]">Order ID</span>
                  <div className="text-[12px] font-semibold text-[#1a1a1a] mt-0.5 truncate">{rootData.orderId || '—'}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#646462]">Cliente</span>
                  <div className="text-[12px] font-semibold text-[#1a1a1a] mt-0.5 truncate">{rootData.customerName || '—'}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#646462]">Estado</span>
                  <div className="text-[12px] font-semibold text-[#b91c1c] mt-0.5">{formatStatus(stateData?.case?.status || rootData.status)}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-[#646462]">Riesgo</span>
                  <div className="text-[12px] font-semibold text-[#b45309] mt-0.5">{riskLabel}</div>
                </div>
              </div>
              <div className="mt-4">
                <span className="text-[10px] uppercase tracking-wider text-[#646462] block mb-2">Ramas afectadas</span>
                {impactedBranches.length ? (
                  <div className="space-y-1.5">
                    {impactedBranches.map((b: any) => (
                      <div
                        key={b.id}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-[#e9eae6] bg-white"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotForStatus(b.status)}`} />
                        <span className="flex-1 text-[12px] font-semibold text-[#1a1a1a] truncate">{b.label}</span>
                        <span className="text-[10px] font-semibold uppercase text-[#646462]">{b.status}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[12px] text-[#646462] py-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                    Todas las ramas en orden
                  </div>
                )}
              </div>
            </div>

            <div className="p-4">
              <h3 className="text-[12.5px] font-semibold text-[#1a1a1a] mb-3">Enlaces operativos</h3>
              <div className="space-y-1.5">
                {links.map((link, i) => (
                  <a
                    key={`${link.label}-${i}`}
                    href={link.href}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-[#f8f8f7] text-[12px] text-[#1a1a1a] border border-transparent hover:border-[#e9eae6] transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><circle cx="8" cy="8" r="3"/><circle cx="3" cy="8" r="2"/><circle cx="13" cy="8" r="2"/></svg>
                      <span className="font-mono">{link.label}</span>
                    </div>
                    <IconRight />
                  </a>
                ))}
                {!links.length && <p className="text-[11.5px] text-[#646462]">Sin enlaces de integración aún.</p>}
              </div>
            </div>

            <div className="p-4">
              <h3 className="text-[12.5px] font-semibold text-[#1a1a1a] mb-3">Casos relacionados</h3>
              <div className="space-y-1.5">
                {relatedCases.map((item: any) => (
                  <div
                    key={item.id || item.case_number}
                    className="p-2 rounded-lg border border-[#e9eae6] flex items-center justify-between"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-[12px] font-semibold text-[#1a1a1a] font-mono truncate">{item.case_number}</span>
                      <span className="text-[10.5px] text-[#646462]">{formatStatus(item.type)}</span>
                    </div>
                    <span className="px-1.5 py-0.5 bg-[#f3f3f1] text-[#646462] text-[9px] font-semibold rounded uppercase flex-shrink-0">{formatStatus(item.status)}</span>
                  </div>
                ))}
                {!relatedCases.length && <p className="text-[11.5px] text-[#646462]">Sin casos enlazados.</p>}
              </div>
            </div>

            <div className="p-4">
              <h3 className="text-[12.5px] font-semibold text-[#1a1a1a] mb-3">Notas internas</h3>
              <div className="space-y-2">
                {internalNotes.map((note: any) => (
                  <div key={note.id} className="p-3 bg-[#fffbeb] rounded-lg border border-[#fde68a]">
                    <p className="text-[11.5px] text-[#92400e] leading-[16px] italic">{note.content}</p>
                    <div className="mt-1.5 flex justify-between items-center text-[10px] text-[#92400e]/70">
                      <span>{note.created_by || 'Sistema'}</span>
                      <span>{note.created_at ? formatTime(note.created_at) : ''}</span>
                    </div>
                  </div>
                ))}
                {!internalNotes.length && <p className="text-[11.5px] text-[#646462]">Sin notas internas todavía.</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function CaseGraphV2() {
  const [filter, setFilter] = useState<CaseFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<CenterView>('checks');
  const [rightOpen, setRightOpen] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Copilot state lifted up so it persists when switching tabs in right rail
  const [copilotByCase, setCopilotByCase] = useState<Record<string, CopilotMessage[]>>({});
  const [copilotInput, setCopilotInput] = useState('');
  const [isCopilotSending, setIsCopilotSending] = useState(false);

  // Reset copilot input on case change
  useEffect(() => {
    setCopilotInput('');
  }, [selectedId]);

  // ── Fetch cases ───────────────────────────────────────────────────────────
  const { data: apiCases, loading: casesLoading } = useApi(() => casesApi.list(), [], []);
  const cases: CaseRow[] = useMemo(() => (apiCases || []).map((c: any) => ({
    id: c.id,
    orderId: Array.isArray(c.order_ids) && c.order_ids.length > 0 ? c.order_ids[0] : (c.case_number || ''),
    customerName: c.customer_name || c.case_number || 'Sin nombre',
    summary: c.ai_diagnosis || c.conflict_summary?.recommended_action || formatStatus(c.type),
    lastUpdate: c.last_activity_at ? formatTime(c.last_activity_at) : '-',
    rawLastUpdate: c.last_activity_at,
    status: c.status,
    riskLevel: c.risk_level,
    badges: [
      ...(c.conflict_summary?.has_conflict ? ['Conflict'] : []),
      ...(c.risk_level === 'high' || c.risk_level === 'critical' ? ['Alto riesgo'] : []),
      ...(c.status === 'blocked' ? ['Bloqueado'] : []),
    ],
  })), [apiCases]);

  const counts = useMemo(() => {
    const all = cases.length;
    const active = cases.filter(c => !['resolved', 'closed', 'cancelled'].includes(String(c.status || '').toLowerCase())).length;
    const resolved = cases.filter(c => ['resolved', 'closed'].includes(String(c.status || '').toLowerCase())).length;
    return { all, active, resolved };
  }, [cases]);

  const visibleCases = useMemo(() => {
    if (filter === 'active') {
      return cases.filter(c => !['resolved', 'closed', 'cancelled'].includes(String(c.status || '').toLowerCase()));
    }
    if (filter === 'resolved') {
      return cases.filter(c => ['resolved', 'closed'].includes(String(c.status || '').toLowerCase()));
    }
    return cases;
  }, [cases, filter]);

  // Auto-select first visible case
  useEffect(() => {
    if (!visibleCases.length) {
      setSelectedId(null);
      return;
    }
    if (selectedId && visibleCases.some(c => c.id === selectedId)) return;
    setSelectedId(visibleCases[0].id);
  }, [selectedId, visibleCases]);

  // ── Fetch graph / resolve / state in parallel ─────────────────────────────
  const { data: graphData, loading: graphLoading } = useApi(
    () => selectedId ? casesApi.graph(selectedId) : Promise.resolve(null),
    [selectedId]
  );
  const { data: resolveData, loading: resolveLoading } = useApi(
    () => selectedId ? casesApi.resolve(selectedId) : Promise.resolve(null),
    [selectedId]
  );
  const { data: stateData, loading: stateLoading } = useApi(
    () => selectedId ? casesApi.state(selectedId) : Promise.resolve(null),
    [selectedId]
  );

  const checksData = graphData?.checks || null;
  const branches = graphData?.branches || [];
  const timeline = graphData?.timeline || [];

  const rootData = useMemo(() => {
    if (graphData?.root) {
      return {
        orderId: graphData.root.order_id || graphData.root.case_number || '',
        customerName: graphData.root.customer_name || '',
        riskLevel: graphData.root.risk_level || 'low',
        status: graphData.root.status || 'open',
      };
    }
    const sel = cases.find(c => c.id === selectedId);
    return {
      orderId: sel?.orderId || '',
      customerName: sel?.customerName || '',
      riskLevel: sel?.riskLevel || 'low',
      status: sel?.status || 'open',
    };
  }, [graphData, cases, selectedId]);

  const selectedRow = useMemo(() => cases.find(c => c.id === selectedId) || null, [cases, selectedId]);

  // Toast auto-clear
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const copilotMessages = selectedId ? (copilotByCase[selectedId] || []) : [];
  const setCopilotMessages: React.Dispatch<React.SetStateAction<CopilotMessage[]>> = useCallback((updater) => {
    if (!selectedId) return;
    setCopilotByCase(prev => {
      const current = prev[selectedId] || [];
      const next = typeof updater === 'function' ? (updater as any)(current) : updater;
      return { ...prev, [selectedId]: next };
    });
  }, [selectedId]);

  return (
    <div className="flex flex-1 min-w-0 h-full overflow-hidden bg-white">
      <CasesSidebar filter={filter} onFilterChange={setFilter} counts={counts} />
      <CaseList cases={visibleCases} selectedId={selectedId} onSelect={setSelectedId} loading={casesLoading} />

      {/* Center pane */}
      <div className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 h-16 flex-shrink-0 border-b border-[#e9eae6]">
          <div className="flex items-center gap-4 min-w-0">
            <h1 className="text-[16px] font-semibold tracking-[-0.4px] text-[#1a1a1a] truncate">
              {selectedRow ? selectedRow.customerName : 'Sin caso seleccionado'}
            </h1>
            {selectedRow && (
              <span className="text-[12px] text-[#646462] font-mono truncate">{selectedRow.orderId}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ViewSelector view={view} onChange={setView} />
            {!rightOpen && (
              <button
                onClick={() => setRightOpen(true)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#e9eae6] hover:bg-[#f8f8f7] text-[#1a1a1a]"
                title="Mostrar panel"
              >
                <IconSidebar />
              </button>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto bg-[#f8f8f7] p-6 relative">
          {!selectedId ? (
            <div className="flex items-center justify-center h-full text-[13px] text-[#646462]">
              Selecciona un caso para ver su grafo, cronología o ruta de resolución.
            </div>
          ) : view === 'checks' ? (
            <ChecksView checksData={checksData} branches={branches} loading={graphLoading} />
          ) : view === 'timeline' ? (
            <TimelineView timeline={timeline} loading={graphLoading} />
          ) : (
            <ResolveView
              selectedId={selectedId}
              resolveData={resolveData}
              stateData={stateData}
              loading={resolveLoading || stateLoading}
              onAction={(msg) => setToast(msg)}
            />
          )}
          {toast && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-[#1a1a1a] text-white text-[12.5px] shadow-[0_4px_12px_rgba(20,20,20,0.25)]">
              {toast}
            </div>
          )}
        </div>
      </div>

      <RightRail
        caseRow={selectedRow}
        rootData={rootData}
        stateData={stateData}
        resolveData={resolveData}
        graphData={graphData}
        selectedId={selectedId}
        copilotMessages={copilotMessages}
        setCopilotMessages={setCopilotMessages}
        copilotInput={copilotInput}
        setCopilotInput={setCopilotInput}
        isCopilotSending={isCopilotSending}
        setIsCopilotSending={setIsCopilotSending}
        isOpen={rightOpen}
        onClose={() => setRightOpen(false)}
      />
    </div>
  );
}
