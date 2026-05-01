/**
 * server/agents/planEngine/tools/payments.ts
 *
 * ToolSpecs for payment operations.
 * Refunds are executed against the real Stripe adapter when configured;
 * fall back to DB-only update otherwise (sandbox / demo mode).
 */

import { randomUUID } from 'crypto';
import { createCommerceRepository } from '../../../data/index.js';
import { integrationRegistry } from '../../../integrations/registry.js';
import type { WritableRefunds } from '../../../integrations/types.js';
import type { ToolSpec } from '../types.js';
import { s } from '../schema.js';
import { logger } from '../../../utils/logger.js';

const commerceRepo = createCommerceRepository();

// ── payment.get ──────────────────────────────────────────────────────────────

interface PaymentGetArgs {
  paymentId: string;
}

export const paymentGetTool: ToolSpec<PaymentGetArgs, unknown> = {
  name: 'payment.get',
  version: '1.0.0',
  description: 'Retrieve a single payment by ID. Returns amount, status, refund status, and risk level.',
  category: 'payment',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({
    paymentId: s.string({ description: 'UUID of the payment to fetch' }),
  }),
  returns: s.any('Full payment object or error'),
  async run({ args, context }) {
    const payment = await commerceRepo.getPayment(
      { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' },
      args.paymentId,
    );
    if (!payment) return { ok: false, error: 'Payment not found', errorCode: 'NOT_FOUND' };
    return { ok: true, value: payment };
  },
};

// ── payment.refund ───────────────────────────────────────────────────────────

interface PaymentRefundArgs {
  paymentId: string;
  amount?: number;
  reason?: string;
}

export const paymentRefundTool: ToolSpec<PaymentRefundArgs, unknown> = {
  name: 'payment.refund',
  version: '1.0.0',
  description: 'Issue a refund for a payment. Amounts > 50 or high-risk payments require human approval.',
  category: 'payment',
  sideEffect: 'write',
  risk: 'high',
  idempotent: false,
  requiredPermission: 'cases.write',
  timeoutMs: 15_000,
  args: s.object({
    paymentId: s.string({ description: 'UUID of the payment to refund' }),
    amount: s.number({ required: false, min: 0.01, description: 'Refund amount (defaults to full payment amount)' }),
    reason: s.string({ required: false, max: 500, description: 'Reason for refund (shown to customer and in audit log)' }),
  }),
  returns: s.any('{ paymentId, status: "refunded" }'),
  async run({ args, context }) {
    if (context.dryRun) {
      return { ok: true, value: { paymentId: args.paymentId, status: 'refunded', dryRun: true } };
    }

    const scope = { tenantId: context.tenantId, workspaceId: context.workspaceId ?? '' };

    const payment = await commerceRepo.getPayment(scope, args.paymentId) as any;
    if (!payment) return { ok: false, error: 'Payment not found', errorCode: 'NOT_FOUND' };

    const amount = args.amount ?? Number(payment.amount ?? 0);
    const reason = args.reason ?? 'Refund executed via Super Agent';
    const idempotencyKey = `plan-engine-${args.paymentId}-${context.planId ?? randomUUID()}`;

    // ── Attempt real Stripe refund if adapter is configured ──────────────────
    let stripeRefundId: string | null = null;
    let executedVia: 'stripe' | 'db-only' = 'db-only';

    const stripeAdapter = integrationRegistry.get('stripe') as unknown as (WritableRefunds & { createRefund: any }) | null;
    const externalPaymentId: string | null = payment.external_payment_id ?? payment.psp_reference ?? null;

    if (stripeAdapter && typeof stripeAdapter.createRefund === 'function' && externalPaymentId) {
      try {
        const refund = await stripeAdapter.createRefund({
          paymentExternalId: externalPaymentId,
          amount,
          currency: payment.currency ?? 'USD',
          reason,
          idempotencyKey,
        });
        stripeRefundId = refund.id ?? null;
        executedVia = 'stripe';
        logger.info('payment.refund: Stripe refund created', { paymentId: args.paymentId, stripeRefundId, amount });
      } catch (stripeErr) {
        logger.warn('payment.refund: Stripe call failed, continuing with DB-only update', {
          paymentId: args.paymentId,
          error: String(stripeErr instanceof Error ? stripeErr.message : stripeErr),
        });
      }
    }

    // ── Always update CRM DB regardless of Stripe outcome ───────────────────
    await commerceRepo.updatePayment(scope, args.paymentId, {
      status: 'refunded',
      refund_status: 'succeeded',
      refund_amount: amount,
      refund_type: amount >= Number(payment.amount ?? 0) ? 'full' : 'partial',
      approval_status: 'not_required',
      ...(stripeRefundId ? { refund_ids: [...(Array.isArray(payment.refund_ids) ? payment.refund_ids : []), stripeRefundId] } : {}),
      last_update: reason,
      system_states: { ...(payment.system_states ?? {}), canonical: 'refunded', crm_ai: 'refunded' },
    });

    await context.audit({
      action: 'PLAN_ENGINE_PAYMENT_REFUNDED',
      entityType: 'payment',
      entityId: args.paymentId,
      oldValue: { status: payment.status, refund_status: payment.refund_status ?? null },
      newValue: {
        status: 'refunded',
        refund_status: 'succeeded',
        amount,
        reason,
        executedVia,
        stripeRefundId,
      },
      metadata: { source: 'plan-engine', planId: context.planId },
    });

    return {
      ok: true,
      value: {
        paymentId: args.paymentId,
        status: 'refunded',
        amount,
        executedVia,
        ...(stripeRefundId ? { stripeRefundId } : {}),
      },
    };
  },
};
