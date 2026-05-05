import React, { useState } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────────
type ContactSection = 'all_users' | 'all_leads' | 'active' | 'new';

// ─── Mock data ─────────────────────────────────────────────────────────────────
const DEMO_USERS = [
  { id: '1', name: 'Email en [Demo]', avatar: 'E', color: 'bg-red-500', lastSeen: '39 minutes ago', type: 'Usuario', med: 0, city: '' },
  { id: '2', name: 'Messenger en [Demo]', avatar: 'M', color: 'bg-teal-500', lastSeen: '39 minutes ago', type: 'Usuario', med: 0, city: '' },
  { id: '3', name: 'Phone & SMS en [Demo]', avatar: 'P', color: 'bg-purple-500', lastSeen: '39 minutes ago', type: 'Usuario', med: 0, city: '' },
  { id: '4', name: 'WhatsApp & Social en [Demo]', avatar: 'W', color: 'bg-green-500', lastSeen: '39 minutes ago', type: 'Usuario', med: 0, city: '' },
];

// ─── SVG Icons ─────────────────────────────────────────────────────────────────
const IconSearch = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
  </svg>
);
const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const IconChevronDown = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
const IconChevronRight = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const IconGrid = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
  </svg>
);
const IconList = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);
const IconInfo = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);
const IconX = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IconSortDown = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
const IconExternalLink = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

// ─── Shared icon sidebar icons (same as Inbox) ─────────────────────────────────
const IconInboxSidebar = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
  </svg>
);
const IconUsers = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
  </svg>
);
const IconBot = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <path d="M12 11V7" /><circle cx="12" cy="5" r="2" />
    <line x1="8" y1="15" x2="8" y2="15" strokeLinecap="round" strokeWidth="2.5" />
    <line x1="16" y1="15" x2="16" y2="15" strokeLinecap="round" strokeWidth="2.5" />
    <path d="M8 19h8" />
  </svg>
);
const IconBarChart = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
  </svg>
);
const IconZap = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);
const IconSearchCircle = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
  </svg>
);
const IconSettings = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);
const IconHelpCircle = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

// ─── Trial Banner ──────────────────────────────────────────────────────────────
const TrialBanner = () => (
  <div style={{ backgroundColor: '#f0eeff', borderBottom: '1px solid #e4e0fb' }}
    className="flex items-center justify-between px-4 py-1.5 shrink-0 text-xs">
    <span className="text-gray-700">
      Quedan <strong>14 días</strong> en tu{' '}
      <a href="#" className="underline text-gray-700">prueba de Advanced</a>.{' '}
      Incluye uso ilimitado de Fin.
    </span>
    <span className="text-gray-700">
      Solicita un descuento del <strong>93 %</strong> en la Early Stage.
    </span>
    <button className="bg-gray-900 text-white text-xs font-medium px-3 py-1.5 rounded-full">
      Comprar Intercom
    </button>
  </div>
);

// ─── Icon Sidebar (identical to Inbox) ────────────────────────────────────────
const IconSidebar = ({ onNavigate }: { onNavigate?: (page: string) => void }) => (
  <div className="flex flex-col items-center bg-white border-r border-gray-100 shrink-0 py-2 gap-1"
    style={{ width: 44 }}>
    {/* Logo */}
    <div className="w-7 h-7 rounded-md bg-gray-900 flex items-center justify-center mb-2 shrink-0">
      <span className="text-white text-xs font-bold">C</span>
    </div>
    {/* Inbox */}
    <button
      onClick={() => onNavigate?.('inbox')}
      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 relative"
      title="Inbox">
      <IconInboxSidebar />
      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">4</span>
    </button>
    {/* Contacts (active) */}
    <button
      className="w-8 h-8 flex items-center justify-center rounded-lg text-indigo-600 relative"
      style={{ backgroundColor: '#ede9fe' }}
      title="Contactos">
      <IconUsers />
    </button>
    {/* AI Studio */}
    <button className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100" title="AI Studio">
      <IconBot />
    </button>
    {/* Reports */}
    <button className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100" title="Informes">
      <IconBarChart />
    </button>
    {/* Workflows */}
    <button className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100" title="Flujos">
      <IconZap />
    </button>
    {/* Spacer */}
    <div className="flex-1" />
    {/* Search */}
    <button className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" title="Buscar">
      <IconSearchCircle />
    </button>
    {/* Settings */}
    <button
      onClick={() => onNavigate?.('settings')}
      className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" title="Configuración">
      <IconSettings />
    </button>
    {/* Help */}
    <button className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" title="Ayuda">
      <IconHelpCircle />
    </button>
    {/* Avatar */}
    <div className="relative mt-1">
      <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-semibold">H</div>
      <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center">1</span>
    </div>
  </div>
);

// ─── Contacts Nav (left sidebar) ───────────────────────────────────────────────
const ContactsNav = ({
  activeSection,
  onSelect,
}: {
  activeSection: ContactSection;
  onSelect: (s: ContactSection) => void;
}) => {
  const [personasOpen, setPersonasOpen] = useState(true);
  const [empresasOpen, setEmpresasOpen] = useState(false);
  const [conversacionesOpen, setConversacionesOpen] = useState(false);

  const navItem = (id: ContactSection, label: string, count: number) => (
    <button
      key={id}
      onClick={() => onSelect(id)}
      className={`w-full flex items-center justify-between px-3 py-1 rounded-md text-sm transition-colors ${
        activeSection === id
          ? 'bg-gray-100 text-gray-900 font-medium'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      <span className="truncate">{label}</span>
      <span className={`text-xs ml-2 shrink-0 ${activeSection === id ? 'text-gray-700' : 'text-gray-400'}`}>{count}</span>
    </button>
  );

  return (
    <div className="bg-white border-r border-gray-100 flex flex-col overflow-y-auto shrink-0" style={{ width: 220 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="font-semibold text-gray-900 text-sm">Contactos</span>
        <button className="text-gray-400 hover:text-gray-600">
          <IconSearch />
        </button>
      </div>

      {/* Personas section */}
      <div className="px-2 pt-3 pb-1">
        <button
          onClick={() => setPersonasOpen(!personasOpen)}
          className="w-full flex items-center justify-between px-2 mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-600"
        >
          <div className="flex items-center gap-1">
            {personasOpen ? <IconChevronDown /> : <IconChevronRight />}
            <span>Personas:</span>
          </div>
          <button className="text-gray-400 hover:text-gray-600 p-0.5 rounded"><IconPlus /></button>
        </button>
        {personasOpen && (
          <div className="space-y-0.5">
            {navItem('all_users', 'All users', 4)}
            {navItem('all_leads', 'All leads', 0)}
            {navItem('active', 'Active', 0)}
            {navItem('new', 'New', 0)}
          </div>
        )}
      </div>

      {/* Empresas section */}
      <div className="px-2 pt-2 pb-1">
        <button
          onClick={() => setEmpresasOpen(!empresasOpen)}
          className="w-full flex items-center justify-between px-2 mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-600"
        >
          <div className="flex items-center gap-1">
            {empresasOpen ? <IconChevronDown /> : <IconChevronRight />}
            <span>Empresas</span>
          </div>
          <button className="text-gray-400 hover:text-gray-600 p-0.5 rounded"><IconPlus /></button>
        </button>
      </div>

      {/* Conversaciones section */}
      <div className="px-2 pt-1 pb-1">
        <button
          onClick={() => setConversacionesOpen(!conversacionesOpen)}
          className="w-full flex items-center justify-between px-2 mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-600"
        >
          <div className="flex items-center gap-1">
            {conversacionesOpen ? <IconChevronDown /> : <IconChevronRight />}
            <span>Conversaciones</span>
          </div>
        </button>
      </div>
    </div>
  );
};

// ─── Onboarding Card ───────────────────────────────────────────────────────────
const OnboardingCard = ({ onDismiss }: { onDismiss: () => void }) => (
  <div className="mx-6 mt-4 rounded-xl border border-gray-200 bg-white overflow-hidden flex" style={{ minHeight: 160 }}>
    {/* Left content */}
    <div className="flex-1 p-5">
      <h2 className="text-base font-semibold text-gray-900 mb-2">
        Importa tus contactos para una experiencia personalizada
      </h2>
      <p className="text-xs text-gray-500 mb-3 leading-relaxed">
        Ve los perfiles empresariales o de usuario, y segmenta tus contactos según las acciones que
        realicen. Integra con más fuentes de datos en nuestra tienda de aplicaciones. Cuando estés
        listo, comienza a segmentar a tus clientes de manera más efectiva con mensajes salientes,
        Fin AI Agent y flujos de trabajo.
      </p>
      <div className="space-y-1">
        {[
          'Comienza a usar los contactos',
          'Seguimiento y agrupación de los clientes',
          'Uso de aplicaciones e integraciones',
          'Visita nuestra tienda de aplicaciones',
        ].map((link) => (
          <div key={link} className="flex items-center gap-1.5">
            <IconExternalLink />
            <a href="#" className="text-xs text-indigo-600 hover:underline">{link}</a>
          </div>
        ))}
      </div>
    </div>
    {/* Right user data card */}
    <div className="shrink-0 flex items-center justify-end p-4" style={{ width: 220 }}>
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-3 w-full">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 mb-2" />
        <div className="text-[11px] font-semibold text-gray-500 mb-1.5">USER DATA</div>
        {[
          ['Name', 'Luis Easttin'],
          ['Company', 'Acme'],
          ['Location', 'London'],
          ['Plan', 'Premium'],
          ['Lifetime value', '$456'],
          ['# of projects', '234'],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between text-[10px] py-0.5 border-b border-gray-50 last:border-0">
            <span className="text-gray-400">{k}</span>
            <span className="text-gray-700 font-medium">{v}</span>
          </div>
        ))}
      </div>
    </div>
    {/* Dismiss button */}
    <button
      onClick={onDismiss}
      className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
    >
      <IconX size={16} />
    </button>
  </div>
);

// ─── Contacts Main ─────────────────────────────────────────────────────────────
const ContactsMain = ({
  section,
  onNavigate,
}: {
  section: ContactSection;
  onNavigate?: (page: string) => void;
}) => {
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  const sectionLabels: Record<ContactSection, string> = {
    all_users: 'All users',
    all_leads: 'All leads',
    active: 'Active',
    new: 'New',
  };

  const users = section === 'all_users' || section === 'active' ? DEMO_USERS : [];
  const allSelected = users.length > 0 && selectedRows.length === users.length;

  const toggleAll = () => setSelectedRows(allSelected ? [] : users.map((u) => u.id));
  const toggleRow = (id: string) =>
    setSelectedRows((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: '#f9f9f7' }}>
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-xs">▣</span>
          <span className="font-semibold text-gray-900 text-sm">{sectionLabels[section]}</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
            Aprender
            <IconChevronDown />
          </button>
          <button className="flex items-center gap-1.5 text-xs text-white font-medium rounded-lg px-3 py-1.5"
            style={{ backgroundColor: '#1a7f4b' }}>
            Nuevos usuarios o leads
            <IconChevronDown />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Onboarding card */}
        {showOnboarding && (
          <div className="relative">
            <OnboardingCard onDismiss={() => setShowOnboarding(false)} />
          </div>
        )}

        {/* Filter bar */}
        <div className="px-6 pt-4 pb-2 flex items-center gap-2">
          {section === 'active' && (
            <div className="flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs rounded-full px-2.5 py-1 border border-indigo-100">
              <span>Last seen less than 30 days ago</span>
              <button className="ml-1 hover:text-indigo-900"><IconX size={10} /></button>
            </div>
          )}
          <div className="flex items-center gap-1 text-xs text-gray-500">
            {section === 'all_leads' || section === 'new' ? (
              <span className="font-medium text-gray-700">Leads</span>
            ) : (
              <span className="font-medium text-gray-700">Usuarios</span>
            )}
          </div>
          <button className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
            <span className="text-indigo-500">+</span>
            <span className="text-indigo-500">Añadir filtro</span>
          </button>
        </div>

        {users.length === 0 ? (
          /* Empty state */
          <div className="px-6 pb-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-sm font-medium text-gray-500">Ningún lead coincide</span>
              <button className="flex items-center gap-1.5 text-xs text-indigo-600 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z" /></svg>
                Nuevo mensaje
              </button>
            </div>
            <p className="text-xs text-gray-400">No hay leads que coincidan con los filtros actuales.</p>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="px-6 pb-2 flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">{users.length} usuarios</span>
              <div className="flex items-center gap-1 ml-2">
                <button className="flex items-center gap-1.5 text-xs text-indigo-600 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-50">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z" /></svg>
                  Nuevo mensaje
                </button>
                <button className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
                  Añadir etiqueta
                </button>
                <button className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
                  Más
                  <IconChevronDown />
                </button>
              </div>
              <div className="flex-1" />
              {/* View toggles */}
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                <button className="p-1.5 bg-white hover:bg-gray-50 text-gray-500 border-r border-gray-200">
                  <IconGrid />
                </button>
                <button className="p-1.5 bg-gray-100 text-gray-700">
                  <IconList />
                </button>
              </div>
              <button className="p-1.5 text-gray-400 hover:text-gray-600">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
                </svg>
              </button>
            </div>

            {/* Identity warning bar */}
            <div className="mx-6 mb-3 flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-800">
              <IconInfo />
              <span>
                Exige la verificación de identidad para proteger las conversaciones con los clientes y evitar la suplantación de identidad.{' '}
                <a href="#" className="underline font-medium">Configurar verificación de identidad</a>.
              </span>
            </div>

            {/* Users table */}
            <div className="mx-6 bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="w-8 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600 min-w-[160px]">
                      <div className="flex items-center gap-1">Nombre <IconSortDown /></div>
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">
                      <div className="flex items-center gap-1">Last seen <IconSortDown /></div>
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Type</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600 truncate max-w-[80px]">
                      <div className="flex items-center gap-1">Last seen</div>
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">med</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">up</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">sAES</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">city</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, i) => (
                    <tr
                      key={user.id}
                      className={`border-b border-gray-50 hover:bg-gray-50 cursor-pointer ${
                        selectedRows.includes(user.id) ? 'bg-indigo-50/40' : ''
                      } ${i === users.length - 1 ? 'border-0' : ''}`}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selectedRows.includes(user.id)}
                          onChange={() => toggleRow(user.id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-full ${user.color} text-white flex items-center justify-center font-medium text-[10px] shrink-0`}>
                            {user.avatar}
                          </div>
                          <span className="text-gray-900 font-medium truncate">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-gray-500">{user.lastSeen}</td>
                      <td className="px-3 py-2.5 text-gray-500">{user.type}</td>
                      <td className="px-3 py-2.5 text-gray-500">{user.lastSeen}</td>
                      <td className="px-3 py-2.5 text-gray-500">{user.med}</td>
                      <td className="px-3 py-2.5 text-gray-500">0</td>
                      <td className="px-3 py-2.5 text-gray-400 text-[10px] max-w-[100px] truncate">
                        {i === 0 ? 'Hi 🙋 How can I help you?' : ''}
                      </td>
                      <td className="px-3 py-2.5 text-gray-400">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Intercom chat widget */}
      <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2">
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3 w-52 text-xs">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-sm">👋</span>
            <span className="text-gray-700 font-medium">Hi 🙋 How can I help you?</span>
          </div>
          <div className="text-[10px] text-gray-400 mb-2">Fin · 40 min</div>
          <div className="space-y-1.5">
            {['Chat with a product expert', 'Learn more about Intercom'].map((opt) => (
              <button key={opt} className="w-full text-left text-xs text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50">
                {opt}
              </button>
            ))}
          </div>
        </div>
        <button className="w-10 h-10 rounded-full text-white flex items-center justify-center shadow-lg"
          style={{ backgroundColor: '#1f1f1f' }}>
          <span className="text-lg">💬</span>
        </button>
      </div>
    </div>
  );
};

// ─── Main Contacts Component ───────────────────────────────────────────────────
interface ContactsProps {
  onNavigate?: (page: string) => void;
}

export default function Contacts({ onNavigate }: ContactsProps) {
  const [activeSection, setActiveSection] = useState<ContactSection>('all_users');

  return (
    <div className="h-full flex flex-col overflow-hidden font-sans" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <TrialBanner />
      <div className="flex-1 flex overflow-hidden relative">
        <IconSidebar onNavigate={onNavigate} />
        <ContactsNav activeSection={activeSection} onSelect={setActiveSection} />
        <ContactsMain section={activeSection} onNavigate={onNavigate} />
      </div>
    </div>
  );
}
