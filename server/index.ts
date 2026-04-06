import express from 'express';
import cors from 'cors';
import path from 'path';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { runMigrations } from './db/client.js';
import { seedDatabase } from './db/seed.js';

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
import reconciliationRouter from './routes/reconciliation.js';
import policyRouter from './routes/policy.js';
import { extractMultiTenant } from './middleware/multiTenant.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');

// Ensure data directory exists
mkdirSync(DATA_DIR, { recursive: true });

// ── Database ──────────────────────────────────────────────
runMigrations();
seedDatabase();

// ── Express App ───────────────────────────────────────────
const app = express();
const PORT = parseInt(process.env.API_PORT || '3006');

app.use(cors({ origin: ['http://localhost:3005', 'http://localhost:5173'], credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Multi-tenant Context Extraction
app.use('/api', extractMultiTenant);

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
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
app.use('/api/reconciliation', reconciliationRouter);
app.use('/api/policy', policyRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 CRM AI API server running at http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
});

export default app;
