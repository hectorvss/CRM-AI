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
  const { data: user, loading } = useApi<any>(iamApi.me, []);
  const { data: roles } = useApi<any[]>(iamApi.roles, []);
  const { data: accessTargets } = useApi<any[]>(iamApi.accessRequestTargets, []);
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
  const adminContacts = useMemo(() => {
    if (Array.isArray(accessTargets) && accessTargets.length > 0) {
      return accessTargets;
    }
    const roleMap = new Map((roles || []).map((item: any) => [item.id, item]));
    return (currentUser?.memberships || []).filter((membership: any) => {
      const roleRecord = roleMap.get(membership.role_id);
      const roleName = String(roleRecord?.name || membership.role_name || '').toLowerCase();
      return roleName === 'owner' || roleName === 'workspace_admin';
    }).map((membership: any) => ({
      name: membership.role_name,
      email: '',
    }));
  }, [accessTargets, currentUser?.memberships, roles]);
  const requestAccessHref = useMemo(() => {
    const recipients = adminContacts
      .map((workspaceUser: any) => workspaceUser.email)
      .filter((email: string | undefined): email is string => Boolean(email));
    const to = encodeURIComponent(recipients[0] || currentUser?.email || 'support@crm-ai.local');
    const cc = recipients.slice(1).join(',');
    const subject = encodeURIComponent(`Access request for ${currentRoleName}`);
    const body = encodeURIComponent(
      [
        'Hello,',
        '',
        `I would like to request a review of my workspace permissions.`,
        `Current role: ${currentRoleName}`,
        `User: ${currentUser.name} <${currentUser.email}>`,
        '',
        'Requested change:',
        '- ',
      ].join('\n'),
    );
    return `mailto:${to}?subject=${subject}&body=${body}${cc ? `&cc=${encodeURIComponent(cc)}` : ''}`;
  }, [adminContacts, currentRoleName, currentUser.email, currentUser.name]);
  const adminSummary = adminContacts.length > 0
    ? adminContacts.map((workspaceUser: any) => workspaceUser.name || workspaceUser.email).join(', ')
    : 'workspace administrators';

  return (
    <div className="space-y-6">
      {/* Role overview */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white capitalize">
                {String(currentRoleName).replace(/_/g, ' ')}
              </h2>
              {isOwner && (
                <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5">Owner</span>
              )}
              {!isOwner && isSuperAdmin && (
                <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5">Admin</span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {role?.is_system === 1 ? 'System role' : 'Custom role'} · {grantedCount} of {totalPermissions} permissions
            </p>
          </div>
          {!isOwner && !isSuperAdmin && (
            <a
              href={requestAccessHref}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline underline-offset-2"
            >
              Request access
            </a>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-gray-100 dark:border-gray-800">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Granted</p>
            <p className="text-2xl font-semibold text-gray-900 dark:text-white">{grantedCount}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Denied</p>
            <p className="text-2xl font-semibold text-gray-400 dark:text-gray-600">{deniedCount}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Coverage</p>
            <p className="text-2xl font-semibold text-gray-900 dark:text-white">{Math.round((grantedCount / totalPermissions) * 100)}%</p>
          </div>
        </div>
      </div>

      {/* Permission matrix */}
      <div className="grid grid-cols-2 gap-4">
        {PERMISSION_DOMAINS.map(domain => {
          const domainPerms = PERMISSION_CATALOG.filter(p => p.domain === domain);
          const domainGranted = hasWildcard ? domainPerms.length : domainPerms.filter(p => granted.has(p.key)).length;

          return (
            <div key={domain} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{domain}</h3>
                <span className="text-xs text-gray-400 dark:text-gray-500">{domainGranted}/{domainPerms.length}</span>
              </div>
              <div className="divide-y divide-gray-50 dark:divide-gray-800/50">
                {domainPerms.map(p => {
                  const isGranted = hasWildcard || granted.has(p.key);
                  return (
                    <div key={p.key} className="flex items-start gap-3 px-4 py-2.5">
                      <span className={`material-symbols-outlined text-[18px] mt-0.5 flex-shrink-0 ${isGranted ? 'text-emerald-500' : 'text-gray-300 dark:text-gray-700'}`}>
                        {isGranted ? 'check_circle' : 'cancel'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${isGranted ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-600'}`}>
                          {p.label}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{p.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Help note */}
      {!isOwner && !isSuperAdmin && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
          Your access is governed by your role. Requests will be addressed to {adminSummary}.
        </p>
      )}
    </div>
  );
}
