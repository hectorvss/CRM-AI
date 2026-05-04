import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';
import { ErrorBox } from './MessengerConnectModal';
import { IntegrationLogo } from './logos';

interface WebhookEntry { hook_id: number; event_action: string; event_object: string; subscription_url: string }
interface Props {
  open: boolean; onClose: () => void; onChanged?: () => void;
  existing?: { user_id?: number | null; company_id?: number | null; company_name?: string | null; company_domain?: string | null; api_domain?: string | null; email?: string | null; name?: string | null; scope?: string | null; webhooks?: WebhookEntry[] | null; webhook_error?: string | null; capabilities?: { reads?: string[]; writes?: string[] } | null } | null;
}

const SCOPES = [
  { id: 'persons',  label: 'Persons · find-or-create por email',     icon: 'group' },
  { id: 'orgs',     label: 'Organizations · address + owner',         icon: 'apartment' },
  { id: 'deals',    label: 'Deals · stages · pipelines · won/lost',   icon: 'trending_up' },
  { id: 'activities', label: 'Activities · tasks · notes',             icon: 'event' },
  { id: 'webhooks', label: 'Webhooks autenticados HTTP Basic',        icon: 'graph_2' },
  { id: 'refresh',  label: 'OAuth refresh transparente (60s)',         icon: 'autorenew' },
];

const PipedriveConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const [syncResult, setSyncResult] = useState<any>(null);

  useEffect(() => { if (open) { setSubmitting(false); setError(null); setSyncStatus('idle'); setSyncResult(null); } }, [open]);
  if (!open) return null;
  const isConnected = Boolean(existing?.user_id);

  async function authedFetch(path: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
    return fetch(`${apiBase}${path}`, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token ?? ''}`, Accept: 'application/json', ...(init?.body && init.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) } });
  }

  async function handleInstall() {
    setError(null); setSubmitting(true);
    try { const res = await authedFetch('/api/integrations/pipedrive/install'); if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `Error ${res.status}`); } const j = await res.json(); if (j.url) window.location.href = j.url; }
    catch (err: any) { setError(err?.message || 'No se pudo iniciar el install'); setSubmitting(false); }
  }
  async function handleSync() {
    setSyncStatus('syncing'); setSyncResult(null);
    try { const res = await authedFetch('/api/integrations/pipedrive/sync', { method: 'POST' }); const j = await res.json(); if (!res.ok) throw new Error(); setSyncResult(j); setSyncStatus('ok'); } catch { setSyncStatus('error'); }
  }
  async function handleReregister() {
    if (!confirm('¿Re-registrar todos los webhooks?')) return;
    setSubmitting(true);
    try { const res = await authedFetch('/api/integrations/pipedrive/register-webhooks', { method: 'POST' }); if (!res.ok) throw new Error(); onChanged?.(); }
    finally { setSubmitting(false); }
  }
  async function handleDisconnect() {
    if (!confirm('¿Desconectar Pipedrive? Borraremos los webhooks registrados.')) return;
    setSubmitting(true);
    try { const res = await authedFetch('/api/integrations/pipedrive/disconnect', { method: 'POST' }); if (!res.ok) throw new Error(); onChanged?.(); onClose(); }
    finally { setSubmitting(false); }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#171717]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-600 text-white shadow-sm"><IntegrationLogo id="pipedrive" size={22} /></div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">CRM · Sales</p>
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Pipedrive</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Persons · deals · pipelines · webhooks autenticados Basic</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"><span className="material-symbols-outlined text-[18px]">close</span></button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          {isConnected ? (
            <>
              <div className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-900/20">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <p className="flex-1 text-sm text-emerald-800 dark:text-emerald-200">Conectado · <strong>{existing?.company_name || existing?.email}</strong>{existing?.company_domain ? <> · {existing.company_domain}</> : null}</p>
              </div>
              {existing?.api_domain ? (
                <div className="mb-3 rounded-2xl border border-black/5 bg-gray-50/50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">API domain</p>
                  <code className="mt-1 block break-all text-[11px] text-gray-700 dark:text-gray-200">{existing.api_domain}</code>
                </div>
              ) : null}
              <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Webhooks suscritos</p>
                  <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100">{existing?.webhooks?.length ?? 0} activos</span>
                </div>
                {existing?.webhooks?.length ? (
                  <ul className="mt-2 space-y-1">{existing.webhooks.map(w => (<li key={w.hook_id} className="rounded-xl bg-gray-50 px-2.5 py-2 text-[11px] dark:bg-white/5"><code className="text-gray-700 dark:text-gray-200">{w.event_action}.{w.event_object}</code></li>))}</ul>
                ) : <p className="mt-2 text-[11px] text-gray-500">Aún sin webhooks.</p>}
                {existing?.webhook_error ? <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">{existing.webhook_error}</p> : null}
                <button type="button" onClick={() => void handleReregister()} disabled={submitting} className="mt-2 text-[11px] font-medium text-green-700 underline-offset-2 hover:underline disabled:opacity-50 dark:text-green-300">Re-registrar todos</button>
              </div>
              <div className="mt-3 rounded-2xl border border-black/5 bg-gray-50/50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Probar</p>
                  <button type="button" onClick={() => void handleSync()} disabled={syncStatus === 'syncing'} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] dark:border-white/10 dark:bg-[#171717] dark:text-gray-200">
                    {syncStatus === 'syncing' ? '…' : syncStatus === 'ok' ? '✓ OK' : syncStatus === 'error' ? '⚠' : 'Deals abiertos'}
                  </button>
                </div>
                {syncResult ? (
                  <div className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                    {syncResult.deals_visible} deals.
                    {syncResult.sample?.length ? <ul className="mt-1 space-y-0.5">{syncResult.sample.map((d: any) => <li key={d.id} className="truncate">{d.title} · {d.value} {d.currency} · stage {d.stage_id}</li>)}</ul> : null}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">Pipedrive cubre el segmento SMB sales (HubSpot ya tienes para mid-market). El AI agent crea deals desde el inbox, encuentra-o-crea persons por email y mantiene el pipeline al día.</p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SCOPES.map(s => (<div key={s.id} className="flex items-center gap-2 rounded-xl border border-black/5 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"><span className="material-symbols-outlined text-[14px] text-green-600">{s.icon}</span>{s.label}</div>))}
              </div>
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                <p className="font-semibold uppercase tracking-[0.18em]">Antes de instalar</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-relaxed">
                  <li>Necesitas ser admin (o tener app permissions) en tu Pipedrive company</li>
                  <li>Pipedrive devuelve un <code>api_domain</code> per-company que pinneamos</li>
                  <li>Webhooks: 6 por defecto (deal/person/org × added/updated/deleted) firmados HTTP Basic</li>
                </ol>
              </div>
              {error ? <ErrorBox text={error} /> : null}
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-black/5 bg-gray-50/50 px-6 py-4 dark:border-white/10 dark:bg-white/[0.02]">
          {isConnected ? (
            <>
              <button type="button" onClick={() => void handleDisconnect()} disabled={submitting} className="rounded-full px-4 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20">Desconectar</button>
              <button type="button" onClick={onClose} className="rounded-full bg-black px-5 py-2 text-[13px] font-semibold text-white dark:bg-white dark:text-black">Hecho</button>
            </>
          ) : (
            <>
              <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-[13px] font-medium text-gray-600 hover:text-gray-950 dark:text-gray-300">Cancelar</button>
              <button type="button" onClick={() => void handleInstall()} disabled={submitting} className="flex items-center gap-2 rounded-full bg-green-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                {submitting ? <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>Redirigiendo…</> : 'Conectar con Pipedrive'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PipedriveConnectModal;
