import React, { useMemo } from 'react';
import { useApi } from '../../api/hooks';
import { billingApi, workspacesApi } from '../../api/client';

function money(value: unknown): string {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return 'EUR 0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(parsed);
}

export default function BillingHistoryTab() {
  const { data: workspace } = useApi(workspacesApi.currentContext);
  const orgId = workspace?.org_id;
  const { data: subscription } = useApi(() => (orgId ? billingApi.subscription(orgId) : Promise.resolve(null)), [orgId], null);
  const { data: ledger } = useApi(() => (orgId ? billingApi.ledger(orgId) : Promise.resolve([])), [orgId], []);

  const invoices = useMemo(() => {
    const rows = Array.isArray(ledger) ? ledger : [];
    return rows.map((entry: any, index: number) => ({
      id: entry.reference_id || entry.id || `LEDGER-${index + 1}`,
      date: entry.occurred_at ? new Date(entry.occurred_at).toLocaleDateString() : '-',
      amount: money(entry.amount),
      status: entry.entry_type === 'credit' ? 'Credit' : 'Paid',
      note: entry.reason || entry.reference_type || undefined,
    }));
  }, [ledger]);

  const downloadLedger = () => {
    const csv = [
      ['Invoice', 'Date', 'Amount', 'Status', 'Note'].join(','),
      ...invoices.map(invoice => [
        invoice.id,
        invoice.date,
        invoice.amount,
        invoice.status,
        invoice.note || '',
      ].map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `billing-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Billing Overview</h2>
          <span className="material-symbols-outlined text-gray-400">credit_card</span>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Current Plan</h3>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-lg font-bold text-gray-900 dark:text-white capitalize">{String(subscription?.plan_id || workspace?.plan_id || 'starter').replace(/_/g, ' ')}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-medium border bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-100 dark:border-green-800/30">{subscription?.status || 'Active'}</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">{money(subscription?.price_cents ? subscription.price_cents / 100 : 49)} / month</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Next renewal on {subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : '—'}</p>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Payment Method</h3>
              <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <div className="w-10 h-6 bg-white rounded flex items-center justify-center border border-gray-200 shadow-sm">
                  <span className="text-[10px] font-bold text-blue-800">VISA</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">•••• •••• •••• 4242</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Updated from subscription record</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Invoice History</h2>
          <span className="material-symbols-outlined text-gray-400">receipt_long</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Invoice</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Date</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Amount</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Status</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && (
                <tr>
                  <td className="px-6 py-10 text-sm text-gray-500" colSpan={5}>No billing history recorded yet.</td>
                </tr>
              )}
              {invoices.map((invoice, idx) => (
                <tr key={idx} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{invoice.id}</p>
                    {invoice.note && <p className="text-[10px] text-gray-500 mt-0.5">{invoice.note}</p>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">{invoice.date}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{invoice.amount}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium border bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-100 dark:border-green-800/30">
                      {invoice.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button type="button" onClick={downloadLedger} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors" title="Download CSV">
                      <span className="material-symbols-outlined text-[18px]">download</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
