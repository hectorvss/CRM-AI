-- ============================================================
-- Migration: companies table
-- Creates the companies entity and adds company_id FK to customers
-- ============================================================

CREATE TABLE IF NOT EXISTS companies (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id     TEXT NOT NULL,
  workspace_id  TEXT NOT NULL DEFAULT 'ws_default',
  name          TEXT NOT NULL,
  domain        TEXT,                          -- used for deduplication on ingest
  description   TEXT,
  website       TEXT,
  phone         TEXT,
  country       TEXT,
  industry      TEXT,
  employee_count INTEGER,
  annual_revenue REAL,
  currency      TEXT DEFAULT 'USD',
  custom_attributes JSONB NOT NULL DEFAULT '{}',
  contacts_count INTEGER NOT NULL DEFAULT 0,   -- denormalised, updated by trigger
  last_activity_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique domain per tenant (allows NULL domain = no dedup)
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_domain_tenant
  ON companies (tenant_id, domain)
  WHERE domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_companies_tenant_workspace
  ON companies (tenant_id, workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_companies_name
  ON companies (tenant_id, workspace_id, name);

-- ── Add company_id FK to customers ────────────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_company_id
  ON customers (company_id)
  WHERE company_id IS NOT NULL;

-- ── Auto-maintain contacts_count ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_company_contacts_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.company_id IS NOT NULL THEN
    UPDATE companies SET contacts_count = contacts_count + 1 WHERE id = NEW.company_id;
  ELSIF TG_OP = 'DELETE' AND OLD.company_id IS NOT NULL THEN
    UPDATE companies SET contacts_count = GREATEST(contacts_count - 1, 0) WHERE id = OLD.company_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.company_id IS DISTINCT FROM NEW.company_id THEN
      IF OLD.company_id IS NOT NULL THEN
        UPDATE companies SET contacts_count = GREATEST(contacts_count - 1, 0) WHERE id = OLD.company_id;
      END IF;
      IF NEW.company_id IS NOT NULL THEN
        UPDATE companies SET contacts_count = contacts_count + 1 WHERE id = NEW.company_id;
      END IF;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_company_contacts_count ON customers;
CREATE TRIGGER trg_company_contacts_count
  AFTER INSERT OR UPDATE OF company_id OR DELETE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_company_contacts_count();
