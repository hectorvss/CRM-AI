// SQL editor shared types — mirrors PostHog OSS
// `frontend/src/scenes/data-warehouse/editor/multitabEditorLogic.ts` and
// `frontend/src/queries/schema.ts` (HogQLQueryResponse, DatabaseSchemaTable, …).

/** One open editor tab. Persisted in `sessionStorage` between reloads. */
export interface SqlTab {
  id: string;
  name: string;
  query: string;
  /** Raw response from `POST /query/`. `null` until executed. */
  result: HogQLQueryResponse | null;
  error: string | null;
  /** `true` once the tab has been executed at least once. */
  ran: boolean;
  /** Optional id of the `warehouse_saved_query` this tab is bound to. */
  savedQueryId?: string;
}

/** One row in the query history sidebar. */
export interface HistoryEntry {
  id: string;
  query: string;
  /** epoch ms */
  ts: number;
  duration?: number;
  rowCount?: number;
  error?: string;
}

/** Shape returned by `POST /api/projects/{pid}/query/` for HogQLQuery. */
export interface HogQLQueryResponse {
  results?: any[][];
  columns?: string[];
  types?: string[];
  hogql?: string;
  clickhouse?: string;
  timings?: { k: string; t: number }[];
  /** Some responses wrap rows under `results.results`. */
  query_status?: any;
}

/** Single field inside a database table — mirrors `DatabaseSchemaField`. */
export interface DatabaseSchemaField {
  key: string;
  type: string;
  schema_valid?: boolean;
  hogql_value?: string;
  /** For materialized views / nested fields. */
  chain?: string[];
  fields?: Record<string, DatabaseSchemaField>;
}

/** One table in the schema browser — mirrors `DatabaseSchemaTable`. */
export interface DatabaseSchemaTable {
  name: string;
  /** PostHog literals: 'posthog' | 'data_warehouse' | 'view' | 'materialized_view' | 'managed_view' */
  type: 'posthog' | 'data_warehouse' | 'view' | 'materialized_view' | 'managed_view' | 'system';
  id?: string;
  fields: Record<string, DatabaseSchemaField>;
  /** Sync state for warehouse / managed tables. */
  status?: 'Running' | 'Completed' | 'Failed' | 'Cancelled';
  row_count?: number;
}

/** Full response of `GET /api/projects/{pid}/database/`. */
export interface DatabaseSchema {
  tables: DatabaseSchemaTable[];
}

/** A snippet shown in the templates sidebar. */
export interface SqlSnippet {
  name: string;
  description: string;
  query: string;
}
