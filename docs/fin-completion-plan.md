# Fin AI Agent — plan de cierre de huecos (funcionamiento completo)

> Sale de la auditoría del 2026-07-16. Objetivo: que TODO lo que se configura en las
> pantallas de Fin AI Agent tenga efecto real en el motor, y quitar/arreglar lo que no.
> Se ejecuta por fases, iterando: cada paso termina con verificación + commit.

## Estado de partida (auditoría)

**Ya funciona end-to-end:** Orientación/Pautas (`fin.guidance` → prompt), Procedimientos
(`fin_procedures` → matcher/ejecutor), Desplegar Chat/Email (toggle → `fin.channels`),
Probar (`/fin/preview`). Identidad/idiomas ya los lee el motor (falta UI).

**Huecos:**
- **P0 (crítico):** el contenido de Capacitar→Contenido va a `knowledge_articles`, pero el
  retrieval solo lee `knowledge_embeddings`, que nadie rellena → Fin está ciego a la base
  de conocimiento. Además desajuste de proveedor de embeddings (motor OpenAI vs writer Gemini).
- **P1:** `config.attributes`, `config.escalation`, `config.audiences` los ignora el motor
  (config muerto). Atributos y Reglas de escalamiento guardan solo en localStorage.
- **P2:** Ajustes de Fin es un stub inerte (el motor SÍ usaría identidad/tono/idiomas/límites).
- **P3:** Probar no persiste (suite/ratings en estado). Botones/CTAs muertos por todas las
  pantallas. Escalamiento tiene un modal de "regla" que es código muerto.

---

## FASE P0 — Conocimiento → embeddings (el desbloqueo)  ★ EMPEZAMOS AQUÍ

Sin esto Fin no puede responder con el conocimiento del cliente. Es lo que convierte a Fin
de "ciego" a útil.

1. **Módulo de ingesta** `server/agents/finAgent/ingest.ts`:
   - `chunkText(text)` → trozos ~800 tokens con solape.
   - `indexArticle(scope, article)` → borra embeddings previos de ese `source_id`, chunkea
     `content`, embebe cada chunk con el **mismo** embedder que el retrieval (`embedQuery`,
     OpenAI `text-embedding-3-small`, 1536d) y hace upsert en `knowledge_embeddings`
     (source_type='knowledge_article', metadata: title/language/fin_audience).
   - `removeArticleEmbeddings(scope, articleId)`.
2. **Hooks** en `server/data/knowledge.ts` (create/update/publish/delete): tras escribir el
   artículo, si `fin_service===true` → reindexa; si deja de serlo o se borra → limpia.
   Fire-and-forget (import dinámico), nunca rompe el CRUD.
3. **Backfill**: `POST /api/fin/reindex` reindexa todos los artículos `fin_service` del
   workspace. Devuelve nº de artículos y chunks.
4. **UI**: botón "Reindexar para Fin" + estado (nº de chunks indexados) en Contenido.
5. **Verificación**: crear artículo vía API con `fin_service` → aparece en
   `knowledge_embeddings` → `/fin/preview` con una pregunta de ese artículo devuelve
   respuesta fundamentada citándolo. Test en `tests/fin-agent/`.

**Aceptación:** contenido añadido en la UI se vuelve recuperable por Fin automáticamente.

---

## FASE P1 — Conectar el config muerto al motor

1. **Atributos** (`config.attributes`): nueva etapa E1.5 en el pipeline que, según los
   atributos configurados, clasifica la conversación (sentiment/urgency/…) y lo escribe en
   `ai_triage.attributes`. Persistir la pantalla Atributos server-backed (`fin.attributes`).
2. **Reglas de escalamiento** (`config.escalation`): evaluar las reglas deterministas en el
   pipeline (antes/después de generar); si una matchea → escalar con esa razón + equipo.
   Persistir reglas server-backed y matar el modal de "regla" muerto.
3. **Audiencias** (`config.audiences`): filtrar retrieval por audiencia del cliente
   (usar `fin_audience` de los chunks) y decidir si Fin atiende a ese usuario. Wire de la
   pantalla Audiencias (crear/editar) → `fin.audiences`.

**Aceptación:** cada pantalla de config o tiene efecto real, o se retira de la UI.

---

## FASE P2 — Ajustes de Fin editable

Cablear `FinSettingsContent` a `/fin/config`: identidad (nombre/tono/longitud/formalidad/
idiomas), alertas y límites (`fin.limits`/`fin.caps`), botones de respuesta, multilingüe.
El motor ya lee identidad e idiomas; añadir enforcement de `caps` (concurrencia/diario).

**Aceptación:** cambiar el nombre/tono de Fin en Ajustes cambia sus respuestas.

---

## FASE P3 — Persistencia de Probar + limpieza

1. Persistir la suite de Probar (preguntas + ratings + notas) en `fin.test_suite` o tabla
   propia; recuperar al recargar.
2. Barrido de botones/CTAs muertos en todas las pantallas Fin: o se cablean o se quitan.
3. Unificar persistencia de Capacitar (todo server-backed, sin localStorage huérfano).

**Aceptación:** ninguna pantalla promete algo que no hace.

---

## Método de trabajo

Cada fase: implementar → `tsc` + test → verificación en navegador → commit + push → siguiente.
Se itera; si algo se descubre por el camino, se añade a la fase correspondiente.
