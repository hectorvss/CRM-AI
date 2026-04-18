begin;

-- Keep Supabase aligned with the code catalog before demo timeline data writes
-- agent_runs. Legacy rows are retained for history but no longer active.

with catalog (
  id,
  slug,
  name,
  description,
  category,
  is_system,
  is_locked,
  runtime_kind,
  implementation_mode,
  model_tier,
  sort_order
) as (
  values
    ('agent_supervisor', 'supervisor', 'Supervisor', 'Orchestrates the overall agent flow.', 'orchestration', true, true, 'system', 'delegated', 'none', 10),
    ('agent_approval_gk', 'approval-gatekeeper', 'Approval Gatekeeper', 'Handles human approval requirements for high-risk actions.', 'orchestration', true, false, 'llm', 'implemented', 'basic', 20),
    ('agent_qa', 'qa-policy-check', 'QA / Policy Check', 'Performs pre-send / pre-execution safety, policy, and quality validation.', 'orchestration', true, false, 'llm', 'implemented', 'basic', 30),
    ('agent_channel_ingest', 'channel-ingest', 'Channel Ingest', 'Receives inbound channel events and converts them into normalized intake events.', 'ingest_intelligence', true, false, 'pipeline', 'delegated', 'none', 40),
    ('agent_canonicalizer', 'canonicalizer', 'Canonicalizer', 'Normalizes entities, fields, and event structure.', 'ingest_intelligence', true, false, 'pipeline', 'delegated', 'none', 50),
    ('agent_intent_router', 'intent-router', 'Intent Router', 'Classifies the task and routes it to the correct next agent.', 'ingest_intelligence', true, false, 'llm', 'implemented', 'basic', 60),
    ('agent_knowledge', 'knowledge-retriever', 'Knowledge Retriever', 'Fetches relevant policies, SOPs, and operational guidance.', 'ingest_intelligence', true, false, 'llm', 'implemented', 'basic', 70),
    ('agent_composer', 'composer-translator', 'Composer + Translator', 'Drafts and localizes internal and customer-facing messages.', 'ingest_intelligence', true, false, 'llm', 'implemented', 'advanced', 80),
    ('agent_reconciliation', 'reconciliation-agent', 'Reconciliation Agent', 'Detects contradictions across systems.', 'resolution_reconciliation', true, true, 'system', 'delegated', 'none', 90),
    ('agent_case_resolution', 'case-resolution-planner', 'Case Resolution Planner', 'Converts detected contradictions into resolution plans.', 'resolution_reconciliation', true, false, 'system', 'stub', 'advanced', 100),
    ('agent_executor', 'resolution-executor', 'Resolution Executor', 'Executes the approved external/system-facing resolution steps.', 'resolution_reconciliation', true, false, 'system', 'delegated', 'none', 110),
    ('agent_workflow_runtime', 'workflow-runtime-agent', 'Workflow Runtime Agent', 'Manages internal workflow progression after reconciliation and execution.', 'resolution_reconciliation', true, false, 'system', 'implemented', 'none', 120),
    ('agent_identity_mapping', 'identity-mapping-agent', 'Identity Mapping Agent', 'Resolves entity and identity links across systems.', 'identity_customer_truth', true, false, 'llm', 'implemented', 'basic', 130),
    ('agent_customer_identity', 'customer-identity-agent', 'CRM / Customer Identity Agent', 'Provides canonical customer truth from CRM/identity source.', 'identity_customer_truth', true, false, 'llm', 'implemented', 'basic', 140),
    ('agent_helpdesk', 'helpdesk-agent', 'Helpdesk Agent', 'Reads/writes tickets, tags, notes, and support metadata in the helpdesk system.', 'system_tool', true, false, 'connector', 'implemented', 'none', 150),
    ('agent_stripe', 'stripe-connector', 'Stripe Connector', 'Reads and updates payment, refund, dispute, and subscription state in Stripe.', 'system_tool', true, false, 'connector', 'implemented', 'none', 160),
    ('agent_shopify', 'shopify-connector', 'Shopify Connector', 'Reads and updates order, customer, and commerce state in Shopify.', 'system_tool', true, false, 'connector', 'implemented', 'none', 170),
    ('agent_oms_erp', 'oms-erp-agent', 'OMS / ERP Agent', 'Handles back-office order/refund/return records in OMS/ERP.', 'system_tool', true, false, 'connector', 'implemented', 'none', 180),
    ('agent_returns', 'returns-agent', 'Returns Agent', 'Handles return lifecycle state, block/unblock logic, label/inspection/restock progression.', 'system_tool', true, false, 'system', 'implemented', 'none', 190),
    ('agent_subscription', 'subscription-agent', 'Recharge / Subscription Agent', 'Handles subscription/renewal/charge state for subscription commerce.', 'system_tool', true, false, 'connector', 'implemented', 'none', 200),
    ('agent_logistics', 'logistics-tracking-agent', 'Logistics / Tracking Agent', 'Handles shipment/tracking/address-related logistics signals.', 'system_tool', true, false, 'connector', 'implemented', 'none', 210),
    ('agent_sla_escalation', 'sla-escalation-agent', 'SLA & Escalation Agent', 'Monitors aging cases, stalled resolutions, delayed approvals, and blocked flows.', 'observability_communication', true, false, 'system', 'implemented', 'none', 220),
    ('agent_customer_communication', 'customer-communication-agent', 'Customer Communication Agent', 'Decides when customer-facing communication should happen based on real reconciled operational state.', 'observability_communication', true, false, 'system', 'implemented', 'none', 230),
    ('agent_audit', 'audit-observability', 'Audit & Observability Agent', 'Records executions, failures, retries, overrides, and recurring contradictions.', 'observability_communication', true, true, 'system', 'implemented', 'none', 240)
)
insert into public.agents (
  id,
  tenant_id,
  name,
  slug,
  category,
  description,
  is_system,
  is_locked,
  is_active,
  current_version_id,
  created_at,
  updated_at
)
select
  id,
  'org_default',
  name,
  slug,
  category,
  description,
  is_system,
  is_locked,
  true,
  null,
  now(),
  now()
from catalog
on conflict (id) do update set
  tenant_id = excluded.tenant_id,
  name = excluded.name,
  slug = excluded.slug,
  category = excluded.category,
  description = excluded.description,
  is_system = excluded.is_system,
  is_locked = excluded.is_locked,
  is_active = excluded.is_active,
  current_version_id = excluded.current_version_id,
  updated_at = excluded.updated_at;

with catalog (
  id,
  slug,
  name,
  description,
  category,
  is_system,
  is_locked,
  runtime_kind,
  implementation_mode,
  model_tier,
  sort_order
) as (
  values
    ('agent_supervisor', 'supervisor', 'Supervisor', 'Orchestrates the overall agent flow.', 'orchestration', true, true, 'system', 'delegated', 'none', 10),
    ('agent_approval_gk', 'approval-gatekeeper', 'Approval Gatekeeper', 'Handles human approval requirements for high-risk actions.', 'orchestration', true, false, 'llm', 'implemented', 'basic', 20),
    ('agent_qa', 'qa-policy-check', 'QA / Policy Check', 'Performs pre-send / pre-execution safety, policy, and quality validation.', 'orchestration', true, false, 'llm', 'implemented', 'basic', 30),
    ('agent_channel_ingest', 'channel-ingest', 'Channel Ingest', 'Receives inbound channel events and converts them into normalized intake events.', 'ingest_intelligence', true, false, 'pipeline', 'delegated', 'none', 40),
    ('agent_canonicalizer', 'canonicalizer', 'Canonicalizer', 'Normalizes entities, fields, and event structure.', 'ingest_intelligence', true, false, 'pipeline', 'delegated', 'none', 50),
    ('agent_intent_router', 'intent-router', 'Intent Router', 'Classifies the task and routes it to the correct next agent.', 'ingest_intelligence', true, false, 'llm', 'implemented', 'basic', 60),
    ('agent_knowledge', 'knowledge-retriever', 'Knowledge Retriever', 'Fetches relevant policies, SOPs, and operational guidance.', 'ingest_intelligence', true, false, 'llm', 'implemented', 'basic', 70),
    ('agent_composer', 'composer-translator', 'Composer + Translator', 'Drafts and localizes internal and customer-facing messages.', 'ingest_intelligence', true, false, 'llm', 'implemented', 'advanced', 80),
    ('agent_reconciliation', 'reconciliation-agent', 'Reconciliation Agent', 'Detects contradictions across systems.', 'resolution_reconciliation', true, true, 'system', 'delegated', 'none', 90),
    ('agent_case_resolution', 'case-resolution-planner', 'Case Resolution Planner', 'Converts detected contradictions into resolution plans.', 'resolution_reconciliation', true, false, 'system', 'stub', 'advanced', 100),
    ('agent_executor', 'resolution-executor', 'Resolution Executor', 'Executes the approved external/system-facing resolution steps.', 'resolution_reconciliation', true, false, 'system', 'delegated', 'none', 110),
    ('agent_workflow_runtime', 'workflow-runtime-agent', 'Workflow Runtime Agent', 'Manages internal workflow progression after reconciliation and execution.', 'resolution_reconciliation', true, false, 'system', 'implemented', 'none', 120),
    ('agent_identity_mapping', 'identity-mapping-agent', 'Identity Mapping Agent', 'Resolves entity and identity links across systems.', 'identity_customer_truth', true, false, 'llm', 'implemented', 'basic', 130),
    ('agent_customer_identity', 'customer-identity-agent', 'CRM / Customer Identity Agent', 'Provides canonical customer truth from CRM/identity source.', 'identity_customer_truth', true, false, 'llm', 'implemented', 'basic', 140),
    ('agent_helpdesk', 'helpdesk-agent', 'Helpdesk Agent', 'Reads/writes tickets, tags, notes, and support metadata in the helpdesk system.', 'system_tool', true, false, 'connector', 'implemented', 'none', 150),
    ('agent_stripe', 'stripe-connector', 'Stripe Connector', 'Reads and updates payment, refund, dispute, and subscription state in Stripe.', 'system_tool', true, false, 'connector', 'implemented', 'none', 160),
    ('agent_shopify', 'shopify-connector', 'Shopify Connector', 'Reads and updates order, customer, and commerce state in Shopify.', 'system_tool', true, false, 'connector', 'implemented', 'none', 170),
    ('agent_oms_erp', 'oms-erp-agent', 'OMS / ERP Agent', 'Handles back-office order/refund/return records in OMS/ERP.', 'system_tool', true, false, 'connector', 'implemented', 'none', 180),
    ('agent_returns', 'returns-agent', 'Returns Agent', 'Handles return lifecycle state, block/unblock logic, label/inspection/restock progression.', 'system_tool', true, false, 'system', 'implemented', 'none', 190),
    ('agent_subscription', 'subscription-agent', 'Recharge / Subscription Agent', 'Handles subscription/renewal/charge state for subscription commerce.', 'system_tool', true, false, 'connector', 'implemented', 'none', 200),
    ('agent_logistics', 'logistics-tracking-agent', 'Logistics / Tracking Agent', 'Handles shipment/tracking/address-related logistics signals.', 'system_tool', true, false, 'connector', 'implemented', 'none', 210),
    ('agent_sla_escalation', 'sla-escalation-agent', 'SLA & Escalation Agent', 'Monitors aging cases, stalled resolutions, delayed approvals, and blocked flows.', 'observability_communication', true, false, 'system', 'implemented', 'none', 220),
    ('agent_customer_communication', 'customer-communication-agent', 'Customer Communication Agent', 'Decides when customer-facing communication should happen based on real reconciled operational state.', 'observability_communication', true, false, 'system', 'implemented', 'none', 230),
    ('agent_audit', 'audit-observability', 'Audit & Observability Agent', 'Records executions, failures, retries, overrides, and recurring contradictions.', 'observability_communication', true, true, 'system', 'implemented', 'none', 240)
)
insert into public.agent_versions (
  id,
  agent_id,
  version_number,
  status,
  permission_profile,
  reasoning_profile,
  safety_profile,
  knowledge_profile,
  capabilities,
  rollout_percentage,
  published_by,
  published_at,
  changelog,
  tenant_id
)
select
  id || '_v1',
  id,
  1,
  'published',
  jsonb_build_object(
    'canCallShopify', slug in ('supervisor', 'shopify-connector', 'reconciliation-agent', 'case-resolution-planner', 'resolution-executor', 'returns-agent'),
    'canCallStripe', slug in ('supervisor', 'stripe-connector', 'reconciliation-agent', 'case-resolution-planner', 'resolution-executor', 'returns-agent'),
    'canSendMessages', slug in ('supervisor', 'composer-translator', 'customer-communication-agent', 'case-resolution-planner', 'resolution-executor'),
    'canIssueRefunds', slug in ('supervisor', 'stripe-connector', 'reconciliation-agent', 'case-resolution-planner', 'resolution-executor', 'returns-agent'),
    'canModifyCase', true,
    'canRequestApproval', runtime_kind = 'llm' or category = 'resolution_reconciliation' or slug = 'supervisor',
    'canWriteAuditLog', true,
    'maxAutonomousRefundAmount', case when slug = 'supervisor' then 500 when slug in ('stripe-connector', 'shopify-connector', 'reconciliation-agent', 'case-resolution-planner', 'resolution-executor', 'returns-agent') then 50 else 0 end
  ),
  jsonb_build_object(
    'model', case when model_tier = 'none' then null when model_tier = 'advanced' then 'gemini-3.1-pro-preview' else 'gemini-2.5-pro' end,
    'temperature', case when slug = 'composer-translator' then 0.4 when model_tier = 'none' then 0 else 0.2 end,
    'maxOutputTokens', case when model_tier = 'advanced' then 4096 when model_tier = 'basic' then 2048 else 0 end,
    'useJsonMode', model_tier <> 'none'
  ),
  jsonb_build_object(
    'requiresHumanApproval', slug in ('supervisor', 'resolution-executor', 'stripe-connector'),
    'maxConsecutiveFailures', case when slug in ('supervisor', 'resolution-executor', 'stripe-connector') then 2 when runtime_kind = 'llm' or category = 'resolution_reconciliation' then 3 else 5 end,
    'minConfidenceThreshold', case when slug in ('supervisor', 'resolution-executor', 'stripe-connector') then 0.8 when runtime_kind = 'llm' or category = 'resolution_reconciliation' then 0.7 else 0.5 end,
    'staleSilenceAlertHours', case when slug in ('supervisor', 'resolution-executor', 'stripe-connector') then 6 when runtime_kind = 'llm' or category = 'resolution_reconciliation' then 12 else 24 end,
    'alwaysApproveActions', case
      when slug in ('supervisor', 'resolution-executor', 'stripe-connector') then jsonb_build_array('issue_refund', 'cancel_order', 'block_customer', 'send_external_message')
      when runtime_kind = 'llm' or category = 'resolution_reconciliation' then jsonb_build_array('issue_refund', 'cancel_order')
      else jsonb_build_array()
    end
  ),
  jsonb_build_object('retrieval', runtime_kind = 'llm'),
  jsonb_build_object(
    'runtimeKind', runtime_kind,
    'implementationMode', implementation_mode,
    'modelTier', model_tier,
    'sortOrder', sort_order
  ),
  100,
  'catalog-alignment',
  now(),
  'Catalog-aligned published profile',
  'org_default'
from catalog
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

with catalog (id, slug) as (
  values
    ('agent_supervisor', 'supervisor'),
    ('agent_approval_gk', 'approval-gatekeeper'),
    ('agent_qa', 'qa-policy-check'),
    ('agent_channel_ingest', 'channel-ingest'),
    ('agent_canonicalizer', 'canonicalizer'),
    ('agent_intent_router', 'intent-router'),
    ('agent_knowledge', 'knowledge-retriever'),
    ('agent_composer', 'composer-translator'),
    ('agent_reconciliation', 'reconciliation-agent'),
    ('agent_case_resolution', 'case-resolution-planner'),
    ('agent_executor', 'resolution-executor'),
    ('agent_workflow_runtime', 'workflow-runtime-agent'),
    ('agent_identity_mapping', 'identity-mapping-agent'),
    ('agent_customer_identity', 'customer-identity-agent'),
    ('agent_helpdesk', 'helpdesk-agent'),
    ('agent_stripe', 'stripe-connector'),
    ('agent_shopify', 'shopify-connector'),
    ('agent_oms_erp', 'oms-erp-agent'),
    ('agent_returns', 'returns-agent'),
    ('agent_subscription', 'subscription-agent'),
    ('agent_logistics', 'logistics-tracking-agent'),
    ('agent_sla_escalation', 'sla-escalation-agent'),
    ('agent_customer_communication', 'customer-communication-agent'),
    ('agent_audit', 'audit-observability')
)
update public.agents agent
set current_version_id = catalog.id || '_v1',
    is_active = true,
    updated_at = now()
from catalog
where agent.id = catalog.id
  and agent.tenant_id = 'org_default';

with catalog (id, slug) as (
  values
    ('agent_supervisor', 'supervisor'),
    ('agent_approval_gk', 'approval-gatekeeper'),
    ('agent_qa', 'qa-policy-check'),
    ('agent_channel_ingest', 'channel-ingest'),
    ('agent_canonicalizer', 'canonicalizer'),
    ('agent_intent_router', 'intent-router'),
    ('agent_knowledge', 'knowledge-retriever'),
    ('agent_composer', 'composer-translator'),
    ('agent_reconciliation', 'reconciliation-agent'),
    ('agent_case_resolution', 'case-resolution-planner'),
    ('agent_executor', 'resolution-executor'),
    ('agent_workflow_runtime', 'workflow-runtime-agent'),
    ('agent_identity_mapping', 'identity-mapping-agent'),
    ('agent_customer_identity', 'customer-identity-agent'),
    ('agent_helpdesk', 'helpdesk-agent'),
    ('agent_stripe', 'stripe-connector'),
    ('agent_shopify', 'shopify-connector'),
    ('agent_oms_erp', 'oms-erp-agent'),
    ('agent_returns', 'returns-agent'),
    ('agent_subscription', 'subscription-agent'),
    ('agent_logistics', 'logistics-tracking-agent'),
    ('agent_sla_escalation', 'sla-escalation-agent'),
    ('agent_customer_communication', 'customer-communication-agent'),
    ('agent_audit', 'audit-observability')
)
update public.agents agent
set is_active = false,
    updated_at = now()
from catalog
where agent.tenant_id = 'org_default'
  and agent.slug = catalog.slug
  and agent.id <> catalog.id;

with catalog (slug) as (
  values
    ('supervisor'),
    ('approval-gatekeeper'),
    ('qa-policy-check'),
    ('channel-ingest'),
    ('canonicalizer'),
    ('intent-router'),
    ('knowledge-retriever'),
    ('composer-translator'),
    ('reconciliation-agent'),
    ('case-resolution-planner'),
    ('resolution-executor'),
    ('workflow-runtime-agent'),
    ('identity-mapping-agent'),
    ('customer-identity-agent'),
    ('helpdesk-agent'),
    ('stripe-connector'),
    ('shopify-connector'),
    ('oms-erp-agent'),
    ('returns-agent'),
    ('subscription-agent'),
    ('logistics-tracking-agent'),
    ('sla-escalation-agent'),
    ('customer-communication-agent'),
    ('audit-observability')
)
update public.agents agent
set is_active = false,
    updated_at = now()
where agent.tenant_id = 'org_default'
  and not exists (select 1 from catalog where catalog.slug = agent.slug);

update public.agent_versions
set reasoning_profile = jsonb_set(reasoning_profile, '{model}', '"gemini-2.5-pro"', false)
where tenant_id = 'org_default'
  and reasoning_profile ->> 'model' = 'gemini-2.0-flash';

commit;
