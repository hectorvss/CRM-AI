import express from 'express';
import cors from 'cors';
import path from 'path';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load env before config so config can read process.env
dotenv.config({ path: '.env.local' });
dotenv.config();

import { config } from './config.js';
import { logger } from './utils/logger.js';
import { runMigrations } from './db/client.js';
import { seedDatabase } from './db/seed.js';
import { startWorker, stopWorker, workerStatus } from './queue/worker.js';
import { countJobs } from './queue/client.js';
import { startScheduledJobs, stopScheduledJobs } from './queue/scheduledJobs.js';
import { bootstrapIntegrations, integrationRegistry } from './integrations/registry.js';

import casesRouter from './routes/cases.js';
import conversationsRouter from './routes/conversations.js';
import customersRouter from './routes/customers.js';
import ordersRouter from './routes/orders.js';
import paymentsRouter, { returnsRouter } from './routes/payments.js';
import approvalsRouter from './routes/approvals.js';
import knowledgeRouter from './routes/knowledge.js';
import workflowsRouter from './routes/workflows.js';
import { connectorsRouter } from './routes/agents.js';
import agentsRouter from './routes/agents.js';
import auditRouter from './routes/audit.js';
import aiRouter from './routes/ai.js';
import iamRouter from './routes/iam.js';
import workspacesRouter from './routes/workspaces.js';
import billingRouter from './routes/billing.js';
import reportsRouter from './routes/reports.js';
import { extractMultiTenant } from './middleware/multiTenant.js';
import { webhookRouter } from './webhooks/router.js';

// ── Register job handlers (must import to trigger side-effect registration) ──
import './queue/handlers/webhookProcess.js';
import './pipeline/canonicalizer.js';
import './pipeline/channelIngest.js';
import './pipeline/intentRouter.js';
import './pipeline/reconciler.js';
import './pipeline/reconcilerScheduled.js';
import './pipeline/resolutionPlanner.js';
import './pipeline/resolutionExecutor.js';
import './pipeline/resolutionRollback.js';
import './pipeline/draftReply.js';
import './pipeline/messageSender.js';
import './pipeline/slaMonitor.js';

// ── Agent engine (registers AGENT_TRIGGER handler via queue/handlers/index.ts) ──
// Importing orchestrator ensures the agentTriggerHandler is available
// to the worker without needing a separate registration call.
import './agents/orchestrator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');

mkdirSync(DATA_DIR, { recursive: true });

// ── Database ──────────────────────────────────────────────
runMigrations();
seedDatabase();

// ── Integrations ──────────────────────────────────────────
// Non-blocking: adapters that fail to init are logged but don't crash startup
bootstrapIntegrations().catch(err => {
  logger.error('Integration bootstrap error', err);
});

// ── Express App ───────────────────────────────────────────
const app = express();

app.use(cors({ origin: config.server.corsOrigins, credentials: true }));

// ⚠️  Webhooks MUST be mounted BEFORE express.json() so that the raw body
//     bytes are available for HMAC signature verification.
//     The webhook router uses its own express.raw() middleware internally.
app.use('/webhooks', webhookRouter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Multi-tenant context
app.use('/api', extractMultiTenant);

// Request logger (replaces raw console.log)
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

// ── API Routes ────────────────────────────────────────────
app.use('/api/cases', casesRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/returns', returnsRouter);
app.use('/api/approvals', approvalsRouter);
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/workflows', workflowsRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/connectors', connectorsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/ai', aiRouter);
app.use('/api/iam', iamRouter);
app.use('/api/workspaces', workspacesRouter);
app.use('/api/billing', billingRouter);
app.use('/api/reports', reportsRouter);

// ── Health check (enhanced) ───────────────────────────────
app.get('/api/health', async (_req, res) => {
  const integrationHealth = await integrationRegistry.healthCheck();
  const queueCounts       = countJobs();
  const worker            = workerStatus();

  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    version:   '1.0.0',
    worker: {
      running:  worker.running,
      inFlight: worker.inFlight,
    },
    queue: queueCounts,
    integrations: {
      registered: integrationRegistry.registeredSystems(),
      health:     integrationHealth,
    },
  });
});

// ── Start ─────────────────────────────────────────────────
const server = app.listen(config.server.port, () => {
  logger.info('CRM AI API server started', {
    port:         config.server.port,
    env:          config.env,
    integrations: integrationRegistry.registeredSystems(),
  });
});

// Start the background job worker
startWorker();

// Start recurring maintenance jobs (SLA sweeps, reconciliation sweeps)
startScheduledJobs();

// ── Graceful shutdown ─────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received — shutting down gracefully`);

  // Stop accepting new HTTP requests
  server.close();

  // Stop scheduled job intervals first
  stopScheduledJobs();

  // Wait for in-flight queue jobs to finish (max 30 s)
  await stopWorker();

  logger.info('Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

export default app;
