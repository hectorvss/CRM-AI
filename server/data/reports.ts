import { getSupabaseAdmin } from '../db/supabase.js';

export interface ReportScope {
  tenantId: string;
  workspaceId: string;
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

async function getConversationsSupabase(scope: ReportScope, period: string, channel?: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const priorEnd = since;
  const priorStart = new Date(new Date(since).getTime() - days * 86_400_000).toISOString();
  const normalizedChannel = normalizeChannel(channel);

  const caseCount = (from: string, to?: string, statuses?: string[], notStatuses?: string[]) => {
    let query = supabase
      .from('cases')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', scope.tenantId)
      .gte('created_at', from);
    if (to) query = query.lt('created_at', to);
    if (normalizedChannel) query = query.eq('source_channel', normalizedChannel);
    if (statuses?.length) query = query.in('status', statuses);
    if (notStatuses?.length) query = query.not('status', 'in', notStatuses);
    return query;
  };

  const [
    { count: newConversations },
    { count: priorNew },
    { count: closedConversations },
    { count: priorClosed },
    { count: openConversations },
    { count: repliedConversations },
    { data: rawCases },
    { data: channelData },
    { data: typeData },
  ] = await Promise.all([
    caseCount(since),
    caseCount(priorStart, priorEnd),
    caseCount(since, undefined, ['resolved', 'closed']),
    caseCount(priorStart, priorEnd, ['resolved', 'closed']),
    caseCount(since, undefined, undefined, ['resolved', 'closed', 'cancelled']),
    caseCount(since, undefined, undefined, ['open']),
    (() => {
      let q = supabase.from('cases').select('created_at').eq('tenant_id', scope.tenantId).gte('created_at', since);
      if (normalizedChannel) q = q.eq('source_channel', normalizedChannel);
      return q;
    })(),
    (() => {
      let q = supabase.from('cases').select('source_channel').eq('tenant_id', scope.tenantId).gte('created_at', since);
      if (normalizedChannel) q = q.eq('source_channel', normalizedChannel);
      return q;
    })(),
    (() => {
      let q = supabase.from('cases').select('type').eq('tenant_id', scope.tenantId).gte('created_at', since);
      if (normalizedChannel) q = q.eq('source_channel', normalizedChannel);
      return q;
    })(),
  ]);

  // Build 28-day time series
  const buckets: Record<string, number> = {};
  const sinceMs = new Date(since).getTime();
  for (const row of (rawCases || [])) {
    const dayIndex = Math.floor((new Date(row.created_at).getTime() - sinceMs) / 86_400_000);
    const key = String(Math.min(Math.max(dayIndex, 0), 27));
    buckets[key] = (buckets[key] || 0) + 1;
  }
  const timeSeries = Array.from({ length: 28 }, (_, i) => ({ day: i, count: buckets[String(i)] || 0 }));

  // Build by-channel counts
  const channelCounts = new Map<string, number>();
  for (const row of (channelData || [])) {
    const ch = row.source_channel || 'unknown';
    channelCounts.set(ch, (channelCounts.get(ch) || 0) + 1);
  }
  const byChannel = Array.from(channelCounts.entries()).map(([ch, count]) => ({ channel: ch, count })).sort((a, b) => b.count - a.count);

  // Build by-type (top 5)
  const typeCounts = new Map<string, number>();
  for (const row of (typeData || [])) {
    const t = row.type || 'general_support';
    typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
  }
  const byType = Array.from(typeCounts.entries()).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count).slice(0, 5);

  const nNew = newConversations || 0;
  const nPriorNew = priorNew || 0;
  const nClosed = closedConversations || 0;
  const nPriorClosed = priorClosed || 0;

  return {
    period,
    kpis: {
      new_conversations: nNew,
      closed_conversations: nClosed,
      open_conversations: openConversations || 0,
      replied_conversations: repliedConversations || 0,
      new_change: changeStr(nNew, nPriorNew),
      new_trend: trend(nNew, nPriorNew),
      closed_change: changeStr(nClosed, nPriorClosed),
      closed_trend: trend(nClosed, nPriorClosed),
    },
    timeSeries,
    byChannel,
    byType,
  };
}

async function getFinAgentSupabase(scope: ReportScope, period: string, channel?: string) {
  const [overview, agentsData, costsData] = await Promise.all([
    getOverviewSupabase(scope, period, channel),
    getAgentsSupabase(scope, period, channel),
    getCostsSupabase(scope, period, channel),
  ]);

  const kpis = overview.kpis || [];
  const autoKpi = kpis.find((k: any) => k.key === 'auto_resolution');
  const totalKpi = kpis.find((k: any) => k.key === 'total_cases');
  const agents = agentsData.agents || [];
  const totalRuns = agents.reduce((s: number, a: any) => s + (a.totalRuns || 0), 0);
  const avgSuccessRate = agents.length
    ? agents.reduce((s: number, a: any) => s + Number.parseFloat(String(a.successRate).replace('%', '') || '0'), 0) / agents.length
    : 0;

  return {
    period,
    kpis: {
      auto_resolution_rate: autoKpi?.value ?? '0%',
      auto_resolution_change: autoKpi?.change ?? '0%',
      total_ai_cases: totalKpi?.value ?? '0',
      avg_agent_success_rate: `${Math.round(avgSuccessRate)}%`,
      total_tokens: costsData.summary?.totalTokens ?? 0,
      credits_used: costsData.summary?.creditsUsed ?? 0,
      cases_resolved_by_ai: costsData.summary?.autoResolvedCases ?? 0,
    },
    agentBreakdown: agents,
  };
}

async function getTeammateSupabase(scope: ReportScope, period: string, _channel?: string) {
  const supabase = getSupabaseAdmin();
  let members: any[] = [];

  try {
    const { data, error } = await supabase
      .from('workspace_members')
      .select('user_id, role, joined_at')
      .eq('tenant_id', scope.tenantId);
    if (!error && data) {
      members = data.map((m: any) => ({
        userId: m.user_id,
        role: m.role || 'member',
        joinedAt: m.joined_at,
        name: m.user_id || 'Member',
        email: null,
        casesAssigned: 0,
        casesReplied: 0,
        casesClosed: 0,
        medianHandleTime: null,
      }));
    }
  } catch (_) {
    // table doesn't exist — use empty array
  }

  return {
    period,
    members,
    isEmpty: members.length === 0,
  };
}

async function getTicketsSupabase(scope: ReportScope, period: string, channel?: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);
  const normalizedChannel = normalizeChannel(channel);

  let query = supabase
    .from('cases')
    .select('type, status, created_at')
    .eq('tenant_id', scope.tenantId)
    .gte('created_at', since);
  if (normalizedChannel) query = query.eq('source_channel', normalizedChannel);
  // ticket-like types
  query = query.or("type.like.%ticket%,type.eq.technical_support");

  const { data, error } = await query;
  if (error) {
    // if query fails (e.g. no rows matching), return zeros
    return {
      period,
      kpis: { new_tickets: 0, resolved_tickets: 0, open_tickets: 0, median_resolution: null },
      byType: [],
      timeSeries: Array.from({ length: 28 }, (_, i) => ({ day: i, count: 0 })),
    };
  }

  const rows = data || [];
  const newTickets = rows.length;
  const resolvedTickets = rows.filter(r => ['resolved', 'closed'].includes(r.status)).length;
  const openTickets = rows.filter(r => !['resolved', 'closed', 'cancelled'].includes(r.status)).length;

  const typeCounts = new Map<string, number>();
  for (const row of rows) {
    const t = row.type || 'ticket';
    typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
  }
  const byType = Array.from(typeCounts.entries()).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);

  const sinceMs = new Date(since).getTime();
  const buckets: Record<string, number> = {};
  for (const row of rows) {
    const dayIndex = Math.floor((new Date(row.created_at).getTime() - sinceMs) / 86_400_000);
    const key = String(Math.min(Math.max(dayIndex, 0), 27));
    buckets[key] = (buckets[key] || 0) + 1;
  }
  const timeSeries = Array.from({ length: 28 }, (_, i) => ({ day: i, count: buckets[String(i)] || 0 }));

  return {
    period,
    kpis: { new_tickets: newTickets, resolved_tickets: resolvedTickets, open_tickets: openTickets, median_resolution: null },
    byType,
    timeSeries,
  };
}

async function getArticlesSupabase(scope: ReportScope, period: string, _channel?: string) {
  const supabase = getSupabaseAdmin();
  let totalArticles = 0;
  let publishedArticles = 0;
  let draftArticles = 0;
  let searchHitsTotal = 0;

  try {
    const { data, error } = await supabase
      .from('knowledge_articles')
      .select('status, created_at')
      .eq('tenant_id', scope.tenantId);
    if (!error && data) {
      totalArticles = data.length;
      publishedArticles = data.filter((r: any) => r.status === 'published').length;
      draftArticles = data.filter((r: any) => r.status === 'draft').length;
    }
  } catch (_) {
    // table doesn't exist — return zeros
  }

  try {
    const { data } = await supabase
      .from('knowledge_articles')
      .select('search_hits')
      .eq('tenant_id', scope.tenantId);
    if (data) {
      searchHitsTotal = data.reduce((s: number, r: any) => s + Number(r.search_hits || 0), 0);
    }
  } catch (_) {
    // column doesn't exist
  }

  return {
    period,
    kpis: {
      total_articles: totalArticles,
      published_articles: publishedArticles,
      draft_articles: draftArticles,
      search_hits_total: searchHitsTotal,
    },
  };
}

async function getResponsivenessSupabase(scope: ReportScope, period: string, channel?: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);
  const normalizedChannel = normalizeChannel(channel);

  let medianTimeToClose: string | null = null;

  try {
    let query = supabase
      .from('cases')
      .select('created_at, updated_at, status')
      .eq('tenant_id', scope.tenantId)
      .gte('created_at', since)
      .in('status', ['resolved', 'closed']);
    if (normalizedChannel) query = query.eq('source_channel', normalizedChannel);
    const { data } = await query;

    if (data && data.length > 0) {
      let totalHours = 0;
      let count = 0;
      for (const row of data) {
        if (row.updated_at && row.created_at) {
          const diffMs = new Date(row.updated_at).getTime() - new Date(row.created_at).getTime();
          if (diffMs > 0) {
            totalHours += diffMs / (1000 * 3600);
            count += 1;
          }
        }
      }
      if (count > 0) {
        const avgHours = totalHours / count;
        if (avgHours < 1) {
          medianTimeToClose = `${Math.round(avgHours * 60)}m`;
        } else if (avgHours < 24) {
          medianTimeToClose = `${Math.round(avgHours)}h`;
        } else {
          medianTimeToClose = `${Math.round(avgHours / 24)}d`;
        }
      }
    }
  } catch (_) {
    // column or table issue — keep null
  }

  return {
    period,
    kpis: {
      median_response_time: null,
      median_first_response: null,
      median_time_to_close: medianTimeToClose,
    },
    distribution: [
      { bucket: '< 5m', count: 0 },
      { bucket: '5m - 15m', count: 0 },
      { bucket: '15m - 30m', count: 0 },
      { bucket: '30m - 1h', count: 0 },
      { bucket: '1h - 3h', count: 0 },
      { bucket: '3h - 8h', count: 0 },
      { bucket: '> 8h', count: 0 },
    ],
  };
}

async function getCsatSupabase(scope: ReportScope, period: string, channel?: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);
  const normalizedChannel = normalizeChannel(channel);

  let overallCsat = 0;
  let positiveCount = 0;
  let neutralCount = 0;
  let negativeCount = 0;

  try {
    let query = supabase
      .from('cases')
      .select('satisfaction_score')
      .eq('tenant_id', scope.tenantId)
      .gte('created_at', since);
    if (normalizedChannel) query = query.eq('source_channel', normalizedChannel);
    const { data } = await query;

    if (data && data.length > 0) {
      const withScore = data.filter((r: any) => r.satisfaction_score != null);
      if (withScore.length > 0) {
        positiveCount = withScore.filter((r: any) => r.satisfaction_score >= 4).length;
        neutralCount = withScore.filter((r: any) => r.satisfaction_score === 3).length;
        negativeCount = withScore.filter((r: any) => r.satisfaction_score <= 2).length;
        overallCsat = Math.round((positiveCount / withScore.length) * 100);
      }
    }
  } catch (_) {
    // column doesn't exist — return zeros
  }

  return {
    period,
    kpis: {
      overall_csat: overallCsat,
      positive_count: positiveCount,
      neutral_count: neutralCount,
      negative_count: negativeCount,
      request_rate: '0%',
      response_rate: '0%',
    },
  };
}

async function getEffectivenessSupabase(scope: ReportScope, period: string, channel?: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);
  const normalizedChannel = normalizeChannel(channel);

  const caseCount = (extraFilter?: (q: any) => any) => {
    let query = supabase
      .from('cases')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', scope.tenantId)
      .gte('created_at', since);
    if (normalizedChannel) query = query.eq('source_channel', normalizedChannel);
    if (extraFilter) query = extraFilter(query);
    return query;
  };

  const [
    { count: total },
    { count: replied },
  ] = await Promise.all([
    caseCount(),
    caseCount(q => q.not('status', 'eq', 'open')),
  ]);

  // First contact resolution: cases closed within 1 hour using updated_at - created_at < 3600000ms
  let firstContactResolved = 0;
  let firstContactTotal = 0;
  try {
    let query = supabase
      .from('cases')
      .select('created_at, updated_at, status')
      .eq('tenant_id', scope.tenantId)
      .gte('created_at', since)
      .in('status', ['resolved', 'closed']);
    if (normalizedChannel) query = query.eq('source_channel', normalizedChannel);
    const { data } = await query;
    if (data) {
      firstContactTotal = data.length;
      firstContactResolved = data.filter((r: any) => {
        if (!r.updated_at || !r.created_at) return false;
        const diffMs = new Date(r.updated_at).getTime() - new Date(r.created_at).getTime();
        return diffMs > 0 && diffMs < 3_600_000;
      }).length;
    }
  } catch (_) {
    // column missing
  }

  const nTotal = total || 0;
  const nReplied = replied || 0;
  const fcrRate = firstContactTotal > 0 ? pct(firstContactResolved, firstContactTotal) : '0%';

  return {
    period,
    kpis: {
      conversations_replied_to: nReplied,
      first_contact_resolution: fcrRate,
      first_contact_resolved: firstContactResolved,
      first_contact_total: firstContactTotal,
      conversations_reassigned: 0,
      median_replies_to_close: null,
      total_conversations: nTotal,
    },
  };
}

// ── Calls ─────────────────────────────────────────────────────────────────────

async function getCallsSupabase(scope: ReportScope, period: string, channel?: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;

  let inboundCalls = 0;
  let outboundCalls = 0;
  let messengerCalls = 0;
  const timeSeries: { day: number; count: number }[] = Array.from({ length: days }, (_, i) => ({ day: i, count: 0 }));
  const byDirection: { direction: string; count: number }[] = [];

  try {
    let query = supabase
      .from('cases')
      .select('id, created_at, source_channel')
      .eq('tenant_id', scope.tenantId)
      .gte('created_at', since)
      .in('source_channel', ['phone', 'voice', 'call', 'messenger_call', 'video']);

    const { data } = await query;
    if (data && data.length > 0) {
      // Derive inbound/outbound from channel name as a heuristic
      inboundCalls = data.filter((r: any) =>
        !r.source_channel?.includes('outbound') && r.source_channel !== 'messenger_call'
      ).length;
      outboundCalls = data.filter((r: any) => r.source_channel?.includes('outbound')).length;
      messengerCalls = data.filter((r: any) => r.source_channel === 'messenger_call').length;

      // Time series
      const baseMs = Date.now() - days * 86_400_000;
      for (const row of data) {
        if (!row.created_at) continue;
        const dayIdx = Math.floor((new Date(row.created_at).getTime() - baseMs) / 86_400_000);
        if (dayIdx >= 0 && dayIdx < days && timeSeries[dayIdx]) {
          timeSeries[dayIdx].count += 1;
        }
      }

      if (inboundCalls > 0) byDirection.push({ direction: 'inbound', count: inboundCalls });
      if (outboundCalls > 0) byDirection.push({ direction: 'outbound', count: outboundCalls });
      if (messengerCalls > 0) byDirection.push({ direction: 'messenger', count: messengerCalls });
    }
  } catch (_) {
    // No calls data — return graceful zeros
  }

  return {
    period,
    kpis: {
      inbound_calls: inboundCalls,
      outbound_calls: outboundCalls,
      messenger_calls: messengerCalls,
      total_calls: inboundCalls + outboundCalls + messengerCalls,
      median_call_duration: null,
      median_queue_time: null,
      median_talk_time: null,
    },
    timeSeries,
    byDirection,
    isEmpty: inboundCalls === 0 && outboundCalls === 0 && messengerCalls === 0,
  };
}

// ── Team Inbox ────────────────────────────────────────────────────────────────

async function getTeamInboxSupabase(scope: ReportScope, period: string, channel?: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);
  const normalizedChannel = normalizeChannel(channel);

  let conversationsAssigned = 0;
  let conversationsReplied = 0;
  let closedConversations = 0;
  let medianAssignToClose: string | null = null;
  const inboxBreakdown: { inbox: string; assigned: number; replied: number; closed: number; medianClose: string }[] = [];

  try {
    let baseQuery = supabase
      .from('cases')
      .select('id, status, created_at, updated_at, assigned_to')
      .eq('tenant_id', scope.tenantId)
      .gte('created_at', since);
    if (normalizedChannel) baseQuery = baseQuery.eq('source_channel', normalizedChannel);
    const { data } = await baseQuery;

    if (data && data.length > 0) {
      conversationsAssigned = data.filter((r: any) => r.assigned_to != null).length;
      conversationsReplied = data.filter((r: any) => !['open', 'pending'].includes(r.status)).length;
      closedConversations = data.filter((r: any) => ['resolved', 'closed'].includes(r.status)).length;

      // Median time to close from created_at → updated_at on closed cases
      const closedRows = data.filter((r: any) =>
        ['resolved', 'closed'].includes(r.status) && r.created_at && r.updated_at
      );
      if (closedRows.length > 0) {
        const durations = closedRows
          .map((r: any) => new Date(r.updated_at).getTime() - new Date(r.created_at).getTime())
          .filter((d: number) => d > 0)
          .sort((a: number, b: number) => a - b);
        if (durations.length > 0) {
          const medMs = durations[Math.floor(durations.length / 2)];
          const h = medMs / 3_600_000;
          medianAssignToClose = h < 1 ? `${Math.round(h * 60)}m` : h < 24 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
        }
      }

      // Group by assigned_to (treat each unique value as a "team inbox")
      const byAssignee: Record<string, { assigned: number; replied: number; closed: number; durs: number[] }> = {};
      for (const row of data) {
        const key = String(row.assigned_to ?? 'Unassigned');
        if (!byAssignee[key]) byAssignee[key] = { assigned: 0, replied: 0, closed: 0, durs: [] };
        byAssignee[key].assigned++;
        if (!['open', 'pending'].includes(row.status)) byAssignee[key].replied++;
        if (['resolved', 'closed'].includes(row.status)) {
          byAssignee[key].closed++;
          if (row.created_at && row.updated_at) {
            const d = new Date(row.updated_at).getTime() - new Date(row.created_at).getTime();
            if (d > 0) byAssignee[key].durs.push(d);
          }
        }
      }
      for (const [inbox, m] of Object.entries(byAssignee).slice(0, 8)) {
        const sorted = m.durs.sort((a, b) => a - b);
        const medMs = sorted[Math.floor(sorted.length / 2)] ?? 0;
        const h = medMs / 3_600_000;
        const medStr = medMs > 0 ? (h < 1 ? `${Math.round(h * 60)}m` : h < 24 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`) : '—';
        const shortInbox = inbox.length > 20 ? inbox.slice(0, 8) + '…' + inbox.slice(-4) : inbox;
        inboxBreakdown.push({ inbox: shortInbox, assigned: m.assigned, replied: m.replied, closed: m.closed, medianClose: medStr });
      }
    }
  } catch (_) {
    // graceful — all zeros
  }

  return {
    period,
    kpis: {
      median_assign_to_first_response: null,
      median_assign_to_subsequent_response: null,
      median_assign_to_close: medianAssignToClose,
      conversations_assigned: conversationsAssigned,
      conversations_replied: conversationsReplied,
      closed_conversations: closedConversations,
    },
    inboxBreakdown,
    isEmpty: conversationsAssigned === 0,
  };
}

// ── Outbound Engagement ───────────────────────────────────────────────────────

async function getOutboundSupabase(scope: ReportScope, period: string, _channel?: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;

  let totalSent = 0;
  const timeSeries: { day: number; count: number }[] = Array.from({ length: days }, (_, i) => ({ day: i, count: 0 }));
  const byUser: { name: string; count: number }[] = [];
  const performance: { title: string; sent: number; goal: number }[] = [];

  try {
    // Try outbound_messages table first
    const { data: omData } = await supabase
      .from('outbound_messages')
      .select('id, created_at, sender_id, subject, sent_count')
      .eq('tenant_id', scope.tenantId)
      .gte('created_at', since);

    if (omData && omData.length > 0) {
      totalSent = omData.reduce((s: number, r: any) => s + Number(r.sent_count || 1), 0);
      const baseMs = Date.now() - days * 86_400_000;
      for (const row of omData) {
        if (!row.created_at) continue;
        const dayIdx = Math.floor((new Date(row.created_at).getTime() - baseMs) / 86_400_000);
        if (dayIdx >= 0 && dayIdx < days && timeSeries[dayIdx]) {
          timeSeries[dayIdx].count += Number(row.sent_count || 1);
        }
      }
    }
  } catch (_) {
    // No outbound_messages table — try cases with outbound tag
    try {
      const { data: caseData } = await supabase
        .from('cases')
        .select('id, created_at, assigned_to, case_type')
        .eq('tenant_id', scope.tenantId)
        .gte('created_at', since)
        .ilike('case_type', '%outbound%');

      if (caseData && caseData.length > 0) {
        totalSent = caseData.length;
        const baseMs = Date.now() - days * 86_400_000;
        for (const row of caseData) {
          if (!row.created_at) continue;
          const dayIdx = Math.floor((new Date(row.created_at).getTime() - baseMs) / 86_400_000);
          if (dayIdx >= 0 && dayIdx < days && timeSeries[dayIdx]) {
            timeSeries[dayIdx].count += 1;
          }
        }
      }
    } catch (__) {
      // completely empty
    }
  }

  return {
    period,
    kpis: {
      total_sent: totalSent,
      send_hours: null,
    },
    timeSeries,
    byUser,
    performance,
    isEmpty: totalSent === 0,
  };
}

export interface ReportRepository {
  getOverview(scope: ReportScope, period: string, channel?: string): Promise<any>;
  getIntents(scope: ReportScope, period: string, channel?: string): Promise<any>;
  getAgents(scope: ReportScope, period: string, channel?: string): Promise<any>;
  getApprovals(scope: ReportScope, period: string, channel?: string): Promise<any>;
  getCosts(scope: ReportScope, period: string, channel?: string): Promise<any>;
  getSLA(scope: ReportScope, period: string, channel?: string): Promise<any>;
  getConversations(scope: ReportScope, period: string, channel?: string): Promise<any>;
  getFinAgent(scope: ReportScope, period: string, channel?: string): Promise<any>;
  getTeammate(scope: ReportScope, period: string, channel?: string): Promise<any>;
  getTickets(scope: ReportScope, period: string, channel?: string): Promise<any>;
  getArticles(scope: ReportScope, period: string, channel?: string): Promise<any>;
  getResponsiveness(scope: ReportScope, period: string, channel?: string): Promise<any>;
  getCsat(scope: ReportScope, period: string, channel?: string): Promise<any>;
  getEffectiveness(scope: ReportScope, period: string, channel?: string): Promise<any>;
  getCalls(scope: ReportScope, period: string, channel?: string): Promise<any>;
  getTeamInbox(scope: ReportScope, period: string, channel?: string): Promise<any>;
  getOutbound(scope: ReportScope, period: string, channel?: string): Promise<any>;
}

export function createReportRepository(): ReportRepository {
  return {
    getOverview: getOverviewSupabase,
    getIntents: getIntentsSupabase,
    getAgents: getAgentsSupabase,
    getApprovals: getApprovalsSupabase,
    getCosts: getCostsSupabase,
    getSLA: getSLASupabase,
    getConversations: getConversationsSupabase,
    getFinAgent: getFinAgentSupabase,
    getTeammate: getTeammateSupabase,
    getTickets: getTicketsSupabase,
    getArticles: getArticlesSupabase,
    getResponsiveness: getResponsivenessSupabase,
    getCsat: getCsatSupabase,
    getEffectiveness: getEffectivenessSupabase,
    getCalls: getCallsSupabase,
    getTeamInbox: getTeamInboxSupabase,
    getOutbound: getOutboundSupabase,
  };
}
