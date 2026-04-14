/**
 * server/routes/sse.ts
 *
 * Server-Sent Events endpoint for real-time agent execution monitoring.
 *
 * Clients connect to GET /api/sse/agent-runs and receive live updates
 * whenever an agent starts, completes, or fails. This avoids polling
 * and gives the frontend instant feedback on orchestration progress.
 *
 * Events sent:
 *   - agent:start   { runId, agentSlug, caseId, triggerEvent }
 *   - agent:finish  { runId, agentSlug, caseId, status, summary, confidence }
 *   - chain:start   { caseId, triggerEvent, slugs }
 *   - chain:finish  { caseId, triggerEvent, failures }
 */

import { Router, Response } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';

// ── In-memory subscriber registry ────────────────────────────────────────────

type SSEClient = {
  id: string;
  tenantId: string;
  res: Response;
};

const clients: SSEClient[] = [];
let clientIdCounter = 0;

function addClient(tenantId: string, res: Response): SSEClient {
  const client: SSEClient = { id: `sse_${++clientIdCounter}`, tenantId, res };
  clients.push(client);
  return client;
}

function removeClient(id: string): void {
  const idx = clients.findIndex(c => c.id === id);
  if (idx !== -1) clients.splice(idx, 1);
}

/**
 * Broadcast an event to all connected SSE clients for a given tenant.
 * Called from the orchestrator and runner to push live updates.
 */
export function broadcastSSE(tenantId: string, event: string, data: Record<string, unknown>): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    if (client.tenantId === tenantId) {
      try {
        client.res.write(payload);
      } catch {
        // Client disconnected — will be cleaned up on close event
      }
    }
  }
}

// ── Router ───────────────────────────────────────────────────────────────────

const router = Router();

router.use(extractMultiTenant);

router.get('/agent-runs', (req: MultiTenantRequest, res: Response) => {
  const tenantId = req.tenantId ?? 'tenant_default';

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ tenantId })}\n\n`);

  const client = addClient(tenantId, res);

  // Keep-alive ping every 30 seconds
  const keepAlive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepAlive);
    }
  }, 30_000);

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(keepAlive);
    removeClient(client.id);
  });
});

export default router;
