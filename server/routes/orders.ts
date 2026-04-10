import { Router, Response } from 'express';
import { getDb } from '../db/client.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { parseRow } from '../db/utils.js';
import { getOrderCanonicalContext } from '../services/canonicalState.js';

const router = Router();

// Apply multi-tenant middleware
router.use(extractMultiTenant);

function titleCase(value: string | null | undefined): string {
  if (!value) return 'N/A';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function buildOrderTab(row: any) {
  if (row.conflict_detected || row.has_conflict) return 'conflicts';
  if ((row.summary || '').toLowerCase().includes('refund') || (row.badges || []).includes('Refund Pending')) return 'refunds';
  if (row.risk_level === 'high' || row.approval_status === 'pending') return 'attention';
  return 'all';
}

function enrichOrder(row: any, tenantId: string, workspaceId: string) {
  const parsed = parseRow(row) as any;
  const context = getOrderCanonicalContext(parsed.id, tenantId, workspaceId);
  const caseState = context?.case_state;
  const systems = caseState?.systems;
  const primaryPayment = caseState?.related.payments?.[0];
  const primaryReturn = caseState?.related.returns?.[0];
  const approval = caseState?.related.approvals?.[0];
  const badges = compactBadges([
    titleCase(parsed.status),
    titleCase(primaryPayment?.status),
    titleCase(primaryReturn?.status),
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
    system_states: {
      oms: parsed.status || systems?.orders?.nodes?.[0]?.value || 'Unknown',
      psp: primaryPayment?.status || systems?.payments?.nodes?.[0]?.value || 'N/A',
      wms: systems?.fulfillment?.nodes?.[0]?.value || 'N/A',
      carrier: systems?.fulfillment?.nodes?.[0]?.source === 'Carrier' ? systems.fulfillment.nodes[0]?.value : 'N/A',
      returns_platform: primaryReturn?.status || systems?.returns?.nodes?.[0]?.value || 'N/A',
      refund_status: primaryPayment?.refund_status || primaryReturn?.refund_status || 'N/A',
      canonical: systems?.orders?.status || 'pending',
    },
    badges,
    tab: buildOrderTab({
      ...parsed,
      summary: parsed.summary || caseState?.conflict.root_cause || '',
      conflict_detected: parsed.conflict_detected || caseState?.conflict.root_cause || '',
      approval_status: parsed.approval_status || approval?.status || 'not_required',
      badges,
    }),
    last_update: parsed.updated_at || parsed.order_date || null,
    events: caseState
      ? caseState.timeline.filter((entry: any) => ['orders', 'fulfillment', 'returns', 'payments'].includes(entry.domain))
      : [],
    related_cases: caseState?.related.linked_cases?.length
      ? caseState.related.linked_cases
      : context?.related_case
        ? [context.related_case]
        : [],
    canonical_context: context,
  };
}

function compactBadges(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value) && value !== 'N/A')));
}

// ── GET /api/orders ──────────────────────────────────────────
router.get('/', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const { status, risk_level, q } = req.query;
    
    let query = `
      SELECT o.*, cu.canonical_name as customer_name, cu.segment as customer_segment
      FROM orders o
      LEFT JOIN customers cu ON o.customer_id = cu.id
      WHERE o.tenant_id = ? AND o.workspace_id = ?
    `;
    const params: any[] = [req.tenantId, req.workspaceId];
    
    if (status) { query += ` AND o.status = ?`; params.push(status); }
    if (risk_level) { query += ` AND o.risk_level = ?`; params.push(risk_level); }
    if (q) { 
      query += ` AND (o.external_order_id LIKE ? OR cu.canonical_name LIKE ?)`; 
      const t = `%${q}%`; 
      params.push(t, t); 
    }
    
    query += ' ORDER BY o.updated_at DESC';

    const orders = db.prepare(query).all(...params);
    res.json(orders.map(row => enrichOrder(row, req.tenantId, req.workspaceId)));
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/orders/:id ──────────────────────────────────────
router.get('/:id/context', (req: MultiTenantRequest, res: Response) => {
  try {
    const context = getOrderCanonicalContext(req.params.id, req.tenantId, req.workspaceId);
    if (!context) return res.status(404).json({ error: 'Order context not found' });
    res.json(context);
  } catch (error) {
    console.error('Error fetching order context:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', (req: MultiTenantRequest, res: Response) => {
  try {
    const db = getDb();
    const order = db.prepare(`
      SELECT o.*, cu.canonical_name as customer_name, cu.canonical_email as customer_email
      FROM orders o LEFT JOIN customers cu ON o.customer_id = cu.id
      WHERE o.id = ? AND o.tenant_id = ? AND o.workspace_id = ?
    `).get(req.params.id, req.tenantId, req.workspaceId) as any;
    
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const context = getOrderCanonicalContext(req.params.id, req.tenantId, req.workspaceId);
    const events = db.prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY time ASC').all(req.params.id);
    
    // Cross-link with cases: check if the order_ids JSON array in cases contains this order ID
    const relatedCases = db.prepare(`
      SELECT id, case_number, status, type 
      FROM cases 
      WHERE order_ids LIKE ? AND tenant_id = ? AND workspace_id = ?
    `).all(`%${req.params.id}%`, req.tenantId, req.workspaceId);

    res.json({
      ...enrichOrder(order, req.tenantId, req.workspaceId),
      events: context?.case_state
        ? context.case_state.timeline.filter(entry => ['orders', 'fulfillment', 'returns', 'payments'].includes(entry.domain))
        : events.map(parseRow),
      related_cases: context?.case_state?.related.linked_cases?.length
        ? context.case_state.related.linked_cases
        : relatedCases.map(parseRow),
      canonical_context: context,
    });
  } catch (error) {
    console.error('Error fetching order detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
