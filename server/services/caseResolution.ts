import crypto from 'crypto';
import { buildResolveView } from '../data/index.js';
import type { Plan, PlanStep } from '../agents/planEngine/types.js';

type ResolutionActionGroup =
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

type ResolutionRoute =
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

type StepExecution =
  | { kind: 'tool'; executable: true; tool: string; args: Record<string, unknown> }
  | { kind: 'navigate'; executable: false; targetPage: string; targetId?: string | null; reason: string }
  | { kind: 'blocked'; executable: false; reason: string };

export interface CaseResolutionStep {
  id: string;
  index: number;
  label: string;
  status: string;
  domain?: string | null;
  source?: string | null;
  context?: string | null;
  group: ResolutionActionGroup;
  title: string;
  explanation: string;
  expectedOutcome: string;
  route: ResolutionRoute;
  requiresApproval: boolean;
  execution: StepExecution;
}

export interface CaseResolutionPlan {
  hasSteps: boolean;
  headline: string;
  steps: CaseResolutionStep[];
  requiresApproval: boolean;
  impactedDomains: string[];
  caseId: string;
  caseNumber?: string | null;
}

const WEBHOOK_RE = /webhook\s+([\w.\-_]+)\s*(?:\(([^)]+)\))?\s*(?:via\s+([\w.\-_]+))?/i;

function titleCase(value?: string | null) {
  if (!value) return '';
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function pickDomain(step: any): string {
  return String(step?.domain || step?.source || step?.system || step?.namespace || 'system').toLowerCase();
}

function classify(step: any): { group: ResolutionActionGroup; route: ResolutionRoute } {
  const label = String(step?.label || '');
  const context = String(step?.context || '');
  const source = String(step?.source || step?.domain || '');
  const haystack = `${label} ${context} ${source}`.toLowerCase();

  const webhookMatch = label.match(WEBHOOK_RE) || context.match(WEBHOOK_RE);
  if (webhookMatch) {
    return {
      group: 'integration',
      route: {
        kind: 'webhook_ack',
        provider: String(webhookMatch[3] || source || 'integration').toLowerCase(),
        event: webhookMatch[1] || 'event',
      },
    };
  }

  if (/\brefund\b|\bcharge\.refunded\b/.test(haystack)) return { group: 'refund', route: { kind: 'refund' } };
  if (/\bapprov/.test(haystack)) return { group: 'approval', route: { kind: 'approval' } };
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
  if (/reconcil|sync|drift|mismatch/.test(haystack)) return { group: 'reconciliation', route: { kind: 'reconcile', domain: pickDomain(step) } };
  if (/return|rma/.test(haystack)) return { group: 'return', route: { kind: 'return_update' } };
  if (/order|fulfillment|shipment|cancel/.test(haystack)) return { group: 'order', route: { kind: 'order_update' } };
  if (/manual|review|investigat/.test(haystack)) return { group: 'manual', route: { kind: 'manual_review' } };
  if (/agent|copilot|ai\s|llm/.test(haystack)) return { group: 'agent', route: { kind: 'agent_dispatch' } };
  return { group: 'generic', route: { kind: 'generic' } };
}

function explainStep(step: any, group: ResolutionActionGroup, route: ResolutionRoute) {
  const label = String(step?.label || '');
  switch (group) {
    case 'integration':
      return {
        title: `Acknowledge ${(route as any).event || 'webhook'}`,
        explanation: `Records that ${(route as any).provider || 'the integration'} already delivered the event and adds a traceable case note instead of pretending to call the webhook again.`,
        expectedOutcome: 'The case timeline records that the integration event was acknowledged.',
      };
    case 'refund':
      return {
        title: 'Issue refund',
        explanation: 'Executes the refund through the Plan Engine payment tool. If policy requires it, an approval is created before money is moved.',
        expectedOutcome: 'The payment is refunded or a pending approval blocks execution safely.',
      };
    case 'approval':
      return {
        title: 'Open approval',
        explanation: 'Routes the user to the approval queue because this step cannot be resolved by silently mutating state.',
        expectedOutcome: 'A human reviewer approves or rejects the sensitive action.',
      };
    case 'notification':
      return {
        title: 'Notify customer',
        explanation: 'Sends a customer-facing update through the message pipeline with the case attached to the conversation.',
        expectedOutcome: 'The customer receives an update and the case timeline keeps the outbound message.',
      };
    case 'reconciliation':
      return {
        title: 'Resolve mismatch',
        explanation: 'Uses the reconciliation tool to close the concrete issue when one exists, otherwise refreshes the open issue list deterministically.',
        expectedOutcome: 'The conflict state is made explicit and the next step can rely on the canonical data.',
      };
    case 'order':
      return {
        title: 'Update order',
        explanation: 'Applies the deterministic order action available today. Cancellation is governed by policy and can require approval.',
        expectedOutcome: 'The order reaches the resolved state or approval is requested before changing it.',
      };
    case 'return':
      return {
        title: 'Update return',
        explanation: 'Moves the return to the next safe status through the registered return tool.',
        expectedOutcome: 'The return record is updated and audited.',
      };
    case 'manual':
      return {
        title: 'Escalate review',
        explanation: 'Moves the case to manual review with a note so a human can inspect the evidence.',
        expectedOutcome: 'The case is explicitly escalated instead of being marked done locally.',
      };
    case 'agent':
      return {
        title: 'Run agent',
        explanation: 'Invokes the first available catalog agent for this case, or blocks the step if no agent is configured.',
        expectedOutcome: 'The agent run is traced through the same execution runtime.',
      };
    default:
      return {
        title: titleCase(label) || 'Acknowledge step',
        explanation: 'Adds a traceable note for this generic resolution step.',
        expectedOutcome: 'The case timeline records the action deterministically.',
      };
  }
}

function findByText(items: any[], label: string, keys: string[]) {
  const haystack = label.toLowerCase();
  return items.find((item) => keys.some((key) => item?.[key] && haystack.includes(String(item[key]).toLowerCase()))) || items[0] || null;
}

function pickCustomerChannel(bundle: any, requested?: string) {
  if (requested && ['email', 'whatsapp', 'sms', 'web_chat'].includes(requested)) return requested;
  const channel = String(bundle.conversation?.channel || bundle.case?.source_channel || '').toLowerCase();
  if (['email', 'whatsapp', 'sms', 'web_chat'].includes(channel)) return channel;
  if (bundle.customer?.canonical_email || bundle.case?.customer_email) return 'email';
  return 'web_chat';
}

function pickReturnStatus(step: any) {
  const text = `${step?.label || ''} ${step?.context || ''}`.toLowerCase();
  if (/reject|declin|deny/.test(text)) return 'rejected';
  if (/refund/.test(text)) return 'refunded';
  if (/inspect/.test(text)) return 'inspected';
  if (/receiv/.test(text)) return 'received';
  if (/transit|ship/.test(text)) return 'in_transit';
  if (/cancel/.test(text)) return 'cancelled';
  return 'approved';
}

function buildExecution(bundle: any, step: any, group: ResolutionActionGroup, route: ResolutionRoute): StepExecution {
  const caseId = bundle.case.id;
  const label = String(step?.label || '');
  const recommendation = bundle.case.ai_recommended_action || buildResolveView(bundle).conflict?.recommended_action || label;

  if (route.kind === 'webhook_ack') {
    return {
      kind: 'tool',
      executable: true,
      tool: 'case.add_note',
      args: {
        caseId,
        content: `Resolution step acknowledged webhook ${route.event} from ${route.provider}.`,
      },
    };
  }

  if (route.kind === 'refund') {
    const payment = findByText(bundle.payments ?? [], label, ['id', 'external_payment_id', 'psp_reference']);
    if (!payment?.id) return { kind: 'blocked', executable: false, reason: 'No linked payment was found for this refund step.' };
    return {
      kind: 'tool',
      executable: true,
      tool: 'payment.refund',
      args: {
        paymentId: payment.id,
        amount: Number(payment.amount ?? payment.authorized_amount ?? 0) || undefined,
        reason: recommendation || 'Refund resolved from Case Graph',
      },
    };
  }

  if (route.kind === 'reconcile') {
    const issue = (bundle.reconciliation_issues ?? []).find((item: any) => String(item.status || 'open').toLowerCase() === 'open')
      || (bundle.reconciliation_issues ?? [])[0];
    if (!issue?.id) {
      return {
        kind: 'tool',
        executable: true,
        tool: 'reconciliation.list_issues',
        args: { caseId, status: 'open' },
      };
    }
    return {
      kind: 'tool',
      executable: true,
      tool: 'reconciliation.resolve_issue',
      args: {
        issueId: issue.id,
        targetStatus: issue.expected_state || issue.target_status || issue.source_of_truth || 'resolved',
        reason: recommendation || 'Resolved from Case Graph deterministic plan',
      },
    };
  }

  if (route.kind === 'order_update') {
    const order = findByText(bundle.orders ?? [], label, ['id', 'external_order_id']);
    if (!order?.id) return { kind: 'blocked', executable: false, reason: 'No linked order was found for this order step.' };
    if (/cancel|void/.test(`${label} ${recommendation}`.toLowerCase())) {
      return {
        kind: 'tool',
        executable: true,
        tool: 'order.cancel',
        args: {
          orderId: order.id,
          reason: recommendation || 'Cancelled from Case Graph deterministic plan',
          currentStatus: order.fulfillment_status || order.status || undefined,
        },
      };
    }
    return {
      kind: 'tool',
      executable: true,
      tool: 'case.add_note',
      args: { caseId, content: `Order step requires a configured order write tool: ${label}` },
    };
  }

  if (route.kind === 'return_update') {
    const returnItem = findByText(bundle.returns ?? [], label, ['id', 'external_return_id']);
    if (!returnItem?.id) return { kind: 'blocked', executable: false, reason: 'No linked return was found for this return step.' };
    return {
      kind: 'tool',
      executable: true,
      tool: 'return.update_status',
      args: {
        returnId: returnItem.id,
        status: pickReturnStatus(step),
        note: recommendation || 'Updated from Case Graph deterministic plan',
      },
    };
  }

  if (route.kind === 'notification') {
    if (!bundle.case.customer_id) return { kind: 'blocked', executable: false, reason: 'No customer is linked to this case.' };
    return {
      kind: 'tool',
      executable: true,
      tool: 'message.send_to_customer',
      args: {
        customerId: bundle.case.customer_id,
        caseId,
        channel: pickCustomerChannel(bundle, route.channel),
        subject: `Update on ${bundle.case.case_number || 'your case'}`,
        message: `We are working on ${bundle.case.case_number || 'your case'}. ${recommendation || 'We will keep you updated as the resolution progresses.'}`,
      },
    };
  }

  if (route.kind === 'approval') {
    const approval = (bundle.approvals ?? []).find((item: any) => String(item.status || '').toLowerCase() === 'pending')
      || (bundle.approvals ?? [])[0];
    return {
      kind: 'navigate',
      executable: false,
      targetPage: 'approvals',
      targetId: approval?.id ?? null,
      reason: 'This step requires a human approval decision.',
    };
  }

  if (route.kind === 'agent_dispatch') {
    const agent = (bundle.agents ?? []).find((item: any) => item?.slug && item?.is_active !== false) || (bundle.agents ?? [])[0];
    if (!agent?.slug) return { kind: 'blocked', executable: false, reason: 'No active catalog agent is configured for dispatch.' };
    return {
      kind: 'tool',
      executable: true,
      tool: 'agent.run',
      args: {
        agentSlug: agent.slug,
        caseId,
        triggerEvent: 'case_graph.resolve',
        extraContext: { stepLabel: label, recommendation },
      },
    };
  }

  if (route.kind === 'manual_review') {
    return {
      kind: 'tool',
      executable: true,
      tool: 'case.update_status',
      args: {
        caseId,
        status: 'escalated',
        reason: recommendation || 'Escalated for manual review from Case Graph',
      },
    };
  }

  return {
    kind: 'tool',
    executable: true,
    tool: 'case.add_note',
    args: {
      caseId,
      content: `Resolution step completed from Case Graph: ${label || 'Generic step'}`,
    },
  };
}

export function buildCaseResolutionPlan(bundle: any): CaseResolutionPlan {
  const resolveView = buildResolveView(bundle);
  const rawSteps = Array.isArray(resolveView?.execution?.steps) ? resolveView.execution.steps : [];
  const requiresApproval = Boolean(resolveView?.execution?.requires_approval);

  const steps = rawSteps.map((step: any, index: number): CaseResolutionStep => {
    const { group, route } = classify(step);
    const copy = explainStep(step, group, route);
    const execution = buildExecution(bundle, step, group, route);
    return {
      id: String(step?.id || `step-${index}`),
      index,
      label: String(step?.label || `Step ${index + 1}`),
      status: String(step?.status || 'pending'),
      domain: step?.domain ?? null,
      source: step?.source ?? null,
      context: step?.context ?? null,
      group,
      route,
      requiresApproval: requiresApproval || group === 'approval' || ['payment.refund', 'order.cancel', 'message.send_to_customer'].includes((execution as any).tool),
      ...copy,
      execution,
    };
  });

  const blockers = Array.isArray(resolveView?.blockers) ? resolveView.blockers : [];
  const conflictTitle = resolveView?.conflict?.title || 'Resolve case';
  const impactedDomains = Array.from(new Set(steps.map((step) => (step.domain || step.source || step.group || '').toLowerCase()).filter(Boolean)));

  return {
    hasSteps: steps.length > 0,
    headline: blockers.length ? `${conflictTitle} - ${blockers.length} blocker${blockers.length === 1 ? '' : 's'} to clear` : conflictTitle,
    steps,
    requiresApproval: steps.some((step) => step.requiresApproval),
    impactedDomains,
    caseId: bundle.case.id,
    caseNumber: bundle.case.case_number ?? null,
  };
}

export function buildPlanFromResolutionSteps(input: {
  caseId: string;
  sessionId?: string;
  steps: CaseResolutionStep[];
  rationale: string;
}): Plan {
  const executableSteps = input.steps.filter((step) => step.execution.kind === 'tool') as Array<CaseResolutionStep & { execution: Extract<StepExecution, { kind: 'tool' }> }>;
  const planSteps: PlanStep[] = executableSteps.map((step, index) => ({
    id: step.id.replace(/[^a-zA-Z0-9_-]/g, '_') || `step_${index}`,
    tool: step.execution.tool,
    args: step.execution.args,
    dependsOn: index === 0 ? [] : [executableSteps[index - 1].id.replace(/[^a-zA-Z0-9_-]/g, '_') || `step_${index - 1}`],
    rationale: step.explanation,
  }));

  return {
    planId: crypto.randomUUID(),
    sessionId: input.sessionId || `case-resolution-${input.caseId}`,
    createdAt: new Date().toISOString(),
    steps: planSteps,
    confidence: 0.92,
    rationale: input.rationale,
    needsApproval: input.steps.some((step) => step.requiresApproval),
    responseTemplate: 'Case resolution plan executed by the Plan Engine.',
  };
}

export function buildCaseResolutionPrompt(bundle: any, plan: CaseResolutionPlan) {
  const resolveView = buildResolveView(bundle);
  const lines = [
    `Resolve case ${bundle.case.case_number || bundle.case.id}.`,
    `Conflict: ${resolveView?.conflict?.title || 'open case'}.`,
    resolveView?.conflict?.summary ? `Summary: ${resolveView.conflict.summary}` : null,
    resolveView?.conflict?.root_cause ? `Root cause: ${resolveView.conflict.root_cause}` : null,
    '',
    'Deterministic plan:',
    ...plan.steps.map((step) => `${step.index + 1}. [${step.group}] ${step.title}: ${step.explanation}`),
    '',
    'Execute safe steps through registered tools, route sensitive actions to approval, and leave a trace for every state change.',
  ].filter((line): line is string => line !== null);

  return lines.join('\n');
}
