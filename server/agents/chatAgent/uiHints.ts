/**
 * server/agents/chatAgent/uiHints.ts
 *
 * Maps a completed tool call to a hint the frontend can act on — refresh the
 * view the agent just mutated, or navigate to the affected entity. This is the
 * server side of PostHog's `ui_payload` contract (a MaxTool returns
 * (content, artifact) and the frontend reacts to the artifact); here the hint
 * rides along on the `tool_result` SSE event.
 *
 * Only write/external tools that change something a view renders need a hint.
 * Unknown tools return null (no-op on the client).
 */

export interface UiHint {
  kind: 'refetch' | 'navigate';
  /** Logical entity type touched, e.g. 'case', 'order', 'payment'. */
  entityType?: string;
  /** Id of the affected entity, when the result exposes it. */
  entityId?: string;
  /** For navigate: the CRM view to switch to. */
  view?: string;
}

type HintFn = (args: Record<string, unknown>, result: unknown) => UiHint | null;

function idFrom(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === 'string' && c) return c;
    if (typeof c === 'number') return String(c);
  }
  return undefined;
}

function resultField(result: unknown, key: string): unknown {
  return result && typeof result === 'object' ? (result as Record<string, unknown>)[key] : undefined;
}

/**
 * Registry keyed by canonical tool name. Kept intentionally small — the
 * high-traffic writes an operator watches update in real time. Extend as new
 * write tools earn a place in the UI.
 */
const HINTS: Record<string, HintFn> = {
  'case.update_status': (args, result) => ({
    kind: 'refetch',
    entityType: 'case',
    entityId: idFrom(resultField(result, 'id'), args.caseId, args.case_id, args.id),
  }),
  'case.assign': (args, result) => ({
    kind: 'refetch',
    entityType: 'case',
    entityId: idFrom(resultField(result, 'id'), args.caseId, args.case_id, args.id),
  }),
  'case.reply': (args) => ({
    kind: 'refetch',
    entityType: 'case',
    entityId: idFrom(args.caseId, args.case_id, args.id),
  }),
  'case.add_note': (args) => ({
    kind: 'refetch',
    entityType: 'case',
    entityId: idFrom(args.caseId, args.case_id, args.id),
  }),
  'order.cancel': (args, result) => ({
    kind: 'refetch',
    entityType: 'order',
    entityId: idFrom(resultField(result, 'id'), args.orderId, args.order_id, args.id),
  }),
  'payment.refund': (args, result) => ({
    kind: 'refetch',
    entityType: 'payment',
    entityId: idFrom(resultField(result, 'id'), args.paymentId, args.payment_id, args.id),
  }),
  'return.approve': (args, result) => ({
    kind: 'refetch',
    entityType: 'return',
    entityId: idFrom(resultField(result, 'id'), args.returnId, args.return_id, args.id),
  }),
  'return.reject': (args, result) => ({
    kind: 'refetch',
    entityType: 'return',
    entityId: idFrom(resultField(result, 'id'), args.returnId, args.return_id, args.id),
  }),
  'approval.decide': () => ({ kind: 'refetch', entityType: 'approval' }),
  'customer.update': (args, result) => ({
    kind: 'refetch',
    entityType: 'customer',
    entityId: idFrom(resultField(result, 'id'), args.customerId, args.customer_id, args.id),
  }),
};

export function getUiHint(
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
  ok: boolean,
): UiHint | null {
  if (!ok) return null; // failed tool changed nothing
  const fn = HINTS[toolName];
  if (fn) return fn(args, result);
  // Generic fallback: any write to a namespaced entity → refetch that entity.
  return null;
}
