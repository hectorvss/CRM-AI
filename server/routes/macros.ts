import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import { createAuditRepository } from '../data/index.js';
import {
  listMacros,
  getMacro,
  createMacro,
  updateMacro,
  deleteMacro,
  recordMacroExecution,
} from '../data/macros.js';

const router = Router();
const auditRepository = createAuditRepository();
router.use(extractMultiTenant);

// ── Schemas ───────────────────────────────────────────────────────────────────

const ActionSchema = z.object({
  action_name:   z.string().min(1),
  action_params: z.record(z.string(), z.unknown()).default({}),
});

const CreateMacroSchema = z.object({
  name:       z.string().min(1, 'Macro name is required'),
  actions:    z.array(ActionSchema).min(1, 'At least one action required'),
  visibility: z.enum(['public', 'private']).default('public'),
});

const UpdateMacroSchema = CreateMacroSchema.partial();

const ExecuteSchema = z.object({
  // context: the entity the macro is applied to (e.g. case_id, conversation_id)
  entity_type: z.string().optional(),
  entity_id:   z.string().optional(),
});

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/macros
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const macros = await listMacros(scope, {
      visibility: typeof req.query.visibility === 'string' ? req.query.visibility : undefined,
      created_by: typeof req.query.created_by === 'string' ? req.query.created_by : undefined,
    });
    res.json(macros);
  } catch (err) {
    console.error('Error listing macros:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/macros/:id
router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const macro = await getMacro(scope, req.params.id);
    if (!macro) return res.status(404).json({ error: 'Macro not found' });
    res.json(macro);
  } catch (err) {
    console.error('Error fetching macro:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/macros
router.post(
  '/',
  requirePermission('settings.write'),
  validate({ body: CreateMacroSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const macro = await createMacro(scope, {
        ...req.body,
        created_by: req.userId ?? null,
      });
      await auditRepository.log(scope, {
        actorId: req.userId || 'system', action: 'MACRO_CREATED',
        entityType: 'macro', entityId: macro.id,
        newValue: { name: macro.name }, metadata: { source: 'macros_api' },
      });
      res.status(201).json(macro);
    } catch (err) {
      console.error('Error creating macro:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PATCH /api/macros/:id
router.patch(
  '/:id',
  requirePermission('settings.write'),
  validate({ body: UpdateMacroSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const macro = await getMacro(scope, req.params.id);
      if (!macro) return res.status(404).json({ error: 'Macro not found' });
      const updated = await updateMacro(scope, req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error('Error updating macro:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// DELETE /api/macros/:id
router.delete(
  '/:id',
  requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const macro = await getMacro(scope, req.params.id);
      if (!macro) return res.status(404).json({ error: 'Macro not found' });
      await deleteMacro(scope, req.params.id);
      await auditRepository.log(scope, {
        actorId: req.userId || 'system', action: 'MACRO_DELETED',
        entityType: 'macro', entityId: req.params.id,
        newValue: { name: macro.name }, metadata: { source: 'macros_api' },
      });
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting macro:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/macros/:id/execute  — run macro on an entity
router.post(
  '/:id/execute',
  requirePermission('customers.write'),
  validate({ body: ExecuteSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const macro = await getMacro(scope, req.params.id);
      if (!macro) return res.status(404).json({ error: 'Macro not found' });

      // Record execution stats
      await recordMacroExecution(scope, req.params.id);

      await auditRepository.log(scope, {
        actorId: req.userId || 'system', action: 'MACRO_EXECUTED',
        entityType: 'macro', entityId: req.params.id,
        newValue: {
          macro_name:  macro.name,
          entity_type: req.body.entity_type ?? null,
          entity_id:   req.body.entity_id ?? null,
        },
        metadata: { source: 'macros_api' },
      });

      res.json({
        ok:         true,
        macro_id:   req.params.id,
        actions:    macro.actions,
        entity_type: req.body.entity_type ?? null,
        entity_id:   req.body.entity_id ?? null,
      });
    } catch (err) {
      console.error('Error executing macro:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
