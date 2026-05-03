begin;

-- Case graph demo expansion: knowledge, integrations, AI Studio, refunds, and workflows.

insert into knowledge_domains (id, tenant_id, workspace_id, name, description, created_at)
values
  ('kd_refunds', 'org_default', 'ws_default', 'Refund Operations', 'Refund lifecycle, bank clearance, and chargeback handling.', timestamp '2026-04-15 12:30:00+00'),
  ('kd_integrations', 'org_default', 'ws_default', 'Integrations', 'Connector runbooks and system sync guidance.', timestamp '2026-04-15 12:30:00+00'),
  ('kd_ai_studio', 'org_default', 'ws_default', 'AI Studio', 'Agent policies, guardrails, and rollout controls.', timestamp '2026-04-15 12:30:00+00')
on conflict (id) do update set
  tenant_id = excluded.tenant_id,
  workspace_id = excluded.workspace_id,
  name = excluded.name,
  description = excluded.description;

insert into knowledge_articles (
  id, tenant_id, workspace_id, domain_id, title, content, content_structured, type, status, owner_user_id,
  review_cycle_days, last_reviewed_at, next_review_at, version, citation_count, last_cited_at, outdated_flag,
  linked_workflow_ids, linked_approval_policy_ids, created_at, updated_at
)
values
  (
    'ka_refund_clearance', 'org_default', 'ws_default', 'kd_refunds',
    'Bank clearance refund playbook',
    'Use this article when PSP refund is approved but OMS still shows pending. Wait for bank clearance, keep the customer informed, and reconcile the payment state before closing the case.',
    jsonb_build_object('summary', 'Playbook for PSP approved refunds waiting on OMS clearance'),
    'article', 'published', 'user_alex',
    60, timestamp '2026-04-15 12:00:00+00', timestamp '2026-06-14 12:00:00+00', 2, 4, timestamp '2026-04-15 12:20:00+00', false,
    jsonb_build_array('wfd_refund_ops'), jsonb_build_array('pr_chargeback_review'),
    timestamp '2026-04-15 12:30:00+00', timestamp '2026-04-15 12:30:00+00'
  ),
  (
    'ka_warehouse_scan', 'org_default', 'ws_default', 'kd_refunds',
    'Warehouse scan confirmation',
    'Replacements and returns should remain pending until the warehouse scan confirms the physical item has arrived or the label is validated.',
    jsonb_build_object('summary', 'Warehouse scan guidance for returns and replacements'),
    'article', 'published', 'user_sarah',
    60, timestamp '2026-04-15 12:05:00+00', timestamp '2026-06-14 12:05:00+00', 1, 3, timestamp '2026-04-15 12:22:00+00', false,
    jsonb_build_array('wfd_replacement_ops'), jsonb_build_array('pr_replacement_approval'),
    timestamp '2026-04-15 12:30:00+00', timestamp '2026-04-15 12:30:00+00'
  ),
  (
    'ka_replacement_policy', 'org_default', 'ws_default', 'kd_refunds',
    'Replacement approval policy',
    'Warehouse confirmation is required before approving a replacement order. High-risk replacements should be blocked until receipt is confirmed.',
    jsonb_build_object('summary', 'Replacement policy and human approval guidance'),
    'article', 'published', 'user_alex',
    90, timestamp '2026-04-15 12:08:00+00', timestamp '2026-07-14 12:08:00+00', 1, 2, timestamp '2026-04-15 12:24:00+00', false,
    jsonb_build_array('wfd_replacement_ops'), jsonb_build_array('pr_replacement_approval'),
    timestamp '2026-04-15 12:30:00+00', timestamp '2026-04-15 12:30:00+00'
  ),
  (
    'ka_chargeback_playbook', 'org_default', 'ws_default', 'kd_refunds',
    'Chargeback and dispute playbook',
    'Blocked refunds and disputed payments must stay frozen until risk review clears the chargeback path. Escalate to finance and keep the customer updated.',
    jsonb_build_object('summary', 'Chargeback playbook for blocked payments'),
    'article', 'published', 'user_james',
    90, timestamp '2026-04-15 12:06:00+00', timestamp '2026-07-14 12:06:00+00', 2, 5, timestamp '2026-04-15 12:25:00+00', false,
    jsonb_build_array('wfd_refund_ops'), jsonb_build_array('pr_chargeback_review'),
    timestamp '2026-04-15 12:30:00+00', timestamp '2026-04-15 12:30:00+00'
  ),
  (
    'ka_connector_runbook', 'org_default', 'ws_default', 'kd_integrations',
    'Connector sync runbook',
    'Use this guide to inspect Shopify, Stripe, OMS, and WMS connectors. Verify status, capabilities, and the latest health check before trusting downstream data.',
    jsonb_build_object('summary', 'Runbook for integration health and sync checks'),
    'article', 'published', 'user_alex',
    45, timestamp '2026-04-15 12:10:00+00', timestamp '2026-05-30 12:10:00+00', 1, 6, timestamp '2026-04-15 12:26:00+00', false,
    jsonb_build_array('wfd_connector_watch'), jsonb_build_array('pr_cancel_approval'),
    timestamp '2026-04-15 12:30:00+00', timestamp '2026-04-15 12:30:00+00'
  ),
  (
    'ka_ai_guardrails', 'org_default', 'ws_default', 'kd_ai_studio',
    'AI Studio guardrails',
    'Policies for agent permissions, reasoning depth, safety checks, and knowledge access. Keep rollout constrained until the live profile is validated.',
    jsonb_build_object('summary', 'Guardrails for AI Studio agent profiles'),
    'article', 'published', 'user_alex',
    30, timestamp '2026-04-15 12:12:00+00', timestamp '2026-05-15 12:12:00+00', 1, 3, timestamp '2026-04-15 12:27:00+00', false,
    jsonb_build_array('wfd_connector_watch'), jsonb_build_array('pr_replacement_approval'),
    timestamp '2026-04-15 12:30:00+00', timestamp '2026-04-15 12:30:00+00'
  )
on conflict (id) do update set
  tenant_id = excluded.tenant_id,
  workspace_id = excluded.workspace_id,
  domain_id = excluded.domain_id,
  title = excluded.title,
  content = excluded.content,
  content_structured = excluded.content_structured,
  type = excluded.type,
  status = excluded.status,
  owner_user_id = excluded.owner_user_id,
  review_cycle_days = excluded.review_cycle_days,
  last_reviewed_at = excluded.last_reviewed_at,
  next_review_at = excluded.next_review_at,
  version = excluded.version,
  citation_count = excluded.citation_count,
  last_cited_at = excluded.last_cited_at,
  outdated_flag = excluded.outdated_flag,
  linked_workflow_ids = excluded.linked_workflow_ids,
  linked_approval_policy_ids = excluded.linked_approval_policy_ids,
  updated_at = excluded.updated_at;

insert into case_knowledge_links (id, case_id, article_id, tenant_id, relevance_score, created_at)
values
  ('ckl_001', 'case_001', 'ka_refund_clearance', 'org_default', 0.98, timestamp '2026-04-15 12:31:00+00'),
  ('ckl_002', 'case_001', 'ka_chargeback_playbook', 'org_default', 0.92, timestamp '2026-04-15 12:31:10+00'),
  ('ckl_003', 'case_001', 'ka_ai_guardrails', 'org_default', 0.86, timestamp '2026-04-15 12:31:20+00'),
  ('ckl_004', 'case_002', 'ka_warehouse_scan', 'org_default', 0.97, timestamp '2026-04-15 12:31:30+00'),
  ('ckl_005', 'case_002', 'ka_connector_runbook', 'org_default', 0.84, timestamp '2026-04-15 12:31:40+00'),
  ('ckl_006', 'case_002', 'ka_replacement_policy', 'org_default', 0.88, timestamp '2026-04-15 12:31:50+00'),
  ('ckl_007', 'case_003', 'ka_chargeback_playbook', 'org_default', 0.99, timestamp '2026-04-15 12:32:00+00'),
  ('ckl_008', 'case_003', 'ka_refund_clearance', 'org_default', 0.85, timestamp '2026-04-15 12:32:10+00'),
  ('ckl_009', 'case_003', 'ka_ai_guardrails', 'org_default', 0.80, timestamp '2026-04-15 12:32:20+00'),
  ('ckl_010', 'case_004', 'ka_replacement_policy', 'org_default', 0.99, timestamp '2026-04-15 12:32:30+00'),
  ('ckl_011', 'case_004', 'ka_warehouse_scan', 'org_default', 0.95, timestamp '2026-04-15 12:32:40+00'),
  ('ckl_012', 'case_004', 'ka_ai_guardrails', 'org_default', 0.83, timestamp '2026-04-15 12:32:50+00')
on conflict (id) do update set
  case_id = excluded.case_id,
  article_id = excluded.article_id,
  tenant_id = excluded.tenant_id,
  relevance_score = excluded.relevance_score,
  created_at = excluded.created_at;

insert into connectors (id, tenant_id, system, name, status, auth_type, auth_config, last_health_check_at, capabilities, created_at, updated_at)
values
  ('conn_shopify', 'org_default', 'shopify', 'Shopify', 'connected', 'oauth', jsonb_build_object('store', 'acme-store'), timestamp '2026-04-15 12:28:00+00', jsonb_build_array('orders', 'returns', 'products'), timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 12:28:00+00'),
  ('conn_stripe', 'org_default', 'stripe', 'Stripe', 'connected', 'api_key', jsonb_build_object('account', 'acct_live_demo'), timestamp '2026-04-15 12:28:10+00', jsonb_build_array('payments', 'refunds', 'disputes'), timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 12:28:10+00'),
  ('conn_intercom', 'org_default', 'intercom', 'Intercom', 'connected', 'oauth', jsonb_build_object('workspace', 'support-demo'), timestamp '2026-04-15 12:28:20+00', jsonb_build_array('messages', 'threads', 'customer_notes'), timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 12:28:20+00'),
  ('conn_oms', 'org_default', 'oms', 'OMS', 'connected', 'api_key', jsonb_build_object('instance', 'oms-demo'), timestamp '2026-04-15 12:28:30+00', jsonb_build_array('orders', 'fulfillment', 'cancellation'), timestamp '2026-04-15 12:28:30+00', timestamp '2026-04-15 12:28:30+00'),
  ('conn_wms', 'org_default', 'wms', 'Warehouse WMS', 'connected', 'api_key', jsonb_build_object('warehouse', 'main-hub'), timestamp '2026-04-15 12:28:40+00', jsonb_build_array('receipts', 'inventory', 'returns'), timestamp '2026-04-15 12:28:40+00', timestamp '2026-04-15 12:28:40+00'),
  ('conn_logistics', 'org_default', 'carrier', 'Logistics Carrier', 'syncing', 'api_key', jsonb_build_object('carrier', 'fedex-demo'), timestamp '2026-04-15 12:28:50+00', jsonb_build_array('tracking', 'shipment_updates'), timestamp '2026-04-15 12:28:50+00', timestamp '2026-04-15 12:28:50+00')
on conflict (id) do update set
  tenant_id = excluded.tenant_id,
  system = excluded.system,
  name = excluded.name,
  status = excluded.status,
  auth_type = excluded.auth_type,
  auth_config = excluded.auth_config,
  last_health_check_at = excluded.last_health_check_at,
  capabilities = excluded.capabilities,
  updated_at = excluded.updated_at;

insert into connector_capabilities (id, connector_id, capability_key, direction, is_enabled, requires_approval, is_idempotent, rate_limit_per_minute)
values
  ('cc_shopify_orders', 'conn_shopify', 'orders', 'read', true, false, true, 120),
  ('cc_shopify_returns', 'conn_shopify', 'returns', 'read', true, false, true, 120),
  ('cc_stripe_payments', 'conn_stripe', 'payments', 'read', true, false, true, 180),
  ('cc_stripe_refunds', 'conn_stripe', 'refunds', 'write', true, true, true, 90),
  ('cc_intercom_threads', 'conn_intercom', 'threads', 'read', true, false, true, 240),
  ('cc_oms_orders', 'conn_oms', 'orders', 'read', true, false, true, 240),
  ('cc_oms_fulfillment', 'conn_oms', 'fulfillment', 'write', true, false, true, 180),
  ('cc_wms_receipts', 'conn_wms', 'receipts', 'write', true, false, true, 180),
  ('cc_logistics_tracking', 'conn_logistics', 'tracking', 'read', true, false, true, 180)
on conflict (id) do update set
  connector_id = excluded.connector_id,
  capability_key = excluded.capability_key,
  direction = excluded.direction,
  is_enabled = excluded.is_enabled,
  requires_approval = excluded.requires_approval,
  is_idempotent = excluded.is_idempotent,
  rate_limit_per_minute = excluded.rate_limit_per_minute;

insert into agents (id, tenant_id, name, slug, category, description, is_system, is_locked, is_active, current_version_id, created_at, updated_at)
values
  ('agent_copilot', 'org_default', 'Copilot', 'copilot', 'orchestration', 'Primary support copilot for the demo tenant.', true, false, true, null, timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 12:33:00+00'),
  ('agent_refunds', 'org_default', 'Refunds Agent', 'refunds-agent', 'specialist', 'Handles refund approvals and clearance checks.', false, false, true, null, timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 12:33:00+00'),
  ('agent_supervisor', 'org_default', 'Supervisor', 'supervisor', 'orchestration', 'Orchestrates the overall agent flow.', true, true, true, null, timestamp '2026-04-15 12:33:10+00', timestamp '2026-04-15 12:33:10+00'),
  ('agent_approval_gatekeeper', 'org_default', 'Approval Gatekeeper', 'approval-gatekeeper', 'policy', 'Determines whether actions require manual review.', true, false, true, null, timestamp '2026-04-15 12:33:20+00', timestamp '2026-04-15 12:33:20+00'),
  ('agent_qa_policy_check', 'org_default', 'QA / Policy Check', 'qa-policy-check', 'policy', 'Checks policies and quality thresholds before actions proceed.', true, false, true, null, timestamp '2026-04-15 12:33:30+00', timestamp '2026-04-15 12:33:30+00'),
  ('agent_channel_ingest', 'org_default', 'Channel Ingest', 'channel-ingest', 'ingest', 'Ingests messages from web chat, email, and messaging channels.', true, false, true, null, timestamp '2026-04-15 12:33:40+00', timestamp '2026-04-15 12:33:40+00'),
  ('agent_canonicalizer', 'org_default', 'Canonicalizer', 'canonicalizer', 'ingest', 'Normalizes cross-system payloads into canonical state.', true, false, true, null, timestamp '2026-04-15 12:33:50+00', timestamp '2026-04-15 12:33:50+00'),
  ('agent_intent_router', 'org_default', 'Intent Router', 'intent-router', 'ingest', 'Routes inbound intent to the correct agent and case flow.', true, false, true, null, timestamp '2026-04-15 12:34:00+00', timestamp '2026-04-15 12:34:00+00'),
  ('agent_shopify_connector', 'org_default', 'Shopify Connector', 'shopify-connector', 'connector', 'Connector agent for Shopify order and return data.', false, false, true, null, timestamp '2026-04-15 12:34:10+00', timestamp '2026-04-15 12:34:10+00'),
  ('agent_stripe_connector', 'org_default', 'Stripe Connector', 'stripe-connector', 'connector', 'Connector agent for Stripe payment and refund data.', false, false, true, null, timestamp '2026-04-15 12:34:20+00', timestamp '2026-04-15 12:34:20+00'),
  ('agent_oms_erp', 'org_default', 'OMS / ERP', 'oms-erp', 'connector', 'Keeps OMS and ERP order state aligned.', false, false, true, null, timestamp '2026-04-15 12:34:30+00', timestamp '2026-04-15 12:34:30+00'),
  ('agent_returns_specialist', 'org_default', 'Returns Specialist', 'returns-specialist', 'specialist', 'Handles return inspection, approval, and refund timing.', false, false, true, null, timestamp '2026-04-15 12:34:40+00', timestamp '2026-04-15 12:34:40+00'),
  ('agent_logistics_tracking', 'org_default', 'Logistics Tracking', 'logistics-tracking', 'connector', 'Tracks warehouse and carrier events for shipments.', false, false, true, null, timestamp '2026-04-15 12:34:50+00', timestamp '2026-04-15 12:34:50+00')
on conflict (id) do update set
  tenant_id = excluded.tenant_id,
  name = excluded.name,
  slug = excluded.slug,
  category = excluded.category,
  description = excluded.description,
  is_system = excluded.is_system,
  is_locked = excluded.is_locked,
  is_active = excluded.is_active,
  updated_at = excluded.updated_at;

insert into agent_versions (
  id, agent_id, version_number, status, permission_profile, reasoning_profile, safety_profile, knowledge_profile, capabilities, rollout_percentage,
  published_by, published_at, changelog, tenant_id
)
values
  ('agv_copilot_v1', 'agent_copilot', 1, 'published', jsonb_build_object('actions', jsonb_build_array('reply', 'summarize', 'escalate'), 'scope', 'case'), jsonb_build_object('mode', 'balanced', 'depth', 'standard'), jsonb_build_object('risk', 'medium', 'autostop', true), jsonb_build_object('domains', jsonb_build_array('refunds', 'approvals', 'knowledge')), jsonb_build_object('streaming', true), 100, 'user_alex', timestamp '2026-04-15 12:35:00+00', 'Initial published copilot profile', 'org_default'),
  ('agv_refunds_v1', 'agent_refunds', 1, 'published', jsonb_build_object('actions', jsonb_build_array('review_refund', 'issue_refund', 'block_refund'), 'scope', 'payments'), jsonb_build_object('mode', 'thorough', 'depth', 'deep'), jsonb_build_object('risk', 'high', 'autostop', true), jsonb_build_object('domains', jsonb_build_array('refunds', 'chargebacks')), jsonb_build_object('streaming', true), 100, 'user_alex', timestamp '2026-04-15 12:35:10+00', 'Refund specialist profile', 'org_default'),
  ('agv_supervisor_v1', 'agent_supervisor', 1, 'published', jsonb_build_object('actions', jsonb_build_array('orchestrate', 'prioritize', 'pause_flow'), 'scope', 'workspace'), jsonb_build_object('mode', 'balanced', 'depth', 'standard'), jsonb_build_object('risk', 'critical', 'autostop', true), jsonb_build_object('domains', jsonb_build_array('cases', 'workflow')), jsonb_build_object('streaming', true), 100, 'user_alex', timestamp '2026-04-15 12:35:20+00', 'Supervisor orchestration profile', 'org_default'),
  ('agv_approval_gatekeeper_v1', 'agent_approval_gatekeeper', 1, 'published', jsonb_build_object('actions', jsonb_build_array('approve', 'reject', 'route_for_approval'), 'scope', 'approvals'), jsonb_build_object('mode', 'balanced', 'depth', 'standard'), jsonb_build_object('risk', 'high', 'autostop', true), jsonb_build_object('domains', jsonb_build_array('approvals', 'policies')), jsonb_build_object('streaming', false), 100, 'user_alex', timestamp '2026-04-15 12:35:30+00', 'Approval gatekeeper profile', 'org_default'),
  ('agv_qa_policy_check_v1', 'agent_qa_policy_check', 1, 'published', jsonb_build_object('actions', jsonb_build_array('validate_policy', 'flag_conflict'), 'scope', 'knowledge'), jsonb_build_object('mode', 'thorough', 'depth', 'deep'), jsonb_build_object('risk', 'high', 'autostop', true), jsonb_build_object('domains', jsonb_build_array('knowledge', 'policies')), jsonb_build_object('streaming', false), 100, 'user_alex', timestamp '2026-04-15 12:35:40+00', 'Policy QA profile', 'org_default'),
  ('agv_channel_ingest_v1', 'agent_channel_ingest', 1, 'published', jsonb_build_object('actions', jsonb_build_array('ingest', 'canonicalize'), 'scope', 'channels'), jsonb_build_object('mode', 'fast', 'depth', 'minimal'), jsonb_build_object('risk', 'low', 'autostop', false), jsonb_build_object('domains', jsonb_build_array('inbox', 'messages')), jsonb_build_object('streaming', true), 100, 'user_alex', timestamp '2026-04-15 12:35:50+00', 'Channel ingest profile', 'org_default'),
  ('agv_canonicalizer_v1', 'agent_canonicalizer', 1, 'published', jsonb_build_object('actions', jsonb_build_array('normalize', 'dedupe'), 'scope', 'data'), jsonb_build_object('mode', 'balanced', 'depth', 'standard'), jsonb_build_object('risk', 'medium', 'autostop', true), jsonb_build_object('domains', jsonb_build_array('cases', 'orders', 'payments', 'returns')), jsonb_build_object('streaming', false), 100, 'user_alex', timestamp '2026-04-15 12:36:00+00', 'Canonicalization profile', 'org_default'),
  ('agv_intent_router_v1', 'agent_intent_router', 1, 'published', jsonb_build_object('actions', jsonb_build_array('classify', 'route'), 'scope', 'routing'), jsonb_build_object('mode', 'fast', 'depth', 'minimal'), jsonb_build_object('risk', 'low', 'autostop', false), jsonb_build_object('domains', jsonb_build_array('inbox', 'cases')), jsonb_build_object('streaming', true), 100, 'user_alex', timestamp '2026-04-15 12:36:10+00', 'Intent routing profile', 'org_default'),
  ('agv_shopify_connector_v1', 'agent_shopify_connector', 1, 'published', jsonb_build_object('actions', jsonb_build_array('read_orders', 'read_returns'), 'scope', 'shopify'), jsonb_build_object('mode', 'fast', 'depth', 'minimal'), jsonb_build_object('risk', 'medium', 'autostop', false), jsonb_build_object('domains', jsonb_build_array('orders', 'returns', 'integrations')), jsonb_build_object('streaming', true), 100, 'user_alex', timestamp '2026-04-15 12:36:20+00', 'Shopify connector profile', 'org_default'),
  ('agv_stripe_connector_v1', 'agent_stripe_connector', 1, 'published', jsonb_build_object('actions', jsonb_build_array('read_payments', 'read_refunds'), 'scope', 'stripe'), jsonb_build_object('mode', 'fast', 'depth', 'minimal'), jsonb_build_object('risk', 'medium', 'autostop', false), jsonb_build_object('domains', jsonb_build_array('payments', 'refunds', 'integrations')), jsonb_build_object('streaming', true), 100, 'user_alex', timestamp '2026-04-15 12:36:30+00', 'Stripe connector profile', 'org_default'),
  ('agv_oms_erp_v1', 'agent_oms_erp', 1, 'published', jsonb_build_object('actions', jsonb_build_array('read_orders', 'sync_fulfillment'), 'scope', 'oms'), jsonb_build_object('mode', 'balanced', 'depth', 'standard'), jsonb_build_object('risk', 'high', 'autostop', true), jsonb_build_object('domains', jsonb_build_array('orders', 'fulfillment', 'integrations')), jsonb_build_object('streaming', false), 100, 'user_alex', timestamp '2026-04-15 12:36:40+00', 'OMS / ERP connector profile', 'org_default'),
  ('agv_returns_specialist_v1', 'agent_returns_specialist', 1, 'published', jsonb_build_object('actions', jsonb_build_array('inspect_return', 'approve_replacement'), 'scope', 'returns'), jsonb_build_object('mode', 'balanced', 'depth', 'deep'), jsonb_build_object('risk', 'high', 'autostop', true), jsonb_build_object('domains', jsonb_build_array('returns', 'approvals', 'knowledge')), jsonb_build_object('streaming', true), 100, 'user_alex', timestamp '2026-04-15 12:36:50+00', 'Returns specialist profile', 'org_default'),
  ('agv_logistics_tracking_v1', 'agent_logistics_tracking', 1, 'published', jsonb_build_object('actions', jsonb_build_array('read_tracking', 'compare_scan'), 'scope', 'logistics'), jsonb_build_object('mode', 'fast', 'depth', 'minimal'), jsonb_build_object('risk', 'medium', 'autostop', false), jsonb_build_object('domains', jsonb_build_array('orders', 'returns', 'integrations')), jsonb_build_object('streaming', true), 100, 'user_alex', timestamp '2026-04-15 12:37:00+00', 'Logistics tracking profile', 'org_default')
on conflict (id) do update set
  agent_id = excluded.agent_id,
  version_number = excluded.version_number,
  status = excluded.status,
  permission_profile = excluded.permission_profile,
  reasoning_profile = excluded.reasoning_profile,
  safety_profile = excluded.safety_profile,
  knowledge_profile = excluded.knowledge_profile,
  capabilities = excluded.capabilities,
  rollout_percentage = excluded.rollout_percentage,
  published_by = excluded.published_by,
  published_at = excluded.published_at,
  changelog = excluded.changelog,
  tenant_id = excluded.tenant_id;

update agents
set current_version_id = case id
  when 'agent_copilot' then 'agv_copilot_v1'
  when 'agent_refunds' then 'agv_refunds_v1'
  when 'agent_supervisor' then 'agv_supervisor_v1'
  when 'agent_approval_gatekeeper' then 'agv_approval_gatekeeper_v1'
  when 'agent_qa_policy_check' then 'agv_qa_policy_check_v1'
  when 'agent_channel_ingest' then 'agv_channel_ingest_v1'
  when 'agent_canonicalizer' then 'agv_canonicalizer_v1'
  when 'agent_intent_router' then 'agv_intent_router_v1'
  when 'agent_shopify_connector' then 'agv_shopify_connector_v1'
  when 'agent_stripe_connector' then 'agv_stripe_connector_v1'
  when 'agent_oms_erp' then 'agv_oms_erp_v1'
  when 'agent_returns_specialist' then 'agv_returns_specialist_v1'
  when 'agent_logistics_tracking' then 'agv_logistics_tracking_v1'
  else current_version_id
end
where id in (
  'agent_copilot',
  'agent_refunds',
  'agent_supervisor',
  'agent_approval_gatekeeper',
  'agent_qa_policy_check',
  'agent_channel_ingest',
  'agent_canonicalizer',
  'agent_intent_router',
  'agent_shopify_connector',
  'agent_stripe_connector',
  'agent_oms_erp',
  'agent_returns_specialist',
  'agent_logistics_tracking'
);

insert into refunds (
  id, external_refund_id, payment_id, order_id, customer_id, tenant_id, amount, currency, type, status, reason,
  initiated_by, initiated_by_type, approval_request_id, idempotency_key, created_at, updated_at
)
values
  ('refund_001', 'rf_001', 'pay_001', 'order_001', 'cust_sarah', 'org_default', 129.00, 'USD', 'full', 'settled', 'Bank clearance completed', 'copilot', 'agent', 'apr_001', 'refund-pay-001', timestamp '2026-04-15 12:05:00+00', timestamp '2026-04-15 12:10:00+00'),
  ('refund_002', 'rf_002', 'pay_005', 'order_005', 'cust_marcus', 'org_default', 109.00, 'USD', 'full', 'pending', 'Cancellation awaiting warehouse confirmation', 'copilot', 'agent', 'apr_002', 'refund-pay-005', timestamp '2026-04-15 10:55:00+00', timestamp '2026-04-15 10:55:00+00'),
  ('refund_003', 'rf_003', 'pay_003', 'order_003', 'cust_sarah', 'org_default', 129.00, 'USD', 'full', 'refunded', 'Duplicate capture corrected', 'system', 'system', null, 'refund-pay-003', timestamp '2026-04-15 12:00:00+00', timestamp '2026-04-15 12:00:00+00'),
  ('refund_004', 'rf_004', 'pay_004', 'order_004', 'cust_sarah', 'org_default', 64.00, 'USD', 'full', 'blocked', 'Chargeback dispute still open', 'risk-engine', 'system', 'apr_003', 'refund-pay-004', timestamp '2026-04-15 11:45:00+00', timestamp '2026-04-15 11:45:00+00'),
  ('refund_005', 'rf_005', 'pay_006', 'order_006', 'cust_elena', 'org_default', 249.00, 'USD', 'full', 'settled', 'Replacement return processed', 'copilot', 'agent', null, 'refund-pay-006', timestamp '2026-04-15 12:05:00+00', timestamp '2026-04-15 12:05:00+00'),
  ('refund_006', 'rf_006', 'pay_007', 'order_007', 'cust_elena', 'org_default', 340.00, 'USD', 'full', 'blocked', 'Fraud hold applied by risk engine', 'risk-engine', 'system', 'apr_004', 'refund-pay-007', timestamp '2026-04-15 10:35:00+00', timestamp '2026-04-15 10:35:00+00'),
  ('refund_007', 'rf_007', 'pay_008', 'order_008', 'cust_elena', 'org_default', 159.00, 'USD', 'full', 'pending', 'Replacement approval pending warehouse scan', 'copilot', 'agent', 'apr_005', 'refund-pay-008', timestamp '2026-04-15 12:18:00+00', timestamp '2026-04-15 12:18:00+00')
on conflict (id) do update set
  external_refund_id = excluded.external_refund_id,
  payment_id = excluded.payment_id,
  order_id = excluded.order_id,
  customer_id = excluded.customer_id,
  tenant_id = excluded.tenant_id,
  amount = excluded.amount,
  currency = excluded.currency,
  type = excluded.type,
  status = excluded.status,
  reason = excluded.reason,
  initiated_by = excluded.initiated_by,
  initiated_by_type = excluded.initiated_by_type,
  approval_request_id = excluded.approval_request_id,
  idempotency_key = excluded.idempotency_key,
  updated_at = excluded.updated_at;

update payments
set
  refund_ids = case id
    when 'pay_001' then jsonb_build_array('refund_001')
    when 'pay_003' then jsonb_build_array('refund_003')
    when 'pay_004' then jsonb_build_array('refund_004')
    when 'pay_005' then jsonb_build_array('refund_002')
    when 'pay_006' then jsonb_build_array('refund_005')
    when 'pay_007' then jsonb_build_array('refund_006')
    when 'pay_008' then jsonb_build_array('refund_007')
    else refund_ids
  end,
  refund_amount = case id
    when 'pay_001' then 129.00
    when 'pay_003' then 129.00
    when 'pay_004' then 64.00
    when 'pay_005' then 109.00
    when 'pay_006' then 249.00
    when 'pay_007' then 340.00
    when 'pay_008' then 159.00
    else refund_amount
  end,
  refund_type = case id
    when 'pay_001' then 'full'
    when 'pay_003' then 'full'
    when 'pay_004' then 'full'
    when 'pay_005' then 'full'
    when 'pay_006' then 'full'
    when 'pay_007' then 'full'
    when 'pay_008' then 'full'
    else refund_type
  end,
  updated_at = timestamp '2026-04-15 12:38:00+00'
where id in ('pay_001', 'pay_003', 'pay_004', 'pay_005', 'pay_006', 'pay_007', 'pay_008');

update returns
set linked_refund_id = case id
  when 'return_001' then 'refund_001'
  when 'return_002' then 'refund_003'
  when 'return_003' then 'refund_002'
  when 'return_004' then 'refund_006'
  when 'return_005' then 'refund_005'
  when 'return_006' then 'refund_007'
  else linked_refund_id
end,
updated_at = timestamp '2026-04-15 12:38:10+00'
where id in ('return_001', 'return_002', 'return_003', 'return_004', 'return_005', 'return_006');

insert into workflow_definitions (id, tenant_id, workspace_id, name, description, current_version_id, created_by, created_at, updated_at)
values
  ('wfd_refund_ops', 'org_default', 'ws_default', 'Refund Operations', 'Refund, bank clearance, and dispute handling workflow.', null, 'user_alex', timestamp '2026-04-15 12:39:00+00', timestamp '2026-04-15 12:39:00+00'),
  ('wfd_replacement_ops', 'org_default', 'ws_default', 'Replacement Operations', 'Replacement and warehouse confirmation workflow.', null, 'user_alex', timestamp '2026-04-15 12:39:10+00', timestamp '2026-04-15 12:39:10+00'),
  ('wfd_connector_watch', 'org_default', 'ws_default', 'Connector Watch', 'Integration health and data sync validation workflow.', null, 'user_alex', timestamp '2026-04-15 12:39:20+00', timestamp '2026-04-15 12:39:20+00')
on conflict (id) do update set
  tenant_id = excluded.tenant_id,
  workspace_id = excluded.workspace_id,
  name = excluded.name,
  description = excluded.description,
  created_by = excluded.created_by,
  updated_at = excluded.updated_at;

insert into workflow_versions (id, workflow_id, version_number, status, nodes, edges, trigger, published_by, published_at, tenant_id)
values
  (
    'wfv_refund_ops_v1', 'wfd_refund_ops', 1, 'published',
    jsonb_build_array(
      jsonb_build_object('id', 'trigger', 'type', 'trigger', 'label', 'Refund trigger'),
      jsonb_build_object('id', 'check_psp', 'type', 'task', 'label', 'Check PSP'),
      jsonb_build_object('id', 'reconcile_oms', 'type', 'task', 'label', 'Reconcile OMS'),
      jsonb_build_object('id', 'approve_or_hold', 'type', 'approval', 'label', 'Approve or hold'),
      jsonb_build_object('id', 'notify_customer', 'type', 'task', 'label', 'Notify customer'),
      jsonb_build_object('id', 'close_case', 'type', 'task', 'label', 'Close case')
    ),
    jsonb_build_array(
      jsonb_build_object('source', 'trigger', 'target', 'check_psp'),
      jsonb_build_object('source', 'check_psp', 'target', 'reconcile_oms'),
      jsonb_build_object('source', 'reconcile_oms', 'target', 'approve_or_hold'),
      jsonb_build_object('source', 'approve_or_hold', 'target', 'notify_customer'),
      jsonb_build_object('source', 'notify_customer', 'target', 'close_case')
    ),
    jsonb_build_object('event', 'case_created', 'domain', 'refunds'),
    'user_alex', timestamp '2026-04-15 12:39:30+00', 'org_default'
  ),
  (
    'wfv_replacement_ops_v1', 'wfd_replacement_ops', 1, 'published',
    jsonb_build_array(
      jsonb_build_object('id', 'trigger', 'type', 'trigger', 'label', 'Replacement trigger'),
      jsonb_build_object('id', 'verify_return', 'type', 'task', 'label', 'Verify return'),
      jsonb_build_object('id', 'wait_warehouse', 'type', 'task', 'label', 'Wait warehouse scan'),
      jsonb_build_object('id', 'approve_replacement', 'type', 'approval', 'label', 'Approve replacement'),
      jsonb_build_object('id', 'notify_customer', 'type', 'task', 'label', 'Notify customer')
    ),
    jsonb_build_array(
      jsonb_build_object('source', 'trigger', 'target', 'verify_return'),
      jsonb_build_object('source', 'verify_return', 'target', 'wait_warehouse'),
      jsonb_build_object('source', 'wait_warehouse', 'target', 'approve_replacement'),
      jsonb_build_object('source', 'approve_replacement', 'target', 'notify_customer')
    ),
    jsonb_build_object('event', 'return_received', 'domain', 'returns'),
    'user_alex', timestamp '2026-04-15 12:39:40+00', 'org_default'
  ),
  (
    'wfv_connector_watch_v1', 'wfd_connector_watch', 1, 'published',
    jsonb_build_array(
      jsonb_build_object('id', 'trigger', 'type', 'trigger', 'label', 'Connector trigger'),
      jsonb_build_object('id', 'poll_shopify', 'type', 'task', 'label', 'Poll Shopify'),
      jsonb_build_object('id', 'poll_stripe', 'type', 'task', 'label', 'Poll Stripe'),
      jsonb_build_object('id', 'compare_states', 'type', 'task', 'label', 'Compare states'),
      jsonb_build_object('id', 'raise_issue', 'type', 'task', 'label', 'Raise issue')
    ),
    jsonb_build_array(
      jsonb_build_object('source', 'trigger', 'target', 'poll_shopify'),
      jsonb_build_object('source', 'poll_shopify', 'target', 'poll_stripe'),
      jsonb_build_object('source', 'poll_stripe', 'target', 'compare_states'),
      jsonb_build_object('source', 'compare_states', 'target', 'raise_issue')
    ),
    jsonb_build_object('event', 'connector_sync', 'domain', 'integrations'),
    'user_alex', timestamp '2026-04-15 12:39:50+00', 'org_default'
  )
on conflict (id) do update set
  workflow_id = excluded.workflow_id,
  version_number = excluded.version_number,
  status = excluded.status,
  nodes = excluded.nodes,
  edges = excluded.edges,
  trigger = excluded.trigger,
  published_by = excluded.published_by,
  published_at = excluded.published_at,
  tenant_id = excluded.tenant_id;

update workflow_definitions
set current_version_id = case id
  when 'wfd_refund_ops' then 'wfv_refund_ops_v1'
  when 'wfd_replacement_ops' then 'wfv_replacement_ops_v1'
  when 'wfd_connector_watch' then 'wfv_connector_watch_v1'
  else current_version_id
end
where id in ('wfd_refund_ops', 'wfd_replacement_ops', 'wfd_connector_watch');

insert into workflow_runs (id, workflow_version_id, case_id, tenant_id, trigger_type, trigger_payload, status, current_node_id, context, started_at, ended_at, error)
values
  ('wfr_001', 'wfv_refund_ops_v1', 'case_001', 'org_default', 'case_created', jsonb_build_object('case_id', 'case_001'), 'running', 'approve_or_hold', jsonb_build_object('refund_id', 'refund_001'), timestamp '2026-04-15 12:40:00+00', null, null),
  ('wfr_002', 'wfv_replacement_ops_v1', 'case_002', 'org_default', 'case_created', jsonb_build_object('case_id', 'case_002'), 'running', 'wait_warehouse', jsonb_build_object('return_id', 'return_003'), timestamp '2026-04-15 12:40:10+00', null, null),
  ('wfr_003', 'wfv_connector_watch_v1', 'case_003', 'org_default', 'manual', jsonb_build_object('case_id', 'case_003'), 'blocked', 'compare_states', jsonb_build_object('connector', 'stripe'), timestamp '2026-04-15 12:40:20+00', timestamp '2026-04-15 12:41:00+00', 'Stripe and OMS disagree on refund state'),
  ('wfr_004', 'wfv_replacement_ops_v1', 'case_004', 'org_default', 'case_created', jsonb_build_object('case_id', 'case_004'), 'running', 'approve_replacement', jsonb_build_object('return_id', 'return_006'), timestamp '2026-04-15 12:40:30+00', null, null)
on conflict (id) do update set
  workflow_version_id = excluded.workflow_version_id,
  case_id = excluded.case_id,
  tenant_id = excluded.tenant_id,
  trigger_type = excluded.trigger_type,
  trigger_payload = excluded.trigger_payload,
  status = excluded.status,
  current_node_id = excluded.current_node_id,
  context = excluded.context,
  started_at = excluded.started_at,
  ended_at = excluded.ended_at,
  error = excluded.error;

commit;
