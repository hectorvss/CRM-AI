import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';

/**
 * Two-track Shopify connect UX.
 *
 * Track 1 — OAuth (default, recommended): user types `shop.myshopify.com`,
 * we hit `/api/integrations/shopify/install` which redirects them through
 * Shopify's grant page; the callback handler upserts the connector row and
 * subscribes to all relevant webhooks. One-click for the merchant.
 *
 * Track 2 — Manual (fallback for stores that prefer a Custom App): user
 * pastes Admin API access token + webhook secret directly. We POST those to
 * `/api/connectors/:id` to upsert the auth_config. Shown behind an "Advanced"
 * expander so 95% of merchants never see it.
 *
 * The modal is intentionally chrome-light to match the Settings/Upgrade
 * design language used elsewhere.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  /** When the user disconnects we ask the parent to refetch; same pattern as save. */
  onChanged?: () => void;
  /** Existing connector row (if connected). Drives the "Connected" state UI. */
  existing?: {
    id?: string;
    shop_domain?: string;
    scope?: string;
    auth_type?: string;
    last_health_check_at?: string | null;
    capabilities?: { reads?: string[]; writes?: string[]; webhooks?: string[] } | null;
  } | null;
}

const SCOPES_HUMAN = [
  { id: 'orders', label: 'Pedidos', icon: 'shopping_bag' },
  { id: 'customers', label: 'Clientes', icon: 'group' },
  { id: 'products', label: 'Productos', icon: 'inventory_2' },
  { id: 'fulfillments', label: 'Envíos', icon: 'local_shipping' },
  { id: 'returns', label: 'Devoluciones', icon: 'assignment_return' },
  { id: 'inventory', label: 'Inventario', icon: 'warehouse' },
  { id: 'metafields', label: 'Metafields', icon: 'data_object' },
];

function normalizeShopInput(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  // accept "mystore" → mystore.myshopify.com
  if (s && !s.includes('.')) s = `${s}.myshopify.com`;
  return s;
}

function isValidShop(s: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(s);
}

const ShopifyConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [shopInput, setShopInput] = useState(existing?.shop_domain ?? '');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [manualWebhookSecret, setManualWebhookSecret] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setShopInput(existing?.shop_domain ?? '');
      setManualToken('');
      setManualWebhookSecret('');
      setAdvancedOpen(false);
      setError(null);
      setSubmitting(false);
    }
  }, [open, existing?.shop_domain]);

  if (!open) return null;

  const isConnected = Boolean(existing?.shop_domain);
  const normalizedShop = normalizeShopInput(shopInput);
  const shopValid = isValidShop(normalizedShop);

  async function handleOAuthInstall() {
    setError(null);
    if (!shopValid) {
      setError('Introduce el dominio de tu tienda Shopify, p. ej. mistore.myshopify.com');
      return;
    }
    setSubmitting(true);
    try {
      // Get auth token + tenant headers via the existing supabase session.
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setError('Sesión expirada — vuelve a iniciar sesión.');
        setSubmitting(false);
        return;
      }
      const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
      // The /install endpoint returns JSON when accept=application/json so we
      // can decide whether to top-level-redirect or open a popup ourselves.
      const res = await fetch(
        `${apiBase}/api/integrations/shopify/install?shop=${encodeURIComponent(normalizedShop)}`,
        {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Server error ${res.status}`);
      }
      const { url } = await res.json();
      // Top-level redirect (Shopify embeds will already be in their iframe;
      // for non-embedded use we want the merchant to see the grant page in
      // their main window so they're not confused about which tab is asking).
      window.location.assign(url);
    } catch (err: any) {
      setError(err?.message || 'No se pudo iniciar la instalación de Shopify');
      setSubmitting(false);
    }
  }

  async function handleManualSave() {
    setError(null);
    if (!shopValid) {
      setError('Dominio de tienda inválido');
      return;
    }
    if (!manualToken.startsWith('shpat_') && !manualToken.startsWith('shpca_')) {
      setError('El token debe empezar por "shpat_" (Custom App) o "shpca_" (Public App)');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
      const res = await fetch(`${apiBase}/api/connectors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({
          system: 'shopify',
          name: normalizedShop,
          auth_type: 'api_key',
          auth_config: {
            shop_domain: normalizedShop,
            access_token: manualToken,
            webhook_secret: manualWebhookSecret || null,
            scope: 'manual',
          },
          status: 'connected',
        }),
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
    if (!confirm('¿Desconectar Shopify? Esto detendrá la sincronización pero no borrará los datos ya importados.')) return;
    setSubmitting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
      const res = await fetch(`${apiBase}/api/integrations/shopify/disconnect`, {
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
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#95BF47] text-white shadow-sm">
              <span className="material-symbols-outlined text-[22px]">shopping_bag</span>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                Integración
              </p>
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Shopify</h2>
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
              <div className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-900/20">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <p className="text-sm text-emerald-800 dark:text-emerald-200">
                  Conectado a <strong>{existing?.shop_domain}</strong>
                </p>
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
                Conecta tu tienda Shopify para que el agente pueda leer pedidos, clientes y productos, y ejecutar acciones como reembolsos o cancelaciones.
              </p>

              <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Dominio de tu tienda
              </label>
              <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-black/10 bg-white px-3 py-2.5 transition focus-within:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:focus-within:border-white">
                <span className="material-symbols-outlined text-[18px] text-gray-400">storefront</span>
                <input
                  autoFocus
                  value={shopInput}
                  onChange={(e) => setShopInput(e.target.value)}
                  placeholder="mistore.myshopify.com"
                  className="flex-1 bg-transparent text-sm text-gray-950 outline-none placeholder:text-gray-400 dark:text-white"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && shopValid && !submitting) void handleOAuthInstall();
                  }}
                />
                {shopInput && (
                  <span
                    className={`text-[11px] font-medium ${
                      shopValid ? 'text-emerald-600' : 'text-gray-400'
                    }`}
                  >
                    {shopValid ? 'OK' : '...'}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-gray-400">
                También aceptamos <code className="rounded bg-gray-100 px-1 py-0.5 text-[10px] dark:bg-white/10">mistore</code> y lo completamos a <code className="rounded bg-gray-100 px-1 py-0.5 text-[10px] dark:bg-white/10">.myshopify.com</code>.
              </p>

              {error ? (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
                  {error}
                </div>
              ) : null}

              {/* Advanced: manual credentials */}
              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className="mt-5 flex w-full items-center justify-between text-left text-[12px] font-medium text-gray-500 transition hover:text-gray-950 dark:hover:text-white"
              >
                <span>Avanzado · usar token de Custom App en vez de OAuth</span>
                <span className="material-symbols-outlined text-[16px]">
                  {advancedOpen ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {advancedOpen ? (
                <div className="mt-3 space-y-3 rounded-2xl border border-black/5 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Solo para tiendas que ya tengan creada una <em>Custom App</em>. Pega el Admin API access token tal cual lo da Shopify.
                  </p>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Admin API access token
                    </label>
                    <input
                      type="password"
                      autoComplete="off"
                      value={manualToken}
                      onChange={(e) => setManualToken(e.target.value)}
                      placeholder="shpat_..."
                      className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white dark:focus:border-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Webhook secret (opcional)
                    </label>
                    <input
                      type="password"
                      autoComplete="off"
                      value={manualWebhookSecret}
                      onChange={(e) => setManualWebhookSecret(e.target.value)}
                      placeholder="HMAC secret para validar webhooks"
                      className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-gray-950 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-white dark:focus:border-white"
                    />
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Footer / actions */}
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
                  disabled={submitting || !shopValid}
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
                disabled={submitting || !shopValid || !manualToken}
                className="rounded-full bg-black px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-black/90 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/90"
              >
                {submitting ? 'Guardando…' : 'Guardar credenciales'}
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
                disabled={submitting || !shopValid}
                className="flex items-center gap-2 rounded-full bg-[#95BF47] px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#7da93b] disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                    Abriendo Shopify…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                    Conectar con Shopify
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

export default ShopifyConnectModal;
