/**
 * server/integrations/salesforce.ts
 *
 * Salesforce REST adapter. Coverage focused on what a customer-support
 * agent actually needs:
 *   - sObject CRUD on standard + custom objects (Contact, Account, Lead,
 *     Opportunity, Case, Task, Note, ContentNote, Attachment).
 *   - SOQL queries (with auto-pagination via /query/{nextRecordsUrl}).
 *   - SOSL search across multiple objects.
 *   - Composite API for batched / atomic multi-record changes.
 *   - Platform Events publish (push to PE channel for streaming).
 *   - Streaming API CometD topics — we don't connect long-poll here, but
 *     we expose `subscribePushTopic` so the consumer can hand off to a
 *     CometD client; status / management endpoints are what we need.
 *
 * Auth: Bearer access_token; instance_url is the per-org base.
 *
 * Docs: https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/
 */

import { logger } from '../utils/logger.js';

export type SalesforceObjectName =
  | 'Account' | 'Contact' | 'Lead' | 'Opportunity' | 'Case' | 'Task'
  | 'Note' | 'ContentNote' | 'Attachment' | 'CampaignMember' | 'User'
  | string;

export interface SoqlPage<T = any> {
  totalSize: number;
  done: boolean;
  records: T[];
  nextRecordsUrl?: string;
}

export class SalesforceAdapter {
  constructor(
    private readonly accessToken: string,
    private readonly instanceUrl: string,
    private readonly apiVersion: string = 'v59.0',
  ) {}

  private async req<T>(method: string, path: string, init?: { body?: unknown; query?: Record<string, string | number | boolean>; raw?: boolean }): Promise<T> {
    const url = path.startsWith('http')
      ? new URL(path)
      : new URL(`${this.instanceUrl}${path.startsWith('/') ? '' : '/'}${path}`);
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
      let sfdcErrors: any = null;
      try {
        const j = JSON.parse(text);
        sfdcErrors = Array.isArray(j) ? j : (j?.errors ?? null);
        message = sfdcErrors?.[0]?.message ?? j?.message ?? text;
      } catch { /* keep raw */ }
      const err: any = new Error(`salesforce ${method} ${path} ${res.status}: ${message}`);
      err.statusCode = res.status;
      err.sfdcErrors = sfdcErrors;
      err.sfdcRaw = text;
      throw err;
    }
    if (res.status === 204) return undefined as unknown as T;
    if (init?.raw) return (await res.text()) as unknown as T;
    return (await res.json()) as T;
  }

  // ── Identity / health ─────────────────────────────────────────────────────

  async listLimits(): Promise<any> {
    return this.req('GET', `/services/data/${this.apiVersion}/limits`);
  }

  async listObjects(): Promise<{ encoding: string; maxBatchSize: number; sobjects: Array<{ name: string; label: string; createable: boolean; updateable: boolean }> }> {
    return this.req('GET', `/services/data/${this.apiVersion}/sobjects`);
  }

  // ── sObject CRUD ──────────────────────────────────────────────────────────

  async getRecord<T = any>(object: SalesforceObjectName, id: string, fields?: string[]): Promise<T> {
    const query = fields?.length ? { fields: fields.join(',') } : undefined;
    return this.req<T>('GET', `/services/data/${this.apiVersion}/sobjects/${encodeURIComponent(object)}/${encodeURIComponent(id)}`, { query });
  }

  async createRecord(object: SalesforceObjectName, body: Record<string, unknown>): Promise<{ id: string; success: boolean; errors: any[] }> {
    return this.req('POST', `/services/data/${this.apiVersion}/sobjects/${encodeURIComponent(object)}`, { body });
  }

  async updateRecord(object: SalesforceObjectName, id: string, body: Record<string, unknown>): Promise<void> {
    await this.req('PATCH', `/services/data/${this.apiVersion}/sobjects/${encodeURIComponent(object)}/${encodeURIComponent(id)}`, { body });
  }

  async deleteRecord(object: SalesforceObjectName, id: string): Promise<void> {
    await this.req('DELETE', `/services/data/${this.apiVersion}/sobjects/${encodeURIComponent(object)}/${encodeURIComponent(id)}`);
  }

  /** Upsert by external id field. Salesforce will create-if-missing or update-if-found. */
  async upsertByExternalId(object: SalesforceObjectName, externalIdField: string, externalIdValue: string, body: Record<string, unknown>): Promise<{ id?: string; created: boolean; success: boolean; errors: any[] }> {
    return this.req('PATCH', `/services/data/${this.apiVersion}/sobjects/${encodeURIComponent(object)}/${encodeURIComponent(externalIdField)}/${encodeURIComponent(externalIdValue)}`, { body });
  }

  // ── SOQL ──────────────────────────────────────────────────────────────────

  async query<T = any>(soql: string): Promise<SoqlPage<T>> {
    return this.req<SoqlPage<T>>('GET', `/services/data/${this.apiVersion}/query`, { query: { q: soql } });
  }

  /** Iterate all pages of a SOQL query. */
  async *queryAll<T = any>(soql: string): AsyncGenerator<T[]> {
    let page: SoqlPage<T> = await this.query<T>(soql);
    yield page.records;
    while (!page.done && page.nextRecordsUrl) {
      page = await this.req<SoqlPage<T>>('GET', page.nextRecordsUrl);
      yield page.records;
    }
  }

  // ── SOSL ──────────────────────────────────────────────────────────────────

  /**
   * SOSL across multiple sObjects in one call. Returns `{ searchRecords: T[] }`.
   * Example:
   *   FIND {acme} IN ALL FIELDS RETURNING Account(Id, Name), Contact(Id, Email)
   */
  async search<T = any>(sosl: string): Promise<{ searchRecords: T[] }> {
    return this.req('GET', `/services/data/${this.apiVersion}/search`, { query: { q: sosl } });
  }

  // ── Composite (batched / atomic) ──────────────────────────────────────────

  /**
   * Composite request for atomic multi-step operations. `allOrNone=true`
   * means rollback on any sub-request failure.
   */
  async composite(allOrNone: boolean, compositeRequest: Array<{ method: string; url: string; referenceId: string; body?: any }>): Promise<any> {
    return this.req('POST', `/services/data/${this.apiVersion}/composite`, {
      body: { allOrNone, compositeRequest },
    });
  }

  // ── Cases (the most common CRM-AI surface) ────────────────────────────────

  async listOpenCases(opts?: { contactId?: string; accountId?: string; limit?: number }): Promise<SoqlPage<any>> {
    const where: string[] = ["IsClosed = false"];
    if (opts?.contactId) where.push(`ContactId = '${escapeSoql(opts.contactId)}'`);
    if (opts?.accountId) where.push(`AccountId = '${escapeSoql(opts.accountId)}'`);
    const limit = Math.min(Math.max(opts?.limit ?? 25, 1), 200);
    const soql = `SELECT Id, CaseNumber, Subject, Status, Priority, Type, Origin, OwnerId, ContactId, AccountId, CreatedDate, LastModifiedDate FROM Case WHERE ${where.join(' AND ')} ORDER BY LastModifiedDate DESC LIMIT ${limit}`;
    return this.query(soql);
  }

  async createCase(payload: { Subject: string; Description?: string; Status?: string; Priority?: string; Origin?: string; ContactId?: string; AccountId?: string; OwnerId?: string; SuppliedEmail?: string; SuppliedName?: string; [key: string]: unknown }): Promise<{ id: string; success: boolean; errors: any[] }> {
    return this.createRecord('Case', payload);
  }

  async commentOnCase(caseId: string, body: string, isPublished = true): Promise<any> {
    return this.createRecord('CaseComment', { ParentId: caseId, CommentBody: body, IsPublished: isPublished });
  }

  // ── Contacts / Accounts ──────────────────────────────────────────────────

  async findContactByEmail(email: string): Promise<any | null> {
    const soql = `SELECT Id, FirstName, LastName, Email, Phone, AccountId, MailingCountry FROM Contact WHERE Email = '${escapeSoql(email)}' LIMIT 1`;
    const page = await this.query(soql);
    return page.records[0] ?? null;
  }

  async listContactsByAccount(accountId: string, limit = 50): Promise<SoqlPage<any>> {
    const soql = `SELECT Id, FirstName, LastName, Email, Phone, Title FROM Contact WHERE AccountId = '${escapeSoql(accountId)}' ORDER BY LastModifiedDate DESC LIMIT ${Math.min(limit, 200)}`;
    return this.query(soql);
  }

  // ── Tasks (touchpoints) ──────────────────────────────────────────────────

  async createTask(payload: { Subject: string; WhoId?: string; WhatId?: string; Status?: string; Priority?: string; ActivityDate?: string; Description?: string; OwnerId?: string }): Promise<{ id: string; success: boolean }> {
    return this.createRecord('Task', payload as Record<string, unknown>);
  }

  // ── PushTopic (Streaming API) ────────────────────────────────────────────

  /**
   * Create or update a PushTopic for streaming. The CometD client connects
   * to /cometd/{api}/topic/{name} on the instance to receive updates.
   * We just manage the topic record here.
   */
  async upsertPushTopic(opts: { name: string; query: string; description?: string; notifyForOperations?: 'Create' | 'Update' | 'Delete' | 'Undelete' | 'All'; notifyForFields?: 'All' | 'Referenced' | 'Select' | 'Where' }): Promise<{ id: string }> {
    const existing = await this.query(`SELECT Id FROM PushTopic WHERE Name = '${escapeSoql(opts.name)}' LIMIT 1`);
    const body: Record<string, unknown> = {
      Name: opts.name,
      Query: opts.query,
      ApiVersion: this.apiVersion.replace('v', ''),
      NotifyForOperationCreate: opts.notifyForOperations === 'Create' || opts.notifyForOperations === 'All' || !opts.notifyForOperations,
      NotifyForOperationUpdate: opts.notifyForOperations === 'Update' || opts.notifyForOperations === 'All' || !opts.notifyForOperations,
      NotifyForOperationDelete: opts.notifyForOperations === 'Delete' || opts.notifyForOperations === 'All',
      NotifyForOperationUndelete: opts.notifyForOperations === 'Undelete' || opts.notifyForOperations === 'All',
      NotifyForFields: opts.notifyForFields ?? 'Referenced',
      Description: opts.description ?? '',
    };
    if (existing.records[0]?.Id) {
      await this.updateRecord('PushTopic', existing.records[0].Id, body);
      return { id: existing.records[0].Id };
    }
    const created = await this.createRecord('PushTopic', body);
    return { id: created.id };
  }

  // ── Health ────────────────────────────────────────────────────────────────

  async ping(): Promise<{ ok: boolean; statusCode?: number }> {
    try {
      await this.listLimits();
      return { ok: true };
    } catch (err: any) {
      logger.warn('salesforce ping failed', { error: err?.message });
      return { ok: false, statusCode: err?.statusCode };
    }
  }
}

function escapeSoql(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
