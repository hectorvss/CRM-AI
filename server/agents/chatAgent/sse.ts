/**
 * server/agents/chatAgent/sse.ts
 *
 * SSE emitter for the Super Agent chat stream. Decoupled from Express so the
 * loop is testable (PostHog's equivalent split: graph writes to a Redis
 * stream, the API layer serializes to SSE — here it's a direct emitter since
 * loop and response share a process).
 */

import type { Response } from 'express';

export interface AgentSSEEmitter {
  emit(event: string, data: unknown): void;
  close(): void;
}

const HEARTBEAT_MS = 15_000;

export function createExpressSSEEmitter(res: Response): AgentSSEEmitter {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Keep intermediaries (and Vercel) from killing quiet long streams.
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n');
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  return {
    emit(event: string, data: unknown) {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    },
  };
}
