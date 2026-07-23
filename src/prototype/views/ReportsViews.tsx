// ─────────────────────────────────────────────────────────────────────────────
// Reports views
// Extracted from the monolithic Prototype.tsx (auto-split, behavior-preserving).
// ─────────────────────────────────────────────────────────────────────────────

import { useApi } from '../../api/hooks';
import { casesApi, reportsApi } from '../../api/client';
import { useState } from 'react';
import { Dropdown, KnowledgePlaceholder, TrialBanner } from '../sharedUi';


// ─────────────────────────────────────────────────────────────────────────────
// REPORTS VIEW (Figma nodes 1:32668, 1:34178, 1:42451, 2:10327, 3:11829,
// 3:14199, 3:16295, 3:20010, 3:22346, 3:24515, 3:26772, 4:16934, 4:19011,
// 4:22197, 4:24401, 4:26962, 4:28809)
// ─────────────────────────────────────────────────────────────────────────────

type ReportsSubView =
  | 'overview' | 'aiResumen' | 'areasNegocio' | 'agentesPerf' | 'aprobacionesRisk' | 'costesRoi'
  | 'todos' | 'misInformes' | 'favoritos'
  | 'temas' | 'sugerencias' | 'export' | 'horarios'
  | 'finAgent' | 'copilot'
  | 'calls' | 'conversations' | 'csat' | 'effectiveness'
  | 'responsiveness' | 'slas' | 'teamInbox' | 'teammate' | 'tickets'
  | 'articles' | 'outboundEng' | 'administrar';

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

// ── 1. Visión general ─────────────────────────────────────────────────────────
function ReportsOverviewContent({ period, channel }: { period: string; channel: string }) {
  const { data: ov, loading } = useApi(() => reportsApi.overview(period, channel), [period, channel], null);
  const { data: sla } = useApi(() => reportsApi.sla(period, channel), [period, channel], null);
  const kpis: any[] = ov?.kpis ?? [];
  const improved = kpis.filter((m: any) => m.trend === 'up').slice(0, 3);
  const worsened = kpis.filter((m: any) => m.trend === 'down').slice(0, 3);
  const dist: any[] = sla?.distribution ?? [];
  const distTotal = dist.reduce((s, d) => s + (d.count ?? 0), 0);
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Visión general</h1>
          <p className="text-[12.5px] text-[#646462]">Métricas principales del workspace en el período seleccionado.</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
        {loading && !kpis.length ? (
          <div className="grid grid-cols-2 gap-3">{['Total','Resolución','SLA','Auto-IA','Riesgo'].map((l, i) => <div key={i} className="border border-[#e9eae6] rounded-[10px] bg-white h-[110px] animate-pulse" />)}</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {kpis.map((m: any, i: number) => <ReportsAnalysisKpiCard key={i} idx={i} label={m.label} value={m.value} change={m.change} trend={m.trend} sub={m.sub} />)}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-[#e9eae6] rounded-[10px] bg-white p-4">
            <h2 className="text-[13px] font-semibold text-[#1a1a1a] mb-3">Cambios de rendimiento</h2>
            <p className="text-[11px] font-bold text-[#1a1a1a] uppercase tracking-wide mb-2 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#16a34a] inline-block"/>Mejoras</p>
            {improved.length ? improved.map((m: any, i: number) => (
              <div key={i} className="text-[12px] text-[#646462] mb-1.5 flex items-start gap-1.5">
                <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#16a34a] flex-shrink-0 mt-0.5"><path d="M3 11l5-7 5 7z"/></svg>
                <span><strong className="text-[#1a1a1a]">{m.label}</strong>: {m.value}{m.change ? ` (${m.change})` : ''}</span>
              </div>
            )) : <p className="text-[12px] text-[#646462] mb-3">Sin KPIs al alza en este rango.</p>}
            <div className="border-t border-[#e9eae6] pt-3 mt-3">
              <p className="text-[11px] font-bold text-[#1a1a1a] uppercase tracking-wide mb-2 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#dc2626] inline-block"/>Caídas</p>
              {worsened.length ? worsened.map((m: any, i: number) => (
                <div key={i} className="text-[12px] text-[#646462] mb-1.5 flex items-start gap-1.5">
                  <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#dc2626] flex-shrink-0 mt-0.5"><path d="M3 5l5 7 5-7z"/></svg>
                  <span><strong className="text-[#1a1a1a]">{m.label}</strong>: {m.value}{m.change ? ` (${m.change})` : ''}</span>
                </div>
              )) : <p className="text-[12px] text-[#646462]">Sin KPIs a la baja en este rango.</p>}
            </div>
          </div>
          <div className="border border-[#e9eae6] rounded-[10px] bg-white p-4">
            <h2 className="text-[13px] font-semibold text-[#1a1a1a] mb-3">Distribución SLA</h2>
            {dist.length ? dist.map((d: any, i: number) => {
              const pct = distTotal > 0 ? Math.round((d.count / distTotal) * 100) : 0;
              const bar = d.status === 'breached' ? 'bg-[#dc2626]' : d.status === 'at_risk' ? 'bg-[#f97316]' : 'bg-[#16a34a]';
              return (
                <div key={i} className="mb-3">
                  <div className="flex justify-between text-[12px] mb-1">
                    <span className="text-[#1a1a1a] capitalize">{String(d.status).replace(/_/g,' ')}</span>
                    <span className="text-[#646462]">{d.count} ({pct}%)</span>
                  </div>
                  <div className="w-full bg-[#f3f3f1] rounded-full h-1.5"><div className={`${bar} h-1.5 rounded-full`} style={{ width: `${pct}%` }}/></div>
                </div>
              );
            }) : <p className="text-[12px] text-[#646462]">Sin datos SLA para este filtro.</p>}
          </div>
        </div>
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
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.5"><path d="M3 9c0-2.5 2-4.5 4.5-4.5S12 6.5 12 9c0 1.5-.7 2.7-1.7 3.5l.4 2L9 13.4 5.5 14l-.5-2C3.7 11.2 3 10 3 8.5z"/></svg>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Temas</h1>
        </div>
        <button className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#ededea]">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.4"><path d="M8 13.5l-5-4.5C1 7 1 4.5 3 3s4.5-.5 5 1.5C8.5 2.5 11 2 12.5 3.5S15 7 13 9z"/></svg>
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center min-h-0 p-6">
        <div className="flex flex-col items-center max-w-[460px] text-center">
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="w-20 h-20 rounded-full bg-[#cdf3eb] flex items-center justify-center relative">
              <svg viewBox="0 0 32 32" className="w-10 h-10 fill-none stroke-[#1a1a1a]" strokeWidth="1.5"><circle cx="11" cy="14" r="6"/><circle cx="22" cy="11" r="3"/><path d="M16 18l5-3"/></svg>
            </div>
            <div className="w-20 h-20 rounded-full bg-[#cdf3eb] flex items-center justify-center">
              <svg viewBox="0 0 32 32" className="w-10 h-10 fill-none stroke-[#1a1a1a]" strokeWidth="1.5"><circle cx="16" cy="16" r="2"/><circle cx="9" cy="10" r="2"/><circle cx="23" cy="10" r="2"/><circle cx="9" cy="22" r="2"/><circle cx="23" cy="22" r="2"/><path d="M11 11l4 4M21 11l-4 4M11 21l4-4M21 21l-4-4"/></svg>
            </div>
            <div className="w-20 h-20 rounded-full bg-[#cdf3eb] flex items-center justify-center">
              <svg viewBox="0 0 32 32" className="w-10 h-10 fill-none stroke-[#1a1a1a]" strokeWidth="1.5"><path d="M16 4c-3 0-5.5 2.5-5.5 5.5 0 2 .8 3.7 2 4.5l-.5 4 4-1 4 1-.5-4c1.2-.8 2-2.5 2-4.5C21.5 6.5 19 4 16 4z"/><path d="M14 24v3M18 24v3M13 28h6"/></svg>
            </div>
          </div>
          <h2 className="text-[16px] font-bold text-[#1a1a1a] mb-2">Comprende y rastrea de forma automática los temas de conversación</h2>
          <p className="text-[13.5px] text-[#646462] leading-[20px] mb-5">
            Accede a la información de los datos de tus conversaciones al descubrir o definir los temas que te interesan y rastréalos de forma automática.
          </p>
          <div className="flex items-center gap-3">
            <button className="bg-[#1a1a1a] text-white text-[13px] font-semibold rounded-full px-4 py-[7px] hover:bg-black">Crear tema</button>
            <button className="bg-white border border-[#e9eae6] text-[13px] font-semibold text-[#1a1a1a] rounded-full px-4 py-[7px] hover:bg-[#f5f5f4]">Más información</button>
          </div>
        </div>
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
        <span className="text-[12px] text-[#646462]">Propietario: <span className="text-[#1a1a1a]">Intercom</span></span>
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
          <span className="text-[12px] text-[#646462]">Propietario: <span className="text-[#1a1a1a]">Intercom</span></span>
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
  const { data, loading } = useApi(() => reportsApi.calls(period, channel), [period, channel], null);
  const kpis = data?.kpis ?? {};
  const timeSeries: { day: number; count: number }[] = data?.timeSeries ?? Array.from({ length: 30 }, (_, i) => ({ day: i, count: 0 }));
  const byDirection: { direction: string; count: number }[] = data?.byDirection ?? [];
  const maxBar = Math.max(...timeSeries.map(t => t.count), 1);
  const isEmpty = data?.isEmpty !== false;
  const days = timeSeries.length;

  return (
    <>
      <ReportShellHeader title="Calls" description="Use the Calls report to visualize and explore your team's calling activity." />
      <ReportShellFilters />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 grid grid-cols-3 gap-4">
        <ReportsKpiCard label="Inbound calls" value={loading ? '…' : String(kpis.inbound_calls ?? 0)} />
        <ReportsKpiCard label="Outbound calls" value={loading ? '…' : String(kpis.outbound_calls ?? 0)} />
        <ReportsKpiCard label="Messenger calls" value={loading ? '…' : String(kpis.messenger_calls ?? 0)} />
        <ReportsKpiCard label="Median call duration" value={kpis.median_call_duration ?? '—'} />
        <ReportsKpiCard label="Median call in queue time" value={kpis.median_queue_time ?? '—'} />
        <ReportsKpiCard label="Median call talk time" value={kpis.median_talk_time ?? '—'} />
        {/* Call volume time series */}
        <div className="col-span-3 border border-[#e9eae6] rounded-[10px] bg-white p-5">
          <div className="flex items-center gap-1 mb-3">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">Calls - by time</span>
          </div>
          {isEmpty ? (
            <div className="h-[160px] flex flex-col items-center justify-center text-center">
              <svg viewBox="0 0 16 16" className="w-7 h-7 fill-none stroke-[#646462] mb-2" strokeWidth="1.4"><path d="M11 2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h1l1-1h2l1 1z"/><path d="M8 7v4M8 6h.01"/></svg>
              <span className="text-[12.5px] text-[#1a1a1a] font-medium">Sin actividad de llamadas</span>
              <span className="text-[11.5px] text-[#646462] mt-0.5">Conecta un canal de voz para ver métricas de llamadas.</span>
            </div>
          ) : (
            <>
              <div className="h-[140px] flex items-end gap-0.5 px-2">
                {timeSeries.map((t, i) => (
                  <div key={i} style={{ height: t.count ? `${(t.count / maxBar) * 100}%` : '4px' }} className={`flex-1 ${t.count ? 'bg-[#3b59f6]' : 'bg-[#f3f3f1]'} rounded-t`} />
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-[#646462] mt-1 px-2">
                <span>Día 1</span><span>Día {Math.floor(days / 3)}</span><span>Día {Math.floor(2 * days / 3)}</span><span>Día {days}</span>
              </div>
            </>
          )}
        </div>
        {/* By direction donut */}
        <div className="col-span-3 grid grid-cols-2 gap-4">
          <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5">
            <div className="flex items-center gap-1 mb-3">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
              <span className="text-[12.5px] text-[#1a1a1a]">Calls - by direction</span>
            </div>
            {isEmpty || byDirection.length === 0 ? (
              <div className="h-[120px] flex items-center justify-center text-[12px] text-[#646462]">Sin datos de dirección</div>
            ) : (
              <div className="space-y-2 pt-2">
                {byDirection.map(d => {
                  const maxD = Math.max(...byDirection.map(x => x.count), 1);
                  const COLORS: Record<string, string> = { inbound: '#3b59f6', outbound: '#fc8a37', messenger: '#7c3aed' };
                  return (
                    <div key={d.direction} className="flex items-center gap-2">
                      <span className="text-[11px] text-[#646462] w-[70px] capitalize">{d.direction}</span>
                      <div className="flex-1 bg-[#f3f3f1] rounded-full h-2">
                        <div className="h-2 rounded-full" style={{ width: `${(d.count / maxD) * 100}%`, background: COLORS[d.direction] ?? '#3b59f6' }} />
                      </div>
                      <span className="text-[11px] text-[#1a1a1a] w-6 text-right">{d.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5">
            <div className="flex items-center gap-1 mb-3">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
              <span className="text-[12.5px] text-[#1a1a1a]">Inbound calls – by time and call state</span>
            </div>
            <div className="h-[80px] flex items-center justify-center text-[12px] text-[#646462]">
              Requiere datos de estado de llamada en tiempo real
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ReportsConversationsContent({ period, channel }: { period: string; channel: string }) {
  const { data, loading } = useApi(() => reportsApi.conversations(period, channel), [period, channel], null);
  const kpis = data?.kpis ?? {};
  const timeSeries: { day: number; count: number }[] = data?.timeSeries ?? Array.from({ length: 28 }, (_, i) => ({ day: i, count: 0 }));
  const byChannel: { channel: string; count: number }[] = data?.byChannel ?? [];
  const maxBar = Math.max(...timeSeries.map(t => t.count), 1);
  const CHANNEL_COLORS = ['#3b59f6', '#fc8a37', '#1e40af', '#7c3aed', '#16a34a', '#dc2626'];
  const totalByChannel = byChannel.reduce((s, c) => s + c.count, 1);
  let cumPct = 0;
  const channelGradientStops = byChannel.map((c, i) => {
    const pct = (c.count / totalByChannel) * 100;
    const start = cumPct;
    cumPct += pct;
    return `${CHANNEL_COLORS[i % CHANNEL_COLORS.length]} ${start}% ${cumPct}%`;
  });
  const donutGradient = channelGradientStops.length > 0
    ? `conic-gradient(${channelGradientStops.join(', ')})`
    : 'conic-gradient(#e9eae6 0 100%)';

  return (
    <>
      <ReportShellHeader title="Conversations" description="Track your new inbound conversations, busiest periods and biggest customer issues, etc." />
      <ReportShellFilters />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 grid grid-cols-4 gap-4">
        <ReportsKpiCard label="New conversations" value={loading ? '…' : String(kpis.new_conversations ?? '—')} delta={kpis.new_change && kpis.new_trend === 'up' ? kpis.new_change : undefined} />
        <ReportsKpiCard label="Conversations replied to" value={loading ? '…' : String(kpis.replied_conversations ?? '—')} />
        <ReportsKpiCard label="Closed conversations" value={loading ? '…' : String(kpis.closed_conversations ?? '—')} delta={kpis.closed_change && kpis.closed_trend === 'up' ? kpis.closed_change : undefined} />
        <ReportsKpiCard label="Open conversations" value={loading ? '…' : String(kpis.open_conversations ?? '—')} />
        {/* Time series bar chart */}
        <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5 col-span-4">
          <div className="flex items-center gap-1 mb-3">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">New conversations - by time</span>
          </div>
          <div className="h-[180px] flex items-end gap-1 px-3">
            {timeSeries.map((t, i) => (
              <div key={i} style={{ height: t.count ? `${(t.count / maxBar) * 100}%` : '4px' }} className={`flex-1 ${t.count ? 'bg-[#3b59f6]' : 'bg-[#f3f3f1]'} rounded-t`} />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-[#646462] mt-2 px-3">
            <span>Día 1</span><span>Día 7</span><span>Día 14</span><span>Día 21</span><span>Día 28</span>
          </div>
        </div>
        {/* By channel donut */}
        <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5 col-span-2">
          <div className="flex items-center gap-1 mb-3">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">New conversations - by channel</span>
          </div>
          {loading ? (
            <div className="h-[140px] flex items-center justify-center text-[12px] text-[#646462]">Cargando...</div>
          ) : byChannel.length === 0 ? (
            <div className="h-[140px] flex items-center justify-center text-[12px] text-[#646462]">Sin datos</div>
          ) : (
            <>
              <div className="h-[120px] flex items-center justify-center">
                <div className="relative w-[120px] h-[120px] rounded-full" style={{ background: donutGradient }}>
                  <div className="absolute inset-[18px] rounded-full bg-white" />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-2 text-[11px] text-[#646462]">
                {byChannel.slice(0, 4).map((c, i) => (
                  <span key={c.channel} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ background: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }} />
                    {c.channel} ({c.count})
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
        {/* By type bar */}
        <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5 col-span-2">
          <div className="flex items-center gap-1 mb-3">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">Conversaciones por tipo (top 5)</span>
          </div>
          {loading ? (
            <div className="h-[140px] flex items-center justify-center text-[12px] text-[#646462]">Cargando...</div>
          ) : (data?.byType ?? []).length === 0 ? (
            <div className="h-[140px] flex items-center justify-center text-[12px] text-[#646462]">Sin datos</div>
          ) : (
            <div className="space-y-2 pt-2">
              {(data?.byType ?? []).slice(0, 5).map((t: { type: string; count: number }) => {
                const maxCount = Math.max(...(data?.byType ?? []).map((x: any) => x.count), 1);
                return (
                  <div key={t.type} className="flex items-center gap-2">
                    <span className="text-[11px] text-[#646462] w-[100px] truncate">{t.type.replace(/_/g, ' ')}</span>
                    <div className="flex-1 bg-[#f3f3f1] rounded-full h-2">
                      <div className="bg-[#3b59f6] h-2 rounded-full" style={{ width: `${(t.count / maxCount) * 100}%` }} />
                    </div>
                    <span className="text-[11px] text-[#1a1a1a] w-6 text-right">{t.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ReportsCsatContent({ period, channel }: { period: string; channel: string }) {
  const { data, loading } = useApi(() => reportsApi.csat(period, channel), [period, channel], null);
  const kpis = data?.kpis ?? {};
  const csatTs: { day: number; avgScore: number; count: number }[] = data?.timeSeries ?? [];
  const csatBreakdown: { userId: string; name: string; avgCsat: number; count: number }[] = data?.teammateCsatBreakdown ?? [];
  const maxCsat = Math.max(...csatTs.map(t => t.avgScore ?? 0), 1);
  return (
    <>
      <ReportShellHeader title="Surveyed CSAT" description="See how your customer satisfaction scores and support channels, teammates, e..." />
      <ReportShellFilters />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 grid grid-cols-3 gap-4">
        <ReportsKpiCard label="Overall CSAT score" value={loading ? '…' : kpis.overall_csat != null ? `${kpis.overall_csat}%` : '—'} sub={`${kpis.positive_count ?? 0} de ${(kpis.positive_count ?? 0) + (kpis.neutral_count ?? 0) + (kpis.negative_count ?? 0)}`} />
        <ReportsKpiCard label="Teammate CSAT score" value={loading ? '…' : kpis.teammate_csat != null ? `${kpis.teammate_csat}%` : '—'} sub={kpis.teammate_csat_count ? `${kpis.teammate_csat_count} surveys` : '0 de 0'} />
        <ReportsKpiCard label="Fin Agent CSAT score" value={loading ? '…' : kpis.fin_csat != null ? `${kpis.fin_csat}%` : '—'} sub={kpis.fin_csat_count ? `${kpis.fin_csat_count} surveys` : '0 de 0'} />
        {/* CSAT score over time */}
        <div className="col-span-3 border border-[#e9eae6] rounded-[10px] bg-white p-5">
          <div className="flex items-center gap-1 mb-3">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">CSAT score over time (avg %)</span>
          </div>
          {csatTs.length === 0 || csatTs.every(t => t.count === 0) ? (
            <div className="h-[120px] flex items-center justify-center text-[12px] text-[#646462]">Sin encuestas CSAT en el período</div>
          ) : (
            <>
              <div className="h-[120px] flex items-end gap-0.5 px-2">
                {csatTs.map((t, i) => (
                  <div key={i} style={{ height: t.avgScore ? `${(t.avgScore / maxCsat) * 100}%` : '4px' }}
                    className={`flex-1 ${t.count > 0 ? 'bg-[#16a34a]' : 'bg-[#f3f3f1]'} rounded-t`}
                    title={t.count > 0 ? `${Math.round(t.avgScore)}% (${t.count} surveys)` : 'Sin datos'} />
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-[#646462] mt-1 px-2">
                <span>Día 1</span><span>Día {Math.round(csatTs.length / 2)}</span><span>Día {csatTs.length}</span>
              </div>
            </>
          )}
        </div>
        <h3 className="col-span-3 text-[14px] font-bold text-[#1a1a1a] mt-2">Conversation ratings and remarks</h3>
        <div className="col-span-3 grid grid-cols-2 gap-4">
          <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5">
            <div className="flex items-center gap-1 mb-3">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
              <span className="text-[12.5px] text-[#1a1a1a]">Conversation ratings – by channel</span>
            </div>
            <div className="h-[80px] flex items-center justify-center text-[12px] text-[#646462]">Sin desglose de canal disponible</div>
          </div>
          <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5">
            <div className="flex items-center gap-1 mb-3">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
              <span className="text-[12.5px] text-[#1a1a1a]">Conversation ratings – distribution</span>
            </div>
            <div className="space-y-2 pt-1">
              {[{ label: '😊 Positive', count: kpis.positive_count ?? 0, color: '#16a34a' }, { label: '😐 Neutral', count: kpis.neutral_count ?? 0, color: '#d97706' }, { label: '😞 Negative', count: kpis.negative_count ?? 0, color: '#dc2626' }].map(r => {
                const total = (kpis.positive_count ?? 0) + (kpis.neutral_count ?? 0) + (kpis.negative_count ?? 0);
                return (
                  <div key={r.label} className="flex items-center gap-2">
                    <span className="text-[11px] text-[#646462] w-[80px]">{r.label}</span>
                    <div className="flex-1 bg-[#f3f3f1] rounded-full h-2">
                      <div className="h-2 rounded-full" style={{ width: `${total > 0 ? (r.count / total) * 100 : 0}%`, background: r.color }} />
                    </div>
                    <span className="text-[11px] text-[#1a1a1a] w-6 text-right">{r.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <ReportsKpiCard label="Positive remarks" value={loading ? '…' : String(kpis.positive_count ?? 0)} />
        <ReportsKpiCard label="Neutral remarks" value={loading ? '…' : String(kpis.neutral_count ?? 0)} />
        <ReportsKpiCard label="Negative remarks" value={loading ? '…' : String(kpis.negative_count ?? 0)} />
        <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5 col-span-3">
          <div className="flex items-center gap-1 mb-3">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">Conversation ratings</span>
          </div>
          <div className="h-[140px] flex flex-col items-center justify-center">
            <svg viewBox="0 0 16 16" className="w-5 h-5 fill-none stroke-[#646462] mb-1" strokeWidth="1.4"><path d="M2 13V3M14 13H2M5 11V8M8 11V5M11 11V7"/></svg>
            <span className="text-[12px] text-[#1a1a1a]">No hay datos disponibles</span>
            <span className="text-[11px] text-[#646462] mt-0.5">Pruebe los filtros para refinar los datos</span>
          </div>
        </div>
        <h3 className="col-span-3 text-[14px] font-bold text-[#1a1a1a] mt-2">CSAT survey</h3>
        <ReportsKpiCard label="CSAT request rate" value={loading ? '…' : kpis.request_rate ?? '0%'} sub={loading ? undefined : `${kpis.survey_sent_count ?? 0} de ${kpis.closed_count ?? 0}`} />
        <ReportsKpiCard label="CSAT response rate" value={loading ? '…' : kpis.response_rate ?? '0%'} sub={loading ? undefined : `${kpis.survey_responded_count ?? 0} de ${kpis.survey_sent_count ?? 0}`} />
        <div className="col-span-1" />
        {/* CSAT survey rates over time — would need per-conversation survey tracking */}
        <div className="col-span-3 border border-[#e9eae6] rounded-[10px] bg-white p-5">
          <div className="flex items-center gap-1 mb-3">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">CSAT survey request & response rates – by time</span>
          </div>
          <div className="h-[80px] flex items-center justify-center text-[12px] text-[#646462]">
            Requiere seguimiento de envíos de encuesta por conversación
          </div>
        </div>
        <h3 className="col-span-3 text-[14px] font-bold text-[#1a1a1a] mt-2">Dissatisfaction drivers</h3>
        <div className="col-span-3 border border-[#e9eae6] rounded-[10px] bg-white p-5">
          <div className="flex items-center gap-1 mb-3">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">Topics driving dissatisfaction</span>
          </div>
          <div className="h-[80px] flex items-center justify-center text-[12px] text-[#646462]">
            Requiere análisis NLP de comentarios – sin datos disponibles
          </div>
        </div>
        <h3 className="col-span-3 text-[14px] font-bold text-[#1a1a1a] mt-2">Teammate performance</h3>
        <div className="border border-[#e9eae6] rounded-[10px] bg-white col-span-3 overflow-hidden">
          <div className="px-5 py-3 flex items-center gap-1">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">Teammate CSAT performance</span>
          </div>
          <div className="grid grid-cols-3 px-5 py-2 bg-[#fafaf9] border-t border-b border-[#e9eae6] text-[12px] text-[#646462]">
            <div>Compañero de equipo</div>
            <div>Avg CSAT</div>
            <div>Encuestas</div>
          </div>
          {loading ? (
            <div className="px-5 py-4 text-[12.5px] text-[#646462]">Cargando...</div>
          ) : csatBreakdown.length === 0 ? (
            <div className="h-[120px] flex flex-col items-center justify-center text-center">
              <svg viewBox="0 0 16 16" className="w-7 h-7 fill-none stroke-[#646462] mb-2" strokeWidth="1.4"><path d="M2 13V3M14 13H2M5 11V8M8 11V5M11 11V7"/></svg>
              <span className="text-[12.5px] text-[#1a1a1a]">Sin datos de CSAT por compañero</span>
              <span className="text-[11.5px] text-[#646462] mt-0.5">Los datos aparecen cuando se reciban encuestas CSAT respondidas.</span>
            </div>
          ) : csatBreakdown.map((row) => (
            <div key={row.userId} className="grid grid-cols-3 px-5 py-2.5 border-b border-[#f1f1ee] text-[12.5px] text-[#1a1a1a]">
              <div className="font-medium truncate">{row.name}</div>
              <div className={row.avgCsat >= 80 ? 'text-[#16a34a]' : row.avgCsat >= 60 ? 'text-[#d97706]' : 'text-[#dc2626]'}>
                {Math.round(row.avgCsat)}%
              </div>
              <div className="text-[#646462]">{row.count}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ReportsEffectivenessContent({ period, channel }: { period: string; channel: string }) {
  const { data, loading } = useApi(() => reportsApi.effectiveness(period, channel), [period, channel], null);
  const kpis = data?.kpis ?? {};
  const effTs: { day: number; fcr_rate: number }[] = data?.timeSeries ?? [];
  const maxFcr = Math.max(...effTs.map(t => t.fcr_rate ?? 0), 1);
  return (
    <>
      <ReportShellHeader title="Effectiveness" description="Measure how effectively your teams handle conversations with the Effectiveness report." />
      <ReportShellFilters />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 grid grid-cols-3 gap-4">
        <ReportsKpiCard label="Conversations replied to" value={loading ? '…' : String(kpis.conversations_replied_to ?? '—')} />
        <ReportsKpiCard label="Closed conversations on first contact rate" value={loading ? '…' : kpis.first_contact_resolution ?? '0%'} sub={kpis.first_contact_total != null ? `${kpis.first_contact_resolved ?? 0} de ${kpis.first_contact_total}` : undefined} />
        <ReportsKpiCard label="Median replies to close a conversation" value={loading ? '…' : (kpis.median_replies_to_close != null ? String(kpis.median_replies_to_close) : '—')} />
        <ReportsKpiCard label="Conversations reassigned" value={loading ? '…' : String(kpis.conversations_reassigned ?? 0)} />
        <ReportsKpiCard label="Median time to first assignment" value={loading ? '…' : kpis.median_time_to_first_assignment ?? '—'} />
        <ReportsKpiCard label="Median time from first assignment to close" value={loading ? '…' : kpis.median_time_from_assign_to_close ?? '—'} />
        {/* FCR time series chart */}
        <div className="col-span-3 border border-[#e9eae6] rounded-[10px] bg-white p-5">
          <div className="flex items-center gap-1 mb-3">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">First contact resolution rate – by day</span>
          </div>
          {effTs.length === 0 ? (
            <div className="h-[120px] flex items-center justify-center text-[12px] text-[#646462]">Sin datos en el período</div>
          ) : (
            <>
              <div className="h-[120px] flex items-end gap-0.5 px-2">
                {effTs.map((t, i) => (
                  <div key={i} style={{ height: t.fcr_rate ? `${(t.fcr_rate / maxFcr) * 100}%` : '4px' }} className={`flex-1 ${t.fcr_rate ? 'bg-[#3b59f6]' : 'bg-[#f3f3f1]'} rounded-t`} />
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-[#646462] mt-1 px-2">
                <span>Día 1</span><span>Día {Math.floor(effTs.length / 3)}</span><span>Día {Math.floor(2 * effTs.length / 3)}</span><span>Día {effTs.length}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ReportsResponsivenessContent({ period, channel }: { period: string; channel: string }) {
  const { data, loading } = useApi(() => reportsApi.responsiveness(period, channel), [period, channel], null);
  const kpis = data?.kpis ?? {};
  const dist: { bucket: string; count: number }[] = data?.distribution ?? [];
  const respTimeSeries: { day: number; avgMinutes: number }[] = data?.timeSeries ?? [];
  const maxRespMin = Math.max(...respTimeSeries.map(t => t.avgMinutes), 1);
  return (
    <>
      <ReportShellHeader title="Responsiveness" description="See how quickly your team respond to, and close conversations with the Responsiveness report." />
      <ReportShellFilters />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 grid grid-cols-3 gap-4">
        <ReportsKpiCard label="Median response time: including time assigned to bot" value={loading ? '…' : kpis.median_response_time ?? '—'} />
        <ReportsKpiCard label="Median first response time: including time assigned to bot" value={loading ? '…' : kpis.median_first_response ?? '—'} />
        <ReportsKpiCard label="Median time to close: including time assigned to bot" value={loading ? '…' : kpis.median_time_to_close ?? '—'} />
        {/* Response time by day */}
        {respTimeSeries.some(t => t.avgMinutes > 0) ? (
          <div className="col-span-3 border border-[#e9eae6] rounded-[10px] bg-white p-5">
            <div className="flex items-center gap-1 mb-3">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
              <span className="text-[12.5px] text-[#1a1a1a]">Avg first response time by day (minutes)</span>
            </div>
            <div className="h-[140px] flex items-end gap-0.5 px-2">
              {respTimeSeries.map((t, i) => (
                <div key={i} style={{ height: t.avgMinutes ? `${(t.avgMinutes / maxRespMin) * 100}%` : '4px' }} className={`flex-1 ${t.avgMinutes ? 'bg-[#3b59f6]' : 'bg-[#f3f3f1]'} rounded-t`} title={`${t.avgMinutes}m`} />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-[#646462] mt-2 px-2">
              <span>Día 1</span><span>Día {Math.round(respTimeSeries.length / 2)}</span><span>Día {respTimeSeries.length}</span>
            </div>
          </div>
        ) : (
          <ReportEmptyChart label="Median response time: including time assigned to bot - by time" span={3} />
        )}
        <div className="col-span-3 grid grid-cols-2 gap-4">
          <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5">
            <div className="flex items-center gap-1 mb-3">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
              <span className="text-[12.5px] text-[#1a1a1a]">Avg first response time by day (min)</span>
            </div>
            {respTimeSeries.some(t => t.avgMinutes > 0) ? (
              <>
                <div className="h-[120px] flex items-end gap-0.5 px-2">
                  {respTimeSeries.map((t, i) => (
                    <div key={i} style={{ height: t.avgMinutes ? `${(t.avgMinutes / maxRespMin) * 100}%` : '4px' }}
                      className={`flex-1 ${t.avgMinutes ? 'bg-[#3b59f6]' : 'bg-[#f3f3f1]'} rounded-t`} title={`${t.avgMinutes}m`} />
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-[#646462] mt-1 px-2">
                  <span>Día 1</span><span>Día {Math.round(respTimeSeries.length / 2)}</span><span>Día {respTimeSeries.length}</span>
                </div>
              </>
            ) : (
              <div className="h-[120px] flex items-center justify-center text-[12px] text-[#646462]">Sin datos en el período</div>
            )}
          </div>
          <div className="border border-[#e9eae6] rounded-[10px] bg-white overflow-hidden">
            <div className="px-5 py-3 flex items-center gap-1">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
              <span className="text-[12.5px] text-[#1a1a1a]">First response time: including time assigned to bot breakdown</span>
            </div>
            <div className="grid grid-cols-2 px-5 py-2 bg-[#fafaf9] border-t border-b border-[#e9eae6] text-[12px] text-[#646462]">
              <div>Intervalos de tiempo</div><div>% replies</div>
            </div>
            {(dist.length > 0 ? dist : ['< 5m','5m - 15m','15m - 30m','30m - 1h','1h - 3h','3h - 8h','> 8h'].map(b => ({ bucket: b, count: 0 }))).map((row: any) => {
              const total = dist.reduce((s: number, r: any) => s + (r.count || 0), 0);
              const pctVal = total > 0 && typeof row === 'object' ? `${Math.round((row.count / total) * 100)}%` : '—';
              const label = typeof row === 'string' ? row : row.bucket;
              return (
                <div key={label} className="grid grid-cols-2 px-5 py-2 border-b border-[#f1f1ee] text-[12.5px] text-[#1a1a1a]">
                  <div>{label}</div><div className="text-[#646462]">{loading ? '…' : pctVal}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="col-span-3 grid grid-cols-2 gap-4">
          <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5">
            <div className="flex items-center gap-1 mb-3">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
              <span className="text-[12.5px] text-[#1a1a1a]">Avg time to close by day (min)</span>
            </div>
            {respTimeSeries.some(t => t.avgMinutes > 0) ? (
              <>
                <div className="h-[120px] flex items-end gap-0.5 px-2">
                  {respTimeSeries.map((t, i) => (
                    <div key={i} style={{ height: t.avgMinutes ? `${(t.avgMinutes / maxRespMin) * 100}%` : '4px' }}
                      className={`flex-1 ${t.avgMinutes ? 'bg-[#8b5cf6]' : 'bg-[#f3f3f1]'} rounded-t`} title={`${t.avgMinutes}m`} />
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-[#646462] mt-1 px-2">
                  <span>Día 1</span><span>Día {Math.round(respTimeSeries.length / 2)}</span><span>Día {respTimeSeries.length}</span>
                </div>
              </>
            ) : (
              <div className="h-[120px] flex items-center justify-center text-[12px] text-[#646462]">Sin datos en el período</div>
            )}
          </div>
          <div className="border border-[#e9eae6] rounded-[10px] bg-white overflow-hidden">
            <div className="px-5 py-3 flex items-center gap-1">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
              <span className="text-[12.5px] text-[#1a1a1a]">Time to close: including time assigned to bot breakdown</span>
            </div>
            <div className="grid grid-cols-2 px-5 py-2 bg-[#fafaf9] border-t border-b border-[#e9eae6] text-[12px] text-[#646462]">
              <div>Intervalos de tiempo</div><div>% conversations</div>
            </div>
            {(dist.length > 0 ? dist : ['< 5m','5m - 15m','15m - 30m','30m - 1h','1h - 3h','3h - 8h','> 8h'].map(b => ({ bucket: b, count: 0 }))).map((row: any) => {
              const total = dist.reduce((s: number, r: any) => s + (r.count || 0), 0);
              const pctVal = total > 0 && typeof row === 'object' ? `${Math.round((row.count / total) * 100)}%` : '—';
              const label = typeof row === 'string' ? row : row.bucket;
              return (
                <div key={label} className="grid grid-cols-2 px-5 py-2 border-b border-[#f1f1ee] text-[12.5px] text-[#1a1a1a]">
                  <div>{label}</div><div className="text-[#646462]">{loading ? '…' : pctVal}</div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Hourly distribution — requires active-hours data; show placeholder */}
        <div className="col-span-3 border border-[#e9eae6] rounded-[10px] bg-white p-5">
          <div className="flex items-center gap-1 mb-3">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">Median hourly distribution of response times</span>
          </div>
          <div className="h-[80px] flex items-center justify-center text-[12px] text-[#646462]">
            Requires active-hours tracking — no data available
          </div>
        </div>
      </div>
    </>
  );
}

function ReportsSlasContent({ period, channel }: { period: string; channel: string }) {
  const { data, loading } = useApi(() => reportsApi.sla(period, channel), [period, channel], null);
  const distribution: { status: string; count: number }[] = data?.distribution ?? [];
  const byPriority: { priority: string; slaStatus: string; count: number }[] = data?.byPriority ?? [];
  const breachedByType: { type: string; count: number }[] = data?.breachedByType ?? [];
  const slaTimeSeries: { day: number; compliant: number; breached: number }[] = data?.timeSeries ?? [];
  const totalWithSla = distribution.reduce((s, d) => s + d.count, 0);
  const breachedCount = distribution.find(d => d.status === 'breached')?.count ?? 0;
  const compliantCount = distribution.find(d => d.status === 'compliant')?.count ?? 0;
  const missRate = totalWithSla > 0 ? `${Math.round((breachedCount / totalWithSla) * 100)}%` : '—';

  // Group byPriority into pivot table
  const priorities = [...new Set(byPriority.map(r => r.priority))].filter(Boolean);
  const slaStatuses = [...new Set(byPriority.map(r => r.slaStatus))].filter(Boolean);

  return (
    <>
      <ReportShellHeader title="SLAs" description="Review your team's performance against your Service Level Agreements with the SLAs report." />
      <ReportShellFilters extraFilter={{ icon: 'sla', label: 'SLA (Acuerdo de nivel de servicio) es Cualquiera' }} />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 grid grid-cols-3 gap-4">
        <ReportsKpiCard label="Conversation and ticket SLA miss rate" value={loading ? '…' : missRate} sub={`${breachedCount} de ${totalWithSla}`} />
        <ReportsKpiCard label="Conversations and tickets with SLA" value={loading ? '…' : String(totalWithSla)} />
        <ReportsKpiCard label="Conversations and tickets with missed SLA" value={loading ? '…' : String(breachedCount)} />
        {/* Distribution summary */}
        <div className="border border-[#e9eae6] rounded-[10px] bg-white col-span-3 overflow-hidden">
          <div className="px-5 py-3 flex items-center gap-1">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">SLA performance</span>
          </div>
          <div className="grid grid-cols-4 px-5 py-2 bg-[#fafaf9] border-t border-b border-[#e9eae6] text-[12px] text-[#646462]">
            <div>Estado SLA</div>
            <div>Casos</div>
            <div>% del total</div>
            <div>Tendencia</div>
          </div>
          {loading ? (
            <div className="px-5 py-4 text-[12.5px] text-[#646462]">Cargando...</div>
          ) : distribution.length === 0 ? (
            <div className="px-5 py-4 text-[12.5px] text-[#646462]">Sin datos SLA en el período</div>
          ) : distribution.map(d => (
            <div key={d.status} className="grid grid-cols-4 px-5 py-2.5 border-b border-[#f1f1ee] text-[12.5px] text-[#1a1a1a]">
              <div className="capitalize">{d.status}</div>
              <div>{d.count}</div>
              <div className="text-[#646462]">{totalWithSla > 0 ? `${Math.round((d.count / totalWithSla) * 100)}%` : '—'}</div>
              <div className="text-[#646462]">—</div>
            </div>
          ))}
          {/* Compliant summary row */}
          {distribution.length > 0 && (
            <div className="grid grid-cols-4 px-5 py-2.5 border-b border-[#f1f1ee] bg-[#f8f8f7] text-[12.5px] font-medium text-[#1a1a1a]">
              <div>Total</div>
              <div>{totalWithSla}</div>
              <div>100%</div>
              <div className={compliantCount > breachedCount ? 'text-[#16a34a]' : 'text-[#dc2626]'}>{missRate} miss rate</div>
            </div>
          )}
        </div>
        {/* By priority table */}
        {byPriority.length > 0 && (
          <div className="border border-[#e9eae6] rounded-[10px] bg-white col-span-3 overflow-hidden">
            <div className="px-5 py-3 flex items-center gap-1">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
              <span className="text-[12.5px] text-[#1a1a1a]">SLA por prioridad</span>
            </div>
            <div className={`grid px-5 py-2 bg-[#fafaf9] border-t border-b border-[#e9eae6] text-[12px] text-[#646462]`} style={{ gridTemplateColumns: `repeat(${1 + slaStatuses.length}, minmax(0,1fr))` }}>
              <div>Prioridad</div>
              {slaStatuses.map(s => <div key={s} className="capitalize">{s}</div>)}
            </div>
            {priorities.map(priority => (
              <div key={priority} className={`grid px-5 py-2.5 border-b border-[#f1f1ee] text-[12.5px] text-[#1a1a1a]`} style={{ gridTemplateColumns: `repeat(${1 + slaStatuses.length}, minmax(0,1fr))` }}>
                <div className="capitalize">{priority ?? 'Sin prioridad'}</div>
                {slaStatuses.map(s => {
                  const found = byPriority.find(r => r.priority === priority && r.slaStatus === s);
                  return <div key={s} className="text-[#646462]">{found?.count ?? 0}</div>;
                })}
              </div>
            ))}
          </div>
        )}
        {/* Breached by type */}
        {breachedByType.length > 0 && (
          <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5 col-span-3">
            <div className="flex items-center gap-1 mb-3">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
              <span className="text-[12.5px] text-[#1a1a1a]">SLA incumplidos por tipo de caso</span>
            </div>
            <div className="space-y-2">
              {breachedByType.slice(0, 8).map(t => {
                const maxCount = Math.max(...breachedByType.map(x => x.count), 1);
                return (
                  <div key={t.type} className="flex items-center gap-2">
                    <span className="text-[11px] text-[#646462] w-[120px] truncate">{t.type.replace(/_/g, ' ')}</span>
                    <div className="flex-1 bg-[#fee2e2] rounded-full h-2">
                      <div className="bg-[#dc2626] h-2 rounded-full" style={{ width: `${(t.count / maxCount) * 100}%` }} />
                    </div>
                    <span className="text-[11px] text-[#1a1a1a] w-6 text-right">{t.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* SLA targets hit over time */}
        {slaTimeSeries.some(t => t.compliant > 0 || t.breached > 0) ? (
          <div className="col-span-3 border border-[#e9eae6] rounded-[10px] bg-white p-5">
            <div className="flex items-center gap-1 mb-3">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
              <span className="text-[12.5px] text-[#1a1a1a]">Targets hit over time</span>
              <span className="ml-auto flex items-center gap-3 text-[11px] text-[#646462]">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#16a34a] inline-block" />Compliant</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#dc2626] inline-block" />Breached</span>
              </span>
            </div>
            <div className="h-[140px] flex items-end gap-0.5 px-2">
              {slaTimeSeries.map((t, i) => {
                const total = t.compliant + t.breached;
                const maxH = Math.max(...slaTimeSeries.map(x => x.compliant + x.breached), 1);
                return (
                  <div key={i} className="flex-1 flex flex-col-reverse" style={{ height: total ? `${(total / maxH) * 100}%` : '4px' }}>
                    {total > 0 ? (
                      <>
                        <div style={{ height: `${(t.compliant / total) * 100}%` }} className="bg-[#16a34a] rounded-t-sm w-full" />
                        <div style={{ height: `${(t.breached / total) * 100}%` }} className="bg-[#dc2626] w-full" />
                      </>
                    ) : (
                      <div className="bg-[#f3f3f1] w-full h-full rounded-t" />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-[#646462] mt-2 px-2">
              <span>Día 1</span><span>Día {Math.round(slaTimeSeries.length / 2)}</span><span>Día {slaTimeSeries.length}</span>
            </div>
          </div>
        ) : (
          <ReportEmptyChart label="Targets hit over time" span={3} />
        )}
      </div>
    </>
  );
}

function ReportsTeamInboxContent({ period, channel }: { period: string; channel: string }) {
  const { data, loading } = useApi(() => reportsApi.teamInbox(period, channel), [period, channel], null);
  const kpis = data?.kpis ?? {};
  const inboxBreakdown: { inbox: string; assigned: number; replied: number; closed: number; medianClose: string }[] = data?.inboxBreakdown ?? [];
  const inboxTimeSeries: { day: number; count: number }[] = data?.timeSeries ?? [];
  const maxInboxTs = Math.max(...inboxTimeSeries.map(t => t.count), 1);
  const isEmpty = data?.isEmpty !== false;

  return (
    <>
      <ReportShellHeader title="Team inbox performance" description="Check in on how each team inbox is performing with accurate metrics and insights." />
      <ReportShellFilters extraFilter={{ icon: 'team', label: 'Equipo es Cualquiera' }} />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 grid grid-cols-3 gap-4">
        <ReportsKpiCard label="Median team assignment to first response" value={kpis.median_assign_to_first_response ?? '—'} />
        <ReportsKpiCard label="Median team assignment to subsequent response" value={kpis.median_assign_to_subsequent_response ?? '—'} />
        <ReportsKpiCard label="Median team assignment to close" value={loading ? '…' : kpis.median_assign_to_close ?? '—'} />
        <ReportsKpiCard label="Conversations assigned" value={loading ? '…' : String(kpis.conversations_assigned ?? 0)} />
        <ReportsKpiCard label="Conversations replied to" value={loading ? '…' : String(kpis.conversations_replied ?? 0)} />
        <ReportsKpiCard label="Closed conversations" value={loading ? '…' : String(kpis.closed_conversations ?? 0)} />
        {/* Inbox breakdown table */}
        <div className="col-span-3 border border-[#e9eae6] rounded-[10px] bg-white overflow-hidden">
          <div className="px-5 py-3 flex items-center gap-1">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">Comparison of Team inbox performance</span>
          </div>
          <div className="grid grid-cols-5 px-5 py-2 bg-[#fafaf9] border-t border-b border-[#e9eae6] text-[12px] text-[#646462]">
            <div>Inbox / Assignee</div>
            <div>Assigned</div>
            <div>Replied</div>
            <div>Closed</div>
            <div>Median close time</div>
          </div>
          {loading ? (
            <div className="px-5 py-4 text-[12.5px] text-[#646462]">Cargando...</div>
          ) : isEmpty || inboxBreakdown.length === 0 ? (
            <div className="h-[120px] flex flex-col items-center justify-center text-center">
              <svg viewBox="0 0 16 16" className="w-7 h-7 fill-none stroke-[#646462] mb-2" strokeWidth="1.4"><path d="M2 13V3M14 13H2M5 11V8M8 11V5M11 11V7"/></svg>
              <span className="text-[12.5px] text-[#1a1a1a]">Sin datos de inbox por equipo</span>
              <span className="text-[11.5px] text-[#646462] mt-0.5">Asigna conversaciones a agentes para ver métricas aquí.</span>
            </div>
          ) : inboxBreakdown.map((row, i) => (
            <div key={i} className="grid grid-cols-5 px-5 py-2.5 border-b border-[#f1f1ee] text-[12.5px] text-[#1a1a1a]">
              <div className="font-medium truncate">{row.inbox}</div>
              <div>{row.assigned}</div>
              <div>{row.replied}</div>
              <div>{row.closed}</div>
              <div className="text-[#646462]">{row.medianClose}</div>
            </div>
          ))}
        </div>
        {/* Team activity over time */}
        <div className="col-span-3 border border-[#e9eae6] rounded-[10px] bg-white p-5">
          <div className="flex items-center gap-1 mb-3">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">Team inbox activity – conversations per day</span>
          </div>
          {inboxTimeSeries.length === 0 || inboxTimeSeries.every(t => t.count === 0) ? (
            <div className="h-[120px] flex items-center justify-center text-[12px] text-[#646462]">Sin actividad en el período</div>
          ) : (
            <>
              <div className="h-[120px] flex items-end gap-0.5 px-2">
                {inboxTimeSeries.map((t, i) => (
                  <div key={i} style={{ height: t.count ? `${(t.count / maxInboxTs) * 100}%` : '4px' }}
                    className={`flex-1 ${t.count ? 'bg-[#3b59f6]' : 'bg-[#f3f3f1]'} rounded-t`}
                    title={`${t.count} conversaciones`} />
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-[#646462] mt-1 px-2">
                <span>Día 1</span><span>Día {Math.round(inboxTimeSeries.length / 2)}</span><span>Día {inboxTimeSeries.length}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ReportsTeammateContent({ period, channel }: { period: string; channel: string }) {
  const { data, loading } = useApi(() => reportsApi.teammate(period, channel), [period, channel], null);
  const members: any[] = data?.members ?? [];
  const isEmpty = data?.isEmpty !== false || members.length === 0;
  const teamTimeSeries: { day: number; count: number }[] = data?.teamTimeSeries ?? [];
  const maxTts = Math.max(...teamTimeSeries.map(t => t.count), 1);

  // Aggregate KPIs — prefer backend-computed values, fall back to client-side median
  const handleTimes = members.filter((m: any) => m.medianHandleTime).map((m: any) => m.medianHandleTime as string);
  const aggHandleTime = handleTimes.length > 0 ? handleTimes[Math.floor(handleTimes.length / 2)] : null;
  const assignToCloseTimes = members.filter((m: any) => m.medianAssignToClose).map((m: any) => m.medianAssignToClose as string);
  const aggAssignToClose = assignToCloseTimes.length > 0 ? assignToCloseTimes[Math.floor(assignToCloseTimes.length / 2)] : null;
  const assignToFirstRespTimes = members.filter((m: any) => m.medianAssignToFirstResp).map((m: any) => m.medianAssignToFirstResp as string);
  const aggAssignToFirstResp = assignToFirstRespTimes.length > 0 ? assignToFirstRespTimes[Math.floor(assignToFirstRespTimes.length / 2)] : null;
  // Subsequent response — use backend aggregate
  const aggSubsequentResp: string | null = data?.aggMedianSubsequentResp ?? null;
  // Per-active-hour — from backend totals
  const closedPerHour: number | null = data?.closedPerActiveHour ?? null;
  const assignedPerHour: number | null = data?.assignedPerActiveHour ?? null;
  const repliedPerHour: number | null = data?.repliedPerActiveHour ?? null;
  const totalActiveHours: number = data?.totalActiveHours ?? 0;

  const csatScores = members.filter((m: any) => m.avgCsat).map((m: any) => Number.parseFloat(String(m.avgCsat).replace('%', '')));
  const aggTeammateCsat = csatScores.length > 0 ? `${Math.round(csatScores.reduce((s, v) => s + v, 0) / csatScores.length)}%` : null;

  const fmtRate = (r: number | null) => r !== null ? String(r) : '—';
  const activeHoursSub = totalActiveHours > 0 ? `${totalActiveHours}h activas totales` : undefined;

  return (
    <>
      <ReportShellHeader title="Teammate performance" description="Check in on teammate performance with accurate metrics and insights." />
      <ReportShellFilters extraFilter={{ icon: 'user', label: 'Compañero de equipo es Cualquiera' }} />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 grid grid-cols-3 gap-4">
        <div className="col-span-2"><ReportsKpiCard label="Median teammate handling time" value={loading ? '…' : aggHandleTime ?? '—'} /></div>
        <ReportsKpiCard label="Median teammate assignment to close" value={loading ? '…' : aggAssignToClose ?? '—'} />
        <ReportsKpiCard label="Median teammate assignment to first response" value={loading ? '…' : aggAssignToFirstResp ?? '—'} />
        <ReportsKpiCard label="Median teammate assignment to subsequent response" value={loading ? '…' : aggSubsequentResp ?? '—'} />
        <ReportsKpiCard label="Conversations closed per active hour" value={loading ? '…' : fmtRate(closedPerHour)} sub={activeHoursSub} />
        <ReportsKpiCard label="Conversations assigned per active hour" value={loading ? '…' : fmtRate(assignedPerHour)} sub={activeHoursSub} />
        <ReportsKpiCard label="Conversations replied to per active hour" value={loading ? '…' : fmtRate(repliedPerHour)} sub={activeHoursSub} />
        <div className="col-span-1" />
        {/* Teammate productivity chart — cases closed per day */}
        <div className="col-span-3 border border-[#e9eae6] rounded-[10px] bg-white p-5">
          <div className="flex items-center gap-1 mb-3">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">Teammate Productivity – cases closed per day</span>
          </div>
          {teamTimeSeries.length === 0 || teamTimeSeries.every(t => t.count === 0) ? (
            <div className="h-[100px] flex items-center justify-center text-[12px] text-[#646462]">Sin actividad en el período</div>
          ) : (
            <>
              <div className="h-[100px] flex items-end gap-0.5 px-2">
                {teamTimeSeries.map((t, i) => (
                  <div key={i} style={{ height: t.count ? `${(t.count / maxTts) * 100}%` : '3px' }} className={`flex-1 ${t.count ? 'bg-[#3b59f6]' : 'bg-[#f3f3f1]'} rounded-t`} />
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-[#646462] mt-1 px-2">
                <span>Día 1</span><span>Día {Math.floor(teamTimeSeries.length / 2)}</span><span>Día {teamTimeSeries.length}</span>
              </div>
            </>
          )}
        </div>
        <ReportsKpiCard label="Teammate CSAT score" value={loading ? '…' : aggTeammateCsat ?? '—'} sub={csatScores.length > 0 ? `${csatScores.length} compañeros con datos` : '0 de 0'} />
        <div className="col-span-2 border border-[#e9eae6] rounded-[10px] bg-white p-5">
          <div className="flex items-center gap-1 mb-3">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">Teammate conversation ratings</span>
          </div>
          <div className="space-y-2 pt-1">
            {(['positive','neutral','negative'] as const).map(sentiment => {
              const counts = members.map((m: any) => {
                const s = Number.parseFloat(String(m.avgCsat ?? '0').replace('%',''));
                return sentiment === 'positive' ? (s >= 80 ? 1 : 0) : sentiment === 'neutral' ? (s >= 60 && s < 80 ? 1 : 0) : (s < 60 && s > 0 ? 1 : 0);
              });
              const count = counts.reduce((a: number, b: number) => a + b, 0);
              const colors: Record<string,string> = { positive: '#16a34a', neutral: '#d97706', negative: '#dc2626' };
              const labels: Record<string,string> = { positive: '😊 Positivo', neutral: '😐 Neutral', negative: '😞 Negativo' };
              return (
                <div key={sentiment} className="flex items-center gap-2">
                  <span className="text-[11px] text-[#646462] w-[80px]">{labels[sentiment]}</span>
                  <div className="flex-1 bg-[#f3f3f1] rounded-full h-2">
                    <div className="h-2 rounded-full" style={{ width: members.length > 0 ? `${(count / members.length) * 100}%` : '0%', background: colors[sentiment] }} />
                  </div>
                  <span className="text-[11px] text-[#1a1a1a] w-5 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="border border-[#e9eae6] rounded-[10px] bg-white col-span-3 overflow-hidden">
          <div className="px-5 py-3 flex items-center gap-1">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">Comparison of Teammate performance</span>
          </div>
          <div className="grid grid-cols-8 px-5 py-2 bg-[#fafaf9] border-t border-b border-[#e9eae6] text-[12px] text-[#646462]">
            <div className="col-span-2">Compañero de equipo</div>
            <div>Rol</div>
            <div>Asignados</div>
            <div>Respondidos</div>
            <div>Cerrados</div>
            <div>T. gestión</div>
            <div>CSAT</div>
          </div>
          {loading ? (
            <div className="px-5 py-4 text-[12.5px] text-[#646462]">Cargando...</div>
          ) : isEmpty ? (
            <div className="px-5 py-4 text-[12.5px] text-[#646462]">No hay miembros activos en el workspace. Añade agentes en workspace_members para ver datos aquí.</div>
          ) : members.map((m: any, i: number) => (
            <div key={i} className="grid grid-cols-8 px-5 py-2.5 border-b border-[#f1f1ee] text-[12.5px] text-[#1a1a1a] hover:bg-[#fafaf9]">
              <div className="col-span-2 font-medium truncate">{m.name ?? m.userId ?? 'Miembro'}{m.team ? <span className="ml-1 text-[11px] text-[#646462]">· {m.team}</span> : null}</div>
              <div className="text-[#646462] capitalize">{m.role ?? '—'}</div>
              <div>{m.casesAssigned ?? 0}</div>
              <div>{m.casesReplied ?? 0}</div>
              <div>{m.casesClosed ?? 0}</div>
              <div className="text-[#646462]">{m.medianHandleTime ?? '—'}</div>
              <div className={m.avgCsat ? (Number.parseFloat(String(m.avgCsat)) >= 80 ? 'text-[#16a34a]' : Number.parseFloat(String(m.avgCsat)) >= 60 ? 'text-[#d97706]' : 'text-[#dc2626]') : 'text-[#646462]'}>{m.avgCsat ?? '—'}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ReportsTicketsContent({ period, channel }: { period: string; channel: string }) {
  const { data, loading } = useApi(() => reportsApi.tickets(period, channel), [period, channel], null);
  const kpis = data?.kpis ?? {};
  const byType: { type: string; count: number }[] = data?.byType ?? [];
  const byAssignee: { assignee: string; count: number }[] = data?.byAssignee ?? [];
  const timeSeries: { day: number; count: number }[] = data?.timeSeries ?? Array.from({ length: 28 }, (_, i) => ({ day: i, count: 0 }));
  const maxBar = Math.max(...timeSeries.map(t => t.count), 1);
  const maxType = Math.max(...byType.map(t => t.count), 1);
  return (
    <>
      <ReportShellHeader title="Tickets" description="Explore your tickets report and create your own custom reports using ticket data." />
      <ReportShellFilters extraFilter={{ icon: 'ticket', label: 'El tipo de ticket es Cualquiera' }} />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 grid grid-cols-4 gap-4">
        <ReportsKpiCard label="Median ticket time to resolve" value={loading ? '…' : kpis.median_resolution ?? '—'} />
        <ReportsKpiCard label="Median ticket time in submitted" value={loading ? '…' : kpis.median_time_submitted ?? '—'} />
        <ReportsKpiCard label="Median ticket time in progress" value={loading ? '…' : kpis.median_time_in_progress ?? '—'} />
        <ReportsKpiCard label="Median ticket time in waiting on customer" value={loading ? '…' : kpis.median_time_waiting ?? '—'} />
        <div className="col-span-2"><ReportsKpiCard label="New tickets" value={loading ? '…' : String(kpis.new_tickets ?? 0)} /></div>
        <div className="col-span-2"><ReportsKpiCard label="Resolved tickets" value={loading ? '…' : String(kpis.resolved_tickets ?? 0)} /></div>
        {/* time series */}
        <div className="col-span-4 border border-[#e9eae6] rounded-[10px] bg-white p-5">
          <div className="flex items-center gap-1 mb-3">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">Nuevos tickets por día</span>
          </div>
          <div className="h-[140px] flex items-end gap-1 px-3">
            {timeSeries.map((t, i) => (
              <div key={i} style={{ height: t.count ? `${(t.count / maxBar) * 100}%` : '4px' }} className={`flex-1 ${t.count ? 'bg-[#3b59f6]' : 'bg-[#f3f3f1]'} rounded-t`} />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-[#646462] mt-2 px-3">
            <span>Día 1</span><span>Día 7</span><span>Día 14</span><span>Día 21</span><span>Día 28</span>
          </div>
        </div>
        {/* by type */}
        {byType.length > 0 ? (
          <div className="col-span-4 border border-[#e9eae6] rounded-[10px] bg-white p-5">
            <div className="flex items-center gap-1 mb-3">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
              <span className="text-[12.5px] text-[#1a1a1a]">Tickets por tipo</span>
            </div>
            <div className="space-y-2">
              {byType.map(t => (
                <div key={t.type} className="flex items-center gap-2">
                  <span className="text-[11px] text-[#646462] w-[120px] truncate">{t.type.replace(/_/g, ' ')}</span>
                  <div className="flex-1 bg-[#f3f3f1] rounded-full h-2">
                    <div className="bg-[#3b59f6] h-2 rounded-full" style={{ width: `${(t.count / maxType) * 100}%` }} />
                  </div>
                  <span className="text-[11px] text-[#1a1a1a] w-6 text-right">{t.count}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="col-span-4"><ReportEmptyChart label="Ticket volume - by type" span={3} /></div>
        )}
        {/* by team assigned — always empty since team routing is not tracked */}
        <div className="col-span-2 border border-[#e9eae6] rounded-[10px] bg-white p-5">
          <div className="flex items-center gap-1 mb-3">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">Tickets por equipo asignado</span>
          </div>
          <div className="h-[80px] flex items-center justify-center text-[12px] text-[#646462]">Sin datos de asignación por equipo</div>
        </div>
        {/* by teammate assigned */}
        <div className="col-span-2 border border-[#e9eae6] rounded-[10px] bg-white p-5">
          <div className="flex items-center gap-1 mb-3">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">Tickets por compañero asignado</span>
          </div>
          {byAssignee.length === 0 ? (
            <div className="h-[80px] flex items-center justify-center text-[12px] text-[#646462]">Sin asignaciones en el período</div>
          ) : (
            <div className="space-y-1.5">
              {byAssignee.slice(0, 6).map(a => {
                const maxA = Math.max(...byAssignee.map(x => x.count), 1);
                return (
                  <div key={a.assignee} className="flex items-center gap-2">
                    <span className="text-[11px] text-[#646462] w-[90px] truncate">{a.assignee}</span>
                    <div className="flex-1 bg-[#f3f3f1] rounded-full h-2">
                      <div className="bg-[#3b59f6] h-2 rounded-full" style={{ width: `${(a.count / maxA) * 100}%` }} />
                    </div>
                    <span className="text-[11px] text-[#1a1a1a] w-5 text-right">{a.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ReportsFinAgentContent({ period, channel }: { period: string; channel: string }) {
  const { data, loading } = useApi(() => reportsApi.finagent(period, channel), [period, channel], null);
  const kpis = data?.kpis ?? {};
  const agents: any[] = data?.agentBreakdown ?? [];
  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="min-w-0 flex-1">
          <h1 className="text-[18px] font-bold text-[#1a1a1a] truncate">Fin AI Agent</h1>
          <p className="text-[12.5px] text-[#646462] mt-0.5 truncate">Métricas de resolución, calidad y volumen del agente Fin.</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[12px] text-[#646462]">Propietario: <span className="text-[#1a1a1a]">Clain</span></span>
          <button className="flex items-center gap-1 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[12.5px] font-medium text-[#1a1a1a] hover:bg-[#f5f5f4]">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><path d="M8 1v10M4 7l4 4 4-4M2 13h12"/></svg>
            Compartir
          </button>
        </div>
      </div>
      <div className="px-6 py-3 border-b border-[#e9eae6] flex items-center gap-2 flex-shrink-0 flex-wrap">
        <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[12.5px] font-medium text-[#1a1a1a]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5 2v3M11 2v3"/></svg>
          Período: {period}
          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-[#646462]"><path d="M4 6l4 4 4-4z"/></svg>
        </button>
        <div className="ml-auto flex items-center gap-1 text-[12px] text-[#646462]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v3l2 1.5"/></svg>
          Madrid time (GMT+2)
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 p-6 grid grid-cols-3 gap-4">
        {/* KPI Cards */}
        <ReportsKpiCard label="Tasa de auto-resolución IA" value={loading ? '…' : kpis.auto_resolution_rate ?? '—'} delta={kpis.auto_resolution_change && kpis.auto_resolution_change !== '0%' ? kpis.auto_resolution_change : undefined} />
        <ReportsKpiCard label="Casos resueltos por IA" value={loading ? '…' : String(kpis.cases_resolved_by_ai ?? 0)} />
        <ReportsKpiCard label="Total casos IA" value={loading ? '…' : String(kpis.total_ai_cases ?? '—')} />
        <ReportsKpiCard label="Avg. tasa de éxito agentes" value={loading ? '…' : kpis.avg_agent_success_rate ?? '—'} />
        <ReportsKpiCard label="Tokens totales usados" value={loading ? '…' : Number(kpis.total_tokens ?? 0).toLocaleString()} />
        <ReportsKpiCard label="Créditos consumidos" value={loading ? '…' : String(kpis.credits_used ?? 0)} />
        {/* Agent breakdown table */}
        <div className="border border-[#e9eae6] rounded-[10px] bg-white col-span-3 overflow-hidden">
          <div className="px-5 py-3 flex items-center gap-1">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">Agentes de IA — rendimiento</span>
          </div>
          <div className="grid grid-cols-5 px-5 py-2 bg-[#fafaf9] border-t border-b border-[#e9eae6] text-[12px] text-[#646462]">
            <div>Agente</div>
            <div>Ejecuciones</div>
            <div>Tasa de éxito</div>
            <div>Tokens</div>
            <div>Créditos</div>
          </div>
          {loading ? (
            <div className="px-5 py-4 text-[12.5px] text-[#646462]">Cargando...</div>
          ) : agents.length === 0 ? (
            <div className="px-5 py-4 text-[12.5px] text-[#646462]">No hay agentes configurados para este período.</div>
          ) : agents.map((a, i) => (
            <div key={i} className="grid grid-cols-5 px-5 py-2.5 border-b border-[#f1f1ee] text-[12.5px] text-[#1a1a1a]">
              <div className="font-medium">{a.name ?? a.slug ?? 'Agente'}</div>
              <div>{a.totalRuns ?? 0}</div>
              <div className={Number.parseFloat(String(a.successRate).replace('%', '') || '0') >= 80 ? 'text-[#16a34a]' : 'text-[#dc2626]'}>
                {a.successRate ?? '—'}
              </div>
              <div className="text-[#646462]">{Number(a.tokensUsed ?? 0).toLocaleString()}</div>
              <div className="text-[#646462]">{a.costCredits ?? 0}</div>
            </div>
          ))}
        </div>
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
  const { data, loading } = useApi(() => reportsApi.articles(period, channel), [period, channel], null);
  const kpis = data?.kpis ?? {};
  const topArticles: { title: string; views: number; helpful: number; unhelpful: number; deflected: number }[] = data?.topArticles ?? [];
  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.5"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M5 6h6M5 8h6M5 10h4"/></svg>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Artículo</h1>
          <span className="text-[12px] text-[#646462]">Anterior</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <a className="text-[12.5px] font-medium text-[#3b59f6] flex items-center gap-1">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.4"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5.5 7h5M5.5 10h3"/></svg>
            ¿Cómo se elabora este informe?
          </a>
          <button className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#ededea]"><svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#646462]" strokeWidth="1.4"><path d="M8 13S2 9.5 2 5.5C2 3.5 3.5 2 5.5 2c1.2 0 2 .7 2.5 1.5C8.5 2.7 9.3 2 10.5 2 12.5 2 14 3.5 14 5.5 14 9.5 8 13 8 13z"/></svg></button>
        </div>
      </div>
      <div className="px-6 py-3 border-b border-[#e9eae6] flex items-center gap-2 flex-wrap flex-shrink-0">
        <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[12.5px] font-medium text-[#1a1a1a]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5 2v3M11 2v3"/></svg>
          Período: {period}
        </button>
        <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[12.5px] font-medium text-[#1a1a1a]">
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="6" r="2.5"/><path d="M3 13c0-2 2.5-3 5-3s5 1 5 3"/></svg>
          visitantes, Leads y Usuarios
        </button>
        <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[12.5px] font-medium text-[#1a1a1a]">Centro de ayuda y Messenger</button>
        <button className="flex items-center gap-1.5 border border-[#e9eae6] rounded-full px-3 py-[6px] text-[12.5px] font-medium text-[#1a1a1a]">Todos los centros de ayuda</button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <ReportsKpiCard label="Total artículos" value={loading ? '…' : String(kpis.total_articles ?? 0)} />
          <ReportsKpiCard label="Artículos publicados" value={loading ? '…' : String(kpis.published_articles ?? 0)} />
          <ReportsKpiCard label="Borradores" value={loading ? '…' : String(kpis.draft_articles ?? 0)} />
          <ReportsKpiCard label="Visualizaciones" value={loading ? '…' : String(kpis.view_count_total ?? 0)} />
          <ReportsKpiCard label="Búsquedas totales" value={loading ? '…' : String(kpis.search_hits_total ?? 0)} />
          <ReportsKpiCard label="Tasa de utilidad" value={loading ? '…' : (kpis.helpfulness_rate ?? '0%')} sub={kpis.helpful_total != null ? `${kpis.helpful_total} útil / ${kpis.unhelpful_total ?? 0} no útil` : undefined} />
          <ReportsKpiCard label="Conversaciones desviadas" value={loading ? '…' : String(kpis.deflected_total ?? 0)} />
        </div>
        <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
              <span className="text-[12.5px] text-[#1a1a1a]">Personas vs visualizaciones de tiempo</span>
            </div>
            <button className="w-6 h-6 rounded-full hover:bg-[#ededea] flex items-center justify-center text-[#646462]">⋯</button>
          </div>
          <div className="h-[200px] flex flex-col items-center justify-center text-center">
            <svg viewBox="0 0 16 16" className="w-7 h-7 fill-none stroke-[#646462] mb-2" strokeWidth="1.4"><path d="M2 13V3M14 13H2M5 11V8M8 11V5M11 11V7"/></svg>
            <span className="text-[13px] font-medium text-[#1a1a1a]">No hay datos para mostrar</span>
            <span className="text-[12px] text-[#646462] mt-1">Intenta cambiar los filtros en la parte superior de la página</span>
          </div>
        </div>
        <div className="border border-[#e9eae6] rounded-[10px] bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-1">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
              <span className="text-[12.5px] text-[#1a1a1a]">Interacción con el artículo</span>
            </div>
            <button className="flex items-center gap-1 border border-[#e9eae6] rounded-full px-3 py-[5px] text-[11.5px] font-medium text-[#1a1a1a]">
              Números totales
              <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current"><path d="M4 6l4 4 4-4z"/></svg>
            </button>
          </div>
          <div className="px-5 pb-3 flex items-center gap-2">
            <button className="flex items-center gap-1 border border-[#e9eae6] rounded-full px-3 py-[5px] text-[12px] text-[#1a1a1a]">
              <svg viewBox="0 0 16 16" className="w-3 h-3 fill-none stroke-current" strokeWidth="1.4"><circle cx="6" cy="6" r="3"/><path d="M14 14l-4-4"/></svg>
              Visitantes greater than 1C
            </button>
            <button className="flex items-center gap-1 border border-dashed border-[#d4d4d2] rounded-full px-3 py-[5px] text-[12px] text-[#646462]">
              <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current"><path d="M7 3h2v4h4v2H9v4H7V9H3V7h4z"/></svg>
              Añadir filtro
            </button>
          </div>
          <div className="border-t border-[#e9eae6]">
            <div className="grid grid-cols-7 px-5 py-2 bg-[#fafaf9] border-b border-[#e9eae6] text-[12px] font-medium text-[#646462]">
              <div>artículo</div>
              <div>Visitantes</div>
              <div>
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#16a34a]" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M5.5 10c.7.8 1.5 1.2 2.5 1.2s1.8-.4 2.5-1.2M6 6.5v.01M10 6.5v.01" strokeLinecap="round"/></svg>
              </div>
              <div>
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#a16207]" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M5.5 10.5h5M6 6.5v.01M10 6.5v.01" strokeLinecap="round"/></svg>
              </div>
              <div>
                <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#dc2626]" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M5.5 11c.7-.8 1.5-1.2 2.5-1.2s1.8.4 2.5 1.2M6 6.5v.01M10 6.5v.01" strokeLinecap="round"/></svg>
              </div>
              <div>Conversaciones</div>
              <div>última actualización</div>
            </div>
            {topArticles.length > 0 ? topArticles.map((art, i) => (
              <div key={i} className="grid grid-cols-7 px-5 py-2 border-b border-[#f1f1ee] text-[12.5px] text-[#1a1a1a] hover:bg-[#fafaf9]">
                <div className="truncate pr-2" title={art.title}>{art.title}</div>
                <div>{art.views}</div>
                <div className="text-[#16a34a]">{art.helpful}</div>
                <div className="text-[#a16207]">0</div>
                <div className="text-[#dc2626]">{art.unhelpful}</div>
                <div>{art.deflected}</div>
                <div className="text-[#646462]">—</div>
              </div>
            )) : (
              <div className="h-[160px] flex flex-col items-center justify-center text-center">
                <svg viewBox="0 0 16 16" className="w-7 h-7 fill-none stroke-[#646462] mb-2" strokeWidth="1.4"><path d="M2 13V3M14 13H2M5 11V8M8 11V5M11 11V7"/></svg>
                <span className="text-[13px] font-medium text-[#1a1a1a]">No hay datos para mostrar</span>
              </div>
            )}
          </div>
        </div>
        <div className="border border-[#e9eae6] rounded-[10px] bg-white overflow-hidden">
          <div className="px-5 py-3"><span className="text-[12.5px] text-[#1a1a1a]">Busca resultados</span></div>
          <div className="border-t border-b border-[#e9eae6] grid grid-cols-4 px-5 py-2 bg-[#fafaf9] text-[12px] font-medium text-[#646462]">
            <div>Palabra clave</div><div>Búsquedas</div><div>Índices de clics</div><div>acción</div>
          </div>
          <div className="h-[140px] flex flex-col items-center justify-center text-center">
            <svg viewBox="0 0 16 16" className="w-7 h-7 fill-none stroke-[#646462] mb-2" strokeWidth="1.4"><path d="M2 13V3M14 13H2M5 11V8M8 11V5M11 11V7"/></svg>
            <span className="text-[13px] font-medium text-[#1a1a1a]">No hay datos para mostrar</span>
          </div>
        </div>
        <div className="border border-[#e9eae6] rounded-[10px] bg-white overflow-hidden">
          <div className="px-5 py-3"><span className="text-[12.5px] text-[#1a1a1a]">Búsquedas sin resultados</span></div>
          <div className="border-t border-b border-[#e9eae6] grid grid-cols-3 px-5 py-2 bg-[#fafaf9] text-[12px] font-medium text-[#646462]">
            <div>Palabra clave</div><div>Búsquedas</div><div>acción</div>
          </div>
          <div className="h-[140px] flex flex-col items-center justify-center text-center">
            <svg viewBox="0 0 16 16" className="w-7 h-7 fill-none stroke-[#646462] mb-2" strokeWidth="1.4"><path d="M2 13V3M14 13H2M5 11V8M8 11V5M11 11V7"/></svg>
            <span className="text-[13px] font-medium text-[#1a1a1a]">No hay datos para mostrar</span>
          </div>
        </div>
        <p className="text-[11.5px] text-[#646462] text-center pt-2">Los informes están en Madrid time (GMT+2)</p>
      </div>
    </>
  );
}

function ReportsOutboundEngagementContent({ period, channel }: { period: string; channel: string }) {
  const { data, loading } = useApi(() => reportsApi.outbound(period, channel), [period, channel], null);
  const kpis = data?.kpis ?? {};
  const timeSeries: { day: number; count: number }[] = data?.timeSeries ?? Array.from({ length: 30 }, (_, i) => ({ day: i, count: 0 }));
  const byUser: { name: string; count: number }[] = data?.byUser ?? [];
  const performance: { title: string; sent: number; goal: number }[] = data?.performance ?? [];
  const isEmpty = data?.isEmpty !== false;
  const maxBar = Math.max(...timeSeries.map(t => t.count), 1);
  const days = timeSeries.length;

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#e9eae6] flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-[#1a1a1a]" strokeWidth="1.5"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5.5 7h5M5.5 10h3"/></svg>
          <h1 className="text-[18px] font-bold text-[#1a1a1a]">Interacción del cliente</h1>
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
      <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-4">
        <h2 className="text-[15px] font-bold text-[#1a1a1a]">Todos los tipos de mensajes</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5">
            <p className="text-[12.5px] text-[#1a1a1a] mb-2">Mensajes enviados</p>
            <p className="text-[24px] font-bold text-[#1a1a1a]">{loading ? '…' : String(kpis.total_sent ?? 0)}</p>
          </div>
          <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5">
            <p className="text-[12.5px] text-[#1a1a1a] mb-2">Horas de envío de mensajes</p>
            <p className="text-[24px] font-bold text-[#646462]">{kpis.send_hours ?? '—'}</p>
          </div>
        </div>
        {/* Time series */}
        <div className="border border-[#e9eae6] rounded-[10px] bg-white p-5">
          <p className="text-[12.5px] font-medium text-[#1a1a1a] mb-3">Mensajes enviados por día</p>
          {isEmpty ? (
            <div className="h-[160px] flex flex-col items-center justify-center text-center">
              <svg viewBox="0 0 16 16" className="w-7 h-7 fill-none stroke-[#646462] mb-2" strokeWidth="1.4"><path d="M2 13V3M14 13H2M5 11V8M8 11V5M11 11V7"/></svg>
              <span className="text-[12.5px] text-[#1a1a1a] font-medium">Sin mensajes salientes</span>
              <span className="text-[11.5px] text-[#646462] mt-0.5">Configura campañas o mensajes proactivos para ver datos aquí.</span>
            </div>
          ) : (
            <>
              <div className="h-[140px] flex items-end gap-0.5 px-2">
                {timeSeries.map((t, i) => (
                  <div key={i} style={{ height: t.count ? `${(t.count / maxBar) * 100}%` : '4px' }} className={`flex-1 ${t.count ? 'bg-[#fc8a37]' : 'bg-[#f3f3f1]'} rounded-t`} />
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-[#646462] mt-1 px-2">
                <span>Día 1</span><span>Día {Math.floor(days / 3)}</span><span>Día {Math.floor(2 * days / 3)}</span><span>Día {days}</span>
              </div>
            </>
          )}
        </div>
        {/* Volume by user */}
        <div className="border border-[#e9eae6] rounded-[10px] bg-white overflow-hidden">
          <div className="px-5 py-3"><span className="text-[12.5px] font-medium text-[#1a1a1a]">Volumen de mensajes por usuario</span></div>
          <div className="border-t border-b border-[#e9eae6] grid grid-cols-2 px-5 py-2 text-[12px] text-[#646462]">
            <div>Nombre</div><div className="text-right">Mensajes enviados</div>
          </div>
          {byUser.length === 0 ? (
            <div className="h-[80px] flex items-center justify-center text-[12px] text-[#646462]">Sin datos</div>
          ) : byUser.map((u, i) => (
            <div key={i} className="grid grid-cols-2 px-5 py-2.5 border-b border-[#f1f1ee] text-[12.5px] text-[#1a1a1a]">
              <div className="font-medium truncate">{u.name}</div>
              <div className="text-right text-[#646462]">{u.count}</div>
            </div>
          ))}
        </div>
        {/* Message performance */}
        <div className="border border-[#e9eae6] rounded-[10px] bg-white overflow-hidden">
          <div className="px-5 py-3"><span className="text-[12.5px] font-medium text-[#1a1a1a]">Rendimiento del mensaje</span></div>
          <div className="border-t border-[#e9eae6] grid grid-cols-3 px-5 py-2 text-[12px] text-[#646462]">
            <div>Título</div><div>Enviado</div><div>Objetivo</div>
          </div>
          {performance.length === 0 ? (
            <div className="h-[60px] flex items-center justify-center text-[12px] text-[#646462]">Sin campañas configuradas</div>
          ) : performance.map((p, i) => (
            <div key={i} className="grid grid-cols-3 px-5 py-2.5 border-t border-[#f1f1ee] text-[12.5px] text-[#1a1a1a]">
              <div className="truncate">{p.title}</div>
              <div>{p.sent}</div>
              <div className="text-[#646462]">{p.goal ?? '—'}</div>
            </div>
          ))}
        </div>
        <p className="text-[11.5px] text-[#646462] text-center pt-2">Los informes están en zona horaria del servidor</p>
      </div>
    </>
  );
}

function ReportsCopilotContent({ period, channel }: { period: string; channel: string }) {
  // Copilot usage is derived from AI agent runs — we reuse the agents endpoint
  const { data, loading } = useApi(() => reportsApi.agents(period, channel), [period, channel], null);
  const agents: any[] = data?.agents ?? [];
  const agentTimeSeries: { day: number; runs: number }[] = data?.timeSeries ?? [];
  const maxAgentRuns = Math.max(...agentTimeSeries.map(t => t.runs), 1);
  const totalRuns = agents.reduce((s, a) => s + (a.totalRuns ?? 0), 0);
  const totalTokens = agents.reduce((s, a) => s + (a.tokensUsed ?? 0), 0);
  const avgSuccessRate = agents.length > 0
    ? Math.round(agents.reduce((s, a) => s + Number.parseFloat(String(a.successRate ?? '0')), 0) / agents.length)
    : 0;
  const copilotAgents = agents.filter(a => (a.name ?? '').toLowerCase().includes('copilot') || (a.slug ?? '').toLowerCase().includes('copilot'));
  const displayAgents = copilotAgents.length > 0 ? copilotAgents : agents;
  const isEmpty = agents.length === 0;

  return (
    <>
      <ReportShellHeader title="Copilot" description="Analyze how Copilot is used by teammates in your workspace to assist conversations." />
      <ReportShellFilters />
      <div className="flex-1 overflow-y-auto min-h-0 p-6 grid grid-cols-3 gap-4">
        <ReportsKpiCard label="AI agent runs" value={loading ? '…' : String(totalRuns)} sub={`${agents.length} agentes activos`} />
        <ReportsKpiCard label="Tokens consumidos" value={loading ? '…' : Number(totalTokens).toLocaleString()} />
        <ReportsKpiCard label="Tasa de éxito media" value={loading ? '…' : `${avgSuccessRate}%`} />
        {/* Agent table */}
        <div className="col-span-3 border border-[#e9eae6] rounded-[10px] bg-white overflow-hidden">
          <div className="px-5 py-3 flex items-center gap-1">
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
            <span className="text-[12.5px] text-[#1a1a1a]">Actividad de agentes de IA / Copilot</span>
          </div>
          <div className="grid grid-cols-5 px-5 py-2 bg-[#fafaf9] border-t border-b border-[#e9eae6] text-[12px] text-[#646462]">
            <div>Agente</div>
            <div>Ejecuciones</div>
            <div>Éxito</div>
            <div>Fallos</div>
            <div>Tokens</div>
          </div>
          {loading ? (
            <div className="px-5 py-4 text-[12.5px] text-[#646462]">Cargando...</div>
          ) : isEmpty ? (
            <div className="h-[140px] flex flex-col items-center justify-center text-center">
              <svg viewBox="0 0 16 16" className="w-7 h-7 fill-none stroke-[#646462] mb-2" strokeWidth="1.4"><path d="M4 4h8a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H8L5 14v-2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>
              <span className="text-[12.5px] text-[#1a1a1a] font-medium">Sin actividad de Copilot</span>
              <span className="text-[11.5px] text-[#646462] mt-0.5">Las métricas aparecen cuando los agentes procesan conversaciones.</span>
            </div>
          ) : displayAgents.map((a: any, i: number) => (
            <div key={i} className="grid grid-cols-5 px-5 py-2.5 border-b border-[#f1f1ee] text-[12.5px] text-[#1a1a1a]">
              <div className="font-medium truncate">{a.name ?? a.slug ?? 'Agente'}</div>
              <div>{a.totalRuns ?? 0}</div>
              <div className={Number.parseFloat(String(a.successRate ?? '0').replace('%','')) >= 80 ? 'text-[#16a34a]' : 'text-[#dc2626]'}>
                {a.successRate ?? '—'}
              </div>
              <div className="text-[#646462]">{a.failedRuns ?? 0}</div>
              <div className="text-[#646462]">{Number(a.tokensUsed ?? 0).toLocaleString()}</div>
            </div>
          ))}
        </div>
        {/* Agent runs over time */}
        {agentTimeSeries.some(t => t.runs > 0) ? (
          <div className="col-span-3 border border-[#e9eae6] rounded-[10px] bg-white p-5">
            <div className="flex items-center gap-1 mb-3">
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-[#646462]" strokeWidth="1.4"><circle cx="8" cy="8" r="6.2"/><path d="M8 5v4M8 11h.01"/></svg>
              <span className="text-[12.5px] text-[#1a1a1a]">Uso de Copilot por tiempo</span>
            </div>
            <div className="h-[140px] flex items-end gap-0.5 px-2">
              {agentTimeSeries.map((t, i) => (
                <div key={i} style={{ height: t.runs ? `${(t.runs / maxAgentRuns) * 100}%` : '4px' }} className={`flex-1 ${t.runs ? 'bg-[#8b5cf6]' : 'bg-[#f3f3f1]'} rounded-t`} />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-[#646462] mt-2 px-2">
              <span>Día 1</span><span>Día {Math.round(agentTimeSeries.length / 2)}</span><span>Día {agentTimeSeries.length}</span>
            </div>
          </div>
        ) : (
          <ReportEmptyChart label="Uso de Copilot por tiempo" span={3} />
        )}
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

function readInitialReportsSubFromUrl(): ReportsSubView {
  if (typeof window === 'undefined') return 'overview';
  const s = new URLSearchParams(window.location.search).get('sub');
  const known: ReportsSubView[] = [
    'overview','aiResumen','areasNegocio','agentesPerf','aprobacionesRisk','costesRoi',
    'todos','misInformes','favoritos',
    'temas','sugerencias','export','horarios',
    'finAgent','copilot',
    'calls','conversations','csat','effectiveness',
    'responsiveness','slas','teamInbox','teammate','tickets',
    'articles','outboundEng','administrar',
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
  function renderSub() {
    switch (sub) {
      // ── Análisis (from original Reports.tsx) ────────────────────────────
      case 'overview':         return <ReportsOverviewContent period={period} channel={channel} />;
      case 'todos':            return <KnowledgePlaceholder title="Todos los informes" subtitle="Aquí verás los 25 informes disponibles: familias de KPIs de IA, soporte humano y proactivo." />;
      case 'misInformes':      return <KnowledgePlaceholder title="Tus informes" subtitle="Aún no has creado informes propios. Duplica un informe o crea uno desde cero para verlo aquí." />;
      case 'favoritos':        return <KnowledgePlaceholder title="Tus favoritos" subtitle="Marca informes como favoritos para acceder a ellos rápidamente desde aquí." />;
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
