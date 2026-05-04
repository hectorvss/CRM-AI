/**
 * server/integrations/sentry.ts
 *
 * Sentry REST API adapter (api/0).
 */

import { SENTRY_API_BASE } from './sentry-oauth.js';
import { logger } from '../utils/logger.js';

export class SentryAuthError extends Error { constructor(m: string) { super(m); this.name = 'SentryAuthError'; } }

export interface SentryProject { id: string; slug: string; name: string; platform?: string; organization?: { slug: string; name: string } }
export interface SentryIssue { id: string; shortId: string; title: string; culprit: string; level: string; status: 'unresolved' | 'resolved' | 'ignored'; permalink: string; firstSeen: string; lastSeen: string; count: string; userCount: number; project: { id: string; slug: string; name: string }; metadata?: any }

export class SentryAdapter {
  constructor(private accessToken: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = path.startsWith('http') ? path : `${SENTRY_API_BASE}${path}`;
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${this.accessToken}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 || res.status === 403) throw new SentryAuthError(`sentry ${method} ${path} unauthorized (${res.status})`);
    if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`sentry ${method} ${path} failed: ${res.status} ${text}`); }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  async ping(): Promise<{ ok: boolean }> {
    try { await this.request('GET', '/organizations/'); return { ok: true }; }
    catch (err) { logger.warn('sentry ping failed', { error: String(err) }); return { ok: false }; }
  }

  async listOrganizations(): Promise<Array<{ id: string; slug: string; name: string }>> {
    return this.request('GET', '/organizations/');
  }

  async listProjects(orgSlug: string): Promise<SentryProject[]> {
    return this.request('GET', `/organizations/${encodeURIComponent(orgSlug)}/projects/`);
  }

  // ── Issues ─────────────────────────────────────────────────────────────────
  async listIssues(orgSlug: string, opts: { project?: string; query?: string; statsPeriod?: string; limit?: number } = {}): Promise<SentryIssue[]> {
    const params = new URLSearchParams();
    params.set('limit', String(opts.limit ?? 25));
    if (opts.project) params.set('project', opts.project);
    if (opts.query) params.set('query', opts.query);
    if (opts.statsPeriod) params.set('statsPeriod', opts.statsPeriod);
    return this.request('GET', `/organizations/${encodeURIComponent(orgSlug)}/issues/?${params.toString()}`);
  }

  async getIssue(issueId: string): Promise<SentryIssue> {
    return this.request<SentryIssue>('GET', `/issues/${encodeURIComponent(issueId)}/`);
  }

  async updateIssue(issueId: string, patch: { status?: 'resolved' | 'unresolved' | 'ignored'; assignedTo?: string; isBookmarked?: boolean }): Promise<SentryIssue> {
    return this.request('PUT', `/issues/${encodeURIComponent(issueId)}/`, patch);
  }

  async listIssueEvents(issueId: string, limit = 25): Promise<any[]> {
    return this.request('GET', `/issues/${encodeURIComponent(issueId)}/events/?limit=${limit}`);
  }

  async resolveIssue(issueId: string): Promise<SentryIssue> { return this.updateIssue(issueId, { status: 'resolved' }); }

  async addIssueComment(issueId: string, text: string): Promise<{ id: string }> {
    return this.request('POST', `/issues/${encodeURIComponent(issueId)}/comments/`, { data: { text } });
  }
}
