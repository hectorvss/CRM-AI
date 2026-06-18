/**
 * Activity log drawer — parity with PostHog's <ActivityLog/>.
 *
 * Drives from /api/projects/{pid}/activity_log/?scope=<Scope>&item_id=<id>.
 * Scope is the PostHog `ActivityScope` enum (Insight, Dashboard, FeatureFlag,
 * Experiment, Survey, Notebook, Cohort, Action, Annotation, Person, Group,
 * Recording, Comment, Plugin, …). Used from every resource detail.
 */
import React from 'react';

export type ActivityScope =
  | 'Insight' | 'Dashboard' | 'FeatureFlag' | 'Experiment' | 'Survey'
  | 'Notebook' | 'Cohort' | 'Action' | 'Annotation' | 'Person' | 'Group'
  | 'Recording' | 'Comment' | 'Plugin' | 'Team' | 'Organization';

interface ActivityRow {
  id?:        string;
  user?:      { first_name?: string; email?: string; uuid?: string };
  activity?:  string;
  scope?:     string;
  item_id?:   string;
  detail?:    any;
  created_at?: string;
}

const ACTIVITY_LABELS: Record<string, string> = {
  created: 'creado', updated: 'actualizado', deleted: 'eliminado',
  exported: 'exportado', imported: 'importado',
  archived: 'archivado', unarchived: 'restaurado',
  shared: 'compartido', unshared: 'dejado de compartir',
  duplicated: 'duplicado',
  enabled: 'activado', disabled: 'desactivado',
  resolved: 'resuelto', reopened: 'reabierto',
  assigned: 'asignado', unassigned: 'desasignado',
};

function formatActor(a: ActivityRow): string {
  const u = a.user;
  if (!u) return 'Sistema';
  return u.first_name?.trim() || u.email?.split('@')[0] || 'Usuario';
}
function formatRelative(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso); const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60)    return 'justo ahora';
  if (sec < 3600)  return `hace ${Math.floor(sec / 60)} min`;
  if (sec < 86400) return `hace ${Math.floor(sec / 3600)} h`;
  if (sec < 86400 * 7) return `hace ${Math.floor(sec / 86400)} d`;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function describeChanges(detail: any): string[] {
  if (!detail) return [];
  const out: string[] = [];
  for (const ch of (detail.changes ?? [])) {
    const field = ch.field ?? ch.name ?? '';
    if (!field) continue;
    const before = ch.before == null ? '∅' : typeof ch.before === 'object' ? JSON.stringify(ch.before).slice(0, 40) : String(ch.before).slice(0, 40);
    const after  = ch.after  == null ? '∅' : typeof ch.after  === 'object' ? JSON.stringify(ch.after).slice(0, 40)  : String(ch.after).slice(0, 40);
    out.push(`${field}: ${before} → ${after}`);
  }
  return out;
}

export function ActivityLogDrawer({
  open, onClose, scope, itemId, title,
}: {
  open:    boolean;
  onClose: () => void;
  scope:   ActivityScope;
  itemId:  string | number;
  title?:  string;
}) {
  const [rows,    setRows]    = React.useState<ActivityRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error,   setError]   = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const ph = await import('../../api/posthog');
        if (!ph.getProjectId()) await ph.bootstrapPostHog();
        const res: any = await ph.posthog.activity.list({ scope, item_id: String(itemId), limit: 100 });
        if (!cancelled) setRows(res?.results ?? []);
      } catch (e: any) { if (!cancelled) setError(e?.message ?? 'Error al cargar actividad'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [open, scope, itemId]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-[#1a1a18]/30 z-[70]" onClick={onClose}>
      <div className="absolute right-0 top-0 bottom-0 w-[440px] max-w-[92vw] bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#e9eae6] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#1a1a18]">Historial de cambios</h2>
            {title && <p className="text-xs text-[#646462] mt-0.5 truncate max-w-[320px]">{title}</p>}
          </div>
          <button onClick={onClose} className="text-[#9ca3af] hover:text-[#1a1a18]">
            <svg viewBox="0 0 16 16" className="w-4 h-4"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? <div className="space-y-3">{[0,1,2,3].map(i => <div key={i} className="h-12 bg-[#fafaf9] rounded animate-pulse" />)}</div>
           : error ? <p className="text-sm text-[#dc2626]">{error}</p>
           : rows.length === 0 ? (
            <div className="text-center py-10 text-[#9ca3af]">
              <svg viewBox="0 0 24 24" className="w-8 h-8 mx-auto mb-2"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
              <p className="text-sm font-medium text-[#1a1a18]">Sin cambios todavía</p>
              <p className="text-xs">Las modificaciones que se hagan aparecerán aquí.</p>
            </div>
          ) : (
            <ol className="space-y-3 relative">
              <div className="absolute left-[10px] top-2 bottom-2 w-px bg-[#e9eae6]" />
              {rows.map((r, i) => {
                const action = (r.activity || '').toLowerCase();
                const changes = describeChanges(r.detail);
                return (
                  <li key={r.id ?? i} className="pl-7 relative">
                    <span className="absolute left-[6px] top-1.5 w-2.5 h-2.5 rounded-full bg-[#3b59f6] border-2 border-white" />
                    <p className="text-sm text-[#1a1a18]">
                      <span className="font-medium">{formatActor(r)}</span>
                      <span className="text-[#646462]"> {ACTIVITY_LABELS[action] ?? action ?? 'cambió'}</span>
                    </p>
                    {changes.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {changes.slice(0, 4).map((c, ci) => (
                          <li key={ci} className="text-[11px] text-[#646462] font-mono truncate">{c}</li>
                        ))}
                        {changes.length > 4 && <li className="text-[10px] text-[#9ca3af]">+{changes.length - 4} más…</li>}
                      </ul>
                    )}
                    <p className="text-[10px] text-[#9ca3af] mt-1">{formatRelative(r.created_at)}</p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

export default ActivityLogDrawer;
