/**
 * server/integrations/github.ts
 *
 * GitHub REST API v3 adapter (api.github.com).
 *
 * Used for:
 *  - Identity (`/user`, `/user/orgs`, `/user/repos`)
 *  - Issues CRUD (escalation desde inbox)
 *  - Pull request lookup
 *  - Webhook registration on repos
 */

import { GITHUB_API_BASE } from './github-oauth.js';
import { logger } from '../utils/logger.js';

export class GitHubAuthError extends Error {
  constructor(message: string) { super(message); this.name = 'GitHubAuthError'; }
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
  type: string;
}

export interface GitHubRepo {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  private: boolean;
  owner: { login: string; id: number; type: string };
  html_url: string;
  description: string | null;
  default_branch: string;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  html_url: string;
  user: { login: string; id: number };
  assignees: { login: string }[];
  labels: { name: string }[];
  created_at: string;
  updated_at: string;
}

export interface GitHubWebhook {
  id: number;
  type: string;
  name: string;
  active: boolean;
  events: string[];
  config: { url?: string; content_type?: string };
  created_at: string;
}

const USER_AGENT = 'Clain-CRM-AI/1.0';

export class GitHubAdapter {
  constructor(private accessToken: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = path.startsWith('http') ? path : `${GITHUB_API_BASE}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': USER_AGENT,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 || res.status === 403) {
      throw new GitHubAuthError(`github ${method} ${path} unauthorized (${res.status})`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`github ${method} ${path} failed: ${res.status} ${text}`);
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  // ── Identity / health ──────────────────────────────────────────────────────
  async me(): Promise<GitHubUser> { return this.request<GitHubUser>('GET', '/user'); }
  async myEmails(): Promise<{ email: string; primary: boolean; verified: boolean }[]> {
    return this.request('GET', '/user/emails');
  }
  async myOrgs(): Promise<{ login: string; id: number; description?: string }[]> {
    return this.request('GET', '/user/orgs');
  }
  async ping(): Promise<{ ok: boolean }> {
    try { await this.me(); return { ok: true }; }
    catch (err) { logger.warn('github ping failed', { error: String(err) }); return { ok: false }; }
  }

  // ── Repos ──────────────────────────────────────────────────────────────────
  async listMyRepos(opts: { perPage?: number; sort?: 'created' | 'updated' | 'pushed' | 'full_name' } = {}): Promise<GitHubRepo[]> {
    const params = new URLSearchParams();
    params.set('per_page', String(opts.perPage ?? 50));
    if (opts.sort) params.set('sort', opts.sort);
    return this.request<GitHubRepo[]>('GET', `/user/repos?${params.toString()}`);
  }
  async getRepo(owner: string, repo: string): Promise<GitHubRepo> {
    return this.request<GitHubRepo>('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  }

  // ── Issues ─────────────────────────────────────────────────────────────────
  async listIssues(owner: string, repo: string, opts: { state?: 'open' | 'closed' | 'all'; perPage?: number } = {}): Promise<GitHubIssue[]> {
    const params = new URLSearchParams();
    params.set('state', opts.state ?? 'open');
    params.set('per_page', String(opts.perPage ?? 25));
    // Filter out PRs from issue list
    const items = await this.request<GitHubIssue[]>('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?${params.toString()}`);
    return items.filter((i: any) => !i.pull_request);
  }
  async getIssue(owner: string, repo: string, number: number): Promise<GitHubIssue> {
    return this.request<GitHubIssue>('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}`);
  }
  async createIssue(owner: string, repo: string, payload: {
    title: string; body?: string; assignees?: string[]; labels?: string[]; milestone?: number;
  }): Promise<GitHubIssue> {
    return this.request('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`, payload);
  }
  async updateIssue(owner: string, repo: string, number: number, payload: {
    title?: string; body?: string; state?: 'open' | 'closed'; state_reason?: 'completed' | 'not_planned' | 'reopened';
    assignees?: string[]; labels?: string[];
  }): Promise<GitHubIssue> {
    return this.request('PATCH', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}`, payload);
  }
  async addIssueComment(owner: string, repo: string, number: number, body: string): Promise<{ id: number; html_url: string }> {
    return this.request('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}/comments`, { body });
  }

  // ── Search ─────────────────────────────────────────────────────────────────
  async searchIssues(q: string, perPage = 25): Promise<{ total_count: number; items: GitHubIssue[] }> {
    return this.request('GET', `/search/issues?q=${encodeURIComponent(q)}&per_page=${perPage}`);
  }

  // ── Pulls ──────────────────────────────────────────────────────────────────
  async getPull(owner: string, repo: string, number: number): Promise<any> {
    return this.request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`);
  }

  // ── Webhooks (per-repo) ────────────────────────────────────────────────────
  async createRepoWebhook(owner: string, repo: string, opts: {
    callbackUrl: string; secret: string; events: string[];
  }): Promise<GitHubWebhook> {
    return this.request('POST', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks`, {
      name: 'web',
      active: true,
      events: opts.events,
      config: {
        url: opts.callbackUrl,
        content_type: 'json',
        secret: opts.secret,
        insecure_ssl: '0',
      },
    });
  }
  async listRepoWebhooks(owner: string, repo: string): Promise<GitHubWebhook[]> {
    return this.request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks`);
  }
  async deleteRepoWebhook(owner: string, repo: string, hookId: number): Promise<void> {
    await this.request('DELETE', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks/${hookId}`);
  }

  // ── Webhooks (per-org) ─────────────────────────────────────────────────────
  async createOrgWebhook(org: string, opts: {
    callbackUrl: string; secret: string; events: string[];
  }): Promise<GitHubWebhook> {
    return this.request('POST', `/orgs/${encodeURIComponent(org)}/hooks`, {
      name: 'web',
      active: true,
      events: opts.events,
      config: {
        url: opts.callbackUrl,
        content_type: 'json',
        secret: opts.secret,
        insecure_ssl: '0',
      },
    });
  }
  async deleteOrgWebhook(org: string, hookId: number): Promise<void> {
    await this.request('DELETE', `/orgs/${encodeURIComponent(org)}/hooks/${hookId}`);
  }
}
