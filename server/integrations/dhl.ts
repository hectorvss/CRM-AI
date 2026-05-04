/**
 * server/integrations/dhl.ts
 *
 * DHL adapter. Two surfaces are exposed depending on what the merchant has:
 *
 *   1. **Shipment Tracking — Unified API** (api-eu.dhl.com/track/shipments)
 *      Auth: `DHL-API-Key` header. Free tier on developer.dhl.com.
 *      Use case: tracking lookups for any DHL service (Express, Parcel,
 *      eCommerce, Freight, Global Forwarding) without product-specific
 *      credentials. This is the most common case.
 *
 *   2. **DHL Express MyDHL API** (express.api.dhl.com/mydhlapi)
 *      Auth: HTTP Basic — base64(username:password).
 *      Use case: rate quotes, shipment creation, label generation,
 *      pickup booking, manifesting. Required for outbound shipping flows.
 *
 * Both surfaces are independent and configurable per-tenant.
 *
 * Docs:
 *   - https://developer.dhl.com/api-reference/shipment-tracking
 *   - https://developer.dhl.com/api-reference/dhl-express-mydhl-api
 */

import { logger } from '../utils/logger.js';

export type DhlMode = 'sandbox' | 'production';

const TRACKING_BASE = 'https://api-eu.dhl.com/track/shipments';

export const MYDHL_BASE: Record<DhlMode, string> = {
  sandbox:    'https://express.api.dhl.com/mydhlapi/test',
  production: 'https://express.api.dhl.com/mydhlapi',
};

export interface DhlTrackingEvent {
  timestamp: string;
  location: string | null;
  description: string;
  statusCode: string | null;
}

export interface DhlTrackingResult {
  trackingNumber: string;
  status: string;
  statusCode: string | null;
  service: string | null;
  origin: string | null;
  destination: string | null;
  estimatedDelivery: string | null;
  events: DhlTrackingEvent[];
  raw: any;
}

export class DhlAdapter {
  constructor(
    private readonly apiKey: string,                  // for the Unified Tracking API
    private readonly mydhl: { username: string; password: string; mode: DhlMode } | null = null,
    private readonly transactionPrefix: string = 'crm-ai',
  ) {}

  // ── Tracking (Unified API, DHL-API-Key) ──────────────────────────────────

  async track(trackingNumber: string, opts?: { service?: 'express' | 'parcel-de' | 'ecommerce' | 'dgf' | 'dsc' | 'freight' | 'sameday' | 'svb' | 'parcel-uk' | 'post-de' | 'parcel-nl'; language?: string; offset?: number; limit?: number }): Promise<DhlTrackingResult> {
    const params = new URLSearchParams({ trackingNumber });
    if (opts?.service) params.set('service', opts.service);
    if (opts?.language) params.set('language', opts.language);
    if (typeof opts?.offset === 'number') params.set('offset', String(opts.offset));
    if (typeof opts?.limit === 'number') params.set('limit', String(opts.limit));

    const res = await fetch(`${TRACKING_BASE}?${params.toString()}`, {
      headers: {
        'DHL-API-Key': this.apiKey,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err: any = new Error(`DHL tracking ${res.status}: ${text.slice(0, 300)}`);
      err.statusCode = res.status;
      err.dhlRaw = text;
      throw err;
    }
    const data = (await res.json()) as any;
    const shipment = data?.shipments?.[0];
    const events = (shipment?.events ?? []) as any[];
    const lastEvent = events[0];
    return {
      trackingNumber,
      status: shipment?.status?.statusCode ?? lastEvent?.statusCode ?? 'unknown',
      statusCode: shipment?.status?.statusCode ?? null,
      service: shipment?.service ?? null,
      origin: shipment?.origin?.address?.addressLocality ?? null,
      destination: shipment?.destination?.address?.addressLocality ?? null,
      estimatedDelivery: shipment?.estimatedTimeOfDelivery ?? null,
      events: events.map((e) => ({
        timestamp: e?.timestamp ?? '',
        description: e?.description ?? '',
        statusCode: e?.statusCode ?? null,
        location: e?.location?.address?.addressLocality ?? null,
      })),
      raw: data,
    };
  }

  async ping(): Promise<{ ok: boolean; statusCode?: number }> {
    // Unified Tracking has no /me — issue a deliberately invalid lookup; a
    // 404 (shipment not found) means the API key is valid; 401 = bad key.
    try {
      const res = await fetch(`${TRACKING_BASE}?trackingNumber=PING000000`, {
        headers: { 'DHL-API-Key': this.apiKey, Accept: 'application/json' },
      });
      if (res.status === 401 || res.status === 403) return { ok: false, statusCode: res.status };
      return { ok: true, statusCode: res.status };
    } catch {
      return { ok: false };
    }
  }

  // ── DHL Express MyDHL API (rates, ship, label, pickup) ────────────────────

  private mydhlAuthHeader(): string {
    if (!this.mydhl) throw new Error('DHL Express credentials not configured');
    const auth = Buffer.from(`${this.mydhl.username}:${this.mydhl.password}`).toString('base64');
    return `Basic ${auth}`;
  }

  private async mydhlReq<T>(method: string, path: string, init?: { body?: unknown; query?: Record<string, string | number | boolean> }): Promise<T> {
    if (!this.mydhl) throw new Error('DHL Express credentials not configured');
    const url = new URL(`${MYDHL_BASE[this.mydhl.mode]}${path}`);
    if (init?.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = {
      Authorization: this.mydhlAuthHeader(),
      Accept: 'application/json',
      'Message-Reference': `${this.transactionPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      'Message-Reference-Date': new Date().toUTCString(),
    };
    let body: BodyInit | undefined;
    if (init?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.body);
    }
    const res = await fetch(url.toString(), { method, headers, body });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let message = text;
      let dhlDetails: any = null;
      try {
        const j = JSON.parse(text);
        dhlDetails = j?.detail ?? j?.additionalDetails ?? j;
        message = j?.detail ?? j?.title ?? j?.message ?? text;
      } catch { /* keep raw */ }
      const err: any = new Error(`DHL ${method} ${path} ${res.status}: ${message}`);
      err.statusCode = res.status;
      err.dhlDetails = dhlDetails;
      err.dhlRaw = text;
      throw err;
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  // Rate quotes
  async rate(payload: any): Promise<any> {
    return this.mydhlReq('POST', '/rates', { body: payload });
  }

  // Create a shipment + label
  async createShipment(payload: any): Promise<any> {
    return this.mydhlReq('POST', '/shipments', { body: payload });
  }

  // Cancel shipment
  async cancelShipment(shipmentTrackingNumber: string, opts: { requestorName: string; reason: string }): Promise<any> {
    return this.mydhlReq('PATCH', `/shipments/${encodeURIComponent(shipmentTrackingNumber)}/cancel-pickup`, {
      body: { requestorName: opts.requestorName, reason: opts.reason },
    });
  }

  // Book a pickup for an existing shipment (or standalone)
  async createPickup(payload: any): Promise<any> {
    return this.mydhlReq('POST', '/pickups', { body: payload });
  }

  async cancelPickup(dispatchConfirmationNumber: string, opts: { requestorName: string; reason: string }): Promise<any> {
    return this.mydhlReq('DELETE', `/pickups/${encodeURIComponent(dispatchConfirmationNumber)}`, {
      query: { requestorName: opts.requestorName, reason: opts.reason },
    });
  }

  // Address validation
  async validateAddress(query: { type: 'pickup' | 'delivery'; countryCode: string; postalCode?: string; cityName?: string; countyName?: string; strictValidation?: boolean }): Promise<any> {
    return this.mydhlReq('GET', '/address-validate', {
      query: query as Record<string, string | number | boolean>,
    });
  }

  // Get a label image / re-print
  async getImage(shipmentTrackingNumber: string, opts?: { typeCode?: 'label' | 'receipt' | 'invoice' | 'paperlessTradeLetter' | 'waybillDoc' }): Promise<any> {
    return this.mydhlReq('GET', `/shipments/${encodeURIComponent(shipmentTrackingNumber)}/get-image`, {
      query: opts?.typeCode ? { typeCode: opts.typeCode } : undefined,
    });
  }

  // List products available for a route
  async products(payload: any): Promise<any> {
    return this.mydhlReq('POST', '/products', { body: payload });
  }

  async ratingPackage(payload: any): Promise<any> {
    return this.mydhlReq('POST', '/rates', { body: payload });
  }

  async expressPing(): Promise<{ ok: boolean; statusCode?: number }> {
    if (!this.mydhl) return { ok: false };
    try {
      // address-validate is a cheap GET — invalid query returns a 400 with
      // body, valid returns 200; either way the auth works.
      const res = await fetch(`${MYDHL_BASE[this.mydhl.mode]}/address-validate?type=delivery&countryCode=US&postalCode=10001`, {
        headers: {
          Authorization: this.mydhlAuthHeader(),
          Accept: 'application/json',
          'Message-Reference': `${this.transactionPrefix}-ping-${Date.now()}`,
        },
      });
      if (res.status === 401 || res.status === 403) return { ok: false, statusCode: res.status };
      return { ok: true, statusCode: res.status };
    } catch (err) {
      logger.warn('dhl expressPing failed', { error: String(err) });
      return { ok: false };
    }
  }
}
