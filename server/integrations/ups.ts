/**
 * server/integrations/ups.ts
 *
 * UPS REST adapter. Coverage:
 *   - Tracking v1 (real-time package status, delivery progress, events)
 *   - Rating v2 (rate quotes, time-in-transit)
 *   - Address Validation v3 (street-level validation + classification)
 *   - Shipping v2509 (create shipments, void shipments, labels)
 *   - Locator v2 (find drop-off / access points by ZIP)
 *   - Paperless Document v1 (upload commercial invoice / docs)
 *
 * Auth: Bearer access_token from ups-oauth.ts (Client Credentials).
 *
 * Docs: https://developer.ups.com/api/reference
 */

import { logger } from '../utils/logger.js';
import { UPS_BASE, type UpsMode } from './ups-oauth.js';

export interface UpsTrackEvent {
  status: string;
  description: string;
  date: string;
  time: string;
  location: string | null;
  code: string | null;
}

export interface UpsTrackResult {
  trackingNumber: string;
  currentStatus: string;
  statusCode: string | null;
  scheduledDelivery: string | null;
  deliveryAttempts: number;
  service: string | null;
  weight: string | null;
  events: UpsTrackEvent[];
  raw: any;
}

export class UpsAdapter {
  constructor(
    private readonly accessToken: string,
    private readonly mode: UpsMode,
    private readonly transactionPrefix: string = 'crm-ai',
  ) {}

  private newTransactionId(): string {
    return `${this.transactionPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private async req<T>(method: string, path: string, init?: { body?: unknown; query?: Record<string, string | number | boolean>; transId?: string }): Promise<T> {
    const url = new URL(`${UPS_BASE[this.mode]}${path}`);
    if (init?.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
      transId: init?.transId ?? this.newTransactionId(),
      transactionSrc: this.transactionPrefix,
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
      let upsErrors: any = null;
      try {
        const j = JSON.parse(text);
        upsErrors = j?.response?.errors ?? j?.errors ?? null;
        message = upsErrors?.[0]?.message ?? j?.message ?? text;
      } catch { /* keep raw */ }
      const err: any = new Error(`UPS ${method} ${path} ${res.status}: ${message}`);
      err.statusCode = res.status;
      err.upsErrors = upsErrors;
      err.upsRaw = text;
      throw err;
    }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  // ── Tracking ─────────────────────────────────────────────────────────────

  /**
   * Look up real-time tracking for a 1Z / mail innovations / freight number.
   * Returns a normalised view with the full event history.
   */
  async track(trackingNumber: string, opts?: { locale?: string; returnSignature?: boolean; returnPOD?: boolean; returnMilestones?: boolean }): Promise<UpsTrackResult> {
    const query: Record<string, string> = {
      locale: opts?.locale ?? 'en_US',
      returnSignature: String(opts?.returnSignature ?? false),
      returnMilestones: String(opts?.returnMilestones ?? true),
      returnPOD: String(opts?.returnPOD ?? false),
    };
    const data = await this.req<any>(
      'GET',
      `/api/track/v1/details/${encodeURIComponent(trackingNumber)}`,
      { query },
    );
    const shipment = data?.trackResponse?.shipment?.[0];
    const pkg = shipment?.package?.[0];
    const activity = (pkg?.activity ?? []) as any[];
    const events: UpsTrackEvent[] = activity.map((a: any) => ({
      status: a?.status?.description ?? a?.status?.type ?? 'unknown',
      description: a?.status?.description ?? '',
      code: a?.status?.code ?? null,
      date: a?.date ?? '',
      time: a?.time ?? '',
      location: [
        a?.location?.address?.city,
        a?.location?.address?.stateProvince,
        a?.location?.address?.country,
      ].filter(Boolean).join(', ') || null,
    }));
    const latest = events[0];
    return {
      trackingNumber,
      currentStatus: latest?.status ?? 'unknown',
      statusCode: latest?.code ?? null,
      scheduledDelivery: pkg?.deliveryDate?.[0]?.date ?? null,
      deliveryAttempts: Number(pkg?.deliveryAttempts ?? 0),
      service: pkg?.service?.description ?? null,
      weight: pkg?.weight?.weight ?? null,
      events,
      raw: data,
    };
  }

  // ── Rating (rate quotes) ─────────────────────────────────────────────────

  /**
   * Get rate quotes. The shape mirrors UPS's RateRequest envelope; consumers
   * can pass any valid body — we just wrap it in the required envelope.
   */
  async rate(payload: { request: any; shipment: any }): Promise<any> {
    return this.req('POST', '/api/rating/v2409/Rate', {
      body: { RateRequest: payload },
    });
  }

  /**
   * Time-in-Transit query — given origin + destination + ship date, returns
   * delivery date estimates per service level.
   */
  async timeInTransit(payload: any): Promise<any> {
    return this.req('POST', '/api/shipments/v1/transittimes', { body: payload });
  }

  // ── Address Validation ───────────────────────────────────────────────────

  /**
   * Validate (and optionally classify) a US/PR address. RequestOption:
   *   1 = address validation, 2 = address classification, 3 = both.
   */
  async validateAddress(address: { addressLine?: string[]; politicalDivision1?: string; politicalDivision2?: string; postcodePrimaryLow?: string; countryCode?: string }, requestOption: 1 | 2 | 3 = 3): Promise<any> {
    return this.req('POST', `/api/addressvalidation/v2/${requestOption}`, {
      body: {
        XAVRequest: {
          AddressKeyFormat: {
            AddressLine: address.addressLine ?? [],
            PoliticalDivision2: address.politicalDivision2,
            PoliticalDivision1: address.politicalDivision1,
            PostcodePrimaryLow: address.postcodePrimaryLow,
            CountryCode: address.countryCode ?? 'US',
          },
        },
      },
    });
  }

  // ── Shipping ─────────────────────────────────────────────────────────────

  /**
   * Create a shipment + label. UPS expects a `ShipmentRequest` envelope.
   */
  async createShipment(shipmentRequest: any, opts?: { additionalAddressValidation?: string }): Promise<any> {
    return this.req('POST', '/api/shipments/v2509/ship', {
      body: { ShipmentRequest: shipmentRequest },
      query: opts?.additionalAddressValidation ? { additionaladdressvalidation: opts.additionalAddressValidation } : undefined,
    });
  }

  /**
   * Void a shipment (cancel a label). If trackingNumber is provided, voids
   * a single package within the shipment; otherwise voids the entire shipment.
   */
  async voidShipment(shipmentId: string, trackingNumber?: string): Promise<any> {
    const path = trackingNumber
      ? `/api/shipments/v1/void/cancel/${encodeURIComponent(shipmentId)}?trackingnumber=${encodeURIComponent(trackingNumber)}`
      : `/api/shipments/v1/void/cancel/${encodeURIComponent(shipmentId)}`;
    return this.req('DELETE', path);
  }

  /**
   * Re-print / retrieve labels for an existing shipment.
   */
  async getLabel(shipmentId: string, trackingNumber: string): Promise<any> {
    return this.req('POST', '/api/labels/v2/label/recovery', {
      body: {
        LabelRecoveryRequest: {
          TrackingNumber: trackingNumber,
          ReferenceValues: { Code: '01', Value: shipmentId },
        },
      },
    });
  }

  // ── Locator ──────────────────────────────────────────────────────────────

  /**
   * Find UPS Access Points / drop-off / pickup locations near a postal code.
   */
  async findLocations(payload: any): Promise<any> {
    return this.req('POST', '/api/locations/v3/search/availabilities/64', {
      body: { LocatorRequest: payload },
    });
  }

  // ── Paperless Document ───────────────────────────────────────────────────

  /**
   * Upload a commercial invoice / customs doc to be referenced by a shipment.
   */
  async uploadDocument(shipperNumber: string, doc: { fileName: string; fileFormat: string; documentContent: string; documentType: string }): Promise<any> {
    return this.req('POST', `/api/paperlessdocuments/v2/upload`, {
      body: {
        UploadRequest: {
          ShipperNumber: shipperNumber,
          UserCreatedForm: [doc],
        },
      },
    });
  }

  // ── Health / identity ────────────────────────────────────────────────────

  /**
   * Confirms the access token is alive by attempting an inexpensive call.
   * UPS doesn't expose a /me endpoint, so we hit address validation against
   * the UPS HQ address — a 200 response means the token works.
   */
  async ping(): Promise<{ ok: boolean; statusCode?: number }> {
    try {
      await this.validateAddress({
        addressLine: ['55 Glenlake Pkwy NE'],
        politicalDivision2: 'Atlanta',
        politicalDivision1: 'GA',
        postcodePrimaryLow: '30328',
        countryCode: 'US',
      }, 1);
      return { ok: true };
    } catch (err: any) {
      logger.warn('ups ping failed', { error: err?.message });
      return { ok: false, statusCode: err?.statusCode };
    }
  }
}
