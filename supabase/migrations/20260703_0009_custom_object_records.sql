-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: custom_object_records
-- The actual records (rows) of each custom object type. Field values are stored
-- in a JSONB `data` map keyed by field_key, matching custom_object_fields.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.custom_object_records (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      text        NOT NULL,
  workspace_id   text        NOT NULL,
  object_type_id uuid        NOT NULL REFERENCES public.custom_object_types(id) ON DELETE CASCADE,
  data           jsonb       NOT NULL DEFAULT '{}',
  created_by     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS custom_object_records_type_idx
  ON public.custom_object_records (tenant_id, workspace_id, object_type_id, created_at DESC);
