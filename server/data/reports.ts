import { getSupabaseAdmin } from '../db/supabase.js';

export interface ReportScope {
  tenantId: string;
  workspaceId: string;
}

export interface ReportRepository {
  getOverview(scope: ReportScope, period: string, channel?: string): Promise<any>;
  getIntents(scope: ReportScope, period: string, channel?: string): Promise<any>;
  getAgents(scope: ReportScope, period: string, channel?: string): Promise<any>;
  getApprovals(scope: ReportScope, period: string, channel?: string): Promise<any>;
  getCosts(scope: ReportScope, period: string, channel?: string): Promise<any>;
  getSLA(scope: ReportScope, period: string, channel?: string): Promise<any>;
}

function periodToISO(period: string): string {
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function normalizeChannel(channel?: string): string | null {
  if (!channel) return null;
  const normalized = String(channel).trim().toLowerCase();
  return normalized && normalized !== 'all' ? normalized : null;
}

async function getChannelCaseIdsSupabase(scope: ReportScope, channel?: string): Promise<string[] | null> {
  const normalized = normalizeChannel(channel);
  if (!normalized) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('cases')
    .select('id')
    .eq('tenant_id', scope.tenantId)
    .eq('source_channel', normalized);
  if (error) throw error;
  return (data || []).map((row: any) => row.id).filter(Boolean);
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

async function getOverviewSupabase(scope: ReportScope, period: string, channel?: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const priorEnd = since;
  const priorStart = new Date(new Date(since).getTime() - days * 86_400_000).toISOString();
  const normalizedChannel = normalizeChannel(channel);
  const caseCount = (from: string, to?: string, statuses?: string[], extra?: { field: string; op?: 'eq' | 'in' | 'notnull'; value?: any }) => {
    let query = supabase
      .from('cases')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', scope.tenantId)
      .gte('created_at', from);
    if (to) query = query.lt('created_at', to);
    if (normalizedChannel) query = query.eq('source_channel', normalizedChannel);
    if (statuses?.length) query = query.in('status', statuses);
    if (extra?.op === 'eq') query = query.eq(extra.field, extra.value);
    if (extra?.op === 'in') query = query.in(extra.field, extra.value);
    if (extra?.op === 'notnull') query = query.not(extra.field, 'is', null);
    return query;
  };

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
    caseCount(since),
    caseCount(priorStart, priorEnd),
    caseCount(since, undefined, ['resolved', 'closed']),
    caseCount(priorStart, priorEnd, ['resolved', 'closed']),
    caseCount(since, undefined, undefined, { field: 'sla_status', op: 'eq', value: 'breached' }),
    caseCount(since, undefined, undefined, { field: 'sla_status', op: 'notnull' }),
    caseCount(priorStart, priorEnd, undefined, { field: 'sla_status', op: 'eq', value: 'breached' }),
    caseCount(priorStart, priorEnd, undefined, { field: 'sla_status', op: 'notnull' }),
    (() => {
      let query = supabase.from('cases').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId);
      if (normalizedChannel) query = query.eq('source_channel', normalizedChannel);
      return query.not('status', 'in', ['resolved', 'closed', 'cancelled']);
    })(),
    caseCount(since, undefined, undefined, { field: 'risk_level', op: 'in', value: ['high', 'critical'] }),
    (() => {
      let query = supabase.from('cases').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).gte('created_at', since);
      if (normalizedChannel) query = query.eq('source_channel', normalizedChannel);
      return query.eq('resolution_state', 'resolved').eq('execution_state', 'completed');
    })(),
    (() => {
      let query = supabase.from('cases').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).gte('created_at', priorStart).lt('created_at', priorEnd);
      if (normalizedChannel) query = query.eq('source_channel', normalizedChannel);
      return query.eq('resolution_state', 'resolved').eq('execution_state', 'completed');
    })(),
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

async function getIntentsSupabase(scope: ReportScope, period: string, channel?: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);
  let query = supabase
    .from('cases')
    .select('type, status')
    .eq('tenant_id', scope.tenantId)
    .gte('created_at', since);
  const normalizedChannel = normalizeChannel(channel);
  if (normalizedChannel) query = query.eq('source_channel', normalizedChannel);
  const { data, error } = await query;
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

async function getAgentsSupabase(scope: ReportScope, period: string, channel?: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);
  const channelCaseIds = await getChannelCaseIdsSupabase(scope, channel);
  
  const { data: agents, error: agentsError } = await supabase
    .from('agents')
    .select('id, name, slug, category')
    .eq('tenant_id', scope.tenantId);
  if (agentsError) throw agentsError;

  if (channelCaseIds && channelCaseIds.length === 0) {
    return {
      period,
      agents: (agents || []).map((a) => ({
        name: a.name,
        slug: a.slug,
        category: a.category,
        totalRuns: 0,
        successRate: '0%',
        failedRuns: 0,
        tokensUsed: 0,
        costCredits: 0,
        avgDurationSec: null,
      })),
    };
  }

  let runsQuery = supabase
    .from('agent_runs')
    .select('agent_id, outcome_status, tokens_used, cost_credits, started_at, ended_at, case_id')
    .eq('tenant_id', scope.tenantId)
    .gte('started_at', since);
  if (channelCaseIds) runsQuery = runsQuery.in('case_id', channelCaseIds);
  const { data: runs, error: runsError } = await runsQuery;
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

async function getApprovalsSupabase(scope: ReportScope, period: string, channel?: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);
  const channelCaseIds = await getChannelCaseIdsSupabase(scope, channel);
  if (channelCaseIds && channelCaseIds.length === 0) {
    return {
      period,
      funnel: [
        { label: 'Triggered', val: '0' },
        { label: 'Approved', val: '0' },
        { label: 'Rejected', val: '0' },
        { label: 'Pending', val: '0' },
      ],
      rates: { approvalRate: '0%', rejectionRate: '0%', avgDecisionHours: null },
      byRisk: [],
    };
  }
  const approvalsCount = (status?: string) => {
    let query = supabase
      .from('approval_requests')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', scope.tenantId);
    if (status === 'pending') query = query.eq('status', 'pending');
    else query = query.gte('created_at', since);
    if (status && status !== 'pending') query = query.eq('status', status);
    if (channelCaseIds) query = query.in('case_id', channelCaseIds);
    return query;
  };

  const [
    { count: total },
    { count: approved },
    { count: rejected },
    { count: pending },
    { data: byRiskRaw },
    { data: decisionTimes }
  ] = await Promise.all([
    approvalsCount(),
    approvalsCount('approved'),
    approvalsCount('rejected'),
    approvalsCount('pending'),
    (() => {
      let query = supabase.from('approval_requests').select('risk_level').eq('tenant_id', scope.tenantId).gte('created_at', since);
      if (channelCaseIds) query = query.in('case_id', channelCaseIds);
      return query;
    })(),
    (() => {
      let query = supabase.from('approval_requests').select('created_at, decision_at').eq('tenant_id', scope.tenantId).gte('created_at', since).not('decision_at', 'is', null);
      if (channelCaseIds) query = query.in('case_id', channelCaseIds);
      return query;
    })(),
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

async function getCostsSupabase(scope: ReportScope, period: string, channel?: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);
  const channelCaseIds = await getChannelCaseIdsSupabase(scope, channel);
  if (channelCaseIds && channelCaseIds.length === 0) {
    return {
      period,
      summary: { creditsUsed: 0, creditsAdded: 0, totalTokens: 0, autoResolvedCases: 0 },
      byAgent: [],
    };
  }

  const [
    { data: ledger },
    { data: agentCostsRaw },
    { data: runsForTokens },
    { count: autoResolvedCount }
  ] = await Promise.all([
    supabase.from('credit_ledger').select('entry_type, amount').eq('tenant_id', scope.tenantId).gte('occurred_at', since),
    (() => {
      let query = supabase.from('agent_runs').select('agent_id, tokens_used, cost_credits, case_id, agents(name)').eq('tenant_id', scope.tenantId).gte('started_at', since);
      if (channelCaseIds) query = query.in('case_id', channelCaseIds);
      return query;
    })(),
    (() => {
      let query = supabase.from('agent_runs').select('tokens_used, case_id').eq('tenant_id', scope.tenantId).gte('started_at', since);
      if (channelCaseIds) query = query.in('case_id', channelCaseIds);
      return query;
    })(),
    (() => {
      let query = supabase.from('cases').select('*', { count: 'exact', head: true }).eq('tenant_id', scope.tenantId).gte('created_at', since).eq('execution_state', 'completed');
      const normalizedChannel = normalizeChannel(channel);
      if (normalizedChannel) query = query.eq('source_channel', normalizedChannel);
      return query;
    })(),
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

async function getSLASupabase(scope: ReportScope, period: string, channel?: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);
  let query = supabase
    .from('cases')
    .select('sla_status, priority, type')
    .eq('tenant_id', scope.tenantId)
    .gte('created_at', since);
  const normalizedChannel = normalizeChannel(channel);
  if (normalizedChannel) query = query.eq('source_channel', normalizedChannel);
  const { data, error } = await query;
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

export function createReportRepository(): ReportRepository {
  return {
    getOverview: getOverviewSupabase,
    getIntents: getIntentsSupabase,
    getAgents: getAgentsSupabase,
    getApprovals: getApprovalsSupabase,
    getCosts: getCostsSupabase,
    getSLA: getSLASupabase,
  };
}
