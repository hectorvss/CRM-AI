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
  ];

  return timeline.sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
}

function buildCaseState(bundle: any) {
  const conversation = bundle.conversation;
  const latestInbound = (bundle.messages ?? []).filter((message: any) => message.direction === 'inbound').at(-1);
  const latestOutbound = (bundle.messages ?? []).filter((message: any) => message.direction === 'outbound').at(-1);
  const conflict = buildConflictSummary(bundle);

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
      external_refs: compactStrings([
        bundle.case.source_entity_id,
        ...(bundle.orders ?? []).map((item: any) => item.external_order_id),
        ...(bundle.payments ?? []).map((item: any) => item.external_payment_id),
        ...(bundle.returns ?? []).map((item: any) => item.external_return_id),
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
        status: canonicalHealth(bundle.orders?.[0]?.status || 'pending'),
        source_of_truth: 'orders',
        summary: bundle.orders?.[0]?.status || 'N/A',
        identifiers: compactStrings((bundle.orders ?? []).map((item: any) => item.external_order_id || item.id)),
        nodes: (bundle.orders ?? []).slice(0, 6).map((item: any) => ({
          id: item.id,
          label: item.external_order_id || item.id,
          status: canonicalHealth(item.has_conflict ? 'conflict' : item.status),
          source: 'orders',
          value: item.status,
          timestamp: item.order_date || item.updated_at || item.created_at,
        })),
      },
      payments: {
        key: 'payments',
        label: 'Payments',
        status: canonicalHealth(bundle.payments?.some((item: any) => item.has_conflict) ? 'conflict' : bundle.payments?.[0]?.status || 'pending'),
        source_of_truth: 'payments',
        summary: bundle.payments?.[0]?.status || 'N/A',
        identifiers: compactStrings((bundle.payments ?? []).map((item: any) => item.external_payment_id || item.id)),
        nodes: (bundle.payments ?? []).slice(0, 6).map((item: any) => ({
          id: item.id,
          label: item.external_payment_id || item.id,
          status: canonicalHealth(item.has_conflict ? 'conflict' : item.status),
          source: 'payments',
          value: item.status,
          timestamp: item.created_at,
        })),
      },
      returns: {
        key: 'returns',
        label: 'Returns',
        status: canonicalHealth(bundle.returns?.some((item: any) => item.has_conflict) ? 'conflict' : bundle.returns?.[0]?.status || 'pending'),
        source_of_truth: 'returns',
        summary: bundle.returns?.[0]?.status || 'N/A',
        identifiers: compactStrings((bundle.returns ?? []).map((item: any) => item.external_return_id || item.id)),
        nodes: (bundle.returns ?? []).slice(0, 6).map((item: any) => ({
          id: item.id,
          label: item.external_return_id || item.id,
          status: canonicalHealth(item.has_conflict ? 'conflict' : item.status),
          source: 'returns',
          value: item.status,
          timestamp: item.created_at,
        })),
      },
      approvals: {
        key: 'approvals',
        label: 'Approvals',
        status: canonicalHealth(bundle.case.approval_state || 'pending'),
        source_of_truth: 'approvals',
        summary: bundle.case.approval_state || 'not_required',
        identifiers: compactStrings((bundle.approvals ?? []).map((item: any) => item.id)),
        nodes: (bundle.approvals ?? []).slice(0, 6).map((item: any) => ({
          id: item.id,
          label: item.action_type || item.id,
          status: canonicalHealth(item.status),
          source: 'approvals',
          value: item.status,
          timestamp: item.created_at,
        })),
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
      approvals: bundle.approvals ?? [],
      reconciliation_issues: bundle.reconciliation_issues ?? [],
      linked_cases: bundle.linked_cases ?? [],
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
    execution: {
      mode: 'manual',
      status: bundle.case.execution_state || 'idle',
      requires_approval: ['pending', 'awaiting_approval'].includes((bundle.case.approval_state || '').toLowerCase()),
      approval_state: bundle.case.approval_state,
      plan_id: bundle.case.active_execution_plan_id || null,
      steps: state.timeline.slice(0, 6).map((entry: any, index: number) => ({
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
    approvalsResult,
    issuesResult,
    linksResult,
    draftsResult,
    notesResult,
    messagesResult,
    userResult,
    teamResult,
  ] = await Promise.all([
    caseRow.customer_id ? supabase.from('customers').select('*').eq('id', caseRow.customer_id).maybeSingle() : Promise.resolve({ data: null, error: null } as any),
    supabase.from('conversations').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId).order('last_message_at', { ascending: false }).limit(1).maybeSingle(),
    caseRow.order_ids?.length ? supabase.from('orders').select('*').in('id', caseRow.order_ids).eq('tenant_id', scope.tenantId) : Promise.resolve({ data: [], error: null } as any),
    caseRow.payment_ids?.length ? supabase.from('payments').select('*').in('id', caseRow.payment_ids).eq('tenant_id', scope.tenantId) : Promise.resolve({ data: [], error: null } as any),
    caseRow.return_ids?.length ? supabase.from('returns').select('*').in('id', caseRow.return_ids).eq('tenant_id', scope.tenantId) : Promise.resolve({ data: [], error: null } as any),
    supabase.from('approval_requests').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).order('created_at', { ascending: false }),
    supabase.from('reconciliation_issues').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).order('created_at', { ascending: false }),
    supabase.from('case_links').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId),
    supabase.from('draft_replies').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).order('generated_at', { ascending: false }),
    supabase.from('internal_notes').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).order('created_at', { ascending: false }),
    supabase.from('messages').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId).order('sent_at', { ascending: true }),
    caseRow.assigned_user_id ? supabase.from('users').select('name, email').eq('id', caseRow.assigned_user_id).maybeSingle() : Promise.resolve({ data: null, error: null } as any),
    caseRow.assigned_team_id ? supabase.from('teams').select('name').eq('id', caseRow.assigned_team_id).maybeSingle() : Promise.resolve({ data: null, error: null } as any),
  ]);

  for (const result of [customerResult, conversationResult, ordersResult, paymentsResult, returnsResult, approvalsResult, issuesResult, linksResult, draftsResult, notesResult, messagesResult, userResult, teamResult]) {
    if (result?.error) throw result.error;
  }

  const relatedCaseIds = compactStrings((linksResult.data ?? []).map((row: any) => row.linked_case_id));
  const linkedCases = relatedCaseIds.length
    ? ((await supabase.from('cases').select('id, case_number, type, status, priority, risk_level').in('id', relatedCaseIds).eq('tenant_id', scope.tenantId)).data ?? [])
    : [];

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
    approvals: approvalsResult.data ?? [],
    reconciliation_issues: issuesResult.data ?? [],
    linked_cases: linkedCases,
    drafts: draftsResult.data ?? [],
    internal_notes: notesResult.data ?? [],
    messages: messagesResult.data ?? [],
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

  return {
    case: parsedCase,
    customer: customer ? parseRow(customer) : null,
    conversation: conversation ? parseRow(conversation) : null,
    orders: orders.map(parseRow),
    payments: payments.map(parseRow),
    returns: returns.map(parseRow),
    approvals: approvals.map(parseRow),
    reconciliation_issues: reconciliationIssues.map(parseRow),
    linked_cases: linkedCases.map(parseRow),
    drafts: drafts.map(parseRow),
    internal_notes: internalNotes.map(parseRow),
    messages: messages.map(parseRow),
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
      ? db.prepare(`SELECT status, refund_status FROM payments WHERE tenant_id = ? AND id IN (${parsed.payment_ids.map(() => '?').join(',')}) LIMIT 1`).all(scope.tenantId, ...parsed.payment_ids)
      : [];
    const returns: any[] = parsed.return_ids?.length
      ? db.prepare(`SELECT status FROM returns WHERE tenant_id = ? AND id IN (${parsed.return_ids.map(() => '?').join(',')}) LIMIT 1`).all(scope.tenantId, ...parsed.return_ids)
      : [];

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
        refund: returns[0]?.status || payments[0]?.refund_status || 'N/A',
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
  const userIds = compactStrings(rows.map((row) => row.assigned_user_id));
  const teamIds = compactStrings(rows.map((row) => row.assigned_team_id));

  const [customersRes, usersRes, teamsRes, messagesRes] = await Promise.all([
    customerIds.length ? supabase.from('customers').select('id, canonical_name, canonical_email, segment').in('id', customerIds) : Promise.resolve({ data: [], error: null } as any),
    userIds.length ? supabase.from('users').select('id, name').in('id', userIds) : Promise.resolve({ data: [], error: null } as any),
    teamIds.length ? supabase.from('teams').select('id, name').in('id', teamIds) : Promise.resolve({ data: [], error: null } as any),
    caseIds.length ? supabase.from('messages').select('case_id, content, sent_at').in('case_id', caseIds).eq('tenant_id', scope.tenantId).order('sent_at', { ascending: false }) : Promise.resolve({ data: [], error: null } as any),
  ]);

  for (const result of [customersRes, usersRes, teamsRes, messagesRes]) {
    if (result?.error) throw result.error;
  }

  const customers = new Map<string, any>((customersRes.data ?? []).map((row: any) => [row.id, row]));
  const users = new Map<string, any>((usersRes.data ?? []).map((row: any) => [row.id, row]));
  const teams = new Map<string, any>((teamsRes.data ?? []).map((row: any) => [row.id, row]));
  const latestMessageByCase = new Map<string, any>();
  for (const row of messagesRes.data ?? []) {
    if (!latestMessageByCase.has(row.case_id)) latestMessageByCase.set(row.case_id, row);
  }

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
          order: row.order_ids?.length ? 'linked' : 'N/A',
          payment: row.payment_ids?.length ? 'linked' : 'N/A',
          fulfillment: row.order_ids?.length ? 'linked' : 'N/A',
          refund: row.return_ids?.length ? 'linked' : 'N/A',
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
