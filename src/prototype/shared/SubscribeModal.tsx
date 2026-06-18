/**
 * Subscribe modal — parity with PostHog's <SubscriptionsModal/>.
 * Email + Slack digest for any insight/dashboard.
 *
 * POST /api/projects/{pid}/subscriptions/
 *   target_type: 'email' | 'slack'
 *   target_value: comma-separated emails or slack channel
 *   frequency: 'daily' | 'weekly' | 'monthly'
 *   byweekday: ['monday', …]   (for weekly)
 *   bysetpos: 1                 (for monthly: "first Monday")
 *   start_date: ISO
 *   insight: <id>  OR  dashboard: <id>
 */
import React from 'react';

interface Subscription {
  id?:           number;
  title:         string;
  target_type:   'email' | 'slack';
  target_value:  string;
  frequency:     'daily' | 'weekly' | 'monthly';
  interval:      number;
  byweekday:     string[];
  start_date:    string;
  deleted?:      boolean;
}

const DEFAULT_SUB: Subscription = {
  title:        'Resumen semanal',
  target_type:  'email',
  target_value: '',
  frequency:    'weekly',
  interval:     1,
  byweekday:    ['monday'],
  start_date:   new Date().toISOString().slice(0, 10),
};

const DAYS = [
  { k: 'monday',    l: 'Lun' },
  { k: 'tuesday',   l: 'Mar' },
  { k: 'wednesday', l: 'Mié' },
  { k: 'thursday',  l: 'Jue' },
  { k: 'friday',    l: 'Vie' },
  { k: 'saturday',  l: 'Sáb' },
  { k: 'sunday',    l: 'Dom' },
];

export function SubscribeModal({
  open, onClose, kind, id, name,
}: {
  open:    boolean;
  onClose: () => void;
  kind:    'insight' | 'dashboard';
  id:      number;
  name?:   string;
}) {
  const [list,    setList]    = React.useState<Subscription[]>([]);
  const [editing, setEditing] = React.useState<Subscription | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving,  setSaving]  = React.useState(false);

  async function load() {
    setLoading(true);
    try {
      const ph = await import('../../api/posthog');
      if (!ph.getProjectId()) await ph.bootstrapPostHog();
      const res: any = await ph.posthog.subscriptions.list({ [kind]: id } as any);
      setList(res?.results ?? []);
    } catch { setList([]); }
    finally { setLoading(false); }
  }
  React.useEffect(() => { if (open) load(); }, [open, kind, id]);

  async function save(sub: Subscription) {
    setSaving(true);
    try {
      const ph = await import('../../api/posthog');
      const payload: any = { ...sub, [kind]: id };
      if (sub.id) await ph.posthog.subscriptions.update(sub.id, payload);
      else        await ph.posthog.subscriptions.create(payload);
      setEditing(null);
      await load();
    } catch (e: any) { alert(e?.message ?? 'No se pudo guardar la suscripción'); }
    finally { setSaving(false); }
  }

  async function remove(sub: Subscription) {
    if (!sub.id) return;
    if (!confirm(`¿Eliminar la suscripción "${sub.title}"?`)) return;
    try {
      const ph = await import('../../api/posthog');
      await ph.posthog.subscriptions.delete(sub.id);
      await load();
    } catch (e: any) { alert(e?.message ?? 'No se pudo eliminar'); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-[#1a1a18]/30 z-[70] flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[560px] max-w-[92vw] max-h-[88vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#e9eae6] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#1a1a18]">Suscripciones</h2>
            {name && <p className="text-xs text-[#646462] mt-0.5 truncate max-w-[400px]">{name}</p>}
          </div>
          <button onClick={onClose} className="text-[#9ca3af] hover:text-[#1a1a18]">
            <svg viewBox="0 0 16 16" className="w-4 h-4"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {editing ? <SubForm sub={editing} onCancel={() => setEditing(null)} onSave={save} saving={saving} />
           : loading ? <div className="space-y-2">{[0,1].map(i => <div key={i} className="h-14 bg-[#fafaf9] rounded animate-pulse" />)}</div>
           : list.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm font-medium text-[#1a1a18] mb-1">Sin suscripciones</p>
              <p className="text-xs text-[#646462] mb-3 max-w-sm mx-auto">Recibe un correo o un mensaje en Slack con un resumen periódico de este recurso.</p>
            </div>
          ) : list.map(s => (
            <div key={s.id} className="border border-[#e9eae6] rounded-lg p-3 flex items-start gap-3">
              <span className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0 bg-[#eff2ff] text-[#3b59f6]">
                {s.target_type === 'slack'
                  ? <svg viewBox="0 0 16 16" className="w-4 h-4"><circle cx="4" cy="6" r="1.4"/><rect x="2.5" y="9" width="3" height="1.4" rx="0.7"/><circle cx="12" cy="10" r="1.4"/><rect x="10.5" y="5.6" width="3" height="1.4" rx="0.7"/></svg>
                  : <svg viewBox="0 0 16 16" className="w-4 h-4"><rect x="2" y="3" width="12" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4"/><path d="M2 4l6 5 6-5" stroke="currentColor" strokeWidth="1.3" fill="none"/></svg>}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#1a1a18] truncate">{s.title}</p>
                <p className="text-xs text-[#646462] truncate">{s.target_value} · {s.frequency === 'daily' ? 'diaria' : s.frequency === 'weekly' ? 'semanal' : 'mensual'}</p>
              </div>
              <button onClick={() => setEditing(s)} className="text-[#9ca3af] hover:text-[#3b59f6] p-1" title="Editar">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M11 2l3 3-9 9H2v-3z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round"/></svg>
              </button>
              <button onClick={() => remove(s)} className="text-[#9ca3af] hover:text-[#dc2626] p-1" title="Eliminar">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5"><path d="M4 5h8l-1 9H5zM6 5V3h4v2M2 5h12" stroke="currentColor" strokeWidth="1.3" fill="none"/></svg>
              </button>
            </div>
          ))}
        </div>

        {!editing && (
          <div className="px-5 py-3 border-t border-[#e9eae6] flex items-center justify-between bg-[#fafaf9]">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-[#646462] hover:text-[#1a1a18]">Cerrar</button>
            <button onClick={() => setEditing({ ...DEFAULT_SUB, title: `Resumen de ${name ?? 'este recurso'}` })} className="px-3 py-1.5 bg-[#1a1a18] text-white text-sm rounded-lg hover:bg-[#333]">+ Nueva suscripción</button>
          </div>
        )}
      </div>
    </div>
  );
}

function SubForm({ sub, onCancel, onSave, saving }: { sub: Subscription; onCancel: () => void; onSave: (s: Subscription) => void; saving: boolean }) {
  const [v, setV] = React.useState<Subscription>(sub);
  function toggle(day: string) { setV(s => ({ ...s, byweekday: s.byweekday.includes(day) ? s.byweekday.filter(d => d !== day) : [...s.byweekday, day] })); }
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1">Nombre</span>
        <input value={v.title} onChange={e => setV(s => ({ ...s, title: e.target.value }))} className="w-full px-3 py-2 border border-[#e9eae6] rounded text-sm focus:outline-none focus:border-[#3b59f6]" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1">Destino</span>
          <select value={v.target_type} onChange={e => setV(s => ({ ...s, target_type: e.target.value as any }))} className="w-full px-3 py-2 border border-[#e9eae6] rounded text-sm focus:outline-none focus:border-[#3b59f6]">
            <option value="email">Correo</option>
            <option value="slack">Slack</option>
          </select>
        </label>
        <label>
          <span className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1">Frecuencia</span>
          <select value={v.frequency} onChange={e => setV(s => ({ ...s, frequency: e.target.value as any }))} className="w-full px-3 py-2 border border-[#e9eae6] rounded text-sm focus:outline-none focus:border-[#3b59f6]">
            <option value="daily">Diaria</option>
            <option value="weekly">Semanal</option>
            <option value="monthly">Mensual</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1">{v.target_type === 'slack' ? 'Canal de Slack' : 'Destinatarios (coma-separados)'}</span>
        <input value={v.target_value} onChange={e => setV(s => ({ ...s, target_value: e.target.value }))} placeholder={v.target_type === 'slack' ? '#producto-metricas' : 'alice@empresa.com, bob@empresa.com'} className="w-full px-3 py-2 border border-[#e9eae6] rounded text-sm focus:outline-none focus:border-[#3b59f6]" />
      </label>
      {v.frequency === 'weekly' && (
        <div>
          <span className="block text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1">Días</span>
          <div className="flex gap-1">
            {DAYS.map(d => (
              <button key={d.k} type="button" onClick={() => toggle(d.k)} className={`flex-1 py-1 rounded text-xs border ${v.byweekday.includes(d.k) ? 'bg-[#eff2ff] border-[#c7d2fe] text-[#3b59f6] font-medium' : 'bg-white border-[#e9eae6] text-[#646462] hover:bg-[#fafaf9]'}`}>{d.l}</button>
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-[#646462] hover:text-[#1a1a18]">Cancelar</button>
        <button onClick={() => onSave(v)} disabled={saving || !v.target_value} className="px-3 py-1.5 bg-[#1a1a18] text-white text-sm rounded-lg hover:bg-[#333] disabled:opacity-50">{saving ? 'Guardando…' : v.id ? 'Guardar' : 'Crear'}</button>
      </div>
    </div>
  );
}

export default SubscribeModal;
