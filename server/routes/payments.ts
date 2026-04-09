import { Router, Response } from 'express';
import { getDb } from '../db/client.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { parseRow } from '../db/utils.js';
import { getPaymentCanonicalContext, getReturnCanonicalContext } from '../services/canonicalState.js';

const router = Router();

// Apply multi-tenant middleware to all payment routes
router.use(extractMultiTenant);

function titleCase(value: string | null | undefined): string {
  if (!value) return 'N/A';
  return value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function compactBadges(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value) && value !== 'N/A')));
}

function buildPaymentTab(row: any) {
  const summary = (row.summary || '').toLowerCase();
  if (row.conflict_detected || row.has_conflict) return 'blocked';
  if (summary.includes('dispute') || row.dispute_reference || row.system_states?.dispute === 'Open') return 'disputes';
  if (summary.includes('reconciliation') || row.system_states?.reconciliation === 'Pending') return 'reconciliation';
  if (summary.includes('refund') || row.system_states?.refund !== 'N/A') return 'refunds';
  return 'all';
}

function enrichPayment(row: any, tenantId: string, workspaceId: string) {
  const parsed = parseRow(row) as any;
  const context = getPaymentCanonicalContext(parsed.id, tenantId, workspaceId);
  const caseState = context?.case_state;
  const systems = caseState?.systems;
  const primaryReturn = caseState?.related.returns?.[0];
  const approval = caseState?.related.approvals?.[0];
  const badges = compactBadges([
    titleCase(parsed.status),
    parsed.refund_status ? titleCase(parsed.refund_status) : null,
    parsed.dispute_reference ? 'Dispute' : null,
    caseState?.conflict.has_conflict ? 'Mismatch' : null,
    approval?.status === 'pending' ? 'Approval Needed' : null,
    parsed.risk_level === 'high' ? 'High Risk' : null,
  ]);

  return {
    ...parsed,
    summary: parsed.summary || caseState?.conflict.root_cause || caseState?.case?.type || '',
    recommended_action: parsed.recommended_action || caseState?.conflict.recommended_action || null,
    conflict_detected: parsed.conflict_detected || caseState?.conflict.root_cause || null,
    approval_status: parsed.approval_status || approval?.status || caseState?.case?.approval_state || 'not_required',
    system_states: {
      oms: systems?.orders?.nodes?.[0]?.value || caseState?.case?.status || 'N/A',
      psp: parsed.status || systems?.payments?.nodes?.[0]?.value || 'N/A',
      refund: parsed.refund_status || primaryReturn?.refund_status || 'N/A',
      dispute: parsed.dispute_reference ? 'Open' : 'N/A',
      reconciliation: caseState?.conflict.has_conflict ? 'Mismatch' : 'Matched',
      canonical: systems?.payments?.status || 'pending',
    },
    badges,
    tab: buildPaymentTab({
      ...parsed,
      summary: parsed.summary || caseState?.conflict.root_cause || '',
      conflict_detected: parsed.conflict_detected || caseState?.conflict.root_cause || '',
      badges,
      system_states: {
        dispute: parsed.dispute_reference ? 'Open' : 'N/A',
        reconciliation: caseState?.conflict.has_conflict ? 'Mismatch' : 'Matched',
        refund: parsed.refund_status || primaryReturn?.refund_status || 'N/A',
      },
    }),
    last_update: parsed.updated_at || parsed.created_at || null,
    events: caseState
      ? caseState.timeline.filter((entry: any) => ['payments', 'orders', 'returns', 'approvals'].includes(entry.domain))
      : [],
    related_cases: caseState?.related.linked_cases?.length
      ? caseState.related.linked_cases
      : context?.related_case
        ? [context.related_case]
        : [],
    canonical_context: context,
  };
}

// ── GET /api/payments ─────────────────────────────────────────
router.get('/', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const { status, risk_level, q } = req.query;
    
    let query = `
      SELECT p.*, cu.canonical_name as customer_name
      FROM payments p
      LEFT JOIN customers cu ON p.customer_id = cu.id
      WHERE p.tenant_id = ? AND p.workspace_id = ?
    `;
    const params: any[] = [req.tenantId, req.workspaceId];
    
    if (status) { query += ' AND p.status = ?'; params.push(status); }
    if (risk_level) { query += ' AND p.risk_level = ?'; params.push(risk_level); }
    if (q) { 
      query += ' AND (p.external_payment_id LIKE ? OR cu.canonical_name LIKE ?)'; 
      const t = `%${q}%`; 
      params.push(t, t); 
    }
    
    query += ' ORDER BY p.updated_at DESC';

    const payments = db.prepare(query).all(...params);
    res.json(payments.map(row => enrichPayment(row, req.tenantId, req.workspaceId)));
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/payments/:id ─────────────────────────────────────
router.get('/:id/context', (req: MultiTenantRequest, res: Response) => {
  try {
    const context = getPaymentCanonicalContext(req.params.id, req.tenantId, req.workspaceId);
    if (!context) return res.status(404).json({ error: 'Payment context not found' });
    res.json(context);
  } catch (error) {
    console.error('Error fetching payment context:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const payment = db.prepare(`
      SELECT p.*, cu.canonical_name as customer_name, cu.canonical_email as customer_email
      FROM payments p LEFT JOIN customers cu ON p.customer_id = cu.id
      WHERE p.id = ? AND p.tenant_id = ? AND p.workspace_id = ?
    `).get(req.params.id, req.tenantId, req.workspaceId);
    
    const context = getPaymentCanonicalContext(req.params.id, req.tenantId, req.workspaceId);

    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json({
      ...enrichPayment(payment, req.tenantId, req.workspaceId),
      canonical_context: context,
    });
  } catch (error) {
    console.error('Error fetching payment detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

// ── Returns Router ────────────────────────────────────────────
export const returnsRouter = Router();

// Apply multi-tenant middleware to all return routes
returnsRouter.use(extractMultiTenant);

function buildReturnTab(row: any) {
  const summary = (row.summary || '').toLowerCase();
  if (row.conflict_detected || row.has_conflict || row.status === 'blocked') return 'blocked';
  if (summary.includes('review') || row.approval_status === 'pending') return 'pending_review';
  if (summary.includes('transit') || row.carrier_status === 'in_transit') return 'in_transit';
  if (summary.includes('refund') || row.refund_status === 'pending') return 'refund_pending';
  if (row.status === 'received') return 'received';
  return 'all';
}

function enrichReturn(row: any, tenantId: string, workspaceId: string) {
  const parsed = parseRow(row) as any;
  const context = getReturnCanonicalContext(parsed.id, tenantId, workspaceId);
  const caseState = context?.case_state;
  const systems = caseState?.systems;
  const primaryPayment = caseState?.related.payments?.[0];
  const approval = caseState?.related.approvals?.[0];
  const fulfillmentNode = systems?.fulfillment?.nodes?.[0];
  const badges = compactBadges([
    titleCase(parsed.status),
    parsed.refund_status ? titleCase(parsed.refund_status) : null,
    caseState?.conflict.has_conflict ? 'Conflict' : null,
    parsed.risk_level === 'high' ? 'High Risk' : null,
    approval?.status === 'pending' ? 'Approval Needed' : null,
  ]);

  return {
    ...parsed,
    summary: parsed.summary || caseState?.conflict.root_cause || caseState?.case?.type || '',
    recommended_action: parsed.recommended_action || caseState?.conflict.recommended_action || null,
    conflict_detected: parsed.conflict_detected || caseState?.conflict.root_cause || null,
    approval_status: parsed.approval_status || approval?.status || caseState?.case?.approval_state || 'not_required',
    carrier_status: parsed.carrier_status || (fulfillmentNode?.source === 'Carrier' ? fulfillmentNode.value : 'N/A'),
    inspection_status: parsed.inspection_status || (parsed.status === 'received' ? 'Awaiting inspection' : 'N/A'),
    system_states: {
      oms: systems?.orders?.nodes?.[0]?.value || caseState?.case?.status || 'N/A',
      returns_platform: parsed.status || systems?.returns?.nodes?.[0]?.value || 'N/A',
      wms: fulfillmentNode?.source === 'WMS' ? fulfillmentNode.value : 'N/A',
      carrier: parsed.carrier_status || (fulfillmentNode?.source === 'Carrier' ? fulfillmentNode.value : 'N/A'),
      psp: primaryPayment?.status || systems?.payments?.nodes?.[0]?.value || 'N/A',
      canonical: systems?.returns?.status || 'pending',
    },
    badges,
    tab: buildReturnTab({
      ...parsed,
      summary: parsed.summary || caseState?.conflict.root_cause || '',
      conflict_detected: parsed.conflict_detected || caseState?.conflict.root_cause || '',
      approval_status: parsed.approval_status || approval?.status || 'not_required',
      carrier_status: parsed.carrier_status || (fulfillmentNode?.source === 'Carrier' ? fulfillmentNode.value : 'N/A'),
      badges,
      refund_status: parsed.refund_status || primaryPayment?.refund_status || 'N/A',
    }),
    last_update: parsed.updated_at || parsed.created_at || null,
    events: caseState
      ? caseState.timeline.filter((entry: any) => ['returns', 'payments', 'orders', 'fulfillment', 'approvals'].includes(entry.domain))
      : [],
    related_cases: caseState?.related.linked_cases?.length
      ? caseState.related.linked_cases
      : context?.related_case
        ? [context.related_case]
        : [],
    canonical_context: context,
  };
}

// GET /api/returns
returnsRouter.get('/', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const { status, risk_level, q } = req.query;
    
    let query = `
      SELECT r.*, cu.canonical_name as customer_name
      FROM returns r
      LEFT JOIN customers cu ON r.customer_id = cu.id
      WHERE r.tenant_id = ? AND r.workspace_id = ?
    `;
    const params: any[] = [req.tenantId, req.workspaceId];
    
    if (status) { query += ' AND r.status = ?'; params.push(status); }
    if (risk_level) { query += ' AND r.risk_level = ?'; params.push(risk_level); }
    if (q) { 
      query += ' AND (r.external_return_id LIKE ? OR cu.canonical_name LIKE ?)'; 
      const t = `%${q}%`; 
      params.push(t, t); 
    }
    
    query += ' ORDER BY r.updated_at DESC';

    const returns = db.prepare(query).all(...params);
    res.json(returns.map(row => enrichReturn(row, req.tenantId, req.workspaceId)));
  } catch (error) {
    console.error('Error fetching returns:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/returns/:id
returnsRouter.get('/:id/context', (req: MultiTenantRequest, res: Response) => {
  try {
    const context = getReturnCanonicalContext(req.params.id, req.tenantId, req.workspaceId);
    if (!context) return res.status(404).json({ error: 'Return context not found' });
    res.json(context);
  } catch (error) {
    console.error('Error fetching return context:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

returnsRouter.get('/:id', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const ret = db.prepare(`
      SELECT r.*, cu.canonical_name as customer_name
      FROM returns r LEFT JOIN customers cu ON r.customer_id = cu.id
      WHERE r.id = ? AND r.tenant_id = ? AND r.workspace_id = ?
    `).get(req.params.id, req.tenantId, req.workspaceId);
    
    if (!ret) return res.status(404).json({ error: 'Return not found' });

    const context = getReturnCanonicalContext(req.params.id, req.tenantId, req.workspaceId);
    const events = db.prepare('SELECT * FROM return_events WHERE return_id = ? ORDER BY time ASC').all(req.params.id);
    res.json({
      ...enrichReturn(ret, req.tenantId, req.workspaceId),
      events: context?.case_state
        ? context.case_state.timeline.filter(entry => ['returns', 'payments', 'orders', 'fulfillment', 'approvals'].includes(entry.domain))
        : events.map(parseRow),
      canonical_context: context,
    });
  } catch (error) {
    console.error('Error fetching return detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
