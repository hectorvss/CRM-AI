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
type BufferedSSEEvent = {
  id: number;
  event: string;
  data: Record<string, unknown>;
};

const eventBuffers = new Map<string, BufferedSSEEvent[]>();
const eventCounters = new Map<string, number>();
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

function nextEventId(tenantId: string): number {
  const current = eventCounters.get(tenantId) ?? 0;
  const next = current + 1;
  eventCounters.set(tenantId, next);
  return next;
}

function bufferEvent(tenantId: string, event: string, data: Record<string, unknown>): BufferedSSEEvent {
  const buffered: BufferedSSEEvent = {
    id: nextEventId(tenantId),
    event,
    data,
  };
  const existing = eventBuffers.get(tenantId) ?? [];
  existing.push(buffered);
  if (existing.length > 200) {
    existing.splice(0, existing.length - 200);
  }
  eventBuffers.set(tenantId, existing);
  return buffered;
}

function formatEvent(event: BufferedSSEEvent): string {
  return `id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

/**
 * Broadcast an event to all connected SSE clients for a given tenant.
 * Called from the orchestrator and runner to push live updates.
 */
export function broadcastSSE(tenantId: string, event: string, data: Record<string, unknown>): void {
  const buffered = bufferEvent(tenantId, event, data);
  const payload = formatEvent(buffered);
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
  const tenantId = req.tenantId ?? 'org_default';
  const lastEventId = Number(req.headers['last-event-id'] ?? 0) || 0;

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 5000\n\n');

  // Send initial connection event
  const connected = bufferEvent(tenantId, 'connected', { tenantId });
  res.write(formatEvent(connected));

  if (lastEventId > 0) {
    const bufferedEvents = eventBuffers.get(tenantId) ?? [];
    for (const bufferedEvent of bufferedEvents) {
      if (bufferedEvent.id > lastEventId && bufferedEvent.event !== 'connected') {
        try {
          res.write(formatEvent(bufferedEvent));
        } catch {
          break;
        }
      }
    }
  }

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
