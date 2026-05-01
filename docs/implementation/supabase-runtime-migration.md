# Supabase Runtime Migration

## Objetivo
Dejar Supabase preparado para convertirse en la base de datos principal del runtime actual del SaaS, cubriendo:

- el esquema completo vigente en `server/db/schema.sql`
- las ampliaciones reales introducidas en `server/db/migrate.ts`
- las tablas operativas de agentes, approvals, reconciliation, workflows, knowledge, billing y cola

## Estado actual del código

Hoy el backend sigue ejecutando contra SQLite mediante `better-sqlite3` en:

- [server/db/client.ts](C:\Users\usuario\OneDrive%20-%20Universidad%20Politécnica%20de%20Cartagena\Documentos\Claude\Crm_Ai\server\db\client.ts)

Eso significa que **ejecutar SQL en Supabase no cambia todavía el runtime**. Lo que sí deja es:

- Supabase con el esquema completo listo
- una base consistente para la siguiente fase de migración del backend
- compatibilidad estructural con las tablas y columnas actuales del sistema

## Scripts recomendados

### Opción A — Proyecto Supabase nuevo
Ejecuta primero:

- [phase-0-0-supabase-full-baseline.sql](C:\Users\usuario\OneDrive%20-%20Universidad%20Politécnica%20de%20Cartagena\Documentos\Claude\Crm_Ai\docs\sql\phase-0-0-supabase-full-baseline.sql)

Después ejecuta:

- [phase-0-1-supabase-runtime-delta.sql](C:\Users\usuario\OneDrive%20-%20Universidad%20Politécnica%20de%20Cartagena\Documentos\Claude\Crm_Ai\docs\sql\phase-0-1-supabase-runtime-delta.sql)

### Opción B — Instancia Supabase donde ya ejecutaste los scripts históricos por fases
Ejecuta solo:

- [phase-0-1-supabase-runtime-delta.sql](C:\Users\usuario\OneDrive%20-%20Universidad%20Politécnica%20de%20Cartagena\Documentos\Claude\Crm_Ai\docs\sql\phase-0-1-supabase-runtime-delta.sql)

## Qué cubre el baseline

- Identity & governance
- Customers e identity linking
- Cases y conversaciones
- Orders, payments, refunds y returns
- Reconciliation
- Approval engine
- Execution plans y tool attempts
- Workflows
- Knowledge & policy engine
- Connectors, webhook events y canonical events
- Agents, versions, runs y links con knowledge
- Audit, billing, roles, members y feature flags
- Jobs queue y schema tracking

## Qué cubre el delta

- columnas añadidas por migraciones incrementales del runtime
- índices operativos recientes
- compatibilidad de `payments.workspace_id`
- compatibilidad de `agent_runs.workspace_id`, `status`, `summary`, `output`, `error_message`, `finished_at`
- soporte de `case_knowledge_links`
- soporte de `linked_identities.tenant_id`, `workspace_id`, `verified_at`

## Siguiente paso técnico tras ejecutar estos SQL

Una vez Supabase tenga este esquema, el siguiente bloque de implementación en código será:

1. introducir una capa `db provider`
2. abstraer `getDb()` para `sqlite | supabase`
3. migrar rutas/servicios críticos a consultas compatibles con Supabase
4. mover seeds y bootstrap al nuevo provider

Hasta entonces, Supabase quedará **preparado**, pero el runtime seguirá leyendo/escribiendo en SQLite.
