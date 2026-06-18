// EditorSidebar — left rail of the SQL editor. Mirrors PostHog's
// `frontend/src/scenes/data-warehouse/editor/EditorSidebar.tsx`.
//
// Two render modes:
//   • mode='embedded'      → schema browser only (compact, /insights/sql/new)
//   • mode='dataWarehouse' → schema browser + saved views + external sources
//                             + "+ Add source" CTA  (full IDE)
//
// All three lists are top-level collapsible groups, just like PostHog's panel.

import React from 'react';
import { DatabaseTablesContainer } from './DatabaseTablesContainer';
import { SavedQueriesList, type SavedQuery } from './SavedQueriesList';
import { ExternalSourcesList } from './ExternalSourcesList';

interface EditorSidebarProps {
  mode?: 'embedded' | 'dataWarehouse';
  onInsert: (text: string) => void;
  onClose?: () => void;
  /** Open a saved query in a new editor tab. Required for dataWarehouse mode. */
  onOpenSavedQuery?: (q: SavedQuery) => void;
  /** Bumped from outside to force a refresh of saved queries / sources after CRUD. */
  reloadKey?: number;
  onAddSource?: () => void;
}

export function EditorSidebar({
  mode = 'embedded', onInsert, onClose, onOpenSavedQuery, reloadKey, onAddSource,
}: EditorSidebarProps): React.ReactElement {
  const [openSection, setOpenSection] = React.useState<{ schema: boolean; views: boolean; sources: boolean }>({
    schema: true, views: mode === 'dataWarehouse', sources: false,
  });

  return (
    <div className={`${mode === 'dataWarehouse' ? 'w-[265px]' : 'w-60'} border-r border-[#e9eae6] bg-[#fafaf9] flex flex-col flex-shrink-0 min-h-0`}>
      <div className="px-3 py-2 border-b border-[#e9eae6] flex items-center justify-between flex-shrink-0">
        <span className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-widest">Esquema</span>
        {onClose && (
          <button onClick={onClose} className="text-[#9ca3af] hover:text-[#1a1a18] text-xs" aria-label="Cerrar esquema">
            ×
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        <SidebarSection
          title="Tablas"
          open={openSection.schema}
          onToggle={() => setOpenSection(s => ({ ...s, schema: !s.schema }))}
        >
          <DatabaseTablesContainer onInsert={onInsert} />
        </SidebarSection>

        {mode === 'dataWarehouse' && (
          <>
            <SidebarSection
              title="Vistas guardadas"
              open={openSection.views}
              onToggle={() => setOpenSection(s => ({ ...s, views: !s.views }))}
            >
              <SavedQueriesList
                onOpen={onOpenSavedQuery ?? (() => undefined)}
                reloadKey={reloadKey}
              />
            </SidebarSection>

            <SidebarSection
              title="Fuentes externas"
              open={openSection.sources}
              onToggle={() => setOpenSection(s => ({ ...s, sources: !s.sources }))}
            >
              <ExternalSourcesList
                onInsert={onInsert}
                onAddSource={onAddSource}
                reloadKey={reloadKey}
              />
            </SidebarSection>
          </>
        )}
      </div>
    </div>
  );
}

function SidebarSection({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex flex-col border-b border-[#e9eae6] last:border-b-0">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 h-7 px-2 hover:bg-[#f3f3f1] flex-shrink-0"
      >
        <svg viewBox="0 0 16 16" className={`w-2.5 h-2.5 fill-[#9a9a98] transition-transform ${open ? 'rotate-90' : ''}`}>
          <path d="M6 4l4 4-4 4z" />
        </svg>
        <span className="text-[11px] font-semibold text-[#646462] uppercase tracking-wide">{title}</span>
      </button>
      {open && <div className="px-2 pb-2 flex flex-col gap-1 min-h-0 flex-shrink-0">{children}</div>}
    </div>
  );
}

export default EditorSidebar;
