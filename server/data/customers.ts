import { getDb } from '../db/client.js';
import { parseRow } from '../db/utils.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { canonicalHealth, compactStrings } from './shared.js';

export interface CustomerScope {
  tenantId: string;
  workspaceId: string;
}

export interface CustomerFilters {
  segment?: string;
  risk_level?: string;
  q?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildCustomerState(detail: any = {}) {
  const customer   = detail.customer ?? detail ?? {};
  const cases      = Array.isArray(detail.cases)             ? detail.cases             : [];
  const orders     = Array.isArray(detail.orders)            ? detail.orders            : [];
  const payments   = Array.isArray(detail.payments)          ? detail.payments          : [];
  const returns_   = Array.isArray(detail.returns)           ? detail.returns           : [];
  const linkedIds  = Array.isArray(detail.linked_identities) ? detail.linked_identities : [];
  const activity   = Array.isArray(detail.activity)          ? detail.activity          : [];

  const lifetimeValue = Number(customer?.lifetime_value ?? customer?.total_spent ?? 0);
  const totalSpent    = Number(customer?.total_spent    ?? customer?.lifetime_value ?? 0);

  const unresolvedConflicts = cases
    .filter((c: any) => c.has_reconciliation_conflicts || c.conflict_severity || c.ai_root_cause)
    .map((c: any) => ({
      case_id:             c.id,
      case_number:         c.case_number,
      conflict_type:       c.ai_root_cause || c.intent || 'state_conflict',
      severity:            c.conflict_severity || c.risk_level || 'warning',
      recommended_action:  c.ai_recommended_action ?? null,
    }));

  return {
    snapshot_at: new Date().toISOString(),
    customer,
    linked_identities: linkedIds,
    activity,
    metrics: {
      open_cases:       cases.filter((c: any) => !['resolved', 'closed'].includes((c.status || '').toLowerCase())).length,
      total_cases:      cases.length,
      active_conflicts: unresolvedConflicts.length,
      total_orders:     orders.length,
      total_payments:   payments.length,
      total_returns:    returns_.length,
      lifetime_value:   Number.isFinite(lifetimeValue) ? lifetimeValue : 0,
      total_spent:      Number.isFinite(totalSpent) ? totalSpent : 0,
    },
    systems: {
      orders: {
        key:         'orders',
        label:       'Orders',
        status:      orders.length
          ? canonicalHealth(orders.some((o: any) => o.has_conflict) ? 'conflict' : orders[0]?.status)
          : 'pending',
        identifiers: compactStrings(orders.map((o: any) => o.external_order_id || o.id)),
        nodes:       orders.slice(0, 5).map((o: any) => ({
          id:        o.id,
          label:     o.external_order_id || o.id,
          status:    canonicalHealth(o.has_conflict ? 'conflict' : o.status),
          source:    'orders',
          value:     o.status,
          timestamp: o.order_date || o.updated_at || o.created_at,
          total:     o.total_amount,
          tracking:  o.tracking_number ?? null,
          tracking_url: o.tracking_url ?? null,
          fulfillment_status: o.fulfillment_status ?? null,
          shipping_address:   o.shipping_address ?? null,
          line_items: Array.isArray(o.line_items) ? o.line_items : [],
        })),
      },
      payments: {
        key:         'payments',
        label:       'Payments',
        status:      payments.length
          ? canonicalHealth(payments.some((p: any) => p.has_conflict) ? 'conflict' : payments[0]?.status)
          : 'pending',
        identifiers: compactStrings(payments.map((p: any) => p.external_payment_id || p.id)),
        nodes:       payments.slice(0, 5).map((p: any) => ({
          id:        p.id,
          label:     p.external_payment_id || p.id,
          status:    canonicalHealth(p.has_conflict ? 'conflict' : p.status),
          source:    'payments',
          value:     p.status,
          timestamp: p.created_at,
          amount:    p.amount,
          currency:  p.currency,
        })),
      },
      returns: {
        key:         'returns',
        label:       'Returns',
        status:      returns_.length
          ? canonicalHealth(returns_.some((r: any) => r.has_conflict) ? 'conflict' : returns_[0]?.status)
          : 'pending',
        identifiers: compactStrings(returns_.map((r: any) => r.external_return_id || r.id)),
        nodes:       returns_.slice(0, 5).map((r: any) => ({
          id:        r.id,
          label:     r.external_return_id || r.id,
          status:    canonicalHealth(r.has_conflict ? 'conflict' : r.status),
          source:    'returns',
          value:     r.status,
          timestamp: r.created_at,
        })),
      },
    },
    recent_cases:        cases.slice(0, 10).map((c: any) => ({
      id:         c.id,
      case_number: c.case_number,
      type:       c.type,
      status:     c.status,
      risk_level: c.risk_level,
      updated_at: c.updated_at,
    })),
    unresolved_conflicts: unresolvedConflicts,
  };
}

function enrichCustomerRows(rows: any[], detailByCustomerId: Map<string, any>) {
  return rows.map((row: any) => {
    const detail = detailByCustomerId.get(row.id);
    const state  = detail ? buildCustomerState(detail) : null;
    return {
      ...row,
      open_cases:        state?.metrics.open_cases         ?? 0,
      total_cases:       state?.metrics.total_cases        ?? 0,
      active_conflicts:  state?.metrics.active_conflicts   ?? 0,
      linked_identities: state?.linked_identities          ?? [],
      canonical_systems: state?.systems                    ?? {},
    };
  });
}

// ── Supabase implementation ───────────────────────────────────────────────────

async function getCustomerDetailSupabase(scope: CustomerScope, customerId: string) {
  const supabase = getSupabaseAdmin();

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle();

  if (customerError) throw customerError;
  if (!customer) return null;

  const [
    casesResult,
    identitiesResult,
    ordersResult,
    paymentsResult,
    returnsResult,
    activityResult,
  ] = await Promise.all([
    supabase
      .from('cases')
      .select('id, case_number, type, status, priority, created_at, updated_at, risk_level, has_reconciliation_conflicts, conflict_severity, ai_root_cause, ai_recommended_action, intent')
      .eq('customer_id', customerId)
      .eq('tenant_id', scope.tenantId)
      .order('created_at', { ascending: false }),

    supabase
      .from('linked_identities')
      .select('*')
      .eq('customer_id', customerId),

    // Orders with their line_items joined via foreign key
    supabase
      .from('orders')
      .select('id, external_order_id, status, total_amount, currency, order_date, has_conflict, updated_at, created_at, tracking_number, tracking_url, fulfillment_status, shipping_address, line_items:order_line_items(id, sku, name, price, quantity, currency, icon, image_url, external_item_id)')
      .eq('customer_id', customerId)
      .eq('tenant_id', scope.tenantId)
      .order('order_date', { ascending: false }),

    supabase
      .from('payments')
      .select('id, external_payment_id, status, amount, currency, created_at, has_conflict, payment_method, psp')
      .eq('customer_id', customerId)
      .eq('tenant_id', scope.tenantId)
      .order('created_at', { ascending: false }),

    supabase
      .from('returns')
      .select('id, external_return_id, status, return_value, currency, created_at, has_conflict, return_reason, method')
      .eq('customer_id', customerId)
      .eq('tenant_id', scope.tenantId)
      .order('created_at', { ascending: false }),

    supabase
      .from('customer_activity')
      .select('id, type, system, level, title, content, metadata, source, occurred_at')
      .eq('customer_id', customerId)
      .eq('tenant_id', scope.tenantId)
      .order('occurred_at', { ascending: false })
      .limit(50),
  ]);

  for (const result of [casesResult, identitiesResult, ordersResult, paymentsResult, returnsResult, activityResult]) {
    if (result.error) throw result.error;
  }

  const detail = {
    customer,
    cases:             casesResult.data      ?? [],
    linked_identities: identitiesResult.data ?? [],
    orders:            ordersResult.data      ?? [],
    payments:          paymentsResult.data    ?? [],
    returns:           returnsResult.data     ?? [],
    activity:          activityResult.data    ?? [],
  };

  return {
    ...detail.customer,
    cases:             detail.cases,
    linked_identities: detail.linked_identities,
    orders:            detail.orders,
    payments:          detail.payments,
    returns:           detail.returns,
    activity:          detail.activity,
    state_snapshot:    buildCustomerState(detail),
  };
}

async function listCustomersSupabase(scope: CustomerScope, filters: CustomerFilters) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('customers')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('lifetime_value', { ascending: false, nullsFirst: false });

  if (filters.segment)    query = query.eq('segment', filters.segment);
  if (filters.risk_level) query = query.eq('risk_level', filters.risk_level);
  if (filters.q) {
    query = query.or(`canonical_name.ilike.%${filters.q}%,canonical_email.ilike.%${filters.q}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []).map((row: any) => ({ ...row }));
  const detailEntries = await Promise.all(
    rows.map(async (row: any): Promise<[string, any]> => [
      row.id,
      await getCustomerDetailSupabase(scope, row.id),
    ]),
  );
  return enrichCustomerRows(rows, new Map<string, any>(detailEntries));
}

async function getCustomerStateSupabase(scope: CustomerScope, customerId: string) {
  const detail = await getCustomerDetailSupabase(scope, customerId);
  return detail?.state_snapshot ?? null;
}

async function getCustomerActivitySupabase(scope: CustomerScope, customerId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('customer_activity')
    .select('*')
    .eq('customer_id', customerId)
    .eq('tenant_id', scope.tenantId)
    .order('occurred_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

// ── SQLite implementation ─────────────────────────────────────────────────────

function getCustomerDetailSqlite(scope: CustomerScope, customerId: string) {
  const db = getDb();
  const customer = db.prepare(
    'SELECT * FROM customers WHERE id = ? AND tenant_id = ? AND workspace_id = ?'
  ).get(customerId, scope.tenantId, scope.workspaceId) as any;
  if (!customer) return null;

  const cases = db.prepare(`
    SELECT id, case_number, type, status, priority, created_at, updated_at, risk_level,
           has_reconciliation_conflicts, conflict_severity, ai_root_cause, ai_recommended_action, intent
    FROM cases WHERE customer_id = ? AND tenant_id = ?
    ORDER BY created_at DESC
  `).all(customerId, scope.tenantId).map(parseRow);

  const identities = db.prepare(
    'SELECT * FROM linked_identities WHERE customer_id = ?'
  ).all(customerId).map(parseRow);

  const orders = db.prepare(`
    SELECT o.id, o.external_order_id, o.status, o.total_amount, o.currency, o.order_date,
           o.has_conflict, o.updated_at, o.created_at, o.tracking_number, o.tracking_url,
           o.fulfillment_status, o.shipping_address
    FROM orders o WHERE o.customer_id = ? AND o.tenant_id = ?
    ORDER BY o.order_date DESC
  `).all(customerId, scope.tenantId).map((row: any) => {
    const parsed = parseRow(row);
    // Attach line items
    const lineItems = db.prepare(
      'SELECT id, sku, name, price, quantity, currency, icon, image_url FROM order_line_items WHERE order_id = ?'
    ).all(parsed.id).map(parseRow);
    return { ...parsed, line_items: lineItems };
  });

  const payments = db.prepare(`
    SELECT id, external_payment_id, status, amount, currency, created_at, has_conflict, payment_method, psp
    FROM payments WHERE customer_id = ? AND tenant_id = ?
    ORDER BY created_at DESC
  `).all(customerId, scope.tenantId).map(parseRow);

  const returns_ = db.prepare(`
    SELECT id, external_return_id, status, return_value, currency, created_at, has_conflict, return_reason, method
    FROM returns WHERE customer_id = ? AND tenant_id = ?
    ORDER BY created_at DESC
  `).all(customerId, scope.tenantId).map(parseRow);

  const activity = db.prepare(`
    SELECT id, type, system, level, title, content, metadata, source, occurred_at
    FROM customer_activity WHERE customer_id = ? AND tenant_id = ?
    ORDER BY occurred_at DESC LIMIT 50
  `).all(customerId, scope.tenantId).map(parseRow);

  const detail = {
    customer: parseRow(customer),
    cases,
    linked_identities: identities,
    orders,
    payments,
    returns: returns_,
    activity,
  };

  return {
    ...detail.customer,
    cases,
    linked_identities: identities,
    orders,
    payments,
    returns: returns_,
    activity,
    state_snapshot: buildCustomerState(detail),
  };
}

function listCustomersSqlite(scope: CustomerScope, filters: CustomerFilters) {
  const db = getDb();
  let query = 'SELECT * FROM customers WHERE tenant_id = ? AND workspace_id = ?';
  const params: any[] = [scope.tenantId, scope.workspaceId];

  if (filters.segment)    { query += ' AND segment = ?';    params.push(filters.segment); }
  if (filters.risk_level) { query += ' AND risk_level = ?'; params.push(filters.risk_level); }
  if (filters.q) {
    query += ' AND (canonical_name LIKE ? OR canonical_email LIKE ?)';
    const term = `%${filters.q}%`;
    params.push(term, term);
  }
  query += ' ORDER BY lifetime_value DESC';

  const rows = db.prepare(query).all(...params).map((row: any) => parseRow(row));
  const detailEntries: Array<[string, any]> = rows.map((row: any) => [
    row.id,
    getCustomerDetailSqlite(scope, row.id),
  ]);
  return enrichCustomerRows(rows, new Map<string, any>(detailEntries));
}

function getCustomerStateSqlite(scope: CustomerScope, customerId: string) {
  const detail = getCustomerDetailSqlite(scope, customerId);
  return detail?.state_snapshot ?? null;
}

function getCustomerActivitySqlite(scope: CustomerScope, customerId: string) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM customer_activity WHERE customer_id = ? AND tenant_id = ?
    ORDER BY occurred_at DESC LIMIT 100
  `).all(customerId, scope.tenantId).map(parseRow);
  return rows;
}

// ── Repository interface + factory ───────────────────────────────────────────

export interface CustomerRepository {
  list(scope: CustomerScope, filters: CustomerFilters): Promise<any[]>;
  get(scope: CustomerScope, customerId: string): Promise<any | null>;
  getDetail(scope: CustomerScope, customerId: string): Promise<any | null>;
  getState(scope: CustomerScope, customerId: string): Promise<any | null>;
  getActivity(scope: CustomerScope, customerId: string): Promise<any[]>;
  getIdentity(scope: CustomerScope, system: string, externalId: string): Promise<any | null>;
  createStub(scope: CustomerScope, input: any): Promise<string>;
  upsertCustomer(scope: CustomerScope, customer: any): Promise<string>;
}

export function createCustomerRepository(): CustomerRepository {
  if (getDatabaseProvider() === 'supabase') {
    return {
      list:         listCustomersSupabase,
      get:          getCustomerDetailSupabase,
      getDetail:    getCustomerDetailSupabase,
      getState:     getCustomerStateSupabase,
      getActivity:  getCustomerActivitySupabase,
      getIdentity: async (scope, system, externalId) => {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from('linked_identities')
          .select('*')
          .eq('system', system)
          .eq('external_id', externalId)
          .maybeSingle();
        if (error) throw error;
        return data;
      },
      createStub: async (scope, input) => {
        const supabase = getSupabaseAdmin();
        const id = input.id ?? crypto.randomUUID();
        const now = new Date().toISOString();
        const { error: customerError } = await supabase.from('customers').insert({
          id,
          tenant_id: scope.tenantId,
          workspace_id: scope.workspaceId,
          canonical_name: input.canonicalName ?? input.canonical_name ?? 'Unknown Customer',
          canonical_email: input.canonicalEmail ?? input.canonical_email ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          segment: 'regular',
          risk_level: 'low',
          created_at: now,
          updated_at: now,
        });
        if (customerError) throw customerError;
        const { error: identityError } = await supabase.from('linked_identities').insert({
          id: crypto.randomUUID(),
          customer_id: id,
          tenant_id: scope.tenantId,
          workspace_id: scope.workspaceId,
          system: input.identitySystem,
          external_id: input.identityExternalId,
          confidence: 1,
          verified: true,
          verified_at: now,
          created_at: now,
        });
        if (identityError) throw identityError;
        return id;
      },

      upsertCustomer: async (scope, customer) => {
        const supabase = getSupabaseAdmin();
        const { data: linked } = await supabase
          .from('linked_identities')
          .select('customer_id')
          .eq('system', customer.source)
          .eq('external_id', customer.externalId)
          .maybeSingle();

        if (linked) {
          await supabase.from('customers').update({
            canonical_name:  customer.displayName,
            canonical_email: customer.email,
            updated_at:      new Date().toISOString(),
          }).eq('id', (linked as any).customer_id);
          return (linked as any).customer_id;
        }

        const id = crypto.randomUUID();
        await supabase.from('customers').insert({
          id,
          tenant_id:       scope.tenantId,
          workspace_id:    scope.workspaceId,
          canonical_email: customer.email,
          canonical_name:  customer.displayName,
          segment:         'regular',
          risk_level:      'low',
          fraud_risk:      'low',
          created_at:      new Date().toISOString(),
          updated_at:      new Date().toISOString(),
        });

        await supabase.from('linked_identities').insert({
          id:          crypto.randomUUID(),
          customer_id: id,
          system:      customer.source,
          external_id: customer.externalId,
          confidence:  1.0,
          verified:    true,
        });

        return id;
      },
    };
  }

  return {
    list:        async (scope, filters)    => listCustomersSqlite(scope, filters),
    get:         async (scope, customerId) => getCustomerDetailSqlite(scope, customerId),
    getDetail:   async (scope, customerId) => getCustomerDetailSqlite(scope, customerId),
    getState:    async (scope, customerId) => getCustomerStateSqlite(scope, customerId),
    getActivity: async (scope, customerId) => getCustomerActivitySqlite(scope, customerId),
    getIdentity: async (scope, system, externalId) => {
      const db = getDb();
      return parseRow(db.prepare('SELECT * FROM linked_identities WHERE system = ? AND external_id = ?').get(system, externalId));
    },
    createStub: async (scope, input) => {
      const db = getDb();
      const id = input.id ?? crypto.randomUUID();
      db.prepare(`
        INSERT INTO customers (id, tenant_id, workspace_id, canonical_name, canonical_email, email, phone, segment, risk_level, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'regular', 'low', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(id, scope.tenantId, scope.workspaceId, input.canonicalName ?? 'Unknown Customer', input.canonicalEmail ?? null, input.email ?? null, input.phone ?? null);
      db.prepare(`
        INSERT INTO linked_identities (id, customer_id, tenant_id, workspace_id, system, external_id, confidence, verified, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, 1, CURRENT_TIMESTAMP)
      `).run(crypto.randomUUID(), id, scope.tenantId, scope.workspaceId, input.identitySystem, input.identityExternalId);
      return id;
    },

    upsertCustomer: async (scope, customer) => {
      const db = getDb();
      const linked = db.prepare(
        'SELECT customer_id FROM linked_identities WHERE system = ? AND external_id = ?'
      ).get(customer.source, customer.externalId) as any;

      if (linked) {
        db.prepare(`
          UPDATE customers SET
            canonical_name  = COALESCE(?, canonical_name),
            canonical_email = COALESCE(?, canonical_email),
            updated_at      = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(customer.displayName, customer.email, linked.customer_id);
        return linked.customer_id;
      }

      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO customers (id, tenant_id, workspace_id, canonical_email, canonical_name, segment, risk_level, fraud_risk, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'regular', 'low', 'low', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(id, scope.tenantId, scope.workspaceId, customer.email, customer.displayName);

      db.prepare(`
        INSERT OR IGNORE INTO linked_identities (id, customer_id, system, external_id, confidence, verified)
        VALUES (?, ?, ?, ?, 1.0, 1)
      `).run(crypto.randomUUID(), id, customer.source, customer.externalId);

      return id;
    },
  };
}
