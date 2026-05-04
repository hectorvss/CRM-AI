/**
 * server/integrations/quickbooks.ts
 *
 * QuickBooks Online API v3 adapter, scoped to a `realmId` (company).
 */

import { QUICKBOOKS_API_BASE } from './quickbooks-oauth.js';
import { logger } from '../utils/logger.js';

export class QuickBooksAuthError extends Error { constructor(m: string) { super(m); this.name = 'QuickBooksAuthError'; } }

export interface QbCustomer { Id: string; DisplayName: string; PrimaryEmailAddr?: { Address: string }; Active: boolean; SyncToken: string }
export interface QbInvoice { Id: string; DocNumber?: string; CustomerRef: { value: string; name?: string }; TotalAmt: number; Balance: number; DueDate?: string; TxnDate: string; SyncToken: string }
export interface QbPayment { Id: string; CustomerRef: { value: string }; TotalAmt: number; TxnDate: string; SyncToken: string }
export interface QbCreditMemo { Id: string; CustomerRef: { value: string }; TotalAmt: number; TxnDate: string; SyncToken: string }

export class QuickBooksAdapter {
  private base: string;
  constructor(private accessToken: string, public realmId: string) {
    this.base = `${QUICKBOOKS_API_BASE}/${encodeURIComponent(realmId)}`;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.base}${path}${path.includes('?') ? '&' : '?'}minorversion=70`;
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${this.accessToken}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 || res.status === 403) throw new QuickBooksAuthError(`qb ${method} ${path} unauthorized (${res.status})`);
    if (!res.ok) { const text = await res.text().catch(() => ''); throw new Error(`qb ${method} ${path} failed: ${res.status} ${text}`); }
    if (res.status === 204) return undefined as unknown as T;
    return (await res.json()) as T;
  }

  async ping(): Promise<{ ok: boolean }> {
    try { await this.request('GET', `/companyinfo/${encodeURIComponent(this.realmId)}`); return { ok: true }; }
    catch (err) { logger.warn('quickbooks ping failed', { error: String(err) }); return { ok: false }; }
  }

  async getCompanyInfo(): Promise<any> {
    return this.request('GET', `/companyinfo/${encodeURIComponent(this.realmId)}`);
  }

  // ── Query helpers ─────────────────────────────────────────────────────────
  async query<T>(sql: string): Promise<T> {
    return this.request<T>('GET', `/query?query=${encodeURIComponent(sql)}`);
  }

  // ── Customers ─────────────────────────────────────────────────────────────
  async findCustomerByEmail(email: string): Promise<QbCustomer | null> {
    const sql = `SELECT * FROM Customer WHERE PrimaryEmailAddr = '${email.replace(/'/g, "''")}' MAXRESULTS 1`;
    const r = await this.query<{ QueryResponse: { Customer?: QbCustomer[] } }>(sql);
    return r.QueryResponse?.Customer?.[0] ?? null;
  }
  async createCustomer(payload: { displayName: string; email?: string; phone?: string; companyName?: string }): Promise<QbCustomer> {
    const r = await this.request<{ Customer: QbCustomer }>('POST', '/customer', {
      DisplayName: payload.displayName,
      ...(payload.email ? { PrimaryEmailAddr: { Address: payload.email } } : {}),
      ...(payload.phone ? { PrimaryPhone: { FreeFormNumber: payload.phone } } : {}),
      ...(payload.companyName ? { CompanyName: payload.companyName } : {}),
    });
    return r.Customer;
  }

  // ── Invoices ──────────────────────────────────────────────────────────────
  async listInvoices(opts: { customerId?: string; limit?: number } = {}): Promise<QbInvoice[]> {
    let sql = 'SELECT * FROM Invoice';
    if (opts.customerId) sql += ` WHERE CustomerRef = '${opts.customerId}'`;
    sql += ` MAXRESULTS ${opts.limit ?? 25}`;
    const r = await this.query<{ QueryResponse: { Invoice?: QbInvoice[] } }>(sql);
    return r.QueryResponse?.Invoice ?? [];
  }
  async getInvoice(id: string): Promise<QbInvoice> {
    const r = await this.request<{ Invoice: QbInvoice }>('GET', `/invoice/${encodeURIComponent(id)}`);
    return r.Invoice;
  }

  // ── Payments ──────────────────────────────────────────────────────────────
  async createPayment(payload: { customerId: string; totalAmt: number; lines?: Array<{ amount: number; linkedTxnId?: string; linkedTxnType?: 'Invoice' }>; txnDate?: string }): Promise<QbPayment> {
    const r = await this.request<{ Payment: QbPayment }>('POST', '/payment', {
      CustomerRef: { value: payload.customerId },
      TotalAmt: payload.totalAmt,
      ...(payload.txnDate ? { TxnDate: payload.txnDate } : {}),
      ...(payload.lines ? { Line: payload.lines.map(l => ({ Amount: l.amount, ...(l.linkedTxnId ? { LinkedTxn: [{ TxnId: l.linkedTxnId, TxnType: l.linkedTxnType ?? 'Invoice' }] } : {}) })) } : {}),
    });
    return r.Payment;
  }

  // ── Credit memos (refunds) ────────────────────────────────────────────────
  async createCreditMemo(payload: { customerId: string; totalAmt: number; lines: Array<{ amount: number; description?: string; itemId?: string }>; txnDate?: string }): Promise<QbCreditMemo> {
    const r = await this.request<{ CreditMemo: QbCreditMemo }>('POST', '/creditmemo', {
      CustomerRef: { value: payload.customerId },
      ...(payload.txnDate ? { TxnDate: payload.txnDate } : {}),
      Line: payload.lines.map(l => ({
        Amount: l.amount,
        DetailType: 'SalesItemLineDetail',
        ...(l.description ? { Description: l.description } : {}),
        SalesItemLineDetail: { ...(l.itemId ? { ItemRef: { value: l.itemId } } : {}) },
      })),
    });
    return r.CreditMemo;
  }
}
