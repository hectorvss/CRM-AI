import { Router, Response } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { runAgent } from '../agents/runner.js';
import { triggerAgents } from '../agents/orchestrator.js';
import { hasAgentImpl, getImplementationMode } from '../agents/registry.js';
import { getCatalogEntryBySlug } from '../agents/catalog.js';
import { resolveAgentKnowledgeBundle } from '../services/agentKnowledge.js';
import { createAgentRepository, createIntegrationRepository, createAuditRepository } from '../data/index.js';
import { sendError } from '../http/errors.js';

const router = Router();
const agentRepo = createAgentRepository();
const integrationRepo = createIntegrationRepository();
const auditRepo = createAuditRepository();

router.use(extractMultiTenant);

function buildEffectivePolicy(agent: any, connectorCapabilities: any[]) {
  const globalSafety = {
    enforcement: 'restrictive_wins',
    workspace_lock: agent.is_locked ? 'locked' : 'editable',
  };

  return {
    agent_id: agent.id,
    agent_name: agent.name,
    is_active: Boolean(agent.is_active),
    version_id: agent.version_id,
    version_status: agent.version_status,
    global_safety: globalSafety,
    permission_profile: agent.permission_profile ?? {},
    reasoning_profile: agent.reasoning_profile ?? {},
    safety_profile: agent.safety_profile ?? {},
    knowledge_profile: agent.knowledge_profile ?? {},
    connector_capabilities: connectorCapabilities,
    rollout_policy: {
      rollout_percentage: agent.rollout_percentage ?? 100,
      published_at: agent.published_at ?? null,
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

// GET /api/agents
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const agents = await agentRepo.list(scope);
    res.json(agents);
  } catch (error) {
    console.error('Error fetching agents:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get('/:id/policy-bundle-draft', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const draft = await agentRepo.getPolicyDraft(scope, req.params.id);
    if (!draft) return res.status(404).json({ error: 'Agent not found' });
    res.json(draft);
  } catch (error) {
    console.error('Error fetching policy bundle draft:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.put('/:id/policy-bundle-draft', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const result = await agentRepo.updatePolicyDraft(scope, req.params.id, req.body);
    
    if (result.error === 'not_found') return res.status(404).json({ error: 'Agent not found' });
    if (result.error === 'locked') return res.status(403).json({ error: 'Agent is locked' });

    res.json(result);
  } catch (error) {
    console.error('Error updating policy bundle draft:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.post('/:id/policy-bundle-publish', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const publishedAgent = await agentRepo.publishPolicyDraft(scope, req.params.id, req.body);
    
    if (publishedAgent.error === 'not_found') return res.status(404).json({ error: 'Agent not found' });
    if (publishedAgent.error === 'no_draft') return res.status(400).json({ error: 'No draft to publish' });

    const connectorCapabilities = await agentRepo.listConnectorCapabilities(scope);
    res.json(buildEffectivePolicy(publishedAgent, connectorCapabilities));
  } catch (error) {
    console.error('Error publishing agent policy bundle:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.post('/:id/policy-bundle-rollback', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const result = await agentRepo.rollbackPolicyDraft(scope, req.params.id, req.body);
    
    if (result.error === 'not_found') return res.status(404).json({ error: 'Agent not found' });
    if (result.error === 'no_target') return res.status(400).json({ error: 'No version to rollback to' });

    res.json(result);
  } catch (error) {
    console.error('Error rolling back agent policy bundle:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get(/^\/([^/]+)\/policy-bundle:draft$/, async (req: MultiTenantRequest, res: Response) => {
  try {
    const agentId = (req.params as any)[0] ?? req.params.id;
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const draft = await agentRepo.getPolicyDraft(scope, agentId);
    if (!draft) return res.status(404).json({ error: 'Agent not found' });
    res.json(draft);
  } catch (error) {
    console.error('Error fetching legacy policy bundle draft:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.put(/^\/([^/]+)\/policy-bundle:draft$/, async (req: MultiTenantRequest, res: Response) => {
  try {
    const agentId = (req.params as any)[0] ?? req.params.id;
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const result = await agentRepo.updatePolicyDraft(scope, agentId, req.body);

    if (result.error === 'not_found') return res.status(404).json({ error: 'Agent not found' });
    if (result.error === 'locked') return res.status(403).json({ error: 'Agent is locked' });

    res.json(result);
  } catch (error) {
    console.error('Error updating legacy policy bundle draft:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.post(/^\/([^/]+)\/policy-bundle:publish$/, async (req: MultiTenantRequest, res: Response) => {
  try {
    const agentId = (req.params as any)[0] ?? req.params.id;
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const publishedAgent = await agentRepo.publishPolicyDraft(scope, agentId, req.body);

    if (publishedAgent.error === 'not_found') return res.status(404).json({ error: 'Agent not found' });
    if (publishedAgent.error === 'no_draft') return res.status(400).json({ error: 'No draft to publish' });

    const connectorCapabilities = await agentRepo.listConnectorCapabilities(scope);
    res.json(buildEffectivePolicy(publishedAgent, connectorCapabilities));
  } catch (error) {
    console.error('Error publishing legacy agent policy bundle:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.post(/^\/([^/]+)\/policy-bundle:rollback$/, async (req: MultiTenantRequest, res: Response) => {
  try {
    const agentId = (req.params as any)[0] ?? req.params.id;
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    const result = await agentRepo.rollbackPolicyDraft(scope, agentId, req.body);

    if (result.error === 'not_found') return res.status(404).json({ error: 'Agent not found' });
    if (result.error === 'no_target') return res.status(400).json({ error: 'No version to rollback to' });

    res.json(result);
  } catch (error) {
    console.error('Error rolling back legacy agent policy bundle:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get('/:id/effective-policy', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const agent = await agentRepo.getEffectiveAgent(scope, req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const connectorCapabilities = await agentRepo.listConnectorCapabilities(scope);
    res.json(buildEffectivePolicy(agent, connectorCapabilities));
  } catch (error) {
    console.error('Error fetching effective policy:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get('/:id/knowledge-access', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const agent = await agentRepo.getEffectiveAgent(scope, req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const caseId = String(req.query.caseId ?? '');
    const caseContext = caseId ? await agentRepo.getCaseKnowledgeContext(scope, caseId) : undefined;

    const bundle = await resolveAgentKnowledgeBundle({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      knowledgeProfile: agent.knowledge_profile ?? {},
      caseContext,
    });

    res.json({
      agent_id: agent.id,
      case_id: caseId || null,
      knowledge_profile: bundle.profile,
      accessible_documents: bundle.accessibleDocuments,
      blocked_documents: bundle.blockedDocuments,
      citations: bundle.citations,
      prompt_context: bundle.promptContext,
    });
  } catch (error) {
    console.error('Error fetching agent knowledge access:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// GET /api/agents/:id
router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const detail = await agentRepo.getDetail(scope, req.params.id);
    if (!detail) return res.status(404).json({ error: 'Agent not found' });
    res.json(detail);
  } catch (error) {
    console.error('Error fetching agent detail:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// POST /api/agents/:id/run — manually trigger an agent for a case
router.post('/:id/run', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const detail = await agentRepo.getDetail(scope, req.params.id);
    if (!detail) return res.status(404).json({ error: 'Agent not found' });

    const { caseId, triggerEvent = 'case_created', context = {} } = req.body;
    if (!caseId) return res.status(400).json({ error: 'caseId is required' });

    const result = await runAgent({
      agentSlug: detail.slug,
      caseId,
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      triggerEvent,
      extraContext: context,
    });

    res.json({ success: result.success, result });
  } catch (error) {
    console.error('Error running agent:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// POST /api/agents/trigger — fire a full agent chain for a trigger event
router.post('/trigger', async (req: MultiTenantRequest, res: Response) => {
  try {
    const { caseId, triggerEvent, agentSlug, context = {} } = req.body;

    if (!caseId)       return res.status(400).json({ error: 'caseId is required' });
    if (!triggerEvent) return res.status(400).json({ error: 'triggerEvent is required' });

    const validEvents = ['case_created', 'message_received', 'conflicts_detected', 'case_resolved', 'approval_requested'];
    if (!validEvents.includes(triggerEvent)) {
      return res.status(400).json({ error: `triggerEvent must be one of: ${validEvents.join(', ')}` });
    }

    if (agentSlug) {
      const result = await runAgent({
        agentSlug,
        caseId,
        tenantId: req.tenantId!,
        workspaceId: req.workspaceId!,
        triggerEvent,
        extraContext: context,
      });
      return res.json({ mode: 'direct', result });
    }

    await triggerAgents(triggerEvent, caseId, {
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!,
      context,
    });

    res.json({ mode: 'queued', message: `Agent chain for "${triggerEvent}" enqueued for case ${caseId}` });
  } catch (error) {
    console.error('Error triggering agents:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// PUT /api/agents/:id/config — update agent version profiles
router.put('/:id/config', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId!, userId: req.userId };
    // This is a simplified version of the update logic, usually handled via draft/publish
    // but kept for legacy compat if needed.
    const result = await agentRepo.updatePolicyDraft(scope, req.params.id, req.body);
    if (result.error) return res.status(404).json({ error: 'Agent not found' });
    
    const published = await agentRepo.publishPolicyDraft(scope, req.params.id, { isActive: req.body.isActive });
    res.json(published);
  } catch (error) {
    console.error('Error updating agent config:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// GET /api/agents/:id/runs — recent runs for an agent
router.get('/:id/runs', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const detail = await agentRepo.getDetail(scope, req.params.id);
    if (!detail) return res.status(404).json({ error: 'Agent not found' });
    res.json(detail.recent_runs);
  } catch (error) {
    console.error('Error fetching agent runs:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

// ── Connectors Router ──────────────────────────────────────────
export const connectorsRouter = Router();
connectorsRouter.use(extractMultiTenant);

connectorsRouter.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId! };
    const connectors = await integrationRepo.listConnectors(scope);
    res.json(connectors);
  } catch (error) {
    console.error('Error fetching connectors:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

connectorsRouter.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId! };
    const connector = await integrationRepo.getConnector(scope, req.params.id);
    if (!connector) return res.status(404).json({ error: 'Connector not found' });
    
    const capabilities = await integrationRepo.listCapabilities(scope, req.params.id);
    const recentWebhooks = await integrationRepo.listRecentWebhooks(scope, req.params.id);
    
    res.json({ ...connector, capabilities, recent_webhooks: recentWebhooks });
  } catch (error) {
    console.error('Error fetching connector detail:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

connectorsRouter.put('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId! };
    const existing = await integrationRepo.getConnector(scope, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Connector not found' });

    const updated = await integrationRepo.updateConnector(scope, req.params.id, {
      name: req.body?.name,
      status: req.body?.status,
      auth_config: req.body?.auth_config,
      last_health_check_at: req.body?.last_health_check_at,
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating connector:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

connectorsRouter.post('/:id/test', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId! };
    const result = await integrationRepo.testConnector(scope, req.params.id);
    if (!result) return res.status(404).json({ error: 'Connector not found' });
    res.json(result);
  } catch (error) {
    console.error('Error testing connector:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;
