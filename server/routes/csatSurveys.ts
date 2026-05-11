import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { validate } from '../middleware/validate.js';
import {
  submitCsatResponse, listCsatResponses, getCsatSummary, getCsatByToken,
} from '../data/csatSurveys.js';

const router = Router();
router.use(extractMultiTenant);

// ── Schemas ───────────────────────────────────────────────────────────────────

const SubmitSchema = z.object({
  conversation_id:    z.string().uuid(),
  rating:             z.number().int().min(1).max(5),
  feedback_message:   z.string().optional().nullable(),
  contact_id:         z.string().uuid().optional().nullable(),
  assigned_agent_id:  z.string().uuid().optional().nullable(),
  inbox_id:           z.string().uuid().optional().nullable(),
  survey_token:       z.string().optional().nullable(),
});

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/csat?agent_id=&inbox_id=&from=&to=&limit=
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const filters = {
      agentId: typeof req.query.agent_id === 'string' ? req.query.agent_id : undefined,
      inboxId: typeof req.query.inbox_id === 'string' ? req.query.inbox_id : undefined,
      from:    typeof req.query.from     === 'string' ? req.query.from     : undefined,
      to:      typeof req.query.to       === 'string' ? req.query.to       : undefined,
      limit:   typeof req.query.limit    === 'string' ? Math.min(parseInt(req.query.limit), 1000) : 100,
    };
    res.json(await listCsatResponses(scope, filters));
  } catch (err) {
    console.error('Error listing CSAT responses:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/csat/summary  — aggregated stats
router.get('/summary', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const filters = {
      agentId: typeof req.query.agent_id === 'string' ? req.query.agent_id : undefined,
      inboxId: typeof req.query.inbox_id === 'string' ? req.query.inbox_id : undefined,
      from:    typeof req.query.from     === 'string' ? req.query.from     : undefined,
      to:      typeof req.query.to       === 'string' ? req.query.to       : undefined,
    };
    res.json(await getCsatSummary(scope, filters));
  } catch (err) {
    console.error('Error fetching CSAT summary:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/csat/by-token/:token  — resolve survey token (used in public survey page)
router.get('/by-token/:token', async (req: MultiTenantRequest, res: Response) => {
  try {
    const result = await getCsatByToken(req.tenantId!, req.params.token);
    if (!result) return res.status(404).json({ error: 'Survey not found' });
    res.json(result);
  } catch (err) {
    console.error('Error fetching CSAT by token:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/csat  — submit a survey response
router.post(
  '/',
  validate({ body: SubmitSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      res.status(201).json(await submitCsatResponse(scope, req.body));
    } catch (err: any) {
      if (err?.code === '23505') {
        return res.status(409).json({ error: 'Survey already submitted for this token' });
      }
      console.error('Error submitting CSAT response:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
