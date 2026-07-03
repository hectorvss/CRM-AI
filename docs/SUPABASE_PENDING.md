# Supabase — despliegue pendiente (CRMAI)

> **Estado:** el proyecto Supabase **CRMAI** (`erzfvnpzbmwnpchhemjt`, eu-central-2) está **PAUSADO**
> (límite de 2 proyectos activos en plan gratuito, ocupados por Toddy y Txlemetry).
> Todo el trabajo que toca la base de datos se acumula aquí y se aplica **cuando se reactive CRMAI**.
>
> Este documento es la lista de la compra para ese momento: qué migraciones aplicar, en qué orden,
> qué seed correr y qué backend nuevo se añadió sin poder ejecutarlo todavía.

---

## 0. Reactivar el proyecto

Reactivar CRMAI requiere liberar un slot del plan gratuito (pausar Toddy o Txlemetry) **o** subir la
organización a plan Pro. Una vez `ACTIVE_HEALTHY`, seguir los pasos de abajo.

Variables de entorno necesarias en `.env.local` (ya presentes localmente): `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DB_PROVIDER=supabase`.

---

## 1. Aplicar migraciones (en orden)

Hay **38 migraciones** en `supabase/migrations/`. Aplicarlas todas en orden alfabético/cronológico
(el prefijo `YYYYMMDD_NNNN` ya las ordena). Con Supabase CLI:

```bash
supabase db push            # aplica las migraciones pendientes contra el proyecto enlazado
# o, manualmente, ejecutar cada .sql en orden en el SQL editor / psql.
```

### Lote crítico reciente (aún NO aplicado — commit cb8ee53)

Estas 9 son las que habilitan las features cableadas en el frontend esta sesión. Sin ellas, las
rutas correspondientes devuelven 500:

| Migración | Crea |
|---|---|
| `20260511_0001_companies_table.sql` | tabla `companies` + FK `company_id` en customers |
| `20260511_0002_customer_enhancements.sql` | `contact_type`, `custom_attributes`, flag `blocked` |
| `20260511_0003_automation_macros_assignments_hours.sql` | `automation_rules`, `macros`, `assignment_policies`, `working_hours` |
| `20260511_0004_inboxes_contact_inboxes_canned_responses.sql` | `inboxes`, `contact_inboxes`, `canned_responses` |
| `20260511_0005_sla_csat_reporting.sql` | `sla_policies`, `sla_events`, `applied_slas`, `csat_survey_responses`, reporting |
| `20260511_0006_ai_guardrails_tools_scenarios_embeddings.sql` | guardrails, tools, scenarios, embeddings, copilot_threads, MCP |
| `20260511_0007_knowledge_mentions_notifications_flows_roles_calls.sql` | mentions, notifications, custom_filters, email_templates, visual_flows, custom_roles, calls |
| `20260511_0008_agent_tables.sql` | `agent_conversations`, `agent_messages` |
| `20260511_0009_agent_memory.sql` | `agent_core_memory` |

> Nota sobre `macros`: existen DOS migraciones (`20260506_0003` con label/body/shortcut/shared —
> la real — y `20260511_0003` con name/actions/visibility, que es `CREATE IF NOT EXISTS` y por tanto
> no-op si la primera ya corrió). El contrato válido es **label/body/shortcut/shared**.

---

## 2. Seed (datos de ejemplo)

```bash
npm run seed:supabase-demo     # tsx seed_sample_data.ts
# o  npm run seed:demo         # psql $DATABASE_URL -f scripts/seed-demo.sql
```

También hay un trigger de "big-seed" dentro de la app (ver commit 39a5a9b en histórico).

---

## 3. Validación en navegador tras reactivar

Con CRMAI activa, validar en runtime lo cableado por compilación esta sesión (ver
`git log` — commits de esta rama):

- **Macros**: crear / duplicar / guardar (body editable) / borrar.
- **PersonalView**: editar nombre (`iamApi.updateMe`) + subir avatar (`iamApi.uploadAvatar`).
- **SecurityView**: cambio de contraseña (`iamApi.changePassword`) + sesiones activas + revocar.
- **Companies**: lista real (`companiesApi.list`) + crear (`companiesApi.create`) + borrar (`companiesApi.delete`).
- **Notifications**: `count` / `markRead(id)` / `markAllRead(userId)` (rutas corregidas).

---

## 4. Backend NUEVO añadido sin poder ejecutarlo (aplicar + probar al reactivar)

> Esta sección se irá ampliando conforme se construya backend nuevo a ciegas.
> Cada entrada incluye: migración a aplicar, rutas nuevas, y qué probar.

### 4.1 — Labels / Etiquetas (commit de esta sesión)

Pantalla **Etiquetas** (LabelsView): antes gestionaba etiquetas solo en memoria.
Ahora tiene backend completo. Construido y validado por compilación (build + tsc
frontend y servidor), **sin ejecutar contra la BD todavía**.

**Migración a aplicar:** `supabase/migrations/20260703_0001_labels.sql`
→ crea la tabla `public.labels` (id, tenant_id, workspace_id, name, color,
created_by, created_at, updated_at; UNIQUE(tenant_id, workspace_id, name)).

**Archivos nuevos:**
- `server/data/labels.ts` — CRUD (list/get/create/update/delete), patrón copiado de `cannedResponses`.
- `server/routes/labels.ts` — `GET /api/labels`, `POST /api/labels`, `PATCH /api/labels/:id`, `DELETE /api/labels/:id` (montado en `server/index.ts`).
- `labelsApi` en `src/api/client.ts` (list/create/update/delete).

**Qué probar al reactivar la BD:**
1. Ir a Ajustes → Etiquetas. La lista debe cargar (`GET /api/labels`) — vacía al principio.
2. "+ Nueva etiqueta" → escribir nombre → Crear. Debe persistir (`POST`) y reaparecer tras refetch.
3. Crear una con nombre duplicado → debe dar 409 (constraint UNIQUE) y mostrar error.
4. Hover en una fila → "Eliminar" → debe borrar (`DELETE`) y desaparecer.
5. Recargar la página → las etiquetas creadas siguen ahí (persistencia real).

**Pendiente (no bloqueante):** los contadores de uso por etiqueta
(personas/empresas/conversaciones/mensajes/artículos/respuestas) se muestran como 0 —
requieren un sistema de aplicación de etiquetas a entidades + agregación, aún no construido.

### 4.2 — Topics / Temas (commit de esta sesión)

Pantalla **Temas** (TopicsView): antes gestionaba temas solo en memoria. Backend nuevo completo.

**Migración a aplicar:** `supabase/migrations/20260703_0002_topics.sql`
→ tabla `public.topics` (id, tenant_id, workspace_id, name, color, archived, timestamps;
UNIQUE(tenant_id, workspace_id, name)).

**Archivos nuevos:**
- `server/data/topics.ts` — CRUD + flag `archived`.
- `server/routes/topics.ts` — `GET /api/topics` (`?includeArchived=true`), `POST`, `PATCH /:id` (rename/recolor/archive), `DELETE /:id` (montado en `server/index.ts`).
- `topicsApi` en `src/api/client.ts`.

**Qué probar al reactivar la BD:**
1. Ajustes → Temas: la lista carga (`GET /api/topics`), vacía al principio.
2. Escribir nombre + "Añadir" → persiste (`POST`) con color auto-asignado, reaparece tras refetch.
3. Nombre duplicado → 409.
4. "Archivar" en un tema → `PATCH {archived:true}` → desaparece de la lista (que excluye archivados).
5. Recargar → los temas persisten.

### 4.3 — Webhook subscriptions / Centro para desarrolladores (commit de esta sesión)

Pantalla **Centro para desarrolladores** (DeveloperView), pestaña Webhooks: antes gestionaba
suscripciones de webhook solo en memoria. Backend nuevo (solo la suscripción; la ENTREGA de
eventos a esas URLs es otra pieza, no construida todavía).

**Migración a aplicar:** `supabase/migrations/20260703_0003_webhook_subscriptions.sql`
→ tabla `public.webhook_subscriptions` (id, tenant_id, workspace_id, url, events jsonb, active,
created_by, timestamps).

**Archivos nuevos:**
- `server/data/webhookSubscriptions.ts` — CRUD.
- `server/routes/webhookSubscriptions.ts` — `GET/POST/PATCH/DELETE /api/webhook-subscriptions` (montado). Path distinto de `webhookRouter` (entrante) para no colisionar.
- `webhookSubscriptionsApi` en `src/api/client.ts`.

**Qué probar al reactivar la BD:**
1. Ajustes → Centro para desarrolladores → pestaña Webhooks: la lista carga (`GET`), vacía al principio.
2. Pegar una URL válida + "Añadir" → persiste (`POST`, evento por defecto `conversation.created`).
3. URL inválida → 400 (validación zod `.url()`).
4. "Eliminar" en una fila → `DELETE` → desaparece.
5. Recargar → persisten.

**Pendiente (no bloqueante):** la ENTREGA real de eventos a las URLs suscritas (disparar POST a
cada webhook cuando ocurre un evento) — requiere enganchar al event bus del servidor. Feature aparte.

### 4.4 — Ticket types / Folios de atención · pestaña "Tipos" (commit de esta sesión)

Pantalla **Folios de atención** (TicketsView), pestaña **Tipos**: antes hardcoded. Ahora usa backend real.
(Las pestañas **Estados** —relación many-to-many— y **Portal** —settings-blob— siguen pendientes; ver tarea flaggeada del sistema de tickets.)

**Migración a aplicar:** `supabase/migrations/20260703_0004_ticket_types.sql`
→ tabla `public.ticket_types` (id, tenant_id, workspace_id, name, description, icon, category
CHECK('customer'|'follow_up'|'back_office'), created_by, timestamps).

**Archivos nuevos:**
- `server/data/ticketTypes.ts` + `server/routes/ticketTypes.ts` (`GET/POST/PATCH/DELETE /api/ticket-types`, montado).
- `ticketTypesApi` en `src/api/client.ts`.

**Qué probar al reactivar la BD:**
1. Ajustes → Folios de atención → pestaña Tipos: las 3 secciones (Clientes/Seguimiento/Back-office) cargan de `GET /api/ticket-types`, vacías al principio.
2. "+ Crear tipo" en cualquier sección → prompt de nombre → persiste (`POST`) con esa `category` → aparece en su sección + el contador `(N)` sube.
3. "Eliminar" en un tipo → `DELETE` → desaparece.
4. Recargar → persisten.

### 4.5 — Ticket states / pestaña "Estados" (commit de esta sesión)

TicketsView pestaña **Estados**: antes hardcoded. Ahora usa backend real. (Queda pendiente solo la
relación many-to-many estado↔tipo y la pestaña Portal — ver tarea del sistema de tickets.)

**Migración a aplicar:** `supabase/migrations/20260703_0005_ticket_states.sql`
→ tabla `public.ticket_states` (internal_label, client_label, category
CHECK('submitted'|'in_progress'|'waiting_customer'|'resolved'), color, sort_order, timestamps).

**Archivos nuevos:**
- `server/data/ticketStates.ts` + `server/routes/ticketStates.ts` (`GET/POST/PATCH/DELETE /api/ticket-states`, montado).
- `ticketStatesApi` en `src/api/client.ts`.

**Qué probar al reactivar la BD:**
1. Ajustes → Folios de atención → pestaña Estados: los 4 grupos (Enviado/En curso/Esperando/Resuelto) cargan de `GET /api/ticket-states`, vacíos al principio.
2. "+ Añadir estado" en un grupo (o "+ Crear estado" en el header) → prompts de etiqueta interna + etiqueta de cliente → persiste (`POST`) en esa categoría → aparece en su grupo con el contador actualizado.
3. "Eliminar" en un estado → `DELETE` → desaparece.
4. Recargar → persisten.

### 4.6 — Tickets · pestaña "Portal" (settings-blob, commit de esta sesión)

TicketsView pestaña **Portal**: el toggle "Habilitar el portal de folios de atención" + botón
"Guardar cambios" ahora persisten vía settings-blob (`workspacesApi.updateSettings` con clave
`ticket_portal_enabled`) — sin backend nuevo ni migración. Hidrata de `wsCtx.settings.ticket_portal_enabled`.
Con esto TicketsView queda funcional en sus 3 pestañas (Tipos, Estados, Portal). Pendiente solo la
relación many-to-many estado↔tipo (enhancement).

**Qué probar:** activar/desactivar el toggle del portal + "Guardar cambios" → persiste; recargar mantiene el valor.

### 4.7 — Custom object types / Objetos personalizados · registro de tipos (commit de esta sesión)

Pantalla **Objetos personalizados** (CustomObjectsView): antes lista hardcoded. Ahora el REGISTRO de
tipos usa backend real (los campos dinámicos + registros por tipo son una feature aparte, no construida —
los contadores muestran 0).

**Migración a aplicar:** `supabase/migrations/20260703_0006_custom_object_types.sql`
→ tabla `public.custom_object_types` (name, object_key UNIQUE por workspace, description, icon, timestamps).

**Archivos nuevos:**
- `server/data/customObjectTypes.ts` (con slugify de la clave) + `server/routes/customObjectTypes.ts` (`GET/POST/PATCH/DELETE /api/custom-object-types`, montado).
- `customObjectTypesApi` en `src/api/client.ts`.

**Qué probar al reactivar la BD:**
1. Ajustes → Objetos personalizados: la lista carga (`GET`), vacía al principio.
2. "+ Nuevo objeto" → prompt de nombre → persiste (`POST`, clave auto-slugificada) → aparece la tarjeta.
3. Clave duplicada → 409.
4. Hover en una tarjeta → "Eliminar" → `DELETE` → desaparece.
5. Recargar → persisten.

**Pendiente (feature aparte, mayor):** campos dinámicos por tipo (`custom_object_fields`) y registros
(`custom_object_records` con data JSONB) + su UI. Requiere la BD activa para validar el esquema dinámico.
