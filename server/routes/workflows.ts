import { Router } from 'express';
import crypto from 'crypto';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { createWorkflowRepository, createAuditRepository } from '../data/index.js';

const router = Router();
const workflowRepository = createWorkflowRepository();
const auditRepository = createAuditRepository();

router.use(extractMultiTenant);

router.get('/', async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wfs = await workflowRepository.listDefinitions(tenantId, workspaceId);

    const enriched = await Promise.all(wfs.map(async (workflow: any) => {
      const metrics = await workflowRepository.getMetrics(workflow.id, tenantId);
      const health_status =
        metrics.failed > 0 ? 'warning'
        : workflow.version_status === 'draft' ? 'needs_setup'
        : 'active';

      return {
        ...workflow,
        metrics,
        health_status,
        health_message: health_status === 'warning' ? 'Recent workflow failures detected' : undefined,
        last_run_at: metrics.last_run_at,
      };
    }));

    res.json(enriched);
  } catch (error) {
    console.error('Error fetching workflows:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const workflowId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const {
      name = 'New workflow draft',
      description = 'Draft workflow created from template',
      nodes = [],
      edges = [],
      trigger = { type: 'manual' },
    } = req.body ?? {};

    await workflowRepository.createDefinition({
      id: workflowId,
      tenantId,
      workspaceId,
      name,
      description,
      currentVersionId: versionId,
      createdBy: req.userId ?? 'system',
    });

    await workflowRepository.createVersion({
      id: versionId,
      workflowId,
      versionNumber: 1,
      status: 'draft',
      nodes,
      edges,
      trigger,
      tenantId,
    });

    const workflow = await workflowRepository.getDefinition(workflowId, tenantId, workspaceId);
    const version = await workflowRepository.getVersion(versionId);

    await auditRepository.logEvent({ tenantId, workspaceId }, {
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_CREATED',
      entityType: 'workflow',
      entityId: workflowId,
      newValue: { workflow, version },
    });

    res.status(201).json({
      ...workflow,
      current_version: version,
      metrics: await workflowRepository.getMetrics(workflowId, tenantId),
    });
  } catch (error) {
    console.error('Error creating workflow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/runs/recent', async (req: MultiTenantRequest, res) => {
  try {
    const runs = await workflowRepository.listRecentRuns(req.tenantId!);
    res.json(runs);
  } catch (error) {
    console.error('Error fetching recent runs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wf = await workflowRepository.getDefinition(req.params.id, tenantId, workspaceId);
    if (!wf) return res.status(404).json({ error: 'Not found' });

    const versions = await workflowRepository.listVersions(wf.id);
    const runs = await workflowRepository.listRunsByWorkflow(wf.id, tenantId);
    const currentVersion = await (wf.current_version_id 
      ? workflowRepository.getVersion(wf.current_version_id) 
      : workflowRepository.getLatestVersion(wf.id));

    res.json({
      ...wf,
      current_version: currentVersion,
      versions,
      recent_runs: runs,
      metrics: await workflowRepository.getMetrics(wf.id, tenantId),
    });
  } catch (error) {
    console.error('Error fetching workflow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wf = await workflowRepository.getDefinition(req.params.id, tenantId, workspaceId);
    if (!wf) return res.status(404).json({ error: 'Not found' });

    const currentVersion = await (wf.current_version_id 
      ? workflowRepository.getVersion(wf.current_version_id) 
      : workflowRepository.getLatestVersion(wf.id));

    const nextVersionNumber = currentVersion ? Number(currentVersion.version_number || 0) + 1 : 1;
    const draftId = currentVersion?.status === 'draft' ? currentVersion.id : crypto.randomUUID();
    
    const updates = {
      nodes: req.body.nodes ?? currentVersion?.nodes ?? [],
      edges: req.body.edges ?? currentVersion?.edges ?? [],
      trigger: req.body.trigger ?? currentVersion?.trigger ?? {},
    };

    await workflowRepository.updateDefinition(wf.id, tenantId, workspaceId, {
      name: req.body.name ?? wf.name,
      description: req.body.description ?? wf.description,
    });

    if (currentVersion?.status === 'draft') {
      await workflowRepository.updateVersion(draftId, updates);
    } else {
      await workflowRepository.createVersion({
        id: draftId,
        workflowId: wf.id,
        versionNumber: nextVersionNumber,
        status: 'draft',
        ...updates,
        tenantId,
      });
    }

    const draftVersion = await workflowRepository.getVersion(draftId);

    await auditRepository.logEvent({ tenantId, workspaceId }, {
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_DRAFT_UPDATED',
      entityType: 'workflow',
      entityId: wf.id,
      oldValue: { workflow: wf, version: currentVersion },
      newValue: { workflow: { ...wf, ...req.body }, version: draftVersion },
    });

    res.json({
      ...wf,
      name: req.body.name ?? wf.name,
      description: req.body.description ?? wf.description,
      current_version: draftVersion,
      metrics: await workflowRepository.getMetrics(wf.id, tenantId),
    });
  } catch (error) {
    console.error('Error updating workflow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/publish', async (req: MultiTenantRequest, res) => {
  try {
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const wf = await workflowRepository.getDefinition(req.params.id, tenantId, workspaceId);
    if (!wf) return res.status(404).json({ error: 'Not found' });

    const versions = await workflowRepository.listVersions(wf.id);
    const draftVersion = versions.find(v => v.status === 'draft');

    if (!draftVersion) {
      return res.status(400).json({ error: 'No draft version available to publish' });
    }

    const now = new Date().toISOString();
    if (wf.current_version_id && wf.current_version_id !== draftVersion.id) {
      await workflowRepository.updateVersion(wf.current_version_id, { status: 'archived' });
    }

    await workflowRepository.updateVersion(draftVersion.id, {
      status: 'published',
      publishedBy: req.userId ?? 'system',
      publishedAt: now,
    });

    await workflowRepository.updateDefinition(wf.id, tenantId, workspaceId, {
      currentVersionId: draftVersion.id,
    });

    const updated = await workflowRepository.getDefinition(wf.id, tenantId, workspaceId);
    const version = await workflowRepository.getVersion(draftVersion.id);

    await auditRepository.logEvent({ tenantId, workspaceId }, {
      actorId: req.userId ?? 'system',
      action: 'WORKFLOW_PUBLISHED',
      entityType: 'workflow',
      entityId: wf.id,
      newValue: { workflow: updated, version },
    });

    res.json({
      ...updated,
      current_version: version,
      metrics: await workflowRepository.getMetrics(wf.id, tenantId),
    });
  } catch (error) {
    console.error('Error publishing workflow:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
