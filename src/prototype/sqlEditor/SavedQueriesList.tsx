// SavedQueriesList — list of `warehouse_saved_queries` shown inside the
// EditorSidebar. Mirrors PostHog's
// `frontend/src/scenes/data-warehouse/saved_queries/SavedQueriesScene.tsx`
// flattened to a tree-row UI.
//
// Each row supports:
//   • Click → open the query in a new tab (via `onOpen`)
//   • Kebab menu: Run/Materialize, Cancel, Revert materialization, Rename,
//     Duplicate, Delete  → all wired to `posthog.warehouse.savedQueries.*`.

import React from 'react';

export interface SavedQuery {
  id: string;
  name: string;
  query: { kind: 'HogQLQuery'; query: string } | Record<string, any>;
  /** PostHog literals: 'view' | 'materialized_view' (the latter when materialized) */
  type?: 'view' | 'materialized_view';
  last_run_at?: string;
  status?: 'Running' | 'Completed' | 'Failed' | 'Cancelled';
  sync_frequency?: string | null;
  created_at?: string;
  created_by?: { first_name?: string; email?: string } | null;
}

interface SavedQueriesListProps {
  /** Called when the user clicks a saved query to open it in a new editor tab. */
  onOpen: (q: SavedQuery) => void;
  /** Optional reload trigger — bump to force refetch after creating a view. */
  reloadKey?: number;
}

export function SavedQueriesList({ onOpen, reloadKey }: SavedQueriesListProps): React.ReactElement {
  const [queries, setQueries] = React.useState<SavedQuery[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      setLoading(true);
      const ph = await import('../../api/posthog');
      if (!ph.getProjectId()) await ph.bootstrapPostHog();
      const res = await ph.posthog.warehouse.savedQueries.list({ limit: 200 }) as any;
      const items: SavedQuery[] = Array.isArray(res?.results) ? res.results : Array.isArray(res) ? res : [];
      setQueries(items);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Error');
      setQueries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void refresh(); }, [refresh, reloadKey]);

  async function actionWith(id: string, op: 'run' | 'cancel' | 'revertMaterialization' | 'delete'): Promise<void> {
    setOpenMenuId(null);
    try {
      const ph = await import('../../api/posthog');
      if (op === 'delete') {
        if (!window.confirm('¿Eliminar esta vista? Es irreversible.')) return;
        await ph.posthog.warehouse.savedQueries.delete(id);
      } else if (op === 'run') {
        await ph.posthog.warehouse.savedQueries.run(id);
      } else if (op === 'cancel') {
        await ph.posthog.warehouse.savedQueries.cancel(id);
      } else if (op === 'revertMaterialization') {
        if (!window.confirm('¿Revertir la materialización? Borrará la tabla materializada.')) return;
        await ph.posthog.warehouse.savedQueries.revertMaterialization(id);
      }
      await refresh();
    } catch (e: any) {
      alert(e?.message ?? 'Error');
    }
  }

  async function rename(id: string, current: string): Promise<void> {
    setOpenMenuId(null);
    const next = window.prompt('Nuevo nombre:', current);
    if (!next || next.trim() === current) return;
    try {
      const ph = await import('../../api/posthog');
      await ph.posthog.warehouse.savedQueries.update(id, { name: next.trim() });
      await refresh();
    } catch (e: any) {
      alert(e?.message ?? 'Error');
    }
  }

  async function duplicate(q: SavedQuery): Promise<void> {
    setOpenMenuId(null);
    try {
      const ph = await import('../../api/posthog');
      await ph.posthog.warehouse.savedQueries.create({
        name: `${q.name} (copia)`,
        query: q.query,
      });
      await refresh();
    } catch (e: any) {
      alert(e?.message ?? 'Error');
    }
  }

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between h-6 px-1 flex-shrink-0">
        <span className="text-[10px] font-semibold text-[#9a9a98] uppercase tracking-wide">Vistas</span>
        <button
          onClick={refresh}
          className="text-[10px] text-[#9a9a98] hover:text-[#1a1a18]"
          title="Recargar"
        >
          ↻
        </button>
      </div>
      <div className="flex flex-col gap-0.5">
        {loading && <div className="text-[11px] text-[#9ca3af] px-1 py-1">Cargando vistas…</div>}
        {error && !loading && <div className="text-[11px] text-[#dc2626] px-1 py-1">{error}</div>}
        {!loading && !error && queries.length === 0 && (
          <div className="text-[11px] text-[#9ca3af] px-1 py-1">No hay vistas guardadas.</div>
        )}
        {queries.map(q => (
          <SavedQueryRow
            key={q.id}
            query={q}
            menuOpen={openMenuId === q.id}
            onMenuToggle={() => setOpenMenuId(p => p === q.id ? null : q.id)}
            onOpen={() => onOpen(q)}
            onRun={() => actionWith(q.id, 'run')}
            onCancel={() => actionWith(q.id, 'cancel')}
            onRevert={() => actionWith(q.id, 'revertMaterialization')}
            onDelete={() => actionWith(q.id, 'delete')}
            onRename={() => rename(q.id, q.name)}
            onDuplicate={() => duplicate(q)}
          />
        ))}
      </div>
    </div>
  );
}

interface SavedQueryRowProps {
  query: SavedQuery;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onOpen: () => void;
  onRun: () => void;
  onCancel: () => void;
  onRevert: () => void;
  onDelete: () => void;
  onRename: () => void;
  onDuplicate: () => void;
}

const SavedQueryRow: React.FC<SavedQueryRowProps> = ({
  query, menuOpen, onMenuToggle, onOpen, onRun, onCancel, onRevert, onDelete, onRename, onDuplicate,
}) => {
  const isMaterialized = query.type === 'materialized_view';
  return (
    <div className="group relative h-7 flex items-center gap-1 px-1 rounded hover:bg-[#f3f3f1]">
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462] flex-shrink-0" strokeWidth="1.3">
        <rect x="2" y="2" width="12" height="12" rx="1.5" />
        <path d="M2 6h12M6 6v8" strokeLinecap="round" />
      </svg>
      <button
        onClick={onOpen}
        className="flex-1 text-left text-[12px] text-[#1a1a18] truncate"
        title={`Abrir "${query.name}"`}
      >
        {query.name}
      </button>
      {isMaterialized && (
        <span
          className="text-[9px] font-mono text-[#0d9488] bg-[#ccfbf1] px-1 py-px rounded flex-shrink-0"
          title="Vista materializada"
        >
          MAT
        </span>
      )}
      {query.status === 'Running' && (
        <span className="w-1.5 h-1.5 rounded-full bg-[#3b59f6] animate-pulse flex-shrink-0" title="Running" />
      )}
      {query.status === 'Failed' && (
        <span className="w-1.5 h-1.5 rounded-full bg-[#dc2626] flex-shrink-0" title="Failed" />
      )}
      <button
        onClick={onMenuToggle}
        className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-white text-[#646462]"
        aria-label="Acciones"
      >
        <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current">
          <circle cx="3" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="13" cy="8" r="1.3" />
        </svg>
      </button>
      {menuOpen && (
        <div className="absolute right-1 top-7 z-30 w-44 bg-white border border-[#e9eae6] rounded-lg shadow-md py-1">
          <button onClick={onOpen} className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#f3f3f1]">Abrir</button>
          <button onClick={onRun} className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#f3f3f1]">
            {isMaterialized ? 'Re-materializar' : 'Materializar'}
          </button>
          {query.status === 'Running' && (
            <button onClick={onCancel} className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#f3f3f1]">
              Cancelar
            </button>
          )}
          {isMaterialized && (
            <button onClick={onRevert} className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#f3f3f1]">
              Revertir materialización
            </button>
          )}
          <button onClick={onRename} className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#f3f3f1]">Renombrar</button>
          <button onClick={onDuplicate} className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#f3f3f1]">Duplicar</button>
          <div className="h-px bg-[#e9eae6] my-1" />
          <button onClick={onDelete} className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#fef2f2] text-[#dc2626]">
            Eliminar
          </button>
        </div>
      )}
    </div>
  );
};

export default SavedQueriesList;
