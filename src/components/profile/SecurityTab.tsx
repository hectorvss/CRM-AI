import React from 'react';

export default function SecurityTab() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-8">
        <div className="col-span-2 space-y-8">
          {/* Login & Authentication */}
          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Login & Authentication</h2>
              <span className="material-symbols-outlined text-gray-400">lock</span>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between pb-6 border-b border-gray-100 dark:border-gray-800">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Password</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Last updated 3 months ago</p>
                </div>
                <button className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
                  Change password
                </button>
              </div>

              <div className="flex items-center justify-between pb-6 border-b border-gray-100 dark:border-gray-800">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">Two-Factor Authentication (2FA)</h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium border bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-100 dark:border-green-800/30">Enabled</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Using Authenticator App</p>
                </div>
                <button className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
                  Manage 2FA
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Single Sign-On (SSO)</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Not configured for this workspace</p>
                </div>
                <button className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm font-bold text-gray-400 dark:text-gray-600 cursor-not-allowed">
                  Configure
                </button>
              </div>
            </div>
          </section>

          {/* Active Sessions */}
          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Active Sessions</h2>
              <span className="material-symbols-outlined text-gray-400">devices</span>
            </div>
            <div className="p-0">
              <div className="flex items-center justify-between p-6 border-b border-gray-50 dark:border-gray-800/50">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <span className="material-symbols-outlined">laptop_mac</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white">Mac OS • Chrome</h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium border bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border-blue-100 dark:border-blue-800/30">Current Session</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Madrid, Spain • Active now</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-6">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400">
                    <span className="material-symbols-outlined">smartphone</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-0.5">iOS • Safari</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Madrid, Spain • Last active 2 hours ago</p>
                  </div>
                </div>
                <button className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline">Revoke</button>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
              <button className="text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
                Sign out of all other sessions
              </button>
            </div>
          </section>
        </div>

        <div className="col-span-1 space-y-8">
          {/* Account Safety Status */}
          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Safety Status</h2>
              <span className="material-symbols-outlined text-gray-400">shield</span>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-300">2FA Enabled</span>
                <span className="material-symbols-outlined text-green-500 text-[18px]">check_circle</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-300">Email Verified</span>
                <span className="material-symbols-outlined text-green-500 text-[18px]">check_circle</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-300">Suspicious Activity</span>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">None detected</span>
              </div>
              
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/10 p-3 rounded-xl border border-green-100 dark:border-green-800/30">
                  <span className="material-symbols-outlined text-[20px]">verified_user</span>
                  <span className="text-sm font-medium">Account is secure</span>
                </div>
              </div>
            </div>
          </section>

          {/* Security Events */}
          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Events</h2>
              <span className="material-symbols-outlined text-gray-400">history</span>
            </div>
            <div className="p-0">
              <div className="p-4 border-b border-gray-50 dark:border-gray-800/50 flex gap-3">
                <span className="material-symbols-outlined text-gray-400 text-[18px] mt-0.5">login</span>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">New login (Mac OS)</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Today, 08:42 AM</p>
                </div>
              </div>
              <div className="p-4 border-b border-gray-50 dark:border-gray-800/50 flex gap-3">
                <span className="material-symbols-outlined text-gray-400 text-[18px] mt-0.5">phonelink_erase</span>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Session revoked</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Oct 10, 2024</p>
                </div>
              </div>
              <div className="p-4 flex gap-3">
                <span className="material-symbols-outlined text-gray-400 text-[18px] mt-0.5">password</span>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Password changed</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Jul 15, 2024</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
