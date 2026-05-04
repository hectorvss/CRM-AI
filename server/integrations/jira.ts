/**
 * server/integrations/jira.ts
 *
 * Jira REST API v3 adapter, scoped to a single cloudid.
 *
 * The base URL is `https://api.atlassian.com/ex/jira/{cloudid}/rest/api/3/`.
 * Auth is `Bearer <accessToken>` against the Atlassian gateway.
 *
 * If a call returns 401, the caller is responsible for refreshing the
 * token (we surface a typed error so the resolver can swap in a new token
 * and retry).
 */

import { logger } from '../utils/logger.js';

export class JiraAuthError extends Error {
  constructor(message: string) { super(message); this.name = 'JiraAuthError'; }
}

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: Record<string, any>;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey?: string;
  simplified?: boolean;
  avatarUrls?: Record<string, string>;
}

export interface JiraIssueType {
  id: string;
  name: string;
  iconUrl?: string;
  subtask?: boolean;
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  active?: boolean;
}

export interface JiraWebhook {
  id: number;
  events: string[];
  jqlFilter?: string;
  expirationDate?: string;
}

export class JiraAdapter {
  private base: string;
  constructor(private accessToken: string, public cloudId: string) {
    this.base = `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}/rest/api/3`;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.base}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 || res.status === 403) {
      throw new JiraAuthError(`jira ${method} ${path} unauthorized (${res.status})`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`jira ${method} ${path} failed: ${res.status} ${text}`);
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  // ── Identity / health ──────────────────────────────────────────────────────
  async myself(): Promise<JiraUser> {
    return this.request<JiraUser>('GET', '/myself');
  }
  async ping(): Promise<{ ok: boolean }> {
    try { await this.myself(); return { ok: true }; }
    catch (err) { logger.warn('jira ping failed', { error: String(err) }); return { ok: false }; }
  }

  // ── Projects + metadata ────────────────────────────────────────────────────
  async listProjects(): Promise<JiraProject[]> {
    // /project/search returns paginated; for picker, take first 50.
    const r = await this.request<any>('GET', '/project/search?maxResults=50&orderBy=lastIssueUpdatedTime');
    return (r?.values ?? []) as JiraProject[];
  }
  async listIssueTypes(projectId?: string): Promise<JiraIssueType[]> {
    if (projectId) {
      const r = await this.request<any>('GET', `/project/${encodeURIComponent(projectId)}/statuses`);
      // Aggregate unique issue types across statuses
      const seen = new Map<string, JiraIssueType>();
      for (const t of r ?? []) {
        if (!seen.has(t.id)) seen.set(t.id, { id: String(t.id), name: String(t.name), iconUrl: t.iconUrl });
      }
      return Array.from(seen.values());
    }
    return this.request<JiraIssueType[]>('GET', '/issuetype');
  }

  // ── Issues ─────────────────────────────────────────────────────────────────
  async getIssue(idOrKey: string): Promise<JiraIssue> {
    return this.request<JiraIssue>('GET', `/issue/${encodeURIComponent(idOrKey)}`);
  }
  async createIssue(payload: {
    projectKey?: string;
    projectId?: string;
    summary: string;
    description?: string;
    issueTypeName?: string;
    issueTypeId?: string;
    priorityName?: string;
    labels?: string[];
    assigneeAccountId?: string;
    reporterAccountId?: string;
    extraFields?: Record<string, any>;
  }): Promise<{ id: string; key: string; self: string }> {
    const fields: Record<string, any> = { summary: payload.summary };
    if (payload.projectKey) fields.project = { key: payload.projectKey };
    else if (payload.projectId) fields.project = { id: payload.projectId };
    if (payload.issueTypeName) fields.issuetype = { name: payload.issueTypeName };
    else if (payload.issueTypeId) fields.issuetype = { id: payload.issueTypeId };
    if (payload.description) {
      // ADF (Atlassian Document Format) — minimal paragraph wrapper
      fields.description = {
        type: 'doc', version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: String(payload.description) }] }],
      };
    }
    if (payload.priorityName) fields.priority = { name: payload.priorityName };
    if (payload.labels?.length) fields.labels = payload.labels;
    if (payload.assigneeAccountId) fields.assignee = { accountId: payload.assigneeAccountId };
    if (payload.reporterAccountId) fields.reporter = { accountId: payload.reporterAccountId };
    if (payload.extraFields) Object.assign(fields, payload.extraFields);
    return this.request('POST', '/issue', { fields });
  }
  async updateIssue(idOrKey: string, payload: { summary?: string; labels?: string[]; assigneeAccountId?: string | null; extraFields?: Record<string, any> }): Promise<void> {
    const fields: Record<string, any> = {};
    if (payload.summary !== undefined) fields.summary = payload.summary;
    if (payload.labels !== undefined) fields.labels = payload.labels;
    if (payload.assigneeAccountId !== undefined) {
      fields.assignee = payload.assigneeAccountId ? { accountId: payload.assigneeAccountId } : null;
    }
    if (payload.extraFields) Object.assign(fields, payload.extraFields);
    await this.request('PUT', `/issue/${encodeURIComponent(idOrKey)}`, { fields });
  }
  async addComment(idOrKey: string, body: string): Promise<{ id: string }> {
    return this.request('POST', `/issue/${encodeURIComponent(idOrKey)}/comment`, {
      body: {
        type: 'doc', version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: String(body) }] }],
      },
    });
  }

  async searchIssues(opts: { jql: string; maxResults?: number; fields?: string[] }): Promise<{ issues: JiraIssue[]; total: number }> {
    const r = await this.request<any>('POST', '/search', {
      jql: opts.jql,
      maxResults: opts.maxResults ?? 25,
      fields: opts.fields ?? ['summary', 'status', 'priority', 'assignee', 'project', 'updated'],
    });
    return { issues: r?.issues ?? [], total: r?.total ?? 0 };
  }

  async findUserByEmail(email: string): Promise<JiraUser | null> {
    const r = await this.request<JiraUser[]>('GET', `/user/search?query=${encodeURIComponent(email)}`);
    return r?.[0] ?? null;
  }

  // ── Webhooks (dynamic, OAuth-only) ─────────────────────────────────────────
  async createWebhook(opts: { url: string; events: string[]; jql?: string }): Promise<{ id: number }[]> {
    const r = await this.request<any>('POST', '/webhook', {
      url: opts.url,
      webhooks: [{
        events: opts.events,
        jqlFilter: opts.jql ?? '',
        fieldIdsFilter: [],
        issuePropertyKeysFilter: [],
      }],
    });
    return (r?.webhookRegistrationResult ?? []).map((row: any) => ({ id: row.createdWebhookId })).filter((x: any) => x.id);
  }
  async listWebhooks(): Promise<JiraWebhook[]> {
    const r = await this.request<any>('GET', '/webhook?maxResults=100');
    return r?.values ?? [];
  }
  async deleteWebhooks(ids: number[]): Promise<void> {
    if (!ids.length) return;
    await this.request('DELETE', '/webhook', { webhookIds: ids });
  }
  async refreshWebhooks(ids: number[]): Promise<{ expirationDate: string } | null> {
    if (!ids.length) return null;
    return this.request('PUT', '/webhook/refresh', { webhookIds: ids });
  }
}
