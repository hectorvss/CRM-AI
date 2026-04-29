import React, { useMemo } from 'react';
import { useApi } from '../../api/hooks';
import { iamApi } from '../../api/client';
import { PERMISSION_CATALOG, PERMISSION_DOMAINS } from '../../permissions/catalog';
import { usePermissions } from '../../contexts/PermissionsContext';
import LoadingState from '../LoadingState';

const FALLBACK_USER = {
  id: 'system',
  email: 'system@crm-ai.local',
  name: 'System',
  role: 'workspace_admin',
  context: { role_id: 'workspace_admin', permissions: ['*'] },
  memberships: [],
};

export default function AccessPermissionsTab() {
  const { data: user, loading } = useApi<any>(iamApi.me);
  const { data: roles } = useApi<any[]>(iamApi.roles);
  const { isOwner, isSuperAdmin } = usePermissions();
  const currentUser = user || FALLBACK_USER;

  const roleId = currentUser?.context?.role_id || currentUser?.memberships?.[0]?.role_id || null;
  const role = useMemo(() => (roles || []).find((item: any) => item.id === roleId) || null, [roleId, roles]);
  const rolePermissions = Array.isArray(role?.permissions) ? role.permissions : [];
  const userPermissions = currentUser?.context?.permissions || rolePermissions || [];
  const granted = useMemo(() => new Set<string>(userPermissions), [userPermissions]);
  const hasWildcard = granted.has('*');

  if (loading) return <LoadingState title="Loading access permissions" message="Checking your live role membership and access matrix." compact />;

  const currentRoleName = role?.name || currentUser?.memberships?.[0]?.role_name || currentUser?.role || 'Unknown';
  const totalPermissions = PERMISSION_CATALOG.length;
  const grantedCount = hasWildcard ? totalPermissions : PERMISSION_CATALOG.filter(p => granted.has(p.key)).length;
  const deniedCount = totalPermissions - grantedCount;

  return (
    <div className="space-y-6">
      {/* Top banner — your access overview */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-2xl">{isOwner ? 'workspace_premium' : 'badge'}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white capitalize">{String(currentRoleName).replace(/_/g, ' ')}</h2>
                {isOwner && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 uppercase tracking-wider">Owner</span>
                )}
                {!isOwner && isSuperAdmin && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 uppercase tracking-wider">Admin</span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{role?.is_system === 1 ? 'System role' : 'Custom role'} · {grantedCount} of {totalPermissions} permissions</p>
            </div>
          </div>
          {!isOwner && !isSuperAdmin && (
            <a
              href="mailto:admin@workspace.local?subject=Permission%20Request"
              className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold shadow-card hover:bg-gray-50 dark:hover:bg-gray-700 transition-all flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[16px]">mail</span>
              Request more access
            </a>
          )}
        </div>
        <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-gray-800">
          <div className="p-5 text-center">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Granted</p>
            <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{grantedCount}</p>
          </div>
          <div className="p-5 text-center">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Denied</p>
            <p className="text-3xl font-bold text-gray-300 dark:text-gray-600">{deniedCount}</p>
          </div>
          <div className="p-5 text-center">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Coverage</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{Math.round((grantedCount / totalPermissions) * 100)}%</p>
          </div>
        </div>
      </section>

      {/* Permission matrix grouped by domain */}
      <div className="grid grid-cols-2 gap-4">
        {PERMISSION_DOMAINS.map(domain => {
          const domainPerms = PERMISSION_CATALOG.filter(p => p.domain === domain);
          const domainGranted = hasWildcard ? domainPerms : domainPerms.filter(p => granted.has(p.key));
          const allGranted = domainGranted.length === domainPerms.length;
          const noneGranted = domainGranted.length === 0;

          return (
            <section key={domain} className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/20">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-gray-500 text-[18px]">{domainPerms[0]?.domainIcon || 'folder'}</span>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">{domain}</h3>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  allGranted ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' :
                  noneGranted ? 'bg-gray-100 text-gray-400 dark:bg-gray-800' :
                  'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
                }`}>
                  {domainGranted.length} / {domainPerms.length}
                </span>
              </div>
              <div className="p-2 divide-y divide-gray-50 dark:divide-gray-800/50">
                {domainPerms.map(p => {
                  const isGranted = hasWildcard || granted.has(p.key);
                  return (
                    <div key={p.key} className="flex items-start gap-3 p-2.5">
                      <span className={`material-symbols-outlined text-[18px] mt-0.5 flex-shrink-0 ${
                        isGranted ? 'text-emerald-500' : 'text-gray-300 dark:text-gray-700'
                      }`}>
                        {isGranted ? 'check_circle' : 'cancel'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium ${isGranted ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>{p.label}</div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{p.description}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Help footer */}
      {!isOwner && !isSuperAdmin && (
        <section className="bg-indigo-50/50 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 p-6">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 text-xl">info</span>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-200 mb-1">Need more access?</h3>
              <p className="text-xs text-indigo-800/70 dark:text-indigo-300/70 leading-relaxed">
                Your access is governed by your role. To request additional permissions, contact your workspace administrator.
                The matrix above is the same one the backend uses to enforce access — what you see is what you can do.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
