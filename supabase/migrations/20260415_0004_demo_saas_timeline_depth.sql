-- Demo timeline depth: richer SaaS event history for orders, payments, returns, workflows, AI Studio, and integrations.

insert into order_events (id, order_id, type, content, system, time, tenant_id)
values
  ('oe_001', 'order_001', 'imported', 'Shopify created the order and pushed it into OMS', 'shopify', timestamp '2026-04-14 11:40:00+00', 'org_default'),
  ('oe_002', 'order_001', 'captured', 'Stripe captured the payment for the delivered order', 'stripe', timestamp '2026-04-15 08:20:00+00', 'org_default'),
  ('oe_003', 'order_001', 'delivered', 'Carrier confirmed delivery at the customer address', 'carrier', timestamp '2026-04-15 10:20:00+00', 'org_default'),
  ('oe_004', 'order_001', 'reconciled', 'OMS still shows pending while PSP is already refunded', 'oms', timestamp '2026-04-15 12:10:00+00', 'org_default'),
  ('oe_005', 'order_002', 'created', 'Shopify received the cancellation-requested order', 'shopify', timestamp '2026-04-14 11:40:30+00', 'org_default'),
  ('oe_006', 'order_002', 'packed', 'OMS marked the order as packed before cancellation landed', 'oms', timestamp '2026-04-15 09:20:00+00', 'org_default'),
  ('oe_007', 'order_002', 'cancellation_webhook', 'Cancellation webhook received from support flow', 'intercom', timestamp '2026-04-15 10:58:00+00', 'org_default'),
  ('oe_008', 'order_002', 'held', 'Warehouse hold applied pending manager approval', 'wms', timestamp '2026-04-15 11:05:00+00', 'org_default'),
  ('oe_009', 'order_003', 'captured', 'Stripe captured payment before return activity started', 'stripe', timestamp '2026-04-14 11:41:00+00', 'org_default'),
  ('oe_010', 'order_003', 'refund_synced', 'PSP refund synced back while OMS still lagged', 'stripe', timestamp '2026-04-15 12:00:00+00', 'org_default'),
  ('oe_011', 'order_003', 'return_linked', 'Return record linked to the original order', 'returns', timestamp '2026-04-15 12:01:00+00', 'org_default'),
  ('oe_012', 'order_003', 'reconciled', 'Finance reconciled duplicate capture correction', 'oms', timestamp '2026-04-15 12:02:00+00', 'org_default'),
  ('oe_013', 'order_004', 'disputed', 'Stripe dispute opened for the chargeback review', 'stripe', timestamp '2026-04-15 11:35:00+00', 'org_default'),
  ('oe_014', 'order_004', 'risk_flagged', 'Risk engine flagged the order as critical', 'risk-engine', timestamp '2026-04-15 11:36:00+00', 'org_default'),
  ('oe_015', 'order_005', 'packed', 'OMS packed the shipment before cancellation', 'oms', timestamp '2026-04-15 10:10:00+00', 'org_default'),
  ('oe_016', 'order_005', 'hold_requested', 'Cancellation hold requested by support', 'intercom', timestamp '2026-04-15 10:55:00+00', 'org_default'),
  ('oe_017', 'order_006', 'delivered', 'Carrier delivered the replacement item', 'carrier', timestamp '2026-04-15 09:50:00+00', 'org_default'),
  ('oe_018', 'order_006', 'refund_issued', 'Stripe refund issued after replacement approval', 'stripe', timestamp '2026-04-15 12:05:00+00', 'org_default'),
  ('oe_019', 'order_007', 'blocked', 'Risk engine blocked shipment on fraud hold', 'risk-engine', timestamp '2026-04-15 10:35:00+00', 'org_default'),
  ('oe_020', 'order_007', 'review_requested', 'Chargeback review requested by finance', 'finance', timestamp '2026-04-15 10:38:00+00', 'org_default'),
  ('oe_021', 'order_008', 'replacement_created', 'OMS created the replacement order', 'oms', timestamp '2026-04-15 12:12:00+00', 'org_default'),
  ('oe_022', 'order_008', 'scan_pending', 'Warehouse scan is still pending before release', 'wms', timestamp '2026-04-15 12:20:00+00', 'org_default')
on conflict (id) do update set
  order_id = excluded.order_id,
  type = excluded.type,
  content = excluded.content,
  system = excluded.system,
  time = excluded.time,
  tenant_id = excluded.tenant_id;

insert into return_events (id, return_id, type, content, system, time, tenant_id)
values
  ('rev_001', 'return_001', 'received', 'Warehouse received the returned item', 'wms', timestamp '2026-04-13 12:30:00+00', 'org_default'),
  ('rev_002', 'return_001', 'inspected', 'Inspection completed and refund kept pending', 'wms', timestamp '2026-04-14 09:15:00+00', 'org_default'),
  ('rev_003', 'return_001', 'refund_pending', 'PSP refunded but warehouse confirmation still pending', 'stripe', timestamp '2026-04-15 12:00:00+00', 'org_default'),
  ('rev_004', 'return_002', 'in_transit', 'Carrier scan shows the package still moving', 'carrier', timestamp '2026-04-15 11:30:00+00', 'org_default'),
  ('rev_005', 'return_002', 'label_validated', 'Label validated by fulfillment automation', 'oms', timestamp '2026-04-15 11:45:00+00', 'org_default'),
  ('rev_006', 'return_003', 'label_created', 'Support generated the label after cancellation', 'intercom', timestamp '2026-04-15 10:50:00+00', 'org_default'),
  ('rev_007', 'return_003', 'pending_review', 'Review required because the order was already packed', 'oms', timestamp '2026-04-15 11:05:00+00', 'org_default'),
  ('rev_008', 'return_004', 'blocked', 'Fraud hold prevented the return from progressing', 'risk-engine', timestamp '2026-04-15 10:25:00+00', 'org_default'),
  ('rev_009', 'return_004', 'escalated', 'Risk team escalation requested for chargeback overlap', 'finance', timestamp '2026-04-15 10:30:00+00', 'org_default'),
  ('rev_010', 'return_005', 'received', 'Warehouse received the damaged replacement return', 'wms', timestamp '2026-04-15 12:02:00+00', 'org_default'),
  ('rev_011', 'return_005', 'refund_pending', 'Refund still pending until replacement approval lands', 'stripe', timestamp '2026-04-15 12:05:00+00', 'org_default'),
  ('rev_012', 'return_006', 'in_transit', 'Replacement return is in transit to the warehouse', 'carrier', timestamp '2026-04-15 12:20:00+00', 'org_default'),
  ('rev_013', 'return_006', 'approval_needed', 'Approval remains pending until warehouse confirms scan', 'wms', timestamp '2026-04-15 12:21:00+00', 'org_default')
on conflict (id) do update set
  return_id = excluded.return_id,
  type = excluded.type,
  content = excluded.content,
  system = excluded.system,
  time = excluded.time,
  tenant_id = excluded.tenant_id;

insert into canonical_events (id, dedupe_key, tenant_id, workspace_id, source_system, source_entity_type, source_entity_id, event_type, event_category, occurred_at, ingested_at, processed_at, canonical_entity_type, canonical_entity_id, correlation_id, case_id, normalized_payload, confidence, mapping_version, status, updated_at)
values
  ('ce_001', 'case_001:shopify:order_imported', 'org_default', 'ws_default', 'shopify', 'order', 'order_001', 'order_imported', 'orders', timestamp '2026-04-14 11:40:00+00', timestamp '2026-04-14 11:40:05+00', timestamp '2026-04-14 11:40:10+00', 'order', 'order_001', 'corr_case_001', 'case_001', jsonb_build_object('summary', 'Order imported from Shopify and mapped into OMS'), 0.98, '1.0', 'received', timestamp '2026-04-14 11:40:10+00'),
  ('ce_002', 'case_001:stripe:payment_captured', 'org_default', 'ws_default', 'stripe', 'payment', 'pay_001', 'payment_captured', 'payments', timestamp '2026-04-15 08:20:00+00', timestamp '2026-04-15 08:20:02+00', timestamp '2026-04-15 08:20:06+00', 'payment', 'pay_001', 'corr_case_001', 'case_001', jsonb_build_object('summary', 'Stripe captured the payment before reimbursement'), 0.99, '1.0', 'received', timestamp '2026-04-15 08:20:06+00'),
  ('ce_003', 'case_001:workflow:refund_clearance_started', 'org_default', 'ws_default', 'workflow', 'case', 'case_001', 'workflow_started', 'workflows', timestamp '2026-04-15 11:58:00+00', timestamp '2026-04-15 11:58:01+00', null, 'case', 'case_001', 'corr_case_001', 'case_001', jsonb_build_object('summary', 'Refund operations workflow started'), 0.95, '1.0', 'processed', timestamp '2026-04-15 11:58:01+00'),
  ('ce_004', 'case_001:copilot:approval_requested', 'org_default', 'ws_default', 'copilot', 'approval', 'apr_001', 'approval_requested', 'approvals', timestamp '2026-04-15 12:10:00+00', timestamp '2026-04-15 12:10:02+00', null, 'approval', 'apr_001', 'corr_case_001', 'case_001', jsonb_build_object('summary', 'Approval requested while bank clearance is pending'), 0.97, '1.0', 'received', timestamp '2026-04-15 12:10:02+00'),
  ('ce_005', 'case_002:shopify:cancellation_received', 'org_default', 'ws_default', 'shopify', 'order', 'order_002', 'cancellation_received', 'orders', timestamp '2026-04-15 10:58:00+00', timestamp '2026-04-15 10:58:04+00', null, 'order', 'order_002', 'corr_case_002', 'case_002', jsonb_build_object('summary', 'Cancellation arrived after packing and held the shipment'), 0.95, '1.0', 'received', timestamp '2026-04-15 10:58:04+00'),
  ('ce_006', 'case_002:oms:shipment_held', 'org_default', 'ws_default', 'oms', 'order', 'order_002', 'shipment_held', 'orders', timestamp '2026-04-15 11:05:00+00', timestamp '2026-04-15 11:05:01+00', null, 'order', 'order_002', 'corr_case_002', 'case_002', jsonb_build_object('summary', 'OMS kept the order on hold while approval finished'), 0.96, '1.0', 'processed', timestamp '2026-04-15 11:05:01+00'),
  ('ce_007', 'case_002:copilot:approval_granted', 'org_default', 'ws_default', 'copilot', 'approval', 'apr_002', 'approval_granted', 'approvals', timestamp '2026-04-15 11:05:00+00', timestamp '2026-04-15 11:05:01+00', null, 'approval', 'apr_002', 'corr_case_002', 'case_002', jsonb_build_object('summary', 'Cancellation approval granted after warehouse scan'), 0.99, '1.0', 'processed', timestamp '2026-04-15 11:05:01+00'),
  ('ce_008', 'case_003:stripe:chargeback_blocked', 'org_default', 'ws_default', 'stripe', 'payment', 'pay_007', 'chargeback_blocked', 'payments', timestamp '2026-04-15 10:35:00+00', timestamp '2026-04-15 10:35:02+00', null, 'payment', 'pay_007', 'corr_case_003', 'case_003', jsonb_build_object('summary', 'Chargeback blocked due to risk hold'), 0.99, '1.0', 'received', timestamp '2026-04-15 10:35:02+00'),
  ('ce_009', 'case_003:workflow:chargeback_review_blocked', 'org_default', 'ws_default', 'workflow', 'case', 'case_003', 'workflow_blocked', 'workflows', timestamp '2026-04-15 10:40:00+00', timestamp '2026-04-15 10:40:03+00', null, 'case', 'case_003', 'corr_case_003', 'case_003', jsonb_build_object('summary', 'Workflow blocked while finance review expired'), 0.94, '1.0', 'processed', timestamp '2026-04-15 10:40:03+00'),
  ('ce_010', 'case_003:risk:policy_hold_applied', 'org_default', 'ws_default', 'risk-engine', 'payment', 'pay_007', 'policy_hold_applied', 'approvals', timestamp '2026-04-15 10:35:30+00', timestamp '2026-04-15 10:35:31+00', null, 'payment', 'pay_007', 'corr_case_003', 'case_003', jsonb_build_object('summary', 'Policy hold applied before refund execution'), 0.93, '1.0', 'received', timestamp '2026-04-15 10:35:31+00'),
  ('ce_011', 'case_004:returns:replacement_waiting_scan', 'org_default', 'ws_default', 'returns', 'return', 'return_006', 'replacement_waiting_scan', 'returns', timestamp '2026-04-15 12:20:00+00', timestamp '2026-04-15 12:20:01+00', null, 'return', 'return_006', 'corr_case_004', 'case_004', jsonb_build_object('summary', 'Replacement remains pending warehouse scan'), 0.96, '1.0', 'received', timestamp '2026-04-15 12:20:01+00'),
  ('ce_012', 'case_004:approval:replacement_pending', 'org_default', 'ws_default', 'copilot', 'approval', 'apr_005', 'approval_pending', 'approvals', timestamp '2026-04-15 12:18:00+00', timestamp '2026-04-15 12:18:02+00', null, 'approval', 'apr_005', 'corr_case_004', 'case_004', jsonb_build_object('summary', 'Replacement approval waiting on warehouse confirmation'), 0.98, '1.0', 'received', timestamp '2026-04-15 12:18:02+00')
on conflict (id) do update set
  dedupe_key = excluded.dedupe_key,
  tenant_id = excluded.tenant_id,
  workspace_id = excluded.workspace_id,
  source_system = excluded.source_system,
  source_entity_type = excluded.source_entity_type,
  source_entity_id = excluded.source_entity_id,
  event_type = excluded.event_type,
  event_category = excluded.event_category,
  occurred_at = excluded.occurred_at,
  ingested_at = excluded.ingested_at,
  processed_at = excluded.processed_at,
  canonical_entity_type = excluded.canonical_entity_type,
  canonical_entity_id = excluded.canonical_entity_id,
  correlation_id = excluded.correlation_id,
  case_id = excluded.case_id,
  normalized_payload = excluded.normalized_payload,
  confidence = excluded.confidence,
  mapping_version = excluded.mapping_version,
  status = excluded.status,
  updated_at = excluded.updated_at;

insert into workflow_run_steps (id, workflow_run_id, node_id, node_type, status, input, output, started_at, ended_at, error)
values
  ('wfrs_001', 'wfr_001', 'check_psp', 'task', 'completed', jsonb_build_object('order_id', 'order_001'), jsonb_build_object('summary', 'PSP settled amount confirmed'), timestamp '2026-04-15 12:40:10+00', timestamp '2026-04-15 12:40:30+00', null),
  ('wfrs_002', 'wfr_001', 'reconcile_oms', 'task', 'running', jsonb_build_object('order_id', 'order_001'), jsonb_build_object('summary', 'OMS still pending reconciliation'), timestamp '2026-04-15 12:40:35+00', null, null),
  ('wfrs_003', 'wfr_002', 'wait_warehouse', 'task', 'running', jsonb_build_object('return_id', 'return_003'), jsonb_build_object('summary', 'Waiting for warehouse scan'), timestamp '2026-04-15 12:40:15+00', null, null),
  ('wfrs_004', 'wfr_002', 'confirm_cancel', 'task', 'completed', jsonb_build_object('case_id', 'case_002'), jsonb_build_object('summary', 'Cancellation approved by support'), timestamp '2026-04-15 12:40:25+00', timestamp '2026-04-15 12:40:45+00', null),
  ('wfrs_005', 'wfr_003', 'compare_states', 'task', 'blocked', jsonb_build_object('payment_id', 'pay_007'), jsonb_build_object('summary', 'Stripe and OMS mismatch persisted'), timestamp '2026-04-15 12:40:20+00', timestamp '2026-04-15 12:41:00+00', 'state mismatch'),
  ('wfrs_006', 'wfr_004', 'approve_replacement', 'approval', 'running', jsonb_build_object('return_id', 'return_006'), jsonb_build_object('summary', 'Awaiting warehouse confirmation before approval'), timestamp '2026-04-15 12:40:35+00', null, null)
on conflict (id) do update set
  workflow_run_id = excluded.workflow_run_id,
  node_id = excluded.node_id,
  node_type = excluded.node_type,
  status = excluded.status,
  input = excluded.input,
  output = excluded.output,
  started_at = excluded.started_at,
  ended_at = excluded.ended_at,
  error = excluded.error;

insert into agent_runs (id, case_id, tenant_id, workspace_id, agent_id, agent_version_id, trigger_event, trigger_type, status, outcome_status, confidence, summary, output, evidence_refs, execution_decision, tokens_used, cost_credits, error, error_message, started_at, ended_at, finished_at)
values
  ('ar_001', 'case_001', 'org_default', 'ws_default', 'agent_copilot', 'agv_copilot_v1', 'case_created', 'case_event', 'completed', 'completed', 0.98, 'Copilot confirmed bank clearance and drafted the follow-up reply', jsonb_build_object('summary', 'Reply prepared for Sarah'), jsonb_build_array('ce_001', 'ce_004'), 'proceed', 1820, 0.42, null, null, timestamp '2026-04-15 11:58:00+00', timestamp '2026-04-15 12:00:00+00', timestamp '2026-04-15 12:00:00+00'),
  ('ar_002', 'case_001', 'org_default', 'ws_default', 'agent_refunds', 'agv_refunds_v1', 'approval_requested', 'approval_event', 'running', 'running', 0.92, 'Refund specialist waiting on PSP and OMS alignment', jsonb_build_object('summary', 'Clearance check in progress'), jsonb_build_array('ce_002'), 'hold', 1450, 0.31, null, null, timestamp '2026-04-15 12:05:00+00', null, null),
  ('ar_003', 'case_002', 'org_default', 'ws_default', 'agent_shopify_connector', 'agv_shopify_connector_v1', 'case_created', 'case_event', 'completed', 'completed', 0.95, 'Shopify connector ingested the cancellation notice', jsonb_build_object('summary', 'Cancellation sync complete'), jsonb_build_array('ce_005', 'ce_006'), 'proceed', 980, 0.18, null, null, timestamp '2026-04-15 10:58:00+00', timestamp '2026-04-15 11:02:00+00', timestamp '2026-04-15 11:02:00+00'),
  ('ar_004', 'case_003', 'org_default', 'ws_default', 'agent_canonicalizer', 'agv_canonicalizer_v1', 'manual_review', 'case_event', 'blocked', 'blocked', 0.89, 'Canonicalizer detected payment and return mismatch', jsonb_build_object('summary', 'State mismatch surfaced to risk'), jsonb_build_array('ce_008', 'ce_009'), 'pause', 1320, 0.27, 'state mismatch', 'Stripe and OMS disagree on refund state', timestamp '2026-04-15 10:40:00+00', timestamp '2026-04-15 10:41:00+00', timestamp '2026-04-15 10:41:00+00'),
  ('ar_005', 'case_004', 'org_default', 'ws_default', 'agent_returns_specialist', 'agv_returns_specialist_v1', 'case_created', 'case_event', 'running', 'running', 0.94, 'Returns specialist is waiting for warehouse confirmation', jsonb_build_object('summary', 'Replacement approval pending'), jsonb_build_array('ce_011', 'ce_012'), 'proceed', 1110, 0.22, null, null, timestamp '2026-04-15 12:15:00+00', null, null),
  ('ar_006', 'case_004', 'org_default', 'ws_default', 'agent_copilot', 'agv_copilot_v1', 'reply_requested', 'case_event', 'completed', 'completed', 0.97, 'Copilot drafted the reply for replacement approval', jsonb_build_object('summary', 'Customer update ready'), jsonb_build_array('ce_012'), 'proceed', 940, 0.20, null, null, timestamp '2026-04-15 12:18:00+00', timestamp '2026-04-15 12:19:00+00', timestamp '2026-04-15 12:19:00+00')
on conflict (id) do update set
  case_id = excluded.case_id,
  tenant_id = excluded.tenant_id,
  workspace_id = excluded.workspace_id,
  agent_id = excluded.agent_id,
  agent_version_id = excluded.agent_version_id,
  trigger_event = excluded.trigger_event,
  trigger_type = excluded.trigger_type,
  status = excluded.status,
  outcome_status = excluded.outcome_status,
  confidence = excluded.confidence,
  summary = excluded.summary,
  output = excluded.output,
  evidence_refs = excluded.evidence_refs,
  execution_decision = excluded.execution_decision,
  tokens_used = excluded.tokens_used,
  cost_credits = excluded.cost_credits,
  error = excluded.error,
  error_message = excluded.error_message,
  started_at = excluded.started_at,
  ended_at = excluded.ended_at,
  finished_at = excluded.finished_at;

insert into webhook_events (id, connector_id, tenant_id, source_system, event_type, raw_payload, received_at, processed_at, status, canonical_event_id, dedupe_key)
values
  ('wh_001', 'conn_shopify', 'org_default', 'shopify', 'order.created', jsonb_build_object('order_id', 'order_001', 'source', 'shopify'), timestamp '2026-04-14 11:40:00+00', timestamp '2026-04-14 11:40:05+00', 'processed', 'ce_001', 'shopify-order-001'),
  ('wh_002', 'conn_stripe', 'org_default', 'stripe', 'payment.captured', jsonb_build_object('payment_id', 'pay_001', 'source', 'stripe'), timestamp '2026-04-15 08:20:00+00', timestamp '2026-04-15 08:20:04+00', 'processed', 'ce_002', 'stripe-payment-001'),
  ('wh_003', 'conn_oms', 'org_default', 'oms', 'order.cancelled', jsonb_build_object('order_id', 'order_002', 'source', 'oms'), timestamp '2026-04-15 10:58:00+00', timestamp '2026-04-15 11:05:00+00', 'processed', 'ce_005', 'oms-cancel-002'),
  ('wh_004', 'conn_wms', 'org_default', 'wms', 'return.received', jsonb_build_object('return_id', 'return_001', 'source', 'wms'), timestamp '2026-04-15 12:00:00+00', timestamp '2026-04-15 12:01:00+00', 'processed', 'ce_011', 'wms-return-001'),
  ('wh_005', 'conn_stripe', 'org_default', 'stripe', 'refund.blocked', jsonb_build_object('payment_id', 'pay_007', 'source', 'stripe'), timestamp '2026-04-15 10:35:00+00', timestamp '2026-04-15 10:35:03+00', 'received', 'ce_008', 'stripe-blocked-007'),
  ('wh_006', 'conn_intercom', 'org_default', 'intercom', 'approval.requested', jsonb_build_object('approval_id', 'apr_005', 'source', 'intercom'), timestamp '2026-04-15 12:18:00+00', timestamp '2026-04-15 12:18:02+00', 'processed', 'ce_012', 'intercom-apr-005'),
  ('wh_007', 'conn_oms', 'org_default', 'oms', 'workflow.step.completed', jsonb_build_object('workflow_run_id', 'wfr_001', 'source', 'oms'), timestamp '2026-04-15 12:40:30+00', timestamp '2026-04-15 12:40:31+00', 'processed', null, 'oms-step-001'),
  ('wh_008', 'conn_wms', 'org_default', 'wms', 'workflow.step.pending', jsonb_build_object('workflow_run_id', 'wfr_004', 'source', 'wms'), timestamp '2026-04-15 12:40:35+00', timestamp '2026-04-15 12:40:36+00', 'received', null, 'wms-step-004')
on conflict (id) do update set
  connector_id = excluded.connector_id,
  tenant_id = excluded.tenant_id,
  source_system = excluded.source_system,
  event_type = excluded.event_type,
  raw_payload = excluded.raw_payload,
  received_at = excluded.received_at,
  processed_at = excluded.processed_at,
  status = excluded.status,
  canonical_event_id = excluded.canonical_event_id,
  dedupe_key = excluded.dedupe_key;
