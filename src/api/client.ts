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
  get: (id: string) => request<any>(`/cases/${id}`),
  state: (id: string) => request<any>(`/cases/${id}/state`),
  graph: (id: string) => request<any>(`/cases/${id}/graph`),
  resolve: (id: string) => request<any>(`/cases/${id}/resolve`),
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
  reply: (id: string, content: string, draft_reply_id?: string) =>
    request<any>(`/cases/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content, draft_reply_id }),
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
  get: (id: string) => request<any>(`/customers/${id}`),
  state: (id: string) => request<any>(`/customers/${id}/state`),
};

// ── Orders ────────────────────────────────────────────────
export const ordersApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/orders${qs}`).then(unwrapList);
  },
  get: (id: string) => request<any>(`/orders/${id}`),
  context: (id: string) => request<any>(`/orders/${id}/context`),
};

// ── Payments ─────────────────────────────────────────────
export const paymentsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/payments${qs}`).then(unwrapList);
  },
  get: (id: string) => request<any>(`/payments/${id}`),
  context: (id: string) => request<any>(`/payments/${id}/context`),
};

// ── Returns ──────────────────────────────────────────────
export const returnsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/returns${qs}`).then(unwrapList);
  },
  get: (id: string) => request<any>(`/returns/${id}`),
  context: (id: string) => request<any>(`/returns/${id}/context`),
};

// ── Approvals ─────────────────────────────────────────────
export const approvalsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/approvals${qs}`).then(unwrapList);
  },
  get: (id: string) => request<any>(`/approvals/${id}`),
  context: (id: string) => request<any>(`/approvals/${id}/context`),
  decide: (id: string, decision: 'approved' | 'rejected', note?: string, decided_by?: string) =>
    request<any>(`/approvals/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify({ decision, note, decided_by }),
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
  recentRuns: () => request<any>('/workflows/runs/recent').then(unwrapList),
};

// ── Agents ────────────────────────────────────────────────
export const agentsApi = {
  list: () => request<any>('/agents').then(unwrapList),
  get: (id: string) => request<any>(`/agents/${id}`),
  policyDraft: (id: string) => request<any>(`/agents/${id}/policy-bundle:draft`),
  updatePolicyDraft: (id: string, payload: Record<string, any>) =>
    request<any>(`/agents/${id}/policy-bundle:draft`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  publishPolicyDraft: (id: string, payload: Record<string, any> = {}) =>
    request<any>(`/agents/${id}/policy-bundle:publish`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  rollbackPolicy: (id: string, payload: Record<string, any> = {}) =>
    request<any>(`/agents/${id}/policy-bundle:rollback`, {
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
  users: () => request<any>('/iam/users').then(unwrapList),
};

export const workspacesApi = {
  list: () => request<any>('/workspaces').then(unwrapList),
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

// ── Health ────────────────────────────────────────────────
export const healthApi = {
  check: () => request<any>('/health'),
};
