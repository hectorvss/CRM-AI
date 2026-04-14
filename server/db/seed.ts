import { getDb } from './client.js';
import { randomUUID } from 'crypto';
import { seedAgents } from '../agents/seed.js';
import { getDatabaseProvider } from './provider.js';

const ORG_ID = 'org_default';
const TENANT_ID = ORG_ID;
const WORKSPACE_ID = 'ws_default';

export function seedDatabase(): void {
  if (getDatabaseProvider() === 'supabase') {
    console.log('ℹ️  Skipping SQLite seed (Provider is set to Supabase)');
    return;
  }

  const db = getDb();

  // Check if already seeded
  const existing = db.prepare('SELECT COUNT(*) as count FROM cases').get() as { count: number };
  if (existing.count > 0) {
    console.log('📦 Database already seeded, skipping');
    return;
  }

  console.log('🌱 Seeding database...');

  // ── Organization & Workspace ──────────────────────────────
  db.prepare(`INSERT OR IGNORE INTO organizations VALUES (?,?,?,?)`).run(
    ORG_ID, 'Acme Corp', 'acme-corp', new Date().toISOString()
  );
  db.prepare(`INSERT OR IGNORE INTO workspaces VALUES (?,?,?,?,?,?,?,?)`).run(
    WORKSPACE_ID, ORG_ID, 'Acme Support', 'acme-support', 'growth', '{}',
    new Date().toISOString(), new Date().toISOString()
  );

  // ── Users ─────────────────────────────────────────────────
  const users = [
    { id: 'user_alex', email: 'alex@acme.com', name: 'Alex Morgan', role: 'supervisor', avatar: null },
    { id: 'user_sarah', email: 'sarah@acme.com', name: 'Sarah Kim', role: 'agent', avatar: null },
    { id: 'user_james', email: 'james@acme.com', name: 'James Liu', role: 'agent', avatar: null },
  ];
  const insertUser = db.prepare(
    'INSERT OR IGNORE INTO users (id,email,name,role,avatar_url,is_system,created_at) VALUES (?,?,?,?,?,0,?)'
  );
  users.forEach(u => insertUser.run(u.id, u.email, u.name, u.role, u.avatar, new Date().toISOString()));

  // ── Teams ─────────────────────────────────────────────────
  db.prepare('INSERT OR IGNORE INTO teams VALUES (?,?,?,?,?)').run(
    'team_support', WORKSPACE_ID, 'Support Team', 'General support team', new Date().toISOString()
  );

  // ── Customers ─────────────────────────────────────────────
  const customers = [
    {
      id: 'cust_sarah_jenkins', email: 'sarah.jenkins@email.com', name: 'Sarah Jenkins',
      segment: 'vip', risk: 'medium', ltv: 4200, disputes: 0, refunds: 2, orders: 12, spent: 4200
    },
    {
      id: 'cust_marcus_chen', email: 'marcus.chen@email.com', name: 'Marcus Chen',
      segment: 'regular', risk: 'low', ltv: 320, disputes: 1, refunds: 1, orders: 3, spent: 320
    },
    {
      id: 'cust_elena_rodriguez', email: 'elena.rodriguez@email.com', name: 'Elena Rodriguez',
      segment: 'regular', risk: 'low', ltv: 89, disputes: 0, refunds: 0, orders: 1, spent: 89
    },
    {
      id: 'cust_james_wilson', email: 'james.wilson@email.com', name: 'James Wilson',
      segment: 'vip', risk: 'low', ltv: 4100, disputes: 0, refunds: 0, orders: 18, spent: 4100
    },
    {
      id: 'cust_priya_patel', email: 'priya.patel@email.com', name: 'Priya Patel',
      segment: 'regular', risk: 'low', ltv: 620, disputes: 0, refunds: 1, orders: 5, spent: 620
    },
  ];
  const insertCustomer = db.prepare(`
    INSERT OR IGNORE INTO customers
    (id,tenant_id,workspace_id,canonical_email,canonical_name,segment,risk_level,
     lifetime_value,currency,dispute_rate,refund_rate,total_orders,total_spent,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,'USD',?,?,?,?,?,?)
  `);
  customers.forEach(c => insertCustomer.run(
    c.id, TENANT_ID, WORKSPACE_ID, c.email, c.name, c.segment, c.risk, c.ltv,
    c.disputes, c.refunds, c.orders, c.spent,
    new Date().toISOString(), new Date().toISOString()
  ));

  // ── Orders ────────────────────────────────────────────────
  const orders: any[] = [
    {
      id: 'ord_55210', ext: 'ORD-55210', cust: 'cust_sarah_jenkins',
      status: 'conflict', amount: 129, brand: 'Acme Store', country: 'US',
      system_states: JSON.stringify({ shopify: 'fulfilled', oms: 'processing', psp: 'captured', carrier: 'delivered', canonical: 'conflict' }),
      conflict: 1, conflict_domain: 'payment_state',
      conflict_detected: 'PSP says refunded, OMS shows pending',
      recommended_action: 'Reconcile PSP and OMS status',
      risk: 'high', approval: 'pending', summary: 'Payment conflict between PSP and OMS',
      tab: 'conflicts', last_update: '2 hours ago', date: '2023-10-16'
    },
    {
      id: 'ord_55211', ext: 'ORD-55211', cust: 'cust_marcus_chen',
      status: 'dispute', amount: 129, brand: 'Acme Store', country: 'US',
      system_states: JSON.stringify({ shopify: 'fulfilled', oms: 'fulfilled', psp: 'captured', carrier: 'delivered', canonical: 'dispute' }),
      conflict: 0, conflict_domain: null, conflict_detected: null,
      recommended_action: 'Review warehouse inspection photos',
      risk: 'high', approval: 'pending', summary: 'Inspection failed — damaged item raised dispute',
      tab: 'attention', last_update: '1 hour ago', date: '2023-10-16'
    },
    {
      id: 'ord_55213', ext: 'ORD-55213', cust: 'cust_elena_rodriguez',
      status: 'in_transit', amount: 89, brand: 'Acme Store', country: 'US',
      system_states: JSON.stringify({ shopify: 'fulfilled', carrier: 'in_transit', canonical: 'in_transit' }),
      conflict: 0, conflict_domain: null, conflict_detected: null,
      recommended_action: 'Monitor transit status',
      risk: 'low', approval: 'not_required', summary: 'Return in transit — standard flow',
      tab: 'all', last_update: '3 hours ago', date: '2023-10-15'
    },
    {
      id: 'ord_55214', ext: 'ORD-55214', cust: 'cust_james_wilson',
      status: 'blocked', amount: 249, brand: 'Acme Store', country: 'US',
      system_states: JSON.stringify({ shopify: 'fulfilled', oms: 'fulfilled', canonical: 'blocked' }),
      conflict: 0, conflict_domain: null,
      conflict_detected: 'Return window exceeded (45 days vs 30-day policy)',
      recommended_action: 'Review exception eligibility',
      risk: 'medium', approval: 'not_required', summary: 'Return blocked — outside 30-day policy window',
      tab: 'attention', last_update: '5 hours ago', date: '2023-08-25'
    },
  ];
  const insertOrder = db.prepare(`
    INSERT OR IGNORE INTO orders
    (id,external_order_id,customer_id,tenant_id,workspace_id,status,system_states,
     total_amount,currency,country,brand,has_conflict,conflict_domain,conflict_detected,
     recommended_action,risk_level,approval_status,summary,tab,last_update,order_date,
     badges,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  orders.forEach(o => {
    const badges = [];
    if (o.conflict) badges.push('Conflict');
    if (o.risk === 'high') badges.push('High Risk');
    insertOrder.run(
      o.id, o.ext, o.cust, TENANT_ID, WORKSPACE_ID, o.status, o.system_states,
      o.amount, 'USD', o.country, o.brand, o.conflict ? 1 : 0, o.conflict_domain,
      o.conflict_detected, o.recommended_action, o.risk, o.approval, o.summary,
      o.tab, o.last_update, o.date, JSON.stringify(badges),
      new Date().toISOString(), new Date().toISOString()
    );
    // Order events
    const insertEvent = db.prepare(
      'INSERT INTO order_events (id,order_id,type,content,system,time,tenant_id) VALUES (?,?,?,?,?,?,?)'
    );
    const events = [
      { type: 'order_created', content: 'Order created', system: 'OMS', time: o.date + 'T10:00:00Z' },
      { type: 'payment_captured', content: 'Payment captured', system: 'Stripe', time: o.date + 'T10:01:00Z' },
      { type: 'fulfillment_started', content: 'Fulfillment started', system: 'WMS', time: o.date + 'T11:30:00Z' },
    ];
    events.forEach(e => insertEvent.run(randomUUID(), o.id, e.type, e.content, e.system, e.time, TENANT_ID));
  });

  // ── Payments ─────────────────────────────────────────────
  const payments: any[] = [
    {
      id: 'pay_001', ext: 'pi_55210_001', order: 'ord_55210', cust: 'cust_sarah_jenkins',
      amount: 129, method: 'Visa •••• 4242', psp: 'Stripe', status: 'refunded',
      system_states: JSON.stringify({ psp: 'refunded', oms: 'pending', reconciliation: 'pending', canonical: 'conflict' }),
      risk: 'high', type: 'standard', approval: 'pending',
      summary: 'PSP shows refunded but OMS pending — reconciliation required',
      conflict: 'PSP refunded, OMS pending',
      recommended: 'Manually sync OMS refund status',
      tab: 'disputes', last_update: '2 hours ago', badge: JSON.stringify(['Conflict', 'High Risk']),
      refund_amount: 129, refund_type: 'full'
    },
    {
      id: 'pay_002', ext: 'pi_55211_001', order: 'ord_55211', cust: 'cust_marcus_chen',
      amount: 129, method: 'Mastercard •••• 5555', psp: 'Stripe', status: 'disputed',
      system_states: JSON.stringify({ psp: 'disputed', oms: 'captured', canonical: 'disputed' }),
      risk: 'high', type: 'standard', approval: 'pending',
      summary: 'Chargeback raised due to damaged item return dispute',
      conflict: null, recommended: 'Review dispute evidence and respond',
      tab: 'disputes', last_update: '1 hour ago', badge: JSON.stringify(['Dispute', 'High Risk']),
      dispute_ref: 'DISP-2023-11450', chargeback: 129
    },
    {
      id: 'pay_003', ext: 'pi_55213_001', order: 'ord_55213', cust: 'cust_elena_rodriguez',
      amount: 89, method: 'Visa •••• 1234', psp: 'Stripe', status: 'captured',
      system_states: JSON.stringify({ psp: 'captured', oms: 'captured', canonical: 'captured' }),
      risk: 'low', type: 'standard', approval: 'not_required',
      summary: 'Payment captured. Refund pending return receipt.',
      conflict: null, recommended: null, tab: 'refunds',
      last_update: '3 hours ago', badge: JSON.stringify([]),
      refund_amount: 89, refund_type: 'full'
    },
    {
      id: 'pay_004', ext: 'pi_55214_001', order: 'ord_55214', cust: 'cust_james_wilson',
      amount: 249, method: 'Amex •••• 3782', psp: 'Stripe', status: 'captured',
      system_states: JSON.stringify({ psp: 'captured', oms: 'captured', canonical: 'captured' }),
      risk: 'low', type: 'standard', approval: 'not_required',
      summary: 'Payment captured. Return blocked by policy.',
      conflict: null, recommended: null, tab: 'all',
      last_update: '5 hours ago', badge: JSON.stringify([])
    },
  ];
  const insertPayment = db.prepare(`
    INSERT OR IGNORE INTO payments
    (id,external_payment_id,order_id,customer_id,tenant_id,amount,currency,payment_method,psp,
     status,system_states,risk_level,payment_type,approval_status,summary,conflict_detected,
     recommended_action,badges,tab,last_update,refund_amount,refund_type,dispute_reference,
     chargeback_amount,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  payments.forEach(p => insertPayment.run(
    p.id, p.ext, p.order, p.cust, TENANT_ID, p.amount, 'USD', p.method, p.psp,
    p.status, p.system_states, p.risk, p.type, p.approval, p.summary,
    p.conflict || null, p.recommended || null, p.badge || '[]', p.tab, p.last_update,
    p.refund_amount || null, p.refund_type || null, p.dispute_ref || null,
    p.chargeback || null, new Date().toISOString(), new Date().toISOString()
  ));

  // ── Returns ──────────────────────────────────────────────
  const returns: any[] = [
    {
      id: 'ret_001', ext: 'RET-20491', order: 'ord_55210', cust: 'cust_sarah_jenkins',
      type: 'return', reason: 'Item not as described', value: 129, currency: 'USD',
      status: 'refund_pending', inspection: 'passed', refund_status: 'pending',
      carrier: 'delivered', approval: 'pending', risk: 'high',
      system_states: JSON.stringify({ returns_platform: 'received', wms: 'inspected', carrier: 'delivered', psp: 'pending', canonical: 'refund_pending' }),
      conflict: 'Refund not triggered despite warehouse receipt',
      recommended: 'Trigger refund after reconciling PSP state',
      summary: 'Return received and inspected. Refund blocked by PSP conflict.',
      tab: 'refund_pending', method: 'FedEx', brand: 'Acme Store', country: 'US',
      last_update: '2 hours ago', badge: JSON.stringify(['Refund Pending', 'High Risk']),
      received: '2023-10-16T10:00:00Z'
    },
    {
      id: 'ret_002', ext: 'RET-20492', order: 'ord_55211', cust: 'cust_marcus_chen',
      type: 'return', reason: 'Damaged item', value: 129, currency: 'USD',
      status: 'blocked', inspection: 'failed', refund_status: 'blocked',
      carrier: 'delivered', approval: 'pending', risk: 'high',
      system_states: JSON.stringify({ returns_platform: 'received', wms: 'inspection_failed', carrier: 'delivered', psp: 'captured', canonical: 'blocked' }),
      conflict: 'Inspection failed — item damaged',
      recommended: 'Review photos and approve/reject dispute',
      summary: 'Inspection failed. Item arrived damaged. Manual review required.',
      tab: 'blocked', method: 'FedEx', brand: 'Acme Store', country: 'US',
      last_update: '1 hour ago', badge: JSON.stringify(['Blocked', 'High Risk']),
      received: '2023-10-16T10:00:00Z'
    },
    {
      id: 'ret_003', ext: 'RET-20493', order: 'ord_55213', cust: 'cust_elena_rodriguez',
      type: 'return', reason: 'Wrong size', value: 89, currency: 'USD',
      status: 'in_transit', inspection: null, refund_status: 'not_initiated',
      carrier: 'in_transit', approval: 'not_required', risk: 'low',
      system_states: JSON.stringify({ returns_platform: 'label_created', carrier: 'in_transit', canonical: 'in_transit' }),
      conflict: null, recommended: 'Monitor carrier status',
      summary: 'Return label created. Package in transit.',
      tab: 'in_transit', method: 'FedEx', brand: 'Acme Store', country: 'US',
      last_update: '3 hours ago', badge: JSON.stringify([]),
      received: null
    },
    {
      id: 'ret_004', ext: 'RET-20494', order: 'ord_55214', cust: 'cust_james_wilson',
      type: 'return', reason: 'Changed mind', value: 249, currency: 'USD',
      status: 'blocked', inspection: null, refund_status: 'blocked',
      carrier: null, approval: 'not_required', risk: 'medium',
      system_states: JSON.stringify({ returns_platform: 'rejected', canonical: 'blocked' }),
      conflict: null,
      recommended: 'Notify customer — beyond 30-day return window',
      summary: 'Return rejected — 45 days after delivery exceeds policy.',
      tab: 'blocked', method: null, brand: 'Acme Store', country: 'US',
      last_update: '5 hours ago', badge: JSON.stringify(['Policy Blocked']),
      received: null
    },
  ];
  const insertReturn = db.prepare(`
    INSERT OR IGNORE INTO returns
    (id,external_return_id,order_id,customer_id,tenant_id,workspace_id,type,return_reason,
     return_value,currency,status,inspection_status,refund_status,carrier_status,approval_status,
     risk_level,system_states,conflict_detected,recommended_action,summary,tab,method,brand,country,
     last_update,badges,received_at_warehouse,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  returns.forEach(r => insertReturn.run(
    r.id, r.ext, r.order, r.cust, TENANT_ID, WORKSPACE_ID, r.type, r.reason,
    r.value, r.currency, r.status, r.inspection || null, r.refund_status,
    r.carrier || null, r.approval, r.risk, r.system_states,
    r.conflict || null, r.recommended, r.summary, r.tab, r.method || null,
    r.brand, r.country, r.last_update, r.badge, r.received || null,
    new Date().toISOString(), new Date().toISOString()
  ));

  // ── Cases ─────────────────────────────────────────────────
  const cases: any[] = [
    {
      id: 'case_001', number: 'CASE-2024-00001', cust: 'cust_sarah_jenkins',
      type: 'reconciliation', status: 'pending_approval', priority: 'urgent',
      severity: 'S1', risk: 'high', score: 88,
      assigned: 'user_alex', team: 'team_support',
      sla_status: 'at_risk', sla_res: new Date(Date.now() + 2 * 3600000).toISOString(),
      order_ids: JSON.stringify(['ord_55210']), payment_ids: JSON.stringify(['pay_001']),
      return_ids: JSON.stringify(['ret_001']),
      diagnosis: "A critical bidirectionality issue has been detected. The PSP (Stripe) has processed the refund successfully, but the OMS is stuck in 'Pending' state. This mismatch is blocking the return workflow completion.",
      root_cause: "Stripe refund event was not propagated to OMS due to a webhook delivery failure. The OMS never received the state update.",
      confidence: 0.94,
      recommended: 'Manually reconcile OMS refund status, then trigger return completion workflow.',
      approval_state: 'pending', exec_state: 'planned', resolution: 'unresolved',
      conflict: 1, conflict_severity: 'critical',
      source: 'email', channel: 'email',
      intent: 'refund_status_inquiry', intent_confidence: 0.93,
      conv: 'conv_001', created: '2023-10-16T09:00:00Z',
      last_activity: '2023-10-16T11:30:00Z',
      tags: JSON.stringify(['refund', 'conflict', 'VIP']), tab: 'high_risk'
    },
    {
      id: 'case_002', number: 'CASE-2024-00002', cust: 'cust_marcus_chen',
      type: 'return', status: 'in_review', priority: 'high',
      severity: 'S2', risk: 'high', score: 72,
      assigned: 'user_sarah', team: 'team_support',
      sla_status: 'at_risk', sla_res: new Date(Date.now() + 4 * 3600000).toISOString(),
      order_ids: JSON.stringify(['ord_55211']), payment_ids: JSON.stringify(['pay_002']),
      return_ids: JSON.stringify(['ret_002']),
      diagnosis: "Warehouse inspection failed — the returned item was flagged as damaged. A dispute has been automatically raised and requires manual review.",
      root_cause: "Customer returned a damaged item. Now disputed. Needs photo evidence review.",
      confidence: 0.87,
      recommended: 'Review warehouse inspection photos. Approve or reject the dispute.',
      approval_state: 'pending', exec_state: 'idle', resolution: 'unresolved',
      conflict: 0, conflict_severity: null,
      source: 'web_chat', channel: 'web_chat',
      intent: 'dispute_resolution', intent_confidence: 0.88,
      conv: 'conv_002', created: '2023-10-16T10:00:00Z',
      last_activity: '2023-10-16T11:10:00Z',
      tags: JSON.stringify(['dispute', 'damaged', 'return']), tab: 'high_risk'
    },
    {
      id: 'case_003', number: 'CASE-2024-00003', cust: 'cust_elena_rodriguez',
      type: 'return', status: 'waiting', priority: 'normal',
      severity: 'S3', risk: 'low', score: 12,
      assigned: 'user_james', team: 'team_support',
      sla_status: 'on_track', sla_res: new Date(Date.now() + 24 * 3600000).toISOString(),
      order_ids: JSON.stringify(['ord_55213']), payment_ids: JSON.stringify(['pay_003']),
      return_ids: JSON.stringify(['ret_003']),
      diagnosis: "Return process proceeding normally. Package in transit. No issues detected.",
      root_cause: "No issues. Customer initiated a standard return within the policy window.",
      confidence: 0.97,
      recommended: 'Monitor carrier status. Auto-process refund on warehouse receipt.',
      approval_state: 'not_required', exec_state: 'idle', resolution: 'unresolved',
      conflict: 0, conflict_severity: null,
      source: 'email', channel: 'email',
      intent: 'return_status', intent_confidence: 0.95,
      conv: 'conv_003', created: '2023-10-15T09:05:00Z',
      last_activity: '2023-10-15T14:00:00Z',
      tags: JSON.stringify(['return', 'in_transit']), tab: 'assigned'
    },
    {
      id: 'case_004', number: 'CASE-2024-00004', cust: 'cust_james_wilson',
      type: 'return', status: 'in_review', priority: 'high',
      severity: 'S2', risk: 'medium', score: 41,
      assigned: 'user_alex', team: 'team_support',
      sla_status: 'on_track', sla_res: new Date(Date.now() + 6 * 3600000).toISOString(),
      order_ids: JSON.stringify(['ord_55214']), payment_ids: JSON.stringify(['pay_004']),
      return_ids: JSON.stringify(['ret_004']),
      diagnosis: "Return blocked by policy. Customer attempted return 45 days after delivery — 15 days past our 30-day window. VIP customer flagged for exception review.",
      root_cause: "Customer is VIP with $4k+ LTV. Policy blocks the return but exception may be warranted.",
      confidence: 0.91,
      recommended: 'VIP exception review. Consider approving as goodwill gesture to preserve LTV.',
      approval_state: 'not_required', exec_state: 'idle', resolution: 'unresolved',
      conflict: 0, conflict_severity: null,
      source: 'email', channel: 'email',
      intent: 'return_request', intent_confidence: 0.97,
      conv: 'conv_004', created: '2023-10-15T09:00:00Z',
      last_activity: '2023-10-15T09:05:00Z',
      tags: JSON.stringify(['policy_block', 'VIP', 'exception']), tab: 'assigned'
    },
  ];
  const insertCase = db.prepare(`
    INSERT OR IGNORE INTO cases
    (id,case_number,tenant_id,workspace_id,source_system,source_channel,type,intent,intent_confidence,
     status,priority,severity,risk_level,risk_score,assigned_user_id,assigned_team_id,
     sla_status,sla_resolution_deadline,customer_id,order_ids,payment_ids,return_ids,
     ai_diagnosis,ai_root_cause,ai_confidence,ai_recommended_action,
     approval_state,execution_state,resolution_state,
     has_reconciliation_conflicts,conflict_severity,
     conversation_id,created_at,updated_at,last_activity_at,tags)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  cases.forEach(c => insertCase.run(
    c.id, c.number, TENANT_ID, WORKSPACE_ID, c.source, c.channel, c.type,
    c.intent, c.intent_confidence, c.status, c.priority, c.severity, c.risk, c.score,
    c.assigned, c.team, c.sla_status, c.sla_res, c.cust,
    c.order_ids, c.payment_ids, c.return_ids,
    c.diagnosis, c.root_cause, c.confidence, c.recommended,
    c.approval_state, c.exec_state, c.resolution,
    c.conflict, c.conflict_severity,
    c.conv, c.created, new Date().toISOString(), c.last_activity, c.tags
  ));

  // ── Conversations & Messages ──────────────────────────────
  const conversations = [
    { id: 'conv_001', case_id: 'case_001', cust: 'cust_sarah_jenkins', channel: 'email' },
    { id: 'conv_002', case_id: 'case_002', cust: 'cust_marcus_chen', channel: 'web_chat' },
    { id: 'conv_003', case_id: 'case_003', cust: 'cust_elena_rodriguez', channel: 'email' },
    { id: 'conv_004', case_id: 'case_004', cust: 'cust_james_wilson', channel: 'email' },
  ];
  const insertConv = db.prepare(
    'INSERT OR IGNORE INTO conversations (id,case_id,customer_id,channel,status,created_at,tenant_id,workspace_id) VALUES (?,?,?,?,?,?,?,?)'
  );
  conversations.forEach(c => insertConv.run(c.id, c.case_id, c.cust, c.channel, 'open', new Date().toISOString(), TENANT_ID, WORKSPACE_ID));

  const messages = [
    // Case 001 — Sarah Jenkins refund conflict
    { conv: 'conv_001', case_id: 'case_001', type: 'customer', sender: null, name: 'Sarah Jenkins', content: "Hi, I requested a refund for order ORD-55210 over a week ago. The tracking shows it was returned but I still haven't received my refund. Can you help?", time: '2023-10-16T09:00:00Z' },
    { conv: 'conv_001', case_id: 'case_001', type: 'system', sender: null, name: 'System', content: 'Case created and assigned to Alex Morgan. SLA: 4 hours.', time: '2023-10-16T09:01:00Z' },
    { conv: 'conv_001', case_id: 'case_001', type: 'ai', sender: null, name: 'AI Copilot', content: 'Analyzing case... Detected PSP/OMS state conflict. Stripe shows refund processed, OMS shows pending. Reconciliation required before communicating to customer.', time: '2023-10-16T09:02:00Z' },
    { conv: 'conv_001', case_id: 'case_001', type: 'internal', sender: 'user_alex', name: 'Alex Morgan', content: 'Confirming conflict. OMS webhook seems to have failed. Processing reconciliation now.', time: '2023-10-16T09:15:00Z' },
    // Case 002 — Marcus Chen damaged item
    { conv: 'conv_002', case_id: 'case_002', type: 'customer', sender: null, name: 'Marcus Chen', content: "I returned my order ORD-55211 but I'm being told there's a problem with the inspection. What's going on?", time: '2023-10-16T10:00:00Z' },
    { conv: 'conv_002', case_id: 'case_002', type: 'system', sender: null, name: 'System', content: 'Case escalated — inspection failure detected. Assigned to Sarah Kim.', time: '2023-10-16T10:01:00Z' },
    { conv: 'conv_002', case_id: 'case_002', type: 'ai', sender: null, name: 'AI Copilot', content: "Warehouse inspection flagged item as 'Damaged'. Dispute raised. Recommend reviewing inspection photos before contacting customer.", time: '2023-10-16T10:02:00Z' },
    // Case 003 — Elena Rodriguez in transit
    { conv: 'conv_003', case_id: 'case_003', type: 'customer', sender: null, name: 'Elena Rodriguez', content: "Hi, just wanted to check on my return for order ORD-55213. I sent it back 2 days ago.", time: '2023-10-15T09:05:00Z' },
    { conv: 'conv_003', case_id: 'case_003', type: 'agent', sender: 'user_james', name: 'James Liu', content: "Hi Elena! Your return package is currently in transit and has been picked up by FedEx. Once we receive it at the warehouse, your refund of $89.00 will be processed within 2-3 business days. 😊", time: '2023-10-15T09:30:00Z' },
    // Case 004 — James Wilson policy block
    { conv: 'conv_004', case_id: 'case_004', type: 'customer', sender: null, name: 'James Wilson', content: "I want to return order ORD-55214. It's been a few weeks but the product isn't working correctly.", time: '2023-10-15T09:00:00Z' },
    { conv: 'conv_004', case_id: 'case_004', type: 'ai', sender: null, name: 'AI Copilot', content: "Customer is VIP with $4,100 LTV. Return is 45 days post-delivery — 15 days outside policy. Exception recommended to preserve relationship. Suggest escalating to supervisor for goodwill approval.", time: '2023-10-15T09:03:00Z' },
  ];
  const insertMsg = db.prepare(
    'INSERT INTO messages (id,conversation_id,case_id,type,sender_id,sender_name,content,channel,sent_at,tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?)'
  );
  messages.forEach(m => insertMsg.run(
    randomUUID(), m.conv, m.case_id, m.type, m.sender || null, m.name, m.content, 'email', m.time, TENANT_ID
  ));

  // ── Approval Requests ─────────────────────────────────────
  const approvals: any[] = [
    {
      id: 'apr_001', case_id: 'case_001', requested_by: 'agent_reconciliation', requested_by_type: 'agent',
      action_type: 'issue_refund', action_payload: JSON.stringify({ payment_id: 'pay_001', amount: 129, currency: 'USD', reason: 'PSP confirmed refund — OMS sync required' }),
      risk: 'high', status: 'pending', assigned_to: 'user_alex',
      expires: new Date(Date.now() + 2 * 3600000).toISOString(),
      evidence: JSON.stringify({
        case_snapshot: { id: 'case_001', type: 'reconciliation', risk_level: 'high' },
        customer_summary: 'VIP customer. LTV: $4,200. 0 prior disputes.',
        financial_context: 'Refund amount: $129. Payment settled in Stripe.',
        policy_citations: ['pol_refund_high_value'],
        ai_diagnosis: "Stripe refund confirmed. OMS stuck in pending due to webhook failure.",
        confidence: 0.94,
        risk_factors: [{ factor: 'High value refund', detail: 'Amount $129 exceeds $100 threshold' }]
      })
    },
    {
      id: 'apr_002', case_id: 'case_002', requested_by: 'agent_dispute', requested_by_type: 'agent',
      action_type: 'resolve_dispute', action_payload: JSON.stringify({ payment_id: 'pay_002', decision: 'reject_chargeback', amount: 129 }),
      risk: 'high', status: 'pending', assigned_to: 'user_alex',
      expires: new Date(Date.now() + 4 * 3600000).toISOString(),
      evidence: JSON.stringify({
        case_snapshot: { id: 'case_002', type: 'return', risk_level: 'high' },
        customer_summary: 'Regular customer. 1 prior dispute.',
        financial_context: 'Dispute amount: $129. Chargeback raised.',
        ai_diagnosis: "Item arrived damaged. Customer disputing. Photo evidence pending review.",
        confidence: 0.87,
        risk_factors: [{ factor: 'Chargeback risk', detail: 'Active chargeback from card network' }]
      })
    },
  ];
  const insertApproval = db.prepare(`
    INSERT OR IGNORE INTO approval_requests
    (id,case_id,tenant_id,workspace_id,requested_by,requested_by_type,action_type,action_payload,
     risk_level,status,assigned_to,expires_at,evidence_package,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  approvals.forEach(a => insertApproval.run(
    a.id, a.case_id, TENANT_ID, WORKSPACE_ID, a.requested_by, a.requested_by_type,
    a.action_type, a.action_payload, a.risk, a.status, a.assigned_to, a.expires,
    a.evidence, new Date().toISOString(), new Date().toISOString()
  ));

  // ── Knowledge Articles ────────────────────────────────────
  const insertDomain = db.prepare('INSERT OR IGNORE INTO knowledge_domains (id,tenant_id,name,description,created_at) VALUES (?,?,?,?,?)');
  insertDomain.run('dom_refunds', TENANT_ID, 'Refunds & Payments', 'Policies around refunds and payment processing', new Date().toISOString());
  insertDomain.run('dom_returns', TENANT_ID, 'Returns & Logistics', 'Return policies, inspection standards, and carrier guidelines', new Date().toISOString());
  insertDomain.run('dom_disputes', TENANT_ID, 'Disputes & Chargebacks', 'Chargeback handling and dispute resolution procedures', new Date().toISOString());

  const articles = [
    {
      id: 'art_001', domain: 'dom_refunds', title: 'Refund Policy — Standard',
      content: `# Standard Refund Policy\n\nRefunds are processed within 5-10 business days of return receipt.\n\n## Thresholds\n- Up to $50: Auto-approved\n- $50-$500: Agent approval required\n- Over $500: Supervisor approval required\n- VIP customers: Standard thresholds apply unless flagged\n\n## Bank Transfer Refunds\nBank transfer refunds may take 10-20 business days to appear.`,
      type: 'policy', owner: 'user_alex', citations: 12
    },
    {
      id: 'art_002', domain: 'dom_returns', title: 'Return Window Policy',
      content: `# Return Window Policy\n\n## Standard Policy\nReturns must be initiated within **30 days** of delivery.\n\n## Exceptions\n- VIP customers (Gold/Platinum): Supervisor may approve up to 60 days\n- Defective items: No time limit applies\n- Holiday purchases: Extended to 60 days (Nov 15 – Jan 15)\n\n## Process\n1. Customer initiates return via portal\n2. System validates return window\n3. Label generated if approved\n4. Refund triggered upon warehouse receipt`,
      type: 'policy', owner: 'user_alex', citations: 28
    },
    {
      id: 'art_003', domain: 'dom_disputes', title: 'Chargeback Response SOP',
      content: `# Chargeback Response Procedure\n\n## Timeline\nRespond within 5 business days of chargeback notification.\n\n## Evidence Required\n- Proof of delivery (carrier tracking)\n- Order confirmation and customer acceptance\n- Communication history\n- Inspection report (for returns)\n\n## Decision Matrix\n- Item delivered + no return initiated → Dispute the chargeback\n- Item returned damaged → Provide inspection photos, partial refund may apply\n- Item not delivered → Accept chargeback, investigate carrier`,
      type: 'sop', owner: 'user_alex', citations: 8
    },
    {
      id: 'art_004', domain: 'dom_refunds', title: 'High-Value Refund Approval Process',
      content: `# High-Value Refund Approval\n\nRefunds exceeding $500 require supervisor sign-off.\n\n## Evidence Package Required\n- Customer profile and LTV\n- Order and payment details\n- Reconciliation status across all systems\n- AI diagnosis and confidence score\n\n## SLA\nApprover must decide within 24 hours or case escalates to senior supervisor.`,
      type: 'sop', owner: 'user_alex', citations: 5
    },
  ];
  const insertArticle = db.prepare(`
    INSERT OR IGNORE INTO knowledge_articles
    (id,tenant_id,workspace_id,domain_id,title,content,type,status,owner_user_id,
     version,citation_count,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?)
  `);
  articles.forEach(a => insertArticle.run(
    a.id, TENANT_ID, WORKSPACE_ID, a.domain, a.title, a.content, a.type, 'published',
    a.owner, a.citations, new Date().toISOString(), new Date().toISOString()
  ));

  // ── Workflows ─────────────────────────────────────────────
  const wfDefs = [
    { id: 'wf_001', name: 'Auto-Refund Low Value', desc: 'Automatically process refunds under $50 after return receipt' },
    { id: 'wf_002', name: 'Return Received → Trigger Refund', desc: 'Trigger refund when warehouse confirms return receipt' },
    { id: 'wf_003', name: 'Duplicate Refund Detection', desc: 'Flag duplicate refund risk on same order within 24h' },
    { id: 'wf_004', name: 'Block Cancellation After Packing', desc: 'Prevent cancellations once order is packed or shipped' },
  ];
  const insertWfDef = db.prepare('INSERT OR IGNORE INTO workflow_definitions (id,tenant_id,workspace_id,name,description,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)');
  const insertWfVer = db.prepare('INSERT OR IGNORE INTO workflow_versions (id,workflow_id,version_number,status,nodes,edges,trigger,published_by,published_at,tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?)');
  wfDefs.forEach(w => {
    insertWfDef.run(w.id, TENANT_ID, WORKSPACE_ID, w.name, w.desc, 'user_alex', new Date().toISOString(), new Date().toISOString());
    const vId = `${w.id}_v1`;
    insertWfVer.run(vId, w.id, 1, 'published', '[]', '[]', '{}', 'user_alex', new Date().toISOString(), TENANT_ID);
    db.prepare('UPDATE workflow_definitions SET current_version_id=? WHERE id=?').run(vId, w.id);
  });

  // ── Connectors ────────────────────────────────────────────
  const connectors = [
    { id: 'conn_shopify', system: 'shopify', name: 'Shopify', status: 'healthy' },
    { id: 'conn_stripe', system: 'stripe', name: 'Stripe', status: 'healthy' },
    { id: 'conn_zendesk', system: 'zendesk', name: 'Zendesk', status: 'degraded' },
    { id: 'conn_intercom', system: 'intercom', name: 'Intercom', status: 'disconnected' },
  ];
  const insertConn = db.prepare('INSERT OR IGNORE INTO connectors (id,tenant_id,system,name,status,auth_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)');
  connectors.forEach(c => insertConn.run(c.id, TENANT_ID, c.system, c.name, c.status, 'oauth2', new Date().toISOString(), new Date().toISOString()));

  const insertPlan = db.prepare('INSERT OR IGNORE INTO billing_plans (id, name, price_cents, currency, interval, created_at) VALUES (?,?,?,?,?,?)');
  [
    ['starter', 'Starter', 4900, 'EUR', 'month'],
    ['growth', 'Growth', 12900, 'EUR', 'month'],
    ['scale', 'Scale', 29900, 'EUR', 'month'],
    ['business', 'Business', 0, 'EUR', 'month'],
  ].forEach(([id, name, price_cents, currency, interval]) => insertPlan.run(id, name, price_cents, currency, interval, new Date().toISOString()));

  const insertSubscription = db.prepare(`
    INSERT OR IGNORE INTO billing_subscriptions
    (id, org_id, plan_id, status, current_period_start, current_period_end, seats_included, seats_used, credits_included, credits_used, external_subscription_id, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  insertSubscription.run(
    'sub_org_default',
    ORG_ID,
    'growth',
    'active',
    new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString(),
    new Date(Date.now() + 16 * 24 * 3600 * 1000).toISOString(),
    8,
    2,
    20000,
    3240,
    'sub_demo_growth',
    new Date().toISOString(),
  );

  const insertLedger = db.prepare(`
    INSERT OR IGNORE INTO credit_ledger
    (id, org_id, tenant_id, entry_type, amount, reason, reference_id, balance_after, occurred_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `);
  insertLedger.run(
    'ledger_sub_001',
    ORG_ID,
    TENANT_ID,
    'debit',
    129,
    'Growth plan subscription',
    'sub_org_default',
    18871,
    new Date(Date.now() - 12 * 24 * 3600 * 1000).toISOString(),
  );
  insertLedger.run(
    'ledger_sub_002',
    ORG_ID,
    TENANT_ID,
    'debit',
    79,
    'AI credit top-up',
    'topup_credits_001',
    19621,
    new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
  );
  // ── Agents ────────────────────────────────────────────────
  const agentList = [
    { id: 'agent_supervisor', slug: 'supervisor', name: 'Supervisor', cat: 'orchestration', sys: 1, locked: 1 },
    { id: 'agent_approval_gk', slug: 'approval-gatekeeper', name: 'Approval Gatekeeper', cat: 'orchestration', sys: 1, locked: 0 },
    { id: 'agent_qa', slug: 'qa-policy-check', name: 'QA / Policy Check', cat: 'orchestration', sys: 1, locked: 0 },
    { id: 'agent_channel_ingest', slug: 'channel-ingest', name: 'Channel Ingest', cat: 'ingest', sys: 1, locked: 0 },
    { id: 'agent_canonicalizer', slug: 'canonicalizer', name: 'Canonicalizer', cat: 'ingest', sys: 1, locked: 0 },
    { id: 'agent_intent_router', slug: 'intent-router', name: 'Intent Router', cat: 'ingest', sys: 1, locked: 0 },
    { id: 'agent_knowledge', slug: 'knowledge-retriever', name: 'Knowledge Retriever', cat: 'ingest', sys: 1, locked: 0 },
    { id: 'agent_reconciliation', slug: 'reconciliation-agent', name: 'Reconciliation Agent', cat: 'resolution', sys: 1, locked: 1 },
    { id: 'agent_case_resolution', slug: 'case-resolution-planner', name: 'Case Resolution Planner', cat: 'resolution', sys: 1, locked: 0 },
    { id: 'agent_executor', slug: 'resolution-executor', name: 'Resolution Executor', cat: 'resolution', sys: 1, locked: 0 },
    { id: 'agent_audit', slug: 'audit-observability', name: 'Audit & Observability', cat: 'observability', sys: 1, locked: 1 },
  ];
  const insertAgent = db.prepare('INSERT OR IGNORE INTO agents (id,tenant_id,name,slug,category,is_system,is_locked,is_active,created_at) VALUES (?,?,?,?,?,?,?,1,?)');
  const insertAgentVer = db.prepare('INSERT OR IGNORE INTO agent_versions (id,agent_id,version_number,status,rollout_percentage,published_at,tenant_id) VALUES (?,?,?,?,?,?,?)');
  agentList.forEach(a => {
    insertAgent.run(a.id, TENANT_ID, a.name, a.slug, a.cat, a.sys, a.locked, new Date().toISOString());
    const vId = `${a.id}_v1`;
    insertAgentVer.run(vId, a.id, 1, 'published', 100, new Date().toISOString(), TENANT_ID);
    db.prepare('UPDATE agents SET current_version_id=? WHERE id=?').run(vId, a.id);
  });

  // ── Agent Engine — full 22-agent roster with profiles ────────────────
  seedAgents(db, TENANT_ID);

  console.log('✅ Database seeded successfully');
}

