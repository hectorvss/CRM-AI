/**
 * server/integrations/asana.ts
 *
 * Asana REST API v1 adapter (app.asana.com/api/1.0).
 *
 * All payloads use the `data: { ... }` envelope per Asana convention.
 */

import { ASANA_API_BASE } from './asana-oauth.js';
import { logger } from '../utils/logger.js';

export class AsanaAuthError extends Error {
  constructor(message: string) { super(message); this.name = 'AsanaAuthError'; }
}

export interface AsanaUser { gid: string; name: string; email?: string; resource_type: 'user' }
export interface AsanaWorkspace { gid: string; name: string; resource_type: 'workspace' }
export interface AsanaProject { gid: string; name: string; archived: boolean; workspace?: { gid: string }; team?: { gid: string }; resource_type: 'project' }
export interface AsanaTask {
  gid: string; name: string; resource_type: 'task'; completed: boolean;
  assignee?: { gid: string; name: string } | null;
  due_on?: string | null; due_at?: string | null;
  notes?: string; html_notes?: string;
  projects?: { gid: string; name: string }[];
  tags?: { gid: string; name: string }[];
  permalink_url?: string;
  modified_at?: string; created_at?: string;
}
export interface AsanaWebhook { gid: string; resource: { gid: string; resource_type: string }; target: string; active: boolean; filters?: any[]; created_at: string }

export class AsanaAdapter {
  constructor(private accessToken: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = path.startsWith('http') ? path : `${ASANA_API_BASE}${path}`;
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${this.accessToken}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 || res.status === 403) throw new AsanaAuthError(`asana ${method} ${path} unauthorized (${res.status})`);
    if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`asana ${method} ${path} failed: ${res.status} ${text}`); }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  async me(): Promise<AsanaUser> {
    const r = await this.request<{ data: AsanaUser }>('GET', '/users/me');
    return r.data;
  }
  async ping(): Promise<{ ok: boolean }> {
    try { await this.me(); return { ok: true }; }
    catch (err) { logger.warn('asana ping failed', { error: String(err) }); return { ok: false }; }
  }

  async listWorkspaces(): Promise<AsanaWorkspace[]> {
    const r = await this.request<{ data: AsanaWorkspace[] }>('GET', '/workspaces');
    return r.data;
  }
  async listProjects(workspaceGid: string, opts: { archived?: boolean; limit?: number } = {}): Promise<AsanaProject[]> {
    const params = new URLSearchParams();
    params.set('limit', String(opts.limit ?? 50));
    if (opts.archived !== undefined) params.set('archived', String(opts.archived));
    const r = await this.request<{ data: AsanaProject[] }>('GET', `/workspaces/${encodeURIComponent(workspaceGid)}/projects?${params.toString()}`);
    return r.data;
  }
  async listTasks(opts: { project?: string; assignee?: string; workspace?: string; completed_since?: string; limit?: number; opt_fields?: string } = {}): Promise<AsanaTask[]> {
    const params = new URLSearchParams();
    params.set('limit', String(opts.limit ?? 25));
    params.set('opt_fields', opts.opt_fields ?? 'name,completed,assignee.name,due_on,due_at,permalink_url,modified_at,projects.name,tags.name');
    if (opts.project) params.set('project', opts.project);
    if (opts.assignee) params.set('assignee', opts.assignee);
    if (opts.workspace) params.set('workspace', opts.workspace);
    if (opts.completed_since) params.set('completed_since', opts.completed_since);
    const r = await this.request<{ data: AsanaTask[] }>('GET', `/tasks?${params.toString()}`);
    return r.data;
  }
  async createTask(payload: { workspace: string; name: string; notes?: string; assignee?: string; due_on?: string; projects?: string[] }): Promise<AsanaTask> {
    const r = await this.request<{ data: AsanaTask }>('POST', '/tasks', { data: payload });
    return r.data;
  }
  async updateTask(taskGid: string, patch: Partial<AsanaTask & { assignee: string; projects: string[] }>): Promise<AsanaTask> {
    const r = await this.request<{ data: AsanaTask }>('PUT', `/tasks/${encodeURIComponent(taskGid)}`, { data: patch });
    return r.data;
  }
  async addTaskComment(taskGid: string, text: string): Promise<{ gid: string }> {
    const r = await this.request<{ data: { gid: string } }>('POST', `/tasks/${encodeURIComponent(taskGid)}/stories`, { data: { text } });
    return r.data;
  }
  async searchTasks(workspaceGid: string, q: string, limit = 25): Promise<AsanaTask[]> {
    const params = new URLSearchParams({ 'text': q, 'limit': String(limit), 'opt_fields': 'name,completed,assignee.name,due_on,permalink_url' });
    const r = await this.request<{ data: AsanaTask[] }>('GET', `/workspaces/${encodeURIComponent(workspaceGid)}/tasks/search?${params.toString()}`);
    return r.data;
  }

  // ── Webhooks (per-resource) ───────────────────────────────────────────────
  async createWebhook(opts: { resourceGid: string; targetUrl: string; filters?: any[] }): Promise<AsanaWebhook> {
    const r = await this.request<{ data: AsanaWebhook }>('POST', '/webhooks', { data: { resource: opts.resourceGid, target: opts.targetUrl, ...(opts.filters ? { filters: opts.filters } : {}) } });
    return r.data;
  }
  async listWebhooks(workspaceGid: string): Promise<AsanaWebhook[]> {
    const r = await this.request<{ data: AsanaWebhook[] }>('GET', `/webhooks?workspace=${encodeURIComponent(workspaceGid)}&limit=100`);
    return r.data;
  }
  async deleteWebhook(webhookGid: string): Promise<void> {
    await this.request('DELETE', `/webhooks/${encodeURIComponent(webhookGid)}`);
  }
}
