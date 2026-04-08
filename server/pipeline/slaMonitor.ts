/**
 * server/pipeline/slaMonitor.ts
 *
 * SLA Monitor — Phase 6.
 *
 * Handles SLA_CHECK jobs. For each open case it evaluates the SLA deadlines
 * stored at case creation and updates the sla_status field accordingly.
 *
 * SLA states:
 *  on_track   — both deadlines in the future
 *  at_risk    — first-response deadline within 1 hour OR resolution <25% time remaining
 *  breached   — a deadline has passed on an unresolved case
 *
 * On breach or at_risk:
 *  - Case priority is escalated (normal→high, high→urgent)
 *  - A log warning is emitted so the observability layer can alert
 *
 * This handler supports two modes:
 *  a) Single case check: payload.caseId is set
 *  b) Sweep all open cases: payload.caseId is undefined → batch process up to 200
 *
 * The scheduled SLA sweep is triggered by enqueuing SLA_CHECK with no caseId,
 * which is done by the startup schedule (see scheduledJobs.ts).
 */

import { getDb }              from '../db/client.js';
import { registerHandler }    from '../queue/handlers/index.js';
import { JobType }            from '../queue/types.js';
import { logger }             from '../utils/logger.js';
import type { SlaCheckPayload, JobContext } from '../queue/types.js';

type SlaStatus = 'on_track' | 'at_risk' | 'breached';

interface SlaEvaluation {
  slaStatus:             SlaStatus;
  firstResponseBreached: boolean;
  resolutionBreached:    boolean;
  firstResponseAtRisk:   boolean;
  resolutionAtRisk:      boolean;
}

const AT_RISK_WINDOW_MS    = 60 * 60 * 1000;        // 1 hour
const RESOLUTION_RISK_PCT  = 0.25;                   // trigger at_risk when <25% time remains

function evaluateSla(caseRow: any): SlaEvaluation {
  const now        = Date.now();
  const firstDeadline = caseRow.sla_first_response_deadline
    ? new Date(caseRow.sla_first_response_deadline).getTime()
    : null;
  const resDeadline = caseRow.sla_resolution_deadline
    ? new Date(caseRow.sla_resolution_deadline).getTime()
    : null;
  const createdAt   = new Date(caseRow.created_at).getTime();

  const firstResponseBreached = firstDeadline != null && now > firstDeadline
    && caseRow.first_response_at == null;

  const resolutionBreached = resDeadline != null && now > resDeadline
    && !['resolved', 'closed', 'cancelled'].includes(caseRow.status);

  const firstResponseAtRisk = !firstResponseBreached
    && firstDeadline != null
    && caseRow.first_response_at == null
    && (firstDeadline - now) < AT_RISK_WINDOW_MS;

  const totalResolutionWindow = resDeadline != null ? resDeadline - createdAt : null;
  const resolutionAtRisk = !resolutionBreached
    && resDeadline != null
    && totalResolutionWindow != null
    && (resDeadline - now) < totalResolutionWindow * RESOLUTION_RISK_PCT;

  let slaStatus: SlaStatus = 'on_track';
  if (firstResponseBreached || resolutionBreached) {
    slaStatus = 'breached';
  } else if (firstResponseAtRisk || resolutionAtRisk) {
    slaStatus = 'at_risk';
  }

  return { slaStatus, firstResponseBreached, resolutionBreached, firstResponseAtRisk, resolutionAtRisk };
}

function escalatePriority(current: string): string {
  if (current === 'normal') return 'high';
  if (current === 'high')   return 'urgent';
  return current; // already urgent
}

async function checkCase(caseRow: any, db: any): Promise<void> {
  const log = logger.child({ caseId: caseRow.id });
  const eval_ = evaluateSla(caseRow);

  if (eval_.slaStatus === caseRow.sla_status) return; // No change

  const updates: Record<string, unknown> = { sla_status: eval_.slaStatus };

  if (eval_.slaStatus === 'breached') {
    updates.priority = escalatePriority(caseRow.priority ?? 'normal');
    log.warn('SLA breached', {
      caseNumber:            caseRow.case_number,
      firstResponseBreached: eval_.firstResponseBreached,
      resolutionBreached:    eval_.resolutionBreached,
      priority:              updates.priority,
    });
  } else if (eval_.slaStatus === 'at_risk') {
    updates.priority = escalatePriority(caseRow.priority ?? 'normal');
    log.warn('SLA at risk', {
      caseNumber:         caseRow.case_number,
      firstResponseAtRisk: eval_.firstResponseAtRisk,
      resolutionAtRisk:   eval_.resolutionAtRisk,
    });
  }

  db.prepare(`
    UPDATE cases SET
      sla_status = ?,
      priority   = COALESCE(?, priority),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(eval_.slaStatus, updates.priority ?? null, caseRow.id);
}

async function handleSlaCheck(
  payload: SlaCheckPayload,
  ctx: JobContext
): Promise<void> {
  const log = logger.child({ jobId: ctx.jobId, traceId: ctx.traceId });
  const db  = getDb();
  const tenantId = ctx.tenantId ?? 'org_default';

  if (payload.caseId) {
    const caseRow = db.prepare('SELECT * FROM cases WHERE id = ?').get(payload.caseId) as any;
    if (caseRow) await checkCase(caseRow, db);
    return;
  }

  // Sweep all open cases for this tenant
  const openCases = db.prepare(`
    SELECT * FROM cases
    WHERE tenant_id = ?
      AND status NOT IN ('resolved', 'closed', 'cancelled')
      AND (sla_first_response_deadline IS NOT NULL OR sla_resolution_deadline IS NOT NULL)
    ORDER BY last_activity_at DESC
    LIMIT 200
  `).all(tenantId) as any[];

  log.info('SLA sweep', { caseCount: openCases.length });

  for (const c of openCases) {
    await checkCase(c, db);
  }

  const breachedCount = openCases.filter(c => {
    const e = evaluateSla(c);
    return e.slaStatus === 'breached';
  }).length;

  const atRiskCount = openCases.filter(c => {
    const e = evaluateSla(c);
    return e.slaStatus === 'at_risk';
  }).length;

  log.info('SLA sweep complete', {
    checked:  openCases.length,
    breached: breachedCount,
    atRisk:   atRiskCount,
  });
}

// ── Register ──────────────────────────────────────────────────────────────────

registerHandler(JobType.SLA_CHECK, handleSlaCheck);

export { handleSlaCheck };
