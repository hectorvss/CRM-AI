import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';
import { ErrorBox } from './MessengerConnectModal';
import { IntegrationLogo } from './logos';

interface WebhookEntry { webhook_id: string; list_id: string; url: string }
interface Props {
  open: boolean; onClose: () => void; onChanged?: () => void;
  existing?: { user_id?: number | null; account_id?: string | null; account_name?: string | null; email?: string | null; dc?: string | null; api_endpoint?: string | null; webhooks?: WebhookEntry[] | null; capabilities?: { reads?: string[]; writes?: string[] } | null } | null;
}

const SCOPES = [
  { id: 'lists',     label: 'Lists (audiences) · stats',                icon: 'group' },
  { id: 'members',   label: 'Members · upsert por email · merge fields', icon: 'person_add' },
  { id: 'tags',      label: 'Tags · segmentación dinámica',              icon: 'sell' },
  { id: 'campaigns', label: 'Campaigns · subject · sent stats',          icon: 'campaign' },
  { id: 'webhooks',  label: 'Webhooks per-list · token en URL',          icon: 'graph_2' },
  { id: 'unsubscribe', label: 'Unsubscribe seguro · re-subscribe',        icon: 'unsubscribe' },
];

const MailchimpConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const [syncResult, setSyncResult] = useState<any>(null);
  const [lists, setLists] = useState<any[]>([]);
  const [selectedList, setSelectedList] = useState<string>('');

  useEffect(() => {
    if (open) {
      setSubmitting(false); setError(null); setSyncStatus('idle'); setSyncResult(null);
      setLists([]); setSelectedList('');
      if (existing?.user_id) void loadLists();
    }
  }, [open]);
  if (!open) return null;
  const isConnected = Boolean(existing?.user_id);

  async function authedFetch(path: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
    return fetch(`${apiBase}${path}`, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token ?? ''}`, Accept: 'application/json', ...(init?.body && init.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) } });
  }
  async function loadLists() {
    try { const res = await authedFetch('/api/integrations/mailchimp/lists'); if (!res.ok) return; const j = await res.json(); setLists(j.lists ?? []); } catch { /* ignore */ }
  }
  async function handleInstall() {
    setError(null); setSubmitting(true);
    try { const res = await authedFetch('/api/integrations/mailchimp/install'); if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `Error ${res.status}`); } const j = await res.json(); if (j.url) window.location.href = j.url; }
    catch (err: any) { setError(err?.message || 'No se pudo iniciar el install'); setSubmitting(false); }
  }
  async function handleSync() {
    setSyncStatus('syncing'); setSyncResult(null);
    try { const res = await authedFetch('/api/integrations/mailchimp/sync', { method: 'POST' }); const j = await res.json(); if (!res.ok) throw new Error(); setSyncResult(j); setSyncStatus('ok'); } catch { setSyncStatus('error'); }
  }
  async function handleRegisterWebhook() {
    if (!selectedList) return;
    setSubmitting(true);
    try { const res = await authedFetch('/api/integrations/mailchimp/register-webhook', { method: 'POST', body: JSON.stringify({ list_id: selectedList }) }); if (!res.ok) throw new Error(); setSelectedList(''); onChanged?.(); }
    catch (err: any) { setError(err?.message || 'Error registrando webhook'); }
    finally { setSubmitting(false); }
  }
  async function handleDisconnect() {
    if (!confirm('¿Desconectar Mailchimp?')) return;
    setSubmitting(true);
    try { const res = await authedFetch('/api/integrations/mailchimp/disconnect', { method: 'POST' }); if (!res.ok) throw new Error(); onChanged?.(); onClose(); }
    finally { setSubmitting(false); }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#171717]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-yellow-400 text-black shadow-sm"><IntegrationLogo id="mailchimp" size={22} /></div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Marketing · Email</p>
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Mailchimp</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Audiences · members · tags · campaigns · webhooks per-list</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"><span className="material-symbols-outlined text-[18px]">close</span></button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          {isConnected ? (
            <>
              <div className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-900/20">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <p className="flex-1 text-sm text-emerald-800 dark:text-emerald-200">Conectado · <strong>{existing?.account_name || existing?.email}</strong>{existing?.dc ? <> · DC {existing.dc}</> : null}</p>
              </div>
              {existing?.api_endpoint ? (
                <div className="mb-3 rounded-2xl border border-black/5 bg-gray-50/50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">API endpoint</p>
                  <code className="mt-1 block break-all text-[11px] text-gray-700 dark:text-gray-200">{existing.api_endpoint}</code>
                </div>
              ) : null}
              <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Webhooks por lista</p>
                {existing?.webhooks?.length ? (
                  <ul className="mt-2 space-y-1">{existing.webhooks.map(w => (<li key={w.webhook_id} className="rounded-xl bg-gray-50 px-2.5 py-2 text-[11px] dark:bg-white/5"><code className="text-gray-700 dark:text-gray-200">list {w.list_id}</code></li>))}</ul>
                ) : <p className="mt-2 text-[11px] text-gray-500">Aún sin webhooks.</p>}
                <div className="mt-3 flex gap-2">
                  <select value={selectedList} onChange={(e) => setSelectedList(e.target.value)} className="flex-1 rounded-xl border border-black/10 bg-white px-2.5 py-1.5 text-[11px] text-gray-700 dark:border-white/10 dark:bg-[#171717] dark:text-gray-200">
                    <option value="">— elige una audience —</option>
                    {lists.map(l => (<option key={l.id} value={l.id}>{l.name} ({l.stats.member_count})</option>))}
                  </select>
                  <button type="button" onClick={() => void handleRegisterWebhook()} disabled={!selectedList || submitting} className="rounded-full bg-yellow-400 px-3 py-1.5 text-[11px] font-semibold text-black disabled:opacity-50">+ Webhook</button>
                </div>
              </div>
              <div className="mt-3 rounded-2xl border border-black/5 bg-gray-50/50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Probar</p>
                  <button type="button" onClick={() => void handleSync()} disabled={syncStatus === 'syncing'} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] dark:border-white/10 dark:bg-[#171717] dark:text-gray-200">
                    {syncStatus === 'syncing' ? '…' : syncStatus === 'ok' ? '✓ OK' : syncStatus === 'error' ? '⚠' : 'Lists + campaigns'}
                  </button>
                </div>
                {syncResult ? (
                  <div className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                    {syncResult.lists_visible} lists · {syncResult.campaigns_visible} campaigns.
                    {syncResult.sample_lists?.length ? <ul className="mt-1 space-y-0.5">{syncResult.sample_lists.map((l: any) => <li key={l.id} className="truncate">{l.name} · {l.members} members</li>)}</ul> : null}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">El AI agent suscribe nuevos contactos desde el inbox a la audience correcta, aplica tags por segmentación y unsubscribe automático cuando el cliente lo pide.</p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SCOPES.map(s => (<div key={s.id} className="flex items-center gap-2 rounded-xl border border-black/5 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"><span className="material-symbols-outlined text-[14px] text-yellow-500">{s.icon}</span>{s.label}</div>))}
              </div>
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                <p className="font-semibold uppercase tracking-[0.18em]">Antes de instalar</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-relaxed">
                  <li>Necesitas Mailchimp Standard+ para webhooks</li>
                  <li>Mailchimp devuelve un <code>api_endpoint</code> per-DC (us1, us2, eu1...) que pinneamos</li>
                  <li>Webhooks: per-lista, autenticados con un token único en la URL</li>
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
              <button type="button" onClick={() => void handleInstall()} disabled={submitting} className="flex items-center gap-2 rounded-full bg-yellow-400 px-5 py-2 text-[13px] font-semibold text-black hover:bg-yellow-500 disabled:opacity-50">
                {submitting ? <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>Redirigiendo…</> : 'Conectar con Mailchimp'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MailchimpConnectModal;
