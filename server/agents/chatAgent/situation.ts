/**
 * server/agents/chatAgent/situation.ts
 *
 * Situational awareness for the operator Super Agent — the "what's happening
 * right now" snapshot. This is the backbone of the agent's purpose: the
 * operator should know the state of the workspace without asking.
 *
 * `assembleSituation` reuses existing data accessors and gathers them in
 * parallel; every source is guarded so one failure never blanks the briefing.
 * The same function feeds three consumers:
 *   - the injected `<current_situation>` block (compact) in the system prompt,
 *   - the `/status` slash command (compact, formatted, no LLM),
 *   - the always-on briefing panel (full detail) via GET /api/agent/situation.
 *
 * Mirrors PostHog's AssistantContextManager idea (pre-load context the agent
 * would otherwise have to fetch with a tool) but sourced from the CRM's own
 * queues/approvals/SLA/notifications.
 */

import { getSupabaseAdmin } from '../../db/supabase.js';
import { logger } from '../../utils/logger.js';
import { createCaseRepository } from '../../data/cases.js';
import { createApprovalRepository } from '../../data/approvals.js';
import { createReportRepository } from '../../data/reports.js';
import { getUnreadCount, listNotificationsForUser } from '../../data/notifications.js';
import { listMentionsForUser } from '../../data/mentions.js';
import { listSlaAtRisk } from '../../data/slaPolicies.js';

export interface SituationScope {
  tenantId: string;
  workspaceId: string;
  userId: string | null;
}

export type Severity = 'critical' | 'high' | 'warn' | 'info';

export interface SituationItem {
  id: string;
  label: string;
  sub?: string;
  severity?: Severity;
  /** For click-through in the panel. */
  view?: string;
  entityType?: string;
  entityId?: string;
}

export interface SituationGroup {
  count: number;
  items: SituationItem[];
}

export interface Situation {
  generatedAt: string;
  queues: {
    open: number;
    unassigned: number;
    mine: number;
    mentions: number;
    escalated: number;
  };
  pendingApprovals: SituationGroup;
  riskyCases: SituationGroup;
  slaAtRisk: SituationGroup;
  unread: SituationGroup & { notifications: number; mentions: number };
  kpi: { resolutionRate?: number; slaCompliance?: number; highRisk?: number; totalCases?: number } | null;
}

const caseRepo = createCaseRepository();
const approvalRepo = createApprovalRepository();
const reportRepo = createReportRepository();

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

async function guard<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    logger.warn('situation: source failed', { source: label, error: (err as Error)?.message });
    return fallback;
  }
}

/**
 * Assemble the current workspace situation. `compact` caps each group to the
 * top 3 items (cheap enough to inject on every conversation start); non-compact
 * returns the top 10 for the panel.
 */
export async function assembleSituation(scope: SituationScope, opts?: { compact?: boolean }): Promise<Situation> {
  const cap = opts?.compact ? 3 : 10;
  const base = { tenantId: scope.tenantId, workspaceId: scope.workspaceId };

  const [counts, approvals, risky, sla, unreadNotifs, mentions, overview] = await Promise.all([
    guard('inbox_counts', () => caseRepo.counts(base, scope.userId ?? ''), {} as Record<string, unknown>),
    guard('approvals', () => approvalRepo.list({ ...base, userId: scope.userId ?? undefined }, { status: 'pending', limit: cap }), { items: [] as any[], total: 0, hasMore: false }),
    guard('risky_cases', () => listRiskyCases(base, cap), [] as any[]),
    guard('sla_at_risk', () => listSlaAtRisk(base, 60, cap), [] as any[]),
    guard('unread_notifs', () => (scope.userId ? getUnreadCount(base, scope.userId) : Promise.resolve(0)), 0),
    guard('mentions', () => (scope.userId ? listMentionsForUser(base, scope.userId, { unreadOnly: true, limit: cap }) : Promise.resolve([])), [] as any[]),
    guard('overview', () => reportRepo.getOverview(base, '7d'), null as any),
  ]);

  const q = counts as Record<string, any>;

  return {
    generatedAt: new Date().toISOString(),
    queues: {
      open: num(q.all ?? q.inbox),
      unassigned: num(q.unassigned),
      mine: num(q.created),
      mentions: num(q.mentions),
      escalated: num(q['fin-escalated']),
    },
    pendingApprovals: {
      count: num((approvals as any).total) || (approvals as any).items?.length || 0,
      items: ((approvals as any).items ?? []).slice(0, cap).map((a: any): SituationItem => ({
        id: String(a.id),
        label: `Aprobación: ${a.action_type ?? 'acción'}`,
        sub: [a.risk_level, a.case_number ? `caso ${a.case_number}` : null].filter(Boolean).join(' · '),
        severity: a.risk_level === 'critical' ? 'critical' : a.risk_level === 'high' ? 'high' : 'warn',
        view: 'approvals',
        entityType: 'approval',
        entityId: String(a.id),
      })),
    },
    riskyCases: {
      count: risky.length,
      items: risky.map((c: any): SituationItem => ({
        id: String(c.id),
        label: `Caso ${c.case_number ?? c.id}`,
        sub: [c.risk_level, c.status, c.ai_diagnosis].filter(Boolean).join(' · ').slice(0, 120),
        severity: c.risk_level === 'critical' ? 'critical' : 'high',
        view: 'inbox',
        entityType: 'case',
        entityId: String(c.id),
      })),
    },
    slaAtRisk: {
      count: sla.length,
      items: sla.map((s: any): SituationItem => ({
        id: String(s.id ?? s.conversation_id),
        label: 'SLA a punto de incumplir',
        sub: `${s.kind === 'resolution' ? 'resolución' : '1ª respuesta'} vence ${s.deadline ? new Date(s.deadline).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''}`.trim(),
        severity: 'warn',
        view: 'inbox',
        entityType: 'conversation',
        entityId: String(s.conversation_id),
      })),
    },
    unread: {
      count: num(unreadNotifs) + (mentions as any[]).length,
      notifications: num(unreadNotifs),
      mentions: (mentions as any[]).length,
      items: (mentions as any[]).slice(0, cap).map((m: any): SituationItem => ({
        id: String(m.id),
        label: 'Mención sin leer',
        sub: (m.content_snippet ?? '').slice(0, 120),
        severity: 'info',
        view: 'inbox',
        entityType: 'conversation',
        entityId: String(m.conversation_id),
      })),
    },
    kpi: overview
      ? {
          resolutionRate: numOrUndef((overview as any).resolution_rate),
          slaCompliance: numOrUndef((overview as any).sla_compliance),
          highRisk: numOrUndef((overview as any).high_risk),
          totalCases: numOrUndef((overview as any).total_cases),
        }
      : null,
  };
}

function numOrUndef(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Open cases at high/critical risk (direct scoped query — no single accessor). */
async function listRiskyCases(scope: { tenantId: string; workspaceId: string }, limit: number): Promise<any[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('cases')
    .select('id, case_number, risk_level, status, ai_diagnosis')
    .eq('tenant_id', scope.tenantId)
    .eq('workspace_id', scope.workspaceId)
    .in('risk_level', ['high', 'critical'])
    .neq('status', 'resolved')
    .order('risk_level', { ascending: false })
    .order('last_activity_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/**
 * Compact snapshot of the entity the operator currently has open (case /
 * customer), so the agent knows it without spending an iteration on a tool call.
 * Returns null when nothing is open or the fetch fails.
 */
export async function loadOpenEntity(
  scope: { tenantId: string; workspaceId: string },
  opts: { caseId?: string; customerId?: string },
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const lines: string[] = [];
  try {
    if (opts.caseId) {
      const { data: c } = await supabase
        .from('cases')
        .select('case_number, status, priority, risk_level, ai_diagnosis, customer_id')
        .eq('tenant_id', scope.tenantId)
        .eq('id', opts.caseId)
        .maybeSingle();
      if (c) {
        lines.push(
          `Caso abierto ${c.case_number ?? opts.caseId}: estado ${c.status ?? '?'}, prioridad ${c.priority ?? '?'}, riesgo ${c.risk_level ?? 'n/a'}.` +
          (c.ai_diagnosis ? ` Diagnóstico IA: ${String(c.ai_diagnosis).slice(0, 200)}` : ''),
        );
        if (!opts.customerId && c.customer_id) opts.customerId = c.customer_id;
      }
    }
    if (opts.customerId) {
      const { data: cust } = await supabase
        .from('customers')
        .select('display_name, segment, language')
        .eq('tenant_id', scope.tenantId)
        .eq('id', opts.customerId)
        .maybeSingle();
      if (cust) {
        lines.push(`Cliente abierto: ${cust.display_name ?? opts.customerId}${cust.segment ? ` (${cust.segment})` : ''}${cust.language ? `, idioma ${cust.language}` : ''}.`);
      }
    }
  } catch {
    return lines.length ? lines.join('\n') : null;
  }
  return lines.length ? lines.join('\n') : null;
}

/** Compact text for prompt injection and the /status command (no LLM). */
export function formatSituationForPrompt(s: Situation): string {
  const lines: string[] = [];
  lines.push(
    `Colas: ${s.queues.open} abiertas, ${s.queues.unassigned} sin asignar, ${s.queues.mentions} con menciones, ${s.queues.escalated} escaladas.`,
  );
  if (s.pendingApprovals.count) {
    lines.push(`Aprobaciones pendientes: ${s.pendingApprovals.count}`);
    lines.push(...detailLines(s.pendingApprovals.items));
  }
  if (s.riskyCases.count) {
    lines.push(`Casos de alto riesgo abiertos: ${s.riskyCases.count}`);
    lines.push(...detailLines(s.riskyCases.items));
  }
  if (s.slaAtRisk.count) {
    lines.push(`SLA a punto de incumplir: ${s.slaAtRisk.count}`);
    lines.push(...detailLines(s.slaAtRisk.items));
  }
  if (s.unread.count) {
    lines.push(`Sin leer: ${s.unread.notifications} notificaciones, ${s.unread.mentions} menciones.`);
  }
  if (s.kpi) {
    const bits: string[] = [];
    if (s.kpi.resolutionRate != null) bits.push(`resolución ${s.kpi.resolutionRate}%`);
    if (s.kpi.slaCompliance != null) bits.push(`SLA ${s.kpi.slaCompliance}%`);
    if (bits.length) lines.push(`KPIs (7d): ${bits.join(', ')}.`);
  }
  return lines.join('\n');
}

/** One line per item with its real id, so the agent can act on it directly. */
function detailLines(items: SituationItem[]): string[] {
  return items.slice(0, 3).map((i) => {
    const ref = i.entityId ? ` [${i.entityType ?? 'id'}=${i.entityId}]` : '';
    return `  - ${i.label}${i.sub ? `: ${i.sub}` : ''}${ref}`;
  });
}
