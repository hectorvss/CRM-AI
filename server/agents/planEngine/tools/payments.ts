/**
 * server/agents/planEngine/tools/payments.ts
 *
 * ToolSpecs for payment operations.
 */

import { createCommerceRepository } from '../../../data/index.js';
import type { ToolSpec } from '../types.js';
import { s } from '../schema.js';

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

    const payment = await commerceRepo.getPayment(scope, args.paymentId);
    if (!payment) return { ok: false, error: 'Payment not found', errorCode: 'NOT_FOUND' };

    await commerceRepo.updatePayment(scope, args.paymentId, {
      status: 'refunded',
      refund_status: 'succeeded',
      approval_status: 'not_required',
      summary: args.reason ?? 'Refund executed via Super Agent',
      updated_at: new Date().toISOString(),
    });

    await context.audit({
      action: 'PLAN_ENGINE_PAYMENT_REFUNDED',
      entityType: 'payment',
      entityId: args.paymentId,
      oldValue: { status: (payment as any).status, refund_status: (payment as any).refund_status ?? null },
      newValue: {
        status: 'refunded',
        refund_status: 'succeeded',
        amount: args.amount ?? (payment as any).amount,
        reason: args.reason ?? null,
      },
      metadata: { source: 'plan-engine', planId: context.planId },
    });

    return { ok: true, value: { paymentId: args.paymentId, status: 'refunded' } };
  },
};
