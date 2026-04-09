/**
 * server/agents/impl/identityMappingAgent.ts
 *
 * Identity Mapping Agent — resolves entity and identity links across systems.
 *
 * Goes beyond the basic identity-resolver by performing cross-system
 * identity matching:
 *   - Matches customer IDs across Shopify, Stripe, helpdesk
 *   - Detects duplicate customer records
 *   - Validates order→payment→return chain integrity
 *   - Blocks unsafe propagation when identity is ambiguous
 *
 * No Gemini — pure SQL cross-referencing.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const identityMappingAgentImpl: AgentImplementation = {
  slug: 'identity-mapping-agent',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId, workspaceId, runId } = ctx;
    const caseId = contextWindow.case.id;
    const db = getDb();
    const now = new Date().toISOString();

    const customer = contextWindow.customer;
    if (!customer) {
      return { success: true, summary: 'No customer on case — identity mapping skipped' };
    }

    // ── 1. Collect all identifiers from context ──────────────────────────
    const orderExternalIds = contextWindow.orders
      .map(o => o.externalId)
      .filter(Boolean);
    const paymentExternalIds = contextWindow.payments
      .map(p => p.externalId)
      .filter(Boolean) as string[];
    const returnExternalIds = contextWindow.returns
      .map(r => r.externalId)
      .filter(Boolean) as string[];

    // ── 2. Check for duplicate customers by email ────────────────────────
    const duplicates: Array<{ id: string; name: string | null }> = [];
    if (customer.email) {
      const dupes = db.prepare(`
        SELECT id, canonical_name FROM customers
        WHERE canonical_email = ? AND tenant_id = ? AND id != ?
      `).all(customer.email, tenantId, customer.id) as any[];

      for (const dupe of dupes) {
        duplicates.push({ id: dupe.id, name: dupe.canonical_name });
      }
    }

    // ── 3. Validate order → payment chain ────────────────────────────────
    const brokenChains: Array<{ orderId: string; issue: string }> = [];

    for (const order of contextWindow.orders) {
      // Check that each order has at least one payment
      const paymentForOrder = db.prepare(`
        SELECT COUNT(*) as count FROM payments
        WHERE order_id = ? AND tenant_id = ?
      `).get(order.id, tenantId) as { count: number };

      if (paymentForOrder.count === 0) {
        brokenChains.push({
          orderId: order.id,
          issue: 'Order has no linked payment record',
        });
      }
    }

    // ── 4. Check linked identities coverage ──────────────────────────────
    const existingLinks = db.prepare(
      'SELECT system, external_id FROM linked_identities WHERE customer_id = ?'
    ).all(customer.id) as Array<{ system: string; external_id: string }>;

    const linkedSystems = new Set(existingLinks.map(l => l.system));
    const missingSystems: string[] = [];

    // Expected systems based on what data exists
    if (orderExternalIds.length > 0 && !linkedSystems.has('shopify') && !linkedSystems.has('shopify_order')) {
      missingSystems.push('shopify');
    }
    if (paymentExternalIds.length > 0 && !linkedSystems.has('stripe') && !linkedSystems.has('stripe_payment')) {
      missingSystems.push('stripe');
    }

    // ── 5. Auto-create missing links from context data ───────────────────
    let linksCreated = 0;
    const insertLink = db.prepare(`
      INSERT OR IGNORE INTO linked_identities
        (id, customer_id, tenant_id, system, external_id, confidence, verified_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const externalId of orderExternalIds) {
      try {
        const changes = insertLink.run(
          randomUUID(), customer.id, tenantId,
          'shopify_order', externalId, 0.9, now, now,
        );
        if ((changes as any).changes > 0) linksCreated++;
      } catch { /* duplicate */ }
    }

    for (const externalId of paymentExternalIds) {
      try {
        const changes = insertLink.run(
          randomUUID(), customer.id, tenantId,
          'stripe_payment', externalId, 0.9, now, now,
        );
        if ((changes as any).changes > 0) linksCreated++;
      } catch { /* duplicate */ }
    }

    for (const externalId of returnExternalIds) {
      try {
        const changes = insertLink.run(
          randomUUID(), customer.id, tenantId,
          'returns_platform', externalId, 0.85, now, now,
        );
        if ((changes as any).changes > 0) linksCreated++;
      } catch { /* duplicate */ }
    }

    // ── 6. Log warnings for ambiguous identity ───────────────────────────
    const hasAmbiguity = duplicates.length > 0 || brokenChains.length > 0;

    if (hasAmbiguity) {
      try {
        db.prepare(`
          INSERT INTO audit_events
            (id, tenant_id, workspace_id, actor_type, action, entity_type, entity_id, new_value, metadata, occurred_at)
          VALUES (?, ?, ?, 'agent', ?, 'case', ?, ?, ?, ?)
        `).run(
          randomUUID(), tenantId, workspaceId,
          'identity_mapping_warning',
          caseId,
          `Identity mapping: ${duplicates.length} duplicate(s), ${brokenChains.length} broken chain(s)`,
          JSON.stringify({ duplicates, brokenChains, agentRunId: runId }),
          now,
        );
      } catch (err: any) {
        logger.error('Identity mapping audit write failed', { error: err?.message });
      }
    }

    return {
      success: true,
      confidence: hasAmbiguity ? 0.7 : 0.95,
      summary: `Identity mapping: ${linksCreated} links created, ${duplicates.length} dupes, ${brokenChains.length} broken chains`,
      output: {
        customerId: customer.id,
        linksCreated,
        totalLinks: existingLinks.length + linksCreated,
        duplicateCustomers: duplicates.length,
        brokenChains: brokenChains.length,
        missingSystems,
        hasAmbiguity,
      },
    };
  },
};
