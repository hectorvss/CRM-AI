import { Router } from 'express';
import { getDb } from '../db/client.js';
import { parseRow, logAudit } from '../db/utils.js';
import { sendError } from '../http/errors.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { canTransition, reconciliationIssueTransitions } from '../contracts/stateMachines.js';

const router = Router();
router.use(extractMultiTenant);
router.use(requirePermission('cases.read'));

function parseReconciliationIssue(row: any) {
  const parsed = parseRow(row);
  if (parsed?.conflicting_systems && typeof parsed.conflicting_systems === 'string') {
    try {
      parsed.conflicting_systems = JSON.parse(parsed.conflicting_systems);
    } catch {
      parsed.conflicting_systems = [];
    }
  }
  if (parsed?.actual_states && typeof parsed.actual_states === 'string') {
    try {
      parsed.actual_states = JSON.parse(parsed.actual_states);
    } catch {
      parsed.actual_states = {};
    }
  }
  return parsed;
}

function recalcCaseConflictState(db: any, tenantId: string, workspaceId: string, caseId: string) {
  const remaining = db.prepare(`
    SELECT COUNT(*) as total
    FROM reconciliation_issues
    WHERE tenant_id = ? AND case_id = ? AND status IN ('open', 'in_progress', 'escalated')
  `).get(tenantId, caseId) as { total?: number };
  const hasOpen = (remaining?.total || 0) > 0 ? 1 : 0;
  db.prepare(`
    UPDATE cases
    SET has_reconciliation_conflicts = ?,
        conflict_severity = CASE WHEN ? = 1 THEN conflict_severity ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND tenant_id = ? AND workspace_id = ?
  `).run(hasOpen, hasOpen, caseId, tenantId, workspaceId);
}

function resolveIssueBySourceOfTruth(db: any, params: {
  tenantId: string;
  workspaceId: string;
  userId: string;
  issue: any;
  targetStatus: string;
  reason?: string;
}) {
  const { tenantId, workspaceId, userId, issue, targetStatus, reason } = params;
  const entityType = String(issue.entity_type || '').toLowerCase();
  const entityId = String(issue.entity_id || '');
  if (!entityType || !entityId) throw new Error('Invalid issue entity');

  if (entityType === 'order') {
    const row = db.prepare('SELECT system_states FROM orders WHERE id = ? AND tenant_id = ? LIMIT 1').get(entityId, tenantId) as any;
    const states = row?.system_states && typeof row.system_states === 'string' ? JSON.parse(row.system_states) : {};
    states.canonical = targetStatus;
    db.prepare(`
      UPDATE orders
      SET status = ?, system_states = ?, has_conflict = 0, conflict_domain = NULL, conflict_detected = NULL, recommended_action = NULL,
          updated_at = CURRENT_TIMESTAMP, last_sync_at = CURRENT_TIMESTAMP, last_update = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `).run(targetStatus, JSON.stringify(states), entityId, tenantId);
  } else if (entityType === 'payment' || entityType === 'refund') {
    const row = db.prepare('SELECT system_states FROM payments WHERE id = ? AND tenant_id = ? LIMIT 1').get(entityId, tenantId) as any;
    const states = row?.system_states && typeof row.system_states === 'string' ? JSON.parse(row.system_states) : {};
    states.canonical = targetStatus;
    db.prepare(`
      UPDATE payments
      SET status = ?, system_states = ?, conflict_detected = NULL, recommended_action = NULL,
          updated_at = CURRENT_TIMESTAMP, last_update = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `).run(targetStatus, JSON.stringify(states), entityId, tenantId);
  } else if (entityType === 'return') {
    const row = db.prepare('SELECT system_states FROM returns WHERE id = ? AND tenant_id = ? AND workspace_id = ? LIMIT 1').get(entityId, tenantId, workspaceId) as any;
    const states = row?.system_states && typeof row.system_states === 'string' ? JSON.parse(row.system_states) : {};
    states.canonical = targetStatus;
    db.prepare(`
      UPDATE returns
      SET status = ?, system_states = ?, conflict_detected = NULL, recommended_action = NULL,
          updated_at = CURRENT_TIMESTAMP, last_update = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).run(targetStatus, JSON.stringify(states), entityId, tenantId, workspaceId);
  } else {
    throw new Error(`Unsupported entity_type for resolution: ${entityType}`);
  }

  db.prepare(`
    INSERT INTO system_states (id, entity_type, entity_id, system, state_key, state_value, tenant_id)
    VALUES (?, ?, ?, 'canonical', 'status', ?, ?)
  `).run(crypto.randomUUID(), entityType, entityId, targetStatus, tenantId);

  try {
    db.prepare(`
      INSERT INTO canonical_field_decisions (
        id, tenant_id, workspace_id, entity_type, entity_id, field_key,
        chosen_system, chosen_value, candidates, reason, issue_id, case_id, decided_by
      ) VALUES (?, ?, ?, ?, ?, 'status', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      tenantId,
      workspaceId,
      entityType,
      entityId,
      issue.source_of_truth_system || 'canonical',
      targetStatus,
      issue.actual_states || '{}',
      reason || 'Applied source-of-truth status to canonical state',
      issue.id,
      issue.case_id || null,
      userId,
    );
  } catch {
    // Backward compatibility where canonical_field_decisions table does not exist yet.
  }

  db.prepare(`
    UPDATE reconciliation_issues
    SET status = 'resolved',
        expected_state = COALESCE(expected_state, ?),
        resolved_at = CURRENT_TIMESTAMP,
        resolution_plan = COALESCE(resolution_plan, ?)
    WHERE id = ? AND tenant_id = ?
  `).run(
    targetStatus,
    reason || 'Auto-applied source-of-truth status',
    issue.id,
    tenantId,
  );

  if (issue.case_id) recalcCaseConflictState(db, tenantId, workspaceId, issue.case_id);

  logAudit(db, {
    tenantId,
    workspaceId,
    actorId: userId,
    action: 'RECONCILIATION_AUTO_APPLIED',
    entityType: 'reconciliation_issue',
    entityId: issue.id,
    metadata: {
      entity_type: entityType,
      entity_id: entityId,
      chosen_system: issue.source_of_truth_system || 'canonical',
      chosen_value: targetStatus,
      case_id: issue.case_id || null,
    },
  });
}

// GET /api/reconciliation/issues
router.get('/issues', (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    if (!req.tenantId || !req.workspaceId) {
      return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
    }

    const { status, severity, entity_type, case_id } = req.query;
    let query = `
      SELECT r.*, c.case_number, c.status as case_status
      FROM reconciliation_issues r
      LEFT JOIN cases c ON c.id = r.case_id
      WHERE r.tenant_id = ?
    `;
    const params: any[] = [req.tenantId];

    if (status) {
      query += ' AND r.status = ?';
      params.push(status);
    }
    if (severity) {
      query += ' AND r.severity = ?';
      params.push(severity);
    }
    if (entity_type) {
      query += ' AND r.entity_type = ?';
      params.push(entity_type);
    }
    if (case_id) {
      query += ' AND r.case_id = ?';
      params.push(case_id);
    }

    query += ' ORDER BY r.detected_at DESC LIMIT 300';

    const rows = db.prepare(query).all(...params);
    res.json(rows.map(parseReconciliationIssue));
  } catch (error) {
    console.error('Error listing reconciliation issues:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list reconciliation issues');
  }
});

// GET /api/reconciliation/issues/:id
router.get('/issues/:id', (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    if (!req.tenantId || !req.workspaceId) {
      return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
    }

    const row = db
      .prepare(`
        SELECT r.*, c.case_number, c.status as case_status
        FROM reconciliation_issues r
        LEFT JOIN cases c ON c.id = r.case_id
        WHERE r.id = ? AND r.tenant_id = ?
        LIMIT 1
      `)
      .get(req.params.id, req.tenantId);

    if (!row) return sendError(res, 404, 'RECONCILIATION_ISSUE_NOT_FOUND', 'Reconciliation issue not found');
    res.json(parseReconciliationIssue(row));
  } catch (error) {
    console.error('Error fetching reconciliation issue detail:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch reconciliation issue');
  }
});

// GET /api/reconciliation/metrics
router.get('/metrics', requirePermission('audit.read'), (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    if (!req.tenantId || !req.workspaceId) {
      return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
    }

    const totals = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count,
        SUM(CASE WHEN status = 'escalated' THEN 1 ELSE 0 END) as escalated_count,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved_count,
        SUM(CASE WHEN status = 'ignored' THEN 1 ELSE 0 END) as ignored_count
      FROM reconciliation_issues
      WHERE tenant_id = ?
    `).get(req.tenantId) as any;

    const autoResolved24h = db.prepare(`
      SELECT COUNT(*) as total
      FROM reconciliation_issues
      WHERE tenant_id = ? AND status = 'resolved'
        AND resolved_at >= datetime('now', '-24 hours')
        AND resolution_plan LIKE 'Auto%'
    `).get(req.tenantId) as any;

    const avgResolve = db.prepare(`
      SELECT AVG((julianday(resolved_at) - julianday(detected_at)) * 24.0) as avg_hours
      FROM reconciliation_issues
      WHERE tenant_id = ? AND status = 'resolved' AND resolved_at IS NOT NULL
    `).get(req.tenantId) as any;

    res.json({
      total_issues: totals?.total || 0,
      status_breakdown: {
        open: totals?.open_count || 0,
        in_progress: totals?.in_progress_count || 0,
        escalated: totals?.escalated_count || 0,
        resolved: totals?.resolved_count || 0,
        ignored: totals?.ignored_count || 0,
      },
      auto_resolved_last_24h: autoResolved24h?.total || 0,
      avg_resolution_hours: avgResolve?.avg_hours ? Number(avgResolve.avg_hours) : 0,
    });
  } catch (error) {
    console.error('Error fetching reconciliation metrics:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch reconciliation metrics');
  }
});

// PATCH /api/reconciliation/issues/:id/status
router.patch('/issues/:id/status', requirePermission('cases.write'), (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    if (!req.tenantId || !req.workspaceId) {
      return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
    }

    const nextStatus = String(req.body?.status || '').trim();
    const resolutionPlan =
      typeof req.body?.resolution_plan === 'string' && req.body.resolution_plan.trim().length > 0
        ? req.body.resolution_plan.trim()
        : null;
    const expectedState =
      typeof req.body?.expected_state === 'string' && req.body.expected_state.trim().length > 0
        ? req.body.expected_state.trim()
        : null;

    if (!nextStatus) {
      return sendError(res, 400, 'INVALID_RECONCILIATION_STATUS', 'status is required');
    }

    const issue = db
      .prepare('SELECT * FROM reconciliation_issues WHERE id = ? AND tenant_id = ? LIMIT 1')
      .get(req.params.id, req.tenantId) as any;
    if (!issue) return sendError(res, 404, 'RECONCILIATION_ISSUE_NOT_FOUND', 'Reconciliation issue not found');

    const fromStatus = issue.status as keyof typeof reconciliationIssueTransitions;
    const toStatus = nextStatus as keyof typeof reconciliationIssueTransitions;
    if (
      !fromStatus ||
      !toStatus ||
      !reconciliationIssueTransitions[fromStatus] ||
      !canTransition(fromStatus, toStatus, reconciliationIssueTransitions)
    ) {
      return sendError(res, 400, 'INVALID_RECONCILIATION_TRANSITION', 'Invalid reconciliation status transition', {
        from: issue.status,
        to: nextStatus,
      });
    }

    const resolvedAt = nextStatus === 'resolved' ? new Date().toISOString() : null;
    db.prepare(`
      UPDATE reconciliation_issues
      SET status = ?,
          resolution_plan = COALESCE(?, resolution_plan),
          expected_state = COALESCE(?, expected_state),
          resolved_at = CASE WHEN ? IS NOT NULL THEN ? ELSE resolved_at END
      WHERE id = ? AND tenant_id = ?
    `).run(nextStatus, resolutionPlan, expectedState, resolvedAt, resolvedAt, req.params.id, req.tenantId);

    if (issue.case_id && ['resolved', 'ignored'].includes(nextStatus)) {
      recalcCaseConflictState(db, req.tenantId, req.workspaceId, issue.case_id);
    }

    logAudit(db, {
      tenantId: req.tenantId,
      workspaceId: req.workspaceId,
      actorId: req.userId || 'system',
      action: 'RECONCILIATION_ISSUE_STATUS_CHANGED',
      entityType: 'reconciliation_issue',
      entityId: req.params.id,
      oldValue: { status: issue.status },
      newValue: { status: nextStatus },
      metadata: {
        resolution_plan: resolutionPlan,
        expected_state: expectedState,
      },
    });

    const updated = db
      .prepare('SELECT * FROM reconciliation_issues WHERE id = ? AND tenant_id = ? LIMIT 1')
      .get(req.params.id, req.tenantId);
    res.json(parseReconciliationIssue(updated));
  } catch (error) {
    console.error('Error updating reconciliation issue status:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update reconciliation issue');
  }
});

// POST /api/reconciliation/issues/:id/resolve-apply
router.post('/issues/:id/resolve-apply', requirePermission('cases.write'), (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    if (!req.tenantId || !req.workspaceId) {
      return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
    }

    const issue = db
      .prepare('SELECT * FROM reconciliation_issues WHERE id = ? AND tenant_id = ? LIMIT 1')
      .get(req.params.id, req.tenantId) as any;
    if (!issue) return sendError(res, 404, 'RECONCILIATION_ISSUE_NOT_FOUND', 'Reconciliation issue not found');
    if (!['open', 'in_progress', 'escalated'].includes(issue.status)) {
      return sendError(res, 400, 'RECONCILIATION_ISSUE_NOT_ACTIONABLE', 'Issue must be open, in_progress, or escalated');
    }

    const actualStates = issue.actual_states && typeof issue.actual_states === 'string' ? JSON.parse(issue.actual_states) : {};
    const sourceSystem = issue.source_of_truth_system || null;
    const inferredStatus = sourceSystem && actualStates && typeof actualStates === 'object' ? actualStates[sourceSystem] : null;
    const targetStatus =
      (typeof req.body?.target_status === 'string' && req.body.target_status.trim()) ||
      issue.expected_state ||
      inferredStatus ||
      null;
    if (!targetStatus) {
      return sendError(res, 400, 'RECONCILIATION_TARGET_STATUS_MISSING', 'Could not infer target status to apply');
    }

    resolveIssueBySourceOfTruth(db, {
      tenantId: req.tenantId,
      workspaceId: req.workspaceId,
      userId: req.userId || 'system',
      issue,
      targetStatus: String(targetStatus),
      reason:
        typeof req.body?.reason === 'string' && req.body.reason.trim().length > 0
          ? req.body.reason.trim()
          : 'Auto-applied source-of-truth status',
    });

    const updated = db
      .prepare('SELECT * FROM reconciliation_issues WHERE id = ? AND tenant_id = ? LIMIT 1')
      .get(req.params.id, req.tenantId);
    res.json(parseReconciliationIssue(updated));
  } catch (error) {
    console.error('Error applying reconciliation resolution:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to apply reconciliation resolution');
  }
});

// POST /api/reconciliation/process-open
router.post('/process-open', requirePermission('cases.write'), (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    if (!req.tenantId || !req.workspaceId) {
      return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant/workspace context is missing');
    }

    const limitRaw = Number(req.body?.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(200, Math.trunc(limitRaw)) : 50;
    const issues = db.prepare(`
      SELECT *
      FROM reconciliation_issues
      WHERE tenant_id = ?
        AND status IN ('open', 'in_progress')
        AND source_of_truth_system IS NOT NULL
        AND (expected_state IS NOT NULL OR actual_states IS NOT NULL)
      ORDER BY detected_at ASC
      LIMIT ?
    `).all(req.tenantId, limit) as any[];

    const resolvedIds: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];
    for (const issue of issues) {
      try {
        const actualStates = issue.actual_states && typeof issue.actual_states === 'string' ? JSON.parse(issue.actual_states) : {};
        const inferredStatus =
          issue.source_of_truth_system && actualStates && typeof actualStates === 'object'
            ? actualStates[issue.source_of_truth_system]
            : null;
        const targetStatus = issue.expected_state || inferredStatus || null;
        if (!targetStatus) {
          skipped.push({ id: issue.id, reason: 'target_status_unavailable' });
          continue;
        }

        resolveIssueBySourceOfTruth(db, {
          tenantId: req.tenantId,
          workspaceId: req.workspaceId,
          userId: req.userId || 'system',
          issue,
          targetStatus: String(targetStatus),
          reason: 'Auto-resolved by reconciliation processor',
        });
        resolvedIds.push(issue.id);
      } catch (err) {
        skipped.push({ id: issue.id, reason: err instanceof Error ? err.message : 'unknown_error' });
      }
    }

    res.json({
      success: true,
      scanned: issues.length,
      resolved_count: resolvedIds.length,
      resolved_ids: resolvedIds,
      skipped_count: skipped.length,
      skipped,
    });
  } catch (error) {
    console.error('Error processing open reconciliation issues:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to process open reconciliation issues');
  }
});

export default router;
