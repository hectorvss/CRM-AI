import { getDb } from '../db/client.js';
import { parseRow } from '../db/utils.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import {
  getOrderCanonicalContext,
  getPaymentCanonicalContext,
  getReturnCanonicalContext,
} from '../services/canonicalState.js';

// ── Scope & Filter interfaces ────────────────────────────────

export interface CommerceScope {
  tenantId: string;
  workspaceId: string;
}

export interface OrderFilters {
  status?: string;
  risk_level?: string;
  q?: string;
}

export interface PaymentFilters {
  status?: string;
  risk_level?: string;
  q?: string;
}

export interface ReturnFilters {
  status?: string;
  risk_level?: string;
  q?: string;
}

// ── Helpers ──────────────────────────────────────────────────

function titleCase(value: string | null | undefined): string {
  if (!value) return 'N/A';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function compactBadges(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value) && value !== 'N/A')),
  );
}

// ── Order enrichment ─────────────────────────────────────────

function buildOrderTab(row: any): string {
  if (row.conflict_detected || row.has_conflict) return 'conflicts';
  if (
    (row.summary || '').toLowerCase().includes('refund') ||
    (row.badges || []).includes('Refund Pending')
  )
    return 'refunds';
  if (row.risk_level === 'high' || row.approval_status === 'pending') return 'attention';
  return 'all';
}

async function enrichOrder(row: any, tenantId: string, workspaceId: string): Promise<any> {
  const parsed = parseRow(row) as any;
  const context = await getOrderCanonicalContext(parsed.id, tenantId, workspaceId);
  const caseState = context?.case_state;
  const systems = caseState?.systems;
  const primaryPayment = caseState?.related.payments?.[0];
  const primaryReturn = caseState?.related.returns?.[0];
  const approval = caseState?.related.approvals?.[0];
  const badges = compactBadges([
    titleCase(parsed.status),
    titleCase(primaryPayment?.status),
    titleCase(primaryReturn?.status),
    caseState?.conflict.has_conflict ? 'Conflict' : null,
    parsed.risk_level === 'high' ? 'High Risk' : null,
    approval?.status === 'pending' ? 'Approval Needed' : null,
  ]);

  return {
    ...parsed,
    summary: parsed.summary || caseState?.conflict.root_cause || caseState?.case?.type || '',
    recommended_action:
      parsed.recommended_action || caseState?.conflict.recommended_action || null,
    conflict_detected: parsed.conflict_detected || caseState?.conflict.root_cause || null,
    approval_status:
      parsed.approval_status || approval?.status || caseState?.case?.approval_state || 'not_required',
    system_states: {
      oms: parsed.status || systems?.orders?.nodes?.[0]?.value || 'Unknown',
      psp: primaryPayment?.status || systems?.payments?.nodes?.[0]?.value || 'N/A',
      wms: systems?.fulfillment?.nodes?.[0]?.value || 'N/A',
      carrier:
        systems?.fulfillment?.nodes?.[0]?.source === 'Carrier'
          ? systems.fulfillment.nodes[0]?.value
          : 'N/A',
      returns_platform:
        primaryReturn?.status || systems?.returns?.nodes?.[0]?.value || 'N/A',
      refund_status:
        primaryPayment?.refund_status || primaryReturn?.refund_status || 'N/A',
      canonical: systems?.orders?.status || 'pending',
    },
    badges,
    tab: buildOrderTab({
      ...parsed,
      summary: parsed.summary || caseState?.conflict.root_cause || '',
      conflict_detected: parsed.conflict_detected || caseState?.conflict.root_cause || '',
      approval_status:
        parsed.approval_status || approval?.status || 'not_required',
      badges,
    }),
    last_update: parsed.updated_at || parsed.order_date || null,
    events: caseState
      ? caseState.timeline.filter((entry: any) =>
          ['orders', 'fulfillment', 'returns', 'payments'].includes(entry.domain),
        )
      : [],
    related_cases: caseState?.related.linked_cases?.length
      ? caseState.related.linked_cases
      : context?.related_case
        ? [context.related_case]
        : [],
    canonical_context: context,
  };
}

// ── Payment enrichment ───────────────────────────────────────

function buildPaymentTab(row: any): string {
  const summary = (row.summary || '').toLowerCase();
  if (row.conflict_detected || row.has_conflict) return 'blocked';
  if (
    summary.includes('dispute') ||
    row.dispute_reference ||
    row.system_states?.dispute === 'Open'
  )
    return 'disputes';
  if (
    summary.includes('reconciliation') ||
    row.system_states?.reconciliation === 'Pending'
  )
    return 'reconciliation';
  if (summary.includes('refund') || row.system_states?.refund !== 'N/A') return 'refunds';
  return 'all';
}

async function enrichPayment(row: any, tenantId: string, workspaceId: string): Promise<any> {
  const parsed = parseRow(row) as any;
  const context = await getPaymentCanonicalContext(parsed.id, tenantId, workspaceId);
  const caseState = context?.case_state;
  const systems = caseState?.systems;
  const primaryReturn = caseState?.related.returns?.[0];
  const approval = caseState?.related.approvals?.[0];
  const badges = compactBadges([
    titleCase(parsed.status),
    parsed.refund_status ? titleCase(parsed.refund_status) : null,
    parsed.dispute_reference ? 'Dispute' : null,
    caseState?.conflict.has_conflict ? 'Mismatch' : null,
    approval?.status === 'pending' ? 'Approval Needed' : null,
    parsed.risk_level === 'high' ? 'High Risk' : null,
  ]);

  return {
    ...parsed,
    summary: parsed.summary || caseState?.conflict.root_cause || caseState?.case?.type || '',
    recommended_action:
      parsed.recommended_action || caseState?.conflict.recommended_action || null,
    conflict_detected: parsed.conflict_detected || caseState?.conflict.root_cause || null,
    approval_status:
      parsed.approval_status || approval?.status || caseState?.case?.approval_state || 'not_required',
    system_states: {
      oms: systems?.orders?.nodes?.[0]?.value || caseState?.case?.status || 'N/A',
      psp: parsed.status || systems?.payments?.nodes?.[0]?.value || 'N/A',
      refund: parsed.refund_status || primaryReturn?.refund_status || 'N/A',
      dispute: parsed.dispute_reference ? 'Open' : 'N/A',
      reconciliation: caseState?.conflict.has_conflict ? 'Mismatch' : 'Matched',
      canonical: systems?.payments?.status || 'pending',
    },
    badges,
    tab: buildPaymentTab({
      ...parsed,
      summary: parsed.summary || caseState?.conflict.root_cause || '',
      conflict_detected: parsed.conflict_detected || caseState?.conflict.root_cause || '',
      badges,
      system_states: {
        dispute: parsed.dispute_reference ? 'Open' : 'N/A',
        reconciliation: caseState?.conflict.has_conflict ? 'Mismatch' : 'Matched',
        refund: parsed.refund_status || primaryReturn?.refund_status || 'N/A',
      },
    }),
    last_update: parsed.updated_at || parsed.created_at || null,
    events: caseState
      ? caseState.timeline.filter((entry: any) =>
          ['payments', 'orders', 'returns', 'approvals'].includes(entry.domain),
        )
      : [],
    related_cases: caseState?.related.linked_cases?.length
      ? caseState.related.linked_cases
      : context?.related_case
        ? [context.related_case]
        : [],
    canonical_context: context,
  };
}

// ── Return enrichment ────────────────────────────────────────

function buildReturnTab(row: any): string {
  const summary = (row.summary || '').toLowerCase();
  if (row.conflict_detected || row.has_conflict || row.status === 'blocked') return 'blocked';
  if (summary.includes('review') || row.approval_status === 'pending') return 'pending_review';
  if (summary.includes('transit') || row.carrier_status === 'in_transit') return 'in_transit';
  if (summary.includes('refund') || row.refund_status === 'pending') return 'refund_pending';
  if (row.status === 'received') return 'received';
  return 'all';
}

async function enrichReturn(row: any, tenantId: string, workspaceId: string): Promise<any> {
  const parsed = parseRow(row) as any;
  const context = await getReturnCanonicalContext(parsed.id, tenantId, workspaceId);
  const caseState = context?.case_state;
  const systems = caseState?.systems;
  const primaryPayment = caseState?.related.payments?.[0];
  const approval = caseState?.related.approvals?.[0];
  const fulfillmentNode = systems?.fulfillment?.nodes?.[0];
  const badges = compactBadges([
    titleCase(parsed.status),
    parsed.refund_status ? titleCase(parsed.refund_status) : null,
    caseState?.conflict.has_conflict ? 'Conflict' : null,
    parsed.risk_level === 'high' ? 'High Risk' : null,
    approval?.status === 'pending' ? 'Approval Needed' : null,
  ]);

  return {
    ...parsed,
    summary: parsed.summary || caseState?.conflict.root_cause || caseState?.case?.type || '',
    recommended_action:
      parsed.recommended_action || caseState?.conflict.recommended_action || null,
    conflict_detected: parsed.conflict_detected || caseState?.conflict.root_cause || null,
    approval_status:
      parsed.approval_status || approval?.status || caseState?.case?.approval_state || 'not_required',
    carrier_status:
      parsed.carrier_status ||
      (fulfillmentNode?.source === 'Carrier' ? fulfillmentNode.value : 'N/A'),
    inspection_status:
      parsed.inspection_status || (parsed.status === 'received' ? 'Awaiting inspection' : 'N/A'),
    system_states: {
      oms: systems?.orders?.nodes?.[0]?.value || caseState?.case?.status || 'N/A',
      returns_platform: parsed.status || systems?.returns?.nodes?.[0]?.value || 'N/A',
      wms: fulfillmentNode?.source === 'WMS' ? fulfillmentNode.value : 'N/A',
      carrier:
        parsed.carrier_status ||
        (fulfillmentNode?.source === 'Carrier' ? fulfillmentNode.value : 'N/A'),
      psp: primaryPayment?.status || systems?.payments?.nodes?.[0]?.value || 'N/A',
      canonical: systems?.returns?.status || 'pending',
    },
    badges,
    tab: buildReturnTab({
      ...parsed,
      summary: parsed.summary || caseState?.conflict.root_cause || '',
      conflict_detected: parsed.conflict_detected || caseState?.conflict.root_cause || '',
      approval_status: parsed.approval_status || approval?.status || 'not_required',
      carrier_status:
        parsed.carrier_status ||
        (fulfillmentNode?.source === 'Carrier' ? fulfillmentNode.value : 'N/A'),
      badges,
      refund_status: parsed.refund_status || primaryPayment?.refund_status || 'N/A',
    }),
    last_update: parsed.updated_at || parsed.created_at || null,
    events: caseState
      ? caseState.timeline.filter((entry: any) =>
          ['returns', 'payments', 'orders', 'fulfillment', 'approvals'].includes(entry.domain),
        )
      : [],
    related_cases: caseState?.related.linked_cases?.length
      ? caseState.related.linked_cases
      : context?.related_case
        ? [context.related_case]
        : [],
    canonical_context: context,
  };
}

// ── SQLite implementations ───────────────────────────────────

async function listOrdersSqlite(scope: CommerceScope, filters: OrderFilters): Promise<any[]> {
  const db = getDb();
  let query = `
    SELECT o.*, cu.canonical_name as customer_name, cu.segment as customer_segment
    FROM orders o
    LEFT JOIN customers cu ON o.customer_id = cu.id
    WHERE o.tenant_id = ? AND o.workspace_id = ?
  `;
  const params: any[] = [scope.tenantId, scope.workspaceId];

  if (filters.status) { query += ' AND o.status = ?'; params.push(filters.status); }
  if (filters.risk_level) { query += ' AND o.risk_level = ?'; params.push(filters.risk_level); }
  if (filters.q) {
    query += ' AND (o.external_order_id LIKE ? OR cu.canonical_name LIKE ?)';
    const t = `%${filters.q}%`;
    params.push(t, t);
  }

  query += ' ORDER BY o.updated_at DESC';

  const rows = db.prepare(query).all(...params);
  return Promise.all(rows.map((row: any) => enrichOrder(row, scope.tenantId, scope.workspaceId)));
}

async function getOrderSqlite(scope: CommerceScope, orderId: string): Promise<any | null> {
  const db = getDb();
  const order = db
    .prepare(
      `SELECT o.*, cu.canonical_name as customer_name, cu.canonical_email as customer_email
       FROM orders o LEFT JOIN customers cu ON o.customer_id = cu.id
       WHERE o.id = ? AND o.tenant_id = ? AND o.workspace_id = ?`,
    )
    .get(orderId, scope.tenantId, scope.workspaceId) as any;

  if (!order) return null;

  const context = await getOrderCanonicalContext(orderId, scope.tenantId, scope.workspaceId);
  const events = db
    .prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY time ASC')
    .all(orderId);

  const relatedCases = db
    .prepare(
      `SELECT id, case_number, status, type
       FROM cases
       WHERE order_ids LIKE ? AND tenant_id = ? AND workspace_id = ?`,
    )
    .all(`%${orderId}%`, scope.tenantId, scope.workspaceId);

  const enriched = await enrichOrder(order, scope.tenantId, scope.workspaceId);
  return {
    ...enriched,
    events: context?.case_state
      ? context.case_state.timeline.filter((entry: any) =>
          ['orders', 'fulfillment', 'returns', 'payments'].includes(entry.domain),
        )
      : events.map(parseRow),
    related_cases: context?.case_state?.related.linked_cases?.length
      ? context.case_state.related.linked_cases
      : relatedCases.map(parseRow),
    canonical_context: context,
  };
}

function updateOrderSqlite(scope: CommerceScope, orderId: string, updates: any): void {
  const db = getDb();
  const fields = Object.keys(updates);
  if (fields.length === 0) return;

  const setClause = fields.map((f) => `${f} = ?`).join(', ');
  const params = [...Object.values(updates), orderId, scope.tenantId, scope.workspaceId];
  
  db.prepare(`
    UPDATE orders 
    SET ${setClause}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ? AND workspace_id = ?
  `).run(...params);
}

async function getOrderContextSqlite(scope: CommerceScope, orderId: string): Promise<any | null> {
  return (await getOrderCanonicalContext(orderId, scope.tenantId, scope.workspaceId)) ?? null;
}

async function listPaymentsSqlite(scope: CommerceScope, filters: PaymentFilters): Promise<any[]> {
  const db = getDb();
  let query = `
    SELECT p.*, cu.canonical_name as customer_name
    FROM payments p
    LEFT JOIN customers cu ON p.customer_id = cu.id
    WHERE p.tenant_id = ? AND p.workspace_id = ?
  `;
  const params: any[] = [scope.tenantId, scope.workspaceId];

  if (filters.status) { query += ' AND p.status = ?'; params.push(filters.status); }
  if (filters.risk_level) { query += ' AND p.risk_level = ?'; params.push(filters.risk_level); }
  if (filters.q) {
    query += ' AND (p.external_payment_id LIKE ? OR cu.canonical_name LIKE ?)';
    const t = `%${filters.q}%`;
    params.push(t, t);
  }

  query += ' ORDER BY p.updated_at DESC';

  const rows = db.prepare(query).all(...params);
  return Promise.all(rows.map((row: any) => enrichPayment(row, scope.tenantId, scope.workspaceId)));
}

async function getPaymentSqlite(scope: CommerceScope, paymentId: string): Promise<any | null> {
  const db = getDb();
  const payment = db
    .prepare(
      `SELECT p.*, cu.canonical_name as customer_name, cu.canonical_email as customer_email
       FROM payments p LEFT JOIN customers cu ON p.customer_id = cu.id
       WHERE p.id = ? AND p.tenant_id = ? AND p.workspace_id = ?`,
    )
    .get(paymentId, scope.tenantId, scope.workspaceId) as any;

  if (!payment) return null;

  const context = await getPaymentCanonicalContext(paymentId, scope.tenantId, scope.workspaceId);
  return {
    ...(await enrichPayment(payment, scope.tenantId, scope.workspaceId)),
    canonical_context: context,
  };
}

function updatePaymentSqlite(scope: CommerceScope, paymentId: string, updates: any): void {
  const db = getDb();
  const fields = Object.keys(updates);
  if (fields.length === 0) return;

  const setClause = fields.map((f) => `${f} = ?`).join(', ');
  const params = [...Object.values(updates), paymentId, scope.tenantId, scope.workspaceId];
  
  db.prepare(`
    UPDATE payments 
    SET ${setClause}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ? AND workspace_id = ?
  `).run(...params);
}

async function getPaymentContextSqlite(scope: CommerceScope, paymentId: string): Promise<any | null> {
  return (await getPaymentCanonicalContext(paymentId, scope.tenantId, scope.workspaceId)) ?? null;
}

async function listReturnsSqlite(scope: CommerceScope, filters: ReturnFilters): Promise<any[]> {
  const db = getDb();
  let query = `
    SELECT r.*, cu.canonical_name as customer_name
    FROM returns r
    LEFT JOIN customers cu ON r.customer_id = cu.id
    WHERE r.tenant_id = ? AND r.workspace_id = ?
  `;
  const params: any[] = [scope.tenantId, scope.workspaceId];

  if (filters.status) { query += ' AND r.status = ?'; params.push(filters.status); }
  if (filters.risk_level) { query += ' AND r.risk_level = ?'; params.push(filters.risk_level); }
  if (filters.q) {
    query += ' AND (r.external_return_id LIKE ? OR cu.canonical_name LIKE ?)';
    const t = `%${filters.q}%`;
    params.push(t, t);
  }

  query += ' ORDER BY r.updated_at DESC';

  const rows = db.prepare(query).all(...params);
  return Promise.all(rows.map((row: any) => enrichReturn(row, scope.tenantId, scope.workspaceId)));
}

async function getReturnSqlite(scope: CommerceScope, returnId: string): Promise<any | null> {
  const db = getDb();
  const ret = db
    .prepare(
      `SELECT r.*, cu.canonical_name as customer_name
       FROM returns r LEFT JOIN customers cu ON r.customer_id = cu.id
       WHERE r.id = ? AND r.tenant_id = ? AND r.workspace_id = ?`,
    )
    .get(returnId, scope.tenantId, scope.workspaceId) as any;

  if (!ret) return null;

  const context = await getReturnCanonicalContext(returnId, scope.tenantId, scope.workspaceId);
  const events = db
    .prepare('SELECT * FROM return_events WHERE return_id = ? ORDER BY time ASC')
    .all(returnId);

  const enriched = await enrichReturn(ret, scope.tenantId, scope.workspaceId);
  return {
    ...enriched,
    events: context?.case_state
      ? context.case_state.timeline.filter((entry: any) =>
          ['returns', 'payments', 'orders', 'fulfillment', 'approvals'].includes(entry.domain),
        )
      : events.map(parseRow),
    canonical_context: context,
  };
}

function updateReturnSqlite(scope: CommerceScope, returnId: string, updates: any): void {
  const db = getDb();
  const fields = Object.keys(updates);
  if (fields.length === 0) return;

  const setClause = fields.map((f) => `${f} = ?`).join(', ');
  const params = [...Object.values(updates), returnId, scope.tenantId, scope.workspaceId];
  
  db.prepare(`
    UPDATE returns 
    SET ${setClause}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ? AND workspace_id = ?
  `).run(...params);
}

async function getReturnContextSqlite(scope: CommerceScope, returnId: string): Promise<any | null> {
  return (await getReturnCanonicalContext(returnId, scope.tenantId, scope.workspaceId)) ?? null;
}

// ── Supabase implementations ─────────────────────────────────

async function listOrdersSupabase(scope: CommerceScope, filters: OrderFilters): Promise<any[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('orders')
    .select('*, customers!left(canonical_name, segment)')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('updated_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.risk_level) query = query.eq('risk_level', filters.risk_level);
  if (filters.q) {
    query = query.or(`external_order_id.ilike.%${filters.q}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []).map((row: any) => {
    const customer = row.customers;
    return {
      ...row,
      customers: undefined,
      customer_name: customer?.canonical_name ?? null,
      customer_segment: customer?.segment ?? null,
    };
  });

  return Promise.all(rows.map((row: any) => enrichOrder(row, scope.tenantId, scope.workspaceId)));
}

async function getOrderSupabase(scope: CommerceScope, orderId: string): Promise<any | null> {
  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase
    .from('orders')
    .select('*, customers!left(canonical_name, canonical_email)')
    .eq('id', orderId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();

  if (error) throw error;
  if (!order) return null;

  const customer = (order as any).customers;
  const flatOrder = {
    ...order,
    customers: undefined,
    customer_name: customer?.canonical_name ?? null,
    customer_email: customer?.canonical_email ?? null,
  };

  const context = await getOrderCanonicalContext(orderId, scope.tenantId, scope.workspaceId);

  const [eventsResult, casesResult] = await Promise.all([
    supabase
      .from('order_events')
      .select('*')
      .eq('order_id', orderId)
      .order('time', { ascending: true }),
    supabase
      .from('cases')
      .select('id, case_number, status, type')
      .filter('order_ids', 'cs', JSON.stringify([orderId]))
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId),
  ]);

  if (eventsResult.error) throw eventsResult.error;
  if (casesResult.error) throw casesResult.error;

  const enriched = await enrichOrder(flatOrder, scope.tenantId, scope.workspaceId);
  return {
    ...enriched,
    events: context?.case_state
      ? context.case_state.timeline.filter((entry: any) =>
          ['orders', 'fulfillment', 'returns', 'payments'].includes(entry.domain),
        )
      : eventsResult.data ?? [],
    related_cases: context?.case_state?.related.linked_cases?.length
      ? context.case_state.related.linked_cases
      : casesResult.data ?? [],
    canonical_context: context,
  };
}

async function updateOrderSupabase(scope: CommerceScope, orderId: string, updates: any): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('orders')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  
  if (error) throw error;
}

async function getOrderContextSupabase(scope: CommerceScope, orderId: string): Promise<any | null> {
  return (await getOrderCanonicalContext(orderId, scope.tenantId, scope.workspaceId)) ?? null;
}

async function listPaymentsSupabase(scope: CommerceScope, filters: PaymentFilters): Promise<any[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('payments')
    .select('*, customers!left(canonical_name)')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('updated_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.risk_level) query = query.eq('risk_level', filters.risk_level);
  if (filters.q) {
    query = query.or(`external_payment_id.ilike.%${filters.q}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []).map((row: any) => {
    const customer = row.customers;
    return {
      ...row,
      customers: undefined,
      customer_name: customer?.canonical_name ?? null,
    };
  });

  return Promise.all(rows.map((row: any) => enrichPayment(row, scope.tenantId, scope.workspaceId)));
}

async function getPaymentSupabase(scope: CommerceScope, paymentId: string): Promise<any | null> {
  const supabase = getSupabaseAdmin();
  const { data: payment, error } = await supabase
    .from('payments')
    .select('*, customers!left(canonical_name, canonical_email)')
    .eq('id', paymentId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();

  if (error) throw error;
  if (!payment) return null;

  const customer = (payment as any).customers;
  const flatPayment = {
    ...payment,
    customers: undefined,
    customer_name: customer?.canonical_name ?? null,
    customer_email: customer?.canonical_email ?? null,
  };

  const context = await getPaymentCanonicalContext(paymentId, scope.tenantId, scope.workspaceId);
  return {
    ...(await enrichPayment(flatPayment, scope.tenantId, scope.workspaceId)),
    canonical_context: context,
  };
}

async function updatePaymentSupabase(scope: CommerceScope, paymentId: string, updates: any): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('payments')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', paymentId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  
  if (error) throw error;
}

async function getPaymentContextSupabase(scope: CommerceScope, paymentId: string): Promise<any | null> {
  return (await getPaymentCanonicalContext(paymentId, scope.tenantId, scope.workspaceId)) ?? null;
}

async function listReturnsSupabase(scope: CommerceScope, filters: ReturnFilters): Promise<any[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('returns')
    .select('*, customers!left(canonical_name)')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('updated_at', { ascending: false });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.risk_level) query = query.eq('risk_level', filters.risk_level);
  if (filters.q) {
    query = query.or(`external_return_id.ilike.%${filters.q}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []).map((row: any) => {
    const customer = row.customers;
    return {
      ...row,
      customers: undefined,
      customer_name: customer?.canonical_name ?? null,
    };
  });

  return Promise.all(rows.map((row: any) => enrichReturn(row, scope.tenantId, scope.workspaceId)));
}

async function getReturnSupabase(scope: CommerceScope, returnId: string): Promise<any | null> {
  const supabase = getSupabaseAdmin();
  const { data: ret, error } = await supabase
    .from('returns')
    .select('*, customers!left(canonical_name)')
    .eq('id', returnId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();

  if (error) throw error;
  if (!ret) return null;

  const customer = (ret as any).customers;
  const flatReturn = {
    ...ret,
    customers: undefined,
    customer_name: customer?.canonical_name ?? null,
  };

  const context = await getReturnCanonicalContext(returnId, scope.tenantId, scope.workspaceId);

  const { data: events, error: eventsError } = await supabase
    .from('return_events')
    .select('*')
    .eq('return_id', returnId)
    .order('time', { ascending: true });

  if (eventsError) throw eventsError;

  const enriched = await enrichReturn(flatReturn, scope.tenantId, scope.workspaceId);
  return {
    ...enriched,
    events: context?.case_state
      ? context.case_state.timeline.filter((entry: any) =>
          ['returns', 'payments', 'orders', 'fulfillment', 'approvals'].includes(entry.domain),
        )
      : events ?? [],
    canonical_context: context,
  };
}

async function updateReturnSupabase(scope: CommerceScope, returnId: string, updates: any): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('returns')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', returnId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  
  if (error) throw error;
}

async function getReturnContextSupabase(scope: CommerceScope, returnId: string): Promise<any | null> {
  return (await getReturnCanonicalContext(returnId, scope.tenantId, scope.workspaceId)) ?? null;
}

// ── Repository interface & factory ───────────────────────────

export interface CommerceRepository {
  listOrders(scope: CommerceScope, filters: OrderFilters): Promise<any[]>;
  getOrder(scope: CommerceScope, orderId: string): Promise<any | null>;
  getOrderContext(scope: CommerceScope, orderId: string): Promise<any | null>;

  listPayments(scope: CommerceScope, filters: PaymentFilters): Promise<any[]>;
  getPayment(scope: CommerceScope, paymentId: string): Promise<any | null>;
  getPaymentContext(scope: CommerceScope, paymentId: string): Promise<any | null>;

  listReturns(scope: CommerceScope, filters: ReturnFilters): Promise<any[]>;
  getReturn(scope: CommerceScope, returnId: string): Promise<any | null>;
  getReturnContext(scope: CommerceScope, returnId: string): Promise<any | null>;

  getOrderByExternalId(scope: CommerceScope, externalId: string): Promise<any | null>;
  getPaymentByExternalId(scope: CommerceScope, externalId: string): Promise<any | null>;
  getReturnByExternalId(scope: CommerceScope, externalId: string): Promise<any | null>;

  updateOrder(scope: CommerceScope, orderId: string, updates: any): Promise<void>;
  updatePayment(scope: CommerceScope, paymentId: string, updates: any): Promise<void>;
  updateReturn(scope: CommerceScope, returnId: string, updates: any): Promise<void>;

  upsertOrder(scope: CommerceScope, order: any): Promise<string>;
  upsertPayment(scope: CommerceScope, payment: any): Promise<string>;
  upsertReturn(scope: CommerceScope, returnData: any): Promise<string>;

  flagEntityConflict(scope: CommerceScope, entityType: string, entityId: string, message: string): Promise<void>;
}

export function createCommerceRepository(): CommerceRepository {
  if (getDatabaseProvider() === 'supabase') {
    return {
      listOrders: listOrdersSupabase,
      getOrder: getOrderSupabase,
      getOrderContext: getOrderContextSupabase,

      listPayments: listPaymentsSupabase,
      getPayment: getPaymentSupabase,
      getPaymentContext: getPaymentContextSupabase,

      listReturns: listReturnsSupabase,
      getReturn: getReturnSupabase,
      getReturnContext: getReturnContextSupabase,

      getOrderByExternalId: async (scope, externalId) => {
        const supabase = getSupabaseAdmin();
        const { data } = await supabase.from('orders').select('*').eq('external_order_id', externalId).eq('tenant_id', scope.tenantId).maybeSingle();
        return data;
      },
      getPaymentByExternalId: async (scope, externalId) => {
        const supabase = getSupabaseAdmin();
        const { data } = await supabase.from('payments').select('*').eq('external_payment_id', externalId).eq('tenant_id', scope.tenantId).maybeSingle();
        return data;
      },
      getReturnByExternalId: async (scope, externalId) => {
        const supabase = getSupabaseAdmin();
        const { data } = await supabase.from('returns').select('*').eq('external_return_id', externalId).eq('tenant_id', scope.tenantId).maybeSingle();
        return data;
      },

      updateOrder: updateOrderSupabase,
      updatePayment: updatePaymentSupabase,
      updateReturn: updateReturnSupabase,

      upsertOrder: async (scope, order) => {
        const supabase = getSupabaseAdmin();
        const systemStates = { canonical: order.status, [order.source]: order.status };
        const { data: existing } = await supabase
          .from('orders')
          .select('id')
          .eq('external_order_id', order.externalId)
          .eq('tenant_id', scope.tenantId)
          .maybeSingle();

        if (existing) {
          await supabase.from('orders').update({
            status: order.status,
            fulfillment_status: order.fulfillmentStatus,
            shipping_address: order.shippingAddress || null,
            system_states: systemStates,
            total_amount: order.totalAmount,
            currency: order.currency,
            updated_at: new Date().toISOString()
          }).eq('id', (existing as any).id);
          return (existing as any).id;
        }

        const id = crypto.randomUUID();
        await supabase.from('orders').insert({
          id,
          external_order_id: order.externalId,
          tenant_id: scope.tenantId,
          workspace_id: scope.workspaceId,
          status: order.status,
          fulfillment_status: order.fulfillmentStatus,
          shipping_address: order.shippingAddress || null,
          system_states: systemStates,
          total_amount: order.totalAmount,
          currency: order.currency,
          order_date: order.createdAt,
          badges: order.tags,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        return id;
      },
      upsertPayment: async (scope, payment) => {
        const supabase = getSupabaseAdmin();
        const systemStates = { canonical: payment.status, [payment.source]: payment.status };
        const { data: existing } = await supabase
          .from('payments')
          .select('id')
          .eq('external_payment_id', payment.externalId)
          .eq('tenant_id', scope.tenantId)
          .maybeSingle();

        if (existing) {
          await supabase.from('payments').update({
            status: payment.status,
            system_states: systemStates,
            refund_amount: payment.amountRefunded,
            updated_at: new Date().toISOString()
          }).eq('id', (existing as any).id);
          return (existing as any).id;
        }

        const id = crypto.randomUUID();
        await supabase.from('payments').insert({
          id,
          external_payment_id: payment.externalId,
          tenant_id: scope.tenantId,
          workspace_id: scope.workspaceId,
          amount: payment.amount,
          currency: payment.currency,
          payment_method: payment.paymentMethod || 'card',
          psp: payment.source,
          status: payment.status,
          system_states: systemStates,
          refund_amount: payment.amountRefunded,
          dispute_id: payment.disputeId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        return id;
      },
      upsertReturn: async (scope, returnData) => {
        const supabase = getSupabaseAdmin();
        const systemStates = { canonical: returnData.status, [returnData.source]: returnData.status };
        const { data: existing } = await supabase
          .from('returns')
          .select('id')
          .eq('external_return_id', returnData.externalId)
          .eq('tenant_id', scope.tenantId)
          .maybeSingle();

        if (existing) {
          await supabase.from('returns').update({
            status: returnData.status,
            system_states: systemStates,
            updated_at: new Date().toISOString()
          }).eq('id', (existing as any).id);
          return (existing as any).id;
        }

        const id = crypto.randomUUID();
        await supabase.from('returns').insert({
          id,
          external_return_id: returnData.externalId,
          tenant_id: scope.tenantId,
          workspace_id: scope.workspaceId,
          status: returnData.status,
          system_states: systemStates,
          return_value: returnData.totalAmount,
          currency: returnData.currency,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        return id;
      },
      flagEntityConflict: async (scope, entityType, entityId, message) => {
        const supabase = getSupabaseAdmin();
        const table = entityType === 'order' ? 'orders' : entityType === 'payment' ? 'payments' : 'returns';
        await supabase.from(table).update({
          has_conflict: true,
          conflict_detected: message,
          updated_at: new Date().toISOString()
        }).eq('id', entityId).eq('tenant_id', scope.tenantId);
      }
    };
  }

  return {
    listOrders: async (scope, filters) => listOrdersSqlite(scope, filters),
    getOrder: async (scope, orderId) => getOrderSqlite(scope, orderId),
    getOrderContext: async (scope, orderId) => getOrderContextSqlite(scope, orderId),

    listPayments: async (scope, filters) => listPaymentsSqlite(scope, filters),
    getPayment: async (scope, paymentId) => getPaymentSqlite(scope, paymentId),
    getPaymentContext: async (scope, paymentId) => getPaymentContextSqlite(scope, paymentId),

    listReturns: async (scope, filters) => listReturnsSqlite(scope, filters),
    getReturn: async (scope, returnId) => getReturnSqlite(scope, returnId),
    getReturnContext: async (scope, returnId) => getReturnContextSqlite(scope, returnId),

    getOrderByExternalId: async (scope, externalId) => {
      const db = getDb();
      return parseRow(db.prepare('SELECT * FROM orders WHERE external_order_id = ? AND tenant_id = ?').get(externalId, scope.tenantId));
    },
    getPaymentByExternalId: async (scope, externalId) => {
      const db = getDb();
      return parseRow(db.prepare('SELECT * FROM payments WHERE external_payment_id = ? AND tenant_id = ?').get(externalId, scope.tenantId));
    },
    getReturnByExternalId: async (scope, externalId) => {
      const db = getDb();
      return parseRow(db.prepare('SELECT * FROM returns WHERE external_return_id = ? AND tenant_id = ?').get(externalId, scope.tenantId));
    },

    updateOrder: async (scope, orderId, updates) => updateOrderSqlite(scope, orderId, updates),
    updatePayment: async (scope, paymentId, updates) => updatePaymentSqlite(scope, paymentId, updates),
    updateReturn: async (scope, returnId, updates) => updateReturnSqlite(scope, returnId, updates),

    upsertOrder: async (scope, order) => {
      const db = getDb();
      const existing = db.prepare('SELECT id FROM orders WHERE external_order_id = ? AND tenant_id = ?').get(order.externalId, scope.tenantId) as any;
      const systemStates = JSON.stringify({ canonical: order.status, [order.source]: order.status });
      const badges = JSON.stringify(order.tags);

      if (existing) {
        db.prepare(`
          UPDATE orders SET
            status = ?, fulfillment_status = ?, shipping_address = ?,
            system_states = ?, total_amount = ?, currency = ?,
            last_sync_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(order.status, order.fulfillmentStatus, order.shippingAddress ? JSON.stringify(order.shippingAddress) : null, systemStates, order.totalAmount, order.currency, existing.id);
        return existing.id;
      }

      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO orders (id, external_order_id, tenant_id, workspace_id, status, fulfillment_status, shipping_address, system_states, total_amount, currency, order_date, badges, last_sync_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(id, order.externalId, scope.tenantId, scope.workspaceId, order.status, order.fulfillmentStatus, order.shippingAddress ? JSON.stringify(order.shippingAddress) : null, systemStates, order.totalAmount, order.currency, order.createdAt, badges);
      return id;
    },
    upsertPayment: async (scope, payment) => {
      const db = getDb();
      const existing = db.prepare('SELECT id FROM payments WHERE external_payment_id = ? AND tenant_id = ?').get(payment.externalId, scope.tenantId) as any;
      const systemStates = JSON.stringify({ canonical: payment.status, [payment.source]: payment.status });

      if (existing) {
        db.prepare('UPDATE payments SET status = ?, system_states = ?, refund_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(payment.status, systemStates, payment.amountRefunded, existing.id);
        return existing.id;
      }

      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO payments (id, external_payment_id, tenant_id, workspace_id, amount, currency, payment_method, psp, status, system_states, refund_amount, dispute_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(id, payment.externalId, scope.tenantId, scope.workspaceId, payment.amount, payment.currency, payment.paymentMethod || 'card', payment.source, payment.status, systemStates, payment.amountRefunded, payment.disputeId);
      return id;
    },
    upsertReturn: async (scope, returnData) => {
      const db = getDb();
      const existing = db.prepare('SELECT id FROM returns WHERE external_return_id = ? AND tenant_id = ?').get(returnData.externalId, scope.tenantId) as any;
      const systemStates = JSON.stringify({ canonical: returnData.status, [returnData.source]: returnData.status });

      if (existing) {
        db.prepare('UPDATE returns SET status = ?, system_states = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(returnData.status, systemStates, existing.id);
        return existing.id;
      }

      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO returns (id, external_return_id, tenant_id, workspace_id, status, system_states, return_value, currency, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(id, returnData.externalId, scope.tenantId, scope.workspaceId, returnData.status, systemStates, returnData.totalAmount, returnData.currency);
      return id;
    },
    flagEntityConflict: async (scope, entityType, entityId, message) => {
      const db = getDb();
      const table = entityType === 'order' ? 'orders' : entityType === 'payment' ? 'payments' : 'returns';
      db.prepare(`UPDATE ${table} SET has_conflict = 1, conflict_detected = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?`).run(message, entityId, scope.tenantId);
    }
  };
}
