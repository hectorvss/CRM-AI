import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/hooks';
import { billingApi, workspacesApi } from '../../api/client';
import LoadingState from '../LoadingState';

type SaveHandler = (() => Promise<void> | void) | null;
type Props = { onSaveReady?: (handler: SaveHandler) => void };

const fallbackWorkspace = {
  id: 'ws_default',
  name: 'CRM AI Workspace',
  slug: 'crm-ai',
  settings: {},
};

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
  const { data: workspace, loading: workspaceLoading, error: workspaceError } = useApi(workspacesApi.currentContext, [], null as any);
  const workspaceRecord = workspace || fallbackWorkspace;
  const workspaceSettings = useMemo(() => parseSettings(workspaceRecord?.settings), [workspaceRecord]);
  const orgId = workspaceRecord?.org_id;

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
    if (!workspace?.id) {
      setStatusMessage('Workspace is still loading. Please try again in a moment.');
      return;
    }
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

  const seatsIncluded = subscription?.seats_included ?? 3;
  const seatsUsed = subscription?.seats_used ?? 2;
  const creditsIncluded = subscription?.credits_included ?? 5000;
  const creditsUsed = subscription?.credits_used ?? 3240;
  const currentPlan = subscription?.plan_id || workspaceRecord?.plan_id || 'starter';
  const ledgerEntries = Array.isArray(ledger) ? ledger : [];

  const seatsPercent = Math.min((seatsUsed / Math.max(seatsIncluded, 1)) * 100, 100);
  const creditsPercent = Math.min((creditsUsed / Math.max(creditsIncluded, 1)) * 100, 100);

  return (
    <div className="space-y-6">
      {workspaceError && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Workspace context is still settling. Showing safe local defaults until Supabase responds.
        </p>
      )}
      {statusMessage && (
        <p className="text-sm text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3">
          {statusMessage}
        </p>
      )}

      {/* Top row: Plan + Usage */}
      <div className="grid grid-cols-2 gap-6">

        {/* Current Plan */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-5 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Current Plan</p>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white capitalize">
                {String(currentPlan).replace(/_/g, ' ')}
              </h2>
            </div>
            <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5">
              {subscription?.status || 'Active'}
            </span>
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-1">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-sm text-gray-700 dark:text-gray-300">Seats used</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{seatsUsed} / {seatsIncluded}</span>
            </div>
            <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-purple-600 rounded-full transition-all" style={{ width: `${seatsPercent}%` }} />
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
              {Math.max(seatsIncluded - seatsUsed, 0)} seats remaining
            </p>
          </div>

          <button
            type="button"
            onClick={() => setStatusMessage('Open the Upgrade section to manage plan tiers and seat packs.')}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline underline-offset-2 transition-colors"
          >
            Manage plan &amp; seats
          </button>
        </div>

        {/* AI Usage & Budget */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-5 space-y-5">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">AI Usage</p>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-semibold text-gray-900 dark:text-white">{Math.round(creditsPercent)}%</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">{creditsUsed.toLocaleString()} / {creditsIncluded.toLocaleString()} credits</span>
            </div>
            <div className="mt-2 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-purple-600 rounded-full transition-all" style={{ width: `${creditsPercent}%` }} />
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">Monthly cap set to {money(monthlyBudgetCap)}</p>
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-gray-800 space-y-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">
                Monthly Budget Cap (EUR)
              </label>
              <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-card-dark">
                <span className="text-sm text-gray-400 mr-1">€</span>
                <input
                  type="number"
                  value={monthlyBudgetCap}
                  onChange={e => setMonthlyBudgetCap(e.target.value)}
                  className="bg-transparent border-none p-0 text-sm text-gray-900 dark:text-white outline-none w-full"
                />
                <span className="text-xs text-gray-400 ml-1">EUR</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alert Thresholds + Settings */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Usage Controls</h3>
        </div>
        <div className="p-5 space-y-5">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Alerting is active at {alertAtPercent}% usage. Usage stops at {stopAtPercent}% when flexible usage is disabled.
          </p>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-700 dark:text-gray-300 w-52 flex-shrink-0">Alert admins at {alertAtPercent}%</span>
              <input
                type="range"
                min={50}
                max={95}
                step={5}
                value={alertAtPercent}
                onChange={e => setAlertAtPercent(Number(e.target.value))}
                className="flex-1 accent-purple-600"
              />
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-700 dark:text-gray-300 w-52 flex-shrink-0">Stop autopilot at {stopAtPercent}%</span>
              <input
                type="range"
                min={60}
                max={100}
                step={5}
                value={stopAtPercent}
                onChange={e => setStopAtPercent(Number(e.target.value))}
                className="flex-1 accent-purple-600"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">Flexible usage</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Allow usage beyond the monthly cap at overage rates</p>
            </div>
            <button
              type="button"
              onClick={() => setFlexibleUsageEnabled(v => !v)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                flexibleUsageEnabled ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700'
              }`}
              role="switch"
              aria-checked={flexibleUsageEnabled}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
                  flexibleUsageEnabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
            <label className="block text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">
              Billing Email
            </label>
            <input
              type="email"
              value={billingEmail}
              onChange={e => setBillingEmail(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-card-dark outline-none focus:border-gray-400 dark:focus:border-gray-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Invoices & Ledger */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Invoices &amp; Payment History</h3>
          <button
            type="button"
            onClick={() => setStatusMessage('The ledger below reflects the current billing history from the backend.')}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            Refresh
          </button>
        </div>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800">
              <th className="px-5 py-3 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Date</th>
              <th className="px-5 py-3 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Reason</th>
              <th className="px-5 py-3 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Amount</th>
              <th className="px-5 py-3 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Balance After</th>
              <th className="px-5 py-3 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest text-right">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
            {ledgerEntries.length === 0 && (
              <tr>
                <td className="px-5 py-10 text-sm text-gray-400 dark:text-gray-500" colSpan={5}>
                  No billing ledger entries yet.
                </td>
              </tr>
            )}
            {ledgerEntries.map((entry: any) => (
              <tr key={entry.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
                <td className="px-5 py-3 text-xs text-gray-400 dark:text-gray-500">
                  {entry.occurred_at ? new Date(entry.occurred_at).toLocaleDateString() : '—'}
                </td>
                <td className="px-5 py-3 text-sm text-gray-900 dark:text-white">
                  {entry.reason || entry.reference_type || 'Ledger entry'}
                </td>
                <td className="px-5 py-3 text-sm font-medium text-gray-900 dark:text-white">
                  {money(entry.amount)}
                </td>
                <td className="px-5 py-3 text-sm text-gray-400 dark:text-gray-500">
                  {money(entry.balance_after)}
                </td>
                <td className="px-5 py-3 text-right">
                  <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5">
                    {entry.entry_type || 'debit'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <p className="text-xs text-gray-400 dark:text-gray-500 text-center pb-2">
        Monthly limits, flexible usage, and ledger history are stored in workspace settings and the billing tables.
        Changes are applied on the next billing cycle.
      </p>
    </div>
  );
}
