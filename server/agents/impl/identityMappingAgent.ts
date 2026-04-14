/**
 * server/agents/impl/identityMappingAgent.ts
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { getDatabaseProvider } from '../../db/provider.js';
import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const identityMappingAgentImpl: AgentImplementation = {
  slug: 'identity-mapping-agent',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId, runId } = ctx;
    const caseId = contextWindow.case.id;
    const provider = getDatabaseProvider();
    const useSupabase = provider === 'supabase';
    const db = useSupabase ? null : getDb();
    const supabase = useSupabase ? getSupabaseAdmin() : null;
    const now = new Date().toISOString();

    const customer = contextWindow.customer;
    if (!customer) return { success: true, summary: 'No customer on case — identity mapping skipped' };

    const orderExternalIds = contextWindow.orders.map(o => o.externalId).filter(Boolean) as string[];
    const paymentExternalIds = contextWindow.payments.map(p => p.externalId).filter(Boolean) as string[];
    const returnExternalIds = contextWindow.returns.map(r => r.externalId).filter(Boolean) as string[];

    const duplicates: Array<{ id: string; name: string | null }> = [];
    if (customer.email) {
      const dupes = useSupabase
        ? await (async () => {
            const { data, error } = await supabase!.from('customers').select('id, canonical_name').eq('canonical_email', customer.email).eq('tenant_id', tenantId).eq('workspace_id', workspaceId).neq('id', customer.id);
            if (error) throw error;
            return data ?? [];
          })()
        : db!.prepare(`SELECT id, canonical_name FROM customers WHERE canonical_email = ? AND tenant_id = ? AND workspace_id = ? AND id != ?`).all(customer.email, tenantId, workspaceId, customer.id) as any[];
      for (const dupe of dupes) duplicates.push({ id: dupe.id, name: dupe.canonical_name });
    }

    const brokenChains: Array<{ orderId: string; issue: string }> = [];
    for (const order of contextWindow.orders) {
      const paymentForOrder = useSupabase
        ? await (async () => {
            const { data, error } = await supabase!.from('payments').select('id').eq('order_id', order.id).eq('tenant_id', tenantId).eq('workspace_id', workspaceId);
            if (error) throw error;
            return { count: (data ?? []).length };
          })()
        : db!.prepare(`SELECT COUNT(*) as count FROM payments WHERE order_id = ? AND tenant_id = ? AND workspace_id = ?`).get(order.id, tenantId, workspaceId) as { count: number };
      if (paymentForOrder.count === 0) brokenChains.push({ orderId: order.id, issue: 'Order has no linked payment record' });
    }

    const existingLinks = useSupabase
      ? await (async () => {
          const { data, error } = await supabase!.from('linked_identities').select('system, external_id').eq('customer_id', customer.id);
          if (error) throw error;
          return data ?? [];
        })()
      : db!.prepare('SELECT system, external_id FROM linked_identities WHERE customer_id = ?').all(customer.id) as Array<{ system: string; external_id: string }>;

    const linkedSystems = new Set(existingLinks.map(l => l.system));
    const missingSystems: string[] = [];
    if (orderExternalIds.length > 0 && !linkedSystems.has('shopify') && !linkedSystems.has('shopify_order')) missingSystems.push('shopify');
    if (paymentExternalIds.length > 0 && !linkedSystems.has('stripe') && !linkedSystems.has('stripe_payment')) missingSystems.push('stripe');

    let linksCreated = 0;
    for (const externalId of orderExternalIds) {
      try {
        if (useSupabase) {
          const { error } = await supabase!.from('linked_identities').upsert({
            id: randomUUID(),
            customer_id: customer.id,
            tenant_id: tenantId,
            workspace_id: workspaceId,
            system: 'shopify_order',
            external_id: externalId,
            confidence: 0.9,
            verified: 1,
            verified_at: now,
            created_at: now,
          }, { onConflict: 'system,external_id' });
          if (!error) linksCreated++;
        } else {
          const changes = db!.prepare(`INSERT OR IGNORE INTO linked_identities (id, customer_id, tenant_id, workspace_id, system, external_id, confidence, verified, verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(randomUUID(), customer.id, tenantId, workspaceId, 'shopify_order', externalId, 0.9, 1, now, now);
          if ((changes as any).changes > 0) linksCreated++;
        }
      } catch {}
    }

    for (const externalId of paymentExternalIds) {
      try {
        if (useSupabase) {
          const { error } = await supabase!.from('linked_identities').upsert({
            id: randomUUID(),
            customer_id: customer.id,
            tenant_id: tenantId,
            workspace_id: workspaceId,
            system: 'stripe_payment',
            external_id: externalId,
            confidence: 0.9,
            verified: 1,
            verified_at: now,
            created_at: now,
          }, { onConflict: 'system,external_id' });
          if (!error) linksCreated++;
        } else {
          const changes = db!.prepare(`INSERT OR IGNORE INTO linked_identities (id, customer_id, tenant_id, workspace_id, system, external_id, confidence, verified, verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(randomUUID(), customer.id, tenantId, workspaceId, 'stripe_payment', externalId, 0.9, 1, now, now);
          if ((changes as any).changes > 0) linksCreated++;
        }
      } catch {}
    }

    for (const externalId of returnExternalIds) {
      try {
        if (useSupabase) {
          const { error } = await supabase!.from('linked_identities').upsert({
            id: randomUUID(),
            customer_id: customer.id,
            tenant_id: tenantId,
            workspace_id: workspaceId,
            system: 'returns_platform',
            external_id: externalId,
            confidence: 0.85,
            verified: 1,
            verified_at: now,
            created_at: now,
          }, { onConflict: 'system,external_id' });
          if (!error) linksCreated++;
        } else {
          const changes = db!.prepare(`INSERT OR IGNORE INTO linked_identities (id, customer_id, tenant_id, workspace_id, system, external_id, confidence, verified, verified_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(randomUUID(), customer.id, tenantId, workspaceId, 'returns_platform', externalId, 0.85, 1, now, now);
          if ((changes as any).changes > 0) linksCreated++;
        }
      } catch {}
    }

    const hasAmbiguity = duplicates.length > 0 || brokenChains.length > 0;
    if (hasAmbiguity) {
      try {
        if (useSupabase) {
          const { error } = await supabase!.from('audit_events').insert({
            id: randomUUID(),
            tenant_id: tenantId,
            workspace_id: workspaceId,
            actor_type: 'agent',
            action: 'identity_mapping_warning',
            entity_type: 'case',
            entity_id: caseId,
            new_value: `Identity mapping: ${duplicates.length} duplicate(s), ${brokenChains.length} broken chain(s)`,
            metadata: { duplicates, brokenChains, agentRunId: runId },
            occurred_at: now,
          });
          if (error) throw error;
        } else {
          db!.prepare(`INSERT INTO audit_events (id, tenant_id, workspace_id, actor_type, action, entity_type, entity_id, new_value, metadata, occurred_at) VALUES (?, ?, ?, 'agent', ?, 'case', ?, ?, ?, ?)`)
            .run(randomUUID(), tenantId, workspaceId, 'identity_mapping_warning', caseId, `Identity mapping: ${duplicates.length} duplicate(s), ${brokenChains.length} broken chain(s)`, JSON.stringify({ duplicates, brokenChains, agentRunId: runId }), now);
        }
      } catch (err: any) {
        logger.error('Identity mapping audit write failed', { error: err?.message });
      }
    }

    return {
      success: true,
      confidence: hasAmbiguity ? 0.7 : 0.95,
      summary: `Identity mapping: ${linksCreated} links created, ${duplicates.length} dupes, ${brokenChains.length} broken chains`,
      output: { customerId: customer.id, linksCreated, totalLinks: existingLinks.length + linksCreated, duplicateCustomers: duplicates.length, brokenChains: brokenChains.length, missingSystems, hasAmbiguity },
    };
  },
};
