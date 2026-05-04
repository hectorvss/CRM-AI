/**
 * tests/integration/ai-agent-tools-e2e.test.ts
 *
 * Verify that:
 *   1. The planEngine tool registry contains the per-integration tools we
 *      registered (linear.issue.create, jira.issue.create, github.issue.create,
 *      front.conversation.reply, klaviyo.profile.upsert, etc.).
 *   2. invokeTool() dispatches correctly when called directly — short-circuits
 *      to INTEGRATION_NOT_CONNECTED for tenants without that connector.
 *   3. The LLM-driven plan path can describe (catalog.list) the tools so the
 *      LLM has the right surface to plan against.
 *
 * What we don't do here: ask an LLM to actually pick a tool, because that
 * requires Gemini quota AND a believable case to plan against, both heavier
 * than a pure unit verification.
 */

import assert from 'node:assert/strict';
import { planEngine } from '../../server/agents/planEngine/index.js';
import { invokeTool } from '../../server/agents/planEngine/invokeTool.js';

planEngine.init();

const EXPECTED_TOOLS = [
  // Engineering
  'linear.issue.create', 'jira.issue.create', 'github.issue.create',
  'gitlab.issue.create', 'asana.task.create',
  // Support
  'front.conversation.reply', 'intercom.conversation.reply',
  'zendesk.ticket.create',
  // CRM
  'hubspot.contact.upsert', 'salesforce.case.create', 'pipedrive.deal.create',
  // Voice / Meetings
  'aircall.call.comment', 'zoom.meeting.create', 'gcal.event.create',
  // Knowledge
  'confluence.search', 'gdrive.file.search', 'notion.search',
  // Marketing
  'klaviyo.profile.upsert', 'klaviyo.event.track', 'mailchimp.member.upsert',
  'segment.identify', 'segment.track',
  // Sales / contracts
  'docusign.envelope.create',
  // Engineering errors
  'sentry.issue.resolve', 'sentry.issue.search',
  // Banking
  'plaid.link_token.create', 'plaid.public_token.exchange',
  // Team chat
  'slack.message.post', 'teams.channel.send_message',
  // Calendly
  'calendly.event.list',
  // QuickBooks
  'quickbooks.customer.upsert', 'quickbooks.credit_memo.create',
  // Discord
  'discord.message.send',
];

(async () => {
  console.log(`\n▶ planEngine tool registry verification\n`);

  const catalog = planEngine.catalog.list();
  const names = new Set(catalog.map(t => t.name));
  console.log(`  Total tools registered: ${catalog.length}`);

  const missing = EXPECTED_TOOLS.filter(t => !names.has(t));
  console.log(`  Expected per-integration tools: ${EXPECTED_TOOLS.length}`);
  console.log(`  Missing: ${missing.length}`);
  if (missing.length > 0) console.log(`    ${missing.join(', ')}`);

  // Spot-check a few schemas
  const linear = catalog.find(t => t.name === 'linear.issue.create');
  assert(linear, 'linear.issue.create must exist');
  assert.equal(linear?.category, 'integration');
  assert.equal(linear?.sideEffect, 'external');
  console.log(`  ✓ linear.issue.create category=${linear?.category} sideEffect=${linear?.sideEffect} risk=${linear?.risk}`);

  const segment = catalog.find(t => t.name === 'segment.track');
  assert(segment, 'segment.track must exist');
  console.log(`  ✓ segment.track args.required: ${'event' in (segment.args as any).fields}`);

  // ── invokeTool() dispatch — short-circuit on missing connector ──────────
  console.log(`\n▶ invokeTool() dispatch — graceful "not connected"\n`);

  const r1 = await invokeTool({
    toolName: 'linear.issue.create',
    args: { teamId: 'test_team', title: 'smoke title' },
    tenantId: 'tenant_1',
    workspaceId: 'ws_default',
    userId: 'u_smoke',
    hasPermission: () => true,
  });
  console.log(`  linear.issue.create → ok=${r1.ok} errorCode=${(r1 as any).errorCode}`);
  assert.equal(r1.ok, false);
  // Dispatcher bubbles up the tool-level errorCode. Linear adapter returns
  // INTEGRATION_NOT_CONNECTED when there's no connector for this tenant.
  assert.equal((r1 as any).errorCode, 'INTEGRATION_NOT_CONNECTED');

  const r2 = await invokeTool({
    toolName: 'this.tool.does.not.exist',
    args: {},
    tenantId: 'tenant_1',
    workspaceId: 'ws_default',
    userId: 'u_smoke',
    hasPermission: () => true,
  });
  console.log(`  this.tool.does.not.exist → ok=${r2.ok} errorCode=${(r2 as any).errorCode}`);
  assert.equal(r2.ok, false);
  assert.equal((r2 as any).errorCode, 'TOOL_NOT_FOUND');

  const r3 = await invokeTool({
    toolName: 'linear.issue.create',
    args: { /* invalid: no teamId/title */ },
    tenantId: 'tenant_1',
    workspaceId: 'ws_default',
    userId: 'u_smoke',
    hasPermission: () => true,
  });
  console.log(`  linear.issue.create with bad args → ok=${r3.ok} errorCode=${(r3 as any).errorCode}`);
  assert.equal(r3.ok, false);
  assert.equal((r3 as any).errorCode, 'INVALID_ARGS');

  // ── Permission gate ──────────────────────────────────────────────────────
  const r4 = await invokeTool({
    toolName: 'linear.issue.create',
    args: { teamId: 't', title: 'x' },
    tenantId: 'tenant_1', workspaceId: 'ws_default', userId: 'u',
    hasPermission: () => false,
  });
  console.log(`  permission gate → ok=${r4.ok} errorCode=${(r4 as any).errorCode}`);
  assert.equal(r4.ok, false);
  assert.equal((r4 as any).errorCode, 'PERMISSION_DENIED');

  // ── dry-run safety ───────────────────────────────────────────────────────
  const r5 = await invokeTool({
    toolName: 'linear.issue.create',
    args: { teamId: 't', title: 'x' },
    tenantId: 'tenant_1', workspaceId: 'ws_default', userId: 'u',
    hasPermission: () => true,
    dryRun: true,
  });
  console.log(`  dry-run external write → ok=${r5.ok} simulated=${(r5 as any).value?.simulated}`);
  assert.equal(r5.ok, true);
  assert.equal((r5 as any).value?.simulated, true);

  console.log(`\n${'─'.repeat(60)}`);
  if (missing.length === 0) {
    console.log(`AI tools verification: PASS`);
  } else {
    console.log(`AI tools verification: PARTIAL — ${EXPECTED_TOOLS.length - missing.length}/${EXPECTED_TOOLS.length}`);
  }
  console.log(`${'─'.repeat(60)}\n`);
  process.exit(missing.length === 0 ? 0 : 1);
})().catch(err => { console.error('Crashed:', err); process.exit(2); });
