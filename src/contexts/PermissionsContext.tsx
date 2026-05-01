import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { iamApi } from '../api/client';

interface PermissionsState {
  permissions: string[];
  roleId: string | null;
  userId: string | null;
  isOwner: boolean;
  isAdmin: boolean;
  loading: boolean;
  /** True if current user has wildcard (*) — i.e. workspace_admin / owner */
  isSuperAdmin: boolean;
}

interface PermissionsContextValue extends PermissionsState {
  /** Check a single permission key */
  has: (permission: string) => boolean;
  /** True if the user has ANY of the listed permissions */
  hasAny: (permissions: string[]) => boolean;
  /** True if the user has ALL of the listed permissions */
  hasAll: (permissions: string[]) => boolean;
  /** Refresh from the API (call after role change) */
  refresh: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextValue>({
  permissions: [],
  roleId: null,
  userId: null,
  isOwner: false,
  isAdmin: false,
  loading: true,
  isSuperAdmin: false,
  has: () => false,
  hasAny: () => false,
  hasAll: () => false,
  refresh: async () => {},
});

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PermissionsState>({
    permissions: [],
    roleId: null,
    userId: null,
    isOwner: false,
    isAdmin: false,
    loading: true,
    isSuperAdmin: false,
  });

  const load = useCallback(async () => {
    try {
      const me = await iamApi.me();
      const perms: string[] = me?.context?.permissions || [];
      const roleId: string = me?.context?.role_id || me?.role || 'viewer';
      const userId: string = me?.id || '';
      const isWildcard = perms.includes('*');
      const isOwner = isWildcard || roleId === 'owner';
      const isAdmin = isOwner || roleId === 'workspace_admin' || roleId === 'supervisor';

      setState({
        permissions: perms,
        roleId,
        userId,
        isOwner,
        isAdmin,
        loading: false,
        isSuperAdmin: isWildcard,
      });
    } catch {
      // Fallback: treat as full-access (demo / dev mode)
      setState({
        permissions: ['*'],
        roleId: 'workspace_admin',
        userId: 'system',
        isOwner: true,
        isAdmin: true,
        loading: false,
        isSuperAdmin: true,
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const has = useCallback(
    (permission: string) => {
      if (state.isSuperAdmin) return true;
      return state.permissions.includes(permission);
    },
    [state.permissions, state.isSuperAdmin],
  );

  const hasAny = useCallback(
    (permissions: string[]) => permissions.some(p => has(p)),
    [has],
  );

  const hasAll = useCallback(
    (permissions: string[]) => permissions.every(p => has(p)),
    [has],
  );

  const value = useMemo<PermissionsContextValue>(
    () => ({ ...state, has, hasAny, hasAll, refresh: load }),
    [state, has, hasAny, hasAll, load],
  );

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}

/** Convenience: just the has() checker — useful in non-component code */
export function useHas(permission: string) {
  const { has } = useContext(PermissionsContext);
  return has(permission);
}
