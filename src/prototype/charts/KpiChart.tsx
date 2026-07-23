// ─────────────────────────────────────────────────────────────────────────────
// KpiChart — the single, shared KPI/chart rendering library for Informes.
//
// Every KPI and family of KPIs renders through these primitives so the whole
// Reports area shares ONE engine (Chart.js v4 / react-chartjs-2), ONE palette
// (CLAIN_PALETTE) and ONE theme. Design follows the dataviz guidance: fixed
// categorical order (never cycled hue-by-rank beyond the palette), one axis,
// thin marks, a legend for ≥2 series, recessive grid/axes, tooltips on by
// default. Cards degrade to an Intercom-style "sin datos" empty state.
// ─────────────────────────────────────────────────────────────────────────────
import { type ReactNode } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, TimeScale,
  PointElement, LineElement, BarElement, ArcElement,
  Tooltip, Legend, Filler,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import type { ChartOptions } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { CLAIN_PALETTE } from './InsightViz';

// Idempotent — safe even if InsightViz already registered these.
ChartJS.register(
  CategoryScale, LinearScale, TimeScale,
  PointElement, LineElement, BarElement, ArcElement,
  Tooltip, Legend, Filler,
);

export { CLAIN_PALETTE };
export const kpiColor = (i: number) => CLAIN_PALETTE[i % CLAIN_PALETTE.length];

const GRID = '#f1f1ee';
const AXIS = '#9a9a97';

// Shared theme — recessive axes/grid, bottom legend, dark tooltip.
const BASE_OPTIONS: ChartOptions<any> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 250 },
  interaction: { intersect: false, mode: 'index' },
  plugins: {
    legend: {
      display: true, position: 'bottom',
      labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'circle', font: { size: 11 }, color: '#646462', padding: 14 },
    },
    tooltip: {
      backgroundColor: '#1a1a18', titleFont: { size: 11, weight: 'bold' }, bodyFont: { size: 11 },
      padding: 8, cornerRadius: 6, displayColors: true, boxWidth: 8, boxHeight: 8, usePointStyle: true,
    },
  },
  scales: {
    x: { grid: { display: false }, border: { color: GRID }, ticks: { font: { size: 10.5 }, color: AXIS, maxRotation: 0, autoSkipPadding: 16 } },
    y: { beginAtZero: true, grid: { color: GRID }, border: { display: false }, ticks: { font: { size: 10.5 }, color: AXIS, precision: 0, maxTicksLimit: 5 } },
  },
};

export interface KpiSeries {
  label: string;
  data: number[];
  /** Optional explicit colour; defaults to the palette by index. */
  color?: string;
  fill?: boolean;
}

// ── Section header (family title, e.g. "Rendimiento de Fin AI Agent") ─────────
export function KpiSectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1 mb-3 mt-1">
      <h2 className="text-[15px] font-bold text-[#1a1a1a]">{title}</h2>
      {right}
    </div>
  );
}

// ── Empty state — mirrors Intercom's "Este gráfico no tiene datos" ────────────
export function KpiEmpty({ text = 'Este gráfico no tiene datos', hint = 'Para ver los datos aquí, cambia los filtros de informe o los ajustes de este gráfico' }: { text?: string; hint?: string }) {
  return (
    <div className="flex-1 min-h-[160px] flex flex-col items-center justify-center text-center px-6 py-8">
      <svg viewBox="0 0 16 16" className="w-7 h-7 fill-[#c9c9c5] mb-2"><path d="M2 13V9h2.5v4H2zm3.5 0V6.5H8V13H5.5zm3.5 0V4h2.5v9H9zm3.5 0V7.5H15V13h-2.5z"/></svg>
      <p className="text-[13px] font-medium text-[#646462]">{text}</p>
      {hint && <p className="text-[12px] text-[#9a9a97] max-w-[360px] mt-1 leading-[16px]">{hint}</p>}
    </div>
  );
}

// ── Card shell — a titled chart/KPI container with an info dot ────────────────
export function KpiChartCard({ title, info = true, className = '', height = 260, children }: {
  title: string; info?: boolean; className?: string; height?: number; children: ReactNode;
}) {
  return (
    <div className={`bg-white border border-[#e9eae6] rounded-[12px] p-4 flex flex-col ${className}`}>
      <div className="flex items-center gap-1.5 mb-2">
        {info && <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#1a1a1a] flex-shrink-0"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM7.25 6.75h1.5V11h-1.5V6.75zM8 4a.9.9 0 110 1.8A.9.9 0 018 4z"/></svg>}
        <h3 className="text-[13.5px] font-semibold text-[#1a1a1a]">{title}</h3>
      </div>
      <div className="flex-1 min-h-0" style={{ minHeight: height }}>{children}</div>
    </div>
  );
}

// ── KPI stat tile — the "BoldNumber" (label + big value + delta) ──────────────
export function KpiCard({ label, value, change, trend, sub, info = true }: {
  label: string; value: ReactNode; change?: string; trend?: 'up' | 'down' | 'flat' | string; sub?: string; info?: boolean;
}) {
  const deltaColor = trend === 'up' ? 'text-[#16a34a]' : trend === 'down' ? 'text-[#dc2626]' : 'text-[#646462]';
  const arrow = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '';
  return (
    <div className="bg-white border border-[#e9eae6] rounded-[12px] p-5 flex flex-col">
      <div className="flex items-center gap-1.5 mb-3">
        {info && <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#1a1a1a] flex-shrink-0"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM7.25 6.75h1.5V11h-1.5V6.75zM8 4a.9.9 0 110 1.8A.9.9 0 018 4z"/></svg>}
        <span className="text-[13px] font-medium text-[#646462] leading-[17px]">{label}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-[30px] font-bold text-[#1a1a1a] leading-none tracking-[-0.5px]">{value}</span>
        {change && <span className={`text-[12.5px] font-semibold mb-1 ${deltaColor}`}>{arrow} {change}</span>}
      </div>
      {sub && <span className="text-[12px] text-[#9a9a97] mt-1.5">{sub}</span>}
    </div>
  );
}

// ── Time-series (line or bar) — the workhorse chart ──────────────────────────
export function KpiTimeSeries({ labels, series, type = 'line', stacked = false, showLegend }: {
  labels: (string | number)[];
  series: KpiSeries[];
  type?: 'line' | 'bar';
  stacked?: boolean;
  showLegend?: boolean;
}) {
  const legend = showLegend ?? series.length >= 2;
  const datasets = series.map((s, i) => {
    const c = s.color ?? kpiColor(i);
    if (type === 'bar') {
      return { label: s.label, data: s.data, backgroundColor: c, borderColor: c, borderRadius: 4, borderSkipped: false, maxBarThickness: 34 };
    }
    return {
      label: s.label, data: s.data,
      borderColor: c, backgroundColor: s.fill ? `${c}22` : c,
      borderWidth: 2, tension: 0.25, pointRadius: 2.5, pointHoverRadius: 4,
      pointBackgroundColor: c, fill: !!s.fill,
    };
  });
  const options: ChartOptions<any> = {
    ...BASE_OPTIONS,
    plugins: { ...BASE_OPTIONS.plugins, legend: { ...(BASE_OPTIONS.plugins as any).legend, display: legend } },
    scales: {
      x: { ...(BASE_OPTIONS.scales as any).x, stacked },
      y: { ...(BASE_OPTIONS.scales as any).y, stacked },
    },
  };
  const data = { labels, datasets };
  return type === 'bar'
    ? <Bar data={data as any} options={options} />
    : <Line data={data as any} options={options} />;
}

// ── Distribution — a horizontal segmented bar ("Cómo manejas las conversaciones") ─
export function KpiDistributionBar({ segments }: { segments: { label: string; value: number; color?: string }[] }) {
  const total = segments.reduce((a, s) => a + (s.value || 0), 0) || 1;
  return (
    <div className="flex flex-col gap-3 py-2">
      <div className="flex w-full h-9 rounded-lg overflow-hidden gap-0.5 bg-[#f3f3f1]">
        {segments.map((s, i) => (
          <div key={s.label} className="h-full flex items-center justify-center" style={{ width: `${((s.value || 0) / total) * 100}%`, background: s.color ?? kpiColor(i), minWidth: s.value ? 3 : 0 }}>
            {(s.value / total) > 0.12 && <span className="text-[11px] font-semibold text-white px-1 truncate">{Math.round((s.value / total) * 100)}%</span>}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s, i) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color ?? kpiColor(i) }} />
            <span className="text-[12px] text-[#646462]">{s.label}</span>
            <span className="text-[12px] font-semibold text-[#1a1a1a]">{s.value} ({Math.round((s.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Doughnut — reasons / breakdowns ──────────────────────────────────────────
export function KpiDoughnut({ labels, values }: { labels: string[]; values: number[] }) {
  const data = {
    labels,
    datasets: [{ data: values, backgroundColor: values.map((_, i) => kpiColor(i)), borderColor: '#fff', borderWidth: 2 }],
  };
  const options: ChartOptions<any> = {
    responsive: true, maintainAspectRatio: false, cutout: '62%',
    plugins: {
      legend: { position: 'right', labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'circle', font: { size: 11 }, color: '#646462', padding: 12 } },
      tooltip: (BASE_OPTIONS.plugins as any).tooltip,
    },
  };
  return <Doughnut data={data as any} options={options} />;
}
