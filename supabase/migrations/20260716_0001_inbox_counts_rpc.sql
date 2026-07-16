-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: inbox_counts RPC
-- Server-side inbox scope counts so the sidebar badges don't require loading
-- every case into the browser. Mirrors the client's matchesInboxScope.
-- Returns a jsonb map of scope -> count, plus teams/agents as arrays of
-- {id, count} (arrays, not objects, so the API layer's snake->camel key
-- transform can't mangle the id values). ai_handled is derived (no such column):
-- resolved_by='ai' OR ai_confidence>0.1.
--
-- Already applied to the remote DB via apply_migration on 2026-07-16; this file
-- keeps migrations as the single source of truth. CREATE OR REPLACE is
-- idempotent, so re-applying is safe.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.inbox_counts(p_tenant text, p_workspace text, p_user text)
returns jsonb
language sql
stable
as $$
  with c as (
    select
      status, assigned_user_id, assigned_team_id, created_by_user_id,
      source_channel, type, tags, approval_state,
      (resolved_by = 'ai' or (ai_confidence is not null and ai_confidence > 0.1)) as ai_handled
    from public.cases
    where tenant_id = p_tenant and workspace_id = p_workspace
  )
  select jsonb_build_object(
    'all',        count(*),
    'inbox',      count(*) filter (where assigned_user_id = p_user and status is distinct from 'spam'),
    'unassigned', count(*) filter (where assigned_user_id is null),
    'spam',       count(*) filter (where status = 'spam'),
    'created',    count(*) filter (where created_by_user_id = p_user),
    'mentions',   count(*) filter (where tags::text ilike '%mention%' or tags::text ilike '%mencion%'),
    'fin-all',       count(*) filter (where ai_handled),
    'fin-resolved',  count(*) filter (where ai_handled and lower(status) in ('resolved','closed','done','completed')),
    'fin-escalated', count(*) filter (where ai_handled and (lower(status) in ('escalated','blocked') or approval_state in ('pending','expired','rejected'))),
    'fin-pending',   count(*) filter (where ai_handled and (approval_state = 'pending' or lower(status) in ('waiting','pending','snoozed'))),
    'fin-spam',      count(*) filter (where ai_handled and (status = 'spam' or lower(status) = 'blocked')),
    'v-messenger', count(*) filter (where source_channel ilike '%messenger%' or source_channel ilike '%web%' or source_channel ilike '%chat%'),
    'v-email',     count(*) filter (where source_channel ilike '%email%'),
    'v-whatsapp',  count(*) filter (where source_channel ilike '%whatsapp%' or source_channel ilike '%social%'),
    'v-phone',     count(*) filter (where source_channel ilike '%phone%' or source_channel ilike '%sms%'),
    'v-tickets',   count(*) filter (where source_channel ilike '%ticket%' or type ilike '%ticket%'),
    'teams',  coalesce((select jsonb_agg(jsonb_build_object('id', assigned_team_id, 'count', n)) from (select assigned_team_id, count(*) n from c where assigned_team_id is not null group by assigned_team_id) t), '[]'::jsonb),
    'agents', coalesce((select jsonb_agg(jsonb_build_object('id', assigned_user_id, 'count', n)) from (select assigned_user_id, count(*) n from c where assigned_user_id is not null group by assigned_user_id) a), '[]'::jsonb)
  )
  from c;
$$;
