import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../api/hooks';
import { billingApi, workspacesApi } from '../../api/client';
import LoadingState from '../LoadingState';
import { MinimalButton, MinimalCard, MinimalPill, MinimalProgressBar } from '../MinimalCategoryShell';
import { NavigateInput } from '../../types';

type SaveHandler = (() => Promise<void> | void) | null;
type Props = {
  onSaveReady?: (handler: SaveHandler) => void;
  onNavigate?: (target: NavigateInput) => void;
};

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
  if (Number.isNaN(parsed)) return 'EUR 0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(parsed);
}

export default function BillingUsageTab({ onSaveReady, onNavigate }: Props) {
  const { data: workspace, loading: workspaceLoading, error: workspaceError } = useApi(workspacesApi.currentContext);
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
  const ledgerEntries = Array.isArray(ledger) ? ledger : [];

  return (
    <div className="space-y-5">
      {workspaceError && (
        <div className="rounded-2xl border border-black/5 bg-black/[0.015] px-4 py-3 text-sm text-gray-600 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-300">
          Workspace context is still settling. Showing safe local defaults until Supabase responds.
        </div>
      )}
      {statusMessage && (
        <div className="rounded-2xl border border-black/5 bg-black/[0.015] px-4 py-3 text-sm text-gray-600 dark:border-white/10 dark:bg-white/[0.02] dark:text-gray-300">
          {statusMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <MinimalCard
          title="Billing overview"
          subtitle="Current subscription and usage at a glance."
          icon="diamond"
          action={<MinimalPill tone="active">{subscription?.status || 'Active'}</MinimalPill>}
        >
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="rounded-2xl border border-black/5 bg-black/[0.015] p-4 dark:border-white/10 dark:bg-white/[0.02]">
                <p className="text-[10px] uppercase tracking-[0.18em] text-gray-400">Plan</p>
                <p className="mt-2 text-base font-semibold text-gray-950 dark:text-white capitalize">{String(subscription?.plan_id || workspaceRecord?.plan_id || 'starter').replace(/_/g, ' ')}</p>
              </div>
              <div className="rounded-2xl border border-black/5 bg-black/[0.015] p-4 dark:border-white/10 dark:bg-white/[0.02]">
                <p className="text-[10px] uppercase tracking-[0.18em] text-gray-400">Budget</p>
                <p className="mt-2 text-base font-semibold text-gray-950 dark:text-white">{money(monthlyBudgetCap)}</p>
              </div>
            </div>

            <div className="space-y-5">
              <MinimalProgressBar label="Seats used" value={seatsUsed} max={seatsIncluded} />
              <MinimalProgressBar label="Credits used" value={creditsUsed} max={creditsIncluded} />
            </div>

            <div className="flex items-center justify-between gap-4 text-xs text-gray-500">
              <span>{Math.max(seatsIncluded - seatsUsed, 0)} seats remaining</span>
              <span>{creditsUsed.toLocaleString()} of {creditsIncluded.toLocaleString()} credits used</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <MinimalButton onClick={() => onNavigate?.({ page: 'upgrade', entityType: 'workspace', section: 'plans', sourceContext: 'settings_billing' })}>
                Manage plan & seats
              </MinimalButton>
              <MinimalButton variant="outline" onClick={() => setStatusMessage('Budget, alert thresholds, flexible usage, and billing email can be edited in the controls panel.')}>
                Edit controls
              </MinimalButton>
            </div>
          </div>
        </MinimalCard>

        <MinimalCard
          title="Billing controls"
          subtitle="Budget, alerts, and contact details."
          icon="settings"
          action={(
            <MinimalButton variant="ghost" onClick={() => setStatusMessage('Usage details are reflected in the billing ledger below.')}>
              Details
            </MinimalButton>
          )}
        >
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-gray-400">Budget cap</label>
                <div className="flex items-center gap-2 rounded-full border border-black/5 bg-black/[0.015] px-4 py-2.5 dark:border-white/10 dark:bg-white/[0.02]">
                  <span className="text-sm text-gray-400">EUR</span>
                  <input
                    type="number"
                    value={monthlyBudgetCap}
                    onChange={event => setMonthlyBudgetCap(event.target.value)}
                    className="w-full border-none bg-transparent p-0 text-sm font-medium text-gray-950 outline-none dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-gray-400">Billing email</label>
                <input
                  type="email"
                  value={billingEmail}
                  onChange={event => setBillingEmail(event.target.value)}
                  className="w-full rounded-full border border-black/5 bg-black/[0.015] px-4 py-2.5 text-sm text-gray-950 outline-none transition-colors focus:border-black/20 dark:border-white/10 dark:bg-white/[0.02] dark:text-white"
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-400">Alert thresholds</label>
              <div className="space-y-4 rounded-2xl border border-black/5 bg-black/[0.015] p-4 dark:border-white/10 dark:bg-white/[0.02]">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-gray-600 dark:text-gray-300">Alert admins at {alertAtPercent}% usage</span>
                    <span className="text-xs text-gray-400">{alertAtPercent}%</span>
                  </div>
                  <input type="range" min={50} max={95} step={5} value={alertAtPercent} onChange={event => setAlertAtPercent(Number(event.target.value))} className="w-full accent-violet-500" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-gray-600 dark:text-gray-300">Stop autopilot at {stopAtPercent}% usage</span>
                    <span className="text-xs text-gray-400">{stopAtPercent}%</span>
                  </div>
                  <input type="range" min={60} max={100} step={5} value={stopAtPercent} onChange={event => setStopAtPercent(Number(event.target.value))} className="w-full accent-violet-500" />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setFlexibleUsageEnabled(current => !current)}
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-black/5 dark:border-white/10 dark:bg-[#171717] dark:text-gray-200 dark:hover:bg-white/5"
            >
              <span className="material-symbols-outlined text-[16px]">{flexibleUsageEnabled ? 'toggle_on' : 'toggle_off'}</span>
              Flexible usage {flexibleUsageEnabled ? 'enabled' : 'disabled'}
            </button>
          </div>
        </MinimalCard>
      </div>

      <MinimalCard
        title="Invoices & payment history"
        subtitle="Billing events from the workspace ledger."
        icon="receipt_long"
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <MinimalButton variant="outline" onClick={() => setStatusMessage('Edit the Billing email field in Billing controls, then save preferences.')}>
              Update billing email
            </MinimalButton>
            <MinimalButton variant="ghost" onClick={() => setStatusMessage('The ledger below reflects the current billing history from the backend.')}>
              Refresh
            </MinimalButton>
          </div>
        )}
      >
        <div className="overflow-hidden rounded-2xl border border-black/5 dark:border-white/10">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-black/5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:border-white/10">
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Reason</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Balance after</th>
                <th className="px-5 py-3 text-right">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 text-sm dark:divide-white/10">
              {ledgerEntries.length === 0 && (
                <tr>
                  <td className="px-5 py-10 text-sm text-gray-500" colSpan={5}>
                    No billing ledger entries yet.
                  </td>
                </tr>
              )}
              {ledgerEntries.map((entry: any) => (
                <tr key={entry.id} className="transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
                  <td className="px-5 py-4 text-gray-500">{entry.occurred_at ? new Date(entry.occurred_at).toLocaleDateString() : '-'}</td>
                  <td className="px-5 py-4 font-medium text-gray-950 dark:text-white">{entry.reason || entry.reference_type || 'Ledger entry'}</td>
                  <td className="px-5 py-4 font-medium text-gray-950 dark:text-white">{money(entry.amount)}</td>
                  <td className="px-5 py-4 text-gray-500">{money(entry.balance_after)}</td>
                  <td className="px-5 py-4 text-right">
                    <MinimalPill>{entry.entry_type || 'debit'}</MinimalPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MinimalCard>

      <div className="flex items-center justify-between gap-4 rounded-[24px] border border-black/5 bg-black/[0.02] p-6 dark:border-white/10 dark:bg-white/[0.03]">
        <div>
          <h3 className="text-sm font-semibold text-gray-950 dark:text-white">Billing policy</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Monthly limits, flexible usage, and ledger history are stored in workspace settings and the billing tables.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSave().catch(() => undefined)}
          disabled={isSaving}
          className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save preferences
        </button>
      </div>
    </div>
  );
}
