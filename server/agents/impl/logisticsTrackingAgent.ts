/**
 * server/agents/impl/logisticsTrackingAgent.ts
 *
 * Logistics / Tracking Agent — handles shipment/tracking/address-related
 * logistics signals.
 *
 * Reads tracking and shipping signals, detects logistics contradictions,
 * and supports downstream return decisions. In production, this would
 * integrate with carriers (FedEx, UPS, DHL, etc.) for real-time tracking.
 *
 * No Gemini — pure DB reads and rule-based logic.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const logisticsTrackingAgentImpl: AgentImplementation = {
  slug: 'logistics-tracking-agent',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, runId } = ctx;
    const caseId = contextWindow.case.id;
    const db = getDb();
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
      // Read fulfillment details from order row
      const orderRow = db.prepare(`
        SELECT fulfillment_status, tracking_number, tracking_url,
               shipping_address, created_at
        FROM orders WHERE id = ? AND tenant_id = ?
      `).get(order.id, tenantId) as any;

      if (!orderRow) continue;

      const fulfillment = orderRow.fulfillment_status ?? 'unknown';
      const tracking = orderRow.tracking_number ?? null;

      trackingInfo.push({
        orderId: order.id,
        trackingNumber: tracking,
        fulfillmentStatus: fulfillment,
        issue: null,
      });

      // ── Check for logistics issues ─────────────────────────────────

      // Order shipped but no tracking number
      if (fulfillment === 'shipped' && !tracking) {
        alerts.push({
          orderId: order.id,
          type: 'missing_tracking',
          detail: 'Order marked as shipped but no tracking number available',
        });
      }

      // Order created > 3 days ago but not yet shipped
      if (fulfillment === 'pending' || fulfillment === 'unfulfilled') {
        const orderAge = (Date.now() - new Date(orderRow.created_at).getTime()) / 86400000;
        if (orderAge > 3) {
          alerts.push({
            orderId: order.id,
            type: 'delayed_shipment',
            detail: `Order created ${Math.round(orderAge)} days ago, still not shipped`,
          });
        }
      }

      // Fulfillment mismatch between systems
      const systemFulfillment = order.systemStates?.fulfillment;
      if (systemFulfillment && systemFulfillment !== fulfillment) {
        alerts.push({
          orderId: order.id,
          type: 'fulfillment_mismatch',
          detail: `Local: ${fulfillment}, System: ${systemFulfillment}`,
        });
      }

      // Check return-related logistics
      const returnForOrder = db.prepare(`
        SELECT id, status, carrier_status FROM returns
        WHERE order_id = ? AND tenant_id = ?
      `).get(order.id, tenantId) as any;

      if (returnForOrder) {
        if (returnForOrder.status === 'approved' && !returnForOrder.carrier_status) {
          alerts.push({
            orderId: order.id,
            type: 'return_no_carrier',
            detail: `Return ${returnForOrder.id} approved but no carrier pickup scheduled`,
          });
        }
      }
    }

    // ── Log alerts to audit ──────────────────────────────────────────────
    if (alerts.length > 0) {
      try {
        db.prepare(`
          INSERT INTO audit_events
            (id, tenant_id, entity_type, entity_id, event_type, description, metadata, created_at)
          VALUES (?, ?, 'case', ?, ?, ?, ?, ?)
        `).run(
          randomUUID(), tenantId, caseId,
          'logistics_check',
          `Logistics agent: ${alerts.length} alert(s) across ${orders.length} order(s)`,
          JSON.stringify({ alerts, trackingInfo, agentRunId: runId }),
          now,
        );
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
