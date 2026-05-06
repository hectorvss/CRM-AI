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
  updateMe: (payload: Record<string, any>) =>
    request<any>('/iam/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
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
