import React, { useEffect, useState } from 'react';
import { billingApi } from '../../api/client';
import type { AICreditsState } from '../../hooks/useAICredits';

interface Props {
  onClose: () => void;
  usage: AICreditsState;
}

const TOPUP_PACKS: Array<{ credits: number; pack: '5k' | '20k' | '50k'; priceEur: number; label: string }> = [
  { credits: 5_000,  pack: '5k',  priceEur: 79,  label: 'Starter pack' },
  { credits: 20_000, pack: '20k', priceEur: 249, label: 'Growth pack' },
  { credits: 50_000, pack: '50k', priceEur: 549, label: 'Scale pack' },
];

/**
 * Upgrade modal — shows current usage and offers the three escape hatches:
 *   1. Buy a top-up pack (5k / 20k / 50k credits) — Stripe checkout
 *   2. Upgrade plan (Stripe checkout)
 *   3. Enable flexible (post-paid) billing
 *
 * Gracefully handles 503 STRIPE_NOT_CONFIGURED responses by surfacing a
 * "Billing not available" message instead of crashing.
 */
export default function UpgradeModal({ onClose, usage }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stripeAvailable, setStripeAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/billing/config');
        if (!res.ok) {
          if (!cancelled) setStripeAvailable(false);
          return;
        }
        const body = await res.json().catch(() => ({}));
        if (!cancelled) setStripeAvailable(Boolean(body?.stripeConfigured));
      } catch {
        if (!cancelled) setStripeAvailable(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleTopup = async (pack: '5k' | '20k' | '50k', credits: number) => {
    setBusy(`topup-${credits}`);
    setError(null);
    try {
      const orgId = (window as any).__CRMAI_ORG_ID__ || '';
      if (!orgId) {
        throw new Error('Workspace context missing — reload the page and try again.');
      }
      // Hit the Stripe topup-checkout endpoint. Surface 503 as a configurator
      // message rather than a crash.
      const res = await fetch(`/api/billing/${orgId}/topup-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 503 && body?.error === 'STRIPE_NOT_CONFIGURED') {
        setStripeAvailable(false);
        throw new Error('Billing is not configured. Contact your workspace administrator.');
      }
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Top-up failed (HTTP ${res.status})`);
      }
      if (body?.url) {
        window.location.href = body.url;
      } else {
        throw new Error('Top-up checkout URL missing');
      }
    } catch (err: any) {
      setError(err?.message || 'Top-up failed');
    } finally {
      setBusy(null);
    }
  };

  const handleUpgrade = () => {
    window.location.href = '/pricing';
  };

  const handleEnableFlexible = async () => {
    setBusy('flexible');
    setError(null);
    try {
      await billingApi.toggleFlexibleUsage(true);
      onClose();
      window.location.reload();
    } catch (err: any) {
      setError(err?.message || 'Could not enable flexible billing');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">AI credits</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-700">×</button>
        </div>

        <div className="bg-gray-50 rounded p-3 mb-4 text-sm">
          <div className="flex justify-between">
            <span>Plan</span>
            <span className="font-medium capitalize">{usage.plan}</span>
          </div>
          <div className="flex justify-between">
            <span>Used this period</span>
            <span>{usage.usedThisPeriod.toLocaleString()} / {usage.included.toLocaleString()} ({usage.percentUsed}%)</span>
          </div>
          <div className="flex justify-between">
            <span>Top-up balance</span>
            <span>{usage.topupBalance.toLocaleString()} credits</span>
          </div>
          {usage.flexibleEnabled && (
            <div className="flex justify-between">
              <span>Flexible used (period)</span>
              <span>{usage.flexibleUsedThisPeriod.toLocaleString()} credits</span>
            </div>
          )}
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded px-3 py-2 mb-3 text-sm">{error}</div>}

        {stripeAvailable === false && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2 mb-3 text-sm">
            Billing is not yet configured for this deployment. Please contact your workspace administrator.
          </div>
        )}

        <h3 className="font-medium mb-2">Buy a top-up pack</h3>
        <div className="grid grid-cols-3 gap-3 mb-5">
          {TOPUP_PACKS.map((pack) => (
            <button
              key={pack.credits}
              onClick={() => handleTopup(pack.pack, pack.credits)}
              disabled={!!busy || stripeAvailable === false}
              className="border rounded p-3 text-center hover:border-blue-500 hover:shadow disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-lg font-semibold">{pack.credits.toLocaleString()}</div>
              <div className="text-xs text-gray-600">credits</div>
              <div className="mt-1 font-medium">€{pack.priceEur}</div>
              <div className="text-xs text-gray-500">{pack.label}</div>
            </button>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleUpgrade}
            disabled={!!busy || stripeAvailable === false}
            className="flex-1 min-w-[180px] bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Upgrade plan
          </button>
          {!usage.flexibleEnabled && (
            <button
              onClick={handleEnableFlexible}
              disabled={!!busy}
              className="flex-1 min-w-[180px] border border-amber-500 text-amber-800 bg-amber-50 rounded px-4 py-2 hover:bg-amber-100 disabled:opacity-50"
            >
              {busy === 'flexible' ? 'Enabling…' : 'Enable flexible (€19/1k)'}
            </button>
          )}
        </div>

        <p className="text-xs text-gray-500 mt-4">
          Top-up packs never expire. Flexible billing is post-paid at €19 per 1,000 credits and can be capped from
          Settings → Billing.
        </p>
      </div>
    </div>
  );
}
