import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { validate } from '../middleware/validate.js';
import {
  createDataImport, listDataImports, getDataImport, updateImportProgress,
} from '../data/dataImports.js';

const router = Router();
router.use(extractMultiTenant);

const ENTITY_TYPES = ['contacts','conversations','companies','knowledge'] as const;
const STATUSES     = ['pending','processing','completed','failed'] as const;

const CreateSchema = z.object({
  entity_type:   z.enum(ENTITY_TYPES),
  filename:      z.string().min(1),
  file_url:      z.string().url().optional().nullable(),
  file_size:     z.number().int().optional().nullable(),
  field_mapping: z.record(z.string(), z.string()).default({}),
  imported_by:   z.string().uuid().optional().nullable(),
  total_rows:    z.number().int().optional().nullable(),
});

const ProgressSchema = z.object({
  status:         z.enum(STATUSES).optional(),
  imported_rows:  z.number().int().optional(),
  skipped_rows:   z.number().int().optional(),
  error_rows:     z.number().int().optional(),
  errors:         z.array(z.unknown()).optional(),
  started_at:     z.string().datetime().optional(),
  completed_at:   z.string().datetime().optional(),
});

router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await listDataImports(scope, {
      status:     req.query.status     as any,
      entityType: req.query.entity_type as any,
    }));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const item = await getDataImport(scope, req.params.id);
    if (!item) return res.status(404).json({ error: 'Import not found' });
    res.json(item);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/', validate({ body: CreateSchema }), async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.status(201).json(await createDataImport(scope, req.body));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.patch('/:id/progress', validate({ body: ProgressSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      await updateImportProgress(scope, req.params.id, req.body);
      res.json({ ok: true });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

export default router;
