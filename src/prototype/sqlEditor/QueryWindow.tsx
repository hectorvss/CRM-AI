// QueryWindow — the editor area. Mirrors PostHog's
// `frontend/src/scenes/data-warehouse/editor/QueryWindow.tsx`.
//
// PostHog uses a Monaco-backed `<CodeEditor language="hogql" />`. Until we
// pull `@monaco-editor/react` into the bundle, we render a transparent
// `<textarea>` layered on top of a coloured `<HogQLHighlight>` render of the
// same text. `⌘ Enter` / `Ctrl Enter` triggers `onRun`. `Tab` indents.

import React from 'react';
import { HogQLHighlight } from './HogQLHighlight';

interface QueryWindowProps {
  value: string;
  onChange: (next: string) => void;
  onRun: () => void;
  running?: boolean;
  ran?: boolean;
  error?: string | null;
  /** Optional textarea ref so parent can focus / read selection. */
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  placeholder?: string;
}

export function QueryWindow({
  value, onChange, onRun, running, ran, error, textareaRef, placeholder,
}: QueryWindowProps): React.ReactElement {
  const innerRef = React.useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? innerRef;

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onRun();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const s = ta.selectionStart, en = ta.selectionEnd;
      const next = value.slice(0, s) + '  ' + value.slice(en);
      onChange(next);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(s + 2, s + 2);
      });
    }
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div className="relative flex-1 min-h-[180px]">
        <div
          aria-hidden="true"
          className="absolute inset-0 px-4 py-3 font-mono text-[13px] leading-[1.6] pointer-events-none overflow-auto whitespace-pre"
        >
          <HogQLHighlight text={value} />
        </div>
        <textarea
          ref={ref}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          placeholder={placeholder ?? '-- Escribe HogQL aquí…'}
          className="absolute inset-0 w-full h-full px-4 py-3 font-mono text-[13px] leading-[1.6] bg-transparent caret-[#1a1a18] text-transparent resize-none focus:outline-none whitespace-pre"
        />
      </div>

      <div className="flex items-center gap-2 px-4 py-2 border-t border-[#e9eae6] bg-[#fafaf9] flex-shrink-0">
        <button
          onClick={onRun}
          disabled={running || !value.trim()}
          className="flex items-center gap-2 px-4 py-1.5 bg-[#16a34a] text-white text-sm rounded-lg hover:bg-[#15803d] disabled:opacity-50 shadow-sm"
        >
          {running ? (
            <>
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Ejecutando…
            </>
          ) : (
            <>
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-white"><path d="M4 3l9 5-9 5z" /></svg>
              Ejecutar
            </>
          )}
        </button>
        <kbd className="px-1.5 py-0.5 bg-white border border-[#e9eae6] rounded text-[10px] font-mono text-[#646462]">⌘ Enter</kbd>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-[#9ca3af]">
          {error ? (
            <span className="text-[#dc2626] font-mono">⚠ Error</span>
          ) : ran ? (
            <span className="text-[#16a34a]">✓ Última ejecución correcta</span>
          ) : null}
          <span>·</span>
          <span>{value.split('\n').length} líneas</span>
        </div>
      </div>
    </div>
  );
}

export default QueryWindow;
