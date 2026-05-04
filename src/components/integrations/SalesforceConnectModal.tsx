import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';
import { ErrorBox } from './MessengerConnectModal';
import { IntegrationLogo } from './logos';

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  existing?: {
    mode?: 'production' | 'sandbox';
    instance_url?: string;
    organization_id?: string | null;
    user_id?: string | null;
    email?: string | null;
    username?: string | null;
    display_name?: string | null;
    api_version?: string | null;
    push_topics?: string[];
    capabilities?: { reads?: string[]; writes?: string[]; streaming?: string[] } | null;
  } | null;
}

const SCOPES = [
  { id: 'cases', label: 'Cases · CaseComment', icon: 'support' },
  { id: 'contacts', label: 'Contacts · Accounts', icon: 'group' },
  { id: 'leads', label: 'Leads · Opportunities', icon: 'trending_up' },
  { id: 'tasks', label: 'Tasks · activity feed', icon: 'task_alt' },
  { id: 'soql', label: 'SOQL + SOSL', icon: 'database' },
  { id: 'streaming', label: 'PushTopics · CDC', icon: 'graph_2' },
];

const SalesforceConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [mode, setMode] = useState<'production' | 'sandbox'>('production');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topicName, setTopicName] = useState('');
  const [topicQuery, setTopicQuery] = useState('SELECT Id, CaseNumber, Subject, Status FROM Case WHERE IsClosed = false');
  const [topicStatus, setTopicStatus] = useState<'idle' | 'creating' | 'ok' | 'error'>('idle');
  const [topicError, setTopicError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const [syncResult, setSyncResult] = useState<any>(null);

  useEffect(() => {
    if (open) {
      setMode(existing?.mode === 'sandbox' ? 'sandbox' : 'production');
      setSubmitting(false); setError(null);
      setTopicName(''); setTopicStatus('idle'); setTopicError(null);
      setSyncStatus('idle'); setSyncResult(null);
    }
  }, [open, existing?.mode]);

  if (!open) return null;
  const isConnected = Boolean(existing?.organization_id || existing?.instance_url);

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
      const res = await authedFetch(`/api/integrations/salesforce/install?mode=${mode}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Error ${res.status}`);
      }
      const j = await res.json();
      if (j.url) window.location.href = j.url;
    } catch (err: any) {
      setError(err?.message || 'Could not start Salesforce install');
      setSubmitting(false);
    }
  }

  async function handleSync() {
    setSyncStatus('syncing'); setSyncResult(null);
    try {
      const res = await authedFetch('/api/integrations/salesforce/sync', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.details || j.error || `${res.status}`);
      setSyncResult(j); setSyncStatus('ok');
    } catch {
      setSyncStatus('error');
    }
  }

  async function handleCreateTopic() {
    if (!topicName || !topicQuery) return;
    setTopicStatus('creating'); setTopicError(null);
    try {
      const res = await authedFetch('/api/integrations/salesforce/push-topic', {
        method: 'POST',
        body: JSON.stringify({ name: topicName.trim(), query: topicQuery.trim(), notify_for_operations: 'All', notify_for_fields: 'Referenced' }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `${res.status}`);
      setTopicStatus('ok'); setTopicName(''); onChanged?.();
      setTimeout(() => setTopicStatus('idle'), 2500);
    } catch (err: any) {
      setTopicError(err?.message || 'Failed');
      setTopicStatus('error');
    }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar Salesforce? Revocaremos el access token.')) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/salesforce/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error();
      onChanged?.(); onClose();
    } finally { setSubmitting(false); }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#171717]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#00A1E0] text-white shadow-sm">
              <IntegrationLogo id="salesforce" size={22} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">CRM</p>
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Salesforce</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Cases, contacts, SOQL, streaming PushTopics</p>
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
                  {existing?.display_name || existing?.username || existing?.email || 'Conectado'} · {existing?.mode}
                </p>
                {existing?.organization_id ? <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100">Org {String(existing.organization_id).slice(0, 8)}</span> : null}
              </div>

              {existing?.instance_url ? (
                <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Instance URL</p>
                  <code className="mt-1 block break-all text-[12px] text-gray-700 dark:text-gray-200">{existing.instance_url}</code>
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">API {existing.api_version || 'v59.0'}</p>
                </div>
              ) : null}

              <div className="mt-3 rounded-2xl border border-black/5 bg-gray-50/50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Probar conexión</p>
                  <button type="button" onClick={() => void handleSync()} disabled={syncStatus === 'syncing'} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#171717] dark:text-gray-200 dark:hover:bg-white/5">
                    {syncStatus === 'syncing' ? 'Sincronizando…' : syncStatus === 'ok' ? '✓ OK' : syncStatus === 'error' ? '⚠ Error' : 'Listar Cases abiertos'}
                  </button>
                </div>
                {syncResult ? (
                  <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                    Visibles {syncResult.open_cases_visible} cases abiertos.
                  </p>
                ) : null}
              </div>

              <div className="mt-3 rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">PushTopic streaming</p>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  Crea un PushTopic para recibir eventos en tiempo real vía CometD. Ya configurados: {existing?.push_topics?.length ?? 0}
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <input value={topicName} onChange={(e) => setTopicName(e.target.value)} placeholder="OpenCases" className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-gray-950 dark:border-white/10 dark:bg-[#171717] dark:text-white" />
                  <input value={topicQuery} onChange={(e) => setTopicQuery(e.target.value)} className="col-span-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-gray-950 dark:border-white/10 dark:bg-[#171717] dark:text-white" />
                </div>
                <button type="button" onClick={() => void handleCreateTopic()} disabled={!topicName || !topicQuery || topicStatus === 'creating'} className="mt-2 rounded-full bg-[#00A1E0] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#0090CB] disabled:opacity-50">
                  {topicStatus === 'creating' ? 'Creando…' : topicStatus === 'ok' ? '✓ Creado' : 'Crear PushTopic'}
                </button>
                {topicError ? <ErrorBox text={topicError} /> : null}
                {existing?.push_topics?.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {existing.push_topics.map((n) => (
                      <span key={n} className="rounded-full border border-black/5 bg-gray-50 px-2 py-0.5 text-[10px] text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">{n}</span>
                    ))}
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
                    <span key={`w-${c}`} className="rounded-full border border-blue-300/60 bg-blue-50 px-2 py-0.5 text-[10px] text-blue-800 dark:border-blue-700/50 dark:bg-blue-900/20 dark:text-blue-200">{c}</span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Conexión vía OAuth. Te llevamos a la pantalla de Salesforce para que el admin de la org apruebe los permisos.
                Luego volvemos aquí con el access + refresh token guardados.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SCOPES.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-xl border border-black/5 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                    <span className="material-symbols-outlined text-[14px] text-[#00A1E0]">{s.icon}</span>
                    {s.label}
                  </div>
                ))}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-black/5 bg-gray-50/50 p-2 dark:border-white/10 dark:bg-white/[0.03]">
                <button type="button" onClick={() => setMode('production')} className={`rounded-xl px-3 py-2 text-[12px] font-medium transition ${mode === 'production' ? 'bg-black text-white dark:bg-white dark:text-black' : 'text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white'}`}>
                  Producción · login.salesforce.com
                </button>
                <button type="button" onClick={() => setMode('sandbox')} className={`rounded-xl px-3 py-2 text-[12px] font-medium transition ${mode === 'sandbox' ? 'bg-black text-white dark:bg-white dark:text-black' : 'text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white'}`}>
                  Sandbox · test.salesforce.com
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                <p className="font-semibold uppercase tracking-[0.18em]">Antes de conectar</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-relaxed">
                  <li>Setup → App Manager → New Connected App (sólo si Clain aún no está en el AppExchange de tu org)</li>
                  <li>Selected OAuth Scopes: <strong>api</strong>, <strong>refresh_token</strong>, <strong>id</strong></li>
                  <li>Permite el callback URL que Clain configura automáticamente</li>
                  <li>Pulsa "Conectar" abajo y aprueba en Salesforce</li>
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
              <button type="button" onClick={() => void handleInstall()} disabled={submitting} className="flex items-center gap-2 rounded-full bg-[#00A1E0] px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#0090CB] disabled:opacity-50">
                {submitting ? <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>Redirigiendo…</> : 'Conectar con Salesforce'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SalesforceConnectModal;
