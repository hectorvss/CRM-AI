/**
 * server/agents/impl/customerProfiler.ts
 *
 * Customer Profiler Agent — builds/refreshes risk score and segment.
 *
 * Uses rule-based scoring (no Gemini) to compute:
 *   - risk_level (low/medium/high/critical)
 *   - segment (vip/regular/at_risk/new)
 *   - risk_score (0-100)
 *
 * Scoring factors:
 *   - Dispute rate, refund rate, chargeback count
 *   - LTV (inverse — high LTV lowers risk)
 *   - Number of linked systems (more = lower risk)
 *   - Active conflicts on current case
 */

import { getDb } from '../../db/client.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

function computeRiskScore(
  disputeRate: number,
  refundRate: number,
  chargebacks: number,
  ltv: number,
  linkedIdCount: number,
  activeConflicts: number,
): number {
  let score = 0;

  // Dispute/chargeback signals (0-40 pts)
  score += Math.min(disputeRate * 100, 20);       // 0-20 from dispute rate
  score += Math.min(chargebacks * 5, 15);          // 0-15 from chargebacks
  score += Math.min(refundRate * 50, 5);           // 0-5 from refund rate

  // Active conflicts (0-30 pts)
  score += Math.min(activeConflicts * 15, 30);

  // LTV inverse bonus (0-20 pts reduction)
  if (ltv >= 1000) score -= 10;
  if (ltv >= 3000) score -= 10;

  // Identity verification bonus (0-10 pts reduction)
  if (linkedIdCount >= 2) score -= 5;
  if (linkedIdCount >= 4) score -= 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function riskLevelFromScore(score: number): string {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

function segmentFromLtv(ltv: number, totalOrders: number): string {
  if (ltv >= 2000 || totalOrders >= 10) return 'vip';
  if (ltv === 0 && totalOrders <= 1)    return 'new';
  return 'regular';
}

export const customerProfilerImpl: AgentImplementation = {
  slug: 'customer-profiler',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId } = ctx;
    const { customer, conflicts } = contextWindow;

    if (!customer) {
      return { success: true, summary: 'No customer on case — skipping profile' };
    }

    const db = getDb();
    const customerId = customer.id;

    // Count linked identities
    const linkedIdCount = customer.linkedIds.length;

    // Compute risk score
    const riskScore = computeRiskScore(
      customer.disputeRate,
      customer.refundRate,
      customer.chargebacks,
      customer.ltv,
      linkedIdCount,
      conflicts.length,
    );

    const riskLevel = riskLevelFromScore(riskScore);
    const segment   = segmentFromLtv(customer.ltv, customer.totalOrders);

    const now = new Date().toISOString();

    // Persist updated profile
    db.prepare(`
      UPDATE customers SET
        risk_level = ?, segment = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `).run(riskLevel, segment, now, customerId, tenantId);

    // Also update risk_score on the case row for dashboard display
    db.prepare(`
      UPDATE cases SET risk_level = ?, risk_score = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `).run(riskLevel, riskScore, now, contextWindow.case.id, tenantId);

    return {
      success: true,
      confidence: 0.9,
      summary: `Customer profiled: ${segment}/${riskLevel} (score ${riskScore})`,
      output: { customerId, riskScore, riskLevel, segment, linkedIdCount },
    };
  },
};
