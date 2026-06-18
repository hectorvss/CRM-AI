// EditorScene — top-level SQL editor scene. Mirrors PostHog's
// `frontend/src/scenes/data-warehouse/editor/EditorScene.tsx`.
//
// Composition matches PostHog's tree:
//
//   <EditorScene>
//     <EditorSidebar>
//       <DatabaseTablesContainer/>
//     </EditorSidebar>
//     <div main>
//       <QueryTabs/>
//       <QueryWindow/>
//       <OutputPane/>
//     </div>
//     ...optional Plantillas / Historial side panels
//   </EditorScene>
//
// State (PostHog uses Kea; we use useState + sessionStorage):
//   • tabs        → wa-sql-tabs        (sessionStorage)
//   • history     → wa-sql-history     (localStorage, last 50)
//
// Turn 1 keeps the existing UX verbatim (header buttons, save-as-insight
// modal). Turn 2 adds "Guardar como vista" (warehouse_saved_queries.create).

import React from 'react';
import { EditorSidebar } from './EditorSidebar';
import { QueryTabs } from './QueryTabs';
import { QueryWindow } from './QueryWindow';
import { OutputPane } from './OutputPane';
import { SQL_SNIPPETS } from './snippets';
import type { SqlTab, HistoryEntry, HogQLQueryResponse } from './types';

interface EditorSceneProps {
  /** PostHog has the same scene in two surfaces:
   *   • 'embedded'      → /insights/sql/new — compact, no top-level header
   *   • 'dataWarehouse' → /data-warehouse — full IDE (Turn 2)
   * Turn 1 always renders the 'embedded' chrome that the old
   * `WAAppSqlEditorView` showed (header + 3 buttons). */
  mode?: 'embedded' | 'dataWarehouse';
}

function makeInitialTab(): SqlTab {
  return {
    id: crypto.randomUUID(),
    name: 'Consulta 1',
    query:
      'SELECT event, count()\n' +
      'FROM events\n' +
      'WHERE timestamp >= now() - INTERVAL 1 DAY\n' +
      'GROUP BY event\n' +
      'ORDER BY count() DESC\n' +
      'LIMIT 20',
    result: null,
    error: null,
    ran: false,
  };
}

export function EditorScene({ mode = 'embedded' }: EditorSceneProps): React.ReactElement {
  const [tabs, setTabs] = React.useState<SqlTab[]>([makeInitialTab()]);
  const [activeId, setActiveId] = React.useState<string>(tabs[0].id);
  const [running, setRunning] = React.useState(false);
  const [history, setHistory] = React.useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = React.useState(false);
  const [showSnippets, setShowSnippets] = React.useState(false);
  const [showSchema, setShowSchema] = React.useState(true);
  const [savingAs, setSavingAs] = React.useState(false);
  const [saveName, setSaveName] = React.useState('');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const active = tabs.find(t => t.id === activeId) ?? tabs[0];

  // ── Persistence: tabs (sessionStorage), history (localStorage) ─────────────
  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem('wa-sql-tabs');
      if (raw) {
        const parsed = JSON.parse(raw) as SqlTab[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTabs(parsed);
          setActiveId(parsed[0].id);
        }
      }
      const rawH = localStorage.getItem('wa-sql-history');
      if (rawH) setHistory(JSON.parse(rawH));
    } catch { /* corrupt cache — ignore */ }
  }, []);

  React.useEffect(() => {
    try {
      // Strip transient fields (result/error/ran) before persisting.
      const safe = tabs.map(t => ({ ...t, result: null, error: null, ran: false }));
      sessionStorage.setItem('wa-sql-tabs', JSON.stringify(safe));
    } catch { /* quota — ignore */ }
  }, [tabs]);

  React.useEffect(() => {
    try { localStorage.setItem('wa-sql-history', JSON.stringify(history.slice(0, 50))); }
    catch { /* quota — ignore */ }
  }, [history]);

  function updateActive(patch: Partial<SqlTab>): void {
    setTabs(prev => prev.map(t => t.id === activeId ? { ...t, ...patch } : t));
  }

  async function runQuery(): Promise<void> {
    if (!active || !active.query.trim() || running) return;
    setRunning(true);
    updateActive({ error: null });
    const t0 = performance.now();
    try {
      const ph = await import('../../api/posthog');
      if (!ph.getTeamId()) await ph.bootstrapPostHog();
      const res = await ph.posthog.query({ query: { kind: 'HogQLQuery', query: active.query } }) as HogQLQueryResponse;
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

  async function saveAsInsight(): Promise<void> {
    if (!saveName.trim()) return;
    try {
      const ph = await import('../../api/posthog');
      if (!ph.getTeamId()) await ph.bootstrapPostHog();
      await ph.phPost(`/api/environments/${ph.getTeamId()}/insights/`, {
        name: saveName.trim(),
        saved: true,
        query: { kind: 'DataTableNode', source: { kind: 'HogQLQuery', query: active.query } },
      });
      alert('Insight guardado.');
      setSavingAs(false);
      setSaveName('');
    } catch (e: any) {
      alert(e?.message ?? 'Error');
    }
  }

  function newTab(): void {
    const id = crypto.randomUUID();
    setTabs(prev => [...prev, { id, name: `Consulta ${prev.length + 1}`, query: 'SELECT 1', result: null, error: null, ran: false }]);
    setActiveId(id);
  }

  function closeTab(id: string): void {
    if (tabs.length === 1) return;
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

  return (
    <div className="flex-1 flex flex-col bg-white min-h-0">
      {mode === 'embedded' && (
        <div className="px-6 pt-4 pb-3 flex items-start justify-between border-b border-[#e9eae6] flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <svg viewBox="0 0 16 16" className="w-4 h-4 text-[#7c3aed]">
                <ellipse cx="8" cy="3.5" rx="5" ry="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M3 3.5v9c0 1.1 2.2 2 5 2s5-.9 5-2v-9M3 7.5c0 1.1 2.2 2 5 2s5-.9 5-2" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
              <h1 className="text-lg font-bold text-[#1a1a18]">SQL editor</h1>
              <span className="text-[10px] bg-[#fef3c7] text-[#92400e] px-2 py-0.5 rounded font-semibold">HogQL</span>
            </div>
            <p className="text-xs text-[#646462]">Escribe consultas en HogQL para analizar tus datos al máximo nivel.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowSnippets(s => !s)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#e9eae6] rounded-lg text-xs text-[#1a1a18] hover:bg-[#f9f9f7]"
            >
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5">
                <path d="M3 1h7l3 3v11H3z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" />
                <path d="M10 1v3h3M6 8h4M6 11h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              Plantillas
            </button>
            <button
              onClick={() => setShowHistory(h => !h)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#e9eae6] rounded-lg text-xs text-[#1a1a18] hover:bg-[#f9f9f7]"
            >
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5">
                <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.3" />
                <path d="M8 4v4l3 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
              </svg>
              Historial
            </button>
            <button
              onClick={() => setSavingAs(true)}
              disabled={!active.ran}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#e9eae6] rounded-lg text-xs text-[#1a1a18] hover:bg-[#f9f9f7] disabled:opacity-50"
            >
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5">
                <path d="M3 1h8l2 2v11H3z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" />
                <rect x="5" y="1" width="6" height="4" fill="none" stroke="currentColor" strokeWidth="1.3" />
              </svg>
              Guardar como insight
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {showSchema && (
          <EditorSidebar onInsert={insertAtCursor} onClose={() => setShowSchema(false)} />
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <QueryTabs
            tabs={tabs}
            activeId={activeId}
            onSelect={setActiveId}
            onNew={newTab}
            onClose={closeTab}
            onRename={renameTab}
            onToggleSchema={() => setShowSchema(v => !v)}
            schemaOpen={showSchema}
          />
          <QueryWindow
            value={active.query}
            onChange={q => updateActive({ query: q })}
            onRun={runQuery}
            running={running}
            ran={active.ran}
            error={active.error}
            textareaRef={textareaRef}
          />
          <OutputPane
            result={active.result}
            error={active.error}
            running={running}
            query={active.query}
            savedQueryId={active.savedQueryId}
            history={history}
            onLoadHistory={q => updateActive({ query: q })}
            onClearHistory={() => setHistory([])}
            tabs={['results', 'info', 'history', 'json']}
          />
        </div>

        {showSnippets && (
          <div className="w-72 border-l border-[#e9eae6] bg-white flex flex-col flex-shrink-0">
            <div className="px-3 py-2 border-b border-[#e9eae6] flex items-center justify-between">
              <span className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-widest">Plantillas</span>
              <button onClick={() => setShowSnippets(false)} className="text-[#9ca3af] hover:text-[#1a1a18] text-xs">×</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {SQL_SNIPPETS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => updateActive({ query: s.query })}
                  className="w-full text-left p-3 border-b border-[#e9eae6] hover:bg-[#f9f9f7]"
                >
                  <p className="text-xs font-semibold text-[#1a1a18] mb-0.5">{s.name}</p>
                  <p className="text-[11px] text-[#646462]">{s.description}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {showHistory && (
          <div className="w-80 border-l border-[#e9eae6] bg-white flex flex-col flex-shrink-0">
            <div className="px-3 py-2 border-b border-[#e9eae6] flex items-center justify-between">
              <span className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-widest">Historial</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setHistory([])} className="text-[10px] text-[#9ca3af] hover:text-[#dc2626]">Limpiar</button>
                <button onClick={() => setShowHistory(false)} className="text-[#9ca3af] hover:text-[#1a1a18] text-xs">×</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {history.length === 0 ? (
                <p className="p-4 text-xs text-[#9ca3af] text-center">Sin consultas previas</p>
              ) : history.map(h => (
                <button
                  key={h.id}
                  onClick={() => updateActive({ query: h.query })}
                  className="w-full text-left p-3 border-b border-[#e9eae6] hover:bg-[#f9f9f7]"
                >
                  <div className="flex items-center gap-2 mb-1">
                    {h.error ? (
                      <span className="text-[10px] bg-[#fee2e2] text-[#dc2626] px-1.5 py-0.5 rounded">Error</span>
                    ) : (
                      <span className="text-[10px] bg-[#dcfce7] text-[#16a34a] px-1.5 py-0.5 rounded">OK · {h.rowCount} filas</span>
                    )}
                    <span className="text-[10px] text-[#9ca3af]">{new Date(h.ts).toLocaleTimeString('es-ES')}</span>
                    {h.duration && <span className="text-[10px] text-[#9ca3af]">{h.duration}ms</span>}
                  </div>
                  <pre className="text-[10px] font-mono text-[#1a1a18] line-clamp-3 whitespace-pre-wrap break-words">
                    {h.query.slice(0, 200)}
                  </pre>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {savingAs && (
        <div
          className="fixed inset-0 bg-[#1a1a18]/30 z-50 flex items-center justify-center"
          onClick={() => setSavingAs(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-[480px] max-w-[92vw] overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-[#e9eae6]">
              <h2 className="text-base font-bold text-[#1a1a18]">Guardar como insight</h2>
              <p className="text-xs text-[#646462] mt-0.5">Crea un insight tipo DataTable con esta consulta.</p>
            </div>
            <div className="p-5">
              <label className="block text-xs font-medium text-[#1a1a18] mb-1">Nombre</label>
              <input
                autoFocus
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                placeholder="Mi consulta personalizada"
                className="w-full px-3 py-2 border border-[#e9eae6] rounded-lg text-sm focus:outline-none focus:border-[#3b59f6]"
              />
            </div>
            <div className="px-5 py-3 bg-[#f9f9f7] border-t border-[#e9eae6] flex justify-end gap-2">
              <button
                onClick={() => setSavingAs(false)}
                className="px-3 py-1.5 text-sm text-[#1a1a18] hover:bg-white rounded"
              >
                Cancelar
              </button>
              <button
                onClick={saveAsInsight}
                disabled={!saveName.trim()}
                className="px-3 py-1.5 bg-[#1a1a18] text-white text-sm rounded disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EditorScene;
