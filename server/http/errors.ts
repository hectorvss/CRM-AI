import type { Response } from 'express';

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown
): Response<ApiErrorPayload> {
  return res.status(status).json({ code, message, ...(details !== undefined ? { details } : {}) });
}

