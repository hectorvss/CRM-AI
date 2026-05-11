import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import {
  listAttrDefs,
  createAttrDef,
  updateAttrDef,
  deleteAttrDef,
  getEntityCustomAttributes,
  patchEntityCustomAttributes,
  type AttrModel,
} from '../data/customAttributes.js';

const router = Router();
router.use(extractMultiTenant);

// ── Schemas ───────────────────────────────────────────────────────────────────

const ATTR_TYPES  = ['text','number','date','boolean','list','checkbox','url','email'] as const;
const ATTR_MODELS = ['customer','case','company'] as const;

const CreateDefSchema = z.object({
  attribute_key:          z.string().min(1).regex(/^[a-z0-9_]+$/, 'Only lowercase letters, numbers and underscores'),
  attribute_display_name: z.string().min(1),
  attribute_display_type: z.enum(ATTR_TYPES),
  attribute_model:        z.enum(ATTR_MODELS),
  attribute_values:       z.array(z.string()).optional().nullable(),
  default_value:          z.string().optional().nullable(),
  regex_pattern:          z.string().optional().nullable(),
  is_required:            z.boolean().default(false),
  position:               z.number().int().optional(),
});

const UpdateDefSchema = CreateDefSchema.partial().omit({ attribute_key: true, attribute_model: true });

const PatchAttrsSchema = z.record(z.string(), z.unknown());

// ── GET /api/custom-attributes/definitions ────────────────────────────────────

router.get('/definitions', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const model = typeof req.query.model === 'string' ? req.query.model as AttrModel : undefined;
    const defs  = await listAttrDefs(scope, model);
    res.json(defs);
  } catch (err) {
    console.error('Error listing attribute definitions:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/custom-attributes/definitions ───────────────────────────────────

router.post(
  '/definitions',
  requirePermission('settings.write'),
  validate({ body: CreateDefSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const def   = await createAttrDef(scope, req.body);
      res.status(201).json(def);
    } catch (err: any) {
      if (err?.code === '23505') {
        return res.status(409).json({ error: 'An attribute with that key already exists for this model' });
      }
      console.error('Error creating attribute definition:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ── PATCH /api/custom-attributes/definitions/:id ──────────────────────────────

router.patch(
  '/definitions/:id',
  requirePermission('settings.write'),
  validate({ body: UpdateDefSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope   = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const updated = await updateAttrDef(scope, req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Attribute definition not found' });
      res.json(updated);
    } catch (err) {
      console.error('Error updating attribute definition:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ── DELETE /api/custom-attributes/definitions/:id ─────────────────────────────

router.delete(
  '/definitions/:id',
  requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      await deleteAttrDef(scope, req.params.id);
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting attribute definition:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ── GET /api/custom-attributes/:model/:entityId ───────────────────────────────

router.get('/:model/:entityId', async (req: MultiTenantRequest, res: Response) => {
  const model = req.params.model as AttrModel;
  if (!['customer','case','company'].includes(model)) {
    return res.status(400).json({ error: 'model must be customer, case, or company' });
  }
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const attrs = await getEntityCustomAttributes(scope, model, req.params.entityId);
    res.json(attrs);
  } catch (err) {
    console.error('Error fetching custom attributes:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /api/custom-attributes/:model/:entityId ─────────────────────────────
// Merges the provided key-value pairs into the entity's custom_attributes

router.patch(
  '/:model/:entityId',
  requirePermission('customers.write'),
  validate({ body: PatchAttrsSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    const model = req.params.model as AttrModel;
    if (!['customer','case','company'].includes(model)) {
      return res.status(400).json({ error: 'model must be customer, case, or company' });
    }
    try {
      const scope  = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const merged = await patchEntityCustomAttributes(scope, model, req.params.entityId, req.body);
      res.json(merged);
    } catch (err) {
      console.error('Error patching custom attributes:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
