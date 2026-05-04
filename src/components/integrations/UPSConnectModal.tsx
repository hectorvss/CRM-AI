import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';
import { Field, ErrorBox } from './MessengerConnectModal';
import { IntegrationLogo } from './logos';

/**
 * UPS connect modal — Client ID + Secret + sandbox/production. We validate
 * by minting an OAuth token, generate a per-tenant webhook credential the
 * merchant must paste into UPS Developer Portal → Track API push notifications,
 * and surface tracking-test + status.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  existing?: {
    mode?: 'sandbox' | 'production';
    account_number?: string | null;
    shipper_number?: string | null;
    webhook_url?: string;
    webhook_registered?: boolean;
    last_health_check_at?: string | null;
    capabilities?: { reads?: string[]; writes?: string[]; webhook_events?: string[] } | null;
  } | null;
}

const SCOPES = [
  { id: 'tracking', label: 'Tracking en vivo', icon: 'pin_drop' },
  { id: 'rates', label: 'Cotización de tarifas', icon: 'payments' },
  { id: 'transit', label: 'Time-in-transit', icon: 'schedule' },
  { id: 'addresses', label: 'Validación direcciones', icon: 'check_circle' },
  { id: 'shipments', label: 'Crear envíos + etiquetas', icon: 'qr_code_2' },
  { id: 'locator', label: 'Access Points / drop-off', icon: 'place' },
];

const UPSConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [mode, setMode] = useState<'sandbox' | 'production'>('sandbox');
  const [accountNumber, setAccountNumber] = useState('');
  const [shipperNumber, setShipperNumber] = useState('');
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
      setClientId(''); setClientSecret(''); setAccountNumber(''); setShipperNumber('');
      setMode(existing?.mode === 'production' ? 'production' : 'sandbox');
      setAdvancedOpen(false); setSubmitting(false); setError(null);
      setTestTracking(''); setTestStatus('idle'); setTestResult(null); setTestError(null);
      setCopied(false);
    }
  }, [open, existing?.mode]);

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
    if (!clientId || !clientSecret) return setError('Client ID y Secret son obligatorios');
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/ups/connect', {
        method: 'POST',
        body: JSON.stringify({
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
          mode,
          account_number: accountNumber.trim() || undefined,
          shipper_number: shipperNumber.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.upsMessage || j.error || `Error ${res.status}`);
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
      const res = await authedFetch('/api/integrations/ups/track-test', {
        method: 'POST',
        body: JSON.stringify({ tracking_number: testTracking.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.details || j.error || `${res.status}`);
      setTestResult(j); setTestStatus('ok');
    } catch (err: any) {
      setTestError(err?.message || 'Tracking failed');
      setTestStatus('error');
    }
  }

  async function handleRegenerate() {
    if (!confirm('¿Regenerar la URL del webhook? Tendrás que pegar la nueva URL en UPS Developer Portal.')) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/ups/regenerate-webhook-credential', { method: 'POST' });
      if (!res.ok) throw new Error();
      onChanged?.();
    } finally { setSubmitting(false); }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar UPS? Dejaremos de recibir tracking events.')) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/ups/disconnect', { method: 'POST' });
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
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#5F3F1F] text-[#FFC107] shadow-sm">
              <IntegrationLogo id="ups" size={22} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Integración</p>
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">UPS</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Tracking, rates, address validation, labels</p>
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
                  Conectado · entorno <strong>{existing?.mode}</strong>
                  {existing?.account_number ? <> · cuenta <strong>{existing.account_number}</strong></> : null}
                </p>
              </div>

              <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Webhook URL para UPS Track Push</p>
                  <button type="button" onClick={copyWebhookUrl} className="rounded-full border border-black/10 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:bg-[#171717] dark:text-gray-200 dark:hover:bg-white/5">
                    {copied ? '✓ Copiado' : 'Copiar'}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  Pégala en UPS Developer Portal → Tracking → Subscriptions → Destination URL.
                </p>
                <code className="mt-2 block break-all rounded-xl bg-gray-50 px-2.5 py-2 text-[11px] text-gray-700 dark:bg-white/5 dark:text-gray-200">
                  {existing?.webhook_url}
                </code>
                <button type="button" onClick={() => void handleRegenerate()} disabled={submitting} className="mt-2 text-[11px] font-medium text-amber-700 underline-offset-2 hover:underline disabled:opacity-50 dark:text-amber-400">
                  Regenerar credencial
                </button>
              </div>

              <div className="mt-3 rounded-2xl border border-black/5 bg-gray-50/50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Probar tracking</p>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  Pega un número 1Z… para verificar que la API responde con datos.
                </p>
                <div className="mt-2 flex gap-2">
                  <input value={testTracking} onChange={(e) => setTestTracking(e.target.value)} placeholder="1Z9999W99999999999" className="flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white" />
                  <button type="button" onClick={() => void handleTrackTest()} disabled={!testTracking || testStatus === 'tracking'} className="rounded-full border border-black/10 bg-white px-3 py-2 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-gray-200 dark:hover:bg-white/5">
                    {testStatus === 'tracking' ? 'Buscando…' : testStatus === 'ok' ? '✓ OK' : testStatus === 'error' ? '⚠ Error' : 'Track'}
                  </button>
                </div>
                {testResult ? (
                  <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-200">
                    <p><strong>{testResult.status}</strong>{testResult.service ? ` · ${testResult.service}` : ''}</p>
                    {testResult.scheduled_delivery ? <p>Entrega prevista: {testResult.scheduled_delivery}</p> : null}
                    {testResult.latest_event ? <p className="mt-1 truncate">{testResult.latest_event.description} {testResult.latest_event.location ? `· ${testResult.latest_event.location}` : ''}</p> : null}
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
                    <span key={`w-${c}`} className="rounded-full border border-amber-300/60 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-200">{c}</span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Crea una app en{' '}
                <a href="https://developer.ups.com/my-apps" target="_blank" rel="noreferrer" className="underline">developer.ups.com → My Apps</a>{' '}
                con el flujo OAuth Client Credentials y copia el Client ID + Secret.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SCOPES.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-xl border border-black/5 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                    <span className="material-symbols-outlined text-[14px] text-amber-700">{s.icon}</span>
                    {s.label}
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                <p className="font-semibold uppercase tracking-[0.18em]">Cómo conectar</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-relaxed">
                  <li>UPS Developer Portal → Apps → Add Apps → "I want to integrate UPS technology into my business"</li>
                  <li>Pide acceso a <strong>Tracking, Rating, Address Validation, Shipping</strong></li>
                  <li>Genera Client ID + Client Secret</li>
                  <li>Pega aquí abajo y elige sandbox / production</li>
                </ol>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-black/5 bg-gray-50/50 p-2 dark:border-white/10 dark:bg-white/[0.03]">
                <button type="button" onClick={() => setMode('sandbox')} className={`rounded-xl px-3 py-2 text-[12px] font-medium transition ${mode === 'sandbox' ? 'bg-black text-white dark:bg-white dark:text-black' : 'text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white'}`}>
                  Sandbox (CIE)
                </button>
                <button type="button" onClick={() => setMode('production')} className={`rounded-xl px-3 py-2 text-[12px] font-medium transition ${mode === 'production' ? 'bg-black text-white dark:bg-white dark:text-black' : 'text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white'}`}>
                  Production
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <Field label="Client ID" value={clientId} onChange={setClientId} placeholder="UPS Client ID" autoFocus />
                <Field label="Client Secret" value={clientSecret} onChange={setClientSecret} type="password" placeholder="UPS Client Secret" />
              </div>

              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className="mt-5 flex w-full items-center justify-between text-left text-[12px] font-medium text-gray-500 transition hover:text-gray-950 dark:hover:text-white"
              >
                <span>Avanzado · account number + shipper number (opcional, sólo para shipping)</span>
                <span className="material-symbols-outlined text-[16px]">
                  {advancedOpen ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {advancedOpen ? (
                <div className="mt-3 space-y-3 rounded-2xl border border-black/5 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Sólo si vas a crear envíos / generar etiquetas. Para tracking-only no hace falta.
                  </p>
                  <Field label="Account Number" value={accountNumber} onChange={setAccountNumber} placeholder="6-digit UPS account" />
                  <Field label="Shipper Number" value={shipperNumber} onChange={setShipperNumber} placeholder="por defecto = account number" />
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
              <button type="button" onClick={() => void handleConnect()} disabled={submitting || !clientId || !clientSecret} className="flex items-center gap-2 rounded-full bg-amber-600 px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50">
                {submitting ? <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>Validando…</> : 'Validar y conectar'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default UPSConnectModal;
