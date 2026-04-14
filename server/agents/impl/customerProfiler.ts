/**
 * server/agents/impl/customerProfiler.ts
 *
 * Customer Profiler Agent — builds/refreshes risk score and segment.
 *
 * Uses rule-based scoring (no Gemini) to compute:
 *   - risk_level (low/medium/high/critical)
 *   - segment (vip/regular/at_risk/new)
 *   - risk_score (0-100)
 */

import { getDb } from '../../db/client.js';
import { getDatabaseProvider } from '../../db/provider.js';
import { getSupabaseAdmin } from '../../db/supabase.js';
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
  score += Math.min(disputeRate * 100, 20);
  score += Math.min(chargebacks * 5, 15);
  score += Math.min(refundRate * 50, 5);
  score += Math.min(activeConflicts * 15, 30);
  if (ltv >= 1000) score -= 10;
  if (ltv >= 3000) score -= 10;
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
  if (ltv === 0 && totalOrders <= 1) return 'new';
  return 'regular';
}

export const customerProfilerImpl: AgentImplementation = {
  slug: 'customer-profiler',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId } = ctx;
    const { customer, conflicts } = contextWindow;

    if (!customer) {
      return { success: true, summary: 'No customer on case — skipping profile' };
    }

    const provider = getDatabaseProvider();
    const useSupabase = provider === 'supabase';
    const db = useSupabase ? null : getDb();
    const supabase = useSupabase ? getSupabaseAdmin() : null;
    const customerId = customer.id;
    const linkedIdCount = customer.linkedIds.length;

    const riskScore = computeRiskScore(
      customer.disputeRate,
      customer.refundRate,
      customer.chargebacks,
      customer.ltv,
      linkedIdCount,
      conflicts.length,
    );

    const riskLevel = riskLevelFromScore(riskScore);
    const segment = segmentFromLtv(customer.ltv, customer.totalOrders);
    const now = new Date().toISOString();

    if (useSupabase) {
      const { error: customerError } = await supabase!.from('customers')
        .update({ risk_level: riskLevel, segment, updated_at: now })
        .eq('id', customerId)
        .eq('tenant_id', tenantId)
        .eq('workspace_id', workspaceId);
      if (customerError) throw customerError;

      const { error: caseError } = await supabase!.from('cases')
        .update({ risk_level: riskLevel, risk_score: riskScore, updated_at: now })
        .eq('id', contextWindow.case.id)
        .eq('tenant_id', tenantId)
        .eq('workspace_id', workspaceId);
      if (caseError) throw caseError;
    } else {
      db!.prepare(`
        UPDATE customers SET
          risk_level = ?, segment = ?, updated_at = ?
        WHERE id = ? AND tenant_id = ? AND workspace_id = ?
      `).run(riskLevel, segment, now, customerId, tenantId, workspaceId);

      db!.prepare(`
        UPDATE cases SET risk_level = ?, risk_score = ?, updated_at = ?
        WHERE id = ? AND tenant_id = ? AND workspace_id = ?
      `).run(riskLevel, riskScore, now, contextWindow.case.id, tenantId, workspaceId);
    }

    return {
      success: true,
      confidence: 0.9,
      summary: `Customer profiled: ${segment}/${riskLevel} (score ${riskScore})`,
      output: { customerId, riskScore, riskLevel, segment, linkedIdCount },
    };
  },
};
