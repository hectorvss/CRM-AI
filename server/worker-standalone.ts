import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

import { config } from './config.js';
import { logger } from './utils/logger.js';
import { assertDatabaseProviderReady, getDatabaseProviderStatus } from './db/provider.js';
import { bootstrapIntegrations, integrationRegistry } from './integrations/registry.js';
import { startWorker, stopWorker, workerStatus } from './queue/worker.js';

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
import './agents/orchestrator.js';

async function main() {
  try {
    assertDatabaseProviderReady();
  } catch (err: any) {
    logger.error('Worker database configuration check failed', { error: err.message });
    process.exit(1);
  }

  await bootstrapIntegrations();

  logger.info('CRM AI standalone worker started', {
    env: config.env,
    database: getDatabaseProviderStatus(),
    integrations: integrationRegistry.registeredSystems(),
  });

  startWorker();

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received by standalone worker`);
    await stopWorker();
    process.exit(0);
  };

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT', () => { void shutdown('SIGINT'); });

  setInterval(() => {
    const status = workerStatus();
    logger.debug('Standalone worker heartbeat', status);
  }, 60_000).unref();
}

void main();
