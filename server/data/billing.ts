import { getSupabaseAdmin } from '../db/supabase.js';

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

export function createBillingRepository(): BillingRepository {
  return {
    getSubscription: getSubscriptionSupabase,
    getLedger: getLedgerSupabase,
    addLedgerEntry: addLedgerEntrySupabase,
  };
}
