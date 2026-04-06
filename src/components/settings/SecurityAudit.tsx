import React from 'react';

export default function SecurityAuditTab() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-6">
        {/* Access Control */}
        <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-400">
                <span className="material-symbols-outlined">key</span>
              </div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Access Control</h2>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-700 border border-green-100 uppercase">Active</span>
          </div>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">SSO Authentication (SAML 2.0)</h3>
                <p className="text-xs text-gray-500">Enforce single sign-on for all team members.</p>
              </div>
              <button className="relative inline-flex h-5 w-9 items-center rounded-full bg-indigo-600 transition-colors focus:outline-none">
                <span className="translate-x-4.5 inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"></span>
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Session Timeout</label>
              <select className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm outline-none">
                <option>12 hours</option>
                <option>24 hours</option>
                <option>7 days</option>
              </select>
              <p className="text-[10px] text-gray-400 mt-2">Automatically log out inactive users.</p>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">IP Allowlist</label>
                <button className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline">+ Add IP</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {['192.168.1.0/24', '10.0.0.55'].map(ip => (
                  <div key={ip} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2.5 py-1 rounded-lg">
                    <span className="text-xs font-medium">{ip}</span>
                    <button className="text-gray-400 hover:text-red-500 transition-colors"><span className="material-symbols-outlined text-[14px]">close</span></button>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">Restrict access to specific IP ranges.</p>
            </div>
          </div>
        </section>

        {/* Data Retention */}
        <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card p-6 flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-400">
              <span className="material-symbols-outlined">database</span>
            </div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Data Retention</h2>
          </div>
          <div className="space-y-6 flex-1">
            <div>
              <div className="flex justify-between items-baseline mb-4">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Audit Log Retention Period</h3>
                <span className="text-xs font-bold bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">90 Days</span>
              </div>
              <div className="relative h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full mb-2">
                <div className="absolute left-0 top-0 h-full bg-indigo-600 rounded-full" style={{ width: '30%' }}></div>
                <div className="absolute left-[30%] top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-indigo-600 rounded-full shadow-card cursor-pointer"></div>
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                <span>30 Days</span>
                <span>1 Year</span>
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-100 dark:border-gray-700/50 flex gap-3">
              <span className="material-symbols-outlined text-gray-400 text-sm">info</span>
              <p className="text-[11px] text-gray-500 leading-relaxed">Logs older than the retention period are automatically archived to cold storage for 7 years to meet compliance standards (SOC2, GDPR).</p>
            </div>
          </div>
          <div className="pt-6 mt-auto border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-gray-900 dark:text-white">Export Audit Logs</h4>
              <p className="text-[10px] text-gray-500">Download full activity history as CSV/JSON.</p>
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold hover:bg-gray-50 transition-all shadow-card">
              <span className="material-symbols-outlined text-sm">download</span>
              Export
            </button>
          </div>
        </section>
      </div>

      {/* Audit Log */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-gray-400">history</span>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Audit Log</h2>
          </div>
          <div className="flex gap-3">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-2 text-gray-400 text-sm">search</span>
              <input type="text" placeholder="Search events, users, or IPs..." className="pl-9 pr-4 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs outline-none w-64" />
            </div>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold shadow-card">
              <span className="material-symbols-outlined text-sm">filter_list</span>
              Filter
            </button>
          </div>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              <th className="px-6 py-3">User</th>
              <th className="px-6 py-3">Event</th>
              <th className="px-6 py-3">IP Address</th>
              <th className="px-6 py-3">Location</th>
              <th className="px-6 py-3 text-right">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50 text-xs">
            {[
              { user: 'Maya Anderson', initial: 'MA', color: 'bg-purple-100 text-purple-600', event: 'Approved refund', sub: 'Order #88321', amount: '$499.00', ip: '192.168.1.42', loc: 'San Francisco, US', time: 'Just now' },
              { user: 'Hector Ramirez', initial: 'HR', color: 'bg-blue-100 text-blue-600', event: 'Updated Refund Policy', sub: 'Knowledge Base Settings', ip: '24.102.88.12', loc: 'Austin, US', time: '24 mins ago' },
              { user: 'John Doe', initial: 'JD', color: 'bg-green-100 text-green-600', event: 'Exported customer list', sub: 'CSV Download', ip: '10.0.0.55', loc: 'London, UK', time: '1 hour ago' },
              { user: 'System (Auto)', initial: 'SYS', color: 'bg-gray-100 text-gray-600', event: 'Failed login attempt', sub: 'Blocked by Firewall', ip: '185.200.11.2', loc: 'Unknown', time: '2 hours ago', error: true },
            ].map((log, i) => (
              <tr key={i} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] ${log.color}`}>{log.initial}</div>
                    <span className="font-bold text-gray-900 dark:text-white">{log.user}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div>
                    <span className="font-medium text-gray-900 dark:text-white">{log.event}</span>
                    {log.amount && <span className="ml-2 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-mono text-[10px]">{log.amount}</span>}
                    <p className={`text-[10px] mt-0.5 ${log.error ? 'text-red-500 font-bold' : 'text-gray-400'}`}>{log.sub}</p>
                  </div>
                </td>
                <td className="px-6 py-4 font-mono text-gray-500">{log.ip}</td>
                <td className="px-6 py-4 text-gray-500">{log.loc}</td>
                <td className="px-6 py-4 text-right text-gray-400">{log.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
