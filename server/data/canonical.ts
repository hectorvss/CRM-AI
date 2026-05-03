import { getSupabaseAdmin } from '../db/supabase.js';

export interface CanonicalScope {
  tenantId: string;
  workspaceId: string;
}

export interface CanonicalRepository {
  fetchCaseGraphRows(scope: CanonicalScope, caseId: string): Promise<any>;
  findCaseByLinkedEntity(scope: CanonicalScope, entityType: string, entityId: string): Promise<any>;
  getCustomerState(scope: CanonicalScope, customerId: string): Promise<any>;
  getExecutionPlan(scope: CanonicalScope, caseId: string): Promise<any>;
  getInternalNotes(scope: CanonicalScope, caseId: string, limit?: number): Promise<any[]>;
  getApprovalWithContext(scope: CanonicalScope, approvalId: string): Promise<any>;
  getAuditTrail(scope: CanonicalScope, caseId: string, approvalId: string): Promise<any[]>;
  getEventByDedupeKey(scope: CanonicalScope, dedupeKey: string): Promise<any | null>;
  createEvent(scope: CanonicalScope, data: any): Promise<any>;
  updateEventStatus(scope: CanonicalScope, eventId: string, updates: any): Promise<void>;
}

async function fetchCaseGraphRowsSupabase(scope: CanonicalScope, caseId: string) {
  const supabase = getSupabaseAdmin();

  // Basic case with joins
  const { data: caseRow, error: caseError } = await supabase
    .from('cases')
    .select(`
      *,
      customers(*),
      assigned_user:users(name),
      assigned_team:teams(name),
      conversations(*)
    `)
    .eq('id', caseId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();

  if (caseError) throw caseError;
  if (!caseRow) return null;

  const orderIds = Array.isArray(caseRow.order_ids) ? caseRow.order_ids : [];
  const paymentIds = Array.isArray(caseRow.payment_ids) ? caseRow.payment_ids : [];
  const returnIds = Array.isArray(caseRow.return_ids) ? caseRow.return_ids : [];

  const [
    orders, payments, returns,
    approvals, workflowRuns, reconciliationIssues, linkedCases,
    messages, internalNotes, statusHistory, canonicalEvents,
    orderEvents, orderLineItems, returnEvents, webhookEvents, agentRuns
  ] = await Promise.all([
    orderIds.length ? supabase.from('orders').select('*').in('id', orderIds) : Promise.resolve({ data: [] }),
    paymentIds.length ? supabase.from('payments').select('*').in('id', paymentIds) : Promise.resolve({ data: [] }),
    returnIds.length ? supabase.from('returns').select('*').in('id', returnIds) : Promise.resolve({ data: [] }),
    supabase.from('approval_requests').select('*').eq('case_id', caseId).order('created_at', { ascending: false }),
    supabase.from('workflow_runs').select('*').eq('case_id', caseId).order('started_at', { ascending: false }),
    supabase.from('reconciliation_issues').select('*').eq('case_id', caseId).order('detected_at', { ascending: false }),
    supabase.from('case_links').select('link_type, cases!linked_case_id(id, case_number, type, status)').eq('case_id', caseId),
    caseRow.conversation_id ? supabase.from('messages').select('*').eq('conversation_id', caseRow.conversation_id).order('sent_at', { ascending: true }) : Promise.resolve({ data: [] }),
    supabase.from('internal_notes').select('*').eq('case_id', caseId).order('created_at', { ascending: true }),
    supabase.from('case_status_history').select('*').eq('case_id', caseId).order('created_at', { ascending: true }),
    supabase.from('canonical_events').select('*').eq('case_id', caseId).order('occurred_at', { ascending: true }),
    orderIds.length ? supabase.from('order_events').select('*').in('order_id', orderIds).order('time', { ascending: true }) : Promise.resolve({ data: [] }),
    orderIds.length ? supabase.from('order_line_items').select('*').in('order_id', orderIds).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId).order('created_at', { ascending: true }) : Promise.resolve({ data: [] }),
    returnIds.length ? supabase.from('return_events').select('*').in('return_id', returnIds).order('time', { ascending: true }) : Promise.resolve({ data: [] }),
    // webhook_events has no case_id column; the linkage to a case is
    // indirect (canonical_event_id → canonical_events.case_id). For the
    // canonical bundle view, return [] so the route stops 500-ing — a
    // future migration can add the join properly.
    Promise.resolve({ data: [] } as any),
    supabase.from('agent_runs').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).order('started_at', { ascending: true }),
  ]);

  const [refundsByPaymentRes, refundsByOrderRes, refundsByCustomerRes] = await Promise.all([
    paymentIds.length ? supabase.from('refunds').select('*').in('payment_id', paymentIds).order('created_at', { ascending: true }) : Promise.resolve({ data: [] } as any),
    orderIds.length ? supabase.from('refunds').select('*').in('order_id', orderIds).order('created_at', { ascending: true }) : Promise.resolve({ data: [] } as any),
    caseRow.customer_id ? supabase.from('refunds').select('*').eq('customer_id', caseRow.customer_id).order('created_at', { ascending: true }) : Promise.resolve({ data: [] } as any),
  ]);

  const [caseKnowledgeLinksRes, connectorsRes, agentsRes, agentVersionsRes] = await Promise.all([
    supabase.from('case_knowledge_links').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).order('relevance_score', { ascending: false }),
    supabase.from('connectors').select('*').eq('tenant_id', scope.tenantId).order('updated_at', { ascending: false }),
    supabase.from('agents').select('*').eq('tenant_id', scope.tenantId).order('updated_at', { ascending: false }),
    supabase.from('agent_versions').select('*').eq('tenant_id', scope.tenantId).order('published_at', { ascending: false }).order('version_number', { ascending: false }),
  ]);

  if (caseKnowledgeLinksRes.error) throw caseKnowledgeLinksRes.error;
  if (connectorsRes.error) throw connectorsRes.error;
  if (agentsRes.error) throw agentsRes.error;
  if (agentVersionsRes.error) throw agentVersionsRes.error;
  if ((refundsByPaymentRes as any).error) throw (refundsByPaymentRes as any).error;
  if ((refundsByOrderRes as any).error) throw (refundsByOrderRes as any).error;
  if ((refundsByCustomerRes as any).error) throw (refundsByCustomerRes as any).error;

  const workflowRunIds = Array.from(new Set((workflowRuns.data || []).map((row: any) => row.id).filter(Boolean)));
  const workflowRunStepsRes = workflowRunIds.length > 0
    ? await supabase.from('workflow_run_steps').select('*').in('workflow_run_id', workflowRunIds).order('started_at', { ascending: true })
    : { data: [], error: null } as any;
  if (workflowRunStepsRes.error) throw workflowRunStepsRes.error;

  const knowledgeArticleIds = Array.from(new Set((caseKnowledgeLinksRes.data || []).map((link: any) => link.article_id).filter(Boolean)));
  const knowledgeArticlesRes = knowledgeArticleIds.length > 0
    ? await supabase
        .from('knowledge_articles')
        .select('*')
        .eq('tenant_id', scope.tenantId)
        .eq('workspace_id', scope.workspaceId)
        .in('id', knowledgeArticleIds)
    : { data: [], error: null } as any;

  if (knowledgeArticlesRes.error) throw knowledgeArticlesRes.error;

  return {
    caseRow: {
      ...caseRow,
      customer_name: caseRow.customers?.canonical_name,
      customer_email: caseRow.customers?.canonical_email,
      customer_segment: caseRow.customers?.segment,
      customer_risk_level: caseRow.customers?.risk_level,
      customer_lifetime_value: caseRow.customers?.lifetime_value,
      customer_total_orders: caseRow.customers?.total_orders,
      customer_total_spent: caseRow.customers?.total_spent,
      assigned_user_name: (caseRow.assigned_user as any)?.name,
      assigned_team_name: (caseRow.assigned_team as any)?.name,
      conversation_subject: caseRow.conversations?.subject,
      external_thread_id: caseRow.conversations?.external_thread_id,
      conversation_channel: caseRow.conversations?.channel
    },
    orders: orders.data || [],
    payments: payments.data || [],
    returns: returns.data || [],
    approvals: approvals.data || [],
    workflowRuns: workflowRuns.data || [],
    reconciliationIssues: reconciliationIssues.data || [],
    linkedCases: (linkedCases.data || []).map((lc: any) => ({
      link_type: lc.link_type,
      ...lc.cases
    })),
    conversation: caseRow.conversations,
    messages: messages.data || [],
    internalNotes: internalNotes.data || [],
    statusHistory: statusHistory.data || [],
    canonicalEvents: canonicalEvents.data || [],
    orderEvents: orderEvents.data || [],
    orderLineItems: orderLineItems.data || [],
    returnEvents: returnEvents.data || [],
    webhookEvents: webhookEvents.data || [],
    agentRuns: agentRuns.data || [],
    workflowRunSteps: workflowRunStepsRes.data || [],
    refunds: Array.from(new Map([
      ...(refundsByPaymentRes.data || []),
      ...(refundsByOrderRes.data || []),
      ...(refundsByCustomerRes.data || []),
    ].map((refund: any) => [refund.id, refund])).values()),
    caseKnowledgeLinks: caseKnowledgeLinksRes.data || [],
    knowledgeArticles: knowledgeArticlesRes.data || [],
    connectors: connectorsRes.data || [],
    agents: agentsRes.data || [],
    agentVersions: agentVersionsRes.data || [],
  };
}

async function getCustomerStateSupabase(scope: CanonicalScope, customerId: string) {
  const supabase = getSupabaseAdmin();
  const [
    { data: customer },
    { data: linkedIdentities },
    { data: cases },
    { data: orders },
    { data: payments },
    { data: returns }
  ] = await Promise.all([
    supabase.from('customers').select('*').eq('id', customerId).eq('tenant_id', scope.tenantId).maybeSingle(),
    supabase.from('linked_identities').select('*').eq('customer_id', customerId).order('confidence', { ascending: false }),
    supabase.from('cases').select('*').eq('customer_id', customerId).eq('tenant_id', scope.tenantId).order('updated_at', { ascending: false }),
    supabase.from('orders').select('*').eq('customer_id', customerId).eq('tenant_id', scope.tenantId).order('updated_at', { ascending: false }),
    supabase.from('payments').select('*').eq('customer_id', customerId).eq('tenant_id', scope.tenantId).order('updated_at', { ascending: false }),
    supabase.from('returns').select('*').eq('customer_id', customerId).eq('tenant_id', scope.tenantId).order('updated_at', { ascending: false })
  ]);

  if (!customer) return null;

  return {
    customer,
    linkedIdentities: linkedIdentities || [],
    allCases: cases || [],
    recentCases: (cases || []).slice(0, 10),
    orders: orders || [],
    payments: payments || [],
    returns: returns || []
  };
}

async function getExecutionPlanSupabase(scope: CanonicalScope, caseId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('execution_plans')
    .select('*')
    .eq('case_id', caseId)
    .eq('tenant_id', scope.tenantId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getInternalNotesSupabase(scope: CanonicalScope, caseId: string, limit = 10) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('internal_notes')
    .select('*')
    .eq('case_id', caseId)
    .eq('tenant_id', scope.tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function getApprovalWithContextSupabase(scope: CanonicalScope, approvalId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('approval_requests')
    .select(`
      *,
      cases!inner(
        case_number, type, status, priority, risk_level, customer_id, conversation_id,
        source_channel, source_system, approval_state, execution_state,
        customers(*)
      )
    `)
    .eq('id', approvalId)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const c = data.cases as any;
  const cu = c.customers as any;

  return {
    ...data,
    case_number: c.case_number,
    case_type: c.type,
    case_status: c.status,
    case_priority: c.priority,
    case_risk_level: c.risk_level,
    customer_id: c.customer_id,
    conversation_id: c.conversation_id,
    source_channel: c.source_channel,
    source_system: c.source_system,
    approval_state: c.approval_state,
    execution_state: c.execution_state,
    customer_name: cu?.canonical_name,
    customer_email: cu?.canonical_email,
    customer_segment: cu?.segment,
    lifetime_value: cu?.lifetime_value,
    dispute_rate: cu?.dispute_rate,
    refund_rate: cu?.refund_rate
  };
}

async function getAuditTrailSupabase(scope: CanonicalScope, caseId: string, approvalId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('audit_events')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .or(`and(entity_type.eq.case,entity_id.eq.${caseId}),and(entity_type.eq.approval,entity_id.eq.${approvalId})`)
    .order('occurred_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function findCaseByLinkedEntitySupabase(scope: CanonicalScope, entityType: string, entityId: string) {
  const supabase = getSupabaseAdmin();
  const column = entityType === 'order' ? 'order_ids' : entityType === 'payment' ? 'payment_ids' : 'return_ids';
  
  const { data, error } = await supabase
    .from('cases')
    .select('id, case_number, type, status, customer_id, conversation_id')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .contains(column, [entityId])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data;
}

async function updateEventStatusSupabase(scope: CanonicalScope, eventId: string, updates: any) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('canonical_events')
    .update({ ...updates, processed_at: new Date().toISOString() })
    .eq('id', eventId);
  if (error) throw error;
}

async function getEventByDedupeKeySupabase(scope: CanonicalScope, dedupeKey: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('canonical_events')
    .select('*')
    .eq('dedupe_key', dedupeKey)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function createEventSupabase(scope: CanonicalScope, data: any) {
  const supabase = getSupabaseAdmin();
  const payload = {
    id: data.id ?? crypto.randomUUID(),
    ...data,
    tenant_id: scope.tenantId,
    workspace_id: data.workspace_id ?? scope.workspaceId,
    occurred_at: data.occurred_at ?? new Date().toISOString(),
    ingested_at: data.ingested_at ?? new Date().toISOString(),
    status: data.status ?? 'received',
  };
  const { error } = await supabase.from('canonical_events').insert(payload);
  if (error) throw error;
  return payload;
}

export function createCanonicalRepository(): CanonicalRepository {
  return {
    fetchCaseGraphRows: fetchCaseGraphRowsSupabase,
    findCaseByLinkedEntity: findCaseByLinkedEntitySupabase,
    getCustomerState: getCustomerStateSupabase,
    getExecutionPlan: getExecutionPlanSupabase,
    getInternalNotes: getInternalNotesSupabase,
    getApprovalWithContext: getApprovalWithContextSupabase,
    getAuditTrail: getAuditTrailSupabase,
    getEventByDedupeKey: getEventByDedupeKeySupabase,
    createEvent: createEventSupabase,
    updateEventStatus: updateEventStatusSupabase,
  };
}
