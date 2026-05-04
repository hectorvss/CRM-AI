import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';
import { Field, ErrorBox } from './MessengerConnectModal';
import { IntegrationLogo } from './logos';

/**
 * DHL connect modal — DHL-API-Key (Tracking Unified API, required) +
 * optional MyDHL Express username/password for outbound shipping/rates.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  existing?: {
    mydhl_configured?: boolean;
    mydhl_mode?: 'sandbox' | 'production';
    account_number?: string | null;
    webhook_url?: string;
    webhook_registered?: boolean;
    last_health_check_at?: string | null;
    capabilities?: { reads?: string[]; writes?: string[] } | null;
  } | null;
}

const SCOPES_TRACKING = [
  { id: 'track', label: 'Tracking unificado', icon: 'pin_drop' },
  { id: 'multi-service', label: 'Express, Parcel, eCom, Freight', icon: 'inventory_2' },
  { id: 'pod', label: 'Proof of Delivery', icon: 'fact_check' },
];

const SCOPES_EXPRESS = [
  { id: 'rate', label: 'Cotización Express', icon: 'payments' },
  { id: 'ship', label: 'Crear envío + etiqueta', icon: 'qr_code_2' },
  { id: 'pickup', label: 'Reservar recogida', icon: 'event_available' },
  { id: 'address', label: 'Validación de direcciones', icon: 'check_circle' },
];

const DHLConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [apiKey, setApiKey] = useState('');
  const [mydhlUsername, setMydhlUsername] = useState('');
  const [mydhlPassword, setMydhlPassword] = useState('');
  const [mydhlMode, setMydhlMode] = useState<'sandbox' | 'production'>('sandbox');
  const [accountNumber, setAccountNumber] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testTracking, setTestTracking] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'tracking' | 'ok' | 'error'>('idle');
  const [testResult, setTestResult] = useState<any>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setApiKey(''); setMydhlUsername(''); setMydhlPassword(''); setAccountNumber('');
      setMydhlMode(existing?.mydhl_mode === 'production' ? 'production' : 'sandbox');
      setAdvancedOpen(false); setSubmitting(false); setError(null);
      setTestTracking(''); setTestStatus('idle'); setTestResult(null); setTestError(null);
      setCopied(false);
    }
  }, [open, existing?.mydhl_mode]);

  if (!open) return null;
  const isConnected = Boolean(existing?.webhook_registered);

  async function authedFetch(path: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
    return fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token ?? ''}`,
        ...(init?.body && init.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  }

  async function handleConnect() {
    setError(null);
    if (!apiKey) return setError('Tracking API Key es obligatoria');
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/dhl/connect', {
        method: 'POST',
        body: JSON.stringify({
          api_key: apiKey.trim(),
          mydhl_username: mydhlUsername.trim() || undefined,
          mydhl_password: mydhlPassword.trim() || undefined,
          mydhl_mode: mydhlMode,
          account_number: accountNumber.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.details ?? j.error ?? `Error ${res.status}`);
      }
      onChanged?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Connect failed');
    } finally { setSubmitting(false); }
  }

  async function handleTrackTest() {
    if (!testTracking) return;
    setTestStatus('tracking'); setTestError(null); setTestResult(null);
    try {
      const res = await authedFetch('/api/integrations/dhl/track-test', {
        method: 'POST',
        body: JSON.stringify({ tracking_number: testTracking.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.details ?? j.error ?? `${res.status}`);
      setTestResult(j); setTestStatus('ok');
    } catch (err: any) {
      setTestError(err?.message || 'Tracking failed');
      setTestStatus('error');
    }
  }

  async function handleRegenerate() {
    if (!confirm('¿Regenerar el secret del webhook? Tendrás que actualizar la URL en DHL.')) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/dhl/regenerate-webhook-secret', { method: 'POST' });
      if (!res.ok) throw new Error();
      onChanged?.();
    } finally { setSubmitting(false); }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar DHL?')) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/dhl/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error();
      onChanged?.(); onClose();
    } finally { setSubmitting(false); }
  }

  function copyWebhookUrl() {
    if (!existing?.webhook_url) return;
    navigator.clipboard.writeText(existing.webhook_url);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#171717]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFCC00] text-[#D40511] shadow-sm">
              <IntegrationLogo id="dhl" size={22} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Integración</p>
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">DHL</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Tracking unificado · Express rates + shipping</p>
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
                  Conectado · tracking activo
                  {existing?.mydhl_configured ? <> · MyDHL Express ({existing.mydhl_mode})</> : null}
                  {existing?.account_number ? <> · cuenta <strong>{existing.account_number}</strong></> : null}
                </p>
              </div>

              <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Webhook URL para DHL Push</p>
                  <button type="button" onClick={copyWebhookUrl} className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:bg-[#171717] dark:text-gray-200 dark:hover:bg-white/5">
                    {copied ? '✓ Copiado' : 'Copiar'}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  Configura una subscription en DHL → Tracking Push API y pega esta URL.
                </p>
                <code className="mt-2 block break-all rounded-xl bg-gray-50 px-2.5 py-2 text-[11px] text-gray-700 dark:bg-white/5 dark:text-gray-200">
                  {existing?.webhook_url}
                </code>
                <button type="button" onClick={() => void handleRegenerate()} disabled={submitting} className="mt-2 text-[11px] font-medium text-[#D40511] underline-offset-2 hover:underline disabled:opacity-50">
                  Regenerar secret
                </button>
              </div>

              <div className="mt-3 rounded-2xl border border-black/5 bg-gray-50/50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Probar tracking</p>
                <div className="mt-2 flex gap-2">
                  <input value={testTracking} onChange={(e) => setTestTracking(e.target.value)} placeholder="JD0140… o número AWB" className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white" />
                  <button type="button" onClick={() => void handleTrackTest()} disabled={!testTracking || testStatus === 'tracking'} className="rounded-full border border-black/10 bg-white px-3 py-2 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-gray-200 dark:hover:bg-white/5">
                    {testStatus === 'tracking' ? 'Buscando…' : testStatus === 'ok' ? '✓ OK' : testStatus === 'error' ? '⚠ Error' : 'Track'}
                  </button>
                </div>
                {testResult ? (
                  <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-200">
                    <p><strong>{testResult.status}</strong>{testResult.service ? ` · ${testResult.service}` : ''}</p>
                    {testResult.origin || testResult.destination ? (
                      <p>{testResult.origin ?? '—'} → {testResult.destination ?? '—'}</p>
                    ) : null}
                    {testResult.estimated_delivery ? <p>Entrega prevista: {testResult.estimated_delivery}</p> : null}
                    {testResult.latest_event ? <p className="mt-1 truncate">{testResult.latest_event.description}</p> : null}
                  </div>
                ) : null}
                {testError ? <ErrorBox text={testError} /> : null}
              </div>

              <div className="mt-3 rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Capacidades activas</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(existing?.capabilities?.reads ?? []).map((c) => (
                    <span key={`r-${c}`} className="rounded-full border border-black/5 bg-gray-50 px-2 py-0.5 text-[10px] text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">{c}</span>
                  ))}
                  {(existing?.capabilities?.writes ?? []).map((c) => (
                    <span key={`w-${c}`} className="rounded-full border border-yellow-300/60 bg-yellow-50 px-2 py-0.5 text-[10px] text-yellow-900 dark:border-yellow-700/50 dark:bg-yellow-900/20 dark:text-yellow-200">{c}</span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Empieza con la <strong>Tracking Unified API</strong> (gratuita) en{' '}
                <a href="https://developer.dhl.com/api-reference/shipment-tracking" target="_blank" rel="noreferrer" className="underline">developer.dhl.com</a>{' '}
                — sólo necesitas el DHL-API-Key. Si vas a crear envíos con DHL Express añade abajo MyDHL.
              </p>

              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Tracking</p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SCOPES_TRACKING.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-xl border border-black/5 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                    <span className="material-symbols-outlined text-[14px] text-[#D40511]">{s.icon}</span>
                    {s.label}
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-3">
                <Field label="DHL-API-Key (Tracking)" value={apiKey} onChange={setApiKey} type="password" placeholder="DHL Tracking Unified API key" autoFocus />
              </div>

              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className="mt-5 flex w-full items-center justify-between text-left text-[12px] font-medium text-gray-500 transition hover:text-gray-950 dark:hover:text-white"
              >
                <span>Avanzado · DHL Express MyDHL (rates, ship, label, pickups)</span>
                <span className="material-symbols-outlined text-[16px]">
                  {advancedOpen ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {advancedOpen ? (
                <div className="mt-3 space-y-3 rounded-2xl border border-black/5 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Usa el username + password que DHL Express te dio al firmar el contrato. Si sólo quieres tracking puedes saltarte esto.
                  </p>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Capacidades extra</p>
                  <div className="mt-1 grid grid-cols-2 gap-1.5">
                    {SCOPES_EXPRESS.map((s) => (
                      <div key={s.id} className="flex items-center gap-1.5 rounded-xl border border-black/5 bg-white px-2 py-1.5 text-[11px] text-gray-700 dark:border-white/10 dark:bg-[#171717] dark:text-gray-200">
                        <span className="material-symbols-outlined text-[12px] text-[#D40511]">{s.icon}</span>
                        {s.label}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2 rounded-xl border border-black/5 bg-white p-1 dark:border-white/10 dark:bg-[#171717]">
                    <button type="button" onClick={() => setMydhlMode('sandbox')} className={`rounded-lg px-2 py-1.5 text-[11px] font-medium transition ${mydhlMode === 'sandbox' ? 'bg-black text-white dark:bg-white dark:text-black' : 'text-gray-600 dark:text-gray-300'}`}>
                      Sandbox
                    </button>
                    <button type="button" onClick={() => setMydhlMode('production')} className={`rounded-lg px-2 py-1.5 text-[11px] font-medium transition ${mydhlMode === 'production' ? 'bg-black text-white dark:bg-white dark:text-black' : 'text-gray-600 dark:text-gray-300'}`}>
                      Production
                    </button>
                  </div>
                  <Field label="MyDHL Username" value={mydhlUsername} onChange={setMydhlUsername} placeholder="DHL Express username" />
                  <Field label="MyDHL Password" value={mydhlPassword} onChange={setMydhlPassword} type="password" placeholder="DHL Express password" />
                  <Field label="Account Number (opcional)" value={accountNumber} onChange={setAccountNumber} placeholder="9-digit DHL Express account" />
                </div>
              ) : null}

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
              <button type="button" onClick={() => void handleConnect()} disabled={submitting || !apiKey} className="flex items-center gap-2 rounded-full bg-[#D40511] px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#B0040E] disabled:opacity-50">
                {submitting ? <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>Validando…</> : 'Validar y conectar'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DHLConnectModal;
