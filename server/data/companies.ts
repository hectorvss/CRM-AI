import { getSupabaseAdmin } from '../db/supabase.js';

export interface CompanyScope {
  tenantId: string;
  workspaceId: string;
}

export interface CompanyFilters {
  q?: string;
  industry?: string;
  country?: string;
}

export interface CreateCompanyPayload {
  name: string;
  domain?: string | null;
  description?: string | null;
  website?: string | null;
  phone?: string | null;
  country?: string | null;
  industry?: string | null;
  employee_count?: number | null;
  annual_revenue?: number | null;
  currency?: string;
  custom_attributes?: Record<string, unknown>;
}

export interface UpdateCompanyPayload {
  name?: string;
  domain?: string | null;
  description?: string | null;
  website?: string | null;
  phone?: string | null;
  country?: string | null;
  industry?: string | null;
  employee_count?: number | null;
  annual_revenue?: number | null;
  currency?: string;
  custom_attributes?: Record<string, unknown>;
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listCompanies(scope: CompanyScope, filters: CompanyFilters = {}) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('companies')
    .select('id, name, domain, description, website, phone, country, industry, employee_count, annual_revenue, currency, custom_attributes, contacts_count, last_activity_at, created_at, updated_at')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('name', { ascending: true });

  if (filters.q) {
    query = query.or(`name.ilike.%${filters.q}%,domain.ilike.%${filters.q}%`);
  }
  if (filters.industry) {
    query = query.eq('industry', filters.industry);
  }
  if (filters.country) {
    query = query.eq('country', filters.country);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ── Get one ───────────────────────────────────────────────────────────────────

export async function getCompany(scope: CompanyScope, id: string) {
  const supabase = getSupabaseAdmin();

  const [companyRes, contactsRes] = await Promise.all([
    supabase
      .from('companies')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId)
      .maybeSingle(),
    supabase
      .from('customers')
      .select('id, canonical_name, canonical_email, contact_type, risk_level, lifetime_value, last_activity_at')
      .eq('company_id', id)
      .eq('tenant_id', scope.tenantId)
      .order('last_activity_at', { ascending: false })
      .limit(50),
  ]);

  if (companyRes.error) throw companyRes.error;
  if (!companyRes.data) return null;

  return {
    ...companyRes.data,
    contacts: contactsRes.data ?? [],
  };
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createCompany(scope: CompanyScope, payload: CreateCompanyPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');

  const row = {
    id: randomUUID(),
    tenant_id: scope.tenantId,
    workspace_id: scope.workspaceId,
    name: payload.name.trim(),
    domain: payload.domain?.trim().toLowerCase() || null,
    description: payload.description ?? null,
    website: payload.website ?? null,
    phone: payload.phone ?? null,
    country: payload.country ?? null,
    industry: payload.industry ?? null,
    employee_count: payload.employee_count ?? null,
    annual_revenue: payload.annual_revenue ?? null,
    currency: payload.currency ?? 'USD',
    custom_attributes: payload.custom_attributes ?? {},
  };

  const { data, error } = await supabase
    .from('companies')
    .insert(row)
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateCompany(scope: CompanyScope, id: string, payload: UpdateCompanyPayload) {
  const supabase = getSupabaseAdmin();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.name !== undefined) updates.name = payload.name.trim();
  if (payload.domain !== undefined) updates.domain = payload.domain?.trim().toLowerCase() || null;
  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.website !== undefined) updates.website = payload.website;
  if (payload.phone !== undefined) updates.phone = payload.phone;
  if (payload.country !== undefined) updates.country = payload.country;
  if (payload.industry !== undefined) updates.industry = payload.industry;
  if (payload.employee_count !== undefined) updates.employee_count = payload.employee_count;
  if (payload.annual_revenue !== undefined) updates.annual_revenue = payload.annual_revenue;
  if (payload.currency !== undefined) updates.currency = payload.currency;
  if (payload.custom_attributes !== undefined) updates.custom_attributes = payload.custom_attributes;

  const { data, error } = await supabase
    .from('companies')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return data;
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteCompany(scope: CompanyScope, id: string) {
  const supabase = getSupabaseAdmin();

  // Unlink all customers from this company before deleting
  await supabase
    .from('customers')
    .update({ company_id: null })
    .eq('company_id', id)
    .eq('tenant_id', scope.tenantId);

  const { error } = await supabase
    .from('companies')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);

  if (error) throw error;
}

// ── Find by domain (dedup helper for ingest) ──────────────────────────────────

export async function findCompanyByDomain(scope: CompanyScope, domain: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, domain')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .eq('domain', domain.trim().toLowerCase())
    .maybeSingle();

  if (error) throw error;
  return data;
}

// ── Touch last_activity_at ────────────────────────────────────────────────────

export async function touchCompanyActivity(companyId: string) {
  const supabase = getSupabaseAdmin();
  await supabase
    .from('companies')
    .update({ last_activity_at: new Date().toISOString() })
    .eq('id', companyId);
}
