# Fin AI Agent — especificación v2 (arquitectura competitiva)

> **Qué es.** Fin AI Agent es el agente autónomo de cara al cliente de Clain: conversa
> constantemente con los usuarios finales en todos los canales, resuelve de forma
> autónoma (respuestas + acciones reales en sistemas externos) y escala a humanos con
> contexto cuando no debe o no puede resolver.
>
> **Objetivo competitivo.** Paridad funcional con **Fin de Intercom (Fin 3)** — el
> referente del mercado (~76% de resolución media, $0.99/resolución). Esta v2 sustituye
> a la v1 (que replicaba solo el pipeline batch de PostHog Conversations) por una
> arquitectura de motor completo: tiempo real, procedimientos con acciones de
> escritura, testing con simulaciones y un motor de outcomes facturable.
>
> **Qué NO es.** No es el copiloto del operario (`server/agents/chatAgent` en modo
> `operator`). Dos sistemas desacoplados; comparten capa de datos, catálogo de tools y
> providers LLM. Nada más.
>
> Fuentes de diseño: análisis del Fin real (ver §11), pipeline PostHog Conversations
> ([posthog-support-agent-analysis.md](posthog-support-agent-analysis.md)) para los
> patrones de implementación, y el principio del proyecto: portar antes que inventar.

---

## 0. Principios

1. **Completamente configurable** — cada decisión del agente es configuración por
   workspace (§8), administrada desde las pantallas Fin ya existentes en la UI.
2. **Contexto amplio** — conversación completa multi-turno + conocimiento (RAG
   híbrido) + datos reales del cliente + memoria del workspace, con presupuestos de
   tokens por fuente.
3. **Capacidad completa** — no solo responde: **actúa**. Lecturas libres (toolkit
   `support_readonly`) y escrituras reales vía Procedimientos con conectores,
   verificación de identidad y política por-acción (§5).
4. **Seguro por defecto** — safety gates de entrada/salida, validación de grounding
   independiente, escalado automático ante riesgo, todo auditado.
5. **Medible y facturable** — cada conversación termina en exactamente un outcome de
   una taxonomía cerrada (§7); la resolución es la métrica primaria de TODO el sistema
   (hasta del entrenamiento del retrieval).

## 1. El motor — pipeline por mensaje (tiempo real)

A diferencia de la v1 (cron batch cada 1 min), el motor es **event-driven**: cada
mensaje entrante del cliente encola un run. El debounce depende del canal: chat ~5 s
de settle (el cliente puede seguir escribiendo), email 2 min, voz inmediato.
Un run por conversación a la vez (lock por `conversation_id`), ID determinista
`fin-run-<case_id>-<n>` (idempotencia).

```
mensaje del cliente
  │
  ▼
[E1 REFINAR]  safety-in (injection/autolesión/ilegal) · detección de idioma ·
  │           reescritura de la consulta con historial multi-turno ·
  │           chequeo de triggers: ¿procedimiento por intención? ¿custom answer?
  │           ¿workflow? · resolución de audiencia (¿debe Fin atender a este user?) ·
  │           carga de guidance aplicable (ANTES de buscar contenido)
  ▼
[E2 RECUPERAR] retrieval híbrido (§3): vector + full-text sobre todas las fuentes →
  │            ~40 candidatos → rerank → top-k con citas
  ▼
[E3 GENERAR]  con guidance + contexto de cliente + fuentes:
  │             a) si ambigüedad → PREGUNTA DE CLARIFICACIÓN (nunca adivinar)
  │             b) si intención ejecutable → correr PROCEDIMIENTO (§5)
  │             c) si no → redactar respuesta fundamentada con citas
  ▼
[E4 VALIDAR]  juez independiente: ¿responde a la pregunta? ¿fundamentada SOLO en las
  │           fuentes? ¿cumple guidance/políticas? ¿PII/exfiltración? →
  │           score < umbral → reintento con feedback (máx N) o escalado
  ▼
[E5 ENTREGAR] publicar según política del canal (§6) · streaming SSE en chat ·
  │           registrar citas + razonamiento para answer-inspection
  ▼
[E6 OUTCOME]  máquina de estados de la conversación (§7): esperar confirmación /
              timeout → confirmed/assumed resolution · handoff · escalated · abandoned
              → alimenta analytics, facturación y knowledge gaps
```

Etapas E1/E4 usan el modelo utility (barato, rápido); E3 el modelo fuerte. Providers
ya abstraídos en `server/agents/chatAgent/providers/` — reusar.

## 2. Knowledge System (el combustible)

- **Fuentes**: artículos del Help Center (`knowledge_articles`, existe), **snippets**
  internos (contenido solo-para-Fin, no público), **PDFs y URLs** (pipeline de
  ingesta: crawl → extracción → chunking ~500-1000 tokens con solape → embeddings),
  y **conversaciones pasadas resueltas** (curadas: solo hilos con resolución
  confirmada, anonimizados).
- **Targeting por audiencia**: cada pieza de contenido puede restringirse por plan /
  región / marca / canal — el retrieval filtra por la audiencia del cliente ANTES de
  buscar.
- **Multilingüe**: embeddings multilingües desde el día 1 (responder en el idioma del
  cliente aunque el contenido esté en otro). Objetivo: 40+ idiomas.
- **Custom answers**: respuestas fijadas por el equipo para consultas concretas
  (matching en E1, cortocircuitan el pipeline).
- **Almacén**: `knowledge_embeddings` (existe) sobre pgvector; añadir tabla
  `fin_content_chunks` (chunk, fuente, audiencia, idioma, hash para re-embedding
  incremental).

## 3. Retrieval Engine (dónde se gana la calidad)

Fin de Intercom usa modelos propios (`fin-cx-retrieval` + `fin-cx-reranker`,
finetuneados sobre ~2M consultas reales). Nuestra escalera:

- **v0 (ya posible)**: búsqueda híbrida = pgvector (embedding multilingüe comercial)
  + full-text de Postgres, unión de candidatos (~40) → **rerank con LLM utility**
  (puntuar relevancia/actualidad/ajuste) → top 5-8 con citas.
- **v1**: reranker dedicado (cross-encoder open-source) servido aparte; cache de
  embeddings de consultas frecuentes.
- **v2 (el foso de Fin, replicable)**: finetuning del modelo de embeddings con pares
  minados de NUESTRAS conversaciones resueltas — positivos duros = chunks citados en
  respuestas que acabaron en resolución confirmada y bien puntuados por el juez;
  negativos duros = recuperados pero no usados y mal puntuados. Loss contrastivo
  (InfoNCE). La métrica de entrenamiento offline es proxy; la métrica real es
  **resolution rate** en producción. (Receta pública de Intercom: base multilingüe
  ~0.5B params, 1 positivo + 4 negativos, 2 épocas — ver fuentes §11.)

## 4. Guidance (el system prompt gobernado por el cliente)

Réplica del modelo de Fin:

- **4 categorías**: `communication_style` (tono, terminología), `context_clarification`
  (cuándo/cómo pedir aclaraciones), `content_sources` (qué fuentes usar para qué
  temas), `other` (políticas de empresa).
- Se cargan en E1, **antes** del retrieval — moldean cómo se busca y cómo se responde.
- Cap de piezas activas (Fin: 100) + plantillas por categoría + preview del efecto.
- Puede referenciar **atributos del cliente** (`{{customer.plan}}`) para personalizar.
- Almacén: `fin.guidance[]` en settings-blob; UI ya existe (`capGuidance`).

## 5. Procedures (la capacidad real — donde superamos a la v1)

El equivalente a Fin Procedures (3ª generación de Intercom, sustituye a Tasks).
**Un procedimiento es un documento**, no un árbol de decisión:

- **Pasos en lenguaje natural** ("pide el número de pedido, verifica que existe…").
- **Bloques deterministas** intercalados: condiciones if/else (NL o código),
  **bloques de código** sandboxeados (cálculos de fechas, formateo, elegibilidad)
  — sandbox: proceso aislado con solo los inputs del paso, sin red ni fs.
- **Data Connectors** (§5.1) y **tools MCP** como pasos de acción.
- **Sub-procedimientos** reutilizables.
- **Trigger por intención**: el agente decide arrancarlo en E1/E3 comparando la
  intención detectada con los criterios del procedimiento (no se invocan desde
  workflows; los workflows pueden hacer handoff HACIA el agente).
- **Ejecución**: secuencial, cada paso completa antes del siguiente; estado del run en
  `fin_procedure_runs` (retomable). **No lineal**: si el cliente se desvía, interrumpe
  o cambia de tema, el agente razona a qué paso volver o si cambiar de procedimiento
  — sin scripts rígidos.
- **Verificación de identidad** como paso nativo: OTP por email / preguntas de
  seguridad / HMAC del widget, ANTES de toda operación sensible.
- **Wait-for-webhook**: pausar el run hasta que un sistema externo confirme.
- **Escalado nativo**: bucles sin progreso, petición explícita de humano, o juicio
  sensible → handoff con resumen + estado del procedimiento.

### 5.1 Data Connectors (escrituras reales, gobernadas)

Cambio clave respecto a la v1 (que solo permitía escrituras vía workflows internos):

- Un conector = definición de API externa o interna (auth guardada cifrada, nunca
  visible para el modelo) + catálogo de **acciones** tipadas (schema de entrada/salida).
- **Política por acción**: `read` (libre) · `write_auto` (el agente ejecuta solo,
  p. ej. reenviar email de confirmación) · `write_approval` (crea `pending_action`,
  aprueba un humano desde el inbox) · `blocked`.
- Toda acción de escritura exige: identidad verificada + elegibilidad comprobada
  (paso de código) + registro en `audit_events`.
- Los conectores internos (pedidos, pagos, devoluciones del propio CRM) son el caso 1;
  Stripe/Shopify después. El toolkit `support_readonly` existente es el catálogo
  de lecturas internas ya hecho (61 tools).

## 6. Canales y despliegue

- **Chat/widget** (primero): tiempo real, streaming, `bot_reply` por defecto tras
  opt-in. Auth de widget: `widget_session_id` anónimo o HMAC identificado.
- **Email**: debounce 2 min, threading por In-Reply-To, borrador-privado-por-defecto
  hasta que el workspace active bot_reply.
- **WhatsApp/social/SMS**: como chat con adaptación de formato.
- **Voz** (fase tardía): ASR/TTS sobre el mismo motor.
- **Política de publicación por canal+tipo** (`fin.reply_modes`): `off` /
  `draft_only` (sugerencia interna en el inbox) / `bot_reply` (directo al cliente).
  Por defecto todo `draft_only` salvo opt-in explícito.
- **Audiencias** (`fin.audiences[]`): a quién atiende el agente (plan/región/canal/
  marca); fuera de audiencia → routing normal a humanos.

## 7. Outcome Engine (medición + facturación)

Copiamos la taxonomía de Fin — es también nuestro modelo de negocio (precio por
resolución):

| Outcome | Cuándo | Facturable |
|---|---|---|
| `resolution_confirmed` | el cliente confirma que le sirvió | ✔ |
| `resolution_assumed` | el cliente se va tras la respuesta sin pedir más (timeout 24 h) | ✔ |
| `procedure_handoff` | un procedimiento completó y terminó en handoff diseñado | ✔ |
| `escalated` | frustración/petición de humano/regla → humano | ✘ |
| `procedure_failure` | error técnico en un paso → escalado | ✘ |
| `abandoned` | sin respuesta del agente o el cliente se fue tras pregunta de clarificación | ✘ |
| `spam` | filtrado | ✘ |

Reglas: **máximo un outcome facturable por conversación**; si el cliente vuelve a la
misma conversación pidiendo más ayuda (incluso en otro ciclo de facturación), la
resolución se revierte. Máquina de estados sobre `cases.ai_triage.outcome` +
`fin_outcomes` (tabla de eventos para billing/analytics).

CSAT: encuesta post-resolución (tabla `csat_survey_responses`, existe) + **CX Score**
inferido por LLM sobre conversaciones sin encuesta (muestreo).

## 8. Configuración (`workspaces.settings.fin`) — superset de la v1

```jsonc
fin: {
  enabled: false,
  audiences: [...],                       // a quién atiende
  channels: { chat: {...}, email: {...}, whatsapp: {...} },
  reply_modes: { chat: { how_to: "bot_reply", "*": "draft_only" }, email: { "*": "draft_only" } },
  identity: { name: "Fin", tone: "friendly|professional|humorous", answer_length: "…",
              formality: "tú|usted", languages: ["es","en"] },
  guidance: [ { category, text, active } ],          // cap 100 activas
  attributes: [ { name, description, type } ],       // extracción por conversación
  escalation: { rules: [...], default_team: "…" },
  procedures: [...],                                 // → tablas propias (§9)
  retrieval: { top_k: 8, candidates: 40 },
  validation: { confidence_threshold: 0.6, max_attempts: 3 },
  debounce: { chat_seconds: 5, email_minutes: 2 },
  caps: { concurrent_runs: 20, daily_replies: null, alert_email: null },
  safety: { blocked_topics: [...], regional_hosting: "eu" }
}
```

## 9. Modelo de datos (delta sobre lo existente)

Existente y reutilizado: `cases`, `conversations`+`messages`, `knowledge_*`,
`agent_core_memory`, `ai_feedback`, `csat_survey_responses`, `audit_events`,
`applied_slas`, toolkit/providers del chatAgent.

Nuevo (migraciones):

1. `cases.ai_triage JSONB` + `cases.ai_resolved BOOL` + `cases.escalation_reason TEXT`.
2. `messages.is_private BOOL` + `messages.author_type` + `messages.citations JSONB` +
   `messages.confidence REAL` + `messages.reasoning JSONB` (answer-inspection).
3. `fin_content_chunks` (chunking + embeddings incrementales + audiencia + idioma).
4. `fin_procedures` (doc NL + bloques serializados, versión, draft/live, criterios de
   trigger) y `fin_procedure_runs` (estado por paso, retomable, resultado).
5. `fin_connectors` + `fin_connector_actions` (auth cifrada, política por acción).
6. `fin_pending_actions` (aprobaciones de escritura desde el inbox).
7. `fin_outcomes` (evento por conversación: tipo, ts, revertido, facturable).
8. `fin_simulations` (definición + últimos resultados) — §10.
9. `fin_knowledge_gaps` (detectadas por E4/E6 → pantalla Capacitar).

## 10. Testing y calidad (condición para vender confianza)

- **Simulaciones**: un LLM hace de cliente sintético con un objetivo ("consigue
  devolver un pedido sin número de pedido") contra el agente real en sandbox (con
  conectores mockeados). Criterios de éxito evaluados por juez → pass/fail + traza
  del razonamiento paso a paso. Guardables → **suite de regresión** que corre al
  cambiar guidance/procedimientos/contenido.
- **Batch tests de contenido**: lote de preguntas reales históricas → ¿qué % obtiene
  respuesta fundamentada? → detecta lagunas antes de activar un canal.
- **Preview**: probar el agente como si fueras un cliente concreto (audiencia,
  atributos, plan) sin afectar producción. UI ya existe (`pruebaTesting` con rating
  Bueno/Aceptable/Malo → `ai_feedback`).
- **Answer inspection**: cada respuesta enviada guarda fuentes citadas + guidance
  aplicada + score de validación → visible en el inbox para el operario.
- **Drafts**: procedimientos y guidance se editan en borrador y se publican
  explícitamente (nunca edición en caliente).

## 11. Analytics y optimización continua

- **Métricas núcleo**: resolution rate (norte de todo el sistema), involvement rate,
  CSAT/CX Score, deflection, tiempo a resolución, outcomes por tipo/canal/idioma.
- **Topics Explorer**: clustering automático (embeddings) de conversaciones en
  temas/subtemas sin etiquetado manual → pantalla Analizar·Temas.
- **AI recommendations**: detectar contenido infrautilizado/desactualizado, lagunas
  recurrentes (de `fin_knowledge_gaps`), procedimientos con alta tasa de fallo →
  sugerencias accionables en Capacitar.
- Todo alimenta las pantallas Analizar (`anaPerformance`, `anaTopicTrends`,
  `anaMonitor`) ya importadas.

## 12. Seguridad y confianza

- Safety gates E1 (injection, autolesión, contenido de menores, jailbreak, consejo
  médico/legal/financiero de riesgo → escalado inmediato) y E4 (PII/exfiltración).
- Fences dinámicos alrededor de TODO contenido externo (mensajes, artículos,
  resultados de conectores).
- Checklist OWASP LLM Top-10 como criterio de revisión de cada release del motor.
- Proveedores LLM con zero-retention; opción de región de inferencia (EU).
- El modelo nunca ve credenciales de conectores ni claves; RBAC del runtime.
- **Prerrequisito de plataforma**: habilitar RLS (hoy deshabilitado en 110 tablas)
  antes de exponer el widget público.

## 13. Fases (revisión v2)

- **F0 (hecho)**: toolkit `support_readonly`, providers, stores del agente, UI Fin
  completa, inbox omnicanal real.
- **F1 — Config + datos**: claves `fin.*`, migraciones §9 (1-2), wiring de pantallas
  Capacitar/Despliegue/Settings/Audiencias.
- **F2 — Motor de respuesta (chat, draft_only)**: pipeline E1-E5 event-driven con
  retrieval híbrido v0 + validación + citas; respuestas como sugerencia interna en el
  inbox. Preview + answer inspection.
- **F3 — Resolución en vivo**: bot_reply gated en chat, Outcome Engine completo (§7),
  CSAT, Topics v0, knowledge gaps.
- **F4 — Procedures + Connectors**: editor de procedimientos (pantalla existe),
  runs retomables, identity verification, conectores internos con política por acción
  y aprobaciones en inbox. Simulaciones v0.
- **F5 — Email + retrieval v1**: canal email con threading, reranker dedicado,
  batch tests, suite de regresión.
- **F6 — Escala**: finetuning del retrieval con datos propios (§3 v2), Topics
  completo, AI recommendations, WhatsApp/social, multilingüe 40+, voz (exploración).

## 14. Paridad competitiva (checklist contra Fin 3)

| Capacidad Fin 3 | Nuestro equivalente | Fase |
|---|---|---|
| AI Engine (refine→retrieve→rerank→generate→validate) | Pipeline E1-E5 | F2 |
| Custom retrieval+reranker finetuneados | Escalera §3 v0→v2 | F2→F6 |
| Guidance (4 categorías, pre-retrieval, cap 100) | §4 | F1-F2 |
| Procedures (NL+código+conectores+MCP+subproc.) | §5 | F4 |
| Data Connectors con escrituras + identity verification | §5.1 | F4 |
| Simulaciones + regresión + batch tests + preview | §10 | F4-F5 |
| Outcomes facturables (1/conversación, reversión) | §7 | F3 |
| Topics Explorer + AI recommendations | §11 | F3→F6 |
| Audiencias por plan/región/marca/canal | §6 | F1 |
| 45+ idiomas / respuestas multilingües | §2 | F2 (base) → F6 |
| Canales: chat/email/WhatsApp/voz | §6 | F2→F6 |
| Trust (OWASP, zero-retention, hosting regional) | §12 | transversal |

## 15. Fuentes de la investigación (2026-07-16)

- Intercom Help: [The Fin AI Engine™](https://www.intercom.com/help/en/articles/9929230-the-fin-ai-engine) · [Fin AI Agent explained](https://www.intercom.com/help/en/articles/7120684-fin-ai-agent-explained) · [Fin Procedures explained](https://www.intercom.com/help/en/articles/12495167-fin-procedures-explained) · [Fin Tasks & Data Connectors](https://www.intercom.com/help/en/articles/9569407-fin-tasks-and-data-connectors-explained) · [Fin AI Agent outcomes](https://www.intercom.com/help/en/articles/8205718-fin-ai-agent-outcomes) · [Fin Guidance](https://www.intercom.com/help/en/articles/10210126-provide-fin-ai-agent-with-specific-guidance)
- fin.ai: [The Fin AI Engine](https://fin.ai/ai-engine) (fin-cx-retrieval, fin-cx-reranker, Fin Apex 1.0; 76% resolución media; 65% menos alucinaciones) · [Finetuning Retrieval for Fin](https://fin.ai/research/finetuning-retrieval-for-fin/) (Arctic 2 + InfoNCE + hard negatives de 2M consultas) · [Fin Procedures](https://fin.ai/procedures)
- Pricing/outcomes de terceros: [aimdoc](https://aimdoc.ai/blog/intercom-resolution-pricing-explained) · [gleap](https://www.gleap.io/blog/intercom-fin-ai-pricing-2026)
- Interno: [posthog-support-agent-analysis.md](posthog-support-agent-analysis.md) (patrones de implementación: debounce, IDs deterministas, safety gates separados, draft privado por defecto).
