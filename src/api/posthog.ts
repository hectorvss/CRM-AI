/**
 * PostHog API Client
 * ─────────────────
 * Single module for all communication with the self-hosted PostHog instance.
 *
 * Config via .env:
 *   VITE_POSTHOG_HOST              = https://your-oracle-posthog.com
 *   VITE_POSTHOG_PERSONAL_API_KEY  = phx_xxxxxxxxxxxxxxxxxxxxxx
 *
 * Bootstrap:
 *   Call bootstrapPostHog() once on app mount. It fetches /api/users/@me/
 *   and stores the teamId + projectId used by all subsequent calls.
 *
 * Usage:
 *   import { posthog, bootstrapPostHog, getTeamId, getProjectId } from './posthog'
 *   const flags = await posthog.featureFlags.list()
 */

const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string) ?? ''
const POSTHOG_KEY  = (import.meta.env.VITE_POSTHOG_PERSONAL_API_KEY as string) ?? ''

// ── Internal state ────────────────────────────────────────────────────────────
let _teamId:    number | null = null
let _projectId: number | null = null
let _orgId:     string | null = null
let _user:      any    | null = null

export function getTeamId():    number | null { return _teamId    }
export function getProjectId(): number | null { return _projectId }
export function getOrgId():     string | null { return _orgId     }
export function getCurrentUser(): any | null  { return _user      }

// ── Bootstrap ─────────────────────────────────────────────────────────────────
export async function bootstrapPostHog(): Promise<{
  user: any
  teamId: number
  projectId: number
  orgId: string
}> {
  const user = await phGet<any>('/api/users/@me/')
  _user      = user
  _teamId    = user.team?.id            ?? null
  _projectId = user.team?.project_id    ?? user.team?.id ?? null
  _orgId     = user.organization?.id    ?? null
  return {
    user,
    teamId:    _teamId!,
    projectId: _projectId!,
    orgId:     _orgId!,
  }
}

// ── Auth headers ──────────────────────────────────────────────────────────────
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization:  `Bearer ${POSTHOG_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

// ── HTTP primitives ───────────────────────────────────────────────────────────
export async function phGet<T = any>(
  path: string,
  params?: Record<string, any>,
): Promise<T> {
  const url = new URL(`${POSTHOG_HOST}${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    })
  }
  const res = await fetch(url.toString(), { headers: authHeaders() })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw Object.assign(new Error(`PostHog ${res.status}: ${body}`), { status: res.status })
  }
  return res.json() as T
}

export async function phPost<T = any>(path: string, data?: any): Promise<T> {
  const res = await fetch(`${POSTHOG_HOST}${path}`, {
    method:  'POST',
    headers: authHeaders(),
    body:    data !== undefined ? JSON.stringify(data) : undefined,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw Object.assign(new Error(`PostHog ${res.status}: ${body}`), { status: res.status })
  }
  return res.json() as T
}

export async function phPatch<T = any>(path: string, data: any): Promise<T> {
  const res = await fetch(`${POSTHOG_HOST}${path}`, {
    method:  'PATCH',
    headers: authHeaders(),
    body:    JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw Object.assign(new Error(`PostHog ${res.status}: ${body}`), { status: res.status })
  }
  return res.json() as T
}

export async function phDelete(path: string): Promise<void> {
  const res = await fetch(`${POSTHOG_HOST}${path}`, {
    method:  'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok && res.status !== 204) {
    const body = await res.text().catch(() => '')
    throw Object.assign(new Error(`PostHog ${res.status}: ${body}`), { status: res.status })
  }
}

// ── SSE Streaming (Max AI) ────────────────────────────────────────────────────
export interface SSEEvent {
  type: string
  data: any
}

export async function phStream(
  path: string,
  data: any,
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${POSTHOG_HOST}${path}`, {
    method:  'POST',
    headers: { ...authHeaders(), Accept: 'text/event-stream' },
    body:    JSON.stringify(data),
    signal,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw Object.assign(new Error(`PostHog stream ${res.status}: ${body}`), { status: res.status })
  }

  const reader  = res.body?.getReader()
  if (!reader) return

  const decoder = new TextDecoder()
  let   buffer  = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE spec: events are separated by double newlines
      const rawEvents = buffer.split(/\n\n/)
      buffer = rawEvents.pop() ?? ''

      for (const raw of rawEvents) {
        if (!raw.trim()) continue
        let eventType = 'message'
        let eventData = ''

        for (const line of raw.split('\n')) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            eventData = line.slice(5).trim()
          }
        }

        if (eventData && eventData !== '[DONE]') {
          try {
            onEvent({ type: eventType, data: JSON.parse(eventData) })
          } catch {
            onEvent({ type: eventType, data: eventData })
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// ── API namespace ─────────────────────────────────────────────────────────────
/**
 * High-level API object — all methods auto-resolve teamId/projectId from
 * the bootstrap call. Call bootstrapPostHog() before using these.
 */
export const posthog = {
  // ── User ──────────────────────────────────────────────────────────────────
  user: {
    me: () => phGet('/api/users/@me/'),
  },

  // ── Dashboards ────────────────────────────────────────────────────────────
  dashboards: {
    list: (params?: any) =>
      phGet(`/api/projects/${_projectId}/dashboards/`, params),
    get: (id: number) =>
      phGet(`/api/projects/${_projectId}/dashboards/${id}/`),
    create: (data: any) =>
      phPost(`/api/projects/${_projectId}/dashboards/`, data),
    update: (id: number, data: any) =>
      phPatch(`/api/projects/${_projectId}/dashboards/${id}/`, data),
    delete: (id: number) =>
      phDelete(`/api/projects/${_projectId}/dashboards/${id}/`),
  },

  // ── Feature Flags ─────────────────────────────────────────────────────────
  featureFlags: {
    list: (params?: any) =>
      phGet(`/api/projects/${_projectId}/feature_flags/`, params),
    get: (id: number) =>
      phGet(`/api/projects/${_projectId}/feature_flags/${id}/`),
    create: (data: any) =>
      phPost(`/api/projects/${_projectId}/feature_flags/`, data),
    update: (id: number, data: any) =>
      phPatch(`/api/projects/${_projectId}/feature_flags/${id}/`, data),
    delete: (id: number) =>
      phDelete(`/api/projects/${_projectId}/feature_flags/${id}/`),
    activity: (id: number) =>
      phGet(`/api/projects/${_projectId}/feature_flags/${id}/activity/`),
  },

  // ── Experiments ───────────────────────────────────────────────────────────
  experiments: {
    list: (params?: any) =>
      phGet(`/api/projects/${_projectId}/experiments/`, params),
    get: (id: number) =>
      phGet(`/api/projects/${_projectId}/experiments/${id}/`),
    create: (data: any) =>
      phPost(`/api/projects/${_projectId}/experiments/`, data),
    update: (id: number, data: any) =>
      phPatch(`/api/projects/${_projectId}/experiments/${id}/`, data),
    savedMetrics: {
      list: () =>
        phGet(`/api/projects/${_projectId}/experiment_saved_metrics/`),
      create: (data: any) =>
        phPost(`/api/projects/${_projectId}/experiment_saved_metrics/`, data),
    },
    holdouts: {
      list: () =>
        phGet(`/api/projects/${_projectId}/experiment_holdouts/`),
      create: (data: any) =>
        phPost(`/api/projects/${_projectId}/experiment_holdouts/`, data),
    },
  },

  // ── Surveys ───────────────────────────────────────────────────────────────
  surveys: {
    list: (params?: any) =>
      phGet(`/api/projects/${_projectId}/surveys/`, params),
    get: (id: string) =>
      phGet(`/api/projects/${_projectId}/surveys/${id}/`),
    create: (data: any) =>
      phPost(`/api/projects/${_projectId}/surveys/`, data),
    update: (id: string, data: any) =>
      phPatch(`/api/projects/${_projectId}/surveys/${id}/`, data),
    delete: (id: string) =>
      phDelete(`/api/projects/${_projectId}/surveys/${id}/`),
  },

  // ── Notebooks ─────────────────────────────────────────────────────────────
  notebooks: {
    list: (params?: any) =>
      phGet(`/api/projects/${_projectId}/notebooks/`, params),
    get: (shortId: string) =>
      phGet(`/api/projects/${_projectId}/notebooks/${shortId}/`),
    create: (data: any) =>
      phPost(`/api/projects/${_projectId}/notebooks/`, data),
    update: (shortId: string, data: any) =>
      phPatch(`/api/projects/${_projectId}/notebooks/${shortId}/`, data),
    delete: (shortId: string) =>
      phDelete(`/api/projects/${_projectId}/notebooks/${shortId}/`),
  },

  // ── Insights ──────────────────────────────────────────────────────────────
  insights: {
    list: (params?: any) =>
      phGet(`/api/environments/${_teamId}/insights/`, params),
    query: (data: any) =>
      phPost(`/api/environments/${_teamId}/query/`, data),
  },

  // ── Persons ───────────────────────────────────────────────────────────────
  persons: {
    list: (params?: any) =>
      phGet(`/api/environments/${_teamId}/persons/`, params),
    get: (id: string) =>
      phGet(`/api/environments/${_teamId}/persons/${id}/`),
  },

  // ── Session Recordings ────────────────────────────────────────────────────
  recordings: {
    list: (params?: any) =>
      phGet(`/api/environments/${_teamId}/session_recordings/`, params),
    get: (id: string) =>
      phGet(`/api/environments/${_teamId}/session_recordings/${id}/`),
  },

  // ── Hog Functions (Web Scripts, Workflows, Destinations) ─────────────────
  hogFunctions: {
    list: (params?: any) =>
      phGet(`/api/projects/${_projectId}/hog_functions/`, params),
    get: (id: string) =>
      phGet(`/api/projects/${_projectId}/hog_functions/${id}/`),
    create: (data: any) =>
      phPost(`/api/projects/${_projectId}/hog_functions/`, data),
    update: (id: string, data: any) =>
      phPatch(`/api/projects/${_projectId}/hog_functions/${id}/`, data),
    delete: (id: string) =>
      phDelete(`/api/projects/${_projectId}/hog_functions/${id}/`),
  },

  // ── Conversations / Support ───────────────────────────────────────────────
  conversations: {
    list: (params?: any) =>
      phGet(`/api/environments/${_teamId}/conversations/`, params),
    get: (id: string) =>
      phGet(`/api/environments/${_teamId}/conversations/${id}/`),
    update: (id: string, data: any) =>
      phPatch(`/api/environments/${_teamId}/conversations/${id}/`, data),
  },

  // ── Max AI ────────────────────────────────────────────────────────────────
  max: {
    /**
     * Stream a conversation with Max AI.
     * Calls onEvent for each SSE chunk received.
     * Pass an AbortController signal to cancel mid-stream.
     *
     * Event types (from PostHog's AssistantEventType):
     *   'conversation'  → { id, status }
     *   'message'       → RootAssistantMessage (human or ai)
     *   'status'        → { type: 'generation_status', status: 'thinking'|'completed' }
     */
    stream: (
      data: {
        content: string | null
        conversation?: string | null
        trace_id: string
        agent_mode?: string | null
      },
      onEvent: (event: SSEEvent) => void,
      signal?: AbortSignal,
    ) => phStream(`/api/environments/${_teamId}/conversations/`, data, onEvent, signal),

    listConversations: () =>
      phGet(`/api/environments/${_teamId}/conversations/`),
  },

  // ── Team settings ─────────────────────────────────────────────────────────
  team: {
    get: () =>
      phGet(`/api/environments/${_teamId}/`),
    update: (data: any) =>
      phPatch(`/api/environments/${_teamId}/`, data),
  },

  // ── Organization ──────────────────────────────────────────────────────────
  organization: {
    get: () =>
      phGet(`/api/organizations/@current/`),
    members: () =>
      phGet(`/api/organizations/@current/members/`),
  },

  // ── Actions ───────────────────────────────────────────────────────────────
  actions: {
    list: (params?: any) =>
      phGet(`/api/projects/${_projectId}/actions/`, params),
  },

  // ── Cohorts ───────────────────────────────────────────────────────────────
  cohorts: {
    list: () =>
      phGet(`/api/projects/${_projectId}/cohorts/`),
    create: (data: any) =>
      phPost(`/api/projects/${_projectId}/cohorts/`, data),
    update: (id: number, data: any) =>
      phPatch(`/api/projects/${_projectId}/cohorts/${id}/`, data),
    delete: (id: number) =>
      phDelete(`/api/projects/${_projectId}/cohorts/${id}/`),
  },

  // ── Event definitions ─────────────────────────────────────────────────────
  eventDefinitions: {
    list: (params?: any) =>
      phGet(`/api/environments/${_teamId}/event_definitions/`, params),
  },

  // ── Property definitions ──────────────────────────────────────────────────
  propertyDefinitions: {
    list: (params?: any) =>
      phGet(`/api/environments/${_teamId}/property_definitions/`, params),
  },

  // ── Raw events (live tail + classic API) ──────────────────────────────────
  events: {
    /** Classic events endpoint — supports `after` ISO timestamp for live tail. */
    list: (params?: any) =>
      phGet(`/api/environments/${_teamId}/events/`, params),
    get: (id: string) =>
      phGet(`/api/environments/${_teamId}/events/${id}/`),
    /** HogQL EventsQuery — full power, supports filters/ordering/select. */
    query: (data: any) =>
      phPost(`/api/environments/${_teamId}/query/`, data),
  },

  // ── Sessions (via query endpoint) ─────────────────────────────────────────
  sessions: {
    /** Run a HogQL query that selects from the `sessions` table. */
    query: (data: any) =>
      phPost(`/api/environments/${_teamId}/query/`, data),
  },

  // ── Generic query runner (HogQL / EventsQuery / ActorsQuery / etc.) ──────
  query: (data: any) =>
    phPost(`/api/environments/${_teamId}/query/`, data),

  // ── Error tracking ────────────────────────────────────────────────────────
  errorTracking: {
    list: (params?: any) =>
      phGet(`/api/environments/${_teamId}/error_tracking/`, params),
    get: (id: string) =>
      phGet(`/api/environments/${_teamId}/error_tracking/${id}/`),
    update: (id: string, data: any) =>
      phPatch(`/api/environments/${_teamId}/error_tracking/${id}/`, data),
  },
}

export default posthog
