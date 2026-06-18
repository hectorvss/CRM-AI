import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import {
  listCannedResponses,
  getCannedResponse,
  findByShortCode,
  searchByPrefix,
  createCannedResponse,
  updateCannedResponse,
  deleteCannedResponse,
  recordUsage,
} from '../data/cannedResponses.js';

const router = Router();
router.use(extractMultiTenant);

// ── Schemas ───────────────────────────────────────────────────────────────────

const CreateSchema = z.object({
  short_code: z.string().min(1).regex(/^[a-z0-9_-]+$/, 'Only lowercase letters, numbers, hyphens, underscores'),
  content:    z.string().min(1, 'Content is required'),
  category:   z.string().optional().nullable(),
});

const UpdateSchema = CreateSchema.partial();

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/canned-responses?q=...&category=...
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const items = await listCannedResponses(scope, {
      q:        typeof req.query.q        === 'string' ? req.query.q        : undefined,
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
    });
    res.json(items);
  } catch (err) {
    console.error('Error listing canned responses:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/canned-responses/search?prefix=...  — autocomplete for inbox picker
router.get('/search', async (req: MultiTenantRequest, res: Response) => {
  const prefix = typeof req.query.prefix === 'string' ? req.query.prefix : '';
  const limit  = typeof req.query.limit  === 'string' ? Math.min(parseInt(req.query.limit), 20) : 5;
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const results = prefix
      ? await searchByPrefix(scope, prefix, limit)
      : await listCannedResponses(scope, {});
    res.json(results.slice(0, limit));
  } catch (err) {
    console.error('Error searching canned responses:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/canned-responses/by-code/:shortCode
router.get('/by-code/:shortCode', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const item = await findByShortCode(scope, req.params.shortCode);
    if (!item) return res.status(404).json({ error: 'Canned response not found' });
    res.json(item);
  } catch (err) {
    console.error('Error fetching canned response by code:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/canned-responses/:id
router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const item = await getCannedResponse(scope, req.params.id);
    if (!item) return res.status(404).json({ error: 'Canned response not found' });
    res.json(item);
  } catch (err) {
    console.error('Error fetching canned response:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/canned-responses
router.post(
  '/',
  requirePermission('settings.write'),
  validate({ body: CreateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await createCannedResponse(scope, req.body);
      res.status(201).json(item);
    } catch (err: any) {
      if (err?.code === '23505') {
        return res.status(409).json({ error: 'A canned response with that short_code already exists' });
      }
      console.error('Error creating canned response:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PATCH /api/canned-responses/:id
router.patch(
  '/:id',
  requirePermission('settings.write'),
  validate({ body: UpdateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await getCannedResponse(scope, req.params.id);
      if (!item) return res.status(404).json({ error: 'Canned response not found' });
      const updated = await updateCannedResponse(scope, req.params.id, req.body);
      res.json(updated);
    } catch (err: any) {
      if (err?.code === '23505') {
        return res.status(409).json({ error: 'Short code already in use' });
      }
      console.error('Error updating canned response:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// DELETE /api/canned-responses/:id
router.delete(
  '/:id',
  requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const item = await getCannedResponse(scope, req.params.id);
      if (!item) return res.status(404).json({ error: 'Canned response not found' });
      await deleteCannedResponse(scope, req.params.id);
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting canned response:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/canned-responses/:id/use  — record usage when inserted in message
router.post('/:id/use', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    await recordUsage(scope, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error recording canned response usage:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
