# Phase 1 - IAM and RBAC (closed)

## Objective
Move from header-only tenant context to enforceable role/permission checks at API level.

## What was implemented in code
- Multi-tenant context now resolves:
  - `tenantId`
  - `workspaceId`
  - `userId`
  - `roleId`
  - `permissions`
- Added authorization middleware:
  - `requirePermission(permissionKey)`
- Added effective-permissions endpoint:
  - `GET /api/iam/permissions/me`
- Added lightweight session auth endpoints:
  - `POST /api/iam/sessions/login`
  - `POST /api/iam/sessions/logout`
  - Bearer token support in tenant middleware via `user_sessions`
- Added workspace governance endpoints:
  - `GET /api/iam/roles`
  - `POST /api/iam/roles`
  - `PATCH /api/iam/roles/:id`
  - `GET /api/iam/members`
  - `POST /api/iam/members/invite`
  - `PATCH /api/iam/members/:id`
  - `GET /api/workspaces/current/context`
  - `PATCH /api/workspaces/:id/settings`
  - `GET /api/workspaces/:id/members`
  - `GET /api/workspaces/:id/feature-flags`
  - `PATCH /api/workspaces/:id/feature-flags/:featureKey`
- Added permission enforcement to critical routes:
  - `cases`: read/write/assign
  - `approvals`: read/decide
  - `workflows`: read
  - `customers`, `orders`, `payments`, `returns`, `conversations`: cases.read
  - `knowledge`: knowledge.read
  - `audit`: audit.read
  - `workspaces`: settings.read
  - `billing`: billing.read
- Hardcoded tenant fallbacks removed in:
  - `approvals`, `workflows`, `knowledge`
- Default implicit `system` user removed:
  - missing `x-user-id` now falls back to `user_alex` (dev behavior)
  - `system` actor remains explicit-only

## Supabase migration to run manually
Run:
- `docs/sql/phase-1-1-iam-rbac-supabase.sql`

This migration creates:
- `permissions`
- `role_permissions`
- `team_members`
- plus seed data and backfill from `roles.permissions`.

Optional sync script after changing role JSON:
- `docs/sql/phase-1-2-rbac-sync-supabase.sql`

Governance hardening script:
- `docs/sql/phase-1-4-workspace-governance-supabase.sql`

Phase closure script:
- `docs/sql/phase-1-5-auth-sessions-feature-flags-supabase.sql`

## Validation checklist
- [x] SQL executed in Supabase
- [x] `permissions` table populated
- [x] `role_permissions` mapped for existing roles
- [x] `GET /api/iam/permissions/me` returns expected permission set
- [x] Forbidden routes return `403 FORBIDDEN` when permission is missing
- [x] `approvals/workflows/knowledge` fail fast if tenant context is missing
- [x] Session auth endpoints available and middleware can resolve bearer token sessions
- [x] Workspace-level feature flag overrides available

## Notes
- Current runtime supports both:
  - explicit `roles.permissions` JSON
  - fallback role presets in middleware
- Remaining optional hardening for enterprise auth (JWT signing/refresh/SAML) is intentionally deferred to later phases.
