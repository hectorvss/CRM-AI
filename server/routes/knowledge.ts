import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../db/client.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { logAudit, parseRow } from '../db/utils.js';

const router = Router();

router.use(extractMultiTenant);

function parseJsonPolicy(row: any) {
  return parseRow(row);
}

router.get('/articles', (req: MultiTenantRequest, res) => {
  const db = getDb();
  const tenantId = req.tenantId!;
  const workspaceId = req.workspaceId!;
  const { domain_id, type, status, q } = req.query;

  let query = `
    SELECT a.*, d.name as domain_name, u.name as owner_name
    FROM knowledge_articles a
    LEFT JOIN knowledge_domains d ON a.domain_id = d.id
    LEFT JOIN users u ON a.owner_user_id = u.id
    WHERE a.tenant_id = ? AND a.workspace_id = ?
  `;
  const params: any[] = [tenantId, workspaceId];
  if (domain_id) { query += ' AND a.domain_id = ?'; params.push(domain_id); }
  if (type) { query += ' AND a.type = ?'; params.push(type); }
  if (status) { query += ' AND a.status = ?'; params.push(status); }
  if (q) {
    query += ' AND (a.title LIKE ? OR a.content LIKE ?)';
    const term = `%${q}%`;
    params.push(term, term);
  }
  query += ' ORDER BY a.citation_count DESC, a.updated_at DESC';

  res.json(db.prepare(query).all(...params).map(parseRow));
});

router.post('/articles', (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const {
      title,
      content,
      type = 'article',
      status = 'draft',
      domain_id = null,
      owner_user_id = req.userId ?? null,
      review_cycle_days = 90,
      linked_workflow_ids = [],
      linked_approval_policy_ids = [],
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'title and content are required' });
    }

    const fallbackOwner = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined;
    const resolvedOwner = owner_user_id
      ? ((db.prepare('SELECT id FROM users WHERE id = ?').get(owner_user_id) as { id: string } | undefined)?.id ?? fallbackOwner?.id ?? null)
      : (fallbackOwner?.id ?? null);
    const now = new Date().toISOString();
    const id = randomUUID();
    db.prepare(`
      INSERT INTO knowledge_articles (
        id, tenant_id, workspace_id, domain_id, title, content, type, status,
        owner_user_id, review_cycle_days, last_reviewed_at, next_review_at,
        version, linked_workflow_ids, linked_approval_policy_ids, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(
      id,
      tenantId,
      workspaceId,
      domain_id,
      title,
      content,
      type,
      status,
      resolvedOwner,
      review_cycle_days,
      now,
      new Date(Date.now() + review_cycle_days * 24 * 60 * 60 * 1000).toISOString(),
      JSON.stringify(linked_workflow_ids),
      JSON.stringify(linked_approval_policy_ids),
      now,
      now,
    );

    const article = db.prepare(`
      SELECT a.*, d.name as domain_name, u.name as owner_name
      FROM knowledge_articles a
      LEFT JOIN knowledge_domains d ON a.domain_id = d.id
      LEFT JOIN users u ON a.owner_user_id = u.id
      WHERE a.id = ?
    `).get(id);

    logAudit(db, {
      tenantId,
      workspaceId,
      actorId: req.userId ?? 'system',
      action: 'KNOWLEDGE_ARTICLE_CREATED',
      entityType: 'knowledge_article',
      entityId: id,
      newValue: article,
    });

    res.status(201).json(parseRow(article));
  } catch (error) {
    console.error('Error creating knowledge article:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/articles/:id', (req: MultiTenantRequest, res) => {
  const db = getDb();
  const article = db.prepare(`
    SELECT a.*, d.name as domain_name, u.name as owner_name
    FROM knowledge_articles a
    LEFT JOIN knowledge_domains d ON a.domain_id = d.id
    LEFT JOIN users u ON a.owner_user_id = u.id
    WHERE a.id = ? AND a.tenant_id = ? AND a.workspace_id = ?
  `).get(req.params.id, req.tenantId, req.workspaceId);
  if (!article) return res.status(404).json({ error: 'Not found' });
  res.json(parseRow(article));
});

router.put('/articles/:id', (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const existing = db.prepare(`
      SELECT *
      FROM knowledge_articles
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).get(req.params.id, tenantId, workspaceId) as any;

    if (!existing) return res.status(404).json({ error: 'Not found' });

    const merged = {
      ...parseRow(existing),
      ...req.body,
    };
    const fallbackOwner = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined;
    const resolvedOwner = merged.owner_user_id
      ? ((db.prepare('SELECT id FROM users WHERE id = ?').get(merged.owner_user_id) as { id: string } | undefined)?.id ?? fallbackOwner?.id ?? null)
      : (fallbackOwner?.id ?? null);
    const nextVersion = merged.content !== existing.content || merged.title !== existing.title
      ? (Number(existing.version) || 1) + 1
      : Number(existing.version) || 1;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE knowledge_articles
      SET domain_id = ?, title = ?, content = ?, type = ?, status = ?,
          owner_user_id = ?, review_cycle_days = ?, version = ?,
          linked_workflow_ids = ?, linked_approval_policy_ids = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).run(
      merged.domain_id ?? null,
      merged.title,
      merged.content,
      merged.type ?? 'article',
      merged.status ?? existing.status,
      resolvedOwner,
      merged.review_cycle_days ?? existing.review_cycle_days ?? 90,
      nextVersion,
      JSON.stringify(merged.linked_workflow_ids ?? []),
      JSON.stringify(merged.linked_approval_policy_ids ?? []),
      now,
      req.params.id,
      tenantId,
      workspaceId,
    );

    const article = db.prepare(`
      SELECT a.*, d.name as domain_name, u.name as owner_name
      FROM knowledge_articles a
      LEFT JOIN knowledge_domains d ON a.domain_id = d.id
      LEFT JOIN users u ON a.owner_user_id = u.id
      WHERE a.id = ?
    `).get(req.params.id);

    logAudit(db, {
      tenantId,
      workspaceId,
      actorId: req.userId ?? 'system',
      action: 'KNOWLEDGE_ARTICLE_UPDATED',
      entityType: 'knowledge_article',
      entityId: req.params.id,
      oldValue: parseRow(existing),
      newValue: article,
    });

    res.json(parseRow(article));
  } catch (error) {
    console.error('Error updating knowledge article:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/articles/:id/publish', (req: MultiTenantRequest, res) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId!;
    const workspaceId = req.workspaceId!;
    const existing = db.prepare(`
      SELECT *
      FROM knowledge_articles
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).get(req.params.id, tenantId, workspaceId) as any;

    if (!existing) return res.status(404).json({ error: 'Not found' });

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE knowledge_articles
      SET status = 'published', last_reviewed_at = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ? AND workspace_id = ?
    `).run(now, now, req.params.id, tenantId, workspaceId);

    const article = db.prepare(`
      SELECT a.*, d.name as domain_name, u.name as owner_name
      FROM knowledge_articles a
      LEFT JOIN knowledge_domains d ON a.domain_id = d.id
      LEFT JOIN users u ON a.owner_user_id = u.id
      WHERE a.id = ?
    `).get(req.params.id);

    logAudit(db, {
      tenantId,
      workspaceId,
      actorId: req.userId ?? 'system',
      action: 'KNOWLEDGE_ARTICLE_PUBLISHED',
      entityType: 'knowledge_article',
      entityId: req.params.id,
      oldValue: parseRow(existing),
      newValue: article,
    });

    res.json(parseRow(article));
  } catch (error) {
    console.error('Error publishing knowledge article:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/domains', (req: MultiTenantRequest, res) => {
  const db = getDb();
  const domains = db.prepare(`
    SELECT *
    FROM knowledge_domains
    WHERE tenant_id = ?
  `).all(req.tenantId);

  res.json(domains.map((d: any) => {
    const count = db.prepare(`
      SELECT COUNT(*) as c
      FROM knowledge_articles
      WHERE domain_id = ? AND tenant_id = ? AND workspace_id = ? AND status = 'published'
    `).get(d.id, req.tenantId, req.workspaceId) as any;
    return { ...d, article_count: count.c };
  }));
});

router.get('/policies', (req: MultiTenantRequest, res) => {
  const db = getDb();
  res.json(
    db.prepare(`
      SELECT *
      FROM policy_rules
      WHERE tenant_id = ? AND is_active = 1
    `).all(req.tenantId).map(parseJsonPolicy),
  );
});

export default router;
