-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: custom_object_types
-- The registry of custom object TYPES (Intercom-style custom objects) managed
-- from the Objetos personalizados screen. This is the type registry only —
-- the per-type dynamic fields and the records themselves are a separate, larger
-- feature (custom_object_fields + custom_object_records), not built here.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.custom_object_types (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text        NOT NULL,
  workspace_id  text        NOT NULL,
  name          text        NOT NULL,
  object_key    text        NOT NULL,        -- machine key, e.g. "order"
  description   text,
  icon          text,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_object_types_key_unique UNIQUE (tenant_id, workspace_id, object_key)
);

CREATE INDEX IF NOT EXISTS custom_object_types_scope_idx
  ON public.custom_object_types (tenant_id, workspace_id);
