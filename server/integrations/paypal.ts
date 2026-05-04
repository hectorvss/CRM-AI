/**
 * server/integrations/paypal.ts
 *
 * PayPal REST adapter. Coverage parallels what Stripe gives us:
 *   - Orders v2 (checkout flow + capture/authorize)
 *   - Payments v2 (captures, authorizations, refunds, voids)
 *   - Disputes v1 (chargebacks: list, get, accept, provide evidence)
 *   - Subscriptions v1 (plans, subscriptions: list/cancel/suspend/activate)
 *   - Invoices v2 (CRUD + send + remind + cancel)
 *   - Webhooks v1 (CRUD + signature verification via PayPal's API)
 *
 * Auth: every call uses Bearer <access_token>. The token comes from
 * Client Credentials in paypal-oauth.ts and is cached in paypal-tenant.ts.
 *
 * Docs: https://developer.paypal.com/api/rest/
 */

import { logger } from '../utils/logger.js';
import { PAYPAL_BASE, type PayPalMode } from './paypal-oauth.js';

interface PaypalList<T> {
  items?: T[];
  links?: any[];
  total_items?: number;
  total_pages?: number;
}

export class PayPalAdapter {
  constructor(
    private readonly accessToken: string,
    private readonly mode: PayPalMode,
  ) {}

  private async req<T>(method: string, path: string, init?: { body?: unknown; query?: Record<string, string | number | boolean>; idempotencyKey?: string }): Promise<T> {
    const url = new URL(`${PAYPAL_BASE[this.mode]}${path}`);
    if (init?.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    };
    if (init?.idempotencyKey) {
      // PayPal calls this `PayPal-Request-Id` on Orders/Payments.
      headers['PayPal-Request-Id'] = init.idempotencyKey;
    }
    let body: BodyInit | undefined;
    if (init?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.body);
    }
    const res = await fetch(url.toString(), { method, headers, body });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let message = text;
      try {
        const j = JSON.parse(text);
        message = j?.message ?? j?.error_description ?? j?.error ?? text;
      } catch { /* keep raw */ }
      const err: any = new Error(`PayPal ${method} ${path} ${res.status}: ${message}`);
      err.statusCode = res.status;
      err.paypalCode = (() => { try { return JSON.parse(text)?.name ?? null; } catch { return null; } })();
      err.paypalDetails = (() => { try { return JSON.parse(text)?.details ?? null; } catch { return null; } })();
      err.paypalRaw = text;
      throw err;
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  // ── Identity / health ────────────────────────────────────────────────────

  /**
   * Fetch the merchant's identity payload. The token we have was minted
   * for their app, so this confirms the creds are alive.
   */
  async getMerchantInfo(): Promise<unknown> {
    return this.req('GET', '/v1/identity/oauth2/userinfo?schema=paypalv1.1');
  }

  // ── Orders v2 (modern checkout API) ──────────────────────────────────────

  async getOrder(orderId: string): Promise<unknown> {
    return this.req('GET', `/v2/checkout/orders/${orderId}`);
  }

  /** Capture funds on an APPROVED order. Idempotent via PayPal-Request-Id. */
  async captureOrder(orderId: string, opts: { idempotencyKey?: string } = {}): Promise<unknown> {
    return this.req('POST', `/v2/checkout/orders/${orderId}/capture`, {
      body: {},
      idempotencyKey: opts.idempotencyKey,
    });
  }

  async authorizeOrder(orderId: string, opts: { idempotencyKey?: string } = {}): Promise<unknown> {
    return this.req('POST', `/v2/checkout/orders/${orderId}/authorize`, {
      body: {},
      idempotencyKey: opts.idempotencyKey,
    });
  }

  /**
   * Create an order programmatically (server-side). Most agents will fetch
   * existing orders rather than create them, but this enables flows like
   * "agent draft a payment link the customer can complete".
   */
  async createOrder(input: {
    intent: 'CAPTURE' | 'AUTHORIZE';
    purchaseUnits: Array<{
      amount: { currency_code: string; value: string };
      description?: string;
      reference_id?: string;
      invoice_id?: string;
      custom_id?: string;
    }>;
    paymentSource?: unknown;
    applicationContext?: { return_url?: string; cancel_url?: string; brand_name?: string };
    idempotencyKey?: string;
  }): Promise<unknown> {
    const { idempotencyKey, ...body } = input;
    return this.req('POST', '/v2/checkout/orders', {
      body: {
        intent: body.intent,
        purchase_units: body.purchaseUnits,
        ...(body.paymentSource ? { payment_source: body.paymentSource } : {}),
        ...(body.applicationContext ? { application_context: body.applicationContext } : {}),
      },
      idempotencyKey,
    });
  }

  // ── Payments v2 (captures, authorizations, refunds, voids) ──────────────

  async getCapture(captureId: string): Promise<unknown> {
    return this.req('GET', `/v2/payments/captures/${captureId}`);
  }

  /** Issue a refund against a captured payment. */
  async refundCapture(captureId: string, opts: {
    amount?: { currency_code: string; value: string };
    invoiceId?: string;
    note?: string;
    idempotencyKey?: string;
  } = {}): Promise<unknown> {
    return this.req('POST', `/v2/payments/captures/${captureId}/refund`, {
      body: {
        ...(opts.amount ? { amount: opts.amount } : {}),
        ...(opts.invoiceId ? { invoice_id: opts.invoiceId } : {}),
        ...(opts.note ? { note_to_payer: opts.note } : {}),
      },
      idempotencyKey: opts.idempotencyKey,
    });
  }

  async getAuthorization(authorizationId: string): Promise<unknown> {
    return this.req('GET', `/v2/payments/authorizations/${authorizationId}`);
  }

  /** Capture a previously authorized payment. */
  async captureAuthorization(authorizationId: string, opts: {
    amount?: { currency_code: string; value: string };
    invoiceId?: string;
    finalCapture?: boolean;
    note?: string;
    idempotencyKey?: string;
  } = {}): Promise<unknown> {
    return this.req('POST', `/v2/payments/authorizations/${authorizationId}/capture`, {
      body: {
        ...(opts.amount ? { amount: opts.amount } : {}),
        ...(opts.invoiceId ? { invoice_id: opts.invoiceId } : {}),
        ...(opts.finalCapture !== undefined ? { final_capture: opts.finalCapture } : {}),
        ...(opts.note ? { note_to_payer: opts.note } : {}),
      },
      idempotencyKey: opts.idempotencyKey,
    });
  }

  /** Void an authorization (release the hold without capturing). */
  async voidAuthorization(authorizationId: string): Promise<unknown> {
    return this.req('POST', `/v2/payments/authorizations/${authorizationId}/void`);
  }

  async getRefund(refundId: string): Promise<unknown> {
    return this.req('GET', `/v2/payments/refunds/${refundId}`);
  }

  // ── Disputes v1 (chargebacks) ────────────────────────────────────────────

  async listDisputes(params: { pageSize?: number; status?: 'OPEN' | 'WAITING_FOR_BUYER_RESPONSE' | 'WAITING_FOR_SELLER_RESPONSE' | 'UNDER_REVIEW' | 'RESOLVED' | 'OTHER'; updateTimeAfter?: string } = {}): Promise<unknown[]> {
    const query: Record<string, string | number> = {
      page_size: Math.min(params.pageSize ?? 50, 50),
    };
    if (params.status) query.dispute_state = params.status;
    if (params.updateTimeAfter) query.update_time_after = params.updateTimeAfter;
    const res = await this.req<PaypalList<unknown>>('GET', '/v1/customer/disputes', { query });
    return res.items ?? [];
  }

  async getDispute(disputeId: string): Promise<unknown> {
    return this.req('GET', `/v1/customer/disputes/${disputeId}`);
  }

  /** Accept the customer's claim (full refund) — closes the dispute in their favor. */
  async acceptDisputeClaim(disputeId: string, input: { note: string; refundType?: 'FULL_REFUND' | 'PARTIAL_REFUND' }): Promise<unknown> {
    return this.req('POST', `/v1/customer/disputes/${disputeId}/accept-claim`, {
      body: {
        note: input.note,
        ...(input.refundType ? { accept_claim_type: input.refundType } : {}),
      },
    });
  }

  /** Provide evidence to PayPal in support of the seller's case. */
  async provideDisputeEvidence(disputeId: string, input: {
    evidences: Array<{
      evidence_type: string;        // e.g. PROOF_OF_FULFILLMENT, PROOF_OF_REFUND, ...
      evidence_info?: { tracking_info?: Array<{ carrier_name?: string; tracking_number?: string }> };
      notes?: string;
    }>;
    returnAddress?: unknown;
  }): Promise<unknown> {
    return this.req('POST', `/v1/customer/disputes/${disputeId}/provide-evidence`, {
      body: {
        evidences: input.evidences,
        ...(input.returnAddress ? { return_address: input.returnAddress } : {}),
      },
    });
  }

  /** Send a message to the buyer through PayPal's dispute thread. */
  async sendDisputeMessage(disputeId: string, message: string): Promise<unknown> {
    return this.req('POST', `/v1/customer/disputes/${disputeId}/send-message`, {
      body: { message },
    });
  }

  // ── Subscriptions v1 ─────────────────────────────────────────────────────

  async getSubscription(subscriptionId: string): Promise<unknown> {
    return this.req('GET', `/v1/billing/subscriptions/${subscriptionId}`);
  }

  async listSubscriptionTransactions(subscriptionId: string, opts: { startTime: string; endTime: string }): Promise<unknown> {
    return this.req('GET', `/v1/billing/subscriptions/${subscriptionId}/transactions`, {
      query: { start_time: opts.startTime, end_time: opts.endTime },
    });
  }

  /**
   * Cancel a subscription. PayPal does NOT support "cancel at period end" —
   * cancellation is immediate. To approximate "cancel at end", we'd have
   * to suspend until the period ends and then cancel via cron, which is
   * out-of-scope for the adapter.
   */
  async cancelSubscription(subscriptionId: string, reason: string): Promise<unknown> {
    return this.req('POST', `/v1/billing/subscriptions/${subscriptionId}/cancel`, {
      body: { reason },
    });
  }

  async suspendSubscription(subscriptionId: string, reason: string): Promise<unknown> {
    return this.req('POST', `/v1/billing/subscriptions/${subscriptionId}/suspend`, {
      body: { reason },
    });
  }

  async activateSubscription(subscriptionId: string, reason = 'Reactivated by support'): Promise<unknown> {
    return this.req('POST', `/v1/billing/subscriptions/${subscriptionId}/activate`, {
      body: { reason },
    });
  }

  async listPlans(opts: { pageSize?: number; productId?: string } = {}): Promise<unknown> {
    const query: Record<string, string | number> = {
      page_size: Math.min(opts.pageSize ?? 50, 20),
    };
    if (opts.productId) query.product_id = opts.productId;
    return this.req('GET', '/v1/billing/plans', { query });
  }

  // ── Invoices v2 ──────────────────────────────────────────────────────────

  async listInvoices(opts: { pageSize?: number; page?: number } = {}): Promise<unknown> {
    return this.req('GET', '/v2/invoicing/invoices', {
      query: {
        page_size: Math.min(opts.pageSize ?? 50, 100),
        page: opts.page ?? 1,
      },
    });
  }

  async getInvoice(invoiceId: string): Promise<unknown> {
    return this.req('GET', `/v2/invoicing/invoices/${invoiceId}`);
  }

  async createDraftInvoice(input: unknown): Promise<unknown> {
    return this.req('POST', '/v2/invoicing/invoices', { body: input });
  }

  async sendInvoice(invoiceId: string, input: { sendToRecipient?: boolean; subject?: string; note?: string } = {}): Promise<unknown> {
    return this.req('POST', `/v2/invoicing/invoices/${invoiceId}/send`, {
      body: {
        send_to_recipient: input.sendToRecipient ?? true,
        ...(input.subject ? { subject: input.subject } : {}),
        ...(input.note ? { note: input.note } : {}),
      },
    });
  }

  async remindInvoice(invoiceId: string, opts: { subject?: string; note?: string } = {}): Promise<unknown> {
    return this.req('POST', `/v2/invoicing/invoices/${invoiceId}/remind`, {
      body: {
        ...(opts.subject ? { subject: opts.subject } : {}),
        ...(opts.note ? { note: opts.note } : {}),
      },
    });
  }

  async cancelInvoice(invoiceId: string, opts: { subject?: string; note?: string; sendToRecipient?: boolean } = {}): Promise<unknown> {
    return this.req('POST', `/v2/invoicing/invoices/${invoiceId}/cancel`, {
      body: {
        send_to_recipient: opts.sendToRecipient ?? true,
        ...(opts.subject ? { subject: opts.subject } : {}),
        ...(opts.note ? { note: opts.note } : {}),
      },
    });
  }

  // ── Transactions search (read-only ledger) ──────────────────────────────

  /**
   * Search the merchant's transactions. Useful for the agent answering
   * "did this customer pay?" without knowing the exact order id.
   */
  async searchTransactions(opts: {
    startDate: string;            // ISO 8601
    endDate: string;              // ISO 8601
    transactionType?: string;
    transactionStatus?: 'D' | 'P' | 'S' | 'V';
    fields?: string;
    pageSize?: number;
  }): Promise<unknown> {
    return this.req('GET', '/v1/reporting/transactions', {
      query: {
        start_date: opts.startDate,
        end_date: opts.endDate,
        ...(opts.transactionType ? { transaction_type: opts.transactionType } : {}),
        ...(opts.transactionStatus ? { transaction_status: opts.transactionStatus } : {}),
        fields: opts.fields ?? 'all',
        page_size: Math.min(opts.pageSize ?? 100, 500),
      },
    });
  }

  // ── Webhooks (CRUD + signature verification) ─────────────────────────────

  async listWebhooks(): Promise<unknown[]> {
    const res = await this.req<{ webhooks: unknown[] }>('GET', '/v1/notifications/webhooks');
    return res.webhooks ?? [];
  }

  /**
   * Programmatically create a webhook. Returns the webhook id; PayPal
   * verification needs that id at every event we receive (see
   * `verifyWebhookSignature`).
   */
  async createWebhook(input: { url: string; eventTypes: string[] }): Promise<{ id: string; url: string; event_types: Array<{ name: string }> }> {
    return this.req('POST', '/v1/notifications/webhooks', {
      body: {
        url: input.url,
        event_types: input.eventTypes.map((name) => ({ name })),
      },
    });
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    await this.req('DELETE', `/v1/notifications/webhooks/${webhookId}`);
  }

  /**
   * Verify an inbound webhook event using PayPal's verify-signature API.
   * This is simpler than implementing the certificate-chain math
   * ourselves — PayPal does the heavy lifting and tells us VALID/INVALID.
   *
   * The webhook handler MUST call this with the EXACT raw body bytes
   * PayPal sent (not a re-stringified JSON), because the SHA hash they
   * compare against is over those bytes.
   */
  async verifyWebhookSignature(input: {
    webhookId: string;
    transmissionId: string;
    transmissionTime: string;
    certUrl: string;
    authAlgo: string;
    transmissionSig: string;
    rawBody: string;
  }): Promise<boolean> {
    try {
      const res = await this.req<{ verification_status: string }>('POST', '/v1/notifications/verify-webhook-signature', {
        body: {
          webhook_id: input.webhookId,
          transmission_id: input.transmissionId,
          transmission_time: input.transmissionTime,
          cert_url: input.certUrl,
          auth_algo: input.authAlgo,
          transmission_sig: input.transmissionSig,
          // PayPal expects the body as a JSON OBJECT, not a string. We parse
          // the raw bytes once and feed it back; if parsing fails we return
          // false so the request is rejected.
          webhook_event: JSON.parse(input.rawBody),
        },
      });
      return res.verification_status === 'SUCCESS';
    } catch (err) {
      logger.warn('PayPal verify-webhook-signature failed', { error: String(err) });
      return false;
    }
  }
}
