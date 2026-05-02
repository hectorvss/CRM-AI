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

import { Router, Response, NextFunction } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { logger } from '../utils/logger.js';

// ── In-memory subscriber registry ────────────────────────────────────────────

type SSEClient = {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  res: Response;
};

const clients: SSEClient[] = [];
type BufferedSSEEvent = {
  id: number;
  event: string;
  data: Record<string, unknown>;
  workspaceId: string | null;
};

const eventBuffers = new Map<string, BufferedSSEEvent[]>();
const eventCounters = new Map<string, number>();
let clientIdCounter = 0;

function addClient(tenantId: string, workspaceId: string | null, res: Response): SSEClient {
  const client: SSEClient = { id: `sse_${++clientIdCounter}`, tenantId, workspaceId, res };
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

function bufferEvent(
  tenantId: string,
  event: string,
  data: Record<string, unknown>,
  workspaceId: string | null,
): BufferedSSEEvent {
  const buffered: BufferedSSEEvent = {
    id: nextEventId(tenantId),
    event,
    data,
    workspaceId,
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
 * Broadcast an event to connected SSE clients.
 *
 * Backward-compatible call sites pass only (tenantId, event, data).
 * New call sites should also pass `workspaceId` so the event is delivered
 * only to clients connected with that workspace header. When workspaceId is
 * null, the event fans out to every client in the tenant (legacy behaviour).
 */
export function broadcastSSE(
  tenantId: string,
  event: string,
  data: Record<string, unknown>,
  workspaceId: string | null = null,
): void {
  const enrichedData = {
    ...data,
    tenantId,
    workspaceId: workspaceId ?? (data as any).workspaceId ?? null,
  };
  const buffered = bufferEvent(tenantId, event, enrichedData, workspaceId);
  const payload = formatEvent(buffered);
  for (const client of clients) {
    if (client.tenantId !== tenantId) continue;
    // Filter by workspace when both sides specify one. If broadcaster did not
    // scope, deliver to all clients in the tenant (preserves legacy semantics).
    if (workspaceId && client.workspaceId && client.workspaceId !== workspaceId) {
      continue;
    }
    try {
      client.res.write(payload);
    } catch {
      // Client disconnected — will be cleaned up on close event
    }
  }
}

// ── Router ───────────────────────────────────────────────────────────────────

const router = Router();

/**
 * SSE-specific auth shim: browsers cannot attach an Authorization header to
 * an EventSource, so we accept the JWT via `?token=...` query string and
 * promote it to a Bearer header before delegating to extractMultiTenant.
 *
 * Security notes:
 *  - We only honor the query token when no Authorization header was supplied
 *    (prevents downgrade if a smarter client already authenticated).
 *  - We strip the token from `req.url` and `req.query` so it never reaches
 *    request loggers, audit trails, or downstream handlers.
 *  - We never log the token value itself.
 */
function promoteSseQueryToken(req: MultiTenantRequest, _res: Response, next: NextFunction) {
  const queryToken = typeof req.query?.token === 'string' ? req.query.token : null;
  const hasAuthHeader = typeof req.headers.authorization === 'string' && req.headers.authorization.length > 0;

  if (queryToken && !hasAuthHeader) {
    req.headers.authorization = `Bearer ${queryToken}`;
  }

  if (queryToken) {
    // Scrub the token from req.url + req.query so subsequent middleware
    // (loggers, error handlers) cannot accidentally leak it.
    try {
      const [pathname, qs] = (req.url || '').split('?');
      if (qs) {
        const params = new URLSearchParams(qs);
        params.delete('token');
        const remaining = params.toString();
        req.url = remaining ? `${pathname}?${remaining}` : pathname;
      }
      if (req.query && typeof req.query === 'object') {
        delete (req.query as Record<string, unknown>).token;
      }
    } catch (err) {
      logger.debug('sse: failed to scrub query token (non-fatal)', { error: String(err) });
    }
  }

  next();
}

router.use(promoteSseQueryToken);
router.use(extractMultiTenant);

router.get('/agent-runs', (req: MultiTenantRequest, res: Response) => {
  const tenantId = req.tenantId ?? 'org_default';
  const workspaceId = req.workspaceId ?? null;
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
  const connected = bufferEvent(tenantId, 'connected', { tenantId, workspaceId }, workspaceId);
  res.write(formatEvent(connected));

  if (lastEventId > 0) {
    const bufferedEvents = eventBuffers.get(tenantId) ?? [];
    for (const bufferedEvent of bufferedEvents) {
      if (bufferedEvent.id <= lastEventId) continue;
      if (bufferedEvent.event === 'connected') continue;
      // Workspace filter: skip events scoped to a different workspace.
      if (workspaceId && bufferedEvent.workspaceId && bufferedEvent.workspaceId !== workspaceId) {
        continue;
      }
      try {
        res.write(formatEvent(bufferedEvent));
      } catch {
        break;
      }
    }
  }

  const client = addClient(tenantId, workspaceId, res);

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
