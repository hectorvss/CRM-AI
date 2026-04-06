import React from 'react';

export default function AccessPermissionsTab() {
  const permissions = [
    { domain: 'Inbox', level: 'Edit' },
    { domain: 'Orders', level: 'View only' },
    { domain: 'Payments', level: 'No access' },
    { domain: 'Returns', level: 'Edit' },
    { domain: 'Approvals', level: 'Approve' },
    { domain: 'Workflows', level: 'View only' },
    { domain: 'Knowledge', level: 'Edit' },
    { domain: 'Customers', level: 'Edit' },
    { domain: 'Integrations', level: 'No access' },
    { domain: 'Reports', level: 'View only' },
    { domain: 'Settings / Admin', level: 'No access' },
    { domain: 'Billing & Plans', level: 'No access' },
    { domain: 'AI Studio', level: 'View only' },
  ];

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'Admin':
      case 'Approve':
        return 'text-purple-700 bg-purple-50 border-purple-200 dark:text-purple-400 dark:bg-purple-900/20 dark:border-purple-800/30';
      case 'Edit':
        return 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-800/30';
      case 'View only':
        return 'text-gray-700 bg-gray-100 border-gray-200 dark:text-gray-300 dark:bg-gray-800 dark:border-gray-700';
      case 'No access':
      default:
        return 'text-gray-400 bg-gray-50 border-gray-100 dark:text-gray-500 dark:bg-gray-900/50 dark:border-gray-800';
    }
  };

  return (
    <div className="space-y-8">
      {/* Read-Only Admin Context */}
      <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-4 border border-blue-100 dark:border-blue-800/30 flex gap-3 items-center">
        <span className="material-symbols-outlined text-blue-500 text-xl">admin_panel_settings</span>
        <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">
          Permissions are managed by your workspace administrator.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-8">
        <div className="col-span-1 space-y-8">
          {/* Role */}
          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Current Role</h2>
              <span className="material-symbols-outlined text-gray-400">badge</span>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <span className="material-symbols-outlined">support_agent</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Support Lead</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Assigned by Admin</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                Manages daily support queues, handles escalations, and approves standard returns. Has read-only access to reporting and workflows.
              </p>
            </div>
          </section>

          {/* Special Access Flags */}
          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Special Access</h2>
              <span className="material-symbols-outlined text-gray-400">key</span>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-green-500 text-[18px]">check_circle</span>
                <span className="text-sm text-gray-700 dark:text-gray-300">Can approve refunds</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-green-500 text-[18px]">check_circle</span>
                <span className="text-sm text-gray-700 dark:text-gray-300">Can edit knowledge</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-gray-300 dark:text-gray-600 text-[18px]">cancel</span>
                <span className="text-sm text-gray-400 dark:text-gray-500">Can manage workflows</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-gray-300 dark:text-gray-600 text-[18px]">cancel</span>
                <span className="text-sm text-gray-400 dark:text-gray-500">Can access billing</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-gray-300 dark:text-gray-600 text-[18px]">cancel</span>
                <span className="text-sm text-gray-400 dark:text-gray-500">Can manage integrations</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-gray-300 dark:text-gray-600 text-[18px]">cancel</span>
                <span className="text-sm text-gray-400 dark:text-gray-500">Can view audit logs</span>
              </div>
            </div>
          </section>
        </div>

        <div className="col-span-2">
          {/* Permissions Summary */}
          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden h-full">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Domain Permissions</h2>
              <span className="material-symbols-outlined text-gray-400">rule</span>
            </div>
            <div className="p-0">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20">
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Domain Area</th>
                    <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 text-right">Access Level</th>
                  </tr>
                </thead>
                <tbody>
                  {permissions.map((perm, idx) => (
                    <tr key={idx} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="px-6 py-3">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{perm.domain}</span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-medium border ${getLevelColor(perm.level)}`}>
                          {perm.level}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
