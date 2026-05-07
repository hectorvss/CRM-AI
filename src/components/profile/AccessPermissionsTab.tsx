import React, { useEffect, useMemo, useState } from 'react';
import { iamApi } from '../../api/client';
import { PERMISSION_CATALOG } from '../../permissions/catalog';
import LoadingState from '../LoadingState';
import { DetailSection } from './sections';

type PermissionsState = {
  role: { id: string; name: string; description: string | null; is_system?: number } | null;
  permissions: string[];
  teams: Array<{ id: string; name: string }>;
};

const FALLBACK: PermissionsState = { role: null, permissions: [], teams: [] };

function groupPermissions(keys: string[]) {
  const hasWildcard = keys.includes('*');
  const granted = new Set(keys);
  const groups = new Map<string, Array<{ key: string; label: string; description: string }>>();

  // Build entries from the catalog so unknown permissions don't slip through
  // and so we can show "domain · action" labels.
  for (const entry of PERMISSION_CATALOG) {
    const isGranted = hasWildcard || granted.has(entry.key);
    if (!isGranted) continue;
    const list = groups.get(entry.domain) || [];
    list.push({ key: entry.key, label: entry.label, description: entry.description });
    groups.set(entry.domain, list);
  }

  // Catch any permission key the user has that's NOT in the catalog (e.g.
  // custom roles with niche keys). Bucket them under "Otros".
  if (!hasWildcard) {
    const known = new Set(PERMISSION_CATALOG.map(e => e.key));
    const unknown = keys.filter(k => k !== '*' && !known.has(k));
    if (unknown.length > 0) {
      groups.set('Otros', unknown.map(k => ({ key: k, label: k, description: '' })));
    }
  }

  return groups;
}

export default function AccessPermissionsTab() {
  const [state, setState] = useState<PermissionsState>(FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    iamApi.myPermissions()
      .then((data: any) => {
        if (cancelled) return;
        setState({
          role: data?.role || null,
          permissions: Array.isArray(data?.permissions) ? data.permissions : [],
          teams: Array.isArray(data?.teams) ? data.teams : [],
        });
      })
      .catch(() => { if (!cancelled) setState(FALLBACK); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const groups = useMemo(() => groupPermissions(state.permissions), [state.permissions]);
  const hasWildcard = state.permissions.includes('*');
  const totalGranted = hasWildcard ? PERMISSION_CATALOG.length : Array.from(groups.values()).reduce((acc: number, arr: any[]) => acc + arr.length, 0);
  const canImpersonate = hasWildcard || state.permissions.includes('iam.impersonate');

  if (loading) return <LoadingState title="Cargando permisos" message="Revisando tu rol y accesos" compact />;

  return (
    <div>
      {/* Mi rol */}
      <DetailSection title="Mi rol" helper="Tu rol determina qué puedes ver y hacer en este workspace.">
        <div className="py-3">
          {state.role ? (
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-[#1a1a1a] text-white text-[12px] font-semibold capitalize">
                    {String(state.role.name).replace(/_/g, ' ')}
                  </span>
                  {state.role.is_system === 1 && (
                    <span className="inline-flex items-center h-5 px-2 rounded-full bg-[#f4f4f3] border border-[#e9eae6] text-[10.5px] font-semibold text-[#646462] uppercase tracking-wide">Sistema</span>
                  )}
                </div>
                {state.role.description && (
                  <p className="text-[12.5px] text-[#646462] mt-2">{state.role.description}</p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[11px] text-[#646462] uppercase tracking-wide">Permisos</p>
                <p className="text-[20px] font-semibold text-[#1a1a1a]">{hasWildcard ? '∞' : totalGranted}</p>
              </div>
            </div>
          ) : (
            <p className="text-[12.5px] text-[#646462]">No se ha podido determinar tu rol.</p>
          )}
        </div>
      </DetailSection>

      {/* Permisos */}
      <DetailSection title="Permisos" helper={hasWildcard ? 'Tienes acceso completo (*).' : 'Permisos concedidos, agrupados por dominio.'}>
        <div className="py-3 space-y-4">
          {hasWildcard ? (
            <p className="text-[12.5px] text-[#1a1a1a]">Acceso total — puedes realizar cualquier acción en este workspace.</p>
          ) : groups.size === 0 ? (
            <p className="text-[12.5px] text-[#646462]">No tienes permisos asignados.</p>
          ) : (
            Array.from(groups.entries()).map(([domain, entries]) => (
              <div key={domain}>
                <p className="text-[11px] uppercase tracking-wide font-semibold text-[#646462] mb-2">{domain}</p>
                <div className="flex flex-wrap gap-1.5">
                  {entries.map(p => (
                    <span
                      key={p.key}
                      title={p.description || p.key}
                      className="inline-flex items-center h-6 px-2.5 rounded-full bg-[#f4f4f3] border border-[#e9eae6] text-[11.5px] font-medium text-[#1a1a1a]"
                    >
                      {p.label}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </DetailSection>

      {/* Equipos */}
      <DetailSection title="Equipos" helper="Equipos a los que perteneces dentro del workspace.">
        <div className="py-2">
          {state.teams.length === 0 ? (
            <p className="text-[12.5px] text-[#646462] py-2">No perteneces a ningún equipo todavía.</p>
          ) : (
            <ul className="divide-y divide-[#f0f0ee]">
              {state.teams.map(team => (
                <li key={team.id} className="py-3 flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#646462] text-[18px]">groups</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[#1a1a1a]">{team.name}</p>
                    <p className="text-[11.5px] text-[#646462]">Miembro</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DetailSection>

      {/* Suplantación — only if user has the right */}
      {canImpersonate && (
        <DetailSection title="Suplantación" helper="Puedes asumir la identidad de otros usuarios para depurar problemas.">
          <div className="py-3 flex items-start gap-3">
            <span className="material-symbols-outlined text-[#646462] text-[18px] mt-0.5">switch_account</span>
            <div className="flex-1">
              <p className="text-[12.5px] text-[#1a1a1a]">
                Tienes el permiso <code className="bg-[#f4f4f3] px-1 rounded">iam.impersonate</code>. Úsalo solo cuando sea estrictamente necesario para soporte.
              </p>
              <p className="text-[11.5px] text-[#646462] mt-1">
                La suplantación queda registrada en la auditoría con tu identidad como actor original.
              </p>
            </div>
          </div>
        </DetailSection>
      )}
    </div>
  );
}
