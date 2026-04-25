# Backend Completion Plan — Super Agent

**Goal**: Cerrar los 4 items pendientes para que el Super Agent funcione realmente como ChatGPT/Claude.

---

## Item 1 — Narrativa conversacional (siempre)

**Estado actual**: `narrative` solo se rellena en clarification y operate; en investigate copia `summary`.

**Cambios**:
1. `server/agents/planEngine/llm.ts`: añadir método `composeNarrative()` al LLMProvider que recibe `(userMessage, mode, traceSummary, spans)` y devuelve un texto conversacional de 2–4 frases.
2. `server/routes/superAgent.ts → buildResponseFromPlanOutcome`: llamar a `composeNarrative()` cuando hay éxito (success/partial). Cachear por `runId`.
3. Fallback determinista si el LLM falla (frase corta basada en spans + summary).

**Resultado**: cada respuesta del agente arranca con un párrafo natural ("He revisado el pedido ORD-123 y está en estado *processing*. El último pago se autorizó hace 2 horas...") en lugar de devolver el `summary` técnico.

---

## Item 2 — Respuestas distintas por modo (garantizadas)

**Estado actual**: el system prompt menciona el modo, pero la respuesta final se construye igual.

**Cambios**:
1. `buildResponseFromPlanOutcome`: ramificar por `mode`:
   - **investigate**: `narrative` con hallazgos + `suggestedReplies` exploratorias + acciones de tipo navigate.
   - **operate**: `narrative` con plan/impacto **antes** de ejecutar + acciones execute con `verificationDisplay` poblado + `statusLine` "Awaiting confirmation" si `needsApproval`.
2. Ajustar `statusLine` por modo: `Investigated`, `Ready to execute`, `Executed`, `Awaiting approval`.
3. En investigate, suprimir acciones execute aunque el LLM las proponga (failsafe).

**Resultado**: el mismo prompt en investigate vs operate produce dos UX diferentes (lectura vs acción).

---

## Item 3 — `verificationDisplay` real

**Estado actual**: el campo existe en UI y tipo, pero `buildAction` se llama sin él en todas partes.

**Cambios**:
1. Nueva función `buildVerificationDisplay(payload, currentEntity)`:
   - `beforeState`: estado actual del entity (status, amount, etc.).
   - `afterState`: estado proyectado tras la acción.
   - `impacts`: lista textual de side effects ("Customer will receive cancellation email", "Inventory reserved will be released").
2. Reglas por `payload.kind`:
   - `case.update_status`: status actual → status nuevo, impactos: notificación al cliente, audit log.
   - `order.cancel`: status order, items, impactos: stock liberado, refund automático si aplica.
   - `payment.refund`: amount + status → refunded, impactos: cargo bancario revertido, notificación.
   - `approval.decide`: pending → approved/rejected, impactos: continuación del flow original.
   - `return.approve` / `return.reject`: similar.
3. Llamar a `buildVerificationDisplay()` desde `getCaseActions`, `getOrderActions`, `getPaymentActions`, `getApprovalActions`, `getReturnActions`.

**Resultado**: el modal de "Confirm Operation" ahora muestra qué pasará, no solo el label.

---

## Item 4 — `suggestedReplies` contextuales

**Estado actual**: siempre `[]`.

**Cambios**:
1. Nueva función `generateSuggestedReplies(input, mode, trace, structuredIntent)`:
   - **Por entityType detectado**:
     - order → "Show the customer", "List recent payments", "Cancel this order" (si operate)
     - payment → "Open the related order", "Refund this payment" (si operate)
     - case → "Show timeline", "Add a note", "Mark as resolved" (si operate)
     - approval → "Show requestor history", "Approve", "Reject" (si operate)
   - **Por mode**:
     - investigate: 3 sugerencias exploratorias
     - operate: 1 alternativa exploratoria + 2 confirmaciones de acción
   - **Por status detectado**: si pending_approval → "Open approval queue".
2. Llamar a `generateSuggestedReplies()` en `buildResponseFromPlanOutcome` (resultado en lugar de `[]`).

**Resultado**: tras cada respuesta hay 2–4 chips clickables que continúan la conversación de forma natural.

---

## Estrategia de implementación

1. **Cambios mínimos en LLMProvider**: añadir `composeNarrative()` opcional con fallback determinista. No bloquear si Gemini falla.
2. **Cambios chirúrgicos en `superAgent.ts`**: nueva función `buildVerificationDisplay()` + `generateSuggestedReplies()` + refactor de `buildResponseFromPlanOutcome`.
3. **No tocar la UI**: ya está lista, solo necesita que estos campos vengan poblados.
4. **Lint pass**: `npm run lint` después de cada item.

## Archivos a modificar

| Archivo | Cambios | LOC esperadas |
|---------|---------|---------------|
| `server/agents/planEngine/llm.ts` | + composeNarrative() | +60 |
| `server/routes/superAgent.ts` | + buildVerificationDisplay, + generateSuggestedReplies, refactor buildResponseFromPlanOutcome, llamadas en getXxxActions | +150 |

## Sin tocar

- UI (`SuperAgent.tsx`) — ya está lista
- Tipos en frontend — ya soportan estos campos
- Schema de DB
- Tests de policy/golden — no romper
