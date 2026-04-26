begin;

create table if not exists public.payment_events (
  id text primary key,
  payment_id text not null references public.payments(id),
  type text not null,
  content text not null,
  system text,
  time timestamptz not null default now(),
  tenant_id text not null
);

alter table public.payments
  add column if not exists authorized_at timestamptz,
  add column if not exists captured_at timestamptz,
  add column if not exists refund_status text,
  add column if not exists refund_details jsonb default '[]'::jsonb,
  add column if not exists reconciliation_details jsonb default '{}'::jsonb;

update public.payments set
  authorized_at = timestamp '2026-04-10 08:00:10+00',
  captured_at = timestamp '2026-04-10 08:00:45+00',
  refund_status = 'pending_bank_clearance',
  refund_details = '[{"attempt":1,"initiated_at":"2026-04-13T09:05:00Z","amount":129.00,"status":"processing","psp_ref":"re_001_a"}]'::jsonb,
  reconciliation_details = '{"status":"mismatch","oms_state":"refunded","psp_state":"captured","diff_cents":0}'::jsonb,
  payment_method = 'Visa ···· 4242',
  conflict_detected = 'PSP captured, OMS shows refunded — bank clearance pending',
  recommended_action = 'Wait for bank settlement; retry refund if 3d exceeded',
  summary = 'Refund initiated — pending bank clearance',
  has_conflict = true,
  badges = '["Captured","Refund Pending","Mismatch"]'::jsonb,
  tab = 'reconciliation',
  risk_level = 'medium'
where id = 'pay_001';

update public.payments set
  authorized_at = timestamp '2026-04-11 09:00:20+00',
  captured_at = timestamp '2026-04-11 09:01:00+00',
  refund_status = 'N/A',
  reconciliation_details = '{"status":"pending","notes":"Cancellation approval pending — refund on hold"}'::jsonb,
  payment_method = 'Bank Transfer',
  psp = 'stripe',
  summary = 'Payment captured — cancellation under review',
  has_conflict = false,
  badges = '["Captured","Cancellation Pending"]'::jsonb,
  tab = 'all',
  risk_level = 'medium'
where id = 'pay_002';

update public.payments set
  authorized_at = timestamp '2026-04-09 10:00:20+00',
  captured_at = timestamp '2026-04-09 10:01:00+00',
  refund_status = 'succeeded',
  refund_details = '[{"attempt":1,"initiated_at":"2026-04-09T14:00:00Z","amount":64.00,"status":"succeeded","psp_ref":"re_004_a"}]'::jsonb,
  reconciliation_details = '{"status":"mismatch","notes":"Chargeback opened after refund — duplicate exposure"}'::jsonb,
  payment_method = 'PayPal',
  psp = 'paypal',
  conflict_detected = 'Chargeback opened on an already-refunded payment',
  recommended_action = 'Upload refund receipt to PayPal dispute portal',
  summary = 'Refund succeeded — chargeback opened by customer',
  has_conflict = true,
  badges = '["Refunded","Dispute","Conflict"]'::jsonb,
  tab = 'disputes',
  risk_level = 'high',
  dispute_reference = 'PP-D-99413'
where id = 'pay_004';

update public.payments set
  authorized_at = timestamp '2026-04-13 09:00:25+00',
  captured_at = timestamp '2026-04-13 09:01:00+00',
  refund_status = 'N/A',
  reconciliation_details = '{"status":"pending","notes":"Cancellation approval required before refund"}'::jsonb,
  payment_method = 'Visa ···· 1234',
  summary = 'Payment pending cancellation review — no refund yet',
  has_conflict = false,
  badges = '["Captured","Pending Approval"]'::jsonb,
  tab = 'all',
  risk_level = 'medium'
where id = 'pay_005';

update public.payments set
  authorized_at = timestamp '2026-04-08 08:00:15+00',
  captured_at = timestamp '2026-04-08 08:01:00+00',
  refund_status = 'N/A',
  reconciliation_details = '{"status":"matched","notes":"All systems in sync"}'::jsonb,
  payment_method = 'Mastercard ···· 8884',
  summary = 'Payment settled — no issues',
  has_conflict = false,
  badges = '["Captured","Matched"]'::jsonb,
  tab = 'all',
  risk_level = 'low'
where id = 'pay_006';

update public.payments set
  authorized_at = timestamp '2026-04-14 14:00:20+00',
  captured_at = null,
  refund_status = 'N/A',
  conflict_detected = 'Fraud flag raised — authorization held, not captured',
  recommended_action = 'Complete fraud review before allowing capture',
  reconciliation_details = '{"status":"on_hold","notes":"Authorization held pending fraud review"}'::jsonb,
  payment_method = 'Visa ···· 9876',
  summary = 'Authorization held — fraud review in progress',
  has_conflict = true,
  badges = '["Fraud Flag","Blocked","High Risk"]'::jsonb,
  tab = 'blocked',
  risk_level = 'critical'
where id = 'pay_007';

update public.payments set
  authorized_at = timestamp '2026-04-15 10:00:20+00',
  captured_at = timestamp '2026-04-15 10:01:00+00',
  refund_status = 'N/A',
  reconciliation_details = '{"status":"matched","notes":"Replacement payment captured and settled"}'::jsonb,
  payment_method = 'Apple Pay',
  summary = 'Replacement payment captured — awaiting carrier scan',
  has_conflict = false,
  badges = '["Authorized","In Transit"]'::jsonb,
  tab = 'all',
  risk_level = 'high'
where id = 'pay_008';

update public.payments set
  authorized_at = timestamp '2026-04-12 08:00:05+00',
  captured_at = timestamp '2026-04-12 08:00:50+00',
  refund_status = 'succeeded',
  refund_details = '[{"attempt":1,"initiated_at":"2026-04-12T09:00:00Z","amount":129.00,"status":"succeeded","psp_ref":"re_003_a"}]'::jsonb,
  reconciliation_details = '{"status":"matched","notes":"Refund completed and reconciled"}'::jsonb,
  payment_method = 'Visa ···· 5566',
  summary = 'Full refund completed — reconciled',
  has_conflict = false,
  badges = '["Refunded","Matched"]'::jsonb,
  tab = 'refunds',
  risk_level = 'low'
where id = 'pay_003';

insert into public.payment_events (id, payment_id, type, content, system, time, tenant_id) values
  ('pe_001_1','pay_001','authorized',      'Payment authorized — $129.00','Stripe', timestamp '2026-04-10 08:00:10+00','org_default'),
  ('pe_001_2','pay_001','captured',        'Payment captured successfully','Stripe', timestamp '2026-04-10 08:00:45+00','org_default'),
  ('pe_001_3','pay_001','refund_requested','Refund requested via OMS','OMS', timestamp '2026-04-13 09:00:00+00','org_default'),
  ('pe_001_4','pay_001','refund_initiated','Refund initiated in PSP','Stripe', timestamp '2026-04-13 09:05:00+00','org_default'),
  ('pe_001_5','pay_001','pending_bank',   'Awaiting bank clearance — T+3 expected','Bank', timestamp '2026-04-13 09:05:30+00','org_default'),
  ('pe_002_1','pay_002','authorized',      'Payment authorized — $89.00','Stripe', timestamp '2026-04-11 09:00:20+00','org_default'),
  ('pe_002_2','pay_002','captured',        'Payment captured','Stripe', timestamp '2026-04-11 09:01:00+00','org_default'),
  ('pe_002_3','pay_002','cancellation_hold','Refund on hold pending ops cancellation approval','System', timestamp '2026-04-11 12:01:00+00','org_default'),
  ('pe_003_1','pay_003','authorized',      'Payment authorized — $129.00','Stripe', timestamp '2026-04-09 10:00:20+00','org_default'),
  ('pe_003_2','pay_003','captured',        'Payment captured','Stripe', timestamp '2026-04-09 10:01:00+00','org_default'),
  ('pe_003_3','pay_003','refund_requested','Refund requested after return','OMS', timestamp '2026-04-11 11:00:00+00','org_default'),
  ('pe_003_4','pay_003','refund_succeeded','Refund of $129.00 succeeded','Stripe', timestamp '2026-04-12 09:00:00+00','org_default'),
  ('pe_003_5','pay_003','reconciled',      'Payment fully reconciled','System', timestamp '2026-04-12 09:30:00+00','org_default'),
  ('pe_004_1','pay_004','authorized',      'Payment authorized — $64.00','PayPal', timestamp '2026-04-09 10:00:20+00','org_default'),
  ('pe_004_2','pay_004','captured',        'Payment captured','PayPal', timestamp '2026-04-09 10:01:00+00','org_default'),
  ('pe_004_3','pay_004','refund_triggered','Refund triggered on cancellation','OMS', timestamp '2026-04-09 14:00:00+00','org_default'),
  ('pe_004_4','pay_004','refund_succeeded','Refund of $64.00 succeeded','PayPal', timestamp '2026-04-09 14:05:00+00','org_default'),
  ('pe_004_5','pay_004','dispute_opened',  'Chargeback opened — Item not received (dispute PP-D-99413)','PayPal', timestamp '2026-04-11 08:00:00+00','org_default'),
  ('pe_004_6','pay_004','evidence_needed', 'Upload refund receipt evidence to PayPal by Apr 25','System', timestamp '2026-04-11 08:05:00+00','org_default'),
  ('pe_005_1','pay_005','authorized',      'Payment authorized — $109.00','Stripe', timestamp '2026-04-13 09:00:25+00','org_default'),
  ('pe_005_2','pay_005','captured',        'Payment captured','Stripe', timestamp '2026-04-13 09:01:00+00','org_default'),
  ('pe_005_3','pay_005','cancellation_hold','Refund pending ops approval — cancellation in review','System', timestamp '2026-04-13 12:01:00+00','org_default'),
  ('pe_006_1','pay_006','authorized',      'Payment authorized — $249.00','Stripe', timestamp '2026-04-08 08:00:15+00','org_default'),
  ('pe_006_2','pay_006','captured',        'Payment captured','Stripe', timestamp '2026-04-08 08:01:00+00','org_default'),
  ('pe_006_3','pay_006','settled',         'Payment settled and reconciled','Stripe', timestamp '2026-04-08 20:00:00+00','org_default'),
  ('pe_007_1','pay_007','authorized',      'Payment authorization initiated — $340.00','Stripe', timestamp '2026-04-14 14:00:20+00','org_default'),
  ('pe_007_2','pay_007','fraud_flagged',   'Stripe Radar fraud flag — score 94/100','Stripe', timestamp '2026-04-14 14:00:22+00','org_default'),
  ('pe_007_3','pay_007','capture_blocked',  'Capture blocked pending manual fraud review','System', timestamp '2026-04-14 14:00:25+00','org_default'),
  ('pe_007_4','pay_007','review_requested','Manual review requested — ops team notified','System', timestamp '2026-04-14 14:02:00+00','org_default'),
  ('pe_008_1','pay_008','authorized',      'Replacement payment authorized — $159.00','Stripe', timestamp '2026-04-15 10:00:20+00','org_default'),
  ('pe_008_2','pay_008','captured',        'Payment captured','Stripe', timestamp '2026-04-15 10:01:00+00','org_default'),
  ('pe_008_3','pay_008','settled',         'Payment settled','Stripe', timestamp '2026-04-15 22:00:00+00','org_default')
on conflict (id) do nothing;

commit;
