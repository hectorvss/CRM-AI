import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../db/client.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { logAudit, parseRow } from '../db/utils.js';

const router = Router();

router.use(extractMultiTenant);

function getWorkflowMetrics(db: any, workflowId: string, tenantId: string) {
  const runs = db.prepare(`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
           SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) as running,
           MAX(started_at) as last_run_at
    FROM workflow_runs
    WHERE workflow_version_id IN (
      SELECT id FROM workflow_versions WHERE workflow_id = ?
    ) AND tenant_id = ?
  `).get(workflowId, tenantId) as any;

  const total = Number(runs?.total || 0);
  const completed = Number(runs?.completed || 0);

  return {
    executions: total,
    completed,
    failed: Number(runs?.failed || 0),
    running: Number(runs?.running || 0),
    success_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
    avg_time_saved: total > 0 ? `${Math.max(1, Math.round(total / 12))}m` : 'N/A',
    last_run_at: runs?.last_run_at || null,
  };
}

function getCurrentVersion(db: any, workflowId: string, currentVersionId?: string | null) {
  if (currentVersionId) {
    return db.prepare('SELECT * FROM workflow_versions WHERE id = ?').get(currentVersionId);
  }
  return db.prepare(`
    SELECT *
    FROM workflow_versions
    WHERE workflow_id = ?
    ORDER BY version_number DESC
    LIMIT 1
  `).get(workflowId);
}

router.get('/', (req: MultiTenantRequest, res) => {
  const db = getDb();
  const tenantId = req.tenantId!;
  const workspaceId = req.workspaceId!;
  const wfs = db.prepare(`
    SELECT wd.*, wv.status as version_status, wv.version_number, wv.trigger, wv.nodes, wv.edges
    FROM workflow_definitions wd
    LEFT JOIN workflow_versions wv ON wd.current_version_id = wv.id
    WHERE wd.tenant_id = ? AND wd.workspace_id = ?
    ORDER BY wd.updated_at DESC
  `).all(tenantId, workspaceId);

  res.json(wfs.map((workflow: any) => {
    const parsed = parseRow(workflow) as any;
    const metrics = getWorkflowMetrics(db, workflow.id, tenantId);
    const health_status =
      metrics.failed > 0 ? 'warning'
      : parsed.version_status === 'draft' ? 'needs_setup'
      : 'active';

    return {
      ...parsed,
      metrics,
      health_status,
      health_message: health_status === 'warning' ? 'Recent workflow failures detected' : undefined,
      last_run_at: metrics.last_run_at,
    };
  }));
});

router.post('/', (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const now = new Date().toISOString();
    const workflowId = randomUUID();
    const versionId = randomUUID();
    const {
      name = 'New workflow draft',
      description = 'Draft workflow created from template',
      nodes = [],
      edges = [],
      trigger = { type: 'manual' },
    } = req.body ?? {};

    db.prepare(`
      INSERT INTO workflow_definitions (
        id, tenant_id, workspace_id, name, description, current_version_id, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      workflowId,
      tenantId,
      workspaceId,
      name,
      description,
      versionId,
      req.userId ?? 'system',
      now,
      now,
    );

    db.prepare(`
      INSERT INTO workflow_versions (
        id, workflow_id, version_number, status, nodes, edges, trigger, tenant_id
      ) VALUES (?, ?, 1, 'draft', ?, ?, ?, ?)
    `).run(
      versionId,
      workflowId,
      JSON.stringify(nodes),
      JSON.stringify(edges),
      JSON.stringify(trigger),
      tenantId,
    );

    const workflow = db.prepare('SELECT * FROM workflow_definitions WHERE id = ?').get(workflowId);
    const version = db.prepare('SELECT * FROM workflow_versions WHERE id = ?').get(versionId);

    logAudit(db, {
      tenantId,
      workspaceId,
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_CREATED',
      entityType: 'workflow',
      entityId: workflowId,
      newValue: { workflow: parseRow(workflow), version: parseRow(version) },
    });

    res.status(201).json({
      ...parseRow(workflow),
      current_version: parseRow(version),
      metrics: getWorkflowMetrics(db, workflowId, tenantId),
    });
  } catch (error) {
    console.error('Error creating workflow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/runs/recent', (req: MultiTenantRequest, res) => {
  const db = getDb();
  const runs = db.prepare(`
    SELECT wr.*, wd.name as workflow_name, c.case_number
    FROM workflow_runs wr
    LEFT JOIN workflow_versions wv ON wr.workflow_version_id = wv.id
    LEFT JOIN workflow_definitions wd ON wv.workflow_id = wd.id
    LEFT JOIN cases c ON wr.case_id = c.id
    WHERE wr.tenant_id = ?
    ORDER BY wr.started_at DESC LIMIT 50
  `).all(req.tenantId);
  res.json(runs.map(parseRow));
});

router.get('/:id', (req: MultiTenantRequest, res) => {
  const db = getDb();
  const wf = db.prepare(`
    SELECT *
    FROM workflow_definitions
    WHERE id = ? AND tenant_id = ? AND workspace_id = ?
  `).get(req.params.id, req.tenantId, req.workspaceId) as any;
  if (!wf) return res.status(404).json({ error: 'Not found' });

  const versions = db.prepare(`
    SELECT *
    FROM workflow_versions
    WHERE workflow_id = ?
    ORDER BY version_number DESC
  `).all(req.params.id).map(parseRow);
  const runs = db.prepare(`
    SELECT wr.*, c.case_number
    FROM workflow_runs wr
    LEFT JOIN cases c ON wr.case_id = c.id
    WHERE wr.workflow_version_id IN (SELECT id FROM workflow_versions WHERE workflow_id = ?)
      AND wr.tenant_id = ?
    ORDER BY wr.started_at DESC LIMIT 20
  `).all(req.params.id, req.tenantId).map(parseRow);

  const currentVersion = getCurrentVersion(db, wf.id, wf.current_version_id);

  res.json({
    ...parseRow(wf),
    current_version: parseRow(currentVersion),
    versions,
    recent_runs: runs,
    metrics: getWorkflowMetrics(db, wf.id, req.tenantId!),
  });
});

router.put('/:id', (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wf = db.prepare(`
      SELECT *
      FROM workflow_definitions
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).get(req.params.id, tenantId, workspaceId) as any;

    if (!wf) return res.status(404).json({ error: 'Not found' });

    const currentVersion = getCurrentVersion(db, wf.id, wf.current_version_id) as any;
    const currentParsed = parseRow(currentVersion) as any;
    const nextVersionNumber = currentVersion ? Number(currentVersion.version_number || 0) + 1 : 1;
    const draftId = currentVersion?.status === 'draft' ? currentVersion.id : randomUUID();
    const merged = {
      nodes: req.body.nodes ?? currentParsed.nodes ?? [],
      edges: req.body.edges ?? currentParsed.edges ?? [],
      trigger: req.body.trigger ?? currentParsed.trigger ?? {},
      status: 'draft',
    };
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE workflow_definitions
      SET name = ?, description = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).run(
      req.body.name ?? wf.name,
      req.body.description ?? wf.description,
      now,
      wf.id,
      tenantId,
      workspaceId,
    );

    if (currentVersion?.status === 'draft') {
      db.prepare(`
        UPDATE workflow_versions
        SET nodes = ?, edges = ?, trigger = ?
        WHERE id = ?
      `).run(
        JSON.stringify(merged.nodes),
        JSON.stringify(merged.edges),
        JSON.stringify(merged.trigger),
        draftId,
      );
    } else {
      db.prepare(`
        INSERT INTO workflow_versions (
          id, workflow_id, version_number, status, nodes, edges, trigger, tenant_id
        ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?)
      `).run(
        draftId,
        wf.id,
        nextVersionNumber,
        JSON.stringify(merged.nodes),
        JSON.stringify(merged.edges),
        JSON.stringify(merged.trigger),
        tenantId,
      );
    }

    const draftVersion = db.prepare('SELECT * FROM workflow_versions WHERE id = ?').get(draftId);

    logAudit(db, {
      tenantId,
      workspaceId,
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_DRAFT_UPDATED',
      entityType: 'workflow',
      entityId: wf.id,
      oldValue: { workflow: parseRow(wf), version: currentParsed },
      newValue: { workflow: { ...parseRow(wf), ...req.body }, version: parseRow(draftVersion) },
    });

    res.json({
      ...parseRow(wf),
      name: req.body.name ?? wf.name,
      description: req.body.description ?? wf.description,
      current_version: parseRow(draftVersion),
      metrics: getWorkflowMetrics(db, wf.id, tenantId),
    });
  } catch (error) {
    console.error('Error updating workflow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/publish', (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wf = db.prepare(`
      SELECT *
      FROM workflow_definitions
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).get(req.params.id, tenantId, workspaceId) as any;

    if (!wf) return res.status(404).json({ error: 'Not found' });

    const draftVersion = db.prepare(`
      SELECT *
      FROM workflow_versions
      WHERE workflow_id = ? AND status = 'draft'
      ORDER BY version_number DESC
      LIMIT 1
    `).get(wf.id) as any;

    if (!draftVersion) {
      return res.status(400).json({ error: 'No draft version available to publish' });
    }

    const now = new Date().toISOString();
    if (wf.current_version_id && wf.current_version_id !== draftVersion.id) {
      db.prepare(`
        UPDATE workflow_versions
        SET status = 'archived'
        WHERE id = ?
      `).run(wf.current_version_id);
    }

    db.prepare(`
      UPDATE workflow_versions
      SET status = 'published', published_by = ?, published_at = ?
      WHERE id = ?
    `).run(req.userId ?? 'system', now, draftVersion.id);

    db.prepare(`
      UPDATE workflow_definitions
      SET current_version_id = ?, updated_at = ?
      WHERE id = ?
    `).run(draftVersion.id, now, wf.id);

    const updated = db.prepare('SELECT * FROM workflow_definitions WHERE id = ?').get(wf.id);
    const version = db.prepare('SELECT * FROM workflow_versions WHERE id = ?').get(draftVersion.id);

    logAudit(db, {
      tenantId,
      workspaceId,
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_PUBLISHED',
      entityType: 'workflow',
      entityId: wf.id,
      newValue: { workflow: parseRow(updated), version: parseRow(version) },
    });

    res.json({
      ...parseRow(updated),
      current_version: parseRow(version),
      metrics: getWorkflowMetrics(db, wf.id, tenantId),
    });
  } catch (error) {
    console.error('Error publishing workflow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
