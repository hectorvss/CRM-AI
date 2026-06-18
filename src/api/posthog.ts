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
    duplicate: (id: number) =>
      phPost(`/api/projects/${_projectId}/dashboards/${id}/duplicate/`, {}),
    activity: (id: number, params?: any) =>
      phGet(`/api/projects/${_projectId}/dashboards/${id}/activity/`, params),
    collaborators: (id: number) =>
      phGet(`/api/projects/${_projectId}/dashboards/${id}/collaborators/`),
    addCollaborator: (id: number, data: any) =>
      phPost(`/api/projects/${_projectId}/dashboards/${id}/collaborators/`, data),
    removeCollaborator: (id: number, userUuid: string) =>
      phDelete(`/api/projects/${_projectId}/dashboards/${id}/collaborators/${userUuid}/`),
    sharing: (id: number) =>
      phGet(`/api/projects/${_projectId}/dashboards/${id}/sharing/`),
    setSharing: (id: number, data: any) =>
      phPatch(`/api/projects/${_projectId}/dashboards/${id}/sharing/`, data),
    subscriptions: {
      list:   (dashId: number)               => phGet(`/api/projects/${_projectId}/dashboards/${dashId}/subscriptions/`),
      create: (dashId: number, data: any)    => phPost(`/api/projects/${_projectId}/dashboards/${dashId}/subscriptions/`, data),
      update: (dashId: number, id: number, data: any) => phPatch(`/api/projects/${_projectId}/dashboards/${dashId}/subscriptions/${id}/`, data),
      remove: (dashId: number, id: number)   => phDelete(`/api/projects/${_projectId}/dashboards/${dashId}/subscriptions/${id}/`),
    },
  },

  // ── Dashboard tiles (text cards, layouts, per-tile filter overrides) ─────
  dashboardTiles: {
    update:      (dashId: number, tileId: number, data: any) => phPatch(`/api/projects/${_projectId}/dashboards/${dashId}/move_tile/`, { tile_id: tileId, ...data }),
    saveLayouts: (dashId: number, tiles: any[]) => phPatch(`/api/projects/${_projectId}/dashboards/${dashId}/`, { tiles }),
    addText:     (dashId: number, body: string) => phPatch(`/api/projects/${_projectId}/dashboards/${dashId}/`, { tiles: [{ type: 'TEXT', text: { body } }] }),
    remove:      (dashId: number, tileId: number) => phPatch(`/api/projects/${_projectId}/dashboards/${dashId}/`, { tiles: [{ id: tileId, deleted: true }] }),
  },

  // ── Dashboard templates ───────────────────────────────────────────────────
  dashboardTemplates: {
    list:       (params?: any)       => phGet(`/api/projects/${_projectId}/dashboard_templates/`, params),
    createFrom: (templateId: string) => phPost(`/api/projects/${_projectId}/dashboards/create_from_template_json/`, { template_id: templateId }),
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
    duplicate: (id: number) =>
      phPost(`/api/projects/${_projectId}/feature_flags/${id}/duplicate/`, {}),
    enrich: (id: number) =>
      phGet(`/api/projects/${_projectId}/feature_flags/${id}/usage/`),
    // Bulk-update varias flags a la vez (activar/desactivar/archivar en masa).
    bulkUpdate: (ids: number[], data: any) =>
      phPost(`/api/projects/${_projectId}/feature_flags/bulk_update/`, { flag_ids: ids, ...data }),
    // Role-based access control de una flag concreta.
    roleAccess: {
      list:   (flagId: number)               => phGet(`/api/projects/${_projectId}/feature_flags/${flagId}/role_access/`),
      add:    (flagId: number, data: any)    => phPost(`/api/projects/${_projectId}/feature_flags/${flagId}/role_access/`, data),
      remove: (flagId: number, id: number)   => phDelete(`/api/projects/${_projectId}/feature_flags/${flagId}/role_access/${id}/`),
    },
    // Cambios programados (scheduled rollout).
    scheduledChanges: {
      list:   (flagId: number)               => phGet(`/api/projects/${_projectId}/feature_flags/${flagId}/scheduled_changes/`),
      create: (flagId: number, data: any)    => phPost(`/api/projects/${_projectId}/feature_flags/${flagId}/scheduled_changes/`, data),
      remove: (flagId: number, id: number)   => phDelete(`/api/projects/${_projectId}/feature_flags/${flagId}/scheduled_changes/${id}/`),
    },
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
    get: (id: number) =>
      phGet(`/api/environments/${_teamId}/insights/${id}/`),
    create: (data: any) =>
      phPost(`/api/environments/${_teamId}/insights/`, data),
    update: (id: number, data: any) =>
      phPatch(`/api/environments/${_teamId}/insights/${id}/`, data),
    delete: (id: number) =>
      phDelete(`/api/environments/${_teamId}/insights/${id}/`),
    duplicate: (id: number) =>
      phPost(`/api/environments/${_teamId}/insights/${id}/duplicate/`, {}),
    activity: (id: number, params?: any) =>
      phGet(`/api/environments/${_teamId}/insights/${id}/activity/`, params),
    sharing: (id: number) =>
      phGet(`/api/environments/${_teamId}/insights/${id}/sharing/`),
    setSharing: (id: number, data: any) =>
      phPatch(`/api/environments/${_teamId}/insights/${id}/sharing/`, data),
    query: (data: any) =>
      phPost(`/api/environments/${_teamId}/query/`, data),
    // Drill-down to actors (people behind a metric value).
    actors: (data: any) =>
      phPost(`/api/environments/${_teamId}/query/`, { query: { kind: 'ActorsQuery', ...data } }),
    alerts: {
      list:   (insightId: number)               => phGet(`/api/projects/${_projectId}/alerts/`, { insight: insightId }),
      get:    (id: string)                      => phGet(`/api/projects/${_projectId}/alerts/${id}/`),
      create: (data: any)                       => phPost(`/api/projects/${_projectId}/alerts/`, data),
      update: (id: string, data: any)           => phPatch(`/api/projects/${_projectId}/alerts/${id}/`, data),
      remove: (id: string)                      => phDelete(`/api/projects/${_projectId}/alerts/${id}/`),
    },
  },

  // ── Persons ───────────────────────────────────────────────────────────────
  persons: {
    list: (params?: any) =>
      phGet(`/api/environments/${_teamId}/persons/`, params),
    get: (id: string) =>
      phGet(`/api/environments/${_teamId}/persons/${id}/`),
    update: (id: string, data: any) =>
      phPatch(`/api/environments/${_teamId}/persons/${id}/`, data),
    delete: (id: string, deleteEvents = false) =>
      phDelete(`/api/environments/${_teamId}/persons/${id}/${deleteEvents ? '?delete_events=true' : ''}`),
    events: (distinctId: string) =>
      phGet(`/api/environments/${_teamId}/events/`, { distinct_id: distinctId, limit: 50 }),
    splitDistinctIds: (id: string) =>
      phPost(`/api/environments/${_teamId}/persons/${id}/split/`, {}),
    deleteProperty: (id: string, property: string) =>
      phPost(`/api/environments/${_teamId}/persons/${id}/delete_property/`, { $unset: property }),
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
    update: (data: any) =>
      phPatch(`/api/organizations/@current/`, data),
    members: () =>
      phGet(`/api/organizations/@current/members/`),
    invites: () =>
      phGet(`/api/organizations/@current/invites/`),
    invite: (data: any) =>
      phPost(`/api/organizations/@current/invites/`, data),
    deleteInvite: (id: string) =>
      phDelete(`/api/organizations/@current/invites/${id}/`),
    deleteMember: (uuid: string) =>
      phDelete(`/api/organizations/@current/members/${uuid}/`),
    updateMember: (uuid: string, data: any) =>
      phPatch(`/api/organizations/@current/members/${uuid}/`, data),
  },

  // ── Actions ───────────────────────────────────────────────────────────────
  annotations: {
    list: (params?: any) =>
      phGet(`/api/projects/${_projectId}/annotations/`, params),
    create: (data: any) =>
      phPost(`/api/projects/${_projectId}/annotations/`, data),
    update: (id: number, data: any) =>
      phPatch(`/api/projects/${_projectId}/annotations/${id}/`, data),
    delete: (id: number) =>
      phDelete(`/api/projects/${_projectId}/annotations/${id}/`),
  },

  actions: {
    list: (params?: any) =>
      phGet(`/api/projects/${_projectId}/actions/`, params),
    get: (id: number) =>
      phGet(`/api/projects/${_projectId}/actions/${id}/`),
    create: (data: any) =>
      phPost(`/api/projects/${_projectId}/actions/`, data),
    update: (id: number, data: any) =>
      phPatch(`/api/projects/${_projectId}/actions/${id}/`, data),
    delete: (id: number) =>
      phDelete(`/api/projects/${_projectId}/actions/${id}/`),
  },

  // ── Cohorts ───────────────────────────────────────────────────────────────
  cohorts: {
    list: () =>
      phGet(`/api/projects/${_projectId}/cohorts/`),
    get: (id: number) =>
      phGet(`/api/projects/${_projectId}/cohorts/${id}/`),
    create: (data: any) =>
      phPost(`/api/projects/${_projectId}/cohorts/`, data),
    update: (id: number, data: any) =>
      phPatch(`/api/projects/${_projectId}/cohorts/${id}/`, data),
    delete: (id: number) =>
      phDelete(`/api/projects/${_projectId}/cohorts/${id}/`),
    persons: (id: number) =>
      phGet(`/api/projects/${_projectId}/cohorts/${id}/persons/`),
    duplicate: (id: number) =>
      phPost(`/api/projects/${_projectId}/cohorts/${id}/duplicate_as_static_cohort/`, {}),
  },

  // ── Groups ────────────────────────────────────────────────────────────────
  groups: {
    list: (params?: any) =>
      phGet(`/api/projects/${_projectId}/groups/`, params),
    get: (groupTypeIndex: number, groupKey: string) =>
      phGet(`/api/projects/${_projectId}/groups/find/`, { group_type_index: groupTypeIndex, group_key: groupKey }),
    types: () =>
      phGet(`/api/projects/${_projectId}/groups_types/`),
    relatedPersons: (groupTypeIndex: number, groupKey: string) =>
      phGet(`/api/projects/${_projectId}/groups/related/`, { group_type_index: groupTypeIndex, id: groupKey }),
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

  // ── LLM analytics ─────────────────────────────────────────────────────────
  // PostHog tracks LLM calls as `$ai_generation` / `$ai_span` / `$ai_trace`
  // events. There is no dedicated REST endpoint in OSS — everything goes
  // through the query endpoint. These helpers encapsulate the canonical
  // HogQL shape PostHog itself uses internally so callers don't reinvent it.
  llmAnalytics: {
    /** List traces grouped by $ai_trace_id. `rangeClickhouse` like '7 DAY'. */
    traces: (params: { rangeClickhouse: string; model?: string; provider?: string; errorsOnly?: boolean; limit?: number }) => {
      const { rangeClickhouse, model, provider, errorsOnly, limit = 100 } = params
      const esc = (s: string) => s.replace(/'/g, "''")
      const where = [
        `event = '$ai_generation'`,
        `timestamp >= now() - INTERVAL ${rangeClickhouse}`,
        model    ? `toString(properties.$ai_model) = '${esc(model)}'`       : '',
        provider ? `toString(properties.$ai_provider) = '${esc(provider)}'` : '',
        errorsOnly ? `toString(properties.$ai_is_error) = 'true'`           : '',
      ].filter(Boolean).join(' AND ')
      const hql = `
        SELECT
          toString(properties.$ai_trace_id) AS trace_id,
          count() AS spans,
          sum(toFloat(properties.$ai_total_cost_usd)) AS total_cost,
          sum(toFloat(properties.$ai_input_tokens) + toFloat(properties.$ai_output_tokens)) AS total_tokens,
          max(toFloat(properties.$ai_latency)) AS max_latency,
          sum(toFloat(properties.$ai_latency)) AS total_latency,
          min(timestamp) AS started_at,
          max(timestamp) AS ended_at,
          anyIf(distinct_id, true) AS distinct_id,
          countIf(toString(properties.$ai_is_error) = 'true') AS errors,
          arrayDistinct(groupArray(toString(properties.$ai_model))) AS models
        FROM events
        WHERE ${where} AND toString(properties.$ai_trace_id) != ''
        GROUP BY trace_id
        ORDER BY ended_at DESC
        LIMIT ${limit}
      `
      return phPost(`/api/environments/${_teamId}/query/`, { query: { kind: 'HogQLQuery', query: hql } })
    },
    /** All generations / spans for a given trace_id, ordered by timestamp. */
    trace: (traceId: string) => {
      const esc = traceId.replace(/'/g, "''")
      return phPost(`/api/environments/${_teamId}/query/`, {
        query: {
          kind: 'EventsQuery',
          select: ['*', 'event', 'person', 'timestamp', 'properties'],
          event: '$ai_generation',
          properties: [{ key: '$ai_trace_id', value: esc, operator: 'exact', type: 'event' }],
          orderBy: ['timestamp ASC'],
          limit: 500,
        },
      })
    },
    /** List recent $ai_generation events. */
    generations: (params: { rangeClickhouse: string; model?: string; provider?: string; errorsOnly?: boolean; limit?: number }) => {
      const { rangeClickhouse, model, provider, errorsOnly, limit = 100 } = params
      const properties: any[] = []
      if (model)    properties.push({ key: '$ai_model',    value: model,    operator: 'exact', type: 'event' })
      if (provider) properties.push({ key: '$ai_provider', value: provider, operator: 'exact', type: 'event' })
      if (errorsOnly) properties.push({ key: '$ai_is_error', value: 'true', operator: 'exact', type: 'event' })
      const days = parseInt(rangeClickhouse) || 7
      const unit = rangeClickhouse.includes('HOUR') ? 'h' : 'd'
      return phPost(`/api/environments/${_teamId}/query/`, {
        query: { kind: 'EventsQuery', select: ['*', 'event', 'person', 'timestamp', 'properties'], event: '$ai_generation', after: `-${days}${unit}`, properties, orderBy: ['timestamp DESC'], limit },
      })
    },
    /** Aggregated per-model stats over the window. */
    modelsBreakdown: (rangeClickhouse: string) => {
      const hql = `
        SELECT
          toString(properties.$ai_model) AS model,
          toString(properties.$ai_provider) AS provider,
          count() AS calls,
          sum(toFloat(properties.$ai_input_tokens) + toFloat(properties.$ai_output_tokens)) AS tokens,
          sum(toFloat(properties.$ai_total_cost_usd)) AS cost,
          avg(toFloat(properties.$ai_latency)) AS p50_lat,
          quantile(0.95)(toFloat(properties.$ai_latency)) AS p95_lat,
          countIf(toString(properties.$ai_is_error) = 'true') AS errors,
          uniq(distinct_id) AS users
        FROM events
        WHERE event = '$ai_generation' AND timestamp >= now() - INTERVAL ${rangeClickhouse}
        GROUP BY model, provider
        ORDER BY calls DESC
        LIMIT 50
      `
      return phPost(`/api/environments/${_teamId}/query/`, { query: { kind: 'HogQLQuery', query: hql } })
    },
    /** Conversations grouped by `properties.$ai_conversation_id` (or trace_id fallback). */
    conversations: (params: { rangeClickhouse: string; limit?: number }) => {
      const { rangeClickhouse, limit = 100 } = params
      const hql = `
        SELECT
          coalesce(nullIf(toString(properties.$ai_conversation_id), ''), toString(properties.$ai_trace_id)) AS conv_id,
          count() AS turns,
          sum(toFloat(properties.$ai_total_cost_usd)) AS total_cost,
          sum(toFloat(properties.$ai_input_tokens) + toFloat(properties.$ai_output_tokens)) AS total_tokens,
          min(timestamp) AS started_at,
          max(timestamp) AS ended_at,
          anyIf(distinct_id, true) AS distinct_id,
          countIf(toString(properties.$ai_is_error) = 'true') AS errors,
          arrayDistinct(groupArray(toString(properties.$ai_model))) AS models,
          argMin(toString(properties.$ai_input), timestamp) AS first_input,
          argMax(toString(properties.$ai_output), timestamp) AS last_output
        FROM events
        WHERE event = '$ai_generation' AND timestamp >= now() - INTERVAL ${rangeClickhouse} AND conv_id != ''
        GROUP BY conv_id
        ORDER BY ended_at DESC
        LIMIT ${limit}
      `
      return phPost(`/api/environments/${_teamId}/query/`, { query: { kind: 'HogQLQuery', query: hql } })
    },
    /** All generations for a conversation_id, ordered by timestamp. */
    conversation: (convId: string) => {
      const esc = convId.replace(/'/g, "''")
      const hql = `
        SELECT *, timestamp
        FROM events
        WHERE event = '$ai_generation' AND (
          toString(properties.$ai_conversation_id) = '${esc}' OR toString(properties.$ai_trace_id) = '${esc}'
        )
        ORDER BY timestamp ASC
        LIMIT 500
      `
      return phPost(`/api/environments/${_teamId}/query/`, { query: { kind: 'HogQLQuery', query: hql } })
    },
    /** Errors breakdown — groups by `$ai_error` text. Matches PostHog LLMAnalyticsErrors. */
    errorsBreakdown: (rangeClickhouse: string) => {
      const hql = `
        SELECT
          coalesce(nullIf(toString(properties.$ai_error), ''), 'unknown_error') AS error,
          min(timestamp) AS first_seen,
          max(timestamp) AS last_seen,
          count(distinct toString(properties.$ai_trace_id)) AS traces,
          count() AS generations,
          countIf(toString(properties.$ai_span_id) != '') AS spans,
          count(distinct toString(properties.$session_id)) AS sessions,
          uniq(distinct_id) AS users,
          count(distinct toDate(timestamp)) AS days_seen
        FROM events
        WHERE event = '$ai_generation' AND timestamp >= now() - INTERVAL ${rangeClickhouse}
          AND toString(properties.$ai_is_error) = 'true'
        GROUP BY error
        ORDER BY generations DESC
        LIMIT 100
      `
      return phPost(`/api/environments/${_teamId}/query/`, { query: { kind: 'HogQLQuery', query: hql } })
    },
    /** Tools breakdown — groups by tool name extracted from `$ai_tools` / tool_calls. */
    toolsBreakdown: (rangeClickhouse: string) => {
      const hql = `
        SELECT
          tool,
          count() AS total_calls,
          count(distinct toString(properties.$ai_trace_id)) AS traces,
          uniq(distinct_id) AS users,
          count(distinct toString(properties.$session_id)) AS sessions,
          countIf(tool_count = 1) / count() * 100 AS single_pct,
          count(distinct toDate(timestamp)) AS days_seen,
          min(timestamp) AS first_seen,
          max(timestamp) AS last_seen
        FROM (
          SELECT
            arrayJoin(JSONExtractArrayRaw(toString(properties.$ai_tools))) AS tool_raw,
            JSONExtractString(tool_raw, 'name') AS tool,
            length(JSONExtractArrayRaw(toString(properties.$ai_tools))) AS tool_count,
            timestamp, distinct_id, properties
          FROM events
          WHERE event = '$ai_generation' AND timestamp >= now() - INTERVAL ${rangeClickhouse}
            AND toString(properties.$ai_tools) != ''
        )
        WHERE tool != ''
        GROUP BY tool
        ORDER BY total_calls DESC
        LIMIT 100
      `
      return phPost(`/api/environments/${_teamId}/query/`, { query: { kind: 'HogQLQuery', query: hql } })
    },
    /** Sessions breakdown — groups by `$session_id`. Matches PostHog LLMAnalyticsSessionsScene. */
    sessionsBreakdown: (rangeClickhouse: string) => {
      const hql = `
        SELECT
          toString(properties.$session_id) AS session_id,
          count(distinct toString(properties.$ai_trace_id)) AS traces,
          countIf(toString(properties.$ai_span_id) != '') AS spans,
          count() AS generations,
          0 AS embeddings,
          countIf(toString(properties.$ai_is_error) = 'true') AS errors,
          sum(toFloat(properties.$ai_total_cost_usd)) AS total_cost,
          sum(toFloat(properties.$ai_latency)) AS total_latency,
          min(timestamp) AS first_seen,
          max(timestamp) AS last_seen
        FROM events
        WHERE event = '$ai_generation' AND timestamp >= now() - INTERVAL ${rangeClickhouse}
          AND toString(properties.$session_id) != ''
        GROUP BY session_id
        ORDER BY last_seen DESC
        LIMIT 100
      `
      return phPost(`/api/environments/${_teamId}/query/`, { query: { kind: 'HogQLQuery', query: hql } })
    },
    /** Dashboard tile: cost by model (ActionsBarValue equivalent). */
    costByModel: (rangeClickhouse: string) => {
      const hql = `
        SELECT toString(properties.$ai_model) AS model, sum(toFloat(properties.$ai_total_cost_usd)) AS cost
        FROM events WHERE event = '$ai_generation' AND timestamp >= now() - INTERVAL ${rangeClickhouse}
        GROUP BY model ORDER BY cost DESC LIMIT 10
      `
      return phPost(`/api/environments/${_teamId}/query/`, { query: { kind: 'HogQLQuery', query: hql } })
    },
    /** Dashboard tile: HTTP status breakdown. */
    httpStatusBreakdown: (rangeClickhouse: string) => {
      const hql = `
        SELECT coalesce(nullIf(toString(properties.$ai_http_status), ''), 'unknown') AS status, count() AS c
        FROM events WHERE event = '$ai_generation' AND timestamp >= now() - INTERVAL ${rangeClickhouse}
        GROUP BY status ORDER BY c DESC LIMIT 10
      `
      return phPost(`/api/environments/${_teamId}/query/`, { query: { kind: 'HogQLQuery', query: hql } })
    },
    /** Dashboard tile: latency by model over time. */
    latencyByModel: (rangeClickhouse: string, days: number) => {
      const unit = days <= 1 ? 'toStartOfHour(timestamp)' : days <= 30 ? 'toDate(timestamp)' : 'toMonday(toDate(timestamp))'
      const hql = `
        SELECT ${unit} AS bucket, toString(properties.$ai_model) AS model, median(toFloat(properties.$ai_latency)) AS p50
        FROM events WHERE event = '$ai_generation' AND timestamp >= now() - INTERVAL ${rangeClickhouse}
        GROUP BY bucket, model ORDER BY bucket ASC
      `
      return phPost(`/api/environments/${_teamId}/query/`, { query: { kind: 'HogQLQuery', query: hql } })
    },
    /** Aggregated per-user stats over the window. */
    usersBreakdown: (rangeClickhouse: string) => {
      const hql = `
        SELECT
          distinct_id,
          count() AS calls,
          sum(toFloat(properties.$ai_input_tokens) + toFloat(properties.$ai_output_tokens)) AS tokens,
          sum(toFloat(properties.$ai_total_cost_usd)) AS cost,
          avg(toFloat(properties.$ai_latency)) AS avg_lat,
          countIf(toString(properties.$ai_is_error) = 'true') AS errors,
          max(timestamp) AS last_seen,
          arrayDistinct(groupArray(toString(properties.$ai_model))) AS models
        FROM events
        WHERE event = '$ai_generation' AND timestamp >= now() - INTERVAL ${rangeClickhouse}
        GROUP BY distinct_id
        ORDER BY cost DESC
        LIMIT 50
      `
      return phPost(`/api/environments/${_teamId}/query/`, { query: { kind: 'HogQLQuery', query: hql } })
    },
  },

  // ── LLM provider keys ─────────────────────────────────────────────────────
  // Used by the Playground and (server-side) for LLM-as-judge evaluations.
  // PostHog endpoint: /api/projects/{pid}/integrations/ filtered by `kind=llm_provider`,
  // but the simpler dedicated endpoint exists in newer versions:
  llmProviderKeys: {
    list: () =>
      phGet(`/api/environments/${_teamId}/llm_provider_keys/`).catch(() =>
        phGet(`/api/projects/${_projectId}/llm_provider_keys/`)),
    create: (data: { provider: string; api_key: string; nickname?: string }) =>
      phPost(`/api/environments/${_teamId}/llm_provider_keys/`, data).catch(() =>
        phPost(`/api/projects/${_projectId}/llm_provider_keys/`, data)),
    update: (id: number | string, data: any) =>
      phPatch(`/api/environments/${_teamId}/llm_provider_keys/${id}/`, data).catch(() =>
        phPatch(`/api/projects/${_projectId}/llm_provider_keys/${id}/`, data)),
    delete: (id: number | string) =>
      phDelete(`/api/environments/${_teamId}/llm_provider_keys/${id}/`).catch(() =>
        phDelete(`/api/projects/${_projectId}/llm_provider_keys/${id}/`)),
  },

  // ── LLM datasets ──────────────────────────────────────────────────────────
  // PostHog `/api/projects/{pid}/llm_analytics_datasets/` — collections of
  // input/expected-output pairs for evaluations.
  datasets: {
    list: (params?: any) =>
      phGet(`/api/projects/${_projectId}/llm_analytics_datasets/`, params),
    get: (id: string | number) =>
      phGet(`/api/projects/${_projectId}/llm_analytics_datasets/${id}/`),
    create: (data: any) =>
      phPost(`/api/projects/${_projectId}/llm_analytics_datasets/`, data),
    update: (id: string | number, data: any) =>
      phPatch(`/api/projects/${_projectId}/llm_analytics_datasets/${id}/`, data),
    delete: (id: string | number) =>
      phDelete(`/api/projects/${_projectId}/llm_analytics_datasets/${id}/`),
    items: {
      list: (datasetId: string | number) =>
        phGet(`/api/projects/${_projectId}/llm_analytics_datasets/${datasetId}/items/`),
      create: (datasetId: string | number, data: any) =>
        phPost(`/api/projects/${_projectId}/llm_analytics_datasets/${datasetId}/items/`, data),
      update: (datasetId: string | number, itemId: string | number, data: any) =>
        phPatch(`/api/projects/${_projectId}/llm_analytics_datasets/${datasetId}/items/${itemId}/`, data),
      delete: (datasetId: string | number, itemId: string | number) =>
        phDelete(`/api/projects/${_projectId}/llm_analytics_datasets/${datasetId}/items/${itemId}/`),
    },
  },

  // ── LLM evaluations ───────────────────────────────────────────────────────
  // PostHog `/api/projects/{pid}/llm_analytics_evaluations/` — LLM-as-judge
  // configs (prompt + dataset/live + judge model + criteria).
  evaluations: {
    list: (params?: any) =>
      phGet(`/api/projects/${_projectId}/llm_analytics_evaluations/`, params),
    get: (id: string | number) =>
      phGet(`/api/projects/${_projectId}/llm_analytics_evaluations/${id}/`),
    create: (data: any) =>
      phPost(`/api/projects/${_projectId}/llm_analytics_evaluations/`, data),
    update: (id: string | number, data: any) =>
      phPatch(`/api/projects/${_projectId}/llm_analytics_evaluations/${id}/`, data),
    delete: (id: string | number) =>
      phDelete(`/api/projects/${_projectId}/llm_analytics_evaluations/${id}/`),
    run: (id: string | number) =>
      phPost(`/api/projects/${_projectId}/llm_analytics_evaluations/${id}/run/`, {}),
    runs: (id: string | number) =>
      phGet(`/api/projects/${_projectId}/llm_analytics_evaluations/${id}/runs/`),
  },

  // ── Error tracking ────────────────────────────────────────────────────────
  errorTracking: {
    list: (params?: any) =>
      phGet(`/api/environments/${_teamId}/error_tracking/`, params),
    get: (id: string) =>
      phGet(`/api/environments/${_teamId}/error_tracking/${id}/`),
    update: (id: string, data: any) =>
      phPatch(`/api/environments/${_teamId}/error_tracking/${id}/`, data),
  },

  // ── Web Analytics (typed query kinds, parity con posthog/schema/) ─────────
  webAnalytics: {
    overview: (params: { dateRange: { date_from: string; date_to?: string | null }; properties?: any[]; compareFilter?: { compare?: boolean; compare_to?: string }; filterTestAccounts?: boolean; sampling?: any; includeRevenue?: boolean; conversionGoal?: any }) =>
      phPost(`/api/environments/${_teamId}/query/`, { query: { kind: 'WebOverviewQuery', ...params } }),
    statsTable: (params: { breakdownBy: string; dateRange: { date_from: string; date_to?: string | null }; properties?: any[]; compareFilter?: { compare?: boolean }; filterTestAccounts?: boolean; includeBounceRate?: boolean; includeScrollDepth?: boolean; doPathCleaning?: boolean; limit?: number; offset?: number; orderBy?: [string, 'ASC' | 'DESC']; conversionGoal?: any; sampling?: any }) =>
      phPost(`/api/environments/${_teamId}/query/`, { query: { kind: 'WebStatsTableQuery', ...params } }),
    externalClicks: (params: { dateRange: { date_from: string; date_to?: string | null }; properties?: any[]; filterTestAccounts?: boolean; stripQueryParams?: boolean; limit?: number }) =>
      phPost(`/api/environments/${_teamId}/query/`, { query: { kind: 'WebExternalClicksTableQuery', ...params } }),
    goals: (params: { dateRange: { date_from: string; date_to?: string | null }; properties?: any[]; filterTestAccounts?: boolean; limit?: number }) =>
      phPost(`/api/environments/${_teamId}/query/`, { query: { kind: 'WebGoalsQuery', ...params } }),
    vitals: (params: { dateRange: { date_from: string; date_to?: string | null }; properties?: any[]; filterTestAccounts?: boolean; percentile?: 'p75' | 'p90' | 'p99' }) =>
      phPost(`/api/environments/${_teamId}/query/`, { query: { kind: 'WebVitalsQuery', ...params } }),
    vitalsPathBreakdown: (params: { dateRange: { date_from: string; date_to?: string | null }; properties?: any[]; filterTestAccounts?: boolean; metric: 'INP' | 'LCP' | 'FCP' | 'CLS'; percentile?: 'p75' | 'p90' | 'p99'; thresholds: [number, number] }) =>
      phPost(`/api/environments/${_teamId}/query/`, { query: { kind: 'WebVitalsPathBreakdownQuery', ...params } }),
    pageURLSearch: (params: { dateRange: { date_from: string; date_to?: string | null }; properties?: any[]; filterTestAccounts?: boolean; searchTerm?: string; stripQueryParams?: boolean; limit?: number }) =>
      phPost(`/api/environments/${_teamId}/query/`, { query: { kind: 'WebPageURLSearchQuery', ...params } }),
    activeHoursHeatmap: (params: { dateRange: { date_from: string; date_to?: string | null }; properties?: any[]; filterTestAccounts?: boolean }) =>
      phPost(`/api/environments/${_teamId}/query/`, { query: { kind: 'WebActiveHoursHeatMapQuery', ...params } }),
    trends: (params: { dateRange: { date_from: string; date_to?: string | null }; properties?: any[]; compareFilter?: { compare?: boolean }; interval?: 'hour' | 'day' | 'week' | 'month'; series: Array<{ event?: string; name?: string; math?: string; kind?: string }>; filterTestAccounts?: boolean; sampling?: any }) =>
      phPost(`/api/environments/${_teamId}/query/`, {
        query: {
          kind: 'InsightVizNode',
          source: {
            kind: 'TrendsQuery',
            dateRange: params.dateRange,
            properties: params.properties ?? [],
            compareFilter: params.compareFilter ?? { compare: false },
            interval: params.interval ?? 'day',
            series: params.series.map(s => ({ kind: s.kind ?? 'EventsNode', event: s.event, name: s.name, math: s.math ?? 'total' })),
            filterTestAccounts: params.filterTestAccounts,
            trendsFilter: { display: 'ActionsLineGraph' },
          },
        },
      }),
  },

  // ── Generic Sharing (parametrised by resource) ───────────────────────────
  sharing: {
    get:    (resource: string, id: string | number) => phGet(`/api/projects/${_projectId}/${resource}/${id}/sharing/`),
    update: (resource: string, id: string | number, data: any) => phPatch(`/api/projects/${_projectId}/${resource}/${id}/sharing/`, data),
  },

  // ── Generic Subscriptions ────────────────────────────────────────────────
  subscriptions: {
    list:   (params?: any)            => phGet(`/api/projects/${_projectId}/subscriptions/`, params),
    get:    (id: number)              => phGet(`/api/projects/${_projectId}/subscriptions/${id}/`),
    create: (data: any)               => phPost(`/api/projects/${_projectId}/subscriptions/`, data),
    update: (id: number, data: any)   => phPatch(`/api/projects/${_projectId}/subscriptions/${id}/`, data),
    delete: (id: number)              => phDelete(`/api/projects/${_projectId}/subscriptions/${id}/`),
  },

  // ── Generic Activity log ─────────────────────────────────────────────────
  activity: {
    list: (params: { scope?: string; item_id?: string | number; user?: string; page?: number; limit?: number }) =>
      phGet(`/api/projects/${_projectId}/activity_log/`, params),
  },

  // ── Replay sub-data ──────────────────────────────────────────────────────
  recordingExtras: {
    snapshots:       (id: string, params?: any) => phGet(`/api/environments/${_teamId}/session_recordings/${id}/snapshots/`, params),
    consoleLogs:     (id: string)               => phGet(`/api/environments/${_teamId}/session_recordings/${id}/console_logs/`),
    networkRequests: (id: string)               => phGet(`/api/environments/${_teamId}/session_recordings/${id}/network_requests/`),
    performance:     (id: string)               => phGet(`/api/environments/${_teamId}/session_recordings/${id}/performance_events/`),
    errors:          (id: string)               => phGet(`/api/environments/${_teamId}/session_recordings/${id}/errors/`),
    delete:          (id: string)               => phDelete(`/api/environments/${_teamId}/session_recordings/${id}/`),
  },

  // ── Heatmaps (mobile + web) ──────────────────────────────────────────────
  heatmaps: {
    list: (params: { date_from: string; date_to?: string; url_exact?: string; url_pattern?: string; type?: string; viewport_width_min?: number; viewport_width_max?: number; aggregation?: string }) =>
      phGet(`/api/projects/${_projectId}/heatmaps/`, params),
  },

  // ── Notebook presence (real-time collab, polling fallback en OSS) ────────
  notebookPresence: {
    list:      (shortId: string)                   => phGet(`/api/projects/${_projectId}/notebooks/${shortId}/presence/`),
    heartbeat: (shortId: string, data: any)        => phPost(`/api/projects/${_projectId}/notebooks/${shortId}/presence/`, data),
  },

  // ── External data sources (Data Warehouse) ───────────────────────────────
  externalDataSources: {
    list:   ()                       => phGet(`/api/projects/${_projectId}/external_data_sources/`),
    get:    (id: string)             => phGet(`/api/projects/${_projectId}/external_data_sources/${id}/`),
    update: (id: string, data: any)  => phPatch(`/api/projects/${_projectId}/external_data_sources/${id}/`, data),
    reload: (id: string)             => phPost(`/api/projects/${_projectId}/external_data_sources/${id}/reload/`, {}),
    delete: (id: string)             => phDelete(`/api/projects/${_projectId}/external_data_sources/${id}/`),
    jobs:   (id: string)             => phGet(`/api/projects/${_projectId}/external_data_sources/${id}/jobs/`),
  },

  // ── Error tracking symbol sets (sourcemap / dSYM / ProGuard) ─────────────
  errorTrackingSymbols: {
    upload: async (file: File, releaseId?: string): Promise<any> => {
      const form = new FormData();
      form.append('file', file);
      if (releaseId) form.append('release_id', releaseId);
      const res = await fetch(`${POSTHOG_HOST}/api/projects/${_projectId}/error_tracking/symbol_sets/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${POSTHOG_KEY}` },
        body: form,
      });
      if (!res.ok) throw new Error(`PostHog ${res.status}: ${await res.text().catch(() => '')}`);
      return res.json();
    },
    list:   ()           => phGet(`/api/projects/${_projectId}/error_tracking/symbol_sets/`),
    delete: (id: string) => phDelete(`/api/projects/${_projectId}/error_tracking/symbol_sets/${id}/`),
  },

  // ── Experiment saved metrics + holdouts ──────────────────────────────────
  experimentSavedMetrics: {
    list:   ()                       => phGet(`/api/projects/${_projectId}/experiment_saved_metrics/`),
    get:    (id: number)             => phGet(`/api/projects/${_projectId}/experiment_saved_metrics/${id}/`),
    create: (data: any)              => phPost(`/api/projects/${_projectId}/experiment_saved_metrics/`, data),
    update: (id: number, data: any)  => phPatch(`/api/projects/${_projectId}/experiment_saved_metrics/${id}/`, data),
    delete: (id: number)             => phDelete(`/api/projects/${_projectId}/experiment_saved_metrics/${id}/`),
  },
  experimentHoldouts: {
    list:   ()                       => phGet(`/api/projects/${_projectId}/experiment_holdouts/`),
    create: (data: any)              => phPost(`/api/projects/${_projectId}/experiment_holdouts/`, data),
    delete: (id: number)             => phDelete(`/api/projects/${_projectId}/experiment_holdouts/${id}/`),
  },

  // ── LLM cost summary ────────────────────────────────────────────────────
  llmCost: {
    summary: (params: { dateRange: { date_from: string; date_to?: string | null }; properties?: any[] }) =>
      phPost(`/api/environments/${_teamId}/query/`, {
        query: {
          kind: 'TrendsQuery',
          dateRange: params.dateRange,
          properties: params.properties ?? [],
          series: [
            { kind: 'EventsNode', event: '$ai_generation', name: 'Cost (USD)', math: 'sum', math_property: '$ai_cost_usd' },
            { kind: 'EventsNode', event: '$ai_generation', name: 'Tokens',     math: 'sum', math_property: '$ai_total_tokens' },
          ],
          breakdownFilter: { breakdown: '$ai_model', breakdown_type: 'event' },
          trendsFilter: { display: 'ActionsLineGraph' },
        },
      }),
  },

  // ── HogQL helpers ────────────────────────────────────────────────────────
  hogql: {
    autocomplete: (data: { query: string; startPosition?: number; endPosition?: number }) =>
      phPost(`/api/environments/${_teamId}/query/`, { query: { kind: 'HogQLAutocomplete', language: 'hogQL', ...data } }),
    metadata: (data: { query: string }) =>
      phPost(`/api/environments/${_teamId}/query/`, { query: { kind: 'HogQLMetadata', language: 'hogQL', ...data } }),
  },

  // ── Generic /query/ runner (escape hatch) ────────────────────────────────
  query: (data: any) =>
    phPost(`/api/environments/${_teamId}/query/`, data),
}

export default posthog
