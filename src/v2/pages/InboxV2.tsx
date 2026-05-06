// InboxV2 — first migration. Combines new prototype UI with real backend data.
// ─────────────────────────────────────────────────────────────────────────────
// What works (this iteration):
//   • Real conversation list from casesApi.list()
//   • Tab filtering (CaseTab: unassigned / assigned / waiting / high_risk)
//   • Select conversation → detail panel via casesApi.inboxView()
//   • Reply (casesApi.reply) and Internal note (casesApi.addInternalNote)
//   • Resolve (casesApi.resolve) and Snooze (casesApi.updateStatus)
//   • Merge cases modal (casesApi.merge)
//   • Filters panel (status / priority / risk / search)
//   • Latest AI draft hydration + draft_reply_id handoff on reply
//   • Sidebar with collapsible groups (Fin para servicio, Inbox para el equipo,
//     Compañeros de equipo, Vistas) — same UI pattern as Prototype.tsx
//   • Right pane with Detalles tab (case context, channel, contact, related)
//   • Copilot AI tab (aiApi.copilot) — chat with AI about the active case
//
// Migrated composer utilities:
//   • Latest AI draft hydration, local optimistic replies, internal notes,
//     attachment previews, emoji picker, and basic formatting controls.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useRef, useEffect } from 'react';
import type { Conversation, Channel, CaseTab, Message } from '../../types';
import { casesApi, aiApi } from '../../api/client';
import { useApi } from '../../api/hooks';

type CopilotMessage = { id: string; role: 'user' | 'assistant'; content: string; time: string };
type Attachment = { id: string; name: string; size: number; type: string; dataUrl?: string; file: File };

const COMMON_EMOJIS = ['😊','😄','😂','🤣','😍','🥰','😎','🤔','😅','😬','🙄','😭','😤','😡','🤯','🤗','👍','👎','🙏','✅','❌','⚠️','🔥','💡','❤️','💙','💚','💛','🎉','🎊','📎','🖇️','📷','📧','⏰','🔔','💬','📝','🔗','✍️','📌','🚀','⭐','💎','🏆'];

// ── Helpers (same patterns as original Inbox.tsx) ────────────────────────────
const formatTime = (v?: string | null) =>
  v ? new Date(v).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '--:--';

const displayTime = (v?: string | null) => {
  if (!v) return '--:--';
  const parsed = new Date(v);
  return Number.isNaN(parsed.getTime()) ? v : formatTime(v);
};

const formatRelativeTime = (v?: string | null) => {
  if (!v) return '-';
  const m = Math.max(1, Math.round((Date.now() - new Date(v).getTime()) / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const channelInitial = (ch?: string) => (ch || 'C').slice(0, 1).toUpperCase();
const channelColor = (ch?: string) => {
  switch (ch) {
    case 'web_chat':  return '#9ec5fa';
    case 'email':     return '#85e0d9';
    case 'whatsapp':  return '#61d65c';
    case 'sms':
    case 'messenger': return '#85e0d9';
    case 'instagram': return '#f0a3d6';
    default:          return '#cccccc';
  }
};

const titleCase = (value?: string | null) =>
  value ? value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()) : 'N/A';

function asArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function deriveCaseTab(c: any): CaseTab {
  const risk = String(c.riskLevel || c.risk_level || '').toLowerCase();
  const approval = String(c.approvalState || c.approval_state || c.approvalStatus || c.approval_status || '').toLowerCase();
  const status = String(c.status || '').toLowerCase();
  if (risk === 'high' || risk === 'critical') return 'high_risk';
  if (approval.includes('pending') || status === 'pending_approval' || status === 'waiting_approval') return 'waiting';
  return c.assignedUserId || c.assigned_user_id || c.assignedUserName || c.assignee ? 'assigned' : 'unassigned';
}

function normalizeMessage(msg: any): Message {
  const type =
    msg.type === 'agent' ? 'agent' :
    msg.type === 'internal' ? 'internal' :
    msg.type === 'system' ? 'system' :
    msg.direction === 'outbound' ? 'agent' :
    'customer';

  return {
    id: msg.id || `msg-${Date.now()}-${Math.random()}`,
    type,
    sender: msg.senderName || msg.sender_name || (msg.direction === 'outbound' ? 'Agent' : 'Customer'),
    content: msg.content || '',
    time: formatTime(msg.sentAt || msg.sent_at || msg.createdAt || msg.created_at),
    status: msg.deliveryStatus || msg.delivery_status || undefined,
  };
}

// ── Sidebar (left, 236px) — collapsible groups, matches prototype InboxSidebar
function InboxSidebar({ activeTab, onTabChange }: { activeTab: CaseTab; onTabChange: (t: CaseTab) => void }) {
  const [openFin, setOpenFin] = useState(true);
  const [openTeamInbox, setOpenTeamInbox] = useState(false);
  const [openTeammates, setOpenTeammates] = useState(false);
  const [openVistas, setOpenVistas] = useState(true);

  const Chev = ({ open }: { open: boolean }) => (
    <svg viewBox="0 0 16 16" className={`w-3.5 h-3.5 fill-[#646462] transition-transform ${open ? 'rotate-90' : ''}`}>
      <path d="M6 4l4 4-4 4z"/>
    </svg>
  );
  const Plus = () => (
    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
  );
  const itemCls = (active: boolean) =>
    `relative flex items-center gap-2 h-8 pl-3 pr-3 py-1 rounded-lg cursor-pointer text-[13px] w-full text-left transition-colors ${
      active ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]' : 'hover:bg-[#e9eae6]/40 text-[#1a1a1a]'
    }`;

  return (
    <div className="flex flex-col h-full w-[236px] bg-[#f8f8f7] border-r border-[#e9eae6] flex-shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 h-16 flex-shrink-0">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Inbox</span>
        <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#e9eae6]"><Plus /></button>
      </div>

      <div className="flex-1 overflow-y-auto pl-3 pr-0 pb-4">
        <div className="flex flex-col gap-0.5">
          {/* Tab buttons map onto CaseTab type */}
          <button onClick={() => onTabChange('unassigned')} className={itemCls(activeTab === 'unassigned')}>
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><circle cx="8" cy="6" r="2.5"/><path d="M3 13c.5-2 2.5-3.2 5-3.2s4.5 1.2 5 3.2v.5H3V13z"/></svg>
            <span className="flex-1">Sin asignar</span>
          </button>
          <button onClick={() => onTabChange('assigned')} className={itemCls(activeTab === 'assigned')}>
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M2 4a1 1 0 011-1h10a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"/></svg>
            <span className="flex-1">Tu bandeja de entrada</span>
          </button>
          <button onClick={() => onTabChange('waiting')} className={itemCls(activeTab === 'waiting')}>
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8.75 4v3.69l2.6 1.5-.75 1.3L7.25 8.5V4h1.5z"/></svg>
            <span className="flex-1">En espera</span>
          </button>
          <button onClick={() => onTabChange('high_risk')} className={itemCls(activeTab === 'high_risk')}>
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#fa7938]"><path d="M8 1l7 13H1z"/></svg>
            <span className="flex-1">Alto riesgo</span>
          </button>
        </div>

        {/* Fin para servicio — collapsible */}
        <div className="mt-3">
          <button onClick={() => setOpenFin(o => !o)} className="w-full flex items-center justify-between h-8 px-3 cursor-pointer hover:bg-[#ededea]/40 rounded-[6px]">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Fin para servicio</span>
            <span className="flex items-center gap-1">
              <span className="w-6 h-6 flex items-center justify-center rounded-full bg-white shadow-[0px_1px_2px_rgba(20,20,20,0.15)]"><Plus /></span>
              <Chev open={openFin} />
            </span>
          </button>
        </div>

        {/* Inbox para el equipo */}
        <div className="mt-1">
          <button onClick={() => setOpenTeamInbox(o => !o)} className="w-full flex items-center justify-between h-8 px-3 cursor-pointer hover:bg-[#ededea]/40 rounded-[6px]">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Inbox para el equipo</span>
            <span className="flex items-center gap-1">
              <span className="w-6 h-6 flex items-center justify-center rounded-full bg-white shadow-[0px_1px_2px_rgba(20,20,20,0.15)]"><Plus /></span>
              <Chev open={openTeamInbox} />
            </span>
          </button>
        </div>

        {/* Compañeros de equipo */}
        <div className="mt-1">
          <button onClick={() => setOpenTeammates(o => !o)} className="w-full flex items-center justify-between h-8 px-3 cursor-pointer hover:bg-[#ededea]/40 rounded-[6px]">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Compañeros de equipo</span>
            <span className="flex items-center gap-1">
              <span className="w-6 h-6 flex items-center justify-center rounded-full bg-white shadow-[0px_1px_2px_rgba(20,20,20,0.15)]"><Plus /></span>
              <Chev open={openTeammates} />
            </span>
          </button>
        </div>

        {/* Vistas */}
        <div className="mt-1">
          <button onClick={() => setOpenVistas(o => !o)} className="w-full flex items-center justify-between h-8 px-3 cursor-pointer hover:bg-[#ededea]/40 rounded-[6px]">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Vistas</span>
            <Chev open={openVistas} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Conversation list (middle pane, 271px) — real data, click to select + filters
function ConversationList({ conversations, selectedId, onSelect, filters, onFilterChange, onClearFilters }: {
  conversations: Conversation[];
  selectedId: string;
  onSelect: (id: string) => void;
  filters: { status: string; priority: string; risk: string; q: string };
  onFilterChange: (k: 'status' | 'priority' | 'risk' | 'q', v: string) => void;
  onClearFilters: () => void;
}) {
  const [showFilters, setShowFilters] = useState(false);
  const hasActiveFilters = !!(filters.status || filters.priority || filters.risk || filters.q);
  return (
    <div className="flex flex-col h-full w-[271px] border-l border-[#e9eae6] bg-[#f8f8f7] flex-shrink-0">
      <div className="flex items-center justify-between px-3 py-3 h-16 sticky top-0">
        <span className="text-[16px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">{conversations.length} conversaciones</span>
        <button
          onClick={() => setShowFilters(s => !s)}
          className={`w-8 h-8 rounded-full flex items-center justify-center ${
            hasActiveFilters ? 'bg-[#1a1a1a] text-white' : 'bg-white border border-[#e9eae6] hover:bg-[#ededea]'
          }`}
          title="Filtros"
        >
          <svg viewBox="0 0 16 16" className={`w-4 h-4 ${hasActiveFilters ? 'fill-white' : 'fill-[#1a1a1a]'}`}><path d="M2 3h12l-4.5 5v4l-3 1.5V8z"/></svg>
        </button>
      </div>

      {showFilters && (
        <div className="bg-white border-t border-b border-[#e9eae6] px-3 py-3 flex flex-col gap-2 flex-shrink-0">
          <input
            value={filters.q}
            onChange={e => onFilterChange('q', e.target.value)}
            placeholder="Buscar…"
            className="w-full h-8 rounded-lg border border-[#e9eae6] px-3 text-[12.5px] text-[#1a1a1a] placeholder:text-[#646462] focus:outline-none focus:border-[#1a1a1a]"
          />
          <select
            value={filters.status}
            onChange={e => onFilterChange('status', e.target.value)}
            className="w-full h-8 rounded-lg border border-[#e9eae6] px-2 text-[12.5px] text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]"
          >
            <option value="">Estado: cualquiera</option>
            <option value="open">Abierto</option>
            <option value="snoozed">Pospuesto</option>
            <option value="resolved">Resuelto</option>
            <option value="escalated">Escalado</option>
          </select>
          <select
            value={filters.priority}
            onChange={e => onFilterChange('priority', e.target.value)}
            className="w-full h-8 rounded-lg border border-[#e9eae6] px-2 text-[12.5px] text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]"
          >
            <option value="">Prioridad: cualquiera</option>
            <option value="high">Alta</option>
            <option value="normal">Normal</option>
            <option value="low">Baja</option>
          </select>
          <select
            value={filters.risk}
            onChange={e => onFilterChange('risk', e.target.value)}
            className="w-full h-8 rounded-lg border border-[#e9eae6] px-2 text-[12.5px] text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]"
          >
            <option value="">Riesgo: cualquiera</option>
            <option value="high">Alto</option>
            <option value="medium">Medio</option>
            <option value="low">Bajo</option>
          </select>
          {hasActiveFilters && (
            <button
              onClick={onClearFilters}
              className="text-[12px] font-semibold text-[#646462] hover:text-[#1a1a1a] underline self-start mt-1"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-3 pb-16 flex flex-col gap-0">
        {conversations.length === 0 && (
          <div className="text-center text-[13px] text-[#646462] py-8">No hay conversaciones</div>
        )}
        {conversations.map((c, i) => {
          const isSelected = c.id === selectedId;
          return (
            <div key={c.id}>
              {i > 0 && <div className="flex justify-center py-0.5"><div className="w-[222px] h-[1px] bg-[#e9eae6]" /></div>}
              <button
                onClick={() => onSelect(c.id)}
                className={`relative flex items-start gap-2 px-3 py-3 rounded-xl cursor-pointer w-full text-left ${
                  isSelected ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]' : 'hover:bg-white/60'
                }`}
              >
                <div className="w-6 h-6 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: channelColor(c.channel as any) }}>
                  <span className="text-[12px] font-semibold text-[#1a1a1a]">{channelInitial(c.contactName)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[13px] truncate ${isSelected ? 'font-semibold text-[#1a1a1a]' : 'font-bold text-[#1a1a1a]'}`}>
                      {c.contactName || 'Sin nombre'}
                    </span>
                    <span className="text-[11px] text-[#646462] flex-shrink-0 ml-2">{formatRelativeTime(c.time)}</span>
                  </div>
                  <p className="text-[12.5px] text-[#646462] truncate">{c.lastMessage || ''}</p>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Merge cases modal
function MergeModal({ sourceId, onClose, onMerged, onAction }: {
  sourceId: string;
  onClose: () => void;
  onMerged: () => void;
  onAction: (msg: string, type: 'success' | 'error') => void;
}) {
  const [targetId, setTargetId] = useState('');
  const [merging, setMerging] = useState(false);

  async function doMerge() {
    const id = targetId.trim();
    if (!id || merging) return;
    setMerging(true);
    try {
      // casesApi.merge(targetId, sourceId) — current case (source) merges INTO target
      await casesApi.merge(id, sourceId);
      onAction('Casos fusionados', 'success');
      onMerged();
      onClose();
    } catch (err: any) {
      onAction(err?.message || 'Error al fusionar', 'error');
    } finally {
      setMerging(false);
    }
  }

  return (
    <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-[16px] border border-[#e9eae6] shadow-xl p-6 w-[420px]" onClick={e => e.stopPropagation()}>
        <h2 className="text-[18px] font-semibold tracking-[-0.4px] text-[#1a1a1a] mb-2">Fusionar caso</h2>
        <p className="text-[13px] text-[#646462] mb-4 leading-[18px]">
          El caso actual (<span className="font-mono">{sourceId}</span>) se fusionará en el caso destino. Los mensajes y el historial se moverán al destino.
        </p>
        <label className="block text-[12px] font-semibold text-[#1a1a1a] mb-1.5">ID del caso destino</label>
        <input
          value={targetId}
          onChange={e => setTargetId(e.target.value)}
          placeholder="case_xxxxxxxx"
          className="w-full h-9 rounded-lg border border-[#e9eae6] px-3 text-[13px] text-[#1a1a1a] placeholder:text-[#646462] focus:outline-none focus:border-[#1a1a1a] font-mono"
        />
        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] hover:bg-[#ededea]">Cancelar</button>
          <button
            onClick={doMerge}
            disabled={!targetId.trim() || merging}
            className={`px-3 h-8 rounded-full text-[13px] font-semibold ${
              !targetId.trim() || merging ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed' : 'bg-[#1a1a1a] text-white hover:bg-black'
            }`}
          >
            {merging ? 'Fusionando…' : 'Fusionar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detail pane: messages + composer
function DetailPane({ conv, inboxView, onAction, refreshKey, onRefresh }: {
  conv: Conversation | null;
  inboxView: any;
  onAction: (msg: string, type: 'success' | 'error') => void;
  refreshKey: number;
  onRefresh: () => void;
}) {
  const [composerText, setComposerText] = useState('');
  const [composeMode, setComposeMode] = useState<'reply' | 'internal'>('reply');
  const [submitting, setSubmitting] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [localMessagesByCase, setLocalMessagesByCase] = useState<Record<string, Message[]>>({});
  const submitLockRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Reset composer when conv changes, then hydrate the latest AI draft if the
  // backend generated one for the selected case.
  useEffect(() => {
    setComposeMode('reply');
    setComposerText(inboxView?.latestDraft?.content || '');
  }, [conv?.id, inboxView?.latestDraft?.id, inboxView?.latestDraft?.content]);

  useEffect(() => {
    setAttachments([]);
    setShowEmojiPicker(false);
  }, [conv?.id]);

  useEffect(() => {
    if (!showEmojiPicker) return;
    const handler = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmojiPicker]);

  if (!conv) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#646462] text-[13.5px]">
        Selecciona una conversación
      </div>
    );
  }

  const apiMessages: Message[] = Array.isArray(inboxView?.messages)
    ? inboxView.messages.map(normalizeMessage)
    : conv.messages || [];
  const messages: Message[] = [...apiMessages, ...(localMessagesByCase[conv.id] || [])];

  function handleFilesSelected(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = event => {
        setAttachments(current => [
          ...current,
          {
            id: `att-${Date.now()}-${Math.random()}`,
            name: file.name,
            size: file.size,
            type: file.type,
            dataUrl: file.type.startsWith('image/') ? String(event.target?.result || '') : undefined,
            file,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  }

  function removeAttachment(id: string) {
    setAttachments(current => current.filter(item => item.id !== id));
  }

  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    if (!el) {
      setComposerText(current => current + emoji);
      return;
    }
    const start = el.selectionStart ?? composerText.length;
    const end = el.selectionEnd ?? composerText.length;
    const next = composerText.slice(0, start) + emoji + composerText.slice(end);
    setComposerText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + emoji.length, start + emoji.length);
    });
    setShowEmojiPicker(false);
  }

  function applyFormat(kind: 'bold' | 'italic' | 'link') {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const selected = composerText.slice(start, end);
    let replacement = '';
    if (kind === 'bold') replacement = `**${selected || 'texto en negrita'}**`;
    if (kind === 'italic') replacement = `_${selected || 'texto en cursiva'}_`;
    if (kind === 'link') {
      const url = window.prompt('Introduce URL:', 'https://');
      if (!url) return;
      replacement = `[${selected || 'enlace'}](${url})`;
    }
    const next = composerText.slice(0, start) + replacement + composerText.slice(end);
    setComposerText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + replacement.length, start + replacement.length);
    });
  }

  async function updateCaseStatus(status: string, label: string) {
    if (!conv) return;
    try {
      await casesApi.updateStatus(conv.id, status, `${label} by agent`);
      onAction(`Caso actualizado: ${label}`, 'success');
      onRefresh();
    } catch (err: any) {
      onAction(err?.message || 'Error al actualizar el caso', 'error');
    }
  }

  async function submit() {
    if (submitLockRef.current) return;
    const content = composerText.trim();
    if ((!content && attachments.length === 0) || !conv) return;
    const optimisticId = composeMode === 'internal' ? `local-note-${Date.now()}` : `local-reply-${Date.now()}`;
    const attachmentText = attachments.length
      ? `\n\n${attachments.map(file => `[${file.name} · ${formatFileSize(file.size)}]`).join('\n')}`
      : '';
    const finalContent = `${content}${attachmentText}`.trim();

    submitLockRef.current = true;
    setSubmitting(true);
    setLocalMessagesByCase(current => ({
      ...current,
      [conv.id]: [
        ...(current[conv.id] || []),
        composeMode === 'internal'
          ? { id: optimisticId, type: 'internal', sender: 'Internal Note', content: finalContent, time: formatTime(new Date().toISOString()) }
          : { id: optimisticId, type: 'agent', sender: 'Agent', content: finalContent, time: formatTime(new Date().toISOString()), status: 'sent' },
      ],
    }));
    setComposerText('');
    setAttachments([]);
    try {
      if (composeMode === 'internal') {
        await casesApi.addInternalNote(conv.id, finalContent);
        onAction('Nota interna añadida', 'success');
      } else {
        await casesApi.reply(conv.id, finalContent, inboxView?.latestDraft?.id);
        onAction('Respuesta enviada', 'success');
      }
      onRefresh();
    } catch (err: any) {
      onAction(err?.message || 'Error al enviar', 'error');
      setLocalMessagesByCase(current => ({
        ...current,
        [conv.id]: (current[conv.id] || []).filter(message => message.id !== optimisticId),
      }));
      setComposerText(content);
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }

  async function resolveCase() {
    if (!conv) return;
    try {
      await casesApi.resolve(conv.id);
      onAction('Caso resuelto', 'success');
      onRefresh();
    } catch (err: any) {
      onAction(err?.message || 'Error al resolver', 'error');
    }
  }

  async function snoozeCase() {
    if (!conv) return;
    try {
      await casesApi.updateStatus(conv.id, 'snoozed', 'Snoozed by agent');
      onAction('Caso pospuesto', 'success');
      onRefresh();
    } catch (err: any) {
      onAction(err?.message || 'Error al posponer', 'error');
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 h-16 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: channelColor(conv.channel as any) }}>
            <span className="text-[13px] font-semibold text-[#1a1a1a]">{channelInitial(conv.contactName)}</span>
          </div>
          <div>
            <p className="text-[15px] font-semibold text-[#1a1a1a] leading-tight">{conv.contactName || 'Sin nombre'}</p>
            <p className="text-[12px] text-[#646462] capitalize">{(conv.channel || '').replace(/_/g, ' ')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 relative">
          <button onClick={snoozeCase} className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] hover:bg-[#ededea]">Posponer</button>
          <button onClick={resolveCase} className="px-3 h-8 rounded-full text-[13px] font-semibold text-white bg-[#1a1a1a] hover:bg-black">Resolver</button>
          <button
            onClick={() => setShowMoreMenu(s => !s)}
            className="w-8 h-8 rounded-full bg-[#f8f8f7] hover:bg-[#ededea] flex items-center justify-center"
            title="Más"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><circle cx="3" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="13" cy="8" r="1.4"/></svg>
          </button>
          {showMoreMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
              <div className="absolute right-0 top-10 z-50 w-[200px] bg-white border border-[#e9eae6] rounded-[12px] shadow-lg py-1 overflow-hidden">
                {[
                  { label: 'Asignar a mí', status: 'open' },
                  { label: 'Marcar en espera', status: 'waiting' },
                  { label: 'Escalar', status: 'escalated' },
                ].map(action => (
                  <button
                    key={action.status}
                    onClick={() => {
                      setShowMoreMenu(false);
                      void updateCaseStatus(action.status, action.label);
                    }}
                    className="w-full px-3 py-2 text-left text-[13px] text-[#1a1a1a] hover:bg-[#f8f8f7] flex items-center gap-2"
                  >
                    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M3 7h10v2H3z"/></svg>
                    {action.label}
                  </button>
                ))}
                <button
                  onClick={() => { setShowMoreMenu(false); setShowMergeModal(true); }}
                  className="w-full px-3 py-2 text-left text-[13px] text-[#1a1a1a] hover:bg-[#f8f8f7] flex items-center gap-2"
                >
                  <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M3 3l5 4 5-4M3 9h10M3 13h10"/></svg>
                  Fusionar con otro caso
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {showMergeModal && conv && (
        <MergeModal
          sourceId={conv.id}
          onClose={() => setShowMergeModal(false)}
          onMerged={onRefresh}
          onAction={onAction}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3" key={`${conv.id}-${refreshKey}`}>
        {messages.length === 0 && (
          <div className="text-center text-[13px] text-[#646462] py-8">No hay mensajes</div>
        )}
        {messages.map((m, i) => {
          const isUser = m.type === 'customer';
          const isInternal = m.type === 'internal';
          if (isInternal) {
            return (
              <div key={m.id || i} className="self-stretch bg-[#fff7ed] border border-[#fed7aa] rounded-xl px-4 py-3">
                <p className="text-[11px] font-semibold text-[#9a3412] mb-1 uppercase tracking-wider">Nota interna · {m.sender || ''}</p>
                <p className="text-[13.5px] text-[#1a1a1a] whitespace-pre-wrap">{m.content}</p>
                <p className="text-[11px] text-[#9a3412] mt-2 text-right">{displayTime(m.time)}</p>
              </div>
            );
          }
          return (
            <div key={m.id || i} className={`flex ${isUser ? 'justify-end' : 'items-end gap-2'} mb-1`}>
              {!isUser && (
                <div className="w-6 h-6 rounded-xl bg-[#9ec5fa] flex items-center justify-center flex-shrink-0">
                  <span className="text-[12px] font-semibold text-[#1a1a1a]">{channelInitial(m.sender || 'A')}</span>
                </div>
              )}
              <div className={`max-w-[420px] px-4 py-3 rounded-xl text-[13.5px] leading-[20px] ${
                isUser ? 'bg-[#1a1a1a] text-white rounded-br-sm' : 'bg-[#f8f8f7] text-[#1a1a1a] rounded-bl-sm'
              }`}>
                {m.sender && !isUser && <p className="text-[11px] font-semibold text-[#646462] mb-1">{m.sender}</p>}
                <p className="whitespace-pre-wrap">{m.content}</p>
                <p className={`text-[10px] mt-2 text-right ${isUser ? 'text-white/70' : 'text-[#646462]'}`}>{displayTime(m.time)}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div className="border-t border-[#e9eae6] bg-white flex-shrink-0">
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={event => handleFilesSelected(event.target.files)} />
        <input ref={imageInputRef} type="file" multiple accept="image/*" className="hidden" onChange={event => handleFilesSelected(event.target.files)} />
        <div className="flex items-center gap-2 px-6 pt-3">
          <button
            onClick={() => setComposeMode('reply')}
            className={`px-3 h-8 rounded-full text-[13px] font-semibold transition-colors ${
              composeMode === 'reply' ? 'bg-[#1a1a1a] text-white' : 'text-[#646462] hover:bg-[#f8f8f7]'
            }`}
          >
            Responder
          </button>
          <button
            onClick={() => setComposeMode('internal')}
            className={`px-3 h-8 rounded-full text-[13px] font-semibold transition-colors ${
              composeMode === 'internal' ? 'bg-[#9a3412] text-white' : 'text-[#646462] hover:bg-[#f8f8f7]'
            }`}
          >
            Nota interna
          </button>
          {inboxView?.latestDraft?.content && composeMode === 'reply' && (
            <span className="text-[12px] text-[#646462]">Borrador AI cargado</span>
          )}
          <div className="ml-auto flex items-center gap-1 relative" ref={emojiPickerRef}>
            <button onClick={() => applyFormat('bold')} className="w-7 h-7 rounded-md hover:bg-[#f8f8f7] text-[13px] font-bold text-[#1a1a1a]" title="Negrita">B</button>
            <button onClick={() => applyFormat('italic')} className="w-7 h-7 rounded-md hover:bg-[#f8f8f7] text-[13px] italic text-[#1a1a1a]" title="Cursiva">I</button>
            <button onClick={() => applyFormat('link')} className="w-7 h-7 rounded-md hover:bg-[#f8f8f7] text-[13px] text-[#1a1a1a]" title="Enlace">🔗</button>
            <button onClick={() => setShowEmojiPicker(current => !current)} className="w-7 h-7 rounded-md hover:bg-[#f8f8f7] text-[13px]" title="Emoji">😊</button>
            {showEmojiPicker && (
              <div className="absolute right-0 bottom-8 z-50 w-[244px] bg-white border border-[#e9eae6] rounded-[12px] shadow-lg p-3">
                <p className="text-[10px] uppercase tracking-wider text-[#646462] font-semibold mb-2">Emojis frecuentes</p>
                <div className="grid grid-cols-8 gap-1">
                  {COMMON_EMOJIS.map(emoji => (
                    <button key={emoji} onClick={() => insertEmoji(emoji)} className="w-6 h-6 rounded hover:bg-[#f8f8f7] text-[15px]">{emoji}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="px-6 py-3 flex flex-col gap-2">
          <textarea
            ref={textareaRef}
            value={composerText}
            onChange={e => setComposerText(e.target.value)}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
            }}
            placeholder={composeMode === 'reply' ? 'Escribe una respuesta…' : 'Añade una nota interna (sólo equipo)'}
            className="w-full min-h-[80px] resize-y rounded-xl border border-[#e9eae6] px-3 py-2 text-[13.5px] text-[#1a1a1a] placeholder:text-[#646462] focus:outline-none focus:border-[#1a1a1a]"
          />
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map(item => (
                <div key={item.id} className="flex items-center gap-1.5 max-w-[220px] rounded-lg bg-[#f8f8f7] border border-[#e9eae6] px-2 py-1 text-[12px] text-[#1a1a1a]">
                  {item.dataUrl ? <img src={item.dataUrl} alt={item.name} className="w-5 h-5 rounded object-cover" /> : <span>📎</span>}
                  <span className="truncate">{item.name}</span>
                  <span className="text-[#646462] flex-shrink-0">{formatFileSize(item.size)}</span>
                  <button onClick={() => removeAttachment(item.id)} className="text-[#646462] hover:text-red-600">×</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button onClick={() => fileInputRef.current?.click()} className="w-8 h-8 rounded-full hover:bg-[#f8f8f7] text-[14px]" title="Adjuntar archivo">📎</button>
              <button onClick={() => imageInputRef.current?.click()} className="w-8 h-8 rounded-full hover:bg-[#f8f8f7] text-[14px]" title="Adjuntar imagen">🖼️</button>
              <p className="text-[11px] text-[#646462] ml-1">⌘ + Enter para enviar</p>
            </div>
            <button
              onClick={submit}
              disabled={(!composerText.trim() && attachments.length === 0) || submitting}
              className={`px-4 h-9 rounded-full text-[13px] font-semibold ${
                (!composerText.trim() && attachments.length === 0) || submitting
                  ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed'
                  : composeMode === 'internal'
                    ? 'bg-[#9a3412] text-white hover:bg-[#7a2812]'
                    : 'bg-[#1a1a1a] text-white hover:bg-black'
              }`}
            >
              {submitting ? 'Enviando…' : composeMode === 'internal' ? 'Añadir nota' : 'Enviar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Right pane: Detalles + Copilot tabs (Inbox sidebar pattern)
function RightPane({ conv, inboxView, copilotMessages, onSendCopilot, copilotLoading, onClose }: {
  conv: Conversation | null;
  inboxView: any;
  copilotMessages: CopilotMessage[];
  onSendCopilot: (q: string) => void;
  copilotLoading: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'details' | 'copilot'>('copilot');
  const [copilotInput, setCopilotInput] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [copilotMessages.length]);

  if (!conv) return null;

  const caseState = inboxView?.state || {};
  const orderId = caseState?.related?.orders?.[0]?.externalOrderId || caseState?.identifiers?.orderIds?.[0] || conv.orderId || caseState.orderId || caseState.order_id;
  const company = conv.company || caseState.company;
  const riskLevel = conv.riskLevel || caseState.riskLevel || caseState.risk_level;
  const firstOrder = caseState?.related?.orders?.[0];
  const firstPayment = caseState?.related?.payments?.[0];
  const firstReturn = caseState?.related?.returns?.[0];
  const operationalLinks = [
    {
      label: 'Order Management System (OMS)',
      href: firstOrder?.externalOrderId ? `https://admin.shopify.com/store/demo/orders/${encodeURIComponent(firstOrder.externalOrderId)}` : '#',
      visible: Boolean(firstOrder || orderId),
    },
    {
      label: 'Payment Gateway (PSP)',
      href: firstPayment?.externalPaymentId ? `https://dashboard.stripe.com/test/payments/${encodeURIComponent(firstPayment.externalPaymentId)}` : '#',
      visible: Boolean(firstPayment || conv.paymentStatus),
    },
    {
      label: 'Carrier Tracking Portal',
      href: firstOrder?.trackingUrl || '#',
      visible: Boolean(firstOrder?.trackingNumber || firstOrder?.trackingUrl || conv.fulfillmentStatus),
    },
    {
      label: 'Return Record (RMS)',
      href: firstReturn?.externalReturnId ? `https://returns.example.local/${encodeURIComponent(firstReturn.externalReturnId)}` : '#',
      visible: Boolean(firstReturn || conv.refundStatus),
    },
    {
      label: 'Warehouse (WMS) Ticket',
      href: firstOrder?.externalOrderId ? `https://wms.example.local/orders/${encodeURIComponent(firstOrder.externalOrderId)}` : '#',
      visible: Boolean(firstOrder || conv.fulfillmentStatus),
    },
  ].filter(link => link.visible);
  const visibleCopilotMessages = sortOrder === 'desc' ? [...copilotMessages].reverse() : copilotMessages;

  function send() {
    const q = copilotInput.trim();
    if (!q || copilotLoading) return;
    onSendCopilot(q);
    setCopilotInput('');
  }

  return (
    <div className="w-[340px] flex-shrink-0 border-l border-[#e9eae6] bg-white flex flex-col h-full overflow-hidden">
      {/* Tabs header */}
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
        <button
          onClick={onClose}
          className="ml-auto w-8 h-8 rounded-full hover:bg-[#f8f8f7] text-[#646462] flex items-center justify-center"
          title="Cerrar panel"
        >
          ×
        </button>
      </div>

      {tab === 'details' && (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          <section className="rounded-[14px] border border-[#e9eae6] bg-[#f8f8f7] p-3">
            <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-3">Atributos del caso</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Case ID', conv.caseId || conv.id],
                ['Order ID', orderId || 'N/A'],
                ['Assignee', conv.assignee || 'Unassigned'],
                ['Team', conv.assignedTeam || 'Support'],
                ['Type', conv.caseType || 'General'],
                ['Priority', conv.priority || 'normal'],
                ['Approval', conv.approvalStatus || 'N/A'],
                ['SLA', `${conv.slaStatus || 'Waiting'} · ${conv.slaTime || 'N/A'}`],
                ['Channel', String(conv.channel || '').replace(/_/g, ' ')],
                ['Company', company || 'N/A'],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-[10px] uppercase tracking-wider text-[#646462] mb-0.5">{label}</p>
                  <p className="text-[12.5px] font-semibold text-[#1a1a1a] break-words">{value}</p>
                </div>
              ))}
            </div>
            {riskLevel && (
              <div className="mt-3">
                <p className="text-[10px] uppercase tracking-wider text-[#646462] mb-1">Riesgo</p>
                <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                  riskLevel === 'high' || riskLevel === 'critical' ? 'bg-red-100 text-red-700' :
                  riskLevel === 'medium' ? 'bg-orange-100 text-orange-700' :
                  'bg-green-100 text-green-700'
                }`}>{riskLevel}</span>
              </div>
            )}
          </section>

          {(conv.context || conv.recommendedNextAction || conv.conflictDetected) && (
            <section className="rounded-[14px] border border-[#e9eae6] bg-white p-3">
              <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-2">Contexto operativo</p>
              {conv.context && <p className="text-[13px] text-[#1a1a1a] leading-[18px]">{conv.context}</p>}
              {conv.recommendedNextAction && <p className="mt-2 text-[12.5px] text-[#646462]"><strong>Siguiente acción:</strong> {conv.recommendedNextAction}</p>}
              {conv.conflictDetected && <p className="mt-2 text-[12.5px] text-[#9a3412]"><strong>Conflicto:</strong> {conv.conflictDetected}</p>}
            </section>
          )}

          <section className="rounded-[14px] border border-[#e9eae6] bg-white p-3">
            <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-2">Enlaces operativos</p>
            <div className="flex flex-col gap-1.5">
              {operationalLinks.length > 0 ? operationalLinks.map(link => (
                <a
                  key={link.label}
                  href={link.href}
                  target={link.href === '#' ? undefined : '_blank'}
                  rel="noreferrer"
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-[12.5px] text-[#1a1a1a] hover:bg-[#f8f8f7]"
                >
                  <span className="truncate">{link.label}</span>
                  <span className="text-[#646462]">↗</span>
                </a>
              )) : (
                <p className="text-[12.5px] text-[#646462] italic">No hay enlaces operativos todavía.</p>
              )}
            </div>
          </section>

          {Array.isArray(conv.relatedCases) && conv.relatedCases.length > 0 && (
            <section className="rounded-[14px] border border-[#e9eae6] bg-white p-3">
              <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-2">Casos relacionados</p>
              <ul className="flex flex-col gap-1.5">
                {conv.relatedCases.map(rc => (
                  <li key={rc.id} className="text-[12.5px] text-[#1a1a1a]">
                    <span className="font-mono text-[#646462]">{rc.id}</span> · {rc.type} · {rc.status}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-[14px] border border-[#e9eae6] bg-white p-3">
            <p className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-2">Notas internas</p>
            <div className="flex flex-col gap-2">
              {Array.isArray(inboxView?.internalNotes) && inboxView.internalNotes.length > 0 ? inboxView.internalNotes.map((note: any) => (
                <div key={note.id} className="rounded-lg bg-[#fff7ed] border border-[#fed7aa] px-3 py-2">
                  <p className="text-[12.5px] text-[#1a1a1a] whitespace-pre-wrap">{note.content}</p>
                  <p className="mt-1 text-[10px] text-[#9a3412]">{note.createdBy || 'Internal Note'} · {formatTime(note.createdAt)}</p>
                </div>
              )) : (
                <p className="text-[12.5px] text-[#646462] italic">No hay notas internas todavía.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {tab === 'copilot' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {copilotMessages.length === 0 && (
              <div className="text-center text-[12.5px] text-[#646462] py-6">
                <div className="text-[24px] mb-2">🤖</div>
                <p className="font-semibold mb-1">Hola, soy Copilot</p>
                <p>Pregúntame cualquier cosa sobre este caso.</p>
              </div>
            )}
            {visibleCopilotMessages.map(m => (
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
                onKeyDown={e => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send();
                }}
                placeholder="Pregunta a Copilot…"
                className="w-full min-h-[60px] resize-y rounded-xl border border-[#e9eae6] px-3 py-2 text-[13px] text-[#1a1a1a] placeholder:text-[#646462] focus:outline-none focus:border-[#1a1a1a]"
              />
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => setSortOrder(current => current === 'asc' ? 'desc' : 'asc')}
                  className="px-3 h-8 rounded-full text-[12.5px] font-semibold text-[#646462] hover:bg-[#f8f8f7]"
                  title={`Orden: ${sortOrder === 'asc' ? 'antiguos primero' : 'recientes primero'}`}
                >
                  {sortOrder === 'asc' ? 'Antiguos primero' : 'Recientes primero'}
                </button>
                <button
                  onClick={send}
                  disabled={!copilotInput.trim() || copilotLoading}
                  className={`px-3 h-8 rounded-full text-[13px] font-semibold ${
                    !copilotInput.trim() || copilotLoading
                      ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed'
                      : 'bg-[#1a1a1a] text-white hover:bg-black'
                  }`}
                >
                  {copilotLoading ? 'Pensando…' : 'Enviar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Map raw API case → Conversation type
function mapApiCase(c: any): Conversation {
  const orderIds = asArray(c.orderIds ?? c.order_ids);
  const tags = asArray(c.tags);
  const riskLevel = c.riskLevel || c.risk_level;
  return {
    id: c.id,
    contactName: c.contactName || c.contact_name || c.customerName || 'Sin nombre',
    channel: (c.sourceChannel || c.source_channel || c.channel || 'web_chat') as Channel,
    lastMessage: c.latestMessagePreview || c.latest_message_preview || c.lastMessage || c.last_message || c.aiDiagnosis || c.ai_diagnosis || c.summary || c.type || 'Nuevo caso',
    time: c.time || c.lastUpdate || c.last_update || c.createdAt || c.created_at || new Date().toISOString(),
    priority: c.priority === 'high' || c.priority === 'urgent' ? 'high' : 'normal',
    tags,
    unread: c.status === 'new' || c.status === 'pending',
    tab: c.tab || deriveCaseTab(c),
    caseId: c.caseNumber || c.case_number || c.caseId || c.case_id || c.id,
    orderId: orderIds[0] || c.orderId || c.order_id || 'N/A',
    company: c.company || c.customerCompany || c.customer_company,
    brand: c.brand,
    caseType: c.type || 'General',
    riskLevel: riskLevel === 'high' || riskLevel === 'critical' ? 'high' : riskLevel === 'medium' ? 'medium' : 'low',
    orderStatus: titleCase(c.systemStatusSummary?.order || c.systemStatusSummary?.orders),
    paymentStatus: titleCase(c.systemStatusSummary?.payment || c.systemStatusSummary?.payments),
    fulfillmentStatus: titleCase(c.systemStatusSummary?.fulfillment),
    refundStatus: titleCase(c.systemStatusSummary?.refund || c.systemStatusSummary?.returns),
    approvalStatus: titleCase(c.systemStatusSummary?.approval || c.approvalState || c.approval_state),
    context: c.conflictSummary?.rootCause || c.conflict_summary?.root_cause || c.aiDiagnosis || c.ai_diagnosis || '',
    assignedTeam: c.assignedTeamName || c.assigned_team_name || 'Support',
    slaStatus: c.slaStatus === 'at_risk' ? 'SLA risk' : c.slaStatus === 'breached' ? 'Overdue' : 'Waiting',
    slaTime: c.slaResolutionDeadline ? formatRelativeTime(c.slaResolutionDeadline) : 'N/A',
    recommendedNextAction: c.conflictSummary?.recommendedAction || c.conflict_summary?.recommended_action || c.aiRecommendedAction || c.ai_recommended_action,
    conflictDetected: c.conflictSummary?.rootCause || c.conflict_summary?.root_cause || (c.hasReconciliationConflicts ? c.conflictSeverity : undefined),
    relatedCases: c.stateSnapshot?.related?.linkedCases?.map((linked: any) => ({
      id: linked.caseNumber || linked.id,
      type: linked.type || 'Case',
      status: titleCase(linked.status || 'open'),
    })) || [],
    assignee: c.assignedUserId || c.assigned_user_id || c.assignedUserName || c.assignee,
    messages: Array.isArray(c.messages) ? c.messages.map(normalizeMessage) : [],
  };
}

// ── Main InboxV2 component
export default function InboxV2({ focusCaseId }: { focusCaseId?: string | null } = {}) {
  const [activeTab, setActiveTab] = useState<CaseTab>('assigned');
  const [selectedId, setSelectedId] = useState<string>('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [rightPaneOpen, setRightPaneOpen] = useState(true);
  // Filters — passed to casesApi.list() as query params (server expects snake_case)
  const [filters, setFilters] = useState({ status: '', priority: '', risk: '', q: '' });
  // Copilot conversation per-case (preserves history when switching cases)
  const [copilotByCaseId, setCopilotByCaseId] = useState<Record<string, CopilotMessage[]>>({});
  const [copilotLoading, setCopilotLoading] = useState(false);

  const activeFilters = useMemo(() => {
    const params: Record<string, string> = {};
    if (filters.status)   params.status     = filters.status;
    if (filters.priority) params.priority   = filters.priority;
    if (filters.risk)     params.risk_level = filters.risk;
    if (filters.q)        params.q          = filters.q;
    return params;
  }, [filters]);

  const { data: apiCases, loading, error } = useApi(
    () => casesApi.list(Object.keys(activeFilters).length > 0 ? activeFilters : undefined),
    [refreshKey, filters.status, filters.priority, filters.risk, filters.q],
    [],
  );

  const { data: inboxView, loading: inboxViewLoading, error: inboxViewError } = useApi(
    () => selectedId ? casesApi.inboxView(selectedId) : Promise.resolve(null),
    [selectedId, refreshKey],
  );

  const conversations = useMemo(
    () => (apiCases || []).map(mapApiCase),
    [apiCases],
  );

  const filtered = useMemo(
    () => conversations.filter(c => c.tab === activeTab),
    [conversations, activeTab],
  );

  // Auto-select first conv if nothing selected
  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  useEffect(() => {
    if (!focusCaseId || conversations.length === 0) return;
    const target = conversations.find(item => item.id === focusCaseId || item.caseId === focusCaseId);
    if (!target) return;
    setActiveTab(target.tab);
    setSelectedId(target.id);
  }, [focusCaseId, conversations]);

  const selectedConv = filtered.find(c => c.id === selectedId) || filtered[0] || null;

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function sendCopilot(question: string) {
    if (!selectedConv) return;
    const caseId = selectedConv.id;
    const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const userMsg: CopilotMessage = { id: `u-${Date.now()}`, role: 'user', content: question, time: now };
    setCopilotByCaseId(s => ({ ...s, [caseId]: [...(s[caseId] || []), userMsg] }));
    setCopilotLoading(true);
    try {
      const history = (copilotByCaseId[caseId] || []).map(m => ({ role: m.role, content: m.content }));
      const result = await aiApi.copilot(caseId, question, history);
      const assistantMsg: CopilotMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: result?.answer || result?.content || result?.response || 'Sin respuesta',
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      };
      setCopilotByCaseId(s => ({ ...s, [caseId]: [...(s[caseId] || []), assistantMsg] }));
    } catch (err: any) {
      const errorMsg: CopilotMessage = {
        id: `e-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ Error: ${err?.message || 'No pude responder'}`,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      };
      setCopilotByCaseId(s => ({ ...s, [caseId]: [...(s[caseId] || []), errorMsg] }));
    } finally {
      setCopilotLoading(false);
    }
  }

  return (
    <div className="flex flex-1 min-w-0 h-full overflow-hidden relative">
      <InboxSidebar activeTab={activeTab} onTabChange={(t) => { setActiveTab(t); setSelectedId(''); }} />
      <ConversationList
        conversations={filtered}
        selectedId={selectedConv?.id || ''}
        onSelect={setSelectedId}
        filters={filters}
        onFilterChange={(k, v) => setFilters(s => ({ ...s, [k]: v }))}
        onClearFilters={() => setFilters({ status: '', priority: '', risk: '', q: '' })}
      />
      <DetailPane
        conv={selectedConv}
        inboxView={inboxView}
        refreshKey={refreshKey}
        onRefresh={() => setRefreshKey(k => k + 1)}
        onAction={showToast}
      />
      {rightPaneOpen ? (
        <RightPane
          conv={selectedConv}
          inboxView={inboxView}
          copilotMessages={selectedConv ? (copilotByCaseId[selectedConv.id] || []) : []}
          onSendCopilot={sendCopilot}
          copilotLoading={copilotLoading}
          onClose={() => setRightPaneOpen(false)}
        />
      ) : (
        <button
          onClick={() => setRightPaneOpen(true)}
          className="absolute right-4 top-20 z-20 rounded-full bg-white border border-[#e9eae6] shadow-sm px-3 h-8 text-[12.5px] font-semibold text-[#1a1a1a] hover:bg-[#f8f8f7]"
        >
          Abrir detalles
        </button>
      )}

      {/* Loading + error overlays */}
      {(loading || inboxViewLoading) && (
        <div className="absolute top-4 right-4 bg-white border border-[#e9eae6] rounded-lg px-3 py-2 text-[12px] text-[#646462] shadow-sm">
          Cargando…
        </div>
      )}
      {(error || inboxViewError) && (
        <div className="absolute top-4 right-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-[12px] text-red-700 shadow-sm">
          Error: {String(((error || inboxViewError) as any)?.message || error || inboxViewError)}
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
