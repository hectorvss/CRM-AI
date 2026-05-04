import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';
import { ErrorBox } from './MessengerConnectModal';
import { IntegrationLogo } from './logos';

interface Props { open: boolean; onClose: () => void; onChanged?: () => void; existing?: { workspace_slug?: string | null; source_name?: string | null; webhook_token?: string | null; capabilities?: any | null } | null }

const SCOPES = [
  { id: 'identify', label: 'identify · upsert user traits',     icon: 'badge' },
  { id: 'track',    label: 'track · custom events',              icon: 'event_note' },
  { id: 'page',     label: 'page · screen views',                icon: 'visibility' },
  { id: 'group',    label: 'group · org/account context',         icon: 'groups' },
  { id: 'alias',    label: 'alias · merge identities',           icon: 'compare_arrows' },
  { id: 'batch',    label: 'batch · 100 events/call',             icon: 'inventory_2' },
];

const SegmentConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [writeKey, setWriteKey] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');

  useEffect(() => { if (open) { setSubmitting(false); setError(null); setWriteKey(''); setWorkspaceSlug(''); setSourceName(''); setSyncStatus('idle'); } }, [open]);
  if (!open) return null;
  const isConnected = Boolean(existing?.workspace_slug || existing?.source_name || existing?.webhook_token);

  async function authedFetch(path: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
    return fetch(`${apiBase}${path}`, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token ?? ''}`, Accept: 'application/json', ...(init?.body && init.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) } });
  }
  async function handleConnect() {
    if (!writeKey.trim()) { setError('Write key requerido'); return; }
    setError(null); setSubmitting(true);
    try { const res = await authedFetch('/api/integrations/segment/connect', { method: 'POST', body: JSON.stringify({ write_key: writeKey.trim(), workspace_slug: workspaceSlug.trim() || null, source_name: sourceName.trim() || null }) }); if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || j.details || `${res.status}`); } onChanged?.(); onClose(); }
    catch (err: any) { setError(err?.message || 'No se pudo conectar'); }
    finally { setSubmitting(false); }
  }
  async function handleSync() {
    setSyncStatus('syncing');
    try { const res = await authedFetch('/api/integrations/segment/sync', { method: 'POST' }); const j = await res.json(); if (!res.ok || !j.ok) throw new Error(); setSyncStatus('ok'); } catch { setSyncStatus('error'); }
  }
  async function handleDisconnect() {
    if (!confirm('¿Desconectar Segment?')) return;
    setSubmitting(true);
    try { const res = await authedFetch('/api/integrations/segment/disconnect', { method: 'POST' }); if (!res.ok) throw new Error(); onChanged?.(); onClose(); }
    finally { setSubmitting(false); }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#171717]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm"><IntegrationLogo id="segment" size={22} /></div>
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Data Layer · CDP</p><h2 className="text-lg font-semibold text-gray-950 dark:text-white">Segment</h2><p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Identity resolution · multiplica el valor de todas las demás integrations</p></div>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"><span className="material-symbols-outlined text-[18px]">close</span></button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          {isConnected ? (
            <>
              <div className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-900/20"><span className="h-2 w-2 rounded-full bg-emerald-500" /><p className="flex-1 text-sm text-emerald-800 dark:text-emerald-200">Conectado · <strong>{existing?.source_name || existing?.workspace_slug || 'Segment source'}</strong></p></div>
              {existing?.webhook_token ? (<div className="mb-3 rounded-2xl border border-black/5 bg-gray-50/50 p-3 dark:border-white/10 dark:bg-white/[0.03]"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Inbound webhook URL</p><code className="mt-1 block break-all text-[11px] text-gray-700 dark:text-gray-200">/webhooks/segment/{existing.webhook_token}</code><p className="mt-1 text-[10px] text-gray-500">Configura una Destination Function en Segment apuntando a esta URL para que el AI agent reaccione a eventos.</p></div>) : null}
              <div className="rounded-2xl border border-black/5 bg-gray-50/50 p-4 dark:border-white/10 dark:bg-white/[0.03]"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Probar</p><button type="button" onClick={() => void handleSync()} disabled={syncStatus === 'syncing'} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] dark:border-white/10 dark:bg-[#171717] dark:text-gray-200">{syncStatus === 'syncing' ? '…' : syncStatus === 'ok' ? '✓ OK' : syncStatus === 'error' ? '⚠' : 'Identify healthcheck'}</button></div></div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">Segment es la capa CDP que unifica identidad. Tu AI agent puede emitir <code>identify</code>/<code>track</code> a Segment, y Segment los reenvía a TODAS tus destinations (analytics, marketing, warehouse). También recibes eventos vía Destination Functions.</p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{SCOPES.map(s => (<div key={s.id} className="flex items-center gap-2 rounded-xl border border-black/5 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"><span className="material-symbols-outlined text-[14px] text-emerald-500">{s.icon}</span>{s.label}</div>))}</div>
              <div className="mt-4 space-y-3">
                <label className="block"><span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Source Write Key *</span><input type="password" value={writeKey} onChange={(e) => setWriteKey(e.target.value)} placeholder="abc123def..." className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white" /></label>
                <label className="block"><span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Workspace slug (opcional)</span><input type="text" value={workspaceSlug} onChange={(e) => setWorkspaceSlug(e.target.value)} placeholder="my-company" className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white" /></label>
                <label className="block"><span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Source name (opcional)</span><input type="text" value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="Clain backend" className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white" /></label>
              </div>
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200"><p className="font-semibold uppercase tracking-[0.18em]">Antes de conectar</p><ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-relaxed"><li>En Segment → Sources → New Source → HTTP API. Copia el Write Key.</li><li>Validamos el key con un healthcheck identify antes de guardar.</li><li>Para recibir eventos de Segment, configura una Destination Function apuntando a la URL que generamos.</li></ol></div>
              {error ? <ErrorBox text={error} /> : null}
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-black/5 bg-gray-50/50 px-6 py-4 dark:border-white/10 dark:bg-white/[0.02]">
          {isConnected ? (<><button type="button" onClick={() => void handleDisconnect()} disabled={submitting} className="rounded-full px-4 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20">Desconectar</button><button type="button" onClick={onClose} className="rounded-full bg-black px-5 py-2 text-[13px] font-semibold text-white dark:bg-white dark:text-black">Hecho</button></>) : (<><button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-[13px] font-medium text-gray-600 hover:text-gray-950 dark:text-gray-300">Cancelar</button><button type="button" onClick={() => void handleConnect()} disabled={submitting || !writeKey.trim()} className="flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2 text-[13px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">{submitting ? <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>Conectando…</> : 'Conectar'}</button></>)}
        </div>
      </div>
    </div>
  );
};

export default SegmentConnectModal;
