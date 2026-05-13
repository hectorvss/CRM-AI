import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { validate } from '../middleware/validate.js';
import { submitFeedback, listFeedback, getFeedbackSummary } from '../data/aiFeedback.js';

const router = Router();
router.use(extractMultiTenant);

const FEEDBACK_TYPES = ['thumbs_up','thumbs_down','correction','flagged','escalated'] as const;

const SubmitSchema = z.object({
  feedback_type:     z.enum(FEEDBACK_TYPES),
  conversation_id:   z.string().uuid().optional().nullable(),
  message_id:        z.string().uuid().optional().nullable(),
  scenario_id:       z.string().uuid().optional().nullable(),
  feedback_text:     z.string().optional().nullable(),
  original_output:   z.unknown().optional(),
  corrected_output:  z.unknown().optional(),
  agent_id:          z.string().uuid().optional().nullable(),
  contact_id:        z.string().uuid().optional().nullable(),
});

router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await listFeedback(scope, {
      feedbackType: req.query.feedback_type as any,
      scenarioId:   typeof req.query.scenario_id === 'string' ? req.query.scenario_id : undefined,
      agentId:      typeof req.query.agent_id    === 'string' ? req.query.agent_id    : undefined,
      from:         typeof req.query.from         === 'string' ? req.query.from         : undefined,
      to:           typeof req.query.to           === 'string' ? req.query.to           : undefined,
      limit:        typeof req.query.limit        === 'string' ? Math.min(parseInt(req.query.limit), 500) : 100,
    }));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/summary', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    res.json(await getFeedbackSummary(scope));
  } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/', validate({ body: SubmitSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      res.status(201).json(await submitFeedback(scope, req.body));
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

export default router;
