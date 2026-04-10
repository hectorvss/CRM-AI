import { Router } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { sendError } from '../http/errors.js';
import { retryDeadJob, enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import { createOperationsRepository } from '../data/index.js';

const router = Router();
const operationsRepo = createOperationsRepository();

router.use(extractMultiTenant);

router.get('/overview', async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const overview = await operationsRepo.getOverview(scope);
    res.json(overview);
  } catch (error) {
    console.error('Operations overview error:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get('/jobs', async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const jobs = await operationsRepo.listJobs(scope);
    res.json(jobs);
  } catch (error) {
    console.error('Operations jobs error:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get('/jobs/dead-letter', async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const jobs = await operationsRepo.listDeadLetterJobs(scope);
    res.json(jobs);
  } catch (error) {
    console.error('Operations dead-letter jobs error:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.post('/jobs/:id/retry', async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const job = await operationsRepo.getJob(scope, req.params.id);

    if (!job || job.tenant_id !== req.tenantId || (job.workspace_id && job.workspace_id !== req.workspaceId)) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const ok = await retryDeadJob(req.params.id);
    if (!ok) {
      res.status(400).json({ error: 'Only dead jobs can be retried' });
      return;
    }

    res.json({ ok: true, jobId: req.params.id, status: 'pending' });
  } catch (error) {
    console.error('Operations retry job error:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get('/webhooks', async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const rows = await operationsRepo.listWebhooks(scope);
    res.json(rows);
  } catch (error) {
    console.error('Operations webhooks error:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.post('/webhooks/:id/replay', async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const row = await operationsRepo.getWebhook(scope, req.params.id);

    if (!row) {
      res.status(404).json({ error: 'Webhook event not found' });
      return;
    }

    const traceId = row.canonical_event_id || row.id;
    const jobId = await enqueue(
      JobType.WEBHOOK_PROCESS,
      {
        webhookEventId: row.id,
        source: row.source_system,
        rawBody: row.raw_payload || '{}',
        headers: {},
      },
      {
        tenantId: req.tenantId!,
        workspaceId: req.workspaceId!,
        traceId,
        priority: 3,
      },
    );

    await operationsRepo.updateWebhookStatus(scope, row.id, 'received');

    res.json({ ok: true, webhookEventId: row.id, jobId });
  } catch (error) {
    console.error('Operations replay webhook error:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get('/canonical-events', async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const rows = await operationsRepo.listCanonicalEvents(scope);
    res.json(rows);
  } catch (error) {
    console.error('Operations canonical events error:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get('/agent-runs', async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const rows = await operationsRepo.listAgentRuns(scope);
    res.json(rows);
  } catch (error) {
    console.error('Operations agent runs error:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;
