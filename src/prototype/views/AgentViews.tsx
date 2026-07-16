// ─────────────────────────────────────────────────────────────────────────────
// Agent chat views
// Extracted from the monolithic Prototype.tsx (auto-split, behavior-preserving).
// ─────────────────────────────────────────────────────────────────────────────

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { agentApi } from '../../api/client';
import { SettingsSidebar, messages, relativeTime } from '../sharedUi';
import type { Conversation, View } from '../types';

const conversations: Conversation[] = [
  { id: "1", channel: "Messenger · [Demo]", preview: "Install Messenger", time: "4 min", avatarColor: "#9ec5fa", avatarLetter: "M", active: true },
  { id: "2", channel: "Email · [Demo]", preview: "This is a demo email. It", time: "4 min", avatarColor: "#85e0d9", avatarLetter: "E" },
  { id: "3", channel: "WhatsApp · [Demo]", preview: "Set up WhatsApp or so", time: "4 min", avatarColor: "#61d65c", avatarLetter: "W" },
  { id: "4", channel: "Phone · [Demo]", preview: "Set up phone or SMS", time: "4 min", avatarColor: "#85e0d9", avatarLetter: "P" },
];

// ── AgentChatView ─────────────────────────────────────────────────────────────
//
// Max-style AI chat interface for the CRM. Features:
//   - Left sidebar with conversation history (title + msg count + relative time)
//   - Right panel with active chat (streaming SSE)
//   - Rich tool call cards (expandable, mini-tables, SQL results)
//   - Mode system (6 modes with colored pills)
//   - Approval cards for dangerous operations
//   - Memory toast notifications
//   - Slash command autocomplete
//   - Markdown-like formatting in message bubbles
//
type CrmAgentMode = 'contacts' | 'conversations' | 'reports' | 'sql' | 'automation' | 'ai';
const MODE_CONFIG: Record<CrmAgentMode, { label: string; color: string; icon: string; description: string }> = {
  contacts:      { label: 'Contactos',      color: '#6366f1', icon: '👤', description: 'Buscar y gestionar contactos' },
  conversations: { label: 'Conversaciones', color: '#0ea5e9', icon: '💬', description: 'Gestionar tickets de soporte' },
  reports:       { label: 'Informes',       color: '#10b981', icon: '📊', description: 'Métricas y KPIs' },
  sql:           { label: 'SQL',            color: '#f59e0b', icon: '🔍', description: 'Consultas personalizadas' },
  automation:    { label: 'Automatización', color: '#8b5cf6', icon: '⚡', description: 'Reglas y SLAs' },
  ai:            { label: 'IA',             color: '#ec4899', icon: '🤖', description: 'Feedback y herramientas IA' },
};

const TOOL_LABELS: Record<string, { icon: string; label: string }> = {
  search_contacts:            { icon: '👤', label: 'Buscando contactos' },
  search_companies:           { icon: '🏢', label: 'Buscando empresas' },
  get_contact:                { icon: '👤', label: 'Obteniendo contacto' },
  create_contact:             { icon: '➕', label: 'Creando contacto' },
  update_contact:             { icon: '✏️', label: 'Actualizando contacto' },
  list_contacts_paginated:    { icon: '📋', label: 'Listando contactos' },
  get_conversation:           { icon: '💬', label: 'Obteniendo conversación' },
  create_conversation:        { icon: '➕', label: 'Creando conversación' },
  assign_conversation:        { icon: '👋', label: 'Asignando conversación' },
  update_conversation_status: { icon: '🔄', label: 'Actualizando estado' },
  list_conversations:         { icon: '📋', label: 'Listando conversaciones' },
  get_reporting_overview:     { icon: '📊', label: 'Obteniendo resumen' },
  get_csat_summary:           { icon: '⭐', label: 'Analizando CSAT' },
  get_calls_stats:            { icon: '📞', label: 'Estadísticas de llamadas' },
  get_reporting_rollups:      { icon: '📈', label: 'Generando rollups' },
  run_sql_query:              { icon: '🔍', label: 'Ejecutando consulta SQL' },
  list_automation_rules:      { icon: '⚡', label: 'Listando automatizaciones' },
  list_macros:                { icon: '📝', label: 'Listando macros' },
  list_ai_feedback:           { icon: '🤖', label: 'Analizando feedback IA' },
  search_knowledge_base:      { icon: '📚', label: 'Buscando en base de conocimiento' },
  list_mcp_servers:           { icon: '🔌', label: 'Listando servidores MCP' },
  switch_mode:                { icon: '🔄', label: 'Cambiando modo' },
  remember_fact:              { icon: '🧠', label: 'Guardando en memoria' },
  recall_memory:              { icon: '🧠', label: 'Consultando memoria' },
  'memory.append':            { icon: '🧠', label: 'Guardando en memoria' },
  'memory.get':               { icon: '🧠', label: 'Consultando memoria' },
  get_current_context:        { icon: '📍', label: 'Obteniendo contexto' },
};

const SLASH_COMMANDS = [
  { cmd: '/remember ', hint: '[texto] — Guardar en la memoria del agente' },
  { cmd: '/clear',     hint: '— Limpiar esta conversación' },
  { cmd: '/mode ',     hint: '[modo] — Cambiar modo' },
  { cmd: '/help',      hint: '— Ver comandos disponibles' },
];

type AgentMsg = {
  id: string;
  role: 'user' | 'assistant' | 'approval';
  content: string;
  toolCalls?: { toolName: string; args: any; result: any; durationMs: number }[];
  reasoning?: string;
  proposalId?: string;
  approvalPayload?: { toolName: string; preview: string; args?: any; risk?: string };
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  createdAt: string;
};

const MODE_SUGGESTIONS: Record<CrmAgentMode, string[]> = {
  contacts:      ['Buscar contactos llamados Juan', 'Crear un nuevo contacto', 'Actualizar el email de un contacto', 'Listar contactos de Madrid', 'Buscar empresa Acme Corp', 'Ver historial de contacto'],
  conversations: ['Mostrar tickets abiertos hoy', 'Asignar conversación al equipo de soporte', 'Listar conversaciones sin respuesta', 'Crear nueva conversación', 'Ver conversaciones de alta prioridad', 'Actualizar estado de ticket'],
  reports:       ['Resumen de métricas de hoy', '¿Cuál es nuestro CSAT actual?', 'Estadísticas de llamadas esta semana', 'Generar rollup mensual', 'Ver tiempo de respuesta promedio', 'Analizar tendencias de soporte'],
  sql:           ['SELECT * FROM contacts LIMIT 10', 'Contar conversaciones por estado', 'Top 5 clientes por volumen', 'Tickets cerrados este mes', 'Distribución por canal', 'Agentes con más resoluciones'],
  automation:    ['Listar reglas de automatización activas', 'Ver macros disponibles', 'Reglas de SLA configuradas', 'Automatizaciones por etiqueta', 'Revisar disparadores de notificación', 'Ver workflows activos'],
  ai:            ['Analizar feedback de IA reciente', 'Ver calificaciones del asistente', 'Buscar en base de conocimiento', 'Listar servidores MCP conectados', 'Revisar respuestas de Fin', 'Estadísticas de automatización IA'],
};

const DEFAULT_SUGGESTIONS = [
  'Mostrar conversaciones abiertas de hoy',
  'Buscar contactos llamados Juan',
  '¿Cuál es nuestro CSAT actual?',
  'Dame un resumen de reporting',
  'Listar reglas de automatización',
  'Buscar empresas del sector tech',
];

/** Render simple markdown-like formatting as React nodes */
function renderMarkdown(text: string): ReactNode {
  if (!text) return null;
  const lines = text.split('\n');
  const nodes: ReactNode[] = [];

  // Check for pipe-table
  const tableLines = lines.filter(l => l.includes('|'));
  const isTable = tableLines.length >= 2 && lines[0].includes('|');

  if (isTable) {
    const rows = lines.filter(l => l.trim().startsWith('|') || l.includes('|'));
    const dataRows = rows.filter(r => !/^[\s|:-]+$/.test(r));
    if (dataRows.length >= 2) {
      const parseCells = (row: string) => row.split('|').map(c => c.trim()).filter((c, i, a) => i > 0 && i < a.length - 1);
      const headers = parseCells(dataRows[0]);
      const bodyRows = dataRows.slice(1);
      return (
        <div className="overflow-x-auto">
          <table className="text-[12px] border-collapse w-full">
            <thead>
              <tr>{headers.map((h, i) => <th key={i} className="px-2 py-1 bg-[#f3f3f1] border border-[#e9eae6] text-left font-semibold text-[#1a1a1a]">{h}</th>)}</tr>
            </thead>
            <tbody>
              {bodyRows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-[#fafaf9]'}>
                  {parseCells(row).map((cell, ci) => <td key={ci} className="px-2 py-1 border border-[#e9eae6] text-[#1a1a1a]">{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }

  lines.forEach((line, li) => {
    if (line.startsWith('## ')) {
      nodes.push(<p key={li} className="font-bold text-[14px] text-[#1a1a1a] mt-2 mb-1">{line.slice(3)}</p>);
    } else if (line.startsWith('# ')) {
      nodes.push(<p key={li} className="font-bold text-[15px] text-[#1a1a1a] mt-2 mb-1">{line.slice(2)}</p>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      nodes.push(
        <div key={li} className="flex gap-1.5 items-start">
          <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-[#6366f1] flex-shrink-0" />
          <span>{inlineFormat(line.slice(2))}</span>
        </div>
      );
    } else if (line.startsWith('```') || line.startsWith('`')) {
      const code = line.replace(/`/g, '');
      nodes.push(<code key={li} className="block font-mono text-[12px] bg-[#f3f3f1] rounded px-2 py-1 my-0.5 text-[#1a1a1a] whitespace-pre-wrap break-all">{code}</code>);
    } else if (line.trim() === '') {
      nodes.push(<div key={li} className="h-1.5" />);
    } else {
      nodes.push(<span key={li} className="block">{inlineFormat(line)}</span>);
    }
  });
  return <>{nodes}</>;
}

function inlineFormat(text: string): ReactNode {
  // Bold: **text**
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="font-mono text-[12px] bg-[#f3f3f1] rounded px-1 text-[#1a1a1a]">{p.slice(1, -1)}</code>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

// ── SituationBriefing ─────────────────────────────────────────────────────────
// Always-visible "control room": what's happening in the workspace right now.
// Fed by GET /agent/situation; refreshes on crm-data-changed and on an interval.

type SituationData = {
  generatedAt: string;
  queues: { open: number; unassigned: number; mine: number; mentions: number; escalated: number };
  pendingApprovals: { count: number; items: any[] };
  riskyCases: { count: number; items: any[] };
  slaAtRisk: { count: number; items: any[] };
  unread: { count: number; notifications: number; mentions: number; items: any[] };
  kpi: { resolutionRate?: number; slaCompliance?: number; highRisk?: number; totalCases?: number } | null;
};

const SEV_DOT: Record<string, string> = {
  critical: 'bg-[#ef4444]', high: 'bg-[#f97316]', warn: 'bg-[#f59e0b]', info: 'bg-[#9a9a98]',
};

function SituationBriefing({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [data, setData] = useState<SituationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallbackRef(async () => {
    try {
      const r = await agentApi.getSituation();
      setData(r.situation ?? null);
    } catch { /* keep last snapshot */ }
    finally { setLoading(false); }
  });

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener('crm-data-changed', onChange);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60_000);
    return () => { window.removeEventListener('crm-data-changed', onChange); clearInterval(timer); };
  }, []);

  function go(item: any) {
    window.dispatchEvent(new CustomEvent('app-navigate', {
      detail: { view: item.view, entityType: item.entityType, entityId: item.entityId },
    }));
    if (item.view) onNavigate(item.view as View);
  }

  const groups: Array<{ key: string; title: string; count: number; items: any[] }> = data ? [
    { key: 'appr', title: 'Aprobaciones pendientes', count: data.pendingApprovals.count, items: data.pendingApprovals.items },
    { key: 'risk', title: 'Casos de alto riesgo', count: data.riskyCases.count, items: data.riskyCases.items },
    { key: 'sla', title: 'SLA a punto de incumplir', count: data.slaAtRisk.count, items: data.slaAtRisk.items },
    { key: 'unread', title: 'Sin leer', count: data.unread.count, items: data.unread.items },
  ] : [];

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        title="Mostrar qué está pasando"
        className="w-9 flex-shrink-0 rounded-[12px] border border-[#e9eae6] bg-white flex items-center justify-center text-[#6b6b68] hover:bg-[#f5f5f3]"
      >
        <span className="[writing-mode:vertical-rl] rotate-180 text-[11px] font-semibold tracking-wide">Qué está pasando</span>
      </button>
    );
  }

  return (
    <div className="w-[300px] flex-shrink-0 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e9eae6] flex-shrink-0">
        <span className="text-[15px]">📡</span>
        <p className="text-[13px] font-semibold text-[#1a1a1a] flex-1">Qué está pasando</p>
        <button onClick={() => load()} title="Refrescar" className="text-[#9a9a98] hover:text-[#1a1a1a] text-[13px]">↻</button>
        <button onClick={() => setCollapsed(true)} title="Ocultar" className="text-[#9a9a98] hover:text-[#1a1a1a] text-[13px]">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {loading && !data && <p className="text-[12px] text-[#9a9a98] px-1 py-2">Cargando…</p>}

        {data && (
          <>
            {/* Queues strip */}
            <div className="grid grid-cols-2 gap-1.5 mb-3">
              {[
                { l: 'Abiertas', v: data.queues.open },
                { l: 'Sin asignar', v: data.queues.unassigned },
                { l: 'Menciones', v: data.queues.mentions },
                { l: 'Escaladas', v: data.queues.escalated },
              ].map((q) => (
                <div key={q.l} className="rounded-lg bg-[#f7f7f5] px-2.5 py-1.5">
                  <div className="text-[15px] font-semibold text-[#1a1a1a] leading-none">{q.v}</div>
                  <div className="text-[10.5px] text-[#9a9a98] mt-0.5">{q.l}</div>
                </div>
              ))}
            </div>

            {groups.map((g) => (
              <div key={g.key} className="mb-3">
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  <p className="text-[11px] font-semibold text-[#6b6b68] uppercase tracking-wide flex-1">{g.title}</p>
                  <span className={`text-[11px] font-semibold px-1.5 rounded-full ${g.count ? 'bg-[#fef2f2] text-[#b91c1c]' : 'bg-[#f0f0ee] text-[#9a9a98]'}`}>{g.count}</span>
                </div>
                {g.items.length === 0 ? (
                  <p className="text-[11.5px] text-[#b4b4b0] px-1">—</p>
                ) : (
                  g.items.map((it) => (
                    <button
                      key={it.id}
                      onClick={() => go(it)}
                      className="w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-[#f5f5f3] transition-colors"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${SEV_DOT[it.severity] ?? SEV_DOT.info}`} />
                      <span className="min-w-0">
                        <span className="block text-[12px] text-[#1a1a1a] truncate">{it.label}</span>
                        {it.sub && <span className="block text-[11px] text-[#9a9a98] truncate">{it.sub}</span>}
                      </span>
                    </button>
                  ))
                )}
              </div>
            ))}

            {data.kpi && (
              <div className="mt-1 pt-2 border-t border-[#f0f0ee] px-1">
                <p className="text-[11px] font-semibold text-[#6b6b68] uppercase tracking-wide mb-1">KPIs (7d)</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-[#6b6b68]">
                  {data.kpi.resolutionRate != null && <span>Resolución <b className="text-[#1a1a1a]">{data.kpi.resolutionRate}%</b></span>}
                  {data.kpi.slaCompliance != null && <span>SLA <b className="text-[#1a1a1a]">{data.kpi.slaCompliance}%</b></span>}
                  {data.kpi.totalCases != null && <span>Casos <b className="text-[#1a1a1a]">{data.kpi.totalCases}</b></span>}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Stable callback wrapper (avoids re-subscribing effects on each render). */
function useCallbackRef<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef(fn);
  ref.current = fn;
  return useRef(((...args: any[]) => ref.current(...args)) as T).current;
}

// ── Max-style primitives ──────────────────────────────────────────────────────

/** Animated shimmer gradient over text — Max's "thinking"/in-progress signal. */
function ShimmerText({ children }: { children: ReactNode }) {
  return (
    <span
      className="bg-clip-text text-transparent"
      style={{
        backgroundImage: 'linear-gradient(90deg,#303030,rgba(48,48,48,0.42),rgba(48,48,48,0.25),rgba(48,48,48,0.42),#303030)',
        backgroundSize: '200% 100%',
        animation: 'max-shimmer 3s linear infinite',
      }}
    >
      {children}
    </span>
  );
}

/** Collapsible reasoning row ("Pensamiento") — Max renders thinking as an activity. */
function ReasoningRow({ content }: { content: string; id?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full text-xs">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 text-[#5f5f5f] hover:text-[#0d0d0d] select-none">
        <svg viewBox="0 0 20 20" className="w-4 h-4 fill-current"><path d="M10 2a5 5 0 0 0-3 9v2a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-2a5 5 0 0 0-3-9z"/></svg>
        <span>Pensamiento</span>
        <span className={`transition-transform text-[13px] ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {open && (
        <div className="mt-1 border-l-2 border-[#e3e3e3] pl-3.5 ml-2 text-[#5f5f5f] whitespace-pre-wrap">{content}</div>
      )}
    </div>
  );
}

export function AgentChatView({
  view,
  onNavigate,
  currentCrmView,
}: {
  view: View;
  onNavigate: (v: View) => void;
  currentCrmView: string;
}) {
  // ── State ────────────────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMsg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [reasoning, setReasoning] = useState('');
  const [reasoningOpen, setReasoningOpen] = useState(true);
  const [activeToolCalls, setActiveToolCalls] = useState<{ toolCallId?: string; toolName: string; args: any; result?: any; durationMs?: number; done: boolean }[]>([]);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentMode, setCurrentMode] = useState<CrmAgentMode | null>(null);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [memoryCount, setMemoryCount] = useState(0);
  const [memoryToast, setMemoryToast] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [trace, setTrace] = useState<{ traces: any[]; metrics: any } | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [displayedText, setDisplayedText] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const memoryToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownCharsRef = useRef(0);

  // ── Load conversation list ─────────────────────────────────────────────────
  useEffect(() => {
    setLoadingHistory(true);
    agentApi.listConversations()
      .then(r => setConversations(r.conversations ?? []))
      .catch(() => setConversations([]))
      .finally(() => setLoadingHistory(false));
  }, []);

  // ── Smooth typewriter: reveal streamingText char-by-char (Claude-style) ─────
  // The SSE delivers text in bursts; instead of painting each burst at once we
  // let a rAF loop catch up to it a few chars per frame, so the purple caret
  // trails smoothly like Claude. shownCharsRef survives re-renders; when a new
  // turn clears streamingText the reveal restarts from zero.
  useEffect(() => {
    const target = streamingText.length;
    if (target < shownCharsRef.current) { shownCharsRef.current = 0; setDisplayedText(''); }
    if (shownCharsRef.current >= target) return;
    let raf = 0;
    const step = () => {
      const t = streamingText.length;
      if (shownCharsRef.current >= t) return;
      const backlog = t - shownCharsRef.current;
      // Steady, smooth pace; nudges faster only when far behind so it never lags.
      const perFrame = Math.min(10, Math.max(1, Math.ceil(backlog / 8)));
      shownCharsRef.current = Math.min(t, shownCharsRef.current + perFrame);
      setDisplayedText(streamingText.slice(0, shownCharsRef.current));
      if (shownCharsRef.current < t) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [streamingText]);

  // ── Scroll to bottom ──────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, displayedText]);

  // ── Slash autocomplete visibility ─────────────────────────────────────────
  useEffect(() => {
    setShowSlashMenu(input.startsWith('/') && !streaming);
  }, [input, streaming]);

  // ── Memory toast auto-dismiss ─────────────────────────────────────────────
  function showMemToast(fact: string) {
    setMemoryToast(fact);
    if (memoryToastTimerRef.current) clearTimeout(memoryToastTimerRef.current);
    memoryToastTimerRef.current = setTimeout(() => setMemoryToast(null), 3000);
  }

  // ── Audit trace (per-turn timeline) ───────────────────────────────────────
  async function openTrace() {
    if (!activeConversationId) return;
    setTraceLoading(true);
    setTrace({ traces: [], metrics: null });
    try {
      const r = await agentApi.getTrace(activeConversationId);
      setTrace({ traces: r.traces ?? [], metrics: r.metrics ?? null });
    } catch {
      setTrace({ traces: [], metrics: null });
    } finally {
      setTraceLoading(false);
    }
  }

  // ── Load a past conversation ──────────────────────────────────────────────
  async function openConversation(id: string) {
    if (activeConversationId === id) return;
    try {
      const r = await agentApi.getConversation(id) as any;
      setActiveConversationId(id);
      const loaded: AgentMsg[] = r.messages ?? [];
      // If the thread was parked on an approval, rebuild the card so the user
      // can still decide after a reload (otherwise the pending action orphans).
      const pending = r.pendingApproval;
      if (pending?.proposalId) {
        loaded.push({
          id: `approval-${pending.proposalId}`,
          role: 'approval',
          content: pending.preview ?? `La herramienta ${pending.toolName} requiere aprobación`,
          proposalId: pending.proposalId,
          approvalPayload: { toolName: pending.toolName, preview: pending.preview, args: pending.args, risk: pending.risk },
          approvalStatus: 'pending',
          createdAt: new Date().toISOString(),
        });
      }
      setMessages(loaded);
      setStreamingText('');
      setActiveToolCalls([]);
      setPendingApproval(Boolean(pending?.proposalId));
    } catch (e) {
      console.error('load conversation error', e);
    }
  }

  // ── Delete a conversation ─────────────────────────────────────────────────
  async function deleteConv(id: string, e: { stopPropagation: () => void }) {
    e.stopPropagation();
    await agentApi.deleteConversation(id).catch(() => {});
    setConversations(cs => cs.filter(c => c.id !== id));
    if (activeConversationId === id) {
      setActiveConversationId(null);
      setMessages([]);
    }
  }

  // ── Start a new conversation ──────────────────────────────────────────────
  function newConversation() {
    abortRef.current?.abort();
    setActiveConversationId(null);
    setMessages([]);
    setStreamingText('');
    setActiveToolCalls([]);
    setPendingApproval(false);
    inputRef.current?.focus();
  }

  // ── Shared SSE consumer ─────────────────────────────────────────────────────
  // Both a fresh message and an approval resume stream the same event taxonomy,
  // so the switch lives here once. `streamFn` is the endpoint call (chat or
  // approve); buffers are local to each run.
  async function consumeAgentStream(
    streamFn: (onEvent: (event: string, data: any) => void, signal: AbortSignal) => Promise<void>,
  ) {
    setStreaming(true);
    setStreamingText('');
    setReasoning('');
    setReasoningOpen(true);
    setActiveToolCalls([]);

    let convId = activeConversationId;
    let assistantText = '';
    let reasoningText = '';
    let gated = false;
    const toolCallsBuffer: { toolCallId?: string; toolName: string; args: any; result?: any; durationMs?: number; done: boolean }[] = [];

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      await streamFn((event, data: any) => {
        switch (event) {
          case 'conversation_created':
          case 'conversation_id': {
            if (data.conversationId) {
              convId = data.conversationId;
              if (!activeConversationId) {
                setActiveConversationId(data.conversationId);
                agentApi.listConversations().then(r => setConversations(r.conversations ?? [])).catch(() => {});
              }
            }
            break;
          }
          case 'title_generated': {
            if (data.title) setConversations(cs => cs.map(c => c.id === convId ? { ...c, title: data.title } : c));
            break;
          }
          case 'reasoning_chunk': {
            reasoningText += data.text ?? '';
            setReasoning(reasoningText);
            break;
          }
          case 'text_chunk': {
            assistantText += data.text ?? '';
            setStreamingText(assistantText);
            break;
          }
          case 'tool_start': {
            toolCallsBuffer.push({ toolCallId: data.toolCallId, toolName: data.toolName, args: data.args, done: false });
            setActiveToolCalls([...toolCallsBuffer]);
            break;
          }
          case 'tool_result': {
            const idx = data.toolCallId
              ? toolCallsBuffer.findIndex(t => t.toolCallId === data.toolCallId)
              : toolCallsBuffer.map((t, i) => (!t.done && t.toolName === data.toolName ? i : -1)).filter(i => i !== -1).pop() ?? -1;
            if (idx !== -1) {
              toolCallsBuffer[idx] = { ...toolCallsBuffer[idx], result: data.data ?? data.result, durationMs: data.durationMs ?? 0, done: true };
            }
            setActiveToolCalls([...toolCallsBuffer]);
            // Let the CRM views react to what the agent just changed.
            if (data.uiHint) applyUiHint(data.uiHint);
            break;
          }
          case 'approval_request': {
            gated = true;
            // Preserve the agent's narration ("Voy a reembolsar…") as a bubble.
            if (assistantText.trim()) {
              setMessages(prev => [...prev, { id: `asst-${Date.now()}`, role: 'assistant', content: assistantText, createdAt: new Date().toISOString() }]);
            }
            setMessages(prev => [...prev, {
              id: `approval-${Date.now()}`,
              role: 'approval',
              content: data.preview ?? `La herramienta **${data.toolName}** requiere aprobación`,
              proposalId: data.proposalId,
              approvalPayload: { toolName: data.toolName, preview: data.preview, args: data.args, risk: data.risk },
              approvalStatus: 'pending',
              createdAt: new Date().toISOString(),
            }]);
            setPendingApproval(true);
            setStreamingText('');
            break;
          }
          case 'memory_updated': {
            setMemoryCount(prev => prev + 1);
            showMemToast(data.fact ?? 'Hecho guardado');
            break;
          }
          case 'done': {
            // The approval pause already emitted its bubbles; don't duplicate.
            if (data.finishReason === 'approval_pending' || gated) { setStreamingText(''); setReasoning(''); setActiveToolCalls([]); break; }
            const finalText = data.text || assistantText || '';
            const doneMsg: AgentMsg[] = [];
            if (data.finishReason === 'credit_exhausted') {
              doneMsg.push({ id: `credit-${Date.now()}`, role: 'assistant', content: data.message ?? 'Créditos de IA agotados.', createdAt: new Date().toISOString() });
            } else if (finalText || toolCallsBuffer.some(t => t.done)) {
              doneMsg.push({
                id: `asst-${Date.now()}`,
                role: 'assistant',
                content: finalText,
                toolCalls: toolCallsBuffer.filter(t => t.done).map(t => ({ toolName: t.toolName, args: t.args, result: t.result, durationMs: t.durationMs ?? 0 })),
                reasoning: reasoningText || undefined,
                createdAt: new Date().toISOString(),
              });
            }
            if (doneMsg.length) setMessages(prev => [...prev, ...doneMsg]);
            setStreamingText('');
            setReasoning('');
            setActiveToolCalls([]);
            break;
          }
          case 'error': {
            setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: `Error: ${data.message ?? 'Algo fue mal. Inténtalo de nuevo.'}`, createdAt: new Date().toISOString() }]);
            setStreamingText('');
            setReasoning('');
            setActiveToolCalls([]);
            break;
          }
        }
      }, ctrl.signal);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: 'Lo siento, algo fue mal. Por favor inténtalo de nuevo.', createdAt: new Date().toISOString() }]);
      }
    } finally {
      setStreaming(false);
      setStreamingText('');
    }
  }

  // ── Send message ──────────────────────────────────────────────────────────
  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || streaming || pendingApproval) return;
    setInput('');
    setShowSlashMenu(false);

    // /clear is a pure UI action — start a fresh conversation, no round-trip.
    if (msg === '/clear') { newConversation(); return; }

    setMessages(prev => [...prev, { id: `tmp-${Date.now()}`, role: 'user', content: msg, createdAt: new Date().toISOString() }]);

    const convId = activeConversationId;
    await consumeAgentStream((onEvent, signal) =>
      agentApi.chat({ message: msg, conversationId: convId ?? undefined, context: { view: currentCrmView, mode: currentMode } }, onEvent, signal),
    );
  }

  // ── Handle approval ───────────────────────────────────────────────────────
  // Consume the resumed SSE stream directly — the backend continues the loop
  // from its checkpoint, so we must NOT re-send the user's last message.
  async function handleApproval(proposalId: string, action: 'approve' | 'reject', feedback?: string) {
    if (!activeConversationId || streaming) return;
    setMessages(prev => prev.map(m =>
      m.proposalId === proposalId ? { ...m, approvalStatus: action === 'approve' ? 'approved' : 'rejected' } : m
    ));
    setPendingApproval(false);
    const convId = activeConversationId;
    await consumeAgentStream((onEvent, signal) =>
      agentApi.approve({ proposalId, action, feedback, conversationId: convId }, onEvent, signal),
    );
  }

  // ── Apply a UI hint from a tool result (refetch / navigate) ─────────────────
  function applyUiHint(hint: { kind: string; entityType?: string; entityId?: string; view?: string }) {
    if (!hint || !hint.kind) return;
    if (hint.kind === 'navigate' && hint.view) {
      window.dispatchEvent(new CustomEvent('app-navigate', { detail: { view: hint.view } }));
    } else if (hint.kind === 'refetch') {
      window.dispatchEvent(new CustomEvent('crm-data-changed', { detail: { entityType: hint.entityType, entityId: hint.entityId } }));
    }
  }

  function handleKey(e: { key: string; shiftKey: boolean; preventDefault(): void }) {
    if (showSlashMenu && e.key === 'Escape') {
      setShowSlashMenu(false);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function toggleToolExpand(key: string) {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function selectMode(mode: CrmAgentMode) {
    setCurrentMode(mode);
    setShowModeDropdown(false);
    sendMessage(`/mode ${mode}`);
  }

  // ── Tool call — Max "activity" row ────────────────────────────────────────
  function ToolCallCard({
    tc,
    cardKey,
    live = false,
  }: {
    key?: string | number | null;
    tc: { toolName: string; args: any; result?: any; durationMs?: number; done: boolean };
    cardKey: string;
    live?: boolean;
  }) {
    const expanded = expandedTools.has(cardKey);
    const meta = TOOL_LABELS[tc.toolName] ?? { icon: '⚙️', label: tc.toolName };
    const result = tc.result;
    const running = live && !tc.done;
    const failed = tc.done && result && typeof result === 'object' && (result.error != null || result.ok === false || result.errorCode != null);

    const arrayResult: any[] | null = (() => {
      if (!result || typeof result !== 'object') return null;
      if (Array.isArray(result)) return result.slice(0, 5);
      for (const k of Object.keys(result)) {
        if (Array.isArray(result[k]) && result[k].length > 0) return result[k].slice(0, 5);
      }
      return null;
    })();
    const isSql = tc.toolName === 'run_sql_query';
    const sqlRows: any[] = isSql && result?.rows ? result.rows.slice(0, 10) : [];
    const sqlCols: string[] = isSql && result?.columns ? result.columns : (sqlRows.length > 0 ? Object.keys(sqlRows[0]) : []);
    const hasDetails = (tc.args && Object.keys(tc.args).length > 0) || result != null;

    return (
      <div className="w-full text-xs">
        <button
          onClick={() => hasDetails && toggleToolExpand(cardKey)}
          className={`group/act flex items-center gap-1.5 w-full text-left rounded px-1 -mx-1 transition-colors ${hasDetails ? 'cursor-pointer hover:bg-[#f3f3f1]' : 'cursor-default'} ${expanded ? 'bg-[#f3f3f1]' : ''} ${failed ? 'text-[#b91c1c]' : running ? 'text-[#5f5f5f]' : 'text-[#0d0d0d]'}`}
        >
          <span className="relative flex items-center justify-center w-5 h-5 shrink-0 text-[13px]">
            <span className={hasDetails ? 'transition-opacity group-hover/act:opacity-0' : ''}>{failed ? '⚠️' : meta.icon}</span>
            {hasDetails && (
              <svg viewBox="0 0 16 16" className={`absolute w-3 h-3 fill-[#5f5f5f] opacity-0 transition-transform group-hover/act:opacity-100 ${expanded ? 'rotate-90' : ''}`}><path d="M6 4l4 4-4 4z"/></svg>
            )}
          </span>
          <span className="flex-1 truncate">
            {running ? <ShimmerText>{meta.label}…</ShimmerText> : meta.label}
          </span>
          {tc.durationMs != null && tc.done && <span className="text-[#9a9a98] text-[10px] shrink-0">{tc.durationMs}ms</span>}
        </button>

        {expanded && hasDetails && (
          <div className="mt-1 space-y-2 border-l-2 border-[#e3e3e3] pl-3.5 ml-2">
            {tc.args && Object.keys(tc.args).length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[#9a9a98] uppercase tracking-wide mb-1">Argumentos</p>
                <div className="space-y-0.5">
                  {Object.entries(tc.args).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="text-[#9a9a98] font-mono min-w-[80px]">{k}:</span>
                      <span className="text-[#0d0d0d] font-mono break-all">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {isSql && sqlRows.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[#9a9a98] uppercase tracking-wide mb-1">Resultado SQL ({result?.rowCount ?? sqlRows.length} filas)</p>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[11px]">
                    <thead><tr>{sqlCols.map(c => <th key={c} className="px-2 py-1 bg-[#f7f7f5] border border-[#e3e3e3] text-left font-semibold text-[#404040]">{c}</th>)}</tr></thead>
                    <tbody>
                      {sqlRows.map((row, ri) => (
                        <tr key={ri} className={ri % 2 === 0 ? '' : 'bg-[#fafaf9]'}>
                          {sqlCols.map(c => <td key={c} className="px-2 py-0.5 border border-[#e3e3e3] text-[#0d0d0d] max-w-[120px] truncate">{String(row[c] ?? '')}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {!isSql && arrayResult && arrayResult.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[#9a9a98] uppercase tracking-wide mb-1">Resultados ({arrayResult.length})</p>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[11px]">
                    <thead><tr>{Object.keys(arrayResult[0]).slice(0, 3).map(k => <th key={k} className="px-2 py-1 bg-[#f7f7f5] border border-[#e3e3e3] text-left font-semibold text-[#404040]">{k}</th>)}</tr></thead>
                    <tbody>
                      {arrayResult.map((row, ri) => (
                        <tr key={ri} className={ri % 2 === 0 ? '' : 'bg-[#fafaf9]'}>
                          {Object.values(row).slice(0, 3).map((v: any, ci) => (
                            <td key={ci} className="px-2 py-0.5 border border-[#e3e3e3] text-[#0d0d0d] max-w-[120px] truncate">{String(v ?? '')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {!isSql && !arrayResult && result != null && (
              <div>
                <p className="text-[10px] font-semibold text-[#9a9a98] uppercase tracking-wide mb-1">Resultado</p>
                <pre className="font-mono text-[10px] text-[#5f5f5f] whitespace-pre-wrap break-all max-h-32 overflow-y-auto bg-[#f7f7f5] border border-[#e3e3e3] rounded p-2">{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Approval card ─────────────────────────────────────────────────────────
  function ApprovalCard({ msg }: { msg: AgentMsg }) {
    const [feedback, setFeedback] = useState('');
    const [acting, setActing] = useState(false);
    const meta = TOOL_LABELS[msg.approvalPayload?.toolName ?? ''] ?? { icon: '⚙️', label: msg.approvalPayload?.toolName ?? 'Operación' };
    const done = msg.approvalStatus !== 'pending';

    async function act(action: 'approve' | 'reject') {
      if (!msg.proposalId || acting) return;
      setActing(true);
      await handleApproval(msg.proposalId, action, feedback || undefined);
      setActing(false);
    }

    return (
      <div className="my-2 border border-[#fbbf24] rounded-xl overflow-hidden bg-[#fffbeb] shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#fde68a]">
          <span className="text-[18px]">{meta.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[#92400e]">Confirmación requerida</p>
            <p className="text-[12px] text-[#b45309]">{meta.label}</p>
          </div>
          {done && (
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
              msg.approvalStatus === 'approved' ? 'bg-[#d1fae5] text-[#065f46]' : 'bg-[#fee2e2] text-[#991b1b]'
            }`}>
              {msg.approvalStatus === 'approved' ? 'Aprobado' : 'Rechazado'}
            </span>
          )}
        </div>
        <div className="px-4 py-3">
          <p className="text-[12.5px] text-[#78350f] mb-3">{msg.approvalPayload?.preview ?? msg.content}</p>
          {!done && (
            <>
              <input
                type="text"
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="Feedback opcional al rechazar…"
                className="w-full text-[12px] border border-[#fde68a] rounded-lg px-3 py-1.5 mb-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#f59e0b]/30 placeholder:text-[#d97706]/50"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => act('approve')}
                  disabled={acting}
                  className="flex-1 py-1.5 rounded-lg bg-[#10b981] hover:bg-[#059669] text-white text-[12.5px] font-semibold transition-colors disabled:opacity-50"
                >
                  {acting ? '…' : '✓ Aprobar'}
                </button>
                <button
                  onClick={() => act('reject')}
                  disabled={acting}
                  className="flex-1 py-1.5 rounded-lg bg-[#ef4444] hover:bg-[#dc2626] text-white text-[12.5px] font-semibold transition-colors disabled:opacity-50"
                >
                  {acting ? '…' : '✕ Rechazar'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Message bubble ────────────────────────────────────────────────────────
  function MessageBubble({ msg }: { key?: string | number | null; msg: AgentMsg }) {
    if (msg.role === 'approval') return <ApprovalCard msg={msg} />;
    const isUser = msg.role === 'user';

    // Max layout: user pushed right, assistant left; the SAME bordered box for
    // both (no colored bubbles, no avatars, no timestamps).
    return (
      <div className={isUser ? 'flex flex-row-reverse ml-4 @md/thread:ml-10' : 'flex mr-4 @md/thread:mr-10'}>
        <div className={`flex flex-col w-full min-w-0 gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
          {!isUser && msg.reasoning && <ReasoningRow content={msg.reasoning} id={`msg-${msg.id}`} />}
          {!isUser && msg.toolCalls && msg.toolCalls.length > 0 && (
            <div className="w-full flex flex-col gap-1">
              {msg.toolCalls.map((tc, i) => (
                <ToolCallCard key={i} tc={{ ...tc, done: true }} cardKey={`msg-${msg.id}-tc-${i}`} />
              ))}
            </div>
          )}
          {msg.content && (
            <div className={`border border-[#e3e3e3] rounded-lg bg-white py-2 px-3 break-words text-[14px] leading-relaxed text-[#0d0d0d] max-w-full ${isUser ? 'font-medium' : ''}`}>
              {isUser ? msg.content : renderMarkdown(msg.content)}
            </div>
          )}
          {!isUser && msg.content && (
            <div className="flex items-center gap-0.5 -mt-0.5">
              <button
                onClick={() => { try { navigator.clipboard.writeText(msg.content); } catch { /* noop */ } }}
                title="Copiar"
                className="text-[#666666] hover:text-[#0d0d0d] hover:bg-[#f3f3f1] rounded p-1 transition-colors"
              >
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><rect x="5" y="5" width="8" height="9" rx="1.5"/><path d="M3 11V3a1.5 1.5 0 0 1 1.5-1.5H10"/></svg>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Welcome screen ────────────────────────────────────────────────────────
  function WelcomeScreen() {
    const suggestions = currentMode ? MODE_SUGGESTIONS[currentMode] : DEFAULT_SUGGESTIONS;
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-4 text-center w-full max-w-[720px] mx-auto">
        <div className="p-2" style={{ animation: 'max-bob 2.4s ease-in-out infinite' }}>
          <svg viewBox="0 0 24 24" className="w-12 h-12" style={{ fill: '#8b30ff' }}>
            <path d="M12 2l2.4 6.6H21l-5.4 3.9 2.1 6.6L12 14.7l-5.7 3.9 2.1-6.6L3 7.6h6.6L12 2z"/>
          </svg>
        </div>
        <div className="mb-1">
          <h2 className="text-xl font-bold mb-2 text-[#0d0d0d]">
            {currentMode ? `Max — ${MODE_CONFIG[currentMode].icon} ${MODE_CONFIG[currentMode].label}` : '¿En qué te ayudo?'}
          </h2>
          <div className="text-sm italic text-[#666666]">
            {currentMode ? MODE_CONFIG[currentMode].description : 'Tu copiloto de CRM. Pregúntame por casos, clientes, aprobaciones o informes.'}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 w-full max-w-[520px]">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => sendMessage(s)}
              className="text-left px-3 py-2 rounded-lg border border-[#e3e3e3] bg-white hover:border-[#8b30ff]/40 hover:bg-[#faf7ff] transition-colors text-[13px] text-[#0d0d0d]"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Typing indicator ──────────────────────────────────────────────────────
  function TypingIndicator() {
    // Renders as an in-progress assistant turn (left-aligned, no avatar).
    return (
      <div className="flex mr-4 @md/thread:mr-10">
        <div className="flex flex-col w-full min-w-0 gap-1.5 items-start">
          {reasoning && (
            <div className="w-full text-xs">
              <button onClick={() => setReasoningOpen(o => !o)} className="flex items-center gap-1.5 select-none">
                <svg viewBox="0 0 20 20" className="w-4 h-4 fill-[#5f5f5f]"><path d="M10 2a5 5 0 0 0-3 9v2a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-2a5 5 0 0 0-3-9z"/></svg>
                <ShimmerText>Pensando</ShimmerText>
                <span className={`text-[13px] text-[#5f5f5f] transition-transform ${reasoningOpen ? 'rotate-90' : ''}`}>›</span>
              </button>
              {reasoningOpen && (
                <div className="mt-1 border-l-2 border-[#e3e3e3] pl-3.5 ml-2 text-[#5f5f5f] whitespace-pre-wrap max-h-40 overflow-y-auto">{reasoning}</div>
              )}
            </div>
          )}
          {activeToolCalls.length > 0 && (
            <div className="w-full flex flex-col gap-1">
              {activeToolCalls.map((tc, i) => (
                <ToolCallCard key={i} tc={tc} cardKey={`live-${i}`} live />
              ))}
            </div>
          )}
          {streamingText ? (
            <div className="border border-[#e3e3e3] rounded-lg bg-white py-2 px-3 break-words text-[14px] leading-relaxed text-[#0d0d0d] max-w-full">
              {renderMarkdown(displayedText)}
              <span className="inline-block w-[3px] h-[15px] align-middle ml-0.5 rounded-sm" style={{ background: '#8b30ff', animation: 'max-blink 1s steps(2) infinite' }} />
            </div>
          ) : (activeToolCalls.length === 0 && !reasoning) ? (
            <div className="text-[13px]"><ShimmerText>Pensando…</ShimmerText></div>
          ) : null}
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      {/* Max-style animations */}
      <style>{`
        @keyframes max-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes max-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        @keyframes max-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .agent-hero-rainbow { background-image: linear-gradient(90deg,#3b82f6 0%,#8b5cf6 28%,#ec4899 52%,#f43f5e 74%,#f97316 100%); background-size:220% 100%; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent; animation: agent-hero-reveal 2.2s ease-in-out forwards; }
        @keyframes agent-hero-reveal {
          0%   { opacity:0; background-position:140% 0; -webkit-text-fill-color:transparent; }
          20%  { opacity:1; background-position:110% 0; -webkit-text-fill-color:transparent; }
          55%  { background-position:0% 0; -webkit-text-fill-color:transparent; }
          100% { background-position:0% 0; -webkit-text-fill-color:#1a1a1a; }
        }
      `}</style>
      {/* Memory toast */}
      {memoryToast && (
        <div
          className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-[#1a1a1a] text-white text-[12.5px] font-medium px-4 py-2.5 rounded-xl shadow-lg"
          style={{ animation: 'fadeInOut 3s ease forwards' }}
        >
          <span>🧠</span>
          <span>✓ Guardado en memoria</span>
          <style>{`@keyframes fadeInOut { 0%{opacity:0;transform:translateY(-8px)} 10%{opacity:1;transform:translateY(0)} 80%{opacity:1} 100%{opacity:0;transform:translateY(-8px)} }`}</style>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Chat column + collapsible conversations sidebar */}
        <div className="flex flex-1 min-w-0 h-full gap-2">

          {/* Active chat area */}
          <div className="relative flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">

            {/* Floating controls — no header bar */}
            <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
              {activeConversationId && (
                <button
                  onClick={newConversation}
                  title="Nueva conversación"
                  aria-label="Nueva conversación"
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/70 backdrop-blur-sm text-[#9a9a98] hover:bg-[#f3f3f1] hover:text-[#646462] transition-colors"
                >
                  <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.6" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>
                </button>
              )}
              <button
                onClick={() => setSidebarOpen(v => !v)}
                title={sidebarOpen ? 'Cerrar conversaciones' : 'Abrir conversaciones'}
                aria-label={sidebarOpen ? 'Cerrar la barra de conversaciones' : 'Abrir la barra de conversaciones'}
                className={`w-8 h-8 rounded-lg flex items-center justify-center backdrop-blur-sm transition-colors ${sidebarOpen ? 'bg-[#f0f0ef] text-[#646462]' : 'bg-white/70 text-[#9a9a98] hover:bg-[#f3f3f1] hover:text-[#646462]'}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M15 3v18" />
                </svg>
              </button>
            </div>

            {/* Messages — centered thread */}
            <div className="flex-1 overflow-y-auto min-h-0 px-4 py-5">
              {messages.length === 0 && !streaming ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-8">
                  <h1 className="agent-hero-rainbow text-[34px] sm:text-[46px] font-semibold tracking-tight leading-tight">¿En qué puedo ayudarte?</h1>
                </div>
              ) : (
                <div className="@container/thread flex flex-col w-full max-w-[720px] mx-auto gap-1.5">
                  {messages.map(m => <MessageBubble key={m.id} msg={m} />)}
                  {streaming && <TypingIndicator />}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Composer — Max style */}
            <div className="flex-shrink-0 px-4 pb-3 pt-1">
              <div className="w-full max-w-[720px] mx-auto">
                <div className="relative">
                  {/* Slash command autocomplete */}
                  {showSlashMenu && (
                    <div className="absolute bottom-full left-0 mb-1 w-full bg-white border border-[#e3e3e3] rounded-lg shadow-lg z-20 overflow-hidden py-1">
                      {SLASH_COMMANDS.filter(sc => sc.cmd.startsWith(input) || input === '/').map((sc, i) => (
                        <button
                          key={i}
                          onClick={() => { setInput(sc.cmd); inputRef.current?.focus(); }}
                          className="flex items-center gap-2 w-full px-3 py-2 hover:bg-[#f3f3f1] transition-colors text-left"
                        >
                          <code className="text-[12px] font-mono font-semibold text-[#8b30ff] min-w-[120px]">{sc.cmd.trim()}</code>
                          <span className="text-[11.5px] text-[#666666]">{sc.hint}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Input box with AI focus ring */}
                  <label className="relative flex flex-col cursor-text border border-[#e3e3e3] rounded-lg bg-white/90 backdrop-blur-sm transition-shadow focus-within:border-[#8b30ff] focus-within:ring-2 focus-within:ring-[#8b30ff]/30">
                    {!input && (
                      <div className="pointer-events-none absolute top-3 left-3 text-[14px] text-[#404040]">
                        {pendingApproval
                          ? 'Esperando aprobación…'
                          : streaming
                            ? 'Pensando…'
                            : <>Pregunta lo que quieras <span className="text-[#666666] opacity-80">o / para comandos</span></>}
                      </div>
                    )}
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={handleKey}
                      rows={1}
                      className="w-full resize-none bg-transparent border-none outline-none px-3 pt-3 pb-10 text-[14px] text-[#0d0d0d] leading-relaxed min-h-[64px] max-h-40 overflow-y-auto"
                      disabled={pendingApproval}
                    />
                    <button
                      onClick={() => streaming ? abortRef.current?.abort() : sendMessage()}
                      className={`absolute bottom-[7px] right-[7px] w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                        streaming
                          ? 'bg-white border border-[#e3e3e3] text-[#0d0d0d] hover:bg-[#f3f3f1]'
                          : (input.trim() && !pendingApproval)
                            ? 'bg-[#1d1d1d] hover:bg-[#000] text-white'
                            : 'bg-[#f0f0ee] text-[#999999] cursor-default'
                      }`}
                      disabled={(!input.trim() && !streaming) || pendingApproval}
                    >
                      {streaming ? (
                        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><rect x="4" y="4" width="8" height="8" rx="1.5"/></svg>
                      ) : (
                        <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 13V3M4 7l4-4 4 4"/></svg>
                      )}
                    </button>
                  </label>
                </div>

                <p className="text-[11px] text-[#666666] mt-1.5 text-center">
                  Max puede cometer errores. Verifica la información importante.
                </p>
              </div>
            </div>
          </div>

          {/* Collapsible conversations sidebar — hidden by default, opens on demand */}
          {sidebarOpen && (
            <aside className="w-[288px] flex-shrink-0 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              {/* Header */}
              <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[#1a1a1a]">Conversaciones</span>
                <button
                  onClick={() => setSidebarOpen(false)}
                  title="Cerrar"
                  aria-label="Cerrar la barra de conversaciones"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[#9a9a98] hover:bg-[#f3f3f1] hover:text-[#646462] transition-colors"
                >
                  <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.6" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                </button>
              </div>

              {/* New conversation */}
              <div className="px-3 pb-2">
                <button
                  onClick={newConversation}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-[#e9eae6] text-[12.5px] font-medium text-[#404040] hover:bg-[#faf7ff] hover:border-[#8b30ff]/40 transition-colors"
                >
                  <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.6" strokeLinecap="round"><path d="M8 3v10M3 8h10" /></svg>
                  Nueva conversación
                </button>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto px-1.5 pb-2 space-y-0.5">
                {loadingHistory ? (
                  <div className="px-3 py-2 text-[12px] text-[#9a9a98]">Cargando…</div>
                ) : conversations.length === 0 ? (
                  <div className="px-3 py-6 text-[12px] text-[#9a9a98] text-center">Aún no hay conversaciones</div>
                ) : (
                  conversations.map(c => (
                    <div
                      key={c.id}
                      onClick={() => openConversation(c.id)}
                      className={`group relative flex flex-col px-3 py-2 pr-8 rounded-lg cursor-pointer transition-colors ${activeConversationId === c.id ? 'bg-[#f3f0ff]' : 'hover:bg-[#f6f6f4]'}`}
                    >
                      <p className={`text-[12.5px] truncate ${activeConversationId === c.id ? 'font-semibold text-[#5b2bd6]' : 'font-medium text-[#1a1a1a]'}`}>{c.title || 'Sin título'}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10.5px] text-[#9a9a98]">{c.messageCount ?? c.message_count ?? 0} msgs</span>
                        {c.updatedAt || c.updated_at ? (
                          <>
                            <span className="text-[9px] text-[#cfcfcb]">•</span>
                            <span className="text-[10.5px] text-[#b4b4b0]">{relativeTime(c.updatedAt ?? c.updated_at)}</span>
                          </>
                        ) : null}
                      </div>
                      <button
                        onClick={e => deleteConv(c.id, e)}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md flex items-center justify-center text-[#9a9a98] hover:text-[#ef4444] hover:bg-[#efefef] opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none transition-opacity"
                        title="Eliminar conversación"
                        aria-label="Eliminar conversación"
                      >
                        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.5 8.5h5l.5-8.5" /></svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* Audit trace modal */}
      {trace && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-6" onClick={() => setTrace(null)}>
          <div className="bg-white rounded-2xl border border-[#e9eae6] shadow-xl w-full max-w-[640px] max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-5 py-3 border-b border-[#e9eae6]">
              <span>🔎</span>
              <p className="text-[14px] font-semibold flex-1">Traza de auditoría</p>
              {trace.metrics && (
                <span className="text-[11px] text-[#9a9a98]">
                  {trace.metrics.total} turnos · {trace.metrics.averageSpanCount} acciones/turno · {trace.metrics.averageLatencyMs}ms
                </span>
              )}
              <button onClick={() => setTrace(null)} className="text-[#9a9a98] hover:text-[#1a1a1a] ml-2">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {traceLoading ? (
                <p className="text-[12px] text-[#9a9a98]">Cargando…</p>
              ) : trace.traces.length === 0 ? (
                <p className="text-[12px] text-[#9a9a98]">Aún no hay trazas para esta conversación.</p>
              ) : (
                trace.traces.map((t: any, ti: number) => (
                  <div key={ti} className="mb-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full ${
                        t.status === 'success' ? 'bg-[#d1fae5] text-[#065f46]'
                        : t.status === 'pending_approval' ? 'bg-[#fef3c7] text-[#92400e]'
                        : t.status === 'failed' ? 'bg-[#fee2e2] text-[#991b1b]' : 'bg-[#f0f0ee] text-[#6b6b68]'
                      }`}>{t.status}</span>
                      <span className="text-[11px] text-[#9a9a98]">{new Date(t.startedAt).toLocaleString('es-ES')}</span>
                    </div>
                    {t.summary && <p className="text-[12px] text-[#1a1a1a] mb-1.5">{t.summary}</p>}
                    {(t.spans ?? []).map((s: any, si: number) => (
                      <div key={si} className="flex items-start gap-2 pl-2 border-l-2 border-[#e9eae6] py-1">
                        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${s.result?.ok ? 'bg-[#10b981]' : 'bg-[#ef4444]'}`} />
                        <div className="min-w-0 flex-1">
                          <span className="text-[12px] font-medium text-[#1a1a1a]">{s.tool}</span>
                          <span className="text-[11px] text-[#9a9a98] ml-2">{s.latencyMs}ms · {s.riskLevel}</span>
                          <pre className="text-[10.5px] text-[#6b6b68] bg-[#faf9f7] rounded px-2 py-1 mt-0.5 overflow-x-auto max-h-24">{JSON.stringify(s.result?.ok ? s.result.value : s.result, null, 1)?.slice(0, 800)}</pre>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
