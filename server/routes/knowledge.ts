import { Router } from 'express';
import { getDb } from '../db/client.js';
import { sendError } from '../http/errors.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';

const router = Router();

router.use(extractMultiTenant);
router.use(requirePermission('knowledge.read'));

// GET /api/knowledge/articles
router.get('/articles', (req: MultiTenantRequest, res) => {
  const db = getDb();
  if (!req.tenantId) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant context is missing');
  const tenantId = req.tenantId;
  const { domain_id, type, status, q } = req.query;

  let query = `
    SELECT a.*, d.name as domain_name, u.name as owner_name
    FROM knowledge_articles a
    LEFT JOIN knowledge_domains d ON a.domain_id = d.id
    LEFT JOIN users u ON a.owner_user_id = u.id
    WHERE a.tenant_id = ?
  `;
  const params: any[] = [tenantId];
  if (domain_id) { query += ' AND a.domain_id = ?'; params.push(domain_id); }
  if (type) { query += ' AND a.type = ?'; params.push(type); }
  if (status) { query += ' AND a.status = ?'; params.push(status); }
  if (q) { query += ' AND (a.title LIKE ? OR a.content LIKE ?)'; const t = `%${q}%`; params.push(t, t); }
  query += ' ORDER BY a.citation_count DESC, a.updated_at DESC';

  res.json(db.prepare(query).all(...params));
});

// GET /api/knowledge/articles/:id
router.get('/articles/:id', (req: MultiTenantRequest, res) => {
  const db = getDb();
  if (!req.tenantId) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant context is missing');
  const tenantId = req.tenantId;
  const article = db.prepare(`
    SELECT a.*, d.name as domain_name, u.name as owner_name
    FROM knowledge_articles a
    LEFT JOIN knowledge_domains d ON a.domain_id = d.id
    LEFT JOIN users u ON a.owner_user_id = u.id
    WHERE a.id = ? AND a.tenant_id = ?
  `).get(req.params.id, tenantId);
  if (!article) return sendError(res, 404, 'KNOWLEDGE_ARTICLE_NOT_FOUND', 'Knowledge article not found');
  res.json(article);
});

// GET /api/knowledge/domains
router.get('/domains', (req: MultiTenantRequest, res) => {
  const db = getDb();
  if (!req.tenantId) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant context is missing');
  const tenantId = req.tenantId;
  const domains = db.prepare('SELECT * FROM knowledge_domains WHERE tenant_id = ?').all(tenantId);
  res.json(domains.map((d: any) => {
    const count = db.prepare('SELECT COUNT(*) as c FROM knowledge_articles WHERE domain_id = ? AND status = "published"').get(d.id) as any;
    return { ...d, article_count: count.c };
  }));
});

// GET /api/knowledge/policies
router.get('/policies', (req: MultiTenantRequest, res) => {
  const db = getDb();
  if (!req.tenantId) return sendError(res, 500, 'TENANT_CONTEXT_MISSING', 'Tenant context is missing');
  const tenantId = req.tenantId;
  res.json(db.prepare('SELECT * FROM policy_rules WHERE tenant_id = ? AND is_active = 1').all(tenantId).map(parseJsonPolicy));
});

function parseJsonPolicy(row: any) {
  const result = { ...row };
  ['conditions', 'action_mapping', 'approval_mapping'].forEach(f => {
    if (result[f] && typeof result[f] === 'string') {
      try { result[f] = JSON.parse(result[f]); } catch { result[f] = {}; }
    }
  });
  return result;
}

export default router;
