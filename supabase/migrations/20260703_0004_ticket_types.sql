-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: ticket_types
-- Custom ticket ("folio de atención") types managed from the Folios de atención
-- settings screen. Each type belongs to one of three categories
-- (customer / follow_up / back_office). The types↔states many-to-many link is a
-- separate concern, not built here.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ticket_types (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text        NOT NULL,
  workspace_id  text        NOT NULL,
  name          text        NOT NULL,
  description   text,
  icon          text,                       -- emoji or icon key
  category      text        NOT NULL DEFAULT 'customer'
    CHECK (category IN ('customer', 'follow_up', 'back_office')),
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_types_scope_idx
  ON public.ticket_types (tenant_id, workspace_id, category);
