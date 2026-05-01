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
import { getDatabaseProvider } from '../../db/provider.js';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const customerIdentityAgentImpl: AgentImplementation = {
  slug: 'customer-identity-agent',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId } = ctx;
    const customer = contextWindow.customer;

    if (!customer) {
      return { success: true, summary: 'No customer on case — identity agent skipped' };
    }

    const provider = getDatabaseProvider();
    const useSupabase = provider === 'supabase';
    const db = useSupabase ? null : getDb();
    const supabase = useSupabase ? getSupabaseAdmin() : null;
    const customerId = customer.id;
    const now = new Date().toISOString();

    const orderMetrics = useSupabase
      ? await (async () => {
          const { data, error } = await supabase!
            .from('orders')
            .select('total_amount')
            .eq('customer_id', customerId)
            .eq('tenant_id', tenantId)
            .eq('workspace_id', workspaceId);
          if (error) throw error;
          const rows = data ?? [];
          const totalSpent = rows.reduce((sum, row: any) => sum + Number(row.total_amount ?? 0), 0);
          return { total_orders: rows.length, total_spent: totalSpent, avg_order_value: rows.length ? totalSpent / rows.length : 0 };
        })()
      : db!.prepare(`
          SELECT COUNT(*) as total_orders,
                 COALESCE(SUM(total_amount), 0) as total_spent,
                 COALESCE(AVG(total_amount), 0) as avg_order_value
          FROM orders WHERE customer_id = ? AND tenant_id = ? AND workspace_id = ?
        `).get(customerId, tenantId, workspaceId) as any;

    const paymentMetrics = useSupabase
      ? await (async () => {
          const { data, error } = await supabase!
            .from('payments')
            .select('amount, refund_amount')
            .eq('customer_id', customerId)
            .eq('tenant_id', tenantId)
            .eq('workspace_id', workspaceId);
          if (error) throw error;
          const rows = data ?? [];
          return {
            total_payments: rows.length,
            total_paid: rows.reduce((sum, row: any) => sum + Number(row.amount ?? 0), 0),
            total_refunded: rows.reduce((sum, row: any) => sum + Number(row.refund_amount ?? 0), 0),
          };
        })()
      : db!.prepare(`
          SELECT COUNT(*) as total_payments,
                 COALESCE(SUM(amount), 0) as total_paid,
                 COALESCE(SUM(refund_amount), 0) as total_refunded
          FROM payments WHERE customer_id = ? AND tenant_id = ? AND workspace_id = ?
        `).get(customerId, tenantId, workspaceId) as any;

    const returnMetrics = useSupabase
      ? await (async () => {
          const { data, error } = await supabase!
            .from('returns')
            .select('id')
            .eq('customer_id', customerId)
            .eq('tenant_id', tenantId)
            .eq('workspace_id', workspaceId);
          if (error) throw error;
          return { total_returns: (data ?? []).length };
        })()
      : db!.prepare(`
          SELECT COUNT(*) as total_returns
          FROM returns WHERE customer_id = ? AND tenant_id = ? AND workspace_id = ?
        `).get(customerId, tenantId, workspaceId) as any;

    const caseMetrics = useSupabase
      ? await (async () => {
          const { data, error } = await supabase!
            .from('cases')
            .select('status')
            .eq('customer_id', customerId)
            .eq('tenant_id', tenantId)
            .eq('workspace_id', workspaceId);
          if (error) throw error;
          const rows = data ?? [];
          return {
            total_cases: rows.length,
            open_cases: rows.filter((row: any) => !['closed', 'resolved'].includes(row.status)).length,
          };
        })()
      : db!.prepare(`
          SELECT COUNT(*) as total_cases,
                 SUM(CASE WHEN status NOT IN ('closed', 'resolved') THEN 1 ELSE 0 END) as open_cases
          FROM cases WHERE customer_id = ? AND tenant_id = ? AND workspace_id = ?
        `).get(customerId, tenantId, workspaceId) as any;

    const linkedIdentities = useSupabase
      ? await (async () => {
          const { data, error } = await supabase!
            .from('linked_identities')
            .select('system, external_id, confidence')
            .eq('customer_id', customerId);
          if (error) throw error;
          return data ?? [];
        })()
      : db!.prepare(
          'SELECT system, external_id, confidence FROM linked_identities WHERE customer_id = ?'
        ).all(customerId) as any[];

    const ltv = (orderMetrics?.total_spent ?? 0) - (paymentMetrics?.total_refunded ?? 0);
    const totalPaid = paymentMetrics?.total_paid ?? 0;
    const totalRefunded = paymentMetrics?.total_refunded ?? 0;
    const refundRate = totalPaid > 0 ? totalRefunded / totalPaid : 0;

    const disputeCount = useSupabase
      ? await (async () => {
          const { data, error } = await supabase!
            .from('payments')
            .select('id')
            .eq('customer_id', customerId)
            .eq('tenant_id', tenantId)
            .eq('workspace_id', workspaceId)
            .not('dispute_id', 'is', null);
          if (error) throw error;
          return { count: (data ?? []).length };
        })()
      : db!.prepare(`
          SELECT COUNT(*) as count FROM payments
          WHERE customer_id = ? AND tenant_id = ? AND workspace_id = ? AND dispute_id IS NOT NULL
        `).get(customerId, tenantId, workspaceId) as { count: number };
    const disputeRate = (paymentMetrics?.total_payments ?? 0) > 0
      ? disputeCount.count / paymentMetrics.total_payments
      : 0;

    try {
      if (useSupabase) {
        const { error } = await supabase!.from('customers').update({
          lifetime_value: ltv,
          total_orders: orderMetrics?.total_orders ?? 0,
          dispute_rate: disputeRate,
          refund_rate: refundRate,
          updated_at: now,
        }).eq('id', customerId).eq('tenant_id', tenantId).eq('workspace_id', workspaceId);
        if (error) throw error;
      } else {
        db!.prepare(`
          UPDATE customers SET
            lifetime_value = ?,
            total_orders = ?,
            dispute_rate = ?,
            refund_rate = ?,
            updated_at = ?
          WHERE id = ? AND tenant_id = ? AND workspace_id = ?
        `).run(ltv, orderMetrics?.total_orders ?? 0, disputeRate, refundRate, now, customerId, tenantId, workspaceId);
      }
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
