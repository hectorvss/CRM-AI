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
import { gmailWebhookRouter }     from './gmail.js';
import { outlookWebhookRouter }   from './outlook.js';
import { paypalWebhookRouter }    from './paypal.js';
import { messengerWebhookRouter } from './messenger.js';
import { instagramWebhookRouter } from './instagram.js';
import { telegramWebhookRouter }  from './telegram.js';
import { postmarkWebhookRouter }  from './postmark.js';
import { upsWebhookRouter }       from './ups.js';
import { dhlWebhookRouter }       from './dhl.js';
import { hubspotWebhookRouter }   from './hubspot.js';
import { slackWebhookRouter }     from './slack.js';
import { zendeskWebhookRouter }   from './zendesk.js';
import { intercomWebhookRouter }  from './intercom.js';
import { woocommerceWebhookRouter } from './woocommerce.js';
import { calendlyWebhookRouter }  from './calendly.js';
import { teamsWebhookRouter }    from './teams.js';
import { linearWebhookRouter }   from './linear.js';
import { jiraWebhookRouter }     from './jira.js';
import { githubWebhookRouter }   from './github.js';
import { frontWebhookRouter }    from './front.js';
import { aircallWebhookRouter }  from './aircall.js';
import { gcalendarWebhookRouter } from './gcalendar.js';
import { gdriveWebhookRouter }    from './gdrive.js';
import { zoomWebhookRouter }      from './zoom.js';
import { asanaWebhookRouter }     from './asana.js';
import { pipedriveWebhookRouter } from './pipedrive.js';
import { mailchimpWebhookRouter } from './mailchimp.js';
import { klaviyoWebhookRouter }   from './klaviyo.js';
import { segmentWebhookRouter }   from './segment.js';
import { quickbooksWebhookRouter } from './quickbooks.js';
import { docusignWebhookRouter }  from './docusign.js';
import { sentryWebhookRouter }    from './sentry.js';
import { plaidWebhookRouter }     from './plaid.js';
import { gitlabWebhookRouter }    from './gitlab.js';
import { discordWebhookRouter }   from './discord.js';
import {
  whatsappWebhookRouter,
  emailWebhookRouter,
  smsWebhookRouter,
  webChatWebhookRouter,
} from './channels.js';
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
webhookRouter.use('/gmail',     gmailWebhookRouter);
webhookRouter.use('/outlook',   outlookWebhookRouter);
webhookRouter.use('/paypal',    paypalWebhookRouter);
webhookRouter.use('/messenger', messengerWebhookRouter);
webhookRouter.use('/instagram', instagramWebhookRouter);
webhookRouter.use('/telegram',  telegramWebhookRouter);
webhookRouter.use('/postmark',  postmarkWebhookRouter);
webhookRouter.use('/ups',       upsWebhookRouter);
webhookRouter.use('/dhl',       dhlWebhookRouter);
webhookRouter.use('/hubspot',   hubspotWebhookRouter);
webhookRouter.use('/slack',     slackWebhookRouter);
webhookRouter.use('/zendesk',   zendeskWebhookRouter);
webhookRouter.use('/intercom',  intercomWebhookRouter);
webhookRouter.use('/woocommerce', woocommerceWebhookRouter);
webhookRouter.use('/calendly',  calendlyWebhookRouter);
webhookRouter.use('/teams',     teamsWebhookRouter);
webhookRouter.use('/linear',    linearWebhookRouter);
webhookRouter.use('/jira',      jiraWebhookRouter);
webhookRouter.use('/github',    githubWebhookRouter);
webhookRouter.use('/front',     frontWebhookRouter);
webhookRouter.use('/aircall',   aircallWebhookRouter);
webhookRouter.use('/gcalendar', gcalendarWebhookRouter);
webhookRouter.use('/gdrive',    gdriveWebhookRouter);
webhookRouter.use('/zoom',      zoomWebhookRouter);
webhookRouter.use('/asana',     asanaWebhookRouter);
webhookRouter.use('/pipedrive', pipedriveWebhookRouter);
webhookRouter.use('/mailchimp', mailchimpWebhookRouter);
webhookRouter.use('/klaviyo',   klaviyoWebhookRouter);
webhookRouter.use('/segment',   segmentWebhookRouter);
webhookRouter.use('/quickbooks', quickbooksWebhookRouter);
webhookRouter.use('/docusign',  docusignWebhookRouter);
webhookRouter.use('/sentry',    sentryWebhookRouter);
webhookRouter.use('/plaid',     plaidWebhookRouter);
webhookRouter.use('/gitlab',    gitlabWebhookRouter);
webhookRouter.use('/discord',   discordWebhookRouter);
webhookRouter.use('/whatsapp',  whatsappWebhookRouter);
webhookRouter.use('/email',     emailWebhookRouter);
webhookRouter.use('/sms',       smsWebhookRouter);
webhookRouter.use('/web-chat',  webChatWebhookRouter);

// ── Catch-all for unknown integrations ───────────────────────────────────────
webhookRouter.post('/:integration', (req: Request, res: Response) => {
  logger.debug('Webhook: unknown integration', { integration: req.params.integration });
  res.status(404).json({ error: 'UNKNOWN_INTEGRATION', integration: req.params.integration });
});
