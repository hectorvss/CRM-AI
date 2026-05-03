/**
 * server/agents/impl/logisticsTrackingAgent.ts
 *
 * Logistics / Tracking Agent — handles shipment/tracking/address-related
 * logistics signals.
 */

import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const logisticsTrackingAgentImpl: AgentImplementation = {
  slug: 'logistics-tracking-agent',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId, runId } = ctx;
    const caseId = contextWindow.case.id;
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const orders = contextWindow.orders;
    if (orders.length === 0) {
      return {
        success: true,
        confidence: 1.0,
        summary: 'No orders — logistics tracking skipped',
        output: { ordersChecked: 0 },
      };
    }

    const trackingInfo: Array<{
      orderId: string;
      trackingNumber: string | null;
      fulfillmentStatus: string | null;
      issue: string | null;
    }> = [];

    const alerts: Array<{ orderId: string; type: string; detail: string }> = [];

    for (const order of orders) {
      const { data: orderRow, error: orderError } = await supabase
        .from('orders')
        .select('fulfillment_status, tracking_number, tracking_url, shipping_address, created_at')
        .eq('id', order.id)
        .eq('tenant_id', tenantId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (orderError) throw orderError;

      if (!orderRow) continue;

      const fulfillment = orderRow.fulfillment_status ?? 'unknown';
      const tracking = orderRow.tracking_number ?? null;

      trackingInfo.push({
        orderId: order.id,
        trackingNumber: tracking,
        fulfillmentStatus: fulfillment,
        issue: null,
      });

      if (fulfillment === 'shipped' && !tracking) {
        alerts.push({ orderId: order.id, type: 'missing_tracking', detail: 'Order marked as shipped but no tracking number available' });
      }

      if (fulfillment === 'pending' || fulfillment === 'unfulfilled') {
        const orderAge = (Date.now() - new Date(orderRow.created_at).getTime()) / 86400000;
        if (orderAge > 3) {
          alerts.push({ orderId: order.id, type: 'delayed_shipment', detail: `Order created ${Math.round(orderAge)} days ago, still not shipped` });
        }
      }

      const systemFulfillment = order.systemStates?.fulfillment;
      if (systemFulfillment && systemFulfillment !== fulfillment) {
        alerts.push({ orderId: order.id, type: 'fulfillment_mismatch', detail: `Local: ${fulfillment}, System: ${systemFulfillment}` });
      }

      const { data: returnForOrder, error: returnError } = await supabase
        .from('returns')
        .select('id, status, carrier_status')
        .eq('order_id', order.id)
        .eq('tenant_id', tenantId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (returnError) throw returnError;

      if (returnForOrder && returnForOrder.status === 'approved' && !returnForOrder.carrier_status) {
        alerts.push({
          orderId: order.id,
          type: 'return_no_carrier',
          detail: `Return ${returnForOrder.id} approved but no carrier pickup scheduled`,
        });
      }
    }

    if (alerts.length > 0) {
      try {
        const { error } = await supabase.from('audit_events').insert({
          id: randomUUID(),
          tenant_id: tenantId,
          workspace_id: workspaceId,
          actor_type: 'agent',
          action: 'logistics_check',
          entity_type: 'case',
          entity_id: caseId,
          new_value: `Logistics agent: ${alerts.length} alert(s) across ${orders.length} order(s)`,
          metadata: { alerts, trackingInfo, agentRunId: runId },
          occurred_at: now,
        });
        if (error) throw error;
      } catch (err: any) {
        logger.error('Logistics agent audit write failed', { error: err?.message });
      }
    }

    return {
      success: true,
      confidence: 0.9,
      summary: `Logistics: ${orders.length} order(s) checked, ${alerts.length} alert(s)`,
      output: {
        ordersChecked: orders.length,
        trackingInfo,
        alertCount: alerts.length,
        alerts,
      },
    };
  },
};
