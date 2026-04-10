import { Router } from 'express';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { sendError } from '../http/errors.js';
import { createKnowledgeRepository } from '../data/index.js';

const router = Router();
const knowledgeRepo = createKnowledgeRepository();

router.use(extractMultiTenant);

router.get('/articles', async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const filters = {
      domain_id: req.query.domain_id as string,
      type: req.query.type as string,
      status: req.query.status as string,
      q: req.query.q as string,
    };

    const articles = await knowledgeRepo.listArticles(scope, filters);
    res.json(articles);
  } catch (error) {
    console.error('Error fetching knowledge articles:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.post('/articles', async (req: MultiTenantRequest, res) => {
  try {
    const scope = { 
      tenantId: req.tenantId!, 
      workspaceId: req.workspaceId!,
      userId: req.userId 
    };
    const { title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'title and content are required' });
    }

    const article = await knowledgeRepo.createArticle(scope, req.body);
    if (!article) return res.status(500).json({ error: 'Failed to create article' });
    
    res.status(201).json(article);
  } catch (error) {
    console.error('Error creating knowledge article:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get('/articles/:id', async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const article = await knowledgeRepo.getArticle(scope, req.params.id);
    if (!article) return res.status(404).json({ error: 'Not found' });
    res.json(article);
  } catch (error) {
    console.error('Error fetching knowledge article:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.put('/articles/:id', async (req: MultiTenantRequest, res) => {
  try {
    const scope = { 
      tenantId: req.tenantId!, 
      workspaceId: req.workspaceId!,
      userId: req.userId 
    };
    const article = await knowledgeRepo.updateArticle(scope, req.params.id, req.body);
    if (!article) return res.status(404).json({ error: 'Not found' });
    res.json(article);
  } catch (error) {
    console.error('Error updating knowledge article:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.post('/articles/:id/publish', async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const article = await knowledgeRepo.publishArticle(scope, req.params.id);
    if (!article) return res.status(404).json({ error: 'Not found' });
    res.json(article);
  } catch (error) {
    console.error('Error publishing knowledge article:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get('/domains', async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const domains = await knowledgeRepo.listDomains(scope);
    res.json(domains);
  } catch (error) {
    console.error('Error fetching knowledge domains:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

router.get('/policies', async (req: MultiTenantRequest, res) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const policies = await knowledgeRepo.listPolicies(scope);
    res.json(policies);
  } catch (error) {
    console.error('Error fetching policies:', error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
});

export default router;
