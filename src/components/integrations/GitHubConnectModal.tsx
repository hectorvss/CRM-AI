import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';
import { ErrorBox } from './MessengerConnectModal';
import { IntegrationLogo } from './logos';

interface WebhookEntry { hook_id: number; scope: 'repo' | 'org'; owner: string; repo?: string; events: string[]; url: string }
interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  existing?: {
    user_id?: number | null;
    login?: string | null;
    name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
    scope?: string | null;
    webhooks?: WebhookEntry[] | null;
    webhook_url?: string | null;
    capabilities?: { reads?: string[]; writes?: string[]; events?: string[] } | null;
  } | null;
}

const SCOPES = [
  { id: 'repos',    label: 'Repos · privados + públicos',         icon: 'folder' },
  { id: 'issues',   label: 'Issues · CRUD · search',              icon: 'bug_report' },
  { id: 'pulls',    label: 'Pull requests · reviews · comments',   icon: 'merge' },
  { id: 'orgs',     label: 'Orgs · membership · webhooks org-wide', icon: 'groups' },
  { id: 'webhooks', label: 'Webhooks firmados HMAC SHA256 hex',    icon: 'graph_2' },
  { id: 'search',   label: 'Search API · is:issue / is:pr',       icon: 'search' },
];

const GitHubConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const [syncResult, setSyncResult] = useState<any>(null);
  const [repos, setRepos] = useState<any[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>('');

  useEffect(() => {
    if (open) {
      setSubmitting(false); setError(null); setSyncStatus('idle'); setSyncResult(null);
      setRepos([]); setSelectedRepo('');
      if (existing?.user_id) void loadRepos();
    }
  }, [open]);

  if (!open) return null;
  const isConnected = Boolean(existing?.user_id);

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

  async function loadRepos() {
    try {
      const res = await authedFetch('/api/integrations/github/repos');
      if (!res.ok) return;
      const j = await res.json();
      setRepos(j.repos ?? []);
    } catch { /* ignore */ }
  }

  async function handleInstall() {
    setError(null); setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/github/install');
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `Error ${res.status}`); }
      const j = await res.json();
      if (j.url) window.location.href = j.url;
    } catch (err: any) { setError(err?.message || 'No se pudo iniciar el install'); setSubmitting(false); }
  }

  async function handleSync() {
    setSyncStatus('syncing'); setSyncResult(null);
    try {
      const res = await authedFetch('/api/integrations/github/sync', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.details || j.error || `${res.status}`);
      setSyncResult(j); setSyncStatus('ok');
    } catch { setSyncStatus('error'); }
  }

  async function handleRegisterWebhook() {
    if (!selectedRepo) return;
    const [owner, repo] = selectedRepo.split('/');
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/github/register-webhook', {
        method: 'POST', body: JSON.stringify({ owner, repo }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || ''); }
      setSelectedRepo('');
      onChanged?.();
    } catch (err: any) {
      setError(err?.message || 'Error registrando webhook');
    } finally { setSubmitting(false); }
  }

  async function handleUnregisterWebhook(hookId: number) {
    if (!confirm('¿Borrar este webhook?')) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/github/unregister-webhook', {
        method: 'POST', body: JSON.stringify({ hook_id: hookId }),
      });
      if (!res.ok) throw new Error();
      onChanged?.();
    } finally { setSubmitting(false); }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar GitHub? Borraremos todos los webhooks registrados y revocaremos el OAuth grant.')) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/github/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error();
      onChanged?.(); onClose();
    } finally { setSubmitting(false); }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#171717]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-900 text-white shadow-sm">
              <IntegrationLogo id="github" size={22} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Engineering</p>
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">GitHub</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Issues · PRs · webhooks firmados · escalation desde inbox</p>
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
                  Conectado · <strong>@{existing?.login}</strong>
                  {existing?.email ? <> · {existing.email}</> : null}
                </p>
              </div>

              <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Webhooks registrados</p>
                {existing?.webhooks?.length ? (
                  <ul className="mt-2 space-y-1.5">
                    {existing.webhooks.map(w => (
                      <li key={w.hook_id} className="flex items-center gap-2 rounded-xl bg-gray-50 px-2.5 py-2 text-[11px] dark:bg-white/5">
                        <span className="rounded-full bg-emerald-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100">{w.scope}</span>
                        <code className="flex-1 truncate text-gray-700 dark:text-gray-200">{w.owner}{w.repo ? `/${w.repo}` : ''}</code>
                        <span className="text-[10px] text-gray-500">{w.events.length} events</span>
                        <button type="button" onClick={() => void handleUnregisterWebhook(w.hook_id)} disabled={submitting} className="text-[10px] font-medium text-red-600 hover:underline disabled:opacity-50">Borrar</button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">Aún no hay webhooks. Selecciona un repo:</p>
                )}
                <div className="mt-3 flex gap-2">
                  <select value={selectedRepo} onChange={(e) => setSelectedRepo(e.target.value)} className="flex-1 rounded-xl border border-black/10 bg-white px-2.5 py-1.5 text-[11px] text-gray-700 dark:border-white/10 dark:bg-[#171717] dark:text-gray-200">
                    <option value="">— elige un repo —</option>
                    {repos.map(r => (
                      <option key={r.id} value={r.full_name}>{r.full_name}{r.private ? ' (privado)' : ''}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => void handleRegisterWebhook()} disabled={!selectedRepo || submitting} className="rounded-full bg-gray-900 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black">
                    Registrar webhook
                  </button>
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-black/5 bg-gray-50/50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Probar conexión</p>
                  <button type="button" onClick={() => void handleSync()} disabled={syncStatus === 'syncing'} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#171717] dark:text-gray-200 dark:hover:bg-white/5">
                    {syncStatus === 'syncing' ? 'Sincronizando…' : syncStatus === 'ok' ? '✓ OK' : syncStatus === 'error' ? '⚠ Error' : 'Mis issues'}
                  </button>
                </div>
                {syncResult ? (
                  <div className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                    {syncResult.total} issues abiertos.
                    {syncResult.sample?.length ? (
                      <ul className="mt-1 space-y-0.5">
                        {syncResult.sample.map((i: any) => (
                          <li key={i.number} className="truncate">#{i.number} · {i.state} · {i.title}</li>
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
                    <span key={`w-${c}`} className="rounded-full border border-violet-300/60 bg-violet-50 px-2 py-0.5 text-[10px] text-violet-800 dark:border-violet-700/50 dark:bg-violet-900/20 dark:text-violet-200">{c}</span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Conexión vía OAuth. El AI agent escala bugs reportados desde el inbox al repo correcto, abre issues con el contexto de la conversación y hace cross-link entre ticket y PR.
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
                  <li>Necesitas permiso <code>admin:repo_hook</code> en los repos donde quieras webhooks</li>
                  <li>Scopes: <code>repo</code>, <code>read:org</code>, <code>read:user</code>, <code>user:email</code></li>
                  <li>Después del install eliges qué repos enchufar — el webhook se registra firmado HMAC SHA256</li>
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
              <button type="button" onClick={() => void handleInstall()} disabled={submitting} className="flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-black disabled:opacity-50">
                {submitting ? <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>Redirigiendo…</> : 'Conectar con GitHub'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default GitHubConnectModal;
