import React, { useEffect, useState } from 'react';
import { supabase } from '../../api/supabase';
import { Field, ErrorBox } from './MessengerConnectModal';
import { IntegrationLogo } from './logos';

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
  existing?: {
    site_url?: string | null;
    store_name?: string | null;
    webhook_url?: string | null;
    webhooks_registered?: number;
    webhook_topics?: string[];
    webhook_error?: string | null;
    capabilities?: { reads?: string[]; writes?: string[]; events?: string[] } | null;
  } | null;
}

const SCOPES = [
  { id: 'orders',     label: 'Orders · CRUD · refunds · notes',         icon: 'shopping_cart' },
  { id: 'customers',  label: 'Customers · search · CRUD',                icon: 'group' },
  { id: 'products',   label: 'Products · catalog lookup',                icon: 'inventory_2' },
  { id: 'coupons',    label: 'Coupons (discount support flows)',         icon: 'sell' },
  { id: 'webhooks',   label: 'Webhooks firmados HMAC SHA256',            icon: 'graph_2' },
  { id: 'realtime',   label: '9 topics: order/customer/product/coupon',  icon: 'bolt' },
];

const WooCommerceConnectModal: React.FC<Props> = ({ open, onClose, onChanged, existing }) => {
  const [siteUrl, setSiteUrl] = useState('');
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [storeName, setStoreName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const [syncResult, setSyncResult] = useState<any>(null);

  useEffect(() => {
    if (open) {
      setSiteUrl(''); setConsumerKey(''); setConsumerSecret(''); setStoreName('');
      setSubmitting(false); setError(null);
      setSyncStatus('idle'); setSyncResult(null);
    }
  }, [open]);

  if (!open) return null;
  const isConnected = Boolean(existing?.site_url);

  async function authedFetch(path: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const apiBase = (import.meta as any).env?.VITE_API_URL ?? '';
    return fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token ?? ''}`,
        Accept: 'application/json',
        ...(init?.body && init.method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  }

  async function handleConnect() {
    setError(null);
    if (!siteUrl) return setError('Site URL requerido');
    if (!consumerKey.startsWith('ck_')) return setError('consumer_key debe empezar con "ck_"');
    if (!consumerSecret.startsWith('cs_')) return setError('consumer_secret debe empezar con "cs_"');
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/woocommerce/connect', {
        method: 'POST',
        body: JSON.stringify({
          site_url: siteUrl.trim(),
          consumer_key: consumerKey.trim(),
          consumer_secret: consumerSecret.trim(),
          store_name: storeName.trim() || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `${res.status}`);
      onChanged?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Connect failed');
    } finally { setSubmitting(false); }
  }

  async function handleSync() {
    setSyncStatus('syncing'); setSyncResult(null);
    try {
      const res = await authedFetch('/api/integrations/woocommerce/sync', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.details || j.error || `${res.status}`);
      setSyncResult(j); setSyncStatus('ok');
    } catch {
      setSyncStatus('error');
    }
  }

  async function handleReregister() {
    if (!confirm('¿Re-registrar los 9 webhooks en WooCommerce? Reemplazaremos los existentes y rotaremos el secret.')) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/woocommerce/register-webhooks', { method: 'POST' });
      if (!res.ok) throw new Error();
      onChanged?.();
    } finally { setSubmitting(false); }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar WooCommerce? Borraremos los webhooks de tu site.')) return;
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/integrations/woocommerce/disconnect', { method: 'POST' });
      if (!res.ok) throw new Error();
      onChanged?.(); onClose();
    } finally { setSubmitting(false); }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#171717]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#7F54B3] text-white shadow-sm">
              <IntegrationLogo id="woocommerce" size={22} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Commerce</p>
              <h2 className="text-lg font-semibold text-gray-950 dark:text-white">WooCommerce</h2>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">Orders, customers, products + 9 webhooks firmados</p>
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
                  Conectado · <strong>{existing?.store_name || existing?.site_url}</strong>
                </p>
                <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100">
                  {existing?.webhooks_registered ?? 0} webhooks
                </span>
              </div>

              <div className="rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Site URL</p>
                <code className="mt-1 block break-all text-[12px] text-gray-700 dark:text-gray-200">{existing?.site_url}</code>
                {existing?.webhook_topics?.length ? (
                  <div className="mt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Topics activos</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {existing.webhook_topics.map((t) => (
                        <span key={t} className="rounded-full border border-black/5 bg-gray-50 px-2 py-0.5 text-[10px] text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">{t}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {existing?.webhook_error ? (
                  <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">{existing.webhook_error}</p>
                ) : null}
                <button type="button" onClick={() => void handleReregister()} disabled={submitting} className="mt-3 text-[11px] font-medium text-[#7F54B3] underline-offset-2 hover:underline disabled:opacity-50">
                  Re-registrar webhooks (rota secret)
                </button>
              </div>

              <div className="mt-3 rounded-2xl border border-black/5 bg-gray-50/50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Probar conexión</p>
                  <button type="button" onClick={() => void handleSync()} disabled={syncStatus === 'syncing'} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-[#171717] dark:text-gray-200 dark:hover:bg-white/5">
                    {syncStatus === 'syncing' ? 'Sincronizando…' : syncStatus === 'ok' ? '✓ OK' : syncStatus === 'error' ? '⚠ Error' : 'Listar últimas órdenes'}
                  </button>
                </div>
                {syncResult ? (
                  <div className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                    {syncResult.orders_visible} órdenes visibles.
                    {syncResult.sample?.length ? (
                      <ul className="mt-1 space-y-0.5">
                        {syncResult.sample.map((o: any) => (
                          <li key={o.id} className="truncate">#{o.number} · <span className="font-medium">{o.status}</span> · {o.total} {o.currency}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="mt-3 rounded-2xl border border-black/5 bg-white p-4 dark:border-white/10 dark:bg-[#1b1b1b]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Capacidades activas</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(existing?.capabilities?.reads ?? []).map((c) => (
                    <span key={`r-${c}`} className="rounded-full border border-black/5 bg-gray-50 px-2 py-0.5 text-[10px] text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">{c}</span>
                  ))}
                  {(existing?.capabilities?.writes ?? []).map((c) => (
                    <span key={`w-${c}`} className="rounded-full border border-purple-300/60 bg-purple-50 px-2 py-0.5 text-[10px] text-purple-800 dark:border-purple-700/50 dark:bg-purple-900/20 dark:text-purple-200">{c}</span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Conexión vía API key. Genera el par <code className="text-[12px] bg-gray-100 dark:bg-white/10 px-1 rounded">ck_/cs_</code> en tu WooCommerce admin con permisos read/write.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SCOPES.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-xl border border-black/5 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                    <span className="material-symbols-outlined text-[14px] text-[#7F54B3]">{s.icon}</span>
                    {s.label}
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[11px] text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-200">
                <p className="font-semibold uppercase tracking-[0.18em]">Cómo obtener las API keys</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 leading-relaxed">
                  <li>WP-Admin → WooCommerce → Settings → Advanced → REST API → Add key</li>
                  <li>Description: "Clain". User: tu admin. Permissions: <strong>Read/Write</strong></li>
                  <li>Copia <code>Consumer key</code> (ck_…) y <code>Consumer secret</code> (cs_…) — sólo se muestran una vez</li>
                  <li>Tu site debe ser HTTPS y tener WooCommerce 4.4+ con permalinks activados</li>
                </ol>
              </div>

              <div className="mt-4 space-y-3">
                <Field label="Site URL" value={siteUrl} onChange={setSiteUrl} placeholder="https://shop.tudominio.com" autoFocus />
                <Field label="Consumer Key" value={consumerKey} onChange={setConsumerKey} type="password" placeholder="ck_..." />
                <Field label="Consumer Secret" value={consumerSecret} onChange={setConsumerSecret} type="password" placeholder="cs_..." />
                <Field label="Store name (opcional)" value={storeName} onChange={setStoreName} placeholder="Mi tienda" />
              </div>

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
              <button type="button" onClick={() => void handleConnect()} disabled={submitting || !siteUrl || !consumerKey || !consumerSecret} className="flex items-center gap-2 rounded-full bg-[#7F54B3] px-5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#6e468f] disabled:opacity-50">
                {submitting ? <><span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>Validando…</> : 'Validar y conectar'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default WooCommerceConnectModal;
