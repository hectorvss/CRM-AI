import { createCanonicalRepository } from '../data/canonical.js';
import { createCaseRepository } from '../data/cases.js';
import { createCustomerRepository } from '../data/customers.js';
import { parseRow } from '../db/utils.js';
import { logger } from '../utils/logger.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type CanonicalHealth = 'healthy' | 'warning' | 'critical' | 'blocked' | 'pending' | 'resolved';

export interface CanonicalTimelineEntry {
  id: string;
  entry_type: string;
  type: string;
  domain: string;
  actor?: string | null;
  content: string;
  occurred_at: string;
  icon: string;
  severity: CanonicalHealth;
  source?: string | null;
}

export interface CanonicalNode {
  id: string;
  label: string;
  status: CanonicalHealth;
  source?: string | null;
  context?: string | null;
  value?: string | null;
  timestamp?: string | null;
}

export interface SystemStatusBranch {
  key: string;
  label: string;
  status: CanonicalHealth;
  source_of_truth?: string | null;
  summary?: string | null;
  identifiers: string[];
  nodes: CanonicalNode[];
}

export interface CaseChannelContext {
  conversation_id: string | null;
  channel: string;
  source_system: string;
  subject?: string | null;
  external_thread_id?: string | null;
  message_count: number;
  latest_message_preview?: string | null;
  latest_inbound_at?: string | null;
  latest_outbound_at?: string | null;
}

export interface CaseCanonicalState {
  snapshot_at: string;
  identifiers: {
    case_id: string;
    case_number: string;
    customer_id?: string | null;
    conversation_id?: string | null;
    order_ids: string[];
    payment_ids: string[];
    return_ids: string[];
    external_refs: string[];
  };
  case: any;
  customer: any | null;
  channel_context: CaseChannelContext;
  systems: Record<string, SystemStatusBranch>;
  conflict: {
    has_conflict: boolean;
    conflict_type?: string | null;
    root_cause?: string | null;
    source_of_truth?: string | null;
    recommended_action?: string | null;
    severity?: string | null;
    evidence_refs: string[];
  };
  related: {
    orders: any[];
    payments: any[];
    returns: any[];
    approvals: any[];
    reconciliation_issues: any[];
    linked_cases: any[];
  };
  timeline: CanonicalTimelineEntry[];
}

export interface CustomerCanonicalState {
  snapshot_at: string;
  customer: any;
  linked_identities: any[];
  metrics: {
    open_cases: number;
    total_cases: number;
    active_conflicts: number;
    total_orders: number;
    total_payments: number;
    total_returns: number;
    lifetime_value: number;
    total_spent: number;
  };
  systems: Record<string, SystemStatusBranch>;
  recent_cases: any[];
  unresolved_conflicts: any[];
}

export interface EntityCanonicalContext {
  entity_type: 'order' | 'payment' | 'return';
  entity_id: string;
  related_case: any | null;
  case_state: CaseCanonicalState | null;
  customer_state: CustomerCanonicalState | null;
}

export interface CaseGraphView {
  root: {
    case_id: string;
    case_number: string;
    order_id: string;
    customer_name: string;
    risk_level: string;
    status: string;
  };
  branches: SystemStatusBranch[];
  timeline: any[];
}

export interface CaseResolveView {
  case_id: string;
  case_number: string;
  status: string;
  conflict: {
    title: string;
    summary: string;
    severity: CanonicalHealth;
    source_of_truth: string | null;
    root_cause: string | null;
    recommended_action: string | null;
  };
  blockers: any[];
  identifiers: any[];
  expected_post_resolution_state: any[];
  execution: {
    mode: 'manual' | 'ai';
    status: string;
    requires_approval: boolean;
    approval_state: string | null;
    plan_id: string | null;
    steps: any[];
  };
  linked_cases: any[];
  notes: any[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function compact<T>(items: (T | null | undefined)[]): T[] {
  return items.filter((i): i is T => i !== null && i !== undefined);
}

function statusFromFlags(hasConflict: boolean, riskLevel: string | null, status: string | null): CanonicalHealth {
  if (hasConflict) return 'critical';
  if (status === 'blocked' || status === 'error' || status === 'failed') return 'blocked';
  if (riskLevel === 'high' || status === 'pending_review' || status === 'approval_required') return 'warning';
  if (status === 'pending' || status === 'processing' || status === 'in_transit') return 'pending';
  return 'healthy';
}

function worstStatus(statuses: CanonicalHealth[]): CanonicalHealth {
  if (statuses.includes('critical')) return 'critical';
  if (statuses.includes('blocked')) return 'blocked';
  if (statuses.includes('warning')) return 'warning';
  if (statuses.includes('pending')) return 'pending';
  return 'healthy';
}

function toCanonicalHealth(status: string | null): CanonicalHealth {
  if (!status) return 'pending';
  switch (status.toLowerCase()) {
    case 'success':
    case 'completed':
    case 'resolved':
    case 'healthy':
    case 'shipped':
    case 'delivered':
    case 'captured':
      return 'healthy';
    case 'at_risk':
    case 'warning':
    case 'pending_review':
    case 'partially_refunded':
      return 'warning';
    case 'breached':
    case 'critical':
    case 'failed':
    case 'conflict':
    case 'blocked':
    case 'error':
    case 'disputed':
      return 'critical';
    case 'pending':
    case 'processing':
    case 'idle':
    case 'in_transit':
    case 'awaiting_return':
      return 'pending';
    default:
      return 'pending';
  }
}

function humanizeKey(key: string | null): string {
  if (!key) return 'N/A';
  return key.split(/[_-]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

// ── Main View Builders ──────────────────────────────────────────────────────

export async function getCaseCanonicalState(caseId: string, tenantId: string, workspaceId: string): Promise<CaseCanonicalState | null> {
  const scope = { tenantId, workspaceId };
  const canonRepo = createCanonicalRepository();
  const rows = await canonRepo.fetchCaseGraphRows(scope, caseId);

  if (!rows) return null;

  const {
    caseRow, orders, payments, returns,
    approvals, workflowRuns, reconciliationIssues, linkedCases,
    messages, statusHistory, canonicalEvents, orderEvents, returnEvents
  } = rows;

  const hasConflict = Boolean(caseRow.has_reconciliation_conflicts || reconciliationIssues.length > 0);
  const conflict = reconciliationIssues[0];

  const systems: Record<string, SystemStatusBranch> = {
    orders: {
      key: 'orders',
      label: 'Orders',
      status: worstStatus(orders.map((o: any) => statusFromFlags(Boolean(o.has_conflict), o.risk_level, o.status))),
      source_of_truth: 'OMS',
      summary: orders[0]?.summary || null,
      identifiers: orders.map((o: any) => o.external_order_id),
      nodes: orders.map((o: any) => ({
        id: o.id,
        label: o.external_order_id,
        status: statusFromFlags(Boolean(o.has_conflict), o.risk_level, o.status),
        source: 'OMS',
        value: o.status,
        timestamp: o.updated_at
      }))
    },
    payments: {
      key: 'payments',
      label: 'Payments',
      status: worstStatus(payments.map((p: any) => statusFromFlags(Boolean(p.has_conflict), p.risk_level, p.status))),
      source_of_truth: payments[0]?.psp || 'PSP',
      summary: payments[0]?.summary || null,
      identifiers: payments.map((p: any) => p.external_payment_id),
      nodes: payments.map((p: any) => ({
        id: p.id,
        label: p.external_payment_id || p.id,
        status: statusFromFlags(Boolean(p.has_conflict), p.risk_level, p.status),
        source: p.psp,
        value: p.status,
        timestamp: p.updated_at
      }))
    },
    returns: {
      key: 'returns',
      label: 'Returns',
      status: worstStatus(returns.map((r: any) => statusFromFlags(Boolean(r.has_conflict), r.risk_level, r.status))),
      source_of_truth: 'Returns Platform',
      summary: returns[0]?.summary || null,
      identifiers: returns.map((r: any) => r.external_return_id),
      nodes: returns.map((r: any) => ({
        id: r.id,
        label: r.external_return_id || r.id,
        status: statusFromFlags(Boolean(r.has_conflict), r.risk_level, r.status),
        source: 'Returns',
        value: r.status,
        timestamp: r.updated_at
      }))
    },
    fulfillment: {
      key: 'fulfillment',
      label: 'Fulfillment',
      status: worstStatus(orderEvents.filter((e: any) => e.event_type === 'fulfillment').map((e: any) => toCanonicalHealth(e.status))),
      summary: orderEvents.find((e: any) => e.event_type === 'fulfillment')?.details || null,
      identifiers: [],
      nodes: orderEvents.filter((e: any) => e.event_type === 'fulfillment').map((e: any) => ({
        id: e.id,
        label: e.event_type,
        status: toCanonicalHealth(e.status),
        source: e.system || 'WMS',
        value: e.status,
        timestamp: e.time
      }))
    },
    approvals: {
      key: 'approvals',
      label: 'Approvals',
      status: caseRow.approval_state === 'pending' ? 'warning' : 'healthy',
      summary: approvals.length > 0 ? `${approvals.length} requests` : 'No approvals',
      identifiers: [],
      nodes: approvals.map((a: any) => ({
        id: a.id,
        label: a.action_type,
        status: a.status === 'pending' ? 'warning' : 'healthy',
        source: 'Policy Engine',
        value: a.status,
        timestamp: a.created_at
      }))
    }
  };

  const channelContext: CaseChannelContext = {
    conversation_id: caseRow.conversation_id || null,
    channel: caseRow.conversation_channel || caseRow.source_channel || 'web_chat',
    source_system: caseRow.source_system || 'system',
    subject: caseRow.conversation_subject || null,
    external_thread_id: caseRow.external_thread_id || null,
    message_count: messages.length,
    latest_message_preview: messages[messages.length - 1]?.content || null,
    latest_inbound_at: messages.filter((m: any) => m.direction !== 'outbound').at(-1)?.sent_at || null,
    latest_outbound_at: messages.filter((m: any) => m.direction === 'outbound').at(-1)?.sent_at || null,
  };

  const timelineRows = [
    ...messages.map((m: any) => ({
      id: m.id,
      entry_type: 'message',
      type: m.direction === 'inbound' ? 'customer_message' : 'agent_response',
      domain: 'conversation',
      actor: m.sender_name || (m.direction === 'inbound' ? 'Customer' : 'Agent'),
      content: m.content,
      occurred_at: m.sent_at,
      icon: m.direction === 'inbound' ? 'message' : 'reply',
      severity: 'healthy' as CanonicalHealth,
      source: channelContext.channel
    })),
    ...statusHistory.map((h: any) => ({
      id: h.id,
      entry_type: 'status_change',
      type: 'status_history',
      domain: 'case',
      actor: h.changed_by,
      content: `Case status changed to ${h.to_status}`,
      occurred_at: h.created_at,
      icon: 'status',
      severity: 'healthy' as CanonicalHealth
    })),
    ...canonicalEvents.map((e: any) => ({
      id: e.id,
      entry_type: 'canonical_event',
      type: e.event_type,
      domain: e.event_category || 'system',
      actor: e.source_system,
      content: e.normalized_payload?.summary || e.event_type,
      occurred_at: e.occurred_at,
      icon: 'event',
      severity: toCanonicalHealth(e.status)
    })),
    ...reconciliationIssues.map((i: any) => ({
      id: i.id,
      entry_type: 'reconciliation_issue',
      type: i.issue_type,
      domain: 'reconciliation',
      actor: i.detected_by,
      content: i.summary || i.issue_type,
      occurred_at: i.detected_at,
      icon: 'alert',
      severity: toCanonicalHealth(i.severity)
    }))
  ];

  const sortedTimeline = timelineRows.sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());

  return {
    snapshot_at: new Date().toISOString(),
    identifiers: {
      case_id: caseRow.id,
      case_number: caseRow.case_number,
      customer_id: caseRow.customer_id,
      conversation_id: caseRow.conversation_id,
      order_ids: (caseRow.order_ids || []),
      payment_ids: (caseRow.payment_ids || []),
      return_ids: (caseRow.return_ids || []),
      external_refs: compact([caseRow.source_entity_id, ...orders.map((o: any) => o.external_order_id)])
    },
    case: caseRow,
    customer: caseRow.customers,
    channel_context: channelContext,
    systems,
    conflict: {
      has_conflict: hasConflict,
      conflict_type: caseRow.type,
      root_cause: caseRow.ai_root_cause || conflict?.summary || null,
      source_of_truth: conflict?.source_of_truth || null,
      recommended_action: caseRow.ai_recommended_action || conflict?.recommended_action || null,
      severity: caseRow.conflict_severity || conflict?.severity || null,
      evidence_refs: []
    },
    related: {
      orders,
      payments,
      returns,
      approvals,
      reconciliation_issues: reconciliationIssues,
      linked_cases: linkedCases
    },
    timeline: sortedTimeline
  };
}

export async function getCustomerCanonicalState(customerId: string, tenantId: string, workspaceId: string): Promise<CustomerCanonicalState | null> {
  const scope = { tenantId, workspaceId };
  const canonRepo = createCanonicalRepository();
  const data = await canonRepo.getCustomerState(scope, customerId);

  if (!data) return null;

  const { customer, linkedIdentities, allCases, orders, payments, returns } = data;

  const unresolvedConflicts = allCases
    .filter((item: any) => item.has_reconciliation_conflicts || item.conflict_severity || item.status === 'blocked')
    .map((item: any) => ({
      case_id: item.id,
      case_number: item.case_number,
      conflict_type: item.type,
      severity: item.conflict_severity || item.risk_level || 'warning',
      recommended_action: item.ai_recommended_action || null,
    }));

  const systems: Record<string, SystemStatusBranch> = {
    orders: {
      key: 'orders',
      label: 'Orders',
      status: worstStatus(orders.map((order: any) => statusFromFlags(Boolean(order.has_conflict), order.risk_level, order.status))),
      source_of_truth: 'OMS',
      summary: orders[0]?.summary || null,
      identifiers: compact(orders.map((order: any) => order.external_order_id)),
      nodes: orders.slice(0, 5).map((order: any) => ({
        id: order.id,
        label: order.external_order_id,
        status: statusFromFlags(Boolean(order.has_conflict), order.risk_level, order.status),
        source: 'orders',
        context: order.summary,
        value: order.status,
        timestamp: order.updated_at || order.order_date,
      })),
    },
    payments: {
      key: 'payments',
      label: 'Payments',
      status: worstStatus(payments.map((payment: any) => statusFromFlags(Boolean(payment.has_conflict), payment.risk_level, payment.status))),
      source_of_truth: payments[0]?.psp || 'PSP',
      summary: payments[0]?.summary || null,
      identifiers: compact(payments.map((payment: any) => payment.external_payment_id)),
      nodes: payments.slice(0, 5).map((payment: any) => ({
        id: payment.id,
        label: payment.external_payment_id || payment.id,
        status: statusFromFlags(Boolean(payment.has_conflict), payment.risk_level, payment.status),
        source: payment.psp,
        context: payment.summary,
        value: payment.status,
        timestamp: payment.updated_at || payment.created_at,
      })),
    },
    returns: {
      key: 'returns',
      label: 'Returns',
      status: worstStatus(returns.map((ret: any) => statusFromFlags(Boolean(ret.has_conflict), ret.risk_level, ret.status))),
      source_of_truth: 'Returns Platform',
      summary: returns[0]?.summary || null,
      identifiers: compact(returns.map((ret: any) => ret.external_return_id)),
      nodes: returns.slice(0, 5).map((ret: any) => ({
        id: ret.id,
        label: ret.external_return_id || ret.id,
        status: statusFromFlags(Boolean(ret.has_conflict), ret.risk_level, ret.status),
        source: 'returns',
        context: ret.summary,
        value: ret.status,
        timestamp: ret.updated_at || ret.created_at,
      })),
    },
    cases: {
      key: 'cases',
      label: 'Cases',
      status: worstStatus(allCases.map((item: any) => statusFromFlags(Boolean(item.has_reconciliation_conflicts), item.risk_level, item.status))),
      source_of_truth: 'Case Runtime',
      summary: allCases[0] ? `${allCases.length} recent cases` : 'No cases',
      identifiers: compact(allCases.map((item: any) => item.case_number)),
      nodes: allCases.slice(0, 5).map((item: any) => ({
        id: item.id,
        label: item.case_number,
        status: statusFromFlags(Boolean((item as any).has_reconciliation_conflicts), item.risk_level, item.status),
        source: 'cases',
        context: item.type,
        value: item.status,
        timestamp: item.updated_at,
      })),
    },
  };

  return {
    snapshot_at: new Date().toISOString(),
    customer,
    linked_identities: linkedIdentities,
    metrics: {
      open_cases: allCases.filter((item: any) => !['resolved', 'closed'].includes(item.status)).length,
      total_cases: allCases.length,
      active_conflicts: unresolvedConflicts.length,
      total_orders: orders.length,
      total_payments: payments.length,
      total_returns: returns.length,
      lifetime_value: Number(customer.lifetime_value || 0),
      total_spent: Number(customer.total_spent || 0),
    },
    systems,
    recent_cases: allCases.slice(0, 10),
    unresolved_conflicts: unresolvedConflicts,
  };
}

export async function buildCaseListSummary(caseId: string, tenantId: string, workspaceId: string) {
  const state = await getCaseCanonicalState(caseId, tenantId, workspaceId);
  if (!state) return null;

  return {
    latest_message_preview: state.channel_context.latest_message_preview,
    channel_context: state.channel_context,
    system_status_summary: {
      orders: state.systems.orders.status,
      payments: state.systems.payments.status,
      returns: state.systems.returns.status,
      fulfillment: state.systems.fulfillment?.status || 'N/A',
      approvals: state.systems.approvals?.status || 'N/A',
    },
    conflict_summary: state.conflict,
  };
}

export async function getOrderCanonicalContext(orderId: string, tenantId: string, workspaceId: string): Promise<EntityCanonicalContext | null> {
  const scope = { tenantId, workspaceId };
  const canonRepo = createCanonicalRepository();
  const relatedCase = await canonRepo.findCaseByLinkedEntity(scope, 'order', orderId);
  
  if (!relatedCase) {
    return {
      entity_type: 'order',
      entity_id: orderId,
      related_case: null,
      case_state: null,
      customer_state: null,
    };
  }

  const caseState = await getCaseCanonicalState(relatedCase.id, tenantId, workspaceId);
  const customerState = caseState?.identifiers.customer_id
    ? await getCustomerCanonicalState(caseState.identifiers.customer_id, tenantId, workspaceId)
    : null;

  return {
    entity_type: 'order',
    entity_id: orderId,
    related_case: relatedCase,
    case_state: caseState,
    customer_state: customerState,
  };
}

export async function getPaymentCanonicalContext(paymentId: string, tenantId: string, workspaceId: string): Promise<EntityCanonicalContext | null> {
  const scope = { tenantId, workspaceId };
  const canonRepo = createCanonicalRepository();
  const relatedCase = await canonRepo.findCaseByLinkedEntity(scope, 'payment', paymentId);
  
  if (!relatedCase) {
    return {
      entity_type: 'payment',
      entity_id: paymentId,
      related_case: null,
      case_state: null,
      customer_state: null,
    };
  }

  const caseState = await getCaseCanonicalState(relatedCase.id, tenantId, workspaceId);
  const customerState = caseState?.identifiers.customer_id
    ? await getCustomerCanonicalState(caseState.identifiers.customer_id, tenantId, workspaceId)
    : null;

  return {
    entity_type: 'payment',
    entity_id: paymentId,
    related_case: relatedCase,
    case_state: caseState,
    customer_state: customerState,
  };
}

export async function getReturnCanonicalContext(returnId: string, tenantId: string, workspaceId: string): Promise<EntityCanonicalContext | null> {
  const scope = { tenantId, workspaceId };
  const canonRepo = createCanonicalRepository();
  const relatedCase = await canonRepo.findCaseByLinkedEntity(scope, 'return', returnId);
  
  if (!relatedCase) {
    return {
      entity_type: 'return',
      entity_id: returnId,
      related_case: null,
      case_state: null,
      customer_state: null,
    };
  }

  const caseState = await getCaseCanonicalState(relatedCase.id, tenantId, workspaceId);
  const customerState = caseState?.identifiers.customer_id
    ? await getCustomerCanonicalState(caseState.identifiers.customer_id, tenantId, workspaceId)
    : null;

  return {
    entity_type: 'return',
    entity_id: returnId,
    related_case: relatedCase,
    case_state: caseState,
    customer_state: customerState,
  };
}

export async function buildCaseGraphView(caseId: string, tenantId: string, workspaceId: string): Promise<CaseGraphView | null> {
  const state = await getCaseCanonicalState(caseId, tenantId, workspaceId);
  if (!state) return null;

  return {
    root: {
      case_id: state.identifiers.case_id,
      case_number: state.identifiers.case_number,
      order_id: state.identifiers.order_ids[0] || state.identifiers.case_number,
      customer_name: state.customer?.canonical_name || state.case.customer_name || 'Unknown customer',
      risk_level: state.case.risk_level || 'low',
      status: state.conflict.has_conflict ? 'conflict_detected' : (state.case.status || 'open'),
    },
    branches: Object.values(state.systems).map(branch => ({
      id: branch.key,
      key: branch.key,
      label: branch.label,
      status: branch.status,
      source_of_truth: branch.source_of_truth,
      summary: branch.summary,
      identifiers: branch.identifiers,
      nodes: branch.nodes,
    })),
    timeline: state.timeline,
  };
}

export async function buildCaseTimeline(caseId: string, tenantId: string, workspaceId: string): Promise<CanonicalTimelineEntry[]> {
  const state = await getCaseCanonicalState(caseId, tenantId, workspaceId);
  return state?.timeline || [];
}

export async function buildCaseResolveView(caseId: string, tenantId: string, workspaceId: string): Promise<CaseResolveView | null> {
  const scope = { tenantId, workspaceId };
  const canonRepo = createCanonicalRepository();
  const state = await getCaseCanonicalState(caseId, tenantId, workspaceId);
  if (!state) return null;

  const executionPlan = await canonRepo.getExecutionPlan(scope, caseId);
  const internalNotes = await canonRepo.getInternalNotes(scope, caseId);

  const activeBlockers = Object.values(state.systems)
    .filter(branch => ['critical', 'blocked', 'warning', 'pending'].includes(branch.status))
    .map(branch => ({
      key: branch.key,
      label: branch.label,
      status: branch.status,
      summary: branch.summary,
      source_of_truth: branch.source_of_truth || null,
    }));

  const identifiers = [
    { label: 'Case ID', value: state.identifiers.case_number, source: 'case' },
    ...state.identifiers.order_ids.map(value => ({ label: 'Order ID', value, source: 'orders' })),
    ...state.identifiers.payment_ids.map(value => ({ label: 'Payment ID', value, source: 'payments' })),
    ...state.identifiers.return_ids.map(value => ({ label: 'Return ID', value, source: 'returns' })),
    ...state.identifiers.external_refs.map(value => ({ label: 'External Ref', value, source: 'integration' })),
  ];

  return {
    case_id: state.identifiers.case_id,
    case_number: state.identifiers.case_number,
    status: state.case.status,
    conflict: {
      title: state.conflict.conflict_type ? humanizeKey(state.conflict.conflict_type) : (state.conflict.has_conflict ? 'Conflict detected' : 'No active conflict'),
      summary: state.conflict.has_conflict ? (state.conflict.recommended_action || state.conflict.root_cause || 'Manual review required') : 'Systems are aligned.',
      severity: toCanonicalHealth(state.conflict.severity || (state.conflict.has_conflict ? 'critical' : 'healthy')),
      source_of_truth: state.conflict.source_of_truth || null,
      root_cause: state.conflict.root_cause || null,
      recommended_action: state.conflict.recommended_action || null,
    },
    blockers: activeBlockers,
    identifiers,
    expected_post_resolution_state: activeBlockers.length > 0 ? activeBlockers.map(b => ({ key: b.key, label: b.label, status: 'healthy', summary: 'Aligned' })) : [],
    execution: {
      mode: state.case.approval_state === 'pending' ? 'manual' : 'ai',
      status: executionPlan?.status || 'idle',
      requires_approval: state.case.approval_state === 'pending',
      approval_state: state.case.approval_state || null,
      plan_id: executionPlan?.id || null,
      steps: executionPlan?.steps || []
    },
    linked_cases: state.related.linked_cases,
    notes: internalNotes
  };
}

export async function buildApprovalContext(approvalId: string, tenantId: string, workspaceId: string) {
  const scope = { tenantId, workspaceId };
  const canonRepo = createCanonicalRepository();
  const approval = await canonRepo.getApprovalWithContext(scope, approvalId);
  
  if (!approval) return null;

  const caseState = await getCaseCanonicalState(approval.case_id, tenantId, workspaceId);
  const auditTrail = await canonRepo.getAuditTrail(scope, approval.case_id, approvalId);
  const resolveView = await buildCaseResolveView(approval.case_id, tenantId, workspaceId);

  return {
    approval,
    case_state: caseState,
    resolve: resolveView,
    audit_trail: auditTrail,
    policy: {
      id: approval.policy_rule_id || null,
      title: humanizeKey(approval.action_type || 'manual_review'),
      description: approval.decision_note || 'Approval required.',
      risk_level: approval.risk_level,
      requires_human: approval.status === 'pending'
    }
  };
}
