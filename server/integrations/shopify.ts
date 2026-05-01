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
import type {
  IntegrationAdapter,
  ReadableOrders,
  ReadableCustomers,
  ReadableFulfillments,
  ReadableReturns,
  WritableOrders,
  WritableReturns,
  CanonicalOrder,
  CanonicalOrderLineItem,
  CanonicalCustomer,
  CanonicalFulfillment,
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

export class ShopifyAdapter
  extends BaseIntegrationClient
  implements IntegrationAdapter, ReadableOrders, ReadableCustomers, ReadableFulfillments, ReadableReturns, WritableOrders, WritableReturns
{
  readonly system = 'shopify' as const;
  private readonly webhookSecret: string;

  constructor(shopDomain: string, adminApiToken: string, webhookSecret: string) {
    super({
      system:    'shopify',
      baseUrl:   `https://${shopDomain}/admin/api/2024-01`,
      defaultHeaders: { 'X-Shopify-Access-Token': adminApiToken },
      rateLimitPerMinute: 80,  // Shopify: 2 req/s = 120/min; we stay conservative
    });
    this.webhookSecret = webhookSecret;
  }

  // ── IntegrationAdapter ────────────────────────────────────────────────────

  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean {
    const hmacHeader = headers['x-shopify-hmac-sha256'];
    if (!hmacHeader) return false;
    const digest = createHmac('sha256', this.webhookSecret)
      .update(rawBody, 'utf8')
      .digest('base64');
    try {
      return timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
    } catch {
      return false;
    }
  }

  async ping(): Promise<void> {
    await this.get<{ shop: { id: number } }>('/shop.json');
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async getOrder(externalId: string): Promise<CanonicalOrder> {
    try {
      const res = await this.get<{ order: ShopifyOrder }>(`/orders/${externalId}.json`);
      return mapOrder(res.order);
    } catch (err: any) {
      if (err?.statusCode === 404) throw new NotFoundError('ShopifyOrder', externalId);
      throw err;
    }
  }

  async listOrders(params: { limit?: number; since?: string } = {}): Promise<CanonicalOrder[]> {
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
    try {
      const res = await this.get<{ customer: ShopifyCustomer }>(`/customers/${externalId}.json`);
      return mapCustomer(res.customer);
    } catch (err: any) {
      if (err?.statusCode === 404) throw new NotFoundError('ShopifyCustomer', externalId);
      throw err;
    }
  }

  async findCustomerByEmail(email: string): Promise<CanonicalCustomer | null> {
    const res = await this.get<{ customers: ShopifyCustomer[] }>('/customers/search.json', {
      params: { query: `email:${email}`, limit: 1 },
    });
    if (!res.customers.length) return null;
    return mapCustomer(res.customers[0]);
  }

  async findCustomerByPhone(phone: string): Promise<CanonicalCustomer | null> {
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
}
