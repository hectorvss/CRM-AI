# Phase 2 - Case Operations (in progress)

## Objective
Close the operational gaps in Case Management so API and frontend contract stay aligned.

## Implemented
- Added `POST /api/cases`:
  - Requires `cases.write`
  - Generates `case_number`
  - Persists canonical defaults for missing fields
  - Emits audit event `CASE_CREATED`
- Added notes endpoints:
  - `GET /api/cases/:id/notes`
  - `POST /api/cases/:id/notes` (matches existing `casesApi.addNote` client contract)
  - `POST` requires `cases.write`
  - Emits audit event `CASE_NOTE_CREATED`
- Extended timeline:
  - `GET /api/cases/:id/timeline` now merges messages, notes, and status history
- Scope hardening:
  - All case mutations/read checks now enforce `tenant_id + workspace_id`
- Added SLA runtime sync in Case Service:
  - `sla_status` computed as `on_track | at_risk | breached`
  - Sync triggered on key case mutations (`status`, `assign`, `notes`, `drafts`)
  - `CASE_SLA_STATUS_UPDATED` audit event emitted when SLA state changes
- Added manual Draft Replies endpoints:
  - `GET /api/cases/:id/drafts`
  - `POST /api/cases/:id/drafts`
  - `PATCH /api/cases/:id/drafts/:draftId/status`
  - Status contract: `pending_review | approved | rejected | sent`
  - `POST/PATCH` require `cases.write`, `GET` requires `cases.read`
  - Audit events:
    - `CASE_DRAFT_CREATED`
    - `CASE_DRAFT_STATUS_UPDATED`
- Extended timeline:
  - `GET /api/cases/:id/timeline` now includes draft reply entries
- API client contract updated:
  - `casesApi.drafts.list`
  - `casesApi.drafts.create`
  - `casesApi.drafts.updateStatus`

## Supabase SQL to run
Run:
- `docs/sql/phase-2-1-case-operations-supabase.sql`
- `docs/sql/phase-2-2-case-sla-drafts-supabase.sql`

## Validation checklist
- [x] `POST /api/cases` creates a case and returns `201` with `id` and `case_number`
- [x] `POST /api/cases/:id/notes` returns `201` and persisted note appears in `GET /notes`
- [x] `GET /api/cases/:id/timeline` includes `entry_type = note`
- [x] Unauthorized calls to create/note endpoints return `403 FORBIDDEN`
- [x] `casesApi.addNote` works end-to-end from frontend
- [x] `POST /api/cases/:id/drafts` creates manual draft with `pending_review`
- [x] `GET /api/cases/:id/drafts` returns drafts ordered by `generated_at DESC`
- [x] `PATCH /api/cases/:id/drafts/:draftId/status` transitions draft status and audits change
- [x] `GET /api/cases` and `GET /api/cases/:id` expose consistent SLA fields and computed `sla_status`
