import React, { useEffect, useMemo, useState } from 'react';
import { iamApi } from '../../api/client';
import LoadingState from '../LoadingState';
import { NavigateInput } from '../../types';

type Props = {
  onNavigate?: (target: NavigateInput) => void;
};

const FILTERS: Array<{ id: string; label: string; match: (type: string) => boolean }> = [
  { id: 'all',       label: 'Todo',      match: () => true },
  { id: 'auth',      label: 'Auth',      match: t => t.startsWith('auth.') },
  { id: 'edits',     label: 'Edits',     match: t => t.startsWith('profile.') || t.includes('.update') || t.includes('.created') || t.includes('.deleted') },
  { id: 'workflows', label: 'Workflows', match: t => t.startsWith('workflow') },
  { id: 'ia',        label: 'IA',        match: t => t.startsWith('agent') || t.startsWith('ai.') || t.includes('agent') },
];

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Inicio de sesión',
  'auth.logout': 'Cierre de sesión',
  'auth.password_changed': 'Contraseña actualizada',
  'auth.session_revoked': 'Sesión revocada',
  'profile.avatar_updated': 'Avatar actualizado',
  'profile.updated': 'Perfil actualizado',
};

const ICON_FOR: Record<string, string> = {
  auth: 'login',
  profile: 'person',
  workflow: 'account_tree',
  agent: 'smart_toy',
  ai: 'smart_toy',
  default: 'history',
};

function relTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return String(iso);
  const diff = Date.now() - d;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'Hace unos segundos';
  const min = Math.floor(sec / 60);
  if (min < 60) return `Hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Hace ${hr} h`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `Hace ${days} d`;
  return new Date(iso).toLocaleDateString();
}

function fullTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

function pickIcon(type: string): string {
  const key = (type || '').split('.')[0];
  return ICON_FOR[key] || ICON_FOR.default;
}

function describe(ev: any): string {
  const t = ev?.type || '';
  if (ACTION_LABELS[t]) return ACTION_LABELS[t];
  if (ev?.message) return ev.message;
  return t || 'Evento';
}

export default function ActivityTab({ onNavigate: _onNavigate }: Props) {
  const [limit, setLimit] = useState(50);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    iamApi.myActivity(limit)
      .then(rows => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setItems(list);
        setHasMore(list.length >= limit);
      })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [limit]);

  const matcher = useMemo(() => FILTERS.find(f => f.id === filter)?.match || (() => true), [filter]);
  const visible = useMemo(() => items.filter((e: any) => matcher(String(e.type || ''))), [items, matcher]);

  return (
    <div>
      {/* Filter pills */}
      <div className="px-6 pt-4 pb-2 flex flex-wrap gap-2 border-b border-[#e9eae6]">
        {FILTERS.map(f => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`h-7 px-3 rounded-full text-[12px] font-medium transition-colors ${
                active ? 'bg-[#1a1a1a] text-white' : 'bg-[#f4f4f3] text-[#1a1a1a] hover:bg-[#ebebe9]'
              }`}
            >
              {f.label}
            </button>
          );
        })}
        <span className="ml-auto text-[11.5px] text-[#646462] self-center">
          {visible.length} de {items.length} eventos
        </span>
      </div>

      {/* Timeline */}
      <div className="px-6 py-4">
        {loading && items.length === 0 ? (
          <LoadingState title="Cargando actividad" message="Revisando tu historial" compact />
        ) : visible.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-[13px] text-[#646462]">No hay eventos para este filtro.</p>
          </div>
        ) : (
          <div className="relative pl-6">
            {/* vertical line */}
            <span className="absolute left-2 top-1 bottom-1 w-px bg-[#e9eae6]" aria-hidden="true" />
            <ul className="space-y-3">
              {visible.map((ev: any, idx: number) => (
                <li key={ev.id || idx} className="relative">
                  {/* dot */}
                  <span className="absolute -left-[18px] top-2.5 w-2.5 h-2.5 rounded-full bg-white border-2 border-[#1a1a1a]" aria-hidden="true" />
                  <div className="rounded-[12px] border border-[#e9eae6] bg-white px-4 py-3 hover:bg-[#f8f8f7] transition-colors">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined text-[#646462] text-[18px] mt-0.5">{pickIcon(String(ev.type || ''))}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[13px] font-medium text-[#1a1a1a]">{describe(ev)}</p>
                          <span className="inline-flex items-center h-5 px-2 rounded-full bg-[#f4f4f3] border border-[#e9eae6] text-[10.5px] font-semibold text-[#1a1a1a] uppercase tracking-wide">
                            {(String(ev.type || '').split('.')[0]) || 'event'}
                          </span>
                        </div>
                        {ev.target && (
                          <p className="text-[11.5px] text-[#646462] mt-0.5 truncate">{ev.target}</p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[11.5px] text-[#1a1a1a]">{relTime(ev.created_at)}</p>
                        <p className="text-[10.5px] text-[#646462]">{fullTime(ev.created_at)}</p>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {hasMore && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => setLimit(l => l + 50)}
              disabled={loading}
              className="h-9 px-4 rounded-md border border-[#e9eae6] text-[12.5px] font-medium hover:bg-[#f8f8f7] disabled:opacity-50"
            >
              {loading ? 'Cargando…' : 'Cargar más'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
