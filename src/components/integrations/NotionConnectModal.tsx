import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';
import { ErrorBox } from './MessengerConnectModal';
import { IntegrationLogo } from './logos';

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  existing?: {
    workspace_id?: string | null;
    workspace_name?: string | null;
    workspace_icon?: string | null;
    owner_email?: string | null;
    owner_name?: string | null;
    owner_type?: 'user' | 'workspace' | null;
    capabilities?: { reads?: string[]; writes?: string[]; knowledge?: string[] } | null;
  } | null;
}

const SCOPES = [
  { id: 'search',    label: 'Search workspace · pages + databases', icon: 'search' },
  { id: 'pages',     label: 'Pages · CRUD + properties',            icon: 'description' },
  { id: 'db',        label: 'Databases · query + filters',          icon: 'database' },
  { id: 'blocks',    label: 'Blocks · append · update · delete',    icon: 'view_module' },
  { id: 'comments',  label: 'Comments · ask follow-ups',            icon: 'chat' },
  { id: 'users',     label: 'Users · ownership attribution',        icon: 'group' },
  { id: 'index',     label: 'Knowledge index para AI agent',        icon: 'auto_stories' },
  { id: 'plain',     label: 'Plain-text export por página',         icon: 'article' },
];

const NotionConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const [syncResult, setSyncResult] = useState<any>(null);

  useEffect(() => {
    if (open) { setSubmitting(false); setError(null); setSyncStatus('idle'); setSyncResult(null); }
  }, [open]);

  if (!open) return null;
  const isConnected = Boolean(existing?.workspace_id);

  async function authedFetch(path: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
    return fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token ?? ''}`,
        Accept: 'application/json',
        ...(init?.body && init.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  }

  async function handleInstall() {
    setError(null); setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/notion/install');
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Error ${res.status}`);
      }
      const j = await res.json();
      if (j.url) window.location.href = j.url;
    } catch (err: any) {
      setError(err?.message || 'No se pudo iniciar el install');
      setSubmitting(false);
    }
  }

  async function handleSync() {
    setSyncStatus('syncing'); setSyncResult(null);
    try {
      const res = await authedFetch('/api/integrations/notion/sync', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.details || j.error || `${res.status}`);
      setSyncResult(j); setSyncStatus('ok');
    } catch {
      setSyncStatus('error');
    }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar Notion? Para revocar completamente el acceso, también quítanos de los pages compartidos desde Settings → Connections en tu workspace.')) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/notion/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error();
      onChanged?.(); onClose();
    } finally { setSubmitting(false); }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#171717]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#000000] text-white shadow-sm">
              <IntegrationLogo id="notion" size={22} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Knowledge</p>
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Notion</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Source of truth para el AI Agent · pages, databases, blocks</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 dark:hover:bg-white/5 dark:hover:text-white">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          {isConnected ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-900/20">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <p className="flex-1 text-sm text-emerald-800 dark:text-emerald-200">
                  Conectado a workspace <strong>{existing?.workspace_name || existing?.workspace_id}</strong>
                  {existing?.owner_email ? <> · {existing.owner_email}</> : null}
                </p>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-900 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-200">
                <p className="font-semibold">Recuerda compartir páginas con la integración</p>
                <p className="mt-1 leading-relaxed">
                  En Notion, abre las pages/databases que quieras que el AI agent lea, click en <strong>···</strong> arriba a la derecha → <strong>Add connections</strong> → selecciona <em>Clain</em>. El bot solo ve lo que le compartas.
                </p>
              </div>

              <div className="mt-3 rounded-2xl border border-black/5 bg-gray-50/50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Probar conexión</p>
                  <button type="button" onClick={() => void handleSync()} disabled={syncStatus === 'syncing'} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#171717] dark:text-gray-200 dark:hover:bg-white/5">
                    {syncStatus === 'syncing' ? 'Sincronizando…' : syncStatus === 'ok' ? '✓ OK' : syncStatus === 'error' ? '⚠ Error' : 'Listar páginas recientes'}
                  </button>
                </div>
                {syncResult ? (
                  <div className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                    {syncResult.results_visible} resultados visibles.
                    {syncResult.sample?.length ? (
                      <ul className="mt-1 space-y-0.5">
                        {syncResult.sample.map((p: any) => (
                          <li key={p.id} className="truncate">
                            <span className="font-medium">{p.object}</span> · {p.title || p.id} · {new Date(p.last_edited_time).toLocaleDateString()}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="mt-3 rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Capacidades activas</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(existing?.capabilities?.reads ?? []).map((c) => (
                    <span key={`r-${c}`} className="rounded-full border border-black/5 bg-gray-50 px-2 py-0.5 text-[10px] text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">{c}</span>
                  ))}
                  {(existing?.capabilities?.writes ?? []).map((c) => (
                    <span key={`w-${c}`} className="rounded-full border border-gray-300/60 bg-gray-100 px-2 py-0.5 text-[10px] text-gray-800 dark:border-white/20 dark:bg-white/10 dark:text-gray-100">{c}</span>
                  ))}
                  {(existing?.capabilities?.knowledge ?? []).map((c) => (
                    <span key={`k-${c}`} className="rounded-full border border-amber-300/60 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-200">{c}</span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Conecta tu Notion para que el AI agent pueda leer tu help center, docs internas y bases de conocimiento. La integración solo accede a lo que tú le compartas explícitamente.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SCOPES.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-xl border border-black/5 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                    <span className="material-symbols-outlined text-[14px] text-gray-900 dark:text-gray-100">{s.icon}</span>
                    {s.label}
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                <p className="font-semibold uppercase tracking-[0.18em]">Antes de instalar</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-relaxed">
                  <li>Necesitas ser admin del workspace o que el admin apruebe la app</li>
                  <li>Tras autorizar, comparte cada página/database con la integración Clain (Add connections en el menú ···)</li>
                  <li>El bot reindex automáticamente cada hora; manual desde Knowledge → Reindex</li>
                </ol>
              </div>

              {error ? <ErrorBox text={error} /> : null}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-black/5 bg-gray-50/50 px-6 py-4 dark:border-white/10 dark:bg-white/[0.02]">
          {isConnected ? (
            <>
              <button type="button" onClick={() => void handleDisconnect()} disabled={submitting} className="rounded-full px-4 py-2 text-[13px] font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20">Desconectar</button>
              <button type="button" onClick={onClose} className="rounded-full bg-black px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90">Hecho</button>
            </>
          ) : (
            <>
              <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-[13px] font-medium text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white">Cancelar</button>
              <button type="button" onClick={() => void handleInstall()} disabled={submitting} className="flex items-center gap-2 rounded-full bg-black px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-gray-900 disabled:opacity-50">
                {submitting ? <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>Redirigiendo…</> : 'Conectar con Notion'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotionConnectModal;
