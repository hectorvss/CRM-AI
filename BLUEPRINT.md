# BLUEPRINT — Estabilización end-to-end CRM-AI

**Fecha**: 2026-05-03
**Objetivo**: Dejar el SaaS operativo end-to-end en producción (Vercel + Supabase + Stripe + Gemini), sin parches, con todos los flujos funcionando.

---

## Arquitectura objetivo (decisiones tomadas)

### A1 — Worker en Vercel: endpoint de polling vía cron
- **Decisión**: NO usar Vercel Background Functions. NO usar proceso externo.
- **Implementación**: Endpoint `/api/internal/worker/tick` que reclama y procesa hasta N jobs por invocación. Vercel cron lo llama cada minuto.
- **Endpoint adicional**: `/api/internal/scheduler/tick` que ejecuta los `scheduledJobs` (SLA, reconciliación, etc.) bajo control de cron.
- **Requisitos**: ambos endpoints exigen `Authorization: Bearer ${INTERNAL_CRON_SECRET}` para que solo Vercel cron pueda invocarlos.
- **Server bootstrap**: `server/index.ts` ya detecta `process.env.VERCEL`. En ese caso NO se llama `startWorker()` ni `startScheduledJobs()`. Los handlers se registran (side-effect imports) pero el polling queda dormido.

### A2 — CORS: dinámico vía Express, no Vercel
- **Decisión**: eliminar el bloque `headers` de `vercel.json` para `/api/(.*)`.
- **Razón**: el header de Vercel está hardcodeado a un dominio. Express ya lee `CORS_ORIGINS` (CSV) y aplica `cors()` correctamente.

### A3 — Naming convention en API: snake_case en BD, snake_case en wire, camelCase opcional en frontend
- **Decisión**: la API responde **siempre en snake_case** (consistente con BD).
- **Frontend**: capa de mapeo en `src/api/normalize.ts` (nuevo) que normaliza objetos a camelCase para uso en componentes. Quitar fallbacks `o.field || o.fieldOther` en componentes.

### A4 — Auth de primer login: trigger de Supabase
- **Decisión**: `/api/onboarding/setup` actualiza `user.app_metadata` con `tenant_id`/`workspace_id` vía Supabase Admin API antes de devolver respuesta. El frontend hace `supabase.auth.refreshSession()` tras setup. JWT contiene los claims en la siguiente request.

### A5 — Schema reconciliation_issues
- **Decisión**: añadir columnas `summary TEXT` y `issue_type TEXT` a `reconciliation_issues` vía nueva migración (`20260503_0001_reconciliation_schema_fix.sql`).

### A6 — getDb() y SQLite legacy
- **Decisión**: eliminar todas las llamadas a `getDb()`. La función seguirá lanzando excepción para evitar regresiones. Dependency `better-sqlite3` se elimina del `package.json`. La función sincrónica `resolveAgentKnowledgeBundle` también se elimina; solo queda `Async`.

### A7 — Headers tenant en frontend
- **Decisión**: si el JWT tiene claims, usar JWT. Si no, awaitar `iamApi.me()` (ya implementado correctamente en `client.ts`). Los defaults `org_default`/`ws_default` se mantienen como último recurso pero el backend rechaza con 401 en producción si llegan (ya hace eso).

### A8 — Env vars en Vercel
- **Decisión**: los secretos van a Vercel Dashboard, NO al `vercel.json`. El `vercel.json` solo tiene config no-secreta (URLs públicas, modelo Gemini, flags).
- **Variables que DEBEN estar en Vercel Dashboard**:
  - `SUPABASE_SERVICE_ROLE_KEY` (crítico)
  - `GEMINI_API_KEY`
  - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_*`
  - `INTERNAL_CRON_SECRET` (nueva, para proteger endpoints de cron)
  - `DEFAULT_TENANT_ID` y `DEFAULT_WORKSPACE_ID` solo si single-tenant. En multi-tenant, no setear.
  - `SHOPIFY_*`, `WHATSAPP_*`, `POSTMARK_*`, `TWILIO_*`, `GOOGLE_CLIENT_*`, `SLACK_*`, `MS_*`

---

## Los 12 flujos — estado, target y propietario

### Flow 1: Auth & Primer Login
- **Estado**: race condition en primera request tras registro (401)
- **Target**: registro → onboarding → JWT con claims → dashboard sin errores
- **Files (owner)**:
  - `server/middleware/multiTenant.ts`
  - `server/routes/onboarding.ts`
  - `server/routes/iam.ts` (solo `/iam/me`)
  - `src/components/auth/Login.tsx`, `src/components/auth/Signup.tsx`
- **Acceptance**:
  - `/api/onboarding/setup` actualiza `auth.users.app_metadata` con tenant/workspace
  - Frontend invoca `supabase.auth.refreshSession()` tras setup
  - Test manual: signup nuevo usuario → no error 401 en primera request al dashboard

### Flow 2: Dashboard (lectura)
- **Estado**: funcional pero datos muestran "N/A" por mismatches snake/camel
- **Target**: todos los componentes usan tipos camelCase normalizados via capa única
- **Files (owner)**:
  - `src/api/normalize.ts` (nuevo)
  - `src/api/client.ts` (sólo el `request()` aplica normalize)
  - `src/types.ts` (limpiar duplicados snake+camel)
  - `src/components/Inbox.tsx`, `Orders.tsx`, `Payments.tsx`, `Returns.tsx`, `Customers.tsx`, `Approvals.tsx`
- **Acceptance**:
  - Eliminar todos los `o.field || o.fieldOther` defensivos
  - Tipos de UI son camelCase puros
  - `tsc --noEmit` pasa sin errores

### Flow 3: Agentes IA
- **Estado**: COMPLETAMENTE ROTO (`getDb()` excepción siempre)
- **Target**: agentes ejecutan correctamente sobre Supabase
- **Files (owner)**:
  - `server/agents/runner.ts` (cambiar a Async)
  - `server/services/agentKnowledge.ts` (eliminar versión sync)
  - `server/agents/impl/auditLogger.ts` (quitar getDb)
  - Cualquier agente que importe `getDb`
- **Acceptance**:
  - Grep de `getDb(` retorna 0 resultados en `server/`
  - Type-check pasa
  - Smoke test: invocar un agente vía endpoint y verificar que completa

### Flow 4: Pipeline Mensajes (CHANNEL_INGEST → INTENT_ROUTE → DRAFT_REPLY)
- **Estado**: lógica correcta, pero `draftReply.ts` también usa sync version
- **Target**: pipeline ingesta de mensajes funciona end-to-end
- **Files (owner)**:
  - `server/pipeline/draftReply.ts`
  - `server/pipeline/channelIngest.ts`
  - `server/pipeline/intentRouter.ts`
  - `server/pipeline/messageSender.ts`
- **Acceptance**:
  - Mensaje entra vía webhook → se canonicaliza → crea/actualiza case → se encola intent → genera draft sin crashes

### Flow 5: Worker en Vercel (FUNDACIONAL — bloquea 6, 8, 11, 4)
- **Estado**: roto en producción (no hay proceso persistente)
- **Target**: cron-driven worker tick que procesa jobs
- **Files (owner)**:
  - `server/queue/worker.ts` (refactor: añadir `processBatch()` que reclama N jobs y los procesa con await Promise.all)
  - `server/routes/internal.ts` (nuevo)
  - `server/index.ts` (skip startWorker en Vercel, registrar router internal)
  - `vercel.json` (foundation ya hecho — añade el cron)
- **Acceptance**:
  - Endpoint `/api/internal/worker/tick` autenticado con bearer secret
  - Cron de Vercel cada minuto invoca el endpoint
  - Jobs se procesan correctamente, errores en logs

### Flow 6: Scheduled Jobs en Vercel
- **Estado**: completamente roto (setInterval no persiste)
- **Target**: cron-driven scheduler tick que dispara los sweepers
- **Files (owner)**:
  - `server/queue/scheduledJobs.ts` (refactor: extraer `runScheduledTasksOnce()`)
  - `server/routes/internal.ts` (extender)
  - `vercel.json` (cron adicional)
- **Acceptance**:
  - Endpoint `/api/internal/scheduler/tick` ejecuta SLA, reconciliación, schedule sweep, etc., una vez por invocación
  - Cron cada minuto

### Flow 7: Super Agent
- **Estado**: funcional. Solo bug menor de fire-and-forget en `routes/superAgent.ts`
- **Target**: workflow dispatch fiable (encolar evento en BD para que worker lo procese, no inline async)
- **Files (owner)**:
  - `server/routes/superAgent.ts`
  - `server/lib/workflowEventBus.ts` (verificar que `fireWorkflowEvent` persiste en BD)
- **Acceptance**:
  - Events se persisten en `workflow_event_log` antes de devolver respuesta HTTP
  - Worker los procesa después

### Flow 8: Workflows (ejecución)
- **Estado**: editor OK, ejecución depende del worker (Flow 5)
- **Target**: una vez Flow 5 hecho, verificar que workflow events se procesan
- **Files (owner)**:
  - `server/routes/workflows.ts`
  - `server/lib/workflowEventBus.ts`
  - `server/data/workflows.ts`
- **Acceptance**:
  - Workflow run se completa end-to-end vía cron tick
  - Event recovery (pendientes) funciona

### Flow 9: Billing & Stripe
- **Estado**: no operativo (env vars faltan, integración esqueleto)
- **Target**: checkout, subscription change, webhooks Stripe → BD funcional
- **Files (owner)**:
  - `server/routes/billing.ts`
  - `server/integrations/stripe.ts`
  - `server/integrations/stripe/client.ts`
  - `server/integrations/stripe/plans.ts`
  - `server/webhooks/stripe.ts`
  - `src/components/billing/*`, `src/components/upgrade/*`
- **Acceptance**:
  - Si `STRIPE_SECRET_KEY` no existe → endpoints devuelven 503 con mensaje claro (no crash)
  - Webhook handler valida signature y actualiza `billing_subscriptions`
  - `/billing/usage` devuelve datos coherentes

### Flow 10: Integraciones externas (Shopify, WhatsApp, Postmark, Twilio)
- **Estado**: webhooks recibidos, procesamiento depende del worker
- **Target**: webhooks validan signatures, persisten en `canonical_events`, worker los procesa
- **Files (owner)**:
  - `server/webhooks/shopify.ts`
  - `server/webhooks/router.ts`
  - `server/integrations/shopify.ts`
  - `server/integrations/whatsapp.ts`
  - `server/pipeline/channelSenders.ts`
- **Acceptance**:
  - Cada integración: si credentials faltan → `503 SERVICE_UNAVAILABLE`, no crash
  - Webhook signature validada antes de aceptar
  - Event canonicalizado y encolado correctamente

### Flow 11: Reconciliación
- **Estado**: schema desalineado + worker bloquea ejecución
- **Target**: schema fix aplicado + reconciler corre vía scheduler tick
- **Files (owner)**:
  - `supabase/migrations/20260503_0001_reconciliation_schema_fix.sql` (FUNDACIÓN — ya creada)
  - `server/data/cases.ts` (limpiar referencias a `summary`/`issue_type` para usar las columnas reales)
  - `server/data/reconciliation.ts`
  - `server/pipeline/reconciler.ts`
- **Acceptance**:
  - Tras migración, `summary` e `issue_type` son leídos desde columnas
  - `reconciler.ts` puede correr sin errores
  - Endpoint `/reconciliation/process-open` funciona

### Flow 12: Frontend Auth headers + supabase client
- **Estado**: funcional con race en primer login (resuelto por Flow 1) + sin validación
- **Target**: dura UX en primer login, manejo de error 401/403 con redirect a login
- **Files (owner)**:
  - `src/api/client.ts` (sección `request()` y `resolveTenantHeaders`)
  - `src/api/supabase.ts`
  - `src/api/hooks.ts` (manejo 401)
- **Acceptance**:
  - 401 redirige a login
  - Sin caché y sin claims → fetch /iam/me bloquea hasta resolver
  - tras login exitoso, primera request tiene headers correctos

---

## Foundation work (ya hecho ANTES de lanzar agentes)

- [x] Migración `20260503_0001_reconciliation_schema_fix.sql` creada
- [x] `vercel.json` actualizado: CORS removido, crons añadidos, env limpio
- [x] `INTERNAL_CRON_SECRET` documentado
- [x] `server/routes/internal.ts` esqueleto creado (Flow 5/6 lo completa)
- [x] `server/index.ts` modificado para skip worker/scheduler en Vercel
- [x] BLUEPRINT.md y PROGRESS.md creados

## Reglas para los agentes

1. **NO PARCHES**: si encuentras código muerto, elimínalo. Si encuentras un bug fuera de tu scope, anótalo en PROGRESS.md sección "Cross-cutting concerns" pero NO lo arregles (otro agente puede tener ownership).
2. **Files ownership es ESTRICTO**: solo edita los archivos asignados a tu flow. Para archivos compartidos (`src/api/client.ts`, `src/types.ts`, `vercel.json`, `server/index.ts`, migrations) **avisa en PROGRESS.md** y deja la edición al owner.
3. **Verifica con typecheck**: ejecuta `npm run lint:server` (backend) o `npm run lint` (frontend) tras tus cambios. Si rompe, arréglalo.
4. **Reporta exhaustivamente** en PROGRESS.md: qué archivos tocaste, qué cambiaste, qué verificaste, qué quedó pendiente.
5. **Snake_case en wire**: API responde en snake_case. Solo el frontend normaliza a camelCase via la capa nueva.
6. **Sin `getDb()`**: si lo encuentras en tu código, elimínalo. Usa `getSupabaseAdmin()` o `getSupabaseAdminScoped(tenantId)`.
7. **Idempotencia**: cualquier handler de jobs/cron/webhook debe ser idempotente.

## Reglas para evitar conflictos entre agentes

| Archivo | Owner único | Notas |
|---|---|---|
| `vercel.json` | yo (foundation) | ya hecho |
| `server/index.ts` | yo (foundation) | ya hecho |
| `src/api/client.ts` | Flow 2 (Dashboard) | otros agentes leen, no editan |
| `src/types.ts` | Flow 2 (Dashboard) | |
| `src/api/normalize.ts` | Flow 2 (Dashboard) | nuevo archivo |
| `package.json` | yo (foundation) | ya hecho — better-sqlite3 removido |
| `server/queue/worker.ts` | Flow 5 (Worker) | |
| `server/queue/scheduledJobs.ts` | Flow 6 (Scheduler) | |
| `server/routes/internal.ts` | Flow 5 (Worker), extiende Flow 6 | |
| migrations/ | yo (foundation) ya creada | si necesitas más, créala con timestamp posterior |

Si dos agentes colisionan, gana el que tiene ownership en esta tabla.
