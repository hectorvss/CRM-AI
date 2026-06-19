import React, { useState } from 'react';

// Yellow note card with edit/delete on hover. Decoupled from cases API —
// caller provides onUpdate / onDelete that resolve when the server confirms.
// Used for the Profile activity / personal-notes panel.
export default function NoteCard({
  content,
  author,
  timestamp,
  edited,
  canEdit = true,
  onUpdate,
  onDelete,
}: {
  content: string;
  author?: string;
  timestamp?: string;
  edited?: boolean;
  canEdit?: boolean;
  onUpdate?: (next: string) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [busy, setBusy] = useState(false);

  async function save() {
    const v = draft.trim();
    if (!v || busy || !onUpdate) return;
    setBusy(true);
    try {
      await onUpdate(v);
      setEditing(false);
    } catch {
      // caller toasts
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy || !onDelete) return;
    if (typeof window !== 'undefined' && !window.confirm('¿Borrar esta nota?')) return;
    setBusy(true);
    try {
      await onDelete();
    } catch {
      // caller toasts
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded-xl bg-[#fffbeb] border border-[#f59e0b] px-3 py-2 flex flex-col gap-2">
        <textarea
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          className="w-full min-h-[60px] rounded-lg bg-white border border-[#fde68a] px-2 py-1.5 text-[13px] resize-none focus:outline-none focus:border-[#f59e0b]"
        />
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={() => { setEditing(false); setDraft(content); }} disabled={busy} className="text-[12px] font-semibold text-[#646462] hover:text-[#1a1a1a]">Cancelar</button>
          <button type="button" onClick={save} disabled={!draft.trim() || busy} className="h-7 px-3 rounded-full bg-[#1a1a1a] text-white text-[12px] font-semibold disabled:bg-[#e9eae6] disabled:text-[#646462]">{busy ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#fffbeb] border border-[#fde68a] px-3 py-2 group">
      <p className="text-[13px] text-[#1a1a1a] leading-5 whitespace-pre-wrap">{content || 'Nota sin contenido'}</p>
      <div className="flex items-center justify-between mt-1 gap-2">
        <p className="text-[11px] text-[#646462] truncate">
          {author || 'sistema'}{timestamp ? ` · ${timestamp}` : ''}{edited ? ' · editada' : ''}
        </p>
        {canEdit && (onUpdate || onDelete) && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onUpdate && <button type="button" onClick={() => setEditing(true)} title="Editar" className="text-[11px] font-semibold text-[#646462] hover:text-[#1a1a1a]">Editar</button>}
            {onUpdate && onDelete && <span className="text-[#c6c9c0]">·</span>}
            {onDelete && <button type="button" onClick={remove} disabled={busy} title="Borrar" className="text-[11px] font-semibold text-[#646462] hover:text-[#b91c1c]">Borrar</button>}
          </div>
        )}
      </div>
    </div>
  );
}
