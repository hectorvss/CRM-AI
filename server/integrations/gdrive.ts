/**
 * server/integrations/gdrive.ts
 *
 * Google Drive v3 adapter (read-only).
 * Base: https://www.googleapis.com/drive/v3/
 *
 * Used for knowledge ingestion: list files → fetch content → feed RAG.
 * Push notifications via `files.watch` mirror Calendar's pattern (channel + token + expiration).
 */

import { logger } from '../utils/logger.js';

const BASE = 'https://www.googleapis.com/drive/v3';

export class GoogleAuthError extends Error {
  constructor(message: string) { super(message); this.name = 'GoogleAuthError'; }
}

export interface GDriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  parents?: string[];
  owners?: { emailAddress: string; displayName: string }[];
}

export class GDriveAdapter {
  constructor(private accessToken: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = path.startsWith('http') ? path : `${BASE}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 || res.status === 403) throw new GoogleAuthError(`gdrive ${method} ${path} unauthorized (${res.status})`);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`gdrive ${method} ${path} failed: ${res.status} ${text}`);
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  async ping(): Promise<{ ok: boolean }> {
    try { await this.about(); return { ok: true }; }
    catch (err) { logger.warn('gdrive ping failed', { error: String(err) }); return { ok: false }; }
  }

  async about(): Promise<{ user: { displayName: string; emailAddress: string }; storageQuota?: any }> {
    return this.request('GET', '/about?fields=user(displayName,emailAddress),storageQuota');
  }

  async listFiles(opts: { q?: string; pageSize?: number; pageToken?: string; fields?: string; orderBy?: string } = {}): Promise<{ files: GDriveFile[]; nextPageToken?: string }> {
    const params = new URLSearchParams();
    params.set('pageSize', String(opts.pageSize ?? 50));
    params.set('fields', opts.fields ?? 'nextPageToken, files(id,name,mimeType,modifiedTime,size,webViewLink,parents,owners(emailAddress,displayName))');
    if (opts.q) params.set('q', opts.q);
    if (opts.pageToken) params.set('pageToken', opts.pageToken);
    if (opts.orderBy) params.set('orderBy', opts.orderBy);
    return this.request('GET', `/files?${params.toString()}`);
  }

  async getFile(fileId: string, fields = 'id,name,mimeType,modifiedTime,size,webViewLink,parents'): Promise<GDriveFile> {
    return this.request('GET', `/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}`);
  }

  /** Download raw content (for non-Google native files). */
  async downloadFile(fileId: string): Promise<{ buffer: ArrayBuffer; contentType: string | null }> {
    const url = `${BASE}/files/${encodeURIComponent(fileId)}?alt=media`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
    if (res.status === 401 || res.status === 403) throw new GoogleAuthError(`gdrive download unauthorized`);
    if (!res.ok) throw new Error(`gdrive download failed: ${res.status}`);
    return { buffer: await res.arrayBuffer(), contentType: res.headers.get('content-type') };
  }

  /** Export Google Docs/Sheets/Slides to a target mime type (e.g. text/plain, application/pdf). */
  async exportFile(fileId: string, mimeType: string): Promise<{ buffer: ArrayBuffer; contentType: string | null }> {
    const url = `${BASE}/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(mimeType)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
    if (res.status === 401 || res.status === 403) throw new GoogleAuthError(`gdrive export unauthorized`);
    if (!res.ok) throw new Error(`gdrive export failed: ${res.status}`);
    return { buffer: await res.arrayBuffer(), contentType: res.headers.get('content-type') };
  }

  /** Watch the **changes** feed for the user's drive (gives a startPageToken). */
  async getStartPageToken(): Promise<{ startPageToken: string }> {
    return this.request('GET', '/changes/startPageToken');
  }
  async watchChanges(opts: { pageToken: string; channelId: string; address: string; token?: string; ttlSeconds?: number }): Promise<{ id: string; resourceId: string; expiration: string }> {
    return this.request('POST', `/changes/watch?pageToken=${encodeURIComponent(opts.pageToken)}`, {
      id: opts.channelId,
      type: 'web_hook',
      address: opts.address,
      token: opts.token,
      params: opts.ttlSeconds ? { ttl: String(opts.ttlSeconds) } : undefined,
    });
  }
  async stopChannel(channelId: string, resourceId: string): Promise<void> {
    await this.request('POST', '/channels/stop', { id: channelId, resourceId });
  }
}
