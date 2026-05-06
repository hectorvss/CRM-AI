import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { createAuditRepository } from '../data/audit.js';
import {
  attemptStripeRefundWriteback,
  attemptOrderCancelWriteback,
} from './connectorWriteback.js';

type ApprovalDecision = 'approved' | 'rejected';

export interface PostApprovalScope {
  tenantId: string;
  workspaceId: string;
}

export interface PostApprovalResult {
  caseId: string;
  decision: ApprovalDecision;
  shouldEnqueueExecution: boolean;
  affected: {
    orders: string[];
    payments: string[];
    returns: string[];
    agents: string[];
  };
}

function parseMaybeJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function asArray(value: unknown): string[] {
  const parsed = parseMaybeJson<unknown>(value, value);
  if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  if (typeof parsed === 'string' && parsed.trim()) return [parsed];
  return [];
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function mergeBadges(existing: unknown, additions: string[], removals: string[] = []): string[] {
  const current = asArray(existing);
  const remove = new Set(removals);
  return unique([...current.filter((badge) => !remove.has(badge)), ...additions]);
}

function stepsAreExecutable(steps: unknown): boolean {
  const parsed = parseMaybeJson<any[]>(steps, []);
  return parsed.length > 0 && parsed.every((step) => Boolean(step?.tool && step?.action));
}

function safeRunId(approvalId: string, slug: string, decision: ApprovalDecision): string {
  return `par_${approvalId}_${slug.replace(/[^a-z0-9]+/gi, '_')}_${decision}`.slice(0, 120);
}

async function chooseAgentIds(scope: PostApprovalScope, slugs: string[]): Promise<Map<string, string>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('agents')
    .select('id, slug, is_active')
    .eq('tenant_id', scope.tenantId)
    .in('slug', slugs);
  if (error) throw error;

  const preferred: Record<string, string> = {
    'approval-gatekeeper': 'agent_approval_gk',
    'workflow-runtime-agent': 'agent_workflow_runtime',
    'resolution-executor': 'agent_executor',
    'returns-agent': 'agent_returns',
    'stripe-connector': 'agent_stripe',
    'shopify-connector': 'agent_shopify',
    'oms-erp-agent': 'agent_oms_erp',
    'customer-communication-agent': 'agent_customer_communication',
    'composer-translator': 'agent_composer',
    'audit-observability': 'agent_audit',
  };

  const rows = data ?? [];
  const result = new Map<string, string>();
  for (const slug of slugs) {
    const exact = rows.find((row) => row.slug === slug && row.id === preferred[slug]);
    const active = rows.find((row) => row.slug === slug && row.is_active);
    const any = rows.find((row) => row.slug === slug);
    const selected = exact ?? active ?? any;
    if (selected) result.set(slug, selected.id);
  }
  return result;
}

async function upsertAgentRuns(scope: PostApprovalScope, input: {
  approvalId: string;
  caseId: string;
  decision: ApprovalDecision;
  evidenceRefs: string[];
  executablePlan: boolean;
}) {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const approved = input.decision === 'approved';
  const slugs = approved
    ? [
        'approval-gatekeeper',
        'workflow-runtime-agent',
        'resolution-executor',
        'returns-agent',
        'stripe-connector',
        'shopify-connector',
        'oms-erp-agent',
        'customer-communication-agent',
        'composer-translator',
        'audit-observability',
      ]
    : [
        'approval-gatekeeper',
        'workflow-runtime-agent',
        'customer-communication-agent',
        'composer-translator',
        'audit-observability',
      ];

  const agentIds = await chooseAgentIds(scope, slugs);
  const summaries: Record<string, string> = approved
    ? {
        'approval-gatekeeper': 'Human approval received; approval gate released the blocked action.',
        'workflow-runtime-agent': 'Workflow resumed after human approval and advanced past human_review.',
        'resolution-executor': input.executablePlan
          ? 'Approved execution plan is ready for queued tool execution.'
          : 'Approved non-tool plan was synchronized locally; external writeback remains explicit.',
        'returns-agent': 'Return state approved and unblocked for the replacement/refund path.',
        'stripe-connector': 'Stripe-side goodwill credit marked approved pending connector writeback.',
        'shopify-connector': 'Shopify-side replacement path marked approved pending connector writeback.',
        'oms-erp-agent': 'Back-office order, payment and return records aligned with the approval.',
        'customer-communication-agent': 'Customer update is safe to send after approval.',
        'composer-translator': 'Prepared a concise approved-resolution message objective.',
        'audit-observability': 'Post-approval state transition recorded for audit.',
      }
    : {
        'approval-gatekeeper': 'Human rejection received; approval gate stopped the blocked action.',
        'workflow-runtime-agent': 'Workflow closed the human_review branch after rejection.',
        'customer-communication-agent': 'Customer update is required to explain the rejection.',
        'composer-translator': 'Prepared a concise rejection message objective.',
        'audit-observability': 'Approval rejection recorded for audit.',
      };

  const rows = slugs
    .map((slug) => {
      const agentId = agentIds.get(slug);
      if (!agentId) return null;
      return {
        id: safeRunId(input.approvalId, slug, input.decision),
        case_id: input.caseId,
        tenant_id: scope.tenantId,
        workspace_id: scope.workspaceId,
        agent_id: agentId,
        agent_version_id: null,
        trigger_event: `approval_${input.decision}`,
        trigger_type: 'approval_event',
        status: 'completed',
        outcome_status: 'completed',
        confidence: 1,
        summary: summaries[slug],
        output: {
          decision: input.decision,
          approval_id: input.approvalId,
          executable_plan: input.executablePlan,
          post_approval_sync: true,
        },
        evidence_refs: input.evidenceRefs,
        execution_decision: approved ? (slug.includes('connector') ? 'prepare_writeback' : 'proceed') : 'stop',
        tokens_used: 0,
        cost_credits: 0,
        error: null,
        error_message: null,
        started_at: now,
        ended_at: now,
        finished_at: now,
      };
    })
    .filter(Boolean);

  if (rows.length) {
    const { error } = await supabase.from('agent_runs').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  }

  const gatekeeperIds = ['agent_approval_gk', 'agent_approval_gatekeeper'].filter(Boolean);
  await supabase
    .from('agent_runs')
    .update({
      status: 'completed',
      outcome_status: 'completed',
      summary: approved
        ? 'Human approval received; gatekeeper released the action.'
        : 'Human rejection received; gatekeeper stopped the action.',
      execution_decision: approved ? 'proceed' : 'stop',
      ended_at: now,
      finished_at: now,
      error: null,
      error_message: null,
    })
    .eq('case_id', input.caseId)
    .eq('tenant_id', scope.tenantId)
    .in('agent_id', gatekeeperIds)
    .in('status', ['running', 'processing']);

  return slugs.filter((slug) => agentIds.has(slug));
}

async function insertCanonicalEvent(scope: PostApprovalScope, input: {
  approvalId: string;
  caseId: string;
  decision: ApprovalDecision;
}) {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await supabase.from('canonical_events').upsert({
    id: `ce_${input.approvalId}_${input.decision}`,
    dedupe_key: `approval:${input.approvalId}:${input.decision}`,
    tenant_id: scope.tenantId,
    workspace_id: scope.workspaceId,
    source_system: 'approval-engine',
    source_entity_type: 'approval_request',
    source_entity_id: input.approvalId,
    event_type: `approval_${input.decision}`,
    event_category: 'approvals',
    occurred_at: now,
    ingested_at: now,
    processed_at: now,
    canonical_entity_type: 'approval_request',
    canonical_entity_id: input.approvalId,
    correlation_id: input.caseId,
    case_id: input.caseId,
    normalized_payload: {
      approval_request_id: input.approvalId,
      case_id: input.caseId,
      decision: input.decision,
    },
    confidence: 1,
    mapping_version: '1.0',
    status: 'processed',
    updated_at: now,
  }, { onConflict: 'id' });
  if (error) throw error;
}

async function appendEntityEvents(scope: PostApprovalScope, input: {
  approvalId: string;
  decision: ApprovalDecision;
  orderIds: string[];
  paymentIds: string[];
  returnIds: string[];
}) {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const approved = input.decision === 'approved';
  const orderEvents = input.orderIds.map((orderId) => ({
    id: `oe_${input.approvalId}_${orderId}_${input.decision}`,
    order_id: orderId,
    type: approved ? 'approval_released' : 'approval_rejected',
    content: approved
      ? 'Manager approved replacement path; order is ready for connector writeback.'
      : 'Manager rejected the exception; order remains blocked from replacement execution.',
    system: 'Approval Engine',
    time: now,
    tenant_id: scope.tenantId,
  }));
  const paymentEvents = input.paymentIds.map((paymentId) => ({
    id: `pe_${input.approvalId}_${paymentId}_${input.decision}`,
    payment_id: paymentId,
    type: approved ? 'credit_approved' : 'credit_rejected',
    content: approved
      ? 'Goodwill credit approved pending payment connector writeback.'
      : 'Goodwill credit rejected by manager.',
    system: 'Approval Engine',
    time: now,
    tenant_id: scope.tenantId,
  }));
  const returnEvents = input.returnIds.map((returnId) => ({
    id: `re_${input.approvalId}_${returnId}_${input.decision}`,
    return_id: returnId,
    type: approved ? 'return_approved' : 'return_rejected',
    content: approved
      ? 'Return/replacement path approved after human review.'
      : 'Return exception rejected after human review.',
    system: 'Approval Engine',
    time: now,
    tenant_id: scope.tenantId,
  }));

  const writes = [
    orderEvents.length ? supabase.from('order_events').upsert(orderEvents, { onConflict: 'id' }) : null,
    paymentEvents.length ? supabase.from('payment_events').upsert(paymentEvents, { onConflict: 'id' }) : null,
    returnEvents.length ? supabase.from('return_events').upsert(returnEvents, { onConflict: 'id' }) : null,
  ].filter(Boolean) as any[];

  const results = await Promise.all(writes);
  for (const result of results) {
    if (result.error) throw result.error;
  }
}

export async function applyPostApprovalDecision(
  scope: PostApprovalScope,
  approval: any,
  decision: ApprovalDecision,
  decidedBy: string,
  note?: string,
): Promise<PostApprovalResult> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const actionPayload = parseMaybeJson<Record<string, any>>(approval.action_payload, {});

  const { data: caseRow, error: caseError } = await supabase
    .from('cases')
    .select('*')
    .eq('id', approval.case_id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (caseError) throw caseError;
  if (!caseRow) {
    return {
      caseId: approval.case_id,
      decision,
      shouldEnqueueExecution: false,
      affected: { orders: [], payments: [], returns: [], agents: [] },
    };
  }

  const orderIds = unique([actionPayload.order_id, ...asArray(caseRow.order_ids)]);
  const paymentIds = unique([actionPayload.payment_id, ...asArray(caseRow.payment_ids)]);
  const returnIds = unique([actionPayload.return_id, ...asArray(caseRow.return_ids)]);
  const approved = decision === 'approved';

  const { data: plan } = approval.execution_plan_id
    ? await supabase
        .from('execution_plans')
        .select('*')
        .eq('id', approval.execution_plan_id)
        .eq('tenant_id', scope.tenantId)
        .maybeSingle()
    : { data: null } as any;
  const executablePlan = Boolean(plan && stepsAreExecutable(plan.steps));

  const caseUpdate = approved
    ? {
        approval_state: 'approved',
        execution_state: executablePlan ? 'queued' : 'awaiting_external_writeback',
        resolution_state: executablePlan ? 'execution_queued' : 'approved_pending_writeback',
        ai_recommended_action: executablePlan
          ? 'Approval granted. Execute the approved resolution plan and monitor connector writeback.'
          : 'Approval granted. Order, payment and return are unblocked locally; connector writeback remains explicit.',
        has_reconciliation_conflicts: false,
        conflict_severity: null,
        updated_at: now,
        last_activity_at: now,
      }
    : {
        approval_state: 'rejected',
        execution_state: 'stopped',
        resolution_state: 'rejected',
        ai_recommended_action: 'Approval rejected. Do not issue the goodwill credit or replacement; notify the customer with the policy reason.',
        has_reconciliation_conflicts: false,
        conflict_severity: null,
        updated_at: now,
        last_activity_at: now,
      };

  const updates: any[] = [
    supabase.from('cases').update(caseUpdate).eq('id', caseRow.id).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId),
  ];

  if (approval.execution_plan_id) {
    updates.push(
      supabase
        .from('execution_plans')
        .update({
          status: approved ? (executablePlan ? 'approved' : 'completed') : 'rejected',
          started_at: approved ? (plan?.started_at ?? now) : plan?.started_at ?? null,
          completed_at: executablePlan ? plan?.completed_at ?? null : now,
        })
        .eq('id', approval.execution_plan_id)
        .eq('tenant_id', scope.tenantId),
    );
  }

  if (orderIds.length) {
    updates.push(
      supabase
        .from('orders')
        .update(approved
          ? {
              approval_status: 'approved',
              fulfillment_status: 'replacement_approved',
              has_conflict: false,
              conflict_detected: null,
              recommended_action: 'Proceed with the approved replacement and keep external writeback audited.',
              summary: 'Replacement approved after manager review; connector writeback pending.',
              badges: mergeBadges([], ['Delivered', 'Approved', 'Replacement Approved'], ['Policy Review', 'Approval Needed']),
              tab: 'all',
              updated_at: now,
              last_update: now,
            }
          : {
              approval_status: 'rejected',
              has_conflict: false,
              conflict_detected: null,
              recommended_action: 'Do not create a replacement; explain the policy decision to the customer.',
              summary: 'Replacement exception rejected after manager review.',
              badges: ['Delivered', 'Rejected'],
              tab: 'attention',
              updated_at: now,
              last_update: now,
            })
        .in('id', orderIds)
        .eq('tenant_id', scope.tenantId)
        .eq('workspace_id', scope.workspaceId),
    );
  }

  if (paymentIds.length) {
    updates.push(
      supabase
        .from('payments')
        .update(approved
          ? {
              approval_status: 'approved',
              refund_status: 'approved_pending_writeback',
              has_conflict: false,
              conflict_detected: null,
              recommended_action: 'Issue the approved goodwill credit through the payment connector.',
              summary: 'Goodwill credit approved; payment connector writeback pending.',
              badges: ['Captured', 'Approved', 'Goodwill Credit'],
              tab: 'refunds',
              reconciliation_details: {
                status: 'approved_pending_writeback',
                approval_request_id: approval.id,
                decided_by: decidedBy,
                decision_at: now,
              },
              updated_at: now,
              last_update: now,
            }
          : {
              approval_status: 'rejected',
              refund_status: 'rejected',
              has_conflict: false,
              conflict_detected: null,
              recommended_action: 'Do not issue the goodwill credit.',
              summary: 'Goodwill credit rejected after manager review.',
              badges: ['Captured', 'Rejected'],
              tab: 'all',
              reconciliation_details: {
                status: 'rejected',
                approval_request_id: approval.id,
                decided_by: decidedBy,
                decision_at: now,
              },
              updated_at: now,
              last_update: now,
            })
        .in('id', paymentIds)
        .eq('tenant_id', scope.tenantId)
        .eq('workspace_id', scope.workspaceId),
    );
  }

  if (returnIds.length) {
    updates.push(
      supabase
        .from('returns')
        .update(approved
          ? {
              status: 'approved',
              inspection_status: 'approved',
              refund_status: 'approved_pending_writeback',
              approval_status: 'approved',
              has_conflict: false,
              conflict_detected: null,
              recommended_action: 'Proceed with the approved replacement/credit workflow.',
              summary: 'Return approved after manager review; replacement and credit path unblocked.',
              badges: ['Received', 'Approved', 'Replacement Path'],
              tab: 'refund_pending',
              updated_at: now,
              last_update: now,
            }
          : {
              status: 'rejected',
              refund_status: 'rejected',
              approval_status: 'rejected',
              has_conflict: false,
              conflict_detected: null,
              recommended_action: 'Keep return closed for exception purposes and notify the customer.',
              summary: 'Return exception rejected after manager review.',
              badges: ['Received', 'Rejected'],
              tab: 'all',
              updated_at: now,
              last_update: now,
            })
        .in('id', returnIds)
        .eq('tenant_id', scope.tenantId)
        .eq('workspace_id', scope.workspaceId),
    );
  }

  const results = await Promise.all(updates);
  for (const result of results) {
    if (result.error) throw result.error;
  }

  // ── Re-execute the gated action when approval was granted ──────────────
  // The original /refund and /cancel routes flag approval_needed and bail out;
  // when the manager approves, we re-apply the action here and write a
  // dedicated audit row. Connector writeback (Stripe / Shopify) is deliberately
  // deferred — the connector marker rows above are the current contract.
  if (approved) {
    const requestType: string = approval.action_type ?? actionPayload.request_type ?? '';

    if (requestType === 'refund') {
      const targetPaymentId = String(actionPayload.payment_id ?? paymentIds[0] ?? '');
      const refundAmount = Number(actionPayload.amount ?? 0);
      if (targetPaymentId) {
        const { data: paymentRow, error: paymentLookupError } = await supabase
          .from('payments')
          .select('*')
          .eq('id', targetPaymentId)
          .eq('tenant_id', scope.tenantId)
          .eq('workspace_id', scope.workspaceId)
          .maybeSingle();
        if (paymentLookupError) throw paymentLookupError;
        if (paymentRow) {
          // ── Connector writeback FIRST ─────────────────────────────────
          // Try Stripe live before mutating the local row so we can capture
          // the real refund id in refund_ids (instead of a synthetic rf_*).
          // If Stripe rejects (already-refunded / disputed payment / API
          // outage) we still update DB so the manager's decision is honoured
          // locally and a `writeback_failed` flag flips on for reconciliation.
          const idempotencyKey = `approval-${approval.id}-refund`;
          const writeback = await attemptStripeRefundWriteback(
            scope,
            paymentRow,
            refundAmount,
            actionPayload.reason ?? 'Refund approved by manager',
            idempotencyKey,
          );

          const existingRefundIds = Array.isArray(paymentRow.refund_ids)
            ? paymentRow.refund_ids
            : asArray(paymentRow.refund_ids);
          const newRefundId = writeback.externalId ?? `rf_${randomUUID()}`;
          const isFull = refundAmount > 0 && refundAmount >= Number(paymentRow.amount ?? 0);
          const { error: refundUpdateError } = await supabase
            .from('payments')
            .update({
              status: 'refunded',
              refund_amount: refundAmount,
              refund_type: isFull ? 'full' : 'partial',
              refund_status: writeback.executedVia === 'stripe' ? 'succeeded' : 'writeback_pending',
              approval_status: 'approved',
              refund_ids: [...existingRefundIds, newRefundId],
              system_states: {
                ...(parseMaybeJson<Record<string, any>>(paymentRow.system_states, {})),
                canonical: 'refunded',
                crm_ai: 'refunded',
                psp: writeback.executedVia === 'stripe' ? 'refunded' : (paymentRow.system_states?.psp ?? 'pending_writeback'),
              },
              reconciliation_details: {
                approval_request_id: approval.id,
                writeback_executed_via: writeback.executedVia,
                writeback_external_id: writeback.externalId,
                writeback_error: writeback.error,
                writeback_at: now,
              },
              last_update: writeback.error
                ? `Refund approved locally; PSP writeback failed: ${writeback.error}`
                : (actionPayload.reason ?? 'Refund executed via approval'),
              updated_at: now,
            })
            .eq('id', targetPaymentId)
            .eq('tenant_id', scope.tenantId)
            .eq('workspace_id', scope.workspaceId);
          if (refundUpdateError) throw refundUpdateError;

          await createAuditRepository().log(scope, {
            actorId: decidedBy,
            actorType: 'human',
            action: writeback.error
              ? 'PAYMENT_REFUND_APPROVAL_WRITEBACK_FAILED'
              : 'PAYMENT_REFUNDED_VIA_APPROVAL',
            entityType: 'payment',
            entityId: targetPaymentId,
            oldValue: { status: paymentRow.status, approval_status: paymentRow.approval_status },
            newValue: {
              status: 'refunded',
              refund_amount: refundAmount,
              refund_id: newRefundId,
              executed_via: writeback.executedVia,
            },
            metadata: {
              approval_request_id: approval.id,
              reason: actionPayload.reason ?? null,
              executed_via: writeback.executedVia,
              connector_writeback: writeback.executedVia === 'stripe' ? 'completed' : 'pending',
              writeback_error: writeback.error,
              idempotency_key: idempotencyKey,
            },
          });
        }
      }
    } else if (requestType === 'order_cancel') {
      const targetOrderId = String(actionPayload.order_id ?? orderIds[0] ?? '');
      if (targetOrderId) {
        const { data: orderRow, error: orderLookupError } = await supabase
          .from('orders')
          .select('*')
          .eq('id', targetOrderId)
          .eq('tenant_id', scope.tenantId)
          .eq('workspace_id', scope.workspaceId)
          .maybeSingle();
        if (orderLookupError) throw orderLookupError;
        if (orderRow) {
          // ── Connector writeback — try Shopify, then Woo, then db-only ─
          const writeback = await attemptOrderCancelWriteback(
            scope,
            orderRow,
            actionPayload.reason ?? 'Cancellation approved by manager',
          );

          const { error: cancelUpdateError } = await supabase
            .from('orders')
            .update({
              status: 'cancelled',
              approval_status: 'approved',
              has_conflict: false,
              conflict_detected: null,
              recommended_action: writeback.executedVia === 'db-only'
                ? 'Cancellation approved; connector writeback pending or unavailable.'
                : `Cancellation executed via ${writeback.executedVia}.`,
              last_update: writeback.error
                ? `Cancellation approved locally; ${writeback.executedVia} writeback failed: ${writeback.error}`
                : (actionPayload.reason ?? 'Cancellation executed via approval'),
              system_states: {
                ...(parseMaybeJson<Record<string, any>>(orderRow.system_states, {})),
                canonical: 'cancelled',
                crm_ai: 'cancelled',
                oms: writeback.executedVia === 'shopify' || writeback.executedVia === 'woocommerce'
                  ? 'cancelled'
                  : (orderRow.system_states?.oms ?? 'pending_writeback'),
              },
              updated_at: now,
            })
            .eq('id', targetOrderId)
            .eq('tenant_id', scope.tenantId)
            .eq('workspace_id', scope.workspaceId);
          if (cancelUpdateError) throw cancelUpdateError;

          await createAuditRepository().log(scope, {
            actorId: decidedBy,
            actorType: 'human',
            action: writeback.error
              ? 'ORDER_CANCEL_APPROVAL_WRITEBACK_FAILED'
              : 'ORDER_CANCELLED_VIA_APPROVAL',
            entityType: 'order',
            entityId: targetOrderId,
            oldValue: { status: orderRow.status, approval_status: orderRow.approval_status },
            newValue: {
              status: 'cancelled',
              approval_status: 'approved',
              executed_via: writeback.executedVia,
            },
            metadata: {
              approval_request_id: approval.id,
              reason: actionPayload.reason ?? null,
              executed_via: writeback.executedVia,
              connector_writeback: writeback.executedVia === 'db-only' ? 'pending' : 'completed',
              writeback_error: writeback.error,
              writeback_external_id: writeback.externalId,
            },
          });
        }
      }
    }
  }

  if (approved && actionPayload.refund_id && paymentIds.length) {
    await supabase.from('refunds').upsert({
      id: String(actionPayload.refund_id),
      external_refund_id: actionPayload.external_refund_id ?? String(actionPayload.refund_id),
      payment_id: paymentIds[0],
      order_id: orderIds[0] ?? null,
      customer_id: caseRow.customer_id,
      tenant_id: scope.tenantId,
      amount: Number(actionPayload.goodwill_credit_amount ?? actionPayload.amount ?? 0),
      currency: actionPayload.currency ?? 'USD',
      type: 'partial',
      status: 'approved_pending_writeback',
      reason: actionPayload.reason ?? 'Approved goodwill credit',
      initiated_by: decidedBy,
      initiated_by_type: 'human',
      approval_request_id: approval.id,
      idempotency_key: `approval-${approval.id}-refund`,
      created_at: now,
      updated_at: now,
    }, { onConflict: 'id' });
  }

  const { data: workflows, error: workflowsError } = await supabase
    .from('workflow_runs')
    .select('*')
    .eq('case_id', caseRow.id)
    .eq('tenant_id', scope.tenantId)
    .order('started_at', { ascending: false });
  if (workflowsError) throw workflowsError;

  for (const workflow of workflows ?? []) {
    // If this workflow is suspended at a human_review node waiting to be resumed
    // (workflow.node.resume pattern), do NOT mark it as completed here.
    // The /runs/:runId/resume endpoint owns that transition — completing it here
    // would close the run prematurely before the downstream nodes execute.
    const isWaitingForResume = workflow.status === 'waiting' &&
      parseMaybeJson<Record<string, any>>(workflow.context, {})?.waiting_for === 'human_review';

    const nextNode = approved ? (executablePlan ? 'execution_queued' : 'external_writeback_pending') : 'approval_rejected';
    const workflowStatus = isWaitingForResume
      ? 'waiting'   // resume endpoint will advance it
      : (executablePlan && approved ? 'running' : 'completed');
    await supabase
      .from('workflow_runs')
      .update({
        status: workflowStatus,
        current_node_id: isWaitingForResume ? workflow.current_node_id : nextNode,
        context: {
          ...parseMaybeJson<Record<string, any>>(workflow.context, {}),
          approval_request_id: approval.id,
          approval_decision: decision,
          post_approval_sync_at: now,
          executable_plan: executablePlan,
        },
        ended_at: workflowStatus === 'completed' ? now : workflow.ended_at,
        error: null,
      })
      .eq('id', workflow.id)
      .eq('tenant_id', scope.tenantId);

    // Only mark the human_review step completed if this isn't a resume-type workflow.
    // For resume workflows the step completion happens inside the resume endpoint.
    if (!isWaitingForResume) {
      await supabase
        .from('workflow_run_steps')
        .update({
          status: 'completed',
          output: {
            decision,
            approval_request_id: approval.id,
            decided_by: decidedBy,
            note: note ?? null,
          },
          ended_at: now,
          error: null,
        })
        .eq('workflow_run_id', workflow.id)
        .eq('node_id', 'human_review');
    }

    await supabase.from('workflow_run_steps').upsert({
      id: `wfrs_${approval.id}_post_${decision}`,
      workflow_run_id: workflow.id,
      node_id: approved ? 'post_approval_sync' : 'post_rejection_sync',
      node_type: 'task',
      status: 'completed',
      input: { approval_request_id: approval.id, decision },
      output: {
        case_state: caseUpdate.execution_state,
        affected_orders: orderIds,
        affected_payments: paymentIds,
        affected_returns: returnIds,
      },
      started_at: now,
      ended_at: now,
      error: null,
    }, { onConflict: 'id' });
  }

  await supabase.from('case_status_history').insert({
    id: randomUUID(),
    case_id: caseRow.id,
    from_status: approved ? 'approval_approved' : 'approval_rejected',
    to_status: approved ? (executablePlan ? 'execution_queued' : 'external_writeback_pending') : 'execution_stopped',
    changed_by: 'post_approval_sync',
    changed_by_type: 'system',
    reason: approved
      ? 'Synchronized order, payment, return, workflow and agent state after human approval.'
      : 'Synchronized order, payment, return, workflow and agent state after human rejection.',
    created_at: now,
    tenant_id: scope.tenantId,
  });

  await supabase.from('internal_notes').upsert({
    id: `note_${approval.id}_post_${decision}`,
    case_id: caseRow.id,
    content: approved
      ? 'Manager approved the exception. Local order, payment and return state is unblocked; connector writeback remains explicit and auditable.'
      : 'Manager rejected the exception. No replacement or goodwill credit should be issued; send a concise policy-grounded response.',
    created_by: 'post_approval_sync',
    created_by_type: 'system',
    created_at: now,
    tenant_id: scope.tenantId,
    workspace_id: scope.workspaceId,
  }, { onConflict: 'id' });

  await insertCanonicalEvent(scope, { approvalId: approval.id, caseId: caseRow.id, decision });
  await appendEntityEvents(scope, { approvalId: approval.id, decision, orderIds, paymentIds, returnIds });

  const agents = await upsertAgentRuns(scope, {
    approvalId: approval.id,
    caseId: caseRow.id,
    decision,
    evidenceRefs: unique([approval.id, approval.policy_rule_id, approval.execution_plan_id, ...orderIds, ...paymentIds, ...returnIds]),
    executablePlan,
  });

  return {
    caseId: caseRow.id,
    decision,
    shouldEnqueueExecution: approved && executablePlan,
    affected: {
      orders: orderIds,
      payments: paymentIds,
      returns: returnIds,
      agents,
    },
  };
}

