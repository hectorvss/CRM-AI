# Linear OAuth — runbook para activar la integración live

Este runbook activa Linear end-to-end por primera vez. El mismo patrón sirve para los otros 34 OAuth integrations (Klaviyo, Slack, GitHub, etc.) — solo cambia el provider y los nombres de las env vars.

## Pre-requisitos

- Cuenta de Linear con permisos para crear OAuth applications
- Acceso a `.env.local` (dev) o panel de Vercel (prod)
- `PUBLIC_BASE_URL` ya configurado (ej. `https://clain.dev` o tunnel ngrok en dev)

## 1) Registrar la OAuth App en Linear (5 min)

1. Ve a https://linear.app/settings/api/applications/new
2. Rellena:
   - **Name**: Clain
   - **Developer URL**: tu landing page
   - **Description**: "AI-powered CRM with engineering escalation"
   - **Callback URLs** (añade ambos):
     - `https://<PUBLIC_BASE_URL>/api/integrations/linear/callback`
     - Si usas ngrok local: `https://<ngrok-id>.ngrok.io/api/integrations/linear/callback`
   - **Public app**: Yes (si planeas multi-tenant) | No (single-org install)
3. Click **Create**
4. Linear te da:
   - `Client ID` (visible en la app config)
   - `Client Secret` (cópialo AHORA — no se vuelve a mostrar)
   - `Webhook signing secret` (opcional — solo si vas a registrar webhooks vía dashboard manualmente; el código los crea automáticamente vía API en el callback)

## 2) Configurar env vars

### Dev (`.env.local`)

```bash
LINEAR_CLIENT_ID=lin_oauth_xxx
LINEAR_CLIENT_SECRET=lin_oauth_secret_xxx
LINEAR_STATE_SECRET=$(openssl rand -hex 32)   # cualquier random hex 64-char
PUBLIC_BASE_URL=https://<your-ngrok-or-domain>
```

### Prod (Vercel)

Settings → Environment Variables → añade los mismos 3 con scope=Production.

## 3) Verificar la config

```bash
# Debería responder 200/JSON con una URL OAuth válida
curl -X GET "https://<PUBLIC_BASE_URL>/api/integrations/linear/install" \
  -H "Accept: application/json" \
  -H "Cookie: <session>" \
  | jq .url
# → "https://linear.app/oauth/authorize?client_id=...&scope=read,write&state=..."
```

Si devuelve **503**: alguna env var falta. Revisa los 3 (`LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET`, `LINEAR_STATE_SECRET`) + `PUBLIC_BASE_URL`.

## 4) Click "Connect Linear" desde la UI

1. Login en Clain → `/app/integrations`
2. Busca la card de Linear (categoría Productivity)
3. Click → modal abre → click "Conectar con Linear"
4. Te redirige a `linear.app/oauth/authorize` → autorizas
5. Linear redirige de vuelta a `/api/integrations/linear/callback?code=...&state=...`
6. El callback:
   - Verifica el state (HMAC firmado, 10min TTL)
   - Intercambia code → access_token (válido 10 años, no refresh)
   - Llama `viewer { id email organization { id name } }` para identificar
   - Crea webhook automáticamente en `Issue, Comment, IssueLabel, Reaction, IssueAttachment` con HMAC SHA256 hex secret
   - Persiste connector en DB con `auth_config = { access_token, organization_id, viewer_email, webhook_id, webhook_signing_secret, ... }`
7. Te redirige a `/app/integrations?connected=linear`
8. La card debe pasar a status "Connected"

## 5) Probar runtime

### Crear un issue desde el agente (lo confirmamos ya en `tests/integration/ai-agent-llm-e2e.test.ts`)

```bash
curl -X POST "https://<PUBLIC_BASE_URL>/api/tools/invoke" \
  -H "Authorization: Bearer <session>" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "linear.issue.create",
    "args": {
      "teamId": "<linear-team-uuid>",
      "title": "Test from Clain",
      "description": "Created via /api/tools/invoke",
      "priority": 2
    }
  }'
```

→ debe responder `{ ok: true, value: { id, identifier: "ENG-42", url, ... } }`

### Provocar un webhook entrante

1. Crea/edita un issue en Linear → Linear envía POST a `/webhooks/linear`
2. Verifica en logs: `linear webhook: signature verified` + `Linear webhook persisted, enqueued WEBHOOK_PROCESS`
3. La pipeline canonicaliza → workflow event `engineering.issue.updated` se dispara

## 6) Re-aplicar el patrón a los otros 34

Cada integration sigue el mismo flow:

| Provider | Env vars necesarias | Callback path |
|---|---|---|
| Klaviyo | `KLAVIYO_CLIENT_ID`, `KLAVIYO_CLIENT_SECRET`, `KLAVIYO_STATE_SECRET` | `/api/integrations/klaviyo/callback` |
| Slack | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_STATE_SECRET` | `/api/integrations/slack/callback` |
| GitHub | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_STATE_SECRET` | `/api/integrations/github/callback` |
| Jira | `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET`, `JIRA_STATE_SECRET` | `/api/integrations/jira/callback` |
| Confluence | `CONFLUENCE_CLIENT_ID`, `CONFLUENCE_CLIENT_SECRET`, `CONFLUENCE_STATE_SECRET` | `/api/integrations/confluence/callback` |
| Front | `FRONT_CLIENT_ID`, `FRONT_CLIENT_SECRET`, `FRONT_STATE_SECRET` | `/api/integrations/front/callback` |
| HubSpot | `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`, `HUBSPOT_STATE_SECRET` | `/api/integrations/hubspot/callback` |
| Salesforce | `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET`, `SALESFORCE_STATE_SECRET` | `/api/integrations/salesforce/callback` |
| Pipedrive | `PIPEDRIVE_CLIENT_ID`, `PIPEDRIVE_CLIENT_SECRET`, `PIPEDRIVE_STATE_SECRET` | `/api/integrations/pipedrive/callback` |
| Mailchimp | `MAILCHIMP_CLIENT_ID`, `MAILCHIMP_CLIENT_SECRET`, `MAILCHIMP_STATE_SECRET` | `/api/integrations/mailchimp/callback` |
| Notion | `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_STATE_SECRET` | `/api/integrations/notion/callback` |
| Calendly | `CALENDLY_CLIENT_ID`, `CALENDLY_CLIENT_SECRET`, `CALENDLY_STATE_SECRET` | `/api/integrations/calendly/callback` |
| Teams | `TEAMS_CLIENT_ID`, `TEAMS_CLIENT_SECRET`, `TEAMS_STATE_SECRET` | `/api/integrations/teams/callback` |
| Asana | `ASANA_CLIENT_ID`, `ASANA_CLIENT_SECRET`, `ASANA_STATE_SECRET` | `/api/integrations/asana/callback` |
| GitLab | `GITLAB_CLIENT_ID`, `GITLAB_CLIENT_SECRET`, `GITLAB_STATE_SECRET`, optional `GITLAB_BASE_URL` (self-hosted) | `/api/integrations/gitlab/callback` |
| Discord | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_STATE_SECRET`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN` | `/api/integrations/discord/callback` |
| Zoom | `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_STATE_SECRET`, `ZOOM_WEBHOOK_SECRET_TOKEN` | `/api/integrations/zoom/callback` |
| QuickBooks | `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_STATE_SECRET`, `QUICKBOOKS_VERIFIER_TOKEN` | `/api/integrations/quickbooks/callback` |
| DocuSign | `DOCUSIGN_CLIENT_ID`, `DOCUSIGN_CLIENT_SECRET`, `DOCUSIGN_STATE_SECRET`, `DOCUSIGN_HMAC_SECRET` | `/api/integrations/docusign/callback` |
| Sentry | `SENTRY_CLIENT_ID`, `SENTRY_CLIENT_SECRET`, `SENTRY_STATE_SECRET`, `SENTRY_APP_SLUG` | `/api/integrations/sentry/callback` |
| Aircall | `AIRCALL_CLIENT_ID`, `AIRCALL_CLIENT_SECRET`, `AIRCALL_STATE_SECRET` | `/api/integrations/aircall/callback` |
| Intercom | `INTERCOM_CLIENT_ID`, `INTERCOM_CLIENT_SECRET`, `INTERCOM_STATE_SECRET` | `/api/integrations/intercom/callback` |
| Zendesk | `ZENDESK_CLIENT_ID`, `ZENDESK_CLIENT_SECRET`, `ZENDESK_STATE_SECRET` | `/api/integrations/zendesk/callback` |
| Google (Calendar+Drive) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_STATE_SECRET` | `/api/integrations/gcalendar/callback`, `/gdrive/callback` |
| Outlook | `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET`, `OUTLOOK_STATE_SECRET` | `/api/integrations/outlook/callback` |
| Gmail | (uses `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`) | `/api/integrations/gmail/callback` |
| Shopify | `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_STATE_SECRET` | `/api/integrations/shopify/callback` |
| Stripe | `STRIPE_CLIENT_ID`, `STRIPE_CLIENT_SECRET`, `STRIPE_STATE_SECRET` | `/api/integrations/stripe/callback` |

### API-key (no OAuth) — más simples

| Provider | Setup |
|---|---|
| Twilio | Click Connect → modal pide `account_sid` + `auth_token` → guardado en `auth_config` |
| WhatsApp | Modal pide `phone_number_id` + `business_account_id` + `access_token` |
| Postmark | Modal pide `server_token` |
| Telegram | Modal pide `bot_token` (`@BotFather`) |
| Messenger | Modal pide `page_id` + `page_access_token` |
| Instagram | Reusa Messenger flow |
| UPS / DHL | API key per-account |
| Plaid | Modal pide `client_id` + `secret` + `environment` (sandbox/dev/prod) |
| Segment | Modal pide `write_key` (Source) |

### AI providers (no OAuth)

| Provider | Setup |
|---|---|
| Anthropic | Modal pide `api_key` (sk-ant-...) |
| OpenAI | Modal pide `api_key` (sk-...) |
| Gemini | Modal pide `api_key` |
| Ollama | Modal pide `base_url` (self-hosted endpoint) |

## 7) Troubleshooting

| Síntoma | Causa común | Fix |
|---|---|---|
| `/install` devuelve 503 | env var faltante | Verifica los 3 vars + `PUBLIC_BASE_URL` |
| Callback redirige con `?error=token_exchange` | `CLIENT_SECRET` incorrecto, redirect URI mismatch | Comprueba que el callback URL en el provider coincide exactamente con `${PUBLIC_BASE_URL}/api/integrations/<system>/callback` |
| Webhook llega pero `signature mismatch` | Signing secret no se guardó correctamente, o el provider rotó la key | Re-conectar para regenerar |
| `INTEGRATION_NOT_CONNECTED` cuando el agent llama un tool | Connector tiene `status != 'connected'` o no existe la fila | `SELECT * FROM connectors WHERE tenant_id=... AND system='linear'` |
| `429 Quota exceeded` en Gemini | Free-tier agotado | Cambia `GEMINI_MODEL` a `gemini-2.5-flash-lite` o paga Gemini Pro |

## Checklist post-deploy por integración

- [ ] Env vars puestas (3-4 según provider) en dev y prod
- [ ] OAuth app registrada en el provider, callback URL coincide
- [ ] `/install` responde 200/JSON con URL válida
- [ ] Click "Connect" desde UI completa el flow → status "Connected"
- [ ] `SELECT * FROM connectors WHERE system = '<system>' AND tenant_id = '<t>'` muestra `status='connected'`
- [ ] Para integraciones con webhook auto-registrado: `auth_config.webhook_id` o equivalente está poblado
- [ ] Disparo manual: usa la UI o `curl /api/tools/invoke` para una acción simple → confirma respuesta exitosa
- [ ] Disparo entrante (si el provider permite): edita algo en el provider, verifica que llega a `/webhooks/<system>` y se procesa
