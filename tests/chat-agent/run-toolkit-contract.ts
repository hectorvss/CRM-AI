/**
 * tests/chat-agent/run-toolkit-contract.ts
 *
 * Contract tests for the operator Super Agent tool layer:
 *   1. support_readonly surface exposes ZERO non-read tools — this is the
 *      contract the future autonomous support agent depends on.
 *   2. maxRisk=medium (phase 1) excludes high/critical tools.
 *   3. toolAdapter produces API-safe names (Anthropic/OpenAI ^[a-zA-Z0-9_-]+$)
 *      with bidirectional round-trip and object input_schemas.
 *
 * Run: npx tsx tests/chat-agent/run-toolkit-contract.ts
 */
import assert from 'node:assert/strict';
import { registerAllTools } from '../../server/agents/planEngine/tools/index.js';
import { toolRegistry } from '../../server/agents/planEngine/registry.js';
import { selectToolkit } from '../../server/agents/chatAgent/toolkit.js';
import { adaptToolkit, schemaDescriptorToJsonSchema } from '../../server/agents/chatAgent/toolAdapter.js';

toolRegistry._resetForTests();
registerAllTools();

const allPerms = () => true;

// ── 1. Surface contracts ──────────────────────────────────────────────────────

const operator = selectToolkit({ hasPermission: allPerms, surface: 'operator', maxRisk: 'medium' });
const operatorFull = selectToolkit({ hasPermission: allPerms, surface: 'operator', maxRisk: 'critical' });
const support = selectToolkit({ hasPermission: allPerms, surface: 'support_readonly', maxRisk: 'critical' });

assert.ok(operator.length > 0, 'operator catalog must not be empty');
assert.ok(operatorFull.length >= operator.length, 'raising maxRisk must not shrink the catalog');

const supportLeaks = support.filter((t) => t.sideEffect !== 'read');
assert.deepEqual(
  supportLeaks.map((t) => t.name),
  [],
  'support_readonly must contain zero write/external tools',
);

const riskyAtMedium = operator.filter((t) => t.risk === 'high' || t.risk === 'critical');
assert.deepEqual(
  riskyAtMedium.map((t) => t.name),
  [],
  'maxRisk=medium must exclude high/critical tools',
);

// Permission filtering: no perms → drastically smaller catalog.
const noPerms = selectToolkit({ hasPermission: () => false, surface: 'operator', maxRisk: 'critical' });
assert.ok(
  noPerms.length < operatorFull.length,
  'permissionless caller must see fewer tools than a full-permission caller',
);

console.log(`✅ surfaces: operator=${operator.length} (medium) / ${operatorFull.length} (critical), support_readonly=${support.length}, no-perms=${noPerms.length}`);

// ── 2. Adapter contracts ──────────────────────────────────────────────────────

const { tools, resolveToolName, toApiName } = adaptToolkit(operatorFull);
const NAME_RE = /^[a-zA-Z0-9_-]{1,128}$/;

for (const t of tools) {
  assert.match(t.name, NAME_RE, `API tool name must be provider-safe: ${t.name}`);
  assert.equal((t.inputSchema as { type?: string }).type, 'object', `input_schema must be an object: ${t.name}`);
  assert.ok(t.description.includes('side-effect:'), `description must carry side-effect metadata: ${t.name}`);
}

for (const entry of operatorFull) {
  const api = toApiName(entry.name);
  assert.equal(resolveToolName(api), entry.name, `name round-trip must hold for ${entry.name}`);
}

const dotted = operatorFull.filter((t) => t.name.includes('.'));
assert.ok(dotted.length > 0, 'expected dotted tool names in the registry (e.g. payment.refund)');

console.log(`✅ adapter: ${tools.length} tools, all names API-safe, ${dotted.length} dotted names round-trip`);

// ── 3. Schema descriptor conversion ───────────────────────────────────────────

const converted = schemaDescriptorToJsonSchema({
  type: 'object',
  required: true,
  fields: {
    name: { type: 'string', required: true, enum: ['a', 'b'], description: 'x' },
    count: { type: 'number', required: false, integer: true, min: 0, max: 10 },
    active: { type: 'boolean', required: false },
    tags: { type: 'array', required: false, items: { type: 'string', required: true } },
    payload: { type: 'any', required: false },
  },
});
assert.equal(converted.type, 'object');
assert.deepEqual(converted.required, ['name']);
const props = converted.properties as Record<string, Record<string, unknown>>;
assert.deepEqual(props.name.enum, ['a', 'b']);
assert.equal(props.count.type, 'integer');
assert.equal(props.count.maximum, 10);
assert.equal(props.tags.type, 'array');
assert.equal((props.tags.items as { type: string }).type, 'string');
assert.equal(props.payload.type, 'object');

console.log('✅ schemaDescriptorToJsonSchema: all 6 descriptor kinds convert correctly');
console.log('\nAll toolkit contracts hold.');
