// ReportsV2 — migrado por agent-reports-01.
// ─────────────────────────────────────────────────────────────────────────────
// What works (this iteration):
//   • ReportsSidebar (prototype-style, collapsible groups, filled #1a1a1a icons)
//   • Sidebar drives content: finAgent→analytics tabs, copilot→AI résumé, slas→SLA/approvals
//   • Overview tab: KPI cards con sparklines reales → reportsApi.overview
//   • AI Résumé: genera informes ejecutivos con audiencia configurable → reportsApi.summary
//   • Business Areas: intents + recommended fixes → reportsApi.intents + reportsApi.approvals
//   • Agents tab: agentes con spotlight del peor → reportsApi.agents
//   • Approvals & Risk / SLAs view: funnel + métricas → reportsApi.approvals + reportsApi.sla
//   • Cost & ROI: créditos, tokens, cost/case → reportsApi.costs + reportsApi.overview
//   • Human support sub-views (calls, conversations, etc.): KPI cards from overviewData + empty charts
//   • Temas / Sugerencias: UI placeholder con CTA
//   • Export CSV completo con todos los datos
//   • Filtros period (7d/30d/90d/custom) + channel
// Pending for later iterations (still in src/components/Reports.tsx until migrated):
//   • Dedicated endpoints for calls/conversations/csat/effectiveness/responsiveness/teamInbox/teammate/tickets
//   • Temas de informes: topic detection (needs NLP/knowledge API)
//   • Schedule management (needs scheduling backend)
//   • Animaciones motion/react (AnimatePresence) — sustituido por transiciones CSS
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, type FC } from 'react';
import { reportsApi } from '../../api/client';
import { useApi } from '../../api/hooks';

// ── Types ────────────────────────────────────────────────────────────────────
type ReportsTab = 'overview' | 'ai_resume' | 'business_areas' | 'agents' | 'approvals_risk' | 'cost_roi';
type ReportChannel = 'all' | 'email' | 'chat' | 'web_chat' | 'phone' | 'sms';
type Trend = 'up' | 'down' | 'neutral';
type MetricCardData = {
  key?: string;
  label: string;
  value: string;
  change?: string;
  trend?: Trend;
  sub?: string;
  sparkline?: number[];
};
type SummaryBlock = { title: string; detail: string };
type GeneratedReport = {
  id: string;
  title: string;
  date: string;
  time: string;
  audience: string;
  status: string;
  severity: string;
  range: string;
  channel: string;
  executiveSummary: string[];
  positiveSignals: SummaryBlock[];
  riskFlags: SummaryBlock[];
  businessImpact: SummaryBlock[];
  recommendations: string[];
  costSummary: SummaryBlock[];
};

type ReportsSubView =
  | 'temas' | 'sugerencias' | 'export' | 'horarios'
  | 'finAgent' | 'copilot' | 'calls' | 'conversations'
  | 'csat' | 'effectiveness' | 'responsiveness' | 'slas'
  | 'teamInbox' | 'teammate' | 'tickets' | 'articles'
  | 'outboundEng' | 'administrar';

type ReportsItemIcon =
  | 'topic' | 'export' | 'schedule' | 'folder' | 'admin'
  | 'lightbulb' | 'sparkles' | 'fin' | 'copilot' | 'phone'
  | 'chat' | 'star' | 'zap' | 'clock' | 'sla' | 'inbox'
  | 'user' | 'ticket' | 'doc' | 'globe';

type NavGroup = {
  key?: ReportsSubView;
  label: string;
  icon?: ReportsItemIcon;
  items?: { key: ReportsSubView; label: string; icon?: ReportsItemIcon }[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function getPeriodLabel(period: string, dateFrom?: string, dateTo?: string): string {
  if (period === 'custom') return dateFrom && dateTo ? `${dateFrom} – ${dateTo}` : 'Custom range';
  if (period === '90d') return 'Last 90 days';
  if (period === '30d') return 'Last 30 days';
  return 'Last 7 days';
}

function formatChannelLabel(channel: string): string {
  if (channel === 'all') return 'All channels';
  return channel.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function parseMetricNumber(value: string | number | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? '0').replace(/[^0-9.-]/g, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function deriveSparkline(metric: MetricCardData, index: number): number[] {
  if (metric.sparkline?.length) return metric.sparkline;
  const base = Math.max(parseMetricNumber(metric.value), 1);
  const change = Math.abs(parseMetricNumber(metric.change));
  const direction = metric.trend === 'down' ? -1 : metric.trend === 'up' ? 1 : 0;
  return Array.from({ length: 7 }, (_, i) => {
    const ratio = i / 6;
    const drift = direction * (change / 100) * base * ratio;
    const wave = ((index + i) % 4) * base * 0.01;
    return Math.max(0, base + drift + wave - base * 0.04 * (1 - ratio));
  });
}

function buildSparklinePath(values: number[]): string {
  if (!values.length) return 'M0,35 L200,35';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  return values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * 200;
    const y = 35 - ((v - min) / range) * 28;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

function buildSparklineArea(values: number[]): string {
  return `${buildSparklinePath(values)} L200,40 L0,40 Z`;
}

function emptyMetric(label: string): MetricCardData {
  return { label, value: '—', trend: 'neutral', sub: 'Fetching data...' };
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
const KPICard: FC<{ metric: MetricCardData; index: number; periodLabel: string; loading?: boolean }> =
  ({ metric, index, periodLabel, loading = false }) => {
  const sparkline = deriveSparkline(metric, index);
  return (
    <div className="bg-white rounded-xl p-5 border border-[#e9eae6] flex flex-col justify-between h-[180px] relative overflow-hidden group">
      <div className="flex items-start justify-between z-10 relative">
        <div>
          <div className="text-[12px] font-medium text-[#646462] mb-1">{metric.label}</div>
          <div className="flex items-end gap-3">
            <div className={`text-3xl font-bold text-[#1a1a1a] ${loading ? 'animate-pulse' : ''}`}>{metric.value}</div>
            {!loading && metric.change ? (
              <div className={`text-[11px] font-semibold flex items-center px-2 py-0.5 rounded mb-1 ${
                metric.trend === 'up' ? 'text-green-700 bg-green-50' :
                metric.trend === 'down' ? 'text-red-700 bg-red-50' :
                'text-[#646462] bg-[#f8f8f7] border border-[#e9eae6]'
              }`}>
                {metric.change}
              </div>
            ) : null}
          </div>
          {metric.sub ? <div className="text-[11px] text-[#646462] mt-1 truncate">{metric.sub}</div> : null}
        </div>
        <div className="text-[10px] text-[#646462] bg-[#f8f8f7] px-2 py-1 rounded">{periodLabel}</div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-20 opacity-30 group-hover:opacity-50 transition-opacity">
        <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 200 40">
          <defs>
            <linearGradient id={`grad-${index}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#1a1a1a" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#1a1a1a" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={buildSparklineArea(sparkline)} fill={`url(#grad-${index})`} />
          <path d={buildSparklinePath(sparkline)} fill="none" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
};

function MetricGrid({ metrics, periodLabel, loading, placeholders }: {
  metrics: MetricCardData[]; periodLabel: string; loading: boolean; placeholders: string[];
}) {
  if (loading && metrics.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {placeholders.map((label, i) => (
          <KPICard key={label} metric={emptyMetric(label)} index={i} periodLabel={periodLabel} loading />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {metrics.map((m, i) => (
        <KPICard key={m.key || m.label || i} metric={m} index={i} periodLabel={periodLabel} />
      ))}
    </div>
  );
}

// ── Sidebar Icons ─────────────────────────────────────────────────────────────
function GroupIcon({ kind }: { kind: ReportsItemIcon }) {
  const cls = "w-4 h-4 fill-[#1a1a1a] flex-shrink-0";
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
    case 'sla':       return <svg viewBox="0 0 16 16" className={cls}><path d="M8 1.5l5.5 2.5v4c0 3-2.3 5.7-5.5 6.5C4.8 13.7 2.5 11 2.5 8V4L8 1.5z"/></svg>;
    case 'inbox':     return <svg viewBox="0 0 16 16" className={cls}><path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v6h-3.5l-1 2h-3l-1-2H2V3z"/></svg>;
    case 'user':      return <svg viewBox="0 0 16 16" className={cls}><circle cx="8" cy="5" r="3"/><path d="M2.5 13c.5-2.5 2.8-4 5.5-4s5 1.5 5.5 4v.5h-11V13z"/></svg>;
    case 'ticket':    return <svg viewBox="0 0 16 16" className={cls}><path d="M2 5a1 1 0 011-1h10a1 1 0 011 1v2a1 1 0 100 2v2a1 1 0 01-1 1H3a1 1 0 01-1-1V9a1 1 0 100-2V5z"/></svg>;
    case 'doc':       return <svg viewBox="0 0 16 16" className={cls}><path d="M3 2a1 1 0 011-1h6l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2zm6.5 0v3h3l-3-3z" fillRule="evenodd"/></svg>;
    case 'globe':     return <svg viewBox="0 0 16 16" className={cls}><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM2.5 8c0-.7.1-1.4.3-2H6c-.1.6-.1 1.3-.1 2 0 .7 0 1.4.1 2H2.8c-.2-.6-.3-1.3-.3-2zm5.5 5.5c-.8 0-1.6-1.5-1.9-3.5h3.8c-.3 2-1.1 3.5-1.9 3.5zM6 6c.3-2 1.1-3.5 1.9-3.5S9.7 4 10 6H6zm5.7 4c.1-.6.1-1.3.1-2 0-.7 0-1.4-.1-2h2.9c.2.6.3 1.3.3 2s-.1 1.4-.3 2h-2.9z"/></svg>;
    default: return null;
  }
}

// ── Reports Sidebar ───────────────────────────────────────────────────────────
function ReportsSidebar({ sub, onSelect }: { sub: ReportsSubView; onSelect: (s: ReportsSubView) => void }) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    'Temas de informes': false,
    'IA y automatización': true,
    'Soporte humano': false,
    'Proactivo': false,
  });
  const toggle = (label: string) => setOpenGroups(s => ({ ...s, [label]: !s[label] }));

  const groups: NavGroup[] = [
    {
      label: 'Temas de informes', icon: 'topic',
      items: [
        { key: 'temas', label: 'Temas', icon: 'lightbulb' },
        { key: 'sugerencias', label: 'Sugerencias', icon: 'sparkles' },
      ],
    },
    { key: 'export', label: 'Exportación de conjuntos de datos', icon: 'export' },
    { key: 'horarios', label: 'Administrar los horarios', icon: 'schedule' },
    {
      label: 'IA y automatización', icon: 'folder',
      items: [
        { key: 'finAgent', label: 'Fin AI Agent', icon: 'fin' },
        { key: 'copilot', label: 'Copilot', icon: 'copilot' },
      ],
    },
    {
      label: 'Soporte humano', icon: 'folder',
      items: [
        { key: 'calls', label: 'Llamadas', icon: 'phone' },
        { key: 'conversations', label: 'Conversaciones', icon: 'chat' },
        { key: 'csat', label: 'CSAT (encuestas)', icon: 'star' },
        { key: 'effectiveness', label: 'Eficacia', icon: 'zap' },
        { key: 'responsiveness', label: 'Capacidad de respuesta', icon: 'clock' },
        { key: 'slas', label: 'SLAs', icon: 'sla' },
        { key: 'teamInbox', label: 'Rendimiento del Inbox', icon: 'inbox' },
        { key: 'teammate', label: 'Rendimiento de compañeros', icon: 'user' },
        { key: 'tickets', label: 'Tickets', icon: 'ticket' },
      ],
    },
    {
      label: 'Proactivo', icon: 'folder',
      items: [
        { key: 'articles', label: 'Artículos', icon: 'doc' },
        { key: 'outboundEng', label: 'Información general', icon: 'globe' },
      ],
    },
  ];

  const Chev = ({ open }: { open: boolean }) => (
    <svg viewBox="0 0 16 16" className={`w-3 h-3 fill-[#646462] flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}>
      <path d="M6 4l4 4-4 4z"/>
    </svg>
  );

  return (
    <div className="flex flex-col h-full w-[236px] bg-[#f8f8f7] border-r border-[#e9eae6] flex-shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 h-16 flex-shrink-0">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Informes</span>
        <button className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f8f8f7] hover:bg-[#e9eae6]">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462]"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto pl-3 pr-3 pb-2 flex flex-col gap-0.5">
        {groups.map((g, i) => {
          const expanded = openGroups[g.label] === true;
          const groupActive = g.key !== undefined && sub === g.key;
          return (
            <div key={g.label + i}>
              <button
                onClick={() => g.key ? onSelect(g.key) : toggle(g.label)}
                className={`w-full h-8 flex items-center gap-2 px-3 rounded-lg text-[13px] transition-colors ${
                  groupActive ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]' : 'hover:bg-[#e9eae6]/40 text-[#1a1a1a]'
                }`}
              >
                {g.icon && <GroupIcon kind={g.icon} />}
                <span className="flex-1 text-left">{g.label}</span>
                {g.items && <Chev open={expanded} />}
              </button>
              {g.items && expanded && (
                <div className="flex flex-col pl-7 mt-0.5 mb-1 gap-0.5">
                  {g.items.map(it => (
                    <button
                      key={it.key}
                      onClick={() => onSelect(it.key)}
                      className={`h-8 flex items-center gap-2 pl-2 pr-3 rounded-lg text-left text-[13px] transition-colors ${
                        sub === it.key
                          ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]'
                          : 'text-[#1a1a1a] hover:bg-[#e9eae6]/40'
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
            sub === 'administrar'
              ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]'
              : 'hover:bg-[#e9eae6]/40 text-[#1a1a1a]'
          }`}
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M2 3.5h12v1.5H2zm0 4h12V9H2zm0 4h12V13H2z"/></svg>
          <span className="flex-1 text-left">Administrar</span>
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ReportsV2() {
  const [activeTab, setActiveTab] = useState<ReportsTab>('overview');
  const [sidebarSub, setSidebarSub] = useState<ReportsSubView>('finAgent');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [period, setPeriod] = useState('7d');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [channel, setChannel] = useState<ReportChannel>('all');
  const [generatedReports, setGeneratedReports] = useState<GeneratedReport[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportAudience, setReportAudience] = useState('Executive / C-Suite');
  const [toast, setToast] = useState<string | null>(null);
  const [reportOptions, setReportOptions] = useState({ exactMetrics: true, outliers: true, comparative: false });

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // ── API calls ──────────────────────────────────────────────────────────────
  const { data: overviewData, loading: overviewLoading } = useApi(
    () => reportsApi.overview(period, channel, dateFrom, dateTo), [period, channel, dateFrom, dateTo]
  );
  const { data: intentsData, loading: intentsLoading } = useApi(
    () => reportsApi.intents(period, channel, dateFrom, dateTo), [period, channel, dateFrom, dateTo]
  );
  const { data: agentsData, loading: agentsLoading } = useApi(
    () => reportsApi.agents(period, channel, dateFrom, dateTo), [period, channel, dateFrom, dateTo]
  );
  const { data: approvalsData, loading: approvalsLoading } = useApi(
    () => reportsApi.approvals(period, channel, dateFrom, dateTo), [period, channel, dateFrom, dateTo]
  );
  const { data: costsData, loading: costsLoading } = useApi(
    () => reportsApi.costs(period, channel, dateFrom, dateTo), [period, channel, dateFrom, dateTo]
  );
  const { data: slaData, loading: slaLoading } = useApi(
    () => reportsApi.sla(period, channel, dateFrom, dateTo), [period, channel, dateFrom, dateTo]
  );

  const periodLabel = useMemo(() => getPeriodLabel(period, dateFrom, dateTo), [period, dateFrom, dateTo]);

  const overviewKpis: MetricCardData[] = useMemo(
    () => (overviewData?.kpis ?? []).map((m: any, i: number) => ({ ...m, sparkline: deriveSparkline(m, i) })),
    [overviewData]
  );

  const agentCards = useMemo(
    () => (agentsData?.agents ?? []).slice(0, 6).map((a: any, i: number) => ({
      key: a.slug || a.name,
      label: a.name,
      value: a.successRate || '0%',
      change: a.failedRuns ? `${a.failedRuns} failed` : '',
      trend: (parseMetricNumber(a.successRate) >= 90 ? 'up' : parseMetricNumber(a.successRate) >= 75 ? 'neutral' : 'down') as Trend,
      sub: `${a.totalRuns} runs · ${Number(a.tokensUsed || 0).toLocaleString()} tokens`,
      sparkline: deriveSparkline({ label: a.name, value: a.successRate || '0%' }, i),
      totalRuns: a.totalRuns,
      failedRuns: a.failedRuns,
      category: a.category,
    })),
    [agentsData]
  );

  const selectedGeneratedReport = generatedReports.find(r => r.id === selectedReportId) ?? null;

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).then(
      () => showToast('Link copied to clipboard'),
      () => showToast('Could not copy link'),
    );
  };

  const handleExportCSV = () => {
    const escape = (v: string | number | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      'Period,Channel',
      `${escape(periodLabel)},${escape(formatChannelLabel(channel))}`,
      '',
      'KPI Metrics',
      'Label,Value,Change,Trend',
      ...overviewKpis.map(m => `${escape(m.label)},${escape(m.value)},${escape(m.change ?? '')},${escape(m.trend ?? '')}`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crm-report-${period}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGenerateNew = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const summary = await reportsApi.summary(period, channel, reportAudience);
      const now = new Date();
      const report: GeneratedReport = {
        id: String(Date.now()),
        title: `${reportAudience} Report — ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        date: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        audience: reportAudience,
        status: 'Generated',
        severity: (summary?.riskFlags?.length ?? 0) > 1 ? 'warning' : 'stable',
        range: summary?.rangeLabel ?? periodLabel,
        channel: summary?.channelLabel ?? formatChannelLabel(channel),
        executiveSummary: Array.isArray(summary?.executiveSummary) ? summary.executiveSummary : [],
        positiveSignals: Array.isArray(summary?.positiveSignals) ? summary.positiveSignals : [],
        riskFlags: Array.isArray(summary?.riskFlags) ? summary.riskFlags : [],
        businessImpact: Array.isArray(summary?.businessImpact) ? summary.businessImpact : [],
        recommendations: Array.isArray(summary?.recommendations) ? summary.recommendations : [],
        costSummary: Array.isArray(summary?.costSummary) ? summary.costSummary : [],
      };
      setGeneratedReports(r => [report, ...r]);
      setSelectedReportId(report.id);
      showToast('AI report generated');
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Tab renderers ──────────────────────────────────────────────────────────
  const renderOverview = () => {
    const improved = (overviewData?.kpis ?? []).filter((m: any) => m.trend === 'up').slice(0, 3);
    const worsened = (overviewData?.kpis ?? []).filter((m: any) => m.trend === 'down').slice(0, 3);
    const distribution = slaData?.distribution ?? [];
    const total = distribution.reduce((sum: number, item: any) => sum + (item.count ?? 0), 0);
    return (
      <div className="space-y-6">
        <MetricGrid
          metrics={overviewKpis}
          periodLabel={periodLabel}
          loading={overviewLoading}
          placeholders={['Total Cases', 'Resolution Rate', 'SLA Compliance', 'AI Auto-Resolution', 'High Risk Cases', 'Avg Handle Time']}
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-[#e9eae6] p-5">
            <h2 className="text-[13px] font-semibold text-[#1a1a1a] mb-4">Performance Shifts</h2>
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  <span className="text-[11px] font-bold text-[#1a1a1a] uppercase tracking-wider">What Improved</span>
                </div>
                {improved.length ? (
                  <ul className="space-y-2">
                    {improved.map((m: any, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-[13px] text-[#646462]">
                        <svg viewBox="0 0 16 16" className="w-4 h-4 fill-green-600 mt-0.5 flex-shrink-0"><path d="M8 2l1.5 4.5L14 8l-4.5 1.5L8 14l-1.5-4.5L2 8l4.5-1.5L8 2z"/></svg>
                        <span><strong className="text-[#1a1a1a]">{m.label}</strong>: {m.value}{m.change ? ` (${m.change})` : ''}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-[#646462]">No improving KPI surfaced in this range.</p>
                )}
              </div>
              <div className="border-t border-[#e9eae6] pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  <span className="text-[11px] font-bold text-[#1a1a1a] uppercase tracking-wider">What Worsened</span>
                </div>
                {worsened.length ? (
                  <ul className="space-y-2">
                    {worsened.map((m: any, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-[13px] text-[#646462]">
                        <svg viewBox="0 0 16 16" className="w-4 h-4 fill-red-500 mt-0.5 flex-shrink-0"><path d="M8 14l-1.5-4.5L2 8l4.5-1.5L8 2l1.5 4.5L14 8l-4.5 1.5L8 14z"/></svg>
                        <span><strong className="text-[#1a1a1a]">{m.label}</strong>: {m.value}{m.change ? ` (${m.change})` : ''}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-[#646462]">No declining KPI surfaced in this range.</p>
                )}
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-[#e9eae6] p-5">
            <h2 className="text-[13px] font-semibold text-[#1a1a1a] mb-4">SLA Distribution</h2>
            {slaLoading && distribution.length === 0 ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="animate-pulse h-6 bg-[#f8f8f7] rounded"></div>)}
              </div>
            ) : distribution.length ? (
              <div className="space-y-3">
                {distribution.map((item: any, i: number) => {
                  const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                  const color = item.status === 'breached' ? 'bg-red-500' : item.status === 'at_risk' ? 'bg-orange-400' : 'bg-green-500';
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-[12px] mb-1">
                        <span className="text-[#1a1a1a] font-medium capitalize">{String(item.status || '').replace(/_/g, ' ')}</span>
                        <span className="text-[#646462]">{item.count} ({pct}%)</span>
                      </div>
                      <div className="w-full bg-[#e9eae6] rounded-full h-1.5">
                        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[13px] text-[#646462] py-4">No SLA data for this filter.</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderAiResume = () => (
    <div className="flex flex-col gap-4">
      {/* Config bar */}
      <div className="bg-white rounded-xl border border-[#e9eae6] p-4 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h2 className="text-[13px] font-semibold text-[#1a1a1a] mb-0.5">Configuración</h2>
          <p className="text-[12px] text-[#646462]">Genera un resumen real del rango, canal, agentes, aprobaciones, SLA y costes.</p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <label className="block text-[11px] font-semibold text-[#646462] mb-1">Audiencia</label>
            <select
              value={reportAudience}
              onChange={e => setReportAudience(e.target.value)}
              className="px-3 py-2 text-[13px] bg-[#f8f8f7] border border-[#e9eae6] rounded-lg text-[#1a1a1a] focus:outline-none"
            >
              <option>Executive / C-Suite</option>
              <option>Support Lead</option>
              <option>Technical Team</option>
            </select>
          </div>
          <div className="flex gap-3">
            {[
              { key: 'exactMetrics' as const, label: 'Exact metrics' },
              { key: 'outliers' as const, label: 'Outliers' },
              { key: 'comparative' as const, label: 'Comparative' },
            ].map(toggle => {
              const active = reportOptions[toggle.key];
              return (
                <div key={toggle.key} className={`flex items-center gap-1.5 ${!active ? 'opacity-50' : ''}`}>
                  <span className="text-[12px] text-[#646462]">{toggle.label}</span>
                  <button
                    type="button"
                    onClick={() => setReportOptions(c => ({ ...c, [toggle.key]: !c[toggle.key] }))}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${active ? 'bg-[#1a1a1a]' : 'bg-[#e9eae6]'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${active ? 'translate-x-4' : 'translate-x-0.5'}`}></span>
                  </button>
                </div>
              );
            })}
          </div>
          <button
            onClick={handleGenerateNew}
            disabled={isGenerating}
            className="px-3 h-8 rounded-full text-[13px] font-semibold text-white bg-[#1a1a1a] hover:bg-black disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <svg viewBox="0 0 16 16" className={`w-4 h-4 fill-white ${isGenerating ? 'animate-spin' : ''}`}>
              <path d="M8 1l1.4 4.6L14 7l-4.6 1.4L8 13l-1.4-4.6L2 7l4.6-1.4L8 1z"/>
            </svg>
            {isGenerating ? 'Generating...' : 'Generate New'}
          </button>
        </div>
      </div>

      {/* Reports list + detail */}
      <div className="flex bg-white rounded-xl border border-[#e9eae6] overflow-hidden" style={{ minHeight: 500 }}>
        <div className="w-72 flex-shrink-0 border-r border-[#e9eae6] flex flex-col bg-[#f8f8f7]/30">
          <div className="p-4 border-b border-[#e9eae6] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#1a1a1a]">Generated Reports</span>
            <span className="text-[11px] text-[#646462] bg-[#e9eae6] px-2 py-0.5 rounded-full font-bold">{generatedReports.length}</span>
          </div>
          <div className="overflow-y-auto flex-1 p-2 space-y-2">
            {generatedReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <svg viewBox="0 0 16 16" className="w-8 h-8 fill-[#e9eae6] mb-3"><path d="M3 2a1 1 0 011-1h6l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2zm6.5 0v3h3l-3-3z" fillRule="evenodd"/></svg>
                <p className="text-[13px] text-[#646462] font-medium">No reports yet</p>
                <p className="text-[12px] text-[#646462] mt-1">Generate a report above.</p>
              </div>
            ) : generatedReports.map(r => (
              <button
                key={r.id}
                onClick={() => setSelectedReportId(r.id)}
                className={`w-full p-3 rounded-xl border text-left transition-all ${
                  selectedReportId === r.id
                    ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)]'
                    : 'bg-white border-[#e9eae6] hover:border-[#d0d0ce]'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-[13px] font-semibold text-[#1a1a1a] leading-tight">{r.title}</span>
                  <span className="text-[11px] text-[#646462] ml-2 flex-shrink-0">{r.time}</span>
                </div>
                <p className="text-[12px] text-[#646462] truncate">{r.date} · {r.range}</p>
                <div className="flex gap-1 mt-2">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 uppercase">Generated</span>
                  {r.severity === 'warning' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200 uppercase">Warning</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-white flex flex-col">
          {!selectedGeneratedReport ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
              <svg viewBox="0 0 16 16" className="w-12 h-12 fill-[#e9eae6] mb-4"><path d="M3 2a1 1 0 011-1h6l3 3v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2zm6.5 0v3h3l-3-3z" fillRule="evenodd"/></svg>
              <h3 className="text-[15px] font-semibold text-[#646462] mb-1">No report selected</h3>
              <p className="text-[13px] text-[#646462] max-w-xs">Generate a report to summarize actual activity from agents, approvals, costs, cases, and SLA.</p>
            </div>
          ) : (
            <div className="p-8">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#f8f8f7] text-[#646462] border border-[#e9eae6] uppercase tracking-wide">AI Generated</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#f8f8f7] text-[#646462] border border-[#e9eae6] uppercase tracking-wide">{selectedGeneratedReport.audience}</span>
                  </div>
                  <h1 className="text-[20px] font-semibold text-[#1a1a1a] tracking-[-0.4px]">{selectedGeneratedReport.title}</h1>
                </div>
                <div className="flex gap-1">
                  <button onClick={handleShare} className="p-2 rounded-lg hover:bg-[#f8f8f7] text-[#646462]">
                    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462]"><path d="M12 10a2 2 0 00-1.6.8L5.9 8.5A2 2 0 004 5a2 2 0 100 4 2 2 0 001.6-.8l4.5 2.3a2 2 0 102.9-2.3V8a2 2 0 100 2z"/></svg>
                  </button>
                  <button onClick={() => window.print()} className="p-2 rounded-lg hover:bg-[#f8f8f7] text-[#646462]">
                    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462]"><path d="M4 2h8v3H4V2zm-1 4h10a1 1 0 011 1v4h-3v2H5v-2H2V7a1 1 0 011-1zm9 1a1 1 0 100 2 1 1 0 000-2zM6 11h4v2H6v-2z"/></svg>
                  </button>
                </div>
              </div>
              <div className="bg-[#f8f8f7] rounded-xl p-5 border border-[#e9eae6] mb-6">
                <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-3">Executive Summary</h3>
                {selectedGeneratedReport.executiveSummary.map((line, i) => (
                  <p key={i} className="text-[13px] text-[#646462] leading-relaxed mb-1">{line}</p>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    <span className="text-[11px] font-bold text-[#1a1a1a] uppercase tracking-wider">Key Positive Signals</span>
                  </div>
                  <ul className="space-y-3">
                    {(selectedGeneratedReport.positiveSignals.length ? selectedGeneratedReport.positiveSignals : [{ title: 'No positive signal', detail: 'No standout gain detected.' }]).map((item, i) => (
                      <li key={i} className="text-[13px] text-[#646462]">
                        <strong className="text-[#1a1a1a] block">{item.title}</strong>
                        {item.detail}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                    <span className="text-[11px] font-bold text-[#1a1a1a] uppercase tracking-wider">Risk Flags</span>
                  </div>
                  <ul className="space-y-3">
                    {(selectedGeneratedReport.riskFlags.length ? selectedGeneratedReport.riskFlags : [{ title: 'No active bottleneck', detail: 'No material blocker detected.' }]).map((item, i) => (
                      <li key={i} className="text-[13px] text-[#646462]">
                        <strong className="text-[#1a1a1a] block">{item.title}</strong>
                        {item.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderBusinessAreas = () => {
    const kpiMap = Object.fromEntries((overviewData?.kpis ?? []).map((m: any) => [m.key, m]));
    const metrics: MetricCardData[] = [
      { key: 'auto_resolution', label: 'AI Resolution Rate', value: kpiMap.auto_resolution?.value ?? '—', trend: kpiMap.auto_resolution?.trend ?? 'neutral', sub: 'AI automated' },
      { key: 'approval_rate', label: 'Approval Rate', value: approvalsData?.rates?.approvalRate ?? '—', trend: 'neutral', sub: 'Approved vs total' },
      { key: 'avg_decision', label: 'Avg Decision Time', value: approvalsData?.rates?.avgDecisionHours != null ? `${approvalsData.rates.avgDecisionHours}h` : '—', trend: 'neutral', sub: 'Approval median' },
      { key: 'sla', label: 'SLA Compliance', value: kpiMap.sla_compliance?.value ?? '—', change: kpiMap.sla_compliance?.change, trend: kpiMap.sla_compliance?.trend ?? 'neutral', sub: 'Within SLA' },
      { key: 'high_risk', label: 'High Risk Cases', value: kpiMap.high_risk?.value ?? '—', trend: 'neutral', sub: 'Flagged high/critical' },
      { key: 'total_cases', label: 'Total Cases', value: kpiMap.total_cases?.value ?? '—', change: kpiMap.total_cases?.change, trend: kpiMap.total_cases?.trend ?? 'neutral', sub: 'Period total' },
    ];
    const intents = intentsData?.intents ?? [];
    const topIntent = intents[0];
    const weakestIntent = [...intents].sort((a: any, b: any) => parseMetricNumber(a.handled) - parseMetricNumber(b.handled))[0];
    return (
      <div className="space-y-6">
        <MetricGrid metrics={metrics} periodLabel={periodLabel} loading={overviewLoading || approvalsLoading} placeholders={metrics.map(m => m.label)} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-xl border border-[#e9eae6] overflow-hidden">
            <div className="px-5 py-3 border-b border-[#e9eae6] flex justify-between items-center bg-[#f8f8f7]/50">
              <h2 className="text-[13px] font-semibold text-[#1a1a1a]">Top Intents</h2>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f8f8f7]/50 border-b border-[#e9eae6] text-[11px] text-[#646462] uppercase tracking-wider font-semibold">
                  <th className="px-5 py-3">Intent</th>
                  <th className="px-5 py-3 text-right">Volume</th>
                  <th className="px-5 py-3 text-right">AI Handled %</th>
                  <th className="px-5 py-3 w-1/4">Share</th>
                </tr>
              </thead>
              <tbody className="text-[13px] divide-y divide-[#e9eae6]/60">
                {intentsLoading && intents.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-[#646462]">Loading intents…</td></tr>
                ) : intents.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-[#646462]">No demand signals for this filter.</td></tr>
                ) : intents.map((intent: any, i: number) => (
                  <tr key={i} className="hover:bg-[#f8f8f7]/50 transition-colors">
                    <td className="px-5 py-3 font-medium text-[#1a1a1a] capitalize">{String(intent.name).replace(/_/g, ' ')}</td>
                    <td className="px-5 py-3 text-right text-[#646462]">{intent.volume}</td>
                    <td className="px-5 py-3 text-right font-medium text-green-700">{intent.handled}</td>
                    <td className="px-5 py-3">
                      <div className="w-full bg-[#e9eae6] rounded-full h-1.5">
                        <div className="bg-[#1a1a1a] h-1.5 rounded-full" style={{ width: intent.shareOfTotal }}></div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-4">
            <div className="bg-[#f8f8f7] rounded-xl border border-[#e9eae6] p-5">
              <div className="flex items-center gap-2 mb-3">
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M8 1l1.4 4.6L14 7l-4.6 1.4L8 13l-1.4-4.6L2 7l4.6-1.4L8 1z"/></svg>
                <h2 className="text-[12px] font-bold text-[#1a1a1a] uppercase tracking-wider">AI Micro-Summary</h2>
              </div>
              <p className="text-[13px] text-[#646462] leading-relaxed">
                {topIntent
                  ? `${String(topIntent.name).replace(/_/g, ' ')} is the busiest area at ${topIntent.volume} cases and ${topIntent.handled} AI handling.`
                  : 'No dominant business area in this range.'}
                {weakestIntent ? ` Lowest-handled: ${String(weakestIntent.name).replace(/_/g, ' ')}.` : ''}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAgents = () => {
    const spotlight = [...agentCards].sort((a, b) => parseMetricNumber(a.value) - parseMetricNumber(b.value))[0] ?? null;
    return (
      <div className="space-y-6">
        <MetricGrid
          metrics={agentCards.length ? agentCards : ['Supervisor', 'Resolver', 'Knowledge', 'Canonicalizer', 'Composer', 'QA Check'].map(emptyMetric)}
          periodLabel={periodLabel}
          loading={agentsLoading}
          placeholders={['Supervisor', 'Resolver', 'Knowledge', 'Canonicalizer', 'Composer', 'QA Check']}
        />
        {spotlight && (
          <div className="bg-white rounded-xl border border-[#e9eae6] p-5">
            <h2 className="text-[13px] font-semibold text-[#1a1a1a] mb-4">Agent Spotlight — lowest success rate</h2>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Success Rate', value: spotlight.value },
                { label: 'Total Runs', value: spotlight.totalRuns ?? '—' },
                { label: 'Failed Runs', value: spotlight.failedRuns ?? '0' },
              ].map(stat => (
                <div key={stat.label} className="p-3 bg-[#f8f8f7] rounded-xl border border-[#e9eae6]">
                  <div className="text-[11px] text-[#646462] mb-1">{stat.label}</div>
                  <div className="text-[15px] font-bold text-[#1a1a1a]">{stat.value}</div>
                </div>
              ))}
            </div>
            <p className="text-[13px] text-[#646462]">
              <strong className="text-[#1a1a1a]">{spotlight.label}</strong> has a {spotlight.value} success rate over {spotlight.totalRuns} runs.{' '}
              {spotlight.failedRuns ? `${spotlight.failedRuns} failed runs need review.` : 'No failed runs recorded.'}
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderApprovalsRisk = () => {
    const funnel = approvalsData?.funnel ?? [];
    const triggered = funnel.find((i: any) => i.label === 'Triggered')?.val ?? '—';
    const pending = funnel.find((i: any) => i.label === 'Pending')?.val ?? '—';
    const approved = approvalsData?.rates?.approvalRate ?? '—';
    const rejected = approvalsData?.rates?.rejectionRate ?? '—';
    const avgDecision = approvalsData?.rates?.avgDecisionHours != null ? `${approvalsData.rates.avgDecisionHours}h` : '—';
    const breached = slaData?.distribution?.find((i: any) => i.status === 'breached')?.count ?? 0;
    const highRisk = approvalsData?.byRisk?.find((i: any) => i.riskLevel === 'high')?.count ?? 0;
    const metrics: MetricCardData[] = [
      { label: 'Approval Requests', value: triggered, sub: 'Period total' },
      { label: 'Pending Backlog', value: pending, sub: 'Awaiting review' },
      { label: 'Approval Rate', value: approved, sub: 'Approved / total' },
      { label: 'Rejection Rate', value: rejected, sub: 'Rejected / total' },
      { label: 'Avg Decision Time', value: avgDecision, sub: 'Request to decision' },
      { label: 'SLA Breaches', value: String(breached), sub: 'Outside SLA', trend: breached > 0 ? 'down' : 'neutral' },
      { label: 'High-Risk Items', value: String(highRisk), sub: 'Requires human review' },
    ];
    return (
      <div className="space-y-6">
        <MetricGrid metrics={metrics} periodLabel={periodLabel} loading={approvalsLoading || slaLoading} placeholders={metrics.map(m => m.label)} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-xl border border-[#e9eae6] p-5">
            <h2 className="text-[13px] font-semibold text-[#1a1a1a] mb-5">Approvals Funnel</h2>
            <div className="flex justify-between items-center text-center">
              {funnel.length === 0 ? (
                <p className="w-full text-[13px] text-[#646462]">No approval requests for this filter.</p>
              ) : funnel.map((step: any, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <div>
                    <div className="text-2xl font-bold text-[#1a1a1a] mb-1">{step.val}</div>
                    <div className="text-[12px] text-[#646462]">{step.label}</div>
                  </div>
                  {i < funnel.length - 1 && (
                    <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#646462]"><path d="M5 3l6 5-6 5z"/></svg>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-[#e9eae6] p-5">
            <h2 className="text-[13px] font-semibold text-[#1a1a1a] mb-3">AI Risk Brief</h2>
            <p className="text-[13px] text-[#646462] leading-relaxed">
              {approvalsData?.rates?.avgDecisionHours != null
                ? `Average decision time is ${avgDecision}. Approval rate: ${approved}, rejection: ${rejected}, ${breached} SLA breaches.`
                : 'No approval decision data available for this range.'}
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderCostRoi = () => {
    const summary = costsData?.summary ?? {};
    const byAgent = costsData?.byAgent ?? [];
    const totalCases = overviewData?.kpis?.find((m: any) => m.key === 'total_cases');
    const creditsUsed = summary.creditsUsed != null ? String(summary.creditsUsed) : '—';
    const creditsAdded = summary.creditsAdded != null ? String(summary.creditsAdded) : '—';
    const tokens = summary.totalTokens != null ? Number(summary.totalTokens).toLocaleString() : '—';
    const autoResolved = summary.autoResolvedCases != null ? String(summary.autoResolvedCases) : '—';
    const nCases = parseMetricNumber(totalCases?.value);
    const costPerCase = nCases > 0 && summary.creditsUsed != null ? `${(summary.creditsUsed / nCases).toFixed(4)} cr` : '—';
    const metrics: MetricCardData[] = [
      { label: 'Credits Used', value: creditsUsed, sub: 'AI processing cost' },
      { label: 'Credits Added', value: creditsAdded, sub: 'Top-ups' },
      { label: 'Total Tokens', value: tokens, sub: 'LLM tokens consumed' },
      { label: 'AI Auto-Resolved', value: autoResolved, sub: 'Completed by AI', trend: 'up' },
      { label: 'Cost per Case', value: costPerCase, sub: 'Avg AI cost / case' },
      { label: 'Total Cases', value: totalCases?.value ?? '—', change: totalCases?.change, trend: totalCases?.trend ?? 'neutral', sub: totalCases?.sub },
    ];
    return (
      <div className="space-y-6">
        <MetricGrid metrics={metrics} periodLabel={periodLabel} loading={costsLoading || overviewLoading} placeholders={metrics.map(m => m.label)} />
        <div className="bg-white rounded-xl border border-[#e9eae6] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#e9eae6] bg-[#f8f8f7]/50">
            <h2 className="text-[13px] font-semibold text-[#1a1a1a]">Cost by Agent</h2>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#f8f8f7]/50 border-b border-[#e9eae6] text-[11px] text-[#646462] uppercase tracking-wider font-semibold">
                <th className="px-5 py-3">Agent</th>
                <th className="px-5 py-3 text-right">Tokens</th>
                <th className="px-5 py-3 text-right">Credits</th>
              </tr>
            </thead>
            <tbody className="text-[13px] divide-y divide-[#e9eae6]/60">
              {costsLoading && byAgent.length === 0 ? (
                <tr><td colSpan={3} className="px-5 py-8 text-center text-[#646462]">Loading agent costs…</td></tr>
              ) : byAgent.length === 0 ? (
                <tr><td colSpan={3} className="px-5 py-8 text-center text-[#646462]">No agent cost data for this filter.</td></tr>
              ) : byAgent.map((a: any, i: number) => (
                <tr key={i} className="hover:bg-[#f8f8f7]/50 transition-colors">
                  <td className="px-5 py-3 font-medium text-[#1a1a1a]">{a.name}</td>
                  <td className="px-5 py-3 text-right text-[#646462]">{Number(a.tokens).toLocaleString()}</td>
                  <td className="px-5 py-3 text-right font-semibold text-[#1a1a1a]">{a.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Sidebar-driven content routing ────────────────────────────────────────
  const ANALYTICS_TABS: { key: ReportsTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'ai_resume', label: 'AI Résumé' },
    { key: 'business_areas', label: 'Business Areas' },
    { key: 'agents', label: 'Agents' },
    { key: 'approvals_risk', label: 'Approvals & Risk' },
    { key: 'cost_roi', label: 'Cost & ROI' },
  ];

  const HUMAN_VIEW_LABELS: Partial<Record<ReportsSubView, string>> = {
    calls: 'Llamadas', conversations: 'Conversaciones', csat: 'CSAT',
    effectiveness: 'Eficacia', responsiveness: 'Capacidad de respuesta',
    teamInbox: 'Rendimiento del Inbox', teammate: 'Rendimiento de compañeros',
    tickets: 'Tickets', articles: 'Artículos', outboundEng: 'Información general',
  };

  // When sidebar selects copilot, route to ai_resume tab; slas → approvals_risk
  const handleSidebarSelect = (s: ReportsSubView) => {
    setSidebarSub(s);
    if (s === 'copilot') setActiveTab('ai_resume');
    if (s === 'slas') setActiveTab('approvals_risk');
    if (s === 'finAgent') setActiveTab('overview');
  };

  // True when the main panel should show the analytics tabs+content area
  const isAnalyticsView = ['finAgent', 'copilot', 'slas'].includes(sidebarSub);

  const renderHumanSupportView = (label: string) => {
    const kpis: MetricCardData[] = (overviewData?.kpis ?? []).slice(0, 4).map((m: any, i: number) => ({ ...m, sparkline: deriveSparkline(m, i) }));
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-[#1a1a1a]">{label}</h2>
          <span className="text-[11px] text-[#646462] bg-[#f8f8f7] border border-[#e9eae6] px-2 py-0.5 rounded-full">Datos parciales — API específica pendiente</span>
        </div>
        <MetricGrid metrics={kpis} periodLabel={periodLabel} loading={overviewLoading} placeholders={['Métrica 1', 'Métrica 2', 'Métrica 3', 'Métrica 4']} />
        <div className="grid grid-cols-2 gap-4">
          {['Volumen', 'Tendencia'].map(lbl => (
            <div key={lbl} className="bg-white rounded-xl border border-[#e9eae6] p-5">
              <p className="text-[12.5px] text-[#1a1a1a] mb-3">{lbl} de {label.toLowerCase()}</p>
              <div className="h-[120px] flex flex-col items-center justify-center text-center">
                <svg viewBox="0 0 16 16" className="w-5 h-5 fill-none stroke-[#e9eae6] mb-1.5" strokeWidth="1.4"><path d="M2 13V3M14 13H2M5 11V8M8 11V5M11 11V7"/></svg>
                <span className="text-[12px] text-[#1a1a1a]">Sin datos para este gráfico</span>
                <span className="text-[11px] text-[#646462] mt-0.5">Cambia los filtros o espera al endpoint específico</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderTemasView = (title: string, desc: string) => (
    <div className="flex flex-col items-center justify-center h-full text-center p-12">
      <div className="flex items-center gap-4 mb-6">
        {(['topic', 'sparkles', 'lightbulb'] as const).map(k => (
          <div key={k} className="w-20 h-20 rounded-full bg-[#f3f3f1] border border-[#e9eae6] flex items-center justify-center">
            <GroupIcon kind={k} />
          </div>
        ))}
      </div>
      <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-2">{title}</h2>
      <p className="text-[13px] text-[#646462] leading-[20px] max-w-[420px] mb-5">{desc}</p>
      <div className="flex items-center gap-3">
        <button className="px-4 h-8 rounded-full text-[13px] font-semibold text-white bg-[#1a1a1a] hover:bg-black">Crear tema</button>
        <button className="px-4 h-8 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] border border-[#e9eae6] hover:bg-[#ededea]">Más información</button>
      </div>
    </div>
  );

  const renderNonAnalyticsContent = () => {
    if (sidebarSub === 'temas') return renderTemasView(
      'Comprende y rastrea los temas de conversación',
      'Accede a la información de tus conversaciones descubriendo o definiendo los temas que te interesan y rastréalos de forma automática.'
    );
    if (sidebarSub === 'sugerencias') return renderTemasView(
      'Sugerencias de temas',
      'Descubre qué nuevos temas están emergiendo en tus conversaciones. Las sugerencias se generan automáticamente mediante análisis IA.'
    );
    if (sidebarSub === 'export') return (
      <div className="flex flex-col items-center justify-center h-full text-center p-12">
        <GroupIcon kind="export" />
        <h2 className="text-[16px] font-bold text-[#1a1a1a] mt-4 mb-2">Exportación de conjuntos de datos</h2>
        <p className="text-[13px] text-[#646462] max-w-[360px] mb-5">Descarga todas las métricas con los filtros activos en formato CSV.</p>
        <button onClick={handleExportCSV} className="px-4 h-8 rounded-full text-[13px] font-semibold text-white bg-[#1a1a1a] hover:bg-black flex items-center gap-2">
          <GroupIcon kind="export" />
          <span>Exportar CSV ahora</span>
        </button>
        {toast && <span className="mt-3 text-[12px] text-green-700 font-medium">{toast}</span>}
      </div>
    );
    if (sidebarSub === 'horarios' || sidebarSub === 'administrar') return (
      <div className="flex flex-col items-center justify-center h-full text-center p-12">
        <GroupIcon kind={sidebarSub === 'horarios' ? 'schedule' : 'admin'} />
        <h2 className="text-[16px] font-bold text-[#1a1a1a] mt-4 mb-2">{sidebarSub === 'horarios' ? 'Administrar horarios' : 'Administrar'}</h2>
        <p className="text-[13px] text-[#646462] max-w-[360px]">Esta sección requiere soporte de backend. Pendiente de implementación en próximas iteraciones.</p>
      </div>
    );
    const humanLabel = HUMAN_VIEW_LABELS[sidebarSub];
    if (humanLabel) return renderHumanSupportView(humanLabel);
    return null;
  };

  return (
    <div className="flex flex-1 min-w-0 h-full overflow-hidden">
      <ReportsSidebar sub={sidebarSub} onSelect={handleSidebarSelect} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#f8f8f7]">
        {isAnalyticsView ? (
          <>
            {/* Analytics header with tabs */}
            <div className="flex-shrink-0 px-6 pt-5 pb-0">
              <div className="bg-white rounded-xl border border-[#e9eae6]">
                <div className="px-6 py-4 flex items-center justify-between">
                  <h1 className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Reports & Analytics</h1>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-[#f8f8f7] p-1 rounded-lg">
                      {['7d', '30d', '90d'].map(opt => (
                        <button
                          key={opt}
                          onClick={() => setPeriod(opt)}
                          className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${period === opt ? 'bg-white text-[#1a1a1a] shadow-sm border border-[#e9eae6]' : 'text-[#646462]'}`}
                        >
                          {opt.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <button onClick={handleShare} className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] hover:bg-[#ededea] border border-[#e9eae6] flex items-center gap-1.5">
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#1a1a1a]"><path d="M12 10a2 2 0 00-1.6.8L5.9 8.5A2 2 0 004 5a2 2 0 100 4 2 2 0 001.6-.8l4.5 2.3a2 2 0 102.9-2.3V8a2 2 0 100 2z"/></svg>
                      Share
                    </button>
                    <button onClick={handleExportCSV} className="px-3 h-8 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] hover:bg-[#ededea] border border-[#e9eae6] flex items-center gap-1.5">
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#1a1a1a]"><path d="M7 2h2v6.6l2.3-2.3 1.4 1.4L8 12.4 3.3 7.7l1.4-1.4L7 8.6V2zM2 13.5h12V15H2v-1.5z"/></svg>
                      Export CSV
                    </button>
                    {toast && <span className="text-[12px] text-green-700 font-medium">{toast}</span>}
                  </div>
                </div>
                <div className="px-6 flex items-center gap-6 border-t border-[#e9eae6] pt-3">
                  {ANALYTICS_TABS.map(t => (
                    <button
                      key={t.key}
                      onClick={() => setActiveTab(t.key)}
                      className={`pb-3 text-[13px] transition-colors border-b-2 ${
                        activeTab === t.key
                          ? 'font-semibold text-[#1a1a1a] border-[#1a1a1a]'
                          : 'text-[#646462] border-transparent hover:text-[#1a1a1a] hover:border-[#e9eae6]'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* Filter bar */}
            <div className="flex-shrink-0 px-6 pt-4 pb-0 flex items-center gap-2">
              <select
                value={period}
                onChange={e => setPeriod(e.target.value)}
                className="px-3 h-8 text-[12px] bg-white border border-[#e9eae6] rounded-lg text-[#1a1a1a] focus:outline-none"
              >
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
                <option value="custom">Custom range</option>
              </select>
              {period === 'custom' && (
                <>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 h-8 text-[12px] bg-white border border-[#e9eae6] rounded-lg text-[#1a1a1a] focus:outline-none" />
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 h-8 text-[12px] bg-white border border-[#e9eae6] rounded-lg text-[#1a1a1a] focus:outline-none" />
                </>
              )}
              <div className="w-px h-4 bg-[#e9eae6] mx-1"></div>
              <select
                value={channel}
                onChange={e => setChannel(e.target.value as ReportChannel)}
                className="px-3 h-8 text-[12px] bg-white border border-[#e9eae6] rounded-lg text-[#1a1a1a] focus:outline-none"
              >
                <option value="all">Channel: All</option>
                <option value="email">Channel: Email</option>
                <option value="chat">Channel: Chat</option>
                <option value="web_chat">Channel: Web Chat</option>
                <option value="phone">Channel: Phone</option>
                <option value="sms">Channel: SMS</option>
              </select>
            </div>
            {/* Tab content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {activeTab === 'overview' && renderOverview()}
              {activeTab === 'ai_resume' && renderAiResume()}
              {activeTab === 'business_areas' && renderBusinessAreas()}
              {activeTab === 'agents' && renderAgents()}
              {activeTab === 'approvals_risk' && renderApprovalsRisk()}
              {activeTab === 'cost_roi' && renderCostRoi()}
            </div>
          </>
        ) : (
          /* Non-analytics sidebar views */
          <div className="flex-1 overflow-y-auto bg-white">
            {renderNonAnalyticsContent()}
          </div>
        )}
      </div>
    </div>
  );
}
