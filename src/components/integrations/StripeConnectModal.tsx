import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';

/**
 * Two-track Stripe connect UX (mirrors ShopifyConnectModal).
 *
 * Track 1 — Stripe Connect (default, recommended): one click, the merchant
 * approves on Stripe's hosted page, we receive an offline access token tied
 * to their Stripe account, plus a programmatically-registered webhook
 * endpoint with all the events the SaaS reacts to.
 *
 * Track 2 — Manual API key (advanced fallback): merchant pastes a restricted
 * or full secret key (rk_live_... / sk_live_...) and a webhook signing
 * secret. We hit /account to validate, then store.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  existing?: {
    stripe_user_id?: string;
    publishable_key?: string;
    scope?: string;
    livemode?: boolean;
    last_health_check_at?: string | null;
    capabilities?: { reads?: string[]; writes?: string[]; webhook_events?: string[] } | null;
  } | null;
}

const SCOPES_HUMAN = [
  { id: 'payments', label: 'Pagos', icon: 'credit_card' },
  { id: 'refunds', label: 'Reembolsos', icon: 'undo' },
  { id: 'disputes', label: 'Disputas', icon: 'gavel' },
  { id: 'subscriptions', label: 'Suscripciones', icon: 'autorenew' },
  { id: 'invoices', label: 'Facturas', icon: 'receipt_long' },
  { id: 'customers', label: 'Clientes', icon: 'group' },
  { id: 'payouts', label: 'Payouts', icon: 'account_balance' },
  { id: 'products', label: 'Productos', icon: 'inventory_2' },
];

const StripeConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [secretKey, setSecretKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSecretKey('');
      setWebhookSecret('');
      setAdvancedOpen(false);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const isConnected = Boolean(existing?.stripe_user_id);

  async function handleOAuthInstall() {
    setError(null);
    setSubmitting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setError('Sesión expirada — vuelve a iniciar sesión.');
        setSubmitting(false);
        return;
      }
      const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
      const res = await fetch(`${apiBase}/api/integrations/stripe/install`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Server error ${res.status}`);
      }
      const { url } = await res.json();
      window.location.assign(url);
    } catch (err: any) {
      setError(err?.message || 'No se pudo iniciar la conexión con Stripe');
      setSubmitting(false);
    }
  }

  async function handleManualSave() {
    setError(null);
    if (!secretKey.startsWith('sk_') && !secretKey.startsWith('rk_')) {
      setError('La clave debe empezar por "sk_" (secret) o "rk_" (restricted)');
      return;
    }
    if (webhookSecret && !webhookSecret.startsWith('whsec_')) {
      setError('El webhook secret debe empezar por "whsec_"');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
      const res = await fetch(`${apiBase}/api/integrations/stripe/manual-connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ secret_key: secretKey, webhook_secret: webhookSecret }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Server error ${res.status}`);
      }
      onChanged?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'No se pudo guardar la conexión manual');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar Stripe? Cancelará el acceso de la app pero no afectará pagos ni datos en Stripe.')) return;
    setSubmitting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
      const res = await fetch(`${apiBase}/api/integrations/stripe/disconnect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      onChanged?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'No se pudo desconectar');
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
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#635BFF] text-white shadow-sm">
              <span className="material-symbols-outlined text-[22px]">payments</span>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Integración</p>
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Stripe</h2>
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
        <div className="px-6 py-5">
          {isConnected ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-900/20">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <p className="flex-1 text-sm text-emerald-800 dark:text-emerald-200">
                  Conectado a <strong>{existing?.stripe_user_id}</strong>
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    existing?.livemode
                      ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                  }`}
                >
                  {existing?.livemode ? 'Live' : 'Test mode'}
                </span>
              </div>
              <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                  Permisos concedidos
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {SCOPES_HUMAN.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 rounded-xl bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700 dark:bg-white/5 dark:text-gray-200"
                    >
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
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Conecta tu cuenta de Stripe para que el agente pueda gestionar pagos, reembolsos, disputas, suscripciones, facturas y payouts directamente desde la conversación.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SCOPES_HUMAN.slice(0, 8).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded-xl border border-black/5 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
                  >
                    <span className="material-symbols-outlined text-[14px] text-[#635BFF]">{s.icon}</span>
                    {s.label}
                  </div>
                ))}
              </div>

              {error ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
                  {error}
                </div>
              ) : null}

              {/* Advanced */}
              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className="mt-5 flex w-full items-center justify-between text-left text-[12px] font-medium text-gray-500 transition hover:text-gray-950 dark:hover:text-white"
              >
                <span>Avanzado · usar secret key directamente en vez de OAuth</span>
                <span className="material-symbols-outlined text-[16px]">
                  {advancedOpen ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {advancedOpen ? (
                <div className="mt-3 space-y-3 rounded-2xl border border-black/5 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Solo si tu cuenta no se puede conectar vía OAuth (p. ej. una restricted key generada para esta app). Verificamos la clave llamando a <code className="rounded bg-white px-1 dark:bg-[#1b1b1b]">/v1/account</code> antes de guardarla.
                  </p>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Secret key
                    </label>
                    <input
                      type="password"
                      autoComplete="off"
                      value={secretKey}
                      onChange={(e) => setSecretKey(e.target.value)}
                      placeholder="sk_live_... o rk_live_..."
                      className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white dark:focus:border-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Webhook signing secret
                    </label>
                    <input
                      type="password"
                      autoComplete="off"
                      value={webhookSecret}
                      onChange={(e) => setWebhookSecret(e.target.value)}
                      placeholder="whsec_..."
                      className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white dark:focus:border-white"
                    />
                    <p className="mt-1 text-[11px] text-gray-400">
                      Crea un endpoint en Stripe Dashboard → Developers → Webhooks apuntando a{' '}
                      <code className="rounded bg-white px-1 dark:bg-[#1b1b1b]">/webhooks/stripe</code> y pega el signing secret.
                    </p>
                  </div>
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleOAuthInstall()}
                  disabled={submitting}
                  className="rounded-full border border-black/10 px-4 py-2 text-[13px] font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
                >
                  Reconectar
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full bg-black px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
                >
                  Hecho
                </button>
              </div>
            </>
          ) : advancedOpen ? (
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
                onClick={() => void handleManualSave()}
                disabled={submitting || !secretKey}
                className="rounded-full bg-black px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-black/90 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/90"
              >
                {submitting ? 'Verificando…' : 'Guardar credenciales'}
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
                onClick={() => void handleOAuthInstall()}
                disabled={submitting}
                className="flex items-center gap-2 rounded-full bg-[#635BFF] px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#5249e0] disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                    Abriendo Stripe…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                    Conectar con Stripe
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default StripeConnectModal;
