// ─────────────────────────────────────────────────────────────────────────────
// Clain prototype shell: routing + PrototypeApp
// Extracted from the monolithic Prototype.tsx (auto-split, behavior-preserving).
// ─────────────────────────────────────────────────────────────────────────────

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useApi } from '../api/hooks';
import { parsePath, pushRoute, currentHeadSegment } from './router';
import { iamApi, workspacesApi } from '../api/client';
import SuperAgent from '../components/SuperAgent';
import { AgentChatView } from './views/AgentViews';
import { IMG_FACEBOOK_BANNER, IMG_INSTAGRAM_BANNER } from './assets';
import { AllChannelsView, DiscordView, EmailView, MessengerView, PhoneView, SmsView, WhatsAppView } from './views/ChannelsViews';
import { AllLeadsView, ContactsView, EmpresasView, PeopleView } from './views/ContactsViews';
import { FinAiSettingsView, FinAiView, FinFaqItem } from './views/FinViews';
import { ICON_LIBRARY } from './icons';
import { InboxTeamView, InboxView } from './views/InboxViews';
import { KnowledgeView } from './views/KnowledgeViews';
import { OutboundView } from './views/OutboundViews';
import { ReportsView } from './views/ReportsViews';
import { AccountAccessView, AiFeedbackView, AiInboxView, AppStoreView, AssignmentsView, AudiencesSettingsView, AuthSettingsView, AutomationView, BillingPlansView, BillingView, CallsLiveView, CannedResponsesView, ConnectorsView, CustomFiltersView, CustomObjectsView, CustomRolesView, DataConversacionesView, DeveloperView, EmailTemplatesView, FeaturesComparisonView, HelpCenterSettingsView, HorarioAtencionView, ImportsView, LabelsView, MacrosView, MarcasView, McpServersView, MultilingualView, NotificationsView, PersonalView, SecurityView, SettingsView, SlaView, SlackChannelView, SwitchChannelView, TicketsView, TokensView, TopicsView, VisibleView, WorkspaceGeneralView, WorkspaceMultilingualView, WorkspaceSecurityView, WorkspaceTeammatesView } from './views/SettingsViews';
import { ICON_FIN, ICON_KNOWLEDGE, ICON_OUTBOUND, ICON_REPORTS, IMG_FIN_SALES_AGENT, IMG_FIN_SERVICE_AGENT, LibraryIcon, SettingsSidebar, TrialBanner } from './sharedUi';
import type { IconVariant, View } from './types';
import { WebAnalyticsApp } from './webanalytics/WebAnalytics';


// ── Shared: Left Nav ──────────────────────────────────────────────────────────
function LeftNav({ view, onNavigate, onLogoClick }: { view: View; onNavigate: (v: View) => void; onLogoClick?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const isContacts = view === 'contacts' || view === 'allLeads';
  const isSettings = view === 'settings' || view === 'imports' || view === 'personal' || view === 'security' || view === 'notifications' || view === 'visible' || view === 'tokens' || view === 'accountAccess' || view === 'multilingual' || view === 'assignments' || view === 'macros' || view === 'tickets' || view === 'sla' || view === 'aiInbox' || view === 'automation' || view === 'appStore' || view === 'connectors' || view === 'labels' || view === 'people' || view === 'companies' || view === 'workspaceSecurity' || view === 'workspaceMultilingual' || view === 'workspaceHours' || view === 'workspaceBrands' || view === 'billing' || view === 'messenger' || view === 'email' || view === 'phone' || view === 'whatsapp' || view === 'discord' || view === 'sms' || view === 'social' || view === 'allChannels' || view === 'inboxTeam';
  const isActive = (v: View) => view === v;

  function NavBtn({ nav, icon, label, badge }: { nav: View; icon: string; label: string; badge?: number }) {
    const active = nav === 'contacts' ? isContacts : nav === 'settings' ? isSettings : isActive(nav);
    return (
      <button
        onClick={() => onNavigate(nav)}
        title={label}
        className={`w-full h-9 flex items-center rounded-lg relative ${expanded ? 'px-2.5 gap-2' : 'justify-center'} ${
          active ? "bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]" : "hover:bg-white/60"
        }`}
      >
        <div className="relative flex items-center justify-center flex-shrink-0">
          <img src={icon} alt={label} className="w-4 h-4" />
          {badge !== undefined && !expanded && active && (
            <span className="absolute -top-2 -right-2 bg-[#ffccb2] border border-white rounded-full min-w-[15px] h-[15px] flex items-center justify-center text-[11px] font-bold text-[#1a1a1a] px-1">
              {badge}
            </span>
          )}
        </div>
        {expanded && (
          <span className="flex-1 flex items-center gap-1.5 min-w-0">
            <span className={`text-[13px] truncate ${active ? 'font-semibold text-[#1a1a1a]' : 'font-medium text-[#1a1a1a]'}`}>{label}</span>
            {badge !== undefined && (
              <span className="bg-[#ffccb2] rounded-full min-w-[18px] h-[18px] flex items-center justify-center text-[11px] font-bold text-[#1a1a1a] px-1.5 flex-shrink-0">{badge}</span>
            )}
          </span>
        )}
      </button>
    );
  }

  // Same NavBtn but takes SVG children instead of an asset URL — used for the 6
  // semantic LeftNav icons (envelope/square/book/bars/arrow/person).
  function NavBtnSvg({ nav, label, badge, children }: { nav: View; label: string; badge?: number; children: ReactNode }) {
    const active = nav === 'contacts' ? isContacts : nav === 'settings' ? isSettings : isActive(nav);
    return (
      <button
        onClick={() => onNavigate(nav)}
        title={label}
        className={`w-full h-9 flex items-center rounded-lg relative ${expanded ? 'px-2.5 gap-2' : 'justify-center'} ${
          active ? "bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]" : "hover:bg-white/60"
        }`}
      >
        <span className="relative flex items-center justify-center flex-shrink-0">
          {children}
          {badge !== undefined && !expanded && active && (
            <span className="absolute -top-2 -right-2 bg-[#ffccb2] border border-white rounded-full min-w-[15px] h-[15px] flex items-center justify-center text-[11px] font-bold text-[#1a1a1a] px-1">
              {badge}
            </span>
          )}
        </span>
        {expanded && (
          <span className="flex-1 flex items-center gap-1.5 min-w-0">
            <span className={`text-[13px] truncate ${active ? 'font-semibold text-[#1a1a1a]' : 'font-medium text-[#1a1a1a]'}`}>{label}</span>
            {badge !== undefined && (
              <span className="bg-[#ffccb2] rounded-full min-w-[18px] h-[18px] flex items-center justify-center text-[11px] font-bold text-[#1a1a1a] px-1.5 flex-shrink-0">{badge}</span>
            )}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      // Hover-to-expand: enter rail → 210px, leave rail → 44px. No manual toggle button.
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className={`fixed top-0 left-0 h-full flex flex-col pt-3 pb-2 bg-[#f3f3f1] rounded-tr-2xl rounded-br-2xl justify-between transition-[width,box-shadow] duration-150 z-50 ${expanded ? 'shadow-[4px_0px_24px_rgba(20,20,20,0.10)]' : ''}`}
      style={{ width: expanded ? 210 : 44 }}
    >
      <div className="flex flex-col gap-3">
        {/* Header: the app logo — clicking it opens the Clain Platform Hub. */}
        <div className={`flex items-center ${expanded ? 'justify-between px-3' : 'justify-center'} h-9 flex-shrink-0`}>
          {onLogoClick ? (
            <button
              onClick={onLogoClick}
              title="Plataforma Clain"
              className="w-6 h-6 flex items-center justify-center hover:opacity-70 transition-opacity"
            >
              <img src="/logos/clain-favicon.png" alt="Clain" className="w-6 h-6 object-contain" />
            </button>
          ) : (
            <img src="/logos/clain-favicon.png" alt="" className="w-6 h-6 object-contain" />
          )}
          {expanded && (
            <span className="w-7 h-7 flex items-center justify-center" title="Pin">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.5 1.8l4.7 4.7-2 2-2.7-.4-2.4 2.4.7 2.7-2 2-4.7-4.7 2-2 2.7.7 2.4-2.4-.4-2.7z"/>
                <path d="M5.5 10.5L2 14"/>
              </svg>
            </span>
          )}
        </div>
        {/* Nav items — icons SHIFTED UP by 1 per user: previous ICON_FIN is now the Inbox
            visual, ICON_KNOWLEDGE is Fin's, etc. ICON_INBOX is reserved for the top logo.
            A new inline SVG arrow is added for Canales salientes. */}
        <div className={`flex flex-col gap-0.5 ${expanded ? 'px-2' : 'px-1.5'}`}>
          {/* Super Agent — top-level entry, always first, thick-ring icon */}
          <NavBtnSvg nav="superAgent" label="Super Agent">
            <svg viewBox="0 0 16 16" className="w-[18px] h-[18px]" fill="none">
              <circle cx="8" cy="8" r="6.25" stroke={view === 'superAgent' ? '#6366f1' : '#1a1a1a'} strokeWidth="2.75"/>
              <circle cx="8" cy="8" r="1.75" fill={view === 'superAgent' ? '#6366f1' : '#1a1a1a'}/>
            </svg>
          </NavBtnSvg>
          <div className={`${expanded ? 'mx-0.5' : 'mx-1'} h-px bg-[#e2e2e0] my-0.5`} />
          <NavBtn nav="inbox"     icon={ICON_FIN}       label="Inbox"             badge={4} />
          <NavBtn nav="fin"       icon={ICON_KNOWLEDGE} label="Fin AI Agent" />
          <NavBtn nav="knowledge" icon={ICON_REPORTS}   label="Conocimiento" />
          <NavBtn nav="reports"   icon={ICON_OUTBOUND}  label="Informes" />
          {/* Canales salientes — NEW inline-SVG arrow (paper-plane / send) */}
          <NavBtnSvg nav="outbound" label="Canales salientes">
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M14.5 1.5L1.5 6l5 1.5L8 13l3-7z"/></svg>
          </NavBtnSvg>
          {/* Contactos — inline SVG of two person silhouettes (proper contacts icon) */}
          <NavBtnSvg nav="contacts" label="Contactos">
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><circle cx="6" cy="5" r="2.5"/><path d="M1.8 12.5c.4-2 2.1-3.2 4.2-3.2s3.8 1.2 4.2 3.2v.5H1.8v-.5z"/><circle cx="11.5" cy="6" r="2"/><path d="M9.5 9.4c.6-.2 1.3-.3 2-.3 1.7 0 3 .9 3.4 2.5v.4H10.6c-.1-.9-.4-1.8-1.1-2.6z"/></svg>
          </NavBtnSvg>
        </div>
      </div>

      <div className={`flex flex-col gap-0.5 ${expanded ? 'px-2' : 'px-1.5'} pb-1`}>
        {/* Upgrade — lightning bolt button */}
        <button
          onClick={() => onNavigate('billingPlans')}
          className={`w-full h-9 flex items-center rounded-lg ${expanded ? 'px-2.5 gap-2' : 'justify-center'} ${view === 'billing' || view === 'billingPlans' || view === 'featuresComparison' ? "bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]" : "hover:bg-white/60"}`}
        >
          <svg viewBox="0 0 16 16" className="w-5 h-5 flex-shrink-0 fill-[#111]"><path d="M9.5 1 L4 9h4.5L6.5 15 13 7H8.5z"/></svg>
          {expanded && <span className="text-[13px] font-medium text-[#1a1a1a] flex-1 text-left">Upgrade</span>}
        </button>

        {/* Buscar */}
        <button className={`w-full h-9 flex items-center rounded-lg hover:bg-white/60 ${expanded ? 'px-2.5 gap-2' : 'justify-center'}`}>
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a] flex-shrink-0" strokeWidth="1.5"><circle cx="7" cy="7" r="4.5"/><path d="M11 11l3 3" strokeLinecap="round"/></svg>
          {expanded && <>
            <span className="text-[13px] font-medium text-[#1a1a1a] flex-1 text-left">Buscar</span>
            <span className="text-[10px] text-[#646462] bg-white border border-[#e9eae6] rounded px-1 py-0.5">Ctrl K</span>
          </>}
        </button>

        {/* Ajustes */}
        <button
          onClick={() => onNavigate('settings')}
          className={`w-full h-9 flex items-center rounded-lg ${expanded ? 'px-2.5 gap-2' : 'justify-center'} ${isSettings ? "bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]" : "hover:bg-white/60"}`}
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a] flex-shrink-0" strokeWidth="1.4">
            <circle cx="8" cy="8" r="2.3"/>
            <path d="M8 1.5v1.6M8 12.9v1.6M2.4 8h1.6M11.9 8h1.6M3.8 3.8l1.1 1.1M11.1 11.1l1.1 1.1M3.8 12.2l1.1-1.1M11.1 4.9l1.1-1.1" strokeLinecap="round"/>
          </svg>
          {expanded && <span className="text-[13px] font-medium text-[#1a1a1a] flex-1 text-left">Ajustes</span>}
        </button>

        {/* Perfil — popover menu (Intercom-style) */}
        <ProfileMenuButton expanded={expanded} />
      </div>
    </div>
  );
}

// ── Profile menu — popover with submenus for Tema / Idioma / Workspace ───────
type ProfileSubmenu = null | 'theme' | 'language' | 'workspace';
type ThemeOpt = 'light' | 'dark' | 'system';
const THEME_OPTIONS: { value: ThemeOpt; label: string }[] = [
  { value: 'light',  label: 'Claro' },
  { value: 'dark',   label: 'Oscuro' },
  { value: 'system', label: 'Sistema de coincidencias' },
];
const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'es',    label: 'Español' },
  { value: 'es-MX', label: 'Español (México)' },
  { value: 'en',    label: 'English' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'fr',    label: 'Français' },
  { value: 'pt',    label: 'Português' },
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'de',    label: 'Deutsch' },
  { value: 'it',    label: 'Italiano' },
  { value: 'ja',    label: '日本語' },
];

function ProfileMenuButton({ expanded }: { expanded: boolean }) {
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<ProfileSubmenu>(null);
  const [away, setAway] = useState(false);
  const [theme, setTheme] = useState<ThemeOpt>('system');
  const [lang, setLang] = useState('es');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const { data: user } = useApi<any>(iamApi.me, []);
  const { data: workspacesRaw } = useApi<any[]>(workspacesApi.list, [], []);
  const { data: ctx } = useApi<any>(workspacesApi.currentContext, [], null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) { setOpen(false); setSubmenu(null); }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (submenu) setSubmenu(null);
      else { setOpen(false); }
    }
    window.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, submenu]);

  const userName = user?.name || 'Tu cuenta';
  const userEmail = user?.email || '';
  const initials = String(userName)
    .split(/\s+/).filter(Boolean).slice(0, 2).map((s: string) => s.charAt(0).toUpperCase()).join('') || '?';

  // Workspaces: live from /workspaces, current from /workspaces/current/context
  const workspaces = Array.isArray(workspacesRaw) ? workspacesRaw : [];
  const currentWorkspaceId =
    ctx?.workspace?.id ||
    ctx?.workspace_id ||
    user?.context?.workspace_id ||
    user?.memberships?.[0]?.workspace_id ||
    null;
  const currentWorkspaceName =
    workspaces.find((w: any) => w.id === currentWorkspaceId)?.name ||
    ctx?.workspace?.name ||
    user?.memberships?.[0]?.workspace_name ||
    'Workspace';

  const themeLabel = THEME_OPTIONS.find(t => t.value === theme)?.label || 'Sistema';
  const langLabel = LANGUAGE_OPTIONS.find(l => l.value === lang)?.label || 'Español';

  async function handleSwitchWorkspace(ws: any) {
    if (!ws?.id || ws.id === currentWorkspaceId) { setSubmenu(null); return; }
    // Update local membership cache so the next request() injects the new
    // x-workspace-id header. Tenant id is preserved (workspaces belong to a
    // single tenant). Then reload so all live queries pick up the new context.
    try {
      const raw = localStorage.getItem('crmai.membership.v1');
      const cache = raw ? JSON.parse(raw) : {};
      const tenantId = ws.tenant_id || cache?.tenantId || user?.context?.tenant_id;
      if (cache?.userId && tenantId) {
        localStorage.setItem('crmai.membership.v1', JSON.stringify({
          userId: cache.userId,
          tenantId,
          workspaceId: ws.id,
        }));
      }
    } catch { /* ignore */ }
    if (typeof window !== 'undefined') window.location.reload();
  }

  async function handleSignOut() {
    try {
      const { supabase } = await import('../api/supabase');
      await supabase.auth.signOut();
    } catch { /* ignore */ }
    try { localStorage.removeItem('crmai.membership.v1'); } catch { /* ignore */ }
    if (typeof window !== 'undefined') window.location.reload();
  }

  function MainRow({ label, sub, onClick, danger, chev, isOpenSub }: { label: string; sub?: string; onClick?: () => void; danger?: boolean; chev?: boolean; isOpenSub?: boolean }) {
    return (
      <button
        type="button"
        onClick={() => {
          onClick?.();
          if (!chev) setOpen(false);
        }}
        className={`w-full flex items-center gap-2 px-3 h-9 text-[13px] text-left ${
          danger
            ? 'text-[#b91c1c] hover:bg-[#fef2f2]'
            : isOpenSub
              ? 'text-[#1a1a1a] bg-[#f8f8f7]'
              : 'text-[#1a1a1a] hover:bg-[#f8f8f7]'
        }`}
      >
        <span className="flex-1 truncate">
          <span className="font-semibold">{label}</span>
          {sub && <span className="text-[#1a1a1a] font-normal"> {sub}</span>}
        </span>
        {chev && <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462] flex-shrink-0"><path d="M6 4l4 4-4 4z"/></svg>}
      </button>
    );
  }

  function PlainRow({ label, onClick, danger }: { label: string; onClick?: () => void; danger?: boolean }) {
    return (
      <button
        type="button"
        onClick={() => { onClick?.(); setOpen(false); }}
        className={`w-full flex items-center px-3 h-9 text-[13px] text-left ${danger ? 'text-[#b91c1c] hover:bg-[#fef2f2]' : 'text-[#1a1a1a] hover:bg-[#f8f8f7]'}`}
      >
        <span className="flex-1 truncate">{label}</span>
      </button>
    );
  }

  function CheckRow({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`w-full flex items-center gap-2 px-3 h-9 text-[13px] text-left ${active ? 'text-[#fa7938] font-semibold' : 'text-[#1a1a1a] hover:bg-[#f8f8f7]'}`}
      >
        <span className="flex-1 truncate">{label}</span>
        {active && (
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#fa7938] flex-shrink-0" strokeWidth="2">
            <path d="M3 8l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setSubmenu(null); }}
        className={`w-full h-9 flex items-center rounded-lg hover:bg-white/60 ${expanded ? 'px-2.5 gap-2' : 'justify-center'} ${open ? 'bg-white/80' : ''}`}
      >
        <span className="relative flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.4">
            <circle cx="8" cy="5.5" r="2.6"/>
            <path d="M2.5 14c0-2.8 2.5-5 5.5-5s5.5 2.2 5.5 5" strokeLinecap="round"/>
          </svg>
          <span className={`absolute -bottom-0.5 -right-0.5 w-[7px] h-[7px] rounded-full border border-white ${away ? 'bg-[#a4a4a2]' : 'bg-[#158613]'}`} />
        </span>
        {expanded && <span className="text-[13px] font-medium text-[#1a1a1a] flex-1 text-left">Perfil</span>}
      </button>

      {open && (
        <div className="absolute z-50 left-full ml-2 bottom-0">
          {/* Main menu — relative wrapper so submenu can anchor next to it */}
          <div
            role="menu"
            className="relative w-[300px] bg-white border border-[#e9eae6] rounded-[12px] shadow-[0_12px_32px_rgba(20,20,20,0.18)] py-1.5"
          >
            <div className="flex items-center gap-2.5 px-3 py-2.5">
              <div className="relative w-9 h-9 rounded-full overflow-hidden bg-[#f8f8f7] border border-[#e9eae6] flex items-center justify-center flex-shrink-0">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[13px] font-semibold text-[#646462]">{initials}</span>
                )}
                <span className={`absolute bottom-[-1px] left-[-1px] w-[10px] h-[10px] rounded-full border-2 border-white ${away ? 'bg-[#a4a4a2]' : 'bg-[#158613]'}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-[#1a1a1a] truncate">{userName}</p>
                {userEmail && <p className="text-[11.5px] text-[#646462] truncate">{userEmail}</p>}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setAway(v => !v)}
              className="w-full flex items-center gap-2 px-3 h-9 text-[13px] text-[#1a1a1a] hover:bg-[#f8f8f7]"
            >
              <span className="flex-1 text-left">Modo ausente</span>
              <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors flex-shrink-0 ${away ? 'bg-[#1a1a1a]' : 'bg-[#e9eae6]'}`}>
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${away ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
              </span>
            </button>

            <div className="border-t border-[#e9eae6] my-1" />

            <MainRow label="Tema:"               sub={themeLabel}             chev isOpenSub={submenu === 'theme'}     onClick={() => setSubmenu(submenu === 'theme' ? null : 'theme')} />
            <MainRow label="Idioma:"             sub={langLabel}              chev isOpenSub={submenu === 'language'}  onClick={() => setSubmenu(submenu === 'language' ? null : 'language')} />
            <MainRow label="Espacio de trabajo:" sub={currentWorkspaceName}   chev isOpenSub={submenu === 'workspace'} onClick={() => setSubmenu(submenu === 'workspace' ? null : 'workspace')} />

            <div className="border-t border-[#e9eae6] my-1" />

            <PlainRow label="Centro de ayuda de Intercom"      onClick={() => window.open('https://www.intercom.com/help', '_blank')} />
            <PlainRow label="Foro de la Comunidad de Intercom" onClick={() => window.open('https://community.intercom.com', '_blank')} />
            <PlainRow label="Página de estado"                 onClick={() => window.open('https://www.intercomstatus.com', '_blank')} />
            <PlainRow label="Términos y políticas"             onClick={() => window.open('https://www.intercom.com/terms-and-policies', '_blank')} />

            <div className="border-t border-[#e9eae6] my-1" />

            <PlainRow label="Cerrar sesión" onClick={handleSignOut} />

            {/* Cascading submenu — anchored top-aligned to the right of main */}
            {submenu && (
              <div
                role="menu"
                className="absolute z-50 left-full ml-2 top-0 w-[260px] bg-white border border-[#e9eae6] rounded-[12px] shadow-[0_12px_32px_rgba(20,20,20,0.18)] py-1.5 max-h-[420px] overflow-y-auto"
              >
              {submenu === 'theme' && THEME_OPTIONS.map(opt => (
                <CheckRow
                  key={opt.value}
                  active={theme === opt.value}
                  label={opt.label}
                  onClick={() => { setTheme(opt.value); setSubmenu(null); }}
                />
              ))}

              {submenu === 'language' && LANGUAGE_OPTIONS.map(opt => (
                <CheckRow
                  key={opt.value}
                  active={lang === opt.value}
                  label={opt.label}
                  onClick={() => { setLang(opt.value); setSubmenu(null); }}
                />
              ))}

              {submenu === 'workspace' && (
                workspaces.length === 0 ? (
                  <div className="px-3 py-3 text-[12.5px] text-[#646462]">Sin espacios de trabajo disponibles.</div>
                ) : workspaces.map((ws: any) => (
                  <CheckRow
                    key={ws.id}
                    active={ws.id === currentWorkspaceId}
                    label={ws.name || ws.slug || ws.id}
                    onClick={() => handleSwitchWorkspace(ws)}
                  />
                ))
              )}
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── SocialChannelsView (1-64525 + 1-65820) ────────────────────────────────────

function SocialChannelsView({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<'facebook' | 'instagram'>('facebook');
  const [respHistorias, setRespHistorias] = useState(true);
  const [mencionesHistorias, setMencionesHistorias] = useState(true);
  const [compartirTiempo, setCompartirTiempo] = useState(false);

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <SettingsSidebar view={view} onNavigate={onNavigate} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
            <h1 className="text-[20px] font-bold text-[#1a1a1a]">Canales de redes sociales</h1>
            <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">Aprender <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4"/></svg></button>
          </div>
          <div className="flex border-b border-[#e9eae6] px-6 flex-shrink-0">
            {(['facebook', 'instagram'] as const).map(id => (
              <button key={id} onClick={() => setTab(id)}
                className={`px-3 pb-3 pt-3 text-[13px] font-medium border-b-2 -mb-px transition-colors capitalize ${
                  tab === id ? 'border-[#fa7938] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'
                }`}>
                {id === 'facebook' ? 'Facebook' : 'Instagram'}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-6">
            {tab === 'facebook' && <>
              <div className="bg-white border border-[#e9eae6] rounded-[12px] p-6 flex items-center gap-6 mb-6 relative">
                <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#ededea]"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg></button>
                <div className="flex-1 max-w-[500px]">
                  <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-2">Conéctate con los clientes en Facebook</h2>
                  <p className="text-[13px] text-[#646462] mb-4">Administra todas tus conversaciones de Facebook Messenger en tu buzón de Intercom. Asigna mensajes automáticamente a tu equipo, realiza un seguimiento de todas las interacciones como clientes potenciales o usuarios y responde más rápido a los clientes, todo en un solo lugar.</p>
                  <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5">📖 Canal de Facebook</button>
                </div>
                <img src={IMG_FACEBOOK_BANNER} alt="Facebook preview" className="w-[458px] h-[213px] flex-shrink-0 rounded-[8px] object-cover" data-node-id="1:64496" />
              </div>
              <div className="border border-[#e9eae6] rounded-[12px] px-7 py-6">
                <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Páginas de empresas de Facebook conectadas</h3>
                <p className="text-[13px] text-[#646462] mb-4">Te puedes conectar a varias páginas comerciales de Facebook. El uso de Facebook es gratuito en tu plan de precios.</p>
                <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Conectar página de empresa de Facebook</button>
              </div>
            </>}
            {tab === 'instagram' && <>
              <div className="bg-white border border-[#e9eae6] rounded-[12px] p-6 flex items-center gap-6 mb-6 relative">
                <button className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#ededea]"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]"><path d="M12.7 4.7l-1.4-1.4L8 6.6 4.7 3.3 3.3 4.7 6.6 8l-3.3 3.3 1.4 1.4L8 9.4l3.3 3.3 1.4-1.4L9.4 8z"/></svg></button>
                <div className="flex-1 max-w-[500px]">
                  <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-2">Conéctate con los clientes en Instagram</h2>
                  <p className="text-[13px] text-[#646462] mb-4">Administra fácilmente los mensajes directos (DM) y las respuestas a Historias en tu buzón de Intercom. Asigna conversaciones automáticamente, convierte todas las interacciones en clientes potenciales o usuarios y responde a cada cliente más rápido.</p>
                  <button className="text-[13px] text-[#3b59f6] hover:underline flex items-center gap-1.5">📖 Canal de Instagram</button>
                </div>
                <img src={IMG_INSTAGRAM_BANNER} alt="Instagram preview" className="w-[458px] h-[213px] flex-shrink-0 rounded-[8px] object-cover" data-node-id="1:65752" />
              </div>
              <div className="border border-[#e9eae6] rounded-[12px] px-7 py-6 mb-4">
                <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Cuentas comerciales de Instagram conectadas</h3>
                <p className="text-[13px] text-[#646462] mb-4">Puedes conectarte a varias cuentas comerciales de Instagram. El uso de Instagram es gratuito en tu plan de precios.</p>
                <button className="bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-[#444]">+ Conectar cuenta comercial de Instagram</button>
              </div>
              <div className="border border-[#e9eae6] rounded-[12px] flex items-start gap-6 px-7 py-6 mb-4">
                <div className="flex-1">
                  <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Mensajes de Instagram en tu buzón</h3>
                  <p className="text-[13px] text-[#646462]">Elige qué mensajes de Instagram se entregarán directamente en tu buzón de Intercom.</p>
                </div>
                <div className="w-[280px] flex flex-col gap-3 flex-shrink-0">
                  {[
                    { state: respHistorias, set: setRespHistorias, label: 'Respuestas a tus historias' },
                    { state: mencionesHistorias, set: setMencionesHistorias, label: 'Menciones en historias de otros usuarios' },
                  ].map(t => (
                    <div key={t.label} className="flex items-center gap-2">
                      <button onClick={() => t.set(v => !v)} className={`w-8 h-[18px] rounded-full relative ${t.state ? 'bg-[#f97316]' : 'bg-[#e9eae6]'}`}>
                        <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow ${t.state ? 'right-0.5' : 'left-0.5'}`}/>
                      </button>
                      <span className="text-[13px] text-[#1a1a1a]">{t.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border border-[#e9eae6] rounded-[12px] flex items-start gap-6 px-7 py-6">
                <div className="flex-1">
                  <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Compartir el tiempo de respuesta</h3>
                  <p className="text-[13px] text-[#646462]">Comparte tu tiempo de respuesta habitual cuando los clientes te envían mensajes en Instagram. <a href="#" className="text-[#3b59f6] underline">Más información sobre el horario de atención y los tiempos de respuesta</a>.</p>
                </div>
                <div className="w-[280px] flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => setCompartirTiempo(v => !v)} className={`w-8 h-[18px] rounded-full relative ${compartirTiempo ? 'bg-[#f97316]' : 'bg-[#e9eae6]'}`}>
                    <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow ${compartirTiempo ? 'right-0.5' : 'left-0.5'}`}/>
                  </button>
                  <span className="text-[13px] text-[#1a1a1a]">Comparte tu tiempo de respuesta</span>
                </div>
              </div>
            </>}
          </div>
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Clain Platform Hub — module launcher (same design language as FinAllRolesContent)
// ─────────────────────────────────────────────────────────────────────────────
const CLAIN_FAQS: { q: string; a: string }[] = [
  { q: '¿Qué es Clain?', a: 'Clain es una plataforma modular de inteligencia de negocio que combina CRM, análisis web y más en una sola interfaz unificada.' },
  { q: '¿Puedo usar los módulos de forma independiente?', a: 'Sí. Cada módulo funciona de forma autónoma pero se potencia al integrarse con los demás.' },
  { q: '¿Se añadirán más módulos próximamente?', a: 'Efectivamente. Estamos trabajando en módulos de email marketing, automatización avanzada y análisis predictivo.' },
  { q: '¿Mis datos están seguros entre módulos?', a: 'Sí. Todos los módulos comparten el mismo tenant y permisos de IAM, con cifrado en reposo y en tránsito.' },
];

function ClainHubView({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  return (
    <div className="flex-1 overflow-y-auto min-h-0 bg-[#f3f3f1]">
      <div className="max-w-[1021px] mx-auto px-14 pt-12 pb-16">
        {/* Hero */}
        <div className="flex flex-col items-center text-center">
          <div className="w-8 h-8 mb-4 bg-[#1a1a1a] rounded-[8px] flex items-center justify-center">
            <svg viewBox="0 0 16 16" className="w-5 h-5 fill-white"><path d="M8 1l1.4 3.6H13l-3.1 2.3 1.2 3.7L8 8.4l-3.1 2.2 1.2-3.7L3 4.6h3.6z"/></svg>
          </div>
          <h1 className="text-[40px] font-light tracking-[-1.2px] leading-[40px] text-[#1a1a1a] max-w-[440px]">
            Tu plataforma para<br/>crecer más rápido
          </h1>
          <p className="text-[14px] text-[#646462] leading-[20px] mt-4 max-w-[520px]">
            Clain reúne todas las herramientas que necesitas para entender, captar y retener clientes.{' '}
            <a href="#" className="underline">Más información.</a>
          </p>
        </div>

        {/* Module cards */}
        <div className="mt-12 flex justify-center">
          <div className="grid grid-cols-2 gap-4 w-[640px]">
            <ClainModuleCard
              image={IMG_FIN_SERVICE_AGENT}
              iconColor="#1a1a1a"
              iconKind="cx"
              title="Clain Customer Experience"
              tagline="Gestiona la relación con tus clientes"
              bullets={[
                'Bandeja de entrada unificada',
                'Automatización con IA (Fin)',
                'CRM de contactos y empresas',
              ]}
              onClick={() => onNavigate('inbox')}
            />
            <ClainModuleCard
              image={IMG_FIN_SALES_AGENT}
              iconColor="#3b59f6"
              iconKind="analytics"
              title="Clain Web Analytics"
              tagline="Entiende el comportamiento de tus usuarios"
              bullets={[
                'Análisis de tráfico en tiempo real',
                'Embudos y conversiones',
                'Audiencias y segmentación',
              ]}
              onClick={() => onNavigate('webAnalytics')}
            />
          </div>
        </div>

        {/* More modules coming soon */}
        <div className="mt-7 flex items-center justify-center">
          <div className="w-[640px] flex items-center justify-center bg-white border border-[#e9eae6] rounded-[10px] py-4 px-6 gap-3">
            <div className="relative w-12 h-6">
              <span className="absolute left-0 top-0 w-6 h-6 rounded-[8px] bg-[#818F4A] border border-white" />
              <span className="absolute left-3 top-0 w-6 h-6 rounded-[8px] bg-[#CE78BA] border border-white" />
              <span className="absolute left-6 top-0 w-6 h-6 rounded-[8px] bg-[#DBDBD6] border border-white" />
            </div>
            <span className="text-[14px] font-semibold text-[#1a1a1a]">Más módulos próximamente.</span>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-20">
          <h2 className="text-center text-[18px] font-bold text-[#1a1a1a] mb-6">Preguntas frecuentes</h2>
          <div className="max-w-[560px] mx-auto flex flex-col gap-2">
            {CLAIN_FAQS.map((f, i) => (
              <FinFaqItem
                key={i}
                q={f.q}
                a={f.a}
                open={openFaq === i}
                onToggle={() => setOpenFaq(openFaq === i ? null : i)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClainModuleCard({
  image, iconColor, iconKind, title, tagline, bullets, onClick,
}: {
  image: string; iconColor: string; iconKind: 'cx' | 'analytics';
  title: string; tagline: string; bullets: string[]; onClick: () => void;
}) {
  return (
    <div className="bg-white border border-[#e9eae6] rounded-[12px] overflow-hidden flex flex-col">
      <div className="p-2">
        <div className="rounded-[10px] overflow-hidden h-[166px]">
          <img src={image} alt="" className="w-full h-full object-cover" />
        </div>
      </div>
      <div className="px-4 pt-2 pb-4 flex flex-col">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-6 h-6 rounded-[8px] flex items-center justify-center flex-shrink-0" style={{ background: iconColor }}>
            {iconKind === 'cx' ? (
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-white"><path d="M8 2a3 3 0 100 6 3 3 0 000-6zM3.5 13c.5-2 2.3-3.5 4.5-3.5s4 1.5 4.5 3.5v.5h-9v-.5z"/></svg>
            ) : (
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-white"><path d="M2 2v12h12v-2H4V2H2zm3 4v6h2V6H5zm3-2v8h2V4H8zm3 3v5h2V7h-2z"/></svg>
            )}
          </span>
          <span className="text-[18px] font-bold text-[#1a1a1a]">{title}</span>
        </div>
        <p className="text-[13px] text-[#646462] mb-3">{tagline}</p>
        <ul className="flex flex-col gap-1.5 mb-5">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px] text-[#1a1a1a]">
              <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-[#1a1a1a] flex-shrink-0" />
              {b}
            </li>
          ))}
        </ul>
        <button
          onClick={onClick}
          className="h-9 rounded-full bg-[#1a1a1a] text-white text-[13px] font-semibold hover:bg-black transition-colors"
        >
          Comenzar
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────────────────

function IconLibraryGalleryV2() {
  // Render every v2-N entry with its number so we can identify what each one is.
  const entries: IconVariant[] = Array.from({ length: 91 }, (_, i) => `v2-${i + 1}` as IconVariant);
  return (
    <div className="h-full w-full overflow-auto bg-white p-8">
      <div className="max-w-[1400px] mx-auto">
        <h1 className="text-[22px] font-bold text-[#1a1a1a] mb-1">LibraryV2 — 91 variantes</h1>
        <p className="text-[13px] text-[#646462] mb-6">file: QhrV4aBbAAqTxgWhaK8hGP · node: 3-23460. Cada celda muestra <code>v2-N</code>.</p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-3">
          {entries.map((v) => {
            const def = ICON_LIBRARY[v];
            return (
              <div key={v} className="border border-[#e9eae6] rounded-[8px] p-3 flex flex-col items-center gap-2 bg-[#fbfbf9] hover:bg-white transition-colors">
                <div className="h-12 w-12 flex items-center justify-center">
                  <LibraryIcon v={v} size={Math.min(def.size, 32)} />
                </div>
                <span className="text-[11px] font-mono text-[#1a1a1a]">{v}</span>
                <span className="text-[10px] text-[#646462]">{def.size}px</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function Prototype() {
  // ?icons=v2 → render the icon-library gallery instead of the app shell.
  // Computed once per page-load (URL doesn't change without a reload), so the
  // hook order stays stable for whichever branch we take.
  const showIconsGallery = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('icons') === 'v2';
  if (showIconsGallery) return <IconLibraryGalleryV2 />;
  return <PrototypeApp />;
}

function PrototypeApp() {
  // Initial view comes from the path (with a legacy ?view= fallback). See router.ts.
  const [view, setView] = useState<View>(() => parsePath().view);

  // Push a clean path on genuine view CHANGES only (not on mount) so navigation
  // produces shareable URLs like /contacts or /inbox and never carries stale
  // params over from the previous screen. Views with sub-state (inbox / fin /
  // knowledge / outbound) refine their own path from within.
  const prevView = useRef<View>(view);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (prevView.current === view) return; // mount or no change
    prevView.current = view;
    // Only reset the base path when we actually left the previous view's path.
    if (currentHeadSegment() !== view) pushRoute({ view });
  }, [view]);

  // Back/forward → re-sync the active view from the URL.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    function onPop() {
      const next = parsePath().view;
      prevView.current = next;
      setView(next);
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Global app-navigate event — lets deeply nested components jump to a top-level view.
  // Usage: window.dispatchEvent(new CustomEvent('app-navigate', { detail: { view: 'inbox' } }))
  useEffect(() => {
    function handler(e: any) {
      const v: View | undefined = e.detail?.view;
      if (v) setView(v);
    }
    window.addEventListener('app-navigate', handler);
    return () => window.removeEventListener('app-navigate', handler);
  }, []);

  // Agent activity heartbeat — fires every 60 s while the tab is visible.
  // Increments active_minutes in agent_daily_activity so Reports > Teammate
  // can show "conversations per active hour" metrics.
  useEffect(() => {
    const sendHeartbeat = () => {
      if (document.visibilityState !== 'visible') return;
      fetch('/api/workspaces/heartbeat', { method: 'POST' }).catch(() => {/* best-effort */});
    };
    sendHeartbeat(); // fire immediately on mount
    const id = window.setInterval(sendHeartbeat, 60_000);
    return () => window.clearInterval(id);
  }, []);

  function renderView() {
    switch (view) {
      case 'superAgent': return <SuperAgent />;
      case 'inbox':    return <InboxView />;
      case 'allLeads': return <AllLeadsView view={view} onNavigate={setView} onBack={() => setView('contacts')} />;
      case 'contacts': return <ContactsView view={view} onNavigate={setView} onBack={() => setView('inbox')} />;
      case 'settings': return <SettingsView view={view} onNavigate={setView} onBack={() => setView('inbox')} />;
      case 'imports':  return <ImportsView view={view} onNavigate={setView} onBack={() => setView('inbox')} />;
      case 'personal': return <PersonalView view={view} onNavigate={setView} />;
      case 'security':       return <SecurityView view={view} onNavigate={setView} onBack={() => setView('personal')} />;
      case 'notifications':  return <NotificationsView view={view} onNavigate={setView} />;
      case 'visible':        return <VisibleView view={view} onNavigate={setView} />;
      case 'tokens':         return <TokensView view={view} onNavigate={setView} />;
      case 'accountAccess':  return <AccountAccessView view={view} onNavigate={setView} />;
      case 'multilingual':   return <MultilingualView view={view} onNavigate={setView} />;
      case 'assignments':    return <AssignmentsView view={view} onNavigate={setView} />;
      case 'macros':         return <MacrosView view={view} onNavigate={setView} />;
      case 'tickets':        return <TicketsView view={view} onNavigate={setView} />;
      case 'sla':            return <SlaView view={view} onNavigate={setView} />;
      case 'audiences':      return <AudiencesSettingsView view={view} onNavigate={setView} />;
      case 'aiInbox':        return <AiInboxView view={view} onNavigate={setView} />;
      case 'automation':     return <AutomationView view={view} onNavigate={setView} />;
      case 'appStore':       return <AppStoreView view={view} onNavigate={setView} />;
      case 'connectors':     return <ConnectorsView view={view} onNavigate={setView} />;
      case 'dataConversaciones': return <DataConversacionesView view={view} onNavigate={setView} />;
      case 'labels':         return <LabelsView view={view} onNavigate={setView} />;
      case 'people':         return <PeopleView view={view} onNavigate={setView} />;
      case 'companies':      return <EmpresasView view={view} onNavigate={setView} />;
      case 'workspaceSecurity':     return <WorkspaceSecurityView view={view} onNavigate={setView} />;
      case 'workspaceMultilingual': return <WorkspaceMultilingualView view={view} onNavigate={setView} />;
      case 'workspaceHours':        return <HorarioAtencionView view={view} onNavigate={setView} />;
      case 'workspaceBrands':       return <MarcasView view={view} onNavigate={setView} />;
      case 'billingPlans':       return <BillingPlansView view={view} onNavigate={setView} />;
      case 'billing':            return <BillingView view={view} onNavigate={setView} />;
      case 'featuresComparison': return <FeaturesComparisonView view={view} onNavigate={setView} />;
      case 'messenger':      return <MessengerView view={view} onNavigate={setView} />;
      case 'email':          return <EmailView view={view} onNavigate={setView} />;
      case 'phone':          return <PhoneView view={view} onNavigate={setView} />;
      case 'whatsapp':       return <WhatsAppView view={view} onNavigate={setView} />;
      case 'discord':        return <DiscordView view={view} onNavigate={setView} />;
      case 'sms':            return <SmsView view={view} onNavigate={setView} />;
      case 'social':         return <SocialChannelsView view={view} onNavigate={setView} />;
      case 'allChannels':    return <AllChannelsView view={view} onNavigate={setView} />;
      case 'inboxTeam':      return <InboxTeamView view={view} onNavigate={setView} />;
      case 'finSettings':    return <FinAiSettingsView view={view} onNavigate={setView} />;
      case 'fin':            return <FinAiView />;
      case 'knowledge':return <KnowledgeView />;
      case 'reports':  return <ReportsView />;
      case 'outbound': return <OutboundView />;
      case 'workspaceGeneral':    return <WorkspaceGeneralView view={view} onNavigate={setView} />;
      case 'workspaceTeammates':  return <WorkspaceTeammatesView view={view} onNavigate={setView} />;
      case 'auth':                return <AuthSettingsView view={view} onNavigate={setView} />;
      case 'developer':           return <DeveloperView view={view} onNavigate={setView} />;
      case 'customObjects':       return <CustomObjectsView view={view} onNavigate={setView} />;
      case 'topics':              return <TopicsView view={view} onNavigate={setView} />;
      case 'switchChannel':       return <SwitchChannelView view={view} onNavigate={setView} />;
      case 'slackChannel':        return <SlackChannelView view={view} onNavigate={setView} />;
      case 'helpCenter':          return <HelpCenterSettingsView view={view} onNavigate={setView} />;
      case 'cannedResponses':     return <CannedResponsesView view={view} onNavigate={setView} />;
      case 'customFilters':       return <CustomFiltersView view={view} onNavigate={setView} />;
      case 'emailTemplates':      return <EmailTemplatesView view={view} onNavigate={setView} />;
      case 'customRoles':         return <CustomRolesView view={view} onNavigate={setView} />;
      case 'aiFeedback':          return <AiFeedbackView view={view} onNavigate={setView} />;
      case 'callsLive':           return <CallsLiveView view={view} onNavigate={setView} />;
      case 'mcpServers':          return <McpServersView view={view} onNavigate={setView} />;
      case 'agentChat':           return <AgentChatView view={view} onNavigate={setView} currentCrmView="agentChat" />;
      // ── Clain Platform ─────────────────────────────────────────────────────
      case 'clainHub':    return <ClainHubView onNavigate={setView} />;
      case 'webAnalytics': return <WebAnalyticsApp onBackToHub={() => setView('clainHub')} />;
    }
  }

  // webAnalytics is a fully self-contained app shell with its own nav —
  // skip the outer LeftNav so it doesn't render twice.
  if (view === 'webAnalytics') {
    return <WebAnalyticsApp onBackToHub={() => setView('clainHub')} />;
  }

  return (
    <div
      className="flex bg-[#f3f3f1] overflow-hidden w-screen h-screen min-w-0"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* LeftNav is fixed-positioned (always on top). pl-[44px] on the content
          area reserves space for the collapsed 44px rail so content isn't hidden.
          onLogoClick navigates to the Customer Experience inbox (the hub screen
          is parked — Clain currently ships CX only). */}
      <LeftNav view={view} onNavigate={setView} onLogoClick={() => setView('inbox')} />
      <div className="flex flex-1 min-w-0 pl-[44px] h-full">
        {renderView()}
      </div>
    </div>
  );
}
