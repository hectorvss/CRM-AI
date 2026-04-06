import React from 'react';

export default function NotificationsTab() {
  return (
    <div className="space-y-8">
      {/* Channel Preferences */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Channel Preferences</h2>
          <span className="material-symbols-outlined text-gray-400">notifications</span>
        </div>
        <div className="p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Email Notifications</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Receive alerts and digests via email</p>
              </div>
              <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-indigo-600 transition-colors focus:outline-none">
                <span className="translate-x-6 inline-block h-4 w-4 transform rounded-full bg-white transition-transform"></span>
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">In-App Notifications</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Show badges and toasts while using the app</p>
              </div>
              <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-indigo-600 transition-colors focus:outline-none">
                <span className="translate-x-6 inline-block h-4 w-4 transform rounded-full bg-white transition-transform"></span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-8">
        {/* Alert Preferences */}
        <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Alert Types</h2>
            <span className="material-symbols-outlined text-gray-400">tune</span>
          </div>
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">Approval Requests</span>
              <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-indigo-600 transition-colors focus:outline-none">
                <span className="translate-x-6 inline-block h-4 w-4 transform rounded-full bg-white transition-transform"></span>
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">Case Escalations</span>
              <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-indigo-600 transition-colors focus:outline-none">
                <span className="translate-x-6 inline-block h-4 w-4 transform rounded-full bg-white transition-transform"></span>
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">Mentions (@alex)</span>
              <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-indigo-600 transition-colors focus:outline-none">
                <span className="translate-x-6 inline-block h-4 w-4 transform rounded-full bg-white transition-transform"></span>
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">Workflow Failures</span>
              <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-gray-200 dark:bg-gray-700 transition-colors focus:outline-none">
                <span className="translate-x-1 inline-block h-4 w-4 transform rounded-full bg-white transition-transform"></span>
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">Security Alerts</span>
              <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-indigo-600 transition-colors focus:outline-none opacity-50 cursor-not-allowed">
                <span className="translate-x-6 inline-block h-4 w-4 transform rounded-full bg-white transition-transform"></span>
              </button>
            </div>
          </div>
        </section>

        {/* Intensity & Escalation */}
        <div className="space-y-8">
          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Email Digest</h2>
              <span className="material-symbols-outlined text-gray-400">mail</span>
            </div>
            <div className="p-6">
              <select className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all appearance-none">
                <option>Real-time (Immediate)</option>
                <option>Daily Digest (Morning)</option>
                <option>Important Only</option>
                <option>Off</option>
              </select>
              <p className="text-xs text-gray-500 mt-2">Controls how often you receive summary emails for non-critical events.</p>
            </div>
          </section>

          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Personal Escalations</h2>
              <span className="material-symbols-outlined text-gray-400">priority_high</span>
            </div>
            <div className="p-6 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" defaultChecked className="mt-1 w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
                <div>
                  <span className="block text-sm font-medium text-gray-900 dark:text-white">Notify me on assigned cases</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">When a case is directly assigned to you</span>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" defaultChecked className="mt-1 w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
                <div>
                  <span className="block text-sm font-medium text-gray-900 dark:text-white">Notify me on my approvals</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">When an approval requires your specific review</span>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="mt-1 w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
                <div>
                  <span className="block text-sm font-medium text-gray-900 dark:text-white">Notify me on AI action failures</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">When an automated AI action fails on your cases</span>
                </div>
              </label>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
