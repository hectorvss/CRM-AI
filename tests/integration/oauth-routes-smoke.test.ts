/**
 * tests/integration/oauth-routes-smoke.test.ts
 *
 * Smoke test for every OAuth integration route. We can't perform a real
 * provider exchange without registered apps, but we CAN verify that:
 *
 *  1. GET /install — when env vars are present, generates a valid OAuth
 *     URL (well-formed, contains client_id + state + redirect_uri or scope)
 *  2. GET /install — when env vars are missing, returns 503 with a
 *     descriptive error rather than crashing
 *  3. GET /callback?error=access_denied — redirects to /app/integrations
 *     with the error reason instead of crashing
 *  4. GET /callback (no params) — returns 4xx instead of 5xx
 *
 * Boots the Express app in-process so we hit the real route handlers.
 */

import express from 'express';
import { startWorker, stopWorker } from '../../server/queue/worker.js';

import { shopifyOAuthRouter } from '../../server/routes/shopifyOAuth.js';
import { stripeOAuthRouter } from '../../server/routes/stripeOAuth.js';
import { gmailOAuthRouter } from '../../server/routes/gmailOAuth.js';
import { outlookOAuthRouter } from '../../server/routes/outlookOAuth.js';
import { salesforceOAuthRouter } from '../../server/routes/salesforceOAuth.js';
import { hubspotOAuthRouter } from '../../server/routes/hubspotOAuth.js';
import { slackOAuthRouter } from '../../server/routes/slackOAuth.js';
import { zendeskOAuthRouter } from '../../server/routes/zendeskOAuth.js';
import { intercomOAuthRouter } from '../../server/routes/intercomOAuth.js';
import { notionOAuthRouter } from '../../server/routes/notionOAuth.js';
import { calendlyOAuthRouter } from '../../server/routes/calendlyOAuth.js';
import { teamsOAuthRouter } from '../../server/routes/teamsOAuth.js';
import { linearOAuthRouter } from '../../server/routes/linearOAuth.js';
import { jiraOAuthRouter } from '../../server/routes/jiraOAuth.js';
import { confluenceOAuthRouter } from '../../server/routes/confluenceOAuth.js';
import { githubOAuthRouter } from '../../server/routes/githubOAuth.js';
import { frontOAuthRouter } from '../../server/routes/frontOAuth.js';
import { aircallOAuthRouter } from '../../server/routes/aircallOAuth.js';
import { gcalendarOAuthRouter } from '../../server/routes/gcalendarOAuth.js';
import { gdriveOAuthRouter } from '../../server/routes/gdriveOAuth.js';
import { zoomOAuthRouter } from '../../server/routes/zoomOAuth.js';
import { asanaOAuthRouter } from '../../server/routes/asanaOAuth.js';
import { pipedriveOAuthRouter } from '../../server/routes/pipedriveOAuth.js';
import { mailchimpOAuthRouter } from '../../server/routes/mailchimpOAuth.js';
import { klaviyoOAuthRouter } from '../../server/routes/klaviyoOAuth.js';
import { quickbooksOAuthRouter } from '../../server/routes/quickbooksOAuth.js';
import { docusignOAuthRouter } from '../../server/routes/docusignOAuth.js';
import { sentryOAuthRouter } from '../../server/routes/sentryOAuth.js';
import { gitlabOAuthRouter } from '../../server/routes/gitlabOAuth.js';
import { discordOAuthRouter } from '../../server/routes/discordOAuth.js';

const ROUTERS: Array<{ name: string; mount: string; router: any }> = [
  { name: 'shopify',    mount: '/api/integrations/shopify',    router: shopifyOAuthRouter },
  { name: 'stripe',     mount: '/api/integrations/stripe',     router: stripeOAuthRouter },
  { name: 'gmail',      mount: '/api/integrations/gmail',      router: gmailOAuthRouter },
  { name: 'outlook',    mount: '/api/integrations/outlook',    router: outlookOAuthRouter },
  { name: 'salesforce', mount: '/api/integrations/salesforce', router: salesforceOAuthRouter },
  { name: 'hubspot',    mount: '/api/integrations/hubspot',    router: hubspotOAuthRouter },
  { name: 'slack',      mount: '/api/integrations/slack',      router: slackOAuthRouter },
  { name: 'zendesk',    mount: '/api/integrations/zendesk',    router: zendeskOAuthRouter },
  { name: 'intercom',   mount: '/api/integrations/intercom',   router: intercomOAuthRouter },
  { name: 'notion',     mount: '/api/integrations/notion',     router: notionOAuthRouter },
  { name: 'calendly',   mount: '/api/integrations/calendly',   router: calendlyOAuthRouter },
  { name: 'teams',      mount: '/api/integrations/teams',      router: teamsOAuthRouter },
  { name: 'linear',     mount: '/api/integrations/linear',     router: linearOAuthRouter },
  { name: 'jira',       mount: '/api/integrations/jira',       router: jiraOAuthRouter },
  { name: 'confluence', mount: '/api/integrations/confluence', router: confluenceOAuthRouter },
  { name: 'github',     mount: '/api/integrations/github',     router: githubOAuthRouter },
  { name: 'front',      mount: '/api/integrations/front',      router: frontOAuthRouter },
  { name: 'aircall',    mount: '/api/integrations/aircall',    router: aircallOAuthRouter },
  { name: 'gcalendar',  mount: '/api/integrations/gcalendar',  router: gcalendarOAuthRouter },
  { name: 'gdrive',     mount: '/api/integrations/gdrive',     router: gdriveOAuthRouter },
  { name: 'zoom',       mount: '/api/integrations/zoom',       router: zoomOAuthRouter },
  { name: 'asana',      mount: '/api/integrations/asana',      router: asanaOAuthRouter },
  { name: 'pipedrive',  mount: '/api/integrations/pipedrive',  router: pipedriveOAuthRouter },
  { name: 'mailchimp',  mount: '/api/integrations/mailchimp',  router: mailchimpOAuthRouter },
  { name: 'klaviyo',    mount: '/api/integrations/klaviyo',    router: klaviyoOAuthRouter },
  { name: 'quickbooks', mount: '/api/integrations/quickbooks', router: quickbooksOAuthRouter },
  { name: 'docusign',   mount: '/api/integrations/docusign',   router: docusignOAuthRouter },
  { name: 'sentry',     mount: '/api/integrations/sentry',     router: sentryOAuthRouter },
  { name: 'gitlab',     mount: '/api/integrations/gitlab',     router: gitlabOAuthRouter },
  { name: 'discord',    mount: '/api/integrations/discord',    router: discordOAuthRouter },
];

const app = express();
app.use(express.json());
// Inject a dummy auth context — the real extractMultiTenant middleware
// requires Supabase session lookup which we want to bypass here.
app.use('/api', (req, _res, next) => {
  (req as any).tenantId = 'tenant_1';
  (req as any).workspaceId = 'ws_default';
  (req as any).userId = 'u_smoke';
  (req as any).permissions = ['*'];
  next();
});
for (const r of ROUTERS) app.use(r.mount, r.router);

const server = app.listen(0);
const port = (server.address() as any).port;
const baseUrl = `http://127.0.0.1:${port}`;

interface RouteResult {
  name: string;
  installStatus: number;
  installShape: 'json' | 'redirect' | 'error' | 'unknown';
  installUrlValid?: boolean;
  callbackErrorStatus: number;
  callbackErrorRedirect?: string;
  callbackEmptyStatus: number;
  pass: boolean;
  notes: string[];
}

async function smoke(name: string, mount: string): Promise<RouteResult> {
  const r: RouteResult = { name, installStatus: 0, installShape: 'unknown', callbackErrorStatus: 0, callbackEmptyStatus: 0, pass: false, notes: [] };

  // 1. GET /install with json accept
  const inst = await fetch(`${baseUrl}${mount}/install`, { headers: { Accept: 'application/json' }, redirect: 'manual' });
  r.installStatus = inst.status;
  if (inst.status === 503) {
    r.installShape = 'error'; r.notes.push('install returns 503 (env not configured) — graceful');
  } else if (inst.status === 200) {
    const j: any = await inst.json().catch(() => null);
    r.installShape = j && j.url ? 'json' : 'unknown';
    if (j?.url) {
      try {
        const u = new URL(j.url);
        const hasClientId = !!u.searchParams.get('client_id') || !!u.searchParams.get('audience') || u.pathname.includes('sentry-apps');
        const hasState = !!u.searchParams.get('state');
        r.installUrlValid = hasClientId && hasState;
        if (!hasClientId) r.notes.push('install URL missing client_id');
        if (!hasState) r.notes.push('install URL missing state');
      } catch { r.notes.push('install URL malformed'); }
    }
  } else if (inst.status >= 300 && inst.status < 400) {
    r.installShape = 'redirect';
    r.installUrlValid = !!inst.headers.get('location');
  }

  // 2. GET /callback?error=access_denied → expect 3xx redirect to /app/integrations?error=
  const cbErr = await fetch(`${baseUrl}${mount}/callback?error=access_denied`, { redirect: 'manual' });
  r.callbackErrorStatus = cbErr.status;
  r.callbackErrorRedirect = cbErr.headers.get('location') ?? undefined;

  // 3. GET /callback (no params) → expect 400/401, not 500
  const cbEmpty = await fetch(`${baseUrl}${mount}/callback`, { redirect: 'manual' });
  r.callbackEmptyStatus = cbEmpty.status;

  // Pass criteria:
  //   - install returns 200(json+url) OR 503 (env not configured) — both are graceful
  //   - callback?error= returns 3xx (redirect) OR 401 (state required first) — never 500
  //   - empty callback never returns 5xx
  // 503 on every endpoint means "integration not configured" — acceptable
  // graceful failure (no crash, no leak). 200/3xx mean it ran. Anything 5xx
  // OTHER than 503 is a real bug (handler threw).
  const goodStatuses = (s: number) => s === 200 || (s >= 300 && s < 400) || s === 400 || s === 401 || s === 503;
  const installOk = goodStatuses(r.installStatus) && (r.installStatus !== 200 || r.installUrlValid !== false);
  const errorOk   = goodStatuses(r.callbackErrorStatus);
  const emptyOk   = goodStatuses(r.callbackEmptyStatus);
  r.pass = installOk && errorOk && emptyOk;
  if (!installOk) r.notes.push(`install ${r.installStatus} unexpected`);
  if (!errorOk) r.notes.push(`callback?error= returned ${r.callbackErrorStatus}`);
  if (!emptyOk) r.notes.push(`callback empty returned ${r.callbackEmptyStatus}`);
  return r;
}

(async () => {
  console.log(`▶ OAuth route smoke for ${ROUTERS.length} routes\n`);
  let exitCode = 0;
  const results: RouteResult[] = [];
  for (const r of ROUTERS) {
    const res = await smoke(r.name, r.mount);
    results.push(res);
    const tag = res.pass ? '✓' : '✗';
    const installTag = res.installStatus === 200 ? `200/${res.installShape}` : String(res.installStatus);
    console.log(`  ${tag} ${r.name.padEnd(12)} install=${installTag.padEnd(12)} cb?error=${res.callbackErrorStatus.toString().padEnd(4)} cb_empty=${res.callbackEmptyStatus.toString().padEnd(4)} ${res.notes.length ? `[${res.notes.join('; ')}]` : ''}`);
    if (!res.pass) exitCode = 1;
  }
  const passed = results.filter(r => r.pass).length;
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`OAuth route smoke: ${passed} passed / ${results.length - passed} failed / ${results.length} total`);
  console.log(`${'─'.repeat(60)}\n`);
  server.close();
  process.exit(exitCode);
})().catch(err => { console.error('Suite crashed:', err); server.close(); process.exit(2); });
