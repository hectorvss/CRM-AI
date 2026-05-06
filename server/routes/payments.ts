import { Router, Response } from 'express';
import crypto from 'crypto';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { createAuditRepository } from '../data/index.js';
import { createCommerceRepository } from '../data/commerce.js';
import {
  createApprovalRequest,
  findCaseIdForEntity,
  findPendingApprovalRequest,
} from '../data/approvals.js';
import { fireWorkflowEvent } from '../lib/workflowEventBus.js';
import { integrationRegistry } from '../integrations/registry.js';
import { logger } from '../utils/logger.js';
import type { WritableRefunds } from '../integrations/types.js';
import { getRefundThreshold } from '../utils/refundThreshold.js';
import { isValidStatus, invalidStatusMessage, RETURN_STATUSES, RETURN_INSPECTION_STATUSES, RETURN_REFUND_STATUSES } from '../utils/statusEnums.js';
import { getSupabaseAdmin } from '../db/supabase.js';

const router = Router();
const commerceRepo = createCommerceRepository();
const auditRepository = createAuditRepository();

// Apply multi-tenant middleware to all payment routes
router.use(extractMultiTenant);

// ── GET /api/payments ─────────────────────────────────────────
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const { status, risk_level, q } = req.query;
    
    const payments = await commerceRepo.listPayments(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      { 
        status: status as string, 
        risk_level: risk_level as string, 
        q: q as string 
      }
    );
    
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/payments/:id ─────────────────────────────────────
router.get('/:id/context', async (req: MultiTenantRequest, res: Response) => {
  try {
    const context = await commerceRepo.getPaymentContext(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      req.params.id
    );
    if (!context) return res.status(404).json({ error: 'Payment context not found' });
    res.json(context);
  } catch (error) {
    console.error('Error fetching payment context:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const payment = await commerceRepo.getPayment(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      req.params.id
    );
    
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    
    res.json(payment);
  } catch (error) {
    console.error('Error fetching payment detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/refund', requirePermission('payments.write'), async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const payment = await commerceRepo.getPayment(scope, req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const amount = Number(req.body?.amount ?? payment.amount ?? 0);
    const reason = String(req.body?.reason ?? '').trim() || 'Refund requested from CRM-AI';
    const refundThreshold = getRefundThreshold(payment.currency);
    const sensitive = amount > refundThreshold || ['high', 'critical'].includes(String(payment.risk_level ?? '').toLowerCase());
    const blocked = ['disputed', 'blocked', 'chargeback'].includes(String(payment.status ?? '').toLowerCase());

    if (blocked) {
      await commerceRepo.updatePayment(scope, req.params.id, {
        approval_status: 'blocked',
        recommended_action: 'Refund blocked because payment is disputed or blocked.',
        has_conflict: true,
        conflict_detected: 'Refund attempted on blocked payment',
        last_update: reason,
      });
      await auditRepository.log(scope, {
        actorId: req.userId || 'system',
        action: 'PAYMENT_REFUND_BLOCKED',
        entityType: 'payment',
        entityId: req.params.id,
        oldValue: { status: payment.status },
        newValue: { approval_status: 'blocked' },
        metadata: { amount, reason },
      });
      return res.status(409).json({ error: 'Refund blocked by payment status', blocked: true });
    }

    if (sensitive) {
      const riskLevel = ['high', 'critical'].includes(String(payment.risk_level ?? '').toLowerCase())
        ? (String(payment.risk_level).toLowerCase() as 'high' | 'critical')
        : 'medium';

      // Resolve case_id (refund must be linked to a case for the manager queue).
      const caseId = await findCaseIdForEntity({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        entity: 'payment',
        entityId: req.params.id,
      });

      // Idempotency: if the payment is already flagged AND a pending approval row exists,
      // do not create a duplicate. Otherwise we still need to insert the approval row
      // (this fixes the bug where the flag was set but no approval_request was created).
      let existing: any = null;
      if (caseId) {
        existing = await findPendingApprovalRequest({
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          caseId,
          requestType: 'refund',
          entityKey: 'payment_id',
          entityValue: req.params.id,
        });
      }

      await commerceRepo.updatePayment(scope, req.params.id, {
        approval_status: 'approval_needed',
        refund_amount: amount,
        refund_type: amount >= Number(payment.amount ?? 0) ? 'full' : 'partial',
        recommended_action: 'Approval required before refund execution.',
        last_update: reason,
      });

      let approvalRequestId: string | null = existing?.id ?? null;
      if (!existing && caseId) {
        const created = await createApprovalRequest({
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          caseId,
          requestType: 'refund',
          requestedBy: req.userId || 'system',
          requestedByType: req.userId ? 'human' : 'system',
          riskLevel,
          metadata: {
            payment_id: req.params.id,
            amount,
            currency: (payment as any).currency ?? 'USD',
            reason,
            risk_level: payment.risk_level ?? null,
            refund_type: amount >= Number(payment.amount ?? 0) ? 'full' : 'partial',
          },
          evidencePackage: {
            payment_status: payment.status,
            previous_approval_status: payment.approval_status,
          },
        });
        approvalRequestId = created.id;
      } else if (!caseId) {
        logger.warn('payments.refund: sensitive refund has no linked case; cannot create approval_request row', {
          paymentId: req.params.id,
        });
      }

      await auditRepository.log(scope, {
        actorId: req.userId || 'system',
        action: 'PAYMENT_REFUND_APPROVAL_REQUESTED',
        entityType: 'payment',
        entityId: req.params.id,
        oldValue: { approval_status: payment.approval_status },
        newValue: { approval_status: 'approval_needed', refund_amount: amount, approval_request_id: approvalRequestId },
        metadata: { amount, reason, riskLevel: payment.risk_level, approval_request_id: approvalRequestId, case_id: caseId },
      });
      return res.status(202).json({
        success: true,
        requiresApproval: true,
        paymentId: req.params.id,
        amount,
        approvalRequestId,
        caseId,
      });
    }

    // ── Attempt live Stripe refund if adapter is configured ──────────────
    let stripeRefundId: string | null = null;
    let executedVia: 'stripe' | 'db-only' = 'db-only';
    const stripeAdapter = integrationRegistry.get('stripe') as unknown as (WritableRefunds & { createRefund?: Function }) | null;
    const externalPaymentId: string | null = (payment as any).external_payment_id ?? (payment as any).psp_reference ?? null;
    const idempotencyKey = `rest-refund-${req.params.id}-${Date.now()}`;

    if (stripeAdapter && typeof stripeAdapter.createRefund === 'function' && externalPaymentId) {
      try {
        const refund = await stripeAdapter.createRefund({
          paymentExternalId: externalPaymentId,
          amount,
          currency: (payment as any).currency ?? 'USD',
          reason,
          idempotencyKey,
        });
        stripeRefundId = (refund as any)?.id ?? null;
        executedVia = 'stripe';
        logger.info('payments.refund: Stripe refund created', { paymentId: req.params.id, stripeRefundId, amount });
      } catch (stripeErr) {
        logger.warn('payments.refund: Stripe call failed, proceeding with DB-only update', {
          paymentId: req.params.id,
          error: stripeErr instanceof Error ? stripeErr.message : String(stripeErr),
        });
      }
    }

    const newRefundId = stripeRefundId ?? `rf_${crypto.randomUUID()}`;
    await commerceRepo.updatePayment(scope, req.params.id, {
      status: 'refunded',
      refund_amount: amount,
      refund_type: amount >= Number(payment.amount ?? 0) ? 'full' : 'partial',
      approval_status: 'approved',
      refund_ids: [...(Array.isArray(payment.refund_ids) ? payment.refund_ids : []), newRefundId],
      system_states: { ...(payment.system_states ?? {}), canonical: 'refunded', crm_ai: 'refunded' },
      last_update: reason,
    });
    await auditRepository.log(scope, {
      actorId: req.userId || 'system',
      action: 'PAYMENT_REFUNDED',
      entityType: 'payment',
      entityId: req.params.id,
      oldValue: { status: payment.status, refund_amount: payment.refund_amount },
      newValue: { status: 'refunded', refund_amount: amount, executedVia, stripeRefundId },
      metadata: { reason, executedVia },
    });
    const updated = await commerceRepo.getPayment(scope, req.params.id);
    await fireWorkflowEvent(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId },
      'payment.refunded',
      { paymentId: req.params.id, status: 'refunded', amount, reason, riskLevel: payment.risk_level, executedVia },
    );
    res.json({ success: true, payment: updated, executedVia });
  } catch (error) {
    console.error('Error refunding payment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/payments/:id/refund-advanced ─────────────────────────────────
//
// Multi-mode refund flow used by the new RefundFlowModal in the Orders UI.
// Modes:
//   - 'full'        : refund payment.amount in full
//   - 'partial'     : refund a custom `amount`
//   - 'exchange'    : create a draft order on the connected ecommerce with
//                     `replacementProducts`, then issue a partial refund for
//                     the price difference (or zero if the swap is even)
//   - 'goodwill'    : issue a partial refund + record an internal note (no
//                     replacement, framed as a goodwill credit)
//
// Body:
//   { mode, amount?, currency?, reason?,
//     replacementProducts?: [{ provider, productId, variantId, quantity, price }],
//     provider?: 'shopify' | 'woocommerce' }
//
// Response: { ok, mode, refund?, draft?, requiresApproval? }

router.post('/:id/refund-advanced', requirePermission('payments.write'), async (req: MultiTenantRequest, res: Response) => {
  if (!req.tenantId) return res.status(401).json({ error: 'Authentication required' });
  const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
  const paymentId = req.params.id;
  const body = req.body ?? {};
  const mode: 'full' | 'partial' | 'exchange' | 'goodwill' =
    body.mode === 'partial' || body.mode === 'exchange' || body.mode === 'goodwill' ? body.mode : 'full';

  const payment = await commerceRepo.getPayment(scope, paymentId);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });

  const fullAmount = Number(payment.amount ?? 0);
  let amount = mode === 'full' ? fullAmount : Number(body.amount ?? 0);
  if (mode !== 'full' && (!Number.isFinite(amount) || amount <= 0)) {
    return res.status(400).json({ error: 'amount is required for partial / exchange / goodwill modes' });
  }
  if (amount > fullAmount) {
    return res.status(400).json({ error: `Refund amount ${amount} exceeds payment amount ${fullAmount}` });
  }

  const reason = String(body.reason ?? '').trim() || `${mode} refund initiated from CRM-AI`;

  // ── 1. Exchange: build a draft order on the ecommerce ─────────────────
  let draft: any = null;
  if (mode === 'exchange') {
    const replacementProducts = Array.isArray(body.replacementProducts) ? body.replacementProducts : [];
    if (replacementProducts.length === 0) {
      return res.status(400).json({ error: 'exchange mode requires replacementProducts' });
    }
    const provider = String(body.provider ?? replacementProducts[0]?.provider ?? 'shopify').toLowerCase();
    try {
      if (provider === 'shopify') {
        const { shopifyForTenant } = await import('../integrations/shopify-tenant.js');
        const r = await shopifyForTenant(req.tenantId, req.workspaceId ?? null);
        if (!r) return res.status(503).json({ error: 'shopify connector not configured' });
        const adapter: any = r.rest;
        if (typeof adapter.createDraftOrder === 'function') {
          draft = await adapter.createDraftOrder({
            line_items: replacementProducts.map((p: any) => ({
              variant_id: Number(p.variantId ?? p.variant_id),
              quantity: Number(p.quantity ?? 1),
            })),
            note: `CRM-AI exchange — replacement for payment ${paymentId}. ${reason}`,
            tags: ['crm-ai-refund-exchange'],
          });
        }
      } else if (provider === 'woocommerce' || provider === 'woo') {
        const { wooForTenant } = await import('../integrations/woocommerce-tenant.js');
        const r = await wooForTenant(req.tenantId, req.workspaceId ?? null);
        if (!r) return res.status(503).json({ error: 'woocommerce connector not configured' });
        const adapter: any = r.adapter;
        if (typeof adapter.createOrder === 'function') {
          draft = await adapter.createOrder({
            status: 'pending',
            line_items: replacementProducts.map((p: any) => ({
              product_id: Number(p.productId ?? p.product_id),
              variation_id: p.variantId ? Number(p.variantId) : undefined,
              quantity: Number(p.quantity ?? 1),
            })),
            customer_note: `CRM-AI exchange for payment ${paymentId}. ${reason}`,
          });
        }
      }
    } catch (err: any) {
      logger.warn('refund-advanced: ecommerce draft creation failed, falling through to refund only', {
        paymentId, error: err?.message,
      });
    }
  }

  // ── 2. Issue the actual refund via the existing /refund handler ───────
  // We forward to the same logic to preserve all the approval / Stripe / DB
  // / audit / workflow-event paths. We construct the same body shape.
  try {
    // Re-create the in-process call: easiest path is to inline the logic.
    // But since the existing handler is a closure on `req`, we just call
    // commerceRepo + the relevant pieces. Simpler: do an internal HTTP call
    // would be circular. Instead, we duplicate the minimum: dispatch the
    // refund directly to Stripe (when available) + update DB.
    const refundThreshold = getRefundThreshold((payment as any).currency);
    const sensitive = amount > refundThreshold || ['high', 'critical'].includes(String(payment.risk_level ?? '').toLowerCase());

    if (sensitive) {
      // Mark payment for approval (same as base /refund handler).
      await commerceRepo.updatePayment(scope, paymentId, {
        approval_status: 'approval_needed',
        refund_amount: amount,
        refund_type: amount >= fullAmount ? 'full' : 'partial',
        recommended_action: 'Approval required before refund execution.',
        last_update: reason,
      });
      await auditRepository.log(scope, {
        actorId: req.userId || 'system',
        action: 'PAYMENT_REFUND_APPROVAL_REQUESTED',
        entityType: 'payment',
        entityId: paymentId,
        oldValue: { approval_status: payment.approval_status },
        newValue: { approval_status: 'approval_needed', refund_amount: amount, mode },
        metadata: { amount, mode, reason, draft_id: draft?.id ?? null },
      });
      return res.status(202).json({
        ok: true, mode, requiresApproval: true, paymentId, amount, draft,
      });
    }

    // Live Stripe refund attempt (mirrors /refund logic).
    const stripeAdapter = integrationRegistry.get('stripe') as any;
    const externalPaymentId: string | null = (payment as any).external_payment_id ?? (payment as any).psp_reference ?? null;
    let stripeRefundId: string | null = null;
    let executedVia: 'stripe' | 'db-only' = 'db-only';
    if (stripeAdapter && typeof stripeAdapter.createRefund === 'function' && externalPaymentId) {
      try {
        const refund = await stripeAdapter.createRefund({
          paymentExternalId: externalPaymentId,
          amount,
          currency: (payment as any).currency ?? 'USD',
          reason,
          idempotencyKey: `adv-refund-${paymentId}-${Date.now()}`,
        });
        stripeRefundId = refund?.id ?? null;
        executedVia = 'stripe';
      } catch (err: any) {
        logger.warn('refund-advanced: Stripe call failed, proceeding DB-only', { paymentId, error: err?.message });
      }
    }

    const newRefundId = stripeRefundId ?? `rf_${crypto.randomUUID()}`;
    await commerceRepo.updatePayment(scope, paymentId, {
      status: amount >= fullAmount ? 'refunded' : 'partially_refunded',
      refund_amount: amount,
      refund_type: amount >= fullAmount ? 'full' : 'partial',
      approval_status: 'approved',
      refund_ids: [...(Array.isArray(payment.refund_ids) ? payment.refund_ids : []), newRefundId],
      system_states: { ...(payment.system_states ?? {}), canonical: amount >= fullAmount ? 'refunded' : 'partially_refunded' },
      last_update: reason,
    });
    await auditRepository.log(scope, {
      actorId: req.userId || 'system',
      action: mode === 'exchange' ? 'PAYMENT_REFUNDED_FOR_EXCHANGE'
            : mode === 'goodwill' ? 'PAYMENT_REFUNDED_GOODWILL'
            : 'PAYMENT_REFUNDED',
      entityType: 'payment',
      entityId: paymentId,
      oldValue: { status: payment.status, refund_amount: payment.refund_amount },
      newValue: { status: 'refunded', refund_amount: amount, executedVia, mode, draft_id: draft?.id ?? null },
      metadata: { reason, executedVia, mode, draft },
    });
    await fireWorkflowEvent(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId },
      'payment.refunded',
      { paymentId, status: 'refunded', amount, reason, mode, draft_id: draft?.id ?? null, executedVia },
    );

    const updated = await commerceRepo.getPayment(scope, paymentId);
    return res.json({
      ok: true,
      mode,
      paymentId,
      amount,
      refundId: newRefundId,
      executedVia,
      draft,
      payment: updated,
    });
  } catch (err: any) {
    console.error('refund-advanced error', err);
    return res.status(500).json({ error: err?.message ?? 'Internal server error' });
  }
});

export default router;

// ── Returns Router ────────────────────────────────────────────
export const returnsRouter = Router();

// Apply multi-tenant middleware to all return routes
returnsRouter.use(extractMultiTenant);

// GET /api/returns
returnsRouter.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const { status, risk_level, q } = req.query;
    
    const returns = await commerceRepo.listReturns(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      { 
        status: status as string, 
        risk_level: risk_level as string, 
        q: q as string 
      }
    );
    
    res.json(returns);
  } catch (error) {
    console.error('Error fetching returns:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/returns/:id
returnsRouter.get('/:id/context', async (req: MultiTenantRequest, res: Response) => {
  try {
    const context = await commerceRepo.getReturnContext(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      req.params.id
    );
    if (!context) return res.status(404).json({ error: 'Return context not found' });
    res.json(context);
  } catch (error) {
    console.error('Error fetching return context:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

returnsRouter.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const ret = await commerceRepo.getReturn(
      { tenantId: req.tenantId!, workspaceId: req.workspaceId! },
      req.params.id
    );
    
    if (!ret) return res.status(404).json({ error: 'Return not found' });

    res.json(ret);
  } catch (error) {
    console.error('Error fetching return detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

returnsRouter.post('/', requirePermission('returns.write'), async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const id = await commerceRepo.upsertReturn(scope, {
      externalId: req.body?.external_return_id ?? req.body?.externalId ?? `manual_return_${Date.now()}`,
      orderId: req.body?.order_id ?? req.body?.orderId ?? null,
      customerId: req.body?.customer_id ?? req.body?.customerId ?? null,
      status: req.body?.status ?? 'pending_review',
      totalAmount: Number(req.body?.return_value ?? req.body?.amount ?? 0),
      currency: req.body?.currency ?? 'USD',
      source: 'crm_ai',
    });
    await commerceRepo.updateReturn(scope, id, {
      order_id: req.body?.order_id ?? req.body?.orderId ?? null,
      customer_id: req.body?.customer_id ?? req.body?.customerId ?? null,
      return_reason: req.body?.return_reason ?? req.body?.reason ?? null,
      method: req.body?.method ?? 'manual',
      approval_status: req.body?.approval_status ?? 'not_required',
      summary: req.body?.summary ?? 'Return created from CRM-AI',
    });
    await auditRepository.log(scope, {
      actorId: req.userId || 'system',
      action: 'RETURN_CREATED',
      entityType: 'return',
      entityId: id,
      newValue: { id, ...req.body },
      metadata: { source: 'returns_api' },
    });
    const created = await commerceRepo.getReturn(scope, id);
    res.status(201).json(created ?? { id });
  } catch (error) {
    console.error('Error creating return:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

returnsRouter.patch('/:id/status', requirePermission('returns.write'), async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const ret = await commerceRepo.getReturn(scope, req.params.id);
    if (!ret) return res.status(404).json({ error: 'Return not found' });
    const status = String(req.body?.status ?? '').trim();
    if (!status) return res.status(400).json({ error: 'Status is required' });
    if (!isValidStatus(status, RETURN_STATUSES)) {
      return res.status(400).json({ error: invalidStatusMessage('status', RETURN_STATUSES) });
    }

    // Only validate inspection_status / refund_status when the caller is
    // explicitly setting them. The fallback to ret.* would catch enriched
    // synthetic values like 'N/A' that getReturn injects via enrichReturn.
    const inspectionStatusFromBody = req.body?.inspection_status as string | undefined;
    if (inspectionStatusFromBody && !isValidStatus(String(inspectionStatusFromBody), RETURN_INSPECTION_STATUSES)) {
      return res.status(400).json({ error: invalidStatusMessage('inspection_status', RETURN_INSPECTION_STATUSES) });
    }
    const refundStatusFromBody = req.body?.refund_status as string | undefined;
    if (refundStatusFromBody && !isValidStatus(String(refundStatusFromBody), RETURN_REFUND_STATUSES)) {
      return res.status(400).json({ error: invalidStatusMessage('refund_status', RETURN_REFUND_STATUSES) });
    }
    // For the eventual write we still need a value (fall back to current
    // raw column, NOT to the enriched 'N/A' synthetic). Strip 'N/A' fallback
    // so we don't ever persist that synthetic value.
    const stripNA = (v: any) => (typeof v === 'string' && v === 'N/A' ? null : v);
    const inspectionStatus = inspectionStatusFromBody ?? stripNA(ret.inspection_status);
    const refundStatus = refundStatusFromBody ?? stripNA(ret.refund_status);

    // ── Connector writeback when the return becomes refunded ─────────
    // If this status update flips the return into a refund-issuing state
    // (status='refunded' OR refund_status='refunded'), find the linked
    // payment and attempt the Stripe refund. Mirrors the approval flow
    // so returns refunded directly (no approval gate) still hit the PSP.
    const becomingRefunded =
      status === 'refunded' ||
      refundStatusFromBody === 'refunded' ||
      refundStatusFromBody === 'approved';
    const wasAlreadyRefunded =
      ret.status === 'refunded' || ret.refund_status === 'refunded';

    let returnWriteback: { executedVia: string; externalId: string | null; error: string | null; paymentId: string | null } | null = null;

    if (becomingRefunded && !wasAlreadyRefunded) {
      const { attemptReturnRefundWriteback } = await import('../services/connectorWriteback.js');
      const refundAmount = Number(req.body?.amount ?? ret.return_value ?? 0);
      const idempotencyKey = `return-${req.params.id}-refund`;
      const wb = await attemptReturnRefundWriteback(
        scope,
        ret,
        refundAmount,
        req.body?.reason ?? `Return ${ret.external_return_id ?? req.params.id} refunded`,
        idempotencyKey,
      );
      returnWriteback = {
        executedVia: wb.executedVia,
        externalId: wb.externalId,
        error: wb.error,
        paymentId: wb.paymentId,
      };

      // Sync the linked payment row when the writeback succeeded so the
      // payment + return reconciliation_details stay in lockstep.
      if (wb.paymentId && wb.paymentRow) {
        const supabase = getSupabaseAdmin();
        const existingRefundIds = Array.isArray(wb.paymentRow.refund_ids) ? wb.paymentRow.refund_ids : [];
        const newRefundId = wb.externalId ?? `rf_return_${req.params.id}`;
        const isFull = refundAmount >= Number(wb.paymentRow.amount ?? 0);
        await supabase.from('payments')
          .update({
            status: 'refunded',
            refund_status: wb.executedVia === 'stripe' ? 'succeeded' : 'writeback_pending',
            refund_amount: refundAmount,
            refund_type: isFull ? 'full' : 'partial',
            refund_ids: existingRefundIds.includes(newRefundId) ? existingRefundIds : [...existingRefundIds, newRefundId],
            system_states: {
              ...(wb.paymentRow.system_states ?? {}),
              canonical: 'refunded',
              crm_ai: 'refunded',
              psp: wb.executedVia === 'stripe' ? 'refunded' : 'pending_writeback',
            },
            reconciliation_details: {
              return_id: req.params.id,
              writeback_executed_via: wb.executedVia,
              writeback_external_id: wb.externalId,
              writeback_error: wb.error,
              writeback_at: new Date().toISOString(),
              writeback_source: 'return-refund',
            },
            last_update: wb.error
              ? `Return ${req.params.id} refunded locally; PSP writeback failed: ${wb.error}`
              : `Return ${req.params.id} refunded via ${wb.executedVia}`,
          })
          .eq('id', wb.paymentId)
          .eq('tenant_id', scope.tenantId)
          .eq('workspace_id', scope.workspaceId);
      }
    }

    await commerceRepo.updateReturn(scope, req.params.id, {
      status,
      inspection_status: inspectionStatus,
      refund_status: refundStatus,
      approval_status: req.body?.approval_status ?? ret.approval_status,
      last_update: returnWriteback?.error
        ? `Return refunded locally; PSP writeback failed: ${returnWriteback.error}`
        : returnWriteback
          ? `Return refunded via ${returnWriteback.executedVia}`
          : (req.body?.reason ?? `Return status changed to ${status}`),
      system_states: { ...(ret.system_states ?? {}), canonical: status, crm_ai: status },
      // Persist writeback metadata on the return too so the UI can
      // recompute its own writeback badge once we ship that follow-up.
      ...(returnWriteback ? {
        linked_refund_id: returnWriteback.externalId ?? undefined,
      } : {}),
    });

    await auditRepository.log(scope, {
      actorId: req.userId || 'system',
      action: returnWriteback?.error
        ? 'RETURN_REFUND_WRITEBACK_FAILED'
        : returnWriteback
          ? 'RETURN_REFUNDED_VIA_STATUS_UPDATE'
          : 'RETURN_STATUS_UPDATED',
      entityType: 'return',
      entityId: req.params.id,
      oldValue: { status: ret.status, refund_status: ret.refund_status },
      newValue: { status, refund_status: refundStatus, executed_via: returnWriteback?.executedVia ?? null },
      metadata: {
        reason: req.body?.reason ?? null,
        ...(returnWriteback ? {
          executed_via: returnWriteback.executedVia,
          payment_id: returnWriteback.paymentId,
          stripe_refund_id: returnWriteback.externalId,
          writeback_error: returnWriteback.error,
          connector_writeback: returnWriteback.executedVia === 'stripe' ? 'completed' : 'pending',
          idempotency_key: `return-${req.params.id}-refund`,
        } : {}),
      },
    });

    const updated = await commerceRepo.getReturn(scope, req.params.id);
    res.json({ success: true, return: updated, ...(returnWriteback ? { writeback: returnWriteback } : {}) });
  } catch (error) {
    console.error('Error updating return status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
