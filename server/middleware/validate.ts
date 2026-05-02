/**
 * server/middleware/validate.ts
 *
 * Zod-based request validation middleware.
 *
 * Usage:
 *   import { z } from 'zod';
 *   import { validate } from '../middleware/validate.js';
 *
 *   const Schema = z.object({ orgName: z.string().min(1).max(120) });
 *   router.post('/setup', validate({ body: Schema }), handler);
 *
 * On validation failure responds with 400 and a structured error payload.
 * On success, the parsed (and stripped) value replaces `req.body`/`req.query`/`req.params`
 * so handlers can rely on shape without re-checking.
 */

import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny, ZodError } from 'zod';
import { sendError } from '../http/errors.js';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

function formatZodIssues(err: ZodError): Array<{ path: string; message: string }> {
  return err.issues.map(issue => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

export function validate(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        const parsed = schemas.body.safeParse(req.body);
        if (!parsed.success) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', {
            issues: formatZodIssues(parsed.error),
          });
        }
        req.body = parsed.data;
      }

      if (schemas.query) {
        const parsed = schemas.query.safeParse(req.query);
        if (!parsed.success) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid query parameters', {
            issues: formatZodIssues(parsed.error),
          });
        }
        // express's req.query is read-only on some versions; assign loosely.
        (req as any).query = parsed.data;
      }

      if (schemas.params) {
        const parsed = schemas.params.safeParse(req.params);
        if (!parsed.success) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid path parameters', {
            issues: formatZodIssues(parsed.error),
          });
        }
        (req as any).params = parsed.data;
      }

      next();
    } catch (err) {
      // Defensive: a thrown (non-Zod) error means the schema or request was malformed.
      return sendError(res, 400, 'VALIDATION_ERROR', 'Request validation failed', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };
}
