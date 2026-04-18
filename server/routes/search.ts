import { Router, Response } from 'express';
import { getDb } from '../db/client.js';
import { getDatabaseProvider } from '../db/provider.js';
import { getSupabaseAdmin } from '../db/supabase.js';
import { parseRow } from '../db/utils.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';

interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle?: string | null;
  status?: string | null;
  href?: string | null;
  score?: number;
}

const router = Router();
router.use(extractMultiTenant);

function normalizeTerm(req: MultiTenantRequest, res: Response) {
  const q = String(req.query.q || req.query.query || '').trim();
  if (q.length < 2) {
    res.json([]);
    return null;
  }
  return q.slice(0, 120);
}

function asResult(type: string, row: any, title: string, subtitle?: string | null, status?: string | null): SearchResult {
  return {
    type,
    id: row.id,
    title,
    subtitle,
    status,
    href: `/${type}/${row.id}`,
    score: 1,
  };
}

async function searchSupabase(tenantId: string, workspaceId: string, q: string): Promise<SearchResult[]> {
  const supabase = getSupabaseAdmin();
  const term = `%${q.replace(/[%_]/g, '\\$&')}%`;
  const [cases, customers, orders, payments, returnsRows, knowledge] = await Promise.all([
    supabase.from('cases').select('id, case_number, type, status, priority').eq('tenant_id', tenantId).eq('workspace_id', workspaceId).or(`case_number.ilike.${term},type.ilike.${term},intent.ilike.${term}`).limit(8),
    supabase.from('customers').select('id, canonical_name, canonical_email, segment, risk_level').eq('tenant_id', tenantId).eq('workspace_id', workspaceId).or(`canonical_name.ilike.${term},canonical_email.ilike.${term},email.ilike.${term}`).limit(8),
    supabase.from('orders').select('id, external_order_id, status, total_amount, currency').eq('tenant_id', tenantId).eq('workspace_id', workspaceId).or(`external_order_id.ilike.${term},status.ilike.${term}`).limit(8),
    supabase.from('payments').select('id, external_payment_id, status, amount, currency').eq('tenant_id', tenantId).eq('workspace_id', workspaceId).or(`external_payment_id.ilike.${term},status.ilike.${term}`).limit(8),
    supabase.from('returns').select('id, external_return_id, status, return_reason').eq('tenant_id', tenantId).eq('workspace_id', workspaceId).or(`external_return_id.ilike.${term},status.ilike.${term},return_reason.ilike.${term}`).limit(8),
    supabase.from('knowledge_articles').select('id, title, type, status').eq('tenant_id', tenantId).eq('workspace_id', workspaceId).or(`title.ilike.${term},content.ilike.${term}`).limit(8),
  ]);

  for (const result of [cases, customers, orders, payments, returnsRows, knowledge]) {
    if (result.error) throw result.error;
  }

  return [
    ...(cases.data || []).map((row: any) => asResult('cases', row, row.case_number, row.type, row.status)),
    ...(customers.data || []).map((row: any) => asResult('customers', row, row.canonical_name || row.canonical_email || row.id, row.canonical_email, row.risk_level)),
    ...(orders.data || []).map((row: any) => asResult('orders', row, row.external_order_id || row.id, `${row.total_amount ?? ''} ${row.currency ?? ''}`.trim(), row.status)),
    ...(payments.data || []).map((row: any) => asResult('payments', row, row.external_payment_id || row.id, `${row.amount ?? ''} ${row.currency ?? ''}`.trim(), row.status)),
    ...(returnsRows.data || []).map((row: any) => asResult('returns', row, row.external_return_id || row.id, row.return_reason, row.status)),
    ...(knowledge.data || []).map((row: any) => asResult('knowledge', row, row.title || row.id, row.type, row.status)),
  ];
}

function searchSqlite(tenantId: string, workspaceId: string, q: string): SearchResult[] {
  const db = getDb();
  const term = `%${q}%`;
  const cases = db.prepare(`
    SELECT id, case_number, type, status, priority FROM cases
    WHERE tenant_id = ? AND workspace_id = ? AND (case_number LIKE ? OR type LIKE ? OR intent LIKE ?)
    LIMIT 8
  `).all(tenantId, workspaceId, term, term, term).map(parseRow);
  const customers = db.prepare(`
    SELECT id, canonical_name, canonical_email, segment, risk_level FROM customers
    WHERE tenant_id = ? AND workspace_id = ? AND (canonical_name LIKE ? OR canonical_email LIKE ? OR email LIKE ?)
    LIMIT 8
  `).all(tenantId, workspaceId, term, term, term).map(parseRow);
  const orders = db.prepare(`
    SELECT id, external_order_id, status, total_amount, currency FROM orders
    WHERE tenant_id = ? AND workspace_id = ? AND (external_order_id LIKE ? OR status LIKE ?)
    LIMIT 8
  `).all(tenantId, workspaceId, term, term).map(parseRow);
  const payments = db.prepare(`
    SELECT id, external_payment_id, status, amount, currency FROM payments
    WHERE tenant_id = ? AND workspace_id = ? AND (external_payment_id LIKE ? OR status LIKE ?)
    LIMIT 8
  `).all(tenantId, workspaceId, term, term).map(parseRow);
  const returnsRows = db.prepare(`
    SELECT id, external_return_id, status, return_reason FROM returns
    WHERE tenant_id = ? AND workspace_id = ? AND (external_return_id LIKE ? OR status LIKE ? OR return_reason LIKE ?)
    LIMIT 8
  `).all(tenantId, workspaceId, term, term, term).map(parseRow);
  const knowledge = db.prepare(`
    SELECT id, title, type, status FROM knowledge_articles
    WHERE tenant_id = ? AND workspace_id = ? AND (title LIKE ? OR content LIKE ?)
    LIMIT 8
  `).all(tenantId, workspaceId, term, term).map(parseRow);

  return [
    ...cases.map((row: any) => asResult('cases', row, row.case_number, row.type, row.status)),
    ...customers.map((row: any) => asResult('customers', row, row.canonical_name || row.canonical_email || row.id, row.canonical_email, row.risk_level)),
    ...orders.map((row: any) => asResult('orders', row, row.external_order_id || row.id, `${row.total_amount ?? ''} ${row.currency ?? ''}`.trim(), row.status)),
    ...payments.map((row: any) => asResult('payments', row, row.external_payment_id || row.id, `${row.amount ?? ''} ${row.currency ?? ''}`.trim(), row.status)),
    ...returnsRows.map((row: any) => asResult('returns', row, row.external_return_id || row.id, row.return_reason, row.status)),
    ...knowledge.map((row: any) => asResult('knowledge', row, row.title || row.id, row.type, row.status)),
  ];
}

router.get('/', requirePermission('cases.read'), async (req: MultiTenantRequest, res: Response) => {
  try {
    const q = normalizeTerm(req, res);
    if (!q) return;
    const results = getDatabaseProvider() === 'supabase'
      ? await searchSupabase(req.tenantId!, req.workspaceId!, q)
      : searchSqlite(req.tenantId!, req.workspaceId!, q);
    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
