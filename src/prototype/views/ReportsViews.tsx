// ─────────────────────────────────────────────────────────────────────────────
// Reports views
// Extracted from the monolithic Prototype.tsx (auto-split, behavior-preserving).
// ─────────────────────────────────────────────────────────────────────────────

import { useApi } from '../../api/hooks';
import { casesApi, reportsApi } from '../../api/client';
import { useRef, useState, memo, type ReactNode, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { Dropdown, KnowledgePlaceholder, TrialBanner } from '../sharedUi';
import { KpiCard, KpiChartCard, KpiEmpty, KpiSectionHeader, KpiTimeSeries, KpiDistributionBar, KpiDoughnut, KpiHeatmap, KpiTable } from '../charts/KpiChart';


// ─────────────────────────────────────────────────────────────────────────────
// REPORTS VIEW (Figma nodes 1:32668, 1:34178, 1:42451, 2:10327, 3:11829,
// 3:14199, 3:16295, 3:20010, 3:22346, 3:24515, 3:26772, 4:16934, 4:19011,
// 4:22197, 4:24401, 4:26962, 4:28809)
// ─────────────────────────────────────────────────────────────────────────────

type ReportsSubView =
  | 'overview' | 'aiResumen' | 'areasNegocio' | 'agentesPerf' | 'aprobacionesRisk' | 'costesRoi'
  | 'todos' | 'misInformes' | 'compartidos' | 'favoritos' | 'cxScore' | 'emailDeliv'
  | 'temas' | 'sugerencias' | 'export' | 'horarios'
  | 'finAgent' | 'copilot'
  | 'calls' | 'conversations' | 'csat' | 'effectiveness'
  | 'responsiveness' | 'slas' | 'teamInbox' | 'teammate' | 'tickets'
  | 'articles' | 'outboundEng' | 'administrar'
  | 'workflows' | 'workflowsLeadGen' | 'leads' | 'monitors';

type ReportsItemIcon = 'topic' | 'export' | 'schedule' | 'folder' | 'admin'
  | 'lightbulb' | 'sparkles' | 'fin' | 'copilot' | 'phone' | 'chat' | 'star'
  | 'zap' | 'clock' | 'sla' | 'inbox' | 'user' | 'ticket' | 'doc' | 'globe'
  | 'chart' | 'ai' | 'area' | 'robot' | 'approve' | 'coin'
  | 'grid' | 'heart' | 'aiInfo';

type ReportsNavGroup = {
  key?: ReportsSubView;
  label: string;
  icon?: ReportsItemIcon;
  items?: { key: ReportsSubView; label: string; icon?: ReportsItemIcon }[];
};

// ── Reports Analysis helpers ──────────────────────────────────────────────────
function rsparkPath(vals: number[]): string {
  if (vals.length < 2) return 'M0,20 L100,20';
  const max = Math.max(...vals, 1), min = Math.min(...vals, 0), rng = max - min || 1;
  return vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (vals.length - 1)) * 100).toFixed(1)},${(20 - ((v - min) / rng) * 17).toFixed(1)}`).join(' ');
}
function rsparkArea(vals: number[]): string { return `${rsparkPath(vals)} L100,22 L0,22 Z`; }
function rsparkDerive(valueStr: string | number, trend: string, idx: number): number[] {
  const base = Math.max(parseFloat(String(valueStr).replace(/[^0-9.]/g, '')) || 10, 1);
  const dir = trend === 'up' ? 1 : trend === 'down' ? -1 : 0;
  return Array.from({ length: 8 }, (_, i) => Math.max(0, base + dir * base * 0.18 * (i / 7) + ((idx + i) % 3) * base * 0.03));
}
function ReportsAnalysisKpiCard({ label, value, change, trend, sub }: { label: string; value: string; change?: string; trend?: string; sub?: string; idx?: number }) {
  const deltaColor = trend === 'up' ? 'text-[#16a34a]' : trend === 'down' ? 'text-[#dc2626]' : 'text-[#646462]';
  const deltaArrow = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '';
  return (
    <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5">
      <div className="flex items-center gap-1 mb-3">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
        <span className="text-[12.5px] text-[#1a1a1a]">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[28px] font-bold text-[#1a1a1a] leading-none">{value}</span>
        {change && <span className={`text-[12px] font-medium ${deltaColor}`}>{deltaArrow} {change}</span>}
      </div>
      {sub && <p className="text-[11.5px] text-[#646462] mt-1">{sub}</p>}
    </div>
  );
}

// ── Todos los informes — catálogo de los 25 informes preconfigurados ──────────
type AllReportRow = { t: string; d?: string; sub?: ReportsSubView; legacy?: boolean };
const ALL_REPORTS: AllReportRow[] = [
  { t: 'Artículos', sub: 'articles', legacy: true },
  { t: 'Calls', sub: 'calls', d: 'Use the Calls report to visualize and explore your team’s calling activity.' },
  { t: 'Capacidad de entrega de correo electrónico', sub: 'emailDeliv', legacy: true },
  { t: 'Conversation tags', sub: 'temas', d: 'Explore the reasons your customers get in touch, and monitor trends in the topics that come up.' },
  { t: 'Conversations', sub: 'conversations', d: 'Track your new inbound conversations, busiest periods and biggest customer issues, and optimize your support.' },
  { t: 'Copilot', sub: 'copilot', d: 'Analyze and report on how Copilot is used by teammates in your workspace.' },
  { t: 'CX Score', sub: 'cxScore', d: 'Analyze your customer experience across teammates and AI Agents using a breakthrough AI-generated metric.' },
  { t: 'Descripción general de los informes de Intercom', sub: 'overview' },
  { t: 'Effectiveness', sub: 'effectiveness', d: 'Measure how effectively your teams handle conversations with the Effectiveness report.' },
  { t: 'Fin AI Agent', sub: 'finAgent', d: 'Find out how Fin AI Agent is performing in conversations and impacting your resolution rates.' },
  { t: 'Fin for Ecommerce', sub: 'finAgent', d: 'Analyze how Fin for Ecommerce is performing, including carousel engagement and checkout activity.' },
  { t: 'Fin for Service', sub: 'finAgent', d: 'Find out how Fin for Service is performing in conversations and impacting your resolution rates.' },
  { t: 'Flujos de trabajo', sub: 'workflows', legacy: true },
  { t: 'Flujos de trabajo (generación de prospectos)', sub: 'workflowsLeadGen', legacy: true },
  { t: 'Información general sobre las relaciones con el cliente', sub: 'outboundEng', legacy: true },
  { t: 'Leads', sub: 'leads', legacy: true },
  { t: 'Monitors', sub: 'monitors', d: 'Monitor and improve Fin AI Agent quality at scale' },
  { t: 'Responsiveness', sub: 'responsiveness', d: 'See how quickly your team respond to, and close conversations with the Responsiveness report.' },
  { t: 'SLAs', sub: 'slas', d: 'Review your team’s performance against your Service Level Agreements with the SLAs report.' },
  { t: 'Soporte para las conversaciones', sub: 'conversations', legacy: true },
  { t: 'Surveyed CSAT', sub: 'csat', d: 'Get a holistic view of customer satisfaction across all support channels, teammates, AI agents, and chatbots.' },
  { t: 'Team inbox performance', sub: 'teamInbox', d: 'Check in on how each team inbox is performing with accurate metrics and insights.' },
  { t: 'Teammate performance', sub: 'teammate', d: 'Check in on teammate performance with accurate metrics and insights.' },
  { t: 'Tickets', sub: 'tickets', d: 'Explore your tickets report and create your own custom reports using ticket data.' },
  { t: 'Ventas', legacy: true },
];

function ReportsAllReportsContent({ tab, onTab, onOpen, onCreate }: { tab: 'shared' | 'mine' | 'intercom'; onTab: (t: 'shared' | 'mine' | 'intercom') => void; onOpen: (s: ReportsSubView) => void; onCreate: (title: string) => void }) {
  const setTab = onTab;
  const [q, setQ] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const query = q.trim().toLowerCase();
  const rows = tab === 'intercom' ? ALL_REPORTS.filter(r => !query || r.t.toLowerCase().includes(query)) : [];
  const IntercomTag = () => (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-[#646462]">
      <img src="/logos/clain-favicon.png" alt="Clain" className="w-4 h-4 object-contain" draggable={false} />
      Clain
    </span>
  );
  const tabs = [
    { id: 'shared' as const,   label: 'Compartido contigo (0)' },
    { id: 'mine' as const,     label: 'Tus informes (0)' },
    { id: 'intercom' as const, label: `Informes de Clain (${ALL_REPORTS.length})` },
  ];
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M2 13V9h2.5v4H2zm3.5 0V6.5H8V13H5.5zm3.5 0V4h2.5v9H9zm3.5 0V7.5H15V13h-2.5z"/></svg>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Todos los informes</h1>
        </div>
        <button onClick={() => setShowTemplates(true)} className="flex items-center gap-1.5 bg-[#1a1a1a] text-white rounded-full px-3 py-[6px] text-[13px] font-semibold hover:bg-black">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
          Nuevo informe
        </button>
      </div>
      {showTemplates && <ReportTemplatesModal onClose={() => setShowTemplates(false)} onCreate={(t) => { setShowTemplates(false); onCreate(t); }} />}
      <div className="flex border-b border-[#e9eae6] px-6 flex-shrink-0">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 pb-3 pt-3 text-[13px] font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
              tab === t.id ? 'border-[#ed621d] text-[#1a1a1a]' : 'border-transparent text-[#646462] hover:text-[#1a1a1a]'
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="px-6 py-3 border-b border-[#f1f1ee] flex-shrink-0">
        <div className="flex items-center gap-2 h-9 rounded-lg border border-[#e9eae6] px-3 bg-white focus-within:border-[#1a1a1a]">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5"><circle cx="7" cy="7" r="4.3"/><path d="M10.2 10.2L14 14" strokeLinecap="round"/></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…" className="flex-1 bg-transparent outline-none text-[13px] text-[#1a1a1a] placeholder:text-[#a4a4a2]" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {tab !== 'intercom' ? (
          <div className="px-6 py-16 flex flex-col items-center text-center">
            <svg viewBox="0 0 16 16" className="w-8 h-8 fill-[#c9c9c6] mb-3"><path d="M2 13V9h2.5v4H2zm3.5 0V6.5H8V13H5.5zm3.5 0V4h2.5v9H9zm3.5 0V7.5H15V13h-2.5z"/></svg>
            <p className="text-[14px] font-semibold text-[#1a1a1a] mb-1">{tab === 'mine' ? 'Aún no has creado ningún informe' : 'No hay informes compartidos contigo'}</p>
            <p className="text-[13px] text-[#646462] mb-4">{tab === 'mine' ? 'Una vez que hayas creado los informes, los encontrarás aquí' : 'Cuando alguien comparta un informe contigo, aparecerá aquí.'}</p>
            {tab === 'mine' && (
              <button onClick={() => setShowTemplates(true)} className="flex items-center gap-1.5 text-[13px] font-semibold text-[#1a1a1a] hover:bg-[#f3f3f1] rounded-full px-3 py-[6px]">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
                Nuevo informe
              </button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-[#f8f8f7] sticky top-0">
              <tr className="text-[12px] font-semibold text-[#646462]">
                <th className="text-left px-6 py-2.5">Título</th>
                <th className="text-left px-4 py-2.5 w-[180px]">Propiedad de</th>
                <th className="text-left px-4 py-2.5 w-[180px]">Última actualización</th>
                <th className="text-left px-4 py-2.5 w-[180px]">Última actualización de</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr
                  key={r.t}
                  onClick={() => r.sub && onOpen(r.sub)}
                  className={`border-t border-[#f1f1ee] ${r.sub ? 'hover:bg-[#f8f8f7] cursor-pointer' : ''}`}
                >
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-semibold text-[#1a1a1a]">{r.t}</span>
                      {r.legacy && <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#f3f3f1] text-[#646462]">Anterior</span>}
                    </div>
                    {r.d && <p className="text-[12.5px] text-[#646462] mt-0.5 max-w-[640px]">{r.d}</p>}
                  </td>
                  <td className="px-4 py-3.5"><IntercomTag /></td>
                  <td className="px-4 py-3.5 text-[13px] text-[#646462]">{r.d ? '7 días atrás' : '—'}</td>
                  <td className="px-4 py-3.5 text-[13px] text-[#646462]">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Demo data — deterministic simulated overview so the Resumen shows real
// Chart.js charts until reportsApi.overview returns time-series. Seeded RNG →
// stable across renders. Used only as a fallback when the backend has no series.
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function demoLabels(n: number): string[] {
  const out: string[] = []; const now = new Date();
  for (let i = n - 1; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i * 7); out.push(d.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })); }
  return out;
}
function buildDemoOverview() {
  const n = 13; const labels = demoLabels(n); const r = mulberry32(7);
  const mk = (base: number, amp: number, slope = 0) => Array.from({ length: n }, (_, i) => Math.max(0, Math.round(base + slope * i + Math.sin(i / 2.2) * amp + (r() - 0.5) * amp)));
  const all = mk(90, 22, 4);
  const fin = all.map(v => Math.round(v * 0.55));
  const chatbot = all.map(v => Math.round(v * 0.12));
  const teammate = all.map(v => Math.round(v * 0.22));
  const noreply = all.map(v => Math.max(0, Math.round(v * 0.06)));
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  return {
    kpis: [],
    metrics: {
      fin_deflect: { value: '46%', change: '+3 pts', trend: 'up' }, fin_resolution: { value: '87%', change: '+5 pts', trend: 'up' }, fin_cx: { value: '82', change: '+1', trend: 'up' },
      tm_first: { value: '2m 14s', change: '-11s', trend: 'up' }, tm_reply: { value: '5m 03s', change: '+22s', trend: 'down' }, tm_close: { value: '3h 42m', change: '-18m', trend: 'up' }, tm_handle: { value: '11m 08s', change: '-40s', trend: 'up' },
      cx_overall: { value: '82', change: '+2', trend: 'up' }, cx_fin: { value: '84', change: '+1', trend: 'up' }, cx_chatbot: { value: '71', change: '-3', trend: 'down' }, cx_teammate: { value: '88', change: '+4', trend: 'up' },
      csat_overall: { value: '91%', change: '+1 pt', trend: 'up' }, csat_fin: { value: '89%', change: '+2 pts', trend: 'up' }, csat_teammate: { value: '93%', change: '0', trend: 'flat' },
    } as Record<string, { value: any; change?: string; trend?: string }>,
    handling: [
      { label: 'Fin', value: sum(fin) }, { label: 'Chatbot', value: sum(chatbot) },
      { label: 'Compañero de equipo', value: sum(teammate) }, { label: 'Sin respuesta', value: sum(noreply) },
    ],
    series: {
      volume: { labels, series: [{ label: 'Todas las conversaciones', data: all, fill: true }, { label: 'Fin', data: fin }, { label: 'Chatbot', data: chatbot }, { label: 'Compañero de equipo', data: teammate }, { label: 'Sin respuesta', data: noreply }] },
      newByChannel: { labels, series: [{ label: 'Chat', data: mk(38, 12, 1) }, { label: 'Email', data: mk(22, 8, 0.5) }, { label: 'Unknown', data: mk(9, 5) }] },
      closeByChannel: { labels, series: [{ label: 'Chat (h)', data: mk(6, 2) }, { label: 'Email (h)', data: mk(11, 3) }] },
      finImpact: { labels, series: [{ label: 'Resueltas por Fin', data: fin, fill: true }] },
      teammateOverTime: { labels, series: [{ label: 'Mediana 1ª respuesta (min)', data: mk(4, 1.5) }, { label: 'Mediana cierre (h)', data: mk(4, 1) }] },
      cxOverTime: { labels, series: [{ label: 'CX', data: mk(80, 6), fill: true }] },
      csatOverTime: { labels, series: [{ label: 'CSAT', data: mk(90, 4), fill: true }] },
      cxNegReasons: { labels: ['Tiempo de espera', 'Resolución incompleta', 'Tono', 'No resuelto', 'Otros'], values: [38, 24, 16, 14, 8] },
      cxPosReasons: { labels: ['Rapidez', 'Resolución', 'Amabilidad', 'Proactividad'], values: [42, 31, 18, 9] },
      cxNegTopics: { labels, series: [{ label: 'Reembolsos', data: mk(6, 2) }, { label: 'Envíos', data: mk(5, 2) }, { label: 'Facturación', data: mk(4, 1.5) }] },
    } as Record<string, any>,
  };
}
const DEMO_OVERVIEW = buildDemoOverview();

// Shared deterministic mock generators so every report can render populated
// while the backend has no data. Seeded → stable across renders.
const MOCK_WEEKS = ['Jun 22', 'Jun 29', 'Jul 6', 'Jul 13', 'Jul 20', 'Jul 27', 'Ago 3', 'Ago 10', 'Ago 17'];
function mockSeries(base: number, amp: number, slope = 0, seed = 3, decimals = 0): number[] {
  const r = mulberry32(seed);
  const f = Math.pow(10, decimals);
  return MOCK_WEEKS.map((_, i) => Math.max(0, Math.round((base + slope * i + Math.sin(i / 2.1) * amp + (r() - 0.5) * amp) * f) / f));
}
// Daily labels (one week) for reports that Intercom renders per-day rather than
// per-week (e.g. the legacy Flujos de trabajo reports).
const MOCK_DAYS = ['17 jul', '18 jul', '19 jul', '20 jul', '21 jul', '22 jul', '23 jul'];
function mockDaily(base: number, amp: number, slope = 0, seed = 3): number[] {
  const r = mulberry32(seed);
  return MOCK_DAYS.map((_, i) => Math.max(0, Math.round(base + slope * i + Math.sin(i / 1.6) * amp + (r() - 0.5) * amp)));
}
// Weekly activity heatmap (hours × weekdays) with a plausible support-load shape:
// busiest midday on weekdays, quiet nights and weekends.
function mockHeatmap(seed: number): number[][] {
  const r = mulberry32(seed);
  const hourWeight = [0.05, 0.05, 0.15, 0.55, 0.95, 0.8, 0.45, 0.15]; // 12a,3a,6a,9a,12p,3p,6p,9p
  const dayWeight = [1, 1, 0.95, 1, 0.9, 0.45, 0.35];                  // Lu..Do
  return hourWeight.map(hw => dayWeight.map(dw => Math.round(hw * dw * 24 * (0.6 + r() * 0.8))));
}
// Full 7 days × 24 hours heatmap (día de la semana × hora del día) con una curva
// diaria realista (pico a mediodía, tranquilo de noche y fines de semana).
const HEATMAP_DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const HEATMAP_HOURS = Array.from({ length: 24 }, (_, h) => String(h));
function mock24Heatmap(seed: number): number[][] {
  const r = mulberry32(seed);
  const dayW = [1, 1, 0.95, 1, 0.9, 0.5, 0.4]; // Lun..Dom
  const hourW = Array.from({ length: 24 }, (_, h) => Math.max(0.02, Math.exp(-Math.pow((h - 13) / 4.6, 2))));
  return dayW.map(dw => hourW.map(hw => Math.round(dw * hw * 14 * (0.55 + r() * 0.9))));
}

// ── 1. Resumen — dashboard de KPIs (Chart.js vía KpiChart) ────────────────────
// Data-driven: pulls what reportsApi.overview provides, and renders Intercom-
// style empty states everywhere there is no series yet. Every KPI/chart goes
// through the shared KpiChart library so the whole area shares one renderer.
function ReportsOverviewContent({ period, channel }: { period: string; channel: string }) {
  const { data: ov } = useApi(() => reportsApi.overview(period, channel), [period, channel], null);
  const { data: sla } = useApi(() => reportsApi.sla(period, channel), [period, channel], null);
  // Use real series when the backend returns non-zero data; otherwise fall back
  // to the deterministic demo so an empty tenant still previews the layout.
  const hasRealSeries = !!(ov?.series && Object.values(ov.series).some((s: any) =>
    Array.isArray(s?.series) && s.series.some((x: any) => (x.data ?? []).some((v: number) => v > 0))));
  const data: any = hasRealSeries ? ov : DEMO_OVERVIEW;
  const isDemo = !hasRealSeries;

  const kpiVal = (key: string): { value: any; change?: string; trend?: string } =>
    (data.metrics?.[key]) ?? { value: '—' };
  const seriesBlock = (key: string) => {
    const s = data.series?.[key];
    if (s && Array.isArray(s.series) && s.series.some((x: any) => (x.data ?? []).some((v: number) => v))) return s;
    return null;
  };
  const handling = data.handling ?? [];
  const dist: any[] = sla?.distribution ?? [];

  const finGroup: [string, string][] = [
    ['Tasa de desviación', 'fin_deflect'], ['Tasa de resolución', 'fin_resolution'], ['Puntuación de la experiencia del cliente (CX)', 'fin_cx'],
  ];
  const teammateGroup: [string, string][] = [
    ['Mediana de tiempo de primera respuesta', 'tm_first'], ['Mediana de tiempo de respuesta', 'tm_reply'],
    ['Mediana de tiempo para cerrar', 'tm_close'], ['Mediana de tiempo de gestión', 'tm_handle'],
  ];
  const cxGroup: [string, string][] = [
    ['Puntuación general de la experiencia del cliente', 'cx_overall'], ['Puntuación CX · Fin', 'cx_fin'],
    ['Puntuación CX · Chatbot', 'cx_chatbot'], ['Puntuación CX · Compañero', 'cx_teammate'],
  ];
  const csatGroup: [string, string][] = [
    ['Puntuación general de CSAT', 'csat_overall'], ['Puntuación CSAT de Fin AI Agent', 'csat_fin'], ['Puntuación CSAT del compañero de equipo', 'csat_teammate'],
  ];

  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-4 flex flex-col gap-4">
      <KpiSectionHeader title={title} />
      {children}
    </div>
  );
  const TimeCard = ({ title, seriesKey }: { title: string; seriesKey: string }) => {
    const s = seriesBlock(seriesKey);
    return (
      <KpiChartCard title={title}>
        {s ? <KpiTimeSeries labels={s.labels} series={s.series} type="line" /> : <KpiEmpty />}
      </KpiChartCard>
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><rect x="1.5" y="1.5" width="5.6" height="5.6" rx="1.4"/><rect x="8.9" y="1.5" width="5.6" height="5.6" rx="1.4"/><rect x="1.5" y="8.9" width="5.6" height="5.6" rx="1.4"/><rect x="8.9" y="8.9" width="5.6" height="5.6" rx="1.4"/></svg>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Resumen</h1>
          {isDemo && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">Datos de ejemplo</span>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">

        {/* Cómo manejas las conversaciones */}
        <KpiChartCard title="Cómo manejas las conversaciones" height={120}>
          {handling.length ? <KpiDistributionBar segments={handling} /> : <KpiEmpty />}
        </KpiChartCard>

        {/* Crecimiento general del volumen */}
        <TimeCard title="Crecimiento general del volumen" seriesKey="volume" />

        {/* Nuevas conversaciones por canal + Tiempo medio para cerrar por canal */}
        <div className="grid grid-cols-2 gap-4">
          <TimeCard title="Nuevas conversaciones por canal" seriesKey="newByChannel" />
          <TimeCard title="Tiempo medio para cerrar por canal" seriesKey="closeByChannel" />
        </div>

        {/* Rendimiento de Fin AI Agent */}
        <Section title="Rendimiento de Fin AI Agent">
          <div className="grid grid-cols-3 gap-3">
            {finGroup.map(([label, key]) => { const k = kpiVal(key); return <KpiCard key={label} label={label} value={k.value} change={k.change} trend={k.trend} />; })}
          </div>
          <TimeCard title="El impacto de Fin a lo largo del tiempo" seriesKey="finImpact" />
        </Section>

        {/* Desempeño de los compañeros de equipo */}
        <Section title="Desempeño de los compañeros de equipo">
          <div className="grid grid-cols-4 gap-3">
            {teammateGroup.map(([label, key]) => { const k = kpiVal(key); return <KpiCard key={label} label={label} value={k.value} change={k.change} trend={k.trend} />; })}
          </div>
          <TimeCard title="El desempeño del compañero de equipo a lo largo del tiempo" seriesKey="teammateOverTime" />
        </Section>

        {/* Puntuación de la experiencia del cliente (CX) */}
        <Section title="Puntuación de la experiencia del cliente (CX)">
          <div className="grid grid-cols-4 gap-3">
            {cxGroup.map(([label, key]) => { const k = kpiVal(key); return <KpiCard key={label} label={label} value={k.value} change={k.change} trend={k.trend} />; })}
          </div>
          <TimeCard title="Puntuación de la experiencia del cliente (CX) a lo largo del tiempo" seriesKey="cxOverTime" />
          <div className="grid grid-cols-2 gap-4">
            <KpiChartCard title="Razones de puntuación CX negativa 😖">{data.series?.cxNegReasons ? <KpiDoughnut labels={data.series.cxNegReasons.labels} values={data.series.cxNegReasons.values} /> : <KpiEmpty />}</KpiChartCard>
            <KpiChartCard title="Razones de puntuación CX positiva 😀">{data.series?.cxPosReasons ? <KpiDoughnut labels={data.series.cxPosReasons.labels} values={data.series.cxPosReasons.values} /> : <KpiEmpty />}</KpiChartCard>
          </div>
          <TimeCard title="Temas de conversación con puntuación CX negativa" seriesKey="cxNegTopics" />
        </Section>

        {/* Satisfacción del cliente (CSAT) encuestada */}
        <Section title="Satisfacción del cliente (CSAT) encuestada">
          <div className="grid grid-cols-3 gap-3">
            {csatGroup.map(([label, key]) => { const k = kpiVal(key); return <KpiCard key={label} label={label} value={k.value} change={k.change} trend={k.trend} />; })}
          </div>
          <TimeCard title="Puntuación CSAT a lo largo del tiempo" seriesKey="csatOverTime" />
        </Section>

        {/* SLA (dato real disponible) */}
        {dist.length > 0 && (
          <KpiChartCard title="Distribución de SLA" height={140}>
            <KpiDistributionBar segments={dist.map((d: any) => ({ label: String(d.status).replace(/_/g, ' '), value: d.count ?? 0, color: d.status === 'breached' ? '#dc2626' : d.status === 'at_risk' ? '#f59e0b' : '#16a34a' }))} />
          </KpiChartCard>
        )}
      </div>
    </div>
  );
}

// ── 2. Resumen IA ─────────────────────────────────────────────────────────────
type GeneratedAiReport = { id: string; title: string; date: string; audience: string; executiveSummary: string[]; positiveSignals: {title:string;detail:string}[]; riskFlags: {title:string;detail:string}[]; businessImpact: {title:string;detail:string}[]; recommendations: string[]; costSummary: {title:string;detail:string}[]; rangeLabel: string; channelLabel: string; };
function ReportsAiResumenContent({ period, channel }: { period: string; channel: string }) {
  const [audience, setAudience] = useState('Executive / C-Suite');
  const [generating, setGenerating] = useState(false);
  const [reports, setReports] = useState<GeneratedAiReport[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = reports.find(r => r.id === selectedId) ?? null;
  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const s = await reportsApi.summary(period, channel, audience);
      const now = new Date();
      const r: GeneratedAiReport = {
        id: String(Date.now()),
        title: `${audience} — ${now.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })}`,
        date: now.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }),
        audience,
        executiveSummary: Array.isArray(s?.executiveSummary) ? s.executiveSummary : [],
        positiveSignals: Array.isArray(s?.positiveSignals) ? s.positiveSignals : [],
        riskFlags: Array.isArray(s?.riskFlags) ? s.riskFlags : [],
        businessImpact: Array.isArray(s?.businessImpact) ? s.businessImpact : [],
        recommendations: Array.isArray(s?.recommendations) ? s.recommendations : [],
        costSummary: Array.isArray(s?.costSummary) ? s.costSummary : [],
        rangeLabel: s?.rangeLabel ?? period,
        channelLabel: s?.channelLabel ?? channel,
      };
      setReports(prev => [r, ...prev]);
      setSelectedId(r.id);
    } finally { setGenerating(false); }
  };
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0 gap-4">
        <div>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Resumen IA</h1>
          <p className="text-[12.5px] text-[#646462]">Genera un informe narrativo basado en los datos reales del período.</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <select value={audience} onChange={e => setAudience(e.target.value)} className="text-[13px] border border-[#e9eae6] rounded-[8px] px-3 py-1.5 bg-white text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]">
            <option>Executive / C-Suite</option>
            <option>Support Lead</option>
            <option>Technical Team</option>
          </select>
          <button onClick={generate} disabled={generating} className="flex items-center gap-1.5 bg-[#1a1a1a] text-white rounded-full px-4 py-[7px] text-[13px] font-semibold hover:bg-black disabled:opacity-50">
            <svg viewBox="0 0 16 16" className={`w-3.5 h-3.5 fill-current ${generating ? 'animate-spin' : ''}`}><path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5z"/></svg>
            {generating ? 'Generando…' : 'Generar informe'}
          </button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        {/* Left panel: list */}
        <div className="w-[240px] flex-shrink-0 border-r border-[#e9eae6] flex flex-col bg-[#f8f8f7]">
          <div className="px-4 py-3 border-b border-[#e9eae6] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Informes generados</span>
            <span className="bg-[#e9eae6] text-[#646462] text-[11px] font-bold px-1.5 py-0.5 rounded-full">{reports.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {reports.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-10 text-center px-3">
                <svg viewBox="0 0 16 16" className="w-8 h-8 fill-[#e9eae6] mb-2"><path d="M3 2a1 1 0 011-1h6l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2zm6.5 0v3h3l-3-3z" fillRule="evenodd"/></svg>
                <p className="text-[12px] text-[#646462]">Genera tu primer informe pulsando el botón.</p>
              </div>
            ) : reports.map(r => (
              <button key={r.id} onClick={() => setSelectedId(r.id)} className={`w-full text-left p-3 rounded-[8px] mb-1 transition-colors ${selectedId === r.id ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_rgba(20,20,20,0.10)]' : 'hover:bg-[#e9eae6]/40'}`}>
                <p className="text-[12.5px] font-semibold text-[#1a1a1a] truncate">{r.title}</p>
                <p className="text-[11px] text-[#646462] mt-0.5">{r.date}</p>
                <span className="mt-1 inline-block bg-[#dcfce7] text-[#16a34a] text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">Generado</span>
              </button>
            ))}
          </div>
        </div>
        {/* Right panel: report detail */}
        <div className="flex-1 overflow-y-auto">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-10">
              <svg viewBox="0 0 16 16" className="w-12 h-12 fill-[#e9eae6] mb-3"><path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5z"/></svg>
              <h3 className="text-[15px] font-semibold text-[#1a1a1a] mb-1">Sin informe seleccionado</h3>
              <p className="text-[13px] text-[#646462] max-w-xs">Genera un informe IA para obtener un resumen narrativo de actividad real del período.</p>
            </div>
          ) : (
            <div className="p-6 space-y-5">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-[#ede9fe] text-[#6d28d9] text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide">Informe IA</span>
                  <span className="bg-[#f3f3f1] text-[#646462] text-[10px] font-bold px-2 py-0.5 rounded uppercase">{selected.audience}</span>
                  <span className="text-[12px] text-[#646462]">{selected.rangeLabel} · {selected.channelLabel}</span>
                </div>
                <h1 className="text-[22px] font-bold text-[#1a1a1a]">{selected.title}</h1>
              </div>
              <div className="border border-[#e9eae6] rounded-[10px] bg-[#f8f8f7] p-4">
                <p className="text-[12px] font-bold text-[#1a1a1a] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#6366f1]"><path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5z"/></svg>Resumen ejecutivo
                </p>
                {selected.executiveSummary.map((l, i) => <p key={i} className="text-[13px] text-[#1a1a1a] leading-relaxed mb-1">{l}</p>)}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-[#e9eae6] rounded-[10px] bg-white p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[#1a1a1a] flex items-center gap-1 mb-3"><span className="w-2 h-2 rounded-full bg-[#16a34a]"/>Señales positivas</p>
                  {(selected.positiveSignals.length ? selected.positiveSignals : [{title:'Sin señal',detail:'No se detectó ninguna mejora significativa.'}]).map((item, i) => (
                    <div key={i} className="flex items-start gap-2 mb-2 text-[12.5px]">
                      <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#16a34a] flex-shrink-0 mt-0.5"><path d="M3 11l5-7 5 7z"/></svg>
                      <div><strong className="text-[#1a1a1a]">{item.title}</strong><br/><span className="text-[#646462]">{item.detail}</span></div>
                    </div>
                  ))}
                </div>
                <div className="border border-[#e9eae6] rounded-[10px] bg-white p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-[#1a1a1a] flex items-center gap-1 mb-3"><span className="w-2 h-2 rounded-full bg-[#dc2626]"/>Riesgos detectados</p>
                  {(selected.riskFlags.length ? selected.riskFlags : [{title:'Sin riesgos',detail:'No se detectaron bloqueos en este rango.'}]).map((item, i) => (
                    <div key={i} className="flex items-start gap-2 mb-2 text-[12.5px]">
                      <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#dc2626] flex-shrink-0 mt-0.5"><path d="M8 2l6 12H2L8 2z"/></svg>
                      <div><strong className="text-[#1a1a1a]">{item.title}</strong><br/><span className="text-[#646462]">{item.detail}</span></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border border-[#e9eae6] rounded-[10px] bg-white p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#1a1a1a] mb-3">Recomendaciones</p>
                <ul className="space-y-1.5">
                  {selected.recommendations.map((r, i) => <li key={i} className="text-[12.5px] text-[#646462] flex items-start gap-2"><svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#6366f1] flex-shrink-0 mt-0.5"><path d="M6.5 11.5L3 8l1-1 2.5 2.5 6-6 1 1z"/></svg>{r}</li>)}
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {selected.businessImpact.slice(0,2).map((item, i) => (
                  <div key={i} className="border border-[#e9eae6] rounded-[10px] bg-white p-4">
                    <p className="text-[12.5px] font-semibold text-[#1a1a1a] mb-1">{item.title}</p>
                    <p className="text-[12px] text-[#646462]">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 3. Áreas de negocio ───────────────────────────────────────────────────────
function ReportsAreasNegocioContent({ period, channel }: { period: string; channel: string }) {
  const { data: ov, loading: ovLoad } = useApi(() => reportsApi.overview(period, channel), [period, channel], null);
  const { data: intents, loading: intLoad } = useApi(() => reportsApi.intents(period, channel), [period, channel], null);
  const { data: approvals } = useApi(() => reportsApi.approvals(period, channel), [period, channel], null);
  const kpiMap = Object.fromEntries((ov?.kpis ?? []).map((m: any) => [m.key, m]));
  const intentList: any[] = intents?.intents ?? [];
  const topIntent = intentList[0];
  const weakest = [...intentList].sort((a, b) => parseFloat(a.handled) - parseFloat(b.handled))[0];
  const cards = [
    { label: 'Tasa resolución IA', value: kpiMap.auto_resolution?.value ?? kpiMap.resolution_rate?.value ?? '—', trend: kpiMap.auto_resolution?.trend ?? 'neutral', sub: 'Resoluciones automatizadas' },
    { label: 'Tasa aprobación', value: approvals?.rates?.approvalRate ?? '—', trend: 'neutral', sub: 'Aprobadas vs. total' },
    { label: 'Tiempo decisión medio', value: approvals?.rates?.avgDecisionHours != null ? `${approvals.rates.avgDecisionHours}h` : '—', trend: 'neutral', sub: 'Mediana de aprobaciones' },
    { label: 'Cumplimiento SLA', value: kpiMap.sla_compliance?.value ?? '—', trend: kpiMap.sla_compliance?.trend ?? 'neutral', sub: 'Dentro del SLA' },
    { label: 'Casos de alto riesgo', value: kpiMap.high_risk?.value ?? '—', trend: 'down', sub: 'Marcados críticos/altos' },
    { label: 'Total casos', value: kpiMap.total_cases?.value ?? '—', change: kpiMap.total_cases?.change, trend: kpiMap.total_cases?.trend ?? 'neutral', sub: kpiMap.total_cases?.sub ?? '' },
  ];
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Áreas de negocio</h1>
          <p className="text-[12.5px] text-[#646462]">Demanda por intención y señales de cobertura de IA.</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-3">
          {cards.map((c, i) => <ReportsAnalysisKpiCard key={i} idx={i} label={c.label} value={String(c.value)} change={(c as any).change} trend={c.trend} sub={c.sub} />)}
        </div>
        <div className="grid grid-cols-[1fr_280px] gap-3">
          <div className="border border-[#e9eae6] rounded-[10px] bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-[#e9eae6] flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#1a1a1a]">Intenciones principales</span>
            </div>
            <table className="w-full text-left">
              <thead><tr className="bg-[#f8f8f7] border-b border-[#e9eae6] text-[11px] text-[#646462] uppercase tracking-wide font-semibold">
                <th className="px-5 py-2">Intención</th>
                <th className="px-5 py-2 text-right">Volumen</th>
                <th className="px-5 py-2 text-right">IA manejó</th>
                <th className="px-5 py-2 w-1/4">Cuota</th>
              </tr></thead>
              <tbody className="text-[12.5px] divide-y divide-[#f3f3f1]">
                {intLoad && !intentList.length ? (
                  <tr><td colSpan={4} className="px-5 py-6 text-center text-[#646462]">Cargando intenciones…</td></tr>
                ) : !intentList.length ? (
                  <tr><td colSpan={4} className="px-5 py-6 text-center text-[#646462]">Sin intenciones detectadas en este rango.</td></tr>
                ) : intentList.map((intent: any, i: number) => (
                  <tr key={i} className="hover:bg-[#f8f8f7] transition-colors">
                    <td className="px-5 py-2.5 font-medium text-[#1a1a1a] capitalize">{String(intent.name).replace(/_/g,' ')}</td>
                    <td className="px-5 py-2.5 text-right text-[#646462]">{intent.volume}</td>
                    <td className="px-5 py-2.5 text-right font-medium text-[#16a34a]">{intent.handled}</td>
                    <td className="px-5 py-2.5">
                      <div className="w-full bg-[#f3f3f1] rounded-full h-1.5"><div className="bg-[#6366f1] h-1.5 rounded-full" style={{ width: intent.shareOfTotal }}/></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3">
            <div className="border border-[#e9eae6] rounded-[10px] bg-[#f8f8f7] p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#1a1a1a] flex items-center gap-1.5 mb-2">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#6366f1]"><path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5z"/></svg>Micro-resumen IA
              </p>
              <p className="text-[12.5px] text-[#646462] leading-relaxed">
                {topIntent ? `${String(topIntent.name).replace(/_/g,' ')} lidera la demanda con ${topIntent.volume} casos y ${topIntent.handled} gestión IA.` : 'Sin área de negocio dominante en este rango.'}
                {weakest ? ` El flujo con menor cobertura es ${String(weakest.name).replace(/_/g,' ')} — revisar.` : ''}
              </p>
            </div>
            <div className="border border-[#e9eae6] rounded-[10px] bg-white p-4 flex-1">
              <p className="text-[13px] font-semibold text-[#1a1a1a] mb-3">Acciones recomendadas</p>
              {[topIntent, weakest].filter(Boolean).map((intent, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5 rounded-[8px] border border-[#e9eae6] hover:bg-[#f8f8f7] mb-2 cursor-pointer">
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#646462] flex-shrink-0 mt-0.5"><path d="M3 3h10v1.5H8.5v9.5h-1V4.5H3z"/></svg>
                  <div>
                    <p className="text-[12px] font-medium text-[#1a1a1a]">{i === 0 ? 'Auditar' : 'Mejorar'} {String(intent.name).replace(/_/g,' ')}</p>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#fef3c7] text-[#92400e]">{i === 0 ? 'Alto impacto' : 'Medio impacto'}</span>
                  </div>
                </div>
              ))}
              {!topIntent && <p className="text-[12px] text-[#646462]">Sin recomendaciones para este rango.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 4. Agentes ────────────────────────────────────────────────────────────────
function ReportsAgentesContent({ period, channel }: { period: string; channel: string }) {
  const { data, loading } = useApi(() => reportsApi.agents(period, channel), [period, channel], null);
  const agents: any[] = (data?.agents ?? []).slice(0, 6).map((a: any, i: number) => ({
    ...a, idx: i,
    successNum: parseFloat(String(a.successRate).replace(/[^0-9.]/g, '')) || 0,
    trend: parseFloat(String(a.successRate)) >= 90 ? 'up' : parseFloat(String(a.successRate)) >= 70 ? 'neutral' : 'down',
  }));
  const spotlight = [...agents].sort((a, b) => a.successNum - b.successNum)[0] ?? null;
  const avg = agents.length ? Math.round(agents.reduce((s, a) => s + a.successNum, 0) / agents.length) : null;
  const AGENT_ICON_MAP: Record<string, string> = { orchestration:'supervisor_account', ingest:'merge_type', intelligence:'psychology', resolution:'build', communication:'edit_document', observability:'visibility', connectors:'cable' };
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Agentes</h1>
          <p className="text-[12.5px] text-[#646462]">Rendimiento de cada agente IA en el período seleccionado.</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
        {loading && !agents.length ? (
          <div className="grid grid-cols-2 gap-3">{Array.from({length:4}).map((_,i) => <div key={i} className="border border-[#e9eae6] rounded-[10px] h-[110px] animate-pulse bg-white"/>)}</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {agents.map((a, i) => <ReportsAnalysisKpiCard key={i} idx={i} label={a.name} value={a.successRate ?? '—'} change={a.failedRuns ? `${a.failedRuns} fallidos` : undefined} trend={a.trend} sub={`${a.totalRuns} ejecuciones · ${Number(a.tokensUsed||0).toLocaleString()} tokens`}/>)}
          </div>
        )}
        <div className="grid grid-cols-[1fr_260px] gap-3">
          {spotlight ? (
            <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-[8px] bg-[#6366f1] flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-white text-[18px]">{AGENT_ICON_MAP[spotlight.category] || 'smart_toy'}</span>
                </div>
                <div>
                  <h2 className="text-[14px] font-bold text-[#1a1a1a]">{spotlight.name}</h2>
                  <p className="text-[12px] text-[#646462]">Tasa más baja del período — revisar primero</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: 'Tasa éxito', value: spotlight.successRate ?? '—', bad: spotlight.successNum < 80 },
                  { label: 'Ejecuciones', value: spotlight.totalRuns ?? '—', bad: false },
                  { label: 'Categoría', value: String(spotlight.category ?? '—').replace(/_/g,' '), bad: false },
                ].map((s, i) => (
                  <div key={i} className="bg-[#f8f8f7] rounded-[8px] p-3 border border-[#e9eae6]">
                    <p className="text-[11px] text-[#646462] mb-1">{s.label}</p>
                    <p className={`text-[15px] font-bold capitalize ${s.bad ? 'text-[#dc2626]' : 'text-[#1a1a1a]'}`}>{String(s.value)}</p>
                  </div>
                ))}
              </div>
              <div className="bg-[#fef9ee] border border-[#fde68a] rounded-[8px] p-3 text-[12.5px] text-[#1a1a1a]">
                <strong>Spotlight:</strong> {spotlight.name} tiene una tasa del {spotlight.successRate} en {spotlight.totalRuns} ejecuciones.{spotlight.failedRuns ? ` ${spotlight.failedRuns} ejecuciones fallidas requieren revisión.` : ' Sin ejecuciones fallidas.'}
              </div>
            </div>
          ) : (
            <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5 flex items-center justify-center text-[#646462] text-[13px]">Sin datos de agentes para este filtro.</div>
          )}
          <div className="border border-[#e9eae6] rounded-[10px] bg-[#f8f8f7] p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#1a1a1a] flex items-center gap-1.5 mb-3">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#6366f1]"><path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5z"/></svg>Resumen de agentes
            </p>
            <p className="text-[12.5px] text-[#646462] leading-relaxed">
              {agents.length ? `${agents.length} agentes activos este período. Tasa media de éxito: ${avg}% en el canal ${channel === 'all' ? 'global' : channel}.` : 'Sin actividad de agentes en el rango seleccionado.'}
            </p>
            {avg !== null && (
              <div className="mt-3">
                <div className="flex justify-between text-[12px] mb-1"><span className="text-[#646462]">Media</span><span className="font-semibold text-[#1a1a1a]">{avg}%</span></div>
                <div className="w-full bg-[#e9eae6] rounded-full h-2">
                  <div className={`h-2 rounded-full ${avg >= 80 ? 'bg-[#16a34a]' : avg >= 60 ? 'bg-[#f97316]' : 'bg-[#dc2626]'}`} style={{ width: `${avg}%` }}/>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 5. Aprobaciones y riesgo ──────────────────────────────────────────────────
function ReportsAprobacionesContent({ period, channel }: { period: string; channel: string }) {
  const { data: ap, loading } = useApi(() => reportsApi.approvals(period, channel), [period, channel], null);
  const { data: sla } = useApi(() => reportsApi.sla(period, channel), [period, channel], null);
  const funnel: any[] = ap?.funnel ?? [];
  const triggered = funnel.find((s: any) => s.label === 'Triggered')?.val ?? '—';
  const pending   = funnel.find((s: any) => s.label === 'Pending')?.val ?? '—';
  const approved  = ap?.rates?.approvalRate ?? '—';
  const rejected  = ap?.rates?.rejectionRate ?? '—';
  const avgDec    = ap?.rates?.avgDecisionHours != null ? `${ap.rates.avgDecisionHours}h` : '—';
  const highRisk  = ap?.byRisk?.find((r: any) => r.riskLevel === 'high')?.count ?? 0;
  const breached  = sla?.distribution?.find((d: any) => d.status === 'breached')?.count ?? 0;
  const cards = [
    { label: 'Solicitudes de aprobación', value: String(triggered), sub: 'Total del período' },
    { label: 'Pendientes de revisión', value: String(pending), sub: 'En espera', trend: 'down' },
    { label: 'Tasa de aprobación', value: String(approved), sub: 'Aprobadas / total', trend: 'up' },
    { label: 'Tasa de rechazo', value: String(rejected), sub: 'Rechazadas / total', trend: 'down' },
    { label: 'Tiempo medio decisión', value: avgDec, sub: 'Solicitud a decisión' },
    { label: 'Incumplimientos SLA', value: String(breached), sub: 'Casos fuera de SLA', trend: breached > 0 ? 'down' : 'neutral' },
    { label: 'Elementos alto riesgo', value: String(highRisk), sub: 'Requieren revisión humana', trend: highRisk > 0 ? 'down' : 'neutral' },
    { label: 'Ejecutados tras aprobación', value: String(approved), sub: 'Flujos aprobados que continúan' },
  ];
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Aprobaciones y riesgo</h1>
          <p className="text-[12.5px] text-[#646462]">Estado del backlog de aprobaciones y métricas de riesgo operativo.</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
        {loading && !ap ? (
          <div className="grid grid-cols-2 gap-3">{Array.from({length:4}).map((_,i) => <div key={i} className="border border-[#e9eae6] rounded-[10px] h-[110px] animate-pulse bg-white"/>)}</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {cards.map((c, i) => <ReportsAnalysisKpiCard key={i} idx={i} label={c.label} value={c.value} trend={(c as any).trend} sub={c.sub}/>)}
          </div>
        )}
        <div className="grid grid-cols-[1fr_260px] gap-3">
          <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5">
            <h2 className="text-[13px] font-semibold text-[#1a1a1a] mb-4">Embudo de aprobaciones</h2>
            {!funnel.length ? (
              <p className="text-[12.5px] text-[#646462] text-center py-6">Sin solicitudes de aprobación en este filtro.</p>
            ) : (
              <div className="flex items-center justify-between">
                {funnel.map((step: any, i: number) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="text-center">
                      <p className="text-[26px] font-bold text-[#1a1a1a]">{step.val}</p>
                      <p className="text-[12px] text-[#646462]">{step.label}</p>
                    </div>
                    {i < funnel.length - 1 && (
                      <svg viewBox="0 0 16 16" className="w-5 h-5 fill-[#e9eae6] flex-shrink-0"><path d="M6 4l4 4-4 4z"/></svg>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="border border-[#e9eae6] rounded-[10px] bg-[#f8f8f7] p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#1a1a1a] flex items-center gap-1.5 mb-3">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#6366f1]"><path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5z"/></svg>Resumen de riesgo IA
            </p>
            <p className="text-[12.5px] text-[#646462] leading-relaxed">
              {ap?.rates?.avgDecisionHours != null
                ? `Tiempo medio de decisión: ${avgDec}. Tasa aprobación: ${approved}, rechazo: ${rejected}.${breached > 0 ? ` ${breached} casos incumplieron el SLA.` : ' Sin incumplimientos SLA.'}`
                : 'Sin datos de decisión disponibles para este rango.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 6. Costes y ROI ───────────────────────────────────────────────────────────
function ReportsCostesRoiContent({ period, channel }: { period: string; channel: string }) {
  const { data: costs, loading } = useApi(() => reportsApi.costs(period, channel), [period, channel], null);
  const { data: ov } = useApi(() => reportsApi.overview(period, channel), [period, channel], null);
  const summary = costs?.summary ?? {};
  const byAgent: any[] = costs?.byAgent ?? [];
  const kpis = ov?.kpis ?? [];
  const totalCasesKpi = kpis.find((m: any) => m.key === 'total_cases');
  const resolutionKpi = kpis.find((m: any) => m.key === 'resolution_rate');
  const slaKpi = kpis.find((m: any) => m.key === 'sla_compliance');
  const nCases = parseFloat(String(totalCasesKpi?.value ?? '0').replace(/[^0-9.]/g, '')) || 0;
  const creditsUsed = summary.creditsUsed != null ? String(summary.creditsUsed) : '—';
  const creditsAdded = summary.creditsAdded != null ? String(summary.creditsAdded) : '—';
  const tokens = summary.totalTokens != null ? Number(summary.totalTokens).toLocaleString() : '—';
  const autoResolved = summary.autoResolvedCases != null ? String(summary.autoResolvedCases) : '—';
  const costPerCase = nCases > 0 && summary.creditsUsed != null ? `${(summary.creditsUsed / nCases).toFixed(4)} cr` : '—';
  const cards = [
    { label: 'Créditos usados', value: creditsUsed, sub: 'Coste IA procesamiento', trend: 'neutral' as const },
    { label: 'Créditos añadidos', value: creditsAdded, sub: 'Recargas del workspace', trend: 'up' as const },
    { label: 'Total tokens', value: tokens, sub: 'Tokens LLM consumidos', trend: 'neutral' as const },
    { label: 'Casos auto-resueltos IA', value: autoResolved, sub: 'Completados por IA', trend: 'up' as const },
    { label: 'Coste por caso', value: costPerCase, sub: 'Coste IA / caso medio', trend: 'neutral' as const },
    { label: 'Total casos', value: totalCasesKpi?.value ?? '—', change: totalCasesKpi?.change, trend: totalCasesKpi?.trend ?? 'neutral' },
    { label: 'Tasa resolución', value: resolutionKpi?.value ?? '—', change: resolutionKpi?.change, trend: resolutionKpi?.trend ?? 'neutral' },
    { label: 'Cumplimiento SLA', value: slaKpi?.value ?? '—', change: slaKpi?.change, trend: slaKpi?.trend ?? 'neutral' },
  ];
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Costes y ROI</h1>
          <p className="text-[12.5px] text-[#646462]">Créditos IA consumidos, tokens y retorno de automatización.</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
        {loading && !costs ? (
          <div className="grid grid-cols-2 gap-3">{Array.from({length:4}).map((_,i) => <div key={i} className="border border-[#e9eae6] rounded-[10px] h-[110px] animate-pulse bg-white"/>)}</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {cards.map((c, i) => <ReportsAnalysisKpiCard key={i} idx={i} label={c.label} value={c.value} change={(c as any).change} trend={c.trend} sub={c.sub}/>)}
          </div>
        )}
        <div className="grid grid-cols-[1fr_260px] gap-3">
          <div className="border border-[#e9eae6] rounded-[10px] bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-[#e9eae6]">
              <span className="text-[13px] font-semibold text-[#1a1a1a]">Coste por agente</span>
            </div>
            <table className="w-full text-left">
              <thead><tr className="bg-[#f8f8f7] border-b border-[#e9eae6] text-[11px] text-[#646462] uppercase tracking-wide font-semibold">
                <th className="px-5 py-2">Agente</th>
                <th className="px-5 py-2 text-right">Tokens</th>
                <th className="px-5 py-2 text-right">Créditos</th>
              </tr></thead>
              <tbody className="text-[12.5px] divide-y divide-[#f3f3f1]">
                {!byAgent.length ? (
                  <tr><td colSpan={3} className="px-5 py-6 text-center text-[#646462]">Sin datos de coste por agente para este filtro.</td></tr>
                ) : byAgent.map((a: any, i: number) => (
                  <tr key={i} className="hover:bg-[#f8f8f7] transition-colors">
                    <td className="px-5 py-2.5 font-medium text-[#1a1a1a]">{a.name}</td>
                    <td className="px-5 py-2.5 text-right text-[#646462]">{Number(a.tokens).toLocaleString()}</td>
                    <td className="px-5 py-2.5 text-right font-semibold text-[#6366f1]">{a.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border border-[#e9eae6] rounded-[10px] bg-[#f8f8f7] p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#1a1a1a] flex items-center gap-1.5 mb-3">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#6366f1]"><path d="M8 1l1.5 4.5L14 7l-4.5 1.5L8 13l-1.5-4.5L2 7l4.5-1.5z"/></svg>Resumen de costes
            </p>
            <p className="text-[12.5px] text-[#646462] leading-relaxed">
              {summary.creditsUsed != null
                ? <>{creditsUsed} créditos consumidos en {tokens} tokens y {autoResolved} ejecuciones completadas.<br/><br/><strong className="text-[#1a1a1a]">Filtro:</strong> {period === '7d' ? 'Últimos 7 días' : period === '90d' ? 'Últimos 90 días' : 'Últimos 30 días'} · {channel === 'all' ? 'Todos los canales' : channel}</>
                : 'Sin datos de coste disponibles para este rango.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportsSidebar({ sub, onSelect }: { sub: ReportsSubView; onSelect: (s: ReportsSubView) => void }) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    'AI & Automation': false,
    'Human support': false,
    'Proactive': false,
  });
  const toggleGroup = (label: string) => setOpenGroups(s => ({ ...s, [label]: !s[label] }));
  // Flat top section (matches the Informes screenshot): direct items with an
  // optional count badge, external-link arrow, or a right chevron.
  const topItems: { key: ReportsSubView; label: string; icon: ReportsItemIcon; count?: number; external?: boolean; chevron?: boolean }[] = [
    { key: 'aiResumen',   label: 'Información de IA',            icon: 'aiInfo', external: true },
    { key: 'overview',    label: 'Resumen',                     icon: 'grid' },
    { key: 'todos',       label: 'Todos los informes',          icon: 'chart', count: 25 },
    { key: 'misInformes', label: 'Tus informes',                icon: 'user',  count: 0 },
    { key: 'favoritos',   label: 'Tus favoritos',               icon: 'heart', chevron: true },
    { key: 'temas',       label: 'Temas de conversación',       icon: 'lightbulb', chevron: true },
    { key: 'export',      label: 'Exportación de conjuntos de datos', icon: 'export' },
    { key: 'horarios',    label: 'Administrar los horarios',    icon: 'schedule' },
  ];
  const familyGroups: { label: string; items: { key: ReportsSubView; label: string; icon?: ReportsItemIcon }[] }[] = [
    {
      label: 'AI & Automation',
      items: [
        { key: 'finAgent', label: 'Fin AI Agent', icon: 'fin' },
        { key: 'copilot',  label: 'Copilot',      icon: 'copilot' },
      ],
    },
    {
      label: 'Human support',
      items: [
        { key: 'calls',          label: 'Calls',                    icon: 'phone' },
        { key: 'conversations',  label: 'Conversations',            icon: 'chat' },
        { key: 'csat',           label: 'Surveyed CSAT',            icon: 'star' },
        { key: 'effectiveness',  label: 'Effectiveness',            icon: 'zap' },
        { key: 'responsiveness', label: 'Responsiveness',           icon: 'clock' },
        { key: 'slas',           label: 'SLAs',                     icon: 'sla' },
        { key: 'teamInbox',      label: 'Team Inbox performance',   icon: 'inbox' },
        { key: 'teammate',       label: 'Teammate performance',     icon: 'user' },
        { key: 'tickets',        label: 'Tickets',                  icon: 'ticket' },
      ],
    },
    {
      label: 'Proactive',
      items: [
        { key: 'articles',    label: 'Artículos',           icon: 'doc' },
        { key: 'outboundEng', label: 'Información general',  icon: 'globe' },
      ],
    },
  ];

  // Filled/bold icons (Inbox-style) — fill #1a1a1a, no stroke. Each `kind` returns a 16x16 SVG.
  function GroupIcon({ kind }: { kind: NonNullable<ReportsItemIcon> }) {
    const cls = "w-4 h-4 fill-[#1a1a1a]";
    switch (kind) {
      case 'topic':     return <svg viewBox="0 0 16 16" className={cls}><path d="M8 1.5C5 1.5 2.5 4 2.5 7c0 2 1 3.6 2.5 4.5l.5 2.5h5l.5-2.5C12.5 10.6 13.5 9 13.5 7 13.5 4 11 1.5 8 1.5zM6 14h4v.5a1 1 0 01-1 1H7a1 1 0 01-1-1V14z"/></svg>;
      case 'export':    return <svg viewBox="0 0 16 16" className={cls}><path d="M7 2h2v6.6l2.3-2.3 1.4 1.4L8 12.4 3.3 7.7l1.4-1.4L7 8.6V2zM2 13.5h12V15H2v-1.5z"/></svg>;
      case 'schedule':  return <svg viewBox="0 0 16 16" className={cls}><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8.75 4v3.69l2.6 1.5-.75 1.3L7.25 8.5V4h1.5z"/></svg>;
      case 'folder':    return <svg viewBox="0 0 16 16" className={cls}><path d="M2 4a1 1 0 011-1h3.5L8 4.5h5a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"/></svg>;
      case 'admin':     return <svg viewBox="0 0 16 16" className={cls}><path d="M2 3.5h12v1.5H2zm0 4h12V9H2zm0 4h12V13H2z"/></svg>;
      case 'lightbulb': return <svg viewBox="0 0 16 16" className={cls}><path d="M8 1.5a4.5 4.5 0 00-3 7.85V11h6V9.35A4.5 4.5 0 008 1.5zM5.5 12h5v1h-5v-1zm.5 2h4v.5a1 1 0 01-1 1H7a1 1 0 01-1-1V14z"/></svg>;
      case 'sparkles':  return <svg viewBox="0 0 16 16" className={cls}><path d="M8 1l1.4 4.6L14 7l-4.6 1.4L8 13l-1.4-4.6L2 7l4.6-1.4L8 1zM12.5 9.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z"/></svg>;
      case 'fin':       return <svg viewBox="0 0 16 16" className={cls}><circle cx="8" cy="8" r="6.5"/><path d="M5.5 7.5a2.5 2.5 0 015 0v1a2.5 2.5 0 01-5 0v-1z" fill="#fff"/></svg>;
      case 'copilot':   return <svg viewBox="0 0 16 16" className={cls}><path d="M8 1.5L9.6 6.4 14.5 8 9.6 9.6 8 14.5 6.4 9.6 1.5 8 6.4 6.4 8 1.5z"/></svg>;
      case 'phone':     return <svg viewBox="0 0 16 16" className={cls}><path d="M2.5 3a1 1 0 011-1h2.5l1 3-1.5 1c.5 1.5 1.5 2.5 3 3l1-1.5 3 1V11a1 1 0 01-1 1A10 10 0 012.5 3z"/></svg>;
      case 'chat':      return <svg viewBox="0 0 16 16" className={cls}><path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v7a1 1 0 01-1 1H6.5L4 13.5V11H3a1 1 0 01-1-1V3z"/></svg>;
      case 'star':      return <svg viewBox="0 0 16 16" className={cls}><path d="M8 1.5l2 4.5 5 .5-3.7 3.4 1 5L8 12.5l-4.3 2.4 1-5L1 6.5l5-.5 2-4.5z"/></svg>;
      case 'zap':       return <svg viewBox="0 0 16 16" className={cls}><path d="M9 1L3 9h4l-2 6 6-8H7l2-6z"/></svg>;
      case 'clock':     return <svg viewBox="0 0 16 16" className={cls}><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8.75 4v3.69l2.6 1.5-.75 1.3L7.25 8.5V4h1.5z"/></svg>;
      case 'sla':       return <svg viewBox="0 0 16 16" className={cls}><path d="M8 1.5l5.5 2.5v4c0 3-2.3 5.7-5.5 6.5C4.8 13.7 2.5 11 2.5 8V4L8 1.5zM6.5 8.7L5.5 9.7l2 2 3.5-4-1-1-2.5 2.7-1-.7z" fill="#fff"/></svg>;
      case 'inbox':     return <svg viewBox="0 0 16 16" className={cls}><path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v6h-3.5l-1 2h-3l-1-2H2V3z"/></svg>;
      case 'user':      return <svg viewBox="0 0 16 16" className={cls}><circle cx="8" cy="5" r="3"/><path d="M2.5 13c.5-2.5 2.8-4 5.5-4s5 1.5 5.5 4v.5h-11V13z"/></svg>;
      case 'ticket':    return <svg viewBox="0 0 16 16" className={cls}><path d="M2 5a1 1 0 011-1h10a1 1 0 011 1v2a1 1 0 100 2v2a1 1 0 01-1 1H3a1 1 0 01-1-1V9a1 1 0 100-2V5z"/></svg>;
      case 'doc':       return <svg viewBox="0 0 16 16" className={cls}><path d="M3 2a1 1 0 011-1h6l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2zm6.5 0v3h3l-3-3z" fillRule="evenodd"/></svg>;
      case 'globe':     return <svg viewBox="0 0 16 16" className={cls}><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM2.5 8c0-.7.1-1.4.3-2H6c-.1.6-.1 1.3-.1 2 0 .7 0 1.4.1 2H2.8c-.2-.6-.3-1.3-.3-2zm5.5 5.5c-.8 0-1.6-1.5-1.9-3.5h3.8c-.3 2-1.1 3.5-1.9 3.5zM6 6c.3-2 1.1-3.5 1.9-3.5S9.7 4 10 6H6zm5.7 4c.1-.6.1-1.3.1-2 0-.7 0-1.4-.1-2h2.9c.2.6.3 1.3.3 2s-.1 1.4-.3 2h-2.9z"/></svg>;
      case 'chart':     return <svg viewBox="0 0 16 16" className={cls}><path d="M2 13V9h2.5v4H2zm3.5 0V6.5H8V13H5.5zm3.5 0V4h2.5v9H9zm3.5 0V7.5H15V13h-2.5z"/></svg>;
      case 'ai':        return <svg viewBox="0 0 16 16" className={cls}><path d="M8 1.5L9.5 6 14 7.5 9.5 9 8 13.5 6.5 9 2 7.5 6.5 6 8 1.5zM12.5 10l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z"/></svg>;
      case 'area':      return <svg viewBox="0 0 16 16" className={cls}><path d="M2 13l3-4 3 2 3-5 3 3V13H2z"/></svg>;
      case 'robot':     return <svg viewBox="0 0 16 16" className={cls}><path d="M6 1.5h4v2H7.75v.75H10a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4a2 2 0 012-2h2.25V3.5H6v-2zM5.75 9a.75.75 0 101.5 0 .75.75 0 00-1.5 0zm4 0a.75.75 0 101.5 0 .75.75 0 00-1.5 0zM5 12.5h2V14H5v-1.5zm4 0h2V14H9v-1.5z"/></svg>;
      case 'approve':   return <svg viewBox="0 0 16 16" className={cls}><path d="M8 1.5l5.5 2.5v4c0 3-2.3 5.7-5.5 6.5C4.8 13.7 2.5 11 2.5 8V4L8 1.5zM6.5 8.7L5.5 9.7l2 2 3.5-4-1-1-2.5 2.7-1-.7z"/></svg>;
      case 'coin':      return <svg viewBox="0 0 16 16" className={cls}><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5v1M8 10.5v1M6 7.5C6 6.7 6.9 6 8 6s2 .7 2 1.5S9.1 9 8 9s-2 .7-2 1.5S6.9 12 8 12" fill="none" stroke="#fff" strokeWidth="1.2" strokeLinecap="round"/></svg>;
      case 'grid':      return <svg viewBox="0 0 16 16" className={cls}><rect x="1.5" y="1.5" width="5.6" height="5.6" rx="1.4"/><rect x="8.9" y="1.5" width="5.6" height="5.6" rx="1.4"/><rect x="1.5" y="8.9" width="5.6" height="5.6" rx="1.4"/><rect x="8.9" y="8.9" width="5.6" height="5.6" rx="1.4"/></svg>;
      case 'heart':     return <svg viewBox="0 0 16 16" className={cls}><path d="M8 14.5l-5.2-5A3.3 3.3 0 018 4.3a3.3 3.3 0 015.2 5.2z"/></svg>;
      case 'aiInfo':    return <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#e8572a]"><path d="M2 13V9.5h2.3V13H2zm3.3 0V6h2.3v7H5.3zm3.3 0V8h2.3v5H8.6zM12 5.6l.6 1.8 1.8.6-1.8.6L12 10.4l-.6-1.8L9.6 8l1.8-.6L12 5.6z"/></svg>;
    }
  }

  return (
    // Match Inbox sidebar UI: same width/bg/header font/item font.
    <div className="w-[236px] flex-shrink-0 bg-[#f8f8f7] rounded-[12px] border border-[#e9eae6] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 h-16 flex-shrink-0">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Informes</span>
        <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#e9eae6]">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462]"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto pl-3 pr-3 pb-2 flex flex-col gap-0.5 text-[13px]">
        {/* Top flat section */}
        {topItems.map(it => {
          const active = sub === it.key;
          return (
            <button
              key={it.key}
              onClick={() => onSelect(it.key)}
              className={`w-full min-h-8 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] transition-colors ${
                active ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]' : 'hover:bg-[#e9eae6]/40 text-[#1a1a1a]'
              }`}
            >
              <GroupIcon kind={it.icon} />
              <span className="flex-1 text-left leading-[15px]">{it.label}</span>
              {it.count !== undefined && <span className="text-[12px] text-[#646462] flex-shrink-0">{it.count}</span>}
              {it.external && <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462] flex-shrink-0" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5.5 10.5l5-5M6 5.5h4.5V10"/></svg>}
              {it.chevron && <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462] flex-shrink-0"><path d="M6 4l4 4-4 4z"/></svg>}
            </button>
          );
        })}

        {/* Divider before the report families */}
        <div className="my-2 mx-1 border-t border-[#e9eae6]" />

        {/* Report families (collapsible) */}
        {familyGroups.map(g => {
          const expanded = openGroups[g.label] === true;
          return (
            <div key={g.label}>
              <button
                onClick={() => toggleGroup(g.label)}
                className="w-full h-8 flex items-center gap-2 px-3 rounded-lg text-[13px] transition-colors hover:bg-[#e9eae6]/40"
              >
                <GroupIcon kind="folder" />
                <span className="flex-1 text-left text-[#1a1a1a] font-medium">{g.label}</span>
                <svg viewBox="0 0 16 16" className={`w-3 h-3 fill-[#646462] flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}><path d="M6 4l4 4-4 4z"/></svg>
              </button>
              {expanded && (
                <div className="flex flex-col pl-7 mt-0.5 mb-1 gap-0.5">
                  {g.items.map(it => (
                    <button
                      key={it.key}
                      onClick={() => onSelect(it.key)}
                      className={`h-8 flex items-center gap-2 pl-2 pr-3 rounded-lg text-left text-[13px] transition-colors ${
                        sub === it.key ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]' : 'text-[#1a1a1a] hover:bg-[#e9eae6]/40'
                      }`}
                    >
                      {it.icon && <GroupIcon kind={it.icon} />}
                      <span className="flex-1">{it.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="px-3 pb-3 pt-2 border-t border-[#e9eae6] flex-shrink-0">
        <button
          onClick={() => onSelect('administrar')}
          className={`w-full h-8 flex items-center gap-2 px-3 rounded-lg text-[13px] transition-colors ${
            sub === 'administrar' ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]' : 'hover:bg-[#e9eae6]/40 text-[#1a1a1a]'
          }`}
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.4"><path d="M2 4h12M2 8h12M2 12h12" strokeLinecap="round"/></svg>
          <span className="flex-1 text-left">Administrar</span>
        </button>
      </div>
    </div>
  );
}

function ReportsTopicsContent() {
  return (
    <>
      <ReportShellHeader title="Conversation tags" description="Explore the reasons your customers get in touch, and monitor trends in the topics that come up." />
      <ReportShellFilters />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 flex flex-col gap-4">
        <div className="self-start"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">Datos de ejemplo</span></div>
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="New conversations" value="124" change="18" trend="up" />
          <KpiCard label="Tagged conversations" value="96" change="12" trend="up" />
        </div>
        <KpiChartCard title="Tagged conversations - by time">
          <KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: 'Etiquetadas', data: mockSeries(11, 4, 0.4, 51), fill: true }]} type="line" showLegend={false} />
        </KpiChartCard>
        <KpiChartCard title="Most used conversation tags" height={240}>
          <KpiTable columns={['Etiqueta de la conversación', 'Nuevas conversaciones']} rows={[['Reembolsos', '32'], ['Envíos', '24'], ['Facturación', '18'], ['Cuenta', '12'], ['Producto', '9'], ['Not tagged', '29']]} />
        </KpiChartCard>
      </div>
    </>
  );
}

function ReportsKpiCard({ label, value, delta, sub }: { label: string; value: string; delta?: string; sub?: string }) {
  return (
    <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5">
      <div className="flex items-center gap-1 mb-3">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
        <span className="text-[12.5px] text-[#1a1a1a]">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[28px] font-bold text-[#1a1a1a] leading-none">{value}</span>
        {delta && <span className="text-[12px] text-[#16a34a] font-medium">▲ {delta}</span>}
      </div>
      {sub && <p className="text-[11.5px] text-[#646462] mt-1">{sub}</p>}
    </div>
  );
}

// Shared chrome (header + filter row) used by every custom-report screen.
// Lets each specialized report (Calls, Conversations, etc.) focus on its body.
function ReportShellHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.5"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M5 6h6M5 8h6M5 10h4"/></svg>
          <h1 className="text-[18px] font-bold text-[#1a1a1a] truncate">{title}</h1>
        </div>
        <p className="text-[12.5px] text-[#646462] mt-0.5 truncate">{description}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="inline-flex items-center gap-1 text-[12px] text-[#646462]">Propietario:
          <img src="/logos/clain-favicon.png" alt="Clain" className="w-3.5 h-3.5 object-contain" draggable={false} />
          <span className="text-[#1a1a1a]">Clain</span></span>
        <button className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#ededea]"><span className="text-[#646462]">⋯</span></button>
        <button className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#ededea]">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.4"><path d="M8 13S2 9.5 2 5.5C2 3.5 3.5 2 5.5 2c1.2 0 2 .7 2.5 1.5C8.5 2.7 9.3 2 10.5 2 12.5 2 14 3.5 14 5.5 14 9.5 8 13 8 13z"/></svg>
        </button>
        <button className="flex items-center gap-1 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[12.5px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><path d="M8 1v10M4 7l4 4 4-4M2 13h12"/></svg>
          Compartir
        </button>
        <button className="bg-white border border-[#e9eae6] rounded-full px-3 py-[6px] text-[12.5px] font-semibold text-[#1a1a1a] hover:bg-[#f5f5f4] flex items-center gap-1">
          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current"><path d="M2 14l3-1 8.5-8.5-2-2L3 11l-1 3z"/></svg>
          Editar
        </button>
      </div>
    </div>
  );
}

function ReportShellFilters({ extraFilter }: { extraFilter?: { icon?: 'user' | 'team' | 'sla' | 'ticket'; label: string } }) {
  function FilterIcon({ kind }: { kind: NonNullable<NonNullable<Parameters<typeof ReportShellFilters>[0]['extraFilter']>['icon']> }) {
    const cls = "w-3.5 h-3.5 fill-none stroke-[#646462]";
    if (kind === 'user')   return <svg viewBox="0 0 16 16" className={cls} strokeWidth="1.4"><circle cx="8" cy="6" r="2.5"/><path d="M3 13c0-2 2.5-3 5-3s5 1 5 3"/></svg>;
    if (kind === 'team')   return <svg viewBox="0 0 16 16" className={cls} strokeWidth="1.4"><circle cx="6" cy="6" r="2"/><circle cx="11" cy="6.5" r="1.5"/><path d="M2 13c0-2 2-3 4-3s4 1 4 3M9 13c0-1.5 1.4-2.4 3-2.4s3 .9 3 2.4"/></svg>;
    if (kind === 'sla')    return <svg viewBox="0 0 16 16" className={cls} strokeWidth="1.4"><path d="M3 3h10v10H3z"/><path d="M5.5 8l2 2 3.5-4"/></svg>;
    return                       <svg viewBox="0 0 16 16" className={cls} strokeWidth="1.4"><path d="M2.5 4h11v8h-11z"/><path d="M5 4V2.5h6V4"/></svg>;
  }
  return (
    <div className="px-6 py-3 border-b border-[#e9eae6] flex items-center gap-2 flex-shrink-0 flex-wrap">
      <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[12.5px] font-medium text-[#1a1a1a]">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5 2v3M11 2v3"/></svg>
        Apr 8, 2026 - May 5, 2026
        <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4z"/></svg>
      </button>
      {extraFilter && (
        <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[12.5px] font-medium text-[#1a1a1a]">
          {extraFilter.icon && <FilterIcon kind={extraFilter.icon} />}
          {extraFilter.label}
          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4z"/></svg>
        </button>
      )}
      <button className="flex items-center gap-1 border border-dashed border-[#d4d4d2] rounded-full px-3 py-[6px] text-[12.5px] text-[#646462]">
        <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
        Añadir filtro
      </button>
      <div className="ml-auto flex items-center gap-1 text-[12px] text-[#646462]">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v3l2 1.5"/></svg>
        Madrid time (GMT+2) <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current"><path d="M4 6l4 4 4-4z"/></svg>
      </div>
    </div>
  );
}

function ReportEmptyChart({ label, span = 1 }: { label: string; span?: 1 | 2 | 3 }) {
  const colSpan = span === 3 ? 'col-span-3' : span === 2 ? 'col-span-2' : 'col-span-1';
  return (
    <div className={`border border-[#e9eae6] rounded-[10px] bg-white p-5 ${colSpan}`}>
      <div className="flex items-center gap-1 mb-3">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
        <span className="text-[12.5px] text-[#1a1a1a]">{label}</span>
      </div>
      <div className="h-[140px] flex flex-col items-center justify-center text-center px-3">
        <svg viewBox="0 0 16 16" className="w-5 h-5 fill-none stroke-[#646462] mb-1" strokeWidth="1.4"><path d="M2 13V3M14 13H2M5 11V8M8 11V5M11 11V7"/></svg>
        <span className="text-[12px] text-[#1a1a1a]">Este gráfico no tiene datos</span>
        <span className="text-[11px] text-[#646462] mt-0.5">Para ver los datos aquí, cambia los filtros de informe o los ajustes de este gráfico</span>
      </div>
    </div>
  );
}

function ReportBarChartCard({ label, span = 1, bars, axis }: { label: string; span?: 1 | 2 | 3; bars: number[]; axis?: string[] }) {
  const colSpan = span === 3 ? 'col-span-3' : span === 2 ? 'col-span-2' : 'col-span-1';
  const max = Math.max(...bars, 1);
  return (
    <div className={`border border-[#e9eae6] rounded-[10px] bg-white p-5 ${colSpan}`}>
      <div className="flex items-center gap-1 mb-3">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
        <span className="text-[12.5px] text-[#1a1a1a]">{label}</span>
      </div>
      <div className="h-[140px] flex items-end gap-2 px-3">
        {bars.map((h, i) => (
          <div key={i} style={{ height: h ? `${(h / max) * 100}%` : '4px' }} className={`flex-1 ${h ? 'bg-[#3b59f6]' : 'bg-[#f3f3f1]'} rounded-t`} />
        ))}
      </div>
      {axis && (
        <div className="flex justify-between text-[10px] text-[#646462] mt-2 px-3">
          {axis.map((a, i) => <span key={i}>{a}</span>)}
        </div>
      )}
    </div>
  );
}

function ReportLineChartCard({ label, span = 1, points, axis, yMax = 5, yLabel }: { label: string; span?: 1 | 2 | 3; points: { i: number; v: number }[]; axis?: string[]; yMax?: number; yLabel?: string }) {
  const colSpan = span === 3 ? 'col-span-3' : span === 2 ? 'col-span-2' : 'col-span-1';
  const totalSlots = 28;
  const w = 100;
  const h = 100;
  const xFor = (i: number) => (i / (totalSlots - 1)) * w;
  const yFor = (v: number) => h - (Math.min(v, yMax) / yMax) * h;
  return (
    <div className={`border border-[#e9eae6] rounded-[10px] bg-white p-5 ${colSpan}`}>
      <div className="flex items-center gap-1 mb-3">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
        <span className="text-[12.5px] text-[#1a1a1a]">{label}</span>
      </div>
      <div className="relative h-[140px] px-3">
        {yLabel && <span className="absolute top-0 left-3 text-[10px] text-[#646462]">{yLabel}</span>}
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full">
          <line x1="0" y1={h} x2={w} y2={h} stroke="#e9eae6" strokeWidth="0.4" />
          {points.length > 1 && (
            <polyline
              fill="none"
              stroke="#3b59f6"
              strokeWidth="0.7"
              points={points.map(p => `${xFor(p.i)},${yFor(p.v)}`).join(' ')}
            />
          )}
          {points.map((p, idx) => (
            <circle key={idx} cx={xFor(p.i)} cy={yFor(p.v)} r="0.9" fill="#3b59f6" />
          ))}
        </svg>
        <span className="absolute bottom-0 left-3 text-[10px] text-[#646462]">0%</span>
      </div>
      {axis && (
        <div className="flex justify-between text-[10px] text-[#646462] mt-2 px-3">
          {axis.map((a, i) => <span key={i}>{a}</span>)}
        </div>
      )}
    </div>
  );
}

function ReportEmptyTable({ label, columns, height = 160 }: { label: string; columns?: string[]; height?: number }) {
  return (
    <div className="border border-[#e9eae6] rounded-[10px] bg-white col-span-3 overflow-hidden">
      <div className="px-5 py-3 flex items-center gap-1">
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
        <span className="text-[12.5px] text-[#1a1a1a]">{label}</span>
      </div>
      {columns && columns.length > 0 && (
        <div className="border-t border-b border-[#e9eae6] grid px-5 py-2 bg-[#fafaf9] text-[12px] font-medium text-[#646462]" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
          {columns.map((c, i) => <div key={i}>{c}</div>)}
        </div>
      )}
      <div className="flex flex-col items-center justify-center text-center px-5" style={{ height }}>
        <svg viewBox="0 0 16 16" className="w-5 h-5 fill-none stroke-[#646462] mb-1" strokeWidth="1.4"><path d="M2 13V3M14 13H2M5 11V8M8 11V5M11 11V7"/></svg>
        <span className="text-[12px] text-[#1a1a1a]">Esta tabla no tiene datos</span>
        <span className="text-[11px] text-[#646462] mt-0.5">Para ver los datos aquí, cambia los ajustes del gráfico</span>
      </div>
    </div>
  );
}

function ReportsCustomReport({ title, description }: { title: string; description: string }) {
  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="min-w-0 flex-1">
          <h1 className="text-[18px] font-bold text-[#1a1a1a] truncate">{title}</h1>
          <p className="text-[12.5px] text-[#646462] mt-0.5 truncate">{description}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="inline-flex items-center gap-1 text-[12px] text-[#646462]">Propietario:
          <img src="/logos/clain-favicon.png" alt="Clain" className="w-3.5 h-3.5 object-contain" draggable={false} />
          <span className="text-[#1a1a1a]">Clain</span></span>
          <button className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#ededea]"><span className="text-[#646462]">⋯</span></button>
          <button className="flex items-center gap-1 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[12.5px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><path d="M8 1v10M4 7l4 4 4-4M2 13h12"/></svg>
            Compartir
          </button>
          <button className="bg-white border border-[#e9eae6] rounded-full px-3 py-[6px] text-[12.5px] font-semibold text-[#1a1a1a] hover:bg-[#f5f5f4]">Editar</button>
        </div>
      </div>
      <div className="px-6 py-3 border-b border-[#e9eae6] flex items-center gap-2 flex-shrink-0 flex-wrap">
        <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[12.5px] font-medium text-[#1a1a1a]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5 2v3M11 2v3"/></svg>
          Apr 8, 2026 - May 5, 2026
          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4z"/></svg>
        </button>
        <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[12.5px] font-medium text-[#1a1a1a]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="6" r="2.5"/><path d="M3 13c0-2 2.5-3 5-3s5 1 5 3"/></svg>
          Compañero de equipo es Cualquiera
          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4z"/></svg>
        </button>
        <button className="flex items-center gap-1 border border-dashed border-[#d4d4d2] rounded-full px-3 py-[6px] text-[12.5px] text-[#646462]">
          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
          Añadir filtro
        </button>
        <div className="ml-auto flex items-center gap-1 text-[12px] text-[#646462]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v3l2 1.5"/></svg>
          Madrid time (GMT+2) <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current"><path d="M4 6l4 4 4-4z"/></svg>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 p-6 grid grid-cols-3 gap-4">
        <div className="col-span-2"><ReportsKpiCard label="Percentage of conversations using Copilot" value="—" sub="0 de 0" /></div>
        <ReportsKpiCard label="Copilot questions" value="1" delta="1" />
        <ReportsKpiCard label="Conversations using Copilot" value="0" />
        <ReportsKpiCard label="Percentage of conversations with a copied Copilot answer" value="—" sub="0 de 0" />
        <ReportsKpiCard label="Teammates using Copilot" value="1" delta="1" />
        <div className="col-span-3 grid grid-cols-2 gap-4">
        <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5">
          <div className="flex items-center gap-1 mb-3">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">Percentage of conversations using Copilot</span>
          </div>
          <div className="h-[140px] flex flex-col items-center justify-center text-center px-3">
            <svg viewBox="0 0 16 16" className="w-5 h-5 fill-none stroke-[#646462] mb-1" strokeWidth="1.4"><path d="M2 13V3M14 13H2M5 11V8M8 11V5M11 11V7"/></svg>
            <span className="text-[12px] text-[#1a1a1a]">Este gráfico no tiene datos</span>
            <span className="text-[11px] text-[#646462] mt-0.5">Para ver los datos aquí, cambia los filtros de informe o los ajustes de este gráfico</span>
          </div>
        </div>
        <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5">
          <div className="flex items-center gap-1 mb-3">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">Teammates using Copilot</span>
          </div>
          <div className="relative h-[140px] px-3">
            <div className="absolute left-3 top-0 text-[10px] text-[#646462]">2</div>
            <div className="absolute left-3 bottom-5 text-[10px] text-[#646462]">0</div>
            <div className="ml-5 h-full flex items-end gap-1">
              {Array.from({ length: 28 }, (_, i) => (
                <div key={i} style={{ height: i === 26 ? '70%' : '0%' }} className={`flex-1 ${i === 26 ? 'bg-[#3b59f6]' : 'bg-transparent'} rounded-t`} />
              ))}
            </div>
          </div>
          <div className="flex justify-between text-[10px] text-[#646462] mt-1 px-3 ml-5">
            <span>Apr 8</span><span>Apr 13</span><span>Apr 20</span><span>Apr 27</span><span>May 4</span>
          </div>
        </div>
        </div>

        <div className="border border-[#e9eae6] rounded-[10px] bg-white col-span-3 overflow-hidden">
          <div className="px-5 py-3 flex items-center gap-1">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">Teammate overview</span>
          </div>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-t border-b border-[#e9eae6] bg-[#fafaf9]">
                <th className="text-left font-medium text-[#646462] px-5 py-2 w-[24%]">
                  <div className="flex items-center gap-1">Compañero de equipo<svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M5 7l3-3 3 3M5 9l3 3 3-3"/></svg></div>
                </th>
                <th className="text-left font-medium text-[#646462] px-5 py-2 w-[19%]">
                  <div className="flex items-center gap-1">Tasa de uso de conversaciones de Copilot
                    <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6"/><path d="M8 6v3M8 11h.01"/></svg>
                    <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M5 7l3-3 3 3M5 9l3 3 3-3"/></svg>
                  </div>
                </th>
                <th className="text-left font-medium text-[#646462] px-5 py-2 w-[19%]">
                  <div className="flex items-center gap-1">Conversaciones con Copilot
                    <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6"/><path d="M8 6v3M8 11h.01"/></svg>
                    <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M5 7l3-3 3 3M5 9l3 3 3-3"/></svg>
                  </div>
                </th>
                <th className="text-left font-medium text-[#646462] px-5 py-2 w-[19%]">
                  <div className="flex items-center gap-1">Preguntas sobre Copilot
                    <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6"/><path d="M8 6v3M8 11h.01"/></svg>
                  </div>
                </th>
                <th className="text-left font-medium text-[#646462] px-5 py-2 w-[19%]">
                  <div className="flex items-center gap-1">Tasa de respuestas copiadas de Copilot
                    <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6"/><path d="M8 6v3M8 11h.01"/></svg>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#e9eae6]">
                <td className="px-5 py-3 text-[#1a1a1a]">Hector Vidal Sanchez</td>
                <td className="px-5 py-3 text-[#646462]">-</td>
                <td className="px-5 py-3 text-[#1a1a1a]">0</td>
                <td className="px-5 py-3 text-[#1a1a1a]">1</td>
                <td className="px-5 py-3 text-[#646462]">-</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5 col-span-3">
          <div className="flex items-center gap-1 mb-3">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">Copilot content performance</span>
          </div>
          <div className="h-[200px] flex flex-col items-center justify-center text-center">
            <svg viewBox="0 0 16 16" className="w-7 h-7 fill-none stroke-[#646462] mb-2" strokeWidth="1.4"><path d="M2 13V3M14 13H2M5 11V8M8 11V5M11 11V7"/></svg>
            <span className="text-[13px] font-medium text-[#1a1a1a]">Esta tabla no tiene datos</span>
            <span className="text-[12px] text-[#646462] mt-1">Para ver los datos aquí, cambia los ajustes del gráfico</span>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Per-report custom Reports (Figma 3:16295, 3:20010, 3:22346, 3:24515,
//    3:26772, 4:16934, 4:19011, 4:22197, 4:24401) ─────────────────────────────

function ReportsCallsContent({ period, channel }: { period: string; channel: string }) {
  useApi(() => reportsApi.calls(period, channel), [period, channel], null);
  return (
    <>
      <ReportShellHeader title="Calls" description="Use the Calls report to visualize and explore your team's calling activity." />
      <ReportShellFilters />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 flex flex-col gap-4">
        <div className="self-start"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">Datos de ejemplo</span></div>
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Inbound calls" value="24" change="6" trend="up" />
          <KpiCard label="Outbound calls" value="12" change="3" trend="up" />
          <KpiCard label="Messenger calls" value="8" change="1" trend="down" />
          <KpiCard label="Median call duration" value="4m 32s" change="12s" trend="up" />
          <KpiCard label="Median call in queue time" value="28s" change="4s" trend="up" />
          <KpiCard label="Median call talk time" value="3m 51s" change="8s" trend="down" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <KpiChartCard title="Calls - by direction"><KpiDoughnut labels={['Inbound', 'Outbound', 'Messenger']} values={[24, 12, 8]} /></KpiChartCard>
          <KpiChartCard title="Inbound calls - by time and call state"><KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: 'Atendidas', data: mockSeries(4, 2, 0.3, 31) }, { label: 'Perdidas', data: mockSeries(1, 1, 0, 32) }]} type="bar" /></KpiChartCard>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <KpiChartCard title="Median call talk time (min)"><KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: 'Minutos', data: mockSeries(3.8, 0.8, 0, 33), fill: true }]} type="line" showLegend={false} /></KpiChartCard>
          <KpiChartCard title="Median call in queue time (s)"><KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: 'Segundos', data: mockSeries(28, 8, -0.5, 34), fill: true }]} type="line" showLegend={false} /></KpiChartCard>
        </div>
        <KpiChartCard title="Call performance" height={220}>
          <KpiTable columns={['Compañero', 'Llamadas', 'Duración media', 'En cola']} rows={[['Ana Torres', '18', '4m 10s', '22s'], ['Luis Vega', '14', '5m 02s', '31s'], ['María Ruiz', '12', '3m 44s', '19s']]} />
        </KpiChartCard>
      </div>
    </>
  );
}

function ReportsConversationsContent({ period, channel }: { period: string; channel: string }) {
  const { data } = useApi(() => reportsApi.conversations(period, channel), [period, channel], null);
  // Real data when the endpoint returns it; otherwise a deterministic preview
  // matching the design (New=4 spike, Open across last weeks, 1 tag hit).
  const hasReal = !!(data?.kpis && Object.values(data.kpis).some((v: any) => Number(v) > 0));
  const k = (key: string, demo: any) => (hasReal ? (data.kpis?.[key] ?? 0) : demo);
  const labels = ['Jun 22', 'Jun 29', 'Jul 6', 'Jul 13', 'Jul 20'];
  const newByTime = hasReal ? (data.timeSeries?.map((t: any) => t.count) ?? [0, 0, 0, 0, 0]) : [0, 0, 0, 4, 0];
  const openByTime = [0, 0, 0, 4, 4];
  const repliedByTime = [0, 0, 0, 0, 0];
  const heatmap = (() => { const m = Array.from({ length: 7 }, () => new Array(24).fill(0)); m[3][16] = 4; return m; })();
  const isDemo = !hasReal;
  return (
    <>
      <ReportShellHeader title="Conversations" description="Track your new inbound conversations, busiest periods and biggest customer issues, and optimize your support." />
      <ReportShellFilters />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 flex flex-col gap-4">
        {isDemo && <div className="self-start"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">Datos de ejemplo</span></div>}
        <div className="grid grid-cols-4 gap-3">
          <KpiCard label="New conversations" value={String(k('new_conversations', 4))} change={isDemo ? '4' : undefined} trend="up" />
          <KpiCard label="Conversations replied to" value={String(k('conversations_replied', 0))} />
          <KpiCard label="Replies sent" value={String(k('replies_sent', 0))} />
          <KpiCard label="Closed conversations" value={String(k('closed_conversations', 0))} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Reopened conversations" value={String(k('reopened_conversations', 0))} />
          <KpiCard label="Open conversations" value={String(k('open_conversations', 4))} change={isDemo ? '4' : undefined} trend="up" />
          <KpiCard label="Snoozed conversations" value={String(k('snoozed_conversations', 0))} />
        </div>
        <KpiChartCard title="New conversations - by time"><KpiTimeSeries labels={labels} series={[{ label: 'Nuevas conversaciones', data: newByTime }]} type="bar" /></KpiChartCard>
        <div className="grid grid-cols-2 gap-4">
          <KpiChartCard title="New conversations - by channel">
            {isDemo ? <KpiDoughnut labels={['Desconocido', 'Chat', 'Email']} values={[2, 1, 1]} /> : <KpiEmpty />}
          </KpiChartCard>
          <KpiChartCard title="Replies sent - by time">
            {isDemo ? <KpiTimeSeries labels={labels} series={[{ label: 'Respuestas enviadas', data: [0, 1, 0, 3, 1], fill: true }]} type="line" showLegend={false} /> : <KpiEmpty />}
          </KpiChartCard>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <KpiChartCard title="Closed vs. Reopened conversations">
            {isDemo ? <KpiTimeSeries labels={labels} series={[{ label: 'Cerradas', data: [0, 0, 1, 2, 1] }, { label: 'Reabiertas', data: [0, 0, 0, 1, 0] }]} type="bar" /> : <KpiEmpty />}
          </KpiChartCard>
          <KpiChartCard title="Open and Snoozed conversations">
            <KpiTimeSeries labels={labels} series={[{ label: 'Conversaciones abiertas', data: openByTime }, { label: 'Conversaciones pospuestas', data: [0, 0, 0, 0, 0] }]} type="bar" />
          </KpiChartCard>
        </div>
        <KpiChartCard title="Comparison of New Conversations and Replies">
          <KpiTimeSeries labels={labels} series={[{ label: 'Nuevas conversaciones', data: newByTime }, { label: 'Conversaciones respondidas a', data: repliedByTime }]} type="bar" />
        </KpiChartCard>
        <KpiChartCard title="Hourly Distribution of New Conversations" height={300}>
          <KpiHeatmap rows={['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']} cols={Array.from({ length: 24 }, (_, i) => String(i))} matrix={heatmap} />
        </KpiChartCard>
      </div>
    </>
  );
}

function ReportsCsatContent({ period, channel }: { period: string; channel: string }) {
  useApi(() => reportsApi.csat(period, channel), [period, channel], null);
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-4 flex flex-col gap-4">
      <KpiSectionHeader title={title} />{children}
    </div>
  );
  return (
    <>
      <ReportShellHeader title="Surveyed CSAT" description="Get a holistic view of customer satisfaction across all support channels, teammates, AI agents, and chatbots." />
      <ReportShellFilters />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 flex flex-col gap-5">
        <div className="self-start"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">Datos de ejemplo</span></div>
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Overall CSAT score" value="91%" sub="248 de 273" change="1 pt" trend="up" />
          <KpiCard label="Teammate CSAT score" value="93%" sub="164 de 176" change="2 pts" trend="up" />
          <KpiCard label="Fin AI agent CSAT score" value="89%" sub="97 de 109" change="3 pts" trend="up" />
        </div>
        <KpiChartCard title="CSAT score over time (avg %)">
          <KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: 'CSAT', data: mockSeries(90, 4, 0.2, 111), fill: true }]} type="line" showLegend={false} />
        </KpiChartCard>
        <Section title="Conversation ratings and remarks">
          <div className="grid grid-cols-2 gap-4">
            <KpiChartCard title="Conversation ratings - by conversation rating">
              <KpiTimeSeries labels={['😡 1', '🙁 2', '😐 3', '🙂 4', '🤩 5']} series={[{ label: 'Valoraciones', data: [4, 4, 17, 68, 180] }]} type="bar" showLegend={false} />
            </KpiChartCard>
            <KpiChartCard title="Conversation ratings - by channel">
              <KpiTimeSeries labels={['Chat', 'Email', 'WhatsApp', 'Teléfono']} series={[
                { label: 'Positivo', data: [128, 74, 31, 15] },
                { label: 'Negativo', data: [4, 2, 1, 1] },
              ]} type="bar" stacked />
            </KpiChartCard>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label="🤩 Positive remarks" value="248" change="12" trend="up" />
            <KpiCard label="😐 Neutral remarks" value="17" change="2" trend="down" />
            <KpiCard label="🥴 Negative remarks" value="8" change="3" trend="down" />
          </div>
          <KpiChartCard title="Conversation ratings" height={240}>
            <KpiTable columns={['Conversación', 'Valoración', 'Comentario', 'Canal', 'Fecha']} rows={[
              ['#1042', '🤩 5', 'Súper rápido, gracias', 'Chat', 'Jul 18'],
              ['#1039', '😡 1', 'Demasiada espera', 'Email', 'Jul 17'],
              ['#1036', '🙂 4', 'Resuelto a la primera', 'Chat', 'Jul 16'],
              ['#1031', '😐 3', 'Correcto pero lento', 'WhatsApp', 'Jul 15'],
              ['#1028', '🤩 5', 'Muy amable', 'Teléfono', 'Jul 14'],
            ]} />
          </KpiChartCard>
        </Section>
        <Section title="CSAT survey">
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="CSAT request rate" value="74%" sub="273 de 369" change="5 pts" trend="up" />
            <KpiCard label="CSAT response rate" value="41%" sub="112 de 273" change="2 pts" trend="up" />
          </div>
          <KpiChartCard title="CSAT survey request & response rates - by time (%)">
            <KpiTimeSeries labels={MOCK_WEEKS} series={[
              { label: 'Tasa de solicitud', data: mockSeries(72, 6, 0.4, 112), fill: true },
              { label: 'Tasa de respuesta', data: mockSeries(40, 6, 0.3, 113) },
            ]} type="line" />
          </KpiChartCard>
        </Section>
        <Section title="Dissatisfaction drivers">
          <KpiChartCard title="Topics driving dissatisfaction">
            <KpiTimeSeries labels={['Tiempo de espera', 'Resolución incompleta', 'Tono', 'No resuelto', 'Facturación']} series={[{ label: 'Conversaciones', data: [12, 8, 5, 4, 3] }]} type="bar" showLegend={false} />
          </KpiChartCard>
        </Section>
        <Section title="Teammate performance">
          <KpiChartCard title="Teammate CSAT performance" height={240}>
            <KpiTable columns={['Compañero de equipo', 'Avg CSAT', 'Positivos', 'Negativos', 'Encuestas']} rows={[
              ['Ana Torres', '95%', '55', '3', '58'],
              ['María Ruiz', '93%', '44', '3', '47'],
              ['Luis Vega', '90%', '35', '4', '39'],
              ['Jon Aixa', '87%', '17', '3', '20'],
            ]} />
          </KpiChartCard>
        </Section>
      </div>
    </>
  );
}

function ReportsEffectivenessContent({ period, channel }: { period: string; channel: string }) {
  useApi(() => reportsApi.effectiveness(period, channel), [period, channel], null);
  return (
    <>
      <ReportShellHeader title="Effectiveness" description="Measure how effectively your teams handle conversations with the Effectiveness report." />
      <ReportShellFilters />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 flex flex-col gap-4">
        <div className="self-start"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">Datos de ejemplo</span></div>
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Conversations replied to" value="128" change="12%" trend="up" />
          <KpiCard label="Closed conversations on first contact rate" value="62%" sub="79 de 128" change="4 pts" trend="up" />
          <KpiCard label="Median replies to close a conversation" value="3.4" change="0.3" trend="down" />
          <KpiCard label="Conversations reassigned" value="14" change="2" trend="down" />
          <KpiCard label="Median time to first assignment" value="4m 12s" change="18s" trend="up" />
          <KpiCard label="Median time from first assignment to close" value="2h 18m" change="9m" trend="up" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <KpiChartCard title="Median replies to close a conversation - by time"><KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: 'Réplicas', data: mockSeries(3.4, 0.8, -0.05, 11), fill: true }]} type="line" showLegend={false} /></KpiChartCard>
          <KpiChartCard title="Median time to first assignment (min)"><KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: 'Minutos', data: mockSeries(4.2, 1.2, -0.08, 12), fill: true }]} type="line" showLegend={false} /></KpiChartCard>
        </div>
        <KpiChartCard title="Closed conversations on first contact rate - by time">
          <KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: 'Tasa (%)', data: mockSeries(60, 8, 0.6, 13), fill: true }]} type="line" showLegend={false} />
        </KpiChartCard>
        <div className="grid grid-cols-2 gap-4">
          <KpiChartCard title="Conversations reassigned - by time"><KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: 'Reasignadas', data: mockSeries(2, 1.5, 0, 14) }]} type="bar" showLegend={false} /></KpiChartCard>
          <KpiChartCard title="Median time from first assignment to close (h)"><KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: 'Horas', data: mockSeries(2.3, 0.6, -0.03, 15), fill: true }]} type="line" showLegend={false} /></KpiChartCard>
        </div>
      </div>
    </>
  );
}

function ReportsCxScoreContent({ period, channel }: { period: string; channel: string }) {
  useApi(() => reportsApi.csat(period, channel), [period, channel], null);
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-4 flex flex-col gap-4">
      <KpiSectionHeader title={title} />{children}
    </div>
  );
  return (
    <>
      <ReportShellHeader title="CX Score" description="Analyze your customer experience across teammates and AI Agents using a breakthrough AI-generated metric." />
      <ReportShellFilters />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 flex flex-col gap-5">
        <div className="self-start"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">Datos de ejemplo</span></div>
        <Section title="Customer Experience score overview">
          <div className="grid grid-cols-4 gap-3">
            {([['Overall CX Score', '82'], ['Fin AI Agent CX Score', '84'], ['Teammate CX Score', '88'], ['Fin AI Agent & Teammate CX Score', '85']] as [string, string][]).map(([l, v]) => (
              <KpiCard key={l} label={l} value={v} sub="de 100" change="2" trend="up" />
            ))}
          </div>
          <KpiChartCard title="CX Score over time"><KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: 'CX Score', data: mockSeries(80, 5, 0.4, 21), fill: true }]} type="line" showLegend={false} /></KpiChartCard>
        </Section>
        <Section title="CX Score reasons">
          <div className="grid grid-cols-2 gap-4">
            <KpiChartCard title="Negative CX score reasons 😖"><KpiDoughnut labels={['Tiempo de espera', 'Resolución incompleta', 'Tono', 'No resuelto', 'Otros']} values={[38, 24, 16, 14, 8]} /></KpiChartCard>
            <KpiChartCard title="Positive CX score reasons 😀"><KpiDoughnut labels={['Rapidez', 'Resolución', 'Amabilidad', 'Proactividad']} values={[42, 31, 18, 9]} /></KpiChartCard>
          </div>
          <KpiChartCard title="Conversation topics with negative CX score"><KpiTimeSeries labels={['Reembolsos', 'Envíos', 'Facturación', 'Cuenta', 'Producto']} series={[{ label: 'Conversaciones', data: [9, 7, 5, 4, 3] }]} type="bar" showLegend={false} /></KpiChartCard>
        </Section>
        <Section title="Customer Experience ratings & explanations">
          <div className="grid grid-cols-2 gap-4">
            <KpiChartCard title="CX Score ratings - by CX Score rating"><KpiTimeSeries labels={['1', '2', '3', '4', '5']} series={[{ label: 'Valoraciones', data: [3, 5, 12, 34, 58] }]} type="bar" showLegend={false} /></KpiChartCard>
            <KpiChartCard title="CX Score ratings - Fin vs equipo"><KpiTimeSeries labels={['1', '2', '3', '4', '5']} series={[{ label: 'Fin', data: [1, 2, 5, 16, 30] }, { label: 'Equipo', data: [2, 3, 7, 18, 28] }]} type="bar" /></KpiChartCard>
          </div>
          <KpiChartCard title="CX Score ratings"><KpiTable columns={['Conversación', 'CX Score', 'Motivo', 'Fecha']} rows={[['#1042', '92', 'Rapidez', 'Jul 18'], ['#1039', '35', 'Tiempo de espera', 'Jul 17'], ['#1036', '88', 'Resolución', 'Jul 16'], ['#1031', '74', 'Tono', 'Jul 15']]} /></KpiChartCard>
        </Section>
      </div>
    </>
  );
}

function ReportsResponsivenessContent({ period, channel }: { period: string; channel: string }) {
  useApi(() => reportsApi.responsiveness(period, channel), [period, channel], null);
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-4 flex flex-col gap-4">
      <KpiSectionHeader title={title} />{children}
    </div>
  );
  const HOURS = ['12 a.m.', '3 a.m.', '6 a.m.', '9 a.m.', '12 p.m.', '3 p.m.', '6 p.m.', '9 p.m.'];
  const DAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
  const frtBreakdown: [string, string][] = [['< 30s', '18%'], ['30s - 2m', '31%'], ['2m - 5m', '22%'], ['5m - 10m', '13%'], ['10m - 30m', '9%'], ['30m - 1h', '4%'], ['> 1h', '3%']];
  const ttcBreakdown: [string, string][] = [['< 5m', '9%'], ['5m - 15m', '17%'], ['15m - 30m', '21%'], ['30m - 1h', '24%'], ['1h - 3h', '15%'], ['3h - 8h', '9%'], ['> 8h', '5%']];
  return (
    <>
      <ReportShellHeader title="Responsiveness" description="See how quickly your team respond to, and close conversations with the Responsiveness report." />
      <ReportShellFilters />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 flex flex-col gap-5">
        <div className="self-start"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">Datos de ejemplo</span></div>
        <Section title="Tiempos de respuesta">
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label="Median response time: including time assigned to bot" value="3m 42s" change="14s" trend="up" />
            <KpiCard label="Median first response time: including time assigned to bot" value="1m 58s" change="9s" trend="up" />
            <KpiCard label="Median time to close: including time assigned to bot" value="2h 24m" change="11m" trend="up" />
          </div>
          <KpiChartCard title="Median response time: including time assigned to bot - by time (min)">
            <KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: 'Mediana (min)', data: mockSeries(3.7, 0.9, -0.05, 61, 1), fill: true }]} type="line" showLegend={false} />
          </KpiChartCard>
        </Section>
        <Section title="Primera respuesta">
          <div className="grid grid-cols-2 gap-4">
            <KpiChartCard title="Median first response time - by time (min)">
              <KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: 'Mediana (min)', data: mockSeries(2, 0.6, -0.04, 62, 1), fill: true }]} type="line" showLegend={false} />
            </KpiChartCard>
            <KpiChartCard title="First response time breakdown" info>
              <KpiTable columns={['Intervalos de tiempo', '% replies']} rows={frtBreakdown} />
            </KpiChartCard>
          </div>
        </Section>
        <Section title="Tiempo hasta el cierre">
          <div className="grid grid-cols-2 gap-4">
            <KpiChartCard title="Median time to close - by time (h)">
              <KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: 'Mediana (h)', data: mockSeries(2.4, 0.7, -0.03, 63, 1), fill: true }]} type="line" showLegend={false} />
            </KpiChartCard>
            <KpiChartCard title="Time to close breakdown" info>
              <KpiTable columns={['Intervalos de tiempo', '% conversations']} rows={ttcBreakdown} />
            </KpiChartCard>
          </div>
        </Section>
        <Section title="Distribución horaria">
          <KpiChartCard title="Median hourly distribution of response times" height={320}>
            <KpiHeatmap rows={HOURS} cols={DAYS} matrix={mockHeatmap(64)} colorHue="#8b5cf6" />
          </KpiChartCard>
        </Section>
      </div>
    </>
  );
}

function ReportsSlasContent({ period, channel }: { period: string; channel: string }) {
  useApi(() => reportsApi.sla(period, channel), [period, channel], null);
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-4 flex flex-col gap-4">
      <KpiSectionHeader title={title} />{children}
    </div>
  );
  return (
    <>
      <ReportShellHeader title="SLAs" description="Review your team's performance against your Service Level Agreements with the SLAs report." />
      <ReportShellFilters extraFilter={{ icon: 'sla', label: 'SLA (Acuerdo de nivel de servicio) es Cualquiera' }} />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 flex flex-col gap-5">
        <div className="self-start"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">Datos de ejemplo</span></div>
        <Section title="Cumplimiento de SLA">
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label="Conversation and ticket SLA miss rate" value="8%" sub="14 de 176" change="2 pts" trend="up" />
            <KpiCard label="Conversations and tickets with SLA" value="176" change="11%" trend="up" />
            <KpiCard label="Conversations and tickets with missed SLA" value="14" change="3" trend="up" />
          </div>
          <KpiChartCard title="Targets hit over time">
            <KpiTimeSeries labels={MOCK_WEEKS} series={[
              { label: 'Cumplidos', data: mockSeries(150, 24, 4, 121), fill: true },
              { label: 'Incumplidos', data: mockSeries(14, 6, -0.3, 122) },
            ]} type="bar" />
          </KpiChartCard>
        </Section>
        <Section title="Desglose de SLA">
          <div className="grid grid-cols-2 gap-4">
            <KpiChartCard title="SLA por prioridad">
              <KpiTimeSeries labels={['Urgente', 'Alta', 'Media', 'Baja']} series={[
                { label: 'Cumplido', data: [22, 48, 61, 31] },
                { label: 'Incumplido', data: [4, 5, 3, 2] },
              ]} type="bar" stacked />
            </KpiChartCard>
            <KpiChartCard title="SLA incumplidos por tipo de caso">
              <KpiTable columns={['Tipo de caso', 'Incumplidos']} rows={[
                ['Reembolso', '5'], ['Envío', '4'], ['Facturación', '3'], ['Cuenta', '2'],
              ]} />
            </KpiChartCard>
          </div>
          <KpiChartCard title="SLA performance" height={220}>
            <KpiTable columns={['Estado SLA', 'Casos', '% del total']} rows={[
              ['Cumplido', '162', '92%'], ['Incumplido', '14', '8%'], ['Total', '176', '100%'],
            ]} />
          </KpiChartCard>
        </Section>
      </div>
    </>
  );
}

function ReportsTeamInboxContent({ period, channel }: { period: string; channel: string }) {
  useApi(() => reportsApi.teamInbox(period, channel), [period, channel], null);
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-4 flex flex-col gap-4">
      <KpiSectionHeader title={title} />{children}
    </div>
  );
  return (
    <>
      <ReportShellHeader title="Team inbox performance" description="Check in on how each team inbox is performing with accurate metrics and insights." />
      <ReportShellFilters extraFilter={{ icon: 'team', label: 'Equipo es Cualquiera' }} />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 flex flex-col gap-5">
        <div className="self-start"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">Datos de ejemplo</span></div>
        <Section title="Rendimiento del inbox de equipo">
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label="Median team assignment to first response" value="3m 18s" change="12s" trend="up" />
            <KpiCard label="Median team assignment to subsequent response" value="5m 44s" change="21s" trend="down" />
            <KpiCard label="Median team assignment to close" value="1h 52m" change="8m" trend="up" />
            <KpiCard label="Conversations assigned" value="284" change="9%" trend="up" />
            <KpiCard label="Conversations replied to" value="271" change="7%" trend="up" />
            <KpiCard label="Closed conversations" value="248" change="11%" trend="up" />
          </div>
          <KpiChartCard title="Teammate Activity – conversaciones por día">
            <KpiTimeSeries labels={MOCK_DAYS} series={[
              { label: 'Asignadas', data: mockDaily(40, 14, 1, 131), fill: true },
              { label: 'Respondidas', data: mockDaily(37, 12, 1, 132) },
              { label: 'Cerradas', data: mockDaily(33, 11, 1, 133) },
            ]} type="line" />
          </KpiChartCard>
        </Section>
        <Section title="Comparativa por inbox">
          <KpiChartCard title="Comparison of Team inbox performance" height={240}>
            <KpiTable columns={['Inbox', 'Assigned', 'Replied', 'Closed', 'Median close time']} rows={[
              ['Soporte general', '124', '119', '108', '1h 44m'],
              ['Facturación', '68', '64', '59', '2h 12m'],
              ['Técnico', '52', '50', '47', '2h 38m'],
              ['Ventas', '40', '38', '34', '1h 22m'],
            ]} />
          </KpiChartCard>
        </Section>
      </div>
    </>
  );
}

function ReportsTeammateContent({ period, channel }: { period: string; channel: string }) {
  useApi(() => reportsApi.teammate(period, channel), [period, channel], null);
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-4 flex flex-col gap-4">
      <KpiSectionHeader title={title} />{children}
    </div>
  );
  return (
    <>
      <ReportShellHeader title="Teammate performance" description="Check in on teammate performance with accurate metrics and insights." />
      <ReportShellFilters extraFilter={{ icon: 'user', label: 'Compañero de equipo es Cualquiera' }} />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 flex flex-col gap-5">
        <div className="self-start"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">Datos de ejemplo</span></div>
        <Section title="Rendimiento del compañero">
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="Median teammate handling time" value="11m 08s" change="40s" trend="up" />
            <KpiCard label="Median adjusted teammate handling time" value="9m 32s" change="28s" trend="up" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label="Median teammate assignment to first response" value="2m 54s" change="11s" trend="up" />
            <KpiCard label="Median teammate assignment to subsequent response" value="4m 37s" change="18s" trend="down" />
            <KpiCard label="Median teammate assignment to close" value="1h 46m" change="9m" trend="up" />
            <KpiCard label="Conversations assigned per active hour" value="5.1" change="0.4" trend="up" />
            <KpiCard label="Conversations replied to per active hour" value="6.8" change="0.5" trend="up" />
            <KpiCard label="Conversations closed per active hour" value="4.2" change="0.3" trend="up" />
          </div>
          <KpiChartCard title="Teammate Productivity – casos cerrados por día">
            <KpiTimeSeries labels={MOCK_DAYS} series={[{ label: 'Casos cerrados', data: mockDaily(36, 12, 1, 141), fill: true }]} type="bar" showLegend={false} />
          </KpiChartCard>
        </Section>
        <Section title="Satisfacción del compañero">
          <div className="grid grid-cols-3 gap-4">
            <KpiCard label="Teammate CSAT score" value="92%" sub="164 de 176" change="2 pts" trend="up" />
            <div className="col-span-2">
              <KpiChartCard title="Teammate conversation ratings - by conversation rating">
                <KpiTimeSeries labels={['😡 1', '🙁 2', '😐 3', '🙂 4', '🤩 5']} series={[{ label: 'Valoraciones', data: [3, 3, 12, 52, 106] }]} type="bar" showLegend={false} />
              </KpiChartCard>
            </div>
          </div>
        </Section>
        <Section title="Comparativa de compañeros">
          <KpiChartCard title="Comparison of Teammate performance" height={260}>
            <KpiTable columns={['Compañero de equipo', 'Asignadas', 'Respondidas', 'Respuestas enviadas', 'Cerradas', 'T. gestión', 'CSAT']} rows={[
              ['Ana Torres', '92', '90', '318', '84', '9m 42s', '95%'],
              ['Luis Vega', '78', '75', '264', '69', '11m 18s', '90%'],
              ['María Ruiz', '67', '65', '231', '61', '10m 06s', '93%'],
              ['Jon Aixa', '47', '45', '158', '41', '12m 30s', '87%'],
            ]} />
          </KpiChartCard>
        </Section>
      </div>
    </>
  );
}

function ReportsTicketsContent({ period, channel }: { period: string; channel: string }) {
  useApi(() => reportsApi.tickets(period, channel), [period, channel], null);
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-4 flex flex-col gap-4">
      <KpiSectionHeader title={title} />{children}
    </div>
  );
  return (
    <>
      <ReportShellHeader title="Tickets" description="Explore your tickets report and create your own custom reports using ticket data." />
      <ReportShellFilters extraFilter={{ icon: 'ticket', label: 'El tipo de ticket es Cualquiera' }} />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 flex flex-col gap-5">
        <div className="self-start"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">Datos de ejemplo</span></div>
        <Section title="Tiempos de ticket">
          <div className="grid grid-cols-4 gap-3">
            <KpiCard label="Median ticket time to resolve" value="6h 24m" change="22m" trend="up" />
            <KpiCard label="Median ticket time in submitted" value="42m" change="4m" trend="up" />
            <KpiCard label="Median ticket time in progress" value="3h 18m" change="12m" trend="down" />
            <KpiCard label="Median ticket time in waiting on customer" value="2h 06m" change="8m" trend="up" />
          </div>
          <KpiChartCard title="Median ticket time to resolve - by time (h)">
            <KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: 'Mediana (h)', data: mockSeries(6.4, 1.2, -0.05, 151, 1), fill: true }]} type="line" showLegend={false} />
          </KpiChartCard>
          <div className="grid grid-cols-2 gap-4">
            <KpiChartCard title="Median ticket time to resolve - by team assigned">
              <KpiTimeSeries labels={['Soporte', 'Facturación', 'Técnico', 'Ventas']} series={[{ label: 'Horas', data: [5.8, 7.2, 8.4, 4.6] }]} type="bar" showLegend={false} />
            </KpiChartCard>
            <KpiChartCard title="Median ticket time to resolve - by teammate assigned">
              <KpiTimeSeries labels={['Ana', 'Luis', 'María', 'Jon']} series={[{ label: 'Horas', data: [5.2, 6.8, 6.1, 7.4] }]} type="bar" showLegend={false} />
            </KpiChartCard>
          </div>
        </Section>
        <Section title="Volumen de tickets">
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="New tickets" value="142" change="14%" trend="up" />
            <KpiCard label="Resolved tickets" value="128" change="9%" trend="up" />
          </div>
          <KpiChartCard title="Comparison of New and Resolved Tickets">
            <KpiTimeSeries labels={MOCK_DAYS} series={[
              { label: 'Nuevos', data: mockDaily(20, 8, 0.6, 152), fill: true },
              { label: 'Resueltos', data: mockDaily(18, 7, 0.5, 153) },
            ]} type="line" />
          </KpiChartCard>
          <div className="grid grid-cols-2 gap-4">
            <KpiChartCard title="Ticket volume - by team assigned">
              <KpiTimeSeries labels={['Soporte', 'Facturación', 'Técnico', 'Ventas']} series={[{ label: 'Tickets', data: [58, 41, 27, 16] }]} type="bar" showLegend={false} />
            </KpiChartCard>
            <KpiChartCard title="Ticket volume - by teammate assigned">
              <KpiTable columns={['Compañero', 'Tickets']} rows={[
                ['Ana Torres', '41'], ['Luis Vega', '36'], ['María Ruiz', '29'], ['Jon Aixa', '22'],
              ]} />
            </KpiChartCard>
          </div>
        </Section>
      </div>
    </>
  );
}

function ReportsFinAgentContent({ period, channel }: { period: string; channel: string }) {
  useApi(() => reportsApi.finagent(period, channel), [period, channel], null);
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-4 flex flex-col gap-4">
      <KpiSectionHeader title={title} />{children}
    </div>
  );
  return (
    <>
      <ReportShellHeader title="Fin AI Agent" description="Find out how Fin AI Agent is performing in conversations and impacting your resolution rates." />
      <ReportShellFilters />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 flex flex-col gap-5">
        <div className="self-start"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">Datos de ejemplo</span></div>
        <Section title="Rendimiento de Fin AI Agent">
          <div className="grid grid-cols-4 gap-3">
            <KpiCard label="Fin AI agent deflection rate" value="46%" sub="57 de 124" change="4 pts" trend="up" />
            <KpiCard label="Fin AI agent automation rate" value="63%" sub="78 de 124" change="6 pts" trend="up" />
            <KpiCard label="Fin AI agent resolution rate" value="87%" sub="68 de 78" change="2 pts" trend="up" />
            <KpiCard label="Fin AI agent CX Score" value="84" sub="de 100" change="1" trend="up" />
          </div>
          <KpiChartCard title="Fin AI agent's impact over time (%)">
            <KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: 'Tasa de resolución', data: mockSeries(80, 6, 0.5, 81), fill: true }, { label: 'Tasa de desviación', data: mockSeries(42, 6, 0.4, 82) }]} type="line" />
          </KpiChartCard>
        </Section>
        <Section title="Fin AI agent involvement">
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label="Fin AI agent involvement rate" value="71%" sub="88 de 124" change="5 pts" trend="up" />
            <KpiCard label="Involved conversations" value="88" change="11" trend="up" />
            <KpiCard label="Handed over to a teammate" value="26" change="3" trend="down" />
          </div>
          <KpiChartCard title="Fin AI agent involved conversations over time">
            <KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: 'Conversaciones con Fin', data: mockSeries(11, 4, 0.5, 83), fill: true }]} type="bar" showLegend={false} />
          </KpiChartCard>
        </Section>
      </div>
    </>
  );
}

// ── Resumen de interacción — funnel Enviado → Comprometido → Completado ───────
function EngagementFunnel({ sent, engaged, completed }: { sent: number; engaged: number; completed: number }) {
  const stages = [
    { label: 'Enviado', value: sent, active: true },
    { label: 'Comprometido', value: engaged, active: false },
    { label: 'Completado', value: completed, active: false, info: true },
  ];
  return (
    <div className="flex items-stretch gap-6">
      {stages.map((s, i) => (
        <div key={s.label} className="flex items-center gap-6">
          {i > 0 && (
            <svg viewBox="0 0 24 40" className="w-5 h-9 text-[#e9eae6]" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l14 16-14 16" /></svg>
          )}
          <div className="min-w-[110px]">
            <div className="flex items-center gap-1">
              <span className={`text-[13px] ${s.active ? 'text-[#1a1a1a] font-medium border-b-2 border-[#3b59f6] pb-0.5' : 'text-[#646462]'}`}>{s.label}</span>
              {s.info && <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-[#9a9a97]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>}
            </div>
            <div className="text-[26px] font-bold text-[#1a1a1a] leading-tight mt-1">{s.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Flujos de trabajo (legacy "Anterior") ─────────────────────────────────────
function ReportsWorkflowsContent() {
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-4 flex flex-col gap-4">
      <KpiSectionHeader title={title} />{children}
    </div>
  );
  const HOURS = ['12 a.m.', '3 a.m.', '6 a.m.', '9 a.m.', '12 p.m.', '3 p.m.', '6 p.m.', '9 p.m.'];
  const DAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
  return (
    <>
      <ReportShellHeader title="Flujos de trabajo" description="Analiza el rendimiento de tus flujos de trabajo: interacciones enviadas, comprometidas y completadas." />
      <ReportShellFilters extraFilter={{ label: 'Todos los flujos de trabajo' }} />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 flex flex-col gap-5">
        <div className="self-start"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">Datos de ejemplo</span></div>
        <Section title="Resumen de interacción">
          <EngagementFunnel sent={1284} engaged={742} completed={531} />
          <KpiChartCard title="Interacciones a lo largo del tiempo">
            <KpiTimeSeries labels={MOCK_DAYS} series={[
              { label: '7 días anteriores', data: mockDaily(150, 40, 2, 41) },
              { label: '17 jul - 23 jul', data: mockDaily(184, 46, 4, 42), fill: true },
            ]} type="line" />
          </KpiChartCard>
        </Section>
        <Section title="Conversaciones asignadas">
          <KpiChartCard title="Conversaciones asignadas por flujos de trabajo">
            <KpiTimeSeries labels={MOCK_DAYS} series={[{ label: 'Conversaciones asignadas', data: mockDaily(46, 16, 1, 43), fill: true }]} type="bar" showLegend={false} />
          </KpiChartCard>
        </Section>
        <Section title="Período de mayor actividad para flujos de trabajo">
          <KpiChartCard title="Actividad por hora y día de la semana" height={320}>
            <KpiHeatmap rows={HOURS} cols={DAYS} matrix={mockHeatmap(44)} />
          </KpiChartCard>
        </Section>
      </div>
    </>
  );
}

// ── Flujos de trabajo (generación de prospectos) — legacy "Anterior" ──────────
function ReportsWorkflowsLeadGenContent() {
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-4 flex flex-col gap-4">
      <KpiSectionHeader title={title} />{children}
    </div>
  );
  return (
    <>
      <ReportShellHeader title="Flujos de trabajo (generación de prospectos)" description="Analiza cómo tus flujos de trabajo captan correos, crean leads y reservan reuniones." />
      <ReportShellFilters extraFilter={{ label: 'Todos los flujos de trabajo' }} />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 flex flex-col gap-5">
        <div className="self-start"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">Datos de ejemplo</span></div>
        <Section title="Resumen de interacción">
          <EngagementFunnel sent={968} engaged={504} completed={287} />
          <KpiChartCard title="Interacciones a lo largo del tiempo">
            <KpiTimeSeries labels={MOCK_DAYS} series={[
              { label: '7 días anteriores', data: mockDaily(112, 30, 1, 51) },
              { label: '17 jul - 23 jul', data: mockDaily(138, 34, 3, 52), fill: true },
            ]} type="line" />
          </KpiChartCard>
        </Section>
        <div className="grid grid-cols-2 gap-5">
          <Section title="Correos electrónicos recopilados">
            <KpiChartCard title="Correos electrónicos recopilados">
              <KpiTimeSeries labels={MOCK_DAYS} series={[{ label: 'Correos recopilados', data: mockDaily(34, 12, 1, 53), fill: true }]} type="bar" showLegend={false} />
            </KpiChartCard>
          </Section>
          <Section title="Leads creados en Salesforce">
            <KpiChartCard title="Leads creados en Salesforce">
              <KpiTimeSeries labels={MOCK_DAYS} series={[{ label: 'Leads creados', data: mockDaily(9, 5, 0.4, 54), fill: true }]} type="bar" showLegend={false} />
            </KpiChartCard>
          </Section>
          <Section title="Leads no cualificados">
            <KpiChartCard title="Leads no cualificados">
              <KpiTimeSeries labels={MOCK_DAYS} series={[{ label: 'Leads no cualificados', data: mockDaily(6, 4, 0.2, 55), fill: true }]} type="bar" showLegend={false} />
            </KpiChartCard>
          </Section>
          <Section title="Reuniones reservadas">
            <KpiChartCard title="Reuniones reservadas">
              <KpiTimeSeries labels={MOCK_DAYS} series={[{ label: 'Reuniones reservadas', data: mockDaily(4, 3, 0.2, 56), fill: true }]} type="bar" showLegend={false} />
            </KpiChartCard>
          </Section>
        </div>
      </div>
    </>
  );
}

// ── Leads (legacy "Anterior") ─────────────────────────────────────────────────
function ReportsLeadsContent() {
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-4 flex flex-col gap-4">
      <KpiSectionHeader title={title} />{children}
    </div>
  );
  return (
    <>
      <ReportShellHeader title="Leads" description="Analiza tus nuevos leads, la rapidez con la que respondes y los leads creados en tu CRM." />
      <ReportShellFilters />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 flex flex-col gap-5">
        <div className="self-start"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">Datos de ejemplo</span></div>
        <Section title="Nuevos leads">
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label="Nuevos leads de Messenger" value="164" change="14%" trend="up" />
            <KpiCard label="Promedio del tiempo de primera respuesta a los leads" value="8m 42s" change="46s" trend="up" />
            <KpiCard label="Leads de Salesforce creados desde Intercom" value="57" change="9" trend="up" />
          </div>
          <KpiChartCard title="Nuevos leads de Messenger">
            <KpiTimeSeries labels={MOCK_DAYS} series={[
              { label: '7 días anteriores', data: mockDaily(18, 8, 0.3, 91) },
              { label: '17 jul - 23 jul', data: mockDaily(23, 9, 0.6, 92), fill: true },
            ]} type="line" />
          </KpiChartCard>
        </Section>
        <div className="grid grid-cols-2 gap-5">
          <Section title="Tiempo de respuesta a leads">
            <KpiChartCard title="Promedio del tiempo de primera respuesta a los leads (min)">
              <KpiTimeSeries labels={MOCK_DAYS} series={[{ label: 'Minutos', data: mockDaily(9, 3, -0.2, 93), fill: true }]} type="line" showLegend={false} />
            </KpiChartCard>
          </Section>
          <Section title="Leads en Salesforce">
            <KpiChartCard title="Leads de Salesforce creados desde Intercom">
              <KpiTimeSeries labels={MOCK_DAYS} series={[{ label: 'Leads creados', data: mockDaily(7, 4, 0.3, 94), fill: true }]} type="bar" showLegend={false} />
            </KpiChartCard>
          </Section>
        </div>
      </div>
    </>
  );
}

// ── Monitors — calidad de Fin AI Agent a escala ───────────────────────────────
function ReportsMonitorsContent({ period, channel }: { period: string; channel: string }) {
  useApi(() => reportsApi.finagent(period, channel), [period, channel], null);
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-4 flex flex-col gap-4">
      <KpiSectionHeader title={title} />{children}
    </div>
  );
  return (
    <>
      <ReportShellHeader title="Monitors" description="Monitor and improve Fin AI Agent quality at scale." />
      <ReportShellFilters extraFilter={{ label: 'Monitorear es Cualquiera' }} />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 flex flex-col gap-5">
        <div className="self-start"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">Datos de ejemplo</span></div>
        <Section title="Monitor trends">
          <KpiChartCard title="Evaluated conversations">
            <KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: 'Conversaciones evaluadas', data: mockSeries(120, 30, 6, 101), fill: true }]} type="bar" showLegend={false} />
          </KpiChartCard>
        </Section>
        <Section title="Score trends">
          <div className="grid grid-cols-4 gap-3">
            <KpiCard label="Average review score" value="4.3" sub="de 5" change="0.2" trend="up" />
            <KpiCard label="Reviews passed" value="87%" sub="612 de 703" change="3 pts" trend="up" />
            <KpiCard label="Number of reviews" value="703" change="11%" trend="up" />
            <KpiCard label="Failed reviews" value="91" change="8" trend="down" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <KpiChartCard title="Pass rate trends by scorecard (%)">
              <KpiTimeSeries labels={MOCK_WEEKS} series={[
                { label: 'Precisión', data: mockSeries(86, 5, 0.4, 102), fill: true },
                { label: 'Tono', data: mockSeries(82, 6, 0.3, 103) },
                { label: 'Resolución', data: mockSeries(79, 7, 0.5, 104) },
              ]} type="line" />
            </KpiChartCard>
            <KpiChartCard title="Average review score trends by scorecard">
              <KpiTimeSeries labels={MOCK_WEEKS} series={[
                { label: 'Precisión', data: mockSeries(4.3, 0.3, 0.02, 105, 1), fill: true },
                { label: 'Tono', data: mockSeries(4.1, 0.3, 0.02, 106, 1) },
                { label: 'Resolución', data: mockSeries(3.9, 0.4, 0.03, 107, 1) },
              ]} type="line" />
            </KpiChartCard>
          </div>
        </Section>
        <Section title="Criteria & reviewers">
          <KpiChartCard title="Average criteria score trends over time">
            <KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: 'Puntuación media', data: mockSeries(4.1, 0.35, 0.03, 108, 1), fill: true }]} type="line" showLegend={false} />
          </KpiChartCard>
          <KpiChartCard title="Reviews completed by reviewer" height={220}>
            <KpiTable columns={['Revisor', 'Revisiones', 'Aprobadas', 'Fallidas', '% aprobación']} rows={[
              ['Ana Torres', '214', '191', '23', '89%'],
              ['Luis Vega', '186', '158', '28', '85%'],
              ['María Ruiz', '167', '149', '18', '89%'],
              ['Jon Aixa', '136', '114', '22', '84%'],
            ]} />
          </KpiChartCard>
        </Section>
      </div>
    </>
  );
}

function ReportsSugerenciasContent() {
  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.5"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5.5 7h5M5.5 10h3"/></svg>
            <h1 className="text-[18px] font-bold text-[#1a1a1a]">Sugerencias</h1>
          </div>
          <p className="text-[12.5px] text-[#646462] mt-0.5 truncate">Sugerencias generadas por HTML con base en lo que tus clientes hablaron con mayor frecuencia en Messenger en los últimos 365 días</p>
        </div>
        <button className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#ededea] flex-shrink-0">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.4"><path d="M8 13S2 9.5 2 5.5C2 3.5 3.5 2 5.5 2c1.2 0 2 .7 2.5 1.5C8.5 2.7 9.3 2 10.5 2 12.5 2 14 3.5 14 5.5 14 9.5 8 13 8 13z"/></svg>
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 p-6 text-center">
        <div className="relative w-[320px] h-[200px] mb-4">
          <div className="absolute inset-0 rounded-full bg-[#7ee0d3] opacity-90 mx-8 my-6"/>
          <div className="absolute left-12 top-8 w-20 h-14 rounded-[12px] bg-white border-2 border-[#1a1a1a] flex items-center justify-center">
            <span className="flex gap-0.5"><span className="w-1 h-1 rounded-full bg-[#1a1a1a]"/><span className="w-1 h-1 rounded-full bg-[#1a1a1a]"/><span className="w-1 h-1 rounded-full bg-[#1a1a1a]"/></span>
          </div>
          <div className="absolute right-14 top-12 w-16 h-12 rounded-[10px] bg-white border-2 border-[#1a1a1a] flex items-center justify-center">
            <span className="flex gap-0.5"><span className="w-1 h-1 rounded-full bg-[#1a1a1a]"/><span className="w-1 h-1 rounded-full bg-[#1a1a1a]"/><span className="w-1 h-1 rounded-full bg-[#1a1a1a]"/></span>
          </div>
          <div className="absolute left-20 bottom-8 w-14 h-10 rounded-[8px] bg-white border-2 border-[#1a1a1a]"/>
          <div className="absolute right-20 bottom-12 w-12 h-9 rounded-[8px] bg-white border-2 border-[#1a1a1a]"/>
          <span className="absolute left-3 top-3 text-[14px]">✨</span>
          <span className="absolute right-4 top-1 text-[14px]">✦</span>
          <span className="absolute right-2 bottom-3 text-[12px]">✦</span>
        </div>
        <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-1">Obtener sugerencias de temas</h2>
        <p className="text-[13px] text-[#646462] max-w-[440px] mb-4">
          A medida que tengas más conversaciones con tus clientes, verás sugerencias de temas para rastrear aquí. Agrega un nuevo tema para comenzar.
        </p>
        <div className="flex items-center gap-2">
          <button className="bg-[#1a1a1a] text-white text-[13px] font-semibold rounded-full px-4 py-[7px] hover:bg-black">Agregar un tema</button>
          <button className="text-[13px] font-medium text-[#1a1a1a] hover:underline">Más información</button>
        </div>
      </div>
    </>
  );
}

function ReportsHorariosContent() {
  const [tab, setTab] = useState<'informes' | 'datasets'>('informes');
  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.5"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v3l2 1.5"/></svg>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Administrar los horarios</h1>
        </div>
      </div>
      <div className="px-6 pt-3 border-b border-[#e9eae6] flex items-center gap-5 flex-shrink-0">
        <button onClick={() => setTab('informes')} className={`pb-3 text-[13px] ${tab==='informes' ? 'font-semibold text-[#1a1a1a] border-b-2 border-[#ff7849] -mb-px' : 'text-[#646462] hover:text-[#1a1a1a]'}`}>Informes</button>
        <button onClick={() => setTab('datasets')} className={`pb-3 text-[13px] ${tab==='datasets' ? 'font-semibold text-[#1a1a1a] border-b-2 border-[#ff7849] -mb-px' : 'text-[#646462] hover:text-[#1a1a1a]'}`}>Conjuntos de datos</button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-[#f3f3f1] flex items-center justify-center mb-3">
          <svg viewBox="0 0 24 24" className="w-6 h-6 fill-none stroke-[#646462]" strokeWidth="1.5"><circle cx="12" cy="13" r="7"/><path d="M12 9v4l3 2M9 3l-3 3M15 3l3 3"/></svg>
        </div>
        <h2 className="text-[14px] font-semibold text-[#1a1a1a] mb-1">No se han creado horarios</h2>
        <p className="text-[12.5px] text-[#646462] max-w-[460px]">Crea un programa en un informe para entregar automáticamente informes a tu equipo.</p>
      </div>
    </>
  );
}

function ReportsArticlesContent({ period, channel }: { period: string; channel: string }) {
  useApi(() => reportsApi.articles(period, channel), [period, channel], null);
  return (
    <>
      <ReportShellHeader title="Artículos" description="Analiza cómo se leen y buscan tus artículos del centro de ayuda." />
      <ReportShellFilters />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 flex flex-col gap-4">
        <div className="self-start"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">Datos de ejemplo</span></div>
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Personas que vieron un artículo" value="486" change="12%" trend="up" />
          <KpiCard label="Total de visualizaciones del artículo" value="1.204" change="9%" trend="up" />
        </div>
        <KpiChartCard title="Personas vs visualizaciones en el tiempo">
          <KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: 'Personas', data: mockSeries(58, 18, 2, 71) }, { label: 'Visualizaciones', data: mockSeries(140, 40, 4, 72) }]} type="line" />
        </KpiChartCard>
        <KpiChartCard title="Interacción con el artículo" height={240}>
          <KpiTable columns={['Artículo', 'Visitantes', '😖', '😐', '😀', 'Conversaciones']} rows={[
            ['Cómo pedir un reembolso', '182', '4', '11', '96', '8'],
            ['Estado de mi envío', '146', '6', '9', '74', '12'],
            ['Cambiar método de pago', '98', '2', '7', '51', '5'],
            ['Cancelar suscripción', '60', '9', '8', '22', '14'],
          ]} />
        </KpiChartCard>
        <KpiChartCard title="Resultados de búsqueda" height={220}>
          <KpiTable columns={['Palabra clave', 'Búsquedas', 'Índice de clics']} rows={[
            ['reembolso', '128', '62%'],
            ['envío', '96', '54%'],
            ['factura', '71', '48%'],
            ['cancelar', '52', '39%'],
          ]} />
        </KpiChartCard>
        <KpiChartCard title="Búsquedas sin resultados" height={200}>
          <KpiTable columns={['Palabra clave', 'Búsquedas']} rows={[
            ['garantía extendida', '18'],
            ['cambio de talla', '12'],
            ['punto físico', '7'],
          ]} />
        </KpiChartCard>
      </div>
    </>
  );
}

function ReportsOutboundEngagementContent({ period, channel }: { period: string; channel: string }) {
  useApi(() => reportsApi.outbound(period, channel), [period, channel], null);
  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.5"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5.5 7h5M5.5 10h3"/></svg>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Interacción del cliente</h1>
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#f3f3f1] text-[#646462]">Anterior</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button className="flex items-center gap-1.5 bg-[#1a1a1a] text-white rounded-full px-3 py-[6px] text-[13px] font-semibold hover:bg-black">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><path d="M8 1v10M4 7l4 4 4-4M2 13h12"/></svg>
            Exportar CSV
          </button>
        </div>
      </div>
      <div className="px-6 py-3 border-b border-[#e9eae6] flex items-center gap-2 flex-shrink-0">
        <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[12.5px] font-medium text-[#1a1a1a]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5 2v3M11 2v3"/></svg>
          Período: {period}
          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4z"/></svg>
        </button>
        <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[12.5px] font-medium text-[#1a1a1a]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 6.5h12"/></svg>
          Todos los tipos de mensajes
        </button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 p-6 flex flex-col gap-5">
        <div className="self-start"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">Datos de ejemplo</span></div>
        <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-4 flex flex-col gap-4">
          <KpiSectionHeader title="Todos los tipos de mensajes" />
          <div className="grid grid-cols-2 gap-3">
            <KpiCard label="Mensajes enviados" value="2.480" change="12%" trend="up" />
            <KpiCard label="Horas de envío de mensajes" value="1.240" sub="0.5 por mensaje" change="4%" trend="up" />
          </div>
          <KpiChartCard title="Mensajes enviados por día">
            <KpiTimeSeries labels={MOCK_DAYS} series={[{ label: 'Mensajes enviados', data: mockDaily(340, 90, 6, 71), fill: true }]} type="bar" showLegend={false} />
          </KpiChartCard>
        </div>
        <KpiChartCard title="Volumen de mensajes por usuario" height={240}>
          <KpiTable columns={['Nombre', 'Mensajes enviados']} rows={[
            ['Ana Torres', '742'], ['Luis Vega', '618'], ['María Ruiz', '531'], ['Jon Aixa', '404'], ['Fin AI Agent', '185'],
          ]} />
        </KpiChartCard>
        <KpiChartCard title="Rendimiento del mensaje" height={240}>
          <KpiTable columns={['Título', 'Enviado', 'Objetivo', 'Abierto', 'Clics', 'Respuestas']} rows={[
            ['Bienvenida onboarding', '820', 'Activación', '58%', '14%', '5%'],
            ['Newsletter de producto', '1.240', 'Retención', '43%', '9%', '2%'],
            ['Recuperación de carrito', '420', 'Conversión', '31%', '7%', '1%'],
          ]} />
        </KpiChartCard>
        <p className="text-[11.5px] text-[#646462] text-center pt-1">Los informes están en Madrid time (GMT+2)</p>
      </div>
    </>
  );
}

function ReportsCopilotContent({ period, channel }: { period: string; channel: string }) {
  useApi(() => reportsApi.agents(period, channel), [period, channel], null);
  return (
    <>
      <ReportShellHeader title="Copilot" description="Analyze and report on how Copilot is used by teammates in your workspace." />
      <ReportShellFilters extraFilter={{ icon: 'user', label: 'Compañero de equipo es Cualquiera' }} />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 flex flex-col gap-4">
        <div className="self-start"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">Datos de ejemplo</span></div>
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="Percentage of conversations using Copilot" value="34%" sub="42 de 124" change="6 pts" trend="up" />
          <KpiCard label="Copilot questions" value="287" change="15%" trend="up" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Conversations using Copilot" value="42" change="9" trend="up" />
          <KpiCard label="Percentage of conversations with a copied Copilot answer" value="18%" sub="22 de 124" change="3 pts" trend="up" />
          <KpiCard label="Teammates using Copilot" value="7" change="1" trend="up" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <KpiChartCard title="Percentage of conversations using Copilot"><KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: '% conversaciones', data: mockSeries(30, 8, 0.6, 41), fill: true }]} type="line" showLegend={false} /></KpiChartCard>
          <KpiChartCard title="Teammates using Copilot"><KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: 'Compañeros', data: mockSeries(5, 2, 0.2, 42) }]} type="bar" showLegend={false} /></KpiChartCard>
        </div>
        <KpiChartCard title="Teammate overview" height={220}>
          <KpiTable columns={['Compañero', 'Preguntas', 'Respuestas copiadas', 'Conversaciones']} rows={[['Ana Torres', '92', '18', '15'], ['Luis Vega', '74', '12', '11'], ['María Ruiz', '63', '9', '9'], ['Jon Aixa', '58', '7', '7']]} />
        </KpiChartCard>
        <KpiChartCard title="Copilot content performance" height={220}>
          <KpiTable columns={['Fuente', 'Usos', 'Respuestas copiadas', '% copiado']} rows={[['Reembolsos', '84', '31', '37%'], ['Envíos', '61', '19', '31%'], ['Facturación', '42', '11', '26%']]} />
        </KpiChartCard>
      </div>
    </>
  );
}

function ReportsEmailDeliverabilityContent() {
  const seg: [string, string][] = [['Abierto', '42%'], ['Se canceló la suscripción', '1.2%'], ['Sin entregar', '0.8%'], ['Marcado como spam', '0.3%']];
  return (
    <>
      <ReportShellHeader title="Capacidad de entrega de correo electrónico" description="Mide la entregabilidad de tus correos: aperturas, cancelaciones, no entregados y spam." />
      <ReportShellFilters />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 flex flex-col gap-5">
        <div className="self-start"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e]">Datos de ejemplo</span></div>
        <div className="bg-[#f8f8f7] border border-[#e9eae6] rounded-[12px] p-4 flex flex-col gap-4">
          <KpiSectionHeader title="Capacidad general de entrega de correo electrónico" />
          <div className="grid grid-cols-4 gap-3">
            {seg.map(([l, v]) => <KpiCard key={l} label={l} value={v} />)}
          </div>
          <p className="text-[12.5px] text-[#646462] px-1">Recomendamos que la tasa de apertura se mantenga <b className="text-[#1a1a1a]">por encima del 25 %</b>.</p>
          <KpiChartCard title="Tasa de apertura por tiempo (%)">
            <KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: 'Tasa de apertura', data: mockSeries(40, 6, 0.3, 61), fill: true }]} type="line" showLegend={false} />
          </KpiChartCard>
        </div>
        <KpiChartCard title="Tasa de entrega de tus correos electrónicos" height={240}>
          <KpiTable columns={['Título', 'Enviado', 'Abierto', 'Clics', 'Respuestas', 'Cancelado', 'Sin entregar', 'Spam']} rows={[
            ['Newsletter Julio', '1.240', '43%', '9%', '2%', '0.9%', '0.6%', '0.2%'],
            ['Onboarding día 1', '820', '58%', '14%', '5%', '0.4%', '0.5%', '0.1%'],
            ['Recuperación carrito', '640', '31%', '7%', '1%', '1.8%', '1.1%', '0.4%'],
          ]} />
        </KpiChartCard>
      </div>
    </>
  );
}

function ReportsExportContent({ period, channel }: { period: string; channel: string }) {
  const { data: casesData, loading } = useApi(() => casesApi.list({ limit: '50' }), [], null);
  const cases: any[] = Array.isArray((casesData as any)?.items) ? (casesData as any).items : Array.isArray(casesData) ? casesData as any[] : [];
  const total = (casesData as any)?.total ?? cases.length;

  return (
    <>
      <div className="px-6 py-3 border-b border-[#e9eae6] bg-[#fafaf9] flex-shrink-0 text-center">
        <p className="text-[12.5px] text-[#1a1a1a]">
          <span className="mr-1">🍂</span>
          Exporta datos más ricos con nuestra experiencia mejorada de exportación de conjuntos de datos. También puedes utilizar la nueva API de exportación de datos de informes para exportar datos. <a className="font-medium underline">Más información</a>
        </p>
      </div>
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.5"><path d="M8 1v10M4 7l4 4 4-4M2 13h12"/></svg>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Exportación de conjuntos de datos</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[12.5px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v3l2 1.5"/></svg>
            Programar
            <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current"><path d="M4 6l4 4 4-4z"/></svg>
          </button>
          <button className="flex items-center gap-1.5 bg-[#1a1a1a] text-white rounded-full px-3 py-[6px] text-[13px] font-semibold hover:bg-black">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.5"><path d="M8 1v10M4 7l4 4 4-4M2 13h12"/></svg>
            Exportar CSV
          </button>
        </div>
      </div>
      <div className="px-6 py-3 border-b border-[#e9eae6] flex items-center gap-2 flex-shrink-0">
        <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[12.5px] font-medium text-[#1a1a1a]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 6.5h12"/></svg>
          Conjunto de datos: Conversation
          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4z"/></svg>
        </button>
        <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[12.5px] font-medium text-[#1a1a1a]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5 2v3M11 2v3"/></svg>
          Período: {period}
        </button>
        <button className="flex items-center gap-1 border border-dashed border-[#d4d4d2] rounded-full px-3 py-[6px] text-[12.5px] text-[#646462]">
          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
          Añadir filtro
        </button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-6 py-3 flex items-center justify-between text-[12.5px] text-[#646462] border-b border-[#e9eae6]">
          <span>
            {loading ? 'Cargando...' : <><span className="text-[#1a1a1a] font-medium">{cases.length} de {total} artículos</span>  Las marcas de tiempo están en la zona horaria del servidor</>}
          </span>
          <button className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#ededea] text-[#646462]">+</button>
        </div>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-[#fafaf9] border-b border-[#e9eae6]">
              <th className="text-left font-medium text-[#646462] px-6 py-2">
                <div className="flex items-center gap-1">ID de conversación<svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M5 7l3-3 3 3M5 9l3 3 3-3"/></svg></div>
              </th>
              <th className="text-left font-medium text-[#646462] px-6 py-2">
                <div className="flex items-center gap-1">La conversación comenzó el<svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M5 7l3-3 3 3M5 9l3 3 3-3"/></svg></div>
              </th>
              <th className="text-left font-medium text-[#646462] px-6 py-2">Canal</th>
              <th className="text-left font-medium text-[#646462] px-6 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-[#646462]">Cargando...</td></tr>
            ) : cases.length === 0 ? (
              <tr><td colSpan={4} className="px-6 py-8 text-center text-[#646462]">No se encontraron conversaciones</td></tr>
            ) : cases.map((c: any) => (
              <tr key={c.id} className="border-b border-[#e9eae6] hover:bg-[#fafaf9]">
                <td className="px-6 py-3">
                  <span className="text-[#3b59f6] inline-flex items-center gap-1">
                    <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current" strokeWidth="1.4"><path d="M9 2h5v5M14 2L7 9M11 9v4H3V5h4"/></svg>
                    {String(c.id).slice(0, 18)}
                  </span>
                </td>
                <td className="px-6 py-3 text-[#1a1a1a]">
                  {c.created_at ? new Date(c.created_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                </td>
                <td className="px-6 py-3 text-[#646462] capitalize">{c.source_channel ?? '—'}</td>
                <td className="px-6 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    c.status === 'resolved' || c.status === 'closed' ? 'bg-[#dcfce7] text-[#16a34a]' :
                    c.status === 'open' ? 'bg-[#dbeafe] text-[#1d4ed8]' : 'bg-[#f3f3f1] text-[#646462]'
                  }`}>
                    {c.status ?? '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT BUILDER — canvas editor con drag & drop (estilo Intercom)
// El usuario crea sus propios monitores arrastrando KPIs/gráficos al lienzo.
// ─────────────────────────────────────────────────────────────────────────────

type BuilderKind = 'kpi' | 'line' | 'bar' | 'doughnut' | 'table' | 'heatmap' | 'title';
type CatalogItem = {
  id: string; group: string; label: string; kind: BuilderKind; span: 1 | 2 | 3 | 4;
  value?: string; sub?: string; change?: string; trend?: 'up' | 'down'; seed?: number;
  dim?: string;        // chip de dimensión (Tiempo, Canal, Día de la semana · Hora del día…)
  qualifier?: string;  // p.ej. "Mediana, Dentro del horario de atención"
  isNew?: boolean;     // badge "Nuevo"
  subgroup?: string;   // línea gris; por defecto = group
};

// Catálogo completo de componentes que se pueden añadir a cualquier monitor.
const BUILDER_CATALOG: CatalogItem[] = [
  { id:'c1', group:'Componentes', label:'banner', kind:'title', span:4, isNew:true, seed:200 },
  { id:'c2', group:'Satisfacción del cliente (CSAT) encuestada', label:'Puntuación general de CSAT', kind:'kpi', span:1, value:'91%' },
  { id:'c3', group:'Satisfacción del cliente (CSAT) encuestada', label:'Puntuación CSAT del compañero de equipo', kind:'kpi', span:1, value:'88%' },
  { id:'c4', group:'Satisfacción del cliente (CSAT) encuestada', label:'Puntuación CSAT de Fin AI Agent', kind:'kpi', span:1, value:'94%' },
  { id:'c5', group:'Satisfacción del cliente (CSAT) encuestada', label:'Puntuación CSAT a lo largo del tiempo', kind:'line', span:2, dim:'Tiempo', seed:204 },
  { id:'c6', group:'Satisfacción del cliente (CSAT) encuestada', label:'Valoraciones de las conversaciones', kind:'bar', span:2, dim:'Tiempo', seed:205 },
  { id:'c7', group:'Satisfacción del cliente (CSAT) encuestada', label:'Valoraciones de las conversaciones', kind:'bar', span:2, dim:'Valoración de la conversación', seed:206 },
  { id:'c8', group:'Satisfacción del cliente (CSAT) encuestada', label:'🤩 Comentarios positivos', kind:'kpi', span:1, value:'287' },
  { id:'c9', group:'Satisfacción del cliente (CSAT) encuestada', label:'😐 Comentarios neutrales', kind:'kpi', span:1, value:'124' },
  { id:'c10', group:'Satisfacción del cliente (CSAT) encuestada', label:'😠 Comentarios negativos', kind:'kpi', span:1, value:'63' },
  { id:'c11', group:'Satisfacción del cliente (CSAT) encuestada', label:'Valoraciones de las conversaciones', kind:'bar', span:2, seed:210 },
  { id:'c12', group:'Satisfacción del cliente (CSAT) encuestada', label:'tasa de solicitudes de CSAT', kind:'kpi', span:1, value:'46%' },
  { id:'c13', group:'Satisfacción del cliente (CSAT) encuestada', label:'Tasa de respuesta de CSAT', kind:'kpi', span:1, value:'63%' },
  { id:'c14', group:'Satisfacción del cliente (CSAT) encuestada', label:'Tasas de solicitud y respuesta a la encuesta CSAT', kind:'line', span:2, dim:'Tiempo', seed:213 },
  { id:'c15', group:'Satisfacción del cliente (CSAT) encuestada', label:'Temas que generan insatisfacción', kind:'table', span:4, dim:'Temas', seed:214 },
  { id:'c16', group:'Satisfacción del cliente (CSAT) encuestada', label:'Rendimiento de CSAT de los compañeros de equipo', kind:'table', span:4, dim:'Compañero de equipo', seed:215 },
  { id:'c17', group:'Fin AI Agent', label:'Tasa de desvíos de Fin AI Agent', kind:'kpi', span:1, value:'63%' },
  { id:'c18', group:'Fin AI Agent', label:'Tasa de automatización del agente de IA de Fin', kind:'kpi', span:1, value:'46%' },
  { id:'c19', group:'Fin AI Agent', label:'Tasa de resolución de Fin AI Agent', kind:'kpi', span:1, value:'87%' },
  { id:'c20', group:'Fin AI Agent', label:'Puntuación CX de Fin AI Agent', kind:'kpi', span:1, value:'84' },
  { id:'c21', group:'Fin AI Agent', label:'El impacto de Fin AI Agent a lo largo del tiempo', kind:'line', span:2, dim:'Tiempo', seed:220 },
  { id:'c22', group:'Fin AI Agent', label:'Tasa de participación de Fin AI Agent', kind:'bar', span:2, dim:'Fin AI Agent participó', seed:221 },
  { id:'c23', group:'Fin AI Agent', label:'Conversaciones en las que Fin AI Agent participó a lo largo del tiempo', kind:'bar', span:2, dim:'Tiempo', seed:222 },
  { id:'c24', group:'Fin AI Agent', label:'Conversaciones en las que Fin Ai Agent participó', kind:'bar', span:2, dim:'Canal', seed:223 },
  { id:'c25', group:'Fin AI Agent', label:'Conversaciones en las que Fin Ai Agent no participó', kind:'bar', span:2, dim:'Canal', seed:224 },
  { id:'c26', group:'Fin AI Agent', label:'Conversaciones en las que Fin AI Agent participó a lo largo del tiempo', kind:'bar', span:2, dim:'Tiempo', seed:225 },
  { id:'c27', group:'Fin AI Agent', label:'Conversaciones en las que Fin AI Agent participó y resolvió', kind:'kpi', span:1, value:'703' },
  { id:'c28', group:'Fin AI Agent', label:'Conversaciones en las que Fin AI Agent participó y resolvió a lo largo del tiempo', kind:'bar', span:2, dim:'Tiempo', seed:227 },
  { id:'c29', group:'Fin AI Agent', label:'Conversaciones en las que participó Fin AI Agent y que fueron resueltas por estado de resolución de Fin AI Agent', kind:'bar', span:2, dim:'Fin AI Agent resolution state', seed:228 },
  { id:'c30', group:'Fin AI Agent', label:'Tasa de participación de Fin AI Agent', kind:'kpi', span:1, value:'91%' },
  { id:'c31', group:'Fin AI Agent', label:'Tasa de canalizaciones de Fin AI Agent al equipo', kind:'kpi', span:1, value:'37%' },
  { id:'c32', group:'Fin AI Agent', label:'Tasa de abandono de Fin AI Agent', kind:'kpi', span:1, value:'12%' },
  { id:'c33', group:'Fin AI Agent', label:'Rendimiento del contenido del agente de IA Fin', kind:'table', span:4, dim:'Contenido de Fin referenciado', seed:232 },
  { id:'c34', group:'Fin AI Agent', label:'Tasa de resolución asumida de Fin AI Agent', kind:'kpi', span:1, value:'58%' },
  { id:'c35', group:'Fin AI Agent', label:'Tasa de resolución confirmada de Fin AI Agent', kind:'kpi', span:1, value:'42%' },
  { id:'c36', group:'Fin AI Agent', label:'Conversaciones de Fin AI Agent con una calificación de puntuación de experiencia del cliente (CX)', kind:'kpi', span:1, value:'287' },
  { id:'c37', group:'Fin AI Agent', label:'Calificaciones de puntuación de la experiencia del cliente de Fin AI Agent', kind:'doughnut', span:2, dim:'Puntuación de la experiencia del cliente (CX)', seed:236 },
  { id:'c38', group:'Fin AI Agent', label:'Calificaciones de la puntuación experiencia del cliente (CX) de Fin AI Agent - por tiempo', kind:'line', span:2, dim:'Tiempo', seed:237 },
  { id:'c39', group:'Fin AI Agent', label:'Calificaciones de puntuación CX de Fin AI Agent', kind:'kpi', span:1, value:'4.3' },
  { id:'c40', group:'Fin for Service', label:'Tasa de automatización de Fin for Service', kind:'kpi', span:1, value:'46%' },
  { id:'c41', group:'Fin for Service', label:'Tasa de resolución de Fin for Service', kind:'kpi', span:1, value:'63%' },
  { id:'c42', group:'Fin for Service', label:'Tasa de participación de Fin for Service', kind:'kpi', span:1, value:'87%' },
  { id:'c43', group:'Fin for Service', label:'Tasa de actividad de Fin for Service', kind:'kpi', span:1, value:'91%' },
  { id:'c44', group:'Fin for Service', label:'Puntuación CX de Fin for Service', kind:'kpi', span:1, value:'84' },
  { id:'c45', group:'Fin for Service', label:'Desglose de la puntuación CX de Fin for Service', kind:'bar', span:2, dim:'Puntuación de la experiencia del cliente (CX)', seed:244 },
  { id:'c46', group:'Fin for Service', label:'Razones por las que Fin for Service tiene un puntaje CX positiva', kind:'doughnut', span:2, dim:'CX Score reasons', seed:245 },
  { id:'c47', group:'Fin for Service', label:'Motivos de la puntuación negativa en la experiencia del cliente (CX) de Fin for Service', kind:'doughnut', span:2, dim:'CX Score reasons', seed:246 },
  { id:'c48', group:'Fin for Service', label:'Rendimiento de Fin for Service a lo largo del tiempo', kind:'line', span:2, dim:'Tiempo', seed:247 },
  { id:'c49', group:'Fin for Service', label:'Conversaciones sobre Fin for Service a lo largo del tiempo', kind:'bar', span:2, dim:'Tiempo', seed:248 },
  { id:'c50', group:'Fin para comercio electrónico', label:'Tasa de automatización de Fin for Ecommerce', kind:'kpi', span:1, value:'52%' },
  { id:'c51', group:'Fin para comercio electrónico', label:'Tasa de resolución de Fin for Ecommerce', kind:'kpi', span:1, value:'68%' },
  { id:'c52', group:'Fin para comercio electrónico', label:'Tasa de participación de Fin for Ecommerce', kind:'kpi', span:1, value:'79%' },
  { id:'c53', group:'Fin para comercio electrónico', label:'Tasa de activo de Fin for Ecommerce', kind:'kpi', span:1, value:'94%' },
  { id:'c54', group:'Fin para comercio electrónico', label:'Puntuación CX de Fin for Ecommerce', kind:'kpi', span:1, value:'4.3' },
  { id:'c55', group:'Fin para comercio electrónico', label:'Desglose de la puntuación de la experiencia del cliente de Fin for Ecommerce', kind:'bar', span:2, dim:'Puntuación de la experiencia del cliente (CX)', seed:254 },
  { id:'c56', group:'Fin para comercio electrónico', label:'Motivos de la puntuación positiva de la experiencia del cliente de Fin for Ecommerce', kind:'doughnut', span:2, dim:'CX Score reasons', seed:255 },
  { id:'c57', group:'Fin para comercio electrónico', label:'Motivos de la puntuación negativa en la experiencia del cliente (CX) de Fin for Ecommerce', kind:'doughnut', span:2, dim:'CX Score reasons', seed:256 },
  { id:'c58', group:'Fin para comercio electrónico', label:'Rendimiento de Fin for Ecommerce a lo largo del tiempo', kind:'line', span:2, dim:'Tiempo', seed:257 },
  { id:'c59', group:'Fin para comercio electrónico', label:'Conversaciones sobre Fin for Ecommerce a lo largo del tiempo', kind:'bar', span:2, dim:'Tiempo', seed:258 },
  { id:'c60', group:'Fin para comercio electrónico', label:'Carrusel mostrado de Fin for Ecommerce', kind:'table', span:4, dim:'Fin for Ecommerce: Product recommended', seed:259 },
  { id:'c61', group:'Fin para comercio electrónico', label:'Clics en enlaces de pago de Fin for Ecommerce', kind:'table', span:4, dim:'Fin for Ecommerce: Checkout link clicked', seed:260 },
  { id:'c62', group:'Conversaciones', label:'Nuevas conversaciones', kind:'kpi', span:1, value:'287' },
  { id:'c63', group:'Conversaciones', label:'Conversaciones respondidas a', kind:'kpi', span:1, value:'263' },
  { id:'c64', group:'Conversaciones', label:'Respuestas enviadas', kind:'kpi', span:1, value:'703' },
  { id:'c65', group:'Conversaciones', label:'Conversaciones cerradas', kind:'kpi', span:1, value:'241' },
  { id:'c66', group:'Conversaciones', label:'Conversaciones reabiertas', kind:'kpi', span:1, value:'38' },
  { id:'c67', group:'Conversaciones', label:'Conversaciones abiertas', kind:'kpi', span:1, value:'124' },
  { id:'c68', group:'Conversaciones', label:'Conversaciones pospuestas', kind:'kpi', span:1, value:'56' },
  { id:'c69', group:'Conversaciones', label:'Nuevas conversaciones', kind:'bar', span:2, dim:'Tiempo', seed:268 },
  { id:'c70', group:'Conversaciones', label:'Nuevas conversaciones', kind:'bar', span:2, dim:'Canal', seed:269 },
  { id:'c71', group:'Conversaciones', label:'Respuestas enviadas', kind:'bar', span:2, dim:'Tiempo', seed:270 },
  { id:'c72', group:'Conversaciones', label:'Conversaciones cerradas vs. reabiertas', kind:'bar', span:2, dim:'Tiempo', seed:271 },
  { id:'c73', group:'Conversaciones', label:'Conversaciones abiertas y pospuestas', kind:'bar', span:2, dim:'Tiempo', seed:272 },
  { id:'c74', group:'Conversaciones', label:'Comparación de nuevas conversaciones y respuestas', kind:'bar', span:2, dim:'Tiempo', seed:273 },
  { id:'c75', group:'Conversaciones', label:'Distribución por hora de nuevas conversaciones', kind:'heatmap', span:4, dim:'Día de la semana · Hora del día', seed:274 },
  { id:'c76', group:'Capacidad de respuesta', label:'Tiempo de respuesta: incluye el tiempo asignado al bot', kind:'kpi', span:1, qualifier:'Mediana, Dentro del horario de atención', value:'11m 08s' },
  { id:'c77', group:'Capacidad de respuesta', label:'Tiempo de respuesta inicial: incluido el tiempo asignado al bot', kind:'kpi', span:1, qualifier:'Mediana, Dentro del horario de atención', value:'3m 42s' },
  { id:'c78', group:'Capacidad de respuesta', label:'Tiempo hasta el cierre: incluido el tiempo asignado al bot', kind:'kpi', span:1, qualifier:'Mediana, Dentro del horario de atención', value:'2h 24m' },
  { id:'c79', group:'Capacidad de respuesta', label:'Tiempo de respuesta: incluye el tiempo asignado al bot', kind:'line', span:2, dim:'Tiempo', qualifier:'Mediana, Dentro del horario de atención', seed:278 },
  { id:'c80', group:'Capacidad de respuesta', label:'Tiempo de respuesta inicial: incluido el tiempo asignado al bot', kind:'line', span:2, dim:'Tiempo', qualifier:'Mediana, Dentro del horario de atención', seed:279 },
  { id:'c81', group:'Capacidad de respuesta', label:'Tiempo de respuesta inicial: incluido el desglose del tiempo asignado al bot', kind:'table', span:2, dim:'Intervalos de tiempo personalizados', qualifier:'Rango, Dentro del horario de atención', isNew:true, seed:280 },
  { id:'c82', group:'Capacidad de respuesta', label:'Tiempo hasta el cierre: incluido el tiempo asignado al bot', kind:'line', span:2, dim:'Tiempo', qualifier:'Mediana, Dentro del horario de atención', seed:281 },
  { id:'c83', group:'Capacidad de respuesta', label:'Tiempo hasta el cierre: incluyendo el tiempo asignado a la avería del bot', kind:'table', span:2, dim:'Intervalos de tiempo personalizados', qualifier:'Rango, Dentro del horario de atención', isNew:true, seed:282 },
  { id:'c84', group:'Capacidad de respuesta', label:'Distribución horaria de los tiempos de respuesta: incluye el tiempo asignado al bot', kind:'heatmap', span:4, dim:'Día de la semana · Hora del día', qualifier:'Mediana, Dentro del horario de atención', seed:283 },
  { id:'c85', group:'Efectividad', label:'Conversaciones respondidas a', kind:'kpi', span:1, value:'263' },
  { id:'c86', group:'Efectividad', label:'Tasa de conversaciones cerradas en el primer contacto', kind:'kpi', span:1, value:'63%' },
  { id:'c87', group:'Efectividad', label:'Respuestas para cerrar una conversación', kind:'kpi', span:1, qualifier:'Mediana', value:'3' },
  { id:'c88', group:'Efectividad', label:'Conversaciones reasignadas', kind:'kpi', span:1, value:'47' },
  { id:'c89', group:'Efectividad', label:'Tiempo para la primera asignación', kind:'kpi', span:1, qualifier:'Mediana, Dentro del horario de atención', value:'1m 58s' },
  { id:'c90', group:'Efectividad', label:'Tiempo desde la primera asignación hasta el cierre', kind:'kpi', span:1, qualifier:'Mediana, Dentro del horario de atención', value:'1h 42m' },
  { id:'c91', group:'Efectividad', label:'Respuestas para cerrar una conversación', kind:'line', span:2, dim:'Tiempo', qualifier:'Mediana', seed:290 },
  { id:'c92', group:'Efectividad', label:'Tiempo para la primera asignación', kind:'line', span:2, dim:'Tiempo', qualifier:'Mediana, Dentro del horario de atención', seed:291 },
  { id:'c93', group:'Efectividad', label:'Tasa de conversaciones cerradas en el primer contacto', kind:'line', span:2, dim:'Tiempo', seed:292 },
  { id:'c94', group:'Efectividad', label:'Conversaciones reasignadas', kind:'bar', span:2, dim:'Tiempo', seed:293 },
  { id:'c95', group:'Efectividad', label:'Tiempo desde la primera asignación hasta el cierre', kind:'line', span:2, dim:'Tiempo', qualifier:'Mediana, Dentro del horario de atención', seed:294 },
  { id:'c96', group:'Desempeño de los compañeros de equipo', label:'Tiempo de gestión del compañero de equipo', kind:'kpi', span:1, qualifier:'Mediana, Dentro del horario de atención', value:'3m 42s' },
  { id:'c97', group:'Desempeño de los compañeros de equipo', label:'Tiempo de manejo ajustado del miembro del equipo', kind:'kpi', span:1, qualifier:'Mediana, Dentro del horario de atención', value:'2h 24m' },
  { id:'c98', group:'Desempeño de los compañeros de equipo', label:'Asignación de compañero de equipo a la respuesta inicial', kind:'kpi', span:1, qualifier:'Mediana, Dentro del horario de atención', value:'11m 08s' },
  { id:'c99', group:'Desempeño de los compañeros de equipo', label:'Asignación de compañero de equipo a una respuesta posterior', kind:'kpi', span:1, qualifier:'Mediana, Dentro del horario de atención', value:'1m 58s' },
  { id:'c100', group:'Desempeño de los compañeros de equipo', label:'Asignación de compañero de equipo para el cierre', kind:'kpi', span:1, qualifier:'Mediana, Dentro del horario de atención', value:'58m 03s' },
  { id:'c101', group:'Desempeño de los compañeros de equipo', label:'Conversaciones asignadas por hora activa', kind:'kpi', span:1, value:'4.3' },
  { id:'c102', group:'Desempeño de los compañeros de equipo', label:'Conversaciones respondidas por hora activa', kind:'kpi', span:1, value:'3.8' },
  { id:'c103', group:'Desempeño de los compañeros de equipo', label:'Conversaciones cerradas por hora activa', kind:'line', span:2, dim:'Tiempo', seed:302 },
  { id:'c104', group:'Desempeño de los compañeros de equipo', label:'Productividad de los compañeros de equipo', kind:'kpi', span:1, value:'87%' },
  { id:'c105', group:'Desempeño de los compañeros de equipo', label:'Puntuación CSAT del compañero de equipo', kind:'bar', span:2, dim:'Valoración de la conversación', seed:304 },
  { id:'c106', group:'Desempeño de los compañeros de equipo', label:'Calificaciones de las conversaciones de los compañeros de equipo', kind:'table', span:4, dim:'Compañero de equipo', seed:305 },
  { id:'c107', group:'Desempeño de los compañeros de equipo', label:'Comparación del desempeño de los compañeros de equipo', kind:'table', span:4, qualifier:'Mediana, Dentro del horario de atención', seed:306 },
  { id:'c108', group:'Desempeño de los compañeros de equipo de Inbox', label:'Asignación de equipo a la respuesta inicial', kind:'kpi', span:1, qualifier:'Mediana, Dentro del horario de atención', value:'9m 12s' },
  { id:'c109', group:'Desempeño de los compañeros de equipo de Inbox', label:'Asignación de equipo a una respuesta posterior', kind:'kpi', span:1, qualifier:'Mediana, Dentro del horario de atención', value:'2m 15s' },
  { id:'c110', group:'Desempeño de los compañeros de equipo de Inbox', label:'Asignación de equipo para el cierre', kind:'kpi', span:1, qualifier:'Mediana, Dentro del horario de atención', value:'4h 02m' },
  { id:'c111', group:'Desempeño de los compañeros de equipo de Inbox', label:'Conversaciones asignadas', kind:'kpi', span:1, value:'287' },
  { id:'c112', group:'Desempeño de los compañeros de equipo de Inbox', label:'Conversaciones respondidas a', kind:'kpi', span:1, value:'703' },
  { id:'c113', group:'Desempeño de los compañeros de equipo de Inbox', label:'Conversaciones cerradas', kind:'bar', span:2, dim:'Tiempo', seed:312 },
  { id:'c114', group:'Desempeño de los compañeros de equipo de Inbox', label:'Actividad de los compañeros de equipo', kind:'table', span:4, dim:'Equipo', seed:313 },
  { id:'c115', group:'Desempeño de los compañeros de equipo de Inbox', label:'Comparación del desempeño del buzón del equipo', kind:'table', span:4, qualifier:'Mediana, Dentro del horario de atención', seed:314 },
  { id:'c116', group:'SLA', label:'Tasa de incumplimiento del SLA de conversaciones y folios de atención', kind:'kpi', span:1, value:'12%' },
  { id:'c117', group:'SLA', label:'Conversaciones y folios de atención con SLA', kind:'kpi', span:1, value:'624' },
  { id:'c118', group:'SLA', label:'Conversaciones y folios de atención con SLA no cumplido', kind:'bar', span:2, dim:'Tipo de métrica de SLA', seed:317 },
  { id:'c119', group:'SLA', label:'Rendimiento del SLA', kind:'line', span:2, dim:'Tiempo · Tipo de métrica de SLA', qualifier:'Mediana', seed:318 },
  { id:'c120', group:'SLA', label:'Objetivos alcanzados con el tiempo', kind:'heatmap', span:4, dim:'Día de la semana · Hora del día', seed:319 },
  { id:'c121', group:'SLA', label:'Distribución por hora de objetivos no alcanzados', kind:'bar', span:2, seed:320 },
  { id:'c122', group:'Etiquetas de conversación', label:'Nuevas conversaciones', kind:'kpi', span:1, value:'124' },
  { id:'c123', group:'Etiquetas de conversación', label:'Conversaciones etiquetadas', kind:'bar', span:2, dim:'Tiempo', seed:322 },
  { id:'c124', group:'Etiquetas de conversación', label:'Conversaciones etiquetadas', kind:'bar', span:2, dim:'Etiqueta de la conversación', seed:323 },
  { id:'c125', group:'Etiquetas de conversación', label:'Etiquetas de conversación más usadas', kind:'table', span:4, seed:324 },
  { id:'c126', group:'Copilot', label:'Porcentaje de conversaciones que utilizan Copilot', kind:'kpi', span:1, value:'46%' },
  { id:'c127', group:'Copilot', label:'Preguntas de Copilot', kind:'kpi', span:1, value:'287' },
  { id:'c128', group:'Copilot', label:'Conversaciones con Copilot', kind:'kpi', span:1, value:'124' },
  { id:'c129', group:'Copilot', label:'Porcentaje de conversaciones con una respuesta copiada de Copilot', kind:'kpi', span:1, value:'63%' },
  { id:'c130', group:'Copilot', label:'Compañeros de equipo que usan Copilot', kind:'line', span:2, dim:'Tiempo', seed:329 },
  { id:'c131', group:'Copilot', label:'Porcentaje de conversaciones que utilizan Copilot', kind:'line', span:2, dim:'Tiempo', seed:330 },
  { id:'c132', group:'Copilot', label:'Compañeros de equipo que usan Copilot', kind:'table', span:4, dim:'Compañero de equipo', seed:331 },
  { id:'c133', group:'Copilot', label:'Descripción general de compañeros de equipo', kind:'table', span:4, dim:'Contenido de Copilot referenciado', seed:332 },
  { id:'c134', group:'Copilot', label:'Rendimiento del contenido de Copilot', kind:'table', span:4, seed:333 },
  { id:'c135', group:'Folios de atención', label:'Tiempo para resolver el folio de atención', kind:'kpi', span:1, qualifier:'Mediana, Dentro del horario de atención', value:'2h 24m' },
  { id:'c136', group:'Folios de atención', label:'Tiempo del folio de atención en enviado', kind:'kpi', span:1, qualifier:'Mediana', value:'11m 08s' },
  { id:'c137', group:'Folios de atención', label:'Tiempo del folio de atención en curso', kind:'kpi', span:1, qualifier:'Mediana', value:'1m 58s' },
  { id:'c138', group:'Folios de atención', label:'Tiempo del folio de atención en espera con el cliente', kind:'kpi', span:1, qualifier:'Mediana', value:'3m 42s' },
  { id:'c139', group:'Folios de atención', label:'Tiempo para resolver el folio de atención', kind:'line', span:2, dim:'Tiempo', qualifier:'Mediana, Dentro del horario de atención', seed:338 },
  { id:'c140', group:'Folios de atención', label:'Tiempo para resolver el folio de atención', kind:'table', span:4, dim:'Equipo asignado actualmente', qualifier:'Mediana, Dentro del horario de atención', seed:339 },
  { id:'c141', group:'Folios de atención', label:'Tiempo para resolver el folio de atención', kind:'table', span:4, dim:'Compañero de equipo asignado actualmente', qualifier:'Mediana, Dentro del horario de atención', seed:340 },
  { id:'c142', group:'Folios de atención', label:'Nuevos folios de atención', kind:'kpi', span:1, value:'124' },
  { id:'c143', group:'Folios de atención', label:'Folios de atención resueltos', kind:'kpi', span:1, value:'287' },
  { id:'c144', group:'Folios de atención', label:'Comparación de folios de atención nuevos y resueltos', kind:'bar', span:2, dim:'Tiempo', seed:343 },
  { id:'c145', group:'Folios de atención', label:'Volumen de folios de atención', kind:'table', span:4, dim:'Equipo asignado actualmente', seed:344 },
  { id:'c146', group:'Folios de atención', label:'Volumen de folios de atención', kind:'table', span:4, dim:'Compañero de equipo asignado actualmente', seed:345 },
  { id:'c147', group:'Llamadas', label:'Llamadas entrantes', kind:'kpi', span:1, value:'124' },
  { id:'c148', group:'Llamadas', label:'Llamadas salientes', kind:'kpi', span:1, value:'287' },
  { id:'c149', group:'Llamadas', label:'Llamadas por Messenger', kind:'kpi', span:1, value:'58' },
  { id:'c150', group:'Llamadas', label:'Duración de la llamada', kind:'kpi', span:1, qualifier:'Mediana', value:'3m 42s' },
  { id:'c151', group:'Llamadas', label:'Tiempo en fila de la llamada', kind:'kpi', span:1, qualifier:'Mediana', value:'1m 58s' },
  { id:'c152', group:'Llamadas', label:'Tiempo de conversación de la llamada', kind:'kpi', span:1, qualifier:'Mediana', value:'2m 15s' },
  { id:'c153', group:'Llamadas', label:'Llamadas', kind:'bar', span:2, dim:'Tiempo · Dirección de llamada', seed:352 },
  { id:'c154', group:'Llamadas', label:'Llamadas entrantes', kind:'bar', span:2, dim:'Tiempo · Estado de la llamada', seed:353 },
  { id:'c155', group:'Llamadas', label:'Tiempo de conversación de la llamada', kind:'line', span:2, dim:'Tiempo', qualifier:'Mediana', seed:354 },
  { id:'c156', group:'Llamadas', label:'Tiempo en fila de la llamada', kind:'line', span:2, dim:'Tiempo', qualifier:'Mediana', seed:355 },
  { id:'c157', group:'Llamadas', label:'Rendimiento de llamadas', kind:'table', span:4, dim:'Compañero de equipo', qualifier:'Mediana', seed:356 },
  { id:'c158', group:'Llamadas', label:'Answered calls', kind:'kpi', span:1, value:'612' },
  { id:'c159', group:'Llamadas', label:'Missed calls', kind:'kpi', span:1, value:'38' },
  { id:'c160', group:'Llamadas', label:'Abandoned calls', kind:'kpi', span:1, value:'22' },
  { id:'c161', group:'Llamadas', label:'Call outcomes', kind:'table', span:4, dim:'Compañero de equipo', seed:360 },
  { id:'c162', group:'Puntuación de la experiencia del cliente (CX)', label:'Puntuación general de la experiencia del cliente (CX)', kind:'kpi', span:1, value:'84' },
  { id:'c163', group:'Puntuación de la experiencia del cliente (CX)', label:'Puntuación de la experiencia del cliente de Fin AI Agent', kind:'kpi', span:1, value:'87%' },
  { id:'c164', group:'Puntuación de la experiencia del cliente (CX)', label:'Puntuación de la experiencia del cliente del compañero de equipo (CX)', kind:'kpi', span:1, value:'91%' },
  { id:'c165', group:'Puntuación de la experiencia del cliente (CX)', label:'Puntuación de la experiencia del cliente (CX) de Fin AI Agent y del compañero de equipo', kind:'kpi', span:1, value:'88%' },
  { id:'c166', group:'Puntuación de la experiencia del cliente (CX)', label:'Puntuación de la experiencia del cliente (CX) a lo largo del tiempo', kind:'line', span:2, dim:'Tiempo', seed:365 },
  { id:'c167', group:'Puntuación de la experiencia del cliente (CX)', label:'Razones de puntuación CX negativa 😞', kind:'doughnut', span:2, dim:'CX Score reasons', seed:366 },
  { id:'c168', group:'Puntuación de la experiencia del cliente (CX)', label:'Razones de puntuación CX positiva 😀', kind:'doughnut', span:2, dim:'CX Score reasons', seed:367 },
  { id:'c169', group:'Puntuación de la experiencia del cliente (CX)', label:'Temas de conversación con puntuación CX negativa', kind:'bar', span:2, dim:'AI Topic', seed:368 },
  { id:'c170', group:'Puntuación de la experiencia del cliente (CX)', label:'Puntuaciones de experiencia del cliente (CX) - por puntuación de experiencia del cliente (CX)', kind:'line', span:2, dim:'Tiempo', seed:369 },
  { id:'c171', group:'Puntuación de la experiencia del cliente (CX)', label:'Puntuaciones de experiencia del cliente (CX) - por puntuación de experiencia del cliente (CX)', kind:'bar', span:2, seed:370 },
  { id:'c172', group:'Puntuación de la experiencia del cliente (CX)', label:'Puntuaciones de la experiencia del cliente (CX)', kind:'table', span:4, seed:371 },
  { id:'c173', group:'Monitores', label:'Conversaciones evaluadas', kind:'bar', span:2, dim:'Tiempo · Monitorear', seed:372 },
  { id:'c174', group:'Monitores', label:'Puntuación de revisión', kind:'kpi', span:1, qualifier:'Mediana', value:'4.3' },
  { id:'c175', group:'Monitores', label:'Revisiones aprobadas', kind:'kpi', span:1, value:'63%' },
  { id:'c176', group:'Monitores', label:'Número de reseñas', kind:'kpi', span:1, value:'142' },
  { id:'c177', group:'Monitores', label:'Revisiones fallidas', kind:'kpi', span:1, value:'18' },
  { id:'c178', group:'Monitores', label:'Tendencias de la tasa de aprobación de la tarjeta de puntuación', kind:'line', span:2, dim:'Tiempo · Tarjeta de puntuación', seed:377 },
  { id:'c179', group:'Monitores', label:'Revise las tendencias de puntuación por tarjeta de evaluación', kind:'line', span:2, dim:'Tiempo · Tarjeta de puntuación', qualifier:'Mediana', seed:378 },
  { id:'c180', group:'Monitores', label:'Tendencias de la puntuación de los criterios a lo largo del tiempo', kind:'line', span:2, dim:'Tiempo · Criterios de la tarjeta de puntuación', qualifier:'Mediana', seed:379 },
  { id:'c181', group:'Monitores', label:'Revisiones completadas por el revisor', kind:'table', span:4, dim:'Tiempo · Revisado por', seed:380 },
  { id:'c182', group:'Otros', label:'Nuevas conversaciones entrantes', kind:'kpi', span:1, value:'703' },
  { id:'c183', group:'Otros', label:'Nuevas conversaciones entrantes', kind:'bar', span:2, dim:'Tiempo', seed:382 },
  { id:'c184', group:'Otros', label:'Conversaciones respondidas a', kind:'bar', span:2, dim:'Tiempo', seed:383 },
  { id:'c185', group:'Otros', label:'Calificaciones de las conversaciones de los compañeros de equipo', kind:'bar', span:2, dim:'Valoración de la conversación', seed:384 },
  { id:'c186', group:'Otros', label:'Conversaciones con observaciones', kind:'kpi', span:1, value:'124' },
  { id:'c187', group:'Otros', label:'Todas las observaciones', kind:'kpi', span:1, value:'287' },
  { id:'c188', group:'Otros', label:'🤩 Sorprendentes comentarios', kind:'kpi', span:1, value:'46' },
  { id:'c189', group:'Otros', label:'😃 Grandes comentarios', kind:'kpi', span:1, value:'91' },
  { id:'c190', group:'Otros', label:'😐 Buenos comentarios', kind:'kpi', span:1, value:'63' },
  { id:'c191', group:'Otros', label:'🙁 Malos comentarios', kind:'kpi', span:1, value:'18' },
  { id:'c192', group:'Otros', label:'😠 Comentarios terribles', kind:'kpi', span:1, value:'7' },
  { id:'c193', group:'Otros', label:'Todos los comentarios sobre las conversaciones de Fin AI Agent', kind:'kpi', span:1, value:'234' },
  { id:'c194', group:'Otros', label:'🤩 Sorprendentes comentarios para Fin AI Agent', kind:'kpi', span:1, value:'52' },
  { id:'c195', group:'Otros', label:'😃 Excelente comentarios para Fin AI Agent', kind:'kpi', span:1, value:'88' },
  { id:'c196', group:'Otros', label:'😐 Buenos comentarios para Fin AI Agent', kind:'kpi', span:1, value:'41' },
  { id:'c197', group:'Otros', label:'🙁 Malos comentarios para Fin AI Agent', kind:'kpi', span:1, value:'12' },
  { id:'c198', group:'Otros', label:'😠 Terribles comentarios para Fin AI Agent', kind:'kpi', span:1, value:'5' },
  { id:'c199', group:'Otros', label:'Tiempo de respuesta inicial: incluido el tiempo asignado al bot', kind:'line', span:2, dim:'Tiempo', qualifier:'Mediana, Dentro del horario de atención', seed:398 },
  { id:'c200', group:'Otros', label:'Tiempo de respuesta inicial: excluyendo el tiempo asignado al bot', kind:'line', span:2, dim:'Tiempo', qualifier:'Mediana, Dentro del horario de atención', seed:399 },
  { id:'c201', group:'Otros', label:'Tiempo hasta el cierre: incluido el tiempo asignado al bot', kind:'line', span:2, dim:'Tiempo', qualifier:'Mediana, Dentro del horario de atención', seed:400 },
  { id:'c202', group:'Otros', label:'Hora de cierre: excluyendo la hora asignada al bot', kind:'line', span:2, dim:'Tiempo', qualifier:'Mediana, Dentro del horario de atención', seed:401 },
  { id:'c203', group:'Otros', label:'Descripción general de compañeros de equipo', kind:'table', span:4, dim:'Compañero de equipo', qualifier:'Mediana, Dentro del horario de atención', seed:402 },
  { id:'c204', group:'Otros', label:'Resoluciones asumidas por Fin AI Agent', kind:'kpi', span:1, value:'68%' },
  { id:'c205', group:'Otros', label:'Resoluciones confirmadas de Fin AI Agent', kind:'kpi', span:1, value:'54%' },
  { id:'c206', group:'Otros', label:'Calificaciones de las conversaciones de Fin AI Agent', kind:'bar', span:2, dim:'Valoración de la conversación', seed:405 },
  { id:'c207', group:'Otros', label:'Calificaciones de las conversaciones de Fin AI Agent', kind:'bar', span:2, dim:'Valoración de la conversación', seed:406 },
  { id:'c208', group:'Otros', label:'Tasa de actividad de Fin AI agent', kind:'kpi', span:1, value:'87%' },
  { id:'c209', group:'Otros', label:'Tasa de resolución de respuesta de AI de Fin AI Agent', kind:'kpi', span:1, value:'63%' },
  { id:'c210', group:'Otros', label:'Tasa de resolución de respuestas personalizadas de Fin AI Agent', kind:'kpi', span:1, value:'46%' },
  { id:'c211', group:'Otros', label:'Respuestas de la encuesta de satisfacción de clientes de Fin Ai Agent', kind:'kpi', span:1, value:'312' },
  { id:'c212', group:'Otros', label:'Calificaciones de las conversaciones de Fin AI Agent', kind:'bar', span:2, dim:'Valoración de la conversación', seed:411 },
  { id:'c213', group:'Otros', label:'Participación de Fin AI Agent', kind:'bar', span:2, dim:'Fin AI Agent activo', seed:412 },
  { id:'c214', group:'Otros', label:'Comentarios sobre las calificaciones de las conversaciones de Fin AI Agent', kind:'kpi', span:1, value:'156' },
  { id:'c215', group:'Otros', label:'Observaciones de satisfacción del cliente (CSAT) encuestada', kind:'kpi', span:1, value:'402' },
  { id:'c216', group:'Otros', label:'El impacto de Fin AI Agent a lo largo del tiempo', kind:'line', span:2, dim:'Tiempo', seed:415 },
  { id:'c217', group:'Otros', label:'Tendencias de puntuación de revisión por equipo', kind:'table', span:4, dim:'Equipo asignado actualmente', qualifier:'Mediana', seed:416 },
  { id:'c218', group:'Otros', label:'Tendencias de puntuación de revisión por evaluado', kind:'table', span:4, dim:'Revisado', qualifier:'Mediana', seed:417 },
  { id:'c219', group:'Otros', label:'Tarjetas de evaluación evaluadas', kind:'bar', span:2, dim:'Resultado de la tarjeta de puntuación', seed:418 },
  { id:'c220', group:'Otros', label:'Criterios evaluados de la tarjeta de puntuación', kind:'bar', span:2, dim:'Opción de calificación de criterios de la tarjeta de evaluación', seed:419 },
  { id:'c221', group:'Otros', label:'Tiempo de respuesta inicial: excluyendo el tiempo asignado al bot', kind:'kpi', span:1, qualifier:'Mediana, Dentro del horario de atención', value:'3m 42s' },
  { id:'c222', group:'Otros', label:'Tiempo de primera respuesta: excluyendo el tiempo asignado al bot', kind:'line', span:2, dim:'Tiempo', qualifier:'Mediana, Dentro del horario de atención', seed:421 },
  { id:'c223', group:'Otros', label:'Hora de cierre: excluyendo la hora asignada al bot', kind:'kpi', span:1, qualifier:'Mediana, Dentro del horario de atención', value:'2h 24m' },
  { id:'c224', group:'Otros', label:'Hora de cierre: excluyendo la hora asignada al bot', kind:'line', span:2, dim:'Tiempo', qualifier:'Mediana, Dentro del horario de atención', seed:423 },
  { id:'c225', group:'Otros', label:'Tiempo de respuesta: excluye el tiempo asignado al bot', kind:'kpi', span:1, qualifier:'Mediana, Dentro del horario de atención', value:'1m 58s' },
  { id:'c226', group:'Otros', label:'Tiempo de respuesta: excluye el tiempo asignado al bot', kind:'line', span:2, dim:'Tiempo', qualifier:'Mediana, Dentro del horario de atención', seed:425 },
  { id:'c227', group:'Otros', label:'Distribución horaria de los tiempos de respuesta: excluye el tiempo asignado al bot', kind:'heatmap', span:4, dim:'Día de la semana · Hora del día', qualifier:'Mediana, Dentro del horario de atención', seed:426 },
  { id:'c228', group:'Otros', label:'Desglose del tiempo de primera respuesta', kind:'table', span:2, dim:'Intervalos de tiempo personalizados', qualifier:'Rango, Dentro del horario de atención', isNew:true, seed:427 },
  { id:'c229', group:'Otros', label:'Desglose de tiempo para cerrar', kind:'table', span:2, dim:'Intervalos de tiempo personalizados', qualifier:'Rango, Dentro del horario de atención', isNew:true, seed:428 },
];
const CATALOG_BY_ID: Record<string, CatalogItem> = Object.fromEntries(BUILDER_CATALOG.map(i => [i.id, i]));

// Renderiza el cuerpo real de un componente colocado en el lienzo.
function builderDefaultHeight(kind: BuilderKind): number {
  return kind === 'heatmap' ? 300 : kind === 'table' ? 220 : 260;
}
function BuilderCardBody({ item, height, variant }: { item: CatalogItem; height?: number; variant?: string }) {
  const h = height ?? builderDefaultHeight(item.kind);
  const seed = item.seed ?? 3;
  // Variantes del editor (barra horizontal, combo barra+línea, matriz 7×24).
  if (variant === 'hbar') {
    return <KpiChartCard title={item.label} height={h}><KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: item.label, data: mockSeries(40, 14, 1, seed) }]} type="bar" horizontal showLegend={false} /></KpiChartCard>;
  }
  if (variant === 'combo') {
    return <KpiChartCard title={item.label} height={h}><KpiTimeSeries labels={MOCK_WEEKS} series={[
      { label: item.label, data: mockSeries(40, 14, 1, seed), chartType: 'bar' },
      { label: item.label, data: mockSeries(46, 10, 0.6, seed + 1), chartType: 'line' },
    ]} /></KpiChartCard>;
  }
  if (variant === 'matrix' || (!variant && item.kind === 'heatmap')) {
    const H = Math.max(h, 300);
    const rowH = Math.max(24, Math.floor((H - 74) / HEATMAP_DAYS.length)); // llena el alto de la tarjeta
    return (
      <KpiChartCard title={item.label} height={H}>
        <KpiHeatmap rows={HEATMAP_DAYS} cols={HEATMAP_HOURS} matrix={mock24Heatmap(seed + 44)} legend showValues={false}
          rowHeight={rowH} fmtTitle={(v, r, c) => `${v} (${r} a las ${c}:00)`} />
      </KpiChartCard>
    );
  }
  switch (item.kind) {
    case 'kpi':
      return <div className="h-full"><KpiCard label={item.label} value={item.value ?? '0'} sub={item.sub} change={item.change} trend={item.trend} /></div>;
    case 'title':
      return <div className="py-2 px-1 h-full flex items-center"><h3 className="text-[16px] font-bold text-[#1a1a1a]">{item.value ?? item.label}</h3></div>;
    case 'line':
      return <KpiChartCard title={item.label} height={h}><KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: item.label, data: mockSeries(60, 12, 1, seed), fill: variant !== 'line' }]} type="line" showLegend={false} /></KpiChartCard>;
    case 'bar':
      return <KpiChartCard title={item.label} height={h}><KpiTimeSeries labels={MOCK_WEEKS} series={[{ label: item.label, data: mockSeries(40, 14, 1, seed) }]} type="bar" showLegend={false} /></KpiChartCard>;
    case 'doughnut':
      return <KpiChartCard title={item.label} height={h}><KpiDoughnut labels={['Tiempo de espera', 'Resolución', 'Tono', 'Otros']} values={[38, 24, 16, 22]} /></KpiChartCard>;
    case 'heatmap':
      return <KpiChartCard title={item.label} height={Math.max(h, 300)}><KpiHeatmap rows={HEATMAP_DAYS} cols={HEATMAP_HOURS} matrix={mock24Heatmap(seed + 44)} legend showValues={false} fmtTitle={(v, r, c) => `${v} (${r} a las ${c}:00)`} /></KpiChartCard>;
    case 'table':
      return <KpiChartCard title={item.label} height={h}><KpiTable columns={['Nombre', 'Valor']} rows={[['Ana Torres', '42'], ['Luis Vega', '31'], ['María Ruiz', '27']]} /></KpiChartCard>;
  }
}
// Memoizada: durante el resize solo se re-renderiza la tarjeta que cambia, no
// todos los gráficos del lienzo → redimensionado fluido.
const BuilderCardBodyMemo = memo(BuilderCardBody);

// Colores de fondo para el componente banner/título.
const BANNER_COLORS: { id: string; bg: string; swatch: string }[] = [
  { id: 'none', bg: 'transparent', swatch: '#ffffff' },
  { id: 'blue', bg: '#dbeafe', swatch: '#bfdbfe' },
  { id: 'green', bg: '#dcfce7', swatch: '#bbf7d0' },
  { id: 'gray', bg: '#f1f1ee', swatch: '#e5e5e2' },
  { id: 'pink', bg: '#fce7f3', swatch: '#fbcfe8' },
  { id: 'yellow', bg: '#fef9c3', swatch: '#fef08a' },
];

// Banner / título editable con barra flotante de colores + papelera.
function BuilderBanner({ text, color, onText, onColor, onDelete }: {
  text: string; color: string; onText: (t: string) => void; onColor: (c: string) => void; onDelete: () => void;
}) {
  const bg = (BANNER_COLORS.find(c => c.id === color) ?? BANNER_COLORS[3]).bg;
  return (
    <div className="relative h-full">
      {/* Barra flotante (aparece al pasar el ratón) */}
      <div className="absolute -top-9 left-1/2 -translate-x-1/2 z-20 hidden group-hover:flex items-center gap-1.5 bg-white border border-[#e9eae6] rounded-full shadow-md px-2 py-1">
        {BANNER_COLORS.map(c => (
          <button key={c.id} onClick={() => onColor(c.id)} title={c.id}
            className={`w-5 h-5 rounded-full flex items-center justify-center border ${color === c.id ? 'border-[#1a1a1a]' : 'border-[#e9eae6]'}`}
            style={{ background: c.id === 'none' ? '#fff' : c.swatch }}>
            {c.id === 'none' && <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#c4c4c1]" strokeWidth="1.4"><circle cx="8" cy="8" r="6"/><path d="M4 12L12 4"/></svg>}
            {color === c.id && c.id !== 'none' && <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-[#1a1a1a]" strokeWidth="2"><path d="M3 8l3 3 6-7"/></svg>}
          </button>
        ))}
        <span className="w-px h-4 bg-[#e9eae6] mx-0.5" />
        <button onClick={onDelete} title="Eliminar" className="w-5 h-5 flex items-center justify-center text-[#646462] hover:text-[#dc2626]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5L11 4"/></svg>
        </button>
      </div>
      {/* Bloque del banner con título editable */}
      <div className="h-full min-h-[56px] rounded-[10px] px-4 py-3 flex items-center" style={{ background: bg }}>
        <input value={text} onChange={e => onText(e.target.value)} placeholder="Ingresa un título"
          className="w-full bg-transparent outline-none text-[16px] font-bold text-[#1a1a1a] placeholder:text-[#9a9a97] placeholder:font-normal" />
      </div>
    </div>
  );
}

// Miniatura del componente en el panel lateral "Agregar un gráfico" — dibujo
// representativo del tipo de gráfico, al estilo Intercom.
function CatalogThumb({ item }: { item: CatalogItem }) {
  const C = 2 * Math.PI * 6;
  const segs: [string, number][] = [['#3b59f6', 0.42], ['#ec4899', 0.26], ['#f59e0b', 0.18], ['#22c55e', 0.14]];
  if (item.kind === 'kpi')
    return <span className="text-[20px] font-semibold text-[#c4c4c1]">{(item.value ?? '').includes('%') ? '99%' : '123'}</span>;
  if (item.kind === 'title')
    return <span className="text-[10.5px] font-semibold text-[#9a9a97] bg-[#e6e6e3] rounded px-2.5 py-1">Title</span>;
  if (item.kind === 'line')
    return (
      <svg viewBox="0 0 60 34" className="w-[60px] h-[34px]">
        <path d="M2 26 L14 15 L26 20 L38 8 L50 13 L58 6" fill="none" stroke="#3b59f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2 26 L14 15 L26 20 L38 8 L50 13 L58 6 L58 32 L2 32 Z" fill="#3b59f6" opacity="0.12" />
        {[[2,26],[14,15],[26,20],[38,8],[50,13],[58,6]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="1.7" fill="#3b59f6" />)}
      </svg>
    );
  if (item.kind === 'bar')
    return (
      <svg viewBox="0 0 60 34" className="w-[60px] h-[34px]">
        <rect x="4" y="5" width="40" height="5" rx="2.5" fill="#3b59f6" />
        <rect x="4" y="14.5" width="52" height="5" rx="2.5" fill="#7aa0f7" />
        <rect x="4" y="24" width="28" height="5" rx="2.5" fill="#b9caf9" />
      </svg>
    );
  if (item.kind === 'table')
    return (
      <svg viewBox="0 0 60 34" className="w-[60px] h-[34px]" stroke="#c4c4c1" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round">
        <line x1="4" y1="8" x2="56" y2="8" /><line x1="4" y1="17" x2="56" y2="17" /><line x1="4" y1="26" x2="40" y2="26" />
      </svg>
    );
  if (item.kind === 'heatmap')
    return (
      <svg viewBox="0 0 60 34" className="w-[60px] h-[34px]">
        {Array.from({ length: 3 }).flatMap((_, r) => Array.from({ length: 6 }).map((__, c) => {
          const o = [0.25, 0.55, 0.85, 0.65, 0.4, 0.2][(r * 6 + c * 2) % 6];
          return <rect key={`${r}-${c}`} x={4 + c * 9} y={4 + r * 9} width="7" height="7" rx="1.5" fill="#3b59f6" opacity={o} />;
        }))}
      </svg>
    );
  // doughnut
  let off = 0;
  return (
    <svg viewBox="0 0 16 16" className="w-9 h-9">
      {segs.map(([c, f], i) => {
        const el = <circle key={i} cx="8" cy="8" r="6" fill="none" stroke={c} strokeWidth="3.4" strokeDasharray={`${(f * C).toFixed(2)} ${C.toFixed(2)}`} strokeDashoffset={(-off * C).toFixed(2)} transform="rotate(-90 8 8)" />;
        off += f;
        return el;
      })}
    </svg>
  );
}

function ReportBuilderCanvas({ initialTitle, onClose }: { initialTitle: string; onClose: () => void }) {
  const [title, setTitle] = useState(initialTitle);
  const [desc, setDesc] = useState('');
  const [placed, setPlaced] = useState<{ uid: number; itemId: string; span: number; height?: number; text?: string; color?: string; kind?: BuilderKind; title?: string; variant?: string }[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [q, setQ] = useState('');
  const [dragOver, setDragOver] = useState<number | string | null>(null);
  const [resizing, setResizing] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const uidRef = useRef(1);
  const dragUid = useRef<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // El lienzo usa una rejilla de 12 columnas para dar mucha más libertad de
  // tamaño. Se convierte el span del catálogo (1/2/4) a la escala de 12.
  const to12 = (s: number) => s >= 4 ? 12 : s === 2 ? 6 : s === 1 ? 3 : 6;

  const addItem = (itemId: string, beforeUid?: number | null) => {
    const cat = CATALOG_BY_ID[itemId];
    if (!cat) return;
    setPlaced(prev => {
      const arr = [...prev];
      const entry = { uid: uidRef.current++, itemId, span: to12(cat.span) };
      let to = beforeUid == null ? arr.length : arr.findIndex(p => p.uid === beforeUid);
      if (to < 0) to = arr.length;
      arr.splice(to, 0, entry);
      return arr;
    });
  };
  const moveItem = (uid: number, beforeUid: number | null) => {
    setPlaced(prev => {
      const arr = [...prev];
      const from = arr.findIndex(p => p.uid === uid);
      if (from < 0) return prev;
      const [it] = arr.splice(from, 1);
      let to = beforeUid == null ? arr.length : arr.findIndex(p => p.uid === beforeUid);
      if (to < 0) to = arr.length;
      arr.splice(to, 0, it);
      return arr;
    });
  };
  const removeItem = (uid: number) => setPlaced(prev => prev.filter(p => p.uid !== uid));
  const duplicateItem = (uid: number) => setPlaced(prev => {
    const i = prev.findIndex(p => p.uid === uid);
    if (i < 0) return prev;
    const copy = { ...prev[i], uid: uidRef.current++ };
    const arr = [...prev];
    arr.splice(i + 1, 0, copy);
    return arr;
  });
  const commitEdit = (uid: number, kind: BuilderKind, title: string, variant?: string) => {
    // El heatmap (24 columnas) necesita el ancho completo para leerse bien.
    const fullWidth = variant === 'matrix' || kind === 'heatmap';
    setPlaced(prev => prev.map(p => p.uid === uid ? { ...p, kind, title, variant, span: fullWidth ? 12 : p.span } : p));
    setEditing(null);
  };

  // Ajustador libre: arrastra la esquina inferior-derecha para cambiar ancho
  // (columnas, 1..4) y alto (px) de cada gráfico.
  const startResize = (e: ReactMouseEvent, p: { uid: number; itemId: string; span: number; height?: number }) => {
    e.preventDefault(); e.stopPropagation();
    const gw = gridRef.current ? gridRef.current.clientWidth : 1000;
    const colStep = (gw - 11 * 12) / 12 + 12; // ancho de una columna (de 12) incl. gap
    const startX = e.clientX, startY = e.clientY, startSpan = p.span;
    const kind = CATALOG_BY_ID[p.itemId]?.kind ?? 'line';
    const isKpi = kind === 'kpi';
    const isTitle = kind === 'title';
    const spanMax = isKpi ? 6 : 12;
    const startH = p.height ?? builderDefaultHeight(kind);
    setResizing(p.uid);
    let raf = 0;
    let pending: { x: number; y: number } | null = null;
    const apply = () => {
      raf = 0;
      if (!pending) return;
      const dCols = Math.round((pending.x - startX) / colStep);
      const span = Math.min(spanMax, Math.max(2, startSpan + dCols));
      // Alto libre y continuo (sin escalones) para gráficos; los KPIs numéricos
      // y los títulos conservan su alto natural.
      const height = (!isKpi && !isTitle) ? Math.max(140, startH + (pending.y - startY)) : undefined;
      // Solo re-renderiza esta tarjeta (BuilderCardBodyMemo evita redibujar el
      // resto de gráficos). Si nada cambia, se descarta la actualización.
      setPlaced(prev => prev.map(q => {
        if (q.uid !== p.uid) return q;
        if (q.span === span && q.height === height) return q;
        return { ...q, span, height };
      }));
    };
    const move = (ev: MouseEvent) => {
      pending = { x: ev.clientX, y: ev.clientY };
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const up = () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      apply(); // fija la posición/tamaño final aunque el último frame no llegara
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); setResizing(null);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const updatePlaced = (uid: number, patch: Partial<{ text: string; color: string }>) =>
    setPlaced(prev => prev.map(p => p.uid === uid ? { ...p, ...patch } : p));

  const onDropAt = (e: DragEvent, beforeUid: number | null) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(null); setDragging(false);
    let data: any = null;
    try { data = JSON.parse(e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain') || 'null'); } catch { data = null; }
    if (data && data.t === 'new' && data.itemId) addItem(data.itemId, beforeUid);
    else if (data && data.t === 'move' && data.uid != null) moveItem(data.uid, beforeUid);
    else if (dragUid.current != null) moveItem(dragUid.current, beforeUid); // respaldo si dataTransfer no está disponible
    dragUid.current = null;
  };

  const groups = [...new Set(BUILDER_CATALOG.map(i => i.group))];
  const query = q.trim().toLowerCase();

  // Layout de flujo por filas de 12 columnas: intercala huecos vacíos que se
  // vuelven zonas de soltado (solo visibles al arrastrar), para poder colocar
  // una tarjeta en cualquier hueco libre (p.ej. la esquina superior derecha).
  type LayoutNode = { type: 'card'; p: typeof placed[number] } | { type: 'gap'; span: number; insertIndex: number; key: string };
  const layout: LayoutNode[] = [];
  {
    let col = 0;
    for (let i = 0; i < placed.length; i++) {
      const span = placed[i].span;
      if (col > 0 && col + span > 12) {
        if (12 - col >= 2) layout.push({ type: 'gap', span: 12 - col, insertIndex: i, key: `gap-${placed[i].uid}` });
        col = 0;
      }
      layout.push({ type: 'card', p: placed[i] });
      col += span;
      if (col >= 12) col = 0;
    }
    if (col > 0 && 12 - col >= 2) layout.push({ type: 'gap', span: 12 - col, insertIndex: placed.length, key: 'gap-end' });
  }

  // Editor de gráfico a pantalla completa (al pulsar "Editar" en un bloque).
  if (editing != null) {
    const p = placed.find(x => x.uid === editing);
    const item = p ? CATALOG_BY_ID[p.itemId] : null;
    if (p && item) {
      return <ChartEditor item={item} initialKind={p.kind ?? item.kind} initialTitle={p.title ?? item.label} initialVariant={p.variant} onCancel={() => setEditing(null)} onUpdate={(k, t, v) => commitEdit(p.uid, k, t, v)} />;
    }
  }

  return (
    <div className="flex flex-1 min-h-0 gap-2">
      <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
        {/* Header editor */}
        <div className="flex-shrink-0 px-6 py-3 border-b border-[#e9eae6] flex items-center gap-3">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a] flex-shrink-0" strokeWidth="1.5"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M5 6h6M5 8h6M5 10h4"/></svg>
          <div className="min-w-0 flex-1">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título del informe" className="w-full text-[18px] font-bold text-[#1a1a1a] outline-none placeholder:text-[#c9c9c6]" />
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ingresa una descripción" className="w-full text-[12.5px] text-[#646462] outline-none placeholder:text-[#a4a4a2]" />
          </div>
          <button onClick={onClose} className="text-[13px] font-medium text-[#1a1a1a] rounded-full px-3 py-[6px] hover:bg-[#f3f3f1]">Cancelar</button>
          <button onClick={() => setPanelOpen(p => !p)} className="flex items-center gap-1.5 text-[13px] font-medium text-[#1a1a1a] border border-[#e9eae6] rounded-full px-3 py-[6px] hover:bg-[#f5f5f4]">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
            Agregar un gráfico
          </button>
          <button onClick={onClose} className="text-[13px] font-semibold text-white bg-[#1a1a1a] rounded-full px-4 py-[6px] hover:bg-black">Guardar</button>
        </div>
        {/* Filtros guardados (static) */}
        <div className="flex-shrink-0 px-6 py-2.5 border-b border-[#e9eae6] flex items-center gap-2 text-[12.5px]">
          <span className="text-[#646462] flex items-center gap-1"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><path d="M2 4h12M4 8h8M6 12h4"/></svg>Filtros guardados:</span>
          <span className="border border-[#e9eae6] rounded-full px-2.5 py-1 text-[#1a1a1a]">Jun 26, 2026 - Jul 23, 2026</span>
          <span className="border border-dashed border-[#d4d4d2] rounded-full px-2.5 py-1 text-[#646462]">+ Añadir filtro</span>
        </div>
        {/* Lienzo drop zone — crece indefinidamente y hace scroll */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto min-h-0 p-6"
          onDragOver={e => {
            e.preventDefault(); setDragOver('end');
            // auto-scroll cerca de los bordes para poder seguir construyendo
            const el = scrollRef.current;
            if (el) { const r = el.getBoundingClientRect(); if (e.clientY < r.top + 64) el.scrollTop -= 20; else if (e.clientY > r.bottom - 64) el.scrollTop += 20; }
          }}
          onDragLeave={() => setDragOver(null)}
          onDrop={e => onDropAt(e, null)}
        >
          {placed.length === 0 ? (
            <div className={`h-full min-h-[320px] rounded-[12px] border-2 border-dashed flex flex-col items-center justify-center text-center transition-colors ${dragOver ? 'border-[#3b59f6] bg-[#f5f7ff]' : 'border-[#e0e0dd]'}`}>
              <svg viewBox="0 0 16 16" className="w-8 h-8 fill-[#c9c9c6] mb-3"><path d="M2 13V9h2.5v4H2zm3.5 0V6.5H8V13H5.5zm3.5 0V4h2.5v9H9zm3.5 0V7.5H15V13h-2.5z"/></svg>
              <p className="text-[14px] font-semibold text-[#1a1a1a] mb-1">Arrastra gráficos aquí</p>
              <p className="text-[12.5px] text-[#646462] mb-4 max-w-[320px]">Arrastra un KPI o gráfico desde el panel de la derecha, o pulsa "Agregar un gráfico" para empezar tu monitor.</p>
              <button onClick={() => setPanelOpen(true)} className="flex items-center gap-1.5 text-[13px] font-semibold text-[#1a1a1a] border border-[#e9eae6] rounded-full px-3 py-[6px] hover:bg-[#f5f5f4]">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>Agregar un gráfico
              </button>
            </div>
          ) : (
            <div ref={gridRef} className="grid grid-cols-12 gap-3 auto-rows-min pb-40">
              {layout.map(node => {
                if (node.type === 'gap') {
                  // Zona de soltado en un hueco libre — solo activa mientras se arrastra.
                  if (!dragging) return null;
                  const beforeUid = placed[node.insertIndex]?.uid ?? null;
                  const active = dragOver === node.key;
                  return (
                    <div key={node.key} style={{ gridColumn: `span ${node.span} / span ${node.span}` }}
                      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(node.key); }}
                      onDrop={e => onDropAt(e, beforeUid)}
                      className={`rounded-[10px] border-2 border-dashed min-h-[90px] flex items-center justify-center text-[11px] font-medium transition-colors ${active ? 'border-[#3b59f6] bg-[#eef2ff] text-[#3b59f6]' : 'border-[#cfd0cd] bg-[#fafafa] text-[#a4a4a2]'}`}>
                      Soltar aquí
                    </div>
                  );
                }
                const p = node.p;
                const baseItem = CATALOG_BY_ID[p.itemId];
                if (!baseItem) return null;
                // Item efectivo: aplica el tipo/título editado por-instancia; por
                // defecto se muestra el diseño original del KPI.
                const item = { ...baseItem, kind: p.kind ?? baseItem.kind, label: p.title ?? baseItem.label };
                const isBanner = item.kind === 'title';
                const showDrop = dragOver === p.uid && dragUid.current !== p.uid;
                return (
                  <div
                    key={p.uid}
                    style={{ gridColumn: `span ${p.span} / span ${p.span}` }}
                    className={`group relative ${resizing === p.uid ? 'ring-2 ring-[#3b59f6] rounded-[12px]' : ''}`}
                    draggable={resizing == null}
                    onDragStart={e => { dragUid.current = p.uid; setDragging(true); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('application/json', JSON.stringify({ t: 'move', uid: p.uid })); }}
                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(p.uid); }}
                    onDrop={e => onDropAt(e, p.uid)}
                    onDragEnd={() => { dragUid.current = null; setDragOver(null); setDragging(false); }}
                  >
                    {/* Indicador de destino: aquí caerá el gráfico al soltar */}
                    {showDrop && <div className="absolute -left-[7px] top-0 bottom-0 w-[3px] bg-[#3b59f6] rounded-full z-20" />}
                    {/* Controles por bloque (los banners tienen su propia barra) */}
                    {!isBanner && (
                      <div className="absolute -top-3.5 right-1 z-20 hidden group-hover:flex items-center gap-1 bg-white border border-[#e9eae6] rounded-md shadow-sm px-1 py-0.5">
                        <button onClick={() => setEditing(p.uid)} title="Detallado" className="flex items-center gap-1 text-[11.5px] font-medium text-[#1a1a1a] px-1.5 py-1 rounded hover:bg-[#f3f3f1]">
                          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current" strokeWidth="1.6"><path d="M5 4L2 8l3 4M11 4l3 4-3 4"/></svg>Detallado
                        </button>
                        <button onClick={() => setEditing(p.uid)} title="Editar" className="flex items-center gap-1 text-[11.5px] font-medium text-[#1a1a1a] px-1.5 py-1 rounded hover:bg-[#f3f3f1]">
                          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current" strokeWidth="1.4"><path d="M11 2l3 3-8 8H3v-3z"/></svg>Editar
                        </button>
                        <div className="relative">
                          <button onClick={() => setMenuOpen(menuOpen === p.uid ? null : p.uid)} title="Más" className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#f3f3f1] text-[#646462]">⋯</button>
                          {menuOpen === p.uid && (
                            <div className="absolute right-0 top-7 w-56 bg-white border border-[#e9eae6] rounded-lg shadow-lg py-1 z-30" onMouseLeave={() => setMenuOpen(null)}>
                              <button onClick={() => setMenuOpen(null)} className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-[#1a1a1a] hover:bg-[#f8f8f7]">
                                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><path d="M8 2v8M5 7l3 3 3-3M2 13h12"/></svg>Exportar datos agregados
                              </button>
                              <button onClick={() => { duplicateItem(p.uid); setMenuOpen(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-[#1a1a1a] hover:bg-[#f8f8f7]">
                                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5"/></svg>Duplicar
                              </button>
                              <button onClick={() => { removeItem(p.uid); setMenuOpen(null); }} className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-[#dc2626] hover:bg-[#fef2f2]">
                                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5L11 4"/></svg>Eliminar
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="absolute top-1.5 left-1.5 z-10 hidden group-hover:flex cursor-grab active:cursor-grabbing w-5 h-5 rounded bg-white/80 border border-[#e9eae6] items-center justify-center text-[#9a9a97]">
                      <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current"><circle cx="5" cy="4" r="1"/><circle cx="11" cy="4" r="1"/><circle cx="5" cy="8" r="1"/><circle cx="11" cy="8" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="11" cy="12" r="1"/></svg>
                    </div>
                    {isBanner
                      ? <BuilderBanner text={p.text ?? ''} color={p.color ?? 'gray'} onText={t => updatePlaced(p.uid, { text: t })} onColor={c => updatePlaced(p.uid, { color: c })} onDelete={() => removeItem(p.uid)} />
                      : <BuilderCardBodyMemo item={item} height={p.height} variant={p.variant} />}
                    {/* Ajustador de tamaño (esquina inferior derecha) */}
                    <div
                      onMouseDown={e => startResize(e, p)}
                      title="Arrastra para redimensionar"
                      className="absolute bottom-1 right-1 z-10 w-4 h-4 cursor-nwse-resize opacity-0 group-hover:opacity-100 flex items-end justify-end text-[#9a9a97] hover:text-[#3b59f6]"
                    >
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.6" strokeLinecap="round"><path d="M14 6L6 14M14 11l-3 3" /></svg>
                    </div>
                  </div>
                );
              })}
              {/* Indicador de destino al final */}
              {dragOver === 'end' && (
                <div style={{ gridColumn: 'span 12 / span 12' }}><div className="h-[3px] bg-[#3b59f6] rounded-full my-1" /></div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Panel lateral: Agregar un gráfico */}
      {panelOpen && (
        <div className="w-[340px] flex-shrink-0 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          <div className="flex-shrink-0 px-4 py-3 border-b border-[#e9eae6] flex items-center justify-between">
            <h2 className="text-[15px] font-bold text-[#1a1a1a]">Agregar un gráfico</h2>
            <button onClick={() => setPanelOpen(false)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#f3f3f1] text-[#646462]">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8"/></svg>
            </button>
          </div>
          <div className="flex-shrink-0 px-4 py-3 border-b border-[#f1f1ee] flex flex-col gap-2">
            <div className="flex items-center gap-3 rounded-lg border border-[#e9eae6] p-3 hover:bg-[#f8f8f7] cursor-pointer">
              <div className="w-9 h-9 rounded-md bg-[#f3f3f1] flex items-center justify-center text-[#646462]"><svg viewBox="0 0 16 16" className="w-4 h-4 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg></div>
              <div><p className="text-[13px] font-semibold text-[#1a1a1a]">Crea el tuyo</p><p className="text-[11.5px] text-[#646462]">Ve al creador de gráficos y crea un nuevo gráfico.</p></div>
            </div>
            <div className="flex items-center gap-2 h-9 rounded-lg border border-[#e9eae6] px-3 bg-white focus-within:border-[#1a1a1a]">
              <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.5"><circle cx="7" cy="7" r="4.3"/><path d="M10.2 10.2L14 14" strokeLinecap="round"/></svg>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Plantillas de gráficos de búsqueda" className="flex-1 bg-transparent outline-none text-[13px] text-[#1a1a1a] placeholder:text-[#a4a4a2]" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3">
            {groups.map(group => {
              const items = BUILDER_CATALOG.filter(i => i.group === group && (!query || i.label.toLowerCase().includes(query)));
              if (items.length === 0) return null;
              return (
                <div key={group} className="mb-4">
                  <p className="text-[12px] font-semibold text-[#1a1a1a] mb-2">{group}</p>
                  <div className="flex flex-col gap-2">
                    {items.map(item => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={e => { setDragging(true); e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('application/json', JSON.stringify({ t: 'new', itemId: item.id })); }}
                        onDragEnd={() => setDragging(false)}
                        onClick={() => addItem(item.id)}
                        title="Arrástralo al lienzo o pulsa para añadir"
                        className="flex items-stretch gap-3 rounded-[10px] border border-[#e9eae6] p-3 hover:border-[#3b59f6] hover:bg-[#f8f8f7] cursor-grab active:cursor-grabbing"
                      >
                        <div className="w-[96px] flex-shrink-0 flex flex-col items-center justify-center gap-1.5 bg-[#fbfbfa] rounded-md py-2">
                          <CatalogThumb item={item} />
                          {item.dim && <span className="text-[9.5px] leading-tight text-[#646462] text-center px-1 line-clamp-2">{item.dim}</span>}
                        </div>
                        <div className="flex-1 min-w-0 py-0.5 flex flex-col justify-center">
                          {item.isNew && <span className="self-start text-[9.5px] px-1.5 py-[1px] rounded-full bg-[#eef1ff] text-[#3b59f6] font-semibold mb-1">Nuevo</span>}
                          <p className="text-[11px] text-[#646462] leading-tight">{item.subgroup ?? group}</p>
                          <p className="text-[13px] font-semibold text-[#1a1a1a] leading-snug mt-0.5">{item.label}</p>
                          {item.qualifier && <p className="text-[10px] text-[#9a9a97] mt-1">{item.qualifier}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Tipos de gráfico del editor (barra de iconos superior). Cada tipo mapea a un
// "kind" de render soportado por BuilderCardBody.
type EditorType = { id: string; kind: BuilderKind; label: string; icon: ReactNode };
const EDITOR_TYPES: EditorType[] = [
  { id: 'number', kind: 'kpi', label: 'Número', icon: <svg viewBox="0 0 20 20" className="w-[18px] h-[18px]"><text x="10" y="14.5" textAnchor="middle" fontSize="12" fontWeight="800" className="fill-current" fontFamily="ui-sans-serif, system-ui">123</text></svg> },
  { id: 'bar', kind: 'bar', label: 'Barras verticales', icon: <svg viewBox="0 0 20 20" className="w-[18px] h-[18px]"><g className="fill-current"><rect x="3" y="11" width="3.4" height="6" rx="1"/><rect x="8.3" y="6" width="3.4" height="11" rx="1"/><rect x="13.6" y="8.5" width="3.4" height="8.5" rx="1"/></g></svg> },
  { id: 'hbar', kind: 'bar', label: 'Barras horizontales', icon: <svg viewBox="0 0 20 20" className="w-[18px] h-[18px]"><g className="fill-current"><rect x="3" y="3.2" width="13" height="3.2" rx="1"/><rect x="3" y="8.4" width="8.5" height="3.2" rx="1"/><rect x="3" y="13.6" width="11" height="3.2" rx="1"/></g></svg> },
  { id: 'pie', kind: 'doughnut', label: 'Circular', icon: <svg viewBox="0 0 20 20" className="w-[18px] h-[18px]"><circle cx="10" cy="10" r="7" className="fill-current opacity-25"/><path d="M10 10V3a7 7 0 016.06 3.5z" className="fill-current"/><circle cx="10" cy="10" r="2.6" className="fill-white"/></svg> },
  { id: 'line', kind: 'line', label: 'Línea', icon: <svg viewBox="0 0 20 20" className="w-[18px] h-[18px] fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 14l4-4.5 3.5 2L17 5"/><circle cx="3" cy="14" r="1.3" className="fill-current stroke-none"/><circle cx="17" cy="5" r="1.3" className="fill-current stroke-none"/></svg> },
  { id: 'area', kind: 'bar', label: 'Combo (barras + línea)', icon: <svg viewBox="0 0 20 20" className="w-[18px] h-[18px]"><g className="fill-current opacity-90"><rect x="3" y="10" width="3.2" height="7" rx="1"/><rect x="8.4" y="7.5" width="3.2" height="9.5" rx="1"/><rect x="13.8" y="12" width="3.2" height="5" rx="1"/></g><path d="M3.5 9l5-3 5.5 3.5L17 4" className="fill-none stroke-current" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { id: 'column', kind: 'bar', label: 'Columnas', icon: <svg viewBox="0 0 20 20" className="w-[18px] h-[18px]"><g className="fill-current"><rect x="3" y="12.5" width="3.4" height="4.5" rx="1"/><rect x="8.3" y="8" width="3.4" height="9" rx="1"/><rect x="13.6" y="3.5" width="3.4" height="13.5" rx="1"/></g></svg> },
  { id: 'matrix', kind: 'heatmap', label: 'Matriz (día × hora)', icon: <svg viewBox="0 0 20 20" className="w-[18px] h-[18px]"><g className="fill-current"><rect x="3" y="3" width="5.5" height="5.5" rx="1.4"/><rect x="11.5" y="3" width="5.5" height="5.5" rx="1.4" className="opacity-40"/><rect x="3" y="11.5" width="5.5" height="5.5" rx="1.4" className="opacity-40"/><rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1.4"/></g></svg> },
  { id: 'table', kind: 'table', label: 'Tabla', icon: <svg viewBox="0 0 20 20" className="w-[18px] h-[18px] fill-none stroke-current" strokeWidth="1.6"><rect x="3" y="3.5" width="14" height="13" rx="2"/><path d="M3 8h14M3 12h14M8 3.5v13"/></svg> },
];
const GRAN_EN: Record<string, string> = { hora: 'hour', dia: 'day', semana: 'week', mes: 'month' };

// Editor de gráfico a pantalla completa — cambia tipo, título, métricas y ejes.
function ChartEditor({ item, initialKind, initialTitle, initialVariant, onCancel, onUpdate }: {
  item: CatalogItem; initialKind: BuilderKind; initialTitle: string; initialVariant?: string;
  onCancel: () => void; onUpdate: (kind: BuilderKind, title: string, variant?: string) => void;
}) {
  const [typeId, setTypeId] = useState<string>(() => {
    if (initialVariant === 'hbar') return 'hbar';
    if (initialVariant === 'matrix') return 'matrix';
    if (initialVariant === 'combo') return 'area';
    return (EDITOR_TYPES.find(t => t.kind === initialKind) ?? EDITOR_TYPES[4]).id;
  });
  const [title, setTitle] = useState(initialTitle);
  const [tab, setTab] = useState<'grafico' | 'opciones'>('grafico');
  const [compare, setCompare] = useState(false);
  const [gran, setGran] = useState<'hora' | 'dia' | 'semana' | 'mes'>('dia');
  const [metricsOpen, setMetricsOpen] = useState(true);
  const [metrics, setMetrics] = useState<string[]>([item.label]);

  const type = EDITOR_TYPES.find(t => t.id === typeId) ?? EDITOR_TYPES[4];
  const kind = type.kind;
  const isNumber = typeId === 'number';
  const isMatrix = typeId === 'matrix';
  const isTable = typeId === 'table';
  const grouping = isTable ? 'Rango' : 'Promedio';

  // Sufijo de dimensión del título del preview, según el tipo.
  const dimSuffix = isNumber ? '' : isMatrix ? 'por día de la semana y hora del día' : isTable ? 'by Intervalos de tiempo' : `by ${GRAN_EN[gran]}`;
  const previewTitle = `${title || item.label}${metrics.length > 1 ? ` + ${metrics.length - 1} métrica` : ''}${dimSuffix ? ` ${dimSuffix}` : ''}`;
  // Variante de render: barra horizontal, combo barra+línea (≥2 métricas),
  // matriz 7×24 o área. El número/circular/tabla usan su kind base.
  const editorVariant =
    typeId === 'hbar' ? 'hbar'
    : typeId === 'matrix' ? 'matrix'
    : typeId === 'area' || (metrics.length >= 2 && (typeId === 'bar' || typeId === 'column' || typeId === 'line')) ? 'combo'
    : typeId === 'line' ? 'line'
    : undefined;

  return (
    <div className="flex flex-1 min-h-0 gap-2">
      <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-3 border-b border-[#e9eae6] flex items-center gap-3">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a] flex-shrink-0" strokeWidth="1.5"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/></svg>
          <div className="min-w-0 flex-1">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título del gráfico" className="w-full text-[18px] font-bold text-[#1a1a1a] outline-none placeholder:text-[#c9c9c6] truncate" />
            <p className="text-[12.5px] text-[#646462]">Ingresa una descripción</p>
          </div>
          <button onClick={onCancel} className="text-[13px] font-medium text-[#1a1a1a] rounded-full px-3 py-[6px] hover:bg-[#f3f3f1]">Cancelar</button>
          <button onClick={() => onUpdate(kind, title, editorVariant)} className="text-[13px] font-semibold text-white bg-[#1a1a1a] rounded-full px-4 py-[6px] hover:bg-black">Actualizar gráfico</button>
        </div>
        {/* Barra de tipos */}
        <div className="flex-shrink-0 px-6 py-2 border-b border-[#e9eae6]">
          <div className="inline-flex items-center gap-0.5 border border-[#e9eae6] rounded-lg p-1">
            {EDITOR_TYPES.map(t => (
              <button key={t.id} onClick={() => setTypeId(t.id)} title={t.label}
                className={`w-8 h-8 rounded-md flex items-center justify-center ${typeId === t.id ? 'bg-[#1a1a1a] text-white' : 'text-[#646462] hover:bg-[#f3f3f1]'}`}>
                {t.icon}
              </button>
            ))}
          </div>
        </div>
        {/* Preview */}
        <div className="flex-1 overflow-y-auto min-h-0 p-6">
          <div className="relative border border-[#e9eae6] rounded-[12px] p-4 bg-white">
            <button className="absolute top-3 right-3 z-10 flex items-center gap-1 text-[12.5px] font-medium text-[#1a1a1a] border border-[#e9eae6] rounded-lg px-2.5 py-1 hover:bg-[#f5f5f4]">
              Acciones <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4z"/></svg>
            </button>
            <BuilderCardBody item={{ ...item, kind, label: previewTitle }} height={340} variant={editorVariant} />
          </div>
        </div>
      </div>
      {/* Panel de configuración */}
      <div className="w-[360px] flex-shrink-0 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
        <div className="flex-shrink-0 px-4 pt-3 border-b border-[#e9eae6] flex items-center gap-4">
          <button onClick={() => setTab('grafico')} className={`pb-2.5 text-[13px] ${tab === 'grafico' ? 'font-semibold text-[#1a1a1a] border-b-2 border-[#ff7849] -mb-px' : 'text-[#646462]'}`}>Gráfico</button>
          <button onClick={() => setTab('opciones')} className={`pb-2.5 text-[13px] ${tab === 'opciones' ? 'font-semibold text-[#1a1a1a] border-b-2 border-[#ff7849] -mb-px' : 'text-[#646462]'}`}>Opciones</button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 p-4 flex flex-col gap-4">
          {tab === 'grafico' ? (
            <>
              <div className="flex items-center gap-2 border border-[#e9eae6] rounded-lg px-3 py-2 text-[13px] text-[#1a1a1a]">
                <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5 2v3M11 2v3"/></svg>
                Jul 17, 2026 - Jul 23, 2026
              </div>
              <div className="bg-[#fef9e7] border border-[#f5e6a8] rounded-lg p-3 text-[12px] text-[#7a6a2a] flex gap-2">
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#a8862a] flex-shrink-0 mt-0.5" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
                El rango de fechas del informe anula el rango de fechas de este gráfico. Usa los filtros informe para cambiar el intervalo de fechas de este gráfico.
              </div>
              <div>
                <label className="flex items-center gap-2 text-[13px] text-[#1a1a1a]">
                  <button onClick={() => setCompare(c => !c)} className={`w-8 h-[18px] rounded-full transition-colors flex-shrink-0 ${compare ? 'bg-[#1a1a1a]' : 'bg-[#d4d4d2]'} relative`}>
                    <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${compare ? 'left-[15px]' : 'left-0.5'}`} />
                  </button>
                  Comparar con período anterior
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#9a9a97]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M6.5 6.5a1.5 1.5 0 113 .5c0 1-1.5 1-1.5 2M8 12h.01"/></svg>
                </label>
                <p className="text-[11px] text-[#9a9a97] mt-1.5 pl-10">Para usar el conjunto de comparación de tiempo pon "Ver por" a "Hora" y "Segmentar por" a "Ninguno".</p>
              </div>
              <div>
                <button onClick={() => setMetricsOpen(o => !o)} className="w-full flex items-center justify-between mb-2">
                  <span className="text-[13px] font-semibold text-[#1a1a1a]">Métricas <span className="text-[#646462] font-normal ml-1 bg-[#f3f3f1] rounded px-1.5">{metrics.length}</span></span>
                  <svg viewBox="0 0 16 16" className={`w-3.5 h-3.5 fill-[#646462] transition-transform ${metricsOpen ? '' : '-rotate-90'}`}><path d="M4 6l4 4 4-4z"/></svg>
                </button>
                {metricsOpen && (
                  <div className="flex flex-col gap-2">
                    {metrics.map((m, i) => (
                      <div key={i} className="border border-[#e9eae6] rounded-lg p-3 flex flex-col gap-2.5">
                        <p className="text-[13px] font-semibold text-[#1a1a1a] flex items-center gap-1.5">{metrics.length > 1 && <span className="text-[#9a9a97] font-normal">{i + 1}</span>}{m}</p>
                        <div className="border border-[#e9eae6] rounded-md px-2.5 py-1.5 text-[12.5px] text-[#646462] flex items-center justify-between">Tiempo para cerrar y Tiempo de Inbox del bot incluido<svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462] flex-shrink-0"><path d="M4 6l4 4 4-4z"/></svg></div>
                        <label className="flex items-center gap-2 text-[12.5px] text-[#1a1a1a]"><input type="checkbox" defaultChecked className="accent-[#3b59f6]" />Dentro del horario de atención<svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-[#9a9a97]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M6.5 6.5a1.5 1.5 0 113 .5c0 1-1.5 1-1.5 2M8 12h.01"/></svg></label>
                        <div>
                          <p className="text-[12px] font-medium text-[#1a1a1a] mb-1 flex items-center gap-1">Agrupación<svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-[#9a9a97]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M6.5 6.5a1.5 1.5 0 113 .5c0 1-1.5 1-1.5 2M8 12h.01"/></svg></p>
                          <div className={`border border-[#e9eae6] rounded-md px-2.5 py-1.5 text-[12.5px] flex items-center justify-between ${isTable ? 'text-[#a4a4a2] bg-[#f8f8f7]' : 'text-[#646462]'}`}>{grouping}<svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4z"/></svg></div>
                        </div>
                        <button className="text-[12.5px] text-[#646462] flex items-center gap-1 self-start"><svg viewBox="0 0 16 16" className="w-3 h-3 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>Añadir filtro</button>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => setMetrics(m => [...m, 'Promedio Tiempo para cerrar'])} className="text-[12.5px] text-[#646462] flex items-center gap-1 mt-2"><svg viewBox="0 0 16 16" className="w-3 h-3 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>Añadir métrica</button>
              </div>
              {/* Ver por — varía según el tipo */}
              {!isNumber && (
                <div className="border-t border-[#f1f1ee] pt-3">
                  <p className="text-[13px] font-semibold text-[#1a1a1a] mb-1.5 flex items-center gap-1">Ver por<svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-[#9a9a97]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M6.5 6.5a1.5 1.5 0 113 .5c0 1-1.5 1-1.5 2M8 12h.01"/></svg></p>
                  {isMatrix ? (
                    <div className="border border-[#e9eae6] rounded-md px-2.5 py-1.5 text-[12.5px] text-[#1a1a1a] flex items-center gap-2"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M6 2.5v11M2.5 6h11"/></svg>Día de la semana y hora del día</div>
                  ) : isTable ? (
                    <>
                      <div className="border border-[#e9eae6] rounded-md px-2.5 py-1.5 text-[12.5px] text-[#1a1a1a] flex items-center gap-2"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 1.5"/></svg>Intervalos de tiempo</div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[12px] text-[#646462]">De &lt;5m a &gt;8h</span>
                        <button className="text-[12px] font-medium text-[#1a1a1a] flex items-center gap-1 hover:underline"><svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current" strokeWidth="1.4"><path d="M11 2l3 3-8 8H3v-3z"/></svg>Editar intervalos de tiempo</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="border border-[#e9eae6] rounded-md px-2.5 py-1.5 text-[12.5px] text-[#1a1a1a] flex items-center gap-2 mb-2"><svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5 2v3M11 2v3"/></svg>Tiempo</div>
                      <div className="flex gap-1">
                        {(['hora', 'dia', 'semana', 'mes'] as const).map(g => (
                          <button key={g} onClick={() => setGran(g)} className={`px-2.5 py-1 rounded-full text-[12px] capitalize ${gran === g ? 'bg-[#f3f3f1] font-semibold text-[#1a1a1a]' : 'text-[#646462] hover:bg-[#f8f8f7]'}`}>{g === 'dia' ? 'día' : g}</button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              {/* Segmentar por */}
              {!isNumber && (
                <div>
                  <p className="text-[13px] font-semibold text-[#1a1a1a] mb-1.5 flex items-center gap-1">Segmentar por<svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-[#9a9a97]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M6.5 6.5a1.5 1.5 0 113 .5c0 1-1.5 1-1.5 2M8 12h.01"/></svg></p>
                  <div className="border border-[#e9eae6] rounded-md px-2.5 py-1.5 text-[12.5px] text-[#646462] flex items-center justify-between">Ninguno<svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4z"/></svg></div>
                  {(isTable || metrics.length > 1) && <p className="text-[11px] text-[#9a9a97] mt-1.5">Los gráficos multimétricos o con rangos no son compatibles con la segmentación de datos</p>}
                </div>
              )}
            </>
          ) : (
            <div className="text-[12.5px] text-[#646462] py-6 text-center">Opciones avanzadas del gráfico (colores, leyenda, ejes…).</div>
          )}
        </div>
      </div>
    </div>
  );
}

// Modal "Crear un nuevo informe" — elige una plantilla (o crea el tuyo) y abre el editor.
function ReportTemplatesModal({ onClose, onCreate }: { onClose: () => void; onCreate: (title: string) => void }) {
  const templates = ALL_REPORTS.filter(r => !r.legacy || r.sub);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div className="bg-white rounded-[14px] w-full max-w-[980px] h-[88vh] max-h-[900px] shadow-xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
          <h2 className="text-[18px] font-bold text-[#1a1a1a]">Crear un nuevo informe</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f3f3f1] text-[#646462]">
            <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8"/></svg>
          </button>
        </div>
        <div className="p-6 grid grid-cols-3 gap-4 overflow-y-auto flex-1 rounded-b-[14px]">
          <button onClick={() => onCreate('Informe sin título')} className="text-left border border-[#e9eae6] rounded-[12px] p-4 hover:border-[#3b59f6] hover:bg-[#f8f8f7]">
            <div className="w-9 h-9 rounded-md bg-[#f3f3f1] flex items-center justify-center text-[#646462] mb-3"><svg viewBox="0 0 16 16" className="w-4 h-4 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg></div>
            <p className="text-[14px] font-bold text-[#1a1a1a] mb-1">Crea el tuyo</p>
            <p className="text-[12.5px] text-[#646462]">Crea tu propio informe, en lugar de empezar con una plantilla.</p>
          </button>
          {templates.map(t => (
            <button key={t.t} onClick={() => onCreate(t.t)} className="text-left border border-[#e9eae6] rounded-[12px] p-4 hover:border-[#3b59f6] hover:bg-[#f8f8f7]">
              <div className="w-9 h-9 rounded-md bg-[#1a1a1a] flex items-center justify-center mb-3"><img src="/logos/clain-favicon.png" alt="Clain" className="w-5 h-5 object-contain" style={{ filter: 'brightness(0) invert(1)' }} draggable={false} /></div>
              <p className="text-[14px] font-bold text-[#1a1a1a] mb-1">{t.t}</p>
              {t.d && <p className="text-[12.5px] text-[#646462] line-clamp-3">{t.d}</p>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function readInitialReportsSubFromUrl(): ReportsSubView {
  if (typeof window === 'undefined') return 'overview';
  const s = new URLSearchParams(window.location.search).get('sub');
  const known: ReportsSubView[] = [
    'overview','aiResumen','areasNegocio','agentesPerf','aprobacionesRisk','costesRoi',
    'todos','misInformes','compartidos','favoritos','cxScore','emailDeliv',
    'temas','sugerencias','export','horarios',
    'finAgent','copilot',
    'calls','conversations','csat','effectiveness',
    'responsiveness','slas','teamInbox','teammate','tickets',
    'articles','outboundEng','administrar',
    'workflows','workflowsLeadGen','leads','monitors',
  ];
  return s && (known as string[]).includes(s) ? (s as ReportsSubView) : 'overview';
}

export function ReportsView() {
  // Default to 'temas' — first Figma-backed sidebar entry. The legacy 'overview'/'aiResumen'/etc.
  // routes are kept for URL backwards-compat but no longer have a sidebar entry (those were
  // PostHog-style additions not in the Figma 44-design set).
  const [sub, setSub] = useState<ReportsSubView>(() => readInitialReportsSubFromUrl());
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');
  const [channel, setChannel] = useState('all');
  const [builder, setBuilder] = useState<{ title: string } | null>(null);
  // The "Todos los informes" / "Tus informes" / "Compartido contigo" tabs and the
  // sidebar entries are the same category: keep them in sync via the sub route.
  const allReportsTab: 'shared' | 'mine' | 'intercom' =
    sub === 'misInformes' ? 'mine' : sub === 'compartidos' ? 'shared' : 'intercom';
  const setAllReportsTab = (t: 'shared' | 'mine' | 'intercom') =>
    setSub(t === 'mine' ? 'misInformes' : t === 'shared' ? 'compartidos' : 'todos');
  const AllReports = () => <ReportsAllReportsContent tab={allReportsTab} onTab={setAllReportsTab} onOpen={setSub} onCreate={(title) => setBuilder({ title })} />;
  function renderSub() {
    switch (sub) {
      // ── Análisis (from original Reports.tsx) ────────────────────────────
      case 'overview':         return <ReportsOverviewContent period={period} channel={channel} />;
      case 'todos':            return <AllReports />;
      case 'misInformes':      return <AllReports />;
      case 'compartidos':      return <AllReports />;
      case 'favoritos':        return <KnowledgePlaceholder title="Tus favoritos" subtitle="Marca informes como favoritos para acceder a ellos rápidamente desde aquí." />;
      case 'cxScore':          return <ReportsCxScoreContent period={period} channel={channel} />;
      case 'emailDeliv':       return <ReportsEmailDeliverabilityContent />;
      case 'aiResumen':        return <ReportsAiResumenContent period={period} channel={channel} />;
      case 'areasNegocio':     return <ReportsAreasNegocioContent period={period} channel={channel} />;
      case 'agentesPerf':      return <ReportsAgentesContent period={period} channel={channel} />;
      case 'aprobacionesRisk': return <ReportsAprobacionesContent period={period} channel={channel} />;
      case 'costesRoi':        return <ReportsCostesRoiContent period={period} channel={channel} />;
      // ── Temas & misc ────────────────────────────────────────────────────
      case 'temas':         return <ReportsTopicsContent />;
      case 'sugerencias':   return <ReportsSugerenciasContent />;
      case 'export':        return <ReportsExportContent period={period} channel={channel} />;
      case 'horarios':      return <ReportsHorariosContent />;
      // ── IA y automatización ─────────────────────────────────────────────
      case 'finAgent':      return <ReportsFinAgentContent period={period} channel={channel} />;
      case 'copilot':       return <ReportsCopilotContent period={period} channel={channel} />;
      // ── Soporte humano ──────────────────────────────────────────────────
      case 'calls':         return <ReportsCallsContent period={period} channel={channel} />;
      case 'conversations': return <ReportsConversationsContent period={period} channel={channel} />;
      case 'csat':          return <ReportsCsatContent period={period} channel={channel} />;
      case 'effectiveness': return <ReportsEffectivenessContent period={period} channel={channel} />;
      case 'responsiveness':return <ReportsResponsivenessContent period={period} channel={channel} />;
      case 'slas':          return <ReportsSlasContent period={period} channel={channel} />;
      case 'teamInbox':     return <ReportsTeamInboxContent period={period} channel={channel} />;
      case 'teammate':      return <ReportsTeammateContent period={period} channel={channel} />;
      case 'tickets':       return <ReportsTicketsContent period={period} channel={channel} />;
      // ── Proactivo ───────────────────────────────────────────────────────
      case 'articles':      return <ReportsArticlesContent period={period} channel={channel} />;
      case 'outboundEng':   return <ReportsOutboundEngagementContent period={period} channel={channel} />;
      case 'monitors':      return <ReportsMonitorsContent period={period} channel={channel} />;
      // ── Legacy "Anterior" ───────────────────────────────────────────────
      case 'workflows':        return <ReportsWorkflowsContent />;
      case 'workflowsLeadGen': return <ReportsWorkflowsLeadGenContent />;
      case 'leads':            return <ReportsLeadsContent />;
      case 'administrar':   return <KnowledgePlaceholder title="Administrar" subtitle="Configuración avanzada de informes, propietarios y permisos." />;
    }
  }
  const periodLabel = period === '7d' ? 'Últimos 7 días' : period === '90d' ? 'Últimos 90 días' : 'Últimos 30 días';
  const channelLabel = channel === 'all' ? 'Todos los canales'
    : channel === 'chat' ? 'Chat'
    : channel === 'email' ? 'Email'
    : channel === 'phone' ? 'Teléfono'
    : channel === 'whatsapp' ? 'WhatsApp'
    : channel === 'sms' ? 'SMS'
    : 'Social';
  // The report builder takes over the whole content area (Intercom-style editor).
  if (builder) {
    return (
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
        <TrialBanner />
        <ReportBuilderCanvas initialTitle={builder.title} onClose={() => setBuilder(null)} />
      </div>
    );
  }
  return (
    <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden p-2 gap-2">
      <TrialBanner />
      <div className="flex flex-1 min-h-0 gap-2">
        <ReportsSidebar sub={sub} onSelect={setSub} />
        <div className="flex-1 bg-white rounded-[12px] border border-[#e9eae6] flex flex-col min-h-0 overflow-hidden">
          {/* Global period + channel selector — every Reports*Content
              receives these as props and reruns its API call when they
              change, so the whole module stays in sync. */}
          <div className="flex-shrink-0 h-12 border-b border-[#e9eae6] flex items-center px-5 gap-2">
            <span className="text-[12px] uppercase tracking-wide text-[#646462] font-semibold">Filtros globales</span>
            <span className="w-px h-5 bg-[#e9eae6] mx-2" />
            <Dropdown
              value={period}
              onChange={(v) => setPeriod(v as '7d' | '30d' | '90d')}
              triggerClassName="h-8 px-3 rounded-[8px] border border-[#e9eae6] bg-white flex items-center gap-2 text-[13px] text-[#1a1a1a] hover:bg-[#f8f8f7]"
              renderTrigger={() => (
                <>
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><rect x="2" y="3.5" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M5 2v3M11 2v3"/></svg>
                  <span>{periodLabel}</span>
                  <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4z"/></svg>
                </>
              )}
              items={[
                { value: '7d',  label: 'Últimos 7 días' },
                { value: '30d', label: 'Últimos 30 días' },
                { value: '90d', label: 'Últimos 90 días' },
              ]}
            />
            <Dropdown
              value={channel}
              onChange={setChannel}
              triggerClassName="h-8 px-3 rounded-[8px] border border-[#e9eae6] bg-white flex items-center gap-2 text-[13px] text-[#1a1a1a] hover:bg-[#f8f8f7]"
              renderTrigger={() => (
                <>
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/></svg>
                  <span>{channelLabel}</span>
                  <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4z"/></svg>
                </>
              )}
              items={[
                { value: 'all',      label: 'Todos los canales' },
                { value: 'chat',     label: 'Chat',      divider: true },
                { value: 'email',    label: 'Email' },
                { value: 'phone',    label: 'Teléfono' },
                { value: 'whatsapp', label: 'WhatsApp' },
                { value: 'sms',      label: 'SMS' },
                { value: 'social',   label: 'Social' },
              ]}
            />
            <span className="flex-1" />
            <button
              onClick={() => { setPeriod('30d'); setChannel('all'); }}
              disabled={period === '30d' && channel === 'all'}
              className="h-8 px-3 rounded-[8px] text-[12.5px] text-[#646462] hover:bg-[#f8f8f7] disabled:opacity-50"
            >Restablecer</button>
          </div>
          {renderSub()}
        </div>
      </div>
    </div>
  );
}
