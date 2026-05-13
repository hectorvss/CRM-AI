import { getSupabaseAdmin } from '../db/supabase.js';

export interface ImportScope { tenantId: string; workspaceId: string }

export type ImportEntityType = 'contacts' | 'conversations' | 'companies' | 'knowledge';
export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface CreateDataImportPayload {
  entity_type:   ImportEntityType;
  filename:      string;
  file_url?:     string | null;
  file_size?:    number | null;
  field_mapping?: Record<string, string>;
  imported_by?:  string | null;
  total_rows?:   number | null;
}

export async function createDataImport(scope: ImportScope, payload: CreateDataImportPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase.from('data_imports').insert({
    id:            randomUUID(),
    tenant_id:     scope.tenantId,
    workspace_id:  scope.workspaceId,
    entity_type:   payload.entity_type,
    filename:      payload.filename,
    file_url:      payload.file_url ?? null,
    file_size:     payload.file_size ?? null,
    field_mapping: payload.field_mapping ?? {},
    imported_by:   payload.imported_by ?? null,
    total_rows:    payload.total_rows ?? null,
    status:        'pending',
  }).select('*').single();
  if (error) throw error;
  return data;
}

export async function listDataImports(
  scope: ImportScope,
  filters?: { status?: ImportStatus; entityType?: ImportEntityType },
) {
  const supabase = getSupabaseAdmin();
  let q = supabase.from('data_imports').select('*')
    .eq('tenant_id', scope.tenantId).eq('workspace_id', scope.workspaceId)
    .order('created_at', { ascending: false }).limit(50);
  if (filters?.status) q = q.eq('status', filters.status);
  if (filters?.entityType) q = q.eq('entity_type', filters.entityType);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getDataImport(scope: ImportScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('data_imports').select('*')
    .eq('id', id).eq('tenant_id', scope.tenantId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateImportProgress(
  scope: ImportScope,
  id: string,
  update: {
    status?:        ImportStatus;
    imported_rows?: number;
    skipped_rows?:  number;
    error_rows?:    number;
    errors?:        unknown[];
    started_at?:    string;
    completed_at?:  string;
  },
) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('data_imports').update(update)
    .eq('id', id).eq('tenant_id', scope.tenantId);
  if (error) throw error;
}
