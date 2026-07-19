/**
 * CRM AI — API Client
 * All frontend ↔ backend communication goes through this module.
 *
 * Wire format: the backend speaks snake_case end-to-end. This client is the
 * SINGLE place that converts payloads to/from camelCase via `./normalize.ts`,
 * so consumers (components, hooks) only ever see camelCase.
 */

import { supabase } from './supabase';
import { camelToSnakeDeep, snakeToCamelDeep } from './normalize';

const BASE = '/api';

// localStorage key used to cache the tenant/workspace fetched from /api/iam/me
// for users whose JWT app_metadata is not yet populated. Scoped per-user via
// the cached user id so a sign-out/sign-in as a different user doesn't leak.
const MEMBERSHIP_CACHE_KEY = 'crmai.membership.v1';

interface MembershipCache {
  userId:      string;
  tenantId:    string;
  workspaceId: string;
}

function readMembershipCache(userId: string): MembershipCache | null {
  try {
    const raw = localStorage.getItem(MEMBERSHIP_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MembershipCache;
    if (parsed?.userId === userId && parsed.tenantId && parsed.workspaceId) {
      return parsed;
    }
    // Stale (different user) — drop it.
    localStorage.removeItem(MEMBERSHIP_CACHE_KEY);
    return null;
  } catch {
    return null;
  }
}

function writeMembershipCache(entry: MembershipCache) {
  try {
    localStorage.setItem(MEMBERSHIP_CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* ignore quota / disabled storage */
  }
}

let inflightMembershipFetch: Promise<MembershipCache | null> | null = null;

async function fetchMembershipFromApi(userId: string, token: string): Promise<MembershipCache | null> {
  if (inflightMembershipFetch) return inflightMembershipFetch;

  inflightMembershipFetch = (async () => {
    try {
      const res = await fetch(`${BASE}/iam/me`, {
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${token}`,
          // Backend tolerates these as hints; without them resolution may fail
          // until app_metadata is populated. We send placeholders that the
          // server will overwrite from the JWT/membership lookup.
          'x-user-id':     userId,
        },
      });
      if (!res.ok) return null;
      const body = await res.json().catch(() => null) as any;
      const tenantId =
        body?.context?.tenant_id ||
        body?.memberships?.[0]?.tenant_id;
      const workspaceId =
        body?.context?.workspace_id ||
        body?.memberships?.[0]?.workspace_id;

      if (!tenantId || !workspaceId) return null;
      const entry: MembershipCache = { userId, tenantId, workspaceId };
      writeMembershipCache(entry);
      return entry;
    } catch {
      return null;
    } finally {
      // Clear the in-flight gate after this microtask cycle so subsequent
      // pages still benefit from the cache but a new login can re-fetch.
      setTimeout(() => { inflightMembershipFetch = null; }, 0);
    }
  })();

  return inflightMembershipFetch;
}

// Resolve tenant / workspace context from (in priority order):
//   1. Supabase JWT claims (app_metadata > user_metadata)
//   2. Cached membership fetched from /api/iam/me (per-user localStorage)
//   3. Vite build-time env vars (VITE_TENANT_ID / VITE_WORKSPACE_ID)
//   4. Hard-coded demo defaults (org_default / ws_default)
function resolveTenantHeaders(user?: { id?: string; app_metadata?: any; user_metadata?: any }) {
  const claimTenant =
    user?.app_metadata?.tenant_id ||
    user?.user_metadata?.tenant_id;
  const claimWorkspace =
    user?.app_metadata?.workspace_id ||
    user?.user_metadata?.workspace_id;

  if (claimTenant && claimWorkspace) {
    return { tenantId: claimTenant, workspaceId: claimWorkspace };
  }

  const cached = user?.id ? readMembershipCache(user.id) : null;

  const tenantId =
    claimTenant ||
    cached?.tenantId ||
    (import.meta as any).env?.VITE_TENANT_ID ||
    'org_default';

  const workspaceId =
    claimWorkspace ||
    cached?.workspaceId ||
    (import.meta as any).env?.VITE_WORKSPACE_ID ||
    'ws_default';

  return { tenantId, workspaceId };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const userId = data.session?.user?.id || 'system';
  const sessionUser = data.session?.user;
  const claimTenant = sessionUser?.app_metadata?.tenant_id || sessionUser?.user_metadata?.tenant_id;
  const claimWorkspace = sessionUser?.app_metadata?.workspace_id || sessionUser?.user_metadata?.workspace_id;

  // If JWT doesn't carry tenant claims but we have a session+token, fetch
  // membership from /api/iam/me (cached per-user). We await only when nothing
  // is cached yet — otherwise we kick it off in the background and use the
  // cached value immediately.
  if (sessionUser?.id && token && (!claimTenant || !claimWorkspace)) {
    const cached = readMembershipCache(sessionUser.id);
    if (!cached) {
      await fetchMembershipFromApi(sessionUser.id, token);
    } else {
      // Refresh in background (fire-and-forget)
      void fetchMembershipFromApi(sessionUser.id, token);
    }
  }

  const { tenantId, workspaceId } = resolveTenantHeaders(sessionUser);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-tenant-id': tenantId,
    'x-workspace-id': workspaceId,
    'x-user-id': userId,
    ...(options?.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Normalize request body keys to snake_case so callers can author payloads
  // in camelCase. We only touch JSON bodies (string body that parses as JSON
  // or a plain object body). Non-JSON bodies (FormData, Blob, ArrayBuffer)
  // pass through untouched.
  let outgoingBody: BodyInit | undefined = options?.body as BodyInit | undefined;
  if (options?.body !== undefined && options.body !== null) {
    if (typeof options.body === 'string') {
      const trimmed = options.body.trim();
      if (trimmed.length > 0 && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
        try {
          const parsed = JSON.parse(options.body);
          outgoingBody = JSON.stringify(camelToSnakeDeep(parsed));
        } catch {
          // Body wasn't valid JSON after all; send as-is.
          outgoingBody = options.body;
        }
      }
    } else if (
      typeof FormData !== 'undefined' && options.body instanceof FormData
    ) {
      outgoingBody = options.body;
    } else if (
      typeof Blob !== 'undefined' && options.body instanceof Blob
    ) {
      outgoingBody = options.body;
    } else if (
      typeof ArrayBuffer !== 'undefined' && options.body instanceof ArrayBuffer
    ) {
      outgoingBody = options.body;
    } else if (typeof options.body === 'object') {
      outgoingBody = JSON.stringify(camelToSnakeDeep(options.body as any));
    }
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    body: outgoingBody,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const apiError = new Error(err.message || err.error || `API error ${res.status}`) as Error & {
      status?: number;
      code?: string;
      details?: unknown;
    };
    apiError.status = res.status;
    apiError.code = err.code || err.error;
    apiError.details = err.details;
    throw apiError;
  }
  // Response: convert snake_case keys to camelCase so components consume a
  // consistent shape regardless of the wire format.
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  try {
    const parsed = JSON.parse(text);
    return snakeToCamelDeep<T>(parsed);
  } catch {
    // Non-JSON response (rare for our API). Return raw text typed as-is.
    return text as unknown as T;
  }
}

function unwrapList<T = any>(payload: any): T[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

// ── Cases ─────────────────────────────────────────────────
export const casesApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/cases${qs}`).then(unwrapList);
  },
  // Multi-source server-side search (case number / customer / message content).
  search: (q: string, limit = 50) =>
    request<any>(`/cases/search?q=${encodeURIComponent(q)}&limit=${limit}`).then(unwrapList),
  // Server-side sidebar scope counts (avoids loading every case to count).
  // Returns { <scope>: n, teams: [{id,count}], agents: [{id,count}] }.
  counts: () => request<Record<string, any>>('/cases/counts'),
  create: (payload: Record<string, any>) =>
    request<any>('/cases', { method: 'POST', body: JSON.stringify(payload) }),
  get: (id: string) => request<any>(`/cases/${id}`),
  state: (id: string) => request<any>(`/cases/${id}/state`),
  graph: (id: string) => request<any>(`/cases/${id}/graph`),
  resolve: (id: string) => request<any>(`/cases/${id}/resolve`),
  checks: (id: string) => request<any>(`/cases/${id}/checks`),
  startAiResolve: (id: string, payload?: { dry_run?: boolean; autonomy?: 'assisted' | 'full' }) =>
    request<any>(`/cases/${id}/resolve/start`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  resolutionPlan: (id: string) => request<any>(`/cases/${id}/resolution-plan`),
  runResolutionStep: (id: string, stepId: string, payload?: Record<string, any>) =>
    request<any>(`/cases/${id}/resolution-plan/steps/${encodeURIComponent(stepId)}/run`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  runResolutionPlan: (id: string, payload?: Record<string, any>) =>
    request<any>(`/cases/${id}/resolution-plan/run`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  resolveWithAI: (id: string, payload?: Record<string, any>) =>
    request<any>(`/cases/${id}/resolve-with-ai`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  timeline: (id: string) => request<any[]>(`/cases/${id}/timeline`),
  inboxView: (id: string) => request<any>(`/cases/${id}/inbox-view`),
  updateStatus: (id: string, status: string, reason?: string, changed_by?: string) =>
    request<any>(`/cases/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason, changed_by }),
    }),
  assign: (id: string, user_id?: string, team_id?: string) =>
    request<any>(`/cases/${id}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ user_id, team_id }),
    }),
  // Inline tag CRUD. mode = 'set' | 'add' | 'remove' (default 'set').
  updateTags: (id: string, tags: string[], mode: 'set' | 'add' | 'remove' = 'set') =>
    request<any>(`/cases/${id}/tags`, {
      method: 'PATCH',
      body: JSON.stringify({ tags, mode }),
    }),
  // Per-user star (favorite). Backed by the case_stars table.
  isStarred:    (id: string) => request<{ starred: boolean }>(`/cases/${id}/star`),
  starCase:     (id: string) => request<any>(`/cases/${id}/star`, { method: 'PUT' }),
  unstarCase:   (id: string) => request<any>(`/cases/${id}/star`, { method: 'DELETE' }),
  listStarred:  () => request<{ ids: string[] }>(`/cases/starred/ids`),
  addNote: (id: string, content: string, created_by?: string) =>
    request<any>(`/cases/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ content, created_by }),
    }),
  addInternalNote: (id: string, content: string) =>
    request<any>(`/cases/${id}/internal-note`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  updateInternalNote: (caseId: string, noteId: string, content: string) =>
    request<any>(`/cases/${caseId}/internal-notes/${encodeURIComponent(noteId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),
  deleteInternalNote: (caseId: string, noteId: string) =>
    request<any>(`/cases/${caseId}/internal-notes/${encodeURIComponent(noteId)}`, {
      method: 'DELETE',
    }),
  reply: (id: string, content: string, draft_reply_id?: string, attachments?: Array<{ id: string; name: string; size: number; type: string; dataUrl?: string; url?: string }>) =>
    request<any>(`/cases/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content, draft_reply_id, attachments }),
    }),
  executeResolutionStep: (id: string, stepId: string) =>
    request<any>(`/cases/${id}/resolution/execute-step`, {
      method: 'POST',
      body: JSON.stringify({ stepId }),
    }),
  executeAllResolutionSteps: (id: string, dryRun?: boolean) =>
    request<any>(`/cases/${id}/resolution/execute-all${dryRun ? '?dryRun=true' : ''}`, {
      method: 'POST',
    }),
  merge: (targetId: string, sourceId: string) =>
    request<any>(`/cases/${targetId}/merge`, {
      method: 'POST',
      body: JSON.stringify({ sourceId }),
    }),
  patch: (id: string, payload: Record<string, any>) =>
    request<any>(`/cases/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};

// ── Conversations ─────────────────────────────────────────
export const conversationsApi = {
  getByCase: (caseId: string) => request<any>(`/conversations/by-case/${caseId}`),
  getMessages: (convId: string) => request<any[]>(`/conversations/${convId}/messages`),
  sendMessage: (convId: string, content: string, type = 'agent', sender_name?: string) =>
    request<any>(`/conversations/${convId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, type, sender_name }),
    }),
};

// ── Customers ─────────────────────────────────────────────
export const customersApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/customers${qs}`).then(unwrapList);
  },
  get:      (id: string) => request<any>(`/customers/${id}`),
  state:    (id: string) => request<any>(`/customers/${id}/state`),
  activity: (id: string) => request<any>(`/customers/${id}/activity`),
  create: (payload: Record<string, any>) =>
    request<any>('/customers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  update: (id: string, payload: {
    segment?: string;
    risk_level?: string;
    preferred_channel?: string;
    fraud_flag?: boolean;
    canonical_name?: string;
    canonical_email?: string;
    phone?: string;
    notes?: string;
    tags?: string[];
  }) =>
    request<any>(`/customers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  merge: (targetId: string, sourceId: string) =>
    request<any>(`/customers/${targetId}/merge`, {
      method: 'POST',
      body: JSON.stringify({ sourceId }),
    }),
};

// ── Orders ────────────────────────────────────────────────
export const ordersApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/orders${qs}`).then(unwrapList);
  },
  get: (id: string) => request<any>(`/orders/${id}`),
  context: (id: string) => request<any>(`/orders/${id}/context`),
  cancel: (id: string, reason: string) =>
    request<any>(`/orders/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  updateStatus: (id: string, status: string, note?: string) =>
    request<any>(`/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    }),
};

// ── Payments ─────────────────────────────────────────────
export const paymentsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/payments${qs}`).then(unwrapList);
  },
  get: (id: string) => request<any>(`/payments/${id}`),
  context: (id: string) => request<any>(`/payments/${id}/context`),
  refund: (id: string, payload: { amount?: number; reason?: string }) =>
    request<any>(`/payments/${id}/refund`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  refundAdvanced: (id: string, payload: {
    mode: 'full' | 'partial' | 'exchange' | 'goodwill';
    amount?: number;
    currency?: string;
    reason?: string;
    provider?: 'shopify' | 'woocommerce';
    replacementProducts?: Array<{
      provider?: 'shopify' | 'woocommerce';
      productId?: string | number;
      variantId?: string | number;
      quantity?: number;
      title?: string;
      price?: number;
    }>;
  }) =>
    request<any>(`/payments/${id}/refund-advanced`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

// ── Commerce (multi-provider product search + draft orders) ─────────────
export const commerceApi = {
  searchProducts: (params: { q?: string; provider?: 'shopify' | 'woocommerce'; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.provider) qs.set('provider', params.provider);
    if (params.limit) qs.set('limit', String(params.limit));
    return request<{ provider: string; count: number; items: any[] }>(`/commerce/products?${qs.toString()}`);
  },
  createDraftOrder: (payload: {
    provider?: 'shopify' | 'woocommerce';
    customerExternalId?: string;
    note?: string;
    lineItems: Array<{ productId?: string | number; variantId?: string | number; quantity?: number }>;
  }) =>
    request<any>('/commerce/draft-orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

// ── Returns ──────────────────────────────────────────────
export const returnsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/returns${qs}`).then(unwrapList);
  },
  get: (id: string) => request<any>(`/returns/${id}`),
  context: (id: string) => request<any>(`/returns/${id}/context`),
  create: (payload: Record<string, any>) =>
    request<any>('/returns', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateStatus: (id: string, payload: Record<string, any>) =>
    request<any>(`/returns/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};

// ── Approvals ─────────────────────────────────────────────
export interface ApprovalsListParams {
  limit?: number;
  offset?: number;
  status?: string;
  risk_level?: string;
  assigned_to?: string;
}

export interface ApprovalsListResponse<T = any> {
  items: T[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
}

export const approvalsApi = {
  list: (params?: ApprovalsListParams): Promise<ApprovalsListResponse> => {
    const search = new URLSearchParams();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        search.set(key, String(value));
      }
    }
    const qs = search.toString();
    return request<any>(`/approvals${qs ? `?${qs}` : ''}`).then((payload) => {
      const items = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.items)
        ? payload.items
        : unwrapList(payload);
      const total = typeof payload?.total === 'number' ? payload.total : items.length;
      const hasMore = typeof payload?.hasMore === 'boolean' ? payload.hasMore : false;
      const limit = typeof payload?.limit === 'number' ? payload.limit : (params?.limit ?? items.length);
      const offset = typeof payload?.offset === 'number' ? payload.offset : (params?.offset ?? 0);
      return { items, total, hasMore, limit, offset };
    });
  },
  get: (id: string) => request<any>(`/approvals/${id}`),
  context: (id: string) => request<any>(`/approvals/${id}/context`),
  decide: (id: string, decision: 'approved' | 'rejected', note?: string, decided_by?: string) =>
    request<any>(`/approvals/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify({ decision, note, decided_by }),
    }),
};

export const policyApi = {
  evaluateAndRoute: (payload: Record<string, any>) =>
    request<any>('/policy/evaluate-and-route', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

export const executionApi = {
  authorizeAction: (payload: Record<string, any>) =>
    request<any>('/execution/authorize-action', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

// ── Knowledge ─────────────────────────────────────────────
export const knowledgeApi = {
  listArticles: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/knowledge/articles${qs}`).then(unwrapList);
  },
  gaps: () => request<any>('/knowledge/gaps'),
  test: (payload: Record<string, any>) =>
    request<any>('/knowledge/test', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getArticle: (id: string) => request<any>(`/knowledge/articles/${id}`),
  createArticle: (payload: Record<string, any>) =>
    request<any>('/knowledge/articles', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateArticle: (id: string, payload: Record<string, any>) =>
    request<any>(`/knowledge/articles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  publishArticle: (id: string) =>
    request<any>(`/knowledge/articles/${id}/publish`, {
      method: 'POST',
      body: '{}',
    }),
  listDomains: () => request<any>('/knowledge/domains').then(unwrapList),
  createDomain: (payload: { name: string; description?: string; parent_id?: string | null; icon?: string | null }) =>
    request<any>('/knowledge/domains', { method: 'POST', body: JSON.stringify(payload) }),
  updateDomain: (id: string, payload: Record<string, any>) =>
    request<any>(`/knowledge/domains/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteDomain: (id: string) =>
    request<any>(`/knowledge/domains/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  listPolicies: () => request<any>('/knowledge/policies').then(unwrapList),
};

// ── Workflows ─────────────────────────────────────────────
export const workflowsApi = {
  list: () => request<any>('/workflows').then(unwrapList),
  catalog: () => request<any>('/workflows/catalog'),
  create: (payload: Record<string, any>) =>
    request<any>('/workflows', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  get: (id: string) => request<any>(`/workflows/${id}`),
  update: (id: string, payload: Record<string, any>) =>
    request<any>(`/workflows/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  publish: (id: string) =>
    request<any>(`/workflows/${id}/publish`, {
      method: 'POST',
      body: '{}',
    }),
  validate: (id: string, payload: Record<string, any> = {}) =>
    request<any>(`/workflows/${id}/validate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  dryRun: (id: string, payload: Record<string, any> = {}) =>
    request<any>(`/workflows/${id}/dry-run`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  stepRun: (id: string, payload: Record<string, any> = {}) =>
    request<any>(`/workflows/${id}/step-run`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  run: (id: string, payload: Record<string, any> = {}) =>
    request<any>(`/workflows/${id}/run`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  rollback: (id: string, payload: Record<string, any> = {}) =>
    request<any>(`/workflows/${id}/rollback`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  archive: (id: string, payload: Record<string, any> = {}) =>
    request<any>(`/workflows/${id}/archive`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  retryRun: (runId: string, payload: Record<string, any> = {}) =>
    request<any>(`/workflows/runs/${runId}/retry`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  resumeRun: (runId: string, payload: Record<string, any> = {}) =>
    request<any>(`/workflows/runs/${runId}/resume`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  cancelRun: (runId: string, payload: Record<string, any> = {}) =>
    request<any>(`/workflows/runs/${runId}/cancel`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  triggerEvent: (payload: Record<string, any>) =>
    request<any>('/workflows/events/trigger', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getRun: (runId: string) => request<any>(`/workflows/runs/${runId}`),
  recentRuns: () => request<any>('/workflows/runs/recent').then(unwrapList),
  agentCatalog: () => request<any>('/workflows/agent-catalog').then((d: any) => {
    const nodes = Array.isArray(d?.nodes) ? d.nodes : Array.isArray(d) ? d : [];
    // Normalize to { id, slug, name, description, status } shape expected by WorkflowAddNodePanel
    return nodes.map((n: any) => ({
      id: n.agentId ?? n.id ?? n.agentSlug ?? '',
      slug: n.agentSlug ?? n.slug ?? '',
      name: n.label ?? n.name ?? n.agentSlug ?? 'Unknown agent',
      description: n.description,
      status: n.status,
    }));
  }),
};

// ── Agents ────────────────────────────────────────────────
export const agentsApi = {
  list: () => request<any>('/agents').then(unwrapList),
  get: (id: string) => request<any>(`/agents/${id}`),
  policyDraft: (id: string) => request<any>(`/agents/${id}/policy-bundle-draft`),
  updatePolicyDraft: (id: string, payload: Record<string, any>) =>
    request<any>(`/agents/${id}/policy-bundle-draft`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  publishPolicyDraft: (id: string, payload: Record<string, any> = {}) =>
    request<any>(`/agents/${id}/policy-bundle-publish`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  rollbackPolicy: (id: string, payload: Record<string, any> = {}) =>
    request<any>(`/agents/${id}/policy-bundle-rollback`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  effectivePolicy: (id: string) => request<any>(`/agents/${id}/effective-policy`),
  knowledgeAccess: (id: string, caseId?: string) =>
    request<any>(`/agents/${id}/knowledge-access${caseId ? `?caseId=${encodeURIComponent(caseId)}` : ''}`),
  run: (id: string, caseId: string, triggerEvent = 'case_created', context = {}) =>
    request<any>(`/agents/${id}/run`, {
      method: 'POST',
      body: JSON.stringify({ caseId, triggerEvent, context }),
    }),
  trigger: (caseId: string, triggerEvent: string, agentSlug?: string, context = {}) =>
    request<any>('/agents/trigger', {
      method: 'POST',
      body: JSON.stringify({ caseId, triggerEvent, agentSlug, context }),
    }),
  config: (id: string, payload: { permissionProfile?: any; reasoningProfile?: any; safetyProfile?: any; isActive?: boolean }) =>
    request<any>(`/agents/${id}/config`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  runs: (id: string, limit = 20) => request<any>(`/agents/${id}/runs?limit=${limit}`).then(unwrapList),
};

// ── Connectors ────────────────────────────────────────────
export const connectorsApi = {
  list: () => request<any>('/connectors').then(unwrapList),
  get: (id: string) => request<any>(`/connectors/${id}`),
  update: (id: string, payload: Record<string, any>) =>
    request<any>(`/connectors/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  test: (id: string) =>
    request<any>(`/connectors/${id}/test`, {
      method: 'POST',
      body: '{}',
    }),
  delete: (id: string) =>
    request<any>(`/connectors/${id}`, {
      method: 'DELETE',
    }),
};

// ── Attachments (Supabase Storage) ───────────────────────
export const attachmentsApi = {
  upload: (payload: { name: string; type: string; dataUrl: string }) =>
    request<{ key: string; url: string; name: string; type: string; size: number }>(
      '/attachments/upload',
      { method: 'POST', body: JSON.stringify(payload) },
    ),
  resign: (key: string) =>
    request<{ key: string; url: string }>('/attachments/sign', {
      method: 'POST',
      body: JSON.stringify({ key }),
    }),
};

// ── Macros / Snippets ─────────────────────────────────────
export const macrosApi = {
  list: () => request<{ items: any[] }>('/macros').then(r => r.items || []),
  create: (payload: { label: string; body: string; shortcut?: string; shared?: boolean }) =>
    request<any>('/macros', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Partial<{ label: string; body: string; shortcut: string; shared: boolean }>) =>
    request<any>(`/macros/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  delete: (id: string) => request<any>(`/macros/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  recordUse: (id: string) => request<any>(`/macros/${encodeURIComponent(id)}/use`, { method: 'POST' }),
};

// ── AI ────────────────────────────────────────────────────
export const aiApi = {
  studio: () => request<any>('/ai/studio'),
  agents: () => request<any>('/ai/agents').then(unwrapList),
  diagnose: (caseId: string) =>
    request<any>(`/ai/diagnose/${caseId}`, { method: 'POST', body: '{}' }),
  draft: (caseId: string, tone = 'professional', additional_context = '') =>
    request<{ draft: string }>(`/ai/draft/${caseId}`, {
      method: 'POST',
      body: JSON.stringify({ tone, additional_context }),
    }),
  policyCheck: (action: string, context: Record<string, any>) =>
    request<any>('/ai/policy-check', {
      method: 'POST',
      body: JSON.stringify({ action, context }),
    }),
  copilot: (caseId: string, question: string, history: Array<{ role: string; content: string }> = []) =>
    request<any>(`/ai/copilot/${caseId}`, {
      method: 'POST',
      body: JSON.stringify({ question, history }),
    }),
  stats: () => request<any>('/ai/stats'),
};

// ── IAM & Workspaces ──────────────────────────────────────────
export const iamApi = {
  me: () => request<any>('/iam/me'),
  securityEnforcement: () => request<any>('/iam/security/enforcement'),
  accessRequestTargets: () => request<any>('/iam/access-request-targets').then(unwrapList),
  permissionsMe: () => request<any>('/iam/permissions/me'),
  permissionsCatalog: () => request<any>('/iam/permissions/catalog').then(unwrapList),
  users: () => request<any>('/iam/users').then(unwrapList),
  members: () => request<any>('/iam/members').then(unwrapList),
  teams: () => request<any>('/iam/teams').then(unwrapList),
  createTeam: (payload: { name: string; description?: string }) =>
    request<any>('/iam/teams', { method: 'POST', body: JSON.stringify(payload) }),
  deleteTeam: (teamId: string) =>
    request<any>(`/iam/teams/${teamId}`, { method: 'DELETE' }),
  roles: () => request<any>('/iam/roles').then(unwrapList),
  inviteMember: (payload: { email: string; name?: string; role_id: string }) =>
    request<any>('/iam/members/invite', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  resendInvite: (payload: { email: string; role_id: string }) =>
    request<any>('/iam/members/invite/resend', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateMember: (id: string, payload: { status?: string; role_id?: string }) =>
    request<any>(`/iam/members/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  transferOwnership: (id: string) =>
    request<any>(`/iam/members/${id}/transfer-ownership`, {
      method: 'POST',
    }),
  createRole: (payload: { name: string; permissions: string[] }) =>
    request<any>('/iam/roles', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateRole: (id: string, payload: { name?: string; permissions?: string[] }) =>
    request<any>(`/iam/roles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  // Real DELETE /iam/roles/:id (server refuses system roles and roles still
  // assigned to members with a 409). Replaces the old soft-archive PATCH hack.
  deleteRole: (id: string) =>
    request<any>(`/iam/roles/${id}`, { method: 'DELETE' }),
  updateMe: (payload: Record<string, any>) =>
    request<any>('/iam/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  uploadAvatar: (file: File | string) => {
    if (typeof file === 'string') {
      return request<{ url: string }>('/iam/me/avatar', {
        method: 'POST',
        body: JSON.stringify({ data_url: file }),
      });
    }
    return new Promise<{ url: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = String(reader.result || '');
          const res = await request<{ url: string }>('/iam/me/avatar', {
            method: 'POST',
            body: JSON.stringify({ data_url: dataUrl }),
          });
          resolve(res);
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo'));
      reader.readAsDataURL(file);
    });
  },
  changePassword: (current: string, next: string) =>
    request<{ ok: boolean }>('/iam/me/password', {
      method: 'POST',
      body: JSON.stringify({ current, next }),
    }),
  updateEmail: (current: string, email: string) =>
    request<{ ok: boolean; email: string }>('/iam/me/email', {
      method: 'POST',
      body: JSON.stringify({ current, email }),
    }),
  mySessions: () => request<any[]>('/iam/me/sessions').then(unwrapList),
  revokeSession: (id: string) =>
    request<{ ok: boolean }>(`/iam/me/sessions/${id}`, { method: 'DELETE' }),
  myActivity: (limit = 50) =>
    request<any[]>(`/iam/me/activity?limit=${encodeURIComponent(limit)}`).then(unwrapList),
  myPermissions: () => request<any>('/iam/me/permissions'),
};

export const workspacesApi = {
  list: () => request<any>('/workspaces').then(unwrapList),
  currentContext: () => request<any>('/workspaces/current/context'),
  get: (id: string) => request<any>(`/workspaces/${id}`),
  update: (id: string, payload: Record<string, any>) =>
    request<any>(`/workspaces/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  updateSettings: (id: string, settings: Record<string, any>) =>
    request<any>(`/workspaces/${id}/settings`, {
      method: 'PATCH',
      body: JSON.stringify({ settings }),
    }),
  featureFlags: (id: string) => request<any>(`/workspaces/${id}/feature-flags`),
  updateFeatureFlag: (id: string, featureKey: string, isEnabled: boolean) =>
    request<any>(`/workspaces/${id}/feature-flags/${featureKey}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_enabled: isEnabled }),
    }),
};

export const billingApi = {
  subscription: (orgId: string) => request<any>(`/billing/${orgId}/subscription`),
  ledger: (orgId: string) => request<any[]>(`/billing/${orgId}/ledger`).then(unwrapList),
  changePlan: (orgId: string, planId: string) =>
    request<any>(`/billing/${orgId}/subscription`, {
      method: 'PATCH',
      body: JSON.stringify({ plan_id: planId }),
    }),
  topUp: (orgId: string, payload: { type: 'credits' | 'seats'; quantity: number; amount_cents?: number }) =>
    request<any>(`/billing/${orgId}/top-ups`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  checkoutSession: (orgId: string, payload?: { priceId?: string; email?: string; successUrl?: string; cancelUrl?: string }) =>
    request<{ url: string; sessionId?: string }>(`/billing/${orgId}/checkout-session`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    }),
  portalSession: (orgId: string, payload?: { returnUrl?: string; email?: string }) =>
    request<{ url: string }>(`/billing/${orgId}/portal-session`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    }),
  // ── AI credits (Cluster I) ─────────────────────────────────────────────
  usage: () => request<{
    plan: string;
    periodStart: string;
    periodEnd: string;
    included: number;
    usedThisPeriod: number;
    topupBalance: number;
    flexibleEnabled: boolean;
    flexibleCap: number | null;
    flexibleUsedThisPeriod: number;
    percentUsed: number;
    unlimited: boolean;
  }>(`/billing/usage`),
  usageEvents: (limit = 50, offset = 0) =>
    request<{ events: any[]; total: number; limit: number; offset: number }>(
      `/billing/usage/events?limit=${limit}&offset=${offset}`,
    ),
  toggleFlexibleUsage: (enabled: boolean, capCredits?: number) =>
    request<any>(`/billing/flexible-usage/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled, capCredits }),
    }),
};

// ── Reports ──────────────────────────────────────────────
function buildReportParams(period: string, channel: string, dateFrom?: string, dateTo?: string): string {
  const params: Record<string, string> = { period, channel };
  if (dateFrom) params.dateFrom = dateFrom;
  if (dateTo) params.dateTo = dateTo;
  return new URLSearchParams(params).toString();
}

export const reportsApi = {
  overview: (period = '7d', channel = 'all', dateFrom?: string, dateTo?: string) =>
    request<any>(`/reports/overview?${buildReportParams(period, channel, dateFrom, dateTo)}`),
  intents: (period = '7d', channel = 'all', dateFrom?: string, dateTo?: string) =>
    request<any>(`/reports/intents?${buildReportParams(period, channel, dateFrom, dateTo)}`),
  agents: (period = '7d', channel = 'all', dateFrom?: string, dateTo?: string) =>
    request<any>(`/reports/agents?${buildReportParams(period, channel, dateFrom, dateTo)}`),
  approvals: (period = '7d', channel = 'all', dateFrom?: string, dateTo?: string) =>
    request<any>(`/reports/approvals?${buildReportParams(period, channel, dateFrom, dateTo)}`),
  costs: (period = '7d', channel = 'all', dateFrom?: string, dateTo?: string) =>
    request<any>(`/reports/costs?${buildReportParams(period, channel, dateFrom, dateTo)}`),
  sla: (period = '7d', channel = 'all', dateFrom?: string, dateTo?: string) =>
    request<any>(`/reports/sla?${buildReportParams(period, channel, dateFrom, dateTo)}`),
  summary: (period = '7d', channel = 'all', audience = 'Executive / C-Suite') =>
    request<any>(`/reports/summary?${new URLSearchParams({ period, channel, audience }).toString()}`),
  conversations: (period = '30d', channel = 'all') =>
    request<any>(`/reports/conversations?${buildReportParams(period, channel)}`),
  finagent: (period = '30d', channel = 'all') =>
    request<any>(`/reports/finagent?${buildReportParams(period, channel)}`),
  teammate: (period = '30d', channel = 'all') =>
    request<any>(`/reports/teammate?${buildReportParams(period, channel)}`),
  tickets: (period = '30d', channel = 'all') =>
    request<any>(`/reports/tickets?${buildReportParams(period, channel)}`),
  articles: (period = '30d', channel = 'all') =>
    request<any>(`/reports/articles?${buildReportParams(period, channel)}`),
  responsiveness: (period = '30d', channel = 'all') =>
    request<any>(`/reports/responsiveness?${buildReportParams(period, channel)}`),
  csat: (period = '30d', channel = 'all') =>
    request<any>(`/reports/csat?${buildReportParams(period, channel)}`),
  effectiveness: (period = '30d', channel = 'all') =>
    request<any>(`/reports/effectiveness?${buildReportParams(period, channel)}`),
  calls: (period = '30d', channel = 'all') =>
    request<any>(`/reports/calls?${buildReportParams(period, channel)}`),
  teamInbox: (period = '30d', channel = 'all') =>
    request<any>(`/reports/team-inbox?${buildReportParams(period, channel)}`),
  outbound: (period = '30d', channel = 'all') =>
    request<any>(`/reports/outbound?${buildReportParams(period, channel)}`),
};

export const operationsApi = {
  overview: () => request<any>('/operations/overview'),
  jobs: () => request<any>('/operations/jobs').then(unwrapList),
  deadLetterJobs: () => request<any>('/operations/jobs/dead-letter').then(unwrapList),
  retryJob: (id: string) =>
    request<any>(`/operations/jobs/${id}/retry`, {
      method: 'POST',
      body: '{}',
    }),
  webhooks: () => request<any>('/operations/webhooks').then(unwrapList),
  replayWebhook: (id: string) =>
    request<any>(`/operations/webhooks/${id}/replay`, {
      method: 'POST',
      body: '{}',
    }),
  canonicalEvents: () => request<any>('/operations/canonical-events').then(unwrapList),
  agentRuns: () => request<any>('/operations/agent-runs').then(unwrapList),
};

export const auditApi = {
  workspaceAll: () => request<any>('/audit/workspace/all').then(unwrapList),
  requestWorkspaceExport: (payload?: Record<string, any>) =>
    request<any>('/audit/workspace/export-request', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  requestWorkspaceDeletion: (payload?: Record<string, any>) =>
    request<any>('/audit/workspace/deletion-request', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  entity: (entityType: string, entityId: string) => request<any>(`/audit/${entityType}/${entityId}`).then(unwrapList),
};

// ── Policy Rules (AI Studio live rules CRUD) ──────────────
export const policyRulesApi = {
  list: (params?: { entity_type?: string; is_active?: boolean }) => {
    const qs = params
      ? '?' + new URLSearchParams(
          Object.fromEntries(
            Object.entries(params)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => [k, String(v)])
          )
        ).toString()
      : '';
    return request<any>(`/policy/rules${qs}`).then(unwrapList);
  },
  create: (payload: Record<string, any>) =>
    request<any>('/policy/rules', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  update: (id: string, payload: Record<string, any>) =>
    request<any>(`/policy/rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};

export const superAgentApi = {
  bootstrap: () => request<any>('/super-agent/bootstrap'),
  command: (
    input: string,
    options?: {
      runId?: string;
      mode?: string;
      autonomyLevel?: 'supervised' | 'assisted' | 'autonomous';
      model?: string;
      // Pass sessionId via context.sessionId to keep conversation memory
      // across turns. See server/routes/superAgent.ts /command.
      context?: Record<string, any>;
    },
  ) =>
    request<any>('/super-agent/command', {
      method: 'POST',
      body: JSON.stringify({ input, ...options }),
    }),
  execute: (
    payload: Record<string, any>,
    confirmed = true,
    options?: {
      runId?: string;
      sourceContext?: string;
      autonomyLevel?: 'supervised' | 'assisted' | 'autonomous';
      model?: string;
    },
  ) =>
    request<any>('/super-agent/execute', {
      method: 'POST',
      body: JSON.stringify({ payload, confirmed, ...options }),
    }),
  /**
   * Plan Engine endpoint (LLM-driven). Sends the user message and gets back
   * { response: LLMResponse, trace?: ExecutionTrace, sessionId: string }.
   */
  plan: (
    userMessage: string,
    options?: {
      sessionId?: string;
      dryRun?: boolean;
      autonomyLevel?: 'supervised' | 'assisted' | 'autonomous';
      model?: string;
      mode?: 'investigate' | 'operate' | 'plan';
    },
  ) =>
    request<any>('/super-agent/plan', {
      method: 'POST',
      body: JSON.stringify({
        input: userMessage,
        userMessage,
        sessionId: options?.sessionId,
        dryRun: options?.dryRun,
        autonomyLevel: options?.autonomyLevel,
        model: options?.model,
        mode: options?.mode || 'plan',
      }),
    }),
  session: (sessionId: string) => request<any>(`/super-agent/sessions/${encodeURIComponent(sessionId)}`),
  // Right-sidebar saved-conversations list. Server filters by req.userId so
  // each user only sees their own threads.
  listSessions: (limit = 50) =>
    request<{ sessions: Array<{ id: string; title: string; preview: string; turnCount: number; updatedAt: string; createdAt: string }>; count: number }>(
      `/super-agent/sessions?limit=${limit}`,
    ),
  deleteSession: (sessionId: string) =>
    request<{ ok: true }>(`/super-agent/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),
  renameSession: (sessionId: string, title: string) =>
    request<{ ok: true }>(`/super-agent/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  sessionTraces: (sessionId: string, limit = 20) =>
    request<any>(`/super-agent/sessions/${encodeURIComponent(sessionId)}/traces?limit=${limit}`),
  trace: (planId: string) => request<any>(`/super-agent/traces/${encodeURIComponent(planId)}`),
  replay: (sessionId: string, limit = 20) =>
    request<any>(`/super-agent/replay/${encodeURIComponent(sessionId)}?limit=${limit}`),
  metrics: (sessionId?: string) =>
    request<any>(`/super-agent/metrics${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`),
};

// ── Reconciliation ────────────────────────────────────────
export const reconciliationApi = {
  issues: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/reconciliation/issues${qs}`).then(unwrapList);
  },
  issue: (id: string) => request<any>(`/reconciliation/issues/${id}`),
  metrics: () => request<any>('/reconciliation/metrics'),
  updateStatus: (id: string, status: string, note?: string) =>
    request<any>(`/reconciliation/issues/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    }),
  resolveApply: (id: string, payload: Record<string, any>) =>
    request<any>(`/reconciliation/issues/${id}/resolve-apply`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  processOpen: (caseId?: string) =>
    request<any>('/reconciliation/process-open', {
      method: 'POST',
      body: JSON.stringify(caseId ? { case_id: caseId } : {}),
    }),
};

// ── Health ────────────────────────────────────────────────
export const healthApi = {
  check: () => request<any>('/health'),
};

// ── Companies ─────────────────────────────────────────────
export const companiesApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/companies${qs}`).then(unwrapList);
  },
  get: (id: string) => request<any>(`/companies/${id}`),
  create: (payload: Record<string, any>) =>
    request<any>('/companies', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Record<string, any>) =>
    request<any>(`/companies/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  delete: (id: string) => request<any>(`/companies/${id}`, { method: 'DELETE' }),
};

// ── Custom Attributes ─────────────────────────────────────
export const customAttributesApi = {
  list: (params?: { entityType?: string }) => {
    const qs = params?.entityType ? `?entity_type=${params.entityType}` : '';
    return request<any>(`/custom-attributes/definitions${qs}`).then(unwrapList);
  },
  create: (payload: Record<string, any>) =>
    request<any>('/custom-attributes/definitions', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Record<string, any>) =>
    request<any>(`/custom-attributes/definitions/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  delete: (id: string) =>
    request<any>(`/custom-attributes/definitions/${id}`, { method: 'DELETE' }),
};

// ── Assignment Policies ───────────────────────────────────
export const assignmentPoliciesApi = {
  list: () => request<any>('/assignment-policies').then(unwrapList),
  get: (id: string) => request<any>(`/assignment-policies/${id}`),
  create: (payload: Record<string, any>) =>
    request<any>('/assignment-policies', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Record<string, any>) =>
    request<any>(`/assignment-policies/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  delete: (id: string) =>
    request<any>(`/assignment-policies/${id}`, { method: 'DELETE' }),
};

// ── Working Hours ─────────────────────────────────────────
export const workingHoursApi = {
  get: () => request<any>('/working-hours'),
  upsert: (payload: Record<string, any>) =>
    request<any>('/working-hours', { method: 'PUT', body: JSON.stringify(payload) }),
};

// ── SLA Policies ──────────────────────────────────────────
export const slaPoliciesApi = {
  list: () => request<any>('/sla-policies').then(unwrapList),
  get: (id: string) => request<any>(`/sla-policies/${id}`),
  create: (payload: Record<string, any>) =>
    request<any>('/sla-policies', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Record<string, any>) =>
    request<any>(`/sla-policies/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  delete: (id: string) =>
    request<any>(`/sla-policies/${id}`, { method: 'DELETE' }),
  apply: (conversationId: string, policyId: string) =>
    request<any>('/sla-policies/apply', { method: 'POST', body: JSON.stringify({ conversation_id: conversationId, policy_id: policyId }) }),
};

// ── Automation Rules ──────────────────────────────────────
export const automationRulesApi = {
  list: (params?: { active?: boolean }) => {
    const qs = params?.active !== undefined ? `?active=${params.active}` : '';
    return request<any>(`/automation-rules${qs}`).then(unwrapList);
  },
  get: (id: string) => request<any>(`/automation-rules/${id}`),
  create: (payload: Record<string, any>) =>
    request<any>('/automation-rules', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Record<string, any>) =>
    request<any>(`/automation-rules/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  delete: (id: string) =>
    request<any>(`/automation-rules/${id}`, { method: 'DELETE' }),
  run: (id: string, payload?: Record<string, any>) =>
    request<any>(`/automation-rules/${id}/run`, { method: 'POST', body: JSON.stringify(payload || {}) }),
};

// ── Inboxes ───────────────────────────────────────────────
export const inboxesApi = {
  list: () => request<any>('/inboxes').then(unwrapList),
  get: (id: string) => request<any>(`/inboxes/${id}`),
  create: (payload: Record<string, any>) =>
    request<any>('/inboxes', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Record<string, any>) =>
    request<any>(`/inboxes/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  delete: (id: string) =>
    request<any>(`/inboxes/${id}`, { method: 'DELETE' }),
};

// ── Canned Responses ──────────────────────────────────────
export const cannedResponsesApi = {
  list: (params?: { search?: string }) => {
    const qs = params?.search ? `?search=${encodeURIComponent(params.search)}` : '';
    return request<any>(`/canned-responses${qs}`).then(unwrapList);
  },
  get: (id: string) => request<any>(`/canned-responses/${id}`),
  create: (payload: Record<string, any>) =>
    request<any>('/canned-responses', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Record<string, any>) =>
    request<any>(`/canned-responses/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  delete: (id: string) =>
    request<any>(`/canned-responses/${id}`, { method: 'DELETE' }),
};

// ── Email Templates ───────────────────────────────────────
export const emailTemplatesApi = {
  list: (params?: { category?: string; active?: boolean }) => {
    const p: Record<string, string> = {};
    if (params?.category) p.category = params.category;
    if (params?.active !== undefined) p.active = String(params.active);
    const qs = Object.keys(p).length ? '?' + new URLSearchParams(p).toString() : '';
    return request<any>(`/email-templates${qs}`).then(unwrapList);
  },
  get: (id: string) => request<any>(`/email-templates/${id}`),
  create: (payload: Record<string, any>) =>
    request<any>('/email-templates', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Record<string, any>) =>
    request<any>(`/email-templates/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  delete: (id: string) =>
    request<any>(`/email-templates/${id}`, { method: 'DELETE' }),
  render: (id: string, context: Record<string, string>) =>
    request<any>(`/email-templates/${id}/render`, { method: 'POST', body: JSON.stringify({ context }) }),
};

// ── Custom Filters ────────────────────────────────────────
export const customFiltersApi = {
  list: (params?: { entityType?: string }) => {
    const qs = params?.entityType ? `?entity_type=${params.entityType}` : '';
    return request<any>(`/custom-filters${qs}`).then(unwrapList);
  },
  create: (payload: Record<string, any>) =>
    request<any>('/custom-filters', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Record<string, any>) =>
    request<any>(`/custom-filters/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  delete: (id: string) =>
    request<any>(`/custom-filters/${id}`, { method: 'DELETE' }),
};

// ── Custom Roles ──────────────────────────────────────────
export const customRolesApi = {
  list: () => request<any>('/custom-roles').then(unwrapList),
  get: (id: string) => request<any>(`/custom-roles/${id}`),
  create: (payload: Record<string, any>) =>
    request<any>('/custom-roles', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Record<string, any>) =>
    request<any>(`/custom-roles/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  delete: (id: string) =>
    request<any>(`/custom-roles/${id}`, { method: 'DELETE' }),
};

// ── Notifications (user) ──────────────────────────────────
// Paths mirror server/routes/notificationsApi.ts exactly:
//   GET  /notifications/:userId            → list
//   GET  /notifications/:userId/count      → { unread }
//   PATCH /notifications/:id/read          → mark one (by notification id)
//   POST /notifications/read-all/:userId   → mark all for a user
export const notificationsApi = {
  list: (userId: string, params?: { unreadOnly?: boolean; limit?: number }) => {
    const p: Record<string, string> = {};
    if (params?.unreadOnly) p.unread_only = 'true';
    if (params?.limit) p.limit = String(params.limit);
    const qs = Object.keys(p).length ? '?' + new URLSearchParams(p).toString() : '';
    return request<any>(`/notifications/${encodeURIComponent(userId)}${qs}`).then(unwrapList);
  },
  count: (userId: string) =>
    request<{ unread: number }>(`/notifications/${encodeURIComponent(userId)}/count`),
  markRead: (notificationId: string) =>
    request<{ ok: boolean }>(`/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'PATCH' }),
  markAllRead: (userId: string) =>
    request<{ ok: boolean }>(`/notifications/read-all/${encodeURIComponent(userId)}`, { method: 'POST' }),
};

// ── Labels (etiquetas) ────────────────────────────────────
// First-class label entities managed from the Etiquetas settings screen.
export const labelsApi = {
  list: (params?: { q?: string }) => {
    const qs = params?.q ? `?q=${encodeURIComponent(params.q)}` : '';
    return request<any[]>(`/labels${qs}`).then(unwrapList);
  },
  create: (payload: { name: string; color?: string | null }) =>
    request<any>('/labels', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Partial<{ name: string; color: string | null }>) =>
    request<any>(`/labels/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  delete: (id: string) =>
    request<any>(`/labels/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ── Topics (temas) ────────────────────────────────────────
// Conversation topics managed from the Temas settings screen.
export const topicsApi = {
  list: (params?: { includeArchived?: boolean }) => {
    const qs = params?.includeArchived ? '?includeArchived=true' : '';
    return request<any[]>(`/topics${qs}`).then(unwrapList);
  },
  create: (payload: { name: string; color?: string | null }) =>
    request<any>('/topics', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Partial<{ name: string; color: string | null; archived: boolean }>) =>
    request<any>(`/topics/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  delete: (id: string) =>
    request<any>(`/topics/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ── Webhook subscriptions (Centro para desarrolladores) ────
export const webhookSubscriptionsApi = {
  list: () => request<any[]>('/webhook-subscriptions').then(unwrapList),
  create: (payload: { url: string; events?: string[]; active?: boolean }) =>
    request<any>('/webhook-subscriptions', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Partial<{ url: string; events: string[]; active: boolean }>) =>
    request<any>(`/webhook-subscriptions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  delete: (id: string) =>
    request<any>(`/webhook-subscriptions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ── Ticket types (folios de atención) ─────────────────────
export const ticketTypesApi = {
  list: () => request<any[]>('/ticket-types').then(unwrapList),
  create: (payload: { name: string; description?: string | null; icon?: string | null; category?: 'customer' | 'follow_up' | 'back_office' }) =>
    request<any>('/ticket-types', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Partial<{ name: string; description: string | null; icon: string | null; category: 'customer' | 'follow_up' | 'back_office' }>) =>
    request<any>(`/ticket-types/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  delete: (id: string) =>
    request<any>(`/ticket-types/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ── Ticket states (folios de atención) ────────────────────
type TicketStateCategory = 'submitted' | 'in_progress' | 'waiting_customer' | 'resolved';
export const ticketStatesApi = {
  list: () => request<any[]>('/ticket-states').then(unwrapList),
  create: (payload: { internal_label: string; client_label?: string | null; category?: TicketStateCategory; color?: string | null }) =>
    request<any>('/ticket-states', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Partial<{ internal_label: string; client_label: string | null; category: TicketStateCategory; color: string | null; sort_order: number }>) =>
    request<any>(`/ticket-states/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  delete: (id: string) =>
    request<any>(`/ticket-states/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  setTypes: (id: string, typeIds: string[]) =>
    request<any>(`/ticket-states/${encodeURIComponent(id)}/types`, { method: 'PUT', body: JSON.stringify({ type_ids: typeIds }) }),
};

// ── Custom object types (registro de tipos) ───────────────
// The type registry only — dynamic fields + records are a separate feature.
export const customObjectTypesApi = {
  list: () => request<any[]>('/custom-object-types').then(unwrapList),
  create: (payload: { name: string; object_key?: string; description?: string | null; icon?: string | null }) =>
    request<any>('/custom-object-types', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Partial<{ name: string; object_key: string; description: string | null; icon: string | null }>) =>
    request<any>(`/custom-object-types/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  delete: (id: string) =>
    request<any>(`/custom-object-types/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ── Custom object fields (estructura por tipo) ────────────
type CustomFieldType = 'text' | 'number' | 'boolean' | 'date' | 'select' | 'email' | 'url';
export const customObjectFieldsApi = {
  list: (objectTypeId?: string) => {
    const qs = objectTypeId ? `?object_type_id=${encodeURIComponent(objectTypeId)}` : '';
    return request<any[]>(`/custom-object-fields${qs}`).then(unwrapList);
  },
  create: (payload: { object_type_id: string; name: string; field_type?: CustomFieldType; required?: boolean }) =>
    request<any>('/custom-object-fields', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Partial<{ name: string; field_type: CustomFieldType; required: boolean }>) =>
    request<any>(`/custom-object-fields/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  delete: (id: string) =>
    request<any>(`/custom-object-fields/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ── Custom object records (datos por tipo) ────────────────
export const customObjectRecordsApi = {
  list: (objectTypeId: string) =>
    request<any[]>(`/custom-object-records?object_type_id=${encodeURIComponent(objectTypeId)}`).then(unwrapList),
  create: (objectTypeId: string, data: Record<string, any>) =>
    request<any>('/custom-object-records', { method: 'POST', body: JSON.stringify({ object_type_id: objectTypeId, data }) }),
  update: (id: string, data: Record<string, any>) =>
    request<any>(`/custom-object-records/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ data }) }),
  delete: (id: string) =>
    request<any>(`/custom-object-records/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ── Data Imports ──────────────────────────────────────────
export const dataImportsApi = {
  list: (params?: { entityType?: string; status?: string }) => {
    const p: Record<string, string> = {};
    if (params?.entityType) p.entity_type = params.entityType;
    if (params?.status) p.status = params.status;
    const qs = Object.keys(p).length ? '?' + new URLSearchParams(p).toString() : '';
    return request<any>(`/data-imports${qs}`).then(unwrapList);
  },
  get: (id: string) => request<any>(`/data-imports/${id}`),
  create: (payload: Record<string, any>) =>
    request<any>('/data-imports', { method: 'POST', body: JSON.stringify(payload) }),
  updateProgress: (id: string, payload: Record<string, any>) =>
    request<any>(`/data-imports/${id}/progress`, { method: 'PATCH', body: JSON.stringify(payload) }),
};

// ── AI Feedback ───────────────────────────────────────────
export const aiFeedbackApi = {
  list: (params?: { feedbackType?: string; limit?: number }) => {
    const p: Record<string, string> = {};
    if (params?.feedbackType) p.feedback_type = params.feedbackType;
    if (params?.limit) p.limit = String(params.limit);
    const qs = Object.keys(p).length ? '?' + new URLSearchParams(p).toString() : '';
    return request<any>(`/ai-feedback${qs}`).then(unwrapList);
  },
  submit: (payload: Record<string, any>) =>
    request<any>('/ai-feedback', { method: 'POST', body: JSON.stringify(payload) }),
};

// ── MCP Servers ───────────────────────────────────────────
export const mcpServersApi = {
  list: () => request<any>('/mcp-servers').then(unwrapList),
  get: (id: string) => request<any>(`/mcp-servers/${id}`),
  create: (payload: Record<string, any>) =>
    request<any>('/mcp-servers', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Record<string, any>) =>
    request<any>(`/mcp-servers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  delete: (id: string) =>
    request<any>(`/mcp-servers/${id}`, { method: 'DELETE' }),
};

// ── Calls (live) ──────────────────────────────────────────
export const callsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/calls${qs}`).then(unwrapList);
  },
  get: (id: string) => request<any>(`/calls/${id}`),
  stats: (params?: { agentId?: string; from?: string; to?: string }) => {
    const p: Record<string, string> = {};
    if (params?.agentId) p.agent_id = params.agentId;
    if (params?.from) p.from = params.from;
    if (params?.to) p.to = params.to;
    const qs = Object.keys(p).length ? '?' + new URLSearchParams(p).toString() : '';
    return request<any>(`/calls/stats${qs}`);
  },
  create: (payload: Record<string, any>) =>
    request<any>('/calls', { method: 'POST', body: JSON.stringify(payload) }),
  updateStatus: (id: string, payload: Record<string, any>) =>
    request<any>(`/calls/${id}/status`, { method: 'PATCH', body: JSON.stringify(payload) }),
};

// ── Mentions ──────────────────────────────────────────────
export const mentionsApi = {
  list: (userId: string, params?: { unread?: boolean }) => {
    const qs = params?.unread ? '?unread=true' : '';
    return request<any>(`/mentions/${userId}${qs}`).then(unwrapList);
  },
  markRead: (id: string) =>
    request<any>(`/mentions/${id}/read`, { method: 'PATCH' }),
};

// ── GitHub integration (per-tenant, used by AccountIntegrationsPage) ──
// Backend lives at /api/integrations/github/* (real endpoints, configured via
// GITHUB_CLIENT_ID/SECRET env vars). All operations go through these endpoints.
export interface GitHubIntegrationStatus {
  connected:           boolean;
  user_id?:            number | null;
  login?:              string | null;
  name?:               string | null;
  email?:              string | null;
  avatar_url?:         string | null;
  scope?:              string | null;
  webhooks?:           Array<{ hook_id: number; scope: 'repo' | 'org'; owner: string; repo?: string; events: string[]; url: string }>;
  capabilities?:       { reads?: string[]; writes?: string[]; events?: string[] } | null;
  last_health_check_at?: string | null;
  updated_at?:         string | null;
}

// ── Personal API keys (per-user, per-tenant) ─────────────────
// Backed by /api/personal-api-keys/* on our Express backend. Plaintext token
// value is returned ONCE at create/regenerate and never again.
export interface PersonalApiKey {
  id:                    string;
  label:                 string;
  token_prefix:          string;
  mask_value:            string;
  scopes:                string[];
  scoped_organizations:  string[];
  scoped_teams:          number[];
  last_used_at?:         string | null;
  expires_at?:           string | null;
  created_at:            string;
  updated_at:            string;
}

export const personalApiKeysApi = {
  list: () => request<any>('/personal-api-keys').then(unwrapList) as Promise<PersonalApiKey[]>,
  get:  (id: string) => request<PersonalApiKey>(`/personal-api-keys/${id}`),
  create: (payload: {
    label: string;
    scopes: string[];
    scoped_organizations?: string[];
    scoped_teams?: number[];
    expires_at?: string | null;
  }) => request<PersonalApiKey & { value: string }>('/personal-api-keys', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  update: (id: string, payload: {
    label?: string;
    scopes?: string[];
    scoped_organizations?: string[];
    scoped_teams?: number[];
    expires_at?: string | null;
  }) => request<PersonalApiKey>(`/personal-api-keys/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }),
  remove: (id: string) =>
    request<any>(`/personal-api-keys/${id}`, { method: 'DELETE' }),
  regenerate: (id: string) =>
    request<PersonalApiKey & { value: string }>(`/personal-api-keys/${id}/regenerate`, {
      method: 'POST',
    }),
};

export const githubIntegrationApi = {
  status: () => request<GitHubIntegrationStatus>('/integrations/github/status'),
  install: () => request<{ url: string; state: string }>('/integrations/github/install', {
    headers: { Accept: 'application/json' },
  }),
  disconnect: () => request<{ ok: boolean }>('/integrations/github/disconnect', { method: 'POST' }),
  repos: () => request<{ ok: boolean; repos: Array<{ id: number; full_name: string; private: boolean; description: string | null; html_url: string; default_branch: string }> }>(
    '/integrations/github/repos',
  ),
  sync: () => request<{ ok: boolean; total: number; sample: Array<{ number: number; title: string; state: string; url: string }> }>(
    '/integrations/github/sync',
    { method: 'POST' },
  ),
};

// ── Visual Flows ──────────────────────────────────────────
export const visualFlowsApi = {
  list: (params?: { status?: string }) => {
    const qs = params?.status ? `?status=${params.status}` : '';
    return request<any>(`/visual-flows${qs}`).then(unwrapList);
  },
  get: (id: string) => request<any>(`/visual-flows/${id}`),
  create: (payload: Record<string, any>) =>
    request<any>('/visual-flows', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: Record<string, any>) =>
    request<any>(`/visual-flows/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  publish: (id: string) =>
    request<any>(`/visual-flows/${id}/publish`, { method: 'POST', body: '{}' }),
  createVersion: (id: string, payload: Record<string, any>) =>
    request<any>(`/visual-flows/${id}/versions`, { method: 'POST', body: JSON.stringify(payload) }),
};

// ── Agent (Max AI) ────────────────────────────────────────
/**
 * POST a JSON body to an agent endpoint and consume its SSE stream.
 *
 * The browser EventSource API only supports GET, so we use fetch +
 * ReadableStream to post the body and still read `event:`/`data:` frames.
 * Shared by `chat` and `approve` (both stream the same event taxonomy).
 */
async function streamAgentEndpoint(
  path: string,
  payload: Record<string, unknown>,
  onEvent: (event: string, data: unknown) => void,
  signal?: AbortSignal,
): Promise<void> {
  const { data } = await (await import('./supabase')).supabase.auth.getSession();
  const token = data.session?.access_token;
  const user = data.session?.user;
  const tenantId =
    user?.app_metadata?.tenant_id || user?.user_metadata?.tenant_id ||
    (import.meta as any).env?.VITE_TENANT_ID || 'org_default';
  const workspaceId =
    user?.app_metadata?.workspace_id || user?.user_metadata?.workspace_id ||
    (import.meta as any).env?.VITE_WORKSPACE_ID || 'ws_default';

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
      'x-workspace-id': workspaceId,
      'x-user-id': user?.id ?? 'system',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Agent error ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    let eventName = 'message';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventName = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const raw = line.slice(6).trim();
        try {
          onEvent(eventName, JSON.parse(raw));
        } catch {
          onEvent(eventName, raw);
        }
        eventName = 'message';
      }
    }
  }
}

// ── Fin AI Agent (customer-facing autonomous support agent) ───────────────────
// Backend: server/routes/finApi.ts · spec: docs/fin-ai-agent-spec.md
export interface FinGuidancePiece {
  id: string;
  category: 'communication_style' | 'context_clarification' | 'content_sources' | 'spam_filtering' | 'other';
  text: string;
  active: boolean;
}

export const finApi = {
  getConfig: () => request<{ data: any }>('/fin/config').then((r) => r.data ?? r),
  patchConfig: (patch: Record<string, any>) =>
    request<{ data: any }>('/fin/config', { method: 'PATCH', body: JSON.stringify(patch) }).then((r) => r.data ?? r),

  listGuidance: () => request<{ data: FinGuidancePiece[] }>('/fin/guidance').then((r) => r.data ?? []),
  createGuidance: (payload: { category: FinGuidancePiece['category']; text: string; active?: boolean }) =>
    request<{ data: FinGuidancePiece }>('/fin/guidance', { method: 'POST', body: JSON.stringify(payload) }).then((r) => r.data),
  updateGuidance: (id: string, payload: Partial<Omit<FinGuidancePiece, 'id'>>) =>
    request<{ data: FinGuidancePiece }>(`/fin/guidance/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }).then((r) => r.data),
  deleteGuidance: (id: string) =>
    request<any>(`/fin/guidance/${id}`, { method: 'DELETE' }),
  optimizeGuidance: (text: string) =>
    request<{ data: { text: string } }>('/fin/guidance/optimize', { method: 'POST', body: JSON.stringify({ text }) }).then((r) => (r as any).data?.text ?? (r as any).text ?? text),

  preview: (question: string) =>
    request<{ data: any }>('/fin/preview', { method: 'POST', body: JSON.stringify({ question }) }).then((r) => r.data),
  getRun: (caseId: string) =>
    request<{ data: any }>(`/fin/runs/${caseId}`).then((r) => r.data),
  listGaps: (status?: string) =>
    request<{ data: any[] }>(`/fin/gaps${status ? `?status=${status}` : ''}`).then((r) => r.data ?? []),
  listOutcomes: () =>
    request<{ data: any[] }>('/fin/outcomes').then((r) => r.data ?? []),

  // ── F4: Procedures + Connectors ─────────────────────────────
  listProcedures: () => request<{ data: any[] }>('/fin/procedures').then((r) => r.data ?? []),
  createProcedure: (payload: { name: string; description?: string; trigger_criteria?: string; steps?: any[] }) =>
    request<{ data: any }>('/fin/procedures', { method: 'POST', body: JSON.stringify(payload) }).then((r) => r.data),
  updateProcedure: (id: string, payload: Record<string, any>) =>
    request<{ data: any }>(`/fin/procedures/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }).then((r) => r.data),
  archiveProcedure: (id: string) =>
    request<any>(`/fin/procedures/${id}`, { method: 'DELETE' }),
  publishProcedure: (id: string) =>
    request<{ data: any }>(`/fin/procedures/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'live' }) }).then((r) => r.data),

  listConnectors: () => request<{ data: any[] }>('/fin/connectors').then((r) => r.data ?? []),
  createConnector: (payload: { name: string; kind: 'internal' | 'http'; base_url?: string | null; auth?: Record<string, string>; active?: boolean }) =>
    request<{ data: any }>('/fin/connectors', { method: 'POST', body: JSON.stringify(payload) }).then((r) => r.data),
  createConnectorAction: (connectorId: string, payload: Record<string, any>) =>
    request<{ data: any }>(`/fin/connectors/${connectorId}/actions`, { method: 'POST', body: JSON.stringify(payload) }).then((r) => r.data),
  updateConnectorAction: (id: string, payload: Record<string, any>) =>
    request<{ data: any }>(`/fin/actions/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }).then((r) => r.data),

  listPendingActions: (status?: string) =>
    request<{ data: any[] }>(`/fin/pending-actions${status ? `?status=${status}` : ''}`).then((r) => r.data ?? []),
  decidePendingAction: (id: string, decision: 'approve' | 'reject') =>
    request<{ data: any }>(`/fin/pending-actions/${id}/${decision}`, { method: 'POST' }).then((r) => r.data),

  sendDraft: (messageId: string) =>
    request<{ data: any }>(`/fin/drafts/${messageId}/send`, { method: 'POST' }).then((r) => r.data),
  discardDraft: (messageId: string) =>
    request<any>(`/fin/drafts/${messageId}/discard`, { method: 'POST' }),

  // Knowledge indexing (make UI content retrievable by Fin)
  knowledgeStatus: () =>
    request<{ data: { indexed_chunks: number } }>('/fin/knowledge-status').then((r) => r.data),
  reindexKnowledge: () =>
    request<{ data: { articles: number; chunks: number; embedded: number } }>('/fin/reindex', { method: 'POST' }).then((r) => r.data),
};

export const agentApi = {
  chat: (
    payload: { message: string; conversationId?: string; context?: Record<string, unknown> },
    onEvent: (event: string, data: unknown) => void,
    signal?: AbortSignal,
  ): Promise<void> => streamAgentEndpoint('/agent/chat', payload, onEvent, signal),

  // Situational awareness snapshot for the briefing panel.
  getSituation: () =>
    request<{ ok: boolean; situation: any }>('/agent/situation'),

  listConversations: () =>
    request<{ ok: boolean; conversations: any[] }>('/agent/conversations'),

  getConversation: (id: string) =>
    request<{ ok: boolean; conversation: any; messages: any[] }>(`/agent/conversations/${id}`),

  // Auditable execution timeline for a conversation (per-turn traces + metrics).
  getTrace: (id: string) =>
    request<{ ok: boolean; traces: any[]; metrics: any }>(`/agent/conversations/${id}/trace`),

  deleteConversation: (id: string) =>
    request<{ ok: boolean }>(`/agent/conversations/${id}`, { method: 'DELETE' }),

  /**
   * Approve or reject a dangerous operation the agent proposed. Streams the
   * resumed loop over SSE (same event taxonomy as `chat`) — do NOT re-send the
   * user's message; the backend resumes from the persisted checkpoint.
   */
  approve: (
    payload: { proposalId: string; action: 'approve' | 'reject'; feedback?: string; conversationId: string },
    onEvent: (event: string, data: unknown) => void,
    signal?: AbortSignal,
  ): Promise<void> => streamAgentEndpoint('/agent/chat/approve', payload, onEvent, signal),
};
