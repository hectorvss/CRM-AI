import { getDb } from '../db/client.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { parseRow } from '../db/utils.js';
import { randomUUID } from 'crypto';

export interface BillingScope {
  tenantId: string;
}

export interface BillingRepository {
  getSubscription(scope: BillingScope, orgId: string): Promise<any>;
  getLedger(scope: BillingScope, orgId: string): Promise<any[]>;
  addLedgerEntry(scope: BillingScope, entry: any): Promise<any>;
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

export function createBillingRepository(): BillingRepository {
  if (getDatabaseProvider() === 'supabase') {
    return {
      getSubscription: getSubscriptionSupabase,
      getLedger: getLedgerSupabase,
      addLedgerEntry: async (scope, entry) => {
        const supabase = getSupabaseAdmin();
        const payload = {
          id: entry.id || randomUUID(),
          tenant_id: scope.tenantId,
          org_id: entry.org_id || scope.tenantId,
          entry_type: entry.entry_type || 'debit',
          amount: entry.amount,
          reason: entry.reason || 'Usage',
          reference_id: entry.reference_id || null,
          balance_after: entry.balance_after ?? 0,
          occurred_at: entry.occurred_at || new Date().toISOString(),
        };
        const { error } = await supabase.from('credit_ledger').insert(payload);
        if (error) throw error;
        return payload;
      },
    };
  }

  return {
    getSubscription: async (scope, orgId) => getSubscriptionSqlite(scope, orgId),
    getLedger: async (scope, orgId) => getLedgerSqlite(scope, orgId),
    addLedgerEntry: async (scope, entry) => {
      const db = getDb();
      const payload = {
        id: entry.id || randomUUID(),
        tenant_id: scope.tenantId,
        org_id: entry.org_id || scope.tenantId,
        entry_type: entry.entry_type || 'debit',
        amount: entry.amount,
        reason: entry.reason || 'Usage',
        reference_id: entry.reference_id || null,
        balance_after: entry.balance_after ?? 0,
        occurred_at: entry.occurred_at || new Date().toISOString(),
      };
      db.prepare(`
        INSERT INTO credit_ledger (
          id, org_id, tenant_id, entry_type, amount, reason,
          reference_id, balance_after, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payload.id,
        payload.org_id,
        payload.tenant_id,
        payload.entry_type,
        payload.amount,
        payload.reason,
        payload.reference_id,
        payload.balance_after,
        payload.occurred_at,
      );
      return payload;
    },
  };
}
