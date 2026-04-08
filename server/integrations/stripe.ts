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
}
