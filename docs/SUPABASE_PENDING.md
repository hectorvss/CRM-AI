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

_(vacío por ahora — se rellenará en los próximos commits)_
