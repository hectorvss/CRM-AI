import { getDb } from '../db/client.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { parseRow } from '../db/utils.js';

export interface ReportScope {
  tenantId: string;
  workspaceId: string;
}

export interface ReportRepository {
  getOverview(scope: ReportScope, period: string): Promise<any>;
  getIntents(scope: ReportScope, period: string): Promise<any>;
  getAgents(scope: ReportScope, period: string): Promise<any>;
  getApprovals(scope: ReportScope, period: string): Promise<any>;
  getCosts(scope: ReportScope, period: string): Promise<any>;
  getSLA(scope: ReportScope, period: string): Promise<any>;
}

function periodToISO(period: string): string {
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return '0%';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function trend(current: number, prior: number): 'up' | 'down' | 'neutral' {
  if (current > prior) return 'up';
  if (current < prior) return 'down';
  return 'neutral';
}

function changeStr(current: number, prior: number): string {
  if (prior === 0) return current > 0 ? '+100%' : '0%';
  const delta = ((current - prior) / prior) * 100;
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${Math.round(delta)}%`;
}

async function getOverviewSupabase(scope: ReportScope, period: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const priorEnd = since;
  const priorStart = new Date(new Date(since).getTime() - days * 86_400_000).toISOString();

  // We'll run multiple counts. In a real prod app, rpc() would be better.
  const [
    { count: totalCases },
    { count: priorCases },
    { count: resolvedCases },
    { count: priorResolved },
    { count: slaBreached },
    { count: slaTotal },
    { count: priorSlaBreached },
    { count: priorSlaTotal },
    { count: openCases },
    { count: highRiskCases },
    { count: autoResolved },
    { count: priorAutoResolved }
  ] = await Promise.all([
    supabase.from('cases').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).gte('created_at', since),
    supabase.from('cases').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).gte('created_at', priorStart).lt('created_at', priorEnd),
    supabase.from('cases').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).gte('created_at', since).in('status', ['resolved', 'closed']),
    supabase.from('cases').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).gte('created_at', priorStart).lt('created_at', priorEnd).in('status', ['resolved', 'closed']),
    supabase.from('cases').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).gte('created_at', since).eq('sla_status', 'breached'),
    supabase.from('cases').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).gte('created_at', since).not('sla_status', 'is', null),
    supabase.from('cases').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).gte('created_at', priorStart).lt('created_at', priorEnd).eq('sla_status', 'breached'),
    supabase.from('cases').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).gte('created_at', priorStart).lt('created_at', priorEnd).not('sla_status', 'is', null),
    supabase.from('cases').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).not('status', 'in', ['resolved', 'closed', 'cancelled']),
    supabase.from('cases').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).gte('created_at', since).in('risk_level', ['high', 'critical']),
    supabase.from('cases').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).gte('created_at', since).eq('resolution_state', 'resolved').eq('execution_state', 'completed'),
    supabase.from('cases').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).gte('created_at', priorStart).lt('created_at', priorEnd).eq('resolution_state', 'resolved').eq('execution_state', 'completed')
  ]);

  const nTotal = totalCases || 0;
  const nPrior = priorCases || 0;
  const nResolved = resolvedCases || 0;
  const nPriorResolved = priorResolved || 0;
  const nSlaBreached = slaBreached || 0;
  const nSlaTotal = slaTotal || 0;
  const nSlaCompliant = nSlaTotal - nSlaBreached;
  const nPriorSlaBreached = priorSlaBreached || 0;
  const nPriorSlaTotal = priorSlaTotal || 0;
  const nPriorSlaCompliant = nPriorSlaTotal - nPriorSlaBreached;
  const nAutoResolved = autoResolved || 0;
  const nPriorAutoResolved = priorAutoResolved || 0;

  return {
    period,
    generatedAt: new Date().toISOString(),
    kpis: [
      {
        key: 'total_cases',
        label: 'Total Cases',
        value: String(nTotal),
        change: changeStr(nTotal, nPrior),
        trend: trend(nTotal, nPrior),
        sub: `${openCases || 0} open`,
      },
      {
        key: 'resolution_rate',
        label: 'Resolution Rate',
        value: pct(nResolved, nTotal || 1),
        change: changeStr(nResolved / (nTotal || 1), nPriorResolved / (nPrior || 1)),
        trend: trend(nResolved / (nTotal || 1), nPriorResolved / (nPrior || 1)),
        sub: `${nResolved} resolved`,
      },
      {
        key: 'sla_compliance',
        label: 'SLA Compliance',
        value: pct(nSlaCompliant, nSlaTotal || 1),
        change: changeStr(nSlaCompliant / (nSlaTotal || 1), nPriorSlaCompliant / (nPriorSlaTotal || 1)),
        trend: trend(nSlaCompliant, nPriorSlaCompliant),
        sub: `${nSlaBreached} breached`,
      },
      {
        key: 'auto_resolution',
        label: 'AI Auto-Resolution',
        value: pct(nAutoResolved, nResolved || 1),
        change: changeStr(nAutoResolved, nPriorAutoResolved),
        trend: trend(nAutoResolved, nPriorAutoResolved),
        sub: `${nAutoResolved} automated`,
      },
      {
        key: 'high_risk',
        label: 'High Risk Cases',
        value: String(highRiskCases || 0),
        change: '—',
        trend: 'neutral',
        sub: `of ${nTotal} total`,
      },
    ],
  };
}

function getOverviewSqlite(scope: ReportScope, period: string) {
  const db = getDb();
  const since = periodToISO(period);
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const priorEnd = since;
  const priorStart = new Date(new Date(since).getTime() - days * 86_400_000).toISOString();

  const totalCases = (db.prepare('SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ?').get(scope.tenantId, since) as any).n;
  const priorCases = (db.prepare('SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ? AND created_at < ?').get(scope.tenantId, priorStart, priorEnd) as any).n;
  const resolvedCases = (db.prepare(`SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ? AND status IN ('resolved', 'closed')`).get(scope.tenantId, since) as any).n;
  const priorResolved = (db.prepare(`SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ? AND created_at < ? AND status IN ('resolved', 'closed')`).get(scope.tenantId, priorStart, priorEnd) as any).n;
  const slaBreached = (db.prepare(`SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ? AND sla_status = 'breached'`).get(scope.tenantId, since) as any).n;
  const slaTotal = (db.prepare(`SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ? AND sla_status IS NOT NULL`).get(scope.tenantId, since) as any).n;
  const slaCompliant = slaTotal - slaBreached;
  const priorSlaBreached = (db.prepare(`SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ? AND created_at < ? AND sla_status = 'breached'`).get(scope.tenantId, priorStart, priorEnd) as any).n;
  const priorSlaTotal = (db.prepare(`SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ? AND created_at < ? AND sla_status IS NOT NULL`).get(scope.tenantId, priorStart, priorEnd) as any).n;
  const priorSlaCompliant = priorSlaTotal - priorSlaBreached;
  const openCases = (db.prepare(`SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND status NOT IN ('resolved','closed','cancelled')`).get(scope.tenantId) as any).n;
  const highRiskCases = (db.prepare(`SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ? AND risk_level IN ('high', 'critical')`).get(scope.tenantId, since) as any).n;
  const autoResolved = (db.prepare(`SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ? AND resolution_state = 'resolved' AND execution_state = 'completed'`).get(scope.tenantId, since) as any).n;
  const priorAutoResolved = (db.prepare(`SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ? AND created_at < ? AND resolution_state = 'resolved' AND execution_state = 'completed'`).get(scope.tenantId, priorStart, priorEnd) as any).n;

  return {
    period,
    generatedAt: new Date().toISOString(),
    kpis: [
      {
        key: 'total_cases',
        label: 'Total Cases',
        value: String(totalCases),
        change: changeStr(totalCases, priorCases),
        trend: trend(totalCases, priorCases),
        sub: `${openCases} open`,
      },
      {
        key: 'resolution_rate',
        label: 'Resolution Rate',
        value: pct(resolvedCases, totalCases || 1),
        change: changeStr(resolvedCases / (totalCases || 1), priorResolved / (priorCases || 1)),
        trend: trend(resolvedCases / (totalCases || 1), priorResolved / (priorCases || 1)),
        sub: `${resolvedCases} resolved`,
      },
      {
        key: 'sla_compliance',
        label: 'SLA Compliance',
        value: pct(slaCompliant, slaTotal || 1),
        change: changeStr(slaCompliant / (slaTotal || 1), priorSlaCompliant / (priorSlaTotal || 1)),
        trend: trend(slaCompliant, priorSlaCompliant),
        sub: `${slaBreached} breached`,
      },
      {
        key: 'auto_resolution',
        label: 'AI Auto-Resolution',
        value: pct(autoResolved, resolvedCases || 1),
        change: changeStr(autoResolved, priorAutoResolved),
        trend: trend(autoResolved, priorAutoResolved),
        sub: `${autoResolved} automated`,
      },
      {
        key: 'high_risk',
        label: 'High Risk Cases',
        value: String(highRiskCases),
        change: '—',
        trend: 'neutral',
        sub: `of ${totalCases} total`,
      },
    ],
  };
}

async function getIntentsSupabase(scope: ReportScope, period: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);
  const { data, error } = await supabase
    .from('cases')
    .select('type, status')
    .eq('tenant_id', scope.tenantId)
    .gte('created_at', since);
  if (error) throw error;

  const counts = new Map<string, { volume: number; handled: number }>();
  for (const row of (data || [])) {
    const type = row.type || 'general_support';
    const current = counts.get(type) || { volume: 0, handled: 0 };
    current.volume += 1;
    if (['resolved', 'closed'].includes(row.status)) current.handled += 1;
    counts.set(type, current);
  }

  const rows = Array.from(counts.entries()).map(([name, val]) => ({
    name,
    volume: val.volume,
    handled: val.handled
  })).sort((a, b) => b.volume - a.volume).slice(0, 15);

  const total = rows.reduce((s, r) => s + r.volume, 0);
  const palette = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#818cf8', '#4f46e5', '#7c3aed', '#9333ea'];

  return {
    period,
    total,
    intents: rows.map((r, i) => ({
      name: r.name,
      volume: String(r.volume),
      handled: pct(r.handled, r.volume),
      shareOfTotal: pct(r.volume, total),
      color: palette[i % palette.length],
    })),
  };
}

function getIntentsSqlite(scope: ReportScope, period: string) {
  const db = getDb();
  const since = periodToISO(period);
  const rows = db.prepare(`
    SELECT
      COALESCE(type, 'general_support') as name,
      COUNT(*) as volume,
      SUM(CASE WHEN status IN ('resolved','closed') THEN 1 ELSE 0 END) as handled
    FROM cases
    WHERE tenant_id = ? AND created_at >= ?
    GROUP BY type
    ORDER BY volume DESC
    LIMIT 15
  `).all(scope.tenantId, since) as any[];

  const total = rows.reduce((s, r) => s + r.volume, 0);
  const palette = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#818cf8', '#4f46e5', '#7c3aed', '#9333ea'];

  return {
    period,
    total,
    intents: rows.map((r, i) => ({
      name: r.name,
      volume: String(r.volume),
      handled: pct(r.handled, r.volume),
      shareOfTotal: pct(r.volume, total),
      color: palette[i % palette.length],
    })),
  };
}

async function getAgentsSupabase(scope: ReportScope, period: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);
  
  const { data: agents, error: agentsError } = await supabase
    .from('agents')
    .select('id, name, slug, category')
    .eq('tenant_id', scope.tenantId);
  if (agentsError) throw agentsError;

  const { data: runs, error: runsError } = await supabase
    .from('agent_runs')
    .select('agent_id, outcome_status, tokens_used, cost_credits, started_at, ended_at')
    .eq('tenant_id', scope.tenantId)
    .gte('started_at', since);
  if (runsError) throw runsError;

  const agentMetrics = new Map<string, any>();
  for (const run of (runs || [])) {
    const m = agentMetrics.get(run.agent_id) || { total_runs: 0, completed: 0, failed: 0, tokens_total: 0, cost_total: 0, total_dur: 0, dur_count: 0 };
    m.total_runs += 1;
    if (run.outcome_status === 'completed') m.completed += 1;
    if (run.outcome_status === 'failed') m.failed += 1;
    m.tokens_total += Number(run.tokens_used || 0);
    m.cost_total += Number(run.cost_credits || 0);
    if (run.started_at && run.ended_at) {
      const dur = (new Date(run.ended_at).getTime() - new Date(run.started_at).getTime()) / 1000;
      m.total_dur += dur;
      m.dur_count += 1;
    }
    agentMetrics.set(run.agent_id, m);
  }

  const rows = (agents || []).map(a => {
    const m = agentMetrics.get(a.id) || { total_runs: 0, completed: 0, failed: 0, tokens_total: 0, cost_total: 0, total_dur: 0, dur_count: 0 };
    return {
      name: a.name,
      slug: a.slug,
      category: a.category,
      totalRuns: m.total_runs,
      successRate: pct(m.completed, m.total_runs || 1),
      failedRuns: m.failed,
      tokensUsed: m.tokens_total,
      costCredits: Number(m.cost_total.toFixed(4)),
      avgDurationSec: m.dur_count ? Math.round(m.total_dur / m.dur_count) : null,
    };
  }).sort((a, b) => b.totalRuns - a.totalRuns);

  return { period, agents: rows };
}

function getAgentsSqlite(scope: ReportScope, period: string) {
  const db = getDb();
  const since = periodToISO(period);
  const rows = db.prepare(`
    SELECT
      a.name, a.slug, a.category,
      COUNT(ar.id) as total_runs,
      SUM(CASE WHEN ar.outcome_status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN ar.outcome_status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(ar.tokens_used) as tokens_total,
      SUM(ar.cost_credits) as cost_total,
      AVG(CASE WHEN ar.ended_at IS NOT NULL THEN (julianday(ar.ended_at) - julianday(ar.started_at)) * 86400 END) as avg_duration_sec
    FROM agents a
    LEFT JOIN agent_runs ar ON ar.agent_id = a.id AND ar.started_at >= ?
    WHERE a.tenant_id = ?
    GROUP BY a.id
    ORDER BY total_runs DESC
  `).all(since, scope.tenantId) as any[];

  return {
    period,
    agents: rows.map(r => ({
      name: r.name,
      slug: r.slug,
      category: r.category,
      totalRuns: r.total_runs ?? 0,
      successRate: pct(r.completed ?? 0, (r.total_runs || 1)),
      failedRuns: r.failed ?? 0,
      tokensUsed: r.tokens_total ?? 0,
      costCredits: Number((r.cost_total ?? 0).toFixed(4)),
      avgDurationSec: r.avg_duration_sec ? Math.round(r.avg_duration_sec) : null,
    })),
  };
}

async function getApprovalsSupabase(scope: ReportScope, period: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);

  const [
    { count: total },
    { count: approved },
    { count: rejected },
    { count: pending },
    { data: byRiskRaw },
    { data: decisionTimes }
  ] = await Promise.all([
    supabase.from('approval_requests').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).gte('created_at', since),
    supabase.from('approval_requests').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).gte('created_at', since).eq('status', 'approved'),
    supabase.from('approval_requests').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).gte('created_at', since).eq('status', 'rejected'),
    supabase.from('approval_requests').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).eq('status', 'pending'),
    supabase.from('approval_requests').select('risk_level').eq('tenant_id', scope.tenantId).gte('created_at', since),
    supabase.from('approval_requests').select('created_at, decision_at').eq('tenant_id', scope.tenantId).gte('created_at', since).not('decision_at', 'is', null)
  ]);

  const riskCounts = new Map<string, number>();
  for (const row of (byRiskRaw || [])) {
    riskCounts.set(row.risk_level, (riskCounts.get(row.risk_level) || 0) + 1);
  }

  let totalDecisionHours = 0;
  for (const row of (decisionTimes || [])) {
    const dur = (new Date(row.decision_at!).getTime() - new Date(row.created_at).getTime()) / (1000 * 3600);
    totalDecisionHours += dur;
  }
  const avgDecisionHours = decisionTimes?.length ? totalDecisionHours / decisionTimes.length : null;

  return {
    period,
    funnel: [
      { label: 'Triggered', val: String(total || 0) },
      { label: 'Approved', val: String(approved || 0) },
      { label: 'Rejected', val: String(rejected || 0) },
      { label: 'Pending', val: String(pending || 0) },
    ],
    rates: {
      approvalRate: pct(approved || 0, total || 1),
      rejectionRate: pct(rejected || 0, total || 1),
      avgDecisionHours: avgDecisionHours ? Math.round(avgDecisionHours * 10) / 10 : null,
    },
    byRisk: Array.from(riskCounts.entries()).map(([riskLevel, count]) => ({ riskLevel, count })),
  };
}

function getApprovalsSqlite(scope: ReportScope, period: string) {
  const db = getDb();
  const since = periodToISO(period);
  const total = (db.prepare('SELECT COUNT(*) as n FROM approval_requests WHERE tenant_id = ? AND created_at >= ?').get(scope.tenantId, since) as any).n;
  const approved = (db.prepare(`SELECT COUNT(*) as n FROM approval_requests WHERE tenant_id = ? AND created_at >= ? AND status = 'approved'`).get(scope.tenantId, since) as any).n;
  const rejected = (db.prepare(`SELECT COUNT(*) as n FROM approval_requests WHERE tenant_id = ? AND created_at >= ? AND status = 'rejected'`).get(scope.tenantId, since) as any).n;
  const pending = (db.prepare(`SELECT COUNT(*) as n FROM approval_requests WHERE tenant_id = ? AND status = 'pending'`).get(scope.tenantId) as any).n;
  const byRisk = db.prepare(`SELECT risk_level, COUNT(*) as n FROM approval_requests WHERE tenant_id = ? AND created_at >= ? GROUP BY risk_level`).all(scope.tenantId, since) as any[];
  const avgDecisionHours = (db.prepare(`SELECT AVG((julianday(decision_at) - julianday(created_at)) * 24) as avg_h FROM approval_requests WHERE tenant_id = ? AND created_at >= ? AND decision_at IS NOT NULL`).get(scope.tenantId, since) as any)?.avg_h;

  return {
    period,
    funnel: [
      { label: 'Triggered', val: String(total) },
      { label: 'Approved', val: String(approved) },
      { label: 'Rejected', val: String(rejected) },
      { label: 'Pending', val: String(pending) },
    ],
    rates: {
      approvalRate: pct(approved, total || 1),
      rejectionRate: pct(rejected, total || 1),
      avgDecisionHours: avgDecisionHours ? Math.round(avgDecisionHours * 10) / 10 : null,
    },
    byRisk: byRisk.map(r => ({ riskLevel: r.risk_level, count: r.n })),
  };
}

async function getCostsSupabase(scope: ReportScope, period: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);

  const [
    { data: ledger },
    { data: agentCostsRaw },
    { data: runsForTokens },
    { count: autoResolvedCount }
  ] = await Promise.all([
    supabase.from('credit_ledger').select('entry_type, amount').eq('tenant_id', scope.tenantId).gte('occurred_at', since),
    supabase.from('agent_runs').select('agent_id, tokens_used, cost_credits, agents(name)').eq('tenant_id', scope.tenantId).gte('started_at', since),
    supabase.from('agent_runs').select('tokens_used').eq('tenant_id', scope.tenantId).gte('started_at', since),
    supabase.from('cases').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).gte('created_at', since).eq('execution_state', 'completed')
  ]);

  let debited = 0, credited = 0;
  for (const row of (ledger || [])) {
    if (row.entry_type === 'debit') debited += Number(row.amount || 0);
    else credited += Number(row.amount || 0);
  }

  const agentMap = new Map<string, { name: string; tokens: number; cost: number }>();
  for (const row of (agentCostsRaw || [])) {
    const existing = agentMap.get(row.agent_id) || { name: (row.agents as any)?.name || 'Unknown', tokens: 0, cost: 0 };
    existing.tokens += Number(row.tokens_used || 0);
    existing.cost += Number(row.cost_credits || 0);
    agentMap.set(row.agent_id, existing);
  }

  const byAgent = Array.from(agentMap.values()).sort((a, b) => b.cost - a.cost).slice(0, 10);
  const totalTokens = (runsForTokens || []).reduce((s, r) => s + Number(r.tokens_used || 0), 0);

  return {
    period,
    summary: {
      creditsUsed: Number(debited.toFixed(2)),
      creditsAdded: Number(credited.toFixed(2)),
      totalTokens,
      autoResolvedCases: autoResolvedCount || 0,
    },
    byAgent: byAgent.map(r => ({
      name: r.name,
      tokens: r.tokens,
      cost: Number(r.cost.toFixed(4)),
    })),
  };
}

function getCostsSqlite(scope: ReportScope, period: string) {
  const db = getDb();
  const since = periodToISO(period);
  const credits = db.prepare(`SELECT SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END) as debited, SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END) as credited FROM credit_ledger WHERE tenant_id = ? AND occurred_at >= ?`).get(scope.tenantId, since) as any;
  const agentCosts = db.prepare(`SELECT a.name, SUM(ar.tokens_used) as tokens, SUM(ar.cost_credits) as cost FROM agent_runs ar JOIN agents a ON a.id = ar.agent_id WHERE ar.started_at >= ? AND a.tenant_id = ? GROUP BY a.id ORDER BY cost DESC LIMIT 10`).all(since, scope.tenantId) as any[];
  const totalTokens = (db.prepare(`SELECT SUM(tokens_used) as n FROM agent_runs WHERE started_at >= ? AND agent_id IN (SELECT id FROM agents WHERE tenant_id = ?)`).get(since, scope.tenantId) as any)?.n ?? 0;
  const autoResolvedCount = (db.prepare(`SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ? AND execution_state = 'completed'`).get(scope.tenantId, since) as any).n;

  return {
    period,
    summary: {
      creditsUsed: Number((credits?.debited ?? 0).toFixed(2)),
      creditsAdded: Number((credits?.credited ?? 0).toFixed(2)),
      totalTokens,
      autoResolvedCases: autoResolvedCount,
    },
    byAgent: agentCosts.map(r => ({
      name: r.name,
      tokens: r.tokens ?? 0,
      cost: Number((r.cost ?? 0).toFixed(4)),
    })),
  };
}

async function getSLASupabase(scope: ReportScope, period: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);

  const { data, error } = await supabase
    .from('cases')
    .select('sla_status, priority, type')
    .eq('tenant_id', scope.tenantId)
    .gte('created_at', since);
  if (error) throw error;

  const distMap = new Map<string, number>();
  const prioMap = new Map<string, number>();
  const typeMap = new Map<string, number>();

  for (const row of (data || [])) {
    const s = row.sla_status || 'unknown';
    distMap.set(s, (distMap.get(s) || 0) + 1);
    
    const pk = `${row.priority}:${s}`;
    prioMap.set(pk, (prioMap.get(pk) || 0) + 1);

    if (row.sla_status === 'breached') {
      const t = row.type || 'unknown';
      typeMap.set(t, (typeMap.get(t) || 0) + 1);
    }
  }

  return {
    period,
    distribution: Array.from(distMap.entries()).map(([status, count]) => ({ status, count })),
    byPriority: Array.from(prioMap.entries()).map(([k, count]) => {
      const [priority, slaStatus] = k.split(':');
      return { priority, slaStatus, count };
    }),
    breachedByType: Array.from(typeMap.entries()).map(([type, count]) => ({ type, count })).sort((a,b) => b.count - a.count).slice(0, 10)
  };
}

function getSLASqlite(scope: ReportScope, period: string) {
  const db = getDb();
  const since = periodToISO(period);
  const distribution = db.prepare(`SELECT sla_status, COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ? GROUP BY sla_status`).all(scope.tenantId, since) as any[];
  const byPriority = db.prepare(`SELECT priority, sla_status, COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ? GROUP BY priority, sla_status ORDER BY priority, sla_status`).all(scope.tenantId, since) as any[];
  const breachedByType = db.prepare(`SELECT type, COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ? AND sla_status = 'breached' GROUP BY type ORDER BY n DESC LIMIT 10`).all(scope.tenantId, since) as any[];

  return {
    period,
    distribution: distribution.map(r => ({ status: r.sla_status ?? 'unknown', count: r.n })),
    byPriority: byPriority.map(r => ({ priority: r.priority, slaStatus: r.sla_status, count: r.n })),
    breachedByType: breachedByType.map(r => ({ type: r.type, count: r.n })),
  };
}

export function createReportRepository(): ReportRepository {
  if (getDatabaseProvider() === 'supabase') {
    return {
      getOverview: getOverviewSupabase,
      getIntents: getIntentsSupabase,
      getAgents: getAgentsSupabase,
      getApprovals: getApprovalsSupabase,
      getCosts: getCostsSupabase,
      getSLA: getSLASupabase,
    };
  }

  return {
    getOverview: async (scope, period) => getOverviewSqlite(scope, period),
    getIntents: async (scope, period) => getIntentsSqlite(scope, period),
    getAgents: async (scope, period) => getAgentsSqlite(scope, period),
    getApprovals: async (scope, period) => getApprovalsSqlite(scope, period),
    getCosts: async (scope, period) => getCostsSqlite(scope, period),
    getSLA: async (scope, period) => getSLASqlite(scope, period),
  };
}
