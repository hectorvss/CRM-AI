import { Router } from 'express';
import { getDb } from '../db/client.js';

const router = Router();
const TENANT_ID = 'tenant_default';

// GET /api/knowledge/articles
router.get('/articles', (req, res) => {
  const db = getDb();
  const { domain_id, type, status, q } = req.query;

  let query = `
    SELECT a.*, d.name as domain_name, u.name as owner_name
    FROM knowledge_articles a
    LEFT JOIN knowledge_domains d ON a.domain_id = d.id
    LEFT JOIN users u ON a.owner_user_id = u.id
    WHERE a.tenant_id = ?
  `;
  const params: any[] = [TENANT_ID];
  if (domain_id) { query += ' AND a.domain_id = ?'; params.push(domain_id); }
  if (type) { query += ' AND a.type = ?'; params.push(type); }
  if (status) { query += ' AND a.status = ?'; params.push(status); }
  if (q) { query += ' AND (a.title LIKE ? OR a.content LIKE ?)'; const t = `%${q}%`; params.push(t, t); }
  query += ' ORDER BY a.citation_count DESC, a.updated_at DESC';

  res.json(db.prepare(query).all(...params));
});

// GET /api/knowledge/articles/:id
router.get('/articles/:id', (req, res) => {
  const db = getDb();
  const article = db.prepare(`
    SELECT a.*, d.name as domain_name, u.name as owner_name
    FROM knowledge_articles a
    LEFT JOIN knowledge_domains d ON a.domain_id = d.id
    LEFT JOIN users u ON a.owner_user_id = u.id
    WHERE a.id = ? AND a.tenant_id = ?
  `).get(req.params.id, TENANT_ID);
  if (!article) return res.status(404).json({ error: 'Not found' });
  res.json(article);
});

// GET /api/knowledge/domains
router.get('/domains', (req, res) => {
  const db = getDb();
  const domains = db.prepare('SELECT * FROM knowledge_domains WHERE tenant_id = ?').all(TENANT_ID);
  res.json(domains.map((d: any) => {
    const count = db.prepare('SELECT COUNT(*) as c FROM knowledge_articles WHERE domain_id = ? AND status = "published"').get(d.id) as any;
    return { ...d, article_count: count.c };
  }));
});

// GET /api/knowledge/policies
router.get('/policies', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM policy_rules WHERE tenant_id = ? AND is_active = 1').all(TENANT_ID).map(parseJsonPolicy));
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
