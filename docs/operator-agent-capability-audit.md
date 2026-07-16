# Operator Super Agent — Capability Audit vs PostHog Max (2026-07-16)

Evidence-backed comparison of our operator chat agent (`server/agents/chatAgent` + `planEngine`)
against PostHog **Max** (local `Txlemetry/ee/hogai`). Two deep read-only audits fed this synthesis.

## TL;DR

Our agent is a **real, working synchronous ReAct loop**: genuine Supabase-backed tools, streaming SSE,
memory, situational awareness, approval gating, prompt-injection fencing, per-turn tracing. The core is
solid. Max is a different *class* of system — a LangGraph state machine on **Temporal durable workflows**
with Postgres checkpointing, Redis-stream resumable SSE, hierarchical subagents, dynamic mode/toolkit
switching, context compaction + prompt caching, an onboarding memory subgraph, and a **two-tier
Braintrust/autoevals harness**. For an *operator copilot* (synchronous, human-in-the-loop) we do NOT need
all of Max — but several gaps are real correctness/safety/quality problems worth fixing now.

## Side-by-side

| Axis | PostHog Max | Us (chatAgent) | Gap |
|---|---|---|---|
| Execution | Temporal durable workflows + LangGraph Postgres checkpoints; crash-safe, resumable, cancellable, queued mid-turn msgs | Synchronous, request-scoped; 8-iter / 50s cap; only approval-pauses are checkpointed | High (arch) |
| Control flow | Cyclic `StateGraph`, parallel tool fan-out (`Send`), hierarchical **subagents** (`task` tool), dynamic **mode** switching | Single loop; read-parallel / write-sequential; delegates are **fire-and-forget (jobId, not result)**; "modes" are prompt labels only | High |
| Tools | `MaxTool` taxonomy, `content_and_artifact`, per-tool RBAC, contextual prompt injection, ~19 product modules, MCP | 155 registered / ~78 operator surface, real Supabase; **static-risk gate**; a couple of **stubs** | Med |
| Memory | CoreMemory + **onboarding subgraph** (scrapes product) + runtime **fact-collector loop** + CRUD tool | core-memory append/get + `/remember`; **racy** append, no auto-extraction | Med |
| Context/window | **Compaction** (summarize old turns, slide window to 195k) + **1h prompt caching** on prefix | Fixed 8KB tool-result truncation; compact situation; **no conversation compaction, no prompt caching** | High (scale/cost) |
| Streaming | Redis streams → SSE, **reconnectable/resumable**, subagent substreams | Direct Express SSE; disconnect loses in-flight turn | Med |
| Guardrails | `interrupt()` approvals + dangerous-op preview, RBAC, client-exec handoff, `MAX_TOOL_CALLS=24` | Static-risk approval + checkpoint-resume, 15s/tool timeout, kill-switch | Med (see flaws) |
| Prompts | Composed modular blocks + dynamic injections | **Already ported** modular sections | ~Parity |
| **Evals** | **Two-tier Braintrust/autoevals**: deterministic + LLM-as-judge scorers, curated datasets, Dagster offline, baseline regression | Smoke tests + **manual live scorecard (soft asserts)**; no automated quality/regression eval | High (quality) |
| Observability | OTel spans, PostHog LLM analytics, Prometheus, nested subagent traces | Per-turn trace → `super_agent_traces` + metrics endpoint | Med |

## Concrete FLAWS in our agent (code-level, with fixes)

1. **Approval gate uses static ToolSpec risk, not the dynamic classifier.** `message.send_to_customer`
   is `risk:'medium'` → the agent can message a customer with **no approval**; `customer.update`, `case.*`,
   `return.approve`, all `agent.*` delegates are un-gated. `safety.classifyRiskFromPlanSignal`
   ("refund>50=high", "bulk=high", status-aware cancel) exists but is **not wired into the chat loop**
   (`index.ts:291-292` reads static `.risk`). → Wire the dynamic classifier + gate customer messaging.
2. **`analysis.interoperability_check` is a hardcoded stub** (`analysis.ts:207-234`) returning fabricated
   mismatches, `risk:'none'`, always in the operator toolkit. → Remove / make real / clearly label simulated.
3. **PII redaction is unwired.** `safety.redactSensitiveText/redactStructuredValue` exist but nothing calls
   them in the chat loop. → Wire into `serializeForModel` / span capture.
4. **"OpenAI fallback" is not a fallback** — env switch, no automatic failover (`providers/index.ts:21-29`).
5. **Silent 8KB tool-result truncation** (`index.ts:74,650`); "re-query narrower" may not be possible.
6. **Delegates are fire-and-forget** (`agentDelegates.ts` → `{jobId,status:'enqueued'}`), worker-dependent.
7. **Core-memory append is racy** (read-modify-write, no lock; `slice(-10000)` can cut mid-fact).
8. **No automated quality eval** — soft-assert scorecard only; no golden set, no regression gate.
9. **No conversation compaction / prompt caching** — long chats overflow; every turn re-pays full prefix.
10. **No durable execution / crash recovery** for in-flight (non-approval) turns; 50s ceiling.
11. Minor: `/toolkit` QA endpoint `maxRisk:'medium'` ≠ live agent `'critical'`; tenant isolation app-layer only (RLS off).

## Prioritized iteration plan

**Tier 1 — Correctness & safety (cheap, high impact, do first)**
- T1.1 Wire `classifyRiskFromPlanSignal` into the approval gate + gate `message.send_to_customer`.
- T1.2 Fix/label `interoperability_check` (stop presenting fabricated data).
- T1.3 Wire PII redaction into tool results before model + trace.

**Tier 2 — Quality harness (biggest strategic gap; what "mejorar eficacia/output" needs)**
- T2.1 Port PostHog's eval pattern (small): curated operator dataset + scorers (tool-relevance,
  answer-correctness LLM-judge, no-hallucination, situation-accuracy), offline + baseline regression.

**Tier 3 — Robustness & scale**
- T3.1 Conversation compaction (summarize old turns) + Anthropic prompt caching.
- T3.2 Real subagent delegation (return the specialist's result / await the job).
- T3.3 Reconnectable streaming + resume of in-flight turns (durability-lite, no Temporal).

**Tier 4 — Architecture (defer; matters more for autonomous Fin than a synchronous copilot)**
- T4.1 Durable/queued execution. T4.2 Dynamic mode→toolkit switching.

Recommended start: **Tier 1** (real correctness/safety, low risk) → then **Tier 2** (the eval harness,
which de-risks every later change).
