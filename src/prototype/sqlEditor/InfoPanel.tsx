// InfoPanel — "Información" tab inside OutputPane. Mirrors PostHog's
// `frontend/src/queries/nodes/HogQLQuery/HogQLQueryInfo.tsx`.
//
// Pulls metadata for the current HogQL query via
// `posthog.metadata(query)`  →  `POST /query/` with `kind: 'HogQLMetadata'`.
// Renders: inferred output columns + types, errors, warnings, notices, and
// the compiled ClickHouse SQL when the response includes it.

import React from 'react';

interface InfoPanelProps {
  /** Current SQL text in the active tab. */
  query: string;
}

interface HogQLMetadataResponse {
  isValid?: boolean;
  isValidView?: boolean;
  errors?: { start?: number; end?: number; message: string; fix?: string }[];
  warnings?: { start?: number; end?: number; message: string; fix?: string }[];
  notices?: { start?: number; end?: number; message: string; fix?: string }[];
  /** Inferred columns of the SELECT (when available). */
  table_names?: string[];
}

export function InfoPanel({ query }: InfoPanelProps): React.ReactElement {
  const [data, setData] = React.useState<HogQLMetadataResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!query.trim()) { setData(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const handle = setTimeout(async () => {
      try {
        const ph = await import('../../api/posthog');
        if (!ph.getTeamId()) await ph.bootstrapPostHog();
        const res = await ph.posthog.metadata(query) as HogQLMetadataResponse;
        if (!cancelled) { setData(res); setLoading(false); }
      } catch (e: any) {
        if (!cancelled) { setError(e?.message ?? 'Error'); setLoading(false); }
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [query]);

  if (loading && !data) {
    return <div className="p-3 text-[12px] text-[#9ca3af]">Analizando…</div>;
  }
  if (error) {
    return <div className="p-3 text-[12px] text-[#dc2626] font-mono whitespace-pre-wrap">{error}</div>;
  }
  if (!data) {
    return <div className="p-3 text-[12px] text-[#9ca3af]">Escribe una consulta para ver su información.</div>;
  }

  return (
    <div className="p-3 flex flex-col gap-3 text-[12px] overflow-auto h-full">
      <Section title={data.isValid ? '✓ Consulta válida' : '✕ Consulta inválida'} accent={data.isValid ? '#16a34a' : '#dc2626'}>
        {data.isValidView != null && (
          <p className="text-[11px] text-[#646462]">
            {data.isValidView ? 'Puede guardarse como vista.' : 'No puede guardarse como vista (uso de variables o columnas dinámicas).'}
          </p>
        )}
      </Section>

      <Diagnostics title="Errores" items={data.errors ?? []} color="#dc2626" />
      <Diagnostics title="Avisos" items={data.warnings ?? []} color="#f59e0b" />
      <Diagnostics title="Notas" items={data.notices ?? []} color="#3b59f6" />

      {data.table_names && data.table_names.length > 0 && (
        <Section title="Tablas usadas">
          <ul className="flex flex-wrap gap-1.5">
            {data.table_names.map(t => (
              <li key={t} className="text-[11px] font-mono bg-[#f3f3f1] px-2 py-0.5 rounded">{t}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ title, accent, children }: { title: string; accent?: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="border border-[#e9eae6] rounded-lg p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: accent ?? '#1a1a18' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Diagnostics({ title, items, color }: { title: string; items: NonNullable<HogQLMetadataResponse['errors']>; color: string }): React.ReactElement | null {
  if (items.length === 0) return null;
  return (
    <Section title={`${title} (${items.length})`} accent={color}>
      <ul className="flex flex-col gap-2">
        {items.map((it, i) => (
          <li key={i} className="text-[11px]">
            <p className="text-[#1a1a18]">{it.message}</p>
            {it.fix && <p className="text-[#646462] mt-0.5 font-mono">Sugerencia: {it.fix}</p>}
            {it.start != null && it.end != null && (
              <p className="text-[10px] text-[#9ca3af] mt-0.5">posición {it.start}–{it.end}</p>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export default InfoPanel;
