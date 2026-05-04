/**
 * server/integrations/slack.ts
 *
 * Slack Web API adapter. Coverage focused on what the AI agent + inbox
 * pipeline actually needs:
 *   - chat.postMessage / chat.update / chat.delete / chat.postEphemeral
 *   - conversations.list / .info / .history / .replies / .members
 *   - conversations.open (DMs) / .join / .invite
 *   - users.list / .info / .lookupByEmail
 *   - reactions.add / reactions.remove
 *   - files.upload (multipart, used for screenshot/log attachments)
 *   - team.info (workspace metadata)
 *   - auth.test (token health check)
 *   - views.open / views.publish (Block Kit modals + Home tab)
 *
 * Auth: Bearer xoxb-<token>. Slack API responses always include `ok`.
 * Errors are returned in the body, not via HTTP status — we surface
 * `ok=false` as thrown errors with the Slack `error` code attached.
 *
 * Docs: https://api.slack.com/methods
 */

import { logger } from '../utils/logger.js';

const BASE = 'https://slack.com/api';

export interface SlackUser {
  id: string;
  team_id: string;
  name: string;
  real_name: string | null;
  profile: {
    email?: string;
    display_name?: string;
    image_72?: string;
    title?: string;
    phone?: string;
  };
  is_bot: boolean;
  is_admin?: boolean;
  is_owner?: boolean;
  deleted?: boolean;
  tz?: string;
}

export interface SlackChannel {
  id: string;
  name: string;
  is_channel: boolean;
  is_group: boolean;
  is_im: boolean;
  is_private?: boolean;
  is_archived?: boolean;
  is_member?: boolean;
  num_members?: number;
  topic?: { value: string };
  purpose?: { value: string };
}

export interface SlackMessage {
  ts: string;
  type: string;
  subtype?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  blocks?: any[];
  attachments?: any[];
  thread_ts?: string;
  reply_count?: number;
  reactions?: Array<{ name: string; users: string[]; count: number }>;
  files?: any[];
}

export class SlackAdapter {
  constructor(private readonly accessToken: string) {}

  private async req<T>(method: string, params?: Record<string, unknown>, opts?: { form?: boolean }): Promise<T> {
    const url = `${BASE}/${method}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
    };

    let body: BodyInit | undefined;
    let fetchUrl = url;

    // Slack methods accept either form-encoded or JSON. We use JSON for
    // POST writes, form for GETs/reads. `form=true` forces form encoding
    // (required for some legacy methods).
    const isWrite = !!params && Object.keys(params).length > 0;
    if (isWrite && !opts?.form) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
      body = JSON.stringify(params);
    } else if (params) {
      const usp = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue;
        usp.set(k, typeof v === 'string' ? v : JSON.stringify(v));
      }
      const qs = usp.toString();
      // For reads we use GET with query string; for writes when form-encoding
      // is forced we POST with body.
      if (opts?.form) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        body = qs;
      } else {
        fetchUrl = `${url}?${qs}`;
      }
    }

    const res = await fetch(fetchUrl, {
      method: body ? 'POST' : 'GET',
      headers,
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err: any = new Error(`slack ${method} HTTP ${res.status}: ${text.slice(0, 240)}`);
      err.statusCode = res.status;
      throw err;
    }
    const data = (await res.json()) as any;
    if (data?.ok === false) {
      const err: any = new Error(`slack ${method} returned ok=false: ${data.error ?? 'unknown'}`);
      err.slackError = data.error;
      err.slackResponse = data;
      throw err;
    }
    return data as T;
  }

  // ── Auth / health ────────────────────────────────────────────────────

  async authTest(): Promise<{ url: string; team: string; user: string; team_id: string; user_id: string; bot_id?: string }> {
    return this.req('auth.test');
  }

  async ping(): Promise<{ ok: boolean }> {
    try {
      await this.authTest();
      return { ok: true };
    } catch (err: any) {
      logger.warn('slack ping failed', { error: err?.message });
      return { ok: false };
    }
  }

  // ── Chat ─────────────────────────────────────────────────────────────

  async postMessage(payload: {
    channel: string;
    text?: string;
    blocks?: any[];
    attachments?: any[];
    thread_ts?: string;
    reply_broadcast?: boolean;
    unfurl_links?: boolean;
    unfurl_media?: boolean;
    icon_emoji?: string;
    icon_url?: string;
    username?: string;
    metadata?: { event_type: string; event_payload: Record<string, unknown> };
  }): Promise<{ channel: string; ts: string; message: SlackMessage }> {
    return this.req('chat.postMessage', payload);
  }

  async postEphemeral(payload: {
    channel: string;
    user: string;
    text?: string;
    blocks?: any[];
    thread_ts?: string;
  }): Promise<{ message_ts: string }> {
    return this.req('chat.postEphemeral', payload);
  }

  async updateMessage(payload: { channel: string; ts: string; text?: string; blocks?: any[]; attachments?: any[] }): Promise<any> {
    return this.req('chat.update', payload);
  }

  async deleteMessage(channel: string, ts: string): Promise<any> {
    return this.req('chat.delete', { channel, ts });
  }

  async scheduleMessage(payload: { channel: string; post_at: number; text?: string; blocks?: any[]; thread_ts?: string }): Promise<{ scheduled_message_id: string; channel: string; post_at: number }> {
    return this.req('chat.scheduleMessage', payload);
  }

  async getPermalink(channel: string, message_ts: string): Promise<{ permalink: string }> {
    return this.req('chat.getPermalink', { channel, message_ts });
  }

  // ── Conversations ────────────────────────────────────────────────────

  async listChannels(opts?: {
    types?: 'public_channel' | 'private_channel' | 'mpim' | 'im' | string;
    excludeArchived?: boolean;
    cursor?: string;
    limit?: number;
  }): Promise<{ channels: SlackChannel[]; response_metadata?: { next_cursor?: string } }> {
    return this.req('conversations.list', {
      types: opts?.types ?? 'public_channel,private_channel',
      exclude_archived: opts?.excludeArchived ?? true,
      cursor: opts?.cursor,
      limit: opts?.limit ?? 200,
    });
  }

  async channelInfo(channel: string, includeNumMembers = true): Promise<{ channel: SlackChannel }> {
    return this.req('conversations.info', { channel, include_num_members: includeNumMembers });
  }

  async channelHistory(channel: string, opts?: { cursor?: string; limit?: number; oldest?: string; latest?: string; inclusive?: boolean }): Promise<{ messages: SlackMessage[]; has_more: boolean; response_metadata?: { next_cursor?: string } }> {
    return this.req('conversations.history', {
      channel,
      cursor: opts?.cursor,
      limit: opts?.limit ?? 100,
      oldest: opts?.oldest,
      latest: opts?.latest,
      inclusive: opts?.inclusive,
    });
  }

  async threadReplies(channel: string, ts: string, opts?: { cursor?: string; limit?: number }): Promise<{ messages: SlackMessage[]; has_more: boolean; response_metadata?: { next_cursor?: string } }> {
    return this.req('conversations.replies', {
      channel, ts,
      cursor: opts?.cursor,
      limit: opts?.limit ?? 100,
    });
  }

  async openConversation(users: string[]): Promise<{ channel: { id: string } }> {
    return this.req('conversations.open', { users: users.join(',') });
  }

  async joinChannel(channel: string): Promise<any> {
    return this.req('conversations.join', { channel });
  }

  async inviteToChannel(channel: string, users: string[]): Promise<any> {
    return this.req('conversations.invite', { channel, users: users.join(',') });
  }

  async channelMembers(channel: string, opts?: { cursor?: string; limit?: number }): Promise<{ members: string[]; response_metadata?: { next_cursor?: string } }> {
    return this.req('conversations.members', { channel, cursor: opts?.cursor, limit: opts?.limit ?? 200 });
  }

  // ── Users ────────────────────────────────────────────────────────────

  async listUsers(opts?: { cursor?: string; limit?: number; includeLocale?: boolean }): Promise<{ members: SlackUser[]; response_metadata?: { next_cursor?: string } }> {
    return this.req('users.list', {
      cursor: opts?.cursor,
      limit: opts?.limit ?? 200,
      include_locale: opts?.includeLocale,
    });
  }

  async userInfo(user: string, includeLocale = false): Promise<{ user: SlackUser }> {
    return this.req('users.info', { user, include_locale: includeLocale });
  }

  async lookupUserByEmail(email: string): Promise<{ user: SlackUser }> {
    return this.req('users.lookupByEmail', { email });
  }

  // ── Reactions ────────────────────────────────────────────────────────

  async addReaction(channel: string, ts: string, name: string): Promise<any> {
    return this.req('reactions.add', { channel, timestamp: ts, name });
  }

  async removeReaction(channel: string, ts: string, name: string): Promise<any> {
    return this.req('reactions.remove', { channel, timestamp: ts, name });
  }

  // ── Files ────────────────────────────────────────────────────────────

  /**
   * Upload a small file using files.upload (form-encoded). For large files
   * Slack now recommends getUploadURLExternal + completeUploadExternal —
   * exposed below as `getUploadUrl` + `completeUpload`.
   */
  async uploadFile(payload: {
    channels?: string;
    content?: string;
    filename?: string;
    filetype?: string;
    title?: string;
    initialComment?: string;
    threadTs?: string;
  }): Promise<{ file: any }> {
    return this.req('files.upload', {
      channels: payload.channels,
      content: payload.content,
      filename: payload.filename,
      filetype: payload.filetype,
      title: payload.title,
      initial_comment: payload.initialComment,
      thread_ts: payload.threadTs,
    }, { form: true });
  }

  async getUploadUrl(filename: string, length: number): Promise<{ upload_url: string; file_id: string }> {
    return this.req('files.getUploadURLExternal', { filename, length }, { form: true });
  }

  async completeUpload(files: Array<{ id: string; title?: string }>, channelId?: string, initialComment?: string, threadTs?: string): Promise<any> {
    return this.req('files.completeUploadExternal', {
      files,
      channel_id: channelId,
      initial_comment: initialComment,
      thread_ts: threadTs,
    });
  }

  // ── Team ─────────────────────────────────────────────────────────────

  async teamInfo(): Promise<{ team: { id: string; name: string; domain: string; icon?: any; email_domain?: string } }> {
    return this.req('team.info');
  }

  // ── Block Kit views (modals + home tab) ──────────────────────────────

  async openView(triggerId: string, view: any): Promise<{ view: any }> {
    return this.req('views.open', { trigger_id: triggerId, view });
  }

  async publishHome(userId: string, view: any): Promise<{ view: any }> {
    return this.req('views.publish', { user_id: userId, view });
  }

  async pushView(triggerId: string, view: any): Promise<{ view: any }> {
    return this.req('views.push', { trigger_id: triggerId, view });
  }

  async updateView(viewId: string, view: any, hash?: string): Promise<{ view: any }> {
    return this.req('views.update', { view_id: viewId, view, hash });
  }
}
