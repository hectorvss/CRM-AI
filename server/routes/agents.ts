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
import { config } from '../config.js';
import { integrationRegistry } from '../integrations/registry.js';
import { createAgentRepository, createAgentRunRepository, createIntegrationRepository } from '../data/index.js';

const router = Router();
router.use(extractMultiTenant);

export const connectorsRouter = Router();
connectorsRouter.use(extractMultiTenant);

const agentRepository = createAgentRepository();
const agentRunRepository = createAgentRunRepository();
const integrationRepository = createIntegrationRepository();

function normalizePolicyResult(result: any, res: any) {
  if (!result?.error) {
    res.json(result);
    return;
  }

  const status = result.error === 'not_found'
    ? 404
    : result.error === 'locked'
      ? 423
      : 400;
  sendError(res, status, String(result.error).toUpperCase(), result.error);
}

function missingConnectorConfig(system: string): string[] {
  if (system === 'shopify') {
    return [
      !config.shopify?.shopDomain ? 'SHOPIFY_SHOP_DOMAIN' : null,
      !config.shopify?.adminApiToken ? 'SHOPIFY_ADMIN_API_TOKEN' : null,
      !config.shopify?.webhookSecret ? 'SHOPIFY_WEBHOOK_SECRET' : null,
    ].filter(Boolean) as string[];
  }
  if (system === 'stripe') {
    return [
      !config.stripe?.secretKey ? 'STRIPE_SECRET_KEY' : null,
      !config.stripe?.webhookSecret ? 'STRIPE_WEBHOOK_SECRET' : null,
    ].filter(Boolean) as string[];
  }
  return integrationRegistry.has(system as any) ? [] : ['runtime_adapter_not_registered'];
}

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

router.get('/:id/policy-bundle-draft', requirePermission('agents.read'), async (req: MultiTenantRequest, res) => {
  try {
    const result = await agentRepository.getPolicyDraft({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      userId: req.userId,
    }, req.params.id);
    if (!result) return sendError(res, 404, 'AGENT_NOT_FOUND', 'Agent not found');
    res.json(result);
  } catch (error) {
    console.error('Error fetching policy draft:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch policy draft');
  }
});

router.put('/:id/policy-bundle-draft', requirePermission('agents.write'), async (req: MultiTenantRequest, res) => {
  try {
    const result = await agentRepository.updatePolicyDraft({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      userId: req.userId,
    }, req.params.id, req.body ?? {});
    normalizePolicyResult(result, res);
  } catch (error) {
    console.error('Error updating policy draft:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update policy draft');
  }
});

router.post('/:id/policy-bundle-publish', requirePermission('agents.write'), async (req: MultiTenantRequest, res) => {
  try {
    const result = await agentRepository.publishPolicyDraft({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      userId: req.userId,
    }, req.params.id, req.body ?? {});
    normalizePolicyResult(result, res);
  } catch (error) {
    console.error('Error publishing policy draft:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to publish policy draft');
  }
});

router.post('/:id/policy-bundle-rollback', requirePermission('agents.write'), async (req: MultiTenantRequest, res) => {
  try {
    const body = typeof req.body === 'string' ? { versionId: req.body } : req.body ?? {};
    const result = await agentRepository.rollbackPolicyDraft({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      userId: req.userId,
    }, req.params.id, body);
    normalizePolicyResult(result, res);
  } catch (error) {
    console.error('Error rolling back policy:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to roll back policy');
  }
});

router.get('/:id/effective-policy', requirePermission('agents.read'), async (req: MultiTenantRequest, res) => {
  try {
    const result = await agentRepository.getEffectiveAgent({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      userId: req.userId,
    }, req.params.id);
    if (!result) return sendError(res, 404, 'AGENT_NOT_FOUND', 'Agent not found');
    res.json(result);
  } catch (error) {
    console.error('Error fetching effective policy:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch effective policy');
  }
});

router.get('/:id/knowledge-access', requirePermission('agents.read'), async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const [agent, caseContext, connectorCapabilities] = await Promise.all([
      agentRepository.getEffectiveAgent(scope, req.params.id),
      typeof req.query.caseId === 'string'
        ? agentRepository.getCaseKnowledgeContext(scope, req.query.caseId)
        : Promise.resolve(null),
      agentRepository.listConnectorCapabilities(scope),
    ]);
    if (!agent) return sendError(res, 404, 'AGENT_NOT_FOUND', 'Agent not found');
    res.json({
      agent_id: agent.id,
      slug: agent.slug,
      knowledge_profile: agent.knowledge_profile || {},
      case_context: caseContext,
      connector_capabilities: connectorCapabilities,
    });
  } catch (error) {
    console.error('Error fetching knowledge access:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch knowledge access');
  }
});

router.put('/:id/config', requirePermission('agents.write'), async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const draft = await agentRepository.updatePolicyDraft(scope, req.params.id, {
      permission_profile: req.body?.permissionProfile ?? req.body?.permission_profile,
      reasoning_profile: req.body?.reasoningProfile ?? req.body?.reasoning_profile,
      safety_profile: req.body?.safetyProfile ?? req.body?.safety_profile,
      knowledge_profile: req.body?.knowledgeProfile ?? req.body?.knowledge_profile,
      rolloutPercentage: req.body?.rolloutPercentage,
    });
    if (draft?.error) return normalizePolicyResult(draft, res);
    const published = await agentRepository.publishPolicyDraft(scope, req.params.id, {
      isActive: req.body?.isActive,
    });
    normalizePolicyResult(published, res);
  } catch (error) {
    console.error('Error updating agent config:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update agent config');
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

    const jobId = await enqueue(
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

router.post('/trigger', requirePermission('agents.write'), async (req: MultiTenantRequest, res) => {
  try {
    const { caseId, triggerEvent = 'case_created', agentSlug, context = {} } = req.body ?? {};
    if (!caseId) return sendError(res, 400, 'INVALID_TRIGGER', 'caseId is required');
    const jobId = await enqueue(
      JobType.AGENT_TRIGGER,
      { caseId, triggerEvent, agentSlug, context },
      {
        tenantId: req.tenantId!,
        workspaceId: req.workspaceId!,
        traceId: `agent-trigger-${caseId}-${Date.now()}`,
        priority: 5,
      },
    );
    res.json({ ok: true, jobId, status: 'enqueued' });
  } catch (error) {
    console.error('Error triggering agent chain:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to trigger agent chain');
  }
});

router.get('/:id/runs', requirePermission('agents.read'), async (req: MultiTenantRequest, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 20) || 20, 100);
    const rows = await agentRunRepository.list({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
    }, req.params.id, limit);
    res.json(rows);
  } catch (error) {
    console.error('Error listing agent runs:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list agent runs');
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

connectorsRouter.put('/:id', requirePermission('settings.write'), async (req: MultiTenantRequest, res) => {
  try {
    const connector = await integrationRepository.updateConnector({ tenantId: req.tenantId! }, req.params.id, req.body ?? {});
    if (!connector) return sendError(res, 404, 'CONNECTOR_NOT_FOUND', 'Connector not found');
    res.json(connector);
  } catch (error) {
    console.error('Error updating connector:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update connector');
  }
});

connectorsRouter.post('/:id/test', requirePermission('settings.read'), async (req: MultiTenantRequest, res) => {
  try {
    const connector = await integrationRepository.getConnector({ tenantId: req.tenantId! }, req.params.id);
    if (!connector) return sendError(res, 404, 'CONNECTOR_NOT_FOUND', 'Connector not found');
    const system = connector.system || connector.name;
    const adapter = integrationRegistry.get(system as any);
    const missingConfig = missingConnectorConfig(system);
    let health: 'ok' | 'error' | 'not_configured' = missingConfig.length ? 'not_configured' : 'ok';
    if (adapter && !missingConfig.length) {
      try {
        await adapter.ping();
        health = 'ok';
      } catch {
        health = 'error';
      }
    }
    res.json({
      ok: health === 'ok',
      connectorId: connector.id,
      system,
      dbStatus: connector.status,
      runtimeRegistered: Boolean(adapter),
      configured: missingConfig.length === 0,
      health,
      missingConfig,
    });
  } catch (error) {
    console.error('Error testing connector:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to test connector');
  }
});

export default router;
