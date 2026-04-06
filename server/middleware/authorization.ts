import type { NextFunction, Response } from 'express';
import type { MultiTenantRequest } from './multiTenant.js';
import { sendError } from '../http/errors.js';

export function requirePermission(permission: string) {
  return (req: MultiTenantRequest, res: Response, next: NextFunction) => {
    const perms = req.permissions || [];
    const isAllowed = perms.includes('*') || perms.includes(permission);

    if (!isAllowed) {
      return sendError(
        res,
        403,
        'FORBIDDEN',
        `Missing permission: ${permission}`,
        { required: permission, role: req.roleId || 'unknown' }
      );
    }

    next();
  };
}

