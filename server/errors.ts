/**
 * server/errors.ts
 *
 * Centralised error hierarchy for the entire server.
 *
 * Design rules:
 *  - Every error carries a machine-readable `code` so handlers can branch
 *    on it without parsing message strings.
 *  - `retryable` tells the queue worker whether it is worth retrying the job
 *    that produced this error.
 *  - HTTP status codes live here so route handlers never hard-code numbers.
 */

// ── Base ──────────────────────────────────────────────────────────────────────

export class AppError extends Error {
  /** Machine-readable identifier (e.g. "INTEGRATION_RATE_LIMIT") */
  readonly code: string;
  /** Suggested HTTP response status for this error type */
  readonly httpStatus: number;
  /** Whether a queue job that produced this error should be retried */
  readonly retryable: boolean;
  /** Extra context attached at throw-site */
  readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      code: string;
      httpStatus?: number;
      retryable?: boolean;
      context?: Record<string, unknown>;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code;
    this.httpStatus = options.httpStatus ?? 500;
    this.retryable = options.retryable ?? false;
    this.context = options.context;

    // Preserve original stack when wrapping another error
    if (options.cause instanceof Error && options.cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${options.cause.stack}`;
    }
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

/** Bad input from callers — never retryable */
export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, {
      code: 'VALIDATION_ERROR',
      httpStatus: 400,
      retryable: false,
      context,
    });
  }
}

// ── Not Found ─────────────────────────────────────────────────────────────────

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(id ? `${resource} not found: ${id}` : `${resource} not found`, {
      code: 'NOT_FOUND',
      httpStatus: 404,
      retryable: false,
      context: { resource, id },
    });
  }
}

// ── Authorization ─────────────────────────────────────────────────────────────

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, { code: 'UNAUTHORIZED', httpStatus: 401, retryable: false });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, { code: 'FORBIDDEN', httpStatus: 403, retryable: false });
  }
}

// ── Queue ─────────────────────────────────────────────────────────────────────

export class QueueError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, {
      code: 'QUEUE_ERROR',
      httpStatus: 500,
      retryable: false,
      context,
    });
  }
}

// ── Integration (external API) ────────────────────────────────────────────────

/**
 * Base class for all errors originating from calls to external APIs
 * (Shopify, Stripe, carriers, etc.).
 */
export class IntegrationError extends AppError {
  readonly integration: string;
  readonly statusCode?: number;

  constructor(
    message: string,
    options: {
      integration: string;
      code?: string;
      statusCode?: number;
      retryable?: boolean;
      context?: Record<string, unknown>;
      cause?: unknown;
    }
  ) {
    super(message, {
      code: options.code ?? 'INTEGRATION_ERROR',
      httpStatus: 502,
      retryable: options.retryable ?? false,
      context: { ...options.context, integration: options.integration, statusCode: options.statusCode },
      cause: options.cause,
    });
    this.integration = options.integration;
    this.statusCode = options.statusCode;
  }
}

/**
 * 429 Too Many Requests — always retryable, the worker will back off.
 */
export class RateLimitError extends IntegrationError {
  /** Seconds to wait before the next attempt (from Retry-After header) */
  readonly retryAfterSeconds?: number;

  constructor(
    integration: string,
    retryAfterSeconds?: number,
    context?: Record<string, unknown>
  ) {
    super(`Rate limited by ${integration}`, {
      integration,
      code: 'INTEGRATION_RATE_LIMIT',
      statusCode: 429,
      retryable: true,
      context: { ...context, retryAfterSeconds },
    });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * 401 / 403 from an external API — credentials are wrong, retrying won't help.
 */
export class IntegrationAuthError extends IntegrationError {
  constructor(integration: string, context?: Record<string, unknown>) {
    super(`Authentication failed for ${integration}`, {
      integration,
      code: 'INTEGRATION_AUTH_ERROR',
      statusCode: 401,
      retryable: false,
      context,
    });
  }
}

/**
 * Network-level failure (timeout, ECONNREFUSED, etc.) — retryable.
 */
export class NetworkError extends IntegrationError {
  constructor(integration: string, cause?: unknown, context?: Record<string, unknown>) {
    super(`Network error calling ${integration}`, {
      integration,
      code: 'NETWORK_ERROR',
      retryable: true,
      context,
      cause,
    });
  }
}

/**
 * The external API returned a 5xx — retryable.
 */
export class ExternalServerError extends IntegrationError {
  constructor(
    integration: string,
    statusCode: number,
    context?: Record<string, unknown>
  ) {
    super(`${integration} returned ${statusCode}`, {
      integration,
      code: 'EXTERNAL_SERVER_ERROR',
      statusCode,
      retryable: true,
      context,
    });
  }
}

// ── Type guards ───────────────────────────────────────────────────────────────

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof AppError) return err.retryable;
  // Unknown errors (e.g. plain Error from a library) are considered retryable
  // so we don't silently swallow transient failures.
  return true;
}
