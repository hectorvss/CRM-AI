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
import { createAgentRepository, createIntegrationRepository } from '../data/index.js';
import { resolveAgentKnowledgeBundleAsync } from '../services/agentKnowledge.js';

const router = Router();
router.use(extractMultiTenant);

export const connectorsRouter = Router();
connectorsRouter.use(extractMultiTenant);

const agentRepository = createAgentRepository();
const integrationRepository = createIntegrationRepository();

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

    const bundle = await resolveAgentKnowledgeBundleAsync({
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
