import { getDb } from '../db/client.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { parseRow } from '../db/utils.js';

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
  getEvent(scope: CanonicalScope, eventId: string): Promise<any | null>;
  getEventByDedupeKey(scope: CanonicalScope, dedupeKey: string): Promise<any | null>;
  createEvent(scope: CanonicalScope, data: any): Promise<string>;
  updateEventStatus(scope: CanonicalScope, eventId: string, updates: any): Promise<void>;
}

function toSqliteValue(value: any) {
  if (value === undefined) return null;
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value;
}

function normalizeCanonicalEvent(scope: CanonicalScope, data: any) {
  return {
    id: data.id,
    dedupe_key: data.dedupe_key ?? data.dedupeKey,
    tenant_id: scope.tenantId,
    workspace_id: scope.workspaceId,
    source_system: data.source_system ?? data.sourceSystem,
    source_entity_type: data.source_entity_type ?? data.sourceEntityType ?? 'unknown',
    source_entity_id: data.source_entity_id ?? data.sourceEntityId ?? 'unknown',
    event_type: data.event_type ?? data.eventType,
    event_category: data.event_category ?? data.eventCategory ?? null,
    occurred_at: data.occurred_at ?? data.occurredAt ?? new Date().toISOString(),
    ingested_at: data.ingested_at ?? data.ingestedAt ?? new Date().toISOString(),
    processed_at: data.processed_at ?? data.processedAt ?? null,
    canonical_entity_type: data.canonical_entity_type ?? data.canonicalEntityType ?? null,
    canonical_entity_id: data.canonical_entity_id ?? data.canonicalEntityId ?? null,
    correlation_id: data.correlation_id ?? data.correlationId ?? null,
    case_id: data.case_id ?? data.caseId ?? null,
    normalized_payload: data.normalized_payload ?? data.normalizedPayload ?? {},
    confidence: data.confidence ?? 1,
    mapping_version: data.mapping_version ?? data.mappingVersion ?? '1.0',
    status: data.status ?? 'received',
    updated_at: data.updated_at ?? new Date().toISOString(),
  };
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
    orderEvents, returnEvents, agentRuns
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
    returnIds.length ? supabase.from('return_events').select('*').in('return_id', returnIds).order('time', { ascending: true }) : Promise.resolve({ data: [] }),
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
    returnEvents: returnEvents.data || [],
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

async function fetchCaseGraphRowsSqlite(scope: CanonicalScope, caseId: string) {
  const db = getDb();

  const caseRow = db.prepare(`
    SELECT c.*,
           cu.canonical_name AS customer_name,
           cu.canonical_email AS customer_email,
           cu.segment AS customer_segment,
           cu.risk_level AS customer_risk_level,
           cu.lifetime_value AS customer_lifetime_value,
           cu.total_orders AS customer_total_orders,
           cu.total_spent AS customer_total_spent,
           u.name AS assigned_user_name,
           t.name AS assigned_team_name,
           conv.subject AS conversation_subject,
           conv.external_thread_id,
           conv.channel AS conversation_channel
    FROM cases c
    LEFT JOIN customers cu ON c.customer_id = cu.id
    LEFT JOIN users u ON c.assigned_user_id = u.id
    LEFT JOIN teams t ON c.assigned_team_id = t.id
    LEFT JOIN conversations conv ON c.conversation_id = conv.id
    WHERE c.id = ? AND c.tenant_id = ? AND c.workspace_id = ?
  `).get(caseId, scope.tenantId, scope.workspaceId);

  if (!caseRow) return null;

  const parsedCase = parseRow(caseRow);
  const orderIds = Array.isArray(parsedCase.order_ids) ? parsedCase.order_ids : [];
  const paymentIds = Array.isArray(parsedCase.payment_ids) ? parsedCase.payment_ids : [];
  const returnIds = Array.isArray(parsedCase.return_ids) ? parsedCase.return_ids : [];

  const orders = orderIds.length > 0
    ? db.prepare(`SELECT * FROM orders WHERE tenant_id = ? AND workspace_id = ? AND id IN (${orderIds.map(() => '?').join(',')})`).all(scope.tenantId, scope.workspaceId, ...orderIds).map(parseRow)
    : [];
  const payments = paymentIds.length > 0
    ? db.prepare(`SELECT * FROM payments WHERE tenant_id = ? AND id IN (${paymentIds.map(() => '?').join(',')})`).all(scope.tenantId, ...paymentIds).map(parseRow)
    : [];
  const returns = returnIds.length > 0
    ? db.prepare(`SELECT * FROM returns WHERE tenant_id = ? AND workspace_id = ? AND id IN (${returnIds.map(() => '?').join(',')})`).all(scope.tenantId, scope.workspaceId, ...returnIds).map(parseRow)
    : [];

  const approvals = db.prepare(`
    SELECT * FROM approval_requests
    WHERE case_id = ? AND tenant_id = ?
    ORDER BY created_at DESC
  `).all(caseId, scope.tenantId).map(parseRow);

  const workflowRuns = db.prepare(`
    SELECT * FROM workflow_runs
    WHERE case_id = ? AND tenant_id = ?
    ORDER BY started_at DESC
  `).all(caseId, scope.tenantId).map(parseRow);
  const workflowRunSteps = workflowRuns.length > 0
    ? db.prepare(`SELECT * FROM workflow_run_steps WHERE workflow_run_id IN (${workflowRuns.map(() => '?').join(',')}) ORDER BY started_at ASC`).all(...workflowRuns.map((run: any) => run.id)).map(parseRow)
    : [];
  const agentRuns = db.prepare(`
    SELECT * FROM agent_runs
    WHERE case_id = ? AND tenant_id = ?
    ORDER BY started_at DESC
  `).all(caseId, scope.tenantId).map(parseRow);

  const reconciliationIssues = db.prepare(`
    SELECT * FROM reconciliation_issues
    WHERE case_id = ? AND tenant_id = ?
    ORDER BY detected_at DESC
  `).all(caseId, scope.tenantId).map(parseRow);

  const linkedCases = db.prepare(`
    SELECT cl.link_type, c.id, c.case_number, c.type, c.status
    FROM case_links cl
    JOIN cases c ON c.id = cl.linked_case_id
    WHERE cl.case_id = ? AND cl.tenant_id = ?
  `).all(caseId, scope.tenantId).map(parseRow);

  const conversation = parsedCase.conversation_id
    ? parseRow(db.prepare(`
        SELECT * FROM conversations
        WHERE id = ? AND tenant_id = ? AND workspace_id = ?
      `).get(parsedCase.conversation_id, scope.tenantId, scope.workspaceId))
    : null;

  const messages = parsedCase.conversation_id
    ? db.prepare(`
        SELECT * FROM messages
        WHERE conversation_id = ? AND tenant_id = ?
        ORDER BY sent_at ASC
      `).all(parsedCase.conversation_id, scope.tenantId).map(parseRow)
    : [];

  const internalNotes = db.prepare(`
    SELECT * FROM internal_notes
    WHERE case_id = ? AND tenant_id = ?
    ORDER BY created_at ASC
  `).all(caseId, scope.tenantId).map(parseRow);

  const statusHistory = db.prepare(`
    SELECT * FROM case_status_history
    WHERE case_id = ? AND tenant_id = ?
    ORDER BY created_at ASC
  `).all(caseId, scope.tenantId).map(parseRow);

  const canonicalEvents = db.prepare(`
    SELECT * FROM canonical_events
    WHERE case_id = ? AND tenant_id = ? AND workspace_id = ?
    ORDER BY occurred_at ASC
  `).all(caseId, scope.tenantId, scope.workspaceId).map(parseRow);

  const orderEvents = orderIds.length > 0
    ? db.prepare(`SELECT * FROM order_events WHERE tenant_id = ? AND order_id IN (${orderIds.map(() => '?').join(',')}) ORDER BY time ASC`).all(scope.tenantId, ...orderIds).map(parseRow)
    : [];
  const returnEvents = returnIds.length > 0
    ? db.prepare(`SELECT * FROM return_events WHERE tenant_id = ? AND return_id IN (${returnIds.map(() => '?').join(',')}) ORDER BY time ASC`).all(scope.tenantId, ...returnIds).map(parseRow)
    : [];

  const refundsByPayment = paymentIds.length > 0
    ? db.prepare(`SELECT * FROM refunds WHERE tenant_id = ? AND payment_id IN (${paymentIds.map(() => '?').join(',')}) ORDER BY created_at ASC`).all(scope.tenantId, ...paymentIds).map(parseRow)
    : [];
  const refundsByOrder = orderIds.length > 0
    ? db.prepare(`SELECT * FROM refunds WHERE tenant_id = ? AND order_id IN (${orderIds.map(() => '?').join(',')}) ORDER BY created_at ASC`).all(scope.tenantId, ...orderIds).map(parseRow)
    : [];
  const refundsByCustomer = parsedCase.customer_id
    ? db.prepare(`SELECT * FROM refunds WHERE tenant_id = ? AND customer_id = ? ORDER BY created_at ASC`).all(scope.tenantId, parsedCase.customer_id).map(parseRow)
    : [];

  const caseKnowledgeLinks = db.prepare(`
    SELECT ckl.*, ka.title AS article_title, ka.content AS article_content, ka.status AS article_status,
           ka.type AS article_type, ka.updated_at AS article_updated_at, ka.created_at AS article_created_at
    FROM case_knowledge_links ckl
    JOIN knowledge_articles ka ON ka.id = ckl.article_id
    WHERE ckl.case_id = ? AND ckl.tenant_id = ?
    ORDER BY ckl.relevance_score DESC, ckl.created_at ASC
  `).all(caseId, scope.tenantId).map(parseRow);

  const knowledgeArticles = caseKnowledgeLinks.map((link: any) => ({
    id: link.article_id,
    title: link.article_title,
    content: link.article_content,
    status: link.article_status,
    type: link.article_type,
    updated_at: link.article_updated_at,
    created_at: link.article_created_at,
  }));

  const connectors = db.prepare(`
    SELECT * FROM connectors
    WHERE tenant_id = ?
    ORDER BY updated_at DESC
  `).all(scope.tenantId).map(parseRow);

  const agents = db.prepare(`
    SELECT * FROM agents
    WHERE tenant_id = ?
    ORDER BY updated_at DESC
  `).all(scope.tenantId).map(parseRow);

  const agentVersions = db.prepare(`
    SELECT * FROM agent_versions
    WHERE tenant_id = ?
    ORDER BY published_at DESC, version_number DESC
  `).all(scope.tenantId).map(parseRow);

  return {
    caseRow: parsedCase,
    orders,
    payments,
    returns,
    approvals,
    workflowRuns,
    reconciliationIssues,
    linkedCases,
    conversation,
    messages,
    internalNotes,
    statusHistory,
    canonicalEvents,
    orderEvents,
    returnEvents,
    workflowRunSteps,
    agentRuns,
    refunds: Array.from(new Map([...refundsByPayment, ...refundsByOrder, ...refundsByCustomer].map((refund: any) => [refund.id, refund])).values()),
    caseKnowledgeLinks,
    knowledgeArticles,
    connectors,
    agents,
    agentVersions,
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

function findCaseByLinkedEntitySqlite(scope: CanonicalScope, entityType: string, entityId: string) {
  const db = getDb();
  const column = entityType === 'order' ? 'order_ids' : entityType === 'payment' ? 'payment_ids' : 'return_ids';
  const row = db.prepare(`
    SELECT id, case_number, type, status, customer_id, conversation_id
    FROM cases
    WHERE tenant_id = ? AND workspace_id = ? AND ${column} LIKE ?
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(scope.tenantId, scope.workspaceId, `%${entityId}%`);
  return row ? parseRow(row) : null;
}

function getCustomerStateSqlite(scope: CanonicalScope, customerId: string) {
  const db = getDb();
  const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND tenant_id = ?').get(customerId, scope.tenantId);
  if (!customer) return null;

  const linkedIdentities = db.prepare('SELECT * FROM linked_identities WHERE customer_id = ? ORDER BY confidence DESC').all(customerId).map(parseRow);
  const cases = db.prepare('SELECT * FROM cases WHERE customer_id = ? AND tenant_id = ? ORDER BY updated_at DESC').all(customerId, scope.tenantId).map(parseRow);
  const orders = db.prepare('SELECT * FROM orders WHERE customer_id = ? AND tenant_id = ? ORDER BY updated_at DESC').all(customerId, scope.tenantId).map(parseRow);
  const payments = db.prepare('SELECT * FROM payments WHERE customer_id = ? AND tenant_id = ? ORDER BY updated_at DESC').all(customerId, scope.tenantId).map(parseRow);
  const returns = db.prepare('SELECT * FROM returns WHERE customer_id = ? AND tenant_id = ? ORDER BY updated_at DESC').all(customerId, scope.tenantId).map(parseRow);

  return {
    customer: parseRow(customer),
    linkedIdentities,
    allCases: cases,
    recentCases: cases.slice(0, 10),
    orders,
    payments,
    returns
  };
}

function getExecutionPlanSqlite(scope: CanonicalScope, caseId: string) {
  const db = getDb();
  return parseRow(db.prepare('SELECT * FROM execution_plans WHERE case_id = ? AND tenant_id = ? ORDER BY generated_at DESC LIMIT 1').get(caseId, scope.tenantId));
}

function getInternalNotesSqlite(scope: CanonicalScope, caseId: string, limit = 10) {
  const db = getDb();
  return db.prepare('SELECT * FROM internal_notes WHERE case_id = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT ?').all(caseId, scope.tenantId, limit).map(parseRow);
}

function getApprovalWithContextSqlite(scope: CanonicalScope, approvalId: string) {
  const db = getDb();
  const row = db.prepare(`
    SELECT a.*,
           c.case_number, c.type AS case_type, c.status AS case_status, c.priority AS case_priority,
           c.risk_level AS case_risk_level, c.customer_id, c.conversation_id,
           c.source_channel, c.source_system, c.approval_state, c.execution_state,
           cu.canonical_name AS customer_name, cu.canonical_email AS customer_email,
           cu.segment AS customer_segment, cu.lifetime_value, cu.dispute_rate, cu.refund_rate
    FROM approval_requests a
    JOIN cases c ON c.id = a.case_id
    LEFT JOIN customers cu ON cu.id = c.customer_id
    WHERE a.id = ? AND a.tenant_id = ?
  `).get(approvalId, scope.tenantId);
  return row ? parseRow(row) : null;
}

function getAuditTrailSqlite(scope: CanonicalScope, caseId: string, approvalId: string) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM audit_events
    WHERE tenant_id = ? AND (
      (entity_type = 'case' AND entity_id = ?)
      OR (entity_type = 'approval' AND entity_id = ?)
    )
    ORDER BY occurred_at ASC
  `).all(scope.tenantId, caseId, approvalId).map(parseRow);
}

async function getEventSupabase(scope: CanonicalScope, eventId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('canonical_events')
    .select('*')
    .eq('id', eventId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
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
  const payload = normalizeCanonicalEvent(scope, data);
  const { error } = await supabase.from('canonical_events').insert(payload);
  if (error) throw error;
  return payload.id;
}

async function updateEventStatusSupabase(scope: CanonicalScope, eventId: string, updates: any) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('canonical_events')
    .update({ ...updates, processed_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}

async function getEventSqlite(scope: CanonicalScope, eventId: string) {
  const db = getDb();
  return parseRow(db.prepare(`
    SELECT * FROM canonical_events
    WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    LIMIT 1
  `).get(eventId, scope.tenantId, scope.workspaceId));
}

async function getEventByDedupeKeySqlite(scope: CanonicalScope, dedupeKey: string) {
  const db = getDb();
  return parseRow(db.prepare(`
    SELECT * FROM canonical_events
    WHERE dedupe_key = ? AND tenant_id = ? AND workspace_id = ?
    LIMIT 1
  `).get(dedupeKey, scope.tenantId, scope.workspaceId));
}

async function createEventSqlite(scope: CanonicalScope, data: any) {
  const db = getDb();
  const payload = normalizeCanonicalEvent(scope, data);
  const fields = Object.keys(payload).filter((key) => (payload as any)[key] !== undefined);
  db.prepare(`INSERT INTO canonical_events (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`)
    .run(...fields.map((key) => toSqliteValue((payload as any)[key])));
  return payload.id;
}

async function updateEventStatusSqlite(_scope: CanonicalScope, eventId: string, updates: any) {
  const db = getDb();
  const fields = Object.keys(updates).map(k => `${k} = ?`);
  const params = Object.values(updates).map(toSqliteValue);
  params.push(eventId);
  db.prepare(`UPDATE canonical_events SET ${fields.join(', ')}, processed_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...params);
}

export function createCanonicalRepository(): CanonicalRepository {
  if (getDatabaseProvider() === 'supabase') {
    return {
      fetchCaseGraphRows: fetchCaseGraphRowsSupabase,
      findCaseByLinkedEntity: findCaseByLinkedEntitySupabase,
      getCustomerState: getCustomerStateSupabase,
      getExecutionPlan: getExecutionPlanSupabase,
      getInternalNotes: getInternalNotesSupabase,
      getApprovalWithContext: getApprovalWithContextSupabase,
      getAuditTrail: getAuditTrailSupabase,
      getEvent: getEventSupabase,
      getEventByDedupeKey: getEventByDedupeKeySupabase,
      createEvent: createEventSupabase,
      updateEventStatus: updateEventStatusSupabase,
    };
  }

  return {
    fetchCaseGraphRows: async (scope, caseId) => fetchCaseGraphRowsSqlite(scope, caseId),
    findCaseByLinkedEntity: async (scope, type, id) => findCaseByLinkedEntitySqlite(scope, type, id),
    getCustomerState: async (scope, customerId) => getCustomerStateSqlite(scope, customerId),
    getExecutionPlan: async (scope, caseId) => getExecutionPlanSqlite(scope, caseId),
    getInternalNotes: async (scope, caseId, limit) => getInternalNotesSqlite(scope, caseId, limit),
    getApprovalWithContext: async (scope, approvalId) => getApprovalWithContextSqlite(scope, approvalId),
    getAuditTrail: async (scope, caseId, approvalId) => getAuditTrailSqlite(scope, caseId, approvalId),
    getEvent: getEventSqlite,
    getEventByDedupeKey: getEventByDedupeKeySqlite,
    createEvent: createEventSqlite,
    updateEventStatus: updateEventStatusSqlite,
  };
}
