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

/**
 * Called once at server startup after config is validated.
 * Imports and registers adapters for every integration that has credentials.
 *
 * Structured as a dynamic import so adapters that are not configured never
 * add their SDK dependencies to the startup path.
 */
export async function bootstrapIntegrations(): Promise<void> {
  const { config } = await import('../config.js');

  const registrations: Array<() => Promise<void>> = [];

  if (config.shopify) {
    registrations.push(async () => {
      const { ShopifyAdapter } = await import('./shopify.js');
      integrationRegistry.register(
        new ShopifyAdapter(
          config.shopify!.shopDomain,
          config.shopify!.adminApiToken,
          config.shopify!.webhookSecret
        )
      );
    });
  }

  if (config.stripe) {
    registrations.push(async () => {
      const { StripeAdapter } = await import('./stripe.js');
      integrationRegistry.register(
        new StripeAdapter(
          config.stripe!.secretKey,
          config.stripe!.webhookSecret
        )
      );
    });
  }

  // WhatsApp (Meta Business Cloud API) — register whenever any channel creds exist.
  // The adapter stubs sends gracefully when accessToken/phoneNumberId are absent,
  // so we register it unconditionally to surface it in healthCheck / capability APIs.
  registrations.push(async () => {
    const { WhatsAppAdapter } = await import('./whatsapp.js');
    integrationRegistry.register(
      new WhatsAppAdapter(
        config.channels?.whatsappAccessToken   ?? '',
        config.channels?.whatsappPhoneNumberId ?? '',
        config.channels?.whatsappVerifyToken   ?? '',
      )
    );
  });

  // Run all registrations in parallel; log but don't crash on individual failures
  const results = await Promise.allSettled(registrations.map(fn => fn()));

  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error(
        'Failed to bootstrap integration adapter',
        result.reason
      );
    }
  }

  logger.info('Integrations bootstrapped', {
    registered: integrationRegistry.registeredSystems(),
  });
}
