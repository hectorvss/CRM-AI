import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';
import { ErrorBox } from './MessengerConnectModal';
import { IntegrationLogo } from './logos';

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  existing?: {
    subdomain?: string;
    identity_email?: string | null;
    identity_name?: string | null;
    scope?: string | null;
    webhook_id?: string | null;
    webhook_url?: string | null;
    webhook_registered?: boolean;
    webhook_error?: string | null;
    capabilities?: { reads?: string[]; writes?: string[]; events?: string[] } | null;
  } | null;
}

const SCOPES = [
  { id: 'tickets', label: 'Tickets · CRUD + bulk update', icon: 'support' },
  { id: 'comments', label: 'Public replies + internal notes', icon: 'forum' },
  { id: 'users', label: 'Users · search · create_or_update', icon: 'group' },
  { id: 'orgs', label: 'Organizations · related lookup', icon: 'business' },
  { id: 'macros', label: 'Macros · apply / record', icon: 'bolt' },
  { id: 'search', label: 'Cross-object search DSL', icon: 'search' },
  { id: 'help', label: 'Help Center articles (knowledge for AI)', icon: 'menu_book' },
  { id: 'webhooks', label: 'Webhooks v2 + signed events', icon: 'graph_2' },
];

const ZendeskConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [subdomain, setSubdomain] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const [syncResult, setSyncResult] = useState<any>(null);

  useEffect(() => {
    if (open) {
      setSubdomain(''); setSubmitting(false); setError(null);
      setSyncStatus('idle'); setSyncResult(null);
    }
  }, [open]);

  if (!open) return null;
  const isConnected = Boolean(existing?.subdomain);

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
    setError(null);
    const sd = subdomain.trim().toLowerCase().replace(/\.zendesk\.com$/i, '').replace(/^https?:\/\//i, '');
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/i.test(sd)) {
      return setError('Subdomain inválido. Ejemplo: "acme" si tu Zendesk es acme.zendesk.com');
    }
    setSubmitting(true);
    try {
      const res = await authedFetch(`/api/integrations/zendesk/install?subdomain=${encodeURIComponent(sd)}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Error ${res.status}`);
      }
      const j = await res.json();
      if (j.url) window.location.href = j.url;
    } catch (err: any) {
      setError(err?.message || 'No se pudo iniciar el install de Zendesk');
      setSubmitting(false);
    }
  }

  async function handleSync() {
    setSyncStatus('syncing'); setSyncResult(null);
    try {
      const res = await authedFetch('/api/integrations/zendesk/sync', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.details || j.error || `${res.status}`);
      setSyncResult(j); setSyncStatus('ok');
    } catch {
      setSyncStatus('error');
    }
  }

  async function handleReregister() {
    if (!confirm('¿Re-registrar el webhook en Zendesk? Reemplazará el existente.')) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/zendesk/register-webhook', { method: 'POST' });
      if (!res.ok) throw new Error();
      onChanged?.();
    } finally { setSubmitting(false); }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar Zendesk? Borraremos el webhook y revocaremos el access token.')) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/zendesk/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error();
      onChanged?.(); onClose();
    } finally { setSubmitting(false); }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#171717]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#03363D] text-[#78A300] shadow-sm">
              <IntegrationLogo id="zendesk" size={22} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Helpdesk</p>
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Zendesk</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Tickets, comments, users, macros · webhooks firmados</p>
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
                  Conectado a <strong>{existing?.subdomain}.zendesk.com</strong>
                  {existing?.identity_email ? <> · {existing.identity_email}</> : null}
                </p>
              </div>

              <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Webhook</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${existing?.webhook_registered ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'}`}>
                    {existing?.webhook_registered ? 'Registrado' : 'No registrado'}
                  </span>
                </div>
                {existing?.webhook_url ? (
                  <code className="mt-2 block break-all rounded-xl bg-gray-50 px-2.5 py-2 text-[11px] text-gray-700 dark:bg-white/5 dark:text-gray-200">{existing.webhook_url}</code>
                ) : null}
                {existing?.webhook_error ? (
                  <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">{existing.webhook_error}</p>
                ) : null}
                <button type="button" onClick={() => void handleReregister()} disabled={submitting} className="mt-2 text-[11px] font-medium text-[#03363D] underline-offset-2 hover:underline disabled:opacity-50 dark:text-[#78A300]">
                  Re-registrar
                </button>
              </div>

              <div className="mt-3 rounded-2xl border border-black/5 bg-gray-50/50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Probar conexión</p>
                  <button type="button" onClick={() => void handleSync()} disabled={syncStatus === 'syncing'} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#171717] dark:text-gray-200 dark:hover:bg-white/5">
                    {syncStatus === 'syncing' ? 'Sincronizando…' : syncStatus === 'ok' ? '✓ OK' : syncStatus === 'error' ? '⚠ Error' : 'Listar tickets abiertos'}
                  </button>
                </div>
                {syncResult ? (
                  <div className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                    {syncResult.open_tickets_visible} tickets abiertos visibles.
                    {syncResult.sample?.length ? (
                      <ul className="mt-1 space-y-0.5">
                        {syncResult.sample.map((t: any) => (
                          <li key={t.id} className="truncate">#{t.id} · <span className="font-medium">{t.status}</span> · {t.subject}</li>
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
                    <span key={`w-${c}`} className="rounded-full border border-emerald-300/60 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-900/20 dark:text-emerald-200">{c}</span>
                  ))}
                </div>
                {existing?.scope ? (
                  <p className="mt-2 text-[10px] text-gray-500 dark:text-gray-400">
                    Scopes OAuth: <code className="break-all">{existing.scope}</code>
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Conexión vía OAuth. Clain leerá y escribirá tickets en tu Zendesk; el AI Agent puede operar sobre Zendesk sin migrar tu helpdesk.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SCOPES.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-xl border border-black/5 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                    <span className="material-symbols-outlined text-[14px] text-[#03363D]">{s.icon}</span>
                    {s.label}
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                <p className="font-semibold uppercase tracking-[0.18em]">Antes de conectar</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-relaxed">
                  <li>Necesitas ser admin del Zendesk account para autorizar la app</li>
                  <li>Tu account debe tener API + Webhooks habilitados (incluido en todos los planes Suite)</li>
                  <li>Tras autorizar, Clain registra automáticamente un webhook con sus 9 subscriptions de eventos</li>
                </ol>
              </div>

              <div className="mt-4">
                <label className="block">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Subdomain de Zendesk</span>
                  <div className="mt-1.5 flex items-stretch overflow-hidden rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-[#1b1b1b]">
                    <input
                      value={subdomain}
                      onChange={(e) => setSubdomain(e.target.value)}
                      placeholder="acme"
                      autoFocus
                      className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none dark:text-white"
                    />
                    <span className="flex items-center bg-gray-50 px-3 text-[12px] text-gray-500 dark:bg-white/5 dark:text-gray-400">.zendesk.com</span>
                  </div>
                </label>
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
              <button type="button" onClick={() => void handleInstall()} disabled={submitting || !subdomain} className="flex items-center gap-2 rounded-full bg-[#03363D] px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#022529] disabled:opacity-50">
                {submitting ? <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>Redirigiendo…</> : 'Autorizar en Zendesk'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ZendeskConnectModal;
