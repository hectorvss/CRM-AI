import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApi } from '../api/hooks';
import { reportsApi } from '../api/client';
import StyledSelect from './StyledSelect';

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

const REPORT_TABS: ReportsTab[] = ['overview', 'ai_resume', 'business_areas', 'agents', 'approvals_risk', 'cost_roi'];
const AGENT_ICON_MAP: Record<string, string> = {
  orchestration: 'supervisor_account',
  ingest: 'merge_type',
  intelligence: 'psychology',
  resolution: 'build',
  communication: 'edit_document',
  observability: 'visibility',
  connectors: 'cable',
};

function getPeriodLabel(period: string, dateFrom?: string, dateTo?: string): string {
  if (period === 'custom') {
    if (dateFrom && dateTo) return `${dateFrom} – ${dateTo}`;
    return 'Custom range';
  }
  if (period === '90d') return 'Last 90 days';
  if (period === '30d') return 'Last 30 days';
  return 'Last 7 days';
}

function formatChannelLabel(channel: string): string {
  if (channel === 'all') return 'All channels';
  return channel.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
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
  return Array.from({ length: 7 }, (_, pointIndex) => {
    const ratio = pointIndex / 6;
    const drift = direction * (change / 100) * base * ratio;
    const wave = ((index + pointIndex) % 4) * base * 0.01;
    return Math.max(0, base + drift + wave - base * 0.04 * (1 - ratio));
  });
}

function buildSparklinePath(values: number[]): string {
  if (!values.length) return 'M0,35 L200,35';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1 || 1)) * 200;
      const y = 35 - ((value - min) / range) * 28;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function buildSparklineArea(values: number[]): string {
  return `${buildSparklinePath(values)} L200,40 L0,40 Z`;
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function emptyMetric(label: string, sub = 'Fetching report data...'): MetricCardData {
  return { label, value: '—', trend: 'neutral', sub };
}

const KPICard: React.FC<{ metric: MetricCardData; index: number; periodLabel: string; loading?: boolean }> = ({ metric, index, periodLabel, loading = false }) => {
  const sparkline = deriveSparkline(metric, index);
  return (
    <div className="bg-white dark:bg-card-dark rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-card flex flex-col justify-between h-[180px] relative overflow-hidden group">
      <div className="flex items-start justify-between z-10 relative">
        <div>
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{metric.label}</div>
          <div className="flex items-end gap-3">
            <div className={`text-3xl font-bold text-gray-900 dark:text-white ${loading ? 'animate-pulse' : ''}`}>{metric.value}</div>
            {!loading && metric.change ? (
              <div
                className={`text-sm font-medium flex items-center px-2 py-0.5 rounded mb-1 ${
                  metric.trend === 'up'
                    ? 'text-green-600 bg-green-50 dark:bg-green-900/20'
                    : metric.trend === 'down'
                      ? 'text-red-600 bg-red-50 dark:bg-red-900/20'
                      : 'text-gray-500 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600'
                }`}
              >
                {metric.trend === 'up' && <span className="material-symbols-outlined text-[14px] mr-1">trending_up</span>}
                {metric.trend === 'down' && <span className="material-symbols-outlined text-[14px] mr-1">trending_down</span>}
                {metric.change}
              </div>
            ) : null}
          </div>
          {metric.sub ? <div className="text-xs text-gray-400 mt-1 truncate">{metric.sub}</div> : null}
        </div>
        <div className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded">{periodLabel}</div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-20 opacity-30 group-hover:opacity-50 transition-opacity">
        <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 200 40">
          <path d={buildSparklineArea(sparkline)} fill="url(#purple-grad)" />
          <path d={buildSparklinePath(sparkline)} fill="none" stroke="#6e62e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
};

function renderMetricGrid(metrics: MetricCardData[], periodLabel: string, loading: boolean, placeholderLabels: string[]) {
  if (loading && metrics.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {placeholderLabels.map((label, index) => (
          <KPICard key={`placeholder-${label}-${index}`} metric={emptyMetric(label)} index={index} periodLabel={periodLabel} loading />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {metrics.map((metric, index) => (
        <KPICard key={metric.key || metric.label || index} metric={metric} index={index} periodLabel={periodLabel} />
      ))}
    </div>
  );
}

export default function Reports() {
  const [activeTab, setActiveTab] = useState<ReportsTab>('overview');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [period, setPeriod] = useState('7d');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [channel, setChannel] = useState<ReportChannel>('all');
  const [generatedReports, setGeneratedReports] = useState<GeneratedReport[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportAudience, setReportAudience] = useState('Executive / C-Suite');
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [reportOptions, setReportOptions] = useState({
    exactMetrics: true,
    outliers: true,
    comparative: false,
  });

  const showToast = (msg: string) => {
    setShareToast(msg);
    setTimeout(() => setShareToast(null), 3000);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).then(
      () => showToast('Link copied to clipboard'),
      () => showToast('Could not copy link'),
    );
  };

  const handleExportPDF = () => {
    window.print();
  };

  const handleExportCSV = () => {
    const currentPeriodLabel = getPeriodLabel(period, dateFrom, dateTo);
    const escape = (v: string | number | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const lines: string[] = [];

    // Header block
    lines.push('Period,Channel');
    lines.push(`${escape(currentPeriodLabel)},${escape(formatChannelLabel(channel))}`);
    lines.push('');

    // KPI Metrics
    lines.push('KPI Metrics');
    lines.push('Label,Value,Change,Trend');
    for (const metric of overviewKpis) {
      lines.push(`${escape(metric.label)},${escape(metric.value)},${escape(metric.change ?? '')},${escape(metric.trend ?? '')}`);
    }
    lines.push('');

    // Agent Performance
    lines.push('Agent Performance');
    lines.push('Name,Success Rate,Failed Runs,Total Runs');
    for (const agent of agentCards) {
      lines.push(`${escape(agent.label)},${escape(agent.value)},${escape(agent.change ?? '')},${escape(agent.totalRuns ?? '')}`);
    }
    lines.push('');

    // SLA Distribution
    const distribution = slaData?.distribution ?? [];
    if (distribution.length) {
      lines.push('SLA Distribution');
      lines.push('Status,Count');
      for (const item of distribution) {
        lines.push(`${escape(String(item.status).replace(/_/g, ' '))},${escape(item.count)}`);
      }
      lines.push('');
    }

    // Cost Summary
    const costSummary = costsData?.summary ?? {};
    lines.push('Cost Summary');
    lines.push('Metric,Value');
    lines.push(`Credits Used,${escape(costSummary.creditsUsed ?? '—')}`);
    lines.push(`Credits Added,${escape(costSummary.creditsAdded ?? '—')}`);
    lines.push(`Total Tokens,${escape(costSummary.totalTokens != null ? Number(costSummary.totalTokens).toLocaleString() : '—')}`);
    lines.push(`AI Auto-Resolved Cases,${escape(costSummary.autoResolvedCases ?? '—')}`);

    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crm-report-${period}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const { data: overviewData, loading: overviewLoading } = useApi(() => reportsApi.overview(period, channel, dateFrom, dateTo), [period, channel, dateFrom, dateTo]);
  const { data: intentsData, loading: intentsLoading } = useApi(() => reportsApi.intents(period, channel, dateFrom, dateTo), [period, channel, dateFrom, dateTo]);
  const { data: agentsData, loading: agentsLoading } = useApi(() => reportsApi.agents(period, channel, dateFrom, dateTo), [period, channel, dateFrom, dateTo]);
  const { data: approvalsData, loading: approvalsLoading } = useApi(() => reportsApi.approvals(period, channel, dateFrom, dateTo), [period, channel, dateFrom, dateTo]);
  const { data: costsData, loading: costsLoading } = useApi(() => reportsApi.costs(period, channel, dateFrom, dateTo), [period, channel, dateFrom, dateTo]);
  const { data: slaData, loading: slaLoading } = useApi(() => reportsApi.sla(period, channel, dateFrom, dateTo), [period, channel, dateFrom, dateTo]);

  const periodLabel = useMemo(() => getPeriodLabel(period, dateFrom, dateTo), [period, dateFrom, dateTo]);
  const overviewKpis: MetricCardData[] = useMemo(
    () => (overviewData?.kpis ?? []).map((metric: any, index: number) => ({ ...metric, sparkline: deriveSparkline(metric, index) })),
    [overviewData],
  );

  const agentCards = useMemo(
    () => (agentsData?.agents ?? []).slice(0, 6).map((agent: any, index: number) => ({
      key: agent.slug || agent.name,
      label: agent.name,
      value: agent.successRate || '0%',
      change: agent.failedRuns ? `${agent.failedRuns} failed` : '',
      trend: parseMetricNumber(agent.successRate) >= 90 ? 'up' : parseMetricNumber(agent.successRate) >= 75 ? 'neutral' : 'down',
      sub: `${agent.totalRuns} runs · ${Number(agent.tokensUsed || 0).toLocaleString()} tokens`,
      sparkline: deriveSparkline({ label: agent.name, value: agent.successRate || '0%' }, index),
      icon: AGENT_ICON_MAP[agent.category] || 'smart_toy',
      category: agent.category,
      totalRuns: agent.totalRuns,
      failedRuns: agent.failedRuns,
    })),
    [agentsData],
  ) as any[];

  const selectedGeneratedReport = generatedReports.find((report) => report.id === selectedReportId) ?? null;

  const handleGenerateNew = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const summary = await reportsApi.summary(period, channel, reportAudience);
      const now = new Date();
      const newReport: GeneratedReport = {
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
      setGeneratedReports((current) => [newReport, ...current]);
      setSelectedReportId(newReport.id);
      showToast('AI report generated');
    } finally {
      setIsGenerating(false);
    }
  };

  const renderOverview = () => {
    const improved = (overviewData?.kpis ?? []).filter((metric: any) => metric.trend === 'up').slice(0, 3);
    const worsened = (overviewData?.kpis ?? []).filter((metric: any) => metric.trend === 'down').slice(0, 3);
    const distribution = slaData?.distribution ?? [];
    const total = distribution.reduce((sum: number, item: any) => sum + (item.count ?? 0), 0);

    return (
      <div className="space-y-8">
        {renderMetricGrid(
          overviewKpis,
          periodLabel,
          overviewLoading,
          ['Total Cases', 'Resolution Rate', 'SLA Compliance', 'AI Auto-Resolution', 'High Risk Cases'],
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-5">Performance Shifts</h2>
            <div className="space-y-6">
              <div>
                <h3 className="flex items-center text-xs font-bold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span> What Improved
                </h3>
                {improved.length ? (
                  <ul className="space-y-3">
                    {improved.map((metric: any, index: number) => (
                      <li key={index} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <span className="material-symbols-outlined text-green-600 text-[18px] mt-0.5">trending_up</span>
                        <span><strong className="text-gray-900 dark:text-white">{metric.label}</strong>: {metric.value}{metric.change ? ` (${metric.change})` : ''}{metric.sub ? ` — ${metric.sub}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500">No improving KPI surfaced in this range.</p>
                )}
              </div>
              <div className="border-t border-gray-100 dark:border-gray-800 pt-6">
                <h3 className="flex items-center text-xs font-bold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-red-500 mr-2"></span> What Worsened
                </h3>
                {worsened.length ? (
                  <ul className="space-y-3">
                    {worsened.map((metric: any, index: number) => (
                      <li key={index} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <span className="material-symbols-outlined text-red-500 text-[18px] mt-0.5">trending_down</span>
                        <span><strong className="text-gray-900 dark:text-white">{metric.label}</strong>: {metric.value}{metric.change ? ` (${metric.change})` : ''}{metric.sub ? ` — ${metric.sub}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500">No declining KPI surfaced in this range.</p>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
              <span className="material-symbols-outlined text-[18px] mr-1.5 text-indigo-500">timeline</span>
              SLA Distribution
            </h2>
            {slaLoading && distribution.length === 0 ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="animate-pulse">
                    <div className="h-3 w-28 bg-gray-100 dark:bg-gray-800 rounded mb-2"></div>
                    <div className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full"></div>
                  </div>
                ))}
              </div>
            ) : distribution.length ? (
              <div className="space-y-4">
                {distribution.map((item: any, index: number) => {
                  const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                  const color = item.status === 'breached' ? 'bg-red-500' : item.status === 'at_risk' ? 'bg-orange-400' : 'bg-green-500';
                  return (
                    <div key={index}>
                      <div className="flex justify-between items-center text-sm mb-1.5">
                        <span className="text-gray-700 dark:text-gray-300 font-medium capitalize">{String(item.status || 'unknown').replace(/_/g, ' ')}</span>
                        <span className="font-semibold text-gray-900 dark:text-white">{item.count} <span className="font-normal text-gray-400">({pct}%)</span></span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                        <div className={`${color} h-2 rounded-full`} style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <span className="material-symbols-outlined text-3xl text-gray-300 dark:text-gray-600 mb-2">timeline</span>
                <p className="text-sm text-gray-400">No SLA data for this filter.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderAiResume = () => (
    <div className="flex flex-col h-full gap-6">
      <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-card w-full flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide mb-1">Configuration</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">Generate a real summary from the selected range, channel, agents, approvals, SLA, and cost data.</p>
        </div>

        <div className="flex items-center gap-6 flex-wrap md:flex-nowrap">
          <div className="min-w-[220px]">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Target Audience</label>
            <StyledSelect
              value={reportAudience}
              onChange={(e) => setReportAudience(e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-sm rounded-lg px-3 py-2.5 text-gray-900 dark:text-white"
            >
              <option value="Executive / C-Suite">Executive / C-Suite</option>
              <option value="Support Lead">Support Lead</option>
              <option value="Technical Team">Technical Team</option>
            </StyledSelect>
          </div>

          <div className="flex gap-4">
            {[
              { key: 'exactMetrics', label: 'Exact metrics' },
              { key: 'outliers', label: 'Outliers' },
              { key: 'comparative', label: 'Comparative' },
            ].map((toggle) => {
              const active = reportOptions[toggle.key as keyof typeof reportOptions];
              return (
                <div key={toggle.key} className={`flex items-center gap-2 ${!active ? 'opacity-50' : ''}`}>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{toggle.label}</span>
                  <button
                    type="button"
                    onClick={() => setReportOptions((current) => ({ ...current, [toggle.key]: !current[toggle.key as keyof typeof current] }))}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${active ? 'bg-gray-900 dark:bg-white' : 'bg-gray-200 dark:bg-gray-700'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white dark:bg-black transition-transform ${active ? 'translate-x-4.5' : 'translate-x-0.5'}`}></span>
                  </button>
                </div>
              );
            })}
          </div>

          <div className="h-10 w-px bg-gray-200 dark:bg-gray-700 hidden md:block"></div>

          <button
            onClick={handleGenerateNew}
            disabled={isGenerating}
            className="py-2.5 px-5 bg-gradient-to-r from-gray-900 to-black dark:from-white dark:to-gray-200 text-white dark:text-black font-semibold rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 group whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span className={`material-symbols-outlined text-lg ${isGenerating ? 'animate-spin' : 'group-hover:animate-pulse'}`}>
              {isGenerating ? 'progress_activity' : 'temp_preferences_custom'}
            </span>
            {isGenerating ? 'Generating...' : 'Generate New'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex bg-white dark:bg-card-dark shadow-card overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 min-h-0">
        <div className="w-80 flex-shrink-0 border-r border-gray-100 dark:border-gray-700 flex flex-col bg-gray-50/30 dark:bg-black/5">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-card-dark flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Generated Reports</h2>
            <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-bold px-2 py-0.5 rounded-full">{generatedReports.length}</span>
          </div>
          <div className="overflow-y-auto flex-1 custom-scrollbar p-2 space-y-2">
            {generatedReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center px-4">
                <span className="material-symbols-outlined text-4xl text-gray-300 dark:text-gray-600 mb-3">description</span>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No reports yet</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 leading-snug">Generate a report to summarize real platform activity for the selected filter set.</p>
              </div>
            ) : generatedReports.map((report) => (
              <div
                key={report.id}
                onClick={() => setSelectedReportId(report.id)}
                className={`p-4 rounded-xl border cursor-pointer group relative transition-all duration-200 ${
                  selectedReportId === report.id
                    ? 'bg-white dark:bg-gray-800 border-indigo-500 shadow-card scale-[1.02] z-10'
                    : 'bg-white dark:bg-card-dark border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 shadow-sm hover:shadow-card'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="flex flex-col">
                    <span className={`font-semibold text-sm ${selectedReportId === report.id ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                      {report.title}
                    </span>
                    <span className="text-xs text-gray-400 font-mono mt-0.5">{report.audience}</span>
                  </div>
                  <span className="text-xs text-gray-400">{report.time}</span>
                </div>
                <div className="mb-2 mt-2">
                  <p className={`text-xs truncate ${selectedReportId === report.id ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-600 dark:text-gray-300 font-normal'}`}>
                    {report.date} · {report.range} · {report.channel}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  <span className="bg-green-50 text-green-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border border-green-200">Generated</span>
                  {report.severity === 'warning' ? <span className="bg-orange-50 text-orange-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border border-orange-200">Warning</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar bg-white dark:bg-card-dark flex flex-col relative">
          {!selectedGeneratedReport ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
              <span className="material-symbols-outlined text-6xl text-gray-200 dark:text-gray-700 mb-4">description</span>
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">No report selected</h3>
              <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs leading-relaxed">
                Generate a report and we will summarize actual activity from agents, approvals, costs, cases, and SLA for the selected range.
              </p>
            </div>
          ) : (
            <div className="flex flex-col flex-1">
              <div className="p-8 pb-6 border-b border-gray-100 dark:border-gray-800 z-10 relative">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">AI Generated Report</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 uppercase tracking-wide">{selectedGeneratedReport.audience}</span>
                      <span className="text-xs text-gray-400 font-medium ml-2">{selectedGeneratedReport.range} · {selectedGeneratedReport.channel}</span>
                    </div>
                    <h1 className="text-3xl font-serif font-bold text-gray-900 dark:text-white tracking-tight">{selectedGeneratedReport.title}</h1>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleShare} title="Copy link" className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><span className="material-symbols-outlined">share</span></button>
                    <button onClick={handleExportPDF} title="Print / Export PDF" className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><span className="material-symbols-outlined">print</span></button>
                    <button onClick={handleExportCSV} title="Export CSV" className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><span className="material-symbols-outlined">table_view</span></button>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/40 rounded-xl p-6 border border-gray-100 dark:border-gray-700/50 flex gap-4 items-start">
                  <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 mt-0.5 text-2xl">auto_awesome</span>
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">Executive Summary</h3>
                    {selectedGeneratedReport.executiveSummary.map((line, index) => (
                      <p key={index} className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{line}</p>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-8 pt-6 z-10 relative space-y-8">
                <div className="grid grid-cols-2 gap-10">
                  <div>
                    <h3 className="flex items-center text-sm font-bold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">
                      <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span> Key Positive Signals
                    </h3>
                    <ul className="space-y-4">
                      {(selectedGeneratedReport.positiveSignals.length ? selectedGeneratedReport.positiveSignals : [{ title: 'No positive signal highlighted', detail: 'No standout gain was detected for the selected range.' }]).map((item, index) => (
                        <li key={index} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                          <span className="material-symbols-outlined text-green-600 text-lg mt-0.5">trending_up</span>
                          <div>
                            <strong className="text-gray-900 dark:text-white block mb-1">{item.title}</strong>
                            {item.detail}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="flex items-center text-sm font-bold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">
                      <span className="w-2 h-2 rounded-full bg-red-500 mr-2"></span> Risk Flags & Bottlenecks
                    </h3>
                    <ul className="space-y-4">
                      {(selectedGeneratedReport.riskFlags.length ? selectedGeneratedReport.riskFlags : [{ title: 'No active bottleneck', detail: 'No material blocker was detected in the selected range.' }]).map((item, index) => (
                        <li key={index} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                          <span className={`material-symbols-outlined text-lg mt-0.5 ${index === 0 ? 'text-red-500' : 'text-orange-500'}`}>{index === 0 ? 'error' : 'warning'}</span>
                          <div>
                            <strong className="text-gray-900 dark:text-white block mb-1">{item.title}</strong>
                            {item.detail}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="h-px bg-gray-100 dark:bg-gray-800"></div>

                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">Business Impact & Recommendations</h3>
                  <div className="grid grid-cols-3 gap-6">
                    {(selectedGeneratedReport.businessImpact.length ? selectedGeneratedReport.businessImpact : [{ title: 'No impact cluster', detail: 'The selected range did not reveal a dominant business cluster.' }]).slice(0, 2).map((item, index) => (
                      <div key={index} className="p-5 bg-gray-50 dark:bg-gray-800/30 rounded-xl border border-gray-100 dark:border-gray-700/50">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="material-symbols-outlined text-indigo-500">{index === 0 ? 'group' : 'smart_toy'}</span>
                          <h4 className="font-bold text-sm text-gray-900 dark:text-white">{item.title}</h4>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{item.detail}</p>
                      </div>
                    ))}
                    <div className="p-5 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400">task_alt</span>
                        <h4 className="font-bold text-sm text-indigo-900 dark:text-indigo-100">Recommended Actions</h4>
                      </div>
                      <ul className="text-xs text-indigo-800 dark:text-indigo-200 space-y-2 list-disc pl-4">
                        {selectedGeneratedReport.recommendations.map((item, index) => <li key={index}>{item}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-gray-100 dark:bg-gray-800"></div>

                <div className="grid grid-cols-2 gap-10">
                  <div>
                    <h3 className="flex items-center text-sm font-bold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">
                      <span className="w-2 h-2 rounded-full bg-blue-500 mr-2"></span> Cost & Efficiency Analysis
                    </h3>
                    <ul className="space-y-4">
                      {selectedGeneratedReport.costSummary.map((item, index) => (
                        <li key={index} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                          <span className="material-symbols-outlined text-blue-600 text-lg mt-0.5">{index === 0 ? 'savings' : 'memory'}</span>
                          <div>
                            <strong className="text-gray-900 dark:text-white block mb-1">{item.title}</strong>
                            {item.detail}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="flex items-center text-sm font-bold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">
                      <span className="w-2 h-2 rounded-full bg-purple-500 mr-2"></span> Included Focus
                    </h3>
                    <ul className="space-y-4">
                      {[
                        reportOptions.exactMetrics ? 'Exact metrics are included in this report.' : 'Exact metrics were intentionally hidden from this report.',
                        reportOptions.outliers ? 'Outlier detection is included to highlight abnormal changes.' : 'Outlier detection was disabled for this report.',
                        reportOptions.comparative ? `Comparative deltas were included against the previous ${periodLabel.toLowerCase()}.` : 'Comparative deltas are disabled for this report.',
                      ].map((item, index) => (
                        <li key={index} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                          <span className="material-symbols-outlined text-purple-500 text-lg mt-0.5">insights</span>
                          <div>{item}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 flex justify-between items-center">
                <span>Data Sources: Cases, approval requests, agent runs, credit ledger, and SLA state.</span>
                <span className="font-mono">ID: RPT-{selectedGeneratedReport.id}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderBusinessAreas = () => {
    const kpiMap = Object.fromEntries((overviewData?.kpis ?? []).map((metric: any) => [metric.key, metric]));
    const metrics: MetricCardData[] = [
      {
        key: 'auto_resolution',
        label: 'AI Resolution Rate',
        value: kpiMap.auto_resolution?.value ?? kpiMap.resolution_rate?.value ?? '—',
        change: kpiMap.auto_resolution?.change ?? '',
        trend: kpiMap.auto_resolution?.trend ?? 'neutral',
        sub: kpiMap.auto_resolution?.sub ?? 'AI automated resolutions',
      },
      {
        key: 'approval_rate',
        label: 'Approval Rate',
        value: approvalsData?.rates?.approvalRate ?? '—',
        trend: 'neutral',
        sub: 'Approved vs total requests',
      },
      {
        key: 'avg_decision_time',
        label: 'Avg Decision Time',
        value: approvalsData?.rates?.avgDecisionHours != null ? `${approvalsData.rates.avgDecisionHours}h` : '—',
        trend: 'neutral',
        sub: 'Approval median',
      },
      {
        key: 'sla',
        label: 'SLA Compliance',
        value: kpiMap.sla_compliance?.value ?? '—',
        change: kpiMap.sla_compliance?.change ?? '',
        trend: kpiMap.sla_compliance?.trend ?? 'neutral',
        sub: kpiMap.sla_compliance?.sub ?? 'Within SLA',
      },
      {
        key: 'high_risk',
        label: 'High Risk Cases',
        value: kpiMap.high_risk?.value ?? '—',
        trend: 'neutral',
        sub: kpiMap.high_risk?.sub ?? 'Flagged high/critical',
      },
      {
        key: 'total_cases',
        label: 'Total Cases',
        value: kpiMap.total_cases?.value ?? '—',
        change: kpiMap.total_cases?.change ?? '',
        trend: kpiMap.total_cases?.trend ?? 'neutral',
        sub: kpiMap.total_cases?.sub ?? 'Period total',
      },
    ];

    const intents = intentsData?.intents ?? [];
    const topIntent = intents[0];
    const weakestIntent = [...intents].sort((a: any, b: any) => parseMetricNumber(a.handled) - parseMetricNumber(b.handled))[0];
    const recommendedFixes = [
      topIntent ? { label: `Review coverage for ${String(topIntent.name).replace(/_/g, ' ')}`, impact: 'High impact', effort: 'M' } : null,
      weakestIntent ? { label: `Improve handling for ${String(weakestIntent.name).replace(/_/g, ' ')}`, impact: 'Medium impact', effort: 'S' } : null,
    ].filter(Boolean) as Array<{ label: string; impact: string; effort: string }>;

    return (
      <div className="space-y-8">
        {renderMetricGrid(metrics, periodLabel, overviewLoading || approvalsLoading, metrics.map((metric) => metric.label))}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Top Intents</h2>
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
              >
                View overview
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 dark:bg-gray-800/20 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">
                    <th className="px-5 py-3">Intent</th>
                    <th className="px-5 py-3 text-right">Volume</th>
                    <th className="px-5 py-3 text-right">AI Handled %</th>
                    <th className="px-5 py-3 w-1/4">Share</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-800">
                  {intentsLoading && intents.length === 0 ? (
                    <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">Loading intents…</td></tr>
                  ) : intents.length === 0 ? (
                    <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">No demand signals for this filter.</td></tr>
                  ) : intents.map((intent: any, index: number) => (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-200 capitalize">{String(intent.name).replace(/_/g, ' ')}</td>
                      <td className="px-5 py-3 text-right text-gray-600 dark:text-gray-400">{intent.volume}</td>
                      <td className="px-5 py-3 text-right font-medium text-green-600 dark:text-green-400">{intent.handled}</td>
                      <td className="px-5 py-3 text-gray-400">
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                          <div className="bg-[#6e62e5] h-1.5 rounded-full" style={{ width: intent.shareOfTotal }}></div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-gradient-to-br from-indigo-50 to-white dark:from-gray-800 dark:to-card-dark rounded-xl border border-indigo-100 dark:border-gray-700 p-6 shadow-card relative overflow-hidden">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 text-xl">auto_awesome</span>
                <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">AI Micro-Summary</h2>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
                {topIntent
                  ? `${String(topIntent.name).replace(/_/g, ' ')} is the busiest business area at ${topIntent.volume} cases and ${topIntent.handled} AI handling.`
                  : 'There is no dominant business area in this range.'}
                {weakestIntent ? ` The lowest-handled flow is ${String(weakestIntent.name).replace(/_/g, ' ')}, which should be reviewed next.` : ''}
              </p>
            </div>

            <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/20">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-gray-500 text-[18px]">fact_check</span> Recommended Fixes
                </h2>
              </div>
              <div className="p-5 space-y-3">
                {recommendedFixes.length === 0 ? (
                  <div className="text-sm text-gray-400">No fix recommendation surfaced for this filter.</div>
                ) : recommendedFixes.map((fix, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => showToast(`Captured "${fix.label}" as a follow-up recommendation`)}
                    className="w-full flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group text-left"
                  >
                    <span className="material-symbols-outlined text-gray-400 mt-0.5">checklist</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{fix.label}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">{fix.impact}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">Effort: {fix.effort}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAgents = () => {
    const spotlight = [...agentCards].sort((a: any, b: any) => parseMetricNumber(a.value) - parseMetricNumber(b.value))[0] ?? null;
    const avgSuccess = agentCards.length ? Math.round(agentCards.reduce((sum: number, agent: any) => sum + parseMetricNumber(agent.value), 0) / agentCards.length) : null;
    return (
      <div className="space-y-8">
        {renderMetricGrid(
          agentCards.length ? agentCards : [emptyMetric('Agent Success Rate'), emptyMetric('Agent Success Rate'), emptyMetric('Agent Success Rate')],
          periodLabel,
          agentsLoading,
          ['Supervisor', 'Resolver', 'Knowledge Retriever', 'Canonicalizer', 'Composer', 'QA Check'],
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-card">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-indigo-500 flex items-center justify-center text-white shadow-sm">
                  <span className="material-symbols-outlined text-[20px]">{spotlight?.icon || 'smart_toy'}</span>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">{spotlight?.label || 'No agent spotlight'}</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{spotlight ? 'Lowest success rate this period — inspect first' : 'No agent runs for this filter.'}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-lg border border-gray-100 dark:border-gray-700/50">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Success Rate</div>
                  <div className={`text-lg font-bold ${spotlight && parseMetricNumber(spotlight.value) < 80 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>{spotlight?.value || '—'}</div>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-lg border border-gray-100 dark:border-gray-700/50">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Runs</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">{spotlight?.totalRuns ?? '—'}</div>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-lg border border-gray-100 dark:border-gray-700/50">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Category</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white capitalize">{String(spotlight?.category ?? '—').replace(/_/g, ' ')}</div>
                </div>
              </div>
              <div className="p-4 rounded-lg bg-amber-50/60 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30">
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                  {spotlight
                    ? <>
                        <strong className="text-gray-900 dark:text-white">Spotlight:</strong> {spotlight.label} has a {spotlight.value} success rate over {spotlight.totalRuns} runs. {spotlight.failedRuns ? `${spotlight.failedRuns} failed runs need review.` : 'No failed runs were recorded.'}
                      </>
                    : 'No spotlight can be generated because there are no agent runs in the selected range.'}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-gradient-to-br from-indigo-50 to-white dark:from-gray-800 dark:to-card-dark rounded-xl border border-indigo-100 dark:border-gray-700 p-6 shadow-card relative overflow-hidden">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 text-xl">auto_awesome</span>
                <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Agent Summary</h2>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {agentCards.length
                  ? `${agentCards.length} agents produced runs in this range. Average success rate: ${avgSuccess}% across ${formatChannelLabel(channel).toLowerCase()}.`
                  : 'No agent activity was recorded for the selected range and channel.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderApprovalsRisk = () => {
    const funnel = approvalsData?.funnel ?? [];
    const triggered = funnel.find((item: any) => item.label === 'Triggered')?.val ?? '—';
    const pending = funnel.find((item: any) => item.label === 'Pending')?.val ?? '—';
    const approved = approvalsData?.rates?.approvalRate ?? '—';
    const rejected = approvalsData?.rates?.rejectionRate ?? '—';
    const avgDecision = approvalsData?.rates?.avgDecisionHours != null ? `${approvalsData.rates.avgDecisionHours}h` : '—';
    const highRisk = approvalsData?.byRisk?.find((item: any) => item.riskLevel === 'high')?.count ?? 0;
    const breached = slaData?.distribution?.find((item: any) => item.status === 'breached')?.count ?? 0;

    const metrics: MetricCardData[] = [
      { label: 'Approval Requests', value: triggered, sub: 'Period total' },
      { label: 'Pending Backlog', value: pending, sub: 'Awaiting review' },
      { label: 'Approval Rate', value: approved, sub: 'Approved / total' },
      { label: 'Rejection Rate', value: rejected, sub: 'Rejected / total' },
      { label: 'Avg Decision Time', value: avgDecision, sub: 'Request to decision' },
      { label: 'SLA Breaches', value: String(breached), sub: 'Cases outside SLA', trend: breached > 0 ? 'down' : 'neutral' },
      { label: 'High-Risk Items', value: String(highRisk), sub: 'Requires human review' },
      { label: 'Executed After Approval', value: approved, sub: 'Approved flows that can continue' },
    ];

    return (
      <div className="space-y-8">
        {renderMetricGrid(metrics, periodLabel, approvalsLoading || slaLoading, metrics.map((metric) => metric.label))}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-6">Approvals Funnel</h2>
              <div className="flex justify-between items-center text-center">
                {funnel.length === 0 ? (
                  <div className="w-full py-8 text-sm text-gray-400">No approval requests for this filter.</div>
                ) : funnel.map((step: any, index: number) => (
                  <React.Fragment key={index}>
                    <div className="flex-1">
                      <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{step.val}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{step.label}</div>
                    </div>
                    {index < funnel.length - 1 ? <div className="text-gray-400"><span className="material-symbols-outlined">arrow_right_alt</span></div> : null}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">AI Risk Brief</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {approvalsData?.rates?.avgDecisionHours != null
                  ? `Average decision time is ${avgDecision}. Approval rate is ${approved}, rejection rate is ${rejected}, and ${breached} cases breached SLA in this filter.`
                  : 'No approval decision data is available for this range.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCostRoi = () => {
    const summary = costsData?.summary ?? {};
    const byAgent = costsData?.byAgent ?? [];
    const totalCases = overviewData?.kpis?.find((metric: any) => metric.key === 'total_cases');
    const resolutionRate = overviewData?.kpis?.find((metric: any) => metric.key === 'resolution_rate');
    const slaCompliance = overviewData?.kpis?.find((metric: any) => metric.key === 'sla_compliance');
    const nCases = parseMetricNumber(totalCases?.value);
    const creditsUsed = summary.creditsUsed != null ? String(summary.creditsUsed) : '—';
    const creditsAdded = summary.creditsAdded != null ? String(summary.creditsAdded) : '—';
    const tokens = summary.totalTokens != null ? Number(summary.totalTokens).toLocaleString() : '—';
    const autoResolved = summary.autoResolvedCases != null ? String(summary.autoResolvedCases) : '—';
    const costPerCase = nCases > 0 && summary.creditsUsed != null ? `${(summary.creditsUsed / nCases).toFixed(4)} cr` : '—';

    const metrics: MetricCardData[] = [
      { label: 'Credits Used', value: creditsUsed, sub: 'AI processing cost' },
      { label: 'Credits Added', value: creditsAdded, sub: 'Workspace top-ups' },
      { label: 'Total Tokens', value: tokens, sub: 'LLM tokens consumed' },
      { label: 'AI Auto-Resolved', value: autoResolved, sub: 'Cases completed by AI', trend: 'up' },
      { label: 'Cost per Case', value: costPerCase, sub: 'Average AI cost / case' },
      { label: 'Total Cases', value: totalCases?.value ?? '—', change: totalCases?.change ?? '', trend: totalCases?.trend ?? 'neutral', sub: totalCases?.sub ?? '' },
      { label: 'Resolution Rate', value: resolutionRate?.value ?? '—', change: resolutionRate?.change ?? '', trend: resolutionRate?.trend ?? 'neutral', sub: resolutionRate?.sub ?? '' },
      { label: 'SLA Compliance', value: slaCompliance?.value ?? '—', change: slaCompliance?.change ?? '', trend: slaCompliance?.trend ?? 'neutral', sub: slaCompliance?.sub ?? '' },
    ];

    return (
      <div className="space-y-8">
        {renderMetricGrid(metrics, periodLabel, costsLoading || overviewLoading, metrics.map((metric) => metric.label))}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Cost by Agent</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50 dark:bg-gray-800/20 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">
                      <th className="px-5 py-3">Agent</th>
                      <th className="px-5 py-3 text-right">Tokens</th>
                      <th className="px-5 py-3 text-right">Credits</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-800">
                    {costsLoading && byAgent.length === 0 ? (
                      <tr><td colSpan={3} className="px-5 py-8 text-center text-gray-400">Loading agent costs…</td></tr>
                    ) : byAgent.length === 0 ? (
                      <tr><td colSpan={3} className="px-5 py-8 text-center text-gray-400">No agent cost data for this filter.</td></tr>
                    ) : byAgent.map((agent: any, index: number) => (
                      <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-200">{agent.name}</td>
                        <td className="px-5 py-3 text-right text-gray-600 dark:text-gray-400">{Number(agent.tokens).toLocaleString()}</td>
                        <td className="px-5 py-3 text-right font-medium text-indigo-600 dark:text-indigo-400">{agent.cost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {(slaData?.distribution?.length ?? 0) > 0 ? (
              <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">SLA Distribution</h2>
                <div className="space-y-3">
                  {slaData.distribution.map((item: any, index: number) => {
                    const total = slaData.distribution.reduce((sum: number, row: any) => sum + row.count, 0);
                    const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                    const color = item.status === 'breached' ? 'bg-red-500' : item.status === 'at_risk' ? 'bg-orange-400' : 'bg-green-500';
                    return (
                      <div key={index}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600 dark:text-gray-400 capitalize">{String(item.status).replace(/_/g, ' ')}</span>
                          <span className="font-medium text-gray-900 dark:text-white">{item.count} ({pct}%)</span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                          <div className={`${color} h-1.5 rounded-full`} style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-6">
            <div className="bg-gradient-to-br from-indigo-50 to-white dark:from-gray-800 dark:to-card-dark rounded-xl border border-indigo-100 dark:border-gray-700 p-6 shadow-card relative overflow-hidden">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 text-xl">auto_awesome</span>
                <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Cost Summary</h2>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
                {summary.creditsUsed != null
                  ? <>Used <strong className="text-gray-900 dark:text-white">{creditsUsed} credits</strong> across {tokens} tokens and {autoResolved} completed AI executions in this range.</>
                  : 'No cost data is available for this range.'}
                <br /><br />
                <strong className="text-gray-900 dark:text-white">Filter:</strong> {periodLabel} · {formatChannelLabel(channel)}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">
        <svg className="hidden">
          <defs>
            <linearGradient id="purple-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#6e62e5" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#6e62e5" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>

        <div className="p-6 pb-0 flex-shrink-0 z-20">
          <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="px-6 py-4 flex items-center justify-between">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Reports & Analytics</h1>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg mr-2">
                  {['7d', '30d', '90d'].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setPeriod(option)}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${period === option ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                    >
                      {option.toUpperCase()}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleShare}
                  className="flex items-center px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-sm"
                >
                  <span className="material-symbols-outlined text-sm mr-1.5">share</span>
                  Share
                </button>
                <button
                  onClick={handleExportPDF}
                  className="flex items-center px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-sm"
                >
                  <span className="material-symbols-outlined text-sm mr-1.5">download</span>
                  Export PDF
                </button>
                <button
                  onClick={handleExportCSV}
                  className="flex items-center px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-sm"
                >
                  <span className="material-symbols-outlined text-sm mr-1.5">table_view</span>
                  Export CSV
                </button>
                {shareToast ? (
                  <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                    {shareToast}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="px-6 flex items-center space-x-8 border-t border-gray-100 dark:border-gray-800 pt-3">
              {REPORT_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`pb-3 text-sm transition-colors border-b-2 ${
                    activeTab === tab
                      ? 'font-bold text-gray-900 dark:text-white border-black dark:border-white'
                      : 'font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border-transparent hover:border-gray-300'
                  }`}
                >
                  {tab === 'approvals_risk' ? 'Approvals & Risk' : tab === 'cost_roi' ? 'Cost & ROI' : tab.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="sticky top-0 z-10 bg-[#f9fafb]/95 dark:bg-background-dark/95 backdrop-blur-sm px-6 py-4 flex items-center justify-between border-b border-gray-200/50 dark:border-gray-800/50">
          <div className="flex items-center space-x-2">
            <StyledSelect
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="flex items-center px-3 py-1.5 text-xs font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
              <option value="custom">Custom range</option>
            </StyledSelect>
            {period === 'custom' && (
              <>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-sm text-gray-700 dark:text-gray-300"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-sm text-gray-700 dark:text-gray-300"
                />
              </>
            )}
            <div className="h-4 w-px bg-gray-300 dark:bg-gray-600 mx-1"></div>
            <StyledSelect
              value={channel}
              onChange={(e) => setChannel(e.target.value as ReportChannel)}
              className="flex items-center px-3 py-1.5 text-xs font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
            >
              <option value="all">Channel: All</option>
              <option value="email">Channel: Email</option>
              <option value="chat">Channel: Chat</option>
              <option value="web_chat">Channel: Web Chat</option>
              <option value="phone">Channel: Phone</option>
              <option value="sms">Channel: SMS</option>
            </StyledSelect>
            <button className="flex items-center px-3 py-1.5 text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-md shadow-card text-indigo-700 dark:text-indigo-300 transition-colors">
              <span className="material-symbols-outlined text-sm mr-1.5 text-indigo-500">auto_awesome</span>
              Mode: Autopilot
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          <div className="w-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${activeTab}-${period}-${channel}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === 'overview' && renderOverview()}
                {activeTab === 'ai_resume' && renderAiResume()}
                {activeTab === 'business_areas' && renderBusinessAreas()}
                {activeTab === 'agents' && renderAgents()}
                {activeTab === 'approvals_risk' && renderApprovalsRisk()}
                {activeTab === 'cost_roi' && renderCostRoi()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
