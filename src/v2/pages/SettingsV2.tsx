// SettingsV2 — migrated by agent-settings-01.
// ─────────────────────────────────────────────────────────────────────────────
// What works (this iteration):
//   • Sidebar with all collapsible groups (Espacio de trabajo, Suscripción,
//     Canales, Inbox, IA y automatización, Integraciones, Datos, Personal)
//   • Inicio panel — full card grid (static, matches prototype)
//   • Workspace General — real data via workspacesApi.currentContext() + update
//   • Team Members — real data via iamApi.members() + iamApi.roles(); invite + role change
//   • Billing & Usage — real data via billingApi.usage()
//   • Personal Info — real data via iamApi.me() + iamApi.updateMe()
//
// Pending for later iterations (still in src/components/Settings.tsx sub-tabs):
//   • Business hours (workspaceHours) — needs dedicated form UI
//   • Brands / Security / Multilingual workspace sections
//   • Channels config (Messenger, Email, Phone, WhatsApp, etc.)
//   • Inbox settings (assignments, macros, SLA)
//   • AI & automation settings
//   • Integrations / Data sub-sections
//   • Notifications, Visible, API tokens, Account access personal sub-sections
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from 'react';
import { iamApi, workspacesApi, billingApi } from '../../api/client';
import { useApi, useMutation } from '../../api/hooks';

// ── Types ────────────────────────────────────────────────────────────────────

type SettingsSection =
  | 'inicio'
  | 'workspace_general'
  | 'workspace_members'
  | 'billing'
  | 'personal_info'
  | 'placeholder';

// ── Icons (inline SVG, stroke-based for card grid — matches prototype) ───────

type IconKind =
  | 'gear' | 'team' | 'clock' | 'tag' | 'shield' | 'globe' | 'card' | 'chart'
  | 'chat' | 'mail' | 'phone' | 'whatsapp' | 'hash' | 'discord' | 'sms' | 'social'
  | 'inbox' | 'redirect' | 'bolt' | 'ticket' | 'timer'
  | 'sparkle' | 'aibox' | 'wrench' | 'shop' | 'plug' | 'code' | 'flow'
  | 'user' | 'building' | 'cube' | 'arrows' | 'bars'
  | 'home' | 'book' | 'plus' | 'bell' | 'flask' | 'brush'
  | 'pencil' | 'eye' | 'key' | 'lockuser' | 'gift';

function SetIcon({ kind }: { kind: IconKind }) {
  const o = 'w-4 h-4 fill-none stroke-[#1a1a1a]';
  const sw = '1.5';
  switch (kind) {
    case 'gear':     return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw}><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4"/></svg>;
    case 'team':     return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw}><circle cx="6" cy="6" r="2.2"/><path d="M2 13.5c.6-2.2 2.2-3.4 4-3.4s3.4 1.2 4 3.4"/><circle cx="11.5" cy="5" r="1.7"/><path d="M11 9.6c1.5.1 2.7 1.1 3.2 2.7"/></svg>;
    case 'clock':    return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw}><circle cx="8" cy="8" r="6"/><path d="M8 5v3.5L10 10" strokeLinecap="round"/></svg>;
    case 'gift':     return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw}><rect x="2" y="6" width="12" height="3" rx="0.5"/><rect x="3" y="9" width="10" height="5" rx="0.5"/><path d="M8 6v8M5.5 6c-1 0-2-1-2-2s1-1.5 2-1c.8.3 1.5 1.5 2.5 3-1.5 0-2 0-2.5 0zM10.5 6c1 0 2-1 2-2s-1-1.5-2-1c-.8.3-1.5 1.5-2.5 3 1.5 0 2 0 2.5 0z"/></svg>;
    case 'tag':      return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw} strokeLinejoin="round"><path d="M2.5 7.5l5-5h6v6l-5 5z"/><circle cx="10" cy="6" r="1" fill="#1a1a1a" stroke="none"/></svg>;
    case 'shield':   return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw}><path d="M8 1.5l5.5 2v4.5c0 3.2-2.4 5.7-5.5 6.5-3.1-.8-5.5-3.3-5.5-6.5V3.5z"/></svg>;
    case 'globe':    return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw}><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/></svg>;
    case 'card':     return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw}><rect x="1.5" y="3.5" width="13" height="9" rx="1.2"/><path d="M1.5 6.5h13M3.5 10h2"/></svg>;
    case 'chart':    return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw} strokeLinecap="round"><path d="M2 13V3M14 13H2M5 11V8M8 11V5M11 11V7"/></svg>;
    case 'chat':     return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw}><path d="M2.5 7c0-2.5 2.5-4.5 5.5-4.5s5.5 2 5.5 4.5-2.5 4.5-5.5 4.5c-.7 0-1.4-.1-2-.3L3 12.5l.6-2.3c-.7-.8-1.1-1.7-1.1-2.7z"/></svg>;
    case 'mail':     return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw}><rect x="2" y="3.5" width="12" height="9" rx="1.2"/><path d="M2.5 4.5l5.5 4 5.5-4"/></svg>;
    case 'phone':    return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw} strokeLinejoin="round"><path d="M3 3h2.5l1.2 3-1.4 1c.7 1.6 2.1 3 3.7 3.7l1-1.4 3 1.2V13c0 .3-.2.5-.5.5C6.5 13.5 2.5 9.5 2.5 3.5 2.5 3.2 2.7 3 3 3z"/></svg>;
    case 'whatsapp': return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw}><path d="M2.5 7c0-2.5 2.5-4.5 5.5-4.5s5.5 2 5.5 4.5-2.5 4.5-5.5 4.5c-.7 0-1.4-.1-2-.3L3 12.5l.6-2.3c-.7-.8-1.1-1.7-1.1-2.7z"/><path d="M6 6.5c.5 1.5 2 2.5 3.5 3" strokeLinecap="round"/></svg>;
    case 'hash':     return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw} strokeLinecap="round"><path d="M5.5 1.5L4 14.5M11.5 1.5L10 14.5M1.5 5h13M1 11h13"/></svg>;
    case 'discord':  return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw}><path d="M3 4.5c1.5-1 3.5-1.5 5-1.5s3.5.5 5 1.5l1.5 7c-1 .8-2.5 1.5-4 1.7l-.5-1c-.7.2-1.3.3-2 .3s-1.3-.1-2-.3l-.5 1c-1.5-.2-3-.9-4-1.7z"/><circle cx="6" cy="8" r="0.8" fill="#1a1a1a" stroke="none"/><circle cx="10" cy="8" r="0.8" fill="#1a1a1a" stroke="none"/></svg>;
    case 'sms':      return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw}><path d="M2.5 4.5c0-.6.4-1 1-1h9c.6 0 1 .4 1 1v6c0 .6-.4 1-1 1H6L3 13.5V4.5z"/><path d="M6 6.5h4M6 8.5h3" strokeLinecap="round"/></svg>;
    case 'social':   return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw}><circle cx="4" cy="4" r="1.7"/><circle cx="12" cy="4" r="1.7"/><circle cx="4" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><path d="M5 5l6 6M11 5l-6 6"/></svg>;
    case 'inbox':    return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw} strokeLinejoin="round"><path d="M2 9V4c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v5z"/><path d="M2 9h3.5l1 1.5h3l1-1.5H14v3c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1z"/></svg>;
    case 'redirect': return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M2 4h7l3 3-3 3H2M14 9v3"/></svg>;
    case 'bolt':     return <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M9 1L3 9h4l-1 6 7-9H9z"/></svg>;
    case 'ticket':   return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw}><path d="M2 5.5c.8 0 1.5-.7 1.5-1.5h9c0 .8.7 1.5 1.5 1.5v5c-.8 0-1.5.7-1.5 1.5h-9c0-.8-.7-1.5-1.5-1.5z"/><path d="M6 4.5v7M9 5.5v.01M9 7v.01M9 8.5v.01M9 10v.01" strokeLinecap="round"/></svg>;
    case 'timer':    return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw}><circle cx="8" cy="9" r="5"/><path d="M8 6v3l2 2M6 1.5h4M8 1.5v2.5" strokeLinecap="round"/></svg>;
    case 'sparkle':  return <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5z"/></svg>;
    case 'aibox':    return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw}><rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M8 5l1 2.5L11.5 8.5 9 9.5 8 12 7 9.5 4.5 8.5 7 7.5z" fill="#1a1a1a" stroke="none"/></svg>;
    case 'wrench':   return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw} strokeLinejoin="round"><path d="M11 2.5l3 3-2 2-2.5-.5-5 5L2 9l5-5L6.5 1.5z"/></svg>;
    case 'shop':     return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw} strokeLinejoin="round"><path d="M3 5h10l-.5 8.5h-9zM5 5V3.5a3 3 0 016 0V5"/></svg>;
    case 'plug':     return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw} strokeLinecap="round"><path d="M5 1.5v3M11 1.5v3M3.5 4.5h9v3.5c0 1.4-1.1 2.5-2.5 2.5h-4c-1.4 0-2.5-1.1-2.5-2.5z"/><path d="M8 10.5v4"/></svg>;
    case 'code':     return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5M9.5 3.5L7 13"/></svg>;
    case 'flow':     return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw}><circle cx="3" cy="3" r="1.5"/><circle cx="13" cy="8" r="1.5"/><circle cx="3" cy="13" r="1.5"/><path d="M4.5 3.5L11.5 7M4.5 12.5L11.5 9"/></svg>;
    case 'user':     return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw}><circle cx="8" cy="6" r="2.5"/><path d="M3 13.5c0-2 2.5-3 5-3s5 1 5 3"/></svg>;
    case 'building': return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw}><path d="M3 13.5V3.5h7v10M10 13.5V7h3v6.5"/><path d="M5 6.5h.5M5 9h.5M7 6.5h.5M7 9h.5M5 11.5h.5M7 11.5h.5"/></svg>;
    case 'cube':     return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw} strokeLinejoin="round"><path d="M8 1.5l6 3v7l-6 3-6-3v-7z"/><path d="M2 4.5l6 3 6-3M8 7.5v7"/></svg>;
    case 'arrows':   return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d="M5 2v8M5 10l-2.5-2.5M5 10L7.5 7.5M11 14V6M11 6L8.5 8.5M11 6l2.5 2.5"/></svg>;
    case 'bars':     return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw} strokeLinecap="round"><path d="M3 13V8M7 13V4M11 13V10M14 13V6"/></svg>;
    case 'home':     return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw} strokeLinejoin="round"><path d="M2 7L8 2l6 5v6.5h-4V10H6v3.5H2z"/></svg>;
    case 'book':     return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw} strokeLinejoin="round"><path d="M2.5 3.2v9.6c1.7-.6 3.4-.6 5.5 0 2.1-.6 3.8-.6 5.5 0V3.2c-1.7-.6-3.4-.6-5.5 0C5.9 2.6 4.2 2.6 2.5 3.2z"/><path d="M8 3.2v9.6"/></svg>;
    case 'plus':     return <svg viewBox="0 0 16 16" className={o} strokeWidth="1.7" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>;
    case 'bell':     return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw} strokeLinejoin="round"><path d="M3.5 11.5h9c-1-1-1-2-1-4 0-2-1.5-3.5-3.5-3.5S4.5 5.5 4.5 7.5c0 2 0 3-1 4z"/><path d="M6.5 13.5c.3.5.9.8 1.5.8s1.2-.3 1.5-.8M8 4V2.5"/></svg>;
    case 'flask':    return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw} strokeLinejoin="round"><path d="M6 1.5h4M7 1.5v4.5L3.5 13c-.4.7.1 1.5.9 1.5h7.2c.8 0 1.3-.8.9-1.5L9 6V1.5"/></svg>;
    case 'brush':    return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw} strokeLinejoin="round"><path d="M11 2l3 3-7 7H4v-3z"/><path d="M9 4l3 3M3 13.5l-1.5 1"/></svg>;
    case 'pencil':   return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw} strokeLinejoin="round"><path d="M11 2l3 3-9 9-4 1 1-4z"/><path d="M9 4l3 3"/></svg>;
    case 'eye':      return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw}><path d="M1.5 8C3 5 5.5 3.5 8 3.5s5 1.5 6.5 4.5C13 11 10.5 12.5 8 12.5S3 11 1.5 8z"/><circle cx="8" cy="8" r="2"/></svg>;
    case 'key':      return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw}><circle cx="5" cy="11" r="2.5"/><path d="M7 9.5l6.5-6.5M11 5l2 2M9.5 6.5l1.5 1.5"/></svg>;
    case 'lockuser': return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw}><circle cx="6" cy="5.5" r="2"/><path d="M2.5 13c0-1.7 1.6-3 3.5-3s3.5 1.3 3.5 3"/><rect x="10" y="8" width="5" height="4" rx="0.5"/><path d="M11 8V6.5a1.5 1.5 0 013 0V8"/></svg>;
    default:         return <svg viewBox="0 0 16 16" className={o} strokeWidth={sw}><circle cx="8" cy="8" r="5"/></svg>;
  }
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

const GROUPS: {
  key: string;
  label: string;
  subs: { label: string; section: SettingsSection; warn?: boolean }[];
}[] = [
  {
    key: 'workspace',
    label: 'Espacio de trabajo',
    subs: [
      { label: 'General', section: 'workspace_general' },
      { label: 'Compañeros de equipo', section: 'workspace_members' },
      { label: 'Horario de atención', section: 'placeholder' },
      { label: 'Marcas', section: 'placeholder' },
      { label: 'Seguridad', section: 'placeholder', warn: true },
      { label: 'Multilingüe', section: 'placeholder' },
    ],
  },
  {
    key: 'suscripcion',
    label: 'Suscripción',
    subs: [{ label: 'Facturación', section: 'billing' }],
  },
  {
    key: 'canales',
    label: 'Canales',
    subs: [
      { label: 'Messenger', section: 'placeholder' },
      { label: 'Correo electrónico', section: 'placeholder' },
      { label: 'Teléfono', section: 'placeholder' },
      { label: 'WhatsApp', section: 'placeholder' },
      { label: 'Slack', section: 'placeholder' },
      { label: 'Discord', section: 'placeholder' },
      { label: 'SMS', section: 'placeholder' },
      { label: 'Canales de redes sociales', section: 'placeholder' },
      { label: 'Todos los canales', section: 'placeholder' },
    ],
  },
  {
    key: 'inbox',
    label: 'Inbox',
    subs: [
      { label: 'Inbox para el equipo', section: 'placeholder' },
      { label: 'Asignaciones', section: 'placeholder' },
      { label: 'Macros', section: 'placeholder' },
      { label: 'Folios de atención', section: 'placeholder' },
      { label: 'SLA', section: 'placeholder' },
    ],
  },
  {
    key: 'ia',
    label: 'IA y automatización',
    subs: [
      { label: 'Fin AI Agent', section: 'placeholder' },
      { label: 'Buzón de IA', section: 'placeholder' },
      { label: 'Automatización', section: 'placeholder' },
    ],
  },
  {
    key: 'integ',
    label: 'Integraciones',
    subs: [
      { label: 'Tienda de aplicaciones', section: 'placeholder' },
      { label: 'Conectores de datos', section: 'placeholder' },
      { label: 'Autenticación', section: 'placeholder' },
      { label: 'Centro para desarrolladores', section: 'placeholder' },
    ],
  },
  {
    key: 'datos',
    label: 'Datos',
    subs: [
      { label: 'Etiquetas', section: 'placeholder' },
      { label: 'Personas', section: 'placeholder' },
      { label: 'Empresas', section: 'placeholder' },
      { label: 'Conversaciones', section: 'placeholder' },
      { label: 'Objetos personalizados', section: 'placeholder' },
      { label: 'Importaciones y exportaciones', section: 'placeholder' },
      { label: 'Temas', section: 'placeholder' },
    ],
  },
  {
    key: 'ayuda',
    label: 'Centro de ayuda',
    subs: [
      { label: 'Inicio Help Center', section: 'placeholder' },
      { label: 'Todos los centros de ayuda', section: 'placeholder' },
    ],
  },
  {
    key: 'salientes',
    label: 'Canales salientes',
    subs: [
      { label: 'Suscripciones', section: 'placeholder' },
      { label: 'Pruebas de mensajes', section: 'placeholder' },
      { label: 'Etiquetas de mensajes', section: 'placeholder' },
    ],
  },
  {
    key: 'personal',
    label: 'Personal',
    subs: [
      { label: 'Información', section: 'personal_info' },
      { label: 'Seguridad de la cuenta', section: 'placeholder' },
      { label: 'Notificaciones', section: 'placeholder' },
      { label: 'Visible para ti', section: 'placeholder' },
      { label: 'Tokens de API', section: 'placeholder' },
      { label: 'Acceso a la cuenta', section: 'placeholder' },
      { label: 'Multilingüe', section: 'placeholder' },
    ],
  },
];

function SettingsSidebar({
  active,
  activeLabel,
  onNav,
}: {
  active: SettingsSection;
  activeLabel: string;
  onNav: (section: SettingsSection, label: string) => void;
}) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    GROUPS.forEach(g => {
      init[g.key] = g.subs.some(s => s.section === active);
    });
    return init;
  });

  const toggle = (k: string) => setOpenGroups(s => ({ ...s, [k]: !s[k] }));

  const Chev = ({ open }: { open: boolean }) => (
    <svg viewBox="0 0 16 16" className={`w-3.5 h-3.5 fill-[#646462] transition-transform ${open ? 'rotate-90' : ''}`}>
      <path d="M6 4l4 4-4 4z"/>
    </svg>
  );

  const itemCls = (isActive: boolean) =>
    `flex items-center w-full px-3 py-[7px] rounded-lg text-[13px] text-left transition-colors ${
      isActive
        ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]'
        : 'text-[#1a1a1a] hover:bg-[#e9eae6]/40'
    }`;

  return (
    <div className="flex flex-col h-full w-[236px] bg-[#f8f8f7] border-r border-[#e9eae6] flex-shrink-0 overflow-hidden">
      <div className="flex items-center px-6 py-4 h-16 flex-shrink-0">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Ajustes</span>
      </div>

      <div className="flex-1 overflow-y-auto pl-3 pr-3 pb-4 flex flex-col gap-0.5">
        {/* Inicio */}
        <button
          onClick={() => onNav('inicio', 'Inicio')}
          className={itemCls(active === 'inicio')}
        >
          <span className="flex-1">Inicio</span>
        </button>

        {/* Collapsible groups */}
        {GROUPS.map(g => (
          <div key={g.key}>
            <button
              onClick={() => toggle(g.key)}
              className="flex items-center justify-between w-full px-3 py-[7px] rounded-lg text-[13px] text-[#1a1a1a] hover:bg-[#e9eae6]/40 text-left"
            >
              <span>{g.label}</span>
              <Chev open={!!openGroups[g.key]} />
            </button>
            {openGroups[g.key] && (
              <div className="flex flex-col gap-0.5 pl-3">
                {g.subs.map(sub => (
                  <button
                    key={sub.label}
                    onClick={() => onNav(sub.section, sub.label)}
                    className={itemCls(active === sub.section && activeLabel === sub.label)}
                  >
                    <span className="flex-1">{sub.label}</span>
                    {sub.warn && <span className="text-[#f59e0b]">⚠</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Card grid (Inicio) ────────────────────────────────────────────────────────

function CardGrid({ title, cards }: {
  title: string;
  cards: { icon: IconKind; bg: string; name: string; desc: string; badge?: string }[];
}) {
  return (
    <div className="mb-6">
      <h3 className="text-[14px] font-semibold text-[#1a1a1a] mb-3">{title}</h3>
      <div className="grid grid-cols-3 gap-3">
        {cards.map((c, i) => (
          <button
            key={i}
            className="bg-white border border-[#e9eae6] rounded-[10px] p-4 flex items-start gap-3 text-left hover:bg-[#fafaf9] transition-colors"
          >
            <span
              className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0"
              style={{ background: c.bg }}
            >
              <SetIcon kind={c.icon} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[13px] font-semibold text-[#1a1a1a]">{c.name}</span>
                {c.badge && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#e7e2fd] text-[#5b21b6] font-medium">{c.badge}</span>
                )}
              </div>
              {c.desc && <p className="mt-0.5 text-[11.5px] text-[#646462] leading-[15px] line-clamp-3">{c.desc}</p>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function InicioContent() {
  return (
    <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6">
      <CardGrid title="Espacio de trabajo" cards={[
        { icon: 'gear',   bg: '#f3f3f1', name: 'Generales',            desc: 'Visualiza información básica de tu cuenta, como tu nombre y zona horaria.' },
        { icon: 'team',   bg: '#dbeafe', name: 'Compañeros de equipo', desc: 'Administra y añade a compañeros de equipo en tu espacio de trabajo.' },
        { icon: 'clock',  bg: '#fef3c7', name: 'Horario de atención',  desc: 'Configura el horario en el que tu equipo está disponible.' },
        { icon: 'gift',   bg: '#d1fae5', name: 'Referencias',          badge: 'Gana $200', desc: 'Recomienda a otras empresas y consigue una bonificación.' },
        { icon: 'tag',    bg: '#fce7f3', name: 'Marcas',               desc: 'Para tus clientes y agencias.' },
        { icon: 'shield', bg: '#e0e7ff', name: 'Seguridad',            desc: 'Configura la autenticación y los ajustes de inicio de sesión.' },
        { icon: 'globe',  bg: '#fef3c7', name: 'Multilingüe',          desc: 'Configura los idiomas en los que opera tu espacio de trabajo.' },
      ]} />
      <CardGrid title="Suscripción" cards={[
        { icon: 'card',  bg: '#dcfce7', name: 'Facturación', desc: 'Administra tu suscripción y métodos de pago.' },
        { icon: 'chart', bg: '#fee2e2', name: 'Uso',         desc: 'Monitoriza el uso de tu suscripción y compromiso de Fin.' },
      ]} />
      <CardGrid title="Canales" cards={[
        { icon: 'chat',     bg: '#fce7f3', name: 'Messenger',              desc: 'Atrae y mantente conectado con clientes a través de tu sitio web.' },
        { icon: 'mail',     bg: '#dbeafe', name: 'Correo electrónico',     desc: 'Administra el correo de tu equipo, dominios y autenticación DKIM.' },
        { icon: 'phone',    bg: '#fee2e2', name: 'Teléfono',               desc: 'Configura y administra llamadas de voz directamente desde tu Inbox.' },
        { icon: 'whatsapp', bg: '#dcfce7', name: 'WhatsApp',               desc: 'Habla y configura los números de WhatsApp.' },
        { icon: 'hash',     bg: '#e9d5ff', name: 'Slack',                  desc: 'Recibe y envía mensajes a tu equipo desde Slack.' },
        { icon: 'discord',  bg: '#cffafe', name: 'Discord',                desc: 'Recibe y envía mensajes a usuarios de Discord.' },
        { icon: 'sms',      bg: '#fef3c7', name: 'SMS',                    desc: 'Configura los números de SMS para enviar mensajes.' },
        { icon: 'social',   bg: '#fce7f3', name: 'Canales redes sociales', desc: 'Administra mensajes desde plataformas sociales.' },
        { icon: 'globe',    bg: '#dbeafe', name: 'Todos los canales',      desc: 'Administra y configura los ajustes de todos los canales.' },
      ]} />
      <CardGrid title="Inbox" cards={[
        { icon: 'inbox',    bg: '#dbeafe', name: 'Inbox para el equipo', desc: 'Crea buzones para tu equipo de compañeros.' },
        { icon: 'redirect', bg: '#fef3c7', name: 'Asignaciones',         desc: 'Especifica cómo se asignan los casos y las cargas de trabajo.' },
        { icon: 'bolt',     bg: '#e9d5ff', name: 'Macros',               desc: 'Crea y edita macros para enviar respuestas comunes con un clic.' },
        { icon: 'ticket',   bg: '#fce7f3', name: 'Tipos de atención',    desc: 'Crea y configura los tipos de tickets y categorías.' },
        { icon: 'timer',    bg: '#fee2e2', name: 'SLA',                  desc: 'Asegúrate de que tu equipo cumple los acuerdos de nivel de servicio.' },
      ]} />
      <CardGrid title="IA y automatización" cards={[
        { icon: 'sparkle', bg: '#fef3c7', name: 'Fin AI Agent',   desc: 'Administra tu agente de IA y personalízalo para tus clientes.' },
        { icon: 'aibox',   bg: '#e0e7ff', name: 'Buzón de IA',    badge: 'New Beta', desc: 'Activa características nuevas de inteligencia artificial.' },
        { icon: 'wrench',  bg: '#fce7f3', name: 'Automatización', desc: 'Crea reglas y flujos de trabajo para automatizar el trabajo.' },
      ]} />
      <CardGrid title="Integraciones" cards={[
        { icon: 'shop', bg: '#dbeafe', name: 'Tienda de aplicaciones',      desc: 'Conecta todos los servicios y herramientas que ya usas.' },
        { icon: 'plug', bg: '#dcfce7', name: 'Conectores de datos',         desc: 'Especifica los datos de los sistemas externos que usa tu equipo.' },
        { icon: 'code', bg: '#fef3c7', name: 'Centro para desarrolladores', desc: 'Crea aplicaciones y servicios personalizados.' },
        { icon: 'flow', bg: '#fce7f3', name: 'Automatizaciones',            desc: 'Crea automatizaciones con cualquier información o paso a paso.' },
      ]} />
      <CardGrid title="Datos" cards={[
        { icon: 'tag',      bg: '#dbeafe', name: 'Etiquetas',                desc: 'Administra tus etiquetas y agrúpalas en categorías.' },
        { icon: 'user',     bg: '#dcfce7', name: 'Personas',                 desc: 'Administra atributos, segmentos y eventos de los contactos.' },
        { icon: 'building', bg: '#fef3c7', name: 'Empresas',                 desc: 'Administra atributos, segmentos y eventos de las cuentas.' },
        { icon: 'chat',     bg: '#fce7f3', name: 'Conversaciones',           desc: 'Crea atributos para los datos de cada conversación.' },
        { icon: 'cube',     bg: '#e9d5ff', name: 'Objetos personalizados',   desc: 'Importar tipos de objetos para crear datos personalizados.' },
        { icon: 'arrows',   bg: '#cffafe', name: 'Importación y exportación', desc: 'Importa o exporta datos de diversas fuentes.' },
        { icon: 'bars',     bg: '#fee2e2', name: 'Temas',                    desc: 'Crea categorías generales o temas conversacionales.' },
      ]} />
      <CardGrid title="Centro de ayuda" cards={[
        { icon: 'home', bg: '#dbeafe', name: 'Inicio Help Center',         desc: 'Configura el inicio de tu centro de ayuda.' },
        { icon: 'book', bg: '#dcfce7', name: 'Todos los centros de ayuda', desc: 'Lista todos los centros de ayuda en tu cuenta.' },
        { icon: 'plus', bg: '#fef3c7', name: 'Nuevo Centro de ayuda',      desc: '' },
      ]} />
      <CardGrid title="Canales salientes" cards={[
        { icon: 'bell',  bg: '#fce7f3', name: 'Suscripciones',         desc: 'Permite a los clientes administrar las comunicaciones que reciben.' },
        { icon: 'flask', bg: '#fef3c7', name: 'Pruebas de mensajes',   desc: 'Crea pruebas A/B con mensajes automatizados.' },
        { icon: 'tag',   bg: '#dcfce7', name: 'Etiquetas de mensajes', desc: 'Clasifica tus mensajes con etiquetas personalizadas.' },
        { icon: 'brush', bg: '#e9d5ff', name: 'Personalización',       desc: 'Personaliza la apariencia de los mensajes salientes.' },
      ]} />
      <CardGrid title="Personal" cards={[
        { icon: 'pencil',   bg: '#dbeafe', name: 'Información',            desc: 'Configura tu información personal como tu nombre y avatar.' },
        { icon: 'shield',   bg: '#fef3c7', name: 'Seguridad de la cuenta', desc: 'Configura ajustes de tu cuenta personal de inicio de sesión.' },
        { icon: 'bell',     bg: '#fce7f3', name: 'Notificaciones',         desc: 'Configura las preferencias de notificaciones.' },
        { icon: 'eye',      bg: '#dcfce7', name: 'Visible para ti',        desc: 'Personaliza tu vista de pantalla y disposición.' },
        { icon: 'key',      bg: '#fee2e2', name: 'Tokens de API',          desc: 'Verifica y configura tus tokens personales de la API.' },
        { icon: 'lockuser', bg: '#e9d5ff', name: 'Acceso a la cuenta',     desc: 'Administra cuentas asociadas e inicio de sesión.' },
        { icon: 'globe',    bg: '#cffafe', name: 'Multilingüe',            desc: 'Configura los ajustes de traducción de tu cuenta.' },
      ]} />
    </div>
  );
}

// ── Workspace General ─────────────────────────────────────────────────────────

function WorkspaceGeneralContent() {
  const { data: ctx, loading, error } = useApi(() => workspacesApi.currentContext(), []);
  const [saved, setSaved] = useState(false);
  const { mutate: doUpdate, loading: saving } = useMutation(
    (payload: Record<string, any>) => {
      const id: string = ctx?.workspace?.id ?? ctx?.id ?? '';
      return workspacesApi.update(id, payload);
    },
    { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); } },
  );

  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('');

  useEffect(() => {
    if (loading || !ctx) return;
    const ws = ctx?.workspace ?? ctx ?? {};
    if (ws.name) setName(ws.name);
    if (ws.timezone) setTimezone(ws.timezone);
  }, [loading, ctx]);

  const ws = ctx?.workspace ?? ctx ?? {};

  return (
    <ContentShell title="Generales">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}
      {!loading && !error && (
        <div className="max-w-[560px] flex flex-col gap-6">
          <Field label="Nombre del espacio de trabajo">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-[#e9eae6] rounded-lg px-3 py-2 text-[14px] text-[#1a1a1a] outline-none focus:border-[#1a1a1a] bg-white"
            />
          </Field>
          <Field label="Zona horaria">
            <input
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              className="w-full border border-[#e9eae6] rounded-lg px-3 py-2 text-[14px] text-[#1a1a1a] outline-none focus:border-[#1a1a1a] bg-white"
            />
          </Field>
          {ws.industry !== undefined && (
            <Field label="Industria">
              <p className="text-[14px] text-[#646462]">{ws.industry ?? '—'}</p>
            </Field>
          )}
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={() => void doUpdate({ name, timezone })}
              disabled={saving}
              className="px-3 h-8 rounded-full text-[13px] font-semibold text-white bg-[#1a1a1a] hover:bg-black disabled:bg-[#e9eae6] disabled:text-[#646462] disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
            {saved && <span className="text-[13px] text-[#16a34a]">✓ Guardado</span>}
          </div>
        </div>
      )}
    </ContentShell>
  );
}

// ── Workspace Members ─────────────────────────────────────────────────────────

function WorkspaceMembersContent() {
  const { data: members, loading: lm, error: em, refetch } = useApi(() => iamApi.members(), [], []);
  const { data: roles, loading: lr } = useApi(() => iamApi.roles(), [], []);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('');
  const { mutate: doInvite, loading: inviting } = useMutation(
    (p: { email: string; role_id: string }) => iamApi.inviteMember(p),
    {
      onSuccess: () => {
        setShowInvite(false);
        setInviteEmail('');
        setInviteRole('');
        refetch();
      },
    },
  );
  const { mutate: doRoleChange } = useMutation(
    (p: { id: string; role_id: string }) => iamApi.updateMember(p.id, { role_id: p.role_id }),
    { onSuccess: () => refetch() },
  );

  const statusBadge = (s?: string) => {
    const map: Record<string, string> = {
      active: 'bg-[#dcfce7] text-[#166534]',
      invited: 'bg-[#fef9c3] text-[#713f12]',
      disabled: 'bg-[#f3f4f6] text-[#6b7280]',
    };
    return map[s ?? ''] ?? 'bg-[#f3f4f6] text-[#6b7280]';
  };

  return (
    <ContentShell title="Compañeros de equipo">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] text-[#646462]">
          {members?.length ?? 0} {members?.length === 1 ? 'miembro' : 'miembros'}
        </p>
        <button
          onClick={() => setShowInvite(v => !v)}
          className="px-3 h-8 rounded-full text-[13px] font-semibold text-white bg-[#1a1a1a] hover:bg-black"
        >
          + Invitar
        </button>
      </div>

      {showInvite && (
        <div className="mb-4 p-4 border border-[#e9eae6] rounded-xl bg-[#fafaf9] flex flex-col gap-3">
          <h4 className="text-[13px] font-semibold text-[#1a1a1a]">Invitar miembro</h4>
          <input
            type="email"
            placeholder="correo@empresa.com"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1a1a1a] bg-white"
          />
          {!lr && roles && (
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              className="border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#1a1a1a] bg-white"
            >
              <option value="">Seleccionar rol…</option>
              {(roles as any[]).map((r: any) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => void doInvite({ email: inviteEmail, role_id: inviteRole })}
              disabled={inviting || !inviteEmail || !inviteRole}
              className="px-3 h-8 rounded-full text-[13px] font-semibold text-white bg-[#1a1a1a] hover:bg-black disabled:bg-[#e9eae6] disabled:text-[#646462] disabled:cursor-not-allowed"
            >
              {inviting ? 'Enviando…' : 'Enviar invitación'}
            </button>
            <button
              onClick={() => setShowInvite(false)}
              className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] hover:bg-[#ededea]"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {lm && <LoadingState />}
      {em && <ErrorState message={em} />}
      {!lm && !em && (
        <div className="border border-[#e9eae6] rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_160px_100px_80px] text-[12px] font-semibold text-[#646462] px-4 py-2 border-b border-[#e9eae6] bg-[#fafaf9]">
            <span>Nombre / Email</span>
            <span>Rol</span>
            <span>Estado</span>
            <span></span>
          </div>
          {(members as any[]).length === 0 && (
            <p className="px-4 py-6 text-[13px] text-[#646462] text-center">No hay miembros todavía.</p>
          )}
          {(members as any[]).map((m: any) => (
            <div key={m.id} className="grid grid-cols-[1fr_160px_100px_80px] items-center px-4 py-3 border-b border-[#e9eae6] last:border-0 hover:bg-[#fafaf9]">
              <div>
                <p className="text-[13px] font-semibold text-[#1a1a1a]">{m.name ?? m.email}</p>
                {m.name && <p className="text-[12px] text-[#646462]">{m.email}</p>}
              </div>
              <div>
                {!lr && roles ? (
                  <select
                    value={m.roleId ?? m.role_id ?? ''}
                    onChange={e => void doRoleChange({ id: m.id, role_id: e.target.value })}
                    className="border border-[#e9eae6] rounded-lg px-2 py-1 text-[12px] outline-none focus:border-[#1a1a1a] bg-white w-full"
                  >
                    {(roles as any[]).map((r: any) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[12px] text-[#646462]">{m.roleName ?? m.role ?? '—'}</span>
                )}
              </div>
              <div>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${statusBadge(m.status)}`}>
                  {m.status ?? '—'}
                </span>
              </div>
              <div className="flex justify-end">
                <button className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f3f3f1]">
                  <svg viewBox="0 0 14 14" className="w-3.5 h-3.5 fill-[#646462]">
                    <circle cx="7" cy="3" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="7" cy="11" r="1.2"/>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </ContentShell>
  );
}

// ── Billing ───────────────────────────────────────────────────────────────────

function BillingContent() {
  const { data, loading, error } = useApi(() => billingApi.usage(), []);

  const pct = data?.percentUsed ?? 0;
  const barColor = pct > 90 ? '#dc2626' : pct > 70 ? '#f59e0b' : '#16a34a';

  return (
    <ContentShell title="Facturación y uso">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}
      {!loading && !error && data && (
        <div className="max-w-[560px] flex flex-col gap-4">
          {/* Plan card */}
          <div className="border border-[#e9eae6] rounded-xl p-5 bg-white flex items-start justify-between">
            <div>
              <p className="text-[12px] font-semibold text-[#646462] uppercase tracking-wide mb-1">Plan actual</p>
              <p className="text-[20px] font-semibold text-[#1a1a1a]">{data.plan}</p>
              <p className="text-[12px] text-[#646462] mt-1">
                Período: {new Date(data.periodStart).toLocaleDateString('es-ES')} — {new Date(data.periodEnd).toLocaleDateString('es-ES')}
              </p>
            </div>
            <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${data.unlimited ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#f3f4f6] text-[#374151]'}`}>
              {data.unlimited ? 'Ilimitado' : 'Con límite'}
            </span>
          </div>

          {/* Usage bar */}
          {!data.unlimited && (
            <div className="border border-[#e9eae6] rounded-xl p-5 bg-white flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-[#1a1a1a]">Créditos IA incluidos</p>
                <p className="text-[13px] text-[#646462]">
                  {data.usedThisPeriod.toLocaleString()} / {data.included.toLocaleString()}
                </p>
              </div>
              <div className="h-2 bg-[#f3f4f6] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(pct, 100)}%`, background: barColor }}
                />
              </div>
              <p className="text-[12px] text-[#646462]">{pct.toFixed(1)}% utilizado este período</p>
              {data.topupBalance > 0 && (
                <p className="text-[12px] text-[#646462]">
                  + {data.topupBalance.toLocaleString()} créditos top-up disponibles
                </p>
              )}
            </div>
          )}

          {/* Flexible usage */}
          <div className="border border-[#e9eae6] rounded-xl p-5 bg-white flex items-center justify-between">
            <div>
              <p className="text-[13px] font-semibold text-[#1a1a1a]">Uso flexible</p>
              <p className="text-[12px] text-[#646462]">Permite uso adicional más allá del plan incluido</p>
              {data.flexibleCap !== null && (
                <p className="text-[12px] text-[#646462] mt-0.5">Límite: {data.flexibleCap?.toLocaleString()} créditos</p>
              )}
            </div>
            <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${data.flexibleEnabled ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#f3f4f6] text-[#374151]'}`}>
              {data.flexibleEnabled ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        </div>
      )}
    </ContentShell>
  );
}

// ── Personal Info ─────────────────────────────────────────────────────────────

function PersonalInfoContent() {
  const { data: me, loading, error } = useApi(() => iamApi.me(), []);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const { mutate: doUpdate, loading: saving } = useMutation(
    (payload: Record<string, any>) => iamApi.updateMe(payload),
    { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); } },
  );

  useEffect(() => {
    if (!loading && me?.name) setName(me.name);
  }, [loading, me]);

  return (
    <ContentShell title="Información personal">
      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}
      {!loading && !error && me && (
        <div className="max-w-[560px] flex flex-col gap-6">
          <Field label="Nombre">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-[#e9eae6] rounded-lg px-3 py-2 text-[14px] text-[#1a1a1a] outline-none focus:border-[#1a1a1a] bg-white"
            />
          </Field>
          <Field label="Correo electrónico">
            <p className="text-[14px] text-[#646462]">{me.email ?? '—'}</p>
          </Field>
          {me.role && (
            <Field label="Rol">
              <p className="text-[14px] text-[#646462]">{me.role}</p>
            </Field>
          )}
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={() => void doUpdate({ name })}
              disabled={saving}
              className="px-3 h-8 rounded-full text-[13px] font-semibold text-white bg-[#1a1a1a] hover:bg-black disabled:bg-[#e9eae6] disabled:text-[#646462] disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
            {saved && <span className="text-[13px] text-[#16a34a]">✓ Guardado</span>}
          </div>
        </div>
      )}
    </ContentShell>
  );
}

// ── Placeholder ───────────────────────────────────────────────────────────────

function PlaceholderContent({ label }: { label: string }) {
  return (
    <ContentShell title={label}>
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <div className="w-10 h-10 rounded-full bg-[#f3f3f1] flex items-center justify-center">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5">
            <circle cx="8" cy="8" r="6"/>
            <path d="M8 7v4M8 5v.5" strokeLinecap="round"/>
          </svg>
        </div>
        <p className="text-[14px] font-semibold text-[#1a1a1a]">Sección en migración</p>
        <p className="text-[13px] text-[#646462] max-w-[300px]">
          Esta sección estará disponible en una próxima iteración. Por ahora usa la versión original.
        </p>
      </div>
    </ContentShell>
  );
}

// ── Shared shell + helpers ────────────────────────────────────────────────────

function ContentShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden bg-white">
      <div className="flex items-center px-6 py-4 border-b border-[#e9eae6] flex-shrink-0 h-16">
        <h1 className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">{title}</h1>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-6">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-semibold text-[#1a1a1a]">{label}</label>
      {children}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center gap-2 py-8 text-[13px] text-[#646462]">
      <svg className="w-4 h-4 animate-spin fill-[#646462]" viewBox="0 0 16 16">
        <path d="M8 1.5A6.5 6.5 0 1114.5 8H13A5 5 0 108 3z"/>
      </svg>
      Cargando…
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="py-4 px-4 bg-[#fef2f2] border border-[#fecaca] rounded-lg text-[13px] text-[#dc2626]">
      {message}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function SettingsV2() {
  const [section, setSection] = useState<SettingsSection>('inicio');
  const [sectionLabel, setSectionLabel] = useState('Inicio');

  const handleNav = useCallback((s: SettingsSection, label: string) => {
    setSection(s);
    setSectionLabel(label);
  }, []);

  return (
    <div className="flex flex-1 min-w-0 h-full overflow-hidden">
      <SettingsSidebar active={section} activeLabel={sectionLabel} onNav={handleNav} />

      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        {section === 'inicio'            && <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden bg-white"><div className="flex items-center px-6 py-4 border-b border-[#e9eae6] h-16 flex-shrink-0"><h1 className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Ajustes</h1></div><InicioContent /></div>}
        {section === 'workspace_general' && <WorkspaceGeneralContent />}
        {section === 'workspace_members' && <WorkspaceMembersContent />}
        {section === 'billing'           && <BillingContent />}
        {section === 'personal_info'     && <PersonalInfoContent />}
        {section === 'placeholder'       && <PlaceholderContent label={sectionLabel} />}
      </div>
    </div>
  );
}
