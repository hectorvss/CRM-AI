-- Phase 1.2 - RBAC synchronization and consistency checks (Supabase)
-- Run after changing roles.permissions or seeding new roles.

BEGIN;

-- 1) Ensure every permission_key in role_permissions still exists in permissions catalog.
DELETE FROM role_permissions rp
WHERE NOT EXISTS (
  SELECT 1 FROM permissions p WHERE p.key = rp.permission_key
);

-- 2) Sync role_permissions from roles.permissions JSON text.
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.value::TEXT
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

-- Checks:
-- 1) SELECT id, name, permissions FROM roles ORDER BY id;
-- 2) SELECT role_id, COUNT(*) AS permission_count FROM role_permissions GROUP BY role_id ORDER BY role_id;
-- 3) SELECT rp.role_id, rp.permission_key
--    FROM role_permissions rp
--    LEFT JOIN permissions p ON p.key = rp.permission_key
--    WHERE p.key IS NULL;

