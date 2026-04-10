export function asArray<T = string>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  return [];
}

export function compactStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)));
}

export function canonicalHealth(value: string | null | undefined): 'healthy' | 'warning' | 'critical' | 'blocked' | 'pending' | 'resolved' {
  const normalized = (value || '').toLowerCase();
  if (!normalized) return 'pending';
  if (['healthy', 'ok', 'success', 'completed', 'paid', 'captured', 'fulfilled', 'delivered', 'approved', 'received', 'synced'].includes(normalized)) return 'healthy';
  if (['resolved', 'closed'].includes(normalized)) return 'resolved';
  if (['pending', 'new', 'queued', 'requested', 'review', 'in_review', 'awaiting_approval', 'in_transit', 'waiting'].includes(normalized)) return 'pending';
  if (['warning', 'at_risk', 'medium', 'disputed', 'inspection_failed'].includes(normalized)) return 'warning';
  if (['blocked', 'failed', 'rejected', 'expired'].includes(normalized)) return 'blocked';
  if (['critical', 'conflict', 'high', 'urgent', 'breached'].includes(normalized)) return 'critical';
  return 'pending';
}

export function buildSlaView(caseRow: any) {
  const deadline = caseRow.sla_resolution_deadline;
  if (!deadline) {
    return {
      status: caseRow.sla_status || 'on_track',
      label: 'Waiting',
      time: 'N/A',
    };
  }

  const diffMs = new Date(deadline).getTime() - Date.now();
  if (diffMs <= 0) {
    return {
      status: 'breached',
      label: 'Overdue',
      time: 'Overdue',
    };
  }

  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  const time = diffMinutes < 60
    ? `${diffMinutes}m remaining`
    : `${Math.round(diffMinutes / 60)}h remaining`;

  return {
    status: caseRow.sla_status || 'on_track',
    label: caseRow.sla_status === 'at_risk' ? 'SLA risk' : 'Waiting',
    time,
  };
}
