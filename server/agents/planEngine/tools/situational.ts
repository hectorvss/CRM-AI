/**
 * server/agents/planEngine/tools/situational.ts
 *
 * Read-only "situational awareness" tools — things the operator agent could not
 * see before (notifications, mentions, recent activity, queue counts, SLA about
 * to breach). All are sideEffect:'read'/risk:'none', so they also become part of
 * the `support_readonly` surface the Fin agent consumes.
 */

import type { ToolSpec } from '../types.js';
import { s } from '../schema.js';
import { listNotificationsForUser, getUnreadCount } from '../../../data/notifications.js';
import { listMentionsForUser } from '../../../data/mentions.js';
import { createAuditRepository } from '../../../data/audit.js';
import { createCaseRepository } from '../../../data/cases.js';
import { listSlaAtRisk } from '../../../data/slaPolicies.js';

const auditRepo = createAuditRepository();
const caseRepo = createCaseRepository();

function scope(ctx: { tenantId: string; workspaceId: string | null }) {
  return { tenantId: ctx.tenantId, workspaceId: ctx.workspaceId ?? '' };
}

export const notificationListTool: ToolSpec<{ unreadOnly?: boolean; limit?: number }, unknown> = {
  name: 'notification.list',
  version: '1.0.0',
  description: "List the current user's notifications (assignments, SLA breaches, CSAT, mentions, …).",
  category: 'system',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'inbox.read',
  args: s.object({
    unreadOnly: s.boolean({ required: false, description: 'Only unread notifications.' }),
    limit: s.number({ required: false, integer: true, min: 1, max: 100, description: 'Max to return (default 20).' }),
  }),
  returns: s.any('Unread count + notifications'),
  async run({ args, context }) {
    const userId = context.userId ?? '';
    const [items, unread] = await Promise.all([
      listNotificationsForUser(scope(context), userId, { unreadOnly: args.unreadOnly, limit: args.limit ?? 20 }),
      getUnreadCount(scope(context), userId),
    ]);
    return { ok: true, value: { unread, items } };
  },
};

export const mentionListTool: ToolSpec<{ unreadOnly?: boolean; limit?: number }, unknown> = {
  name: 'mention.list',
  version: '1.0.0',
  description: 'List conversations where the current user was @mentioned.',
  category: 'system',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'inbox.read',
  args: s.object({
    unreadOnly: s.boolean({ required: false, description: 'Only unread mentions.' }),
    limit: s.number({ required: false, integer: true, min: 1, max: 100, description: 'Max to return (default 20).' }),
  }),
  returns: s.any('Mentions for the current user'),
  async run({ args, context }) {
    const items = await listMentionsForUser(scope(context), context.userId ?? '', { unreadOnly: args.unreadOnly, limit: args.limit ?? 20 });
    return { ok: true, value: { items } };
  },
};

export const auditRecentTool: ToolSpec<{ limit?: number }, unknown> = {
  name: 'audit.recent',
  version: '1.0.0',
  description: 'Recent activity in the workspace (who changed what, when) from the audit trail.',
  category: 'system',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'audit.read',
  args: s.object({
    limit: s.number({ required: false, integer: true, min: 1, max: 200, description: 'Max events (default 30).' }),
  }),
  returns: s.any('Recent audit events'),
  async run({ args, context }) {
    const items = await auditRepo.listByWorkspace(scope(context), args.limit ?? 30);
    return { ok: true, value: { items } };
  },
};

export const inboxCountsTool: ToolSpec<Record<string, never>, unknown> = {
  name: 'inbox.counts',
  version: '1.0.0',
  description: 'Queue counts across the inbox: open, unassigned, mine, mentions, escalated, per team/agent.',
  category: 'system',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'inbox.read',
  args: s.object({}),
  returns: s.any('Inbox queue counts'),
  async run({ context }) {
    const counts = await caseRepo.counts(scope(context), context.userId ?? '');
    return { ok: true, value: counts };
  },
};

export const slaAtRiskTool: ToolSpec<{ withinMinutes?: number; limit?: number }, unknown> = {
  name: 'sla.at_risk',
  version: '1.0.0',
  description: 'Conversations whose SLA deadline is about to breach (not yet breached).',
  category: 'system',
  sideEffect: 'read',
  risk: 'none',
  idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({
    withinMinutes: s.number({ required: false, integer: true, min: 1, max: 1440, description: 'Lookahead window (default 60).' }),
    limit: s.number({ required: false, integer: true, min: 1, max: 100, description: 'Max to return (default 20).' }),
  }),
  returns: s.any('SLAs about to breach'),
  async run({ args, context }) {
    const items = await listSlaAtRisk(scope(context), args.withinMinutes ?? 60, args.limit ?? 20);
    return { ok: true, value: { items } };
  },
};
