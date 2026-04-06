import React from 'react';

export default function UsageTab() {
  return (
    <div className="space-y-8">
      {/* Usage Overview */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Current Cycle Usage</h2>
          <span className="text-xs text-gray-500 dark:text-gray-400">Oct 12, 2024 - Nov 12, 2024</span>
        </div>
        <div className="p-6 space-y-8">
          
          {/* AI Credits Usage */}
          <div>
            <div className="flex justify-between items-end mb-2">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-indigo-500">auto_awesome</span>
                  AI Credits
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Included in Starter plan</p>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-gray-900 dark:text-white">3,240</span>
                <span className="text-xs text-gray-500 dark:text-gray-400"> / 5,000</span>
              </div>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2.5 mb-2 overflow-hidden">
              <div className="bg-indigo-500 h-2.5 rounded-full" style={{ width: '64.8%' }}></div>
            </div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">You have 1,760 credits remaining this cycle.</p>
          </div>

          {/* Seat Usage */}
          <div>
            <div className="flex justify-between items-end mb-2">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-gray-400">group</span>
                  Seats
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Included in Starter plan</p>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-gray-900 dark:text-white">2</span>
                <span className="text-xs text-gray-500 dark:text-gray-400"> / 3</span>
              </div>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2.5 mb-2 overflow-hidden">
              <div className="bg-gray-500 dark:bg-gray-400 h-2.5 rounded-full" style={{ width: '66.6%' }}></div>
            </div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">You have 1 seat available to invite.</p>
          </div>

        </div>
      </section>

      {/* Add-ons / Top-ups */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Add-ons & Top-ups</h2>
          <span className="material-symbols-outlined text-gray-400">extension</span>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <span className="material-symbols-outlined">toll</span>
              </div>
              <div>
                <h4 className="text-sm font-bold text-gray-900 dark:text-white">Extra AI Credits</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">No active top-up packs.</p>
              </div>
            </div>
            <button className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
              Buy Credits
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
