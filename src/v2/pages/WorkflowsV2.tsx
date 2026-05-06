// WorkflowsV2 — migrated by agent-workflows-01.
// ─────────────────────────────────────────────────────────────────────────────
// What works (this iteration):
//   • Workflow list + 4 library sections (workflows / executions / variables / data tables)
//     pulled from real backend: workflowsApi.list(), workflowsApi.recentRuns(),
//     workspacesApi.currentContext() (variables + data_tables live in settings).
//   • Workflow detail drawer with metrics, status, recent runs, version history.
//   • Run, dry-run, validate, retry/resume/cancel-run, rollback, archive — all wired
//     to the real workflowsApi mutations. Dry-run + validate use the workflow's
//     persisted currentVersion as the body (no builder edits in this phase).
//   • Templates modal — `workflowsApi.create()` from any of 10 prebuilt templates.
//   • SSE listener for `workflow:run:started` / `workflow:run:updated` updates the
//     run badge in the drawer in-place (same as original).
//   • Search + sort (name vs updated) + status filter.
//   • Sidebar in FinSidebar style with "Flujos de trabajo" group active, plus
//     library sections as items.
//
// Pending for later iterations (still in src/components/Workflows.tsx until migrated):
//   • Visual builder canvas with React Flow (~3000 lines: WorkflowNodeCard,
//     WorkflowAddNodePanel, WorkflowEditorTopbar, NodeConfigFields, agent picker,
//     edge buttons, connector picker, etc). Without it, "Edit", "Tidy", and
//     creating a workflow from scratch fall back to opening the original SaaS
//     (they still work there).
//   • Variables CRUD modal (WorkflowVariableModal) + data table editor
//     (WorkflowDataTableEditor / WorkflowDataTableCreateModal). Read-only
//     lists are shown; create/edit reuses the original SaaS.
//   • Per-workflow Evaluations tab (datasets) — original WorkflowEvaluations.
//   • Card "share / push to git / download / import URL / import file /
//     duplicate / move / rename" menu — only the run-side actions are wired here.
//   • Per-node step-run + diagnostics overlays (need the builder).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react';
import { workflowsApi, workspacesApi } from '../../api/client';
import { useApi, useMutation } from '../../api/hooks';

// ── Types ────────────────────────────────────────────────────────────────────
type LibrarySection = 'workflows' | 'executions' | 'variables' | 'data_tables';
type StatusFilter = '' | 'active' | 'needs_setup' | 'blocked' | 'warning' | 'dependency_missing';

interface Workflow {
  id: string;
  name: string;
  category: string;
  description: string;
  status: 'active' | 'needs_setup' | 'blocked' | 'warning' | 'dependency_missing';
  statusMessage?: string;
  metrics: Array<{ label: string; value: string; suffix?: string }>;
  currentVersion: any;
  versions: any[];
  recentRuns: any[];
  updatedAt: string | null;
  lastRunAt: string | null;
}

interface VariableRow { id: string; key: string; value: string; scope: string; updatedAt: string }
interface DataTableRow { id: string; name: string; columns: number; rows: number; updatedAt: string }

// ── Helpers ──────────────────────────────────────────────────────────────────
function relativeDate(iso: string | null | undefined): string {
  if (!iso) return 'nunca';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 'nunca';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return 'justo ahora';
  if (m < 60) return `hace ${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.round(h / 24);
  if (d < 30) return `hace ${d}d`;
  return new Date(iso).toLocaleDateString();
}

function mapWorkflow(w: any): Workflow {
  const rawVersion = w?.current_version ?? w?.workflow_versions ?? null;
  const metrics = w?.metrics ?? {};
  const status = ['active', 'needs_setup', 'blocked', 'warning', 'dependency_missing'].includes(w?.health_status)
    ? (w.health_status as Workflow['status'])
    : 'active';
  return {
    id: w.id,
    name: w.name ?? 'Sin nombre',
    category: w.category ?? rawVersion?.trigger?.workflowCategory ?? 'Sin categoría',
    description: w.description ?? '',
    status,
    statusMessage: w.health_message ?? undefined,
    currentVersion: rawVersion ?? null,
    versions: Array.isArray(w.versions) ? w.versions : [],
    recentRuns: Array.isArray(w.recent_runs) ? w.recent_runs : [],
    updatedAt: w.updated_at ?? null,
    lastRunAt: metrics.last_run_at ?? null,
    metrics: [
      { label: 'Ejecuciones', value: String(metrics.executions ?? 0) },
      { label: 'Éxito',       value: metrics.success_rate !== undefined ? `${metrics.success_rate}%` : 'N/A' },
      { label: 'Fallos',      value: String(metrics.failed ?? 0) },
      { label: 'Aprobaciones', value: String(metrics.approvals_created ?? 0) },
      { label: 'Bloqueadas',   value: String(metrics.actions_blocked ?? 0) },
      { label: 'Tiempo ahorrado', value: String(metrics.time_saved_minutes ?? 0), suffix: 'm' },
    ],
  };
}

function statusLabel(s: Workflow['status']): string {
  switch (s) {
    case 'active':             return 'Activo';
    case 'needs_setup':        return 'Configuración pendiente';
    case 'blocked':            return 'Bloqueado';
    case 'warning':            return 'Advertencia';
    case 'dependency_missing': return 'Dependencia faltante';
  }
}

function statusPillCls(s: Workflow['status']): string {
  switch (s) {
    case 'active':      return 'bg-[#dcfce7] text-[#166534]';
    case 'warning':     return 'bg-[#fef3c7] text-[#92400e]';
    case 'blocked':
    case 'dependency_missing': return 'bg-[#fee2e2] text-[#991b1b]';
    case 'needs_setup': return 'bg-[#e9eae6] text-[#646462]';
  }
}

function runStatusCls(s: string): string {
  const v = s.toLowerCase();
  if (['completed', 'resumed', 'succeeded'].includes(v)) return 'bg-[#dcfce7] text-[#166534]';
  if (['failed', 'blocked', 'cancelled', 'errored'].includes(v)) return 'bg-[#fee2e2] text-[#991b1b]';
  return 'bg-[#fef3c7] text-[#92400e]';
}

// ── Templates (subset of original TEMPLATES — enough to seed a workflow) ─────
const TEMPLATES = [
  {
    id: 'refund_guarded', name: 'Reembolso protegido', category: 'Pagos y riesgo',
    description: 'Evalúa la política de reembolso, deriva los importes altos a aprobación y ejecuta los seguros.',
  },
  {
    id: 'vip_escalation', name: 'Escalada VIP', category: 'Operaciones de soporte',
    description: 'Detecta casos VIP, los asigna a soporte sénior y crea una nota interna.',
  },
  {
    id: 'sla_breach', name: 'Incumplimiento de SLA', category: 'Operaciones de soporte',
    description: 'Espera, evalúa la política de SLA y escala los casos en riesgo.',
  },
  {
    id: 'fraud_risk_review', name: 'Revisión de riesgo de fraude', category: 'Pagos y riesgo',
    description: 'Ejecuta el agente de riesgo, ramifica por nivel y bloquea automatización insegura.',
  },
  {
    id: 'return_inspection', name: 'Inspección de devolución', category: 'Devoluciones',
    description: 'Crea la devolución, busca la política de inspección y deriva las de alto valor.',
  },
];

// ── Sidebar ──────────────────────────────────────────────────────────────────
function WorkflowsSidebar({
  section, onSection, statusFilter, onStatusFilter,
}: {
  section: LibrarySection;
  onSection: (s: LibrarySection) => void;
  statusFilter: StatusFilter;
  onStatusFilter: (f: StatusFilter) => void;
}) {
  const [openFin, setOpenFin] = useState(true);
  const [openFilters, setOpenFilters] = useState(true);

  const Chev = ({ open }: { open: boolean }) => (
    <svg viewBox="0 0 16 16" className={`w-3 h-3 fill-[#646462] flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}>
      <path d="M6 4l4 4-4 4z" />
    </svg>
  );

  const itemCls = (active: boolean) =>
    `relative flex items-center gap-2 h-8 pl-3 pr-3 py-1 rounded-lg cursor-pointer text-[13px] w-full text-left transition-colors ${
      active
        ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]'
        : 'hover:bg-[#e9eae6]/40 text-[#1a1a1a]'
    }`;

  // Bold filled icons (Inbox-style) for sub-section items
  const SectionIcon = ({ kind }: { kind: LibrarySection }) => {
    const cls = 'w-4 h-4 fill-[#1a1a1a]';
    switch (kind) {
      case 'workflows':
        return <svg viewBox="0 0 16 16" className={cls}><path d="M2 3.5h6v1.5H2zm0 3.75h10v1.5H2zm0 3.75h6v1.5H2z" /><circle cx="11" cy="4.25" r="1.7" /><circle cx="13" cy="11.75" r="1.7" /></svg>;
      case 'executions':
        return <svg viewBox="0 0 16 16" className={cls}><path d="M2 2h12v3H2zm0 4.5h12v3H2zm0 4.5h12v3H2z" /></svg>;
      case 'variables':
        return <svg viewBox="0 0 16 16" className={cls}><path d="M3 3h4v3H3zm6 0h4v3H9zM3 9h4v4H3zm6 0h4v4H9z" /></svg>;
      case 'data_tables':
        return <svg viewBox="0 0 16 16" className={cls}><path d="M2 3h12v2.5H2zm0 4h12v2.5H2zm0 4h12v2.5H2z" /></svg>;
    }
  };

  const sections: Array<{ key: LibrarySection; label: string }> = [
    { key: 'workflows',   label: 'Flujos' },
    { key: 'executions',  label: 'Ejecuciones' },
    { key: 'variables',   label: 'Variables' },
    { key: 'data_tables', label: 'Tablas de datos' },
  ];

  const statusOptions: Array<{ key: StatusFilter; label: string }> = [
    { key: '', label: 'Todos' },
    { key: 'active', label: 'Activos' },
    { key: 'needs_setup', label: 'Configuración pendiente' },
    { key: 'warning', label: 'Con advertencias' },
    { key: 'blocked', label: 'Bloqueados' },
  ];

  return (
    <div className="flex flex-col h-full w-[236px] bg-[#f8f8f7] border-r border-[#e9eae6] flex-shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 h-16 flex-shrink-0">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Fin AI Agent</span>
      </div>

      <div className="flex-1 overflow-y-auto pl-3 pr-3 pb-4 flex flex-col gap-0.5">
        {/* Flujos de trabajo group — current page */}
        <button onClick={() => setOpenFin(o => !o)} className={itemCls(false)}>
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M2 3.5h6v1.5H2zm0 3.75h10v1.5H2zm0 3.75h6v1.5H2z" /><circle cx="11" cy="4.25" r="1.7" /><circle cx="13" cy="11.75" r="1.7" /></svg>
          <span className="flex-1">Flujos de trabajo</span>
          <Chev open={openFin} />
        </button>
        {openFin && (
          <div className="flex flex-col pl-7 mt-0.5 mb-1 gap-0.5">
            {sections.map(s => (
              <button key={s.key} onClick={() => onSection(s.key)} className={itemCls(section === s.key)}>
                <SectionIcon kind={s.key} />
                <span className="flex-1 truncate">{s.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Filters group (only relevant for the workflows section) */}
        {section === 'workflows' && (
          <>
            <div className="border-t border-[#e9eae6]/70 my-2" />
            <button onClick={() => setOpenFilters(o => !o)} className={itemCls(false)}>
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M2 3h12l-4.5 5v4l-3 1.5V8z" /></svg>
              <span className="flex-1">Filtrar por estado</span>
              <Chev open={openFilters} />
            </button>
            {openFilters && (
              <div className="flex flex-col pl-7 mt-0.5 mb-1 gap-0.5">
                {statusOptions.map(o => (
                  <button key={o.key || 'all'} onClick={() => onStatusFilter(o.key)} className={itemCls(statusFilter === o.key)}>
                    <span className="flex-1 truncate">{o.label}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Workflow Card ────────────────────────────────────────────────────────────
function WorkflowCard({
  wf, onOpen, onRun, onTriggerEvent, busy,
}: {
  wf: Workflow;
  onOpen: (wf: Workflow) => void;
  onRun: (wf: Workflow) => void;
  onTriggerEvent: (wf: Workflow) => void;
  busy: boolean;
}) {
  return (
    <div
      className="cursor-pointer rounded-2xl border border-[#e9eae6] bg-white p-5 hover:shadow-[0px_2px_8px_rgba(20,20,20,0.08)] transition-shadow"
      onClick={() => onOpen(wf)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#646462] mb-2">{wf.category}</p>
          <h3 className="text-[15px] font-semibold text-[#1a1a1a] truncate">{wf.name}</h3>
        </div>
        <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusPillCls(wf.status)}`}>
          {statusLabel(wf.status)}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-[12.5px] text-[#646462] leading-[18px] min-h-[36px]">
        {wf.description || 'Sin descripción.'}
      </p>
      <div className="mt-4 flex items-center gap-1.5 text-[11px] text-[#646462]">
        <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8.75 4v3.69l2.6 1.5-.75 1.3L7.25 8.5V4h1.5z" /></svg>
        Última ejecución {relativeDate(wf.lastRunAt)}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[#e9eae6] pt-3">
        {wf.metrics.slice(0, 3).map(m => (
          <div key={m.label}>
            <div className="text-[13px] font-semibold text-[#1a1a1a]">{m.value}{m.suffix ?? ''}</div>
            <div className="text-[10px] text-[#646462]">{m.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-end gap-2 border-t border-[#e9eae6] pt-3">
        <button
          onClick={(e) => { e.stopPropagation(); onTriggerEvent(wf); }}
          disabled={busy}
          className={`px-3 h-8 rounded-full text-[12.5px] font-semibold ${
            busy ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed' : 'bg-[#f8f8f7] text-[#1a1a1a] hover:bg-[#ededea]'
          }`}
          title="Disparar el evento configurado"
        >
          Disparar
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRun(wf); }}
          disabled={busy}
          className={`px-3 h-8 rounded-full text-[12.5px] font-semibold ${
            busy ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed' : 'bg-[#1a1a1a] text-white hover:bg-black'
          }`}
        >
          {busy ? 'Ejecutando…' : 'Ejecutar'}
        </button>
      </div>
    </div>
  );
}

// ── Workflow Detail Drawer (right side) ──────────────────────────────────────
function WorkflowDetailDrawer({
  wf, onClose, onAction, mutationLoading, runResult, dryRunResult, validationResult,
}: {
  wf: Workflow;
  onClose: () => void;
  onAction: (action: 'run' | 'dryRun' | 'validate' | 'archive' | 'rollback' | 'retry' | 'resume' | 'cancel' | 'trigger') => void;
  mutationLoading: string | null;
  runResult: any | null;
  dryRunResult: any | null;
  validationResult: any | null;
}) {
  const isLoading = (k: string) => mutationLoading === k;
  const hasVersions = (wf.versions?.length ?? 0) >= 2;
  const latestRun = runResult ?? wf.recentRuns?.[0] ?? null;
  const latestRunId = latestRun?.id;

  const ActionBtn = ({ k, label, danger, primary }: { k: string; label: string; danger?: boolean; primary?: boolean }) => (
    <button
      onClick={() => onAction(k as any)}
      disabled={!!mutationLoading}
      className={`px-3 h-8 rounded-full text-[12.5px] font-semibold whitespace-nowrap ${
        mutationLoading
          ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed'
          : primary
            ? 'bg-[#1a1a1a] text-white hover:bg-black'
            : danger
              ? 'bg-[#9a3412] text-white hover:bg-[#7a2812]'
              : 'bg-[#f8f8f7] text-[#1a1a1a] hover:bg-[#ededea]'
      }`}
    >
      {isLoading(k) ? '…' : label}
    </button>
  );

  return (
    <div className="absolute inset-y-0 right-0 w-[460px] bg-white border-l border-[#e9eae6] shadow-[0px_4px_24px_rgba(20,20,20,0.08)] flex flex-col z-30">
      {/* Header */}
      <div className="flex items-start justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#646462] mb-1">{wf.category}</p>
          <h2 className="text-[18px] font-semibold tracking-[-0.4px] text-[#1a1a1a] truncate">{wf.name}</h2>
          <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusPillCls(wf.status)}`}>
            {statusLabel(wf.status)}
          </span>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-[#f8f8f7] flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="#1a1a1a" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
        {wf.description && (
          <p className="text-[13px] text-[#1a1a1a] leading-[19px]">{wf.description}</p>
        )}
        {wf.statusMessage && wf.status !== 'active' && (
          <div className="bg-[#fef3c7] border border-[#fde68a] rounded-lg px-3 py-2 text-[12px] text-[#92400e]">
            {wf.statusMessage}
          </div>
        )}

        {/* Metrics */}
        <div>
          <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-2">Métricas</p>
          <div className="grid grid-cols-3 gap-3">
            {wf.metrics.map(m => (
              <div key={m.label} className="bg-[#f8f8f7] rounded-lg px-3 py-2">
                <div className="text-[14px] font-semibold text-[#1a1a1a]">{m.value}{m.suffix ?? ''}</div>
                <div className="text-[11px] text-[#646462]">{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div>
          <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-2">Acciones</p>
          <div className="flex flex-wrap gap-2">
            <ActionBtn k="run" label="Ejecutar" primary />
            <ActionBtn k="trigger" label="Disparar evento" />
            <ActionBtn k="dryRun" label="Simulación" />
            <ActionBtn k="validate" label="Validar" />
            {latestRunId && <ActionBtn k="retry" label="Reintentar última" />}
            {latestRunId && <ActionBtn k="resume" label="Reanudar" />}
            {latestRunId && <ActionBtn k="cancel" label="Cancelar" />}
            {hasVersions && <ActionBtn k="rollback" label="Rollback" />}
            <ActionBtn k="archive" label="Archivar" danger />
          </div>
          <p className="text-[11px] text-[#646462] mt-2 leading-[16px]">
            La edición visual del flujo no está disponible en V2 todavía — abre la pantalla original para modificar nodos.
          </p>
        </div>

        {/* Latest run / dry run / validation */}
        {latestRun && (
          <div>
            <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-2">Última ejecución</p>
            <div className="bg-[#f8f8f7] rounded-lg px-3 py-2.5 flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-mono text-[#1a1a1a] truncate">{String(latestRun.id || '').slice(0, 16)}</p>
                <p className="text-[10px] text-[#646462] mt-0.5">{relativeDate(latestRun.startedAt ?? latestRun.started_at ?? latestRun.created_at)}</p>
              </div>
              <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${runStatusCls(latestRun.status ?? 'pending')}`}>
                {latestRun.status ?? 'pending'}
              </span>
            </div>
            {latestRun.error && (
              <p className="text-[11px] text-[#9a3412] mt-2 break-words">{String(latestRun.error)}</p>
            )}
          </div>
        )}

        {dryRunResult && (
          <div>
            <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-2">Última simulación</p>
            <pre className="bg-[#f8f8f7] rounded-lg px-3 py-2 text-[11px] text-[#1a1a1a] overflow-x-auto max-h-[180px] whitespace-pre-wrap">{JSON.stringify(dryRunResult.summary ?? dryRunResult, null, 2)}</pre>
          </div>
        )}

        {validationResult && (
          <div>
            <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-2">Validación</p>
            <div className={`rounded-lg px-3 py-2 text-[12px] ${validationResult.ok ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#fee2e2] text-[#991b1b]'}`}>
              {validationResult.ok ? 'Sin errores' : `${validationResult.errors?.length ?? 0} errores · ${validationResult.warnings?.length ?? 0} avisos`}
            </div>
            {Array.isArray(validationResult.diagnostics) && validationResult.diagnostics.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {validationResult.diagnostics.slice(0, 5).map((d: any, i: number) => (
                  <li key={i} className="text-[11px] text-[#646462]">
                    <span className={`font-semibold ${d.severity === 'error' ? 'text-[#9a3412]' : 'text-[#92400e]'}`}>{d.severity}:</span> {d.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Recent runs (history) */}
        {wf.recentRuns && wf.recentRuns.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-2">Historial reciente</p>
            <div className="flex flex-col gap-1">
              {wf.recentRuns.slice(0, 5).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between text-[12px] bg-[#f8f8f7] rounded px-2 py-1.5">
                  <span className="font-mono text-[11px] text-[#1a1a1a] truncate flex-1">{String(r.id || '').slice(0, 16)}</span>
                  <span className="text-[10px] text-[#646462] mx-2">{relativeDate(r.startedAt ?? r.started_at ?? r.created_at)}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${runStatusCls(r.status ?? 'pending')}`}>{r.status ?? 'pending'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Versions */}
        {wf.versions && wf.versions.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-2">Versiones ({wf.versions.length})</p>
            <p className="text-[11px] text-[#646462]">La versión actual es `{wf.currentVersion?.id ?? wf.currentVersion?.version_number ?? '—'}`. Usa Rollback para volver a la anterior.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Templates Modal ──────────────────────────────────────────────────────────
function TemplatesModal({
  open, onClose, onCreate, creating,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (template: typeof TEMPLATES[number]) => void;
  creating: boolean;
}) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-[#e9eae6] shadow-xl p-6 w-[640px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a] mb-1">Plantillas</h2>
        <p className="text-[13px] text-[#646462] mb-5">Crea un flujo desde una plantilla. Puedes editarlo después en el editor visual original.</p>
        <div className="grid grid-cols-2 gap-3">
          {TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => onCreate(t)}
              disabled={creating}
              className={`text-left rounded-xl border border-[#e9eae6] p-4 transition-shadow ${creating ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-[0px_2px_8px_rgba(20,20,20,0.08)]'}`}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#646462] mb-1.5">{t.category}</p>
              <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">{t.name}</h3>
              <p className="text-[12px] text-[#646462] leading-[17px]">{t.description}</p>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] hover:bg-[#ededea]">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ── Variables / Data tables (read-only summaries) ────────────────────────────
function VariablesList({ rows, query }: { rows: VariableRow[]; query: string }) {
  const filtered = rows.filter(r => !query.trim() || `${r.key} ${r.scope}`.toLowerCase().includes(query.toLowerCase()));
  if (filtered.length === 0) {
    return <EmptyState title="Sin variables" description="Crea variables para reutilizar valores en tus flujos. La edición está disponible en la pantalla original." />;
  }
  return (
    <div className="bg-white rounded-2xl border border-[#e9eae6] overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-[#e9eae6] bg-[#f8f8f7]">
            <th className="px-5 py-3 text-[11px] font-semibold text-[#646462] uppercase tracking-wider">Clave</th>
            <th className="px-5 py-3 text-[11px] font-semibold text-[#646462] uppercase tracking-wider">Valor</th>
            <th className="px-5 py-3 text-[11px] font-semibold text-[#646462] uppercase tracking-wider">Alcance</th>
            <th className="px-5 py-3 text-[11px] font-semibold text-[#646462] uppercase tracking-wider">Actualizada</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(v => (
            <tr key={v.id} className="border-b border-[#e9eae6] last:border-0 hover:bg-[#f8f8f7]">
              <td className="px-5 py-3 text-[13px] font-mono text-[#1a1a1a]">{v.key}</td>
              <td className="px-5 py-3 text-[12.5px] text-[#1a1a1a] font-mono truncate max-w-[280px]">{v.scope === 'secure' ? '••••••••' : v.value}</td>
              <td className="px-5 py-3"><span className="px-2 py-0.5 rounded-full bg-[#f8f8f7] text-[11px] font-semibold text-[#1a1a1a] uppercase">{v.scope}</span></td>
              <td className="px-5 py-3 text-[12px] text-[#646462]">{relativeDate(v.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DataTablesList({ rows, query }: { rows: DataTableRow[]; query: string }) {
  const filtered = rows.filter(r => !query.trim() || r.name.toLowerCase().includes(query.toLowerCase()));
  if (filtered.length === 0) {
    return <EmptyState title="Sin tablas de datos" description="Crea tablas para almacenar listas que tus flujos puedan consultar. La edición está disponible en la pantalla original." />;
  }
  return (
    <div className="bg-white rounded-2xl border border-[#e9eae6] overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-[#e9eae6] bg-[#f8f8f7]">
            <th className="px-5 py-3 text-[11px] font-semibold text-[#646462] uppercase tracking-wider">Nombre</th>
            <th className="px-5 py-3 text-[11px] font-semibold text-[#646462] uppercase tracking-wider">Columnas</th>
            <th className="px-5 py-3 text-[11px] font-semibold text-[#646462] uppercase tracking-wider">Filas</th>
            <th className="px-5 py-3 text-[11px] font-semibold text-[#646462] uppercase tracking-wider">Actualizada</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(t => (
            <tr key={t.id} className="border-b border-[#e9eae6] last:border-0 hover:bg-[#f8f8f7]">
              <td className="px-5 py-3 text-[13px] font-semibold text-[#1a1a1a]">{t.name}</td>
              <td className="px-5 py-3 text-[12.5px] text-[#1a1a1a]">{t.columns}</td>
              <td className="px-5 py-3 text-[12.5px] text-[#1a1a1a]">{t.rows}</td>
              <td className="px-5 py-3 text-[12px] text-[#646462]">{relativeDate(t.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Executions table ─────────────────────────────────────────────────────────
function ExecutionsTable({ runs, query, workflows }: { runs: any[]; query: string; workflows: Workflow[] }) {
  const wfById = new Map(workflows.map(w => [w.id, w]));
  const filtered = runs.filter(r => !query.trim() || `${r.id ?? ''} ${r.workflow_name ?? ''} ${r.status ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  if (filtered.length === 0) {
    return <EmptyState title="Sin ejecuciones" description="Cuando se publiquen flujos, sus ejecuciones recientes aparecerán aquí." />;
  }
  return (
    <div className="bg-white rounded-2xl border border-[#e9eae6] overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-[#e9eae6] bg-[#f8f8f7]">
            <th className="px-5 py-3 text-[11px] font-semibold text-[#646462] uppercase tracking-wider">Ejecución</th>
            <th className="px-5 py-3 text-[11px] font-semibold text-[#646462] uppercase tracking-wider">Trigger</th>
            <th className="px-5 py-3 text-[11px] font-semibold text-[#646462] uppercase tracking-wider">Cuándo</th>
            <th className="px-5 py-3 text-[11px] font-semibold text-[#646462] uppercase tracking-wider">Estado</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(run => {
            const wf = wfById.get(run?.workflowId ?? run?.workflow_id ?? '');
            const startedAt = run?.startedAt ?? run?.started_at ?? run?.created_at;
            const status = String(run?.status ?? 'pending');
            return (
              <tr key={run.id} className="border-b border-[#e9eae6] last:border-0 hover:bg-[#f8f8f7]">
                <td className="px-5 py-3">
                  <p className="text-[13px] font-semibold text-[#1a1a1a]">{run.workflow_name ?? wf?.name ?? 'Ejecución'}</p>
                  <p className="text-[10px] font-mono text-[#646462] mt-0.5">{String(run.id || '').slice(0, 12)}</p>
                </td>
                <td className="px-5 py-3"><span className="px-2 py-0.5 rounded bg-[#f8f8f7] text-[11px] font-semibold text-[#646462] uppercase">{run.trigger_type ?? 'manual'}</span></td>
                <td className="px-5 py-3 text-[12px] text-[#646462]">{relativeDate(startedAt)}</td>
                <td className="px-5 py-3"><span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${runStatusCls(status)}`}>{status}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-white rounded-2xl border border-[#e9eae6] p-8 flex flex-col items-center text-center">
      <div className="w-12 h-12 rounded-full bg-[#f8f8f7] flex items-center justify-center mb-3">
        <svg viewBox="0 0 16 16" className="w-5 h-5 fill-[#646462]"><path d="M2 3.5h6v1.5H2zm0 3.75h10v1.5H2zm0 3.75h6v1.5H2z" /><circle cx="11" cy="4.25" r="1.7" /><circle cx="13" cy="11.75" r="1.7" /></svg>
      </div>
      <h3 className="text-[15px] font-semibold text-[#1a1a1a] mb-1">{title}</h3>
      <p className="text-[12.5px] text-[#646462] max-w-[360px] leading-[18px]">{description}</p>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export default function WorkflowsV2() {
  const [section, setSection] = useState<LibrarySection>('workflows');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<'updated' | 'name'>('updated');
  const [openWf, setOpenWf] = useState<Workflow | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [runResult, setRunResult] = useState<any | null>(null);
  const [dryRunResult, setDryRunResult] = useState<any | null>(null);
  const [validationResult, setValidationResult] = useState<any | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [mutationLoading, setMutationLoading] = useState<string | null>(null);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Data ────────────────────────────────────────────────────────────────
  const { data: apiWorkflows, error: workflowsError, loading: workflowsLoading } = useApi(
    () => workflowsApi.list(),
    [refreshTick],
    [],
  );
  const { data: recentRuns } = useApi(() => workflowsApi.recentRuns(), [refreshTick], []);
  const { data: workspaceContext } = useApi(() => workspacesApi.currentContext(), [refreshTick], null);

  const workflows = useMemo<Workflow[]>(
    () => (Array.isArray(apiWorkflows) ? apiWorkflows.map(mapWorkflow) : []),
    [apiWorkflows],
  );

  const variables: VariableRow[] = useMemo(() => {
    const settings = (workspaceContext as any)?.settings;
    const raw = settings?.workflows?.variables ?? settings?.workflow_variables ?? [];
    if (!Array.isArray(raw)) return [];
    return raw.map((v: any) => ({
      id: v.id ?? v.key,
      key: v.key ?? '',
      value: v.value ?? '',
      scope: v.scope ?? 'workspace',
      updatedAt: v.updatedAt ?? v.updated_at ?? '',
    }));
  }, [workspaceContext]);

  const dataTables: DataTableRow[] = useMemo(() => {
    const settings = (workspaceContext as any)?.settings;
    const raw = settings?.workflows?.dataTables ?? settings?.workflow_data_tables ?? [];
    if (!Array.isArray(raw)) return [];
    return raw.map((t: any) => ({
      id: t.id ?? t.name,
      name: t.name ?? 'Sin nombre',
      columns: Array.isArray(t.columns) ? t.columns.length : 0,
      rows: Array.isArray(t.rows) ? t.rows.length : 0,
      updatedAt: t.updatedAt ?? t.updated_at ?? '',
    }));
  }, [workspaceContext]);

  // ── Mutations ───────────────────────────────────────────────────────────
  const createWf = useMutation((payload: Record<string, any>) => workflowsApi.create(payload));
  const runWf = useMutation((id: string) => workflowsApi.run(id));
  const dryRunWf = useMutation((p: { id: string; body: Record<string, any> }) => workflowsApi.dryRun(p.id, p.body));
  const validateWf = useMutation((p: { id: string; body: Record<string, any> }) => workflowsApi.validate(p.id, p.body));
  const archiveWf = useMutation((id: string) => workflowsApi.archive(id));
  const rollbackWf = useMutation((id: string) => workflowsApi.rollback(id));
  const retryRun = useMutation((runId: string) => workflowsApi.retryRun(runId));
  const resumeRun = useMutation((runId: string) => workflowsApi.resumeRun(runId));
  const cancelRun = useMutation((runId: string) => workflowsApi.cancelRun(runId));
  const triggerEvent = useMutation((payload: Record<string, any>) => workflowsApi.triggerEvent(payload));

  // ── SSE: refresh runResult in-place when backend pushes updates ────────
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/sse');
      const handler = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (data?.runId && data?.status) {
            setRunResult((prev: any) => {
              if (!prev || prev.id !== data.runId) return prev;
              return { ...prev, status: data.status, error: data.error ?? prev.error };
            });
          }
        } catch { /* ignore */ }
      };
      es.addEventListener('workflow:run:started', handler);
      es.addEventListener('workflow:run:updated', handler);
    } catch { /* SSE not available — ignore */ }
    return () => { es?.close(); };
  }, []);

  // ── Filtering + sort ───────────────────────────────────────────────────
  const filteredWorkflows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = workflows.filter(w => {
      if (statusFilter && w.status !== statusFilter) return false;
      if (!q) return true;
      return `${w.name} ${w.description} ${w.category}`.toLowerCase().includes(q);
    });
    return filtered.sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tb - ta;
    });
  }, [workflows, query, statusFilter, sortKey]);

  // Re-sync openWf when workflows refresh (so its versions/runs update after mutations)
  useEffect(() => {
    if (!openWf) return;
    const fresh = workflows.find(w => w.id === openWf.id);
    if (fresh && fresh !== openWf) setOpenWf(fresh);
  }, [workflows, openWf?.id]);

  // ── Action dispatcher (drawer) ─────────────────────────────────────────
  async function handleAction(action: 'run' | 'dryRun' | 'validate' | 'archive' | 'rollback' | 'retry' | 'resume' | 'cancel' | 'trigger') {
    if (!openWf) return;
    const wf = openWf;
    setMutationLoading(action);
    try {
      switch (action) {
        case 'run': {
          const run = await runWf.mutate(wf.id);
          if (run) {
            setRunResult(run);
            showToast(`Ejecución ${run.id ? String(run.id).slice(0, 8) : ''} → ${run.status ?? 'pending'}`, 'success');
            setRefreshTick(t => t + 1);
          } else {
            showToast('No se pudo ejecutar el flujo', 'error');
          }
          break;
        }
        case 'trigger': {
          const trigger = wf.currentVersion?.trigger ?? {};
          const eventType = trigger.type ?? trigger.event ?? 'manual.run';
          const result = await triggerEvent.mutate({
            eventType,
            payload: { workflowId: wf.id, manual: true, ...(trigger.config ?? {}) },
          });
          if (result) {
            const latestRun = result.runs?.[0] ?? null;
            if (latestRun) setRunResult(latestRun);
            showToast(`Disparados ${result.matched ?? 0} flujo(s) para ${eventType}`, 'success');
            setRefreshTick(t => t + 1);
          } else {
            showToast('No se pudo disparar el evento', 'error');
          }
          break;
        }
        case 'dryRun': {
          const body = currentVersionToBody(wf);
          const result = await dryRunWf.mutate({ id: wf.id, body });
          if (result) {
            setDryRunResult(result);
            showToast(result.summary ?? 'Simulación completada', 'success');
          } else {
            showToast('No se pudo simular el flujo', 'error');
          }
          break;
        }
        case 'validate': {
          const body = currentVersionToBody(wf);
          const result = await validateWf.mutate({ id: wf.id, body });
          if (result) {
            setValidationResult(result);
            showToast(result.ok ? 'Validación correcta' : `${result.errors?.length ?? 0} errores`, result.ok ? 'success' : 'error');
          } else {
            showToast('No se pudo validar el flujo', 'error');
          }
          break;
        }
        case 'archive': {
          const ok = await archiveWf.mutate(wf.id);
          if (ok) {
            showToast('Flujo archivado', 'success');
            setOpenWf(null);
            setRefreshTick(t => t + 1);
          } else {
            showToast('No se pudo archivar', 'error');
          }
          break;
        }
        case 'rollback': {
          const result = await rollbackWf.mutate(wf.id);
          if (result) {
            showToast('Flujo revertido a la versión anterior', 'success');
            setRefreshTick(t => t + 1);
          } else {
            showToast('No se pudo revertir', 'error');
          }
          break;
        }
        case 'retry':
        case 'resume':
        case 'cancel': {
          const runId = runResult?.id ?? wf.recentRuns?.[0]?.id;
          if (!runId) { showToast('No hay ejecuciones recientes', 'error'); break; }
          const fn = action === 'retry' ? retryRun : action === 'resume' ? resumeRun : cancelRun;
          const result = await fn.mutate(runId);
          if (result) {
            setRunResult(result);
            const verb = action === 'retry' ? 'Reintentada' : action === 'resume' ? 'Reanudada' : 'Cancelada';
            showToast(`${verb} ejecución ${String(runId).slice(0, 8)} → ${result.status ?? 'unknown'}`, 'success');
            setRefreshTick(t => t + 1);
          } else {
            showToast(`No se pudo ${action === 'retry' ? 'reintentar' : action === 'resume' ? 'reanudar' : 'cancelar'}`, 'error');
          }
          break;
        }
      }
    } finally {
      setMutationLoading(null);
    }
  }

  async function quickRun(wf: Workflow) {
    setMutationLoading('quickRun');
    try {
      const run = await runWf.mutate(wf.id);
      if (run) {
        showToast(`Ejecución ${run.id ? String(run.id).slice(0, 8) : ''} → ${run.status ?? 'pending'}`, 'success');
        setRefreshTick(t => t + 1);
      } else {
        showToast('No se pudo ejecutar', 'error');
      }
    } finally {
      setMutationLoading(null);
    }
  }

  async function quickTrigger(wf: Workflow) {
    setMutationLoading('quickTrigger');
    try {
      const trigger = wf.currentVersion?.trigger ?? {};
      const eventType = trigger.type ?? trigger.event ?? 'manual.run';
      const result = await triggerEvent.mutate({ eventType, payload: { workflowId: wf.id, manual: true } });
      if (result) {
        showToast(`Disparados ${result.matched ?? 0} flujo(s)`, 'success');
        setRefreshTick(t => t + 1);
      } else {
        showToast('No se pudo disparar', 'error');
      }
    } finally {
      setMutationLoading(null);
    }
  }

  async function createFromTemplate(t: typeof TEMPLATES[number]) {
    setMutationLoading('template');
    try {
      const created = await createWf.mutate({
        name: t.name,
        description: t.description,
        category: t.category,
        // Backend will seed nodes/edges from the template id if present;
        // otherwise create a minimal manual.run starter so the user can edit later.
        templateId: t.id,
        trigger: { type: 'manual.run' },
        nodes: [],
        edges: [],
      });
      if (created?.id) {
        showToast(`Flujo "${t.name}" creado`, 'success');
        setTemplatesOpen(false);
        setRefreshTick(tick => tick + 1);
      } else {
        showToast('No se pudo crear el flujo', 'error');
      }
    } finally {
      setMutationLoading(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  const totalCount = workflows.length;
  const execCount = Array.isArray(recentRuns) ? recentRuns.length : 0;
  const sectionCount =
    section === 'workflows'   ? filteredWorkflows.length :
    section === 'executions'  ? execCount :
    section === 'variables'   ? variables.length :
                                dataTables.length;

  return (
    <div className="flex flex-1 min-w-0 h-full overflow-hidden relative">
      <WorkflowsSidebar
        section={section}
        onSection={(s) => { setSection(s); setOpenWf(null); }}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
      />

      {/* Main pane */}
      <div className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
        {/* Top header */}
        <div className="flex items-center justify-between px-6 py-4 h-16 border-b border-[#e9eae6] flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h1 className="text-[18px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">
              {section === 'workflows'   ? 'Flujos de trabajo' :
               section === 'executions'  ? 'Ejecuciones' :
               section === 'variables'   ? 'Variables' :
                                           'Tablas de datos'}
              <span className="ml-2 text-[12px] font-semibold text-[#646462]">{sectionCount}</span>
            </h1>
            <p className="text-[12px] text-[#646462] mt-0.5">
              {section === 'workflows'   ? 'Automatiza casos, pedidos, devoluciones y aprobaciones.' :
               section === 'executions'  ? 'Inspecciona las ejecuciones recientes de tus flujos publicados.' :
               section === 'variables'   ? 'Reutiliza valores entre flujos.' :
                                           'Almacena listas que tus flujos puedan consultar.'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={
                  section === 'workflows'   ? 'Buscar flujos…' :
                  section === 'executions'  ? 'Buscar ejecuciones…' :
                  section === 'variables'   ? 'Buscar variables…' :
                                              'Buscar tablas…'
                }
                className="w-[260px] h-8 rounded-full border border-[#e9eae6] bg-[#f8f8f7] pl-9 pr-3 text-[12.5px] text-[#1a1a1a] placeholder:text-[#646462] focus:outline-none focus:bg-white focus:border-[#1a1a1a]"
              />
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462] absolute left-2.5 top-2"><circle cx="7" cy="7" r="4.5" fill="none" stroke="#646462" strokeWidth="1.6" /><path d="M11 11l3 3" stroke="#646462" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </div>
            {section === 'workflows' && (
              <>
                <button
                  onClick={() => setSortKey(k => k === 'updated' ? 'name' : 'updated')}
                  className="px-3 h-8 rounded-full text-[12.5px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] hover:bg-[#ededea]"
                  title="Cambiar orden"
                >
                  {sortKey === 'updated' ? 'Recientes' : 'Por nombre'}
                </button>
                <button
                  onClick={() => setTemplatesOpen(true)}
                  className="px-3 h-8 rounded-full text-[12.5px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] hover:bg-[#ededea]"
                >
                  Plantillas
                </button>
              </>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {workflowsError && (
            <div className="mb-4 rounded-xl border border-[#fecaca] bg-[#fee2e2] px-4 py-3 text-[13px] text-[#991b1b]">
              Error cargando flujos: {workflowsError}
            </div>
          )}
          {workflowsLoading && workflows.length === 0 && (
            <div className="text-[13px] text-[#646462] px-1 py-4">Cargando…</div>
          )}
          {section === 'workflows' && (
            filteredWorkflows.length === 0 && !workflowsLoading ? (
              <EmptyState
                title={query ? 'Sin resultados' : 'No hay flujos todavía'}
                description={query ? 'Prueba con otros términos o limpia el filtro de estado.' : 'Crea uno desde Plantillas o ábrelo desde la pantalla original.'}
              />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredWorkflows.map(wf => (
                  <WorkflowCard
                    key={wf.id}
                    wf={wf}
                    onOpen={(w) => { setOpenWf(w); setRunResult(null); setDryRunResult(null); setValidationResult(null); }}
                    onRun={quickRun}
                    onTriggerEvent={quickTrigger}
                    busy={mutationLoading === 'quickRun' || mutationLoading === 'quickTrigger'}
                  />
                ))}
              </div>
            )
          )}
          {section === 'executions'  && <ExecutionsTable runs={Array.isArray(recentRuns) ? recentRuns : []} query={query} workflows={workflows} />}
          {section === 'variables'   && <VariablesList rows={variables} query={query} />}
          {section === 'data_tables' && <DataTablesList rows={dataTables} query={query} />}
        </div>
      </div>

      {openWf && (
        <WorkflowDetailDrawer
          wf={openWf}
          onClose={() => setOpenWf(null)}
          onAction={handleAction}
          mutationLoading={mutationLoading}
          runResult={runResult}
          dryRunResult={dryRunResult}
          validationResult={validationResult}
        />
      )}

      <TemplatesModal
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onCreate={createFromTemplate}
        creating={mutationLoading === 'template'}
      />

      {toast && (
        <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-[13px] font-semibold shadow-lg z-[60] ${
          toast.type === 'success' ? 'bg-[#1a1a1a] text-white' : 'bg-[#9a3412] text-white'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── Body builder for dry-run + validate ──────────────────────────────────────
// We don't have the visual builder yet — use whatever the backend already
// persists in currentVersion. The original builds this from in-memory
// nodes/edges via syncFromFlow + currentPayload; here we read the same
// persisted shape so the calls are valid and reflect the live state.
function currentVersionToBody(wf: Workflow): Record<string, any> {
  const v = wf.currentVersion ?? {};
  return {
    nodes: Array.isArray(v.nodes) ? v.nodes : [],
    edges: Array.isArray(v.edges) ? v.edges : [],
    trigger: v.trigger ?? { type: 'manual.run' },
    name: wf.name,
    description: wf.description,
    category: wf.category,
  };
}
