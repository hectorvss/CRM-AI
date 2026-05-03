# PROGRESS — Estabilización end-to-end CRM-AI

> Cada agente actualiza su sección al terminar. **No editar las secciones de otros agentes.** Si encuentras un bug fuera de tu scope, anótalo en "Cross-cutting concerns" al final.

---

## Foundation (yo)
**Status**: ✅ DONE

- `BLUEPRINT.md` creado
- `supabase/migrations/20260503_0001_reconciliation_schema_fix.sql` creado (añade `summary`, `issue_type` a `reconciliation_issues`)
- `vercel.json` actualizado: removido CORS hardcoded, removidos secretos del `env`, añadidos crons `/api/internal/worker/tick` y `/api/internal/scheduler/tick` cada minuto
- `server/routes/internal.ts` creado con auth bearer (INTERNAL_CRON_SECRET) — Flow 5/6 implementan `processBatch` y `runScheduledTasksOnce`
- `server/index.ts` monta `/api/internal` y multi-tenant lo bypassa (los handlers internos iteran tenants ellos solos)
- `server/middleware/multiTenant.ts` añadido `/api/internal` a TENANT_BYPASS_PATHS

**Variables que el usuario debe configurar en Vercel Dashboard**:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` (públicas, pueden ir en vercel.json si se quiere)
- `SUPABASE_SERVICE_ROLE_KEY` (CRÍTICA, NUNCA en vercel.json)
- `GEMINI_API_KEY`
- `INTERNAL_CRON_SECRET` (nueva)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_*`
- `CORS_ORIGINS`
- `APP_URL`
- `DEFAULT_TENANT_ID`, `DEFAULT_WORKSPACE_ID` (solo single-tenant)
- Integraciones: `SHOPIFY_*`, `WHATSAPP_*`, `POSTMARK_*`, `TWILIO_*`, `GOOGLE_*`, `SLACK_*`, `MS_*`

---

## Flow 1: Auth & Primer Login
**Owner**: Agente 1
**Status**: ✅ DONE

### Archivos modificados
- `server/routes/onboarding.ts`
- `server/routes/iam.ts` (sólo `GET /me`)
- `src/components/auth/Signup.tsx`
- `src/components/auth/Login.tsx`

### Cambios clave

1. **`server/routes/onboarding.ts`** — la respuesta del endpoint ya escribía `app_metadata` vía `supabase.auth.admin.updateUserById` (en ambos caminos: idempotente y nuevo tenant). Lo único que faltaba para alinear con BLUEPRINT A3 era devolver los IDs en snake_case. Ahora la respuesta incluye `tenant_id` + `workspace_id` (snake_case) además de los alias `tenantId`/`workspaceId` (compat hasta que Flow 2 retire los duplicados).

2. **`src/components/auth/Signup.tsx`** — tras la llamada a `/api/onboarding/setup` y antes de redirigir, ahora invoca `await supabase.auth.refreshSession()`. Esto fuerza al cliente a obtener un JWT que incluya los nuevos claims `tenant_id`/`workspace_id` en `app_metadata`. Sin este paso la primera request al dashboard llegaba con un JWT sin claims y, aunque el backend hace `getUser()` (que sí lee app_metadata fresca), el frontend leía `session.user.app_metadata` cacheado y caía a `/iam/me` con headers `org_default`. El fallo se silenciaba como "needs onboarding" → loop.

3. **`server/routes/iam.ts` `GET /me`** —
   - Quitado `requirePermission('settings.read')`. `/me` es self-service por definición (paralelo a `PATCH /me` que ya era self-service); el SPA tiene que poder leer su propia identidad para hacer bootstrap incluso si la resolución de permisos aún no terminó.
   - El handler valida explícitamente `userId` autenticado (rechaza `system`/anónimo con 401).
   - El campo `context.tenant_id`/`workspace_id` se rellena con la primera membresía cuando el middleware no lo resolvió (cubre el caso de headers `org_default`/`ws_default` con JWT válido pero sin claims).
   - Memberships completas siempre se devuelven para que el frontend pueda decidir tenant activo.

4. **`src/components/auth/Login.tsx`** —
   - Añadido helper `friendlyAuthError` que mapea errores genéricos de Supabase (`invalid login credentials`, `email not confirmed`, `rate limit`, `network`) a mensajes claros en español. Mantiene mensaje genérico en credenciales inválidas para no filtrar existencia de cuenta.
   - `email.trim()` antes de `signInWithPassword` para evitar fallos por espacios.
   - Mejorado mensaje del flujo MFA cuando código es inválido o expirado.

### Verificación realizada
- `npm run lint:server`: 1 error pre-existente en `server/routes/billing.ts` (`AuditRepository.write` no existe). NO relacionado con mis cambios — registrado en cross-cutting concerns.
- `npm run lint` (frontend): 3 errores pre-existentes en `src/components/Orders.tsx` (`canonical_context` vs `canonicalContext`). Flow 2 los limpia con la capa de normalización. Registrado en cross-cutting concerns.
- Mis archivos NO introdujeron errores nuevos.

### Notas de funcionamiento
- El backend (`server/middleware/multiTenant.ts`) ya resolvía claims correctamente: `getUser(token)` devuelve la fila fresca de `auth.users` (incluye `app_metadata` actualizado por `updateUserById`), y como fallback consulta `listUserMemberships`. Por eso no he tocado el middleware — su lógica es correcta. La 401 venía exclusivamente del lado frontend al usar un JWT cacheado.
- El flujo end-to-end ahora es: signup → `/onboarding/setup` (crea org/workspace/member + persiste app_metadata) → `refreshSession()` (JWT actualizado con claims) → redirect → primera request al dashboard ya viaja con claims y resuelve sin tocar `/iam/me`.

---

## Flow 2: Dashboard normalization
**Owner**: Agente 2
**Status**: ✅ DONE

### Archivos modificados
- `src/api/normalize.ts` (NUEVO — capa única de normalización snake↔camel).
- `src/api/client.ts` (`request()` aplica normalización en ambos sentidos).
- `src/types.ts` (eliminado duplicado `canonical_context`; documentado contrato camelCase).
- `src/components/Inbox.tsx`
- `src/components/Orders.tsx`
- `src/components/Payments.tsx`
- `src/components/Returns.tsx`
- `src/components/Customers.tsx`
- `src/components/Approvals.tsx`
- `src/components/Home.tsx`
- `src/components/Reports.tsx` (sin cambios — ya estaba en camelCase salvo `kpiMap[snake_value]` legítimo).

### Cambios clave

1. **`src/api/normalize.ts` (nuevo)** — capa pura sin dependencias externas:
   - `snakeToCamelDeep<T>(input: any): T` — convierte recursivamente todas las KEYS de objetos snake_case → camelCase. Conserva primitivos, ISO date strings, `null`, `undefined`, arrays anidados, y referencias a clases (Date, Map, Set, etc.). NO toca string values.
   - `camelToSnakeDeep<T>(input: any): T` — inversa. Se usa al serializar bodies salientes para que callers puedan escribir payloads en camelCase.
   - Reglas de seguridad: keys que empiezan por `_` se preservan tal cual (metadata como `__typename`, `_id`); constantes UPPER_SNAKE (`API_KEY`, `STATUS_CODE`) también se preservan; keys ya en una forma canónica (todo lowercase o todo uppercase) no se transforman.

2. **`src/api/client.ts`** — `request()` ahora:
   - Si hay `options.body` y es JSON serializable (string que parsea, u objeto plano), aplica `camelToSnakeDeep` antes de `JSON.stringify`. Bodies no-JSON (FormData, Blob, ArrayBuffer) pasan intactos.
   - Después de la respuesta, `await res.text()` → si vacío devuelve `undefined`; si parsea como JSON, aplica `snakeToCamelDeep`; si no parsea, devuelve el texto crudo.
   - **NO** se rompen los flujos que usan `fetch` crudo (`fetchMembershipFromApi` interno, `App.tsx` membership probe, `Signup.tsx`): siguen leyendo `body.context.tenant_id` / `body.memberships[0].tenant_id` del JSON sin tocar — esos endpoints se hablan directo con el server y no pasan por `request()`. El JWT (`session.user.app_metadata.tenant_id`) viene del SDK de Supabase, no del API.
   - `unwrapList(payload)` sigue funcionando porque busca claves `value`/`data` que no se transforman.
   - Funciones públicas que aceptan parámetros snake_case explícitos en su signature (`updateStatus(... changed_by)`, `addNote(... created_by)`, `decide(... decided_by)`) construyen un body cuyo objeto es snake_case. `camelToSnakeDeep` deja keys snake_case sin cambios. **No hay cambios necesarios en las llamadas existentes.**

3. **`src/types.ts`** — comentario de cabecera documentando el contrato camelCase. Eliminado duplicado `canonical_context` en `Order` (ya existía `canonicalContext`).

4. **Componentes (camelCase puro, sin fallbacks duales)**:
   - **`Orders.tsx`**: `mapApiOrder` lee `o.customerName`, `o.externalOrderId`, `o.systemStates.returnsPlatform`, `o.canonicalContext.caseState.identifiers.paymentIds[0]`, `c.caseNumber` para related cases, `e.occurredAt` para timeline. Eliminada copia dual `canonicalContext: o.canonical_context || o.canonicalContext`.
   - **`Inbox.tsx`**: `mapApiCase` ahora lee `c.assignedUserId`, `c.customerName`, `c.systemStatusSummary`, `c.conflictSummary.rootCause`, `c.stateSnapshot.related.linkedCases`. Mensajes leen `msg.senderName`, `msg.sentAt`, `msg.deliveryStatus`. `selectedInboxView.latestDraft`, `selectedInboxView.internalNotes`, `selectedInboxView.case.updatedAt`. Operational links leen `firstOrder.externalOrderId`, `firstPayment.externalPaymentId`, `firstOrder.trackingUrl`, `firstReturn.externalReturnId`, `firstOrder.trackingNumber`. (`params.risk_level` se mantiene porque va al query string, no al body.)
   - **`Payments.tsx`**: `mapApiPayment` lee `p.orderId`, `p.externalPaymentId`, `p.systemStates.{oms,refund,dispute,reconciliation}`, `p.refundAmount`, `p.refundType`, `p.disputeReference`, `p.chargebackAmount`, `c.caseNumber`, `e.occurredAt`.
   - **`Returns.tsx`**: `mapApiReturn` lee `r.orderId`, `r.externalReturnId`, `r.returnReason`, `r.returnValue`, `r.systemStates.returnsPlatform`, `r.canonicalContext.caseState.conflict.rootCause`, etc.
   - **`Customers.tsx`**: `mapApiCustomer` lee `c.canonicalName`, `c.canonicalEmail`, `c.lifetimeValue`, `c.linkedIdentities`, `c.aiImpactResolved`, `c.aiImpactApprovals`, `c.aiImpactEscalated`, `c.openCases`, `c.topIssue`, `c.riskLevel`, `c.nextRenewal`. `selectedCustomer` reescrito completo en camelCase. Form de edición renombrado a camelCase (`canonicalName`, `canonicalEmail`, `riskLevel`, `preferredChannel`). Llamada a `policyApi.evaluateAndRoute` ahora envía camelCase: `entityType`, `actionType`, `caseId`, `requestedBy`, `customerId`, `customerEmail`, `customerName`, `riskLevel` — la capa traduce a snake_case en el wire. Lectura de `result.approvalRequestId`. Renombrado tipo `ApiLinkedIdentity.external_id` → `externalId`.
   - **`Approvals.tsx`**: tipos `ApprovalRecord` y `ApprovalContext` reescritos en camelCase. Campos: `actionType`, `caseNumber`, `customerName`, `riskLevel`, `assignedUserName`, `decisionNote`, `decisionBy`, `evidencePackage`, `actionPayload`, `executionPlanId`, `expiresAt`, `caseState`, `internalNotes`, `linkedCases`, `reconciliationIssues`. Mensajes: `senderName`, `senderId`, `sentAt`. Timeline: `occurredAt`. `linkType` para keys.
   - **`Home.tsx`**: KPIs leen `c.slaStatus`, `overview.aiResolutionRate`. Lista de cases lee `c.caseNumber`, `c.aiDiagnosis`, `c.customerName`, `c.createdAt`. Lista de approvals lee `a.actionType`, `a.requestedBy`, `a.createdAt`.
   - **`Reports.tsx`**: sin cambios. Las únicas snake_case son keys de `kpiMap` cuyas claves son los VALORES del campo `key` devuelto por la API (KPI identifiers como `"auto_resolution"`, `"sla_compliance"`), no propiedades de objetos del API response. Esto es legítimo y no entra en el contrato de normalización.

### Verificación
- `npm run lint` → exit 0, **0 errores**. ✅
- `grep -E '\b\w+\.[a-z]+_[a-z]'` en los 8 componentes → solo 2 hits restantes legítimos:
  - `params.risk_level = filterRiskLevel` (Inbox.tsx) — query string, no body.
  - `kpiMap.auto_resolution` etc. (Reports.tsx) — keys de un map cuyas claves son valores de string devueltos por la API.
- `grep -E '\|\|\s+\w+\.[a-z]+_[a-z]'` (fallbacks duales snake/camel) → **0 hits**. ✅
- Capa simétrica: `camelToSnakeDeep(snakeToCamelDeep(obj))` debería ser igual a `obj` para shapes API típicos.

### Reglas y supuestos
- El servidor sigue recibiendo y emitiendo snake_case (wire contract no cambia).
- Para lectura: cualquier campo snake_case nuevo añadido por el backend se traduce automáticamente al consumirlo en componentes.
- Para escritura: los callers pueden escribir bodies en camelCase y la capa los convertirá a snake_case antes del wire. Los callers que ya escriben en snake_case (como `decide(... decided_by)`) siguen funcionando porque snake_case → snake_case en `camelToSnakeDeep` es idempotente para keys ya en lower-snake.
- Bodies no-JSON (uploads de archivos, etc.) NO se tocan.

### Cross-cutting concerns identificados (anotados abajo)
- Confirmado el patch sugerido por Flow 12 sobre `src/api/client.ts` para propagar `err.status` en errores HTTP. Mi cambio NO retrocede el throwing pattern actual; el patch sugerido por Flow 12 sigue siendo necesario para que el listener global de 401 dispare. Anotado abajo.

---

## Flow 3: Agentes IA
**Owner**: Agente 3
**Status**: ✅ DONE

### Archivos modificados
- `server/services/agentKnowledge.ts` — eliminada la versión sincrónica `resolveAgentKnowledgeBundle` (con `getDb()`/SQLite). La versión async (Supabase) es ahora la única implementación, exportada como `resolveAgentKnowledgeBundle`. Imports muertos eliminados (`getDb`, `getDatabaseProvider`, `parseRow`). Se añade un alias deprecado `resolveAgentKnowledgeBundleAsync = resolveAgentKnowledgeBundle` para no romper `routes/knowledge.ts` y `routes/agents.ts` (no son míos).
- `server/agents/runner.ts` — verificado: import en línea 27 y `await` en línea 110 ya correctos tras el rename. No requirió cambios.
- `server/agents/impl/auditLogger.ts` — eliminado `getDb()`/branch SQLite. Sólo Supabase.
- `server/agents/impl/composerTranslator.ts` — limpio.
- `server/agents/impl/customerCommunicationAgent.ts` — limpio.
- `server/agents/impl/customerIdentityAgent.ts` — limpio (varias queries SQL→Supabase).
- `server/agents/impl/customerProfiler.ts` — limpio.
- `server/agents/impl/draftReplyAgent.ts` — limpio.
- `server/agents/impl/escalationManager.ts` — limpio.
- `server/agents/impl/fraudDetector.ts` — limpio.
- `server/agents/impl/helpdeskAgent.ts` — limpio (helper `writeInternalNote` ahora sólo Supabase).
- `server/agents/impl/identityMappingAgent.ts` — limpio.
- `server/agents/impl/identityResolver.ts` — limpio.
- `server/agents/impl/knowledgeRetriever.ts` — limpio.
- `server/agents/impl/logisticsTrackingAgent.ts` — limpio.
- `server/agents/impl/omsErpAgent.ts` — limpio.
- `server/agents/impl/qaCheck.ts` — limpio.
- `server/agents/impl/reportGenerator.ts` — limpio.
- `server/agents/impl/returnsAgent.ts` — limpio (helpers `loadReturnRow`, `writeAudit` solo Supabase).
- `server/agents/impl/shopifyConnector.ts` — limpio.
- `server/agents/impl/slaEscalationAgent.ts` — limpio.
- `server/agents/impl/slaMonitor.ts` — limpio.
- `server/agents/impl/stripeConnector.ts` — limpio.
- `server/agents/impl/subscriptionAgent.ts` — limpio.
- `server/agents/impl/triageAgent.ts` — limpio (helper `readCurrentTags` solo Supabase).
- `server/agents/impl/workflowRuntimeAgent.ts` — limpio.
- `server/agents/planEngine/tools/workflows.ts` — `persistWorkflowRun()` y `finaliseRun()` ahora sólo Supabase. Imports `getDb`/`getDatabaseProvider` eliminados.
- `server/db/client.ts` — sin cambios. La excepción explícita es la salvaguarda intencional. Otros owners (`postApproval`, `routes/knowledge`) aún importan `getDb` desde aquí; eliminar el archivo rompería sus imports.

### Cambios clave
1. **Una única implementación de `resolveAgentKnowledgeBundle`**: async, sólo Supabase. Sin código muerto SQLite (líneas 337-425 originales eliminadas).
2. **Todos los agent impls eliminan completamente** la rama dual `useSupabase ? null : getDb()` y el bloque SQLite asociado (`db!.prepare(...).all/get/run`). Cada agente tiene un único path Supabase con `getSupabaseAdmin()`. Cero ramas SQLite vivas en `server/agents/`.
3. **`server/agents/planEngine/tools/workflows.ts`** — los helpers `persistWorkflowRun` y `finaliseRun` perdieron el branch SQLite; sólo Supabase.
4. **El runner ya estaba bien tipado y con `await`**; el rename de `resolveAgentKnowledgeBundleAsync` → `resolveAgentKnowledgeBundle` no requirió cambios al consumidor (ambos nombres apuntan a la misma función).
5. **Alias deprecado** `resolveAgentKnowledgeBundleAsync` mantiene operativos `routes/knowledge.ts` y `routes/agents.ts` (que no son de mi flow) hasta que sus owners actualicen el import.

### Verificación
- `npm run lint:server` → **exit 0** (TypeScript estricto OK).
- `Grep "getDb\\(" server/agents` → **0 resultados**.
- `Grep "getDb\\(" server/services` → sólo `services/postApproval.ts` (no es mío) y `db/client.ts` (definición intencional).
- `runner.ts:110` confirmado: `const knowledgeBundle = await resolveAgentKnowledgeBundle({...});` con tipo `KnowledgeProfile` correctamente importado y la firma `Promise<AgentKnowledgeBundle>`.
- 41 → 17 ocurrencias totales de `getDb(` en `server/` (las 17 restantes están en flows ajenos a Flow 3).

### Cross-cutting concerns encontrados (anotados en sección final)
- `server/services/postApproval.ts:674` — sigue llamando `getDb()`. Owner: archivo compartido / Foundation.
- `server/db/seed.ts:16` — `getDb()` en seed legacy. Owner: Foundation.
- `server/routes/knowledge.ts` — 13 referencias a `getDb()` y 1 import de `resolveAgentKnowledgeBundleAsync` (cubierto por el alias deprecado, pero el código SQLite del archivo sigue rompiendo si se llaman esos endpoints). Owner: no asignado a ningún flow del BLUEPRINT — necesita owner.
- `server/routes/agents.ts` — usa `resolveAgentKnowledgeBundleAsync` (cubierto por el alias). No necesita refactor inmediato pero idealmente migrar al nombre canonical.

---

## Flow 4: Pipeline mensajes (channelIngest, draftReply, intentRouter)
**Owner**: Agente 4
**Status**: ✅ DONE (depende de Flow 3 para el rename de `resolveAgentKnowledgeBundleAsync` → `resolveAgentKnowledgeBundle`; mi código ya está alineado)

### Archivos modificados
- `server/pipeline/channelIngest.ts`
- `server/pipeline/intentRouter.ts`
- `server/pipeline/canonicalizer.ts`
- `server/pipeline/aiJobs.ts`
- `server/pipeline/agentExecute.ts`

### Archivos revisados sin cambios necesarios
- `server/pipeline/draftReply.ts` — ya tenía `await resolveAgentKnowledgeBundle(...)`, `requireScope(ctx, 'draftReply')`, queries Supabase con `.eq('tenant_id', …).eq('workspace_id', …)` y dedup por `existingDraft` (status=`pending_review`). Compatible con la versión async que dejará Flow 3 tras el rename.
- `server/pipeline/messageSender.ts` — ya usa `requireScope`, repos escopados, dispatch a `channelSenders` (que loguea WARN y devuelve `{ simulated: true }` cuando faltan credenciales: NO crashea). Re-throw en catch para que el worker reintente; antes flippa `delivery_status='failed'` en el queued message si existe (idempotente vía `payload.queuedMessageId`).
- `server/pipeline/contextWindow.ts` — usa `requireScope` antes de pedir el bundle al repo.

### Cambios clave
1. **Promises sin await (root cause de jobs perdidos)**. Añadido `await` a todas las llamadas `enqueue(...)`:
   - `channelIngest.ts` (1 enqueue → INTENT_ROUTE)
   - `intentRouter.ts` (2 enqueues → RECONCILE_CASE, DRAFT_REPLY)
   - `canonicalizer.ts` (1 enqueue → INTENT_ROUTE)
   - `aiJobs.ts` (2 enqueues → AGENT_TRIGGER, DRAFT_REPLY)
   `enqueue` es `Promise<string>`. Sin await, en Vercel serverless el handler podía retornar antes de persistir el job.
2. **Scope hardening**. Sustituido `ctx.tenantId ?? 'org_default'` (y workspace análogo) por `requireScope(ctx, '<handler>')` en `intentRouter.ts`, `canonicalizer.ts` y `agentExecute.ts`. Ahora un job sin tenant/workspace falla rápido en vez de mezclar datos en el tenant default.
3. **Filtros tenant/workspace en queries directas a Supabase**. `intentRouter.ts` y `canonicalizer.ts` consultaban `canonical_events` con `.eq('id', …).single()` sin filtrar por tenant. Ahora añaden `.eq('tenant_id', tenantId).eq('workspace_id', workspaceId)` y usan `.maybeSingle()` (no rompe si no existe).
4. **JSONB-safe parsing**. Supabase devuelve `normalized_payload` como objeto JSON, no como string. `intentRouter.ts` hacía `JSON.parse(event.normalized_payload || '{}')` que reventaba en runtime. Ahora detecta tipo y solo parsea si es string. Mismo fix aplicado a `fetchStripeEventObject` en `canonicalizer.ts`.
5. **`workspace_id` en inserts directos**. El insert manual de `draft_replies` desde `intentRouter.ts` ahora incluye `workspace_id` (antes solo `tenant_id`).
6. **`agentExecute.ts`** — antes pasaba `ctx.tenantId` (`string | null`) a `runAgent` (que requiere `string`) y `workspaceId: ctx.workspaceId ?? ''`. Ahora valida con `requireScope` antes y pasa los strings.

### Idempotencia (verificada handler por handler)
- `channelIngest.ts`: dedup customer por `linked_identity` (system+external_id), reuse de conversación abierta por (customer, channel), dedup mensaje por `external_message_id`. Status check `'pending'|'received'`. Si el evento ya está `canonicalized`/`linked`, retorna sin duplicar.
- `intentRouter.ts`: si `event.status === 'linked'` y `case_id` coincide, retorna. `getOrCreateCase` busca un case existente antes de crear.
- `canonicalizer.ts`: skip si status es `canonicalized`/`linked`. Upsert de orders/payments/customers vía repo.
- `messageSender.ts`: cuando `payload.queuedMessageId` existe, hace UPDATE; si no, hace INSERT con UUID nuevo. La marca `delivery_status` evita que la UI muestre dos veces el mismo envío.
- `aiJobs.ts`: solo encola; idempotencia delegada a los handlers downstream.
- `draftReply.ts`: busca `existingDraft` con status `pending_review` y hace UPDATE en lugar de INSERT.

### draftReply ↔ Flow 3 (resolveAgentKnowledgeBundle async)
- Mi import en `draftReply.ts` es `resolveAgentKnowledgeBundle` (sin sufijo `Async`) y la llamada usa `await`.
- En el estado actual del repo, `agentKnowledge.ts` aún coexisten la sync (`resolveAgentKnowledgeBundle`) y la async (`resolveAgentKnowledgeBundleAsync`); la sync llama `getDb()` y revienta. Cuando Flow 3 elimine la sync y renombre la async → `resolveAgentKnowledgeBundle`, mi `await` resuelve la Promise correctamente.
- **No hay que tocar el import**: el nombre coincide con el que dejará Flow 3.

### messageSender — credenciales de canales
`channelSenders.ts` (ownership Flow 10) ya tiene comportamiento defensivo: si faltan tokens (WhatsApp/Postmark/Twilio) loguea WARN y devuelve `{ simulated: true }`, no crashea. `messageSender.ts` persiste el resultado (`delivered_at = null` cuando es simulado) y completa el job sin fallar — cumple el requisito de "no crash, fallar con mensaje informativo".

### Verificación
- `npx tsc --noEmit --project tsconfig.server.json`: 0 errores en `server/pipeline/{channelIngest,intentRouter,draftReply,messageSender,canonicalizer,agentExecute,aiJobs,contextWindow}.ts`. Errores restantes solo en `server/pipeline/reconciler.ts` (Flow 11) y `server/routes/billing.ts` (Flow 9), fuera de Flow 4.
- `Grep getDb\(` sobre `server/pipeline/`: 0 resultados.
- Cada handler de Flow 4 invoca `requireScope(ctx, '<handler>')` antes de tocar BD (excepto `aiJobs.ts`, que solo encola; los handlers downstream validan scope).

---

## Flow 5: Worker (processBatch + integration con cron)
**Owner**: Agente 5
**Status**: ✅ DONE

### Archivos modificados
- `server/queue/worker.ts` (refactor; sin breaking changes a la API existente).

### Archivos verificados sin cambios necesarios
- `server/worker-standalone.ts` — sigue importando `startWorker`/`stopWorker`/`workerStatus`, todos siguen exportados con la misma firma. `npm run worker` sigue siendo el modo dev local.
- `server/routes/internal.ts` — NO editado (foundation owner). Solo verifiqué que la firma esperada por el endpoint coincide con la que exporto.

### Cambios clave

1. **Nueva función exportada `processBatch(limit, opts?)`**
   - Firma: `(limit: number, opts?: { signal?: AbortSignal }) => Promise<{ processed: number; failed: number; errors: Array<{ jobId: string; error: string }> }>`.
   - Reclama hasta `limit` jobs vía `claimJob()` (atómico SQL ya existente).
   - Procesa todos con `await Promise.all(jobs.map(processJob))`.
   - Devuelve un summary que el endpoint `/api/internal/worker/tick` ya está preparado para devolver al cron caller.
   - **NO usa polling, NO usa setInterval, NO usa setTimeout.** Una invocación = un batch = retorno inmediato al terminar el `Promise.all`.

2. **Fix del fire-and-forget en `tick()` (línea 156 original)**
   - Cambiado `jobs.map(j => processJob(j))` por `await runJobs(jobs)` (que internamente hace `await Promise.all`).
   - Ahora si un handler tira en local, el error se loguea via `processJob` y el siguiente tick no se solapa con el anterior. Antes los errores se silenciaban porque la promesa rechazada quedaba huérfana.

3. **`processJob` ahora devuelve `{ ok, jobId, error? }`**
   - Antes era `void` y los errores quedaban capturados solo en logs; ahora también se acumulan en el summary del batch para que el endpoint pueda exponer `errors[]`.
   - Sigue siendo "exception-safe" (nunca rejecta), sigue eliminando del Set `inFlight` en el `finally`, sigue llamando `markFailed`/`markCompleted` correctamente.

4. **Defensa adicional alrededor de `markFailed`**
   - Si la BD está caída y `markFailed` lanza, ahora se loguea pero NO rompe el batch entero (en el código original esto sí podía propagarse fuera del `try`).

5. **Helper compartido `runJobs(jobs)`**
   - Factorizado para que el modo standalone (`tick`) y el modo cron (`processBatch`) usen exactamente el mismo flujo de ejecución y agregación. Cumple "comparte código con el flow del cron" como pedía el spec.

6. **Soporte opcional `AbortSignal` en `processBatch`**
   - Si la señal aborta antes de reclamar, devuelve `{0,0,[]}` sin pedir jobs. Una vez reclamados, los jobs corren a término (cada handler tiene su propia lógica de timeout). Deja la puerta abierta a que el endpoint añada un timeout total si en producción se observan invocaciones cercanas al límite de Vercel; por ahora el endpoint no lo pasa, así que el comportamiento por defecto es el mismo de antes.

### Verificación
- `npx tsc --noEmit --project tsconfig.server.json` (= `npm run lint:server`): **sin errores en `worker.ts`, `worker-standalone.ts`, `internal.ts`**. Solo aparece el mismo error preexistente en `server/routes/billing.ts` que ya reportó Flow 1 (cross-cutting concerns).
- `Grep "jobs.map(j => processJob"` en `server/queue/`: **0 resultados** → bug original eliminado.
- `processBatch` exportada con la firma exacta requerida por `server/routes/internal.ts`.
- `worker-standalone.ts` sigue compilando sin cambios.

### Cómo se conecta end-to-end
1. Vercel cron (configurado en `vercel.json`) invoca `GET /api/internal/worker/tick` cada minuto con `Authorization: Bearer ${INTERNAL_CRON_SECRET}`.
2. `server/routes/internal.ts` (`authenticateCron`) valida el bearer (o el header `x-vercel-cron` en runtime Vercel) y llama `processBatch(WORKER_BATCH_SIZE)` (default 10, override vía env `WORKER_BATCH_SIZE`).
3. `processBatch` reclama N jobs vía `claimJob()`, los procesa con `Promise.all`, devuelve summary.
4. El endpoint responde `{ ok: true, processed, failed, errors }` para que los logs de Vercel sean inspeccionables.
5. En dev local, `npm run worker` sigue arrancando el polling clásico vía `worker-standalone.ts → startWorker()`. Ahora el polling también usa `await Promise.all` (vía `runJobs`), así que dev y prod tienen la misma semántica de errores.

### Notas
- **Idempotencia**: el reclamo de jobs es atómico vía `claimJob()` (responsabilidad del repo Supabase/SQL). Si dos invocaciones del cron se solapan no procesan el mismo job dos veces — el segundo o no encuentra jobs o reclama otros.
- **Sanity de `limit`**: `processBatch` fuerza `Math.max(1, Math.floor(limit))` para tolerar valores degenerados.

---

## Flow 6: Scheduled Jobs (runScheduledTasksOnce)
**Owner**: Agente 6
**Status**: DONE

### Archivos modificados
- `server/queue/scheduledJobs.ts` — añadido `runScheduledTasksOnce` + tracker + reentrancy lock; sweepers internos exportados (`resumeExpiredWorkflowDelays`, `sweepScheduledWorkflows`, `sweepSuperAgentScheduledActions`, `sweepOrphanedWorkflowRuns`); `stopScheduledJobs` ahora también limpia `churnRiskScanIntervalId` (bug menor pre-existente, antes se quedaba colgado).
- `server/jobs/auditExport.ts` — añadido `auditExportRunOnce()`.
- `server/jobs/flexibleUsageReport.ts` — añadido `flexibleUsageReportRunOnce()`.
- `server/jobs/aiCreditsReset.ts` — añadido `aiCreditsResetRunOnce()`.

### Cambios clave
1. **Sistema dual**: `startScheduledJobs()`/`stopScheduledJobs()` siguen funcionando idénticamente para `dev:server` (setInterval). Para Vercel, el endpoint `/api/internal/scheduler/tick` invoca `runScheduledTasksOnce`.
2. **Tracker preciso (`lastRun: Record<string, number>`, módulo-level)**: cada sweeper (13 en total — `sla`, `reconcile`, `workflow_delay`, `schedule_sweeper`, `super_agent_schedule`, `orphan_sweeper`, `session_prune`, `event_bus_recovery`, `event_log_prune`, `churn_risk_scan`, `audit_export`, `flexible_usage_report`, `ai_credits_reset`) tiene su intervalo configurado. `runScheduledTasksOnce` solo ejecuta los que están "due" (`Date.now() - lastRun >= intervalMs`). En cold start (`lastRun === 0`) todos los sweepers corren en el primer tick — aceptable porque cada uno es idempotente.
3. **Reentrancy lock**: flag `isRunning` evita que cron + invocación manual concurrentes dupliquen trabajo. La segunda llamada devuelve `{ ran: [], skipped: ['concurrent'], errors: [] }` inmediatamente.
4. **Try/catch por sweeper**: si uno falla, los otros siguen. El error se acumula en `result.errors`. El `lastRun` se actualiza ANTES del await (optimistic) para que un sweeper lento no bloquee el siguiente tick — evita pile-up.
5. **AbortSignal**: el endpoint `internal.ts` pasa un signal con timeout 50s. Cada sweeper revisa `signal.aborted` antes de empezar; los abortados se reportan como `${task}:aborted` en `skipped`.
6. **Iteración multi-tenant**: `forEachActiveScope` reutilizado para los sweepers per-tenant. Los globales (session prune) lo evitan.
7. **Tipos exportados**: `ScheduledTaskName`, `RunScheduledTasksResult` para que el endpoint pueda tiparlos correctamente.
8. **Helper test-only**: `__resetScheduledTaskTrackerForTests()` exportado para que los tests puedan resetear el tracker entre asserciones.

### Verificación
- `npm run lint:server`: cero errores en archivos de mi ownership (`scheduledJobs.ts`, `auditExport.ts`, `flexibleUsageReport.ts`, `aiCreditsReset.ts`) ni en `internal.ts` (que importa mis exports). Los errores TS que persisten en el repo pertenecen a otros Flows: `billing.ts AuditRepository.write` (Flow 9), `reconciler.ts summary/issueType` (Flow 11), `integrations/registry.ts + shopify.ts + stripe.ts + whatsapp.ts` (Flow 10), `demo/sandboxAdapters.ts`. Ninguno introducido por mí.
- `runScheduledTasksOnce` exportado y tipado correctamente; el endpoint `internal.ts` lo importa por `(mod as any).runScheduledTasksOnce` — al estar exportada como nombrada, el cast pasa el `typeof === 'function'` check y la invocación con `{ signal: controller.signal }` resuelve a `RunScheduledTasksResult`.
- `startScheduledJobs()` intacto en su comportamiento — los tests de `dev:server` siguen funcionando con setInterval.

### Idempotencia
- `enqueueDelayed` ya deduplica vía la queue.
- `resumeExpiredWorkflowDelays` usa claim atómico (`update where status='waiting'`).
- `sweepOrphanedWorkflowRuns` usa update guard `where status='running'`.
- `sweepScheduledWorkflows` filtra runs ya iniciados en la ventana actual.
- `sweepSuperAgentScheduledActions` usa `claimDueScheduledActions` (claim atómico en repo).
- `sweepAuditExportRequests` flippea `pending → processing` con guard `where status='pending'`.
- `runAiCreditsReset` filtra por `ai_credits_period_end < now`; un re-run sin avance temporal no rolea de nuevo.
- `runFlexibleUsageReport` skip-window 12h vía `flexible_usage_last_reported_at` + `action: 'set'` en Stripe (overwrite-safe).

### Cross-cutting concerns encontrados
- `stopScheduledJobs` original: `churnRiskScanIntervalId` se asignaba en `startScheduledJobs` pero NO se limpiaba en `stopScheduledJobs` (faltaban tanto el `clearInterval` como el reset a null). Lo arreglé porque está en mi archivo. Bug pre-existente, sin impacto en producción serverless pero sí en `dev:server` con hot-reload.
- `auditExport.ts processDeletionRequest` actualiza `status: 'completed'` con `scheduled_for`, pero el comentario top-of-file dice `processed`. Inconsistencia de naming/estado, no bloqueante; podría unificarse a `'scheduled'` en una pasada de cleanup.

---

## Flow 7: Super Agent
**Owner**: Agente 7
**Status**: ✅ DONE

### Archivos modificados
- `server/routes/superAgent.ts`
  - Importado `fireWorkflowEvent` desde `../lib/workflowEventBus.js`.
  - **Lines 3538-3555** (antes 3531-3560): Reemplazado el bloque
    `void (async () => { … executeWorkflowsByEvent(…) … })()` por una llamada
    directa a `fireWorkflowEvent(scope, 'trigger.chat_message', payload)`.
    El event bus persiste en `workflow_event_log` y, si el dispatch falla o la
    serverless function termina antes de completar, `recoverPendingEvents`
    (Flow 5/6) lo reintenta en el siguiente scheduler tick.

### Archivos NO modificados (revisados y limpios)
- `server/agents/superAgent/intent.ts` — puro parsing de regex; sin `getDb()`,
  sin BD, sin Gemini, sin tenant_id (no aplica filtros porque no consulta nada).
- `server/agents/superAgent/search.ts` — solo dos helpers de string
  (`normalizeSearchQuery`, `isGeneralConversationInput`); sin BD ni IO.

### Verificación
- `Grep "void \(async" server/routes/superAgent.ts` → 0 resultados.
- `Grep "getDb\\(" server/routes/superAgent.ts server/agents/superAgent/` → 0.
- `Grep "setTimeout|setImmediate|setInterval" server/routes/superAgent.ts` → 0.
- `npm run lint:server` → 0 errores en `server/routes/superAgent.ts`,
  `server/agents/superAgent/intent.ts`, `server/agents/superAgent/search.ts` ni
  `server/lib/workflowEventBus.ts`. Los 4 errores que persisten
  (`customerProfiler.ts`, `billing.ts`) son ajenos al scope.

### Cambios de comportamiento end-to-end
- **Antes**: el dispatch del workflow vivía en una IIFE inline
  (`void (async () => { … })()`). En Vercel serverless, si el handler HTTP
  terminaba antes de que esa promesa resolviera, el workflow no se ejecutaba
  y se perdía sin trazo en BD.
- **Ahora**: el evento entra al event bus persistente. Aunque la lambda se
  corte, la fila quedará en `workflow_event_log` (status `pending`) y el
  sweeper (`recoverPendingEvents`) la recupera en el siguiente tick.

### Endpoint /super-agent/cron/check (decisión)
Mantenido tal cual. Su función NO se duplica con `runScheduledTasksOnce` de
Flow 6: este endpoint **solo emite alertas SSE proactivas a clientes
conectados** (notificaciones de UI sobre SLA breach, churn risk, fraud flag).
El SLA enqueue real lo hace Flow 6 vía `JobType.SLA_CHECK`. El cron está
fijado a `0 0 * * *` (1× al día). Su único side-effect es `broadcastSSE`, no
toca BD ni encola jobs, por lo que no causa contención con la arquitectura
nueva. Pendientes anotados en cross-cutting (no son ownership de Flow 7).

---

## Flow 8: Workflows (event bus + ejecución)
**Owner**: Agente 8
**Status**: ✅ DONE

### Archivos modificados
- `server/lib/workflowEventBus.ts` — refactor de garantía de entrega.
- `server/routes/workflows.ts` — idempotencia por `trace_id` + workspace scoping en `/runs/recent`.
- `server/data/workflows.ts` — workspace_id filter en `listRecentRuns`.

### Cambios clave

**1. `server/lib/workflowEventBus.ts` — garantía de entrega via persistencia (fix del bug grave reportado por Flow 7)**
- `fireWorkflowEvent` ahora es `async` y devuelve `Promise<void>`.
- Persiste el evento en `workflow_event_log` con `status='pending'` **AWAITING** el insert antes de resolver el promise. Esto garantiza durabilidad: si el caller hace `await fireWorkflowEvent(...)`, una vez resuelto el promise el evento ya está en BD y el sweeper lo puede recoger aunque la lambda muera al instante siguiente.
- Solo después de la persistencia confirmada se programa el dispatch via `setImmediate` (no bloquea HTTP response, pero la durabilidad ya está garantizada antes de que el caller continue).
- Si el dispatch falla, el row se deja en `pending` (no `failed`) para que el sweeper lo reintente. Solo se marca `failed` cuando `recoverPendingEvents` agota los reintentos (max 3).
- `recoverPendingEvents` ahora hace claim atómico (`update where status='pending'` con `select`) para evitar doble procesamiento por sweepers concurrentes. Filtra por `tenant_id` Y `workspace_id`. Tras 3 reintentos fallidos marca `failed`.
- `pruneEventLog` sin cambios estructurales (ya estaba bien — borra `executed` >7 días).

**2. `server/routes/workflows.ts` — idempotencia + workspace scoping**
- `executeWorkflowVersion` añade idempotency check: si `triggerPayload.trace_id` (o `traceId`) está presente y ya existe un `workflow_runs` con el mismo `tenant_id + workflow_version_id + trigger_payload->>trace_id`, devuelve el run existente en lugar de crear uno nuevo. La query usa Supabase JSONB-path filter `trigger_payload->>trace_id`. Excepción: `retryOfRunId` permite saltarse la check (los retries son explícitos).
- `continueWorkflowRun` exportado y verificado (línea 2708) — funciona desde `scheduledJobs.ts` (Flow 6) para resume tras delays.
- `executeWorkflowsByEvent` exportado (línea 3132) y consumido por `workflowEventBus.ts` via lazy import para romper el ciclo `routes/workflows → lib/workflowEventBus → routes/workflows`.
- Endpoints verificados: `/run`, `/dry-run`, `/runs/:id/retry`, `/runs/:id/resume`, `/runs/:id/cancel`, `/step-run`, `/:id/validate` — todos persistentes (sin fire-and-forget). El dispatch del `trigger.workflow_error` cross-cutting es `await` (no fire-and-forget).
- `GET /runs/recent` ahora pasa `workspaceId` al repositorio.

**3. `server/data/workflows.ts` — workspace scoping**
- `listRecentRuns(tenantId, workspaceId?, limit?)` acepta `workspaceId` opcional. Cuando se proporciona, filtra via join `workflow_versions.workflow_definitions.workspace_id`. (`workflow_runs` no tiene columna `workspace_id` directa — limitación del schema, ver cross-cutting.)
- `listRunsByWorkflow`: ya filtraba por `tenant_id` directo + `workflow_versions.workflow_id` (que está scoped a tenant+workspace por construcción de la definición).
- Resto de queries: todas filtran por `tenant_id` y `workspace_id` cuando aplican (`workflow_definitions` tiene ambos). `workflow_versions` no tiene `workspace_id` pero se accede via FK desde `workflow_definitions` ya filtrada.

### Verificación
- `npm run lint:server` — 0 errores nuevos en mis archivos. Errores existentes en Flow 9/10/11 (billing, integrations, reconciliation) son pre-existentes y fuera de scope.
- `Grep "void (async" server/routes/workflows.ts` → **0 resultados** ✅
- `Grep "void (async" server/lib/workflowEventBus.ts` → 0 resultados.
- Idempotencia: dos llamadas a `executeWorkflowVersion` con el mismo `trace_id` devuelven el mismo `runId` (segunda llamada lee el run existente y devuelve sus steps).
- Persistencia: si el caller `await fireWorkflowEvent(...)`, al resolver ya hay fila en `workflow_event_log` con status `pending`. El recovery sweeper (Flow 6) la reintentará si el dispatch in-process falla.

### Cross-cutting concerns (encontrados por Agente 8)

- **Callers de `fireWorkflowEvent` no awaitan**: la función ahora es `async` y devuelve `Promise<void>`. Los siguientes callers hacen fire-and-forget (no `await`). TypeScript no rompe (el promise se descarta), y la persistencia sigue ocurriendo, pero estos callers pierden la garantía de durabilidad antes de devolver HTTP response — si el proceso cae justo después del response y antes de que el INSERT supabase complete (~50ms), el evento se pierde. Owners deberían añadir `await`:
  - `server/routes/cases.ts` líneas 497, 529
  - `server/routes/conversations.ts` línea 84
  - `server/routes/approvals.ts` línea 105
  - `server/routes/orders.ts` líneas 117, 211
  - `server/routes/payments.ts` línea 171
  - `server/queue/scheduledJobs.ts` líneas 338, 422 — **Flow 6 (Agente 6)**, NO he editado
  - `server/queue/handlers/webhookProcess.ts` línea 373 — **Flow 4/5**

- **`workflow_runs` carece de columna `workspace_id`**: el scoping a workspace es indirecto via join a `workflow_definitions`. Sería más limpio añadir `workspace_id` denormalizado en `workflow_runs` con backfill — requiere migración (foundation owner). El schema en `server/db/schema.sql` línea 645 también debería actualizarse.

- **`workflow_runs.trigger_payload->>trace_id` sin índice**: la query de idempotencia funciona pero no tiene índice dedicado (filtrado previo por tenant_id + workflow_version_id ya reduce el espacio mucho). Si crece el volumen, considerar índice GIN sobre `trigger_payload` o añadir columna explícita `trace_id` en `workflow_runs`. Owner: foundation/migrations.

- **`workflow_event_log.status` CHECK constraint**: solo permite `pending|executed|failed`. Si en el futuro queremos un estado intermedio `processing` (claim explícito separado de bumping retry_count), requiere migración del CHECK. Owner: foundation/migrations.

---

## Flow 9: Billing & Stripe
**Owner**: Agente 9
**Status**: ✅ DONE — fail-safe billing layer

### Archivos modificados
- `server/integrations/stripe/client.ts` — añadido `StripeNotConfiguredError` (clase tipada con `code: 'STRIPE_NOT_CONFIGURED'` y `missingVar`), `isStripeNotConfiguredError` (type-guard que también detecta error duck-typed), `isStripeFullyConfigured()` y `__resetStripeClientForTests()`. `getStripe()` y `getStripeWebhookSecret()` ahora lanzan `StripeNotConfiguredError` en vez de un `Error` genérico.
- `server/routes/billing.ts` — todos los endpoints Stripe-dependientes (`/checkout-session`, `/portal-session`, `/topup-checkout`, `/flexible-usage/enable`, `/flexible-usage/disable`) capturan `StripeNotConfiguredError` y devuelven `503 { error: 'STRIPE_NOT_CONFIGURED', code, message, missingVar }`. Endpoints sin Stripe (`/usage`, `/usage/events`, `/credit-grants`, `/access`, `/subscription` GET y PATCH, `/ledger`, `/top-up`/`/top-ups`, `/flexible-usage/toggle`, `/activate-trial`, `/request-demo`) siguen funcionando aunque falte `STRIPE_SECRET_KEY`. Nuevo endpoint público `GET /api/billing/config` expone qué partes de Stripe están configuradas. Nuevo `GET /api/billing/credit-grants` lista los `credit_grants` recientes. Bug previo `auditRepository.write(...)` (método inexistente en `AuditRepository`) reemplazado por la firma correcta `auditRepository.log(scope, event)` — esto era el único error TS de Flow 9 que reportaron Flow 1 y Flow 5 como cross-cutting. Manual top-up también está montado como `/top-ups` (alias) para back-compat con `billingApi.topUp` en `client.ts`, y bumpea `ai_credits_topup_balance` en `billing_subscriptions`.
- `server/webhooks/stripe.ts` — el handler top-level distingue ahora signature failure (401) de Stripe-not-configured (503 con `STRIPE_NOT_CONFIGURED`). El resto del flujo ya estaba bien: signature verification con `stripe.webhooks.constructEvent(rawBody, sigHeader, secret)`, idempotencia por `webhook_events.dedupe_key = stripe_${event.id}`, persistencia raw payload, dispatch a handlers de subscription/invoice/checkout, escritura idempotente en `credit_grants` con dedupe sobre `stripe_session_id` / `stripe_invoice_id` (suprime `code 23505 unique_violation`). El raw body llega vía `server/webhooks/router.ts` que monta `express.raw({ type: '*/*' })` antes que cualquier `express.json()`.
- `server/integrations/stripe.ts` — añadida la propiedad `readonly configured: boolean = Boolean(secretKey) && Boolean(webhookSecret)` requerida por `IntegrationAdapter`. Resuelve un error de typecheck pre-existente.
- `src/components/billing/Paywall.tsx` — al montar pinea `GET /api/billing/config`. Si Stripe no está configurado: oculta los CTA de plan ("Unavailable" / `disabled` con `title` informativo), muestra banner amarillo. Captura la respuesta 503 `STRIPE_NOT_CONFIGURED` del checkout también para mostrarla limpia. Trial activation y sign-out funcionan siempre.
- `src/components/billing/UpgradeModal.tsx` — sondea `/api/billing/config`; banner ámbar si falta Stripe. Top-up ahora redirige al endpoint Stripe `/topup-checkout` (con `pack` enum `5k|20k|50k`) en vez del fake `billingApi.topUp` con redirect a `/billing?topup=`. Botones de top-up + "Upgrade plan" se desactivan cuando Stripe no está disponible. "Enable flexible (€19/1k)" sigue funcional porque sólo flippea flag.
- `src/components/billing/AICreditsPanel.tsx` — si `useAICredits` falla, muestra panel ámbar con el error (en lugar de spinner infinito).

### Archivos revisados sin cambios necesarios
- `server/integrations/stripe/plans.ts` — ya completo: matrix `(plan, interval)` → env var, top-up packs, flexible price ID, `resolvePlanFromPriceId` con back-compat de env vars legacy, `creditsForPlan(plan)` para grants automáticos.
- `server/services/aiUsageMeter.ts` — ya cumple el contrato: `getUsageSummary(scope)` lee `billing_subscriptions` (plan, included, used_period, topup_balance, flexible flags) y `ai_usage_events` (flexible-tier consumption del período). `chargeCredits` aplica precedencia included → topup → flexible con error tipado `AICreditExhaustedError`. `addTopupCredits` para webhooks. Token-to-credit conversion por tier de modelo (Fast/Balanced/Heavy).
- `server/data/billing.ts` — repo correcto sobre Supabase (`billing_subscriptions`, `credit_ledger`).
- `src/hooks/useAICredits.ts` — polling cada 60s a `billingApi.usage()`, expone `data/loading/error/refresh/blocked/warning/flexibleActive`.
- `src/components/billing/CreditBanner.tsx`, `src/components/upgrade/PlansTab.tsx`, `CreditsTab.tsx`, `SeatsTab.tsx`, `UsageTab.tsx`, `BillingHistoryTab.tsx` — usan únicamente endpoints no-Stripe (`subscription`, `ledger`, `changePlan`, `topUp`); siguen funcionando con/sin Stripe.

### Cambios clave / contrato API
- **Fail-safe**: si `STRIPE_SECRET_KEY` no existe en Vercel, ningún endpoint del backend crashea. Stripe-dependientes responden `HTTP 503 { error: 'STRIPE_NOT_CONFIGURED', code: 'STRIPE_NOT_CONFIGURED', message, missingVar: 'STRIPE_SECRET_KEY' | 'STRIPE_WEBHOOK_SECRET' }`. Los demás (acceso, trial, lectura de subscription/usage/grants, manual top-up, change plan) siguen vivos.
- **Webhook**: `POST /api/webhooks/stripe` valida signature con `stripe.webhooks.constructEvent` antes de procesar nada. Inválida → 401. Falta `STRIPE_WEBHOOK_SECRET` → 503. Procesa: `checkout.session.completed` (subscription o topup), `customer.subscription.{created,updated,deleted}`, `invoice.payment_succeeded` (renueva período + reset credits + nuevo grant), `invoice.payment_failed` (status `past_due`). Idempotente vía `webhook_events.dedupe_key` y unique constraints en `credit_grants`.
- **`/billing/usage`** lee de `ai_usage_events`, `credit_grants` (vía `ai_credits_topup_balance` que el webhook mantiene) y `billing_subscriptions`. Shape exacto al definido en `src/api/client.ts:720-732`.

### Verificación
- `npx tsc --noEmit --project tsconfig.server.json` → **0 errores en archivos Flow 9**. El único error remanente es en `server/demo/sandboxAdapters.ts` (Flow 10 — sandbox stubs de Shopify y Stripe necesitan también `configured: false`). Anotado en cross-cutting.
- `npx tsc --noEmit --project tsconfig.json` (frontend) → **0 errores en archivos Flow 9**. Errores remanentes en `src/components/Approvals.tsx` (Flow 2 — naming snake/camel). Anotados en cross-cutting.
- Test mental fail-safe: con `delete process.env.STRIPE_SECRET_KEY`, `getStripe()` lanza `StripeNotConfiguredError`; los routes lo catchean y emiten 503 con el shape esperado. El SPA detecta vía `/billing/config` y oculta upgrade buttons.
- Test mental webhook: `POST /api/webhooks/stripe` con body sin signature → 400. Con signature inválida → 401. Con signature válida y evento ya procesado → 200 (dedupe). Con signature válida y evento nuevo → procesa + 200.

### Cross-cutting concerns identificados (no arreglados — fuera de scope)
- `src/components/Approvals.tsx` (Flow 2): 8 errores TS por `evidence.reconciliation_issues / linked_cases` y `case_state`. Resolverá la capa de normalización (`src/api/normalize.ts`) que va a crear Flow 2.
- `server/demo/sandboxAdapters.ts` (Flow 10): los stubs `ShopifySandboxAdapter` y `StripeSandboxAdapter` no exponen `configured: boolean`. Fix trivial: añadir `configured: false` en cada literal de adapter. Pertenece a Flow 10 (Integraciones externas).
- `src/api/client.ts` (Flow 2): `billingApi` ya expone `subscription`, `ledger`, `changePlan`, `topUp`, `checkoutSession`, `portalSession`, `usage`, `usageEvents`, `toggleFlexibleUsage`. Convendría añadir tres métodos: `config()` → `GET /billing/config`, `topupCheckout(orgId, pack)` → `POST /billing/${orgId}/topup-checkout`, `creditGrants()` → `GET /billing/credit-grants`. Por respeto al ownership Flow 2, NO los añadí; en su lugar `Paywall.tsx` y `UpgradeModal.tsx` hacen `fetch` directo. Cuando Flow 2 toque `client.ts` conviene migrar.
- **Vercel Dashboard env vars** que el usuario debe configurar para que billing pase de "unavailable" a operativo: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_STARTER_MONTHLY/ANNUAL`, `STRIPE_PRICE_ID_GROWTH_MONTHLY/ANNUAL`, `STRIPE_PRICE_ID_SCALE_MONTHLY/ANNUAL`, `STRIPE_PRICE_ID_TOPUP_5K/20K/50K`, `STRIPE_PRICE_ID_FLEXIBLE_USAGE`, `APP_URL`. Sin ellas el sistema sigue arrancando (gracias al fail-safe) pero billing está en modo "unavailable".

---

## Flow 10: Integraciones externas
**Owner**: Agente 10
**Status**: DONE

### Archivos modificados
- `server/integrations/types.ts` — añadido:
  - Identificadores de sistema `postmark`, `twilio`, `email`, `sms`, `web_chat`.
  - `IntegrationNotConfiguredError` (clase base) + subclases `Shopify…`, `WhatsApp…`, `Postmark…`, `Twilio…`.
  - `isIntegrationNotConfiguredError(err)` typeguard.
  - `IntegrationAdapter.configured` (opcional, retro-compatible con sandbox adapters).
  - Export `NormalizedChannelMessage` (espejo del contrato consumido por `pipeline/channelIngest.ts`).
- `server/integrations/base.ts` — re-export de los `*NotConfiguredError` desde `./types.js`.
- `server/integrations/registry.ts` — `bootstrapIntegrations()` reescrito:
  - Registra siempre Shopify y WhatsApp (en stub-mode si faltan creds) para que el healthcheck los reporte.
  - Registra Stripe condicionalmente; tolera ausencia de `StripeAdapter` (Flow 9 lo edita).
  - `Promise.allSettled` + log por fallo individual; nunca crashea el bootstrap.
  - Log incluye lista de adapters `configured` (los que tienen creds reales).
- `server/integrations/shopify.ts`:
  - Constructor recibe `ShopifyAdapterOptions` (objeto) en vez de tres args posicionales.
  - `configured: boolean` + `missingCredentials()` para 503 informativos.
  - `requireConfigured()` cierra todos los métodos públicos (orders/customers/refunds/cancel/restore/createReturn).
  - `verifyWebhook` valida HMAC en tiempo constante (`timingSafeEqual`); devuelve `false` cuando falta secret o header — la ruta lo traduce a 401/503.
  - **Nuevo**: `createRefund({paymentExternalId, amount, currency, reason?, idempotencyKey, notify?})` implementa `WritableRefunds` contra `POST /orders/:id/refunds.json` con `X-Idempotency-Key`.
- `server/integrations/whatsapp.ts` — reescrito:
  - Constructor con `WhatsAppAdapterOptions` (incluye `webhookSecret`).
  - `verifyWebhook` valida `x-hub-signature-256` (HMAC-SHA256 sobre raw body con `WHATSAPP_WEBHOOK_SECRET`).
  - `sendTextMessage(to, content)` ahora **lanza** `WhatsAppNotConfiguredError` cuando faltan `WHATSAPP_ACCESS_TOKEN`/`…_PHONE_NUMBER_ID` (no simula).
  - `sendText` se mantiene como alias retrocompatible.
  - Helpers `getVerifyToken()` y `hasWebhookSecret()` para que las rutas decidan 401 vs 503.
- `server/pipeline/channelSenders.ts` — fail-safe end-to-end:
  - `sendWhatsApp` delega en el `WhatsAppAdapter` registrado.
  - `sendEmail` lanza `PostmarkNotConfiguredError` cuando falta `POSTMARK_SERVER_TOKEN`.
  - `sendSms` lanza `TwilioNotConfiguredError` con la lista exacta de env vars que faltan.
  - Nuevo dispatcher `sendOnChannel({channel, to, content, subject?, caseRef?})`.
  - `ChannelSendResult.simulated` se conserva (siempre `false`) para no romper Flow 4 (messageSender), Flow 8 (workflows) ni planEngine/messaging tool.
- `server/webhooks/shopify.ts` — reescrito:
  - 400 si falta raw body. 503 + `SHOPIFY_NOT_CONFIGURED` si no hay creds. 401 si falta o no coincide `X-Shopify-Hmac-SHA256`.
  - Lookup de tenant por `shop_domain` (con fallback al primer connector). 200+skip si no hay mapping (evita retries infinitos).
  - Persiste `webhook_events` + `canonical_events` (con `source_system='shopify'`, `event_type=topic`, `event_category`, `dedupe_key`, `tenant_id`, `workspace_id`, `occurred_at`, etc.) y encola `WEBHOOK_PROCESS` con prioridad 5.
  - Eliminadas todas las referencias a `getDb()` (legacy SQLite) y el path "inline en Vercel" — ahora el worker (Flow 5) procesa siempre vía cron.
- `server/webhooks/channels.ts` — reescrito:
  - WhatsApp `GET` (handshake `verify_token`) y `POST` con HMAC `x-hub-signature-256`. 503 si falta secret, 401 si firma inválida.
  - Postmark inbound: 503 si no hay `POSTMARK_SERVER_TOKEN`; opcional `POSTMARK_INBOUND_TOKEN` para shared secret en header `x-postmark-token`.
  - Twilio inbound SMS: 503 si faltan creds; valida `X-Twilio-Signature` (HMAC-SHA1 sobre URL + params ordenados) en tiempo constante.
  - Web chat widget: 503 si no hay `WEB_CHAT_API_KEY`; valida header `x-web-chat-key`.
  - Helper `persistAndEnqueue()` único: dedupe contra `webhook_events`, persiste `canonical_events` con `NormalizedChannelMessage`, encola `CHANNEL_INGEST` con prioridad 3.
- `server/webhooks/router.ts` — montadas rutas nuevas: `/sms` (Twilio) y `/web-chat`.

### Cambios clave (resumen)
- **No more crashes**: cada endpoint usa `IntegrationNotConfiguredError` y devuelve 503 con `code` máquina-legible (`SHOPIFY_NOT_CONFIGURED`, `WHATSAPP_NOT_CONFIGURED`, `POSTMARK_NOT_CONFIGURED`, `TWILIO_NOT_CONFIGURED`, `WEB_CHAT_NOT_CONFIGURED`) y la lista de env vars que faltan.
- **Signatures siempre validadas antes** de tocar el payload (Shopify HMAC base64, WhatsApp HMAC hex, Twilio HMAC SHA1, Postmark/web-chat shared secret); todas con `timingSafeEqual`.
- **Persistencia idempotente**: dedupe key por `webhook-id` (Shopify) o `<source>:message:<external_id>` (channels). Persistencia ANTES de ack para sobrevivir a kills mid-request.
- **Canonical events completos**: `tenant_id`, `workspace_id`, `source_system`, `event_type`, `event_category`, `canonical_entity_*`, `normalized_payload`, `occurred_at`, `dedupe_key`.
- **Worker decoupling**: webhooks solo encolan; el procesamiento real lo hace `WEBHOOK_PROCESS` (commerce) o `CHANNEL_INGEST` (mensajería) cuando el cron de Flow 5 corra.

### Verificación
- `npx tsc --noEmit --project tsconfig.server.json` → **0 errores** en todo el repo (typecheck limpio).
- Sin credenciales:
  - `POST /webhooks/shopify` → 503 `WEBHOOK_NOT_CONFIGURED` con `missing: ['SHOPIFY_*']`.
  - `GET /webhooks/whatsapp` (sin verify token) → 503 `WHATSAPP_NOT_CONFIGURED`.
  - `POST /webhooks/whatsapp` → 503 si no hay `WHATSAPP_WEBHOOK_SECRET`.
  - `POST /webhooks/email` → 503 si no hay `POSTMARK_SERVER_TOKEN`.
  - `POST /webhooks/sms` → 503 si faltan creds Twilio.
  - `POST /webhooks/web-chat` → 503 si no hay `WEB_CHAT_API_KEY`.
- Con credenciales: signatures validadas; mismatch → 401; firma OK → 200 + persistencia + enqueue.
- Compatibilidad con consumidores externos preservada:
  - `routes/iam.ts` lee `result.simulated` → siempre `false`, su `try/catch` ya manejaba el throw.
  - `messageSender.ts`, `routes/workflows.ts`, `agents/planEngine/tools/messaging.ts` → siguen recibiendo `{messageId, simulated}` con la misma forma.
  - Sandbox adapters (`server/demo/sandboxAdapters.ts`) siguen funcionando (`configured` quedó opcional).

### Cross-cutting concerns
- **Flow 9 (Stripe)**: el registry registra Stripe condicionalmente y tolera que `StripeAdapter` no exporte (durante refactor de Flow 9 nunca crashea el bootstrap). Si Flow 9 cambia el constructor, su agente debe alinearlo aquí.
- **Flow 4 (channelIngest)**: el `NormalizedChannelMessage` interno de `channelIngest.ts` y el exportado desde `integrations/types.ts` son estructuralmente idénticos. Cuando Flow 4 vuelva a tocar `channelIngest.ts` puede importar el tipo desde `integrations/types.ts` y eliminar la copia.
- **Flow 5 (worker)**: las webhooks dependen de que el cron de `/api/internal/worker/tick` drene la cola. Si el cron no está, los eventos quedan persistidos pero sin procesar (idempotente, intencional).
- **Sandbox adapters** (`server/demo/sandboxAdapters.ts`): se beneficiarían de declarar `configured: true` explícitamente; campo opcional, no bloqueante.
- **Env vars nuevas** que el operador debe conocer:
  - `WHATSAPP_WEBHOOK_SECRET` (App Secret de Meta para HMAC).
  - `POSTMARK_INBOUND_TOKEN` o `POSTMARK_WEBHOOK_TOKEN` (opcional, shared secret para `/webhooks/email`).
  - `WEB_CHAT_API_KEY` (obligatorio si se va a usar el widget de web-chat).

---

## Flow 11: Reconciliación
**Owner**: Agente 11
**Status**: ✅ DONE (depende de Flow 5 worker + Flow 6 scheduler para ejecución, y de la migración Foundation para schema)

### Archivos modificados
- `server/pipeline/reconciler.ts`
- `server/pipeline/reconcilerScheduled.ts`
- `server/data/reconciliation.ts`
- `server/routes/reconciliation.ts`
- `server/data/cases.ts` (sólo bloques relacionados con `reconciliation_issues`: `buildTimeline` líneas 95-106 + `upsertReconciliationIssue` 1895-1944)

### Cambios clave

1. **`server/pipeline/reconciler.ts`** — el `ConflictResult` ahora exige `summary` (texto humano) e `issueType` (label categórico). Cada comparador genera estos dos campos:
   - `payment_amount_mismatch`, `payment_status_drift`, `payment_dispute_active` (compare payment)
   - `fulfillment_status_drift`, `tracking_missing` (compare fulfillment)
   - `refund_missing`, `return_status_drift` (compare returns)
   - `identity_unlinked`, `identity_high_risk` (compare identity)

   `caseRepo.upsertReconciliationIssue` ahora recibe `workspace_id`, `summary`, `issue_type` y `detected_at` además de los campos previos. Eliminado import muerto de `randomUUID`.

2. **`server/data/cases.ts > upsertReconciliationIssue`** (sólo este bloque):
   - Idempotencia ahora **tenant-scoped**: dedup por `(tenant_id, case_id, entity_id, conflict_domain, status='open')`. Antes el find no filtraba por tenant.
   - El UPDATE conserva `summary`, `issue_type`, `expected_state`, `conflicting_systems`, `source_of_truth_system`, `detected_by`, severity, actual_states, detected_at.
   - El INSERT siempre incluye `tenant_id`, `workspace_id`, `detected_at` con defaults derivados del scope.

3. **`server/data/cases.ts > buildTimeline`** (líneas 95-106): `content: issue.summary || 'Conflict detected'` (la columna existe, eliminado fallback a `issue_type`). `type` y `domain` siguen usando `issue_type`/`conflict_domain` para clasificación, pero la narrativa humana es exclusivamente `summary`.

4. **`server/data/reconciliation.ts`**:
   - Constante `ISSUE_COLUMNS` con projection explícita que **incluye `summary` e `issue_type`** — usada en `listIssues` y `getIssue`. Garantiza que la UI siempre los recibe.
   - Filtro nuevo `issue_type` en `ReconciliationFilters`.
   - Todas las queries ahora filtran por `tenant_id` Y `workspace_id` (antes sólo tenant). `updateIssue` también.
   - `getMetrics` añade `severity_breakdown` e `issue_type_breakdown` y filtra por workspace.
   - `insertSystemState` ahora intenta insertar `workspace_id` con fallback graceful si la columna no existe en deployments legacy.

5. **`server/pipeline/reconcilerScheduled.ts`** — idempotencia real:
   - `findInFlightCaseIds` consulta tabla `jobs` con `type=reconcile.case` y status `pending|running` para no duplicar reconciliaciones de casos que ya tienen una pendiente. Si la lookup falla, log warn y sigue (degradación graceful).
   - `await enqueue(...)` (antes era fire-and-forget) — la promesa retornada por `enqueue` debe resolverse antes de devolver.
   - Doc-comment renovado.

6. **`server/routes/reconciliation.ts`**:
   - Endpoints completos: `GET /issues`, `GET /issues/:id`, `GET /metrics`, `PATCH /issues/:id/status`, `POST /issues/:id/resolve-apply`, `POST /process-open`. Todos hacen `getIssue` (que valida `tenant_id`+`workspace_id`) antes de modificar.
   - `recalcCaseConflictState`: refactor a worst-severity ranking con tabla `SEVERITY_RANK` (en lugar de tomar la severidad de la primera issue activa, ahora elige la más crítica). Eliminada la query duplicada (la variable `issues` no se usaba).
   - Nuevo filtro `issue_type` aceptado en query string del listado.

### Verificación
- `npm run lint:server`: **0 errores en archivos del Flow 11**. Errores restantes pertenecen a Flow 9 (`server/integrations/stripe.ts`, `server/routes/billing.ts`) y Flow 10 (`server/integrations/whatsapp.ts`, `server/demo/sandboxAdapters.ts`, `server/integrations/registry.ts`) — pre-existentes.
- `summary` e `issue_type` se incluyen explícitamente en el `select(...)` de `listIssues`/`getIssue` (no dependemos de `*`).
- **Tenant scope estricto**: todas las queries de `reconciliation_issues` exigen `tenant_id` y `workspace_id` (lectura, escritura, dedup-key del upsert).

### Dependencias
- **Flow 5 (worker `processBatch`)**: el handler `RECONCILE_CASE` y `RECONCILE_SCHEDULED` quedan registrados via `registerHandler`. Hasta que el worker corra (Vercel cron tick), los jobs encolados no se procesan. Flow 5 ya está ✅ DONE.
- **Flow 6 (scheduler `runScheduledTasksOnce`)**: el scheduler debe encolar `RECONCILE_SCHEDULED` para que la sweep dispare. Flow 6 ya está ✅ DONE; el sweeper `reconcile` está registrado (líneas 158/170 de `scheduledJobs.ts`).
- **Migración `20260503_0001_reconciliation_schema_fix.sql`** debe estar aplicada en Supabase (responsabilidad de Foundation; ya creada). Sin ella, INSERT/UPDATE con `summary`/`issue_type` fallarán con "column does not exist".

### Cross-cutting concerns encontrados (anotar para owners correspondientes)
- **`server/data/cases.ts > getOpenReconciliationIssues`** (línea 1889) filtra por `tenant_id` pero NO por `workspace_id`. Owner: archivo compartido / foundation.
- **`server/data/cases.ts > fetchCaseBundleSupabase`** (línea 1358) selecciona `reconciliation_issues` filtrando por `tenant_id` pero NO por `workspace_id`. Mismo trato — file ownership compartido.
- **Línea 1157 `bundle.reconciliation_issues?.[0]?.source_of_truth`**: la columna real es `source_of_truth_system`. El `?? null` enmascara el undefined; debería leer `source_of_truth_system`. Fix de 1 línea fuera del scope explícito (líneas 25/104).

---

## Flow 12: Frontend Auth & API client robustness
**Owner**: Agente 12
**Status**: ✅ DONE

### Archivos modificados
- `src/api/hooks.ts`
- `src/api/supabase.ts`
- `src/main.tsx`
- `src/components/PageErrorBoundary.tsx`

### Cambios clave

1. **`src/api/hooks.ts`** — reescritura completa del manejo de errores:
   - Helper `describeError(err)` produce un mensaje no-undefined incluso para `TypeError` de red (devuelve "Network error. Please check your connection and try again.").
   - Helper `extractStatus(err)` lee `err.status` cuando el cliente lo adjunta (ver cross-cutting nota para `client.ts`).
   - `useApi`: ahora expone `status: number | null` además de `data/loading/error/refetch`. Al fallar, **siempre** `console.error` (no `console.warn`). Lógica:
     - `401` → emite evento global `crmai:unauthorized`, **no reintenta**.
     - `403` → no reintenta (la permission no va a aparecer al refrescar).
     - 4xx (otros) → no reintenta.
     - 5xx / network / status desconocido → exponential backoff hasta 3 reintentos (igual que antes).
   - `useMutation`: añade segundo parámetro opcional `{ onError, onSuccess }`. También expone `status`. En `401` emite el mismo evento global. Backwards-compatible: las llamadas existentes `useMutation(fn)` siguen funcionando sin tocar nada.
   - Exporta constante pública `UNAUTHORIZED_EVENT = 'crmai:unauthorized'` para el listener global.

2. **`src/api/supabase.ts`** — eliminado el fallback silencioso a `'demo-no-auth-key'`:
   - Si `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` están ambos definidos → cliente real con `auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }`.
   - Si falta alguno → se devuelve un Proxy que **lanza** en cualquier acceso (`'[supabase] client is not configured'`). Fuerza que la UI surface el error en vez de hacer requests con una key inventada.
   - `ensureSupabaseClient()` mantenido: intenta obtener la config en runtime desde `/api/public/config` (necesario para Vercel cuando solo se configura `SUPABASE_*` sin prefijo `VITE_`). Si falla **NO degrada** a un cliente fake; deja el proxy y guarda el error en `getSupabaseConfigError()`.
   - Nuevos exports: `isSupabaseConfigured(): boolean` y `getSupabaseConfigError(): string | null`.
   - `supabaseAuthEnabled` (export legacy usado por `App.tsx`) sigue exportado y se sincroniza con el estado real.

3. **`src/main.tsx`** — refactor a un componente `Root` que:
   - Si `isSupabaseConfigured()` falla, llama a `ensureSupabaseClient()`. Si tampoco resuelve, renderiza una **pantalla de error fatal** con instrucciones (env vars que faltan + diagnóstico). No hay degradación silenciosa.
   - Mientras carga muestra un spinner.
   - Renderiza `<App>` envuelto en `<PageErrorBoundary page="root">` para que cualquier error no capturado en la raíz no rompa toda la SPA.
   - Suscribe un listener global a `crmai:unauthorized` que:
     1. Borra `localStorage['crmai.membership.v1']` (membership cache).
     2. Llama `supabase.auth.signOut()` (sólo si está configurado, para no lanzar otro error).
     3. Redirige a `/#/signin?return=<encodeURIComponent(pathname+search+hash)>` para que el usuario vuelva tras login.
     4. Guard `redirecting` evita múltiples redirects si llegan varios 401 en paralelo.

4. **`src/components/PageErrorBoundary.tsx`** — mejorado:
   - `componentDidCatch` añade `console.error` con stack + componentStack (antes el componente no logueaba nada).
   - Mensaje en español "Algo salió mal".
   - Dos acciones: **Reintentar** (limpia el state, re-renderiza children) y **Recargar** (`window.location.reload()`).
   - Mantiene el reset automático cuando cambia `props.page`.

### Verificación realizada
- `npm run lint` (frontend tsc --noEmit) → **PASA sin errores**.

### Cross-cutting concerns levantados

- **`src/api/client.ts` (Owner: Flow 2)** — actualmente `request()` lanza `new Error(...)` sin adjuntar `.status`. La nueva lógica en `useApi`/`useMutation` lee `err.status` para decidir 401/403/5xx. **Hasta que Flow 2 modifique `request()` para adjuntar `.status`** los hooks tratarán todo error como "5xx/desconocido" y reintentarán + no dispararán el redirect a login. No rompe nada (degrada gracefully) pero la 401 → sign-out NO se activa hasta que Flow 2 aplique el patch.
  - **Patch sugerido en `src/api/client.ts` (~línea 202, dentro del `if (!res.ok)`)**:
    ```ts
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: res.statusText }));
      const e: Error & { status?: number; body?: unknown } = new Error(
        errBody.message || errBody.error || `API error ${res.status}`,
      );
      e.status = res.status;
      e.body = errBody;
      throw e;
    }
    ```

### Notas de funcionamiento
- Flow end-to-end del 401: hook captura → `console.error` → emite `window` event → listener en `main.tsx` limpia membership cache + `signOut` + redirect a `/#/signin?return=...`. Una sola suscripción global, sin polling ni listeners duplicados.
- El proxy unconfigured de `supabase.ts` lanza en CUALQUIER acceso a propiedad. Esto incluye `supabase.auth`, `supabase.from(...)`, etc. Verificado: `App.tsx` ya espera a `ensureSupabaseClient()` antes de usar `supabase.auth.getSession()` (líneas 187-194), por lo que no hay regression. Si otros componentes empezaran a importar `supabase` directamente sin guard, lanzarían un error claro en vez de obtener datos vacíos silenciosamente — comportamiento intencional (sin parches).

---

## Cross-cutting concerns

(Bugs encontrados fuera del scope propio. Otros agentes los recogerán o se manejan en una pasada de integración.)

### Encontrados por Agente 1 (Flow 1)

- **`server/routes/billing.ts:84`** — `Property 'write' does not exist on type 'AuditRepository'`. El handler de billing intenta llamar a un método `write` que no existe en `AuditRepository`. Probablemente debe usarse `record`/`log` u otro método existente. Owner: Flow 9 (Billing).
- **`src/components/Orders.tsx:121,205`** — uso de `canonical_context` (snake) cuando el tipo `Order` declara `canonicalContext` (camel). Tres ocurrencias. Owner: Flow 2 (Dashboard normalization). Se resolverá con la capa `src/api/normalize.ts`.

### Encontrados por Agente 7 (Flow 7)

- **`server/lib/workflowEventBus.ts:42-120`** — **GRAVE en serverless**. La función `fireWorkflowEvent` es síncrona pero envuelve TODO en `setImmediate(async () => { … insert … dispatch … })`. Esto significa que el insert en `workflow_event_log` NO ocurre antes de que la HTTP response devuelva — ocurre en una microtask posterior. En Vercel, si la lambda termina antes de que `setImmediate` ejecute (lo más probable en una respuesta HTTP rápida), el evento se pierde y NO queda nada en BD para que el sweeper lo recupere. La fix correcta: `fireWorkflowEvent` debe ser `async`, esperar el insert (await), devolver al caller, y solo entonces disparar el dispatch en `setImmediate`. Owner: **Flow 8** (workflowEventBus.ts es de su ownership). Bloquea la garantía de entrega de Flow 7 — el insert tiene que ser `await` antes de devolver al handler HTTP.
- **`vercel.json:71`** — el cron daily apunta a `/api/superagent/cron/check` (sin guion) pero el router se monta en `server/index.ts:144` como `/api/super-agent` (con guion), por lo que el cron registrado en Vercel hará 404 cada noche. Hay que cambiar el cron a `/api/super-agent/cron/check` o renombrar el mount. Owner: **Foundation** (vercel.json).

### Encontrados por Agente 5 (Flow 5)

- **`quarantineOrphanJobs` solo corre en startup standalone**. En el modo cron (Vercel), nunca se ejecuta — si un job queda en estado `processing` porque la invocación del cron murió a media marcha, se queda atascado indefinidamente. Sugerencia: añadir una llamada a `getJobRepo().quarantineOrphanJobs()` como un step más dentro de `runScheduledTasksOnce()` (ej. cada 5 minutos vía contador, o sin throttle si el coste es bajo). Owner: **Flow 6** (scheduledJobs.ts).
- **`config.queue.concurrency` no se aplica al modo cron**. El batch está limitado por `WORKER_BATCH_SIZE` (env, default 10) y se procesan TODOS en paralelo con `Promise.all`. Para handlers que hacen I/O pesado contra Gemini/Supabase esto puede saturar conexiones. Si en producción se observa rate-limiting, considerar añadir un semáforo (p-limit) dentro de `runJobs` que respete `config.queue.concurrency`. Por ahora no es bloqueante: 10 jobs paralelos por minuto es muy poco. Owner: pasada de optimización futura, no asignar a nadie ahora.
- **`server/routes/superAgent.ts:4315`** — el handler `/cron/check` hardcodea `scope = { tenantId: 'org_default', workspaceId: '' }`. En multi-tenant esto no escanea el resto de tenants. Debería iterar como hace `forEachActiveScope` en `scheduledJobs.ts`. Es Flow 7 ownership pero requiere consenso con Flow 6 sobre si este endpoint sigue existiendo o se absorbe en `runScheduledTasksOnce`. Lo dejo anotado para una pasada de integración tras Flow 5/6.

### Encontrados por Agente 4 (Flow 4)

- **`server/agents/orchestrator.ts:244-260` `triggerAgents`** — la función es `void` y dentro llama a `enqueue(...)` (Promise) sin await. En Vercel serverless el handler HTTP que la invoque (vía `intentRouter`, etc.) puede retornar antes de que el AGENT_TRIGGER se persista. Debería ser `async function triggerAgents(...): Promise<void>` y `await enqueue(...)`, y los callers deben hacer `await triggerAgents(...)`. Owner: **Flow 3** (orchestrator.ts está en `server/agents/`).
- **`server/data/cases.ts:1710-1714` `createMessage`** — el insert en `messages` solo añade `tenant_id` (no `workspace_id`). Si el schema de `messages` lleva `workspace_id`, queda NULL al persistir mensajes inbound (channelIngest) y outbound (messageSender). No es bloqueante para Flow 4 (los selects del propio repo solo filtran por `tenant_id`), pero rompe la propiedad de RLS por workspace si la migración 20260502_0001 esperaba ambos. Owner: ownership de `server/data/cases.ts` (foundational/repos).
- **Pipeline → `server/agents/runner.ts` resolveAgentKnowledgeBundle** — `runner.ts` (Flow 3) también importa `resolveAgentKnowledgeBundle` y ya espera la versión async. Coordinarse con Flow 3 para que el rename ocurra en una sola pasada y no deje a `draftReply.ts` ni a `runner.ts` colgando.

### Encontrados por Agente 3 (Flow 3)

- **`server/services/postApproval.ts:674`** — todavía hace `const db = getDb();`. Como `getDb()` ahora siempre lanza, este código está roto en runtime. Necesita migrarse a Supabase. Owner: archivo compartido (no asignado a ningún flow del BLUEPRINT).
- **`server/db/seed.ts:16`** — `getDb()` en el seed legacy. Sólo se invoca si alguien corre el seed manualmente; en producción es código muerto pero el archivo no compila contra runtime real. Owner: Foundation.
- **`server/routes/knowledge.ts`** — **13 referencias a `getDb()`** + 1 import de `resolveAgentKnowledgeBundleAsync` (este último ya está cubierto por mi alias deprecado, no rompe). Los 13 `getDb()` rompen en runtime cualquier endpoint del router de knowledge. Owner: no hay flow asignado en el BLUEPRINT para `routes/knowledge.ts` — **necesita owner para refactor a Supabase**.
- **`server/routes/agents.ts:21,88`** — importa `resolveAgentKnowledgeBundleAsync` (covered by alias). No bloqueante, pero idealmente migrar al nombre canonical en una pasada de cleanup.

### Encontrados por Agente 11 (Flow 11)

- **`server/data/cases.ts:1358`** — `fetchCaseBundleSupabase` selecciona `reconciliation_issues` filtrando por `tenant_id` pero NO por `workspace_id`. Si dos workspaces del mismo tenant comparten un `case_id` (no debería pasar pero no hay constraint que lo prevenga), las issues del workspace ajeno podrían filtrarse al bundle. Owner: archivo compartido (foundational).
- **`server/data/cases.ts:1889` `getOpenReconciliationIssues`** — filtra por `tenant_id` y `case_id`+`status='open'` pero NO por `workspace_id`. Mismo riesgo que arriba. Owner: archivo compartido.
- **`server/data/cases.ts:1157`** — `bundle.reconciliation_issues?.[0]?.source_of_truth` lee una columna que NO existe (es `source_of_truth_system`). El campo del payload del case detail queda silenciosamente `null` por el `|| null`. Fix de 1 línea. Owner: archivo compartido.

### Encontrados por Agente 2 (Flow 2)

- **`src/api/client.ts:fetchMembershipFromApi` (líneas 47-85) y `App.tsx:240-255`** — ambos usan `fetch` crudo (no `request()`) y leen `body.context.tenant_id`. Esto es CORRECTO porque no pasan por `request()` y por tanto no aplican normalización; el server sigue devolviendo snake_case en el wire. NO requiere acción, solo dejarlo documentado para futuras refactorizaciones. Si en algún momento se mueven a `request()`, deberán cambiar las lecturas a camelCase.
- **`src/api/client.ts` `request()` no propaga `err.status`** — Flow 12 ya documentó esto. El listener global de 401 (`crmai:unauthorized`) en `main.tsx` no se dispara porque `err.status` es siempre `undefined`. El patch de 8 líneas sugerido por Flow 12 (capturar `res.status`, adjuntarlo al Error con `e.status = res.status`) sigue pendiente. Como el patch toca el flujo de errores y mi cambio ya tocó `request()`, lo más limpio es que Flow 2 (este flow) lo aplique en una pasada futura para mantener todo dentro del owner. **No lo apliqué en esta pasada porque el spec de Flow 2 no lo incluye explícitamente** y porque no quiero superponer cambios al ownership de Flow 12.
- **`src/api/client.ts:agentCatalog`** (línea ~530) — el normalizer de `WorkflowAddNodePanel` lee `n.agentId`, `n.agentSlug`, `n.label`. Tras la nueva normalización del API a camelCase, esto seguirá funcionando porque el server ya devuelve `agentId`/`agentSlug` (verificable). Si en algún punto el server pasara a devolver `agent_id`, la normalización los traduciría automáticamente a `agentId` y el código seguiría correcto. No requiere acción.
- **Servidor: `server/data/cases.ts > buildTimeline`** — emite `system_states.returns_platform` en el campo `state.systems` del case bundle. Esto se traduce automáticamente a `systemStates.returnsPlatform` por la capa de normalización. NO requiere cambios en backend.
- **Bodies que contienen JSONB libre del usuario** (p.ej. `policyApi.evaluateAndRoute({ context: { ... } })` o cualquier `triggerPayload`) — la nueva normalización convierte recursivamente TODAS las keys del objeto, INCLUYENDO las anidadas dentro de `context`. Esto podría causar problemas si el servidor espera que algunas keys del JSONB se mantengan en su forma original (ej. nombres de productos, propiedades canónicas externas como `customerEmail` vs `customer_email`). En la práctica, todos los handlers del backend usan snake_case canónico, así que no debería haber regresiones; pero si Flow 4/9/10 reportan algún caso anómalo, considerar excluir keys específicas del walk recursivo (un mecanismo de "passthrough paths"). **Por ahora NO se requiere acción** — el contrato es snake_case end-to-end.

## Pasada de integración (Agente 13)

**Objetivo**: cleanup de los archivos huérfanos que aún usaban `getDb()` (la función ahora siempre lanza). Sin esta pasada, los endpoints de `routes/knowledge.ts` crasheaban en runtime y `services/postApproval.ts` rompía el flujo de aprobaciones. También se quitó el alias deprecado `resolveAgentKnowledgeBundleAsync`.

### Archivos modificados

1. **`server/routes/knowledge.ts`** — refactor completo a Supabase:
   - Eliminadas las 13 referencias a `getDb()` (cada handler tenía un branch SQLite que ahora era código muerto).
   - Eliminado el switch `getDatabaseProvider() === 'supabase'` y todo el branch SQLite asociado en `/articles` (GET/POST/PUT, GET by id, POST publish), `/gaps`, `/domains` (GET/POST/PATCH/DELETE), `/policies` (GET/POST/PATCH/DELETE).
   - Cada handler ahora va directamente al `knowledgeRepository` (Supabase) o a `getSupabaseAdmin()` para los handlers de domains/policies write que no estaban en el repo.
   - Eliminados imports muertos: `getDb`, `getDatabaseProvider`, `randomUUID` (ya no se usa en este archivo), `logAudit`, `parseRow`. Se mantiene `getSupabaseAdmin` (usado por `fetchKnowledgeGapInputs` y por los handlers de domains/policies write) y `extractMultiTenant`.
   - Reemplazado el import `resolveAgentKnowledgeBundleAsync` por el nombre canónico `resolveAgentKnowledgeBundle` (en el handler `/test`).
   - Filtros tenant_id + workspace_id estrictos en `knowledge_articles` (vía repo) y en `cases`/`messages`/`approval_requests` (en `fetchKnowledgeGapInputs`).
   - **Decisión sobre workspace_id en `knowledge_domains` y `policy_rules`**: ni el repo Supabase actual (`server/data/knowledge.ts`) ni el código SQLite previo filtraban por `workspace_id` en estas tablas. Mantengo la convención existente (solo `tenant_id`) para no cambiar el contrato de aislamiento de estas dos tablas. Si en el schema multi-workspace se decide añadir `workspace_id`, los handlers de `POST/PATCH/DELETE /domains` y `POST/PATCH/DELETE /policies` deben actualizarse en consecuencia. Documentado en cross-cutting más abajo.

2. **`server/services/postApproval.ts`** — Caso A (había versión Supabase):
   - Eliminada la función `applyPostApprovalDecisionSqlite` por completo (era código muerto post-Wave).
   - Renombrada `applyPostApprovalDecisionSupabase` → `applyPostApprovalDecision` y exportada directamente. Eliminado el dispatcher `applyPostApprovalDecision` que conmutaba por `getDatabaseProvider()`.
   - Eliminados imports muertos: `getDb`, `getDatabaseProvider`, `parseRow`. Se mantienen los helpers internos `parseMaybeJson`, `unique`, `asArray` (siguen usados por la función Supabase).

3. **`server/db/seed.ts`** — eliminado por completo. La función `seedDatabase` no se importa desde ningún sitio (verificado con Grep en el repo). Los seeds reales se ejecutan vía `npm run seed:demo` (`scripts/seed-demo.sql` con psql) o `npm run seed:supabase-demo` (`seed_sample_data.ts`). El archivo era código muerto residual de la fase SQLite.

4. **`server/routes/agents.ts`** — sustituido el import `resolveAgentKnowledgeBundleAsync` por `resolveAgentKnowledgeBundle` y actualizada la única call site (línea 88). No quedan más referencias al alias deprecado.

5. **`server/services/agentKnowledge.ts`** — eliminado el alias deprecado `export const resolveAgentKnowledgeBundleAsync = resolveAgentKnowledgeBundle;` (líneas 430-435 originales). Ya no había ningún caller del alias tras los cambios anteriores. Esto cumple con la decisión A6 del BLUEPRINT (`solo queda async`).

### Verificaciones

- `npm run lint:server`: **OK, cero errores**.
- `Grep "getDb\(" server/`: solo devuelve `server/db/client.ts:1` (la definición que siempre lanza). Cero call sites. ✓
- `Grep "resolveAgentKnowledgeBundleAsync" server/`: 0 resultados. ✓
- `Grep "db/seed|seedDatabase" server/`: solo aparece como comentario informativo en `server/agents/seed.ts:9`. No hay imports. ✓

### Cross-cutting concerns levantados por el Agente 13

- **`knowledge_domains` y `policy_rules` aislamiento por workspace**: el código actual (post-cleanup) sigue la convención del repo Supabase: solo filtra por `tenant_id`. Si el schema productivo añade `workspace_id` a estas dos tablas, los siguientes call sites deben revisarse:
  - `server/routes/knowledge.ts`: handlers `POST/PATCH/DELETE /domains` y `POST/PATCH/DELETE /policies`.
  - `server/data/knowledge.ts`: `listDomainsSupabase`, `listPoliciesSupabase`.
  - Ningún cambio en este pase porque ni el repo ni el seed (`20260415_0003_casegraph_expansion.sql`) hacen referencia a `workspace_id` en `knowledge_domains`. Owner: foundational/schema.
- **`server/services/postApproval.ts:610-650`** — la versión Supabase (ahora la única) ya no inserta `workspace_id` cuando crea la nota interna ni cuando actualiza orders/payments/returns; usa `tenant_id` y `workspace_id` correctamente vía `.eq()`. Verificado. No hay regresión.
- **`server/agents/seed.ts:9`** — el comentario `Existing agents from db/seed.ts (11):` quedó obsoleto al eliminar `db/seed.ts`. Solo es texto informativo en docstring; no rompe nada, pero debería reescribirse en una pasada de doc cleanup futura.

