// DatabaseTablesContainer — schema browser tree, fed by
// `GET /api/projects/{pid}/database/`. Mirrors PostHog's
// `frontend/src/scenes/data-warehouse/external/DatabaseTablesContainer.tsx`.
//
// Groups tables by `type` exactly as PostHog does:
//   • posthog            → "PostHog" group  (events, persons, sessions, groups…)
//   • data_warehouse     → "Sources"        (custom warehouse_tables)
//   • view               → "Views"          (warehouse_saved_queries)
//   • materialized_view  → "Materialized views"
//   • managed_view       → "Managed views"
//   • system             → "System"
//
// Each row click inserts the table name (or `table.column` for fields) at the
// editor cursor via the `onInsert` callback. Empty groups are hidden.

import React from 'react';
import type { DatabaseSchema, DatabaseSchemaTable, DatabaseSchemaField } from './types';

interface DatabaseTablesContainerProps {
  /** Called when the user clicks a table or field — inserts text at cursor. */
  onInsert: (text: string) => void;
  /** Optional outer className. */
  className?: string;
}

type GroupKey = DatabaseSchemaTable['type'];

const GROUP_ORDER: { key: GroupKey; label: string }[] = [
  { key: 'posthog',           label: 'PostHog' },
  { key: 'data_warehouse',    label: 'Sources' },
  { key: 'view',              label: 'Views' },
  { key: 'materialized_view', label: 'Materialized views' },
  { key: 'managed_view',      label: 'Managed views' },
  { key: 'system',            label: 'System' },
];

export function DatabaseTablesContainer({ onInsert, className }: DatabaseTablesContainerProps): React.ReactElement {
  const [schema, setSchema] = React.useState<DatabaseSchema | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [openTables, setOpenTables] = React.useState<Record<string, boolean>>({});
  const [openGroups, setOpenGroups] = React.useState<Record<GroupKey, boolean>>({
    posthog: true,
    data_warehouse: false,
    view: false,
    materialized_view: false,
    managed_view: false,
    system: false,
  });
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ph = await import('../../api/posthog');
        if (!ph.getProjectId()) await ph.bootstrapPostHog();
        const res = await ph.posthog.database.get() as DatabaseSchema;
        if (!cancelled) {
          setSchema(res);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Error cargando esquema');
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const grouped = React.useMemo(() => {
    if (!schema) return new Map<GroupKey, DatabaseSchemaTable[]>();
    const map = new Map<GroupKey, DatabaseSchemaTable[]>();
    for (const t of schema.tables) {
      const list = map.get(t.type) ?? [];
      const matchesSearch = !search.trim()
        || t.name.toLowerCase().includes(search.toLowerCase())
        || Object.keys(t.fields ?? {}).some(f => f.toLowerCase().includes(search.toLowerCase()));
      if (matchesSearch) {
        list.push(t);
        map.set(t.type, list);
      }
    }
    return map;
  }, [schema, search]);

  return (
    <div className={`flex flex-col h-full min-h-0 ${className ?? ''}`}>
      <div className="px-2 py-1.5 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-2 bg-white border border-[#e9eae6] rounded-[6px] px-2 h-7">
          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-[#9a9a98] flex-shrink-0" strokeWidth="1.5">
            <circle cx="7" cy="7" r="4" /><path d="M10.5 10.5l2.5 2.5" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar en el esquema"
            className="flex-1 text-[12px] bg-transparent outline-none text-[#1a1a18] placeholder-[#9a9a98]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 min-h-0">
        {loading && (
          <div className="text-[11px] text-[#9ca3af] px-1 py-2">Cargando esquema…</div>
        )}
        {error && !loading && (
          <div className="text-[11px] text-[#dc2626] px-1 py-2">{error}</div>
        )}
        {!loading && !error && schema && (
          <>
            {GROUP_ORDER.map(({ key, label }) => {
              const tables = grouped.get(key);
              if (!tables || tables.length === 0) return null;
              const isOpen = openGroups[key];
              return (
                <div key={key} className="mb-1">
                  <button
                    onClick={() => setOpenGroups(s => ({ ...s, [key]: !s[key] }))}
                    className="w-full flex items-center justify-between h-6 px-1 hover:bg-[#f3f3f1] rounded"
                  >
                    <span className="text-[10px] font-semibold text-[#9a9a98] uppercase tracking-wide">{label}</span>
                    <svg viewBox="0 0 16 16" className={`w-2.5 h-2.5 fill-[#9a9a98] transition-transform ${isOpen ? 'rotate-90' : ''}`}>
                      <path d="M6 4l4 4-4 4z" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      {tables.map(t => (
                        <TableRow
                          key={t.id ?? t.name}
                          table={t}
                          isOpen={!!openTables[t.name]}
                          onToggle={() => setOpenTables(s => ({ ...s, [t.name]: !s[t.name] }))}
                          onInsert={onInsert}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {grouped.size === 0 && (
              <div className="text-[11px] text-[#9ca3af] px-1 py-2">Sin coincidencias.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface TableRowProps {
  table: DatabaseSchemaTable;
  isOpen: boolean;
  onToggle: () => void;
  onInsert: (text: string) => void;
}

const TableRow: React.FC<TableRowProps> = ({ table, isOpen, onToggle, onInsert }) => {
  const fields: DatabaseSchemaField[] = Object.values(table.fields ?? {}) as DatabaseSchemaField[];
  return (
    <div>
      <div className="group h-7 flex items-center gap-1 px-1 rounded hover:bg-[#f3f3f1] cursor-pointer">
        <button onClick={onToggle} className="w-3 h-3 flex items-center justify-center text-[#9a9a98]">
          <svg viewBox="0 0 16 16" className={`w-2.5 h-2.5 fill-current transition-transform ${isOpen ? 'rotate-90' : ''}`}>
            <path d="M6 4l4 4-4 4z" />
          </svg>
        </button>
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462] flex-shrink-0" strokeWidth="1.3">
          <rect x="2" y="2" width="12" height="12" rx="1.5" />
          <path d="M2 6h12M6 6v8" strokeLinecap="round" />
        </svg>
        <button
          onClick={() => onInsert(table.name)}
          className="flex-1 text-left text-[12px] text-[#1a1a18] truncate"
          title={`Insertar "${table.name}"`}
        >
          {table.name}
        </button>
        {table.row_count != null && (
          <span className="text-[10px] text-[#9ca3af] font-mono opacity-0 group-hover:opacity-100">
            {table.row_count.toLocaleString('es-ES')}
          </span>
        )}
      </div>
      {isOpen && (
        <div className="pl-6 flex flex-col gap-0.5">
          {fields.map(f => (
            <button
              key={f.key}
              onClick={() => onInsert(f.hogql_value ?? `${table.name}.${f.key}`)}
              className="h-6 flex items-center gap-1.5 px-1 rounded hover:bg-[#f3f3f1] text-[11px] text-left"
              title={`Insertar "${f.hogql_value ?? `${table.name}.${f.key}`}"`}
            >
              <svg viewBox="0 0 16 16" className="w-2.5 h-2.5 fill-[#9ca3af] flex-shrink-0">
                <rect x="3" y="6" width="10" height="4" rx="1" />
              </svg>
              <span className="text-[#1a1a18] flex-1 truncate">{f.key}</span>
              <span className="text-[#9ca3af] font-mono text-[10px]">{f.type}</span>
            </button>
          ))}
          {fields.length === 0 && (
            <div className="text-[10px] text-[#9ca3af] px-1 py-1">Sin campos.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default DatabaseTablesContainer;
