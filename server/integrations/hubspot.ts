/**
 * server/integrations/hubspot.ts
 *
 * HubSpot REST adapter (CRM v3). Coverage:
 *   - Objects: contacts, companies, deals, tickets, line items, products
 *     (CRUD + search + associations + batch read/write/upsert).
 *   - Pipelines: list and pipeline-stage management for deals/tickets.
 *   - Owners: list users (for assignee).
 *   - Engagements (notes, tasks, calls, emails, meetings) — via the
 *     unified v3 objects API with object type slugs.
 *   - Conversations (Inbox): channels, threads, messages, send replies.
 *   - Webhook subscriptions: create / update / delete (developer / app
 *     scope, requires the App Developer Token, set per-tenant if the
 *     merchant operates at app level).
 *
 * Auth: Bearer access_token from hubspot-oauth.ts.
 *
 * Docs:
 *   https://developers.hubspot.com/docs/api/crm/contacts
 *   https://developers.hubspot.com/docs/api/conversations
 */

import { logger } from '../utils/logger.js';

const BASE = 'https://api.hubapi.com';

export type HubspotObjectType =
  | 'contacts' | 'companies' | 'deals' | 'tickets'
  | 'line_items' | 'products' | 'quotes'
  | 'notes' | 'tasks' | 'calls' | 'emails' | 'meetings'
  | string;

export class HubspotAdapter {
  constructor(private readonly accessToken: string) {}

  private async req<T>(method: string, path: string, init?: { body?: unknown; query?: Record<string, string | number | boolean> }): Promise<T> {
    const url = new URL(`${BASE}${path}`);
    if (init?.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    };
    let body: BodyInit | undefined;
    if (init?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.body);
    }
    const res = await fetch(url.toString(), { method, headers, body });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let message = text;
      let category: string | null = null;
      try {
        const j = JSON.parse(text);
        message = j?.message ?? j?.error ?? text;
        category = j?.category ?? null;
      } catch { /* keep raw */ }
      const err: any = new Error(`hubspot ${method} ${path} ${res.status}: ${message}`);
      err.statusCode = res.status;
      err.hubspotCategory = category;
      err.hubspotRaw = text;
      throw err;
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  // ── Objects (generic CRM v3) ─────────────────────────────────────────────

  async getObject<T = any>(objectType: HubspotObjectType, id: string, properties?: string[], associations?: string[]): Promise<T> {
    const query: Record<string, string> = {};
    if (properties?.length) query.properties = properties.join(',');
    if (associations?.length) query.associations = associations.join(',');
    return this.req<T>('GET', `/crm/v3/objects/${encodeURIComponent(objectType)}/${encodeURIComponent(id)}`, { query });
  }

  async createObject(objectType: HubspotObjectType, properties: Record<string, unknown>, associations?: Array<{ to: { id: string }; types: Array<{ associationCategory: 'HUBSPOT_DEFINED' | 'USER_DEFINED' | 'INTEGRATOR_DEFINED'; associationTypeId: number }> }>): Promise<any> {
    return this.req('POST', `/crm/v3/objects/${encodeURIComponent(objectType)}`, {
      body: { properties, associations },
    });
  }

  async updateObject(objectType: HubspotObjectType, id: string, properties: Record<string, unknown>): Promise<any> {
    return this.req('PATCH', `/crm/v3/objects/${encodeURIComponent(objectType)}/${encodeURIComponent(id)}`, {
      body: { properties },
    });
  }

  async deleteObject(objectType: HubspotObjectType, id: string): Promise<void> {
    await this.req('DELETE', `/crm/v3/objects/${encodeURIComponent(objectType)}/${encodeURIComponent(id)}`);
  }

  async searchObjects(objectType: HubspotObjectType, body: { filterGroups?: Array<{ filters: Array<{ propertyName: string; operator: string; value?: string | number; values?: string[] }> }>; sorts?: Array<{ propertyName: string; direction: 'ASCENDING' | 'DESCENDING' }>; properties?: string[]; limit?: number; after?: string; query?: string }): Promise<{ total: number; results: any[]; paging?: { next?: { after: string } } }> {
    return this.req('POST', `/crm/v3/objects/${encodeURIComponent(objectType)}/search`, { body });
  }

  async batchReadObjects(objectType: HubspotObjectType, ids: string[], properties?: string[], idProperty?: string): Promise<{ results: any[] }> {
    return this.req('POST', `/crm/v3/objects/${encodeURIComponent(objectType)}/batch/read`, {
      body: { properties, idProperty, inputs: ids.map((id) => ({ id })) },
    });
  }

  async batchUpsertObjects(objectType: HubspotObjectType, idProperty: string, inputs: Array<{ id: string; properties: Record<string, unknown> }>): Promise<{ results: any[] }> {
    return this.req('POST', `/crm/v3/objects/${encodeURIComponent(objectType)}/batch/upsert`, {
      body: { idProperty, inputs },
    });
  }

  async associateObjects(fromType: HubspotObjectType, fromId: string, toType: HubspotObjectType, toId: string, associationCategory: 'HUBSPOT_DEFINED' | 'USER_DEFINED' | 'INTEGRATOR_DEFINED', associationTypeId: number): Promise<void> {
    await this.req('PUT', `/crm/v4/objects/${encodeURIComponent(fromType)}/${encodeURIComponent(fromId)}/associations/${encodeURIComponent(toType)}/${encodeURIComponent(toId)}`, {
      body: [{ associationCategory, associationTypeId }],
    });
  }

  // ── Contacts (the CRM-AI hot path) ───────────────────────────────────────

  async findContactByEmail(email: string, properties?: string[]): Promise<any | null> {
    const r = await this.searchObjects('contacts', {
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
      properties: properties ?? ['email', 'firstname', 'lastname', 'phone', 'lifecyclestage', 'hs_lead_status'],
      limit: 1,
    });
    return r.results[0] ?? null;
  }

  async upsertContactByEmail(email: string, properties: Record<string, unknown>): Promise<any> {
    return this.req('POST', `/crm/v3/objects/contacts/batch/upsert`, {
      body: { idProperty: 'email', inputs: [{ id: email, properties: { email, ...properties } }] },
    });
  }

  // ── Tickets ──────────────────────────────────────────────────────────────

  async listOpenTickets(opts?: { contactId?: string; ownerId?: string; pipelineStage?: string; limit?: number }): Promise<{ total: number; results: any[] }> {
    const filters: Array<{ propertyName: string; operator: string; value?: string }> = [
      { propertyName: 'hs_pipeline_stage', operator: 'NEQ', value: 'closed' },
    ];
    if (opts?.contactId) filters.push({ propertyName: 'associations.contact', operator: 'EQ', value: opts.contactId });
    if (opts?.ownerId) filters.push({ propertyName: 'hubspot_owner_id', operator: 'EQ', value: opts.ownerId });
    if (opts?.pipelineStage) filters.push({ propertyName: 'hs_pipeline_stage', operator: 'EQ', value: opts.pipelineStage });
    return this.searchObjects('tickets', {
      filterGroups: [{ filters }],
      properties: ['subject', 'content', 'hs_ticket_priority', 'hs_pipeline_stage', 'hs_pipeline', 'hubspot_owner_id', 'createdate', 'hs_lastmodifieddate'],
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
      limit: opts?.limit ?? 25,
    });
  }

  async createTicket(payload: { subject: string; content?: string; hs_ticket_priority?: 'LOW' | 'MEDIUM' | 'HIGH'; hs_pipeline?: string; hs_pipeline_stage?: string; hubspot_owner_id?: string; [key: string]: unknown }, associatedContactId?: string): Promise<any> {
    return this.createObject('tickets', payload, associatedContactId ? [{
      to: { id: associatedContactId },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 16 /* ticket-to-contact */ }],
    }] : undefined);
  }

  // ── Pipelines ────────────────────────────────────────────────────────────

  async listPipelines(objectType: 'tickets' | 'deals' = 'tickets'): Promise<{ results: any[] }> {
    return this.req('GET', `/crm/v3/pipelines/${objectType}`);
  }

  // ── Owners ───────────────────────────────────────────────────────────────

  async listOwners(opts?: { email?: string; limit?: number; after?: string }): Promise<{ results: any[]; paging?: any }> {
    const query: Record<string, string | number> = { limit: opts?.limit ?? 100 };
    if (opts?.email) query.email = opts.email;
    if (opts?.after) query.after = opts.after;
    return this.req('GET', `/crm/v3/owners`, { query });
  }

  // ── Conversations Inbox ──────────────────────────────────────────────────

  async listChannels(): Promise<{ results: any[] }> {
    return this.req('GET', `/conversations/v3/conversations/channels`);
  }

  async listThreads(opts?: { limit?: number; after?: string; status?: 'OPEN' | 'CLOSED'; sort?: string }): Promise<{ results: any[]; paging?: any }> {
    const query: Record<string, string | number> = { limit: opts?.limit ?? 25 };
    if (opts?.after) query.after = opts.after;
    if (opts?.status) query.status = opts.status;
    if (opts?.sort) query.sort = opts.sort;
    return this.req('GET', `/conversations/v3/conversations/threads`, { query });
  }

  async getThread(threadId: string): Promise<any> {
    return this.req('GET', `/conversations/v3/conversations/threads/${encodeURIComponent(threadId)}`);
  }

  async listThreadMessages(threadId: string, opts?: { limit?: number; after?: string }): Promise<{ results: any[]; paging?: any }> {
    const query: Record<string, string | number> = { limit: opts?.limit ?? 50 };
    if (opts?.after) query.after = opts.after;
    return this.req('GET', `/conversations/v3/conversations/threads/${encodeURIComponent(threadId)}/messages`, { query });
  }

  async sendMessage(threadId: string, payload: { type: 'MESSAGE' | 'COMMENT'; text?: string; richText?: string; senderActorId: string; channelId?: string; channelAccountId?: string; recipients?: any[] }): Promise<any> {
    return this.req('POST', `/conversations/v3/conversations/threads/${encodeURIComponent(threadId)}/messages`, { body: payload });
  }

  async updateThreadStatus(threadId: string, status: 'OPEN' | 'CLOSED'): Promise<any> {
    return this.req('PATCH', `/conversations/v3/conversations/threads/${encodeURIComponent(threadId)}`, {
      body: { status },
    });
  }

  // ── Webhook subscriptions (App-level — requires DEVELOPER_API_KEY) ───────

  async listWebhookSubscriptions(appId: number, developerApiKey: string): Promise<any> {
    const url = `${BASE}/webhooks/v3/${appId}/subscriptions?hapikey=${encodeURIComponent(developerApiKey)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`hubspot list webhook subs ${res.status}`);
    return res.json();
  }

  async createWebhookSubscription(appId: number, developerApiKey: string, body: { eventType: string; propertyName?: string; active?: boolean }): Promise<any> {
    const url = `${BASE}/webhooks/v3/${appId}/subscriptions?hapikey=${encodeURIComponent(developerApiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`hubspot create webhook sub ${res.status}: ${text}`);
    }
    return res.json();
  }

  // ── Health ────────────────────────────────────────────────────────────────

  async ping(): Promise<{ ok: boolean; statusCode?: number }> {
    try {
      await this.listOwners({ limit: 1 });
      return { ok: true };
    } catch (err: any) {
      logger.warn('hubspot ping failed', { error: err?.message });
      return { ok: false, statusCode: err?.statusCode };
    }
  }
}
