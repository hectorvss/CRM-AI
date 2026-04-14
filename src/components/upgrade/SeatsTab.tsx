import React, { useState } from 'react';
import { useApi } from '../../api/hooks';
import { billingApi, workspacesApi } from '../../api/client';

export default function SeatsTab() {
  const { data: workspace } = useApi(workspacesApi.currentContext);
  const orgId = workspace?.org_id;
  const { data: subscription, refetch: refetchSubscription } = useApi(() => (orgId ? billingApi.subscription(orgId) : Promise.resolve(null)), [orgId], null);
  const includedSeats = subscription?.seats_included ?? 3;
  const usedSeats = subscription?.seats_used ?? 2;
  const remainingSeats = Math.max(includedSeats - usedSeats, 0);
  const [quantity, setQuantity] = useState(1);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const addSeats = async () => {
    if (!orgId) return;
    setIsSaving(true);
    setStatusMessage(null);
    try {
      await billingApi.topUp(orgId, { type: 'seats', quantity, amount_cents: quantity * 2500 });
      setStatusMessage(`Added ${quantity} seat${quantity === 1 ? '' : 's'}.`);
      refetchSubscription();
    } catch (error: any) {
      setStatusMessage(error?.message || 'Unable to add seats.');
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
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Seat Management</h2>
          <span className="material-symbols-outlined text-gray-400">group</span>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-3 gap-6 mb-8">
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Included in Starter Plan</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{includedSeats}</p>
              <p className="text-[10px] text-gray-400 mt-1">Base seats</p>
            </div>
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Currently Used</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{usedSeats}</p>
              <p className="text-[10px] text-gray-400 mt-1">Active team members</p>
            </div>
            <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/30">
              <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 font-medium">Available Seats</p>
              <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{remainingSeats}</p>
              <p className="text-[10px] text-indigo-500/70 mt-1">Remaining to invite</p>
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800 pt-6">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Add More Seats</h3>
            <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Extra Seats</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">€25 / extra seat / month on Starter plan</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
                  <button type="button" onClick={() => setQuantity(current => Math.max(current - 1, 1))} className="px-3 py-1.5 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-r border-gray-200 dark:border-gray-700">
                    <span className="material-symbols-outlined text-[16px]">remove</span>
                  </button>
                  <span className="px-4 py-1.5 text-sm font-medium text-gray-900 dark:text-white min-w-[40px] text-center">{quantity}</span>
                  <button type="button" onClick={() => setQuantity(current => current + 1)} className="px-3 py-1.5 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-l border-gray-200 dark:border-gray-700">
                    <span className="material-symbols-outlined text-[16px]">add</span>
                  </button>
                </div>
                <button type="button" disabled={isSaving} onClick={() => void addSeats()} className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-xl text-sm font-bold shadow-md hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  Add Seats
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
