// ─────────────────────────────────────────────────────────────────────────────
// Clain prototype — path-based router
//
// Replaces the old query-param scheme (?view=&scope=&case=&sub=) with clean
// paths, and — crucially — builds every URL FRESH so stale params from a
// previous view (e.g. a leftover ?sub=allRoles) can never leak across screens.
//
// Route grammar
//   /                         → inbox (default)
//   /inbox                    → inbox, default scope
//   /inbox/:scope             → inbox, a specific scope
//   /inbox/:scope/:caseId     → inbox, scope + selected conversation
//   /:view                    → any other top-level view (e.g. /contacts)
//   /:view/:sub               → views with a sub-tab (fin / knowledge / outbound)
//
// Base path: production (app.clain.app) serves the SPA at root; dev/preview may
// serve it under /app. We detect and strip that prefix so routes stay
// root-relative everywhere.
//
// Backward compatibility: if the pathname carries no known view segment we fall
// back to reading the legacy ?view=/?scope=/?case=/?sub= query params, so old
// deep-links keep working during the transition.
// ─────────────────────────────────────────────────────────────────────────────

import type { View } from './types';

export interface RouteState {
  view: View;
  scope?: string;   // InboxScope (kept as string here to avoid coupling)
  caseId?: string;
  sub?: string;
}

// Every top-level View string is also its URL segment (identity mapping). Inbox
// is the only view with a richer sub-path.
const KNOWN_VIEWS: readonly View[] = [
  'superAgent', 'inbox', 'contacts', 'allLeads', 'settings', 'imports', 'personal',
  'security', 'notifications', 'visible', 'tokens', 'accountAccess', 'multilingual',
  'assignments', 'macros', 'tickets', 'sla', 'aiInbox', 'automation', 'appStore',
  'connectors', 'labels', 'people', 'companies', 'workspaceSecurity',
  'workspaceMultilingual', 'workspaceHours', 'workspaceBrands', 'billing', 'messenger',
  'email', 'phone', 'whatsapp', 'discord', 'sms', 'social', 'allChannels', 'inboxTeam',
  'fin', 'knowledge', 'reports', 'outbound', 'workspaceGeneral', 'workspaceTeammates',
  'auth', 'developer', 'customObjects', 'topics', 'switchChannel', 'slackChannel',
  'helpCenter', 'featuresComparison', 'billingPlans', 'cannedResponses', 'customFilters',
  'emailTemplates', 'customRoles', 'aiFeedback', 'callsLive', 'mcpServers', 'agentChat',
  'audiences', 'finSettings', 'dataConversaciones', 'clainHub', 'webAnalytics',
];
const VIEW_SET = new Set<string>(KNOWN_VIEWS);

// Static inbox scopes that are safe, readable path segments. Dynamic scopes
// (team:<id> / agent:<id>) are still supported — they're URL-encoded in/out.
const STATIC_SCOPES = new Set<string>([
  'search', 'inbox', 'mentions', 'created', 'all', 'unassigned', 'spam', 'dashboard',
  'fin-all', 'fin-resolved', 'fin-escalated', 'fin-pending', 'fin-spam',
  'v-messenger', 'v-email', 'v-whatsapp', 'v-phone', 'v-tickets',
]);

function isValidScope(s: string): boolean {
  return STATIC_SCOPES.has(s) || s.startsWith('team:') || s.startsWith('agent:');
}

/** Detect the SPA base path ('' at root, '/app' in dev/preview). */
export function getBase(): string {
  if (typeof window === 'undefined') return '';
  return window.location.pathname === '/app' || window.location.pathname.startsWith('/app/')
    ? '/app'
    : '';
}

/** The URL segment for a view (identity, inbox included). */
function segmentForView(view: View): string {
  return view;
}

/** First path segment of the current location, base-stripped. */
export function currentHeadSegment(): string {
  if (typeof window === 'undefined') return '';
  const base = getBase();
  let path = window.location.pathname;
  if (base && path.startsWith(base)) path = path.slice(base.length);
  const segs = path.split('/').filter(Boolean);
  return segs[0] ?? '';
}

/** Parse the current location into a route state. */
export function parsePath(): RouteState {
  if (typeof window === 'undefined') return { view: 'inbox' };
  const base = getBase();
  let path = window.location.pathname;
  if (base && path.startsWith(base)) path = path.slice(base.length);
  const segs = path.split('/').filter(Boolean).map(decodeURIComponentSafe);

  if (segs.length > 0 && VIEW_SET.has(segs[0])) {
    const view = segs[0] as View;
    if (view === 'inbox') {
      const scope = segs[1] && isValidScope(segs[1]) ? segs[1] : undefined;
      const caseId = segs[2] || undefined;
      return { view, scope, caseId };
    }
    return { view, sub: segs[1] || undefined };
  }

  // ── Legacy fallback: read the old query-param scheme ──────────────────────
  const sp = new URLSearchParams(window.location.search);
  const legacyView = sp.get('view');
  if (legacyView && VIEW_SET.has(legacyView)) {
    const view = legacyView as View;
    if (view === 'inbox') {
      const scope = sp.get('scope') || undefined;
      return { view, scope: scope && isValidScope(scope) ? scope : undefined, caseId: sp.get('case') || undefined };
    }
    return { view, sub: sp.get('sub') || undefined };
  }

  return { view: 'inbox' };
}

/** Build a clean, fresh path for a route state (no leftover query params). */
export function pathFor(state: RouteState): string {
  const base = getBase();
  if (state.view === 'inbox') {
    const parts = ['inbox'];
    // Only emit a scope segment when it's meaningful (not the default) or when
    // a caseId needs a scope in front of it.
    const scope = state.scope && state.scope !== 'inbox' ? state.scope : (state.caseId ? 'all' : '');
    if (scope) parts.push(encodeURIComponent(scope));
    if (state.caseId) parts.push(encodeURIComponent(state.caseId));
    return base + '/' + parts.join('/');
  }
  let p = base + '/' + segmentForView(state.view);
  if (state.sub) p += '/' + encodeURIComponent(state.sub);
  return p;
}

/** Push a new history entry for a route (used on genuine navigations). */
export function pushRoute(state: RouteState): void {
  if (typeof window === 'undefined') return;
  const target = pathFor(state);
  if (window.location.pathname + window.location.search !== target) {
    window.history.pushState({}, '', target);
  }
}

/** Replace the current history entry (used to refine sub-state in place). */
export function replaceRoute(state: RouteState): void {
  if (typeof window === 'undefined') return;
  const target = pathFor(state);
  if (window.location.pathname + window.location.search !== target) {
    window.history.replaceState({}, '', target);
  }
}

function decodeURIComponentSafe(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}
