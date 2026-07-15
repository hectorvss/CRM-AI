/**
 * server/routes/personalApiKeys.ts
 *
 * Personal API keys CRUD. Mounted at /api/personal-api-keys/.
 * All operations are self-service for the authenticated user (req.userId).
 * Plaintext value is returned ONCE at create/regenerate; never readable again.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { sendError } from '../http/errors.js';
import {
  listPersonalApiKeys,
  getPersonalApiKey,
  createPersonalApiKey,
  updatePersonalApiKey,
  deletePersonalApiKey,
  regeneratePersonalApiKey,
} from '../data/personalApiKeys.js';

const router = Router();
router.use(extractMultiTenant);

function scopeFromReq(req: MultiTenantRequest) {
  if (!req.tenantId || !req.userId) return null;
  return { tenantId: req.tenantId, userId: req.userId };
}

const CreateSchema = z.object({
  label:                 z.string().min(1),
  scopes:                z.array(z.string()).min(1),
  scoped_organizations:  z.array(z.string()).optional(),
  scoped_teams:          z.array(z.number().int()).optional(),
  expires_at:            z.string().datetime().optional().nullable(),
});
const UpdateSchema = CreateSchema.partial();

router.get('/', async (req: MultiTenantRequest, res: Response) => {
  const scope = scopeFromReq(req);
  if (!scope) return sendError(res, 401, 'AUTHENTICATION_REQUIRED', 'A signed-in user is required');
  try {
    res.json(await listPersonalApiKeys(scope));
  } catch (err) {
    console.error('Error listing personal API keys:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  const scope = scopeFromReq(req);
  if (!scope) return sendError(res, 401, 'AUTHENTICATION_REQUIRED', 'A signed-in user is required');
  try {
    const key = await getPersonalApiKey(scope, req.params.id);
    if (!key) return res.status(404).json({ error: 'Key not found' });
    res.json(key);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req: MultiTenantRequest, res: Response) => {
  const scope = scopeFromReq(req);
  if (!scope) return sendError(res, 401, 'AUTHENTICATION_REQUIRED', 'A signed-in user is required');
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'INVALID_PAYLOAD', parsed.error.message);
  try {
    const { row, value } = await createPersonalApiKey(scope, parsed.data);
    res.status(201).json({ ...row, value });
  } catch (err) {
    console.error('Error creating personal API key:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id', async (req: MultiTenantRequest, res: Response) => {
  const scope = scopeFromReq(req);
  if (!scope) return sendError(res, 401, 'AUTHENTICATION_REQUIRED', 'A signed-in user is required');
  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'INVALID_PAYLOAD', parsed.error.message);
  try {
    const existing = await getPersonalApiKey(scope, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Key not found' });
    const updated = await updatePersonalApiKey(scope, req.params.id, parsed.data);
    res.json(updated);
  } catch (err) {
    console.error('Error updating personal API key:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: MultiTenantRequest, res: Response) => {
  const scope = scopeFromReq(req);
  if (!scope) return sendError(res, 401, 'AUTHENTICATION_REQUIRED', 'A signed-in user is required');
  try {
    const existing = await getPersonalApiKey(scope, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Key not found' });
    await deletePersonalApiKey(scope, req.params.id);
    res.status(204).send();
  } catch (err) {
    console.error('Error deleting personal API key:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/regenerate', async (req: MultiTenantRequest, res: Response) => {
  const scope = scopeFromReq(req);
  if (!scope) return sendError(res, 401, 'AUTHENTICATION_REQUIRED', 'A signed-in user is required');
  try {
    const result = await regeneratePersonalApiKey(scope, req.params.id);
    if (!result) return res.status(404).json({ error: 'Key not found' });
    res.json({ ...result.row, value: result.value });
  } catch (err) {
    console.error('Error regenerating personal API key:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
