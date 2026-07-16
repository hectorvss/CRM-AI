// ─────────────────────────────────────────────────────────────────────────────
// Inbox & conversation views
// Extracted from the monolithic Prototype.tsx (auto-split, behavior-preserving).
// ─────────────────────────────────────────────────────────────────────────────

import { type Dispatch, type ReactNode, type SetStateAction, type UIEvent, useEffect, useMemo, useRef, useState } from 'react';
import { aiApi, attachmentsApi, casesApi, customersApi, iamApi, inboxesApi, macrosApi } from '../../api/client';
import { useApi } from '../../api/hooks';
import { AVATAR_ME, ICON_ALL, ICON_CREATED, ICON_DASHBOARD, ICON_EMAIL2, ICON_ESCALATED, ICON_FILTER, ICON_FIN, ICON_FIN_SVC, ICON_MANAGE, ICON_MENTION, ICON_MESSENGER, ICON_PENDING, ICON_PHONE2, ICON_SEARCH2, ICON_SORT, ICON_SPAM, ICON_TICKETS, ICON_UNASSIGNED, ICON_WHATSAPP2, SettingsSidebar, TrialBanner, messages, relativeTime, titleCase } from '../sharedUi';
import type { Attachment, Conversation, Message, View } from '../types';
import { parsePath, pathFor, replaceRoute } from '../router';

// Navigate to another top-level view (optionally a sub-tab) from anywhere in the
// inbox. Sets the clean path first, then fires app-navigate so PrototypeApp
// switches the view without clobbering the sub segment.
function navigateApp(view: View, sub?: string) {
  if (typeof window === 'undefined') return;
  window.history.pushState({}, '', pathFor(sub ? { view, sub } : { view }));
  window.dispatchEvent(new CustomEvent('app-navigate', { detail: { view } }));
}


// ─────────────────────────────────────────────────────────────────────────────
// INBOX VIEW
// ─────────────────────────────────────────────────────────────────────────────

// Minimalist 16×16 check (no fill, 1.5 stroke). Used for "Resuelto" /
// "Resolver" — replaces the chunky Figma chevron-right asset.
const CheckIconMinimal = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 8.5l3.2 3L13 5" />
  </svg>
);

function SidebarNavItem({
  icon, label, count, active = false, onClick,
}: { key?: string | number | null; icon: string | ReactNode; label: string; count?: number; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-2 h-8 pl-3 pr-3 py-1 rounded-lg cursor-pointer text-[13px] w-full text-left ${
        active
          ? "bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]"
          : "hover:bg-[#e9eae6]/40 text-[#1a1a1a]"
      }`}
    >
      <div className="flex items-center justify-center w-[18px] h-[18px] flex-shrink-0 text-[#1a1a1a]">
        {typeof icon === 'string' ? <img src={icon} alt="" className="w-4 h-4" /> : icon}
      </div>
      <span className="flex-1 leading-4">{label}</span>
      {count !== undefined && (
        <span className="text-[#646462] text-[13px]">{count}</span>
      )}
    </button>
  );
}

type InboxScope = 'search' | 'inbox' | 'mentions' | 'created' | 'all' | 'unassigned' | 'spam' | 'dashboard'
  | 'fin-all' | 'fin-resolved' | 'fin-escalated' | 'fin-pending' | 'fin-spam'
  | 'v-messenger' | 'v-email' | 'v-whatsapp' | 'v-phone' | 'v-tickets'
  | `team:${string}` | `agent:${string}`;

function InboxSidebar({
  active,
  onScopeChange,
  counts,
  onAction,
  onCollapse,
  onNewConversation,
  teams = [],
  teammates = [],
  onTeamsChanged,
  onNewTeammate,
}: {
  active: InboxScope;
  onScopeChange: (scope: InboxScope) => void;
  counts: Partial<Record<InboxScope, number>>;
  onAction?: (message: string, type?: 'success' | 'error') => void;
  onCollapse?: () => void;
  onNewConversation?: () => void;
  teams?: any[];
  teammates?: any[];
  onTeamsChanged?: () => void;
  onNewTeammate?: () => void;
}) {
  const notify = (msg: string) => onAction?.(msg, 'success');
  // 4 expandable sections (Fin para servicio / Inbox para el equipo / Compañeros de equipo / Vistas)
  // — same expand/collapse pattern as the Fin AI Agent sidebar.
  const [openFin, setOpenFin] = useState(true);
  const [openTeamInbox, setOpenTeamInbox] = useState(true);
  const [openTeammates, setOpenTeammates] = useState(true);
  const [openVistas, setOpenVistas] = useState(true);
  // Create team modal
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);
  // Show all teams always
  const pinnedTeams = teams;
  // Reusable inline-SVG chevron — guaranteed right→down rotation regardless of asset.
  // Closed: points right `>` (no rotation). Open: rotate-90 → points down `v`.
  const Chevron = ({ open }: { open: boolean }) => (
    <svg viewBox="0 0 16 16" className={`w-3.5 h-3.5 fill-[#646462] transition-transform ${open ? 'rotate-90' : ''}`}>
      <path d="M6 4l4 4-4 4z"/>
    </svg>
  );
  return (
    <div className="flex flex-col h-full w-[236px] bg-[#f8f8f7] border-r border-[#e9eae6] flex-shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 h-16 flex-shrink-0">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Inbox</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onNewConversation ? onNewConversation() : notify('Nueva conversación — próximamente')}
            title="Nueva conversación"
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#e9eae6]"
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
          </button>
          {onCollapse && (
            <button
              onClick={onCollapse}
              title="Esconder sidebar"
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#e9eae6] text-[#646462]"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <path d="M10 4l-4 4 4 4" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pl-3 pr-0 pb-4">
        <div className="flex flex-col gap-0.5">
          <SidebarNavItem icon={ICON_SEARCH2} label="Buscar" active={active === 'search'} onClick={() => onScopeChange('search')} />
          <SidebarNavItem icon={AVATAR_ME} label="Tu bandeja de entrada" count={counts.inbox ?? 0} active={active === 'inbox'} onClick={() => onScopeChange('inbox')} />
          <SidebarNavItem icon={ICON_MENTION} label="Menciones" count={counts.mentions ?? 0} active={active === 'mentions'} onClick={() => onScopeChange('mentions')} />
          <SidebarNavItem icon={ICON_CREATED} label="Creado por ti" count={counts.created ?? 0} active={active === 'created'} onClick={() => onScopeChange('created')} />
          <SidebarNavItem icon={ICON_ALL} label="Todo" count={counts.all ?? 0} active={active === 'all'} onClick={() => onScopeChange('all')} />
          <SidebarNavItem icon={ICON_UNASSIGNED} label="Sin asignar" count={counts.unassigned ?? 0} active={active === 'unassigned'} onClick={() => onScopeChange('unassigned')} />
          <SidebarNavItem icon={ICON_SPAM} label="Correo no deseado" count={counts.spam ?? 0} active={active === 'spam'} onClick={() => onScopeChange('spam')} />
          <SidebarNavItem icon={ICON_DASHBOARD} label="Tablero" active={active === 'dashboard'} onClick={() => onScopeChange('dashboard')} />
        </div>

        <div className="mt-3">
          <button onClick={() => setOpenFin(o => !o)} className="w-full flex items-center justify-between h-8 px-3 cursor-pointer hover:bg-[#ededea]/40 rounded-[6px]">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Fin para servicio</span>
            <div className="flex items-center gap-1">
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); navigateApp('fin', 'finSimpleAutomations'); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); navigateApp('fin', 'finSimpleAutomations'); } }}
                className="w-6 h-6 flex items-center justify-center rounded-full bg-white shadow-[0px_1px_2px_rgba(20,20,20,0.15)] hover:bg-[#f8f8f7] cursor-pointer"
                title="Nueva regla de Fin"
              >
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
              </span>
              <span className="w-5 h-4 flex items-center justify-center"><Chevron open={openFin} /></span>
            </div>
          </button>
          {openFin && (
            <div className="flex flex-col gap-0.5 pl-1 mt-0.5">
              <SidebarNavItem icon={ICON_FIN_SVC} label="Todas las conversaciones" count={counts['fin-all'] ?? 0} active={active === 'fin-all'} onClick={() => onScopeChange('fin-all')} />
              <SidebarNavItem icon={<CheckIconMinimal className="w-4 h-4" />} label="Resuelto" count={counts['fin-resolved'] ?? 0} active={active === 'fin-resolved'} onClick={() => onScopeChange('fin-resolved')} />
              <SidebarNavItem icon={ICON_ESCALATED} label="Escalado y transferencia" count={counts['fin-escalated'] ?? 0} active={active === 'fin-escalated'} onClick={() => onScopeChange('fin-escalated')} />
              <SidebarNavItem icon={ICON_PENDING} label="Pendiente" count={counts['fin-pending'] ?? 0} active={active === 'fin-pending'} onClick={() => onScopeChange('fin-pending')} />
              <SidebarNavItem icon={ICON_SPAM} label="Correo no deseado" count={counts['fin-spam'] ?? 0} active={active === 'fin-spam'} onClick={() => onScopeChange('fin-spam')} />
            </div>
          )}
        </div>

        <div className="mt-3">
          <button onClick={() => setOpenTeamInbox(o => !o)} className="w-full flex items-center justify-between h-8 px-3 cursor-pointer hover:bg-[#ededea]/40 rounded-[6px] group">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Inbox para el equipo</span>
            <div className="flex items-center gap-1">
              <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); setShowCreateTeamModal(true); setNewTeamName(''); setNewTeamDescription(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setShowCreateTeamModal(true); setNewTeamName(''); setNewTeamDescription(''); } }}
                  className="w-6 h-6 flex items-center justify-center rounded-full bg-white shadow-[0px_1px_2px_rgba(20,20,20,0.15)] hover:bg-[#f8f8f7] cursor-pointer"
                  title="Crear equipo"
                >
                  <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
                </span>
              <span className="w-5 h-4 flex items-center justify-center"><Chevron open={openTeamInbox} /></span>
            </div>
          </button>
          {openTeamInbox && (
            <div className="flex flex-col gap-0.5 pl-1 mt-0.5">
              {pinnedTeams.length === 0 ? (
                <p className="text-[12px] italic text-[#9a9a98] px-3 py-1">Aún no hay equipos. Pulsa + para crear uno.</p>
              ) : (
                pinnedTeams.map((team: any) => {
                  const tid = team.id ?? team.team_id;
                  const tscope = `team:${tid}` as InboxScope;
                  return (
                    <SidebarNavItem
                      key={tid}
                      icon={<svg viewBox="0 0 16 16" className="w-4 h-4 fill-current"><path d="M2 5a3 3 0 1 1 3.78 2.9A5 5 0 0 1 10 10H6a5 5 0 0 1 4.22-2.1A3 3 0 1 1 14 5a3 3 0 0 1-2.22 2.9A7 7 0 0 1 14 12H2a7 7 0 0 1 2.22-4.1A3 3 0 0 1 2 5z"/></svg>}
                      label={team.name ?? team.title ?? 'Equipo'}
                      active={active === tscope}
                      count={counts[tscope]}
                      onClick={() => onScopeChange(tscope)}
                    />
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="mt-1">
          <button onClick={() => setOpenTeammates(o => !o)} className="w-full flex items-center justify-between h-8 px-3 cursor-pointer hover:bg-[#ededea]/40 rounded-[6px] group">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Compañeros de equipo</span>
            <div className="flex items-center gap-1">
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); if (onNewTeammate) onNewTeammate(); else navigateApp('workspaceTeammates'); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); if (onNewTeammate) onNewTeammate(); else navigateApp('workspaceTeammates'); } }}
                className="w-6 h-6 flex items-center justify-center rounded-full bg-white shadow-[0px_1px_2px_rgba(20,20,20,0.15)] hover:bg-[#f8f8f7] cursor-pointer"
                title="Invitar compañero"
              >
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
              </span>
              <span className="w-5 h-4 flex items-center justify-center"><Chevron open={openTeammates} /></span>
            </div>
          </button>
          {openTeammates && (
            <div className="flex flex-col gap-0.5 pl-1 mt-0.5">
              {teammates.length === 0 ? (
                <p className="text-[12px] italic text-[#9a9a98] px-3 py-1">Aún no hay compañeros conectados.</p>
              ) : (
                teammates.map((member: any) => {
                  const mid = member.id ?? member.user_id;
                  const ascope = `agent:${mid}` as InboxScope;
                  const initials = (member.full_name ?? member.name ?? 'U').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                  const isOnline = member.status === 'active' || member.online === true;
                  return (
                    <button
                      key={mid}
                      onClick={() => onScopeChange(ascope)}
                      className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-left hover:bg-[#e9eae6] transition-colors ${active === ascope ? 'bg-[#e9eae6]' : ''}`}
                    >
                      <div className="relative flex-shrink-0">
                        <div className="w-6 h-6 rounded-full bg-[#6366f1] flex items-center justify-center text-[10px] font-bold text-white">
                          {initials}
                        </div>
                        {isOnline && <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#22c55e] border-2 border-white" />}
                      </div>
                      <span className="text-[13px] text-[#1a1a1a] truncate">{member.full_name ?? member.name ?? 'Usuario'}</span>
                      {counts[ascope] != null && counts[ascope]! > 0 && (
                        <span className="ml-auto text-[11px] font-semibold text-[#646462]">{counts[ascope]}</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="mt-1">
          <button onClick={() => setOpenVistas(o => !o)} className="w-full flex items-center justify-between h-8 px-3 cursor-pointer hover:bg-[#ededea]/40 rounded-[6px]">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Vistas</span>
            <span className="w-5 h-4 flex items-center justify-center"><Chevron open={openVistas} /></span>
          </button>
          {openVistas && (
            <div className="flex flex-col gap-0.5 pl-1 mt-0.5">
              <SidebarNavItem icon={ICON_MESSENGER} label="Messenger" count={counts['v-messenger'] ?? 0} active={active === 'v-messenger'} onClick={() => onScopeChange('v-messenger')} />
              <SidebarNavItem icon={ICON_EMAIL2} label="Email" count={counts['v-email'] ?? 0} active={active === 'v-email'} onClick={() => onScopeChange('v-email')} />
              <SidebarNavItem icon={ICON_WHATSAPP2} label="WhatsApp & Social" count={counts['v-whatsapp'] ?? 0} active={active === 'v-whatsapp'} onClick={() => onScopeChange('v-whatsapp')} />
              <SidebarNavItem icon={ICON_PHONE2} label="Phone & SMS" count={counts['v-phone'] ?? 0} active={active === 'v-phone'} onClick={() => onScopeChange('v-phone')} />
              <SidebarNavItem icon={ICON_TICKETS} label="Tickets" count={counts['v-tickets'] ?? 0} active={active === 'v-tickets'} onClick={() => onScopeChange('v-tickets')} />
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-[#e9eae6] pt-2">
          <button className="flex items-center gap-2 h-8 px-3 rounded-lg hover:bg-[#e9eae6]/40 w-full cursor-pointer">
            <img src={ICON_MANAGE} alt="" className="w-4 h-4" />
            <span className="text-[14px] font-semibold text-[#1a1a1a]">Administrar</span>
          </button>
        </div>
      </div>

      {/* Create team modal */}
      {showCreateTeamModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30" onClick={() => setShowCreateTeamModal(false)}>
          <div className="bg-white rounded-2xl shadow-[0_8px_40px_rgba(20,20,20,0.22)] w-80 p-6 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-[15px] font-semibold text-[#1a1a1a]">Crear equipo</h3>
            <div className="flex flex-col gap-2">
              <input
                autoFocus
                placeholder="Nombre del equipo *"
                value={newTeamName}
                onChange={e => setNewTeamName(e.target.value)}
                className="w-full border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#6366f1]"
              />
              <input
                placeholder="Descripción (opcional)"
                value={newTeamDescription}
                onChange={e => setNewTeamDescription(e.target.value)}
                className="w-full border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#6366f1]"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowCreateTeamModal(false)}
                className="px-4 py-1.5 rounded-lg border border-[#e9eae6] text-[13px] text-[#646462] hover:bg-[#f8f8f7]"
              >Cancelar</button>
              <button
                disabled={!newTeamName.trim() || creatingTeam}
                onClick={async () => {
                  if (!newTeamName.trim()) return;
                  setCreatingTeam(true);
                  try {
                    await (iamApi as any).createTeam({ name: newTeamName.trim(), description: newTeamDescription.trim() || undefined });
                    setShowCreateTeamModal(false);
                    setNewTeamName('');
                    setNewTeamDescription('');
                    onTeamsChanged?.();
                    onAction?.('Equipo creado correctamente', 'success');
                  } catch {
                    onAction?.('Error al crear el equipo', 'error');
                  } finally {
                    setCreatingTeam(false);
                  }
                }}
                className="px-4 py-1.5 rounded-lg bg-[#6366f1] text-white text-[13px] font-medium hover:bg-[#4f46e5] disabled:opacity-50 disabled:cursor-not-allowed"
              >{creatingTeam ? 'Creando…' : 'Crear'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function safeArray(value: any): string[] {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
    } catch {
      return value ? [value] : [];
    }
  }
  return [];
}

function channelIconLetter(channel?: string | null) {
  const key = (channel || '').toLowerCase();
  if (key.includes('email')) return 'E';
  if (key.includes('whatsapp')) return 'W';
  if (key.includes('phone') || key.includes('sms')) return 'P';
  if (key.includes('web') || key.includes('messenger')) return 'M';
  return 'C';
}

function channelColor(channel?: string | null) {
  const key = (channel || '').toLowerCase();
  if (key.includes('email')) return '#85e0d9';
  if (key.includes('whatsapp')) return '#61d65c';
  if (key.includes('phone') || key.includes('sms')) return '#f6d365';
  if (key.includes('web') || key.includes('messenger')) return '#9ec5fa';
  return '#e7e2fd';
}

function mapCaseToPrototypeConversation(c: any): Conversation {
  const channel = c.sourceChannel || c.source_channel || c.channel_context?.channel || c.channel || 'case';
  const customerName = c.customerName || c.customer_name || c.customer?.name || 'Visitante anonimo';
  const orderIds = safeArray(c.orderIds || c.order_ids);
  const preview = c.latestMessagePreview
    || c.latest_message_preview
    || c.aiRecommendedAction
    || c.ai_recommended_action
    || c.aiDiagnosis
    || c.ai_diagnosis
    || c.type
    || 'Caso sin ultimo mensaje';
  return {
    id: String(c.id),
    channel: `${titleCase(channel)} · ${customerName}`,
    preview,
    time: relativeTime(c.lastActivityAt || c.last_activity_at || c.updatedAt || c.updated_at || c.createdAt || c.created_at),
    avatarColor: channelColor(channel),
    avatarLetter: channelIconLetter(channel),
    customerName,
    customerEmail: c.customerEmail || c.customer_email || c.customer?.email,
    company: c.company || c.customerCompany || c.customer_company,
    status: c.status,
    priority: c.priority,
    riskLevel: c.riskLevel || c.risk_level,
    assignee: c.assignedUserName || c.assigned_user_name,
    team: c.assignedTeamName || c.assigned_team_name,
    caseNumber: c.caseNumber || c.case_number,
    tags: safeArray(c.tags),
    orderId: orderIds[0],
    sourceChannel: channel,
    aiSummary: c.aiDiagnosis || c.ai_diagnosis || c.aiRecommendedAction || c.ai_recommended_action,
    resolvedBy: c.resolved_by ?? null,
    approvalState: c.approval_state ?? 'not_required',
    approvalRequestId: c.active_approval_request_id ?? null,
    aiHandled: c.resolved_by === 'ai' || (c.ai_confidence != null && c.ai_confidence > 0.1),
    raw: c,
  };
}

function isSpamConversation(conv: Conversation) {
  const haystack = [conv.status, conv.sourceChannel, conv.preview, ...(conv.tags || [])].join(' ').toLowerCase();
  return haystack.includes('spam') || haystack.includes('correo no deseado');
}

function matchesInboxScope(conv: Conversation, scope: InboxScope, currentUserId: string | null = null) {
  const channel = (conv.sourceChannel || conv.channel || '').toLowerCase();
  const raw = conv.raw || {};
  const tags = (conv.tags || []).join(' ').toLowerCase();
  switch (scope) {
    case 'search':
    case 'all':
    case 'dashboard':
      return true;
    case 'fin-all':
      return conv.aiHandled === true || raw.resolved_by === 'ai' || (raw.ai_confidence != null && raw.ai_confidence > 0.1);
    case 'inbox':
      if (!currentUserId) return Boolean(raw.assigned_user_id || conv.assignee) && !isSpamConversation(conv);
      return (raw.assigned_user_id === currentUserId || raw.assignee_id === currentUserId) && !isSpamConversation(conv);
    case 'mentions': {
      if (!currentUserId) return tags.includes('mention') || tags.includes('mencion');
      const mentionsList: any[] = Array.isArray(raw.mentions) ? raw.mentions : [];
      const isMentioned = mentionsList.some((m: any) => m === currentUserId || m?.user_id === currentUserId || m?.id === currentUserId);
      return isMentioned || tags.includes('mention') || tags.includes('mencion');
    }
    case 'created':
      if (!currentUserId) return Boolean(raw.created_by_user_id || raw.createdByUserId || raw.created_by || raw.createdBy);
      return raw.created_by_user_id === currentUserId || raw.created_by === currentUserId || raw.createdBy === currentUserId;
    case 'unassigned':
      return !raw.assigned_user_id && !conv.assignee;
    case 'spam':
      return isSpamConversation(conv);
    case 'fin-spam':
      // Spam: AI-classified spam OR AI-blocked cases
      return conv.aiHandled === true && (isSpamConversation(conv) || String(raw.status ?? '').toLowerCase() === 'blocked');
    case 'fin-resolved':
      // Resolved: AI handled AND conversation is in a terminal state
      return conv.aiHandled === true && ['resolved', 'closed', 'done', 'completed'].includes(String(conv.status ?? raw.status ?? '').toLowerCase());
    case 'fin-escalated':
      // Escalated: explicitly escalated, approval expired, blocked, OR rejected
      return conv.aiHandled === true && (
        String(conv.status ?? raw.status ?? '').toLowerCase() === 'escalated' ||
        String(conv.status ?? raw.status ?? '').toLowerCase() === 'blocked' ||
        raw.approval_state === 'pending' ||
        raw.approval_state === 'expired' ||
        raw.approval_state === 'rejected'
      );
    case 'fin-pending':
      // Pending: AI waiting for human action — snoozed or explicitly pending
      return conv.aiHandled === true && (
        raw.approval_state === 'pending' ||
        ['waiting', 'pending', 'snoozed'].includes(String(conv.status ?? raw.status ?? '').toLowerCase())
      );
    case 'v-messenger':
      return channel.includes('messenger') || channel.includes('web') || channel.includes('chat');
    case 'v-email':
      return channel.includes('email');
    case 'v-whatsapp':
      return channel.includes('whatsapp') || channel.includes('social');
    case 'v-phone':
      return channel.includes('phone') || channel.includes('sms');
    case 'v-tickets':
      return channel.includes('ticket') || String(conv.raw?.type || '').toLowerCase().includes('ticket');
    default:
      if (scope.startsWith('team:')) {
        const teamId = scope.replace('team:', '');
        return raw.assigned_team_id === teamId;
      }
      if (scope.startsWith('agent:')) {
        const agentId = scope.replace('agent:', '');
        return raw.assigned_user_id === agentId;
      }
      return true;
  }
}

function inboxScopeTitle(scope: InboxScope) {
  if (scope.startsWith('team:')) return `Equipo: ${scope.replace('team:', '')}`;
  if (scope.startsWith('agent:')) return `Agente: ${scope.replace('agent:', '')}`;
  const titles: Record<string, string> = {
    search: 'Buscar',
    inbox: 'Tu bandeja de entrada',
    mentions: 'Menciones',
    created: 'Creado por ti',
    all: 'Todo',
    unassigned: 'Sin asignar',
    spam: 'Correo no deseado',
    dashboard: 'Tablero',
    'fin-all': 'Todas las conversaciones',
    'fin-resolved': 'Resuelto',
    'fin-escalated': 'Escalado y transferencia',
    'fin-pending': 'Pendiente',
    'fin-spam': 'Correo no deseado',
    'v-messenger': 'Messenger',
    'v-email': 'Email',
    'v-whatsapp': 'WhatsApp & Social',
    'v-phone': 'Phone & SMS',
    'v-tickets': 'Tickets',
  };
  return titles[scope] ?? scope;
}

function ConversationCard({ conv, isSelected, onSelect }: { conv: Conversation; isSelected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`relative flex items-start gap-2 px-3 py-3 rounded-xl cursor-pointer w-full text-left ${
        isSelected ? "bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]" : "hover:bg-white/60"
      }`}
    >
      <div className="w-6 h-6 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: conv.avatarColor }}>
        <span className="text-[12px] font-semibold text-[#1a1a1a] uppercase">{conv.avatarLetter}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-2">
          <span className={`text-[13px] truncate ${isSelected ? "font-semibold text-[#646462]" : "font-bold text-[#1a1a1a]"}`}>
            {conv.channel}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className={`text-[13px] truncate ${isSelected ? "text-[#646462]" : "text-[#1a1a1a]"}`}>{conv.preview}</span>
          <span className="text-[13px] text-[#646462] flex-shrink-0 ml-2">{conv.time}</span>
        </div>
      </div>
    </button>
  );
}

function ConversationList({
  selectedId,
  onSelect,
  items,
  loading,
  error,
  title,
  scope,
  onCollapse,
  onLoadMore,
  hasMore,
  loadingMore,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  items: Conversation[];
  loading?: boolean;
  error?: string | null;
  title: string;
  scope: InboxScope;
  onCollapse?: () => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}) {
  // Infinite scroll: fire onLoadMore when the user nears the bottom.
  function handleListScroll(e: UIEvent<HTMLDivElement>) {
    if (!onLoadMore || !hasMore || loadingMore) return;
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) onLoadMore();
  }
  const openCount = items.filter(conv => conv.status !== 'closed' && conv.status !== 'resolved').length;
  return (
    <div className="flex flex-col h-full w-[271px] border-l border-[#e9eae6] bg-[#f8f8f7] flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-4 h-16 sticky top-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative w-4 h-4 rounded-lg overflow-hidden bg-[#f8f8f7] flex-shrink-0">
            <img src={AVATAR_ME} alt="" className="absolute inset-0 w-full h-full object-cover" />
          </div>
          <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a] truncate">{title}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#e9eae6]">
            <img src={ICON_SEARCH2} alt="" className="w-4 h-4" />
          </button>
          {onCollapse && (
            <button onClick={onCollapse} title="Esconder lista" className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#e9eae6] text-[#646462]">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <path d="M10 4l-4 4 4 4" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0">
        <button className="bg-white border border-[#e9eae6] text-[13px] font-semibold text-[#1a1a1a] px-[9px] py-[5px] rounded-full">
          {loading ? 'Cargando...' : `${openCount} Abierta`}
        </button>
        <div className="flex items-center gap-1">
          <button className="bg-white border border-[#e9eae6] text-[13px] font-semibold text-[#1a1a1a] px-[9px] py-[5px] rounded-full">
            Última actividad
          </button>
          <button className="bg-white border border-[#e9eae6] w-6 h-6 flex items-center justify-center rounded-full">
            <img src={ICON_FILTER} alt="" className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-16 flex flex-col gap-0" onScroll={handleListScroll}>
        {scope === 'dashboard' && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            {[
              ['Abiertas', openCount],
              ['Sin asignar', items.filter(conv => !conv.assignee && !conv.raw?.assigned_user_id).length],
              ['Alto riesgo', items.filter(conv => ['high', 'critical'].includes(String(conv.riskLevel || '').toLowerCase())).length],
              ['Escaladas', items.filter(conv => String(conv.status || '').toLowerCase() === 'escalated').length],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-white border border-[#e9eae6] px-3 py-2 shadow-[0px_1px_2px_rgba(20,20,20,0.08)]">
                <p className="text-[11px] text-[#646462]">{label}</p>
                <p className="text-[20px] font-semibold text-[#1a1a1a]">{value}</p>
              </div>
            ))}
          </div>
        )}
        {error && (
          <div className="text-[12.5px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-2">
            {error}
          </div>
        )}
        {!loading && items.length === 0 && !error && (
          <div className="text-[13px] text-[#646462] px-3 py-6 text-center">
            No hay conversaciones para mostrar.
          </div>
        )}
        {items.map((conv, i) => (
          <div key={conv.id}>
            {i > 0 && <div className="flex justify-center py-0.5"><div className="w-[222px] h-[1px] bg-[#f8f8f7]" /></div>}
            <ConversationCard conv={conv} isSelected={conv.id === selectedId} onSelect={() => onSelect(conv.id)} />
          </div>
        ))}
        {loadingMore && (
          <div className="text-[12px] text-[#646462] px-3 py-3 text-center">Cargando más…</div>
        )}
      </div>

      <div className="absolute bottom-4 left-6 bg-white border border-[#e9eae6] rounded-full shadow-[0px_8px_8px_rgba(20,20,20,0.15)] flex items-center gap-1 p-[5px]">
        <button className="bg-[#f8f8f7] rounded-full px-3 py-2"><img src={ICON_FILTER} alt="" className="w-4 h-4" /></button>
        <button className="rounded-full px-3 py-2"><img src={ICON_SORT} alt="" className="w-4 h-4" /></button>
      </div>
    </div>
  );
}
type ComposerAttachment = { id: string; name: string; size: number; type: string; dataUrl?: string; file: File };
const PROTOTYPE_COMMON_EMOJIS = ['😊','😄','😂','😍','🤔','😅','😭','😤','👍','🙏','🎉','✅','🚚','💳','📦','⚠️','❤️','🔥'];

function getInboxLatestDraft(inboxView: any) {
  return inboxView?.latestDraft || inboxView?.latest_draft || inboxView?.latestDraftReply || null;
}

function getInboxInternalNotes(inboxView: any) {
  return inboxView?.internalNotes || inboxView?.internal_notes || [];
}

function getInboxMessages(inboxView: any) {
  return Array.isArray(inboxView?.messages) ? inboxView.messages : [];
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function normalizePrototypeMessage(message: any, index: number): Message {
  const direction = message.direction || message.role || message.from || message.senderType || message.sender_type;
  const text = message.content || message.text || message.body || message.message || '';
  const key = String(direction).toLowerCase();
  const isCustomer = ['customer', 'user', 'inbound'].includes(key);
  const isAi = ['ai', 'assistant', 'bot', 'fin'].includes(key);
  // The backend stores attachments as a JSON string on the messages row.
  // Parse it defensively — old rows have null, integration messages might
  // pass an array directly.
  let attachments: Attachment[] | undefined;
  const raw = message.attachments;
  if (Array.isArray(raw)) {
    attachments = raw.filter((a: any) => a && a.name).map((a: any, i: number) => ({
      id: String(a.id || `att-${i}`),
      name: String(a.name),
      size: Number.isFinite(a.size) ? Number(a.size) : 0,
      type: String(a.type || 'application/octet-stream'),
      dataUrl: typeof a.dataUrl === 'string' ? a.dataUrl : undefined,
      url: typeof a.url === 'string' ? a.url : undefined,
    }));
  } else if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        attachments = parsed.filter((a: any) => a && a.name).map((a: any, i: number) => ({
          id: String(a.id || `att-${i}`),
          name: String(a.name),
          size: Number.isFinite(a.size) ? Number(a.size) : 0,
          type: String(a.type || 'application/octet-stream'),
          dataUrl: typeof a.dataUrl === 'string' ? a.dataUrl : undefined,
          url: typeof a.url === 'string' ? a.url : undefined,
        }));
      }
    } catch {
      // ignore malformed JSON
    }
  }
  return {
    id: String(message.id || `msg-${index}`),
    from: isCustomer ? 'user' : isAi ? 'bot' : 'agent',
    text,
    time: relativeTime(message.createdAt || message.created_at || message.time || message.timestamp),
    senderName: message.senderName || message.sender_name || (isAi ? 'Fin' : isCustomer ? undefined : 'Equipo'),
    attachments: attachments && attachments.length > 0 ? attachments : undefined,
  };
}

function MessageAttachmentChip({ att }: { att: Attachment }) {
  const isImage = (att.type || '').startsWith('image/') || (att.dataUrl || '').startsWith('data:image');
  const href = att.url || att.dataUrl;
  return (
    <a
      href={href || '#'}
      download={href && !att.url ? att.name : undefined}
      target={att.url ? '_blank' : undefined}
      rel="noopener noreferrer"
      onClick={e => { if (!href) e.preventDefault(); }}
      className="flex items-center gap-2 rounded-xl bg-white border border-[#e9eae6] px-2 py-1.5 hover:bg-[#f8f8f7] max-w-full"
      title={`${att.name} · ${formatBytes(att.size)}`}
    >
      {isImage && href ? (
        <img src={href} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
      ) : (
        <span className="w-6 h-6 rounded bg-[#f3f3f1] flex items-center justify-center flex-shrink-0 text-[11px]">📎</span>
      )}
      <div className="flex flex-col min-w-0">
        <span className="text-[12px] font-semibold text-[#1a1a1a] truncate max-w-[180px]">{att.name}</span>
        <span className="text-[10px] text-[#646462]">{formatBytes(att.size)}</span>
      </div>
    </a>
  );
}

function ChatMessage({ msg }: { msg: Message }) {
  const isUser = msg.from === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "items-end gap-2"} mb-3`}>
      {!isUser && (
        <div className="w-6 h-6 rounded-xl bg-[#9ec5fa] flex items-center justify-center flex-shrink-0">
          <span className="text-[12px] font-semibold text-[#1a1a1a]">F</span>
        </div>
      )}
      <div className={`max-w-[380px] px-4 py-4 rounded-xl text-[14px] leading-[20px] bg-[#f8f8f7] text-[#1a1a1a] ${isUser ? "rounded-br-sm" : "rounded-bl-sm"}`}>
        {msg.senderName && <p className="text-[12px] font-semibold text-[#646462] mb-1">{msg.senderName}</p>}
        {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5">
            {msg.attachments.map(att => <MessageAttachmentChip key={att.id} att={att} />)}
          </div>
        )}
        <p className="text-[11px] text-[#646462] mt-2 text-right">{msg.time}</p>
      </div>
    </div>
  );
}

function PrototypeMergeModal({
  sourceId,
  sourceConv,
  onClose,
  onMerged,
  onAction,
}: {
  sourceId: string;
  sourceConv?: any;
  onClose: () => void;
  onMerged: () => void;
  onAction: (message: string, type?: 'success' | 'error') => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<any>(null);
  const [merging, setMerging] = useState(false);
  const { data: allCases, loading } = useApi(
    () => casesApi.list({ limit: '50' }),
    [], []
  );

  const candidates = useMemo(() => {
    const list = Array.isArray(allCases) ? allCases : [];
    const q = query.trim().toLowerCase();
    return list
      .filter((c: any) => c.id !== sourceId && c.status !== 'merged')
      .filter((c: any) => {
        if (!q) return true;
        const hay = [c.id, c.case_number, c.customer_id, c.type, c.status].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 8);
  }, [allCases, query, sourceId]);

  async function doMerge() {
    if (!selectedTarget || merging) return;
    setMerging(true);
    try {
      await casesApi.merge(selectedTarget.id, sourceId);
      onAction('Casos fusionados correctamente');
      onMerged();
      onClose();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo fusionar el caso', 'error');
    } finally {
      setMerging(false);
    }
  }

  // Mini ticket card for the stacked preview
  function TicketCard({ conv, dim = false }: { conv: any; dim?: boolean }) {
    const status = conv?.status ?? '—';
    const statusColor = status === 'open' ? 'bg-green-100 text-green-800'
      : status === 'closed' ? 'bg-gray-100 text-gray-600'
      : status === 'snoozed' ? 'bg-amber-100 text-amber-800'
      : status === 'escalated' ? 'bg-red-100 text-red-700'
      : 'bg-blue-100 text-blue-800';
    const ch = conv?.source_channel ?? conv?.channel ?? '—';
    const custId = conv?.customer_id ?? '—';
    const num = conv?.case_number ?? conv?.id?.slice(0, 10) ?? '—';
    return (
      <div className={`w-full rounded-xl border border-[#e9eae6] bg-white px-4 py-3 transition-opacity ${dim ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-mono text-[#646462]">{num}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>{status}</span>
        </div>
        <div className="text-[13px] font-semibold text-[#1a1a1a] truncate">{custId}</div>
        <div className="text-[11.5px] text-[#646462] truncate mt-0.5">{conv?.type ?? '—'} · {ch}</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center" onClick={onClose}>
      <div
        className="w-[520px] max-h-[80vh] rounded-2xl bg-white border border-[#e9eae6] shadow-[0px_20px_60px_rgba(20,20,20,0.28)] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-[#e9eae6]">
          <h3 className="text-[16px] font-semibold text-[#1a1a1a] mb-0.5">Fusionar conversación</h3>
          <p className="text-[12.5px] text-[#646462]">El caso actual se fusionará dentro del caso destino. Se conservarán todos los mensajes y notas.</p>
        </div>

        {/* Stacked preview — shows both tickets overlapping */}
        {selectedTarget ? (
          <div className="px-6 pt-4 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#646462] mb-3">Vista previa de fusión</p>
            <div className="relative">
              {/* Target card (back — will absorb the source) */}
              <div className="transform translate-y-3 translate-x-2 scale-[0.97] absolute inset-x-0">
                <TicketCard conv={selectedTarget} dim />
              </div>
              {/* Source card (front — will be merged into target) */}
              <div className="relative z-10 shadow-md rounded-xl">
                <TicketCard conv={sourceConv ?? { id: sourceId, status: 'open' }} />
              </div>
            </div>
            {/* Arrow */}
            <div className="flex items-center justify-center gap-2 mt-10 mb-1">
              <svg viewBox="0 0 20 20" className="w-5 h-5 fill-[#646462]"><path d="M10 3a1 1 0 0 1 1 1v9.586l2.293-2.293a1 1 0 1 1 1.414 1.414l-4 4a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L9 13.586V4a1 1 0 0 1 1-1z"/></svg>
              <span className="text-[12px] text-[#646462]">se fusionará en → <strong className="text-[#1a1a1a]">{selectedTarget.case_number ?? selectedTarget.id}</strong></span>
            </div>
          </div>
        ) : (
          <div className="px-6 pt-4 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#646462] mb-2">Caso de origen</p>
            <TicketCard conv={sourceConv ?? { id: sourceId, status: 'open' }} />
          </div>
        )}

        {/* Search */}
        <div className="px-6 pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#646462] mb-2">Selecciona el caso destino</p>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por ID, número, cliente o tipo…"
            className="w-full h-9 rounded-lg border border-[#e9eae6] px-3 text-[13px] focus:outline-none focus:border-[#1a1a1a] mb-2"
          />
        </div>

        {/* Case list */}
        <div className="flex-1 overflow-y-auto px-6 pb-2 min-h-[100px]">
          {loading && <div className="text-[13px] text-[#646462] py-3">Cargando casos…</div>}
          {!loading && candidates.length === 0 && (
            <div className="text-[13px] text-[#646462] py-3">No hay casos disponibles para fusionar.</div>
          )}
          {candidates.map((c: any) => {
            const isSelected = selectedTarget?.id === c.id;
            const ch = c.source_channel ?? c.channel ?? '—';
            return (
              <button
                key={c.id}
                onClick={() => setSelectedTarget(isSelected ? null : c)}
                className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 transition-colors ${
                  isSelected ? 'bg-[#1a1a1a] text-white' : 'hover:bg-[#f8f8f7]'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[11px] font-bold ${isSelected ? 'bg-white/20 text-white' : 'bg-[#e9eae6] text-[#646462]'}`}>
                  {ch[0]?.toUpperCase() ?? 'C'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[13px] font-semibold truncate ${isSelected ? 'text-white' : 'text-[#1a1a1a]'}`}>
                    {c.case_number ?? c.id}
                  </div>
                  <div className={`text-[11.5px] truncate ${isSelected ? 'text-white/70' : 'text-[#646462]'}`}>
                    {c.customer_id ?? '—'} · {c.type ?? '—'} · {c.status ?? '—'}
                  </div>
                </div>
                {isSelected && (
                  <svg viewBox="0 0 16 16" className="w-4 h-4 fill-white flex-shrink-0"><path d="M13.7 3.3a1 1 0 0 0-1.4 0L6 9.6 3.7 7.3a1 1 0 0 0-1.4 1.4l3 3a1 1 0 0 0 1.4 0l7-7a1 1 0 0 0 0-1.4z"/></svg>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#e9eae6] flex items-center justify-between">
          <button onClick={onClose} className="h-9 px-4 rounded-full bg-[#f8f8f7] text-[13px] font-semibold text-[#1a1a1a] hover:bg-[#e9eae6]">
            Cancelar
          </button>
          <button
            onClick={doMerge}
            disabled={!selectedTarget || merging}
            className="h-9 px-5 rounded-full bg-[#1a1a1a] text-white text-[13px] font-semibold disabled:opacity-40 hover:bg-[#333] transition-colors"
          >
            {merging ? 'Fusionando…' : selectedTarget ? `Fusionar en ${selectedTarget.case_number ?? selectedTarget.id}` : 'Selecciona un caso'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NewConversationModal — minimal modal to create a case via POST /cases.
// Lets the agent pick channel/priority/type and optionally jot a first
// message that posts as the customer's inbound. On success we navigate to
// the new case via the URL deep-link (?case=<id>) so the rest of the app
// picks it up immediately.
// ─────────────────────────────────────────────────────────────────────────────

const NEW_CONV_CHANNELS: Array<{ value: string; label: string }> = [
  { value: 'email',      label: 'Email' },
  { value: 'web_chat',   label: 'Chat web' },
  { value: 'whatsapp',   label: 'WhatsApp' },
  { value: 'sms',        label: 'SMS' },
  { value: 'messenger',  label: 'Messenger' },
  { value: 'phone',      label: 'Voz' },
];
const NEW_CONV_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

// ── Recipient type for new-conversation picker ───────────────────────────────
type NewConvRecipient =
  | { kind: 'customer'; id: string; name: string; email: string; segment?: string; channel?: string }
  | { kind: 'member';   id: string; userId: string; name: string; email: string; role?: string }
  | { kind: 'team';     id: string; name: string; description?: string };

function NewConversationModal({
  onClose,
  onCreated,
  onAction,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  onAction: (message: string, type?: 'success' | 'error') => void;
}) {
  const [channel, setChannel] = useState('email');
  const [priority, setPriority] = useState('medium');
  const [type, setType] = useState('general');
  const [tagsInput, setTagsInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Recipient state
  const [recipientQuery, setRecipientQuery] = useState('');
  const [recipientFocus, setRecipientFocus] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<NewConvRecipient | null>(null);

  // Fetch all three lists in parallel
  const { data: rawCustomers, loading: loadingCust }   = useApi(() => customersApi.list({ limit: '80' }), [], []);
  const { data: rawMembers,   loading: loadingMem  }   = useApi(() => iamApi.members(), [], []);
  const { data: rawTeams,     loading: loadingTeams }  = useApi(() => iamApi.teams(), [], []);

  const customers: NewConvRecipient[] = useMemo(() => {
    const list = Array.isArray(rawCustomers) ? rawCustomers : [];
    return list.map((c: any) => ({
      kind: 'customer' as const,
      id: c.id,
      name: c.canonical_name || c.name || c.id,
      email: c.canonical_email || c.email || '',
      segment: c.segment,
      channel: c.preferred_channel,
    }));
  }, [rawCustomers]);

  const members: NewConvRecipient[] = useMemo(() => {
    const list = Array.isArray(rawMembers) ? rawMembers : [];
    return list.map((m: any) => ({
      kind: 'member' as const,
      id: m.id || m.user_id,
      userId: m.user_id || m.id,
      name: m.name || m.full_name || m.email || m.id,
      email: m.email || '',
      role: m.role_name,
    }));
  }, [rawMembers]);

  const teams: NewConvRecipient[] = useMemo(() => {
    const list = Array.isArray(rawTeams) ? rawTeams : (rawTeams as any)?.teams ?? [];
    return list.map((t: any) => ({
      kind: 'team' as const,
      id: t.id || t.team_id,
      name: t.name || t.id,
      description: t.description,
    }));
  }, [rawTeams]);

  // Filter by search query
  const q = recipientQuery.trim().toLowerCase();
  const filteredCustomers = q
    ? customers.filter(c => `${c.name} ${(c as any).email ?? ''}`.toLowerCase().includes(q))
    : customers;
  const filteredMembers   = q
    ? members.filter(m => `${m.name} ${(m as any).email ?? ''} ${(m as any).role ?? ''}`.toLowerCase().includes(q))
    : members;
  const filteredTeams     = q
    ? teams.filter(t => `${t.name} ${(t as any).description ?? ''}`.toLowerCase().includes(q))
    : teams;

  const showDropdown = recipientFocus && !selectedRecipient &&
    (filteredCustomers.length > 0 || filteredMembers.length > 0 || filteredTeams.length > 0);

  function pickRecipient(r: NewConvRecipient) {
    setSelectedRecipient(r);
    setRecipientQuery('');
    setRecipientFocus(false);
  }

  function clearRecipient() {
    setSelectedRecipient(null);
    setRecipientQuery('');
  }

  // Segment / kind pill colours
  function segmentColor(seg?: string) {
    if (seg === 'vip') return 'bg-amber-100 text-amber-800';
    if (seg === 'premium') return 'bg-purple-100 text-purple-700';
    return 'bg-gray-100 text-gray-600';
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean).slice(0, 10);
      const payload: Record<string, any> = {
        type: type.trim() || 'general',
        priority,
        status: 'open',
        source_channel: channel,
        tags,
      };
      if (selectedRecipient?.kind === 'customer') {
        payload.customer_id = selectedRecipient.id;
      } else if (selectedRecipient?.kind === 'member') {
        payload.assigned_user_id = selectedRecipient.userId;
      } else if (selectedRecipient?.kind === 'team') {
        payload.assigned_team_id = selectedRecipient.id;
      }
      const created = await casesApi.create(payload);
      const newId = created?.id || created?.case?.id;
      if (!newId) { onAction('Caso creado sin ID devuelto', 'error'); onClose(); return; }
      onAction('Conversación creada');
      onCreated(newId);
      onClose();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo crear la conversación', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const loading = loadingCust || loadingMem || loadingTeams;

  return (
    <div className="fixed inset-0 z-[100] bg-black/25 flex items-center justify-center" onClick={onClose}>
      <div
        className="w-[520px] max-h-[90vh] rounded-2xl bg-white border border-[#e9eae6] shadow-[0px_20px_60px_rgba(20,20,20,0.26)] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-[#e9eae6]">
          <h3 className="text-[16px] font-semibold text-[#1a1a1a] mb-0.5">Nueva conversación</h3>
          <p className="text-[12.5px] text-[#646462]">Elige el destinatario y configura el canal antes de enviar.</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">

          {/* ── Para (recipient picker) ─────────────────────────────────── */}
          <div>
            <label className="block text-[12px] font-semibold text-[#646462] mb-1.5">Para</label>
            {selectedRecipient ? (
              /* Selected chip */
              <div className="flex items-center gap-2 h-10 px-3 rounded-xl border border-[#1a1a1a] bg-[#f8f8f7]">
                <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold ${selectedRecipient.kind === 'customer' ? 'bg-[#e7e2fd] text-[#5b21b6]' : selectedRecipient.kind === 'member' ? 'bg-[#d1fae5] text-[#065f46]' : 'bg-[#dbeafe] text-[#1e40af]'}`}>
                  {selectedRecipient.kind === 'customer' ? 'C' : selectedRecipient.kind === 'member' ? 'M' : 'E'}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-semibold text-[#1a1a1a] truncate">{selectedRecipient.name}</span>
                  {selectedRecipient.kind !== 'team' && (
                    <span className="text-[11.5px] text-[#646462] ml-1.5">{(selectedRecipient as any).email}</span>
                  )}
                  {selectedRecipient.kind === 'team' && (
                    <span className="text-[11.5px] text-[#646462] ml-1.5">Equipo</span>
                  )}
                </div>
                <button onClick={clearRecipient} className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-[#e9eae6] text-[#646462]">
                  <svg viewBox="0 0 12 12" className="w-3 h-3 fill-current"><path d="M9.5 2.5 6 6m0 0L2.5 9.5M6 6 2.5 2.5M6 6l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>
                </button>
              </div>
            ) : (
              /* Search input + dropdown */
              <div className="relative">
                <input
                  autoFocus
                  value={recipientQuery}
                  onChange={e => setRecipientQuery(e.target.value)}
                  onFocus={() => setRecipientFocus(true)}
                  onBlur={() => setTimeout(() => setRecipientFocus(false), 150)}
                  placeholder={loading ? 'Cargando destinatarios…' : 'Buscar cliente, miembro o equipo…'}
                  className="w-full h-10 rounded-xl border border-[#e9eae6] px-3 text-[13px] focus:outline-none focus:border-[#1a1a1a]"
                />
                {showDropdown && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white border border-[#e9eae6] rounded-xl shadow-[0px_8px_24px_rgba(20,20,20,0.14)] max-h-[280px] overflow-y-auto">

                    {/* Clientes */}
                    {filteredCustomers.length > 0 && (
                      <>
                        <div className="px-3 pt-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-[#646462]">
                          Clientes ({filteredCustomers.length})
                        </div>
                        {filteredCustomers.slice(0, 12).map(r => (
                          <button
                            key={r.id}
                            onMouseDown={() => pickRecipient(r)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#f8f8f7] text-left"
                          >
                            <div className="w-7 h-7 rounded-full bg-[#e7e2fd] flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-[#5b21b6]">
                              {r.name[0]?.toUpperCase() ?? 'C'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-semibold text-[#1a1a1a] truncate">{r.name}</div>
                              <div className="text-[11.5px] text-[#646462] truncate">{(r as any).email || '—'}</div>
                            </div>
                            {(r as any).segment && (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${segmentColor((r as any).segment)}`}>
                                {(r as any).segment}
                              </span>
                            )}
                          </button>
                        ))}
                        {filteredCustomers.length > 12 && (
                          <div className="px-3 py-1.5 text-[11.5px] text-[#646462]">+{filteredCustomers.length - 12} más — refina la búsqueda</div>
                        )}
                      </>
                    )}

                    {/* Miembros del equipo */}
                    {filteredMembers.length > 0 && (
                      <>
                        <div className={`px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-[#646462] ${filteredCustomers.length > 0 ? 'pt-2 border-t border-[#f0f0ee] mt-1' : 'pt-2.5'}`}>
                          Miembros del equipo ({filteredMembers.length})
                        </div>
                        {filteredMembers.map(r => (
                          <button
                            key={r.id}
                            onMouseDown={() => pickRecipient(r)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#f8f8f7] text-left"
                          >
                            <div className="w-7 h-7 rounded-full bg-[#d1fae5] flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-[#065f46]">
                              {r.name[0]?.toUpperCase() ?? 'M'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-semibold text-[#1a1a1a] truncate">{r.name}</div>
                              <div className="text-[11.5px] text-[#646462] truncate">{(r as any).email || '—'}</div>
                            </div>
                            {(r as any).role && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 flex-shrink-0">
                                {(r as any).role}
                              </span>
                            )}
                          </button>
                        ))}
                      </>
                    )}

                    {/* Equipos */}
                    {filteredTeams.length > 0 && (
                      <>
                        <div className={`px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-[#646462] ${(filteredCustomers.length > 0 || filteredMembers.length > 0) ? 'pt-2 border-t border-[#f0f0ee] mt-1' : 'pt-2.5'}`}>
                          Equipos ({filteredTeams.length})
                        </div>
                        {filteredTeams.map(r => (
                          <button
                            key={r.id}
                            onMouseDown={() => pickRecipient(r)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#f8f8f7] text-left"
                          >
                            <div className="w-7 h-7 rounded-full bg-[#dbeafe] flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-[#1e40af]">
                              E
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-semibold text-[#1a1a1a] truncate">{r.name}</div>
                              {(r as any).description && (
                                <div className="text-[11.5px] text-[#646462] truncate">{(r as any).description}</div>
                              )}
                            </div>
                          </button>
                        ))}
                      </>
                    )}

                    {/* Empty state */}
                    {filteredCustomers.length === 0 && filteredMembers.length === 0 && filteredTeams.length === 0 && (
                      <div className="px-3 py-4 text-[13px] text-[#646462] text-center">Sin resultados para «{recipientQuery}»</div>
                    )}
                    <div className="h-1" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Canal ──────────────────────────────────────────────────────── */}
          <div>
            <label className="block text-[12px] font-semibold text-[#646462] mb-1.5">Canal</label>
            <div className="flex flex-wrap gap-1.5">
              {NEW_CONV_CHANNELS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setChannel(opt.value)}
                  className={`h-7 px-3 rounded-full text-[11.5px] font-semibold border transition-colors ${channel === opt.value ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-[#f8f8f7] text-[#1a1a1a] border-[#e9eae6] hover:bg-[#ededea]'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Prioridad ──────────────────────────────────────────────────── */}
          <div>
            <label className="block text-[12px] font-semibold text-[#646462] mb-1.5">Prioridad</label>
            <div className="flex gap-1.5">
              {NEW_CONV_PRIORITIES.map(opt => (
                <button
                  key={opt}
                  onClick={() => setPriority(opt)}
                  className={`h-7 px-3 rounded-full text-[11.5px] font-semibold border transition-colors ${priority === opt ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-[#f8f8f7] text-[#1a1a1a] border-[#e9eae6] hover:bg-[#ededea]'}`}
                >
                  {titleCase(opt)}
                </button>
              ))}
            </div>
          </div>

          {/* ── Tipo + Etiquetas ────────────────────────────────────────────── */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[12px] font-semibold text-[#646462] mb-1.5">Tipo</label>
              <input
                value={type}
                onChange={e => setType(e.target.value)}
                placeholder="general / refund / billing…"
                className="w-full h-9 rounded-lg border border-[#e9eae6] px-3 text-[13px] focus:outline-none focus:border-[#1a1a1a]"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[12px] font-semibold text-[#646462] mb-1.5">Etiquetas</label>
              <input
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                placeholder="vip, refund, demo"
                className="w-full h-9 rounded-lg border border-[#e9eae6] px-3 text-[13px] focus:outline-none focus:border-[#1a1a1a]"
              />
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#e9eae6] flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={submitting}
            className="h-9 px-4 rounded-full bg-[#f8f8f7] text-[13px] font-semibold text-[#1a1a1a] hover:bg-[#ededea]"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="h-9 px-5 rounded-full bg-[#1a1a1a] text-white text-[13px] font-semibold disabled:opacity-40 hover:bg-[#333] transition-colors"
          >
            {submitting ? 'Creando…' : 'Crear conversación'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ResolutionPlanModal — fetches the AI-built case resolution plan and lets the
// agent run individual steps or the whole plan. Each step shows a kind badge
// (tool / navigate / blocked) and its own Ejecutar button. After execution,
// the trace summary appears under the step. "Ejecutar todo" runs every step
// of kind=tool sequentially via /resolution-plan/run.
// ─────────────────────────────────────────────────────────────────────────────

function ResolutionPlanModal({
  caseId,
  onClose,
  onAction,
  onRefresh,
}: {
  caseId: string;
  onClose: () => void;
  onAction: (message: string, type?: 'success' | 'error') => void;
  onRefresh: () => void;
}) {
  const [planRefresh, setPlanRefresh] = useState(0);
  const [runningStep, setRunningStep] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  // Per-step result keyed by step id: { ok, summary }.
  const [results, setResults] = useState<Record<string, { ok: boolean; summary: string }>>({});

  const { data: plan, loading, error } = useApi(
    () => casesApi.resolutionPlan(caseId),
    [caseId, planRefresh],
  );
  const steps: any[] = Array.isArray(plan?.steps) ? plan.steps : [];

  async function runStep(step: any) {
    if (runningStep || runningAll) return;
    setRunningStep(step.id);
    try {
      const result = await casesApi.runResolutionStep(caseId, step.id);
      const summary = result?.message || result?.trace?.summary || (result?.ok ? 'Paso ejecutado' : 'Paso bloqueado');
      setResults(state => ({ ...state, [step.id]: { ok: !!result?.ok, summary } }));
      onAction(`${step.title}: ${summary}`, result?.ok ? 'success' : 'error');
    } catch (err: any) {
      const summary = err?.message || 'No se pudo ejecutar el paso';
      setResults(state => ({ ...state, [step.id]: { ok: false, summary } }));
      onAction(summary, 'error');
    } finally {
      setRunningStep(null);
    }
  }

  async function runAll() {
    if (runningStep || runningAll) return;
    setRunningAll(true);
    try {
      const result = await casesApi.runResolutionPlan(caseId);
      const summary = result?.message || result?.summary || 'Plan ejecutado';
      onAction(summary, result?.ok ? 'success' : 'error');
      setPlanRefresh(k => k + 1);
      onRefresh();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo ejecutar el plan', 'error');
    } finally {
      setRunningAll(false);
    }
  }

  function kindBadge(kind: string) {
    const map: Record<string, string> = {
      tool:     'bg-[#dbeafe] text-[#1e3a8a]',
      navigate: 'bg-[#f4f4ff] text-[#3b59f6]',
      blocked:  'bg-[#fee2e2] text-[#b91c1c]',
    };
    return <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${map[kind] || 'bg-[#f8f8f7] text-[#646462]'}`}>{kind}</span>;
  }

  return (
    <div className="absolute inset-0 z-50 bg-black/25 flex items-center justify-center" onClick={onClose}>
      <div
        className="w-[560px] max-h-[80vh] rounded-2xl bg-white border border-[#e9eae6] shadow-[0px_16px_40px_rgba(20,20,20,0.22)] p-5 flex flex-col"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <h3 className="text-[16px] font-semibold text-[#1a1a1a]">Plan de resolución con IA</h3>
            <p className="text-[12.5px] text-[#646462] mt-0.5">{plan?.title || 'Pasos sugeridos para cerrar este caso.'}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-[#f8f8f7] text-[#646462] text-[14px] flex items-center justify-center"
            title="Cerrar"
          >×</button>
        </div>
        <div className="flex-1 overflow-y-auto -mx-1 px-1 mt-3">
          {loading && <div className="text-[12.5px] text-[#646462] px-2 py-3">Cargando plan…</div>}
          {error && <div className="text-[12.5px] text-[#b91c1c] px-2 py-3">No se pudo cargar el plan</div>}
          {!loading && !error && steps.length === 0 && (
            <div className="text-[12.5px] text-[#646462] px-2 py-3">No hay pasos sugeridos para este caso todavía.</div>
          )}
          <div className="flex flex-col gap-2">
            {steps.map((step: any, i: number) => {
              const result = results[step.id];
              const kind = step.execution?.kind || 'tool';
              const isBlocked = kind === 'blocked';
              const reason = step.execution?.reason || step.description;
              return (
                <div key={step.id || i} className={`rounded-xl border px-3 py-2.5 ${isBlocked ? 'border-[#fde2e2] bg-[#fef7f7]' : 'border-[#e9eae6] bg-white'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-semibold text-[#646462]">Paso {i + 1}</span>
                        {kindBadge(kind)}
                        {step.execution?.tool && <span className="text-[10.5px] text-[#646462] font-mono">{step.execution.tool}</span>}
                      </div>
                      <p className="text-[13px] font-semibold text-[#1a1a1a] mt-0.5">{step.title || 'Paso'}</p>
                      {reason && <p className="text-[12px] text-[#646462] leading-5 mt-0.5 whitespace-pre-wrap">{reason}</p>}
                      {result && (
                        <p className={`text-[11.5px] mt-1.5 ${result.ok ? 'text-[#16a34a]' : 'text-[#b91c1c]'}`}>{result.ok ? '✓' : '✗'} {result.summary}</p>
                      )}
                    </div>
                    <button
                      onClick={() => runStep(step)}
                      disabled={isBlocked || runningStep === step.id || runningAll}
                      className="h-7 px-3 rounded-full bg-[#1a1a1a] text-white text-[11.5px] font-semibold disabled:bg-[#e9eae6] disabled:text-[#646462] flex-shrink-0"
                    >
                      {runningStep === step.id ? '…' : isBlocked ? 'Bloqueado' : 'Ejecutar'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t border-[#e9eae6]">
          <button
            onClick={() => setPlanRefresh(k => k + 1)}
            disabled={loading || runningAll || !!runningStep}
            className="text-[12px] font-semibold text-[#646462] hover:text-[#1a1a1a] disabled:opacity-50"
          >
            Recargar plan
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="h-8 px-4 rounded-full bg-[#f8f8f7] text-[13px] font-semibold text-[#1a1a1a] hover:bg-[#ededea]"
            >
              Cerrar
            </button>
            <button
              onClick={runAll}
              disabled={loading || runningAll || !!runningStep || steps.length === 0}
              className="h-8 px-4 rounded-full bg-[#1a1a1a] text-white text-[13px] font-semibold disabled:bg-[#e9eae6] disabled:text-[#646462]"
            >
              {runningAll ? 'Ejecutando…' : 'Ejecutar todo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatusChangeModal — generic confirm-with-reason for non-trivial status moves
// (snooze / escalate / close / reopen). Each mode pre-loads helpful presets and
// validates before submitting via casesApi.updateStatus(id, status, reason).
// ─────────────────────────────────────────────────────────────────────────────

type StatusMode = 'snoozed' | 'escalated' | 'closed' | 'open';

const STATUS_MODE_CONFIG: Record<StatusMode, {
  title: string;
  description: string;
  ctaLabel: string;
  ctaClass: string;
  presets: string[];
  reasonRequired: boolean;
  successLabel: string;
}> = {
  snoozed: {
    title: 'Posponer conversación',
    description: 'El caso reaparecerá cuando se cumpla la condición que indiques.',
    ctaLabel: 'Posponer',
    ctaClass: 'bg-[#1a1a1a] text-white',
    presets: ['Esperando respuesta del cliente', 'Esperando confirmación del banco', 'Volver mañana', 'Esperar 4 horas', 'Esperar 1 hora'],
    reasonRequired: true,
    successLabel: 'Caso pospuesto',
  },
  escalated: {
    title: 'Escalar conversación',
    description: 'Indica por qué hay que escalarlo y a quién avisar (opcional).',
    ctaLabel: 'Escalar',
    ctaClass: 'bg-[#b91c1c] text-white',
    presets: ['Caso de alto valor — necesita aprobación', 'Riesgo de fraude detectado', 'Cliente VIP', 'Conflicto entre sistemas (OMS/PSP)', 'Política excede los límites del agente'],
    reasonRequired: true,
    successLabel: 'Caso escalado',
  },
  closed: {
    title: 'Cerrar conversación',
    description: 'Cerrar es definitivo. Indica el motivo del cierre.',
    ctaLabel: 'Cerrar caso',
    ctaClass: 'bg-[#1a1a1a] text-white',
    presets: ['Cliente no respondió', 'Resuelto fuera del canal', 'Spam', 'Duplicado', 'Sin contenido'],
    reasonRequired: true,
    successLabel: 'Caso cerrado',
  },
  open: {
    title: 'Reabrir conversación',
    description: '¿Por qué hay que reabrirlo?',
    ctaLabel: 'Reabrir',
    ctaClass: 'bg-[#1a1a1a] text-white',
    presets: ['Cliente respondió', 'Información nueva', 'Reabierto por error de cierre'],
    reasonRequired: false,
    successLabel: 'Caso reabierto',
  },
};

function StatusChangeModal({
  caseId,
  mode,
  onClose,
  onChanged,
  onAction,
}: {
  caseId: string;
  mode: StatusMode;
  onClose: () => void;
  onChanged: () => void;
  onAction: (message: string, type?: 'success' | 'error') => void;
}) {
  const cfg = STATUS_MODE_CONFIG[mode];
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function confirm() {
    const trimmed = reason.trim();
    if (cfg.reasonRequired && !trimmed) {
      onAction('Indica un motivo antes de continuar', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await casesApi.updateStatus(caseId, mode, trimmed || `Inbox: ${cfg.successLabel}`, 'system');
      onAction(cfg.successLabel);
      onChanged();
      onClose();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo actualizar el estado', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/25 flex items-center justify-center" onClick={onClose}>
      <div
        className="w-[440px] rounded-2xl bg-white border border-[#e9eae6] shadow-[0px_16px_40px_rgba(20,20,20,0.22)] p-5"
        onClick={event => event.stopPropagation()}
      >
        <h3 className="text-[16px] font-semibold text-[#1a1a1a] mb-1">{cfg.title}</h3>
        <p className="text-[12.5px] text-[#646462] mb-3">{cfg.description}</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {cfg.presets.map(preset => (
            <button
              key={preset}
              onClick={() => setReason(preset)}
              className="h-7 px-3 rounded-full bg-[#f8f8f7] border border-[#e9eae6] text-[11.5px] text-[#1a1a1a] hover:bg-[#ededea]"
            >
              {preset}
            </button>
          ))}
        </div>
        <textarea
          autoFocus
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder={cfg.reasonRequired ? 'Motivo (obligatorio)…' : 'Motivo (opcional)…'}
          className="w-full min-h-[80px] rounded-lg border border-[#e9eae6] px-3 py-2 text-[13px] resize-none focus:outline-none focus:border-[#1a1a1a]"
        />
        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            disabled={submitting}
            className="h-8 px-4 rounded-full bg-[#f8f8f7] text-[13px] font-semibold text-[#1a1a1a] hover:bg-[#ededea]"
          >
            Cancelar
          </button>
          <button
            onClick={confirm}
            disabled={submitting || (cfg.reasonRequired && !reason.trim())}
            className={`h-8 px-4 rounded-full text-[13px] font-semibold disabled:bg-[#e9eae6] disabled:text-[#646462] ${cfg.ctaClass}`}
          >
            {submitting ? '…' : cfg.ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AssignModal — pick a workspace member to own this case.
// Renders the member list from /iam/members, search-filters by name/email/role,
// calls casesApi.assign(caseId, user_id) and closes on success.
// ─────────────────────────────────────────────────────────────────────────────

// Deterministic avatar colour from a string (member id or name)
function avatarColor(seed: string): string {
  const palette = ['#e7e2fd', '#d1fae5', '#fee2e2', '#fef3c7', '#dbeafe', '#fce7f3', '#e0f2fe', '#f0fdf4'];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffffffff;
  return palette[Math.abs(h) % palette.length];
}

function AssignModal({
  caseId,
  currentAssignee,
  onClose,
  onAssigned,
  onAction,
}: {
  caseId: string;
  currentAssignee?: string;
  onClose: () => void;
  onAssigned: () => void;
  onAction: (message: string, type?: 'success' | 'error') => void;
}) {
  const [tab, setTab] = useState<'members' | 'teams'>('members');
  const [query, setQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { data: members, loading: loadingMembers, error: errorMembers } = useApi(() => iamApi.members(), [], []);
  const { data: teams,   loading: loadingTeams,   error: errorTeams   } = useApi(() => iamApi.teams(),   [], []);

  const filteredMembers = useMemo(() => {
    const list = Array.isArray(members) ? members : [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((m: any) => {
      const haystack = `${m.name || ''} ${m.full_name || ''} ${m.email || ''} ${m.role_name || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [members, query]);
  const filteredTeams = useMemo(() => {
    const list = Array.isArray(teams) ? teams : [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((t: any) => `${t.name || ''} ${t.description || ''}`.toLowerCase().includes(q));
  }, [teams, query]);

  async function assignTo(opts: { user_id?: string | null; team_id?: string | null }) {
    if (submitting) return;
    setSubmitting(true);
    try {
      await casesApi.assign(caseId, opts.user_id || undefined, opts.team_id || undefined);
      onAction(opts.user_id ? 'Asignado a persona' : opts.team_id ? 'Asignado al equipo' : 'Asignación retirada');
      onAssigned();
      onClose();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo asignar el caso', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/25 flex items-center justify-center" onClick={onClose}>
      <div
        className="w-[440px] max-h-[560px] rounded-2xl bg-white border border-[#e9eae6] shadow-[0px_16px_40px_rgba(20,20,20,0.22)] p-5 flex flex-col"
        onClick={event => event.stopPropagation()}
      >
        <h3 className="text-[16px] font-semibold text-[#1a1a1a] mb-1">Asignar conversación</h3>
        <p className="text-[12.5px] text-[#646462] mb-3">
          {currentAssignee ? <>Asignado actualmente a <span className="font-semibold text-[#1a1a1a]">{currentAssignee}</span>.</> : 'Sin asignar.'}
        </p>
        <div className="flex items-center gap-1 border-b border-[#e9eae6] mb-3 -mx-5 px-5">
          {([['members', 'Personas'], ['teams', 'Equipos']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`text-[13px] h-8 px-2 mr-2 ${tab === id ? 'font-semibold text-[#1a1a1a] border-b-2 border-[#1a1a1a]' : 'text-[#646462] hover:text-[#1a1a1a]'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={tab === 'members' ? 'Buscar persona…' : 'Buscar equipo…'}
          className="w-full h-9 rounded-lg border border-[#e9eae6] px-3 text-[13px] focus:outline-none focus:border-[#1a1a1a]"
        />
        <div className="flex-1 overflow-y-auto mt-3 -mx-1 flex flex-col gap-0.5 min-h-[160px]">
          {tab === 'members' ? (
            <>
              {loadingMembers && <div className="text-[13px] text-[#646462] px-2 py-3">Cargando compañeros…</div>}
              {errorMembers && <div className="text-[13px] text-[#b91c1c] px-2 py-3">No se pudo cargar la lista</div>}
              {!loadingMembers && !errorMembers && filteredMembers.length === 0 && (
                <div className="text-[13px] text-[#646462] px-2 py-3">Sin coincidencias.</div>
              )}
              {filteredMembers.map((m: any) => {
                const name = m.name || m.full_name || m.email || 'Sin nombre';
                const initial = String(name).slice(0, 1).toUpperCase();
                const seed = m.id || m.user_id || m.email || name;
                const bgColor = avatarColor(seed);
                const isOnline = m.status === 'active' || m.online === true || m.availability === 'online';
                return (
                  <button
                    key={m.id || m.user_id || m.email}
                    onClick={() => assignTo({ user_id: m.id || m.user_id, team_id: null })}
                    disabled={submitting}
                    className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#f3f3f1] text-left disabled:opacity-50"
                  >
                    <div className="relative flex-shrink-0">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: bgColor }}>
                        <span className="text-[12px] font-semibold text-[#1a1a1a]">{initial}</span>
                      </div>
                      {isOnline && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#1a1a1a] truncate">{name}</p>
                      {m.email && <p className="text-[11.5px] text-[#646462] truncate">{m.email}</p>}
                    </div>
                    {m.role_name && (
                      <span className="text-[10.5px] text-[#646462] bg-[#f3f3f1] rounded px-1.5 py-0.5 flex-shrink-0">{titleCase(m.role_name)}</span>
                    )}
                  </button>
                );
              })}
            </>
          ) : (
            <>
              {loadingTeams && <div className="text-[13px] text-[#646462] px-2 py-3">Cargando equipos…</div>}
              {errorTeams && <div className="text-[13px] text-[#b91c1c] px-2 py-3">No se pudo cargar la lista</div>}
              {!loadingTeams && !errorTeams && filteredTeams.length === 0 && (
                <div className="text-[13px] text-[#646462] px-2 py-3">Sin equipos creados todavía.</div>
              )}
              {filteredTeams.map((t: any) => (
                <button
                  key={t.id}
                  onClick={() => assignTo({ user_id: null, team_id: t.id })}
                  disabled={submitting}
                  className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#f3f3f1] text-left disabled:opacity-50"
                >
                  <div className="w-7 h-7 rounded-lg bg-[#dbeafe] flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><circle cx="6" cy="5" r="2.5"/><path d="M1.8 12.5c.4-2 2.1-3.2 4.2-3.2s3.8 1.2 4.2 3.2v.5H1.8v-.5z"/><circle cx="11.5" cy="6" r="2"/><path d="M9.5 9.4c.6-.2 1.3-.3 2-.3 1.7 0 3 .9 3.4 2.5v.4H10.6c-.1-.9-.4-1.8-1.1-2.6z"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#1a1a1a] truncate">{t.name}</p>
                    {t.description && <p className="text-[11.5px] text-[#646462] truncate">{t.description}</p>}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-[#e9eae6]">
          <button
            onClick={() => assignTo({ user_id: null, team_id: null })}
            disabled={submitting}
            className="text-[12.5px] font-semibold text-[#b91c1c] hover:underline disabled:opacity-50"
          >
            Quitar asignación
          </button>
          <button
            onClick={onClose}
            className="h-8 px-4 rounded-full bg-[#f8f8f7] text-[13px] font-semibold text-[#1a1a1a] hover:bg-[#ededea]"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ApprovalBanner ──────────────────────────────────────────────────────────
// Shown at the top of the conversation thread when a case has approval_state
// === 'pending' or status === 'escalated'. Lets an agent approve, reject, or
// further escalate the action the AI recommended.
function ApprovalBanner({
  caseId,
  approvalState,
  aiRecommendation,
  riskLevel,
  onApproved,
  onRejected,
}: {
  caseId: string;
  approvalState?: string;
  aiRecommendation?: string;
  riskLevel?: string;
  onApproved?: () => void;
  onRejected?: () => void;
}) {
  const [busy, setBusy] = useState<'approve' | 'reject' | 'escalate' | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function handleAction(action: 'approve' | 'reject' | 'escalate') {
    setBusy(action);
    try {
      if (action === 'approve') {
        await casesApi.patch(caseId, { approval_state: 'approved', status: 'in_progress' });
        setDone('Aprobado');
        onApproved?.();
      } else if (action === 'reject') {
        await casesApi.patch(caseId, { approval_state: 'rejected', status: 'closed' });
        setDone('Rechazado');
        onRejected?.();
      } else {
        await casesApi.patch(caseId, { status: 'escalated', assigned_user_id: null });
        setDone('Escalado a humano');
        onApproved?.();
      }
    } catch (err) {
      console.error('ApprovalBanner action failed:', err);
    } finally {
      setBusy(null);
    }
  }

  const riskColor = riskLevel === 'high' || riskLevel === 'critical'
    ? 'bg-red-100 text-red-700 border-red-300'
    : riskLevel === 'medium'
    ? 'bg-amber-100 text-amber-700 border-amber-300'
    : 'bg-green-100 text-green-700 border-green-300';

  if (done) {
    return (
      <div className="mx-4 mb-3 rounded-xl bg-green-50 border border-green-200 px-4 py-3 flex items-center gap-2">
        <svg viewBox="0 0 16 16" className="w-4 h-4 fill-green-600 flex-shrink-0"><path d="M13.7 3.3a1 1 0 0 0-1.4 0L6 9.6 3.7 7.3a1 1 0 0 0-1.4 1.4l3 3a1 1 0 0 0 1.4 0l7-7a1 1 0 0 0 0-1.4z"/></svg>
        <span className="text-[13px] text-green-800 font-medium">{done} correctamente</span>
      </div>
    );
  }

  // Expired / rejected — show historical context banner, allow re-open
  if (approvalState === 'expired' || approvalState === 'rejected') {
    const isExpired = approvalState === 'expired';
    return (
      <div className={`mx-4 mb-3 rounded-xl border px-4 py-3 ${isExpired ? 'bg-orange-50 border-orange-200' : 'bg-red-50 border-red-200'}`}>
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" className={`w-4 h-4 flex-shrink-0 ${isExpired ? 'fill-orange-500' : 'fill-red-500'}`}><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4zm0 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>
          <div className="flex-1 min-w-0">
            <span className={`text-[13px] font-semibold ${isExpired ? 'text-orange-900' : 'text-red-900'}`}>
              {isExpired ? 'Aprobación expirada — la IA escaló al equipo' : 'Acción rechazada por el agente'}
            </span>
            {aiRecommendation && (
              <p className={`text-[12px] mt-0.5 leading-relaxed ${isExpired ? 'text-orange-800' : 'text-red-800'}`}>{aiRecommendation}</p>
            )}
          </div>
          {riskLevel && (
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${riskColor}`}>
              Riesgo: {riskLevel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => handleAction('approve')}
            disabled={busy !== null}
            className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-[12px] font-semibold transition-colors"
          >
            {busy === 'approve' ? '…' : 'Aprobar ahora'}
          </button>
          <button
            onClick={() => handleAction('escalate')}
            disabled={busy !== null}
            className="px-3 py-1.5 rounded-lg bg-[#f8f8f7] border border-[#e9eae6] hover:bg-[#e9eae6] disabled:opacity-50 text-[#1a1a1a] text-[12px] font-semibold transition-colors"
          >
            {busy === 'escalate' ? '…' : 'Re-escalar'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 mb-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
      <div className="flex items-start gap-2 mb-2">
        <svg viewBox="0 0 16 16" className="w-4 h-4 fill-amber-500 flex-shrink-0 mt-0.5"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4zm0 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-amber-900">Acción pendiente de aprobación</span>
            {riskLevel && (
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${riskColor}`}>
                Riesgo: {riskLevel}
              </span>
            )}
          </div>
          {aiRecommendation && (
            <p className="text-[12px] text-amber-800 mt-0.5 leading-relaxed">{aiRecommendation}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => handleAction('approve')}
          disabled={busy !== null}
          className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-[12px] font-semibold transition-colors"
        >
          {busy === 'approve' ? '…' : 'Aprobar'}
        </button>
        <button
          onClick={() => handleAction('reject')}
          disabled={busy !== null}
          className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-[12px] font-semibold transition-colors"
        >
          {busy === 'reject' ? '…' : 'Rechazar'}
        </button>
        <button
          onClick={() => handleAction('escalate')}
          disabled={busy !== null}
          className="px-3 py-1.5 rounded-lg bg-[#f8f8f7] border border-[#e9eae6] hover:bg-[#e9eae6] disabled:opacity-50 text-[#1a1a1a] text-[12px] font-semibold transition-colors"
        >
          {busy === 'escalate' ? '…' : 'Escalar a humano'}
        </button>
      </div>
    </div>
  );
}

function ConversationPanel({
  selectedConv,
  inboxView,
  onRefresh,
  onAction,
  replyText,
  setReplyText,
  replyTab,
  setReplyTab,
  panels,
  onTogglePanel,
  onNewConversation,
}: {
  selectedConv: Conversation;
  inboxView: any;
  onRefresh: () => void;
  onAction: (message: string, type?: 'success' | 'error') => void;
  replyText: string;
  setReplyText: Dispatch<SetStateAction<string>>;
  replyTab: 'responder' | 'nota' | 'datosIA';
  setReplyTab: Dispatch<SetStateAction<'responder' | 'nota' | 'datosIA'>>;
  panels?: { left: boolean; list: boolean; right: boolean };
  onTogglePanel?: (which: 'left' | 'list' | 'right') => void;
  onNewConversation?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  // Star persists across reloads via localStorage keyed by caseId. The
  // Star is now backed by the case_stars table per-user. We fetch the
  // current state when the active case changes, then optimistically flip on
  // toggle. localStorage is no longer used for this.
  const [starred, setStarred] = useState<boolean>(false);
  useEffect(() => {
    let cancelled = false;
    casesApi.isStarred(selectedConv.id)
      .then(res => { if (!cancelled) setStarred(!!res?.starred); })
      .catch(() => { if (!cancelled) setStarred(false); });
    return () => { cancelled = true; };
  }, [selectedConv.id]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Reply snippets / macros — now backed by /api/macros instead of
  // localStorage. Loaded once when the snippets dropdown opens; mutations
  // refetch.
  type Snippet = { id: string; label: string; body: string };
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [showSnippets, setShowSnippets] = useState(false);
  const [snippetsLoading, setSnippetsLoading] = useState(false);
  async function reloadSnippets() {
    setSnippetsLoading(true);
    try {
      const items = await macrosApi.list();
      setSnippets((items || []).map((m: any) => ({ id: String(m.id), label: m.label, body: m.body })));
    } catch (err: any) {
      onAction(err?.message || 'No se pudieron cargar las plantillas', 'error');
    } finally {
      setSnippetsLoading(false);
    }
  }
  useEffect(() => {
    if (showSnippets) reloadSnippets();
  }, [showSnippets]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const latestDraft = getInboxLatestDraft(inboxView);
  // Real backend messages only — no mock fallback. Empty thread = empty UI.
  const allMessages = getInboxMessages(inboxView).map(normalizePrototypeMessage);
  const displayMessages = showSearch && searchQuery.trim()
    ? allMessages.filter((m: any) => (m.text || '').toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : allMessages;

  useEffect(() => {
    // Only hydrate from latest backend draft when the case changes or the
    // backend draft itself changes — otherwise we'd clobber what the user is
    // typing (or what the Copilot just inserted) on every refresh.
    setReplyText(latestDraft?.content || '');
    setReplyTab('responder');
    setAttachments([]);
    setShowEmojiPicker(false);
  }, [selectedConv.id, latestDraft?.id, latestDraft?.content]);

  // Backend caps a single attachment's data URL at ~5 MB encoded; raw file
  // size therefore needs to stay under ~3.7 MB. We round to 4 MB as the
  // user-facing limit. We also cap the total per reply at 10 attachments.
  const ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;
  const ATTACHMENT_MAX_COUNT = 10;
  function handleFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach(file => {
      if (attachments.length >= ATTACHMENT_MAX_COUNT) {
        onAction(`Solo puedes adjuntar hasta ${ATTACHMENT_MAX_COUNT} archivos por respuesta`, 'error');
        return;
      }
      if (file.size > ATTACHMENT_MAX_BYTES) {
        onAction(`"${file.name}" supera el límite de ${formatBytes(ATTACHMENT_MAX_BYTES)}`, 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = event => {
        setAttachments(current => [...current, {
          id: `att-${Date.now()}-${Math.random()}`,
          name: file.name,
          size: file.size,
          type: file.type,
          dataUrl: typeof event.target?.result === 'string' ? event.target.result : undefined,
          file,
        }]);
      };
      reader.onerror = () => onAction(`No se pudo leer "${file.name}"`, 'error');
      reader.readAsDataURL(file);
    });
  }

  function insertAtCursor(value: string) {
    const el = textareaRef.current;
    if (!el) {
      setReplyText(current => current + value);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setReplyText(current => current.slice(0, start) + value + current.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + value.length, start + value.length);
    });
  }

  function applyComposerFormat(kind: 'bold' | 'italic' | 'link') {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = replyText.slice(start, end) || (kind === 'link' ? 'texto' : 'texto');
    const wrapped = kind === 'bold' ? `**${selected}**` : kind === 'italic' ? `_${selected}_` : `[${selected}](https://)`;
    setReplyText(replyText.slice(0, start) + wrapped + replyText.slice(end));
  }

  async function updateStatus(status: string, label: string) {
    try {
      await casesApi.updateStatus(selectedConv.id, status, `Prototype inbox: ${label}`, 'system');
      onAction(label);
      onRefresh();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo actualizar el caso', 'error');
    } finally {
      setMenuOpen(false);
    }
  }

  async function resolveCase() {
    try {
      await casesApi.resolve(selectedConv.id);
      onAction('Caso resuelto');
      onRefresh();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo resolver el caso', 'error');
    }
  }

  async function submitReply() {
    const content = replyText.trim();
    if (!content && attachments.length === 0) return;
    try {
      // Upload each attachment to Supabase Storage first, then send only
      // the storage key + signed URL to the reply endpoint instead of the
      // raw data URL. Falls through gracefully — if upload fails we keep
      // the data URL so the message still gets sent (degraded mode).
      let attachmentPayload: Array<{ id: string; name: string; size: number; type: string; url?: string; dataUrl?: string; key?: string }> | undefined;
      if (attachments.length > 0) {
        attachmentPayload = [];
        for (const att of attachments) {
          if (!att.dataUrl) continue;
          try {
            const uploaded = await attachmentsApi.upload({ name: att.name, type: att.type, dataUrl: att.dataUrl });
            attachmentPayload.push({
              id: att.id,
              name: uploaded.name,
              size: uploaded.size,
              type: uploaded.type,
              url:  uploaded.url,
              key:  uploaded.key,
            });
          } catch (err: any) {
            console.warn('Storage upload failed; sending inline as fallback:', err?.message);
            attachmentPayload.push({ id: att.id, name: att.name, size: att.size, type: att.type, dataUrl: att.dataUrl });
          }
        }
      }
      if (replyTab === 'nota') {
        const noteSummary = attachments.length
          ? `\n\nAdjuntos: ${attachments.map(a => a.name).join(', ')}`
          : '';
        await casesApi.addInternalNote(selectedConv.id, `${content}${noteSummary}`.trim());
        onAction('Nota interna añadida');
      } else {
        await casesApi.reply(
          selectedConv.id,
          content,
          latestDraft?.id,
          attachmentPayload && attachmentPayload.length > 0 ? attachmentPayload : undefined,
        );
        onAction(attachments.length > 0
          ? `Respuesta enviada con ${attachments.length} adjunto${attachments.length === 1 ? '' : 's'}`
          : 'Respuesta enviada');
      }
      setReplyText('');
      setAttachments([]);
      onRefresh();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo enviar', 'error');
    }
  }

  const channelLabel = selectedConv.channel.split('·')[0].trim();

  // Status modal mode: opens a reason-prompt modal for snooze/escalate/close
  // /reopen instead of firing the change immediately. Null = modal closed.
  const [statusMode, setStatusMode] = useState<StatusMode | null>(null);

  async function toggleStar() {
    // Optimistic flip; revert on error.
    const next = !starred;
    setStarred(next);
    try {
      if (next) {
        await casesApi.starCase(selectedConv.id);
        onAction('Caso destacado', 'success');
      } else {
        await casesApi.unstarCase(selectedConv.id);
        onAction('Caso desmarcado', 'success');
      }
    } catch (err: any) {
      setStarred(!next);
      onAction(err?.message || 'No se pudo cambiar el destacado', 'error');
    }
  }

  function exportConversationAsText() {
    const lines = [
      `# Caso ${selectedConv.id}`,
      `Cliente: ${(selectedConv as any).customerName || '—'}`,
      `Canal: ${channelLabel}`,
      '',
      ...allMessages.map((m: any) => `[${m.time || ''}] ${m.from || 'agent'}: ${m.text || ''}`),
    ];
    const text = lines.join('\n');
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text)
        .then(() => onAction('Conversación copiada al portapapeles'))
        .catch(() => onAction('No se pudo copiar al portapapeles', 'error'));
    } else {
      onAction('Portapapeles no disponible en este navegador', 'error');
    }
    setMenuOpen(false);
  }

  // Export to PDF via the browser's print pipeline. We open a hidden iframe,
  // write a self-contained printable HTML document with the case header +
  // every message, then call print() on the iframe so the user gets the
  // native "Save as PDF" dialog. No extra dependencies needed.
  function exportConversationAsPdf() {
    setMenuOpen(false);
    if (typeof window === 'undefined') {
      onAction('Exportación no disponible en este entorno', 'error');
      return;
    }
    const escape = (s: string) => String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const customer = (selectedConv as any).customerName || '—';
    const email = (selectedConv as any).customerEmail || '';
    const messagesHtml = allMessages.map((m: any) => `
      <div class="msg msg-${escape(m.from || 'agent')}">
        <div class="meta">${escape(m.senderName || m.from || 'agente')} · ${escape(m.time || '')}</div>
        <div class="body">${escape(m.text || '').replace(/\n/g, '<br />')}</div>
      </div>
    `).join('');
    const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<title>Caso ${escape(selectedConv.id)} — ${escape(customer)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, Arial, sans-serif; color: #1a1a1a; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta-top { font-size: 12px; color: #646462; margin-bottom: 16px; }
  .msg { border: 1px solid #e9eae6; border-radius: 12px; padding: 10px 12px; margin: 0 0 8px; page-break-inside: avoid; }
  .msg-user { background: #f8f8f7; }
  .msg-agent { background: #fff; }
  .msg-bot { background: #f4f4ff; }
  .meta { font-size: 11px; color: #646462; margin-bottom: 4px; }
  .body { font-size: 13px; line-height: 1.4; white-space: pre-wrap; }
  @page { size: A4; margin: 18mm; }
</style></head>
<body>
  <h1>Caso ${escape(selectedConv.id)}</h1>
  <div class="meta-top">
    Cliente: <strong>${escape(customer)}</strong>${email ? ` · ${escape(email)}` : ''}<br />
    Canal: ${escape(channelLabel || '—')} · Estado: ${escape(selectedConv.status || '—')} · Prioridad: ${escape(selectedConv.priority || '—')}<br />
    Exportado: ${escape(new Date().toLocaleString('es-ES'))}
  </div>
  ${messagesHtml || '<p style="color:#646462; font-size:13px">Sin mensajes en este caso todavía.</p>'}
</body></html>`;
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      onAction('No se pudo abrir el cuadro de impresión', 'error');
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    // Wait for fonts/layout, then trigger print. Cleanup the iframe a bit
    // later so the print dialog stays open in browsers that need the iframe
    // alive while choosing the destination.
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err: any) {
        onAction(err?.message || 'No se pudo imprimir', 'error');
      } finally {
        setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* removed already */ } }, 1500);
      }
    }, 250);
  }

  const menuActions = [
    { icon: '👥', label: 'Asignar a un compañero',    shortcut: '', onClick: () => { setShowAssignModal(true); setMenuOpen(false); } },
    { icon: '⇄', label: 'Fusionar con...',          shortcut: 'Ctrl+Shift+M', onClick: () => { setShowMergeModal(true); setMenuOpen(false); } },
    { icon: '✚', label: 'Nueva conversación',       shortcut: '', onClick: () => { onNewConversation?.(); setMenuOpen(false); } },
    { icon: '↗', label: 'Exportar como texto',      shortcut: '', onClick: exportConversationAsText },
    { icon: '↗', label: 'Exportar como PDF',        shortcut: '', onClick: exportConversationAsPdf },
    { icon: '↻', label: 'Reabrir caso',              shortcut: '', onClick: () => { setStatusMode('open');      setMenuOpen(false); } },
    { icon: '⚠', label: 'Escalar caso',              shortcut: '', onClick: () => { setStatusMode('escalated'); setMenuOpen(false); } },
    { icon: '✕', label: 'Cerrar caso',               shortcut: '', onClick: () => { setStatusMode('closed');    setMenuOpen(false); } },
  ];

  return (
    <div className="flex flex-col h-full flex-1 min-w-[400px] bg-white rounded-2xl shadow-[0px_1px_2px_rgba(20,20,20,0.15)] overflow-hidden">
      <div className="flex flex-col gap-4 pt-4 flex-shrink-0">
        <div className="flex items-center px-6 relative">
          <div className="flex-1 min-w-0">
            <h2 className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a] truncate">{channelLabel}</h2>
          </div>
          <div className="flex items-center gap-1">
            {/* Per-panel toggles. Each button reflects the current open/hidden
                state of one of the three sidebars; click to flip it. */}
            {onTogglePanel && panels && (
              <div className="flex items-center gap-0.5 mr-1 pr-1 border-r border-[#e9eae6]">
                <button
                  onClick={() => onTogglePanel('left')}
                  title={panels.left ? 'Esconder sidebar' : 'Mostrar sidebar'}
                  className={`w-7 h-7 flex items-center justify-center rounded ${panels.left ? 'text-[#1a1a1a] bg-[#f8f8f7]' : 'text-[#646462] hover:bg-[#f8f8f7]'}`}
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                    <rect x="2" y="3" width="12" height="10" rx="1.5" />
                    <line x1="6" y1="3" x2="6" y2="13" />
                  </svg>
                </button>
                <button
                  onClick={() => onTogglePanel('list')}
                  title={panels.list ? 'Esconder lista' : 'Mostrar lista'}
                  className={`w-7 h-7 flex items-center justify-center rounded ${panels.list ? 'text-[#1a1a1a] bg-[#f8f8f7]' : 'text-[#646462] hover:bg-[#f8f8f7]'}`}
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                    <line x1="3" y1="5" x2="13" y2="5" />
                    <line x1="3" y1="8" x2="13" y2="8" />
                    <line x1="3" y1="11" x2="13" y2="11" />
                  </svg>
                </button>
                <button
                  onClick={() => onTogglePanel('right')}
                  title={panels.right ? 'Esconder detalles' : 'Mostrar detalles'}
                  className={`w-7 h-7 flex items-center justify-center rounded ${panels.right ? 'text-[#1a1a1a] bg-[#f8f8f7]' : 'text-[#646462] hover:bg-[#f8f8f7]'}`}
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                    <rect x="2" y="3" width="12" height="10" rx="1.5" />
                    <line x1="10" y1="3" x2="10" y2="13" />
                  </svg>
                </button>
              </div>
            )}
            <button onClick={toggleStar} title={starred ? 'Quitar destacado' : 'Destacar caso'}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f8f8f7]">
              <svg viewBox="0 0 16 16" className={`w-4 h-4 ${starred ? 'fill-[#f59e0b]' : 'fill-none stroke-[#646462]'}`} strokeWidth="1.5"><path d="M8 1l2.2 4.5 4.8.7-3.5 3.4.8 4.9L8 12.2 3.7 14.5l.8-4.9L1 6.2l4.8-.7L8 1z"/></svg>
            </button>
            <button onClick={() => setMenuOpen(o => !o)} title="Más acciones"
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f8f8f7]">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462]"><circle cx="3" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="13" cy="8" r="1.4"/></svg>
            </button>
            <button onClick={() => setShowSearch(s => !s)} title="Buscar en la conversación"
              className={`w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#e9eae6] ${showSearch ? 'bg-[#1a1a1a]' : 'bg-[#f8f8f7]'}`}>
              <img src={ICON_SEARCH2} alt="" className={`w-4 h-4 ${showSearch ? 'invert' : ''}`} />
            </button>
            <button onClick={resolveCase} className="h-8 px-4 bg-[#222] text-white text-[13px] font-semibold rounded-full hover:bg-[#444] flex items-center gap-1.5">
              <CheckIconMinimal className="w-3.5 h-3.5" />
              <span>Resolver</span>
            </button>
            <button onClick={() => setStatusMode('snoozed')} className="h-8 px-3 bg-[#f8f8f7] text-[#1a1a1a] text-[13px] font-semibold rounded-full hover:bg-[#e9eae6]">
              Posponer
            </button>
            <button onClick={() => setShowAssignModal(true)} className="h-8 px-3 bg-[#f8f8f7] text-[#1a1a1a] text-[13px] font-semibold rounded-full hover:bg-[#e9eae6]" title="Asignar / transferir el caso">
              Asignar
            </button>
            <button onClick={() => setShowMergeModal(true)} className="h-8 px-3 bg-[#f8f8f7] text-[#1a1a1a] text-[13px] font-semibold rounded-full hover:bg-[#e9eae6]">
              Fusionar
            </button>
          </div>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute top-12 right-[170px] z-20 bg-white border border-[#e9eae6] rounded-[10px] shadow-[0px_4px_16px_rgba(20,20,20,0.12)] py-1.5 w-[300px]">
                {menuActions.map(item => (
                  <button key={item.label} onClick={item.onClick} className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#f3f3f1] text-left">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[14px] text-[#646462] w-4 text-center">{item.icon}</span>
                      <span className="text-[13px] text-[#1a1a1a]">{item.label}</span>
                    </div>
                    {item.shortcut && <span className="text-[11px] text-[#646462]">{item.shortcut}</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {showSearch && (
          <div className="px-6 -mt-2">
            <input
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar texto en esta conversación…"
              className="w-full h-9 rounded-lg border border-[#e9eae6] px-3 text-[13px] focus:outline-none focus:border-[#1a1a1a]"
            />
            {searchQuery.trim() && (
              <p className="text-[11px] text-[#646462] mt-1">{displayMessages.length} de {allMessages.length} mensajes coinciden</p>
            )}
          </div>
        )}
        <div className="h-[1px] bg-[#e9eae6]" />
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-4">
        {selectedConv.aiHandled && ['pending', 'expired', 'rejected'].includes(selectedConv.approvalState ?? '') && (
          <ApprovalBanner
            caseId={selectedConv.id}
            approvalState={selectedConv.approvalState}
            aiRecommendation={selectedConv.raw?.ai_recommended_action}
            riskLevel={selectedConv.riskLevel}
            onApproved={onRefresh}
            onRejected={onRefresh}
          />
        )}
        {(selectedConv.status === 'escalated' || selectedConv.status === 'blocked') && !selectedConv.approvalState && (
          <ApprovalBanner
            caseId={selectedConv.id}
            approvalState="pending"
            aiRecommendation={selectedConv.raw?.ai_recommended_action}
            riskLevel={selectedConv.riskLevel}
            onApproved={onRefresh}
            onRejected={onRefresh}
          />
        )}
        {displayMessages.length === 0 && (
          <div className="text-center py-10 text-[13px] text-[#646462]">
            No hay mensajes en este caso todavía. Escribe abajo para empezar la conversación.
          </div>
        )}
        {displayMessages.map((msg) => <ChatMessage key={msg.id} msg={msg} />)}
        {/* Live AI summary card — only shown when the backend actually exposes
            a summary for this case (case.ai_diagnosis.summary or
            customer.ai_executive_summary). No fake placeholder anymore. */}
        {(() => {
          const aiRaw = inboxView?.case?.ai_diagnosis ?? inboxView?.state?.case?.ai_diagnosis;
          let aiObj: any = null;
          if (aiRaw && typeof aiRaw === 'object') aiObj = aiRaw;
          else if (typeof aiRaw === 'string') {
            try { aiObj = JSON.parse(aiRaw); } catch { aiObj = { summary: aiRaw }; }
          }
          const summary = aiObj?.summary
            || aiObj?.executive_summary
            || inboxView?.state?.customer?.ai_executive_summary
            || null;
          if (!summary) return null;
          return (
            <div className="bg-[#f8f8f7] rounded-2xl p-4 mb-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-5 h-5 rounded-full bg-[#e7e2fd] flex items-center justify-center">
                  <img src={ICON_FIN} alt="" className="w-3 h-3" />
                </div>
                <span className="text-[13px] font-semibold text-[#1a1a1a]">Clain AI</span>
                <span className="text-[12px] text-[#646462]">· Resumen del caso</span>
              </div>
              <p className="text-[13px] text-[#1a1a1a] leading-5 whitespace-pre-wrap">{String(summary)}</p>
            </div>
          );
        })()}
      </div>

      <div className="border-t border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-4 px-4 pt-3">
          {([['responder', 'Responder'], ['nota', 'Nota interna'], ['datosIA', 'Datos de la IA']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setReplyTab(id)}
              className={`text-[13px] pb-1 ${replyTab === id ? 'font-semibold text-[#1a1a1a] border-b-2 border-[#1a1a1a]' : 'text-[#646462] hover:text-[#1a1a1a]'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="px-4 py-3">
          {replyTab === 'datosIA' ? (() => {
            // Render the real AI diagnosis if the backend has one. Otherwise
            // surface neutral metadata + an action to ask the Copilot, instead
            // of fake "Resolución estimada: 2 min".
            const caseRow: any = inboxView?.case || {};
            const stateCase: any = inboxView?.state?.case || {};
            const aiRaw = caseRow.ai_diagnosis ?? stateCase.ai_diagnosis ?? null;
            let aiObj: any = null;
            if (aiRaw && typeof aiRaw === 'object') aiObj = aiRaw;
            else if (typeof aiRaw === 'string') {
              try { aiObj = JSON.parse(aiRaw); } catch { aiObj = { summary: aiRaw }; }
            }
            const intent = caseRow.intent || stateCase.intent || aiObj?.intent || null;
            const intentConfidence = caseRow.intent_confidence ?? stateCase.intent_confidence ?? aiObj?.confidence ?? null;
            const summary = aiObj?.summary || aiObj?.executive_summary || null;
            const recommended = aiObj?.recommended_action || aiObj?.next_step || null;
            const risk = caseRow.risk_level || stateCase.risk_level || (selectedConv as any).riskLevel || null;
            const sla = caseRow.sla_status || stateCase.sla_status || null;
            const hasAnything = !!(intent || summary || recommended || risk || sla);
            return (
              <div className="border border-[#e9eae6] rounded-2xl p-4 text-[13px] text-[#646462]">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-[#1a1a1a]">Datos de IA de este caso</p>
                  <span className="text-[11px] text-[#646462]">vista en vivo</span>
                </div>
                {!hasAnything ? (
                  <p className="text-[12.5px] text-[#646462] leading-5">
                    Aún no hay diagnóstico de la IA. Pulsa <span className="font-semibold text-[#1a1a1a]">"Resumir caso"</span> en el panel Copilot para generar uno.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1.5 text-[12.5px] text-[#1a1a1a]">
                    <p><span className="text-[#646462]">Canal:</span> {channelLabel || '—'}</p>
                    {intent && (
                      <p>
                        <span className="text-[#646462]">Intención:</span> {titleCase(String(intent))}
                        {Number.isFinite(intentConfidence) && <span className="text-[#646462]"> ({Math.round(Number(intentConfidence) * 100)}%)</span>}
                      </p>
                    )}
                    {risk && <p><span className="text-[#646462]">Riesgo:</span> {titleCase(String(risk))}</p>}
                    {sla && <p><span className="text-[#646462]">Estado SLA:</span> {titleCase(String(sla).replace(/_/g, ' '))}</p>}
                    {summary && <p className="whitespace-pre-wrap"><span className="text-[#646462]">Resumen:</span> {summary}</p>}
                    {recommended && <p className="whitespace-pre-wrap"><span className="text-[#646462]">Acción sugerida:</span> {recommended}</p>}
                  </div>
                )}
              </div>
            );
          })() : (
            <div className={`border rounded-2xl overflow-hidden ${replyTab === 'nota' ? 'border-[#fde68a] bg-[#fffbeb]' : 'border-[#e9eae6]'}`}>
              <textarea
                ref={textareaRef}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder={replyTab === 'nota' ? 'Escribe una nota interna…' : `Escribe un mensaje a ${selectedConv.customerName || 'cliente'}…`}
                className="w-full px-4 py-3 min-h-[80px] text-[14px] text-[#1a1a1a] bg-transparent resize-none focus:outline-none placeholder:text-[#646462]"
              />
              {attachments.length > 0 && (
                <div className="px-3 pb-2 flex flex-wrap gap-2">
                  {attachments.map(att => (
                    <div key={att.id} className="flex items-center gap-2 rounded-full bg-white border border-[#e9eae6] px-2 py-1 text-[12px] text-[#646462]">
                      {att.dataUrl?.startsWith('data:image') ? (
                        <img src={att.dataUrl} alt="" className="w-5 h-5 rounded object-cover" />
                      ) : (
                        <span>Adj.</span>
                      )}
                      <span className="max-w-[140px] truncate">{att.name}</span>
                      <span>{formatBytes(att.size)}</span>
                      <button onClick={() => setAttachments(current => current.filter(file => file.id !== att.id))} className="text-[#1a1a1a]">x</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between px-3 py-2 border-t border-[#e9eae6] relative">
                <div className="flex items-center gap-1">
                  <button onClick={() => applyComposerFormat('bold')} title="Negrita" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f8f8f7] text-[13px] font-bold">B</button>
                  <button onClick={() => applyComposerFormat('italic')} title="Cursiva" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f8f8f7] text-[13px] italic">I</button>
                  <button onClick={() => applyComposerFormat('link')} title="Enlace" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f8f8f7] text-[12px]">Link</button>
                  <button onClick={() => fileInputRef.current?.click()} title="Adjuntar archivo" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f8f8f7] text-[12px]">+</button>
                  <button onClick={() => setShowEmojiPicker(open => !open)} title="Emoji" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f8f8f7] text-[12px]">:)</button>
                  <button onClick={() => setShowSnippets(s => !s)} title="Plantillas guardadas" className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f8f8f7] text-[12px]">⚡</button>
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={event => handleFiles(event.target.files)} />
                </div>
                {showSnippets && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setShowSnippets(false)} />
                    <div className="absolute bottom-10 left-3 z-30 w-[300px] bg-white border border-[#e9eae6] rounded-xl shadow-[0px_8px_24px_rgba(20,20,20,0.18)] py-1.5 max-h-[280px] overflow-y-auto">
                      <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#646462]">Plantillas</div>
                      {snippetsLoading && <div className="px-3 py-2 text-[12.5px] text-[#646462]">Cargando…</div>}
                      {!snippetsLoading && snippets.length === 0 && (
                        <div className="px-3 py-2 text-[12.5px] text-[#646462]">Aún no tienes plantillas. Guarda la respuesta actual con el botón de abajo.</div>
                      )}
                      {snippets.map(snip => (
                        <div key={snip.id} className="flex items-center justify-between px-3 py-1.5 hover:bg-[#f3f3f1] group">
                          <button
                            onClick={async () => {
                              insertAtCursor(snip.body);
                              setShowSnippets(false);
                              try { await macrosApi.recordUse(snip.id); } catch { /* non-critical */ }
                            }}
                            className="flex-1 text-left min-w-0"
                            title={snip.body}
                          >
                            <p className="text-[13px] font-semibold text-[#1a1a1a] truncate">{snip.label}</p>
                            <p className="text-[11px] text-[#646462] truncate">{snip.body.slice(0, 60)}</p>
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                await macrosApi.delete(snip.id);
                                onAction('Plantilla borrada');
                                reloadSnippets();
                              } catch (err: any) {
                                onAction(err?.message || 'No se pudo borrar', 'error');
                              }
                            }}
                            title="Borrar"
                            className="ml-2 w-6 h-6 flex items-center justify-center rounded text-[#646462] hover:text-[#b91c1c] hover:bg-[#fef7f7] opacity-0 group-hover:opacity-100"
                          >×</button>
                        </div>
                      ))}
                      <div className="border-t border-[#e9eae6] mt-1 pt-1">
                        <button
                          disabled={!replyText.trim()}
                          onClick={async () => {
                            const body = replyText.trim();
                            if (!body) return;
                            const label = body.split('\n')[0].slice(0, 50);
                            try {
                              await macrosApi.create({ label, body });
                              onAction('Plantilla guardada');
                              reloadSnippets();
                            } catch (err: any) {
                              onAction(err?.message || 'No se pudo guardar', 'error');
                            }
                          }}
                          className="w-full text-left px-3 py-1.5 text-[12.5px] font-semibold text-[#1a1a1a] hover:bg-[#f3f3f1] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          + Guardar respuesta actual como plantilla
                        </button>
                      </div>
                    </div>
                  </>
                )}
                <button
                  onClick={submitReply}
                  disabled={!replyText.trim() && attachments.length === 0}
                  className="h-7 px-4 bg-[#222] text-white text-[13px] font-semibold rounded-full hover:bg-[#444] disabled:bg-[#e9eae6] disabled:text-[#646462]"
                >
                  Enviar
                </button>
              </div>
              {showEmojiPicker && (
                <div className="px-3 pb-3 flex flex-wrap gap-1">
                  {PROTOTYPE_COMMON_EMOJIS.map(emoji => (
                    <button key={emoji} onClick={() => insertAtCursor(emoji)} className="w-7 h-7 rounded-lg bg-white hover:bg-[#f8f8f7] text-[14px]">
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {showMergeModal && (
        <PrototypeMergeModal
          sourceId={selectedConv.id}
          sourceConv={selectedConv.raw ?? selectedConv}
          onClose={() => setShowMergeModal(false)}
          onMerged={onRefresh}
          onAction={onAction}
        />
      )}
      {showAssignModal && (
        <AssignModal
          caseId={selectedConv.id}
          currentAssignee={selectedConv.assignee}
          onClose={() => setShowAssignModal(false)}
          onAssigned={onRefresh}
          onAction={onAction}
        />
      )}
      {statusMode && (
        <StatusChangeModal
          caseId={selectedConv.id}
          mode={statusMode}
          onClose={() => setStatusMode(null)}
          onChanged={onRefresh}
          onAction={onAction}
        />
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center h-8 w-full min-w-0 overflow-hidden">
      <span className="w-[113px] flex-shrink-0 text-[13px] text-[#646462] truncate">{label}</span>
      <div className="flex-1 min-w-0 px-1 overflow-hidden">
        {/* title attribute keeps the full value reachable on hover even when
            the visible text is truncated, so we never need horizontal scroll. */}
        <span className="text-[13px] text-[#1a1a1a] truncate block" title={value}>{value}</span>
      </div>
    </div>
  );
}

// Severity → bullet color. Backend returns 'pending' | 'warning' | 'critical' |
// 'healthy'. Anything else falls back to neutral grey.
function timelineSeverityClass(sev?: string): string {
  switch (String(sev || '').toLowerCase()) {
    case 'critical':
    case 'error':   return 'bg-[#b91c1c]';
    case 'warning': return 'bg-[#f59e0b]';
    case 'healthy':
    case 'success': return 'bg-[#16a34a]';
    case 'pending': return 'bg-[#3b59f6]';
    default:        return 'bg-[#646462]';
  }
}

// Pretty-print backend entry types into Spanish chip labels for the timeline.
function timelineDomainLabel(entry: any): string {
  const map: Record<string, string> = {
    message:                'Mensaje',
    internal_note:          'Nota interna',
    reconciliation_issue:   'Conflicto',
    case_status_history:    'Estado',
    order_event:            'Pedido',
    payment_event:          'Pago',
    return_event:           'Devolución',
    audit_log:              'Auditoría',
    workflow_event:         'Workflow',
    ai_run:                 'IA',
  };
  return map[String(entry?.entry_type || '').toLowerCase()]
    || titleCase(String(entry?.domain || entry?.type || 'evento'));
}

function TimelineEntryRow({ entry }: { entry: any }) {
  const time = relativeTime(entry?.occurred_at || entry?.created_at);
  const actor = entry?.actor || entry?.source || 'sistema';
  const content = String(entry?.content || entry?.summary || entry?.type || '').trim();
  const truncated = content.length > 220 ? `${content.slice(0, 220)}…` : content;
  return (
    <div className="flex items-start gap-3">
      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${timelineSeverityClass(entry?.severity)}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10.5px] uppercase tracking-wide font-semibold text-[#646462]">{timelineDomainLabel(entry)}</span>
          <span className="text-[11px] text-[#646462]">·</span>
          <span className="text-[11px] text-[#646462] truncate">{actor}</span>
        </div>
        <p className="text-[13px] text-[#1a1a1a] leading-5 mt-0.5 break-words">{truncated || '—'}</p>
        <p className="text-[11px] text-[#646462] mt-0.5">{time}</p>
      </div>
    </div>
  );
}

function DetailSection({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[#e9eae6] pb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full h-8 px-6 py-2 hover:bg-[#f8f8f7]"
      >
        <span className="text-[13px] font-semibold text-[#1a1a1a]">{title}</span>
        {/* Real chevron — points down when expanded, right when collapsed.
            Stroke-only SVG, no Figma decorative asset. */}
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-3.5 h-3.5 text-[#646462] transition-transform ${open ? 'rotate-90' : ''}`}
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
      </button>
      {open && <div className="px-6">{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CopilotModule — full-featured AI sidebar module:
//   • AI Summary card (auto-loaded from /ai/copilot for the active case)
//   • Quick-action chips (resumen, riesgo, próximo paso, casos similares,
//     borrador) that fire the right copilot prompts in one click
//   • Persistent chat (keyed by caseId in the parent state)
//   • "Usar como respuesta" on any assistant bubble → pushes text to composer
//   • "Generar borrador" → calls copilot for a clean reply, drops it in composer
// ─────────────────────────────────────────────────────────────────────────────

const COPILOT_QUICK_ACTIONS: Array<{ id: string; label: string; prompt: string }> = [
  { id: 'summary',  label: 'Resumir caso',          prompt: 'Resume este caso en 4 viñetas: situación, datos clave, lo que se ha intentado y qué falta.' },
  { id: 'risk',     label: 'Detectar riesgo',       prompt: 'Detecta los riesgos de este caso (fraude, devolución, churn, escalado) y dime qué evidencias has usado.' },
  { id: 'next',     label: 'Próximo paso',          prompt: '¿Cuál es la siguiente acción concreta que debo tomar ahora? Sé específico (qué API, qué sistema, qué decir al cliente).' },
  { id: 'similar',  label: 'Casos similares',       prompt: 'Busca casos parecidos en el histórico y dime qué resolución funcionó y por qué.' },
  { id: 'policy',   label: 'Verificar política',    prompt: 'Verifica si la acción que estoy a punto de tomar cumple las políticas (reembolsos, descuentos, escalado). Cita la política aplicable.' },
];

function CopilotModule({
  selectedConv,
  inboxView,
  messages,
  loading,
  draftLoading,
  text,
  setText,
  onSend,
  onUseAsReply,
  onGenerateDraft,
}: {
  selectedConv: Conversation;
  inboxView: any;
  messages: PrototypeCopilotMessage[];
  loading: boolean;
  draftLoading: boolean;
  text: string;
  setText: Dispatch<SetStateAction<string>>;
  onSend: (q: string) => void;
  onUseAsReply: (text: string) => void;
  onGenerateDraft: () => void;
}) {
  const caseState = inboxView?.state || (selectedConv as any)?.raw?.stateSnapshot || {};
  const summary = inboxView?.summary || caseState?.summary || null;
  const channelLabel = titleCase((selectedConv as any).sourceChannel || (selectedConv.channel || '').split('·')[0].trim() || 'canal');
  const customerName = (selectedConv as any).customerName || 'el cliente';
  const riskLevel = (selectedConv as any).riskLevel || caseState?.riskLevel || caseState?.risk_level;
  const orderId = (selectedConv as any).orderId || caseState?.related?.orders?.[0]?.id;

  function send(question: string) {
    const q = question.trim();
    if (!q) return;
    onSend(q);
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header with title + Generate Draft action */}
      <div className="px-5 py-4 border-b border-[#e9eae6] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#1a1a1a]">Copilot del caso</p>
          <p className="text-[12px] text-[#646462] mt-1 truncate">
            {customerName} · {channelLabel}
            {riskLevel && <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${String(riskLevel).toLowerCase().includes('high') || String(riskLevel).toLowerCase().includes('critical') ? 'bg-[#fee2e2] text-[#b91c1c]' : 'bg-[#f8f8f7] text-[#646462]'}`}>{titleCase(String(riskLevel))}</span>}
          </p>
        </div>
        <button
          onClick={onGenerateDraft}
          disabled={draftLoading || !selectedConv?.id}
          className="h-7 px-3 rounded-full bg-[#1a1a1a] text-white text-[11.5px] font-semibold flex items-center gap-1 disabled:bg-[#e9eae6] disabled:text-[#646462]"
          title="Generar borrador y pegarlo en el composer"
        >
          {draftLoading ? '…' : '✨'}
          <span>Borrador</span>
        </button>
      </div>

      {/* AI summary card (uses the structured summary the backend returns) */}
      {summary && (
        <div className="mx-4 mt-3 rounded-2xl bg-[#f4f4ff] border border-[#dadbf3] p-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 rounded-full bg-[#e7e2fd] flex items-center justify-center">
              <img src={ICON_FIN} alt="" className="w-3 h-3" />
            </div>
            <span className="text-[12px] font-semibold text-[#1a1a1a]">Resumen del caso</span>
          </div>
          <p className="text-[12.5px] text-[#1a1a1a] leading-5 whitespace-pre-wrap">
            {typeof summary === 'string'
              ? summary
              : [
                  summary.subject && `Asunto: ${summary.subject}`,
                  summary.intent && `Intención: ${summary.intent}`,
                  summary.priority && `Prioridad: ${titleCase(String(summary.priority))}`,
                  summary.recommendedAction && `Próxima acción: ${summary.recommendedAction}`,
                ].filter(Boolean).join('\n') || 'Sin resumen estructurado disponible.'}
          </p>
          {orderId && (
            <p className="text-[11px] text-[#646462] mt-2">Pedido vinculado: <span className="font-semibold text-[#1a1a1a]">{orderId}</span></p>
          )}
        </div>
      )}

      {/* Quick action chips — prompts the copilot in one click */}
      <div className="px-4 pt-3 pb-2 flex flex-wrap gap-1.5">
        {COPILOT_QUICK_ACTIONS.map(action => (
          <button
            key={action.id}
            onClick={() => send(action.prompt)}
            disabled={loading || !selectedConv?.id}
            className="h-7 px-3 rounded-full bg-[#f8f8f7] border border-[#e9eae6] text-[11.5px] font-semibold text-[#1a1a1a] hover:bg-[#ededea] disabled:opacity-50"
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Chat history */}
      <div className="flex-1 px-4 py-3 flex flex-col gap-2 overflow-y-auto">
        {messages.length === 0 && (
          <div className="rounded-2xl bg-[#f8f8f7] border border-[#e9eae6] p-3 text-[12.5px] text-[#646462] leading-5">
            Pulsa una acción rápida o escribe tu propia pregunta. El Copilot ve los datos reales del caso (canal, pedido, sistemas conectados, historial).
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`rounded-2xl px-3 py-2 text-[13px] leading-5 ${
            msg.role === 'user' ? 'bg-[#1a1a1a] text-white ml-8' : 'bg-[#f8f8f7] text-[#1a1a1a] mr-4 border border-[#e9eae6]'
          }`}>
            <p className="whitespace-pre-wrap">{msg.content}</p>
            <div className="flex items-center justify-between mt-1.5 gap-2">
              <p className={`text-[10px] ${msg.role === 'user' ? 'text-white/70' : 'text-[#646462]'}`}>{msg.time}</p>
              {msg.role === 'assistant' && msg.content && (
                <button
                  onClick={() => onUseAsReply(msg.content)}
                  className="text-[11px] font-semibold text-[#1a1a1a] hover:underline"
                  title="Insertar este texto en el composer"
                >
                  Usar como respuesta ↑
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="rounded-2xl bg-[#f8f8f7] border border-[#e9eae6] px-3 py-2 mr-4 text-[12.5px] text-[#646462] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#646462] animate-pulse" />
            <span>Copilot está pensando…</span>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-[#e9eae6] p-3 flex-shrink-0">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              send(text);
              setText('');
            }
          }}
          placeholder="Pregunta al Copilot… (Ctrl+Enter envía)"
          className="w-full min-h-[60px] rounded-xl border border-[#e9eae6] px-3 py-2 text-[13px] resize-none focus:outline-none focus:border-[#1a1a1a]"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-[#646462]">{loading ? 'Esperando respuesta…' : 'Ctrl+Enter para enviar'}</span>
          <button
            onClick={() => { send(text); setText(''); }}
            disabled={!text.trim() || loading}
            className="h-7 px-4 rounded-full bg-[#1a1a1a] text-white text-[12.5px] font-semibold disabled:bg-[#e9eae6] disabled:text-[#646462]"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

type PrototypeCopilotMessage = { id: string; role: 'user' | 'assistant'; content: string; time: string };

// Format a "X ago" / absolute datetime label for the user-creation row.
function relativeOrAbsoluteTime(value?: string | null): string {
  if (!value) return '—';
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return String(value);
  return relativeTime(value);
}

// Pretty-print SLA deadlines: "deadline en 2h" / "vencido hace 1h" / "—".
function slaDeadlineLabel(deadline?: string | null, status?: string | null): string {
  if (!deadline) return '—';
  const t = new Date(deadline).getTime();
  if (Number.isNaN(t)) return String(deadline);
  const diffMin = Math.round((t - Date.now()) / 60000);
  if (diffMin < 0) return `vencido hace ${Math.abs(diffMin) > 60 ? `${Math.round(Math.abs(diffMin) / 60)}h` : `${Math.abs(diffMin)}m`}`;
  if (diffMin < 60) return `en ${diffMin}m${status ? ` · ${titleCase(status)}` : ''}`;
  return `en ${Math.round(diffMin / 60)}h${status ? ` · ${titleCase(status)}` : ''}`;
}

// Detalles tab content — pulls everything from inboxView / state.customer / case
// instead of the previous hardcoded "Visitante anónimo / España / Hace 4 minutos"
// placeholders. Includes: real customer card, conversation attributes with
// real SLA deadlines, internal notes with an inline "+ Añadir nota" form, and
// real AI activity from case.ai_diagnosis (hidden when null).
// NoteCard — single internal note with hover-revealed Edit / Delete buttons.
// Editing swaps content for a textarea; saving calls PATCH /internal-notes,
// deleting calls DELETE. onRefresh re-fetches the case.
function NoteCard({
  note,
  caseId,
  onAction,
  onRefresh,
}: {
  note: any;
  caseId: string;
  onAction: (msg: string, type?: 'success' | 'error') => void;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.content || note.text || '');
  const [busy, setBusy] = useState(false);
  const noteId = note.id || note.note_id;

  async function save() {
    const v = draft.trim();
    if (!v || busy || !noteId) return;
    setBusy(true);
    try {
      await casesApi.updateInternalNote(caseId, String(noteId), v);
      onAction('Nota actualizada');
      setEditing(false);
      onRefresh();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo actualizar la nota', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy || !noteId) return;
    if (typeof window !== 'undefined' && !window.confirm('¿Borrar esta nota interna?')) return;
    setBusy(true);
    try {
      await casesApi.deleteInternalNote(caseId, String(noteId));
      onAction('Nota borrada');
      onRefresh();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo borrar la nota', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded-xl bg-[#fffbeb] border border-[#f59e0b] px-3 py-2 flex flex-col gap-2">
        <textarea
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          className="w-full min-h-[60px] rounded-lg bg-white border border-[#fde68a] px-2 py-1.5 text-[13px] resize-none focus:outline-none focus:border-[#f59e0b]"
        />
        <div className="flex items-center justify-end gap-2">
          <button onClick={() => { setEditing(false); setDraft(note.content || note.text || ''); }} disabled={busy} className="text-[12px] font-semibold text-[#646462] hover:text-[#1a1a1a]">Cancelar</button>
          <button onClick={save} disabled={!draft.trim() || busy} className="h-7 px-3 rounded-full bg-[#1a1a1a] text-white text-[12px] font-semibold disabled:bg-[#e9eae6] disabled:text-[#646462]">{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#fffbeb] border border-[#fde68a] px-3 py-2 group">
      <p className="text-[13px] text-[#1a1a1a] leading-5 whitespace-pre-wrap">{note.content || note.text || 'Nota sin contenido'}</p>
      <div className="flex items-center justify-between mt-1 gap-2">
        <p className="text-[11px] text-[#646462] truncate">
          {(note.createdBy || note.created_by || 'sistema')} · {relativeTime(note.createdAt || note.created_at)}
          {note.updated_at && note.updated_at !== note.created_at && <span> · editada</span>}
        </p>
        {noteId && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => setEditing(true)} title="Editar" className="text-[11px] font-semibold text-[#646462] hover:text-[#1a1a1a]">Editar</button>
            <span className="text-[#c6c9c0]">·</span>
            <button onClick={remove} disabled={busy} title="Borrar" className="text-[11px] font-semibold text-[#646462] hover:text-[#b91c1c]">Borrar</button>
          </div>
        )}
      </div>
    </div>
  );
}

// TagsRow — inline tag editor chips. Click × to remove (PATCH /tags
// mode=remove); type into the inline input + Enter to add (mode=add).
// Optimistic refresh via onRefresh.
function TagsRow({
  tags,
  caseId,
  onAction,
  onRefresh,
}: {
  tags: string[];
  caseId: string;
  onAction: (msg: string, type?: 'success' | 'error') => void;
  onRefresh: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    const v = draft.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      await casesApi.updateTags(caseId, [v], 'add');
      setDraft('');
      setAdding(false);
      onRefresh();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo añadir la etiqueta', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(tag: string) {
    if (busy) return;
    setBusy(true);
    try {
      await casesApi.updateTags(caseId, [tag], 'remove');
      onRefresh();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo quitar la etiqueta', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start py-1.5 w-full min-w-0">
      <span className="w-[113px] flex-shrink-0 text-[13px] text-[#646462] truncate pt-0.5">Etiquetas</span>
      <div className="flex-1 min-w-0 flex flex-wrap gap-1">
        {tags.length === 0 && !adding && (
          <span className="text-[12.5px] text-[#646462] italic">Sin etiquetas</span>
        )}
        {tags.map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[#f8f8f7] border border-[#e9eae6] text-[11.5px] text-[#1a1a1a] max-w-full">
            <span className="truncate max-w-[140px]">{tag}</span>
            <button
              onClick={() => remove(tag)}
              disabled={busy}
              title="Quitar etiqueta"
              className="text-[#646462] hover:text-[#b91c1c] disabled:opacity-50"
            >×</button>
          </span>
        ))}
        {adding ? (
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); add(); }
              if (e.key === 'Escape') { setAdding(false); setDraft(''); }
            }}
            onBlur={() => { if (!draft.trim()) setAdding(false); }}
            placeholder="nueva-etiqueta"
            className="h-6 px-2 rounded-full border border-[#1a1a1a] text-[11.5px] focus:outline-none w-[120px]"
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            disabled={busy}
            className="h-6 px-2 rounded-full border border-dashed border-[#c6c9c0] text-[11.5px] text-[#646462] hover:bg-[#f8f8f7] hover:text-[#1a1a1a] disabled:opacity-50"
          >+ Añadir</button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CustomerInfoSections — 7 collapsible modules wired to real backend:
//   1. Conversaciones recientes  → casesApi.list({ customer_id })
//   2. Notas del usuario         → customer.notes (PATCH /customers/:id)
//   3. Etiquetas de usuario      → customer.tags  (PATCH /customers/:id)
//   4. Etiquetas de conversación → casesApi.updateTags (already on case row)
//   5. Segmentos de usuario      → customer.segment chip + edit
//   6. Vistas recientes          → customersApi.activity()
//   7. Conversaciones similares  → top tag-overlap with the active case
// ─────────────────────────────────────────────────────────────────────────────

function CustomerInfoSections({
  customer,
  currentCaseId,
  onAction,
  onRefresh,
}: {
  customer: any;
  currentCaseId: string;
  onAction: (msg: string, type?: 'success' | 'error') => void;
  onRefresh: () => void;
}) {
  return (
    <>
      <CustomerRecentConvsSection customerId={customer.id} currentCaseId={currentCaseId} />
      <CustomerNotesSection customer={customer} onAction={onAction} onRefresh={onRefresh} />
      <CustomerTagsSection customer={customer} onAction={onAction} onRefresh={onRefresh} />
      <CustomerSegmentSection customer={customer} onAction={onAction} onRefresh={onRefresh} />
      <CustomerActivitySection customerId={customer.id} />
      <SimilarConversationsSection customerId={customer.id} currentCaseId={currentCaseId} />
    </>
  );
}

// 1 + 7. Recent conversations + similar conversations both pull
//        casesApi.list({ customer_id }). 7 also intersects tags with the
//        current case to surface the most relevant siblings first.

function CustomerRecentConvsSection({ customerId, currentCaseId }: { customerId: string; currentCaseId: string }) {
  const { data: cases, loading } = useApi(
    () => casesApi.list({ customer_id: customerId }),
    [customerId],
    [],
  );
  const others = (Array.isArray(cases) ? cases : []).filter((c: any) => c.id !== currentCaseId).slice(0, 8);
  return (
    <DetailSection title={`Conversaciones recientes (${others.length})`}>
      <div className="py-2 flex flex-col gap-1.5">
        {loading && <p className="text-[12.5px] text-[#646462]">Cargando…</p>}
        {!loading && others.length === 0 && <p className="text-[12.5px] text-[#646462]">No hay conversaciones recientes.</p>}
        {others.map((c: any) => (
          <a
            key={c.id}
            href={pathFor({ view: 'inbox', scope: 'all', caseId: c.id })}
            className="flex items-center justify-between rounded-lg bg-[#f8f8f7] border border-[#e9eae6] px-3 py-2 hover:bg-[#ededea]"
          >
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-[#1a1a1a] truncate">{c.case_number || c.id}</p>
              <p className="text-[11px] text-[#646462] truncate">{titleCase(c.status)} · {titleCase(c.source_channel || c.channel || 'caso')}</p>
            </div>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-3 h-3 text-[#646462] flex-shrink-0"><path d="M6 4l4 4-4 4" /></svg>
          </a>
        ))}
      </div>
    </DetailSection>
  );
}

function CustomerNotesSection({ customer, onAction, onRefresh }: {
  customer: any;
  onAction: (msg: string, type?: 'success' | 'error') => void;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(customer.notes || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setDraft(customer.notes || ''); setEditing(false); }, [customer.id, customer.notes]);

  async function save() {
    setBusy(true);
    try {
      await customersApi.update(customer.id, { notes: draft });
      onAction('Nota del usuario guardada');
      setEditing(false);
      onRefresh();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo guardar la nota', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <DetailSection title="Notas del usuario">
      <div className="py-2">
        {editing ? (
          <div className="flex flex-col gap-2">
            <textarea
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Añadir una nota sobre este cliente…"
              className="w-full min-h-[60px] rounded-xl bg-[#fffbeb] border border-[#fde68a] px-3 py-2 text-[13px] text-[#1a1a1a] resize-none focus:outline-none focus:border-[#f59e0b]"
            />
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => { setEditing(false); setDraft(customer.notes || ''); }} disabled={busy} className="text-[12px] font-semibold text-[#646462] hover:text-[#1a1a1a]">Cancelar</button>
              <button onClick={save} disabled={busy} className="h-7 px-3 rounded-full bg-[#1a1a1a] text-white text-[12px] font-semibold disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar'}</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="w-full text-left rounded-xl bg-[#fffbeb] border border-[#fde68a] px-3 py-2.5 hover:bg-[#fef3c7]"
          >
            <p className={`text-[13px] leading-5 whitespace-pre-wrap ${customer.notes ? 'text-[#1a1a1a]' : 'text-[#646462]'}`}>
              {customer.notes || 'Añadir una nota'}
            </p>
          </button>
        )}
      </div>
    </DetailSection>
  );
}

function CustomerTagsSection({ customer, onAction, onRefresh }: {
  customer: any;
  onAction: (msg: string, type?: 'success' | 'error') => void;
  onRefresh: () => void;
}) {
  const tags: string[] = Array.isArray(customer.tags) ? customer.tags : [];
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function addTag() {
    const v = draft.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      const next = Array.from(new Set([...tags, v]));
      await customersApi.update(customer.id, { tags: next });
      setDraft(''); setAdding(false); onRefresh();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo añadir la etiqueta', 'error');
    } finally { setBusy(false); }
  }
  async function removeTag(tag: string) {
    if (busy) return;
    setBusy(true);
    try {
      const next = tags.filter(t => t !== tag);
      await customersApi.update(customer.id, { tags: next });
      onRefresh();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo quitar la etiqueta', 'error');
    } finally { setBusy(false); }
  }

  return (
    <DetailSection title={`Etiquetas de usuario (${tags.length})`}>
      <div className="py-2 flex flex-wrap gap-1">
        {tags.length === 0 && !adding && <span className="text-[12.5px] text-[#646462] italic">Sin etiquetas</span>}
        {tags.map(t => (
          <span key={t} className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[#f8f8f7] border border-[#e9eae6] text-[11.5px] text-[#1a1a1a] max-w-full">
            <span className="truncate max-w-[140px]">{t}</span>
            <button onClick={() => removeTag(t)} disabled={busy} className="text-[#646462] hover:text-[#b91c1c] disabled:opacity-50">×</button>
          </span>
        ))}
        {adding ? (
          <input
            autoFocus value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } if (e.key === 'Escape') { setAdding(false); setDraft(''); } }}
            onBlur={() => { if (!draft.trim()) setAdding(false); }}
            placeholder="nueva-etiqueta"
            className="h-6 px-2 rounded-full border border-[#1a1a1a] text-[11.5px] focus:outline-none w-[120px]"
          />
        ) : (
          <button onClick={() => setAdding(true)} disabled={busy} className="h-6 w-6 rounded-full border border-dashed border-[#c6c9c0] text-[#646462] hover:bg-[#f8f8f7] hover:text-[#1a1a1a] disabled:opacity-50 flex items-center justify-center text-[14px] leading-none">+</button>
        )}
      </div>
    </DetailSection>
  );
}

function CustomerSegmentSection({ customer, onAction, onRefresh }: {
  customer: any;
  onAction: (msg: string, type?: 'success' | 'error') => void;
  onRefresh: () => void;
}) {
  const SEGMENTS = ['vip', 'active', 'new', 'churn_risk', 'enterprise'];
  const [busy, setBusy] = useState(false);
  async function pick(seg: string) {
    if (busy || customer.segment === seg) return;
    setBusy(true);
    try {
      await customersApi.update(customer.id, { segment: seg });
      onAction('Segmento actualizado');
      onRefresh();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo actualizar el segmento', 'error');
    } finally { setBusy(false); }
  }
  return (
    <DetailSection title="Segmentos de usuario">
      <div className="py-2 flex flex-wrap gap-1.5">
        {SEGMENTS.map(seg => {
          const active = String(customer.segment || '').toLowerCase() === seg;
          return (
            <button
              key={seg}
              onClick={() => pick(seg)}
              disabled={busy}
              className={`h-6 px-2.5 rounded-full text-[11.5px] font-semibold border ${active ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-[#f8f8f7] text-[#1a1a1a] border-[#e9eae6] hover:bg-[#ededea]'}`}
            >
              {titleCase(seg.replace(/_/g, ' '))}
            </button>
          );
        })}
      </div>
    </DetailSection>
  );
}

function CustomerActivitySection({ customerId }: { customerId: string }) {
  const { data, loading } = useApi(
    () => customersApi.activity(customerId),
    [customerId],
    null,
  );
  const items = Array.isArray(data) ? data : Array.isArray(data?.events) ? data.events : Array.isArray(data?.activity) ? data.activity : [];
  return (
    <DetailSection title={`Vistas recientes de la página (${items.length})`} defaultOpen={false}>
      <div className="py-2 flex flex-col gap-1.5">
        {loading && <p className="text-[12.5px] text-[#646462]">Cargando actividad…</p>}
        {!loading && items.length === 0 && <p className="text-[12.5px] text-[#646462]">No hay actividad registrada.</p>}
        {items.slice(0, 10).map((ev: any, i: number) => (
          <div key={ev.id || i} className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#3b59f6] mt-1.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] text-[#1a1a1a] truncate">{ev.title || ev.description || ev.event_type || ev.type || 'Evento'}</p>
              <p className="text-[11px] text-[#646462]">{relativeTime(ev.occurred_at || ev.created_at || ev.time)}</p>
            </div>
          </div>
        ))}
      </div>
    </DetailSection>
  );
}

function SimilarConversationsSection({ customerId, currentCaseId }: { customerId: string; currentCaseId: string }) {
  const { data: cases, loading } = useApi(
    () => casesApi.list({ customer_id: customerId }),
    [customerId],
    [],
  );
  const list = Array.isArray(cases) ? cases : [];
  const current = list.find((c: any) => c.id === currentCaseId);
  const currentTags = new Set<string>(Array.isArray(current?.tags) ? current.tags : []);
  // Score by tag overlap; ties broken by recency.
  const ranked = list
    .filter((c: any) => c.id !== currentCaseId)
    .map((c: any) => {
      const tags: string[] = Array.isArray(c.tags) ? c.tags : [];
      const overlap = tags.filter(t => currentTags.has(t)).length;
      return { c, overlap };
    })
    .filter(x => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || (new Date(b.c.last_activity_at || b.c.created_at || 0).getTime() - new Date(a.c.last_activity_at || a.c.created_at || 0).getTime()))
    .slice(0, 5);
  return (
    <DetailSection title={`Conversaciones similares (${ranked.length})`} defaultOpen={false}>
      <div className="py-2 flex flex-col gap-1.5">
        {loading && <p className="text-[12.5px] text-[#646462]">Cargando…</p>}
        {!loading && ranked.length === 0 && <p className="text-[12.5px] text-[#646462]">No hay conversaciones con etiquetas en común.</p>}
        {ranked.map(({ c, overlap }) => (
          <a
            key={c.id}
            href={pathFor({ view: 'inbox', scope: 'all', caseId: c.id })}
            className="flex items-center justify-between rounded-lg bg-[#f8f8f7] border border-[#e9eae6] px-3 py-2 hover:bg-[#ededea]"
          >
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-[#1a1a1a] truncate">{c.case_number || c.id}</p>
              <p className="text-[11px] text-[#646462] truncate">{titleCase(c.status)} · {overlap} etiqueta{overlap === 1 ? '' : 's'} en común</p>
            </div>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-3 h-3 text-[#646462] flex-shrink-0"><path d="M6 4l4 4-4 4" /></svg>
          </a>
        ))}
      </div>
    </DetailSection>
  );
}

function DetailsTabContent({
  selectedConv,
  inboxView,
  channelName,
  internalNotes,
  operationalLinks,
  onAction,
  onRefresh,
}: {
  selectedConv: Conversation;
  inboxView: any;
  channelName: string;
  internalNotes: any[];
  operationalLinks: Array<{ type: string; id: string }>;
  onAction: (message: string, type?: 'success' | 'error') => void;
  onRefresh: () => void;
}) {
  const customer = inboxView?.state?.customer || {};
  const caseRow = inboxView?.case || {};
  const caseStateSnap = inboxView?.state?.case || {};
  const sla = inboxView?.sla || {};

  // Real customer fields, falling back to selectedConv where the API hasn't
  // hydrated yet (so the panel still renders something while inboxView loads).
  const realName = customer.canonical_name || customer.name || (selectedConv as any).customerName || 'Sin nombre';
  const realEmail = customer.canonical_email || customer.email || selectedConv.customerEmail || null;
  const realCompany = customer.company || selectedConv.company || null;
  const realLocation = customer.location || null;
  const realTimezone = customer.timezone || null;
  const realCreated = customer.created_at || null;
  const realSegment = customer.segment || null;
  const realLifetimeValue = customer.lifetime_value;
  const realCurrency = customer.currency || 'USD';
  const realTotalOrders = customer.total_orders;

  const firstResponseAt = caseRow.first_response_at || caseStateSnap.first_response_at || null;
  const resolvedAt = caseRow.resolved_at || caseStateSnap.resolved_at || null;
  const slaFirstResponseLabel = firstResponseAt
    ? `Respondido ${relativeTime(firstResponseAt)}`
    : slaDeadlineLabel(caseRow.sla_first_response_deadline || sla.firstResponseDeadline, caseRow.sla_status || sla.status);
  const slaResolutionLabel = resolvedAt
    ? `Resuelto ${relativeTime(resolvedAt)}`
    : slaDeadlineLabel(caseRow.sla_resolution_deadline || sla.resolutionDeadline, caseRow.sla_status || sla.status);

  // The case row may carry an ai_diagnosis JSON blob with summary + actions.
  // We render it cleanly when present and just hide the section otherwise so
  // we never show "Fin gestionó esta conversación" as fake content.
  const aiDiagnosisRaw = caseRow.ai_diagnosis ?? caseStateSnap.ai_diagnosis ?? null;
  const aiDiagnosis: any = (() => {
    if (!aiDiagnosisRaw) return null;
    if (typeof aiDiagnosisRaw === 'object') return aiDiagnosisRaw;
    if (typeof aiDiagnosisRaw === 'string') {
      try { return JSON.parse(aiDiagnosisRaw); } catch { return { summary: aiDiagnosisRaw }; }
    }
    return null;
  })();
  const aiSummaryText: string | null = aiDiagnosis?.summary
    || aiDiagnosis?.executive_summary
    || customer.ai_executive_summary
    || null;
  const aiRecommendedAction: string | null = aiDiagnosis?.recommended_action
    || aiDiagnosis?.next_step
    || null;

  // Inline "+ Añadir nota" form: collapsed by default, opens to a small
  // textarea + "Guardar" button. Posts via casesApi.addInternalNote and
  // refreshes the case so the new note appears in the list.
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  async function submitNote() {
    const content = draft.trim();
    if (!content || submittingNote) return;
    setSubmittingNote(true);
    try {
      await casesApi.addInternalNote(selectedConv.id, content);
      onAction('Nota añadida');
      setDraft('');
      setAdding(false);
      onRefresh();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo guardar la nota', 'error');
    } finally {
      setSubmittingNote(false);
    }
  }

  return (
    <>
      <DetailSection title="Detalles de la conversación">
        <DetailRow label="Persona asignada" value={selectedConv.assignee || 'Sin asignar'} />
        <DetailRow label="Equipo asignado" value={selectedConv.team || 'Sin asignar'} />
        <DetailRow label="Estado" value={titleCase(selectedConv.status)} />
        <DetailRow label="Canal" value={channelName} />
        <DetailRow label="Prioridad" value={titleCase(selectedConv.priority)} />
        <DetailRow label="Riesgo" value={titleCase(selectedConv.riskLevel || customer.risk_level || '—')} />
        {/* Inline tag editor — chips with × to remove + input to add. Calls
            casesApi.updateTags with mode 'add' or 'remove' so the optimistic
            UI is fast and the audit log captures the granular change. */}
        <TagsRow
          tags={selectedConv.tags || []}
          caseId={selectedConv.id}
          onAction={onAction}
          onRefresh={onRefresh}
        />
      </DetailSection>

      <DetailSection title="Cliente">
        <div className="flex items-center gap-2 py-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: selectedConv.avatarColor }}>
            <span className="text-[14px] font-semibold text-[#1a1a1a]">{String(realName).slice(0, 1).toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[#1a1a1a] truncate">{realName}</p>
            <p className="text-[12px] text-[#646462] truncate">
              {realSegment ? `${titleCase(realSegment)} · ` : ''}
              {realCreated ? `cliente desde ${relativeOrAbsoluteTime(realCreated)}` : 'sin antigüedad registrada'}
            </p>
          </div>
        </div>
        {realEmail && <DetailRow label="Correo" value={realEmail} />}
        {realLocation && <DetailRow label="Localización" value={realLocation} />}
        {realTimezone && <DetailRow label="Zona horaria" value={realTimezone} />}
        {Number.isFinite(realLifetimeValue) && realLifetimeValue !== 0 && (
          <DetailRow label="Valor vida" value={`${realLifetimeValue} ${realCurrency}`} />
        )}
        {Number.isFinite(realTotalOrders) && realTotalOrders > 0 && (
          <DetailRow label="Pedidos totales" value={String(realTotalOrders)} />
        )}
      </DetailSection>

      {realCompany && (
        <DetailSection title="Empresa">
          <p className="text-[13px] text-[#1a1a1a] py-2 truncate">{realCompany}</p>
        </DetailSection>
      )}

      <DetailSection title="Atributos de conversación">
        <DetailRow label="ID de conversación" value={String(selectedConv.id).slice(0, 30)} />
        <DetailRow label="Iniciada" value={selectedConv.time} />
        <DetailRow label="SLA primera resp." value={slaFirstResponseLabel} />
        <DetailRow label="SLA resolución" value={slaResolutionLabel} />
      </DetailSection>

      <DetailSection title={`Notas internas (${internalNotes.length})`}>
        <div className="py-2 flex flex-col gap-2">
          {internalNotes.length === 0 && !adding && <p className="text-[13px] text-[#646462]">Sin notas internas todavía.</p>}
          {internalNotes.slice(0, 10).map((note: any, index: number) => (
            <NoteCard
              key={note.id || index}
              note={note}
              caseId={selectedConv.id}
              onAction={onAction}
              onRefresh={onRefresh}
            />
          ))}
          {adding ? (
            <div className="flex flex-col gap-2 mt-1">
              <textarea
                autoFocus
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="Escribe una nota interna…"
                className="w-full min-h-[68px] rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[13px] resize-none focus:outline-none focus:border-[#f59e0b]"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => { setAdding(false); setDraft(''); }}
                  disabled={submittingNote}
                  className="text-[12px] font-semibold text-[#646462] hover:text-[#1a1a1a]"
                >
                  Cancelar
                </button>
                <button
                  onClick={submitNote}
                  disabled={!draft.trim() || submittingNote}
                  className="h-7 px-3 rounded-full bg-[#1a1a1a] text-white text-[12px] font-semibold disabled:bg-[#e9eae6] disabled:text-[#646462]"
                >
                  {submittingNote ? 'Guardando…' : 'Guardar nota'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="self-start mt-1 text-[12px] font-semibold text-[#1a1a1a] hover:underline"
            >
              + Añadir nota interna
            </button>
          )}
        </div>
      </DetailSection>

      <DetailSection title="Enlaces operativos">
        <div className="py-2 flex flex-col gap-2">
          {operationalLinks.length === 0 && <p className="text-[13px] text-[#646462]">Sin pedidos, pagos o devoluciones vinculadas.</p>}
          {operationalLinks.map((link, index) => (
            <div key={`${link.type}-${link.id}-${index}`} className="flex items-center justify-between rounded-xl bg-[#f8f8f7] border border-[#e9eae6] px-3 py-2">
              <span className="text-[12px] font-semibold text-[#1a1a1a]">{link.type}</span>
              <span className="text-[12px] text-[#646462] truncate ml-2">{link.id}</span>
            </div>
          ))}
        </div>
      </DetailSection>

      {(aiSummaryText || aiRecommendedAction) && (
        <DetailSection title="Análisis de la IA">
          <div className="py-2 flex flex-col gap-2">
            {aiSummaryText && (
              <div className="rounded-2xl bg-[#f4f4ff] border border-[#dadbf3] p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-4 h-4 rounded-full bg-[#e7e2fd] flex items-center justify-center">
                    <img src={ICON_FIN} alt="" className="w-2.5 h-2.5" />
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[#646462]">Resumen ejecutivo</span>
                </div>
                <p className="text-[12.5px] text-[#1a1a1a] leading-5 whitespace-pre-wrap">{aiSummaryText}</p>
              </div>
            )}
            {aiRecommendedAction && (
              <div className="rounded-2xl bg-[#f8f8f7] border border-[#e9eae6] p-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[#646462]">Próxima acción sugerida</span>
                <p className="text-[12.5px] text-[#1a1a1a] leading-5 mt-1 whitespace-pre-wrap">{aiRecommendedAction}</p>
              </div>
            )}
          </div>
        </DetailSection>
      )}

      {/* ── Customer-side modules — 7 collapsible sections under Información ── */}
      {customer.id && (
        <CustomerInfoSections
          customer={customer}
          currentCaseId={selectedConv.id}
          onAction={onAction}
          onRefresh={onRefresh}
        />
      )}
    </>
  );
}

function DetailsSidebar({
  selectedConv,
  inboxView,
  copilotMessages,
  onSendCopilot,
  copilotLoading,
  onUseAsReply,
  onGenerateDraft,
  draftLoading,
  onRefresh,
  onAction,
  onCollapse,
}: {
  selectedConv: Conversation;
  inboxView: any;
  copilotMessages: PrototypeCopilotMessage[];
  onSendCopilot: (question: string) => void;
  copilotLoading: boolean;
  onUseAsReply: (text: string) => void;
  onGenerateDraft: () => void;
  draftLoading: boolean;
  onRefresh: () => void;
  onAction: (message: string, type?: 'success' | 'error') => void;
  onCollapse?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'details' | 'copilot'>('details');
  const [detailSubTab, setDetailSubTab] = useState<'detalles' | 'cronologia' | 'conversaciones'>('detalles');
  const [copilotText, setCopilotText] = useState('');

  const channelName = titleCase(selectedConv.sourceChannel || selectedConv.channel.split('·')[0].trim());

  const caseState = inboxView?.state || selectedConv.raw?.stateSnapshot || {};
  const internalNotes = getInboxInternalNotes(inboxView);
  const relatedCases = safeArray(caseState?.related?.linkedCases || caseState?.related?.linked_cases);
  const operationalLinks = [
    ...safeArray(caseState?.related?.orders).map((item: any) => ({ type: 'OMS', id: item.id || item.orderId || item.order_id || String(item) })),
    ...safeArray(caseState?.related?.payments).map((item: any) => ({ type: 'PSP', id: item.id || item.paymentId || item.payment_id || String(item) })),
    ...safeArray(caseState?.related?.returns).map((item: any) => ({ type: 'RMS', id: item.id || item.returnId || item.return_id || String(item) })),
  ];

  // Real timeline from /cases/:id/timeline. Lazy-loaded — only fetched when
  // the user actually opens the cronología sub-tab. Re-fetches when the case
  // changes or the sub-tab is re-opened.
  const timelineCaseId = activeTab === 'details' && detailSubTab === 'cronologia' ? selectedConv.id : null;
  const { data: timelineData, loading: timelineLoading, error: timelineError } = useApi(
    () => timelineCaseId ? casesApi.timeline(timelineCaseId) : Promise.resolve([]),
    [timelineCaseId],
    [],
  );
  const timelineEntries = useMemo(() => {
    const arr = Array.isArray(timelineData) ? timelineData : [];
    // Sort newest first; items without occurred_at fall to the bottom.
    return [...arr].sort((a: any, b: any) => {
      const ta = new Date(a?.occurred_at || a?.created_at || 0).getTime();
      const tb = new Date(b?.occurred_at || b?.created_at || 0).getTime();
      return tb - ta;
    });
  }, [timelineData]);

  return (
    <div className="flex flex-col h-full w-[346px] min-w-[346px] max-w-[346px] bg-white rounded-2xl shadow-[0px_1px_4px_0px_rgba(20,20,20,0.15)] flex-shrink-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#e9eae6] px-4 flex-shrink-0">
        <div className="flex items-center min-w-0">
          {([['details', 'Información'], ['copilot', 'Copilot']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`text-[13px] h-10 px-2 mr-2 ${activeTab === id ? 'font-semibold text-[#1a1a1a] border-b-2 border-[#1a1a1a]' : 'text-[#646462] hover:text-[#1a1a1a]'}`}>
              {label}
            </button>
          ))}
        </div>
        {onCollapse && (
          <button onClick={onCollapse} title="Esconder detalles" className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f8f8f7] text-[#646462] flex-shrink-0">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <path d="M6 4l4 4-4 4" />
            </svg>
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {activeTab === 'details' && (
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e9eae6]">
            {([['detalles', 'Detalles'], ['cronologia', 'Cronología'], ['conversaciones', 'Conversaciones']] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setDetailSubTab(id)}
                className={`h-7 px-3 rounded-full text-[12.5px] font-semibold ${
                  detailSubTab === id ? 'bg-[#1a1a1a] text-white' : 'bg-[#f8f8f7] text-[#646462] hover:text-[#1a1a1a]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {activeTab === 'details' && detailSubTab === 'detalles' && <DetailsTabContent
          selectedConv={selectedConv}
          inboxView={inboxView}
          channelName={channelName}
          internalNotes={internalNotes}
          operationalLinks={operationalLinks}
          onAction={onAction}
          onRefresh={onRefresh}
        />}
        {activeTab === 'details' && detailSubTab === 'cronologia' && (
          <div className="px-5 py-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-[#1a1a1a]">Cronología completa</p>
              {timelineEntries.length > 0 && (
                <span className="text-[11px] text-[#646462]">{timelineEntries.length} eventos</span>
              )}
            </div>
            {timelineLoading && <p className="text-[12.5px] text-[#646462]">Cargando cronología…</p>}
            {timelineError && <p className="text-[12.5px] text-[#b91c1c]">No se pudo cargar la cronología.</p>}
            {!timelineLoading && !timelineError && timelineEntries.length === 0 && (
              <p className="text-[12.5px] text-[#646462]">Sin eventos registrados todavía.</p>
            )}
            {timelineEntries.map((entry: any, i: number) => <TimelineEntryRow key={entry.id || `tl-${i}`} entry={entry} />)}
          </div>
        )}
        {activeTab === 'details' && detailSubTab === 'conversaciones' && (
          <div className="px-6 py-4">
            <p className="text-[13px] font-semibold text-[#1a1a1a] mb-3">Otras conversaciones</p>
            {relatedCases.length === 0 && <p className="text-[13px] text-[#646462]">No hay otras conversaciones con este usuario.</p>}
            <div className="flex flex-col gap-2">
              {relatedCases.map((related: any, index: number) => {
                const targetId = related.id || related.case_id;
                const title = related.title || related.subject || related.case_number || targetId || 'Caso relacionado';
                if (!targetId) {
                  return (
                    <div key={index} className="rounded-xl bg-[#f8f8f7] border border-[#e9eae6] px-3 py-2">
                      <p className="text-[13px] font-semibold text-[#1a1a1a] truncate">{title}</p>
                      <p className="text-[12px] text-[#646462]">{titleCase(related.status || 'relacionado')}</p>
                    </div>
                  );
                }
                return (
                  <a
                    key={targetId}
                    href={pathFor({ view: 'inbox', scope: 'all', caseId: targetId })}
                    title="Abrir esta conversación"
                    className="rounded-xl bg-[#f8f8f7] border border-[#e9eae6] px-3 py-2 hover:bg-[#ededea] hover:border-[#d3cec6] block"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold text-[#1a1a1a] truncate">{title}</p>
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 text-[#646462] flex-shrink-0">
                        <path d="M6 4l4 4-4 4" />
                      </svg>
                    </div>
                    <p className="text-[12px] text-[#646462]">{titleCase(related.status || 'relacionado')}</p>
                  </a>
                );
              })}
            </div>
          </div>
        )}
        {activeTab === 'copilot' && (
          <CopilotModule
            selectedConv={selectedConv}
            inboxView={inboxView}
            messages={copilotMessages}
            loading={copilotLoading}
            draftLoading={draftLoading}
            text={copilotText}
            setText={setCopilotText}
            onSend={onSendCopilot}
            onUseAsReply={onUseAsReply}
            onGenerateDraft={onGenerateDraft}
          />
        )}
      </div>
    </div>
  );
}

// Read inbox-specific deep-link params from the URL once at mount.
// Path form: /inbox/:scope/:caseId (with a legacy ?scope=&case= fallback,
// handled inside router.parsePath).
function readInitialInboxParams(): { scope: InboxScope; caseId: string } {
  if (typeof window === 'undefined') return { scope: 'inbox', caseId: '' };
  const { view, scope, caseId } = parsePath();
  if (view !== 'inbox') return { scope: 'inbox', caseId: '' };
  const knownScopes: InboxScope[] = ['inbox','mentions','created','all','unassigned','spam','dashboard','fin-all','fin-resolved','fin-escalated','fin-pending','fin-spam','v-messenger','v-email','v-whatsapp','v-phone','v-tickets'];
  const isDynamic = typeof scope === 'string' && (scope.startsWith('team:') || scope.startsWith('agent:'));
  const resolvedScope = scope && ((knownScopes as string[]).includes(scope) || isDynamic) ? (scope as InboxScope) : 'inbox';
  return { scope: resolvedScope, caseId: caseId || '' };
}

// CollapsedRail — thin (28px) bar shown in place of a hidden sidebar. Click
// expands the sidebar back. Arrow points outward from the chat ("▶" on the
// right, "◀" on the left equivalent) so the affordance is obvious.
function CollapsedRail({ side, label, onClick }: { side: 'left' | 'right'; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex flex-col items-center justify-center h-full w-7 flex-shrink-0 rounded-2xl bg-[#f8f8f7] border border-[#e9eae6] hover:bg-[#ededea] text-[#646462]"
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
        {side === 'left' ? <path d="M6 4l4 4-4 4" /> : <path d="M10 4l-4 4 4 4" />}
      </svg>
    </button>
  );
}

export function InboxView() {
  const initialParams = readInitialInboxParams();
  const [selectedConvId, setSelectedConvId] = useState(initialParams.caseId);
  const [scope, setScope] = useState<InboxScope>(initialParams.scope);
  const [refreshKey, setRefreshKey] = useState(0);
  // Nueva conversación: opened from the sidebar's "+" button or the dropdown
  // "Nueva conversación" entry. Global so a single state covers both surfaces.
  const [showNewConvModal, setShowNewConvModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [copilotByCaseId, setCopilotByCaseId] = useState<Record<string, PrototypeCopilotMessage[]>>({});
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotDraftLoading, setCopilotDraftLoading] = useState(false);
  // Composer state lifted up from ConversationPanel so the right-sidebar
  // Copilot can push drafts straight into the reply box without a sibling
  // ref-bridge.
  const [replyText, setReplyText] = useState('');
  const [replyTab, setReplyTab] = useState<'responder' | 'nota' | 'datosIA'>('responder');
  // Each sidebar can be hidden so the agent can focus on the conversation
  // panel. Persisted per-browser via localStorage so the layout survives
  // reloads. Defaults: all three open.
  const PANELS_LS_KEY = 'clain.inbox.panels';
  type PanelState = { left: boolean; list: boolean; right: boolean };
  const [panels, setPanels] = useState<PanelState>(() => {
    if (typeof window === 'undefined') return { left: true, list: true, right: true };
    try {
      const raw = window.localStorage.getItem(PANELS_LS_KEY);
      if (!raw) return { left: true, list: true, right: true };
      const parsed = JSON.parse(raw);
      return {
        left:  typeof parsed?.left  === 'boolean' ? parsed.left  : true,
        list:  typeof parsed?.list  === 'boolean' ? parsed.list  : true,
        right: typeof parsed?.right === 'boolean' ? parsed.right : true,
      };
    } catch { return { left: true, list: true, right: true }; }
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(PANELS_LS_KEY, JSON.stringify(panels)); } catch { /* ignore quota */ }
  }, [panels]);
  function togglePanel(which: keyof PanelState) {
    setPanels(p => ({ ...p, [which]: !p[which] }));
  }
  const { data: meData } = useApi(() => iamApi.me(), [], null);
  const currentUserId: string | null = (meData as any)?.id ?? (meData as any)?.userId ?? (meData as any)?.user_id ?? null;
  const [teamsRefresh, setTeamsRefresh] = useState(0);
  const { data: teamsData } = useApi(() => iamApi.teams(), [teamsRefresh], []);
  const { data: membersData } = useApi(() => iamApi.members(), [], []);
  const teams: any[] = Array.isArray(teamsData) ? teamsData : (teamsData as any)?.data ?? (teamsData as any)?.teams ?? [];
  const teammates: any[] = Array.isArray(membersData) ? membersData : (membersData as any)?.data ?? (membersData as any)?.members ?? [];
  // Build the server-side filter params for the active scope.
  function buildScopeParams(): Record<string, string> {
    const params: Record<string, string> = {};
    if (scope === 'unassigned') params.scope = 'unassigned';
    if (scope === 'spam') params.status = 'spam';
    if (scope === 'inbox' && currentUserId) params.assigned_user_id = currentUserId;
    if (scope === 'created' && currentUserId) params.created_by = currentUserId;
    // Fin AI scopes — fetch all ai_handled cases; client matchesInboxScope handles sub-filtering
    if (scope === 'fin-all' || scope === 'fin-resolved' || scope === 'fin-escalated' || scope === 'fin-pending' || scope === 'fin-spam') {
      params.ai_handled = 'true';
    }
    if (scope.startsWith('team:')) params.assigned_team_id = scope.replace('team:', '');
    if (scope.startsWith('agent:')) params.assigned_agent_id = scope.replace('agent:', '');
    if (scope === 'v-messenger') params.source_channel = 'messenger,web_chat,chat';
    if (scope === 'v-email') params.source_channel = 'email';
    if (scope === 'v-whatsapp') params.source_channel = 'whatsapp,social';
    if (scope === 'v-phone') params.source_channel = 'phone,sms';
    if (scope === 'v-tickets') params.source_channel = 'ticket,tickets';
    return params;
  }

  // Paginated list loader (page size 50) — the inbox no longer pulls every case
  // into the browser. Page 0 loads on scope/refresh change; loadMore() appends
  // the next page for the infinite-scroll list. A request-id guard drops stale
  // responses when the scope changes mid-flight.
  const LIST_PAGE_SIZE = 50;
  const [rawCases, setRawCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const listOffsetRef = useRef(0);
  const listReqRef = useRef(0);
  async function loadCasesPage(reset: boolean) {
    const params = buildScopeParams();
    params.limit = String(LIST_PAGE_SIZE);
    params.offset = String(reset ? 0 : listOffsetRef.current);
    const reqId = ++listReqRef.current;
    if (reset) setLoading(true); else setLoadingMore(true);
    try {
      const rows = await casesApi.list(params);
      if (reqId !== listReqRef.current) return; // superseded
      const arr = Array.isArray(rows) ? rows : [];
      setHasMore(arr.length === LIST_PAGE_SIZE);
      if (reset) { setRawCases(arr); listOffsetRef.current = arr.length; }
      else { setRawCases(prev => [...prev, ...arr]); listOffsetRef.current += arr.length; }
      setError(null);
    } catch (e) {
      if (reqId !== listReqRef.current) return;
      if (reset) setRawCases([]);
      setHasMore(false);
      setError(e);
    } finally {
      if (reqId === listReqRef.current) { setLoading(false); setLoadingMore(false); }
    }
  }
  // Reset + load page 0 whenever the scope, user or refresh key changes.
  useEffect(() => {
    loadCasesPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, scope, currentUserId]);
  function loadMoreCases() {
    if (hasMore && !loading && !loadingMore) loadCasesPage(false);
  }
  // Real backend data only — no mock fallback. Empty list = empty UI.
  const liveConversations = useMemo(
    () => rawCases.map(mapCaseToPrototypeConversation),
    [rawCases],
  );
  // Sidebar "Buscar" → activates a global free-text search across every
  // conversation field (channel / customer / preview / tags / company /
  // assignee / case id). When the search query is empty we fall through to
  // the regular scope filter so the user can clear without leaving the view.
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  // Server-side search: debounce the query and hit /cases/search so we match
  // across the whole workspace (case number, customer, message content) — not
  // just the conversations already loaded in memory.
  const [searchResults, setSearchResults] = useState<Conversation[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  useEffect(() => {
    if (scope !== 'search') return;
    const q = globalSearchQuery.trim();
    if (q.length < 2) { setSearchResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const rows = await casesApi.search(q, 50);
        if (!cancelled) setSearchResults(Array.isArray(rows) ? rows.map(mapCaseToPrototypeConversation) : []);
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [scope, globalSearchQuery]);
  const scopedConversations = useMemo(() => {
    if (scope === 'search') {
      // <2 chars → show the already-loaded set so the list isn't blank; once
      // the user types a real query the debounced server results take over.
      return globalSearchQuery.trim().length < 2 ? liveConversations : searchResults;
    }
    return liveConversations.filter(conv => matchesInboxScope(conv, scope, currentUserId));
  }, [liveConversations, scope, globalSearchQuery, searchResults, currentUserId]);
  // Sidebar counts come from the server (one RPC, no need to load every case).
  // While that request is in flight — or if it fails — we fall back to counting
  // whatever is currently loaded so the badges are never blank.
  const { data: serverCounts } = useApi<Record<string, any> | null>(() => casesApi.counts(), [refreshKey], null);
  const counts = useMemo(() => {
    const result: Partial<Record<InboxScope, number>> = {};
    if (serverCounts && typeof serverCounts === 'object') {
      for (const [k, v] of Object.entries(serverCounts)) {
        if (k === 'teams' && Array.isArray(v)) {
          for (const t of v) if (t?.id != null) result[`team:${t.id}` as InboxScope] = Number(t.count) || 0;
        } else if (k === 'agents' && Array.isArray(v)) {
          for (const a of v) if (a?.id != null) result[`agent:${a.id}` as InboxScope] = Number(a.count) || 0;
        } else if (typeof v === 'number') {
          result[k as InboxScope] = v;
        }
      }
      return result;
    }
    // Fallback: derive from the loaded set until the server responds.
    const staticScopes: InboxScope[] = ['inbox', 'mentions', 'created', 'all', 'unassigned', 'spam', 'fin-all', 'fin-resolved', 'fin-escalated', 'fin-pending', 'fin-spam', 'v-messenger', 'v-email', 'v-whatsapp', 'v-phone', 'v-tickets'];
    for (const key of staticScopes) {
      result[key] = liveConversations.filter(conv => matchesInboxScope(conv, key, currentUserId)).length;
    }
    for (const team of teams) {
      const tid = team.id ?? team.team_id;
      if (tid) result[`team:${tid}` as InboxScope] = liveConversations.filter(conv => matchesInboxScope(conv, `team:${tid}` as InboxScope, currentUserId)).length;
    }
    for (const member of teammates) {
      const mid = member.id ?? member.user_id;
      if (mid) result[`agent:${mid}` as InboxScope] = liveConversations.filter(conv => matchesInboxScope(conv, `agent:${mid}` as InboxScope, currentUserId)).length;
    }
    return result;
  }, [serverCounts, liveConversations, currentUserId, teams, teammates]);
  const selectedConv = scopedConversations.find(c => c.id === selectedConvId) ?? scopedConversations[0] ?? liveConversations[0];
  const { data: inboxView } = useApi(
    () => selectedConv?.id ? casesApi.inboxView(selectedConv.id) : Promise.resolve(null),
    [selectedConv?.id, refreshKey],
  );

  useEffect(() => {
    if (!selectedConvId && liveConversations[0]?.id) setSelectedConvId(liveConversations[0].id);
  }, [selectedConvId, liveConversations]);

  // ─── Live updates via SSE ────────────────────────────────────────────────
  // Subscribe once to /api/sse/case-events and bump refreshKey whenever a
  // case mutation event arrives. Auto-reconnects on drop. Each event also
  // surfaces a small toast so the agent knows something changed remotely.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    // Exponential backoff: a persistent failure (e.g. an expired session that
    // 401s) shouldn't be retried every 5 s forever — that just spams the server
    // and the logs. Start at 5 s and double up to a 60 s ceiling. The connection
    // still recovers automatically once the server/session is healthy again; a
    // successful (re)connect resets the delay back to the floor.
    const MIN_DELAY = 5_000;
    const MAX_DELAY = 60_000;
    let delay = MIN_DELAY;
    function connect() {
      if (cancelled) return;
      try {
        es = new EventSource('/api/sse/case-events');
      } catch {
        return;
      }
      es.onopen = () => { delay = MIN_DELAY; };
      const bump = () => setRefreshKey(k => k + 1);
      es.addEventListener('case:reply', bump);
      es.addEventListener('case:updated', bump);
      es.addEventListener('case:created', bump);
      es.addEventListener('case:note_added', bump);
      es.onerror = () => {
        try { es?.close(); } catch { /* ignore */ }
        if (cancelled) return;
        retryTimer = setTimeout(connect, delay);
        delay = Math.min(delay * 2, MAX_DELAY);
      };
    }
    connect();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      try { es?.close(); } catch { /* ignore */ }
    };
  }, []);

  // ─── Inbox-global keyboard shortcuts ─────────────────────────────────────
  // j / k       → next / previous conversation in the current scope
  // Esc         → blur active textarea / cancel ongoing composer focus
  // Cmd/Ctrl+K  → focus the conversation-list filter button (visible cue)
  // ?           → show a small toast listing the shortcuts
  // We bind on window so the keys work regardless of focus, but explicitly
  // ignore events fired from inputs / textareas / contenteditables so we
  // never steal a keystroke from the composer.
  const showShortcutsHelp = () => {
    setToast({
      type: 'success',
      message: 'Atajos: j/k siguiente/anterior · Esc enfocar lista · Ctrl+K filtros · Ctrl+Enter envía',
    });
    window.setTimeout(() => setToast(null), 4500);
  };
  useEffect(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (el.isContentEditable) return true;
      return false;
    }
    function handler(e: KeyboardEvent) {
      const inEditable = isEditableTarget(e.target);
      // Cmd/Ctrl + K → focus the filter toggle on the conversation list.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const btn = document.querySelector<HTMLButtonElement>('button[title="Filtros"]')
                 || document.querySelector<HTMLButtonElement>('button[title="Buscar en la conversación"]');
        btn?.focus();
        btn?.click();
        return;
      }
      // ? → shortcut help (only when not typing).
      if (!inEditable && e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        showShortcutsHelp();
        return;
      }
      // Esc → blur whatever input is focused; keeps the user from being
      // trapped inside the composer and ready for j/k navigation.
      if (e.key === 'Escape' && inEditable) {
        (e.target as HTMLElement).blur();
        return;
      }
      // j / k navigation through scopedConversations. Only when not editing.
      if (!inEditable && (e.key === 'j' || e.key === 'k')) {
        const list = scopedConversations.length ? scopedConversations : liveConversations;
        if (!list.length) return;
        const idx = Math.max(0, list.findIndex((c: any) => c.id === selectedConv?.id));
        const nextIdx = e.key === 'j'
          ? Math.min(list.length - 1, idx + 1)
          : Math.max(0, idx - 1);
        const next = list[nextIdx];
        if (next && next.id !== selectedConv?.id) {
          e.preventDefault();
          setSelectedConvId(next.id);
        }
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [scopedConversations, liveConversations, selectedConv?.id]);

  // Reflect scope + selected case in the URL as a clean path
  // (/inbox/:scope/:caseId) so deep-links survive reloads and back/forward.
  // 'search' is a transient UI mode, not a shareable scope — don't put it in
  // the path. replaceRoute refines in place (no history spam per keystroke).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const scopeForUrl = scope === 'search' ? undefined : scope;
    replaceRoute({ view: 'inbox', scope: scopeForUrl, caseId: selectedConv?.id || undefined });
  }, [scope, selectedConv?.id]);

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2500);
  }

  function changeScope(next: InboxScope) {
    setScope(next);
    setSelectedConvId('');
  }

  async function sendCopilot(question: string) {
    if (!selectedConv?.id || copilotLoading) return;
    const caseId = selectedConv.id;
    const userMsg: PrototypeCopilotMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: question,
      time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    };
    const history = (copilotByCaseId[caseId] || []).map(msg => ({ role: msg.role, content: msg.content }));
    setCopilotByCaseId(state => ({ ...state, [caseId]: [...(state[caseId] || []), userMsg] }));
    setCopilotLoading(true);
    try {
      const response = await aiApi.copilot(caseId, question, history);
      const assistantMsg: PrototypeCopilotMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: response?.answer || response?.message || response?.content || 'No he podido generar una respuesta.',
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      };
      setCopilotByCaseId(state => ({ ...state, [caseId]: [...(state[caseId] || []), assistantMsg] }));
    } catch (err: any) {
      setCopilotByCaseId(state => ({
        ...state,
        [caseId]: [...(state[caseId] || []), {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: err?.message || 'Copilot no ha podido responder.',
          time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        }],
      }));
    } finally {
      setCopilotLoading(false);
    }
  }

  // Push a string from the Copilot (chat answer or generated draft) into the
  // composer. Switches the composer to "Responder" so the agent sees it.
  function useAsReply(text: string) {
    setReplyText(text);
    setReplyTab('responder');
    showToast('Insertado en el composer', 'success');
  }

  // Generate a fresh AI draft via the backend's copilot endpoint and drop it
  // straight into the composer. Uses copilot (synchronous) instead of
  // aiApi.draft (async job queue) so the agent gets text immediately.
  async function generateDraftFromCopilot() {
    if (!selectedConv?.id || copilotDraftLoading) return;
    setCopilotDraftLoading(true);
    try {
      const customer = (selectedConv as any).customerName || 'el cliente';
      const channel = (selectedConv as any).sourceChannel || 'el canal actual';
      const question = `Redacta una respuesta clara, empática y accionable para ${customer} usando ${channel}. Devuelve SOLO el texto del mensaje, sin preámbulo ni cabecera.`;
      const response = await aiApi.copilot(selectedConv.id, question, []);
      const draft = response?.answer || response?.message || response?.content || '';
      if (draft.trim()) {
        useAsReply(draft.trim());
      } else {
        showToast('Copilot no ha podido generar el borrador', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'No se ha podido generar el borrador', 'error');
    } finally {
      setCopilotDraftLoading(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        {panels.left ? (
          <InboxSidebar
              active={scope}
              onScopeChange={changeScope}
              counts={counts}
              onAction={showToast}
              onCollapse={() => togglePanel('left')}
              onNewConversation={() => setShowNewConvModal(true)}
              teams={teams}
              teammates={teammates}
              onTeamsChanged={() => setTeamsRefresh(k => k + 1)}
              onNewTeammate={() => {
                window.dispatchEvent(new CustomEvent('app-navigate', { detail: { view: 'workspaceTeammates' } }));
              }}
            />
        ) : (
          <CollapsedRail side="left" label="Mostrar sidebar" onClick={() => togglePanel('left')} />
        )}
        {panels.list ? (
          <div className="relative h-full flex-shrink-0">
            {scope === 'search' && (
              <div className="absolute top-0 left-0 right-0 z-10 bg-[#f8f8f7] border-b border-[#e9eae6] px-3 py-3">
                <input
                  autoFocus
                  value={globalSearchQuery}
                  onChange={e => setGlobalSearchQuery(e.target.value)}
                  placeholder="Buscar por cliente, nº de caso o texto del mensaje…"
                  className="w-full h-9 rounded-lg border border-[#e9eae6] bg-white px-3 text-[13px] focus:outline-none focus:border-[#1a1a1a]"
                />
                <p className="text-[11px] text-[#646462] mt-1.5">
                  {globalSearchQuery.trim().length < 2
                    ? 'Escribe al menos 2 caracteres para buscar en todo el workspace'
                    : searchLoading
                      ? 'Buscando…'
                      : `${scopedConversations.length} resultado${scopedConversations.length === 1 ? '' : 's'}`}
                </p>
              </div>
            )}
            <div className={scope === 'search' ? 'pt-[88px] h-full' : 'h-full'}>
              <ConversationList
                selectedId={selectedConv?.id || selectedConvId}
                onSelect={setSelectedConvId}
                items={scope === 'dashboard' ? liveConversations : scopedConversations}
                loading={loading || (scope === 'search' && searchLoading)}
                error={error ? (error?.message || 'No se pudieron cargar las conversaciones') : null}
                title={inboxScopeTitle(scope)}
                scope={scope}
                onCollapse={() => togglePanel('list')}
                onLoadMore={scope === 'search' ? undefined : loadMoreCases}
                hasMore={scope === 'search' ? false : hasMore}
                loadingMore={loadingMore}
              />
            </div>
          </div>
        ) : (
          <CollapsedRail side="left" label="Mostrar lista" onClick={() => togglePanel('list')} />
        )}
        <div className="flex flex-1 min-w-0 gap-2">
          {selectedConv ? (
            <>
              <ConversationPanel
                selectedConv={selectedConv}
                inboxView={inboxView}
                onRefresh={() => setRefreshKey(k => k + 1)}
                onAction={showToast}
                replyText={replyText}
                setReplyText={setReplyText}
                replyTab={replyTab}
                setReplyTab={setReplyTab}
                panels={panels}
                onTogglePanel={togglePanel}
                onNewConversation={() => setShowNewConvModal(true)}
              />
              {panels.right ? (
                <DetailsSidebar
                  selectedConv={selectedConv}
                  inboxView={inboxView}
                  copilotMessages={copilotByCaseId[selectedConv.id] || []}
                  onSendCopilot={sendCopilot}
                  copilotLoading={copilotLoading}
                  onUseAsReply={useAsReply}
                  onGenerateDraft={generateDraftFromCopilot}
                  draftLoading={copilotDraftLoading}
                  onRefresh={() => setRefreshKey(k => k + 1)}
                  onAction={showToast}
                  onCollapse={() => togglePanel('right')}
                />
              ) : (
                <CollapsedRail side="right" label="Mostrar detalles" onClick={() => togglePanel('right')} />
              )}
            </>
          ) : (
            <div className="flex flex-1 min-w-0 items-center justify-center bg-white rounded-2xl shadow-[0px_1px_4px_0px_rgba(20,20,20,0.15)]">
              <div className="text-center max-w-[360px] px-6">
                <div className="text-[40px] mb-2">📬</div>
                <h2 className="text-[16px] font-semibold tracking-[-0.4px] text-[#1a1a1a] mb-1">
                  {loading ? 'Cargando conversaciones…' : error ? 'No hemos podido cargar las conversaciones' : 'Sin conversación seleccionada'}
                </h2>
                <p className="text-[13px] text-[#646462] leading-5">
                  {loading
                    ? 'Conectando con el backend.'
                    : error
                      ? 'Revisa que el backend esté en marcha y vuelve a intentarlo.'
                      : 'Selecciona una conversación de la lista para verla aquí.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-[13px] font-semibold shadow-lg ${
          toast.type === 'success' ? 'bg-[#222] text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}
      {showNewConvModal && (
        <NewConversationModal
          onClose={() => setShowNewConvModal(false)}
          onCreated={(id) => {
            setRefreshKey(k => k + 1);
            // Switch to a scope where the new case will be visible, then
            // pre-select it. 'all' is the safest because new cases land in
            // 'inbox' too but 'all' guarantees presence.
            setScope('all');
            setSelectedConvId(id);
          }}
          onAction={showToast}
        />
      )}
    </div>
  );
}

// ── InboxTeamView (1-68756) ───────────────────────────────────────────────────

export function InboxTeamView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [method, setMethod] = useState<'manual' | 'roundrobin' | 'equilibrio'>('manual');
  const { data: teams, loading: teamsLoading } = useApi(() => iamApi.teams(), [], []);
  const { data: members } = useApi(() => iamApi.members(), [], []);
  const { data: inboxes, refetch: reloadInboxes } = useApi(() => inboxesApi.list(), [], []);
  const [inboxName, setInboxName] = useState('');
  const [creatingInbox, setCreatingInbox] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function handleCreateInbox() {
    if (!inboxName.trim()) { showToast('El nombre del buzón es obligatorio', false); return; }
    setCreatingInbox(true);
    try {
      await inboxesApi.create({
        name: inboxName.trim(),
        channel_type: 'web_widget',
        auto_assignment_enabled: method !== 'manual',
      });
      showToast('Buzón de equipo creado correctamente.');
      setInboxName('');
      setMethod('manual');
      reloadInboxes();
    } catch (err: any) {
      showToast(err?.message ?? 'Error al crear el buzón', false);
    } finally { setCreatingInbox(false); }
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden relative">
          {/* Toast */}
          {toast && (
            <div className={`absolute top-4 right-4 z-50 px-4 py-2.5 rounded-[8px] text-[13px] font-medium shadow-lg ${toast.ok ? 'bg-[#1a1a1a] text-white' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {toast.msg}
            </div>
          )}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Inbox para el equipo</h1>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg></button>
              <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Nuevo buzón del equipo</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-6">
            {/* Existing inboxes list */}
            {(inboxes as any[]).length > 0 && (
              <div className="mb-6">
                <h2 className="text-[15px] font-semibold text-[#1a1a1a] mb-3">Buzones ({(inboxes as any[]).length})</h2>
                <div className="flex flex-col gap-2">
                  {(inboxes as any[]).map((inbox: any) => (
                    <div key={inbox.id} className="border border-[#e9eae6] rounded-[12px] px-5 py-4 flex items-center gap-4 hover:bg-[#fafaf9]">
                      <div className="w-10 h-10 rounded-[10px] bg-[#f3f3f1] flex items-center justify-center flex-shrink-0 text-[18px]">
                        {inbox.channel_type === 'email' ? '✉️' : inbox.channel_type === 'whatsapp' ? '💬' : inbox.channel_type === 'phone' ? '📞' : '📥'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-[#1a1a1a]">{inbox.name}</p>
                        <p className="text-[12px] text-[#646462]">{inbox.channel_type} · {inbox.enabled ? 'Activo' : 'Desactivado'}</p>
                      </div>
                      <div className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${inbox.enabled ? 'bg-[#d1fae5] text-[#065f46]' : 'bg-[#f3f4f6] text-[#6b7280]'}`}>
                        {inbox.enabled ? 'Activo' : 'Inactivo'}
                      </div>
                      <button className="text-[13px] text-[#646462] border border-[#e9eae6] rounded-full px-3 py-1.5 hover:bg-[#f3f3f1]">Editar</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Existing teams list */}
            {teams.length > 0 && (
              <div className="mb-6">
                <h2 className="text-[15px] font-semibold text-[#1a1a1a] mb-3">Buzones del equipo ({teams.length})</h2>
                <div className="flex flex-col gap-2">
                  {teams.map((t: any) => {
                    const teamMembers = members.filter((m: any) => m.teamId === t.id || m.team_id === t.id);
                    return (
                      <div key={t.id} className="border border-[#e9eae6] rounded-[12px] px-5 py-4 flex items-center gap-4 hover:bg-[#fafaf9]">
                        <div className="w-10 h-10 rounded-[10px] bg-[#f3f3f1] flex items-center justify-center flex-shrink-0 text-[18px]">👥</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold text-[#1a1a1a]">{t.name ?? t.label ?? t.id}</p>
                          <p className="text-[12px] text-[#646462]">{teamMembers.length > 0 ? `${teamMembers.length} miembros` : t.description ?? 'Sin descripción'}</p>
                        </div>
                        <button className="text-[13px] text-[#646462] border border-[#e9eae6] rounded-full px-3 py-1.5 hover:bg-[#f3f3f1]">Editar</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Promo card */}
            <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-6 flex items-center gap-6 mb-6 relative">
              <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#ededea]"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg></button>
              <div className="flex-1 max-w-[500px]">
                <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-2">Optimiza tu asistencia con los buzones de equipo</h2>
                <p className="text-[13px] text-[#646462] mb-4">Cada equipo que creas tiene un espacio separado en tu buzón, por lo que es fácil asignar los mensajes correctos a las personas adecuadas.</p>
                <div className="flex items-center gap-3">
                  <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Nuevo buzón del equipo</button>
                  <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5">📖 Inbox para el equipo</button>
                </div>
              </div>
              <div className="w-[300px] h-[180px] flex-shrink-0 rounded-[8px] bg-[#fef3c7] flex items-center justify-center text-[12px] text-[#92400e] font-medium border border-[#fde68a]">Help Desk preview</div>
            </div>

            {/* Buzón del equipo sin título — collapsible card with form */}
            <div className="border-2 border-[#fa7938] rounded-[12px] overflow-hidden mb-4">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#e9eae6]">
                <div className="flex items-center gap-2"><span className="text-[#7c3aed]">⚡</span><span className="text-[14px] font-semibold text-[#1a1a1a]">Buzón del equipo sin título</span></div>
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg>
              </div>
              <div className="p-6">
                {/* Agregar compañeros */}
                <p className="text-[13px] font-semibold text-[#1a1a1a] mb-2">Agregar compañeros de equipo</p>
                <div className="flex items-center gap-2 mb-6">
                  <div className="flex-1 max-w-[360px] flex items-center gap-2 border border-[#e9eae6] rounded-[8px] px-3 py-2 focus-within:border-[#1a1a1a]">
                    <span className="text-[#646462] text-[14px]">📥</span>
                    <input
                      value={inboxName}
                      onChange={e => setInboxName(e.target.value)}
                      placeholder="Nombre del buzón del equipo"
                      className="flex-1 outline-none text-[13px] bg-transparent"
                    />
                  </div>
                  <button className="text-[13px] text-[#1a1a1a] flex items-center gap-1 px-3 py-2 hover:bg-[#f3f3f1] rounded">+ Invitar a miembros del equipo</button>
                </div>

                {/* Método de asignación */}
                <p className="text-[13px] font-semibold text-[#1a1a1a] mb-3">Elige un método de asignación</p>
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {[
                    { id: 'manual' as const, icon: '↗', name: 'Manual', desc: 'Las conversaciones deben asignarse manualmente a los compañeros de equipo.' },
                    { id: 'roundrobin' as const, icon: '⚙', name: 'Round robin', desc: 'Las conversaciones se asignan automáticamente a los compañeros de equipo en orden secuencial.' },
                    { id: 'equilibrio' as const, icon: '⇄', name: 'Equilibrio', desc: 'Las conversaciones se asignan automáticamente al compañero de equipo con el menor número de conversaciones abiertas.', badge: 'Obtener funcionalidad' },
                  ].map(opt => (
                    <button key={opt.id} onClick={() => setMethod(opt.id)} className={`border rounded-[10px] p-5 text-center ${method === opt.id ? 'border-[#fa7938] bg-[#fff7f0]' : 'border-[#e9eae6] hover:border-[#c8c9c4]'}`}>
                      <div className={`text-[20px] mb-2 ${method === opt.id ? 'text-[#fa7938]' : 'text-[#646462]'}`}>{opt.icon}</div>
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <p className="text-[14px] font-semibold text-[#1a1a1a]">{opt.name}</p>
                        {opt.badge && <span className="bg-[#7c3aed] text-white text-[10px] px-2 py-0.5 rounded-full font-medium">{opt.badge}</span>}
                      </div>
                      <p className="text-[11px] text-[#646462] leading-[16px]">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Establecer horario de atención */}
            <div className="border border-[#e9eae6] rounded-[12px] p-5 mb-3">
              <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Establecer horario de atención del equipo</h3>
              <p className="text-[13px] text-[#646462] mb-3">Si se asigna una conversación fuera del horario de oficina de tu equipo, esta función le muestra al cliente cuándo volverás, en su zona horaria. Los tiempos de respuesta te permiten indicar a los clientes la rapidez con la que deben esperar las respuestas durante las horas de atención. <a href="#" className="text-[#3b59f6] underline">Más información sobre el horario de atención y los tiempos de respuesta</a>.</p>
              <button className="bg-[#7c3aed] text-white rounded-full px-3 py-1.5 text-[12px] font-medium hover:bg-[#6d28d9] flex items-center gap-1.5"><span>⚡</span>Obtener la función</button>
            </div>

            {/* Establecer tiempo de respuesta */}
            <div className="border border-[#e9eae6] rounded-[12px] p-5 mb-4">
              <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Establece el tiempo de respuesta del equipo</h3>
              <p className="text-[13px] text-[#646462] mb-3">Si se asigna una conversación fuera del horario de oficina de tu equipo, esta función le muestra al cliente cuándo volverás, en su zona horaria. Los tiempos de respuesta te permiten indicar a los clientes la rapidez con la que deben esperar las respuestas durante las horas de respuesta. <a href="#" className="text-[#3b59f6] underline">Más información sobre el horario de atención y los tiempos de respuesta</a>.</p>
              <button className="bg-[#7c3aed] text-white rounded-full px-3 py-1.5 text-[12px] font-medium hover:bg-[#6d28d9] flex items-center gap-1.5"><span>⚡</span>Obtener la función</button>
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#e9eae6]">
              <button className="border border-[#e9eae6] rounded-full px-4 py-[7px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]" onClick={() => setInboxName('')}>Cancelar</button>
              <button
                disabled={creatingInbox}
                onClick={handleCreateInbox}
                className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444] disabled:opacity-50"
              >
                {creatingInbox ? 'Creando…' : 'Crear un buzón para el equipo'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
