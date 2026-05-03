/**
 * server/routes/agents.ts
 *
 * Agents & Connectors API — Refactored to Repository Pattern.
 * This route handles Agent Lifecycle, Versions, Test Runs, and External Connectors.
 */

import { Router } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { sendError } from '../http/errors.js';
import { enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import {
  createAgentRepository,
  createIntegrationRepository,
  createPolicyRepository,
  createKnowledgeRepository,
  createAuditRepository,
} from '../data/index.js';
import { resolveAgentKnowledgeBundle } from '../services/agentKnowledge.js';

const router = Router();
router.use(extractMultiTenant);

export const connectorsRouter = Router();
connectorsRouter.use(extractMultiTenant);

const agentRepository = createAgentRepository();
const integrationRepository = createIntegrationRepository();
const policyRepository = createPolicyRepository();
const knowledgeRepository = createKnowledgeRepository();
const auditRepository = createAuditRepository();

// ── AGENTS ───────────────────────────────────────────────────────────────────

// List Agents
router.get('/', requirePermission('agents.read'), async (req: MultiTenantRequest, res) => {
  try {
    const agents = await agentRepository.listAgents({ tenantId: req.tenantId! });
    res.json(agents);
  } catch (error) {
    console.error('Error listing agents:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list agents');
  }
});

// Create Agent
router.post('/', requirePermission('agents.write'), async (req: MultiTenantRequest, res) => {
  try {
    const { name, slug, category, description, config } = req.body;
    if (!name || !slug) return sendError(res, 400, 'INVALID_AGENT', 'Name and slug are required');

    const created = await agentRepository.createAgent({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      userId: req.userId
    }, { name, slug, category, description, config });
    
    res.status(201).json(created);
  } catch (error) {
    console.error('Error creating agent:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create agent');
  }
});

// Get Agent Detail
router.get('/:idOrSlug', requirePermission('agents.read'), async (req: MultiTenantRequest, res) => {
  try {
    const agent = await agentRepository.getAgent({ tenantId: req.tenantId! }, req.params.idOrSlug);
    if (!agent) return sendError(res, 404, 'AGENT_NOT_FOUND', 'Agent not found');
    res.json(agent);
  } catch (error) {
    console.error('Error fetching agent:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch agent');
  }
});

router.get('/:id/knowledge-access', requirePermission('agents.read'), async (req: MultiTenantRequest, res) => {
  try {
    const agent = await agentRepository.getEffectiveAgent({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, req.params.id);
    if (!agent) return sendError(res, 404, 'AGENT_NOT_FOUND', 'Agent not found');

    const caseContext = typeof req.query.caseId === 'string'
      ? await agentRepository.getCaseKnowledgeContext({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, req.query.caseId)
      : null;

    const bundle = await resolveAgentKnowledgeBundle({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      knowledgeProfile: agent.knowledge_profile ?? null,
      caseContext: caseContext ?? undefined,
    });

    res.json({
      ok: true,
      agent: {
        id: agent.id,
        slug: agent.slug,
        name: agent.name,
        version_id: agent.version_id ?? null,
      },
      caseContext,
      bundle,
    });
  } catch (error) {
    console.error('Error fetching agent knowledge access:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch agent knowledge access');
  }
});

// Update Agent
router.patch('/:id', requirePermission('agents.write'), async (req: MultiTenantRequest, res) => {
  try {
    const updated = await agentRepository.updateAgent({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      userId: req.userId
    }, req.params.id, req.body);
    if (!updated) return sendError(res, 404, 'AGENT_NOT_FOUND', 'Agent not found');
    res.json(updated);
  } catch (error) {
    console.error('Error updating agent:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update agent');
  }
});

// Create Agent Version
router.post('/:id/versions', requirePermission('agents.write'), async (req: MultiTenantRequest, res) => {
  try {
    const version = await agentRepository.createVersion({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      userId: req.userId
    }, req.params.id, req.body);
    res.status(201).json(version);
  } catch (error) {
    console.error('Error creating agent version:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create agent version');
  }
});

// Set Active Agent Version
router.post('/:id/versions/:vId/activate', requirePermission('agents.write'), async (req: MultiTenantRequest, res) => {
  try {
    await agentRepository.activateVersion({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      userId: req.userId
    }, req.params.id, req.params.vId);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error activating agent version:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to activate version');
  }
});

// ── AI STUDIO: Policy Bundle Management ─────────────────────────────────────

// GET /:id/policy-bundle-draft — current draft (or published if no draft)
router.get('/:id/policy-bundle-draft', requirePermission('agents.read'), async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const result = await agentRepository.getPolicyDraft(scope, req.params.id);
    if (!result) return sendError(res, 404, 'AGENT_NOT_FOUND', 'Agent not found');
    res.json(result);
  } catch (error) {
    console.error('Error fetching policy draft:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch policy draft');
  }
});

// PUT /:id/policy-bundle-draft — save draft (upsert)
router.put('/:id/policy-bundle-draft', requirePermission('agents.write'), async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const result = await agentRepository.updatePolicyDraft(scope, req.params.id, req.body);
    if (result && (result as any).error === 'not_found') return sendError(res, 404, 'AGENT_NOT_FOUND', 'Agent not found');
    if (result && (result as any).error === 'locked') return sendError(res, 409, 'AGENT_LOCKED', 'Agent is locked and cannot be edited');
    res.json(result);
  } catch (error) {
    console.error('Error updating policy draft:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update policy draft');
  }
});

// POST /:id/policy-bundle-publish — promote draft → published
router.post('/:id/policy-bundle-publish', requirePermission('agents.write'), async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const result = await agentRepository.publishPolicyDraft(scope, req.params.id, req.body ?? {});
    if (result && (result as any).error === 'not_found') return sendError(res, 404, 'AGENT_NOT_FOUND', 'Agent not found');
    if (result && (result as any).error === 'no_draft') return sendError(res, 404, 'NO_DRAFT', 'No draft exists for this agent');
    res.json({ ok: true, agent: result });
  } catch (error) {
    console.error('Error publishing policy draft:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to publish policy draft');
  }
});

// POST /:id/policy-bundle-rollback — roll back to previous published version
router.post('/:id/policy-bundle-rollback', requirePermission('agents.write'), async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const result = await agentRepository.rollbackPolicyDraft(scope, req.params.id, req.body ?? {});
    if (result && (result as any).error === 'not_found') return sendError(res, 404, 'AGENT_NOT_FOUND', 'Agent not found');
    if (result && (result as any).error === 'no_target') return sendError(res, 404, 'NO_ROLLBACK_TARGET', 'No previous published version to roll back to');
    res.json(result);
  } catch (error) {
    console.error('Error rolling back policy:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to roll back policy');
  }
});

// GET /:id/effective-policy — effective config + policy rule catalog + metrics
router.get('/:id/effective-policy', requirePermission('agents.read'), async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const [agent, rules, metrics, knowledge] = await Promise.all([
      agentRepository.getEffectiveAgent(scope, req.params.id),
      policyRepository.listRules(scope, undefined, true),
      policyRepository.getMetrics(scope),
      knowledgeRepository.listDomains(scope).catch(() => []),
    ]);
    if (!agent) return sendError(res, 404, 'AGENT_NOT_FOUND', 'Agent not found');
    res.json({
      agent_id: agent.id,
      agent_slug: agent.slug,
      reasoning_profile: agent.reasoning_profile ?? {},
      safety_profile: agent.safety_profile ?? {},
      permission_profile: agent.permission_profile ?? {},
      knowledge_profile: agent.knowledge_profile ?? {},
      capabilities: agent.capabilities ?? {},
      version_id: agent.version_id ?? null,
      version_number: agent.version_number ?? null,
      policy_rules: rules,
      policy_metrics: metrics,
      knowledge_domains: knowledge,
    });
  } catch (error) {
    console.error('Error fetching effective policy:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch effective policy');
  }
});

// PUT /:id/config — lightweight config update (active state + profiles)
router.put('/:id/config', requirePermission('agents.write'), async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const { isActive, permissionProfile, reasoningProfile, safetyProfile, knowledgeProfile, ...rest } = req.body ?? {};

    // Map camelCase → snake_case draft fields
    const draftPayload: Record<string, any> = { ...rest };
    if (permissionProfile !== undefined) draftPayload.permission_profile = permissionProfile;
    if (reasoningProfile !== undefined) draftPayload.reasoning_profile = reasoningProfile;
    if (safetyProfile !== undefined) draftPayload.safety_profile = safetyProfile;
    if (knowledgeProfile !== undefined) draftPayload.knowledge_profile = knowledgeProfile;

    // Upsert draft
    const draft = await agentRepository.updatePolicyDraft(scope, req.params.id, draftPayload);
    if (draft && (draft as any).error === 'not_found') return sendError(res, 404, 'AGENT_NOT_FOUND', 'Agent not found');
    if (draft && (draft as any).error === 'locked') return sendError(res, 409, 'AGENT_LOCKED', 'Agent is locked');

    // If isActive is explicitly set, update agent row directly
    if (typeof isActive === 'boolean') {
      await agentRepository.updateAgent(scope, req.params.id, { is_active: isActive });
    }

    res.json({ ok: true, draft });
  } catch (error) {
    console.error('Error updating agent config:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update agent config');
  }
});

// ── AGENT RUNS ───────────────────────────────────────────────────────────────

// Trigger Agent Run (Manual/Test)
router.post('/:id/run', requirePermission('agents.write'), async (req: MultiTenantRequest, res) => {
  try {
    const agent = await agentRepository.getAgent({ tenantId: req.tenantId! }, req.params.id);
    if (!agent) return sendError(res, 404, 'AGENT_NOT_FOUND', 'Agent not found');

    const jobId = enqueue(
      JobType.AGENT_EXECUTE,
      {
        agentId: agent.id,
        agentSlug: agent.slug,
        input: req.body.input || {},
        context: req.body.context || {},
        isTest: req.body.isTest === true,
      },
      {
        tenantId: req.tenantId!,
        workspaceId: req.workspaceId!,
        traceId: `manual-run-${agent.slug}-${Date.now()}`,
        priority: 5,
      },
    );

    res.json({ ok: true, jobId, status: 'enqueued' });
  } catch (error) {
    console.error('Error triggering agent run:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to trigger agent run');
  }
});

// Get Agent Run Status
router.get('/runs/:runId', requirePermission('agents.read'), async (req: MultiTenantRequest, res) => {
  try {
    const run = await agentRepository.getRun({ tenantId: req.tenantId! }, req.params.runId);
    if (!run) return sendError(res, 404, 'RUN_NOT_FOUND', 'Agent run not found');
    res.json(run);
  } catch (error) {
    console.error('Error fetching agent run:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch agent run');
  }
});

// ── CONNECTORS ────────────────────────────────────────────────────────────────

// List Connectors
router.get('/connectors', requirePermission('settings.read'), async (req: MultiTenantRequest, res) => {
  try {
    const connectors = await integrationRepository.listConnectors({ tenantId: req.tenantId! });
    res.json(connectors);
  } catch (error) {
    console.error('Error listing connectors:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list connectors');
  }
});

// Get Connector Detail
router.get('/connectors/:id', requirePermission('settings.read'), async (req: MultiTenantRequest, res) => {
  try {
    const connector = await integrationRepository.getConnector({ tenantId: req.tenantId! }, req.params.id);
    if (!connector) return sendError(res, 404, 'CONNECTOR_NOT_FOUND', 'Connector not found');
    res.json(connector);
  } catch (error) {
    console.error('Error fetching connector:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch connector');
  }
});

// List Connector Capabilities
router.get('/connectors/:id/capabilities', requirePermission('settings.read'), async (req: MultiTenantRequest, res) => {
  try {
    const caps = await integrationRepository.listCapabilities({ tenantId: req.tenantId! }, req.params.id);
    res.json(caps);
  } catch (error) {
    console.error('Error listing connector capabilities:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list capabilities');
  }
});

// List Connector Recent Webhooks
router.get('/connectors/:id/webhooks', requirePermission('settings.read'), async (req: MultiTenantRequest, res) => {
  try {
    const webhooks = await integrationRepository.listRecentWebhooks({ tenantId: req.tenantId! }, req.params.id);
    res.json(webhooks);
  } catch (error) {
    console.error('Error listing connector webhooks:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list webhooks');
  }
});

connectorsRouter.get('/', requirePermission('settings.read'), async (req: MultiTenantRequest, res) => {
  try {
    const connectors = await integrationRepository.listConnectors({ tenantId: req.tenantId! });
    res.json(connectors);
  } catch (error) {
    console.error('Error listing connectors:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list connectors');
  }
});

connectorsRouter.get('/:id', requirePermission('settings.read'), async (req: MultiTenantRequest, res) => {
  try {
    const connector = await integrationRepository.getConnector({ tenantId: req.tenantId! }, req.params.id);
    if (!connector) return sendError(res, 404, 'CONNECTOR_NOT_FOUND', 'Connector not found');
    res.json(connector);
  } catch (error) {
    console.error('Error fetching connector:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch connector');
  }
});

connectorsRouter.put('/:id', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  try {
    const existing = await integrationRepository.getConnector({ tenantId: req.tenantId! }, req.params.id);
    const updates: Record<string, any> = {};
    for (const key of ['name', 'status', 'auth_type', 'auth_config', 'capabilities']) {
      if (req.body?.[key] !== undefined) updates[key] = req.body[key];
    }

    await integrationRepository.updateConnector({ tenantId: req.tenantId! }, req.params.id, updates);

    await auditRepository.log({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, {
      actorId: req.userId || 'system',
      action: 'CONNECTOR_UPDATED',
      entityType: 'connector',
      entityId: req.params.id,
      oldValue: existing,
      newValue: updates,
    });

    const updated = await integrationRepository.getConnector({ tenantId: req.tenantId! }, req.params.id);
    res.json(updated);
  } catch (error) {
    console.error('Error updating connector:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update connector');
  }
});

connectorsRouter.delete('/:id', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  try {
    const existing = await integrationRepository.getConnector({ tenantId: req.tenantId! }, req.params.id);
    if (!existing) return sendError(res, 404, 'CONNECTOR_NOT_FOUND', 'Connector not found');

    await integrationRepository.deleteConnector({ tenantId: req.tenantId! }, req.params.id);

    await auditRepository.log({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, {
      actorId: req.userId || 'system',
      action: 'CONNECTOR_DELETED',
      entityType: 'connector',
      entityId: req.params.id,
      oldValue: existing,
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting connector:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to delete connector');
  }
});

connectorsRouter.post('/:id/test', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  try {
    const connector = await integrationRepository.getConnector({ tenantId: req.tenantId! }, req.params.id);
    if (!connector) return sendError(res, 404, 'CONNECTOR_NOT_FOUND', 'Connector not found');

    const now = new Date().toISOString();
    const status = connector.auth_config && Object.keys(connector.auth_config).length > 0 ? 'connected' : connector.status;
    
    await integrationRepository.updateConnector({ tenantId: req.tenantId! }, req.params.id, {
      status,
      last_health_check_at: now,
    });

    await auditRepository.log({ tenantId: req.tenantId!, workspaceId: req.workspaceId! }, {
      actorId: req.userId || 'system',
      action: 'CONNECTOR_TESTED',
      entityType: 'connector',
      entityId: req.params.id,
      metadata: { status, checkedAt: now },
    });

    res.json({
      ok: true,
      connectorId: req.params.id,
      status,
      checkedAt: now,
      message: status === 'connected' ? 'Connector health check passed' : 'Connector reachable but credentials are incomplete',
    });
  } catch (error) {
    console.error('Error testing connector:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to test connector');
  }
});

connectorsRouter.get('/:id/capabilities', requirePermission('settings.read'), async (req: MultiTenantRequest, res) => {
  try {
    const caps = await integrationRepository.listCapabilities({ tenantId: req.tenantId! }, req.params.id);
    res.json(caps);
  } catch (error) {
    console.error('Error listing connector capabilities:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list capabilities');
  }
});

connectorsRouter.get('/:id/webhooks', requirePermission('settings.read'), async (req: MultiTenantRequest, res) => {
  try {
    const webhooks = await integrationRepository.listRecentWebhooks({ tenantId: req.tenantId! }, req.params.id);
    res.json(webhooks);
  } catch (error) {
    console.error('Error listing connector webhooks:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list webhooks');
  }
});

export default router;
