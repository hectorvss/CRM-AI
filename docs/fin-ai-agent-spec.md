# Fin AI Agent — especificación del agente de soporte

> **Qué es.** Fin AI Agent es el agente autónomo de cara al cliente: el que conversa
> constantemente con los usuarios finales en todos los canales (chat/widget, email,
> WhatsApp, teléfono…), resuelve solo lo que puede resolver con confianza y escala el
> resto a humanos con el mejor borrador posible.
>
> **Qué NO es.** No es el súper agente del operario (`server/agents/chatAgent` en modo
> `operator`, el copiloto del dashboard). Son dos sistemas **desacoplados por diseño**,
> replicando la separación Max ↔ Conversations de PostHog (ver
> [posthog-support-agent-analysis.md](posthog-support-agent-analysis.md)). Comparten
> solo la capa de datos y el catálogo de tools; nada más.
>
> Fuente de diseño: pipeline `products/conversations` de PostHog (repo local Txlemetry).
> Regla del proyecto: **portar antes que inventar** — prompts, constantes, umbrales y
> flujos se copian/adaptan de ahí citando el origen.

---

## 1. Principios

1. **Completamente configurable.** Toda decisión del agente (si responde, cómo, en qué
   canales, con qué tono, con qué límites) es configuración por workspace, no código.
   La superficie de configuración ya existe como UI (las pantallas Fin del prototipo,
   §5); esta spec define las claves que hay detrás.
2. **Contexto amplio.** El agente no responde "de memoria del modelo": responde con
   (a) la conversación completa, (b) la base de conocimiento del workspace (RAG),
   (c) los datos reales del cliente (pedidos, pagos, casos previos, eventos de sesión)
   y (d) la memoria persistente del workspace (CoreMemory). Presupuestos de tokens por
   fuente y compactación de ventana (~100k) para no desbordar.
3. **Capacidad completa, con puertas.** El agente puede *leer* todo (superficie
   `support_readonly` del toolkit, hoy 61 tools) y *actuar* solo a través de gates:
   borrador privado por defecto, publicación solo con opt-in por canal+tipo, acciones
   de escritura solo vía procedimientos aprobados (§7).
4. **Seguro por defecto.** Safety gate de entrada (prompt injection) y de salida (PII/
   exfiltración) como etapas separadas del pipeline. Lo que no pasa, se escala.
5. **Idempotente y auditable.** Un run por ticket con ID determinista
   (`support-reply-<case_id>`), estado de cada etapa persistido en `ai_triage`,
   todo evento en `audit_events`.

## 2. Arquitectura (blueprint PostHog Conversations → stack propio)

```
[Canales: widget/email/whatsapp/…]                [Coordinador (cron 1 min)]
        │ crea/actualiza case+conversation                │ gates + caps
        ▼                                                 ▼
   cases / conversations / messages  ◄────────  SupportReplyPipeline (por ticket)
                                                  1. build_context
                                                  2. safety gate entrada
                                                  3. classify (how_to/diagnostic/
                                                     account_billing/unactionable)
                                                  4. loop refine→retrieve→draft→validate
                                                     (máx 5 intentos, confianza ≥ 0.5)
                                                  5. safety gate salida
                                                  6. persist_reply (privado|publicado)
                                                  7. persist_knowledge_gap
```

- **Coordinador**: cron (node-cron en Express; pg_cron cuando haya workers) cada
  1 minuto. Gates: flag maestro, `fin.enabled` por workspace, canal habilitado,
  consentimiento IA de la organización, dedupe (no tocar tickets ya respondidos).
  Debounce: última actividad del cliente hace ≥2 min y ≤5 min. Caps: 10 tickets/
  workspace/tick, 50 global.
- **Pipeline**: cadena de llamadas con estado por etapa en `cases.ai_triage` (JSON)
  para poder reanudar. No hace falta Temporal al principio; una tabla de jobs +
  reintentos basta.
- **Modelos**: utility (classify/refine) = Haiku; drafting/validación = Sonnet.
  Proveedores ya abstraídos en `server/agents/chatAgent/providers/` (Claude primario,
  OpenAI utility, conmutable con `AGENT_PROVIDER`). Reusar, no duplicar.
- **Política de publicación** (copiar tal cual): el mensaje del agente nace
  `is_private=true` (sugerencia interna). Solo se publica al cliente si
  (a) el pipeline terminó con confianza ≥ umbral, (b) el tipo es publicable
  (por defecto **solo `how_to`**), y (c) el workspace activó `bot_reply` para ese
  canal+tipo en `fin.reply_modes`. Si se agotan los intentos: mejor borrador como
  nota interna (`escalated_with_best`) o escalado sin borrador (`escalated_no_reply`).

## 3. Contexto amplio (build_context)

Orden de ensamblado (los bloques estáticos primero, para prompt caching):

1. **System prompt** = identidad + orientación del workspace (§5 Capacitar/Orientación)
   + reglas anti-injection con fences dinámicos alrededor de contenido de terceros.
2. **CoreMemory del workspace** (tabla `agent_core_memory`, ya existe): hechos
   persistentes del negocio (máx ~10k chars).
3. **Conocimiento recuperado** (RAG): `knowledge_articles` + `knowledge_embeddings`
   (ya existen) con rerank; presupuesto propio de tokens.
4. **Datos del cliente** (solo si el tipo lo requiere, §4): perfil de `customers`,
   pedidos/pagos/devoluciones, casos previos, eventos de sesión en ventana ±5 min.
   Allowlist anti-PII sobre propiedades expuestas al modelo.
5. **La conversación** completa (compactada si excede ventana).

## 4. Capacidad: toolkit y scopes por tipo de ticket

La superficie ya existe: `server/agents/chatAgent/toolkit.ts` →
`selectToolkit({ surface: 'support_readonly' })` filtra el catálogo a
`sideEffect === 'read'` y aplica `maxRisk`/`allow`/`block`. Sobre eso:

- **Scopes base** (todo ticket): knowledge:read, case:read (el propio), customer:read
  (el propio, con allowlist).
- **Scopes ampliados por clasificación** — copiar la semántica de PostHog:
  `diagnostic` añade lectura de errores/eventos/sesiones; `account_billing` añade
  billing:read del cliente. `how_to` no añade nada (solo RAG).
- **Escrituras**: NUNCA directas. Solo mediante **Procedimientos** (§5) que compilan a
  workflows aprobados con parámetros tipados (p. ej. "reenviar email de confirmación",
  "crear devolución"), cada uno con su gate de riesgo y su registro de aprobación.
  Implementación: los procedimientos publican una `pending_action` que ejecuta el
  runtime de workflows existente, no el agente.

## 5. Configurabilidad completa — mapeo UI → config

Las pantallas Fin del prototipo (importadas de Figma al 100%, hoy en
`src/prototype/views/FinViews.tsx`) son la superficie de administración. Cada una
gobierna claves reales bajo el blob `workspaces.settings.fin` (o tabla propia donde se
indica):

| Pantalla (FinSubView) | Configura | Claves / almacén |
|---|---|---|
| `allRoles` | Roles del agente (Servicio / Ventas) | `fin.roles[]` |
| `capContent` (Capacitar·Contenido) | Fuentes de conocimiento activas | `knowledge_articles`/`knowledge_domains` + `fin.sources[]` |
| `capGuidance` (Orientación) | Pautas de tono/estilo/contexto (system prompt del workspace) | `fin.guidance[]` (categoría, texto, activa) |
| `capAttributes` (Atributos) | Atributos que el agente extrae por conversación (sentiment, urgency, complexity…) | `fin.attributes[]` → escribe en `ai_triage.attributes` |
| `capEscalation` (Escalamiento) | Reglas + pautas de escalado (cuándo pasar a humano, a qué equipo) | `fin.escalation.rules[]` |
| `capProcedures` (Procedimientos) | Acciones ejecutables (las únicas escrituras permitidas) | `fin.procedures[]` → workflows |
| `pruebaTesting` (Pruebas) | Playground de evaluación con preguntas + rating Bueno/Aceptable/Malo | `ai_feedback` (existe) |
| `depChat` / `depEmail` / `depPhone` (Despliegue) | Activación e identidad por canal | `fin.channels.{chat,email,phone}.{enabled, reply_mode}` |
| `anaPerformance` / `anaTopicTrends` / `anaMonitor` (Analizar) | Solo lectura: resolución, temas, monitores | `reporting_events` + `ai_triage` agregados |
| `changelog` | Solo lectura: histórico de cambios de config del agente | `audit_events` (scope fin) |
| `settings` | Identidad, límites de uso/alertas, multilingüe, formalidad, botones de respuesta | `fin.identity`, `fin.limits`, `fin.locale` |
| `settingsAudiences` | Segmentación: a qué usuarios responde el agente | `fin.audiences[]` |
| `finWorkflows` / `finSimpleAutomations` | Orquestación alrededor del agente | `visual_flows` / `automation_rules` (existen) |
| `studio*` (AI Studio legacy) | Catálogo avanzado de agentes/permn./safety | migrar gradualmente a las claves `fin.*` |

**Regla:** ninguna pantalla Fin debe guardar estado solo-frontend. Si falta el
endpoint, se añade al settings-blob (`PATCH /workspaces/settings` con merge profundo,
patrón ya usado por HelpCenter/Tickets-Portal).

Claves centrales del blob (resumen):

```jsonc
fin: {
  enabled: false,                      // flag maestro por workspace
  reply_modes: {                       // política de publicación por canal+tipo
    chat:  { how_to: "bot_reply", diagnostic: "draft_only", account_billing: "draft_only" },
    email: { how_to: "draft_only", "*": "off" }
  },
  confidence_threshold: 0.5,           // umbral del loop draft→validate
  max_attempts: 5,
  debounce_minutes: 2,
  caps: { per_workspace_tick: 10 },
  identity: { name: "Fin", tone: "…", formality: "tú", languages: ["es","en"] },
  guidance: [...], escalation: {...}, procedures: [...], audiences: [...],
  limits: { daily_replies: null, alert_email: null }
}
```

## 6. Modelo de datos (reuso máximo)

Ya existe casi todo: `cases` (ticket: status/priority/assigned/SLA vía `applied_slas`),
`conversations` + `messages` (hilo omnicanal; el merge por conversation_id ya está
arreglado en `server/data/cases.ts`), `knowledge_*`, `agent_core_memory`,
`ai_feedback`, `csat_survey_responses`, `audit_events`. Añadir:

1. `cases.ai_triage JSONB` — estado del pipeline por etapa + clasificación + confianza
   + attempts (equivalente al `ai_triage` de PostHog). **Migración nueva.**
2. `cases.ai_resolved BOOLEAN` + `cases.escalation_reason TEXT`. **Misma migración.**
3. `messages.is_private BOOLEAN DEFAULT false` + `messages.author_type`
   (customer/support/ai) + `messages.citations JSONB` + `messages.confidence REAL` —
   si alguna ya existe, no duplicar. **Misma migración.**
4. `fin_knowledge_gaps` (workspace, case_id, gap_text, status) — alimenta Capacitar.

## 7. Seguridad

- Safety gates de entrada/salida como llamadas utility separadas (portar prompts).
- Allowlist de propiedades de cliente expuestas al modelo (anti-PII).
- Fences dinámicos alrededor de todo contenido de origen externo (mensajes del
  cliente, artículos, resultados de tools) + reglas anti-injection en el system prompt.
- El agente jamás ve secretos (tokens de canal, API keys) ni puede llamar tools de
  escritura; los procedimientos ejecutan en el runtime de workflows con su propio RBAC.
- Todo run y toda publicación → `audit_events`.
- Recordatorio de plataforma (independiente del agente): RLS sigue deshabilitado en
  las 110 tablas — ver [[supabase]] / memoria del proyecto. Debe resolverse antes de
  exponer el widget público.

## 8. Fases de implementación

- **F0 (hecho)**: toolkit con superficie `support_readonly` (61 tools read-only),
  providers Claude/OpenAI, stores `agent_conversations`/`agent_core_memory`,
  UI Fin completa (fidelidad Figma), inbox omnicanal con hilo real.
- **F1 — Config real**: claves `fin.*` en settings-blob + wiring de las pantallas
  Capacitar/Despliegue/Settings (hoy parcialmente estáticas). Migración `ai_triage`.
- **F2 — Pipeline mínimo**: coordinador cron + classify + RAG (embeddings ya
  existentes) + draft + validate + gates + persist como borrador privado en el hilo
  (visible en el inbox como sugerencia). Sin publicación automática.
- **F3 — Publicación gated**: `reply_modes` por canal+tipo, empezar por chat/how_to.
  CSAT post-resolución. Knowledge gaps → Capacitar.
- **F4 — Procedimientos**: acciones de escritura vía workflows aprobados + aprobación
  humana en inbox. Scopes diagnostic (eventos/errores del cliente).
- **F5 — Analizar**: rellenar Desempeño/Temas/Monitores con datos reales de
  `ai_triage`/`reporting_events`.

## 9. Decisiones copiadas tal cual de PostHog (no re-litigar)

- Mensajes IA privados por defecto; publicación gated por tipo+canal+opt-in.
- Debounce de 2 min (no responder mientras el cliente sigue escribiendo).
- IDs de run deterministas por ticket (cero borradores duplicados).
- Safety gates entrada/salida como etapas separadas.
- Loop draft→validate con umbral de confianza y realimentación de gaps.
- Escalado a humano SIEMPRE con el mejor borrador adjunto.
- Registro de knowledge gaps que alimenta la base de conocimiento.
- Modelos: utility barato para clasificar, modelo fuerte para redactar/validar.
