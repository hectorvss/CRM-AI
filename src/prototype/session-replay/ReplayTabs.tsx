/**
 * Per-replay tabs — parity with PostHog's player side-tabs.
 *
 *  Console      → /session_recordings/{id}/console_logs/
 *  Network      → /session_recordings/{id}/network_requests/
 *  Performance  → /session_recordings/{id}/performance_events/
 *  Errors       → /session_recordings/{id}/errors/   (issues attached to the replay)
 *
 * Each tab is a small list / table. The player itself stays where it is in
 * Prototype.tsx::WAAppSessionReplayView — this component is the side panel.
 */
import React from 'react';

export type ReplayTab = 'console' | 'network' | 'performance' | 'errors';

const TABS: { k: ReplayTab; l: string; icon: React.ReactNode }[] = [
  { k: 'console',     l: 'Consola',     icon: <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M2 3h12v10H2z" fill="none" stroke="currentColor" strokeWidth="1.3"/><path d="M4 6l2 2-2 2M8 10h4" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg> },
  { k: 'network',     l: 'Red',         icon: <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.3"/><path d="M2 8h12M8 2v12M3 4c2 2 8 2 10 0M3 12c2-2 8-2 10 0" stroke="currentColor" strokeWidth="1.1" fill="none"/></svg> },
  { k: 'performance', l: 'Rendimiento', icon: <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M2 13l4-6 3 2 5-7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { k: 'errors',      l: 'Errores',     icon: <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M8 1l7 13H1z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M8 6v4M8 12v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> },
];

const LEVEL_COLORS: Record<string, string> = {
  log:   '#646462',
  info:  '#3b59f6',
  warn:  '#f59e0b',
  error: '#dc2626',
  debug: '#9ca3af',
};

function fmtTime(ms: number | string | undefined): string {
  if (ms == null) return '—';
  const n = typeof ms === 'string' ? Date.parse(ms) : Number(ms);
  if (!Number.isFinite(n)) return '—';
  const d = new Date(n);
  return d.toLocaleTimeString('es-ES', { hour12: false });
}
function fmtMs(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(2)} s`;
}
function fmtBytes(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}

export function ReplayTabs({ recordingId }: { recordingId: string }) {
  const [tab, setTab] = React.useState<ReplayTab>('console');
  return (
    <div className="bg-white border border-[#e9eae6] rounded-xl overflow-hidden">
      <div className="border-b border-[#e9eae6] flex">
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${tab === t.k ? 'border-[#3b59f6] text-[#3b59f6]' : 'border-transparent text-[#646462] hover:text-[#1a1a18]'}`}>
            {t.icon}{t.l}
          </button>
        ))}
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {tab === 'console'     && <ConsolePane     id={recordingId} />}
        {tab === 'network'     && <NetworkPane     id={recordingId} />}
        {tab === 'performance' && <PerformancePane id={recordingId} />}
        {tab === 'errors'      && <ErrorsPane      id={recordingId} />}
      </div>
    </div>
  );
}

function useReplayData<T = any>(id: string, fetcher: 'consoleLogs' | 'networkRequests' | 'performance' | 'errors'): { rows: T[]; loading: boolean; error: string | null } {
  const [rows,    setRows]    = React.useState<T[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error,   setError]   = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const ph = await import('../../api/posthog');
        if (!ph.getTeamId()) await ph.bootstrapPostHog();
        const res: any = await (ph.posthog.recordingExtras as any)[fetcher](id);
        if (!cancelled) setRows(res?.results ?? res ?? []);
      } catch (e: any) { if (!cancelled) setError(e?.message ?? 'Error al cargar'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [id, fetcher]);

  return { rows, loading, error };
}

function ConsolePane({ id }: { id: string }) {
  const { rows, loading, error } = useReplayData<any>(id, 'consoleLogs');
  if (loading) return <Skeleton />;
  if (error)   return <ErrorBlock msg={error} />;
  if (!rows.length) return <Empty label="Sin mensajes de consola en esta sesión." />;
  return (
    <ul className="font-mono text-[11px] divide-y divide-[#f3f3f1]">
      {rows.map((r, i) => {
        const level = String(r.level ?? r.log_level ?? 'log').toLowerCase();
        const color = LEVEL_COLORS[level] ?? '#646462';
        return (
          <li key={i} className="px-3 py-2 flex items-start gap-2 hover:bg-[#fafaf9]">
            <span className="text-[#9ca3af]">{fmtTime(r.timestamp ?? r.created_at)}</span>
            <span className="font-bold uppercase tracking-wider" style={{ color }}>{level}</span>
            <span className="text-[#1a1a18] flex-1 break-all">{String(r.message ?? r.text ?? r.payload ?? '').slice(0, 400)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function NetworkPane({ id }: { id: string }) {
  const { rows, loading, error } = useReplayData<any>(id, 'networkRequests');
  if (loading) return <Skeleton />;
  if (error)   return <ErrorBlock msg={error} />;
  if (!rows.length) return <Empty label="Sin peticiones de red registradas." />;
  return (
    <table className="w-full text-xs">
      <thead className="bg-[#fafaf9] sticky top-0">
        <tr className="text-left text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider">
          <th className="px-3 py-2">Hora</th><th className="px-3 py-2">Método</th><th className="px-3 py-2">URL</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Tiempo</th><th className="px-3 py-2">Tamaño</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[#f3f3f1]">
        {rows.map((r, i) => {
          const status = Number(r.status_code ?? r.status ?? 0);
          const statusColor = status >= 500 ? '#dc2626' : status >= 400 ? '#f59e0b' : status >= 300 ? '#3b59f6' : '#16a34a';
          return (
            <tr key={i} className="hover:bg-[#fafaf9]">
              <td className="px-3 py-1.5 text-[#9ca3af] font-mono">{fmtTime(r.timestamp ?? r.start_time)}</td>
              <td className="px-3 py-1.5 font-medium text-[#1a1a18]">{r.method ?? r.request_method ?? 'GET'}</td>
              <td className="px-3 py-1.5 text-[#1a1a18] truncate max-w-[280px]">{r.url ?? r.name ?? '—'}</td>
              <td className="px-3 py-1.5 font-mono font-medium" style={{ color: statusColor }}>{status || '—'}</td>
              <td className="px-3 py-1.5 text-[#646462] font-mono">{fmtMs(r.duration ?? r.time_taken)}</td>
              <td className="px-3 py-1.5 text-[#646462] font-mono">{fmtBytes(r.transfer_size ?? r.response_body_size ?? r.encoded_body_size)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PerformancePane({ id }: { id: string }) {
  const { rows, loading, error } = useReplayData<any>(id, 'performance');
  if (loading) return <Skeleton />;
  if (error)   return <ErrorBlock msg={error} />;
  if (!rows.length) return <Empty label="Sin métricas de rendimiento todavía." />;
  // Aggregate web-vital-ish stats.
  const metrics: Record<string, number[]> = {};
  for (const r of rows) {
    const name = String(r.name ?? r.entry_type ?? 'unknown');
    const v    = Number(r.value ?? r.duration ?? r.start_time);
    if (!Number.isFinite(v)) continue;
    (metrics[name] ??= []).push(v);
  }
  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Object.entries(metrics).slice(0, 12).map(([k, vs]) => {
          const avg = vs.reduce((a, b) => a + b, 0) / vs.length;
          return (
            <div key={k} className="bg-[#fafaf9] rounded-lg p-3">
              <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider truncate">{k}</p>
              <p className="text-base font-bold text-[#1a1a18] mt-0.5">{fmtMs(avg)}</p>
              <p className="text-[10px] text-[#9ca3af]">{vs.length} muestras</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ErrorsPane({ id }: { id: string }) {
  const { rows, loading, error } = useReplayData<any>(id, 'errors');
  if (loading) return <Skeleton />;
  if (error)   return <ErrorBlock msg={error} />;
  if (!rows.length) return <Empty label="Sin errores en esta sesión." />;
  return (
    <ul className="divide-y divide-[#f3f3f1]">
      {rows.map((r, i) => (
        <li key={i} className="px-3 py-2.5 hover:bg-[#fafaf9]">
          <div className="flex items-start gap-2">
            <span className="w-2 h-2 rounded-full mt-1.5 bg-[#dc2626] flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#1a1a18] truncate">{r.title ?? r.exception_type ?? r.name ?? 'Error sin título'}</p>
              <p className="text-xs text-[#646462] truncate font-mono">{r.message ?? r.exception_message ?? ''}</p>
              <p className="text-[10px] text-[#9ca3af] mt-0.5">{fmtTime(r.timestamp ?? r.created_at)} · {r.url ?? r.fingerprint ?? ''}</p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

const Skeleton = () => <div className="p-4 space-y-2">{[0,1,2,3,4].map(i => <div key={i} className="h-6 bg-[#fafaf9] animate-pulse rounded" />)}</div>;
const ErrorBlock = ({ msg }: { msg: string }) => <div className="p-4 text-xs text-[#dc2626]">{msg}</div>;
const Empty = ({ label }: { label: string }) => <div className="p-6 text-center text-xs text-[#9ca3af]">{label}</div>;

export default ReplayTabs;
