import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import {
  listEmailTemplates, getEmailTemplate, createEmailTemplate, updateEmailTemplate,
  deleteEmailTemplate, renderTemplate,
} from '../data/emailTemplates.js';

const router = Router();
router.use(extractMultiTenant);

const CreateSchema = z.object({
  name:        z.string().min(1),
  description: z.string().optional().nullable(),
  subject:     z.string().min(1),
  body_html:   z.string().min(1),
  body_text:   z.string().optional().nullable(),
  category:    z.string().optional().nullable(),
  locale:      z.string().default('es'),
  active:      z.boolean().default(true),
});
const UpdateSchema = CreateSchema.partial();
const RenderSchema = z.object({
  context: z.record(z.string(), z.string()).default({}),
});

router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await listEmailTemplates(scope, {
      active:   req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined,
      category: typeof req.query.category === 'string' ? req.query.category : undefined,
    }));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const item = await getEmailTemplate(scope, req.params.id);
    if (!item) return res.status(404).json({ error: 'Template not found' });
    res.json(item);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/', requirePermission('settings.write'), validate({ body: CreateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      res.status(201).json(await createEmailTemplate(scope, req.body));
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'Template name already exists' });
      console.error(err); res.status(500).json({ error: 'Internal server error' });
    }
  });

router.patch('/:id', requirePermission('settings.write'), validate({ body: UpdateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const existing = await getEmailTemplate(scope, req.params.id);
      if (!existing) return res.status(404).json({ error: 'Template not found' });
      res.json(await updateEmailTemplate(scope, req.params.id, req.body));
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

router.delete('/:id', requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const existing = await getEmailTemplate(scope, req.params.id);
      if (!existing) return res.status(404).json({ error: 'Template not found' });
      await deleteEmailTemplate(scope, req.params.id);
      res.status(204).send();
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

// POST /api/email-templates/:id/render
router.post('/:id/render', validate({ body: RenderSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const template = await getEmailTemplate(scope, req.params.id);
      if (!template) return res.status(404).json({ error: 'Template not found' });
      res.json(renderTemplate(template, req.body.context));
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

export default router;
