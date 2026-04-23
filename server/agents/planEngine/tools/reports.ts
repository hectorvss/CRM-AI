/**
 * server/agents/planEngine/tools/reports.ts
 *
 * Read-only reporting tools. They let the LLM answer operational questions with
 * the same repository layer used by the Reports module.
 */

import { createReportRepository } from '../../../data/index.js';
import type { ToolSpec } from '../types.js';
import { s } from '../schema.js';

const reportRepo = createReportRepository();
const periods = ['7d', '30d', '90d'] as const;
type ReportPeriod = typeof periods[number];

function normalizePeriod(period?: string): ReportPeriod {
  return periods.includes(period as ReportPeriod) ? period as ReportPeriod : '30d';
}

function scope(context: { tenantId: string; workspaceId: string | null }) {
  return {
    tenantId: context.tenantId,
    workspaceId: context.workspaceId ?? '',
  };
}

const periodArgs = {
  period: s.enum(periods, { required: false, description: 'Reporting period: 7d, 30d, or 90d. Defaults to 30d.' }),
};

export const reportOverviewTool: ToolSpec<{ period?: string }, unknown> = {
  name: 'report.overview',
  version: '1.0.0',
  description: 'Read executive CRM KPIs: total cases, resolution rate, SLA compliance, automation and high-risk volume.',
  category: 'report',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'reports.read',
  args: s.object(periodArgs),
  returns: s.any('Overview KPI report'),
  async run({ args, context }) {
    return { ok: true, value: await reportRepo.getOverview(scope(context), normalizePeriod(args.period)) };
  },
};

export const reportIntentsTool: ToolSpec<{ period?: string }, unknown> = {
  name: 'report.intents',
  version: '1.0.0',
  description: 'Read case intent distribution and handling rates for the requested period.',
  category: 'report',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'reports.read',
  args: s.object(periodArgs),
  returns: s.any('Intent distribution report'),
  async run({ args, context }) {
    return { ok: true, value: await reportRepo.getIntents(scope(context), normalizePeriod(args.period)) };
  },
};

export const reportAgentsTool: ToolSpec<{ period?: string }, unknown> = {
  name: 'report.agents',
  version: '1.0.0',
  description: 'Read agent execution metrics: runs, success rate, failures, tokens, cost, and duration.',
  category: 'report',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'reports.read',
  args: s.object(periodArgs),
  returns: s.any('Agent performance report'),
  async run({ args, context }) {
    return { ok: true, value: await reportRepo.getAgents(scope(context), normalizePeriod(args.period)) };
  },
};

export const reportApprovalsTool: ToolSpec<{ period?: string }, unknown> = {
  name: 'report.approvals',
  version: '1.0.0',
  description: 'Read approval funnel, rates, decision time, and risk breakdown.',
  category: 'report',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'reports.read',
  args: s.object(periodArgs),
  returns: s.any('Approval operations report'),
  async run({ args, context }) {
    return { ok: true, value: await reportRepo.getApprovals(scope(context), normalizePeriod(args.period)) };
  },
};

export const reportCostsTool: ToolSpec<{ period?: string }, unknown> = {
  name: 'report.costs',
  version: '1.0.0',
  description: 'Read AI and operations cost metrics for the requested period.',
  category: 'report',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'reports.read',
  args: s.object(periodArgs),
  returns: s.any('Cost report'),
  async run({ args, context }) {
    return { ok: true, value: await reportRepo.getCosts(scope(context), normalizePeriod(args.period)) };
  },
};

export const reportSlaTool: ToolSpec<{ period?: string }, unknown> = {
  name: 'report.sla',
  version: '1.0.0',
  description: 'Read SLA compliance, breached cases, and resolution timing metrics.',
  category: 'report',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'reports.read',
  args: s.object(periodArgs),
  returns: s.any('SLA report'),
  async run({ args, context }) {
    return { ok: true, value: await reportRepo.getSLA(scope(context), normalizePeriod(args.period)) };
  },
};
