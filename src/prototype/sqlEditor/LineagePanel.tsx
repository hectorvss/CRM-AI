// LineagePanel — "Linaje" tab inside OutputPane. Mirrors PostHog's
// `frontend/src/scenes/data-warehouse/saved_queries/SavedQueryLineage.tsx`.
//
// Renders the DAG of `ancestors` (upstream views/tables this query depends on)
// and `descendants` (downstream materialized views that depend on the current
// saved query). Both come from:
//   POST /api/projects/{pid}/warehouse_saved_queries/{id}/ancestors/
//   POST /api/projects/{pid}/warehouse_saved_queries/{id}/descendants/
//
// When the current tab is NOT bound to a saved query, shows a CTA to "Guardar
// como vista" first (lineage is only meaningful for saved entities).

import React from 'react';

interface LineagePanelProps {
  savedQueryId?: string;
}

interface LineageNode {
  id: string;
  name: string;
  type?: 'view' | 'materialized_view' | 'posthog' | 'data_warehouse';
}

interface LineageResponse {
  ancestors?: LineageNode[];
  descendants?: LineageNode[];
}

export function LineagePanel({ savedQueryId }: LineagePanelProps): React.ReactElement {
  const [data, setData] = React.useState<LineageResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!savedQueryId) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const ph = await import('../../api/posthog');
        if (!ph.getProjectId()) await ph.bootstrapPostHog();
        const [up, down] = await Promise.all([
          ph.posthog.warehouse.savedQueries.ancestors(savedQueryId).catch(() => ({ ancestors: [] })),
          ph.posthog.warehouse.savedQueries.descendants(savedQueryId).catch(() => ({ descendants: [] })),
        ]) as [any, any];
        if (!cancelled) {
          setData({
            ancestors: up?.results ?? up?.ancestors ?? [],
            descendants: down?.results ?? down?.descendants ?? [],
          });
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) { setError(e?.message ?? 'Error'); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [savedQueryId]);

  if (!savedQueryId) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-full text-center">
        <p className="text-[13px] text-[#1a1a18] font-medium mb-1">Esta consulta no está guardada</p>
        <p className="text-[12px] text-[#646462] max-w-[320px]">
          Guarda la consulta como vista para visualizar su linaje (qué tablas la alimentan, qué vistas materializadas dependen de ella).
        </p>
      </div>
    );
  }

  if (loading) return <div className="p-3 text-[12px] text-[#9ca3af]">Cargando linaje…</div>;
  if (error) return <div className="p-3 text-[12px] text-[#dc2626] font-mono">{error}</div>;
  if (!data) return <div className="p-3 text-[12px] text-[#9ca3af]">Sin datos.</div>;

  const ancestors = data.ancestors ?? [];
  const descendants = data.descendants ?? [];

  return (
    <div className="p-3 flex flex-col gap-3 overflow-auto h-full">
      <LineageGroup title="Upstream (depende de)" nodes={ancestors} direction="up" />
      <div className="flex justify-center my-1">
        <span className="px-2 py-1 text-[11px] font-mono text-[#1a1a18] bg-[#fff5f2] border border-[#fbd2c1] rounded">
          ESTA CONSULTA
        </span>
      </div>
      <LineageGroup title="Downstream (depende de mí)" nodes={descendants} direction="down" />
    </div>
  );
}

function LineageGroup({ title, nodes, direction }: { title: string; nodes: LineageNode[]; direction: 'up' | 'down' }): React.ReactElement {
  return (
    <div className="border border-[#e9eae6] rounded-lg p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#646462] mb-2">{title}</h3>
      {nodes.length === 0 ? (
        <p className="text-[11px] text-[#9ca3af]">{direction === 'up' ? 'Sin dependencias upstream.' : 'Sin dependientes downstream.'}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {nodes.map(n => (
            <li key={n.id} className="flex items-center gap-2 text-[12px]">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.3">
                <rect x="2" y="2" width="12" height="12" rx="1.5" />
                <path d="M2 6h12M6 6v8" strokeLinecap="round" />
              </svg>
              <span className="text-[#1a1a18] flex-1">{n.name}</span>
              {n.type && (
                <span className="text-[9px] font-mono text-[#9a9a98] bg-[#f3f3f1] px-1.5 py-0.5 rounded">
                  {n.type === 'materialized_view' ? 'MAT' : n.type === 'view' ? 'VIEW' : n.type.toUpperCase()}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default LineagePanel;
