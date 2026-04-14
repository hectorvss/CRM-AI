/**
 * server/agents/impl/subscriptionAgent.ts
 *
 * Recharge / Subscription Agent — handles subscription/renewal/charge state.
 *
 * Reads subscription truth from the DB and identifies subscription-related
 * issues on the case. In production, this would integrate with Recharge
 * or a similar subscription billing platform.
 *
 * No Gemini — pure DB reads and rule-based logic.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { getDatabaseProvider } from '../../db/provider.js';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const subscriptionAgentImpl: AgentImplementation = {
  slug: 'subscription-agent',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId, runId } = ctx;
    const caseId = contextWindow.case.id;
    const provider = getDatabaseProvider();
    const useSupabase = provider === 'supabase';
    const db = useSupabase ? null : getDb();
    const supabase = useSupabase ? getSupabaseAdmin() : null;
    const now = new Date().toISOString();

    const customer = contextWindow.customer;
    if (!customer) {
      return { success: true, summary: 'No customer — subscription check skipped' };
    }

    const caseType = contextWindow.case.type?.toLowerCase() ?? '';
    const intent = contextWindow.case.intent?.toLowerCase() ?? '';
    const tags = contextWindow.case.tags.map(t => t.toLowerCase());

    const isSubscriptionCase =
      caseType.includes('subscription') ||
      intent.includes('subscription') ||
      intent.includes('renewal') ||
      intent.includes('billing') ||
      tags.some(t => t.includes('subscription') || t.includes('renewal'));

    if (!isSubscriptionCase) {
      return {
        success: true,
        confidence: 1.0,
        summary: 'Not a subscription case — skipped',
        output: { subscriptionRelated: false },
      };
    }

    const recurringPayments = useSupabase
      ? await (async () => {
          const { data, error } = await supabase!
            .from('payments')
            .select('id, amount, status, created_at, external_payment_id')
            .eq('customer_id', customer.id)
            .eq('tenant_id', tenantId)
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false })
            .limit(12);
          if (error) throw error;
          return data ?? [];
        })()
      : db!.prepare(`
          SELECT id, amount, status, created_at, external_payment_id
          FROM payments
          WHERE customer_id = ? AND tenant_id = ? AND workspace_id = ?
          ORDER BY created_at DESC
          LIMIT 12
        `).all(customer.id, tenantId, workspaceId) as any[];

    const amounts = recurringPayments.map((p: any) => p.amount);
    const uniqueAmounts = [...new Set(amounts)];
    const hasRecurring = uniqueAmounts.length <= 3 && recurringPayments.length >= 2;

    const issues: Array<{ type: string; detail: string }> = [];

    const failedPayments = recurringPayments.filter((p: any) => p.status === 'failed');
    if (failedPayments.length > 0) {
      issues.push({
        type: 'failed_payment',
        detail: `${failedPayments.length} failed payment(s) in recent history`,
      });
    }

    for (let i = 0; i < recurringPayments.length - 1; i++) {
      const p1 = recurringPayments[i];
      const p2 = recurringPayments[i + 1];
      if (p1.amount === p2.amount && p1.status === 'completed' && p2.status === 'completed') {
        const gap = new Date(p1.created_at).getTime() - new Date(p2.created_at).getTime();
        if (gap < 48 * 3600000 && gap > 0) {
          issues.push({
            type: 'potential_double_charge',
            detail: `Two charges of $${p1.amount} within 48h`,
          });
        }
      }
    }

    if (issues.length > 0) {
      try {
        if (useSupabase) {
          const { error } = await supabase!.from('audit_events').insert({
            id: randomUUID(),
            tenant_id: tenantId,
            workspace_id: workspaceId,
            actor_type: 'agent',
            action: 'subscription_check',
            entity_type: 'case',
            entity_id: caseId,
            new_value: `Subscription agent: ${issues.length} issue(s) detected`,
            metadata: { issues, hasRecurring, paymentCount: recurringPayments.length, agentRunId: runId },
            occurred_at: now,
          });
          if (error) throw error;
        } else {
          db!.prepare(`
            INSERT INTO audit_events
              (id, tenant_id, workspace_id, actor_type, action, entity_type, entity_id, new_value, metadata, occurred_at)
            VALUES (?, ?, ?, 'agent', ?, 'case', ?, ?, ?, ?)
          `).run(
            randomUUID(),
            tenantId,
            workspaceId,
            'subscription_check',
            caseId,
            `Subscription agent: ${issues.length} issue(s) detected`,
            JSON.stringify({ issues, hasRecurring, paymentCount: recurringPayments.length, agentRunId: runId }),
            now,
          );
        }
      } catch (err: any) {
        logger.error('Subscription agent audit write failed', { error: err?.message });
      }
    }

    return {
      success: true,
      confidence: 0.85,
      summary: `Subscription: ${hasRecurring ? 'recurring pattern detected' : 'no clear pattern'}, ${issues.length} issue(s)`,
      output: {
        subscriptionRelated: true,
        hasRecurringPattern: hasRecurring,
        recentPayments: recurringPayments.length,
        issueCount: issues.length,
        issues,
      },
    };
  },
};
