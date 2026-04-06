/**
 * CRM AI — API Client
 * All frontend ↔ backend communication goes through this module.
 */

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

// ── Cases ─────────────────────────────────────────────────
export const casesApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/cases${qs}`);
  },
  create: (payload: Record<string, any>) =>
    request<any>('/cases', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  get: (id: string) => request<any>(`/cases/${id}`),
  notes: (id: string) => request<any[]>(`/cases/${id}/notes`),
  timeline: (id: string) => request<any[]>(`/cases/${id}/timeline`),
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
  drafts: {
    list: (id: string) => request<any[]>(`/cases/${id}/drafts`),
    create: (id: string, content: string, citations?: string[], generated_by?: string) =>
      request<any>(`/cases/${id}/drafts`, {
        method: 'POST',
        body: JSON.stringify({ content, citations, generated_by }),
      }),
    updateStatus: (id: string, draftId: string, status: 'pending_review' | 'approved' | 'rejected' | 'sent', reviewed_by?: string) =>
      request<any>(`/cases/${id}/drafts/${draftId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reviewed_by }),
      }),
  },
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
    return request<any[]>(`/customers${qs}`);
  },
  get: (id: string) => request<any>(`/customers/${id}`),
};

// ── Orders ────────────────────────────────────────────────
export const ordersApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/orders${qs}`);
  },
  get: (id: string) => request<any>(`/orders/${id}`),
};

// ── Payments ─────────────────────────────────────────────
export const paymentsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/payments${qs}`);
  },
  get: (id: string) => request<any>(`/payments/${id}`),
};

// ── Returns ──────────────────────────────────────────────
export const returnsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/returns${qs}`);
  },
  get: (id: string) => request<any>(`/returns/${id}`),
};

// ── Approvals ─────────────────────────────────────────────
export const approvalsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/approvals${qs}`);
  },
  queue: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/approvals/queue${qs}`);
  },
  metrics: () => request<any>('/approvals/metrics'),
  get: (id: string) => request<any>(`/approvals/${id}`),
  decide: (id: string, decision: 'approved' | 'rejected', note?: string, decided_by?: string) =>
    request<any>(`/approvals/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify({ decision, note, decided_by }),
    }),
  bulkDecide: (approval_ids: string[], decision: 'approved' | 'rejected', note?: string, decided_by?: string) =>
    request<any>('/approvals/bulk-decide', {
      method: 'POST',
      body: JSON.stringify({ approval_ids, decision, note, decided_by }),
    }),
  processExpirations: () =>
    request<any>('/approvals/process-expirations', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  delegate: (id: string, payload: { assigned_to?: string; required_role?: string; note?: string }) =>
    request<any>(`/approvals/${id}/delegate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

// ── Knowledge ─────────────────────────────────────────────
export const knowledgeApi = {
  listArticles: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/knowledge/articles${qs}`);
  },
  getArticle: (id: string) => request<any>(`/knowledge/articles/${id}`),
  listDomains: () => request<any[]>('/knowledge/domains'),
  listPolicies: () => request<any[]>('/knowledge/policies'),
};

// ── Workflows ─────────────────────────────────────────────
export const workflowsApi = {
  list: () => request<any[]>('/workflows'),
  get: (id: string) => request<any>(`/workflows/${id}`),
  recentRuns: () => request<any[]>('/workflows/runs/recent'),
};

// ── Agents ────────────────────────────────────────────────
export const agentsApi = {
  list: () => request<any[]>('/agents'),
  get: (id: string) => request<any>(`/agents/${id}`),
};

// ── Connectors ────────────────────────────────────────────
export const connectorsApi = {
  list: () => request<any[]>('/connectors'),
  get: (id: string) => request<any>(`/connectors/${id}`),
  events: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/connectors/events${qs}`);
  },
  getEvent: (id: string) => request<any>(`/connectors/events/${id}`),
  ingestWebhook: (system: string, payload: Record<string, any>) =>
    request<any>(`/connectors/webhooks/${system}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  identityReviews: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/connectors/identity-reviews${qs}`);
  },
  decideIdentityReview: (id: string, status: 'approved' | 'rejected', resolved_customer_id?: string) =>
    request<any>(`/connectors/identity-reviews/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, resolved_customer_id }),
    }),
  sourceOfTruthRules: () => request<any[]>('/connectors/source-of-truth/rules'),
  updateSourceOfTruthRule: (
    entityType: 'order' | 'payment' | 'refund' | 'return',
    payload: {
      preferred_system: string;
      fallback_system?: string | null;
      confidence_threshold?: number;
      rule_priority?: number;
      is_active?: boolean;
    },
  ) =>
    request<any>(`/connectors/source-of-truth/rules/${entityType}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
};

// ── AI ────────────────────────────────────────────────────
export const reconciliationApi = {
  listIssues: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/reconciliation/issues${qs}`);
  },
  getIssue: (id: string) => request<any>(`/reconciliation/issues/${id}`),
  updateIssueStatus: (
    id: string,
    payload: {
      status: 'open' | 'in_progress' | 'resolved' | 'ignored' | 'escalated';
      resolution_plan?: string;
      expected_state?: string;
    },
  ) =>
    request<any>(`/reconciliation/issues/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  resolveAndApply: (id: string, payload?: { target_status?: string; reason?: string }) =>
    request<any>(`/reconciliation/issues/${id}/resolve-apply`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),
  processOpen: (limit?: number) =>
    request<any>('/reconciliation/process-open', {
      method: 'POST',
      body: JSON.stringify({ limit }),
    }),
  metrics: () => request<any>('/reconciliation/metrics'),
};

export const policyApi = {
  rules: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/policy/rules${qs}`);
  },
  createRule: (payload: Record<string, any>) =>
    request<any>('/policy/rules', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateRule: (id: string, payload: Record<string, any>) =>
    request<any>(`/policy/rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  evaluate: (payload: {
    entity_type: string;
    action_type?: string;
    case_id?: string;
    context: Record<string, any>;
  }) =>
    request<any>('/policy/evaluate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  evaluateAndRoute: (payload: {
    entity_type: string;
    action_type?: string;
    case_id?: string;
    context: Record<string, any>;
    action_payload?: Record<string, any>;
    requested_by?: string;
    requested_by_type?: 'agent' | 'human';
    risk_level?: 'low' | 'medium' | 'high' | 'critical';
  }) =>
    request<any>('/policy/evaluate-and-route', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  evaluations: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any[]>(`/policy/evaluations${qs}`);
  },
  metrics: () => request<any>('/policy/metrics'),
};

export const aiApi = {
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
  stats: () => request<any>('/ai/stats'),
};

// ── IAM & Workspaces ──────────────────────────────────────────
export const iamApi = {
  me: () => request<any>('/iam/me'),
  users: () => request<any[]>('/iam/users'),
  login: (email: string, tenant_id: string, workspace_id: string) =>
    request<any>('/iam/sessions/login', {
      method: 'POST',
      body: JSON.stringify({ email, tenant_id, workspace_id }),
    }),
  logout: (token: string) =>
    request<any>('/iam/sessions/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }),
};

export const workspacesApi = {
  list: () => request<any[]>('/workspaces'),
  get: (id: string) => request<any>(`/workspaces/${id}`),
  featureFlags: (id: string) => request<any>(`/workspaces/${id}/feature-flags`),
  updateFeatureFlag: (id: string, featureKey: string, is_enabled: boolean) =>
    request<any>(`/workspaces/${id}/feature-flags/${featureKey}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_enabled }),
    }),
};

// ── Health ────────────────────────────────────────────────
export const healthApi = {
  check: () => request<any>('/health'),
};
