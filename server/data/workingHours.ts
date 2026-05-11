import { getSupabaseAdmin } from '../db/supabase.js';

export interface WorkingHoursScope {
  tenantId: string;
  workspaceId: string;
}

export interface DayHours {
  start: string; // 'HH:MM'
  end:   string; // 'HH:MM'
}

export interface DaySchedule {
  day:   number;       // 0 = Sunday … 6 = Saturday
  open:  boolean;
  hours: DayHours[];   // supports split shifts
}

export interface CreateWorkingHoursPayload {
  name?:     string;
  timezone?: string;
  schedule:  DaySchedule[];
  inbox_id?: string | null;
}

// ── Default schedule (Mon–Fri 09:00–17:00 UTC) ───────────────────────────────

export const DEFAULT_SCHEDULE: DaySchedule[] = [
  { day: 0, open: false, hours: [] },                                // Sun
  { day: 1, open: true,  hours: [{ start: '09:00', end: '17:00' }] }, // Mon
  { day: 2, open: true,  hours: [{ start: '09:00', end: '17:00' }] }, // Tue
  { day: 3, open: true,  hours: [{ start: '09:00', end: '17:00' }] }, // Wed
  { day: 4, open: true,  hours: [{ start: '09:00', end: '17:00' }] }, // Thu
  { day: 5, open: true,  hours: [{ start: '09:00', end: '17:00' }] }, // Fri
  { day: 6, open: false, hours: [] },                                // Sat
];

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listWorkingHours(scope: WorkingHoursScope) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('working_hours')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function getWorkingHoursById(scope: WorkingHoursScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('working_hours')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Returns the working hours applicable to a given inbox (falls back to global) */
export async function getEffectiveWorkingHours(scope: WorkingHoursScope, inboxId?: string) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from('working_hours')
    .select('*')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);

  if (inboxId) {
    // Prefer inbox-specific; fall back to global (inbox_id IS NULL)
    const { data } = await supabase
      .from('working_hours')
      .select('*')
      .eq('tenant_id', scope.tenantId)
      .eq('workspace_id', scope.workspaceId)
      .eq('inbox_id', inboxId)
      .maybeSingle();
    if (data) return data;
  }

  const { data, error } = await query.is('inbox_id', null).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createWorkingHours(
  scope: WorkingHoursScope,
  payload: CreateWorkingHoursPayload,
) {
  const supabase = getSupabaseAdmin();
  const { randomUUID } = await import('crypto');
  const { data, error } = await supabase
    .from('working_hours')
    .insert({
      id:           randomUUID(),
      tenant_id:    scope.tenantId,
      workspace_id: scope.workspaceId,
      name:         (payload.name ?? 'Default').trim(),
      timezone:     payload.timezone ?? 'UTC',
      schedule:     payload.schedule ?? DEFAULT_SCHEDULE,
      inbox_id:     payload.inbox_id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateWorkingHours(
  scope: WorkingHoursScope,
  id: string,
  payload: Partial<CreateWorkingHoursPayload>,
) {
  const supabase = getSupabaseAdmin();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.name     !== undefined) updates.name = payload.name?.trim() ?? 'Default';
  if (payload.timezone !== undefined) updates.timezone = payload.timezone;
  if (payload.schedule !== undefined) updates.schedule = payload.schedule;
  if (payload.inbox_id !== undefined) updates.inbox_id = payload.inbox_id;

  const { data, error } = await supabase
    .from('working_hours')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteWorkingHours(scope: WorkingHoursScope, id: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('working_hours')
    .delete()
    .eq('id', id)
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId);
  if (error) throw error;
}

// ── Helper: is a timestamp within working hours? ──────────────────────────────

/**
 * Returns true if the given Date falls within the active working hours.
 * Comparison is done in the schedule's timezone.
 */
export function isWithinWorkingHours(
  schedule: DaySchedule[],
  timezone: string,
  at: Date = new Date(),
): boolean {
  try {
    // Get the time in the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour:    '2-digit',
      minute:  '2-digit',
      hour12:  false,
    });

    const parts = Object.fromEntries(
      formatter.formatToParts(at).map(p => [p.type, p.value]),
    );
    const dayName = parts['weekday'];
    const DAY_MAP: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    const dayNum = DAY_MAP[dayName] ?? -1;
    const currentMinutes = parseInt(parts['hour']) * 60 + parseInt(parts['minute']);

    const dayConfig = schedule.find(d => d.day === dayNum);
    if (!dayConfig?.open) return false;

    return dayConfig.hours.some(slot => {
      const [sh, sm] = slot.start.split(':').map(Number);
      const [eh, em] = slot.end.split(':').map(Number);
      return currentMinutes >= sh * 60 + sm && currentMinutes < eh * 60 + em;
    });
  } catch {
    return true; // Fail open if timezone is invalid
  }
}
