-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: labels
-- First-class label/etiqueta entities (Intercom-style) managed from the
-- Etiquetas settings screen. Distinct from the free-form string tags that live
-- on cases (casesApi.updateTags); a label is a reusable, named, coloured entity.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.labels (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text        NOT NULL,
  workspace_id  text        NOT NULL,
  name          text        NOT NULL,
  color         text,                       -- hex string, optional
  created_by    text,                       -- user id that created it
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- one label name per workspace
  CONSTRAINT labels_name_unique UNIQUE (tenant_id, workspace_id, name)
);

CREATE INDEX IF NOT EXISTS labels_scope_idx
  ON public.labels (tenant_id, workspace_id, name);
