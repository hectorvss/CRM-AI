// OutputPane — bottom results panel. Mirrors PostHog's
// `frontend/src/scenes/data-warehouse/editor/OutputPane.tsx`.
//
// PostHog tab order: `results | visualization | info | lineage | history`.
// We implement all five:
//   • results        → SqlResultsTable
//   • visualization  → placeholder (needs <InsightViz> from charts/ — pending)
//   • info           → InfoPanel  (POST /query/ kind=HogQLMetadata)
//   • lineage        → LineagePanel (POST .../{id}/ancestors|descendants/)
//   • history        → HistoryPanel (local-only, last 50)
// Plus a `json` tab for raw response inspection (Clain-specific affordance).

import React from 'react';
import type { HogQLQueryResponse, HistoryEntry } from './types';
import { SqlResultsTable } from './SqlResultsTable';
import { InfoPanel } from './InfoPanel';
import { LineagePanel } from './LineagePanel';
import { HistoryPanel } from './HistoryPanel';

export type OutputPaneTab = 'results' | 'visualization' | 'info' | 'lineage' | 'history' | 'json';

interface OutputPaneProps {
  result: HogQLQueryResponse | null;
  error: string | null;
  running: boolean;
  /** Current SQL of the active tab (for info / lineage / history actions). */
  query: string;
  /** Saved-query id of the active tab (lineage only meaningful when set). */
  savedQueryId?: string;
  /** History entries, only used when tabs include 'history'. */
  history?: HistoryEntry[];
  onLoadHistory?: (query: string) => void;
  onClearHistory?: () => void;
  /** Tabs to expose. Defaults to PostHog's 5 + raw json. */
  tabs?: OutputPaneTab[];
  minHeight?: number;
  maxHeightPct?: string;
}

const TAB_LABELS: Record<OutputPaneTab, string> = {
  results:       'Resultados',
  visualization: 'Visualización',
  info:          'Información',
  lineage:       'Linaje',
  history:       'Historial',
  json:          'JSON crudo',
};

export function OutputPane({
  result, error, running, query, savedQueryId,
  history = [], onLoadHistory, onClearHistory,
  tabs = ['results', 'visualization', 'info', 'lineage', 'history', 'json'],
  minHeight = 220,
  maxHeightPct = '50%',
}: OutputPaneProps): React.ReactElement {
  const [active, setActive] = React.useState<OutputPaneTab>(tabs[0]);

  React.useEffect(() => {
    if (!tabs.includes(active)) setActive(tabs[0]);
  }, [tabs, active]);

  return (
    <div
      className="border-t border-[#e9eae6] flex flex-col"
      style={{ minHeight, maxHeight: maxHeightPct }}
    >
      <div className="flex items-center gap-1 px-4 border-b border-[#e9eae6] bg-[#fafaf9] flex-shrink-0">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setActive(t)}
            className={`px-3 py-2 text-xs font-medium border-b-2 ${active === t ? 'border-[#7c3aed] text-[#7c3aed]' : 'border-transparent text-[#646462] hover:text-[#1a1a18]'}`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {error && active !== 'info' && active !== 'history' ? (
          <div className="p-4">
            <div className="bg-[#fef2f2] border border-[#fecaca] rounded-lg p-3 text-xs text-[#991b1b]">
              <p className="font-semibold mb-1">Error al ejecutar la consulta:</p>
              <pre className="font-mono whitespace-pre-wrap break-words">{error}</pre>
            </div>
          </div>
        ) : active === 'results' ? (
          !result ? (
            <div className="flex items-center justify-center h-full text-xs text-[#9ca3af]">
              {running ? 'Ejecutando…' : 'Ejecuta una consulta para ver resultados (⌘ Enter)'}
            </div>
          ) : (
            <SqlResultsTable result={result} />
          )
        ) : active === 'json' ? (
          !result ? (
            <div className="flex items-center justify-center h-full text-xs text-[#9ca3af]">
              {running ? 'Ejecutando…' : 'Sin respuesta cruda todavía.'}
            </div>
          ) : (
            <pre className="p-3 text-[11px] font-mono overflow-auto h-full whitespace-pre-wrap">
              {JSON.stringify(result, null, 2)}
            </pre>
          )
        ) : active === 'info' ? (
          <InfoPanel query={query} />
        ) : active === 'lineage' ? (
          <LineagePanel savedQueryId={savedQueryId} />
        ) : active === 'history' ? (
          <HistoryPanel
            history={history}
            onLoad={onLoadHistory ?? (() => undefined)}
            onClear={onClearHistory ?? (() => undefined)}
          />
        ) : active === 'visualization' ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <svg viewBox="0 0 16 16" className="w-8 h-8 fill-[#e9eae6] mb-2">
              <path d="M2 13h2V9H2v4zm3 0h2V6H5v7zm3 0h2V3H8v10zm3 0h2V7h-2v6z" />
            </svg>
            <p className="text-[13px] font-medium text-[#1a1a18] mb-1">Visualización</p>
            <p className="text-[11px] text-[#646462] max-w-[320px]">
              Guarda esta consulta como insight para abrirla en el editor de visualización (gráficos de tendencias, embudos, etc.).
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-[#9ca3af]">
            {TAB_LABELS[active]}
          </div>
        )}
      </div>
    </div>
  );
}

export default OutputPane;
