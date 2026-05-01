import React from 'react';
import { usePermissions } from '../contexts/PermissionsContext';

interface CanProps {
  /** Single permission key — e.g. 'orders.write' */
  permission?: string;
  /** User must have ANY of these permissions */
  any?: string[];
  /** User must have ALL of these permissions */
  all?: string[];
  /** Requires owner-level access */
  owner?: boolean;
  /** Requires admin-level access */
  admin?: boolean;
  /** Rendered if the check fails. Defaults to null (hidden) */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * <Can> — permission-aware wrapper component.
 *
 * Examples:
 *   <Can permission="orders.write">…</Can>
 *   <Can any={['payments.write','approvals.decide']}>…</Can>
 *   <Can owner fallback={<span>Owner only</span>}>…</Can>
 */
export default function Can({
  permission,
  any,
  all,
  owner,
  admin,
  fallback = null,
  children,
}: CanProps) {
  const { has, hasAny, hasAll, isOwner, isAdmin } = usePermissions();

  let allowed = true;

  if (owner && !isOwner) allowed = false;
  if (admin && !isAdmin) allowed = false;
  if (permission && !has(permission)) allowed = false;
  if (any && any.length > 0 && !hasAny(any)) allowed = false;
  if (all && all.length > 0 && !hasAll(all)) allowed = false;

  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}

/** Disabled (greyed-out) version — shows but disables the child */
export function CanOrDisable({
  permission,
  children,
}: {
  permission: string;
  children: React.ReactElement;
}) {
  const { has } = usePermissions();
  const allowed = has(permission);

  if (allowed) return children;

  return React.cloneElement(children, {
    disabled: true,
    title: `Requires: ${permission}`,
    className: `${children.props.className || ''} opacity-40 cursor-not-allowed`,
    onClick: undefined,
  });
}
