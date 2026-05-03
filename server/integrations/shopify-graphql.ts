/**
 * server/integrations/shopify-graphql.ts
 *
 * Thin GraphQL Admin API client. The REST adapter covers most reads and
 * writes, but a handful of resources are GraphQL-only:
 *
 *  - Returns API (returnRequest, returnApprove, returnDecline, returnClose)
 *  - Bulk operations (`bulkOperationRunQuery` for initial historical sync)
 *  - Discounts (codeDiscountNodes)
 *  - Subscription contracts (Recharge alternative)
 *  - Metaobjects (custom data models defined by the merchant)
 *
 * This module is intentionally tiny: it exposes `query`, `mutation`,
 * `paginate` (cursor-based), and `bulkOperation` (poll until ready).
 * Adapter methods compose those to express specific operations.
 *
 * Cost-aware: every Shopify GraphQL response includes
 * `extensions.cost.{requestedQueryCost,actualQueryCost,throttleStatus}`.
 * We honour the bucket — if `currentlyAvailable` < estimated cost, sleep.
 *
 * Docs: https://shopify.dev/docs/api/admin-graphql
 */

import { logger } from '../utils/logger.js';

const API_VERSION = '2024-10';

interface GraphQLError {
  message: string;
  extensions?: { code?: string; documentation?: string };
  path?: Array<string | number>;
}

interface ThrottleStatus {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
}

interface CostExtension {
  requestedQueryCost: number;
  actualQueryCost: number | null;
  throttleStatus: ThrottleStatus;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
  extensions?: { cost?: CostExtension };
}

export class ShopifyGraphQLError extends Error {
  readonly errors: GraphQLError[];
  constructor(errors: GraphQLError[]) {
    super(errors.map((e) => e.message).join('; ') || 'GraphQL error');
    this.errors = errors;
  }
}

export interface GraphQLClientOptions {
  shopDomain: string;
  accessToken: string;
  /** Override version for testing. Defaults to API_VERSION. */
  apiVersion?: string;
}

/**
 * Sleep helper used by throttle backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ShopifyGraphQLClient {
  private readonly endpoint: string;
  private readonly accessToken: string;
  /** Last-known throttle bucket; updated on every successful response. */
  private throttle: ThrottleStatus | null = null;

  constructor(opts: GraphQLClientOptions) {
    const version = opts.apiVersion ?? API_VERSION;
    this.endpoint = `https://${opts.shopDomain}/admin/api/${version}/graphql.json`;
    this.accessToken = opts.accessToken;
  }

  /**
   * Execute a query or mutation. Throws ShopifyGraphQLError on top-level
   * errors. User-level errors (e.g. `userErrors` arrays inside mutations)
   * are returned in `data` and the caller is responsible for inspecting
   * them — that's a Shopify convention, not a client decision.
   */
  async query<T = unknown>(document: string, variables?: Record<string, unknown>, attempt = 0): Promise<T> {
    // If we know the bucket is too low, wait until it refills enough to
    // afford a typical query (~50 cost). Heuristic but cheap.
    if (this.throttle && this.throttle.currentlyAvailable < 50) {
      const deficit = 50 - this.throttle.currentlyAvailable;
      const waitMs = Math.ceil((deficit / Math.max(this.throttle.restoreRate, 1)) * 1000);
      if (waitMs > 0 && waitMs < 30_000) {
        await sleep(waitMs);
      }
    }

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Shopify-Access-Token': this.accessToken,
      },
      body: JSON.stringify({ query: document, variables: variables ?? {} }),
    });

    if (res.status === 429 && attempt < 3) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? '2');
      logger.warn('Shopify GraphQL 429, backing off', { retryAfter, attempt });
      await sleep(retryAfter * 1000);
      return this.query<T>(document, variables, attempt + 1);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Shopify GraphQL HTTP ${res.status}: ${text}`);
    }

    const json = (await res.json()) as GraphQLResponse<T>;
    if (json.extensions?.cost?.throttleStatus) {
      this.throttle = json.extensions.cost.throttleStatus;
    }
    if (json.errors && json.errors.length > 0) {
      // THROTTLED is a soft error — retry with backoff, even though Shopify
      // returned 200 with an errors array.
      if (json.errors.some((e) => e.extensions?.code === 'THROTTLED') && attempt < 3) {
        await sleep(2000 * (attempt + 1));
        return this.query<T>(document, variables, attempt + 1);
      }
      throw new ShopifyGraphQLError(json.errors);
    }
    if (!json.data) throw new Error('Shopify GraphQL: empty data');
    return json.data;
  }

  /**
   * Cursor-paginate through a connection. The `pickConnection` selector
   * tells us where in the response shape the connection lives.
   *
   * Example:
   *   const orders = await client.paginate({ ... }, (data) => data.orders);
   */
  async paginate<TItem, TPage>(opts: {
    query: string;
    variables?: Record<string, unknown>;
    pickConnection: (data: TPage) => {
      edges: Array<{ node: TItem; cursor: string }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
    /** Hard cap on pages so a runaway connection doesn't drain credits. */
    maxPages?: number;
  }): Promise<TItem[]> {
    const items: TItem[] = [];
    let after: string | null = null;
    const maxPages = opts.maxPages ?? 50;

    for (let page = 0; page < maxPages; page++) {
      const data = (await this.query<TPage>(opts.query, { ...(opts.variables ?? {}), after })) as TPage;
      const conn = opts.pickConnection(data);
      for (const edge of conn.edges) items.push(edge.node);
      if (!conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) break;
      after = conn.pageInfo.endCursor;
    }
    return items;
  }

  /**
   * Run a long-lived bulk operation. Used for initial historical sync of
   * orders/customers/products without paying GraphQL throttle cost. Returns
   * a JSONL URL when the operation finishes — the caller streams it.
   *
   * Docs: https://shopify.dev/docs/api/usage/bulk-operations/queries
   */
  async bulkOperation(opts: {
    query: string;
    /** Poll interval in ms. Defaults 3000 — Shopify recommends >=1000. */
    pollIntervalMs?: number;
    /** Max wait for the bulk op to complete. Defaults 10 minutes. */
    timeoutMs?: number;
  }): Promise<{ id: string; status: string; url: string | null; objectCount: number }> {
    const startMutation = `
      mutation runBulk($q: String!) {
        bulkOperationRunQuery(query: $q) {
          bulkOperation { id status }
          userErrors { field message }
        }
      }
    `;
    const startData = await this.query<{
      bulkOperationRunQuery: {
        bulkOperation: { id: string; status: string } | null;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }>(startMutation, { q: opts.query });

    const userErrors = startData.bulkOperationRunQuery.userErrors;
    if (userErrors.length > 0) {
      throw new Error(`bulkOperationRunQuery failed: ${userErrors.map((e) => e.message).join('; ')}`);
    }
    const opId = startData.bulkOperationRunQuery.bulkOperation?.id;
    if (!opId) throw new Error('bulkOperationRunQuery: no bulkOperation returned');

    const pollQuery = `
      query bulkPoll {
        currentBulkOperation { id status errorCode objectCount url partialDataUrl }
      }
    `;
    const pollIntervalMs = opts.pollIntervalMs ?? 3000;
    const deadline = Date.now() + (opts.timeoutMs ?? 10 * 60 * 1000);

    while (Date.now() < deadline) {
      await sleep(pollIntervalMs);
      const pollData = await this.query<{
        currentBulkOperation: {
          id: string;
          status: string;
          errorCode: string | null;
          objectCount: string;
          url: string | null;
          partialDataUrl: string | null;
        } | null;
      }>(pollQuery);
      const op = pollData.currentBulkOperation;
      if (!op) continue;
      if (op.id !== opId) continue;
      if (op.status === 'COMPLETED') {
        return { id: op.id, status: op.status, url: op.url, objectCount: Number(op.objectCount || 0) };
      }
      if (op.status === 'FAILED' || op.status === 'CANCELED') {
        throw new Error(`bulk op ${op.id} ${op.status}: ${op.errorCode}`);
      }
    }
    throw new Error('bulk op timed out');
  }

  /** Returns the last-observed throttle bucket — useful for diagnostics. */
  getThrottleStatus(): ThrottleStatus | null {
    return this.throttle;
  }
}
