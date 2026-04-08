/**
 * server/integrations/types.ts
 *
 * Canonical data models and interface contracts for all external integrations.
 *
 * Design rule: every integration adapter must translate its external API
 * response into these canonical types. The rest of the system only ever
 * deals with canonical types — never with raw Shopify/Stripe/etc. shapes.
 * This means swapping an integration provider never touches anything outside
 * the adapter file.
 */

// ── Integration identity ──────────────────────────────────────────────────────

/** Known integration system identifiers */
export type IntegrationSystem =
  | 'shopify'
  | 'stripe'
  | 'paypal'
  | 'easypost'
  | 'shipstation'
  | 'recharge'
  | 'zendesk'
  | 'gorgias'
  | 'intercom'
  | 'netsuite'
  | 'whatsapp'
  | 'sendgrid'
  | 'klaviyo';

// ── Base canonical types ──────────────────────────────────────────────────────

/** Every canonical entity returned from an integration adapter */
export interface CanonicalEntity {
  /** Our internal ID (mapped from external) */
  id: string;
  /** The external system's native ID */
  externalId: string;
  /** Which system produced this data */
  source: IntegrationSystem;
  /** When this data was fetched */
  fetchedAt: string;
}

// ── Customer ──────────────────────────────────────────────────────────────────

export interface CanonicalCustomer extends CanonicalEntity {
  email:       string | null;
  phone:       string | null;
  firstName:   string | null;
  lastName:    string | null;
  displayName: string;
  tags:        string[];
  /** Raw additional fields the adapter wants to surface */
  raw?: Record<string, unknown>;
}

// ── Order ─────────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'fulfilled'
  | 'partially_fulfilled'
  | 'cancelled'
  | 'refunded'
  | 'in_dispute';

export interface CanonicalOrderLineItem {
  externalId:  string;
  title:       string;
  sku:         string | null;
  quantity:    number;
  unitPrice:   number;
  totalPrice:  number;
  currency:    string;
}

export interface CanonicalOrder extends CanonicalEntity {
  externalOrderNumber: string | null;
  status:              OrderStatus;
  financialStatus:     string | null;
  fulfillmentStatus:   string | null;
  currency:            string;
  totalAmount:         number;
  subtotal:            number;
  taxAmount:           number;
  shippingAmount:      number;
  lineItems:           CanonicalOrderLineItem[];
  customerExternalId:  string | null;
  shippingAddress:     CanonicalAddress | null;
  billingAddress:      CanonicalAddress | null;
  tags:                string[];
  createdAt:           string;
  updatedAt:           string;
  cancelledAt:         string | null;
  raw?: Record<string, unknown>;
}

export interface CanonicalAddress {
  firstName:   string | null;
  lastName:    string | null;
  address1:    string | null;
  address2:    string | null;
  city:        string | null;
  province:    string | null;
  country:     string | null;
  zip:         string | null;
  phone:       string | null;
}

// ── Payment ───────────────────────────────────────────────────────────────────

export type PaymentStatus =
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'partially_refunded'
  | 'refunded'
  | 'failed'
  | 'disputed'
  | 'cancelled';

export interface CanonicalPayment extends CanonicalEntity {
  orderExternalId:    string | null;
  customerExternalId: string | null;
  status:             PaymentStatus;
  amount:             number;
  amountRefunded:     number;
  currency:           string;
  paymentMethod:      string | null;  // 'card', 'paypal', etc.
  last4:              string | null;
  brand:              string | null;  // 'visa', 'mastercard', etc.
  hasDispute:         boolean;
  disputeId:          string | null;
  failureCode:        string | null;
  failureMessage:     string | null;
  createdAt:          string;
  updatedAt:          string;
  raw?: Record<string, unknown>;
}

// ── Refund ────────────────────────────────────────────────────────────────────

export type RefundStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled';

export interface CanonicalRefund extends CanonicalEntity {
  paymentExternalId:  string;
  orderExternalId:    string | null;
  status:             RefundStatus;
  amount:             number;
  currency:           string;
  reason:             string | null;
  idempotencyKey:     string | null;
  createdAt:          string;
  raw?: Record<string, unknown>;
}

// ── Fulfillment / Shipment ────────────────────────────────────────────────────

export type FulfillmentStatus =
  | 'pending'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed'
  | 'returned';

export interface CanonicalFulfillment extends CanonicalEntity {
  orderExternalId:  string;
  status:           FulfillmentStatus;
  trackingNumber:   string | null;
  trackingUrl:      string | null;
  carrier:          string | null;
  estimatedDelivery: string | null;
  deliveredAt:      string | null;
  createdAt:        string;
  updatedAt:        string;
  raw?: Record<string, unknown>;
}

// ── Return ────────────────────────────────────────────────────────────────────

export type ReturnStatus =
  | 'requested'
  | 'label_created'
  | 'in_transit'
  | 'received'
  | 'inspecting'
  | 'approved'
  | 'rejected'
  | 'refund_issued'
  | 'closed';

export interface CanonicalReturn extends CanonicalEntity {
  orderExternalId:    string;
  customerExternalId: string | null;
  status:             ReturnStatus;
  reason:             string | null;
  totalValue:         number;
  currency:           string;
  trackingNumber:     string | null;
  labelUrl:           string | null;
  createdAt:          string;
  updatedAt:          string;
  raw?: Record<string, unknown>;
}

// ── Webhook event ─────────────────────────────────────────────────────────────

export interface IncomingWebhookEvent {
  source:    IntegrationSystem;
  topic:     string;           // e.g. 'orders/paid', 'charge.refunded'
  externalId: string | null;   // entity ID from the webhook if extractable
  rawBody:   string;
  headers:   Record<string, string>;
  receivedAt: string;
}

// ── Integration adapter contract ──────────────────────────────────────────────

/**
 * Every integration adapter must implement this interface.
 * Methods return canonical types — never raw API responses.
 */
export interface IntegrationAdapter {
  readonly system: IntegrationSystem;

  /** Verify a webhook signature. Returns true if valid. */
  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean;

  /** Health check — resolves if credentials are valid */
  ping(): Promise<void>;
}

/** Optional read capabilities — adapters implement what they support */
export interface ReadableOrders {
  getOrder(externalId: string): Promise<CanonicalOrder>;
  listOrders(params?: { limit?: number; since?: string }): Promise<CanonicalOrder[]>;
}

export interface ReadablePayments {
  getPayment(externalId: string): Promise<CanonicalPayment>;
  listRefunds(paymentExternalId: string): Promise<CanonicalRefund[]>;
}

export interface ReadableCustomers {
  getCustomer(externalId: string): Promise<CanonicalCustomer>;
  findCustomerByEmail(email: string): Promise<CanonicalCustomer | null>;
  findCustomerByPhone(phone: string): Promise<CanonicalCustomer | null>;
}

export interface ReadableFulfillments {
  getFulfillment(externalId: string): Promise<CanonicalFulfillment>;
  listFulfillmentsForOrder(orderExternalId: string): Promise<CanonicalFulfillment[]>;
}

export interface ReadableReturns {
  getReturn(externalId: string): Promise<CanonicalReturn>;
  listReturnsForOrder(orderExternalId: string): Promise<CanonicalReturn[]>;
}

/** Optional write capabilities */
export interface WritableRefunds {
  createRefund(params: {
    paymentExternalId: string;
    amount: number;
    currency: string;
    reason?: string;
    idempotencyKey: string;
  }): Promise<CanonicalRefund>;
}
