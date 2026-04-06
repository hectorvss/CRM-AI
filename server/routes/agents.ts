import { Router, Response } from 'express';
import { getDb } from '../db/client.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { parseRow } from '../db/utils.js';

const router = Router();

// Apply multi-tenant middleware
router.use(extractMultiTenant);

// GET /api/agents
router.get('/', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const agents = db.prepare(`
      SELECT a.*, av.version_number, av.status as version_status, av.rollout_percentage,
             av.permission_profile, av.reasoning_profile, av.safety_profile
      FROM agents a
      LEFT JOIN agent_versions av ON a.current_version_id = av.id
      WHERE a.tenant_id = ?
      ORDER BY a.category, a.name
    `).all(req.tenantId);

    const result = agents.map((a: any) => {
      const runs = db.prepare(`
        SELECT COUNT(*) as total, AVG(confidence) as avg_confidence,
               SUM(tokens_used) as total_tokens, SUM(cost_credits) as total_credits
        FROM agent_runs WHERE agent_id = ? AND tenant_id = ?
      `).get(a.id, req.tenantId) as any;
      
      const parsed = parseRow(a);
      return { ...parsed, metrics: runs };
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/agents/:id
router.get('/:id', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const versions = db.prepare('SELECT * FROM agent_versions WHERE agent_id = ? ORDER BY version_number DESC').all(req.params.id);
    const recentRuns = db.prepare(`
      SELECT ar.*, c.case_number 
      FROM agent_runs ar LEFT JOIN cases c ON ar.case_id = c.id
      WHERE ar.agent_id = ? AND ar.tenant_id = ?
      ORDER BY ar.started_at DESC LIMIT 20
    `).all(req.params.id, req.tenantId);

    res.json({ ...(agent as any), versions, recent_runs: recentRuns.map(parseRow) });
  } catch (error) {
    console.error('Error fetching agent detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Connectors Router ──────────────────────────────────────────
export const connectorsRouter = Router();
connectorsRouter.use(extractMultiTenant);

connectorsRouter.get('/', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const connectors = db.prepare('SELECT * FROM connectors WHERE tenant_id = ? ORDER BY system').all(req.tenantId);
    res.json(connectors.map((c: any) => {
      const caps = db.prepare('SELECT * FROM connector_capabilities WHERE connector_id = ?').all(c.id);
      return { ...c, connector_capabilities: caps };
    }));
  } catch (error) {
    console.error('Error fetching connectors:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

connectorsRouter.get('/:id', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const conn = db.prepare('SELECT * FROM connectors WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId) as any;
    if (!conn) return res.status(404).json({ error: 'Connector not found' });
    const caps = db.prepare('SELECT * FROM connector_capabilities WHERE connector_id = ?').all(req.params.id);
    const webhooks = db.prepare('SELECT * FROM webhook_events WHERE connector_id = ? ORDER BY received_at DESC LIMIT 50').all(req.params.id);
    res.json({ ...conn, capabilities: caps, recent_webhooks: webhooks });
  } catch (error) {
    console.error('Error fetching connector detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
