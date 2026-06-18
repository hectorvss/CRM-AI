// VariablesPopover — `{{variable}}` substitution config. Mirrors PostHog's
// `frontend/src/scenes/data-warehouse/editor/sidebar/QueryVariables.tsx`.
//
// PostHog stores variables as part of the HogQLQuery node: `{ kind:
// 'HogQLQuery', query, variables: { var_name: { value, code_name } } }`.
// The popover edits a local `Record<string, string>` that's spread into the
// payload at run-time by EditorScene.

import React from 'react';

interface VariablesPopoverProps {
  open: boolean;
  anchorClassName?: string;
  variables: Record<string, string>;
  onChange: (vars: Record<string, string>) => void;
  onClose: () => void;
}

export function VariablesPopover({ open, variables, onChange, onClose }: VariablesPopoverProps): React.ReactElement | null {
  const [drafts, setDrafts] = React.useState<{ name: string; value: string }[]>([]);

  React.useEffect(() => {
    if (open) {
      setDrafts(Object.entries(variables).map(([name, value]) => ({ name, value })));
    }
  }, [open, variables]);

  if (!open) return null;

  function commit(): void {
    const next: Record<string, string> = {};
    for (const d of drafts) {
      const key = d.name.trim();
      if (key) next[key] = d.value;
    }
    onChange(next);
    onClose();
  }

  return (
    <div className="absolute left-0 top-full mt-1 w-72 bg-white border border-[#e9eae6] rounded-lg shadow-md z-30 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[12px] font-semibold text-[#1a1a18]">Variables de plantilla</p>
        <button onClick={onClose} className="text-[#9a9a98] hover:text-[#1a1a18] text-xs">×</button>
      </div>
      <p className="text-[11px] text-[#646462] mb-2">
        Usa <code className="bg-[#fafaf9] px-1 rounded font-mono text-[10px]">{'{{ nombre }}'}</code> en tu SQL.
      </p>
      <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto">
        {drafts.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              value={d.name}
              onChange={e => setDrafts(arr => arr.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
              placeholder="nombre"
              className="flex-1 px-2 py-1 text-[11px] border border-[#e9eae6] rounded font-mono focus:outline-none focus:border-[#3b59f6]"
            />
            <input
              value={d.value}
              onChange={e => setDrafts(arr => arr.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
              placeholder="valor"
              className="flex-1 px-2 py-1 text-[11px] border border-[#e9eae6] rounded font-mono focus:outline-none focus:border-[#3b59f6]"
            />
            <button
              onClick={() => setDrafts(arr => arr.filter((_, j) => j !== i))}
              className="text-[#9a9a98] hover:text-[#dc2626] text-xs px-1"
              aria-label="Eliminar"
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() => setDrafts(arr => [...arr, { name: '', value: '' }])}
          className="text-[11px] text-[#e8572a] hover:text-[#c4471f] text-left mt-1"
        >
          + Añadir variable
        </button>
      </div>
      <div className="flex justify-end gap-1 mt-3 pt-3 border-t border-[#e9eae6]">
        <button onClick={onClose} className="px-2 py-1 text-[11px] text-[#1a1a18] hover:bg-[#f3f3f1] rounded">
          Cancelar
        </button>
        <button onClick={commit} className="px-2 py-1 text-[11px] bg-[#1a1a18] text-white rounded">
          Aplicar
        </button>
      </div>
    </div>
  );
}

/**
 * Substitute `{{var}}` placeholders in a HogQL string. Quotes string values so
 * the result remains syntactically valid. Numbers/booleans pass-through.
 */
export function substituteVariables(query: string, variables: Record<string, string>): string {
  return query.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, name) => {
    const v = variables[name];
    if (v === undefined) return `{{ ${name} }}`; // leave unresolved
    if (/^-?\d+(\.\d+)?$/.test(v.trim()) || v === 'true' || v === 'false' || v === 'null') return v;
    return `'${v.replace(/'/g, "''")}'`;
  });
}

export default VariablesPopover;
