import { getSupabaseAdmin } from '../db/supabase.js';

export interface InboxScope {
  tenantId: string;
  workspaceId: string;
}

export type ChannelType =
  | 'email' | 'whatsapp' | 'phone' | 'messenger' | 'web_widget'
  | 'api' | 'twitter' | 'instagram' | 'line' | 'telegram' | 'discord' | 'sms';

export interface CreateInboxPayload {
  name:                    string;
  channel_type:            ChannelType;
  channel_config?:         Record<string, unknown>;
  greeting_enabled?:       boolean;
  greeting_message?:       string | null;
  out_of_office_message?:  string | null;
  auto_assignment_enabled?: boolean;
  assignment_policy_id?:   string | null;
  working_hours_id?:       string | null;
  email?:                  string | null;
  csat_survey_enabled?:    boolean;
  enabled?:                boolean;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listInboxes(
  scope: InboxScope,
  filters?: { channel_type?: ChannelType; enabled?: boolean },
) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('inboxes')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('name');

  if (filters?.channel_type) query = query.eq('channel_type', filters.channel_type);
  if (filters?.enabled !== undefined) query = query.eq('enabled', filters.enabled);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getInbox(scope: InboxScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('inboxes')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createInbox(scope: InboxScope, payload: CreateInboxPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase
    .from('inboxes')
    .insert({
      id:                      randomUUID(),
      tenant_id:               scope.tenantId,
      workspace_id:            scope.workspaceId,
      name:                    payload.name.trim(),
      channel_type:            payload.channel_type,
      channel_config:          payload.channel_config ?? {},
      greeting_enabled:        payload.greeting_enabled ?? false,
      greeting_message:        payload.greeting_message ?? null,
      out_of_office_message:   payload.out_of_office_message ?? null,
      auto_assignment_enabled: payload.auto_assignment_enabled ?? false,
      assignment_policy_id:    payload.assignment_policy_id ?? null,
      working_hours_id:        payload.working_hours_id ?? null,
      email:                   payload.email ?? null,
      csat_survey_enabled:     payload.csat_survey_enabled ?? false,
      enabled:                 payload.enabled ?? true,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateInbox(
  scope: InboxScope,
  id: string,
  payload: Partial<CreateInboxPayload>,
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const fields: Array<keyof CreateInboxPayload> = [
    'name', 'channel_config', 'greeting_enabled', 'greeting_message',
    'out_of_office_message', 'auto_assignment_enabled', 'assignment_policy_id',
    'working_hours_id', 'email', 'csat_survey_enabled', 'enabled',
  ];
  for (const f of fields) {
    if (f in payload) {
      updates[f] = f === 'name' ? String(payload[f]).trim() : payload[f];
    }
  }
  const { data, error } = await supabase
    .from('inboxes')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteInbox(scope: InboxScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('inboxes')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}

// ── Contact inboxes (C2) ──────────────────────────────────────────────────────

export async function listContactInboxes(scope: InboxScope, contactId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('contact_inboxes')
    .select('*, inboxes(id, name, channel_type)')
    .eq('contact_id', contactId)
    .eq('tenant_id', scope.tenantId)
    .order('last_seen_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function upsertContactInbox(
  scope: InboxScope,
  contactId: string,
  inboxId: string,
  sourceId: string,
) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase
    .from('contact_inboxes')
    .upsert(
      {
        id:          randomUUID(),
        tenant_id:   scope.tenantId,
        contact_id:  contactId,
        inbox_id:    inboxId,
        source_id:   sourceId,
        last_seen_at: new Date().toISOString(),
        updated_at:  new Date().toISOString(),
      },
      { onConflict: 'contact_id,inbox_id', ignoreDuplicates: false },
    )
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function findContactBySourceId(
  scope: InboxScope,
  inboxId: string,
  sourceId: string,
) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('contact_inboxes')
    .select('*, customers(id, canonical_name, canonical_email)')
    .eq('tenant_id', scope.tenantId)
    .eq('inbox_id', inboxId)
    .eq('source_id', sourceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
