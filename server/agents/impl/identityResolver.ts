/**
 * server/agents/impl/identityResolver.ts
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { getDatabaseProvider } from '../../db/provider.js';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const identityResolverImpl: AgentImplementation = {
  slug: 'identity-resolver',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId } = ctx;
    const { customer, orders, payments, returns } = contextWindow;
    if (!customer) return { success: true, summary: 'No customer on case — skipping identity resolution' };

    const provider = getDatabaseProvider();
    const useSupabase = provider === 'supabase';
    const db = useSupabase ? null : getDb();
    const supabase = useSupabase ? getSupabaseAdmin() : null;
    const customerId = customer.id;
    const now = new Date().toISOString();

    const existingLinks = useSupabase
      ? await (async () => {
          const { data, error } = await supabase!.from('linked_identities').select('system, external_id').eq('customer_id', customerId);
          if (error) throw error;
          return data ?? [];
        })()
      : db!.prepare('SELECT system, external_id FROM linked_identities WHERE customer_id = ?').all(customerId) as Array<{ system: string; external_id: string }>;

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
        if (useSupabase) {
          const { error } = await supabase!.from('linked_identities').upsert({
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
        } else {
          const changes = db!.prepare(`INSERT OR IGNORE INTO linked_identities (id, customer_id, workspace_id, system, external_id, confidence, verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(randomUUID(), customerId, workspaceId, link.system, link.externalId, link.confidence, 1, now);
          if ((changes as any).changes > 0) linksCreated++;
        }
      } catch (err: any) {
        logger.debug('Identity link insert failed (likely duplicate)', { link, error: err?.message });
      }
    }

    const totalLinks = existingLinks.length + linksCreated;
    if (totalLinks === 0) {
      if (useSupabase) {
        const { error } = await supabase!.from('customers').update({ risk_level: customer.riskLevel === 'low' ? 'medium' : customer.riskLevel }).eq('id', customerId).eq('tenant_id', tenantId).eq('workspace_id', workspaceId);
        if (error) throw error;
      } else {
        db!.prepare("UPDATE customers SET risk_level = CASE WHEN risk_level = 'low' THEN 'medium' ELSE risk_level END WHERE id = ?").run(customerId);
      }
    }

    return {
      success: true,
      confidence: 0.95,
      summary: `Identity resolver: ${linksCreated} new links created, ${totalLinks} total for customer ${customerId}`,
      output: { customerId, existingLinks: existingLinks.length, newLinksCreated: linksCreated, totalLinks },
    };
  },
};
