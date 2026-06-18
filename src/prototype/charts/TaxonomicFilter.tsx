// ─────────────────────────────────────────────────────────────────────────
// TaxonomicFilter — mirrors PostHog's lib/components/TaxonomicFilter/
//
// One component for ALL property / event / cohort / action / feature flag /
// group pickers across Clain. Replaces the ad-hoc `FilterPopover`,
// `BreakdownPopover`, `PropertyPicker` and inline event-picker scattered
// across the codebase.
//
// Backend endpoints are 1:1 with PostHog. Visual UI/UX is Clain (sharp 1px
// borders, LC palette, no shadows).
// ─────────────────────────────────────────────────────────────────────────
import * as React from 'react';

export type TaxonomicGroupType =
  | 'events'
  | 'actions'
  | 'event_properties'
  | 'person_properties'
  | 'numerical_event_properties'
  | 'session_properties'
  | 'cohorts'
  | 'cohorts_with_all'
  | 'feature_flags'
  | 'elements'
  | 'groups'
  | 'pageview_urls'
  | 'screens'
  | 'emails'
  | 'event_metadata';

// Virtual categories — no fetcher, derived from the real groups + localStorage.
export type VirtualGroupType = 'suggestions' | 'recent' | 'pinned';

// ── localStorage-backed recents & pins ───────────────────────────────────────
// Shared key per (consumer) so the same recents/pins appear everywhere the
// canonical picker is used. PostHog stores these per-project; we key by a
// caller-provided `storageKey` (defaults to 'global').
function tfReadList(key: string): string[] {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : []; } catch { return []; }
}
function tfWriteList(key: string, v: string[]) {
  try { localStorage.setItem(key, JSON.stringify(v.slice(0, 30))); } catch {}
}

export type TaxonomicItem = {
  // The raw row from the backend (event_definition, property_definition,
  // cohort, action, feature_flag…). Whatever shape the endpoint returns.
  raw: any;
  // The canonical "value" the caller cares about (event name, property name,
  // cohort id, etc.).
  value: string | number;
  label: string;
  description?: string;
  meta?: string;        // small badge text on the right
  type?: string;        // property_type when relevant ("String", "Numeric", ...)
};

type TaxonomicGroupDef = {
  type: TaxonomicGroupType;
  label: string;
  shortLabel: string;
  fetcher: (params: { search?: string; teamId: number; projectId: number }) => Promise<TaxonomicItem[]>;
  iconEmoji?: string;
};

// The full PostHog catalog of groups. Each one knows how to fetch its rows.
const GROUPS: Record<TaxonomicGroupType, TaxonomicGroupDef> = {
  events: {
    type: 'events',
    label: 'Eventos',
    shortLabel: 'Eventos',
    iconEmoji: '⚡',
    async fetcher({ search, projectId }) {
      const ph = await import('../../api/posthog');
      const res: any = await ph.phGet(`/api/projects/${projectId}/event_definitions/`, { search: search || undefined, limit: 100 });
      return (res?.results ?? []).map((r: any) => ({
        raw: r,
        value: r.name,
        label: r.name,
        description: r.description ?? undefined,
        meta: r.volume_30_day != null ? `${r.volume_30_day}/30d` : undefined,
      }));
    },
  },
  actions: {
    type: 'actions',
    label: 'Acciones',
    shortLabel: 'Acciones',
    iconEmoji: '🎯',
    async fetcher({ search, projectId }) {
      const ph = await import('../../api/posthog');
      const res: any = await ph.phGet(`/api/projects/${projectId}/actions/`, { search: search || undefined, limit: 100 }).catch(() => ({ results: [] }));
      return (res?.results ?? []).map((r: any) => ({
        raw: r,
        value: r.id,
        label: r.name,
        description: r.description ?? undefined,
        meta: r.count != null ? `${r.count} steps` : undefined,
      }));
    },
  },
  event_properties: {
    type: 'event_properties',
    label: 'Propiedades de evento',
    shortLabel: 'Prop. evento',
    iconEmoji: '🏷️',
    async fetcher({ search, projectId }) {
      const ph = await import('../../api/posthog');
      const res: any = await ph.phGet(`/api/projects/${projectId}/property_definitions/`, { search: search || undefined, type: 'event', limit: 200 });
      return (res?.results ?? []).map((r: any) => ({
        raw: r,
        value: r.name,
        label: r.name,
        type: r.property_type ?? undefined,
        meta: r.property_type ?? undefined,
      }));
    },
  },
  person_properties: {
    type: 'person_properties',
    label: 'Propiedades de persona',
    shortLabel: 'Prop. persona',
    iconEmoji: '👤',
    async fetcher({ search, projectId }) {
      const ph = await import('../../api/posthog');
      const res: any = await ph.phGet(`/api/projects/${projectId}/property_definitions/`, { search: search || undefined, type: 'person', limit: 200 });
      return (res?.results ?? []).map((r: any) => ({
        raw: r,
        value: r.name,
        label: r.name,
        type: r.property_type ?? undefined,
        meta: r.property_type ?? undefined,
      }));
    },
  },
  numerical_event_properties: {
    type: 'numerical_event_properties',
    label: 'Propiedades numéricas',
    shortLabel: 'Numéricas',
    iconEmoji: '🔢',
    async fetcher({ search, projectId }) {
      const ph = await import('../../api/posthog');
      const res: any = await ph.phGet(`/api/projects/${projectId}/property_definitions/`, { search: search || undefined, type: 'event', is_numerical: true, limit: 200 });
      return (res?.results ?? []).map((r: any) => ({ raw: r, value: r.name, label: r.name, meta: 'Numeric' }));
    },
  },
  session_properties: {
    type: 'session_properties',
    label: 'Propiedades de sesión',
    shortLabel: 'Sesión',
    iconEmoji: '🕐',
    async fetcher({ search, projectId }) {
      const ph = await import('../../api/posthog');
      const res: any = await ph.phGet(`/api/projects/${projectId}/property_definitions/`, { search: search || undefined, type: 'session', limit: 200 }).catch(() => ({ results: [] }));
      return (res?.results ?? []).map((r: any) => ({ raw: r, value: r.name, label: r.name, meta: r.property_type ?? undefined }));
    },
  },
  cohorts: {
    type: 'cohorts',
    label: 'Cohorts',
    shortLabel: 'Cohorts',
    iconEmoji: '👥',
    async fetcher({ search, projectId }) {
      const ph = await import('../../api/posthog');
      const res: any = await ph.phGet(`/api/projects/${projectId}/cohorts/`, { search: search || undefined, limit: 200 });
      return (res?.results ?? []).map((r: any) => ({
        raw: r,
        value: r.id,
        label: r.name,
        description: r.description ?? undefined,
        meta: r.count != null ? `${r.count} miembros` : undefined,
      }));
    },
  },
  cohorts_with_all: {
    type: 'cohorts_with_all',
    label: 'Cohorts',
    shortLabel: 'Cohorts',
    iconEmoji: '👥',
    async fetcher({ search, projectId }) {
      const ph = await import('../../api/posthog');
      const res: any = await ph.phGet(`/api/projects/${projectId}/cohorts/`, { search: search || undefined, limit: 200 });
      const all: TaxonomicItem = { raw: { id: 'all', name: 'All users' }, value: 'all', label: 'Todos los usuarios', meta: 'cohort' };
      const rows = (res?.results ?? []).map((r: any) => ({
        raw: r, value: r.id, label: r.name, meta: r.count != null ? `${r.count} miembros` : undefined,
      }));
      return [all, ...rows];
    },
  },
  feature_flags: {
    type: 'feature_flags',
    label: 'Feature flags',
    shortLabel: 'Flags',
    iconEmoji: '🚩',
    async fetcher({ search, projectId }) {
      const ph = await import('../../api/posthog');
      const res: any = await ph.phGet(`/api/projects/${projectId}/feature_flags/`, { search: search || undefined, limit: 100 }).catch(() => ({ results: [] }));
      return (res?.results ?? []).map((r: any) => ({
        raw: r, value: r.key, label: r.key, description: r.name ?? undefined,
        meta: r.active ? 'activo' : 'inactivo',
      }));
    },
  },
  elements: {
    type: 'elements',
    label: 'Elementos',
    shortLabel: 'Elementos',
    iconEmoji: '🧩',
    async fetcher() {
      // Static — these are the HTML element attributes PostHog allows targeting.
      return ['text', 'href', 'selector', 'tag_name', 'class', 'id', 'data-attr'].map(n => ({
        raw: { name: n }, value: n, label: n, meta: 'attribute',
      }));
    },
  },
  groups: {
    type: 'groups',
    label: 'Grupos',
    shortLabel: 'Grupos',
    iconEmoji: '🏢',
    async fetcher({ projectId }) {
      const ph = await import('../../api/posthog');
      const res: any = await ph.phGet(`/api/projects/${projectId}/groups_types/`).catch(() => ([]));
      const types = Array.isArray(res) ? res : (res?.results ?? []);
      return types.map((t: any) => ({
        raw: t, value: t.group_type_index, label: t.group_type ?? `Tipo ${t.group_type_index}`,
        meta: `index ${t.group_type_index}`,
      }));
    },
  },
  pageview_urls: {
    type: 'pageview_urls',
    label: 'URLs de pageview',
    shortLabel: 'URLs',
    iconEmoji: '🌐',
    async fetcher({ search, projectId }) {
      // Use HogQL to get distinct $current_url values from recent pageviews.
      const ph = await import('../../api/posthog');
      const res: any = await ph.posthog.query({
        query: {
          kind: 'HogQLQuery',
          query: `SELECT DISTINCT properties.$current_url AS url, count() AS c FROM events WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 30 DAY ${search ? `AND properties.$current_url ILIKE '%${search.replace(/'/g, "\\'")}%'` : ''} GROUP BY url ORDER BY c DESC LIMIT 100`,
        },
      }).catch(() => null);
      const rows: any[][] = res?.results ?? [];
      return rows.map(([url, c]) => ({ raw: { url }, value: url, label: url, meta: `${c} hits` }));
    },
  },
  screens: {
    type: 'screens',
    label: 'Pantallas',
    shortLabel: 'Pantallas',
    iconEmoji: '📱',
    async fetcher({ search }) {
      // Mobile $screen events — distinct $screen_name from screen views.
      const ph = await import('../../api/posthog');
      const res: any = await ph.posthog.query({
        query: {
          kind: 'HogQLQuery',
          query: `SELECT DISTINCT properties.$screen_name AS s, count() AS c FROM events WHERE event = '$screen' AND timestamp >= now() - INTERVAL 30 DAY ${search ? `AND properties.$screen_name ILIKE '%${search.replace(/'/g, "\\'")}%'` : ''} GROUP BY s ORDER BY c DESC LIMIT 100`,
        },
      }).catch(() => null);
      const rows: any[][] = res?.results ?? [];
      return rows.filter(r => r[0]).map(([s, c]) => ({ raw: { screen: s }, value: s, label: s, meta: `${c} vistas` }));
    },
  },
  emails: {
    type: 'emails',
    label: 'Emails',
    shortLabel: 'Emails',
    iconEmoji: '✉️',
    async fetcher({ search }) {
      // Distinct person emails from the persons table.
      const ph = await import('../../api/posthog');
      const res: any = await ph.posthog.query({
        query: {
          kind: 'HogQLQuery',
          query: `SELECT DISTINCT properties.email AS e, count() AS c FROM persons WHERE properties.email IS NOT NULL AND properties.email != '' ${search ? `AND properties.email ILIKE '%${search.replace(/'/g, "\\'")}%'` : ''} GROUP BY e ORDER BY c DESC LIMIT 100`,
        },
      }).catch(() => null);
      const rows: any[][] = res?.results ?? [];
      return rows.filter(r => r[0]).map(([e]) => ({ raw: { email: e }, value: e, label: e, meta: 'persona' }));
    },
  },
  event_metadata: {
    type: 'event_metadata',
    label: 'Metadatos de evento',
    shortLabel: 'Metadatos',
    iconEmoji: '🧾',
    async fetcher() {
      // Static — the top-level event columns PostHog exposes for filtering.
      return [
        { key: 'timestamp',    desc: 'Cuándo ocurrió el evento' },
        { key: 'distinct_id',  desc: 'ID del usuario que lo generó' },
        { key: 'event',        desc: 'Nombre del evento' },
        { key: '$session_id',  desc: 'ID de sesión' },
        { key: '$window_id',   desc: 'ID de ventana' },
        { key: '$group_0',     desc: 'Grupo asociado (índice 0)' },
        { key: 'person_id',    desc: 'ID interno de persona' },
        { key: 'created_at',   desc: 'Momento de ingesta' },
      ].map(m => ({ raw: m, value: m.key, label: m.key, description: m.desc, meta: 'metadata' }));
    },
  },
};

export type TaxonomicFilterValue = {
  group: TaxonomicGroupType;
  value: string | number;
  item: TaxonomicItem;
};

type TaxonomicFilterProps = {
  /** Which categories to show in the left rail. Order is preserved. */
  taxonomicGroupTypes: TaxonomicGroupType[];
  /** Initial active category. Defaults to Sugerencias (or first group). */
  initialGroupType?: TaxonomicGroupType | VirtualGroupType;
  /** Optional starting search query. */
  initialSearch?: string;
  /** Single-select: called when a row is clicked. */
  onChange?: (selection: TaxonomicFilterValue) => void;
  /** Compact rendering inside a popover (no header). */
  popover?: boolean;
  /** Optional close handler — adds a `×` button when set. */
  onClose?: () => void;
  className?: string;
  /** localStorage namespace for recents + pins. Same key = shared list. */
  storageKey?: string;
  /** Hide the virtual Sugerencias/Recientes/Fijados rail (default: shown). */
  hideVirtual?: boolean;
  /** Custom placeholder for the search box. */
  searchPlaceholder?: string;
};

// Stored shape for recents/pins — enough to re-render + re-emit a selection.
type StoredRef = { group: TaxonomicGroupType; value: string; label: string; meta?: string };

/**
 * The canonical TaxonomicFilter. Mirrors PostHog's left-rail + list layout
 * with the virtual Sugerencias / Recientes / Fijados categories on top.
 * Search debounced 250ms; fetches cached per (group, query); recents & pins
 * persisted in localStorage under `storageKey`.
 */
export function TaxonomicFilter({
  taxonomicGroupTypes,
  initialGroupType,
  initialSearch = '',
  onChange,
  popover = false,
  onClose,
  className,
  storageKey = 'tf:global',
  hideVirtual = false,
  searchPlaceholder,
}: TaxonomicFilterProps) {
  const groups = taxonomicGroupTypes.map(t => GROUPS[t]).filter(Boolean);
  const RECENT_KEY = `${storageKey}:recent`;
  const PINNED_KEY = `${storageKey}:pinned`;

  const [activeType, setActiveType] = React.useState<TaxonomicGroupType | VirtualGroupType>(
    initialGroupType ?? (hideVirtual ? (groups[0]?.type ?? 'event_properties') : 'suggestions'),
  );
  const [search, setSearch] = React.useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = React.useState(initialSearch);
  const [cache, setCache] = React.useState<Record<string, TaxonomicItem[]>>({});
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const [loading, setLoading] = React.useState(false);
  const [recent, setRecent] = React.useState<StoredRef[]>(() => tfReadList(RECENT_KEY) as any);
  const [pinned, setPinned] = React.useState<StoredRef[]>(() => tfReadList(PINNED_KEY) as any);

  const isVirtual = (t: string): t is VirtualGroupType => t === 'suggestions' || t === 'recent' || t === 'pinned';
  const realActive: TaxonomicGroupType = isVirtual(activeType) ? (groups[0]?.type ?? 'event_properties') : activeType;

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch items for every real group so counts + suggestions populate.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const ph = await import('../../api/posthog');
      const projectId = ph.getProjectId() ?? 0;
      const teamId = ph.getTeamId() ?? 0;
      await Promise.all(groups.map(async (g) => {
        const cacheKey = `${g.type}:${debouncedSearch}`;
        if (cache[cacheKey]) return;
        try {
          const items = await g.fetcher({ search: debouncedSearch, teamId, projectId });
          if (!cancelled) {
            setCache(c => ({ ...c, [cacheKey]: items }));
            setCounts(c => ({ ...c, [g.type]: items.length }));
          }
        } catch {
          if (!cancelled) setCache(c => ({ ...c, [cacheKey]: [] }));
        }
      }));
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [debouncedSearch, groups.map(g => g.type).join(',')]);

  // Virtual category counts.
  const lower = debouncedSearch.toLowerCase();
  const matchRef = (r: StoredRef) => !lower || r.label.toLowerCase().includes(lower);
  const recentMatches = recent.filter(matchRef);
  const pinnedMatches = pinned.filter(matchRef);
  // Suggestions = top items across all real groups (already search-filtered).
  const suggestionItems: { group: TaxonomicGroupType; item: TaxonomicItem }[] =
    groups.flatMap(g => (cache[`${g.type}:${debouncedSearch}`] ?? []).slice(0, 8).map(item => ({ group: g.type, item })));

  function emit(group: TaxonomicGroupType, item: TaxonomicItem) {
    // Track recent.
    const ref: StoredRef = { group, value: String(item.value), label: item.label, meta: item.meta };
    setRecent(prev => {
      const next = [ref, ...prev.filter(r => !(r.group === group && r.value === ref.value))].slice(0, 20);
      tfWriteList(RECENT_KEY, next as any);
      return next;
    });
    onChange?.({ group, value: item.value, item });
  }
  function togglePin(group: TaxonomicGroupType, item: TaxonomicItem, e: React.MouseEvent) {
    e.stopPropagation();
    const ref: StoredRef = { group, value: String(item.value), label: item.label, meta: item.meta };
    setPinned(prev => {
      const exists = prev.some(r => r.group === group && r.value === ref.value);
      const next = exists ? prev.filter(r => !(r.group === group && r.value === ref.value)) : [ref, ...prev];
      tfWriteList(PINNED_KEY, next as any);
      return next;
    });
  }
  const isPinned = (group: TaxonomicGroupType, value: string | number) =>
    pinned.some(r => r.group === group && r.value === String(value));

  // Rows for the active category.
  type Row = { group: TaxonomicGroupType; item: TaxonomicItem };
  let rows: Row[] = [];
  if (activeType === 'suggestions') rows = suggestionItems;
  else if (activeType === 'recent') rows = recentMatches.map(r => ({ group: r.group, item: { raw: r, value: r.value, label: r.label, meta: r.meta } }));
  else if (activeType === 'pinned') rows = pinnedMatches.map(r => ({ group: r.group, item: { raw: r, value: r.value, label: r.label, meta: r.meta } }));
  else rows = (cache[`${activeType}:${debouncedSearch}`] ?? []).map(item => ({ group: activeType as TaxonomicGroupType, item }));

  const VIRTUALS: { type: VirtualGroupType; label: string; emoji: string; count: number }[] = [
    { type: 'suggestions', label: 'Sugerencias', emoji: '✨', count: suggestionItems.length },
    { type: 'recent',      label: 'Recientes',   emoji: '🕘', count: recentMatches.length },
    { type: 'pinned',      label: 'Fijados',     emoji: '📌', count: pinnedMatches.length },
  ];

  return (
    <div className={`bg-white ${popover ? '' : 'border border-[#e9eae6] rounded-[12px]'} flex flex-col ${className ?? ''}`}>
      {!popover && (
        <div className="px-3 py-2 border-b border-[#e9eae6] flex items-center justify-between">
          <p className="text-[12px] font-bold text-[#1a1a18]">Selector</p>
          {onClose && <button onClick={onClose} className="text-[#646462] hover:text-[#1a1a18]">×</button>}
        </div>
      )}
      <div className="px-2 pt-2 pb-1">
        <div className="relative">
          <svg viewBox="0 0 16 16" className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 fill-[#9ca3af]"><path d="M6.5 1a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM0 6.5a6.5 6.5 0 1111.6 4l3.2 3.2a1 1 0 01-1.4 1.4L10.1 12A6.5 6.5 0 010 6.5z"/></svg>
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={searchPlaceholder ?? 'Buscar sugerencias, recientes, propiedades…'}
            className="w-full h-8 pl-7 pr-2 border border-[#e9eae6] rounded text-[12px] outline-none focus:border-[#3b59f6]"
          />
        </div>
      </div>
      <div className="flex flex-1 min-h-[260px] max-h-[420px]">
        {/* Left rail — virtual + real categories with live counts */}
        <div className="w-44 flex-shrink-0 border-r border-[#e9eae6] py-1 overflow-y-auto">
          <p className="px-3 py-1 text-[10px] font-bold text-[#646462] uppercase tracking-wide">Categorías</p>
          {!hideVirtual && VIRTUALS.map(v => {
            const active = activeType === v.type;
            return (
              <button
                key={v.type}
                onClick={() => setActiveType(v.type)}
                className={`w-full flex items-center gap-1.5 px-3 py-1.5 text-left text-[12px] ${active ? 'bg-[#fff5f2] text-[#e8572a] font-semibold border-l-2 border-[#e8572a]' : 'text-[#1a1a18] hover:bg-[#fafaf9] border-l-2 border-transparent'}`}
              >
                <span className="text-[12px]">{v.emoji}</span>
                <span className="flex-1 truncate">{v.label}</span>
                <span className={`text-[10px] tabular-nums ${active ? 'text-[#e8572a]' : 'text-[#9ca3af]'}`}>{v.count}</span>
              </button>
            );
          })}
          {!hideVirtual && <div className="my-1 border-t border-[#f3f3f1]" />}
          {groups.map(g => {
            const active = activeType === g.type;
            const count = counts[g.type];
            return (
              <button
                key={g.type}
                onClick={() => setActiveType(g.type)}
                className={`w-full flex items-center gap-1.5 px-3 py-1.5 text-left text-[12px] ${active ? 'bg-[#fff5f2] text-[#e8572a] font-semibold border-l-2 border-[#e8572a]' : 'text-[#1a1a18] hover:bg-[#fafaf9] border-l-2 border-transparent'}`}
              >
                <span className="text-[12px]">{g.iconEmoji}</span>
                <span className="flex-1 truncate">{g.label}</span>
                <span className={`text-[10px] tabular-nums ${active ? 'text-[#e8572a]' : 'text-[#9ca3af]'}`}>{count ?? '·'}</span>
              </button>
            );
          })}
        </div>
        {/* Right pane — items */}
        <div className="flex-1 overflow-y-auto">
          {loading && rows.length === 0 ? (
            <p className="px-3 py-3 text-[11px] text-[#9ca3af]">Cargando…</p>
          ) : rows.length === 0 ? (
            <p className="px-3 py-6 text-[12px] text-[#9ca3af] text-center italic">
              {activeType === 'recent' ? 'Sin selecciones recientes.'
               : activeType === 'pinned' ? 'Aún no has fijado nada. Pasa el ratón por una fila y pulsa el pin.'
               : `Sin resultados${debouncedSearch ? ` para "${debouncedSearch}"` : ''}.`}
            </p>
          ) : (
            rows.map(({ group, item }) => (
              <div
                key={`${activeType}-${group}-${item.value}`}
                className="group w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#fafaf9] border-b border-[#f3f3f1]"
              >
                <button onClick={() => emit(group, item)} className="flex-1 min-w-0 text-left">
                  <p className="text-[12px] font-medium text-[#1a1a18] truncate font-mono">{item.label}</p>
                  {item.description && <p className="text-[10px] text-[#646462] truncate">{item.description}</p>}
                </button>
                {item.meta && <span className="text-[10px] text-[#9ca3af] flex-shrink-0">{item.meta}</span>}
                <button
                  onClick={(e) => togglePin(group, item, e)}
                  title={isPinned(group, item.value) ? 'Quitar de fijados' : 'Fijar'}
                  className={`flex-shrink-0 transition-opacity ${isPinned(group, item.value) ? 'opacity-100 text-[#e8572a]' : 'opacity-0 group-hover:opacity-100 text-[#9ca3af] hover:text-[#1a1a18]'}`}
                >
                  <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current"><path d="M5 1h6l-1 5 3 4H3l3-4z"/></svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Convenience: a button that toggles a TaxonomicFilter popover anchored
 * below. The button label updates with the current selection. Used as the
 * canonical "Property / Breakdown / Event" picker across all surfaces.
 */
export function TaxonomicFilterButton({
  taxonomicGroupTypes,
  selectionLabel,
  buttonLabel = 'Seleccionar',
  buttonIcon,
  active = false,
  onChange,
  initialGroupType,
  align = 'left',
  storageKey,
  hideVirtual,
  searchPlaceholder,
  width = 560,
  buttonClassName,
}: {
  taxonomicGroupTypes: TaxonomicGroupType[];
  selectionLabel?: string;
  buttonLabel?: string;
  buttonIcon?: React.ReactNode;
  active?: boolean;
  onChange?: (selection: TaxonomicFilterValue) => void;
  initialGroupType?: TaxonomicGroupType | VirtualGroupType;
  align?: 'left' | 'right';
  storageKey?: string;
  hideVirtual?: boolean;
  searchPlaceholder?: string;
  width?: number;
  buttonClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        className={buttonClassName ?? `flex items-center gap-1.5 h-8 px-3 border rounded-lg text-[12px] hover:bg-[#fafaf9] ${active || selectionLabel ? 'border-[#3b59f6] text-[#3b59f6] bg-[#eff2ff]' : 'border-[#e9eae6] text-[#1a1a18] bg-white'}`}
      >
        {buttonIcon}
        {selectionLabel ?? buttonLabel}
        <svg viewBox="0 0 16 16" className="w-2.5 h-2.5 fill-current"><path d="M3 5l5 5 5-5"/></svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}/>
          <div className={`absolute top-full mt-1 z-50 bg-white border border-[#e9eae6] rounded-[10px] shadow-lg ${align === 'right' ? 'right-0' : 'left-0'}`} style={{ width }}>
            <TaxonomicFilter
              taxonomicGroupTypes={taxonomicGroupTypes}
              initialGroupType={initialGroupType}
              storageKey={storageKey}
              hideVirtual={hideVirtual}
              searchPlaceholder={searchPlaceholder}
              popover
              onChange={(sel) => { onChange?.(sel); setOpen(false); }}
            />
          </div>
        </>
      )}
    </div>
  );
}
