/**
 * server/agents/planEngine/tools/integrationActions.ts
 *
 * Per-integration action tools for the AI agent.
 *
 * For each connected integration, this file exposes the high-impact actions
 * (create issue, send reply, schedule meeting, upsert contact, etc.) as
 * ToolSpecs the planEngine LLM can plan against.
 *
 * Each tool resolves the per-tenant adapter via the integration's
 * `*ForTenant` resolver, then calls the right method. Errors are normalised
 * to ToolResult { ok: false, error } so the planner can branch.
 *
 * Coverage:
 *   Engineering / PM:      Linear, Jira, GitHub, Asana
 *   Knowledge:             Confluence, Notion, Google Drive
 *   Support inbox:         Front, Intercom, Zendesk
 *   Voice / meetings:      Aircall, Zoom, Google Calendar
 *   CRM:                   HubSpot, Salesforce, Pipedrive
 *   Marketing:             Mailchimp
 *   Team chat:             Slack, Teams
 *   Scheduling:            Calendly
 */

import type { ToolSpec, ToolResult } from '../types.js';
import { s } from '../schema.js';
import { logger } from '../../../utils/logger.js';

import { linearForTenant } from '../../../integrations/linear-tenant.js';
import { jiraForTenant } from '../../../integrations/jira-tenant.js';
import { githubForTenant } from '../../../integrations/github-tenant.js';
import { asanaForTenant } from '../../../integrations/asana-tenant.js';
import { confluenceForTenant } from '../../../integrations/confluence-tenant.js';
import { gdriveForTenant } from '../../../integrations/gdrive-tenant.js';
import { frontForTenant } from '../../../integrations/front-tenant.js';
import { aircallForTenant } from '../../../integrations/aircall-tenant.js';
import { gcalendarForTenant } from '../../../integrations/gcalendar-tenant.js';
import { zoomForTenant } from '../../../integrations/zoom-tenant.js';
import { pipedriveForTenant } from '../../../integrations/pipedrive-tenant.js';
import { mailchimpForTenant } from '../../../integrations/mailchimp-tenant.js';
import { slackForTenant } from '../../../integrations/slack-tenant.js';
import { teamsForTenant } from '../../../integrations/teams-tenant.js';
import { notionForTenant } from '../../../integrations/notion-tenant.js';
import { zendeskForTenant } from '../../../integrations/zendesk-tenant.js';
import { intercomForTenant } from '../../../integrations/intercom-tenant.js';
import { hubspotForTenant } from '../../../integrations/hubspot-tenant.js';
import { salesforceForTenant } from '../../../integrations/salesforce-tenant.js';
import { calendlyForTenant } from '../../../integrations/calendly-tenant.js';
import { klaviyoForTenant } from '../../../integrations/klaviyo-tenant.js';
import { segmentForTenant } from '../../../integrations/segment-tenant.js';
import { quickbooksForTenant } from '../../../integrations/quickbooks-tenant.js';
import { docusignForTenant } from '../../../integrations/docusign-tenant.js';
import { sentryForTenant } from '../../../integrations/sentry-tenant.js';
import { plaidForTenant } from '../../../integrations/plaid-tenant.js';
import { gitlabForTenant } from '../../../integrations/gitlab-tenant.js';
import { discordForTenant } from '../../../integrations/discord-tenant.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function notConnected(system: string): ToolResult {
  return { ok: false, error: `${system} not connected for this tenant`, errorCode: 'INTEGRATION_NOT_CONNECTED' };
}
function fail(system: string, err: unknown): ToolResult {
  const msg = String((err as any)?.message ?? err);
  logger.warn(`integration tool failed`, { system, error: msg });
  return { ok: false, error: `${system}: ${msg}`, errorCode: 'INTEGRATION_API_FAILED' };
}
function dryRunNoop(name: string): ToolResult {
  return { ok: true, value: { simulated: true, tool: name } as any };
}

// ── Linear ────────────────────────────────────────────────────────────────────

export const linearIssueCreateTool: ToolSpec<{ teamId: string; title: string; description?: string; priority?: number; labelIds?: string[]; assigneeId?: string }, unknown> = {
  name: 'linear.issue.create',
  version: '1.0.0',
  description: 'Create a new Linear issue. Use when a customer reports a bug or escalation that engineering must track.',
  category: 'integration',
  sideEffect: 'external', risk: 'medium', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    teamId: s.string({ description: 'Linear team UUID (use linear.team.list to discover)' }),
    title: s.string({ min: 1, max: 256, description: 'Issue title' }),
    description: s.string({ required: false, max: 8000, description: 'Markdown body' }),
    priority: s.number({ required: false, integer: true, min: 0, max: 4, description: '0=none, 1=urgent, 2=high, 3=medium, 4=low' }),
    labelIds: s.array(s.string({}), { required: false, description: 'Label UUIDs to attach' }),
    assigneeId: s.string({ required: false, description: 'Linear user UUID' }),
  }),
  returns: s.any('Created issue { id, identifier, url }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('linear.issue.create');
    const r = await linearForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Linear');
    try {
      const res = await r.adapter.createIssue({ teamId: args.teamId, title: args.title, description: args.description, priority: args.priority as any, labelIds: args.labelIds, assigneeId: args.assigneeId });
      if (!res.issueCreate.success) return fail('Linear', 'issueCreate returned success=false');
      return { ok: true, value: res.issueCreate.issue };
    } catch (err) { return fail('Linear', err); }
  },
};

export const linearIssueSearchTool: ToolSpec<{ stateType?: string; first?: number }, unknown> = {
  name: 'linear.issue.search',
  version: '1.0.0',
  description: 'List/search Linear issues by state (started/unstarted/completed/canceled/triage).',
  category: 'integration', sideEffect: 'read', risk: 'none', idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({
    stateType: s.string({ required: false, description: 'started|unstarted|completed|canceled|triage' }),
    first: s.number({ required: false, integer: true, min: 1, max: 100, description: 'Max results (default 25)' }),
  }),
  returns: s.any('{ nodes: Issue[] }'),
  async run({ args, context }) {
    const r = await linearForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Linear');
    try { return { ok: true, value: await r.adapter.searchIssues({ stateType: args.stateType as any, first: args.first ?? 25 }) }; }
    catch (err) { return fail('Linear', err); }
  },
};

export const linearTeamListTool: ToolSpec<Record<string, never>, unknown> = {
  name: 'linear.team.list',
  version: '1.0.0',
  description: 'List Linear teams.',
  category: 'integration', sideEffect: 'read', risk: 'none', idempotent: true,
  requiredPermission: 'settings.read',
  args: s.object({}, { required: false }),
  returns: s.any('{ teams: { nodes: Team[] } }'),
  async run({ context }) {
    const r = await linearForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Linear');
    try { return { ok: true, value: await r.adapter.listTeams() }; }
    catch (err) { return fail('Linear', err); }
  },
};

// ── Jira ──────────────────────────────────────────────────────────────────────

export const jiraIssueCreateTool: ToolSpec<{ projectKey: string; summary: string; description?: string; issueType?: string; priority?: string; labels?: string[]; assigneeAccountId?: string }, unknown> = {
  name: 'jira.issue.create',
  version: '1.0.0',
  description: 'Create a Jira issue. Use for bug escalation in projects tracked outside Linear.',
  category: 'integration', sideEffect: 'external', risk: 'medium', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    projectKey: s.string({ description: 'Jira project key (e.g. ENG, OPS) — use jira.project.list' }),
    summary: s.string({ min: 1, max: 256, description: 'Issue summary (title)' }),
    description: s.string({ required: false, max: 8000, description: 'Plain text description (auto-converted to ADF)' }),
    issueType: s.string({ required: false, description: 'Bug | Task | Story | Epic — defaults to Task' }),
    priority: s.string({ required: false, description: 'Highest | High | Medium | Low | Lowest' }),
    labels: s.array(s.string({}), { required: false, description: 'Labels to attach' }),
    assigneeAccountId: s.string({ required: false, description: 'Atlassian accountId' }),
  }),
  returns: s.any('{ id, key, self }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('jira.issue.create');
    const r = await jiraForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Jira');
    try {
      const issue = await r.adapter.createIssue({ projectKey: args.projectKey, summary: args.summary, description: args.description, issueTypeName: args.issueType ?? 'Task', priorityName: args.priority, labels: args.labels, assigneeAccountId: args.assigneeAccountId });
      const url = r.connector.siteUrl ? `${r.connector.siteUrl}/browse/${issue.key}` : null;
      return { ok: true, value: { ...issue, url } };
    } catch (err) { return fail('Jira', err); }
  },
};

export const jiraIssueSearchTool: ToolSpec<{ jql: string; maxResults?: number }, unknown> = {
  name: 'jira.issue.search',
  version: '1.0.0',
  description: 'Search Jira issues with JQL (Jira Query Language).',
  category: 'integration', sideEffect: 'read', risk: 'none', idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({
    jql: s.string({ description: 'JQL query (e.g. "project = ENG AND status = Open")' }),
    maxResults: s.number({ required: false, integer: true, min: 1, max: 100, description: 'Default 25' }),
  }),
  returns: s.any('{ issues: Issue[], total: number }'),
  async run({ args, context }) {
    const r = await jiraForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Jira');
    try { return { ok: true, value: await r.adapter.searchIssues({ jql: args.jql, maxResults: args.maxResults ?? 25 }) }; }
    catch (err) { return fail('Jira', err); }
  },
};

export const jiraIssueCommentTool: ToolSpec<{ idOrKey: string; body: string }, unknown> = {
  name: 'jira.issue.comment',
  version: '1.0.0',
  description: 'Add a comment to a Jira issue.',
  category: 'integration', sideEffect: 'external', risk: 'low', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    idOrKey: s.string({ description: 'Jira issue key (e.g. ENG-123) or numeric id' }),
    body: s.string({ min: 1, max: 8000 }),
  }),
  returns: s.any('{ id }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('jira.issue.comment');
    const r = await jiraForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Jira');
    try { return { ok: true, value: await r.adapter.addComment(args.idOrKey, args.body) }; }
    catch (err) { return fail('Jira', err); }
  },
};

export const jiraProjectListTool: ToolSpec<Record<string, never>, unknown> = {
  name: 'jira.project.list',
  version: '1.0.0',
  description: 'List Jira projects.',
  category: 'integration', sideEffect: 'read', risk: 'none', idempotent: true,
  requiredPermission: 'settings.read',
  args: s.object({}, { required: false }),
  returns: s.any('Project[]'),
  async run({ context }) {
    const r = await jiraForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Jira');
    try { return { ok: true, value: await r.adapter.listProjects() }; }
    catch (err) { return fail('Jira', err); }
  },
};

// ── GitHub ────────────────────────────────────────────────────────────────────

export const githubIssueCreateTool: ToolSpec<{ owner: string; repo: string; title: string; body?: string; labels?: string[]; assignees?: string[] }, unknown> = {
  name: 'github.issue.create',
  version: '1.0.0',
  description: 'Create a GitHub issue in a specific repo.',
  category: 'integration', sideEffect: 'external', risk: 'medium', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    owner: s.string({ description: 'Repo owner (user or org login)' }),
    repo: s.string({ description: 'Repo name' }),
    title: s.string({ min: 1, max: 256 }),
    body: s.string({ required: false, max: 60000, description: 'Markdown body' }),
    labels: s.array(s.string({}), { required: false }),
    assignees: s.array(s.string({}), { required: false, description: 'GitHub logins' }),
  }),
  returns: s.any('Issue { number, html_url, ... }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('github.issue.create');
    const r = await githubForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('GitHub');
    try {
      const issue = await r.adapter.createIssue(args.owner, args.repo, { title: args.title, body: args.body, labels: args.labels, assignees: args.assignees });
      return { ok: true, value: { number: issue.number, title: issue.title, html_url: issue.html_url, state: issue.state } };
    } catch (err) { return fail('GitHub', err); }
  },
};

export const githubIssueSearchTool: ToolSpec<{ q: string; perPage?: number }, unknown> = {
  name: 'github.issue.search',
  version: '1.0.0',
  description: 'Search GitHub issues + PRs with the GitHub Search API (e.g. "is:issue is:open repo:org/repo label:bug").',
  category: 'integration', sideEffect: 'read', risk: 'none', idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({
    q: s.string({ description: 'GitHub search qualifier syntax' }),
    perPage: s.number({ required: false, integer: true, min: 1, max: 100 }),
  }),
  returns: s.any('{ total_count, items: Issue[] }'),
  async run({ args, context }) {
    const r = await githubForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('GitHub');
    try { return { ok: true, value: await r.adapter.searchIssues(args.q, args.perPage ?? 25) }; }
    catch (err) { return fail('GitHub', err); }
  },
};

export const githubIssueCommentTool: ToolSpec<{ owner: string; repo: string; number: number; body: string }, unknown> = {
  name: 'github.issue.comment',
  version: '1.0.0',
  description: 'Add a comment to a GitHub issue.',
  category: 'integration', sideEffect: 'external', risk: 'low', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    owner: s.string({}), repo: s.string({}),
    number: s.number({ integer: true, min: 1 }),
    body: s.string({ min: 1, max: 60000 }),
  }),
  returns: s.any('{ id, html_url }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('github.issue.comment');
    const r = await githubForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('GitHub');
    try { return { ok: true, value: await r.adapter.addIssueComment(args.owner, args.repo, args.number, args.body) }; }
    catch (err) { return fail('GitHub', err); }
  },
};

// ── Asana ─────────────────────────────────────────────────────────────────────

export const asanaTaskCreateTool: ToolSpec<{ workspaceGid?: string; name: string; notes?: string; assigneeGid?: string; dueOn?: string; projectGids?: string[] }, unknown> = {
  name: 'asana.task.create',
  version: '1.0.0',
  description: 'Create an Asana task. Use for ops/marketing/legal items (engineering goes to Linear/Jira).',
  category: 'integration', sideEffect: 'external', risk: 'medium', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    workspaceGid: s.string({ required: false, description: 'Workspace GID — defaults to the connector\'s pinned workspace' }),
    name: s.string({ min: 1, max: 1024, description: 'Task name' }),
    notes: s.string({ required: false, max: 8000 }),
    assigneeGid: s.string({ required: false }),
    dueOn: s.string({ required: false, description: 'YYYY-MM-DD' }),
    projectGids: s.array(s.string({}), { required: false }),
  }),
  returns: s.any('Task { gid, name, permalink_url }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('asana.task.create');
    const r = await asanaForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Asana');
    const workspace = args.workspaceGid ?? r.connector.workspaceGid;
    if (!workspace) return { ok: false, error: 'No workspace pinned and none provided', errorCode: 'NO_WORKSPACE' };
    try {
      const task = await r.adapter.createTask({ workspace, name: args.name, notes: args.notes, assignee: args.assigneeGid, due_on: args.dueOn, projects: args.projectGids });
      return { ok: true, value: { gid: task.gid, name: task.name, url: task.permalink_url } };
    } catch (err) { return fail('Asana', err); }
  },
};

export const asanaTaskCommentTool: ToolSpec<{ taskGid: string; text: string }, unknown> = {
  name: 'asana.task.comment',
  version: '1.0.0',
  description: 'Add a story (comment) to an Asana task.',
  category: 'integration', sideEffect: 'external', risk: 'low', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({ taskGid: s.string({}), text: s.string({ min: 1, max: 8000 }) }),
  returns: s.any('{ gid }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('asana.task.comment');
    const r = await asanaForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Asana');
    try { return { ok: true, value: await r.adapter.addTaskComment(args.taskGid, args.text) }; }
    catch (err) { return fail('Asana', err); }
  },
};

// ── Confluence ───────────────────────────────────────────────────────────────

export const confluenceSearchTool: ToolSpec<{ cql: string; limit?: number }, unknown> = {
  name: 'confluence.search',
  version: '1.0.0',
  description: 'Search Confluence pages with CQL. Use to ground answers in your internal docs.',
  category: 'integration', sideEffect: 'read', risk: 'none', idempotent: true,
  requiredPermission: 'knowledge.read',
  args: s.object({
    cql: s.string({ description: 'CQL query (e.g. "type=page AND text ~ \\"refund policy\\"")' }),
    limit: s.number({ required: false, integer: true, min: 1, max: 100 }),
  }),
  returns: s.any('CQL search results'),
  async run({ args, context }) {
    const r = await confluenceForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Confluence');
    try { return { ok: true, value: await r.adapter.search(args.cql, args.limit ?? 25) }; }
    catch (err) { return fail('Confluence', err); }
  },
};

export const confluencePageGetTool: ToolSpec<{ pageId: string; bodyFormat?: string }, unknown> = {
  name: 'confluence.page.get',
  version: '1.0.0',
  description: 'Fetch a Confluence page (with body) by id.',
  category: 'integration', sideEffect: 'read', risk: 'none', idempotent: true,
  requiredPermission: 'knowledge.read',
  args: s.object({
    pageId: s.string({}),
    bodyFormat: s.string({ required: false, description: 'storage | view | atlas_doc_format (default storage)' }),
  }),
  returns: s.any('Confluence page'),
  async run({ args, context }) {
    const r = await confluenceForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Confluence');
    try { return { ok: true, value: await r.adapter.getPage(args.pageId, (args.bodyFormat as any) ?? 'storage') }; }
    catch (err) { return fail('Confluence', err); }
  },
};

// ── Google Drive ──────────────────────────────────────────────────────────────

export const gdriveFileSearchTool: ToolSpec<{ q?: string; limit?: number }, unknown> = {
  name: 'gdrive.file.search',
  version: '1.0.0',
  description: 'Search Google Drive files (read-only). Pass a Drive `q` query string (e.g. "name contains \'invoice\'").',
  category: 'integration', sideEffect: 'read', risk: 'none', idempotent: true,
  requiredPermission: 'knowledge.read',
  args: s.object({
    q: s.string({ required: false, description: 'Drive query syntax' }),
    limit: s.number({ required: false, integer: true, min: 1, max: 200 }),
  }),
  returns: s.any('{ files: GDriveFile[], nextPageToken? }'),
  async run({ args, context }) {
    const r = await gdriveForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Google Drive');
    try { return { ok: true, value: await r.adapter.listFiles({ q: args.q, pageSize: args.limit ?? 50 }) }; }
    catch (err) { return fail('Google Drive', err); }
  },
};

// ── Front ─────────────────────────────────────────────────────────────────────

export const frontReplyTool: ToolSpec<{ conversationId: string; body: string; type?: string; channelId?: string }, unknown> = {
  name: 'front.conversation.reply',
  version: '1.0.0',
  description: 'Send a reply on a Front conversation. Use to respond to customers in the unified inbox.',
  category: 'integration', sideEffect: 'external', risk: 'high', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    conversationId: s.string({ description: 'Front conversation id' }),
    body: s.string({ min: 1, max: 60000 }),
    type: s.string({ required: false, description: 'reply | reply_all | forward (default reply)' }),
    channelId: s.string({ required: false, description: 'Override channel for the reply' }),
  }),
  returns: s.any('{ message_uid }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('front.conversation.reply');
    const r = await frontForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Front');
    try { return { ok: true, value: await r.adapter.sendReply(args.conversationId, { body: args.body, type: (args.type as any) ?? 'reply', channelId: args.channelId }) }; }
    catch (err) { return fail('Front', err); }
  },
};

export const frontCommentTool: ToolSpec<{ conversationId: string; body: string }, unknown> = {
  name: 'front.conversation.comment',
  version: '1.0.0',
  description: 'Add an internal note to a Front conversation (visible only to teammates).',
  category: 'integration', sideEffect: 'external', risk: 'low', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({ conversationId: s.string({}), body: s.string({ min: 1, max: 8000 }) }),
  returns: s.any('{ id }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('front.conversation.comment');
    const r = await frontForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Front');
    try { return { ok: true, value: await r.adapter.addComment(args.conversationId, args.body) }; }
    catch (err) { return fail('Front', err); }
  },
};

export const frontConversationListTool: ToolSpec<{ q?: string; limit?: number }, unknown> = {
  name: 'front.conversation.list',
  version: '1.0.0',
  description: 'List Front conversations matching a query (e.g. "is:open").',
  category: 'integration', sideEffect: 'read', risk: 'none', idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({ q: s.string({ required: false }), limit: s.number({ required: false, integer: true, min: 1, max: 100 }) }),
  returns: s.any('Conversation[]'),
  async run({ args, context }) {
    const r = await frontForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Front');
    try { return { ok: true, value: await r.adapter.listConversations({ q: args.q, limit: args.limit ?? 25 }) }; }
    catch (err) { return fail('Front', err); }
  },
};

// ── Aircall ───────────────────────────────────────────────────────────────────

export const aircallCallCommentTool: ToolSpec<{ callId: number; content: string }, unknown> = {
  name: 'aircall.call.comment',
  version: '1.0.0',
  description: 'Add an internal note to an Aircall call.',
  category: 'integration', sideEffect: 'external', risk: 'low', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({ callId: s.number({ integer: true }), content: s.string({ min: 1, max: 4000 }) }),
  returns: s.any('void'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('aircall.call.comment');
    const r = await aircallForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Aircall');
    try { await r.adapter.addCallComment(args.callId, args.content); return { ok: true, value: { ok: true } }; }
    catch (err) { return fail('Aircall', err); }
  },
};

export const aircallCallGetTool: ToolSpec<{ callId: number }, unknown> = {
  name: 'aircall.call.get',
  version: '1.0.0',
  description: 'Fetch an Aircall call (status, duration, recording URL).',
  category: 'integration', sideEffect: 'read', risk: 'none', idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({ callId: s.number({ integer: true }) }),
  returns: s.any('Call'),
  async run({ args, context }) {
    const r = await aircallForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Aircall');
    try { return { ok: true, value: await r.adapter.getCall(args.callId) }; }
    catch (err) { return fail('Aircall', err); }
  },
};

// ── Google Calendar ──────────────────────────────────────────────────────────

export const gcalEventCreateTool: ToolSpec<{ calendarId?: string; summary: string; description?: string; startISO: string; endISO: string; timeZone?: string; attendees?: string[]; createMeet?: boolean }, unknown> = {
  name: 'gcal.event.create',
  version: '1.0.0',
  description: 'Create a Google Calendar event (optionally with a Meet link). Use to schedule meetings from inbox.',
  category: 'integration', sideEffect: 'external', risk: 'medium', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    calendarId: s.string({ required: false, description: 'Calendar id (default "primary")' }),
    summary: s.string({ min: 1, max: 256 }),
    description: s.string({ required: false, max: 8000 }),
    startISO: s.string({ description: 'RFC3339 start, e.g. 2026-05-10T10:00:00-07:00' }),
    endISO: s.string({ description: 'RFC3339 end' }),
    timeZone: s.string({ required: false, description: 'IANA, e.g. Europe/Madrid' }),
    attendees: s.array(s.string({}), { required: false, description: 'Attendee emails' }),
    createMeet: s.boolean({ required: false, description: 'Auto-create Google Meet link' }),
  }),
  returns: s.any('{ id, htmlLink, hangoutLink? }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('gcal.event.create');
    const r = await gcalendarForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Google Calendar');
    try {
      const event = await r.adapter.createEvent(args.calendarId ?? 'primary', {
        summary: args.summary, description: args.description,
        start: { dateTime: args.startISO, timeZone: args.timeZone },
        end: { dateTime: args.endISO, timeZone: args.timeZone },
        attendees: args.attendees?.map(email => ({ email })),
        conferenceData: args.createMeet ? { createRequest: { requestId: `clain-${Date.now()}` } } : undefined,
      });
      return { ok: true, value: { id: event.id, htmlLink: event.htmlLink, hangoutLink: event.hangoutLink } };
    } catch (err) { return fail('Google Calendar', err); }
  },
};

export const gcalFreeBusyTool: ToolSpec<{ timeMin: string; timeMax: string; calendarIds?: string[]; timeZone?: string }, unknown> = {
  name: 'gcal.freebusy',
  version: '1.0.0',
  description: 'Check availability across calendars in a time window. Use before scheduling.',
  category: 'integration', sideEffect: 'read', risk: 'none', idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({
    timeMin: s.string({ description: 'RFC3339 start' }),
    timeMax: s.string({ description: 'RFC3339 end' }),
    calendarIds: s.array(s.string({}), { required: false, description: 'Default ["primary"]' }),
    timeZone: s.string({ required: false }),
  }),
  returns: s.any('{ [calendarId]: { busy: { start, end }[] } }'),
  async run({ args, context }) {
    const r = await gcalendarForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Google Calendar');
    try { return { ok: true, value: await r.adapter.freeBusy({ timeMin: args.timeMin, timeMax: args.timeMax, calendarIds: args.calendarIds ?? ['primary'], timeZone: args.timeZone }) }; }
    catch (err) { return fail('Google Calendar', err); }
  },
};

// ── Zoom ──────────────────────────────────────────────────────────────────────

export const zoomMeetingCreateTool: ToolSpec<{ topic: string; startTime?: string; duration?: number; timezone?: string; agenda?: string; autoRecording?: string }, unknown> = {
  name: 'zoom.meeting.create',
  version: '1.0.0',
  description: 'Create a Zoom meeting. By default uses cloud recording so transcripts arrive via webhook.',
  category: 'integration', sideEffect: 'external', risk: 'medium', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    topic: s.string({ min: 1, max: 200 }),
    startTime: s.string({ required: false, description: 'RFC3339 start (omit for instant)' }),
    duration: s.number({ required: false, integer: true, min: 1, max: 1440, description: 'Minutes (default 30)' }),
    timezone: s.string({ required: false }),
    agenda: s.string({ required: false, max: 2000 }),
    autoRecording: s.string({ required: false, description: 'cloud | local | none (default cloud)' }),
  }),
  returns: s.any('{ id, topic, join_url, start_time }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('zoom.meeting.create');
    const r = await zoomForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Zoom');
    try {
      const m = await r.adapter.createMeeting({ topic: args.topic, type: 2, start_time: args.startTime, duration: args.duration ?? 30, timezone: args.timezone, agenda: args.agenda, settings: { auto_recording: (args.autoRecording as any) ?? 'cloud' } });
      return { ok: true, value: { id: m.id, topic: m.topic, join_url: m.join_url, start_time: m.start_time } };
    } catch (err) { return fail('Zoom', err); }
  },
};

export const zoomRecordingsListTool: ToolSpec<{ from?: string; to?: string }, unknown> = {
  name: 'zoom.recordings.list',
  version: '1.0.0',
  description: 'List recent Zoom cloud recordings (with download URLs and transcripts when available).',
  category: 'integration', sideEffect: 'read', risk: 'none', idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({
    from: s.string({ required: false, description: 'YYYY-MM-DD (default 30 days ago)' }),
    to: s.string({ required: false, description: 'YYYY-MM-DD' }),
  }),
  returns: s.any('{ recordings: ZoomRecording[] }'),
  async run({ args, context }) {
    const r = await zoomForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Zoom');
    try { return { ok: true, value: await r.adapter.listMyRecordings({ from: args.from, to: args.to }) }; }
    catch (err) { return fail('Zoom', err); }
  },
};

// ── Pipedrive ─────────────────────────────────────────────────────────────────

export const pipedriveDealCreateTool: ToolSpec<{ title: string; value?: number; currency?: string; personId?: number; orgId?: number; stageId?: number; ownerId?: number }, unknown> = {
  name: 'pipedrive.deal.create',
  version: '1.0.0',
  description: 'Create a Pipedrive deal (SMB CRM).',
  category: 'integration', sideEffect: 'external', risk: 'medium', idempotent: false,
  requiredPermission: 'customers.write',
  args: s.object({
    title: s.string({ min: 1, max: 256 }),
    value: s.number({ required: false }),
    currency: s.string({ required: false, description: 'ISO 4217 (e.g. USD, EUR)' }),
    personId: s.number({ required: false, integer: true }),
    orgId: s.number({ required: false, integer: true }),
    stageId: s.number({ required: false, integer: true }),
    ownerId: s.number({ required: false, integer: true }),
  }),
  returns: s.any('Deal'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('pipedrive.deal.create');
    const r = await pipedriveForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Pipedrive');
    try {
      const deal = await r.adapter.createDeal({ title: args.title, value: args.value, currency: args.currency, person_id: args.personId, org_id: args.orgId, stage_id: args.stageId, owner_id: args.ownerId });
      return { ok: true, value: { id: deal.id, title: deal.title, value: deal.value, currency: deal.currency, status: deal.status } };
    } catch (err) { return fail('Pipedrive', err); }
  },
};

export const pipedrivePersonUpsertTool: ToolSpec<{ email: string; name?: string; phone?: string; orgId?: number; ownerId?: number }, unknown> = {
  name: 'pipedrive.person.upsert',
  version: '1.0.0',
  description: 'Find a Pipedrive person by email; create if missing.',
  category: 'integration', sideEffect: 'external', risk: 'low', idempotent: true,
  requiredPermission: 'customers.write',
  args: s.object({
    email: s.string({ description: 'Customer email' }),
    name: s.string({ required: false }),
    phone: s.string({ required: false }),
    orgId: s.number({ required: false, integer: true }),
    ownerId: s.number({ required: false, integer: true }),
  }),
  returns: s.any('{ id, name, found }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('pipedrive.person.upsert');
    const r = await pipedriveForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Pipedrive');
    try {
      const found = await r.adapter.findPersonByEmail(args.email);
      if (found) return { ok: true, value: { id: found.id, name: found.name, found: true } };
      const person = await r.adapter.createPerson({ name: args.name ?? args.email, email: args.email, phone: args.phone, org_id: args.orgId, owner_id: args.ownerId });
      return { ok: true, value: { id: person.id, name: person.name, found: false } };
    } catch (err) { return fail('Pipedrive', err); }
  },
};

export const pipedriveDealNoteTool: ToolSpec<{ dealId: number; content: string }, unknown> = {
  name: 'pipedrive.deal.note',
  version: '1.0.0',
  description: 'Add a note to a Pipedrive deal.',
  category: 'integration', sideEffect: 'external', risk: 'low', idempotent: false,
  requiredPermission: 'customers.write',
  args: s.object({ dealId: s.number({ integer: true }), content: s.string({ min: 1, max: 8000 }) }),
  returns: s.any('{ id }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('pipedrive.deal.note');
    const r = await pipedriveForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Pipedrive');
    try { return { ok: true, value: await r.adapter.addNoteToDeal(args.dealId, args.content) }; }
    catch (err) { return fail('Pipedrive', err); }
  },
};

// ── Mailchimp ─────────────────────────────────────────────────────────────────

export const mailchimpMemberUpsertTool: ToolSpec<{ listId: string; email: string; status?: string; mergeFields?: unknown; tags?: string[] }, unknown> = {
  name: 'mailchimp.member.upsert',
  version: '1.0.0',
  description: 'Subscribe (or update) a member in a Mailchimp audience.',
  category: 'integration', sideEffect: 'external', risk: 'medium', idempotent: true,
  requiredPermission: 'customers.write',
  args: s.object({
    listId: s.string({ description: 'Mailchimp list (audience) id' }),
    email: s.string({}),
    status: s.string({ required: false, description: 'subscribed | unsubscribed | pending | transactional (default subscribed)' }),
    mergeFields: s.any('Optional merge fields'),
    tags: s.array(s.string({}), { required: false }),
  }),
  returns: s.any('{ id, email, status }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('mailchimp.member.upsert');
    const r = await mailchimpForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Mailchimp');
    try {
      const member = await r.adapter.upsertMember(args.listId, { email: args.email, status: args.status as any, merge_fields: args.mergeFields as any, tags: args.tags });
      return { ok: true, value: { id: member.id, email: member.email_address, status: member.status } };
    } catch (err) { return fail('Mailchimp', err); }
  },
};

export const mailchimpMemberTagTool: ToolSpec<{ listId: string; email: string; tag: string }, unknown> = {
  name: 'mailchimp.member.tag',
  version: '1.0.0',
  description: 'Add a tag to a Mailchimp member.',
  category: 'integration', sideEffect: 'external', risk: 'low', idempotent: true,
  requiredPermission: 'customers.write',
  args: s.object({ listId: s.string({}), email: s.string({}), tag: s.string({ min: 1, max: 100 }) }),
  returns: s.any('void'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('mailchimp.member.tag');
    const r = await mailchimpForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Mailchimp');
    try { await r.adapter.addTagToMember(args.listId, args.email, args.tag); return { ok: true, value: { ok: true } }; }
    catch (err) { return fail('Mailchimp', err); }
  },
};

export const mailchimpMemberUnsubscribeTool: ToolSpec<{ listId: string; email: string }, unknown> = {
  name: 'mailchimp.member.unsubscribe',
  version: '1.0.0',
  description: 'Unsubscribe a member from a Mailchimp audience.',
  category: 'integration', sideEffect: 'external', risk: 'medium', idempotent: true,
  requiredPermission: 'customers.write',
  args: s.object({ listId: s.string({}), email: s.string({}) }),
  returns: s.any('void'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('mailchimp.member.unsubscribe');
    const r = await mailchimpForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Mailchimp');
    try { await r.adapter.unsubscribeMember(args.listId, args.email); return { ok: true, value: { ok: true } }; }
    catch (err) { return fail('Mailchimp', err); }
  },
};

// ── Slack ─────────────────────────────────────────────────────────────────────

export const slackPostMessageTool: ToolSpec<{ channel: string; text?: string; blocks?: unknown; threadTs?: string }, unknown> = {
  name: 'slack.message.post',
  version: '1.0.0',
  description: 'Post a message to a Slack channel or DM. `channel` accepts a channel id, name (#general), or user DM (@user / U-id).',
  category: 'integration', sideEffect: 'external', risk: 'medium', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    channel: s.string({ description: 'Channel id or name (#name) or user id (DM)' }),
    text: s.string({ required: false, max: 40000, description: 'Plain-text fallback or full message' }),
    blocks: s.any('Optional Slack Block Kit blocks (array)'),
    threadTs: s.string({ required: false, description: 'Reply in thread (parent message ts)' }),
  }),
  returns: s.any('{ ts, channel }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('slack.message.post');
    const r = await slackForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Slack');
    try {
      const res = await r.adapter.postMessage({ channel: args.channel, text: args.text, blocks: args.blocks as any, thread_ts: args.threadTs });
      return { ok: true, value: { ts: res.ts, channel: res.channel } };
    } catch (err) { return fail('Slack', err); }
  },
};

export const slackLookupUserByEmailTool: ToolSpec<{ email: string }, unknown> = {
  name: 'slack.user.lookup_by_email',
  version: '1.0.0',
  description: 'Resolve a Slack user id from an email (used to DM a teammate).',
  category: 'integration', sideEffect: 'read', risk: 'none', idempotent: true,
  requiredPermission: 'settings.read',
  args: s.object({ email: s.string({}) }),
  returns: s.any('{ user: SlackUser }'),
  async run({ args, context }) {
    const r = await slackForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Slack');
    try { return { ok: true, value: await r.adapter.lookupUserByEmail(args.email) }; }
    catch (err) { return fail('Slack', err); }
  },
};

// ── Microsoft Teams ──────────────────────────────────────────────────────────

export const teamsChannelMessageTool: ToolSpec<{ teamId: string; channelId: string; content: string; contentType?: string }, unknown> = {
  name: 'teams.channel.send_message',
  version: '1.0.0',
  description: 'Send a message to a Microsoft Teams channel.',
  category: 'integration', sideEffect: 'external', risk: 'medium', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    teamId: s.string({}), channelId: s.string({}),
    content: s.string({ min: 1, max: 28000 }),
    contentType: s.string({ required: false, description: 'text | html (default html)' }),
  }),
  returns: s.any('Teams message'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('teams.channel.send_message');
    const r = await teamsForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Teams');
    try { return { ok: true, value: await r.adapter.sendChannelMessage(args.teamId, args.channelId, { contentType: (args.contentType as any) ?? 'html', content: args.content }) }; }
    catch (err) { return fail('Teams', err); }
  },
};

export const teamsChatMessageTool: ToolSpec<{ chatId: string; content: string; contentType?: string }, unknown> = {
  name: 'teams.chat.send_message',
  version: '1.0.0',
  description: 'Send a message to a Microsoft Teams chat (1:1 or group).',
  category: 'integration', sideEffect: 'external', risk: 'medium', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    chatId: s.string({}),
    content: s.string({ min: 1, max: 28000 }),
    contentType: s.string({ required: false, description: 'text | html (default html)' }),
  }),
  returns: s.any('Teams message'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('teams.chat.send_message');
    const r = await teamsForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Teams');
    try { return { ok: true, value: await r.adapter.sendChatMessage(args.chatId, { contentType: (args.contentType as any) ?? 'html', content: args.content }) }; }
    catch (err) { return fail('Teams', err); }
  },
};

// ── Notion ────────────────────────────────────────────────────────────────────

export const notionSearchTool: ToolSpec<{ query?: string; filter?: 'page' | 'database'; pageSize?: number }, unknown> = {
  name: 'notion.search',
  version: '1.0.0',
  description: 'Search Notion pages and databases.',
  category: 'integration', sideEffect: 'read', risk: 'none', idempotent: true,
  requiredPermission: 'knowledge.read',
  args: s.object({
    query: s.string({ required: false }),
    filter: s.enum(['page', 'database'] as const, { required: false }),
    pageSize: s.number({ required: false, integer: true, min: 1, max: 100 }),
  }),
  returns: s.any('Notion search results'),
  async run({ args, context }) {
    const r = await notionForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Notion');
    try {
      const res = await r.adapter.search({ query: args.query, filterObject: args.filter, pageSize: args.pageSize });
      return { ok: true, value: res };
    } catch (err) { return fail('Notion', err); }
  },
};

export const notionPageCreateTool: ToolSpec<{ databaseId?: string; parentPageId?: string; properties: unknown; markdown?: string }, unknown> = {
  name: 'notion.page.create',
  version: '1.0.0',
  description: 'Create a Notion page (under a database or another page). Pass properties using Notion property values.',
  category: 'integration', sideEffect: 'external', risk: 'medium', idempotent: false,
  requiredPermission: 'knowledge.write',
  args: s.object({
    databaseId: s.string({ required: false }),
    parentPageId: s.string({ required: false }),
    properties: s.any('Notion properties object'),
    markdown: s.string({ required: false, max: 30000, description: 'Optional plain markdown body — converted to a single paragraph block' }),
  }),
  returns: s.any('Notion page'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('notion.page.create');
    if (!args.databaseId && !args.parentPageId) return { ok: false, error: 'databaseId or parentPageId is required', errorCode: 'INVALID_ARGS' };
    const r = await notionForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Notion');
    try {
      const children = args.markdown ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: args.markdown.slice(0, 1900) } }] } }] : undefined;
      const page = await r.adapter.createPage({ parent: args.databaseId ? { database_id: args.databaseId } : { page_id: args.parentPageId! }, properties: (args.properties as Record<string, unknown>) ?? {}, children });
      return { ok: true, value: page };
    } catch (err) { return fail('Notion', err); }
  },
};

// ── Zendesk ───────────────────────────────────────────────────────────────────

export const zendeskTicketCreateTool: ToolSpec<{ subject: string; commentBody: string; requesterEmail?: string; priority?: string; tags?: string[]; assigneeId?: number }, unknown> = {
  name: 'zendesk.ticket.create',
  version: '1.0.0',
  description: 'Create a Zendesk ticket on behalf of a customer.',
  category: 'integration', sideEffect: 'external', risk: 'medium', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    subject: s.string({ min: 1, max: 256 }),
    commentBody: s.string({ min: 1, max: 60000 }),
    requesterEmail: s.string({ required: false }),
    priority: s.string({ required: false, description: 'urgent | high | normal | low' }),
    tags: s.array(s.string({}), { required: false }),
    assigneeId: s.number({ required: false, integer: true }),
  }),
  returns: s.any('{ ticket }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('zendesk.ticket.create');
    const r = await zendeskForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Zendesk');
    try {
      const body: any = {
        subject: args.subject,
        comment: { body: args.commentBody, public: true },
        ...(args.requesterEmail ? { requester: { email: args.requesterEmail, name: args.requesterEmail } } : {}),
        ...(args.priority ? { priority: args.priority } : {}),
        ...(args.tags ? { tags: args.tags } : {}),
        ...(args.assigneeId ? { assignee_id: args.assigneeId } : {}),
      };
      const res = await r.adapter.createTicket(body);
      return { ok: true, value: { id: res.ticket.id, status: res.ticket.status, url: (res.ticket as any).url ?? null } };
    } catch (err) { return fail('Zendesk', err); }
  },
};

export const zendeskTicketCommentTool: ToolSpec<{ ticketId: number; body: string; isPublic?: boolean }, unknown> = {
  name: 'zendesk.ticket.comment',
  version: '1.0.0',
  description: 'Add a comment to a Zendesk ticket. Public comments are visible to the requester; internal notes are not.',
  category: 'integration', sideEffect: 'external', risk: 'medium', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    ticketId: s.number({ integer: true }),
    body: s.string({ min: 1, max: 60000 }),
    isPublic: s.boolean({ required: false, description: 'Default true (public reply)' }),
  }),
  returns: s.any('{ ticket }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('zendesk.ticket.comment');
    const r = await zendeskForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Zendesk');
    try { return { ok: true, value: await r.adapter.addComment(args.ticketId, { body: args.body, public: args.isPublic ?? true }) }; }
    catch (err) { return fail('Zendesk', err); }
  },
};

export const zendeskTicketUpdateTool: ToolSpec<{ ticketId: number; status?: string; priority?: string; assigneeId?: number; tags?: string[] }, unknown> = {
  name: 'zendesk.ticket.update',
  version: '1.0.0',
  description: 'Update a Zendesk ticket (status, priority, assignee, tags).',
  category: 'integration', sideEffect: 'external', risk: 'medium', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    ticketId: s.number({ integer: true }),
    status: s.string({ required: false, description: 'new | open | pending | hold | solved | closed' }),
    priority: s.string({ required: false }),
    assigneeId: s.number({ required: false, integer: true }),
    tags: s.array(s.string({}), { required: false }),
  }),
  returns: s.any('{ ticket }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('zendesk.ticket.update');
    const r = await zendeskForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Zendesk');
    const patch: any = {};
    if (args.status) patch.status = args.status;
    if (args.priority) patch.priority = args.priority;
    if (args.assigneeId) patch.assignee_id = args.assigneeId;
    if (args.tags) patch.tags = args.tags;
    try { return { ok: true, value: await r.adapter.updateTicket(args.ticketId, patch) }; }
    catch (err) { return fail('Zendesk', err); }
  },
};

// ── Intercom ──────────────────────────────────────────────────────────────────

export const intercomConversationReplyTool: ToolSpec<{ conversationId: string; body: string; messageType?: string; adminId?: string }, unknown> = {
  name: 'intercom.conversation.reply',
  version: '1.0.0',
  description: 'Reply on an Intercom conversation as an admin/agent.',
  category: 'integration', sideEffect: 'external', risk: 'high', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    conversationId: s.string({}),
    body: s.string({ min: 1, max: 60000 }),
    messageType: s.string({ required: false, description: 'comment | note (default comment = public)' }),
    adminId: s.string({ required: false, description: 'Intercom admin id' }),
  }),
  returns: s.any('Intercom conversation'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('intercom.conversation.reply');
    const r = await intercomForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Intercom');
    try {
      const adminId = args.adminId ?? r.connector.adminId;
      if (!adminId) return { ok: false, error: 'No adminId provided and connector has no default admin', errorCode: 'NO_ADMIN' };
      return { ok: true, value: await r.adapter.replyToConversation(args.conversationId, { type: 'admin', admin_id: adminId, message_type: (args.messageType as any) ?? 'comment', body: args.body }) };
    } catch (err) { return fail('Intercom', err); }
  },
};

export const intercomContactUpsertTool: ToolSpec<{ email: string; name?: string; phone?: string; role?: string }, unknown> = {
  name: 'intercom.contact.upsert',
  version: '1.0.0',
  description: 'Find an Intercom contact by email; create if missing.',
  category: 'integration', sideEffect: 'external', risk: 'low', idempotent: true,
  requiredPermission: 'customers.write',
  args: s.object({
    email: s.string({}), name: s.string({ required: false }),
    phone: s.string({ required: false }),
    role: s.string({ required: false, description: 'user | lead (default user)' }),
  }),
  returns: s.any('{ id, email, found }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('intercom.contact.upsert');
    const r = await intercomForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Intercom');
    try {
      const found = await r.adapter.findContactByEmail(args.email);
      if (found) return { ok: true, value: { id: found.id, email: found.email, found: true } };
      const created = await r.adapter.createContact({ email: args.email, name: args.name, phone: args.phone, role: (args.role as any) ?? 'user' });
      return { ok: true, value: { id: created.id, email: created.email, found: false } };
    } catch (err) { return fail('Intercom', err); }
  },
};

// ── HubSpot ───────────────────────────────────────────────────────────────────

export const hubspotContactUpsertTool: ToolSpec<{ email: string; properties?: unknown }, unknown> = {
  name: 'hubspot.contact.upsert',
  version: '1.0.0',
  description: 'Upsert a HubSpot contact by email.',
  category: 'integration', sideEffect: 'external', risk: 'low', idempotent: true,
  requiredPermission: 'customers.write',
  args: s.object({
    email: s.string({}),
    properties: s.any('HubSpot contact properties (firstname, lastname, phone, company, lifecyclestage, etc.)'),
  }),
  returns: s.any('HubSpot contact'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('hubspot.contact.upsert');
    const r = await hubspotForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('HubSpot');
    try { return { ok: true, value: await r.adapter.upsertContactByEmail(args.email, (args.properties as Record<string, unknown>) ?? {}) }; }
    catch (err) { return fail('HubSpot', err); }
  },
};

export const hubspotTicketCreateTool: ToolSpec<{ subject: string; content?: string; priority?: string; pipelineStage?: string; ownerId?: string; associatedContactId?: string }, unknown> = {
  name: 'hubspot.ticket.create',
  version: '1.0.0',
  description: 'Create a HubSpot ticket and optionally associate it with a contact.',
  category: 'integration', sideEffect: 'external', risk: 'medium', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    subject: s.string({ min: 1, max: 256 }),
    content: s.string({ required: false, max: 60000 }),
    priority: s.string({ required: false, description: 'LOW | MEDIUM | HIGH' }),
    pipelineStage: s.string({ required: false }),
    ownerId: s.string({ required: false }),
    associatedContactId: s.string({ required: false }),
  }),
  returns: s.any('HubSpot ticket'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('hubspot.ticket.create');
    const r = await hubspotForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('HubSpot');
    try {
      const payload: any = { subject: args.subject };
      if (args.content) payload.content = args.content;
      if (args.priority) payload.hs_ticket_priority = args.priority;
      if (args.pipelineStage) payload.hs_pipeline_stage = args.pipelineStage;
      if (args.ownerId) payload.hubspot_owner_id = args.ownerId;
      return { ok: true, value: await r.adapter.createTicket(payload, args.associatedContactId) };
    } catch (err) { return fail('HubSpot', err); }
  },
};

// ── Salesforce ────────────────────────────────────────────────────────────────

export const salesforceCaseCreateTool: ToolSpec<{ subject: string; description?: string; status?: string; priority?: string; origin?: string; contactId?: string; suppliedEmail?: string; suppliedName?: string }, unknown> = {
  name: 'salesforce.case.create',
  version: '1.0.0',
  description: 'Create a Salesforce Case record.',
  category: 'integration', sideEffect: 'external', risk: 'medium', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    subject: s.string({ min: 1, max: 256 }),
    description: s.string({ required: false, max: 32000 }),
    status: s.string({ required: false }),
    priority: s.string({ required: false }),
    origin: s.string({ required: false }),
    contactId: s.string({ required: false }),
    suppliedEmail: s.string({ required: false }),
    suppliedName: s.string({ required: false }),
  }),
  returns: s.any('{ id, success }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('salesforce.case.create');
    const r = await salesforceForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Salesforce');
    try {
      return { ok: true, value: await r.adapter.createCase({
        Subject: args.subject, Description: args.description, Status: args.status,
        Priority: args.priority, Origin: args.origin,
        ContactId: args.contactId, SuppliedEmail: args.suppliedEmail, SuppliedName: args.suppliedName,
      }) };
    } catch (err) { return fail('Salesforce', err); }
  },
};

export const salesforceContactFindTool: ToolSpec<{ email: string }, unknown> = {
  name: 'salesforce.contact.find_by_email',
  version: '1.0.0',
  description: 'Find a Salesforce Contact by email.',
  category: 'integration', sideEffect: 'read', risk: 'none', idempotent: true,
  requiredPermission: 'customers.read',
  args: s.object({ email: s.string({}) }),
  returns: s.any('Contact | null'),
  async run({ args, context }) {
    const r = await salesforceForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Salesforce');
    try { return { ok: true, value: await r.adapter.findContactByEmail(args.email) }; }
    catch (err) { return fail('Salesforce', err); }
  },
};

export const salesforceCaseCommentTool: ToolSpec<{ caseId: string; body: string; isPublished?: boolean }, unknown> = {
  name: 'salesforce.case.comment',
  version: '1.0.0',
  description: 'Add a comment to a Salesforce Case.',
  category: 'integration', sideEffect: 'external', risk: 'low', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    caseId: s.string({}),
    body: s.string({ min: 1, max: 32000 }),
    isPublished: s.boolean({ required: false, description: 'Default true (visible in Customer Portal)' }),
  }),
  returns: s.any('Salesforce comment'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('salesforce.case.comment');
    const r = await salesforceForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Salesforce');
    try { return { ok: true, value: await r.adapter.commentOnCase(args.caseId, args.body, args.isPublished ?? true) }; }
    catch (err) { return fail('Salesforce', err); }
  },
};

// ── Calendly ──────────────────────────────────────────────────────────────────

export const calendlyEventListTool: ToolSpec<{ status?: string; minStartTime?: string; maxStartTime?: string; count?: number }, unknown> = {
  name: 'calendly.event.list',
  version: '1.0.0',
  description: 'List Calendly scheduled events for the connected user/organization.',
  category: 'integration', sideEffect: 'read', risk: 'none', idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({
    status: s.string({ required: false, description: 'active | canceled' }),
    minStartTime: s.string({ required: false, description: 'RFC3339' }),
    maxStartTime: s.string({ required: false, description: 'RFC3339' }),
    count: s.number({ required: false, integer: true, min: 1, max: 100 }),
  }),
  returns: s.any('Calendly events list'),
  async run({ args, context }) {
    const r = await calendlyForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Calendly');
    try {
      return { ok: true, value: await r.adapter.listScheduledEvents({
        organization: r.connector.organizationUri, status: args.status as any,
        minStartTime: args.minStartTime, maxStartTime: args.maxStartTime, count: args.count ?? 25,
      } as any) };
    } catch (err) { return fail('Calendly', err); }
  },
};

// ── Klaviyo ───────────────────────────────────────────────────────────────────

export const klaviyoProfileUpsertTool: ToolSpec<{ email: string; phone?: string; firstName?: string; lastName?: string; properties?: unknown }, unknown> = {
  name: 'klaviyo.profile.upsert',
  version: '1.0.0',
  description: 'Upsert a Klaviyo profile (subscriber) by email.',
  category: 'integration', sideEffect: 'external', risk: 'low', idempotent: true,
  requiredPermission: 'customers.write',
  args: s.object({ email: s.string({}), phone: s.string({ required: false }), firstName: s.string({ required: false }), lastName: s.string({ required: false }), properties: s.any('Custom properties') }),
  returns: s.any('Klaviyo profile'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('klaviyo.profile.upsert');
    const r = await klaviyoForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Klaviyo');
    try {
      const profile = await r.adapter.upsertProfile(args.email, { phone: args.phone, firstName: args.firstName, lastName: args.lastName, properties: args.properties as any });
      return { ok: true, value: { id: profile.id, email: profile.attributes.email } };
    } catch (err) { return fail('Klaviyo', err); }
  },
};

export const klaviyoEventTrackTool: ToolSpec<{ metric: string; profileEmail: string; properties?: unknown; value?: number; uniqueId?: string }, unknown> = {
  name: 'klaviyo.event.track',
  version: '1.0.0',
  description: 'Track a custom event in Klaviyo (e.g. "Viewed Product", "Started Checkout").',
  category: 'integration', sideEffect: 'external', risk: 'low', idempotent: false,
  requiredPermission: 'customers.write',
  args: s.object({ metric: s.string({ description: 'Event/metric name' }), profileEmail: s.string({}), properties: s.any('Event properties'), value: s.number({ required: false, description: 'Monetary value (e.g. cart total)' }), uniqueId: s.string({ required: false, description: 'Idempotency key' }) }),
  returns: s.any('void'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('klaviyo.event.track');
    const r = await klaviyoForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Klaviyo');
    try { await r.adapter.trackEvent({ metric: args.metric, profileEmail: args.profileEmail, properties: args.properties as any, value: args.value, uniqueId: args.uniqueId }); return { ok: true, value: { ok: true } }; }
    catch (err) { return fail('Klaviyo', err); }
  },
};

export const klaviyoSubscribeTool: ToolSpec<{ listId: string; email: string; phone?: string; sms?: boolean; emailMarketing?: boolean }, unknown> = {
  name: 'klaviyo.list.subscribe',
  version: '1.0.0',
  description: 'Subscribe a profile to a Klaviyo list with explicit consent.',
  category: 'integration', sideEffect: 'external', risk: 'medium', idempotent: true,
  requiredPermission: 'customers.write',
  args: s.object({ listId: s.string({}), email: s.string({}), phone: s.string({ required: false }), sms: s.boolean({ required: false }), emailMarketing: s.boolean({ required: false, description: 'Default true' }) }),
  returns: s.any('void'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('klaviyo.list.subscribe');
    const r = await klaviyoForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Klaviyo');
    try { await r.adapter.subscribeProfileToList(args.listId, args.email, { phone: args.phone, sms: args.sms, email: args.emailMarketing !== false }); return { ok: true, value: { ok: true } }; }
    catch (err) { return fail('Klaviyo', err); }
  },
};

// ── Segment ───────────────────────────────────────────────────────────────────

export const segmentIdentifyTool: ToolSpec<{ userId?: string; anonymousId?: string; traits?: unknown; context?: unknown }, unknown> = {
  name: 'segment.identify',
  version: '1.0.0',
  description: 'Send a Segment identify call. Updates user traits across all destinations.',
  category: 'integration', sideEffect: 'external', risk: 'low', idempotent: true,
  requiredPermission: 'customers.write',
  args: s.object({ userId: s.string({ required: false }), anonymousId: s.string({ required: false }), traits: s.any('User traits'), context: s.any('Optional context') }),
  returns: s.any('void'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('segment.identify');
    if (!args.userId && !args.anonymousId) return { ok: false, error: 'userId or anonymousId required', errorCode: 'INVALID_ARGS' };
    const r = await segmentForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Segment');
    try { await r.adapter.identify({ userId: args.userId, anonymousId: args.anonymousId, traits: args.traits as any, context: args.context as any }); return { ok: true, value: { ok: true } }; }
    catch (err) { return fail('Segment', err); }
  },
};

export const segmentTrackTool: ToolSpec<{ event: string; userId?: string; anonymousId?: string; properties?: unknown; context?: unknown }, unknown> = {
  name: 'segment.track',
  version: '1.0.0',
  description: 'Send a Segment track call. Records a custom event that fans out to all destinations.',
  category: 'integration', sideEffect: 'external', risk: 'low', idempotent: false,
  requiredPermission: 'customers.write',
  args: s.object({ event: s.string({}), userId: s.string({ required: false }), anonymousId: s.string({ required: false }), properties: s.any('Event properties'), context: s.any('Optional context') }),
  returns: s.any('void'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('segment.track');
    if (!args.userId && !args.anonymousId) return { ok: false, error: 'userId or anonymousId required', errorCode: 'INVALID_ARGS' };
    const r = await segmentForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Segment');
    try { await r.adapter.track({ event: args.event, userId: args.userId, anonymousId: args.anonymousId, properties: args.properties as any, context: args.context as any }); return { ok: true, value: { ok: true } }; }
    catch (err) { return fail('Segment', err); }
  },
};

// ── QuickBooks ────────────────────────────────────────────────────────────────

export const quickbooksCustomerUpsertTool: ToolSpec<{ email?: string; displayName: string; phone?: string; companyName?: string }, unknown> = {
  name: 'quickbooks.customer.upsert',
  version: '1.0.0',
  description: 'Find or create a QuickBooks customer.',
  category: 'integration', sideEffect: 'external', risk: 'low', idempotent: true,
  requiredPermission: 'customers.write',
  args: s.object({ email: s.string({ required: false }), displayName: s.string({}), phone: s.string({ required: false }), companyName: s.string({ required: false }) }),
  returns: s.any('{ id, name, found }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('quickbooks.customer.upsert');
    const r = await quickbooksForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('QuickBooks');
    try {
      if (args.email) {
        const found = await r.adapter.findCustomerByEmail(args.email);
        if (found) return { ok: true, value: { id: found.Id, name: found.DisplayName, found: true } };
      }
      const created = await r.adapter.createCustomer({ displayName: args.displayName, email: args.email, phone: args.phone, companyName: args.companyName });
      return { ok: true, value: { id: created.Id, name: created.DisplayName, found: false } };
    } catch (err) { return fail('QuickBooks', err); }
  },
};

export const quickbooksCreditMemoTool: ToolSpec<{ customerId: string; totalAmt: number; description?: string }, unknown> = {
  name: 'quickbooks.credit_memo.create',
  version: '1.0.0',
  description: 'Create a credit memo in QuickBooks (typically the accounting side of a Stripe refund).',
  category: 'integration', sideEffect: 'external', risk: 'high', idempotent: false,
  requiredPermission: 'payments.write',
  args: s.object({ customerId: s.string({}), totalAmt: s.number({ min: 0.01 }), description: s.string({ required: false }) }),
  returns: s.any('{ id, total }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('quickbooks.credit_memo.create');
    const r = await quickbooksForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('QuickBooks');
    try {
      const cm = await r.adapter.createCreditMemo({ customerId: args.customerId, totalAmt: args.totalAmt, lines: [{ amount: args.totalAmt, description: args.description ?? 'Refund' }] });
      return { ok: true, value: { id: cm.Id, total: cm.TotalAmt } };
    } catch (err) { return fail('QuickBooks', err); }
  },
};

// ── DocuSign ──────────────────────────────────────────────────────────────────

export const docusignEnvelopeCreateTool: ToolSpec<{ emailSubject: string; emailBlurb?: string; templateId?: string; templateRoles?: unknown; documents?: unknown; recipients?: unknown; draft?: boolean }, unknown> = {
  name: 'docusign.envelope.create',
  version: '1.0.0',
  description: 'Send a DocuSign envelope (from a template or raw documents). Use to close deals B2B.',
  category: 'integration', sideEffect: 'external', risk: 'high', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    emailSubject: s.string({ min: 1, max: 256 }),
    emailBlurb: s.string({ required: false, max: 8000 }),
    templateId: s.string({ required: false }),
    templateRoles: s.any('[{ name, email, roleName, clientUserId? }]'),
    documents: s.any('[{ name, documentId, fileExtension, documentBase64 }]'),
    recipients: s.any('{ signers: [...], carbonCopies: [...] }'),
    draft: s.boolean({ required: false, description: 'Create as draft instead of sending' }),
  }),
  returns: s.any('{ envelopeId, status }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('docusign.envelope.create');
    const r = await docusignForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('DocuSign');
    try {
      const env = await r.adapter.createEnvelope({
        emailSubject: args.emailSubject, emailBlurb: args.emailBlurb,
        status: args.draft ? 'created' : 'sent',
        templateId: args.templateId, templateRoles: args.templateRoles as any,
        documents: args.documents as any, recipients: args.recipients as any,
      });
      return { ok: true, value: env };
    } catch (err) { return fail('DocuSign', err); }
  },
};

export const docusignEnvelopeVoidTool: ToolSpec<{ envelopeId: string; reason: string }, unknown> = {
  name: 'docusign.envelope.void',
  version: '1.0.0',
  description: 'Void a DocuSign envelope (cancel before all signatures collected).',
  category: 'integration', sideEffect: 'external', risk: 'high', idempotent: true,
  requiredPermission: 'cases.write',
  args: s.object({ envelopeId: s.string({}), reason: s.string({ min: 1, max: 200 }) }),
  returns: s.any('void'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('docusign.envelope.void');
    const r = await docusignForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('DocuSign');
    try { await r.adapter.voidEnvelope(args.envelopeId, args.reason); return { ok: true, value: { ok: true } }; }
    catch (err) { return fail('DocuSign', err); }
  },
};

// ── Sentry ────────────────────────────────────────────────────────────────────

export const sentryIssueResolveTool: ToolSpec<{ issueId: string }, unknown> = {
  name: 'sentry.issue.resolve',
  version: '1.0.0',
  description: 'Mark a Sentry issue as resolved.',
  category: 'integration', sideEffect: 'external', risk: 'medium', idempotent: true,
  requiredPermission: 'cases.write',
  args: s.object({ issueId: s.string({}) }),
  returns: s.any('Sentry issue'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('sentry.issue.resolve');
    const r = await sentryForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Sentry');
    try { return { ok: true, value: await r.adapter.resolveIssue(args.issueId) }; }
    catch (err) { return fail('Sentry', err); }
  },
};

export const sentryIssueCommentTool: ToolSpec<{ issueId: string; text: string }, unknown> = {
  name: 'sentry.issue.comment',
  version: '1.0.0',
  description: 'Add a comment to a Sentry issue.',
  category: 'integration', sideEffect: 'external', risk: 'low', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({ issueId: s.string({}), text: s.string({ min: 1, max: 8000 }) }),
  returns: s.any('{ id }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('sentry.issue.comment');
    const r = await sentryForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Sentry');
    try { return { ok: true, value: await r.adapter.addIssueComment(args.issueId, args.text) }; }
    catch (err) { return fail('Sentry', err); }
  },
};

export const sentryIssueSearchTool: ToolSpec<{ query?: string; statsPeriod?: string; limit?: number }, unknown> = {
  name: 'sentry.issue.search',
  version: '1.0.0',
  description: 'Search Sentry issues across the connected organisation.',
  category: 'integration', sideEffect: 'read', risk: 'none', idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({ query: s.string({ required: false, description: 'e.g. "is:unresolved level:error"' }), statsPeriod: s.string({ required: false, description: 'e.g. 24h, 7d, 14d' }), limit: s.number({ required: false, integer: true, min: 1, max: 100 }) }),
  returns: s.any('Issue[]'),
  async run({ args, context }) {
    const r = await sentryForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Sentry');
    try {
      const orgs = await r.adapter.listOrganizations();
      const orgSlug = orgs[0]?.slug;
      if (!orgSlug) return { ok: false, error: 'No organisation accessible', errorCode: 'NO_ORG' };
      return { ok: true, value: await r.adapter.listIssues(orgSlug, { query: args.query, statsPeriod: args.statsPeriod, limit: args.limit ?? 25 }) };
    } catch (err) { return fail('Sentry', err); }
  },
};

// ── Plaid ─────────────────────────────────────────────────────────────────────

export const plaidLinkTokenCreateTool: ToolSpec<{ userClientId: string; products?: string[]; countryCodes?: string[]; language?: string }, unknown> = {
  name: 'plaid.link_token.create',
  version: '1.0.0',
  description: 'Generate a Plaid Link token for a customer to onboard their bank in your frontend.',
  category: 'integration', sideEffect: 'external', risk: 'medium', idempotent: false,
  requiredPermission: 'customers.write',
  args: s.object({
    userClientId: s.string({ description: 'Stable id for the customer (used by Plaid to dedupe)' }),
    products: s.array(s.string({}), { required: false, description: 'Default ["auth", "identity"]' }),
    countryCodes: s.array(s.string({}), { required: false, description: 'Default ["US"]' }),
    language: s.string({ required: false, description: 'Default "en"' }),
  }),
  returns: s.any('{ link_token, expiration }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('plaid.link_token.create');
    const r = await plaidForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Plaid');
    try {
      const t = await r.adapter.createLinkToken({
        userClientId: args.userClientId, clientName: 'Clain',
        products: args.products ?? ['auth', 'identity'], countryCodes: args.countryCodes ?? ['US'],
        language: args.language ?? 'en',
      });
      return { ok: true, value: { link_token: t.link_token, expiration: t.expiration } };
    } catch (err) { return fail('Plaid', err); }
  },
};

export const plaidExchangeTokenTool: ToolSpec<{ publicToken: string }, unknown> = {
  name: 'plaid.public_token.exchange',
  version: '1.0.0',
  description: 'Exchange a public_token (from Plaid Link onSuccess) for a permanent access_token.',
  category: 'integration', sideEffect: 'external', risk: 'medium', idempotent: false,
  requiredPermission: 'customers.write',
  args: s.object({ publicToken: s.string({}) }),
  returns: s.any('{ item_id, access_token }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('plaid.public_token.exchange');
    const r = await plaidForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Plaid');
    try { return { ok: true, value: await r.adapter.exchangePublicToken(args.publicToken) }; }
    catch (err) { return fail('Plaid', err); }
  },
};

export const plaidAccountsGetTool: ToolSpec<{ accessToken: string }, unknown> = {
  name: 'plaid.accounts.get',
  version: '1.0.0',
  description: 'Fetch bank accounts for a Plaid item (using the per-item access_token).',
  category: 'integration', sideEffect: 'read', risk: 'none', idempotent: true,
  requiredPermission: 'customers.read',
  args: s.object({ accessToken: s.string({}) }),
  returns: s.any('Account[]'),
  async run({ args, context }) {
    const r = await plaidForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Plaid');
    try { return { ok: true, value: await r.adapter.getAccounts(args.accessToken) }; }
    catch (err) { return fail('Plaid', err); }
  },
};

// ── GitLab ────────────────────────────────────────────────────────────────────

export const gitlabIssueCreateTool: ToolSpec<{ projectId: number | string; title: string; description?: string; labels?: string[]; assigneeIds?: number[] }, unknown> = {
  name: 'gitlab.issue.create',
  version: '1.0.0',
  description: 'Create a GitLab issue in a project.',
  category: 'integration', sideEffect: 'external', risk: 'medium', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    projectId: s.string({ description: 'Project id (numeric) or full path (encoded)' }),
    title: s.string({ min: 1, max: 256 }),
    description: s.string({ required: false, max: 60000 }),
    labels: s.array(s.string({}), { required: false }),
    assigneeIds: s.array(s.number({ integer: true }), { required: false }),
  }),
  returns: s.any('Issue'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('gitlab.issue.create');
    const r = await gitlabForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('GitLab');
    try {
      const issue = await r.adapter.createIssue(args.projectId, { title: args.title, description: args.description, labels: args.labels, assigneeIds: args.assigneeIds });
      return { ok: true, value: { iid: issue.iid, title: issue.title, url: issue.web_url } };
    } catch (err) { return fail('GitLab', err); }
  },
};

export const gitlabIssueSearchTool: ToolSpec<{ scope: 'created_by_me' | 'assigned_to_me' | 'all'; search?: string; state?: string; perPage?: number }, unknown> = {
  name: 'gitlab.issue.search',
  version: '1.0.0',
  description: 'Search GitLab issues across all accessible projects.',
  category: 'integration', sideEffect: 'read', risk: 'none', idempotent: true,
  requiredPermission: 'cases.read',
  args: s.object({
    scope: s.enum(['created_by_me', 'assigned_to_me', 'all'] as const),
    search: s.string({ required: false }),
    state: s.string({ required: false, description: 'opened | closed' }),
    perPage: s.number({ required: false, integer: true, min: 1, max: 100 }),
  }),
  returns: s.any('Issue[]'),
  async run({ args, context }) {
    const r = await gitlabForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('GitLab');
    try { return { ok: true, value: await r.adapter.searchIssues(args.scope, { search: args.search, state: args.state as any, perPage: args.perPage ?? 25 }) }; }
    catch (err) { return fail('GitLab', err); }
  },
};

export const gitlabIssueNoteTool: ToolSpec<{ projectId: number | string; iid: number; body: string }, unknown> = {
  name: 'gitlab.issue.note',
  version: '1.0.0',
  description: 'Add a note (comment) to a GitLab issue.',
  category: 'integration', sideEffect: 'external', risk: 'low', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({ projectId: s.string({}), iid: s.number({ integer: true }), body: s.string({ min: 1, max: 60000 }) }),
  returns: s.any('Note'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('gitlab.issue.note');
    const r = await gitlabForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('GitLab');
    try { return { ok: true, value: await r.adapter.addIssueNote(args.projectId, args.iid, args.body) }; }
    catch (err) { return fail('GitLab', err); }
  },
};

// ── Discord ───────────────────────────────────────────────────────────────────

export const discordSendMessageTool: ToolSpec<{ channelId: string; content: string; embeds?: unknown; replyToMessageId?: string }, unknown> = {
  name: 'discord.message.send',
  version: '1.0.0',
  description: 'Send a message to a Discord channel as the bot.',
  category: 'integration', sideEffect: 'external', risk: 'medium', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({
    channelId: s.string({ description: 'Discord channel snowflake id' }),
    content: s.string({ min: 1, max: 2000 }),
    embeds: s.any('Optional Discord embed array'),
    replyToMessageId: s.string({ required: false, description: 'Reply to a specific message' }),
  }),
  returns: s.any('{ id, channel_id }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('discord.message.send');
    const r = await discordForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Discord');
    try {
      const m = await r.adapter.sendMessage(args.channelId, {
        content: args.content,
        embeds: args.embeds as any,
        message_reference: args.replyToMessageId ? { message_id: args.replyToMessageId, channel_id: args.channelId, fail_if_not_exists: false } : undefined,
      });
      return { ok: true, value: { id: m.id, channel_id: m.channel_id } };
    } catch (err) { return fail('Discord', err); }
  },
};

export const discordSendDmTool: ToolSpec<{ userId: string; content: string }, unknown> = {
  name: 'discord.dm.send',
  version: '1.0.0',
  description: 'Send a DM to a Discord user as the bot.',
  category: 'integration', sideEffect: 'external', risk: 'high', idempotent: false,
  requiredPermission: 'cases.write',
  args: s.object({ userId: s.string({}), content: s.string({ min: 1, max: 2000 }) }),
  returns: s.any('{ channel_id, message_id }'),
  async run({ args, context }) {
    if (context.dryRun) return dryRunNoop('discord.dm.send');
    const r = await discordForTenant(context.tenantId, context.workspaceId);
    if (!r) return notConnected('Discord');
    try {
      const channel = await r.adapter.createDM(args.userId);
      const m = await r.adapter.sendMessage(channel.id, { content: args.content });
      return { ok: true, value: { channel_id: channel.id, message_id: m.id } };
    } catch (err) { return fail('Discord', err); }
  },
};

// ── Aggregated export for tools/index.ts ─────────────────────────────────────

export const ALL_INTEGRATION_ACTION_TOOLS: ToolSpec<any, any>[] = [
  // Linear
  linearIssueCreateTool, linearIssueSearchTool, linearTeamListTool,
  // Jira
  jiraIssueCreateTool, jiraIssueSearchTool, jiraIssueCommentTool, jiraProjectListTool,
  // GitHub
  githubIssueCreateTool, githubIssueSearchTool, githubIssueCommentTool,
  // Asana
  asanaTaskCreateTool, asanaTaskCommentTool,
  // Confluence
  confluenceSearchTool, confluencePageGetTool,
  // Google Drive
  gdriveFileSearchTool,
  // Front
  frontReplyTool, frontCommentTool, frontConversationListTool,
  // Aircall
  aircallCallCommentTool, aircallCallGetTool,
  // Google Calendar
  gcalEventCreateTool, gcalFreeBusyTool,
  // Zoom
  zoomMeetingCreateTool, zoomRecordingsListTool,
  // Pipedrive
  pipedriveDealCreateTool, pipedrivePersonUpsertTool, pipedriveDealNoteTool,
  // Mailchimp
  mailchimpMemberUpsertTool, mailchimpMemberTagTool, mailchimpMemberUnsubscribeTool,
  // Slack
  slackPostMessageTool, slackLookupUserByEmailTool,
  // Microsoft Teams
  teamsChannelMessageTool, teamsChatMessageTool,
  // Notion
  notionSearchTool, notionPageCreateTool,
  // Zendesk
  zendeskTicketCreateTool, zendeskTicketCommentTool, zendeskTicketUpdateTool,
  // Intercom
  intercomConversationReplyTool, intercomContactUpsertTool,
  // HubSpot
  hubspotContactUpsertTool, hubspotTicketCreateTool,
  // Salesforce
  salesforceCaseCreateTool, salesforceContactFindTool, salesforceCaseCommentTool,
  // Calendly
  calendlyEventListTool,
  // Klaviyo
  klaviyoProfileUpsertTool, klaviyoEventTrackTool, klaviyoSubscribeTool,
  // Segment
  segmentIdentifyTool, segmentTrackTool,
  // QuickBooks
  quickbooksCustomerUpsertTool, quickbooksCreditMemoTool,
  // DocuSign
  docusignEnvelopeCreateTool, docusignEnvelopeVoidTool,
  // Sentry
  sentryIssueResolveTool, sentryIssueCommentTool, sentryIssueSearchTool,
  // Plaid
  plaidLinkTokenCreateTool, plaidExchangeTokenTool, plaidAccountsGetTool,
  // GitLab
  gitlabIssueCreateTool, gitlabIssueSearchTool, gitlabIssueNoteTool,
  // Discord
  discordSendMessageTool, discordSendDmTool,
];
