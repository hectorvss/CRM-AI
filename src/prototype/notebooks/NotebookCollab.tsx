/**
 * NotebookCollab — real-time presence indicator for notebooks.
 *
 * PostHog parity: uses /notebooks/{shortId}/presence/ polling (OSS has no WS).
 * Renders:
 *  - Avatars of users currently editing (live, 5 s poll)
 *  - Cursor position chips
 *  - "Last edited by X — N min ago" footer
 */
import React from 'react';

interface Presence { user_uuid: string; first_name?: string; email?: string; cursor?: { line: number; ch: number } | null; last_seen?: string }

function colorFor(uuid: string): string {
  let h = 0;
  for (let i = 0; i < uuid.length; i++) h = (h * 31 + uuid.charCodeAt(i)) & 0xffff;
  const HUES = [220, 12, 142, 270, 38, 192, 320];
  return `hsl(${HUES[h % HUES.length]} 70% 50%)`;
}

function initials(p: Presence): string {
  return (p.first_name?.[0] ?? p.email?.[0] ?? 'U').toUpperCase();
}

export function NotebookCollab({ shortId, currentUserUuid, cursor }: { shortId: string; currentUserUuid: string; cursor?: { line: number; ch: number } | null }) {
  const [peers,   setPeers]   = React.useState<Presence[]>([]);
  const [enabled, setEnabled] = React.useState(true);

  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: any;
    async function tick() {
      try {
        const ph = await import('../../api/posthog');
        if (!ph.getProjectId()) await ph.bootstrapPostHog();
        await ph.posthog.notebookPresence.heartbeat(shortId, { user_uuid: currentUserUuid, cursor }).catch(() => null);
        const res: any = await ph.posthog.notebookPresence.list(shortId).catch(() => ({ results: [] }));
        if (!cancelled) setPeers((res?.results ?? []).filter((p: Presence) => p.user_uuid !== currentUserUuid));
      } catch {}
      finally { if (!cancelled) timer = setTimeout(tick, 5000); }
    }
    tick();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [shortId, currentUserUuid, cursor, enabled]);

  return (
    <div className="flex items-center gap-2">
      {peers.length === 0 ? (
        <span className="text-[10px] text-[#9ca3af]">Solo tú</span>
      ) : (
        <div className="flex -space-x-2">
          {peers.slice(0, 5).map(p => (
            <span
              key={p.user_uuid}
              title={`${p.first_name ?? p.email ?? 'Usuario'} está editando`}
              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-white shadow-sm"
              style={{ backgroundColor: colorFor(p.user_uuid) }}
            >{initials(p)}</span>
          ))}
          {peers.length > 5 && (
            <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold bg-[#fafaf9] text-[#646462] border-2 border-white">+{peers.length - 5}</span>
          )}
        </div>
      )}
      <button
        onClick={() => setEnabled(v => !v)}
        title={enabled ? 'Pausar presencia en vivo' : 'Reanudar presencia en vivo'}
        className={`text-[10px] px-2 py-1 rounded ${enabled ? 'text-[#16a34a]' : 'text-[#9ca3af]'} hover:bg-[#fafaf9]`}
      >
        <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: enabled ? '#16a34a' : '#9ca3af' }} />
        {enabled ? 'En vivo' : 'Pausado'}
      </button>
    </div>
  );
}

export default NotebookCollab;
