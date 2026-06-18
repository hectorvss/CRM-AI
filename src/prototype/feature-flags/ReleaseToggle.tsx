/**
 * ReleaseToggle — bigger control sobre el rollout porcentual de una flag.
 *
 * Para feature flags simples (roll-out por porcentaje en todos los usuarios),
 * añade un slider + steppers preset 0/10/25/50/100 + botón "Pausar lanzamiento"
 * que pone la flag a active=false (kill switch).
 *
 * PATCH /api/projects/{pid}/feature_flags/{id}/
 *   filters.groups[0].rollout_percentage = N
 *   active = boolean
 */
import React from 'react';

interface Flag {
  id:       number;
  key:      string;
  name?:    string;
  active:   boolean;
  filters?: { groups?: Array<{ rollout_percentage?: number; properties?: any[] }> };
}

const PRESETS = [0, 10, 25, 50, 100];

export function ReleaseToggle({ flag, onUpdated }: { flag: Flag; onUpdated: (next: Flag) => void }) {
  const g0       = flag.filters?.groups?.[0] ?? { rollout_percentage: 0 };
  const [pct,     setPct]     = React.useState(g0.rollout_percentage ?? 0);
  const [saving,  setSaving]  = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);

  React.useEffect(() => { setPct(flag.filters?.groups?.[0]?.rollout_percentage ?? 0); }, [flag]);

  async function save(nextPct: number, nextActive?: boolean) {
    setSaving(true);
    try {
      const ph = await import('../../api/posthog');
      const groups = flag.filters?.groups ?? [{ properties: [] }];
      groups[0] = { ...(groups[0] ?? {}), rollout_percentage: nextPct };
      const updated: any = await ph.posthog.featureFlags.update(flag.id, {
        filters: { ...flag.filters, groups },
        ...(typeof nextActive === 'boolean' ? { active: nextActive } : {}),
      });
      onUpdated(updated);
      setPct(updated.filters?.groups?.[0]?.rollout_percentage ?? nextPct);
    } catch (e: any) { alert(e?.message ?? 'No se pudo actualizar'); }
    finally { setSaving(false); }
  }

  return (
    <div className="bg-white border border-[#e9eae6] rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-[#1a1a18]">Lanzamiento</h3>
          <p className="text-xs text-[#646462] mt-0.5">Define qué porcentaje de tu base recibe esta flag activada.</p>
        </div>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${flag.active ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#fee2e2] text-[#991b1b]'}`}>{flag.active ? 'Activa' : 'En pausa'}</span>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <span className="text-3xl font-bold text-[#1a1a18] tabular-nums w-20">{pct}%</span>
        <input
          type="range" min={0} max={100} value={pct}
          onChange={e => setPct(Number(e.target.value))}
          onMouseUp={() => save(pct)}
          onTouchEnd={() => save(pct)}
          className="flex-1 accent-[#3b59f6]"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {PRESETS.map(p => (
          <button key={p} onClick={() => save(p)} disabled={saving} className={`px-3 py-1 rounded text-xs border ${pct === p ? 'bg-[#1a1a18] border-[#1a1a18] text-white' : 'bg-white border-[#e9eae6] text-[#646462] hover:bg-[#fafaf9]'}`}>{p}%</button>
        ))}
        <span className="ml-auto text-[10px] text-[#9ca3af] self-center">{saving && 'Guardando…'}</span>
      </div>

      <div className="pt-3 border-t border-[#e9eae6]">
        {flag.active ? (
          <button onClick={() => setConfirm(true)} className="w-full px-3 py-2 text-sm font-medium text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] rounded-lg hover:bg-[#fee2e2]">
            🛑 Pausar lanzamiento (kill switch)
          </button>
        ) : (
          <button onClick={() => save(pct, true)} className="w-full px-3 py-2 text-sm font-medium text-white bg-[#16a34a] rounded-lg hover:bg-[#15803d]">
            Reanudar lanzamiento
          </button>
        )}
      </div>

      {confirm && (
        <div className="fixed inset-0 bg-[#1a1a18]/40 z-[80] flex items-center justify-center" onClick={() => setConfirm(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-[400px] max-w-[92vw] p-5" onClick={e => e.stopPropagation()}>
            <h4 className="text-base font-bold text-[#1a1a18] mb-1">Pausar lanzamiento</h4>
            <p className="text-xs text-[#646462] mb-4">La flag dejará de evaluar a <span className="font-medium">true</span> para cualquier usuario hasta que la reanudes. El porcentaje actual ({pct}%) se mantiene.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirm(false)} className="px-3 py-1.5 text-sm text-[#646462]">Cancelar</button>
              <button onClick={() => { setConfirm(false); save(pct, false); }} className="px-3 py-1.5 bg-[#dc2626] text-white text-sm rounded-lg hover:bg-[#b91c1c]">Pausar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReleaseToggle;
