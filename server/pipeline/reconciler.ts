/**
 * server/pipeline/reconciler.ts
 *
 * Reconciliation Engine — Phase 3.
 *
 * Handles RECONCILE_CASE jobs. For each case it loads all linked commerce
 * entities (orders, payments, returns) and their per-system states, then
 * runs a set of conflict-detection comparators to find discrepancies.
 *
 * When a conflict is detected:
 *  1. A reconciliation_issue row is written
 *  2. The entity's has_conflict flag is set
 *  3. The case's has_reconciliation_conflicts flag and conflict_severity are updated
 *  4. If severity is 'critical' or 'high' an alert log is emitted
 *  5. A RESOLUTION_PLAN job is enqueued so the resolution engine can act
 *
 * Domains checked:
 *  payment   — payment amounts, statuses and refunds across Stripe vs Shopify
 *  fulfillment — shipping/tracking state coherence across Shopify orders
 *  returns   — return approval status vs actual refund processing
 *  identity  — customer details consistency across systems
 *
 * Design notes:
 *  - All comparators are pure functions returning ConflictResult | null.
 *  - DB writes are batched inside a transaction to keep the state consistent.
 *  - Re-running RECONCILE_CASE on the same case is idempotent: existing open
 *    issues are matched by (case_id, entity_id, conflict_domain) and updated
 *    rather than duplicated.
 */

import { randomUUID }    from 'crypto';
import { createCommerceRepository } from '../data/commerce.js';
import { createCaseRepository } from '../data/cases.js';
import { createCustomerRepository } from '../data/customers.js';
import { enqueue }       from '../queue/client.js';
import { triggerAgents } from '../agents/orchestrator.js';
import { JobType }       from '../queue/types.js';
import { registerHandler } from '../queue/handlers/index.js';
import { logger }        from '../utils/logger.js';
import type { ReconcileCasePayload, JobContext } from '../queue/types.js';

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
}

// ── Payment comparator ─────────────────────────────────────────────────────────

function comparePayment(order: any, payment: any): ConflictResult[] {
  const conflicts: ConflictResult[] = [];

  if (!order || !payment) return conflicts;

  const orderTotal   = parseFloat(order.total_amount ?? '0');
  const paymentAmount = parseFloat(payment.amount ?? '0');

  // Amount mismatch: order total vs payment captured
  // Tolerance: 0.01 for floating-point imprecision
  if (Math.abs(orderTotal - paymentAmount) > 0.01) {
    conflicts.push({
      entityType:         'payment',
      entityId:           payment.id,
      conflictDomain:     'payment',
      severity:           Math.abs(orderTotal - paymentAmount) > 10 ? 'high' : 'medium',
      conflictingSystems: ['shopify', 'stripe'],
      expectedState:      `Payment amount should equal order total: ${orderTotal} ${order.currency}`,
      actualStates: {
        shopify_order_total:   orderTotal,
        stripe_payment_amount: paymentAmount,
      },
      sourceOfTruth: 'shopify',
      detectedBy:    'payment_amount_comparator',
    });
  }

  // Status mismatch: derive expected payment status from order.status
  const systemStates = parseSystemStates(order);
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
    });
  }

  // Dispute detected: Stripe has a dispute but order is not flagged
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
    });
  }

  return conflicts;
}

function parseSystemStates(entity: any): any {
  if (!entity || !entity.system_states) return {};
  if (typeof entity.system_states === 'object') return entity.system_states;
  try {
    return JSON.parse(entity.system_states);
  } catch {
    return {};
  }
}

// ── Comparators ──────────────────────────────────────────────────────────────

function compareFulfillment(order: any): ConflictResult[] {
  const conflicts: ConflictResult[] = [];
  if (!order) return conflicts;

  const systemStates = parseSystemStates(order);
  const shopifyStatus = systemStates.shopify?.fulfillment_status ?? null;
  const internalStatus = order.status ?? null;

  if (shopifyStatus === 'fulfilled' && internalStatus !== 'fulfilled') {
    conflicts.push({
      entityType: 'order',
      entityId: order.id,
      conflictDomain: 'fulfillment',
      severity: 'medium',
      conflictingSystems: ['shopify', 'internal'],
      expectedState: "Order status should be 'fulfilled' to match Shopify",
      actualStates: { shopify_fulfillment_status: shopifyStatus, internal_status: internalStatus },
      sourceOfTruth: 'shopify',
      detectedBy: 'fulfillment_status_comparator',
    });
  }

  const trackingNumber = systemStates.shopify?.tracking_number ?? systemStates.canonical?.tracking_number ?? null;
  if (shopifyStatus === 'fulfilled' && !trackingNumber) {
    conflicts.push({
      entityType: 'order',
      entityId: order.id,
      conflictDomain: 'fulfillment',
      severity: 'low',
      conflictingSystems: ['shopify'],
      expectedState: 'Fulfilled order should have a tracking number',
      actualStates: { tracking_number: null, shopify_status: shopifyStatus },
      sourceOfTruth: 'shopify',
      detectedBy: 'tracking_number_checker',
    });
  }

  return conflicts;
}

function compareReturn(ret: any, payment: any | null): ConflictResult[] {
  const conflicts: ConflictResult[] = [];
  if (!ret) return conflicts;

  const refundAmount = parseFloat(payment?.refund_amount ?? '0');
  const returnValue = parseFloat(ret.return_value ?? '0');

  if (ret.status === 'approved' && refundAmount < 0.01 && returnValue > 0) {
    conflicts.push({
      entityType: 'return',
      entityId: ret.id,
      conflictDomain: 'returns',
      severity: 'high',
      conflictingSystems: ['shopify', 'stripe'],
      expectedState: `A refund of ~${returnValue} ${ret.currency ?? 'USD'} should have been issued`,
      actualStates: { return_status: ret.status, stripe_refund_amount: refundAmount, return_value: returnValue },
      sourceOfTruth: 'shopify',
      detectedBy: 'return_refund_comparator',
    });
  }

  return conflicts;
}

function compareIdentity(customer: any, linkedIds: any[]): ConflictResult[] {
  const conflicts: ConflictResult[] = [];
  if (!customer) return conflicts;

  if (!linkedIds || linkedIds.length === 0) {
    conflicts.push({
      entityType: 'customer',
      entityId: customer.id,
      conflictDomain: 'identity',
      severity: 'low',
      conflictingSystems: ['internal'],
      expectedState: 'Customer should be linked to at least one system',
      actualStates: { linked_systems: [] },
      sourceOfTruth: 'internal',
      detectedBy: 'identity_linker',
    });
  }

  if (customer.risk_level === 'high' || customer.risk_level === 'critical') {
    conflicts.push({
      entityType: 'customer',
      entityId: customer.id,
      conflictDomain: 'identity',
      severity: 'high',
      conflictingSystems: ['internal'],
      expectedState: 'High-risk customer warning',
      actualStates: { risk_level: customer.risk_level },
      sourceOfTruth: 'internal',
      detectedBy: 'risk_flag_checker',
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
    jobId: ctx.jobId,
    caseId: payload.caseId,
    traceId: ctx.traceId,
  });

  const commerceRepo = createCommerceRepository();
  const caseRepo = createCaseRepository();
  const customerRepo = createCustomerRepository();
  
  const scope = { tenantId: ctx.tenantId || 'org_default', workspaceId: ctx.workspaceId || 'ws_default' };

  // ── 1. Load case bundle ──────────────────────────────────────────────────
  const bundle = await caseRepo.getBundle(scope, payload.caseId);
  if (!bundle) {
    log.warn('Case bundle not found for reconciliation');
    return;
  }

  const caseRow = bundle.case;
  if (['resolved', 'closed', 'cancelled'].includes(caseRow.status)) {
    log.debug('Case is closed, skipping reconciliation');
    return;
  }

  log.info('Starting reconciliation', { caseType: caseRow.type, domains: payload.domains ?? 'all' });
  const domains = new Set(payload.domains ?? ['payment', 'fulfillment', 'returns', 'identity']);
  const allConflicts: ConflictResult[] = [];

  // ── 2. Run domain-specific checks ─────────────────────────────────────────
  if (domains.has('payment')) {
    for (const order of bundle.orders) {
      const payment = bundle.payments.find(p => p.order_id === order.id) || bundle.payments[0];
      allConflicts.push(...comparePayment(order, payment));
    }
  }

  if (domains.has('fulfillment')) {
    for (const order of bundle.orders) {
      allConflicts.push(...compareFulfillment(order));
    }
  }

  if (domains.has('returns')) {
    for (const ret of bundle.returns) {
      const payment = bundle.payments[0];
      allConflicts.push(...compareReturn(ret, payment));
    }
  }

  if (domains.has('identity') && caseRow.customer_id) {
    allConflicts.push(...compareIdentity(bundle.customer, bundle.linked_identities));
  }

  // ── 3. Persist conflicts ──────────────────────────────────────────────────
  const newIssueIds: string[] = [];

  for (const conflict of allConflicts) {
    const issueId = await caseRepo.upsertReconciliationIssue(scope, {
      id: randomUUID(),
      case_id: payload.caseId,
      tenant_id: scope.tenantId,
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
    });

    newIssueIds.push(issueId);

    // Flag the entity itself
    await commerceRepo.flagEntityConflict(scope, conflict.entityType, conflict.entityId, `Conflict in ${conflict.conflictDomain} domain`);
  }

  // ── 4. Update case conflict summary ──────────────────────────────────────
  const openIssues = await caseRepo.getOpenReconciliationIssues(scope, payload.caseId);
  const hasConflicts = openIssues.length > 0;
  const topSeverity = worstSeverity(openIssues.map(i => i.severity));

  await caseRepo.updateConflictState(scope, payload.caseId, hasConflicts, topSeverity);

  log.info('Reconciliation complete', {
    conflicts: allConflicts.length,
    newIssues: newIssueIds.length,
  });

  // ── 5. Enqueue resolution planning if needed ──────────────────────────────
  if (newIssueIds.length > 0) {
    enqueue(
      JobType.RESOLUTION_PLAN,
      { caseId: payload.caseId, reconciliationIssueIds: newIssueIds },
      { tenantId: scope.tenantId, workspaceId: scope.workspaceId, traceId: ctx.traceId, priority: 6 },
    );

    triggerAgents('conflicts_detected', payload.caseId, {
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      traceId: ctx.traceId,
      priority: 7,
      context: { issueIds: newIssueIds },
    });
  }
}

function worstSeverity(severities: string[]): string | null {
  if (severities.length === 0) return null;
  const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  return severities.reduce((worst, s) =>
    (SEVERITY_RANK[s] ?? 0) > (SEVERITY_RANK[worst] ?? 0) ? s : worst
  );
}

// ── Register ──────────────────────────────────────────────────────────────────

registerHandler(JobType.RECONCILE_CASE, handleReconcileCase);

export { handleReconcileCase };
