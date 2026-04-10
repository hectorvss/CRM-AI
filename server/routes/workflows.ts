import { Router } from 'express';
import { randomUUID } from 'crypto';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { createWorkflowRepository } from '../data/workflows.js';
import { createAuditRepository } from '../data/audit.js';
import { sendError } from '../http/errors.js';

const router = Router();
router.use(extractMultiTenant);

// GET /api/workflows
router.get('/', async (req: MultiTenantRequest, res) => {
  try {
    const workflowRepo = createWorkflowRepository();
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    
    const workflows = await workflowRepo.listDefinitions(tenantId, workspaceId);

    const enriched = await Promise.all(workflows.map(async (wf) => {
      const metrics = await workflowRepo.getMetrics(wf.id, tenantId);
      const health_status =
        metrics.failed > 0 ? 'warning'
        : wf.version_status === 'draft' ? 'needs_setup'
        : 'active';

      return {
        ...wf,
        metrics,
        health_status,
        health_message: health_status === 'warning' ? 'Recent workflow failures detected' : undefined,
        last_run_at: metrics.last_run_at,
      };
    }));

    res.json(enriched);
  } catch (error) {
    console.error('Error listing workflows:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list workflows');
  }
});

// POST /api/workflows
router.post('/', async (req: MultiTenantRequest, res) => {
  try {
    const workflowRepo = createWorkflowRepository();
    const auditRepo = createAuditRepository();
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const workflowId = randomUUID();
    const versionId = randomUUID();
    
    const {
      name = 'New workflow draft',
      description = 'Draft workflow created from template',
      nodes = [],
      edges = [],
      trigger = { type: 'manual' },
    } = req.body ?? {};

    await workflowRepo.createDefinition({
      id: workflowId,
      tenantId,
      workspaceId,
      name,
      description,
      currentVersionId: versionId,
      createdBy: req.userId ?? 'system',
    });

    await workflowRepo.createVersion({
      id: versionId,
      workflowId,
      versionNumber: 1,
      status: 'draft',
      nodes,
      edges,
      trigger,
      tenantId,
    });

    const workflow = await workflowRepo.getDefinition(workflowId, tenantId, workspaceId);
    const version = await workflowRepo.getVersion(versionId);
    const metrics = await workflowRepo.getMetrics(workflowId, tenantId);

    await auditRepo.logEvent({ tenantId, workspaceId }, {
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_CREATED',
      entityType: 'workflow',
      entityId: workflowId,
      newValue: { workflow, version },
    });

    res.status(201).json({
      ...workflow,
      current_version: version,
      metrics,
    });
  } catch (error) {
    console.error('Error creating workflow:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create workflow');
  }
});

// GET /api/workflows/runs/recent
router.get('/runs/recent', async (req: MultiTenantRequest, res) => {
  try {
    const workflowRepo = createWorkflowRepository();
    const runs = await workflowRepo.listRecentRuns(req.tenantId!);
    res.json(runs);
  } catch (error) {
    console.error('Error fetching recent runs:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch recent runs');
  }
});

// GET /api/workflows/:id
router.get('/:id', async (req: MultiTenantRequest, res) => {
  try {
    const workflowRepo = createWorkflowRepository();
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    
    const wf = await workflowRepo.getDefinition(req.params.id, tenantId, workspaceId);
    if (!wf) return sendError(res, 404, 'WORKFLOW_NOT_FOUND', 'Workflow not found');

    const versions = await workflowRepo.listVersions(wf.id);
    const runs = await workflowRepo.listRunsByWorkflow(wf.id, tenantId);
    const currentVersion = wf.current_version_id 
      ? await workflowRepo.getVersion(wf.current_version_id)
      : await workflowRepo.getLatestVersion(wf.id);
    const metrics = await workflowRepo.getMetrics(wf.id, tenantId);

    res.json({
      ...wf,
      current_version: currentVersion,
      versions,
      recent_runs: runs,
      metrics,
    });
  } catch (error) {
    console.error('Error fetching workflow:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to fetch workflow');
  }
});

// PUT /api/workflows/:id
router.put('/:id', async (req: MultiTenantRequest, res) => {
  try {
    const workflowRepo = createWorkflowRepository();
    const auditRepo = createAuditRepository();
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    
    const wf = await workflowRepo.getDefinition(req.params.id, tenantId, workspaceId);
    if (!wf) return sendError(res, 404, 'WORKFLOW_NOT_FOUND', 'Workflow not found');

    const currentVersion = wf.current_version_id 
      ? await workflowRepo.getVersion(wf.current_version_id)
      : await workflowRepo.getLatestVersion(wf.id);
    
    const nextVersionNumber = currentVersion ? Number(currentVersion.version_number || 0) + 1 : 1;
    const isCurrentlyDraft = currentVersion?.status === 'draft';
    const draftId = isCurrentlyDraft ? currentVersion.id : randomUUID();

    const updates = {
      name: req.body.name ?? wf.name,
      description: req.body.description ?? wf.description,
    };

    const versionUpdates = {
      nodes: req.body.nodes ?? currentVersion?.nodes ?? [],
      edges: req.body.edges ?? currentVersion?.edges ?? [],
      trigger: req.body.trigger ?? currentVersion?.trigger ?? {},
      status: 'draft',
    };

    await workflowRepo.updateDefinition(wf.id, tenantId, workspaceId, updates);

    if (isCurrentlyDraft) {
      await workflowRepo.updateVersion(draftId, versionUpdates);
    } else {
      await workflowRepo.createVersion({
        id: draftId,
        workflowId: wf.id,
        versionNumber: nextVersionNumber,
        status: 'draft',
        nodes: versionUpdates.nodes,
        edges: versionUpdates.edges,
        trigger: versionUpdates.trigger,
        tenantId,
      });
    }

    const updatedWorkflow = await workflowRepo.getDefinition(wf.id, tenantId, workspaceId);
    const draftVersion = await workflowRepo.getVersion(draftId);
    const metrics = await workflowRepo.getMetrics(wf.id, tenantId);

    await auditRepo.logEvent({ tenantId, workspaceId }, {
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_DRAFT_UPDATED',
      entityType: 'workflow',
      entityId: wf.id,
      oldValue: { workflow: wf, version: currentVersion },
      newValue: { workflow: updatedWorkflow, version: draftVersion },
    });

    res.json({
      ...updatedWorkflow,
      current_version: draftVersion,
      metrics,
    });
  } catch (error) {
    console.error('Error updating workflow:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update workflow');
  }
});

// POST /api/workflows/:id/publish
router.post('/:id/publish', async (req: MultiTenantRequest, res) => {
  try {
    const workflowRepo = createWorkflowRepository();
    const auditRepo = createAuditRepository();
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    
    const wf = await workflowRepo.getDefinition(req.params.id, tenantId, workspaceId);
    if (!wf) return sendError(res, 404, 'WORKFLOW_NOT_FOUND', 'Workflow not found');

    // Get the latest draft version
    const versions = await workflowRepo.listVersions(wf.id);
    const draftVersion = versions.find(v => v.status === 'draft');

    if (!draftVersion) {
      return sendError(res, 400, 'NO_DRAFT_VERSION', 'No draft version available to publish');
    }

    const now = new Date().toISOString();
    
    // Archive current published version if exists
    if (wf.current_version_id && wf.current_version_id !== draftVersion.id) {
      await workflowRepo.updateVersion(wf.current_version_id, { status: 'archived' });
    }

    // Publish draft
    await workflowRepo.updateVersion(draftVersion.id, {
      status: 'published',
      publishedBy: req.userId ?? 'system',
      publishedAt: now,
    });

    // Update definition to point to new version
    await workflowRepo.updateDefinition(wf.id, tenantId, workspaceId, {
      currentVersionId: draftVersion.id,
    });

    const updatedWorkflow = await workflowRepo.getDefinition(wf.id, tenantId, workspaceId);
    const publishedVersion = await workflowRepo.getVersion(draftVersion.id);
    const metrics = await workflowRepo.getMetrics(wf.id, tenantId);

    await auditRepo.logEvent({ tenantId, workspaceId }, {
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_PUBLISHED',
      entityType: 'workflow',
      entityId: wf.id,
      newValue: { workflow: updatedWorkflow, version: publishedVersion },
    });

    res.json({
      ...updatedWorkflow,
      current_version: publishedVersion,
      metrics,
    });
  } catch (error) {
    console.error('Error publishing workflow:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Failed to publish workflow');
  }
});

export default router;
