/**
 * server/pipeline/reconciler.ts
 *
 * Reconciliation Engine — Phase 3.
 *
 * Handles RECONCILE_CASE jobs. For each case it loads all linked commerce
 * entities (orders, payments, returns) and their per-system states, then
 * runs a set of conflict-detection comparators to find discrepancies.
 *
 * Refactored to use repository pattern (provider-agnostic).
 */

import { createCaseRepository, createCommerceRepository, createCustomerRepository } from '../data/index.js';
import { enqueue }       from '../queue/client.js';
import { triggerAgents } from '../agents/orchestrator.js';
import { JobType }       from '../queue/types.js';
import { registerHandler } from '../queue/handlers/index.js';
import { logger }        from '../utils/logger.js';
import type { ReconcileCasePayload, JobContext } from '../queue/types.js';

const caseRepo = createCaseRepository();
const commerceRepo = createCommerceRepository();
const customerRepo = createCustomerRepository();

// ── Conflict result ────────────────────────────────────────────────────────────

interface ConflictResult {
  entityType:         string;
  entityId:           string;
  conflictDomain:     'payment' | 'fulfillment' | 'returns' | 'identity';
  severity:           'low' | 'medium' | 'high' | 'critical';
  conflictingSystems: string[];
  expectedState:      string;
  actualStates:       Record<string, unknown>;
  sourceOfTruth:      string;
  detectedBy:         string;
  /** Human-readable summary of the conflict (populated into `summary` column). */
  summary:            string;
  /** Categorical label (populated into `issue_type` column). */
  issueType:          string;
}

// ── Payment comparator ─────────────────────────────────────────────────────────

function comparePayment(order: any, payment: any): ConflictResult[] {
  const conflicts: ConflictResult[] = [];

  if (!order || !payment) return conflicts;

  const orderTotal   = parseFloat(order.total_amount ?? '0');
  const paymentAmount = parseFloat(payment.amount ?? '0');

  // Amount mismatch: order total vs payment captured
  if (Math.abs(orderTotal - paymentAmount) > 0.01) {
    const currency = order.currency || 'USD';
    conflicts.push({
      entityType:         'payment',
      entityId:           payment.id,
      conflictDomain:     'payment',
      severity:           Math.abs(orderTotal - paymentAmount) > 10 ? 'high' : 'medium',
      conflictingSystems: ['shopify', 'stripe'],
      expectedState:      `Payment amount should equal order total: ${orderTotal} ${currency}`,
      actualStates: {
        shopify_order_total:   orderTotal,
        stripe_payment_amount: paymentAmount,
      },
      sourceOfTruth: 'shopify',
      detectedBy:    'payment_amount_comparator',
      summary:       `Payment amount mismatch: Shopify order total ${orderTotal} ${currency} vs Stripe captured ${paymentAmount} ${currency}`,
      issueType:     'payment_amount_mismatch',
    });
  }

  // Status mismatch
  const systemStates: Record<string, any> = typeof order.system_states === 'string' ? JSON.parse(order.system_states || '{}') : (order.system_states || {});
  const orderFinancial = systemStates.shopify?.financial_status ?? order.status ?? '';
  const paymentStatus  = payment.status ?? '';

  const statusMap: Record<string, string[]> = {
    confirmed:           ['succeeded', 'captured'],
    fulfilled:           ['succeeded', 'captured'],
    refunded:            ['refunded'],
    partially_fulfilled: ['partially_refunded'],
    cancelled:           ['canceled', 'cancelled', 'voided'],
    paid:               ['succeeded', 'captured'],
    partially_refunded: ['partially_refunded'],
    voided:             ['canceled', 'cancelled', 'voided'],
  };

  const expectedPaymentStatuses = statusMap[orderFinancial] ?? [];
  if (expectedPaymentStatuses.length > 0 && !expectedPaymentStatuses.includes(paymentStatus)) {
    conflicts.push({
      entityType:         'payment',
      entityId:           payment.id,
      conflictDomain:     'payment',
      severity:           'medium',
      conflictingSystems: ['shopify', 'stripe'],
      expectedState:      `Payment status should be one of [${expectedPaymentStatuses.join(', ')}] for order status '${orderFinancial}'`,
      actualStates: {
        order_status:          orderFinancial,
        stripe_payment_status: paymentStatus,
      },
      sourceOfTruth: 'shopify',
      detectedBy:    'payment_status_comparator',
      summary:       `Payment status drift: Stripe reports '${paymentStatus}' while Shopify order status is '${orderFinancial}'`,
      issueType:     'payment_status_drift',
    });
  }

  // Dispute detected
  if (payment.dispute_id && !order.has_conflict) {
    conflicts.push({
      entityType:         'payment',
      entityId:           payment.id,
      conflictDomain:     'payment',
      severity:           'critical',
      conflictingSystems: ['stripe'],
      expectedState:      'No active dispute on payment',
      actualStates: {
        stripe_dispute_id: payment.dispute_id,
        stripe_dispute_status: payment.dispute_status ?? 'unknown',
      },
      sourceOfTruth: 'stripe',
      detectedBy:    'dispute_detector',
      summary:       `Active Stripe dispute ${payment.dispute_id} on payment (status: ${payment.dispute_status ?? 'unknown'})`,
      issueType:     'payment_dispute_active',
    });
  }

  return conflicts;
}

// ── Fulfillment comparator ─────────────────────────────────────────────────────

function compareFulfillment(order: any): ConflictResult[] {
  const conflicts: ConflictResult[] = [];
  if (!order) return conflicts;

  const systemStates: Record<string, any> = typeof order.system_states === 'string' ? JSON.parse(order.system_states || '{}') : (order.system_states || {});

  const shopifyStatus   = systemStates.shopify?.fulfillment_status ?? null;
  const internalStatus  = order.status ?? null;

  if (shopifyStatus === 'fulfilled' && internalStatus !== 'fulfilled') {
    conflicts.push({
      entityType:         'order',
      entityId:           order.id,
      conflictDomain:     'fulfillment',
      severity:           'medium',
      conflictingSystems: ['shopify', 'internal'],
      expectedState:      `Order status should be 'fulfilled' to match Shopify`,
      actualStates: {
        shopify_fulfillment_status: shopifyStatus,
        internal_status:            internalStatus,
      },
      sourceOfTruth: 'shopify',
      detectedBy:    'fulfillment_status_comparator',
      summary:       `Fulfillment drift: Shopify reports '${shopifyStatus}' but internal order status is '${internalStatus ?? 'unknown'}'`,
      issueType:     'fulfillment_status_drift',
    });
  }

  const trackingNumber = systemStates.shopify?.tracking_number ?? systemStates.canonical?.tracking_number ?? null;
  if (shopifyStatus === 'fulfilled' && !trackingNumber) {
    conflicts.push({
      entityType:         'order',
      entityId:           order.id,
      conflictDomain:     'fulfillment',
      severity:           'low',
      conflictingSystems: ['shopify'],
      expectedState:      'Fulfilled order should have a tracking number in system_states',
      actualStates: {
        tracking_number: null,
        shopify_status:  shopifyStatus,
      },
      sourceOfTruth: 'shopify',
      detectedBy:    'tracking_number_checker',
      summary:       `Order marked fulfilled in Shopify but has no tracking number recorded`,
      issueType:     'tracking_missing',
    });
  }

  return conflicts;
}

// ── Returns comparator ─────────────────────────────────────────────────────────

function compareReturn(ret: any, payment: any | null): ConflictResult[] {
  const conflicts: ConflictResult[] = [];
  if (!ret) return conflicts;

  const returnStatus  = ret.status ?? '';
  const refundAmount  = parseFloat(payment?.refund_amount ?? '0');
  const returnValue   = parseFloat(ret.return_value ?? '0');

  if (returnStatus === 'approved' && refundAmount < 0.01 && returnValue > 0) {
    const currency = ret.currency ?? 'USD';
    conflicts.push({
      entityType:         'return',
      entityId:           ret.id,
      conflictDomain:     'returns',
      severity:           'high',
      conflictingSystems: ['shopify', 'stripe'],
      expectedState:      `A refund of ~${returnValue} ${currency} should have been issued for approved return`,
      actualStates: {
        return_status:       returnStatus,
        stripe_refund_amount: refundAmount,
        return_value:        returnValue,
      },
      sourceOfTruth: 'shopify',
      detectedBy:    'return_refund_comparator',
      summary:       `Approved return missing refund: expected ~${returnValue} ${currency} via Stripe, found ${refundAmount} ${currency}`,
      issueType:     'refund_missing',
    });
  }

  if (refundAmount > 0 && !['completed', 'closed', 'refunded'].includes(returnStatus)) {
    conflicts.push({
      entityType:         'return',
      entityId:           ret.id,
      conflictDomain:     'returns',
      severity:           'low',
      conflictingSystems: ['shopify', 'stripe'],
      expectedState:      `Return status should be 'completed' since a refund was issued`,
      actualStates: {
        return_status:        returnStatus,
        stripe_refund_amount: refundAmount,
      },
      sourceOfTruth: 'stripe',
      detectedBy:    'return_status_sync_checker',
      summary:       `Return shows status '${returnStatus}' but Stripe already issued a refund of ${refundAmount}`,
      issueType:     'return_status_drift',
    });
  }

  return conflicts;
}

// ── Identity comparator ────────────────────────────────────────────────────────

function compareIdentity(customer: any, linkedIds: any[]): ConflictResult[] {
  const conflicts: ConflictResult[] = [];
  if (!customer) return conflicts;

  if (!linkedIds || linkedIds.length === 0) {
    conflicts.push({
      entityType:         'customer',
      entityId:           customer.id,
      conflictDomain:     'identity',
      severity:           'low',
      conflictingSystems: ['internal'],
      expectedState:      'Customer should be linked to at least one external system',
      actualStates: {
        linked_systems: [],
      },
      sourceOfTruth: 'internal',
      detectedBy:    'identity_linker',
      summary:       `Customer has no linked external identities`,
      issueType:     'identity_unlinked',
    });
  }

  if (customer.risk_level === 'high' || customer.risk_level === 'critical') {
    conflicts.push({
      entityType:         'customer',
      entityId:           customer.id,
      conflictDomain:     'identity',
      severity:           'high',
      conflictingSystems: ['internal'],
      expectedState:      'High-risk customer — case requires elevated review',
      actualStates: {
        customer_risk_level: customer.risk_level,
        lifetime_value:      customer.lifetime_value,
        total_orders:        customer.total_orders,
      },
      sourceOfTruth: 'internal',
      detectedBy:    'risk_flag_checker',
      summary:       `Customer flagged ${customer.risk_level} risk — case requires elevated review`,
      issueType:     'identity_high_risk',
    });
  }

  return conflicts;
}

// ── Main handler ───────────────────────────────────────────────────────────────

async function handleReconcileCase(
  payload: ReconcileCasePayload,
  ctx: JobContext
): Promise<void> {
  const log = logger.child({
    jobId:   ctx.jobId,
    caseId:  payload.caseId,
    traceId: ctx.traceId,
  });

  const tenantId = ctx.tenantId ?? 'org_default';
  const workspaceId = ctx.workspaceId ?? 'ws_default';
  const scope = { tenantId, workspaceId };

  // ── 1. Load case ──────────────────────────────────────────────────────────
  const bundle = await caseRepo.getBundle(scope, payload.caseId);
  if (!bundle) {
    log.warn('Case not found for reconciliation');
    return;
  }

  const caseRow = bundle.case;

  if (['resolved', 'closed', 'cancelled'].includes(caseRow.status)) {
    log.debug('Case is closed, skipping reconciliation');
    return;
  }

  log.info('Starting reconciliation', { caseType: caseRow.type, domains: payload.domains ?? 'all' });

  const domains = new Set(payload.domains ?? ['payment', 'fulfillment', 'returns', 'identity']);

  // ── 2. Load linked entities ───────────────────────────────────────────────
  const orderIds:   string[] = caseRow.order_ids   || [];
  const paymentIds: string[] = caseRow.payment_ids || [];
  const returnIds:  string[] = caseRow.return_ids  || [];

  const allConflicts: ConflictResult[] = [];

  // ── 3. Payment domain ─────────────────────────────────────────────────────
  if (domains.has('payment')) {
    for (const orderId of orderIds) {
      const order = await commerceRepo.getOrder(scope, orderId);
      // Simplify payment matching: if only one payment, use it.
      const payment = paymentIds.length > 0
        ? await commerceRepo.getPayment(scope, paymentIds[0])
        : null;

      allConflicts.push(...comparePayment(order, payment));
    }

    // Payments without orders
    if (orderIds.length === 0) {
      for (const paymentId of paymentIds) {
        const payment = await commerceRepo.getPayment(scope, paymentId);
        allConflicts.push(...comparePayment(null, payment));
      }
    }
  }

  // ── 4. Fulfillment domain ─────────────────────────────────────────────────
  if (domains.has('fulfillment')) {
    for (const orderId of orderIds) {
      const order = await commerceRepo.getOrder(scope, orderId);
      allConflicts.push(...compareFulfillment(order));
    }
  }

  // ── 5. Returns domain ─────────────────────────────────────────────────────
  if (domains.has('returns')) {
    for (const returnId of returnIds) {
      const ret = await commerceRepo.getReturn(scope, returnId);
      const payment = paymentIds.length > 0
        ? await commerceRepo.getPayment(scope, paymentIds[0])
        : null;
      allConflicts.push(...compareReturn(ret, payment));
    }
  }

  // ── 6. Identity domain ────────────────────────────────────────────────────
  if (domains.has('identity') && caseRow.customer_id) {
    const customerBundle = await customerRepo.getDetail(scope, caseRow.customer_id);
    if (customerBundle) {
        // detail returns the customer row enriched, but we need linked identities
        // The repository bundle includes linked_identities
        allConflicts.push(...compareIdentity(customerBundle, customerBundle.linked_identities || []));
    }
  }

  // ── 7. Persist conflicts ──────────────────────────────────────────────────
  const newIssueIds: string[] = [];

  for (const conflict of allConflicts) {
    const issueId = await caseRepo.upsertReconciliationIssue(scope, {
      case_id: payload.caseId,
      tenant_id: tenantId,
      workspace_id: workspaceId,
      entity_type: conflict.entityType,
      entity_id: conflict.entityId,
      conflict_domain: conflict.conflictDomain,
      severity: conflict.severity,
      status: 'open',
      conflicting_systems: conflict.conflictingSystems,
      expected_state: conflict.expectedState,
      actual_states: conflict.actualStates,
      source_of_truth_system: conflict.sourceOfTruth,
      detected_by: conflict.detectedBy,
      summary: conflict.summary,
      issue_type: conflict.issueType,
      detected_at: new Date().toISOString(),
    });

    newIssueIds.push(issueId);

    // Flag the entity itself
    await commerceRepo.flagEntityConflict(scope, conflict.entityType, conflict.entityId, `Conflict in ${conflict.conflictDomain} domain`);

    log.info('Conflict handled', {
      issueId,
      domain:   conflict.conflictDomain,
      severity: conflict.severity,
      entity:   `${conflict.entityType}:${conflict.entityId}`,
    });
  }

  // ── 8. Update case conflict summary ──────────────────────────────────
  const openIssues = await caseRepo.getOpenReconciliationIssues(scope, payload.caseId);
  const hasConflicts = openIssues.length > 0;
  const topSeverity  = worstSeverity(openIssues.map(i => i.severity));

  await caseRepo.updateConflictState(scope, payload.caseId, hasConflicts, topSeverity);

  log.info('Reconciliation complete', {
    conflicts:  allConflicts.length,
    newIssues:  newIssueIds.length,
  });

  // Alert on critical/high conflicts
  const criticalConflicts = allConflicts.filter(c => c.severity === 'critical' || c.severity === 'high');
  if (criticalConflicts.length > 0) {
    log.warn('High-severity conflicts detected', {
      count:   criticalConflicts.length,
      domains: [...new Set(criticalConflicts.map(c => c.conflictDomain))],
    });
  }

  // ── 9. Enqueue resolution planning if there are open issues ─────────────
  if (newIssueIds.length > 0) {
    enqueue(
      JobType.RESOLUTION_PLAN,
      { caseId: payload.caseId, reconciliationIssueIds: newIssueIds },
      { tenantId, workspaceId, traceId: ctx.traceId, priority: 6 },
    );
    log.debug('Enqueued RESOLUTION_PLAN', { issueCount: newIssueIds.length });

    // Fire agent chain for conflict analysis
    await triggerAgents('conflicts_detected', payload.caseId, {
      tenantId,
      workspaceId,
      traceId: ctx.traceId,
      priority: 7,
      context: { issueIds: newIssueIds },
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function worstSeverity(severities: string[]): string | null {
  if (severities.length === 0) return null;
  return severities.reduce((worst, s) =>
    (SEVERITY_RANK[s] ?? 0) > (SEVERITY_RANK[worst] ?? 0) ? s : worst
  );
}

// ── Register ──────────────────────────────────────────────────────────────────

registerHandler(JobType.RECONCILE_CASE, handleReconcileCase);

export { handleReconcileCase };
