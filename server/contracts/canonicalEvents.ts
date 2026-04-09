import { createHash } from 'crypto';

export const eventCategories = ['commerce', 'support', 'payment', 'logistics', 'identity'] as const;
export type EventCategory = (typeof eventCategories)[number];

export const canonicalEventTypes = [
  'message.received',
  'message.sent',
  'ticket.created',
  'ticket.updated',
  'order.created',
  'order.updated',
  'order.cancelled',
  'payment.captured',
  'payment.refunded',
  'payment.disputed',
  'refund.created',
  'refund.completed',
  'return.requested',
  'return.received_at_warehouse',
  'shipment.created',
  'shipment.updated',
  'workflow.triggered',
  'approval.created',
  'approval.decided',
  'connector.health_changed',
] as const;

export type CanonicalEventType = (typeof canonicalEventTypes)[number];

export interface DedupeInput {
  sourceSystem: string;
  sourceEntityType: string;
  sourceEntityId: string;
  eventType: string;
  occurredAt: string;
  bucketSeconds?: number;
}

export function buildDedupeKey(input: DedupeInput): string {
  const bucket = input.bucketSeconds ?? 60;
  const ts = new Date(input.occurredAt).getTime();
  const bucketed = Number.isNaN(ts) ? input.occurredAt : String(Math.floor(ts / (bucket * 1000)));
  const plain = [
    input.sourceSystem,
    input.sourceEntityType,
    input.sourceEntityId,
    input.eventType,
    bucketed,
  ].join('|');
  return createHash('sha256').update(plain).digest('hex');
}

export interface IdempotencyInput {
  tenantId: string;
  caseId: string;
  actionType: string;
  entityId: string;
  amountCents?: number;
  currency?: string;
}

export function buildIdempotencyKey(input: IdempotencyInput): string {
  const plain = [
    input.tenantId,
    input.caseId,
    input.actionType,
    input.entityId,
    String(input.amountCents ?? ''),
    (input.currency ?? '').toUpperCase(),
  ].join('|');
  return createHash('sha256').update(plain).digest('hex');
}

