import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { createIAMRepository } from '../data/iam.js';
import { createWorkspaceRepository } from '../data/workspaces.js';
import { logger } from '../utils/logger.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { sendError } from '../http/errors.js';
import { decodeJwtTimes, evaluateAuthPolicy, type AuthPolicyResult } from '../services/authPolicy.js';

/**
 * Custom Request type to include tenant and workspace context.
 */
export interface MultiTenantRequest extends Request {
  tenantId?: string;
  workspaceId?: string;
  userId?: string;
  roleId?: string;
  permissions?: string[];
  authPolicy?: AuthPolicyResult;
}

const ROLE_PERMISSION_PRESETS: Record<string, string[]> = {
  owner: ['*'],
  workspace_admin: ['*'],
  supervisor: [
    'inbox.read',
    'cases.read', 'cases.write', 'cases.assign',
    'customers.read', 'customers.write',
    'orders.read', 'orders.write',
    'payments.read', 'payments.write',
    'returns.read', 'returns.write',
    'approvals.read', 'approvals.decide',
    'workflows.read', 'workflows.write', 'workflows.trigger',
    'knowledge.read', 'knowledge.write', 'knowledge.publish',
    'reports.read', 'reports.export',
    'integrations.read',
    'settings.read', 'settings.write',
    'members.read', 'members.invite', 'members.remove',
    'audit.read',
  ],
  agent: [
    'inbox.read',
    'cases.read', 'cases.write',
    'customers.read',
    'orders.read',
    'payments.read',
    'returns.read',
    'approvals.read',
    'workflows.read', 'workflows.trigger',
    'knowledge.read',
    'reports.read',
    'settings.read',
  ],
  viewer: [
    'inbox.read',
    'cases.read',
    'customers.read',
    'orders.read',
    'payments.read',
    'returns.read',
    'approvals.read',
    'workflows.read',
    'knowledge.read',
    'reports.read',
    'settings.read',
    'billing.read',
  ],
  billing_admin: ['billing.read', 'billing.manage'],
};

function normalizePermissions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((permission): permission is string => typeof permission === 'string');
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((permission): permission is string => typeof permission === 'string')
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

async function resolvePermissions(
  roleId: string,
  explicitPermissions: unknown,
): Promise<string[]> {
  const iamRepo = createIAMRepository();

  // For built-in privileged roles (owner / workspace_admin) we still consult the
  // role_assignments table first, so a tenant that has explicitly customized the
  // owner role's permissions is respected. Only when no assignment exists do we
  // fall back to the wildcard preset.
  if (roleId === 'owner' || roleId === 'workspace_admin') {
    try {
      const mappedPermissions = await iamRepo.getPermissionKeys(roleId);
      if (mappedPermissions.length > 0) {
        return mappedPermissions;
      }
    } catch (error) {
      // ignore — fall through to preset
    }

    const parsedPermissions = normalizePermissions(explicitPermissions);
    if (parsedPermissions.length > 0) {
      return parsedPermissions;
    }

    return ROLE_PERMISSION_PRESETS[roleId]; // ['*']
  }

  try {
    const mappedPermissions = await iamRepo.getPermissionKeys(roleId);

    if (mappedPermissions.length > 0) {
      return mappedPermissions;
    }
  } catch (error) {
    // Falls back if role management is not fully initialized or custom roles are missing
  }

  const parsedPermissions = normalizePermissions(explicitPermissions);
  return parsedPermissions.length > 0
    ? parsedPermissions
    : ROLE_PERMISSION_PRESETS[roleId] || ROLE_PERMISSION_PRESETS.viewer;
}

export interface ResolvedTenantContext {
  tenantId: string;
  workspaceId: string;
  userId?: string;
  /** True when resolved via anonymous fallback (no explicit auth or headers). */
  isAnonymousFallback?: boolean;
}

export async function resolveTenantWorkspaceContext(
  tenantId?: string | null,
  workspaceId?: string | null,
  userId?: string | null,
): Promise<ResolvedTenantContext> {
  const workspaceRepo = createWorkspaceRepository();

  if (tenantId && workspaceId && workspaceId !== 'ws_default') {
    return {
      tenantId,
      workspaceId,
      userId: userId || 'system',
    };
  }

  try {
    if (tenantId && workspaceId === 'ws_default') {
      const workspace = await workspaceRepo.getById(workspaceId, tenantId);
      if (workspace) {
        return {
          tenantId: workspace.org_id || tenantId,
          workspaceId: workspace.id,
          userId: userId || 'system',
        };
      }
    }

    if (tenantId && !workspaceId) {
      const matchingWorkspace = await workspaceRepo.findByOrg(tenantId);
      if (matchingWorkspace) {
        return {
          tenantId: matchingWorkspace.org_id,
          workspaceId: matchingWorkspace.id,
          userId: userId || 'system',
        };
      }
    }

    const ws = await workspaceRepo.getFirstWorkspace();
    if (ws) {
      return {
        tenantId: tenantId || ws.org_id,
        workspaceId: workspaceId || ws.id,
        userId: userId || 'system',
      };
    }
  } catch {
    // Fall through to demo defaults if the backing store is not yet ready.
  }

  // Anonymous fallback — only safe for local development with demo data.
  // In production this is blocked at the middleware level.
  return {
    tenantId: tenantId || 'org_default',
    workspaceId: workspaceId || 'ws_default',
    userId: userId || 'system',
    isAnonymousFallback: true,
  };
}

/**
 * Middleware: extractMultiTenant
 * - Extracts tenant context from headers.
 * - For development, falls back to the first organization/workspace in the DB if none provided.
 */
export const extractMultiTenant = async (req: MultiTenantRequest, res: Response, next: NextFunction) => {
  const tenantHeader = req.headers['x-tenant-id'] as string;
  const workspaceHeader = req.headers['x-workspace-id'] as string;
  const userHeader = req.headers['x-user-id'] as string;
  const authHeader = req.headers.authorization;

  const iamRepo = createIAMRepository();
  const workspaceRepo = createWorkspaceRepository();

  try {
    let resolvedUserId = userHeader || '';
    let resolved = await resolveTenantWorkspaceContext(tenantHeader, workspaceHeader, resolvedUserId);
    let authContext: Parameters<typeof evaluateAuthPolicy>[0]['auth'] = resolvedUserId === 'system' ? { provider: 'system' } : { provider: userHeader ? 'header' : 'system' };

    if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
      const rawToken = authHeader.slice(7).trim();
      if (rawToken) {
        try {
          const jwtTimes = decodeJwtTimes(rawToken);
          const supabase = getSupabaseAdmin();
          const { data: authData } = await supabase.auth.getUser(rawToken);

          if (authData?.user) {
            resolvedUserId = authData.user.id;
            authContext = {
              provider: 'supabase',
              ...jwtTimes,
              mfaVerified: Boolean(jwtTimes.mfaVerified || authData.user.app_metadata?.mfa_enabled || authData.user.user_metadata?.mfa_enabled),
              ssoVerified: Boolean(jwtTimes.ssoVerified || authData.user.app_metadata?.sso || authData.user.user_metadata?.sso),
            };
            
            let claimTenantId = authData.user.app_metadata?.tenant_id || authData.user.user_metadata?.tenant_id;
            let claimWorkspaceId = authData.user.app_metadata?.workspace_id || authData.user.user_metadata?.workspace_id;

            if (!claimTenantId || !claimWorkspaceId) {
               const memberships = await iamRepo.listUserMemberships(resolvedUserId);
               if (memberships?.length > 0) {
                  claimTenantId = claimTenantId || memberships[0].tenant_id;
                  claimWorkspaceId = claimWorkspaceId || memberships[0].workspace_id;
               }
            }

            resolved = await resolveTenantWorkspaceContext(
              claimTenantId || tenantHeader,
              claimWorkspaceId || workspaceHeader,
              resolvedUserId,
            );
          } else {
            const tokenHash = createHash('sha256').update(rawToken).digest('hex');
            const session = await iamRepo.getSession(tokenHash);

            if (session?.user_id) {
              resolvedUserId = session.user_id;
              authContext = {
                provider: 'local_session',
                sessionExpiresAt: session.expires_at || null,
                tokenIssuedAt: session.created_at || null,
              };
              resolved = await resolveTenantWorkspaceContext(
                session.tenant_id || tenantHeader,
                session.workspace_id || workspaceHeader,
                resolvedUserId,
              );
            }
          }
        } catch {
          // Backward compatibility/safety
        }
      }
    }

    // Strict anonymous fallback: only allowed when running in dev mode AND the
    // operator has explicitly opted in via ALLOW_ANON_DEV=true. Anywhere else
    // (production, staging, test, or dev without the flag) we fail closed.
    if (resolved.isAnonymousFallback) {
      const isDev = process.env.NODE_ENV === 'development';
      const allowAnon = process.env.ALLOW_ANON_DEV === 'true';
      if (!isDev || !allowAnon) {
        logger.warn('Rejected anonymous fallback request', {
          path: req.path,
          nodeEnv: process.env.NODE_ENV,
          allowAnon,
        });
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentication required. Provide a valid Bearer token.');
      }
    }

    req.tenantId = resolved.tenantId;
    req.workspaceId = resolved.workspaceId;
    req.userId = resolved.userId;

    const workspaceForPolicy = await workspaceRepo.getById(req.workspaceId, req.tenantId);
    const policy = evaluateAuthPolicy({
      workspaceSettings: workspaceForPolicy?.settings || {},
      userId: req.userId,
      request: req,
      auth: authContext,
    });
    req.authPolicy = policy;
    if (!policy.allowed) {
      return sendError(res, policy.code === 'IP_NOT_ALLOWED' ? 403 : 401, policy.code!, policy.message!, policy.details);
    }

    logger.debug('Multi-tenant context established', {
      tenantId: req.tenantId,
      workspaceId: req.workspaceId,
      userId: req.userId,
      path: req.path
    });

    // NOTE: The 'system' userId coming from an HTTP header is NOT trusted.
    // Internal jobs access repositories directly and do not go through this middleware.
    // Any request arriving here with userId='system' is treated as an unauthenticated viewer.

    try {
      const member = await iamRepo.getMember(req.userId || '', req.tenantId || '', req.workspaceId || '');
      let legacyRole = null;
      let permissions = null;

      if (!member) {
        // Check for legacy user role if not a member yet (e.g. global user)
        const user = await iamRepo.getUserById(req.userId || '');
        legacyRole = user?.role;
      }

      const roleId = member?.role_id || legacyRole || 'viewer';
      req.roleId = roleId;
      req.permissions = await resolvePermissions(roleId, member?.permissions || permissions);

      next();
    } catch (memberError) {
      // Member/permission lookup failed.
      // Fail-secure: do NOT escalate privileges on error.
      // Distinguish transient infrastructure errors (timeout / serialization /
      // network) from validation/auth errors so that clients can retry the
      // former and immediately re-authenticate on the latter.
      const errAny = memberError as any;
      const code = errAny?.code as string | undefined;
      const message = errAny instanceof Error ? errAny.message : String(errAny ?? '');

      // PostgreSQL transient codes: 57014 = query_canceled (statement timeout),
      // 40001 = serialization_failure. Network errors typically surface with
      // ECONNRESET / ETIMEDOUT / ENOTFOUND / EAI_AGAIN / fetch failures.
      const transientPgCodes = new Set(['57014', '40001', '08000', '08003', '08006', '53300']);
      const isTransientNet = /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|network|socket hang up|aborted|timeout/i.test(message);
      const isTransient = (code && transientPgCodes.has(code)) || isTransientNet;

      // Validation-style errors: invalid input, malformed userId/tenantId, etc.
      const isValidationError = code === '22P02' /* invalid_text_representation */
        || code === '23503' /* foreign_key_violation */
        || /invalid input syntax|invalid uuid|not authenticated/i.test(message);

      if (isTransient) {
        logger.warn('Member lookup transient failure — returning 503', {
          path: req.path,
          userId: req.userId,
          code,
          error: message,
        });
        res.setHeader('Retry-After', '5');
        return sendError(res, 503, 'SERVICE_UNAVAILABLE', 'Authentication service temporarily unavailable. Please retry.');
      }

      if (isValidationError) {
        logger.warn('Member lookup validation failure — returning 401', {
          path: req.path,
          userId: req.userId,
          code,
          error: message,
        });
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentication failed. Please re-authenticate.');
      }

      logger.error('Member lookup failed in multi-tenant middleware — returning 500', {
        path: req.path,
        userId: req.userId,
        code,
        error: message,
      });
      return sendError(res, 500, 'INTERNAL_ERROR', 'Authentication service error.');
    }
  } catch (error) {
    // Outer catch: unexpected error in auth pipeline.
    // Fail-secure: do NOT grant any permissions on unexpected errors.
    logger.error('Multi-tenant middleware critical error — returning 500', {
      path: req.path,
      error: error instanceof Error ? error.message : String(error),
    });
    return sendError(res, 500, 'SERVICE_UNAVAILABLE', 'Authentication service temporarily unavailable. Please retry.');
  }
};
