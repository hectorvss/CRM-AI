import { randomUUID } from 'crypto';
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
  updateSubscription(scope: BillingScope, orgId: string, updates: Record<string, any>): Promise<void>;
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

function updateSubscriptionSqlite(scope: BillingScope, orgId: string, updates: Record<string, any>) {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }

  if (fields.length === 0) return;

  db.prepare(`UPDATE billing_subscriptions SET ${fields.join(', ')} WHERE org_id = ?`).run(...values, orgId);
}

export function createBillingRepository(): BillingRepository {
  if (getDatabaseProvider() === 'supabase') {
    return {
      getSubscription: getSubscriptionSupabase,
      getLedger: getLedgerSupabase,
      addLedgerEntry: async (scope, entry) => {
        const supabase = getSupabaseAdmin();
        const { error } = await supabase.from('credit_ledger').insert({
          ...entry,
          id: entry.id || randomUUID(),
          tenant_id: scope.tenantId,
          occurred_at: entry.occurred_at || new Date().toISOString()
        });
        if (error) throw error;
      },
      updateSubscription: async (_scope, orgId, updates) => {
        const supabase = getSupabaseAdmin();
        const { error } = await supabase
          .from('billing_subscriptions')
          .update({
            ...updates,
          })
          .eq('org_id', orgId);
        if (error) throw error;
      }
    };
  }

  return {
    getSubscription: async (scope, orgId) => getSubscriptionSqlite(scope, orgId),
    getLedger: async (scope, orgId) => getLedgerSqlite(scope, orgId),
    addLedgerEntry: async (scope, entry) => {
      const db = getDb();
      const fields = Object.keys(entry);
      const placeholders = fields.map(() => '?').join(', ');
      const values = fields.map(f => entry[f]);
      db.prepare(`
        INSERT INTO credit_ledger (${fields.join(', ')}, tenant_id, occurred_at)
        VALUES (${placeholders}, ?, ?)
      `).run(...values, scope.tenantId, entry.occurred_at || new Date().toISOString());
    },
    updateSubscription: async (scope, orgId, updates) => updateSubscriptionSqlite(scope, orgId, updates),
  };
}
