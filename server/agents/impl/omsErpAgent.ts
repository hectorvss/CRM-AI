/**
 * server/agents/impl/omsErpAgent.ts
 *
 * OMS / ERP Agent — handles back-office order/refund/return records.
 */

import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const omsErpAgentImpl: AgentImplementation = {
  slug: 'oms-erp-agent',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId, runId } = ctx;
    const caseId = contextWindow.case.id;
    const supabase = getSupabaseAdmin();
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

    for (const order of orders) {
      const { data: orderPaymentsData, error: orderPaymentsError } = await supabase
        .from('payments')
        .select('id, amount, status, refund_amount')
        .eq('order_id', order.id)
        .eq('tenant_id', tenantId)
        .eq('workspace_id', workspaceId);
      if (orderPaymentsError) throw orderPaymentsError;
      const orderPayments = orderPaymentsData ?? [];

      const totalPaid = orderPayments.reduce((s: number, p: any) => s + (p.amount ?? 0), 0);
      const totalRefunded = orderPayments.reduce((s: number, p: any) => s + (p.refund_amount ?? 0), 0);

      if (orderPayments.length > 0 && Math.abs(totalPaid - order.amount) > 0.01) {
        issues.push({ entity: 'order', entityId: order.id, issue: `Order amount ($${order.amount}) != total paid ($${totalPaid})` });
      }

      if (totalRefunded > totalPaid && totalPaid > 0) {
        issues.push({ entity: 'order', entityId: order.id, issue: `Over-refund: refunded $${totalRefunded} > paid $${totalPaid}` });
      }
    }

    for (const ret of returns) {
      const { data: returnRow, error: returnRowError } = await supabase
        .from('returns')
        .select('order_id')
        .eq('id', ret.id)
        .eq('tenant_id', tenantId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (returnRowError) throw returnRowError;

      if (returnRow && returnRow.order_id) {
        const { data: linkedOrder, error: linkedOrderError } = await supabase
          .from('orders')
          .select('id')
          .eq('id', returnRow.order_id)
          .eq('tenant_id', tenantId)
          .eq('workspace_id', workspaceId)
          .maybeSingle();
        if (linkedOrderError) throw linkedOrderError;

        if (!linkedOrder) {
          issues.push({ entity: 'return', entityId: ret.id, issue: `Return references order ${returnRow.order_id} which doesn't exist` });
        }
      }
    }

    for (const payment of payments) {
      const { data: paymentRow, error: paymentRowError } = await supabase
        .from('payments')
        .select('order_id')
        .eq('id', payment.id)
        .eq('tenant_id', tenantId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (paymentRowError) throw paymentRowError;

      if (paymentRow && paymentRow.order_id) {
        const { data: linkedOrder, error: linkedOrderError } = await supabase
          .from('orders')
          .select('id')
          .eq('id', paymentRow.order_id)
          .eq('tenant_id', tenantId)
          .eq('workspace_id', workspaceId)
          .maybeSingle();
        if (linkedOrderError) throw linkedOrderError;

        if (!linkedOrder) {
          issues.push({ entity: 'payment', entityId: payment.id, issue: `Payment references order ${paymentRow.order_id} which doesn't exist` });
        }
      }
    }

    if (issues.length > 0) {
      try {
        const { error } = await supabase.from('audit_events').insert({
          id: randomUUID(),
          tenant_id: tenantId,
          workspace_id: workspaceId,
          actor_type: 'agent',
          action: 'oms_erp_inconsistency',
          entity_type: 'case',
          entity_id: caseId,
          new_value: `OMS/ERP check: ${issues.length} inconsistency(ies) found`,
          metadata: { issues, agentRunId: runId },
          occurred_at: now,
        });
        if (error) throw error;
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
