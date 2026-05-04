/**
 * server/integrations/notion.ts
 *
 * Notion REST adapter. Coverage focused on what the AI agent's knowledge
 * pipeline needs:
 *   - Search (cross-workspace; filter by `page` or `database`)
 *   - Pages: retrieve, properties, archive, restore
 *   - Databases: retrieve, query (with filter + sort + cursor pagination)
 *   - Blocks: list children (recursively if needed for full-text crawl),
 *     append, update, delete
 *   - Users: list (for ownership attribution)
 *   - Comments: list / create (so agent can ask follow-ups in context)
 *
 * Auth: Bearer access_token + Notion-Version header.
 *
 * Pagination: `start_cursor` + `has_more`. We expose async iterators
 * to walk full result sets.
 *
 * Docs: https://developers.notion.com/reference/intro
 */

import { logger } from '../utils/logger.js';
import { NOTION_API_BASE, NOTION_API_VERSION } from './notion-oauth.js';

export interface NotionPage {
  id: string;
  object: 'page';
  parent: { type: 'database_id' | 'page_id' | 'workspace'; database_id?: string; page_id?: string };
  archived: boolean;
  in_trash?: boolean;
  url: string;
  public_url: string | null;
  created_time: string;
  last_edited_time: string;
  created_by: { id: string };
  last_edited_by: { id: string };
  properties: Record<string, any>;
  icon: any;
  cover: any;
}

export interface NotionDatabase {
  id: string;
  object: 'database';
  title: any[];
  description: any[];
  url: string;
  icon: any;
  cover: any;
  parent: any;
  created_time: string;
  last_edited_time: string;
  archived: boolean;
  is_inline: boolean;
  properties: Record<string, { id: string; name: string; type: string; [k: string]: any }>;
}

export class NotionAdapter {
  constructor(private readonly accessToken: string) {}

  private async req<T>(method: string, path: string, init?: { body?: unknown; query?: Record<string, string | number | boolean | undefined> }): Promise<T> {
    const url = path.startsWith('http')
      ? new URL(path)
      : new URL(`${NOTION_API_BASE}${path.startsWith('/') ? '' : '/'}${path}`);
    if (init?.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      'Notion-Version': NOTION_API_VERSION,
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
      let nErrors: any = null;
      let message = text;
      try {
        const j = JSON.parse(text);
        nErrors = j;
        message = j?.message ?? text;
      } catch { /* keep raw */ }
      const err: any = new Error(`notion ${method} ${path} ${res.status}: ${typeof message === 'string' ? message : JSON.stringify(message)}`);
      err.statusCode = res.status;
      err.notionError = nErrors;
      throw err;
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  // ── Identity / health ─────────────────────────────────────────────────────

  async whoAmI(): Promise<{ object: 'user'; id: string; type: 'bot'; bot: { workspace_name?: string; owner: any } }> {
    return this.req('GET', '/users/me');
  }

  async ping(): Promise<{ ok: boolean; statusCode?: number; me?: any }> {
    try {
      const m = await this.whoAmI();
      return { ok: true, me: m };
    } catch (err: any) {
      logger.warn('notion ping failed', { error: err?.message });
      return { ok: false, statusCode: err?.statusCode };
    }
  }

  // ── Search ────────────────────────────────────────────────────────────────

  /**
   * Cross-workspace search. With `filter.property=object value=database` you
   * limit to databases only, etc. Returns paginated cursor.
   */
  async search(opts?: {
    query?: string;
    filterObject?: 'page' | 'database';
    sort?: 'last_edited_time';
    sortDirection?: 'ascending' | 'descending';
    startCursor?: string;
    pageSize?: number;
  }): Promise<{ object: 'list'; results: any[]; next_cursor: string | null; has_more: boolean }> {
    return this.req('POST', '/search', {
      body: {
        query: opts?.query,
        filter: opts?.filterObject ? { property: 'object', value: opts.filterObject } : undefined,
        sort: opts?.sort ? { timestamp: opts.sort, direction: opts?.sortDirection ?? 'descending' } : undefined,
        start_cursor: opts?.startCursor,
        page_size: opts?.pageSize ?? 100,
      },
    });
  }

  /** Walk every result of `search` regardless of pagination. */
  async *searchAll(opts: Parameters<NotionAdapter['search']>[0]): AsyncGenerator<any[]> {
    let cursor: string | null | undefined = undefined;
    while (true) {
      const r = await this.search({ ...opts, startCursor: cursor ?? undefined });
      yield r.results;
      if (!r.has_more || !r.next_cursor) break;
      cursor = r.next_cursor;
    }
  }

  // ── Pages ─────────────────────────────────────────────────────────────────

  async getPage(id: string): Promise<NotionPage> {
    return this.req('GET', `/pages/${encodeURIComponent(id)}`);
  }

  async getPageProperty(pageId: string, propertyId: string): Promise<any> {
    return this.req('GET', `/pages/${encodeURIComponent(pageId)}/properties/${encodeURIComponent(propertyId)}`);
  }

  async createPage(payload: { parent: { database_id?: string; page_id?: string }; properties: Record<string, unknown>; children?: any[]; icon?: any; cover?: any }): Promise<NotionPage> {
    return this.req('POST', '/pages', { body: payload });
  }

  async updatePage(id: string, payload: { properties?: Record<string, unknown>; archived?: boolean; icon?: any; cover?: any; in_trash?: boolean }): Promise<NotionPage> {
    return this.req('PATCH', `/pages/${encodeURIComponent(id)}`, { body: payload });
  }

  // ── Databases ─────────────────────────────────────────────────────────────

  async getDatabase(id: string): Promise<NotionDatabase> {
    return this.req('GET', `/databases/${encodeURIComponent(id)}`);
  }

  async queryDatabase<T = any>(id: string, opts?: { filter?: any; sorts?: any[]; startCursor?: string; pageSize?: number; filterProperties?: string[] }): Promise<{ object: 'list'; results: T[]; next_cursor: string | null; has_more: boolean }> {
    const url = new URL(`${NOTION_API_BASE}/databases/${encodeURIComponent(id)}/query`);
    if (opts?.filterProperties?.length) {
      for (const p of opts.filterProperties) url.searchParams.append('filter_properties', p);
    }
    return this.req('POST', url.toString(), {
      body: {
        filter: opts?.filter,
        sorts: opts?.sorts,
        start_cursor: opts?.startCursor,
        page_size: opts?.pageSize ?? 100,
      },
    });
  }

  async *queryDatabaseAll<T = any>(id: string, opts?: Parameters<NotionAdapter['queryDatabase']>[1]): AsyncGenerator<T[]> {
    let cursor: string | null | undefined = undefined;
    while (true) {
      const r = await this.queryDatabase<T>(id, { ...opts, startCursor: cursor ?? undefined });
      yield r.results;
      if (!r.has_more || !r.next_cursor) break;
      cursor = r.next_cursor;
    }
  }

  // ── Blocks ────────────────────────────────────────────────────────────────

  async listBlockChildren(blockId: string, opts?: { startCursor?: string; pageSize?: number }): Promise<{ object: 'list'; results: any[]; next_cursor: string | null; has_more: boolean }> {
    return this.req('GET', `/blocks/${encodeURIComponent(blockId)}/children`, {
      query: { start_cursor: opts?.startCursor, page_size: opts?.pageSize ?? 100 },
    });
  }

  /** Walk all blocks in a page (single-level, NOT recursive into children). */
  async *listAllBlockChildren(blockId: string, pageSize = 100): AsyncGenerator<any[]> {
    let cursor: string | null | undefined = undefined;
    while (true) {
      const r = await this.listBlockChildren(blockId, { startCursor: cursor ?? undefined, pageSize });
      yield r.results;
      if (!r.has_more || !r.next_cursor) break;
      cursor = r.next_cursor;
    }
  }

  async appendBlockChildren(blockId: string, children: any[], after?: string): Promise<{ object: 'list'; results: any[] }> {
    return this.req('PATCH', `/blocks/${encodeURIComponent(blockId)}/children`, { body: { children, after } });
  }

  async updateBlock(blockId: string, payload: any): Promise<any> {
    return this.req('PATCH', `/blocks/${encodeURIComponent(blockId)}`, { body: payload });
  }

  async deleteBlock(blockId: string): Promise<void> {
    await this.req('DELETE', `/blocks/${encodeURIComponent(blockId)}`);
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  async listUsers(opts?: { startCursor?: string; pageSize?: number }): Promise<{ results: any[]; next_cursor: string | null; has_more: boolean }> {
    return this.req('GET', '/users', { query: { start_cursor: opts?.startCursor, page_size: opts?.pageSize ?? 100 } });
  }

  async getUser(id: string): Promise<any> {
    return this.req('GET', `/users/${encodeURIComponent(id)}`);
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  async listComments(blockId: string, opts?: { startCursor?: string; pageSize?: number }): Promise<{ results: any[]; next_cursor: string | null; has_more: boolean }> {
    return this.req('GET', '/comments', { query: { block_id: blockId, start_cursor: opts?.startCursor, page_size: opts?.pageSize } });
  }

  async createComment(payload: { parent?: { page_id: string }; discussion_id?: string; rich_text: any[] }): Promise<any> {
    return this.req('POST', '/comments', { body: payload });
  }

  // ── Helpers for the AI knowledge pipeline ────────────────────────────────

  /**
   * Materialise a page's full content as plain text by walking blocks.
   * Returns concatenated text suitable for chunking + embedding.
   * Skips images/files/embeds — text-only.
   */
  async pageToPlainText(pageId: string, maxBlocks = 1000): Promise<string> {
    const buf: string[] = [];
    let count = 0;
    for await (const blocks of this.listAllBlockChildren(pageId)) {
      for (const block of blocks) {
        if (++count > maxBlocks) return buf.join('\n');
        const rt = (block as any)[block.type]?.rich_text;
        if (Array.isArray(rt)) {
          buf.push(rt.map((t: any) => t.plain_text ?? '').join(''));
        }
      }
    }
    return buf.join('\n');
  }
}
