/**
 * server/integrations/woocommerce.ts
 *
 * WooCommerce REST adapter + webhook signature verifier.
 *
 * WooCommerce stores live on customer-controlled WordPress sites, so each
 * merchant tells us their site URL + consumer_key/consumer_secret. We use
 * HTTP Basic auth over HTTPS (preferred) — OAuth1.0a is supported by Woo
 * for non-HTTPS sites but we refuse those at connect time for security.
 *
 * Coverage focused on what the AI agent + inbox pipeline needs:
 *   - Orders (CRUD, list, refund, notes)
 *   - Customers (search, CRUD)
 *   - Products (search, retrieve)
 *   - Coupons (list, retrieve — for support flows offering discounts)
 *   - Webhooks v3 (CRUD + per-webhook secret rotation)
 *   - System status (health check + Woo + plugin versions)
 *
 * Webhooks: signed with `X-WC-Webhook-Signature` (base64 HMAC-SHA256 of
 * raw body) using a per-webhook `secret`. We provision the secret at
 * webhook-create time and persist it on the connector for verification.
 *
 * Docs: https://woocommerce.github.io/woocommerce-rest-api-docs/
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { logger } from '../utils/logger.js';

export interface WooCreds {
  siteUrl: string;        // e.g. https://shop.acme.com (no trailing slash)
  consumerKey: string;    // ck_...
  consumerSecret: string; // cs_...
}

export interface WooOrder {
  id: number;
  number: string;
  status: 'pending' | 'processing' | 'on-hold' | 'completed' | 'cancelled' | 'refunded' | 'failed' | 'trash';
  currency: string;
  total: string;
  customer_id: number;
  customer_note: string;
  billing: any;
  shipping: any;
  payment_method: string;
  payment_method_title: string;
  date_created: string;
  date_modified: string;
  line_items: Array<{ id: number; name: string; product_id: number; variation_id: number; quantity: number; total: string; sku: string }>;
  shipping_lines: any[];
  fee_lines: any[];
  refunds: any[];
  meta_data: any[];
}

export interface WooCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  username: string;
  billing: any;
  shipping: any;
  is_paying_customer: boolean;
  date_created: string;
  meta_data: any[];
}

export class WooCommerceAdapter {
  constructor(private readonly creds: WooCreds) {
    if (!/^https:\/\//i.test(creds.siteUrl)) {
      throw new Error('WooCommerce: site URL must be HTTPS for Basic auth');
    }
  }

  private base(): string {
    const u = this.creds.siteUrl.replace(/\/+$/, '');
    return `${u}/wp-json/wc/v3`;
  }

  private auth(): string {
    return 'Basic ' + Buffer.from(`${this.creds.consumerKey}:${this.creds.consumerSecret}`).toString('base64');
  }

  private async req<T>(method: string, path: string, init?: { body?: unknown; query?: Record<string, string | number | boolean | undefined> }): Promise<T> {
    const url = path.startsWith('http')
      ? new URL(path)
      : new URL(`${this.base()}${path.startsWith('/') ? '' : '/'}${path}`);
    if (init?.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = {
      Authorization: this.auth(),
      Accept: 'application/json',
      'User-Agent': 'Clain/1.0 (+https://clain.com)',
    };
    let body: BodyInit | undefined;
    if (init?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.body);
    }
    const res = await fetch(url.toString(), { method, headers, body });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let wcError: any = null;
      let message = text;
      try {
        const j = JSON.parse(text);
        wcError = j;
        message = j?.message ?? text;
      } catch { /* keep raw */ }
      const err: any = new Error(`woo ${method} ${path} ${res.status}: ${typeof message === 'string' ? message : JSON.stringify(message)}`);
      err.statusCode = res.status;
      err.wooError = wcError;
      throw err;
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  // ── Health ────────────────────────────────────────────────────────────────

  async ping(): Promise<{ ok: boolean; statusCode?: number }> {
    try {
      // /system_status is heavy. /coupons?per_page=1 is light and confirms
      // both auth + the woo endpoint is alive.
      await this.req<any>('GET', '/coupons', { query: { per_page: 1 } });
      return { ok: true };
    } catch (err: any) {
      logger.warn('woo ping failed', { error: err?.message });
      return { ok: false, statusCode: err?.statusCode };
    }
  }

  async systemStatus(): Promise<any> {
    return this.req('GET', '/system_status');
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(opts?: {
    status?: string;
    customerId?: number;
    after?: string;
    before?: string;
    perPage?: number;
    page?: number;
    search?: string;
    orderBy?: 'date' | 'id' | 'modified' | 'total';
    order?: 'asc' | 'desc';
  }): Promise<WooOrder[]> {
    return this.req('GET', '/orders', {
      query: {
        status: opts?.status,
        customer: opts?.customerId,
        after: opts?.after,
        before: opts?.before,
        per_page: opts?.perPage ?? 20,
        page: opts?.page,
        search: opts?.search,
        orderby: opts?.orderBy,
        order: opts?.order,
      },
    });
  }

  async getOrder(id: number): Promise<WooOrder> {
    return this.req('GET', `/orders/${id}`);
  }

  async updateOrder(id: number, payload: Partial<WooOrder> & { status?: string }): Promise<WooOrder> {
    return this.req('PUT', `/orders/${id}`, { body: payload });
  }

  async addOrderNote(orderId: number, note: string, customerNote = false): Promise<any> {
    return this.req('POST', `/orders/${orderId}/notes`, { body: { note, customer_note: customerNote } });
  }

  async listOrderNotes(orderId: number): Promise<any[]> {
    return this.req('GET', `/orders/${orderId}/notes`);
  }

  async refundOrder(orderId: number, payload: { amount?: string; reason?: string; api_refund?: boolean; line_items?: any[] }): Promise<any> {
    return this.req('POST', `/orders/${orderId}/refunds`, { body: payload });
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(opts?: { perPage?: number; page?: number; search?: string; email?: string; orderBy?: 'id' | 'name' | 'registered_date'; order?: 'asc' | 'desc' }): Promise<WooCustomer[]> {
    return this.req('GET', '/customers', {
      query: {
        per_page: opts?.perPage ?? 20,
        page: opts?.page,
        search: opts?.search,
        email: opts?.email,
        orderby: opts?.orderBy,
        order: opts?.order,
      },
    });
  }

  async getCustomer(id: number): Promise<WooCustomer> {
    return this.req('GET', `/customers/${id}`);
  }

  async findCustomerByEmail(email: string): Promise<WooCustomer | null> {
    const r = await this.listCustomers({ email, perPage: 1 });
    return r[0] ?? null;
  }

  async createCustomer(payload: Partial<WooCustomer> & { email: string }): Promise<WooCustomer> {
    return this.req('POST', '/customers', { body: payload });
  }

  async updateCustomer(id: number, payload: Partial<WooCustomer>): Promise<WooCustomer> {
    return this.req('PUT', `/customers/${id}`, { body: payload });
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(opts?: { perPage?: number; page?: number; search?: string; sku?: string; category?: number; orderBy?: 'date' | 'id' | 'title' | 'price' | 'popularity' | 'rating'; order?: 'asc' | 'desc' }): Promise<any[]> {
    return this.req('GET', '/products', {
      query: {
        per_page: opts?.perPage ?? 20,
        page: opts?.page,
        search: opts?.search,
        sku: opts?.sku,
        category: opts?.category,
        orderby: opts?.orderBy,
        order: opts?.order,
      },
    });
  }

  async getProduct(id: number): Promise<any> {
    return this.req('GET', `/products/${id}`);
  }

  // ── Coupons ───────────────────────────────────────────────────────────────

  async listCoupons(opts?: { code?: string; perPage?: number }): Promise<any[]> {
    return this.req('GET', '/coupons', { query: { code: opts?.code, per_page: opts?.perPage ?? 20 } });
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  async listWebhooks(): Promise<Array<{ id: number; name: string; topic: string; status: string; delivery_url: string }>> {
    return this.req('GET', '/webhooks', { query: { per_page: 100 } });
  }

  async createWebhook(payload: {
    name: string;
    topic: string;
    delivery_url: string;
    secret: string;
    status?: 'active' | 'paused' | 'disabled';
  }): Promise<{ id: number; status: string }> {
    return this.req('POST', '/webhooks', { body: payload });
  }

  async deleteWebhook(id: number, force = true): Promise<any> {
    return this.req('DELETE', `/webhooks/${id}`, { query: { force } });
  }
}

/**
 * Verify a WooCommerce webhook delivery.
 * Header: `X-WC-Webhook-Signature` is base64(HMAC-SHA256(rawBody, secret)).
 */
export function verifyWooWebhookSignature(opts: { rawBody: string; signature: string; secret: string }): boolean {
  const expected = createHmac('sha256', opts.secret).update(opts.rawBody).digest('base64');
  const a = Buffer.from(opts.signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
