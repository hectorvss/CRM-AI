/**
 * server/routes/reports.ts
 *
 * Reports & KPI API — Phase 6.
 *
 * Provides real-time metrics computed from the SQLite database.
 * All endpoints accept ?period=7d|30d|90d (default: 30d).
 *
 * Endpoints:
 *   GET /api/reports/overview    — top-level KPIs (cases, SLA, resolution, volume)
 *   GET /api/reports/intents     — case volume breakdown by intent/type
 *   GET /api/reports/agents      — per-agent performance (runs, outcomes, token usage)
 *   GET /api/reports/approvals   — approval funnel and risk distribution
 *   GET /api/reports/costs       — credit consumption and AI cost breakdown
 *   GET /api/reports/sla         — SLA status distribution over the period
 *
 * Data shape is designed to match what the Reports.tsx frontend component
 * expects once it is wired to real API calls.
 */

import { Router, Request, Response } from 'express';
import { getDb } from '../db/client.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  const sign  = delta >= 0 ? '+' : '';
  return `${sign}${Math.round(delta)}%`;
}

// ── GET /api/reports/overview ─────────────────────────────────────────────────

router.get('/overview', (req: Request, res: Response) => {
  const db       = getDb();
  const tenantId = (req as any).tenantId ?? 'org_default';
  const since    = periodToISO(String(req.query.period ?? '30d'));

  // Half-period for trend comparison
  const days     = req.query.period === '7d' ? 7 : req.query.period === '90d' ? 90 : 30;
  const priorEnd = since;
  const priorStart = new Date(new Date(since).getTime() - days * 86_400_000).toISOString();

  const totalCases = (db.prepare(
    'SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ?'
  ).get(tenantId, since) as any).n;

  const priorCases = (db.prepare(
    'SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ? AND created_at < ?'
  ).get(tenantId, priorStart, priorEnd) as any).n;

  const resolvedCases = (db.prepare(
    `SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ?
     AND status IN ('resolved', 'closed')`
  ).get(tenantId, since) as any).n;

  const priorResolved = (db.prepare(
    `SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ? AND created_at < ?
     AND status IN ('resolved', 'closed')`
  ).get(tenantId, priorStart, priorEnd) as any).n;

  const slaBreached = (db.prepare(
    `SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ?
     AND sla_status = 'breached'`
  ).get(tenantId, since) as any).n;

  const slaTotal = (db.prepare(
    `SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ?
     AND sla_status IS NOT NULL`
  ).get(tenantId, since) as any).n;

  const slaCompliant = slaTotal - slaBreached;

  const priorSlaBreached = (db.prepare(
    `SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ? AND created_at < ?
     AND sla_status = 'breached'`
  ).get(tenantId, priorStart, priorEnd) as any).n;

  const priorSlaTotal = (db.prepare(
    `SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ? AND created_at < ?
     AND sla_status IS NOT NULL`
  ).get(tenantId, priorStart, priorEnd) as any).n;

  const priorSlaCompliant = priorSlaTotal - priorSlaBreached;

  const openCases = (db.prepare(
    `SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND status NOT IN ('resolved','closed','cancelled')`
  ).get(tenantId) as any).n;

  const highRiskCases = (db.prepare(
    `SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ?
     AND risk_level IN ('high', 'critical')`
  ).get(tenantId, since) as any).n;

  const autoResolved = (db.prepare(
    `SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ?
     AND resolution_state = 'resolved' AND execution_state = 'completed'`
  ).get(tenantId, since) as any).n;

  const priorAutoResolved = (db.prepare(
    `SELECT COUNT(*) as n FROM cases WHERE tenant_id = ? AND created_at >= ? AND created_at < ?
     AND resolution_state = 'resolved' AND execution_state = 'completed'`
  ).get(tenantId, priorStart, priorEnd) as any).n;

  res.json({
    period:     String(req.query.period ?? '30d'),
    generatedAt: new Date().toISOString(),
    kpis: [
      {
        key:    'total_cases',
        label:  'Total Cases',
        value:  String(totalCases),
        change: changeStr(totalCases, priorCases),
        trend:  trend(totalCases, priorCases),
        sub:    `${openCases} open`,
      },
      {
        key:    'resolution_rate',
        label:  'Resolution Rate',
        value:  pct(resolvedCases, totalCases || 1),
        change: changeStr(resolvedCases / (totalCases || 1), priorResolved / (priorCases || 1)),
        trend:  trend(resolvedCases / (totalCases || 1), priorResolved / (priorCases || 1)),
        sub:    `${resolvedCases} resolved`,
      },
      {
        key:    'sla_compliance',
        label:  'SLA Compliance',
        value:  pct(slaCompliant, slaTotal || 1),
        change: changeStr(slaCompliant / (slaTotal || 1), priorSlaCompliant / (priorSlaTotal || 1)),
        trend:  trend(slaCompliant, priorSlaCompliant),
        sub:    `${slaBreached} breached`,
      },
      {
        key:    'auto_resolution',
        label:  'AI Auto-Resolution',
        value:  pct(autoResolved, resolvedCases || 1),
        change: changeStr(autoResolved, priorAutoResolved),
        trend:  trend(autoResolved, priorAutoResolved),
        sub:    `${autoResolved} automated`,
      },
      {
        key:    'high_risk',
        label:  'High Risk Cases',
        value:  String(highRiskCases),
        change: '—',
        trend:  'neutral' as const,
        sub:    `of ${totalCases} total`,
      },
    ],
  });
});

// ── GET /api/reports/intents ──────────────────────────────────────────────────

router.get('/intents', (req: Request, res: Response) => {
  const db       = getDb();
  const tenantId = (req as any).tenantId ?? 'org_default';
  const since    = periodToISO(String(req.query.period ?? '30d'));

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
  `).all(tenantId, since) as any[];

  const total = rows.reduce((s, r) => s + r.volume, 0);

  const palette = [
    '#6366f1','#8b5cf6','#a78bfa','#c4b5fd',
    '#818cf8','#4f46e5','#7c3aed','#9333ea',
  ];

  res.json({
    period:  String(req.query.period ?? '30d'),
    total,
    intents: rows.map((r, i) => ({
      name:        r.name,
      volume:      String(r.volume),
      handled:     pct(r.handled, r.volume),
      shareOfTotal: pct(r.volume, total),
      color:       palette[i % palette.length],
    })),
  });
});

// ── GET /api/reports/agents ───────────────────────────────────────────────────

router.get('/agents', (req: Request, res: Response) => {
  const db       = getDb();
  const tenantId = (req as any).tenantId ?? 'org_default';
  const since    = periodToISO(String(req.query.period ?? '30d'));

  const rows = db.prepare(`
    SELECT
      a.name,
      a.slug,
      a.category,
      COUNT(ar.id)                         as total_runs,
      SUM(CASE WHEN ar.outcome_status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN ar.outcome_status = 'failed'    THEN 1 ELSE 0 END) as failed,
      SUM(ar.tokens_used)                  as tokens_total,
      SUM(ar.cost_credits)                 as cost_total,
      AVG(
        CASE WHEN ar.ended_at IS NOT NULL
        THEN (julianday(ar.ended_at) - julianday(ar.started_at)) * 86400
        END
      ) as avg_duration_sec
    FROM agents a
    LEFT JOIN agent_runs ar ON ar.agent_id = a.id AND ar.started_at >= ?
    WHERE a.tenant_id = ?
    GROUP BY a.id
    ORDER BY total_runs DESC
  `).all(since, tenantId) as any[];

  res.json({
    period: String(req.query.period ?? '30d'),
    agents: rows.map(r => ({
      name:          r.name,
      slug:          r.slug,
      category:      r.category,
      totalRuns:     r.total_runs ?? 0,
      successRate:   pct(r.completed ?? 0, (r.total_runs || 1)),
      failedRuns:    r.failed ?? 0,
      tokensUsed:    r.tokens_total ?? 0,
      costCredits:   Number((r.cost_total ?? 0).toFixed(4)),
      avgDurationSec: r.avg_duration_sec ? Math.round(r.avg_duration_sec) : null,
    })),
  });
});

// ── GET /api/reports/approvals ────────────────────────────────────────────────

router.get('/approvals', (req: Request, res: Response) => {
  const db       = getDb();
  const tenantId = (req as any).tenantId ?? 'org_default';
  const since    = periodToISO(String(req.query.period ?? '30d'));

  const total = (db.prepare(
    'SELECT COUNT(*) as n FROM approval_requests WHERE tenant_id = ? AND created_at >= ?'
  ).get(tenantId, since) as any).n;

  const approved = (db.prepare(
    `SELECT COUNT(*) as n FROM approval_requests WHERE tenant_id = ? AND created_at >= ?
     AND status = 'approved'`
  ).get(tenantId, since) as any).n;

  const rejected = (db.prepare(
    `SELECT COUNT(*) as n FROM approval_requests WHERE tenant_id = ? AND created_at >= ?
     AND status = 'rejected'`
  ).get(tenantId, since) as any).n;

  const pending = (db.prepare(
    `SELECT COUNT(*) as n FROM approval_requests WHERE tenant_id = ? AND status = 'pending'`
  ).get(tenantId) as any).n;

  const byRisk = db.prepare(`
    SELECT risk_level, COUNT(*) as n
    FROM approval_requests
    WHERE tenant_id = ? AND created_at >= ?
    GROUP BY risk_level
  `).all(tenantId, since) as any[];

  const avgDecisionHours = (db.prepare(`
    SELECT AVG(
      (julianday(decision_at) - julianday(created_at)) * 24
    ) as avg_h
    FROM approval_requests
    WHERE tenant_id = ? AND created_at >= ? AND decision_at IS NOT NULL
  `).get(tenantId, since) as any)?.avg_h;

  res.json({
    period: String(req.query.period ?? '30d'),
    funnel: [
      { label: 'Triggered',  val: String(total) },
      { label: 'Approved',   val: String(approved) },
      { label: 'Rejected',   val: String(rejected) },
      { label: 'Pending',    val: String(pending) },
    ],
    rates: {
      approvalRate: pct(approved, total || 1),
      rejectionRate: pct(rejected, total || 1),
      avgDecisionHours: avgDecisionHours ? Math.round(avgDecisionHours * 10) / 10 : null,
    },
    byRisk: byRisk.map(r => ({ riskLevel: r.risk_level, count: r.n })),
  });
});

// ── GET /api/reports/costs ────────────────────────────────────────────────────

router.get('/costs', (req: Request, res: Response) => {
  const db       = getDb();
  const tenantId = (req as any).tenantId ?? 'org_default';
  const since    = periodToISO(String(req.query.period ?? '30d'));

  const credits = db.prepare(`
    SELECT
      SUM(CASE WHEN entry_type = 'debit'  THEN amount ELSE 0 END) as debited,
      SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END) as credited
    FROM credit_ledger
    WHERE tenant_id = ? AND occurred_at >= ?
  `).get(tenantId, since) as any;

  const agentCosts = db.prepare(`
    SELECT
      a.name,
      SUM(ar.tokens_used)   as tokens,
      SUM(ar.cost_credits)  as cost
    FROM agent_runs ar
    JOIN agents a ON a.id = ar.agent_id
    WHERE ar.started_at >= ? AND a.tenant_id = ?
    GROUP BY a.id
    ORDER BY cost DESC
    LIMIT 10
  `).all(since, tenantId) as any[];

  const totalTokens = (db.prepare(`
    SELECT SUM(tokens_used) as n FROM agent_runs
    WHERE started_at >= ?
      AND agent_id IN (SELECT id FROM agents WHERE tenant_id = ?)
  `).get(since, tenantId) as any)?.n ?? 0;

  const autoResolvedCount = (db.prepare(`
    SELECT COUNT(*) as n FROM cases
    WHERE tenant_id = ? AND created_at >= ?
      AND execution_state = 'completed'
  `).get(tenantId, since) as any).n;

  res.json({
    period: String(req.query.period ?? '30d'),
    summary: {
      creditsUsed:       Number((credits?.debited ?? 0).toFixed(2)),
      creditsAdded:      Number((credits?.credited ?? 0).toFixed(2)),
      totalTokens:       totalTokens,
      autoResolvedCases: autoResolvedCount,
    },
    byAgent: agentCosts.map(r => ({
      name:    r.name,
      tokens:  r.tokens ?? 0,
      cost:    Number((r.cost ?? 0).toFixed(4)),
    })),
  });
});

// ── GET /api/reports/sla ──────────────────────────────────────────────────────

router.get('/sla', (req: Request, res: Response) => {
  const db       = getDb();
  const tenantId = (req as any).tenantId ?? 'org_default';
  const since    = periodToISO(String(req.query.period ?? '30d'));

  const distribution = db.prepare(`
    SELECT sla_status, COUNT(*) as n
    FROM cases
    WHERE tenant_id = ? AND created_at >= ?
    GROUP BY sla_status
  `).all(tenantId, since) as any[];

  const byPriority = db.prepare(`
    SELECT priority, sla_status, COUNT(*) as n
    FROM cases
    WHERE tenant_id = ? AND created_at >= ?
    GROUP BY priority, sla_status
    ORDER BY priority, sla_status
  `).all(tenantId, since) as any[];

  const breachedByType = db.prepare(`
    SELECT type, COUNT(*) as n
    FROM cases
    WHERE tenant_id = ? AND created_at >= ? AND sla_status = 'breached'
    GROUP BY type
    ORDER BY n DESC
    LIMIT 10
  `).all(tenantId, since) as any[];

  res.json({
    period: String(req.query.period ?? '30d'),
    distribution: distribution.map(r => ({
      status: r.sla_status ?? 'unknown',
      count:  r.n,
    })),
    byPriority: byPriority.map(r => ({
      priority:  r.priority,
      slaStatus: r.sla_status,
      count:     r.n,
    })),
    breachedByType: breachedByType.map(r => ({
      type:  r.type,
      count: r.n,
    })),
  });
});

export default router;
