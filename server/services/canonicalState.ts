import { createCanonicalRepository } from '../data/index.js';
import { parseRow } from '../db/utils.js';

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
    messages: any[];
    internal_notes: any[];
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
  recent_cases: Array<{
    id: string;
    case_number: string;
    type: string;
    status: string;
    risk_level: string;
    updated_at: string;
  }>;
  unresolved_conflicts: Array<{
    case_id: string;
    case_number: string;
    conflict_type: string;
    severity: string;
    recommended_action?: string | null;
  }>;
}

export interface EntityCanonicalContext {
  entity_type: 'order' | 'payment' | 'return';
  entity_id: string;
  related_case: {
    id: string;
    case_number: string;
    type: string;
    status: string;
  } | null;
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
  branches: Array<{
    id: string;
    label: string;
    status: CanonicalHealth;
    source_of_truth?: string | null;
    summary?: string | null;
    identifiers: string[];
    nodes: CanonicalNode[];
  }>;
  timeline: CanonicalTimelineEntry[];
}

export interface CaseResolveView {
  case_id: string;
  case_number: string;
  status: string;
  conflict: {
    title: string;
    summary: string;
    severity: CanonicalHealth;
    source_of_truth?: string | null;
    root_cause?: string | null;
    recommended_action?: string | null;
  };
  blockers: Array<{
    key: string;
    label: string;
    status: CanonicalHealth;
    summary?: string | null;
    source_of_truth?: string | null;
  }>;
  identifiers: Array<{
    label: string;
    value: string;
    source?: string | null;
  }>;
  expected_post_resolution_state: Array<{
    key: string;
    label: string;
    status: 'healthy' | 'resolved';
    summary: string;
  }>;
  execution: {
    mode: 'ai' | 'manual';
    status: string;
    requires_approval: boolean;
    approval_state?: string | null;
    plan_id?: string | null;
    steps: Array<{
      id: string;
      label: string;
      status: CanonicalHealth;
      source?: string | null;
      context?: string | null;
    }>;
  };
  linked_cases: any[];
  notes: any[];
}

const SEVERITY_ORDER: Record<CanonicalHealth, number> = {
  healthy: 0,
  resolved: 1,
  pending: 2,
  warning: 3,
  blocked: 4,
  critical: 5,
};

const canonicalRepo = createCanonicalRepository();

function parseStates(input: any): Record<string, any> {
  if (!input) return {};
  if (typeof input === 'object') return input;
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
}

function toCanonicalHealth(value: string | null | undefined): CanonicalHealth {
  const normalized = (value || '').toLowerCase();
  if (!normalized) return 'pending';
  if (['healthy', 'ok', 'success', 'completed', 'paid', 'captured', 'fulfilled', 'delivered', 'approved', 'received', 'synced'].includes(normalized)) return 'healthy';
  if (['resolved', 'closed'].includes(normalized)) return 'resolved';
  if (['pending', 'new', 'queued', 'requested', 'review', 'in_review', 'awaiting_approval', 'in_transit', 'waiting'].includes(normalized)) return 'pending';
  if (['warning', 'at_risk', 'medium', 'disputed', 'inspection_failed'].includes(normalized)) return 'warning';
  if (['blocked', 'failed', 'rejected', 'expired'].includes(normalized)) return 'blocked';
  if (['critical', 'conflict', 'high', 'urgent', 'breached'].includes(normalized)) return 'critical';
  return 'pending';
}

function worstStatus(statuses: Array<CanonicalHealth | null | undefined>): CanonicalHealth {
  return statuses
    .filter(Boolean)
    .reduce<CanonicalHealth>((worst, current) => {
      const safeCurrent = current || 'healthy';
      return SEVERITY_ORDER[safeCurrent] > SEVERITY_ORDER[worst] ? safeCurrent : worst;
    }, 'healthy');
}

function statusFromFlags(hasConflict: boolean, riskLevel?: string | null, fallback?: string | null): CanonicalHealth {
  if (hasConflict) return 'critical';
  const risk = (riskLevel || '').toLowerCase();
  if (risk === 'critical' || risk === 'high') return 'warning';
  return toCanonicalHealth(fallback);
}

function compact(value: Array<string | null | undefined>): string[] {
  return Array.from(new Set(value.filter((item): item is string => Boolean(item))));
}

export function buildCaseTimelineFromRows(rows: any): CanonicalTimelineEntry[] {
  if (!rows) return [];

  const timeline: CanonicalTimelineEntry[] = [];

  rows.messages?.forEach((message: any) => {
    timeline.push({
      id: `message:${message.id}`,
      entry_type: 'message',
      type: message.type || 'message',
      domain: 'conversation',
      actor: message.sender_name,
      content: message.content,
      occurred_at: message.sent_at || message.created_at,
      icon: message.direction === 'outbound' ? 'reply' : 'chat',
      severity: message.type === 'internal' ? 'warning' : 'healthy',
      source: message.channel,
    });
  });

  rows.statusHistory?.forEach((item: any) => {
    timeline.push({
      id: `status:${item.id}`,
      entry_type: 'status_change',
      type: 'status_change',
      domain: 'case',
      actor: item.changed_by,
      content: `Status changed: ${item.from_status || 'unknown'} -> ${item.to_status}`,
      occurred_at: item.created_at,
      icon: 'flag',
      severity: toCanonicalHealth(item.to_status),
      source: item.changed_by_type,
    });
  });

  rows.internalNotes?.forEach((note: any) => {
    timeline.push({
      id: `note:${note.id}`,
      entry_type: 'internal_note',
      type: 'internal_note',
      domain: 'case',
      actor: note.created_by,
      content: note.content,
      occurred_at: note.created_at,
      icon: 'note',
      severity: 'warning',
      source: note.created_by_type,
    });
  });

  rows.orderEvents?.forEach((event: any) => {
    timeline.push({
      id: `order_event:${event.id}`,
      entry_type: 'order_event',
      type: event.type,
      domain: 'orders',
      actor: event.system,
      content: event.content,
      occurred_at: event.time,
      icon: 'shopping_bag',
      severity: 'healthy',
      source: event.system,
    });
  });

  rows.returnEvents?.forEach((event: any) => {
    timeline.push({
      id: `return_event:${event.id}`,
      entry_type: 'return_event',
      type: event.type,
      domain: 'returns',
      actor: event.system,
      content: event.content,
      occurred_at: event.time,
      icon: 'assignment_return',
      severity: 'healthy',
      source: event.system,
    });
  });

  rows.canonicalEvents?.forEach((event: any) => {
    timeline.push({
      id: `canonical:${event.id}`,
      entry_type: 'canonical_event',
      type: event.event_type,
      domain: event.event_category || event.source_system,
      actor: event.source_system,
      content: `${event.source_system}: ${event.event_type}`,
      occurred_at: event.occurred_at,
      icon: 'hub',
      severity: toCanonicalHealth(event.status),
      source: event.source_system,
    });
  });

  rows.approvals?.forEach((approval: any) => {
    timeline.push({
      id: `approval:${approval.id}`,
      entry_type: 'approval',
      type: approval.action_type,
      domain: 'approvals',
      actor: approval.requested_by,
      content: `Approval ${approval.status} for ${approval.action_type}`,
      occurred_at: approval.updated_at || approval.created_at,
      icon: 'check_circle',
      severity: approval.status === 'approved' ? 'healthy' : approval.status === 'rejected' ? 'blocked' : 'pending',
      source: approval.requested_by_type,
    });
  });

  rows.reconciliationIssues?.forEach((issue: any) => {
    timeline.push({
      id: `recon:${issue.id}`,
      entry_type: 'reconciliation_issue',
      type: issue.conflict_domain,
      domain: 'reconciliation',
      actor: issue.detected_by,
      content: `${issue.conflict_domain}: ${issue.expected_state || 'mismatch detected'}`,
      occurred_at: issue.detected_at,
      icon: 'warning',
      severity: toCanonicalHealth(issue.severity),
      source: issue.source_of_truth_system,
    });
  });

  return timeline.sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
}

function buildBranches(rows: any): Record<string, SystemStatusBranch> {
  const { caseRow, orders = [], payments = [], returns = [], approvals = [], workflowRuns = [] } = rows;

  const orderBranch: SystemStatusBranch = {
    key: 'orders',
    label: 'Orders',
    status: worstStatus(orders.map((order: any) => statusFromFlags(Boolean(order.has_conflict), order.risk_level, order.status))),
    source_of_truth: 'OMS',
    summary: orders[0]?.summary || null,
    identifiers: compact(orders.flatMap((order: any) => [order.id, order.external_order_id])),
    nodes: orders.map((order: any) => ({
      id: order.id,
      label: order.external_order_id || order.id,
      status: statusFromFlags(Boolean(order.has_conflict), order.risk_level, order.status),
      source: 'orders',
      context: order.summary || order.status,
      value: order.status,
      timestamp: order.updated_at || order.order_date,
    })),
  };

  const paymentBranch: SystemStatusBranch = {
    key: 'payments',
    label: 'Payments',
    status: worstStatus(payments.map((payment: any) => statusFromFlags(Boolean(payment.has_conflict) || Boolean(payment.conflict_detected), payment.risk_level, payment.status))),
    source_of_truth: payments[0]?.psp || 'Stripe',
    summary: payments[0]?.summary || null,
    identifiers: compact(payments.flatMap((payment: any) => [payment.id, payment.external_payment_id, payment.dispute_reference])),
    nodes: payments.map((payment: any) => ({
      id: payment.id,
      label: payment.external_payment_id || payment.id,
      status: statusFromFlags(Boolean(payment.has_conflict) || Boolean(payment.conflict_detected), payment.risk_level, payment.status),
      source: payment.psp,
      context: payment.summary || payment.status,
      value: payment.status,
      timestamp: payment.updated_at || payment.created_at,
    })),
  };

  const returnBranch: SystemStatusBranch = {
    key: 'returns',
    label: 'Returns',
    status: worstStatus(returns.map((ret: any) => statusFromFlags(Boolean(ret.has_conflict) || Boolean(ret.conflict_detected), ret.risk_level, ret.status))),
    source_of_truth: 'Returns Platform',
    summary: returns[0]?.summary || null,
    identifiers: compact(returns.flatMap((ret: any) => [ret.id, ret.external_return_id])),
    nodes: returns.map((ret: any) => ({
      id: ret.id,
      label: ret.external_return_id || ret.id,
      status: statusFromFlags(Boolean(ret.has_conflict) || Boolean(ret.conflict_detected), ret.risk_level, ret.status),
      source: 'returns',
      context: ret.summary || ret.return_reason || ret.status,
      value: ret.status,
      timestamp: ret.updated_at || ret.created_at,
    })),
  };

  const fulfillmentNodes: CanonicalNode[] = orders.map((order: any) => {
    const systemStates = parseStates(order.system_states);
    const fulfillmentValue = systemStates.carrier || systemStates.wms || order.status;
    return {
      id: `${order.id}:fulfillment`,
      label: order.external_order_id || order.id,
      status: toCanonicalHealth(fulfillmentValue),
      source: systemStates.carrier ? 'Carrier' : 'WMS',
      context: `Fulfillment ${fulfillmentValue}`,
      value: fulfillmentValue,
      timestamp: order.updated_at || order.order_date,
    };
  });

  const approvalNodes: CanonicalNode[] = approvals.length > 0
    ? approvals.map((approval: any) => ({
        id: approval.id,
        label: approval.action_type,
        status: approval.status === 'approved' ? 'healthy' : approval.status === 'rejected' ? 'blocked' : 'pending',
        source: approval.requested_by_type,
        context: approval.decision_note || approval.status,
        value: approval.status,
        timestamp: approval.updated_at || approval.created_at,
      }))
    : [{
        id: `${caseRow.id}:approval`,
        label: 'Approval state',
        status: toCanonicalHealth(caseRow.approval_state),
        source: 'case',
        context: caseRow.approval_state,
        value: caseRow.approval_state,
        timestamp: caseRow.updated_at,
      }];

  const workflowNodes: CanonicalNode[] = workflowRuns.length > 0
    ? workflowRuns.map((run: any) => ({
        id: run.id,
        label: run.trigger_type || 'workflow',
        status: toCanonicalHealth(run.status),
        source: 'workflow',
        context: run.status,
        value: run.current_node_id || run.status,
        timestamp: run.started_at,
      }))
    : [{
        id: `${caseRow.id}:execution`,
        label: 'Execution',
        status: toCanonicalHealth(caseRow.execution_state),
        source: 'execution',
        context: caseRow.execution_state,
        value: caseRow.active_execution_plan_id,
        timestamp: caseRow.updated_at,
      }];

  const evidenceRefs = Array.isArray(caseRow.ai_evidence_refs) ? caseRow.ai_evidence_refs : [];
  const knowledgeNodes: CanonicalNode[] = evidenceRefs.length > 0
    ? evidenceRefs.map((ref: string, index: number) => ({
        id: `${caseRow.id}:knowledge:${index}`,
        label: ref,
        status: 'healthy' as CanonicalHealth,
        source: 'knowledge',
        context: 'AI evidence reference',
        value: ref,
        timestamp: caseRow.updated_at,
      }))
    : [{
        id: `${caseRow.id}:knowledge`,
        label: 'Knowledge coverage',
        status: caseRow.ai_diagnosis ? 'pending' : 'warning',
        source: 'knowledge',
        context: caseRow.ai_diagnosis ? 'Diagnosis exists without explicit citations' : 'No knowledge citation registered',
        value: null,
        timestamp: caseRow.updated_at,
      }];

  const integrationSystems = compact([
    caseRow.source_system,
    caseRow.source_channel,
    ...orders.flatMap((order: any) => Object.keys(parseStates(order.system_states))),
    ...payments.flatMap((payment: any) => [payment.psp, ...Object.keys(parseStates(payment.system_states))]),
    ...returns.flatMap((ret: any) => Object.keys(parseStates(ret.system_states))),
  ]);

  return {
    orders: orderBranch,
    payments: paymentBranch,
    returns: returnBranch,
    fulfillment: {
      key: 'fulfillment',
      label: 'Fulfillment',
      status: worstStatus(fulfillmentNodes.map(node => node.status)),
      source_of_truth: 'WMS/Carrier',
      summary: fulfillmentNodes[0]?.context || null,
      identifiers: fulfillmentNodes.map(node => node.id),
      nodes: fulfillmentNodes,
    },
    approvals: {
      key: 'approvals',
      label: 'Approvals',
      status: worstStatus(approvalNodes.map(node => node.status)),
      source_of_truth: 'Policy Engine',
      summary: caseRow.approval_state || null,
      identifiers: compact(approvals.map((approval: any) => approval.id)),
      nodes: approvalNodes,
    },
    workflows: {
      key: 'workflows',
      label: 'Workflows',
      status: worstStatus(workflowNodes.map(node => node.status)),
      source_of_truth: 'Workflow Runtime',
      summary: caseRow.execution_state || null,
      identifiers: compact(workflowNodes.map(node => node.id)),
      nodes: workflowNodes,
    },
    knowledge: {
      key: 'knowledge',
      label: 'Knowledge',
      status: worstStatus(knowledgeNodes.map(node => node.status)),
      source_of_truth: 'Knowledge Base',
      summary: caseRow.ai_root_cause || null,
      identifiers: compact(evidenceRefs),
      nodes: knowledgeNodes,
    },
    integrations: {
      key: 'integrations',
      label: 'Integrations',
      status: integrationSystems.length > 0 ? 'healthy' : 'warning',
      source_of_truth: 'Connector Registry',
      summary: integrationSystems.length > 0 ? `${integrationSystems.length} systems touched` : 'No connected systems detected',
      identifiers: integrationSystems,
      nodes: integrationSystems.map(system => ({
        id: `${caseRow.id}:integration:${system}`,
        label: system,
        status: 'healthy',
        source: 'integration',
        context: 'Observed in case state',
        value: system,
        timestamp: caseRow.updated_at,
      })),
    },
  };
}

export async function getCaseCanonicalState(caseId: string, tenantId: string, workspaceId: string): Promise<CaseCanonicalState | null> {
  const scope = { tenantId, workspaceId };
  const rows = await canonicalRepo.fetchCaseGraphRows(scope, caseId);
  if (!rows) return null;

  const { caseRow, conversation, messages = [], reconciliationIssues = [] } = rows;
  const latestMessage = messages.at(-1);
  const latestInbound = [...messages].reverse().find((message: any) => message.direction !== 'outbound');
  const latestOutbound = [...messages].reverse().find((message: any) => message.direction === 'outbound');

  const systems = buildBranches(rows);
  const conflictIssue = reconciliationIssues[0];
  const sourceOfTruth = conflictIssue?.source_of_truth_system
    || (systems.payments.status === 'critical' ? systems.payments.source_of_truth : systems.orders.source_of_truth)
    || null;

  return {
    snapshot_at: new Date().toISOString(),
    identifiers: {
      case_id: caseRow.id,
      case_number: caseRow.case_number,
      customer_id: caseRow.customer_id,
      conversation_id: caseRow.conversation_id,
      order_ids: Array.isArray(caseRow.order_ids) ? caseRow.order_ids : [],
      payment_ids: Array.isArray(caseRow.payment_ids) ? caseRow.payment_ids : [],
      return_ids: Array.isArray(caseRow.return_ids) ? caseRow.return_ids : [],
      external_refs: compact([
        conversation?.external_thread_id,
        ...(rows.orders || []).map((order: any) => order.external_order_id),
        ...(rows.payments || []).map((payment: any) => payment.external_payment_id),
        ...(rows.returns || []).map((ret: any) => ret.external_return_id),
      ]),
    },
    case: caseRow,
    customer: caseRow.customer_id ? {
      id: caseRow.customer_id,
      canonical_name: caseRow.customer_name,
      canonical_email: caseRow.customer_email,
      segment: caseRow.customer_segment,
      risk_level: caseRow.customer_risk_level,
      lifetime_value: caseRow.customer_lifetime_value,
      total_orders: caseRow.customer_total_orders,
      total_spent: caseRow.customer_total_spent,
    } : null,
    channel_context: {
      conversation_id: caseRow.conversation_id,
      channel: conversation?.channel || caseRow.source_channel,
      source_system: caseRow.source_system,
      subject: conversation?.subject || caseRow.conversation_subject || null,
      external_thread_id: conversation?.external_thread_id || caseRow.external_thread_id || null,
      message_count: messages.length,
      latest_message_preview: latestMessage?.content || caseRow.ai_diagnosis || null,
      latest_inbound_at: latestInbound?.sent_at || null,
      latest_outbound_at: latestOutbound?.sent_at || null,
    },
    systems,
    conflict: {
      has_conflict: Boolean(caseRow.has_reconciliation_conflicts) || reconciliationIssues.length > 0,
      conflict_type: conflictIssue?.conflict_domain || (caseRow.has_reconciliation_conflicts ? caseRow.type : null),
      root_cause: caseRow.ai_root_cause || conflictIssue?.resolution_plan || null,
      source_of_truth: sourceOfTruth,
      recommended_action: caseRow.ai_recommended_action || conflictIssue?.resolution_plan || rows.orders?.[0]?.recommended_action || rows.payments?.[0]?.recommended_action || rows.returns?.[0]?.recommended_action || null,
      severity: caseRow.conflict_severity || conflictIssue?.severity || null,
      evidence_refs: Array.isArray(caseRow.ai_evidence_refs) ? caseRow.ai_evidence_refs : [],
    },
    related: {
      orders: rows.orders || [],
      payments: rows.payments || [],
      returns: rows.returns || [],
      approvals: rows.approvals || [],
      reconciliation_issues: rows.reconciliationIssues || [],
      linked_cases: rows.linkedCases || [],
      messages: rows.messages || [],
      internal_notes: rows.internalNotes || [],
    },
    timeline: buildCaseTimelineFromRows(rows),
  };
}

export async function getCustomerCanonicalState(customerId: string, tenantId: string, workspaceId: string): Promise<CustomerCanonicalState | null> {
  const scope = { tenantId, workspaceId };
  const data = await canonicalRepo.getCustomerState(scope, customerId);
  if (!data) return null;

  const { customer, linkedIdentities, allCases, recentCases, orders, payments, returns } = data;

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
      status: worstStatus(payments.map((payment: any) => statusFromFlags(Boolean(payment.has_conflict) || Boolean(payment.conflict_detected), payment.risk_level, payment.status))),
      source_of_truth: payments[0]?.psp || 'Stripe',
      summary: payments[0]?.summary || null,
      identifiers: compact(payments.map((payment: any) => payment.external_payment_id)),
      nodes: payments.slice(0, 5).map((payment: any) => ({
        id: payment.id,
        label: payment.external_payment_id || payment.id,
        status: statusFromFlags(Boolean(payment.has_conflict) || Boolean(payment.conflict_detected), payment.risk_level, payment.status),
        source: payment.psp,
        context: payment.summary,
        value: payment.status,
        timestamp: payment.updated_at || payment.created_at,
      })),
    },
    returns: {
      key: 'returns',
      label: 'Returns',
      status: worstStatus(returns.map((ret: any) => statusFromFlags(Boolean(ret.has_conflict) || Boolean(ret.conflict_detected), ret.risk_level, ret.status))),
      source_of_truth: 'Returns Platform',
      summary: returns[0]?.summary || null,
      identifiers: compact(returns.map((ret: any) => ret.external_return_id)),
      nodes: returns.slice(0, 5).map((ret: any) => ({
        id: ret.id,
        label: ret.external_return_id || ret.id,
        status: statusFromFlags(Boolean(ret.has_conflict) || Boolean(ret.conflict_detected), ret.risk_level, ret.status),
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
      summary: recentCases[0] ? `${recentCases.length} recent cases` : 'No cases',
      identifiers: compact(recentCases.map((item: any) => item.case_number)),
      nodes: recentCases.slice(0, 5).map((item: any) => ({
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
    recent_cases: recentCases,
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
      fulfillment: state.systems.fulfillment.status,
      approvals: state.systems.approvals.status,
    },
    conflict_summary: state.conflict,
  };
}

export async function getOrderCanonicalContext(orderId: string, tenantId: string, workspaceId: string): Promise<EntityCanonicalContext | null> {
  const scope = { tenantId, workspaceId };
  const relatedCase = await canonicalRepo.findCaseByLinkedEntity(scope, 'order', orderId);
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
  const relatedCase = await canonicalRepo.findCaseByLinkedEntity(scope, 'payment', paymentId);
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
  const relatedCase = await canonicalRepo.findCaseByLinkedEntity(scope, 'return', returnId);
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

function humanizeKey(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
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

export async function buildCaseResolveView(caseId: string, tenantId: string, workspaceId: string): Promise<CaseResolveView | null> {
  const scope = { tenantId, workspaceId };
  const state = await getCaseCanonicalState(caseId, tenantId, workspaceId);
  if (!state) return null;

  const executionPlan = await canonicalRepo.getExecutionPlan(scope, caseId);
  const internalNotes = await canonicalRepo.getInternalNotes(scope, caseId);

  const steps = Array.isArray(executionPlan?.steps) ? executionPlan.steps : [];
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
      title: state.conflict.conflict_type
        ? humanizeKey(state.conflict.conflict_type)
        : state.conflict.has_conflict
          ? 'Conflict detected'
          : 'No active conflict',
      summary: state.conflict.has_conflict
        ? state.conflict.recommended_action || state.conflict.root_cause || 'Manual review required'
        : 'Systems are aligned and no policy blocker is currently active.',
      severity: toCanonicalHealth(state.conflict.severity || (state.conflict.has_conflict ? 'critical' : 'healthy')),
      source_of_truth: state.conflict.source_of_truth || null,
      root_cause: state.conflict.root_cause || null,
      recommended_action: state.conflict.recommended_action || null,
    },
    blockers: activeBlockers,
    identifiers,
    expected_post_resolution_state: activeBlockers.length > 0
      ? activeBlockers.map(blocker => ({
          key: blocker.key,
          label: blocker.label,
          status: 'healthy' as const,
          summary: blocker.key === 'approvals'
            ? 'Approval resolved and execution unblocked'
            : `${blocker.label} aligned after remediation`,
        }))
      : [{
          key: 'case',
          label: 'Case',
          status: 'resolved' as const,
          summary: 'No additional action required',
        }],
    execution: {
      mode: state.case.approval_state === 'pending' ? 'manual' : 'ai',
      status: executionPlan?.status || state.case.execution_state || 'idle',
      requires_approval: state.case.approval_state === 'pending' || state.related.approvals.some((approval: any) => approval.status === 'pending'),
      approval_state: state.case.approval_state || null,
      plan_id: executionPlan?.id || state.case.active_execution_plan_id || null,
      steps: steps.length > 0
        ? steps.map((step: any, index: number) => ({
            id: step.id || `${executionPlan?.id || caseId}:step:${index}`,
            label: step.label || step.action || `Step ${index + 1}`,
            status: toCanonicalHealth(step.status || 'pending'),
            source: step.system || step.tool || null,
            context: step.description || step.reason || null,
          }))
        : activeBlockers.map(blocker => ({
            id: `${caseId}:${blocker.key}`,
            label: `Resolve ${blocker.label}`,
            status: blocker.status === 'healthy' ? 'resolved' : 'pending',
            source: blocker.source_of_truth || null,
            context: blocker.summary || null,
          })),
    },
    linked_cases: state.related.linked_cases,
    notes: internalNotes,
  };
}

export async function buildApprovalContext(approvalId: string, tenantId: string, workspaceId: string) {
  const scope = { tenantId, workspaceId };
  const approval = await canonicalRepo.getApprovalWithContext(scope, approvalId);
  if (!approval) return null;

  const caseState = await getCaseCanonicalState(approval.case_id, tenantId, workspaceId);
  const resolveView = await buildCaseResolveView(approval.case_id, tenantId, workspaceId);
  const auditTrail = await canonicalRepo.getAuditTrail(scope, approval.case_id, approvalId);
  
  // Custom fetch for decision candidates (historical cases for same customer)
  const customerCases = await canonicalRepo.getCustomerState(scope, approval.customer_id);
  const decisionCandidates = (customerCases?.allCases || []).filter((c: any) => c.id !== approval.case_id).slice(0, 3);

  const messages = caseState?.related.messages || [];

  return {
    approval,
    case_state: caseState,
    resolve: resolveView,
    conversation: {
      channel: caseState?.channel_context.channel || approval.source_channel || 'system',
      source_system: approval.source_system || 'system',
      messages,
      latest_customer_message: [...messages].reverse().find((message: any) => message.direction !== 'outbound') || null,
      latest_agent_message: [...messages].reverse().find((message: any) => message.direction === 'outbound') || null,
    },
    audit_trail: auditTrail,
    policy: {
      id: approval.policy_rule_id || null,
      title: humanizeKey(approval.action_type || 'manual_review'),
      description: approval.decision_note || approval.action_payload?.reason || 'Approval required by policy engine.',
      risk_level: approval.risk_level,
      requires_human: approval.status === 'pending' || approval.approval_state === 'pending',
    },
    proposed_action: {
      tool: approval.action_payload?.tool || approval.action_payload?.provider || approval.action_payload?.system || 'connector',
      action: approval.action_type,
      payload: approval.action_payload || {},
      blocked: approval.status === 'pending',
    },
    evidence: {
      refs: compact([
        ...(Array.isArray(caseState?.conflict.evidence_refs) ? caseState!.conflict.evidence_refs : []),
        ...(Array.isArray(approval.evidence_package?.refs) ? approval.evidence_package.refs : []),
      ]),
      similar_cases: decisionCandidates,
      internal_notes: caseState?.related.internal_notes || [],
    },
  };
}
