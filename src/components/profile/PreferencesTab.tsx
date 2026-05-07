import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/hooks';
import { iamApi } from '../../api/client';
import LoadingState from '../LoadingState';
import { DetailSection, DetailRow } from './sections';

type SaveHandler = (() => Promise<void> | void) | null;
type Props = { onSaveReady?: (handler: SaveHandler) => void };

const FALLBACK_USER = { preferences: {}, name: '', email: '' };

function parsePreferences(prefs: any): Record<string, any> {
  if (!prefs) return {};
  if (typeof prefs === 'string') {
    try { return JSON.parse(prefs); } catch { return {}; }
  }
  return prefs;
}

function ToggleRow({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? 'bg-[#1a1a1a]' : 'bg-[#e9eae6]'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${value ? 'translate-x-5' : 'translate-x-1'}`} />
    </button>
  );
}

function InlineSelect({
  value, onChange, options,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full h-7 text-[13px] px-2 rounded-md border border-transparent bg-transparent text-[#1a1a1a] hover:bg-[#f8f8f7] focus:border-[#1a1a1a] focus:bg-white focus:outline-none"
    >
      {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  );
}

const THEMES = [
  { value: 'light',  label: 'Claro' },
  { value: 'dark',   label: 'Oscuro' },
  { value: 'system', label: 'Sistema' },
];
const DENSITIES = [
  { value: 'comfortable', label: 'Cómoda' },
  { value: 'compact',     label: 'Compacta' },
];
const LANGUAGES = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'pt', label: 'Português' },
];
const DATE_FORMATS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/AAAA (31/12/2026)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/AAAA (12/31/2026)' },
  { value: 'YYYY-MM-DD', label: 'AAAA-MM-DD (2026-12-31)' },
];
const TIME_FORMATS = [
  { value: '24h', label: '24 horas (14:30)' },
  { value: '12h', label: '12 horas (2:30 PM)' },
];
const FIRST_DAYS = [
  { value: 'monday', label: 'Lunes' },
  { value: 'sunday', label: 'Domingo' },
];

const VISIBLE_SHORTCUTS = [
  ['⌘ + K',         'Abrir buscador'],
  ['⌘ + /',         'Abrir Copilot'],
  ['G luego I',     'Ir a Inbox'],
  ['G luego R',     'Ir a Reports'],
  ['E',             'Editar caso enfocado'],
  ['Esc',           'Cerrar diálogo'],
];

export default function PreferencesTab({ onSaveReady }: Props) {
  const { data: user, loading } = useApi<any>(iamApi.me);
  const currentUser = user || FALLBACK_USER;
  const preferences = useMemo(() => parsePreferences(currentUser?.preferences), [currentUser]);
  // Memoise — `preferences.ui || {}` creates a new {} every render when no UI
  // prefs are stored, which makes `handleSave`/`hasChanges` unstable and causes
  // an infinite re-render loop via the parent's setSaveHandler (looks like a
  // page reload to the user).
  const ui = useMemo<Record<string, any>>(() => preferences.ui || {}, [preferences]);

  const [theme, setTheme]               = useState('system');
  const [density, setDensity]           = useState('comfortable');
  const [language, setLanguage]         = useState('es');
  const [dateFormat, setDateFormat]     = useState('DD/MM/YYYY');
  const [timeFormat, setTimeFormat]     = useState('24h');
  const [firstDayOfWeek, setFirstDay]   = useState('monday');
  const [shortcutsEnabled, setShortcuts] = useState(true);

  useEffect(() => {
    setTheme(ui.theme || 'system');
    setDensity(ui.density || 'comfortable');
    setLanguage(ui.language || preferences.profile?.language || 'es');
    setDateFormat(ui.dateFormat || 'DD/MM/YYYY');
    setTimeFormat(ui.timeFormat || '24h');
    setFirstDay(ui.firstDayOfWeek || 'monday');
    setShortcuts(ui.shortcutsEnabled ?? true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const handleSave = useCallback(async () => {
    await iamApi.updateMe({
      preferences: {
        ...preferences,
        ui: {
          ...ui,
          theme,
          density,
          language,
          dateFormat,
          timeFormat,
          firstDayOfWeek,
          shortcutsEnabled,
        },
      },
    });
  }, [preferences, ui, theme, density, language, dateFormat, timeFormat, firstDayOfWeek, shortcutsEnabled]);

  const hasChanges = useMemo(() => {
    return (
      theme !== (ui.theme || 'system') ||
      density !== (ui.density || 'comfortable') ||
      language !== (ui.language || preferences.profile?.language || 'es') ||
      dateFormat !== (ui.dateFormat || 'DD/MM/YYYY') ||
      timeFormat !== (ui.timeFormat || '24h') ||
      firstDayOfWeek !== (ui.firstDayOfWeek || 'monday') ||
      shortcutsEnabled !== (ui.shortcutsEnabled ?? true)
    );
  }, [theme, density, language, dateFormat, timeFormat, firstDayOfWeek, shortcutsEnabled, ui, preferences]);

  useEffect(() => {
    onSaveReady?.(hasChanges ? handleSave : null);
    return () => onSaveReady?.(null);
  }, [hasChanges, handleSave, onSaveReady]);

  if (loading) return <LoadingState title="Cargando preferencias" message="Recuperando tus ajustes." compact />;

  return (
    <div className="py-3">
      <DetailSection title="Apariencia">
        <DetailRow label="Tema">
          <InlineSelect value={theme} onChange={setTheme} options={THEMES} />
        </DetailRow>
        <DetailRow label="Densidad">
          <InlineSelect value={density} onChange={setDensity} options={DENSITIES} />
        </DetailRow>
      </DetailSection>

      <DetailSection title="Idioma y región">
        <DetailRow label="Idioma">
          <InlineSelect value={language} onChange={setLanguage} options={LANGUAGES} />
        </DetailRow>
        <DetailRow label="Formato de fecha">
          <InlineSelect value={dateFormat} onChange={setDateFormat} options={DATE_FORMATS} />
        </DetailRow>
        <DetailRow label="Formato de hora">
          <InlineSelect value={timeFormat} onChange={setTimeFormat} options={TIME_FORMATS} />
        </DetailRow>
        <DetailRow label="Primer día">
          <InlineSelect value={firstDayOfWeek} onChange={setFirstDay} options={FIRST_DAYS} />
        </DetailRow>
      </DetailSection>

      <DetailSection title="Atajos de teclado" helper="Acelera tu trabajo con accesos rápidos.">
        <DetailRow label="Habilitar atajos">
          <ToggleRow value={shortcutsEnabled} onChange={setShortcuts} />
        </DetailRow>
        <div className="mt-2 grid grid-cols-2 gap-y-1.5 gap-x-4">
          {VISIBLE_SHORTCUTS.map(([key, desc]) => (
            <div key={key} className="flex items-center gap-2 min-w-0">
              <code className="inline-flex items-center h-5 px-1.5 rounded border border-[#e9eae6] bg-[#f8f8f7] text-[10.5px] font-mono text-[#1a1a1a] flex-shrink-0">
                {key}
              </code>
              <span className="text-[12.5px] text-[#646462] truncate">{desc}</span>
            </div>
          ))}
        </div>
      </DetailSection>
    </div>
  );
}
