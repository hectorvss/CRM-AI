import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import {
  listAssignmentPolicies,
  getAssignmentPolicy,
  createAssignmentPolicy,
  updateAssignmentPolicy,
  deleteAssignmentPolicy,
  selectAgent,
} from '../data/assignmentPolicies.js';

const router = Router();
router.use(extractMultiTenant);

// ── Schemas ───────────────────────────────────────────────────────────────────

const CreatePolicySchema = z.object({
  name:        z.string().min(1, 'Policy name is required'),
  policy_type: z.enum(['round_robin', 'capacity_based', 'skills_based']),
  config:      z.record(z.string(), z.unknown()).default({}),
  inbox_id:    z.string().optional().nullable(),
  active:      z.boolean().default(true),
});

const UpdatePolicySchema = CreatePolicySchema.partial();

const SelectAgentSchema = z.object({
  candidates: z.array(z.object({
    id:           z.string(),
    current_load: z.number().int().default(0),
    skills:       z.array(z.string()).optional(),
    online:       z.boolean().optional(),
  })).min(1),
});

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/assignment-policies
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const policies = await listAssignmentPolicies(scope, {
      inbox_id: typeof req.query.inbox_id === 'string' ? req.query.inbox_id : undefined,
      active: req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined,
    });
    res.json(policies);
  } catch (err) {
    console.error('Error listing assignment policies:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/assignment-policies/:id
router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const policy = await getAssignmentPolicy(scope, req.params.id);
    if (!policy) return res.status(404).json({ error: 'Policy not found' });
    res.json(policy);
  } catch (err) {
    console.error('Error fetching assignment policy:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/assignment-policies
router.post(
  '/',
  requirePermission('settings.write'),
  validate({ body: CreatePolicySchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const policy = await createAssignmentPolicy(scope, req.body);
      res.status(201).json(policy);
    } catch (err) {
      console.error('Error creating assignment policy:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PATCH /api/assignment-policies/:id
router.patch(
  '/:id',
  requirePermission('settings.write'),
  validate({ body: UpdatePolicySchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const policy = await getAssignmentPolicy(scope, req.params.id);
      if (!policy) return res.status(404).json({ error: 'Policy not found' });
      const updated = await updateAssignmentPolicy(scope, req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error('Error updating assignment policy:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// DELETE /api/assignment-policies/:id
router.delete(
  '/:id',
  requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const policy = await getAssignmentPolicy(scope, req.params.id);
      if (!policy) return res.status(404).json({ error: 'Policy not found' });
      await deleteAssignmentPolicy(scope, req.params.id);
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting assignment policy:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/assignment-policies/:id/select — select best agent using this policy
router.post(
  '/:id/select',
  validate({ body: SelectAgentSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const policy = await getAssignmentPolicy(scope, req.params.id);
      if (!policy) return res.status(404).json({ error: 'Policy not found' });

      const agentId = selectAgent(
        { policy_type: policy.policy_type as any, config: policy.config as any },
        req.body.candidates,
      );
      res.json({ agent_id: agentId, policy_id: req.params.id, policy_type: policy.policy_type });
    } catch (err) {
      console.error('Error selecting agent:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
