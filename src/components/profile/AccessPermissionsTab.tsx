import React, { useMemo } from 'react';
import { useApi } from '../../api/hooks';
import { iamApi } from '../../api/client';
import LoadingState from '../LoadingState';

const DOMAINS = [
  ['Inbox', 'inbox.read'],
  ['Orders', 'orders.read'],
  ['Payments', 'payments.read'],
  ['Returns', 'returns.read'],
  ['Approvals', 'approvals.read'],
  ['Knowledge', 'knowledge.read'],
  ['Customers', 'customers.read'],
  ['Integrations', 'integrations.read'],
  ['Reports', 'reports.read'],
  ['Settings / Admin', 'settings.read'],
  ['Billing & Plans', 'billing.read'],
  ['AI Studio', 'ai.read'],
] as const;

export default function AccessPermissionsTab() {
  const { data: user, loading, error } = useApi<any>(iamApi.me);
  const { data: roles } = useApi<any[]>(iamApi.roles);

  const roleId = user?.context?.role_id || user?.memberships?.[0]?.role_id || null;
  const role = useMemo(() => (roles || []).find((item: any) => item.id === roleId) || null, [roleId, roles]);
  const rolePermissions = Array.isArray(role?.permissions) ? role.permissions : [];
  const permissions = useMemo(() => new Set<string>(user?.context?.permissions || rolePermissions || []), [rolePermissions, user?.context?.permissions]);

  if (loading) return <LoadingState title="Loading access permissions" message="Checking your live role membership and access matrix." compact />;
  if (error || !user) return <div className="p-6 text-sm text-red-500">Error loading access permissions.</div>;

  const currentRoleName = role?.name || user?.memberships?.[0]?.role_name || user?.role || 'Unknown';
  const specialAccess = [
    ['Can approve refunds', permissions.has('payments.write') || permissions.has('approvals.write')],
    ['Can edit knowledge', permissions.has('knowledge.write')],
    ['Can manage workflows', permissions.has('workflows.write')],
    ['Can access billing', permissions.has('billing.read')],
    ['Can manage integrations', permissions.has('integrations.write')],
    ['Can view audit logs', permissions.has('audit.read')],
  ];

  return (
    <div className="space-y-8">
      <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-4 border border-blue-100 dark:border-blue-800/30 flex gap-3 items-center">
        <span className="material-symbols-outlined text-blue-500 text-xl">admin_panel_settings</span>
        <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">
          Permissions are derived from your live role membership. This view mirrors what the backend enforces.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-8">
        <div className="col-span-1 space-y-8">
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
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{currentRoleName}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{role?.is_system ? 'System role' : 'Custom role'}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {role?.description || 'Your role governs the capabilities shown in the matrix on the right.'}
              </p>
            </div>
          </section>

          <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Special Access</h2>
              <span className="material-symbols-outlined text-gray-400">key</span>
            </div>
            <div className="p-6 space-y-4">
              {specialAccess.map(([label, enabled]) => (
                <div key={String(label)} className="flex items-center gap-3">
                  <span className={`material-symbols-outlined text-[18px] ${enabled ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'}`}>{enabled ? 'check_circle' : 'cancel'}</span>
                  <span className={`text-sm ${enabled ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>{label as string}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="col-span-2">
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
                  {DOMAINS.map(([domain, key]) => {
                    const enabled = permissions.has(key);
                    return (
                      <tr key={domain} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                        <td className="px-6 py-3">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{domain}</span>
                        </td>
                        <td className="px-6 py-3 text-right">
                          <span className={`px-2.5 py-1 rounded-md text-xs font-medium border ${enabled ? 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-800/30' : 'text-gray-400 bg-gray-50 border-gray-100 dark:text-gray-500 dark:bg-gray-900/50 dark:border-gray-800'}`}>
                            {enabled ? 'Granted' : 'No access'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
