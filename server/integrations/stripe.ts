/**
 * server/integrations/stripe.ts
 *
 * Stripe API adapter (API version 2024-04-10).
 *
 * Translates Stripe's native charge / payment_intent / refund shapes into the
 * canonical types defined in integrations/types.ts.
 *
 * Supported capabilities (Phase 1):
 *  - Payments: get charge, get payment_intent
 *  - Refunds: list by charge, create refund (idempotent)
 *  - Disputes: presence detection on a charge
 *  - Webhook signature verification (timestamp-tolerant)
 *  - ping (GET /account)
 *
 * Note: Stripe IDs can be charge IDs (ch_*) or payment_intent IDs (pi_*).
 * The adapter handles both transparently.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { BaseIntegrationClient } from './base.js';
import { NotFoundError } from '../errors.js';
import type {
  IntegrationAdapter,
  ReadablePayments,
  WritableRefunds,
  CanonicalPayment,
  CanonicalRefund,
  PaymentStatus,
  RefundStatus,
} from './types.js';

// ── Raw Stripe shapes (private to this file) ──────────────────────────────────

interface StripeCharge {
  id:                string;
  object:            'charge';
  amount:            number;
  amount_refunded:   number;
  currency:          string;
  status:            string;   // 'succeeded' | 'pending' | 'failed'
  disputed:          boolean;
  dispute?:          { id: string } | null;
  refunded:          boolean;
  payment_intent?:   string | null;
  payment_method?:   string | null;
  payment_method_details?: {
    type:  string;
    card?: { last4: string; brand: string };
  };
  failure_code?:     string | null;
  failure_message?:  string | null;
  metadata:          Record<string, string>;
  created:           number;  // Unix timestamp
}

interface StripePaymentIntent {
  id:               string;
  object:           'payment_intent';
  amount:           number;
  amount_received:  number;
  currency:         string;
  status:           string;
  latest_charge?:   string | StripeCharge | null;
  metadata:         Record<string, string>;
  created:          number;
}

interface StripeRefund {
  id:                string;
  object:            'refund';
  charge:            string;
  amount:            number;
  currency:          string;
  status:            string;  // 'succeeded' | 'pending' | 'failed' | 'canceled'
  reason:            string | null;
  idempotency_key?:  string | null;
  created:           number;
}

interface StripeList<T> {
  object: 'list';
  data:   T[];
  has_more: boolean;
}

// ── Mappers ────────────────────────────────────────────────────────────────────

function mapChargeStatus(charge: StripeCharge): PaymentStatus {
  if (charge.disputed)                                return 'disputed';
  if (charge.refunded && charge.amount_refunded >= charge.amount) return 'refunded';
  if (charge.amount_refunded > 0)                     return 'partially_refunded';
  if (charge.status === 'failed')                     return 'failed';
  if (charge.status === 'succeeded')                  return 'captured';
  return 'pending';
}

function mapRefundStatus(status: string): RefundStatus {
  if (status === 'succeeded') return 'succeeded';
  if (status === 'failed')    return 'failed';
  if (status === 'canceled')  return 'cancelled';
  return 'pending';
}

function mapCharge(charge: StripeCharge, orderExternalId?: string | null): CanonicalPayment {
  const details = charge.payment_method_details;
  return {
    id:                 `stripe_charge_${charge.id}`,
    externalId:         charge.id,
    source:             'stripe',
    fetchedAt:          new Date().toISOString(),
    orderExternalId:    orderExternalId ?? charge.metadata?.order_id ?? null,
    customerExternalId: charge.metadata?.customer_id ?? null,
    status:             mapChargeStatus(charge),
    amount:             charge.amount / 100,        // Stripe stores cents
    amountRefunded:     charge.amount_refunded / 100,
    currency:           charge.currency.toUpperCase(),
    paymentMethod:      details?.type ?? null,
    last4:              details?.card?.last4 ?? null,
    brand:              details?.card?.brand ?? null,
    hasDispute:         charge.disputed,
    disputeId:          charge.dispute?.id ?? null,
    failureCode:        charge.failure_code ?? null,
    failureMessage:     charge.failure_message ?? null,
    createdAt:          new Date(charge.created * 1000).toISOString(),
    updatedAt:          new Date(charge.created * 1000).toISOString(),
  };
}

function mapRefund(refund: StripeRefund): CanonicalRefund {
  return {
    id:               `stripe_refund_${refund.id}`,
    externalId:       refund.id,
    source:           'stripe',
    fetchedAt:        new Date().toISOString(),
    paymentExternalId: refund.charge,
    orderExternalId:  null,   // resolved by Identity agent from charge metadata
    status:           mapRefundStatus(refund.status),
    amount:           refund.amount / 100,
    currency:         refund.currency.toUpperCase(),
    reason:           refund.reason,
    idempotencyKey:   refund.idempotency_key ?? null,
    createdAt:        new Date(refund.created * 1000).toISOString(),
  };
}

// ── Adapter ────────────────────────────────────────────────────────────────────

export class StripeAdapter
  extends BaseIntegrationClient
  implements IntegrationAdapter, ReadablePayments, WritableRefunds
{
  readonly system = 'stripe' as const;
  readonly configured: boolean;
  private readonly webhookSecret: string;

  constructor(secretKey: string, webhookSecret: string) {
    super({
      system:  'stripe',
      baseUrl: 'https://api.stripe.com/v1',
      defaultHeaders: {
        'Authorization':  `Bearer ${secretKey}`,
        'Stripe-Version': '2024-04-10',
        'Content-Type':   'application/x-www-form-urlencoded',
      },
      rateLimitPerMinute: 100,  // Stripe: 100 read requests/s in live mode
    });
    this.webhookSecret = webhookSecret;
    this.configured = Boolean(secretKey) && Boolean(webhookSecret);
  }

  // ── IntegrationAdapter ────────────────────────────────────────────────────

  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean {
    const sigHeader = headers['stripe-signature'];
    if (!sigHeader) return false;

    const parts: Record<string, string> = {};
    for (const part of sigHeader.split(',')) {
      const eqIdx = part.indexOf('=');
      if (eqIdx > 0) parts[part.slice(0, eqIdx)] = part.slice(eqIdx + 1);
    }

    const timestamp = parts['t'];
    const v1Sig     = parts['v1'];
    if (!timestamp || !v1Sig) return false;

    // Reject stale events (> 5 minutes)
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

    const expected = createHmac('sha256', this.webhookSecret)
      .update(`${timestamp}.${rawBody}`, 'utf8')
      .digest('hex');

    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(v1Sig));
    } catch {
      return false;
    }
  }

  async ping(): Promise<void> {
    await this.get<{ id: string }>('/account');
  }

  // ── Payments ──────────────────────────────────────────────────────────────

  /**
   * Accepts either a charge ID (ch_*) or a payment_intent ID (pi_*).
   * For payment intents we resolve to the underlying charge automatically.
   */
  async getPayment(externalId: string): Promise<CanonicalPayment> {
    if (externalId.startsWith('pi_')) {
      return this._getPaymentFromIntent(externalId);
    }
    return this._getCharge(externalId);
  }

  private async _getCharge(chargeId: string, orderExternalId?: string | null): Promise<CanonicalPayment> {
    try {
      const charge = await this.get<StripeCharge>(`/charges/${chargeId}`);
      return mapCharge(charge, orderExternalId);
    } catch (err: any) {
      if (err?.statusCode === 404) throw new NotFoundError('StripeCharge', chargeId);
      throw err;
    }
  }

  private async _getPaymentFromIntent(intentId: string): Promise<CanonicalPayment> {
    try {
      const intent = await this.get<StripePaymentIntent>(
        `/payment_intents/${intentId}`,
        { params: { expand: 'latest_charge' } }
      );

      // latest_charge may be expanded (object) or just an ID (string)
      if (!intent.latest_charge) {
        // No charge yet (intent created but not confirmed)
        return {
          id:                 `stripe_intent_${intent.id}`,
          externalId:         intent.id,
          source:             'stripe',
          fetchedAt:          new Date().toISOString(),
          orderExternalId:    intent.metadata?.order_id ?? null,
          customerExternalId: intent.metadata?.customer_id ?? null,
          status:             'pending',
          amount:             intent.amount / 100,
          amountRefunded:     0,
          currency:           intent.currency.toUpperCase(),
          paymentMethod:      null,
          last4:              null,
          brand:              null,
          hasDispute:         false,
          disputeId:          null,
          failureCode:        null,
          failureMessage:     null,
          createdAt:          new Date(intent.created * 1000).toISOString(),
          updatedAt:          new Date(intent.created * 1000).toISOString(),
        };
      }

      if (typeof intent.latest_charge === 'string') {
        return this._getCharge(
          intent.latest_charge,
          intent.metadata?.order_id ?? null
        );
      }

      return mapCharge(intent.latest_charge as StripeCharge, intent.metadata?.order_id ?? null);
    } catch (err: any) {
      if (err?.statusCode === 404) throw new NotFoundError('StripePaymentIntent', intentId);
      throw err;
    }
  }

  async listRefunds(paymentExternalId: string): Promise<CanonicalRefund[]> {
    // paymentExternalId may be a charge ID or payment_intent ID
    const params: Record<string, string | number | boolean> = { limit: 100 };

    if (paymentExternalId.startsWith('pi_')) {
      params.payment_intent = paymentExternalId;
    } else {
      params.charge = paymentExternalId;
    }

    const res = await this.get<StripeList<StripeRefund>>('/refunds', { params });
    return res.data.map(mapRefund);
  }

  // ── Refunds (write) ───────────────────────────────────────────────────────

  async createRefund(params: {
    paymentExternalId: string;
    amount: number;
    currency: string;
    reason?: string;
    idempotencyKey: string;
  }): Promise<CanonicalRefund> {
    // Stripe refund amounts are in the smallest currency unit (cents)
    const body = new URLSearchParams({
      charge: params.paymentExternalId,
      amount: String(Math.round(params.amount * 100)),
      ...(params.reason ? { reason: params.reason } : {}),
    });

    const refund = await this.post<StripeRefund>('/refunds', body.toString(), {
      headers: {
        'Idempotency-Key': params.idempotencyKey,
        'Content-Type':   'application/x-www-form-urlencoded',
      },
      noRetry: true,  // refunds are not safe to auto-retry; the caller controls idempotency
    });

    return mapRefund(refund);
  }

  // ── Phase 2: extended coverage ───────────────────────────────────────────
  //
  // Methods below are NOT part of the canonical IntegrationAdapter interface.
  // They expose Stripe-specific resources directly so the agent / workflows
  // can reach into Subscriptions, Disputes, Invoices, Payouts, etc. Returns
  // are typed `unknown` because we don't want raw Stripe shapes leaking into
  // canonical types — caller maps them locally.

  /** Build form-urlencoded body with Stripe's nested-bracket convention. */
  private static encodeForm(input: Record<string, unknown>, prefix = ''): URLSearchParams {
    const params = new URLSearchParams();
    function append(key: string, value: unknown): void {
      if (value === undefined || value === null) return;
      if (Array.isArray(value)) {
        value.forEach((v, i) => append(`${key}[${i}]`, v));
        return;
      }
      if (typeof value === 'object') {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          append(`${key}[${k}]`, v);
        }
        return;
      }
      params.append(key, String(value));
    }
    for (const [k, v] of Object.entries(input)) {
      append(prefix ? `${prefix}[${k}]` : k, v);
    }
    return params;
  }

  // ── Account ──────────────────────────────────────────────────────────────

  async getAccount(): Promise<unknown> {
    return this.get<unknown>('/account');
  }

  async getBalance(): Promise<unknown> {
    return this.get<unknown>('/balance');
  }

  async listBalanceTransactions(params: { limit?: number; type?: string; created?: { gte?: number; lte?: number } } = {}): Promise<unknown[]> {
    const query: Record<string, string | number> = { limit: Math.min(params.limit ?? 50, 100) };
    if (params.type) query.type = params.type;
    if (params.created?.gte) query['created[gte]'] = params.created.gte;
    if (params.created?.lte) query['created[lte]'] = params.created.lte;
    const res = await this.get<StripeList<unknown>>('/balance_transactions', { params: query });
    return res.data ?? [];
  }

  // ── Customers ────────────────────────────────────────────────────────────

  async listCustomers(params: { limit?: number; email?: string; createdGte?: number } = {}): Promise<unknown[]> {
    const query: Record<string, string | number> = { limit: Math.min(params.limit ?? 50, 100) };
    if (params.email) query.email = params.email;
    if (params.createdGte) query['created[gte]'] = params.createdGte;
    const res = await this.get<StripeList<unknown>>('/customers', { params: query });
    return res.data ?? [];
  }

  async getCustomer(customerId: string): Promise<unknown> {
    return this.get<unknown>(`/customers/${customerId}`);
  }

  async searchCustomers(query: string, limit = 20): Promise<unknown[]> {
    const params: Record<string, string | number> = { query, limit: Math.min(limit, 100) };
    const res = await this.get<StripeList<unknown>>('/customers/search', { params });
    return res.data ?? [];
  }

  async createCustomer(input: { email?: string; name?: string; phone?: string; description?: string; metadata?: Record<string, string> }): Promise<unknown> {
    const body = StripeAdapter.encodeForm(input);
    return this.post<unknown>('/customers', body.toString());
  }

  async updateCustomer(customerId: string, input: { email?: string; name?: string; phone?: string; description?: string; metadata?: Record<string, string> }): Promise<unknown> {
    const body = StripeAdapter.encodeForm(input);
    return this.post<unknown>(`/customers/${customerId}`, body.toString());
  }

  async deleteCustomer(customerId: string): Promise<unknown> {
    return this.delete<unknown>(`/customers/${customerId}`);
  }

  // ── PaymentIntents ───────────────────────────────────────────────────────

  async listPaymentIntents(params: { limit?: number; customerId?: string; createdGte?: number } = {}): Promise<unknown[]> {
    const query: Record<string, string | number> = { limit: Math.min(params.limit ?? 50, 100) };
    if (params.customerId) query.customer = params.customerId;
    if (params.createdGte) query['created[gte]'] = params.createdGte;
    const res = await this.get<StripeList<unknown>>('/payment_intents', { params: query });
    return res.data ?? [];
  }

  async getPaymentIntent(intentId: string): Promise<unknown> {
    return this.get<unknown>(`/payment_intents/${intentId}`);
  }

  async capturePaymentIntent(intentId: string, params: { amountToCapture?: number } = {}): Promise<unknown> {
    const body = StripeAdapter.encodeForm({
      ...(params.amountToCapture !== undefined ? { amount_to_capture: Math.round(params.amountToCapture * 100) } : {}),
    });
    return this.post<unknown>(`/payment_intents/${intentId}/capture`, body.toString());
  }

  async cancelPaymentIntent(intentId: string, cancellationReason?: 'duplicate' | 'fraudulent' | 'requested_by_customer' | 'abandoned'): Promise<unknown> {
    const body = StripeAdapter.encodeForm({
      ...(cancellationReason ? { cancellation_reason: cancellationReason } : {}),
    });
    return this.post<unknown>(`/payment_intents/${intentId}/cancel`, body.toString());
  }

  async confirmPaymentIntent(intentId: string, params: { paymentMethod?: string; returnUrl?: string } = {}): Promise<unknown> {
    const body = StripeAdapter.encodeForm({
      ...(params.paymentMethod ? { payment_method: params.paymentMethod } : {}),
      ...(params.returnUrl ? { return_url: params.returnUrl } : {}),
    });
    return this.post<unknown>(`/payment_intents/${intentId}/confirm`, body.toString());
  }

  // ── Charges ──────────────────────────────────────────────────────────────

  async listCharges(params: { limit?: number; customerId?: string; createdGte?: number } = {}): Promise<unknown[]> {
    const query: Record<string, string | number> = { limit: Math.min(params.limit ?? 50, 100) };
    if (params.customerId) query.customer = params.customerId;
    if (params.createdGte) query['created[gte]'] = params.createdGte;
    const res = await this.get<StripeList<unknown>>('/charges', { params: query });
    return res.data ?? [];
  }

  async captureCharge(chargeId: string, params: { amount?: number } = {}): Promise<unknown> {
    const body = StripeAdapter.encodeForm({
      ...(params.amount !== undefined ? { amount: Math.round(params.amount * 100) } : {}),
    });
    return this.post<unknown>(`/charges/${chargeId}/capture`, body.toString());
  }

  // ── Disputes ─────────────────────────────────────────────────────────────

  async listDisputes(params: { limit?: number; chargeId?: string; paymentIntentId?: string } = {}): Promise<unknown[]> {
    const query: Record<string, string | number> = { limit: Math.min(params.limit ?? 50, 100) };
    if (params.chargeId) query.charge = params.chargeId;
    if (params.paymentIntentId) query.payment_intent = params.paymentIntentId;
    const res = await this.get<StripeList<unknown>>('/disputes', { params: query });
    return res.data ?? [];
  }

  async getDispute(disputeId: string): Promise<unknown> {
    return this.get<unknown>(`/disputes/${disputeId}`);
  }

  /**
   * Submit (or save draft of) dispute evidence. The evidence object accepts
   * any Stripe-supported field — common ones: `customer_communication`,
   * `customer_signature`, `receipt`, `service_documentation`,
   * `shipping_documentation`, `uncategorized_text`, plus plain strings like
   * `customer_name`, `billing_address`, `customer_email_address`. File-typed
   * fields take Stripe File IDs (uploaded via `uploadFile`).
   *
   * Pass `submit=true` to finalise the response. Otherwise it stays as a
   * draft and the merchant can edit before submitting.
   */
  async updateDispute(disputeId: string, input: { evidence?: Record<string, unknown>; submit?: boolean; metadata?: Record<string, string> }): Promise<unknown> {
    const body = StripeAdapter.encodeForm(input as Record<string, unknown>);
    return this.post<unknown>(`/disputes/${disputeId}`, body.toString());
  }

  async closeDispute(disputeId: string): Promise<unknown> {
    return this.post<unknown>(`/disputes/${disputeId}/close`, '');
  }

  // ── Files (upload for dispute evidence) ──────────────────────────────────

  /**
   * Upload a file for use as dispute evidence. Stripe Files are multipart/
   * form-data, so we use a separate endpoint host.
   *
   * Returns the Stripe File object whose `id` is what you put in the
   * dispute evidence payload (e.g. `evidence.receipt = file_id`).
   */
  async uploadFile(input: {
    purpose: 'dispute_evidence' | 'identity_document' | 'tax_document_user_upload';
    file: { name: string; data: Buffer; contentType: string };
  }): Promise<{ id: string; type: string; size: number }> {
    // Stripe file uploads use a dedicated host: files.stripe.com
    const boundary = `----CRM-AI-${Date.now()}`;
    const lines: Array<string | Buffer> = [];
    lines.push(`--${boundary}`);
    lines.push(`Content-Disposition: form-data; name="purpose"`);
    lines.push('');
    lines.push(input.purpose);
    lines.push(`--${boundary}`);
    lines.push(`Content-Disposition: form-data; name="file"; filename="${input.file.name}"`);
    lines.push(`Content-Type: ${input.file.contentType}`);
    lines.push('');
    lines.push(input.file.data);
    lines.push(`--${boundary}--`);
    const body = Buffer.concat(
      lines.map((l) => (Buffer.isBuffer(l) ? Buffer.concat([l, Buffer.from('\r\n')]) : Buffer.from(`${l}\r\n`))),
    );

    // We need the bearer token — peek through the base client's defaultHeaders
    // (they include Authorization). Since `this` is a BaseIntegrationClient,
    // re-use the same Authorization header by hand.
    const auth = (this as any).defaultHeaders?.Authorization
      ?? (this as any).config?.defaultHeaders?.Authorization;

    const res = await fetch('https://files.stripe.com/v1/files', {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`stripe file upload failed: ${res.status} ${text}`);
    }
    return (await res.json()) as { id: string; type: string; size: number };
  }

  // ── Subscriptions ────────────────────────────────────────────────────────

  async listSubscriptions(params: { limit?: number; customerId?: string; status?: 'active' | 'past_due' | 'unpaid' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'all' } = {}): Promise<unknown[]> {
    const query: Record<string, string | number> = { limit: Math.min(params.limit ?? 50, 100) };
    if (params.customerId) query.customer = params.customerId;
    if (params.status) query.status = params.status;
    const res = await this.get<StripeList<unknown>>('/subscriptions', { params: query });
    return res.data ?? [];
  }

  async getSubscription(subscriptionId: string): Promise<unknown> {
    return this.get<unknown>(`/subscriptions/${subscriptionId}`);
  }

  async cancelSubscription(subscriptionId: string, params: { cancelAtPeriodEnd?: boolean; invoiceNow?: boolean; prorate?: boolean } = {}): Promise<unknown> {
    if (params.cancelAtPeriodEnd) {
      // "Schedule cancellation at end of period" is an UPDATE, not a DELETE.
      const body = StripeAdapter.encodeForm({ cancel_at_period_end: true });
      return this.post<unknown>(`/subscriptions/${subscriptionId}`, body.toString());
    }
    const query: Record<string, string | boolean> = {};
    if (params.invoiceNow) query.invoice_now = true;
    if (params.prorate !== undefined) query.prorate = params.prorate;
    return this.delete<unknown>(`/subscriptions/${subscriptionId}`, { params: query });
  }

  async updateSubscription(subscriptionId: string, input: { priceId?: string; quantity?: number; cancelAtPeriodEnd?: boolean; metadata?: Record<string, string>; trialEnd?: number | 'now' }): Promise<unknown> {
    const payload: Record<string, unknown> = {};
    if (input.priceId !== undefined) payload.items = [{ price: input.priceId }];
    if (input.quantity !== undefined) payload['items[0][quantity]'] = input.quantity;
    if (input.cancelAtPeriodEnd !== undefined) payload.cancel_at_period_end = input.cancelAtPeriodEnd;
    if (input.metadata) payload.metadata = input.metadata;
    if (input.trialEnd !== undefined) payload.trial_end = input.trialEnd;
    const body = StripeAdapter.encodeForm(payload);
    return this.post<unknown>(`/subscriptions/${subscriptionId}`, body.toString());
  }

  async pauseSubscription(subscriptionId: string, behavior: 'keep_as_draft' | 'mark_uncollectible' | 'void' = 'mark_uncollectible'): Promise<unknown> {
    const body = StripeAdapter.encodeForm({ pause_collection: { behavior } });
    return this.post<unknown>(`/subscriptions/${subscriptionId}`, body.toString());
  }

  async resumeSubscription(subscriptionId: string): Promise<unknown> {
    const body = StripeAdapter.encodeForm({ pause_collection: '' });
    return this.post<unknown>(`/subscriptions/${subscriptionId}`, body.toString());
  }

  // ── Invoices ─────────────────────────────────────────────────────────────

  async listInvoices(params: { limit?: number; customerId?: string; status?: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void' } = {}): Promise<unknown[]> {
    const query: Record<string, string | number> = { limit: Math.min(params.limit ?? 50, 100) };
    if (params.customerId) query.customer = params.customerId;
    if (params.status) query.status = params.status;
    const res = await this.get<StripeList<unknown>>('/invoices', { params: query });
    return res.data ?? [];
  }

  async getInvoice(invoiceId: string): Promise<unknown> {
    return this.get<unknown>(`/invoices/${invoiceId}`);
  }

  async createInvoice(input: { customerId: string; description?: string; daysUntilDue?: number; autoAdvance?: boolean; metadata?: Record<string, string> }): Promise<unknown> {
    const body = StripeAdapter.encodeForm({
      customer: input.customerId,
      description: input.description,
      days_until_due: input.daysUntilDue,
      auto_advance: input.autoAdvance ?? false,
      metadata: input.metadata,
    });
    return this.post<unknown>('/invoices', body.toString());
  }

  async finalizeInvoice(invoiceId: string): Promise<unknown> {
    return this.post<unknown>(`/invoices/${invoiceId}/finalize`, '');
  }

  async sendInvoice(invoiceId: string): Promise<unknown> {
    return this.post<unknown>(`/invoices/${invoiceId}/send`, '');
  }

  async voidInvoice(invoiceId: string): Promise<unknown> {
    return this.post<unknown>(`/invoices/${invoiceId}/void`, '');
  }

  async payInvoice(invoiceId: string, params: { paidOutOfBand?: boolean } = {}): Promise<unknown> {
    const body = StripeAdapter.encodeForm({ paid_out_of_band: params.paidOutOfBand });
    return this.post<unknown>(`/invoices/${invoiceId}/pay`, body.toString());
  }

  // ── Products & Prices ────────────────────────────────────────────────────

  async listProducts(params: { limit?: number; active?: boolean } = {}): Promise<unknown[]> {
    const query: Record<string, string | number | boolean> = { limit: Math.min(params.limit ?? 50, 100) };
    if (params.active !== undefined) query.active = params.active;
    const res = await this.get<StripeList<unknown>>('/products', { params: query });
    return res.data ?? [];
  }

  async getProduct(productId: string): Promise<unknown> {
    return this.get<unknown>(`/products/${productId}`);
  }

  async createProduct(input: { name: string; description?: string; metadata?: Record<string, string> }): Promise<unknown> {
    const body = StripeAdapter.encodeForm(input as Record<string, unknown>);
    return this.post<unknown>('/products', body.toString());
  }

  async listPrices(params: { limit?: number; productId?: string; active?: boolean } = {}): Promise<unknown[]> {
    const query: Record<string, string | number | boolean> = { limit: Math.min(params.limit ?? 50, 100) };
    if (params.productId) query.product = params.productId;
    if (params.active !== undefined) query.active = params.active;
    const res = await this.get<StripeList<unknown>>('/prices', { params: query });
    return res.data ?? [];
  }

  async createPrice(input: { productId: string; unitAmount: number; currency: string; recurring?: { interval: 'day' | 'week' | 'month' | 'year'; intervalCount?: number } }): Promise<unknown> {
    const body = StripeAdapter.encodeForm({
      product: input.productId,
      unit_amount: Math.round(input.unitAmount * 100),
      currency: input.currency,
      ...(input.recurring ? {
        recurring: {
          interval: input.recurring.interval,
          ...(input.recurring.intervalCount ? { interval_count: input.recurring.intervalCount } : {}),
        },
      } : {}),
    });
    return this.post<unknown>('/prices', body.toString());
  }

  // ── Coupons & PromotionCodes ─────────────────────────────────────────────

  async listCoupons(limit = 50): Promise<unknown[]> {
    const res = await this.get<StripeList<unknown>>('/coupons', { params: { limit: Math.min(limit, 100) } });
    return res.data ?? [];
  }

  async createCoupon(input: { id?: string; percentOff?: number; amountOff?: number; currency?: string; duration: 'once' | 'forever' | 'repeating'; durationInMonths?: number; maxRedemptions?: number; redeemBy?: number; name?: string }): Promise<unknown> {
    const body = StripeAdapter.encodeForm({
      ...(input.id ? { id: input.id } : {}),
      duration: input.duration,
      duration_in_months: input.durationInMonths,
      percent_off: input.percentOff,
      amount_off: input.amountOff !== undefined ? Math.round(input.amountOff * 100) : undefined,
      currency: input.currency,
      max_redemptions: input.maxRedemptions,
      redeem_by: input.redeemBy,
      name: input.name,
    });
    return this.post<unknown>('/coupons', body.toString());
  }

  async createPromotionCode(input: { couponId: string; code?: string; customerId?: string; maxRedemptions?: number; expiresAt?: number }): Promise<unknown> {
    const body = StripeAdapter.encodeForm({
      coupon: input.couponId,
      code: input.code,
      customer: input.customerId,
      max_redemptions: input.maxRedemptions,
      expires_at: input.expiresAt,
    });
    return this.post<unknown>('/promotion_codes', body.toString());
  }

  // ── Payouts ──────────────────────────────────────────────────────────────

  async listPayouts(params: { limit?: number; status?: 'paid' | 'pending' | 'in_transit' | 'canceled' | 'failed' } = {}): Promise<unknown[]> {
    const query: Record<string, string | number> = { limit: Math.min(params.limit ?? 50, 100) };
    if (params.status) query.status = params.status;
    const res = await this.get<StripeList<unknown>>('/payouts', { params: query });
    return res.data ?? [];
  }

  async getPayout(payoutId: string): Promise<unknown> {
    return this.get<unknown>(`/payouts/${payoutId}`);
  }

  async createPayout(input: { amount: number; currency: string; method?: 'standard' | 'instant'; description?: string }): Promise<unknown> {
    const body = StripeAdapter.encodeForm({
      amount: Math.round(input.amount * 100),
      currency: input.currency,
      method: input.method,
      description: input.description,
    });
    return this.post<unknown>('/payouts', body.toString());
  }

  // ── Transfers (Connect) ──────────────────────────────────────────────────

  async listTransfers(params: { limit?: number; destination?: string } = {}): Promise<unknown[]> {
    const query: Record<string, string | number> = { limit: Math.min(params.limit ?? 50, 100) };
    if (params.destination) query.destination = params.destination;
    const res = await this.get<StripeList<unknown>>('/transfers', { params: query });
    return res.data ?? [];
  }

  // ── Webhook endpoints ────────────────────────────────────────────────────

  async listWebhookEndpoints(): Promise<unknown[]> {
    const res = await this.get<StripeList<unknown>>('/webhook_endpoints', { params: { limit: 100 } });
    return res.data ?? [];
  }

  /**
   * Programmatically register a webhook endpoint. Returns the created
   * endpoint with `secret` set — caller MUST persist it to verify inbound
   * webhooks. The secret is only returned at creation time.
   */
  async createWebhookEndpoint(input: { url: string; events: string[]; description?: string; metadata?: Record<string, string> }): Promise<{ id: string; secret: string; enabled_events: string[]; url: string }> {
    const body = StripeAdapter.encodeForm({
      url: input.url,
      enabled_events: input.events,
      description: input.description,
      metadata: input.metadata,
      api_version: '2024-04-10',
    });
    return this.post<{ id: string; secret: string; enabled_events: string[]; url: string }>(
      '/webhook_endpoints',
      body.toString(),
    );
  }

  async deleteWebhookEndpoint(endpointId: string): Promise<unknown> {
    return this.delete<unknown>(`/webhook_endpoints/${endpointId}`);
  }
}
