/**
 * ScheduleSyncDrawer — programa la sincronización de una fuente externa.
 *
 * GET    /external_data_sources/{id}/
 * PATCH  /external_data_sources/{id}/   ({ schedule_interval, sync_frequency_interval, status })
 * POST   /external_data_sources/{id}/reload/
 * GET    /external_data_sources/{id}/jobs/  → últimos N jobs
 */
import React from 'react';

interface Source { id: string; source_type: string; status: string; schedule_interval?: string; latest_error?: string; prefix?: string; created_at: string }
interface Job    { id: string; status: 'Running' | 'Completed' | 'Failed' | 'Cancelled'; rows_synced: number; created_at: string; finished_at?: string }

const INTERVALS = [
  { k: '5m',  l: 'Cada 5 minutos' },
  { k: '30m', l: 'Cada 30 minutos' },
  { k: '1h',  l: 'Cada hora' },
  { k: '6h',  l: 'Cada 6 horas' },
  { k: '12h', l: 'Cada 12 horas' },
  { k: '24h', l: 'Cada día' },
  { k: '7d',  l: 'Cada semana' },
  { k: 'manual', l: 'Manual' },
];

export function ScheduleSyncDrawer({ open, onClose, sourceId }: { open: boolean; onClose: () => void; sourceId: string }) {
  const [source,  setSource]  = React.useState<Source | null>(null);
  const [jobs,    setJobs]    = React.useState<Job[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving,  setSaving]  = React.useState(false);
  const [reloading, setReloading] = React.useState(false);

  async function load() {
    setLoading(true);
    try {
      const ph = await import('../../api/posthog');
      if (!ph.getProjectId()) await ph.bootstrapPostHog();
      const [s, j]: any[] = await Promise.all([
        ph.posthog.externalDataSources.get(sourceId),
        ph.posthog.externalDataSources.jobs(sourceId).catch(() => ({ results: [] })),
      ]);
      setSource(s);
      setJobs(j?.results ?? []);
    } catch { setSource(null); setJobs([]); }
    finally { setLoading(false); }
  }
  React.useEffect(() => { if (open && sourceId) load(); }, [open, sourceId]);

  async function patchInterval(k: string) {
    if (!source) return;
    setSaving(true);
    try {
      const ph = await import('../../api/posthog');
      const next: any = await ph.posthog.externalDataSources.update(sourceId, { schedule_interval: k, status: k === 'manual' ? 'Paused' : 'Running' });
      setSource(next);
    } catch (e: any) { alert(e?.message ?? 'No se pudo guardar'); }
    finally { setSaving(false); }
  }

  async function reload() {
    setReloading(true);
    try {
      const ph = await import('../../api/posthog');
      await ph.posthog.externalDataSources.reload(sourceId);
      await load();
    } catch (e: any) { alert(e?.message ?? 'No se pudo lanzar la sincronización'); }
    finally { setReloading(false); }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-[#1a1a18]/30 z-[70]" onClick={onClose}>
      <div className="absolute right-0 top-0 bottom-0 w-[440px] max-w-[92vw] bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#e9eae6] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#1a1a18]">Programar sincronización</h2>
            {source && <p className="text-xs text-[#646462] mt-0.5">{source.source_type}{source.prefix ? ` · ${source.prefix}` : ''}</p>}
          </div>
          <button onClick={onClose} className="text-[#9ca3af] hover:text-[#1a1a18]">
            <svg viewBox="0 0 16 16" className="w-4 h-4"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        {loading ? <div className="p-5 space-y-2">{[0,1,2,3].map(i => <div key={i} className="h-10 bg-[#fafaf9] rounded animate-pulse" />)}</div>
         : !source ? <div className="p-5 text-sm text-[#dc2626]">No se pudo cargar la fuente.</div>
         : (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <div className="bg-[#fafaf9] border border-[#e9eae6] rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider">Estado</p>
                <p className="text-sm font-medium text-[#1a1a18]">{source.status}</p>
              </div>
              <button onClick={reload} disabled={reloading} className="px-3 py-1.5 bg-[#1a1a18] text-white text-xs rounded-lg hover:bg-[#333] disabled:opacity-50">
                {reloading ? 'Lanzando…' : 'Forzar sincronización'}
              </button>
            </div>

            <div>
              <h3 className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-2">Frecuencia</h3>
              <div className="grid grid-cols-2 gap-2">
                {INTERVALS.map(iv => (
                  <button key={iv.k} onClick={() => patchInterval(iv.k)} disabled={saving} className={`px-3 py-2 text-xs rounded-lg border text-left ${source.schedule_interval === iv.k ? 'border-[#3b59f6] bg-[#eff2ff] text-[#3b59f6] font-medium' : 'border-[#e9eae6] text-[#1a1a18] hover:bg-[#fafaf9]'}`}>{iv.l}</button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-2">Últimas ejecuciones</h3>
              {jobs.length === 0 ? <p className="text-xs text-[#9ca3af]">Sin ejecuciones aún.</p> : (
                <ul className="space-y-1.5">
                  {jobs.slice(0, 10).map(j => {
                    const c = j.status === 'Completed' ? '#16a34a' : j.status === 'Failed' ? '#dc2626' : j.status === 'Running' ? '#3b59f6' : '#9ca3af';
                    return (
                      <li key={j.id} className="flex items-center justify-between text-xs p-2 rounded hover:bg-[#fafaf9]">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c }} />
                          <span className="font-medium" style={{ color: c }}>{j.status}</span>
                          <span className="text-[#646462]">{j.rows_synced?.toLocaleString('es-ES') ?? 0} filas</span>
                        </div>
                        <span className="text-[#9ca3af]">{new Date(j.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {source.latest_error && (
              <div className="bg-[#fef2f2] border border-[#fecaca] rounded-lg p-3 text-xs text-[#991b1b]">
                <p className="font-medium mb-1">Último error</p>
                <p className="font-mono break-all">{source.latest_error}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ScheduleSyncDrawer;
