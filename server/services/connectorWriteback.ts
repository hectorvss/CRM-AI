/**
 * server/services/connectorWriteback.ts
 *
 * Shared connector-writeback helpers used by every place that closes
 * the loop on a customer-facing action: the approval cycle (refund /
 * cancel approval), direct REST routes (PATCH /returns/:id/status with
 * status='refunded'), and the Plan Engine tools (return.refund tool).
 *
 * Every helper:
 *   1. Tries the per-tenant adapter first (each workspace has its own
 *      Stripe / Shopify creds), falls back to the integration registry
 *      (platform-global creds) when not configured.
 *   2. Returns a normalised ConnectorWritebackResult instead of throwing
 *      so callers can persist the failure as `writeback_pending` and let
 *      the reconciliation sweep (refundReconciliation.ts) close the loop
 *      later.
 *
 * Idempotency is the caller's responsibility — pass an idempotencyKey
 * that is stable across retries (e.g. `approval-{id}-refund` or
 * `return-{id}-refund`) so Stripe deduplicates duplicate calls.
 */

import { integrationRegistry } from '../integrations/registry.js';
import { logger } from '../utils/logger.js';

export interface WritebackScope {
  tenantId: string;
  workspaceId: string;
}

export interface ConnectorWritebackResult {
  executedVia: 'stripe' | 'shopify' | 'woocommerce' | 'db-only';
  externalId: string | null;
  error: string | null;
}

// ── Stripe refund ──────────────────────────────────────────────────────────

export async function attemptStripeRefundWriteback(
  scope: WritebackScope,
  paymentRow: any,
  amount: number,
  reason: string,
  idempotencyKey: string,
): Promise<ConnectorWritebackResult> {
  const externalPaymentId: string | null =
    paymentRow?.external_payment_id ?? paymentRow?.psp_reference ?? null;
  if (!externalPaymentId) {
    return { executedVia: 'db-only', externalId: null, error: 'no external_payment_id' };
  }

  let adapter: any = null;
  try {
    const { stripeForTenant } = await import('../integrations/stripe-tenant.js');
    const r = await stripeForTenant(scope.tenantId, scope.workspaceId);
    if (r) adapter = (r as any).adapter ?? r;
  } catch { /* fall through */ }
  if (!adapter) {
    adapter = integrationRegistry.get('stripe') as any;
  }
  if (!adapter || typeof adapter.createRefund !== 'function') {
    return { executedVia: 'db-only', externalId: null, error: 'stripe adapter unavailable' };
  }

  try {
    const refund = await adapter.createRefund({
      paymentExternalId: externalPaymentId,
      amount,
      currency: paymentRow.currency ?? 'USD',
      reason,
      idempotencyKey,
    });
    logger.info('writeback: Stripe refund created', { paymentId: paymentRow.id, stripeRefundId: refund?.id, amount });
    return { executedVia: 'stripe', externalId: refund?.id ?? null, error: null };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('writeback: Stripe refund failed, falling back to db-only', { paymentId: paymentRow.id, error: msg });
    return { executedVia: 'db-only', externalId: null, error: msg };
  }
}

// ── Shopify / WooCommerce order cancel ─────────────────────────────────────

export async function attemptOrderCancelWriteback(
  scope: WritebackScope,
  orderRow: any,
  reason: string,
): Promise<ConnectorWritebackResult> {
  const externalOrderId: string | null = orderRow?.external_order_id ?? null;
  if (!externalOrderId) {
    return { executedVia: 'db-only', externalId: null, error: 'no external_order_id' };
  }

  try {
    const { shopifyForTenant } = await import('../integrations/shopify-tenant.js');
    const r = await shopifyForTenant(scope.tenantId, scope.workspaceId);
    if (r) {
      const adapter: any = (r as any).rest ?? (r as any).adapter ?? r;
      if (adapter && typeof adapter.cancelOrder === 'function') {
        try {
          const cancelled = await adapter.cancelOrder({
            orderExternalId: externalOrderId,
            reason: 'customer',
            email: false,
            restock: true,
          });
          logger.info('writeback: Shopify order cancelled', { orderId: orderRow.id, externalOrderId });
          return { executedVia: 'shopify', externalId: cancelled?.id ?? externalOrderId, error: null };
        } catch (err: any) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn('writeback: Shopify cancel failed', { orderId: orderRow.id, error: msg });
          return { executedVia: 'db-only', externalId: null, error: `shopify: ${msg}` };
        }
      }
    }
  } catch { /* try woo */ }

  try {
    const { wooForTenant } = await import('../integrations/woocommerce-tenant.js');
    const r = await wooForTenant(scope.tenantId, scope.workspaceId);
    if (r) {
      const adapter: any = (r as any).adapter ?? r;
      if (adapter && typeof adapter.updateOrder === 'function') {
        try {
          const wooId = Number(externalOrderId);
          if (Number.isFinite(wooId)) {
            await adapter.updateOrder(wooId, { status: 'cancelled', customer_note: reason });
            logger.info('writeback: WooCommerce order cancelled', { orderId: orderRow.id, externalOrderId });
            return { executedVia: 'woocommerce', externalId: externalOrderId, error: null };
          }
        } catch (err: any) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn('writeback: Woo cancel failed', { orderId: orderRow.id, error: msg });
          return { executedVia: 'db-only', externalId: null, error: `woocommerce: ${msg}` };
        }
      }
    }
  } catch { /* fall through */ }

  return { executedVia: 'db-only', externalId: null, error: 'no ecommerce connector configured' };
}

// ── Return-refund writeback (Stripe via linked payment) ───────────────────
//
// Returns are linked to payments only indirectly (via order_id). This
// helper resolves the payment, attempts the Stripe refund, and returns
// both the ConnectorWritebackResult and the resolved paymentRow so the
// caller can persist reconciliation_details on both rows.

export interface ReturnRefundResolution extends ConnectorWritebackResult {
  paymentId: string | null;
  paymentRow: any | null;
}

export async function attemptReturnRefundWriteback(
  scope: WritebackScope,
  returnRow: any,
  amount: number,
  reason: string,
  idempotencyKey: string,
): Promise<ReturnRefundResolution> {
  const orderId = returnRow?.order_id ?? null;
  if (!orderId) {
    return {
      executedVia: 'db-only', externalId: null,
      error: 'return has no order_id', paymentId: null, paymentRow: null,
    };
  }

  // Find the most recent captured payment for this order. Prefer captured
  // status; fall back to any payment.
  const { getSupabaseAdmin } = await import('../db/supabase.js');
  const supabase = getSupabaseAdmin();
  const { data: payments, error: lookupErr } = await supabase
    .from('payments')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(5);

  if (lookupErr || !payments || payments.length === 0) {
    return {
      executedVia: 'db-only', externalId: null,
      error: lookupErr?.message ?? 'no linked payment for return.order_id',
      paymentId: null, paymentRow: null,
    };
  }

  const captured = payments.find((p: any) => String(p.status).toLowerCase() === 'captured');
  const paymentRow = captured ?? payments[0];

  const writeback = await attemptStripeRefundWriteback(
    scope, paymentRow, amount, reason, idempotencyKey,
  );

  return {
    ...writeback,
    paymentId: paymentRow.id,
    paymentRow,
  };
}
