# Análisis: arquitectura del agente de customer support de PostHog/Txlemetry

> Fuente: repo local `Documentos/Claude/Txlemetry` (fork de PostHog). Fecha de análisis: 2026-07-15.
> Objetivo: replicar esta arquitectura en CRM-AI para tener un agente con acceso y control total del customer support.

## Hallazgo principal: son TRES sistemas de IA distintos

PostHog no tiene "un agente de soporte", tiene tres capas que conviene distinguir porque se copian por separado:

| Sistema | Ubicación | Qué es | Complejidad |
|---|---|---|---|
| 1. Support Sidebar Max (legacy) | `ee/support_sidebar_max/` | Chatbot Q&A sobre docs, request/response simple | Baja (4 archivos) |
| 2. Max / PostHog AI (plataforma) | `ee/hogai/` + `products/*/backend/max_tools.py` | Agente ReAct multi-producto que controla toda la app | Alta |
| 3. Conversations AI pipeline | `products/conversations/backend/temporal/` | Pipeline autónomo que responde tickets de soporte | Media-alta |

**Para el objetivo de "control absoluto del customer support", el sistema 3 (Conversations) es el corazón, y el sistema 2 (Max/MaxTools) es el patrón de plataforma que le da al agente control de toda la app.**

---

## Sistema 1 — Support Sidebar Max (el diseño mínimo viable)

`ee/support_sidebar_max/` — 4 archivos: `views.py`, `sidebar_max_ai.py`, `max_search_tool.py`, `prompt.py`.

- **Endpoint único**: `POST /chat` en un ViewSet DRF (`MaxChatViewSet`). Sin streaming.
- **LLM**: Anthropic directo (`claude-3-5-sonnet`), con prompt caching (`cache_control: ephemeral`).
- **Una sola tool** (`max_search_tool`): busca en posthog.com vía sitemap XML + BeautifulSoup, con scoring heurístico de relevancia por keywords y priorización por tipo de query (docs/pricing/status...).
- **Historial**: en caché Django/Redis con TTL 1h, clave `support_max_conversation_{session_id}`. No hay persistencia en BD.
- **Loop agéntico manual**: `while stop_reason == "tool_use"`: ejecutar tool → añadir tool_result → reenviar.
- **Rate limiting**: token-bucket propio (requests / input_tokens / output_tokens) sincronizado con headers `anthropic-ratelimit-*`; truncado de contexto si >190k tokens (conserva primer y último mensaje).

Útil como referencia de "versión 0": es lo que se puede montar en un día.

---

## Sistema 2 — Max / PostHog AI (`ee/hogai/`): la plataforma de agente

### Flujo de alto nivel

```
Frontend (POST /api/environments/{team}/conversations/)
  → ConversationViewSet.create (ee/api/conversation.py)
  → arranca Temporal Workflow "chat-agent" (ChatAgentWorkflow)
  → ChatAgentRunner ejecuta grafo LangGraph
  → el grafo escribe eventos en Redis Stream (conversation-stream:{id})
  → AgentExecutor (ee/hogai/core/executor.py) lee el Redis Stream
  → sse_streaming_response() → SSE al navegador
```

### Grafo LangGraph (`chat_agent/graph.py`)

`AssistantGraph.compile_full_graph()` ensambla con patrón builder:
- `TITLE_GENERATOR` — título + clasificación de topic.
- `SLASH_COMMAND_HANDLER` — comandos `/init`, `/remember`, `/usage`, `/feedback`, `/ticket`.
- Nodos de memoria (onboarding + collector) — mantienen `CoreMemory` por equipo.
- **`ROOT` ⇄ `ROOT_TOOLS`** — el loop ReAct central (`core/agent_modes/executables.py`):
  - `AgentExecutable` (ROOT): bind_tools con `parallel_tool_calls=True`, `MAX_TOOL_CALLS=24`, extended thinking (`budget_tokens: 10240`), compactación de ventana a ~100k tokens.
  - Router: si el último mensaje tiene `tool_calls` → fan-out con `Send()` de LangGraph (una instancia de ROOT_TOOLS por tool call, en paralelo); si no → END.
  - `AgentToolsExecutable` (ROOT_TOOLS): ejecuta la tool, captura `MaxToolError`/`GraphInterrupt`, produce `AssistantToolCallMessage` con `ui_payload` para el frontend.

### Modos de agente

`AgentMode` enum: product_analytics, sql, session_replay, error_tracking, plan, execution, survey, research, flags, llm_analytics, sandbox, user_interview, customer_analytics. Cada modo = `AgentModeDefinition` (toolkit + nodos + prompts, presets en `core/agent_modes/presets/`). Se cambia con la tool `switch_mode`.

### MaxTools: el patrón clave para "controlar toda la app"

- Clase base `MaxTool` (`ee/hogai/tool.py`) hereda de LangChain `BaseTool`. Contrato:
  - `name` (debe coincidir con el type `AssistantTool` del schema compartido front/back)
  - `description`, `args_schema` (Pydantic), `context_prompt_template`
  - `async _arun_impl(...) -> tuple[str, Any]` → (mensaje para LLM, artifact para UI)
  - `is_dangerous_operation()` → si True, `interrupt(ApprovalRequest)` pausa el grafo y pide aprobación humana en el frontend (tarjeta `DangerousOperationApprovalCard`), decisiones guardadas en `Conversation.approval_decisions`.
  - `get_required_resource_access()` → RBAC a nivel de recurso; `check_object_access()` a nivel de objeto.
  - `request_client_execution()` → tools que se ejecutan en el navegador y reanudan el grafo con el resultado.
- **Auto-descubrimiento** (`registry.py`): `__init_subclass__` registra cada subclase; `_import_max_tools()` importa `products.*.backend.max_tools` con pkgutil. Convención: cada producto define sus tools en `products/<producto>/backend/max_tools.py`.
- **Montaje frontend**: componente `<MaxTool name=... context={...} callback={...}>` envuelve la UI automatizable; la tool solo está disponible cuando su UI está montada. Metadatos display en `TOOL_DEFINITIONS` (`max-constants.tsx`).
- ~70 tools registradas (create_insight, execute_sql, upsert_dashboard, create_feature_flag, create_survey, search_session_recordings, web_search, manage_memories, create_task...). 20 archivos `max_tools.py` en productos + tools core en `ee/hogai/tools/`.

### Persistencia del estado (checkpointer LangGraph sobre Postgres/Django)

`ee/hogai/django_checkpoint/checkpointer.py` — `DjangoCheckpointer(BaseCheckpointSaver)`. Modelos en `products/posthog_ai/backend/models/assistant.py`:

| Modelo | Tabla | Rol |
|---|---|---|
| `Conversation` | `ee_conversation` | Hilo: status (idle/in_progress/canceling), type (assistant/tool_call/deep_research/slack), topic, title, agent_runtime, approval_decisions JSON |
| `ConversationCheckpoint` | `ee_conversationcheckpoint` | Snapshot del grafo (checkpoint JSONB + metadata, self-FK a parent, namespace de subgrafos) |
| `ConversationCheckpointBlob` | `ee_conversationcheckpointblob` | Valores de canales serializados (binario), único por (thread, ns, channel, version) |
| `ConversationCheckpointWrite` | `ee_conversationcheckpointwrite` | Escrituras pendientes (clave para resume-from-interrupt) |
| `CoreMemory` | `ee_corememory` | Memoria persistente por equipo (máx 10k chars) |
| `AgentArtifact` | `ee_agentartifact` | Artefactos generados (visualizaciones, notebooks) con short_id |

`thread_id` del checkpointer = `conversation.id`. El historial se lee recompilando el grafo y haciendo `aget_state()` (no hay tabla de "mensajes": los mensajes viven dentro del estado checkpointeado).

### Streaming

- **Redis Streams** como bus: worker Temporal escribe con XADD (`conversation-stream:{conversation_id}`, maxlen 1000, TTL 30 min); Django lee con XREAD (block 50ms) y reemite por SSE con keepalive 15s.
- Eventos tipados: `MessageEvent`, `UpdateEvent`, `GenerationStatusEvent` (ack/error), `ApprovalEvent`, `StreamStatusEvent` (complete/error).
- Frontend: fetch + `response.body.getReader()` (no EventSource), en `maxThreadLogic.tsx` (Kea). Cola de hasta 2 mensajes encolables mientras el agente trabaja (`ConversationQueueStore` sobre Redis con lock distribuido).

### Contexto e inyección

`AssistantContextManager` (`context/context.py`): convierte el `ui_context` del mensaje humano (dashboards, insights, eventos, notebooks...) en `ContextMessage`s insertados ANTES del mensaje humano (para caching). Presupuestos de tokens (p.ej. dashboard: 50k), ejecución paralela de queries, y defensa anti prompt-injection en contenido de notebooks (fences dinámicos + reglas explícitas).

### LLMs

- Root agent: `MaxChatAnthropic` con **claude-sonnet-4-6**, streaming, interleaved thinking, fine-grained tool streaming, max_tokens 16384.
- Taxonomy agent (subgrafo RAG de eventos/propiedades): `MaxChatOpenAI` con gpt-4.1, `tool_choice="required"`.
- Gateway LLM interno opcional (`LLM_GATEWAY_URL`) con fallback Bedrock/Anthropic por feature flag.
- Mixin común inyecta contexto proyecto/org/usuario al system prompt y emite eventos `$ai_generation` para observabilidad (su propio producto LLM Analytics).

---

## Sistema 3 — Conversations (`products/conversations/`): el customer support real

**Dato clave: NO usa Max/hogai.** Es un pipeline Temporal propio, desacoplado. No hay `max_tools.py` en este producto.

### Modelo de datos

- **`Ticket`** (`backend/models/ticket.py`, tabla `posthog_conversations_ticket`) — entidad central:
  - `ticket_number` autoincremental por equipo (SELECT FOR UPDATE sobre Team para serializar).
  - `channel_source` (widget/email/slack/teams/github) + `channel_detail` + campos específicos por canal (slack_thread_ts, teams_conversation_id, github_issue_number, email_config/subject/from/cc...).
  - **`status`: new → open → pending → on_hold (snooze) → resolved**. `priority`: low/medium/high.
  - `widget_session_id` (control de acceso anónimo), `distinct_id` (link a Person), `anonymous_traits`.
  - IA: `ai_resolved`, `escalation_reason`, `ai_triage` (JSON con el resultado del pipeline).
  - Stats denormalizados por signals: `message_count`, `last_message_at`, `last_message_text`, `unread_customer_count`, `unread_team_count`.
  - SLA (`sla_due_at`) y snooze (`snoozed_until`, reabierto por task periódica `wake_snoozed_tickets`).
- **Los mensajes NO tienen modelo propio**: son `Comment` genérico de PostHog con `scope="conversations_ticket"`, `item_id=ticket.id`. La semántica va en `item_context` JSON: `author_type` (customer/support/AI/human), `is_private` (nota interna vs visible al cliente), `citations`, `confidence`.
- Auxiliares: `TicketAssignment` (usuario XOR rol, CheckConstraint), `TicketView` (vistas guardadas del inbox), `EmailChannel`, configs Slack/Teams, `EmailMessageMapping`/`GithubCommentMapping` (threading + idempotencia), `EmailOutboxMessage` (outbox con reintentos), `ConversationRestoreToken`.

### Entrada omnicanal

- **Widget** embebible (posthog-js): `POST /api/conversations/v1/widget/message` — crea ticket + comment. Auth: `widget_session_id` para anónimos, o HMAC (`identity_hash` firmado con secret del equipo) para identificados. Honeypot + validación de Origin + throttling.
- **Email**: webhook Mailgun inbound → threading por In-Reply-To/References → dedupe con EmailMessageMapping.
- **Slack / Teams / GitHub**: webhooks de eventos → tareas Celery que crean/actualizan Ticket+Comment.

### Salida omnicanal (fan-out por signals)

Signal `post_save` sobre Comment: si es respuesta saliente (equipo o IA pública), despacha Celery al canal de origen (`post_reply_to_slack`, `send_email_reply` vía outbox, `post_reply_to_teams`, `post_reply_to_github`), con guardas anti-echo (`from_slack`, etc.). Además actualiza stats, contadores de no-leídos, cachés y notificaciones.

### El pipeline de IA (Temporal)

**Coordinador** (`temporal/coordinator.py`, schedule cada 1 minuto):
- Busca tickets `new`/`open` con última actividad del cliente hace ≥2 min (debounce "settle") y ≤5 min (lookback).
- Gates: feature flag maestro, `ai_suggestions_enabled` por equipo, canales habilitados, consentimiento de procesado de datos IA de la organización, y dedupe (salta tickets ya respondidos por alguien).
- Caps: 10 tickets/equipo/tick, 50 global. Lanza workflows hijos con ID determinista `support-reply-<ticket_id>` (idempotencia).

**Pipeline** (`temporal/pipeline.py`, `SupportReplyWorkflow`) — etapas:
1. `build_context` — formatea la conversación + enriquece con eventos/excepciones de la sesión (ClickHouse, ventana ±5 min) + propiedades de la Person (con allowlist anti-PII).
2. `record_triage` — marca in_progress en `ticket.ai_triage`.
3. **Safety gate de entrada** (`safety_filter`) — bloquea prompt-injection/exfiltración → `blocked_unsafe`.
4. `classify` — tipo de ticket: `how_to` / `diagnostic` / `account_billing` / `unactionable` (+ seed queries). Spam/feedback → `skipped_unactionable`.
5. **Bucle refine → retrieve → draft → validate** (máx 5 intentos, umbral confianza 0.5):
   - `retrieve`: RAG con rerank sobre Business Knowledge del equipo + docs.
   - `draft`: sesión multi-turno de un agente en sandbox con MCP de solo lectura. Scopes base: `business_knowledge:read`, `project:read`. Si es `diagnostic`, añade `error_tracking:read`, `query:read`, `insight:read`, `session_recording:read`, `logs:read` para investigar los datos reales del cliente.
   - `validate`: un modelo validador puntúa el draft contra las fuentes y devuelve `missing` (gaps) que realimentan el refine.
6. **Safety gate de salida** (`review_reply`, PII/exfil) → si pasa, `persist_reply(allow_bot_reply=True)` → `persisted`.
7. Si se agotan los intentos: el mejor draft se persiste como **nota interna** para revisión humana (`escalated_with_best`) o se escala sin draft (`escalated_no_reply`).
8. `persist_knowledge_gap` — registra lagunas de conocimiento detectadas.

**Política de publicación** (`persist_reply.py`): el comment IA nace `is_private=True` (sugerencia). Solo se publica al cliente si: `allow_bot_reply` + tipo publicable (**solo `how_to`**) + el equipo configuró `bot_reply` para ese canal/tipo en `ai_reply_modes`.

**Modelos**: `UTILITY_MODEL=claude-haiku-4-5` (clasificar/refinar), `VALIDATOR_MODEL=claude-sonnet-4-6`, vía gateway LLM interno.

### Frontend

- Inbox (`SupportTicketsScene`): tabla con filtros (status, priority, canal, SLA, tags, AI triage, búsqueda), selección masiva, vistas guardadas.
- Detalle (`SupportTicketScene`): hilo de chat + controles (status/priority/assignee/SLA/tags/snooze) + paneles laterales: **AIPanel** (triage + knowledge gaps), Exceptions, PreviousTickets, RecentEvents, SessionRecording, Activity.
- Settings: secciones por canal (Email/Slack/Teams/GitHub/Widget) + AISection + dominios autorizados + API keys.
- Editor TipTap (rich content), panel de soporte in-app (SidePanel), notificaciones de navegador y contador de no-leídos.

### MCP

`mcp/tools.yaml` declarativo (generado del OpenAPI): tickets-list, tickets-retrieve, messages-retrieve, reply-create (con warning de que `is_private=false` se entrega al cliente), tickets-update. Scopes `ticket:read` / `ticket:write`.

---

## Blueprint de replicación para CRM-AI

Traducción al stack propio (React+TS+Vite / Express / Supabase):

### Fase 1 — Núcleo de tickets omnicanal (sin IA)
1. Tablas: `ticket` (copiar campos de `Ticket`: status/priority/channel_source/widget_session_id/ai_triage/stats denormalizados/SLA/snooze) + `ticket_message` (equivalente a Comment: author_type, is_private, rich_content, citations). En Supabase, triggers o funciones para stats denormalizados en lugar de signals Django.
2. API: endpoints de gestión (list/detail/reply/compose/bulk_update/unread_count) + API pública de widget con auth por `widget_session_id` / HMAC.
3. Inbox UI + detalle con hilo, ya existente en gran parte en el Prototype.

### Fase 2 — Pipeline de IA de soporte
4. Un scheduler (cron cada 1 min — en Express puede ser node-cron o pg_cron de Supabase) que implemente los gates del coordinador: debounce 2 min, dedupe, opt-in por equipo, caps.
5. El pipeline classify → retrieve → draft → validate → safety gates como cadena de llamadas (no hace falta Temporal al principio; una job queue tipo BullMQ o Supabase Edge Functions + tabla de jobs basta, guardando el estado de cada etapa en `ticket.ai_triage` para reanudar).
6. Política de publicación conservadora idéntica: draft privado por defecto, bot_reply solo para tipos "how_to" con opt-in explícito por canal.

### Fase 3 — Agente de plataforma (patrón MaxTool)
7. Clase base `Tool` con: name/description/schema Zod, `run()` → (texto, artifact), flag de operación peligrosa → interrupt + aprobación en UI, RBAC por recurso.
8. Registro por convención (un `tools.ts` por módulo del CRM) + registro display en frontend (equivalente a TOOL_DEFINITIONS) + componente de montaje contextual.
9. Loop ReAct con checkpointing: guardar estado serializado por conversación (tabla checkpoint) para soportar interrupciones/aprobaciones. LangGraph JS + su checkpointer Postgres es el equivalente directo.
10. Streaming: SSE directo desde Express es suficiente (el salto a Redis Streams solo es necesario con workers separados).

### Decisiones de diseño que merece la pena copiar tal cual
- Mensajes IA privados por defecto; publicación gated por tipo+canal+opt-in.
- Debounce de 2 min antes de que la IA responda (evita responder mientras el cliente sigue escribiendo).
- IDs de workflow deterministas por ticket (idempotencia, cero drafts duplicados).
- Safety gates a la entrada (prompt injection) y a la salida (PII) como etapas separadas.
- Bucle draft→validate con umbral de confianza y realimentación de gaps; lo no confiable se escala a humano con el mejor draft como sugerencia.
- Registro de knowledge gaps → alimenta la base de conocimiento.
- `ui_payload` en resultados de tools para que el frontend reaccione (actualizar la vista que el agente modificó).
- Aprobación humana para operaciones peligrosas vía interrupt del grafo.
