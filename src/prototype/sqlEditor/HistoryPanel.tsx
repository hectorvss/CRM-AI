// HistoryPanel — "Historial" tab inside OutputPane (or a side panel).
// Mirrors PostHog's QueryWindow history (kept in `multitabEditorLogic`).
//
// Rows are local-only (localStorage `wa-sql-history`, 50 last queries).
// Click a row → re-loads it into the active tab via `onLoad`.

import React from 'react';
import type { HistoryEntry } from './types';

interface HistoryPanelProps {
  history: HistoryEntry[];
  onLoad: (query: string) => void;
  onClear: () => void;
}

export function HistoryPanel({ history, onLoad, onClear }: HistoryPanelProps): React.ReactElement {
  if (history.length === 0) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-full text-center">
        <p className="text-[13px] text-[#1a1a18] font-medium mb-1">Sin historial</p>
        <p className="text-[12px] text-[#646462] max-w-[320px]">
          Cada ejecución (correcta o con error) queda registrada aquí durante esta sesión.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#e9eae6] flex-shrink-0">
        <span className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wide">
          {history.length} ejecuciones
        </span>
        <button onClick={onClear} className="text-[11px] text-[#9a9a98] hover:text-[#dc2626]">
          Limpiar
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {history.map(h => (
          <button
            key={h.id}
            onClick={() => onLoad(h.query)}
            className="w-full text-left p-3 border-b border-[#e9eae6] hover:bg-[#f9f9f7]"
          >
            <div className="flex items-center gap-2 mb-1">
              {h.error ? (
                <span className="text-[10px] bg-[#fee2e2] text-[#dc2626] px-1.5 py-0.5 rounded font-semibold">Error</span>
              ) : (
                <span className="text-[10px] bg-[#dcfce7] text-[#16a34a] px-1.5 py-0.5 rounded font-semibold">
                  OK · {h.rowCount ?? 0} filas
                </span>
              )}
              <span className="text-[10px] text-[#9ca3af]">{new Date(h.ts).toLocaleTimeString('es-ES')}</span>
              {h.duration != null && <span className="text-[10px] text-[#9ca3af]">{h.duration}ms</span>}
            </div>
            <pre className="text-[10px] font-mono text-[#1a1a18] line-clamp-3 whitespace-pre-wrap break-words">
              {h.query.slice(0, 200)}
            </pre>
          </button>
        ))}
      </div>
    </div>
  );
}

export default HistoryPanel;
