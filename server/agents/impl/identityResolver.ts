/**
 * server/agents/impl/identityResolver.ts
 */

import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const identityResolverImpl: AgentImplementation = {
  slug: 'identity-resolver',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId } = ctx;
    const { customer, orders, payments, returns } = contextWindow;
    if (!customer) return { success: true, summary: 'No customer on case — skipping identity resolution' };

    const supabase = getSupabaseAdmin();
    const customerId = customer.id;
    const now = new Date().toISOString();

    const { data: existingLinksData, error: existingLinksError } = await supabase
      .from('linked_identities')
      .select('system, external_id')
      .eq('customer_id', customerId);
    if (existingLinksError) throw existingLinksError;
    const existingLinks: Array<{ system: string; external_id: string }> = (existingLinksData ?? []) as any;

    const linkedSystems = new Set(existingLinks.map(l => l.system));
    const newLinks: Array<{ system: string; externalId: string; confidence: number }> = [];

    if (!linkedSystems.has('shopify') && orders.length > 0) {
      for (const order of orders) if (order.externalId) newLinks.push({ system: 'shopify_order', externalId: order.externalId, confidence: 1.0 });
    }
    if (!linkedSystems.has('stripe') && payments.length > 0) {
      for (const payment of payments) if (payment.externalId) newLinks.push({ system: 'stripe_payment', externalId: payment.externalId, confidence: 1.0 });
    }
    if (!linkedSystems.has('returns_platform') && returns.length > 0) {
      for (const ret of returns) if (ret.externalId) newLinks.push({ system: 'returns_platform', externalId: ret.externalId, confidence: 1.0 });
    }

    let linksCreated = 0;
    for (const link of newLinks) {
      try {
        const { error } = await supabase.from('linked_identities').upsert({
          id: randomUUID(),
          customer_id: customerId,
          tenant_id: tenantId,
          workspace_id: workspaceId,
          system: link.system,
          external_id: link.externalId,
          confidence: link.confidence,
          verified: 1,
          verified_at: now,
          created_at: now,
        }, { onConflict: 'system,external_id' });
        if (!error) linksCreated++;
      } catch (err: any) {
        logger.debug('Identity link insert failed (likely duplicate)', { link, error: err?.message });
      }
    }

    const totalLinks = existingLinks.length + linksCreated;
    if (totalLinks === 0) {
      const { error } = await supabase.from('customers')
        .update({ risk_level: customer.riskLevel === 'low' ? 'medium' : customer.riskLevel })
        .eq('id', customerId)
        .eq('tenant_id', tenantId)
        .eq('workspace_id', workspaceId);
      if (error) throw error;
    }

    return {
      success: true,
      confidence: 0.95,
      summary: `Identity resolver: ${linksCreated} new links created, ${totalLinks} total for customer ${customerId}`,
      output: { customerId, existingLinks: existingLinks.length, newLinksCreated: linksCreated, totalLinks },
    };
  },
};
