// ─────────────────────────────────────────────────────────────────────────
// InsightEditor — mirrors PostHog's frontend/src/scenes/insights/InsightEdit
//
// Two-column layout (PostHog identical structure):
//   Left:  series builder + filters + breakdown + formula + date range
//   Right: live preview via /query/ + display mode switcher + save/discard
//
// Endpoints + payload shapes 1:1 with PostHog. UI/UX is Clain (LC palette,
// rounded-xl cards, 1px borders, sharp).
// ─────────────────────────────────────────────────────────────────────────
import * as React from 'react';
import { InsightViz } from './InsightViz';
import { TaxonomicFilter, TaxonomicFilterButton, type TaxonomicFilterValue } from './TaxonomicFilter';

// PostHog math operations — exact strings used in query nodes.
const MATH_OPTIONS: Array<{ value: string; label: string; group: 'aggregation' | 'property' | 'session' | 'hogql' }> = [
  { value: 'total',            label: 'Total count',          group: 'aggregation' },
  { value: 'dau',              label: 'Unique users',          group: 'aggregation' },
  { value: 'weekly_active',    label: 'Weekly active',         group: 'aggregation' },
  { value: 'monthly_active',   label: 'Monthly active',        group: 'aggregation' },
  { value: 'unique_session',   label: 'Unique sessions',       group: 'session' },
  { value: 'sum',              label: 'Sum (property)',        group: 'property' },
  { value: 'avg',              label: 'Average (property)',    group: 'property' },
  { value: 'min',              label: 'Min (property)',        group: 'property' },
  { value: 'max',              label: 'Max (property)',        group: 'property' },
  { value: 'median',           label: 'Median (property)',     group: 'property' },
  { value: 'p75',              label: '75th percentile',       group: 'property' },
  { value: 'p90',              label: '90th percentile',       group: 'property' },
  { value: 'p95',              label: '95th percentile',       group: 'property' },
  { value: 'p99',              label: '99th percentile',       group: 'property' },
  { value: 'hogql',            label: 'HogQL expression',      group: 'hogql' },
];

// Display modes — same string literals PostHog uses in trendsFilter.display
const DISPLAY_MODES: Array<{ value: string; label: string; icon: React.ReactNode }> = [
  { value: 'ActionsLineGraph',        label: 'Line',     icon: <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><path d="M2 12l3.5-4 3 2.5L12 4"/></svg> },
  { value: 'ActionsLineGraphCumulative', label: 'Acumulado', icon: <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><path d="M2 14l3-4 3 1 3-5 3-3"/></svg> },
  { value: 'ActionsBar',              label: 'Bar',      icon: <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><rect x="2" y="8" width="2" height="6"/><rect x="6" y="5" width="2" height="9"/><rect x="10" y="2" width="2" height="12"/></svg> },
  { value: 'ActionsStackedBar',       label: 'Bar apilado', icon: <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><rect x="2" y="3" width="3" height="11" opacity="0.5"/><rect x="6" y="6" width="3" height="8" opacity="0.5"/><rect x="10" y="2" width="3" height="12" opacity="0.5"/></svg> },
  { value: 'ActionsBarHorizontal',    label: 'Bar horizontal', icon: <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><rect x="2" y="3" width="9" height="2"/><rect x="2" y="7" width="12" height="2"/><rect x="2" y="11" width="6" height="2"/></svg> },
  { value: 'ActionsPie',              label: 'Pie',      icon: <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M8 1a7 7 0 107 7H8V1z"/><path d="M9 2.07A6 6 0 0114 7H9V2.07z" opacity="0.5"/></svg> },
  { value: 'ActionsAreaGraph',        label: 'Area',     icon: <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M2 13l3-5 3 2 3-4 3 3v4H2z"/></svg> },
  { value: 'ActionsTable',            label: 'Table',    icon: <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.3"><rect x="2" y="3" width="12" height="10"/><path d="M2 6h12M2 9h12M6 3v10"/></svg> },
  { value: 'BoldNumber',              label: 'Number',   icon: <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><text x="8" y="13" textAnchor="middle" fontSize="14" fontWeight="bold">1</text></svg> },
  { value: 'WorldMap',                label: 'World map', icon: <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.3"><circle cx="8" cy="8" r="6.5"/><path d="M1.5 8h13M8 1.5c-2 2-3 4-3 6.5s1 4.5 3 6.5c2-2 3-4 3-6.5s-1-4.5-3-6.5z"/></svg> },
];

type SeriesNode = {
  kind: 'EventsNode' | 'ActionsNode';
  event?: string;
  id?: number;
  name?: string;
  math?: string;
  math_property?: string;
  math_hogql?: string;
  properties?: Array<{ key: string; value: any; operator: string; type: string }>;
};

// Funnel-specific configuration that lives under `funnelsFilter` in the query
// node. PostHog 1:1.
type FunnelsFilter = {
  funnelOrderType?: 'ordered' | 'unordered' | 'strict';
  funnelVizType?: 'steps' | 'time_to_convert' | 'trends';
  funnelWindowInterval?: number;
  funnelWindowIntervalUnit?: 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month';
  exclusions?: Array<{ id: string; name?: string; funnel_from_step?: number; funnel_to_step?: number }>;
  binCount?: number;
};

type RetentionFilter = {
  targetEntity?: { id: string; type: 'events' | 'actions' };
  returningEntity?: { id: string; type: 'events' | 'actions' };
  retentionType?: 'retention_first_time' | 'retention_recurring';
  totalIntervals?: number;
  period?: 'Hour' | 'Day' | 'Week' | 'Month';
};

type PathsFilter = {
  pathType?: '$pageview' | '$screen' | 'custom_event' | 'hogql';
  includeEventTypes?: string[];
  startPoint?: string;
  endPoint?: string;
  stepLimit?: number;
  pathReplacements?: boolean;
  localPathCleaningFilters?: any[];
  excludeEvents?: string[];
};

type InsightEditorProps = {
  insightId: number;
  onClose: () => void;
  onSaved?: (insight: any) => void;
};

export function InsightEditor({ insightId, onClose, onSaved }: InsightEditorProps) {
  const [insight, setInsight] = React.useState<any>(null);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [series, setSeries] = React.useState<SeriesNode[]>([]);
  const [dateFrom, setDateFrom] = React.useState('-7d');
  const [dateTo, setDateTo] = React.useState<string | null>(null);
  const [display, setDisplay] = React.useState('ActionsLineGraph');
  const [compare, setCompare] = React.useState(false);
  const [compareTo, setCompareTo] = React.useState('-1w');
  const [interval, setInterval] = React.useState<'hour' | 'day' | 'week' | 'month'>('day');
  const [breakdownProp, setBreakdownProp] = React.useState<{ value: string; type: string; label?: string } | null>(null);
  const [formula, setFormula] = React.useState('');
  const [smoothingIntervals, setSmoothingIntervals] = React.useState(1);
  const [filterTestAccounts, setFilterTestAccounts] = React.useState(false);

  const [result, setResult] = React.useState<any>(null);
  const [running, setRunning] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const [favorited, setFavorited] = React.useState(false);
  const [showShare, setShowShare] = React.useState(false);
  const [showActivity, setShowActivity] = React.useState(false);
  const [showQueryInspector, setShowQueryInspector] = React.useState(false);
  const [showMore, setShowMore] = React.useState(false);
  const [showAddToDash, setShowAddToDash] = React.useState(false);
  const [globalFilters, setGlobalFilters] = React.useState<Array<{ key: string; value: any; operator: string; type: string }>>([]);

  // Per-query-kind state — only relevant fields are persisted into queryNode.
  const [funnelsFilter, setFunnelsFilter] = React.useState<FunnelsFilter>({
    funnelOrderType: 'ordered',
    funnelVizType: 'steps',
    funnelWindowInterval: 14,
    funnelWindowIntervalUnit: 'day',
    exclusions: [],
    binCount: 4,
  });
  const [retentionFilter, setRetentionFilter] = React.useState<RetentionFilter>({
    targetEntity: { id: '$pageview', type: 'events' },
    returningEntity: { id: '$pageview', type: 'events' },
    retentionType: 'retention_first_time',
    totalIntervals: 11,
    period: 'Day',
  });
  const [pathsFilter, setPathsFilter] = React.useState<PathsFilter>({
    pathType: '$pageview',
    includeEventTypes: ['$pageview'],
    stepLimit: 5,
  });
  const [hogqlText, setHogqlText] = React.useState<string>('');

  // Drill-down (Actors / People) modal
  const [actorsOpen, setActorsOpen] = React.useState<{ seriesIndex?: number; day?: string } | null>(null);

  // Load lifecycle — driven by retryToken so the "Reintentar" button can re-fire.
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [retryToken, setRetryToken] = React.useState(0);

  // ── Load insight on mount ─────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true); setLoadError(null);
    (async () => {
      try {
        const ph = await import('../../api/posthog');
        if (!ph.getProjectId()) await ph.bootstrapPostHog();
        const r: any = await ph.phGet(`/api/projects/${ph.getProjectId()}/insights/${insightId}/`);
        if (cancelled) return;
        setInsight(r);
        setName(r.name ?? r.derived_name ?? '');
        setDescription(r.description ?? '');
        const src = r.query?.source ?? r.query ?? {};
        setSeries(src.series ?? []);
        setDateFrom(src.dateRange?.date_from ?? '-7d');
        setDateTo(src.dateRange?.date_to ?? null);
        setDisplay(src.trendsFilter?.display ?? src.funnelsFilter?.layout ?? r.filters?.display ?? 'ActionsLineGraph');
        setCompare(!!src.compareFilter?.compare);
        setCompareTo(src.compareFilter?.compare_to ?? '-1w');
        setInterval(src.interval ?? 'day');
        setFormula(src.trendsFilter?.formula ?? '');
        setSmoothingIntervals(src.trendsFilter?.smoothingIntervals ?? 1);
        setFilterTestAccounts(!!src.filterTestAccounts);
        setFavorited(!!r.favorited);
        const gp = src.properties?.values ?? src.properties ?? [];
        setGlobalFilters(Array.isArray(gp) ? gp : []);
        if (src.funnelsFilter)    setFunnelsFilter(prev => ({ ...prev, ...src.funnelsFilter }));
        if (src.retentionFilter)  setRetentionFilter(prev => ({ ...prev, ...src.retentionFilter }));
        if (src.pathsFilter)      setPathsFilter(prev => ({ ...prev, ...src.pathsFilter }));
        if (src.kind === 'HogQLQuery') setHogqlText(src.query ?? '');
        if (src.breakdownFilter?.breakdown) {
          setBreakdownProp({
            value: String(src.breakdownFilter.breakdown),
            type: src.breakdownFilter.breakdown_type ?? 'event',
          });
        }
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message ?? 'Error desconocido al cargar el insight');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [insightId, retryToken]);

  // Build the current query node that goes to /query/ + into the insight save.
  // The shape changes drastically by `kind` — we follow PostHog's contract.
  const kind: string = insight?.query?.source?.kind ?? insight?.query?.kind ?? 'TrendsQuery';
  const queryNode = React.useMemo(() => {
    const common: any = {
      kind,
      dateRange: dateTo ? { date_from: dateFrom, date_to: dateTo } : { date_from: dateFrom },
      filterTestAccounts,
      properties: globalFilters.length > 0 ? { type: 'AND', values: globalFilters } : undefined,
    };
    if (kind === 'HogQLQuery') {
      return { kind: 'HogQLQuery', query: hogqlText || 'SELECT 1' };
    }
    if (kind === 'FunnelsQuery') {
      return {
        ...common,
        series: series.length > 0 ? series : [{ kind: 'EventsNode', event: '$pageview' }],
        funnelsFilter: {
          funnelOrderType: funnelsFilter.funnelOrderType,
          funnelVizType: funnelsFilter.funnelVizType,
          funnelWindowInterval: funnelsFilter.funnelWindowInterval,
          funnelWindowIntervalUnit: funnelsFilter.funnelWindowIntervalUnit,
          exclusions: funnelsFilter.exclusions?.length ? funnelsFilter.exclusions : undefined,
          binCount: funnelsFilter.funnelVizType === 'time_to_convert' ? funnelsFilter.binCount : undefined,
          layout: 'horizontal',
        },
        breakdownFilter: breakdownProp ? { breakdown: breakdownProp.value, breakdown_type: breakdownProp.type } : undefined,
      };
    }
    if (kind === 'RetentionQuery') {
      return {
        ...common,
        retentionFilter: {
          target_entity: retentionFilter.targetEntity,
          returning_entity: retentionFilter.returningEntity,
          retentionType: retentionFilter.retentionType,
          totalIntervals: retentionFilter.totalIntervals,
          period: retentionFilter.period,
        },
      };
    }
    if (kind === 'PathsQuery') {
      return {
        ...common,
        pathsFilter: {
          pathType: pathsFilter.pathType,
          includeEventTypes: pathsFilter.includeEventTypes,
          startPoint: pathsFilter.startPoint,
          endPoint: pathsFilter.endPoint,
          stepLimit: pathsFilter.stepLimit,
          excludeEvents: pathsFilter.excludeEvents,
        },
      };
    }
    // TrendsQuery, StickinessQuery, LifecycleQuery all share the same shape
    return {
      ...common,
      series: series.length > 0 ? series : [{ kind: 'EventsNode', event: '$pageview', math: 'total' }],
      interval,
      trendsFilter: kind === 'TrendsQuery' ? {
        display,
        formula: formula || undefined,
        smoothingIntervals: smoothingIntervals > 1 ? smoothingIntervals : undefined,
      } : undefined,
      stickinessFilter: kind === 'StickinessQuery' ? { display } : undefined,
      lifecycleFilter: kind === 'LifecycleQuery' ? { toggledLifecycles: ['new', 'returning', 'resurrecting', 'dormant'] } : undefined,
      compareFilter: compare ? { compare: true, compare_to: compareTo } : undefined,
      breakdownFilter: breakdownProp ? { breakdown: breakdownProp.value, breakdown_type: breakdownProp.type } : undefined,
    };
  }, [insight, kind, series, dateFrom, dateTo, display, compare, compareTo, interval, formula, smoothingIntervals, breakdownProp, filterTestAccounts, globalFilters, funnelsFilter, retentionFilter, pathsFilter, hogqlText]);

  async function toggleFavorite() {
    const next = !favorited;
    setFavorited(next);
    try {
      const ph = await import('../../api/posthog');
      await ph.posthog.insights.update(insightId, { favorited: next });
    } catch { setFavorited(!next); }
  }

  // ── Auto-run the query whenever the node changes (debounced) ─────────
  React.useEffect(() => {
    if (!autoRefresh || !insight) return;
    const handle = window.setTimeout(() => runQuery(), 500);
    return () => window.clearTimeout(handle);
  }, [JSON.stringify(queryNode), autoRefresh, insight?.id]);

  async function runQuery() {
    setRunning(true);
    try {
      const ph = await import('../../api/posthog');
      const r: any = await ph.posthog.query({ query: queryNode });
      setResult(r);
    } catch (e: any) {
      setResult({ error: e?.message ?? 'Error' });
    } finally { setRunning(false); }
  }

  async function save() {
    setSaving(true);
    try {
      const ph = await import('../../api/posthog');
      const updated: any = await ph.phPatch(`/api/projects/${ph.getProjectId()}/insights/${insightId}/`, {
        name: name.trim() || undefined,
        description: description.trim() || undefined,
        query: { kind: 'InsightVizNode', source: queryNode },
        filters: {}, // legacy field; sending {} clears it so the modern `query` is canonical
      });
      onSaved?.(updated);
    } catch (e: any) {
      alert('Error guardando: ' + (e?.message ?? ''));
    } finally { setSaving(false); }
  }

  function addSeries() {
    setSeries(s => [...s, { kind: 'EventsNode', event: '$pageview', math: 'total' }]);
  }
  function updateSeries(idx: number, patch: Partial<SeriesNode>) {
    setSeries(s => s.map((x, i) => i === idx ? { ...x, ...patch } : x));
  }
  function removeSeries(idx: number) {
    setSeries(s => s.filter((_, i) => i !== idx));
  }

  if (loadError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#fafaf9] gap-3 p-8">
        <div className="w-12 h-12 rounded-full bg-[#fee2e2] flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-6 h-6 text-[#dc2626] fill-none stroke-current" strokeWidth="1.8"><path d="M12 8v5M12 17h.01M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" strokeLinecap="round"/></svg>
        </div>
        <p className="text-sm font-semibold text-[#1a1a18]">No se pudo cargar el insight</p>
        <p className="text-[12px] text-[#646462] max-w-md text-center break-words">{loadError}</p>
        <div className="flex gap-2">
          <button onClick={onClose} className="h-8 px-3 border border-[#e9eae6] text-[12px] rounded-lg hover:bg-white text-[#646462]">Volver</button>
          <button onClick={() => setRetryToken(t => t + 1)} className="h-8 px-3 bg-[#1a1a18] text-white text-[12px] rounded-lg hover:bg-[#333]">Reintentar</button>
        </div>
      </div>
    );
  }
  if (loading || !insight) {
    return (
      <div className="flex-1 flex flex-col bg-[#fafaf9]">
        <div className="px-6 py-3 border-b border-[#e9eae6] bg-white flex items-center gap-2 flex-shrink-0">
          <div className="w-4 h-4 rounded bg-[#f3f3f1] animate-pulse" />
          <div className="h-5 flex-1 bg-[#f3f3f1] rounded animate-pulse max-w-[280px]" />
          <div className="h-7 w-20 bg-[#f3f3f1] rounded animate-pulse" />
          <div className="h-7 w-32 bg-[#f3f3f1] rounded animate-pulse" />
          <div className="h-7 w-24 bg-[#f3f3f1] rounded animate-pulse" />
        </div>
        <div className="flex-1 flex">
          <div className="w-[420px] border-r border-[#e9eae6] bg-white p-4 space-y-3">
            {[0,1,2,3,4].map(i => <div key={i} className="h-20 bg-[#f3f3f1] rounded animate-pulse" />)}
          </div>
          <div className="flex-1 p-6">
            <div className="h-full bg-white border border-[#e9eae6] rounded-xl flex items-center justify-center text-[12px] text-[#9ca3af]">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-[#3b59f6] border-t-transparent rounded-full animate-spin" />
                Cargando insight…
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#fafaf9] overflow-hidden">
      {/* Header */}
      <div className="px-6 py-3 border-b border-[#e9eae6] bg-white flex items-center gap-2 flex-shrink-0">
        <button onClick={onClose} className="text-[#646462] hover:text-[#1a1a18]" title="Volver">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.5"><path d="M10 3l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button onClick={toggleFavorite} title={favorited ? 'Quitar favorito' : 'Marcar favorito'} className="text-[#f59e0b]">
          <svg viewBox="0 0 16 16" className={`w-4 h-4 ${favorited ? 'fill-current stroke-current' : 'fill-none stroke-[#646462]'}`} strokeWidth="1.4" strokeLinejoin="round">
            <polygon points="8,2 10,6 14.5,6.5 11,9.5 12.5,14 8,11.5 3.5,14 5,9.5 1.5,6.5 6,6"/>
          </svg>
        </button>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del insight" className="text-base font-bold text-[#1a1a18] flex-1 outline-none focus:bg-[#fafaf9] rounded px-1"/>

        <label className="flex items-center gap-1.5 text-[11px] text-[#646462] cursor-pointer">
          <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="accent-[#e8572a]"/>
          Auto-refresh
        </label>
        <button onClick={runQuery} disabled={running} className="h-8 px-3 border border-[#e9eae6] text-[12px] rounded-lg hover:bg-[#fafaf9] disabled:opacity-50">{running ? '⟳…' : 'Ejecutar'}</button>
        <button onClick={() => setShowAddToDash(true)} className="h-8 px-3 border border-[#e9eae6] text-[12px] rounded-lg hover:bg-[#fafaf9] inline-flex items-center gap-1.5">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><rect x="2" y="2" width="5" height="6" rx="0.5"/><rect x="9" y="2" width="5" height="3" rx="0.5"/><rect x="9" y="7" width="5" height="7" rx="0.5"/><rect x="2" y="10" width="5" height="4" rx="0.5"/></svg>
          Añadir a dashboard
        </button>
        <button onClick={() => setShowShare(true)} className="h-8 px-3 border border-[#e9eae6] text-[12px] rounded-lg hover:bg-[#fafaf9] inline-flex items-center gap-1.5">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><circle cx="4" cy="8" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="12" cy="12" r="2"/><path d="M6 7l4-2M6 9l4 2"/></svg>
          Compartir
        </button>
        <div className="relative">
          <button onClick={() => setShowMore(o => !o)} className="h-8 px-2 border border-[#e9eae6] text-[12px] rounded-lg hover:bg-[#fafaf9]" title="Más">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><circle cx="3" cy="8" r="1.3" fill="currentColor"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="13" cy="8" r="1.3" fill="currentColor"/></svg>
          </button>
          {showMore && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMore(false)}/>
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-[#e9eae6] rounded-[10px] shadow-lg z-50 py-1">
                <button onClick={() => { setShowMore(false); setShowQueryInspector(true); }} className="w-full px-3 py-1.5 text-left text-[12px] hover:bg-[#f8f8f7]">Inspeccionar query (JSON)</button>
                <button onClick={() => { setShowMore(false); setShowActivity(true); }} className="w-full px-3 py-1.5 text-left text-[12px] hover:bg-[#f8f8f7]">Registro de actividad</button>
                <button onClick={async () => {
                  setShowMore(false);
                  try {
                    const ph = await import('../../api/posthog');
                    const r: any = await ph.posthog.insights.duplicate(insightId);
                    alert(`Duplicado como #${r?.id ?? '?'}`);
                  } catch (e: any) { alert('Error: ' + (e?.message ?? '')); }
                }} className="w-full px-3 py-1.5 text-left text-[12px] hover:bg-[#f8f8f7]">Duplicar insight</button>
                <button onClick={async () => {
                  setShowMore(false);
                  try {
                    const ph = await import('../../api/posthog');
                    await ph.phPost(`/api/projects/${ph.getProjectId()}/exports/`, { export_format: 'image/png', insight: insightId });
                    alert('Export en cola. Aparecerá en Exportaciones cuando esté listo.');
                  } catch (e: any) { alert('Error: ' + (e?.message ?? '')); }
                }} className="w-full px-3 py-1.5 text-left text-[12px] hover:bg-[#f8f8f7]">Exportar PNG</button>
                <button onClick={async () => {
                  setShowMore(false);
                  // CSV export — client-side from the current /query/ result so the
                  // user does not have to wait for PostHog's async export pipeline.
                  if (!result || result.error) { alert('Ejecuta el insight antes de exportar a CSV.'); return; }
                  const rows: string[] = [];
                  const seriesResults: any[] = Array.isArray(result.results) ? result.results : [];
                  if (kind === 'FunnelsQuery') {
                    rows.push(['Paso', 'Nombre', 'Completaron', 'Conversión %'].join(','));
                    seriesResults.forEach((s: any, i: number) => {
                      const conv = i === 0 ? 100 : ((s.count ?? 0) / (seriesResults[0]?.count || 1)) * 100;
                      rows.push([i + 1, JSON.stringify(s.name ?? s.action?.name ?? `Paso ${i+1}`), s.count ?? 0, conv.toFixed(2)].join(','));
                    });
                  } else if (kind === 'RetentionQuery') {
                    const periods = (seriesResults[0]?.values ?? []).length;
                    rows.push(['Cohort', 'Size', ...Array.from({ length: periods }, (_, i) => `W${i}`)].join(','));
                    seriesResults.forEach((c: any) => {
                      const base = c.values?.[0]?.count || 1;
                      rows.push([
                        JSON.stringify(c.label ?? c.date ?? ''),
                        base,
                        ...(c.values ?? []).map((v: any) => v.count > 0 ? ((v.count / base) * 100).toFixed(1) + '%' : ''),
                      ].join(','));
                    });
                  } else if (kind === 'PathsQuery') {
                    rows.push(['Desde', 'Hasta', 'Usuarios'].join(','));
                    seriesResults.forEach((p: any) => rows.push([JSON.stringify(p.source ?? ''), JSON.stringify(p.target ?? ''), p.value ?? 0].join(',')));
                  } else if (kind === 'HogQLQuery' && Array.isArray(result.columns)) {
                    rows.push(result.columns.map((c: string) => JSON.stringify(c)).join(','));
                    (result.results ?? []).forEach((row: any[]) => rows.push(row.map((v: any) => typeof v === 'object' ? JSON.stringify(JSON.stringify(v)) : JSON.stringify(String(v ?? ''))).join(',')));
                  } else {
                    // Trends / Stickiness / Lifecycle — date × series matrix
                    const labels: string[] = seriesResults[0]?.labels ?? seriesResults[0]?.days ?? [];
                    rows.push(['Fecha', ...seriesResults.map((s: any, i: number) => JSON.stringify(s.label ?? s.action?.name ?? `Serie ${i+1}`))].join(','));
                    labels.forEach((l: string, i: number) => rows.push([JSON.stringify(l), ...seriesResults.map((s: any) => s.data?.[i] ?? 0)].join(',')));
                  }
                  const csv = '﻿' + rows.join('\n');
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${(name || `insight-${insightId}`).replace(/[^a-z0-9_.-]+/gi, '_')}.csv`;
                  document.body.appendChild(a); a.click(); a.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }} className="w-full px-3 py-1.5 text-left text-[12px] hover:bg-[#f8f8f7]">Exportar CSV</button>
                <button onClick={() => {
                  setShowMore(false);
                  const json = JSON.stringify({
                    id: insight?.id, short_id: insight?.short_id, name, description,
                    query: { kind: 'InsightVizNode', source: queryNode },
                    result: result && !result.error ? result : null,
                  }, null, 2);
                  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${(name || `insight-${insightId}`).replace(/[^a-z0-9_.-]+/gi, '_')}.json`;
                  document.body.appendChild(a); a.click(); a.remove();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }} className="w-full px-3 py-1.5 text-left text-[12px] hover:bg-[#f8f8f7]">Exportar JSON</button>
                <button onClick={async () => {
                  setShowMore(false);
                  // PostHog uses /project/{pid}/insights/{shortId} in the URL —
                  // mirror that. We always have short_id from the load.
                  const host = (import.meta as any).env?.VITE_POSTHOG_HOST || (typeof window !== 'undefined' ? window.location.origin : '');
                  const shortId = insight?.short_id ?? insightId;
                  const url = `${host}/insights/${shortId}`;
                  try {
                    await navigator.clipboard.writeText(url);
                    alert('Enlace copiado al portapapeles');
                  } catch { window.prompt('Copia este enlace:', url); }
                }} className="w-full px-3 py-1.5 text-left text-[12px] hover:bg-[#f8f8f7]">Copiar enlace</button>
                <div className="border-t border-[#e9eae6] my-1"/>
                <button onClick={async () => {
                  setShowMore(false);
                  if (!confirm('¿Eliminar este insight? No se puede deshacer.')) return;
                  try {
                    const ph = await import('../../api/posthog');
                    await ph.posthog.insights.delete(insightId);
                    onClose();
                  } catch (e: any) { alert('Error: ' + (e?.message ?? '')); }
                }} className="w-full px-3 py-1.5 text-left text-[12px] text-[#dc2626] hover:bg-[#fef2f2]">Eliminar insight</button>
              </div>
            </>
          )}
        </div>
        <button onClick={save} disabled={saving} className="h-8 px-4 bg-[#e8572a] text-white text-[12px] font-semibold rounded-lg hover:bg-[#d44a1f] disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar y volver'}</button>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left pane — query builder */}
        <div className="w-[420px] flex-shrink-0 border-r border-[#e9eae6] bg-white overflow-y-auto">
          <div className="p-4 space-y-4">
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Descripción (opcional)" className="w-full px-2 py-1.5 text-[12px] border border-[#e9eae6] rounded-lg outline-none focus:border-[#3b59f6] resize-none"/>

            {/* Kind switcher — change the underlying query type */}
            <Section title="Tipo de insight">
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  ['TrendsQuery',     'Trends',     <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current" strokeWidth="1.5"><path d="M2 12l3.5-4 3 2.5L12 4"/></svg>],
                  ['FunnelsQuery',    'Funnel',     <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#16a34a]"><path d="M2 3h12l-3 4v4l-2 2v-6L4 3z"/></svg>],
                  ['RetentionQuery',  'Retention',  <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#9966cc]"><rect x="2" y="2" width="4" height="4"/><rect x="7" y="2" width="4" height="4" opacity="0.7"/><rect x="2" y="7" width="4" height="4" opacity="0.7"/><rect x="7" y="7" width="4" height="4" opacity="0.4"/></svg>],
                  ['PathsQuery',      'Paths',      <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-[#f59e0b]" strokeWidth="1.5"><path d="M2 4h6c2 0 2 2 0 2H6c-2 0-2 2 0 2h8" strokeLinecap="round"/></svg>],
                  ['StickinessQuery', 'Stickiness', <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#dc2626]"><circle cx="4" cy="8" r="2"/><circle cx="12" cy="8" r="2"/><path d="M6 8h4" stroke="currentColor" strokeWidth="1.5"/></svg>],
                  ['LifecycleQuery',  'Lifecycle',  <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#0ea5e9]"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M8 4v4l3 2" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>],
                  ['HogQLQuery',      'SQL/HogQL',  <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#9966cc]"><rect x="1" y="2" width="14" height="12" rx="2"/><path d="M4 6l2.5 2.5L4 11M8 11h4" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none"/></svg>],
                ] as const).map(([k, label, icon]) => (
                  <button
                    key={k}
                    onClick={() => {
                      // Mutating kind in place — we patch the insight's query node by
                      // recreating the local insight clone.
                      setInsight((cur: any) => ({ ...cur, query: { kind: 'InsightVizNode', source: { ...(cur?.query?.source ?? {}), kind: k } } }));
                    }}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded border text-[11px] text-left ${kind === k ? 'border-[#3b59f6] bg-[#eff2ff] text-[#3b59f6] font-semibold' : 'border-[#e9eae6] text-[#1a1a18] hover:bg-[#fafaf9]'}`}
                  >
                    {icon}
                    <span className="truncate">{label}</span>
                  </button>
                ))}
              </div>
            </Section>

            {/* Series builder — only for kinds that take series */}
            {(kind === 'TrendsQuery' || kind === 'FunnelsQuery' || kind === 'StickinessQuery' || kind === 'LifecycleQuery') && (
              <Section title="Series" subtitle="Cada serie es un evento o acción con su agregación">
                {series.map((s, i) => (
                  <SeriesRow
                    key={i}
                    index={i}
                    series={s}
                    onChange={(patch) => updateSeries(i, patch)}
                    onRemove={() => removeSeries(i)}
                    showRemove={series.length > 1 && kind !== 'LifecycleQuery'}
                    hideMathSelector={kind === 'FunnelsQuery' || kind === 'LifecycleQuery'}
                  />
                ))}
                {series.length === 0 && (
                  <p className="text-[11px] text-[#9ca3af] italic px-2">Sin series. Añade una para empezar.</p>
                )}
                {kind !== 'LifecycleQuery' && (
                  <button onClick={addSeries} className="w-full inline-flex items-center justify-center gap-1.5 h-8 px-3 border border-dashed border-[#e9eae6] text-[#646462] text-[12px] rounded-lg hover:border-[#e8572a] hover:text-[#e8572a]">
                    <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
                    {kind === 'FunnelsQuery' ? 'Añadir paso' : 'Añadir serie'}
                  </button>
                )}
              </Section>
            )}

            {/* Funnel-specific controls */}
            {kind === 'FunnelsQuery' && (
              <Section title="Configuración del funnel" subtitle="Cómo se calcula la conversión">
                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] text-[#646462] mb-1">Tipo de visualización</p>
                    <div className="flex gap-1">
                      {([['steps', 'Steps'], ['time_to_convert', 'Tiempo a convertir'], ['trends', 'Tendencias']] as const).map(([v, l]) => (
                        <button key={v} onClick={() => setFunnelsFilter(f => ({ ...f, funnelVizType: v }))} className={`flex-1 h-7 px-2 text-[11px] rounded border ${funnelsFilter.funnelVizType === v ? 'border-[#3b59f6] bg-[#eff2ff] text-[#3b59f6] font-semibold' : 'border-[#e9eae6] text-[#1a1a18]'}`}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#646462] mb-1">Orden de los pasos</p>
                    <div className="flex gap-1">
                      {([['ordered', 'Ordenado'], ['unordered', 'Cualquier orden'], ['strict', 'Estricto']] as const).map(([v, l]) => (
                        <button key={v} onClick={() => setFunnelsFilter(f => ({ ...f, funnelOrderType: v }))} className={`flex-1 h-7 px-2 text-[10px] rounded border ${funnelsFilter.funnelOrderType === v ? 'border-[#3b59f6] bg-[#eff2ff] text-[#3b59f6] font-semibold' : 'border-[#e9eae6] text-[#1a1a18]'}`}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#646462] mb-1">Ventana de conversión</p>
                    <div className="flex items-center gap-1.5">
                      <input type="number" min={1} value={funnelsFilter.funnelWindowInterval ?? 14} onChange={e => setFunnelsFilter(f => ({ ...f, funnelWindowInterval: Number(e.target.value) }))} className="w-16 h-7 px-2 border border-[#e9eae6] rounded text-[11px] text-center"/>
                      <select value={funnelsFilter.funnelWindowIntervalUnit ?? 'day'} onChange={e => setFunnelsFilter(f => ({ ...f, funnelWindowIntervalUnit: e.target.value as any }))} className="flex-1 h-7 px-2 border border-[#e9eae6] rounded text-[11px] bg-white">
                        <option value="second">segundos</option>
                        <option value="minute">minutos</option>
                        <option value="hour">horas</option>
                        <option value="day">días</option>
                        <option value="week">semanas</option>
                        <option value="month">meses</option>
                      </select>
                    </div>
                  </div>
                  {funnelsFilter.funnelVizType === 'time_to_convert' && (
                    <div>
                      <p className="text-[10px] text-[#646462] mb-1">Bins del histograma</p>
                      <input type="number" min={2} max={20} value={funnelsFilter.binCount ?? 4} onChange={e => setFunnelsFilter(f => ({ ...f, binCount: Number(e.target.value) }))} className="w-full h-7 px-2 border border-[#e9eae6] rounded text-[11px]"/>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] text-[#646462] mb-1">Eventos a excluir entre pasos</p>
                    <div className="space-y-1">
                      {(funnelsFilter.exclusions ?? []).map((ex, i) => (
                        <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-[#fef2f2] border border-[#fecaca] rounded">
                          <code className="text-[11px] text-[#1a1a18] font-mono flex-1 truncate">{ex.name ?? ex.id}</code>
                          <span className="text-[10px] text-[#646462]">{ex.funnel_from_step ?? 0}→{ex.funnel_to_step ?? series.length - 1}</span>
                          <button onClick={() => setFunnelsFilter(f => ({ ...f, exclusions: (f.exclusions ?? []).filter((_, j) => j !== i) }))} className="text-[#dc2626]">×</button>
                        </div>
                      ))}
                      <TaxonomicFilterButton
                        taxonomicGroupTypes={['events', 'actions']}
                        buttonLabel="+ Excluir evento"
                        onChange={(sel) => setFunnelsFilter(f => ({ ...f, exclusions: [...(f.exclusions ?? []), { id: String(sel.value), name: sel.item.label, funnel_from_step: 0, funnel_to_step: series.length - 1 }] }))}
                      />
                    </div>
                  </div>
                </div>
              </Section>
            )}

            {/* Retention-specific controls */}
            {kind === 'RetentionQuery' && (
              <Section title="Configuración de retención" subtitle="Cohort que vuelve a hacer una acción">
                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] text-[#646462] mb-1">Cohort inicial — usuarios que hicieron</p>
                    <TaxonomicFilterButton
                      taxonomicGroupTypes={['events', 'actions']}
                      buttonLabel="Selecciona evento"
                      selectionLabel={retentionFilter.targetEntity?.id}
                      onChange={(sel) => setRetentionFilter(f => ({ ...f, targetEntity: { id: String(sel.value), type: sel.group === 'actions' ? 'actions' : 'events' } }))}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-[#646462] mb-1">Vuelven a hacer</p>
                    <TaxonomicFilterButton
                      taxonomicGroupTypes={['events', 'actions']}
                      buttonLabel="Selecciona evento"
                      selectionLabel={retentionFilter.returningEntity?.id}
                      onChange={(sel) => setRetentionFilter(f => ({ ...f, returningEntity: { id: String(sel.value), type: sel.group === 'actions' ? 'actions' : 'events' } }))}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-[#646462] mb-1">Tipo de retención</p>
                    <select value={retentionFilter.retentionType ?? 'retention_first_time'} onChange={e => setRetentionFilter(f => ({ ...f, retentionType: e.target.value as any }))} className="w-full h-7 px-2 border border-[#e9eae6] rounded text-[11px] bg-white">
                      <option value="retention_first_time">Primera vez</option>
                      <option value="retention_recurring">Recurrente</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1">
                      <p className="text-[10px] text-[#646462] mb-1">Periodo</p>
                      <select value={retentionFilter.period ?? 'Day'} onChange={e => setRetentionFilter(f => ({ ...f, period: e.target.value as any }))} className="w-full h-7 px-2 border border-[#e9eae6] rounded text-[11px] bg-white">
                        <option value="Hour">Hora</option>
                        <option value="Day">Día</option>
                        <option value="Week">Semana</option>
                        <option value="Month">Mes</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] text-[#646462] mb-1">Intervalos totales</p>
                      <input type="number" min={2} max={50} value={retentionFilter.totalIntervals ?? 11} onChange={e => setRetentionFilter(f => ({ ...f, totalIntervals: Number(e.target.value) }))} className="w-full h-7 px-2 border border-[#e9eae6] rounded text-[11px]"/>
                    </div>
                  </div>
                </div>
              </Section>
            )}

            {/* Paths-specific controls */}
            {kind === 'PathsQuery' && (
              <Section title="Configuración de paths" subtitle="Flujo de eventos del usuario">
                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] text-[#646462] mb-1">Tipo de path</p>
                    <select value={pathsFilter.pathType ?? '$pageview'} onChange={e => setPathsFilter(f => ({ ...f, pathType: e.target.value as any }))} className="w-full h-7 px-2 border border-[#e9eae6] rounded text-[11px] bg-white">
                      <option value="$pageview">Pageviews</option>
                      <option value="$screen">Screens (mobile)</option>
                      <option value="custom_event">Eventos personalizados</option>
                      <option value="hogql">HogQL</option>
                    </select>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#646462] mb-1">Punto de entrada (opcional)</p>
                    <input value={pathsFilter.startPoint ?? ''} onChange={e => setPathsFilter(f => ({ ...f, startPoint: e.target.value || undefined }))} placeholder="/landing" className="w-full h-7 px-2 border border-[#e9eae6] rounded text-[11px] font-mono"/>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#646462] mb-1">Punto de salida (opcional)</p>
                    <input value={pathsFilter.endPoint ?? ''} onChange={e => setPathsFilter(f => ({ ...f, endPoint: e.target.value || undefined }))} placeholder="/signup" className="w-full h-7 px-2 border border-[#e9eae6] rounded text-[11px] font-mono"/>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#646462] mb-1">Número máximo de pasos</p>
                    <input type="number" min={2} max={20} value={pathsFilter.stepLimit ?? 5} onChange={e => setPathsFilter(f => ({ ...f, stepLimit: Number(e.target.value) }))} className="w-full h-7 px-2 border border-[#e9eae6] rounded text-[11px]"/>
                  </div>
                </div>
              </Section>
            )}

            {/* HogQL editor when kind is HogQLQuery */}
            {kind === 'HogQLQuery' && (
              <Section title="HogQL" subtitle="Consulta SQL contra tus datos">
                <textarea
                  value={hogqlText}
                  onChange={e => setHogqlText(e.target.value)}
                  rows={10}
                  placeholder="SELECT count() FROM events WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 7 DAY"
                  className="w-full px-2 py-1.5 border border-[#e9eae6] rounded font-mono text-[11px] resize-none focus:border-[#3b59f6] outline-none"
                  spellCheck={false}
                />
                <p className="text-[10px] text-[#9ca3af]">Tip: Ctrl/⌘+Enter para ejecutar.</p>
              </Section>
            )}

            {/* Filters */}
            <Section title="Filtros globales" subtitle="Aplicados a todas las series del insight">
              <label className="flex items-center gap-2 text-[12px] text-[#1a1a18] cursor-pointer">
                <input type="checkbox" checked={filterTestAccounts} onChange={e => setFilterTestAccounts(e.target.checked)} className="accent-[#e8572a]"/>
                Filtrar cuentas de prueba (cohort interno)
              </label>
              <div className="space-y-1.5">
                {globalFilters.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-[#fafaf9] border border-[#e9eae6] rounded">
                    <span className="text-[10px] uppercase tracking-wide text-[#646462]">{f.type}</span>
                    <code className="text-[11px] text-[#1a1a18] font-mono flex-1 truncate">{f.key} {f.operator} {String(f.value)}</code>
                    <button onClick={() => setGlobalFilters(fs => fs.filter((_, j) => j !== i))} className="text-[#dc2626] hover:text-[#b91c1c]">×</button>
                  </div>
                ))}
                <TaxonomicFilterButton
                  taxonomicGroupTypes={['event_properties', 'person_properties', 'cohorts', 'session_properties']}
                  buttonLabel="+ Añadir filtro"
                  onChange={(sel: TaxonomicFilterValue) => {
                    const typeMap: Record<string, string> = { event_properties: 'event', person_properties: 'person', cohorts: 'cohort', session_properties: 'session' };
                    setGlobalFilters(fs => [...fs, { key: String(sel.value), value: '', operator: 'exact', type: typeMap[sel.group] ?? 'event' }]);
                  }}
                />
              </div>
            </Section>

            {/* Breakdown — not for Retention / Paths / HogQL */}
            {kind !== 'RetentionQuery' && kind !== 'PathsQuery' && kind !== 'HogQLQuery' && (
            <Section title="Desglose" subtitle="Una sola dimensión por la que partir las series">
              <div className="flex items-center gap-2">
                <TaxonomicFilterButton
                  taxonomicGroupTypes={['event_properties', 'person_properties', 'cohorts']}
                  buttonLabel="Sin desglose"
                  selectionLabel={breakdownProp?.label || breakdownProp?.value || undefined}
                  onChange={(sel: TaxonomicFilterValue) => {
                    const typeMap: Record<string, string> = { event_properties: 'event', person_properties: 'person', cohorts: 'cohort' };
                    setBreakdownProp({ value: String(sel.value), type: typeMap[sel.group] ?? 'event', label: sel.item.label });
                  }}
                />
                {breakdownProp && <button onClick={() => setBreakdownProp(null)} className="text-[11px] text-[#dc2626] hover:underline">Quitar</button>}
              </div>
            </Section>
            )}

            {/* Date range */}
            <Section title="Rango de fechas">
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { v: '-24h',  l: '24h' },
                  { v: '-7d',   l: '7d' },
                  { v: '-14d',  l: '14d' },
                  { v: '-30d',  l: '30d' },
                  { v: '-90d',  l: '90d' },
                  { v: 'mStart', l: 'Mes' },
                  { v: 'all',   l: 'Todo' },
                ].map(p => (
                  <button key={p.v} onClick={() => { setDateFrom(p.v); setDateTo(null); }} className={`h-7 px-2.5 text-[11px] rounded border ${dateFrom === p.v && !dateTo ? 'border-[#3b59f6] bg-[#eff2ff] text-[#3b59f6] font-semibold' : 'border-[#e9eae6] text-[#1a1a18] hover:bg-[#fafaf9]'}`}>{p.l}</button>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <label className="text-[10px] text-[#646462]">Desde</label>
                <input type="date" value={dateFrom.match(/^\d{4}-\d{2}-\d{2}$/) ? dateFrom : ''} onChange={e => setDateFrom(e.target.value || '-7d')} className="flex-1 h-7 px-2 border border-[#e9eae6] rounded text-[11px]"/>
                <label className="text-[10px] text-[#646462]">Hasta</label>
                <input type="date" value={dateTo ?? ''} onChange={e => setDateTo(e.target.value || null)} className="flex-1 h-7 px-2 border border-[#e9eae6] rounded text-[11px]"/>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[11px] text-[#646462]">Intervalo</span>
                <select value={interval} onChange={e => setInterval(e.target.value as any)} className="h-7 px-2 border border-[#e9eae6] rounded text-[11px] bg-white flex-1">
                  <option value="hour">Hora</option>
                  <option value="day">Día</option>
                  <option value="week">Semana</option>
                  <option value="month">Mes</option>
                </select>
              </div>
              <label className="flex items-center gap-2 mt-2 text-[11px] text-[#1a1a18] cursor-pointer">
                <input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} className="accent-[#e8572a]"/>
                Comparar con periodo anterior
              </label>
              {compare && (
                <select value={compareTo} onChange={e => setCompareTo(e.target.value)} className="w-full mt-1 h-7 px-2 border border-[#e9eae6] rounded text-[11px] bg-white">
                  <option value="-1w">Hace 1 semana</option>
                  <option value="-1m">Hace 1 mes</option>
                  <option value="-1q">Hace 1 trimestre</option>
                  <option value="-1y">Hace 1 año</option>
                </select>
              )}
            </Section>

            {/* Formula — Trends only */}
            {kind === 'TrendsQuery' && (
              <Section title="Fórmula" subtitle="Combina series con A, B, C…">
                <input
                  value={formula}
                  onChange={e => setFormula(e.target.value)}
                  placeholder="A + B   o   (A / B) * 100"
                  className="w-full h-8 px-2 border border-[#e9eae6] rounded text-[12px] font-mono outline-none focus:border-[#3b59f6]"
                />
              </Section>
            )}

            {/* Smoothing — Trends only */}
            {kind === 'TrendsQuery' && (
              <Section title="Suavizado">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#646462]">Promedio móvil</span>
                  <input type="number" min={1} max={30} value={smoothingIntervals} onChange={e => setSmoothingIntervals(Math.max(1, Number(e.target.value)))} className="w-16 h-7 px-2 border border-[#e9eae6] rounded text-[11px] text-center"/>
                  <span className="text-[11px] text-[#646462]">{interval}s</span>
                </div>
              </Section>
            )}
          </div>
        </div>

        {/* Right pane — live preview */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Display switcher */}
          <div className="px-6 py-3 border-b border-[#e9eae6] bg-white flex items-center gap-1.5 flex-wrap flex-shrink-0">
            {DISPLAY_MODES.map(d => (
              <button
                key={d.value}
                onClick={() => setDisplay(d.value)}
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[11px] border ${display === d.value ? 'border-[#3b59f6] bg-[#eff2ff] text-[#3b59f6] font-semibold' : 'border-[#e9eae6] text-[#1a1a18] hover:bg-[#fafaf9]'}`}
              >
                {d.icon}
                {d.label}
              </button>
            ))}
          </div>

          {/* Chart */}
          <div className="flex-1 min-h-0 p-6 overflow-hidden">
            <div className="bg-white border border-[#e9eae6] rounded-xl h-full flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-[#e9eae6] flex-shrink-0">
                <p className="text-[12px] font-semibold text-[#1a1a18]">{name || 'Nuevo insight'}</p>
                {running && <span className="text-[10px] text-[#646462]">⟳ ejecutando…</span>}
                {result?.error && <span className="text-[10px] text-[#dc2626]">{result.error}</span>}
              </div>
              <div className="flex-1 min-h-0 p-4 relative">
                {result && !result.error ? (
                  <>
                    <InsightViz
                      insight={{ ...insight, query: { kind: 'InsightVizNode', source: queryNode } }}
                      result={result}
                    />
                    {/* Drill-down trigger — small button bottom-right */}
                    {(kind === 'TrendsQuery' || kind === 'FunnelsQuery' || kind === 'StickinessQuery' || kind === 'LifecycleQuery') && (
                      <button
                        onClick={() => setActorsOpen({})}
                        title="Ver personas que contribuyeron"
                        className="absolute bottom-2 right-2 h-7 px-2.5 bg-white/90 backdrop-blur border border-[#e9eae6] rounded-md text-[10px] font-semibold text-[#1a1a18] hover:bg-white hover:border-[#3b59f6] hover:text-[#3b59f6] inline-flex items-center gap-1"
                      >
                        <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current" strokeWidth="1.5"><circle cx="6" cy="6.5" r="2.5"/><path d="M2 14c0-2.21 1.79-4 4-4s4 1.79 4 4M10.5 4.5a2 2 0 100 4M14 13a3.5 3.5 0 00-3.5-3.5"/></svg>
                        Ver personas
                      </button>
                    )}
                  </>
                ) : !running ? (
                  <div className="h-full flex items-center justify-center text-[12px] text-[#9ca3af]">Ajusta los parámetros para ver datos.</div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showShare && (
        <InsightShareModal insightId={insightId} insightName={name} onClose={() => setShowShare(false)}/>
      )}
      {showActivity && (
        <InsightActivityModal insightId={insightId} insightName={name} onClose={() => setShowActivity(false)}/>
      )}
      {showQueryInspector && (
        <QueryInspectorModal queryNode={queryNode} result={result} onClose={() => setShowQueryInspector(false)}/>
      )}
      {showAddToDash && (
        <AddInsightToDashModal insightId={insightId} insight={insight} onClose={() => setShowAddToDash(false)}/>
      )}
      {actorsOpen && (
        <ActorsDrillDownModal
          insightId={insightId}
          queryNode={queryNode}
          context={actorsOpen}
          onClose={() => setActorsOpen(null)}
        />
      )}
    </div>
  );
}

// ─── ActorsDrillDownModal — "Who did this?" people list ─────────────────
// PostHog's drill-down — runs an ActorsQuery at /query/ to fetch the people
// (or groups) that produced the data point the user clicked on.
function ActorsDrillDownModal({ insightId, queryNode, context, onClose }: {
  insightId: number;
  queryNode: any;
  context: { seriesIndex?: number; day?: string };
  onClose: () => void;
}) {
  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [count, setCount] = React.useState(0);
  const [retry, setRetry] = React.useState(0);
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const ph = await import('../../api/posthog');
        // Build an ActorsQuery from the underlying query node, restricted to
        // the series index + day if provided.
        const actorsBody: any = {
          source: queryNode,
          select: ['actor', 'event_count'],
          orderBy: ['event_count DESC'],
          offset: 0,
          limit: 100,
        };
        if (context.seriesIndex != null) actorsBody.source = { ...queryNode, _series_index: context.seriesIndex };
        if (context.day)                 actorsBody.source = { ...actorsBody.source, _date: context.day };
        const r: any = await ph.posthog.insights.actors(actorsBody);
        if (cancelled) return;
        setRows(r?.results ?? []);
        setCount(r?.results?.length ?? 0);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'No se pudieron cargar las personas');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [insightId, JSON.stringify(context), retry]);
  return (
    <div className="fixed inset-0 bg-[#1a1a18]/30 z-[60] flex items-center justify-center px-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-[#e9eae6] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#1a1a18]">Personas que contribuyeron a este punto</h2>
            {context.day && <p className="text-[11px] text-[#646462]">Para el día {context.day}{context.seriesIndex != null ? ` · serie ${String.fromCharCode(65 + context.seriesIndex)}` : ''}</p>}
          </div>
          <button onClick={onClose} className="text-[#646462] hover:text-[#1a1a18]">×</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-2">{[0,1,2,3].map(i => <div key={i} className="h-9 bg-[#f3f3f1] rounded animate-pulse"/>)}</div>
          ) : error ? (
            <div className="text-center py-6">
              <p className="text-[12px] font-semibold text-[#dc2626] mb-1">Error al cargar personas</p>
              <p className="text-[11px] text-[#646462] mb-3 break-words max-w-md mx-auto">{error}</p>
              <button onClick={() => setRetry(r => r + 1)} className="h-7 px-3 bg-[#1a1a18] text-white text-[11px] rounded">Reintentar</button>
            </div>
          ) : rows.length === 0 ? (
            <p className="text-center text-[13px] text-[#646462] italic py-6">No hay personas que cumplan estos criterios.</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[#e9eae6] bg-[#fafaf9]">
                  <th className="text-left px-4 py-2 text-[10px] font-bold text-[#646462] uppercase tracking-wide">Persona</th>
                  <th className="text-left px-4 py-2 text-[10px] font-bold text-[#646462] uppercase tracking-wide">Email</th>
                  <th className="text-right px-4 py-2 text-[10px] font-bold text-[#646462] uppercase tracking-wide">Eventos</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: any, i: number) => {
                  // ActorsQuery returns rows like [actorRecord, eventCount]
                  const actor = Array.isArray(row) ? row[0] : (row.actor ?? row);
                  const eventCount = Array.isArray(row) ? row[1] : (row.event_count ?? row.count ?? 0);
                  const name = actor?.name || actor?.distinct_ids?.[0] || actor?.id || '—';
                  const email = actor?.properties?.email || '';
                  return (
                    <tr key={i} className="border-b border-[#f3f3f1] hover:bg-[#fafaf9]">
                      <td className="px-4 py-2 text-[#1a1a18]">{name}</td>
                      <td className="px-4 py-2 text-[#646462]">{email}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{Number(eventCount).toLocaleString('es-ES')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-5 py-2 border-t border-[#e9eae6] text-[11px] text-[#646462] flex justify-between">
          <span>{count} resultados</span>
          <button onClick={onClose} className="text-[#646462] hover:text-[#1a1a18]">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Insight-specific modals ──────────────────────────────────────────────
function InsightShareModal({ insightId, insightName, onClose }: { insightId: number; insightName: string; onClose: () => void }) {
  const [config, setConfig] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState('');
  const [savingPwd, setSavingPwd] = React.useState(false);
  const [retry, setRetry] = React.useState(0);
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const ph = await import('../../api/posthog');
        const res: any = await ph.posthog.insights.sharing(insightId);
        if (cancelled) return;
        setConfig(res ?? { enabled: false });
        setPassword(res?.password ?? '');
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'No se pudo cargar la configuración de compartir');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [insightId, retry]);
  async function patchConfig(patch: any) {
    try {
      const ph = await import('../../api/posthog');
      const updated: any = await ph.posthog.insights.setSharing(insightId, patch);
      setConfig({ ...config, ...patch, ...updated });
    } catch (e: any) { alert('Error: ' + (e?.message ?? '')); }
  }
  const host = (import.meta as any).env?.VITE_POSTHOG_HOST || (typeof window !== 'undefined' ? window.location.origin : '');
  const shareUrl = config?.access_token ? `${host}/shared/${config.access_token}` : '';
  const embedCode = shareUrl ? `<iframe src="${shareUrl}?embedded" frameborder="0" width="100%" height="400"></iframe>` : '';
  return (
    <div className="fixed inset-0 bg-[#1a1a18]/30 z-[60] flex items-center justify-center px-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e9eae6] flex items-center justify-between">
          <h2 className="text-base font-bold text-[#1a1a18]">Compartir "{insightName}"</h2>
          <button onClick={onClose} className="text-[#646462] hover:text-[#1a1a18]">×</button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          {loading ? (
            <div className="space-y-3 py-2">
              <div className="h-5 w-44 bg-[#f3f3f1] rounded animate-pulse"/>
              <div className="h-3 w-72 bg-[#f3f3f1] rounded animate-pulse"/>
              <div className="h-8 w-full bg-[#f3f3f1] rounded animate-pulse"/>
            </div>
          ) : error ? (
            <div className="py-4 text-center">
              <p className="text-[12px] font-semibold text-[#dc2626] mb-1">Error</p>
              <p className="text-[11px] text-[#646462] mb-3 break-words">{error}</p>
              <button onClick={() => setRetry(r => r + 1)} className="h-7 px-3 bg-[#1a1a18] text-white text-[11px] rounded">Reintentar</button>
            </div>
          ) : (
            <>
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="text-[13px] font-semibold text-[#1a1a18]">Compartir públicamente</p>
                  <p className="text-[11px] text-[#646462]">Cualquier persona con el enlace podrá ver este insight.</p>
                </div>
                <span className={`relative inline-flex h-5 w-9 items-center rounded-full ${config?.enabled ? 'bg-[#e8572a]' : 'bg-[#e9eae6]'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config?.enabled ? 'translate-x-4' : 'translate-x-0.5'}`}/>
                </span>
                <input type="checkbox" className="hidden" checked={!!config?.enabled} onChange={e => patchConfig({ enabled: e.target.checked })}/>
              </label>
              {config?.enabled && shareUrl && (
                <>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#646462] mb-1">Enlace público</p>
                    <div className="flex gap-2"><input readOnly value={shareUrl} className="flex-1 h-8 px-2 border border-[#e9eae6] rounded text-[11px] font-mono bg-[#fafaf9]"/><button onClick={() => navigator.clipboard.writeText(shareUrl)} className="h-8 px-3 bg-[#1a1a18] text-white text-[11px] rounded">Copiar</button></div>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#646462] mb-1">Código embebido</p>
                    <div className="flex items-start gap-2"><textarea readOnly rows={3} value={embedCode} className="flex-1 px-2 py-1 border border-[#e9eae6] rounded text-[11px] font-mono bg-[#fafaf9] resize-none"/><button onClick={() => navigator.clipboard.writeText(embedCode)} className="h-8 px-3 bg-[#1a1a18] text-white text-[11px] rounded">Copiar</button></div>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#646462] mb-1">Contraseña (opcional)</p>
                    <div className="flex gap-2">
                      <input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="Deja vacío para sin contraseña" className="flex-1 h-8 px-2 border border-[#e9eae6] rounded text-[11px]"/>
                      <button disabled={savingPwd} onClick={async () => {
                        setSavingPwd(true);
                        try { await patchConfig({ password: password.trim() || null }); } finally { setSavingPwd(false); }
                      }} className="h-8 px-3 bg-[#e8572a] text-white text-[11px] rounded disabled:opacity-50">{savingPwd ? 'Guardando…' : 'Guardar'}</button>
                    </div>
                    <p className="text-[10px] text-[#9ca3af] mt-1">Si se establece, el destinatario necesitará esta contraseña para acceder al insight.</p>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InsightActivityModal({ insightId, insightName, onClose }: { insightId: number; insightName: string; onClose: () => void }) {
  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [retry, setRetry] = React.useState(0);
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const ph = await import('../../api/posthog');
        const res: any = await ph.posthog.insights.activity(insightId, { limit: 50 });
        if (!cancelled) setRows(res?.results ?? []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'No se pudo cargar la actividad');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [insightId, retry]);
  return (
    <div className="fixed inset-0 bg-[#1a1a18]/30 z-[60] flex items-center justify-center px-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e9eae6] flex items-center justify-between">
          <h2 className="text-base font-bold text-[#1a1a18]">Actividad · {insightName}</h2>
          <button onClick={onClose} className="text-[#646462] hover:text-[#1a1a18]">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <ul className="space-y-2">
              {[0,1,2,3].map(i => <li key={i} className="h-14 bg-[#f3f3f1] rounded animate-pulse"/>)}
            </ul>
          ) : error ? (
            <div className="text-center py-6">
              <p className="text-[12px] font-semibold text-[#dc2626] mb-1">Error al cargar la actividad</p>
              <p className="text-[11px] text-[#646462] mb-3 break-words">{error}</p>
              <button onClick={() => setRetry(r => r + 1)} className="h-7 px-3 bg-[#1a1a18] text-white text-[11px] rounded">Reintentar</button>
            </div>
          ) : rows.length === 0 ? (
            <p className="text-center text-[13px] text-[#646462] italic py-6">Sin actividad registrada.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((r: any, i: number) => (
                <li key={r.id ?? i} className="border border-[#e9eae6] rounded-lg p-3 text-[12px]">
                  <p className="text-[#1a1a18]"><strong>{r.user?.first_name || r.user?.email || 'Sistema'}</strong> {r.activity ?? r.action ?? 'modificó'} · {r.scope ?? 'Insight'}</p>
                  <p className="text-[10px] text-[#646462]">{r.created_at ? new Date(r.created_at).toLocaleString('es-ES') : ''}</p>
                  {r.detail?.changes && Array.isArray(r.detail.changes) && (
                    <pre className="mt-1 font-mono text-[10px] bg-[#fafaf9] border border-[#e9eae6] rounded px-2 py-1 overflow-x-auto">{JSON.stringify(r.detail.changes, null, 2)}</pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function QueryInspectorModal({ queryNode, result, onClose }: { queryNode: any; result: any; onClose: () => void }) {
  const [tab, setTab] = React.useState<'query' | 'result' | 'hogql'>('query');
  const hogql = result?.hogql ?? result?.query?.hogql ?? null;
  return (
    <div className="fixed inset-0 bg-[#1a1a18]/30 z-[60] flex items-center justify-center px-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-[#e9eae6] flex items-center gap-3">
          <h2 className="text-base font-bold text-[#1a1a18] flex-1">Inspeccionar query</h2>
          <button onClick={onClose} className="text-[#646462] hover:text-[#1a1a18]">×</button>
        </div>
        <div className="px-5 pt-2 border-b border-[#e9eae6] flex items-center gap-3">
          {(['query', 'result', 'hogql'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`pb-2 text-[12px] font-semibold border-b-2 ${tab === t ? 'border-[#e8572a] text-[#1a1a18]' : 'border-transparent text-[#646462]'}`}>
              {t === 'query' ? 'Query node' : t === 'result' ? 'Resultado' : 'HogQL generado'}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'query' && <pre className="font-mono text-[11px] bg-[#fafaf9] border border-[#e9eae6] rounded p-3 overflow-x-auto">{JSON.stringify(queryNode, null, 2)}</pre>}
          {tab === 'result' && <pre className="font-mono text-[11px] bg-[#fafaf9] border border-[#e9eae6] rounded p-3 overflow-x-auto">{JSON.stringify(result, null, 2)}</pre>}
          {tab === 'hogql' && (hogql ? <pre className="font-mono text-[11px] bg-[#fafaf9] border border-[#e9eae6] rounded p-3 overflow-x-auto whitespace-pre-wrap">{hogql}</pre> : <p className="text-[12px] text-[#9ca3af] italic">No hay HogQL generado para esta query. Ejecuta primero.</p>)}
        </div>
      </div>
    </div>
  );
}

function AddInsightToDashModal({ insightId, insight, onClose }: { insightId: number; insight: any; onClose: () => void }) {
  const [dashboards, setDashboards] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [busy, setBusy] = React.useState<number | null>(null);
  const [retry, setRetry] = React.useState(0);
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const ph = await import('../../api/posthog');
        const res: any = await ph.posthog.dashboards.list({ limit: 200 });
        if (!cancelled) setDashboards(res?.results ?? []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'No se pudo cargar la lista de dashboards');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [retry]);
  async function attach(dashId: number) {
    setBusy(dashId);
    try {
      const ph = await import('../../api/posthog');
      const cur: number[] = insight?.dashboards ?? [];
      const next = Array.from(new Set([...cur, dashId]));
      await ph.posthog.insights.update(insightId, { dashboards: next });
      onClose();
    } catch (e: any) { alert('Error: ' + (e?.message ?? '')); }
    finally { setBusy(null); }
  }
  const filtered = dashboards.filter(d => !search || d.name?.toLowerCase().includes(search.toLowerCase()));
  const already: number[] = insight?.dashboards ?? [];
  return (
    <div className="fixed inset-0 bg-[#1a1a18]/30 z-[60] flex items-center justify-center px-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-[#e9eae6] flex items-center justify-between">
          <h2 className="text-base font-bold text-[#1a1a18]">Añadir a dashboard</h2>
          <button onClick={onClose} className="text-[#646462] hover:text-[#1a1a18]">×</button>
        </div>
        <div className="p-3 border-b border-[#e9eae6]">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar dashboards…" className="w-full h-8 px-2 border border-[#e9eae6] rounded text-[12px] outline-none focus:border-[#3b59f6]"/>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-3 space-y-2">{[0,1,2].map(i => <div key={i} className="h-8 bg-[#f3f3f1] rounded animate-pulse"/>)}</div>
          ) : error ? (
            <div className="text-center py-6">
              <p className="text-[12px] font-semibold text-[#dc2626] mb-1">Error</p>
              <p className="text-[11px] text-[#646462] mb-3 break-words">{error}</p>
              <button onClick={() => setRetry(r => r + 1)} className="h-7 px-3 bg-[#1a1a18] text-white text-[11px] rounded">Reintentar</button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-[13px] text-[#646462] italic py-6">Sin dashboards.</p>
          ) : filtered.map((d: any) => {
            const isIn = already.includes(d.id);
            return (
              <button key={d.id} onClick={() => !isIn && attach(d.id)} disabled={isIn || busy === d.id} className="w-full text-left px-4 py-2 hover:bg-[#fafaf9] border-b border-[#f3f3f1] flex items-center gap-2 disabled:opacity-50">
                <span className="text-[13px] text-[#1a1a18] flex-1 truncate">{d.name}</span>
                <span className="text-[11px] text-[#3b59f6]">{isIn ? '✓ Ya añadido' : busy === d.id ? '…' : 'Añadir →'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-[11px] font-bold text-[#646462] uppercase tracking-wide">{title}</p>
        {subtitle && <p className="text-[10px] text-[#9ca3af]">{subtitle}</p>}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function SeriesRow({ series, index, onChange, onRemove, showRemove, hideMathSelector = false }: {
  series: SeriesNode;
  index: number;
  onChange: (patch: Partial<SeriesNode>) => void;
  onRemove: () => void;
  showRemove: boolean;
  hideMathSelector?: boolean;
}) {
  const letter = String.fromCharCode(65 + index); // A, B, C…
  const eventLabel = series.event ?? series.name ?? `${series.kind === 'ActionsNode' ? 'Acción' : 'Evento'} ${index + 1}`;
  const mathRequiresProperty = ['sum', 'avg', 'min', 'max', 'median', 'p75', 'p90', 'p95', 'p99'].includes(series.math ?? '');
  const propsLen = series.properties?.length ?? 0;

  return (
    <div className="border border-[#e9eae6] rounded-lg p-2 bg-[#fafaf9] space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="w-5 h-5 rounded-full bg-[#fef3c7] text-[#92400e] flex items-center justify-center text-[10px] font-bold flex-shrink-0">{letter}</span>
        <TaxonomicFilterButton
          taxonomicGroupTypes={['events', 'actions']}
          buttonLabel="Elegir evento"
          selectionLabel={eventLabel}
          initialGroupType={series.kind === 'ActionsNode' ? 'actions' : 'events'}
          onChange={(sel) => {
            if (sel.group === 'actions') {
              onChange({ kind: 'ActionsNode', id: Number(sel.value), event: undefined, name: sel.item.label });
            } else {
              onChange({ kind: 'EventsNode', event: String(sel.value), id: undefined, name: sel.item.label });
            }
          }}
        />
        {showRemove && (
          <button onClick={onRemove} className="text-[#dc2626] hover:text-[#b91c1c] flex-shrink-0">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round"/></svg>
          </button>
        )}
      </div>
      {!hideMathSelector && (
        <div className="flex items-center gap-1.5 pl-7">
          <select
            value={series.math ?? 'total'}
            onChange={e => onChange({ math: e.target.value })}
            className="flex-1 h-7 px-2 border border-[#e9eae6] rounded text-[11px] bg-white"
          >
            <optgroup label="Agregación">{MATH_OPTIONS.filter(m => m.group === 'aggregation').map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</optgroup>
            <optgroup label="Sesión">{MATH_OPTIONS.filter(m => m.group === 'session').map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</optgroup>
            <optgroup label="Propiedad">{MATH_OPTIONS.filter(m => m.group === 'property').map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</optgroup>
            <optgroup label="HogQL">{MATH_OPTIONS.filter(m => m.group === 'hogql').map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</optgroup>
          </select>
          {mathRequiresProperty && (
            <TaxonomicFilterButton
              taxonomicGroupTypes={['numerical_event_properties']}
              buttonLabel="Propiedad"
              selectionLabel={series.math_property || undefined}
              onChange={(sel) => onChange({ math_property: String(sel.value) })}
            />
          )}
          {series.math === 'hogql' && (
            <input
              value={series.math_hogql ?? ''}
              onChange={e => onChange({ math_hogql: e.target.value })}
              placeholder="e.g. count() / 100"
              className="flex-1 h-7 px-2 border border-[#e9eae6] rounded text-[11px] font-mono"
            />
          )}
        </div>
      )}

      {/* Per-series property filters — exact same shape PostHog uses */}
      <div className="pl-7 space-y-1">
        {(series.properties ?? []).map((p, i) => (
          <div key={i} className="flex items-center gap-1 px-1.5 py-0.5 bg-white border border-[#e9eae6] rounded">
            <span className="text-[9px] uppercase tracking-wide text-[#646462]">{p.type}</span>
            <code className="text-[10px] text-[#1a1a18] font-mono flex-1 truncate">{p.key} {p.operator} {String(p.value)}</code>
            <button onClick={() => onChange({ properties: (series.properties ?? []).filter((_, j) => j !== i) })} className="text-[#dc2626] text-[11px]">×</button>
          </div>
        ))}
        <TaxonomicFilterButton
          taxonomicGroupTypes={['event_properties', 'person_properties']}
          buttonLabel={propsLen > 0 ? `+ Otro filtro (${propsLen})` : '+ Filtro de serie'}
          onChange={(sel) => {
            const typeMap: Record<string, string> = { event_properties: 'event', person_properties: 'person' };
            const next = [...(series.properties ?? []), { key: String(sel.value), value: '', operator: 'exact', type: typeMap[sel.group] ?? 'event' }];
            onChange({ properties: next });
          }}
        />
      </div>
    </div>
  );
}
