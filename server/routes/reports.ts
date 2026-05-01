/**
 * server/routes/reports.ts
 *
 * Reports & KPI API — Refactored to Repository Pattern.
 */

import { Router, Request, Response } from 'express';
import { createReportRepository } from '../data/index.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';

const router = Router();
router.use(extractMultiTenant);

const reportRepository = createReportRepository();

function normalizeChannelParam(value: unknown): string {
  return String(value ?? 'all').trim().toLowerCase() || 'all';
}

function buildGeneratedSummary(payload: {
  period: string;
  channel: string;
  audience: string;
  overview: any;
  intents: any;
  agents: any;
  approvals: any;
  costs: any;
  sla: any;
}) {
  const { period, channel, audience, overview, intents, agents, approvals, costs, sla } = payload;
  const kpis = Array.isArray(overview?.kpis) ? overview.kpis : [];
  const topIntent = intents?.intents?.[0] ?? null;
  const weakestAgent = [...(agents?.agents ?? [])].sort((a: any, b: any) => {
    const aRate = Number.parseFloat(String(a?.successRate ?? '0'));
    const bRate = Number.parseFloat(String(b?.successRate ?? '0'));
    return aRate - bRate;
  })[0] ?? null;
  const strongestAgent = [...(agents?.agents ?? [])].sort((a: any, b: any) => {
    const aRate = Number.parseFloat(String(a?.successRate ?? '0'));
    const bRate = Number.parseFloat(String(b?.successRate ?? '0'));
    return bRate - aRate;
  })[0] ?? null;
  const breached = sla?.distribution?.find((row: any) => row.status === 'breached')?.count ?? 0;
  const pendingApprovals = approvals?.funnel?.find((row: any) => row.label === 'Pending')?.val ?? '0';
  const creditsUsed = costs?.summary?.creditsUsed ?? 0;
  const totalTokens = costs?.summary?.totalTokens ?? 0;
  const autoResolvedCases = costs?.summary?.autoResolvedCases ?? 0;
  const rising = kpis.filter((metric: any) => metric?.trend === 'up').slice(0, 3);
  const declining = kpis.filter((metric: any) => metric?.trend === 'down').slice(0, 3);

  return {
    audience,
    generatedAt: new Date().toISOString(),
    rangeLabel: period === '7d' ? 'Last 7 days' : period === '90d' ? 'Last 90 days' : 'Last 30 days',
    channelLabel: channel === 'all' ? 'All channels' : channel,
    headline: topIntent
      ? `The busiest demand driver was ${String(topIntent.name).replace(/_/g, ' ')} with ${topIntent.volume} cases in ${channel === 'all' ? 'the workspace' : channel}.`
      : 'There was no significant report activity during the selected range.',
    executiveSummary: [
      `${audience} view for ${period === '7d' ? 'the last 7 days' : period === '90d' ? 'the last 90 days' : 'the last 30 days'}${channel === 'all' ? '' : ` on ${channel}`}.`,
      kpis.length
        ? `Core performance is led by ${kpis[0]?.label ?? 'overall activity'} at ${kpis[0]?.value ?? '—'} while ${breached} cases breached SLA and ${pendingApprovals} approvals remain pending.`
        : 'No KPI data was available for the selected range.',
      strongestAgent
        ? `${strongestAgent.name} is the strongest agent this period at ${strongestAgent.successRate}; ${weakestAgent?.name ?? 'the weakest agent'} should be reviewed next.`
        : 'No agent run data was available for the selected range.',
    ],
    positiveSignals: rising.map((metric: any) => ({
      title: metric.label,
      detail: `${metric.value}${metric.change ? ` (${metric.change})` : ''}${metric.sub ? ` — ${metric.sub}` : ''}`,
    })),
    riskFlags: [
      ...(declining.map((metric: any) => ({
        title: metric.label,
        detail: `${metric.value}${metric.change ? ` (${metric.change})` : ''}${metric.sub ? ` — ${metric.sub}` : ''}`,
      }))),
      ...(breached > 0 ? [{ title: 'SLA breaches', detail: `${breached} cases are outside SLA in the selected range.` }] : []),
      ...(weakestAgent ? [{ title: `${weakestAgent.name} needs review`, detail: `${weakestAgent.failedRuns} failed runs and ${weakestAgent.successRate} success rate.` }] : []),
    ].slice(0, 4),
    businessImpact: [
      topIntent ? { title: 'Highest-volume workflow', detail: `${String(topIntent.name).replace(/_/g, ' ')} accounts for ${topIntent.shareOfTotal} of tracked demand.` } : null,
      { title: 'Pending approvals', detail: `${pendingApprovals} requests are still waiting for a decision.` },
      { title: 'Automation footprint', detail: `${autoResolvedCases} cases reached completed execution in this range.` },
    ].filter(Boolean),
    recommendations: [
      breached > 0 ? 'Review breached SLA cases and rebalance approvals for delayed flows.' : 'Keep current SLA guardrails; no breached volume is showing up in this range.',
      weakestAgent ? `Inspect failed runs for ${weakestAgent.name} and review the underlying tool or knowledge dependency.` : 'No weak agent hotspot was detected in the selected range.',
      topIntent ? `Audit playbooks and knowledge for ${String(topIntent.name).replace(/_/g, ' ')} because it is the main source of demand.` : 'No dominant business intent was detected, so no single workflow stands out yet.',
    ],
    costSummary: [
      { title: 'Credits used', detail: `${creditsUsed} credits were consumed across ${Number(totalTokens).toLocaleString()} tokens.` },
      { title: 'Top execution driver', detail: strongestAgent ? `${strongestAgent.name} handled the highest-performing run profile in this range.` : 'No execution data available.' },
    ],
  };
}

// ── GET /api/reports/overview ─────────────────────────────────────────────────

router.get('/overview', async (req: MultiTenantRequest, res: Response) => {
  try {
    const period = String(req.query.period ?? '30d');
    const channel = normalizeChannelParam(req.query.channel);
    const overview = await reportRepository.getOverview({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!
    }, period, channel);
    res.json(overview);
  } catch (error) {
    console.error('Reports overview error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/reports/intents ──────────────────────────────────────────────────

router.get('/intents', async (req: MultiTenantRequest, res: Response) => {
  try {
    const period = String(req.query.period ?? '30d');
    const channel = normalizeChannelParam(req.query.channel);
    const intents = await reportRepository.getIntents({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!
    }, period, channel);
    res.json(intents);
  } catch (error) {
    console.error('Reports intents error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/reports/agents ───────────────────────────────────────────────────

router.get('/agents', async (req: MultiTenantRequest, res: Response) => {
  try {
    const period = String(req.query.period ?? '30d');
    const channel = normalizeChannelParam(req.query.channel);
    const agents = await reportRepository.getAgents({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!
    }, period, channel);
    res.json(agents);
  } catch (error) {
    console.error('Reports agents error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/reports/approvals ────────────────────────────────────────────────

router.get('/approvals', async (req: MultiTenantRequest, res: Response) => {
  try {
    const period = String(req.query.period ?? '30d');
    const channel = normalizeChannelParam(req.query.channel);
    const approvals = await reportRepository.getApprovals({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!
    }, period, channel);
    res.json(approvals);
  } catch (error) {
    console.error('Reports approvals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/reports/costs ───────────────────────────────────────────────────

router.get('/costs', async (req: MultiTenantRequest, res: Response) => {
  try {
    const period = String(req.query.period ?? '30d');
    const channel = normalizeChannelParam(req.query.channel);
    const costs = await reportRepository.getCosts({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!
    }, period, channel);
    res.json(costs);
  } catch (error) {
    console.error('Reports costs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/reports/sla ──────────────────────────────────────────────────────

router.get('/sla', async (req: MultiTenantRequest, res: Response) => {
  try {
    const period = String(req.query.period ?? '30d');
    const channel = normalizeChannelParam(req.query.channel);
    const sla = await reportRepository.getSLA({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!
    }, period, channel);
    res.json(sla);
  } catch (error) {
    console.error('Reports sla error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/summary', async (req: MultiTenantRequest, res: Response) => {
  try {
    const period = String(req.query.period ?? '30d');
    const channel = normalizeChannelParam(req.query.channel);
    const audience = String(req.query.audience ?? 'Executive / C-Suite');
    const scope = {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
    };
    const [overview, intents, agents, approvals, costs, sla] = await Promise.all([
      reportRepository.getOverview(scope, period, channel),
      reportRepository.getIntents(scope, period, channel),
      reportRepository.getAgents(scope, period, channel),
      reportRepository.getApprovals(scope, period, channel),
      reportRepository.getCosts(scope, period, channel),
      reportRepository.getSLA(scope, period, channel),
    ]);
    res.json(buildGeneratedSummary({ period, channel, audience, overview, intents, agents, approvals, costs, sla }));
  } catch (error) {
    console.error('Reports summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
