# Phase 0 - Foundations Execution Plan

## Goal
Lock domain contracts, event taxonomy, and state machines before deep backend implementation.

## Current Baseline (repo reality)
- The project already has a broad relational schema in `server/db/schema.sql`.
- There are route handlers and a seeded demo dataset.
- Types exist but are split between `server/models.ts` and UI-specific `src/types.ts`.
- There is no single contract layer for lifecycle rules and canonical event behavior.

## Phase 0 Subphases

### 0.1 Domain Contract Consolidation
Deliverables:
- Central contract module for core entities and enums.
- Strict status/risk/priority/channel/source unions.
- Reusable DTO contracts for API and runtime.

Done criteria:
- One source of truth for backend contracts exists under `server/contracts`.
- Contracts cover Case, CanonicalEvent, ApprovalRequest, ExecutionPlan.

### 0.2 State Machine Lockdown
Deliverables:
- Explicit transition maps for:
  - Case
  - ApprovalRequest
  - WorkflowRun
  - ExecutionPlan
  - ReconciliationIssue
  - ConnectorHealth
- Shared transition helpers (`canTransition`, `assertTransition`).

Done criteria:
- State transitions are centralized and importable by routes/services.
- Invalid transitions can be blocked consistently.

### 0.3 Canonical Event Model & Taxonomy
Deliverables:
- Canonical event type registry.
- Event category registry.
- Dedupe key helper and idempotency key helper.

Done criteria:
- Event type names are standardized and discoverable.
- Dedupe/idempotency conventions are codified.

### 0.4 Data Contract Governance
Deliverables:
- Naming conventions and field-level standards documented.
- Required field matrix (`tenant_id`, `workspace_id`, timestamps).

Done criteria:
- New tables/contracts follow common conventions.

### 0.5 API Contract Strategy
Deliverables:
- Contract strategy for request/response DTO versioning.
- Error shape standard (`code`, `message`, `details`).

Done criteria:
- All future endpoints have a consistent contract blueprint.

### 0.6 Validation and Quality Gate
Deliverables:
- Typecheck passes.
- A simple checklist proving each subphase is closed.

Done criteria:
- CI/local typecheck green.
- Phase 0 closure checklist complete.

## Implementation Order (what we are doing now)
1. `server/contracts/domain.ts`
2. `server/contracts/stateMachines.ts`
3. `server/contracts/canonicalEvents.ts`
4. Wire these contracts incrementally into routes/services (next steps)
5. Add validation rules + ADR notes

## Phase 0 Closure Checklist
- [x] Domain contracts created
- [x] State machine transitions centralized
- [x] Canonical event taxonomy + helpers created
- [x] Route/service usage migrated to contract layer
- [x] API error shape standardized
- [x] Data standards doc completed
- [x] Typecheck and baseline validation completed
