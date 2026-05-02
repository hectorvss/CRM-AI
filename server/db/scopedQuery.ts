/**
 * server/db/scopedQuery.ts
 *
 * Tenant-scoped query helper.
 *
 * BACKGROUND
 * ──────────
 * Postgres Row-Level Security (RLS) policies are defined on the database
 * schema, but the backend uses the `SUPABASE_SERVICE_ROLE_KEY` which
 * bypasses RLS entirely. As a result, tenant isolation is enforced at the
 * application layer via explicit `WHERE tenant_id = ...` filters.
 *
 * This helper is an *incremental* hardening tool: any new code path that
 * touches the Supabase admin client should obtain its query builder via
 * `getSupabaseAdminScoped(tenantId).from(table)` so that the `eq('tenant_id', …)`
 * filter is applied automatically — making it impossible to forget the
 * scope filter in the new code being written.
 *
 * Existing call sites that use `getSupabaseAdmin()` directly should be
 * migrated opportunistically; this helper is purely additive and does NOT
 * replace `getSupabaseAdmin()`.
 *
 * EXAMPLE
 * ───────
 *   const scoped = getSupabaseAdminScoped(tenantId);
 *   const { data, error } = await scoped.from('cases').select('*');
 *   // ↑ tenant_id filter is automatically appended.
 *
 * NOTE: For mutations (insert/update/upsert) the caller is still
 * responsible for setting `tenant_id` in the row payload — the helper
 * only enforces filters on read/update/delete query chains.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabase.js';

export interface ScopedSupabaseClient {
  /** Internal: the underlying admin client. Avoid using directly. */
  readonly raw: SupabaseClient;
  /** Like `supabase.from(table)` but with `eq('tenant_id', tenantId)` applied. */
  from(table: string): ReturnType<SupabaseClient['from']>;
}

/**
 * Wrap the admin Supabase client so that every `from(table)` call
 * automatically appends `eq('tenant_id', tenantId)` to the query chain.
 *
 * The returned proxy preserves the full PostgrestQueryBuilder API surface;
 * only the `from()` method is decorated.
 */
export function getSupabaseAdminScoped(tenantId: string): ScopedSupabaseClient {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('getSupabaseAdminScoped: tenantId is required');
  }

  const admin = getSupabaseAdmin();

  return {
    raw: admin,
    from(table: string) {
      // PostgrestQueryBuilder doesn't expose `.eq` directly — that lives on
      // PostgrestFilterBuilder, which is returned by select/update/delete.
      // We wrap the builder in a Proxy so that whichever terminal operation
      // the caller picks (`.select()`, `.update()`, `.delete()`), we always
      // append `.eq('tenant_id', tenantId)` before returning the chain.
      const builder = admin.from(table);
      const auto = ['select', 'update', 'delete'] as const;
      return new Proxy(builder, {
        get(target: any, prop: string | symbol, receiver) {
          const orig = Reflect.get(target, prop, receiver);
          if (typeof orig === 'function' && (auto as readonly string[]).includes(prop as string)) {
            return (...args: any[]) => {
              const filter = orig.apply(target, args);
              return filter.eq('tenant_id', tenantId);
            };
          }
          return orig;
        },
      }) as ReturnType<SupabaseClient['from']>;
    },
  };
}

/**
 * Run `fn` with a scoped client. Convenience wrapper for code that prefers
 * the callback style.
 */
export async function withScope<T>(
  scope: { tenantId: string },
  fn: (client: ScopedSupabaseClient) => Promise<T>,
): Promise<T> {
  const client = getSupabaseAdminScoped(scope.tenantId);
  return fn(client);
}
