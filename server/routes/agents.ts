import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../db/client.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { parseRow } from '../db/utils.js';
import { runAgent } from '../agents/runner.js';
import { triggerAgents } from '../agents/orchestrator.js';

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

// POST /api/agents/:id/run — manually trigger an agent for a case
router.post('/:id/run', async (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const agent = db.prepare('SELECT slug FROM agents WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.tenantId) as { slug: string } | undefined;

    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const { caseId, triggerEvent = 'case_created', context = {} } = req.body;
    if (!caseId) return res.status(400).json({ error: 'caseId is required' });

    const result = await runAgent({
      agentSlug: agent.slug,
      caseId,
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId ?? 'ws_default',
      triggerEvent,
      extraContext: context,
    });

    res.json({ success: result.success, result });
  } catch (error) {
    console.error('Error running agent:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/agents/trigger — fire a full agent chain for a trigger event
router.post('/trigger', async (req: MultiTenantRequest, res: Response) => {
  try {
    const { caseId, triggerEvent, agentSlug, context = {} } = req.body;

    if (!caseId)       return res.status(400).json({ error: 'caseId is required' });
    if (!triggerEvent) return res.status(400).json({ error: 'triggerEvent is required' });

    const validEvents = ['case_created', 'message_received', 'conflicts_detected', 'case_resolved'];
    if (!validEvents.includes(triggerEvent)) {
      return res.status(400).json({ error: `triggerEvent must be one of: ${validEvents.join(', ')}` });
    }

    if (agentSlug) {
      // Single agent run — synchronous
      const result = await runAgent({
        agentSlug,
        caseId,
        tenantId: req.tenantId!,
        workspaceId: req.workspaceId ?? 'ws_default',
        triggerEvent,
        extraContext: context,
      });
      return res.json({ mode: 'direct', result });
    }

    // Full chain — enqueue AGENT_TRIGGER job (async)
    triggerAgents(triggerEvent, caseId, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId ?? 'ws_default',
      context,
    });

    res.json({ mode: 'queued', message: `Agent chain for "${triggerEvent}" enqueued for case ${caseId}` });
  } catch (error) {
    console.error('Error triggering agents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/agents/:id/config — update agent version profiles
router.put('/:id/config', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.tenantId) as any;

    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (agent.is_locked) return res.status(403).json({ error: 'Agent is locked and cannot be modified' });

    const { permissionProfile, reasoningProfile, safetyProfile, isActive } = req.body;
    const now = new Date().toISOString();

    // Update is_active on agent row
    if (typeof isActive === 'boolean') {
      db.prepare('UPDATE agents SET is_active = ?, updated_at = ? WHERE id = ?')
        .run(isActive ? 1 : 0, now, agent.id);
    }

    // Update profiles on current version
    if (agent.current_version_id && (permissionProfile || reasoningProfile || safetyProfile)) {
      const updates: string[] = [];
      const params: any[] = [];

      if (permissionProfile) { updates.push('permission_profile = ?'); params.push(JSON.stringify(permissionProfile)); }
      if (reasoningProfile)  { updates.push('reasoning_profile = ?');  params.push(JSON.stringify(reasoningProfile)); }
      if (safetyProfile)     { updates.push('safety_profile = ?');     params.push(JSON.stringify(safetyProfile)); }

      if (updates.length > 0) {
        params.push(agent.current_version_id);
        db.prepare(`UPDATE agent_versions SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      }
    }

    const updated = db.prepare('SELECT * FROM agents WHERE id = ?').get(agent.id);
    res.json(parseRow(updated));
  } catch (error) {
    console.error('Error updating agent config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/agents/:id/runs — recent runs for an agent
router.get('/:id/runs', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const runs = db.prepare(`
      SELECT ar.*, c.case_number
      FROM agent_runs ar
      LEFT JOIN cases c ON ar.case_id = c.id
      WHERE ar.agent_id = ? AND ar.tenant_id = ?
      ORDER BY ar.started_at DESC
      LIMIT ?
    `).all(req.params.id, req.tenantId, limit);

    res.json(runs.map(parseRow));
  } catch (error) {
    console.error('Error fetching agent runs:', error);
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
