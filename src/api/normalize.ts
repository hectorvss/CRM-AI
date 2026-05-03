/**
 * CRM AI — API normalization layer.
 *
 * The backend (Supabase + Postgres) speaks snake_case end-to-end. The frontend
 * components consume camelCase types (see `src/types.ts`). This module is the
 * SINGLE place where the conversion happens for every payload that flows
 * through `src/api/client.ts`.
 *
 * Rules:
 *  - We only rename object KEYS. Primitive values (strings, numbers, booleans),
 *    `null`, `undefined`, and ISO date strings are returned unchanged.
 *  - Recursion walks plain objects and arrays. Anything else (Date instances,
 *    Maps, Sets, class instances, typed arrays, etc.) is preserved as-is.
 *  - The conversion is BIJECTIVE for typical API shapes — `camelToSnakeDeep`
 *    is the inverse of `snakeToCamelDeep` for data emitted by our backend.
 *  - Keys that begin with `_` (e.g. `_internal`) are passed through untouched
 *    so we do not mangle reserved metadata fields.
 *  - Keys that are pure UPPER_SNAKE_CASE constants (e.g. `STATUS_CODE`) are
 *    preserved as-is — they are typically enum-like identifiers, not column
 *    names.
 *
 * The functions are intentionally untyped (`any`) at the boundary because the
 * API client returns `Promise<any>` to the callers anyway; the strong typing
 * lives in `src/types.ts` where components consume the normalized shape.
 */

// ── helpers ────────────────────────────────────────────────────────────────

const CAMEL_RE = /_([a-z0-9])/g;
const SNAKE_RE = /[A-Z]/g;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function snakeToCamelKey(key: string): string {
  // Preserve metadata-style keys (`_id`, `__typename`) and constants (`API_KEY`).
  if (key.length === 0) return key;
  if (key.startsWith('_')) return key;
  if (key === key.toUpperCase() && /[A-Z]/.test(key)) return key;
  return key.replace(CAMEL_RE, (_match, char: string) => char.toUpperCase());
}

function camelToSnakeKey(key: string): string {
  if (key.length === 0) return key;
  if (key.startsWith('_')) return key;
  // Preserve already-snake_case keys and constants.
  if (key === key.toLowerCase()) return key;
  if (key === key.toUpperCase()) return key;
  return key.replace(SNAKE_RE, (char) => `_${char.toLowerCase()}`);
}

// ── public API ─────────────────────────────────────────────────────────────

/**
 * Recursively converts every snake_case object key to camelCase. Arrays are
 * walked, primitive values are returned unchanged, and Date / Map / Set /
 * other class instances are preserved by reference.
 */
export function snakeToCamelDeep<T = any>(input: any): T {
  if (Array.isArray(input)) {
    return input.map((item) => snakeToCamelDeep(item)) as unknown as T;
  }
  if (!isPlainObject(input)) {
    return input as T;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    out[snakeToCamelKey(key)] = snakeToCamelDeep(input[key]);
  }
  return out as T;
}

/**
 * Recursively converts every camelCase object key to snake_case. Used when
 * sending bodies to the API so callers can write camelCase payloads.
 */
export function camelToSnakeDeep<T = any>(input: any): T {
  if (Array.isArray(input)) {
    return input.map((item) => camelToSnakeDeep(item)) as unknown as T;
  }
  if (!isPlainObject(input)) {
    return input as T;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    out[camelToSnakeKey(key)] = camelToSnakeDeep(input[key]);
  }
  return out as T;
}
