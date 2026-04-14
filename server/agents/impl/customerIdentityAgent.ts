/**
 * server/agents/impl/customerIdentityAgent.ts
 *
 * CRM / Customer Identity Agent — provides canonical customer truth.
 *
 * Supplies customer truth, segmentation, VIP/risk context and
 * linked identities to downstream agents. Enriches the customer
 * record with aggregated metrics from orders, payments, and returns.
 *
 * No Gemini — pure SQL aggregation.
 */

import { getDb } from '../../db/client.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const customerIdentityAgentImpl: AgentImplementation = {
  slug: 'customer-identity-agent',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId } = ctx;
    const customer = contextWindow.customer;

    if (!customer) {
      return { success: true, summary: 'No customer on case — identity agent skipped' };
    }

    const db = getDb();
    const customerId = customer.id;
    const now = new Date().toISOString();

    // ── Aggregate metrics ────────────────────────────────────────────────
    const orderMetrics = db.prepare(`
      SELECT COUNT(*) as total_orders,
             COALESCE(SUM(total_amount), 0) as total_spent,
             COALESCE(AVG(total_amount), 0) as avg_order_value
      FROM orders WHERE customer_id = ? AND tenant_id = ?
    `).get(customerId, tenantId) as any;

    const paymentMetrics = db.prepare(`
      SELECT COUNT(*) as total_payments,
             COALESCE(SUM(amount), 0) as total_paid,
             COALESCE(SUM(refund_amount), 0) as total_refunded
      FROM payments WHERE customer_id = ? AND tenant_id = ?
    `).get(customerId, tenantId) as any;

    const returnMetrics = db.prepare(`
      SELECT COUNT(*) as total_returns
      FROM returns WHERE customer_id = ? AND tenant_id = ?
    `).get(customerId, tenantId) as any;

    const caseMetrics = db.prepare(`
      SELECT COUNT(*) as total_cases,
             SUM(CASE WHEN status NOT IN ('closed', 'resolved') THEN 1 ELSE 0 END) as open_cases
      FROM cases WHERE customer_id = ? AND tenant_id = ?
    `).get(customerId, tenantId) as any;

    const linkedIdentities = db.prepare(
      'SELECT system, external_id, confidence FROM linked_identities WHERE customer_id = ?'
    ).all(customerId) as any[];

    // ── Compute lifetime value ───────────────────────────────────────────
    const ltv = (orderMetrics?.total_spent ?? 0) - (paymentMetrics?.total_refunded ?? 0);

    // ── Compute refund rate ──────────────────────────────────────────────
    const totalPaid = paymentMetrics?.total_paid ?? 0;
    const totalRefunded = paymentMetrics?.total_refunded ?? 0;
    const refundRate = totalPaid > 0 ? totalRefunded / totalPaid : 0;

    // ── Compute dispute rate ─────────────────────────────────────────────
    const disputeCount = db.prepare(`
      SELECT COUNT(*) as count FROM payments
      WHERE customer_id = ? AND tenant_id = ? AND dispute_id IS NOT NULL
    `).get(customerId, tenantId) as { count: number };
    const disputeRate = (paymentMetrics?.total_payments ?? 0) > 0
      ? disputeCount.count / paymentMetrics.total_payments
      : 0;

    // ── Update customer record with fresh metrics ────────────────────────
    try {
      db.prepare(`
        UPDATE customers SET
          lifetime_value = ?,
          total_orders = ?,
          dispute_rate = ?,
          refund_rate = ?,
          updated_at = ?
        WHERE id = ? AND tenant_id = ?
      `).run(ltv, orderMetrics?.total_orders ?? 0, disputeRate, refundRate, now, customerId, tenantId);
    } catch (err: any) {
      logger.debug('Customer metrics update failed', { customerId, error: err?.message });
    }

    const profile = {
      customerId,
      name: customer.name,
      email: customer.email,
      segment: customer.segment,
      riskLevel: customer.riskLevel,
      ltv,
      totalOrders: orderMetrics?.total_orders ?? 0,
      totalPayments: paymentMetrics?.total_payments ?? 0,
      totalReturns: returnMetrics?.total_returns ?? 0,
      totalCases: caseMetrics?.total_cases ?? 0,
      openCases: caseMetrics?.open_cases ?? 0,
      avgOrderValue: Math.round(orderMetrics?.avg_order_value ?? 0),
      refundRate: Math.round(refundRate * 100) / 100,
      disputeRate: Math.round(disputeRate * 100) / 100,
      linkedSystems: linkedIdentities.length,
    };

    return {
      success: true,
      confidence: 0.95,
      summary: `Customer identity: ${customer.segment}/${customer.riskLevel}, LTV=$${ltv}, ${linkedIdentities.length} linked system(s)`,
      output: profile,
    };
  },
};
