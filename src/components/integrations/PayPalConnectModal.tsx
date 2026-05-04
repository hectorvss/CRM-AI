import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';
import { IntegrationLogo } from './logos';

/**
 * PayPal connect modal — Client Credentials (API-key based).
 *
 * Step 1: pick Sandbox or Live, paste Client ID + Secret. We mint a token
 * to validate the creds before persisting.
 * Step 2: confirmation with merchant_email + auto-registered webhook.
 *
 * No OAuth redirect because PayPal's Client Credentials is server-to-
 * server. Merchant gets the values from developer.paypal.com.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  existing?: {
    mode?: 'sandbox' | 'live';
    app_id?: string;
    merchant_email?: string;
    webhook_id?: string;
    webhook_url?: string;
    webhook_registered?: boolean;
    webhook_registration_error?: string | null;
    last_health_check_at?: string | null;
    capabilities?: { reads?: string[]; writes?: string[] } | null;
  } | null;
}

const SCOPES_HUMAN = [
  { id: 'orders', label: 'Orders / checkout', icon: 'shopping_cart' },
  { id: 'captures', label: 'Cobros', icon: 'paid' },
  { id: 'refunds', label: 'Reembolsos', icon: 'undo' },
  { id: 'disputes', label: 'Disputas', icon: 'gavel' },
  { id: 'subscriptions', label: 'Suscripciones', icon: 'autorenew' },
  { id: 'invoices', label: 'Facturas', icon: 'receipt_long' },
];

const PayPalConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [mode, setMode] = useState<'sandbox' | 'live'>('live');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  useEffect(() => {
    if (open) {
      setClientId('');
      setClientSecret('');
      setMode(existing?.mode === 'sandbox' ? 'sandbox' : 'live');
      setSubmitting(false);
      setError(null);
      setTestStatus('idle');
    }
  }, [open, existing?.mode]);

  if (!open) return null;
  const isConnected = Boolean(existing?.app_id);

  async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
    return fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token ?? ''}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  }

  async function handleConnect() {
    setError(null);
    if (!clientId) return setError('Client ID required');
    if (!clientSecret) return setError('Client Secret required');
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/paypal/connect', {
        method: 'POST',
        body: JSON.stringify({
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
          mode,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.paypalMessage || j.error || `Server error ${res.status}`);
      }
      onChanged?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'No se pudo conectar PayPal');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar PayPal? Eliminaremos el webhook y dejaremos de recibir eventos.')) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/paypal/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      onChanged?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'No se pudo desconectar');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendTest() {
    setTestStatus('sending');
    try {
      const res = await authedFetch('/api/integrations/paypal/send-test', { method: 'POST' });
      if (!res.ok) throw new Error(`${res.status}`);
      setTestStatus('sent');
      setTimeout(() => setTestStatus('idle'), 3000);
    } catch {
      setTestStatus('error');
      setTimeout(() => setTestStatus('idle'), 3000);
    }
  }

  async function handleRegisterWebhook() {
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/paypal/register-webhook', { method: 'POST' });
      if (!res.ok) throw new Error(`${res.status}`);
      onChanged?.();
    } catch (err: any) {
      setError(err?.message || 'No se pudo registrar el webhook');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#171717]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#003087] text-white shadow-sm">
              <svg viewBox="0 0 124 33" width="22" height="22" aria-hidden="true">
                <text x="0" y="22" fill="#fff" fontFamily="Helvetica, Arial, sans-serif" fontSize="22" fontWeight="700" letterSpacing="-1">
                  P<tspan fill="#009cde">P</tspan>
                </text>
              </svg>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Integración</p>
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">PayPal</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Pagos, suscripciones, disputas, facturas</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          {isConnected ? (
            // ── Connected ────────────────────────────────────────────────
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-900/20">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <p className="flex-1 text-sm text-emerald-800 dark:text-emerald-200">
                  Conectado a <strong>{existing?.merchant_email || existing?.app_id}</strong>
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    existing?.mode === 'live'
                      ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                  }`}
                >
                  {existing?.mode === 'live' ? 'Live' : 'Sandbox'}
                </span>
              </div>

              <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Capacidades</p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {SCOPES_HUMAN.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-xl bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700 dark:bg-white/5 dark:text-gray-200">
                      <span className="material-symbols-outlined text-[14px] text-gray-500">{s.icon}</span>
                      {s.label}
                    </div>
                  ))}
                </div>
                {existing?.last_health_check_at ? (
                  <p className="mt-3 text-[11px] text-gray-400">
                    Última verificación: {new Date(existing.last_health_check_at).toLocaleString()}
                  </p>
                ) : null}
              </div>

              <div className="mt-3 rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Webhook</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    existing?.webhook_registered
                      ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                  }`}>
                    {existing?.webhook_registered ? 'Registrado' : 'No registrado'}
                  </span>
                </div>
                {existing?.webhook_url ? (
                  <p className="mt-2 truncate text-[11px] font-mono text-gray-600 dark:text-gray-300">{existing.webhook_url}</p>
                ) : null}
                {existing?.webhook_registration_error ? (
                  <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                    {existing.webhook_registration_error}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleRegisterWebhook()}
                  disabled={submitting}
                  className="mt-3 w-full rounded-full border border-black/10 bg-white px-4 py-2 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-gray-200 dark:hover:bg-white/5"
                >
                  {existing?.webhook_registered ? 'Re-registrar webhook' : 'Registrar webhook'}
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-black/5 bg-gray-50/50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                <div>
                  <p className="text-sm font-medium text-gray-950 dark:text-white">Llamada de prueba</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Lista las disputas más recientes para confirmar que la API responde.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSendTest()}
                  disabled={testStatus === 'sending'}
                  className="rounded-full border border-black/10 bg-white px-4 py-2 text-[12px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-gray-200 dark:hover:bg-white/5"
                >
                  {testStatus === 'sending' ? 'Probando…' :
                   testStatus === 'sent' ? '✓ OK' :
                   testStatus === 'error' ? '⚠ Error' : 'Probar'}
                </button>
              </div>
            </>
          ) : (
            // ── Connect form ────────────────────────────────────────────
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Conexión vía Client Credentials. Crea (o usa) una app en{' '}
                <a href="https://developer.paypal.com/dashboard/applications" target="_blank" rel="noreferrer" className="underline">
                  developer.paypal.com
                </a>{' '}
                y pega sus credenciales aquí.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SCOPES_HUMAN.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-xl border border-black/5 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                    <span className="material-symbols-outlined text-[14px] text-[#009cde]">{s.icon}</span>
                    {s.label}
                  </div>
                ))}
              </div>

              {/* Mode toggle */}
              <div className="mt-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Entorno
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMode('sandbox')}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      mode === 'sandbox'
                        ? 'border-gray-950 bg-gray-50 dark:border-white dark:bg-white/5'
                        : 'border-black/10 bg-white hover:bg-gray-50 dark:border-white/10 dark:bg-[#1b1b1b] dark:hover:bg-white/5'
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-950 dark:text-white">Sandbox</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Para pruebas con cuentas test</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('live')}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      mode === 'live'
                        ? 'border-gray-950 bg-gray-50 dark:border-white dark:bg-white/5'
                        : 'border-black/10 bg-white hover:bg-gray-50 dark:border-white/10 dark:bg-[#1b1b1b] dark:hover:bg-white/5'
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-950 dark:text-white">Live</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Producción · pagos reales</p>
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Client ID
                  </label>
                  <input
                    autoFocus
                    autoComplete="off"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder={mode === 'live' ? 'AY-...' : 'Aa-...'}
                    className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white dark:focus:border-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Client Secret
                  </label>
                  <input
                    type="password"
                    autoComplete="off"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder="EJ-..."
                    className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white dark:focus:border-white"
                  />
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                <p className="font-semibold uppercase tracking-[0.18em]">Cómo obtenerlas</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-relaxed">
                  <li>Entra en <a href="https://developer.paypal.com/dashboard/applications" target="_blank" rel="noreferrer" className="underline">developer.paypal.com</a></li>
                  <li>Cambia a la pestaña <strong>{mode === 'live' ? 'Live' : 'Sandbox'}</strong></li>
                  <li>Selecciona o crea una app REST</li>
                  <li>Copia <strong>Client ID</strong> y <strong>Secret</strong></li>
                </ol>
              </div>

              {error ? (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
                  {error}
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-black/5 bg-gray-50/50 px-6 py-4 dark:border-white/10 dark:bg-white/[0.02]">
          {isConnected ? (
            <>
              <button
                type="button"
                onClick={() => void handleDisconnect()}
                disabled={submitting}
                className="rounded-full px-4 py-2 text-[13px] font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20"
              >
                Desconectar
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full bg-black px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
              >
                Hecho
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full px-4 py-2 text-[13px] font-medium text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConnect()}
                disabled={submitting || !clientId || !clientSecret}
                className="flex items-center gap-2 rounded-full bg-[#003087] px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#001f5c] disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                    Validando…
                  </>
                ) : (
                  'Validar y conectar'
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PayPalConnectModal;
