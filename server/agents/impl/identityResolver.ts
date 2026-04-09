/**
 * server/agents/impl/identityResolver.ts
 *
 * Identity Resolver Agent — links cross-system customer identities.
 *
 * Looks up linked_identities for the case customer, identifies gaps
 * (no Shopify link, no Stripe link, etc.) and attempts to resolve them
 * by querying orders and payments already associated with the case.
 *
 * No Gemini needed — this is pure SQL + heuristics.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { logger } from '../../utils/logger.js';
import type { AgentImplementation, AgentRunContext, AgentResult } from '../types.js';

export const identityResolverImpl: AgentImplementation = {
  slug: 'identity-resolver',

  async execute(ctx: AgentRunContext): Promise<AgentResult> {
    const { contextWindow, tenantId } = ctx;
    const { customer, orders, payments, returns } = contextWindow;

    if (!customer) {
      return { success: true, summary: 'No customer on case — skipping identity resolution' };
    }

    const db = getDb();
    const customerId = customer.id;
    const now = new Date().toISOString();

    // ── Existing linked identities ────────────────────────────────────────
    const existingLinks = db.prepare(
      'SELECT system, external_id FROM linked_identities WHERE customer_id = ?'
    ).all(customerId) as Array<{ system: string; external_id: string }>;

    const linkedSystems = new Set(existingLinks.map(l => l.system));

    const newLinks: Array<{ system: string; externalId: string; confidence: number }> = [];

    // ── Derive Shopify customer ID from orders ────────────────────────────
    if (!linkedSystems.has('shopify') && orders.length > 0) {
      // Orders already have external_order_id like 'ORD-55210'; extract prefix pattern
      // In real Shopify, we'd have the Shopify customer_id in a metadata field.
      // We use the order external_id as a proxy link.
      for (const order of orders) {
        if (order.externalId) {
          newLinks.push({ system: 'shopify_order', externalId: order.externalId, confidence: 1.0 });
        }
      }
    }

    // ── Derive Stripe customer ID from payments ───────────────────────────
    if (!linkedSystems.has('stripe') && payments.length > 0) {
      for (const payment of payments) {
        if (payment.externalId) {
          // Stripe payment intent IDs start with 'pi_'
          newLinks.push({ system: 'stripe_payment', externalId: payment.externalId, confidence: 1.0 });
        }
      }
    }

    // ── Derive return platform IDs from returns ───────────────────────────
    if (!linkedSystems.has('returns_platform') && returns.length > 0) {
      for (const ret of returns) {
        if (ret.externalId) {
          newLinks.push({ system: 'returns_platform', externalId: ret.externalId, confidence: 1.0 });
        }
      }
    }

    // ── Persist new links ─────────────────────────────────────────────────
    let linksCreated = 0;
    const insertLink = db.prepare(`
      INSERT OR IGNORE INTO linked_identities
        (id, customer_id, system, external_id, confidence, verified, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const link of newLinks) {
      try {
        const changes = insertLink.run(
          randomUUID(),
          customerId,
          link.system,
          link.externalId,
          link.confidence,
          1,
          now,
        );
        if ((changes as any).changes > 0) linksCreated++;
      } catch (err: any) {
        logger.debug('Identity link insert failed (likely duplicate)', { link, error: err?.message });
      }
    }

    // ── Flag orphaned customer (no links at all) ──────────────────────────
    const totalLinks = existingLinks.length + linksCreated;
    if (totalLinks === 0) {
      db.prepare(
        "UPDATE customers SET risk_level = CASE WHEN risk_level = 'low' THEN 'medium' ELSE risk_level END WHERE id = ?"
      ).run(customerId);
    }

    return {
      success: true,
      confidence: 0.95,
      summary: `Identity resolver: ${linksCreated} new links created, ${totalLinks} total for customer ${customerId}`,
      output: {
        customerId,
        existingLinks: existingLinks.length,
        newLinksCreated: linksCreated,
        totalLinks,
      },
    };
  },
};
