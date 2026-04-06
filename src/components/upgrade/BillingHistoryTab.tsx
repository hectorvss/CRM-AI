import React from 'react';

export default function BillingHistoryTab() {
  const invoices = [
    { id: 'INV-2024-10', date: 'Oct 12, 2024', amount: '€49.00', status: 'Paid' },
    { id: 'INV-2024-09', date: 'Sep 12, 2024', amount: '€49.00', status: 'Paid' },
    { id: 'INV-2024-08', date: 'Aug 12, 2024', amount: '€128.00', status: 'Paid', note: 'Includes 5,000 extra credits' },
  ];

  return (
    <div className="space-y-8">
      {/* Billing Overview */}
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
                <span className="text-lg font-bold text-gray-900 dark:text-white">Starter Plan</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-medium border bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-100 dark:border-green-800/30">Active</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">€49.00 / month</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Next renewal on Nov 12, 2024</p>
            </div>
            
            <div>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Payment Method</h3>
              <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <div className="w-10 h-6 bg-white rounded flex items-center justify-center border border-gray-200 shadow-sm">
                  <span className="text-[10px] font-bold text-blue-800">VISA</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">•••• •••• •••• 4242</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Expires 12/2025</p>
                </div>
                <button className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">Update</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Invoice History */}
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
                    <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors" title="Download PDF">
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
