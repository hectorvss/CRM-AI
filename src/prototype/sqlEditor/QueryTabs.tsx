// QueryTabs — tab bar above the editor. Mirrors PostHog's
// `frontend/src/scenes/data-warehouse/editor/QueryTabs.tsx`.
//
// Each tab tracks its own SQL, result, error and `ran` flag. Tabs persist in
// `sessionStorage` between reloads (key `wa-sql-tabs`). Names are editable
// inline. The last remaining tab cannot be closed.

import React from 'react';
import type { SqlTab } from './types';

interface QueryTabsProps {
  tabs: SqlTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onToggleSchema?: () => void;
  schemaOpen?: boolean;
}

export function QueryTabs({
  tabs, activeId, onSelect, onNew, onClose, onRename, onToggleSchema, schemaOpen,
}: QueryTabsProps): React.ReactElement {
  return (
    <div className="flex items-center border-b border-[#e9eae6] bg-[#fafaf9] flex-shrink-0">
      {onToggleSchema && !schemaOpen && (
        <button
          onClick={onToggleSchema}
          className="px-3 py-2 text-xs text-[#646462] hover:bg-white border-r border-[#e9eae6]"
          title="Mostrar esquema"
        >
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5">
            <rect x="2" y="3" width="12" height="2" fill="currentColor" />
            <rect x="2" y="6" width="12" height="2" fill="currentColor" opacity=".7" />
            <rect x="2" y="9" width="12" height="2" fill="currentColor" opacity=".5" />
          </svg>
        </button>
      )}
      <div className="flex-1 flex items-center overflow-x-auto">
        {tabs.map(t => {
          const active = t.id === activeId;
          return (
            <div
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={`flex items-center gap-2 px-3 py-2 text-xs cursor-pointer border-r border-[#e9eae6] group ${active ? 'bg-white text-[#1a1a18] font-medium' : 'text-[#646462] hover:bg-white'}`}
            >
              <svg viewBox="0 0 16 16" className="w-3 h-3 text-[#7c3aed] flex-shrink-0">
                <ellipse cx="8" cy="3.5" rx="5" ry="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M3 3.5v9c0 1.1 2.2 2 5 2s5-.9 5-2v-9M3 7.5c0 1.1 2.2 2 5 2s5-.9 5-2" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
              <input
                value={t.name}
                onChange={e => onRename(t.id, e.target.value)}
                onClick={e => e.stopPropagation()}
                onDoubleClick={e => (e.target as HTMLInputElement).select()}
                className="bg-transparent border-0 focus:outline-none focus:bg-white focus:border focus:border-[#3b59f6] focus:rounded px-1 w-24"
              />
              {tabs.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); onClose(t.id); }}
                  className="text-[#9ca3af] hover:text-[#dc2626] opacity-0 group-hover:opacity-100"
                  aria-label={`Cerrar ${t.name}`}
                >
                  <svg viewBox="0 0 16 16" className="w-3 h-3">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button
        onClick={onNew}
        className="px-3 py-2 text-xs text-[#646462] hover:bg-white"
        aria-label="Nueva pestaña"
      >
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5">
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

export default QueryTabs;
