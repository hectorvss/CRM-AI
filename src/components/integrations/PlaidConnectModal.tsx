import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';
import { ErrorBox } from './MessengerConnectModal';
import { IntegrationLogo } from './logos';

interface Props { open: boolean; onClose: () => void; onChanged?: () => void; existing?: { environment?: string | null; webhook_token?: string | null; capabilities?: any | null } | null }

const SCOPES = [
  { id: 'auth',    label: 'Auth · ACH/IBAN account + routing',     icon: 'verified_user' },
  { id: 'ident',   label: 'Identity · KYC verification',            icon: 'badge' },
  { id: 'bal',     label: 'Balance · real-time available',          icon: 'account_balance_wallet' },
  { id: 'tx',      label: 'Transactions · 24 months history',        icon: 'receipt_long' },
  { id: 'link',    label: 'Plaid Link · client-side onboarding',    icon: 'link' },
  { id: 'wh',      label: 'Webhooks · ITEM_LOGIN_REQUIRED, etc.',    icon: 'graph_2' },
];

const PlaidConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [environment, setEnvironment] = useState<'sandbox' | 'development' | 'production'>('sandbox');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  useEffect(() => { if (open) { setSubmitting(false); setError(null); setClientId(''); setSecret(''); setEnvironment('sandbox'); setSyncStatus('idle'); } }, [open]);
  if (!open) return null;
  const isConnected = Boolean(existing?.environment);

  async function authedFetch(path: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession(); const token = data.session?.access_token;
    const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
    return fetch(`${apiBase}${path}`, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token ?? ''}`, Accept: 'application/json', ...(init?.body && init.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) } });
  }
  async function handleConnect() {
    if (!clientId.trim() || !secret.trim()) { setError('client_id y secret requeridos'); return; }
    setError(null); setSubmitting(true);
    try { const res = await authedFetch('/api/integrations/plaid/connect', { method: 'POST', body: JSON.stringify({ client_id: clientId.trim(), secret: secret.trim(), environment }) }); if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || j.details || `${res.status}`); } onChanged?.(); onClose(); }
    catch (err: any) { setError(err?.message); }
    finally { setSubmitting(false); }
  }
  async function handleSync() {
    setSyncStatus('syncing');
    try { const res = await authedFetch('/api/integrations/plaid/sync', { method: 'POST' }); const j = await res.json(); if (!res.ok || !j.ok) throw new Error(); setSyncStatus('ok'); } catch { setSyncStatus('error'); }
  }
  async function handleDisconnect() {
    if (!confirm('¿Desconectar Plaid?')) return;
    setSubmitting(true);
    try { const res = await authedFetch('/api/integrations/plaid/disconnect', { method: 'POST' }); if (!res.ok) throw new Error(); onChanged?.(); onClose(); }
    finally { setSubmitting(false); }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#171717]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm"><IntegrationLogo id="plaid" size={22} /></div>
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Finance · Banking</p><h2 className="text-lg font-semibold text-gray-950 dark:text-white">Plaid</h2><p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Bank verification · KYC · ACH/IBAN · transactions</p></div>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5"><span className="material-symbols-outlined text-[18px]">close</span></button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          {isConnected ? (
            <>
              <div className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-900/20"><span className="h-2 w-2 rounded-full bg-emerald-500" /><p className="flex-1 text-sm text-emerald-800 dark:text-emerald-200">Conectado · environment <strong>{existing?.environment}</strong></p></div>
              {existing?.webhook_token ? (<div className="mb-3 rounded-2xl border border-black/5 bg-gray-50/50 p-3 dark:border-white/10 dark:bg-white/[0.03]"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Webhook URL</p><code className="mt-1 block break-all text-[11px] text-gray-700 dark:text-gray-200">/webhooks/plaid/{existing.webhook_token}</code><p className="mt-1 text-[10px] text-gray-500">Configura esta URL en Plaid Dashboard → Team Settings → Webhooks.</p></div>) : null}
              <div className="rounded-2xl border border-black/5 bg-gray-50/50 p-4 dark:border-white/10 dark:bg-white/[0.03]"><div className="flex items-center justify-between"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Probar</p><button type="button" onClick={() => void handleSync()} disabled={syncStatus === 'syncing'} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] dark:border-white/10 dark:bg-[#171717] dark:text-gray-200">{syncStatus === 'syncing' ? '…' : syncStatus === 'ok' ? '✓ OK' : syncStatus === 'error' ? '⚠' : 'Healthcheck'}</button></div></div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">Plaid usa client_id + secret a nivel tenant. El AI agent genera Link tokens para tus customers, intercambia public_tokens y consulta accounts/identity/balance/transactions con el access_token resultante.</p>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{SCOPES.map(s => (<div key={s.id} className="flex items-center gap-2 rounded-xl border border-black/5 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"><span className="material-symbols-outlined text-[14px] text-slate-900 dark:text-white">{s.icon}</span>{s.label}</div>))}</div>
              <div className="mt-4 space-y-3">
                <label className="block"><span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Client ID *</span><input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="65a..." className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white" /></label>
                <label className="block"><span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Secret *</span><input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="••••••••" className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white" /></label>
                <label className="block"><span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Environment *</span><select value={environment} onChange={(e) => setEnvironment(e.target.value as any)} className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white"><option value="sandbox">sandbox (free, fake data)</option><option value="development">development (100 live items)</option><option value="production">production</option></select></label>
              </div>
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200"><p className="font-semibold uppercase tracking-[0.18em]">Antes de conectar</p><ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-relaxed"><li>Plaid Dashboard → Team Settings → Keys: copia client_id + el secret correcto al environment</li><li>Validamos las credenciales con un /categories/get healthcheck</li><li>Configura la webhook URL después de conectar</li></ol></div>
              {error ? <ErrorBox text={error} /> : null}
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-black/5 bg-gray-50/50 px-6 py-4 dark:border-white/10 dark:bg-white/[0.02]">
          {isConnected ? (<><button type="button" onClick={() => void handleDisconnect()} disabled={submitting} className="rounded-full px-4 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20">Desconectar</button><button type="button" onClick={onClose} className="rounded-full bg-black px-5 py-2 text-[13px] font-semibold text-white dark:bg-white dark:text-black">Hecho</button></>) : (<><button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-[13px] font-medium text-gray-600 hover:text-gray-950 dark:text-gray-300">Cancelar</button><button type="button" onClick={() => void handleConnect()} disabled={submitting || !clientId.trim() || !secret.trim()} className="flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-[13px] font-semibold text-white hover:bg-black disabled:opacity-50">{submitting ? <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>Conectando…</> : 'Conectar'}</button></>)}
        </div>
      </div>
    </div>
  );
};

export default PlaidConnectModal;
