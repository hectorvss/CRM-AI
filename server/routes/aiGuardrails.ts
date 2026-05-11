import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import {
  listGuardrails, getGuardrail, createGuardrail, updateGuardrail, deleteGuardrail,
  evaluateGuardrails,
} from '../data/aiGuardrails.js';

const router = Router();
router.use(extractMultiTenant);

const RULE_TYPES = [
  'blocked_topic','required_disclaimer','tone_enforcement',
  'pii_redaction','language_restriction','max_response_length','custom_regex',
] as const;

const CreateSchema = z.object({
  name:        z.string().min(1),
  description: z.string().optional().nullable(),
  rule_type:   z.enum(RULE_TYPES),
  config:      z.record(z.string(), z.unknown()).default({}),
  enabled:     z.boolean().default(true),
  priority:    z.number().int().default(0),
});
const UpdateSchema = CreateSchema.partial();
const EvaluateSchema = z.object({ text: z.string().min(1) });

router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await listGuardrails(scope, req.query.enabled === 'true'));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const item = await getGuardrail(scope, req.params.id);
    if (!item) return res.status(404).json({ error: 'Guardrail not found' });
    res.json(item);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/', requirePermission('settings.write'), validate({ body: CreateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      res.status(201).json(await createGuardrail(scope, req.body));
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

router.patch('/:id', requirePermission('settings.write'), validate({ body: UpdateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const existing = await getGuardrail(scope, req.params.id);
      if (!existing) return res.status(404).json({ error: 'Guardrail not found' });
      res.json(await updateGuardrail(scope, req.params.id, req.body));
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

router.delete('/:id', requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const existing = await getGuardrail(scope, req.params.id);
      if (!existing) return res.status(404).json({ error: 'Guardrail not found' });
      await deleteGuardrail(scope, req.params.id);
      res.status(204).send();
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

// POST /api/ai-guardrails/evaluate  — evaluate text against all active guardrails
router.post('/evaluate', validate({ body: EvaluateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const violations = await evaluateGuardrails(scope, req.body.text);
      res.json({ violations, clean: violations.length === 0 });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

export default router;
