// ExternalSourcesList — list of `external_data_sources` shown in the
// EditorSidebar. Mirrors PostHog's
// `frontend/src/scenes/data-warehouse/external/dataWarehouseExternalSceneLogic.ts`
// + DatabaseTablesContainer's "Sources" group.
//
// Click on a source → expands to show its schemas (tables it has synced).
// "+ Añadir fuente" opens a minimal modal that POSTs to /external_data_sources/
// — full per-connector wizards (Stripe OAuth, Postgres credentials, …) ship in
// a later iteration; Turn 2 only ensures the entry-point is real.

import React from 'react';

export interface ExternalDataSource {
  id: string;
  source_type: string;
  prefix?: string;
  status: 'Running' | 'Completed' | 'Failed' | 'Cancelled' | 'BillingError' | 'Initial';
  /** Per-source last sync ISO timestamp. */
  last_run_at?: string | null;
  schemas?: ExternalDataSchema[];
}

export interface ExternalDataSchema {
  id: string;
  name: string;
  should_sync?: boolean;
  status?: string;
  last_synced_at?: string | null;
  table?: { name: string; row_count?: number } | null;
}

interface ExternalSourcesListProps {
  onInsert: (text: string) => void;
  onAddSource?: () => void;
  reloadKey?: number;
}

export function ExternalSourcesList({ onInsert, onAddSource, reloadKey }: ExternalSourcesListProps): React.ReactElement {
  const [sources, setSources] = React.useState<ExternalDataSource[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [openSourceId, setOpenSourceId] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      setLoading(true);
      const ph = await import('../../api/posthog');
      if (!ph.getProjectId()) await ph.bootstrapPostHog();
      const res = await ph.posthog.warehouse.sources.list({ limit: 100 }) as any;
      const items: ExternalDataSource[] = Array.isArray(res?.results) ? res.results : Array.isArray(res) ? res : [];
      setSources(items);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Error');
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void refresh(); }, [refresh, reloadKey]);

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between h-6 px-1 flex-shrink-0">
        <span className="text-[10px] font-semibold text-[#9a9a98] uppercase tracking-wide">Fuentes externas</span>
        <div className="flex items-center gap-1">
          {onAddSource && (
            <button
              onClick={onAddSource}
              className="text-[12px] text-[#e8572a] hover:text-[#c4471f] font-semibold leading-none"
              title="Añadir fuente"
            >
              +
            </button>
          )}
          <button
            onClick={refresh}
            className="text-[10px] text-[#9a9a98] hover:text-[#1a1a18]"
            title="Recargar"
          >
            ↻
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        {loading && <div className="text-[11px] text-[#9ca3af] px-1 py-1">Cargando fuentes…</div>}
        {error && !loading && <div className="text-[11px] text-[#dc2626] px-1 py-1">{error}</div>}
        {!loading && !error && sources.length === 0 && (
          <div className="text-[11px] text-[#9ca3af] px-1 py-1">Sin fuentes externas.</div>
        )}
        {sources.map(s => (
          <SourceRow
            key={s.id}
            source={s}
            isOpen={openSourceId === s.id}
            onToggle={() => setOpenSourceId(p => p === s.id ? null : s.id)}
            onInsert={onInsert}
          />
        ))}
      </div>
    </div>
  );
}

interface SourceRowProps {
  source: ExternalDataSource;
  isOpen: boolean;
  onToggle: () => void;
  onInsert: (text: string) => void;
}

const SourceRow: React.FC<SourceRowProps> = ({ source, isOpen, onToggle, onInsert }) => {
  const schemas = source.schemas ?? [];
  const statusColor =
    source.status === 'Completed'    ? 'bg-[#16a34a]' :
    source.status === 'Running'      ? 'bg-[#3b59f6] animate-pulse' :
    source.status === 'Failed'       ? 'bg-[#dc2626]' :
    source.status === 'BillingError' ? 'bg-[#f59e0b]' :
                                       'bg-[#9ca3af]';
  return (
    <div>
      <div className="h-7 flex items-center gap-1 px-1 rounded hover:bg-[#f3f3f1] cursor-pointer">
        <button onClick={onToggle} className="w-3 h-3 flex items-center justify-center text-[#9a9a98]">
          <svg viewBox="0 0 16 16" className={`w-2.5 h-2.5 fill-current transition-transform ${isOpen ? 'rotate-90' : ''}`}>
            <path d="M6 4l4 4-4 4z" />
          </svg>
        </button>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusColor}`} title={source.status} />
        <button
          onClick={() => onInsert(source.prefix ? `${source.prefix}_` : source.source_type.toLowerCase())}
          className="flex-1 text-left text-[12px] text-[#1a1a18] truncate"
        >
          {source.prefix || source.source_type}
        </button>
        <span className="text-[9px] font-mono text-[#9ca3af]">{source.source_type}</span>
      </div>
      {isOpen && (
        <div className="pl-6 flex flex-col gap-0.5">
          {schemas.length === 0 ? (
            <div className="text-[10px] text-[#9a9a98] px-1 py-0.5">Sin tablas sincronizadas.</div>
          ) : schemas.map(sch => (
            <button
              key={sch.id}
              onClick={() => onInsert(sch.table?.name ?? sch.name)}
              className="h-6 flex items-center gap-1.5 px-1 rounded hover:bg-[#f3f3f1] text-[11px] text-left"
              title={`Insertar "${sch.table?.name ?? sch.name}"`}
            >
              <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-[#646462] flex-shrink-0" strokeWidth="1.2">
                <rect x="2" y="3" width="12" height="10" rx="1" />
                <path d="M2 7h12" strokeLinecap="round" />
              </svg>
              <span className="text-[#1a1a18] flex-1 truncate">{sch.table?.name ?? sch.name}</span>
              {sch.table?.row_count != null && (
                <span className="text-[9px] font-mono text-[#9ca3af]">{sch.table.row_count.toLocaleString('es-ES')}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ExternalSourcesList;
