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
  proposalId?: string;
  approvalPayload?: { toolName: string; preview: string; payload: any };
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
  const [activeToolCalls, setActiveToolCalls] = useState<{ toolName: string; args: any; result?: any; durationMs?: number; done: boolean }[]>([]);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [currentMode, setCurrentMode] = useState<CrmAgentMode | null>(null);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [memoryCount, setMemoryCount] = useState(0);
  const [memoryToast, setMemoryToast] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [lastSentMessage, setLastSentMessage] = useState<string>('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const memoryToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load conversation list ─────────────────────────────────────────────────
  useEffect(() => {
    setLoadingHistory(true);
    agentApi.listConversations()
      .then(r => setConversations(r.conversations ?? []))
      .catch(() => setConversations([]))
      .finally(() => setLoadingHistory(false));
  }, []);

  // ── Scroll to bottom ──────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

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

  // ── Load a past conversation ──────────────────────────────────────────────
  async function openConversation(id: string) {
    if (activeConversationId === id) return;
    try {
      const r = await agentApi.getConversation(id);
      setActiveConversationId(id);
      setMessages(r.messages ?? []);
      setStreamingText('');
      setActiveToolCalls([]);
      setPendingApproval(false);
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

  // ── Send message ──────────────────────────────────────────────────────────
  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || streaming || pendingApproval) return;
    setInput('');
    setShowSlashMenu(false);
    setLastSentMessage(msg);

    const tempId = `tmp-${Date.now()}`;
    const userMsg: AgentMsg = { id: tempId, role: 'user', content: msg, createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);

    setStreaming(true);
    setStreamingText('');
    setActiveToolCalls([]);

    let convId = activeConversationId;
    let assistantText = '';
    const toolCallsBuffer: { toolName: string; args: any; result?: any; durationMs?: number; done: boolean }[] = [];

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      await agentApi.chat(
        {
          message: msg,
          conversationId: convId ?? undefined,
          context: { currentView: currentCrmView, mode: currentMode },
        },
        (event, data: any) => {
          switch (event) {
            case 'conversation_created':
            case 'conversation_id': {
              if (!convId && data.conversationId) {
                convId = data.conversationId;
                setActiveConversationId(data.conversationId);
                agentApi.listConversations()
                  .then(r => setConversations(r.conversations ?? []))
                  .catch(() => {});
              }
              break;
            }
            case 'title_generated': {
              if (data.title) {
                setConversations(cs => cs.map(c => c.id === convId ? { ...c, title: data.title } : c));
              }
              break;
            }
            case 'text_chunk': {
              assistantText += data.text ?? '';
              setStreamingText(assistantText);
              break;
            }
            case 'tool_start': {
              toolCallsBuffer.push({ toolName: data.toolName, args: data.args, done: false });
              setActiveToolCalls([...toolCallsBuffer]);
              break;
            }
            case 'tool_result': {
              const idx = toolCallsBuffer.map((t, i) => (!t.done && t.toolName === data.toolName ? i : -1)).filter(i => i !== -1).pop() ?? -1;
              if (idx !== -1) {
                toolCallsBuffer[idx] = { ...toolCallsBuffer[idx], result: data.data ?? data.result, durationMs: data.durationMs ?? 0, done: true };
              }
              setActiveToolCalls([...toolCallsBuffer]);
              break;
            }
            case 'approval_request': {
              const approvalMsg: AgentMsg = {
                id: `approval-${Date.now()}`,
                role: 'approval',
                content: data.preview ?? `La herramienta **${data.toolName}** requiere aprobación`,
                proposalId: data.proposalId,
                approvalPayload: { toolName: data.toolName, preview: data.preview, payload: data.payload },
                approvalStatus: 'pending',
                createdAt: new Date().toISOString(),
              };
              setMessages(prev => [...prev, approvalMsg]);
              setPendingApproval(true);
              setStreaming(false);
              setStreamingText('');
              break;
            }
            case 'memory_updated': {
              setMemoryCount(prev => prev + 1);
              showMemToast(data.fact ?? 'Hecho guardado');
              break;
            }
            case 'mode_switched': {
              if (data.newMode && Object.keys(MODE_CONFIG).includes(data.newMode)) {
                setCurrentMode(data.newMode as CrmAgentMode);
              }
              break;
            }
            case 'slash_handled': {
              if (data.command === 'clear') {
                setMessages([]);
                setActiveConversationId(null);
              }
              break;
            }
            case 'done': {
              const finalText = data.text || assistantText || '';
              const assistantMsg: AgentMsg = {
                id: `asst-${Date.now()}`,
                role: 'assistant',
                content: finalText,
                toolCalls: toolCallsBuffer.filter(t => t.done).map(t => ({
                  toolName: t.toolName,
                  args: t.args,
                  result: t.result,
                  durationMs: t.durationMs ?? 0,
                })),
                createdAt: new Date().toISOString(),
              };
              setMessages(prev => [...prev, assistantMsg]);
              setStreamingText('');
              setActiveToolCalls([]);
              break;
            }
            case 'error': {
              const errMsg: AgentMsg = {
                id: `err-${Date.now()}`,
                role: 'assistant',
                content: `Error: ${data.message ?? 'Algo fue mal. Inténtalo de nuevo.'}`,
                createdAt: new Date().toISOString(),
              };
              setMessages(prev => [...prev, errMsg]);
              setStreamingText('');
              setActiveToolCalls([]);
              break;
            }
          }
        },
        ctrl.signal,
      );
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        const errMsg: AgentMsg = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'Lo siento, algo fue mal. Por favor inténtalo de nuevo.',
          createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, errMsg]);
      }
    } finally {
      setStreaming(false);
      setStreamingText('');
    }
  }

  // ── Handle approval ───────────────────────────────────────────────────────
  async function handleApproval(proposalId: string, action: 'approve' | 'reject', feedback?: string) {
    if (!activeConversationId) return;
    setMessages(prev => prev.map(m =>
      m.proposalId === proposalId ? { ...m, approvalStatus: action === 'approve' ? 'approved' : 'rejected' } : m
    ));
    setPendingApproval(false);
    try {
      await agentApi.approve({ proposalId, action, feedback, conversationId: activeConversationId });
      if (action === 'approve') {
        // Re-send last message to continue the flow
        await sendMessage(lastSentMessage || 'continuar');
      }
    } catch (e) {
      console.error('approval error', e);
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

  // ── Tool call card (rich version) ─────────────────────────────────────────
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

    // Detect array results for mini-table
    const arrayResult: any[] | null = (() => {
      if (!result) return null;
      if (Array.isArray(result)) return result.slice(0, 5);
      const keys = Object.keys(result ?? {});
      for (const k of keys) {
        if (Array.isArray(result[k]) && result[k].length > 0) return result[k].slice(0, 5);
      }
      return null;
    })();

    // SQL results
    const isSql = tc.toolName === 'run_sql_query';
    const sqlRows: any[] = isSql && result?.rows ? result.rows.slice(0, 10) : [];
    const sqlCols: string[] = isSql && result?.columns ? result.columns : (sqlRows.length > 0 ? Object.keys(sqlRows[0]) : []);

    return (
      <div className="my-1 border border-[#e9eae6] rounded-lg overflow-hidden bg-[#f9f9f7] text-[12px]">
        <button
          onClick={() => toggleToolExpand(cardKey)}
          className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-[#f3f3f1] transition-colors"
        >
          {live && !tc.done ? (
            <span className="inline-block w-2 h-2 rounded-full bg-[#6366f1] animate-pulse flex-shrink-0" />
          ) : (
            <span className="text-[#10b981] flex-shrink-0 text-[11px]">✓</span>
          )}
          <span className="flex-shrink-0">{meta.icon}</span>
          <span className="font-medium text-[#1a1a1a] flex-1 truncate">{meta.label}</span>
          {tc.durationMs != null && tc.done && (
            <span className="text-[#9a9a98] text-[10px] flex-shrink-0">{tc.durationMs}ms</span>
          )}
          <svg viewBox="0 0 16 16" className={`w-3 h-3 fill-[#9a9a98] flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}>
            <path d="M6 4l4 4-4 4z"/>
          </svg>
        </button>

        {expanded && (
          <div className="border-t border-[#e9eae6] px-3 py-2 space-y-2">
            {/* Args */}
            {tc.args && Object.keys(tc.args).length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[#9a9a98] uppercase tracking-wide mb-1">Argumentos</p>
                <div className="space-y-0.5">
                  {Object.entries(tc.args).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="text-[#9a9a98] font-mono min-w-[80px]">{k}:</span>
                      <span className="text-[#1a1a1a] font-mono break-all">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SQL table result */}
            {isSql && sqlRows.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[#9a9a98] uppercase tracking-wide mb-1">Resultado SQL ({result?.rowCount ?? sqlRows.length} filas)</p>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr>{sqlCols.map(c => <th key={c} className="px-2 py-1 bg-[#f0f0ef] border border-[#e9eae6] text-left font-semibold text-[#646462]">{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {sqlRows.map((row, ri) => (
                        <tr key={ri} className={ri % 2 === 0 ? '' : 'bg-[#fafaf9]'}>
                          {sqlCols.map(c => <td key={c} className="px-2 py-0.5 border border-[#e9eae6] text-[#1a1a1a] max-w-[120px] truncate">{String(row[c] ?? '')}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Array mini-table for non-SQL tools */}
            {!isSql && arrayResult && arrayResult.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-[#9a9a98] uppercase tracking-wide mb-1">Resultados ({arrayResult.length})</p>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr>{Object.keys(arrayResult[0]).slice(0, 3).map(k => <th key={k} className="px-2 py-1 bg-[#f0f0ef] border border-[#e9eae6] text-left font-semibold text-[#646462]">{k}</th>)}</tr>
                    </thead>
                    <tbody>
                      {arrayResult.map((row, ri) => (
                        <tr key={ri} className={ri % 2 === 0 ? '' : 'bg-[#fafaf9]'}>
                          {Object.values(row).slice(0, 3).map((v: any, ci) => (
                            <td key={ci} className="px-2 py-0.5 border border-[#e9eae6] text-[#1a1a1a] max-w-[120px] truncate">{String(v ?? '')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Generic JSON fallback for non-array, non-SQL results */}
            {!isSql && !arrayResult && result && (
              <div>
                <p className="text-[10px] font-semibold text-[#9a9a98] uppercase tracking-wide mb-1">Resultado</p>
                <pre className="font-mono text-[10px] text-[#646462] whitespace-pre-wrap break-all max-h-32 overflow-y-auto bg-[#f3f3f1] rounded p-2">{JSON.stringify(result, null, 2)}</pre>
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

    return (
      <div className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
        {!isUser && (
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-white">
              <path d="M8 1l1.6 4.4H14l-3.6 2.6 1.4 4.4L8 9.8l-3.8 2.6 1.4-4.4L2 5.4h4.4L8 1z"/>
            </svg>
          </div>
        )}
        <div className={`max-w-[78%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
          {!isUser && msg.toolCalls && msg.toolCalls.length > 0 && (
            <div className="mb-2 w-full">
              {msg.toolCalls.map((tc, i) => (
                <ToolCallCard
                  key={i}
                  tc={{ ...tc, done: true }}
                  cardKey={`msg-${msg.id}-tc-${i}`}
                />
              ))}
            </div>
          )}
          {msg.content && (
            <div
              className={`px-3.5 py-2.5 rounded-2xl text-[13.5px] leading-relaxed break-words ${
                isUser
                  ? 'bg-[#1a1a1a] text-white rounded-tr-sm'
                  : 'bg-white border border-[#e9eae6] text-[#1a1a1a] rounded-tl-sm shadow-[0_1px_3px_rgba(0,0,0,0.06)]'
              }`}
            >
              {isUser ? msg.content : renderMarkdown(msg.content)}
            </div>
          )}
          <span className="text-[11px] text-[#b4b4b0] mt-1 px-1">
            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        {isUser && (
          <div className="w-7 h-7 rounded-full bg-[#e9eae6] flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462]">
              <circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6H2z"/>
            </svg>
          </div>
        )}
      </div>
    );
  }

  // ── Welcome screen ────────────────────────────────────────────────────────
  function WelcomeScreen() {
    const suggestions = currentMode ? MODE_SUGGESTIONS[currentMode] : DEFAULT_SUGGESTIONS;
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 px-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center shadow-lg">
          <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white">
            <path d="M12 2l2.4 6.6H21l-5.4 3.9 2.1 6.6L12 14.7l-5.7 3.9 2.1-6.6L3 7.6h6.6L12 2z"/>
          </svg>
        </div>
        <div>
          <h2 className="text-[22px] font-bold text-[#1a1a1a] mb-2">
            {currentMode ? `Max — ${MODE_CONFIG[currentMode].icon} ${MODE_CONFIG[currentMode].label}` : 'Hola, soy Max'}
          </h2>
          <p className="text-[14px] text-[#646462] max-w-[360px] leading-relaxed">
            {currentMode
              ? MODE_CONFIG[currentMode].description
              : 'Tu asistente IA para CRM-AI. Puedo buscar contactos, revisar conversaciones, generar informes y mucho más.'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full max-w-[480px]">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => sendMessage(s)}
              className="text-left px-3.5 py-2.5 rounded-xl border border-[#e9eae6] bg-white hover:bg-[#f9f9f7] hover:border-[#6366f1]/30 transition-all text-[12.5px] text-[#1a1a1a] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
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
    return (
      <div className="flex gap-2 justify-start mb-3">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-white">
            <path d="M8 1l1.6 4.4H14l-3.6 2.6 1.4 4.4L8 9.8l-3.8 2.6 1.4-4.4L2 5.4h4.4L8 1z"/>
          </svg>
        </div>
        <div className="bg-white border border-[#e9eae6] rounded-2xl rounded-tl-sm px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          {activeToolCalls.length > 0 ? (
            <div className="min-w-[220px]">
              {activeToolCalls.map((tc, i) => (
                <ToolCallCard key={i} tc={tc} cardKey={`live-${i}`} live />
              ))}
            </div>
          ) : streamingText ? (
            <div className="text-[13.5px] leading-relaxed text-[#1a1a1a] max-w-[500px]">
              {renderMarkdown(streamingText)}
              <span className="inline-block w-2 h-4 bg-[#6366f1] ml-0.5 animate-pulse rounded-sm" />
            </div>
          ) : (
            <div className="flex gap-1.5 items-center h-5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#9a9a98] animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[#9a9a98] animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[#9a9a98] animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
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

      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />

        {/* Main chat panel */}
        <div className="flex flex-1 min-w-0 gap-2 h-full">

          {/* Conversation history sidebar */}
          <div className="w-[220px] flex-shrink-0 bg-[#fbfbf9] rounded-[12px] border border-[#e9eae6] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-[#e9eae6] flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#1a1a1a]">Conversaciones</span>
              <button
                onClick={newConversation}
                title="Nueva conversación"
                className="w-6 h-6 rounded-md hover:bg-[#e9eae6] flex items-center justify-center text-[#646462] transition-colors"
              >
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {loadingHistory ? (
                <div className="px-3 py-2 text-[12px] text-[#9a9a98]">Cargando…</div>
              ) : conversations.length === 0 ? (
                <div className="px-3 py-4 text-[12px] text-[#9a9a98] text-center">Sin conversaciones</div>
              ) : (
                conversations.map(c => (
                  <div
                    key={c.id}
                    onClick={() => openConversation(c.id)}
                    className={`group flex items-start gap-1 px-3 py-2 cursor-pointer hover:bg-[#f3f3f1] transition-colors ${
                      activeConversationId === c.id ? 'bg-[#f0f0ef]' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-[#1a1a1a] truncate">{c.title || 'Sin título'}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-[11px] text-[#9a9a98]">{c.messageCount ?? c.message_count ?? 0} msgs</p>
                        {c.updatedAt || c.updated_at ? (
                          <p className="text-[10px] text-[#b4b4b0]">{relativeTime(c.updatedAt ?? c.updated_at)}</p>
                        ) : null}
                      </div>
                    </div>
                    <button
                      onClick={e => deleteConv(c.id, e)}
                      className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center hover:bg-[#e9eae6] text-[#9a9a98] hover:text-[#ef4444] transition-all flex-shrink-0 mt-0.5"
                      title="Eliminar"
                    >
                      <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current">
                        <path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5L11 4" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Active chat area */}
          <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">

            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-3 border-b border-[#e9eae6] flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-white">
                  <path d="M8 1l1.6 4.4H14l-3.6 2.6 1.4 4.4L8 9.8l-3.8 2.6 1.4-4.4L2 5.4h4.4L8 1z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-[#1a1a1a]">Max</p>
                <p className="text-[11px] text-[#9a9a98]">Asistente IA · CRM-AI</p>
              </div>

              {/* Mode badge */}
              <div className="relative">
                <button
                  onClick={() => setShowModeDropdown(v => !v)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all hover:opacity-80"
                  style={currentMode ? { background: MODE_CONFIG[currentMode].color + '18', borderColor: MODE_CONFIG[currentMode].color + '50', color: MODE_CONFIG[currentMode].color } : { background: '#f3f3f1', borderColor: '#e9eae6', color: '#9a9a98' }}
                >
                  <span>{currentMode ? MODE_CONFIG[currentMode].icon : '🤖'}</span>
                  <span>{currentMode ? MODE_CONFIG[currentMode].label : 'Modo'}</span>
                  <svg viewBox="0 0 16 16" className="w-2.5 h-2.5 fill-current opacity-60"><path d="M4 6l4 4 4-4z"/></svg>
                </button>
                {showModeDropdown && (
                  <div className="absolute top-full right-0 mt-1 w-[220px] bg-white border border-[#e9eae6] rounded-xl shadow-lg z-20 overflow-hidden py-1">
                    {(Object.entries(MODE_CONFIG) as [CrmAgentMode, typeof MODE_CONFIG[CrmAgentMode]][]).map(([key, cfg]) => (
                      <button
                        key={key}
                        onClick={() => selectMode(key)}
                        className={`flex items-center gap-2.5 w-full px-3 py-2 hover:bg-[#f3f3f1] transition-colors text-left ${currentMode === key ? 'bg-[#f3f3f1]' : ''}`}
                      >
                        <span className="text-[16px] flex-shrink-0">{cfg.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12.5px] font-semibold" style={{ color: cfg.color }}>{cfg.label}</p>
                          <p className="text-[11px] text-[#9a9a98] truncate">{cfg.description}</p>
                        </div>
                        {currentMode === key && <span className="text-[#6366f1] text-[11px]">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Memory indicator */}
              {memoryCount > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#fdf4ff] border border-[#e9d5ff] rounded-full" title={`${memoryCount} hechos en memoria`}>
                  <span className="text-[11px]">🧠</span>
                  <span className="text-[11px] text-[#7c3aed] font-medium">{memoryCount}</span>
                </div>
              )}

              {/* Online badge */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#f0fdf4] border border-[#bbf7d0] rounded-full flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
                <span className="text-[11px] text-[#059669] font-medium">Online</span>
              </div>

              {activeConversationId && (
                <button
                  onClick={newConversation}
                  className="ml-1 px-3 py-1.5 text-[12px] font-medium text-[#646462] border border-[#e9eae6] rounded-lg hover:bg-[#f3f3f1] transition-colors flex-shrink-0"
                >
                  Nuevo
                </button>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4" onClick={() => setShowModeDropdown(false)}>
              {messages.length === 0 && !streaming ? (
                <WelcomeScreen />
              ) : (
                <>
                  {messages.map(m => <MessageBubble key={m.id} msg={m} />)}
                  {streaming && <TypingIndicator />}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input area */}
            <div className="flex-shrink-0 border-t border-[#e9eae6] px-4 pt-3 pb-2">
              {/* Mode selector bar */}
              <div className="flex gap-1 mb-2 overflow-x-auto pb-0.5">
                {(Object.entries(MODE_CONFIG) as [CrmAgentMode, typeof MODE_CONFIG[CrmAgentMode]][]).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => { setCurrentMode(currentMode === key ? null : key); }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium transition-all whitespace-nowrap flex-shrink-0 border"
                    style={currentMode === key
                      ? { background: cfg.color, color: '#fff', borderColor: cfg.color }
                      : { background: 'transparent', color: '#9a9a98', borderColor: '#e9eae6' }}
                  >
                    <span>{cfg.icon}</span>
                    <span>{cfg.label}</span>
                  </button>
                ))}
              </div>

              {/* Suggestion chips */}
              {messages.length === 0 && !streaming && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {(currentMode ? MODE_SUGGESTIONS[currentMode] : DEFAULT_SUGGESTIONS).slice(0, 3).map((s, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(s)}
                      className="px-3 py-1 text-[11.5px] text-[#646462] border border-[#e9eae6] rounded-full hover:bg-[#f3f3f1] hover:border-[#6366f1]/30 transition-all truncate max-w-[200px]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {/* Slash command autocomplete */}
              <div className="relative">
                {showSlashMenu && (
                  <div className="absolute bottom-full left-0 mb-1 w-full bg-white border border-[#e9eae6] rounded-xl shadow-lg z-20 overflow-hidden py-1">
                    {SLASH_COMMANDS.filter(sc => sc.cmd.startsWith(input) || input === '/').map((sc, i) => (
                      <button
                        key={i}
                        onClick={() => { setInput(sc.cmd); inputRef.current?.focus(); }}
                        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-[#f3f3f1] transition-colors text-left"
                      >
                        <code className="text-[12px] font-mono font-semibold text-[#6366f1] min-w-[120px]">{sc.cmd.trim()}</code>
                        <span className="text-[11.5px] text-[#9a9a98]">{sc.hint}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder={pendingApproval ? 'Esperando aprobación…' : 'Pregunta a Max sobre tu CRM… (/ para comandos)'}
                    rows={1}
                    className="flex-1 resize-none border border-[#e9eae6] rounded-xl px-3.5 py-2.5 text-[13.5px] text-[#1a1a1a] placeholder:text-[#b4b4b0] focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20 focus:border-[#6366f1]/50 transition-all leading-relaxed max-h-32 overflow-y-auto"
                    style={{ minHeight: '42px' }}
                    disabled={streaming || pendingApproval}
                  />
                  <button
                    onClick={() => streaming ? abortRef.current?.abort() : sendMessage()}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                      streaming
                        ? 'bg-[#ef4444] hover:bg-[#dc2626] text-white'
                        : (input.trim() && !pendingApproval)
                          ? 'bg-[#1a1a1a] hover:bg-[#333] text-white'
                          : 'bg-[#e9eae6] text-[#9a9a98] cursor-default'
                    }`}
                    disabled={(!input.trim() && !streaming) || pendingApproval}
                  >
                    {streaming ? (
                      <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current">
                        <rect x="4" y="4" width="8" height="8" rx="1"/>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current">
                        <path d="M2 14L8 2l6 12-6-3-6 3z"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-[#b4b4b0] mt-1.5 text-center">
                Max puede cometer errores. Verifica la información importante.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
