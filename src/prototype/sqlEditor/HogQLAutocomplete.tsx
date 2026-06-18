// HogQLAutocomplete — popover-style autocomplete fed by the PostHog
// `POST /query/` endpoint with `kind: 'HogQLAutocomplete'`. Mirrors PostHog's
// Monaco HogQL language provider.
//
// Standalone hook used by QueryWindow. Keeps things light: no Monaco — the
// caller renders the popover next to the textarea's caret. Caller passes the
// current text + cursor position; the hook returns a debounced list of
// `Suggestion`s and a helper to insert one.

import React from 'react';

export interface Suggestion {
  label: string;
  /** The actual text we will insert (may differ from `label`). */
  insertText: string;
  /** Tag shown next to the label. */
  kind?: 'Keyword' | 'Function' | 'Table' | 'Column' | 'Snippet';
  /** Tooltip / docs (rendered as the bottom strip of the popover). */
  detail?: string;
}

interface AutocompleteResponse {
  suggestions?: {
    label: string;
    insertText?: string;
    kind?: string;
    detail?: string;
    documentation?: string;
  }[];
  /** Some PostHog versions wrap completions under `.completions`. */
  completions?: AutocompleteResponse['suggestions'];
}

/**
 * Returns a list of suggestions for the symbol under the cursor. Empty array
 * while debouncing or when the upstream endpoint is unavailable.
 */
export function useHogQLAutocomplete(query: string, cursor: number): { suggestions: Suggestion[]; loading: boolean } {
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!query.trim() || cursor < 0) { setSuggestions([]); return; }
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        setLoading(true);
        const ph = await import('../../api/posthog');
        if (!ph.getTeamId()) await ph.bootstrapPostHog();
        const res = await ph.posthog.autocomplete({
          query,
          startPosition: cursor,
          endPosition: cursor,
        }) as AutocompleteResponse;
        const raw = res?.suggestions ?? res?.completions ?? [];
        if (!cancelled) {
          setSuggestions(raw.slice(0, 12).map(s => ({
            label: s.label,
            insertText: s.insertText ?? s.label,
            kind: normaliseKind(s.kind),
            detail: s.detail ?? (s as any).documentation,
          })));
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setSuggestions([]); setLoading(false); }
      }
    }, 150);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [query, cursor]);

  return { suggestions, loading };
}

function normaliseKind(k?: string): Suggestion['kind'] {
  if (!k) return undefined;
  const lower = k.toLowerCase();
  if (lower.includes('keyword')) return 'Keyword';
  if (lower.includes('function') || lower.includes('method')) return 'Function';
  if (lower.includes('table') || lower.includes('module')) return 'Table';
  if (lower.includes('column') || lower.includes('field') || lower.includes('property')) return 'Column';
  if (lower.includes('snippet')) return 'Snippet';
  return undefined;
}

const KIND_COLOR: Record<NonNullable<Suggestion['kind']>, string> = {
  Keyword:  '#7c3aed',
  Function: '#0891b2',
  Table:    '#0d9488',
  Column:   '#3b59f6',
  Snippet:  '#e8572a',
};

interface AutocompletePopoverProps {
  suggestions: Suggestion[];
  highlightedIndex: number;
  onPick: (s: Suggestion) => void;
  /** Pixel coords (relative to the editor container). */
  x: number;
  y: number;
}

export function AutocompletePopover({ suggestions, highlightedIndex, onPick, x, y }: AutocompletePopoverProps): React.ReactElement | null {
  if (suggestions.length === 0) return null;
  const active = suggestions[highlightedIndex];
  return (
    <div
      className="absolute z-40 bg-white border border-[#e9eae6] rounded-lg shadow-md w-72 max-h-64 overflow-y-auto"
      style={{ left: x, top: y }}
    >
      {suggestions.map((s, i) => (
        <button
          key={`${s.label}-${i}`}
          onMouseDown={e => { e.preventDefault(); onPick(s); }}
          className={`w-full flex items-center gap-2 px-2 py-1 text-left text-[12px] ${i === highlightedIndex ? 'bg-[#fff5f2]' : 'hover:bg-[#fafaf9]'}`}
        >
          {s.kind && (
            <span
              className="w-4 h-4 flex items-center justify-center rounded text-[8px] font-mono text-white flex-shrink-0"
              style={{ backgroundColor: KIND_COLOR[s.kind] }}
            >
              {s.kind[0]}
            </span>
          )}
          <span className="text-[#1a1a18] font-mono truncate flex-1">{s.label}</span>
          {s.kind && <span className="text-[9px] text-[#9a9a98] font-mono">{s.kind}</span>}
        </button>
      ))}
      {active?.detail && (
        <div className="border-t border-[#e9eae6] px-2 py-1.5 text-[10px] text-[#646462] bg-[#fafaf9] font-mono">
          {active.detail}
        </div>
      )}
    </div>
  );
}

export default AutocompletePopover;
