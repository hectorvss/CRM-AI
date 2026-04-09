# Phase 4 - Reconciliation + Policy + Approvals

## Objective
Implement the first production slice of Phase 4: reconciliation issue lifecycle and operator controls.

## Implemented (Phase 4.1)
- Added reconciliation API router:
  - `GET /api/reconciliation/issues`
  - `GET /api/reconciliation/issues/:id`
  - `PATCH /api/reconciliation/issues/:id/status`
- Added lifecycle transition validation:
  - Uses `reconciliationIssueTransitions` contract (`open -> in_progress/resolved/escalated/ignored`, etc.)
  - Rejects invalid transitions with explicit contract error.
- Added audit trail for lifecycle changes:
  - `RECONCILIATION_ISSUE_STATUS_CHANGED` including old/new status and resolution metadata.
- Added case conflict synchronization:
  - When issue is moved to `resolved`/`ignored`, recalculates open issue count for case.
  - Updates `cases.has_reconciliation_conflicts` and clears `cases.conflict_severity` when no active conflicts remain.
- Extended frontend API contract:
  - `reconciliationApi.listIssues`
  - `reconciliationApi.getIssue`
  - `reconciliationApi.updateIssueStatus`
- Added DB indexing for triage/queue queries in both SQLite schema and Supabase SQL.

## Already completed in previous slice (Phase 3.4 dependency)
- Source-of-truth rules runtime application on canonical ingest.
- Rules management endpoints under `/api/connectors/source-of-truth/rules`.

## Supabase SQL to run
Run:
- `docs/sql/phase-4-1-reconciliation-lifecycle-supabase.sql`

## Validation checklist
- [x] List reconciliation issues with filters (`status`, `severity`, `entity_type`, `case_id`)
- [x] Fetch reconciliation issue detail
- [x] Status transition respects contract state machine
- [x] Resolved/ignored updates case conflict flag if no active issues remain
- [x] Audit event generated for lifecycle status change

## Next slices (planned)
- Phase 4.2: Policy Engine minimal (`PolicyRule` evaluation + decision contract ALLOW/CONDITIONAL/APPROVAL/BLOCK)
- Phase 4.3: Approval evidence package enrichment + policy-linked approval routing

## Implemented (Phase 4.2)
- Added policy engine API router:
  - `GET /api/policy/rules`
  - `POST /api/policy/rules`
  - `PATCH /api/policy/rules/:id`
  - `POST /api/policy/evaluate`
- Added minimal condition DSL support in policy evaluation:
  - operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`, `exists`
  - dot-path field lookup in context (`customer.segment`, `payment.amount`, etc.)
- Added decision contract:
  - `allow`
  - `conditional`
  - `approval_required`
  - `block`
- Added policy evaluation traces:
  - `policy_evaluations` table stores input context, matched rules, and final decision.
- Added audit events:
  - `POLICY_RULE_CREATED`
  - `POLICY_RULE_UPDATED`
  - `POLICY_EVALUATED`

## Supabase SQL to run (Phase 4.2)
Run:
- `docs/sql/phase-4-2-policy-engine-supabase.sql`

## Implemented (Phase 4.3)
- Added policy-to-approval routing endpoint:
  - `POST /api/policy/evaluate-and-route`
- Added routing behavior:
  - Evaluates policy rules and persists `policy_evaluations`.
  - When decision is `approval_required`, creates `approval_requests`.
  - Builds `evidence_package` from evaluation result + input context.
  - Updates case to `approval_state='pending'` and links `active_approval_request_id`.
  - Moves case to `pending_approval` when case status is in operational states (`new/open/waiting/in_review`).
- Added policy evaluation query endpoint:
  - `GET /api/policy/evaluations`
- Added audit events:
  - `POLICY_APPROVAL_REQUEST_CREATED`
  - `POLICY_EVALUATED` (with routing metadata)
- Extended frontend API contract:
  - `policyApi.evaluateAndRoute`
  - `policyApi.evaluations`

## Supabase SQL to run (Phase 4.3)
Run:
- `docs/sql/phase-4-3-policy-approval-routing-supabase.sql`

## Implemented (Phase 4.4)
- Extended Approval Engine operational endpoints:
  - `GET /api/approvals/queue` (priority queue view with policy metadata)
  - `POST /api/approvals/bulk-decide` (bulk approve/reject)
  - `POST /api/approvals/process-expirations` (auto-expire pending approvals past `expires_at`)
- Improved case lifecycle coupling on approval outcome:
  - `approved` -> case `approval_state=approved`, clears active approval id, status progresses to `pending_execution` when coming from `pending_approval`.
  - `rejected` -> case `approval_state=rejected`, clears active approval id, status returns to `in_review` when coming from `pending_approval`.
  - `expired` -> case `approval_state=expired`, clears active approval id, escalates case status when pending approval expires.
- Added audit events:
  - `APPROVAL_DECIDED`
  - `APPROVAL_DECIDED_BULK`
  - `APPROVAL_EXPIRED`
- Extended frontend API contract:
  - `approvalsApi.queue`
  - `approvalsApi.bulkDecide`
  - `approvalsApi.processExpirations`

## Supabase SQL to run (Phase 4.4)
Run:
- `docs/sql/phase-4-4-approval-queue-expiration-supabase.sql`

## Implemented (Phase 4.5 - Operational Closure)
- Reconciliation automation:
  - `POST /api/reconciliation/issues/:id/resolve-apply`
    - Applies source-of-truth status to canonical entity state.
    - Resolves issue and writes `canonical_field_decisions` trace.
  - `POST /api/reconciliation/process-open`
    - Batch processes open/in-progress issues with available source-of-truth signal.
  - `GET /api/reconciliation/metrics`
    - Operational KPIs (`open/in_progress/escalated/resolved`, auto-resolved 24h, avg resolution hours).
- Policy conflict handling:
  - Policy evaluation now detects contradictory matched rules.
  - Conflict forces safe decision: `approval_required` with `conflict_detected=true`.
  - Stored in `policy_evaluations.conflict_detected` + `conflicting_rule_ids`.
  - `GET /api/policy/metrics` for decision and conflict rates.
- Approvals operations hardening:
  - `POST /api/approvals/:id/delegate` (delegate to user or role-resolved user).
  - `GET /api/approvals/metrics` (queue health, throughput, expirations risk).
- Frontend API contract extensions:
  - `reconciliationApi.resolveAndApply`
  - `reconciliationApi.processOpen`
  - `reconciliationApi.metrics`
  - `policyApi.metrics`
  - `approvalsApi.metrics`
  - `approvalsApi.delegate`

## Supabase SQL to run (Phase 4.5)
Run:
- `docs/sql/phase-4-5-ops-closure-supabase.sql`
