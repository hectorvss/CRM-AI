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
  get: (id: string) => request<any>(`/cases/${id}`),
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
  get: (id: string) => request<any>(`/approvals/${id}`),
  decide: (id: string, decision: 'approved' | 'rejected', note?: string, decided_by?: string) =>
    request<any>(`/approvals/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify({ decision, note, decided_by }),
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
  runs: (id: string, limit = 20) => request<any[]>(`/agents/${id}/runs?limit=${limit}`),
};

// ── Connectors ────────────────────────────────────────────
export const connectorsApi = {
  list: () => request<any[]>('/connectors'),
  get: (id: string) => request<any>(`/connectors/${id}`),
};

// ── AI ────────────────────────────────────────────────────
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
};

export const workspacesApi = {
  list: () => request<any[]>('/workspaces'),
  get: (id: string) => request<any>(`/workspaces/${id}`),
};

// ── Reports ──────────────────────────────────────────────
export const reportsApi = {
  overview: (period = '7d') => request<any>(`/reports/overview?period=${period}`),
  intents: (period = '7d') => request<any>(`/reports/intents?period=${period}`),
  agents: (period = '7d') => request<any>(`/reports/agents?period=${period}`),
  approvals: (period = '7d') => request<any>(`/reports/approvals?period=${period}`),
  costs: (period = '7d') => request<any>(`/reports/costs?period=${period}`),
  sla: (period = '7d') => request<any>(`/reports/sla?period=${period}`),
};

// ── Health ────────────────────────────────────────────────
export const healthApi = {
  check: () => request<any>('/health'),
};
