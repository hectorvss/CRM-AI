-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260415_0002_demo_case_expansion  [REPLACED — no-op]
--
-- The demo seed data that was previously here has been extracted to:
--   scripts/seed-demo.sql
--
-- To load demo data into a local/staging environment run:
--   psql $DATABASE_URL -f scripts/seed-demo.sql
-- Or via npm:
--   npm run seed:demo
--
-- This migration is intentionally left as a no-op so that:
--   1. Supabase migration history records it as applied.
--   2. Production environments are never seeded with test data.
-- ─────────────────────────────────────────────────────────────────────────────

-- no-op
select 1;
