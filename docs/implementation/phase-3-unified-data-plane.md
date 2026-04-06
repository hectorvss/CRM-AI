# Phase 3 - Unified Data Plane (closed)

## Objective
Bootstrap external event ingestion and canonical event persistence, including dedupe and basic case linking.

## Implemented
- Added webhook intake endpoint:
  - `POST /api/connectors/webhooks/:system`
  - Ingests payload, computes deterministic `dedupe_key`, writes `webhook_events`
  - Maps to canonical event and writes `canonical_events`
  - Marks webhook as processed and links canonical event to case when possible
- Added canonical events retrieval endpoints:
  - `GET /api/connectors/events`
  - `GET /api/connectors/events/:id`
- Added basic event normalization:
  - Shopify topic to canonical `event_type` mapping
  - `event_category` inference from normalized type
  - Source entity type/id inference from payload
- Added basic entity linking:
  - `order` -> `orders` -> case by `order_ids`
  - `payment/refund` -> `payments` -> case by `payment_ids`
  - `return` -> `returns` -> case by `return_ids`
- Added identity resolution bootstrap:
  - Resolve customer by `linked_identities(system, external_id)`
  - Fallback resolution by `customers.canonical_email`
  - Auto-create customer + linked identity when no match and external/email exists
- Added case auto-link / auto-create behavior:
  - If no entity-based case match, try recent open case for resolved customer
  - If still no match, auto-create a new case from webhook event context
  - Canonical event status now supports `case_created` flow in runtime bootstrap
- Added commerce enrichment from canonical ingest:
  - Auto-upsert `orders`, `payments`, `returns` from canonical event payload
  - Update `system_states` snapshots on every ingest
  - Append domain events (`order_events`, `return_events`) when applicable
  - Detect strong status mismatch and open `reconciliation_issues` baseline
- Added source-of-truth rules (Phase 3.4 bootstrap):
  - Runtime status application now respects preferred system per entity
  - Non-authoritative conflicting updates preserve canonical status and create reconciliation issue
  - Added rules endpoints:
    - `GET /api/connectors/source-of-truth/rules`
    - `PUT /api/connectors/source-of-truth/rules/:entityType` (`settings.write`)
- Added identity low-confidence review queue (Phase 3.5):
  - Email-only customer matches are queued for human verification
  - Review endpoints:
    - `GET /api/connectors/identity-reviews`
    - `PATCH /api/connectors/identity-reviews/:id`
- Added audit event:
  - `CANONICAL_EVENT_INGESTED`
  - `CASE_AUTO_CREATED_FROM_EVENT`
  - `SOURCE_OF_TRUTH_RULE_UPDATED`
  - `IDENTITY_REVIEW_DECIDED`
- Extended frontend API contract:
  - `connectorsApi.events`
  - `connectorsApi.getEvent`
  - `connectorsApi.ingestWebhook`
  - `connectorsApi.sourceOfTruthRules`
  - `connectorsApi.updateSourceOfTruthRule`
  - `connectorsApi.identityReviews`
  - `connectorsApi.decideIdentityReview`

## Supabase SQL to run
Run:
- `docs/sql/phase-3-1-unified-data-plane-bootstrap.sql`
- `docs/sql/phase-3-2-identity-resolution-autocase-supabase.sql`
- `docs/sql/phase-3-3-commerce-enrichment-supabase.sql`
- `docs/sql/phase-3-4-source-of-truth-rules-supabase.sql`
- `docs/sql/phase-3-5-identity-review-queue-supabase.sql`

## Validation checklist
- [x] Ingesting same webhook twice returns duplicate-safe response and does not create duplicated canonical event
- [x] `GET /api/connectors/events` returns canonical events ordered by `occurred_at DESC`
- [x] Ingested events include normalized `event_type`, `event_category`, and `dedupe_key`
- [x] Case-linked events update `cases.last_activity_at`
- [x] Audit contains `CANONICAL_EVENT_INGESTED`
- [x] Unknown customer identity can be resolved/created from webhook payload
- [x] When no case match exists, webhook intake auto-creates a case and links canonical event
- [x] Canonical event ingest can upsert commerce entities and update `system_states`
- [x] Status divergences can register baseline reconciliation issues for triage
- [x] Canonical status application now follows configurable source-of-truth rules by entity
- [x] Rules can be queried/updated via connectors API with RBAC controls
- [x] Low-confidence identity scenarios can be triaged in a dedicated review queue
