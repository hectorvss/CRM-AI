/**
 * server/agents/impl/omsErpAgent.ts
 *
 * OMS / ERP Agent — handles back-office order/refund/return records.
 *
 * Maintains back-office truth for order, refund and return references
 * and detects mismatches between the OMS/ERP and other systems.
 *
 * In production, this would integrate with an actual OMS/ERP API.
 * Currently operates against local DB as the source of truth.
 *
 * No Gemini — pure DB cross-referencing.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const omsErpAgentImpl: AgentImplementation = {
  slug: 'oms-erp-agent',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, runId } = ctx;
    const caseId = contextWindow.case.id;
    const db = getDb();
    const now = new Date().toISOString();

    const orders = contextWindow.orders;
    const payments = contextWindow.payments;
    const returns = contextWindow.returns;

    if (orders.length === 0 && payments.length === 0 && returns.length === 0) {
      return {
        success: true,
        confidence: 1.0,
        summary: 'No orders/payments/returns — OMS/ERP sync skipped',
        output: { checked: 0 },
      };
    }

    const issues: Array<{ entity: string; entityId: string; issue: string }> = [];

    // ── 1. Verify order ↔ payment consistency ────────────────────────────
    for (const order of orders) {
      const orderPayments = db.prepare(`
        SELECT id, amount, status, refund_amount FROM payments
        WHERE order_id = ? AND tenant_id = ?
      `).all(order.id, tenantId) as any[];

      const totalPaid = orderPayments.reduce((s: number, p: any) => s + (p.amount ?? 0), 0);
      const totalRefunded = orderPayments.reduce((s: number, p: any) => s + (p.refund_amount ?? 0), 0);

      // Check if payment total matches order total
      if (orderPayments.length > 0 && Math.abs(totalPaid - order.amount) > 0.01) {
        issues.push({
          entity: 'order',
          entityId: order.id,
          issue: `Order amount ($${order.amount}) != total paid ($${totalPaid})`,
        });
      }

      // Check for over-refund
      if (totalRefunded > totalPaid && totalPaid > 0) {
        issues.push({
          entity: 'order',
          entityId: order.id,
          issue: `Over-refund: refunded $${totalRefunded} > paid $${totalPaid}`,
        });
      }
    }

    // ── 2. Verify return ↔ order linkage ─────────────────────────────────
    for (const ret of returns) {
      const returnRow = db.prepare(
        'SELECT order_id FROM returns WHERE id = ? AND tenant_id = ?'
      ).get(ret.id, tenantId) as any;

      if (returnRow && returnRow.order_id) {
        const linkedOrder = db.prepare(
          'SELECT id FROM orders WHERE id = ? AND tenant_id = ?'
        ).get(returnRow.order_id, tenantId);

        if (!linkedOrder) {
          issues.push({
            entity: 'return',
            entityId: ret.id,
            issue: `Return references order ${returnRow.order_id} which doesn't exist`,
          });
        }
      }
    }

    // ── 3. Check for orphaned payments ───────────────────────────────────
    for (const payment of payments) {
      const paymentRow = db.prepare(
        'SELECT order_id FROM payments WHERE id = ? AND tenant_id = ?'
      ).get(payment.id, tenantId) as any;

      if (paymentRow && paymentRow.order_id) {
        const linkedOrder = db.prepare(
          'SELECT id FROM orders WHERE id = ? AND tenant_id = ?'
        ).get(paymentRow.order_id, tenantId);

        if (!linkedOrder) {
          issues.push({
            entity: 'payment',
            entityId: payment.id,
            issue: `Payment references order ${paymentRow.order_id} which doesn't exist`,
          });
        }
      }
    }

    // ── 4. Log issues ────────────────────────────────────────────────────
    if (issues.length > 0) {
      try {
        db.prepare(`
          INSERT INTO audit_events
            (id, tenant_id, entity_type, entity_id, event_type, description, metadata, created_at)
          VALUES (?, ?, 'case', ?, ?, ?, ?, ?)
        `).run(
          randomUUID(), tenantId, caseId,
          'oms_erp_inconsistency',
          `OMS/ERP check: ${issues.length} inconsistency(ies) found`,
          JSON.stringify({ issues, agentRunId: runId }),
          now,
        );
      } catch (err: any) {
        logger.error('OMS/ERP audit write failed', { error: err?.message });
      }
    }

    return {
      success: true,
      confidence: issues.length === 0 ? 1.0 : 0.8,
      summary: `OMS/ERP: checked ${orders.length + payments.length + returns.length} entities, ${issues.length} issue(s)`,
      output: {
        ordersChecked: orders.length,
        paymentsChecked: payments.length,
        returnsChecked: returns.length,
        issueCount: issues.length,
        issues,
      },
    };
  },
};
