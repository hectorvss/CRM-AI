/**
 * server/integrations/shopify.ts
 *
 * Shopify Admin REST API adapter (API version 2024-01).
 *
 * Translates Shopify's native response shapes into the canonical types
 * defined in integrations/types.ts. Nothing outside this file should ever
 * import or depend on Shopify-specific response shapes.
 *
 * Supported capabilities (Phase 1):
 *  - Orders: get, list
 *  - Customers: get, findByEmail, findByPhone
 *  - Fulfillments: list by order
 *  - Returns: list by order
 *  - Webhook signature verification
 *  - ping (GET /shop.json)
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { BaseIntegrationClient } from './base.js';
import { NotFoundError } from '../errors.js';
import { ShopifyNotConfiguredError } from './types.js';
import type {
  IntegrationAdapter,
  ReadableOrders,
  ReadableCustomers,
  ReadableFulfillments,
  ReadableReturns,
  WritableOrders,
  WritableRefunds,
  WritableReturns,
  CanonicalOrder,
  CanonicalOrderLineItem,
  CanonicalCustomer,
  CanonicalFulfillment,
  CanonicalRefund,
  CanonicalReturn,
  CanonicalAddress,
  OrderStatus,
  FulfillmentStatus,
  ReturnStatus,
} from './types.js';

// ── Raw Shopify shapes (private to this file) ─────────────────────────────────

interface ShopifyAddress {
  first_name?: string;
  last_name?:  string;
  address1?:   string;
  address2?:   string;
  city?:       string;
  province?:   string;
  country?:    string;
  zip?:        string;
  phone?:      string;
}

interface ShopifyLineItem {
  id:         string;
  title:      string;
  sku?:       string;
  quantity:   number;
  price:      string;
  total_discount: string;
}

interface ShopifyOrder {
  id:                  number;
  name:                string;   // e.g. "#1001"
  email?:              string;
  financial_status:    string;
  fulfillment_status:  string | null;
  currency:            string;
  total_price:         string;
  subtotal_price:      string;
  total_tax:           string;
  total_shipping_price_set?: { shop_money: { amount: string } };
  line_items:          ShopifyLineItem[];
  customer?:           { id: number };
  shipping_address?:   ShopifyAddress;
  billing_address?:    ShopifyAddress;
  tags:                string;
  created_at:          string;
  updated_at:          string;
  cancelled_at:        string | null;
}

interface ShopifyCustomer {
  id:           number;
  email?:       string;
  phone?:       string;
  first_name?:  string;
  last_name?:   string;
  tags:         string;
}

interface ShopifyFulfillment {
  id:              number;
  order_id:        number;
  status:          string;
  tracking_number: string | null;
  tracking_url:    string | null;
  tracking_company: string | null;
  created_at:      string;
  updated_at:      string;
  estimated_delivery?: string | null;
  shipment_status?: string | null;
}

interface ShopifyReturn {
  id:         number;
  order_id:   number;
  status:     string;
  created_at: string;
  updated_at: string;
  return_line_items?: Array<{ quantity: number; line_item?: ShopifyLineItem }>;
}

// ── Mappers ────────────────────────────────────────────────────────────────────

function mapAddress(a?: ShopifyAddress): CanonicalAddress | null {
  if (!a) return null;
  return {
    firstName: a.first_name ?? null,
    lastName:  a.last_name  ?? null,
    address1:  a.address1   ?? null,
    address2:  a.address2   ?? null,
    city:      a.city       ?? null,
    province:  a.province   ?? null,
    country:   a.country    ?? null,
    zip:       a.zip        ?? null,
    phone:     a.phone      ?? null,
  };
}

function mapOrderStatus(financial: string, fulfillment: string | null): OrderStatus {
  if (financial === 'refunded')            return 'refunded';
  if (financial === 'partially_refunded')  return 'partially_fulfilled';
  if (financial === 'voided')              return 'cancelled';
  if (fulfillment === 'fulfilled')         return 'fulfilled';
  if (fulfillment === 'partial')           return 'partially_fulfilled';
  if (financial === 'paid')                return 'confirmed';
  return 'pending';
}

function mapFulfillmentStatus(status: string, shipmentStatus?: string | null): FulfillmentStatus {
  const s = shipmentStatus ?? status;
  if (s === 'delivered')              return 'delivered';
  if (s === 'out_for_delivery')       return 'out_for_delivery';
  if (s === 'in_transit' || s === 'confirmed') return 'in_transit';
  if (s === 'failure' || s === 'failed')       return 'failed';
  if (s === 'returned')               return 'returned';
  return 'pending';
}

function mapReturnStatus(status: string): ReturnStatus {
  const map: Record<string, ReturnStatus> = {
    open:      'requested',
    closed:    'closed',
    cancelled: 'closed',
  };
  return map[status] ?? 'requested';
}

function mapOrder(o: ShopifyOrder, source = 'shopify' as const): CanonicalOrder {
  const lineItems: CanonicalOrderLineItem[] = o.line_items.map(li => ({
    externalId: String(li.id),
    title:      li.title,
    sku:        li.sku ?? null,
    quantity:   li.quantity,
    unitPrice:  parseFloat(li.price),
    totalPrice: parseFloat(li.price) * li.quantity - parseFloat(li.total_discount ?? '0'),
    currency:   o.currency,
  }));

  const shippingAmount =
    parseFloat(o.total_shipping_price_set?.shop_money?.amount ?? '0');

  return {
    id:                  `shopify_order_${o.id}`,
    externalId:          String(o.id),
    externalOrderNumber: o.name,
    source,
    fetchedAt:           new Date().toISOString(),
    status:              mapOrderStatus(o.financial_status, o.fulfillment_status),
    financialStatus:     o.financial_status,
    fulfillmentStatus:   o.fulfillment_status,
    currency:            o.currency,
    totalAmount:         parseFloat(o.total_price),
    subtotal:            parseFloat(o.subtotal_price),
    taxAmount:           parseFloat(o.total_tax),
    shippingAmount,
    lineItems,
    customerExternalId:  o.customer?.id ? String(o.customer.id) : null,
    shippingAddress:     mapAddress(o.shipping_address),
    billingAddress:      mapAddress(o.billing_address),
    tags:                o.tags ? o.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    createdAt:           o.created_at,
    updatedAt:           o.updated_at,
    cancelledAt:         o.cancelled_at,
  };
}

function mapCustomer(c: ShopifyCustomer): CanonicalCustomer {
  return {
    id:          `shopify_customer_${c.id}`,
    externalId:  String(c.id),
    source:      'shopify',
    fetchedAt:   new Date().toISOString(),
    email:       c.email    ?? null,
    phone:       c.phone    ?? null,
    firstName:   c.first_name ?? null,
    lastName:    c.last_name  ?? null,
    displayName: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || String(c.id),
    tags:        c.tags ? c.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
  };
}

function mapFulfillment(f: ShopifyFulfillment): CanonicalFulfillment {
  return {
    id:               `shopify_fulfillment_${f.id}`,
    externalId:       String(f.id),
    source:           'shopify',
    fetchedAt:        new Date().toISOString(),
    orderExternalId:  String(f.order_id),
    status:           mapFulfillmentStatus(f.status, f.shipment_status),
    trackingNumber:   f.tracking_number,
    trackingUrl:      f.tracking_url,
    carrier:          f.tracking_company,
    estimatedDelivery: f.estimated_delivery ?? null,
    deliveredAt:      f.shipment_status === 'delivered' ? f.updated_at : null,
    createdAt:        f.created_at,
    updatedAt:        f.updated_at,
  };
}

function mapReturn(r: ShopifyReturn): CanonicalReturn {
  // Shopify returns don't have a direct monetary value field at the top level —
  // approximate from line items if present
  const totalValue = r.return_line_items?.reduce((sum, rli) => {
    const price = parseFloat(rli.line_item?.price ?? '0');
    return sum + price * (rli.quantity ?? 1);
  }, 0) ?? 0;

  return {
    id:                 `shopify_return_${r.id}`,
    externalId:         String(r.id),
    source:             'shopify',
    fetchedAt:          new Date().toISOString(),
    orderExternalId:    String(r.order_id),
    customerExternalId: null,   // not available at this level; Identity agent resolves it
    status:             mapReturnStatus(r.status),
    reason:             null,
    totalValue,
    currency:           'USD',  // Shopify returns don't expose currency directly here
    trackingNumber:     null,
    labelUrl:           null,
    createdAt:          r.created_at,
    updatedAt:          r.updated_at,
  };
}

// ── Adapter ────────────────────────────────────────────────────────────────────

export interface ShopifyAdapterOptions {
  shopDomain:    string;
  adminApiToken: string;
  webhookSecret: string;
}

export class ShopifyAdapter
  extends BaseIntegrationClient
  implements IntegrationAdapter, ReadableOrders, ReadableCustomers, ReadableFulfillments, ReadableReturns, WritableOrders, WritableRefunds, WritableReturns
{
  readonly system = 'shopify' as const;
  /** True only when shopDomain, admin API token and webhook secret are all set. */
  readonly configured: boolean;

  private readonly shopDomain:    string;
  private readonly adminApiToken: string;
  private readonly webhookSecret: string;

  constructor(opts: ShopifyAdapterOptions) {
    // Use placeholder host when not configured so the BaseIntegrationClient
    // URL constructor doesn't crash at construction time.
    const baseDomain = opts.shopDomain || 'unconfigured.invalid';
    super({
      system:    'shopify',
      baseUrl:   `https://${baseDomain}/admin/api/2024-01`,
      defaultHeaders: opts.adminApiToken
        ? { 'X-Shopify-Access-Token': opts.adminApiToken }
        : {},
      rateLimitPerMinute: 80,  // Shopify: 2 req/s = 120/min; we stay conservative
    });

    this.shopDomain    = opts.shopDomain;
    this.adminApiToken = opts.adminApiToken;
    this.webhookSecret = opts.webhookSecret;
    this.configured    = Boolean(opts.shopDomain && opts.adminApiToken && opts.webhookSecret);
  }

  /**
   * List of env-var names that are missing for full configuration.
   * Used by routes to surface a precise 503 error to operators.
   */
  missingCredentials(): string[] {
    const missing: string[] = [];
    if (!this.shopDomain)    missing.push('SHOPIFY_SHOP_DOMAIN');
    if (!this.adminApiToken) missing.push('SHOPIFY_ADMIN_API_TOKEN');
    if (!this.webhookSecret) missing.push('SHOPIFY_WEBHOOK_SECRET');
    return missing;
  }

  /**
   * Asserts the adapter has credentials. Throws `ShopifyNotConfiguredError`
   * with the precise list of missing env vars when it doesn't. Routes catch
   * this and respond with HTTP 503 + SHOPIFY_NOT_CONFIGURED.
   */
  private requireConfigured(): void {
    if (!this.configured) {
      throw new ShopifyNotConfiguredError(this.missingCredentials());
    }
  }

  // ── IntegrationAdapter ────────────────────────────────────────────────────

  /**
   * Verifies an inbound webhook's HMAC-SHA256 signature.
   *
   * Returns false (rather than throwing) so the route handler can branch on
   * the result and return a 401. If the webhook secret is not configured,
   * verification cannot succeed — we return false and let the route surface
   * a 503.
   */
  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean {
    if (!this.webhookSecret) return false;

    const hmacHeader = headers['x-shopify-hmac-sha256'];
    if (!hmacHeader) return false;

    const digest = createHmac('sha256', this.webhookSecret)
      .update(rawBody, 'utf8')
      .digest('base64');

    const expected = Buffer.from(digest);
    const received = Buffer.from(hmacHeader);
    if (expected.length !== received.length) return false;

    try {
      return timingSafeEqual(expected, received);
    } catch {
      return false;
    }
  }

  async ping(): Promise<void> {
    this.requireConfigured();
    await this.get<{ shop: { id: number } }>('/shop.json');
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async getOrder(externalId: string): Promise<CanonicalOrder> {
    this.requireConfigured();
    try {
      const res = await this.get<{ order: ShopifyOrder }>(`/orders/${externalId}.json`);
      return mapOrder(res.order);
    } catch (err: any) {
      if (err?.statusCode === 404) throw new NotFoundError('ShopifyOrder', externalId);
      throw err;
    }
  }

  async listOrders(params: { limit?: number; since?: string } = {}): Promise<CanonicalOrder[]> {
    this.requireConfigured();
    const query: Record<string, string | number | boolean> = {
      limit:  Math.min(params.limit ?? 50, 250),
      status: 'any',
    };
    if (params.since) query.updated_at_min = params.since;

    const res = await this.get<{ orders: ShopifyOrder[] }>('/orders.json', { params: query });
    return res.orders.map(o => mapOrder(o));
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async getCustomer(externalId: string): Promise<CanonicalCustomer> {
    this.requireConfigured();
    try {
      const res = await this.get<{ customer: ShopifyCustomer }>(`/customers/${externalId}.json`);
      return mapCustomer(res.customer);
    } catch (err: any) {
      if (err?.statusCode === 404) throw new NotFoundError('ShopifyCustomer', externalId);
      throw err;
    }
  }

  async findCustomerByEmail(email: string): Promise<CanonicalCustomer | null> {
    this.requireConfigured();
    const res = await this.get<{ customers: ShopifyCustomer[] }>('/customers/search.json', {
      params: { query: `email:${email}`, limit: 1 },
    });
    if (!res.customers.length) return null;
    return mapCustomer(res.customers[0]);
  }

  async findCustomerByPhone(phone: string): Promise<CanonicalCustomer | null> {
    this.requireConfigured();
    const res = await this.get<{ customers: ShopifyCustomer[] }>('/customers/search.json', {
      params: { query: `phone:${phone}`, limit: 1 },
    });
    if (!res.customers.length) return null;
    return mapCustomer(res.customers[0]);
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async getFulfillment(externalId: string): Promise<CanonicalFulfillment> {
    // Shopify requires order context to fetch a fulfillment directly,
    // so this is not supported without the order ID.
    throw new NotFoundError('ShopifyFulfillment', externalId);
  }

  async listFulfillmentsForOrder(orderExternalId: string): Promise<CanonicalFulfillment[]> {
    this.requireConfigured();
    const res = await this.get<{ fulfillments: ShopifyFulfillment[] }>(
      `/orders/${orderExternalId}/fulfillments.json`
    );
    return res.fulfillments.map(mapFulfillment);
  }

  // ── Returns ───────────────────────────────────────────────────────────────

  async getReturn(externalId: string): Promise<CanonicalReturn> {
    throw new NotFoundError('ShopifyReturn', externalId);
  }

  async listReturnsForOrder(orderExternalId: string): Promise<CanonicalReturn[]> {
    this.requireConfigured();
    // Shopify Returns API requires GraphQL Admin API; REST returns are limited.
    // For Phase 1 we use the order's refunds as a proxy, falling back to empty.
    try {
      const res = await this.get<{ refunds: ShopifyReturn[] }>(
        `/orders/${orderExternalId}/refunds.json`
      );
      // Map refunds that have return-like status as canonical returns
      return res.refunds
        .filter(r => (r as any).restock === true || r.status === 'open')
        .map(r => mapReturn({ ...r, order_id: Number(orderExternalId) }));
    } catch {
      return [];
    }
  }

  // ── Writable: Orders ──────────────────────────────────────────────────────

  /**
   * Cancel a Shopify order via POST /orders/:id/cancel.json
   * Shopify requires the order to be unfulfilled or partially fulfilled.
   * On success returns the updated canonical order.
   */
  async cancelOrder(params: {
    orderExternalId: string;
    reason?: string;
    email?: boolean;
    restock?: boolean;
  }): Promise<CanonicalOrder> {
    this.requireConfigured();
    const body: Record<string, any> = {
      reason:  params.reason ?? 'other',
      email:   params.email  ?? true,
      restock: params.restock ?? true,
    };
    const res = await this.post<{ order: ShopifyOrder }>(
      `/orders/${params.orderExternalId}/cancel.json`,
      body,
    );
    return mapOrder(res.order);
  }

  /**
   * Restore a previously-cancelled order via POST /orders/:id/restore.json
   *
   * Shopify allows un-cancelling an order as long as it has not been fulfilled.
   * If the order was already fulfilled, Shopify returns 422 and this method
   * throws — callers must fall back to manual intervention.
   *
   * Used by the Plan Engine rollback to undo `shopify/cancel_order` steps.
   */
  async restoreOrder(orderExternalId: string): Promise<CanonicalOrder> {
    this.requireConfigured();
    try {
      const res = await this.post<{ order: ShopifyOrder }>(
        `/orders/${orderExternalId}/restore.json`,
        {},
      );
      return mapOrder(res.order);
    } catch (err: any) {
      if (err?.statusCode === 404) throw new NotFoundError('ShopifyOrder', orderExternalId);
      throw err;
    }
  }

  // ── Writable: Refunds ─────────────────────────────────────────────────────

  /**
   * Create a refund against a Shopify order via POST /orders/:id/refunds.json.
   *
   * Shopify's REST refund API is order-scoped, so the caller must pass the
   * `orderExternalId`. The `paymentExternalId` argument from the canonical
   * `WritableRefunds` interface is interpreted as the Shopify order ID (the
   * Shopify transaction is implicit — Shopify computes the right transaction
   * for the requested amount).
   *
   * Idempotency is enforced via the X-Idempotency-Key header that Shopify
   * honours since 2023-04. Callers MUST pass a stable key.
   */
  async createRefund(params: {
    paymentExternalId: string;       // Shopify order ID (REST is order-scoped)
    amount: number;
    currency: string;
    reason?: string;
    idempotencyKey: string;
    notify?: boolean;
  }): Promise<CanonicalRefund> {
    this.requireConfigured();

    const orderId = params.paymentExternalId;
    const body = {
      refund: {
        currency: params.currency,
        notify:   params.notify ?? true,
        note:     params.reason ?? 'Refund issued via CRM-AI',
        // No refund_line_items → Shopify creates a refund against the
        // outstanding balance using the requested transaction amount.
        transactions: [
          {
            amount: params.amount.toFixed(2),
            kind:   'refund',
          },
        ],
      },
    };

    const res = await this.post<{ refund: { id: number; created_at: string; transactions?: Array<{ id: number }>; processed_at?: string } }>(
      `/orders/${orderId}/refunds.json`,
      body,
      { headers: { 'X-Idempotency-Key': params.idempotencyKey } },
    );

    return {
      id:                 `shopify_refund_${res.refund.id}`,
      externalId:         String(res.refund.id),
      source:             'shopify',
      fetchedAt:          new Date().toISOString(),
      paymentExternalId:  params.paymentExternalId,
      orderExternalId:    orderId,
      status:             'succeeded',
      amount:             params.amount,
      currency:           params.currency,
      reason:             params.reason ?? null,
      idempotencyKey:     params.idempotencyKey,
      createdAt:          res.refund.created_at,
    };
  }

  // ── Writable: Returns ─────────────────────────────────────────────────────

  /**
   * Create a return request via Shopify REST.
   * Shopify's REST return creation is limited — we send a refund with restock.
   * Full return management requires the GraphQL API; this is the REST fallback.
   */
  async createReturn(params: {
    orderExternalId: string;
    lineItems: Array<{ lineItemId: string; quantity: number; reason?: string }>;
    notifyCustomer?: boolean;
  }): Promise<CanonicalReturn> {
    this.requireConfigured();
    const refundLineItems = params.lineItems.map((li) => ({
      line_item_id: li.lineItemId,
      quantity:     li.quantity,
      restock_type: 'return',
    }));

    const body = {
      refund: {
        note:    `Return requested via CRM-AI: ${params.lineItems.map((l) => l.reason).filter(Boolean).join(', ')}`,
        notify:  params.notifyCustomer ?? true,
        restock: true,
        refund_line_items: refundLineItems,
      },
    };

    const res = await this.post<{ refund: ShopifyReturn }>(
      `/orders/${params.orderExternalId}/refunds.json`,
      body,
    );

    return mapReturn({ ...res.refund, order_id: Number(params.orderExternalId) });
  }

  // ── Phase 2: extended REST coverage ──────────────────────────────────────
  //
  // The methods below are NOT part of the canonical IntegrationAdapter
  // interface — they expose Shopify-specific resources that the agent /
  // workflows can call directly. They return raw shop-shaped objects (typed
  // as `unknown` here so we don't drag every Shopify type into the canonical
  // surface). Callers that want canonical mapping should add it locally.

  // ── Orders: extended ─────────────────────────────────────────────────────

  /** All transactions on an order (charges, refunds, voids). */
  async listOrderTransactions(orderExternalId: string): Promise<unknown[]> {
    this.requireConfigured();
    const res = await this.get<{ transactions: unknown[] }>(`/orders/${orderExternalId}/transactions.json`);
    return res.transactions ?? [];
  }

  /** Risk assessment for an order (Shopify Fraud Analysis). */
  async getOrderRisks(orderExternalId: string): Promise<unknown[]> {
    this.requireConfigured();
    const res = await this.get<{ risks: unknown[] }>(`/orders/${orderExternalId}/risks.json`);
    return res.risks ?? [];
  }

  /**
   * Apply tags / notes / metadata mutations on an existing order. Use sparingly —
   * Shopify doesn't allow editing line items via REST (use GraphQL orderEditBegin).
   */
  async updateOrder(orderExternalId: string, patch: {
    tags?: string;
    note?: string;
    note_attributes?: Array<{ name: string; value: string }>;
    email?: string;
    phone?: string;
    metafields?: Array<{ namespace: string; key: string; value: string; type: string }>;
  }): Promise<unknown> {
    this.requireConfigured();
    const res = await this.put<{ order: unknown }>(`/orders/${orderExternalId}.json`, { order: { id: Number(orderExternalId), ...patch } });
    return res.order;
  }

  // ── Customers: extended ──────────────────────────────────────────────────

  async listCustomerOrders(customerExternalId: string, params: { status?: string; limit?: number } = {}): Promise<unknown[]> {
    this.requireConfigured();
    const query: Record<string, string | number> = { limit: Math.min(params.limit ?? 50, 250) };
    if (params.status) query.status = params.status;
    const res = await this.get<{ orders: unknown[] }>(`/customers/${customerExternalId}/orders.json`, { params: query });
    return res.orders ?? [];
  }

  async updateCustomer(customerExternalId: string, patch: {
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    tags?: string;
    note?: string;
    accepts_marketing?: boolean;
    metafields?: Array<{ namespace: string; key: string; value: string; type: string }>;
  }): Promise<unknown> {
    this.requireConfigured();
    const res = await this.put<{ customer: unknown }>(`/customers/${customerExternalId}.json`, { customer: { id: Number(customerExternalId), ...patch } });
    return res.customer;
  }

  // ── Products & inventory ─────────────────────────────────────────────────

  async listProducts(params: { limit?: number; status?: 'active' | 'archived' | 'draft'; vendor?: string; productType?: string; collectionId?: string; sinceId?: string } = {}): Promise<unknown[]> {
    this.requireConfigured();
    const query: Record<string, string | number> = { limit: Math.min(params.limit ?? 50, 250) };
    if (params.status) query.status = params.status;
    if (params.vendor) query.vendor = params.vendor;
    if (params.productType) query.product_type = params.productType;
    if (params.collectionId) query.collection_id = params.collectionId;
    if (params.sinceId) query.since_id = params.sinceId;
    const res = await this.get<{ products: unknown[] }>('/products.json', { params: query });
    return res.products ?? [];
  }

  async getProduct(externalId: string): Promise<unknown> {
    this.requireConfigured();
    const res = await this.get<{ product: unknown }>(`/products/${externalId}.json`);
    return res.product;
  }

  async getVariant(variantExternalId: string): Promise<unknown> {
    this.requireConfigured();
    const res = await this.get<{ variant: unknown }>(`/variants/${variantExternalId}.json`);
    return res.variant;
  }

  async listInventoryLevels(params: { inventoryItemIds?: string[]; locationIds?: string[]; limit?: number } = {}): Promise<unknown[]> {
    this.requireConfigured();
    const query: Record<string, string | number> = { limit: Math.min(params.limit ?? 50, 250) };
    if (params.inventoryItemIds?.length) query.inventory_item_ids = params.inventoryItemIds.join(',');
    if (params.locationIds?.length) query.location_ids = params.locationIds.join(',');
    const res = await this.get<{ inventory_levels: unknown[] }>('/inventory_levels.json', { params: query });
    return res.inventory_levels ?? [];
  }

  /**
   * Adjust on-hand inventory by a relative delta. Use `setInventoryLevel`
   * to set an absolute quantity; this is for incremental adjustments.
   */
  async adjustInventoryLevel(params: {
    inventoryItemId: string;
    locationId: string;
    availableAdjustment: number;
  }): Promise<unknown> {
    this.requireConfigured();
    const res = await this.post<{ inventory_level: unknown }>('/inventory_levels/adjust.json', {
      inventory_item_id: Number(params.inventoryItemId),
      location_id: Number(params.locationId),
      available_adjustment: params.availableAdjustment,
    });
    return res.inventory_level;
  }

  async setInventoryLevel(params: {
    inventoryItemId: string;
    locationId: string;
    available: number;
  }): Promise<unknown> {
    this.requireConfigured();
    const res = await this.post<{ inventory_level: unknown }>('/inventory_levels/set.json', {
      inventory_item_id: Number(params.inventoryItemId),
      location_id: Number(params.locationId),
      available: params.available,
    });
    return res.inventory_level;
  }

  // ── Locations ────────────────────────────────────────────────────────────

  async listLocations(): Promise<unknown[]> {
    this.requireConfigured();
    const res = await this.get<{ locations: unknown[] }>('/locations.json');
    return res.locations ?? [];
  }

  // ── Fulfillment orders & fulfillments (modern API) ───────────────────────

  /** Modern fulfillment_orders endpoint — required for the 2024-04+ flow. */
  async listFulfillmentOrdersForOrder(orderExternalId: string): Promise<unknown[]> {
    this.requireConfigured();
    const res = await this.get<{ fulfillment_orders: unknown[] }>(`/orders/${orderExternalId}/fulfillment_orders.json`);
    return res.fulfillment_orders ?? [];
  }

  /**
   * Create a fulfillment from one or more fulfillment_orders. This is the
   * 2024-04+ way to mark line items as shipped (replaces the deprecated
   * POST /orders/:id/fulfillments endpoint).
   */
  async createFulfillment(params: {
    fulfillmentOrderId: string;
    trackingNumber?: string;
    trackingUrl?: string;
    trackingCompany?: string;
    notifyCustomer?: boolean;
    lineItems?: Array<{ id: string; quantity: number }>;
  }): Promise<unknown> {
    this.requireConfigured();
    const body: Record<string, unknown> = {
      fulfillment: {
        message: 'Shipment created via CRM-AI',
        notify_customer: params.notifyCustomer ?? true,
        tracking_info: {
          number: params.trackingNumber,
          url: params.trackingUrl,
          company: params.trackingCompany,
        },
        line_items_by_fulfillment_order: [
          {
            fulfillment_order_id: Number(params.fulfillmentOrderId),
            ...(params.lineItems ? {
              fulfillment_order_line_items: params.lineItems.map((li) => ({
                id: Number(li.id),
                quantity: li.quantity,
              })),
            } : {}),
          },
        ],
      },
    };
    const res = await this.post<{ fulfillment: unknown }>('/fulfillments.json', body);
    return res.fulfillment;
  }

  async cancelFulfillment(fulfillmentExternalId: string): Promise<unknown> {
    this.requireConfigured();
    const res = await this.post<{ fulfillment: unknown }>(`/fulfillments/${fulfillmentExternalId}/cancel.json`, {});
    return res.fulfillment;
  }

  /** Update tracking info on an existing fulfillment without creating a new one. */
  async updateFulfillmentTracking(params: {
    fulfillmentExternalId: string;
    trackingNumber?: string;
    trackingUrl?: string;
    trackingCompany?: string;
    notifyCustomer?: boolean;
  }): Promise<unknown> {
    this.requireConfigured();
    const res = await this.post<{ fulfillment: unknown }>(`/fulfillments/${params.fulfillmentExternalId}/update_tracking.json`, {
      fulfillment: {
        notify_customer: params.notifyCustomer ?? false,
        tracking_info: {
          number: params.trackingNumber,
          url: params.trackingUrl,
          company: params.trackingCompany,
        },
      },
    });
    return res.fulfillment;
  }

  // ── Draft orders ─────────────────────────────────────────────────────────

  async createDraftOrder(payload: {
    lineItems: Array<{ variantId?: string; title?: string; price?: string; quantity: number; sku?: string }>;
    customerId?: string;
    email?: string;
    note?: string;
    tags?: string;
    useCustomerDefaultAddress?: boolean;
    appliedDiscount?: { value: string; valueType: 'fixed_amount' | 'percentage'; description?: string };
  }): Promise<unknown> {
    this.requireConfigured();
    const body: Record<string, unknown> = {
      draft_order: {
        line_items: payload.lineItems.map((li) => ({
          variant_id: li.variantId ? Number(li.variantId) : undefined,
          title: li.title,
          price: li.price,
          quantity: li.quantity,
          sku: li.sku,
        })),
        customer: payload.customerId ? { id: Number(payload.customerId) } : undefined,
        email: payload.email,
        note: payload.note,
        tags: payload.tags,
        use_customer_default_address: payload.useCustomerDefaultAddress,
        applied_discount: payload.appliedDiscount
          ? {
              value: payload.appliedDiscount.value,
              value_type: payload.appliedDiscount.valueType,
              description: payload.appliedDiscount.description,
            }
          : undefined,
      },
    };
    const res = await this.post<{ draft_order: unknown }>('/draft_orders.json', body);
    return res.draft_order;
  }

  /** Convert a draft order into a real order. Optionally auto-mark as paid. */
  async completeDraftOrder(draftOrderExternalId: string, opts: { paymentPending?: boolean } = {}): Promise<unknown> {
    this.requireConfigured();
    const params: Record<string, string | boolean> = {};
    if (opts.paymentPending) params.payment_pending = true;
    const res = await this.put<{ draft_order: unknown }>(`/draft_orders/${draftOrderExternalId}/complete.json`, null, { params });
    return res.draft_order;
  }

  /** Email the draft order invoice to the customer. */
  async sendDraftOrderInvoice(draftOrderExternalId: string, email?: { to?: string; subject?: string; customMessage?: string }): Promise<unknown> {
    this.requireConfigured();
    const res = await this.post<{ draft_order_invoice: unknown }>(
      `/draft_orders/${draftOrderExternalId}/send_invoice.json`,
      email ? {
        draft_order_invoice: {
          to: email.to,
          subject: email.subject,
          custom_message: email.customMessage,
        },
      } : {},
    );
    return res.draft_order_invoice;
  }

  // ── Metafields (custom data on any resource) ────────────────────────────

  async listMetafields(opts: { ownerResource: 'orders' | 'customers' | 'products' | 'variants' | 'shop'; ownerId?: string }): Promise<unknown[]> {
    this.requireConfigured();
    const url = opts.ownerResource === 'shop'
      ? '/metafields.json'
      : `/${opts.ownerResource}/${opts.ownerId}/metafields.json`;
    const res = await this.get<{ metafields: unknown[] }>(url);
    return res.metafields ?? [];
  }

  async setMetafield(opts: {
    ownerResource: 'orders' | 'customers' | 'products' | 'variants' | 'shop';
    ownerId?: string;
    namespace: string;
    key: string;
    value: string;
    type: string; // 'single_line_text_field', 'number_integer', 'json', 'boolean', etc.
  }): Promise<unknown> {
    this.requireConfigured();
    const url = opts.ownerResource === 'shop'
      ? '/metafields.json'
      : `/${opts.ownerResource}/${opts.ownerId}/metafields.json`;
    const res = await this.post<{ metafield: unknown }>(url, {
      metafield: {
        namespace: opts.namespace,
        key: opts.key,
        value: opts.value,
        type: opts.type,
      },
    });
    return res.metafield;
  }

  // ── Gift cards ───────────────────────────────────────────────────────────

  async listGiftCards(params: { limit?: number; status?: 'enabled' | 'disabled' } = {}): Promise<unknown[]> {
    this.requireConfigured();
    const query: Record<string, string | number> = { limit: Math.min(params.limit ?? 50, 250) };
    if (params.status) query.status = params.status;
    const res = await this.get<{ gift_cards: unknown[] }>('/gift_cards.json', { params: query });
    return res.gift_cards ?? [];
  }

  async createGiftCard(params: { initialValue: number; currency?: string; customerId?: string; note?: string; expiresOn?: string; templateSuffix?: string }): Promise<unknown> {
    this.requireConfigured();
    const body: Record<string, unknown> = {
      gift_card: {
        initial_value: params.initialValue.toFixed(2),
        currency: params.currency,
        customer_id: params.customerId ? Number(params.customerId) : undefined,
        note: params.note,
        expires_on: params.expiresOn,
        template_suffix: params.templateSuffix,
      },
    };
    const res = await this.post<{ gift_card: unknown }>('/gift_cards.json', body);
    return res.gift_card;
  }

  // ── Abandoned checkouts ──────────────────────────────────────────────────

  async listAbandonedCheckouts(params: { limit?: number; sinceId?: string; status?: 'open' | 'closed' } = {}): Promise<unknown[]> {
    this.requireConfigured();
    const query: Record<string, string | number> = { limit: Math.min(params.limit ?? 50, 250), status: params.status ?? 'open' };
    if (params.sinceId) query.since_id = params.sinceId;
    const res = await this.get<{ checkouts: unknown[] }>('/checkouts.json', { params: query });
    return res.checkouts ?? [];
  }

  // ── Webhook subscriptions ────────────────────────────────────────────────

  async listWebhookSubscriptions(): Promise<unknown[]> {
    this.requireConfigured();
    const res = await this.get<{ webhooks: unknown[] }>('/webhooks.json');
    return res.webhooks ?? [];
  }

  /**
   * Subscribe to a topic. Idempotent — Shopify rejects duplicates with
   * "address already taken", which we swallow and treat as success.
   */
  async createWebhookSubscription(params: { topic: string; address: string; format?: 'json' | 'xml' }): Promise<unknown> {
    this.requireConfigured();
    try {
      const res = await this.post<{ webhook: unknown }>('/webhooks.json', {
        webhook: { topic: params.topic, address: params.address, format: params.format ?? 'json' },
      });
      return res.webhook;
    } catch (err: any) {
      // 422 with "address already taken" → already subscribed; treat as success.
      if (err?.statusCode === 422) return null;
      throw err;
    }
  }

  async deleteWebhookSubscription(webhookId: string): Promise<void> {
    this.requireConfigured();
    await this.delete(`/webhooks.json?id=${webhookId}`);
  }

  // ── Shop info ────────────────────────────────────────────────────────────

  async getShop(): Promise<{
    id: number;
    name: string;
    email: string | null;
    domain: string;
    myshopify_domain: string;
    currency: string;
    plan_name?: string;
    timezone?: string;
    iana_timezone?: string;
    country_code?: string;
  }> {
    this.requireConfigured();
    const res = await this.get<{ shop: any }>('/shop.json');
    return res.shop;
  }

  // ── Disputes (chargebacks) ──────────────────────────────────────────────
  // Available via /shopify_payments/disputes.json on stores using Shopify
  // Payments. Returns 404/403 on stores with external PSPs — callers should
  // fall back to the Stripe adapter in that case.

  async listDisputes(params: { status?: 'needs_response' | 'won' | 'lost' | 'accepted' | 'under_review'; limit?: number } = {}): Promise<unknown[]> {
    this.requireConfigured();
    const query: Record<string, string | number> = { limit: Math.min(params.limit ?? 50, 250) };
    if (params.status) query.status = params.status;
    try {
      const res = await this.get<{ disputes: unknown[] }>('/shopify_payments/disputes.json', { params: query });
      return res.disputes ?? [];
    } catch (err: any) {
      // 404 = store doesn't use Shopify Payments. Caller falls back.
      if (err?.statusCode === 404) return [];
      throw err;
    }
  }
}
