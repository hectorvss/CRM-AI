-- Phase 1.1 - IAM + RBAC foundation (Supabase)
-- Run this in Supabase SQL Editor.
-- This script is idempotent and safe to re-run.

BEGIN;

-- 1) Permission catalog
CREATE TABLE IF NOT EXISTS permissions (
  key TEXT PRIMARY KEY,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) Normalized role-permission mapping
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_key ON role_permissions(permission_key);

-- 3) Team membership relation (for future team-based approval routing)
CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_in_team TEXT NOT NULL DEFAULT 'member',
  tenant_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_workspace ON team_members(workspace_id, team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_tenant ON team_members(tenant_id, user_id);

-- 4) Seed permission catalog
INSERT INTO permissions (key, module, action, description) VALUES
('cases.read', 'cases', 'read', 'Read case lists and case details'),
('cases.write', 'cases', 'write', 'Update case status and case fields'),
('cases.assign', 'cases', 'assign', 'Assign/reassign cases'),
('approvals.read', 'approvals', 'read', 'Read approvals queue and details'),
('approvals.decide', 'approvals', 'decide', 'Approve or reject approval requests'),
('workflows.read', 'workflows', 'read', 'Read workflow definitions and runs'),
('workflows.write', 'workflows', 'write', 'Create and edit workflows'),
('workflows.trigger', 'workflows', 'trigger', 'Trigger workflow runs'),
('knowledge.read', 'knowledge', 'read', 'Read knowledge articles and policy rules'),
('knowledge.write', 'knowledge', 'write', 'Create/update draft knowledge content'),
('knowledge.publish', 'knowledge', 'publish', 'Publish knowledge content'),
('reports.read', 'reports', 'read', 'Read reports and operational metrics'),
('reports.export', 'reports', 'export', 'Export report data'),
('settings.read', 'settings', 'read', 'Read workspace settings'),
('settings.write', 'settings', 'write', 'Update workspace settings'),
('members.read', 'members', 'read', 'Read members and roles'),
('members.invite', 'members', 'invite', 'Invite new members'),
('members.remove', 'members', 'remove', 'Remove/suspend members'),
('billing.read', 'billing', 'read', 'Read billing usage and subscription state'),
('billing.manage', 'billing', 'manage', 'Manage billing plan and payment settings'),
('audit.read', 'audit', 'read', 'Read audit logs')
ON CONFLICT (key) DO NOTHING;

-- 5) Backfill role_permissions from roles.permissions JSON array when present.
-- If your roles.permissions is JSONB, this still works.
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.value::TEXT AS permission_key
FROM roles r,
LATERAL jsonb_array_elements_text(
  CASE
    WHEN r.permissions IS NULL THEN '[]'::jsonb
    WHEN jsonb_typeof(r.permissions::jsonb) = 'array' THEN r.permissions::jsonb
    ELSE '[]'::jsonb
  END
) p
JOIN permissions perm ON perm.key = p.value::TEXT
ON CONFLICT (role_id, permission_key) DO NOTHING;

COMMIT;

-- Verification queries:
-- SELECT COUNT(*) FROM permissions;
-- SELECT role_id, COUNT(*) FROM role_permissions GROUP BY role_id ORDER BY role_id;
-- SELECT * FROM team_members LIMIT 20;

