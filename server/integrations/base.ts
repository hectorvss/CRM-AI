/**
 * server/integrations/base.ts
 *
 * Base HTTP client that every integration adapter extends.
 *
 * Provides:
 *  - Typed request/response handling
 *  - Automatic JSON serialisation / deserialisation
 *  - Per-request timeout enforcement
 *  - Retry with exponential back-off (delegates to utils/retry.ts)
 *  - Rate-limit guard (token bucket — prevents hammering external APIs)
 *  - Structured logging for every outbound request
 *  - Normalised error mapping to the AppError hierarchy
 *
 * Usage (inside an adapter):
 *
 *   class ShopifyAdapter extends BaseIntegrationClient {
 *     constructor(shopDomain: string, token: string) {
 *       super({
 *         system: 'shopify',
 *         baseUrl: `https://${shopDomain}/admin/api/2024-01`,
 *         defaultHeaders: { 'X-Shopify-Access-Token': token },
 *       });
 *     }
 *
 *     async getOrder(id: string) {
 *       return this.get<ShopifyOrderResponse>(`/orders/${id}.json`);
 *     }
 *   }
 */

import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { withRetryAndTimeout } from '../utils/retry.js';
import {
  IntegrationError,
  RateLimitError,
  IntegrationAuthError,
  NetworkError,
  ExternalServerError,
  isRetryable,
} from '../errors.js';
import type { IntegrationSystem } from './types.js';

// Re-export the not-configured error so adapters / routes can import it from
// either './base.js' or './types.js' without coupling to the file layout.
export {
  IntegrationNotConfiguredError,
  ShopifyNotConfiguredError,
  WhatsAppNotConfiguredError,
  PostmarkNotConfiguredError,
  TwilioNotConfiguredError,
  isIntegrationNotConfiguredError,
} from './types.js';

// ── Configuration ─────────────────────────────────────────────────────────────

export interface BaseClientOptions {
  system:          IntegrationSystem;
  baseUrl:         string;
  defaultHeaders?: Record<string, string>;
  /** Per-request timeout in ms. Default: config.integrations.defaultTimeoutMs */
  timeoutMs?:      number;
  /** Max retry attempts per call. Default: config.integrations.defaultMaxRetries */
  maxRetries?:     number;
  /** Max requests per minute (token bucket). Default: config.integrations.defaultRateLimitPerMinute */
  rateLimitPerMinute?: number;
}

// ── Token bucket rate limiter ─────────────────────────────────────────────────

class TokenBucket {
  private tokens:      number;
  private readonly max: number;
  private lastRefill:  number;

  constructor(perMinute: number) {
    this.max      = perMinute;
    this.tokens   = perMinute;
    this.lastRefill = Date.now();
  }

  /** Returns true if a token is available (and consumes it). */
  consume(): boolean {
    const now     = Date.now();
    const elapsed = (now - this.lastRefill) / 60_000; // fraction of a minute
    this.tokens   = Math.min(this.max, this.tokens + elapsed * this.max);
    this.lastRefill = now;

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /** Milliseconds until the next token is available */
  msUntilNextToken(): number {
    return Math.ceil((1 - this.tokens) / this.max * 60_000);
  }
}

// ── Request/response types ────────────────────────────────────────────────────

export interface RequestOptions {
  /** Extra headers to merge with defaults for this request only */
  headers?: Record<string, string>;
  /** Query string parameters */
  params?:  Record<string, string | number | boolean>;
  /** Skip retry logic for this request (e.g. non-idempotent writes) */
  noRetry?: boolean;
}

// ── Base client ───────────────────────────────────────────────────────────────

export abstract class BaseIntegrationClient {
  protected readonly system:   IntegrationSystem;
  protected readonly baseUrl:  string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly timeoutMs:  number;
  private readonly maxRetries: number;
  private readonly bucket:     TokenBucket;
  protected readonly log:      ReturnType<typeof logger.child>;

  constructor(opts: BaseClientOptions) {
    this.system  = opts.system;
    this.baseUrl = opts.baseUrl.replace(/\/$/, ''); // strip trailing slash
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept':       'application/json',
      ...(opts.defaultHeaders ?? {}),
    };
    this.timeoutMs  = opts.timeoutMs  ?? config.integrations.defaultTimeoutMs;
    this.maxRetries = opts.maxRetries ?? config.integrations.defaultMaxRetries;
    this.bucket     = new TokenBucket(
      opts.rateLimitPerMinute ?? config.integrations.defaultRateLimitPerMinute
    );
    this.log = logger.child({ integration: this.system });
  }

  // ── Core HTTP methods ───────────────────────────────────────────────────────

  protected async get<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this.request<T>('GET', path, undefined, opts);
  }

  protected async post<T>(path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
    return this.request<T>('POST', path, body, opts);
  }

  protected async patch<T>(path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
    return this.request<T>('PATCH', path, body, opts);
  }

  protected async put<T>(path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
    return this.request<T>('PUT', path, body, opts);
  }

  protected async delete<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this.request<T>('DELETE', path, undefined, opts);
  }

  // ── Internal request handler ────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body: unknown,
    opts: RequestOptions
  ): Promise<T> {
    // Rate limit check
    if (!this.bucket.consume()) {
      const wait = this.bucket.msUntilNextToken();
      throw new RateLimitError(this.system, Math.ceil(wait / 1000), { path });
    }

    const url  = this.buildUrl(path, opts.params);
    const label = `${this.system} ${method} ${path}`;

    const execute = async (): Promise<T> => {
      const start = Date.now();
      let statusCode: number | undefined;

      try {
        this.log.debug('Outbound request', { method, url });

        const res = await fetch(url, {
          method,
          headers: { ...this.defaultHeaders, ...(opts.headers ?? {}) },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });

        statusCode = res.status;
        const durationMs = Date.now() - start;

        this.log.debug('Response received', { method, url, status: statusCode, durationMs });

        if (res.ok) {
          // 204 No Content
          if (statusCode === 204) return undefined as unknown as T;
          return (await res.json()) as T;
        }

        // Error responses — map to typed errors
        const errorBody = await res.text().catch(() => '');
        this.throwForStatus(statusCode, errorBody, path);

      } catch (err) {
        // Already a typed error — re-throw
        if (err instanceof IntegrationError) throw err;

        // Network-level errors (ECONNREFUSED, ENOTFOUND, etc.)
        throw new NetworkError(this.system, err, { url, method });
      }

      // TypeScript needs a return path here (unreachable in practice)
      throw new IntegrationError(`Unexpected error calling ${this.system}`, {
        integration: this.system,
        statusCode,
      });
    };

    if (opts.noRetry) {
      return execute();
    }

    return withRetryAndTimeout(execute, {
      timeoutMs:   this.timeoutMs,
      maxAttempts: this.maxRetries + 1,
      label,
      shouldRetry: (err, attempt) => {
        this.log.warn('Retrying request', {
          label,
          attempt: attempt + 1,
          error: err instanceof Error ? err.message : String(err),
        });
        return isRetryable(err);
      },
    });
  }

  // ── URL builder ─────────────────────────────────────────────────────────────

  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean>
  ): string {
    const url = new URL(this.baseUrl + path);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  // ── Status → error mapping ──────────────────────────────────────────────────

  private throwForStatus(
    status: number,
    body: string,
    path: string
  ): never {
    const ctx = { path, body: body.substring(0, 500) };

    if (status === 401 || status === 403) {
      throw new IntegrationAuthError(this.system, ctx);
    }
    if (status === 404) {
      throw new IntegrationError(`${this.system}: resource not found (${path})`, {
        integration: this.system,
        code:        'INTEGRATION_NOT_FOUND',
        statusCode:  404,
        retryable:   false,
        context:     ctx,
      });
    }
    if (status === 422) {
      throw new IntegrationError(`${this.system}: unprocessable entity`, {
        integration: this.system,
        code:        'INTEGRATION_UNPROCESSABLE',
        statusCode:  422,
        retryable:   false,
        context:     ctx,
      });
    }
    if (status === 429) {
      throw new RateLimitError(this.system, undefined, ctx);
    }
    if (status >= 500) {
      throw new ExternalServerError(this.system, status, ctx);
    }

    throw new IntegrationError(`${this.system}: unexpected status ${status}`, {
      integration: this.system,
      statusCode:  status,
      retryable:   false,
      context:     ctx,
    });
  }
}
