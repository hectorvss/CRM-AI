/**
 * SymbolUploadModal — sourcemap / dSYM / ProGuard upload for Error Tracking.
 *
 * POST /api/projects/{pid}/error_tracking/symbol_sets/  (multipart)
 * GET  /api/projects/{pid}/error_tracking/symbol_sets/
 * DELETE …/{id}/
 */
import React from 'react';

interface SymbolSet { id: string; ref: string; storage_ptr: string; created_at: string; failure_reason?: string | null; release_id?: string }

export function SymbolUploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sets,    setSets]    = React.useState<SymbolSet[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [progress,  setProgress]  = React.useState(0);
  const [release,   setRelease]   = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const ph = await import('../../api/posthog');
      if (!ph.getProjectId()) await ph.bootstrapPostHog();
      const res: any = await ph.posthog.errorTrackingSymbols.list();
      setSets(res?.results ?? []);
    } catch { setSets([]); }
    finally { setLoading(false); }
  }
  React.useEffect(() => { if (open) load(); }, [open]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true); setProgress(0);
    try {
      const ph = await import('../../api/posthog');
      for (let i = 0; i < files.length; i++) {
        await ph.posthog.errorTrackingSymbols.upload(files[i], release || undefined);
        setProgress(Math.round(((i + 1) / files.length) * 100));
      }
      await load();
    } catch (e: any) { alert(e?.message ?? 'Error al subir'); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ''; }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar este symbol set?')) return;
    try {
      const ph = await import('../../api/posthog');
      await ph.posthog.errorTrackingSymbols.delete(id);
      await load();
    } catch (e: any) { alert(e?.message ?? 'No se pudo eliminar'); }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-[#1a1a18]/30 z-[70] flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[600px] max-w-[92vw] max-h-[88vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#e9eae6] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#1a1a18]">Símbolos para errores</h2>
            <p className="text-xs text-[#646462] mt-0.5">Sube sourcemaps, dSYMs o mapeos ProGuard para deobfuscar stack traces.</p>
          </div>
          <button onClick={onClose} className="text-[#9ca3af] hover:text-[#1a1a18]">
            <svg viewBox="0 0 16 16" className="w-4 h-4"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="bg-[#fafaf9] border border-[#e9eae6] rounded-xl p-4">
            <label className="block mb-2">
              <span className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1">Release (opcional)</span>
              <input value={release} onChange={e => setRelease(e.target.value)} placeholder="v1.2.3 o commit SHA" className="w-full px-3 py-2 border border-[#e9eae6] rounded text-sm bg-white focus:outline-none focus:border-[#3b59f6]" />
            </label>
            <input ref={inputRef} type="file" multiple accept=".map,.js.map,.dSYM,.zip,.txt" onChange={onPick} className="block w-full text-xs file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-[#1a1a18] file:text-white file:cursor-pointer hover:file:bg-[#333]" />
            {uploading && (
              <div className="mt-3">
                <div className="h-1.5 bg-[#e9eae6] rounded overflow-hidden">
                  <div className="h-full bg-[#3b59f6] transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="text-[10px] text-[#646462] mt-1">Subiendo… {progress}%</p>
              </div>
            )}
          </div>

          {loading ? <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-10 bg-[#fafaf9] rounded animate-pulse" />)}</div>
           : sets.length === 0 ? (
            <div className="text-center py-6 text-[#9ca3af]">
              <p className="text-sm font-medium text-[#1a1a18]">Sin símbolos subidos todavía</p>
              <p className="text-xs">Los stack traces minificados llegarán sin resolver.</p>
            </div>
          ) : sets.map(s => (
            <div key={s.id} className="flex items-center gap-3 p-3 border border-[#e9eae6] rounded-lg">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.failure_reason ? 'bg-[#dc2626]' : 'bg-[#16a34a]'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#1a1a18] truncate font-mono">{s.ref}</p>
                <p className="text-[10px] text-[#9ca3af] truncate">{new Date(s.created_at).toLocaleString('es-ES')} {s.release_id && `· release ${s.release_id}`} {s.failure_reason && `· ${s.failure_reason}`}</p>
              </div>
              <button onClick={() => remove(s.id)} className="text-[#9ca3af] hover:text-[#dc2626] p-1"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M4 5h8l-1 9H5zM6 5V3h4v2M2 5h12" fill="none" stroke="currentColor" strokeWidth="1.3"/></svg></button>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-[#e9eae6] flex justify-end bg-[#fafaf9]">
          <button onClick={onClose} className="px-3 py-1.5 bg-[#1a1a18] text-white text-sm rounded-lg hover:bg-[#333]">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

export default SymbolUploadModal;
