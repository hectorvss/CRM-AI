/**
 * tests/chat-agent/run-situational-tools-smoke.ts
 *
 * Phase-5 checks:
 *   - the 5 new read tools are registered, all read/none, and land in the
 *     support_readonly surface (contract for the Fin agent) with zero writes.
 *   - listSlaAtRisk runs and is tenant-scoped.
 *   - loadOpenEntity is robust (null for an unknown case, no throw).
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Run:
 *   npx tsx tests/chat-agent/run-situational-tools-smoke.ts
 */
import assert from 'node:assert/strict';
import { registerAllTools } from '../../server/agents/planEngine/tools/index.js';
import { toolRegistry } from '../../server/agents/planEngine/registry.js';
import { selectToolkit } from '../../server/agents/chatAgent/toolkit.js';
import { listSlaAtRisk } from '../../server/data/slaPolicies.js';
import { loadOpenEntity } from '../../server/agents/chatAgent/situation.js';

toolRegistry._resetForTests();
registerAllTools();

const NEW_TOOLS = ['notification.list', 'mention.list', 'audit.recent', 'inbox.counts', 'sla.at_risk'];
const scope = { tenantId: 'org_default', workspaceId: 'ws_default' };

(async () => {
  // ── 1. Registered, read-only ──────────────────────────────────────────────
  for (const name of NEW_TOOLS) {
    const t = toolRegistry.get(name);
    assert.ok(t, `${name} registered`);
    assert.equal(t!.sideEffect, 'read', `${name} is read`);
    assert.equal(t!.risk, 'none', `${name} is risk:none`);
  }
  console.log(`✅ ${NEW_TOOLS.length} situational tools registered, all read/none`);

  // ── 2. In support_readonly, no writes leaked ──────────────────────────────
  const support = selectToolkit({ hasPermission: () => true, surface: 'support_readonly', maxRisk: 'critical' });
  const names = new Set(support.map((t) => t.name));
  for (const name of NEW_TOOLS) assert.ok(names.has(name), `${name} in support_readonly`);
  assert.deepEqual(support.filter((t) => t.sideEffect !== 'read').map((t) => t.name), [], 'support_readonly still has zero writes');
  console.log(`✅ new tools in support_readonly (${support.length} read tools, 0 writes)`);

  // Operator with only inbox.read sees inbox.counts but not audit.recent (audit.read).
  const limited = selectToolkit({ hasPermission: (p) => p === 'inbox.read', surface: 'operator', maxRisk: 'critical' });
  const limitedNames = new Set(limited.map((t) => t.name));
  assert.ok(limitedNames.has('inbox.counts'), 'inbox.read grants inbox.counts');
  assert.ok(!limitedNames.has('audit.recent'), 'audit.recent gated behind audit.read');
  console.log('✅ permission gating correct (inbox.counts vs audit.recent)');

  // ── 3. listSlaAtRisk runs, tenant-scoped ──────────────────────────────────
  const sla = await listSlaAtRisk(scope, 60, 10);
  assert.ok(Array.isArray(sla), 'listSlaAtRisk returns an array');
  const foreign = await listSlaAtRisk({ tenantId: 'org_nonexistent_xyz', workspaceId: 'ws_default' }, 60, 10);
  assert.equal(foreign.length, 0, 'unknown tenant → empty');
  console.log(`✅ listSlaAtRisk: ${sla.length} at risk (tenant-scoped)`);

  // ── 4. loadOpenEntity robust ──────────────────────────────────────────────
  const none = await loadOpenEntity(scope, { caseId: '00000000-0000-0000-0000-000000000000' });
  assert.equal(none, null, 'unknown case → null (no throw)');
  console.log('✅ loadOpenEntity robust for unknown entity');

  console.log('\nSituational tools + accessors (F5) hold.');
  process.exit(0);
})().catch((err) => { console.error('❌', err); process.exit(1); });
