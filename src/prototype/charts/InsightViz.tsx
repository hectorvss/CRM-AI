// ─────────────────────────────────────────────────────────────────────────
// InsightViz — mirrors PostHog's frontend/src/scenes/insights/InsightContainer
// behaviour: a dispatcher that picks the right viz component based on the
// query.kind + filters.display (or queryNode.display for new-format queries).
//
// Each viz consumes PostHog's standard query response shape from
//   POST /api/projects/{tid}/query/
// All visuals are Clain-styled (LC palette, sharp 1px borders, no shadows).
// ─────────────────────────────────────────────────────────────────────────
import * as React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  TimeScale,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
  type ChartData,
} from 'chart.js';
import { Line, Bar, Pie, Doughnut } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import { WorldMap } from './WorldMap';
import { SankeyPaths } from './SankeyPaths';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  ArcElement, TimeScale, Title, Tooltip, Legend, Filler,
);

// Clain LC palette + PostHog's standard series colour rotation.
export const CLAIN_PALETTE = [
  '#3b59f6', '#e8572a', '#16a34a', '#9966cc', '#f59e0b',
  '#0ea5e9', '#dc2626', '#14b8a6', '#ec4899', '#6366f1',
  '#84cc16', '#f97316', '#06b6d4', '#a855f7', '#ef4444',
];

const COMMON_OPTIONS: ChartOptions<any> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 250 },
  interaction: { intersect: false, mode: 'index' },
  plugins: {
    legend: { display: true, position: 'bottom', labels: { boxWidth: 8, boxHeight: 8, font: { size: 11 }, color: '#646462' } },
    tooltip: {
      backgroundColor: '#1a1a18',
      titleFont: { size: 11, weight: 'bold' },
      bodyFont: { size: 11 },
      padding: 8,
      cornerRadius: 6,
      displayColors: true,
      boxWidth: 8,
      boxHeight: 8,
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: '#646462', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
      border: { color: '#e9eae6' },
    },
    y: {
      grid: { color: '#f3f3f1', drawTicks: false },
      ticks: { color: '#646462', font: { size: 10 }, padding: 6 },
      border: { display: false },
    },
  },
};

// PostHog's standard result row shape (from TrendsQuery / EventsQuery).
type SeriesRow = {
  label?: string;
  action?: { name?: string };
  data?: number[];
  labels?: string[];
  days?: string[];
  count?: number;
  aggregated_value?: number | null;
  breakdown_value?: any;
};

// ─── BoldNumber ────────────────────────────────────────────────────────────
function BoldNumber({ result, compareValue }: { result: any; compareValue?: number }) {
  const series: SeriesRow[] = result?.results ?? [];
  const num = series[0]?.aggregated_value ?? series[0]?.count ?? (series[0]?.data?.slice(-1)[0] ?? 0);
  const compare = compareValue ?? series[0]?.compare_value;
  const pct = compare != null && compare !== 0 ? ((Number(num) - Number(compare)) / Number(compare)) * 100 : null;
  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-center">
      <div className="text-[40px] font-bold text-[#1a1a18] tabular-nums leading-none">
        {Number(num ?? 0).toLocaleString('es-ES')}
      </div>
      {pct != null && (
        <div className={`mt-1 text-[11px] font-semibold ${pct >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
          {pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

// ─── LineGraph (Trends line) ───────────────────────────────────────────────
function LineGraph({ result, area = false }: { result: any; area?: boolean }) {
  const series: SeriesRow[] = result?.results ?? [];
  if (series.length === 0 || !series.some(s => (s.data?.length ?? 0) > 0)) {
    return <EmptyState/>;
  }
  const labels = series[0]?.labels ?? series[0]?.days ?? series[0]?.data?.map((_, i) => String(i + 1)) ?? [];
  const data: ChartData<'line'> = {
    labels,
    datasets: series.map((s, i) => {
      const color = CLAIN_PALETTE[i % CLAIN_PALETTE.length];
      return {
        label: s.label ?? s.action?.name ?? (s.breakdown_value != null ? String(s.breakdown_value) : `Serie ${i + 1}`),
        data: s.data ?? [],
        borderColor: color,
        backgroundColor: area ? `${color}26` : color,
        fill: area,
        tension: 0.25,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 1.8,
      };
    }),
  };
  return <Line data={data} options={COMMON_OPTIONS as ChartOptions<'line'>}/>;
}

// ─── BarGraph (Trends bar / stacked / horizontal) ─────────────────────────
function BarGraph({ result, stacked = false, horizontal = false }: { result: any; stacked?: boolean; horizontal?: boolean }) {
  const series: SeriesRow[] = result?.results ?? [];
  if (series.length === 0 || !series.some(s => (s.data?.length ?? 0) > 0)) {
    return <EmptyState/>;
  }
  const labels = series[0]?.labels ?? series[0]?.days ?? series[0]?.data?.map((_, i) => String(i + 1)) ?? [];
  const data: ChartData<'bar'> = {
    labels,
    datasets: series.map((s, i) => {
      const color = CLAIN_PALETTE[i % CLAIN_PALETTE.length];
      return {
        label: s.label ?? s.action?.name ?? `Serie ${i + 1}`,
        data: s.data ?? [],
        backgroundColor: color,
        borderColor: color,
        borderWidth: 0,
        borderRadius: 2,
      };
    }),
  };
  const opts: ChartOptions<'bar'> = {
    ...(COMMON_OPTIONS as ChartOptions<'bar'>),
    indexAxis: horizontal ? 'y' : 'x',
    scales: {
      x: { ...(COMMON_OPTIONS.scales as any).x, stacked },
      y: { ...(COMMON_OPTIONS.scales as any).y, stacked },
    },
  };
  return <Bar data={data} options={opts}/>;
}

// ─── PieGraph (Trends pie / doughnut) ──────────────────────────────────────
function PieGraph({ result, doughnut = false }: { result: any; doughnut?: boolean }) {
  const series: SeriesRow[] = result?.results ?? [];
  if (series.length === 0) return <EmptyState/>;
  const values = series.map(s => Number(s.aggregated_value ?? s.count ?? (s.data?.reduce((a, b) => a + b, 0) ?? 0)));
  const labels = series.map((s, i) => s.label ?? s.action?.name ?? (s.breakdown_value != null ? String(s.breakdown_value) : `Serie ${i + 1}`));
  const data: ChartData<'pie' | 'doughnut'> = {
    labels,
    datasets: [{
      data: values,
      backgroundColor: series.map((_, i) => CLAIN_PALETTE[i % CLAIN_PALETTE.length]),
      borderColor: '#fff',
      borderWidth: 1,
    }],
  };
  const opts: ChartOptions<any> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right', labels: { boxWidth: 8, boxHeight: 8, font: { size: 11 }, color: '#646462' } },
      tooltip: COMMON_OPTIONS.plugins!.tooltip,
    },
  };
  return doughnut ? <Doughnut data={data as ChartData<'doughnut'>} options={opts}/> : <Pie data={data as ChartData<'pie'>} options={opts}/>;
}

// ─── TableViz (Trends table) ───────────────────────────────────────────────
function TableViz({ result }: { result: any }) {
  const series: SeriesRow[] = result?.results ?? [];
  if (series.length === 0) return <EmptyState/>;
  const labels = series[0]?.labels ?? series[0]?.days ?? [];
  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-[#e9eae6] bg-[#fafaf9]">
            <th className="text-left px-2 py-1 text-[10px] font-bold text-[#646462] uppercase tracking-wide">Serie</th>
            {labels.slice(0, 14).map((l, i) => <th key={i} className="text-right px-1.5 py-1 text-[10px] text-[#646462] tabular-nums">{l}</th>)}
            <th className="text-right px-2 py-1 text-[10px] font-bold text-[#646462] uppercase tracking-wide">Total</th>
          </tr>
        </thead>
        <tbody>
          {series.slice(0, 10).map((s, i) => {
            const total = s.aggregated_value ?? (s.data?.reduce((a, b) => a + b, 0) ?? 0);
            return (
              <tr key={i} className="border-b border-[#f3f3f1] hover:bg-[#fafaf9]">
                <td className="px-2 py-1.5 text-[#1a1a18] flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: CLAIN_PALETTE[i % CLAIN_PALETTE.length] }}/>
                  <span className="truncate max-w-[140px]">{s.label ?? s.action?.name ?? `Serie ${i + 1}`}</span>
                </td>
                {(s.data ?? []).slice(0, 14).map((v, j) => <td key={j} className="text-right px-1.5 py-1 tabular-nums text-[#646462]">{Number(v ?? 0).toLocaleString('es-ES')}</td>)}
                <td className="text-right px-2 py-1.5 font-semibold tabular-nums text-[#1a1a18]">{Number(total ?? 0).toLocaleString('es-ES')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── FunnelBarChart ────────────────────────────────────────────────────────
function FunnelBarChart({ result }: { result: any }) {
  const steps: any[] = result?.results ?? [];
  if (steps.length === 0) return <EmptyState/>;
  const max = Math.max(1, ...steps.map(s => s.count ?? 0));
  return (
    <div className="h-full flex flex-col justify-center gap-2 px-1">
      {steps.slice(0, 12).map((s: any, i: number) => {
        const conv = i === 0 ? 100 : ((s.count ?? 0) / (steps[0]?.count || 1)) * 100;
        const dropoff = i === 0 ? 0 : (((steps[i - 1]?.count ?? 0) - (s.count ?? 0)) / (steps[i - 1]?.count || 1)) * 100;
        return (
          <div key={i} className="space-y-0.5">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-[#646462] w-5 text-right tabular-nums">{i + 1}.</span>
              <span className="text-[#1a1a18] flex-1 truncate font-medium">{s.name ?? s.action?.name ?? `Paso ${i + 1}`}</span>
              <span className="tabular-nums text-[#1a1a18] font-semibold">{Number(s.count ?? 0).toLocaleString('es-ES')}</span>
              <span className="tabular-nums text-[#646462] w-12 text-right">{conv.toFixed(1)}%</span>
            </div>
            <div className="flex items-center gap-2 ml-7">
              <div className="flex-1 h-3 bg-[#f3f3f1] rounded overflow-hidden">
                <div className="h-full transition-all" style={{ width: `${((s.count ?? 0) / max) * 100}%`, background: i === 0 ? '#16a34a' : '#3b59f6' }}/>
              </div>
              {i > 0 && dropoff > 0 && (
                <span className="text-[10px] text-[#dc2626] tabular-nums w-12 text-right">−{dropoff.toFixed(0)}%</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── FunnelStepsTable ──────────────────────────────────────────────────────
function FunnelStepsTable({ result }: { result: any }) {
  const steps: any[] = result?.results ?? [];
  if (steps.length === 0) return <EmptyState/>;
  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-[#e9eae6] bg-[#fafaf9]">
            <th className="text-left px-2 py-1 text-[10px] font-bold text-[#646462] uppercase tracking-wide">Paso</th>
            <th className="text-right px-2 py-1 text-[10px] font-bold text-[#646462] uppercase tracking-wide">Completaron</th>
            <th className="text-right px-2 py-1 text-[10px] font-bold text-[#646462] uppercase tracking-wide">Conversión</th>
            <th className="text-right px-2 py-1 text-[10px] font-bold text-[#646462] uppercase tracking-wide">Drop-off</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s: any, i: number) => {
            const conv = i === 0 ? 100 : ((s.count ?? 0) / (steps[0]?.count || 1)) * 100;
            const drop = i === 0 ? 0 : ((steps[i - 1]?.count ?? 0) - (s.count ?? 0));
            return (
              <tr key={i} className="border-b border-[#f3f3f1] hover:bg-[#fafaf9]">
                <td className="px-2 py-1.5 text-[#1a1a18]">{i + 1}. {s.name ?? `Paso ${i + 1}`}</td>
                <td className="text-right px-2 py-1.5 tabular-nums text-[#1a1a18]">{Number(s.count ?? 0).toLocaleString('es-ES')}</td>
                <td className="text-right px-2 py-1.5 tabular-nums text-[#16a34a]">{conv.toFixed(1)}%</td>
                <td className="text-right px-2 py-1.5 tabular-nums text-[#dc2626]">{drop > 0 ? `−${Number(drop).toLocaleString('es-ES')}` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── RetentionTable ────────────────────────────────────────────────────────
function RetentionTable({ result }: { result: any }) {
  const cohorts: any[] = result?.results ?? [];
  if (cohorts.length === 0) return <EmptyState/>;
  const periods = (cohorts[0]?.values ?? []).length;
  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-[#e9eae6] bg-[#fafaf9]">
            <th className="text-left px-2 py-1 text-[10px] font-bold text-[#646462] uppercase tracking-wide">Cohort</th>
            <th className="text-right px-2 py-1 text-[10px] font-bold text-[#646462] uppercase tracking-wide">Size</th>
            {Array.from({ length: Math.min(periods, 8) }).map((_, i) => (
              <th key={i} className="text-right px-1 py-1 text-[10px] font-bold text-[#646462] uppercase tracking-wide">W{i}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.slice(0, 10).map((c: any, i: number) => {
            const baseline = c.values?.[0]?.count || 1;
            return (
              <tr key={i} className="border-b border-[#f3f3f1]">
                <td className="px-2 py-1 text-[#1a1a18] whitespace-nowrap">{c.label ?? c.date ?? `Cohort ${i + 1}`}</td>
                <td className="text-right px-2 py-1 tabular-nums text-[#646462]">{Number(baseline).toLocaleString('es-ES')}</td>
                {(c.values ?? []).slice(0, 8).map((v: any, j: number) => {
                  const pct = v.count > 0 ? (v.count / baseline) * 100 : 0;
                  return (
                    <td key={j} className="text-right px-1 py-1 tabular-nums text-[#1a1a18] font-medium" style={{ background: pct > 0 ? `rgba(232, 87, 42, ${0.08 + Math.min(0.55, pct / 100 * 0.55)})` : '#fafaf9' }}>
                      {pct > 0 ? `${pct.toFixed(0)}%` : '–'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── EmptyState ────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-center gap-1.5 text-[#9ca3af]">
      <svg viewBox="0 0 16 16" className="w-7 h-7 fill-none stroke-current" strokeWidth="1"><path d="M2 4a1 1 0 011-1h3l2 2h5a1 1 0 011 1v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" strokeLinejoin="round"/></svg>
      <p className="text-[11px]">No matching events for this query</p>
    </div>
  );
}

// ─── InsightViz dispatcher ─────────────────────────────────────────────────
// Matches the dispatch behaviour of PostHog's frontend/src/scenes/insights/
// InsightContainer.tsx — pick the right component based on the query node
// `kind` and the `display` property (from filters or the query node itself).
export function InsightViz({ insight, result }: { insight: any; result: any }) {
  if (!result || (result.results ?? []).length === 0) return <EmptyState/>;

  // The query is either the modern `query` field (InsightVizNode wrapping
  // a TrendsQuery/FunnelsQuery/etc.) or legacy `filters` on the insight.
  const source = insight?.query?.source ?? insight?.query ?? null;
  const kind = source?.kind ?? insight?.filters?.insight ?? 'TrendsQuery';
  const display: string = source?.trendsFilter?.display
    ?? source?.funnelsFilter?.layout
    ?? insight?.filters?.display
    ?? insight?.filters?.layout
    ?? '';

  // FunnelsQuery
  if (kind === 'FunnelsQuery' || insight?.filters?.insight === 'FUNNELS') {
    if (display === 'steps' || display === 'horizontal' || !display) return <FunnelBarChart result={result}/>;
    return <FunnelStepsTable result={result}/>;
  }

  // RetentionQuery
  if (kind === 'RetentionQuery' || insight?.filters?.insight === 'RETENTION') {
    return <RetentionTable result={result}/>;
  }

  // PathsQuery → SVG Sankey-style flow viz (matches PostHog's PathsViz layout)
  if (kind === 'PathsQuery' || insight?.filters?.insight === 'PATHS') {
    return <SankeyPaths result={result}/>;
  }

  // WorldMap — special display for Trends when breaking down by country code
  if (display === 'WorldMap') {
    return <WorldMap result={result}/>;
  }

  // TrendsQuery (+ StickinessQuery + LifecycleQuery use the same shape)
  if (display === 'ActionsBarValue' || display === 'BoldNumber') {
    return <BoldNumber result={result}/>;
  }
  if (display === 'ActionsPie') {
    return <PieGraph result={result}/>;
  }
  if (display === 'ActionsBar' || display === 'ActionsStackedBar') {
    return <BarGraph result={result} stacked={display === 'ActionsStackedBar'}/>;
  }
  if (display === 'ActionsBarHorizontal') {
    return <BarGraph result={result} horizontal/>;
  }
  if (display === 'ActionsTable' || display === 'ActionsTable_value') {
    return <TableViz result={result}/>;
  }
  if (display === 'ActionsAreaGraph') {
    return <LineGraph result={result} area/>;
  }

  // Default: line graph
  return <LineGraph result={result}/>;
}
