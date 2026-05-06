// SuperAgentV2 — migrated by agent-superagent-01.
// ─────────────────────────────────────────────────────────────────────────────
// What works (this iteration):
//   • Bootstrap (welcome + quick actions + permission matrix) → superAgentApi.bootstrap()
//   • Send prompt as command → superAgentApi.command(input, { mode, autonomy, model, context })
//   • Plan mode toggle → superAgentApi.plan(input, { sessionId, autonomyLevel, model })
//   • Persistent session memory across turns (sessionId stored, sent in context)
//   • Saved-sessions sidebar (left): list + select-with-replay + new + delete
//     → superAgentApi.listSessions / session / deleteSession
//   • Mode (investigate / operate), Autonomy (supervised / assisted / autonomous),
//     Model (7 options) — composer popups, identical to original behaviour
//   • Action buttons in assistant messages: navigate (URL update) or execute
//     → superAgentApi.execute(payload, confirmed, { autonomy, model })
//   • Sensitive-action confirmation card (autonomy-aware) before execute
//   • Suggested replies → re-send as new prompt
//   • Tool-call steps + agents + consulted modules in collapsible <details>
//
// Pending for later iterations (still in src/components/SuperAgent.tsx until migrated):
//   • SSE live streaming (super-agent:run_started, message_chunk, step_started,
//     step_completed, agent_called, agent_result, run_finished, run_failed,
//     workspace_alert, case:created) — replaces the static "Thinking…" pill
//   • Live Runs section (recent traces + metrics) → superAgentApi.sessionTraces / metrics
//   • Guardrails section (permission matrix viewer)
//   • InlineApprovalCard rendering for actions targeting /approvals (needs
//     extracting from src/components/ai-chat/InlineApprovalCard.tsx)
//   • Reasoning trail panel (Why this path) + Artifacts cards + Timeline events
//   • Plan-suggestion auto-detect ("create a plan…" prompt → toggle planMode)
//   • Case-created live toast + workspace alerts
//   • Markdown rendering inside assistant messages (currently plain text + line breaks)
//   • Credit banner (CreditBanner) + AI credits gating (useAICredits)
//   • Draft-prompt loading from activeTarget?.draftPrompt
//   • Shift+Tab to toggle plan mode
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useMemo } from 'react';
import type { NavigationTarget, Page } from '../../types';
import { superAgentApi } from '../../api/client';
import { useApi } from '../../api/hooks';

// ── Types (mirrors the original SuperAgent.tsx shape) ────────────────────────

type SuperAgentMode = 'investigate' | 'operate';
type SuperAgentAutonomy = 'supervised' | 'assisted' | 'autonomous';

type AgentCard = {
  slug: string;
  name: string;
  status: 'available' | 'consulted' | 'proposed' | 'executed' | 'blocked';
  summary: string;
};

type StreamStep = {
  id: string;
  label: string;
  status: 'running' | 'completed' | 'failed';
  detail?: string | null;
};

type SuperAgentAction = {
  id: string;
  type: 'navigate' | 'execute';
  label: string;
  description: string;
  targetPage?: string;
  focusId?: string | null;
  navigationTarget?: NavigationTarget | null;
  permission?: string;
  allowed?: boolean;
  sensitive?: boolean;
  requiresConfirmation?: boolean;
  blockedReason?: string | null;
  payload?: Record<string, any>;
};

type AssistantPayload = {
  id: string;
  input: string;
  summary: string;
  narrative?: string;
  statusLine: string;
  sections: { title: string; items: string[] }[];
  actions: SuperAgentAction[];
  agents: AgentCard[];
  suggestedReplies: string[];
  consultedModules: string[];
  steps?: StreamStep[];
  runId?: string | null;
};

type ConversationMessage =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; payload: AssistantPayload; muted?: boolean };

type ModelOption = { id: string; label: string; description: string };

type PendingAction = SuperAgentAction & { confirmationReason?: string };

type SessionSummary = {
  id: string;
  title: string;
  preview: string;
  turnCount: number;
  updatedAt: string;
  createdAt: string;
};

// ── Constants ────────────────────────────────────────────────────────────────

const AUTONOMY_OPTIONS: { value: SuperAgentAutonomy; label: string; description: string }[] = [
  { value: 'supervised', label: 'Supervisado', description: 'Cada ejecución pide confirmación.' },
  { value: 'assisted', label: 'Asistido', description: 'Sólo las acciones sensibles piden confirmación.' },
  { value: 'autonomous', label: 'Autónomo', description: 'Las acciones seguras se ejecutan automáticamente.' },
];

const MODEL_OPTIONS: ModelOption[] = [
  { id: 'gpt-5.4-mini', label: '5.4-Mini', description: 'Rápido y ligero' },
  { id: 'gpt-5.4', label: '5.4', description: 'Equilibrado' },
  { id: 'gpt-5.5', label: '5.5', description: 'Máxima capacidad' },
  { id: 'gemini-2.5-pro', label: 'Gemini Pro', description: 'Familia Gemini' },
  { id: 'gemini-2.5-flash', label: 'Gemini Flash', description: 'Gemini rápido' },
  { id: 'claude-4-sonnet', label: 'Claude Sonnet', description: 'Familia Claude' },
  { id: 'claude-4-opus', label: 'Claude Opus', description: 'Mayor capacidad de Claude' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizePayload(raw: Partial<AssistantPayload> & Record<string, any>, fallbackInput = '', fallbackRunId: string | null = null): AssistantPayload {
  const actions: SuperAgentAction[] = Array.isArray(raw.actions)
    ? raw.actions.map((a: any, i: number) => ({
        id: String(a.id || `action-${i}`),
        type: (a.type === 'execute' ? 'execute' : 'navigate') as SuperAgentAction['type'],
        label: String(a.label || 'Abrir'),
        description: String(a.description || ''),
        targetPage: a.targetPage || undefined,
        focusId: a.focusId ?? null,
        navigationTarget: a.navigationTarget || null,
        permission: a.permission,
        allowed: a.allowed !== false,
        sensitive: a.sensitive === true,
        requiresConfirmation: a.requiresConfirmation === true,
        blockedReason: a.blockedReason ?? null,
        payload: a.payload || undefined,
      }))
    : [];
  const agents: AgentCard[] = Array.isArray(raw.agents)
    ? raw.agents.map((a: any) => ({
        slug: String(a.slug || 'agent'),
        name: String(a.name || 'Agent'),
        status: (a.status || 'consulted') as AgentCard['status'],
        summary: String(a.summary || 'Completed.'),
      }))
    : [];
  const steps: StreamStep[] = Array.isArray(raw.steps)
    ? raw.steps.map((s: any, i: number) => ({
        id: String(s.id || `step-${i}`),
        label: String(s.label || 'Step'),
        status: s.status === 'failed' ? 'failed' : s.status === 'running' ? 'running' : 'completed',
        detail: s.detail ? String(s.detail) : null,
      }))
    : [];
  return {
    id: String(raw.id || `assistant-${Date.now()}`),
    input: String(raw.input || fallbackInput),
    summary: String(raw.summary || raw.error || 'Listo.'),
    narrative: raw.narrative ? String(raw.narrative) : undefined,
    statusLine: String(raw.statusLine || ''),
    sections: Array.isArray(raw.sections)
      ? raw.sections.map((s: any, i: number) => ({
          title: String(s.title || `Sección ${i + 1}`),
          items: Array.isArray(s.items) ? s.items.map((x: any) => String(x)) : [],
        }))
      : [],
    actions,
    agents,
    suggestedReplies: Array.isArray(raw.suggestedReplies) ? raw.suggestedReplies.map((x: any) => String(x)) : [],
    consultedModules: Array.isArray(raw.consultedModules) ? [...new Set(raw.consultedModules.map((x: any) => String(x)).filter(Boolean))] : [],
    steps,
    runId: raw.runId ?? fallbackRunId ?? null,
  };
}

function planResponseToPayload(planResp: any, trace: any): AssistantPayload {
  const enriched = planResp?.enrichedResponse || trace?.commandResponse || planResp?.response?.enrichedResponse;
  if (enriched) {
    return normalizePayload(enriched, enriched.input || '', enriched.runId || trace?.runId || planResp?.sessionId || null);
  }
  const summary = trace?.summary || planResp?.response?.plan?.rationale || planResp?.response?.summary || 'Plan generado.';
  const steps: StreamStep[] = (trace?.spans ?? []).map((span: any) => ({
    id: span.stepId,
    label: span.tool,
    status: span.result?.ok ? 'completed' : 'failed',
    detail: span.result?.ok ? JSON.stringify(span.result?.value ?? '').slice(0, 120) : span.result?.error,
  }));
  const actions: SuperAgentAction[] = (trace?.approvalIds ?? []).map((apId: string) => ({
    id: `nav-approval-${apId}`,
    type: 'navigate' as const,
    label: 'Revisar aprobación',
    description: 'Esta acción requiere aprobación humana.',
    targetPage: 'approvals',
    focusId: apId,
    allowed: true,
  }));
  const statusLine =
    trace?.status === 'pending_approval' ? 'Esperando aprobación'
    : trace?.status === 'rejected_by_policy' ? 'Bloqueado por política'
    : trace?.status === 'failed' ? 'Ejecución fallida'
    : '';
  return normalizePayload(
    { id: `assistant-plan-${Date.now()}`, summary, statusLine, sections: [], actions, agents: [], suggestedReplies: [], consultedModules: [], steps },
    '',
    trace?.runId || planResp?.sessionId || null,
  );
}

function humanizeError(message: string): string {
  const text = String(message || '').trim();
  const lower = text.toLowerCase();
  if (!text) return 'Super Agent no pudo completar la solicitud.';
  if (lower.includes('llm_provider_not_configured')) return 'Super Agent necesita un proveedor LLM configurado antes de responder.';
  if (lower.includes('rate limit') || lower.includes('quota exceeded')) return 'El proveedor LLM está sin cuota o con rate limit. Vuelve a intentarlo más tarde.';
  if (lower === 'internal server error') return 'Super Agent encontró un error interno procesando la solicitud.';
  return text;
}

function fallbackNavigationTarget(page?: string, entityId?: string | null): NavigationTarget | null {
  if (!page) return null;
  return { page: page as Page, entityType: null, entityId: entityId ?? null, section: null, sourceContext: 'super_agent', runId: null };
}

function formatRelativeDate(v?: string | null): string {
  if (!v) return '';
  const m = Math.max(1, Math.round((Date.now() - new Date(v).getTime()) / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

function SuperAgentSidebar({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
  onDelete,
  loadingList,
  loadingSession,
}: {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  loadingList: boolean;
  loadingSession: boolean;
}) {
  const itemCls = (active: boolean) =>
    `relative flex flex-col gap-0.5 h-auto pl-3 pr-2 py-2 rounded-lg cursor-pointer text-[13px] w-full text-left transition-colors ${
      active
        ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] text-[#1a1a1a]'
        : 'hover:bg-[#e9eae6]/40 text-[#1a1a1a]'
    }`;

  return (
    <div className="flex flex-col h-full w-[236px] bg-[#f8f8f7] border-r border-[#e9eae6] flex-shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 h-16 flex-shrink-0">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Super Agent</span>
      </div>

      <div className="px-3 pb-2 flex-shrink-0">
        <button
          onClick={onNew}
          className="w-full h-9 rounded-full bg-[#1a1a1a] hover:bg-black text-white text-[13px] font-semibold flex items-center justify-center gap-1.5"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-white"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
          Nueva conversación
        </button>
      </div>

      <div className="px-3 pt-2 flex-shrink-0">
        <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider px-1 pb-1.5">Conversaciones</p>
      </div>

      <div className="flex-1 overflow-y-auto pl-3 pr-2 pb-4 flex flex-col gap-0.5">
        {loadingList && sessions.length === 0 && (
          <div className="text-[12.5px] text-[#646462] px-3 py-4 text-center">Cargando…</div>
        )}
        {!loadingList && sessions.length === 0 && (
          <div className="text-[12.5px] text-[#646462] px-3 py-4 text-center italic">No tienes conversaciones guardadas todavía.</div>
        )}
        {sessions.map((s) => {
          const isActive = s.id === activeSessionId;
          return (
            <div key={s.id} className={`group relative ${loadingSession && isActive ? 'opacity-60' : ''}`}>
              <button onClick={() => onSelect(s.id)} disabled={loadingSession} className={itemCls(isActive)}>
                <div className="flex items-center justify-between w-full">
                  <span className={`text-[13px] truncate flex-1 ${isActive ? 'font-semibold' : ''}`}>{s.title || 'Sin título'}</span>
                  <span className="text-[11px] text-[#646462] flex-shrink-0 ml-1">{formatRelativeDate(s.updatedAt)}</span>
                </div>
                {s.preview && <span className="text-[11.5px] text-[#646462] truncate w-full">{s.preview}</span>}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); if (confirm('¿Eliminar esta conversación?')) onDelete(s.id); }}
                className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 w-6 h-6 rounded-full bg-white border border-[#e9eae6] hover:bg-[#ededea] flex items-center justify-center transition-opacity"
                title="Eliminar"
              >
                <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#1a1a1a]"><path d="M5 2h6v1h3v1H2V3h3V2zm-1 3h8l-.5 9h-7L4 5z"/></svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Composer popups (mode / autonomy / model) ────────────────────────────────

function ChevDown() {
  return <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462] flex-shrink-0"><path d="M4 6l4 4 4-4z"/></svg>;
}

function ComposerControls({
  mode, setMode, planMode, setPlanMode,
  autonomyLevel, setAutonomyLevel,
  selectedModelId, setSelectedModelId,
  openMenu, setOpenMenu,
}: {
  mode: SuperAgentMode;
  setMode: (m: SuperAgentMode) => void;
  planMode: boolean;
  setPlanMode: (b: boolean) => void;
  autonomyLevel: SuperAgentAutonomy;
  setAutonomyLevel: (a: SuperAgentAutonomy) => void;
  selectedModelId: string;
  setSelectedModelId: (id: string) => void;
  openMenu: 'mode' | 'autonomy' | 'model' | null;
  setOpenMenu: (m: 'mode' | 'autonomy' | 'model' | null) => void;
}) {
  const autonomyMeta = AUTONOMY_OPTIONS.find((o) => o.value === autonomyLevel) ?? AUTONOMY_OPTIONS[1];
  const modelMeta = MODEL_OPTIONS.find((o) => o.id === selectedModelId) ?? MODEL_OPTIONS[0];
  const modeLabel = mode === 'investigate' ? 'Investigar' : 'Operar';

  return (
    <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
      <div className="flex flex-wrap items-center gap-1">
        {/* Mode + Plan dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === 'mode' ? null : 'mode')}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f8f8f7]"
          >
            <span>{modeLabel}</span>
            <ChevDown />
          </button>
          {openMenu === 'mode' && (
            <div className="absolute left-0 bottom-full z-30 mb-2 w-64 rounded-2xl border border-[#e9eae6] bg-white shadow-xl overflow-hidden">
              <div className="border-b border-[#e9eae6] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#646462]">Modo</div>
              <div className="p-1">
                {[
                  { value: 'investigate' as const, label: 'Investigar', description: 'Pregunta, inspecciona contexto y explora con seguridad.' },
                  { value: 'operate' as const, label: 'Operar', description: 'Toma acciones con el contexto actual del workflow.' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setMode(opt.value); setOpenMenu(null); }}
                    className={`flex w-full items-start justify-between rounded-xl px-3 py-2 text-left ${
                      mode === opt.value ? 'bg-[#f8f8f7] text-[#1a1a1a]' : 'text-[#1a1a1a] hover:bg-[#f8f8f7]'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold">{opt.label}</div>
                      <div className="mt-0.5 text-[11px] text-[#646462]">{opt.description}</div>
                    </div>
                    {mode === opt.value && <span className="text-[#1a1a1a]">✓</span>}
                  </button>
                ))}
                <div className="my-1 border-t border-[#e9eae6]" />
                <button
                  onClick={() => { setPlanMode(!planMode); setOpenMenu(null); }}
                  className={`flex w-full items-start justify-between rounded-xl px-3 py-2 text-left ${
                    planMode ? 'bg-blue-50 text-blue-800' : 'text-[#1a1a1a] hover:bg-[#f8f8f7]'
                  }`}
                >
                  <div>
                    <div className="text-xs font-semibold">Plan</div>
                    <div className="mt-0.5 text-[11px] text-[#646462]">Esboza ramas, compara opciones y prepara una ruta de ejecución.</div>
                  </div>
                  {planMode && <span>✓</span>}
                </button>
              </div>
            </div>
          )}
        </div>

        {planMode && (
          <button
            onClick={() => setPlanMode(false)}
            className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-700 hover:bg-blue-100"
          >
            Plan ✕
          </button>
        )}

        {/* Autonomy */}
        <div className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === 'autonomy' ? null : 'autonomy')}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium text-[#1a1a1a] hover:bg-[#f8f8f7]"
          >
            <span>{autonomyMeta.label}</span>
            <ChevDown />
          </button>
          {openMenu === 'autonomy' && (
            <div className="absolute left-0 bottom-full z-30 mb-2 w-72 rounded-2xl border border-[#e9eae6] bg-white shadow-xl overflow-hidden">
              <div className="border-b border-[#e9eae6] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#646462]">Autonomía</div>
              <div className="p-1">
                {AUTONOMY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setAutonomyLevel(opt.value); setOpenMenu(null); }}
                    className={`flex w-full items-start justify-between rounded-xl px-3 py-2 text-left ${
                      autonomyLevel === opt.value ? 'bg-[#fff7ed] text-[#9a3412]' : 'text-[#1a1a1a] hover:bg-[#f8f8f7]'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold">{opt.label}</div>
                      <div className="mt-0.5 text-[11px] text-[#646462]">{opt.description}</div>
                    </div>
                    {autonomyLevel === opt.value && <span>✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Model */}
      <div className="ml-auto relative">
        <button
          onClick={() => setOpenMenu(openMenu === 'model' ? null : 'model')}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium text-[#1a1a1a] hover:bg-[#f8f8f7]"
        >
          <span>{modelMeta.label}</span>
          <ChevDown />
        </button>
        {openMenu === 'model' && (
          <div className="absolute right-0 bottom-full z-30 mb-2 w-72 rounded-2xl border border-[#e9eae6] bg-white shadow-xl overflow-hidden">
            <div className="border-b border-[#e9eae6] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-[#646462]">Modelo</div>
            <div className="p-1">
              {MODEL_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => { setSelectedModelId(opt.id); setOpenMenu(null); }}
                  className={`flex w-full items-start justify-between rounded-xl px-3 py-2 text-left ${
                    selectedModelId === opt.id ? 'bg-[#f8f8f7] text-[#1a1a1a]' : 'text-[#1a1a1a] hover:bg-[#f8f8f7]'
                  }`}
                >
                  <div>
                    <div className="text-xs font-semibold">{opt.label}</div>
                    <div className="mt-0.5 text-[11px] text-[#646462]">{opt.description}</div>
                  </div>
                  {selectedModelId === opt.id && <span>✓</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Assistant message ─────────────────────────────────────────────────────────

function AssistantMessageBlock({
  payload,
  onAction,
  onReply,
  isStreaming,
}: {
  payload: AssistantPayload;
  onAction: (action: SuperAgentAction) => void;
  onReply: (reply: string) => void;
  isStreaming: boolean;
}) {
  const isThinking = payload.summary === 'Thinking through your request...' || payload.summary === 'Pensando…' || payload.statusLine === 'Pensando';
  const narrative = payload.narrative || payload.summary || '';
  const narrativeLines = narrative.split('\n').map((l) => l.trim()).filter(Boolean);
  const stepsCount = payload.steps?.length || 0;
  const showDetails = stepsCount > 0 || payload.consultedModules.length > 0 || payload.agents.length > 0 || payload.runId;

  return (
    <div className="flex flex-col gap-2">
      {isThinking ? (
        <div className="flex items-center gap-2 text-[13px] text-[#646462]">
          <span className="inline-flex gap-1">
            <span className="w-1.5 h-1.5 bg-[#646462] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-[#646462] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-[#646462] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
          <span>{payload.statusLine || 'Pensando'}</span>
        </div>
      ) : (
        <div className="text-[14.5px] leading-[22px] text-[#1a1a1a] whitespace-pre-wrap">
          {narrativeLines.length > 0 ? narrativeLines.join('\n') : narrative}
          {isStreaming && <span className="inline-block w-1.5 h-4 bg-[#1a1a1a] ml-1 animate-pulse align-middle" />}
        </div>
      )}

      {payload.sections.filter((s) => s.items.length > 0).map((section) => (
        <div key={section.title} className="rounded-xl border border-[#e9eae6] bg-[#f8f8f7] px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#646462] mb-2">{section.title}</p>
          <ul className="flex flex-col gap-1 text-[13px] text-[#1a1a1a]">
            {section.items.slice(0, 6).map((item, i) => (
              <li key={i} className="leading-[18px]">• {item}</li>
            ))}
          </ul>
        </div>
      ))}

      {showDetails && (
        <details className="group text-[12.5px] text-[#646462]">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 select-none hover:text-[#1a1a1a]">
            <svg viewBox="0 0 12 12" className="h-3 w-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 2 L8 6 L4 10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>
              {stepsCount > 0 ? `${stepsCount} paso${stepsCount === 1 ? '' : 's'}` : 'Investigación'}
              {payload.runId ? ` · Run ${String(payload.runId).slice(0, 8)}` : ''}
            </span>
          </summary>
          <div className="mt-2 space-y-2 border-l border-[#e9eae6] pl-3">
            {payload.steps?.map((step) => (
              <div key={step.id} className="flex items-start gap-2 text-[12.5px]">
                <span className={`mt-0.5 inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  step.status === 'completed' ? 'bg-emerald-500' : step.status === 'failed' ? 'bg-red-500' : 'bg-amber-500 animate-pulse'
                }`} />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-[#1a1a1a]">{step.label}</span>
                  {step.detail && <span className="ml-2 text-[#646462]">{step.detail}</span>}
                </div>
              </div>
            ))}
            {payload.consultedModules.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] uppercase tracking-[0.18em] text-[#646462]">Read</span>
                {payload.consultedModules.map((m) => (
                  <span key={m} className="rounded-full bg-[#f8f8f7] px-2 py-0.5 text-[11px] font-medium text-[#1a1a1a]">{m}</span>
                ))}
              </div>
            )}
            {payload.agents.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {payload.agents.map((agent) => (
                  <span
                    key={agent.slug}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${
                      agent.status === 'blocked' ? 'border-red-200 bg-red-50 text-red-700'
                      : agent.status === 'executed' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-[#e9eae6] bg-[#f8f8f7] text-[#1a1a1a]'
                    }`}
                  >
                    <span className="font-medium">{agent.name}</span>
                    <span className="opacity-70">{agent.summary}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </details>
      )}

      {payload.actions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {payload.actions.slice(0, 4).map((action) => (
            <button
              key={action.id}
              onClick={() => onAction(action)}
              disabled={action.allowed === false}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                action.type === 'execute'
                  ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                  : 'border-[#e9eae6] bg-white text-[#1a1a1a] hover:bg-[#f8f8f7]'
              }`}
              title={action.description}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {payload.suggestedReplies.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {payload.suggestedReplies.slice(0, 3).map((reply) => (
            <button
              key={reply}
              onClick={() => onReply(reply)}
              className="rounded-full border border-dashed border-[#e9eae6] px-3 py-1 text-[12px] text-[#646462] hover:border-[#646462] hover:text-[#1a1a1a]"
            >
              {reply}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function SuperAgentV2() {
  // Bootstrap
  const { data: bootstrap, loading: isBootstrapping } = useApi<any>(() => superAgentApi.bootstrap(), []);

  // Sessions sidebar
  const [sessionsRefreshKey, setSessionsRefreshKey] = useState(0);
  const { data: sessionsData, loading: loadingList, refetch: refetchSessions } = useApi<{ sessions: SessionSummary[]; count: number }>(
    () => superAgentApi.listSessions(50),
    [sessionsRefreshKey],
    { sessions: [], count: 0 },
  );
  const sessions = useMemo(() => sessionsData?.sessions || [], [sessionsData]);

  // Chat state
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [composerText, setComposerText] = useState('');
  const [planSessionId, setPlanSessionId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  // Composer controls
  const [mode, setMode] = useState<SuperAgentMode>('operate');
  const [planMode, setPlanMode] = useState(false);
  const [autonomyLevel, setAutonomyLevel] = useState<SuperAgentAutonomy>('assisted');
  const [selectedModelId, setSelectedModelId] = useState<string>(MODEL_OPTIONS[0].id);
  const [openMenu, setOpenMenu] = useState<'mode' | 'autonomy' | 'model' | null>(null);

  // Refs
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const controlBarRef = useRef<HTMLDivElement>(null);
  const liveMessageIdRef = useRef<string | null>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, pendingAction, isSending]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 74), 220)}px`;
  }, [composerText]);

  // Close composer popups on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (controlBarRef.current && !controlBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Quick actions for the empty state
  const quickActions = useMemo<string[]>(() => bootstrap?.quickActions || [], [bootstrap]);
  const welcomeTitle = bootstrap?.welcomeTitle || '¿En qué puedo ayudarte?';
  const welcomeSubtitle = bootstrap?.welcomeSubtitle || 'Investiga, contrasta y actúa en tu workspace.';

  function handleNewConversation() {
    setMessages([]);
    setPlanSessionId(null);
    setComposerText('');
    setPendingAction(null);
    setFlashMessage(null);
  }

  async function handleSelectSession(sessionId: string) {
    if (sessionId === planSessionId || isLoadingSession) return;
    setIsLoadingSession(true);
    setFlashMessage(null);
    try {
      const data = await superAgentApi.session(sessionId);
      const session = data?.session;
      if (!session) throw new Error('Conversación no encontrada');
      const turns = Array.isArray(session.turns) ? session.turns : [];
      const replay: ConversationMessage[] = [];
      let counter = 0;
      for (const turn of turns) {
        const id = `replay-${sessionId}-${counter++}`;
        const content = String(turn?.content ?? '').trim();
        if (!content) continue;
        if (turn.role === 'user') {
          replay.push({ id, role: 'user', text: content });
        } else if (turn.role === 'assistant') {
          replay.push({
            id,
            role: 'assistant',
            payload: normalizePayload({ id, summary: content, narrative: content, runId: turn.planId ?? null }),
          });
        }
      }
      setMessages(replay);
      setPlanSessionId(sessionId);
      setComposerText('');
      setPendingAction(null);
    } catch (err) {
      setFlashMessage(err instanceof Error ? err.message : 'No se pudo cargar la conversación');
    } finally {
      setIsLoadingSession(false);
    }
  }

  async function handleDeleteSession(sessionId: string) {
    try {
      await superAgentApi.deleteSession(sessionId);
      if (sessionId === planSessionId) handleNewConversation();
      setSessionsRefreshKey((k) => k + 1);
    } catch (err) {
      setFlashMessage(err instanceof Error ? err.message : 'No se pudo eliminar la conversación');
    }
  }

  async function sendPrompt(promptOverride?: string) {
    const prompt = (promptOverride ?? composerText).trim();
    if (!prompt || isSending || isExecuting) return;
    const finalPrompt = mode === 'operate' && !promptOverride ? `Operate: ${prompt}` : prompt;
    setComposerText('');
    setPendingAction(null);
    setFlashMessage(null);
    setOpenMenu(null);
    setIsSending(true);

    const runId = (typeof window !== 'undefined' && window.crypto?.randomUUID?.()) || `run-${Date.now()}`;
    const isPlanMode = planMode;
    const livePayload = normalizePayload({
      id: `assistant-live-${runId}`,
      input: finalPrompt,
      summary: isPlanMode ? 'Pensando…' : 'Pensando…',
      statusLine: 'Pensando',
      runId,
    });
    liveMessageIdRef.current = livePayload.id;

    setMessages((c) => [
      ...c,
      { id: `user-${Date.now()}`, role: 'user', text: finalPrompt },
      { id: livePayload.id, role: 'assistant', payload: livePayload },
    ]);

    try {
      const result = isPlanMode
        ? await superAgentApi.plan(finalPrompt, {
            sessionId: planSessionId ?? undefined,
            dryRun: false,
            autonomyLevel,
            model: selectedModelId,
            mode: 'plan',
          })
        : await superAgentApi.command(finalPrompt, {
            runId,
            mode,
            autonomyLevel,
            model: selectedModelId,
            context: planSessionId ? { sessionId: planSessionId } : {},
          });

      if (result?.sessionId) setPlanSessionId(result.sessionId);
      setSessionsRefreshKey((k) => k + 1);

      const payload = isPlanMode
        ? planResponseToPayload(result, result?.trace || null)
        : normalizePayload(result?.response || {}, finalPrompt, result?.response?.runId || runId);

      const liveId = liveMessageIdRef.current;
      setMessages((c) => c.map((m) => (m.role === 'assistant' && m.payload.id === liveId ? { id: payload.id, role: 'assistant', payload } : m)));
    } catch (err) {
      const fallback = normalizePayload({
        id: `assistant-error-${Date.now()}`,
        summary: humanizeError(err instanceof Error ? err.message : 'No se pudo procesar el comando.'),
        statusLine: 'No disponible',
        suggestedReplies: ['Reintentar', 'Abrir aprobaciones pendientes'],
      });
      const liveId = liveMessageIdRef.current;
      setMessages((c) => c.map((m) => (m.role === 'assistant' && m.payload.id === liveId ? { id: fallback.id, role: 'assistant', payload: fallback } : m)));
    } finally {
      setIsSending(false);
      liveMessageIdRef.current = null;
    }
  }

  function shouldRequireConfirmation(action: SuperAgentAction): boolean {
    if (action.type !== 'execute') return false;
    if (autonomyLevel === 'supervised') return true;
    if (autonomyLevel === 'assisted') return action.requiresConfirmation === true || action.sensitive === true;
    return action.requiresConfirmation === true;
  }

  function confirmationReasonForAction(action: SuperAgentAction): string {
    if (autonomyLevel === 'supervised') return 'El modo supervisado requiere confirmación antes de cualquier ejecución.';
    if (action.requiresConfirmation) return 'El backend marcó esta acción como que requiere aprobación.';
    if (action.sensitive) return 'Acción sensible seleccionada para revisión.';
    return 'Esta acción está en cola para confirmación.';
  }

  async function runAction(action: PendingAction, sourceContext: string, confirmed: boolean) {
    const runId = (typeof window !== 'undefined' && window.crypto?.randomUUID?.()) || `run-${Date.now()}`;
    setIsExecuting(true);
    setOpenMenu(null);
    try {
      const result = await superAgentApi.execute(action.payload || {}, confirmed, {
        runId,
        sourceContext,
        autonomyLevel,
        model: selectedModelId,
      });
      if (result?.ok) {
        const update = normalizePayload({
          id: `assistant-exec-${Date.now()}`,
          summary: `${action.label} completado.`,
          sections: [{ title: 'Resultado', items: [action.description, 'Cambio registrado en el audit trail.'] }],
        });
        setMessages((c) => [...c, { id: update.id, role: 'assistant', payload: update }]);
      } else if (result?.approvalRequired) {
        const approvalId = result.approval?.id || 'pending';
        const msg = normalizePayload({
          id: `assistant-approval-${Date.now()}`,
          summary: 'Acción derivada a aprobación.',
          sections: [{ title: 'Guardrail aplicado', items: ['La acción cruzó un umbral sensible.', `Aprobación creada: ${approvalId}.`] }],
          actions: [{
            id: `nav-approval-${approvalId}`,
            type: 'navigate',
            label: 'Abrir aprobaciones',
            description: 'Revisar la solicitud de aprobación.',
            targetPage: 'approvals',
            focusId: approvalId,
            allowed: true,
          }],
        });
        setMessages((c) => [...c, { id: msg.id, role: 'assistant', payload: msg }]);
        setFlashMessage('Aprobación creada.');
      } else {
        const failure = normalizePayload({
          id: `assistant-blocked-${Date.now()}`,
          summary: 'Acción bloqueada.',
          sections: [{ title: 'Bloqueado', items: [result?.error || action.blockedReason || 'La acción no se pudo ejecutar.'] }],
        });
        setMessages((c) => [...c, { id: failure.id, role: 'assistant', payload: failure }]);
      }
    } catch (err) {
      const failure = normalizePayload({
        id: `assistant-error-${Date.now()}`,
        summary: 'La acción falló.',
        sections: [{ title: 'Error', items: [err instanceof Error ? err.message : 'Fallo inesperado.'] }],
      });
      setMessages((c) => [...c, { id: failure.id, role: 'assistant', payload: failure }]);
    } finally {
      setPendingAction(null);
      setIsExecuting(false);
    }
  }

  function handleAction(action: SuperAgentAction) {
    if (action.type === 'navigate') {
      const target = action.navigationTarget || fallbackNavigationTarget(action.targetPage, action.focusId ?? null);
      if (target?.page && typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('v2', '1');
        url.searchParams.set('page', target.page);
        if (target.entityId) url.searchParams.set('focus', target.entityId);
        window.location.href = url.toString();
      }
      return;
    }
    if (!action.allowed) {
      setFlashMessage(action.blockedReason || 'Permiso denegado.');
      return;
    }
    setOpenMenu(null);
    if (!shouldRequireConfirmation(action)) {
      void runAction({ ...action, confirmationReason: confirmationReasonForAction(action) }, 'super_agent_autonomy', false);
      return;
    }
    setPendingAction({ ...action, confirmationReason: confirmationReasonForAction(action) });
    setFlashMessage(null);
  }

  function handleComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendPrompt();
    }
  }

  return (
    <div className="flex flex-1 min-w-0 h-full overflow-hidden relative">
      <SuperAgentSidebar
        sessions={sessions}
        activeSessionId={planSessionId}
        onSelect={handleSelectSession}
        onNew={handleNewConversation}
        onDelete={handleDeleteSession}
        loadingList={loadingList}
        loadingSession={isLoadingSession}
      />

      <div className="flex-1 flex flex-col min-w-0 bg-white relative">
        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto px-6 pb-56 pt-10">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
            {isBootstrapping && (
              <div className="flex min-h-[42vh] items-center justify-center">
                <p className="text-[13px] text-[#646462]">Preparando tu workspace…</p>
              </div>
            )}

            {/* Empty state hero */}
            {!isBootstrapping && messages.length === 0 && (
              <div className="flex min-h-[58vh] flex-col items-center justify-center gap-6 text-center">
                <div>
                  <h1 className="text-[40px] font-semibold tracking-[-1px] leading-[44px] text-[#1a1a1a]">
                    {welcomeTitle}
                  </h1>
                  <p className="mt-3 text-[14px] text-[#646462] max-w-[420px] mx-auto">{welcomeSubtitle}</p>
                </div>
                {quickActions.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-2 max-w-[520px]">
                    {quickActions.slice(0, 6).map((hint) => (
                      <button
                        key={hint}
                        onClick={() => void sendPrompt(hint)}
                        className="rounded-full border border-[#e9eae6] bg-white px-3 py-1.5 text-[13px] text-[#646462] shadow-sm hover:border-[#646462] hover:bg-[#f8f8f7] hover:text-[#1a1a1a]"
                      >
                        {hint}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Messages */}
            {messages.map((msg) => {
              if (msg.role === 'user') {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-[#1a1a1a] text-white px-4 py-2.5 text-[14px] leading-[20px] whitespace-pre-wrap">
                      {msg.text}
                    </div>
                  </div>
                );
              }
              const isStreaming = isSending && liveMessageIdRef.current === msg.payload.id;
              return (
                <div key={msg.id} className={msg.muted ? 'opacity-60' : ''}>
                  <AssistantMessageBlock
                    payload={msg.payload}
                    onAction={handleAction}
                    onReply={(reply) => void sendPrompt(reply)}
                    isStreaming={isStreaming}
                  />
                </div>
              );
            })}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Composer pinned bottom */}
        <div className="absolute inset-x-0 bottom-0 px-6 pb-5 pt-16 bg-gradient-to-t from-white via-white/95 to-transparent">
          <div className="mx-auto w-full max-w-3xl">
            {flashMessage && (
              <p className="mb-2 text-[12px] text-amber-600">{flashMessage}</p>
            )}

            {pendingAction && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-semibold text-[#1a1a1a]">Confirmar operación</p>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                      {(AUTONOMY_OPTIONS.find((o) => o.value === autonomyLevel) ?? AUTONOMY_OPTIONS[1]).label}
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#646462]">
                      {(MODEL_OPTIONS.find((o) => o.id === selectedModelId) ?? MODEL_OPTIONS[0]).label}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-[#646462]">{pendingAction.confirmationReason || pendingAction.description}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPendingAction(null)}
                    className="rounded-lg border border-[#e9eae6] px-3 py-1.5 text-[12px] font-medium text-[#1a1a1a] hover:bg-[#f8f8f7]"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => void runAction(pendingAction, 'super_agent_confirmation', true)}
                    disabled={isExecuting}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {isExecuting ? 'Ejecutando…' : `Ejecutar — ${pendingAction.label}`}
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-3xl border border-[#e9eae6] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.06)] focus-within:shadow-[0_12px_34px_rgba(15,23,42,0.08)]">
              <textarea
                ref={textareaRef}
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={
                  planMode ? 'Planifica los siguientes pasos, revisa ramas o esboza una ruta de ejecución…'
                  : mode === 'operate' ? 'Pide actualizar, reembolsar, cancelar o publicar…'
                  : 'Pregunta sobre un pedido, pago, cliente, caso o aprobación…'
                }
                rows={3}
                className="max-h-[220px] min-h-[74px] w-full resize-none overflow-y-auto bg-transparent px-5 pt-4 pb-1 text-[14.5px] leading-6 text-[#1a1a1a] outline-none placeholder:text-[#646462]"
              />
              <div ref={controlBarRef} className="flex items-center gap-2">
                <div className="flex-1">
                  <ComposerControls
                    mode={mode}
                    setMode={setMode}
                    planMode={planMode}
                    setPlanMode={setPlanMode}
                    autonomyLevel={autonomyLevel}
                    setAutonomyLevel={setAutonomyLevel}
                    selectedModelId={selectedModelId}
                    setSelectedModelId={setSelectedModelId}
                    openMenu={openMenu}
                    setOpenMenu={setOpenMenu}
                  />
                </div>
                <button
                  onClick={() => void sendPrompt()}
                  disabled={!composerText.trim() || isSending || isExecuting}
                  className="mr-3 mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#1a1a1a] text-white hover:bg-black disabled:opacity-30 flex-shrink-0"
                  title="Enviar"
                >
                  <svg viewBox="0 0 16 16" className="w-4 h-4 fill-white"><path d="M8 2l5 5h-3v6H6V7H3z"/></svg>
                </button>
              </div>
            </div>

            <p className="mt-2 text-center text-[11px] text-[#646462]">
              Enter para enviar · Shift+Enter para nueva línea
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
