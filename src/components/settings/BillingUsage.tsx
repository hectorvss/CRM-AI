import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/hooks';
import { billingApi, workspacesApi } from '../../api/client';
import LoadingState from '../LoadingState';

type SaveHandler = (() => Promise<void> | void) | null;
type Props = { onSaveReady?: (handler: SaveHandler) => void };

function parseSettings(settings: any) {
  if (!settings) return {};
  if (typeof settings === 'string') {
    try {
      return JSON.parse(settings);
    } catch {
      return {};
    }
  }
  return settings;
}

function money(value: unknown): string {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return '€0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(parsed);
}

export default function BillingUsageTab({ onSaveReady }: Props) {
  const { data: workspace, loading: workspaceLoading, error: workspaceError } = useApi(workspacesApi.currentContext);
  const workspaceSettings = useMemo(() => parseSettings(workspace?.settings), [workspace]);
  const orgId = workspace?.org_id;

  const { data: subscription } = useApi(
    () => (orgId ? billingApi.subscription(orgId) : Promise.resolve(null)),
    [orgId],
    null,
  );
  const { data: ledger } = useApi(
    () => (orgId ? billingApi.ledger(orgId) : Promise.resolve([])),
    [orgId],
    [],
  );

  const [monthlyBudgetCap, setMonthlyBudgetCap] = useState('2500');
  const [flexibleUsageEnabled, setFlexibleUsageEnabled] = useState(false);
  const [alertAtPercent, setAlertAtPercent] = useState(80);
  const [stopAtPercent, setStopAtPercent] = useState(90);
  const [billingEmail, setBillingEmail] = useState('billing@acme.com');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setMonthlyBudgetCap(String(workspaceSettings.billing?.monthlyBudgetCap ?? 2500));
    setFlexibleUsageEnabled(workspaceSettings.billing?.flexibleUsageEnabled ?? false);
    setAlertAtPercent(workspaceSettings.billing?.alertAtPercent ?? 80);
    setStopAtPercent(workspaceSettings.billing?.stopAtPercent ?? 90);
    setBillingEmail(workspaceSettings.billing?.billingEmail ?? 'billing@acme.com');
  }, [workspaceSettings]);

  const handleSave = useCallback(async () => {
    if (!workspace?.id) throw new Error('Workspace not loaded');
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const nextSettings = {
        ...workspaceSettings,
        billing: {
          monthlyBudgetCap: Number(monthlyBudgetCap) || 0,
          flexibleUsageEnabled,
          alertAtPercent,
          stopAtPercent,
          billingEmail,
        },
      };
      await workspacesApi.update(workspace.id, { settings: nextSettings });
      setStatusMessage('Billing preferences saved.');
    } catch (error: any) {
      setStatusMessage(error?.message || 'Unable to save billing preferences.');
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [alertAtPercent, billingEmail, flexibleUsageEnabled, monthlyBudgetCap, stopAtPercent, workspace?.id, workspaceSettings]);

  useEffect(() => {
    onSaveReady?.(handleSave);
    return () => onSaveReady?.(null);
  }, [handleSave, onSaveReady]);

  if (workspaceLoading) return <LoadingState title="Loading billing usage" message="Fetching plan, seats and ledger data." compact />;
  if (workspaceError) return <div className="p-6 text-sm text-red-500">Error loading billing usage.</div>;

  const seatsIncluded = subscription?.seats_included ?? 3;
  const seatsUsed = subscription?.seats_used ?? 2;
  const creditsIncluded = subscription?.credits_included ?? 5000;
  const creditsUsed = subscription?.credits_used ?? 3240;
  const currentPlan = subscription?.plan_id || workspace?.plan_id || 'starter';
  const ledgerEntries = Array.isArray(ledger) ? ledger : [];

  return (
    <div className="space-y-8">
      {statusMessage && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/15 dark:text-emerald-300">
          {statusMessage}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-100 uppercase">
              {subscription?.status || 'Active'}
            </span>
          </div>
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <span className="material-symbols-outlined text-3xl">diamond</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white capitalize">{String(currentPlan).replace(/_/g, ' ')}</h2>
              <p className="text-xs text-gray-500">Billed through the workspace subscription.</p>
            </div>
          </div>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Seats Used</h3>
                <span className="text-sm font-bold text-gray-900 dark:text-white">{seatsUsed} / {seatsIncluded}</span>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${Math.min((seatsUsed / Math.max(seatsIncluded, 1)) * 100, 100)}%` }} />
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-gray-500">
                <span className="material-symbols-outlined text-sm">group</span>
                {Math.max(seatsIncluded - seatsUsed, 0)} seats remaining
              </div>
            </div>
            <button type="button" onClick={() => setStatusMessage('Open the Upgrade section to manage plan tiers and seat packs.')} className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-2">
              Manage Plan & Seats
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
        </section>

        <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card p-6">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center text-orange-600 dark:text-orange-400">
                <span className="material-symbols-outlined">smart_toy</span>
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">AI Usage & Budget</h2>
                <p className="text-[10px] text-gray-500">Current cycle usage from the subscription record</p>
              </div>
            </div>
            <button type="button" onClick={() => setStatusMessage('Usage details are reflected below from the billing ledger.')} className="text-xs font-bold text-gray-500 hover:text-gray-900 transition-colors">
              View Usage Details
            </button>
          </div>
          <div className="space-y-6">
            <div className="flex items-center gap-8">
              <div className="flex-1">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-3xl font-bold text-gray-900 dark:text-white">{Math.round((creditsUsed / Math.max(creditsIncluded, 1)) * 100)}%</span>
                  <span className="text-xs font-medium text-gray-500">{creditsUsed.toLocaleString()} / {creditsIncluded.toLocaleString()} Credits</span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full" style={{ width: `${Math.min((creditsUsed / Math.max(creditsIncluded, 1)) * 100, 100)}%` }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-2">Monthly cap set to {money(monthlyBudgetCap)}.</p>
              </div>
              <div className="w-px h-16 bg-gray-100 dark:bg-gray-800" />
              <div className="w-40">
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Monthly Budget Cap (EUR)</label>
                <div className="flex items-center bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
                  <span className="text-sm font-bold text-gray-400 mr-1">€</span>
                  <input type="number" value={monthlyBudgetCap} onChange={event => setMonthlyBudgetCap(event.target.value)} className="bg-transparent border-none p-0 text-sm font-bold outline-none w-full" />
                  <span className="text-[10px] font-bold text-gray-400 ml-1">EUR</span>
                </div>
              </div>
            </div>

            <div className="bg-orange-50 dark:bg-orange-900/10 rounded-xl p-4 border border-orange-100 dark:border-orange-900/30 flex gap-3">
              <span className="material-symbols-outlined text-orange-600 dark:text-orange-400 text-sm">warning</span>
              <p className="text-[11px] text-orange-800/70 dark:text-orange-300/70 leading-relaxed">
                Alerting is active at {alertAtPercent}% usage and usage stops at {stopAtPercent}% when flexible usage is enabled.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Alert Thresholds</h4>
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Alert Admins at {alertAtPercent}% usage</span>
                <input type="range" min={50} max={95} step={5} value={alertAtPercent} onChange={event => setAlertAtPercent(Number(event.target.value))} className="flex-1" />
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Stop Autopilot at {stopAtPercent}% usage</span>
                <input type="range" min={60} max={100} step={5} value={stopAtPercent} onChange={event => setStopAtPercent(Number(event.target.value))} className="flex-1" />
              </div>
              <button type="button" onClick={() => setFlexibleUsageEnabled(current => !current)} className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold border ${flexibleUsageEnabled ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'}`}>
                <span className="material-symbols-outlined text-sm">{flexibleUsageEnabled ? 'toggle_on' : 'toggle_off'}</span>
                Flexible usage {flexibleUsageEnabled ? 'enabled' : 'disabled'}
              </button>
            </div>

            <div className="space-y-3">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Billing Email</label>
              <input
                type="email"
                value={billingEmail}
                onChange={event => setBillingEmail(event.target.value)}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
          </div>
        </section>
      </div>

      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Invoices & Payment History</h2>
          <div className="flex gap-3">
            <button type="button" onClick={() => setStatusMessage('Billing email updates are stored in workspace settings.')} className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold shadow-card">
              <span className="material-symbols-outlined text-sm">mail</span>
              Update Billing Email
            </button>
            <button type="button" onClick={() => setStatusMessage('The ledger below reflects the current billing history from the backend.')} className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold shadow-card">
              Refresh
            </button>
          </div>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              <th className="px-6 py-3">Date</th>
              <th className="px-6 py-3">Reason</th>
              <th className="px-6 py-3">Amount</th>
              <th className="px-6 py-3">Balance After</th>
              <th className="px-6 py-3 text-right">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50 text-xs">
            {ledgerEntries.length === 0 && (
              <tr>
                <td className="px-6 py-10 text-sm text-gray-500" colSpan={5}>
                  No billing ledger entries yet.
                </td>
              </tr>
            )}
            {ledgerEntries.map((entry: any) => (
              <tr key={entry.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
                <td className="px-6 py-4 text-gray-500">{entry.occurred_at ? new Date(entry.occurred_at).toLocaleDateString() : '-'}</td>
                <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">{entry.reason || entry.reference_type || 'Ledger entry'}</td>
                <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">{money(entry.amount)}</td>
                <td className="px-6 py-4 text-gray-500">{money(entry.balance_after)}</td>
                <td className="px-6 py-4 text-right">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 uppercase">{entry.entry_type || 'debit'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 p-6 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-200 mb-1">Billing Policy</h3>
          <p className="text-xs text-indigo-800/70 dark:text-indigo-300/70">Monthly limits, flexible usage, and ledger history are stored in workspace settings and the billing tables.</p>
        </div>
        <button type="button" onClick={() => void handleSave().catch(() => undefined)} disabled={isSaving} className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-xl text-sm font-bold">
          Save preferences
        </button>
      </div>
    </div>
  );
}
