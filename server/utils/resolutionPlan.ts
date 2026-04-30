/**
 * Deterministic resolution plan builder.
 *
 * Given the canonical resolve payload for a case, returns an enriched plan
 * where every step carries a customer-readable explanation, an action group
 * (so the UI can choose icons/colors), and the suggested execution route the
 * SaaS should take when the user clicks "Run". The route is what makes the
 * algorithm deterministic: identical canonical inputs always map to identical
 * routes, while different cases produce different paths.
 *
 * The same enriched plan is fed to the AI resolution prompt so the agent
 * receives the exact same context the user sees.
 */

export type ResolutionActionGroup =
  | 'integration'
  | 'order'
  | 'payment'
  | 'refund'
  | 'return'
  | 'reconciliation'
  | 'approval'
  | 'notification'
  | 'agent'
  | 'manual'
  | 'generic';

export type ResolutionRoute =
  | { kind: 'webhook_ack'; provider: string; event: string }
  | { kind: 'refund'; orderId?: string | null; paymentId?: string | null }
  | { kind: 'reconcile'; domain: string }
  | { kind: 'order_update'; orderId?: string | null }
  | { kind: 'return_update'; returnId?: string | null }
  | { kind: 'notification'; channel?: string }
  | { kind: 'approval'; approvalId?: string | null }
  | { kind: 'agent_dispatch' }
  | { kind: 'manual_review' }
  | { kind: 'generic' };

export interface ResolutionStep {
  id: string;
  index: number;
  label: string;
  status: string;
  domain?: string | null;
  source?: string | null;
  context?: string | null;
  group: ResolutionActionGroup;
  /** Short customer-readable title (≤ 6 words). */
  title: string;
  /** Customer-readable explanation of what this step will do. */
  explanation: string;
  /** What the user/system gains once the step is complete. */
  expectedOutcome: string;
  /** Deterministic route describing how this step should be executed. */
  route: ResolutionRoute;
  requiresApproval: boolean;
}

export interface ResolutionPlan {
  /** True when the canonical state actually carries a plan. */
  hasSteps: boolean;
  /** Plan headline derived from the conflict + blockers. */
  headline: string;
  steps: ResolutionStep[];
  requiresApproval: boolean;
  /** A short list of impacted domains (orders, payments, ...). */
  impactedDomains: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const WEBHOOK_RE = /webhook\s+([\w.\-_]+)\s*(?:\(([^)]+)\))?\s*(?:via\s+([\w.\-_]+))?/i;
const ORDER_REF_RE = /\b(?:ORD|ORDER)[-_][\w-]+/i;
const RETURN_REF_RE = /\b(?:RTN|RET|RETURN)[-_][\w-]+/i;
const PAYMENT_REF_RE = /\b(?:PAY|PI|CH|CHARGE)[-_][\w-]+/i;
const APPROVAL_REF_RE = /\b(?:APR|APPR|APPROVAL)[-_][\w-]+/i;

function pickDomain(step: any): string {
  return (
    step?.domain ||
    step?.source ||
    step?.system ||
    step?.namespace ||
    'system'
  ).toLowerCase();
}

function titleCase(value?: string | null): string {
  if (!value) return '';
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function classify(step: any): { group: ResolutionActionGroup; route: ResolutionRoute } {
  const label: string = step?.label || '';
  const context: string = step?.context || '';
  const source: string = step?.source || step?.domain || '';
  const haystack = `${label} ${context} ${source}`.toLowerCase();

  // Webhook acknowledgements
  const webhookMatch = label.match(WEBHOOK_RE) || context.match(WEBHOOK_RE);
  if (webhookMatch) {
    const event = webhookMatch[1] || 'event';
    const provider = (webhookMatch[3] || source || 'integration').toLowerCase();
    return {
      group: 'integration',
      route: { kind: 'webhook_ack', provider, event },
    };
  }

  // Refund-related steps come first because they often live under "payments".
  if (/\brefund\b|\bcharge\.refunded\b/.test(haystack)) {
    const orderId = label.match(ORDER_REF_RE)?.[0] ?? null;
    const paymentId = label.match(PAYMENT_REF_RE)?.[0] ?? null;
    return { group: 'refund', route: { kind: 'refund', orderId, paymentId } };
  }

  // Approvals
  if (/\bapprov/.test(haystack)) {
    const approvalId = label.match(APPROVAL_REF_RE)?.[0] ?? null;
    return { group: 'approval', route: { kind: 'approval', approvalId } };
  }

  // Notifications
  if (/notif|email|whatsapp|sms|message/.test(haystack)) {
    const channel = /whatsapp/.test(haystack)
      ? 'whatsapp'
      : /sms/.test(haystack)
      ? 'sms'
      : /email/.test(haystack)
      ? 'email'
      : undefined;
    return { group: 'notification', route: { kind: 'notification', channel } };
  }

  // Reconciliation
  if (/reconcil|sync|drift|mismatch/.test(haystack)) {
    const domain = pickDomain(step);
    return { group: 'reconciliation', route: { kind: 'reconcile', domain } };
  }

  // Return management
  if (/return|rma/.test(haystack)) {
    const returnId = label.match(RETURN_REF_RE)?.[0] ?? null;
    return { group: 'return', route: { kind: 'return_update', returnId } };
  }

  // Order management
  if (/order|fulfillment|shipment|cancel/.test(haystack)) {
    const orderId = label.match(ORDER_REF_RE)?.[0] ?? null;
    return { group: 'order', route: { kind: 'order_update', orderId } };
  }

  // Manual review fallbacks
  if (/manual|review|investigat/.test(haystack)) {
    return { group: 'manual', route: { kind: 'manual_review' } };
  }

  // Agent dispatch fallback
  if (/agent|copilot|ai\s|llm/.test(haystack)) {
    return { group: 'agent', route: { kind: 'agent_dispatch' } };
  }

  return { group: 'generic', route: { kind: 'generic' } };
}

function explainStep(step: any, group: ResolutionActionGroup, route: ResolutionRoute) {
  const label: string = step?.label || '';
  const provider = route.kind === 'webhook_ack' ? route.provider : null;
  const event = route.kind === 'webhook_ack' ? route.event : null;

  switch (group) {
    case 'integration':
      return {
        title: `Acknowledge ${event ?? 'webhook'} from ${titleCase(provider) || 'integration'}`,
        explanation: `The CRM ingests the ${event ?? 'webhook'} event coming from ${titleCase(provider) || 'the connected integration'} and updates the canonical record so the next step works against accurate data.`,
        expectedOutcome: `Canonical state shows the latest ${event ?? 'event'} payload and dependent systems can rely on it.`,
      };
    case 'refund':
      return {
        title: 'Issue refund',
        explanation: `The CRM contacts the payment processor to refund the customer for ${
          route.kind === 'refund' && route.orderId ? `order ${route.orderId}` : 'this case'
        }. The OMS, accounting and customer profile are kept in sync once the PSP confirms the operation.`,
        expectedOutcome: 'Refund is settled in the PSP, the order ledger is balanced and the customer is notified.',
      };
    case 'approval':
      return {
        title: 'Request approval',
        explanation: 'The action is sensitive enough to require human sign-off, so the CRM creates an approval request, blocks dependent steps and notifies the responsible reviewer.',
        expectedOutcome: 'A reviewer either approves or rejects the request before any state-changing action is executed.',
      };
    case 'notification':
      return {
        title: 'Notify customer',
        explanation: `The CRM sends the customer-facing message${
          route.kind === 'notification' && route.channel ? ` over ${route.channel}` : ''
        } using a policy-approved template, leaving an audit trail in the case timeline.`,
        expectedOutcome: 'Customer receives the update and the timeline records the delivery confirmation.',
      };
    case 'reconciliation':
      return {
        title: 'Reconcile systems',
        explanation: 'The CRM pulls authoritative data from the source-of-truth system and rewrites the divergent fields in the dependent systems so every integration tells the same story.',
        expectedOutcome: 'OMS, PSP and CRM agree on the same state and the conflict flag is cleared.',
      };
    case 'order':
      return {
        title: 'Update order',
        explanation: `The CRM updates the order${
          route.kind === 'order_update' && route.orderId ? ` ${route.orderId}` : ''
        } to reflect the resolution decision (cancellation, address change, line item adjustment, etc.) and propagates the change to fulfillment and billing.`,
        expectedOutcome: 'OMS shows the new order state and downstream systems are synchronised.',
      };
    case 'return':
      return {
        title: 'Update return',
        explanation: `The CRM moves the return${
          route.kind === 'return_update' && route.returnId ? ` ${route.returnId}` : ''
        } to its next state (received, inspected, approved or rejected) and triggers the refund flow if applicable.`,
        expectedOutcome: 'Return record is up to date and any required refund has been queued.',
      };
    case 'manual':
      return {
        title: 'Manual review',
        explanation: 'A human agent has to inspect this evidence before the system can move forward. The CRM assembles the relevant data and surfaces it for review.',
        expectedOutcome: 'The case is annotated with the reviewer decision and the next deterministic step becomes runnable.',
      };
    case 'agent':
      return {
        title: 'Dispatch AI agent',
        explanation: `The Super Agent picks up this step${
          label ? ` ("${label}")` : ''
        } with full canonical context and either resolves it autonomously or asks for confirmation if the autonomy policy requires it.`,
        expectedOutcome: 'The step finishes with an audit trace describing every tool call the agent made.',
      };
    case 'generic':
    default:
      return {
        title: titleCase(label) || 'Execute step',
        explanation:
          step?.context ||
          'Runs the deterministic action defined by the canonical state for this case so the resolution can progress.',
        expectedOutcome: 'The step is acknowledged and the next item in the plan becomes runnable.',
      };
  }
}

// ── Public builder ─────────────────────────────────────────────────────────

export function buildResolutionPlan(caseResolve: any): ResolutionPlan {
  const rawSteps = Array.isArray(caseResolve?.execution?.steps)
    ? caseResolve.execution.steps
    : [];

  const requiresApproval = Boolean(caseResolve?.execution?.requires_approval);

  const steps: ResolutionStep[] = rawSteps.map((step: any, index: number) => {
    const { group, route } = classify(step);
    const { title, explanation, expectedOutcome } = explainStep(step, group, route);
    const stepRequiresApproval =
      requiresApproval || group === 'approval' || step?.requires_approval === true;

    return {
      id: String(step?.id || `step-${index}`),
      index,
      label: String(step?.label || `Step ${index + 1}`),
      status: String(step?.status || 'pending'),
      domain: step?.domain ?? null,
      source: step?.source ?? null,
      context: step?.context ?? null,
      group,
      title,
      explanation,
      expectedOutcome,
      route,
      requiresApproval: stepRequiresApproval,
    };
  });

  const conflictTitle: string =
    caseResolve?.conflict?.title || 'Resolve case';
  const blockers: any[] = Array.isArray(caseResolve?.blockers)
    ? caseResolve.blockers
    : [];

  const headline = blockers.length
    ? `${conflictTitle} — ${blockers.length} blocker${blockers.length === 1 ? '' : 's'} to clear`
    : conflictTitle;

  const impactedDomains = Array.from(
    new Set(
      steps
        .map((s) => (s.domain || s.source || '').toLowerCase())
        .filter((d) => d.length > 0)
    )
  );

  return {
    hasSteps: steps.length > 0,
    headline,
    steps,
    requiresApproval: steps.some((s) => s.requiresApproval),
    impactedDomains,
  };
}

// ── AI prompt ──────────────────────────────────────────────────────────────

/**
 * Builds the prompt used when the user clicks "Resolve with AI". The prompt
 * is fully derived from the canonical state + deterministic plan so the
 * agent receives exactly the same picture the user sees on screen.
 */
export function buildAiResolutionPrompt(
  caseResolve: any,
  options: {
    caseLabel: string;
    customerName?: string | null;
  }
): string {
  const plan = buildResolutionPlan(caseResolve);
  const conflictTitle: string = caseResolve?.conflict?.title || 'open conflict';
  const conflictSummary: string = caseResolve?.conflict?.summary || '';
  const rootCause: string = caseResolve?.conflict?.root_cause || '';

  const lines: string[] = [];
  lines.push(
    `Resolve case ${options.caseLabel}${
      options.customerName ? ` (customer: ${options.customerName})` : ''
    }.`
  );
  lines.push(`Conflict: ${conflictTitle}.`);
  if (conflictSummary) lines.push(`Summary: ${conflictSummary}`);
  if (rootCause) lines.push(`Root cause: ${rootCause}`);

  if (plan.hasSteps) {
    lines.push('');
    lines.push('Deterministic plan to follow:');
    plan.steps.forEach((step) => {
      lines.push(
        `${step.index + 1}. [${step.group}] ${step.title} — ${step.explanation} Expected outcome: ${step.expectedOutcome}`
      );
    });
  }

  lines.push('');
  lines.push(
    'Execute the safe steps automatically, request approval for any sensitive action, and finish with a one-paragraph summary of what was done and what is still pending.'
  );

  return lines.join('\n');
}
