/**
 * server/queue/handlers/churnRiskScan.ts
 *
 * CHURN_RISK_SCAN job handler — identify customers at risk of churning.
 *
 * Triggered daily to scan customer metrics and flag those showing churn signals:
 * - Multiple open cases
 * - High refund rate
 * - High dispute rate
 * - Recent high-value returns
 * - Long time since last order
 *
 * Creates workspace alerts for churning customers so the Super Agent can
 * proactively engage or escalate.
 */

import { createCustomerRepository } from '../../data/customers.js';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import type { JobHandler, ChurnRiskScanPayload } from '../types.js';
import { randomUUID } from 'node:crypto';

export const churnRiskScanHandler: JobHandler<'churn.risk.scan'> = async (payload: ChurnRiskScanPayload, ctx) => {
  const supabase = getSupabaseAdmin();
  const customerRepo = createCustomerRepository();
  const { tenantId, workspaceId } = ctx;

  try {
    // Build query for customers with churn signals
    let query = supabase
      .from('customers')
      .select(`
        id,
        canonical_name,
        email,
        open_cases,
        chargeback_count,
        dispute_rate,
        refund_rate,
        lifetime_value,
        total_spent,
        last_order_date,
        created_at
      `)
      .eq('workspace_id', workspaceId)
      .eq('tenant_id', tenantId);

    // If a specific customer was requested, filter to just that customer
    if (payload.customerId) {
      query = query.eq('id', payload.customerId);
    }

    const { data: customers, error } = await query;

    if (error) {
      logger.error('CHURN_RISK_SCAN query failed', error);
      throw error;
    }

    if (!customers || customers.length === 0) {
      logger.debug('CHURN_RISK_SCAN: no customers found', { tenantId, workspaceId });
      return;
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const churnRiskCustomers = [];

    for (const customer of customers) {
      let riskScore = 0;
      const riskFactors: string[] = [];

      // Signal 1: Multiple open cases (≥ 2)
      if ((customer.open_cases || 0) >= 2) {
        riskScore += 2;
        riskFactors.push(`${customer.open_cases} open cases`);
      }

      // Signal 2: High refund rate (> 30%)
      if ((customer.refund_rate || 0) > 0.3) {
        riskScore += 2;
        riskFactors.push(`High refund rate (${Math.round((customer.refund_rate || 0) * 100)}%)`);
      }

      // Signal 3: High dispute rate (> 10%)
      if ((customer.dispute_rate || 0) > 0.1) {
        riskScore += 2;
        riskFactors.push(`High dispute rate (${Math.round((customer.dispute_rate || 0) * 100)}%)`);
      }

      // Signal 4: Chargebacks (> 0)
      if ((customer.chargeback_count || 0) > 0) {
        riskScore += 1;
        riskFactors.push(`${customer.chargeback_count} chargeback${customer.chargeback_count > 1 ? 's' : ''}`);
      }

      // Signal 5: No recent orders (last order > 30 days ago)
      if (customer.last_order_date) {
        const lastOrderDate = new Date(customer.last_order_date);
        if (lastOrderDate < thirtyDaysAgo) {
          riskScore += 2;
          const daysAgo = Math.floor((now.getTime() - lastOrderDate.getTime()) / (24 * 60 * 60 * 1000));
          riskFactors.push(`No orders for ${daysAgo} days`);
        }
      }

      // Only flag customers with risk score >= 3 (multiple factors)
      if (riskScore >= 3) {
        churnRiskCustomers.push({
          customerId: customer.id,
          customerName: customer.canonical_name || customer.email || customer.id,
          riskScore,
          riskFactors,
        });
      }
    }

    // Create workspace alerts for at-risk customers
    if (churnRiskCustomers.length > 0) {
      const alerts = churnRiskCustomers.map((item) => ({
        id: randomUUID(),
        workspace_id: workspaceId,
        tenant_id: tenantId,
        alert_type: 'churn_risk',
        title: `Churn risk: ${item.customerName}`,
        description: `Customer shows churn signals: ${item.riskFactors.join(', ')}`,
        entity_type: 'customer',
        entity_id: item.customerId,
        severity: item.riskScore >= 5 ? 'high' : 'medium',
        is_resolved: false,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        metadata: {
          riskScore: item.riskScore,
          riskFactors: item.riskFactors,
        },
      }));

      const { error: insertError } = await supabase
        .from('workspace_alerts')
        .insert(alerts);

      if (insertError) {
        logger.warn('Failed to insert churn risk alerts', { error: insertError, count: alerts.length });
      } else {
        logger.info('CHURN_RISK_SCAN: created workspace alerts', {
          tenantId,
          workspaceId,
          count: churnRiskCustomers.length,
          highRiskCount: churnRiskCustomers.filter((c) => c.riskScore >= 5).length,
        });
      }
    }
  } catch (err) {
    logger.error('CHURN_RISK_SCAN failed', err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
};
