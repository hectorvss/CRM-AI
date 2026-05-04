/**
 * server/integrations/telegram.ts
 *
 * Telegram Bot API adapter. Simplest of the messaging integrations:
 *  - Auth: a single bot token from @BotFather (no scopes, no OAuth).
 *  - Webhook: we set our URL via `setWebhook` with a `secret_token` that
 *    Telegram echoes back as `X-Telegram-Bot-Api-Secret-Token` header on
 *    every delivery. We use that as the auth check (HMAC-grade because
 *    it's a fixed shared secret on a TLS channel).
 *
 * Surface:
 *  - sendMessage / sendPhoto / sendVideo / sendDocument / sendAudio
 *  - editMessageText / deleteMessage
 *  - sendChatAction (typing, upload_photo, ...)
 *  - getMe / getMyCommands / setMyCommands (bot identity + slash commands)
 *  - answerCallbackQuery (inline-keyboard responses)
 *  - getFile + download
 *  - setWebhook / deleteWebhook / getWebhookInfo
 *
 * Docs: https://core.telegram.org/bots/api
 */

const API_BASE = 'https://api.telegram.org';

export interface TelegramCreds {
  botToken: string;            // 123456:ABC-...
  /** Shared secret echoed by Telegram on each webhook delivery. */
  webhookSecretToken?: string;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: { id: number; type: string; title?: string; username?: string; first_name?: string; last_name?: string };
  from?: { id: number; is_bot: boolean; first_name?: string; last_name?: string; username?: string; language_code?: string };
  text?: string;
  caption?: string;
  photo?: Array<{ file_id: string; file_unique_id: string; width: number; height: number; file_size?: number }>;
  document?: { file_id: string; file_unique_id: string; file_name?: string; mime_type?: string; file_size?: number };
  video?: { file_id: string; file_unique_id: string; duration: number; mime_type?: string; file_size?: number };
  voice?: { file_id: string; file_unique_id: string; duration: number; mime_type?: string };
  sticker?: { file_id: string };
  reply_to_message?: TelegramMessage;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string; username?: string };
    data?: string;
    message?: TelegramMessage;
  };
}

export class TelegramAdapter {
  constructor(private readonly creds: TelegramCreds) {}

  private async req<T>(method: string, payload?: unknown): Promise<T> {
    const url = `${API_BASE}/bot${this.creds.botToken}/${method}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    let body: BodyInit | undefined;
    if (payload !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(payload);
    }
    const res = await fetch(url, { method: payload === undefined ? 'GET' : 'POST', headers, body });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let message = text;
      try {
        const j = JSON.parse(text);
        message = j?.description ?? text;
      } catch { /* keep raw */ }
      const err: any = new Error(`Telegram ${method} ${res.status}: ${message}`);
      err.statusCode = res.status;
      err.telegramRaw = text;
      throw err;
    }
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string; error_code?: number };
    if (!json.ok) {
      const err: any = new Error(`Telegram ${method}: ${json.description ?? 'unknown error'}`);
      err.telegramErrorCode = json.error_code;
      throw err;
    }
    return json.result as T;
  }

  // ── Bot identity ───────────────────────────────────────────────────────

  async getMe(): Promise<{ id: number; is_bot: boolean; first_name: string; username: string; can_join_groups?: boolean; can_read_all_group_messages?: boolean; supports_inline_queries?: boolean }> {
    return this.req('getMe');
  }

  async getMyCommands(): Promise<Array<{ command: string; description: string }>> {
    return this.req('getMyCommands');
  }

  async setMyCommands(commands: Array<{ command: string; description: string }>): Promise<boolean> {
    return this.req('setMyCommands', { commands });
  }

  // ── Sending messages ───────────────────────────────────────────────────

  async sendMessage(input: {
    chatId: number | string;
    text: string;
    parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
    disableWebPagePreview?: boolean;
    replyToMessageId?: number;
    replyMarkup?: unknown;       // inline_keyboard, reply_keyboard, etc.
  }): Promise<TelegramMessage> {
    return this.req('sendMessage', {
      chat_id: input.chatId,
      text: input.text,
      ...(input.parseMode ? { parse_mode: input.parseMode } : {}),
      ...(input.disableWebPagePreview ? { disable_web_page_preview: true } : {}),
      ...(input.replyToMessageId ? { reply_to_message_id: input.replyToMessageId } : {}),
      ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
    });
  }

  async sendPhoto(input: { chatId: number | string; photoUrl: string; caption?: string; parseMode?: 'HTML' | 'MarkdownV2' }): Promise<TelegramMessage> {
    return this.req('sendPhoto', {
      chat_id: input.chatId,
      photo: input.photoUrl,
      ...(input.caption ? { caption: input.caption } : {}),
      ...(input.parseMode ? { parse_mode: input.parseMode } : {}),
    });
  }

  async sendVideo(input: { chatId: number | string; videoUrl: string; caption?: string }): Promise<TelegramMessage> {
    return this.req('sendVideo', { chat_id: input.chatId, video: input.videoUrl, ...(input.caption ? { caption: input.caption } : {}) });
  }

  async sendDocument(input: { chatId: number | string; documentUrl: string; caption?: string; filename?: string }): Promise<TelegramMessage> {
    return this.req('sendDocument', { chat_id: input.chatId, document: input.documentUrl, ...(input.caption ? { caption: input.caption } : {}) });
  }

  async sendAudio(input: { chatId: number | string; audioUrl: string; caption?: string; title?: string }): Promise<TelegramMessage> {
    return this.req('sendAudio', { chat_id: input.chatId, audio: input.audioUrl, ...(input.caption ? { caption: input.caption } : {}), ...(input.title ? { title: input.title } : {}) });
  }

  async editMessageText(input: { chatId: number | string; messageId: number; text: string; parseMode?: 'HTML' | 'MarkdownV2'; replyMarkup?: unknown }): Promise<TelegramMessage | boolean> {
    return this.req('editMessageText', {
      chat_id: input.chatId,
      message_id: input.messageId,
      text: input.text,
      ...(input.parseMode ? { parse_mode: input.parseMode } : {}),
      ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
    });
  }

  async deleteMessage(chatId: number | string, messageId: number): Promise<boolean> {
    return this.req('deleteMessage', { chat_id: chatId, message_id: messageId });
  }

  /** Show "typing..." (or "uploading photo...") to the user. */
  async sendChatAction(chatId: number | string, action: 'typing' | 'upload_photo' | 'upload_video' | 'upload_document' | 'record_voice' | 'choose_sticker'): Promise<boolean> {
    return this.req('sendChatAction', { chat_id: chatId, action });
  }

  // ── Inline keyboards / callbacks ──────────────────────────────────────

  async answerCallbackQuery(input: { callbackQueryId: string; text?: string; showAlert?: boolean; url?: string }): Promise<boolean> {
    return this.req('answerCallbackQuery', {
      callback_query_id: input.callbackQueryId,
      ...(input.text ? { text: input.text } : {}),
      ...(input.showAlert ? { show_alert: true } : {}),
      ...(input.url ? { url: input.url } : {}),
    });
  }

  // ── Files / attachments ────────────────────────────────────────────────

  /** Resolve a file_id to a download URL via getFile. */
  async getFileUrl(fileId: string): Promise<string> {
    const file = await this.req<{ file_id: string; file_path: string; file_size?: number }>('getFile', { file_id: fileId });
    return `${API_BASE}/file/bot${this.creds.botToken}/${file.file_path}`;
  }

  async downloadFile(fileId: string): Promise<{ data: Buffer; size: number }> {
    const url = await this.getFileUrl(fileId);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());
    return { data, size: data.length };
  }

  // ── Webhook management ────────────────────────────────────────────────

  async setWebhook(input: { url: string; secretToken?: string; allowedUpdates?: string[]; dropPendingUpdates?: boolean }): Promise<boolean> {
    return this.req('setWebhook', {
      url: input.url,
      ...(input.secretToken ? { secret_token: input.secretToken } : {}),
      ...(input.allowedUpdates ? { allowed_updates: input.allowedUpdates } : {}),
      ...(input.dropPendingUpdates ? { drop_pending_updates: true } : {}),
    });
  }

  async deleteWebhook(dropPendingUpdates = false): Promise<boolean> {
    return this.req('deleteWebhook', { drop_pending_updates: dropPendingUpdates });
  }

  async getWebhookInfo(): Promise<{ url: string; has_custom_certificate: boolean; pending_update_count: number; last_error_date?: number; last_error_message?: string }> {
    return this.req('getWebhookInfo');
  }
}
