import React from 'react';

export default function ActivityTab() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-8">
        <div className="col-span-2 space-y-8">
          {/* Audit Trail Snapshot */}
          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Operational Activity</h2>
              <span className="material-symbols-outlined text-gray-400">list_alt</span>
            </div>
            <div className="p-0">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Action</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Resource</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 text-right">Time</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">Approved Refund</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-300">Order #ORD-9921</span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className="text-xs text-gray-500 dark:text-gray-400">10 mins ago</span>
                    </td>
                  </tr>
                  <tr className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">Resolved Case</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-300">Case #CAS-1042</span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className="text-xs text-gray-500 dark:text-gray-400">1 hour ago</span>
                    </td>
                  </tr>
                  <tr className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">Edited Knowledge</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-300">Article: "Return Policy 2024"</span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className="text-xs text-gray-500 dark:text-gray-400">3 hours ago</span>
                    </td>
                  </tr>
                  <tr className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">Triggered Workflow</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-300">Escalate to Tier 2</span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Yesterday, 14:20</span>
                    </td>
                  </tr>
                  <tr className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">Resolved Case</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-300">Case #CAS-1038</span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Yesterday, 11:05</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 text-center">
              <button className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                View full audit log
              </button>
            </div>
          </section>
        </div>

        <div className="col-span-1 space-y-8">
          {/* Product Activity Summary */}
          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Activity Summary (30d)</h2>
              <span className="material-symbols-outlined text-gray-400">bar_chart</span>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-gray-50 dark:border-gray-800/50">
                <span className="text-sm text-gray-500 dark:text-gray-400">Cases Handled</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">142</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-gray-50 dark:border-gray-800/50">
                <span className="text-sm text-gray-500 dark:text-gray-400">Approvals Reviewed</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">38</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-gray-50 dark:border-gray-800/50">
                <span className="text-sm text-gray-500 dark:text-gray-400">Workflows Triggered</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">12</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-gray-50 dark:border-gray-800/50">
                <span className="text-sm text-gray-500 dark:text-gray-400">Knowledge Edits</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">5</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500 dark:text-gray-400">AI Actions Reviewed</span>
                <span className="text-sm font-bold text-gray-900 dark:text-white">89</span>
              </div>
            </div>
          </section>

          {/* Recent Account Activity */}
          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Account Log</h2>
              <span className="material-symbols-outlined text-gray-400">manage_accounts</span>
            </div>
            <div className="p-0">
              <div className="p-4 border-b border-gray-50 dark:border-gray-800/50 flex gap-3">
                <span className="material-symbols-outlined text-gray-400 text-[18px] mt-0.5">login</span>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Signed in</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Today, 08:42 AM</p>
                </div>
              </div>
              <div className="p-4 border-b border-gray-50 dark:border-gray-800/50 flex gap-3">
                <span className="material-symbols-outlined text-gray-400 text-[18px] mt-0.5">notifications_active</span>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Updated notification preferences</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Oct 12, 2024</p>
                </div>
              </div>
              <div className="p-4 flex gap-3">
                <span className="material-symbols-outlined text-gray-400 text-[18px] mt-0.5">person</span>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Updated profile photo</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Sep 05, 2024</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
