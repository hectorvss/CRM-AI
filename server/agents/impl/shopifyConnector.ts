/**
 * server/agents/impl/shopifyConnector.ts
 *
 * Shopify Connector Agent — reads and updates order, customer,
 * and commerce state from Shopify.
 *
 * Since we don't have a live Shopify API connection, this agent operates
 * against our local DB (orders, customers) which mirror what Shopify
 * would provide. In production, this would call the Shopify Admin API.
 *
 * Capabilities:
 *   - Read order state, fulfillment info, customer metadata
 *   - Detect mismatches between local state and "Shopify" (system_states)
 *   - Write order status updates when authorized
 *
 * No Gemini — pure DB reads/writes via the connector pattern.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { getDatabaseProvider } from '../../db/provider.js';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import { integrationRegistry } from '../../integrations/registry.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const shopifyConnectorImpl: AgentImplementation = {
  slug: 'shopify-connector',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId, permissions, runId } = ctx;
    const caseId = contextWindow.case.id;
    const now = new Date().toISOString();
    const provider = getDatabaseProvider();
    const useSupabase = provider === 'supabase';
    const db = useSupabase ? null : getDb();
    const supabase = useSupabase ? getSupabaseAdmin() : null;

    if (!permissions.canCallShopify) {
      return {
        success: true,
        summary: 'Shopify connector skipped — no canCallShopify permission',
        output: { skipped: true, reason: 'permission_denied' },
      };
    }

    const orders = contextWindow.orders;
    if (orders.length === 0) {
      return {
        success: true,
        confidence: 1.0,
        summary: 'No orders linked to case — Shopify sync skipped',
        output: { ordersChecked: 0 },
      };
    }

    // ── Try live Shopify adapter first, fall back to local DB ────────────
    const shopifyAdapter = integrationRegistry.get('shopify');
    const useLive = !!shopifyAdapter;

    // ── Read & compare order states ──────────────────────────────────────
    const discrepancies: Array<{ orderId: string; field: string; local: string; shopify: string }> = [];
    const synced: string[] = [];

    for (const order of orders) {
      let shopifyState = order.systemStates?.shopify;

      // If live adapter is available, fetch real state from Shopify
      if (useLive && order.externalId) {
        try {
          const liveOrder = await (shopifyAdapter as any).getOrder(order.externalId);
          if (liveOrder?.status) {
            shopifyState = liveOrder.status;
            // Update system_states with the live value
            const currentStates = typeof order.systemStates === 'object' ? order.systemStates : {};
            if (useSupabase) {
              await supabase!.from('orders')
                .update({ system_states: JSON.stringify({ ...currentStates, shopify: shopifyState }), updated_at: now })
                .eq('id', order.id)
                .eq('tenant_id', tenantId)
                .eq('workspace_id', workspaceId);
            } else {
              db!.prepare('UPDATE orders SET system_states = ?, updated_at = ? WHERE id = ? AND tenant_id = ? AND workspace_id = ?')
                .run(JSON.stringify({ ...currentStates, shopify: shopifyState }), now, order.id, tenantId, workspaceId);
            }
          }
        } catch (err: any) {
          logger.warn('Shopify live fetch failed, using cached state', { orderId: order.id, error: err?.message });
        }
      }

      const localStatus = order.status;

      if (shopifyState && shopifyState !== localStatus) {
        discrepancies.push({
          orderId: order.id,
          field: 'status',
          local: localStatus,
          shopify: shopifyState,
        });
      } else {
        synced.push(order.id);
      }

      // Check fulfillment state from order DB row
      const orderRow = useSupabase
        ? (await supabase!.from('orders').select('fulfillment_status, tracking_number, tracking_url').eq('id', order.id).eq('tenant_id', tenantId).eq('workspace_id', workspaceId).maybeSingle()).data
        : db!.prepare(
            'SELECT fulfillment_status, tracking_number, tracking_url FROM orders WHERE id = ? AND tenant_id = ? AND workspace_id = ?'
          ).get(order.id, tenantId, workspaceId) as any;

      if (orderRow) {
        const fulfillmentInSystem = order.systemStates?.fulfillment;
        if (fulfillmentInSystem && fulfillmentInSystem !== orderRow.fulfillment_status) {
          discrepancies.push({
            orderId: order.id,
            field: 'fulfillment_status',
            local: orderRow.fulfillment_status ?? 'null',
            shopify: fulfillmentInSystem,
          });
        }
      }
    }

    // ── Log discrepancies to audit ───────────────────────────────────────
    if (discrepancies.length > 0) {
      try {
        if (useSupabase) {
          const { error } = await supabase!.from('audit_events').insert({
            id: randomUUID(),
            tenant_id: tenantId,
            workspace_id: workspaceId,
            actor_type: 'agent',
            action: 'shopify_sync_discrepancy',
            entity_type: 'case',
            entity_id: caseId,
            new_value: `Shopify connector found ${discrepancies.length} state discrepancy(ies)`,
            metadata: { discrepancies, agentRunId: runId },
            occurred_at: now,
          });
          if (error) throw error;
        } else {
          db!.prepare(`
            INSERT INTO audit_events
              (id, tenant_id, workspace_id, actor_type, action, entity_type, entity_id, new_value, metadata, occurred_at)
            VALUES (?, ?, ?, 'agent', ?, 'case', ?, ?, ?, ?)
          `).run(
            randomUUID(), tenantId, workspaceId,
            'shopify_sync_discrepancy',
            caseId,
            `Shopify connector found ${discrepancies.length} state discrepancy(ies)`,
            JSON.stringify({ discrepancies, agentRunId: runId }),
            now,
          );
        }
      } catch (err: any) {
        logger.error('Shopify connector audit write failed', { error: err?.message });
      }
    }

    // ── Update last sync timestamp ───────────────────────────────────────
    try {
      if (useSupabase) {
        await supabase!.from('cases')
          .update({ last_activity_at: now })
          .eq('id', caseId)
          .eq('tenant_id', tenantId)
          .eq('workspace_id', workspaceId);
      } else {
        db!.prepare(
          "UPDATE cases SET last_activity_at = ? WHERE id = ? AND tenant_id = ? AND workspace_id = ?"
        ).run(now, caseId, tenantId, workspaceId);
      }
    } catch { /* non-critical */ }

    return {
      success: true,
      confidence: 0.95,
      summary: `Shopify sync: ${synced.length} order(s) in sync, ${discrepancies.length} discrepancy(ies)${useLive ? ' (live)' : ' (cached)'}`,
      output: {
        ordersChecked: orders.length,
        inSync: synced.length,
        discrepancies: discrepancies.length,
        details: discrepancies,
        mode: useLive ? 'live' : 'cached',
      },
    };
  },
};
