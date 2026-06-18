/**
 * Share modal — parity with PostHog's <SharingModal/>.
 *
 * One component, four resources (dashboards / insights / notebooks / surveys /
 * recordings). All hit `/api/projects/{pid}/{resource}/{id}/sharing/`.
 *
 * Surfaces: enable/disable, password protection, embed snippet, link copy.
 */
import React from 'react';

type Resource = 'dashboards' | 'insights' | 'notebooks' | 'surveys' | 'recordings';

interface SharingState {
  enabled:           boolean;
  password_required: boolean;
  password:          string;
  access_token:      string;
  settings:          any;
}

const DEFAULT_STATE: SharingState = { enabled: false, password_required: false, password: '', access_token: '', settings: {} };

const TITLES: Record<Resource, string> = {
  dashboards: 'Compartir dashboard',
  insights:   'Compartir insight',
  notebooks:  'Compartir notebook',
  surveys:    'Compartir encuesta',
  recordings: 'Compartir grabación',
};

export function ShareModal({
  open, onClose, resource, id, name,
}: {
  open:     boolean;
  onClose:  () => void;
  resource: Resource;
  id:       string | number;
  name?:    string;
}) {
  const [state,    setState]    = React.useState<SharingState>(DEFAULT_STATE);
  const [loading,  setLoading]  = React.useState(true);
  const [saving,   setSaving]   = React.useState(false);
  const [error,    setError]    = React.useState<string | null>(null);
  const [copied,   setCopied]   = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const ph = await import('../../api/posthog');
        if (!ph.getProjectId()) await ph.bootstrapPostHog();
        const res: any = await ph.posthog.sharing.get(resource, id);
        if (!cancelled) setState({ ...DEFAULT_STATE, ...res });
      } catch (e: any) { if (!cancelled) setError(e?.message ?? 'Error al cargar'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [open, resource, id]);

  async function patch(payload: Partial<SharingState>) {
    setSaving(true);
    try {
      const ph = await import('../../api/posthog');
      const updated: any = await ph.posthog.sharing.update(resource, id, payload);
      setState(prev => ({ ...prev, ...updated }));
    } catch (e: any) { alert(e?.message ?? 'No se pudo guardar'); }
    finally { setSaving(false); }
  }

  function copy(value: string, key: string) {
    try { navigator.clipboard.writeText(value); setCopied(key); setTimeout(() => setCopied(null), 1500); } catch {}
  }

  if (!open) return null;

  const publicUrl = state.access_token ? `${window.location.origin}/shared/${state.access_token}` : '';
  const embedSnippet = state.access_token
    ? `<iframe width="100%" height="500" frameborder="0" src="${publicUrl}?embedded"></iframe>`
    : '';

  return (
    <div className="fixed inset-0 bg-[#1a1a18]/30 z-[70] flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[560px] max-w-[92vw] max-h-[88vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#e9eae6] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#1a1a18]">{TITLES[resource]}</h2>
            {name && <p className="text-xs text-[#646462] mt-0.5 truncate max-w-[400px]">{name}</p>}
          </div>
          <button onClick={onClose} className="text-[#9ca3af] hover:text-[#1a1a18]">
            <svg viewBox="0 0 16 16" className="w-4 h-4"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        {loading ? (
          <div className="p-8"><div className="h-32 bg-[#fafaf9] rounded-lg animate-pulse" /></div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-sm text-[#dc2626] mb-1">Error al cargar la configuración</p>
            <p className="text-xs text-[#646462]">{error}</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <label className="flex items-start gap-3 p-3 border border-[#e9eae6] rounded-lg cursor-pointer hover:bg-[#fafaf9]">
              <input type="checkbox" checked={state.enabled} onChange={e => patch({ enabled: e.target.checked })} className="mt-0.5 accent-[#3b59f6]" />
              <div className="flex-1">
                <p className="text-sm font-medium text-[#1a1a18]">Enlace público</p>
                <p className="text-xs text-[#646462] mt-0.5">Cualquiera con el enlace puede ver el recurso. El acceso es de solo lectura.</p>
              </div>
            </label>

            {state.enabled && (
              <>
                <div>
                  <label className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1.5">Enlace público</label>
                  <div className="flex items-center gap-2">
                    <input readOnly value={publicUrl} className="flex-1 px-3 py-2 bg-[#fafaf9] border border-[#e9eae6] rounded text-xs text-[#1a1a18] font-mono focus:outline-none" />
                    <button onClick={() => copy(publicUrl, 'url')} className="px-3 py-2 bg-[#1a1a18] text-white rounded text-xs hover:bg-[#333]">
                      {copied === 'url' ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1.5">Embed (iframe)</label>
                  <textarea readOnly value={embedSnippet} rows={3} className="w-full px-3 py-2 bg-[#fafaf9] border border-[#e9eae6] rounded text-xs text-[#1a1a18] font-mono focus:outline-none resize-none" />
                  <button onClick={() => copy(embedSnippet, 'embed')} className="mt-1.5 text-xs text-[#3b59f6] hover:underline">
                    {copied === 'embed' ? 'Copiado al portapapeles' : 'Copiar snippet'}
                  </button>
                </div>

                <label className="flex items-start gap-3 p-3 border border-[#e9eae6] rounded-lg cursor-pointer hover:bg-[#fafaf9]">
                  <input type="checkbox" checked={state.password_required} onChange={e => patch({ password_required: e.target.checked })} className="mt-0.5 accent-[#3b59f6]" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[#1a1a18]">Proteger con contraseña</p>
                    <p className="text-xs text-[#646462] mt-0.5">Quien acceda al enlace deberá introducir esta contraseña.</p>
                  </div>
                </label>

                {state.password_required && (
                  <div>
                    <label className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1.5">Contraseña</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={state.password}
                        onChange={e => setState(s => ({ ...s, password: e.target.value }))}
                        onBlur={() => patch({ password: state.password })}
                        placeholder="Una contraseña segura"
                        className="flex-1 px-3 py-2 border border-[#e9eae6] rounded text-sm focus:outline-none focus:border-[#3b59f6]"
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="px-5 py-3 border-t border-[#e9eae6] flex items-center justify-between bg-[#fafaf9]">
          <span className="text-[11px] text-[#9ca3af]">{saving ? 'Guardando…' : state.enabled ? 'Acceso público activo' : 'Acceso privado'}</span>
          <button onClick={onClose} className="px-3 py-1.5 bg-[#1a1a18] text-white text-sm rounded-lg hover:bg-[#333]">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

export default ShareModal;
