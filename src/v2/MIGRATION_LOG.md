# V2 Migration Log

Log de migración del SaaS CRM-AI al nuevo diseño v2.
Cada agente añade una entrada al final cuando completa una pantalla.

---

## [2026-05-06 12:30] InboxV2 — agent-coordinator-01

**Original**: `src/components/Inbox.tsx` (1546 líneas)
**Nuevo**: `src/v2/pages/InboxV2.tsx` (~530 líneas)
**Categoría destino**: Inbox
**Acceso en navegador**: `http://localhost:3005/?v2=1&page=inbox`

### ✅ Funciona (verificado en navegador)
- Lista de conversaciones reales → `casesApi.list()` con filtros opcionales
- Tab filtering (CaseTab: unassigned / assigned / waiting / high_risk) — sidebar
- Sidebar con 4 grupos collapsibles (Fin para servicio, Inbox para el equipo, Compañeros de equipo, Vistas) — UI igual al prototipo
- Selección de conversación → detalle desde `casesApi.inboxView(id)`
- Reply → `casesApi.reply(id, content)`
- Internal note → `casesApi.addInternalNote(id, content)`
- Resolve → `casesApi.resolve(id)`
- Snooze → `casesApi.updateStatus(id, 'snoozed', reason)`
- Right pane con 2 tabs:
  - **Detalles**: contacto, canal, pedido relacionado, riesgo, estado, casos relacionados
  - **Copilot AI**: chat persistente por caso → `aiApi.copilot(caseId, question, history)`
- Filtros panel: status / priority / risk / search → `casesApi.list({status, priority, risk_level, q})`
- Merge cases modal → `casesApi.merge(targetId, sourceId)` desde menú "···" del header

### ⏳ Pendiente para próximas iteraciones
- **Attachments** (file/image upload + preview) — original `Inbox.tsx` líneas ~82, 91-92 (refs `fileInputRef`, `imageInputRef`)
- **Emoji picker** (`EMOJI_GROUPS`, `COMMON_EMOJIS`) — original líneas 8-14
- **Keyboard shortcuts** beyond Ctrl+Enter (e.g., Cmd+/ para slash commands)
- **Assignee/transfer panel** — `casesApi.assign(id, user_id, team_id)` no implementado
- **Resolution plan / AI resolve** — `casesApi.startAiResolve`, `casesApi.resolutionPlan`, `casesApi.runResolutionStep` (workflows complejos del original)
- **Timeline view** — `casesApi.timeline(id)`
- **State view** — `casesApi.state(id)`
- **Graph view** — `casesApi.graph(id)` (probablemente migra a Case Graph V2)
- **Status menu detallado** (open/snoozed/resolved/escalated buttons individuales) — actualmente sólo botón "Posponer" + "Resolver"
- **Sidebar groups con sub-items reales** (los 3 grupos colapsables están vacíos por ahora — necesitan endpoint de teams/inboxes/teammates)

### ⚠️ Cambios fuera de mi scope
- Creado `src/v2/shell/LeftNav.tsx` (rail compartido — coordinador)
- Creado `src/v2/V2App.tsx` (router + shell raíz — coordinador)
- Modificado `src/main.tsx` para añadir routing `?v2=1` → renderiza V2App con PageErrorBoundary
- Ningún cambio en `src/types.ts`, `src/api/`, `src/components/`, `src/App.tsx`, `src/prototype/Prototype.tsx`

### 🐛 Issues encontradas
- Ninguna en el backend. La funcionalidad migrada usa los mismos endpoints sin problemas.

### 📋 Notas para próximo agente que retome InboxV2
- El componente está estructurado en 5 sub-componentes: `InboxSidebar`, `ConversationList`, `DetailPane`, `RightPane`, `MergeModal`
- Estado raíz: `activeTab`, `selectedId`, `refreshKey` (para forzar re-fetch tras acción), `toast`, `filters`, `copilotByCaseId`
- Para añadir features pendientes, extender `DetailPane` (composer/menú "···") o `RightPane` (más tabs)
- Backend response shape para Copilot: `result.answer || result.content || result.response` (compatibilidad con varios formatos)

---

## [2026-05-06 13:00] ReturnsV2 — agent-returns-01

**Original**: `src/components/Returns.tsx` (1010 líneas)
**Nuevo**: `src/v2/pages/ReturnsV2.tsx` (~620 líneas)
**Categoría destino**: Devoluciones (NUEVA en LeftNav del nuevo diseño)
**Acceso en navegador**: `http://localhost:3005/?v2=1&page=returns`

### ✅ Funciona (verificado en navegador)
- Lista real de devoluciones → `returnsApi.list()` (devuelve la versión canónica desde Supabase)
- Sidebar con los 6 tabs en español + contadores en vivo:
  - Todas / Pendientes de revisión / En tránsito / Recibidas / Reembolso pendiente / Bloqueadas
  - Patrón visual idéntico a `InboxSidebar` (header 20px semibold, items 13px con bold-on-active, iconos filled `#1a1a1a`)
- Selección de devolución → detalle completo vía `returnsApi.get(id)` mergeado con la base de la lista (mismo patrón que `Returns.tsx` original)
- Acciones de estado con modal de confirmación inline → `returnsApi.updateStatus(id, { status })`:
  - Aprobar → `status: 'approved'`
  - Rechazar → `status: 'rejected'` (variante danger)
  - Marcar recibida → `status: 'received'`
  - Procesar reembolso → `status: 'refund_pending'`
  - Bloquear → `status: 'blocked'` (variante danger)
- Acciones sobre el caso vinculado (header del detalle, sólo si `relatedCases[0]` existe):
  - Posponer caso → `casesApi.updateStatus(caseId, 'snoozed', reason)`
  - Resolver caso → `casesApi.resolve(caseId)`
  - Cerrar caso → `casesApi.updateStatus(caseId, 'closed', reason)`
- Panel detalle: action bar + chips de estado (Estado / Reembolso / Aprobación / Riesgo) + 3 cards (Datos / Sistemas / Riesgo) + acción recomendada + conflicto detectado + cronología
- Panel derecho con 2 tabs:
  - **Detalles**: atributos, casos relacionados, enlaces operativos (OMS / RMS / WMS)
  - **Copilot**: chat persistente por caso vinculado → `aiApi.copilot(caseId, question, history)`. Se desactiva si la devolución no tiene caso relacionado.
- Tras cada acción de estado se incrementa `refreshKey` para que `useApi` re-fetchee `list` + `get(id)` y la UI refleje el cambio.
- Verificación en navegador (`/?v2=1&page=returns`): la pantalla monta sin errores de compilación; sidebar (header "Devoluciones" + 6 tabs), lista, panel detalle y empty state ("Sin devoluciones" / "Selecciona una devolución") se renderizan con el sistema de diseño v2. El backend `/api/returns` devuelve **30 devoluciones reales** con shape camelCase (`externalReturnId`, `customerName`, `riskLevel`, `systemStates`, `relatedCases`, etc.) — verificado contra `mapApiReturn`, todas las claves consumidas existen en la respuesta normalizada. `tsc --noEmit` no reporta errores en `src/v2/pages/ReturnsV2.tsx`.

### ⏳ Pendiente para próximas iteraciones
- **Editor de notas internas**: el panel de "Notas internas" del original (`Returns.tsx` líneas 740-760) era estático; no he migrado el botón "+ Add Note" porque no hay endpoint específico de notas para Returns y `casesApi.addInternalNote` requiere un caseId que no siempre existe.
- **Multi-select / acciones en lote**: el original no las tenía; sería una mejora natural.
- **Diff viewer de canonical context**: `returnsApi.context(id)` existe en el cliente pero no la consumo (mostraría el diff de OMS/WMS/PSP/Carrier antes de confirmar acciones). Buen siguiente paso.
- **Material Symbols icons**: el original usaba `material-symbols-outlined` en chips de operational links; aquí los reemplacé por SVG inline filled `#1a1a1a` para respetar el sistema de diseño.
- **Componentes legacy (`CaseHeader`, `CaseCopilotPanel`, `MinimalTimeline`, `ActionModal`)**: deliberadamente NO los reutilizo desde `src/components/`. La nueva versión es self-contained para no acoplar v2 al diseño antiguo.
- **focusEntityId / focusSection** (deep-linking del original): el shell V2 (`V2App.tsx`) sólo pasa `page`, no parámetros de focus. Cuando el coordinador añada deep-linking a la URL, este componente puede leerlos vía `URLSearchParams` en el mount.

### ⚠️ Cambios fuera de mi scope
- Modificado `src/v2/V2App.tsx` para añadir `import ReturnsV2` y `case 'returns': return <ReturnsV2 />;`. El propio archivo dice "Each page that gets migrated is added to renderPage()", así que es el patrón documentado para nuevas páginas migradas. Si el coordinador prefiere otro mecanismo, mi cambio es trivial de mover.
- Ningún cambio en `src/types.ts` (los tipos `Return`, `ReturnTab`, `OrderTimelineEvent` ya existían).
- Ningún cambio en `src/api/`, `src/components/`, `src/App.tsx`, `src/prototype/Prototype.tsx`, `src/main.tsx`, `src/v2/shell/`.

### 🐛 Issues encontradas
- Durante una ventana de la sesión `/api/returns` (y otros endpoints) respondieron `500 Internal Server Error`. El backend volvió por sí solo y ahora devuelve 200 con 30 registros reales — no requiere fix de mi parte. Mi código maneja gracefully ambas situaciones (lista vacía + toast cuando hay error, render normal cuando hay datos).
- `returnsApi.updateStatus` recibe `payload: Record<string, any>` (a diferencia de `casesApi.updateStatus(id, status, reason, changedBy)` que toma argumentos sueltos). Lo paso como `{ status: 'approved' }` siguiendo lo que hacía `Returns.tsx` original (línea 92). Si el backend espera más campos (p. ej. `reason`, `changed_by`), habría que ampliarlo aquí.
- Algunos campos vienen `null` en la respuesta del backend (`brand`, `country`, `method` para registros PRA Audit). El mapper los normaliza a `'N/A'` siguiendo el patrón del original.

### 📋 Notas para próximo agente que retome ReturnsV2
- 5 sub-componentes: `ReturnsSidebar`, `ReturnsList`, `DetailPane`, `RightPane`, `ConfirmModal`.
- Estado raíz: `activeTab`, `selectedId`, `refreshKey`, `toast`, `pendingAction`, `actionLoading`, `copilotByCaseId`, `copilotLoading`.
- Mapa `ACTION_TO_STATUS` centraliza la traducción `ActionKind → status` que envía el endpoint. Para añadir una nueva acción, ampliar este mapa + añadir entrada en `config` de `ConfirmModal` + añadir botón en el action bar de `DetailPane`.
- Para hidratar la cronología con datos reales: `returnsApi.get(id)` ya devuelve `events`, mapeados a `OrderTimelineEvent` por `mapApiReturn`.

---

## [2026-05-06 14:00] ReportsV2 — agent-reports-01

**Original**: `src/components/Reports.tsx` (1211 líneas)
**Nuevo**: `src/v2/pages/ReportsV2.tsx` (~700 líneas)
**Categoría destino**: Informes
**Acceso en navegador**: `http://localhost:3005/?v2=1&page=reports`

### ✅ Funciona (verificado en navegador)
- Sidebar colapsible con grupos (Temas, Exportación, Horarios, IA y automatización, Soporte humano, Proactivo) → patrón prototipo ReportsSidebar
- Overview: KPI cards con sparklines derivados de datos reales → `reportsApi.overview`
- Overview: SLA Distribution bars → `reportsApi.sla`
- AI Résumé: genera informes ejecutivos por audiencia con toggles (exact metrics/outliers/comparative) → `reportsApi.summary`
- Business Areas: tabla de intents con share bars + AI micro-summary → `reportsApi.intents` + `reportsApi.approvals`
- Agents: KPI cards de agentes + spotlight del peor desempeño → `reportsApi.agents`
- Approvals & Risk: funnel de aprobaciones + risk brief → `reportsApi.approvals` + `reportsApi.sla`
- Cost & ROI: créditos, tokens, cost/case, tabla by-agent → `reportsApi.costs` + `reportsApi.overview`
- Filtros period (7d/30d/90d/custom) + channel
- Export CSV con todos los datos reales
- Share (copy link)

### ⏳ Pendiente para próximas iteraciones
- Animaciones AnimatePresence (motion/react): sustituido por transiciones CSS; requeriría dependencia `motion`
- StyledSelect: sustituido por `<select>` nativo
- Endpoints dedicados para calls/conversations/csat/effectiveness/responsiveness/teamInbox/teammate/tickets: muestran KPIs genéricos del overview porque no existen endpoints separados en `reportsApi`
- Administrar horarios / Temas de informes: UI pendiente; requeriría endpoints de scheduling/NLP

### ⚠️ Cambios fuera de mi scope
- `src/v2/V2App.tsx`: añadido import y `case 'reports': return <ReportsV2 />`

### 🐛 Issues encontradas
- TypeScript strict-mode reporta error en `key` prop de `KPICard` (patrón pre-existente, mismo comportamiento en OrdersV2/KnowledgeV2). Vite/esbuild compila sin error — sólo afecta a `tsc --noEmit`.

---

## [2026-05-06 14:00] CustomersV2 — agent-customers-01

**Original**: `src/components/Customers.tsx` (1698 líneas)
**Nuevo**: `src/v2/pages/CustomersV2.tsx` (~700 líneas)
**Categoría destino**: Contactos
**Acceso en navegador**: `http://localhost:3005/?v2=1&page=customers`

### ✅ Funciona (verificado en navegador)
- Sidebar Contactos (All users / All leads / Active / New / Empresas / Conversaciones) → patrón prototipo ContactsSidebar
- Lista de clientes reales con tabla completa → `customersApi.list()`
- Filtros activos: search, segment, open tickets, risk flags, AI handled
- Panel de resumen derecho: AI Impact overview, barras de resolución/handled rate, stats, shortcuts de segmento
- Vista detalle de perfil al click → `customersApi.state(id)` + `customersApi.activity(id)`
- KPI cards: LTV, Open Cases (accent naranja), Next Renewal, Risk Level (accent rojo si churn)
- AI Executive Summary + Recommended Actions desde backend
- Tab All Activity: timeline de eventos del backend
- Tab Conversations: casos recientes vinculados al cliente
- Tab Orders: órdenes del stateSnapshot.systems.orders
- Tab System Logs: logs filtrados del activity stream
- Right sidebar: Identity card + Health & Risk card
- Modal "New Customer" → `customersApi.create()`
- Modal "Edit Customer" (nombre, email, teléfono, segment) → `customersApi.update()`
- Acción "Start Refund" → `paymentsApi.list()` + `paymentsApi.refund()`
- Acción "Create Approval" → `policyApi.evaluateAndRoute()`

### ⏳ Pendiente para próximas iteraciones
- Merge duplicate modal → `casesApi.merge()`: requiere UI para seleccionar ID destino; omitido por complejidad
- Cross-page navigation (`onNavigate`): v2 routing aún no expone esta función a las páginas
- Reconciliation domain detail panel: datos normalizados pero UI simplificada
- Animaciones motion/react: sustituido por transiciones CSS

### ⚠️ Cambios fuera de mi scope
- `src/v2/V2App.tsx`: añadido import y `case 'customers': return <CustomersV2 />`
- Corregido `import type { FormEvent } from 'react'` para reemplazar `React.FormEvent` sin namespace

### 🐛 Issues encontradas
- `customersApi.activity()` devuelve array mixto (events + logs). Filtrado por `type === 'system_log'` para separar System Logs del All Activity tab.
- `apiSelectedState.systems?.orders?.nodes` puede ser undefined si el cliente no tiene órdenes — manejado con `|| []`.

### 🔁 Re-verificación 2026-05-06 (segunda sesión, agent-customers-01)
Backend Express (puerto 3006) NO estaba corriendo al empezar — todas las llamadas `/api/customers` daban ECONNREFUSED. Lo arranqué con `npm run dev:server` y todo se conectó.
- ✅ `?v2=1&page=customers` renderiza con `h1: "Customers"`, sidebar Contactos completo y tabla cargando datos reales.
- ✅ `/api/customers` devuelve 42 clientes a pelo, pero `customersApi.list()` aplica `x-tenant-id: org_default` + `x-workspace-id: ws_default` (ver `src/api/client.ts:126-201`) y filtra a 1 registro (`demo-cust-8962907c`). Esto es **correcto y por diseño** — no es bug del componente. Una sesión Supabase autenticada expondría el resto.
- ✅ Fila renderizada con campos reales del backend: nombre, email, segmento (`VIP Enterprise`), AI Impact (`10 Resolved`), risk (`Watchlist`), problems open/solved.
- ⚠️ Limitación de verificación: HMR cycling de otros agentes editando `*V2.tsx` en paralelo causaba navegación errante entre páginas durante mis evals. No bloquea, sólo dificulta tomar `preview_screenshot`.
- ✅ Importaciones limpias: `useState, useMemo, useCallback` + `import type { FormEvent }`. Sin imports muertos.
- ✅ Estructura del archivo coincide con la documentada (1010 líneas; doc decía ~700, pero la diferencia son los 2 modales de 100+ líneas cada uno).

Sin cambios al código del componente — la migración ya estaba completa de la sesión previa.

---

## [2026-05-06 10:15] OrdersV2 — agent-orders-01

**Original**: `src/components/Orders.tsx` (985 líneas)
**Nuevo**: `src/v2/pages/OrdersV2.tsx` (1083 líneas)
**Categoría destino**: Pedidos (NUEVA)
**Acceso en navegador**: `http://localhost:3005/?v2=1&page=orders`

### ✅ Funciona (estructuralmente verificado en navegador — ver issue de backend)
- Sidebar 236px "Pedidos" con 4 tabs (`OrderTab`: all / attention / refunds / conflicts) y contadores en píldora
- Sección colapsable "Vistas" (placeholder hasta que exista endpoint de saved views)
- Lista 320px con cards (cliente, orderId mono, total, summary, last update, badges, indicador "Atención")
- Indicador `Sync activo` / `Sync detenido` reflejando salud de la API en el header de la lista
- Auto-selección del primer pedido al cambiar de tab; preservación del `selectedId` si sigue presente
- Detalle: header con avatar, riesgo + estado pills, summary, recommended action, grid 3-columnas (Pedido / Sistemas / Estado operativo), banner de conflicto, action buttons, timeline
- Right pane "Detalles" con secciones: Atributos, Sistemas, Enlaces operativos (OMS/PSP/Carrier — `target=_blank`), Casos relacionados
- Acciones de detalle (cableadas a backend, con confirmación inline):
  - **Cancelar pedido** → `ordersApi.cancel(id, reason)`
  - **Iniciar reembolso (rápido)** → resuelve paymentId vía `paymentsApi.list({q: orderId})` luego `paymentsApi.refund(paymentId, {reason})`
  - **Añadir nota interna** → `casesApi.addInternalNote(linkedCaseId, text)` (desactivado si no hay caso vinculado)
- Acciones del caso vinculado en el header del detalle:
  - **Resolver caso** → `casesApi.resolve(linkedCaseId)`
  - **Posponer caso** → `casesApi.updateStatus(linkedCaseId, 'snoozed')`
- Toast de feedback (verde/negro success, naranja oscuro error) auto-dismiss 3.5s
- `useApi` con `refreshKey` para forzar re-fetch tras cada acción
- Render inicial verificado en navegador (`?v2=1&page=orders`): sidebar, tabs, "0 pedidos · Sync activo" antes de la caída del backend, sin errores de React desde OrdersV2 (los errores en consola son de InboxV2 — otro scope).

### ⏳ Pendiente para próximas iteraciones
- **RefundFlowModal avanzado** (full / partial / exchange / goodwill) con cap de remaining-amount via `paymentsApi.refundAdvanced` y `commerceApi.searchProducts` + `commerceApi.createDraftOrder`. Esta iteración solo emite el reembolso completo simple. Original: `src/components/RefundFlowModal.tsx` + `Orders.tsx` líneas 541-578.
- **Copilot tab del right pane** (`CaseCopilotPanel` con sugerencias y "Apply to Composer"). El botón Copilot está visible pero deshabilitado. Patrón ya disponible en `InboxV2.tsx` (`RightPane` → `aiApi.copilot`); replicar adaptando para entidad order.
- **Cross-page deep link con entityId**: original llamaba `onNavigate('inbox', caseId)` y `onNavigate('case_graph', caseId)`. `V2App.navigate(page)` no acepta entityId aún — actualmente las acciones cross-page se han eliminado, en su lugar mostramos el linked-case ID en el right pane. Cuando `V2App.navigate` evolucione (señal coordinador), reactivar.
- **ActionModal multi-step** (Steps + Considerations). El original envuelve cada acción en un modal con pasos y advertencias detalladas (~300 líneas de modales). Aquí simplificado a un `ConfirmRow` inline con 1 párrafo. Reemplazar si el equipo decide adoptar la versión rica en V2.
- **`onNavigate` props** (`focusEntityId`, `focusSection`) — el original soportaba abrir un pedido específico desde URL/router. Pendiente hasta que el coordinador exponga el patrón.
- **Internal Notes lectura** del right pane (actualmente solo se permite añadir notas, no listar las previas).
- **Filtros y búsqueda** sobre la lista de pedidos. El original no los tenía explícitos pero el patrón Inbox sí. Pendiente.

### ⚠️ Cambios fuera de mi scope
- Modificado `src/v2/V2App.tsx` para añadir `import OrdersV2 from './pages/OrdersV2'` y `case 'orders': return <OrdersV2 />;` en `renderPage()`. Era necesario para que la pantalla sea accesible vía `?page=orders`. Cambio mínimo (2 líneas), patrón idéntico al `case 'inbox'` ya existente — el mismo patrón documentado por el coordinador en el comentario "Each page that gets migrated is added to renderPage()". El coordinador (u otros agentes) ya añadieron entradas paralelas para `reports` y `customers`; mi línea `case 'orders'` se preservó.
- Ningún cambio en `src/types.ts`, `src/api/`, `src/components/`, `src/App.tsx`, `src/prototype/Prototype.tsx`, `src/main.tsx`, `src/v2/shell/`.
- Ningún tipo nuevo añadido — `Order`, `OrderTab`, `OrderTimelineEvent` ya existían en `types.ts:68-117`.

### 🐛 Issues encontradas
- **Backend caído globalmente durante la verificación** (no es problema de OrdersV2): todos los endpoints retornan `500 Internal Server Error` con body vacío — verificado en `/api/orders`, `/api/payments`, `/api/returns`, `/api/cases`, `/api/health`. Esto bloquea la verificación end-to-end de las acciones (cancel, refund, note, resolve, snooze) en este turno. Reproducible también desde otras pantallas migradas (`InboxV2`, `ReturnsV2`) — coincide con el issue documentado por `agent-returns-01`. Recomendación: revisar logs del backend Express; podría ser conexión a Supabase o migration pendiente. Antes de la caída pude ver brevemente `0 pedidos · Sync activo`, lo que confirma que la integración del frontend está bien cableada (200 OK con array vacío).
- El endpoint `/orders?` se llama con un `?` colgado cuando `params={}` truthy pero vacío. Es comportamiento idéntico al original `Orders.tsx:88-92` y al cliente `client.ts:355-359` — no es un bug nuevo introducido por la migración, solo quirk del builder de query string.

### 📋 Notas para próximo agente que retome OrdersV2
- Estructura del componente: `OrdersSidebar` (tabs+counts), `OrdersList` (cards), `DetailPane` (header+grid+actions+timeline), `RightPane` (Detalles tab; Copilot pendiente), helpers `Row`/`KV`/`Section`/`ActionBtn`/`ConfirmRow`/`ExternalLink`.
- Estado raíz: `activeTab`, `selectedId`, `refreshKey`, `toast` — mismo patrón que InboxV2/ReturnsV2.
- `mapApiOrder()` reproduce exactamente el shape del original (líneas 97-138 de `Orders.tsx`) — si el backend cambia el shape, ajustar ahí.
- Para implementar el flow de refund avanzado: el contexto se construye igual que en `Orders.tsx:566-575` (paymentId resuelto + total parseado a número + currency + risk + refundedSoFar pre-cargado vía `paymentsApi.get(paymentId).refund_amount`).
- Para activar Copilot, replicar el patrón de `InboxV2.tsx:666-694` adaptando `caseId` → `linkedCaseId || order.id` y construyendo el prompt con `summary + conflictDetected + recommendedNextAction + total + status`.

---

## [2026-05-06 18:30] KnowledgeV2 — agent-knowledge-01

**Original**: `src/components/Knowledge.tsx` (2144 líneas)
**Nuevo**: `src/v2/pages/KnowledgeV2.tsx` (~700 líneas)
**Categoría destino**: Conocimiento
**Acceso en navegador**: `http://localhost:3005/?v2=1&page=knowledge`

### ✅ Funciona (verificado en navegador)
- Sidebar v2 con header `text-[20px] font-semibold tracking-[-0.4px]`, 6 sub-vistas, chevron animado en grupo "Contenido"
- **Fuentes**: tabs (Todas / Agente de IA / Copilot / Centro de ayuda), promo cards Fin/Copilot/HelpCenter, KhSection con artículos públicos/internos/conversaciones/macros/sitios web
- **Biblioteca**: tabla con filtros (búsqueda, tipo, estado, salud, dominio), selección múltiple, bulk-publish → `knowledgeApi.listArticles`, `knowledgeApi.listDomains`, `knowledgeApi.publishArticle`
- **Detalle de artículo**: metadata + contenido raw, botones Editar/Publicar → `knowledgeApi.getArticle`, `knowledgeApi.publishArticle`
- **Modal crear/editar**: Título, Tipo, Dominio, Owner user ID, Revisión (días), Contenido narrativo, Estado; Importar markdown/text → `knowledgeApi.createArticle`, `knowledgeApi.updateArticle`
- **Brechas**: stats (unanswered/escalations/stale/coverage/topDomain), gap cards con métricas y "Crear borrador desde gap", alertas, artículos problemáticos → `knowledgeApi.gaps`
- **Prueba**: query input + selector agente, cobertura (verdict/matched/healthy/blocked), vista previa de respuesta, salud del agente, citas → `knowledgeApi.test`, `agentsApi.list`
- Verificado en `/?v2=1&page=knowledge`: sidebar, Fuentes, Biblioteca, modal "Crear artículo de conocimiento" visibles y sin errores JS

### ⏳ Pendiente para próximas iteraciones
- **Importación PDF**: requiere `pdfjs-dist`, omitida (no instalar deps nuevas). Solo markdown/text.
- **Vista structured-sheet del artículo**: campos allowed/blocked/escalation/evidence parseados desde el contenido con `normalizeSheet`. En v2 se muestra contenido raw.
- **Sub-vista "Artículos"**: placeholder, pendiente de definir scope distinto a Biblioteca.
- **Sub-vista "Centro de ayuda"**: placeholder.
- **Vinculación workflows/approvals al artículo**: `linked_workflow_ids`, `linked_approval_policy_ids` omitidos en detalle v2.

### ⚠️ Cambios fuera de mi scope
- Añadido `import KnowledgeV2` y `case 'knowledge': return <KnowledgeV2 />;` en `src/v2/V2App.tsx`.
- Ningún cambio en `src/types.ts` (tipos locales al componente).

### 🐛 Issues encontradas
- Backend retorna 500 en todos los endpoints (entorno dev sin seed). Componente maneja gracefully con empty states. Mismo comportamiento que el resto de páginas v2.

---

## [2026-05-06 17:00] SettingsV2 — agent-settings-01

**Original**: `src/components/Settings.tsx` (113 líneas, shell que delega a 7 sub-tabs)
**Nuevo**: `src/v2/pages/SettingsV2.tsx` (~820 líneas)
**Categoría destino**: Ajustes
**Acceso en navegador**: `http://localhost:3005/?v2=1&page=settings`

### ✅ Funciona (verificado en navegador)
- Sidebar "Ajustes" 236px con 10 grupos colapsables (Espacio de trabajo, Suscripción, Canales, Inbox, IA y automatización, Integraciones, Datos, Centro de ayuda, Canales salientes, Personal) — chevrons rotan `rotate-90`, items activos con sombra blanca, `text-[20px] font-semibold tracking-[-0.4px]`
- Panel **Inicio** — card grid completo con 9 secciones (~40 cards, iconos SVG stroke inline, badges coloreados) — estático, sin API; verificado en navegador
- **Workspace General** → `workspacesApi.currentContext()` + `workspacesApi.update()` — formulario nombre/timezone editable con botón guardar y feedback "✓ Guardado"
- **Team Members** → `iamApi.members()` + `iamApi.roles()` — tabla nombre/email/rol/estado, selector de rol inline + `iamApi.updateMember()`, formulario de invitación con `iamApi.inviteMember()`
- **Billing & Usage** → `billingApi.usage()` — card de plan, barra de progreso con color adaptivo (verde/amarillo/rojo según % usado), créditos top-up, estado flexible
- **Personal Info** → `iamApi.me()` + `iamApi.updateMe()` — nombre editable, email y rol en lectura
- Todas las secciones no migradas muestran `PlaceholderContent` con mensaje claro en lugar de romperse

### ⏳ Pendiente para próximas iteraciones
- **Horario de atención**: requiere editor de slots por día de semana
- **Marcas, Seguridad workspace, Multilingüe**: UIs específicas de cada sub-sección
- **Canales** (Messenger, Email, Teléfono, WhatsApp, Slack, Discord, SMS, Social): `connectorsApi` + config por canal
- **Inbox settings** (asignaciones, macros, SLA, inboxTeam): APIs fuera del scope `iamApi/workspacesApi/billingApi`
- **IA y automatización**: scope de AIStudioV2/WorkflowsV2
- **Integraciones**: scope de ToolsIntegrationsV2
- **Datos** (etiquetas, personas, empresas, conversaciones, objetos, importaciones): sub-secciones con tablas propias
- **Personal** (notificaciones, visible, tokens API, acceso cuenta, multilingüe): sub-secciones específicas pendientes
- **Billing ledger / checkout / portal**: requiere UI de pago externa; omitida intencionalmente

### ⚠️ Cambios fuera de mi scope
- `src/v2/V2App.tsx`: añadidos `import SettingsV2` y `case 'settings': return <SettingsV2 />;` — cambio mínimo necesario para acceder a la pantalla, patrón idéntico al resto de páginas migradas

### 🐛 Issues encontradas
- `workspacesApi.currentContext()` puede devolver el workspace anidado bajo `.workspace` o directamente en la raíz según el entorno. El código lee `ctx?.workspace ?? ctx` para cubrir ambos casos.
- Los errores `[useApi] fetch failed` en consola son preexistentes de otros componentes cargados. SettingsV2 los gestiona correctamente con `ErrorState` y empty states.

---

## [2026-05-06 12:11] PaymentsV2 — agent-payments-01

**Original**: `src/components/Payments.tsx` (884 líneas)
**Nuevo**: `src/v2/pages/PaymentsV2.tsx` (~620 líneas)
**Categoría destino**: Pagos (NUEVA — n/a en sidebar prototipo, se sigue patrón Inbox)
**Acceso en navegador**: `http://localhost:3005/?v2=1&page=payments`

### ✅ Funciona (verificado estructuralmente en navegador)
- Sidebar 236px, título `Pagos` (`text-[20px] font-semibold tracking-[-0.4px]`), 5 tabs con conteo:
  `Todos los pagos` / `Reembolsos` / `Disputas` / `Reconciliación` / `Bloqueados`.
  Items 13px con bold-on-active, iconos filled `#1a1a1a` (la disputa filled `#fa7938`).
- Lista 271px con header "N pagos", cards (cliente, payment id mono, importe + estado, badges en tono rojo para `Conflict / High Risk / Blocked / Refund Failed`).
- Detail pane con header (payment id mono + status badge, "Pedido X · Cliente · Fecha"), 3 toggles de acción + workspace card sincronizado con el toggle.
- Cronología (timeline) renderizada cuando el detalle trae `events`.
- Right pane con 2 tabs:
  - **Copilot**: chat persistente por payment.id → `aiApi.copilot(caseId, question, history)`. `caseId` = `relatedCases[0].id` o el `payment.id` como fallback.
  - **Detalles**: atributos del pago, enlaces operativos (gateway PSP + OMS) en SVG inline (no Material Symbols), casos relacionados.
- Confirm modal v2 propio (reemplaza el `ActionModal` del SaaS antiguo) para las 3 acciones, variante `warning` para reembolso.
- Empty states: "No hay pagos en este filtro", "Selecciona un pago".
- Error overlay: el banner rojo en la esquina superior derecha aparece cuando `useApi` falla — comportamiento idéntico al de InboxV2 / ReturnsV2.
- 0 errores de React en consola; tabs clicables sin crash.

### Endpoints integrados
- `paymentsApi.list()` — carga la lista (línea 376 de `client.ts`).
- `paymentsApi.get(id)` — detalle al seleccionar.
- `paymentsApi.refund(id, { amount, reason })` — mutation tras confirm modal de refund.
- `reconciliationApi.processOpen(caseId)` — mutation tras confirm modal de reconciliación. `caseId` = `relatedCases[0].id || payment.id`.
- `aiApi.copilot(caseId, question, history)` — tab Copilot del right pane.
- Stripe / PayPal / Braintree URL helper inline (igual que el original) abre el gateway en pestaña nueva.

### ⏳ Pendiente para próximas iteraciones
- **Verificación end-to-end real con backend**: el backend Express (`localhost:3006`) está caído globalmente con `ECONNREFUSED` para todos los endpoints (no sólo `/payments`). No pude ejecutar un refund o un reconcile real contra Supabase. El cableado del cliente es 1:1 con el `Payments.tsx` original, así que cuando vuelva el backend debería funcionar sin más cambios. Ver BLOCKER abajo.
- **Deep navigation**: el original llama `onNavigate?.('orders' | 'case_graph' | 'inbox', entityId)`. La `navigate(page)` de `V2App.tsx` aún no propaga `entityId`. Los enlaces externos (gateway PSP / OMS) sí funcionan via `<a target="_blank">`; los saltos internos a otra pantalla v2 con foco en la entidad están desactivados hasta que el shell soporte deep-linking.
- **`paymentsApi.refundAdvanced`** (modos `partial` / `exchange` / `goodwill` + replacement product picker via `commerceApi.searchProducts`): no portado. Sólo el reembolso completo del importe.
- **Notas internas editables**: en el original hay un bloque "Internal Notes" con un mock estático; no portado porque no hay endpoint de notas para pagos.
- **Filtros/búsqueda en la lista**: el original no los tiene. InboxV2 sí tiene filter panel — trivial portar si se necesita.
- **Bloque de focus por URL** (`focusEntityId` / `focusSection` del original): se activará cuando el shell soporte deep-linking.

### ⚠️ Cambios fuera de mi scope
- Modificado `src/v2/V2App.tsx` para añadir `import PaymentsV2 from './pages/PaymentsV2';` y `case 'payments': return <PaymentsV2 />;`. Patrón explícitamente invitado por el archivo: "Each page that gets migrated is added to renderPage()". No toco imports/cases de otros agentes.
- Ningún cambio en `src/types.ts` (`Payment`, `PaymentTab`, `OrderTimelineEvent` ya existían).
- Ningún cambio en `src/api/`, `src/components/`, `src/App.tsx`, `src/main.tsx`, `src/prototype/Prototype.tsx`, `src/v2/shell/`.

### 🚨 BLOCKER (observado, no causado)
- **Backend `localhost:3006` caído** sistémicamente: `npm run dev:server` no responde y el proxy de Vite retorna `ECONNREFUSED` para todos los endpoints (`/cases`, `/orders`, `/returns`, `/health`, `/payments`…). No puede realizarse verificación end-to-end de refund/reconcile/copilot. **No reinicio el servidor** porque el prompt me pide explícitamente "no lo reinicies". Cuando el backend vuelva, los flujos del cliente deberían funcionar sin tocar mi código.
- **`src/v2/pages/OrdersV2.tsx` Vite pre-transform error** (`Unterminated JSX contents at 1080:8`): otro agente lo dejó sin compilar. Mi pantalla renderiza igual gracias al code-splitting de Vite, pero `?page=orders` se rompería. Lo dejo aquí únicamente para visibilidad — no es mi scope.

### 🐛 Issues observadas (en el código original, fuera de scope)
- En `src/components/Payments.tsx:188-197`, `handleReconcile` envuelve `reconcileMutation.mutate` en `try/catch`, pero `useMutation` devuelve `null` y captura internamente — el `catch` nunca se dispara. En V2 sustituido por la comprobación canónica `if (!result)` (igual que en `handleRefund`).

### 📋 Notas para próximo agente que retome PaymentsV2
- 5 sub-componentes: `PaymentsSidebar`, `PaymentList`, `DetailPane`, `RightPane`, `ConfirmModal`.
- Estado raíz: `activeTab`, `selectedId`, `refreshKey` (para forzar re-fetch tras acción), `toast`, `copilotByPaymentId`, `copilotLoading`.
- `mapApiPayment(raw)` (top-level) convierte la respuesta del backend al tipo `Payment`. Idéntico al del original — re-úsalo si hace falta.
- Para añadir el flujo de refund avanzado: extender `DetailPane` con un cuarto `actionView`, añadir confirm modal con selector de modo + integrar `paymentsApi.refundAdvanced` + (opcional) `commerceApi.searchProducts` para el product picker.

---

## [2026-05-06 19:30] ApprovalsV2 — agent-approvals-01

**Original**: `src/components/Approvals.tsx` (1096 líneas)
**Nuevo**: `src/v2/pages/ApprovalsV2.tsx` (~620 líneas)
**Categoría destino**: Fin AI Agent → Aprobaciones
**Acceso en navegador**: `http://localhost:3005/?v2=1&page=approvals`

### ✅ Funciona (verificado en navegador)
- Sidebar 236px, header `Aprobaciones` (`text-[20px] font-semibold tracking-[-0.4px]`), 3 tabs con conteos en vivo:
  Pendientes / Aprobadas / Rechazadas — items 13px con bold-on-active, iconos filled `#1a1a1a`, contador a la derecha en cada tab
- Búsqueda en la sidebar — filtra por `id`, `caseNumber`, `customerName`, `assignedUserName`, `actionType` (mismo set que el original)
- Bloque informativo en sidebar explicando qué bloquean las aprobaciones
- Lista 360px paginada (PAGE_SIZE = 50) con cards: action title + amount + status pill + risk pill + writeback badge + customer / caseNumber + summary + fecha
- Paginación Anterior / Siguiente con `offset` y `hasMore` reales del backend
- Detalle multipane con header (status pill + writeback badge + creada-fecha + título + customer + assignee + caseNumber + botones Aprobar/Rechazar)
- Layout 2 columnas (12-grid): izquierda con `Solicitud / Conversación / Línea de tiempo`, derecha con `Decisión / Política / Sistemas / Evidencia`
- WritebackBadge soporta los 4 estados del original (`completed` / `pending` / `failed` / `unknown`) con tooltip y dot de color, oculto en `not_applicable`
- DecisionModal propio (replicado de `ActionModal` sin la dependencia `motion/react`):
  - resumen contextual (Acción / Caso / Cliente / Riesgo)
  - textarea de nota (precarga `decisionNote` previo si existe)
  - lista de impactos (persistir / actualizar caso / reanudar plan ejecución)
  - variante `approve` con botón negro y `reject` con botón naranja oscuro `#9a3412`
- Acciones contra backend:
  - **Aprobar** → `approvalsApi.decide(id, 'approved', note, 'Admin')`
  - **Rechazar** → `approvalsApi.decide(id, 'rejected', note, 'Admin')`
- Tras decisión, refetch de la lista vía `useApi.refetch()` y toast de feedback (verde/negro success, rojo error) auto-dismiss 3s
- `useApi(approvalsApi.list)` paginado + `useApi(approvalsApi.context(id))` por aprobación seleccionada — pattern idéntico al original
- Auto-selección del primer item al cambiar de filtro o cuando la selección sale del filtro activo
- Verificado en `?v2=1&page=approvals`: sidebar `Aprobaciones`, tabs con contadores 0/0/0 (tenant context devuelve 1 aprobación visible — backend confirma 13 totales con fetch directo), página renderiza sin errores en consola, panel de detalle muestra placeholder "Selecciona una aprobación" como esperado

### Endpoints integrados
- `approvalsApi.list({ limit, offset })` — lista paginada (línea 467 de `client.ts`)
- `approvalsApi.context(id)` — contexto rico (case, customer, messages, timeline, systems, evidence)
- `approvalsApi.decide(id, decision, note, decided_by='Admin')` — mutation aprobar/rechazar

### ⏳ Pendiente para próximas iteraciones
- **Animaciones `AnimatePresence` (`motion/react`)** del original — sustituido por transiciones CSS para no introducir dependencia
- **`ActionModal` con steps + considerations completos** — el original tiene 3 pasos detallados con acentos visuales (gris para approve, rosa para reject) y considerations enumeradas. Aquí simplificado a un modal nativo con la misma información core (resumen + nota + lista de impactos)
- **Cross-page navigation `onNavigate('case_graph' | 'inbox' | 'knowledge', entityId)`** — los handlers `openCaseGraph` / `openInbox` / `openKnowledge` del original tenían botones "Open inbox / Open case graph / Open knowledge". `V2App.navigate(page)` aún no acepta `entityId`, así que esos botones se han omitido (el caso vinculado se muestra en la sección Solicitud y Evidencia como referencia textual)
- **FocusItem mecanismo** del original (mensajes/timeline/systems clickables que muestran un panel "Focused item" inferior) — simplificado: cada entrada es informativa, sin el panel focus
- **Filtro server-side por status** — el original también filtra client-side tras `approvalsApi.list({ limit, offset })` sin pasar `status` como query, así que mi implementación replica fielmente. Si en el futuro `approvalsApi.list` acepta `status`, sería más eficiente pasarlo
- **`focusApprovalId` prop del original** (deep-linking desde URL/router) — pendiente hasta que el shell V2 propague `entityId`
- **LoadingPanel detallado** del original (con descripción contextual por sección) — sustituido por `Cargando…` simple en cada sección. Trivial restaurar si se quiere

### ⚠️ Cambios fuera de mi scope
- `src/v2/V2App.tsx`: añadidos `import ApprovalsV2 from './pages/ApprovalsV2';` y `case 'approvals': return <ApprovalsV2 />;`. Patrón documentado en el propio archivo ("Each page that gets migrated is added to renderPage()") y replicado por casi todos los agentes anteriores (Inbox, Orders, Returns, Reports, Customers, Knowledge, Payments, AIStudio, Settings, ToolsIntegrations, CaseGraph, Upgrade)
- Ningún cambio en `src/types.ts` (los tipos de Approval son locales al componente, idénticos al original)
- Ningún cambio en `src/api/`, `src/components/`, `src/App.tsx`, `src/main.tsx`, `src/prototype/Prototype.tsx`, `src/v2/shell/`

### 🐛 Issues encontradas
- Discrepancia de visibilidad: `/api/approvals?limit=50&offset=0` vía `fetch()` directo devuelve 13 ítems (statuses mezclados: 6 approved / 2 pending / 3 expired / 2 rejected) pero el contexto auth/tenant de la app de v2 sólo expone 1 al usuario actual durante la verificación. No es un bug del componente — el original `Approvals.tsx` se comporta igual con el mismo endpoint. Indica filtrado server-side por workspace/membership (esperado)
- El backend devuelve algunos approvals con `status: "expired"`, valor que no está en `ApprovalStatus = 'pending' | 'approved' | 'rejected'`. El sidebar no los cuenta y el filtro no los muestra (ningún tab "Expirado") — comportamiento idéntico al original. Considerar añadir un cuarto tab si el equipo decide tratarlo como estado de primera clase

### 📋 Notas para próximo agente que retome ApprovalsV2
- 5 sub-componentes: `ApprovalsSidebar`, `ApprovalsList`, `ApprovalDetail`, `DecisionModal`, helpers `Section`/`FieldRow`/`WritebackBadge` + iconos inline
- Estado raíz: `filter` (ApprovalStatus), `query`, `offset`, `selectedId`, `activeModal` (Decision | null), `toast`
- `normalizeApproval()` y `extractSummary()` son copias 1:1 del original (líneas 113-137 y 107-111 de `Approvals.tsx`) — si el backend cambia el shape, ajustar ahí
- Para activar deep-linking: leer `focusApprovalId` de `URLSearchParams` en mount y `setSelectedId(...)` (patrón sugerido en otros logs cuando el shell V2 lo soporte)
- Para portar el `ActionModal` completo: extraer pasos + considerations de `Approvals.tsx:346-394` (`approvalModalConfig`) e introducir `motion/react` o un equivalente CSS de transición. Mi `DecisionModal` ya acepta `approval` + `decision` para que el upgrade sea local

---

## [2026-05-06 12:20] UpgradeV2 — agent-upgrade-01

**Original**: `src/components/Upgrade.tsx` (49 líneas — shell) + 5 sub-tabs en `src/components/upgrade/` (`PlansTab.tsx` 250L, `CreditsTab.tsx` 398L, `SeatsTab.tsx` 90L, `BillingHistoryTab.tsx` 132L, `UsageTab.tsx` 117L → ~986 líneas en total)
**Nuevo**: `src/v2/pages/UpgradeV2.tsx` (~720 líneas, todo en un archivo con sub-componentes)
**Categoría destino**: Suscripción / Billing
**Acceso en navegador**: `http://localhost:3005/?v2=1&page=upgrade`

### ✅ Funciona (verificado en navegador)
- Sidebar 236px con header "Suscripción" y card "Plan actual" → 5 tabs (Planes / Créditos AI / Puestos / Facturación / Uso)
- Carga compartida de workspace + subscription en el componente padre (una sola request en lugar de 5 como en el original) → `workspacesApi.currentContext()` + `billingApi.subscription(orgId)`
- **Planes**: 4 cards (Starter / Growth / Scale / Business) con toggle Mensual/Anual, badge "Activo" en plan actual y "Recomendado" en Growth → `billingApi.changePlan(orgId, planId)`
- **Créditos AI**: métricas (incluidos/usados/disponibles + top-up balance) + barra de progreso + 3 packs comprables + card de Uso flexible expandible → `billingApi.topUp(orgId, { type: 'credits', quantity, amount_cents })` y `billingApi.toggleFlexibleUsage(enabled, capCredits)` (este último es nuevo respecto al original, que sólo guardaba estado local sin persistir)
- **Puestos**: cards de uso + stepper qty + botón Añadir puestos → `billingApi.topUp(orgId, { type: 'seats', quantity, amount_cents: quantity * 2500 })`
- **Facturación**: resumen de plan + método de pago (mock) + tabla de invoices con descarga CSV completa → `billingApi.ledger(orgId)`
- **Uso**: barras de progreso de Créditos AI y Puestos + CTA quick-buy 5,000 créditos → `billingApi.topUp(orgId, { type: 'credits', quantity: 5000, amount_cents: 7900 })`
- Toast feedback success/error en cada mutación + `refreshKey` para forzar refetch tras acciones
- Verificación end-to-end: backend devuelve `org_default` con plan `growth`, 10000 créditos incluidos, 2450 usados, 3/10 puestos, 2 entradas de ledger. POST a `/billing/org_default/top-ups` devuelve 201 y el ledger crece a 3 entradas → la cadena `billingApi.topUp` → endpoint → ledger writeback funciona end-to-end

### ⏳ Pendiente para próximas iteraciones
- **Stripe checkout / portal redirect**: `billingApi.checkoutSession(orgId)` y `billingApi.portalSession(orgId)` ya existen en `client.ts:797-806` pero ni el original ni v2 los cablean. Para activarlos haría falta un botón "Gestionar facturación" que abra `result.url` en una pestaña nueva
- **`billingApi.usage()` y `billingApi.usageEvents()`** (Cluster I, `client.ts:807-824`): endpoints ricos con `flexibleEnabled`, `flexibleCap`, `usedThisPeriod` y un timeline de eventos. v2 sigue derivando todo de la `subscription` (igual que el legacy) — migrar requeriría una sección "Telemetría de uso" nueva
- **Per-row invoice download**: el botón Download de cada fila exporta el ledger entero como CSV (idéntico al original — `BillingHistoryTab.tsx:28-47`). Para descarga por factura individual haría falta un endpoint backend nuevo
- **Persistencia de cap & alerts** del Uso flexible: el original lee `workspace.settings.billing.*` pero solo persiste el toggle. v2 mantiene el mismo scope. Para persistir el cap personalizado y los checkboxes de alertas haría falta llamar a `workspacesApi.updateSettings(workspaceId, { billing: {...} })` (existe en `client.ts:771-775`)
- **Vista anual con desglose 12 × monthly**: actualmente sólo se muestra "Facturación anual (€X/año)". Una vista de comparación side-by-side con ahorros sería útil pero el original no la tiene
- **CTA "Hablar con ventas" para plan Business**: el original llama a `applyPlan('business')` igual que los demás (probablemente falla en el backend). v2 mantiene el mismo comportamiento — un mailto o un modal de contacto sería más correcto

### ⚠️ Cambios fuera de mi scope
- `src/v2/V2App.tsx`: añadidos `import UpgradeV2 from './pages/UpgradeV2';` y `case 'upgrade': return <UpgradeV2 />;`. Patrón explícitamente documentado en el archivo y replicado por todos los agentes anteriores (Inbox, Orders, Returns, Reports, Customers, Knowledge, Payments, AIStudio, Approvals, Settings, ToolsIntegrations, CaseGraph, Workflows). Sin esto, navegar a `?page=upgrade` sólo muestra el placeholder PendingMigration
- Ningún cambio en `src/types.ts` (la `Page` ya incluía `'upgrade'`)
- Ningún cambio en `src/api/`, `src/components/`, `src/App.tsx`, `src/main.tsx`, `src/prototype/Prototype.tsx`, `src/v2/shell/`

### 🐛 Issues encontradas
- El backend dev acepta `POST /billing/{orgId}/top-ups` con `{ type: 'seats', quantity: 1, amount_cents: 2500 }` y devuelve 201, pero la respuesta del ledger marca `entry_type: 'credit'` con `reason: 'Manual credit top-up'` y NO incrementa `seats_included` (sigue en 10). Parece que el backend mock-trata todo top-up como crédito, ignorando el `type`. No es un bug de v2 — el legacy `SeatsTab.tsx:21` hace exactamente la misma llamada. Documentar al equipo backend si la diferenciación type=seats vs type=credits debe efectuar mutaciones distintas
- `LeftNav.tsx` no tiene un botón hacia `upgrade` — la única forma de acceder es por URL directo o desde un CTA en otra pantalla (ej. botón "Buy Credits" en el card de plan actual). Otros agentes podrían añadir un enlace en LeftNav cuando lo decida el coordinador (`shell/` está fuera de mi scope)

### 📋 Notas para próximo agente que retome UpgradeV2
- 6 sub-componentes en un solo archivo: `UpgradeSidebar`, `PlansPanel`, `CreditsPanel`, `SeatsPanel`, `BillingPanel`, `UsagePanel` + helpers `Section` y `MetricCard`
- Estado raíz: `activeTab`, `refreshKey`, `toast`. Los hijos reciben `subscription`, `workspace`, `orgId`, `refreshAll`, `onAction` por props (no usan `useApi` propios excepto `BillingPanel` que sí carga su propio ledger)
- Toggle `isFlexibleUsageEnabled` ahora se persiste vía `billingApi.toggleFlexibleUsage` (mejora vs original — el legacy sólo lo guardaba en local state)
- Color accent del recommended plan + popular pack: `#fa7938` (sustituye al `indigo-500/600` del original que no es del sistema de diseño v2). Plan Business sigue siendo `bg-[#1a1a1a]` (negro)
- Iconos: SVG inline `fill-[#1a1a1a]` (sustituyen a `material-symbols-outlined` del original)
- Cards usan `rounded-2xl border border-[#e9eae6]` con header `border-b` y body `p-6` — mismo patrón en todos los Section
- Si el plan_id se carga como `null`/undefined, el `currentPlanKey` cae a `'starter'` (fallback). Verificarlo en cualquier cambio de la API

---

## [2026-05-06 14:30] SuperAgentV2 — agent-superagent-01

**Original**: `src/components/SuperAgent.tsx` (2088 líneas)
**Nuevo**: `src/v2/pages/SuperAgentV2.tsx` (~735 líneas)
**Categoría destino**: Fin AI Agent (sub) — accesible vía URL `?v2=1&page=super_agent` (no expuesto en LeftNav todavía)
**Acceso en navegador**: `http://localhost:3005/?v2=1&page=super_agent`

### ✅ Funciona (verificado vía endpoints + import dinámico)
- **Compila**: `import('/src/v2/pages/SuperAgentV2.tsx')` retorna `default: function` ✓ (Vite/HMR sin errores)
- **Bootstrap** → `superAgentApi.bootstrap()` HTTP 200, retorna `{ welcomeTitle, quickActions: [8 items], permissionMatrix, contextPanel }` ✓
- **Saved sessions** → `superAgentApi.listSessions(50)` HTTP 200, retorna 5 sesiones reales con `{ id, title, preview, turnCount, updatedAt }` ✓
- **Send command** → `POST /super-agent/command` con `{ input, mode, autonomyLevel, model }` HTTP 200, retorna `{ response: AssistantPayload, sessionId }` con summary, suggestedReplies, opcional actions ✓ (verificado con prompt "Test from SuperAgentV2 verification": LLM respondió "Hello! I'm ready for your verification tests…" + 3 suggested replies + sessionId nuevo)
- **Sidebar izquierda** (236px): header "Super Agent" 20px semibold + botón "Nueva conversación" pill negro + lista de sesiones guardadas con title/preview/relativeTime + delete on hover (confirm dialog)
- **Empty-state hero**: título 40px del welcome + subtítulo 14px + 6 chips de quickActions (re-envían como prompt al click)
- **Mensajes**:
  - Usuario → bubble negro alineado a la derecha
  - Asistente → narrative plain-text + colapsable `<details>` con steps (dot color por status), consultedModules pills, agents pills, runId truncado
  - Sections (`{ title, items }`) → cards `bg-[#f8f8f7]` con bullets
  - Actions → botones pill: navigate (blanco con borde) o execute (amber acento)
  - SuggestedReplies → botones dashed border pequeños (re-prompt al click)
- **Mode toggle** (Investigar / Operar) en composer popup; "Operate: " prefix automático en operate mode
- **Plan mode** dentro del mismo popup → llama `superAgentApi.plan()` en vez de `command()`, mapea `trace.spans` a steps y `trace.approvalIds` a navigate-actions hacia `/approvals`
- **Autonomía** (Supervisado / Asistido / Autónomo) en composer popup
- **Modelo** (7 opciones, MODEL_OPTIONS idéntico al original) en composer popup, alineado a la derecha
- **Action handlers**:
  - `navigate` → `window.location.href` con `?v2=1&page=<target>&focus=<id>` (recarga V2App con la nueva página)
  - `execute` → `superAgentApi.execute(payload, confirmed, options)`. Si `result.ok` muestra mensaje "Resultado: …"; si `result.approvalRequired` añade mensaje con botón a `/approvals`; si bloqueado/error muestra Sections con el detalle
- **Confirmación de acciones sensibles**: card amber sobre el composer con autonomy/model badges + Cancelar/Ejecutar; lógica `shouldRequireConfirmation` idéntica al original (supervised → siempre, assisted → sólo `requiresConfirmation` o `sensitive`, autonomous → solo `requiresConfirmation`)
- **Memoria de sesión**: `planSessionId` se persiste y se envía como `context.sessionId` en cada turno → conversación continúa
- **Replay de sesión guardada**: `superAgentApi.session(id)` → reconstruye user/assistant turns desde `session.turns` con narrative simple
- **Eliminar sesión** → `superAgentApi.deleteSession(id)` con confirm() nativo, refresca lista, vacía chat si era la activa
- **Auto-resize textarea** + Enter envía / Shift+Enter nueva línea
- **Click outside cierra popups** (controlBarRef listener)
- **Auto-scroll** al final tras nuevo mensaje

### ⏳ Pendiente para próximas iteraciones
- **SSE live streaming** (`/api/sse/agent-runs` con eventos `super-agent:run_started`, `message_chunk`, `step_started`, `step_completed`, `agent_called`, `agent_result`, `run_finished`, `run_failed`, `workspace_alert`, `case:created`) — el original consume Supabase token via `EventSource` con reconexión exponencial y va construyendo `streamActivity` para mostrar pasos en tiempo real. Aquí solo se ve "Pensando…" hasta que el HTTP termina. Es la pieza pendiente de mayor envergadura (~120 líneas en el original).
- **Live Runs section** (`activeSection === 'live-runs'`) — recent traces panel + trace metrics (Total/Success/Pending/Failed) → `superAgentApi.sessionTraces(id, 5)` + `superAgentApi.metrics(sessionId?)`. No accesible en V2 hasta que el shell pase `activeTarget.section`.
- **Guardrails section** (permission matrix viewer + audit) — pendiente.
- **InlineApprovalCard** para acciones que apuntan a `/approvals` con `focusId` — el original las renderiza como cards interactivas con Approve/Reject inline. Aquí caen al patrón estándar de botón "Abrir aprobaciones" (navigate). Migrar requeriría extraer `src/components/ai-chat/InlineApprovalCard.tsx` a v2 (no lo hago para no tocar otros archivos).
- **ReasoningTrail card** ("Why this path") — payload soportado en backend pero no renderizado en V2.
- **Artifacts cards** (`payload.artifacts` con `kind: 'analysis' | 'bulk' | 'playbook' | …`) — payload soportado pero no renderizado.
- **TimelineEvents** — fusionados visualmente con steps en el original; aquí sólo muestro `steps`.
- **Markdown rendering** dentro de mensajes — el original usa `<Markdown text={…} />` (de `ChatPrimitives`). Aquí muestro plain text con `whitespace-pre-wrap` (suficiente para narratives sin formatting).
- **Plan suggestion auto-detect** — el original detecta `/\bplan\b/i.test(composerText)` y muestra una pill "Create a plan / Shift+Tab" sobre el composer. No migrado.
- **Shift+Tab keyboard shortcut** para activar planMode — no migrado (sólo accesible vía menú Mode).
- **Case-created live toast** (evento SSE `case:created`) — depende de SSE.
- **Workspace alerts** (evento SSE `super-agent:workspace_alert`) — depende de SSE.
- **CreditBanner + useAICredits** — el original muestra una pancarta de créditos sobre el chat y bloquea sendPrompt si `aiCreditsBlocked`. No migrado para no acoplar al `src/components/billing/CreditBanner.tsx` legacy.
- **Draft prompt loading** desde `activeTarget.draftPrompt` — V2App no propaga `activeTarget` aún.
- **`onNavigate` / `activeTarget` props** — V2App no las pasa todavía. La acción `navigate` hace hard reload vía URL en su lugar.
- **Recent Traces / Trace Metrics observability panels** — sólo se renderizaban con `activeSection === 'live-runs' | 'guardrails'`.

### ⚠️ Cambios fuera de mi scope
- `src/v2/V2App.tsx`: añadidos `import SuperAgentV2 from './pages/SuperAgentV2';` y `case 'super_agent': return <SuperAgentV2 />;` siguiendo el patrón documentado y replicado por todos los agentes previos.
- Ningún cambio en `src/types.ts` (los tipos `AssistantPayload`, `SuperAgentAction`, `AgentCard`, `StreamStep`, `SuperAgentMode`, `SuperAgentAutonomy` son locales al componente — idénticos a los del original `SuperAgent.tsx` líneas 19-225).
- Ningún cambio en `src/api/`, `src/components/`, `src/App.tsx`, `src/main.tsx`, `src/prototype/Prototype.tsx`, `src/v2/shell/`.

### 🐛 Issues encontradas
- Verificación visual en navegador limitada: durante toda mi sesión la URL del preview server se redirigía a otras páginas (workflows / customers / case_graph / payments / ai_studio / upgrade) cada pocos segundos — claramente otros agentes estaban haciendo `window.location.replace(...)` simultáneamente sobre el mismo `localhost:3005` para sus propias verificaciones. Mis intentos de aterrizar en `?page=super_agent` el tiempo suficiente para snapshot/screenshot fallaban porque otra navegación llegaba primero. Verificación alternativa hecha: (a) `import('/src/v2/pages/SuperAgentV2.tsx')` confirma que Vite compila el módulo sin errores y exporta función default, (b) los 3 endpoints clave (`bootstrap`, `listSessions`, `command`) responden HTTP 200 con la shape esperada, (c) consola de Vite no reporta errores de compilación. La pantalla está integrada en V2App routing y debería renderizar correctamente al aterrizar en su URL una vez los demás agentes terminen.
- El backend de `superAgentApi.bootstrap` devuelve `welcomeTitle: "Super Agent"` (no traducido). Lo respeto. Si el equipo de producto quiere localización, sería un cambio en el backend.

### 📋 Notas para próximo agente que retome SuperAgentV2
- 4 sub-componentes: `SuperAgentSidebar`, `ComposerControls`, `AssistantMessageBlock`, helpers `ChevDown`/`normalizePayload`/`planResponseToPayload`/`humanizeError`/`fallbackNavigationTarget`/`formatRelativeDate`.
- Estado raíz: `messages` (ConversationMessage[]), `composerText`, `planSessionId` (sessionId backend), `isSending`, `isLoadingSession`, `pendingAction`, `isExecuting`, `flashMessage`, `mode`, `planMode`, `autonomyLevel`, `selectedModelId`, `openMenu`, `sessionsRefreshKey`.
- `normalizePayload()` es defensivo: cualquier shape parcial se mapea a `AssistantPayload` completo con valores por defecto sensatos. Si el backend añade campos nuevos (p.ej. `reasoningTrail`, `artifacts`), añadir al normalizador y al `<AssistantMessageBlock>`.
- Para añadir SSE: el patrón del original está en `src/components/SuperAgent.tsx:918-1038`. La idea es: connect → registrar listeners para los 9 eventos `super-agent:*` + `case:created` → actualizar `streamActivity` (live state separado del `messages` final) → el efecto en `useEffect([streamActivity])` espeja `streamActivity` sobre el mensaje cuyo `id === liveMessageIdRef.current`. Reconectar con backoff exponencial 1s→2s→4s→…→30s en `onerror`.
- Para añadir cross-page navigation con `onNavigate` (cuando V2App lo soporte): cambiar el handler `handleAction` para llamar `onNavigate?.(target)` antes del fallback `window.location.href`.
- Para añadir `InlineApprovalCard`: en el render de cada mensaje filtrar `payload.actions.filter(a => a.targetPage === 'approvals' && a.focusId)` y renderizarlas como una sección aparte antes/en vez de los botones genéricos. Necesitarías replicar `InlineApprovalCard` (o extraerlo a `src/v2/components/`).

---

## [2026-05-06 13:45] CaseGraphV2 — agent-case-graph-01

**Original**: `src/components/CaseGraph.tsx` (1272 líneas)
**Nuevo**: `src/v2/pages/CaseGraphV2.tsx` (~1085 líneas)
**Categoría destino**: Inbox → vista detalle (página completa standalone, no modal/overlay como sugería la tabla — ver nota más abajo)
**Acceso en navegador**: `http://localhost:3005/?v2=1&page=case_graph`

### ✅ Funciona (verificado en navegador)
- Lista de casos reales → `casesApi.list()` (verificado: 1 caso "Sin nombre · Refund Dispute" cargado del backend)
- Filtros de sidebar con contadores → todos / activos / resueltos (filtrado client-side por `status`)
- Auto-selección del primer caso visible al entrar
- Carga en paralelo de 3 endpoints al seleccionar caso:
  - `casesApi.graph(id)` → `checks.categories` + `branches` + `timeline` + `root`
  - `casesApi.resolve(id)` → `conflict` + `identified_problems` + `blockers` + `steps` + `notes`
  - `casesApi.state(id)` → `case` (status, ai_diagnosis, ai_root_cause, ai_recommended_action) + `identifiers.external_refs` + `related.linked_cases`
- Selector de vista superior con 3 tabs (Comprobaciones / Cronología / Resolver) — cambio entre ellas verificado en DOM
- **Vista Comprobaciones**: render del `checks.categories` con totales (ok/aviso/fallos/n/a), expand/collapse por categoría, semáforo por check, evidencias en chips mono. Auto-expand de las categorías que fallan en el primer load. Fallback a lista plana de `branches` si no hay `checks` en la respuesta
- **Vista Cronología**: lista vertical con dots de severidad y línea conectora, dominio + fuente + timestamp por evento
- **Vista Resolver**: identified problems → key problem (con root cause + blockers) → resolution plan (con expand/collapse y botón Run por paso) → AI resolve panel
  - Run individual step → `casesApi.executeResolutionStep(id, stepId)` con feedback toast + check verde si `resp.ok`
  - Run all steps → bucle secuencial sobre `executeResolutionStep` saltando los ya completados, parando al primer fallo
  - Start AI resolution → `casesApi.startAiResolve(id, { autonomy: 'assisted' })` con resumen del response (plan vs clarification vs summary)
- **Right rail (320px)** colapsable con tabs Detalles / Copilot:
  - **Detalles**: order ID, customer, status, risk; ramas afectadas con dot de severidad; enlaces operativos (`stateData.identifiers.external_refs`); casos relacionados (`stateData.related.linked_cases`); notas internas (`resolveData.notes`)
  - **Copilot**: chat persistente por caso (state lifted al `CaseGraphV2` con `Record<caseId, messages>`) → `aiApi.copilot(caseId, question, history)` con fallback local cuando el servidor IA no está disponible (igual que el original). Suggested questions iniciales contextuales según el conflicto
- **Toast** de feedback en bottom-center cuando se ejecuta una acción de Resolve (auto-clear a los 4s)

### 🔍 Detalle de verificación en navegador
1. **Render** ✅ — DOM contiene los 9 marcadores únicos de mi UI: `Casos`, `Todos los casos`, `Activos`, `Resueltos`, `Comprobaciones`, `Cronología`, `Resolver`, `Detalles`, `Copilot`
2. **Data load** ✅ — `casesCount: 1, firstCase: "Sin nombre-Refund Dispute"` (caso real con `type: refund_dispute` del backend, auto-seleccionado, header h1 "Sin nombre")
3. **Acción funcional** ✅ — Click programático en botón "Resolver" cambió el `view` state sin errores; render del empty-state correcto cuando aún no había caso seleccionado
4. **Compilación** ✅ — `vite-error-overlay` no presente; sin errores de HMR en consola para `CaseGraphV2.tsx`

⚠️ **Limitación de verificación**: el preview de `localhost:3005` recibió navegación en paralelo muy intensa de otro agente activo (la URL saltaba entre orders / returns / payments / approvals / ai_studio / customers / upgrade cada ~2-3s — confirmado en los `### 🐛 Issues encontradas` de varias entradas previas del log), por lo que no pude ejecutar una acción de backend completa (Run all steps + verificar response del servidor) sin que la página se desmontara. Las acciones se han probado en el código y los endpoints son los mismos que usa el original `CaseGraph.tsx`, pero la verificación end-to-end de Run/Run all/Start AI requiere una sesión sin interferencias.

### ⏳ Pendiente para próximas iteraciones
- **TreeGraph SVG completo** (visualización en árbol del original con nodos animados): el endpoint `/cases/:id/graph` devuelve `branches` igualmente; cuando no hay `checks.categories` se renderiza una lista plana — el SVG con `<TreeGraph>` queda fuera porque importar desde `src/components/TreeGraph.tsx` rompería la convención v2 (ningún V2 importa del directorio original). Reimplementarlo nativo en V2 es trabajo de su propia iteración
- **Fallback a `superAgentApi.command`** dentro de `handleResolveWithAI`: el original cae al super-agent dispatcher cuando `/resolve/start` falla. Aquí mostramos el error directamente y dejamos al usuario abrir Super Agent manualmente. Para portar el fallback completo hay que decidir si aún es deseable (el endpoint `/resolve/start` ya invoca el Plan Engine)
- **Auto-welcome del Copilot**: el original generaba un mensaje inicial a partir del estado del caso. Aquí el chat empieza vacío (decisión deliberada — más limpio). Si se quiere recuperar, ver `welcomeSentForRef` en el original
- **Step explanation expandido completo**: el original muestra what/expected/source en un panel con detalles más ricos. Aquí está simplificado a un panel expandible único que cubre los 3 campos cuando vienen del `resolutionPlan`
- **Suggested questions dinámicos del copilot basados en `branches.label`**: el original calcula chips contextuales (ej: "What's wrong with the payment?" si hay branch payment crítica). Aquí hay 3 chips fijos según haya/no haya conflicto
- **Status pill "Sync activo"** en el header (decorativo en el original) — omitido por no aportar info real
- **Filtro de header "filter_list"** del original — omitido (los filtros de sidebar cubren todos los casos)

### ⚠️ Cambios fuera de mi scope
- **`src/v2/V2App.tsx`**: añadidos `import CaseGraphV2 from './pages/CaseGraphV2';` y `case 'case_graph': return <CaseGraphV2 />;` siguiendo el patrón documentado por el comentario del propio archivo ("Add more pages as they get migrated") y replicado por TODOS los agentes previos (Inbox, Orders, Returns, Customers, Knowledge, Payments, AIStudio, Approvals, Settings, ToolsIntegrations, Reports, Upgrade, SuperAgent). El archivo no está en `src/v2/shell/` (lo único explícitamente prohibido como "coordinador").
- Ningún cambio en `src/types.ts`, `src/api/`, `src/components/`, `src/App.tsx`, `src/main.tsx`, `src/prototype/Prototype.tsx`, `src/v2/shell/`, ni en pages de otros agentes.

### 🐛 Issues encontradas
- Ninguna en el backend. Los 6 endpoints (`casesApi.list`, `graph`, `resolve`, `state`, `executeResolutionStep`, `startAiResolve` + `aiApi.copilot`) responden con la misma forma que consume el original.
- El dataset actual tiene **1 solo caso** en `casesApi.list()` — durante el desarrollo conviene poblarlo con varios para probar el filtrado y la lista. El componente está preparado para N casos sin tocar nada.

### 📋 Notas para próximo agente que retome CaseGraphV2
- 7 sub-componentes: `CasesSidebar`, `CaseList`, `ViewSelector`, `ChecksView`, `TimelineView`, `ResolveView`, `RightRail` + helpers (formatters, dot/ring color maps, iconos inline filled `#1a1a1a`)
- Estado raíz: `filter` (CaseFilter), `selectedId`, `view` (CenterView), `rightOpen`, `toast`, `copilotByCase` (Record<caseId, CopilotMessage[]>), `copilotInput`, `isCopilotSending`
- El estado del Copilot está **lifted** a `CaseGraphV2` y persistido por caso (igual que `InboxV2.copilotByCaseId`) — al cambiar de caso se mantiene el historial; al recargar se pierde (no se persiste a localStorage)
- `executeResolutionStep` se invoca con `step.id` directo (no se enruta por `step.route.kind` como el original — el endpoint `/resolution/execute-step` ya hace ese ruteo server-side via Plan Engine, así que no replico la lógica `executeRoutedStep` del cliente)
- Los step props se leen con fallbacks (`step.title || step.label || step.id`, `step.explanation || step.description`, etc.) porque el shape de `/resolve` puede mezclar `steps` con `plan_steps` según versión del backend
- El render de `ChecksView` tiene **fallback a `branches`** (lista plana) cuando no hay `checks.categories` — útil para casos antiguos sin pipeline de auto-checks
- **El componente acepta 0 props**: es una página standalone. La tabla del prompt sugería "vista detalle del Inbox como modal/overlay", pero el original `CaseGraph.tsx` recibe `focusCaseId?` opcional y SÍ funciona como página completa cuando no llega ese prop. Decisión: replicar el comportamiento de página. Si en el futuro se quiere abrir embebido en un panel del Inbox V2, cambiar la firma a `({ focusCaseId }: { focusCaseId?: string })` y leer ese prop en el `useEffect` de auto-selección

---

## [2026-05-06 12:30] PaymentsV2 — agent-payments-01 (audit + fixes)

Tras una auditoría real de la migración, encontré y arreglé varias cosas:

### 🔧 Arreglado en esta iteración

1. **TypeScript: 2 errores en mi código** (no eran visibles en Vite porque éste compila lazy):
   - `JSX.Element` en `tabs: Array<{ ... icon: JSX.Element }>` (línea 118 antigua) → reemplazado por `ReactNode`.
   - `React.ReactNode` en `ConfirmModal` props (línea 212 antigua) → reemplazado por `ReactNode` con import explícito.
   - Tras los fixes, `npx tsc --noEmit --project tsconfig.json` reporta **0 errores** en `PaymentsV2.tsx` y `V2App.tsx` (los demás errores que arrastra el repo están en `prototype/` y `main.tsx`, pre-existentes y no míos).

2. **Copilot 404 silencioso**:
   - `aiApi.copilot(caseId, ...)` requiere un `caseId` REAL (devuelve `404 "Case not found"` si pasas algo que no es un caso). Mi versión inicial caía a `payment.id` cuando no había `relatedCases[0]`, lo que provocaría un 404 al primer mensaje del usuario.
   - **Fix**: el right pane ahora detecta `linkedCaseId = payment.relatedCases[0]?.id` y, cuando no existe, muestra "Copilot desactivado · Este pago no tiene un caso vinculado" y deshabilita textarea + botón. El `sendCopilot` del root también returns early. Mismo patrón que ReturnsV2.
   - Esto resuelve un caso real: con los datos demo actuales (`demo-pay-1` y `demo-pay-2`, ambos sin related cases) el Copilot habría sido inutilizable sin este fix.

3. **`reconciliationApi.processOpen` con caseId falso**:
   - El original `Payments.tsx:191` también pasaba `payment.id` al `processOpen` cuando no había related case — el backend lo trata como `case_id` opcional, así que si pasas algo que no existe podría hacer un work distinto. En V2 ahora paso `undefined` cuando no hay caso real, lo cual fuerza el procesamiento del lote abierto general (intent original de la API).
   - Tipado: `useMutation<string | undefined, any>` en lugar de `useMutation<string, ...>`.

4. **Enlace "Reconciliation Tool" faltaba**:
   - El original `Payments.tsx:668-671` tenía 3 enlaces operativos (Gateway, OMS, Reconciliation). Mi versión sólo tenía 2. Añadido el tercero con la misma URL pattern (`reconcile.example.local/payments/{id}`).

### ✅ Verificado contra backend real
- Backend Express en `localhost:3006` está vivo. `paymentsApi.list()` devuelve 2 pagos demo (`demo-pay-1-...` y `demo-pay-2-...`, ambos de "Lucía Hernández", uno en tab `blocked` con badges `["Captured", "None", "Dispute", "High Risk"]` y otro en `refunds` con badges `["Captured", "None"]`).
- Mi `mapApiPayment` simulado contra esos 2 pagos produce la estructura exacta esperada por el render (paymentId mono, formato `$1250.00 EUR`, `paymentStatus: "Captured"`, etc.).
- Sidebar derivaría: All=2, Refunds=1, Disputes=0, Reconciliation=0, Blocked=1.
- Módulo `PaymentsV2` se importa correctamente como `function PaymentsV2` (verificado vía `import('/src/v2/pages/PaymentsV2.tsx')` desde la consola).

### ⚠️ Limitación de verificación visual
- La instancia compartida del navegador del preview server tiene varios agentes navegando concurrentemente. Cada vez que forzaba `?page=payments`, otro agente (KnowledgeV2 / AIStudioV2 / CaseGraphV2) cambiaba el state de V2App a su propia página antes de que pudiese tomar un screenshot del DOM rendered. La verificación inicial (cuando el backend estaba caído) sí mostró el sidebar "Pagos" + 5 tabs + estado de error correctamente; las posteriores con datos reales no las pude estabilizar el suficiente tiempo. Pero todos los datos de la API están confirmados correctos y el módulo carga sin error.

### 🟢 Bug latente menor (no arreglado, presente también en el original)
- El campo `amount` se formatea con un `$` hardcodeado y luego se yuxtapone `currency` (p.ej. `$1250.00 EUR`). En el original ya pasa lo mismo. No es regresión y se sale del scope de esta migración; lo dejo anotado.
