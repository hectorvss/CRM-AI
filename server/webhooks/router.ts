/**
 * server/webhooks/router.ts
 *
 * Top-level webhook router. Mounts all integration-specific webhook handlers
 * under /webhooks/:integration.
 *
 * IMPORTANT: Webhook endpoints must receive the RAW request body (not parsed
 * JSON) so signature verification works. Express's JSON middleware must NOT
 * run before these routes. We achieve this by mounting them before the global
 * json() middleware in server/index.ts, and by using express.raw() here to
 * capture the body as a Buffer, then attaching it as req.rawBody.
 *
 * Routes:
 *   POST /webhooks/shopify    → shopify webhook handler
 *   POST /webhooks/stripe     → stripe webhook handler
 *   GET  /webhooks/whatsapp   → Meta webhook verification
 *   POST /webhooks/whatsapp   → inbound WhatsApp messages
 *   POST /webhooks/email      → inbound email (Postmark / SendGrid)
 */

import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import { shopifyWebhookRouter }   from './shopify.js';
import { stripeWebhookRouter }    from './stripe.js';
import { whatsappWebhookRouter, emailWebhookRouter } from './channels.js';
import { logger } from '../utils/logger.js';

export const webhookRouter = Router();

/**
 * Middleware: capture raw body as a string and attach it to `req.rawBody`.
 * This runs before any JSON parsing so the original bytes are preserved
 * for HMAC signature verification.
 */
function captureRawBody(req: Request, res: Response, next: NextFunction): void {
  express.raw({ type: '*/*', limit: '5mb' })(req, res, (err) => {
    if (err) {
      logger.warn('Webhook: failed to read raw body', { error: (err as Error).message });
      res.status(400).send('bad request');
      return;
    }
    // Attach as string for downstream signature verification
    if (Buffer.isBuffer(req.body)) {
      (req as any).rawBody = req.body.toString('utf8');
    } else if (typeof req.body === 'string') {
      (req as any).rawBody = req.body;
    } else {
      (req as any).rawBody = JSON.stringify(req.body);
    }
    next();
  });
}

// Apply raw body capture to all webhook routes
webhookRouter.use(captureRawBody);

// ── Integration-specific handlers ─────────────────────────────────────────────
webhookRouter.use('/shopify',   shopifyWebhookRouter);
webhookRouter.use('/stripe',    stripeWebhookRouter);
webhookRouter.use('/whatsapp',  whatsappWebhookRouter);
webhookRouter.use('/email',     emailWebhookRouter);

// ── Catch-all for unknown integrations ───────────────────────────────────────
webhookRouter.post('/:integration', (req: Request, res: Response) => {
  logger.debug('Webhook: unknown integration', { integration: req.params.integration });
  res.status(404).send('unknown integration');
});
