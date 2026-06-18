import { getSupabaseAdmin } from '../db/supabase.js';

export interface NotificationScope { tenantId: string; workspaceId: string }

export type NotificationType =
  | 'mention' | 'assignment' | 'conversation_resolved' | 'conversation_reopened'
  | 'sla_breach' | 'csat_received' | 'new_message' | 'macro_executed'
  | 'automation_triggered' | 'custom';

export interface CreateNotificationPayload {
  user_id:           string;
  notification_type: NotificationType;
  title:             string;
  body?:             string | null;
  entity_type?:      string | null;
  entity_id?:        string | null;
  metadata?:         Record<string, unknown>;
}

export async function createNotification(scope: NotificationScope, payload: CreateNotificationPayload) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase.from('notifications').insert({
    id:                randomUUID(),
    tenant_id:         scope.tenantId,
    workspace_id:      scope.workspaceId,
    user_id:           payload.user_id,
    notification_type: payload.notification_type,
    title:             payload.title,
    body:              payload.body ?? null,
    entity_type:       payload.entity_type ?? null,
    entity_id:         payload.entity_id ?? null,
    metadata:          payload.metadata ?? {},
  }).select('*').single();
  if (error) throw error;
  return data;
}

export async function listNotificationsForUser(
  scope: NotificationScope,
  userId: string,
  filters?: { unreadOnly?: boolean; limit?: number },
) {
  const supabase = getSupabaseAdmin();
  let q = supabase.from('notifications').select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(filters?.limit ?? 50);
  if (filters?.unreadOnly) q = q.eq('read', false);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function markNotificationRead(scope: NotificationScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('notifications')
    .update({ read: true, read_at: new Date().toISOString() })
    .eq('id', id).eq('tenant_id', scope.tenantId);
  if (error) throw error;
}

export async function markAllNotificationsRead(scope: NotificationScope, userId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('notifications')
    .update({ read: true, read_at: new Date().toISOString() })
    .eq('tenant_id', scope.tenantId)
    .eq('user_id', userId)
    .eq('read', false);
  if (error) throw error;
}

export async function getUnreadCount(scope: NotificationScope, userId: string) {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase.from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', scope.tenantId)
    .eq('user_id', userId)
    .eq('read', false);
  if (error) throw error;
  return count ?? 0;
}
