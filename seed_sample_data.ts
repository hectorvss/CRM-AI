import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const tenantId = 'tenant_1';
const workspaceId = 'ws_default';
const now = new Date().toISOString();

async function upsert(table: string, rows: Record<string, any> | Record<string, any>[]) {
  const payload = Array.isArray(rows) ? rows : [rows];
  const { error } = await supabase.from(table).upsert(payload);
  if (error) {
    console.error(`[seed] ${table}:`, error.message);
    throw error;
  }
  console.log(`[seed] ${table}: ${payload.length}`);
}

async function seedData() {
  console.log('Seeding CRM AI demo data to Supabase...');

  await upsert('organizations', {
    id: tenantId,
    name: 'Supply Ops Demo',
    slug: 'supply-ops-demo',
    created_at: now,
  });

  await upsert('workspaces', {
    id: workspaceId,
    org_id: tenantId,
    name: 'Default Workspace',
    slug: 'default-workspace',
    plan_id: 'pro',
    settings: {
      timezone: 'Europe/Madrid',
      languages: ['en', 'es'],
      channels: ['email', 'web_chat', 'whatsapp'],
    },
    created_at: now,
    updated_at: now,
  });

  await upsert('users', [
    {
      id: 'system',
      email: 'system@crm-ai.local',
      name: 'System',
      role: 'workspace_admin',
      is_system: 1,
      created_at: now,
    },
    {
      id: 'user_alex',
      email: 'alex@crm-ai.local',
      name: 'Alex Morgan',
      role: 'workspace_admin',
      is_system: 0,
      created_at: now,
    },
  ]);

  await upsert('roles', [
    {
      id: 'workspace_admin',
      workspace_id: workspaceId,
      name: 'Workspace Admin',
      permissions: ['*'],
      is_system: 1,
      tenant_id: tenantId,
    },
    {
      id: 'supervisor',
      workspace_id: workspaceId,
      name: 'Supervisor',
      permissions: ['cases.read', 'cases.write', 'approvals.read', 'approvals.decide', 'workflows.read', 'workflows.write', 'knowledge.read', 'knowledge.write', 'reports.read', 'settings.read', 'settings.write', 'members.read', 'audit.read'],
      is_system: 1,
      tenant_id: tenantId,
    },
  ]);

  const permissionKeys = [
    'cases.read', 'cases.write', 'cases.assign',
    'approvals.read', 'approvals.decide',
    'workflows.read', 'workflows.write', 'workflows.trigger',
    'knowledge.read', 'knowledge.write', 'knowledge.publish',
    'reports.read', 'reports.export',
    'settings.read', 'settings.write',
    'members.read', 'members.invite', 'members.remove',
    'audit.read', 'billing.read', 'billing.manage',
  ];

  await upsert('permissions', permissionKeys.map((key) => {
    const [module, action] = key.split('.');
    return {
      key,
      module,
      action,
      description: `${action} ${module}`,
      created_at: now,
    };
  }));

  await upsert('role_permissions', [
    ...permissionKeys.map((permission_key) => ({ role_id: 'workspace_admin', permission_key })),
    { role_id: 'supervisor', permission_key: 'cases.read' },
    { role_id: 'supervisor', permission_key: 'cases.write' },
    { role_id: 'supervisor', permission_key: 'approvals.read' },
    { role_id: 'supervisor', permission_key: 'approvals.decide' },
    { role_id: 'supervisor', permission_key: 'workflows.read' },
    { role_id: 'supervisor', permission_key: 'workflows.write' },
    { role_id: 'supervisor', permission_key: 'knowledge.read' },
    { role_id: 'supervisor', permission_key: 'knowledge.write' },
    { role_id: 'supervisor', permission_key: 'settings.read' },
    { role_id: 'supervisor', permission_key: 'settings.write' },
    { role_id: 'supervisor', permission_key: 'audit.read' },
  ]);

  await upsert('members', [
    {
      id: 'member_system',
      user_id: 'system',
      workspace_id: workspaceId,
      role_id: 'workspace_admin',
      status: 'active',
      tenant_id: tenantId,
      joined_at: now,
    },
    {
      id: 'member_alex',
      user_id: 'user_alex',
      workspace_id: workspaceId,
      role_id: 'workspace_admin',
      status: 'active',
      tenant_id: tenantId,
      joined_at: now,
    },
  ]);

  await upsert('customers', [
    {
      id: 'cust_1',
      tenant_id: tenantId,
      workspace_id: workspaceId,
      canonical_name: 'Hector Vidal',
      canonical_email: 'hector@example.com',
      segment: 'vip',
      risk_level: 'low',
      lifetime_value: 1500.5,
      total_orders: 5,
      total_spent: 1200,
      dispute_rate: 0,
      refund_rate: 0.12,
      created_at: now,
      updated_at: now,
    },
    {
      id: 'cust_2',
      tenant_id: tenantId,
      workspace_id: workspaceId,
      canonical_name: 'Maria Garcia',
      canonical_email: 'maria@example.com',
      segment: 'regular',
      risk_level: 'medium',
      lifetime_value: 450,
      total_orders: 2,
      total_spent: 400,
      dispute_rate: 0.08,
      refund_rate: 0.2,
      created_at: now,
      updated_at: now,
    },
  ]);

  await upsert('linked_identities', [
    { id: 'li_cust_1_shopify', customer_id: 'cust_1', tenant_id: tenantId, system: 'shopify', external_id: 'gid://shopify/Customer/1001', confidence: 0.99, created_at: now },
    { id: 'li_cust_1_stripe', customer_id: 'cust_1', tenant_id: tenantId, system: 'stripe', external_id: 'cus_demo_hector', confidence: 0.98, created_at: now },
    { id: 'li_cust_2_shopify', customer_id: 'cust_2', tenant_id: tenantId, system: 'shopify', external_id: 'gid://shopify/Customer/1002', confidence: 0.97, created_at: now },
  ]);

  await upsert('orders', [
    {
      id: 'ord_1',
      external_order_id: 'SHP-1001',
      customer_id: 'cust_1',
      tenant_id: tenantId,
      workspace_id: workspaceId,
      status: 'delivered',
      fulfillment_status: 'delivered',
      system_states: { oms: 'delivered', wms: 'received_return', canonical: 'refund_pending' },
      total_amount: 250,
      currency: 'EUR',
      order_date: now,
      risk_level: 'low',
      summary: 'Delivered order with return received and refund pending',
      badges: ['Delivered', 'Refund Pending'],
      tab: 'refunds',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'ord_2',
      external_order_id: 'SHP-1002',
      customer_id: 'cust_2',
      tenant_id: tenantId,
      workspace_id: workspaceId,
      status: 'processing',
      fulfillment_status: 'label_created',
      system_states: { oms: 'processing', carrier: 'label_created', canonical: 'attention' },
      total_amount: 120,
      currency: 'EUR',
      order_date: now,
      risk_level: 'medium',
      summary: 'Carrier has not scanned the parcel yet',
      badges: ['Attention'],
      tab: 'attention',
      created_at: now,
      updated_at: now,
    },
  ]);

  await upsert('payments', [
    {
      id: 'pay_1',
      external_payment_id: 'pi_demo_1001',
      order_id: 'ord_1',
      customer_id: 'cust_1',
      tenant_id: tenantId,
      workspace_id: workspaceId,
      amount: 250,
      currency: 'EUR',
      payment_method: 'Visa ending 4242',
      psp: 'Stripe',
      status: 'captured',
      system_states: { psp: 'captured', refund: 'pending', reconciliation: 'matched', canonical: 'refund_pending' },
      refund_amount: 0,
      risk_level: 'low',
      approval_status: 'pending',
      summary: 'Refund pending after warehouse receipt',
      badges: ['Refund Pending', 'Approval Needed'],
      tab: 'refunds',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'pay_2',
      external_payment_id: 'adyen_demo_1002',
      order_id: 'ord_2',
      customer_id: 'cust_2',
      tenant_id: tenantId,
      workspace_id: workspaceId,
      amount: 120,
      currency: 'EUR',
      payment_method: 'SEPA transfer',
      psp: 'Adyen',
      status: 'captured',
      system_states: { psp: 'captured', refund: 'N/A', reconciliation: 'matched', canonical: 'captured' },
      risk_level: 'medium',
      approval_status: 'not_required',
      summary: 'Captured payment, order awaiting carrier scan',
      badges: ['Captured'],
      tab: 'all',
      created_at: now,
      updated_at: now,
    },
  ]);

  await upsert('returns', [
    {
      id: 'ret_1',
      external_return_id: 'RET-1001',
      order_id: 'ord_1',
      customer_id: 'cust_1',
      tenant_id: tenantId,
      workspace_id: workspaceId,
      type: 'standard',
      return_reason: 'Wrong size',
      return_value: 250,
      status: 'received',
      inspection_status: 'awaiting_inspection',
      refund_status: 'pending',
      carrier_status: 'delivered',
      approval_status: 'pending',
      risk_level: 'low',
      system_states: { returns_platform: 'received', wms: 'received', carrier: 'delivered', canonical: 'refund_pending' },
      summary: 'Return received, refund pending approval',
      badges: ['Received', 'Refund Pending'],
      tab: 'refund_pending',
      method: 'carrier_return',
      brand: 'Supply Main Store',
      country: 'ES',
      currency: 'EUR',
      created_at: now,
      updated_at: now,
    },
  ]);

  await upsert('cases', [
    {
      id: 'case_1',
      case_number: 'CS-0001',
      tenant_id: tenantId,
      workspace_id: workspaceId,
      customer_id: 'cust_1',
      conversation_id: 'conv_1',
      type: 'refund_request',
      intent: 'refund_status',
      status: 'open',
      priority: 'high',
      risk_level: 'low',
      source_channel: 'email',
      source_system: 'shopify',
      order_ids: ['ord_1'],
      payment_ids: ['pay_1'],
      return_ids: ['ret_1'],
      approval_state: 'pending',
      active_approval_request_id: 'approval_1',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'case_2',
      case_number: 'CS-0002',
      tenant_id: tenantId,
      workspace_id: workspaceId,
      customer_id: 'cust_2',
      conversation_id: 'conv_2',
      type: 'delivery_issue',
      intent: 'order_status',
      status: 'new',
      priority: 'normal',
      risk_level: 'medium',
      source_channel: 'web_chat',
      source_system: 'shopify',
      order_ids: ['ord_2'],
      payment_ids: ['pay_2'],
      return_ids: [],
      created_at: now,
      updated_at: now,
    },
  ]);

  await upsert('conversations', [
    { id: 'conv_1', case_id: 'case_1', customer_id: 'cust_1', channel: 'email', status: 'open', subject: 'Refund for order SHP-1001', tenant_id: tenantId, workspace_id: workspaceId, created_at: now, updated_at: now },
    { id: 'conv_2', case_id: 'case_2', customer_id: 'cust_2', channel: 'web_chat', status: 'open', subject: 'Order SHP-1002 not moving', tenant_id: tenantId, workspace_id: workspaceId, created_at: now, updated_at: now },
  ]);

  await upsert('messages', [
    { id: 'msg_1', conversation_id: 'conv_1', case_id: 'case_1', customer_id: 'cust_1', type: 'customer', direction: 'inbound', sender_name: 'Hector Vidal', content: 'Hi, the warehouse received my return for SHP-1001. When will the refund arrive?', sent_at: now, tenant_id: tenantId },
    { id: 'msg_2', conversation_id: 'conv_2', case_id: 'case_2', customer_id: 'cust_2', type: 'customer', direction: 'inbound', sender_name: 'Maria Garcia', content: 'My order SHP-1002 has a label but no carrier scan yet.', sent_at: now, tenant_id: tenantId },
  ]);

  await upsert('draft_replies', [
    { id: 'draft_1', case_id: 'case_1', conversation_id: 'conv_1', content: 'Hi Hector, I can see the return was received and the refund is waiting for approval. I will keep the case open and update you as soon as it is released.', generated_by: 'seed', generated_at: now, tone: 'professional', confidence: 0.82, status: 'pending_review', tenant_id: tenantId, updated_at: now },
  ]);

  await upsert('internal_notes', [
    { id: 'note_1', case_id: 'case_1', content: 'Return received in WMS. Refund approval required before PSP action.', created_by: 'user_alex', tenant_id: tenantId, created_at: now },
  ]);

  await upsert('approval_requests', [
    {
      id: 'approval_1',
      case_id: 'case_1',
      tenant_id: tenantId,
      workspace_id: workspaceId,
      requested_by: 'refund_policy',
      requested_by_type: 'agent',
      action_type: 'issue_refund',
      action_payload: { payment_id: 'pay_1', amount: 250, currency: 'EUR', reason: 'Return received' },
      risk_level: 'medium',
      evidence_package: { return_id: 'ret_1', order_id: 'ord_1' },
      status: 'pending',
      assigned_to: 'user_alex',
      created_at: now,
      updated_at: now,
    },
  ]);

  await upsert('workflow_definitions', [
    { id: 'wf_refund_after_return', tenant_id: tenantId, workspace_id: workspaceId, name: 'Trigger refund after return received', description: 'Routes received returns into refund approval or PSP execution.', current_version_id: 'wfv_refund_after_return_v1', created_by: 'user_alex', created_at: now, updated_at: now },
  ]);

  await upsert('workflow_versions', [
    { id: 'wfv_refund_after_return_v1', workflow_id: 'wf_refund_after_return', version_number: 1, status: 'published', nodes: [{ id: 'return_received', type: 'trigger' }, { id: 'approval_check', type: 'approval' }, { id: 'issue_refund', type: 'action' }], edges: [{ source: 'return_received', target: 'approval_check' }, { source: 'approval_check', target: 'issue_refund' }], trigger: { type: 'return.received' }, published_by: 'user_alex', published_at: now, tenant_id: tenantId },
  ]);

  await upsert('workflow_runs', [
    { id: 'wfr_1', workflow_version_id: 'wfv_refund_after_return_v1', case_id: 'case_1', tenant_id: tenantId, trigger_type: 'return.received', trigger_payload: { return_id: 'ret_1' }, status: 'completed', current_node_id: 'approval_check', context: { approval_id: 'approval_1' }, started_at: now, ended_at: now },
  ]);

  await upsert('connectors', [
    { id: 'conn_shopify', tenant_id: tenantId, system: 'shopify', name: 'Shopify', status: 'connected', auth_type: 'oauth', auth_config: {}, capabilities: ['orders.read', 'orders.cancel', 'returns.read'], last_health_check_at: now, created_at: now, updated_at: now },
    { id: 'conn_stripe', tenant_id: tenantId, system: 'stripe', name: 'Stripe', status: 'connected', auth_type: 'api_key', auth_config: {}, capabilities: ['payments.read', 'refunds.create'], last_health_check_at: now, created_at: now, updated_at: now },
  ]);

  await upsert('connector_capabilities', [
    { id: 'cap_shopify_orders', connector_id: 'conn_shopify', capability_key: 'orders.read', direction: 'read', is_enabled: 1, requires_approval: 0, is_idempotent: 1 },
    { id: 'cap_shopify_cancel', connector_id: 'conn_shopify', capability_key: 'orders.cancel', direction: 'write', is_enabled: 1, requires_approval: 1, is_idempotent: 1 },
    { id: 'cap_stripe_refund', connector_id: 'conn_stripe', capability_key: 'refunds.create', direction: 'write', is_enabled: 1, requires_approval: 1, is_idempotent: 1 },
  ]);

  await upsert('knowledge_domains', [
    { id: 'kd_returns', tenant_id: tenantId, name: 'Returns and Refunds', description: 'Policies for returns, refunds, inspections and PSP writebacks.', created_at: now },
  ]);

  await upsert('knowledge_articles', [
    { id: 'ka_refunds', tenant_id: tenantId, workspace_id: workspaceId, domain_id: 'kd_returns', title: 'Refund after return received', content: 'When WMS marks a return as received, inspect the item and route refunds above 50 EUR to approval before PSP execution.', type: 'policy', status: 'published', owner_user_id: 'user_alex', version: 1, created_at: now, updated_at: now },
  ]);

  await upsert('billing_plans', [
    { id: 'pro', name: 'Pro', price_cents: 4900, currency: 'EUR', interval: 'month', created_at: now },
  ]);

  await upsert('billing_subscriptions', [
    { id: 'sub_demo', org_id: tenantId, plan_id: 'pro', status: 'active', current_period_start: now, current_period_end: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(), seats_included: 5, seats_used: 2, credits_included: 10000, credits_used: 1280, created_at: now },
  ]);

  await upsert('seats', [
    { id: 'seat_alex', org_id: tenantId, member_id: 'member_alex', seat_type: 'full', assigned_at: now, created_at: now },
  ]);

  await upsert('usage_events', [
    { id: 'usage_ai_drafts', org_id: tenantId, tenant_id: tenantId, event_type: 'ai_draft_generated', quantity: 42, unit: 'drafts', reference_id: 'case_1', reference_type: 'case', billing_period: '2026-04', occurred_at: now },
  ]);

  await upsert('credit_ledger', [
    { id: 'credit_seed_balance', org_id: tenantId, tenant_id: tenantId, entry_type: 'credit', amount: 10000, reason: 'Demo plan allowance', reference_id: 'sub_demo', balance_after: 10000, occurred_at: now },
    { id: 'credit_seed_usage', org_id: tenantId, tenant_id: tenantId, entry_type: 'debit', amount: 1280, reason: 'AI support usage', reference_id: 'usage_ai_drafts', balance_after: 8720, occurred_at: now },
  ]);

  console.log('Seed sample data complete.');
}

seedData().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
