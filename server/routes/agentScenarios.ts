import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import {
  listScenarios, getScenario, createScenario, updateScenario, deleteScenario,
  recordScenarioRun, findMatchingScenarios,
} from '../data/agentScenarios.js';

const router = Router();
router.use(extractMultiTenant);

const TRIGGER_TYPES = ['intent_match','keyword_match','routing_rule','time_based','manual'] as const;

const CreateSchema = z.object({
  name:              z.string().min(1),
  description:       z.string().optional().nullable(),
  trigger_type:      z.enum(TRIGGER_TYPES),
  trigger_config:    z.record(z.string(), z.unknown()).default({}),
  steps:             z.array(z.unknown()).default([]),
  allowed_tool_ids:  z.array(z.string().uuid()).default([]),
  guardrail_ids:     z.array(z.string().uuid()).default([]),
  enabled:           z.boolean().default(true),
});
const UpdateSchema = CreateSchema.partial();
const MatchSchema = z.object({
  text:        z.string().optional(),
  intent:      z.string().optional(),
  triggerType: z.enum(TRIGGER_TYPES).optional(),
});

router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await listScenarios(scope, req.query.enabled === 'true'));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const item = await getScenario(scope, req.params.id);
    if (!item) return res.status(404).json({ error: 'Scenario not found' });
    res.json(item);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/', requirePermission('settings.write'), validate({ body: CreateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      res.status(201).json(await createScenario(scope, req.body));
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

router.patch('/:id', requirePermission('settings.write'), validate({ body: UpdateSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const existing = await getScenario(scope, req.params.id);
      if (!existing) return res.status(404).json({ error: 'Scenario not found' });
      res.json(await updateScenario(scope, req.params.id, req.body));
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

router.delete('/:id', requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const existing = await getScenario(scope, req.params.id);
      if (!existing) return res.status(404).json({ error: 'Scenario not found' });
      await deleteScenario(scope, req.params.id);
      res.status(204).send();
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

// POST /api/agent-scenarios/:id/run
router.post('/:id/run', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const existing = await getScenario(scope, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Scenario not found' });
    await recordScenarioRun(scope, req.params.id);
    res.json({ ok: true, scenario_id: req.params.id });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/agent-scenarios/match  — find matching scenarios for context
router.post('/match', validate({ body: MatchSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      res.json(await findMatchingScenarios(scope, req.body));
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

export default router;
