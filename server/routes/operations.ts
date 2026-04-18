/**
 * server/routes/operations.ts
 *
 * Operations & System Monitoring API — Refactored to Repository Pattern.
 */

import { Router } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { retryDeadJob, enqueue } from '../queue/client.js';
import { JobType } from '../queue/types.js';
import { createOperationsRepository, createJobRepository } from '../data/index.js';

const router = Router();
router.use(extractMultiTenant);

const operationsRepository = createOperationsRepository();
const jobRepository = createJobRepository();

router.get('/overview', async (req: MultiTenantRequest, res) => {
  try {
    const overview = await operationsRepository.getOverview({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!
    });
    res.json(overview);
  } catch (error) {
    console.error('Operations overview error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/jobs', async (req: MultiTenantRequest, res) => {
  try {
    const jobs = await operationsRepository.listJobs({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!
    });
    res.json(jobs);
  } catch (error) {
    console.error('Operations jobs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/jobs/dead-letter', async (req: MultiTenantRequest, res) => {
  try {
    const jobs = await operationsRepository.listDeadLetterJobs({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!
    });
    res.json(jobs);
  } catch (error) {
    console.error('Operations dead-letter jobs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/jobs/:id/retry', async (req: MultiTenantRequest, res) => {
  try {
    const job = await operationsRepository.getJob({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!
    }, req.params.id);

    if (!job || job.tenant_id !== req.tenantId || (job.workspace_id && job.workspace_id !== req.workspaceId)) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const ok = retryDeadJob(req.params.id);
    if (!ok) {
      res.status(400).json({ error: 'Only dead jobs can be retried' });
      return;
    }

    res.json({ ok: true, jobId: req.params.id, status: 'pending' });
  } catch (error) {
    console.error('Operations retry job error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/webhooks', async (req: MultiTenantRequest, res) => {
  try {
    const rows = await operationsRepository.listWebhooks({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!
    });
    res.json(rows);
  } catch (error) {
    console.error('Operations webhooks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/webhooks/:id/replay', async (req: MultiTenantRequest, res) => {
  try {
    const row = await operationsRepository.getWebhook({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!
    }, req.params.id);

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

    await operationsRepository.updateWebhookStatus({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!
    }, row.id, 'received');

    res.json({ ok: true, webhookEventId: row.id, jobId });
  } catch (error) {
    console.error('Operations replay webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/canonical-events', async (req: MultiTenantRequest, res) => {
  try {
    const rows = await operationsRepository.listCanonicalEvents({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!
    });
    res.json(rows);
  } catch (error) {
    console.error('Operations canonical events error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/agent-runs', async (req: MultiTenantRequest, res) => {
  try {
    const rows = await operationsRepository.listAgentRuns({
      tenantId: req.tenantId!,
      workspaceId: req.workspaceId!
    });
    res.json(rows);
  } catch (error) {
    console.error('Operations agent runs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
