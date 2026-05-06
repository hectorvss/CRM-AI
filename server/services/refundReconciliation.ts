/**
 * server/services/refundReconciliation.ts
 *
 * Closes the approval-cycle loop the OTHER way around: when Stripe sends
 * a `charge.refunded` webhook, find the local payment row and update its
 * writeback status so the Approvals UI badge flips from
 *   ⚠️  Writeback pending  →  ✅ Writeback stripe
 *
 * Also handles refunds initiated EXTERNALLY (Stripe dashboard, manual
 * disputes) where there's no prior approval but we still want to keep the
 * local payment row in sync.
 *
 * Called from server/queue/handlers/webhookProcess.ts after the canonical
 * event has been persisted, in a setImmediate(...) so it never blocks the
 * webhook ack.
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { createAuditRepository } from '../data/audit.js';
import { logger } from '../utils/logger.js';

export interface RefundReconciliationScope {
  tenantId: string;
  workspaceId: string;
}

export interface RefundReconciliationResult {
  matched: boolean;
  paymentId: string | null;
  previousStatus: string | null;
  refundId: string | null;
  amount: number | null;
  source: 'approval-writeback' | 'external';
}

function parseMaybeJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

/**
 * Reconcile a Stripe `charge.refunded` webhook against the local payment
 * row. The webhook body shape is `{ data: { object: <charge> } }` where
 * the charge has `id` (= our external_payment_id), `amount_refunded`,
 * `currency`, and `refunds.data[]` with the actual refund objects.
 */
export async function reconcileStripeChargeRefunded(
  scope: RefundReconciliationScope,
  body: Record<string, any>,
): Promise<RefundReconciliationResult> {
  const charge = body?.data?.object ?? {};
  const externalPaymentId: string | null = charge.id ?? charge.payment_intent ?? null;
  if (!externalPaymentId) {
    return { matched: false, paymentId: null, previousStatus: null, refundId: null, amount: null, source: 'external' };
  }

  const supabase = getSupabaseAdmin();
  const { data: payment, error } = await supabase
    .from('payments')
    .select('id, status, refund_status, refund_amount, refund_ids, system_states, reconciliation_details, amount, currency')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .eq('external_payment_id', externalPaymentId)
    .maybeSingle();

  if (error || !payment) {
    return { matched: false, paymentId: null, previousStatus: null, refundId: null, amount: null, source: 'external' };
  }

  // Stripe puts the refund objects in charge.refunds.data
  const refunds: any[] = Array.isArray(charge.refunds?.data) ? charge.refunds.data : [];
  const latestRefund = refunds[0] ?? null;
  const stripeRefundId: string | null = latestRefund?.id ?? null;
  const refundAmountCents: number = Number(charge.amount_refunded ?? 0);
  // Stripe represents amounts in the smallest currency unit (cents). Local
  // payments store decimals, so divide.
  const refundAmount: number = refundAmountCents > 0 ? refundAmountCents / 100 : 0;

  const previousRefundStatus: string | null = payment.refund_status ?? null;
  const wasPendingWriteback = previousRefundStatus === 'writeback_pending';
  const source: RefundReconciliationResult['source'] = wasPendingWriteback ? 'approval-writeback' : 'external';

  // Merge the Stripe refund id into refund_ids without duplicates.
  const existingRefundIds = Array.isArray(payment.refund_ids) ? payment.refund_ids : [];
  const refundIds = stripeRefundId && !existingRefundIds.includes(stripeRefundId)
    ? [...existingRefundIds, stripeRefundId]
    : existingRefundIds;

  // Reconcile the payment row.
  const existingRecon = parseMaybeJson<Record<string, any>>(payment.reconciliation_details, {});
  const existingSystemStates = parseMaybeJson<Record<string, any>>(payment.system_states, {});
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('payments')
    .update({
      status: 'refunded',
      refund_status: 'succeeded',
      refund_amount: refundAmount > 0 ? refundAmount : payment.refund_amount,
      refund_ids: refundIds,
      system_states: {
        ...existingSystemStates,
        canonical: 'refunded',
        psp: 'refunded',
      },
      reconciliation_details: {
        ...existingRecon,
        writeback_executed_via: 'stripe',
        writeback_external_id: stripeRefundId ?? existingRecon.writeback_external_id ?? null,
        writeback_error: null,                  // clear any prior error
        writeback_reconciled_at: now,
        writeback_source: source,               // 'approval-writeback' or 'external'
      },
      last_update: source === 'approval-writeback'
        ? `Stripe confirmed refund ${stripeRefundId ?? ''} (approval writeback reconciled)`
        : `External refund ${stripeRefundId ?? ''} reconciled from Stripe webhook`,
      updated_at: now,
    })
    .eq('id', payment.id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);

  if (updateError) {
    logger.warn('refundReconciliation: payment update failed', { paymentId: payment.id, error: updateError.message });
    return { matched: false, paymentId: payment.id, previousStatus: previousRefundStatus, refundId: stripeRefundId, amount: refundAmount, source };
  }

  await createAuditRepository().log(scope, {
    actorId: 'webhook',
    actorType: 'system',
    action: source === 'approval-writeback'
      ? 'PAYMENT_REFUND_WRITEBACK_RECONCILED'
      : 'PAYMENT_REFUND_EXTERNAL_RECONCILED',
    entityType: 'payment',
    entityId: payment.id,
    oldValue: { refund_status: previousRefundStatus, refund_amount: payment.refund_amount },
    newValue: { refund_status: 'succeeded', refund_amount: refundAmount, refund_ids: refundIds },
    metadata: {
      stripe_charge_id: externalPaymentId,
      stripe_refund_id: stripeRefundId,
      source,
      reconciled_from: 'webhook',
    },
  });

  logger.info('refundReconciliation: payment reconciled', {
    paymentId: payment.id, externalPaymentId, stripeRefundId, source, previousRefundStatus,
  });

  return {
    matched: true,
    paymentId: payment.id,
    previousStatus: previousRefundStatus,
    refundId: stripeRefundId,
    amount: refundAmount,
    source,
  };
}
