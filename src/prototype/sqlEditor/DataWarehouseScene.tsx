// DataWarehouseScene — the full-IDE SQL editor. Mirrors PostHog's
// `frontend/src/scenes/data-warehouse/editor/EditorScene.tsx` (the canonical
// data warehouse editor that lives at `/data-warehouse`).
//
// Composition:
//   <DataWarehouseScene>
//     <TopTabBar/>            ← "Consulta SQL" closeable tab + new tab
//     <SceneHeader/>          ← title + Inicio rápido + Save-as-insight + bell
//     <body>
//       <EditorSidebar mode="dataWarehouse" />
//       <main>
//         <EditorToolbar/>    ← Run split, Variables, Filters, Fix-with-AI
//         <QueryTabs/>
//         <QueryWindow/>
//         <OutputPane/>       ← 5 tabs (results / viz / info / lineage / hist)
//       </main>
//       <QuickStartPanel/>    ← right rail, optional
//       <FixWithAIPanel/>     ← right rail, optional
//     </body>
//     <SourceCreateModal/>    ← "+" in sidebar → new external source
//     <SaveAsInsightModal/>
//     <SaveAsViewModal/>
//   </DataWarehouseScene>
//
// State is local (useState + sessionStorage for tabs, localStorage for history)
// instead of Kea, but every action maps to a real PostHog endpoint.

import React from 'react';
import type { SqlTab, HistoryEntry, HogQLQueryResponse } from './types';
import type { SavedQuery } from './SavedQueriesList';
import { EditorSidebar } from './EditorSidebar';
import { QueryWindow } from './QueryWindow';
import { OutputPane } from './OutputPane';
import { SourceCreateModal } from './SourceCreateModal';
import { VariablesPopover, substituteVariables } from './VariablesPopover';
import { FixWithAIPanel } from './FixWithAIPanel';

interface DataWarehouseSceneProps {
  /** Optional close button (top-tab "x"). The /data-warehouse landing page
   *  doesn't normally surface this — but the Datos → Modelos flow opens it
   *  in a modal-like overlay that does. */
  onClose?: () => void;
}

interface QuickStartItem {
  label: string;
  done: boolean;
  section: string | null;
}

const QUICK_START_ITEMS: QuickStartItem[] = [
  { label: 'Ingestar tu primer evento',          done: false, section: 'CONFIGURACIÓN DE CLAIN' },
  { label: 'Crear tu primer insight',            done: false, section: 'PRIMEROS PASOS' },
  { label: 'Crear tu primer dashboard',          done: false, section: null },
  { label: 'Crear un insight de tendencias',     done: false, section: 'MÁS OPCIONES' },
  { label: 'Crear un insight de embudo',         done: false, section: null },
  { label: 'Explorar análisis de retención',     done: false, section: null },
  { label: 'Explorar rutas de usuario',          done: false, section: null },
  { label: 'Explorar stickiness',                done: false, section: null },
  { label: 'Explorar análisis de ciclo de vida', done: false, section: null },
  { label: 'Rastrear eventos personalizados',    done: false, section: null },
  { label: 'Definir acciones',                   done: false, section: null },
  { label: 'Crear una cohorte de usuarios',      done: false, section: null },
];

function makeInitialTab(): SqlTab {
  return {
    id: crypto.randomUUID(),
    name: 'Nueva consulta SQL',
    query: '',
    result: null,
    error: null,
    ran: false,
  };
}

export function DataWarehouseScene({ onClose }: DataWarehouseSceneProps): React.ReactElement {
  const [tabs, setTabs] = React.useState<SqlTab[]>([makeInitialTab()]);
  const [activeId, setActiveId] = React.useState<string>(tabs[0].id);
  const [running, setRunning] = React.useState(false);
  const [history, setHistory] = React.useState<HistoryEntry[]>([]);
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [quickStartOpen, setQuickStartOpen] = React.useState(false);
  const [fixAIOpen, setFixAIOpen] = React.useState(false);
  const [variables, setVariables] = React.useState<Record<string, string>>({});
  const [varsPopover, setVarsPopover] = React.useState(false);
  const [runMenu, setRunMenu] = React.useState(false);
  const [sourceMenu, setSourceMenu] = React.useState(false);
  const [saveInsightMenu, setSaveInsightMenu] = React.useState(false);
  const [savingAsView, setSavingAsView] = React.useState(false);
  const [savingAsInsight, setSavingAsInsight] = React.useState(false);
  const [createSourceOpen, setCreateSourceOpen] = React.useState(false);
  const [sidebarReloadKey, setSidebarReloadKey] = React.useState(0);
  const [selectedSource, setSelectedSource] = React.useState('Clain (ClickHouse)');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const active = tabs.find(t => t.id === activeId) ?? tabs[0];

  // ── Persistence ──────────────────────────────────────────────────────────
  React.useEffect(() => {
    try {
      // Cross-page intent: "open this saved query in a new editor tab"
      // (used when navigating from Datos → Modelos).
      const intentRaw = sessionStorage.getItem('wa-sql-intent-saved-query');
      if (intentRaw) {
        sessionStorage.removeItem('wa-sql-intent-saved-query');
        const q = JSON.parse(intentRaw) as SavedQuery;
        const queryText = typeof q.query === 'object' && (q.query as any).query
          ? String((q.query as any).query)
          : JSON.stringify(q.query, null, 2);
        const id = crypto.randomUUID();
        setTabs([{ id, name: q.name, query: queryText, result: null, error: null, ran: false, savedQueryId: q.id }]);
        setActiveId(id);
      } else {
        const raw = sessionStorage.getItem('wa-sql-tabs-dw');
        if (raw) {
          const parsed = JSON.parse(raw) as SqlTab[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setTabs(parsed);
            setActiveId(parsed[0].id);
          }
        }
      }
      const rawH = localStorage.getItem('wa-sql-history');
      if (rawH) setHistory(JSON.parse(rawH));
      const rawV = sessionStorage.getItem('wa-sql-vars-dw');
      if (rawV) setVariables(JSON.parse(rawV));
    } catch { /* corrupt cache */ }
  }, []);

  React.useEffect(() => {
    try {
      const safe = tabs.map(t => ({ ...t, result: null, error: null, ran: false }));
      sessionStorage.setItem('wa-sql-tabs-dw', JSON.stringify(safe));
    } catch { /* quota */ }
  }, [tabs]);

  React.useEffect(() => {
    try { localStorage.setItem('wa-sql-history', JSON.stringify(history.slice(0, 50))); }
    catch { /* quota */ }
  }, [history]);

  React.useEffect(() => {
    try { sessionStorage.setItem('wa-sql-vars-dw', JSON.stringify(variables)); }
    catch { /* quota */ }
  }, [variables]);

  function updateActive(patch: Partial<SqlTab>): void {
    setTabs(prev => prev.map(t => t.id === activeId ? { ...t, ...patch } : t));
  }

  async function runQuery(): Promise<void> {
    if (!active || !active.query.trim() || running) return;
    setRunning(true);
    updateActive({ error: null });
    const t0 = performance.now();
    const expanded = substituteVariables(active.query, variables);
    try {
      const ph = await import('../../api/posthog');
      if (!ph.getTeamId()) await ph.bootstrapPostHog();
      const res = await ph.posthog.query({
        query: { kind: 'HogQLQuery', query: expanded, variables },
      }) as HogQLQueryResponse;
      const dur = Math.round(performance.now() - t0);
      const rows = Array.isArray((res as any).results) ? (res as any).results : [];
      updateActive({ result: res, error: null, ran: true });
      setHistory(prev => [
        { id: crypto.randomUUID(), query: active.query, ts: Date.now(), duration: dur, rowCount: rows.length },
        ...prev,
      ].slice(0, 50));
    } catch (e: any) {
      const msg = e?.message ?? 'Error desconocido';
      updateActive({ error: msg, result: null, ran: true });
      setHistory(prev => [
        { id: crypto.randomUUID(), query: active.query, ts: Date.now(), error: msg },
        ...prev,
      ].slice(0, 50));
    } finally {
      setRunning(false);
    }
  }

  async function saveAsInsight(name: string): Promise<void> {
    if (!name.trim()) return;
    try {
      const ph = await import('../../api/posthog');
      if (!ph.getTeamId()) await ph.bootstrapPostHog();
      await ph.phPost(`/api/environments/${ph.getTeamId()}/insights/`, {
        name: name.trim(),
        saved: true,
        query: { kind: 'DataTableNode', source: { kind: 'HogQLQuery', query: active.query } },
      });
      alert('Insight guardado.');
      setSavingAsInsight(false);
    } catch (e: any) {
      alert(e?.message ?? 'Error');
    }
  }

  async function saveAsView(name: string): Promise<void> {
    if (!name.trim()) return;
    try {
      const ph = await import('../../api/posthog');
      if (!ph.getProjectId()) await ph.bootstrapPostHog();
      const created = await ph.posthog.warehouse.savedQueries.create({
        name: name.trim(),
        query: { kind: 'HogQLQuery', query: active.query },
      }) as any;
      const id = created?.id;
      updateActive({ savedQueryId: id, name: name.trim() });
      setSidebarReloadKey(k => k + 1);
      setSavingAsView(false);
    } catch (e: any) {
      alert(e?.message ?? 'Error');
    }
  }

  function newTab(): void {
    const id = crypto.randomUUID();
    setTabs(prev => [...prev, { id, name: `Consulta ${prev.length + 1}`, query: '', result: null, error: null, ran: false }]);
    setActiveId(id);
  }

  function closeTab(id: string): void {
    if (tabs.length === 1) {
      // Closing the last tab when an `onClose` is given closes the scene.
      if (onClose) { onClose(); return; }
      return;
    }
    const idx = tabs.findIndex(t => t.id === id);
    const next = tabs.filter(t => t.id !== id);
    setTabs(next);
    if (activeId === id) setActiveId(next[Math.max(0, idx - 1)].id);
  }

  function renameTab(id: string, name: string): void {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, name } : t));
  }

  function insertAtCursor(text: string): void {
    const ta = textareaRef.current;
    if (!ta) { updateActive({ query: active.query + text }); return; }
    const s = ta.selectionStart, e = ta.selectionEnd;
    const next = active.query.slice(0, s) + text + active.query.slice(e);
    updateActive({ query: next });
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + text.length, s + text.length);
    });
  }

  function openSavedQuery(q: SavedQuery): void {
    const queryText = typeof q.query === 'object' && (q.query as any).query
      ? String((q.query as any).query)
      : JSON.stringify(q.query, null, 2);
    // If already open in a tab, focus it.
    const existing = tabs.find(t => t.savedQueryId === q.id);
    if (existing) { setActiveId(existing.id); return; }
    const id = crypto.randomUUID();
    setTabs(prev => [...prev, { id, name: q.name, query: queryText, result: null, error: null, ran: false, savedQueryId: q.id }]);
    setActiveId(id);
  }

  const lineCount = Math.max(20, (active.query.match(/\n/g) || []).length + 2);

  const closeAll = (): void => {
    setRunMenu(false); setSourceMenu(false); setVarsPopover(false); setSaveInsightMenu(false);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white" onClick={closeAll}>
      {/* ── Top tab bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center bg-[#f8f8f7] border-b border-[#e9eae6] pl-2 h-9 flex-shrink-0 gap-0.5">
        {tabs.map(t => {
          const isActive = t.id === activeId;
          return (
            <div
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className={`flex items-center gap-1.5 h-7 px-3 rounded-t-[6px] border border-[#e9eae6] text-[12px] font-medium -mb-px cursor-pointer group ${isActive ? 'bg-white text-[#1a1a18] border-b-white' : 'text-[#646462] bg-transparent border-transparent hover:bg-white/50'}`}
            >
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.3">
                <rect x="2" y="2" width="12" height="12" rx="1.5" /><path d="M2 6h12M6 6v8" strokeLinecap="round" />
              </svg>
              <input
                value={t.name}
                onChange={e => renameTab(t.id, e.target.value)}
                onClick={e => e.stopPropagation()}
                className="bg-transparent border-0 focus:outline-none focus:bg-[#fafaf9] focus:rounded px-1 w-32 truncate"
              />
              <button
                onClick={e => { e.stopPropagation(); closeTab(t.id); }}
                className="w-4 h-4 flex items-center justify-center rounded hover:bg-[#e9eae6] flex-shrink-0 opacity-0 group-hover:opacity-100"
                aria-label={`Cerrar ${t.name}`}
              >
                <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-[#9a9a98]" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M11 5L5 11M5 5l6 6" />
                </svg>
              </button>
            </div>
          );
        })}
        <button onClick={newTab} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#e9eae6] text-[#646462]" aria-label="Nueva pestaña">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462]">
            <path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z" />
          </svg>
        </button>
      </div>

      {/* ── Scene header ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#e9eae6] flex-shrink-0">
        <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a18]" strokeWidth="1.3">
          <rect x="2" y="2" width="12" height="12" rx="1.5" /><path d="M2 6h12M6 6v8" strokeLinecap="round" />
        </svg>
        <input
          value={active.name}
          onChange={e => renameTab(active.id, e.target.value)}
          className="text-[15px] font-semibold text-[#1a1a18] flex-1 bg-transparent outline-none focus:bg-[#fafaf9] px-1 rounded"
        />
        <button
          onClick={e => { e.stopPropagation(); setQuickStartOpen(v => !v); }}
          className={`h-8 px-3 rounded-lg border text-[12px] font-medium flex items-center gap-1.5 ${quickStartOpen ? 'bg-[#fff5f2] border-[#fbd2c1] text-[#e8572a]' : 'bg-white border-[#e9eae6] text-[#1a1a18] hover:bg-[#f7f7f5]'}`}
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5">
            <circle cx="8" cy="8" r="5.5" /><path d="M8 5v3.5M8 11v.01" strokeLinecap="round" />
          </svg>
          Inicio rápido
          <span className="text-[10px] font-semibold bg-[#fff5f2] text-[#e8572a] px-1.5 py-0.5 rounded-full">{QUICK_START_ITEMS.length}</span>
        </button>
        <div className="flex items-center border border-[#e9eae6] rounded-lg overflow-hidden">
          <button
            onClick={() => setSavingAsInsight(true)}
            disabled={!active.ran}
            className="h-8 px-3 text-[12px] font-medium text-[#1a1a18] hover:bg-[#f7f7f5] bg-white disabled:opacity-50"
          >
            Guardar como insight
          </button>
          <div className="w-px h-5 bg-[#e9eae6]" />
          <button
            onClick={e => { e.stopPropagation(); setSaveInsightMenu(v => !v); }}
            className="h-8 w-7 flex items-center justify-center hover:bg-[#f7f7f5] bg-white relative"
          >
            <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4z" /></svg>
            {saveInsightMenu && (
              <div
                onClick={e => e.stopPropagation()}
                className="absolute right-0 top-full mt-1 w-56 bg-white border border-[#e9eae6] rounded-lg shadow-md py-1 z-30"
              >
                <button
                  onClick={() => { setSaveInsightMenu(false); setSavingAsView(true); }}
                  className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#f3f3f1]"
                >
                  Guardar como vista
                </button>
                <button
                  onClick={() => { setSaveInsightMenu(false); setSavingAsInsight(true); }}
                  className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[#f3f3f1]"
                >
                  Guardar como insight
                </button>
              </div>
            )}
          </button>
        </div>
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className={`w-8 h-8 flex items-center justify-center rounded-lg border ${sidebarOpen ? 'bg-white border-[#e9eae6]' : 'bg-[#fff5f2] border-[#fbd2c1]'} hover:bg-[#f7f7f5]`}
          title={sidebarOpen ? 'Ocultar esquema' : 'Mostrar esquema'}
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462]">
            <rect x="1" y="3" width="6" height="10" rx="1" /><rect x="9" y="3" width="6" height="10" rx="1" />
          </svg>
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {sidebarOpen && (
          <div className="flex flex-col flex-shrink-0">
            {/* Source selector */}
            <div className="px-2 py-2 border-r border-b border-[#e9eae6] bg-[#fafaf9] relative" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setSourceMenu(v => !v)}
                className="w-[249px] h-8 px-2 rounded-md border border-[#e9eae6] bg-white text-[12px] text-[#1a1a18] flex items-center gap-2 hover:border-[#c5c5c2]"
              >
                <div className="w-4 h-4 rounded-[3px] bg-[#3b59f6] flex-shrink-0 flex items-center justify-center">
                  <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 fill-white"><path d="M1 1v8h8V7H3V1H1z" /></svg>
                </div>
                <span className="flex-1 text-left truncate">{selectedSource}</span>
                <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#9a9a98] flex-shrink-0"><path d="M4 6l4 4 4-4z" /></svg>
              </button>
              {sourceMenu && (
                <div className="absolute left-2 top-full mt-1 w-[249px] bg-white border border-[#e9eae6] rounded-lg shadow-md z-30 py-1">
                  <div
                    className="flex items-center gap-2 px-3 h-9 hover:bg-[#f3f3f1] cursor-pointer"
                    onClick={() => { setSelectedSource('Clain (ClickHouse)'); setSourceMenu(false); }}
                  >
                    <div className="w-4 h-4 rounded-[3px] bg-[#3b59f6] flex-shrink-0 flex items-center justify-center">
                      <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 fill-white"><path d="M1 1v8h8V7H3V1H1z" /></svg>
                    </div>
                    <span className="text-[13px] text-[#1a1a18]">Clain (ClickHouse)</span>
                    {selectedSource === 'Clain (ClickHouse)' && (
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#3b59f6] ml-auto"><path d="M3.5 8L6.5 11 12.5 5" /></svg>
                    )}
                  </div>
                  <div className="h-px bg-[#e9eae6] mx-3 my-1" />
                  <button
                    onClick={() => { setSourceMenu(false); setCreateSourceOpen(true); }}
                    className="w-full flex items-center gap-2 px-3 h-9 hover:bg-[#f3f3f1] text-[13px] text-[#e8572a] font-medium"
                  >
                    + Añadir conexión externa
                  </button>
                </div>
              )}
            </div>
            <EditorSidebar
              mode="dataWarehouse"
              onInsert={insertAtCursor}
              onOpenSavedQuery={openSavedQuery}
              onAddSource={() => setCreateSourceOpen(true)}
              reloadKey={sidebarReloadKey}
            />
          </div>
        )}

        {/* Main editor area */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Toolbar */}
          <div
            className="flex items-center gap-2 px-3 py-2 border-b border-[#e9eae6] flex-shrink-0 bg-white"
            onClick={e => e.stopPropagation()}
          >
            <div className="relative flex items-center">
              <button
                onClick={runQuery}
                disabled={running || !active.query.trim()}
                className="h-8 pl-3 pr-2 rounded-l-lg bg-[#3b59f6] text-white text-[12px] font-semibold hover:bg-[#2d46e0] flex items-center gap-1.5 disabled:opacity-50"
              >
                {running ? (
                  <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Ejecutando…</>
                ) : (
                  <><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-white"><path d="M5 3l8 5-8 5V3z" /></svg> Ejecutar</>
                )}
              </button>
              <button
                onClick={e => { e.stopPropagation(); setRunMenu(v => !v); }}
                className="h-8 w-7 flex items-center justify-center rounded-r-lg bg-[#3b59f6] text-white hover:bg-[#2d46e0] border-l border-[#2d46e0]"
              >
                <svg viewBox="0 0 16 16" className="w-3 h-3 fill-white"><path d="M4 6l4 4 4-4z" /></svg>
              </button>
              {runMenu && (
                <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-[#e9eae6] rounded-lg shadow-md z-30 py-1">
                  <button
                    onClick={() => { setRunMenu(false); void runQuery(); }}
                    className="w-full h-9 px-3 text-left text-[13px] text-[#1a1a18] hover:bg-[#f3f3f1] flex items-center justify-between"
                  >
                    <span>Ejecutar consulta completa</span>
                    <kbd className="text-[11px] text-[#9a9a98] font-mono">⌘↵</kbd>
                  </button>
                </div>
              )}
            </div>

            <div className="w-px h-5 bg-[#e9eae6]" />

            <div className="relative">
              <button
                onClick={e => { e.stopPropagation(); setVarsPopover(v => !v); }}
                className="h-8 px-3 rounded-lg border border-[#e9eae6] bg-white text-[12px] text-[#646462] hover:bg-[#f7f7f5] flex items-center gap-1.5"
              >
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.3">
                  <rect x="2" y="3" width="12" height="10" rx="1.5" />
                  <path d="M5 7l-2 1.5L5 10M11 7l2 1.5L11 10M8 6.5l-1 3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Variables
                {Object.keys(variables).length > 0 && (
                  <span className="text-[10px] bg-[#fff5f2] text-[#e8572a] px-1.5 py-0.5 rounded-full font-semibold">
                    {Object.keys(variables).length}
                  </span>
                )}
                <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#9a9a98]"><path d="M4 6l4 4 4-4z" /></svg>
              </button>
              <VariablesPopover
                open={varsPopover}
                variables={variables}
                onChange={setVariables}
                onClose={() => setVarsPopover(false)}
              />
            </div>

            <div className="flex-1" />

            <button
              onClick={() => setFixAIOpen(v => !v)}
              className={`h-8 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1.5 ${fixAIOpen ? 'bg-[#fff5f2] text-[#e8572a]' : 'text-[#e8572a] hover:bg-[#fff5f2]'}`}
            >
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M9 1L3 9h4l-2 6 6-8H7l2-6z" /></svg>
              Corregir errores con IA
            </button>
          </div>

          {/* SQL editor area: line numbers + QueryWindow */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            <div className="w-10 flex-shrink-0 pt-3 text-right pr-2 text-[11px] text-[#9ca3af] select-none overflow-hidden border-r border-[#e9eae6] bg-[#f8f8f7] font-mono">
              {Array.from({ length: lineCount }).map((_, i) => (
                <div key={i} className="leading-[1.6]">{i + 1}</div>
              ))}
            </div>
            <div className="flex-1 flex flex-col min-h-0">
              <QueryWindow
                value={active.query}
                onChange={q => updateActive({ query: q })}
                onRun={runQuery}
                running={running}
                ran={active.ran}
                error={active.error}
                textareaRef={textareaRef}
                placeholder="-- Escribe tu consulta HogQL aquí…"
              />
            </div>
          </div>

          {/* Output pane with all 5 PostHog tabs + json */}
          <OutputPane
            result={active.result}
            error={active.error}
            running={running}
            query={active.query}
            savedQueryId={active.savedQueryId}
            history={history}
            onLoadHistory={q => updateActive({ query: q })}
            onClearHistory={() => setHistory([])}
            minHeight={240}
          />
        </div>

        {/* Quick start right rail */}
        {quickStartOpen && <QuickStartPanel onClose={() => setQuickStartOpen(false)} />}

        {/* Fix-with-AI right rail */}
        <FixWithAIPanel
          open={fixAIOpen}
          onClose={() => setFixAIOpen(false)}
          currentQuery={active.query}
          errorMessage={active.error}
          onApply={fix => updateActive({ query: fix })}
        />
      </div>

      {/* New source modal */}
      <SourceCreateModal
        open={createSourceOpen}
        onClose={() => setCreateSourceOpen(false)}
        onCreated={() => setSidebarReloadKey(k => k + 1)}
      />

      {/* Save as insight modal */}
      {savingAsInsight && (
        <SaveNameModal
          title="Guardar como insight"
          subtitle="Crea un insight tipo DataTable con esta consulta."
          defaultValue={active.name === 'Nueva consulta SQL' ? '' : active.name}
          ctaLabel="Guardar"
          onCancel={() => setSavingAsInsight(false)}
          onSubmit={saveAsInsight}
        />
      )}

      {/* Save as view modal */}
      {savingAsView && (
        <SaveNameModal
          title="Guardar como vista"
          subtitle="Crea una vista (warehouse_saved_query) reutilizable en otras consultas."
          defaultValue={active.name === 'Nueva consulta SQL' ? '' : active.name}
          ctaLabel="Crear vista"
          onCancel={() => setSavingAsView(false)}
          onSubmit={saveAsView}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function QuickStartPanel({ onClose }: { onClose: () => void }): React.ReactElement {
  const [category, setCategory] = React.useState('Analítica de producto');
  const [catMenu, setCatMenu] = React.useState(false);
  return (
    <div className="w-[260px] flex-shrink-0 border-l border-[#e9eae6] flex flex-col overflow-hidden bg-white" onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#e9eae6] flex-shrink-0">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#9a9a98]" strokeWidth="1.5"><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.5M8 11v.01" strokeLinecap="round"/></svg>
        <span className="text-[12px] font-semibold text-[#1a1a18] flex-1">Inicio rápido</span>
        <div className="relative">
          <button onClick={() => setCatMenu(v => !v)} className="h-6 px-2 rounded border border-[#e9eae6] text-[11px] text-[#1a1a18] flex items-center gap-1 hover:bg-[#f3f3f1]">
            {category.length > 16 ? `${category.slice(0,16)}…` : category}
            <svg viewBox="0 0 16 16" className="w-2.5 h-2.5 fill-[#9a9a98]"><path d="M4 6l4 4 4-4z"/></svg>
          </button>
          {catMenu && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-[#e9eae6] rounded shadow-md z-20 py-1">
              {['Analítica de producto', 'Web analytics', 'Datos'].map(opt => (
                <button
                  key={opt}
                  onClick={() => { setCategory(opt); setCatMenu(false); }}
                  className={`w-full h-8 px-3 text-left text-[12px] hover:bg-[#f3f3f1] flex items-center gap-2 ${category === opt ? 'text-[#e8572a] font-semibold' : 'text-[#1a1a18]'}`}
                >
                  {category === opt && <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#e8572a]"><path d="M3.5 8L6.5 11 12.5 5"/></svg>}
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="text-[11px] font-mono text-[#9a9a98]">0/{QUICK_START_ITEMS.length}</span>
        <button onClick={onClose} className="text-[#9a9a98] hover:text-[#1a1a18] text-xs">×</button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {QUICK_START_ITEMS.map((item, i) => (
          <div key={i}>
            {item.section && (
              <p className="text-[9px] font-semibold text-[#9a9a98] uppercase tracking-wide mt-3 mb-1 px-2">
                {item.section}
              </p>
            )}
            <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#f9f9f7] cursor-pointer">
              <div className={`w-4 h-4 rounded-full border ${item.done ? 'bg-[#16a34a] border-[#16a34a]' : 'border-[#e9eae6]'} flex items-center justify-center flex-shrink-0`}>
                {item.done && <svg viewBox="0 0 16 16" className="w-2.5 h-2.5 fill-white"><path d="M3.5 8L6.5 11 12.5 5"/></svg>}
              </div>
              <span className="text-[12px] text-[#1a1a18]">{item.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SaveNameModal({
  title, subtitle, defaultValue, ctaLabel, onCancel, onSubmit,
}: {
  title: string;
  subtitle: string;
  defaultValue: string;
  ctaLabel: string;
  onCancel: () => void;
  onSubmit: (name: string) => void | Promise<void>;
}): React.ReactElement {
  const [name, setName] = React.useState(defaultValue);
  return (
    <div className="fixed inset-0 bg-[#1a1a18]/30 z-50 flex items-center justify-center" onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-[480px] max-w-[92vw] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e9eae6]">
          <h2 className="text-base font-bold text-[#1a1a18]">{title}</h2>
          <p className="text-xs text-[#646462] mt-0.5">{subtitle}</p>
        </div>
        <div className="p-5">
          <label className="block text-xs font-medium text-[#1a1a18] mb-1">Nombre</label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Mi consulta personalizada"
            className="w-full px-3 py-2 border border-[#e9eae6] rounded-lg text-sm focus:outline-none focus:border-[#3b59f6]"
          />
        </div>
        <div className="px-5 py-3 bg-[#f9f9f7] border-t border-[#e9eae6] flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-[#1a1a18] hover:bg-white rounded">
            Cancelar
          </button>
          <button
            onClick={() => onSubmit(name)}
            disabled={!name.trim()}
            className="px-3 py-1.5 bg-[#1a1a18] text-white text-sm rounded disabled:opacity-50"
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DataWarehouseScene;
