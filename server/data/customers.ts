import { getDb } from '../db/client.js';
import { parseRow } from '../db/utils.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { canonicalHealth, compactStrings } from './shared.js';

function normalizeSqlValue(value: any): any {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'object' && !(value instanceof Date)) return JSON.stringify(value);
  return value;
}

export interface CustomerScope {
  tenantId: string;
  workspaceId: string;
}

export interface CustomerFilters {
  segment?: string;
  risk_level?: string;
  q?: string;
}

function buildCustomerState(detail: any) {
  const customer = detail.customer;
  const cases = detail.cases ?? [];
  const orders = detail.orders ?? [];
  const payments = detail.payments ?? [];
  const returns = detail.returns ?? [];
  const linkedIdentities = detail.linked_identities ?? [];

  const unresolvedConflicts = cases
    .filter((item: any) => item.has_reconciliation_conflicts || item.conflict_severity || item.ai_root_cause)
    .map((item: any) => ({
      case_id: item.id,
      case_number: item.case_number,
      conflict_type: item.ai_root_cause || item.intent || 'state_conflict',
      severity: item.conflict_severity || item.risk_level || 'warning',
      recommended_action: item.ai_recommended_action || null,
    }));

  return {
    snapshot_at: new Date().toISOString(),
    customer,
    linked_identities: linkedIdentities,
    metrics: {
      open_cases: cases.filter((item: any) => !['resolved', 'closed'].includes((item.status || '').toLowerCase())).length,
      total_cases: cases.length,
      active_conflicts: unresolvedConflicts.length,
      total_orders: orders.length,
      total_payments: payments.length,
      total_returns: returns.length,
      lifetime_value: Number(customer.lifetime_value || 0),
      total_spent: Number(customer.total_spent || 0),
    },
    systems: {
      orders: {
        key: 'orders',
        label: 'Orders',
        status: orders.length ? canonicalHealth(orders.some((item: any) => item.has_conflict) ? 'conflict' : orders[0]?.status) : 'pending',
        identifiers: compactStrings(orders.map((item: any) => item.external_order_id || item.id)),
        nodes: orders.slice(0, 5).map((item: any) => ({
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
        status: payments.length ? canonicalHealth(payments.some((item: any) => item.has_conflict) ? 'conflict' : payments[0]?.status) : 'pending',
        identifiers: compactStrings(payments.map((item: any) => item.external_payment_id || item.id)),
        nodes: payments.slice(0, 5).map((item: any) => ({
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
        status: returns.length ? canonicalHealth(returns.some((item: any) => item.has_conflict) ? 'conflict' : returns[0]?.status) : 'pending',
        identifiers: compactStrings(returns.map((item: any) => item.external_return_id || item.id)),
        nodes: returns.slice(0, 5).map((item: any) => ({
          id: item.id,
          label: item.external_return_id || item.id,
          status: canonicalHealth(item.has_conflict ? 'conflict' : item.status),
          source: 'returns',
          value: item.status,
          timestamp: item.created_at,
        })),
      },
    },
    recent_cases: cases.slice(0, 10).map((item: any) => ({
      id: item.id,
      case_number: item.case_number,
      type: item.type,
      status: item.status,
      risk_level: item.risk_level,
      updated_at: item.updated_at,
    })),
    unresolved_conflicts: unresolvedConflicts,
  };
}

function enrichCustomerRows(rows: any[], detailByCustomerId: Map<string, any>) {
  return rows.map((row: any) => {
    const detail = detailByCustomerId.get(row.id);
    const state = detail ? buildCustomerState({
      customer: detail,
      cases: detail.cases ?? [],
      orders: detail.orders ?? [],
      payments: detail.payments ?? [],
      returns: detail.returns ?? [],
      linked_identities: detail.linked_identities ?? [],
    }) : null;
    return {
      ...row,
      open_cases: state?.metrics.open_cases ?? 0,
      total_cases: state?.metrics.total_cases ?? 0,
      active_conflicts: state?.metrics.active_conflicts ?? 0,
      linked_identities: state?.linked_identities ?? [],
      canonical_systems: state?.systems ?? {},
    };
  });
}

async function getCustomerDetailSupabase(scope: CustomerScope, customerId: string) {
  const supabase = getSupabaseAdmin();
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();

  if (customerError) throw customerError;
  if (!customer) return null;

  const [
    casesResult,
    identitiesResult,
    ordersResult,
    paymentsResult,
    returnsResult,
  ] = await Promise.all([
    supabase.from('cases').select('id, case_number, type, status, priority, created_at, updated_at, risk_level, has_reconciliation_conflicts, conflict_severity, ai_root_cause, ai_recommended_action, intent').eq('customer_id', customerId).eq('tenant_id', scope.tenantId).order('created_at', { ascending: false }),
    supabase.from('linked_identities').select('*').eq('customer_id', customerId),
    supabase.from('orders').select('id, external_order_id, status, total_amount, currency, order_date, has_conflict, updated_at, created_at').eq('customer_id', customerId).eq('tenant_id', scope.tenantId).order('order_date', { ascending: false }),
    supabase.from('payments').select('id, external_payment_id, status, amount, currency, created_at, has_conflict').eq('customer_id', customerId).eq('tenant_id', scope.tenantId).order('created_at', { ascending: false }),
    supabase.from('returns').select('id, external_return_id, status, return_value, currency, created_at, has_conflict').eq('customer_id', customerId).eq('tenant_id', scope.tenantId).order('created_at', { ascending: false }),
  ]);

  for (const result of [casesResult, identitiesResult, ordersResult, paymentsResult, returnsResult]) {
    if (result.error) throw result.error;
  }

  const detail = {
    customer,
    cases: casesResult.data ?? [],
    linked_identities: identitiesResult.data ?? [],
    orders: ordersResult.data ?? [],
    payments: paymentsResult.data ?? [],
    returns: returnsResult.data ?? [],
  };

  return {
    ...detail.customer,
    cases: detail.cases,
    linked_identities: detail.linked_identities,
    orders: detail.orders,
    payments: detail.payments,
    returns: detail.returns,
    state_snapshot: buildCustomerState(detail),
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

  if (filters.segment) query = query.eq('segment', filters.segment);
  if (filters.risk_level) query = query.eq('risk_level', filters.risk_level);
  if (filters.q) {
    query = query.or(`canonical_name.ilike.%${filters.q}%,canonical_email.ilike.%${filters.q}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []).map((row) => ({ ...row }));
  const detailEntries = await Promise.all(
    rows.map(async (row): Promise<[string, any]> => [row.id, await getCustomerDetailSupabase(scope, row.id)]),
  );
  return enrichCustomerRows(rows, new Map<string, any>(detailEntries));
}

async function getCustomerStateSupabase(scope: CustomerScope, customerId: string) {
  const detail = await getCustomerDetailSupabase(scope, customerId);
  return detail?.state_snapshot ?? null;
}

function getCustomerDetailSqlite(scope: CustomerScope, customerId: string) {
  const db = getDb();
  const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND tenant_id = ? AND workspace_id = ?').get(customerId, scope.tenantId, scope.workspaceId) as any;
  if (!customer) return null;

  const cases = db.prepare(`
    SELECT id, case_number, type, status, priority, created_at, updated_at, risk_level, has_reconciliation_conflicts, conflict_severity, ai_root_cause, ai_recommended_action, intent
    FROM cases WHERE customer_id = ? AND tenant_id = ?
    ORDER BY created_at DESC
  `).all(customerId, scope.tenantId).map(parseRow);

  const identities = db.prepare('SELECT * FROM linked_identities WHERE customer_id = ?').all(customerId).map(parseRow);
  const orders = db.prepare(`
    SELECT id, external_order_id, status, total_amount, currency, order_date, has_conflict, updated_at, created_at
    FROM orders WHERE customer_id = ? AND tenant_id = ?
    ORDER BY order_date DESC
  `).all(customerId, scope.tenantId).map(parseRow);
  const payments = db.prepare(`
    SELECT id, external_payment_id, status, amount, currency, created_at, has_conflict
    FROM payments WHERE customer_id = ? AND tenant_id = ?
    ORDER BY created_at DESC
  `).all(customerId, scope.tenantId).map(parseRow);
  const returns = db.prepare(`
    SELECT id, external_return_id, status, return_value, currency, created_at, has_conflict
    FROM returns WHERE customer_id = ? AND tenant_id = ?
    ORDER BY created_at DESC
  `).all(customerId, scope.tenantId).map(parseRow);

  const detail = {
    customer: parseRow(customer),
    cases,
    linked_identities: identities,
    orders,
    payments,
    returns,
  };

  return {
    ...detail.customer,
    cases,
    linked_identities: identities,
    orders,
    payments,
    returns,
    state_snapshot: buildCustomerState(detail),
  };
}

function listCustomersSqlite(scope: CustomerScope, filters: CustomerFilters) {
  const db = getDb();
  let query = 'SELECT * FROM customers WHERE tenant_id = ? AND workspace_id = ?';
  const params: any[] = [scope.tenantId, scope.workspaceId];

  if (filters.segment) { query += ' AND segment = ?'; params.push(filters.segment); }
  if (filters.risk_level) { query += ' AND risk_level = ?'; params.push(filters.risk_level); }
  if (filters.q) {
    query += ' AND (canonical_name LIKE ? OR canonical_email LIKE ?)';
    const term = `%${filters.q}%`;
    params.push(term, term);
  }

  query += ' ORDER BY lifetime_value DESC';

  const rows = db.prepare(query).all(...params).map((row: any) => parseRow(row));
  const detailEntries: Array<[string, any]> = rows.map((row: any) => [row.id, getCustomerDetailSqlite(scope, row.id)]);
  const detailByCustomerId = new Map<string, any>(detailEntries);
  return enrichCustomerRows(rows, detailByCustomerId);
}

function getCustomerStateSqlite(scope: CustomerScope, customerId: string) {
  const detail = getCustomerDetailSqlite(scope, customerId);
  return detail?.state_snapshot ?? null;
}

export interface CustomerRepository {
  list(scope: CustomerScope, filters: CustomerFilters): Promise<any[]>;
  get(scope: CustomerScope, id: string): Promise<any | null>;
  getDetail(scope: CustomerScope, id: string): Promise<any | null>;
  getState(scope: CustomerScope, id: string): Promise<any | null>;
  upsertCustomer(scope: CustomerScope, customer: any): Promise<string>;
  getIdentity(scope: CustomerScope, system: string, externalId: string): Promise<any | null>;
  createStub(scope: CustomerScope, data: any): Promise<string>;
  update(scope: CustomerScope, id: string, updates: any): Promise<void>;
}

export function createCustomerRepository(): CustomerRepository {
  if (getDatabaseProvider() === 'supabase') {
    return {
      list: listCustomersSupabase,
      getDetail: getCustomerDetailSupabase,
      get: async (scope, id) => {
        const supabase = getSupabaseAdmin();
        const { data } = await supabase.from('customers').select('*').eq('id', id).eq('tenant_id', scope.tenantId).maybeSingle();
        return data;
      },
      getState: getCustomerStateSupabase,
      getIdentity: async (scope, system, externalId) => {
        const supabase = getSupabaseAdmin();
        const { data } = await supabase.from('linked_identities').select('*').eq('system', system).eq('external_id', externalId).maybeSingle();
        return data;
      },
      createStub: async (scope, data) => {
        const supabase = getSupabaseAdmin();
        const id = data.id || crypto.randomUUID();
        const now = new Date().toISOString();
        await supabase.from('customers').insert({
          id,
          tenant_id: scope.tenantId,
          workspace_id: scope.workspaceId,
          canonical_name: data.canonicalName,
          canonical_email: data.canonicalEmail,
          email: data.email,
          phone: data.phone,
          segment: data.segment || 'standard',
          risk_level: data.riskLevel || 'low',
          lifetime_value: 0,
          total_orders: 0,
          created_at: now,
          updated_at: now
        });
        
        await supabase.from('linked_identities').insert({
          id: crypto.randomUUID(),
          customer_id: id,
          tenant_id: scope.tenantId,
          workspace_id: scope.workspaceId,
          system: data.identitySystem,
          external_id: data.identityExternalId,
          created_at: now
        });
        return id;
      },
      update: async (scope, id, updates) => {
        const supabase = getSupabaseAdmin();
        const { error } = await supabase.from('customers').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) throw error;
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
            canonical_name: customer.displayName,
            canonical_email: customer.email,
            updated_at: new Date().toISOString()
          }).eq('id', (linked as any).customer_id);
          return (linked as any).customer_id;
        }

        const id = crypto.randomUUID();
        await supabase.from('customers').insert({
          id,
          tenant_id: scope.tenantId,
          workspace_id: scope.workspaceId,
          canonical_email: customer.email,
          canonical_name: customer.displayName,
          segment: 'regular',
          risk_level: 'low',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

        await supabase.from('linked_identities').insert({
          id: crypto.randomUUID(),
          customer_id: id,
          system: customer.source,
          external_id: customer.externalId,
          confidence: 1.0,
          verified: true
        });

        return id;
      }
    };
  }

  return {
    list: async (scope, filters) => listCustomersSqlite(scope, filters),
    getDetail: async (scope, customerId) => getCustomerDetailSqlite(scope, customerId),
    get: async (scope, id) => {
      const db = getDb();
      return parseRow(db.prepare('SELECT * FROM customers WHERE id = ? AND tenant_id = ?').get(id, scope.tenantId));
    },
    getState: async (scope, customerId) => getCustomerStateSqlite(scope, customerId),
    getIdentity: async (scope, system, externalId) => {
      const db = getDb();
      return parseRow(db.prepare('SELECT * FROM linked_identities WHERE system = ? AND external_id = ?').get(system, externalId));
    },
    createStub: async (scope, data) => {
      const db = getDb();
      const id = data.id || crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO customers (
          id, canonical_name, canonical_email, email, phone,
          segment, risk_level, lifetime_value, total_orders,
          workspace_id, tenant_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)
      `).run(
        id, data.canonicalName, data.canonicalEmail, data.email, data.phone,
        data.segment || 'standard', data.riskLevel || 'low',
        scope.workspaceId, scope.tenantId, now, now
      );
      
      db.prepare(`
        INSERT INTO linked_identities (id, customer_id, tenant_id, workspace_id, system, external_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), id, scope.tenantId, scope.workspaceId, data.identitySystem, data.identityExternalId, now);
      return id;
    },
    update: async (scope, id, updates) => {
      const db = getDb();
      const fields = Object.keys(updates);
      const setClause = fields.map(f => `${f} = ?`).join(', ');
      db.prepare(`UPDATE customers SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...Object.values(updates).map(normalizeSqlValue), id);
    },
    upsertCustomer: async (scope, customer) => {
      const db = getDb();
      const linked = db.prepare('SELECT customer_id FROM linked_identities WHERE system = ? AND external_id = ?').get(customer.source, customer.externalId) as any;

      if (linked) {
        db.prepare(`
          UPDATE customers SET
            canonical_name = COALESCE(?, canonical_name),
            canonical_email = COALESCE(?, canonical_email),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(customer.displayName, customer.email, linked.customer_id);
        return linked.customer_id;
      }

      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO customers (id, tenant_id, workspace_id, canonical_email, canonical_name, segment, risk_level, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'regular', 'low', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(id, scope.tenantId, scope.workspaceId, customer.email, customer.displayName);

      db.prepare(`
        INSERT OR IGNORE INTO linked_identities (id, customer_id, system, external_id, confidence, verified)
        VALUES (?, ?, ?, ?, 1.0, 1)
      `).run(crypto.randomUUID(), id, customer.source, customer.externalId);

      return id;
    }
  };
}
