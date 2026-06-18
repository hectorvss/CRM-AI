// Barrel re-export for the SQL editor module. Mirrors PostHog's
// `frontend/src/scenes/data-warehouse/editor/index.ts`.

export { EditorScene } from './EditorScene';
export { DataWarehouseScene } from './DataWarehouseScene';
export { EditorSidebar } from './EditorSidebar';
export { QueryWindow } from './QueryWindow';
export { QueryTabs } from './QueryTabs';
export { OutputPane } from './OutputPane';
export { DatabaseTablesContainer } from './DatabaseTablesContainer';
export { HogQLHighlight } from './HogQLHighlight';
export { SqlResultsTable } from './SqlResultsTable';
export { SavedQueriesList } from './SavedQueriesList';
export { ExternalSourcesList } from './ExternalSourcesList';
export { SourceCreateModal } from './SourceCreateModal';
export { InfoPanel } from './InfoPanel';
export { LineagePanel } from './LineagePanel';
export { HistoryPanel } from './HistoryPanel';
export { VariablesPopover, substituteVariables } from './VariablesPopover';
export { FixWithAIPanel } from './FixWithAIPanel';
export { useHogQLAutocomplete, AutocompletePopover } from './HogQLAutocomplete';
export { SQL_SNIPPETS } from './snippets';
export type {
  SqlTab,
  HistoryEntry,
  HogQLQueryResponse,
  DatabaseSchema,
  DatabaseSchemaTable,
  DatabaseSchemaField,
  SqlSnippet,
} from './types';
export type { SavedQuery } from './SavedQueriesList';
export type { ExternalDataSource, ExternalDataSchema } from './ExternalSourcesList';
export type { Suggestion } from './HogQLAutocomplete';
export type { OutputPaneTab } from './OutputPane';
