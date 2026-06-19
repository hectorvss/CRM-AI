// AIStudioV2 — migrated by agent-ai-studio-01.
// ─────────────────────────────────────────────────────────────────────────────
// What works (this iteration):
//   • Sidebar with 6 sections (Vista general, Agentes, Permisos, Conocimiento,
//     Razonamiento, Seguridad) — Inbox-pattern bold-on-active items
//   • Vista general: KPIs (deflection / escalation / pending approvals / tool
//     errors) → reportsApi.overview, reportsApi.approvals, reportsApi.costs,
//     operationsApi.overview
//   • Vista general: Go-live checklist → aiApi.studio + connectorsApi.list +
//     operationsApi.agentRuns
//   • Vista general: Agent quick-toggle → agentsApi.config({isActive})
//   • Vista general: Cost controls (daily cap +/-, hard stop toggle) →
//     workspacesApi.currentContext + workspacesApi.update({settings})
//   • Vista general: Recent runs table → operationsApi.agentRuns
//   • Vista general: Workspace actions (Habilitar todo / Parada de emergencia)
//     → bulk agentsApi.config
//   • Agentes: search + filter (Todos / Sin configurar / Activos / Inactivos),
//     category grouping, per-agent enable/disable toggle → agentsApi.list,
//     agentsApi.config
//   • Agentes: selected agent header with Bundle/Status/Rollout pills and the
//     Save / Publish / Rollback actions → agentsApi.policyDraft,
//     agentsApi.effectivePolicy, updatePolicyDraft, publishPolicyDraft,
//     rollbackPolicy
//
// Pending for later iterations (still in src/components/AIStudio.tsx until migrated):
//   • Permissions / Knowledge / Reasoning / Safety tabs delegate to separate
//     view components (PermissionsView, KnowledgeView, ReasoningView,
//     SafetyView) — each is its own significant migration
//   • Expanded agent details with the AgentNetworkGraph (network roadmap +
//     connectionCategories profile mapping)
//   • ActionModal confirmations for agent toggles + workspace actions —
//     V2 currently confirms inline; the original shows a context modal with
//     steps + considerations
//   • originalCategories static fallback content (long-form purpose / triggers
//     / dependencies / ioLogic for each agent) — only used when the API
//     returns no agents
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect } from 'react';
import {
  aiApi,
  agentsApi,
  connectorsApi,
  operationsApi,
  reportsApi,
  workspacesApi,
} from '../../api/client';
import { useApi, useMutation } from '../../api/hooks';

type StudioTab = 'overview' | 'agents' | 'permissions' | 'knowledge' | 'reasoning' | 'safety';
type AgentListFilter = 'all' | 'needs_setup' | 'enabled' | 'disabled';

// ── Shared helpers ───────────────────────────────────────────────────────────
function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseSettings(raw: any): any {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw;
}

function toPercent(v: number): string {
  return `${Math.round(v)}%`;
}

function formatCompactDate(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function normalizeConnectorStatus(c: any): 'connected' | 'attention' | 'disabled' {
  const raw = String(c?.status || c?.health || c?.syncStatus || (c?.isEnabled ? 'connected' : 'disabled')).toLowerCase();
  if (['connected', 'healthy', 'active', 'ok', 'enabled'].includes(raw)) return 'connected';
  if (['error', 'failed', 'degraded', 'blocked'].includes(raw)) return 'attention';
  return 'disabled';
}

const CATEGORY_LABELS: Record<string, string> = {
  orchestration: 'Orquestación',
  ingest: 'Ingesta',
  ingest_intelligence: 'Ingesta e inteligencia',
  resolution: 'Resolución',
  resolution_reconciliation: 'Resolución y reconciliación',
  identity: 'Identidad',
  system_tools: 'Herramientas del sistema',
  observability: 'Observabilidad',
  communication: 'Comunicación',
  connectors: 'Conectores',
};

function categoryLabel(cat?: string): string {
  if (!cat) return 'Otros';
  if (CATEGORY_LABELS[cat]) return CATEGORY_LABELS[cat];
  return String(cat).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
function StudioSidebar({ tab, onTab }: { tab: StudioTab; onTab: (t: StudioTab) => void }) {
  const itemCls = (active: boolean) =>
    `relative flex items-center gap-2 h-8 pl-3 pr-3 py-1 rounded-lg cursor-pointer text-[13px] w-full text-left transition-colors ${
      active
        ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]'
        : 'hover:bg-[#e9eae6]/40 text-[#1a1a1a]'
    }`;

  const Icon = ({ kind }: { kind: StudioTab }) => {
    switch (kind) {
      case 'overview':    return <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z"/></svg>;
      case 'agents':      return <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><circle cx="5" cy="5" r="2.2"/><circle cx="11" cy="5" r="2.2"/><path d="M1.5 12.5C2 10.7 3.4 9.5 5 9.5s3 1.2 3.5 3v.5h-7v-.5zm6.5 0c.5-1.8 1.9-3 3.5-3s3 1.2 3.5 3v.5H8z"/></svg>;
      case 'permissions': return <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M8 1L3 3v4c0 3 2 5.6 5 7 3-1.4 5-4 5-7V3z"/></svg>;
      case 'knowledge':   return <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M3 2.5h4.5a2 2 0 012 2v9.2a1 1 0 01-1.7.7 2 2 0 00-1.4-.7H3v-11.2zm10 0H8.5a2 2 0 00-2 2v9.2a1 1 0 001.7.7 2 2 0 011.4-.7H13V2.5z"/></svg>;
      case 'reasoning':   return <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><circle cx="8" cy="8" r="2"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3M3 3l2 2M11 11l2 2M3 13l2-2M11 5l2-2"/></svg>;
      case 'safety':      return <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M8 1l7 13H1z"/></svg>;
    }
  };

  const items: { key: StudioTab; label: string }[] = [
    { key: 'overview',    label: 'Vista general' },
    { key: 'agents',      label: 'Agentes' },
    { key: 'permissions', label: 'Permisos' },
    { key: 'knowledge',   label: 'Conocimiento' },
    { key: 'reasoning',   label: 'Razonamiento' },
    { key: 'safety',      label: 'Seguridad' },
  ];

  return (
    <div className="flex flex-col h-full w-[236px] bg-[#f8f8f7] border-r border-[#e9eae6] flex-shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 h-16 flex-shrink-0">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Fin AI Agent</span>
      </div>
      <div className="flex-1 overflow-y-auto pl-3 pr-3 pb-4 flex flex-col gap-0.5">
        {items.map(it => (
          <button key={it.key} onClick={() => onTab(it.key)} className={itemCls(tab === it.key)}>
            <Icon kind={it.key} />
            <span className="flex-1">{it.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Pill / Toggle / Card primitives ──────────────────────────────────────────
function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'live' | 'paused' }) {
  const cls = {
    neutral: 'bg-[#f8f8f7] text-[#1a1a1a] border-[#e9eae6]',
    good:    'bg-[#ecfdf5] text-[#065f46] border-[#a7f3d0]',
    warn:    'bg-[#fff7ed] text-[#9a3412] border-[#fed7aa]',
    live:    'bg-[#1a1a1a] text-white border-[#1a1a1a]',
    paused:  'bg-[#f8f8f7] text-[#646462] border-[#e9eae6]',
  }[tone];
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>{children}</span>;
}

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors flex-shrink-0 ${
        on ? 'border-[#1a1a1a] bg-[#1a1a1a]' : 'border-[#e9eae6] bg-[#f8f8f7]'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span className={`absolute h-4 w-4 rounded-full bg-white transition-all ${on ? 'right-1' : 'left-1'}`} />
    </button>
  );
}

// ── Overview tab ─────────────────────────────────────────────────────────────
function OverviewTab({
  reportOverview, reportApprovals, reportCosts, operationsOverview, recentRuns,
  studioData, connectors, mappedAgents,
  costControls, savingCostControls, onCostCapChange, onHardStopToggle,
  onToggleAgent, pendingAgentId, toast,
  onEnableAll, onEmergencyStop,
}: {
  reportOverview: any;
  reportApprovals: any;
  reportCosts: any;
  operationsOverview: any;
  recentRuns: any[];
  studioData: any;
  connectors: any[];
  mappedAgents: any[];
  costControls: { dailyCap: number; hardStopEnabled: boolean; rolloutPercentage: number };
  savingCostControls: boolean;
  onCostCapChange: (delta: number) => void;
  onHardStopToggle: () => void;
  onToggleAgent: (agent: any) => void;
  pendingAgentId: string | null;
  toast: string | null;
  onEnableAll: () => void;
  onEmergencyStop: () => void;
}) {
  const overviewKpis = reportOverview?.kpis || [];
  const approvalsFunnel = reportApprovals?.funnel || [];
  const approvalsRates = reportApprovals?.rates || {};
  const costSummary = reportCosts?.summary || {};
  const pendingApprovals = safeNumber(approvalsFunnel.find((it: any) => it.label === 'Pending')?.val);
  const deflectionRate = safeNumber(overviewKpis.find((it: any) => it.id === 'auto_resolution')?.value);
  const escalationRate = Math.max(0, Math.min(100, 100 - safeNumber(approvalsRates.approvalRate, 100)));
  const toolErrors = safeNumber(operationsOverview?.agentFailuresLast24h);
  const totalCreditsUsed = safeNumber(costSummary.creditsUsed);
  const dailyCapUsage = Math.min(100, Math.round((totalCreditsUsed / Math.max(costControls.dailyCap, 1)) * 100));

  const connectedConnectors = (connectors || []).filter(c => normalizeConnectorStatus(c) === 'connected').length;
  const checklist = [
    { label: 'Proveedor LLM configurado', completed: !!studioData?.modelConfig?.apiKeyConfigured },
    { label: 'Agentes core activos',      completed: safeNumber(studioData?.agents?.active) > 0 },
    { label: 'Conector online',           completed: connectedConnectors > 0 },
    { label: 'Conocimiento importado',    completed: safeNumber(studioData?.knowledge?.publishedArticles) > 0 },
    { label: 'Runtime de políticas',      completed: !!studioData?.planEngine?.enabled },
    { label: 'Ejecuciones observadas',    completed: (recentRuns || []).length > 0 },
    { label: 'Controles de coste',        completed: costControls.dailyCap > 0 },
  ];
  const completed = checklist.filter(it => it.completed).length;

  const topAgents = mappedAgents.slice(0, 5);
  const editableInactive = mappedAgents.filter(a => a.id && !a.locked && !a.isActive).length;
  const editableActive   = mappedAgents.filter(a => a.id && !a.locked && a.isActive).length;

  const kpis = [
    { label: 'Tasa de auto-resolución', value: toPercent(deflectionRate), detail: `${safeNumber(costSummary.autoResolvedCases).toLocaleString()} resueltos en 7d` },
    { label: 'Tasa de escalado',        value: toPercent(escalationRate), detail: `${safeNumber(approvalsRates.avgDecisionHours, 0).toFixed(1)}h decisión media` },
    { label: 'Aprobaciones pendientes', value: pendingApprovals.toLocaleString(), detail: pendingApprovals > 0 ? 'Requieren atención' : 'Sin cola' },
    { label: 'Errores de herramienta',  value: toolErrors.toLocaleString(), detail: 'Últimas 24h' },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="px-8 py-6 max-w-[1280px] mx-auto flex flex-col gap-6">
        {/* Header bar */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Vista general</h1>
            <p className="text-[12.5px] text-[#646462] mt-0.5">Estado operativo del runtime de agentes</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onEnableAll}
              disabled={editableInactive === 0}
              className={`px-3 h-8 rounded-full text-[13px] font-semibold ${
                editableInactive === 0 ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed' : 'bg-[#f8f8f7] text-[#1a1a1a] hover:bg-[#ededea]'
              }`}
            >
              Habilitar todos los agentes
            </button>
            <button
              onClick={onEmergencyStop}
              disabled={editableActive === 0}
              className={`px-3 h-8 rounded-full text-[13px] font-semibold ${
                editableActive === 0 ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed' : 'bg-[#9a3412] text-white hover:bg-[#7a2812]'
              }`}
            >
              Parada de emergencia
            </button>
          </div>
        </div>

        {toast && (
          <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-xl px-4 py-3 text-[13px] text-[#1a1a1a]">{toast}</div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {kpis.map(k => (
            <div key={k.label} className="bg-white border border-[#e9eae6] rounded-xl p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#646462]">{k.label}</p>
              <p className="text-[28px] font-semibold tracking-[-0.6px] text-[#1a1a1a] mt-2">{k.value}</p>
              <p className="text-[12px] text-[#646462] mt-1">{k.detail}</p>
            </div>
          ))}
        </div>

        {/* Two-column layout: checklist + agents/cost */}
        <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-4">
          {/* Checklist */}
          <div className="bg-white border border-[#e9eae6] rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-[15px] font-semibold text-[#1a1a1a]">Checklist de puesta en marcha</h2>
                <p className="text-[12px] text-[#646462] mt-0.5">Estado del workspace, conectores y runtime</p>
              </div>
              <Pill tone="neutral">{completed}/{checklist.length} completos</Pill>
            </div>
            <div className="w-full h-1.5 bg-[#f8f8f7] rounded-full overflow-hidden mb-4">
              <div className="h-full bg-[#1a1a1a] rounded-full transition-all" style={{ width: `${(completed / checklist.length) * 100}%` }} />
            </div>
            <div className="flex flex-col gap-2">
              {checklist.map(it => (
                <div key={it.label} className="flex items-center justify-between border border-[#e9eae6] rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${it.completed ? 'bg-[#1a1a1a] text-white' : 'border border-[#e9eae6] text-[#646462]'}`}>
                      <svg viewBox="0 0 16 16" className={`w-3 h-3 ${it.completed ? 'fill-white' : 'fill-[#646462]'}`}>
                        {it.completed
                          ? <path d="M3.5 8l3 3 6-6" stroke="currentColor" strokeWidth="2" fill="none"/>
                          : <circle cx="8" cy="8" r="3"/>}
                      </svg>
                    </div>
                    <span className={`text-[13px] ${it.completed ? 'text-[#1a1a1a]' : 'text-[#646462]'}`}>{it.label}</span>
                  </div>
                  <span className="text-[11px] font-semibold text-[#646462]">{it.completed ? 'Listo' : 'Pendiente'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right column: agents + cost */}
          <div className="flex flex-col gap-4">
            <div className="bg-white border border-[#e9eae6] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[15px] font-semibold text-[#1a1a1a]">Estado de agentes</h2>
                <Pill tone="neutral">{mappedAgents.length} totales</Pill>
              </div>
              {topAgents.length === 0 ? (
                <p className="text-[12.5px] text-[#646462] py-4">No hay agentes cargados.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {topAgents.map((a: any) => (
                    <div key={a.id || a.name} className="flex items-center justify-between border border-[#e9eae6] rounded-lg px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-[#1a1a1a] truncate">{a.name}</p>
                        <p className="text-[11.5px] text-[#646462] truncate">{categoryLabel(a.category)}</p>
                      </div>
                      {a.locked
                        ? <Pill tone="paused">Bloqueado</Pill>
                        : <Toggle on={!!a.isActive} onClick={() => onToggleAgent(a)} disabled={pendingAgentId === a.id} />
                      }
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-[#e9eae6] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[15px] font-semibold text-[#1a1a1a]">Controles de coste</h2>
                <Pill tone="neutral">{dailyCapUsage}% usado</Pill>
              </div>
              <div className="w-full h-1.5 bg-[#f8f8f7] rounded-full overflow-hidden mb-4">
                <div className="h-full bg-[#1a1a1a] rounded-full" style={{ width: `${dailyCapUsage}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="border border-[#e9eae6] rounded-lg px-3 py-2.5">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#646462]">Tope</p>
                  <p className="text-[20px] font-semibold text-[#1a1a1a] mt-1">€{costControls.dailyCap}</p>
                </div>
                <div className="border border-[#e9eae6] rounded-lg px-3 py-2.5">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#646462]">Parada en runtime</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[12.5px] font-semibold text-[#1a1a1a]">{costControls.hardStopEnabled ? 'Activa' : 'Inactiva'}</span>
                    <Toggle on={costControls.hardStopEnabled} onClick={onHardStopToggle} disabled={savingCostControls} />
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onCostCapChange(-5)}
                  disabled={savingCostControls || costControls.dailyCap <= 5}
                  className={`px-3 h-8 rounded-full text-[13px] font-semibold ${
                    savingCostControls || costControls.dailyCap <= 5 ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed' : 'bg-[#f8f8f7] text-[#1a1a1a] hover:bg-[#ededea]'
                  }`}
                >− €5</button>
                <button
                  onClick={() => onCostCapChange(5)}
                  disabled={savingCostControls}
                  className={`px-3 h-8 rounded-full text-[13px] font-semibold ${
                    savingCostControls ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed' : 'bg-[#f8f8f7] text-[#1a1a1a] hover:bg-[#ededea]'
                  }`}
                >+ €5</button>
              </div>
            </div>
          </div>
        </div>

        {/* Recent runs */}
        <div className="bg-white border border-[#e9eae6] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-[#1a1a1a]">Ejecuciones recientes</h2>
            <span className="text-[12px] text-[#646462]">{(recentRuns || []).length} últimas</span>
          </div>
          {(!recentRuns || recentRuns.length === 0) ? (
            <p className="text-[12.5px] text-[#646462] py-6 text-center">Sin ejecuciones aún. En cuanto el runtime corra agentes, aparecerán aquí.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentRuns.slice(0, 6).map((r: any) => (
                <div key={r.id} className="grid grid-cols-[1.4fr_1fr_0.8fr_0.8fr] gap-3 items-center border border-[#e9eae6] rounded-lg px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[#1a1a1a] truncate">{r.agentName || r.agentSlug || 'Ejecución'}</p>
                    <p className="text-[11px] text-[#646462] truncate font-mono">{r.traceId || r.caseId || r.id}</p>
                  </div>
                  <span className="text-[12px] text-[#646462]">{r.startedAt ? formatCompactDate(r.startedAt) : '—'}</span>
                  <Pill tone={
                    ['completed','approved','active'].includes(String(r.outcomeStatus || '').toLowerCase()) ? 'good'
                    : ['failed','error','blocked'].includes(String(r.outcomeStatus || '').toLowerCase()) ? 'warn'
                    : 'neutral'
                  }>{String(r.outcomeStatus || 'unknown').replace(/_/g, ' ')}</Pill>
                  <span className="text-[12px] text-[#646462] text-right">{safeNumber(r.costCredits).toFixed(2)} cr</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Agents tab ───────────────────────────────────────────────────────────────
function AgentsTab({
  mappedAgents, onToggleAgent, pendingAgentId,
  selectedAgentId, setSelectedAgentId,
  policyDraft, effectivePolicy,
  onSaveDraft, onPublishDraft, onRollback, draftBusy,
}: {
  mappedAgents: any[];
  onToggleAgent: (agent: any) => void;
  pendingAgentId: string | null;
  selectedAgentId: string;
  setSelectedAgentId: (id: string) => void;
  policyDraft: any;
  effectivePolicy: any;
  onSaveDraft: () => void;
  onPublishDraft: () => void;
  onRollback: () => void;
  draftBusy: boolean;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<AgentListFilter>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mappedAgents.filter(a => {
      const matchesSearch = !q || (a.name || '').toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q);
      const matchesFilter = filter === 'all'
        ? true
        : filter === 'needs_setup' ? !a.isActive
        : filter === 'enabled'     ? !!a.isActive
        : !a.isActive;
      return matchesSearch && matchesFilter;
    });
  }, [mappedAgents, search, filter]);

  const groups = useMemo(() => {
    const byCat = new Map<string, any[]>();
    filtered.forEach(a => {
      const k = a.category || 'other';
      if (!byCat.has(k)) byCat.set(k, []);
      byCat.get(k)!.push(a);
    });
    return Array.from(byCat.entries()).map(([cat, agents]) => ({ cat, agents }));
  }, [filtered]);

  const selectedAgent = useMemo(
    () => mappedAgents.find(a => a.id === selectedAgentId) || mappedAgents[0] || null,
    [mappedAgents, selectedAgentId],
  );

  const bundle = policyDraft?.bundle || {};
  const effective = effectivePolicy || {};
  const runtimeSummary = {
    version: bundle.versionNumber || effective.versionId || '—',
    status: policyDraft?.bundleStatus || effective.versionStatus || 'published',
    rollout: bundle.rolloutPercentage ?? effective.rolloutPolicy?.rolloutPercentage ?? 100,
    permissions: Object.keys(bundle.permissionProfile || effective.permissionProfile || {}).length,
    reasoning:   Object.keys(bundle.reasoningProfile || effective.reasoningProfile || {}).length,
    safety:      Object.keys(bundle.safetyProfile || effective.safetyProfile || {}).length,
    knowledge:   Object.keys(bundle.knowledgeProfile || effective.knowledgeProfile || {}).length,
  };

  const filterButtons: { key: AgentListFilter; label: string }[] = [
    { key: 'all',         label: 'Todos' },
    { key: 'needs_setup', label: 'Sin configurar' },
    { key: 'enabled',     label: 'Activos' },
    { key: 'disabled',    label: 'Inactivos' },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="px-8 py-6 max-w-[1280px] mx-auto flex flex-col gap-5">
        {/* Selected agent header */}
        {selectedAgent && (
          <div className="bg-white border border-[#e9eae6] rounded-xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-lg bg-[#f8f8f7] flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 16 16" className="w-5 h-5 fill-[#1a1a1a]"><circle cx="8" cy="6" r="3"/><path d="M2 14c.5-2.5 3-4 6-4s5.5 1.5 6 4z"/></svg>
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[18px] font-semibold tracking-[-0.4px] text-[#1a1a1a] truncate">{selectedAgent.name}</h2>
                    <p className="text-[12.5px] text-[#646462] truncate">{selectedAgent.description || categoryLabel(selectedAgent.category)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="neutral">Bundle {String(runtimeSummary.version)}</Pill>
                  <Pill tone={runtimeSummary.status === 'published' ? 'good' : 'warn'}>{runtimeSummary.status}</Pill>
                  <Pill tone="neutral">Rollout {runtimeSummary.rollout}%</Pill>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={onRollback}
                  disabled={draftBusy || !selectedAgent?.id}
                  className={`px-3 h-8 rounded-full text-[13px] font-semibold ${
                    draftBusy || !selectedAgent?.id ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed' : 'text-[#1a1a1a] hover:bg-[#f8f8f7]'
                  }`}
                >Revertir</button>
                <button
                  onClick={onSaveDraft}
                  disabled={draftBusy || !selectedAgent?.id}
                  className={`px-3 h-8 rounded-full text-[13px] font-semibold ${
                    draftBusy || !selectedAgent?.id ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed' : 'bg-[#f8f8f7] text-[#1a1a1a] hover:bg-[#ededea]'
                  }`}
                >Guardar borrador</button>
                <button
                  onClick={onPublishDraft}
                  disabled={draftBusy || !selectedAgent?.id}
                  className={`px-3 h-8 rounded-full text-[13px] font-semibold ${
                    draftBusy || !selectedAgent?.id ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed' : 'bg-[#1a1a1a] text-white hover:bg-black'
                  }`}
                >Publicar</button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { l: 'Permisos',     v: runtimeSummary.permissions },
                { l: 'Razonamiento', v: runtimeSummary.reasoning },
                { l: 'Seguridad',    v: runtimeSummary.safety },
                { l: 'Conocimiento', v: runtimeSummary.knowledge },
              ].map(s => (
                <div key={s.l} className="border border-[#e9eae6] rounded-lg px-3 py-2.5">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#646462]">{s.l}</p>
                  <p className="text-[20px] font-semibold text-[#1a1a1a] mt-1">{s.v}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search + filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <svg viewBox="0 0 16 16" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 fill-[#646462] pointer-events-none">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar agentes…"
              className="w-full h-9 pl-10 pr-3 rounded-full border border-[#e9eae6] text-[13px] text-[#1a1a1a] placeholder:text-[#646462] focus:outline-none focus:border-[#1a1a1a]"
            />
          </div>
          <div className="flex bg-[#f8f8f7] border border-[#e9eae6] rounded-full p-0.5">
            {filterButtons.map(b => (
              <button
                key={b.key}
                onClick={() => setFilter(b.key)}
                className={`px-3 h-8 rounded-full text-[12.5px] font-semibold transition-colors ${
                  filter === b.key ? 'bg-[#1a1a1a] text-white' : 'text-[#646462] hover:text-[#1a1a1a]'
                }`}
              >{b.label}</button>
            ))}
          </div>
        </div>

        {/* Categories */}
        {groups.length === 0 ? (
          <p className="text-[13px] text-[#646462] py-12 text-center">No hay agentes que coincidan con los filtros.</p>
        ) : groups.map(g => (
          <div key={g.cat} className="flex flex-col gap-2">
            <h3 className="text-[10.5px] font-semibold uppercase tracking-wider text-[#646462] px-1">{categoryLabel(g.cat)}</h3>
            <div className="flex flex-col gap-2">
              {g.agents.map((a: any) => {
                const isSelected = a.id === selectedAgent?.id;
                return (
                  <button
                    key={a.id || a.name}
                    onClick={() => a.id && setSelectedAgentId(a.id)}
                    className={`bg-white border rounded-xl p-4 flex items-center justify-between transition-colors text-left ${
                      isSelected ? 'border-[#1a1a1a] shadow-[0px_1px_4px_rgba(20,20,20,0.08)]' : 'border-[#e9eae6] hover:border-[#cfd0cb]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-[#f8f8f7] flex items-center justify-center flex-shrink-0">
                        <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><circle cx="8" cy="6" r="2.5"/><path d="M2.5 14c.4-2 2.5-3.2 5.5-3.2s5.1 1.2 5.5 3.2v.5h-11v-.5z"/></svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold text-[#1a1a1a] truncate">{a.name}</p>
                        <p className="text-[12px] text-[#646462] truncate">{a.description || a.slug || categoryLabel(a.category)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      {a.locked ? (
                        <Pill tone="paused">Bloqueado</Pill>
                      ) : (
                        <Toggle
                          on={!!a.isActive}
                          onClick={() => onToggleAgent(a)}
                          disabled={pendingAgentId === a.id}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Pending tabs (Permissions / Knowledge / Reasoning / Safety) ──────────────
function PendingTab({ tab }: { tab: StudioTab }) {
  const labels: Record<string, { title: string; sub: string }> = {
    permissions: { title: 'Permisos',     sub: 'PermissionsView — pendiente migración' },
    knowledge:   { title: 'Conocimiento', sub: 'KnowledgeView — pendiente migración' },
    reasoning:   { title: 'Razonamiento', sub: 'ReasoningView — pendiente migración' },
    safety:      { title: 'Seguridad',    sub: 'SafetyView — pendiente migración' },
  };
  const info = labels[tab] || { title: tab, sub: 'Pendiente migración' };
  return (
    <div className="flex-1 flex items-center justify-center bg-white">
      <div className="text-center max-w-[420px] px-6">
        <div className="text-[36px] mb-3">🛠️</div>
        <h1 className="text-[18px] font-semibold tracking-[-0.4px] text-[#1a1a1a] mb-2">{info.title}</h1>
        <p className="text-[13px] text-[#646462] leading-[18px]">{info.sub}</p>
        <p className="text-[12px] text-[#646462] mt-3">Sigue disponible en el SaaS original (sin <code className="bg-[#f8f8f7] px-1 py-0.5 rounded">?v2=1</code>).</p>
      </div>
    </div>
  );
}

// ── Main AIStudioV2 ──────────────────────────────────────────────────────────
export default function AIStudioV2() {
  const [tab, setTab] = useState<StudioTab>('overview');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [pendingAgentId, setPendingAgentId] = useState<string | null>(null);
  const [agentActiveOverrides, setAgentActiveOverrides] = useState<Record<string, boolean>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [savingCostControls, setSavingCostControls] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  // ── Data ──
  const { data: studioData,         refetch: refetchStudio }    = useApi(aiApi.studio,                       [refreshKey], null);
  const { data: agentCatalog,       refetch: refetchAgents }    = useApi(agentsApi.list,                     [refreshKey], []);
  const { data: workspace,          refetch: refetchWorkspace } = useApi(workspacesApi.currentContext,        [refreshKey], null);
  const { data: reportOverview }                               = useApi(() => reportsApi.overview('7d'),     [refreshKey], null);
  const { data: reportApprovals }                              = useApi(() => reportsApi.approvals('7d'),    [refreshKey], null);
  const { data: reportCosts }                                  = useApi(() => reportsApi.costs('7d'),        [refreshKey], null);
  const { data: operationsOverview }                           = useApi(operationsApi.overview,              [refreshKey], null);
  const { data: recentRuns }                                   = useApi(operationsApi.agentRuns,             [refreshKey], []);
  const { data: connectors }                                   = useApi(connectorsApi.list,                  [refreshKey], []);

  // De-dupe + apply isActive overrides
  const mappedAgents = useMemo(() => {
    const list = Array.isArray(agentCatalog) ? agentCatalog : [];
    const byKey = new Map<string, any>();
    list.forEach(a => {
      const key = a.slug || a.name || a.id;
      const cur = byKey.get(key);
      if (!cur) { byKey.set(key, a); return; }
      const score = (cand: any) =>
        (cand.currentVersionId ? 4 : 0) +
        (cand.versionStatus === 'published' ? 2 : 0) +
        (cand.hasRegisteredImpl ? 1 : 0);
      if (score(a) > score(cur)) byKey.set(key, a);
    });
    return Array.from(byKey.values()).map(a => ({
      ...a,
      isActive: a.id && agentActiveOverrides[a.id] !== undefined ? agentActiveOverrides[a.id] : !!a.isActive,
      locked: !!a.isLocked,
    }));
  }, [agentCatalog, agentActiveOverrides]);

  // Auto-select first agent
  useEffect(() => {
    if (!selectedAgentId && mappedAgents.length > 0 && mappedAgents[0].id) {
      setSelectedAgentId(mappedAgents[0].id);
    }
  }, [mappedAgents, selectedAgentId]);

  // Selected agent's policy bundle
  const { data: policyDraft, refetch: refetchDraft } = useApi(
    () => selectedAgentId ? agentsApi.policyDraft(selectedAgentId) : Promise.resolve(null),
    [selectedAgentId, refreshKey],
    null,
  );
  const { data: effectivePolicy, refetch: refetchEffective } = useApi(
    () => selectedAgentId ? agentsApi.effectivePolicy(selectedAgentId) : Promise.resolve(null),
    [selectedAgentId, refreshKey],
    null,
  );

  const updateDraft   = useMutation((p: { id: string; body: any }) => agentsApi.updatePolicyDraft(p.id, p.body));
  const publishDraft  = useMutation((p: { id: string }) => agentsApi.publishPolicyDraft(p.id, {}));
  const rollbackDraft = useMutation((p: { id: string }) => agentsApi.rollbackPolicy(p.id, {}));
  const updateAgentConfig = useMutation((p: { id: string; body: any }) => agentsApi.config(p.id, p.body));

  // ── Workspace settings (cost controls) ──
  const workspaceSettings = useMemo(() => parseSettings(workspace?.settings), [workspace?.settings]);
  const aiStudioSettings = useMemo(() => parseSettings(workspaceSettings?.aiStudio), [workspaceSettings]);
  const costControls = useMemo(() => ({
    dailyCap:           safeNumber(aiStudioSettings?.costControls?.dailyCap, 20),
    hardStopEnabled:    Boolean(aiStudioSettings?.costControls?.hardStopEnabled),
    rolloutPercentage:  safeNumber(aiStudioSettings?.rolloutPercentage, 10),
  }), [aiStudioSettings]);

  async function persistAiStudioSettings(next: Record<string, any>) {
    if (!workspace?.id) return;
    await workspacesApi.update(workspace.id, { settings: { ...workspaceSettings, aiStudio: next } });
    refetchWorkspace();
  }

  async function handleHardStopToggle() {
    setSavingCostControls(true);
    try {
      await persistAiStudioSettings({
        ...aiStudioSettings,
        rolloutPercentage: costControls.rolloutPercentage,
        costControls: { ...costControls, hardStopEnabled: !costControls.hardStopEnabled },
      });
      showToast(`Parada en runtime ${!costControls.hardStopEnabled ? 'activada' : 'desactivada'}.`);
    } catch (err: any) {
      showToast(err?.message || 'Error guardando controles de coste');
    } finally {
      setSavingCostControls(false);
    }
  }

  async function handleCostCapChange(delta: number) {
    setSavingCostControls(true);
    try {
      const next = Math.max(5, costControls.dailyCap + delta);
      await persistAiStudioSettings({
        ...aiStudioSettings,
        rolloutPercentage: costControls.rolloutPercentage,
        costControls: { ...costControls, dailyCap: next },
      });
      showToast(`Tope diario actualizado a €${next}.`);
    } catch (err: any) {
      showToast(err?.message || 'Error guardando tope');
    } finally {
      setSavingCostControls(false);
    }
  }

  // ── Agent toggle ──
  async function handleToggleAgent(agent: any) {
    if (!agent?.id || agent.locked) return;
    const nextActive = !agent.isActive;
    setPendingAgentId(agent.id);
    const result = await updateAgentConfig.mutate({ id: agent.id, body: { isActive: nextActive } });
    if (!result) {
      showToast(`No se pudo ${nextActive ? 'activar' : 'desactivar'} ${agent.name}.`);
    } else {
      setAgentActiveOverrides(prev => ({ ...prev, [agent.id]: nextActive }));
      showToast(`${agent.name} ${nextActive ? 'activado' : 'desactivado'}.`);
      refetchAgents();
      refetchStudio();
    }
    setPendingAgentId(null);
  }

  async function handleEnableAll() {
    const targets = mappedAgents.filter(a => a.id && !a.locked && !a.isActive);
    if (targets.length === 0) return;
    if (!confirm(`Activar ${targets.length} agente(s) editable(s)?`)) return;
    await Promise.all(targets.map(a => updateAgentConfig.mutate({ id: a.id, body: { isActive: true } })));
    setAgentActiveOverrides(prev => {
      const next = { ...prev };
      targets.forEach(a => { next[a.id] = true; });
      return next;
    });
    showToast(`${targets.length} agente(s) activado(s).`);
    refetchAgents(); refetchStudio();
  }

  async function handleEmergencyStop() {
    const targets = mappedAgents.filter(a => a.id && !a.locked && a.isActive);
    if (targets.length === 0) return;
    if (!confirm(`Parada de emergencia: detener ${targets.length} agente(s) activo(s)?`)) return;
    await Promise.all(targets.map(a => updateAgentConfig.mutate({ id: a.id, body: { isActive: false } })));
    setAgentActiveOverrides(prev => {
      const next = { ...prev };
      targets.forEach(a => { next[a.id] = false; });
      return next;
    });
    showToast(`${targets.length} agente(s) detenido(s).`);
    refetchAgents(); refetchStudio();
  }

  // ── Policy bundle save / publish / rollback ──
  async function handleSaveDraft() {
    if (!selectedAgentId) return;
    setDraftBusy(true);
    try {
      const bundle = policyDraft?.bundle || {};
      const result = await updateDraft.mutate({ id: selectedAgentId, body: {
        permissionProfile: bundle.permissionProfile || {},
        reasoningProfile:  bundle.reasoningProfile  || {},
        safetyProfile:     bundle.safetyProfile     || {},
        knowledgeProfile:  bundle.knowledgeProfile  || {},
        rolloutPolicy:     bundle.rolloutPolicy     || { rolloutPercentage: costControls.rolloutPercentage },
      }});
      if (result) {
        showToast('Borrador guardado.');
        refetchDraft(); refetchEffective();
      }
    } finally { setDraftBusy(false); }
  }

  async function handlePublishDraft() {
    if (!selectedAgentId) return;
    if (!confirm('¿Publicar el bundle al runtime?')) return;
    setDraftBusy(true);
    try {
      const result = await publishDraft.mutate({ id: selectedAgentId });
      if (result) {
        showToast('Bundle publicado al runtime.');
        refetchDraft(); refetchEffective();
        setRefreshKey(k => k + 1);
      }
    } finally { setDraftBusy(false); }
  }

  async function handleRollback() {
    if (!selectedAgentId) return;
    if (!confirm('¿Revertir al bundle anterior?')) return;
    setDraftBusy(true);
    try {
      const result = await rollbackDraft.mutate({ id: selectedAgentId });
      if (result) {
        showToast('Bundle revertido.');
        refetchDraft(); refetchEffective();
        setRefreshKey(k => k + 1);
      }
    } finally { setDraftBusy(false); }
  }

  // ── Render ──
  return (
    <div className="flex flex-1 min-w-0 h-full overflow-hidden relative bg-white">
      <StudioSidebar tab={tab} onTab={setTab} />
      {tab === 'overview' && (
        <OverviewTab
          reportOverview={reportOverview}
          reportApprovals={reportApprovals}
          reportCosts={reportCosts}
          operationsOverview={operationsOverview}
          recentRuns={recentRuns || []}
          studioData={studioData}
          connectors={connectors || []}
          mappedAgents={mappedAgents}
          costControls={costControls}
          savingCostControls={savingCostControls}
          onCostCapChange={handleCostCapChange}
          onHardStopToggle={handleHardStopToggle}
          onToggleAgent={handleToggleAgent}
          pendingAgentId={pendingAgentId}
          toast={tab === 'overview' ? toast : null}
          onEnableAll={handleEnableAll}
          onEmergencyStop={handleEmergencyStop}
        />
      )}
      {tab === 'agents' && (
        <AgentsTab
          mappedAgents={mappedAgents}
          onToggleAgent={handleToggleAgent}
          pendingAgentId={pendingAgentId}
          selectedAgentId={selectedAgentId}
          setSelectedAgentId={setSelectedAgentId}
          policyDraft={policyDraft}
          effectivePolicy={effectivePolicy}
          onSaveDraft={handleSaveDraft}
          onPublishDraft={handlePublishDraft}
          onRollback={handleRollback}
          draftBusy={draftBusy}
        />
      )}
      {(tab === 'permissions' || tab === 'knowledge' || tab === 'reasoning' || tab === 'safety') && (
        <PendingTab tab={tab} />
      )}

      {/* Toast (global, only when not in overview which has its own) */}
      {toast && tab !== 'overview' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-[13px] font-semibold shadow-lg bg-[#1a1a1a] text-white z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
