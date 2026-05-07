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
  const tsByDay = new Map<number, number>();
  const daysNum = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const baseMs = Date.now() - daysNum * 86_400_000;

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

    if (run.started_at) {
      const dayIdx = Math.floor((new Date(run.started_at).getTime() - baseMs) / 86_400_000);
      if (dayIdx >= 0 && dayIdx < daysNum) tsByDay.set(dayIdx, (tsByDay.get(dayIdx) ?? 0) + 1);
    }
  }

  const timeSeries = Array.from({ length: daysNum }, (_, i) => ({ day: i, runs: tsByDay.get(i) ?? 0 }));

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

  return { period, agents: rows, timeSeries };
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
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const baseMs = Date.now() - days * 86_400_000;
  let query = supabase
    .from('cases')
    .select('sla_status, priority, type, created_at')
    .eq('tenant_id', scope.tenantId)
    .gte('created_at', since);
  const normalizedChannel = normalizeChannel(channel);
  if (normalizedChannel) query = query.eq('source_channel', normalizedChannel);
  const { data, error } = await query;
  if (error) throw error;

  const distMap = new Map<string, number>();
  const prioMap = new Map<string, number>();
  const typeMap = new Map<string, number>();
  const tsByDay = new Map<number, { compliant: number; breached: number }>();

  for (const row of (data || [])) {
    const s = row.sla_status || 'unknown';
    distMap.set(s, (distMap.get(s) || 0) + 1);

    const pk = `${row.priority}:${s}`;
    prioMap.set(pk, (prioMap.get(pk) || 0) + 1);

    if (row.sla_status === 'breached') {
      const t = row.type || 'unknown';
      typeMap.set(t, (typeMap.get(t) || 0) + 1);
    }

    // time series
    if (row.created_at && (row.sla_status === 'compliant' || row.sla_status === 'breached')) {
      const dayIdx = Math.floor((new Date(row.created_at).getTime() - baseMs) / 86_400_000);
      if (dayIdx >= 0 && dayIdx < days) {
        const b = tsByDay.get(dayIdx) ?? { compliant: 0, breached: 0 };
        if (row.sla_status === 'compliant') b.compliant++;
        else b.breached++;
        tsByDay.set(dayIdx, b);
      }
    }
  }

  const timeSeries = Array.from({ length: days }, (_, i) => {
    const b = tsByDay.get(i) ?? { compliant: 0, breached: 0 };
    return { day: i, compliant: b.compliant, breached: b.breached };
  });

  return {
    period,
    distribution: Array.from(distMap.entries()).map(([status, count]) => ({ status, count })),
    byPriority: Array.from(prioMap.entries()).map(([k, count]) => {
      const [priority, slaStatus] = k.split(':');
      return { priority, slaStatus, count };
    }),
    breachedByType: Array.from(typeMap.entries()).map(([type, count]) => ({ type, count })).sort((a,b) => b.count - a.count).slice(0, 10),
    timeSeries,
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

async function getTeammateSupabase(scope: ReportScope, period: string, channel?: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const normalizedChannel = normalizeChannel(channel);
  const baseMs = Date.now() - days * 86_400_000;
  let members: any[] = [];
  const teamTimeSeries: { day: number; count: number }[] = Array.from({ length: days }, (_, i) => ({ day: i, count: 0 }));

  try {
    // Load workspace members
    const { data: wmData, error: wmErr } = await supabase
      .from('workspace_members')
      .select('user_id, display_name, email, role, team, is_active')
      .eq('tenant_id', scope.tenantId)
      .eq('is_active', true);
    if (wmErr) throw wmErr;

    const memberList = wmData || [];
    if (memberList.length === 0) {
      return { period, members: [], isEmpty: true, teamTimeSeries };
    }

    // Load cases for the period grouped by assigned_user_id
    let casesQ = supabase
      .from('cases')
      .select('assigned_user_id, status, created_at, closed_at, first_response_at, satisfaction_score')
      .eq('tenant_id', scope.tenantId)
      .gte('created_at', since);
    if (normalizedChannel) casesQ = casesQ.eq('source_channel', normalizedChannel);
    const { data: casesData } = await casesQ;

    // Aggregate per user
    const userMetrics = new Map<string, {
      assigned: number; replied: number; closed: number;
      durs: number[]; firstResp: number[];
      csatSum: number; csatCount: number;
    }>();
    for (const row of (casesData || [])) {
      const uid = row.assigned_user_id;
      if (!uid) continue;
      const m = userMetrics.get(uid) ?? { assigned: 0, replied: 0, closed: 0, durs: [], firstResp: [], csatSum: 0, csatCount: 0 };
      m.assigned++;
      if (!['open', 'pending'].includes(row.status)) m.replied++;
      if (['resolved', 'closed'].includes(row.status)) {
        m.closed++;
        const closeTs = row.closed_at || null;
        if (closeTs && row.created_at) {
          const d = new Date(closeTs).getTime() - new Date(row.created_at).getTime();
          if (d > 0) m.durs.push(d);
        }
        // count closed cases per day for team time series
        if (row.closed_at) {
          const dayIdx = Math.floor((new Date(row.closed_at).getTime() - baseMs) / 86_400_000);
          if (dayIdx >= 0 && dayIdx < days) teamTimeSeries[dayIdx].count++;
        }
      }
      if (row.first_response_at && row.created_at) {
        const d = new Date(row.first_response_at).getTime() - new Date(row.created_at).getTime();
        if (d > 0) m.firstResp.push(d);
      }
      if (row.satisfaction_score != null) {
        const s = Number(row.satisfaction_score);
        if (!isNaN(s)) { m.csatSum += s; m.csatCount++; }
      }
      userMetrics.set(uid, m);
    }

    const msToStr = (ms: number) => {
      const h = ms / 3_600_000;
      return h < 1 ? `${Math.round(h * 60)}m` : h < 24 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
    };
    const median = (arr: number[]) => {
      if (!arr.length) return null;
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };

    members = memberList.map((m: any) => {
      const met = userMetrics.get(m.user_id) ?? { assigned: 0, replied: 0, closed: 0, durs: [], firstResp: [], csatSum: 0, csatCount: 0 };
      const medDur = median(met.durs);
      const medFirst = median(met.firstResp);
      return {
        userId: m.user_id,
        name: m.display_name || m.user_id,
        email: m.email,
        role: m.role || 'agent',
        team: m.team,
        casesAssigned: met.assigned,
        casesReplied: met.replied,
        casesClosed: met.closed,
        medianHandleTime: medDur ? msToStr(medDur) : null,
        medianFirstResponse: medFirst ? msToStr(medFirst) : null,
        medianAssignToClose: medDur ? msToStr(medDur) : null,
        medianAssignToFirstResp: medFirst ? msToStr(medFirst) : null,
        avgCsat: met.csatCount > 0 ? `${Math.round((met.csatSum / met.csatCount / 5) * 100)}%` : null,
      };
    }).sort((a: any, b: any) => b.casesAssigned - a.casesAssigned);
  } catch (_) {
    // workspace_members not accessible — return empty
  }

  return {
    period,
    members,
    isEmpty: members.length === 0,
    teamTimeSeries,
  };
}

async function getTicketsSupabase(scope: ReportScope, period: string, channel?: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const normalizedChannel = normalizeChannel(channel);

  let query = supabase
    .from('cases')
    .select('id, type, status, created_at, closed_at, assigned_user_id')
    .eq('tenant_id', scope.tenantId)
    .gte('created_at', since);
  if (normalizedChannel) query = query.eq('source_channel', normalizedChannel);
  query = query.or("type.like.%ticket%,type.eq.technical_support");

  const { data, error } = await query;
  if (error) {
    return {
      period,
      kpis: { new_tickets: 0, resolved_tickets: 0, open_tickets: 0, median_resolution: null, median_time_submitted: null, median_time_in_progress: null, median_time_waiting: null },
      byType: [],
      byTeam: [],
      byAssignee: [],
      timeSeries: Array.from({ length: days }, (_, i) => ({ day: i, count: 0 })),
    };
  }

  const rows = data || [];
  const newTickets = rows.length;
  const resolvedTickets = rows.filter((r: any) => ['resolved', 'closed'].includes(r.status)).length;
  const openTickets = rows.filter((r: any) => !['resolved', 'closed', 'cancelled'].includes(r.status)).length;

  // median_resolution = median(closed_at - created_at) for resolved tickets
  let median_resolution: string | null = null;
  const resolvedDurations: number[] = [];
  for (const r of rows) {
    if (['resolved', 'closed'].includes(r.status) && r.closed_at && r.created_at) {
      const ms = new Date(r.closed_at).getTime() - new Date(r.created_at).getTime();
      if (ms > 0) resolvedDurations.push(ms);
    }
  }
  if (resolvedDurations.length > 0) {
    const sorted = [...resolvedDurations].sort((a, b) => a - b);
    const medMs = sorted[Math.floor(sorted.length / 2)];
    const h = medMs / 3_600_000;
    median_resolution = h < 1 ? `${Math.round(h * 60)}m` : h < 24 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
  }

  // Try status history for time-in-state KPIs
  let median_time_submitted: string | null = null;
  let median_time_in_progress: string | null = null;
  let median_time_waiting: string | null = null;
  const caseIds = rows.map((r: any) => r.id).filter(Boolean);
  if (caseIds.length > 0) {
    try {
      const { data: histData } = await supabase
        .from('case_status_history')
        .select('case_id, from_status, to_status, created_at')
        .eq('tenant_id', scope.tenantId)
        .in('case_id', caseIds.slice(0, 500));

      if (histData && histData.length > 0) {
        // Group by case_id, sort by created_at, compute time in each state
        const byCase = new Map<string, any[]>();
        for (const h of histData) {
          const arr = byCase.get(h.case_id) ?? [];
          arr.push(h);
          byCase.set(h.case_id, arr);
        }

        const submittedMs: number[] = [];
        const inProgressMs: number[] = [];
        const waitingMs: number[] = [];

        for (const [, events] of byCase) {
          const sorted = events.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          for (let i = 0; i < sorted.length - 1; i++) {
            const dur = new Date(sorted[i + 1].created_at).getTime() - new Date(sorted[i].created_at).getTime();
            if (dur <= 0) continue;
            const toStatus = sorted[i].to_status?.toLowerCase() ?? '';
            if (!sorted[i].from_status || sorted[i].from_status === 'open') submittedMs.push(dur);
            if (toStatus.includes('progress') || toStatus === 'processing') inProgressMs.push(dur);
            if (toStatus.includes('wait')) waitingMs.push(dur);
          }
        }

        const msToStr = (ms: number) => { const h = ms / 3_600_000; return h < 1 ? `${Math.round(h * 60)}m` : h < 24 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`; };

        if (submittedMs.length > 0) {
          const s = [...submittedMs].sort((a, b) => a - b);
          median_time_submitted = msToStr(s[Math.floor(s.length / 2)]);
        }
        if (inProgressMs.length > 0) {
          const s = [...inProgressMs].sort((a, b) => a - b);
          median_time_in_progress = msToStr(s[Math.floor(s.length / 2)]);
        }
        if (waitingMs.length > 0) {
          const s = [...waitingMs].sort((a, b) => a - b);
          median_time_waiting = msToStr(s[Math.floor(s.length / 2)]);
        }
      }
    } catch (_) { /* case_status_history not ready */ }
  }

  const typeCounts = new Map<string, number>();
  const assigneeCounts = new Map<string, number>();
  for (const row of rows) {
    const t = row.type || 'ticket';
    typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
    if (row.assigned_user_id) {
      const short = String(row.assigned_user_id).slice(0, 8);
      assigneeCounts.set(short, (assigneeCounts.get(short) || 0) + 1);
    }
  }
  const byType = Array.from(typeCounts.entries()).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
  const byAssignee = Array.from(assigneeCounts.entries()).map(([assignee, count]) => ({ assignee, count })).sort((a, b) => b.count - a.count).slice(0, 8);

  const sinceMs = new Date(since).getTime();
  const buckets: Record<string, number> = {};
  for (const row of rows) {
    const dayIndex = Math.floor((new Date(row.created_at).getTime() - sinceMs) / 86_400_000);
    const key = String(Math.min(Math.max(dayIndex, 0), days - 1));
    buckets[key] = (buckets[key] || 0) + 1;
  }
  const timeSeries = Array.from({ length: days }, (_, i) => ({ day: i, count: buckets[String(i)] || 0 }));

  return {
    period,
    kpis: { new_tickets: newTickets, resolved_tickets: resolvedTickets, open_tickets: openTickets, median_resolution, median_time_submitted, median_time_in_progress, median_time_waiting },
    byType,
    byTeam: [],
    byAssignee,
    timeSeries,
  };
}

async function getArticlesSupabase(scope: ReportScope, period: string, _channel?: string) {
  const supabase = getSupabaseAdmin();
  let totalArticles = 0;
  let publishedArticles = 0;
  let draftArticles = 0;
  let searchHitsTotal = 0;
  let viewCountTotal = 0;
  let helpfulTotal = 0;
  let unhelpfulTotal = 0;
  let deflectedTotal = 0;
  const topArticles: { title: string; views: number; helpful: number; unhelpful: number; deflected: number }[] = [];

  try {
    const { data, error } = await supabase
      .from('knowledge_articles')
      .select('title, status, search_hits, view_count, helpful_count, unhelpful_count, conversation_deflected_count')
      .eq('tenant_id', scope.tenantId);
    if (!error && data) {
      totalArticles = data.length;
      publishedArticles = data.filter((r: any) => r.status === 'published').length;
      draftArticles = data.filter((r: any) => r.status === 'draft').length;

      for (const r of data) {
        searchHitsTotal += Number(r.search_hits || 0);
        viewCountTotal += Number(r.view_count || 0);
        helpfulTotal += Number(r.helpful_count || 0);
        unhelpfulTotal += Number(r.unhelpful_count || 0);
        deflectedTotal += Number(r.conversation_deflected_count || 0);
      }

      // Top 5 articles by views
      const sorted = [...data].sort((a: any, b: any) => Number(b.view_count || 0) - Number(a.view_count || 0));
      for (const r of sorted.slice(0, 5)) {
        topArticles.push({
          title: String(r.title || 'Untitled'),
          views: Number(r.view_count || 0),
          helpful: Number(r.helpful_count || 0),
          unhelpful: Number(r.unhelpful_count || 0),
          deflected: Number(r.conversation_deflected_count || 0),
        });
      }
    }
  } catch (_) {
    // table doesn't exist — return zeros
  }

  return {
    period,
    kpis: {
      total_articles: totalArticles,
      published_articles: publishedArticles,
      draft_articles: draftArticles,
      search_hits_total: searchHitsTotal,
      view_count_total: viewCountTotal,
      helpful_total: helpfulTotal,
      unhelpful_total: unhelpfulTotal,
      deflected_total: deflectedTotal,
      helpfulness_rate: pct(helpfulTotal, (helpfulTotal + unhelpfulTotal) || 1),
    },
    topArticles,
  };
}

async function getResponsivenessSupabase(scope: ReportScope, period: string, channel?: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const normalizedChannel = normalizeChannel(channel);
  const baseMs = Date.now() - days * 86_400_000;

  let medianFirstResponse: string | null = null;
  let medianTimeToClose: string | null = null;
  const dist = [
    { bucket: '< 5m', count: 0 },
    { bucket: '5m - 15m', count: 0 },
    { bucket: '15m - 30m', count: 0 },
    { bucket: '30m - 1h', count: 0 },
    { bucket: '1h - 3h', count: 0 },
    { bucket: '3h - 8h', count: 0 },
    { bucket: '> 8h', count: 0 },
  ];
  const tsByDay = new Map<number, { sum: number; count: number }>();

  try {
    let query = supabase
      .from('cases')
      .select('created_at, first_response_at, closed_at, status')
      .eq('tenant_id', scope.tenantId)
      .gte('created_at', since);
    if (normalizedChannel) query = query.eq('source_channel', normalizedChannel);
    const { data } = await query;

    if (data && data.length > 0) {
      // First response times
      const firstRespMs: number[] = [];
      for (const row of data) {
        if (row.first_response_at && row.created_at) {
          const ms = new Date(row.first_response_at).getTime() - new Date(row.created_at).getTime();
          if (ms > 0) {
            firstRespMs.push(ms);
            const mins = ms / 60_000;
            if (mins < 5) dist[0].count++;
            else if (mins < 15) dist[1].count++;
            else if (mins < 30) dist[2].count++;
            else if (mins < 60) dist[3].count++;
            else if (mins < 180) dist[4].count++;
            else if (mins < 480) dist[5].count++;
            else dist[6].count++;

            // time series — avg first response per day
            const dayIdx = Math.floor((new Date(row.created_at).getTime() - baseMs) / 86_400_000);
            if (dayIdx >= 0 && dayIdx < days) {
              const b = tsByDay.get(dayIdx) ?? { sum: 0, count: 0 };
              b.sum += ms / 60_000; // minutes
              b.count++;
              tsByDay.set(dayIdx, b);
            }
          }
        }
      }
      if (firstRespMs.length > 0) {
        const sorted = firstRespMs.sort((a, b) => a - b);
        const medMs = sorted[Math.floor(sorted.length / 2)];
        const h = medMs / 3_600_000;
        medianFirstResponse = h < 1 ? `${Math.round(h * 60)}m` : h < 24 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
      }

      // Time to close
      const closeMs: number[] = [];
      for (const row of data) {
        if (['resolved', 'closed'].includes(row.status) && row.closed_at && row.created_at) {
          const ms = new Date(row.closed_at).getTime() - new Date(row.created_at).getTime();
          if (ms > 0) closeMs.push(ms);
        }
      }
      if (closeMs.length > 0) {
        const sorted = closeMs.sort((a, b) => a - b);
        const medMs = sorted[Math.floor(sorted.length / 2)];
        const h = medMs / 3_600_000;
        medianTimeToClose = h < 1 ? `${Math.round(h * 60)}m` : h < 24 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
      }
    }
  } catch (_) {
    // column or table issue — keep null
  }

  const timeSeries = Array.from({ length: days }, (_, i) => {
    const b = tsByDay.get(i) ?? { sum: 0, count: 0 };
    return { day: i, avgMinutes: b.count > 0 ? Math.round(b.sum / b.count) : 0 };
  });

  return {
    period,
    kpis: {
      median_response_time: medianFirstResponse,
      median_first_response: medianFirstResponse,
      median_time_to_close: medianTimeToClose,
    },
    distribution: dist,
    timeSeries,
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
  let requestRate = '0%';
  let responseRate = '0%';
  const scoreDistribution = [1, 2, 3, 4, 5].map(s => ({ score: s, count: 0 }));

  try {
    let query = supabase
      .from('cases')
      .select('satisfaction_score, survey_sent_at, survey_responded_at, status')
      .eq('tenant_id', scope.tenantId)
      .gte('created_at', since);
    if (normalizedChannel) query = query.eq('source_channel', normalizedChannel);
    const { data } = await query;

    if (data && data.length > 0) {
      const closed = data.filter((r: any) => ['resolved', 'closed'].includes(r.status));
      const surveySent = data.filter((r: any) => r.survey_sent_at != null);
      const surveyResponded = data.filter((r: any) => r.survey_responded_at != null);
      const withScore = data.filter((r: any) => r.satisfaction_score != null);

      // request_rate = % of closed cases that got a survey
      requestRate = pct(surveySent.length, closed.length || 1);
      // response_rate = % of surveys that got a response
      responseRate = pct(surveyResponded.length, surveySent.length || 1);

      if (withScore.length > 0) {
        positiveCount = withScore.filter((r: any) => r.satisfaction_score >= 4).length;
        neutralCount = withScore.filter((r: any) => r.satisfaction_score === 3).length;
        negativeCount = withScore.filter((r: any) => r.satisfaction_score <= 2).length;
        overallCsat = Math.round((positiveCount / withScore.length) * 100);
        for (const row of withScore) {
          const s = Number(row.satisfaction_score);
          const entry = scoreDistribution.find(e => e.score === s);
          if (entry) entry.count++;
        }
      }
    }
  } catch (_) {
    // column doesn't exist — return zeros
  }

  // Teammate CSAT: cases assigned to a human (not auto-resolved by AI)
  let teammateCsatScore = 0;
  let teammateCsatCount = 0;
  let finCsatScore = 0;
  let finCsatCount = 0;
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const baseMs = Date.now() - days * 86_400_000;
  const tsByDay = new Map<number, { sum: number; count: number }>();
  const userCsatMap = new Map<string, { sum: number; count: number }>();

  try {
    let qh = supabase.from('cases').select('satisfaction_score, assigned_user_id, execution_state, created_at').eq('tenant_id', scope.tenantId).gte('created_at', since).not('satisfaction_score', 'is', null);
    if (normalizedChannel) qh = qh.eq('source_channel', normalizedChannel);
    const { data: csatRows } = await qh;
    if (csatRows) {
      for (const r of csatRows) {
        const score = Number(r.satisfaction_score);
        if (!isNaN(score)) {
          if (r.execution_state === 'completed') {
            finCsatScore += score; finCsatCount++;
          } else if (r.assigned_user_id) {
            teammateCsatScore += score; teammateCsatCount++;
          }

          // time series by day
          if (r.created_at) {
            const dayIdx = Math.floor((new Date(r.created_at).getTime() - baseMs) / 86_400_000);
            if (dayIdx >= 0 && dayIdx < days) {
              const b = tsByDay.get(dayIdx) ?? { sum: 0, count: 0 };
              b.sum += score; b.count++;
              tsByDay.set(dayIdx, b);
            }
          }

          // per-user CSAT
          if (r.assigned_user_id) {
            const m = userCsatMap.get(r.assigned_user_id) ?? { sum: 0, count: 0 };
            m.sum += score; m.count++;
            userCsatMap.set(r.assigned_user_id, m);
          }
        }
      }
    }
  } catch (_) { /* satisfaction_score not ready */ }

  const timeSeries = Array.from({ length: days }, (_, i) => {
    const b = tsByDay.get(i) ?? { sum: 0, count: 0 };
    return { day: i, avgScore: b.count > 0 ? Math.round((b.sum / b.count) * 10) / 10 : 0, count: b.count };
  });

  const teammateCsatBreakdown = Array.from(userCsatMap.entries()).map(([uid, m]) => ({
    userId: uid,
    name: uid,
    avgCsat: Math.round((m.sum / m.count / 5) * 100),
    count: m.count,
  })).sort((a, b) => b.avgCsat - a.avgCsat);

  return {
    period,
    kpis: {
      overall_csat: overallCsat,
      positive_count: positiveCount,
      neutral_count: neutralCount,
      negative_count: negativeCount,
      request_rate: requestRate,
      response_rate: responseRate,
      teammate_csat: teammateCsatCount > 0 ? Math.round((teammateCsatScore / teammateCsatCount / 5) * 100) : null,
      teammate_csat_count: teammateCsatCount,
      fin_csat: finCsatCount > 0 ? Math.round((finCsatScore / finCsatCount / 5) * 100) : null,
      fin_csat_count: finCsatCount,
    },
    scoreDistribution,
    timeSeries,
    teammateCsatBreakdown,
  };
}

async function getEffectivenessSupabase(scope: ReportScope, period: string, channel?: string) {
  const supabase = getSupabaseAdmin();
  const since = periodToISO(period);
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
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

  // First contact resolution: closed within 1 hour of creation, no reassignment
  let firstContactResolved = 0;
  let firstContactTotal = 0;
  let totalReassigned = 0;
  let medianRepliesToClose: number | null = null;
  let median_time_to_first_assignment: string | null = null;
  let median_time_from_assign_to_close: string | null = null;
  const baseMs = Date.now() - days * 86_400_000;
  const fcrByDay = new Map<number, { resolved: number; total: number }>();

  try {
    let query = supabase
      .from('cases')
      .select('id, created_at, closed_at, first_response_at, status, reassigned_count')
      .eq('tenant_id', scope.tenantId)
      .gte('created_at', since);
    if (normalizedChannel) query = query.eq('source_channel', normalizedChannel);
    const { data } = await query;
    if (data) {
      firstContactTotal = data.filter((r: any) => ['resolved', 'closed'].includes(r.status)).length;
      firstContactResolved = data.filter((r: any) => {
        if (!['resolved', 'closed'].includes(r.status)) return false;
        const closeTs = r.closed_at || null;
        if (!closeTs || !r.created_at) return false;
        const diffMs = new Date(closeTs).getTime() - new Date(r.created_at).getTime();
        return diffMs > 0 && diffMs < 3_600_000 && (r.reassigned_count ?? 0) === 0;
      }).length;
      totalReassigned = data.reduce((s: number, r: any) => s + Number(r.reassigned_count || 0), 0);

      // median_time_to_first_assignment = median(first_response_at - created_at) as proxy
      const assignDeltas: number[] = [];
      for (const r of data) {
        if (r.first_response_at && r.created_at) {
          const ms = new Date(r.first_response_at).getTime() - new Date(r.created_at).getTime();
          if (ms > 0) assignDeltas.push(ms);
        }
      }
      if (assignDeltas.length > 0) {
        const sorted = [...assignDeltas].sort((a, b) => a - b);
        const medMs = sorted[Math.floor(sorted.length / 2)];
        const h = medMs / 3_600_000;
        median_time_to_first_assignment = h < 1 ? `${Math.round(h * 60)}m` : h < 24 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
      }

      // median_time_from_assign_to_close = median(closed_at - first_response_at) for closed cases
      const assignToCloseDeltas: number[] = [];
      for (const r of data) {
        if (['resolved', 'closed'].includes(r.status) && r.closed_at && r.first_response_at) {
          const ms = new Date(r.closed_at).getTime() - new Date(r.first_response_at).getTime();
          if (ms > 0) assignToCloseDeltas.push(ms);
        }
      }
      if (assignToCloseDeltas.length > 0) {
        const sorted = [...assignToCloseDeltas].sort((a, b) => a - b);
        const medMs = sorted[Math.floor(sorted.length / 2)];
        const h = medMs / 3_600_000;
        median_time_from_assign_to_close = h < 1 ? `${Math.round(h * 60)}m` : h < 24 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
      }

      // FCR per day time series
      for (const r of data) {
        if (!r.created_at) continue;
        const dayIdx = Math.floor((new Date(r.created_at).getTime() - baseMs) / 86_400_000);
        if (dayIdx < 0 || dayIdx >= days) continue;
        const bucket = fcrByDay.get(dayIdx) ?? { resolved: 0, total: 0 };
        if (['resolved', 'closed'].includes(r.status)) {
          bucket.total++;
          const closeTs = r.closed_at || null;
          if (closeTs && r.created_at) {
            const diffMs = new Date(closeTs).getTime() - new Date(r.created_at).getTime();
            if (diffMs > 0 && diffMs < 3_600_000 && (r.reassigned_count ?? 0) === 0) bucket.resolved++;
          }
        }
        fcrByDay.set(dayIdx, bucket);
      }
    }
  } catch (_) {
    // column missing — use safe defaults
  }

  // Median replies-to-close: count outbound messages per case then median
  try {
    let msgQ = supabase
      .from('messages')
      .select('case_id, direction')
      .eq('tenant_id', scope.tenantId)
      .eq('direction', 'outbound')
      .gte('sent_at', since);
    const { data: msgData } = await msgQ;
    if (msgData && msgData.length > 0) {
      const repliesPerCase = new Map<string, number>();
      for (const row of msgData) {
        if (row.case_id) repliesPerCase.set(row.case_id, (repliesPerCase.get(row.case_id) || 0) + 1);
      }
      const counts = Array.from(repliesPerCase.values()).sort((a, b) => a - b);
      if (counts.length > 0) medianRepliesToClose = counts[Math.floor(counts.length / 2)];
    }
  } catch (_) { /* messages table issue */ }

  const nTotal = total || 0;
  const nReplied = replied || 0;
  const fcrRate = firstContactTotal > 0 ? pct(firstContactResolved, firstContactTotal) : '0%';
  const timeSeries = Array.from({ length: days }, (_, i) => {
    const b = fcrByDay.get(i) ?? { resolved: 0, total: 0 };
    return { day: i, fcr_rate: b.total > 0 ? Math.round((b.resolved / b.total) * 100) : 0 };
  });

  return {
    period,
    kpis: {
      conversations_replied_to: nReplied,
      first_contact_resolution: fcrRate,
      first_contact_resolved: firstContactResolved,
      first_contact_total: firstContactTotal,
      conversations_reassigned: totalReassigned,
      median_replies_to_close: medianRepliesToClose,
      total_conversations: nTotal,
      median_time_to_first_assignment,
      median_time_from_assign_to_close,
    },
    timeSeries,
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
  let totalDurationSecs = 0;
  let durCount = 0;
  const timeSeries: { day: number; count: number }[] = Array.from({ length: days }, (_, i) => ({ day: i, count: 0 }));
  const byDirection: { direction: string; count: number }[] = [];
  const baseMs = Date.now() - days * 86_400_000;

  // ── Primary: calls table ───────────────────────────────────────────────────
  let usedCallsTable = false;
  try {
    let q = supabase
      .from('calls')
      .select('direction, channel, started_at, duration_secs')
      .eq('tenant_id', scope.tenantId)
      .gte('started_at', since);
    if (channel && channel !== 'all') q = q.eq('channel', channel);

    const { data, error } = await q;
    if (!error && data && data.length > 0) {
      usedCallsTable = true;
      for (const row of data) {
        const ch = row.channel || 'phone';
        const dir = row.direction || 'inbound';
        if (ch === 'messenger') messengerCalls++;
        else if (dir === 'outbound') outboundCalls++;
        else inboundCalls++;
        if (row.duration_secs != null) { totalDurationSecs += Number(row.duration_secs); durCount++; }
        if (row.started_at) {
          const dayIdx = Math.floor((new Date(row.started_at).getTime() - baseMs) / 86_400_000);
          if (dayIdx >= 0 && dayIdx < days) timeSeries[dayIdx].count += 1;
        }
      }
    }
  } catch (_) { /* calls table not accessible */ }

  // ── Fallback: cases with phone-like source_channel ─────────────────────────
  if (!usedCallsTable) {
    try {
      let q = supabase
        .from('cases')
        .select('source_channel, created_at')
        .eq('tenant_id', scope.tenantId)
        .gte('created_at', since)
        .in('source_channel', ['phone', 'voice', 'call', 'messenger_call', 'video']);
      const { data } = await q;
      if (data) {
        for (const row of data) {
          const ch = row.source_channel || '';
          if (ch === 'messenger_call') messengerCalls++;
          else if (ch.includes('outbound')) outboundCalls++;
          else inboundCalls++;
          if (row.created_at) {
            const dayIdx = Math.floor((new Date(row.created_at).getTime() - baseMs) / 86_400_000);
            if (dayIdx >= 0 && dayIdx < days) timeSeries[dayIdx].count += 1;
          }
        }
      }
    } catch (_) { /* no calls data */ }
  }

  if (inboundCalls > 0) byDirection.push({ direction: 'inbound', count: inboundCalls });
  if (outboundCalls > 0) byDirection.push({ direction: 'outbound', count: outboundCalls });
  if (messengerCalls > 0) byDirection.push({ direction: 'messenger', count: messengerCalls });

  const medianDuration = durCount > 0 ? `${Math.round(totalDurationSecs / durCount / 60)}m` : null;

  return {
    period,
    kpis: {
      inbound_calls: inboundCalls,
      outbound_calls: outboundCalls,
      messenger_calls: messengerCalls,
      total_calls: inboundCalls + outboundCalls + messengerCalls,
      median_call_duration: medianDuration,
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
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const normalizedChannel = normalizeChannel(channel);

  let conversationsAssigned = 0;
  let conversationsReplied = 0;
  let closedConversations = 0;
  let medianAssignToClose: string | null = null;
  let median_assign_to_first_response: string | null = null;
  const inboxBreakdown: { inbox: string; assigned: number; replied: number; closed: number; medianClose: string }[] = [];
  const baseMs = Date.now() - days * 86_400_000;
  const countByDay = new Map<number, number>();

  try {
    let baseQuery = supabase
      .from('cases')
      .select('id, status, created_at, closed_at, assigned_user_id, first_response_at')
      .eq('tenant_id', scope.tenantId)
      .gte('created_at', since);
    if (normalizedChannel) baseQuery = baseQuery.eq('source_channel', normalizedChannel);
    const { data } = await baseQuery;

    if (data && data.length > 0) {
      conversationsAssigned = data.filter((r: any) => r.assigned_user_id != null).length;
      conversationsReplied = data.filter((r: any) => !['open', 'pending'].includes(r.status)).length;
      closedConversations = data.filter((r: any) => ['resolved', 'closed'].includes(r.status)).length;

      // Median time to close using closed_at
      const closedRows = data.filter((r: any) =>
        ['resolved', 'closed'].includes(r.status) && r.created_at && r.closed_at
      );
      if (closedRows.length > 0) {
        const durations = closedRows
          .map((r: any) => new Date(r.closed_at).getTime() - new Date(r.created_at).getTime())
          .filter((d: number) => d > 0)
          .sort((a: number, b: number) => a - b);
        if (durations.length > 0) {
          const medMs = durations[Math.floor(durations.length / 2)];
          const h = medMs / 3_600_000;
          medianAssignToClose = h < 1 ? `${Math.round(h * 60)}m` : h < 24 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
        }
      }

      // median_assign_to_first_response = median(first_response_at - created_at) for assigned cases
      const assignFirstRespMs: number[] = [];
      for (const r of data) {
        if (r.assigned_user_id && r.first_response_at && r.created_at) {
          const ms = new Date(r.first_response_at).getTime() - new Date(r.created_at).getTime();
          if (ms > 0) assignFirstRespMs.push(ms);
        }
      }
      if (assignFirstRespMs.length > 0) {
        const sorted = [...assignFirstRespMs].sort((a, b) => a - b);
        const medMs = sorted[Math.floor(sorted.length / 2)];
        const h = medMs / 3_600_000;
        median_assign_to_first_response = h < 1 ? `${Math.round(h * 60)}m` : h < 24 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
      }

      // Cases per day time series
      for (const r of data) {
        if (!r.created_at) continue;
        const dayIdx = Math.floor((new Date(r.created_at).getTime() - baseMs) / 86_400_000);
        if (dayIdx >= 0 && dayIdx < days) countByDay.set(dayIdx, (countByDay.get(dayIdx) ?? 0) + 1);
      }

      // Group by assigned_user_id
      const byAssignee: Record<string, { assigned: number; replied: number; closed: number; durs: number[] }> = {};
      for (const row of data) {
        const key = String(row.assigned_user_id ?? 'Unassigned');
        if (!byAssignee[key]) byAssignee[key] = { assigned: 0, replied: 0, closed: 0, durs: [] };
        byAssignee[key].assigned++;
        if (!['open', 'pending'].includes(row.status)) byAssignee[key].replied++;
        if (['resolved', 'closed'].includes(row.status)) {
          byAssignee[key].closed++;
          if (row.created_at && row.closed_at) {
            const d = new Date(row.closed_at).getTime() - new Date(row.created_at).getTime();
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

  const timeSeries = Array.from({ length: days }, (_, i) => ({ day: i, count: countByDay.get(i) ?? 0 }));

  return {
    period,
    kpis: {
      median_assign_to_first_response,
      median_assign_to_subsequent_response: null,
      median_assign_to_close: medianAssignToClose,
      conversations_assigned: conversationsAssigned,
      conversations_replied: conversationsReplied,
      closed_conversations: closedConversations,
    },
    inboxBreakdown,
    timeSeries,
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
    // outbound_messages table: sent_by, sent_at, channel, status, subject
    const { data: omData, error: omErr } = await supabase
      .from('outbound_messages')
      .select('id, sent_at, sent_by, channel, status, subject')
      .eq('tenant_id', scope.tenantId)
      .gte('sent_at', since);

    if (!omErr && omData) {
      totalSent = omData.length;
      const baseMs = Date.now() - days * 86_400_000;

      // per-user counts
      const userMap = new Map<string, number>();
      for (const row of omData) {
        const ts = row.sent_at;
        if (ts) {
          const dayIdx = Math.floor((new Date(ts).getTime() - baseMs) / 86_400_000);
          if (dayIdx >= 0 && dayIdx < days) timeSeries[dayIdx].count += 1;
        }
        const u = String(row.sent_by || 'System');
        userMap.set(u, (userMap.get(u) || 0) + 1);
      }
      for (const [name, count] of Array.from(userMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
        byUser.push({ name, count });
      }

      // performance: group by subject/channel
      const perfMap = new Map<string, { sent: number }>();
      for (const row of omData) {
        const key = row.subject || row.channel || 'Campaign';
        const p = perfMap.get(key) || { sent: 0 };
        p.sent++;
        perfMap.set(key, p);
      }
      for (const [title, m] of Array.from(perfMap.entries()).sort((a, b) => b[1].sent - a[1].sent).slice(0, 5)) {
        performance.push({ title, sent: m.sent, goal: 0 });
      }
    }
  } catch (_) {
    // outbound_messages not accessible — keep zeros
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
