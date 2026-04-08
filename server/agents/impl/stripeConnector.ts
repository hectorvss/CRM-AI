/**
 * server/agents/impl/stripeConnector.ts
 *
 * Stripe Connector Agent — reads and updates payment, refund, dispute,
 * and subscription state from Stripe.
 *
 * Operates against local DB (payments) which mirrors Stripe data.
 * In production, this would call the Stripe API.
 *
 * Capabilities:
 *   - Read payment intent state, refund status, dispute status
 *   - Detect mismatches between local state and "Stripe" (system_states)
 *   - Flag payments with active disputes
 *   - Write refund status updates when authorized
 *
 * No Gemini — pure DB reads/writes via the connector pattern.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const stripeConnectorImpl: AgentImplementation = {
  slug: 'stripe-connector',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, permissions, runId } = ctx;
    const caseId = contextWindow.case.id;
    const db = getDb();
    const now = new Date().toISOString();

    if (!permissions.canCallStripe) {
      return {
        success: true,
        summary: 'Stripe connector skipped — no canCallStripe permission',
        output: { skipped: true, reason: 'permission_denied' },
      };
    }

    const payments = contextWindow.payments;
    if (payments.length === 0) {
      return {
        success: true,
        confidence: 1.0,
        summary: 'No payments linked to case — Stripe sync skipped',
        output: { paymentsChecked: 0 },
      };
    }

    // ── Read & compare payment states ────────────────────────────────────
    const discrepancies: Array<{ paymentId: string; field: string; local: string; stripe: string }> = [];
    const activeDisputes: Array<{ paymentId: string; disputeId: string }> = [];
    const synced: string[] = [];

    for (const payment of payments) {
      const stripeState = payment.systemStates?.stripe;
      const localStatus = payment.status;

      if (stripeState && stripeState !== localStatus) {
        discrepancies.push({
          paymentId: payment.id,
          field: 'status',
          local: localStatus,
          stripe: stripeState,
        });
      } else {
        synced.push(payment.id);
      }

      // Check for active disputes
      if (payment.disputeId) {
        activeDisputes.push({
          paymentId: payment.id,
          disputeId: payment.disputeId,
        });
      }

      // Check refund amount consistency
      const paymentRow = db.prepare(
        'SELECT refund_amount, refund_status FROM payments WHERE id = ? AND tenant_id = ?'
      ).get(payment.id, tenantId) as any;

      if (paymentRow && payment.refundAmount > 0) {
        const stripeRefundState = payment.systemStates?.stripe_refund;
        if (stripeRefundState && stripeRefundState !== paymentRow.refund_status) {
          discrepancies.push({
            paymentId: payment.id,
            field: 'refund_status',
            local: paymentRow.refund_status ?? 'null',
            stripe: stripeRefundState,
          });
        }
      }
    }

    // ── Log discrepancies to audit ───────────────────────────────────────
    if (discrepancies.length > 0 || activeDisputes.length > 0) {
      try {
        db.prepare(`
          INSERT INTO audit_events
            (id, tenant_id, entity_type, entity_id, event_type, description, metadata, created_at)
          VALUES (?, ?, 'case', ?, ?, ?, ?, ?)
        `).run(
          randomUUID(), tenantId, caseId,
          'stripe_sync_check',
          `Stripe connector: ${discrepancies.length} discrepancy(ies), ${activeDisputes.length} active dispute(s)`,
          JSON.stringify({ discrepancies, activeDisputes, agentRunId: runId }),
          now,
        );
      } catch (err: any) {
        logger.error('Stripe connector audit write failed', { error: err?.message });
      }
    }

    return {
      success: true,
      confidence: 0.95,
      summary: `Stripe sync: ${synced.length} in sync, ${discrepancies.length} discrepancy(ies), ${activeDisputes.length} dispute(s)`,
      output: {
        paymentsChecked: payments.length,
        inSync: synced.length,
        discrepancies: discrepancies.length,
        activeDisputes: activeDisputes.length,
        details: { discrepancies, activeDisputes },
      },
    };
  },
};
