-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: ticket_type_states (join)
-- Many-to-many link between ticket_states and ticket_types: which ticket types
-- a given state applies to. Managed from the Estados tab of Folios de atención.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ticket_type_states (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text        NOT NULL,
  workspace_id  text        NOT NULL,
  state_id      uuid        NOT NULL REFERENCES public.ticket_states(id) ON DELETE CASCADE,
  type_id       uuid        NOT NULL REFERENCES public.ticket_types(id)  ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_type_states_unique UNIQUE (state_id, type_id)
);

CREATE INDEX IF NOT EXISTS ticket_type_states_state_idx
  ON public.ticket_type_states (tenant_id, workspace_id, state_id);
