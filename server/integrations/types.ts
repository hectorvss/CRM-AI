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
  | 'klaviyo'
  | 'postmark'
  | 'twilio'
  | 'email'
  | 'sms'
  | 'web_chat';

// ── Not-configured error ──────────────────────────────────────────────────────

/**
 * Thrown by integration adapters and channel senders when the credentials
 * required to talk to the external service are absent.
 *
 * Routes catch this and respond with HTTP 503 + a machine-readable
 * `code` so that the UI can surface a clear "not configured" message
 * instead of a generic 500.
 *
 * Subclasses keep a stable `code` per integration so callers can branch
 * on it without parsing message strings.
 */
export class IntegrationNotConfiguredError extends Error {
  readonly code: string;
  readonly integration: IntegrationSystem;
  readonly missingVars: string[];

  constructor(
    integration: IntegrationSystem,
    missingVars: string[],
    code?: string,
    message?: string,
  ) {
    super(
      message ??
      `${integration} integration is not configured. Missing: ${missingVars.join(', ')}. ` +
      `Configure the required environment variables to enable ${integration}.`,
    );
    this.name = 'IntegrationNotConfiguredError';
    this.integration = integration;
    this.missingVars = missingVars;
    this.code = code ?? `${integration.toUpperCase()}_NOT_CONFIGURED`;
  }
}

export class ShopifyNotConfiguredError extends IntegrationNotConfiguredError {
  constructor(missingVars: string[]) {
    super('shopify', missingVars, 'SHOPIFY_NOT_CONFIGURED');
  }
}

export class WhatsAppNotConfiguredError extends IntegrationNotConfiguredError {
  constructor(missingVars: string[]) {
    super('whatsapp', missingVars, 'WHATSAPP_NOT_CONFIGURED');
  }
}

export class PostmarkNotConfiguredError extends IntegrationNotConfiguredError {
  constructor(missingVars: string[]) {
    super('postmark', missingVars, 'POSTMARK_NOT_CONFIGURED');
  }
}

export class TwilioNotConfiguredError extends IntegrationNotConfiguredError {
  constructor(missingVars: string[]) {
    super('twilio', missingVars, 'TWILIO_NOT_CONFIGURED');
  }
}

export function isIntegrationNotConfiguredError(
  err: unknown,
): err is IntegrationNotConfiguredError {
  return err instanceof IntegrationNotConfiguredError ||
    (typeof err === 'object' &&
     err !== null &&
     typeof (err as any).code === 'string' &&
     (err as any).code.endsWith('_NOT_CONFIGURED'));
}

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

  /**
   * True when the adapter has all credentials it needs to talk to the
   * external service. Adapters created in "stub mode" (no creds) report
   * `false` here so the registry can answer health-check queries without
   * forcing a 5xx on every read.
   *
   * Optional for backwards compatibility: legacy / sandbox adapters that
   * don't set the field are treated as configured.
   */
  readonly configured?: boolean;

  /** Verify a webhook signature. Returns true if valid. */
  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean;

  /** Health check — resolves if credentials are valid */
  ping(): Promise<void>;
}

// ── Normalized channel message ────────────────────────────────────────────────

/**
 * Canonical inbound channel message stored in `canonical_events.normalized_payload`.
 * Mirrors the `NormalizedChannelMessage` consumed by `pipeline/channelIngest.ts`.
 *
 * Kept here so webhook handlers and the worker share one source of truth.
 */
export interface NormalizedChannelMessage {
  /** The raw message content (plain text, HTML stripped for email) */
  messageContent: string;
  /** Sender identifier: phone number, email address, or session ID */
  senderId: string;
  /** Human-readable sender name if available */
  senderName?: string | null;
  /** Channel the message arrived on */
  channel: 'email' | 'web_chat' | 'whatsapp' | 'sms';
  /** Platform-native message ID (for dedup) */
  externalMessageId: string;
  /** ISO timestamp the message was sent */
  sentAt: string;
  /** Optional: a prior conversation/thread ID from the channel */
  externalThreadId?: string;
  /** Optional: subject line (email only) */
  subject?: string;
  /** Optional: attachments list (filenames only for now) */
  attachments?: string[];
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

export interface WritableOrders {
  cancelOrder(params: {
    orderExternalId: string;
    reason?: string;
    email?: boolean;   // notify customer
    restock?: boolean; // restock line items
  }): Promise<CanonicalOrder>;
}

export interface WritableReturns {
  createReturn(params: {
    orderExternalId: string;
    lineItems: Array<{ lineItemId: string; quantity: number; reason?: string }>;
    notifyCustomer?: boolean;
  }): Promise<CanonicalReturn>;
}
