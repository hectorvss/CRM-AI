/**
 * server/integrations/confluence.ts
 *
 * Confluence Cloud REST API v2 adapter, scoped to a single cloudid.
 * API base: `https://api.atlassian.com/ex/confluence/{cloudid}/wiki/api/v2/`
 *
 * Used primarily for **knowledge ingestion**: list spaces → list pages →
 * fetch page bodies in `storage` or `view` representation, feed to RAG.
 */

import { logger } from '../utils/logger.js';

export class ConfluenceAuthError extends Error {
  constructor(message: string) { super(message); this.name = 'ConfluenceAuthError'; }
}

export interface ConfluenceSpace {
  id: string;
  key: string;
  name: string;
  type?: string;
  status?: string;
}

export interface ConfluencePage {
  id: string;
  title: string;
  status: string;
  spaceId: string;
  parentId?: string | null;
  authorId?: string;
  createdAt?: string;
  version?: { number: number; createdAt?: string };
  body?: { storage?: { value: string; representation: string }; atlas_doc_format?: any };
  _links?: { webui?: string };
}

export class ConfluenceAdapter {
  private base: string;
  constructor(private accessToken: string, public cloudId: string) {
    this.base = `https://api.atlassian.com/ex/confluence/${encodeURIComponent(cloudId)}/wiki/api/v2`;
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
      throw new ConfluenceAuthError(`confluence ${method} ${path} unauthorized (${res.status})`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`confluence ${method} ${path} failed: ${res.status} ${text}`);
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  // ── Identity / health ──────────────────────────────────────────────────────
  /** Confluence v2 doesn't have a /myself; use the v1 fallback under /wiki/rest/api/user/current */
  async myself(): Promise<{ accountId: string; displayName: string; email?: string }> {
    const url = `https://api.atlassian.com/ex/confluence/${encodeURIComponent(this.cloudId)}/wiki/rest/api/user/current`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}`, Accept: 'application/json' },
    });
    if (res.status === 401 || res.status === 403) throw new ConfluenceAuthError(`confluence /user/current ${res.status}`);
    if (!res.ok) throw new Error(`confluence /user/current ${res.status}`);
    const j = await res.json() as any;
    return { accountId: j.accountId, displayName: j.displayName, email: j.email };
  }
  async ping(): Promise<{ ok: boolean }> {
    try { await this.myself(); return { ok: true }; }
    catch (err) { logger.warn('confluence ping failed', { error: String(err) }); return { ok: false }; }
  }

  // ── Spaces ─────────────────────────────────────────────────────────────────
  async listSpaces(opts: { limit?: number; cursor?: string } = {}): Promise<{ spaces: ConfluenceSpace[]; nextCursor: string | null }> {
    const params = new URLSearchParams();
    params.set('limit', String(opts.limit ?? 100));
    if (opts.cursor) params.set('cursor', opts.cursor);
    const r = await this.request<any>('GET', `/spaces?${params.toString()}`);
    return {
      spaces: r?.results ?? [],
      nextCursor: r?._links?.next ? new URL(r._links.next, 'https://x').searchParams.get('cursor') : null,
    };
  }

  // ── Pages ──────────────────────────────────────────────────────────────────
  async listPages(opts: { spaceId?: string; limit?: number; cursor?: string; bodyFormat?: 'storage' | 'view' | 'none' } = {}): Promise<{ pages: ConfluencePage[]; nextCursor: string | null }> {
    const params = new URLSearchParams();
    params.set('limit', String(opts.limit ?? 50));
    if (opts.cursor) params.set('cursor', opts.cursor);
    if (opts.bodyFormat && opts.bodyFormat !== 'none') params.set('body-format', opts.bodyFormat);
    const path = opts.spaceId
      ? `/spaces/${encodeURIComponent(opts.spaceId)}/pages?${params.toString()}`
      : `/pages?${params.toString()}`;
    const r = await this.request<any>('GET', path);
    return {
      pages: r?.results ?? [],
      nextCursor: r?._links?.next ? new URL(r._links.next, 'https://x').searchParams.get('cursor') : null,
    };
  }
  async getPage(pageId: string, bodyFormat: 'storage' | 'view' | 'atlas_doc_format' = 'storage'): Promise<ConfluencePage> {
    return this.request<ConfluencePage>('GET', `/pages/${encodeURIComponent(pageId)}?body-format=${bodyFormat}`);
  }

  // ── Search (CQL) ───────────────────────────────────────────────────────────
  async search(cql: string, limit = 25): Promise<any> {
    const url = `https://api.atlassian.com/ex/confluence/${encodeURIComponent(this.cloudId)}/wiki/rest/api/search?cql=${encodeURIComponent(cql)}&limit=${limit}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}`, Accept: 'application/json' },
    });
    if (res.status === 401 || res.status === 403) throw new ConfluenceAuthError(`confluence search ${res.status}`);
    if (!res.ok) throw new Error(`confluence search ${res.status}`);
    return res.json();
  }
}
