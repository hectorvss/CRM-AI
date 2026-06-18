import { getSupabaseAdmin } from '../db/supabase.js';

export interface AttrScope {
  tenantId: string;
  workspaceId: string;
}

export type AttrModel = 'customer' | 'case' | 'company';
export type AttrType  = 'text' | 'number' | 'date' | 'boolean' | 'list' | 'checkbox' | 'url' | 'email';

export interface CreateAttrDefPayload {
  attribute_key:          string;
  attribute_display_name: string;
  attribute_display_type: AttrType;
  attribute_model:        AttrModel;
  attribute_values?:      string[] | null;
  default_value?:         string | null;
  regex_pattern?:         string | null;
  is_required?:           boolean;
  position?:              number;
}

// ── Definitions CRUD ──────────────────────────────────────────────────────────

export async function listAttrDefs(scope: AttrScope, model?: AttrModel) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('custom_attribute_definitions')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('attribute_model')
    .order('position');

  if (model) query = query.eq('attribute_model', model);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createAttrDef(scope: AttrScope, payload: CreateAttrDefPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');

  // auto-position: put at end of model group
  const { count } = await supabase
    .from('custom_attribute_definitions')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .eq('attribute_model', payload.attribute_model);

  const { data, error } = await supabase
    .from('custom_attribute_definitions')
    .insert({
      id:                     randomUUID(),
      tenant_id:              scope.tenantId,
      workspace_id:           scope.workspaceId,
      attribute_key:          payload.attribute_key.toLowerCase().replace(/\s+/g, '_'),
      attribute_display_name: payload.attribute_display_name.trim(),
      attribute_display_type: payload.attribute_display_type,
      attribute_model:        payload.attribute_model,
      attribute_values:       payload.attribute_values ?? null,
      default_value:          payload.default_value ?? null,
      regex_pattern:          payload.regex_pattern ?? null,
      is_required:            payload.is_required ?? false,
      position:               payload.position ?? (count ?? 0),
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function updateAttrDef(scope: AttrScope, id: string, payload: Partial<CreateAttrDefPayload>) {
  const supabase = getSupabaseAdmin();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.attribute_display_name !== undefined) updates.attribute_display_name = payload.attribute_display_name.trim();
  if (payload.attribute_display_type !== undefined) updates.attribute_display_type = payload.attribute_display_type;
  if (payload.attribute_values       !== undefined) updates.attribute_values = payload.attribute_values;
  if (payload.default_value          !== undefined) updates.default_value = payload.default_value;
  if (payload.regex_pattern          !== undefined) updates.regex_pattern = payload.regex_pattern;
  if (payload.is_required            !== undefined) updates.is_required = payload.is_required;
  if (payload.position               !== undefined) updates.position = payload.position;

  const { data, error } = await supabase
    .from('custom_attribute_definitions')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function deleteAttrDef(scope: AttrScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('custom_attribute_definitions')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}

// ── Value read/write on entities ──────────────────────────────────────────────
// These helpers patch custom_attributes JSONB on the target table.

type EntityTable = 'customers' | 'cases' | 'companies';

const MODEL_TABLE: Record<AttrModel, EntityTable> = {
  customer: 'customers',
  case:     'cases',
  company:  'companies',
};

export async function getEntityCustomAttributes(
  scope: AttrScope,
  model: AttrModel,
  entityId: string,
): Promise<Record<string, unknown>> {
  const supabase = getSupabaseAdmin();
  const table = MODEL_TABLE[model];

  const { data, error } = await supabase
    .from(table)
    .select('custom_attributes')
    .eq('id', entityId)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle();

  if (error) throw error;
  return (data?.custom_attributes as Record<string, unknown>) ?? {};
}

export async function setEntityCustomAttributes(
  scope: AttrScope,
  model: AttrModel,
  entityId: string,
  attrs: Record<string, unknown>,
) {
  const supabase = getSupabaseAdmin();
  const table = MODEL_TABLE[model];

  const { error } = await supabase
    .from(table)
    .update({ custom_attributes: attrs, updated_at: new Date().toISOString() })
    .eq('id', entityId)
    .eq('tenant_id', scope.tenantId);

  if (error) throw error;
}

export async function patchEntityCustomAttributes(
  scope: AttrScope,
  model: AttrModel,
  entityId: string,
  patch: Record<string, unknown>,
) {
  const current = await getEntityCustomAttributes(scope, model, entityId);
  const merged  = { ...current, ...patch };
  await setEntityCustomAttributes(scope, model, entityId, merged);
  return merged;
}
