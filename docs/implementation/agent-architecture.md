# Agent Architecture

## Runtime Layers

- `llm`: agente que usa razonamiento/modelo y produce diagnóstico, clasificación o borradores.
- `pipeline`: paso del sistema gobernado por jobs/webhooks/canonicalización, no por inferencia.
- `connector`: agente frontera con SaaS externos; su ejecución final depende de integraciones reales.
- `system`: agente operativo que coordina flujo interno, políticas, auditoría o progresión de workflow.

## Implementation Modes

- `implemented`: ya tiene implementación concreta registrada en runtime.
- `delegated`: la responsabilidad real la ejecuta otra capa del sistema (`pipeline`, `execution`, `workflow`, `webhook`).
- `stub`: su arquitectura está definida y expuesta en AI Studio, pero la lógica final aún debe conectarse al runtime o al SaaS correspondiente.

## Agent Roster

| Agent | Slug | Runtime | Mode | Model tier | Primary role |
| --- | --- | --- | --- | --- | --- |
| Supervisor | `supervisor` | `system` | `delegated` | `none` | Coordina handoffs y flujo global |
| Approval Gatekeeper | `approval-gatekeeper` | `llm` | `implemented` | `basic` | Aplica approvals y bloqueos |
| QA / Policy Check | `qa-policy-check` | `llm` | `implemented` | `basic` | Valida policy y seguridad |
| Channel Ingest | `channel-ingest` | `pipeline` | `delegated` | `none` | Convierte eventos de canal en intake |
| Canonicalizer | `canonicalizer` | `pipeline` | `delegated` | `none` | Normaliza al estado canónico |
| Intent Router | `intent-router` | `llm` | `implemented` | `basic` | Clasifica intención y ruta |
| Knowledge Retriever | `knowledge-retriever` | `llm` | `implemented` | `basic` | Recupera políticas/SOPs |
| Composer + Translator | `composer-translator` | `llm` | `implemented` | `advanced` | Redacta y localiza mensajes |
| Reconciliation Agent | `reconciliation-agent` | `system` | `delegated` | `none` | Detecta contradicciones cross-system |
| Case Resolution Planner | `case-resolution-planner` | `system` | `stub` | `advanced` | Construye el plan de resolución |
| Resolution Executor | `resolution-executor` | `system` | `delegated` | `none` | Ejecuta writebacks aprobados |
| Workflow Runtime Agent | `workflow-runtime-agent` | `system` | `delegated` | `none` | Avanza/pausa workflows internos |
| Identity Mapping Agent | `identity-mapping-agent` | `llm` | `implemented` | `basic` | Enlaza identidades cross-system |
| CRM / Customer Identity Agent | `customer-identity-agent` | `llm` | `implemented` | `basic` | Provee customer truth |
| Helpdesk Agent | `helpdesk-agent` | `connector` | `stub` | `none` | Sincroniza tickets/notas |
| Stripe Agent | `stripe-agent` | `connector` | `stub` | `none` | Fuente de verdad de pagos/refunds |
| Shopify Agent | `shopify-agent` | `connector` | `stub` | `none` | Fuente de verdad de orders/customer |
| OMS / ERP Agent | `oms-erp-agent` | `connector` | `stub` | `none` | Estado back-office y refs |
| Returns Agent | `returns-agent` | `system` | `stub` | `none` | Estado del flujo de devoluciones |
| Recharge / Subscription Agent | `subscription-agent` | `connector` | `stub` | `none` | Estado de suscripciones |
| Logistics / Tracking Agent | `logistics-tracking-agent` | `connector` | `stub` | `none` | Tracking y señales logísticas |
| SLA & Escalation Agent | `sla-escalation-agent` | `system` | `stub` | `none` | Monitorea aging y escalados |
| Customer Communication Agent | `customer-communication-agent` | `system` | `stub` | `advanced` | Decide cuándo comunicar al cliente |
| Audit & Observability Agent | `audit-observability` | `system` | `implemented` | `none` | Auditoría y señales operativas |

## Architectural Rules

- AI Studio solo debe configurar agentes del catálogo canónico.
- La UI puede describir el agente, pero la verdad operativa vive en `agent_versions.capabilities`.
- Los agentes `connector` no deben ejecutar nada write-enabled sin capability activa y autorización previa.
- Los agentes `pipeline` y `delegated` no dependen de LLM para avanzar el caso; AI Studio gobierna su policy y activación, no su inferencia.
- Los agentes `stub` deben mantenerse visibles/configurables para preparar su rollout, pero su ejecución debe devolver un resultado explícito de "pending implementation" y nunca un silencio ambiguo.
- La selección de modelo debe optimizar coste:
  - `basic`: clasificación, retrieval y decisiones rápidas.
  - `advanced`: drafting complejo, planificación y decisiones de comunicación con mayor matiz.
  - `none`: pasos deterministas, conectores y runtime interno.

## Next Runtime Closures

- `Case Resolution Planner`: convertir plan de resolución desde conflicto canónico + policy.
- `Customer Communication Agent`: gobernar borradores/sending solo cuando la verdad esté reconciliada.
- `Helpdesk Agent`: sincronización real ticket/note/reply.
- `Stripe Agent` y `Shopify Agent`: lectura/escritura real con capabilities y approvals.
- `SLA & Escalation Agent`: scheduled jobs + ownership routing.
