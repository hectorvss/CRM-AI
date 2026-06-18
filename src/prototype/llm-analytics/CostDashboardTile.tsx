/**
 * CostDashboardTile — coste agregado de LLM, breakdown por modelo y por usuario.
 *
 * POST /api/environments/{tid}/query/ con TrendsQuery sobre $ai_generation:
 *   - sum($ai_cost_usd)        → coste total
 *   - sum($ai_total_tokens)    → tokens
 *   breakdown: $ai_model
 *
 * Se monta en cualquier dashboard / Home de LLM Analytics.
 */
import React from 'react';

const COLORS = ['#3b59f6', '#e8572a', '#16a34a', '#a855f7', '#f59e0b', '#06b6d4', '#dc2626'];

function fmtUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  if (v >= 1)    return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}
function fmtTokens(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return String(Math.round(v));
}

export function CostDashboardTile({ dateFrom = '-30d', dateTo = null as string | null, compact = false }: { dateFrom?: string; dateTo?: string | null; compact?: boolean }) {
  const [series,    setSeries]    = React.useState<{ model: string; cost: number; tokens: number; color: string }[]>([]);
  const [totalCost, setTotalCost] = React.useState<number | null>(null);
  const [totalTok,  setTotalTok]  = React.useState<number | null>(null);
  const [loading,   setLoading]   = React.useState(true);
  const [error,     setError]     = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const ph = await import('../../api/posthog');
        if (!ph.getTeamId()) await ph.bootstrapPostHog();
        const res: any = await ph.posthog.llmCost.summary({ dateRange: { date_from: dateFrom, date_to: dateTo } });
        if (cancelled) return;
        const buckets: Record<string, { cost: number; tokens: number }> = {};
        for (const s of (res?.results ?? [])) {
          const model = String(s.breakdown_value ?? s.label ?? 'desconocido');
          const sum   = Array.isArray(s.data) ? s.data.reduce((a: number, b: number) => a + (Number(b) || 0), 0) : Number(s.aggregated_value ?? 0);
          if (!buckets[model]) buckets[model] = { cost: 0, tokens: 0 };
          if (s.action?.name === 'Cost (USD)' || /cost/i.test(s.label || '')) buckets[model].cost += sum;
          else buckets[model].tokens += sum;
        }
        const arr = Object.entries(buckets).map(([model, v], i) => ({ model, cost: v.cost, tokens: v.tokens, color: COLORS[i % COLORS.length] }));
        arr.sort((a, b) => b.cost - a.cost);
        setSeries(arr);
        setTotalCost(arr.reduce((s, x) => s + x.cost, 0));
        setTotalTok(arr.reduce((s, x) => s + x.tokens, 0));
      } catch (e: any) { if (!cancelled) setError(e?.message ?? 'Error al cargar coste'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [dateFrom, dateTo]);

  if (loading) return <div className={`bg-white border border-[#e9eae6] rounded-xl ${compact ? 'h-32' : 'h-72'} animate-pulse`} />;
  if (error)   return <div className="bg-white border border-[#fecaca] rounded-xl p-4 text-xs text-[#dc2626]">{error}</div>;

  return (
    <div className="bg-white border border-[#e9eae6] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#e9eae6] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#1a1a18]">Coste de LLM</h3>
        <span className="text-[10px] text-[#9ca3af]">{dateFrom}</span>
      </div>
      <div className="p-4 grid grid-cols-2 gap-3">
        <div className="bg-[#fafaf9] rounded-lg p-3">
          <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider">Coste total</p>
          <p className="text-2xl font-bold text-[#1a1a18] mt-0.5">{fmtUsd(totalCost)}</p>
        </div>
        <div className="bg-[#fafaf9] rounded-lg p-3">
          <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider">Tokens</p>
          <p className="text-2xl font-bold text-[#1a1a18] mt-0.5">{fmtTokens(totalTok)}</p>
        </div>
      </div>
      {!compact && (
        <div className="px-4 pb-4 space-y-1.5">
          <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wider mb-1">Por modelo</p>
          {series.length === 0 ? (
            <p className="text-xs text-[#9ca3af]">Sin eventos `$ai_generation` en el rango.</p>
          ) : series.slice(0, 8).map(s => {
            const pct = totalCost ? (s.cost / totalCost) * 100 : 0;
            return (
              <div key={s.model} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate text-[#1a1a18]">{s.model}</span>
                    <span className="text-[#646462] font-mono">{fmtUsd(s.cost)}</span>
                  </div>
                  <div className="h-1.5 bg-[#f3f3f1] rounded mt-1 overflow-hidden">
                    <div className="h-full rounded" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default CostDashboardTile;
