-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: custom_object_fields
-- The field definitions of each custom object type (Objetos personalizados).
-- The actual records of these types (custom_object_records, data JSONB) are a
-- separate, larger feature — not built here.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.custom_object_fields (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      text        NOT NULL,
  workspace_id   text        NOT NULL,
  object_type_id uuid        NOT NULL REFERENCES public.custom_object_types(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  field_key      text        NOT NULL,
  field_type     text        NOT NULL DEFAULT 'text'
    CHECK (field_type IN ('text', 'number', 'boolean', 'date', 'select', 'email', 'url')),
  required       boolean     NOT NULL DEFAULT false,
  sort_order     integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_object_fields_key_unique UNIQUE (object_type_id, field_key)
);

CREATE INDEX IF NOT EXISTS custom_object_fields_type_idx
  ON public.custom_object_fields (tenant_id, workspace_id, object_type_id, sort_order);
