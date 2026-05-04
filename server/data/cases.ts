import { getSupabaseAdmin } from '../db/supabase.js';
import { buildSlaView, canonicalHealth, compactStrings, asArray } from './shared.js';
import { buildCaseChecks as buildCaseChecksImpl } from './caseChecks.js';

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
    source_of_truth: issue?.source_of_truth || issue?.system || null,
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
  const connectorsById = new Map<string, any>((bundle.connectors ?? []).map((connector: any) => [String(connector.id), connector]));
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
      type: issue.issue_type || issue.conflict_domain || 'conflict',
      domain: issue.conflict_domain || 'reconciliation',
      actor: issue.detected_by || 'system',
      content: issue.summary || 'Conflict detected',
      occurred_at: issue.created_at || issue.detected_at,
      icon: 'alert',
      severity: canonicalHealth(issue.severity || 'critical'),
      source: issue.source_of_truth_system || issue.source_of_truth || null,
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
    ...(bundle.agent_runs ?? []).map((run: any) => ({
      id: run.id,
      entry_type: 'agent_run',
      type: run.status || 'agent_run',
      domain: 'ai_studio',
      actor: run.agent_id || 'agent',
      content: `${run.agent_id || 'agent'} ${run.status || 'running'}${run.trigger_event ? ` · ${run.trigger_event}` : ''}`,
      occurred_at: run.started_at || run.ended_at || run.finished_at || run.created_at,
      icon: 'smart_toy',
      severity: branchHealthFromStatus(run.status || 'warning'),
      source: run.agent_id || 'ai_studio',
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
      actor: (() => {
        const connector = event.connector_id ? connectorsById.get(String(event.connector_id)) : null;
        return connector?.name || event.source_system || 'webhook';
      })(),
      content: (() => {
        const connector = event.connector_id ? connectorsById.get(String(event.connector_id)) : null;
        const connectorLabel = connector?.system || connector?.name || event.connector_id;
        return `Webhook ${event.event_type || 'received'} (${event.status || 'received'})${connectorLabel ? ` via ${connectorLabel}` : ''}`;
      })(),
      occurred_at: event.received_at || event.processed_at,
      icon: 'webhook',
      severity: branchHealthFromStatus(event.status || 'warning'),
      source: (() => {
        const connector = event.connector_id ? connectorsById.get(String(event.connector_id)) : null;
        return connector?.system || event.source_system || 'webhook';
      })(),
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

  const toEpoch = (value: unknown): number => {
    if (!value) return 0;
    const t = new Date(value as any).getTime();
    return Number.isFinite(t) ? t : 0;
  };
  return timeline.sort((a, b) => toEpoch(a.occurred_at) - toEpoch(b.occurred_at));
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
  const orderLineItemsByOrderId = new Map<string, any[]>();
  for (const item of bundle.order_line_items ?? []) {
    if (item.order_id) {
      orderLineItemsByOrderId.set(item.order_id, [...(orderLineItemsByOrderId.get(item.order_id) || []), item]);
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
    const relatedLineItems = orderLineItemsByOrderId.get(order.id) || [];
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
      ...relatedLineItems.map((item: any, index: number) => buildDerivedNode(
        `order:${order.id}:line-item:${item.id || index}`,
        item.name || item.sku || `Line item ${index + 1}`,
        item.quantity > 0 ? 'healthy' : 'warning',
        'orders',
        `${item.quantity || 1} × ${item.sku || item.external_item_id || 'item'}`,
        item.created_at || order.updated_at,
        item.price ? `${item.currency || order.currency || 'USD'} ${item.price}` : item.external_item_id || item.product_id || 'Line item',
      )),
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
      source_of_truth: bundle.reconciliation_issues?.[0]?.source_of_truth_system || null,
      recommended_action: conflict.recommended_action,
      severity: conflict.severity,
      evidence_refs: compactStrings((bundle.reconciliation_issues ?? []).map((item: any) => item.id)),
    },
    related: {
      orders: bundle.orders ?? [],
      order_line_items: bundle.order_line_items ?? [],
      payments: bundle.payments ?? [],
      returns: bundle.returns ?? [],
      refunds,
      approvals: bundle.approvals ?? [],
      reconciliation_issues: bundle.reconciliation_issues ?? [],
      linked_cases: bundle.linked_cases ?? [],
      case_knowledge_links: caseKnowledgeLinks,
      knowledge_articles: knowledgeArticles,
      connectors,
      webhook_events: bundle.webhook_events ?? [],
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
  const checks = buildCaseChecksImpl(bundle);
  // Merge checks into the timeline so the chronological view shows every
  // automated verification the SaaS has run, side-by-side with messages,
  // status changes and webhook events.
  const checkTimelineEntries = checks.flat
    .filter((c: any) => c.at)
    .map((c: any) => ({
      id: `check:${c.id}`,
      entry_type: 'check',
      type: 'check',
      category: c.category,
      content: c.detail ? `${c.label} — ${c.detail}` : c.label,
      severity: c.status === 'fail' ? 'critical' : c.status === 'warn' ? 'warning' : c.status === 'pass' ? 'healthy' : 'info',
      occurred_at: c.at,
      icon: 'fact_check',
      source: c.category,
      domain: c.category,
    }));
  const mergedTimeline = [...state.timeline, ...checkTimelineEntries].sort((a: any, b: any) => {
    const ta = new Date(a.occurred_at || 0).getTime();
    const tb = new Date(b.occurred_at || 0).getTime();
    return tb - ta;
  });
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
    checks,
    timeline: mergedTimeline,
  };
}

function buildResolveView(bundle: any) {
  const state = buildCaseState(bundle);
  const checks = buildCaseChecksImpl(bundle);
  const conflict = state.conflict;
  const policyEvaluations = bundle.policy_evaluations ?? [];
  const policyRules = bundle.policy_rules ?? [];
  const knowledgeArticles = bundle.knowledge_articles ?? [];
  const approvalRequests = bundle.approvals ?? [];
  const executionPlan = bundle.execution_plans?.find((plan: any) => plan.id === bundle.case.active_execution_plan_id || plan.id === approvalRequests[0]?.execution_plan_id) || bundle.execution_plans?.[0] || null;
  const relevantTimeline = state.timeline.filter((entry: any) =>
    ['case_status_history', 'reconciliation_issue', 'approval_request', 'policy_evaluation', 'execution_plan', 'workflow_run', 'workflow_run_step', 'agent_run', 'order_event', 'return_event', 'refund', 'webhook_event']
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
    // Identified problems — checks that came back fail/warn, surfaced as
    // first-class cards in the Resolve panel.
    identified_problems: checks.flat
      .filter((c: any) => c.status === 'fail' || c.status === 'warn')
      .map((c: any) => ({
        id: c.id,
        category: c.category,
        label: c.label,
        severity: c.status === 'fail' ? 'critical' : 'warning',
        detail: c.detail || '',
        evidence: c.evidence || [],
        at: c.at,
      })),
    checks,
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
    orderLineItemsResult,
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
    agentRunsResult,
    canonicalEventsResult,
  ] = await Promise.all([
    caseRow.customer_id ? supabase.from('customers').select('*').eq('id', caseRow.customer_id).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId).maybeSingle() : Promise.resolve({ data: null, error: null } as any),
    supabase.from('conversations').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId).order('last_message_at', { ascending: false }).limit(1).maybeSingle(),
    asArray<string>(caseRow.order_ids).length ? supabase.from('orders').select('*').in('id', asArray<string>(caseRow.order_ids)).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId) : Promise.resolve({ data: [], error: null } as any),
    asArray<string>(caseRow.payment_ids).length ? supabase.from('payments').select('*').in('id', asArray<string>(caseRow.payment_ids)).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId) : Promise.resolve({ data: [], error: null } as any),
    asArray<string>(caseRow.return_ids).length ? supabase.from('returns').select('*').in('id', asArray<string>(caseRow.return_ids)).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId) : Promise.resolve({ data: [], error: null } as any),
    // Tenant-only tables (no workspace_id column in schema): refunds,
    // case_links, case_status_history, messages, order_events, return_events,
    // case_knowledge_links, connectors, agents, execution_plans,
    // tool_action_attempts, webhook_events, workflow_run_steps. Filtering on a
    // missing column throws PG 42703, breaking the whole case bundle.
    supabase.from('refunds').select('*').eq('tenant_id', scope.tenantId),
    supabase.from('approval_requests').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId).order('created_at', { ascending: false }),
    supabase.from('reconciliation_issues').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId).order('detected_at', { ascending: false }),
    supabase.from('case_links').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId),
    supabase.from('draft_replies').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId).order('generated_at', { ascending: false }),
    supabase.from('internal_notes').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId).order('created_at', { ascending: false }),
    supabase.from('messages').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).order('sent_at', { ascending: true }),
    caseRow.assigned_user_id ? supabase.from('users').select('name, email').eq('id', caseRow.assigned_user_id).maybeSingle() : Promise.resolve({ data: null, error: null } as any),
    caseRow.assigned_team_id ? supabase.from('teams').select('name').eq('id', caseRow.assigned_team_id).maybeSingle() : Promise.resolve({ data: null, error: null } as any),
    supabase.from('case_status_history').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).order('created_at', { ascending: false }),
    asArray<string>(caseRow.order_ids).length ? supabase.from('order_events').select('*').in('order_id', asArray<string>(caseRow.order_ids)).eq('tenant_id', scope.tenantId) : Promise.resolve({ data: [], error: null } as any),
    asArray<string>(caseRow.order_ids).length ? supabase.from('order_line_items').select('*').in('order_id', asArray<string>(caseRow.order_ids)).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId).order('created_at', { ascending: true }) : Promise.resolve({ data: [], error: null } as any),
    asArray<string>(caseRow.return_ids).length ? supabase.from('return_events').select('*').in('return_id', asArray<string>(caseRow.return_ids)).eq('tenant_id', scope.tenantId) : Promise.resolve({ data: [], error: null } as any),
    supabase.from('case_knowledge_links').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId),
    supabase.from('connectors').select('*').eq('tenant_id', scope.tenantId),
    supabase.from('agents').select('*').eq('tenant_id', scope.tenantId),
    supabase.from('execution_plans').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).order('generated_at', { ascending: false }),
    // tool_action_attempts has no case_id column — it's joined to a case via
    // execution_plan_id. Resolve the actual rows below, after we have plan ids.
    Promise.resolve({ data: [], error: null } as any),
    supabase.from('policy_rules').select('*').eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId).order('created_at', { ascending: false }),
    supabase.from('policy_evaluations').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId).order('created_at', { ascending: false }),
    supabase.from('webhook_events').select('*').eq('tenant_id', scope.tenantId).order('received_at', { ascending: false }),
    supabase.from('workflow_runs').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId).order('started_at', { ascending: false }),
    supabase.from('agent_runs').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId).order('started_at', { ascending: false }),
    supabase.from('canonical_events').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId).order('occurred_at', { ascending: false }),
  ]);

  for (const result of [customerResult, conversationResult, ordersResult, paymentsResult, returnsResult, refundsResult, approvalsResult, issuesResult, linksResult, draftsResult, notesResult, messagesResult, userResult, teamResult, caseStatusHistoryResult, orderEventsResult, orderLineItemsResult, returnEventsResult, caseKnowledgeLinksResult, connectorsResult, agentsResult, executionPlansResult, toolActionAttemptsResult, policyRulesResult, policyEvaluationsResult, webhookEventsResult, workflowRunsResult, agentRunsResult, canonicalEventsResult]) {
    if (result?.error) throw result.error;
  }

  const workflowRunIds = compactStrings((workflowRunsResult.data ?? []).map((row: any) => row.id));
  const workflowRunStepsResult = workflowRunIds.length
    ? await supabase.from('workflow_run_steps').select('*').in('workflow_run_id', workflowRunIds).order('started_at', { ascending: false })
    : { data: [], error: null } as any;
  if (workflowRunStepsResult?.error) throw workflowRunStepsResult.error;

  // tool_action_attempts → resolved by joining execution_plan_id ∈ this case's plans.
  const executionPlanIds = compactStrings((executionPlansResult.data ?? []).map((row: any) => row.id));
  const toolActionAttemptsRows = executionPlanIds.length
    ? ((await supabase
        .from('tool_action_attempts')
        .select('*')
        .in('execution_plan_id', executionPlanIds)
        .eq('tenant_id', scope.tenantId)
        .order('started_at', { ascending: false })).data ?? [])
    : [];

  const relatedCaseIds = compactStrings((linksResult.data ?? []).map((row: any) => row.linked_case_id));
  const linkedCases = relatedCaseIds.length
    ? ((await supabase.from('cases').select('id, case_number, type, status, priority, risk_level').in('id', relatedCaseIds).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId)).data ?? [])
    : [];
  const knowledgeArticleIds = compactStrings((caseKnowledgeLinksResult.data ?? []).map((row: any) => row.article_id));
  const knowledgeArticles = knowledgeArticleIds.length
    ? ((await supabase.from('knowledge_articles').select('*').in('id', knowledgeArticleIds).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId)).data ?? [])
    : [];
  const agentVersionIds = compactStrings((agentsResult.data ?? []).map((row: any) => row.current_version_id));
  const agentVersions = agentVersionIds.length
    ? ((await supabase.from('agent_versions').select('*').in('id', agentVersionIds).eq('tenant_id', scope.tenantId)).data ?? [])
    : [];
  const refundSourceIds = compactStrings([
    ...asArray<string>(caseRow.payment_ids),
    ...asArray<string>(caseRow.order_ids),
    ...asArray<string>(caseRow.return_ids),
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
    order_line_items: orderLineItemsResult.data ?? [],
    return_events: returnEventsResult.data ?? [],
    workflow_run_steps: workflowRunStepsResult.data ?? [],
    case_knowledge_links: caseKnowledgeLinksResult.data ?? [],
    knowledge_articles: knowledgeArticles,
    connectors: connectorsResult.data ?? [],
    agents: agentsResult.data ?? [],
    execution_plans: executionPlansResult.data ?? [],
    tool_action_attempts: toolActionAttemptsRows,
    policy_rules: policyRulesResult.data ?? [],
    policy_evaluations: policyEvaluationsResult.data ?? [],
    webhook_events: webhookEventsResult.data ?? [],
    agent_versions: agentVersions,
    workflow_runs: workflowRunsResult.data ?? [],
    agent_runs: agentRunsResult.data ?? [],
    canonical_events: canonicalEventsResult.data ?? [],
  };
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
  const orderIds = compactStrings(rows.flatMap((row) => asArray<string>(row.order_ids)));
  const paymentIds = compactStrings(rows.flatMap((row) => asArray<string>(row.payment_ids)));
  const returnIds = compactStrings(rows.flatMap((row) => asArray<string>(row.return_ids)));
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
      const relatedOrders = asArray<string>(row.order_ids).map((id: string) => orders.get(id)).filter(Boolean);
      const relatedPayments = asArray<string>(row.payment_ids).map((id: string) => payments.get(id)).filter(Boolean);
      const relatedReturns = asArray<string>(row.return_ids).map((id: string) => returns.get(id)).filter(Boolean);
      const refund = refunds.find((item: any) => [item.payment_id, item.order_id, item.customer_id].some((value) => [ ...asArray<string>(row.payment_ids), ...asArray<string>(row.order_ids), row.customer_id ].includes(value)));
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
  get(scope: CaseScope, caseId: string): Promise<any | null>;
  getBundle(scope: CaseScope, caseId: string): Promise<any | null>;
  update(scope: CaseScope, id: string, updates: any): Promise<void>;
  addStatusHistory(scope: CaseScope, data: any): Promise<void>;
  getConversation(scope: CaseScope, conversationId: string): Promise<any | null>;
  getConversationByChannel(scope: CaseScope, customerId: string, channel: string): Promise<any | null>;
  createConversation(scope: CaseScope, data: any): Promise<void>;
  updateConversation(scope: CaseScope, conversationId: string, updates: any): Promise<void>;
  getMessageByExternalId(scope: CaseScope, conversationId: string, externalMessageId: string): Promise<any | null>;
  createMessage(scope: CaseScope, data: any): Promise<void>;
  updateMessage(scope: CaseScope, messageId: string, updates: any): Promise<void>;
  updateDraft(scope: CaseScope, draftId: string, updates: any): Promise<void>;
  getExecutionPlan(scope: CaseScope, executionPlanId: string): Promise<any | null>;
  updateExecutionPlan(scope: CaseScope, executionPlanId: string, updates: any): Promise<void>;
  getPreviousStatusFromHistory(scope: CaseScope, caseId: string, changedBy: string): Promise<string | null>;
  reopenReconciliationIssues(scope: CaseScope, caseId: string): Promise<void>;
  listOpenCasesWithSLA(scope: CaseScope, limit: number): Promise<any[]>;
  listExpiredApprovals(scope: CaseScope, now: string): Promise<any[]>;
  expireApprovals(scope: CaseScope, now: string): Promise<{ changes: number }>;
  updateCasesForExpiredApprovals(scope: CaseScope): Promise<void>;
  updateConflictState(scope: CaseScope, caseId: string, hasConflict: boolean, severity: string | null): Promise<void>;
  findOpenCase(scope: CaseScope, customerId: string | null, type: string, windowHours: number): Promise<string | null>;
  getNextCaseNumber(scope: CaseScope): Promise<string>;
  createCase(scope: CaseScope, data: any): Promise<string>;
  getOpenReconciliationIssues(scope: CaseScope, caseId: string): Promise<any[]>;
  upsertReconciliationIssue(scope: CaseScope, data: any): Promise<string>;
  findStaleCases(scope: CaseScope, limit: number, thresholdMins: number): Promise<any[]>;
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

class SupabaseCaseRepository implements CaseRepository {
  async list(scope: CaseScope, filters: CaseFilters) {
    return listCasesSupabase(scope, filters);
  }
  async get(scope: CaseScope, caseId: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('cases')
      .select('*')
      .eq('id', caseId)
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId)
      .maybeSingle();
    if (error) throw error;
    return data;
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
  async getConversation(scope: CaseScope, conversationId: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  async getConversationByChannel(scope: CaseScope, customerId: string, channel: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('customer_id', customerId)
      .eq('channel', channel)
      .eq('status', 'open')
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  async createConversation(scope: CaseScope, data: any) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('conversations').insert({ ...data, tenant_id: scope.tenantId, workspace_id: scope.workspaceId });
    if (error) throw error;
  }
  async updateConversation(scope: CaseScope, conversationId: string, updates: any) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('conversations')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId);
    if (error) throw error;
  }
  async getMessageByExternalId(scope: CaseScope, conversationId: string, externalMessageId: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('external_message_id', externalMessageId)
      .eq('tenant_id', scope.tenantId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  async createMessage(scope: CaseScope, data: any) {
    const supabase = getSupabaseAdmin();
    // messages has no workspace_id column — passing it caused 42703 inserts.
    const { error } = await supabase.from('messages').insert({
      ...data,
      tenant_id: scope.tenantId,
    });
    if (error) throw error;
  }
  async updateMessage(scope: CaseScope, messageId: string, updates: any) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('messages')
      .update(updates)
      .eq('id', messageId)
      .eq('tenant_id', scope.tenantId);
    if (error) throw error;
  }
  async updateDraft(scope: CaseScope, draftId: string, updates: any) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('draft_replies')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', draftId)
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId);
    if (error) throw error;
  }
  async getExecutionPlan(scope: CaseScope, executionPlanId: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('execution_plans')
      .select('*')
      .eq('id', executionPlanId)
      .eq('tenant_id', scope.tenantId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  async updateExecutionPlan(scope: CaseScope, executionPlanId: string, updates: any) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('execution_plans')
      .update(updates)
      .eq('id', executionPlanId)
      .eq('tenant_id', scope.tenantId);
    if (error) throw error;
  }
  async getPreviousStatusFromHistory(scope: CaseScope, caseId: string, changedBy: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('case_status_history')
      .select('from_status')
      .eq('case_id', caseId)
      .eq('tenant_id', scope.tenantId)
      .eq('changed_by', changedBy)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.from_status ?? null;
  }
  async reopenReconciliationIssues(scope: CaseScope, caseId: string) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('reconciliation_issues')
      .update({ status: 'open', resolved_at: null })
      .eq('case_id', caseId)
      .eq('tenant_id', scope.tenantId);
    if (error) throw error;
  }
  async listOpenCasesWithSLA(scope: CaseScope, limit: number) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('cases')
      .select('*')
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId)
      .not('status', 'in', '("resolved","closed","cancelled")')
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }
  async listExpiredApprovals(scope: CaseScope, now: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('approval_requests')
      .select('*')
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId)
      .eq('status', 'pending')
      .not('expires_at', 'is', null)
      .lt('expires_at', now);
    if (error) throw error;
    return data ?? [];
  }
  async expireApprovals(scope: CaseScope, now: string) {
    const expired = await this.listExpiredApprovals(scope, now);
    if (!expired.length) return { changes: 0 };
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('approval_requests')
      .update({ status: 'expired', updated_at: now })
      .in('id', expired.map((approval: any) => approval.id))
      .eq('tenant_id', scope.tenantId);
    if (error) throw error;
    return { changes: expired.length };
  }
  async updateCasesForExpiredApprovals(scope: CaseScope) {
    const supabase = getSupabaseAdmin();
    const { data: expired, error: expiredError } = await supabase
      .from('approval_requests')
      .select('id')
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId)
      .eq('status', 'expired');
    if (expiredError) throw expiredError;
    const ids = (expired ?? []).map((approval: any) => approval.id);
    if (!ids.length) return;
    const { error } = await supabase
      .from('cases')
      .update({ approval_state: 'expired', execution_state: 'idle', updated_at: new Date().toISOString() })
      .in('active_approval_request_id', ids)
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId);
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
    // Retry on unique-violation of case_number, which races when multiple
    // webhooks concurrently compute the same "next CS-0042". On 23505 we
    // recompute the next number by polling the max and increment by one + a
    // small random offset to spread retries.
    let attempt = 0;
    while (attempt < 5) {
      const { error } = await supabase.from('cases').insert(data);
      if (!error) return data.id;
      const code = (error as any)?.code;
      const isCaseNumberCollision = code === '23505' && /case_number/.test((error as any)?.details ?? '');
      if (!isCaseNumberCollision) throw error;
      // Recompute case_number atomically against the latest max for this tenant.
      const { data: maxRow } = await supabase
        .from('cases')
        .select('case_number')
        .eq('tenant_id', scope.tenantId)
        .order('case_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      const m = maxRow?.case_number ? /^CS-(\d+)$/.exec(maxRow.case_number) : null;
      const baseN = m ? parseInt(m[1], 10) : 0;
      const next  = baseN + 1 + attempt; // spread retries to break the race
      data.case_number = `CS-${String(next).padStart(4, '0')}`;
      attempt++;
    }
    throw new Error('createCase: failed after 5 retries on case_number collision');
  }
  async getOpenReconciliationIssues(scope: CaseScope, caseId: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('reconciliation_issues')
      .select('*')
      .eq('case_id', caseId)
      .eq('status', 'open')
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId);
    if (error) throw error;
    return data || [];
  }
  async upsertReconciliationIssue(scope: CaseScope, data: any) {
    const supabase = getSupabaseAdmin();
    // Idempotent: dedup by (tenant, workspace, case, entity, conflict_domain, issue_type)
    // where status is open. issue_type must be part of the key — multiple distinct
    // issue_types can share the same conflict_domain+entity (e.g. payment_amount_mismatch
    // and payment_status_drift both attach to the same payment row), and collapsing them
    // into one would silently lose conflicts.
    let findQuery = supabase
      .from('reconciliation_issues')
      .select('id')
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId)
      .eq('case_id', data.case_id)
      .eq('entity_id', data.entity_id)
      .eq('conflict_domain', data.conflict_domain)
      .eq('status', 'open');
    if (data.issue_type !== undefined && data.issue_type !== null) {
      findQuery = findQuery.eq('issue_type', data.issue_type);
    } else {
      findQuery = findQuery.is('issue_type', null);
    }
    const { data: existing, error: findError } = await findQuery.maybeSingle();

    if (findError) throw findError;

    if (existing) {
      const updates: Record<string, unknown> = {
        severity: data.severity,
        actual_states: data.actual_states,
        expected_state: data.expected_state,
        conflicting_systems: data.conflicting_systems,
        source_of_truth_system: data.source_of_truth_system,
        detected_by: data.detected_by,
        detected_at: new Date().toISOString(),
      };
      if (data.summary !== undefined) updates.summary = data.summary;
      if (data.issue_type !== undefined) updates.issue_type = data.issue_type;
      const { error: updateError } = await supabase
        .from('reconciliation_issues')
        .update(updates)
        .eq('id', (existing as any).id)
        .eq('tenant_id', scope.tenantId)
        .eq('workspace_id', scope.workspaceId);
      if (updateError) throw updateError;
      return (existing as any).id;
    }

    const id = data.id || crypto.randomUUID();
    const insertRow: Record<string, unknown> = {
      ...data,
      id,
      tenant_id: data.tenant_id ?? scope.tenantId,
      workspace_id: data.workspace_id ?? scope.workspaceId,
      detected_at: data.detected_at ?? new Date().toISOString(),
    };
    const { error: insertError } = await supabase
      .from('reconciliation_issues')
      .insert(insertRow);
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
  return new SupabaseCaseRepository();
}

export {
  buildCaseState,
  buildGraphView,
  buildInboxView,
  buildResolveView,
  buildTimeline,
};
