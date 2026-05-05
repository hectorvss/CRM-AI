import React, { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
type RightTab = 'informacion' | 'copilot';
type NavItem = { id: string; label: string; count?: number; icon?: string };

// ─── Mock data ────────────────────────────────────────────────────────────────
const CONVERSATIONS = [
  {
    id: '1',
    channel: 'Messenger',
    channelInitial: 'M',
    channelColor: 'bg-teal-500',
    contact: 'Messenger · [Demo]',
    preview: 'Install Messenger',
    time: '4 min',
    messages: [
      {
        id: 'm1',
        sender: 'bot',
        content: `This is a demo message. It shows how a customer conversation from the Messenger will look in your Inbox. Conversations handled by Fin AI Agent will also appear here.\n\nOnce a channel is installed, all conversations come straight to your Inbox, so you can route them to the right team.`,
        time: '4 minutos',
        link: { label: 'Install Messenger', href: '#' },
        avatar: 'M',
        avatarColor: 'bg-teal-500',
      },
    ],
  },
  {
    id: '2',
    channel: 'Email',
    channelInitial: 'E',
    channelColor: 'bg-red-500',
    contact: 'Email · [Demo]',
    preview: 'This is a demo email. It...',
    time: '4 min',
    messages: [
      {
        id: 'e1',
        sender: 'bot',
        content: `This is a demo email. It shows how a customer email conversation will look in your Inbox. You can reply, assign, and manage all your emails directly from here.`,
        time: '4 minutos',
        avatar: 'E',
        avatarColor: 'bg-red-500',
      },
    ],
  },
  {
    id: '3',
    channel: 'WhatsApp',
    channelInitial: 'W',
    channelColor: 'bg-green-500',
    contact: 'WhatsApp · [Demo]',
    preview: 'Set up WhatsApp or so...',
    time: '4 min',
    messages: [
      {
        id: 'w1',
        sender: 'bot',
        content: `Set up WhatsApp or so your customers can reach you through WhatsApp. All messages will appear here in your Inbox.`,
        time: '4 minutos',
        avatar: 'W',
        avatarColor: 'bg-green-500',
      },
    ],
  },
  {
    id: '4',
    channel: 'Phone',
    channelInitial: 'P',
    channelColor: 'bg-purple-500',
    contact: 'Phone · [Demo]',
    preview: 'Set up phone or SMS',
    time: '4 min',
    messages: [
      {
        id: 'p1',
        sender: 'bot',
        content: `Set up phone or SMS to handle calls and text messages from your customers directly in your Inbox.`,
        time: '4 minutos',
        avatar: 'P',
        avatarColor: 'bg-purple-500',
      },
    ],
  },
];

const NAV_ITEMS_MAIN: NavItem[] = [
  { id: 'bandeja', label: 'Tu bandeja de entrada', count: 4, icon: 'inbox' },
  { id: 'menciones', label: 'Menciones', count: 0, icon: 'at' },
  { id: 'creado', label: 'Creado por ti', count: 0, icon: 'pencil' },
  { id: 'todo', label: 'Todo', count: 4, icon: 'users' },
  { id: 'sin_asignar', label: 'Sin asignar', count: 0, icon: 'user-x' },
  { id: 'correo_no_deseado', label: 'Correo no deseado', count: 0, icon: 'ban' },
  { id: 'tablero', label: 'Tablero', icon: 'chart' },
];

const NAV_ITEMS_FIN: NavItem[] = [
  { id: 'todas', label: 'Todas las conversaciones', icon: 'chat' },
  { id: 'resuelto', label: 'Resuelto', icon: 'check' },
  { id: 'escalado', label: 'Escalado y transferencia', icon: 'arrow-up' },
  { id: 'pendiente', label: 'Pendiente', icon: 'clock' },
  { id: 'correo_fin', label: 'Correo no deseado', icon: 'ban' },
];

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const IconInbox = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
  </svg>
);
const IconAt = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 006 0v-1a10 10 0 10-3.92 7.94" />
  </svg>
);
const IconPencil = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const IconUsers = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
  </svg>
);
const IconUserX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" strokeWidth="0" fill="currentColor" />
  </svg>
);
const IconBan = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
  </svg>
);
const IconChart = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
  </svg>
);
const IconChat = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
  </svg>
);
const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IconArrowUp = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
  </svg>
);
const IconClock = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
  </svg>
);
const IconPlus = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const IconSearch = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const IconChevronDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
const IconChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const IconChevronLeft = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
const IconStar = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);
const IconDots = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /><circle cx="5" cy="12" r="1" fill="currentColor" />
  </svg>
);
const IconGrid = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
  </svg>
);
const IconMoon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
  </svg>
);
const IconSort = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="9" y2="18" />
  </svg>
);
const IconExternalLink = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);
const IconSplitView = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="12" y1="3" x2="12" y2="21" />
  </svg>
);
const IconChevronDown2 = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
const IconReply = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 00-4-4H4" />
  </svg>
);
const IconBolt = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);
const IconSend = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);
const IconPersonAdd = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="8.5" cy="7" r="4" />
    <line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" />
  </svg>
);
const IconMerge = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M6 21V9a9 9 0 009 9" />
  </svg>
);
const IconNewConv = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    <line x1="12" y1="8" x2="12" y2="13" /><line x1="9.5" y1="10.5" x2="14.5" y2="10.5" />
  </svg>
);
const IconDownload = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
const IconEye = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const IconSettings = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);
const IconHelp = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);
const IconLinkIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
  </svg>
);
const IconUser = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
const IconBuilding = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

// ─── Nav icon helper ──────────────────────────────────────────────────────────
function NavIcon({ id }: { id: string }) {
  switch (id) {
    case 'inbox': return <IconInbox />;
    case 'at': return <IconAt />;
    case 'pencil': return <IconPencil />;
    case 'users': return <IconUsers />;
    case 'user-x': return <IconUserX />;
    case 'ban': return <IconBan />;
    case 'chart': return <IconChart />;
    case 'chat': return <IconChat />;
    case 'check': return <IconCheck />;
    case 'arrow-up': return <IconArrowUp />;
    case 'clock': return <IconClock />;
    default: return <IconChat />;
  }
}

// ─── Component: Trial Banner ──────────────────────────────────────────────────
function TrialBanner() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <div className="flex items-center justify-between px-4 py-2 text-sm" style={{ background: '#f0eeff', borderBottom: '1px solid #e5e0ff' }}>
      <span className="text-gray-700">
        Quedan <strong>14 días</strong> en tu{' '}
        <a href="#" className="text-indigo-600 font-medium underline">prueba de Advanced</a>.{' '}
        Incluye uso ilimitado de Fin.
      </span>
      <div className="flex items-center gap-4">
        <span className="text-gray-700">
          Solicita un descuento del <strong>93 %</strong> en la Early Stage.
        </span>
        <button
          onClick={() => setVisible(false)}
          className="px-3 py-1.5 rounded-md text-sm font-semibold text-white"
          style={{ background: '#1f1f1f' }}
        >
          Comprar Intercom
        </button>
      </div>
    </div>
  );
}

// ─── Component: Icon Sidebar (far left) ──────────────────────────────────────
interface IconSidebarProps {
  onNavigate: (page: string) => void;
}

function IconSidebar({ onNavigate }: IconSidebarProps) {
  return (
    <div
      className="flex flex-col items-center py-3 gap-1 flex-shrink-0"
      style={{ width: 44, background: '#fff', borderRight: '1px solid #e5e7eb' }}
    >
      {/* Logo */}
      <div className="mb-2 flex items-center justify-center w-8 h-8 rounded-lg" style={{ background: '#1f1f1f' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
        </svg>
      </div>

      {/* Inbox icon — active */}
      <button
        onClick={() => onNavigate('inbox')}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg text-indigo-600 transition-colors"
        style={{ background: '#ede9fe' }}
        title="Inbox"
      >
        <IconInbox />
        <span className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full text-white text-[10px] font-bold" style={{ background: '#1f1f1f' }}>4</span>
      </button>

      {/* Contacts */}
      <button
        onClick={() => onNavigate('contacts')}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        title="Contactos"
      >
        <IconUsers />
      </button>

      {/* AI */}
      <button
        onClick={() => onNavigate('ai_studio')}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        title="AI Studio"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
        </svg>
      </button>

      {/* Reports */}
      <button
        onClick={() => onNavigate('reports')}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        title="Informes"
      >
        <IconChart />
      </button>

      {/* Workflows */}
      <button
        onClick={() => onNavigate('workflows')}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        title="Flujos"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      </button>

      <div className="flex-1" />

      {/* Search */}
      <button
        className="flex items-center justify-center w-8 h-8 rounded-full border text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        style={{ borderColor: '#e5e7eb' }}
        title="Buscar"
      >
        <IconSearch size={13} />
      </button>

      {/* Settings */}
      <button
        onClick={() => onNavigate('settings')}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        title="Configuración"
      >
        <IconSettings />
      </button>

      {/* Help */}
      <button
        className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        title="Ayuda"
      >
        <IconHelp />
      </button>

      {/* Avatar */}
      <div className="relative mt-1">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold" style={{ background: '#6366f1' }}>H</div>
        <span className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold">1</span>
      </div>
    </div>
  );
}

// ─── Component: Inbox Navigation Panel ───────────────────────────────────────
interface InboxNavProps {
  activeNavItem: string;
  onNavItem: (id: string) => void;
}

function InboxNav({ activeNavItem, onNavItem }: InboxNavProps) {
  const [finExpanded, setFinExpanded] = useState(true);
  const [showConfigTooltip, setShowConfigTooltip] = useState(true);

  return (
    <div
      className="flex flex-col flex-shrink-0 h-full overflow-y-auto"
      style={{ width: 220, background: '#fff', borderRight: '1px solid #e5e7eb' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="font-semibold text-gray-900 text-base">Inbox</span>
        <div className="flex items-center gap-1">
          <button className="p-1 rounded hover:bg-gray-100 text-gray-500"><IconPlus /></button>
          <button className="p-1 rounded hover:bg-gray-100 text-gray-500"><IconSearch size={13} /></button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-gray-400" style={{ background: '#f3f4f6' }}>
          <IconSearch size={13} />
          <span>Buscar</span>
        </div>
      </div>

      {/* Main nav items */}
      <div className="flex flex-col gap-px px-2">
        {NAV_ITEMS_MAIN.map(item => (
          <button
            key={item.id}
            onClick={() => onNavItem(item.id)}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm w-full text-left transition-colors ${
              activeNavItem === item.id
                ? 'bg-indigo-50 text-indigo-700 font-medium'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="text-gray-400 flex-shrink-0">
              {item.icon && <NavIcon id={item.icon} />}
            </span>
            <span className="flex-1 truncate">{item.label}</span>
            {item.count !== undefined && (
              <span className={`text-xs ${item.count > 0 ? 'font-semibold text-gray-700' : 'text-gray-400'}`}>
                {item.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Fin para servicio */}
      <div className="mt-3 px-2">
        <button
          onClick={() => setFinExpanded(!finExpanded)}
          className="flex items-center justify-between w-full px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700"
        >
          <span>Fin para servicio</span>
          <div className="flex items-center gap-1">
            <span className="text-gray-400 hover:text-gray-600"><IconPlus size={12} /></span>
            {finExpanded ? <IconChevronDown /> : <IconChevronRight />}
          </div>
        </button>
        {finExpanded && (
          <div className="flex flex-col gap-px mt-1">
            {NAV_ITEMS_FIN.map(item => (
              <button
                key={item.id}
                onClick={() => onNavItem(item.id)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm w-full text-left transition-colors ${
                  activeNavItem === item.id
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="text-gray-400 flex-shrink-0">
                  {item.icon && <NavIcon id={item.icon} />}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Inbox para el equipo */}
      <div className="mt-2 px-2">
        <button className="flex items-center justify-between w-full px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700">
          <span>Inbox para el equipo</span>
          <div className="flex items-center gap-1">
            <span className="text-gray-400 hover:text-gray-600"><IconPlus size={12} /></span>
            <IconChevronRight />
          </div>
        </button>
      </div>

      {/* Compañeros de equipo */}
      <div className="mt-1 px-2">
        <button className="flex items-center justify-between w-full px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700">
          <span>Compañeros de equipo</span>
          <div className="flex items-center gap-1">
            <span className="text-gray-400 hover:text-gray-600"><IconPlus size={12} /></span>
            <IconChevronRight />
          </div>
        </button>
      </div>

      <div className="flex-1" />

      {/* Configurar tooltip */}
      {showConfigTooltip && (
        <div className="m-3 p-3 rounded-xl shadow-md" style={{ background: '#1f1f1f' }}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-white text-sm font-semibold">Configurar</span>
            </div>
            <button onClick={() => setShowConfigTooltip(false)} className="text-gray-400 hover:text-white text-xs">✕</button>
          </div>
          <p className="text-gray-400 text-xs leading-4">Configura canales para comunicarte con tus clientes</p>
        </div>
      )}
    </div>
  );
}

// ─── Component: Conversation List ─────────────────────────────────────────────
interface ConvListProps {
  selected: string;
  onSelect: (id: string) => void;
}

function ConversationList({ selected, onSelect }: ConvListProps) {
  return (
    <div
      className="flex flex-col flex-shrink-0 h-full overflow-y-auto"
      style={{ width: 245, background: '#fff', borderRight: '1px solid #e5e7eb' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="font-semibold text-gray-900 text-sm leading-tight">Hector Vidal<br />Sanchez</span>
        <div className="flex items-center gap-1">
          <button className="p-1 rounded hover:bg-gray-100 text-gray-500"><IconSearch size={13} /></button>
        </div>
      </div>

      {/* Sort bar */}
      <div className="flex items-center gap-2 px-4 pb-2 text-xs text-gray-500">
        <span className="font-semibold text-gray-900">4 Abierta</span>
        <span>·</span>
        <span>Última actividad</span>
        <button className="ml-auto text-gray-400 hover:text-gray-600"><IconSort /></button>
        <div className="flex items-center gap-0.5 text-gray-400">
          <IconChevronLeft />
          <IconChevronRight />
        </div>
      </div>

      {/* Conversation items */}
      <div className="flex flex-col">
        {CONVERSATIONS.map(conv => (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`flex items-start gap-3 px-4 py-3 text-left border-b transition-colors ${
              selected === conv.id ? 'bg-indigo-50 border-indigo-100' : 'hover:bg-gray-50 border-gray-100'
            }`}
          >
            <div className={`flex-shrink-0 w-8 h-8 rounded-full ${conv.channelColor} flex items-center justify-center text-white text-sm font-semibold mt-0.5`}>
              {conv.channelInitial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 truncate">{conv.contact}</span>
                <span className="text-xs text-gray-400 flex-shrink-0 ml-1">{conv.time}</span>
              </div>
              <p className="text-xs text-gray-500 truncate mt-0.5">{conv.preview}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Bottom pagination controls */}
      <div className="mt-auto px-4 py-3 flex items-center gap-2 border-t border-gray-100">
        <button className="flex items-center justify-center w-7 h-7 rounded border border-gray-200 text-gray-400 hover:bg-gray-50">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
          </svg>
        </button>
        <button className="flex items-center justify-center w-7 h-7 rounded border border-gray-200 text-gray-400 hover:bg-gray-50">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Component: Conversation View ─────────────────────────────────────────────
interface ConvViewProps {
  conv: typeof CONVERSATIONS[0];
}

function ConversationView({ conv }: ConvViewProps) {
  const [showDropdown, setShowDropdown] = useState(false);

  const menuItems = [
    { icon: <IconPersonAdd />, label: 'Administrar participantes' },
    { icon: <IconMerge />, label: 'Fusionar con...', shortcut: 'Ctrl Shift M' },
    { icon: <IconNewConv />, label: 'Nueva conversación' },
    { icon: <IconDownload />, label: 'Exportar conversación como texto' },
    { icon: <IconDownload />, label: 'Exportar conversación como PDF' },
    { icon: <IconEye />, label: 'Mostrar eventos de conversación', shortcut: 'Ctrl Shift E' },
  ];

  return (
    <div className="flex flex-col flex-1 min-w-0 h-full" style={{ background: '#fff' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <span className="font-semibold text-gray-900">{conv.channel}</span>
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><IconStar /></button>
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className={`p-1.5 rounded hover:bg-gray-100 text-gray-400 ${showDropdown ? 'bg-gray-100' : ''}`}
            >
              <IconDots />
            </button>
            {showDropdown && (
              <div
                className="absolute right-0 top-full mt-1 w-64 rounded-xl shadow-lg border border-gray-100 bg-white py-1 z-50"
                onMouseLeave={() => setShowDropdown(false)}
              >
                {menuItems.map((item, i) => (
                  <button
                    key={i}
                    className="flex items-center gap-3 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
                  >
                    <span className="text-gray-400 flex-shrink-0">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.shortcut && (
                      <span className="text-xs text-gray-400">{item.shortcut}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><IconGrid /></button>
          <button className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><IconMoon /></button>
          <button className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center text-white text-xs font-bold">H</button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4" onClick={() => setShowDropdown(false)}>
        {conv.messages.map(msg => (
          <div key={msg.id} className="flex flex-col gap-3">
            {/* Message bubble */}
            <div className="rounded-xl border border-gray-100 p-4 text-sm text-gray-700 leading-relaxed max-w-lg" style={{ background: '#f9fafb' }}>
              {msg.content.split('\n\n').map((para, i) => (
                <p key={i} className={i > 0 ? 'mt-3' : ''}>{para}</p>
              ))}
              {msg.link && (
                <a href={msg.link.href} className="text-indigo-600 underline mt-2 block">{msg.link.label}</a>
              )}
            </div>
            {/* Timestamp */}
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full ${msg.avatarColor} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                {msg.avatar}
              </div>
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <span>💬</span> {msg.time}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Reply bar */}
      <div className="border-t border-gray-100 flex-shrink-0" onClick={() => setShowDropdown(false)}>
        {/* Mode selector */}
        <div className="flex items-center px-4 py-2 border-b border-gray-100">
          <button className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900">
            <IconReply />
            <span>Responder</span>
            <IconChevronDown2 />
          </button>
        </div>
        {/* Composer */}
        <div className="px-4 py-3">
          <div className="text-sm text-gray-400 mb-3">Usa Ctrl+K para atajos</div>
          <div className="flex items-center justify-between">
            <button className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
              <IconBolt />
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50">
              <IconSend />
              <span>Enviar</span>
              <IconChevronDown2 />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Component: Right Info Panel ──────────────────────────────────────────────
interface RightPanelProps {
  tab: RightTab;
  onTab: (t: RightTab) => void;
  conv: typeof CONVERSATIONS[0];
}

function RightPanel({ tab, onTab, conv }: RightPanelProps) {
  const [linksExpanded, setLinksExpanded] = useState(true);
  const [atribExpanded, setAtribExpanded] = useState(true);
  const [datosExpanded, setDatosExpanded] = useState(true);

  return (
    <div
      className="flex flex-col flex-shrink-0 h-full overflow-y-auto"
      style={{ width: 280, background: '#fff', borderLeft: '1px solid #e5e7eb' }}
    >
      {/* Tabs */}
      <div className="flex items-center border-b border-gray-100">
        <div className="flex items-center flex-1">
          <button
            onClick={() => onTab('informacion')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'informacion'
                ? 'border-orange-400 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Información
          </button>
          <button
            onClick={() => onTab('copilot')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'copilot'
                ? 'border-orange-400 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Copilot
          </button>
        </div>
        <div className="flex items-center gap-1 px-3">
          <button className="p-1 rounded hover:bg-gray-100 text-gray-400"><IconExternalLink /></button>
          <button className="p-1 rounded hover:bg-gray-100 text-gray-400"><IconSplitView /></button>
        </div>
      </div>

      {tab === 'informacion' ? (
        <div className="flex flex-col overflow-y-auto">
          {/* Asignación */}
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
              <span>Persona asignada</span>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-white text-[10px] font-bold">H</div>
                <span className="text-gray-700 font-medium">Hector Vidal Sanche</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Inbox para el equipo</span>
              <button className="flex items-center gap-1 text-gray-500 hover:text-gray-700">
                <span className="text-gray-400"><IconUser /></span>
                <span>Sin asignar</span>
              </button>
            </div>
          </div>

          {/* Enlaces */}
          <div className="border-b border-gray-100">
            <button
              onClick={() => setLinksExpanded(!linksExpanded)}
              className="flex items-center justify-between w-full px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-400"><IconLinkIcon /></span>
                <span>Enlaces</span>
              </div>
              {linksExpanded ? <IconChevronDown /> : <IconChevronRight />}
            </button>
            {linksExpanded && (
              <div className="px-4 pb-3 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Folio de atención de seguimiento</span>
                  <button className="text-gray-400 hover:text-gray-700"><IconPlus size={12} /></button>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Folios de atención de back-office</span>
                  <button className="text-gray-400 hover:text-gray-700"><IconPlus size={12} /></button>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Conversaciones secundarias</span>
                  <button className="text-gray-400 hover:text-gray-700"><IconPlus size={12} /></button>
                </div>
              </div>
            )}
          </div>

          {/* Atributos de conversación */}
          <div className="border-b border-gray-100">
            <button
              onClick={() => setAtribExpanded(!atribExpanded)}
              className="flex items-center justify-between w-full px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-400">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
                </span>
                <span>Atributos de conversación</span>
              </div>
              {atribExpanded ? <IconChevronDown /> : <IconChevronRight />}
            </button>
            {atribExpanded && (
              <div className="px-4 pb-3 flex flex-col gap-2">
                {[
                  { label: 'Título de IA', value: '—' },
                  { label: 'ID', value: '215474178470870' },
                  { label: 'Empresa', value: '[Demo]', icon: <IconBuilding /> },
                  { label: 'Marca', value: 'Acme' },
                  { label: 'Tema', value: null, action: '+ Agregar' },
                  { label: 'CX Score rating', value: '—' },
                  { label: 'CX Score explanat...', value: '—' },
                ].map((row, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{row.label}</span>
                    <div className="flex items-center gap-1 text-xs text-gray-700 font-medium">
                      {row.icon && <span className="text-gray-400">{row.icon}</span>}
                      {row.action
                        ? <button className="text-xs text-indigo-600 hover:text-indigo-800">{row.action}</button>
                        : <span>{row.value}</span>
                      }
                    </div>
                  </div>
                ))}
                <button className="text-xs text-indigo-600 hover:text-indigo-800 text-left mt-1">Ver todo</button>
              </div>
            )}
          </div>

          {/* Temas */}
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-900">Temas</span>
            </div>
            <button className="flex items-center justify-center w-6 h-6 rounded border border-gray-200 text-gray-400 hover:bg-gray-50 text-sm">+</button>
          </div>

          {/* Datos del usuario */}
          <div className="border-b border-gray-100">
            <button
              onClick={() => setDatosExpanded(!datosExpanded)}
              className="flex items-center justify-between w-full px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-400"><IconUser /></span>
                <span>Datos del usuario</span>
              </div>
              {datosExpanded ? <IconChevronDown /> : <IconChevronRight />}
            </button>
            {datosExpanded && (
              <div className="px-4 pb-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Nombre</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-700 font-medium">{conv.channel}</span>
                    <button className="text-gray-400 hover:text-gray-600">
                      <IconDots />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Empresa</span>
                  <span className="text-xs text-gray-700 font-medium">[Demo]</span>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Copilot tab */
        <div className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <h3 className="font-semibold text-gray-900 text-sm mb-2">Hola, qué tal?</h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Copilot no pudo encontrar una respuesta en el centro de conocimiento de su equipo o en el historial de conversaciones. Por favor, reformule o{' '}
              <a href="#" className="text-indigo-600 underline">agregue contenido</a> para ayudar a Copilot a responder más preguntas.
            </p>
            <button className="mt-3 text-sm text-indigo-600 font-medium hover:text-indigo-800">
              2 fuentes que podrían ayudar →
            </button>
          </div>
          {/* Copilot input */}
          <div className="border-t border-gray-100 px-4 py-3 flex items-center gap-2">
            <input
              type="text"
              placeholder="Haz una pregunta de seguimiento..."
              className="flex-1 text-sm text-gray-700 outline-none placeholder-gray-400"
            />
            <button className="text-gray-400 hover:text-gray-600">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <line x1="17" y1="10" x2="3" y2="10" /><line x1="21" y1="6" x2="3" y2="6" /><line x1="21" y1="14" x2="3" y2="14" /><line x1="17" y1="18" x2="3" y2="18" />
              </svg>
            </button>
            <button className="text-indigo-600 hover:text-indigo-800">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Inbox Component ─────────────────────────────────────────────────────
interface InboxProps {
  focusCaseId?: string | null;
  onNavigate?: (page: string) => void;
}

export default function Inbox({ focusCaseId, onNavigate }: InboxProps) {
  const [activeNavItem, setActiveNavItem] = useState('bandeja');
  const [selectedConv, setSelectedConv] = useState(CONVERSATIONS[0].id);
  const [rightTab, setRightTab] = useState<RightTab>('informacion');

  const currentConv = CONVERSATIONS.find(c => c.id === selectedConv) ?? CONVERSATIONS[0];

  const handleNavigate = (page: string) => {
    if (onNavigate) onNavigate(page);
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      {/* Trial banner */}
      <TrialBanner />

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Icon sidebar */}
        <IconSidebar onNavigate={handleNavigate} />

        {/* Inbox navigation */}
        <InboxNav activeNavItem={activeNavItem} onNavItem={setActiveNavItem} />

        {/* Conversation list */}
        <ConversationList selected={selectedConv} onSelect={setSelectedConv} />

        {/* Conversation detail */}
        <ConversationView conv={currentConv} />

        {/* Right info panel */}
        <RightPanel tab={rightTab} onTab={setRightTab} conv={currentConv} />
      </div>
    </div>
  );
}
