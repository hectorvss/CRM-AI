-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260716_0001_agent_pending_action
-- Human-in-the-loop approvals for the operator Super Agent.
--
-- When the ReAct loop hits a high/critical-risk tool it pauses and stores a
-- lightweight checkpoint in `pending_action` (the honest equivalent of
-- interrupting PostHog's LangGraph and persisting the ApprovalRequest). The
-- /chat/approve endpoint reloads it, executes or rejects the tool, and resumes.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE agent_conversations
  ADD COLUMN IF NOT EXISTS status         TEXT  NOT NULL DEFAULT 'active',  -- active | awaiting_approval
  ADD COLUMN IF NOT EXISTS pending_action JSONB;

-- Fast lookup of conversations parked on an approval (dashboards / cleanup).
CREATE INDEX IF NOT EXISTS idx_agent_conversations_awaiting
  ON agent_conversations (tenant_id)
  WHERE status = 'awaiting_approval';
