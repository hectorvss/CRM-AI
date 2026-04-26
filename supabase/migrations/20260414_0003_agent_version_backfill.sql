begin;

-- Backfill missing published versions for agents that were present in the
-- catalog but still had no current_version_id in Supabase.

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
values
  (
    'agent_fraud_detect_v1',
    'agent_fraud_detect',
    1,
    'published',
    '{"canCallShopify":false,"canCallStripe":true,"canSendMessages":false,"canIssueRefunds":false,"canModifyCase":true,"canRequestApproval":true,"canWriteAuditLog":true,"maxAutonomousRefundAmount":0}'::jsonb,
    '{"model":"gemini-2.5-pro","temperature":0.1,"maxOutputTokens":4096,"useJsonMode":true}'::jsonb,
    '{"requiresHumanApproval":true,"maxConsecutiveFailures":2,"minConfidenceThreshold":0.8,"staleSilenceAlertHours":6,"alwaysApproveActions":["issue_refund","cancel_order","block_customer","send_external_message"]}'::jsonb,
    '{}'::jsonb,
    '{"fraud_detection":true}'::jsonb,
    100,
    'supabase-backfill',
    now(),
    'Backfilled missing version for fraud detection agent',
    'tenant_1'
  ),
  (
    'agent_inventory_v1',
    'agent_inventory',
    1,
    'published',
    '{"canCallShopify":false,"canCallStripe":false,"canSendMessages":false,"canIssueRefunds":false,"canModifyCase":true,"canRequestApproval":true,"canWriteAuditLog":true,"maxAutonomousRefundAmount":0}'::jsonb,
    '{"model":"gemini-2.5-pro","temperature":0.2,"maxOutputTokens":2048,"useJsonMode":true}'::jsonb,
    '{"requiresHumanApproval":false,"maxConsecutiveFailures":5,"minConfidenceThreshold":0.5,"staleSilenceAlertHours":24,"alwaysApproveActions":[]}'::jsonb,
    '{}'::jsonb,
    '{"inventory":true}'::jsonb,
    100,
    'supabase-backfill',
    now(),
    'Backfilled missing version for inventory manager',
    'tenant_1'
  ),
  (
    'agent_knowledge_base_v1',
    'agent_knowledge_base',
    1,
    'published',
    '{"canCallShopify":false,"canCallStripe":false,"canSendMessages":false,"canIssueRefunds":false,"canModifyCase":true,"canRequestApproval":false,"canWriteAuditLog":true,"maxAutonomousRefundAmount":0}'::jsonb,
    '{"model":"gemini-2.5-pro","temperature":0.1,"maxOutputTokens":1024,"useJsonMode":true}'::jsonb,
    '{"requiresHumanApproval":false,"maxConsecutiveFailures":5,"minConfidenceThreshold":0.5,"staleSilenceAlertHours":24,"alwaysApproveActions":[]}'::jsonb,
    '{}'::jsonb,
    '{"knowledge_sync":true}'::jsonb,
    100,
    'supabase-backfill',
    now(),
    'Backfilled missing version for knowledge sync agent',
    'tenant_1'
  ),
  (
    'agent_logistics_v1',
    'agent_logistics',
    1,
    'published',
    '{"canCallShopify":false,"canCallStripe":false,"canSendMessages":false,"canIssueRefunds":false,"canModifyCase":true,"canRequestApproval":false,"canWriteAuditLog":true,"maxAutonomousRefundAmount":0}'::jsonb,
    '{"model":"gemini-2.5-pro","temperature":0.1,"maxOutputTokens":1024,"useJsonMode":true}'::jsonb,
    '{"requiresHumanApproval":false,"maxConsecutiveFailures":5,"minConfidenceThreshold":0.5,"staleSilenceAlertHours":24,"alwaysApproveActions":[]}'::jsonb,
    '{}'::jsonb,
    '{"logistics":true}'::jsonb,
    100,
    'supabase-backfill',
    now(),
    'Backfilled missing version for logistics agent',
    'tenant_1'
  ),
  (
    'agent_multilingual_v1',
    'agent_multilingual',
    1,
    'published',
    '{"canCallShopify":false,"canCallStripe":false,"canSendMessages":true,"canIssueRefunds":false,"canModifyCase":true,"canRequestApproval":true,"canWriteAuditLog":true,"maxAutonomousRefundAmount":0}'::jsonb,
    '{"model":"gemini-2.5-pro","temperature":0.4,"maxOutputTokens":3072,"useJsonMode":true}'::jsonb,
    '{"requiresHumanApproval":false,"maxConsecutiveFailures":3,"minConfidenceThreshold":0.7,"staleSilenceAlertHours":12,"alwaysApproveActions":["send_external_message"]}'::jsonb,
    '{}'::jsonb,
    '{"translation":true}'::jsonb,
    100,
    'supabase-backfill',
    now(),
    'Backfilled missing version for multilingual support agent',
    'tenant_1'
  ),
  (
    'agent_refund_spec_v1',
    'agent_refund_spec',
    1,
    'published',
    '{"canCallShopify":true,"canCallStripe":true,"canSendMessages":true,"canIssueRefunds":true,"canModifyCase":true,"canRequestApproval":true,"canWriteAuditLog":true,"maxAutonomousRefundAmount":50}'::jsonb,
    '{"model":"gemini-2.5-pro","temperature":0.1,"maxOutputTokens":1024,"useJsonMode":true}'::jsonb,
    '{"requiresHumanApproval":false,"maxConsecutiveFailures":3,"minConfidenceThreshold":0.7,"staleSilenceAlertHours":12,"alwaysApproveActions":["issue_refund","cancel_order"]}'::jsonb,
    '{}'::jsonb,
    '{"refunds":true}'::jsonb,
    100,
    'supabase-backfill',
    now(),
    'Backfilled missing version for refund specialist',
    'tenant_1'
  ),
  (
    'agent_upsell_v1',
    'agent_upsell',
    1,
    'published',
    '{"canCallShopify":false,"canCallStripe":false,"canSendMessages":true,"canIssueRefunds":false,"canModifyCase":true,"canRequestApproval":true,"canWriteAuditLog":true,"maxAutonomousRefundAmount":0}'::jsonb,
    '{"model":"gemini-2.5-pro","temperature":0.2,"maxOutputTokens":2048,"useJsonMode":true}'::jsonb,
    '{"requiresHumanApproval":false,"maxConsecutiveFailures":5,"minConfidenceThreshold":0.5,"staleSilenceAlertHours":24,"alwaysApproveActions":["send_external_message"]}'::jsonb,
    '{}'::jsonb,
    '{"retention":true}'::jsonb,
    100,
    'supabase-backfill',
    now(),
    'Backfilled missing version for retention upsell agent',
    'tenant_1'
  ),
  (
    'agent_sentiment_v1',
    'agent_sentiment',
    1,
    'published',
    '{"canCallShopify":false,"canCallStripe":false,"canSendMessages":false,"canIssueRefunds":false,"canModifyCase":true,"canRequestApproval":false,"canWriteAuditLog":true,"maxAutonomousRefundAmount":0}'::jsonb,
    '{"model":"gemini-2.5-pro","temperature":0.1,"maxOutputTokens":1024,"useJsonMode":true}'::jsonb,
    '{"requiresHumanApproval":false,"maxConsecutiveFailures":5,"minConfidenceThreshold":0.5,"staleSilenceAlertHours":24,"alwaysApproveActions":[]}'::jsonb,
    '{}'::jsonb,
    '{"sentiment_analysis":true}'::jsonb,
    100,
    'supabase-backfill',
    now(),
    'Backfilled missing version for sentiment analyzer',
    'tenant_1'
  ),
  (
    'agent_sla_manager_v1',
    'agent_sla_manager',
    1,
    'published',
    '{"canCallShopify":false,"canCallStripe":false,"canSendMessages":false,"canIssueRefunds":false,"canModifyCase":true,"canRequestApproval":true,"canWriteAuditLog":true,"maxAutonomousRefundAmount":0}'::jsonb,
    '{"model":"gemini-2.5-pro","temperature":0.1,"maxOutputTokens":1024,"useJsonMode":true}'::jsonb,
    '{"requiresHumanApproval":false,"maxConsecutiveFailures":5,"minConfidenceThreshold":0.5,"staleSilenceAlertHours":24,"alwaysApproveActions":[]}'::jsonb,
    '{}'::jsonb,
    '{"sla_monitoring":true}'::jsonb,
    100,
    'supabase-backfill',
    now(),
    'Backfilled missing version for SLA manager',
    'tenant_1'
  )
on conflict (id) do nothing;

update public.agents
set current_version_id = case id
  when 'agent_fraud_detect' then 'agent_fraud_detect_v1'
  when 'agent_inventory' then 'agent_inventory_v1'
  when 'agent_knowledge_base' then 'agent_knowledge_base_v1'
  when 'agent_logistics' then 'agent_logistics_v1'
  when 'agent_multilingual' then 'agent_multilingual_v1'
  when 'agent_refund_spec' then 'agent_refund_spec_v1'
  when 'agent_upsell' then 'agent_upsell_v1'
  when 'agent_sentiment' then 'agent_sentiment_v1'
  when 'agent_sla_manager' then 'agent_sla_manager_v1'
  else current_version_id
end
where current_version_id is null
  and id in (
    'agent_fraud_detect',
    'agent_inventory',
    'agent_knowledge_base',
    'agent_logistics',
    'agent_multilingual',
    'agent_refund_spec',
    'agent_upsell',
    'agent_sentiment',
    'agent_sla_manager'
  );

commit;
