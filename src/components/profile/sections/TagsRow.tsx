import React, { useState } from 'react';

// Inline tag editor. Decoupled from any specific API — caller passes onAdd /
// onRemove async callbacks that return after the server confirms. The row
// shows optimistic state via internal busy flag and surfaces errors by
// re-throwing (caller toasts).
export default function TagsRow({
  tags,
  label = 'Etiquetas',
  onAdd,
  onRemove,
  placeholder = 'nueva-etiqueta',
}: {
  tags: string[];
  label?: string;
  onAdd: (tag: string) => Promise<void>;
  onRemove: (tag: string) => Promise<void>;
  placeholder?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    const v = draft.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      await onAdd(v);
      setDraft('');
      setAdding(false);
    } catch {
      // caller is expected to toast
    } finally {
      setBusy(false);
    }
  }

  async function remove(tag: string) {
    if (busy) return;
    setBusy(true);
    try {
      await onRemove(tag);
    } catch {
      // caller is expected to toast
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start py-1.5 w-full min-w-0">
      <span className="w-[113px] flex-shrink-0 text-[13px] text-[#646462] truncate pt-0.5">{label}</span>
      <div className="flex-1 min-w-0 flex flex-wrap gap-1">
        {tags.length === 0 && !adding && (
          <span className="text-[12.5px] text-[#646462] italic">Sin etiquetas</span>
        )}
        {tags.map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[#f8f8f7] border border-[#e9eae6] text-[11.5px] text-[#1a1a1a] max-w-full">
            <span className="truncate max-w-[140px]">{tag}</span>
            <button
              onClick={() => remove(tag)}
              disabled={busy}
              title="Quitar etiqueta"
              className="text-[#646462] hover:text-[#b91c1c] disabled:opacity-50"
              type="button"
            >×</button>
          </span>
        ))}
        {adding ? (
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); add(); }
              if (e.key === 'Escape') { setAdding(false); setDraft(''); }
            }}
            onBlur={() => { if (!draft.trim()) setAdding(false); }}
            placeholder={placeholder}
            className="h-6 px-2 rounded-full border border-[#1a1a1a] text-[11.5px] focus:outline-none w-[120px]"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={busy}
            className="h-6 px-2 rounded-full border border-dashed border-[#c6c9c0] text-[11.5px] text-[#646462] hover:bg-[#f8f8f7] hover:text-[#1a1a1a] disabled:opacity-50"
          >+ Añadir</button>
        )}
      </div>
    </div>
  );
}
