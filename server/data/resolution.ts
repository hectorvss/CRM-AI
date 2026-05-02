import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';

export interface ResolutionScope {
  tenantId: string;
  workspaceId: string;
}

export interface ResolutionRepository {
  createPlan(scope: ResolutionScope, data: any): Promise<string>;
  getPlan(scope: ResolutionScope, id: string): Promise<any | null>;
  updatePlan(scope: ResolutionScope, id: string, updates: any): Promise<void>;
  listPlansByCase(scope: ResolutionScope, caseId: string): Promise<any[]>;
  
  createActionAttempt(scope: ResolutionScope, data: any): Promise<string>;
  updateActionAttempt(scope: ResolutionScope, id: string, updates: any): Promise<void>;
  getAttemptByIdempotencyKey(scope: ResolutionScope, key: string): Promise<any | null>;
}


class SupabaseResolutionRepository implements ResolutionRepository {
  async createPlan(scope: ResolutionScope, data: any) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('execution_plans').insert({ ...data, tenant_id: scope.tenantId });
    if (error) throw error;
    return data.id || randomUUID();
  }

  async getPlan(scope: ResolutionScope, id: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('execution_plans').select('*').eq('id', id).eq('tenant_id', scope.tenantId).maybeSingle();
    if (error) throw error;
    return data;
  }

  async updatePlan(scope: ResolutionScope, id: string, updates: any) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('execution_plans').update(updates).eq('id', id).eq('tenant_id', scope.tenantId);
    if (error) throw error;
  }

  async listPlansByCase(scope: ResolutionScope, caseId: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('execution_plans').select('*').eq('case_id', caseId).eq('tenant_id', scope.tenantId);
    if (error) throw error;
    return data || [];
  }

  async createActionAttempt(scope: ResolutionScope, data: any) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('tool_action_attempts').insert({ ...data, tenant_id: scope.tenantId });
    if (error) throw error;
    return data.id || randomUUID();
  }

  async updateActionAttempt(scope: ResolutionScope, id: string, updates: any) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('tool_action_attempts').update(updates).eq('id', id).eq('tenant_id', scope.tenantId);
    if (error) throw error;
  }

  async getAttemptByIdempotencyKey(scope: ResolutionScope, key: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('tool_action_attempts').select('*').eq('idempotency_key', key).eq('tenant_id', scope.tenantId).maybeSingle();
    if (error) throw error;
    return data;
  }
}

export function createResolutionRepository(): ResolutionRepository {
  return new SupabaseResolutionRepository();
}
