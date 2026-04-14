import React, { useMemo } from 'react';
import { useApi } from '../../api/hooks';
import { billingApi, workspacesApi } from '../../api/client';

export default function UsageTab() {
  const { data: workspace } = useApi(workspacesApi.currentContext);
  const orgId = workspace?.org_id;
  const { data: subscription, refetch: refetchSubscription } = useApi(() => (orgId ? billingApi.subscription(orgId) : Promise.resolve(null)), [orgId], null);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  const creditsIncluded = subscription?.credits_included ?? 5000;
  const creditsUsed = subscription?.credits_used ?? 3240;
  const seatsIncluded = subscription?.seats_included ?? 3;
  const seatsUsed = subscription?.seats_used ?? 2;

  const creditPercent = useMemo(() => Math.min((creditsUsed / Math.max(creditsIncluded, 1)) * 100, 100), [creditsUsed, creditsIncluded]);
  const seatPercent = useMemo(() => Math.min((seatsUsed / Math.max(seatsIncluded, 1)) * 100, 100), [seatsIncluded, seatsUsed]);

  const buyCredits = async () => {
    if (!orgId) return;
    setIsSaving(true);
    setStatusMessage(null);
    try {
      await billingApi.topUp(orgId, { type: 'credits', quantity: 5000, amount_cents: 7900 });
      setStatusMessage('Purchased 5,000 credits.');
      refetchSubscription();
    } catch (error: any) {
      setStatusMessage(error?.message || 'Unable to buy credits.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {statusMessage && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/15 dark:text-emerald-300">
          {statusMessage}
        </div>
      )}

      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Current Cycle Usage</h2>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {workspace?.created_at ? `Workspace active since ${new Date(workspace.created_at).toLocaleDateString()}` : 'Current billing cycle'}
          </span>
        </div>
        <div className="p-6 space-y-8">
          <div>
            <div className="flex justify-between items-end mb-2">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-indigo-500">auto_awesome</span>
                  AI Credits
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Included in {String(subscription?.plan_id || workspace?.plan_id || 'starter')} plan</p>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-gray-900 dark:text-white">{creditsUsed.toLocaleString()}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400"> / {creditsIncluded.toLocaleString()}</span>
              </div>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2.5 mb-2 overflow-hidden">
              <div className="bg-indigo-500 h-2.5 rounded-full" style={{ width: `${creditPercent}%` }} />
            </div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">{Math.max(creditsIncluded - creditsUsed, 0).toLocaleString()} credits remaining this cycle.</p>
          </div>

          <div>
            <div className="flex justify-between items-end mb-2">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-gray-400">group</span>
                  Seats
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Included in {String(subscription?.plan_id || workspace?.plan_id || 'starter')} plan</p>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-gray-900 dark:text-white">{seatsUsed}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400"> / {seatsIncluded}</span>
              </div>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2.5 mb-2 overflow-hidden">
              <div className="bg-gray-500 dark:bg-gray-400 h-2.5 rounded-full" style={{ width: `${seatPercent}%` }} />
            </div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">{Math.max(seatsIncluded - seatsUsed, 0)} seats available to invite.</p>
          </div>
        </div>
      </section>

      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Add-ons & Top-ups</h2>
          <span className="material-symbols-outlined text-gray-400">extension</span>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <span className="material-symbols-outlined">toll</span>
              </div>
              <div>
                <h4 className="text-sm font-bold text-gray-900 dark:text-white">Extra AI Credits</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Top-ups are reflected in the billing ledger.</p>
              </div>
            </div>
            <button type="button" disabled={isSaving} onClick={() => void buyCredits()} className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
              Buy Credits
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
