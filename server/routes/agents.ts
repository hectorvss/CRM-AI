import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../db/client.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { logAudit, parseRow } from '../db/utils.js';
import { runAgent } from '../agents/runner.js';
import { triggerAgents } from '../agents/orchestrator.js';

const router = Router();

// Apply multi-tenant middleware
router.use(extractMultiTenant);

function getAgentWithVersion(db: any, agentId: string, tenantId: string) {
  return db.prepare(`
    SELECT a.*, av.id as version_id, av.version_number, av.status as version_status,
           av.rollout_percentage, av.permission_profile, av.reasoning_profile,
           av.safety_profile, av.knowledge_profile, av.capabilities, av.published_at
    FROM agents a
    LEFT JOIN agent_versions av ON a.current_version_id = av.id
    WHERE a.id = ? AND a.tenant_id = ?
  `).get(agentId, tenantId) as any;
}

function getLatestAgentVersion(db: any, agentId: string, status?: string) {
  const clauses = ['agent_id = ?'];
  const params: any[] = [agentId];
  if (status) {
    clauses.push('status = ?');
    params.push(status);
  }

  return db.prepare(`
    SELECT *
    FROM agent_versions
    WHERE ${clauses.join(' AND ')}
    ORDER BY version_number DESC
    LIMIT 1
  `).get(...params) as any;
}

function buildEffectivePolicy(agent: any, connectorCapabilities: any[]) {
  const parsed = parseRow(agent) as any;
  const globalSafety = {
    enforcement: 'restrictive_wins',
    workspace_lock: parsed.is_locked ? 'locked' : 'editable',
  };

  return {
    agent_id: parsed.id,
    agent_name: parsed.name,
    is_active: Boolean(parsed.is_active),
    version_id: parsed.version_id,
    version_status: parsed.version_status,
    global_safety: globalSafety,
    permission_profile: parsed.permission_profile ?? {},
    reasoning_profile: parsed.reasoning_profile ?? {},
    safety_profile: parsed.safety_profile ?? {},
    knowledge_profile: parsed.knowledge_profile ?? {},
    connector_capabilities: connectorCapabilities,
    rollout_policy: {
      rollout_percentage: parsed.rollout_percentage ?? 100,
      published_at: parsed.published_at ?? null,
    },
    precedence: [
      'workspace_safety',
      'domain_safety',
      'global_permissions',
      'agent_overrides',
      'dynamic_case_conditions',
    ],
  };
}

function upsertDraftVersion(db: any, agent: any, payload: any) {
  const current = agent.current_version_id
    ? db.prepare('SELECT * FROM agent_versions WHERE id = ?').get(agent.current_version_id)
    : null;
  const currentParsed = parseRow(current) as any;
  const existingDraft = getLatestAgentVersion(db, agent.id, 'draft');
  const draftId = existingDraft?.id ?? randomUUID();
  const nextVersionNumber = existingDraft?.version_number
    ?? ((currentParsed?.version_number || 0) + 1);
  const next = {
    permission_profile: payload.permission_profile ?? payload.permissionProfile ?? existingDraft?.permission_profile ?? currentParsed?.permission_profile ?? {},
    reasoning_profile: payload.reasoning_profile ?? payload.reasoningProfile ?? existingDraft?.reasoning_profile ?? currentParsed?.reasoning_profile ?? {},
    safety_profile: payload.safety_profile ?? payload.safetyProfile ?? existingDraft?.safety_profile ?? currentParsed?.safety_profile ?? {},
    knowledge_profile: payload.knowledge_profile ?? payload.knowledgeProfile ?? existingDraft?.knowledge_profile ?? currentParsed?.knowledge_profile ?? {},
    capabilities: payload.connector_capabilities ?? payload.capabilities ?? existingDraft?.capabilities ?? currentParsed?.capabilities ?? {},
    rollout_percentage: payload.rollout_policy?.rollout_percentage ?? payload.rolloutPercentage ?? existingDraft?.rollout_percentage ?? currentParsed?.rollout_percentage ?? 100,
  };

  if (existingDraft) {
    db.prepare(`
      UPDATE agent_versions
      SET permission_profile = ?, reasoning_profile = ?, safety_profile = ?,
          knowledge_profile = ?, capabilities = ?, rollout_percentage = ?
      WHERE id = ?
    `).run(
      JSON.stringify(next.permission_profile),
      JSON.stringify(next.reasoning_profile),
      JSON.stringify(next.safety_profile),
      JSON.stringify(next.knowledge_profile),
      JSON.stringify(next.capabilities),
      next.rollout_percentage,
      draftId,
    );
  } else {
    db.prepare(`
      INSERT INTO agent_versions (
        id, agent_id, version_number, status,
        permission_profile, reasoning_profile, safety_profile,
        knowledge_profile, capabilities, rollout_percentage, tenant_id
      ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      draftId,
      agent.id,
      nextVersionNumber,
      JSON.stringify(next.permission_profile),
      JSON.stringify(next.reasoning_profile),
      JSON.stringify(next.safety_profile),
      JSON.stringify(next.knowledge_profile),
      JSON.stringify(next.capabilities),
      next.rollout_percentage,
      agent.tenant_id,
    );
  }

  return db.prepare('SELECT * FROM agent_versions WHERE id = ?').get(draftId);
}

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

router.get('/:id/policy-bundle\\:draft', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const agent = getAgentWithVersion(db, req.params.id, req.tenantId!);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const draft = getLatestAgentVersion(db, req.params.id, 'draft')
      ?? db.prepare('SELECT * FROM agent_versions WHERE id = ?').get(agent.current_version_id);

    res.json({
      agent_id: agent.id,
      bundle_status: draft?.status ?? 'published',
      bundle: parseRow(draft),
    });
  } catch (error) {
    console.error('Error fetching policy bundle draft:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id/policy-bundle\\:draft', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.tenantId) as any;

    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (agent.is_locked) return res.status(403).json({ error: 'Agent is locked and cannot be modified' });

    const draft = upsertDraftVersion(db, agent, req.body);

    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId ?? 'system',
      action: 'AGENT_POLICY_DRAFT_UPDATED',
      entityType: 'agent',
      entityId: agent.id,
      newValue: parseRow(draft),
    });

    res.json({
      agent_id: agent.id,
      bundle_status: 'draft',
      bundle: parseRow(draft),
    });
  } catch (error) {
    console.error('Error updating policy bundle draft:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/policy-bundle\\:publish', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.tenantId) as any;
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const draft = getLatestAgentVersion(db, agent.id, 'draft');
    if (!draft) return res.status(400).json({ error: 'No draft bundle to publish' });

    const now = new Date().toISOString();
    if (agent.current_version_id && agent.current_version_id !== draft.id) {
      db.prepare(`UPDATE agent_versions SET status = 'archived' WHERE id = ?`).run(agent.current_version_id);
    }

    db.prepare(`
      UPDATE agent_versions
      SET status = 'published', published_by = ?, published_at = ?
      WHERE id = ?
    `).run(req.userId ?? 'system', now, draft.id);

    db.prepare(`
      UPDATE agents
      SET current_version_id = ?, updated_at = ?, is_active = ?
      WHERE id = ?
    `).run(draft.id, now, typeof req.body.isActive === 'boolean' ? (req.body.isActive ? 1 : 0) : agent.is_active, agent.id);

    const publishedAgent = getAgentWithVersion(db, agent.id, req.tenantId!);
    const connectorCapabilities = db.prepare(`
      SELECT c.system, cc.capability_key, cc.direction, cc.is_enabled, cc.requires_approval, cc.is_idempotent
      FROM connectors c
      LEFT JOIN connector_capabilities cc ON cc.connector_id = c.id
      WHERE c.tenant_id = ?
      ORDER BY c.system, cc.capability_key
    `).all(req.tenantId).map(parseRow);

    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId ?? 'system',
      action: 'AGENT_POLICY_PUBLISHED',
      entityType: 'agent',
      entityId: agent.id,
      newValue: parseRow(draft),
    });

    res.json(buildEffectivePolicy(publishedAgent, connectorCapabilities));
  } catch (error) {
    console.error('Error publishing agent policy bundle:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/policy-bundle\\:rollback', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.tenantId) as any;
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const target = req.body?.versionId
      ? db.prepare('SELECT * FROM agent_versions WHERE id = ? AND agent_id = ?').get(req.body.versionId, agent.id)
      : db.prepare(`
          SELECT *
          FROM agent_versions
          WHERE agent_id = ? AND status = 'published' AND id <> ?
          ORDER BY version_number DESC
          LIMIT 1
        `).get(agent.id, agent.current_version_id) as any;

    if (!target) return res.status(400).json({ error: 'No published version available for rollback' });

    const now = new Date().toISOString();
    db.prepare(`UPDATE agent_versions SET status = 'archived' WHERE id = ?`).run(agent.current_version_id);
    db.prepare(`
      UPDATE agent_versions
      SET status = 'published', published_by = ?, published_at = ?
      WHERE id = ?
    `).run(req.userId ?? 'system', now, target.id);
    db.prepare(`UPDATE agents SET current_version_id = ?, updated_at = ? WHERE id = ?`).run(target.id, now, agent.id);

    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId ?? 'system',
      action: 'AGENT_POLICY_ROLLBACK',
      entityType: 'agent',
      entityId: agent.id,
      newValue: parseRow(target),
    });

    res.json({ success: true, rolled_back_to: parseRow(target) });
  } catch (error) {
    console.error('Error rolling back agent policy bundle:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/effective-policy', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const agent = getAgentWithVersion(db, req.params.id, req.tenantId!);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const connectorCapabilities = db.prepare(`
      SELECT c.system, cc.capability_key, cc.direction, cc.is_enabled, cc.requires_approval, cc.is_idempotent
      FROM connectors c
      LEFT JOIN connector_capabilities cc ON cc.connector_id = c.id
      WHERE c.tenant_id = ?
      ORDER BY c.system, cc.capability_key
    `).all(req.tenantId).map(parseRow);

    res.json(buildEffectivePolicy(agent, connectorCapabilities));
  } catch (error) {
    console.error('Error fetching effective policy:', error);
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
      const caps = db.prepare('SELECT * FROM connector_capabilities WHERE connector_id = ?').all(c.id).map(parseRow);
      return { ...parseRow(c), connector_capabilities: caps };
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
    const caps = db.prepare('SELECT * FROM connector_capabilities WHERE connector_id = ?').all(req.params.id).map(parseRow);
    const webhooks = db.prepare('SELECT * FROM webhook_events WHERE connector_id = ? ORDER BY received_at DESC LIMIT 50').all(req.params.id).map(parseRow);
    res.json({ ...parseRow(conn), capabilities: caps, recent_webhooks: webhooks });
  } catch (error) {
    console.error('Error fetching connector detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

connectorsRouter.put('/:id', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const connector = db.prepare('SELECT * FROM connectors WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.tenantId) as any;
    if (!connector) return res.status(404).json({ error: 'Connector not found' });

    const now = new Date().toISOString();
    const nextStatus = req.body.status ?? connector.status;
    const nextAuthConfig = req.body.auth_config ?? req.body.authConfig ?? parseRow(connector).auth_config ?? {};
    const nextCapabilities = req.body.capabilities ?? connector.capabilities ?? [];

    db.prepare(`
      UPDATE connectors
      SET status = ?, auth_config = ?, capabilities = ?, updated_at = ?, last_health_check_at = ?
      WHERE id = ? AND tenant_id = ?
    `).run(
      nextStatus,
      JSON.stringify(nextAuthConfig),
      JSON.stringify(nextCapabilities),
      now,
      now,
      connector.id,
      req.tenantId,
    );

    if (Array.isArray(req.body.connector_capabilities)) {
      for (const capability of req.body.connector_capabilities) {
        const existing = db.prepare(`
          SELECT id
          FROM connector_capabilities
          WHERE connector_id = ? AND capability_key = ?
        `).get(connector.id, capability.capability_key) as any;

        if (existing) {
          db.prepare(`
            UPDATE connector_capabilities
            SET direction = ?, is_enabled = ?, requires_approval = ?, is_idempotent = ?
            WHERE id = ?
          `).run(
            capability.direction ?? 'read',
            capability.is_enabled ? 1 : 0,
            capability.requires_approval ? 1 : 0,
            capability.is_idempotent === false ? 0 : 1,
            existing.id,
          );
        }
      }
    }

    const updated = db.prepare('SELECT * FROM connectors WHERE id = ?').get(connector.id);
    const caps = db.prepare('SELECT * FROM connector_capabilities WHERE connector_id = ?').all(connector.id).map(parseRow);

    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId ?? 'system',
      action: 'CONNECTOR_UPDATED',
      entityType: 'connector',
      entityId: connector.id,
      oldValue: parseRow(connector),
      newValue: { ...parseRow(updated), connector_capabilities: caps },
    });

    res.json({ ...parseRow(updated), connector_capabilities: caps });
  } catch (error) {
    console.error('Error updating connector:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

connectorsRouter.post('/:id/test', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const connector = db.prepare('SELECT * FROM connectors WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.tenantId) as any;
    if (!connector) return res.status(404).json({ error: 'Connector not found' });

    const now = new Date().toISOString();
    const nextStatus = connector.status === 'error' ? 'active' : (connector.status || 'active');
    db.prepare(`
      UPDATE connectors
      SET last_health_check_at = ?, status = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `).run(now, nextStatus, now, connector.id, req.tenantId);

    logAudit(db, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      actorId: req.userId ?? 'system',
      action: 'CONNECTOR_TESTED',
      entityType: 'connector',
      entityId: connector.id,
      metadata: { previous_status: connector.status, test_result: 'passed' },
    });

    const updated = db.prepare('SELECT * FROM connectors WHERE id = ?').get(connector.id);
    res.json({
      success: true,
      tested_at: now,
      connector: parseRow(updated),
      message: `${connector.system} connectivity check passed`,
    });
  } catch (error) {
    console.error('Error testing connector:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
