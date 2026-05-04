/**
 * RefundFlowModal — multi-step refund modal launched from the Orders page.
 *
 * Step 1 — Mode selector: Full / Partial / Exchange / Goodwill
 * Step 2 — Configure:
 *           · Partial : amount input (slider + numeric)
 *           · Exchange: live product search against the tenant's connected
 *                       Shopify or WooCommerce, with a cart of replacement
 *                       items
 *           · Goodwill: amount input + reason textarea
 *           · Full    : (skipped — goes straight to review)
 * Step 3 — Review & confirm
 *
 * On confirm calls paymentsApi.refundAdvanced(...) which routes through
 * Stripe (live) and creates a Shopify draft order for exchanges.
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { paymentsApi, commerceApi } from '../api/client';

export interface RefundFlowOrderContext {
  orderId: string;          // human label like SHOP-#10428
  paymentId: string;        // canonical UUID
  customerName: string;
  total: number;            // numeric
  currency: string;         // 'EUR' | 'USD' | ...
  riskLevel?: string;
  refundedSoFar?: number;   // already refunded amount on this payment
}

export type RefundMode = 'full' | 'partial' | 'exchange' | 'goodwill';

interface Props {
  open: boolean;
  onClose: () => void;
  context: RefundFlowOrderContext | null;
  onCompleted?: (result: any) => void;
}

interface PickerProduct {
  id: string;
  title: string;
  vendor?: string;
  imageUrl?: string;
  variants: Array<{ id: string; title: string; sku?: string; price: number }>;
}

interface CartItem {
  productId: string;
  variantId: string;
  title: string;
  variantTitle: string;
  price: number;
  quantity: number;
}

const formatMoney = (amount: number, currency = 'USD') =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount) || 0);

export default function RefundFlowModal({ open, onClose, context, onCompleted }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<RefundMode>('full');
  const [amount, setAmount] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [provider, setProvider] = useState<'shopify' | 'woocommerce'>('shopify');

  // Product picker
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<PickerProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const remaining = useMemo(() => {
    if (!context) return 0;
    return Math.max(0, (Number(context.total) || 0) - (Number(context.refundedSoFar) || 0));
  }, [context]);

  // Reset when reopened
  useEffect(() => {
    if (open && context) {
      setStep(1);
      setMode('full');
      setAmount(remaining);
      setReason('');
      setSearch('');
      setProducts([]);
      setProductsError(null);
      setCart([]);
      setSubmitError(null);
      setSubmitting(false);
    }
  }, [open, context, remaining]);

  // Live product search (debounced)
  useEffect(() => {
    if (mode !== 'exchange' || !open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setProductsLoading(true);
      setProductsError(null);
      try {
        const result = await commerceApi.searchProducts({ q: search || undefined, provider, limit: 25 });
        if (!cancelled) {
          setProducts((result.items || []) as PickerProduct[]);
        }
      } catch (err: any) {
        if (!cancelled) {
          setProducts([]);
          setProductsError(err?.message || 'Failed to load products');
        }
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [mode, open, search, provider]);

  if (!open || !context) return null;

  const currency = context.currency || 'USD';
  const cartTotal = cart.reduce((s, it) => s + it.price * it.quantity, 0);
  const netRefund = mode === 'exchange'
    ? Math.max(0, amount - cartTotal)
    : mode === 'full' ? remaining
    : amount;

  const addToCart = (product: PickerProduct, variantIdx = 0) => {
    const v = product.variants[variantIdx] || product.variants[0];
    if (!v) return;
    const existing = cart.find((c) => c.variantId === v.id);
    if (existing) {
      setCart((c) => c.map((it) => it.variantId === v.id ? { ...it, quantity: it.quantity + 1 } : it));
    } else {
      setCart((c) => [...c, { productId: product.id, variantId: v.id, title: product.title, variantTitle: v.title, price: v.price, quantity: 1 }]);
    }
  };
  const removeFromCart = (variantId: string) => setCart((c) => c.filter((it) => it.variantId !== variantId));
  const setCartQuantity = (variantId: string, q: number) => {
    if (q <= 0) return removeFromCart(variantId);
    setCart((c) => c.map((it) => it.variantId === variantId ? { ...it, quantity: q } : it));
  };

  const canAdvance = useCallback(() => {
    if (step === 1) return true;
    if (step === 2) {
      if (mode === 'full') return true;
      if (mode === 'partial' || mode === 'goodwill') return amount > 0 && amount <= remaining;
      if (mode === 'exchange') return amount > 0 && amount <= remaining && cart.length > 0;
    }
    return true;
  }, [step, mode, amount, remaining, cart.length]);

  const handleConfirm = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: Parameters<typeof paymentsApi.refundAdvanced>[1] = {
        mode,
        amount: mode === 'full' ? remaining : amount,
        currency,
        reason: reason || `${mode} refund initiated from Orders`,
      };
      if (mode === 'exchange') {
        payload.provider = provider;
        payload.replacementProducts = cart.map((it) => ({
          provider, productId: it.productId, variantId: it.variantId,
          quantity: it.quantity, title: it.title, price: it.price,
        }));
      }
      const result = await paymentsApi.refundAdvanced(context.paymentId, payload);
      onCompleted?.(result);
      onClose();
    } catch (err: any) {
      setSubmitError(err?.message || 'Refund failed');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-card-dark rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <span className="material-symbols-outlined text-[19px] text-amber-700 dark:text-amber-300">currency_exchange</span>
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Refund flow</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {context.orderId} · {context.customerName} · {formatMoney(context.total, currency)} total
                {context.refundedSoFar ? ` · already refunded ${formatMoney(context.refundedSoFar, currency)}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg" disabled={submitting}>
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Stepper */}
        <div className="px-6 pt-4 pb-2 flex items-center gap-2 flex-shrink-0">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${
              s <= step ? 'bg-gray-900 dark:bg-white' : 'bg-gray-200 dark:bg-gray-700'
            }`} />
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          {step === 1 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Choose a refund mode</h3>
              {[
                { id: 'full',     icon: 'currency_exchange', title: 'Full refund',           desc: `Refund the full ${formatMoney(remaining, currency)}.` },
                { id: 'partial',  icon: 'percentage',        title: 'Partial refund',        desc: 'Refund only part of the order amount.' },
                { id: 'exchange', icon: 'swap_horiz',        title: 'Exchange / replacement',desc: 'Refund and create a replacement order with new products from your store catalog.' },
                { id: 'goodwill', icon: 'volunteer_activism',title: 'Goodwill credit',       desc: 'Refund a goodwill amount (does not require a fault).' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMode(opt.id as RefundMode)}
                  className={`w-full text-left rounded-xl border p-4 flex items-start gap-3 transition-colors ${
                    mode === opt.id
                      ? 'border-gray-900 bg-gray-50 dark:border-white dark:bg-white/5'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 bg-white dark:bg-card-dark'
                  }`}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                    <span className="material-symbols-outlined text-[17px] text-gray-700 dark:text-gray-300">{opt.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{opt.title}</span>
                      {mode === opt.id && <span className="material-symbols-outlined text-[16px] text-emerald-500">check_circle</span>}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              {(mode === 'partial' || mode === 'goodwill' || mode === 'exchange') && (
                <div>
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1.5 block">
                    Refund amount ({currency})
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={0}
                      max={remaining}
                      step={0.01}
                      value={amount}
                      onChange={(e) => setAmount(Math.max(0, Math.min(remaining, Number(e.target.value) || 0)))}
                      className="w-40 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-card-dark px-3 py-2 text-sm text-gray-900 dark:text-white"
                    />
                    <input
                      type="range"
                      min={0}
                      max={remaining}
                      step={0.01}
                      value={amount}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => setAmount(remaining)}
                      className="px-2 py-1 rounded-md text-[11px] font-semibold border border-gray-200 dark:border-gray-700 hover:border-gray-400"
                    >
                      Max ({formatMoney(remaining, currency)})
                    </button>
                  </div>
                </div>
              )}

              {mode === 'full' && (
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/30 p-4">
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    Full refund of {formatMoney(remaining, currency)} will be issued.
                  </p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                    The PSP will reverse the original capture. Order status will move to Refunded.
                  </p>
                </div>
              )}

              {mode === 'exchange' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                      Replacement products
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-500">Catalog:</span>
                      {(['shopify', 'woocommerce'] as const).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setProvider(p)}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                            provider === p
                              ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white'
                              : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="text"
                    placeholder={`Search ${provider} products by title or SKU…`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-card-dark px-3 py-2 text-sm text-gray-900 dark:text-white"
                  />
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 max-h-64 overflow-y-auto custom-scrollbar">
                    {productsLoading && (
                      <div className="p-4 text-center text-xs text-gray-500">Searching {provider}…</div>
                    )}
                    {productsError && (
                      <div className="p-4 text-center text-xs text-red-600 dark:text-red-400">{productsError}</div>
                    )}
                    {!productsLoading && !productsError && products.length === 0 && (
                      <div className="p-4 text-center text-xs text-gray-500">
                        {search ? `No results in ${provider}` : `Type to search ${provider} products`}
                      </div>
                    )}
                    {products.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 p-3 border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt={p.title} className="w-10 h-10 rounded object-cover bg-gray-100" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                            <span className="material-symbols-outlined text-[16px] text-gray-400">inventory_2</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.title}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {p.vendor ? `${p.vendor} · ` : ''}
                            {p.variants[0]?.sku ? `SKU ${p.variants[0].sku} · ` : ''}
                            {formatMoney(p.variants[0]?.price ?? 0, currency)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => addToCart(p, 0)}
                          className="px-2 py-1 rounded-md text-[11px] font-semibold bg-gray-900 text-white dark:bg-white dark:text-gray-900 hover:opacity-80"
                        >
                          Add
                        </button>
                      </div>
                    ))}
                  </div>

                  {cart.length > 0 && (
                    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                        Replacement cart ({cart.length} item{cart.length === 1 ? '' : 's'})
                      </p>
                      <div className="space-y-2">
                        {cart.map((it) => (
                          <div key={it.variantId} className="flex items-center gap-2 text-sm">
                            <span className="flex-1 truncate">{it.title} <span className="text-gray-500">· {it.variantTitle}</span></span>
                            <input
                              type="number"
                              min={1}
                              value={it.quantity}
                              onChange={(e) => setCartQuantity(it.variantId, Number(e.target.value) || 1)}
                              className="w-14 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-card-dark px-2 py-1 text-xs"
                            />
                            <span className="w-20 text-right font-mono text-xs">{formatMoney(it.price * it.quantity, currency)}</span>
                            <button onClick={() => removeFromCart(it.variantId)} className="p-1 text-gray-400 hover:text-red-500">
                              <span className="material-symbols-outlined text-[15px]">close</span>
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-gray-200 dark:border-gray-700 mt-2 pt-2 flex justify-between text-xs font-semibold">
                        <span>Replacement cart total</span>
                        <span>{formatMoney(cartTotal, currency)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1.5 block">
                  Reason / note
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why this refund? (optional, written into the audit log)"
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-card-dark px-3 py-2 text-sm text-gray-900 dark:text-white resize-none"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Review</h3>
              <dl className="rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                {[
                  ['Mode', mode.charAt(0).toUpperCase() + mode.slice(1)],
                  ['Order', context.orderId],
                  ['Customer', context.customerName],
                  ['Refund amount', formatMoney(mode === 'full' ? remaining : amount, currency)],
                  ...(mode === 'exchange' ? [
                    ['Replacement cart', `${cart.length} items · ${formatMoney(cartTotal, currency)}`],
                    ['Net refund to customer', formatMoney(netRefund, currency)],
                    ['Catalog', provider],
                  ] : []),
                  ['Reason', reason || '(none)'],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between px-4 py-2.5 text-sm">
                    <dt className="text-gray-500 dark:text-gray-400">{k}</dt>
                    <dd className="font-medium text-gray-900 dark:text-white text-right max-w-[60%] truncate">{v}</dd>
                  </div>
                ))}
              </dl>
              {submitError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800/30 p-3 text-sm text-red-700 dark:text-red-300">
                  {submitError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center flex-shrink-0">
          <button
            type="button"
            onClick={() => step === 1 ? onClose() : setStep((s) => (s - 1) as 1 | 2 | 3)}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-300"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step < 3 ? (
            <button
              type="button"
              disabled={!canAdvance()}
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-900 text-white dark:bg-white dark:text-gray-900 hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Continue →
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleConfirm}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {submitting ? 'Processing…' : `Confirm ${mode} refund`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
