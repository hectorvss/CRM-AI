# Data Standards

## Scope
These standards apply to all backend entities, migrations, and API-facing DTOs.

## Required fields (default)
- `tenant_id`: required in tenant-scoped entities
- `workspace_id`: required in workspace-scoped entities
- `created_at`: required, immutable after creation
- `updated_at`: required, updated on every write operation

## Naming conventions
- Tables: `snake_case`, plural (`cases`, `approval_requests`)
- Columns: `snake_case`
- IDs: `id` for primary key, `<entity>_id` for foreign keys
- Timestamps: `*_at`
- Booleans in SQLite: stored as `INTEGER` (`0` / `1`)

## Tenant isolation
- Every tenant-scoped query must include `tenant_id`.
- Every workspace-scoped query must include `tenant_id` and `workspace_id`.
- Query helpers and middleware must inject tenant/workspace context.

## JSON fields
- JSON columns must be parse-safe and have deterministic defaults.
- Use defaults:
  - Lists: `'[]'`
  - Objects: `'{}'`
- Parse failures must degrade gracefully and never crash request handlers.

## Append-only entities
These tables are append-only and must never be updated in-place:
- `audit_events`
- `credit_ledger`
- `webhook_events` (except processing metadata fields if explicitly modeled)

## Lifecycle records
For status-driven entities, state transitions must use centralized state machine rules.
Current state-machine-enforced entities:
- Case
- ApprovalRequest
- WorkflowRun
- ExecutionPlan
- ReconciliationIssue
- ConnectorHealth

## Idempotency and dedupe
- All write actions to external systems must have deterministic `idempotency_key`.
- Event ingestion must use deterministic `dedupe_key`.
- Duplicate-safe behavior is mandatory before retrying remote calls.

