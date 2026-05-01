begin;

update knowledge_articles
set
  review_cycle_days = 45,
  last_reviewed_at = timestamp '2026-04-15 12:00:00+00',
  next_review_at = timestamp '2026-05-30 12:00:00+00',
  content_structured = jsonb_build_object(
    'summary', 'Bank clearance playbook for approved refunds waiting on OMS reconciliation.',
    'policy', 'Refunds remain pending until bank settlement clears and the customer receives a consistent status update.',
    'allowed', jsonb_build_array(
      'Explain that bank clearance can take multiple business days.',
      'Keep the customer informed while the refund is processing.',
      'Close the case only after payment and OMS states agree.'
    ),
    'blocked', jsonb_build_array(
      'Do not mark the case resolved while the bank clearance is still pending.',
      'Do not re-run the refund if a valid processing attempt already exists.'
    ),
    'escalation', jsonb_build_array(
      'Escalate to finance if bank clearance exceeds the stated settlement window.',
      'Escalate if the PSP and OMS disagree after the waiting period.'
    ),
    'evidence', jsonb_build_array(
      'Payment timeline',
      'OMS status',
      'Bank settlement reference'
    ),
    'agent_notes', jsonb_build_array(
      'Use this article as the canonical refund clearance reference.',
      'Mention the waiting period explicitly in agent replies.'
    ),
    'examples', jsonb_build_array(
      'PSP approved but OMS still pending -> wait for clearance',
      'Bank cleared and OMS reconciled -> close the case'
    ),
    'keywords', jsonb_build_array('refund', 'bank clearance', 'oms', 'settlement', 'reconciliation')
  ),
  linked_workflow_ids = jsonb_build_array('wfd_refund_ops'),
  linked_approval_policy_ids = jsonb_build_array('pr_chargeback_review'),
  updated_at = timestamp '2026-04-15 12:30:00+00'
where id = 'ka_refund_clearance' and tenant_id = 'org_default' and workspace_id = 'ws_default';

update knowledge_articles
set
  review_cycle_days = 60,
  last_reviewed_at = timestamp '2026-04-15 12:05:00+00',
  next_review_at = timestamp '2026-06-14 12:05:00+00',
  content_structured = jsonb_build_object(
    'summary', 'Warehouse scan guidance for return and replacement operations.',
    'policy', 'Returns and replacements stay pending until the warehouse scan validates the item or the label.',
    'allowed', jsonb_build_array(
      'Continue waiting while warehouse confirmation is missing.',
      'Use the scan result as the deciding signal for the next action.'
    ),
    'blocked', jsonb_build_array(
      'Do not approve a replacement before the warehouse confirms receipt.',
      'Do not change the case state based on customer expectation alone.'
    ),
    'escalation', jsonb_build_array(
      'Escalate when scan data does not match the shipped item.',
      'Escalate when the label is missing or invalid.'
    ),
    'evidence', jsonb_build_array(
      'Warehouse scan',
      'Carrier label',
      'Return receipt'
    ),
    'agent_notes', jsonb_build_array(
      'This article is the operational source for replacement timing.',
      'The agent should prefer warehouse truth over customer expectation.'
    ),
    'examples', jsonb_build_array(
      'No warehouse scan yet -> keep pending',
      'Scan confirms receipt -> allow progression'
    ),
    'keywords', jsonb_build_array('warehouse', 'scan', 'replacement', 'return', 'receipt')
  ),
  linked_workflow_ids = jsonb_build_array('wfd_replacement_ops'),
  linked_approval_policy_ids = jsonb_build_array('pr_replacement_approval'),
  updated_at = timestamp '2026-04-15 12:30:00+00'
where id = 'ka_warehouse_scan' and tenant_id = 'org_default' and workspace_id = 'ws_default';

update knowledge_articles
set
  review_cycle_days = 90,
  last_reviewed_at = timestamp '2026-04-15 12:08:00+00',
  next_review_at = timestamp '2026-07-14 12:08:00+00',
  content_structured = jsonb_build_object(
    'summary', 'Replacement approval policy with strict warehouse confirmation and high-risk guardrails.',
    'policy', 'Warehouse confirmation is required before approving a replacement order.',
    'allowed', jsonb_build_array(
      'Approve replacements once receipt or confirmed scan is present.',
      'Use the approval gate when risk is elevated.'
    ),
    'blocked', jsonb_build_array(
      'Do not approve high-risk replacements before warehouse confirmation.',
      'Do not treat a pending label as confirmation.'
    ),
    'escalation', jsonb_build_array(
      'Escalate any risk flags that conflict with a replacement request.',
      'Escalate if the warehouse confirmation is incomplete.'
    ),
    'evidence', jsonb_build_array(
      'Warehouse confirmation',
      'Replacement order details',
      'Risk assessment'
    ),
    'agent_notes', jsonb_build_array(
      'This is the strictest replacement approval source.',
      'The agent should cite the warehouse signal every time.'
    ),
    'examples', jsonb_build_array(
      'Confirmed warehouse receipt -> approve',
      'Risk flag without confirmation -> block'
    ),
    'keywords', jsonb_build_array('replacement', 'warehouse', 'approval', 'risk', 'receipt')
  ),
  linked_workflow_ids = jsonb_build_array('wfd_replacement_ops'),
  linked_approval_policy_ids = jsonb_build_array('pr_replacement_approval'),
  updated_at = timestamp '2026-04-15 12:30:00+00'
where id = 'ka_replacement_policy' and tenant_id = 'org_default' and workspace_id = 'ws_default';

update knowledge_articles
set
  review_cycle_days = 90,
  last_reviewed_at = timestamp '2026-04-15 12:06:00+00',
  next_review_at = timestamp '2026-07-14 12:06:00+00',
  content_structured = jsonb_build_object(
    'summary', 'Chargeback response SOP for disputed orders and payment reversals.',
    'policy', 'Chargebacks must be answered within five business days with evidence-backed narratives.',
    'allowed', jsonb_build_array(
      'Dispute chargebacks when delivery and acceptance evidence exists.',
      'Use inspection photos for damaged-return disputes.'
    ),
    'blocked', jsonb_build_array(
      'Do not dispute without delivery evidence.',
      'Do not promise a dispute win before reviewing the full record.'
    ),
    'escalation', jsonb_build_array(
      'Escalate missing delivery evidence immediately.',
      'Escalate any finance or legal risk to a human reviewer.'
    ),
    'evidence', jsonb_build_array(
      'Carrier tracking',
      'Order confirmation',
      'Communication history',
      'Inspection photos'
    ),
    'agent_notes', jsonb_build_array(
      'The response should be factual, short, and evidence-heavy.',
      'Always mention the deadline in the workflow summary.'
    ),
    'examples', jsonb_build_array(
      'Delivered and no return -> dispute the chargeback',
      'Not delivered -> accept chargeback and investigate carrier'
    ),
    'keywords', jsonb_build_array('chargeback', 'dispute', 'evidence', 'delivery', 'inspection')
  ),
  linked_workflow_ids = jsonb_build_array('wfd_refund_ops'),
  linked_approval_policy_ids = jsonb_build_array('pr_chargeback_review'),
  updated_at = timestamp '2026-04-15 12:30:00+00'
where id = 'ka_chargeback_playbook' and tenant_id = 'org_default' and workspace_id = 'ws_default';

update knowledge_articles
set
  review_cycle_days = 30,
  last_reviewed_at = timestamp '2026-04-15 12:10:00+00',
  next_review_at = timestamp '2026-05-30 12:10:00+00',
  content_structured = jsonb_build_object(
    'summary', 'Connector runbook for inspecting Shopify, Stripe, OMS, and WMS health before trusting downstream data.',
    'policy', 'Integration health must be verified before operational data is treated as canonical.',
    'allowed', jsonb_build_array(
      'Check connector status and latest health timestamp.',
      'Use the connector capability list to find the correct system source.'
    ),
    'blocked', jsonb_build_array(
      'Do not treat a stale connector as healthy.',
      'Do not use downstream data if the runtime health check has not passed.'
    ),
    'escalation', jsonb_build_array(
      'Escalate when connector health and database state diverge.',
      'Escalate when a runtime credential is missing or expired.'
    ),
    'evidence', jsonb_build_array(
      'Connector health',
      'Capability list',
      'Latest webhook or sync event'
    ),
    'agent_notes', jsonb_build_array(
      'Use this runbook as the source of truth for integrations.',
      'Prefer the newest health check over the DB status label.'
    ),
    'examples', jsonb_build_array(
      'Connected in DB but runtime missing credentials -> not configured',
      'Healthy connector with recent sync -> safe to trust'
    ),
    'keywords', jsonb_build_array('connector', 'health', 'sync', 'runtime', 'credential')
  ),
  linked_workflow_ids = jsonb_build_array('wfd_connector_watch'),
  linked_approval_policy_ids = jsonb_build_array('pr_cancel_approval'),
  updated_at = timestamp '2026-04-15 12:30:00+00'
where id = 'ka_connector_runbook' and tenant_id = 'org_default' and workspace_id = 'ws_default';

update knowledge_articles
set
  review_cycle_days = 30,
  last_reviewed_at = timestamp '2026-04-15 12:12:00+00',
  next_review_at = timestamp '2026-05-15 12:12:00+00',
  content_structured = jsonb_build_object(
    'summary', 'AI Studio guardrails for permissions, reasoning, safety, and knowledge access.',
    'policy', 'Agent rollouts must remain constrained until the live profile is validated.',
    'allowed', jsonb_build_array(
      'Adjust reasoning depth only within the approved tier.',
      'Limit knowledge access until the profile passes validation.'
    ),
    'blocked', jsonb_build_array(
      'Do not publish broad access without validation.',
      'Do not bypass safety checks for convenience.'
    ),
    'escalation', jsonb_build_array(
      'Escalate when policy changes widen access unexpectedly.',
      'Escalate when a model or reasoning tier changes without approval.'
    ),
    'evidence', jsonb_build_array(
      'Policy bundle',
      'Reasoning profile',
      'Safety profile'
    ),
    'agent_notes', jsonb_build_array(
      'AI Studio should mirror the backend catalog and active version.',
      'Use this article when reasoning about agent access changes.'
    ),
    'examples', jsonb_build_array(
      'Knowledge access narrowed to limited -> valid',
      'Rollout widened without validation -> block'
    ),
    'keywords', jsonb_build_array('ai studio', 'guardrails', 'knowledge', 'permissions', 'safety')
  ),
  linked_workflow_ids = jsonb_build_array('wfd_connector_watch'),
  linked_approval_policy_ids = jsonb_build_array('pr_replacement_approval'),
  updated_at = timestamp '2026-04-15 12:30:00+00'
where id = 'ka_ai_guardrails' and tenant_id = 'org_default' and workspace_id = 'ws_default';

commit;
