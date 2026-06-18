/**
 * Experiments — Saved Metrics CRUD + Variants/Holdouts editor.
 *
 * SavedMetricsModal:
 *   GET/POST/PATCH/DELETE /api/projects/{pid}/experiment_saved_metrics/
 * VariantsHoldoutsEditor:
 *   Edits experiment.parameters.feature_flag_variants[]
 *   and experiment.holdout (id) — paired with experimentHoldouts CRUD.
 */
import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Saved Metrics CRUD
// ─────────────────────────────────────────────────────────────────────────────

interface SavedMetric {
  id?:     number;
  name:    string;
  query:   any;
  metric_type?: 'mean' | 'funnel' | 'count';
}

export function SavedMetricsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows,    setRows]    = React.useState<SavedMetric[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<SavedMetric | null>(null);

  async function load() {
    setLoading(true);
    try {
      const ph = await import('../../api/posthog');
      if (!ph.getProjectId()) await ph.bootstrapPostHog();
      const res: any = await ph.posthog.experimentSavedMetrics.list();
      setRows(res?.results ?? []);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }
  React.useEffect(() => { if (open) load(); }, [open]);

  async function save(m: SavedMetric) {
    try {
      const ph = await import('../../api/posthog');
      if (m.id) await ph.posthog.experimentSavedMetrics.update(m.id, m);
      else      await ph.posthog.experimentSavedMetrics.create(m);
      setEditing(null);
      await load();
    } catch (e: any) { alert(e?.message ?? 'No se pudo guardar'); }
  }
  async function remove(id: number) {
    if (!confirm('¿Eliminar esta métrica guardada?')) return;
    try {
      const ph = await import('../../api/posthog');
      await ph.posthog.experimentSavedMetrics.delete(id);
      await load();
    } catch (e: any) { alert(e?.message ?? 'No se pudo eliminar'); }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-[#1a1a18]/30 z-[70] flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[600px] max-w-[92vw] max-h-[88vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#e9eae6] flex items-center justify-between">
          <h2 className="text-base font-bold text-[#1a1a18]">Métricas guardadas</h2>
          <button onClick={onClose} className="text-[#9ca3af] hover:text-[#1a1a18]">
            <svg viewBox="0 0 16 16" className="w-4 h-4"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {editing ? <MetricForm m={editing} onCancel={() => setEditing(null)} onSave={save} />
           : loading ? <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-10 bg-[#fafaf9] rounded animate-pulse" />)}</div>
           : rows.length === 0 ? <p className="text-sm text-[#9ca3af] text-center py-6">Sin métricas guardadas todavía.</p>
           : rows.map(m => (
            <div key={m.id} className="flex items-center gap-2 p-3 border border-[#e9eae6] rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#1a1a18] truncate">{m.name}</p>
                <p className="text-xs text-[#9ca3af] truncate">{m.metric_type ?? 'count'} · {m.query?.kind ?? 'TrendsQuery'}</p>
              </div>
              <button onClick={() => setEditing(m)} className="text-[#9ca3af] hover:text-[#3b59f6] p-1"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M11 2l3 3-9 9H2v-3z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg></button>
              <button onClick={() => m.id && remove(m.id)} className="text-[#9ca3af] hover:text-[#dc2626] p-1"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M4 5h8l-1 9H5zM6 5V3h4v2M2 5h12" fill="none" stroke="currentColor" strokeWidth="1.3"/></svg></button>
            </div>
          ))}
        </div>
        {!editing && (
          <div className="px-5 py-3 border-t border-[#e9eae6] flex justify-end bg-[#fafaf9]">
            <button onClick={() => setEditing({ name: '', query: { kind: 'TrendsQuery', series: [] }, metric_type: 'count' })} className="px-3 py-1.5 bg-[#1a1a18] text-white text-sm rounded-lg hover:bg-[#333]">+ Nueva métrica</button>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricForm({ m, onCancel, onSave }: { m: SavedMetric; onCancel: () => void; onSave: (m: SavedMetric) => void }) {
  const [v, setV] = React.useState<SavedMetric>(m);
  const [queryText, setQueryText] = React.useState(JSON.stringify(m.query ?? {}, null, 2));
  function commit() {
    try {
      const parsed = JSON.parse(queryText);
      onSave({ ...v, query: parsed });
    } catch { alert('Query no es JSON válido'); }
  }
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1">Nombre</span>
        <input value={v.name} onChange={e => setV(s => ({ ...s, name: e.target.value }))} className="w-full px-3 py-2 border border-[#e9eae6] rounded text-sm focus:outline-none focus:border-[#3b59f6]" />
      </label>
      <label className="block">
        <span className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1">Tipo</span>
        <select value={v.metric_type ?? 'count'} onChange={e => setV(s => ({ ...s, metric_type: e.target.value as any }))} className="w-full px-3 py-2 border border-[#e9eae6] rounded text-sm focus:outline-none focus:border-[#3b59f6]">
          <option value="count">Conteo</option>
          <option value="mean">Media</option>
          <option value="funnel">Embudo</option>
        </select>
      </label>
      <label className="block">
        <span className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1">Query (JSON)</span>
        <textarea value={queryText} onChange={e => setQueryText(e.target.value)} rows={8} className="w-full px-3 py-2 border border-[#e9eae6] rounded text-[11px] font-mono focus:outline-none focus:border-[#3b59f6]" />
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-[#646462] hover:text-[#1a1a18]">Cancelar</button>
        <button onClick={commit} disabled={!v.name} className="px-3 py-1.5 bg-[#1a1a18] text-white text-sm rounded-lg hover:bg-[#333] disabled:opacity-50">{v.id ? 'Guardar' : 'Crear'}</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Variants & Holdouts editor (inline inside Experiment detail)
// ─────────────────────────────────────────────────────────────────────────────

interface Variant { key: string; rollout_percentage: number; }
interface Holdout { id: number; name: string; filters?: any; }

export function VariantsHoldoutsEditor({
  variants, onVariantsChange, holdoutId, onHoldoutChange,
}: {
  variants:        Variant[];
  onVariantsChange:(v: Variant[]) => void;
  holdoutId?:      number | null;
  onHoldoutChange?:(id: number | null) => void;
}) {
  const [holdouts, setHoldouts] = React.useState<Holdout[]>([]);

  React.useEffect(() => {
    (async () => {
      try {
        const ph = await import('../../api/posthog');
        if (!ph.getProjectId()) await ph.bootstrapPostHog();
        const res: any = await ph.posthog.experimentHoldouts.list();
        setHoldouts(res?.results ?? []);
      } catch { setHoldouts([]); }
    })();
  }, []);

  function totalPct() { return variants.reduce((s, v) => s + (v.rollout_percentage || 0), 0); }
  function rebalance() {
    const each = Math.floor(100 / variants.length);
    const rem  = 100 - each * variants.length;
    onVariantsChange(variants.map((v, i) => ({ ...v, rollout_percentage: each + (i === 0 ? rem : 0) })));
  }
  function add() {
    const k = `variant_${variants.length}`;
    onVariantsChange([...variants, { key: k, rollout_percentage: 0 }]);
  }
  function remove(i: number) {
    onVariantsChange(variants.filter((_, idx) => idx !== i));
  }
  function patch(i: number, p: Partial<Variant>) {
    onVariantsChange(variants.map((v, idx) => idx === i ? { ...v, ...p } : v));
  }

  return (
    <div className="bg-white border border-[#e9eae6] rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#1a1a18]">Variantes</h3>
        <div className="flex items-center gap-2 text-xs">
          <span className={`font-mono ${totalPct() === 100 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>{totalPct()}%</span>
          <button onClick={rebalance} className="text-[#3b59f6] hover:underline">Reequilibrar</button>
        </div>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider">
            <th className="py-1 pr-2">Clave</th><th className="py-1 pr-2 w-24">Porcentaje</th><th className="w-8"></th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v, i) => (
            <tr key={i} className="border-t border-[#f3f3f1]">
              <td className="py-1.5 pr-2"><input value={v.key} onChange={e => patch(i, { key: e.target.value })} className="w-full px-2 py-1 border border-[#e9eae6] rounded text-sm focus:outline-none focus:border-[#3b59f6]" /></td>
              <td className="py-1.5 pr-2"><input type="number" min={0} max={100} value={v.rollout_percentage} onChange={e => patch(i, { rollout_percentage: Number(e.target.value) })} className="w-20 px-2 py-1 border border-[#e9eae6] rounded text-sm focus:outline-none focus:border-[#3b59f6]" /></td>
              <td className="py-1.5"><button onClick={() => remove(i)} className="text-[#9ca3af] hover:text-[#dc2626]"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={add} className="text-xs text-[#3b59f6] hover:underline">+ Añadir variante</button>

      {onHoldoutChange && (
        <div className="pt-3 border-t border-[#e9eae6]">
          <label className="block">
            <span className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1">Holdout (opcional)</span>
            <select value={holdoutId ?? ''} onChange={e => onHoldoutChange(e.target.value ? Number(e.target.value) : null)} className="w-full px-3 py-2 border border-[#e9eae6] rounded text-sm focus:outline-none focus:border-[#3b59f6]">
              <option value="">Sin holdout</option>
              {holdouts.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
            <p className="text-[10px] text-[#9ca3af] mt-1">Un holdout reserva un % de usuarios fuera del experimento como grupo de control puro.</p>
          </label>
        </div>
      )}
    </div>
  );
}

export default { SavedMetricsModal, VariantsHoldoutsEditor };
