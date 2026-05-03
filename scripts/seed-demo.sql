-- ─────────────────────────────────────────────────────────────────────────────
-- Demo Seed: seed-demo.sql
-- Purpose  : Load demo/development data for the CRM-AI SaaS platform.
--
-- Usage    : psql $DATABASE_URL -f scripts/seed-demo.sql
--            Or via package.json script: npm run seed:demo
--
-- WARNING  : DO NOT run this in production. All IDs are deterministic and
--            scoped to tenant_id = 'org_default' / workspace_id = 'ws_default'.
--            Running against a real tenant will overwrite data.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ─── Customers ───────────────────────────────────────────────────────────────
insert into customers (id, tenant_id, workspace_id, canonical_email, email, phone, canonical_name, segment, risk_level, lifetime_value, currency, preferred_channel, dispute_rate, refund_rate, chargeback_count, total_orders, total_spent, created_at, updated_at)
values
  ('cust_sarah', 'org_default', 'ws_default', 'sarah.jenkins@example.com', 'sarah.jenkins@example.com', '+34 600 100 201', 'Sarah Jenkins', 'vip', 'low', 1840.50, 'USD', 'web_chat', 0.08, 0.16, 0, 12, 1840.50, timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 12:10:00+00'),
  ('cust_marcus', 'org_default', 'ws_default', 'marcus.chen@example.com', 'marcus.chen@example.com', '+34 600 100 202', 'Marcus Chen', 'regular', 'medium', 920.20, 'USD', 'email', 0.12, 0.18, 0, 7, 920.20, timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 11:20:00+00'),
  ('cust_elena', 'org_default', 'ws_default', 'elena.rodriguez@example.com', 'elena.rodriguez@example.com', '+34 600 100 203', 'Elena Rodriguez', 'vip', 'high', 2890.10, 'USD', 'whatsapp', 0.21, 0.09, 1, 15, 2890.10, timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 10:50:00+00')
on conflict (id) do update set
  canonical_email = excluded.canonical_email,
  email = excluded.email,
  phone = excluded.phone,
  canonical_name = excluded.canonical_name,
  segment = excluded.segment,
  risk_level = excluded.risk_level,
  lifetime_value = excluded.lifetime_value,
  currency = excluded.currency,
  preferred_channel = excluded.preferred_channel,
  dispute_rate = excluded.dispute_rate,
  refund_rate = excluded.refund_rate,
  chargeback_count = excluded.chargeback_count,
  total_orders = excluded.total_orders,
  total_spent = excluded.total_spent,
  updated_at = excluded.updated_at;

-- ─── Conversations ────────────────────────────────────────────────────────────
insert into conversations (id, case_id, customer_id, channel, status, subject, external_thread_id, first_message_at, last_message_at, created_at, updated_at, tenant_id, workspace_id)
values
  ('conv_001', 'case_001', 'cust_sarah', 'web_chat', 'open', 'Refund pending bank clearance', 'webchat-88219', timestamp '2026-04-15 07:55:00+00', timestamp '2026-04-15 12:10:00+00', timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 12:10:00+00', 'org_default', 'ws_default'),
  ('conv_002', 'case_002', 'cust_marcus', 'email', 'open', 'Cancellation requested after packing', 'email-88220', timestamp '2026-04-15 09:45:00+00', timestamp '2026-04-15 11:05:00+00', timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 11:05:00+00', 'org_default', 'ws_default'),
  ('conv_003', 'case_003', 'cust_elena', 'whatsapp', 'open', 'Chargeback timing conflict', 'whatsapp-88221', timestamp '2026-04-15 08:10:00+00', timestamp '2026-04-15 10:45:00+00', timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 10:45:00+00', 'org_default', 'ws_default'),
  ('conv_004', 'case_004', 'cust_elena', 'email', 'open', 'Replacement review for damaged item', 'email-88222', timestamp '2026-04-15 09:20:00+00', timestamp '2026-04-15 12:20:00+00', timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 12:20:00+00', 'org_default', 'ws_default')
on conflict (id) do update set
  case_id = excluded.case_id,
  customer_id = excluded.customer_id,
  channel = excluded.channel,
  status = excluded.status,
  subject = excluded.subject,
  external_thread_id = excluded.external_thread_id,
  first_message_at = excluded.first_message_at,
  last_message_at = excluded.last_message_at,
  updated_at = excluded.updated_at,
  tenant_id = excluded.tenant_id,
  workspace_id = excluded.workspace_id;

-- ─── Cases ────────────────────────────────────────────────────────────────────
insert into cases (id, case_number, tenant_id, workspace_id, source_system, source_channel, source_entity_id, type, sub_type, intent, intent_confidence, status, priority, severity, risk_level, risk_score, fraud_flag, assigned_user_id, assigned_team_id, created_by_user_id, sla_policy_id, sla_first_response_deadline, sla_resolution_deadline, sla_status, customer_id, order_ids, payment_ids, return_ids, conversation_id, ai_diagnosis, ai_root_cause, ai_confidence, ai_recommended_action, ai_evidence_refs, approval_state, active_approval_request_id, execution_state, active_execution_plan_id, resolution_state, resolved_by, resolution_notes, resolution_at, has_reconciliation_conflicts, conflict_severity, tags, created_at, updated_at, first_response_at, last_activity_at, closed_at)
values
  ('case_001', 'CAS-88219', 'org_default', 'ws_default', 'web_chat', 'web_chat', 'webchat-88219', 'refund_request', 'bank_clearance', 'refund_status_check', 0.97, 'open', 'high', 'S1', 'high', 94, false, 'user_alex', 'team_support', 'user_alex', null, timestamp '2026-04-15 09:30:00+00', timestamp '2026-04-15 13:30:00+00', 'at_risk', 'cust_sarah', jsonb_build_array('order_001', 'order_003', 'order_004'), jsonb_build_array('pay_001', 'pay_003', 'pay_004'), jsonb_build_array('return_001', 'return_002'), 'conv_001', 'Refund approved by PSP but OMS and warehouse state still lagging', 'Bank clearance / reconciliation lag between PSP, OMS and returns', 0.97, 'Wait for bank clearance, reconcile PSP and OMS, then notify the customer', jsonb_build_array('issue_001', 'issue_002', 'note_001'), 'pending', 'apr_001', 'waiting_approval', 'plan_001', 'unresolved', null, null, null, true, 'high', jsonb_build_array('refund', 'reconciliation', 'bank_clearance'), timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 12:10:00+00', timestamp '2026-04-15 08:05:00+00', timestamp '2026-04-15 12:10:00+00', null),
  ('case_002', 'CAS-88220', 'org_default', 'ws_default', 'email', 'email', 'email-88220', 'cancellation_request', 'packed_order', 'cancel_before_ship', 0.89, 'open', 'normal', 'S2', 'medium', 61, false, 'user_sarah', 'team_support', 'user_sarah', null, timestamp '2026-04-15 10:00:00+00', timestamp '2026-04-15 14:15:00+00', 'warning', 'cust_marcus', jsonb_build_array('order_002', 'order_005'), jsonb_build_array('pay_002', 'pay_005'), jsonb_build_array('return_003'), 'conv_002', 'Cancellation requested after packing', 'Order packed before OMS received cancellation webhook', 0.91, 'Hold shipment, verify warehouse scan, and confirm cancellation policy', jsonb_build_array('issue_003', 'note_003'), 'approved', 'apr_002', 'approved', 'plan_002', 'unresolved', null, null, null, true, 'medium', jsonb_build_array('cancellation', 'fulfillment', 'refund-review'), timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 11:20:00+00', timestamp '2026-04-15 09:35:00+00', timestamp '2026-04-15 11:20:00+00', null),
  ('case_003', 'CAS-88221', 'org_default', 'ws_default', 'whatsapp', 'whatsapp', 'whatsapp-88221', 'chargeback_review', 'return_timing', 'chargeback_vs_return', 0.95, 'blocked', 'high', 'S1', 'critical', 97, false, null, 'team_support', 'user_james', null, timestamp '2026-04-15 08:20:00+00', timestamp '2026-04-15 11:10:00+00', 'breached', 'cust_elena', jsonb_build_array('order_006', 'order_007'), jsonb_build_array('pay_006', 'pay_007'), jsonb_build_array('return_004', 'return_005'), 'conv_003', 'Chargeback and return timing conflict', 'Chargeback raised before the return was physically received', 0.95, 'Block automated refund until warehouse and PSP align', jsonb_build_array('issue_004', 'issue_005', 'note_004'), 'expired', 'apr_004', 'blocked', 'plan_004', 'unresolved', null, null, null, true, 'critical', jsonb_build_array('chargeback', 'blocked', 'whatsapp'), timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 10:50:00+00', timestamp '2026-04-15 08:25:00+00', timestamp '2026-04-15 10:50:00+00', null),
  ('case_004', 'CAS-88222', 'org_default', 'ws_default', 'email', 'email', 'email-88222', 'replacement_request', 'damaged_item', 'replacement_after_return', 0.92, 'open', 'high', 'S1', 'high', 88, false, 'user_alex', 'team_support', 'user_alex', null, timestamp '2026-04-15 10:45:00+00', timestamp '2026-04-15 14:30:00+00', 'at_risk', 'cust_elena', jsonb_build_array('order_008'), jsonb_build_array('pay_008'), jsonb_build_array('return_006'), 'conv_004', 'Replacement request for damaged item', 'Warehouse confirmation is pending for a replacement after return scan', 0.93, 'Wait for warehouse confirmation, then approve replacement', jsonb_build_array('issue_006', 'note_005'), 'pending', 'apr_005', 'waiting_approval', 'plan_005', 'unresolved', null, null, null, true, 'high', jsonb_build_array('replacement', 'return', 'damaged-item'), timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 12:20:00+00', timestamp '2026-04-15 09:25:00+00', timestamp '2026-04-15 12:20:00+00', null)
on conflict (id) do update set
  case_number = excluded.case_number,
  tenant_id = excluded.tenant_id,
  workspace_id = excluded.workspace_id,
  source_system = excluded.source_system,
  source_channel = excluded.source_channel,
  source_entity_id = excluded.source_entity_id,
  type = excluded.type,
  sub_type = excluded.sub_type,
  intent = excluded.intent,
  intent_confidence = excluded.intent_confidence,
  status = excluded.status,
  priority = excluded.priority,
  severity = excluded.severity,
  risk_level = excluded.risk_level,
  risk_score = excluded.risk_score,
  fraud_flag = excluded.fraud_flag,
  assigned_user_id = excluded.assigned_user_id,
  assigned_team_id = excluded.assigned_team_id,
  created_by_user_id = excluded.created_by_user_id,
  sla_policy_id = excluded.sla_policy_id,
  sla_first_response_deadline = excluded.sla_first_response_deadline,
  sla_resolution_deadline = excluded.sla_resolution_deadline,
  sla_status = excluded.sla_status,
  customer_id = excluded.customer_id,
  order_ids = excluded.order_ids,
  payment_ids = excluded.payment_ids,
  return_ids = excluded.return_ids,
  conversation_id = excluded.conversation_id,
  ai_diagnosis = excluded.ai_diagnosis,
  ai_root_cause = excluded.ai_root_cause,
  ai_confidence = excluded.ai_confidence,
  ai_recommended_action = excluded.ai_recommended_action,
  ai_evidence_refs = excluded.ai_evidence_refs,
  approval_state = excluded.approval_state,
  active_approval_request_id = excluded.active_approval_request_id,
  execution_state = excluded.execution_state,
  active_execution_plan_id = excluded.active_execution_plan_id,
  resolution_state = excluded.resolution_state,
  has_reconciliation_conflicts = excluded.has_reconciliation_conflicts,
  conflict_severity = excluded.conflict_severity,
  tags = excluded.tags,
  updated_at = excluded.updated_at,
  first_response_at = excluded.first_response_at,
  last_activity_at = excluded.last_activity_at,
  closed_at = excluded.closed_at;

-- ─── Policy Rules ─────────────────────────────────────────────────────────────
insert into policy_rules (id, tenant_id, workspace_id, knowledge_article_id, name, description, entity_type, conditions, action_mapping, approval_mapping, escalation_mapping, is_active, version, created_at)
values
  ('pr_cancel_approval', 'org_default', 'ws_default', null, 'Cancellation approval rule', 'Packed orders require review before cancellation', 'order', jsonb_build_array(jsonb_build_object('field', 'fulfillment_status', 'operator', 'equals', 'value', 'packed')), jsonb_build_object('cancel_order', true, 'notify_warehouse', true), jsonb_build_object('requires_approval', true), jsonb_build_object('priority', 'high'), true, 1, timestamp '2026-04-14 11:39:45+00'),
  ('pr_chargeback_review', 'org_default', 'ws_default', null, 'Chargeback review rule', 'Chargebacks and blocked refunds need manual review', 'payment', jsonb_build_array(jsonb_build_object('field', 'status', 'operator', 'in', 'value', jsonb_build_array('disputed', 'blocked'))), jsonb_build_object('freeze_refund', true, 'escalate_to_finance', true), jsonb_build_object('requires_approval', true), jsonb_build_object('priority', 'critical'), true, 1, timestamp '2026-04-14 11:39:45+00'),
  ('pr_replacement_approval', 'org_default', 'ws_default', null, 'Replacement approval rule', 'Damaged item replacements must wait for warehouse confirmation', 'return', jsonb_build_array(jsonb_build_object('field', 'refund_status', 'operator', 'equals', 'value', 'refund_pending')), jsonb_build_object('approve_replacement', true), jsonb_build_object('requires_approval', true), jsonb_build_object('priority', 'high'), true, 1, timestamp '2026-04-14 11:39:45+00')
on conflict (id) do update set
  tenant_id = excluded.tenant_id,
  workspace_id = excluded.workspace_id,
  knowledge_article_id = excluded.knowledge_article_id,
  name = excluded.name,
  description = excluded.description,
  entity_type = excluded.entity_type,
  conditions = excluded.conditions,
  action_mapping = excluded.action_mapping,
  approval_mapping = excluded.approval_mapping,
  escalation_mapping = excluded.escalation_mapping,
  is_active = excluded.is_active,
  version = excluded.version;

-- ─── Execution Plans ──────────────────────────────────────────────────────────
insert into execution_plans (id, case_id, tenant_id, generated_by, generated_at, status, steps, dry_run_result, approval_request_id, started_at, completed_at)
values
  ('plan_001', 'case_001', 'org_default', 'copilot', timestamp '2026-04-15 11:58:00+00', 'awaiting_approval', jsonb_build_array(jsonb_build_object('step', 'verify_psp', 'action', 'confirm settlement with bank'), jsonb_build_object('step', 'notify_customer', 'action', 'keep customer informed')), jsonb_build_object('expected', 'refund settles after clearance'), 'apr_001', timestamp '2026-04-15 11:58:00+00', null),
  ('plan_002', 'case_002', 'org_default', 'copilot', timestamp '2026-04-15 10:40:00+00', 'approved', jsonb_build_array(jsonb_build_object('step', 'hold_shipment', 'action', 'stop packing release'), jsonb_build_object('step', 'confirm_cancel', 'action', 'validate warehouse scan')), jsonb_build_object('expected', 'cancel before ship'), 'apr_002', timestamp '2026-04-15 10:40:00+00', timestamp '2026-04-15 11:05:00+00'),
  ('plan_003', 'case_003', 'org_default', 'copilot', timestamp '2026-04-15 09:15:00+00', 'rejected', jsonb_build_array(jsonb_build_object('step', 'freeze_refund', 'action', 'pause automated payout')), jsonb_build_object('expected', 'manual review required'), 'apr_003', timestamp '2026-04-15 09:15:00+00', timestamp '2026-04-15 09:30:00+00'),
  ('plan_004', 'case_003', 'org_default', 'copilot', timestamp '2026-04-15 09:40:00+00', 'expired', jsonb_build_array(jsonb_build_object('step', 'escalate', 'action', 'wait for ops approval')), jsonb_build_object('expected', 'human approval overdue'), 'apr_004', timestamp '2026-04-15 09:40:00+00', null),
  ('plan_005', 'case_004', 'org_default', 'copilot', timestamp '2026-04-15 12:15:00+00', 'awaiting_approval', jsonb_build_array(jsonb_build_object('step', 'verify_return', 'action', 'confirm warehouse receipt'), jsonb_build_object('step', 'approve_replacement', 'action', 'release replacement order')), jsonb_build_object('expected', 'replacement after receipt'), 'apr_005', timestamp '2026-04-15 12:15:00+00', null)
on conflict (id) do update set
  case_id = excluded.case_id,
  tenant_id = excluded.tenant_id,
  generated_by = excluded.generated_by,
  generated_at = excluded.generated_at,
  status = excluded.status,
  steps = excluded.steps,
  dry_run_result = excluded.dry_run_result,
  approval_request_id = excluded.approval_request_id,
  started_at = excluded.started_at,
  completed_at = excluded.completed_at;

-- ─── Approval Requests ────────────────────────────────────────────────────────
insert into approval_requests (id, case_id, tenant_id, workspace_id, requested_by, requested_by_type, action_type, action_payload, risk_level, policy_rule_id, evidence_package, status, assigned_to, assigned_team_id, decision_by, decision_at, decision_note, expires_at, execution_plan_id, created_at, updated_at)
values
  ('apr_001', 'case_001', 'org_default', 'ws_default', 'copilot', 'agent', 'refund', jsonb_build_object('amount', 129, 'currency', 'USD', 'reason', 'bank_clearance'), 'medium', 'pr_refund_approval', jsonb_build_object('summary', 'Refund approved by PSP but OMS still pending'), 'pending', 'user_alex', 'team_support', null, null, null, timestamp '2026-04-15 13:30:00+00', 'plan_001', timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 12:10:00+00'),
  ('apr_002', 'case_002', 'org_default', 'ws_default', 'copilot', 'agent', 'cancel', jsonb_build_object('order_id', 'order_002', 'reason', 'packed_before_cancel'), 'medium', 'pr_cancel_approval', jsonb_build_object('summary', 'Packed order awaiting cancellation decision'), 'approved', 'user_sarah', 'team_support', 'user_sarah', timestamp '2026-04-15 11:05:00+00', 'Shipment held, cancel approved', timestamp '2026-04-15 12:00:00+00', 'plan_002', timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 11:05:00+00'),
  ('apr_003', 'case_003', 'org_default', 'ws_default', 'copilot', 'agent', 'chargeback_review', jsonb_build_object('payment_id', 'pay_007', 'reason', 'chargeback_and_blocked_refund'), 'critical', 'pr_chargeback_review', jsonb_build_object('summary', 'Chargeback requires manual risk review'), 'rejected', 'user_james', 'team_support', 'user_james', timestamp '2026-04-15 09:30:00+00', 'Risk not cleared for auto release', timestamp '2026-04-15 10:00:00+00', 'plan_003', timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 09:30:00+00'),
  ('apr_004', 'case_003', 'org_default', 'ws_default', 'copilot', 'agent', 'manual_review', jsonb_build_object('payment_id', 'pay_007', 'reason', 'approval_timeout'), 'critical', 'pr_chargeback_review', jsonb_build_object('summary', 'Manual review expired'), 'expired', null, 'team_support', null, null, 'Approval timed out before response', timestamp '2026-04-15 09:40:00+00', 'plan_004', timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 10:50:00+00'),
  ('apr_005', 'case_004', 'org_default', 'ws_default', 'copilot', 'agent', 'replacement', jsonb_build_object('return_id', 'return_006', 'reason', 'damaged_item_replacement'), 'high', 'pr_replacement_approval', jsonb_build_object('summary', 'Replacement waits for warehouse confirmation'), 'pending', 'user_alex', 'team_support', null, null, null, timestamp '2026-04-15 14:30:00+00', 'plan_005', timestamp '2026-04-15 12:15:00+00', timestamp '2026-04-15 12:20:00+00')
on conflict (id) do update set
  case_id = excluded.case_id,
  tenant_id = excluded.tenant_id,
  workspace_id = excluded.workspace_id,
  requested_by = excluded.requested_by,
  requested_by_type = excluded.requested_by_type,
  action_type = excluded.action_type,
  action_payload = excluded.action_payload,
  risk_level = excluded.risk_level,
  policy_rule_id = excluded.policy_rule_id,
  evidence_package = excluded.evidence_package,
  status = excluded.status,
  assigned_to = excluded.assigned_to,
  assigned_team_id = excluded.assigned_team_id,
  decision_by = excluded.decision_by,
  decision_at = excluded.decision_at,
  decision_note = excluded.decision_note,
  expires_at = excluded.expires_at,
  execution_plan_id = excluded.execution_plan_id,
  updated_at = excluded.updated_at;

-- ─── Orders ───────────────────────────────────────────────────────────────────
insert into orders (id, external_order_id, customer_id, tenant_id, workspace_id, status, fulfillment_status, tracking_number, tracking_url, shipping_address, system_states, total_amount, currency, country, brand, channel, order_date, has_conflict, conflict_domain, conflict_detected, recommended_action, risk_level, order_type, approval_status, summary, last_sync_at, last_update, badges, tab, created_at, updated_at)
values
  ('order_001', 'ORD-55210', 'cust_sarah', 'org_default', 'ws_default', 'delivered', 'delivered', 'TRK-55210', 'https://tracking.example.com/TRK-55210', 'Acme Street 1', jsonb_build_object('canonical', 'delivered', 'oms', 'delivered', 'psp', 'refunded'), 129.00, 'USD', 'ES', 'Acme Store', 'web', date '2026-04-07', true, 'payment', 'PSP says refunded, OMS says pending', 'Wait for bank clearance', 'high', 'standard', 'not_required', 'Bank clearance dispute', timestamp '2026-04-15 12:10:00+00', 'PSP and OMS still reconciling', jsonb_build_array('conflict', 'high-risk'), 'attention', timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 12:10:00+00'),
  ('order_002', 'ORD-55211', 'cust_marcus', 'org_default', 'ws_default', 'packed', 'packed', 'TRK-55211', 'https://tracking.example.com/TRK-55211', 'Acme Street 2', jsonb_build_object('canonical', 'packed', 'oms', 'packed', 'psp', 'pending'), 89.00, 'USD', 'ES', 'Acme Store', 'web', date '2026-04-09', true, 'fulfillment', 'Order packed but cancellation requested', 'Check fulfillment sync', 'medium', 'standard', 'approval_needed', 'Cancellation requested after packing', timestamp '2026-04-15 11:05:00+00', 'Fulfillment hold in place', jsonb_build_array('conflict', 'approval'), 'attention', timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 11:05:00+00'),
  ('order_003', 'ORD-55212', 'cust_sarah', 'org_default', 'ws_default', 'in_transit', 'shipped', 'TRK-55212', 'https://tracking.example.com/TRK-55212', 'Acme Street 1', jsonb_build_object('canonical', 'in_transit', 'oms', 'in_transit', 'warehouse', 'shipped'), 38.00, 'USD', 'ES', 'Acme Store', 'web', date '2026-04-10', false, null, null, 'No action needed', 'low', 'standard', 'not_required', 'Second parcel in transit', timestamp '2026-04-15 12:00:00+00', 'Tracking updated from carrier', jsonb_build_array('transit'), 'all', timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 12:00:00+00'),
  ('order_004', 'ORD-55213', 'cust_sarah', 'org_default', 'ws_default', 'cancelled', 'cancelled', 'TRK-55213', 'https://tracking.example.com/TRK-55213', 'Acme Street 1', jsonb_build_object('canonical', 'cancelled', 'oms', 'cancelled', 'warehouse', 'packed'), 64.00, 'USD', 'ES', 'Acme Store', 'web', date '2026-04-11', true, 'fulfillment', 'Cancellation requested after packing', 'Confirm with warehouse before refund', 'high', 'standard', 'approval_needed', 'Cancellation after packing', timestamp '2026-04-15 11:50:00+00', 'Awaiting warehouse confirmation', jsonb_build_array('conflict', 'cancelled'), 'attention', timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 11:50:00+00'),
  ('order_005', 'ORD-55214', 'cust_marcus', 'org_default', 'ws_default', 'packed', 'packed', 'TRK-55214', 'https://tracking.example.com/TRK-55214', 'Acme Street 2', jsonb_build_object('canonical', 'packed', 'oms', 'packed', 'warehouse', 'label_created'), 109.00, 'USD', 'ES', 'Acme Store', 'email', date '2026-04-12', true, 'fulfillment', 'Packed while cancellation still open', 'Hold shipment and notify customer', 'medium', 'standard', 'approval_needed', 'Packed after cancellation request', timestamp '2026-04-15 10:55:00+00', 'Held for cancellation approval', jsonb_build_array('conflict', 'approval'), 'attention', timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 10:55:00+00'),
  ('order_006', 'ORD-55215', 'cust_elena', 'org_default', 'ws_default', 'delivered', 'delivered', 'TRK-55215', 'https://tracking.example.com/TRK-55215', 'Acme Street 3', jsonb_build_object('canonical', 'delivered', 'oms', 'delivered', 'warehouse', 'delivered'), 249.00, 'USD', 'ES', 'Acme Store', 'whatsapp', date '2026-04-08', false, null, null, 'No action needed', 'low', 'standard', 'not_required', 'Delivered replacement candidate', timestamp '2026-04-15 10:30:00+00', 'Delivered and closed', jsonb_build_array('delivered'), 'all', timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 10:30:00+00'),
  ('order_007', 'ORD-55216', 'cust_elena', 'org_default', 'ws_default', 'blocked', 'pending', 'TRK-55216', 'https://tracking.example.com/TRK-55216', 'Acme Street 3', jsonb_build_object('canonical', 'blocked', 'oms', 'pending', 'fraud', 'flagged'), 340.00, 'USD', 'ES', 'Acme Store', 'whatsapp', date '2026-04-13', true, 'fraud', 'Manual review stopped shipment', 'Review chargeback and block refund', 'critical', 'standard', 'approval_needed', 'Blocked shipment', timestamp '2026-04-15 10:40:00+00', 'Fraud hold active', jsonb_build_array('blocked', 'critical'), 'blocked', timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 10:40:00+00'),
  ('order_008', 'ORD-55217', 'cust_elena', 'org_default', 'ws_default', 'in_transit', 'shipped', 'TRK-55217', 'https://tracking.example.com/TRK-55217', 'Acme Street 3', jsonb_build_object('canonical', 'in_transit', 'oms', 'shipped', 'returns', 'pending'), 159.00, 'USD', 'ES', 'Acme Store', 'email', date '2026-04-14', true, 'returns', 'Replacement approved before warehouse scan', 'Wait for warehouse confirmation', 'high', 'standard', 'approval_needed', 'Replacement in transit', timestamp '2026-04-15 12:20:00+00', 'Replacement pending scan', jsonb_build_array('conflict', 'transit'), 'attention', timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 12:20:00+00')
on conflict (id) do update set
  external_order_id = excluded.external_order_id,
  customer_id = excluded.customer_id,
  tenant_id = excluded.tenant_id,
  workspace_id = excluded.workspace_id,
  status = excluded.status,
  fulfillment_status = excluded.fulfillment_status,
  tracking_number = excluded.tracking_number,
  tracking_url = excluded.tracking_url,
  shipping_address = excluded.shipping_address,
  system_states = excluded.system_states,
  total_amount = excluded.total_amount,
  currency = excluded.currency,
  country = excluded.country,
  brand = excluded.brand,
  channel = excluded.channel,
  order_date = excluded.order_date,
  has_conflict = excluded.has_conflict,
  conflict_domain = excluded.conflict_domain,
  conflict_detected = excluded.conflict_detected,
  recommended_action = excluded.recommended_action,
  risk_level = excluded.risk_level,
  order_type = excluded.order_type,
  approval_status = excluded.approval_status,
  summary = excluded.summary,
  last_sync_at = excluded.last_sync_at,
  last_update = excluded.last_update,
  badges = excluded.badges,
  tab = excluded.tab,
  updated_at = excluded.updated_at;

-- ─── Payments ─────────────────────────────────────────────────────────────────
insert into payments (id, external_payment_id, order_id, customer_id, tenant_id, workspace_id, amount, currency, payment_method, psp, status, system_states, dispute_id, refund_ids, risk_level, payment_type, approval_status, summary, has_conflict, conflict_detected, recommended_action, badges, tab, refund_amount, refund_type, dispute_reference, chargeback_amount, created_at, updated_at, last_update)
values
  ('pay_001', 'pi_001', 'order_001', 'cust_sarah', 'org_default', 'ws_default', 129.00, 'USD', 'card', 'stripe', 'settled', jsonb_build_object('canonical', 'settled', 'stripe', 'refunded', 'oms', 'pending'), null, jsonb_build_array('return_001'), 'low', 'standard', 'not_required', 'Refund settled by PSP', false, null, 'No action needed', jsonb_build_array('settled'), 'reconciliation', null, null, null, null, timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 12:10:00+00', 'PSP and OMS still reconciling'),
  ('pay_002', 'pi_002', 'order_002', 'cust_marcus', 'org_default', 'ws_default', 89.00, 'USD', 'card', 'stripe', 'pending', jsonb_build_object('canonical', 'pending', 'stripe', 'pending', 'oms', 'packed'), null, jsonb_build_array(), 'medium', 'standard', 'approval_needed', 'Payment pending review', true, 'pending review', 'Review payment risk', jsonb_build_array('review'), 'reconciliation', null, null, null, null, timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 11:05:00+00', 'Payment awaiting approval'),
  ('pay_003', 'pi_003', 'order_003', 'cust_sarah', 'org_default', 'ws_default', 129.00, 'USD', 'card', 'stripe', 'refunded', jsonb_build_object('canonical', 'refunded', 'stripe', 'refunded', 'oms', 'received'), null, jsonb_build_array('return_001'), 'low', 'standard', 'approved', 'Refund completed', false, null, 'No action needed', jsonb_build_array('refunds'), 'refunds', 129.00, 'full', null, null, timestamp '2026-04-15 12:00:00+00', timestamp '2026-04-15 12:00:00+00', 'Refund completed'),
  ('pay_004', 'pi_004', 'order_004', 'cust_sarah', 'org_default', 'ws_default', 64.00, 'USD', 'card', 'stripe', 'disputed', jsonb_build_object('canonical', 'disputed', 'stripe', 'disputed', 'oms', 'cancelled'), 'dp_004', jsonb_build_array(), 'critical', 'standard', 'blocked', 'Chargeback disputed by customer', true, 'dispute opened', 'Freeze refund and escalate to finance', jsonb_build_array('disputes', 'blocked'), 'disputes', null, null, 'dp_004', 64.00, timestamp '2026-04-15 11:45:00+00', timestamp '2026-04-15 11:45:00+00', 'Chargeback disputed'),
  ('pay_005', 'pi_005', 'order_005', 'cust_marcus', 'org_default', 'ws_default', 109.00, 'USD', 'card', 'stripe', 'pending', jsonb_build_object('canonical', 'pending', 'stripe', 'pending', 'oms', 'packed'), null, jsonb_build_array(), 'medium', 'standard', 'approval_needed', 'Payment pending cancellation review', true, 'hold until cancellation decision', 'Hold shipment until payment clears', jsonb_build_array('reconciliation'), 'reconciliation', null, null, null, null, timestamp '2026-04-15 10:55:00+00', timestamp '2026-04-15 10:55:00+00', 'Pending cancellation review'),
  ('pay_006', 'pi_006', 'order_006', 'cust_elena', 'org_default', 'ws_default', 249.00, 'USD', 'card', 'stripe', 'settled', jsonb_build_object('canonical', 'settled', 'stripe', 'captured', 'oms', 'delivered'), null, jsonb_build_array(), 'low', 'standard', 'not_required', 'Settled and synced', false, null, 'No action needed', jsonb_build_array('settled'), 'all', null, null, null, null, timestamp '2026-04-15 10:20:00+00', timestamp '2026-04-15 10:20:00+00', 'Synced successfully'),
  ('pay_007', 'pi_007', 'order_007', 'cust_elena', 'org_default', 'ws_default', 340.00, 'USD', 'card', 'stripe', 'blocked', jsonb_build_object('canonical', 'blocked', 'stripe', 'blocked', 'fraud', 'flagged'), null, jsonb_build_array(), 'critical', 'standard', 'blocked', 'Payment blocked by risk engine', true, 'blocked by fraud', 'Review chargeback and block refund', jsonb_build_array('blocked'), 'blocked', null, null, null, null, timestamp '2026-04-15 10:35:00+00', timestamp '2026-04-15 10:35:00+00', 'Fraud hold active'),
  ('pay_008', 'pi_008', 'order_008', 'cust_elena', 'org_default', 'ws_default', 159.00, 'USD', 'card', 'stripe', 'authorized', jsonb_build_object('canonical', 'authorized', 'stripe', 'authorized', 'returns', 'pending'), null, jsonb_build_array(), 'high', 'standard', 'approval_needed', 'Replacement payment awaiting scan', true, 'replacement pending scan', 'Wait for warehouse confirmation', jsonb_build_array('reconciliation'), 'reconciliation', null, null, null, null, timestamp '2026-04-15 12:15:00+00', timestamp '2026-04-15 12:15:00+00', 'Replacement pending scan')
on conflict (id) do update set
  external_payment_id = excluded.external_payment_id,
  order_id = excluded.order_id,
  customer_id = excluded.customer_id,
  tenant_id = excluded.tenant_id,
  workspace_id = excluded.workspace_id,
  amount = excluded.amount,
  currency = excluded.currency,
  payment_method = excluded.payment_method,
  psp = excluded.psp,
  status = excluded.status,
  system_states = excluded.system_states,
  dispute_id = excluded.dispute_id,
  refund_ids = excluded.refund_ids,
  risk_level = excluded.risk_level,
  payment_type = excluded.payment_type,
  approval_status = excluded.approval_status,
  summary = excluded.summary,
  has_conflict = excluded.has_conflict,
  conflict_detected = excluded.conflict_detected,
  recommended_action = excluded.recommended_action,
  badges = excluded.badges,
  tab = excluded.tab,
  refund_amount = excluded.refund_amount,
  refund_type = excluded.refund_type,
  dispute_reference = excluded.dispute_reference,
  chargeback_amount = excluded.chargeback_amount,
  updated_at = excluded.updated_at,
  last_update = excluded.last_update;

-- ─── Returns ──────────────────────────────────────────────────────────────────
insert into returns (id, external_return_id, order_id, customer_id, tenant_id, workspace_id, type, return_reason, return_value, status, inspection_status, refund_status, carrier_status, has_conflict, approval_status, risk_level, linked_refund_id, linked_shipment_id, system_states, conflict_detected, recommended_action, summary, badges, tab, method, received_at_warehouse, brand, country, currency, last_update, created_at, updated_at)
values
  ('return_001', 'rt_001', 'order_001', 'cust_sarah', 'org_default', 'ws_default', 'return', 'Damaged on arrival', 129.00, 'received', 'inspected', 'refund_pending', 'delivered', true, 'not_required', 'medium', 'pay_001', null, jsonb_build_object('canonical', 'pending_review', 'warehouse', 'received', 'psp', 'refunded'), 'PSP refunded, return warehouse pending', 'Inspect and reconcile refund', 'Refund pending bank clearance', jsonb_build_array('refund_pending', 'conflict'), 'refund_pending', 'carrier_pickup', timestamp '2026-04-13 11:39:45+00', 'Acme Store', 'ES', 'USD', 'Return pending reconciliation', timestamp '2026-04-14 11:39:45+00', timestamp '2026-04-15 12:00:00+00'),
  ('return_002', 'rt_002', 'order_003', 'cust_sarah', 'org_default', 'ws_default', 'return', 'Wrong size, already in transit', 38.00, 'in_transit', 'pending', 'pending_review', 'in_transit', false, 'not_required', 'low', null, null, jsonb_build_object('canonical', 'in_transit', 'warehouse', 'in_transit', 'carrier', 'in_transit'), null, 'Track return until warehouse receipt', 'Return in transit', jsonb_build_array('transit'), 'in_transit', 'carrier_pickup', timestamp '2026-04-15 11:30:00+00', 'Acme Store', 'ES', 'USD', 'Return in transit', timestamp '2026-04-15 11:30:00+00', timestamp '2026-04-15 11:30:00+00'),
  ('return_003', 'rt_003', 'order_005', 'cust_marcus', 'org_default', 'ws_default', 'return', 'Customer cancelled after packing', 109.00, 'pending_review', 'pending', 'not_required', 'label_created', true, 'pending', 'medium', null, null, jsonb_build_object('canonical', 'pending_review', 'warehouse', 'label_created', 'oms', 'packed'), 'Cancellation arrived after packing', 'Review before refund', 'Pending review after cancellation', jsonb_build_array('review', 'conflict'), 'pending_review', 'mail_pickup', timestamp '2026-04-15 10:50:00+00', 'Acme Store', 'ES', 'USD', 'Return pending review', timestamp '2026-04-15 10:50:00+00', timestamp '2026-04-15 10:50:00+00'),
  ('return_004', 'rt_004', 'order_007', 'cust_elena', 'org_default', 'ws_default', 'return', 'Chargeback and fraud hold', 340.00, 'blocked', 'escalated', 'blocked', 'delivered', true, 'blocked', 'critical', null, null, jsonb_build_object('canonical', 'blocked', 'warehouse', 'delivered', 'fraud', 'flagged'), 'Blocked due to fraud', 'Escalate to risk team', 'Blocked return', jsonb_build_array('blocked', 'critical'), 'blocked', 'carrier_pickup', timestamp '2026-04-15 10:20:00+00', 'Acme Store', 'ES', 'USD', 'Blocked by fraud review', timestamp '2026-04-15 10:20:00+00', timestamp '2026-04-15 10:20:00+00'),
  ('return_005', 'rt_005', 'order_006', 'cust_elena', 'org_default', 'ws_default', 'return', 'Replacement after approved damage claim', 249.00, 'received', 'inspected', 'refund_pending', 'delivered', true, 'approval_needed', 'high', 'pay_006', null, jsonb_build_object('canonical', 'pending_review', 'warehouse', 'received', 'psp', 'captured'), 'Refund pending after received return', 'Wait for replacement approval', 'Replacement awaiting approval', jsonb_build_array('received', 'refund_pending'), 'refund_pending', 'carrier_pickup', timestamp '2026-04-15 12:05:00+00', 'Acme Store', 'ES', 'USD', 'Replacement pending approval', timestamp '2026-04-15 12:05:00+00', timestamp '2026-04-15 12:05:00+00'),
  ('return_006', 'rt_006', 'order_008', 'cust_elena', 'org_default', 'ws_default', 'return', 'Damaged replacement waiting scan', 159.00, 'in_transit', 'pending', 'not_required', 'in_transit', true, 'approval_needed', 'high', null, null, jsonb_build_object('canonical', 'in_transit', 'warehouse', 'in_transit', 'returns', 'pending'), 'Replacement approved before warehouse scan', 'Wait for warehouse confirmation', 'Replacement in transit', jsonb_build_array('transit', 'conflict'), 'in_transit', 'carrier_pickup', timestamp '2026-04-15 12:20:00+00', 'Acme Store', 'ES', 'USD', 'Replacement in transit', timestamp '2026-04-15 12:20:00+00', timestamp '2026-04-15 12:20:00+00')
on conflict (id) do update set
  external_return_id = excluded.external_return_id,
  order_id = excluded.order_id,
  customer_id = excluded.customer_id,
  tenant_id = excluded.tenant_id,
  workspace_id = excluded.workspace_id,
  type = excluded.type,
  return_reason = excluded.return_reason,
  return_value = excluded.return_value,
  status = excluded.status,
  inspection_status = excluded.inspection_status,
  refund_status = excluded.refund_status,
  carrier_status = excluded.carrier_status,
  has_conflict = excluded.has_conflict,
  approval_status = excluded.approval_status,
  risk_level = excluded.risk_level,
  linked_refund_id = excluded.linked_refund_id,
  linked_shipment_id = excluded.linked_shipment_id,
  system_states = excluded.system_states,
  conflict_detected = excluded.conflict_detected,
  recommended_action = excluded.recommended_action,
  summary = excluded.summary,
  badges = excluded.badges,
  tab = excluded.tab,
  method = excluded.method,
  received_at_warehouse = excluded.received_at_warehouse,
  brand = excluded.brand,
  country = excluded.country,
  currency = excluded.currency,
  last_update = excluded.last_update,
  updated_at = excluded.updated_at;

-- ─── Reconciliation Issues ────────────────────────────────────────────────────
insert into reconciliation_issues (id, case_id, tenant_id, entity_type, entity_id, conflict_domain, severity, status, conflicting_systems, expected_state, actual_states, source_of_truth_system, resolution_plan, detected_at, resolved_at, detected_by, workspace_id)
values
  ('issue_001', 'case_001', 'org_default', 'payment', 'pay_001', 'bank_clearance', 'high', 'open', jsonb_build_array('psp', 'oms'), 'Refund should settle after warehouse receipt', jsonb_build_object('psp', 'refunded', 'oms', 'pending', 'warehouse', 'received'), 'psp', 'Wait for bank clearance', timestamp '2026-04-15 12:05:00+00', null, 'reconciler', 'ws_default'),
  ('issue_002', 'case_001', 'org_default', 'return', 'return_001', 'refund_sync', 'medium', 'open', jsonb_build_array('psp', 'warehouse'), 'Refund should remain pending until warehouse confirms receipt', jsonb_build_object('psp', 'settled', 'warehouse', 'received'), 'warehouse', 'Backfill warehouse receipt and reconcile refund', timestamp '2026-04-15 12:06:00+00', null, 'reconciler', 'ws_default'),
  ('issue_003', 'case_002', 'org_default', 'order', 'order_002', 'fulfillment', 'medium', 'open', jsonb_build_array('oms', 'warehouse'), 'Cancellation should win before packing', jsonb_build_object('oms', 'cancelled', 'warehouse', 'packed'), 'oms', 'Hold shipment and confirm cancellation policy', timestamp '2026-04-15 11:00:00+00', null, 'reconciler', 'ws_default'),
  ('issue_004', 'case_003', 'org_default', 'payment', 'pay_007', 'chargeback', 'critical', 'open', jsonb_build_array('stripe', 'fraud'), 'Refund must stay blocked until review completes', jsonb_build_object('stripe', 'blocked', 'fraud', 'flagged'), 'fraud', 'Keep payment blocked and escalate to risk', timestamp '2026-04-15 10:35:00+00', null, 'risk-engine', 'ws_default'),
  ('issue_005', 'case_004', 'org_default', 'return', 'return_006', 'replacement', 'high', 'open', jsonb_build_array('returns', 'warehouse'), 'Replacement should wait for warehouse confirmation', jsonb_build_object('returns', 'approval_needed', 'warehouse', 'in_transit'), 'warehouse', 'Wait for warehouse scan before approving replacement', timestamp '2026-04-15 12:18:00+00', null, 'reconciler', 'ws_default'),
  ('issue_006', 'case_004', 'org_default', 'order', 'order_008', 'replacement', 'high', 'open', jsonb_build_array('oms', 'warehouse'), 'Replacement order should stay pending until receipt', jsonb_build_object('oms', 'shipped', 'warehouse', 'in_transit'), 'warehouse', 'Wait for warehouse confirmation', timestamp '2026-04-15 12:19:00+00', null, 'reconciler', 'ws_default')
on conflict (id) do update set
  case_id = excluded.case_id,
  tenant_id = excluded.tenant_id,
  entity_type = excluded.entity_type,
  entity_id = excluded.entity_id,
  conflict_domain = excluded.conflict_domain,
  severity = excluded.severity,
  status = excluded.status,
  conflicting_systems = excluded.conflicting_systems,
  expected_state = excluded.expected_state,
  actual_states = excluded.actual_states,
  source_of_truth_system = excluded.source_of_truth_system,
  resolution_plan = excluded.resolution_plan,
  detected_at = excluded.detected_at,
  resolved_at = excluded.resolved_at,
  detected_by = excluded.detected_by,
  workspace_id = excluded.workspace_id;

-- ─── Case Links ───────────────────────────────────────────────────────────────
insert into case_links (id, case_id, linked_case_id, link_type, created_by, created_at, tenant_id)
values
  ('cl_001', 'case_001', 'case_002', 'related', 'user_alex', timestamp '2026-04-15 12:11:00+00', 'org_default'),
  ('cl_002', 'case_001', 'case_003', 'escalated', 'system', timestamp '2026-04-15 12:12:00+00', 'org_default'),
  ('cl_003', 'case_001', 'case_004', 'related', 'user_alex', timestamp '2026-04-15 12:13:00+00', 'org_default'),
  ('cl_004', 'case_002', 'case_001', 'related', 'user_sarah', timestamp '2026-04-15 11:10:00+00', 'org_default'),
  ('cl_005', 'case_003', 'case_001', 'escalated_from', 'system', timestamp '2026-04-15 10:45:00+00', 'org_default'),
  ('cl_006', 'case_004', 'case_001', 'related', 'user_alex', timestamp '2026-04-15 12:18:00+00', 'org_default')
on conflict (id) do update set
  case_id = excluded.case_id,
  linked_case_id = excluded.linked_case_id,
  link_type = excluded.link_type,
  created_by = excluded.created_by,
  created_at = excluded.created_at,
  tenant_id = excluded.tenant_id;

-- ─── Draft Replies ────────────────────────────────────────────────────────────
insert into draft_replies (id, case_id, conversation_id, content, generated_by, generated_at, tone, confidence, has_policies, citations, status, reviewed_by, reviewed_at, sent_at, updated_at, tenant_id, workspace_id)
values
  ('draft_001', 'case_001', 'conv_001', 'Hi Sarah, we are confirming the bank clearance and will update you as soon as the refund settles.', 'copilot', timestamp '2026-04-15 12:09:00+00', 'professional', 0.96, true, jsonb_build_array('pr_refund_approval'), 'pending_review', null, null, null, timestamp '2026-04-15 12:09:00+00', 'org_default', 'ws_default'),
  ('draft_002', 'case_002', 'conv_002', 'Hi Marcus, we have paused the shipment while we confirm the cancellation with the warehouse.', 'copilot', timestamp '2026-04-15 11:00:00+00', 'professional', 0.92, true, jsonb_build_array('pr_cancel_approval'), 'pending_review', null, null, null, timestamp '2026-04-15 11:00:00+00', 'org_default', 'ws_default'),
  ('draft_003', 'case_003', 'conv_003', 'Hi Elena, the chargeback is still blocked while we reconcile the return receipt with the PSP.', 'copilot', timestamp '2026-04-15 10:40:00+00', 'professional', 0.94, true, jsonb_build_array('pr_chargeback_review'), 'pending_review', null, null, null, timestamp '2026-04-15 10:40:00+00', 'org_default', 'ws_default'),
  ('draft_004', 'case_004', 'conv_004', 'Hi Elena, we are waiting for the warehouse scan before approving the replacement order.', 'copilot', timestamp '2026-04-15 12:18:00+00', 'professional', 0.93, true, jsonb_build_array('pr_replacement_approval'), 'pending_review', null, null, null, timestamp '2026-04-15 12:18:00+00', 'org_default', 'ws_default')
on conflict (id) do update set
  case_id = excluded.case_id,
  conversation_id = excluded.conversation_id,
  content = excluded.content,
  generated_by = excluded.generated_by,
  generated_at = excluded.generated_at,
  tone = excluded.tone,
  confidence = excluded.confidence,
  has_policies = excluded.has_policies,
  citations = excluded.citations,
  status = excluded.status,
  reviewed_by = excluded.reviewed_by,
  reviewed_at = excluded.reviewed_at,
  sent_at = excluded.sent_at,
  updated_at = excluded.updated_at,
  tenant_id = excluded.tenant_id,
  workspace_id = excluded.workspace_id;

-- ─── Internal Notes ───────────────────────────────────────────────────────────
insert into internal_notes (id, case_id, content, created_by, created_by_type, created_at, tenant_id, workspace_id)
values
  ('note_001', 'case_001', 'PSP and OMS disagree on refund state. Keep the customer updated and wait for bank clearance.', 'user_alex', 'human', timestamp '2026-04-15 12:06:00+00', 'org_default', 'ws_default'),
  ('note_002', 'case_001', 'Warehouse receipt confirmed. Reconciliation is the only blocker.', 'system', 'system', timestamp '2026-04-15 12:07:00+00', 'org_default', 'ws_default'),
  ('note_003', 'case_002', 'Cancellation should stay on hold until the warehouse scan is backfilled.', 'user_sarah', 'human', timestamp '2026-04-15 11:02:00+00', 'org_default', 'ws_default'),
  ('note_004', 'case_003', 'Chargeback and refund are blocked until the risk team clears the ticket.', 'user_james', 'human', timestamp '2026-04-15 10:38:00+00', 'org_default', 'ws_default'),
  ('note_005', 'case_004', 'Replacement can proceed once the warehouse confirms receipt.', 'user_alex', 'human', timestamp '2026-04-15 12:16:00+00', 'org_default', 'ws_default')
on conflict (id) do update set
  case_id = excluded.case_id,
  content = excluded.content,
  created_by = excluded.created_by,
  created_by_type = excluded.created_by_type,
  created_at = excluded.created_at,
  tenant_id = excluded.tenant_id,
  workspace_id = excluded.workspace_id;

-- ─── Messages ─────────────────────────────────────────────────────────────────
insert into messages (id, conversation_id, case_id, customer_id, type, direction, sender_id, sender_name, content, content_type, channel, external_message_id, draft_reply_id, sentiment, sentiment_score, attachments, sent_at, created_at, delivered_at, read_at, tenant_id)
values
  ('msg_001', 'conv_001', 'case_001', 'cust_sarah', 'customer', 'inbound', 'cust_sarah', 'Sarah Jenkins', 'Hi, my refund still shows as pending.', 'text', 'web_chat', 'webchat-msg-1', null, 'neutral', 0.20, jsonb_build_array(), timestamp '2026-04-15 07:55:00+00', timestamp '2026-04-15 07:55:00+00', timestamp '2026-04-15 07:55:20+00', timestamp '2026-04-15 07:56:00+00', 'org_default'),
  ('msg_002', 'conv_001', 'case_001', 'cust_sarah', 'agent', 'outbound', 'user_alex', 'Alex Morgan', 'We are checking with the bank now.', 'text', 'web_chat', 'webchat-msg-2', 'draft_001', 'neutral', 0.10, jsonb_build_array(), timestamp '2026-04-15 08:32:00+00', timestamp '2026-04-15 08:32:00+00', timestamp '2026-04-15 08:32:10+00', timestamp '2026-04-15 08:33:00+00', 'org_default'),
  ('msg_003', 'conv_001', 'case_001', 'cust_sarah', 'customer', 'inbound', 'cust_sarah', 'Sarah Jenkins', 'Thanks, please keep me posted.', 'text', 'web_chat', 'webchat-msg-3', null, 'neutral', 0.18, jsonb_build_array(), timestamp '2026-04-15 11:58:00+00', timestamp '2026-04-15 11:58:00+00', timestamp '2026-04-15 11:58:10+00', timestamp '2026-04-15 11:59:00+00', 'org_default'),
  ('msg_004', 'conv_001', 'case_001', 'cust_sarah', 'agent', 'outbound', 'user_alex', 'Alex Morgan', 'Hi Sarah, I am checking with the bank and will update you shortly.', 'text', 'web_chat', 'webchat-msg-4', 'draft_001', 'neutral', 0.14, jsonb_build_array(), timestamp '2026-04-15 12:10:00+00', timestamp '2026-04-15 12:10:00+00', timestamp '2026-04-15 12:10:10+00', timestamp '2026-04-15 12:10:30+00', 'org_default'),
  ('msg_005', 'conv_002', 'case_002', 'cust_marcus', 'customer', 'inbound', 'cust_marcus', 'Marcus Chen', 'Please cancel my order before shipment leaves.', 'text', 'email', 'email-msg-1', null, 'neutral', 0.12, jsonb_build_array(), timestamp '2026-04-15 09:45:00+00', timestamp '2026-04-15 09:45:00+00', timestamp '2026-04-15 09:45:15+00', timestamp '2026-04-15 09:46:00+00', 'org_default'),
  ('msg_006', 'conv_002', 'case_002', 'cust_marcus', 'agent', 'outbound', 'user_sarah', 'Sarah Jenkins', 'The order was already packed. I am checking the warehouse sync.', 'text', 'email', 'email-msg-2', 'draft_002', 'neutral', 0.10, jsonb_build_array(), timestamp '2026-04-15 10:40:00+00', timestamp '2026-04-15 10:40:00+00', timestamp '2026-04-15 10:40:10+00', timestamp '2026-04-15 10:40:50+00', 'org_default'),
  ('msg_007', 'conv_002', 'case_002', 'cust_marcus', 'agent', 'outbound', 'user_sarah', 'Sarah Jenkins', 'We have now paused the shipment while cancellation is reviewed.', 'text', 'email', 'email-msg-3', 'draft_002', 'neutral', 0.11, jsonb_build_array(), timestamp '2026-04-15 11:05:00+00', timestamp '2026-04-15 11:05:00+00', timestamp '2026-04-15 11:05:10+00', timestamp '2026-04-15 11:05:35+00', 'org_default'),
  ('msg_008', 'conv_003', 'case_003', 'cust_elena', 'customer', 'inbound', 'cust_elena', 'Elena Rodriguez', 'My chargeback arrived before the return was received.', 'text', 'whatsapp', 'whatsapp-msg-1', null, 'neutral', 0.15, jsonb_build_array(), timestamp '2026-04-15 08:10:00+00', timestamp '2026-04-15 08:10:00+00', timestamp '2026-04-15 08:10:10+00', timestamp '2026-04-15 08:11:00+00', 'org_default'),
  ('msg_009', 'conv_003', 'case_003', 'cust_elena', 'agent', 'outbound', 'user_james', 'James Wilson', 'We are blocking the refund until the warehouse confirms receipt.', 'text', 'whatsapp', 'whatsapp-msg-2', 'draft_003', 'neutral', 0.12, jsonb_build_array(), timestamp '2026-04-15 09:20:00+00', timestamp '2026-04-15 09:20:00+00', timestamp '2026-04-15 09:20:10+00', timestamp '2026-04-15 09:21:00+00', 'org_default'),
  ('msg_010', 'conv_003', 'case_003', 'cust_elena', 'customer', 'inbound', 'cust_elena', 'Elena Rodriguez', 'Understood. Please keep the chargeback blocked for now.', 'text', 'whatsapp', 'whatsapp-msg-3', null, 'neutral', 0.16, jsonb_build_array(), timestamp '2026-04-15 10:45:00+00', timestamp '2026-04-15 10:45:00+00', timestamp '2026-04-15 10:45:10+00', timestamp '2026-04-15 10:45:40+00', 'org_default'),
  ('msg_011', 'conv_004', 'case_004', 'cust_elena', 'customer', 'inbound', 'cust_elena', 'Elena Rodriguez', 'The replacement arrived damaged and I already sent the return back.', 'text', 'email', 'email-msg-4', null, 'neutral', 0.10, jsonb_build_array(), timestamp '2026-04-15 09:20:00+00', timestamp '2026-04-15 09:20:00+00', timestamp '2026-04-15 09:20:20+00', timestamp '2026-04-15 09:21:00+00', 'org_default'),
  ('msg_012', 'conv_004', 'case_004', 'cust_elena', 'agent', 'outbound', 'user_alex', 'Alex Morgan', 'We are waiting for the warehouse scan before approving the replacement.', 'text', 'email', 'email-msg-5', 'draft_004', 'neutral', 0.13, jsonb_build_array(), timestamp '2026-04-15 12:20:00+00', timestamp '2026-04-15 12:20:00+00', timestamp '2026-04-15 12:20:10+00', timestamp '2026-04-15 12:20:30+00', 'org_default')
on conflict (id) do update set
  conversation_id = excluded.conversation_id,
  case_id = excluded.case_id,
  customer_id = excluded.customer_id,
  type = excluded.type,
  direction = excluded.direction,
  sender_id = excluded.sender_id,
  sender_name = excluded.sender_name,
  content = excluded.content,
  content_type = excluded.content_type,
  channel = excluded.channel,
  external_message_id = excluded.external_message_id,
  draft_reply_id = excluded.draft_reply_id,
  sentiment = excluded.sentiment,
  sentiment_score = excluded.sentiment_score,
  attachments = excluded.attachments,
  sent_at = excluded.sent_at,
  delivered_at = excluded.delivered_at,
  read_at = excluded.read_at,
  tenant_id = excluded.tenant_id;

commit;
