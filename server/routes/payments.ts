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

    const inspectionStatus = req.body?.inspection_status ?? ret.inspection_status;
    if (inspectionStatus && !isValidStatus(String(inspectionStatus), RETURN_INSPECTION_STATUSES)) {
      return res.status(400).json({ error: invalidStatusMessage('inspection_status', RETURN_INSPECTION_STATUSES) });
    }
    const refundStatus = req.body?.refund_status ?? ret.refund_status;
    if (refundStatus && !isValidStatus(String(refundStatus), RETURN_REFUND_STATUSES)) {
      return res.status(400).json({ error: invalidStatusMessage('refund_status', RETURN_REFUND_STATUSES) });
    }

    await commerceRepo.updateReturn(scope, req.params.id, {
      status,
      inspection_status: inspectionStatus,
      refund_status: refundStatus,
      approval_status: req.body?.approval_status ?? ret.approval_status,
      last_update: req.body?.reason ?? `Return status changed to ${status}`,
      system_states: { ...(ret.system_states ?? {}), canonical: status, crm_ai: status },
    });
    await auditRepository.log(scope, {
      actorId: req.userId || 'system',
      action: 'RETURN_STATUS_UPDATED',
      entityType: 'return',
      entityId: req.params.id,
      oldValue: { status: ret.status },
      newValue: { status },
      metadata: { reason: req.body?.reason ?? null },
    });
    const updated = await commerceRepo.getReturn(scope, req.params.id);
    res.json({ success: true, return: updated });
  } catch (error) {
    console.error('Error updating return status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
