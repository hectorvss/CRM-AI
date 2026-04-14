import React from 'react';

export default function NotificationsTab() {
  return (
    <div className="space-y-8">
      {/* Routing Rules */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
          <span className="material-symbols-outlined text-gray-400">route</span>
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Routing Rules</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Define where specific alerts should be delivered based on event type.</p>
          </div>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {[
            { event: 'SLA at risk', tag: 'CRITICAL', tagColor: 'bg-red-50 text-red-600 border-red-100', desc: 'Triggered when ticket response time exceeds 80% of defined SLA.', destination: '#support-alerts', destIcon: 'tag' },
            { event: 'New Approval Request', tag: 'ACTION', tagColor: 'bg-blue-50 text-blue-600 border-blue-100', desc: 'Notifies when an agent requests manager approval for refunds >$100.', destination: '#billing', destIcon: 'mail', extra: 'Email' },
            { event: 'Tool Execution Failure', tag: 'WARNING', tagColor: 'bg-orange-50 text-orange-600 border-orange-100', desc: 'Triggered when an integrated tool (e.g. Shopify, Stripe) returns a 5xx error.', destination: 'Engineering Lead', destIcon: 'person' },
          ].map((rule, i) => (
            <div key={i} className="p-6 flex items-center justify-between group hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
              <div className="flex-1 pr-8">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">{rule.event}</h3>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${rule.tagColor}`}>{rule.tag}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{rule.desc}</p>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-xl">
                  {rule.extra && <span className="text-[10px] font-bold text-gray-400 uppercase mr-1">{rule.extra}</span>}
                  <span className="material-symbols-outlined text-sm text-gray-400">{rule.destIcon}</span>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{rule.destination}</span>
                  <span className="material-symbols-outlined text-sm text-gray-400">expand_more</span>
                </div>
                <div className="flex items-center gap-3">
                  <button className="relative inline-flex h-5 w-9 items-center rounded-full bg-indigo-600 transition-colors focus:outline-none">
                    <span className="translate-x-4.5 inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"></span>
                  </button>
                  <button className="text-gray-300 hover:text-gray-500 transition-colors">
                    <span className="material-symbols-outlined text-lg">more_vert</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button className="w-full p-4 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-sm">add</span>
            Add New Routing Rule
          </button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-6">
        {/* Quiet Hours */}
        <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <span className="material-symbols-outlined">dark_mode</span>
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Quiet Hours</h2>
                <p className="text-[10px] text-gray-500">Suppress non-urgent alerts</p>
              </div>
            </div>
            <button className="relative inline-flex h-5 w-9 items-center rounded-full bg-indigo-600 transition-colors focus:outline-none">
              <span className="translate-x-4.5 inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"></span>
            </button>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">Start Time</label>
                <div className="flex items-center bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
                  <span className="material-symbols-outlined text-sm text-gray-400 mr-2">schedule</span>
                  <span className="text-sm font-medium">10:00 PM</span>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5">End Time</label>
                <div className="flex items-center bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
                  <span className="material-symbols-outlined text-sm text-gray-400 mr-2">schedule</span>
                  <span className="text-sm font-medium">07:00 AM</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
              <span className="text-xs text-gray-500">Allow critical "SLA at risk" alerts to break through</span>
            </div>
          </div>
        </section>

        {/* Summary Digests */}
        <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <span className="material-symbols-outlined">summarize</span>
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Summary Digests</h2>
              <p className="text-[10px] text-gray-500">Consolidated reports</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700 rounded-xl">
              <div>
                <h3 className="text-xs font-bold text-gray-900 dark:text-white">Daily Recap</h3>
                <p className="text-[10px] text-gray-500">Sent at 8:00 AM local time</p>
              </div>
              <button className="relative inline-flex h-5 w-9 items-center rounded-full bg-indigo-600 transition-colors focus:outline-none">
                <span className="translate-x-4.5 inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"></span>
              </button>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700 rounded-xl">
              <div>
                <h3 className="text-xs font-bold text-gray-900 dark:text-white">Weekly Executive Brief</h3>
                <p className="text-[10px] text-gray-500">Sent Mondays at 9:00 AM</p>
              </div>
              <button className="relative inline-flex h-5 w-9 items-center rounded-full bg-indigo-600 transition-colors focus:outline-none">
                <span className="translate-x-4.5 inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"></span>
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Global Policy Info */}
      <div className="bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 p-6 flex gap-4">
        <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400">info</span>
        <div>
          <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-200 mb-1">Global Notification Policy</h3>
          <p className="text-xs text-indigo-800/70 dark:text-indigo-300/70 leading-relaxed">
            Changes to these settings will affect all 14 members of the 'Support Alpha' team immediately. Individual user preferences for 'Do Not Disturb' will override 'Action' and 'Warning' level alerts, but 'Critical' alerts will always be delivered to on-call staff.
          </p>
        </div>
      </div>
    </div>
  );
}
