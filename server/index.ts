import express from 'express';
import cors from 'cors';
import path from 'path';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

import { config } from './config.js';
import { logger } from './utils/logger.js';
import { startWorker, stopWorker, workerStatus } from './queue/worker.js';
import { countJobs } from './queue/client.js';
import { startScheduledJobs, stopScheduledJobs } from './queue/scheduledJobs.js';
import { bootstrapIntegrations, integrationRegistry } from './integrations/registry.js';
import { assertDatabaseProviderReady, getDatabaseConnectivityStatus, getDatabaseProviderStatus } from './db/provider.js';

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
import operationsRouter from './routes/operations.js';
import executionRouter from './routes/execution.js';
import sseRouter from './routes/sse.js';
import demoRouter from './routes/demo.js';
import policyRouter from './routes/policy.js';
import reconciliationRouter from './routes/reconciliation.js';
import superAgentRouter from './routes/superAgent.js';
import onboardingRouter from './routes/onboarding.js';
import publicConfigRouter from './routes/publicConfig.js';
import { oauthConnectorsRouter } from './routes/oauthConnectors.js';
import { shopifyOAuthRouter } from './routes/shopifyOAuth.js';
import { stripeOAuthRouter } from './routes/stripeOAuth.js';
import internalRouter from './routes/internal.js';
import { extractMultiTenant } from './middleware/multiTenant.js';
import { superAgentLimiter, aiLimiter, onboardingLimiter } from './middleware/rateLimit.js';
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
import './pipeline/agentExecute.js';
import './pipeline/aiJobs.js';

// ── Agent engine (registers AGENT_TRIGGER handler via queue/handlers/index.ts) ──
// Importing orchestrator ensures the agentTriggerHandler is available
// to the worker without needing a separate registration call.
import './agents/orchestrator.js';

// ── Plan Engine — initialise tool registry at startup ───────────────────────
import { planEngine } from './agents/planEngine/index.js';
planEngine.init();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');

const isServerlessRuntime = Boolean(process.env.VERCEL);

if (!isServerlessRuntime) {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    logger.warn('Failed to create DATA_DIR', { error: err });
  }
}

// ── Database Readiness ────────────────────────────────────
try {
  assertDatabaseProviderReady();
} catch (err: any) {
  logger.error('Database configuration check failed', { error: err.message });
  if (!isServerlessRuntime) process.exit(1);
}

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
app.use('/api/ai', aiLimiter, aiRouter);
app.use('/api/iam', iamRouter);
app.use('/api/workspaces', workspacesRouter);
app.use('/api/billing', billingRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/operations', operationsRouter);
app.use('/api/execution', executionRouter);
app.use('/api/sse', sseRouter);
app.use('/api/demo', demoRouter);
app.use('/api/policy', policyRouter);
app.use('/api/reconciliation', reconciliationRouter);
app.use('/api/super-agent', superAgentLimiter, superAgentRouter);
app.use('/api/onboarding', onboardingLimiter, onboardingRouter);
// Public, unauthenticated endpoints used by the landing page (config + lead capture).
app.use('/api/public', publicConfigRouter);
// OAuth callback must be public (no x-tenant-id header in the provider redirect)
app.use('/api/oauth-connectors', oauthConnectorsRouter);
// Shopify OAuth: install pages need extractMultiTenant (which the router applies
// per-route); the /callback endpoint is public-by-design (Shopify is the caller).
app.use('/api/integrations/shopify', shopifyOAuthRouter);
// Stripe Connect OAuth + manual key fallback. /callback is public; the rest
// require auth via extractMultiTenant inside the router.
app.use('/api/integrations/stripe', stripeOAuthRouter);
// Internal cron-driven endpoints (worker tick, scheduler tick). Auth via INTERNAL_CRON_SECRET.
// Mounted BEFORE multi-tenant middleware skip list since they have their own auth.
app.use('/api/internal', internalRouter);

// ── Health check (enhanced) ───────────────────────────────
app.get('/api/health', async (_req, res) => {
  const integrationHealth = await integrationRegistry.healthCheck();
  const queueCounts       = countJobs();
  const worker            = workerStatus();
  const databaseStatus    = await getDatabaseConnectivityStatus();

  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    version:   '1.0.0',
    database:  databaseStatus,
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

// ── Static hosting ────────────────────────────────────────
//   /            → static landing page (public-landing/)
//   /app, /app/* → Vite-built SPA (dist/)
//
// Mounted AFTER /webhooks and /api so those continue to take precedence.
// In Vercel, vercel.json rewrites handle equivalent routing; this block is
// primarily for local `npm start` and self-hosted deployments.
const LANDING_DIR = path.resolve(__dirname, '../public-landing');
const SPA_DIR     = path.resolve(__dirname, '../dist');

app.use('/app', express.static(SPA_DIR, { index: false, fallthrough: true }));
app.get(/^\/app(\/.*)?$/, (_req, res, next) => {
  // Try _spa.html first (post-build rename), fall back to index.html (dev)
  const spaFile = path.join(SPA_DIR, '_spa.html');
  const indexFile = path.join(SPA_DIR, 'index.html');
  res.sendFile(spaFile, (err) => {
    if (err) res.sendFile(indexFile, (err2) => { if (err2) next(); });
  });
});

app.use('/', express.static(LANDING_DIR, { index: 'index.html', fallthrough: true }));
// Hash-based SPA in the landing — every unmatched GET serves the landing shell.
app.get(/^\/(?!api|webhooks|app).*/, (_req, res, next) => {
  res.sendFile(path.join(LANDING_DIR, 'index.html'), (err) => {
    if (err) next();
  });
});

// ── Start ─────────────────────────────────────────────────
const server = app.listen(config.server.port, () => {
  logger.info('CRM AI API server started', {
    port:         config.server.port,
    env:          config.env,
    database:     getDatabaseProviderStatus(),
    integrations: integrationRegistry.registeredSystems(),
  });
});

// Start the background job worker and scheduled jobs only in non-serverless environments.
// Vercel functions are stateless and short-lived — persistent workers must not run there.
if (!isServerlessRuntime) {
  startWorker();
  startScheduledJobs();
} else {
  logger.info('Serverless runtime detected (Vercel) — skipping worker and scheduled jobs');
}

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

if (!isServerlessRuntime) {
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

export default app;
