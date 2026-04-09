-- Phase 1.4 - Workspace governance hardening (Supabase)
-- Run in Supabase SQL editor.

BEGIN;

-- 1) Avoid duplicated role names inside the same workspace/tenant.
CREATE UNIQUE INDEX IF NOT EXISTS ux_roles_workspace_name_tenant
ON roles(workspace_id, tenant_id, name);

-- 2) Avoid duplicated membership for same user/workspace/tenant.
CREATE UNIQUE INDEX IF NOT EXISTS ux_members_workspace_user_tenant
ON members(workspace_id, user_id, tenant_id);

-- 3) Add soft validation for member status values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_members_status_values'
  ) THEN
    ALTER TABLE members
      ADD CONSTRAINT chk_members_status_values
      CHECK (status IN ('active', 'invited', 'suspended'));
  END IF;
END $$;

COMMIT;

-- Checks:
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename IN ('roles', 'members');
-- SELECT conname FROM pg_constraint WHERE conname = 'chk_members_status_values';

