// SqlResultsTable — renders the tabular response of a `POST /query/` HogQL
// request. Mirrors the data extraction in PostHog's
// `frontend/src/queries/nodes/DataTable/DataTable.tsx` (columns + results).
//
// PostHog's HogQLQueryResponse shape: `{ columns, results, types, hogql }`.
// Some envelope responses wrap rows under `results.results`. Both supported.

import React from 'react';
import type { HogQLQueryResponse } from './types';

interface SqlResultsTableProps {
  result: HogQLQueryResponse | null;
  /** Optional max rows to render before showing "+N more". Default 1000. */
  maxRows?: number;
}

function extractColumnsAndRows(result: HogQLQueryResponse | null): { columns: string[]; rows: any[][] } {
  if (!result) return { columns: [], rows: [] };
  const columns: string[] =
    Array.isArray((result as any).columns) ? (result as any).columns :
    Array.isArray((result as any).results?.columns) ? (result as any).results.columns :
    [];
  const rawRows =
    Array.isArray((result as any).results) ? (result as any).results :
    Array.isArray((result as any).results?.results) ? (result as any).results.results :
    [];
  const rows: any[][] = rawRows.map((r: any) => Array.isArray(r) ? r : Object.values(r));
  return { columns, rows };
}

function formatCell(v: any): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function SqlResultsTable({ result, maxRows = 1000 }: SqlResultsTableProps): React.ReactElement {
  const { columns, rows } = React.useMemo(() => extractColumnsAndRows(result), [result]);

  if (!result) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-[#9ca3af]">
        Ejecuta una consulta para ver resultados (⌘ Enter)
      </div>
    );
  }

  if (rows.length === 0 && columns.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-[#9ca3af]">
        Sin resultados.
      </div>
    );
  }

  const truncated = rows.length > maxRows;
  const visibleRows = truncated ? rows.slice(0, maxRows) : rows;

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-[12px] border-collapse">
        <thead className="sticky top-0 bg-[#f8f8f7] z-10">
          <tr className="border-b border-[#e9eae6]">
            {columns.map((c, i) => (
              <th
                key={i}
                className="px-3 py-2 text-left font-semibold text-[#646462] uppercase tracking-wide text-[10px] whitespace-nowrap"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r, ri) => (
            <tr key={ri} className="border-b border-[#f3f3f1] hover:bg-[#f9f9f7]">
              {r.map((cell, ci) => (
                <td
                  key={ci}
                  className="px-3 py-1.5 font-mono text-[11px] text-[#1a1a18] whitespace-nowrap"
                  title={formatCell(cell)}
                >
                  {formatCell(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && (
        <div className="px-3 py-2 text-[11px] text-[#9ca3af] bg-[#fafaf9] border-t border-[#e9eae6] text-center">
          Mostrando {maxRows.toLocaleString('es-ES')} de {rows.length.toLocaleString('es-ES')} filas. Refina tu consulta con LIMIT para ver más.
        </div>
      )}
    </div>
  );
}

export default SqlResultsTable;
