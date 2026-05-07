/**
 * server/integrations/delighted.ts
 *
 * Delighted — NPS / CSAT / CES survey platform
 * Docs: https://app.delighted.com/docs/api
 * Auth: HTTP Basic with API key as username, empty password
 *
 * Base URL: https://api.delighted.com/v1
 */

const DELIGHTED_BASE = 'https://api.delighted.com/v1';

export class DelightedAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DelightedAuthError';
  }
}

export interface DelightedMetrics {
  nps: number;
  response_rate: number;
  responses: number;
  promoters: number;
  passives: number;
  detractors: number;
  [key: string]: unknown;
}

export interface DelightedResponse {
  id: string;
  person: string;
  score: number;
  comment: string | null;
  permalink: string;
  created_at: number;
  updated_at: number;
  person_properties: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DelightedPerson {
  id: string;
  email: string | null;
  phone_number: string | null;
  name: string | null;
  created_at: number;
  last_sent_at: number | null;
  [key: string]: unknown;
}

export interface DelightedUnsubscribe {
  person_email: string;
  unsubscribed_at: number;
  [key: string]: unknown;
}

export class DelightedAdapter {
  private readonly authHeader: string;

  constructor(apiKey: string) {
    // Basic auth: apiKey as username, empty password
    this.authHeader = 'Basic ' + Buffer.from(`${apiKey}:`).toString('base64');
  }

  private async req<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const url = new URL(`${DELIGHTED_BASE}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: 'application/json',
    };
    let bodyInit: BodyInit | undefined;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      // Delighted API uses form-encoded bodies for POST
      bodyInit = new URLSearchParams(
        Object.entries(body)
          .filter(([, v]) => v !== undefined && v !== null)
          .flatMap(([k, v]) => {
            if (typeof v === 'object' && v !== null) {
              // Flatten nested objects as key[subkey]=value
              return Object.entries(v as Record<string, unknown>).map(([sk, sv]) => [
                `${k}[${sk}]`,
                String(sv),
              ]);
            }
            return [[k, String(v)]];
          }),
      ).toString();
    }

    const res = await fetch(url.toString(), { method, headers, body: bodyInit });

    if (res.status === 401) {
      const text = await res.text().catch(() => '');
      throw new DelightedAuthError(`Delighted rejected the API key: ${text}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let message = text;
      try {
        const j = JSON.parse(text);
        message = j?.message ?? j?.error ?? text;
      } catch { /* keep raw */ }
      const err: any = new Error(`Delighted ${method} ${path} ${res.status}: ${message}`);
      err.statusCode = res.status;
      err.delightedRaw = text;
      throw err;
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  /** GET /metrics.json — account-level NPS metrics. */
  async getMetrics(): Promise<DelightedMetrics> {
    return this.req<DelightedMetrics>('GET', '/metrics.json');
  }

  /** GET /survey_responses.json — paginated list of survey responses. */
  async listResponses(params?: {
    since?: number;
    until?: number;
    per_page?: number;
    page?: number;
    trend?: string;
  }): Promise<DelightedResponse[]> {
    return this.req<DelightedResponse[]>('GET', '/survey_responses.json', undefined, {
      since: params?.since,
      until: params?.until,
      per_page: params?.per_page,
      page: params?.page,
      trend: params?.trend,
    });
  }

  /**
   * GET /people.json?email=... — look up a person by email.
   * Returns an array (may be empty).
   */
  async getPerson(email: string): Promise<DelightedPerson[]> {
    return this.req<DelightedPerson[]>('GET', '/people.json', undefined, { email });
  }

  /**
   * POST /people.json — create or update a person.
   * Delighted queues a survey to be sent when you create/update a person.
   */
  async createSurvey(person: {
    email?: string;
    phone_number?: string;
    name?: string;
    delay?: number;
    properties?: Record<string, string | number>;
  }): Promise<DelightedPerson> {
    const body: Record<string, unknown> = {};
    if (person.email) body.email = person.email;
    if (person.phone_number) body.phone_number = person.phone_number;
    if (person.name) body.name = person.name;
    if (person.delay !== undefined) body.delay = person.delay;
    if (person.properties && Object.keys(person.properties).length > 0) {
      body.properties = person.properties;
    }
    return this.req<DelightedPerson>('POST', '/people.json', body);
  }

  /** POST /unsubscribes.json — unsubscribe a person by email. */
  async unsubscribe(email: string): Promise<{ ok: boolean }> {
    await this.req('POST', '/unsubscribes.json', { person_email: email });
    return { ok: true };
  }

  /** GET /unsubscribes.json — list unsubscribed people. */
  async listUnsubscribes(params?: {
    per_page?: number;
    page?: number;
  }): Promise<DelightedUnsubscribe[]> {
    return this.req<DelightedUnsubscribe[]>('GET', '/unsubscribes.json', undefined, {
      per_page: params?.per_page,
      page: params?.page,
    });
  }
}
