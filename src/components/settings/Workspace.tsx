import React from 'react';

export default function WorkspaceTab() {
  return (
    <div className="space-y-8">
      {/* Workspace Profile */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Workspace Profile</h2>
          <span className="material-symbols-outlined text-gray-400">domain</span>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center bg-gray-50 dark:bg-gray-800/50">
                <span className="material-symbols-outlined text-gray-400 text-3xl">image</span>
              </div>
              <button className="absolute -bottom-1 -right-1 w-6 h-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full flex items-center justify-center shadow-card">
                <span className="material-symbols-outlined text-[14px]">edit</span>
              </button>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Workspace Logo</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">This logo will appear on your help center and email notifications.</p>
              <button className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">Upload new</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Workspace Name</label>
              <input 
                type="text" 
                defaultValue="Support Alpha"
                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Primary Domain</label>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-500 text-sm">https://</span>
                <input 
                  type="text" 
                  defaultValue="support-alpha.helpdesk.com"
                  className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-r-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Default Timezone</label>
            <select className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all appearance-none">
              <option>(GMT+01:00) Europe/Madrid</option>
              <option>(GMT+00:00) UTC</option>
              <option>(GMT-05:00) Eastern Time</option>
            </select>
            <p className="text-[10px] text-gray-400 mt-2">This timezone will be used for all reporting and business hours calculation.</p>
          </div>
        </div>
      </section>

      {/* Business Hours */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Business Hours</h2>
          <span className="material-symbols-outlined text-gray-400">schedule</span>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-gray-500 dark:text-gray-400">Set your team's availability. Messages received outside these hours will trigger an auto-responder.</p>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Enable Schedule</span>
              <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-indigo-600 transition-colors focus:outline-none">
                <span className="translate-x-6 inline-block h-4 w-4 transform rounded-full bg-white transition-transform"></span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-indigo-50/30 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 rounded-xl">
              <div className="flex items-center gap-4">
                <div className="w-5 h-5 rounded bg-indigo-600 flex items-center justify-center text-white">
                  <span className="material-symbols-outlined text-[14px]">check</span>
                </div>
                <div>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">Weekdays</span>
                  <span className="ml-4 text-xs text-gray-500">Mon, Tue, Wed, Thu, Fri</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 shadow-card">
                  <span className="text-xs font-medium mr-2">09:00 AM</span>
                  <span className="material-symbols-outlined text-[14px] text-gray-400">schedule</span>
                </div>
                <span className="text-gray-400">−</span>
                <div className="flex items-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 shadow-card">
                  <span className="text-xs font-medium mr-2">06:00 PM</span>
                  <span className="material-symbols-outlined text-[14px] text-gray-400">schedule</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700 rounded-xl opacity-60">
              <div className="flex items-center gap-4">
                <div className="w-5 h-5 rounded border border-gray-300 dark:border-gray-600"></div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Saturday</span>
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-lg">Closed</span>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700 rounded-xl opacity-60">
              <div className="flex items-center gap-4">
                <div className="w-5 h-5 rounded border border-gray-300 dark:border-gray-600"></div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Sunday</span>
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-lg">Closed</span>
            </div>
          </div>
        </div>
      </section>

      {/* Supported Languages */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Supported Languages</h2>
          <span className="material-symbols-outlined text-gray-400">translate</span>
        </div>
        <div className="p-6">
          <div className="flex flex-wrap gap-2">
            {['English (US)', 'Spanish', 'French', 'German', 'Portuguese'].map((lang) => (
              <div key={lang} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-xl">
                <span className="text-xs font-medium">{lang}</span>
                <button className="text-gray-400 hover:text-red-500 transition-colors">
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </div>
            ))}
            <button className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 px-3 py-1.5 rounded-xl text-indigo-600 dark:text-indigo-400 hover:border-indigo-500 transition-all">
              <span className="material-symbols-outlined text-[14px]">add</span>
              <span className="text-xs font-bold">Add Language</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
