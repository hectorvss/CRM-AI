-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: topics
-- Conversation topics/temas managed from the Temas settings screen. A topic is
-- a reusable named+coloured tag used to classify conversations by subject.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.topics (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text        NOT NULL,
  workspace_id  text        NOT NULL,
  name          text        NOT NULL,
  color         text,                       -- hex string, optional
  archived      boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT topics_name_unique UNIQUE (tenant_id, workspace_id, name)
);

CREATE INDEX IF NOT EXISTS topics_scope_idx
  ON public.topics (tenant_id, workspace_id, archived);
