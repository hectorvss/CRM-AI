import { getDb } from '../db/client.js';
import { parseRow } from '../db/utils.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { buildSlaView, canonicalHealth, compactStrings } from './shared.js';

export interface CaseScope {
  tenantId: string;
  workspaceId: string;
}

export interface CaseFilters {
  status?: string;
  assigned_user_id?: string;
  priority?: string;
  risk_level?: string;
  q?: string;
}

function buildConflictSummary(bundle: any) {
  const issue = bundle.reconciliation_issues?.[0];
  return {
    has_conflict: Boolean(bundle.case.has_reconciliation_conflicts || issue),
    severity: bundle.case.conflict_severity || issue?.severity || bundle.case.risk_level || 'warning',
    root_cause: bundle.case.ai_root_cause || issue?.summary || null,
    recommended_action: bundle.case.ai_recommended_action || issue?.recommended_action || null,
  };
}

function branchHealthFromStatus(status: any, fallback: 'healthy' | 'warning' | 'critical' = 'warning') {
  const value = String(status || '').toLowerCase();
  if (!value) return fallback;
  if (['healthy', 'active', 'connected', 'published', 'approved', 'completed', 'settled', 'delivered', 'captured', 'synced'].includes(value)) return 'healthy';
  if (['warning', 'pending', 'draft', 'review', 'running', 'queued', 'partial', 'in_transit', 'processing', 'needs_attention', 'degraded', 'failed'].includes(value)) return 'warning';
  if (['critical', 'blocked', 'conflict', 'expired', 'disputed', 'cancelled', 'rejected', 'error', 'disabled', 'inactive'].includes(value)) return 'critical';
  return fallback;
}

function latestBy<T extends { [key: string]: any }>(items: T[], key: string, fallback: T[] = []) {
  if (!Array.isArray(items) || !items.length) return fallback;
  return items
    .slice()
    .sort((a, b) => new Date(b[key] || 0).getTime() - new Date(a[key] || 0).getTime());
}

function buildDerivedNode(
  id: string,
  label: string,
  status: any,
  source: string,
  value: any,
  timestamp?: string | null,
  context?: string | null,
) {
  return {
    id,
    label,
    status: canonicalHealth(status || 'warning'),
    source,
    value: value ?? null,
    timestamp: timestamp || null,
    context: context || null,
  };
}

function pickLatestMatch<T extends Record<string, any>>(items: T[], predicate: (item: T) => boolean) {
  return latestBy(items.filter(predicate) as T[], 'updated_at')[0] || null;
}

function buildTimeline(bundle: any) {
  const timeline = [
    ...(bundle.messages ?? []).map((message: any) => ({
      id: message.id,
      entry_type: 'message',
      type: message.type,
      domain: message.channel || 'conversation',
      actor: message.sender_name || message.sender_id || null,
      content: message.content,
      occurred_at: message.sent_at || message.created_at,
      icon: message.direction === 'outbound' ? 'reply' : 'message',
      severity: 'pending',
      source: message.channel || null,
    })),
    ...(bundle.internal_notes ?? []).map((note: any) => ({
      id: note.id,
      entry_type: 'internal_note',
      type: 'internal_note',
      domain: 'notes',
      actor: note.created_by || null,
      content: note.content,
      occurred_at: note.created_at,
      icon: 'note',
      severity: 'warning',
      source: 'internal',
    })),
    ...(bundle.reconciliation_issues ?? []).map((issue: any) => ({
      id: issue.id,
      entry_type: 'reconciliation_issue',
      type: issue.issue_type || 'conflict',
      domain: issue.domain || 'reconciliation',
      actor: issue.detected_by || 'system',
      content: issue.summary || issue.issue_type || 'Conflict detected',
      occurred_at: issue.created_at || issue.detected_at,
      icon: 'alert',
      severity: canonicalHealth(issue.severity || 'critical'),
      source: issue.source_of_truth || null,
    })),
    ...(bundle.case_status_history ?? []).map((entry: any) => ({
      id: entry.id,
      entry_type: 'case_status_history',
      type: entry.to_status || 'status_change',
      domain: 'cases',
      actor: entry.changed_by || 'system',
      content: `${entry.from_status || 'new'} → ${entry.to_status || 'updated'}`,
      occurred_at: entry.created_at,
      icon: 'history',
      severity: branchHealthFromStatus(entry.to_status || 'warning'),
      source: entry.changed_by_type || 'case',
    })),
    ...(bundle.order_events ?? []).map((event: any) => ({
      id: event.id,
      entry_type: 'order_event',
      type: event.type || 'order_event',
      domain: 'orders',
      actor: event.system || 'system',
      content: event.content || event.type || 'Order event',
      occurred_at: event.time || event.created_at || event.updated_at,
      icon: 'package',
      severity: branchHealthFromStatus(event.type || 'warning'),
      source: event.system || 'orders',
    })),
    ...(bundle.approvals ?? []).map((approval: any) => ({
      id: approval.id,
      entry_type: 'approval_request',
      type: approval.status || 'approval_request',
      domain: 'approvals',
      actor: approval.requested_by || 'approval',
      content: `${approval.action_type || 'approval'} ${approval.status || 'pending'}`,
      occurred_at: approval.created_at || approval.updated_at,
      icon: 'rule',
      severity: branchHealthFromStatus(approval.status || 'warning'),
      source: approval.requested_by_type || 'approvals',
    })),
    ...(bundle.return_events ?? []).map((event: any) => ({
      id: event.id,
      entry_type: 'return_event',
      type: event.type || 'return_event',
      domain: 'returns',
      actor: event.system || 'system',
      content: event.content || event.type || 'Return event',
      occurred_at: event.time || event.created_at || event.updated_at,
      icon: 'undo',
      severity: branchHealthFromStatus(event.type || 'warning'),
      source: event.system || 'returns',
    })),
    ...(bundle.workflow_run_steps ?? []).map((step: any) => ({
      id: step.id,
      entry_type: 'workflow_run_step',
      type: step.status || 'workflow_run_step',
      domain: 'workflows',
      actor: step.node_type || 'workflow',
      content: `${step.node_id || step.id}: ${step.status || 'pending'}`,
      occurred_at: step.started_at || step.ended_at || step.created_at,
      icon: 'schema',
      severity: branchHealthFromStatus(step.status || 'warning'),
      source: 'workflows',
    })),
    ...(bundle.refunds ?? []).map((refund: any) => ({
      id: refund.id,
      entry_type: 'refund',
      type: refund.type || 'refund',
      domain: 'refunds',
      actor: refund.initiated_by || refund.psp || 'system',
      content: refund.reason || refund.status || 'Refund state updated',
      occurred_at: refund.updated_at || refund.created_at,
      icon: 'payments',
      severity: branchHealthFromStatus(refund.status || refund.type || 'warning'),
      source: refund.psp || 'refunds',
    })),
    ...(bundle.case_knowledge_links ?? []).map((link: any) => ({
      id: link.id,
      entry_type: 'knowledge_link',
      type: 'knowledge_link',
      domain: 'knowledge',
      actor: 'knowledge',
      content: `Linked ${bundle.knowledge_articles?.find((article: any) => article.id === link.article_id)?.title || 'knowledge article'}`,
      occurred_at: link.created_at,
      icon: 'menu_book',
      severity: branchHealthFromStatus(bundle.knowledge_articles?.find((article: any) => article.id === link.article_id)?.status || 'healthy'),
      source: 'knowledge',
    })),
    ...(bundle.connectors ?? []).map((connector: any) => ({
      id: connector.id,
      entry_type: 'integration',
      type: connector.system || 'integration',
      domain: 'integrations',
      actor: connector.system || 'integration',
      content: `${connector.name} is ${connector.status}`,
      occurred_at: connector.updated_at || connector.last_health_check_at || connector.created_at,
      icon: 'integration_instructions',
      severity: branchHealthFromStatus(connector.status || 'warning'),
      source: connector.system || 'integration',
    })),
    ...(bundle.webhook_events ?? []).map((event: any) => ({
      id: event.id,
      entry_type: 'webhook_event',
      type: event.event_type || 'webhook_event',
      domain: 'integrations',
      actor: event.source_system || 'webhook',
      content: `Webhook ${event.event_type || 'received'} (${event.status || 'received'})`,
      occurred_at: event.received_at || event.processed_at,
      icon: 'webhook',
      severity: branchHealthFromStatus(event.status || 'warning'),
      source: event.source_system || 'webhook',
    })),
    ...(bundle.policy_evaluations ?? []).map((evaluation: any) => ({
      id: evaluation.id,
      entry_type: 'policy_evaluation',
      type: evaluation.decision || 'policy_evaluation',
      domain: 'approvals',
      actor: evaluation.entity_type || 'policy',
      content: evaluation.reason || evaluation.decision || 'Policy evaluation recorded',
      occurred_at: evaluation.created_at,
      icon: 'policy',
      severity: branchHealthFromStatus(evaluation.decision || 'warning'),
      source: evaluation.entity_type || 'policy',
    })),
    ...(bundle.execution_plans ?? []).map((plan: any) => ({
      id: plan.id,
      entry_type: 'execution_plan',
      type: plan.status || 'execution_plan',
      domain: 'approvals',
      actor: plan.generated_by || 'system',
      content: `Execution plan ${plan.status || 'created'}${plan.approval_request_id ? ` for ${plan.approval_request_id}` : ''}`,
      occurred_at: plan.generated_at || plan.started_at || plan.completed_at,
      icon: 'fact_check',
      severity: branchHealthFromStatus(plan.status || 'warning'),
      source: 'execution_plans',
    })),
    ...(bundle.tool_action_attempts ?? []).map((attempt: any) => ({
      id: attempt.id,
      entry_type: 'tool_action_attempt',
      type: attempt.status || 'tool_action_attempt',
      domain: 'workflows',
      actor: attempt.tool || 'tool',
      content: `${attempt.tool || 'tool'}.${attempt.action || 'action'} ${attempt.status || 'pending'}`,
      occurred_at: attempt.started_at || attempt.ended_at || attempt.created_at,
      icon: 'terminal',
      severity: branchHealthFromStatus(attempt.status || 'warning'),
      source: attempt.tool || 'tools',
    })),
    ...(bundle.workflow_runs ?? []).map((run: any) => ({
      id: run.id,
      entry_type: 'workflow_run',
      type: run.status || 'workflow_run',
      domain: 'workflows',
      actor: 'workflow',
      content: `Workflow ${run.status} (${run.trigger_type || 'manual'})`,
      occurred_at: run.started_at || run.ended_at || run.created_at,
      icon: 'schema',
      severity: branchHealthFromStatus(run.status || 'warning'),
      source: 'workflows',
    })),
    ...(bundle.agents ?? []).map((agent: any) => ({
      id: agent.id,
      entry_type: 'agent_definition',
      type: agent.is_active ? 'agent_active' : 'agent_inactive',
      domain: 'ai_studio',
      actor: agent.name || agent.slug,
      content: `${agent.name || agent.slug} · ${agent.category || 'agent'}${agent.current_version_id ? ` · v${bundle.agent_versions?.find((version: any) => version.id === agent.current_version_id)?.version_number || 'current'}` : ''}`,
      occurred_at: agent.updated_at || agent.created_at,
      icon: 'smart_toy',
      severity: branchHealthFromStatus(agent.is_active ? (agent.is_locked ? 'warning' : 'healthy') : 'critical'),
      source: 'ai_studio',
    })),
    ...(bundle.canonical_events ?? []).map((event: any) => ({
      id: event.id,
      entry_type: 'canonical_event',
      type: event.event_type || 'canonical_event',
      domain: event.event_category || 'canonical',
      actor: event.source_system || 'system',
      content: event.normalized_payload?.summary || event.source_entity_type || event.event_type || 'Canonical event',
      occurred_at: event.occurred_at || event.ingested_at,
      icon: 'hub',
      severity: branchHealthFromStatus(event.status || 'warning'),
      source: event.source_system || 'canonical',
    })),
  ];

  return timeline.sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
}

function buildCaseState(bundle: any) {
  const conversation = bundle.conversation;
  const messages = bundle.messages ?? [];
  const internalNotes = bundle.internal_notes ?? [];
  const reconciliationIssues = bundle.reconciliation_issues ?? [];
  const linkedCases = bundle.linked_cases ?? [];
  const refunds = bundle.refunds ?? [];
  const caseKnowledgeLinks = bundle.case_knowledge_links ?? [];
  const knowledgeArticles = bundle.knowledge_articles ?? [];
  const connectors = bundle.connectors ?? [];
  const agents = bundle.agents ?? [];
  const agentVersions = bundle.agent_versions ?? [];
  const workflowRuns = bundle.workflow_runs ?? [];
  const executionPlans = bundle.execution_plans ?? [];
  const toolActionAttempts = bundle.tool_action_attempts ?? [];
  const policyRules = bundle.policy_rules ?? [];
  const policyEvaluations = bundle.policy_evaluations ?? [];
  const webhookEvents = bundle.webhook_events ?? [];
  const caseStatusHistory = bundle.case_status_history ?? [];
  const workflowRunSteps = bundle.workflow_run_steps ?? [];
  const latestInbound = messages.filter((message: any) => message.direction === 'inbound').at(-1);
  const latestOutbound = messages.filter((message: any) => message.direction === 'outbound').at(-1);
  const conflict = buildConflictSummary(bundle);
  const latestMessageIsInbound = Boolean(latestInbound && (!latestOutbound || new Date(latestInbound.sent_at || latestInbound.created_at).getTime() >= new Date(latestOutbound.sent_at || latestOutbound.created_at).getTime()));
  const approvalRequests = bundle.approvals ?? [];
  const refundsByOrderId = new Map<string, any[]>();
  const refundsByPaymentId = new Map<string, any[]>();
  const refundsByCustomerId = new Map<string, any[]>();
  for (const refund of refunds) {
    if (refund.order_id) {
      refundsByOrderId.set(refund.order_id, [...(refundsByOrderId.get(refund.order_id) || []), refund]);
    }
    if (refund.payment_id) {
      refundsByPaymentId.set(refund.payment_id, [...(refundsByPaymentId.get(refund.payment_id) || []), refund]);
    }
    if (refund.customer_id) {
      refundsByCustomerId.set(refund.customer_id, [...(refundsByCustomerId.get(refund.customer_id) || []), refund]);
    }
  }
  const paymentsByOrderId = new Map<string, any[]>();
  for (const payment of bundle.payments ?? []) {
    if (payment.order_id) {
      paymentsByOrderId.set(payment.order_id, [...(paymentsByOrderId.get(payment.order_id) || []), payment]);
    }
  }
  const orderEventsByOrderId = new Map<string, any[]>();
  for (const event of bundle.order_events ?? []) {
    if (event.order_id) {
      orderEventsByOrderId.set(event.order_id, [...(orderEventsByOrderId.get(event.order_id) || []), event]);
    }
  }
  const returnEventsByReturnId = new Map<string, any[]>();
  for (const event of bundle.return_events ?? []) {
    if (event.return_id) {
      returnEventsByReturnId.set(event.return_id, [...(returnEventsByReturnId.get(event.return_id) || []), event]);
    }
  }
  const workflowStepsByRunId = new Map<string, any[]>();
  for (const step of workflowRunSteps) {
    if (step.workflow_run_id) {
      workflowStepsByRunId.set(step.workflow_run_id, [...(workflowStepsByRunId.get(step.workflow_run_id) || []), step]);
    }
  }
  const executionPlanById = new Map<string, any>((executionPlans ?? []).map((plan: any) => [plan.id, plan]));
  const policyRuleById = new Map<string, any>((policyRules ?? []).map((rule: any) => [rule.id, rule]));
  const latestPolicyEvaluation = pickLatestMatch(policyEvaluations, (evaluation: any) => evaluation.case_id === bundle.case.id);
  const latestExecutionPlan = pickLatestMatch(executionPlans, (plan: any) => plan.case_id === bundle.case.id);
  const latestStatusChange = latestBy(caseStatusHistory, 'created_at')[0] || null;
  const nodeStatus = (nodes: any[], fallback: 'healthy' | 'warning' | 'critical' = 'warning') => {
    if (nodes.some((node: any) => node.status === 'critical')) return 'critical';
    if (nodes.some((node: any) => node.status === 'warning')) return 'warning';
    if (nodes.some((node: any) => node.status === 'healthy')) return 'healthy';
    return fallback;
  };
  const orderNodes = latestBy(bundle.orders ?? [], 'updated_at').flatMap((order: any) => {
    const relatedPayments = paymentsByOrderId.get(order.id) || [];
    const relatedRefunds = refundsByOrderId.get(order.id) || [];
    const relatedIssues = reconciliationIssues.filter((issue: any) => issue.entity_type === 'order' && issue.entity_id === order.id);
    const relatedEvents = orderEventsByOrderId.get(order.id) || [];
    return [
      buildDerivedNode(
        `order:${order.id}`,
        order.external_order_id || order.id,
        order.has_conflict ? 'critical' : order.status,
        'orders',
        order.status,
        order.updated_at || order.created_at,
        order.summary || order.conflict_detected || order.recommended_action,
      ),
      buildDerivedNode(
        `order:${order.id}:fulfillment`,
        'Fulfillment',
        order.fulfillment_status || order.status,
        'orders',
        order.fulfillment_status || order.status,
        order.updated_at || order.created_at,
        order.tracking_number || order.tracking_url || order.shipping_address,
      ),
      buildDerivedNode(
        `order:${order.id}:payment-link`,
        'Payment linkage',
        relatedPayments.some((payment: any) => ['blocked', 'disputed', 'failed'].includes(String(payment.status || '').toLowerCase()))
          ? 'critical'
          : relatedPayments.some((payment: any) => ['pending', 'authorized', 'approval_needed'].includes(String(payment.approval_status || payment.status || '').toLowerCase()))
            ? 'warning'
            : relatedPayments.length ? 'healthy' : 'warning',
        'payments',
        relatedPayments[0]?.external_payment_id || relatedPayments[0]?.id || 'No linked payment',
        relatedPayments[0]?.updated_at || relatedPayments[0]?.created_at || order.updated_at,
        relatedPayments[0]?.summary || 'Payment linkage',
      ),
      buildDerivedNode(
        `order:${order.id}:refund-link`,
        'Refund linkage',
        relatedRefunds.some((refund: any) => ['blocked', 'disputed', 'failed'].includes(String(refund.status || '').toLowerCase()))
          ? 'critical'
          : relatedRefunds.some((refund: any) => ['pending', 'processing', 'issued'].includes(String(refund.status || '').toLowerCase()))
            ? 'warning'
            : relatedRefunds.length ? 'healthy' : 'healthy',
        'refunds',
        relatedRefunds[0]?.external_refund_id || relatedRefunds[0]?.id || 'No refund',
        relatedRefunds[0]?.updated_at || relatedRefunds[0]?.created_at || order.updated_at,
        relatedRefunds[0]?.reason || relatedRefunds[0]?.status || 'Refund linkage',
      ),
      buildDerivedNode(
        `order:${order.id}:reconciliation`,
        'Reconciliation',
        relatedIssues.some((issue: any) => ['critical', 'blocked'].includes(String(issue.severity || '').toLowerCase()))
          ? 'critical'
          : relatedIssues.length ? 'warning' : 'healthy',
        'reconciliation',
        relatedIssues[0]?.conflict_domain || relatedIssues[0]?.status || 'clean',
        relatedIssues[0]?.detected_at || relatedIssues[0]?.created_at || order.updated_at,
        relatedIssues[0]?.resolution_plan || relatedIssues[0]?.expected_state || 'No order conflict',
      ),
      buildDerivedNode(
        `order:${order.id}:events`,
        'Order events',
        relatedEvents.some((event: any) => ['cancelled', 'blocked'].includes(String(event.type || '').toLowerCase()))
          ? 'critical'
          : relatedEvents.length ? 'warning' : 'healthy',
        'orders',
        `${relatedEvents.length} event${relatedEvents.length === 1 ? '' : 's'}`,
        relatedEvents.at(-1)?.time || relatedEvents.at(-1)?.created_at || order.updated_at,
        relatedEvents.at(-1)?.content || 'Order event history',
      ),
    ];
  });
  const paymentNodes = latestBy(bundle.payments ?? [], 'updated_at').flatMap((payment: any) => {
    const linkedOrder = (bundle.orders ?? []).find((order: any) => order.id === payment.order_id) || null;
    const relatedRefunds = refundsByPaymentId.get(payment.id) || [];
    const relatedIssues = reconciliationIssues.filter((issue: any) => issue.entity_type === 'payment' && issue.entity_id === payment.id);
    return [
      buildDerivedNode(
        `payment:${payment.id}`,
        payment.external_payment_id || payment.id,
        payment.has_conflict ? 'critical' : payment.status,
        'payments',
        payment.status,
        payment.updated_at || payment.created_at,
        payment.summary || payment.conflict_detected || payment.recommended_action,
      ),
      buildDerivedNode(
        `payment:${payment.id}:order-link`,
        'Order linkage',
        linkedOrder?.has_conflict ? 'warning' : linkedOrder ? 'healthy' : 'warning',
        'orders',
        linkedOrder?.external_order_id || linkedOrder?.id || 'No linked order',
        linkedOrder?.updated_at || linkedOrder?.created_at || payment.updated_at,
        linkedOrder?.summary || linkedOrder?.conflict_detected || 'Linked order',
      ),
      buildDerivedNode(
        `payment:${payment.id}:refund-link`,
        'Refund linkage',
        relatedRefunds.some((refund: any) => ['blocked', 'disputed', 'failed'].includes(String(refund.status || '').toLowerCase()))
          ? 'critical'
          : relatedRefunds.some((refund: any) => ['pending', 'processing', 'issued'].includes(String(refund.status || '').toLowerCase()))
            ? 'warning'
            : relatedRefunds.length ? 'healthy' : 'healthy',
        'refunds',
        relatedRefunds[0]?.external_refund_id || relatedRefunds[0]?.id || 'No refund',
        relatedRefunds[0]?.updated_at || relatedRefunds[0]?.created_at || payment.updated_at,
        relatedRefunds[0]?.reason || relatedRefunds[0]?.status || 'Refund linkage',
      ),
      buildDerivedNode(
        `payment:${payment.id}:approval`,
        'Approval state',
        payment.approval_status || 'not_required',
        'approvals',
        payment.approval_status || 'not_required',
        payment.updated_at || payment.created_at,
        payment.conflict_detected || payment.recommended_action || 'Payment approval state',
      ),
      buildDerivedNode(
        `payment:${payment.id}:issue`,
        'Reconciliation',
        relatedIssues.some((issue: any) => ['critical', 'blocked'].includes(String(issue.severity || '').toLowerCase()))
          ? 'critical'
          : relatedIssues.length ? 'warning' : 'healthy',
        'reconciliation',
        relatedIssues[0]?.conflict_domain || relatedIssues[0]?.status || 'clean',
        relatedIssues[0]?.detected_at || relatedIssues[0]?.created_at || payment.updated_at,
        relatedIssues[0]?.resolution_plan || relatedIssues[0]?.expected_state || 'No payment conflict',
      ),
    ];
  });
  const returnNodes = latestBy(bundle.returns ?? [], 'updated_at').flatMap((item: any) => {
    const relatedOrder = (bundle.orders ?? []).find((order: any) => order.id === item.order_id) || null;
    const relatedRefunds = [
      ...(refundsByOrderId.get(item.order_id) || []),
      ...(refundsByCustomerId.get(item.customer_id) || []),
      ...(item.linked_refund_id ? (refunds.filter((refund: any) => refund.id === item.linked_refund_id) || []) : []),
    ];
    const relatedEvents = returnEventsByReturnId.get(item.id) || [];
    const relatedIssues = reconciliationIssues.filter((issue: any) => issue.entity_type === 'return' && issue.entity_id === item.id);
    return [
      buildDerivedNode(
        `return:${item.id}`,
        item.external_return_id || item.id,
        item.has_conflict ? 'critical' : item.status,
        'returns',
        item.status,
        item.updated_at || item.created_at,
        item.summary || item.conflict_detected || item.recommended_action,
      ),
      buildDerivedNode(
        `return:${item.id}:order-link`,
        'Order linkage',
        relatedOrder?.has_conflict ? 'warning' : relatedOrder ? 'healthy' : 'warning',
        'orders',
        relatedOrder?.external_order_id || relatedOrder?.id || 'No linked order',
        relatedOrder?.updated_at || relatedOrder?.created_at || item.updated_at,
        relatedOrder?.summary || relatedOrder?.conflict_detected || 'Linked order',
      ),
      buildDerivedNode(
        `return:${item.id}:refund-link`,
        'Refund linkage',
        relatedRefunds.some((refund: any) => ['blocked', 'disputed', 'failed'].includes(String(refund.status || '').toLowerCase()))
          ? 'critical'
          : relatedRefunds.some((refund: any) => ['pending', 'processing', 'issued'].includes(String(refund.status || '').toLowerCase()))
            ? 'warning'
            : relatedRefunds.length ? 'healthy' : 'healthy',
        'refunds',
        relatedRefunds[0]?.external_refund_id || relatedRefunds[0]?.id || 'No refund',
        relatedRefunds[0]?.updated_at || relatedRefunds[0]?.created_at || item.updated_at,
        relatedRefunds[0]?.reason || relatedRefunds[0]?.status || 'Refund linkage',
      ),
      buildDerivedNode(
        `return:${item.id}:approval`,
        'Approval state',
        item.approval_status || 'not_required',
        'approvals',
        item.approval_status || 'not_required',
        item.updated_at || item.created_at,
        item.recommended_action || item.conflict_detected || 'Return approval state',
      ),
      buildDerivedNode(
        `return:${item.id}:events`,
        'Return events',
        relatedEvents.some((event: any) => ['blocked', 'failed'].includes(String(event.type || '').toLowerCase()))
          ? 'critical'
          : relatedEvents.length ? 'warning' : 'healthy',
        'returns',
        `${relatedEvents.length} event${relatedEvents.length === 1 ? '' : 's'}`,
        relatedEvents.at(-1)?.time || relatedEvents.at(-1)?.created_at || item.updated_at,
        relatedEvents.at(-1)?.content || 'Return event history',
      ),
    ];
  });
  const refundNodes = latestBy(refunds, 'updated_at').flatMap((refund: any) => {
    const relatedPayment = (bundle.payments ?? []).find((payment: any) => payment.id === refund.payment_id) || null;
    const relatedOrder = (bundle.orders ?? []).find((order: any) => order.id === refund.order_id) || null;
    const relatedApproval = approvalRequests.find((approval: any) => approval.id === refund.approval_request_id) || null;
    const relatedIssue = reconciliationIssues.find((issue: any) => issue.case_id === bundle.case.id && [issue.entity_id, relatedPayment?.id, relatedOrder?.id].includes(issue.entity_id));
    return [
      buildDerivedNode(
        `refund:${refund.id}`,
        refund.external_refund_id || refund.id,
        refund.status,
        'refunds',
        refund.status,
        refund.updated_at || refund.created_at,
        refund.reason || refund.type || 'Refund state',
      ),
      buildDerivedNode(
        `refund:${refund.id}:payment-link`,
        'Payment linkage',
        relatedPayment?.has_conflict ? 'critical' : relatedPayment ? 'healthy' : 'warning',
        'payments',
        relatedPayment?.external_payment_id || relatedPayment?.id || 'No linked payment',
        relatedPayment?.updated_at || relatedPayment?.created_at || refund.updated_at,
        relatedPayment?.summary || relatedPayment?.conflict_detected || 'Linked payment',
      ),
      buildDerivedNode(
        `refund:${refund.id}:order-link`,
        'Order linkage',
        relatedOrder?.has_conflict ? 'warning' : relatedOrder ? 'healthy' : 'warning',
        'orders',
        relatedOrder?.external_order_id || relatedOrder?.id || 'No linked order',
        relatedOrder?.updated_at || relatedOrder?.created_at || refund.updated_at,
        relatedOrder?.summary || relatedOrder?.conflict_detected || 'Linked order',
      ),
      buildDerivedNode(
        `refund:${refund.id}:approval`,
        'Approval state',
        relatedApproval?.status || refund.approval_request_id ? 'warning' : 'healthy',
        'approvals',
        relatedApproval?.status || refund.approval_request_id || 'not_required',
        relatedApproval?.updated_at || relatedApproval?.created_at || refund.updated_at,
        relatedApproval?.decision_note || relatedApproval?.action_type || 'Refund approval state',
      ),
      buildDerivedNode(
        `refund:${refund.id}:issue`,
        'Reconciliation',
        relatedIssue?.severity || refund.status,
        'reconciliation',
        relatedIssue?.conflict_domain || relatedIssue?.status || refund.status,
        relatedIssue?.detected_at || relatedIssue?.created_at || refund.updated_at,
        relatedIssue?.resolution_plan || relatedIssue?.expected_state || 'Refund reconciliation',
      ),
    ];
  });
  const approvalNodes = latestBy(approvalRequests, 'updated_at').flatMap((approval: any) => {
    const plan = approval.execution_plan_id ? executionPlanById.get(approval.execution_plan_id) : latestExecutionPlan;
    const policy = approval.policy_rule_id ? policyRuleById.get(approval.policy_rule_id) : null;
    const evaluation = latestPolicyEvaluation && (latestPolicyEvaluation.case_id === bundle.case.id) ? latestPolicyEvaluation : null;
    return [
      buildDerivedNode(
        `approval:${approval.id}`,
        approval.action_type || approval.id,
        approval.status,
        'approvals',
        approval.status,
        approval.updated_at || approval.created_at,
        approval.decision_note || approval.evidence_package?.summary || 'Approval request',
      ),
      buildDerivedNode(
        `approval:${approval.id}:policy`,
        'Policy rule',
        policy ? (policy.is_active ? 'healthy' : 'warning') : 'warning',
        'knowledge',
        policy?.name || policy?.id || 'No policy',
        policy?.created_at || approval.created_at,
        policy?.description || policy?.entity_type || 'Policy mapping',
      ),
      buildDerivedNode(
        `approval:${approval.id}:plan`,
        'Execution plan',
        plan?.status || 'warning',
        'workflows',
        plan?.status || 'pending',
        plan?.generated_at || plan?.started_at || approval.created_at,
        plan?.approval_request_id || 'Execution plan',
      ),
      buildDerivedNode(
        `approval:${approval.id}:evaluation`,
        'Policy evaluation',
        evaluation?.decision || approval.status,
        'knowledge',
        evaluation?.decision || approval.status,
        evaluation?.created_at || approval.created_at,
        evaluation?.reason || evaluation?.matched_rule_id || 'Policy evaluation',
      ),
      buildDerivedNode(
        `approval:${approval.id}:decision`,
        'Decision / expiry',
        approval.status,
        'approvals',
        approval.decision_note || approval.expires_at || approval.status,
        approval.decision_at || approval.expires_at || approval.updated_at,
        approval.assigned_team_id || approval.assigned_to || 'Decision state',
      ),
    ];
  });
  const reconciliationNodes = latestBy(reconciliationIssues, 'detected_at').flatMap((issue: any) => [
    buildDerivedNode(
      `reconciliation:${issue.id}`,
      issue.conflict_domain || issue.entity_id || issue.id,
      issue.severity || issue.status,
      'reconciliation',
      issue.status,
      issue.detected_at || issue.created_at,
      issue.summary || issue.resolution_plan || 'Reconciliation issue',
    ),
    buildDerivedNode(
      `reconciliation:${issue.id}:source-of-truth`,
      'Source of truth',
      issue.source_of_truth_system ? 'warning' : 'critical',
      'reconciliation',
      issue.source_of_truth_system || 'unspecified',
      issue.detected_at || issue.created_at,
      issue.expected_state || 'Source of truth',
    ),
    buildDerivedNode(
      `reconciliation:${issue.id}:expected`,
      'Expected state',
      issue.severity || 'warning',
      'reconciliation',
      issue.expected_state || 'unspecified',
      issue.detected_at || issue.created_at,
      issue.actual_states ? JSON.stringify(issue.actual_states) : 'Expected state',
    ),
    buildDerivedNode(
      `reconciliation:${issue.id}:resolution`,
      'Resolution plan',
      issue.status,
      'reconciliation',
      issue.resolution_plan || 'Pending',
      issue.detected_at || issue.created_at,
      issue.resolution_plan || 'Resolution plan',
    ),
  ]);
  const knowledgeNodes = latestBy(knowledgeArticles, 'updated_at').flatMap((article: any) => {
    const link = caseKnowledgeLinks.find((item: any) => item.article_id === article.id);
    const policies = compactStrings(article.linked_approval_policy_ids ?? []);
    const policy = policies.length ? policyRules.find((rule: any) => policies.includes(rule.id)) : null;
    return [
      buildDerivedNode(
        `knowledge:${article.id}`,
        article.title,
        article.outdated_flag || article.status === 'draft' ? 'warning' : article.status === 'archived' ? 'critical' : 'healthy',
        'knowledge',
        article.status,
        article.updated_at || article.created_at,
        article.content_structured?.summary || article.content,
      ),
      buildDerivedNode(
        `knowledge:${article.id}:link`,
        'Case link',
        link ? 'healthy' : 'warning',
        'cases',
        link ? `relevance:${link.relevance_score ?? 0}` : 'No case link',
        link?.created_at || article.updated_at,
        link ? `Linked to ${bundle.case.case_number}` : 'Knowledge link',
      ),
      buildDerivedNode(
        `knowledge:${article.id}:policy`,
        'Policy coverage',
        policy ? (policy.is_active ? 'healthy' : 'warning') : 'warning',
        'approvals',
        policy?.name || 'No policy link',
        policy?.created_at || article.updated_at,
        policy?.description || policy?.entity_type || 'Policy coverage',
      ),
      buildDerivedNode(
        `knowledge:${article.id}:review`,
        'Review cycle',
        article.outdated_flag ? 'warning' : 'healthy',
        'knowledge',
        `${article.review_cycle_days || 0} days`,
        article.next_review_at || article.last_reviewed_at || article.updated_at,
        article.last_reviewed_at || article.next_review_at || 'Review cycle',
      ),
      buildDerivedNode(
        `knowledge:${article.id}:citations`,
        'Citations',
        article.citation_count && article.citation_count > 0 ? 'healthy' : 'warning',
        'knowledge',
        `${article.citation_count || 0} citation${(article.citation_count || 0) === 1 ? '' : 's'}`,
        article.last_cited_at || article.updated_at,
        article.last_cited_at || 'Citation usage',
      ),
    ];
  });
  const integrationNodes = latestBy(connectors, 'updated_at').flatMap((connector: any) => {
    const relatedWebhookEvents = webhookEvents.filter((event: any) => event.connector_id === connector.id);
    const capabilities = Array.isArray(connector.capabilities) ? connector.capabilities : [];
    return [
      buildDerivedNode(
        `integration:${connector.id}`,
        connector.name || connector.system || connector.id,
        connector.status,
        'connectors',
        connector.status,
        connector.updated_at || connector.last_health_check_at || connector.created_at,
        connector.auth_type || connector.auth_config?.store || 'Connector state',
      ),
      buildDerivedNode(
        `integration:${connector.id}:health`,
        'Health check',
        connector.last_health_check_at ? connector.status : 'warning',
        'connectors',
        connector.last_health_check_at || 'No health check',
        connector.last_health_check_at || connector.updated_at,
        connector.last_health_check_at ? 'Latest health check recorded' : 'Health check pending',
      ),
      buildDerivedNode(
        `integration:${connector.id}:auth`,
        'Auth / config',
        connector.auth_config ? 'healthy' : 'warning',
        'connectors',
        connector.auth_type || 'unknown',
        connector.updated_at || connector.created_at,
        connector.auth_config ? JSON.stringify(connector.auth_config) : 'No auth config',
      ),
      buildDerivedNode(
        `integration:${connector.id}:capabilities`,
        'Capabilities',
        capabilities.length ? 'healthy' : 'warning',
        'connectors',
        `${capabilities.length} capability${capabilities.length === 1 ? '' : 'ies'}`,
        connector.updated_at || connector.created_at,
        capabilities.join(', ') || 'No capabilities',
      ),
      buildDerivedNode(
        `integration:${connector.id}:webhooks`,
        'Webhook activity',
        relatedWebhookEvents.some((event: any) => ['failed', 'error', 'blocked'].includes(String(event.status || '').toLowerCase()))
          ? 'critical'
          : relatedWebhookEvents.length ? 'warning' : 'healthy',
        'integrations',
        `${relatedWebhookEvents.length} webhook${relatedWebhookEvents.length === 1 ? '' : 's'}`,
        relatedWebhookEvents.at(-1)?.received_at || connector.updated_at,
        relatedWebhookEvents.at(-1)?.event_type || 'Webhook activity',
      ),
    ];
  });
  const aiStudioNodes = latestBy(agents, 'updated_at').flatMap((agent: any) => {
    const version = agentVersions.find((item: any) => item.id === agent.current_version_id);
    const permissions = version?.permission_profile || {};
    const reasoning = version?.reasoning_profile || {};
    const safety = version?.safety_profile || {};
    const knowledge = version?.knowledge_profile || {};
    const rollout = version?.rollout_percentage;
    return [
      buildDerivedNode(
        `agent:${agent.id}`,
        agent.name || agent.slug || agent.id,
        !agent.is_active ? 'critical' : version?.status === 'draft' || agent.is_locked ? 'warning' : 'healthy',
        'agents',
        version ? `v${version.version_number || 1} · ${version.status || 'published'}` : 'no version',
        agent.updated_at || agent.created_at,
        agent.description || agent.category || 'Agent profile',
      ),
      buildDerivedNode(
        `agent:${agent.id}:permissions`,
        'Permissions',
        permissions ? 'healthy' : 'warning',
        'agents',
        Object.keys(permissions).length ? `${Object.keys(permissions).length} rules` : 'No permissions',
        version?.published_at || agent.updated_at,
        JSON.stringify(permissions),
      ),
      buildDerivedNode(
        `agent:${agent.id}:reasoning`,
        'Reasoning',
        reasoning ? 'healthy' : 'warning',
        'agents',
        reasoning.mode || reasoning.depth || 'Reasoning profile',
        version?.published_at || agent.updated_at,
        JSON.stringify(reasoning),
      ),
      buildDerivedNode(
        `agent:${agent.id}:safety`,
        'Safety',
        safety ? 'healthy' : 'warning',
        'agents',
        safety.risk || safety.minConfidenceThreshold || 'Safety profile',
        version?.published_at || agent.updated_at,
        JSON.stringify(safety),
      ),
      buildDerivedNode(
        `agent:${agent.id}:knowledge`,
        'Knowledge',
        knowledge ? 'healthy' : 'warning',
        'agents',
        Object.keys(knowledge).length ? `${Object.keys(knowledge).length} domains` : 'No knowledge',
        version?.published_at || agent.updated_at,
        JSON.stringify(knowledge),
      ),
      buildDerivedNode(
        `agent:${agent.id}:rollout`,
        'Rollout',
        typeof rollout === 'number' && rollout < 100 ? 'warning' : 'healthy',
        'agents',
        typeof rollout === 'number' ? `${rollout}%` : '100%',
        version?.published_at || agent.updated_at,
        version?.changelog || 'Rollout profile',
      ),
    ];
  });
  const workflowNodes = latestBy(workflowRuns, 'started_at').flatMap((run: any) => {
    const steps = workflowStepsByRunId.get(run.id) || [];
    const plan = latestExecutionPlan && latestExecutionPlan.case_id === bundle.case.id ? latestExecutionPlan : null;
    return [
      buildDerivedNode(
        `workflow:${run.id}`,
        run.current_node_id || run.workflow_version_id || run.id,
        run.status,
        'workflows',
        run.status,
        run.started_at || run.ended_at || run.created_at,
        run.trigger_type || 'workflow run',
      ),
      buildDerivedNode(
        `workflow:${run.id}:steps`,
        'Run steps',
        steps.some((step: any) => ['failed', 'error', 'blocked'].includes(String(step.status || '').toLowerCase()))
          ? 'critical'
          : steps.some((step: any) => ['pending', 'running'].includes(String(step.status || '').toLowerCase()))
            ? 'warning'
            : steps.length ? 'healthy' : 'warning',
        'workflows',
        `${steps.length} step${steps.length === 1 ? '' : 's'}`,
        steps.at(-1)?.ended_at || steps.at(-1)?.started_at || run.started_at,
        steps.at(-1)?.error || steps.at(-1)?.output || 'Workflow step history',
      ),
      buildDerivedNode(
        `workflow:${run.id}:plan`,
        'Execution plan',
        plan?.status || 'warning',
        'approvals',
        plan?.status || 'pending',
        plan?.generated_at || run.started_at,
        plan?.dry_run_result ? JSON.stringify(plan.dry_run_result) : 'Execution plan',
      ),
      buildDerivedNode(
        `workflow:${run.id}:attempts`,
        'Tool attempts',
        (bundle.tool_action_attempts ?? []).some((attempt: any) => attempt.execution_plan_id === plan?.id && ['failed', 'error'].includes(String(attempt.status || '').toLowerCase()))
          ? 'critical'
          : (bundle.tool_action_attempts ?? []).some((attempt: any) => attempt.execution_plan_id === plan?.id)
            ? 'warning'
            : 'healthy',
        'workflows',
        `${(bundle.tool_action_attempts ?? []).filter((attempt: any) => attempt.execution_plan_id === plan?.id).length} attempt${(bundle.tool_action_attempts ?? []).filter((attempt: any) => attempt.execution_plan_id === plan?.id).length === 1 ? '' : 's'}`,
        run.started_at || run.ended_at || run.created_at,
        'Tool execution',
      ),
      buildDerivedNode(
        `workflow:${run.id}:status`,
        'Execution state',
        run.status,
        'workflows',
        run.error || run.status,
        run.ended_at || run.started_at || run.created_at,
        run.error || run.context || 'Execution state',
      ),
    ];
  });
  const conversationNodes = messages.map((message: any) => buildDerivedNode(
    `message:${message.id}`,
    message.sender_name || message.sender_id || message.type,
    message.direction === 'outbound' ? 'healthy' : message.direction === 'inbound' ? 'warning' : 'healthy',
    message.channel || message.direction || 'conversation',
    message.content,
    message.sent_at || message.created_at,
    message.content_type || 'Conversation message',
  ));
  const noteNodes = internalNotes.map((note: any) => buildDerivedNode(
    `note:${note.id}`,
    note.created_by || 'note',
    note.created_by_type === 'system' ? 'healthy' : 'warning',
    'internal',
    note.content,
    note.created_at,
    note.created_by_type || 'note',
  ));
  const linkedCaseNodes = linkedCases.map((item: any) => buildDerivedNode(
    `linked:${item.id}`,
    item.case_number || item.id,
    ['open', 'new', 'pending'].includes((item.status || '').toLowerCase()) ? (item.risk_level || 'warning') : 'healthy',
    'cases',
    item.status,
    item.updated_at || item.created_at,
    item.type || 'Linked case',
  ));

  return {
    snapshot_at: new Date().toISOString(),
    identifiers: {
      case_id: bundle.case.id,
      case_number: bundle.case.case_number,
      customer_id: bundle.case.customer_id || null,
      conversation_id: conversation?.id || bundle.case.conversation_id || null,
      order_ids: compactStrings((bundle.orders ?? []).map((item: any) => item.id)),
      payment_ids: compactStrings((bundle.payments ?? []).map((item: any) => item.id)),
      return_ids: compactStrings((bundle.returns ?? []).map((item: any) => item.id)),
      refund_ids: compactStrings(refunds.map((item: any) => item.id)),
      knowledge_article_ids: compactStrings(knowledgeArticles.map((item: any) => item.id)),
      connector_ids: compactStrings(connectors.map((item: any) => item.id)),
      agent_ids: compactStrings(agents.map((item: any) => item.id)),
      workflow_run_ids: compactStrings(workflowRuns.map((item: any) => item.id)),
      external_refs: compactStrings([
        bundle.case.source_entity_id,
        ...(bundle.orders ?? []).map((item: any) => item.external_order_id),
        ...(bundle.payments ?? []).map((item: any) => item.external_payment_id),
        ...(bundle.returns ?? []).map((item: any) => item.external_return_id),
        ...refunds.map((item: any) => item.external_refund_id),
      ]),
    },
    case: bundle.case,
    customer: bundle.customer || null,
    channel_context: {
      conversation_id: conversation?.id || null,
      channel: conversation?.channel || bundle.case.source_channel || 'web_chat',
      source_system: bundle.case.source_system || bundle.case.source_channel || 'crm',
      subject: conversation?.subject || null,
      external_thread_id: conversation?.external_thread_id || null,
      message_count: (bundle.messages ?? []).length,
      latest_message_preview: (bundle.messages ?? []).at(-1)?.content || null,
      latest_inbound_at: latestInbound?.sent_at || latestInbound?.created_at || null,
      latest_outbound_at: latestOutbound?.sent_at || latestOutbound?.created_at || null,
    },
    systems: {
      orders: {
        key: 'orders',
        label: 'Orders',
        status: nodeStatus(orderNodes, 'healthy'),
        source_of_truth: 'orders',
        summary: bundle.orders?.length ? `${bundle.orders.length} order${bundle.orders.length === 1 ? '' : 's'}` : 'No orders linked',
        identifiers: compactStrings((bundle.orders ?? []).map((item: any) => item.external_order_id || item.id)),
        nodes: orderNodes,
      },
      payments: {
        key: 'payments',
        label: 'Payments',
        status: nodeStatus(paymentNodes, 'warning'),
        source_of_truth: 'payments',
        summary: bundle.payments?.length ? `${bundle.payments.length} payment${bundle.payments.length === 1 ? '' : 's'}` : 'No payments linked',
        identifiers: compactStrings((bundle.payments ?? []).map((item: any) => item.external_payment_id || item.id)),
        nodes: paymentNodes,
      },
      returns: {
        key: 'returns',
        label: 'Returns',
        status: nodeStatus(returnNodes, 'warning'),
        source_of_truth: 'returns',
        summary: bundle.returns?.length ? `${bundle.returns.length} return${bundle.returns.length === 1 ? '' : 's'}` : 'No returns linked',
        identifiers: compactStrings((bundle.returns ?? []).map((item: any) => item.external_return_id || item.id)),
        nodes: returnNodes,
      },
      refunds: {
        key: 'refunds',
        label: 'Refunds',
        status: nodeStatus(refundNodes, 'warning'),
        source_of_truth: 'refunds',
        summary: refunds.length ? `${refunds.length} refund${refunds.length === 1 ? '' : 's'}` : 'No refunds recorded',
        identifiers: compactStrings(refunds.map((item: any) => item.external_refund_id || item.id)),
        nodes: refundNodes,
      },
      approvals: {
        key: 'approvals',
        label: 'Approvals',
        status: nodeStatus(approvalNodes, 'warning'),
        source_of_truth: 'approvals',
        summary: approvalRequests.length ? `${approvalRequests.length} approval${approvalRequests.length === 1 ? '' : 's'}` : bundle.case.approval_state || 'not_required',
        identifiers: compactStrings(approvalRequests.map((item: any) => item.id)),
        nodes: approvalNodes,
      },
      reconciliation: {
        key: 'reconciliation',
        label: 'Reconciliation',
        status: nodeStatus(reconciliationNodes, 'warning'),
        source_of_truth: conflict.source_of_truth || 'reconciliation',
        summary: conflict.root_cause || 'No active reconciliation issues',
        identifiers: compactStrings(reconciliationIssues.map((item: any) => item.id)),
        nodes: reconciliationNodes,
      },
      knowledge: {
        key: 'knowledge',
        label: 'Knowledge',
        status: nodeStatus(knowledgeNodes, 'warning'),
        source_of_truth: 'knowledge',
        summary: caseKnowledgeLinks.length ? `${caseKnowledgeLinks.length} linked article${caseKnowledgeLinks.length === 1 ? '' : 's'}` : 'No knowledge links',
        identifiers: compactStrings(knowledgeArticles.map((article: any) => article.id)),
        nodes: knowledgeNodes,
      },
      integrations: {
        key: 'integrations',
        label: 'Integrations',
        status: nodeStatus(integrationNodes, 'healthy'),
        source_of_truth: 'connectors',
        summary: connectors.length ? `${connectors.length} connector${connectors.length === 1 ? '' : 's'}` : 'No active integrations',
        identifiers: compactStrings(connectors.map((connector: any) => connector.system || connector.name || connector.id)),
        nodes: integrationNodes,
      },
      ai_studio: {
        key: 'ai_studio',
        label: 'AI Studio',
        status: nodeStatus(aiStudioNodes, 'warning'),
        source_of_truth: 'agents',
        summary: agents.length ? `${agents.length} agent${agents.length === 1 ? '' : 's'}` : 'No agents configured',
        identifiers: compactStrings(agents.map((agent: any) => agent.slug || agent.id)),
        nodes: aiStudioNodes,
      },
      workflows: {
        key: 'workflows',
        label: 'Workflows',
        status: nodeStatus(workflowNodes, 'warning'),
        source_of_truth: 'workflows',
        summary: workflowRuns.length ? `${workflowRuns.length} workflow run${workflowRuns.length === 1 ? '' : 's'}` : 'No workflow runs',
        identifiers: compactStrings(workflowRuns.map((run: any) => run.workflow_version_id || run.id)),
        nodes: workflowNodes,
      },
      conversation: {
        key: 'conversation',
        label: 'Conversation',
        status: canonicalHealth(latestMessageIsInbound ? 'warning' : 'healthy'),
        source_of_truth: conversation?.channel || bundle.case.source_channel || 'conversation',
        summary: conversation?.subject || bundle.case.ai_diagnosis || 'Conversation history',
        identifiers: compactStrings([conversation?.id, bundle.case.conversation_id]),
        nodes: conversationNodes,
      },
      notes: {
        key: 'notes',
        label: 'Internal Notes',
        status: canonicalHealth('healthy'),
        source_of_truth: 'internal_notes',
        summary: internalNotes[0]?.content || 'No internal notes',
        identifiers: compactStrings(internalNotes.map((item: any) => item.id)),
        nodes: noteNodes,
      },
      linked_cases: {
        key: 'linked_cases',
        label: 'Linked Cases',
        status: canonicalHealth(linkedCases.some((item: any) => ['open', 'new', 'pending'].includes((item.status || '').toLowerCase())) ? 'warning' : linkedCases.length ? 'healthy' : 'healthy'),
        source_of_truth: 'cases',
        summary: linkedCases.length ? `${linkedCases.length} related cases` : 'No related cases',
        identifiers: compactStrings(linkedCases.map((item: any) => item.case_number || item.id)),
        nodes: linkedCaseNodes,
      },
    },
    conflict: {
      has_conflict: conflict.has_conflict,
      conflict_type: conflict.has_conflict ? 'state_conflict' : null,
      root_cause: conflict.root_cause,
      source_of_truth: bundle.reconciliation_issues?.[0]?.source_of_truth || null,
      recommended_action: conflict.recommended_action,
      severity: conflict.severity,
      evidence_refs: compactStrings((bundle.reconciliation_issues ?? []).map((item: any) => item.id)),
    },
    related: {
      orders: bundle.orders ?? [],
      payments: bundle.payments ?? [],
      returns: bundle.returns ?? [],
      refunds,
      approvals: bundle.approvals ?? [],
      reconciliation_issues: bundle.reconciliation_issues ?? [],
      linked_cases: bundle.linked_cases ?? [],
      case_knowledge_links: caseKnowledgeLinks,
      knowledge_articles: knowledgeArticles,
      connectors,
      agents,
      agent_versions: agentVersions,
      workflow_runs: workflowRuns,
    },
    timeline: buildTimeline(bundle),
  };
}

function buildInboxView(bundle: any) {
  const state = buildCaseState(bundle);
  const drafts = bundle.drafts ?? [];
  return {
    case: bundle.case,
    state,
    conversation: bundle.conversation,
    messages: bundle.messages ?? [],
    drafts,
    latest_draft: drafts[0] ?? null,
    internal_notes: bundle.internal_notes ?? [],
    sla: buildSlaView(bundle.case),
  };
}

function buildGraphView(bundle: any) {
  const state = buildCaseState(bundle);
  return {
    root: {
      case_id: bundle.case.id,
      case_number: bundle.case.case_number,
      order_id: bundle.orders?.[0]?.external_order_id || bundle.orders?.[0]?.id || 'N/A',
      customer_name: bundle.customer?.canonical_name || bundle.case.customer_name || 'Unknown customer',
      risk_level: bundle.case.risk_level,
      status: bundle.case.status,
    },
    branches: Object.values(state.systems),
    timeline: state.timeline,
  };
}

function buildResolveView(bundle: any) {
  const state = buildCaseState(bundle);
  const conflict = state.conflict;
  const policyEvaluations = bundle.policy_evaluations ?? [];
  const policyRules = bundle.policy_rules ?? [];
  const knowledgeArticles = bundle.knowledge_articles ?? [];
  const approvalRequests = bundle.approvals ?? [];
  const executionPlan = bundle.execution_plans?.find((plan: any) => plan.id === bundle.case.active_execution_plan_id || plan.id === approvalRequests[0]?.execution_plan_id) || bundle.execution_plans?.[0] || null;
  const relevantTimeline = state.timeline.filter((entry: any) =>
    ['case_status_history', 'reconciliation_issue', 'approval_request', 'policy_evaluation', 'execution_plan', 'workflow_run', 'workflow_run_step', 'order_event', 'return_event', 'refund', 'webhook_event']
      .includes(entry.entry_type),
  );
  return {
    case_id: bundle.case.id,
    case_number: bundle.case.case_number,
    status: bundle.case.status,
    conflict: {
      title: conflict.has_conflict ? 'Conflict detected' : 'No conflict detected',
      summary: conflict.root_cause || bundle.case.ai_diagnosis || 'No active blockers detected.',
      severity: canonicalHealth(conflict.severity || 'pending'),
      source_of_truth: conflict.source_of_truth,
      root_cause: conflict.root_cause,
      recommended_action: conflict.recommended_action,
    },
    blockers: Object.values(state.systems)
      .filter((branch: any) => ['warning', 'critical', 'blocked'].includes(branch.status))
      .map((branch: any) => ({
        key: branch.key,
        label: branch.label,
        status: branch.status,
        summary: branch.summary,
        source_of_truth: branch.source_of_truth,
        evidence: branch.identifiers?.slice(0, 4) || [],
      })),
    identifiers: [
      { label: 'Case', value: bundle.case.case_number, source: 'cases' },
      { label: 'Customer', value: bundle.customer?.canonical_name || bundle.case.customer_name || 'Unknown', source: 'customers' },
      ...compactStrings((state.identifiers.external_refs ?? [])).map((value) => ({ label: 'Reference', value, source: 'external' })),
    ],
    expected_post_resolution_state: Object.values(state.systems).map((branch: any) => ({
      key: branch.key,
      label: branch.label,
      status: 'healthy',
      summary: `Expected ${branch.label.toLowerCase()} to be healthy after resolution.`,
    })),
    policy: {
      rules: policyRules.map((rule: any) => ({
        id: rule.id,
        name: rule.name,
        entity_type: rule.entity_type,
        description: rule.description,
        active: rule.is_active,
      })),
      evaluations: policyEvaluations.map((evaluation: any) => ({
        id: evaluation.id,
        decision: evaluation.decision,
        reason: evaluation.reason,
        matched_rule_id: evaluation.matched_rule_id,
        requires_approval: evaluation.requires_approval,
      })),
    },
    knowledge: {
      articles: knowledgeArticles.map((article: any) => ({
        id: article.id,
        title: article.title,
        status: article.status,
        outdated_flag: article.outdated_flag,
      })),
    },
    execution: {
      mode: 'manual',
      status: bundle.case.execution_state || 'idle',
      requires_approval: ['pending', 'awaiting_approval'].includes((bundle.case.approval_state || '').toLowerCase()),
      approval_state: bundle.case.approval_state,
      plan_id: bundle.case.active_execution_plan_id || executionPlan?.id || null,
      plan: executionPlan ? {
        id: executionPlan.id,
        status: executionPlan.status,
        approval_request_id: executionPlan.approval_request_id,
        dry_run_result: executionPlan.dry_run_result,
      } : null,
      steps: relevantTimeline.slice(0, 12).map((entry: any, index: number) => ({
        id: `${entry.id}:${index}`,
        label: entry.content,
        status: entry.severity,
        source: entry.source,
        context: entry.domain,
      })),
    },
    linked_cases: bundle.linked_cases ?? [],
    notes: bundle.internal_notes ?? [],
  };
}

async function fetchCaseBundleSupabase(scope: CaseScope, caseId: string) {
  const supabase = getSupabaseAdmin();
  const { data: caseRow, error: caseError } = await supabase
    .from('cases')
    .select('*')
    .eq('id', caseId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (caseError) throw caseError;
  if (!caseRow) return null;

  const [
    customerResult,
    conversationResult,
    ordersResult,
    paymentsResult,
    returnsResult,
    refundsResult,
    approvalsResult,
    issuesResult,
    linksResult,
    draftsResult,
    notesResult,
    messagesResult,
    userResult,
    teamResult,
    caseStatusHistoryResult,
    orderEventsResult,
    returnEventsResult,
    caseKnowledgeLinksResult,
    connectorsResult,
    agentsResult,
    executionPlansResult,
    toolActionAttemptsResult,
    policyRulesResult,
    policyEvaluationsResult,
    webhookEventsResult,
    workflowRunsResult,
    canonicalEventsResult,
  ] = await Promise.all([
    caseRow.customer_id ? supabase.from('customers').select('*').eq('id', caseRow.customer_id).maybeSingle() : Promise.resolve({ data: null, error: null } as any),
    supabase.from('conversations').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId).order('last_message_at', { ascending: false }).limit(1).maybeSingle(),
    caseRow.order_ids?.length ? supabase.from('orders').select('*').in('id', caseRow.order_ids).eq('tenant_id', scope.tenantId) : Promise.resolve({ data: [], error: null } as any),
    caseRow.payment_ids?.length ? supabase.from('payments').select('*').in('id', caseRow.payment_ids).eq('tenant_id', scope.tenantId) : Promise.resolve({ data: [], error: null } as any),
    caseRow.return_ids?.length ? supabase.from('returns').select('*').in('id', caseRow.return_ids).eq('tenant_id', scope.tenantId) : Promise.resolve({ data: [], error: null } as any),
    supabase.from('refunds').select('*').eq('tenant_id', scope.tenantId),
    supabase.from('approval_requests').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).order('created_at', { ascending: false }),
    supabase.from('reconciliation_issues').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).order('detected_at', { ascending: false }),
    supabase.from('case_links').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId),
    supabase.from('draft_replies').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).order('generated_at', { ascending: false }),
    supabase.from('internal_notes').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).order('created_at', { ascending: false }),
    supabase.from('messages').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).order('sent_at', { ascending: true }),
    caseRow.assigned_user_id ? supabase.from('users').select('name, email').eq('id', caseRow.assigned_user_id).maybeSingle() : Promise.resolve({ data: null, error: null } as any),
    caseRow.assigned_team_id ? supabase.from('teams').select('name').eq('id', caseRow.assigned_team_id).maybeSingle() : Promise.resolve({ data: null, error: null } as any),
    supabase.from('case_status_history').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).order('created_at', { ascending: false }),
    caseRow.order_ids?.length ? supabase.from('order_events').select('*').in('order_id', caseRow.order_ids).eq('tenant_id', scope.tenantId) : Promise.resolve({ data: [], error: null } as any),
    caseRow.return_ids?.length ? supabase.from('return_events').select('*').in('return_id', caseRow.return_ids).eq('tenant_id', scope.tenantId) : Promise.resolve({ data: [], error: null } as any),
    supabase.from('case_knowledge_links').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId),
    supabase.from('connectors').select('*').eq('tenant_id', scope.tenantId),
    supabase.from('agents').select('*').eq('tenant_id', scope.tenantId),
    supabase.from('execution_plans').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).order('generated_at', { ascending: false }),
    supabase.from('tool_action_attempts').select('*').eq('tenant_id', scope.tenantId).order('started_at', { ascending: false }),
    supabase.from('policy_rules').select('*').eq('tenant_id', scope.tenantId).order('created_at', { ascending: false }),
    supabase.from('policy_evaluations').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).order('created_at', { ascending: false }),
    supabase.from('webhook_events').select('*').eq('tenant_id', scope.tenantId).order('received_at', { ascending: false }),
    supabase.from('workflow_runs').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).order('started_at', { ascending: false }),
    supabase.from('canonical_events').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).order('occurred_at', { ascending: false }),
  ]);

  for (const result of [customerResult, conversationResult, ordersResult, paymentsResult, returnsResult, refundsResult, approvalsResult, issuesResult, linksResult, draftsResult, notesResult, messagesResult, userResult, teamResult, caseStatusHistoryResult, orderEventsResult, returnEventsResult, caseKnowledgeLinksResult, connectorsResult, agentsResult, executionPlansResult, toolActionAttemptsResult, policyRulesResult, policyEvaluationsResult, webhookEventsResult, workflowRunsResult, canonicalEventsResult]) {
    if (result?.error) throw result.error;
  }

  const workflowRunIds = compactStrings((workflowRunsResult.data ?? []).map((row: any) => row.id));
  const workflowRunStepsResult = workflowRunIds.length
    ? await supabase.from('workflow_run_steps').select('*').in('workflow_run_id', workflowRunIds).order('started_at', { ascending: false })
    : Promise.resolve({ data: [], error: null } as any);
  if (workflowRunStepsResult?.error) throw workflowRunStepsResult.error;

  const relatedCaseIds = compactStrings((linksResult.data ?? []).map((row: any) => row.linked_case_id));
  const linkedCases = relatedCaseIds.length
    ? ((await supabase.from('cases').select('id, case_number, type, status, priority, risk_level').in('id', relatedCaseIds).eq('tenant_id', scope.tenantId)).data ?? [])
    : [];
  const knowledgeArticleIds = compactStrings((caseKnowledgeLinksResult.data ?? []).map((row: any) => row.article_id));
  const knowledgeArticles = knowledgeArticleIds.length
    ? ((await supabase.from('knowledge_articles').select('*').in('id', knowledgeArticleIds).eq('tenant_id', scope.tenantId)).data ?? [])
    : [];
  const agentVersionIds = compactStrings((agentsResult.data ?? []).map((row: any) => row.current_version_id));
  const agentVersions = agentVersionIds.length
    ? ((await supabase.from('agent_versions').select('*').in('id', agentVersionIds).eq('tenant_id', scope.tenantId)).data ?? [])
    : [];
  const refundSourceIds = compactStrings([
    ...(caseRow.payment_ids ?? []),
    ...(caseRow.order_ids ?? []),
    ...(caseRow.return_ids ?? []),
    caseRow.customer_id,
  ]);
  const refunds = (refundsResult.data ?? []).filter((row: any) => !refundSourceIds.length
    || refundSourceIds.includes(row.payment_id)
    || refundSourceIds.includes(row.order_id)
    || refundSourceIds.includes(row.customer_id));

  return {
    case: {
      ...caseRow,
      customer_name: customerResult.data?.canonical_name || null,
      customer_email: customerResult.data?.canonical_email || null,
      customer_segment: customerResult.data?.segment || null,
      lifetime_value: customerResult.data?.lifetime_value || null,
      customer_risk: customerResult.data?.risk_level || null,
      total_orders: customerResult.data?.total_orders || null,
      total_spent: customerResult.data?.total_spent || null,
      dispute_rate: customerResult.data?.dispute_rate || null,
      refund_rate: customerResult.data?.refund_rate || null,
      assigned_user_name: userResult.data?.name || null,
      assigned_user_email: userResult.data?.email || null,
      assigned_team_name: teamResult.data?.name || null,
    },
    customer: customerResult.data,
    conversation: conversationResult.data,
    orders: ordersResult.data ?? [],
    payments: paymentsResult.data ?? [],
    returns: returnsResult.data ?? [],
    refunds,
    approvals: approvalsResult.data ?? [],
    reconciliation_issues: issuesResult.data ?? [],
    case_status_history: caseStatusHistoryResult.data ?? [],
    linked_cases: linkedCases,
    drafts: draftsResult.data ?? [],
    internal_notes: notesResult.data ?? [],
    messages: messagesResult.data ?? [],
    order_events: orderEventsResult.data ?? [],
    return_events: returnEventsResult.data ?? [],
    workflow_run_steps: workflowRunStepsResult.data ?? [],
    case_knowledge_links: caseKnowledgeLinksResult.data ?? [],
    knowledge_articles: knowledgeArticles,
    connectors: connectorsResult.data ?? [],
    agents: agentsResult.data ?? [],
    execution_plans: executionPlansResult.data ?? [],
    tool_action_attempts: toolActionAttemptsResult.data ?? [],
    policy_rules: policyRulesResult.data ?? [],
    policy_evaluations: policyEvaluationsResult.data ?? [],
    webhook_events: webhookEventsResult.data ?? [],
    agent_versions: agentVersions,
    workflow_runs: workflowRunsResult.data ?? [],
    canonical_events: canonicalEventsResult.data ?? [],
  };
}

function fetchCaseBundleSqlite(scope: CaseScope, caseId: string) {
  const db = getDb();
  const row = db.prepare(`
    SELECT c.*,
           cu.canonical_name AS customer_name, cu.canonical_email AS customer_email,
           cu.segment AS customer_segment, cu.lifetime_value, cu.risk_level AS customer_risk,
           cu.total_orders, cu.total_spent, cu.dispute_rate, cu.refund_rate,
           u.name AS assigned_user_name, u.email AS assigned_user_email,
           t.name AS assigned_team_name
    FROM cases c
    LEFT JOIN customers cu ON c.customer_id = cu.id
    LEFT JOIN users u ON c.assigned_user_id = u.id
    LEFT JOIN teams t ON c.assigned_team_id = t.id
    WHERE c.id = ? AND c.tenant_id = ? AND c.workspace_id = ?
  `).get(caseId, scope.tenantId, scope.workspaceId) as any;

  if (!row) return null;
  const parsedCase = parseRow(row) as any;

  const conversation = db.prepare(`
    SELECT *
    FROM conversations
    WHERE case_id = ? AND tenant_id = ? AND workspace_id = ?
    ORDER BY last_message_at DESC, created_at DESC
    LIMIT 1
  `).get(caseId, scope.tenantId, scope.workspaceId);

  const customer = parsedCase.customer_id
    ? db.prepare('SELECT * FROM customers WHERE id = ? AND tenant_id = ? AND workspace_id = ?').get(parsedCase.customer_id, scope.tenantId, scope.workspaceId)
    : null;

  const orders = parsedCase.order_ids?.length
    ? db.prepare(`SELECT * FROM orders WHERE tenant_id = ? AND id IN (${parsedCase.order_ids.map(() => '?').join(',')})`).all(scope.tenantId, ...parsedCase.order_ids)
    : [];
  const payments = parsedCase.payment_ids?.length
    ? db.prepare(`SELECT * FROM payments WHERE tenant_id = ? AND id IN (${parsedCase.payment_ids.map(() => '?').join(',')})`).all(scope.tenantId, ...parsedCase.payment_ids)
    : [];
  const returns = parsedCase.return_ids?.length
    ? db.prepare(`SELECT * FROM returns WHERE tenant_id = ? AND id IN (${parsedCase.return_ids.map(() => '?').join(',')})`).all(scope.tenantId, ...parsedCase.return_ids)
    : [];
  const refunds = db.prepare(`SELECT * FROM refunds WHERE tenant_id = ?`).all(scope.tenantId).filter((row: any) => !parsedCase.order_ids?.length && !parsedCase.payment_ids?.length && !parsedCase.customer_id ? true : [row.payment_id, row.order_id, row.customer_id].some((value) => [ ...(parsedCase.payment_ids ?? []), ...(parsedCase.order_ids ?? []), parsedCase.customer_id ].includes(value)));
  const approvals = db.prepare(`SELECT * FROM approval_requests WHERE case_id = ? AND tenant_id = ? ORDER BY created_at DESC`).all(caseId, scope.tenantId);
  const reconciliationIssues = db.prepare(`SELECT * FROM reconciliation_issues WHERE case_id = ? AND tenant_id = ? ORDER BY created_at DESC`).all(caseId, scope.tenantId);
  const caseLinks = db.prepare(`SELECT * FROM case_links WHERE case_id = ? AND tenant_id = ?`).all(caseId, scope.tenantId);
  const linkedCaseIds = compactStrings(caseLinks.map((item: any) => item.linked_case_id));
  const linkedCases = linkedCaseIds.length
    ? db.prepare(`SELECT id, case_number, type, status, priority, risk_level FROM cases WHERE tenant_id = ? AND id IN (${linkedCaseIds.map(() => '?').join(',')})`).all(scope.tenantId, ...linkedCaseIds)
    : [];
  const drafts = db.prepare(`SELECT * FROM draft_replies WHERE case_id = ? AND tenant_id = ? ORDER BY generated_at DESC`).all(caseId, scope.tenantId);
  const internalNotes = db.prepare(`SELECT * FROM internal_notes WHERE case_id = ? AND tenant_id = ? ORDER BY created_at DESC`).all(caseId, scope.tenantId);
  const messages = db.prepare(`SELECT * FROM messages WHERE case_id = ? AND tenant_id = ? ORDER BY sent_at ASC`).all(caseId, scope.tenantId);
  const caseStatusHistory = db.prepare(`SELECT * FROM case_status_history WHERE case_id = ? AND tenant_id = ? ORDER BY created_at DESC`).all(caseId, scope.tenantId);
  const orderEvents = parsedCase.order_ids?.length
    ? db.prepare(`SELECT * FROM order_events WHERE tenant_id = ? AND order_id IN (${parsedCase.order_ids.map(() => '?').join(',')}) ORDER BY time ASC`).all(scope.tenantId, ...parsedCase.order_ids)
    : [];
  const returnEvents = parsedCase.return_ids?.length
    ? db.prepare(`SELECT * FROM return_events WHERE tenant_id = ? AND return_id IN (${parsedCase.return_ids.map(() => '?').join(',')}) ORDER BY time ASC`).all(scope.tenantId, ...parsedCase.return_ids)
    : [];
  const workflowRunSteps = db.prepare(`SELECT * FROM workflow_run_steps WHERE workflow_run_id IN (SELECT id FROM workflow_runs WHERE case_id = ? AND tenant_id = ?)`).all(caseId, scope.tenantId);
  const caseKnowledgeLinks = db.prepare(`SELECT * FROM case_knowledge_links WHERE case_id = ? AND tenant_id = ?`).all(caseId, scope.tenantId);
  const knowledgeArticleIds = compactStrings(caseKnowledgeLinks.map((link: any) => link.article_id));
  const knowledgeArticles = knowledgeArticleIds.length
    ? db.prepare(`SELECT * FROM knowledge_articles WHERE tenant_id = ? AND id IN (${knowledgeArticleIds.map(() => '?').join(',')})`).all(scope.tenantId, ...knowledgeArticleIds)
    : [];
  const connectors = db.prepare(`SELECT * FROM connectors WHERE tenant_id = ?`).all(scope.tenantId);
  const agents = db.prepare(`SELECT * FROM agents WHERE tenant_id = ?`).all(scope.tenantId);
  const agentVersions = agents.length
    ? db.prepare(`SELECT * FROM agent_versions WHERE tenant_id = ? AND id IN (${compactStrings(agents.map((agent: any) => agent.current_version_id)).map(() => '?').join(',')})`).all(scope.tenantId, ...compactStrings(agents.map((agent: any) => agent.current_version_id)))
    : [];
  const executionPlans = db.prepare(`SELECT * FROM execution_plans WHERE case_id = ? AND tenant_id = ? ORDER BY generated_at DESC`).all(caseId, scope.tenantId);
  const toolActionAttempts = db.prepare(`SELECT * FROM tool_action_attempts WHERE tenant_id = ? ORDER BY started_at DESC`).all(scope.tenantId);
  const policyRules = db.prepare(`SELECT * FROM policy_rules WHERE tenant_id = ? ORDER BY created_at DESC`).all(scope.tenantId);
  const policyEvaluations = db.prepare(`SELECT * FROM policy_evaluations WHERE case_id = ? AND tenant_id = ? ORDER BY created_at DESC`).all(caseId, scope.tenantId);
  const webhookEvents = db.prepare(`SELECT * FROM webhook_events WHERE tenant_id = ? ORDER BY received_at DESC`).all(scope.tenantId);
  const workflowRuns = db.prepare(`SELECT * FROM workflow_runs WHERE case_id = ? AND tenant_id = ? ORDER BY started_at DESC`).all(caseId, scope.tenantId);
  const canonicalEvents = db.prepare(`SELECT * FROM canonical_events WHERE case_id = ? AND tenant_id = ? ORDER BY occurred_at DESC`).all(caseId, scope.tenantId);

  return {
    case: parsedCase,
    customer: customer ? parseRow(customer) : null,
    conversation: conversation ? parseRow(conversation) : null,
    orders: orders.map(parseRow),
    payments: payments.map(parseRow),
    returns: returns.map(parseRow),
    refunds: refunds.map(parseRow),
    approvals: approvals.map(parseRow),
    reconciliation_issues: reconciliationIssues.map(parseRow),
    linked_cases: linkedCases.map(parseRow),
    drafts: drafts.map(parseRow),
    internal_notes: internalNotes.map(parseRow),
    messages: messages.map(parseRow),
    case_status_history: caseStatusHistory.map(parseRow),
    order_events: orderEvents.map(parseRow),
    return_events: returnEvents.map(parseRow),
    workflow_run_steps: workflowRunSteps.map(parseRow),
    case_knowledge_links: caseKnowledgeLinks.map(parseRow),
    knowledge_articles: knowledgeArticles.map(parseRow),
    connectors: connectors.map(parseRow),
    agents: agents.map(parseRow),
    agent_versions: agentVersions.map(parseRow),
    execution_plans: executionPlans.map(parseRow),
    tool_action_attempts: toolActionAttempts.map(parseRow),
    policy_rules: policyRules.map(parseRow),
    policy_evaluations: policyEvaluations.map(parseRow),
    webhook_events: webhookEvents.map(parseRow),
    workflow_runs: workflowRuns.map(parseRow),
    canonical_events: canonicalEvents.map(parseRow),
  };
}

function listCasesSqlite(scope: CaseScope, filters: CaseFilters) {
  const db = getDb();
  let query = `
    SELECT c.*,
           cu.canonical_name AS customer_name, cu.canonical_email AS customer_email,
           cu.segment AS customer_segment,
           u.name AS assigned_user_name,
           t.name AS assigned_team_name
    FROM cases c
    LEFT JOIN customers cu ON c.customer_id = cu.id
    LEFT JOIN users u ON c.assigned_user_id = u.id
    LEFT JOIN teams t ON c.assigned_team_id = t.id
    WHERE c.tenant_id = ? AND c.workspace_id = ?
  `;
  const params: any[] = [scope.tenantId, scope.workspaceId];

  if (filters.status) { query += ' AND c.status = ?'; params.push(filters.status); }
  if (filters.assigned_user_id) { query += ' AND c.assigned_user_id = ?'; params.push(filters.assigned_user_id); }
  if (filters.priority) { query += ' AND c.priority = ?'; params.push(filters.priority); }
  if (filters.risk_level) { query += ' AND c.risk_level = ?'; params.push(filters.risk_level); }
  if (filters.q) {
    query += ' AND (c.case_number LIKE ? OR cu.canonical_name LIKE ? OR cu.canonical_email LIKE ?)';
    const term = `%${filters.q}%`;
    params.push(term, term, term);
  }
  query += ' ORDER BY c.last_activity_at DESC';

  return db.prepare(query).all(...params).map((row: any) => {
    const parsed = parseRow(row) as any;
    const message = db.prepare(`
      SELECT content, sent_at
      FROM messages
      WHERE case_id = ? AND tenant_id = ?
      ORDER BY sent_at DESC
      LIMIT 1
    `).get(parsed.id, scope.tenantId) as any;
    const orders: any[] = parsed.order_ids?.length
      ? db.prepare(`SELECT status, fulfillment_status FROM orders WHERE tenant_id = ? AND id IN (${parsed.order_ids.map(() => '?').join(',')}) LIMIT 1`).all(scope.tenantId, ...parsed.order_ids)
      : [];
    const payments: any[] = parsed.payment_ids?.length
      ? db.prepare(`SELECT status FROM payments WHERE tenant_id = ? AND id IN (${parsed.payment_ids.map(() => '?').join(',')}) LIMIT 1`).all(scope.tenantId, ...parsed.payment_ids)
      : [];
    const returns: any[] = parsed.return_ids?.length
      ? db.prepare(`SELECT status FROM returns WHERE tenant_id = ? AND id IN (${parsed.return_ids.map(() => '?').join(',')}) LIMIT 1`).all(scope.tenantId, ...parsed.return_ids)
      : [];
    const refunds: any[] = db.prepare(`SELECT status FROM refunds WHERE tenant_id = ?`).all(scope.tenantId)
      .filter((row: any) => {
        const keys = [...(parsed.payment_ids ?? []), ...(parsed.order_ids ?? []), parsed.customer_id].filter(Boolean);
        return keys.includes(row.payment_id) || keys.includes(row.order_id) || keys.includes(row.customer_id);
      });

    return {
      ...parsed,
      latest_message_preview: message?.content || null,
      channel_context: {
        channel: parsed.source_channel || 'web_chat',
        latest_message_at: message?.sent_at || parsed.last_activity_at,
      },
        system_status_summary: {
          order: orders[0]?.status || 'N/A',
          payment: payments[0]?.status || 'N/A',
          fulfillment: orders[0]?.fulfillment_status || 'N/A',
          refund: refunds[0]?.status || returns[0]?.refund_status || 'N/A',
          approval: parsed.approval_state || 'not_required',
        },
      conflict_summary: {
        has_conflict: Boolean(parsed.has_reconciliation_conflicts),
        severity: parsed.conflict_severity || parsed.risk_level || 'warning',
        root_cause: parsed.ai_root_cause || null,
        recommended_action: parsed.ai_recommended_action || null,
      },
    };
  });
}

async function listCasesSupabase(scope: CaseScope, filters: CaseFilters) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('cases')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('last_activity_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.assigned_user_id) query = query.eq('assigned_user_id', filters.assigned_user_id);
  if (filters.priority) query = query.eq('priority', filters.priority);
  if (filters.risk_level) query = query.eq('risk_level', filters.risk_level);
  if (filters.q) query = query.ilike('case_number', `%${filters.q}%`);

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const caseIds = rows.map((row) => row.id);
  const customerIds = compactStrings(rows.map((row) => row.customer_id));
  const orderIds = compactStrings(rows.flatMap((row) => row.order_ids ?? []));
  const paymentIds = compactStrings(rows.flatMap((row) => row.payment_ids ?? []));
  const returnIds = compactStrings(rows.flatMap((row) => row.return_ids ?? []));
  const userIds = compactStrings(rows.map((row) => row.assigned_user_id));
  const teamIds = compactStrings(rows.map((row) => row.assigned_team_id));

  const [customersRes, usersRes, teamsRes, messagesRes, ordersRes, paymentsRes, returnsRes, refundsRes] = await Promise.all([
    customerIds.length ? supabase.from('customers').select('id, canonical_name, canonical_email, segment').in('id', customerIds) : Promise.resolve({ data: [], error: null } as any),
    userIds.length ? supabase.from('users').select('id, name').in('id', userIds) : Promise.resolve({ data: [], error: null } as any),
    teamIds.length ? supabase.from('teams').select('id, name').in('id', teamIds) : Promise.resolve({ data: [], error: null } as any),
    caseIds.length ? supabase.from('messages').select('case_id, content, sent_at').in('case_id', caseIds).eq('tenant_id', scope.tenantId).order('sent_at', { ascending: false }) : Promise.resolve({ data: [], error: null } as any),
    orderIds.length ? supabase.from('orders').select('id, status, fulfillment_status, external_order_id, updated_at, has_conflict, conflict_domain, conflict_detected, risk_level').in('id', orderIds).eq('tenant_id', scope.tenantId) : Promise.resolve({ data: [], error: null } as any),
    paymentIds.length ? supabase.from('payments').select('id, order_id, customer_id, status, approval_status, external_payment_id, updated_at, has_conflict, conflict_detected, risk_level').in('id', paymentIds).eq('tenant_id', scope.tenantId) : Promise.resolve({ data: [], error: null } as any),
    returnIds.length ? supabase.from('returns').select('id, order_id, customer_id, status, approval_status, refund_status, external_return_id, updated_at, has_conflict, conflict_detected, risk_level').in('id', returnIds).eq('tenant_id', scope.tenantId) : Promise.resolve({ data: [], error: null } as any),
    (orderIds.length || paymentIds.length || returnIds.length || customerIds.length)
      ? supabase.from('refunds').select('id, payment_id, order_id, customer_id, status, external_refund_id, updated_at').eq('tenant_id', scope.tenantId)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  for (const result of [customersRes, usersRes, teamsRes, messagesRes, ordersRes, paymentsRes, returnsRes, refundsRes]) {
    if (result?.error) throw result.error;
  }

  const customers = new Map<string, any>((customersRes.data ?? []).map((row: any) => [row.id, row]));
  const users = new Map<string, any>((usersRes.data ?? []).map((row: any) => [row.id, row]));
  const teams = new Map<string, any>((teamsRes.data ?? []).map((row: any) => [row.id, row]));
  const latestMessageByCase = new Map<string, any>();
  for (const row of messagesRes.data ?? []) {
    if (!latestMessageByCase.has(row.case_id)) latestMessageByCase.set(row.case_id, row);
  }
  const orders = new Map<string, any>((ordersRes.data ?? []).map((row: any) => [row.id, row]));
  const payments = new Map<string, any>((paymentsRes.data ?? []).map((row: any) => [row.id, row]));
  const returns = new Map<string, any>((returnsRes.data ?? []).map((row: any) => [row.id, row]));
  const refunds = (refundsRes.data ?? []) as any[];

  return rows
    .filter((row) => {
      if (!filters.q) return true;
      const customer = row.customer_id ? customers.get(row.customer_id) : null;
      const term = filters.q!.toLowerCase();
      return Boolean(
        row.case_number?.toLowerCase().includes(term)
        || customer?.canonical_name?.toLowerCase().includes(term)
        || customer?.canonical_email?.toLowerCase().includes(term),
      );
    })
    .map((row) => {
      const customer = row.customer_id ? customers.get(row.customer_id) : null;
      const latestMessage = latestMessageByCase.get(row.id);
      const relatedOrders = (row.order_ids ?? []).map((id: string) => orders.get(id)).filter(Boolean);
      const relatedPayments = (row.payment_ids ?? []).map((id: string) => payments.get(id)).filter(Boolean);
      const relatedReturns = (row.return_ids ?? []).map((id: string) => returns.get(id)).filter(Boolean);
      const refund = refunds.find((item: any) => [item.payment_id, item.order_id, item.customer_id].some((value) => [ ...(row.payment_ids ?? []), ...(row.order_ids ?? []), row.customer_id ].includes(value)));
      return {
        ...row,
        customer_name: customer?.canonical_name || null,
        customer_email: customer?.canonical_email || null,
        customer_segment: customer?.segment || null,
        assigned_user_name: row.assigned_user_id ? users.get(row.assigned_user_id)?.name || null : null,
        assigned_team_name: row.assigned_team_id ? teams.get(row.assigned_team_id)?.name || null : null,
        latest_message_preview: latestMessage?.content || null,
        channel_context: {
          channel: row.source_channel || 'web_chat',
          latest_message_at: latestMessage?.sent_at || row.last_activity_at,
        },
        system_status_summary: {
          order: relatedOrders[0]?.status || 'N/A',
          payment: relatedPayments[0]?.status || 'N/A',
          fulfillment: relatedOrders[0]?.fulfillment_status || relatedOrders[0]?.status || 'N/A',
          refund: refund?.status || relatedReturns[0]?.refund_status || relatedPayments[0]?.refund_status || 'N/A',
          approval: row.approval_state || 'not_required',
        },
        conflict_summary: {
          has_conflict: Boolean(row.has_reconciliation_conflicts),
          severity: row.conflict_severity || row.risk_level || 'warning',
          root_cause: row.ai_root_cause || null,
          recommended_action: row.ai_recommended_action || null,
        },
      };
    });
}
export interface CaseRepository {
  list(scope: CaseScope, filters: CaseFilters): Promise<any[]>;
  getBundle(scope: CaseScope, caseId: string): Promise<any | null>;
  update(scope: CaseScope, id: string, updates: any): Promise<void>;
  addStatusHistory(scope: CaseScope, data: any): Promise<void>;
  updateConflictState(scope: CaseScope, caseId: string, hasConflict: boolean, severity: string | null): Promise<void>;
  findOpenCase(scope: CaseScope, customerId: string | null, type: string, windowHours: number): Promise<string | null>;
  getNextCaseNumber(scope: CaseScope): Promise<string>;
  createCase(scope: CaseScope, data: any): Promise<string>;
  getOpenReconciliationIssues(scope: CaseScope, caseId: string): Promise<any[]>;
  upsertReconciliationIssue(scope: CaseScope, data: any): Promise<string>;
  findStaleCases(scope: CaseScope, limit: number, thresholdMins: number): Promise<any[]>;
}

async function updateConflictStateSqlite(scope: CaseScope, caseId: string, hasConflict: boolean, severity: string | null) {
  const db = getDb();
  db.prepare('UPDATE cases SET has_reconciliation_conflicts = ?, conflict_severity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?').run(hasConflict ? 1 : 0, severity, caseId, scope.tenantId);
}

async function updateConflictStateSupabase(scope: CaseScope, caseId: string, hasConflict: boolean, severity: string | null) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('cases')
    .update({
      has_reconciliation_conflicts: hasConflict,
      conflict_severity: severity,
      updated_at: new Date().toISOString()
    })
    .eq('id', caseId)
    .eq('tenant_id', scope.tenantId);
  if (error) throw error;
}

class SQLiteCaseRepository implements CaseRepository {
  async list(scope: CaseScope, filters: CaseFilters) {
    return listCasesSqlite(scope, filters);
  }
  async getBundle(scope: CaseScope, caseId: string) {
    return fetchCaseBundleSqlite(scope, caseId);
  }
  async update(scope: CaseScope, id: string, updates: any) {
    const db = getDb();
    const fields = Object.keys(updates).map(k => `${k} = ?`);
    const params = Object.values(updates);
    params.push(id, scope.tenantId, scope.workspaceId);
    db.prepare(`UPDATE cases SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ? AND workspace_id = ?`).run(...params);
  }
  async addStatusHistory(scope: CaseScope, data: any) {
    const db = getDb();
    db.prepare(`
      INSERT INTO case_status_history (id, case_id, from_status, to_status, changed_by, reason, tenant_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(crypto.randomUUID(), data.caseId, data.fromStatus, data.toStatus, data.changedBy, data.reason || null, scope.tenantId);
  }
  async updateConflictState(scope: CaseScope, caseId: string, hasConflict: boolean, severity: string | null) {
    await updateConflictStateSqlite(scope, caseId, hasConflict, severity);
  }
  async findOpenCase(scope: CaseScope, customerId: string | null, type: string, windowHours: number) {
    if (!customerId) return null;
    const db = getDb();
    const since = new Date(Date.now() - windowHours * 3_600_000).toISOString();
    const row = db.prepare(`
      SELECT id FROM cases
      WHERE tenant_id  = ?
        AND customer_id = ?
        AND type        = ?
        AND status NOT IN ('resolved', 'closed', 'cancelled')
        AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(scope.tenantId, customerId, type, since) as any;
    return row?.id ?? null;
  }
  async getNextCaseNumber(scope: CaseScope) {
    const db = getDb();
    const row = db.prepare(`
      SELECT case_number FROM cases
      WHERE tenant_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(scope.tenantId) as any;
    if (!row) return 'CS-0001';
    const match = row.case_number.match(/^CS-(\d+)$/);
    if (!match) return 'CS-0001';
    const next = parseInt(match[1], 10) + 1;
    return `CS-${String(next).padStart(4, '0')}`;
  }
  async createCase(scope: CaseScope, data: any) {
    const db = getDb();
    const fields = Object.keys(data);
    const placeholders = fields.map(() => '?');
    db.prepare(`
      INSERT INTO cases (${fields.join(', ')})
      VALUES (${placeholders.join(', ')})
    `).run(...Object.values(data));
    return data.id;
  }
  async getOpenReconciliationIssues(scope: CaseScope, caseId: string) {
    const db = getDb();
    return db.prepare('SELECT * FROM reconciliation_issues WHERE case_id = ? AND status = "open" AND tenant_id = ?').all(caseId, scope.tenantId).map(parseRow);
  }
  async upsertReconciliationIssue(scope: CaseScope, data: any) {
    const db = getDb();
    const existing = db.prepare(`
      SELECT id FROM reconciliation_issues
      WHERE case_id = ? AND entity_id = ? AND conflict_domain = ? AND status = 'open'
      LIMIT 1
    `).get(data.case_id, data.entity_id, data.conflict_domain) as any;

    if (existing) {
      db.prepare(`
        UPDATE reconciliation_issues SET
          severity = ?, actual_states = ?, detected_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(data.severity, JSON.stringify(data.actual_states), existing.id);
      return existing.id;
    }

    const id = data.id || crypto.randomUUID();
    const fields = Object.keys(data);
    const params = Object.values(data).map(v => typeof v === 'object' ? JSON.stringify(v) : v);
    const placeholders = fields.map(() => '?');
    db.prepare(`
      INSERT INTO reconciliation_issues (${fields.join(', ')})
      VALUES (${placeholders.join(', ')})
    `).run(...params);
    return id;
  }
  async findStaleCases(scope: CaseScope, limit: number, thresholdMins: number) {
    const db = getDb();
    const threshold = new Date(Date.now() - thresholdMins * 60_000).toISOString();
    return db.prepare(`
      SELECT id, tenant_id FROM cases
      WHERE status NOT IN ('resolved', 'closed', 'cancelled')
        AND tenant_id = ?
        AND (has_reconciliation_conflicts = 0 OR updated_at < ?)
      ORDER BY last_activity_at DESC
      LIMIT ?
    `).all(scope.tenantId, threshold, limit) as any[];
  }
}

class SupabaseCaseRepository implements CaseRepository {
  async list(scope: CaseScope, filters: CaseFilters) {
    return listCasesSupabase(scope, filters);
  }
  async getBundle(scope: CaseScope, caseId: string) {
    return fetchCaseBundleSupabase(scope, caseId);
  }
  async update(scope: CaseScope, id: string, updates: any) {
    const supabase = getSupabaseAdmin();
    const toUpdate = { ...updates, updated_at: new Date().toISOString() };
    const { error } = await supabase
      .from('cases')
      .update(toUpdate)
      .eq('id', id)
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId);
    if (error) throw error;
  }
  async addStatusHistory(scope: CaseScope, data: any) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('case_status_history').insert({
      id: crypto.randomUUID(),
      case_id: data.caseId,
      from_status: data.fromStatus,
      to_status: data.toStatus,
      changed_by: data.changedBy,
      reason: data.reason || null,
      tenant_id: scope.tenantId,
      created_at: new Date().toISOString()
    });
    if (error) throw error;
  }
  async updateConflictState(scope: CaseScope, caseId: string, hasConflict: boolean, severity: string | null) {
    await updateConflictStateSupabase(scope, caseId, hasConflict, severity);
  }
  async findOpenCase(scope: CaseScope, customerId: string | null, type: string, windowHours: number) {
    if (!customerId) return null;
    const supabase = getSupabaseAdmin();
    const since = new Date(Date.now() - windowHours * 3_600_000).toISOString();
    const { data, error } = await supabase
      .from('cases')
      .select('id')
      .eq('tenant_id', scope.tenantId)
      .eq('customer_id', customerId)
      .eq('type', type)
      .not('status', 'in', '("resolved", "closed", "cancelled")')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      // Fallback for complex 'not in' if needed, but this should work in Supabase
      const { data: data2, error: error2 } = await supabase
        .from('cases')
        .select('id, status')
        .eq('tenant_id', scope.tenantId)
        .eq('customer_id', customerId)
        .eq('type', type)
        .gte('created_at', since)
        .order('created_at', { ascending: false });
      if (error2) throw error2;
      return data2.find(c => !['resolved', 'closed', 'cancelled'].includes(c.status))?.id ?? null;
    }
    return data?.id ?? null;
  }
  async getNextCaseNumber(scope: CaseScope) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('cases')
      .select('case_number')
      .eq('tenant_id', scope.tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return 'CS-0001';
    const match = data.case_number.match(/^CS-(\d+)$/);
    if (!match) return 'CS-0001';
    const next = parseInt(match[1], 10) + 1;
    return `CS-${String(next).padStart(4, '0')}`;
  }
  async createCase(scope: CaseScope, data: any) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('cases').insert(data);
    if (error) throw error;
    return data.id;
  }
  async getOpenReconciliationIssues(scope: CaseScope, caseId: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('reconciliation_issues').select('*').eq('case_id', caseId).eq('status', 'open').eq('tenant_id', scope.tenantId);
    if (error) throw error;
    return data || [];
  }
  async upsertReconciliationIssue(scope: CaseScope, data: any) {
    const supabase = getSupabaseAdmin();
    const { data: existing, error: findError } = await supabase
      .from('reconciliation_issues')
      .select('id')
      .eq('case_id', data.case_id)
      .eq('entity_id', data.entity_id)
      .eq('conflict_domain', data.conflict_domain)
      .eq('status', 'open')
      .maybeSingle();

    if (findError) throw findError;

    if (existing) {
      const { error: updateError } = await supabase
        .from('reconciliation_issues')
        .update({
          severity: data.severity,
          actual_states: data.actual_states,
          detected_at: new Date().toISOString()
        })
        .eq('id', (existing as any).id);
      if (updateError) throw updateError;
      return (existing as any).id;
    }

    const id = data.id || crypto.randomUUID();
    const { error: insertError } = await supabase.from('reconciliation_issues').insert({ ...data, id });
    if (insertError) throw insertError;
    return id;
  }
  async findStaleCases(scope: CaseScope, limit: number, thresholdMins: number) {
    const supabase = getSupabaseAdmin();
    const threshold = new Date(Date.now() - thresholdMins * 60_000).toISOString();
    const { data, error } = await supabase
      .from('cases')
      .select('id, tenant_id')
      .eq('tenant_id', scope.tenantId)
      .not('status', 'in', '("resolved", "closed", "cancelled")')
      .or(`has_reconciliation_conflicts.eq.false,updated_at.lt.${threshold}`)
      .order('last_activity_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }
}

export function createCaseRepository(): CaseRepository {
  const provider = getDatabaseProvider();
  return provider === 'supabase' ? new SupabaseCaseRepository() : new SQLiteCaseRepository();
}

export {
  buildCaseState,
  buildGraphView,
  buildInboxView,
  buildResolveView,
  buildTimeline,
};
