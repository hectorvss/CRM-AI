-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: ticket_states
-- Custom ticket states managed from the Folios de atención → Estados screen.
-- Each state has an internal label + a customer-facing label, and belongs to a
-- lifecycle category (submitted / in_progress / waiting_customer / resolved).
-- The state↔type many-to-many link is a separate concern, not built here.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ticket_states (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      text        NOT NULL,
  workspace_id   text        NOT NULL,
  internal_label text        NOT NULL,
  client_label   text,
  category       text        NOT NULL DEFAULT 'in_progress'
    CHECK (category IN ('submitted', 'in_progress', 'waiting_customer', 'resolved')),
  color          text,
  sort_order     integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_states_scope_idx
  ON public.ticket_states (tenant_id, workspace_id, category, sort_order);
