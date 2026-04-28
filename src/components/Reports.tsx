import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApi } from '../api/hooks';
import { reportsApi } from '../api/client';

type ReportsTab = 'overview' | 'ai_resume' | 'business_areas' | 'agents' | 'approvals_risk' | 'cost_roi';

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatRatio(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0%';
  return formatPercent((numerator / denominator) * 100);
}

const KPICard: React.FC<{ metric: any, index: number }> = ({ metric, index }) => (
  <div className="bg-white dark:bg-card-dark rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-card flex flex-col justify-between h-[180px] relative overflow-hidden group">
    <div className="flex items-start justify-between z-10 relative">
      <div>
        <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{metric.label}</div>
        <div className="flex items-end gap-3">
          <div className="text-3xl font-bold text-gray-900 dark:text-white">{metric.value}</div>
          {metric.change && (
            <div className={`text-sm font-medium flex items-center px-2 py-0.5 rounded mb-1 ${
              metric.trend === 'up' ? 'text-green-600 bg-green-50 dark:bg-green-900/20' : 
              metric.trend === 'down' ? 'text-red-600 bg-red-50 dark:bg-red-900/20' : 
              'text-gray-500 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600'
            }`}>
              {metric.trend === 'up' && <span className="material-symbols-outlined text-[14px] mr-1">trending_up</span>}
              {metric.trend === 'down' && <span className="material-symbols-outlined text-[14px] mr-1">trending_down</span>}
              {metric.change}
            </div>
          )}
        </div>
        {metric.sub && <div className="text-xs text-gray-400 mt-1 truncate">{metric.sub}</div>}
      </div>
      <div className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded">Last 7 days</div>
    </div>
    <div className="absolute bottom-0 left-0 right-0 h-20 opacity-30 group-hover:opacity-50 transition-opacity">
      <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 200 40">
        <path 
          d={index % 2 === 0 ? "M0,40 L0,30 C20,25 40,35 60,20 C80,5 100,25 120,15 C140,5 160,25 180,10 L200,5 L200,40 Z" : "M0,40 L0,35 L40,30 L80,25 L120,15 L160,20 L200,5 L200,40 Z"} 
          fill="url(#purple-grad)"
        />
        <path 
          d={index % 2 === 0 ? "M0,30 C20,25 40,35 60,20 C80,5 100,25 120,15 C140,5 160,25 180,10 L200,5" : "M0,35 L40,30 L80,25 L120,15 L160,20 L200,5"} 
          fill="none" stroke="#6e62e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </div>
  </div>
);

// Generated reports come from the backend when the user triggers "Generate New".
// Until generated, the list is empty.
const GENERATED_REPORTS: { id: string; title: string; date: string; time: string; audience: string; status: string; severity: string; range: string }[] = [];

const recommendedActions: any[] = [];

export default function Reports() {
  const [reportsList, setReportsList] = useState(GENERATED_REPORTS);
  const [activeTab, setActiveTab] = useState<ReportsTab>('overview');
  const [selectedReportId, setSelectedReportId] = useState('1');
  const [period, setPeriod] = useState('7d');

  // ── Real API data ────────────────────────────────────────────────
  const { data: overviewData } = useApi(() => reportsApi.overview(period), [period]);
  const { data: intentsData } = useApi(() => reportsApi.intents(period), [period]);
  const { data: agentsData } = useApi(() => reportsApi.agents(period), [period]);
  const { data: approvalsData } = useApi(() => reportsApi.approvals(period), [period]);
  const { data: costsData } = useApi(() => reportsApi.costs(period), [period]);
  const { data: slaData } = useApi(() => reportsApi.sla(period), [period]);

  const fallbackOverviewKpis = [
    { label: 'AI Resolution Rate', value: '68%', change: '+12%', trend: 'up', sub: 'Improving intent match' },
    { label: 'Deflection Rate', value: '52%', change: '+9%', trend: 'up', sub: 'Self-serve articles up' },
    { label: 'Escalation Rate', value: '18%', change: '-3%', trend: 'down', sub: 'Fewer missing sources' },
    { label: 'Time to FR', value: '45s', change: 'AI vs 12m Human', trend: 'neutral', sub: 'AI response instant' },
    { label: 'Time to Resolution', value: '2h', change: 'AI vs 18h Human', trend: 'neutral', sub: 'Faster tool runs' },
    { label: 'Approval Throughput', value: '74%', change: '+6%', trend: 'up', sub: 'Approvals slower in Billing' },
    { label: 'Tool Success Rate', value: '96%', change: '-2%', trend: 'down', sub: 'Shopify lookup errors' },
    { label: 'CSAT Delta', value: '+0.4', change: '', trend: 'up', sub: 'High user satisfaction' },
  ];

  const overviewKpis = overviewData?.kpis?.length ? overviewData.kpis : fallbackOverviewKpis;

  const renderOverview = () => {
    // Derive dynamic performance shifts from real KPI data
    const kpis: any[] = overviewData?.kpis ?? [];
    const improved = kpis.filter((k) => k.trend === 'up').slice(0, 3);
    const worsened = kpis.filter((k) => k.trend === 'down').slice(0, 3);

    // SLA distribution for side panel
    const slaDistrib: any[] = slaData?.distribution ?? [];
    const slaTotal = slaDistrib.reduce((s: number, d: any) => s + (d.count ?? 0), 0);

    return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {overviewKpis.map((metric: any, i: number) => (
          <KPICard key={i} metric={metric} index={i} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance Shifts — derived from real KPI trend data */}
        <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-5">Performance Shifts</h2>
          <div className="space-y-6">
            <div>
              <h3 className="flex items-center text-xs font-bold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span> What Improved
              </h3>
              {improved.length > 0 ? (
                <ul className="space-y-3">
                  {improved.map((k: any, i: number) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                      <span className="material-symbols-outlined text-green-600 text-[18px] mt-0.5">trending_up</span>
                      <span><strong className="text-gray-900 dark:text-white">{k.label}</strong>: {k.value}{k.change ? ` (${k.change})` : ''}{k.sub ? ` — ${k.sub}` : ''}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500">No improving KPIs this period.</p>
              )}
            </div>
            <div className="border-t border-gray-100 dark:border-gray-800 pt-6">
              <h3 className="flex items-center text-xs font-bold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-red-500 mr-2"></span> What Worsened
              </h3>
              {worsened.length > 0 ? (
                <ul className="space-y-3">
                  {worsened.map((k: any, i: number) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                      <span className="material-symbols-outlined text-red-500 text-[18px] mt-0.5">trending_down</span>
                      <span><strong className="text-gray-900 dark:text-white">{k.label}</strong>: {k.value}{k.change ? ` (${k.change})` : ''}{k.sub ? ` — ${k.sub}` : ''}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500">No declining KPIs this period.</p>
              )}
            </div>
          </div>
        </div>

        {/* SLA distribution panel */}
        <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <span className="material-symbols-outlined text-[18px] mr-1.5 text-indigo-500">timer</span>
            SLA Distribution
          </h2>
          {slaDistrib.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <span className="material-symbols-outlined text-3xl text-gray-300 dark:text-gray-600 mb-2">timer</span>
              <p className="text-sm text-gray-400">No SLA data for this period.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {slaDistrib.map((item: any, i: number) => {
                const pct = slaTotal > 0 ? Math.round((item.count / slaTotal) * 100) : 0;
                const color = item.status === 'breached' ? 'bg-red-500' : item.status === 'at_risk' ? 'bg-orange-400' : 'bg-green-500';
                const label = item.status === 'breached' ? 'Breached' : item.status === 'at_risk' ? 'At Risk' : item.status === 'on_track' ? 'On Track' : String(item.status ?? '').replace(/_/g, ' ');
                return (
                  <div key={i}>
                    <div className="flex justify-between items-center text-sm mb-1.5">
                      <span className="text-gray-700 dark:text-gray-300 font-medium capitalize">{label}</span>
                      <span className="font-semibold text-gray-900 dark:text-white">{item.count} <span className="font-normal text-gray-400">({pct}%)</span></span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                      <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-gray-400 dark:text-gray-500 pt-1">{slaTotal} total cases with SLA data this period.</p>
            </div>
          )}
        </div>
      </div>
    </div>
    );
  };

  const renderAiResume = () => {
    const selectedReport = reportsList.find(r => r.id === selectedReportId) ?? null;

    return (
      <div className="flex flex-col h-full gap-6">
        {/* Top Configuration Card */}
        <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-card w-full flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide mb-1">Configuration</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">Customize the tone and focus of the AI-generated executive summary.</p>
          </div>
          
          <div className="flex items-center gap-6 flex-wrap md:flex-nowrap">
            <div className="min-w-[200px]">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Target Audience</label>
              <select className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-sm rounded-lg focus:ring-black focus:border-black dark:focus:ring-white dark:focus:border-white block p-2.5 dark:text-white">
                <option>Executive / C-Suite</option>
                <option>Support Lead</option>
                <option>Technical Team</option>
              </select>
            </div>
            
            <div className="flex gap-4">
              {[
                { label: 'Exact metrics', active: true },
                { label: 'Outliers', active: true },
                { label: 'Comparative', active: false },
              ].map((toggle, i) => (
                <div key={i} className={`flex items-center gap-2 ${!toggle.active ? 'opacity-50' : ''}`}>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{toggle.label}</span>
                  <button className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${toggle.active ? 'bg-gray-900 dark:bg-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white dark:bg-black transition-transform ${toggle.active ? 'translate-x-4.5' : 'translate-x-0.5'}`}></span>
                  </button>
                </div>
              ))}
            </div>

            <div className="h-10 w-px bg-gray-200 dark:bg-gray-700 hidden md:block"></div>

            <button 
              onClick={() => {
                const newReport = {
                  id: Date.now().toString(),
                  title: `Executive Summary - Q${Math.ceil((new Date().getMonth() + 1)/3)}`,
                  date: new Date().toLocaleDateString(),
                  time: new Date().toLocaleTimeString(),
                  audience: 'Executive / C-Suite',
                  status: 'Generated',
                  severity: 'warning',
                  range: 'Last 7 Days'
                };
                setReportsList([newReport, ...reportsList]);
                setSelectedReportId(newReport.id);
              }}
              className="py-2.5 px-5 bg-gradient-to-r from-gray-900 to-black dark:from-white dark:to-gray-200 text-white dark:text-black font-semibold rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 group whitespace-nowrap">
              <span className="material-symbols-outlined text-lg group-hover:animate-pulse">temp_preferences_custom</span>
              Generate New
            </button>
          </div>
        </div>

        {/* Bottom Split: Sidebar + Report */}
        <div className="flex-1 flex bg-white dark:bg-card-dark shadow-card overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 min-h-0">
          {/* Left Sidebar: Generated Reports (Inbox UI style) */}
          <div className="w-80 flex-shrink-0 border-r border-gray-100 dark:border-gray-700 flex flex-col bg-gray-50/30 dark:bg-black/5">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-card-dark flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Generated Reports</h2>
              <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-bold px-2 py-0.5 rounded-full">{reportsList.length}</span>
            </div>
            <div className="overflow-y-auto flex-1 custom-scrollbar p-2 space-y-2">
              {reportsList.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-12 text-center px-4">
                  <span className="material-symbols-outlined text-4xl text-gray-300 dark:text-gray-600 mb-3">description</span>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No reports yet</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 leading-snug">Click <strong>Generate New</strong> to create your first AI-powered executive report.</p>
                </div>
              ) : reportsList.map((report) => (
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
                      {report.date} • {report.range}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {report.status === 'Generated' && <span className="bg-green-50 text-green-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border border-green-200">Generated</span>}
                    {report.status === 'Archived' && <span className="bg-gray-50 text-gray-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border border-gray-200">Archived</span>}
                    {report.severity === 'critical' && <span className="bg-red-50 text-red-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border border-red-200">Critical</span>}
                    {report.severity === 'warning' && <span className="bg-orange-50 text-orange-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border border-orange-200">Warning</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: The Report itself */}
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-white dark:bg-card-dark flex flex-col relative">
            {!selectedReport && (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
                <span className="material-symbols-outlined text-6xl text-gray-200 dark:text-gray-700 mb-4">description</span>
                <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">No report selected</h3>
                <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs leading-relaxed">
                  Generate your first AI executive report by clicking <strong>Generate New</strong> above.
                  Reports are tailored to your audience and include KPIs, risk flags, and recommendations.
                </p>
              </div>
            )}
            {selectedReport && (
            <div className="flex flex-col flex-1">
            <div className="p-8 pb-6 border-b border-gray-100 dark:border-gray-800 z-10 relative">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">AI Generated Report</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 uppercase tracking-wide">{selectedReport.audience}</span>
                      <span className="text-xs text-gray-400 font-medium ml-2">{selectedReport.range}</span>
                    </div>
                    <h1 className="text-3xl font-serif font-bold text-gray-900 dark:text-white tracking-tight">{selectedReport.title}</h1>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => {
                      navigator.clipboard.writeText(window.location.href);
                      alert('Link copied to clipboard!');
                    }} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"><span className="material-symbols-outlined">share</span></button>
                    <button onClick={() => window.print()} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"><span className="material-symbols-outlined">print</span></button>
                  </div>
                </div>
                
                <div className="bg-gray-50 dark:bg-gray-800/40 rounded-xl p-6 border border-gray-100 dark:border-gray-700/50 flex gap-4 items-start">
                  <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 mt-0.5 text-2xl">auto_awesome</span>
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">Executive Summary</h3>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                      The AI support system is operating at <strong className="text-green-600 dark:text-green-400">High Efficiency</strong>. Overall support efficiency increased by 12% due to higher Autopilot resolution rates. However, a spike in billing inquiries related to the new Shopify integration requires immediate attention to prevent CSAT degradation. Cost savings remain strong, with a 9% week-over-week increase in net savings.
                    </p>
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
                      <li className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <span className="material-symbols-outlined text-green-600 text-lg mt-0.5">trending_up</span>
                        <div>
                          <strong className="text-gray-900 dark:text-white block mb-1">Autopilot Resolution</strong>
                          Increased to 68% (up from 54%), successfully deflecting 1,204 tickets without agent intervention.
                        </div>
                      </li>
                      <li className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <span className="material-symbols-outlined text-green-600 text-lg mt-0.5">schedule</span>
                        <div>
                          <strong className="text-gray-900 dark:text-white block mb-1">First Response Time</strong>
                          Dropped to 45s avg, marking a record low for Q4.
                        </div>
                      </li>
                      <li className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <span className="material-symbols-outlined text-green-600 text-lg mt-0.5">thumb_up</span>
                        <div>
                          <strong className="text-gray-900 dark:text-white block mb-1">CSAT Improvement</strong>
                          Customer satisfaction score increased by 0.4 points to 4.8/5.0, driven by instant AI responses.
                        </div>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="flex items-center text-sm font-bold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">
                      <span className="w-2 h-2 rounded-full bg-red-500 mr-2"></span> Risk Flags & Bottlenecks
                    </h3>
                    <ul className="space-y-4">
                      <li className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <span className="material-symbols-outlined text-red-500 text-lg mt-0.5">error</span>
                        <div>
                          <strong className="text-gray-900 dark:text-white block mb-1">Shopify Integration</strong>
                          15% error rate on order lookup actions causing agent fallback. <span className="text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded ml-1">Critical</span>
                        </div>
                      </li>
                      <li className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <span className="material-symbols-outlined text-orange-500 text-lg mt-0.5">warning</span>
                        <div>
                          <strong className="text-gray-900 dark:text-white block mb-1">Escalations</strong>
                          "Order Not Found" escalations rose by 40% on Tuesday.
                        </div>
                      </li>
                      <li className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <span className="material-symbols-outlined text-orange-500 text-lg mt-0.5">policy</span>
                        <div>
                          <strong className="text-gray-900 dark:text-white block mb-1">Knowledge Gap</strong>
                          Outdated policy documents regarding the new Q4 return window are causing confusion.
                        </div>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="h-px bg-gray-100 dark:bg-gray-800"></div>

                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">Business Impact & Recommendations</h3>
                  <div className="grid grid-cols-3 gap-6">
                    <div className="p-5 bg-gray-50 dark:bg-gray-800/30 rounded-xl border border-gray-100 dark:border-gray-700/50">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="material-symbols-outlined text-indigo-500">group</span>
                        <h4 className="font-bold text-sm text-gray-900 dark:text-white">Most Affected Area</h4>
                      </div>
                      <p className="text-sm text-gray-900 dark:text-white font-medium mb-1">Billing & Refunds</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">High volume of refund requests post-holiday sale. Agents spent 22% of time manually verifying transaction IDs.</p>
                    </div>
                    <div className="p-5 bg-gray-50 dark:bg-gray-800/30 rounded-xl border border-gray-100 dark:border-gray-700/50">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="material-symbols-outlined text-indigo-500">smart_toy</span>
                        <h4 className="font-bold text-sm text-gray-900 dark:text-white">Most Affected Agent</h4>
                      </div>
                      <p className="text-sm text-gray-900 dark:text-white font-medium mb-1">Knowledge Retriever</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">Experiencing elevated escalation rates due to outdated policy documents regarding the new Q4 return window.</p>
                    </div>
                    <div className="p-5 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400">task_alt</span>
                        <h4 className="font-bold text-sm text-indigo-900 dark:text-indigo-100">Recommended Actions</h4>
                      </div>
                      <ul className="text-xs text-indigo-800 dark:text-indigo-200 space-y-2 list-disc pl-4">
                        <li>Investigate Shopify API timeouts immediately.</li>
                        <li>Update Q4 Return Policy KB article.</li>
                        <li>Review SLA breaches in Approvals.</li>
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
                      <li className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <span className="material-symbols-outlined text-blue-600 text-lg mt-0.5">savings</span>
                        <div>
                          <strong className="text-gray-900 dark:text-white block mb-1">Net Savings Trend</strong>
                          Generated $118k in net savings this period, a 9% increase week-over-week.
                        </div>
                      </li>
                      <li className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <span className="material-symbols-outlined text-blue-600 text-lg mt-0.5">memory</span>
                        <div>
                          <strong className="text-gray-900 dark:text-white block mb-1">Infrastructure Cost</strong>
                          LLM API costs stabilized at $0.12 per case. Vector DB usage remains optimal.
                        </div>
                      </li>
                      <li className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <span className="material-symbols-outlined text-blue-600 text-lg mt-0.5">work_history</span>
                        <div>
                          <strong className="text-gray-900 dark:text-white block mb-1">Human Hours Saved</strong>
                          4,250 hours saved across the support team, equivalent to 26 FTEs.
                        </div>
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="flex items-center text-sm font-bold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">
                      <span className="w-2 h-2 rounded-full bg-purple-500 mr-2"></span> Customer Sentiment (CSAT)
                    </h3>
                    <ul className="space-y-4">
                      <li className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <span className="material-symbols-outlined text-purple-500 text-lg mt-0.5">sentiment_satisfied</span>
                        <div>
                          <strong className="text-gray-900 dark:text-white block mb-1">Overall Satisfaction</strong>
                          Maintained a 4.8/5.0 average across AI-resolved tickets.
                        </div>
                      </li>
                      <li className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <span className="material-symbols-outlined text-purple-500 text-lg mt-0.5">forum</span>
                        <div>
                          <strong className="text-gray-900 dark:text-white block mb-1">User Feedback</strong>
                          "Fast resolution" cited in 42% of positive reviews. Frustration noted in multi-step billing flows.
                        </div>
                      </li>
                      <li className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
                        <span className="material-symbols-outlined text-purple-500 text-lg mt-0.5">support_agent</span>
                        <div>
                          <strong className="text-gray-900 dark:text-white block mb-1">Agent Handoff Experience</strong>
                          Smooth transitions reported in 94% of escalated cases, preserving context.
                        </div>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-gray-50 dark:bg-gray-800/80 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 flex justify-between items-center">
                <span>Data Sources: Zendesk, Shopify, Stripe, Intercom.</span>
                <span className="font-mono">ID: RPT-{selectedReport.id}</span>
              </div>
            </div>
            )}
        </div>
      </div>
    </div>
  );
  };

  const renderBusinessAreas = () => {
    const kpiMap = Object.fromEntries((overviewData?.kpis ?? []).map((k: any) => [k.key, k]));
    const bizKpis = [
      {
        label: 'AI Resolution Rate',
        value: kpiMap['auto_resolution']?.value ?? kpiMap['resolution_rate']?.value ?? '—',
        change: kpiMap['auto_resolution']?.change ?? '',
        trend: kpiMap['auto_resolution']?.trend ?? 'neutral',
        sub: kpiMap['auto_resolution']?.sub ?? 'AI automated resolutions',
      },
      {
        label: 'Approval Rate',
        value: approvalsData?.rates?.approvalRate ?? '—',
        change: '',
        trend: 'neutral',
        sub: 'Approved / total requests',
      },
      {
        label: 'Avg Decision Time',
        value: approvalsData?.rates?.avgDecisionHours != null ? `${approvalsData.rates.avgDecisionHours}h` : '—',
        change: '',
        trend: 'neutral',
        sub: 'Approvals median',
      },
      {
        label: 'SLA Compliance',
        value: kpiMap['sla_compliance']?.value ?? '—',
        change: kpiMap['sla_compliance']?.change ?? '',
        trend: kpiMap['sla_compliance']?.trend ?? 'neutral',
        sub: kpiMap['sla_compliance']?.sub ?? 'Within SLA deadline',
      },
      {
        label: 'High Risk Cases',
        value: kpiMap['high_risk']?.value ?? '—',
        change: '',
        trend: 'neutral',
        sub: kpiMap['high_risk']?.sub ?? 'Flagged as high/critical',
      },
      {
        label: 'Total Cases',
        value: kpiMap['total_cases']?.value ?? '—',
        change: kpiMap['total_cases']?.change ?? '',
        trend: kpiMap['total_cases']?.trend ?? 'neutral',
        sub: kpiMap['total_cases']?.sub ?? 'Period total',
      },
    ];

    return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {bizKpis.map((metric, i) => (
          <KPICard key={i} metric={metric} index={i} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/20">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Top Intents</h2>
            <button className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300">View All</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 dark:bg-gray-800/20 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">
                  <th className="px-5 py-3">Intent</th>
                  <th className="px-5 py-3 text-right">Volume</th>
                  <th className="px-5 py-3 text-right">AI Handled %</th>
                  <th className="px-5 py-3 w-1/4">Trend</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-100 dark:divide-gray-800">
                {(intentsData?.intents?.length ? intentsData.intents.map((intent: any) => ({
                  name: intent.name?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || intent.name,
                  volume: intent.volume || '0',
                  handled: intent.handled || '0%',
                  color: parseInt(intent.handled) >= 70 ? 'bg-green-500' : parseInt(intent.handled) >= 40 ? 'bg-orange-400' : 'bg-red-500',
                })) : [
                  { name: 'Full Refund Request', volume: '1,245', handled: '72%', color: 'bg-green-500' },
                  { name: 'Subscription Cancel', volume: '890', handled: '85%', color: 'bg-green-500' },
                  { name: 'Invoice Lookup', volume: '654', handled: '94%', color: 'bg-green-500' },
                  { name: 'Partial Refund Request', volume: '432', handled: '45%', color: 'bg-orange-400' },
                  { name: 'Payment Failed', volume: '321', handled: '22%', color: 'bg-red-500' },
                ]).map((intent: any, i: number) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-200">{intent.name}</td>
                    <td className="px-5 py-3 text-right text-gray-600 dark:text-gray-400">{intent.volume}</td>
                    <td className="px-5 py-3 text-right font-medium text-green-600 dark:text-green-400">{intent.handled}</td>
                    <td className="px-5 py-3 text-gray-400">
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div className={`${intent.color} h-1.5 rounded-full`} style={{ width: intent.handled }}></div>
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
              Billing performance remains stable with an overall 68% AI resolution rate. However, a recent spike in <strong className="text-gray-900 dark:text-white">Partial Refund Requests</strong> is dragging down efficiency, resolving at only 45%. 
              <br/><br/>
              The primary bottleneck identified is the <strong className="text-red-600 dark:text-red-400">Shopify API connection</strong>, which is experiencing timeouts.
            </p>
          </div>
          
          <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/20">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-gray-500 text-[18px]">fact_check</span> Recommended Fixes
              </h2>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: 'Investigate Shopify API timeouts', impact: 'High Impact', effort: 'M', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
                { label: "Draft KB: 'Partial Refund Logic'", impact: 'Medium Impact', effort: 'S', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
              ].map((fix, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
                  <input className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" type="checkbox" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{fix.label}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${fix.color}`}>{fix.impact}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">Effort: {fix.effort}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
    );
  };

  const fallbackAgentCards = [
    { name: 'Supervisor', rate: '98.2%', change: '+1.2%', trend: 'up', icon: 'supervisor_account', sub: 'Routing accuracy' },
    { name: 'Knowledge Retriever', rate: '82.4%', change: '-4.2%', trend: 'down', icon: 'search', active: true, sub: 'Search precision' },
    { name: 'Canonicalizer', rate: '95.1%', change: '+0.8%', trend: 'up', icon: 'merge_type', sub: 'Entity extraction' },
    { name: 'Intent Router', rate: '97.6%', change: '+2.1%', trend: 'up', icon: 'route', sub: 'Intent matching' },
    { name: 'Composer', rate: '92.3%', change: '0.0%', trend: 'neutral', icon: 'edit_document', sub: 'Response quality' },
    { name: 'QA Check', rate: '99.8%', change: '+0.2%', trend: 'up', icon: 'verified', sub: 'Policy adherence' },
  ];

  const AGENT_ICON_MAP: Record<string, string> = {
    'orchestration': 'supervisor_account', 'ingest': 'merge_type', 'resolution': 'build',
    'communication': 'edit_document', 'observability': 'verified', 'connectors': 'cable',
  };

  const agentCards = agentsData?.agents?.length
    ? agentsData.agents.slice(0, 6).map((a: any) => ({
        name: a.name,
        rate: a.successRate || '0%',
        change: '',
        trend: parseFloat(a.successRate) >= 90 ? 'up' : parseFloat(a.successRate) >= 70 ? 'neutral' : 'down',
        icon: AGENT_ICON_MAP[a.category] || 'smart_toy',
        sub: `${a.totalRuns} runs • ${a.tokensUsed || 0} tokens`,
      }))
    : fallbackAgentCards;

  const renderAgents = () => (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {agentCards.map((agent: any, i: number) => (
          <div key={i} className={`rounded-xl p-5 border shadow-card flex flex-col justify-between h-[180px] relative overflow-hidden group cursor-pointer transition-all ${agent.active ? 'bg-indigo-50/30 dark:bg-indigo-900/10 border-indigo-500 dark:border-indigo-400 ring-1 ring-indigo-500' : 'bg-white dark:bg-card-dark border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}>
            <div className="flex items-start justify-between z-10 relative">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-6 h-6 rounded flex items-center justify-center ${agent.active ? 'bg-indigo-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
                    <span className="material-symbols-outlined text-[14px]">{agent.icon}</span>
                  </div>
                  <div className={`text-sm font-semibold ${agent.active ? 'text-indigo-900 dark:text-indigo-100' : 'text-gray-900 dark:text-white'}`}>{agent.name}</div>
                </div>
                <div className="flex items-end gap-3 mt-1">
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">{agent.rate}</div>
                  {agent.change && (
                    <div className={`text-sm font-medium flex items-center px-2 py-0.5 rounded mb-1 ${
                      agent.trend === 'up' ? 'text-green-600 bg-green-50 dark:bg-green-900/20' : 
                      agent.trend === 'down' ? 'text-red-600 bg-red-50 dark:bg-red-900/20' : 
                      'text-gray-500 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600'
                    }`}>
                      {agent.trend === 'up' && <span className="material-symbols-outlined text-[14px] mr-1">trending_up</span>}
                      {agent.trend === 'down' && <span className="material-symbols-outlined text-[14px] mr-1">trending_down</span>}
                      {agent.change}
                    </div>
                  )}
                </div>
                {agent.sub && <div className="text-xs text-gray-400 mt-1 truncate">{agent.sub}</div>}
              </div>
              <div className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded">Last 7 days</div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-20 opacity-30 group-hover:opacity-50 transition-opacity">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 200 40">
                <path 
                  d={i % 2 === 0 ? "M0,40 L0,30 C20,25 40,35 60,20 C80,5 100,25 120,15 C140,5 160,25 180,10 L200,5 L200,40 Z" : "M0,40 L0,35 L40,30 L80,25 L120,15 L160,20 L200,5 L200,40 Z"} 
                  fill={agent.active ? "url(#indigo-grad)" : "url(#purple-grad)"}
                />
                <path 
                  d={i % 2 === 0 ? "M0,30 C20,25 40,35 60,20 C80,5 100,25 120,15 C140,5 160,25 180,10 L200,5" : "M0,35 L40,30 L80,25 L120,15 L160,20 L200,5"} 
                  fill="none" stroke={agent.active ? "#6366f1" : "#6e62e5"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        ))}
      </div>

      {/* Agent detail — shows the lowest-performing agent from real data */}
      {agentCards.length > 0 && (() => {
        // Pick the agent with the lowest success rate for spotlight
        const spotlight = [...agentCards].sort((a: any, b: any) => parseFloat(a.rate) - parseFloat(b.rate))[0] as any;
        const agentIcon = AGENT_ICON_MAP[spotlight.slug?.split('_')[0]] || spotlight.icon || 'smart_toy';
        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-card">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500 flex items-center justify-center text-white shadow-sm">
                    <span className="material-symbols-outlined text-[20px]">{agentIcon}</span>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">{spotlight.name}</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Lowest success rate this period — needs attention</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-lg border border-gray-100 dark:border-gray-700/50">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Success Rate</div>
                    <div className={`text-lg font-bold ${parseFloat(spotlight.rate) < 80 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>{spotlight.rate}</div>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-lg border border-gray-100 dark:border-gray-700/50">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Runs</div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white">{spotlight.sub?.split(' runs')[0] ?? '—'}</div>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-lg border border-gray-100 dark:border-gray-700/50">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Category</div>
                    <div className="text-lg font-bold text-gray-900 dark:text-white capitalize">{(spotlight.slug ?? '—').replace(/_/g, ' ')}</div>
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-amber-50/60 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30">
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    <strong className="text-gray-900 dark:text-white">Spotlight:</strong> {spotlight.name} has a {spotlight.rate} success rate over this period with {spotlight.sub?.split(' runs')[0] ?? '—'} runs. {parseFloat(spotlight.rate) < 80 ? 'Performance is below the 80% threshold — investigate failed runs.' : 'Performance is acceptable.'}
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
                  {agentCards.length} agents active. Average success rate:{' '}
                  <strong className="text-gray-900 dark:text-white">
                    {agentCards.length > 0
                      ? `${Math.round(agentCards.reduce((s: number, a: any) => s + parseFloat(a.rate || '0'), 0) / agentCards.length)}%`
                      : '—'}
                  </strong>.
                  {agentCards.filter((a: any) => parseFloat(a.rate) < 80).length > 0
                    ? ` ${agentCards.filter((a: any) => parseFloat(a.rate) < 80).length} agent(s) below 80% threshold.`
                    : ' All agents above 80% threshold.'}
                </p>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );

  const renderApprovalsRisk = () => {
    const funnel = approvalsData?.funnel ?? [];
    const triggered = funnel.find((f: any) => f.label === 'Triggered')?.val ?? funnel[0]?.val ?? '—';
    const pending   = funnel.find((f: any) => f.label === 'Pending')?.val   ?? funnel[3]?.val ?? '—';
    const approved  = funnel.find((f: any) => f.label === 'Approved')?.val  ?? funnel[1]?.val;
    const rejected  = funnel.find((f: any) => f.label === 'Rejected')?.val  ?? funnel[2]?.val;
    const rates = approvalsData?.rates ?? {};
    const highRisk = approvalsData?.byRisk?.find((r: any) => r.riskLevel === 'high')?.count ?? null;
    const slaBreached = slaData?.distribution?.find((d: any) => d.status === 'breached')?.count ?? null;

    const approvalKpis = [
      { label: 'Approval Requests', value: triggered, change: '', trend: 'neutral', sub: `Period total` },
      { label: 'Pending Backlog', value: pending, change: '', trend: 'neutral', sub: 'Awaiting review' },
      { label: 'Approval Rate', value: rates.approvalRate ?? (approved ? formatRatio(Number(approved), Number(triggered.replace(/,/g, '')) || 1) : '—'), change: '', trend: 'neutral', sub: 'Of all requests' },
      { label: 'Rejection Rate', value: rates.rejectionRate ?? (rejected ? formatRatio(Number(rejected), Number(triggered.replace(/,/g, '')) || 1) : '—'), change: '', trend: 'neutral', sub: 'Of all requests' },
      { label: 'Avg Decision Time', value: rates.avgDecisionHours != null ? `${rates.avgDecisionHours}h` : '—', change: '', trend: 'neutral', sub: 'From request to decision' },
      { label: 'SLA Breaches', value: slaBreached != null ? String(slaBreached) : '—', change: '', trend: slaBreached ? 'down' : 'neutral', sub: 'Cases past SLA deadline' },
      { label: 'High-Risk Items', value: highRisk != null ? String(highRisk) : '—', change: '', trend: 'neutral', sub: 'Requires manager review' },
      { label: 'Executed After Approval', value: rates.approvalRate ?? '—', change: '', trend: 'neutral', sub: 'Execution rate' },
    ];

    return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {approvalKpis.map((metric, i) => (
          <KPICard key={i} metric={metric} index={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-6">Approvals Funnel</h2>
            <div className="flex justify-between items-center text-center">
              {(approvalsData?.funnel?.length ? approvalsData.funnel : [
                { label: 'Requested', val: '1,420' },
                { label: 'Approved', val: '1,180' },
                { label: 'Rejected', val: '156' },
                { label: 'Executed', val: '1,156' },
              ]).map((step: any, i: number) => (
                <React.Fragment key={i}>
                  <div className="flex-1">
                    <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{step.val}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{step.label}</div>
                  </div>
                  {i < 3 && <div className="text-gray-400"><span className="material-symbols-outlined">arrow_right_alt</span></div>}
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
                ? `Average decision time is ${approvalsData.rates.avgDecisionHours}h. Approval rate: ${approvalsData.rates.approvalRate ?? '—'}, rejection rate: ${approvalsData.rates.rejectionRate ?? '—'}.`
                : 'No approval data available for this period.'}
              {slaBreached != null && slaBreached > 0 ? ` ${slaBreached} cases have breached SLA.` : ''}
            </p>
          </div>
        </div>
      </div>
    </div>
    );
  };

  const renderCostRoi = () => {
    const summary = costsData?.summary ?? {};
    const byAgent: any[] = costsData?.byAgent ?? [];
    const creditsUsed  = summary.creditsUsed  != null ? String(summary.creditsUsed) : '—';
    const totalTokens  = summary.totalTokens  != null ? Number(summary.totalTokens).toLocaleString() : '—';
    const autoResolved = summary.autoResolvedCases != null ? String(summary.autoResolvedCases) : '—';
    const creditsAdded = summary.creditsAdded != null ? String(summary.creditsAdded) : '—';

    // compute per-case cost if we have both sides
    const totalCasesKpi = overviewData?.kpis?.find((k: any) => k.key === 'total_cases');
    const nCases = totalCasesKpi ? Number(totalCasesKpi.value) : 0;
    const costPerCase = nCases > 0 && summary.creditsUsed != null
      ? (summary.creditsUsed / nCases).toFixed(4)
      : null;

    const costKpis = [
      { label: 'Credits Used', value: creditsUsed, change: '', trend: 'neutral', sub: 'AI processing cost' },
      { label: 'Credits Added', value: creditsAdded, change: '', trend: 'neutral', sub: 'Top-ups this period' },
      { label: 'Total Tokens', value: totalTokens, change: '', trend: 'neutral', sub: 'LLM tokens consumed' },
      { label: 'AI Auto-Resolved', value: autoResolved, change: '', trend: 'up', sub: 'Cases closed by AI' },
      { label: 'Cost per Case', value: costPerCase ? `${costPerCase} cr` : '—', change: '', trend: 'neutral', sub: 'Average AI cost/case' },
      { label: 'Total Cases', value: totalCasesKpi?.value ?? '—', change: totalCasesKpi?.change ?? '', trend: totalCasesKpi?.trend ?? 'neutral', sub: totalCasesKpi?.sub ?? '' },
      { label: 'Resolution Rate', value: overviewData?.kpis?.find((k: any) => k.key === 'resolution_rate')?.value ?? '—', change: '', trend: 'neutral', sub: 'Cases resolved' },
      { label: 'SLA Compliance', value: overviewData?.kpis?.find((k: any) => k.key === 'sla_compliance')?.value ?? '—', change: '', trend: 'neutral', sub: 'Within SLA deadline' },
    ];

    return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {costKpis.map((metric, i) => (
          <KPICard key={i} metric={metric} index={i} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Cost by Agent table — from real agent_runs data */}
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
                  {byAgent.length === 0 ? (
                    <tr><td colSpan={3} className="px-5 py-8 text-center text-gray-400 dark:text-gray-500">No agent run data for this period.</td></tr>
                  ) : byAgent.map((agent: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-200">{agent.name}</td>
                      <td className="px-5 py-3 text-right text-gray-600 dark:text-gray-400">{Number(agent.tokens).toLocaleString()}</td>
                      <td className="px-5 py-3 text-right font-medium text-indigo-600 dark:text-indigo-400">{agent.cost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* SLA Distribution */}
          {slaData?.distribution && slaData.distribution.length > 0 && (
            <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">SLA Distribution</h2>
              <div className="space-y-3">
                {slaData.distribution.map((item: any, i: number) => {
                  const total = slaData.distribution.reduce((s: number, d: any) => s + d.count, 0);
                  const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                  const color = item.status === 'breached' ? 'bg-red-500' : item.status === 'at_risk' ? 'bg-orange-400' : 'bg-green-500';
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600 dark:text-gray-400 capitalize">{item.status?.replace(/_/g, ' ')}</span>
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
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-gradient-to-br from-indigo-50 to-white dark:from-gray-800 dark:to-card-dark rounded-xl border border-indigo-100 dark:border-gray-700 p-6 shadow-card relative overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 text-xl">auto_awesome</span>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Cost Summary</h2>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
              {summary.creditsUsed != null
                ? <>Used <strong className="text-gray-900 dark:text-white">{creditsUsed} credits</strong> ({totalTokens} tokens) across {autoResolved} auto-resolved cases this period.</>
                : 'No cost data available for this period.'}
              {costPerCase && <><br/><br/><strong className="text-gray-900 dark:text-white">Avg cost per case:</strong> {costPerCase} credits.</>}
            </p>
          </div>

          {/* Top SLA breaches by type */}
          {slaData?.breachedByType && slaData.breachedByType.length > 0 && (
            <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/20">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-red-500 text-[18px]">timer_off</span> Top SLA Breaches
                </h2>
              </div>
              <div className="p-5 space-y-3">
                {slaData.breachedByType.slice(0, 5).map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 dark:text-gray-300 capitalize">{String(item.type).replace(/_/g, ' ')}</span>
                    <span className="font-semibold text-red-600 dark:text-red-400">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                {['7d', '30d', '90d'].map(option => (
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
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  alert('Link copied to clipboard!');
                }}
                className="flex items-center px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-sm">
                <span className="material-symbols-outlined text-sm mr-1.5">share</span>
                Share
              </button>
              <button 
                onClick={() => window.print()}
                className="flex items-center px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-sm">
                <span className="material-symbols-outlined text-sm mr-1.5">download</span>
                Export PDF
              </button>
            </div>
          </div>
          <div className="px-6 flex items-center space-x-8 border-t border-gray-100 dark:border-gray-800 pt-3">
            {(['overview', 'ai_resume', 'business_areas', 'agents', 'approvals_risk', 'cost_roi'] as ReportsTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 text-sm transition-colors border-b-2 ${
                  activeTab === tab 
                    ? 'font-bold text-gray-900 dark:text-white border-black dark:border-white' 
                    : 'font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border-transparent hover:border-gray-300'
                }`}
              >
                {tab === 'approvals_risk' ? 'Approvals & Risk' : tab === 'cost_roi' ? 'Cost & ROI' : tab.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-10 bg-[#f9fafb]/95 dark:bg-background-dark/95 backdrop-blur-sm px-6 py-4 flex items-center justify-between border-b border-gray-200/50 dark:border-gray-800/50">
        <div className="flex items-center space-x-2">
          <button className="flex items-center px-3 py-1.5 text-xs font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">
            <span className="material-symbols-outlined text-sm mr-1.5 text-gray-400">calendar_today</span>
            Last 7 Days
            <span className="material-symbols-outlined text-sm ml-1.5 text-gray-400">expand_more</span>
          </button>
          <div className="h-4 w-px bg-gray-300 dark:bg-gray-600 mx-1"></div>
          <button className="flex items-center px-3 py-1.5 text-xs font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors">
            Channel: All
            <span className="material-symbols-outlined text-sm ml-1.5 text-gray-400">expand_more</span>
          </button>
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
              key={activeTab}
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
