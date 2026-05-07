/**
 * server/routes/freshdeskIntegration.ts
 *
 * Freshdesk integration endpoints. Auth uses HTTP Basic (apiKey:X).
 * All routes require a connected tenant; connection is validated live against
 * GET /agents/me before the connector record is persisted.
 *
 *   POST  /connect               — validate API key + subdomain, persist connector
 *   POST  /disconnect            — flag connector as disconnected
 *   GET   /status                — return connector info
 *   GET   /tickets               — list tickets (paginated, filterable)
 *   POST  /tickets               — create ticket
 *   GET   /tickets/:id           — get ticket with conversations
 *   PATCH /tickets/:id           — update ticket fields
 *   POST  /tickets/:id/notes     — add a note
 *   POST  /tickets/:id/reply     — add a reply
 *   GET   /contacts/search       — search contacts (?q=)
 *   POST  /contacts              — create contact
 *   GET   /agents                — list workspace agents
 */

import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '../db/supabase.js';
import { logger } from '../utils/logger.js';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { FreshdeskAdapter } from '../integrations/freshdesk.js';
import {
  freshdeskForTenant,
  invalidateFreshdeskForTenant,
} from '../integrations/freshdesk-tenant.js';

export const freshdeskIntegrationRouter = Router();

// ── POST /connect ─────────────────────────────────────────────────────────────

freshdeskIntegrationRouter.post(
  '/connect',
  extractMultiTenant,
  async (req: MultiTenantRequest, res: Response) => {
    if (!req.tenantId || !req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const subdomain = String(req.body?.subdomain || '')
      .trim()
      .toLowerCase()
      .replace(/\.freshdesk\.com$/, '');
    const apiKey = String(req.body?.api_key || '').trim();

    if (!subdomain) {
      return res.status(400).json({ error: 'subdomain is required (e.g. "mi-empresa")' });
    }
    if (!apiKey) {
      return res.status(400).json({ error: 'api_key is required' });
    }

    // Validate credentials by calling /agents/me
    let agent: { id: number; name: string | null; email: string | null; contact?: { name?: string } };
    try {
      const adapter = new FreshdeskAdapter(subdomain, apiKey);
      agent = await adapter.getAgent();
    } catch (err: any) {
      return res.status(400).json({
        error: 'Freshdesk rejected the credentials. Verify the subdomain and API key.',
        details: String(err?.message ?? err).split(': ').slice(-1)[0],
      });
    }

    const supabase = getSupabaseAdmin();
    const now = new Date().toISOString();
    const connectorId = `freshdesk::${req.tenantId}::${subdomain}`;

    const authConfig = {
      subdomain,
      api_key: apiKey,
      agent_id: agent.id ?? null,
      agent_name: agent.name ?? agent.contact?.name ?? null,
      agent_email: agent.email ?? null,
      granted_at: now,
    };

    const { error } = await supabase.from('connectors').upsert(
      {
        id: connectorId,
        tenant_id: req.tenantId,
        system: 'freshdesk',
        name: agent.name ?? `Freshdesk (${subdomain})`,
        status: 'connected',
        auth_type: 'api_key',
        auth_config: authConfig,
        capabilities: {
          sends: ['tickets', 'notes', 'replies'],
          reads: ['tickets', 'contacts', 'agents'],
        },
        last_health_check_at: now,
        created_at: now,
        updated_at: now,
      },
      { onConflict: 'id' },
    );

    if (error) {
      logger.error('Freshdesk connect: upsert failed', { error: error.message });
      return res.status(500).json({ error: 'Could not persist Freshdesk connector' });
    }

    invalidateFreshdeskForTenant(req.tenantId, req.workspaceId ?? null);

    await supabase
      .from('audit_events')
      .insert({
        id: randomUUID(),
        tenant_id: req.tenantId,
        workspace_id: req.workspaceId ?? req.tenantId,
        actor_id: req.userId,
        actor_type: 'user',
        action: 'INTEGRATION_CONNECTED',
        entity_type: 'connector',
        entity_id: connectorId,
        metadata: {
          system: 'freshdesk',
          subdomain,
          agent_email: agent.email,
        },
        occurred_at: now,
      })
      .then(() => {}, () => {});

    return res.json({
      ok: true,
      agent: {
        id: agent.id,
        name: agent.name ?? agent.contact?.name ?? null,
        email: agent.email,
      },
      subdomain,
    });
  },
);

// ── POST /disconnect ──────────────────────────────────────────────────────────

freshdeskIntegrationRouter.post(
  '/disconnect',
  extractMultiTenant,
  async (req: MultiTenantRequest, res: Response) => {
    if (!req.tenantId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('connectors')
      .update({ status: 'disconnected', updated_at: new Date().toISOString() })
      .eq('tenant_id', req.tenantId)
      .eq('system', 'freshdesk');
    if (error) return res.status(500).json({ error: error.message });
    invalidateFreshdeskForTenant(req.tenantId, req.workspaceId ?? null);
    return res.json({ ok: true });
  },
);

// ── GET /status ───────────────────────────────────────────────────────────────

freshdeskIntegrationRouter.get(
  '/status',
  extractMultiTenant,
  async (req: MultiTenantRequest, res: Response) => {
    if (!req.tenantId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('connectors')
      .select('id, name, status, auth_config, capabilities, last_health_check_at, updated_at')
      .eq('tenant_id', req.tenantId)
      .eq('system', 'freshdesk')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.json({ connected: false });
    const cfg = (data.auth_config ?? {}) as Record<string, unknown>;
    return res.json({
      connected: data.status === 'connected',
      subdomain: cfg.subdomain ?? null,
      agent_name: cfg.agent_name ?? data.name ?? null,
      agent_email: cfg.agent_email ?? null,
      capabilities: data.capabilities ?? null,
      last_health_check_at: data.last_health_check_at,
      updated_at: data.updated_at,
    });
  },
);

// ── GET /tickets ──────────────────────────────────────────────────────────────

freshdeskIntegrationRouter.get(
  '/tickets',
  extractMultiTenant,
  async (req: MultiTenantRequest, res: Response) => {
    if (!req.tenantId || !req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const resolved = await freshdeskForTenant(req.tenantId, req.workspaceId ?? null);
    if (!resolved) return res.status(404).json({ error: 'Freshdesk not connected' });
    try {
      const tickets = await resolved.adapter.listTickets({
        page: req.query.page ? Number(req.query.page) : undefined,
        per_page: req.query.per_page ? Number(req.query.per_page) : undefined,
        filter: req.query.filter ? String(req.query.filter) : undefined,
        order_by: req.query.order_by ? String(req.query.order_by) : undefined,
        order_type:
          req.query.order_type === 'asc' || req.query.order_type === 'desc'
            ? (req.query.order_type as 'asc' | 'desc')
            : undefined,
      });
      return res.json({ tickets });
    } catch (err: any) {
      return res.status(502).json({ error: String(err?.message ?? err) });
    }
  },
);

// ── POST /tickets ─────────────────────────────────────────────────────────────

freshdeskIntegrationRouter.post(
  '/tickets',
  extractMultiTenant,
  async (req: MultiTenantRequest, res: Response) => {
    if (!req.tenantId || !req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const resolved = await freshdeskForTenant(req.tenantId, req.workspaceId ?? null);
    if (!resolved) return res.status(404).json({ error: 'Freshdesk not connected' });

    const { subject, description, email, requester_id, status, priority, type, tags } =
      req.body ?? {};
    if (!subject || !description) {
      return res.status(400).json({ error: 'subject and description are required' });
    }

    try {
      const ticket = await resolved.adapter.createTicket({
        subject: String(subject),
        description: String(description),
        email: email ? String(email) : undefined,
        requester_id: requester_id ? Number(requester_id) : undefined,
        status: status !== undefined ? Number(status) : undefined,
        priority: priority !== undefined ? Number(priority) : undefined,
        type: type ? String(type) : undefined,
        tags: Array.isArray(tags) ? tags.map(String) : undefined,
      });
      return res.status(201).json({ ticket });
    } catch (err: any) {
      return res.status(502).json({ error: String(err?.message ?? err) });
    }
  },
);

// ── GET /tickets/:id ──────────────────────────────────────────────────────────

freshdeskIntegrationRouter.get(
  '/tickets/:id',
  extractMultiTenant,
  async (req: MultiTenantRequest, res: Response) => {
    if (!req.tenantId || !req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const resolved = await freshdeskForTenant(req.tenantId, req.workspaceId ?? null);
    if (!resolved) return res.status(404).json({ error: 'Freshdesk not connected' });
    try {
      const ticket = await resolved.adapter.getTicket(Number(req.params.id));
      return res.json({ ticket });
    } catch (err: any) {
      return res.status(502).json({ error: String(err?.message ?? err) });
    }
  },
);

// ── PATCH /tickets/:id ────────────────────────────────────────────────────────

freshdeskIntegrationRouter.patch(
  '/tickets/:id',
  extractMultiTenant,
  async (req: MultiTenantRequest, res: Response) => {
    if (!req.tenantId || !req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const resolved = await freshdeskForTenant(req.tenantId, req.workspaceId ?? null);
    if (!resolved) return res.status(404).json({ error: 'Freshdesk not connected' });
    try {
      const { status, priority, assignee_id, tags, type, group_id } = req.body ?? {};
      const ticket = await resolved.adapter.updateTicket(Number(req.params.id), {
        status: status !== undefined ? Number(status) : undefined,
        priority: priority !== undefined ? Number(priority) : undefined,
        assignee_id: assignee_id !== undefined ? Number(assignee_id) : undefined,
        tags: Array.isArray(tags) ? tags.map(String) : undefined,
        type: type ? String(type) : undefined,
        group_id: group_id !== undefined ? Number(group_id) : undefined,
      });
      return res.json({ ticket });
    } catch (err: any) {
      return res.status(502).json({ error: String(err?.message ?? err) });
    }
  },
);

// ── POST /tickets/:id/notes ───────────────────────────────────────────────────

freshdeskIntegrationRouter.post(
  '/tickets/:id/notes',
  extractMultiTenant,
  async (req: MultiTenantRequest, res: Response) => {
    if (!req.tenantId || !req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const resolved = await freshdeskForTenant(req.tenantId, req.workspaceId ?? null);
    if (!resolved) return res.status(404).json({ error: 'Freshdesk not connected' });

    const body = req.body?.body;
    if (!body) return res.status(400).json({ error: 'body is required' });

    try {
      const note = await resolved.adapter.addNote(
        Number(req.params.id),
        String(body),
        Boolean(req.body?.private),
      );
      return res.status(201).json({ note });
    } catch (err: any) {
      return res.status(502).json({ error: String(err?.message ?? err) });
    }
  },
);

// ── POST /tickets/:id/reply ───────────────────────────────────────────────────

freshdeskIntegrationRouter.post(
  '/tickets/:id/reply',
  extractMultiTenant,
  async (req: MultiTenantRequest, res: Response) => {
    if (!req.tenantId || !req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const resolved = await freshdeskForTenant(req.tenantId, req.workspaceId ?? null);
    if (!resolved) return res.status(404).json({ error: 'Freshdesk not connected' });

    const body = req.body?.body;
    if (!body) return res.status(400).json({ error: 'body is required' });

    try {
      const reply = await resolved.adapter.addReply(
        Number(req.params.id),
        String(body),
        Array.isArray(req.body?.cc_emails) ? req.body.cc_emails.map(String) : undefined,
      );
      return res.status(201).json({ reply });
    } catch (err: any) {
      return res.status(502).json({ error: String(err?.message ?? err) });
    }
  },
);

// ── GET /contacts/search ──────────────────────────────────────────────────────

freshdeskIntegrationRouter.get(
  '/contacts/search',
  extractMultiTenant,
  async (req: MultiTenantRequest, res: Response) => {
    if (!req.tenantId || !req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const resolved = await freshdeskForTenant(req.tenantId, req.workspaceId ?? null);
    if (!resolved) return res.status(404).json({ error: 'Freshdesk not connected' });

    const q = req.query.q ? String(req.query.q).trim() : '';
    if (!q) return res.status(400).json({ error: 'q is required' });

    try {
      const result = await resolved.adapter.searchContacts(q);
      return res.json(result);
    } catch (err: any) {
      return res.status(502).json({ error: String(err?.message ?? err) });
    }
  },
);

// ── POST /contacts ────────────────────────────────────────────────────────────

freshdeskIntegrationRouter.post(
  '/contacts',
  extractMultiTenant,
  async (req: MultiTenantRequest, res: Response) => {
    if (!req.tenantId || !req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const resolved = await freshdeskForTenant(req.tenantId, req.workspaceId ?? null);
    if (!resolved) return res.status(404).json({ error: 'Freshdesk not connected' });

    const { name, email, phone, mobile, company_id, tags } = req.body ?? {};
    if (!name) return res.status(400).json({ error: 'name is required' });

    try {
      const contact = await resolved.adapter.createContact({
        name: String(name),
        email: email ? String(email) : undefined,
        phone: phone ? String(phone) : undefined,
        mobile: mobile ? String(mobile) : undefined,
        company_id: company_id ? Number(company_id) : undefined,
        tags: Array.isArray(tags) ? tags.map(String) : undefined,
      });
      return res.status(201).json({ contact });
    } catch (err: any) {
      return res.status(502).json({ error: String(err?.message ?? err) });
    }
  },
);

// ── GET /agents ───────────────────────────────────────────────────────────────

freshdeskIntegrationRouter.get(
  '/agents',
  extractMultiTenant,
  async (req: MultiTenantRequest, res: Response) => {
    if (!req.tenantId || !req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const resolved = await freshdeskForTenant(req.tenantId, req.workspaceId ?? null);
    if (!resolved) return res.status(404).json({ error: 'Freshdesk not connected' });
    try {
      const agents = await resolved.adapter.listAgents();
      return res.json({ agents });
    } catch (err: any) {
      return res.status(502).json({ error: String(err?.message ?? err) });
    }
  },
);
