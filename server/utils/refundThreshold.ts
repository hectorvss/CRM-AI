import { config } from '../config.js';

/**
 * Returns the refund auto-approval threshold for the given ISO 4217 currency
 * code. Currency lookup is case-insensitive; an unknown or empty currency
 * falls back to the legacy `commerce.refundAutoApprovalThreshold` value so
 * callers always receive a number.
 *
 * Per-currency defaults live in `server/config.ts` and may be overridden at
 * startup via the `REFUND_THRESHOLDS_JSON` env var.
 */
export function getRefundThreshold(currency?: string | null): number {
  const fallback = config.commerce.refundAutoApprovalThreshold;
  if (!currency || typeof currency !== 'string') return fallback;
  const key = currency.trim().toUpperCase();
  if (!key) return fallback;
  const map = config.commerce.refundAutoApprovalThresholds || {};
  const value = map[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
