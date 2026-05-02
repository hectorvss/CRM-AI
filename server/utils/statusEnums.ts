/**
 * server/utils/statusEnums.ts
 *
 * Canonical allowed-values for entity status fields.
 * Import `isValidStatus` to guard PATCH /status endpoints against
 * arbitrary string injection (e.g. SQL-injected values, typos, test data
 * that would silently corrupt the canonical state machine).
 *
 * When a new status is added to the data model, add it here first.
 */

// ── Orders ────────────────────────────────────────────────────────────────────
export const ORDER_STATUSES = new Set([
  'pending',
  'processing',
  'packed',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'returned',
  'blocked',
  'on_hold',
  'failed',
  'refunded',
]);

// ── Payments ──────────────────────────────────────────────────────────────────
export const PAYMENT_STATUSES = new Set([
  'pending',
  'authorized',
  'captured',
  'settled',
  'refunded',
  'partially_refunded',
  'disputed',
  'blocked',
  'chargeback',
  'failed',
  'voided',
  'cancelled',
]);

// ── Returns ───────────────────────────────────────────────────────────────────
export const RETURN_STATUSES = new Set([
  'pending',
  'pending_review',
  'in_transit',
  'received',
  'inspected',
  'approved',
  'rejected',
  'refunded',
  'replaced',
  'blocked',
  'escalated',
  'closed',
]);

export const RETURN_INSPECTION_STATUSES = new Set([
  'pending',
  'in_progress',
  'inspected',
  'escalated',
  'skipped',
]);

export const RETURN_REFUND_STATUSES = new Set([
  'not_required',
  'pending_review',
  'refund_pending',
  'refunded',
  'rejected',
  'blocked',
  'approved',
]);

// ── Cases ─────────────────────────────────────────────────────────────────────
export const CASE_STATUSES = new Set([
  'open',
  'pending',
  'in_progress',
  'waiting_approval',
  'blocked',
  'resolved',
  'closed',
  'cancelled',
]);

// ── Reconciliation Issues ─────────────────────────────────────────────────────
export const RECONCILIATION_ISSUE_STATUSES = new Set([
  'open',
  'in_review',
  'resolved',
  'escalated',
  'ignored',
]);

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Returns true if `value` is a member of `allowedSet`.
 * Call like: `isValidStatus(newStatus, ORDER_STATUSES)`
 */
export function isValidStatus(value: string, allowedSet: Set<string>): boolean {
  return allowedSet.has(value);
}

/**
 * Returns a 400-ready error message listing valid values.
 */
export function invalidStatusMessage(field: string, allowedSet: Set<string>): string {
  return `Invalid ${field}. Allowed values: ${[...allowedSet].join(', ')}`;
}
