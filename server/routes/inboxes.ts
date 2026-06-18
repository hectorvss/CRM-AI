import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import { createAuditRepository } from '../data/index.js';
import {
  listInboxes,
  getInbox,
  createInbox,
  updateInbox,
  deleteInbox,
  listContactInboxes,
  upsertContactInbox,
  findContactBySourceId,
  type ChannelType,
} from '../data/inboxes.js';

const router = Router();
const auditRepository = createAuditRepository();
router.use(extractMultiTenant);

// ── Schemas ───────────────────────────────────────────────────────────────────

const CHANNEL_TYPES = [
  'email', 'whatsapp', 'phone', 'messenger', 'web_widget',
  'api', 'twitter', 'instagram', 'line', 'telegram', 'discord', 'sms',
] as const;

const CreateInboxSchema = z.object({
  name:                    z.string().min(1, 'Inbox name is required'),
  channel_type:            z.enum(CHANNEL_TYPES),
  channel_config:          z.record(z.string(), z.unknown()).default({}),
  greeting_enabled:        z.boolean().default(false),
  greeting_message:        z.string().optional().nullable(),
  out_of_office_message:   z.string().optional().nullable(),
  auto_assignment_enabled: z.boolean().default(false),
  assignment_policy_id:    z.string().optional().nullable(),
  working_hours_id:        z.string().optional().nullable(),
  email:                   z.string().email().optional().nullable(),
  csat_survey_enabled:     z.boolean().default(false),
  enabled:                 z.boolean().default(true),
});

const UpdateInboxSchema = CreateInboxSchema.partial();

const UpsertContactInboxSchema = z.object({
  contact_id: z.string().min(1),
  source_id:  z.string().min(1),
});

// ── Inbox CRUD (C1) ───────────────────────────────────────────────────────────

// GET /api/inboxes
router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const inboxes = await listInboxes(scope, {
      channel_type: typeof req.query.channel_type === 'string'
        ? req.query.channel_type as ChannelType : undefined,
      enabled: req.query.enabled === 'true' ? true : req.query.enabled === 'false' ? false : undefined,
    });
    res.json(inboxes);
  } catch (err) {
    console.error('Error listing inboxes:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/inboxes/:id
router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const inbox = await getInbox(scope, req.params.id);
    if (!inbox) return res.status(404).json({ error: 'Inbox not found' });
    res.json(inbox);
  } catch (err) {
    console.error('Error fetching inbox:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/inboxes
router.post(
  '/',
  requirePermission('settings.write'),
  validate({ body: CreateInboxSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const inbox = await createInbox(scope, req.body);
      await auditRepository.log(scope, {
        actorId: req.userId || 'system', action: 'INBOX_CREATED',
        entityType: 'inbox', entityId: inbox.id,
        newValue: { name: inbox.name, channel_type: inbox.channel_type },
        metadata: { source: 'inboxes_api' },
      });
      res.status(201).json(inbox);
    } catch (err) {
      console.error('Error creating inbox:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PATCH /api/inboxes/:id
router.patch(
  '/:id',
  requirePermission('settings.write'),
  validate({ body: UpdateInboxSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const inbox = await getInbox(scope, req.params.id);
      if (!inbox) return res.status(404).json({ error: 'Inbox not found' });
      const updated = await updateInbox(scope, req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error('Error updating inbox:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// DELETE /api/inboxes/:id
router.delete(
  '/:id',
  requirePermission('settings.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const inbox = await getInbox(scope, req.params.id);
      if (!inbox) return res.status(404).json({ error: 'Inbox not found' });
      await deleteInbox(scope, req.params.id);
      await auditRepository.log(scope, {
        actorId: req.userId || 'system', action: 'INBOX_DELETED',
        entityType: 'inbox', entityId: req.params.id,
        newValue: { name: inbox.name }, metadata: { source: 'inboxes_api' },
      });
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting inbox:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ── Contact Inboxes (C2) ──────────────────────────────────────────────────────

// GET /api/inboxes/contacts/:contactId  — all channel identities for a contact
router.get('/contacts/:contactId', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const identities = await listContactInboxes(scope, req.params.contactId);
    res.json(identities);
  } catch (err) {
    console.error('Error listing contact inboxes:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/inboxes/:id/contacts  — link a contact to this inbox with a source_id
router.post(
  '/:id/contacts',
  validate({ body: UpsertContactInboxSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const inbox = await getInbox(scope, req.params.id);
      if (!inbox) return res.status(404).json({ error: 'Inbox not found' });
      const ci = await upsertContactInbox(
        scope, req.body.contact_id, req.params.id, req.body.source_id,
      );
      res.status(201).json(ci);
    } catch (err) {
      console.error('Error upserting contact inbox:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// GET /api/inboxes/:id/lookup?source_id=...  — resolve source_id → contact
router.get('/:id/lookup', async (req: MultiTenantRequest, res: Response) => {
  const sourceId = typeof req.query.source_id === 'string' ? req.query.source_id : null;
  if (!sourceId) return res.status(400).json({ error: 'source_id query param required' });
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const result = await findContactBySourceId(scope, req.params.id, sourceId);
    if (!result) return res.status(404).json({ error: 'Contact not found for this source_id' });
    res.json(result);
  } catch (err) {
    console.error('Error looking up contact by source_id:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
