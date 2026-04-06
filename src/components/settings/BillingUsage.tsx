import React from 'react';

export default function BillingUsageTab() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-6">
        {/* Plan Info */}
        <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-100 uppercase">Active</span>
          </div>
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <span className="material-symbols-outlined text-3xl">diamond</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Enterprise Plan</h2>
              <p className="text-xs text-gray-500">Billed annually. Next invoice on Nov 12, 2024.</p>
            </div>
          </div>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Seats Used</h3>
                <span className="text-sm font-bold text-gray-900 dark:text-white">42 / 50</span>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-600 rounded-full" style={{ width: '84%' }}></div>
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-gray-500">
                <span className="material-symbols-outlined text-sm">group</span>
                8 seats remaining
              </div>
            </div>
            <button className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-2">
              Manage Plan & Seats
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
        </section>

        {/* AI Usage & Budget */}
        <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card p-6">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center text-orange-600 dark:text-orange-400">
                <span className="material-symbols-outlined">smart_toy</span>
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">AI Usage & Budget</h2>
                <p className="text-[10px] text-gray-500">Monthly token consumption cycle resets in 8 days</p>
              </div>
            </div>
            <button className="text-xs font-bold text-gray-500 hover:text-gray-900 transition-colors">View Usage Details</button>
          </div>
          <div className="space-y-6">
            <div className="flex items-center gap-8">
              <div className="flex-1">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-3xl font-bold text-gray-900 dark:text-white">72%</span>
                  <span className="text-xs font-medium text-gray-500">14.4M / 20M Tokens</span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full" style={{ width: '72%' }}></div>
                </div>
                <p className="text-[10px] text-gray-400 mt-2">Projected usage: ~19.2M tokens by month end.</p>
              </div>
              <div className="w-px h-16 bg-gray-100 dark:bg-gray-800"></div>
              <div className="w-40">
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Monthly Budget Cap (USD)</label>
                <div className="flex items-center bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
                  <span className="text-sm font-bold text-gray-400 mr-1">$</span>
                  <input type="text" defaultValue="2,500.00" className="bg-transparent border-none p-0 text-sm font-bold outline-none w-full" />
                  <span className="text-[10px] font-bold text-gray-400 ml-1">USD</span>
                </div>
              </div>
            </div>
            <div className="bg-orange-50 dark:bg-orange-900/10 rounded-xl p-4 border border-orange-100 dark:border-orange-900/30 flex gap-3">
              <span className="material-symbols-outlined text-orange-600 dark:text-orange-400 text-sm">warning</span>
              <p className="text-[11px] text-orange-800/70 dark:text-orange-300/70 leading-relaxed">You are approaching your 80% soft limit. Consider upgrading your token tier to avoid service interruption for non-admin users.</p>
            </div>
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Alert Thresholds</h4>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded bg-indigo-600 flex items-center justify-center text-white"><span className="material-symbols-outlined text-[10px]">check</span></div>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Alert Admins at 80% usage</span>
                </div>
                <span className="text-[10px] font-bold text-gray-400 uppercase">~16M tokens</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded bg-indigo-600 flex items-center justify-center text-white"><span className="material-symbols-outlined text-[10px]">check</span></div>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Stop Autopilot at 90% usage</span>
                </div>
                <span className="text-[10px] font-bold text-gray-400 uppercase">~18M tokens</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Invoices */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Invoices & Payment History</h2>
          <div className="flex gap-3">
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold shadow-card">
              <span className="material-symbols-outlined text-sm">mail</span>
              Update Billing Email
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold shadow-card">
              Download All
            </button>
          </div>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              <th className="px-6 py-3">Invoice ID</th>
              <th className="px-6 py-3">Date</th>
              <th className="px-6 py-3">Amount</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50 text-xs">
            {[
              { id: 'INV-2024-0012', date: 'Oct 12, 2024', amount: '$2,450.00', status: 'Paid' },
              { id: 'INV-2024-0011', date: 'Sep 12, 2024', amount: '$2,450.00', status: 'Paid' },
              { id: 'INV-2024-0010', date: 'Aug 12, 2024', amount: '$2,100.00', status: 'Paid' },
            ].map((inv, i) => (
              <tr key={i} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
                <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">{inv.id}</td>
                <td className="px-6 py-4 text-gray-500">{inv.date}</td>
                <td className="px-6 py-4 font-bold text-gray-900 dark:text-white">{inv.amount}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 uppercase">{inv.status}</span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors">
                    <span className="material-symbols-outlined text-lg">download</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
