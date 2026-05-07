import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ProfileTab from './profile/ProfileTab';
import AccessPermissionsTab from './profile/AccessPermissionsTab';
import SecurityTab from './profile/SecurityTab';
import NotificationsTab from './profile/NotificationsTab';
import PreferencesTab from './profile/PreferencesTab';
import ActivityTab from './profile/ActivityTab';
import { iamApi } from '../api/client';
import { useApi } from '../api/hooks';
import { NavigateInput } from '../types';

type ProfileTabType =
  | 'profile'
  | 'security'
  | 'notifications'
  | 'preferences'
  | 'activity'
  | 'access_permissions';

type ProfileProps = {
  onNavigate?: (target: NavigateInput) => void;
  initialSection?: string | null;
};

const TABS: { id: ProfileTabType; label: string }[] = [
  { id: 'profile',            label: 'Información personal' },
  { id: 'security',           label: 'Seguridad' },
  { id: 'notifications',      label: 'Notificaciones' },
  { id: 'preferences',        label: 'Preferencias' },
  { id: 'activity',           label: 'Actividad' },
  { id: 'access_permissions', label: 'Acceso y permisos' },
];

// Unified profile page — replaces the previous MinimalCategoryShell layout
// with a two-column Inbox-style shell:
//   • Left column (220 px): pill-style nav, matches the Inbox secondary
//     sidebar (h-9 px-3 rounded-md, active is bg-#1a1a1a / white text).
//   • Right column: scrollable content for the active tab.
//
// On top sits a header card with avatar / name / role / email / "Editar"
// shortcut that jumps to the personal info tab. Fin tokens throughout
// (#e9eae6 dividers, #f8f8f7 hover, 13px body, rounded-[12px] cards).
export default function Profile({ onNavigate, initialSection }: ProfileProps) {
  const [activeTab, setActiveTab] = useState<ProfileTabType>('profile');
  const [saveHandler, setSaveHandlerRaw] = useState<null | (() => Promise<void> | void)>(null);
  const [discardTick, setDiscardTick] = useState(0);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  // Functional setState wrapper. CRITICAL: when storing a function in state via
  // setState, React treats a bare function value as the updater function (it
  // would invoke handleSave(prevState) instead of storing it). Tabs call this
  // with their async save handler each render — without this wrapper React
  // would execute the handler on every render and create an infinite
  // re-render loop that hammers the backend on every click.
  const setSaveHandler = useCallback((h: (() => Promise<void> | void) | null) => {
    setSaveHandlerRaw(() => h);
  }, []);

  // Pull user once at the shell level so the header card has avatar/name/role
  // without each tab re-fetching just to render its own breadcrumb.
  const { data: user } = useApi<any>(iamApi.me, []);

  useEffect(() => {
    setSaveHandler(null);
  }, [activeTab, setSaveHandler]);

  useEffect(() => {
    if (!initialSection) return;
    if (TABS.some(t => t.id === initialSection)) {
      setActiveTab(initialSection as ProfileTabType);
    }
  }, [initialSection]);

  const dismissTimer = useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  void dismissTimer;

  const handleSave = useCallback(async () => {
    if (!saveHandler) return;
    try {
      await saveHandler();
      setToast({ message: 'Cambios guardados.', tone: 'success' });
    } catch (err: any) {
      setToast({ message: err?.message || 'No se pudieron guardar los cambios.', tone: 'error' });
    }
  }, [saveHandler]);

  const handleDiscard = useCallback(() => {
    setDiscardTick(t => t + 1);
    setSaveHandler(null);
    setToast({ message: 'Cambios descartados.', tone: 'success' });
  }, [setSaveHandler]);

  const headerInfo = useMemo(() => {
    const u = user || {};
    const role = u?.memberships?.[0]?.role_name || u?.role || '—';
    const initials = String(u.name || u.email || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s: string) => s.charAt(0).toUpperCase())
      .join('') || '?';
    return {
      name: u.name || 'Sin nombre',
      email: u.email || '—',
      role,
      avatarUrl: u.avatar_url || '',
      initials,
    };
  }, [user]);

  return (
    <div className="h-full w-full flex flex-col bg-white">
      {/* ── Header card — avatar / name / role / email / Editar ─────────── */}
      <div className="flex-shrink-0 border-b border-[#e9eae6] px-6 pt-5 pb-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full overflow-hidden bg-[#f8f8f7] border border-[#e9eae6] flex items-center justify-center flex-shrink-0">
            {headerInfo.avatarUrl ? (
              <img src={headerInfo.avatarUrl} alt={headerInfo.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-[18px] font-semibold text-[#646462]">{headerInfo.initials}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-[16px] font-semibold text-[#1a1a1a] truncate">{headerInfo.name}</h1>
              <span className="inline-flex items-center h-5 px-2 rounded-full bg-[#f4f4ff] border border-[#dadbf3] text-[10.5px] font-semibold text-[#3b59f6] uppercase tracking-wide">
                {headerInfo.role}
              </span>
            </div>
            <p className="text-[12.5px] text-[#646462] mt-0.5 truncate">{headerInfo.email}</p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className="h-8 px-3 rounded-md bg-[#1a1a1a] text-white text-[12.5px] font-semibold hover:bg-[#000]"
          >
            Editar
          </button>
        </div>
      </div>

      {/* ── Two-column body ────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex">
        {/* Left nav */}
        <nav className="w-[220px] flex-shrink-0 border-r border-[#e9eae6] py-3 px-2 overflow-y-auto bg-[#f3f3f1]">
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`w-full h-9 px-3 rounded-lg flex items-center text-[13px] text-left transition-colors mt-0.5 ${
                  active
                    ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]'
                    : 'font-medium text-[#1a1a1a] hover:bg-white/60'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Right content */}
        <main className="flex-1 min-w-0 overflow-y-auto bg-white">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeTab}-${discardTick}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="pb-32"
            >
              {activeTab === 'profile'            && <ProfileTab            onSaveReady={setSaveHandler} />}
              {activeTab === 'security'           && <SecurityTab           onSaveReady={setSaveHandler} />}
              {activeTab === 'notifications'      && <NotificationsTab      onSaveReady={setSaveHandler} />}
              {activeTab === 'preferences'        && <PreferencesTab        onSaveReady={setSaveHandler} />}
              {activeTab === 'activity'           && <ActivityTab           onNavigate={onNavigate} />}
              {activeTab === 'access_permissions' && <AccessPermissionsTab  />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* ── Floating Save / Discard bar (visible when a tab registers a save handler) ── */}
      <AnimatePresence>
        {saveHandler && (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 bg-[#1a1a1a] text-white rounded-full shadow-lg flex items-center gap-2 pl-4 pr-1 py-1"
          >
            <span className="text-[12.5px]">Tienes cambios sin guardar</span>
            <button
              type="button"
              onClick={handleDiscard}
              className="h-7 px-3 rounded-full text-[12px] text-white/80 hover:text-white hover:bg-white/10"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={() => { void handleSave(); }}
              className="h-7 px-3 rounded-full bg-white text-[#1a1a1a] text-[12px] font-semibold hover:bg-[#f0f0f0]"
            >
              Guardar
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className={`absolute bottom-20 right-6 z-30 px-3 py-2 rounded-md text-[12.5px] font-medium shadow-md ${
              toast.tone === 'error'
                ? 'bg-[#fee2e2] text-[#b91c1c] border border-[#fecaca]'
                : 'bg-[#dcfce7] text-[#166534] border border-[#bbf7d0]'
            }`}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
