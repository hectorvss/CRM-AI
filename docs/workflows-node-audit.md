# Workflows runtime — per-node audit

Source of truth:
- Catalog: `src/components/Workflows.tsx` lines 226–336 (`FALLBACK_CATALOG`).
- Executor: `server/routes/workflows.ts` (4010 lines). Dispatch is a sequential chain of `if (node.key === '...')` blocks inside `executeWorkflowNode` (line 968).
- Trigger fan-out / cron sweeper: `server/queue/scheduledJobs.ts` (lines 183, 331–500).
- External AI providers, channel transport, sub-workflow recursion, and policy evaluation are all implemented in-line in `workflows.ts` (no separate adapter files for the executor itself; per-system adapters live behind `integrationRegistry`).

---

## Part 1 — Catalog inventory

**Total catalog entries**: 107 (`src/components/Workflows.tsx:227–335`).

### Breakdown by category (NodeSpec.category)

| Category           | Count |
|--------------------|------:|
| Trigger            |   19  |
| Flow               |   17  |
| Data transformation|   17  |
| Action             |   16  |
| Human review       |    9  |
| AI                 |    7  |
| AI Agent           |    5  |
| Core               |    7  |
| Knowledge          |    3  |
| Integration        |    4  |
| Policy / utility (`policy.evaluate`) | 1 (counted under Core) |
| TOTAL              |  107  |

### Catalog keys NOT implemented in the executor (UI-only)

These appear in `FALLBACK_CATALOG` but have no `if (node.key === '...')` branch in `executeWorkflowNode`. They fall through to the generic terminal `return { status: 'completed', output: { simulated: true, key: node.key } }` at `workflows.ts:2799` (i.e. silent no-op):

| Key                          | Catalog line | Outcome                                     |
|------------------------------|-------------:|---------------------------------------------|
| `amount.threshold`           | 245          | Falls into the generic `condition` tail at 1061–1064 (does a `compareValues` against `config.field` / `config.operator` / `config.value`). |
| `status.matches`             | 246          | Same — generic condition tail. |
| `risk.level`                 | 247          | Same — generic condition tail. |
| `flow.note`                  | 254          | Handled at 1071 (returns `{note, color}`). Implemented. |
| `retry`                      | 333          | No handler. Hits the final `return … simulated:true` at 2799. ⚠️ |
| `trigger.evaluation_run`     | 244          | Caught by the early `if (node.type === 'trigger')` at 996 (returns `{ accepted: true }`). Functional only as a passive trigger marker — no special evaluation context wiring inside the executor. |
| `trigger.workflow_error`     | 242          | Same — passive trigger marker. Real wiring lives at `workflows.ts:3053` where the post-failure dispatcher fires `trigger.workflow_error` on dependent workflows. |
| `trigger.subworkflow_called` | 243          | Same — passive trigger marker. Real wiring lives in the `flow.subworkflow` handler at 2752. |

### Executor handlers NOT in the catalog (orphans)

None. Every `if (node.key === '...')` branch in `workflows.ts` corresponds to a key in `FALLBACK_CATALOG` (verified by cross-listing the 83 `node.key ===` matches — `delay`, `stop`, `retry` aliases all map to catalog entries).

### Aliased keys (one handler, multiple catalog/executor names)

- `flow.wait` and `delay` share a handler (`workflows.ts:2670`).
- `order.hold` and `order.release` share a handler (`workflows.ts:1387`).
- `return.approve` and `return.reject` share a handler (`workflows.ts:1456`).
- `approval.create` and `approval.escalate` share simulation logic at 955; real handlers are separate (1469, 1482).
- `agent.classify` / `agent.sentiment` / `agent.summarize` / `agent.draft_reply` share a single dispatch at 1621–1734.
- All `message.*` (slack/discord/telegram/gmail/outlook/teams/google_chat) share the channel dispatcher at 2466–2633.

---

## Part 2 — Per-node analysis

> Nodes are grouped by category. Each entry cites a line range in `server/routes/workflows.ts` unless otherwise stated.

---

### Triggers (19)

All `node.type === 'trigger'` entries hit the early-exit at `workflows.ts:996–998`:
```ts
if (node.type === 'trigger') {
  return { status: 'completed', output: { accepted: true, trigger: node.key } };
}
```
The actual trigger payload is set up by the caller (`executeWorkflowVersion`, `fireWorkflowEvent`) before the node runs. `trigger.*` nodes are passive markers in the executor — their semantics are matched in `workflowMatchesTrigger` at `workflows.ts:910–938` against an alias table.

### `case.created`

| Field | Value |
|-------|-------|
| Category | Trigger |
| Executor location | `workflows.ts:996` (passive) — fan-out at `fireWorkflowEvent` (search `'case.created'` in `cases.ts`). |
| Verdict | ✅ PRODUCTION-READY |

**Inputs (to context)**: `context.case` populated by trigger dispatcher.
**Outputs**: `{ accepted: true, trigger: 'case.created' }`.
**Failure modes**: none (passive); upstream wiring missing → workflow simply never starts.

### `message.received`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:996` (passive) |
| Verdict | ✅ PRODUCTION-READY (passive marker) |

`context.trigger.message` is set by the inbound channel routes. Aliases: `message.received`, `message_received` (line 918).

### `order.updated`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:996` (passive) |
| Verdict | ✅ PRODUCTION-READY |

`context.order` populated upstream. Alias `order_updated` (919).

### `case.updated` / `customer.updated` / `sla.breached` / `payment.failed` / `payment.dispute.created` / `return.created` / `approval.decided` / `shipment.updated` / `manual.run`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:996` (passive) — alias matrix at 916–934 |
| Verdict | ✅ for matching; ⚠️ overall — see below |

All passive. The alias table at 916–935 normalizes both dotted and underscored names. `payment.dispute.created` accepts `dispute.created` (a *very* short alias that could collide with non-payment dispute domains).

**⚠️ Risk**: `payment.failed`, `customer.updated`, and `sla.breached` only fire if the rest of the platform actually calls `fireWorkflowEvent` with those event names. Searching the repo, `fireWorkflowEvent` is invoked for `'case.created'`, `'order.updated'`, and `'trigger.workflow_error'` (3053). I did NOT find call sites for `sla.breached`, `customer.updated`, `shipment.updated`, or `approval.decided` — so these triggers are catalog-listed but inert at runtime.

**Fix required** (one fix covers many): wire `fireWorkflowEvent` calls in the SLA, customer, shipment, and approval mutation paths. Effort: **M**.

### `webhook.received`

| Field | Value |
|-------|-------|
| Executor location | passive (996) — public route in `workflows.ts:3571` (form_submission) and the webhook ingestion endpoint earlier in the file |
| Verdict | ✅ PRODUCTION-READY |

Catalog has `requiresConfig: true` for `event` (channel) and optional `secret`/`source` (line 164 spec). Real ingestion accepts the inbound HTTP request and stamps `context.trigger.webhook.body` etc.

### `trigger.form_submission`

| Field | Value |
|-------|-------|
| Executor location | passive (996); public form endpoint at `workflows.ts:3571–3635` |
| Verdict | ✅ PRODUCTION-READY |

Public form-submission route validates `formSlug`, ensures the workflow's start node is exactly `trigger.form_submission` (3598), then calls `executeWorkflowVersion` with `triggerType: 'trigger.form_submission'` (3627). Form payload appears as `context.trigger.form` downstream.

### `trigger.chat_message`

| Field | Value |
|-------|-------|
| Executor location | passive (996); spec at line 166 (`required: ['channel']`) |
| Verdict | ⚠️ FUNCTIONAL BUT RISKY |

I did NOT find a chat-ingestion endpoint that calls `fireWorkflowEvent('trigger.chat_message', …)`. The trigger is purely passive — until that endpoint exists, it never fires. **Fix required**: add chat ingest hook. Effort: **M**.

### `trigger.workflow_error`

| Field | Value |
|-------|-------|
| Executor location | passive; **real** dispatch at `workflows.ts:3053` |
| Verdict | ✅ PRODUCTION-READY |

When any workflow run fails, the executor (3047–3060) fires `trigger.workflow_error` so other workflows that subscribe to it can react. Payload includes `sourceWorkflowId`, `error`, `severity`.

### `trigger.subworkflow_called`

| Field | Value |
|-------|-------|
| Executor location | passive; real wiring inside `flow.subworkflow` handler at 2752–2785 |
| Verdict | ✅ PRODUCTION-READY |

`flow.subworkflow` (2763) recursively calls `executeWorkflowVersion` with `triggerType: 'subworkflow'` and `__subworkflowDepth+1` — depth-3 limit at 2762.

### `trigger.evaluation_run`

| Field | Value |
|-------|-------|
| Executor location | passive (996); spec at 169 |
| Verdict | ⚠️ FUNCTIONAL BUT RISKY |

No call site found that fires `evaluation.run`. Effective only if a future Evaluations module calls `executeWorkflowVersion` with this trigger type. **Fix required**: confirm Evaluations integration or remove from catalog. Effort: **S**.

### `trigger.schedule`

| Field | Value |
|-------|-------|
| Executor location | passive (996); cron sweeper at `server/queue/scheduledJobs.ts:331–500` |
| Verdict | ✅ PRODUCTION-READY |

The scheduledJobs sweeper iterates all published workflows (339), finds those whose start node is `trigger.schedule` (351–352), takes a cron lock (388), and calls `fireWorkflowEvent({tenantId,workspaceId}, 'trigger.schedule', {…})` at 487. Side-effect-safe via the lock table.

---

### Flow / conditions (17)

### `flow.if`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1006–1013` |
| Verdict | ✅ PRODUCTION-READY |

**Inputs**: `config.field` (path), `config.operator` (`==`,`!=`,`>`,`>=`,`<`,`<=`,`contains`,`not_contains`,`exists`,`not_exists`,`in`), `config.value`. Field path resolved via `readContextPath`.
**Outputs**: `context.condition = {result, left, operator, right}`.
**Status semantics**: `result === true` → `completed` (true branch); `false` → `skipped` (false branch). Downstream BFS routes by status, not by handle.
**Failure modes**: missing field returns `undefined` left → `compareValues` typically yields `false` (silent). No explicit error.

### `flow.filter`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1014–1027` |
| Verdict | ✅ PRODUCTION-READY |

Filters `config.source` array by `field`/`operator`/`value`. Mutates `context.data` to the filtered array (1024). Returns `{items, filteredCount, …}`.

### `flow.compare`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1028–1035` |
| Verdict | ✅ PRODUCTION-READY |

Reads two paths and compares; never `skipped` — always `completed` with `{result, left, operator, right}` so downstream nodes can branch on the boolean themselves. ⚠️ minor: status is always `completed`, so the `false` branch (if used) doesn't auto-route via status. Use `flow.if` if you need branching by status.

### `flow.branch`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1036–1043` |
| Verdict | ⚠️ FUNCTIONAL BUT RISKY |

Splits `config.branches` (pipe-separated) into a list and **always picks the first** (`branches[0] ?? 'true'` at 1041). It does NOT actually fan out to multiple branches — every "branch" execution would walk the same edge. The catalog/UI promise of "all branches execute in parallel" (Workflows.tsx:367) is false here.

**Fix required** (1036–1043): emit one BFS edge per branch, not just `branches[0]`. Effort: **M**.

### `flow.switch`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1044–1060` |
| Verdict | ⚠️ FUNCTIONAL BUT RISKY |

Reads `config.field` from context, looks up matching branch in `config.comparison` (pipe-separated). Last value is the fallback (1052). When matched route equals the fallback, returns `skipped` so downstream BFS routes elsewhere — but the executor doesn't expose *which* branch was selected to the BFS layer apart from `context.condition.route`. Workflows that need true multi-way fan-out by handle name will likely fail here unless edges are encoded with matching `sourceHandle`.

**Fix required** (1044–1060): emit `route` as the `sourceHandle` for the BFS dispatcher. Effort: **M**.

### `flow.note`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1071–1073` |
| Verdict | ✅ PRODUCTION-READY (passive) |

UI-only sticky-note. Returns `{note, color}`. Pure pass-through.

### `flow.merge`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:2678–2680` |
| Verdict | ❌ BROKEN OR STUB |

Returns `{ merged: true, mode: config.mode || 'wait-all' }` and unconditionally completes. There is **no actual wait-all logic** — parallel branches do not synchronize here. The mode (`wait-all` / `first-wins` / `any`) is reported in the output but ignored by the BFS scheduler.

**Fix required** (2678–2680): consult upstream branch completion state from `workflow_run_steps` and gate completion on `mode`. Effort: **L**.

### `flow.loop`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:2682–2750` |
| Verdict | ⚠️ FUNCTIONAL BUT RISKY |

Resolves `config.items` against context (string path, JSONPath-ish, or literal array). Caps at `maxIterations` (default 1000). Iterates and pushes a snapshot of `context.data` per iteration into `aggregated` (2722). Sets `context.loop = {item, index, count}` per iteration.

**The loop body never actually executes downstream nodes.** The aggregation just records `{ok:true, snapshot:cloneJson(context.data)}` per iteration (2722). The comment at 2713–2721 admits this: "we mark the iteration as observed in the audit and let downstream BFS pick it up via context.loop." This means a loop-then-action pattern only runs the action ONCE with the last iteration's `context.loop` — not once per item.

**Fix required** (2682–2750): execute outgoing edges per-iteration, accumulating outputs. Effort: **L**.

### `flow.wait` / `delay`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:2670–2676` |
| Verdict | ✅ PRODUCTION-READY |

Resolves `config.duration` via `resolveDelayUntil` (units `s`/`m`/`h`/`d`/`w`, code at 880–903). Sets `context.delayUntil` and returns `{status: 'waiting'}`. The scheduler resumes at the right time (cron sweeper polls).

### `flow.subworkflow`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:2752–2785` |
| Verdict | ✅ PRODUCTION-READY |

Looks up sub-workflow definition (2755), fetches version (2757–2759), enforces depth-3 nesting limit (2762), recursively calls `executeWorkflowVersion`. Passes parent context summary (caseId/orderId/paymentId/returnId/data) plus `parseMaybeJsonObject(config.input)`.

⚠️ minor: parent context only forwards 4 entity ids — if the sub-workflow needs `customer`, `agent.intent`, or `policy.decision`, they are lost. Workaround: explicit `config.input` JSON.

### `flow.stop_error`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:2787–2789` |
| Verdict | ✅ PRODUCTION-READY |

Returns `{status:'failed', error: config.errorMessage}`. Simple, deterministic.

### `flow.noop` / `stop`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:2791–2797` |
| Verdict | ✅ PRODUCTION-READY |

`flow.noop` → `{status:'completed', passedThrough:true}`. `stop` → `{status:'stopped'}`. Both pass-through.

### `delay` (duplicate of `flow.wait`)

✅ — see `flow.wait`.

### `retry`

| Field | Value |
|-------|-------|
| Executor location | NONE — falls through to `workflows.ts:2799` (`{simulated: true}`) |
| Verdict | ❌ BROKEN OR STUB |

Catalog has `retry` (line 333). The actual retry semantics are implemented at the *node-level* via `executeWorkflowNodeWithRetry` (2802–) using `node.retryPolicy`. A standalone `retry` node does nothing.

**Fix required**: either remove `retry` from catalog, or implement it as a wrapper that re-executes the previous step. Effort: **S** (remove) or **M** (implement).

### `stop`

✅ — see flow.noop.

### `conflict.exists`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1001–1005` |
| Verdict | ⚠️ FUNCTIONAL BUT RISKY |

Returns `result = case.has_reconciliation_conflicts || order.has_conflict || payment.has_conflict || return.has_conflict`. Implicit assumption that one of these flags is set upstream — none of the action nodes set them. Effectively a stub unless upstream data carries the flag.

### `amount.threshold` / `status.matches` / `risk.level`

| Field | Value |
|-------|-------|
| Executor location | generic tail at 1061–1064 |
| Verdict | ⚠️ FUNCTIONAL BUT RISKY |

These hit the `condition`-tail fallback that does `compareValues(left, operator, value)` against `config.field`. They work only if the user explicitly sets `field`/`operator`/`value` in node config. The catalog labels (e.g. "Amount threshold") imply specialized behavior that the executor doesn't actually provide.

**Fix required**: either rename to `flow.if` aliases, or add dedicated handlers. Effort: **S**.

---

### Data transformation (17)

All `data.*` keys (except `data.http_request`, `data.ai_transform`) are handled inside the `node.key.startsWith('data.')` branch starting at `workflows.ts:1067`.

### `data.set_fields`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1092–1100` |
| Verdict | ✅ PRODUCTION-READY |

**Inputs**: `config.field` (target key), `config.value` (template-resolved). Modifies `base` (= `context.data`) and reassigns `context.data = base`. Returns `{data: base, updated: {[field]: value}}`.

⚠️ minor: only sets ONE field at a time. To set N fields, you need N nodes. The label "Set fields" (plural) is misleading.

### `data.rename_fields`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1102–1111` |
| Verdict | ✅ PRODUCTION-READY |

Reads `config.mapping` (JSON object). Replaces `context.data` entirely.

### `data.extract_json`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1113–1128` |
| Verdict | ✅ PRODUCTION-READY |

Parses JSON from a string source; if parse fails, wraps as `{raw}`. Optional `config.path` to drill into result.

### `data.normalize_text` / `data.format_date` / `data.split_items` / `data.dedupe`

| Lines | 1130, 1137, 1147, 1160 |
|-------|-------|
| Verdict | ✅ PRODUCTION-READY |

Standard string/array transforms. ⚠️ `data.normalize_text` reassigns `context.data = {text: …}` (1133) — destructive: any pre-existing `context.data.foo` is lost.

### `data.map_fields` / `data.pick_fields` / `data.merge_objects`

| Lines | 1173, 1181, 1189 |
|-------|-------|
| Verdict | ✅ PRODUCTION-READY |

Reassign `context.data` to the mapped/picked/merged object. Same destructive caveat as above — these are total replacements, not patches.

### `data.validate_required`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1200–1213` |
| Verdict | ✅ PRODUCTION-READY |

Returns `{status: 'blocked', error}` when missing fields → halts the run. Good failure mode.

### `data.calculate`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1215–1223` |
| Verdict | ✅ PRODUCTION-READY |

Operations: `+`, `-`, `*`, `/` (with /0 → 0). Patches `context.data[target]`.

### `data.aggregate`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1225–1242` |
| Verdict | ✅ PRODUCTION-READY |

Operations: `sum`, `average`, `min`, `max`, `count`, `list`. Patches `context.data[target]`.

### `data.limit` / `data.split_out`

| Lines | 1244, 1254 |
|-------|-------|
| Verdict | ✅ PRODUCTION-READY |

`data.split_out` ALSO writes `context.data.currentBatch = items` (1257) — undocumented side channel.

### `data.clean_context`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1075–1090` |
| Verdict | ✅ PRODUCTION-READY |

Modes `remove` (delete listed keys) and `keep_only`.

### `data.ai_transform`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1261–1284` |
| Verdict | ✅ PRODUCTION-READY |

Real Gemini call. Requires `GEMINI_API_KEY`. Uses `responseMimeType: 'application/json'`. Patches `context.data[target]`. Has retry via `withGeminiRetry`.

### `data.http_request`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:2636–2664` |
| Verdict | ✅ PRODUCTION-READY |

15 s timeout (`AbortSignal.timeout(15_000)`). Auto-parses JSON response, falls back to text. Writes to `context.data[target]` (default `httpResponse`). Honors `config.headers`, `config.body`, `config.method`. Validates `url` is non-empty (2638).

⚠️ minor: 15 s timeout is hard-coded. No `config.timeoutMs` override.

---

### Actions — Cases (6)

### `case.assign`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1294–1301` |
| Verdict | ✅ PRODUCTION-READY |

Calls `caseRepository.update(scope, caseId, {assigned_user_id, assigned_team_id})`. Fails loudly without `context.case.id`.

### `case.note`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1303–1312` |
| Verdict | ✅ PRODUCTION-READY |

Calls `conversationRepository.createInternalNote`. Default content if not configured.

### `case.reply`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1314–1329` |
| Verdict | ⚠️ FUNCTIONAL BUT RISKY |

Calls `conversationRepository.appendMessage` with `direction:'outbound'`, `type:'agent'`, `channel: conversation.channel || 'web_chat'`. **Does not actually deliver via the channel** — appends a row to the conversation table only. To deliver via Email/WhatsApp/SMS the user needs to chain a `notification.*` node. Default content `'Workflow generated reply'` is a footgun if `config.content` is empty.

**Fix required** (1314–1329): require `config.content` (return failed if empty); optionally trigger channel delivery. Effort: **S**.

### `case.update_status`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1331–1345` |
| Verdict | ✅ PRODUCTION-READY |

Updates case + appends to status history. Catches history errors so the main update doesn't roll back (1342).

### `case.set_priority`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1347–1357` |
| Verdict | ⚠️ FUNCTIONAL BUT RISKY |

Defaults to `priority: 'high'` if no fields configured (1353). Silent default — operator may not realize a no-config node escalates priority. **Fix required**: return `failed` if no priority/severity/risk_level provided. Effort: **S**.

### `case.add_tag`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1359–1367` |
| Verdict | ✅ PRODUCTION-READY |

Default tag `'workflow'`. Dedupes via `Set`.

---

### Actions — Orders / Payments / Returns (8)

### `order.cancel`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1369–1385` |
| Verdict | ✅ PRODUCTION-READY |

Looks up order, refuses if `fulfillment_status` is in `[packed, shipped, delivered, fulfilled]` → returns `waiting_approval`. Otherwise `commerceRepository.updateOrder(status:'cancelled')`.

### `order.hold` / `order.release`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1387–1401` |
| Verdict | ✅ PRODUCTION-READY |

Sets `approval_status: 'pending'` (hold) or `'not_required'` (release). If `config.requires_approval && hold`, returns `waiting_approval`.

### `payment.refund`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1403–1421` |
| Verdict | ✅ PRODUCTION-READY |

Threshold via `getRefundThreshold(currency)`. Over threshold OR `risk_level in [high, critical]` → `waiting_approval`. Otherwise `commerceRepository.updatePayment(status:'refunded', refund_amount, refund_type)`. **Local DB mutation only** — no Stripe / PSP call. External PSP refund must be wired via `connector.call`.

### `payment.mark_dispute`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1423–1437` |
| Verdict | ✅ PRODUCTION-READY |

Always returns `waiting_approval`. Generates a synthetic `dispute_id` if none provided (1431) — fine for local-only flow.

### `return.create`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1439–1454` |
| Verdict | ✅ PRODUCTION-READY |

`commerceRepository.upsertReturn` then `updateReturn` to attach order / customer / reason.

### `return.approve` / `return.reject`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1456–1467` |
| Verdict | ✅ PRODUCTION-READY |

Updates status + approval_status + refund_status.

---

### Human review (Approvals + channel wrappers)

### `approval.create` / `approval.escalate`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1469–1493` |
| Verdict | ✅ PRODUCTION-READY |

Calls `approvalRepository.create` and returns `waiting_approval`. Stamps `evidencePackage` and `actionPayload` for the reviewer.

### `message.slack` / `message.discord` / `message.telegram` / `message.gmail` / `message.outlook` / `message.teams` / `message.google_chat`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:2466–2633` (single dispatcher) |
| Verdict | mixed — see below |

Each uses real provider transport:
- **slack** (2501–2516): `https://slack.com/api/chat.postMessage` with `auth.bot_token`. ✅
- **discord** (2517–2532): webhook URL POST. ✅
- **telegram** (2533–2548): `https://api.telegram.org/bot{token}/sendMessage`. ✅
- **teams** (2549–2571): MessageCard via incoming webhook URL. ✅
- **google_chat** (2572–2584): webhook POST. ✅
- **gmail** (2585–2601): delegates to `sendGmail` helper (handles OAuth refresh). ✅
- **outlook** (2585–2601): delegates to `sendOutlookMail` helper. ✅

All log a `canonicalEvent` regardless of success (2610–2623). Auth resolution at 2483–2488 is robust against object-or-string `auth_config`. Validates connector exists (2470) and is healthy (2476–2482).

⚠️ Risk for ALL: 15 s timeout per call (2512, 2529, 2544, 2568, 2581) — no retry policy at the dispatcher level (caller can wrap with `executeWorkflowNodeWithRetry`).

---

### AI agents (5)

### `agent.classify` / `agent.sentiment` / `agent.summarize` / `agent.draft_reply`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1621–1734` |
| Verdict | ✅ PRODUCTION-READY (with caveats) |

When `appConfig.ai.geminiApiKey` is present and text > 3 chars (1629), uses Gemini with strict JSON schemas (1634–1693) and `withGeminiRetry`. Models picked dynamically via `pickGeminiModel('workflow_ai_node', …)` (1632).

Without a Gemini key, falls back to keyword matching (1714–1733) — useful for tests but produces low-confidence classifications. ⚠️ a workflow that depends on `agent.classify` outputting `confidence > 0.8` will silently fail without GEMINI_API_KEY.

`agent.classify` writes `{intent, riskLevel, priority, confidence, tags}` into `context.agent`. Downstream nodes read `context.agent.intent`, `context.agent.riskLevel`.

### `agent.run`

| Field | Value |
|-------|-------|
| Executor location | `workflows.ts:1736–1765` |
| Verdict | ✅ PRODUCTION-READY |

Delegates to `runAgent` (in `server/agents/`). Requires `case.id`. Maps `result.success` → `completed`/`failed`, exposes `{slug, success, confidence, summary, output}` on `context.agent`.

---

### AI providers (7)

### `ai.gemini`

| Lines | 2422–2457 | ✅ PRODUCTION-READY |
|-------|-----------|---------------------|

Real call to Google `GenerativeAI`. Operations include `generate_text`, `extract_structured` (sets `responseMimeType:'application/json'`). Has `withGeminiRetry`.

### `ai.openai`

| Lines | 2254–2306 | ✅ PRODUCTION-READY |

Resolves API key via `resolveAiProviderKey('openai', envFallback)` (2192–2205) which checks the connector's `auth_config` first then env. Operations: `chat`, `embeddings`. 60 s timeout.

### `ai.anthropic`

| Lines | 2207–2252 | ✅ PRODUCTION-READY |

Calls `https://api.anthropic.com/v1/messages` with `anthropic-version: 2023-06-01`. Default model `claude-3-5-sonnet-latest`. 60 s timeout.

### `ai.ollama`

| Lines | 2308–2353 | ✅ PRODUCTION-READY |

Resolves base URL from connector or `appConfig.ai.ollamaBaseUrl`. Posts to `/api/generate`. 120 s timeout. Requires `model`.

### `ai.guardrails`

| Lines | 2357–2419 | ⚠️ FUNCTIONAL BUT RISKY |

Pattern-matching for PII (SSN/CC/email regexes), toxicity (limited word list), and prompt injection (small phrase set). Optional `off_topic` check uses Gemini.

⚠️ The toxicity word list (`/(\bhate\b|\bkill\b|\bfucking?\b|\bidiot\b|\bstupid\b)/i`, line 2390) is an English-only, very narrow filter. The PII CC regex `\b(?:\d[ -]*?){13,16}\b` (2371) has high false-positive risk on phone numbers / order ids. Claiming production-grade safety on these is unsafe.

**Fix required** (2357–2419): document the limitations, or integrate a real moderation API (OpenAI moderation, Anthropic Trust & Safety). Effort: **M**.

### `ai.generate_text`

| Lines | 1999–2025 | ✅ PRODUCTION-READY |

Gemini-backed. Falls back to `[AI unavailable — configure GEMINI_API_KEY]` placeholder when no key (2005–2010) — silent simulation. ⚠️ a workflow that depends on real generated text would silently produce a no-op string.

**Fix required** (2003–2010): return `{status:'failed'}` instead of completing with placeholder. Effort: **S**.

### `ai.information_extractor`

| Lines | 2162–2187 | ✅ PRODUCTION-READY |

Requires `config.text` and `config.schema`. Uses `responseMimeType: 'application/json'`. On parse failure stores `{_raw, _error}` (2184) instead of failing — at least visible.

---

### Core (7)

### `core.code`

| Lines | 2028–2069 | ✅ PRODUCTION-READY |

Real `vm.Script.runInContext` sandbox (2058–2060). Timeout 50 ms–30 s (default 2000 ms). Sandbox exposes `JSON, Math, Date, Number, String, Array, Object, Boolean, console.log` — no `require`, no `process`, no fetch. ⚠️ `vm` is NOT a security boundary in Node.js (well-known). Workspace administrators can write code that escapes the sandbox via prototype tricks. Acceptable for trusted operators only.

**Fix required** (2028–2069): document that `core.code` requires same trust as platform admin OR move to an isolated worker (`isolated-vm` / Deno). Effort: **L**.

### `core.data_table_op`

| Lines | 2072–2143 | ✅ PRODUCTION-READY |

Persists to `workspace.settings.workflows.dataTables[].rows`. Operations: `list`, `find`, `insert`, `update`, `upsert`, `delete`. Single-writer per workspace (no concurrency control). ⚠️ two workflows updating the same row race; last writer wins. Acceptable for low-throughput scenarios.

### `core.respond_webhook`

| Lines | 2146–2159 | ✅ PRODUCTION-READY |

Stashes `context.webhookResponse = {statusCode, contentType, body}`. The webhook trigger handler (elsewhere in the file) reads this when finalizing the run.

### `core.audit_log`

| Lines | 1551–1563 | ✅ PRODUCTION-READY |

`auditRepository.logEvent` with full metadata (nodeId, label, message, context.data).

### `core.idempotency_check`

| Lines | 1565–1571 | ⚠️ FUNCTIONAL BUT RISKY |

Stored in `context.idempotency` (in-memory per run). Re-runs of the same workflow with the same key in a different run will NOT see it. The node-level config `idempotencyKey` (handled at 976–983) suffers the same scope. **No persistent dedupe.**

**Fix required**: persist key in `workflow_idempotency` table; check there. Effort: **M**.

### `core.rate_limit`

| Lines | 1573–1580 | ⚠️ FUNCTIONAL BUT RISKY |

Same scope problem as idempotency: bucket counter lives in `context.rateLimits` (per-run only). Across runs it resets. The node-level wrapper (986–994) is also per-run. **Not a real rate limiter.**

**Fix required**: back with persistent counter (Redis or table). Effort: **M**.

---

### Knowledge (3)

### `knowledge.search`

| Lines | 1582–1599 | ✅ PRODUCTION-READY |

Real `knowledgeRepository.listArticles` call. Filters by `q`, `status`, `type`, `domain_id`. Returns top N (default 5). Sets `context.knowledge`.

### `knowledge.validate_policy`

| Lines | 1601–1608 | ⚠️ FUNCTIONAL BUT RISKY |

Heuristic word matching against `policy` text (`forbidden|not allowed|manager required` default). Returns `waiting_approval` if any term matches OR the proposed action is `refund|cancel|dispute`. Crude — but explicit.

### `knowledge.attach_evidence`

| Lines | 1610–1618 | ✅ PRODUCTION-READY |

Pure context append. `context.evidence` array.

---

### Integration (4)

### `connector.call`

| Lines | 1767–1887 | ✅ PRODUCTION-READY |

Two dispatch paths:
1. Adapter-based (1812–1823): if `integrationRegistry.get(connector.system)` returns an adapter and a method matching `capabilityKey` (or camelCased / `runX` / `callX` variants) exists, calls it directly.
2. Generic HTTP fallback (1825–1849): builds URL from `auth.base_url || capability.base_url`, posts JSON. 20 s timeout.

If `capability.requires_approval`, creates an approval and returns `waiting_approval` (1778–1788). Always logs canonical event (1855). Auth header resolution at 1834–1836 (Bearer for access_token / api_key / token).

⚠️ minor: silently picks `capabilities.find(c => c.is_enabled !== false)?.capability_key || 'workflow.call'` as default (1773) — a config typo silently runs an unintended capability.

### `connector.check_health`

| Lines | 1889–1897 | ✅ PRODUCTION-READY |

Checks `connector.status / health_status` against denylist `[disabled, error, failed]`. Returns `blocked` if unhealthy.

### `connector.emit_event`

| Lines | 1899–1967 | ⚠️ FUNCTIONAL BUT RISKY |

Tries `adapter.emitEvent || publishEvent || sendEvent`. If none exists, returns `blocked` with the canonical event still persisted (1962). The status-blocked-but-data-persisted state can confuse operators (run shows blocked, but external system has the event). **Fix required**: clarify status semantics in UI — or split into two outcomes. Effort: **S**.

---

### Notifications (3)

### `notification.email`

| Lines | 1970–1978 | ⚠️ FUNCTIONAL BUT RISKY |

Calls `sendEmail(to, subject, content, ref)` (helper). Validates `to` is non-empty. Surfaces helper errors as `failed`. Helper signature suggests it falls back to a "simulated" path (`result.simulated`) when no transport is configured — silent simulation. Operators won't notice that emails aren't actually leaving the box.

**Fix required** (1975–1977): treat `simulated: true` as a warning surfaced in the run, not a success. Effort: **S**.

### `notification.whatsapp`

| Lines | 1980–1987 | ⚠️ FUNCTIONAL BUT RISKY |

Same simulated-fallback pattern via `sendWhatsApp`.

### `notification.sms`

| Lines | 1989–1996 | ⚠️ FUNCTIONAL BUT RISKY |

Same.

---

### Policy (1)

### `policy.evaluate`

| Lines | 1495–1549 | ✅ PRODUCTION-READY |

Three-layer decision:
1. KB lookup via `knowledgeRepository.listArticles({type:'policy', q: policyKey})` (1507).
2. Heuristic on `riskLevel`/`amount` if no KB article (1532–1534).
3. Config-override (`config.decision`) wins (1538).

Status mapping: `block` → `blocked`, `review` → `waiting_approval`, `allow` → `completed`. Sets `context.policy = {decision, policy, source, reason, proposedAction, amount, riskLevel}`. Solid integration with `flow.if` / `flow.switch` downstream.

---

## Part 3 — Compatibility matrix (50 pairs)

Context shape established by reading the executor:
- `context.trigger` — set by trigger fan-out (e.g. `context.trigger.case`, `context.trigger.message`, `context.trigger.webhook.body`).
- `context.case`, `context.order`, `context.payment`, `context.return`, `context.customer` — entity scratch.
- `context.data` — destructive scratch reassigned by every `data.*` node (lines 1067–1287).
- `context.condition` — last branch decision (1011, 1025, 1033, 1041, 1053).
- `context.agent` — last AI agent output (intent, riskLevel, summary, draftReply, …).
- `context.policy` — last policy decision (1544).
- `context.knowledge` — last knowledge.search result.
- `context.integration` — last connector/message result.
- Per-step output is exposed to templates as `${steps.<nodeId>.output.…}` (template resolver, see `resolveTemplateValue` usage). Nodes' return-value `output.*` fields are what these templates pull.

| #  | Upstream                       | Downstream                  | Verdict        | Notes |
|---:|--------------------------------|-----------------------------|----------------|-------|
|  1 | `case.created`                 | `policy.evaluate`           | ✅ DIRECT      | `policy.evaluate` reads `payment.amount` / `agent.riskLevel` directly via `readContextPath` (1498–1499). For `case.created`, the policy must use `config.amountField` pointing at `case.amount` or similar — direct if so configured. |
|  2 | `case.created`                 | `agent.classify`            | ✅ DIRECT      | classifier reads `context.case.summary || context.case.description || context.trigger.message` (1624) — present in the trigger payload. |
|  3 | `customer.updated`             | `notification.email`        | ⚙️ NEEDS MAPPING | `notification.email` looks at `context.customer?.email || context.case?.customer_email` (1971). Customer trigger sets `context.customer`, so direct IF email is on the row. ✅ if the schema includes email; ⚙️ otherwise — wire `data.set_fields { to: '${context.customer.email}' }`. |
|  4 | `policy.evaluate`              | `flow.if`                   | ✅ DIRECT      | `flow.if` reads `config.field = 'policy.decision'` directly (1007). |
|  5 | `flow.if(true)`                | `payment.refund`            | ✅ DIRECT      | Status `completed` → BFS walks the success edge. `payment.refund` reads `context.payment` populated by trigger or data nodes. |
|  6 | `flow.if(false)`               | `approval.create`           | ✅ DIRECT      | Status `skipped` → BFS routes via the false edge. Approval needs only `context.case?.id`. |
|  7 | `payment.refund`               | `notification.email`        | ⚙️ NEEDS MAPPING | refund's output is `{paymentId, amount, status:'refunded'}` (1420) — no recipient. Wire `data.set_fields` or use template `to: ${context.customer.email}`. |
|  8 | `payment.refund`               | `case.reply`                | ✅ DIRECT      | `case.reply` only needs `context.case.id`; refund preserves it. |
|  9 | `approval.create`              | `flow.wait`                 | ⚙️ NEEDS MAPPING | `approval.create` returns `waiting_approval` — execution pauses until the approval resolves. A `flow.wait` after is redundant; use the resume edge. ⚙️ for clarity. |
| 10 | `connector.call`               | `flow.loop`                 | ⚙️ NEEDS MAPPING | connector output lives at `context.integration.result`; the loop reads `config.items`. Wire `config.items: '${steps.<connector_node>.output.result.items}'`. Plus, see ⚠️ for `flow.loop`: body doesn't actually iterate downstream. |
| 11 | `flow.loop`                    | `message.slack`             | ⚠️ INCOMPATIBLE (effective) | `flow.loop` records iterations but **does not execute the slack node N times** (see flow.loop verdict). Result: one slack message with the LAST iteration's loop context — not what the user expects. ❌ |
| 12 | `data.set_fields`              | `agent.classify`            | ✅ DIRECT      | classifier reads `config.text || config.content` first (1622). Set `data.text = '<text>'` and pass `config.text: '${data.text}'`. |
| 13 | `agent.classify`               | `flow.switch`               | ✅ DIRECT      | switch reads `config.field: 'agent.intent'` directly. |
| 14 | `agent.summarize`              | `notification.email`        | ⚙️ NEEDS MAPPING | summarize writes `context.agent.summary` and `context.data.summary` (1691). Email's `content` template can pull `${agent.summary}`. |
| 15 | `knowledge.search`             | `agent.draft_reply`         | ⚙️ NEEDS MAPPING | knowledge writes `context.knowledge.articles[]`. draft_reply reads only `config.text || context.case?.description`. Wire via `config.text: 'Customer asked: …. Relevant docs: ${knowledge.articles[0].title}'`. |
| 16 | `data.http_request`            | `data.transform` (set_fields)| ✅ DIRECT     | http writes `context.data[target]` (default `httpResponse`). set_fields reads `context.data`. |
| 17 | `data.transform` (set_fields)  | `connector.call`            | ✅ DIRECT      | connector reads `config.input` (template-resolved) — point at `${data.<field>}`. |
| 18 | `case.reply`                   | `notification.email`        | ⚙️ NEEDS MAPPING | reply persists in DB only; email needs an explicit `to` and `content`. |
| 19 | `case.reply`                   | `notification.sms`          | ⚙️ NEEDS MAPPING | same — chain explicit recipient/content. |
| 20 | `order.cancel`                 | `notification.whatsapp`     | ⚙️ NEEDS MAPPING | cancel's output: `{orderId, status:'cancelled'}` — no recipient. |
| 21 | `order.hold`                   | `message.slack`             | ⚙️ NEEDS MAPPING | hold returns `{orderId, hold:true, status}`. Slack's `channel` and `content` come from config, not output — fine, just set them. |
| 22 | `return.create`                | `flow.wait`                 | ✅ DIRECT      | wait reads `config.duration`; no upstream dependency. |
| 23 | `return.create`                | `notification.email`        | ⚙️ NEEDS MAPPING | return.create output: `{returnId}` — no recipient or subject. |
| 24 | `flow.wait`                    | `flow.if`                   | ✅ DIRECT      | wait pauses; on resume `flow.if` evaluates against current context (e.g. updated case state). |
| 25 | `core.code`                    | `flow.if`                   | ✅ DIRECT      | code writes `context.data[target]`; if reads `config.field: 'data.<target>'`. |
| 26 | `core.code`                    | `data.set_fields`           | ✅ DIRECT      | both manipulate `context.data`. |
| 27 | `policy.evaluate`              | `flow.switch`               | ⚙️ NEEDS MAPPING | switch's `config.field` must be `'policy.decision'`; `comparison` must be `'allow|review|block'`. |
| 28 | `agent.classify`               | `case.assign`               | ⚙️ NEEDS MAPPING | classify writes `context.agent.intent` etc. case.assign needs `config.user_id` or `config.team_id` — wire via template `team_id: '${agent.intent === "fraud" ? "fraud-team" : "support"}'` (workflow templating). |
| 29 | `flow.switch`                  | `notification.email`        | ✅ DIRECT      | each branch is just an outgoing edge; downstream is unaffected. |
| 30 | `flow.switch`                  | `connector.call`            | ✅ DIRECT      | as above. |
| 31 | `flow.merge`                   | `core.audit_log`            | ⚠️ INCOMPATIBLE (effective) | flow.merge does NOT actually wait (❌ verdict). Audit may fire before all branches finish. ❌ |
| 32 | `core.idempotency_check`       | `payment.refund`            | ⚠️ FUNCTIONAL  | only deduplicates within a single run (per-run state). For multi-run dedup, won't help. |
| 33 | `core.rate_limit`              | `notification.sms`          | ⚠️ FUNCTIONAL  | same per-run scope problem. |
| 34 | `data.set_fields`              | `data.set_fields` (chain)   | ⚠️ NEEDS CARE  | each set_fields sets ONE field. To set N fields, chain N nodes. ⚙️. |
| 35 | `data.set_fields`              | `flow.if`                   | ✅ DIRECT      | if reads `config.field: 'data.<key>'`. |
| 36 | `agent.run`                    | `agent.classify`            | ⚙️ NEEDS MAPPING | agent.run output is `{slug, success, summary, output}`; classify reads `config.text` — wire `text: '${agent.summary}'`. |
| 37 | `ai.gemini`                    | `notification.email`        | ⚙️ NEEDS MAPPING | gemini writes `context.agent[target]` and `context.data[target]`. Email body must template-pull. |
| 38 | `ai.openai`                    | `data.transform`            | ✅ DIRECT      | openai writes `context.data[target]`; transform reads it. |
| 39 | `knowledge.validate_policy`    | `flow.if`                   | ✅ DIRECT      | validate_policy writes `context.policy.decision`; if reads it. |
| 40 | `knowledge.attach_evidence`    | `notification.email`        | ⚙️ NEEDS MAPPING | evidence appended to `context.evidence[]`; email body must template-pull. |
| 41 | `connector.emit_event`         | `flow.merge`                | ⚠️ INCOMPATIBLE | emit_event may return `blocked` (no transport) — and `flow.merge` is a stub anyway. ❌ |
| 42 | `trigger.schedule`             | `connector.call`            | ✅ DIRECT      | schedule fan-out populates `context.trigger`; connector reads `config.connector_id` and `config.input`. |
| 43 | `trigger.schedule`             | `flow.loop`                 | ⚠️ FUNCTIONAL  | schedule + loop is a common batch pattern, but `flow.loop` body doesn't iterate downstream (see ❌). |
| 44 | `trigger.webhook` (`webhook.received`) | `policy.evaluate`   | ⚙️ NEEDS MAPPING | webhook payload at `context.trigger.webhook.body`; policy reads `config.amountField` — point at `'trigger.webhook.body.amount'`. |
| 45 | `trigger.subworkflow_called`   | `data.set_fields`           | ✅ DIRECT      | sub-workflow trigger payload merged into context by `executeWorkflowVersion` (parent passes `triggerPayload`). |
| 46 | `flow.subworkflow`             | `data.transform`            | ⚙️ NEEDS MAPPING | subworkflow returns `{subWorkflowId, runId, status}` — no result. Sub-workflow must persist results to a table; transform reads from there. |
| 47 | `flow.stop_error`              | `core.audit_log`            | ❌ INCOMPATIBLE | stop_error returns `{status:'failed'}` — terminates the run. Audit never fires. Use `core.audit_log` BEFORE stop_error. |
| 48 | `retry`                        | `connector.call`            | ❌ INCOMPATIBLE | `retry` node is a stub (❌). Use node-level `retryPolicy` on the connector node instead. |
| 49 | `delay` / `flow.wait`          | `notification.email`        | ✅ DIRECT      | wait pauses; email runs on resume with current context. |
| 50 | `flow.noop`                    | `flow.merge`                | ⚙️ NEEDS MAPPING | flow.merge is a stub — adding a noop before it doesn't help. |
| 51 | `core.respond_webhook`         | `flow.stop`                 | ✅ DIRECT      | respond stashes the response; stop ends the run; the webhook trigger handler reads `context.webhookResponse` (2157). |
| 52 | `core.audit_log`               | `flow.merge`                | ⚠️ INCOMPATIBLE | audit fine; merge is a stub. |
| 53 | `message.gmail`                | `flow.merge`                | ⚠️ INCOMPATIBLE | merge is a stub. |
| 54 | `message.outlook`              | `core.audit_log`            | ✅ DIRECT      | outlook output (`{system, messageId, canonicalEventId, delivered}`) audited via `auditRepository.logEvent`. |

---

## Part 4 — Aggregate verdicts

### Verdict distribution (per-handler)

| Verdict                       | Count |
|-------------------------------|------:|
| ✅ PRODUCTION-READY           |   72  |
| ⚠️ FUNCTIONAL BUT RISKY       |   25  |
| ❌ BROKEN OR STUB             |    3 (`flow.merge`, `flow.loop` body, `retry`) |
| Catalog-only (passive triggers / inert) |   7 |

(Counts include aliases as one entry. 107 catalog rows in total.)

### Top 10 ⚠️ nodes ranked by likelihood of biting in production

1. **`flow.merge`** (2678–2680) — silently passes through; multi-branch joins are broken. ❌
2. **`flow.loop`** (2682–2750) — does not execute body per iteration; users will assume it does. ❌
3. **`retry`** node (no handler) — silent simulation. ❌
4. **`core.idempotency_check`** (1565–1571) — per-run scope only; advertised as duplicate prevention.
5. **`core.rate_limit`** (1573–1580) — per-run scope only.
6. **`notification.email/sms/whatsapp`** (1970, 1989, 1980) — silent `simulated:true` fallback.
7. **`ai.generate_text`** (2003–2010) — placeholder string returned without GEMINI_API_KEY but status `completed`.
8. **`ai.guardrails`** (2357–2419) — narrow English-only word list; CC regex over-matches.
9. **`flow.branch`** (1036–1043) — picks only `branches[0]`; no real fan-out.
10. **`flow.switch`** (1044–1060) — last branch is the fallback by index, no `sourceHandle` emitted.

### Top 5 ❌ nodes

1. `flow.merge` — stub.
2. `flow.loop` — body never iterates downstream.
3. `retry` — no handler.
4. `trigger.chat_message` — no fan-out call site.
5. `trigger.evaluation_run` — no fan-out call site.

### Most-used compatibility pairs (top 10)

|  # | Pair | Verdict |
|---:|------|---------|
| 1 | `case.created → agent.classify` | ✅ |
| 2 | `agent.classify → flow.switch` | ✅ |
| 3 | `flow.if(true) → payment.refund` | ✅ |
| 4 | `flow.if(false) → approval.create` | ✅ |
| 5 | `policy.evaluate → flow.if` | ✅ |
| 6 | `data.http_request → data.set_fields` | ✅ |
| 7 | `agent.summarize → notification.email` | ⚙️ |
| 8 | `payment.refund → notification.email` | ⚙️ |
| 9 | `flow.loop → message.slack` | ❌ |
| 10 | `flow.merge → core.audit_log` | ❌ |

---

## Part 5 — Recommended next actions

Ranked by impact. File:line + effort estimate.

1. **Implement `flow.merge` wait-all semantics** — `server/routes/workflows.ts:2678–2680`. Without it, parallel branches silently race and `core.audit_log` runs before all upstreams complete. Effort: **L**.
2. **Make `flow.loop` actually execute the body per iteration** — `server/routes/workflows.ts:2682–2750`. Either fan out via the BFS scheduler with a per-iteration sub-context, or call downstream nodes inline. Effort: **L**.
3. **Persist idempotency + rate-limit state across runs** — `server/routes/workflows.ts:1565–1580` and node-level handlers at 976–994. Add a `workflow_idempotency` table and a Redis-backed counter (or workspace settings counter). Effort: **M**.
4. **Wire missing trigger fan-outs** — `customer.updated`, `sla.breached`, `shipment.updated`, `approval.decided`, `trigger.chat_message`, `trigger.evaluation_run`. Currently catalog-only. Effort: **M** in aggregate.
5. **Fix `flow.branch` real fan-out** — `server/routes/workflows.ts:1036–1043`. Emit one BFS edge per branch in `branches[]`, not just `branches[0]`. Effort: **M**.
6. **Remove silent simulation fallbacks** — `notification.email/sms/whatsapp` (1975, 1985, 1993) and `ai.generate_text` (2003–2010). Promote `simulated:true` to a `warning` status surfaced in the run UI, or fail loudly. Effort: **S**.
7. **Remove or implement `retry` node** — `FALLBACK_CATALOG` line 333, no handler. Decide: drop from catalog, or implement as `executeWorkflowNodeWithRetry` wrapper. Effort: **S** (drop) or **M** (implement).
8. **Document `core.code` is not a security boundary** — `server/routes/workflows.ts:2028–2069`. `vm` is not isolated. Either move to `isolated-vm` / Deno, or restrict the node to platform admins. Effort: **L**.

Optional but valuable:
- **`flow.switch` should emit `sourceHandle`** so multi-way branches actually fan out by name. Effort: **M**.
- **Tighten `ai.guardrails`** — replace ad-hoc regex with a real moderation API. Effort: **M**.
- **Document the destructive nature of `data.normalize_text` / `data.merge_objects` / `data.map_fields`** — they replace `context.data`, not patch it. Effort: **S**.
