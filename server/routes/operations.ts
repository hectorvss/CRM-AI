import { Router } from 'express';
import { getDb } from '../db/client.js';
import { parseRow } from '../db/utils.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { workerStatus } from '../queue/worker.js';
import { integrationRegistry } from '../integrations/registry.js';

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

    const queueStatus = db.prepare(`
      SELECT status, COUNT(*) as count
      FROM jobs
      WHERE tenant_id = ?
        AND (workspace_id = ? OR workspace_id IS NULL)
      GROUP BY status
    `).all(tenantId, workspaceId) as Array<{ status: string; count: number }>;

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

router.get('/canonical-events', (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT *
      FROM canonical_events
      WHERE tenant_id = ?
        AND workspace_id = ?
      ORDER BY occurred_at DESC, created_at DESC
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
      SELECT *
      FROM agent_runs
      WHERE tenant_id = ?
      ORDER BY started_at DESC
      LIMIT 100
    `).all(req.tenantId);

    res.json(rows.map(parseRow));
  } catch (error) {
    console.error('Operations agent runs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
