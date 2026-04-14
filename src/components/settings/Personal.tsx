import React from 'react';

export default function PersonalTab() {
  return (
    <div className="space-y-8">
      {/* Profile */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Profile</h2>
          <p className="text-xs text-gray-500">Update your photo and personal details.</p>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-8 mb-8">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-indigo-500 flex items-center justify-center text-white text-2xl font-bold ring-4 ring-white dark:ring-gray-900 shadow-lg">HS</div>
              <button className="absolute bottom-0 right-0 w-8 h-8 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-lg">edit</span>
              </button>
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Your Avatar</h3>
              <p className="text-xs text-gray-500 mb-2">JPG, GIF or PNG. Max size of 800K</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Full Name</label>
              <input type="text" defaultValue="Hector Smith" className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Email Address</label>
              <input type="email" defaultValue="hector.smith@enterprise.co" className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Personal Timezone</label>
            <select className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none appearance-none">
              <option>(GMT-08:00) Pacific Time (US & Canada)</option>
              <option>(GMT+00:00) UTC</option>
              <option>(GMT+01:00) Europe/Madrid</option>
            </select>
          </div>
        </div>
      </section>

      {/* Interface Preferences */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Interface Preferences</h2>
          <p className="text-xs text-gray-500">Customize your visual experience and shortcuts.</p>
        </div>
        <div className="p-6">
          <div className="mb-8">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-4">Theme</label>
            <div className="grid grid-cols-3 gap-4">
              {[
                { id: 'light', label: 'Light', icon: 'light_mode', active: false },
                { id: 'dark', label: 'Dark', icon: 'dark_mode', active: false },
                { id: 'system', label: 'System', icon: 'desktop_windows', active: true },
              ].map(theme => (
                <button key={theme.id} className={`flex flex-col gap-3 p-4 rounded-xl border-2 transition-all text-left ${theme.active ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/10' : 'border-gray-100 dark:border-gray-800 hover:border-gray-200'}`}>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">{theme.icon}</span>
                    <span className="text-xs font-bold">{theme.label}</span>
                  </div>
                  <div className="h-12 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden flex flex-col p-2 gap-1">
                    <div className="w-2/3 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full"></div>
                    <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full opacity-50"></div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-4">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">Enabled Keyboard Shortcuts</label>
              <button className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline">View all shortcuts</button>
            </div>
            <div className="grid grid-cols-2 gap-x-12 gap-y-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-6">
              {[
                { label: 'Global Search', keys: ['Ctrl', 'K'] },
                { label: 'Quick Reply', keys: ['R'] },
                { label: 'Next Ticket', keys: ['J'] },
                { label: 'Previous Ticket', keys: ['K'] },
              ].map(shortcut => (
                <div key={shortcut.label} className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">{shortcut.label}</span>
                  <div className="flex gap-1.5">
                    {shortcut.keys.map(key => (
                      <span key={key} className="px-1.5 py-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-card text-[10px] font-bold text-gray-400">{key}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* My Notifications */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card p-6">
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">My Notifications</h2>
          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 uppercase">Personal Override</span>
        </div>
        <p className="text-xs text-gray-500">Control how you are alerted independently of workspace defaults.</p>
      </section>
    </div>
  );
}
