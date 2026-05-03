/**
 * server/agents/impl/returnsAgent.ts
 *
 * Returns Agent — handles return lifecycle state, block/unblock logic,
 * and label/inspection/restock progression.
 */

import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

interface ReturnAction {
  returnId: string;
  action: string;
  detail: string;
}

async function loadReturnRow(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tenantId: string,
  workspaceId: string,
  returnId: string,
): Promise<any | null> {
  const { data: row, error } = await supabase
    .from('returns')
    .select('id, status, inspection_status, updated_at, payment_id, carrier_status, tenant_id, workspace_id')
    .eq('id', returnId)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('refund_amount, amount')
    .eq('id', row.payment_id)
    .eq('tenant_id', tenantId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (paymentError) throw paymentError;

  const { data: refund, error: refundError } = await supabase
    .from('refunds')
    .select('status')
    .eq('payment_id', row.payment_id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (refundError) throw refundError;

  return {
    ...row,
    refund_status: refund?.status ?? null,
    refund_amount: payment?.refund_amount ?? null,
    payment_amount: payment?.amount ?? null,
  };
}

async function writeAudit(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  tenantId: string,
  workspaceId: string,
  caseId: string,
  now: string,
  payload: any,
): Promise<void> {
  const { error } = await supabase.from('audit_events').insert({
    id: randomUUID(),
    tenant_id: tenantId,
    workspace_id: workspaceId,
    actor_type: 'agent',
    action: 'returns_lifecycle',
    entity_type: 'case',
    entity_id: caseId,
    new_value: payload.summary,
    metadata: payload,
    occurred_at: now,
  });
  if (error) throw error;
}

export const returnsAgentImpl: AgentImplementation = {
  slug: 'returns-agent',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId, runId } = ctx;
    const caseId = contextWindow.case.id;
    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();

    const returns = contextWindow.returns;
    if (returns.length === 0) {
      return {
        success: true,
        confidence: 1.0,
        summary: 'No returns on case — returns agent skipped',
        output: { returnsProcessed: 0 },
      };
    }

    const actions: ReturnAction[] = [];
    let blockedCount = 0;
    let progressedCount = 0;

    for (const ret of returns) {
      const returnRow = await loadReturnRow(supabase, tenantId, workspaceId, ret.id);
      if (!returnRow) continue;

      const currentStatus = returnRow.status ?? ret.status;
      const inspectionStatus = returnRow.inspection_status ?? ret.inspectionStatus;
      const refundStatus = returnRow.refund_status;
      const carrierStatus = returnRow.carrier_status ?? ret.carrierStatus;

      if (currentStatus === 'requested') {
        const isLowValue = (returnRow.payment_amount ?? 0) < 50;
        const isLowRisk = contextWindow.case.riskLevel === 'low';

        if (isLowValue && isLowRisk) {
          try {
            await supabase.from('returns')
              .update({ status: 'approved', updated_at: now })
              .eq('id', ret.id)
              .eq('tenant_id', tenantId)
              .eq('workspace_id', workspaceId);
            actions.push({ returnId: ret.id, action: 'auto_approved', detail: 'Low value + low risk' });
            progressedCount++;
          } catch {
            // non-critical
          }
        } else {
          actions.push({ returnId: ret.id, action: 'needs_review', detail: 'Requires manual approval' });
        }
      }

      if (currentStatus === 'approved' && !carrierStatus) {
        actions.push({ returnId: ret.id, action: 'awaiting_label', detail: 'Return approved, waiting for shipping label' });
      }

      if (currentStatus === 'in_transit' && carrierStatus === 'delivered') {
        try {
          await supabase.from('returns')
            .update({ status: 'received', inspection_status: 'pending', updated_at: now })
            .eq('id', ret.id)
            .eq('tenant_id', tenantId)
            .eq('workspace_id', workspaceId);
          actions.push({ returnId: ret.id, action: 'received', detail: 'Item delivered, pending inspection' });
          progressedCount++;
        } catch {
          // non-critical
        }
      }

      if (inspectionStatus === 'passed' && refundStatus !== 'completed') {
        actions.push({ returnId: ret.id, action: 'refund_pending', detail: 'Inspection passed, refund needs processing' });
      }

      if (inspectionStatus === 'failed') {
        actions.push({ returnId: ret.id, action: 'blocked_inspection', detail: 'Item failed inspection' });
        blockedCount++;
      }

      if (currentStatus === 'approved' && returnRow.updated_at) {
        const daysSinceUpdate = (Date.now() - new Date(returnRow.updated_at).getTime()) / 86400000;
        if (daysSinceUpdate > 7) {
          actions.push({ returnId: ret.id, action: 'stuck_warning', detail: `Return approved ${Math.round(daysSinceUpdate)} days ago with no progress` });
        }
      }
    }

    if (actions.length > 0) {
      try {
        await writeAudit(supabase, tenantId, workspaceId, caseId, now, {
          summary: `Returns agent: ${actions.length} action(s), ${progressedCount} progressed, ${blockedCount} blocked`,
          actions,
          agentRunId: runId,
        });
      } catch (err: any) {
        logger.error('Returns agent audit write failed', { error: err?.message });
      }
    }

    return {
      success: true,
      confidence: 0.9,
      summary: `Returns: ${returns.length} return(s), ${progressedCount} progressed, ${blockedCount} blocked`,
      output: {
        returnsProcessed: returns.length,
        progressed: progressedCount,
        blocked: blockedCount,
        actions,
      },
    };
  },
};
