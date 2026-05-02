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
  update(scope: CustomerScope, customerId: string, updates: Record<string, any>): Promise<void>;
}

export function createCustomerRepository(): CustomerRepository {
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

    update: async (scope, customerId, updates) => {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase
        .from('customers')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', customerId)
        .eq('tenant_id', scope.tenantId);
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
