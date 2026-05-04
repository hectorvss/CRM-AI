/**
 * server/integrations/gitlab.ts
 *
 * GitLab REST API v4 adapter (gitlab.com or self-hosted).
 */

import { GITLAB_API_BASE } from './gitlab-oauth.js';
import { logger } from '../utils/logger.js';

export class GitLabAuthError extends Error { constructor(m: string) { super(m); this.name = 'GitLabAuthError'; } }

export interface GitLabUser { id: number; username: string; name: string; email?: string; avatar_url: string }
export interface GitLabProject { id: number; description?: string; name: string; name_with_namespace: string; path_with_namespace: string; default_branch?: string; visibility: string; web_url: string }
export interface GitLabIssue { id: number; iid: number; project_id: number; title: string; description?: string; state: 'opened' | 'closed'; author: { id: number; username: string }; assignees: any[]; labels: string[]; web_url: string; created_at: string; updated_at: string }
export interface GitLabMergeRequest { id: number; iid: number; project_id: number; title: string; state: 'opened' | 'closed' | 'merged'; source_branch: string; target_branch: string; web_url: string; author: { id: number; username: string }; assignees: any[] }
export interface GitLabHook { id: number; url: string; project_id?: number; push_events: boolean; issues_events: boolean; merge_requests_events: boolean; note_events: boolean; pipeline_events: boolean; created_at: string }

export class GitLabAdapter {
  private base: string;
  constructor(private accessToken: string, baseUrl?: string) {
    this.base = baseUrl ? baseUrl.replace(/\/$/, '') + '/api/v4' : GITLAB_API_BASE;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.base}${path}`;
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${this.accessToken}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 || res.status === 403) throw new GitLabAuthError(`gitlab ${method} ${path} unauthorized (${res.status})`);
    if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`gitlab ${method} ${path} failed: ${res.status} ${text}`); }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  async ping(): Promise<{ ok: boolean }> {
    try { await this.me(); return { ok: true }; }
    catch (err) { logger.warn('gitlab ping failed', { error: String(err) }); return { ok: false }; }
  }

  async me(): Promise<GitLabUser> { return this.request<GitLabUser>('GET', '/user'); }

  // ── Projects ──────────────────────────────────────────────────────────────
  async listMyProjects(opts: { perPage?: number; orderBy?: string; sort?: 'asc' | 'desc'; archived?: boolean } = {}): Promise<GitLabProject[]> {
    const params = new URLSearchParams();
    params.set('per_page', String(opts.perPage ?? 50));
    params.set('membership', 'true');
    if (opts.orderBy) params.set('order_by', opts.orderBy);
    if (opts.sort) params.set('sort', opts.sort);
    if (opts.archived !== undefined) params.set('archived', String(opts.archived));
    return this.request<GitLabProject[]>('GET', `/projects?${params.toString()}`);
  }

  async getProject(idOrPath: string | number): Promise<GitLabProject> {
    return this.request<GitLabProject>('GET', `/projects/${encodeURIComponent(String(idOrPath))}`);
  }

  // ── Issues ─────────────────────────────────────────────────────────────────
  async listProjectIssues(projectId: string | number, opts: { state?: 'opened' | 'closed' | 'all'; perPage?: number } = {}): Promise<GitLabIssue[]> {
    const params = new URLSearchParams();
    params.set('per_page', String(opts.perPage ?? 25));
    if (opts.state) params.set('state', opts.state);
    return this.request<GitLabIssue[]>('GET', `/projects/${encodeURIComponent(String(projectId))}/issues?${params.toString()}`);
  }

  async createIssue(projectId: string | number, payload: { title: string; description?: string; labels?: string[]; assigneeIds?: number[]; milestoneId?: number; confidential?: boolean }): Promise<GitLabIssue> {
    return this.request<GitLabIssue>('POST', `/projects/${encodeURIComponent(String(projectId))}/issues`, {
      title: payload.title,
      ...(payload.description ? { description: payload.description } : {}),
      ...(payload.labels?.length ? { labels: payload.labels.join(',') } : {}),
      ...(payload.assigneeIds?.length ? { assignee_ids: payload.assigneeIds } : {}),
      ...(payload.milestoneId ? { milestone_id: payload.milestoneId } : {}),
      ...(payload.confidential !== undefined ? { confidential: payload.confidential } : {}),
    });
  }

  async updateIssue(projectId: string | number, iid: number, patch: { state_event?: 'close' | 'reopen'; title?: string; description?: string; labels?: string[]; assignee_ids?: number[] }): Promise<GitLabIssue> {
    return this.request<GitLabIssue>('PUT', `/projects/${encodeURIComponent(String(projectId))}/issues/${iid}`, {
      ...patch,
      ...(patch.labels ? { labels: patch.labels.join(',') } : {}),
    });
  }

  async addIssueNote(projectId: string | number, iid: number, body: string): Promise<{ id: number; body: string; web_url?: string }> {
    return this.request('POST', `/projects/${encodeURIComponent(String(projectId))}/issues/${iid}/notes`, { body });
  }

  async searchIssues(scope: 'created_by_me' | 'assigned_to_me' | 'all', opts: { search?: string; state?: 'opened' | 'closed'; perPage?: number } = {}): Promise<GitLabIssue[]> {
    const params = new URLSearchParams();
    params.set('scope', scope);
    params.set('per_page', String(opts.perPage ?? 25));
    if (opts.search) params.set('search', opts.search);
    if (opts.state) params.set('state', opts.state);
    return this.request<GitLabIssue[]>('GET', `/issues?${params.toString()}`);
  }

  // ── Merge Requests ─────────────────────────────────────────────────────────
  async getMergeRequest(projectId: string | number, iid: number): Promise<GitLabMergeRequest> {
    return this.request('GET', `/projects/${encodeURIComponent(String(projectId))}/merge_requests/${iid}`);
  }

  async listProjectMergeRequests(projectId: string | number, opts: { state?: 'opened' | 'closed' | 'merged' | 'all'; perPage?: number } = {}): Promise<GitLabMergeRequest[]> {
    const params = new URLSearchParams();
    params.set('per_page', String(opts.perPage ?? 25));
    if (opts.state) params.set('state', opts.state);
    return this.request('GET', `/projects/${encodeURIComponent(String(projectId))}/merge_requests?${params.toString()}`);
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────
  async createProjectHook(projectId: string | number, opts: { url: string; token: string; events?: { push?: boolean; issues?: boolean; merge_requests?: boolean; notes?: boolean; pipelines?: boolean; tag_push?: boolean; releases?: boolean }; pushEventsBranchFilter?: string }): Promise<GitLabHook> {
    const ev = opts.events ?? { issues: true, merge_requests: true, notes: true, pipelines: true };
    return this.request<GitLabHook>('POST', `/projects/${encodeURIComponent(String(projectId))}/hooks`, {
      url: opts.url,
      token: opts.token,
      push_events: ev.push ?? false,
      issues_events: ev.issues ?? false,
      merge_requests_events: ev.merge_requests ?? false,
      note_events: ev.notes ?? false,
      pipeline_events: ev.pipelines ?? false,
      tag_push_events: ev.tag_push ?? false,
      releases_events: ev.releases ?? false,
      enable_ssl_verification: true,
      ...(opts.pushEventsBranchFilter ? { push_events_branch_filter: opts.pushEventsBranchFilter } : {}),
    });
  }

  async listProjectHooks(projectId: string | number): Promise<GitLabHook[]> {
    return this.request<GitLabHook[]>('GET', `/projects/${encodeURIComponent(String(projectId))}/hooks`);
  }

  async deleteProjectHook(projectId: string | number, hookId: number): Promise<void> {
    await this.request('DELETE', `/projects/${encodeURIComponent(String(projectId))}/hooks/${hookId}`);
  }
}
