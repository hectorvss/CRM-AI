import { Router } from 'express';
import { getDb } from '../db/client.js';
import { parseRow } from '../db/utils.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { retryDeadJob, enqueue } from '../queue/client.js';
import { workerStatus } from '../queue/worker.js';
import { integrationRegistry } from '../integrations/registry.js';
import { JobType } from '../queue/types.js';

const router = Router();

router.use(extractMultiTenant);

router.get('/overview', async (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;

    const webhookStatus = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM webhook_events
      WHERE tenant_id = ?
      GROUP BY status
    `).all(tenantId) as Array<{ status: string; count: number }>;

    const canonicalStatus = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM canonical_events
      WHERE tenant_id = ? AND workspace_id = ?
      GROUP BY status
    `).all(tenantId, workspaceId) as Array<{ status: string; count: number }>;

    const recentAgentRuns = db.prepare(`
      SELECT COUNT(*) as count
      FROM agent_runs
      WHERE tenant_id = ?
        AND started_at >= datetime('now', '-24 hours')
    `).get(tenantId) as { count: number } | undefined;

    const failedAgentRuns = db.prepare(`
      SELECT COUNT(*) as count
      FROM agent_runs
      WHERE tenant_id = ?
        AND outcome_status = 'failed'
        AND started_at >= datetime('now', '-24 hours')
    `).get(tenantId) as { count: number } | undefined;

    const queueStatus = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM jobs
      WHERE tenant_id = ?
        AND (workspace_id = ? OR workspace_id IS NULL)
      GROUP BY status
    `).all(tenantId, workspaceId) as Array<{ status: string; count: number }>;

    const staleWebhooks = db.prepare(`
      SELECT COUNT(*) as count
      FROM webhook_events
      WHERE tenant_id = ?
        AND status != 'processed'
        AND received_at < datetime('now', '-15 minutes')
    `).get(tenantId) as { count: number } | undefined;

    const alerts: string[] = [];
    if ((queueStatus.find(row => row.status === 'dead')?.count ?? 0) > 0) {
      alerts.push('dead_jobs_detected');
    }
    if ((staleWebhooks?.count ?? 0) > 0) {
      alerts.push('stale_webhooks_detected');
    }
    if ((failedAgentRuns?.count ?? 0) > 0) {
      alerts.push('agent_failures_detected');
    }

    res.json({
      worker: workerStatus(),
      queue: queueStatus.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = row.count;
        return acc;
      }, {}),
      webhooks: webhookStatus.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = row.count;
        return acc;
      }, {}),
      canonical_events: canonicalStatus.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = row.count;
        return acc;
      }, {}),
      agent_runs_last_24h: recentAgentRuns?.count ?? 0,
      agent_failures_last_24h: failedAgentRuns?.count ?? 0,
      stale_webhooks: staleWebhooks?.count ?? 0,
      alerts,
      integrations: {
        registered: integrationRegistry.registeredSystems(),
        health: await integrationRegistry.healthCheck(),
      },
    });
  } catch (error) {
    console.error('Operations overview error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/jobs', (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const jobs = db.prepare(`
      SELECT *
      FROM jobs
      WHERE tenant_id = ?
        AND (workspace_id = ? OR workspace_id IS NULL)
      ORDER BY created_at DESC
      LIMIT 100
    `).all(req.tenantId, req.workspaceId);

    res.json(jobs.map(parseRow));
  } catch (error) {
    console.error('Operations jobs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/jobs/dead-letter', (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const jobs = db.prepare(`
      SELECT *
      FROM jobs
      WHERE tenant_id = ?
        AND (workspace_id = ? OR workspace_id IS NULL)
        AND status = 'dead'
      ORDER BY finished_at DESC, created_at DESC
      LIMIT 100
    `).all(req.tenantId, req.workspaceId);

    res.json(jobs.map(parseRow));
  } catch (error) {
    console.error('Operations dead-letter jobs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/jobs/:id/retry', (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const job = db.prepare(`
      SELECT id, tenant_id, workspace_id, status
      FROM jobs
      WHERE id = ?
    `).get(req.params.id) as { id: string; tenant_id: string; workspace_id: string | null; status: string } | undefined;

    if (!job || job.tenant_id !== req.tenantId || (job.workspace_id && job.workspace_id !== req.workspaceId)) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const ok = retryDeadJob(req.params.id);
    if (!ok) {
      res.status(400).json({ error: 'Only dead jobs can be retried' });
      return;
    }

    res.json({ ok: true, jobId: req.params.id, status: 'pending' });
  } catch (error) {
    console.error('Operations retry job error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/webhooks', (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT *
      FROM webhook_events
      WHERE tenant_id = ?
      ORDER BY received_at DESC
      LIMIT 100
    `).all(req.tenantId);

    res.json(rows.map(parseRow));
  } catch (error) {
    console.error('Operations webhooks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/webhooks/:id/replay', (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const row = db.prepare(`
      SELECT *
      FROM webhook_events
      WHERE id = ? AND tenant_id = ?
      LIMIT 1
    `).get(req.params.id, req.tenantId) as any;

    if (!row) {
      res.status(404).json({ error: 'Webhook event not found' });
      return;
    }

    const traceId = row.canonical_event_id || row.id;
    const jobId = enqueue(
      JobType.WEBHOOK_PROCESS,
      {
        webhookEventId: row.id,
        source: row.source_system,
        rawBody: row.raw_payload || '{}',
        headers: {},
      },
      {
        tenantId: req.tenantId,
        workspaceId: req.workspaceId,
        traceId,
        priority: 3,
      },
    );

    db.prepare(`
      UPDATE webhook_events
      SET status = 'received', processed_at = NULL
      WHERE id = ?
    `).run(row.id);

    res.json({ ok: true, webhookEventId: row.id, jobId });
  } catch (error) {
    console.error('Operations replay webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/canonical-events', (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT *
      FROM canonical_events
      WHERE tenant_id = ?
        AND workspace_id = ?
      ORDER BY occurred_at DESC, ingested_at DESC
      LIMIT 100
    `).all(req.tenantId, req.workspaceId);

    res.json(rows.map(parseRow));
  } catch (error) {
    console.error('Operations canonical events error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/agent-runs', (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT ar.*, a.name as agent_name, a.slug as agent_slug
      FROM agent_runs ar
      JOIN agents a ON a.id = ar.agent_id
      WHERE ar.tenant_id = ?
      ORDER BY ar.started_at DESC
      LIMIT 100
    `).all(req.tenantId);

    res.json(rows.map(parseRow));
  } catch (error) {
    console.error('Operations agent runs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
