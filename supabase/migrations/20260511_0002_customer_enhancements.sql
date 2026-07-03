-- ============================================================
-- Migration: customer enhancements
-- A2: contact_type (visitor/lead/customer)
-- A3: custom_attributes JSONB + custom_attribute_definitions table
-- A4: blocked flag
-- A5: last_activity_at with auto-update trigger
-- ============================================================

-- ── A2: contact_type ─────────────────────────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS contact_type TEXT NOT NULL DEFAULT 'customer'
    CHECK (contact_type IN ('visitor', 'lead', 'customer'));

CREATE INDEX IF NOT EXISTS idx_customers_contact_type
  ON customers (tenant_id, workspace_id, contact_type);

-- ── A3: custom_attributes on customers ───────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS custom_attributes JSONB NOT NULL DEFAULT '{}';

-- ── A3: custom_attribute_definitions table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS custom_attribute_definitions (
  id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id               TEXT NOT NULL,
  workspace_id            TEXT NOT NULL DEFAULT 'ws_default',
  attribute_key           TEXT NOT NULL,          -- machine key, e.g. "contract_number"
  attribute_display_name  TEXT NOT NULL,          -- label shown in UI
  attribute_display_type  TEXT NOT NULL DEFAULT 'text'
    CHECK (attribute_display_type IN ('text','number','date','boolean','list','checkbox','url','email')),
  attribute_model         TEXT NOT NULL DEFAULT 'customer'
    CHECK (attribute_model IN ('customer','case','company')),
  attribute_values        JSONB,                  -- options array for 'list' type
  default_value           TEXT,
  regex_pattern           TEXT,                   -- optional validation regex
  is_required             BOOLEAN NOT NULL DEFAULT FALSE,
  position                INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, workspace_id, attribute_model, attribute_key)
);

CREATE INDEX IF NOT EXISTS idx_custom_attr_def_scope
  ON custom_attribute_definitions (tenant_id, workspace_id, attribute_model, position);

-- ── A4: blocked ──────────────────────────────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_blocked
  ON customers (tenant_id, workspace_id, blocked)
  WHERE blocked = TRUE;

-- ── A5: last_activity_at ─────────────────────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_last_activity
  ON customers (tenant_id, workspace_id, last_activity_at DESC NULLS LAST);

-- Function to refresh last_activity_at when a case or message touches a customer
CREATE OR REPLACE FUNCTION refresh_customer_last_activity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Called from cases table trigger
  IF TG_TABLE_NAME = 'cases' AND NEW.customer_id IS NOT NULL THEN
    UPDATE customers
      SET last_activity_at = NOW(), updated_at = NOW()
    WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_case_updates_customer_activity ON cases;
CREATE TRIGGER trg_case_updates_customer_activity
  AFTER INSERT OR UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION refresh_customer_last_activity();

-- Backfill last_activity_at from most recent case for existing customers
UPDATE customers c
SET last_activity_at = (
  SELECT MAX(updated_at) FROM cases WHERE customer_id = c.id
)
WHERE last_activity_at IS NULL;

-- ── custom_attributes on cases ────────────────────────────────────────────────
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS custom_attributes JSONB NOT NULL DEFAULT '{}';

-- ── custom_attributes on companies (already in company migration) ─────────────
-- (companies.custom_attributes added in 20260511_0001_companies_table.sql)
