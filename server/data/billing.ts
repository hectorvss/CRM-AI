import { getDb } from '../db/client.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { parseRow } from '../db/utils.js';

export interface BillingScope {
  tenantId: string;
}

export interface BillingRepository {
  getSubscription(scope: BillingScope, orgId: string): Promise<any>;
  getLedger(scope: BillingScope, orgId: string): Promise<any[]>;
  addLedgerEntry(scope: BillingScope, entry: any): Promise<void>;
}

async function getSubscriptionSupabase(scope: BillingScope, orgId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('billing_subscriptions')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw error;
  return data || { status: 'none' };
}

function getSubscriptionSqlite(scope: BillingScope, orgId: string) {
  const db = getDb();
  const sub = db.prepare('SELECT * FROM billing_subscriptions WHERE org_id = ?').get(orgId);
  return sub || { status: 'none' };
}

async function getLedgerSupabase(scope: BillingScope, orgId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('credit_ledger')
    .select('*')
    .eq('org_id', orgId)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

function getLedgerSqlite(scope: BillingScope, orgId: string) {
  const db = getDb();
  const ledger = db.prepare('SELECT * FROM credit_ledger WHERE org_id = ? ORDER BY occurred_at DESC').all(orgId);
  return ledger.map(parseRow);
}

async function addLedgerEntrySupabase(scope: BillingScope, entry: any) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('credit_ledger').insert({
    id: entry.id ?? crypto.randomUUID(),
    ...entry,
    org_id: entry.org_id ?? scope.tenantId,
    occurred_at: entry.occurred_at ?? new Date().toISOString(),
  });
  if (error) throw error;
}

function addLedgerEntrySqlite(scope: BillingScope, entry: any) {
  const db = getDb();
  const payload = {
    id: entry.id ?? crypto.randomUUID(),
    ...entry,
    org_id: entry.org_id ?? scope.tenantId,
    occurred_at: entry.occurred_at ?? new Date().toISOString(),
  };
  const fields = Object.keys(payload);
  const values = Object.values(payload).map((value) => value && typeof value === 'object' ? JSON.stringify(value) : value);
  db.prepare(`INSERT INTO credit_ledger (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`).run(...values);
}

export function createBillingRepository(): BillingRepository {
  if (getDatabaseProvider() === 'supabase') {
    return {
      getSubscription: getSubscriptionSupabase,
      getLedger: getLedgerSupabase,
      addLedgerEntry: addLedgerEntrySupabase,
    };
  }

  return {
    getSubscription: async (scope, orgId) => getSubscriptionSqlite(scope, orgId),
    getLedger: async (scope, orgId) => getLedgerSqlite(scope, orgId),
    addLedgerEntry: async (scope, entry) => addLedgerEntrySqlite(scope, entry),
  };
}
