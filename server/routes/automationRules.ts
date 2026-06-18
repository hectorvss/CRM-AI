import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import {
  listAutomationRules,
  getAutomationRule,
  createAutomationRule,
  updateAutomationRule,
  deleteAutomationRule,
  toggleAutomationRule,
  getMatchingRules,
  type AutomationEventName,
} from '../data/automationRules.js';

const router = Router();
router.use(extractMultiTenant);

// ── Schemas ───────────────────────────────────────────────────────────────────

const EVENT_NAMES = [
  'conversation_created', 'conversation_updated', 'conversation_resolved',
  'conversation_opened',  'message_created',      'contact_created',
  'contact_updated',
] as const;

const ConditionSchema = z.object({
  attribute:  z.string().min(1),
  operator:   z.string().min(1),
  value:      z.unknown(),
  value_type: z.string().optional(),
});

const ActionSchema = z.object({
  action_name:   z.string().min(1),
  action_params: z.record(z.string(), z.unknown()).default({}),
});

const CreateRuleSchema = z.object({
  name:            z.string().min(1, 'Rule name is required'),
  description:     z.string().optional().nullable(),
  event_name:      z.enum(EVENT_NAMES),
  conditions:      z.array(ConditionSchema).default([]),
  actions:         z.array(ActionSchema).min(1, 'At least one action required'),
  condition_match: z.enum(['all', 'any']).default('all'),
  active:          z.boolean().default(true),
  priority:        z.number().int().default(0),
});

const UpdateRuleSchema = CreateRuleSchema.partial();

const ToggleSchema = z.object({ active: z.boolean() });

const EvalSchema = z.object({
  event_name: z.enum(EVENT_NAMES),
  context:    z.record(z.string(), z.unknown()),
});

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/automation-rules
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const rules = await listAutomationRules(scope, {
      event_name: typeof req.query.event_name === 'string' ? req.query.event_name : undefined,
      active: req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined,
    });
    res.json(rules);
  } catch (err) {
    console.error('Error listing automation rules:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/automation-rules/:id
router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const rule = await getAutomationRule(scope, req.params.id);
    if (!rule) return res.status(404).json({ error: 'Rule not found' });
    res.json(rule);
  } catch (err) {
    console.error('Error fetching automation rule:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/automation-rules
router.post(
  '/',
  requirePermission('settings.write'),
  validate({ body: CreateRuleSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const rule = await createAutomationRule(scope, req.body);
      res.status(201).json(rule);
    } catch (err) {
      console.error('Error creating automation rule:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PATCH /api/automation-rules/:id
router.patch(
  '/:id',
  requirePermission('settings.write'),
  validate({ body: UpdateRuleSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const rule = await getAutomationRule(scope, req.params.id);
      if (!rule) return res.status(404).json({ error: 'Rule not found' });
      const updated = await updateAutomationRule(scope, req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error('Error updating automation rule:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/automation-rules/:id/toggle
router.post(
  '/:id/toggle',
  requirePermission('settings.write'),
  validate({ body: ToggleSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const rule = await getAutomationRule(scope, req.params.id);
      if (!rule) return res.status(404).json({ error: 'Rule not found' });
      const updated = await toggleAutomationRule(scope, req.params.id, req.body.active);
      res.json(updated);
    } catch (err) {
      console.error('Error toggling automation rule:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// DELETE /api/automation-rules/:id
router.delete(
  '/:id',
  requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const rule = await getAutomationRule(scope, req.params.id);
      if (!rule) return res.status(404).json({ error: 'Rule not found' });
      await deleteAutomationRule(scope, req.params.id);
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting automation rule:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/automation-rules/evaluate  — dry-run evaluation against a context
router.post(
  '/evaluate',
  requirePermission('settings.write'),
  validate({ body: EvalSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const { event_name, context } = req.body as { event_name: AutomationEventName; context: Record<string, unknown> };
      const matched = await getMatchingRules(scope, event_name, context);
      res.json({
        event_name,
        matched_count: matched.length,
        rules: matched.map(r => ({ id: r.id, name: r.name, actions: r.actions })),
      });
    } catch (err) {
      console.error('Error evaluating automation rules:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
