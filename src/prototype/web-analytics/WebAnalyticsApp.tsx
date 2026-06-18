/**
 * src/prototype/web-analytics/WebAnalyticsScreen.tsx
 *
 * Clain Web Analytics module — structural parity with PostHog's
 * frontend/src/scenes/web-analytics/* scenes. Single module so it can be
 * dropped into Prototype.tsx with one import.
 *
 * Every widget hits POST /api/environments/{tid}/query/ with the typed
 * `kind` payload (WebOverviewQuery, WebStatsTableQuery, WebVitalsQuery,
 * WebVitalsPathBreakdownQuery, WebPageURLSearchQuery, WebGoalsQuery,
 * WebExternalClicksTableQuery, WebActiveHoursHeatMapQuery, plus
 * InsightVizNode+TrendsQuery for the trends chart). All helpers live in
 * src/api/posthog.ts::posthog.webAnalytics.
 *
 * Design tokens follow the Clain Settings language: rounded-xl cards,
 * border 1px #e9eae6, neutral #fafaf9 hover, blue accent #3b59f6 for
 * active state, orange #e8572a for the primary action.
 */

import { useState, useEffect, useRef, useLayoutEffect, useCallback, type ReactNode, type CSSProperties } from 'react';
import { TaxonomicFilterButton, TaxonomicGroupType, TaxonomicFilterValue } from '../charts/TaxonomicFilter';

// ─────────────────────────────────────────────────────────────────────────────
// Types & date-range presets
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'webAnalytics' | 'webVitals' | 'pageReports' | 'marketing' | 'crossDomain' | 'conversionGoals';

type SamplingMode = 'auto' | 'full' | 'tenth';

interface DateRangePreset {
  label:     string;
  date_from: string;
  date_to?:  string | null;
  /** Equivalent prior period for compare-to-previous. */
  compare_to?: string;
  /** Default trends bucket. */
  interval:  'hour' | 'day' | 'week' | 'month';
}

const WA_DATE_PRESETS: DateRangePreset[] = [
  { label: 'Hoy',              date_from: 'dStart',  interval: 'hour' },
  { label: 'Ayer',             date_from: '-1dStart', date_to: '-1dEnd', interval: 'hour' },
  { label: 'Últimas 24 horas', date_from: '-24h',    interval: 'hour' },
  { label: 'Últimos 7 días',   date_from: '-7d',     interval: 'day' },
  { label: 'Últimos 14 días',  date_from: '-14d',    interval: 'day' },
  { label: 'Últimos 30 días',  date_from: '-30d',    interval: 'day' },
  { label: 'Últimos 90 días',  date_from: '-90d',    interval: 'week' },
  { label: 'Últimos 180 días', date_from: '-180d',   interval: 'week' },
  { label: 'Este mes',         date_from: 'mStart',  interval: 'day' },
  { label: 'Este año',         date_from: 'yStart',  interval: 'month' },
  { label: 'Todo el tiempo',   date_from: 'all',     interval: 'month' },
];

interface PropertyFilter {
  key:      string;
  value:    any;
  operator: string;
  type:     'event' | 'person' | 'session' | 'group';
  label?:   string;
}

interface WebFilterState {
  range:         DateRangePreset;
  compare:       boolean;
  properties:    PropertyFilter[];
  hosts:         string[];
  testAccounts:  boolean;
  sampling:      SamplingMode;
  pathCleaning:  boolean;
  device:        DeviceFilter;
  graphMetric:   GraphMetric;
}

const DEFAULT_FILTERS: WebFilterState = {
  range:         WA_DATE_PRESETS[5],
  compare:       false,
  properties:    [],
  hosts:         [],
  testAccounts:  false,
  sampling:      'auto',
  pathCleaning:  true,
  device:        'all',
  graphMetric:   'UNIQUE_USERS',
};

// ─────────────────────────────────────────────────────────────────────────────
// Query-input builders — fold hosts + sampling into every PostHog call.
// ─────────────────────────────────────────────────────────────────────────────

function buildProperties(f: WebFilterState): any[] {
  const props: any[] = [...f.properties];
  if (f.hosts.length === 1) {
    props.push({ key: '$host', value: f.hosts[0], operator: 'exact', type: 'event', label: 'Host' });
  } else if (f.hosts.length > 1) {
    props.push({ key: '$host', value: f.hosts, operator: 'exact', type: 'event', label: 'Host' });
  }
  if (f.device && f.device !== 'all') {
    const map: Record<DeviceFilter, string[]> = {
      all:     [],
      desktop: ['Desktop'],
      mobile:  ['Mobile'],
      tablet:  ['Tablet'],
    };
    const v = map[f.device];
    if (v.length) props.push({ key: '$device_type', value: v, operator: 'exact', type: 'event', label: 'Dispositivo' });
  }
  return props;
}

function buildSampling(f: WebFilterState): { enabled: boolean; forceSamplingRate?: { numerator: number; denominator: number } } | undefined {
  if (f.sampling === 'auto')  return undefined;
  if (f.sampling === 'full')  return { enabled: false };
  if (f.sampling === 'tenth') return { enabled: true, forceSamplingRate: { numerator: 1, denominator: 10 } };
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtNum(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return v.toLocaleString('es-ES', { maximumFractionDigits: 1 });
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v.toFixed(1)}%`;
}

function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  const s = Math.round(seconds);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function fmtMillis(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function fmtScore(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toFixed(3);
}

function deltaPct(curr: number | null | undefined, prev: number | null | undefined): { pct: number; up: boolean } | null {
  if (curr == null || prev == null || prev === 0) return null;
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  return { pct: Math.abs(pct), up: pct >= 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic small UI primitives
// ─────────────────────────────────────────────────────────────────────────────

function Spinner({ size = 4 }: { size?: number }) {
  return <div className={`w-${size} h-${size} border-2 border-[#3b59f6] border-t-transparent rounded-full animate-spin`} />;
}

function Card({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-[#e9eae6] rounded-xl overflow-hidden ${className}`}>
      {(title || action) && (
        <div className="px-4 py-3 border-b border-[#e9eae6] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1a1a18]">{title}</h3>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="text-center py-10 text-[#9ca3af]">
      {icon ?? <svg viewBox="0 0 24 24" className="w-8 h-8 mx-auto mb-2 text-[#c4c4be]"><path d="M3 13l2-6h14l2 6M3 13v5a1 1 0 001 1h16a1 1 0 001-1v-5M3 13h6l1 2h4l1-2h6" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>}
      <p className="text-sm font-medium text-[#1a1a18]">{title}</p>
      {hint && <p className="text-xs mt-1">{hint}</p>}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="text-center py-8">
      <p className="text-sm font-medium text-[#dc2626] mb-1">Error al cargar</p>
      <p className="text-xs text-[#646462] mb-3 max-w-md mx-auto break-words">{message}</p>
      {onRetry && <button onClick={onRetry} className="px-3 py-1 bg-[#1a1a18] text-white text-xs rounded-lg">Reintentar</button>}
    </div>
  );
}

function DeltaPill({ d, invert = false }: { d: { pct: number; up: boolean } | null; invert?: boolean }) {
  if (!d) return <span className="text-[10px] text-[#9ca3af]">—</span>;
  const good = invert ? !d.up : d.up;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium ${good ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#fee2e2] text-[#991b1b]'}`}>
      <svg viewBox="0 0 8 8" className="w-2 h-2"><path d={d.up ? 'M1 5l3-3 3 3' : 'M1 3l3 3 3-3'} stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
      {d.pct.toFixed(1)}%
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Date range button & popover (compare-to-previous)
// ─────────────────────────────────────────────────────────────────────────────

function DateRangeButton({ value, compare, onChange }: { value: DateRangePreset; compare: boolean; onChange: (v: DateRangePreset, compare: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) { if (!ref.current?.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 h-8 px-3 bg-white border border-[#e9eae6] rounded-lg text-[12px] text-[#1a1a18] hover:bg-[#fafaf9]">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-[#646462]"><rect x="2" y="3" width="12" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3"/><path d="M2 6h12M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
        {value.label}
        {compare && <span className="text-[10px] bg-[#eff2ff] text-[#3b59f6] px-1.5 py-0.5 rounded">vs. anterior</span>}
        <svg viewBox="0 0 16 16" className="w-3 h-3 text-[#646462]"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 z-50 bg-white border border-[#e9eae6] rounded-xl shadow-lg overflow-hidden">
          <div className="max-h-80 overflow-y-auto py-1">
            {WA_DATE_PRESETS.map(p => (
              <button key={p.label} onClick={() => { onChange(p, compare); setOpen(false); }} className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[#fafaf9] ${value.label === p.label ? 'text-[#3b59f6] bg-[#eff2ff]' : 'text-[#1a1a18]'}`}>{p.label}</button>
            ))}
          </div>
          <div className="border-t border-[#e9eae6] px-3 py-2 flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-[#1a1a18] cursor-pointer">
              <input type="checkbox" checked={compare} onChange={e => onChange(value, e.target.checked)} className="accent-[#3b59f6]" />
              Comparar con periodo anterior
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sampling rate badge + dropdown
// ─────────────────────────────────────────────────────────────────────────────

function SamplingButton({ mode, onChange }: { mode: SamplingMode; onChange: (m: SamplingMode) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) { if (!ref.current?.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const OPTIONS: { value: SamplingMode; label: string; hint: string; badge: string }[] = [
    { value: 'auto',  label: 'Automático',      hint: 'PostHog decide en función del volumen.',           badge: 'AUTO' },
    { value: 'full',  label: 'Sin sampling',    hint: 'Lee todos los eventos. Más lento, exacto.',         badge: '1/1'  },
    { value: 'tenth', label: 'Sampling 1 de 10',hint: '10× más rápido. Resultados estimados (±error).',    badge: '1/10' },
  ];
  const current = OPTIONS.find(o => o.value === mode) ?? OPTIONS[0];
  const isForced = mode !== 'auto';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 h-8 px-3 bg-white border rounded-lg text-[12px] hover:bg-[#fafaf9] ${isForced ? 'border-[#3b59f6] text-[#3b59f6]' : 'border-[#e9eae6] text-[#646462]'}`}
        title="Tasa de muestreo de las consultas"
      >
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M2 12l3-3 3 3 5-5M11 4h3v3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
        <span>Sampling</span>
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isForced ? 'bg-[#eff2ff] text-[#3b59f6]' : 'bg-[#f3f3f1] text-[#646462]'}`}>{current.badge}</span>
        <svg viewBox="0 0 16 16" className="w-3 h-3 opacity-60"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 z-50 bg-white border border-[#e9eae6] rounded-xl shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-[#e9eae6] text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider">Tasa de muestreo</div>
          {OPTIONS.map(o => {
            const active = o.value === mode;
            return (
              <button key={o.value} onClick={() => { onChange(o.value); setOpen(false); }} className={`w-full text-left px-3 py-2.5 hover:bg-[#fafaf9] flex items-start gap-2 ${active ? 'bg-[#eff2ff]' : ''}`}>
                <span className={`mt-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0 ${active ? 'bg-[#3b59f6] text-white' : 'bg-[#f3f3f1] text-[#646462]'}`}>{o.badge}</span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm font-medium ${active ? 'text-[#3b59f6]' : 'text-[#1a1a18]'}`}>{o.label}</span>
                  <span className="block text-[11px] text-[#9ca3af]">{o.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hosts filter — pinned chips that map to a $host property filter
// ─────────────────────────────────────────────────────────────────────────────

function HostsFilter({ hosts, onChange }: { hosts: string[]; onChange: (h: string[]) => void }) {
  const [open,  setOpen]  = useState(false);
  const [input, setInput] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) { if (!ref.current?.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  function add() {
    const v = input.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!v || hosts.includes(v)) return;
    onChange([...hosts, v]);
    setInput('');
  }
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className={`flex items-center gap-1.5 h-8 px-3 bg-white border rounded-lg text-[12px] hover:bg-[#fafaf9] ${hosts.length ? 'border-[#3b59f6] text-[#3b59f6]' : 'border-[#e9eae6] text-[#646462]'}`}>
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.3"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" stroke="currentColor" strokeWidth="1.3" fill="none"/></svg>
        <span>Hosts</span>
        {hosts.length > 0 && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#eff2ff] text-[#3b59f6]">{hosts.length}</span>}
        <svg viewBox="0 0 16 16" className="w-3 h-3 opacity-60"><path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 z-50 bg-white border border-[#e9eae6] rounded-xl shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-[#e9eae6] text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider">Filtrar por host</div>
          <div className="p-3 space-y-2">
            <div className="flex gap-1.5">
              <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="app.clain.io" className="flex-1 px-2 py-1.5 border border-[#e9eae6] rounded text-xs focus:outline-none focus:border-[#3b59f6]" />
              <button onClick={add} className="px-2.5 py-1.5 bg-[#1a1a18] text-white text-xs rounded hover:bg-[#333]">Añadir</button>
            </div>
            {hosts.length === 0 ? <p className="text-[11px] text-[#9ca3af]">Sin hosts. Por defecto se incluyen todos.</p> : (
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {hosts.map(h => (
                  <li key={h} className="flex items-center justify-between gap-2 px-2 py-1.5 bg-[#fafaf9] rounded text-xs">
                    <span className="text-[#1a1a18] truncate font-mono">{h}</span>
                    <button onClick={() => onChange(hosts.filter(x => x !== h))} className="text-[#9ca3af] hover:text-[#dc2626]"><svg viewBox="0 0 16 16" className="w-3 h-3"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Property filter bar (TaxonomicFilterButton + chips for active filters)
// ─────────────────────────────────────────────────────────────────────────────

function PropertyFilterBar({ filters, onChange }: { filters: PropertyFilter[]; onChange: (next: PropertyFilter[]) => void }) {
  const groupTypes: TaxonomicGroupType[] = ['event_properties', 'person_properties', 'session_properties', 'cohorts', 'feature_flags'];
  const handle = (sel: TaxonomicFilterValue) => {
    const type: PropertyFilter['type'] = sel.type === 'session_properties' ? 'session' : sel.type === 'person_properties' ? 'person' : 'event';
    const next: PropertyFilter = { key: String(sel.value), value: null, operator: 'is_set', type, label: sel.label };
    onChange([...filters, next]);
  };
  function remove(i: number) { onChange(filters.filter((_, idx) => idx !== i)); }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <TaxonomicFilterButton
        taxonomicGroupTypes={groupTypes}
        buttonLabel="Filtrar"
        buttonIcon={<svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M2 3h12M4 8h8M7 13h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}
        onChange={handle}
      />
      {filters.map((f, i) => (
        <span key={i} className="inline-flex items-center gap-1 h-8 px-2.5 bg-[#eff2ff] border border-[#c7d2fe] text-[#3b59f6] rounded-lg text-[12px]">
          <span className="font-medium">{f.label ?? f.key}</span>
          <span className="text-[#3b59f6]/70">{f.operator}</span>
          <button onClick={() => remove(i)} className="ml-1 hover:text-[#1a1a18]"><svg viewBox="0 0 16 16" className="w-2.5 h-2.5"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></button>
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Web Overview KPI tiles — uses WebOverviewQuery
// ─────────────────────────────────────────────────────────────────────────────

interface OverviewItem { key: string; value: number | null; previous: number | null; kind?: 'unit' | 'percentage' | 'duration_s' | 'currency'; isIncreaseBad?: boolean }

const OVERVIEW_LABELS: Record<string, { label: string; format: 'count' | 'percent' | 'duration' | 'currency' }> = {
  'visitors':        { label: 'Visitantes únicos', format: 'count' },
  'views':           { label: 'Páginas vistas',    format: 'count' },
  'sessions':        { label: 'Sesiones',          format: 'count' },
  'bounce rate':     { label: 'Tasa de rebote',    format: 'percent' },
  'session duration':{ label: 'Duración media',    format: 'duration' },
  'pageviews per session': { label: 'Vistas / sesión', format: 'count' },
  'revenue':         { label: 'Ingresos',          format: 'currency' },
  'conversion rate': { label: 'Tasa de conversión',format: 'percent' },
  'total conversions': { label: 'Conversiones',    format: 'count' },
};

function WebOverviewKPIs({ filters }: { filters: WebFilterState }) {
  const [items,   setItems]   = useState<OverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const ph = await import('../../api/posthog');
      if (!ph.getTeamId()) await ph.bootstrapPostHog();
      const res: any = await ph.posthog.webAnalytics.overview({
        dateRange:          { date_from: filters.range.date_from, date_to: filters.range.date_to ?? null },
        properties:         buildProperties(filters),
        compareFilter:      { compare: filters.compare },
        filterTestAccounts: filters.testAccounts,
        includeRevenue:     true,
        sampling:           buildSampling(filters),
      });
      const results: OverviewItem[] = res?.results ?? res?.tiles ?? [];
      setItems(results);
    } catch (e: any) { setError(e?.message ?? 'Error al cargar KPIs'); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="grid grid-cols-5 gap-3">{[0,1,2,3,4].map(i => <div key={i} className="h-24 bg-white border border-[#e9eae6] rounded-xl animate-pulse" />)}</div>;
  if (error)   return <Card><ErrorState message={error} onRetry={load} /></Card>;
  if (!items.length) return <Card><EmptyState title="Sin datos en el rango seleccionado" hint="Prueba a ampliar el rango o quitar filtros." /></Card>;

  const fmt = (it: OverviewItem) => {
    const k = (it.key || '').toLowerCase();
    const meta = OVERVIEW_LABELS[k];
    if (meta?.format === 'percent')  return fmtPct(it.value);
    if (meta?.format === 'duration') return fmtDuration(it.value);
    if (meta?.format === 'currency') return it.value != null ? `${fmtNum(it.value)} €` : '—';
    return fmtNum(it.value);
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {items.slice(0, 10).map((it, i) => {
        const meta = OVERVIEW_LABELS[(it.key || '').toLowerCase()];
        return (
          <div key={i} className="bg-white border border-[#e9eae6] rounded-xl p-4 flex flex-col gap-1.5">
            <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider truncate" title={it.key}>{meta?.label ?? it.key}</p>
            <p className="text-2xl font-bold text-[#1a1a18]">{fmt(it)}</p>
            {filters.compare && <DeltaPill d={deltaPct(it.value, it.previous)} invert={it.isIncreaseBad} />}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Trends chart — wraps webAnalytics.trends (InsightVizNode + TrendsQuery)
// ─────────────────────────────────────────────────────────────────────────────

function WebTrendsChart({ filters }: { filters: WebFilterState }) {
  type Metric = { event: string; name: string; math: 'total' | 'dau' | 'unique_session' };
  const METRICS: Metric[] = [
    { event: '$pageview', name: 'Páginas vistas',      math: 'total' },
    { event: '$pageview', name: 'Visitantes únicos',   math: 'dau' },
    { event: '$pageview', name: 'Sesiones',            math: 'unique_session' },
  ];
  const COLORS = ['#3b59f6', '#e8572a', '#16a34a'];
  const [data,    setData]    = useState<{ labels: string[]; series: { name: string; values: number[]; color: string }[] }>({ labels: [], series: [] });
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const ph = await import('../../api/posthog');
      if (!ph.getTeamId()) await ph.bootstrapPostHog();
      // Single metric (driven by filters.graphMetric, parity with PostHog
      // GraphsTab). When metric is one of the legacy combined ones we still
      // fall back to the 3-series view.
      const selectedMeta = GRAPH_METRICS.find(g => g.key === filters.graphMetric) ?? GRAPH_METRICS[0];
      const seriesIn = [{ event: selectedMeta.event, name: selectedMeta.label, math: selectedMeta.math }];
      const res: any = await ph.posthog.webAnalytics.trends({
        dateRange:    { date_from: filters.range.date_from, date_to: filters.range.date_to ?? null },
        properties:   buildProperties(filters),
        compareFilter:{ compare: filters.compare },
        interval:     filters.range.interval,
        series:       seriesIn,
        filterTestAccounts: filters.testAccounts,
        sampling:     buildSampling(filters),
      });
      const series = (res?.results ?? []).map((s: any, i: number) => ({
        name:   s.label || s.action?.name || seriesIn[i % seriesIn.length]?.name || 'Serie',
        values: (s.data ?? []) as number[],
        color:  COLORS[i % COLORS.length],
      }));
      const labels = (res?.results?.[0]?.labels ?? res?.results?.[0]?.days ?? []) as string[];
      setData({ labels, series });
    } catch (e: any) { setData({ labels: [], series: [] }); setError(e?.message ?? 'Error al cargar tendencias'); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      {loading ? <div className="h-56 bg-[#fafaf9] animate-pulse rounded-lg" /> : error ? <ErrorState message={error} onRetry={load} /> : <MiniLineChart {...data} />}
    </>
  );
}

function MiniLineChart({ labels, series, height = 220 }: { labels: string[]; series: { name: string; values: number[]; color: string }[]; height?: number }) {
  if (!series.length || !series[0]?.values?.length) return <EmptyState title="Sin datos" />;
  const all = series.flatMap(s => s.values);
  const max = Math.max(...all, 1);
  const W   = 600;
  const H   = height;
  const PAD = { l: 38, r: 12, t: 10, b: 26 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const xAt = (i: number) => PAD.l + (labels.length > 1 ? (i * innerW) / (labels.length - 1) : innerW / 2);
  const yAt = (v: number) => PAD.t + innerH - (v / max) * innerH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
      {[0, 0.25, 0.5, 0.75, 1].map(f => {
        const y = PAD.t + innerH * (1 - f);
        return (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="#f3f3f1" strokeWidth="1" />
            <text x={PAD.l - 6} y={y + 3} fontSize="9" textAnchor="end" fill="#9ca3af">{fmtNum(max * f)}</text>
          </g>
        );
      })}
      {series.map((s, si) => {
        const d = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(v)}`).join(' ');
        return <path key={si} d={d} stroke={s.color} strokeWidth="1.6" fill="none" strokeLinejoin="round" />;
      })}
      {labels.length > 0 && labels.map((l, i) => {
        if (labels.length > 12 && i % Math.ceil(labels.length / 8) !== 0) return null;
        return <text key={i} x={xAt(i)} y={H - 8} fontSize="9" textAnchor="middle" fill="#9ca3af">{l}</text>;
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Web Stats Table — uses WebStatsTableQuery with breakdownBy selector
// ─────────────────────────────────────────────────────────────────────────────

// PostHog parity — full WebStatsBreakdown enum (25 values).
type BreakdownBy =
  | 'Page' | 'InitialPage' | 'ExitPage' | 'ExitClick' | 'PreviousPage' | 'NextPage' | 'ScreenName'
  | 'InitialChannelType' | 'InitialReferringDomain' | 'InitialReferringURL'
  | 'InitialUTMSource' | 'InitialUTMMedium' | 'InitialUTMCampaign' | 'InitialUTMTerm' | 'InitialUTMContent' | 'InitialUTMSourceMediumCampaign'
  | 'Browser' | 'OS' | 'DeviceType' | 'Viewport' | 'Language'
  | 'Country' | 'Region' | 'City' | 'Timezone'
  | 'FrustrationMetrics';

const BREAKDOWNS: { key: BreakdownBy; label: string; group: 'paths' | 'sources' | 'geography' | 'device' }[] = [
  { key: 'Page',                            label: 'Páginas',             group: 'paths' },
  { key: 'InitialPage',                     label: 'Página de entrada',   group: 'paths' },
  { key: 'ExitPage',                        label: 'Página de salida',    group: 'paths' },
  { key: 'ExitClick',                       label: 'Click de salida',     group: 'paths' },
  { key: 'PreviousPage',                    label: 'Página anterior',     group: 'paths' },
  { key: 'NextPage',                        label: 'Página siguiente',    group: 'paths' },
  { key: 'ScreenName',                      label: 'Pantalla (mobile)',   group: 'paths' },

  { key: 'InitialChannelType',              label: 'Canales',             group: 'sources' },
  { key: 'InitialReferringDomain',          label: 'Dominio referido',    group: 'sources' },
  { key: 'InitialReferringURL',             label: 'URL referido',        group: 'sources' },
  { key: 'InitialUTMSource',                label: 'UTM source',          group: 'sources' },
  { key: 'InitialUTMMedium',                label: 'UTM medium',          group: 'sources' },
  { key: 'InitialUTMCampaign',              label: 'UTM campaign',        group: 'sources' },
  { key: 'InitialUTMTerm',                  label: 'UTM term',            group: 'sources' },
  { key: 'InitialUTMContent',               label: 'UTM content',         group: 'sources' },
  { key: 'InitialUTMSourceMediumCampaign',  label: 'UTM Source/Medium/Campaign', group: 'sources' },

  { key: 'Country',                         label: 'Países',              group: 'geography' },
  { key: 'Region',                          label: 'Regiones',            group: 'geography' },
  { key: 'City',                            label: 'Ciudades',            group: 'geography' },
  { key: 'Timezone',                        label: 'Zonas horarias',      group: 'geography' },
  { key: 'Language',                        label: 'Idiomas',             group: 'geography' },

  { key: 'Browser',                         label: 'Navegadores',         group: 'device' },
  { key: 'OS',                              label: 'Sistemas',            group: 'device' },
  { key: 'DeviceType',                      label: 'Dispositivos',        group: 'device' },
  { key: 'Viewport',                        label: 'Viewports',           group: 'device' },
];

// Per-tile viz toggle — parity with PostHog TileVisualizationOption.
type TileViz = 'table' | 'graph';

// Graphs tab metrics — parity with PostHog GraphsTab enum (8 metrics).
type GraphMetric = 'UNIQUE_USERS' | 'PAGE_VIEWS' | 'NUM_SESSION' | 'SESSION_DURATION' | 'BOUNCE_RATE' | 'UNIQUE_CONVERSIONS' | 'TOTAL_CONVERSIONS' | 'CONVERSION_RATE';
const GRAPH_METRICS: { key: GraphMetric; label: string; event: string; math: string; format: 'count' | 'percent' | 'duration' }[] = [
  { key: 'UNIQUE_USERS',       label: 'Visitantes únicos',  event: '$pageview', math: 'dau',            format: 'count' },
  { key: 'PAGE_VIEWS',         label: 'Páginas vistas',     event: '$pageview', math: 'total',          format: 'count' },
  { key: 'NUM_SESSION',        label: 'Sesiones',           event: '$pageview', math: 'unique_session', format: 'count' },
  { key: 'SESSION_DURATION',   label: 'Duración sesión',    event: '$pageview', math: 'session_duration_p50', format: 'duration' },
  { key: 'BOUNCE_RATE',        label: 'Tasa de rebote',     event: '$pageview', math: 'bounce_rate',    format: 'percent' },
  { key: 'UNIQUE_CONVERSIONS', label: 'Conversiones únicas',event: '$pageview', math: 'unique_conversion', format: 'count' },
  { key: 'TOTAL_CONVERSIONS',  label: 'Conversiones totales',event: '$pageview', math: 'total_conversion', format: 'count' },
  { key: 'CONVERSION_RATE',    label: 'Tasa de conversión', event: '$pageview', math: 'conversion_rate',format: 'percent' },
];

// Device segmented (Desktop/Mobile/All) — parity with toolbar device toggle.
type DeviceFilter = 'all' | 'desktop' | 'mobile' | 'tablet';
const DEVICE_OPTIONS: { k: DeviceFilter; l: string }[] = [
  { k: 'all',     l: 'Todos' },
  { k: 'desktop', l: 'Escritorio' },
  { k: 'mobile',  l: 'Móvil' },
  { k: 'tablet',  l: 'Tablet' },
];

// Visible tiles — parity with PostHog "Visible tiles" menu section. Persisted
// in localStorage so el usuario puede esconder tiles del overview.
type VisibleTile = 'overview' | 'graphs' | 'paths' | 'sources' | 'devices' | 'geography' | 'retention' | 'activeHours' | 'goals' | 'replay' | 'errorTracking' | 'frustratingPages' | 'externalClicks';
const ALL_TILES: { k: VisibleTile; l: string }[] = [
  { k: 'overview',         l: 'KPIs principales' },
  { k: 'graphs',           l: 'Gráficas de tendencia' },
  { k: 'paths',            l: 'Páginas y rutas' },
  { k: 'sources',          l: 'Fuentes y canales' },
  { k: 'devices',          l: 'Dispositivos y navegadores' },
  { k: 'geography',        l: 'Geografía' },
  { k: 'retention',        l: 'Retención' },
  { k: 'activeHours',      l: 'Horas activas' },
  { k: 'goals',            l: 'Objetivos de conversión' },
  { k: 'frustratingPages', l: 'Páginas frustrantes' },
  { k: 'externalClicks',   l: 'Enlaces externos' },
  { k: 'replay',           l: 'Session replays' },
  { k: 'errorTracking',    l: 'Error tracking' },
];

function readVisibleTiles(): Record<VisibleTile, boolean> {
  const def: Record<string, boolean> = {};
  ALL_TILES.forEach(t => { def[t.k] = true; });
  try { const raw = localStorage.getItem('wa:visibleTiles'); if (raw) return { ...def, ...JSON.parse(raw) } as any; } catch {}
  return def as any;
}
function writeVisibleTiles(v: Record<VisibleTile, boolean>) { try { localStorage.setItem('wa:visibleTiles', JSON.stringify(v)); } catch {} }

function WebStatsTable({ filters, defaultBreakdown = 'Page', onRowClick, onShowMore }: { filters: WebFilterState; defaultBreakdown?: BreakdownBy; onRowClick?: (key: string, breakdown: BreakdownBy) => void; onShowMore?: (b: BreakdownBy, title: string) => void }) {
  const [breakdown, setBreakdown] = useState<BreakdownBy>(defaultBreakdown);
  const [viz,       setViz]       = useState<TileViz>('table');
  const [rows,      setRows]      = useState<any[]>([]);
  const [columns,   setColumns]   = useState<string[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const ph = await import('../../api/posthog');
      if (!ph.getTeamId()) await ph.bootstrapPostHog();
      const res: any = await ph.posthog.webAnalytics.statsTable({
        breakdownBy: breakdown,
        dateRange:   { date_from: filters.range.date_from, date_to: filters.range.date_to ?? null },
        properties:  buildProperties(filters),
        compareFilter:{ compare: filters.compare },
        includeBounceRate:  breakdown === 'Page' || breakdown === 'InitialPage' || breakdown === 'ExitPage',
        includeScrollDepth: breakdown === 'Page' || breakdown === 'InitialPage' || breakdown === 'ExitPage',
        doPathCleaning:     filters.pathCleaning,
        filterTestAccounts: filters.testAccounts,
        limit:       20,
        sampling:    buildSampling(filters),
      });
      setColumns(res?.columns ?? []);
      setRows(res?.results ?? []);
    } catch (e: any) { setRows([]); setError(e?.message ?? 'Error al cargar desglose'); }
    finally { setLoading(false); }
  }, [filters, breakdown]);

  useEffect(() => { load(); }, [load]);

  const groups = Array.from(new Set(BREAKDOWNS.map(b => b.group)));
  const breakdownMeta = BREAKDOWNS.find(b => b.key === breakdown);
  const tileTitle = breakdownMeta?.label ?? 'Desglose';

  function exportCsv() {
    const header = columns.join(',');
    const body = rows.map(r => (Array.isArray(r) ? r : Object.values(r)).map(c => {
      if (c == null) return '';
      const s = typeof c === 'object' ? JSON.stringify(c) : String(c);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${tileTitle.replace(/\s+/g, '_').toLowerCase()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function openInsight() {
    openAsNewInsight(`WA · ${tileTitle}`, {
      kind: 'WebStatsTableQuery',
      breakdownBy:  breakdown,
      dateRange:    { date_from: filters.range.date_from, date_to: filters.range.date_to ?? null },
      properties:   buildProperties(filters),
      doPathCleaning: filters.pathCleaning,
      filterTestAccounts: filters.testAccounts,
    });
  }

  return (
    <TileFrame
      title={tileTitle}
      vizMode={viz} onVizChange={setViz}
      onShowMore={onShowMore ? () => onShowMore(breakdown, tileTitle) : undefined}
      onOpenInsight={openInsight}
      onExport={rows.length > 0 ? exportCsv : undefined}
      rightExtra={
        <div className="flex items-center gap-1 text-xs">
          {groups.map(g => {
            const inGroup = BREAKDOWNS.filter(b => b.group === g);
            const isActive = inGroup.some(b => b.key === breakdown);
            return (
              <div key={g} className="relative">
                <BreakdownGroupSelect group={g} items={inGroup} value={breakdown} active={isActive} onChange={setBreakdown} />
              </div>
            );
          })}
        </div>
      }
    >
      {loading ? <div className="space-y-2">{[0,1,2,3,4].map(i => <div key={i} className="h-7 bg-[#fafaf9] animate-pulse rounded" />)}</div> : error ? <ErrorState message={error} onRetry={load} /> : rows.length === 0 ? <EmptyState title="Sin datos" /> : (
        <table className="w-full">
          <thead>
            <tr className="text-left text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider border-b border-[#e9eae6]">
              {columns.slice(0, 5).map((c, i) => <th key={i} className="py-2 pr-3">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 20).map((r, i) => {
              const key = String(Array.isArray(r) ? r[0] : r.breakdown_value ?? r[0] ?? '');
              const cells: any[] = Array.isArray(r) ? r : Object.values(r);
              return (
                <tr key={i} onClick={() => onRowClick?.(key, breakdown)} className={`border-b border-[#f3f3f1] last:border-b-0 ${onRowClick ? 'hover:bg-[#fafaf9] cursor-pointer' : ''}`}>
                  {cells.slice(0, 5).map((c, ci) => {
                    let v: ReactNode = '—';
                    if (ci === 0) v = <span className="text-sm text-[#1a1a18] truncate max-w-[300px] inline-block">{String(c ?? '—')}</span>;
                    else if (typeof c === 'number') v = <span className="text-xs text-[#646462] font-mono">{ci >= 3 ? fmtPct(c) : fmtNum(c)}</span>;
                    else if (Array.isArray(c)) v = <span className="text-xs text-[#646462] font-mono">{fmtNum(c[0])}</span>;
                    else v = <span className="text-xs text-[#646462]">{String(c ?? '—')}</span>;
                    return <td key={ci} className="py-2 pr-3">{v}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {viz === 'graph' && !loading && rows.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {(() => {
            const max = rows.reduce((m, r) => {
              const cells = Array.isArray(r) ? r : Object.values(r);
              const v = Number(Array.isArray(cells[1]) ? cells[1][0] : cells[1] ?? 0);
              return v > m ? v : m;
            }, 0) || 1;
            return rows.slice(0, 15).map((r, i) => {
              const cells = Array.isArray(r) ? r : Object.values(r);
              const label = String(cells[0] ?? '—');
              const value = Number(Array.isArray(cells[1]) ? cells[1][0] : cells[1] ?? 0);
              const pct = (value / max) * 100;
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-[#1a1a18] truncate w-40 flex-shrink-0">{label}</span>
                  <div className="flex-1 h-5 bg-[#fafaf9] rounded overflow-hidden relative">
                    <div className="absolute inset-y-0 left-0 bg-[#3b59f6]/30" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-[#646462] font-mono w-16 text-right">{fmtNum(value)}</span>
                </div>
              );
            });
          })()}
        </div>
      )}
    </TileFrame>
  );
}

function BreakdownGroupSelect({ group, items, value, active, onChange }: { group: string; items: { key: BreakdownBy; label: string }[]; value: BreakdownBy; active: boolean; onChange: (v: BreakdownBy) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) { if (!ref.current?.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  const label: Record<string, string> = { paths: 'Páginas', sources: 'Fuentes', geography: 'Geografía', device: 'Tecnología' };
  const current = items.find(i => i.key === value)?.label;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap ${active ? 'bg-[#eff2ff] text-[#3b59f6] font-medium' : 'text-[#646462] hover:bg-[#fafaf9]'}`}>
        {active && current ? `${label[group]} · ${current}` : label[group]}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 z-40 bg-white border border-[#e9eae6] rounded-xl shadow-lg py-1">
          {items.map(it => (
            <button key={it.key} onClick={() => { onChange(it.key); setOpen(false); }} className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[#fafaf9] ${value === it.key ? 'text-[#3b59f6] bg-[#eff2ff]' : 'text-[#1a1a18]'}`}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversion goals widget — uses WebGoalsQuery
// ─────────────────────────────────────────────────────────────────────────────

function WebGoalsWidget({ filters }: { filters: WebFilterState }) {
  const [rows,    setRows]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const ph = await import('../../api/posthog');
      if (!ph.getTeamId()) await ph.bootstrapPostHog();
      const res: any = await ph.posthog.webAnalytics.goals({
        dateRange:   { date_from: filters.range.date_from, date_to: filters.range.date_to ?? null },
        properties:  buildProperties(filters),
        compareFilter:{ compare: filters.compare },
        filterTestAccounts: filters.testAccounts,
        limit:       10,
        sampling:    buildSampling(filters),
      });
      setRows(res?.results ?? []);
    } catch (e: any) { setRows([]); setError(e?.message ?? 'Error al cargar objetivos'); }
    finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  return (
    <Card title="Objetivos de conversión">
      {loading ? <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-6 bg-[#fafaf9] animate-pulse rounded" />)}</div>
       : error ? <ErrorState message={error} onRetry={load} />
       : rows.length === 0 ? <EmptyState title="Aún no hay objetivos configurados" hint="Define tus objetivos en Ajustes → Web Analytics." />
       : (
        <table className="w-full">
          <thead><tr className="text-left text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider border-b border-[#e9eae6]"><th className="py-2 pr-3">Objetivo</th><th className="py-2 pr-3">Conversiones</th><th className="py-2 pr-3">Tasa</th></tr></thead>
          <tbody>
            {rows.slice(0, 10).map((r, i) => {
              const cells: any[] = Array.isArray(r) ? r : Object.values(r);
              return (
                <tr key={i} className="border-b border-[#f3f3f1] last:border-b-0">
                  <td className="py-2 pr-3 text-sm text-[#1a1a18] truncate max-w-[260px]">{String(cells[0] ?? '—')}</td>
                  <td className="py-2 pr-3 text-xs text-[#646462] font-mono">{fmtNum(Number(cells[1]))}</td>
                  <td className="py-2 pr-3 text-xs text-[#646462] font-mono">{typeof cells[2] === 'number' ? fmtPct(cells[2] as number) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// External clicks widget — uses WebExternalClicksTableQuery
// ─────────────────────────────────────────────────────────────────────────────

function WebExternalClicksWidget({ filters }: { filters: WebFilterState }) {
  const [rows,    setRows]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const ph = await import('../../api/posthog');
      if (!ph.getTeamId()) await ph.bootstrapPostHog();
      const res: any = await ph.posthog.webAnalytics.externalClicks({
        dateRange:          { date_from: filters.range.date_from, date_to: filters.range.date_to ?? null },
        properties:         buildProperties(filters),
        compareFilter:      { compare: filters.compare },
        filterTestAccounts: filters.testAccounts,
        stripQueryParams:   true,
        limit:              15,
        sampling:           buildSampling(filters),
      });
      setRows(res?.results ?? []);
    } catch (e: any) { setRows([]); setError(e?.message ?? 'Error al cargar enlaces'); }
    finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);
  return (
    <Card title="Enlaces externos">
      {loading ? <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-6 bg-[#fafaf9] animate-pulse rounded" />)}</div>
       : error ? <ErrorState message={error} onRetry={load} />
       : rows.length === 0 ? <EmptyState title="Sin clics salientes registrados" />
       : (
        <ul className="space-y-1">
          {rows.slice(0, 15).map((r, i) => {
            const cells: any[] = Array.isArray(r) ? r : Object.values(r);
            return <li key={i} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-[#fafaf9]">
              <span className="text-xs text-[#1a1a18] truncate flex-1">{String(cells[0] ?? '—')}</span>
              <span className="text-xs text-[#646462] font-mono">{fmtNum(Number(cells[1] ?? 0))}</span>
            </li>;
          })}
        </ul>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Active hours heatmap — uses WebActiveHoursHeatMapQuery
// ─────────────────────────────────────────────────────────────────────────────

function WebActiveHoursHeatmap({ filters }: { filters: WebFilterState }) {
  const [grid,    setGrid]    = useState<number[][]>([]);
  const [max,     setMax]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const ph = await import('../../api/posthog');
      if (!ph.getTeamId()) await ph.bootstrapPostHog();
      const res: any = await ph.posthog.webAnalytics.activeHoursHeatmap({
        dateRange:          { date_from: filters.range.date_from, date_to: filters.range.date_to ?? null },
        properties:         buildProperties(filters),
        filterTestAccounts: filters.testAccounts,
        sampling:           buildSampling(filters),
      });
      const g: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
      let m = 0;
      for (const row of (res?.results ?? [])) {
        const [dow, hour, count] = Array.isArray(row) ? row : [row.day, row.hour, row.value];
        const d = Number(dow), h = Number(hour), c = Number(count);
        if (Number.isFinite(d) && Number.isFinite(h) && d >= 0 && d < 7 && h >= 0 && h < 24) {
          g[d][h] = c;
          if (c > m) m = c;
        }
      }
      setGrid(g); setMax(m);
    } catch (e: any) { setGrid([]); setMax(0); setError(e?.message ?? 'Error al cargar heatmap'); }
    finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  return (
    <Card title="Horas activas">
      {loading ? <div className="h-44 bg-[#fafaf9] animate-pulse rounded" />
       : error ? <ErrorState message={error} onRetry={load} />
       : grid.length === 0 || max === 0 ? <EmptyState title="Sin datos suficientes" />
       : (
        <div>
          <div className="flex items-center gap-1">
            <div className="w-6" />
            {Array.from({ length: 24 }).map((_, h) => h % 6 === 0 ? <span key={h} className="text-[9px] text-[#9ca3af] w-[3.5%] text-center">{h}h</span> : <span key={h} className="w-[3.5%]" />)}
          </div>
          {grid.map((row, d) => (
            <div key={d} className="flex items-center gap-1 mt-1">
              <span className="text-[10px] font-medium text-[#9ca3af] w-6">{DAYS[d]}</span>
              {row.map((v, h) => {
                const intensity = max ? v / max : 0;
                const bg = intensity === 0 ? '#f9f9f7' : `rgba(232, 87, 42, ${0.15 + intensity * 0.85})`;
                return <span key={h} title={`${DAYS[d]} ${h}h — ${fmtNum(v)}`} className="w-[3.5%] h-5 rounded-sm" style={{ backgroundColor: bg }} />;
              })}
            </div>
          ))}
          <div className="flex items-center justify-end gap-2 mt-3 text-[10px] text-[#9ca3af]">
            <span>Menos</span>
            {[0.1, 0.3, 0.5, 0.7, 0.9].map(a => <span key={a} className="w-3 h-3 rounded-sm" style={{ backgroundColor: `rgba(232, 87, 42, ${a})` }} />)}
            <span>Más</span>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Retention cohort — uses generic RetentionQuery
// ─────────────────────────────────────────────────────────────────────────────

function WebRetentionWidget({ filters }: { filters: WebFilterState }) {
  const [cohorts, setCohorts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const ph = await import('../../api/posthog');
      if (!ph.getTeamId()) await ph.bootstrapPostHog();
      const res: any = await ph.posthog.query({
        query: {
          kind: 'RetentionQuery',
          dateRange: { date_from: filters.range.date_from, date_to: filters.range.date_to ?? null },
          properties: buildProperties(filters),
          retentionFilter: {
            period: 'Day',
            total_intervals: 11,
            target_entity:    { type: 'events', id: '$pageview', name: '$pageview' },
            returning_entity: { type: 'events', id: '$pageview', name: '$pageview' },
          },
          filterTestAccounts: filters.testAccounts,
        },
      });
      setCohorts(res?.results ?? []);
    } catch (e: any) { setCohorts([]); setError(e?.message ?? 'Error al cargar retención'); }
    finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  return (
    <Card title="Retención">
      {loading ? <div className="h-32 bg-[#fafaf9] animate-pulse rounded" />
       : error ? <ErrorState message={error} onRetry={load} />
       : cohorts.length === 0 ? <EmptyState title="Sin datos de retención todavía" />
       : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider">
              <th className="text-left pr-2 py-1">Cohorte</th>
              {Array.from({ length: 8 }).map((_, i) => <th key={i} className="px-1 py-1 text-center">D{i}</th>)}
            </tr></thead>
            <tbody>
              {cohorts.slice(0, 8).map((c, i) => {
                const total = c.values?.[0]?.count ?? 0;
                return (
                  <tr key={i}>
                    <td className="pr-2 py-1 text-[10px] text-[#9ca3af]">{c.date ? new Date(c.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : c.label}</td>
                    {(c.values ?? []).slice(0, 8).map((v: any, vi: number) => {
                      const pct = total > 0 ? (v.count / total) * 100 : 0;
                      const bg = pct === 0 ? '#f9f9f7' : `rgba(59, 89, 246, ${0.12 + (pct / 100) * 0.7})`;
                      return <td key={vi} className="px-0.5 py-0.5"><span className="block rounded text-center text-[10px] font-medium py-1 text-[#1a1a18]" style={{ backgroundColor: bg }}>{pct ? `${pct.toFixed(0)}%` : '—'}</span></td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Frustrating pages — statsTable with breakdownBy FrustrationMetrics
// ─────────────────────────────────────────────────────────────────────────────

function WebFrustratingPages({ filters }: { filters: WebFilterState }) {
  const [rows,    setRows]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const ph = await import('../../api/posthog');
        if (!ph.getTeamId()) await ph.bootstrapPostHog();
        const res: any = await ph.posthog.webAnalytics.statsTable({
          breakdownBy: 'FrustrationMetrics' as any,
          dateRange:   { date_from: filters.range.date_from, date_to: filters.range.date_to ?? null },
          properties:  buildProperties(filters),
          filterTestAccounts: filters.testAccounts,
          limit:       10,
          sampling:    buildSampling(filters),
        }).catch(() => ({ results: [] }));
        if (!cancelled) setRows(res?.results ?? []);
      } catch { if (!cancelled) setRows([]); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [filters]);

  return (
    <Card title="Páginas frustrantes" action={<span className="text-[10px] text-[#9ca3af]">Dead clicks · Rage clicks</span>}>
      {loading ? <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-6 bg-[#fafaf9] animate-pulse rounded" />)}</div>
       : rows.length === 0 ? <EmptyState title="Sin páginas frustrantes en el periodo" />
       : (
        <ul className="space-y-1">
          {rows.slice(0, 8).map((r, i) => {
            const cells: any[] = Array.isArray(r) ? r : Object.values(r);
            return <li key={i} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-[#fafaf9]">
              <span className="text-xs text-[#1a1a18] truncate flex-1">{String(cells[0] ?? '—')}</span>
              <span className="text-xs text-[#dc2626] font-mono">{fmtNum(Number(cells[1] ?? 0))}</span>
            </li>;
          })}
        </ul>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Session replay & error tracking summary cards
// ─────────────────────────────────────────────────────────────────────────────

function SummaryCard({ icon, title, hint, link, count, accent }: { icon: ReactNode; title: string; hint: string; link: string; count?: number | null; accent: string }) {
  function go() { window.dispatchEvent(new CustomEvent('wa-navigate', { detail: { view: link } })); }
  return (
    <button onClick={go} className="text-left bg-white border border-[#e9eae6] rounded-xl p-4 hover:border-[#3b59f6] transition-colors w-full">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${accent}15`, color: accent }}>{icon}</span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-[#1a1a18] mb-0.5">{title}</h4>
          <p className="text-xs text-[#646462] line-clamp-2">{hint}</p>
        </div>
        {count != null && <span className="text-2xl font-bold text-[#1a1a18]">{fmtNum(count)}</span>}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Web Vitals tab — INP / LCP / FCP / CLS cards + path breakdown
// ─────────────────────────────────────────────────────────────────────────────

type WebVitalMetric = 'INP' | 'LCP' | 'FCP' | 'CLS';

const VITALS_META: Record<WebVitalMetric, { label: string; unit: 'ms' | 'score'; thresholds: [number, number]; description: string }> = {
  INP: { label: 'INP', unit: 'ms',    thresholds: [200, 500], description: 'Interaction to Next Paint' },
  LCP: { label: 'LCP', unit: 'ms',    thresholds: [2500, 4000], description: 'Largest Contentful Paint' },
  FCP: { label: 'FCP', unit: 'ms',    thresholds: [1800, 3000], description: 'First Contentful Paint' },
  CLS: { label: 'CLS', unit: 'score', thresholds: [0.1, 0.25], description: 'Cumulative Layout Shift' },
};

function band(val: number | null, thresholds: [number, number]): 'good' | 'warn' | 'bad' | null {
  if (val == null) return null;
  if (val <= thresholds[0]) return 'good';
  if (val <= thresholds[1]) return 'warn';
  return 'bad';
}

function bandColor(b: 'good' | 'warn' | 'bad' | null): string {
  if (b === 'good') return '#16a34a';
  if (b === 'warn') return '#f59e0b';
  if (b === 'bad')  return '#dc2626';
  return '#9ca3af';
}

function bandLabel(b: 'good' | 'warn' | 'bad' | null): string {
  if (b === 'good') return 'Bueno';
  if (b === 'warn') return 'Mejorable';
  if (b === 'bad')  return 'Pobre';
  return '—';
}

function WebVitalsCards({ filters, percentile, onSelectMetric, selected }: { filters: WebFilterState; percentile: 'p75' | 'p90' | 'p99'; onSelectMetric: (m: WebVitalMetric) => void; selected: WebVitalMetric }) {
  const [values,  setValues]  = useState<Record<WebVitalMetric, number | null>>({ INP: null, LCP: null, FCP: null, CLS: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const ph = await import('../../api/posthog');
        if (!ph.getTeamId()) await ph.bootstrapPostHog();
        const res: any = await ph.posthog.webAnalytics.vitals({
          dateRange:          { date_from: filters.range.date_from, date_to: filters.range.date_to ?? null },
          properties:         buildProperties(filters),
          filterTestAccounts: filters.testAccounts,
          percentile,
          sampling:           buildSampling(filters),
        });
        if (cancelled) return;
        // PostHog returns one row per metric: [metric, value] or { metric, value }.
        const map: Record<WebVitalMetric, number | null> = { INP: null, LCP: null, FCP: null, CLS: null };
        for (const r of (res?.results ?? [])) {
          const [k, v] = Array.isArray(r) ? r : [r.metric, r.value];
          const key = String(k).toUpperCase() as WebVitalMetric;
          if (key in map) map[key] = Number(v);
        }
        setValues(map);
      } catch { /* keep nulls */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [filters, percentile]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {(Object.keys(VITALS_META) as WebVitalMetric[]).map(k => {
        const meta = VITALS_META[k];
        const v = values[k];
        const b = band(v, meta.thresholds);
        const active = selected === k;
        return (
          <button key={k} onClick={() => onSelectMetric(k)} className={`text-left bg-white border rounded-xl p-4 hover:border-[#3b59f6] transition-colors ${active ? 'border-[#3b59f6] ring-2 ring-[#eff2ff]' : 'border-[#e9eae6]'}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider">{meta.label}</span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: `${bandColor(b)}15`, color: bandColor(b) }}>{bandLabel(b)}</span>
            </div>
            <p className="text-2xl font-bold text-[#1a1a18] mb-0.5">{loading ? '…' : meta.unit === 'ms' ? fmtMillis(v) : fmtScore(v)}</p>
            <p className="text-[10px] text-[#9ca3af]">{meta.description}</p>
          </button>
        );
      })}
    </div>
  );
}

function WebVitalsPathBreakdown({ filters, metric, percentile }: { filters: WebFilterState; metric: WebVitalMetric; percentile: 'p75' | 'p90' | 'p99' }) {
  const meta = VITALS_META[metric];
  const [bands,   setBands]   = useState<{ good: any[]; warn: any[]; bad: any[] }>({ good: [], warn: [], bad: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const ph = await import('../../api/posthog');
        if (!ph.getTeamId()) await ph.bootstrapPostHog();
        const res: any = await ph.posthog.webAnalytics.vitalsPathBreakdown({
          dateRange:          { date_from: filters.range.date_from, date_to: filters.range.date_to ?? null },
          properties:         buildProperties(filters),
          filterTestAccounts: filters.testAccounts,
          metric, percentile, thresholds: meta.thresholds,
          sampling:           buildSampling(filters),
        });
        if (cancelled) return;
        const b = { good: [] as any[], warn: [] as any[], bad: [] as any[] };
        for (const row of (res?.results ?? [])) {
          const cells = Array.isArray(row) ? row : Object.values(row);
          const [path, value] = cells;
          const v = Number(value);
          const target = band(v, meta.thresholds);
          if (target === 'good') b.good.push({ path, value: v });
          else if (target === 'warn') b.warn.push({ path, value: v });
          else if (target === 'bad') b.bad.push({ path, value: v });
        }
        setBands(b);
      } catch { if (!cancelled) setBands({ good: [], warn: [], bad: [] }); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [filters, metric, percentile]);

  const Section = ({ title, color, rows }: { title: string; color: string; rows: { path: string; value: number }[] }) => (
    <div className="bg-white border border-[#e9eae6] rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#e9eae6] flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <h3 className="text-sm font-semibold text-[#1a1a18]">{title}</h3>
        <span className="text-xs text-[#9ca3af] ml-auto">{rows.length}</span>
      </div>
      <div className="p-3 max-h-72 overflow-y-auto">
        {loading ? <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-5 bg-[#fafaf9] animate-pulse rounded" />)}</div>
         : rows.length === 0 ? <p className="text-xs text-[#9ca3af] text-center py-4">Sin rutas</p>
         : rows.slice(0, 15).map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-2 py-1">
            <span className="text-xs text-[#1a1a18] truncate flex-1">{r.path}</span>
            <span className="text-xs text-[#646462] font-mono">{meta.unit === 'ms' ? fmtMillis(r.value) : fmtScore(r.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <Section title="Bueno"     color="#16a34a" rows={bands.good} />
      <Section title="Mejorable" color="#f59e0b" rows={bands.warn} />
      <Section title="Pobre"     color="#dc2626" rows={bands.bad}  />
    </div>
  );
}

function WebVitalsTab({ filters }: { filters: WebFilterState }) {
  const [percentile, setPercentile] = useState<'p75' | 'p90' | 'p99'>('p75');
  const [metric,     setMetric]     = useState<WebVitalMetric>('INP');
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#1a1a18]">Core Web Vitals</h2>
        <div className="inline-flex bg-white border border-[#e9eae6] rounded-lg overflow-hidden text-xs">
          {(['p75', 'p90', 'p99'] as const).map(p => (
            <button key={p} onClick={() => setPercentile(p)} className={`px-3 py-1.5 ${percentile === p ? 'bg-[#1a1a18] text-white' : 'text-[#646462] hover:bg-[#fafaf9]'}`}>{p.toUpperCase()}</button>
          ))}
        </div>
      </div>
      <WebVitalsCards filters={filters} percentile={percentile} selected={metric} onSelectMetric={setMetric} />
      <div>
        <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-2">Desglose por ruta — {VITALS_META[metric].label}</h3>
        <WebVitalsPathBreakdown filters={filters} metric={metric} percentile={percentile} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Reports tab — URL search (WebPageURLSearchQuery) + per-URL panel
// ─────────────────────────────────────────────────────────────────────────────

function PageReportsTab({ filters }: { filters: WebFilterState }) {
  const [search,   setSearch]   = useState('');
  const [results,  setResults]  = useState<{ path: string; visitors: number; views: number }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const ph = await import('../../api/posthog');
        if (!ph.getTeamId()) await ph.bootstrapPostHog();
        const res: any = await ph.posthog.webAnalytics.pageURLSearch({
          dateRange:          { date_from: filters.range.date_from, date_to: filters.range.date_to ?? null },
          properties:         buildProperties(filters),
          filterTestAccounts: filters.testAccounts,
          searchTerm:         search.trim() || undefined,
          stripQueryParams:   true,
          limit:              30,
          sampling:           buildSampling(filters),
        });
        if (cancelled) return;
        const rows = (res?.results ?? []).map((r: any) => {
          const cells: any[] = Array.isArray(r) ? r : Object.values(r);
          return { path: String(cells[0] ?? ''), visitors: Number(cells[1] ?? 0), views: Number(cells[2] ?? 0) };
        });
        setResults(rows);
        if (rows[0] && !selected) setSelected(rows[0].path);
      } catch { if (!cancelled) setResults([]); }
      finally { if (!cancelled) setLoading(false); }
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search, filters]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card title="Buscar URL" className="lg:col-span-1">
        <div className="relative mb-3">
          <svg viewBox="0 0 16 16" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4"/><path d="M10.5 10.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="/blog, /pricing…" className="w-full pl-9 pr-3 py-2 bg-white border border-[#e9eae6] rounded text-sm focus:outline-none focus:border-[#3b59f6]" />
        </div>
        {loading ? <div className="space-y-2">{[0,1,2,3].map(i => <div key={i} className="h-7 bg-[#fafaf9] animate-pulse rounded" />)}</div>
         : results.length === 0 ? <EmptyState title="Sin URLs" />
         : (
          <ul className="space-y-1 max-h-[440px] overflow-y-auto">
            {results.map(r => (
              <li key={r.path}>
                <button onClick={() => setSelected(r.path)} className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center justify-between gap-2 ${selected === r.path ? 'bg-[#eff2ff] text-[#3b59f6]' : 'text-[#1a1a18] hover:bg-[#fafaf9]'}`}>
                  <span className="truncate flex-1">{r.path}</span>
                  <span className="font-mono">{fmtNum(r.visitors)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div className="lg:col-span-2 space-y-4">
        {selected ? <PageReportPanel filters={filters} path={selected} /> : <Card><EmptyState title="Selecciona una URL para ver su informe" /></Card>}
      </div>
    </div>
  );
}

function PageReportPanel({ filters, path }: { filters: WebFilterState; path: string }) {
  // Pin the path as a property filter and reuse the overview KPIs + breakdowns.
  const scoped: WebFilterState = {
    ...filters,
    properties: [
      ...filters.properties,
      { key: '$pathname', value: path, operator: 'exact', type: 'event', label: 'Ruta' },
    ],
  };
  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider">Informe de página</p>
            <h3 className="text-base font-bold text-[#1a1a18] truncate">{path}</h3>
          </div>
          <button onClick={() => window.dispatchEvent(new CustomEvent('wa-navigate', { detail: { view: 'appHeatmaps', payload: { kind: 'heatmap-url', id: path } } }))} className="px-3 py-1.5 bg-white border border-[#e9eae6] rounded-lg text-xs text-[#1a1a18] hover:bg-[#fafaf9]">Ver heatmap →</button>
        </div>
        <WebOverviewKPIs filters={scoped} />
      </Card>
      <WebStatsTable filters={scoped} defaultBreakdown="InitialChannelType" />
      <WebStatsTable filters={scoped} defaultBreakdown="DeviceType" />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Marketing analytics tab — conversion-focused view
// ─────────────────────────────────────────────────────────────────────────────

function MarketingAnalyticsTab({ filters }: { filters: WebFilterState }) {
  return (
    <div className="space-y-5">
      <WebOverviewKPIs filters={filters} />
      <WebGoalsWidget filters={filters} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <WebStatsTable filters={filters} defaultBreakdown="InitialUTMSource" />
        <WebStatsTable filters={filters} defaultBreakdown="InitialUTMCampaign" />
      </div>
      <WebStatsTable filters={filters} defaultBreakdown="InitialChannelType" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-Domain tab — breakdown by $host (HogQL), referring domain table,
// cross-host journey heatmap. Useful for multi-property setups.
// ─────────────────────────────────────────────────────────────────────────────

function CrossDomainHostBreakdown({ filters }: { filters: WebFilterState }) {
  const [rows,    setRows]    = useState<{ host: string; visitors: number; views: number; sessions: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const ph = await import('../../api/posthog');
      if (!ph.getTeamId()) await ph.bootstrapPostHog();
      // PostHog has no canonical "Host" breakdown for WebStatsTableQuery,
      // so drop down to a HogQL aggregation on the events table.
      const dateClause = (() => {
        const v = filters.range.date_from;
        if (v === 'all')         return ''; // no lower bound
        if (v === 'dStart')      return `AND toDate(timestamp) = today()`;
        if (v === 'mStart')      return `AND timestamp >= toStartOfMonth(now())`;
        if (v === 'yStart')      return `AND timestamp >= toStartOfYear(now())`;
        const m = /^-(\d+)([dh])(Start|End)?$/.exec(v);
        if (m) {
          const n = Number(m[1]);
          const unit = m[2] === 'h' ? 'HOUR' : 'DAY';
          return `AND timestamp >= now() - INTERVAL ${n} ${unit}`;
        }
        return `AND timestamp >= now() - INTERVAL 30 DAY`;
      })();
      const propsClause = filters.hosts.length
        ? `AND toString(properties.$host) IN (${filters.hosts.map(h => `'${h.replace(/'/g, "''")}'`).join(',')})`
        : '';
      const hql = `
        SELECT
          toString(properties.$host) AS host,
          uniq(distinct_id)          AS visitors,
          count()                    AS views,
          uniq(properties.$session_id) AS sessions
        FROM events
        WHERE event = '$pageview'
          ${dateClause}
          ${propsClause}
          AND toString(properties.$host) != ''
        GROUP BY host
        ORDER BY visitors DESC
        LIMIT 50
      `;
      const res: any = await ph.posthog.query({
        query: { kind: 'HogQLQuery', query: hql, filters: { filterTestAccounts: filters.testAccounts } },
      });
      const out = (res?.results ?? []).map((r: any) => {
        const cells = Array.isArray(r) ? r : Object.values(r);
        return { host: String(cells[0] ?? '—'), visitors: Number(cells[1] ?? 0), views: Number(cells[2] ?? 0), sessions: Number(cells[3] ?? 0) };
      });
      setRows(out);
    } catch (e: any) { setRows([]); setError(e?.message ?? 'Error al cargar hosts'); }
    finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  const totalVisitors = rows.reduce((a, r) => a + r.visitors, 0) || 1;
  return (
    <Card title="Dominios y subdominios" action={<span className="text-[10px] text-[#9ca3af]">$host · pageviews</span>}>
      {loading ? <div className="space-y-2">{[0,1,2,3,4].map(i => <div key={i} className="h-7 bg-[#fafaf9] animate-pulse rounded" />)}</div>
       : error ? <ErrorState message={error} onRetry={load} />
       : rows.length === 0 ? <EmptyState title="Sin tráfico cross-domain en el rango" />
       : (
        <table className="w-full">
          <thead><tr className="text-left text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider border-b border-[#e9eae6]">
            <th className="py-2 pr-3">Host</th>
            <th className="py-2 pr-3">Visitantes</th>
            <th className="py-2 pr-3">Vistas</th>
            <th className="py-2 pr-3">Sesiones</th>
            <th className="py-2 pr-3">% del total</th>
          </tr></thead>
          <tbody>
            {rows.slice(0, 30).map((r, i) => {
              const pct = (r.visitors / totalVisitors) * 100;
              return (
                <tr key={i} className="border-b border-[#f3f3f1] last:border-b-0">
                  <td className="py-2 pr-3 text-sm text-[#1a1a18] truncate max-w-[300px] font-mono">{r.host}</td>
                  <td className="py-2 pr-3 text-xs text-[#646462] font-mono">{fmtNum(r.visitors)}</td>
                  <td className="py-2 pr-3 text-xs text-[#646462] font-mono">{fmtNum(r.views)}</td>
                  <td className="py-2 pr-3 text-xs text-[#646462] font-mono">{fmtNum(r.sessions)}</td>
                  <td className="py-2 pr-3 text-xs text-[#646462] font-mono">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-20 h-1.5 bg-[#f3f3f1] rounded-full overflow-hidden inline-block">
                        <span className="block h-full bg-[#3b59f6]" style={{ width: `${Math.min(100, pct)}%` }} />
                      </span>
                      {fmtPct(pct)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function CrossDomainTab({ filters }: { filters: WebFilterState }) {
  return (
    <div className="space-y-5">
      <CrossDomainHostBreakdown filters={filters} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <WebStatsTable filters={filters} defaultBreakdown="InitialReferringDomain" />
        <WebExternalClicksWidget filters={filters} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversion Goals tab — WebGoalsQuery + per-channel breakdown + goal editor
// ─────────────────────────────────────────────────────────────────────────────

function ConversionGoalsTab({ filters, onOpenSettings }: { filters: WebFilterState; onOpenSettings: () => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#1a1a18]">Objetivos de conversión</h2>
          <p className="text-xs text-[#646462] mt-0.5">Eventos que cuentan como conversión y su rendimiento por canal.</p>
        </div>
        <button onClick={onOpenSettings} className="flex items-center gap-1.5 h-8 px-3 bg-[#1a1a18] text-white rounded-lg text-xs hover:bg-[#333]">
          <svg viewBox="0 0 16 16" className="w-3 h-3"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          Gestionar objetivos
        </button>
      </div>
      <WebGoalsWidget filters={filters} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <WebStatsTable filters={filters} defaultBreakdown="InitialChannelType" />
        <WebStatsTable filters={filters} defaultBreakdown="InitialUTMSource" />
      </div>
      <WebStatsTable filters={filters} defaultBreakdown="InitialReferringDomain" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings drawer — conversion goals CRUD + channel rules + frustration
// ─────────────────────────────────────────────────────────────────────────────

interface ConversionGoal { id: string; name: string; event: string; math: 'total' | 'unique_session'; }
interface ChannelRule    { id: string; name: string; condition: string; }
interface WaSettings { goals: ConversionGoal[]; rules: ChannelRule[]; deadClickMs: number; rageClickCount: number; }

const DEFAULT_SETTINGS: WaSettings = { goals: [], rules: [], deadClickMs: 2500, rageClickCount: 3 };

function readSettings(): WaSettings { try { const raw = localStorage.getItem('wa:settings'); if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }; } catch {} return DEFAULT_SETTINGS; }
function writeSettings(s: WaSettings) { try { localStorage.setItem('wa:settings', JSON.stringify(s)); } catch {} }

function SettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [s, setS]    = useState<WaSettings>(readSettings);
  const [tab, setTab] = useState<'goals' | 'channels' | 'frustration'>('goals');

  function save(next: WaSettings) { setS(next); writeSettings(next); }

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-[#1a1a18]/30 z-[60]" onClick={onClose}>
      <div className="absolute right-0 top-0 bottom-0 w-[480px] max-w-[92vw] bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#e9eae6] flex items-center justify-between">
          <h2 className="text-base font-bold text-[#1a1a18]">Ajustes de Web Analytics</h2>
          <button onClick={onClose} className="text-[#9ca3af] hover:text-[#1a1a18]"><svg viewBox="0 0 16 16" className="w-4 h-4"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></button>
        </div>
        <div className="px-5 pt-3 border-b border-[#e9eae6] flex gap-4">
          {(['goals', 'channels', 'frustration'] as const).map(k => (
            <button key={k} onClick={() => setTab(k)} className={`pb-2 text-sm font-medium border-b-2 ${tab === k ? 'border-[#3b59f6] text-[#3b59f6]' : 'border-transparent text-[#646462] hover:text-[#1a1a18]'}`}>
              {k === 'goals' ? 'Objetivos' : k === 'channels' ? 'Canales' : 'Frustración'}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'goals' && (
            <div className="space-y-3">
              <p className="text-xs text-[#646462]">Define eventos clave como objetivos de conversión para verlos en el dashboard.</p>
              {s.goals.length === 0 && <EmptyState title="Sin objetivos definidos" hint="Crea tu primero abajo." />}
              <ul className="space-y-2">
                {s.goals.map(g => (
                  <li key={g.id} className="flex items-center gap-2 p-3 border border-[#e9eae6] rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1a1a18] truncate">{g.name}</p>
                      <p className="text-xs text-[#9ca3af] truncate">{g.event} · {g.math === 'unique_session' ? 'sesiones únicas' : 'total'}</p>
                    </div>
                    <button onClick={() => save({ ...s, goals: s.goals.filter(x => x.id !== g.id) })} className="text-[#dc2626] hover:bg-[#fef2f2] p-1 rounded"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M4 5h8l-1 9H5zM6 5V3h4v2M2 5h12" stroke="currentColor" strokeWidth="1.3" fill="none"/></svg></button>
                  </li>
                ))}
              </ul>
              <button onClick={() => {
                const name = window.prompt('Nombre del objetivo'); if (!name) return;
                const event = window.prompt('Evento (ej: $pageview, purchase…)', '$pageview'); if (!event) return;
                save({ ...s, goals: [...s.goals, { id: crypto.randomUUID(), name, event, math: 'total' }] });
              }} className="w-full px-3 py-2 bg-[#1a1a18] text-white text-sm rounded-lg hover:bg-[#333]">+ Nuevo objetivo</button>
            </div>
          )}
          {tab === 'channels' && (
            <div className="space-y-3">
              <p className="text-xs text-[#646462]">Reglas personalizadas para clasificar el tráfico en canales propios (organic, paid, social, etc.).</p>
              {s.rules.length === 0 && <EmptyState title="Sin reglas personalizadas" hint="PostHog usará la clasificación por defecto." />}
              <ul className="space-y-2">
                {s.rules.map(r => (
                  <li key={r.id} className="flex items-center gap-2 p-3 border border-[#e9eae6] rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1a1a18] truncate">{r.name}</p>
                      <p className="text-xs text-[#9ca3af] truncate">{r.condition}</p>
                    </div>
                    <button onClick={() => save({ ...s, rules: s.rules.filter(x => x.id !== r.id) })} className="text-[#dc2626] hover:bg-[#fef2f2] p-1 rounded"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M4 5h8l-1 9H5zM6 5V3h4v2M2 5h12" stroke="currentColor" strokeWidth="1.3" fill="none"/></svg></button>
                  </li>
                ))}
              </ul>
              <button onClick={() => {
                const name = window.prompt('Nombre del canal'); if (!name) return;
                const condition = window.prompt('Condición (ej: utm_source contains facebook)', 'utm_source contains '); if (!condition) return;
                save({ ...s, rules: [...s.rules, { id: crypto.randomUUID(), name, condition }] });
              }} className="w-full px-3 py-2 bg-[#1a1a18] text-white text-sm rounded-lg hover:bg-[#333]">+ Nueva regla</button>
            </div>
          )}
          {tab === 'frustration' && (
            <div className="space-y-4">
              <p className="text-xs text-[#646462]">Umbrales para detectar páginas con experiencia frustrante para el usuario.</p>
              <label className="block">
                <span className="text-xs font-medium text-[#1a1a18]">Dead click (ms)</span>
                <input type="number" min={500} max={10000} value={s.deadClickMs} onChange={e => save({ ...s, deadClickMs: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 border border-[#e9eae6] rounded text-sm focus:outline-none focus:border-[#3b59f6]" />
                <p className="text-[10px] text-[#9ca3af] mt-1">Tiempo sin respuesta tras un click para marcarlo como muerto.</p>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-[#1a1a18]">Rage clicks (clicks consecutivos)</span>
                <input type="number" min={2} max={10} value={s.rageClickCount} onChange={e => save({ ...s, rageClickCount: Number(e.target.value) })} className="mt-1 w-full px-3 py-2 border border-[#e9eae6] rounded text-sm focus:outline-none focus:border-[#3b59f6]" />
                <p className="text-[10px] text-[#9ca3af] mt-1">Mínimo de clicks rápidos seguidos en la misma zona.</p>
              </label>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-[#e9eae6] flex justify-end">
          <button onClick={onClose} className="px-3 py-1.5 bg-[#1a1a18] text-white text-sm rounded-lg hover:bg-[#333]">Hecho</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Web Analytics Overview tab (everything wired together)
// ─────────────────────────────────────────────────────────────────────────────

function WebAnalyticsOverviewTab({ filters, visibleTiles, reloadKey, onChangeGraphMetric }: { filters: WebFilterState; visibleTiles: Record<VisibleTile, boolean>; reloadKey: number; onChangeGraphMetric: (m: GraphMetric) => void }) {
  function go(view: string, payload?: any) { window.dispatchEvent(new CustomEvent('wa-navigate', { detail: { view, payload } })); }
  const [modalState, setModalState] = useState<{ breakdown: BreakdownBy; title: string } | null>(null);
  return (
    <div className="space-y-5" key={`overview-${reloadKey}`}>
      {visibleTiles.overview && <WebOverviewKPIs filters={filters} />}
      {visibleTiles.graphs && (
        <TileFrame
          title="Tendencias"
          rightExtra={<MetricGraphSwitcher value={filters.graphMetric} onChange={onChangeGraphMetric} />}
          onOpenInsight={() => openAsNewInsight(`WA · ${GRAPH_METRICS.find(g => g.key === filters.graphMetric)?.label ?? 'Trends'}`, {
            kind: 'InsightVizNode',
            source: {
              kind: 'TrendsQuery',
              dateRange: { date_from: filters.range.date_from, date_to: filters.range.date_to ?? null },
              series: [{ kind: 'EventsNode', event: GRAPH_METRICS.find(g => g.key === filters.graphMetric)!.event, math: GRAPH_METRICS.find(g => g.key === filters.graphMetric)!.math }],
              trendsFilter: { display: 'ActionsLineGraph' },
            },
          })}
        >
          <WebTrendsChart filters={filters} />
        </TileFrame>
      )}
      {(visibleTiles.paths || visibleTiles.sources) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visibleTiles.paths   && <WebStatsTable filters={filters} defaultBreakdown="Page" onRowClick={(p) => go('appHeatmaps', { kind: 'heatmap-url', id: p })} onShowMore={(b, t) => setModalState({ breakdown: b, title: t })} />}
          {visibleTiles.sources && <WebStatsTable filters={filters} defaultBreakdown="InitialChannelType" onShowMore={(b, t) => setModalState({ breakdown: b, title: t })} />}
        </div>
      )}
      {visibleTiles.geography && (
        <CountryWorldMap filters={filters} onOpenModal={() => setModalState({ breakdown: 'Country', title: 'Países' })} />
      )}
      {visibleTiles.devices && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <WebStatsTable filters={filters} defaultBreakdown="DeviceType" onShowMore={(b, t) => setModalState({ breakdown: b, title: t })} />
          <WebStatsTable filters={filters} defaultBreakdown="Browser"    onShowMore={(b, t) => setModalState({ breakdown: b, title: t })} />
          <WebStatsTable filters={filters} defaultBreakdown="OS"         onShowMore={(b, t) => setModalState({ breakdown: b, title: t })} />
        </div>
      )}
      {(visibleTiles.retention || visibleTiles.activeHours) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visibleTiles.retention   && <WebRetentionWidget filters={filters} />}
          {visibleTiles.activeHours && <WebActiveHoursHeatmap filters={filters} />}
        </div>
      )}
      {(visibleTiles.goals || visibleTiles.frustratingPages) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visibleTiles.goals            && <WebGoalsWidget      filters={filters} />}
          {visibleTiles.frustratingPages && <WebFrustratingPages filters={filters} />}
        </div>
      )}
      {visibleTiles.externalClicks && <WebExternalClicksWidget filters={filters} />}
      {(visibleTiles.replay || visibleTiles.errorTracking) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visibleTiles.replay && (
            <SummaryCard
              icon={<svg viewBox="0 0 16 16" className="w-4 h-4"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M6 5l5 3-5 3z" fill="currentColor"/></svg>}
              title="Session replays"
              hint="Reproduce sesiones para ver el comportamiento real de tus usuarios."
              link="appSessionReplay" accent="#e8572a"
            />
          )}
          {visibleTiles.errorTracking && (
            <SummaryCard
              icon={<svg viewBox="0 0 16 16" className="w-4 h-4"><path d="M8 1l7 13H1z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M8 6v4M8 12v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>}
              title="Error tracking"
              hint="Detecta y agrupa errores JS en tu producto."
              link="appErrorTracking" accent="#dc2626"
            />
          )}
        </div>
      )}
      <WebAnalyticsModal
        open={modalState != null}
        onClose={() => setModalState(null)}
        filters={filters}
        breakdown={modalState?.breakdown ?? 'Page'}
        title={modalState?.title ?? ''}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TileFrame — header con título + viz toggle + "Show more" + "Open as insight"
// + "Export CSV". Mirror del wrapper de PostHog para sus query-tiles.
// ─────────────────────────────────────────────────────────────────────────────

interface TileFrameProps {
  title:           string;
  children:        ReactNode;
  vizMode?:        TileViz;
  onVizChange?:    (m: TileViz) => void;
  onOpenInsight?:  () => void;
  onShowMore?:     () => void;
  onExport?:       () => void;
  rightExtra?:     ReactNode;
}

function TileFrame({ title, children, vizMode, onVizChange, onOpenInsight, onShowMore, onExport, rightExtra }: TileFrameProps) {
  return (
    <div className="bg-white border border-[#e9eae6] rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#e9eae6] flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-[#1a1a18]">{title}</h3>
        <div className="flex items-center gap-1">
          {rightExtra}
          {vizMode !== undefined && onVizChange && (
            <div className="inline-flex bg-white border border-[#e9eae6] rounded overflow-hidden">
              <button onClick={() => onVizChange('table')} className={`px-2 py-1 ${vizMode === 'table' ? 'bg-[#1a1a18] text-white' : 'text-[#646462] hover:bg-[#fafaf9]'}`} title="Ver como tabla">
                <svg viewBox="0 0 16 16" className="w-3 h-3"><rect x="1" y="3" width="14" height="10" fill="none" stroke="currentColor" strokeWidth="1.3"/><path d="M1 7h14M6 3v10" stroke="currentColor" strokeWidth="1.3"/></svg>
              </button>
              <button onClick={() => onVizChange('graph')} className={`px-2 py-1 ${vizMode === 'graph' ? 'bg-[#1a1a18] text-white' : 'text-[#646462] hover:bg-[#fafaf9]'}`} title="Ver como gráfica">
                <svg viewBox="0 0 16 16" className="w-3 h-3"><rect x="2" y="8" width="2" height="6" fill="currentColor"/><rect x="5" y="5" width="2" height="9" fill="currentColor"/><rect x="8" y="2" width="2" height="12" fill="currentColor"/><rect x="11" y="6" width="2" height="8" fill="currentColor"/></svg>
              </button>
            </div>
          )}
          {onShowMore && (
            <button onClick={onShowMore} className="px-2 py-1 text-xs text-[#646462] hover:bg-[#fafaf9] rounded" title="Ver todos los datos">
              Ver más
            </button>
          )}
          {onOpenInsight && (
            <button onClick={onOpenInsight} className="px-2 py-1 text-xs text-[#3b59f6] hover:bg-[#eff2ff] rounded" title="Abrir como nuevo insight">
              ↗ Insight
            </button>
          )}
          {onExport && (
            <button onClick={onExport} className="px-2 py-1 text-[#646462] hover:bg-[#fafaf9] rounded" title="Exportar CSV">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M8 1v10m-3-3l3 3 3-3M2 14h12" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          )}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WebAnalyticsModal — versión expandida de un tile (200 filas, más columnas).
// ─────────────────────────────────────────────────────────────────────────────

function WebAnalyticsModal({
  open, onClose, filters, breakdown, title,
}: {
  open:      boolean;
  onClose:   () => void;
  filters:   WebFilterState;
  breakdown: BreakdownBy;
  title:     string;
}) {
  const [rows,    setRows]    = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const ph = await import('../../api/posthog');
        if (!ph.getTeamId()) await ph.bootstrapPostHog();
        const res: any = await ph.posthog.webAnalytics.statsTable({
          breakdownBy:         breakdown,
          dateRange:           { date_from: filters.range.date_from, date_to: filters.range.date_to ?? null },
          properties:          buildProperties(filters),
          compareFilter:       { compare: filters.compare },
          includeBounceRate:   true,
          includeScrollDepth:  true,
          doPathCleaning:      filters.pathCleaning,
          filterTestAccounts:  filters.testAccounts,
          limit:               200,
          sampling:            buildSampling(filters),
        });
        if (cancelled) return;
        setRows(res?.results ?? []);
        setColumns(res?.columns ?? []);
      } catch { if (!cancelled) setRows([]); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [open, filters, breakdown]);

  function exportCsv() {
    const header = columns.join(',');
    const body = rows.map(r => (Array.isArray(r) ? r : Object.values(r)).map(c => {
      if (c == null) return '';
      const s = typeof c === 'object' ? JSON.stringify(c) : String(c);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${title.replace(/\s+/g, '_').toLowerCase()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-[#1a1a18]/30 z-[65] flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[920px] max-w-[95vw] max-h-[88vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#e9eae6] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#1a1a18]">{title}</h2>
            <p className="text-xs text-[#646462] mt-0.5">{rows.length} filas · {breakdown}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCsv} disabled={rows.length === 0} className="px-3 py-1.5 bg-white border border-[#e9eae6] rounded-lg text-xs text-[#1a1a18] hover:bg-[#fafaf9] disabled:opacity-50">Exportar CSV</button>
            <button onClick={onClose} className="text-[#9ca3af] hover:text-[#1a1a18]">
              <svg viewBox="0 0 16 16" className="w-4 h-4"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {loading ? <div className="space-y-2">{[0,1,2,3,4,5,6,7,8].map(i => <div key={i} className="h-7 bg-[#fafaf9] animate-pulse rounded" />)}</div>
           : rows.length === 0 ? <EmptyState title="Sin datos" hint="Prueba a ampliar el rango o quitar filtros." />
           : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider border-b border-[#e9eae6] sticky top-0 bg-white">
                {columns.map((c, i) => <th key={i} className="py-2 pr-3 whitespace-nowrap">{c}</th>)}
              </tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const cells = Array.isArray(r) ? r : Object.values(r);
                  return (
                    <tr key={i} className="border-b border-[#f3f3f1] hover:bg-[#fafaf9]">
                      {cells.map((c: any, ci: number) => {
                        let v: ReactNode = '—';
                        if (ci === 0) v = <span className="text-[#1a1a18] truncate max-w-[460px] inline-block">{String(c ?? '—')}</span>;
                        else if (typeof c === 'number') v = <span className="text-[#646462] font-mono">{ci >= 3 ? fmtPct(c) : fmtNum(c)}</span>;
                        else if (Array.isArray(c)) v = <span className="text-[#646462] font-mono">{fmtNum(c[0])}</span>;
                        else v = <span className="text-[#646462]">{String(c ?? '—')}</span>;
                        return <td key={ci} className="py-1.5 pr-3 align-top">{v}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LiveUserCount — visitantes en la última hora. Polling cada 20s.
// ─────────────────────────────────────────────────────────────────────────────

function LiveUserCount({ filters }: { filters: WebFilterState }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: any;
    async function tick() {
      try {
        const ph = await import('../../api/posthog');
        if (!ph.getTeamId()) await ph.bootstrapPostHog();
        const res: any = await ph.posthog.webAnalytics.overview({
          dateRange:          { date_from: '-1h', date_to: null },
          properties:         buildProperties(filters),
          filterTestAccounts: filters.testAccounts,
        });
        if (cancelled) return;
        const visitors = (res?.results ?? []).find((r: any) => /visitor/i.test(r.key || ''));
        setCount(visitors ? Math.round(Number(visitors.value) || 0) : null);
      } catch { if (!cancelled) setCount(null); }
      finally { if (!cancelled) timer = setTimeout(tick, 20_000); }
    }
    tick();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [filters]);
  return (
    <div className="inline-flex items-center gap-1.5 h-8 px-3 bg-white border border-[#e9eae6] rounded-lg" title="Visitantes únicos en la última hora">
      <span className="relative w-2 h-2 rounded-full bg-[#16a34a] flex-shrink-0">
        <span className="absolute inset-0 rounded-full bg-[#16a34a] animate-ping opacity-75" />
      </span>
      <span className="text-xs font-medium text-[#1a1a18]">{count == null ? '…' : fmtNum(count)}</span>
      <span className="text-[10px] text-[#9ca3af]">en vivo</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WebAnalyticsMenu — header dropdown con Session Attribution + Visible tiles.
// ─────────────────────────────────────────────────────────────────────────────

function WebAnalyticsMenu({
  visibleTiles, onToggleTile, onResetTiles,
}: {
  visibleTiles:  Record<VisibleTile, boolean>;
  onToggleTile:  (k: VisibleTile) => void;
  onResetTiles:  () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) { if (!ref.current?.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1 h-8 px-2 bg-white border border-[#e9eae6] rounded-lg text-xs text-[#1a1a18] hover:bg-[#fafaf9]" title="Más opciones">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><circle cx="3" cy="8" r="1.4" fill="currentColor"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><circle cx="13" cy="8" r="1.4" fill="currentColor"/></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 z-50 bg-white border border-[#e9eae6] rounded-xl shadow-lg py-1 max-h-[80vh] overflow-y-auto">
          <button
            onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('wa-navigate', { detail: { view: 'sessionAttribution' } })); }}
            className="w-full text-left px-3 py-2 text-sm text-[#1a1a18] hover:bg-[#fafaf9] flex items-center gap-2"
          >
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-[#3b59f6]"><circle cx="3" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.3"/><circle cx="13" cy="4" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.3"/><circle cx="13" cy="12" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.3"/><path d="M5 7l6.5-2.5M5 9l6.5 2.5" stroke="currentColor" strokeWidth="1.3"/></svg>
            Session Attribution Explorer
          </button>
          <div className="border-t border-[#e9eae6] my-1" />
          <div className="px-3 py-1 flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider">Tarjetas visibles</span>
            <button onClick={onResetTiles} className="text-[10px] text-[#3b59f6] hover:underline">Restablecer</button>
          </div>
          {ALL_TILES.map(t => (
            <label key={t.k} className="flex items-center gap-3 px-3 py-1.5 hover:bg-[#fafaf9] cursor-pointer">
              <input type="checkbox" checked={visibleTiles[t.k]} onChange={() => onToggleTile(t.k)} className="accent-[#3b59f6]" />
              <span className="text-sm text-[#1a1a18]">{t.l}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DeviceSegmented — Desktop/Mobile/Tablet/All toggle.
// ─────────────────────────────────────────────────────────────────────────────

function DeviceSegmented({ value, onChange }: { value: DeviceFilter; onChange: (v: DeviceFilter) => void }) {
  const ICONS: Record<DeviceFilter, ReactNode> = {
    all:     <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.3"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" stroke="currentColor" strokeWidth="1.1" fill="none"/></svg>,
    desktop: <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><rect x="1" y="3" width="14" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3"/><path d="M6 14h4M8 12v2" stroke="currentColor" strokeWidth="1.3"/></svg>,
    mobile:  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><rect x="5" y="1" width="6" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3"/><circle cx="8" cy="12.5" r="0.7" fill="currentColor"/></svg>,
    tablet:  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><rect x="3" y="1" width="10" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3"/><circle cx="8" cy="13" r="0.7" fill="currentColor"/></svg>,
  };
  return (
    <div className="inline-flex bg-white border border-[#e9eae6] rounded-lg overflow-hidden">
      {DEVICE_OPTIONS.map(d => (
        <button
          key={d.k}
          onClick={() => onChange(d.k)}
          title={d.l}
          className={`flex items-center gap-1 px-2.5 py-1.5 text-xs ${value === d.k ? 'bg-[#1a1a18] text-white' : 'text-[#646462] hover:bg-[#fafaf9]'}`}
        >
          {ICONS[d.k]}
          {value === d.k && <span>{d.l}</span>}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MetricGraphSwitcher — chip-row con las 8 métricas (PostHog GraphsTab).
// ─────────────────────────────────────────────────────────────────────────────

function MetricGraphSwitcher({ value, onChange }: { value: GraphMetric; onChange: (m: GraphMetric) => void }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {GRAPH_METRICS.map(m => (
        <button
          key={m.key}
          onClick={() => onChange(m.key)}
          className={`px-2.5 py-1 rounded text-xs whitespace-nowrap ${value === m.key ? 'bg-[#1a1a18] text-white' : 'text-[#646462] hover:bg-[#fafaf9] border border-[#e9eae6]'}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CountryWorldMap — visualización de mapa para el breakdown de países.
// Reutiliza el componente charts/WorldMap si está disponible; fallback a tabla.
// ─────────────────────────────────────────────────────────────────────────────

function CountryWorldMap({ filters, onOpenModal }: { filters: WebFilterState; onOpenModal: () => void }) {
  const [rows, setRows] = useState<{ code: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [WorldMapComp, setWorldMapComp] = useState<any>(null);

  useEffect(() => {
    (async () => { try { const m = await import('../charts/WorldMap'); setWorldMapComp(() => m.WorldMap ?? m.default ?? null); } catch {} })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const ph = await import('../../api/posthog');
        if (!ph.getTeamId()) await ph.bootstrapPostHog();
        const res: any = await ph.posthog.webAnalytics.statsTable({
          breakdownBy: 'Country',
          dateRange:   { date_from: filters.range.date_from, date_to: filters.range.date_to ?? null },
          properties:  buildProperties(filters),
          filterTestAccounts: filters.testAccounts,
          limit:       250,
        });
        if (cancelled) return;
        const out = (res?.results ?? []).map((r: any) => {
          const cells = Array.isArray(r) ? r : Object.values(r);
          return { code: String(cells[0] ?? '').toUpperCase(), value: Number(Array.isArray(cells[1]) ? cells[1][0] : cells[1] ?? 0) };
        }).filter((x: any) => x.code && Number.isFinite(x.value));
        setRows(out);
      } catch { if (!cancelled) setRows([]); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [filters]);

  return (
    <TileFrame title="Mapa de visitantes por país" onShowMore={onOpenModal}>
      {loading ? <div className="h-64 bg-[#fafaf9] rounded animate-pulse" />
       : rows.length === 0 ? <EmptyState title="Sin datos geográficos" />
       : WorldMapComp ? <WorldMapComp data={rows.map(r => ({ countryCode: r.code, count: r.value }))} height={320} />
       : (
        // Fallback: lista visual cuando WorldMap no está disponible.
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
          {rows.slice(0, 30).map(r => (
            <div key={r.code} className="flex items-center justify-between px-2 py-1 bg-[#fafaf9] rounded">
              <span className="text-xs text-[#1a1a18] font-mono">{r.code}</span>
              <span className="text-xs text-[#646462] font-mono">{fmtNum(r.value)}</span>
            </div>
          ))}
        </div>
      )}
    </TileFrame>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// openAsNewInsight — helper para "Open as new insight" en cada tile.
// Crea un Insight con la misma query y navega al detalle.
// ─────────────────────────────────────────────────────────────────────────────

async function openAsNewInsight(name: string, query: any) {
  try {
    const ph = await import('../../api/posthog');
    if (!ph.getTeamId()) await ph.bootstrapPostHog();
    const created: any = await ph.phPost(`/api/environments/${ph.getTeamId()}/insights/`, {
      name, saved: true, query,
    });
    window.dispatchEvent(new CustomEvent('app-navigate', { detail: { app: 'appProductAnalytics', payload: { kind: 'insight', id: created.id } } }));
  } catch (e: any) { alert(e?.message ?? 'No se pudo crear el insight'); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main WebAnalyticsScreen shell — header + tabs + toolbar + tab body
// ─────────────────────────────────────────────────────────────────────────────

export function WebAnalyticsScreen() {
  const [tab,           setTab]           = useState<Tab>('webAnalytics');
  const [filters,       setFilters]       = useState<WebFilterState>(DEFAULT_FILTERS);
  const [settingsOpen,  setSettingsOpen]  = useState(false);
  const [reloadKey,     setReloadKey]     = useState(0);
  const [visibleTiles,  setVisibleTiles]  = useState<Record<VisibleTile, boolean>>(readVisibleTiles);
  const [shareCopied,   setShareCopied]   = useState(false);

  function reload()      { setReloadKey(k => k + 1); }
  function toggleTile(k: VisibleTile) {
    setVisibleTiles(v => { const n = { ...v, [k]: !v[k] }; writeVisibleTiles(n); return n; });
  }
  function resetTiles() {
    const def: any = {}; ALL_TILES.forEach(t => def[t.k] = true);
    setVisibleTiles(def); writeVisibleTiles(def);
  }
  async function shareView() {
    try { await navigator.clipboard.writeText(window.location.href); setShareCopied(true); setTimeout(() => setShareCopied(false), 1500); } catch {}
  }

  const TABS: { key: Tab; label: string; beta?: boolean }[] = [
    { key: 'webAnalytics',    label: 'Overview' },
    { key: 'webVitals',       label: 'Web Vitals' },
    { key: 'pageReports',     label: 'Page Reports',     beta: true },
    { key: 'marketing',       label: 'Marketing',        beta: true },
    { key: 'crossDomain',     label: 'Cross-Domain',     beta: true },
    { key: 'conversionGoals', label: 'Conversion Goals' },
  ];

  return (
    <div className="flex-1 flex flex-col bg-[#f9f9f7] min-h-0 overflow-auto">
      {/* Header */}
      <div className="bg-white px-6 pt-4 pb-2 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <svg viewBox="0 0 16 16" className="w-4 h-4 text-[#16a34a]"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" stroke="currentColor" strokeWidth="1.4" fill="none"/></svg>
              <h1 className="text-lg font-bold text-[#1a1a18]">Web analytics</h1>
              {filters.sampling !== 'auto' && (
                <span className="ml-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#eff2ff] text-[#3b59f6]" title="Sampling rate forzado en las consultas">
                  Sampling {filters.sampling === 'full' ? '1/1' : '1/10'}
                </span>
              )}
            </div>
            <p className="text-xs text-[#646462]">Visitantes, páginas, fuentes y rendimiento del sitio.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <LiveUserCount filters={filters} />
            <button onClick={shareView} title="Copiar enlace a esta vista" className="flex items-center gap-1.5 h-8 px-3 bg-white border border-[#e9eae6] rounded-lg text-xs text-[#1a1a18] hover:bg-[#fafaf9]">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><circle cx="4" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.3"/><circle cx="12" cy="4" r="2" fill="none" stroke="currentColor" strokeWidth="1.3"/><circle cx="12" cy="12" r="2" fill="none" stroke="currentColor" strokeWidth="1.3"/><path d="M5.7 7l4.6-2.5M5.7 9l4.6 2.5" stroke="currentColor" strokeWidth="1.3"/></svg>
              {shareCopied ? 'Copiado' : 'Compartir'}
            </button>
            <button onClick={() => setSettingsOpen(true)} className="flex items-center gap-1.5 h-8 px-3 bg-white border border-[#e9eae6] rounded-lg text-xs text-[#1a1a18] hover:bg-[#fafaf9]">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
              Ajustes
            </button>
            <WebAnalyticsMenu
              visibleTiles={visibleTiles}
              onToggleTile={toggleTile}
              onResetTiles={resetTiles}
            />
          </div>
        </div>
        <div className="flex gap-4 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`pb-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${tab === t.key ? 'border-[#3b59f6] text-[#3b59f6]' : 'border-transparent text-[#646462] hover:text-[#1a1a18]'}`}>
              {t.label}
              {t.beta && <span className="text-[9px] font-bold text-[#f59e0b] bg-[#fef3c7] px-1 py-0.5 rounded">BETA</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white px-6 py-3 border-b border-[#e9eae6] flex flex-wrap items-center gap-2 flex-shrink-0">
        <button onClick={reload} title="Recargar todos los datos" className="flex items-center gap-1.5 h-8 px-2.5 bg-white border border-[#e9eae6] rounded-lg text-xs text-[#1a1a18] hover:bg-[#fafaf9]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M13 8A5 5 0 112 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none"/><path d="M13 4v4h-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
        </button>
        <DateRangeButton
          value={filters.range}
          compare={filters.compare}
          onChange={(range, compare) => setFilters(f => ({ ...f, range, compare }))}
        />
        <DeviceSegmented value={filters.device} onChange={(device) => setFilters(f => ({ ...f, device }))} />
        <HostsFilter
          hosts={filters.hosts}
          onChange={(hosts) => setFilters(f => ({ ...f, hosts }))}
        />
        <PropertyFilterBar
          filters={filters.properties}
          onChange={(properties) => setFilters(f => ({ ...f, properties }))}
        />
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-[#646462] cursor-pointer" title="Normaliza /user/123 → /user/:id en las páginas">
            <span>Path cleaning</span>
            <span className={`relative inline-block w-9 h-5 rounded-full transition-colors ${filters.pathCleaning ? 'bg-[#3b59f6]' : 'bg-[#d1d5db]'}`} onClick={() => setFilters(f => ({ ...f, pathCleaning: !f.pathCleaning }))}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${filters.pathCleaning ? 'translate-x-[16px]' : ''}`} />
            </span>
          </label>
          <label className="flex items-center gap-2 text-xs text-[#646462] cursor-pointer">
            <input type="checkbox" checked={filters.testAccounts} onChange={e => setFilters(f => ({ ...f, testAccounts: e.target.checked }))} className="accent-[#3b59f6]" />
            Filtrar cuentas de prueba
          </label>
          <SamplingButton mode={filters.sampling} onChange={(sampling) => setFilters(f => ({ ...f, sampling }))} />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 p-6">
        {tab === 'webAnalytics'    && <WebAnalyticsOverviewTab filters={filters} visibleTiles={visibleTiles} reloadKey={reloadKey} onChangeGraphMetric={(graphMetric) => setFilters(f => ({ ...f, graphMetric }))} />}
        {tab === 'webVitals'       && <WebVitalsTab           filters={filters} />}
        {tab === 'pageReports'     && <PageReportsTab         filters={filters} />}
        {tab === 'marketing'       && <MarketingAnalyticsTab  filters={filters} />}
        {tab === 'crossDomain'     && <CrossDomainTab         filters={filters} />}
        {tab === 'conversionGoals' && <ConversionGoalsTab     filters={filters} onOpenSettings={() => setSettingsOpen(true)} />}
      </div>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

export default WebAnalyticsScreen;
