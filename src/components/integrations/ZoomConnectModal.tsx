import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';
import { ErrorBox } from './MessengerConnectModal';
import { IntegrationLogo } from './logos';

interface Props {
  open: boolean; onClose: () => void; onChanged?: () => void;
  existing?: { zoom_user_id?: string | null; account_id?: string | null; email?: string | null; name?: string | null; timezone?: string | null; scope?: string | null; capabilities?: { reads?: string[]; writes?: string[] } | null } | null;
}

const SCOPES = [
  { id: 'meetings',   label: 'Meetings · CRUD · scheduling',          icon: 'event' },
  { id: 'recordings', label: 'Cloud recordings · download URLs',       icon: 'fiber_manual_record' },
  { id: 'transcript', label: 'Transcripts · AI Companion summaries',   icon: 'transcribe' },
  { id: 'auto',       label: 'Auto-recording · cloud por default',     icon: 'autorenew' },
  { id: 'webhooks',   label: 'Webhooks v0 firmados (HMAC SHA256)',     icon: 'graph_2' },
  { id: 'refresh',    label: 'OAuth refresh transparente (60s)',       icon: 'sync' },
];

const ZoomConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const [syncResult, setSyncResult] = useState<any>(null);

  useEffect(() => { if (open) { setSubmitting(false); setError(null); setSyncStatus('idle'); setSyncResult(null); } }, [open]);
  if (!open) return null;
  const isConnected = Boolean(existing?.zoom_user_id);

  async function authedFetch(path: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
    return fetch(`${apiBase}${path}`, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token ?? ''}`, Accept: 'application/json', ...(init?.body && init.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) } });
  }

  async function handleInstall() {
    setError(null); setSubmitting(true);
    try { const res = await authedFetch('/api/integrations/zoom/install'); if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `Error ${res.status}`); } const j = await res.json(); if (j.url) window.location.href = j.url; }
    catch (err: any) { setError(err?.message || 'No se pudo iniciar el install'); setSubmitting(false); }
  }
  async function handleSync() {
    setSyncStatus('syncing'); setSyncResult(null);
    try { const res = await authedFetch('/api/integrations/zoom/sync', { method: 'POST' }); const j = await res.json(); if (!res.ok) throw new Error(); setSyncResult(j); setSyncStatus('ok'); } catch { setSyncStatus('error'); }
  }
  async function handleDisconnect() {
    if (!confirm('¿Desconectar Zoom?')) return;
    setSubmitting(true);
    try { const res = await authedFetch('/api/integrations/zoom/disconnect', { method: 'POST' }); if (!res.ok) throw new Error(); onChanged?.(); onClose(); }
    finally { setSubmitting(false); }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#171717]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm"><IntegrationLogo id="zoom" size={22} /></div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Voice/Video · Zoom</p>
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Zoom</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Meetings · cloud recordings · AI Companion transcripts</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"><span className="material-symbols-outlined text-[18px]">close</span></button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          {isConnected ? (
            <>
              <div className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-900/20">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <p className="flex-1 text-sm text-emerald-800 dark:text-emerald-200">Conectado · <strong>{existing?.email || existing?.name}</strong>{existing?.timezone ? <> · {existing.timezone}</> : null}</p>
              </div>
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                <p className="font-semibold uppercase tracking-[0.18em]">Webhooks</p>
                <p className="mt-1 leading-relaxed">Los webhooks se configuran en tu Zoom App (Feature → Event Subscriptions). El endpoint a registrar es <code>/webhooks/zoom</code>. Suscríbete a: <code>meeting.started</code>, <code>meeting.ended</code>, <code>recording.completed</code>, <code>recording.transcript_completed</code>.</p>
              </div>
              <div className="mt-3 rounded-2xl border border-black/5 bg-gray-50/50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Probar</p>
                  <button type="button" onClick={() => void handleSync()} disabled={syncStatus === 'syncing'} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] dark:border-white/10 dark:bg-[#171717] dark:text-gray-200">
                    {syncStatus === 'syncing' ? '…' : syncStatus === 'ok' ? '✓ OK' : syncStatus === 'error' ? '⚠' : 'Próximas meetings'}
                  </button>
                </div>
                {syncResult ? (
                  <div className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                    {syncResult.meetings_visible} meetings.
                    {syncResult.sample?.length ? <ul className="mt-1 space-y-0.5">{syncResult.sample.map((m: any) => <li key={m.id} className="truncate">{m.start_time} · {m.topic} ({m.duration}m)</li>)}</ul> : null}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">El AI agent agenda Zoom meetings desde el inbox, recibe los recordings + transcripts vía webhook al terminar la call y crea automáticamente un follow-up con el summary.</p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SCOPES.map(s => (<div key={s.id} className="flex items-center gap-2 rounded-xl border border-black/5 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"><span className="material-symbols-outlined text-[14px] text-sky-600">{s.icon}</span>{s.label}</div>))}
              </div>
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                <p className="font-semibold uppercase tracking-[0.18em]">Antes de instalar</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-relaxed">
                  <li>Necesitas Zoom Pro+ para cloud recordings (transcripts requieren AI Companion)</li>
                  <li>Scopes: <code>meeting:*</code>, <code>recording:read</code>, <code>user:read</code></li>
                  <li>Configura el Webhook Secret Token en <code>ZOOM_WEBHOOK_SECRET_TOKEN</code> y registra <code>/webhooks/zoom</code> en la app</li>
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
              <button type="button" onClick={() => void handleInstall()} disabled={submitting} className="flex items-center gap-2 rounded-full bg-sky-600 px-5 py-2 text-[13px] font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
                {submitting ? <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>Redirigiendo…</> : 'Conectar con Zoom'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ZoomConnectModal;
