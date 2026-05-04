import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';
import { ErrorBox } from './MessengerConnectModal';
import { IntegrationLogo } from './logos';

interface Props { open: boolean; onClose: () => void; onChanged?: () => void; existing?: { installation_id?: string | null; organization_slug?: string | null; organization_name?: string | null; scope?: string | null; capabilities?: any | null } | null }

const SCOPES = [
  { id: 'iss',  label: 'Issues · list · resolve · assign',          icon: 'bug_report' },
  { id: 'evt',  label: 'Events · stack traces · breadcrumbs',        icon: 'list_alt' },
  { id: 'cmt',  label: 'Comments en issues desde el agent',          icon: 'forum' },
  { id: 'wh',   label: 'Webhooks Integration Platform (HMAC)',       icon: 'graph_2' },
  { id: 'rt',   label: 'Refresh token · auto-rotate 8h',             icon: 'autorenew' },
  { id: 'auto', label: 'Auto-link error → ticket de cliente',         icon: 'link' },
];

const SentryConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const [syncResult, setSyncResult] = useState<any>(null);
  useEffect(() => { if (open) { setSubmitting(false); setError(null); setSyncStatus('idle'); setSyncResult(null); } }, [open]);
  if (!open) return null;
  const isConnected = Boolean(existing?.installation_id);

  async function authedFetch(path: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession(); const token = data.session?.access_token;
    const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
    return fetch(`${apiBase}${path}`, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token ?? ''}`, Accept: 'application/json', ...(init?.body && init.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) } });
  }
  async function handleInstall() {
    setError(null); setSubmitting(true);
    try { const res = await authedFetch('/api/integrations/sentry/install'); if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `${res.status}`); } const j = await res.json(); if (j.url) window.location.href = j.url; }
    catch (err: any) { setError(err?.message); setSubmitting(false); }
  }
  async function handleSync() {
    setSyncStatus('syncing'); setSyncResult(null);
    try { const res = await authedFetch('/api/integrations/sentry/sync', { method: 'POST' }); const j = await res.json(); if (!res.ok) throw new Error(); setSyncResult(j); setSyncStatus('ok'); } catch { setSyncStatus('error'); }
  }
  async function handleDisconnect() {
    if (!confirm('¿Desconectar Sentry?')) return;
    setSubmitting(true);
    try { const res = await authedFetch('/api/integrations/sentry/disconnect', { method: 'POST' }); if (!res.ok) throw new Error(); onChanged?.(); onClose(); }
    finally { setSubmitting(false); }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#171717]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-700 text-white shadow-sm"><IntegrationLogo id="sentry" size={22} /></div>
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Engineering · Errors</p><h2 className="text-lg font-semibold text-gray-950 dark:text-white">Sentry</h2><p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Errors → cases · auto-link bug ticket cuando varios clientes lo reportan</p></div>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"><span className="material-symbols-outlined text-[18px]">close</span></button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          {isConnected ? (
            <>
              <div className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-900/20"><span className="h-2 w-2 rounded-full bg-emerald-500" /><p className="flex-1 text-sm text-emerald-800 dark:text-emerald-200">Conectado · installation <code>{existing?.installation_id?.slice(0, 12)}…</code></p></div>
              <div className="rounded-2xl border border-black/5 bg-gray-50/50 p-4 dark:border-white/10 dark:bg-white/[0.03]"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Probar</p><button type="button" onClick={() => void handleSync()} disabled={syncStatus === 'syncing'} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] dark:border-white/10 dark:bg-[#171717] dark:text-gray-200">{syncStatus === 'syncing' ? '…' : syncStatus === 'ok' ? '✓ OK' : syncStatus === 'error' ? '⚠' : 'Issues unresolved'}</button></div>{syncResult ? <div className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-300">{syncResult.issues_visible} issues abiertos en <code>{syncResult.organization}</code>.{syncResult.sample?.length ? <ul className="mt-1 space-y-0.5">{syncResult.sample.map((i: any) => <li key={i.id} className="truncate">{i.short_id} · {i.level} · {i.title} ({i.count})</li>)}</ul> : null}</div> : null}</div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">Cuando un Sentry alert dispara y un cliente reporta el mismo error, el AI agent los une automáticamente. Closed-loop: error fixed en Sentry → notifica a los clientes afectados por inbox.</p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{SCOPES.map(s => (<div key={s.id} className="flex items-center gap-2 rounded-xl border border-black/5 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"><span className="material-symbols-outlined text-[14px] text-purple-700">{s.icon}</span>{s.label}</div>))}</div>
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200"><p className="font-semibold uppercase tracking-[0.18em]">Antes de instalar</p><ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-relaxed"><li>Crea una Sentry Integration Platform App en Sentry → Settings → Custom Integrations</li><li>Configura <code>SENTRY_APP_SLUG</code>, <code>SENTRY_CLIENT_ID</code>, <code>SENTRY_CLIENT_SECRET</code></li><li>Webhook URL: <code>/webhooks/sentry</code> con eventos issue + event + comment + installation</li></ol></div>
              {error ? <ErrorBox text={error} /> : null}
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-black/5 bg-gray-50/50 px-6 py-4 dark:border-white/10 dark:bg-white/[0.02]">
          {isConnected ? (<><button type="button" onClick={() => void handleDisconnect()} disabled={submitting} className="rounded-full px-4 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20">Desconectar</button><button type="button" onClick={onClose} className="rounded-full bg-black px-5 py-2 text-[13px] font-semibold text-white dark:bg-white dark:text-black">Hecho</button></>) : (<><button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-[13px] font-medium text-gray-600 hover:text-gray-950 dark:text-gray-300">Cancelar</button><button type="button" onClick={() => void handleInstall()} disabled={submitting} className="flex items-center gap-2 rounded-full bg-purple-700 px-5 py-2 text-[13px] font-semibold text-white hover:bg-purple-800 disabled:opacity-50">{submitting ? <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>Redirigiendo…</> : 'Conectar con Sentry'}</button></>)}
        </div>
      </div>
    </div>
  );
};

export default SentryConnectModal;
