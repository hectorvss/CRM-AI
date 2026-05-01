/**
 * server/agents/planEngine/playbookRegistry.ts
 *
 * Predefined operational playbooks — recipes the Super Agent can run end-to-end
 * for common multi-step scenarios (fraud response, customer recovery, order
 * cancellation with refund, case resolution, churn prevention).
 *
 * A playbook is a deterministic template: a list of tool invocations whose
 * args are filled from the playbook's `parameters`. The LLM either:
 *   (a) discovers playbooks via `playbook.list` and emits a multi-step plan
 *       built from a template, OR
 *   (b) calls `playbook.execute` to run the playbook in one shot.
 *
 * Each step still goes through the registered ToolSpec (validation, audit),
 * so playbooks NEVER bypass policy or risk classification.
 */

export interface PlaybookParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  required: boolean;
  description: string;
}

export interface PlaybookStep {
  /** Stable id within the playbook ("p0", "p1", …). */
  id: string;
  /** Tool to invoke (must be registered in toolRegistry). */
  tool: string;
  /**
   * Arg template — string values may reference parameters via `{{paramName}}`
   * or prior step outputs via `{{stepId.path.to.value}}`.
   * The executor performs the substitution before validation.
   */
  args: Record<string, unknown>;
  /** Optional human rationale for this step (surfaced in explainability). */
  rationale: string;
  /** Step ids this step depends on (for ordering). */
  dependsOn?: string[];
  /** When true, a failure on this step does not abort the playbook. */
  continueOnFailure?: boolean;
}

export interface PlaybookDefinition {
  id: string;
  name: string;
  description: string;
  /** When this playbook is appropriate — used by the LLM to select it. */
  whenToUse: string;
  /** Parameter contract. */
  parameters: PlaybookParameter[];
  /** Ordered recipe of steps. */
  steps: PlaybookStep[];
  /** Tags for grouping / discovery. */
  tags: string[];
  /** Roughly: low / medium / high / critical — surfaces a UI hint. */
  riskHint: 'low' | 'medium' | 'high' | 'critical';
}

// ── Built-in playbooks ───────────────────────────────────────────────────────

const PLAYBOOKS: PlaybookDefinition[] = [
  // ── 1. Customer Recovery ─────────────────────────────────────────────────
  {
    id: 'customer_recovery',
    name: 'Customer Recovery',
    description:
      'Investigate a dissatisfied customer and proactively offer a refund + apology message. Closes any open case afterwards.',
    whenToUse:
      'A customer is unhappy (multiple cases, refund requests, complaint thread). Use to retain a high-LTV account.',
    parameters: [
      { name: 'customerId', type: 'string', required: true, description: 'UUID of the customer to recover' },
      { name: 'caseId', type: 'string', required: true, description: 'UUID of the active support case' },
      { name: 'paymentId', type: 'string', required: true, description: 'UUID of the payment to refund' },
      { name: 'refundAmount', type: 'number', required: true, description: 'Refund amount in the payment currency' },
      { name: 'apologyMessage', type: 'string', required: false, description: 'Override apology message (otherwise uses default template)' },
    ],
    steps: [
      {
        id: 'p0',
        tool: 'customer.get',
        args: { customerId: '{{customerId}}' },
        rationale: 'Load full customer profile to ground the recovery flow in current state.',
      },
      {
        id: 'p1',
        tool: 'payment.refund',
        args: { paymentId: '{{paymentId}}', amount: '{{refundAmount}}', reason: 'Customer recovery — proactive refund' },
        rationale: 'Issue the goodwill refund first so the apology message can reference a confirmed action.',
        dependsOn: ['p0'],
      },
      {
        id: 'p2',
        tool: 'message.send_to_customer',
        args: {
          customerId: '{{customerId}}',
          channel: 'email',
          subject: 'We are sorry — your refund is on its way',
          message: '{{apologyMessage}}',
          caseId: '{{caseId}}',
        },
        rationale: 'Send a personalised apology referencing the refund just issued.',
        dependsOn: ['p1'],
      },
      {
        id: 'p3',
        tool: 'case.add_note',
        args: { caseId: '{{caseId}}', content: 'Customer recovery playbook executed: refund issued + apology message sent.' },
        rationale: 'Document the recovery action for future agents.',
        dependsOn: ['p2'],
      },
      {
        id: 'p4',
        tool: 'case.update_status',
        args: { caseId: '{{caseId}}', status: 'resolved', reason: 'Customer recovery completed — refund + apology delivered.' },
        rationale: 'Close the case once the recovery action set is complete.',
        dependsOn: ['p3'],
      },
    ],
    tags: ['customer', 'retention', 'refund'],
    riskHint: 'medium',
  },

  // ── 2. Fraud Response ────────────────────────────────────────────────────
  {
    id: 'fraud_response',
    name: 'Fraud Response',
    description:
      'Mark a customer as fraud, cancel pending orders, escalate the case, and add a fraud note for the security team.',
    whenToUse:
      'Confirmed fraud signal: chargeback, stolen card, or matched fraud pattern. Use to immediately contain risk.',
    parameters: [
      { name: 'customerId', type: 'string', required: true, description: 'UUID of the fraudulent customer' },
      { name: 'caseId', type: 'string', required: true, description: 'UUID of the linked case (or a new escalation case)' },
      { name: 'orderIds', type: 'array', required: false, description: 'List of order UUIDs to cancel (optional — may be empty)' },
      { name: 'fraudReason', type: 'string', required: true, description: 'Short fraud reason (audit + note)' },
    ],
    steps: [
      {
        id: 'p0',
        tool: 'customer.update',
        args: { customerId: '{{customerId}}', riskLevel: 'critical' },
        rationale: 'Elevate customer risk level to critical so all future actions are gated.',
      },
      {
        id: 'p1',
        tool: 'order.bulk_cancel',
        args: { orderIds: '{{orderIds}}', reason: 'Fraud response: {{fraudReason}}' },
        rationale: 'Stop in-flight orders associated with the fraudulent account.',
        dependsOn: ['p0'],
        continueOnFailure: true,
      },
      {
        id: 'p2',
        tool: 'case.update_priority',
        args: { caseId: '{{caseId}}', priority: 'critical', reason: 'Fraud response triggered' },
        rationale: 'Bump case priority so a human reviewer picks it up immediately.',
        dependsOn: ['p0'],
      },
      {
        id: 'p3',
        tool: 'case.update_status',
        args: { caseId: '{{caseId}}', status: 'escalated', reason: 'Fraud response: {{fraudReason}}' },
        rationale: 'Move the case to escalated state for security team handover.',
        dependsOn: ['p2'],
      },
      {
        id: 'p4',
        tool: 'case.add_note',
        args: { caseId: '{{caseId}}', content: 'FRAUD RESPONSE — Customer flagged critical, pending orders cancelled. Reason: {{fraudReason}}' },
        rationale: 'Leave an explicit audit trail for the security/compliance team.',
        dependsOn: ['p3'],
      },
    ],
    tags: ['fraud', 'security', 'escalation'],
    riskHint: 'critical',
  },

  // ── 3. Order Cancellation with Refund ────────────────────────────────────
  {
    id: 'order_cancellation_with_refund',
    name: 'Order Cancellation + Refund',
    description: 'Cancel an order, issue a full refund on the linked payment, notify the customer, and close the related case.',
    whenToUse: 'Customer wants to cancel a paid order. Combines cancel + refund + notification into a single transaction.',
    parameters: [
      { name: 'orderId', type: 'string', required: true, description: 'UUID of the order to cancel' },
      { name: 'paymentId', type: 'string', required: true, description: 'UUID of the linked payment to refund' },
      { name: 'customerId', type: 'string', required: true, description: 'UUID of the customer (for notification)' },
      { name: 'caseId', type: 'string', required: false, description: 'Optional case UUID to close at the end' },
      { name: 'reason', type: 'string', required: true, description: 'Cancellation reason' },
    ],
    steps: [
      {
        id: 'p0',
        tool: 'order.cancel',
        args: { orderId: '{{orderId}}', reason: '{{reason}}' },
        rationale: 'Cancel the order on the commerce backend (Shopify + CRM).',
      },
      {
        id: 'p1',
        tool: 'payment.refund',
        args: { paymentId: '{{paymentId}}', reason: 'Order {{orderId}} cancelled: {{reason}}' },
        rationale: 'Issue the full refund tied to the cancellation.',
        dependsOn: ['p0'],
      },
      {
        id: 'p2',
        tool: 'message.send_to_customer',
        args: {
          customerId: '{{customerId}}',
          channel: 'email',
          subject: 'Your order has been cancelled and refunded',
          message: 'Your order has been cancelled per your request. The refund will reach your account in 3-5 business days.',
          caseId: '{{caseId}}',
        },
        rationale: 'Notify the customer with a clear cancel + refund confirmation.',
        dependsOn: ['p1'],
      },
      {
        id: 'p3',
        tool: 'case.update_status',
        args: { caseId: '{{caseId}}', status: 'resolved', reason: 'Order cancelled + refunded + customer notified' },
        rationale: 'Close the linked case once the customer has been informed.',
        dependsOn: ['p2'],
        continueOnFailure: true,
      },
    ],
    tags: ['order', 'refund', 'cancellation'],
    riskHint: 'high',
  },

  // ── 4. Case Resolution ───────────────────────────────────────────────────
  {
    id: 'case_resolution',
    name: 'Case Resolution',
    description: 'Mark a case as resolved, add a resolution note documenting the outcome, and send a confirmation message to the customer.',
    whenToUse: 'A case has been successfully resolved and you want to close it cleanly with full documentation.',
    parameters: [
      { name: 'caseId', type: 'string', required: true, description: 'UUID of the case to resolve' },
      { name: 'customerId', type: 'string', required: true, description: 'UUID of the customer (for confirmation message)' },
      { name: 'resolutionSummary', type: 'string', required: true, description: 'What was done to resolve the case' },
      { name: 'channel', type: 'string', required: false, description: 'Notification channel (email, whatsapp, sms). Default: email' },
    ],
    steps: [
      {
        id: 'p0',
        tool: 'case.add_note',
        args: { caseId: '{{caseId}}', content: 'RESOLUTION — {{resolutionSummary}}' },
        rationale: 'Document the resolution before changing status so context is preserved.',
      },
      {
        id: 'p1',
        tool: 'case.update_status',
        args: { caseId: '{{caseId}}', status: 'resolved', reason: '{{resolutionSummary}}' },
        rationale: 'Update case status to resolved.',
        dependsOn: ['p0'],
      },
      {
        id: 'p2',
        tool: 'message.send_to_customer',
        args: {
          customerId: '{{customerId}}',
          channel: '{{channel}}',
          subject: 'Your support case has been resolved',
          message: 'Your support case has been resolved. Summary: {{resolutionSummary}}. Reply if you need further help.',
          caseId: '{{caseId}}',
        },
        rationale: 'Confirm resolution to the customer through their preferred channel.',
        dependsOn: ['p1'],
      },
    ],
    tags: ['case', 'resolution', 'notification'],
    riskHint: 'low',
  },

  // ── 5. Churn Prevention ──────────────────────────────────────────────────
  {
    id: 'churn_prevention',
    name: 'Churn Prevention Outreach',
    description: 'Reach out to a dormant or at-risk customer with a re-engagement message and document the outreach as a case note.',
    whenToUse: 'A customer matches churn-risk signals (dormant, high refund/dispute rate, multiple open cases) and you want to retain them.',
    parameters: [
      { name: 'customerId', type: 'string', required: true, description: 'UUID of the at-risk customer' },
      { name: 'caseId', type: 'string', required: false, description: 'Optional case UUID where the outreach should be logged' },
      { name: 'reengagementMessage', type: 'string', required: true, description: 'Personalised re-engagement message' },
      { name: 'channel', type: 'string', required: false, description: 'Channel: email | whatsapp | sms (default email)' },
    ],
    steps: [
      {
        id: 'p0',
        tool: 'customer.get',
        args: { customerId: '{{customerId}}' },
        rationale: 'Load customer profile to validate they are still in retention scope.',
      },
      {
        id: 'p1',
        tool: 'message.send_to_customer',
        args: {
          customerId: '{{customerId}}',
          channel: '{{channel}}',
          subject: 'We miss you',
          message: '{{reengagementMessage}}',
          caseId: '{{caseId}}',
        },
        rationale: 'Send the re-engagement message through the customer\'s preferred channel.',
        dependsOn: ['p0'],
      },
      {
        id: 'p2',
        tool: 'case.add_note',
        args: { caseId: '{{caseId}}', content: 'Churn prevention outreach sent — see message log for content.' },
        rationale: 'Document the outreach so future agents see the retention attempt.',
        dependsOn: ['p1'],
        continueOnFailure: true,
      },
    ],
    tags: ['retention', 'churn', 'customer'],
    riskHint: 'low',
  },
];

// ── Public API ───────────────────────────────────────────────────────────────

export function listPlaybooks(): Array<Pick<PlaybookDefinition, 'id' | 'name' | 'description' | 'whenToUse' | 'tags' | 'riskHint'>> {
  return PLAYBOOKS.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    whenToUse: p.whenToUse,
    tags: p.tags,
    riskHint: p.riskHint,
  }));
}

export function getPlaybook(id: string): PlaybookDefinition | null {
  return PLAYBOOKS.find((p) => p.id === id) ?? null;
}

/**
 * Substitute `{{paramName}}` and `{{stepId.path}}` references in the args.
 * Strings are replaced wholesale when the placeholder fills the entire value
 * (so non-string params keep their type), or interpolated otherwise.
 */
export function interpolatePlaybookArgs(
  args: Record<string, unknown>,
  params: Record<string, unknown>,
  stepOutputs: Record<string, unknown>,
): Record<string, unknown> {
  function resolve(token: string): unknown {
    // Try parameter map first
    if (Object.prototype.hasOwnProperty.call(params, token)) return params[token];
    // Try dotted path on step outputs
    const [stepId, ...rest] = token.split('.');
    if (Object.prototype.hasOwnProperty.call(stepOutputs, stepId)) {
      let cur: any = stepOutputs[stepId];
      for (const k of rest) {
        if (cur == null) return undefined;
        cur = cur[k];
      }
      return cur;
    }
    return undefined;
  }

  function transform(value: unknown): unknown {
    if (typeof value === 'string') {
      const fullMatch = value.match(/^\{\{([^}]+)\}\}$/);
      if (fullMatch) {
        const resolved = resolve(fullMatch[1].trim());
        return resolved === undefined ? '' : resolved;
      }
      return value.replace(/\{\{([^}]+)\}\}/g, (_, token: string) => {
        const r = resolve(token.trim());
        return r == null ? '' : String(r);
      });
    }
    if (Array.isArray(value)) return value.map(transform);
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = transform(v);
      }
      return out;
    }
    return value;
  }

  return transform(args) as Record<string, unknown>;
}
