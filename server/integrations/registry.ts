/**
 * server/integrations/registry.ts
 *
 * Central registry for integration adapters.
 *
 * At startup the server registers available adapters (based on which
 * credentials are present in the environment). Any part of the codebase that
 * needs to call an external API goes through this registry — never instantiates
 * adapters directly.
 *
 * Usage:
 *   import { integrationRegistry } from '../integrations/registry.js';
 *
 *   const shopify = integrationRegistry.get('shopify');
 *   if (!shopify) throw new Error('Shopify not configured');
 *   const order = await shopify.getOrder('ORD-123');
 */

import { logger } from '../utils/logger.js';
import type { IntegrationAdapter, IntegrationSystem } from './types.js';

// ── Registry class ────────────────────────────────────────────────────────────

class IntegrationRegistry {
  private adapters = new Map<IntegrationSystem, IntegrationAdapter>();

  /**
   * Register an adapter. Called once at server startup per enabled integration.
   * Calling register() twice for the same system replaces the previous adapter.
   */
  register(adapter: IntegrationAdapter): void {
    this.adapters.set(adapter.system, adapter);
    logger.info('Integration adapter registered', { system: adapter.system });
  }

  /**
   * Returns the adapter for the given system, or null if not configured.
   * Callers should check for null and handle the "not configured" case
   * gracefully (e.g. skip reconciliation for that domain).
   */
  get<T extends IntegrationAdapter = IntegrationAdapter>(
    system: IntegrationSystem
  ): T | null {
    return (this.adapters.get(system) as T) ?? null;
  }

  /**
   * Like `get` but throws if the adapter is not registered.
   * Use this when the operation truly cannot proceed without the integration.
   */
  require<T extends IntegrationAdapter = IntegrationAdapter>(
    system: IntegrationSystem
  ): T {
    const adapter = this.get<T>(system);
    if (!adapter) {
      throw new Error(
        `Integration "${system}" is not configured. ` +
        `Add the required credentials to .env.local and restart.`
      );
    }
    return adapter;
  }

  /** Returns the list of currently registered systems */
  registeredSystems(): IntegrationSystem[] {
    return [...this.adapters.keys()];
  }

  /** Returns true if the given system is registered */
  has(system: IntegrationSystem): boolean {
    return this.adapters.has(system);
  }

  /**
   * Run ping() on all registered adapters and return a health map.
   * Used by GET /api/health to surface integration connectivity.
   */
  async healthCheck(): Promise<Record<IntegrationSystem, 'ok' | 'error'>> {
    const results: Partial<Record<IntegrationSystem, 'ok' | 'error'>> = {};

    await Promise.allSettled(
      [...this.adapters.entries()].map(async ([system, adapter]) => {
        try {
          await adapter.ping();
          results[system] = 'ok';
        } catch (err) {
          results[system] = 'error';
          logger.warn('Integration health check failed', {
            system,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })
    );

    return results as Record<IntegrationSystem, 'ok' | 'error'>;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const integrationRegistry = new IntegrationRegistry();

// ── Bootstrap helper ──────────────────────────────────────────────────────────

interface AdapterRegistration {
  /** Logical system name (used for diagnostics) */
  system: IntegrationSystem;
  /** Resolves the adapter instance. May throw if the adapter cannot be built. */
  factory: () => Promise<IntegrationAdapter>;
}

/**
 * Called once at server startup after config is validated.
 *
 * Imports and registers adapters for every integration that has credentials.
 * Failures during a single adapter's initialisation are logged and SKIPPED —
 * the rest of the server keeps booting. Adapters whose credentials are absent
 * are still registered in "stub mode" (configured=false) so the health check
 * and capability discovery APIs can surface them as not-configured rather than
 * silently missing.
 *
 * Structured as a dynamic import so adapters that are not configured never
 * add their SDK dependencies to the startup path.
 */
export async function bootstrapIntegrations(): Promise<void> {
  const { config } = await import('../config.js');

  const registrations: AdapterRegistration[] = [];

  // ── Shopify ────────────────────────────────────────────────────────────────
  registrations.push({
    system: 'shopify',
    factory: async () => {
      const { ShopifyAdapter } = await import('./shopify.js');
      return new ShopifyAdapter({
        shopDomain:    config.shopify?.shopDomain    ?? '',
        adminApiToken: config.shopify?.adminApiToken ?? '',
        webhookSecret: config.shopify?.webhookSecret ?? '',
      });
    },
  });

  // ── Stripe ─────────────────────────────────────────────────────────────────
  // Stripe ownership belongs to Flow 9; we only register it if the adapter
  // file exposes `StripeAdapter`. Anything else (e.g. an in-flux refactor by
  // Flow 9) must NOT crash this bootstrap.
  if (config.stripe) {
    registrations.push({
      system: 'stripe',
      factory: async () => {
        const mod: any = await import('./stripe.js');
        if (!mod.StripeAdapter) {
          throw new Error('StripeAdapter export missing from ./stripe.js');
        }
        return new mod.StripeAdapter(
          config.stripe!.secretKey,
          config.stripe!.webhookSecret,
        );
      },
    });
  }

  // ── WhatsApp (Meta Business Cloud API) ────────────────────────────────────
  // Always register so health-check surfaces it; `configured=false` if creds missing.
  registrations.push({
    system: 'whatsapp',
    factory: async () => {
      const { WhatsAppAdapter } = await import('./whatsapp.js');
      return new WhatsAppAdapter({
        accessToken:   config.channels?.whatsappAccessToken   ?? '',
        phoneNumberId: config.channels?.whatsappPhoneNumberId ?? '',
        verifyToken:   config.channels?.whatsappVerifyToken   ?? '',
        webhookSecret: config.channels?.whatsappWebhookSecret ?? '',
      });
    },
  });

  // Run all registrations in parallel; log but never crash on individual failures.
  const results = await Promise.allSettled(
    registrations.map(async (reg) => {
      try {
        const adapter = await reg.factory();
        integrationRegistry.register(adapter);
        return reg.system;
      } catch (err) {
        logger.warn('Skipping integration adapter (initialisation failed)', {
          system: reg.system,
          error:  err instanceof Error ? err.message : String(err),
        });
        throw err;   // surfaces in Promise.allSettled rejection branch
      }
    }),
  );

  const failed = results.filter((r) => r.status === 'rejected').length;
  const okSystems = integrationRegistry.registeredSystems();

  logger.info('Integrations bootstrapped', {
    registered: okSystems,
    configured: okSystems.filter((s) => integrationRegistry.get(s)?.configured !== false),
    failed,
  });
}
